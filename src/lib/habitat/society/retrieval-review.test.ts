import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ResidentId } from '../residents';
import { recordAct, recordFixture, type RecordFixture } from './records-test-fixture';
import { applyRetrievalCapabilityChoice, prepareRetrievalTurn, retrievalCapabilityChoiceJsonSchema } from './retrieval-choice';
import { prepareSocietyTurn, applySocietyTurn } from './turn';
import { canReadRecord } from './records';
import { parseSocietyState } from './schema';
import { societyPublicView } from './public';
import type { PreparedTurn } from './types';

const prepare = (f: RecordFixture, actor: ResidentId = 'B') => prepareRetrievalTurn(f.state, f.world,
  prepareSocietyTurn(f.state, f.world, actor, { nowMs: f.now,
    sequence: f.state.minds[actor].lastAppliedSequence + 1, generation: 0 }));
const context = (turn: PreparedTurn) => JSON.parse(turn.prompt.slice(turn.prompt.lastIndexOf('\n{') + 1));
function catalogue(turn: PreparedTurn) {
  const result = turn.recordRetrieval!.catalogue;
  if (!result.ok) throw new Error(result.code);
  return result.page;
}
function commit(f: RecordFixture, raw: unknown, turn = prepare(f)): RecordFixture {
  const result = applyRetrievalCapabilityChoice(f.state, f.world, turn, raw, { nowMs: f.now + 1, generation: 0 });
  expect(result.ok, result.code).toBe(true);
  return { state: result.state, world: result.world, now: f.now + 100 };
}
function write(f: RecordFixture, title: string, audience: 'private' | 'public' = 'public'): RecordFixture {
  return recordAct(f, 'A', { kind: 'draft', title, text: `Exact authored account of ${title}.`, refs: [],
    parent: null, audience, publish: false });
}
function collection(count = 8): RecordFixture {
  let f = recordFixture();
  for (let n = 0; n < count; n++) f = write(f, `Water note ${n}`);
  return f;
}
function privatePurpose(f: RecordFixture, actor: ResidentId): RecordFixture {
  const turn = prepareSocietyTurn(f.state, f.world, actor, { nowMs: f.now,
    sequence: f.state.minds[actor].lastAppliedSequence + 1, generation: 0 });
  const result = applySocietyTurn(f.state, f.world, turn, { project: { mode: 'replace', goal: 'Review earlier notes.',
    why: 'I want to consider my available records.', visibility: 'private', steps: [] } }, { nowMs: f.now + 1, generation: 0 });
  expect(result.ok, result.code).toBe(true);
  return { state: result.state, world: result.world, now: f.now + 100 };
}
function rejectUnchanged(f: RecordFixture, turn: PreparedTurn, raw: unknown, code: string) {
  const bytes = JSON.stringify(f.state), world = structuredClone(f.world);
  const result = applyRetrievalCapabilityChoice(f.state, f.world, turn, raw, { nowMs: f.now + 1, generation: 0 });
  expect(result).toEqual({ ok: false, code, state: f.state, world: f.world });
  expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
  expect(JSON.stringify(f.state)).toBe(bytes); expect(f.world).toEqual(world);
}

beforeEach(() => vi.stubGlobal('fetch', () => { throw new Error('Offline P7 review forbids all HTTP'); }));
afterEach(() => vi.unstubAllGlobals());

describe('independent P7 retrieval boundary review', () => {
  it('traverses all three pages through actual P7 next operations, survives the codec and refreshes explicitly', () => {
    let f = collection(), turn = prepare(f);
    const original = structuredClone(f), seen: string[] = [];
    for (;;) {
      const page = catalogue(turn); seen.push(...page.entries.map(d => d.draftId));
      expect(page.entries.length).toBeLessThanOrEqual(3);
      if (page.nextCursor === null) break;
      f = commit(f, { lookup: { kind: 'next', cursor: page.nextCursor } }, turn);
      const decoded = parseSocietyState(JSON.parse(JSON.stringify(f.state)));
      expect(decoded.ok).toBe(true); if (!decoded.ok) throw new Error(decoded.code);
      f.state = decoded.state; turn = prepare(f);
    }
    expect(seen).toEqual([...original.state.records.drafts].reverse().map(d => d.id));
    expect(new Set(seen).size).toBe(8);
    expect(f.state.retrieval.B.pending).toBe(true);
    const exhausted = z.fromJSONSchema(retrievalCapabilityChoiceJsonSchema(f.state, f.world, turn));
    expect(exhausted.safeParse({ lookup: { kind: 'next', cursor: original.state.records.drafts[0]!.id } }).success).toBe(false);
    f = commit(f, { lookup: { kind: 'refresh' } }, turn);
    expect(catalogue(prepare(f)).offset).toBe(0);
    expect(f.state.records).toEqual(original.state.records);
    expect(f.state.conversations).toEqual(original.state.conversations);
    expect(f.world).toEqual(original.world);
  });

  it('rejects next and read from an outdated prepared page and only restarts after a P7 refresh', () => {
    let f = collection(5);
    f = commit(f, { lookup: { kind: 'next', cursor: catalogue(prepare(f)).nextCursor! } });
    const turn = prepare(f), page = catalogue(turn);
    f = write(f, 'Water inserted while the reader was thinking');
    rejectUnchanged(f, turn, { lookup: { kind: 'read', draftId: page.entries[0]!.draftId } }, 'refresh_required');
    const stale = prepare(f);
    expect(stale.recordRetrieval!.catalogue).toEqual({ ok: false, code: 'refresh_required' });
    expect(context(stale).retrieval.catalogue).toEqual({ error: 'refresh_required', query: '' });
    const schema = z.fromJSONSchema(retrievalCapabilityChoiceJsonSchema(f.state, f.world, stale));
    expect(schema.safeParse({ lookup: { kind: 'read', draftId: page.entries[0]!.draftId } }).success).toBe(false);
    f = commit(f, { lookup: { kind: 'refresh' } }, stale);
    const refreshed = catalogue(prepare(f));
    expect(refreshed.offset).toBe(0); expect(refreshed.total).toBe(6);
    expect(refreshed.entries[0]!.draftId).toBe(f.state.records.drafts.at(-1)!.id);

    const first = prepare(f), next = catalogue(first).nextCursor!;
    f = write(f, 'Water inserted again');
    rejectUnchanged(f, first, { lookup: { kind: 'next', cursor: next } }, 'refresh_required');
  });

  it('does not let hidden insertions invalidate a reader cursor; a real access grant requires refresh and exposes only authorized metadata', () => {
    let f = write(recordFixture(), 'Private water origin', 'private');
    const hidden = f.state.records.drafts[0]!;
    for (let n = 0; n < 4; n++) f = write(f, `Water shared ${n}`);
    const turn = prepare(f), page = catalogue(turn);
    expect(JSON.stringify(page)).not.toContain(hidden.id);
    f = write(f, 'Private water inserted', 'private');
    f = commit(f, { lookup: { kind: 'next', cursor: page.nextCursor! } }, turn);
    const beforeGrant = prepare(f);
    expect(catalogue(beforeGrant).total).toBe(4);
    f = recordAct(f, 'A', { kind: 'share', draftId: hidden.id, contentHash: hidden.contentHash, audience: 'B' });
    expect(canReadRecord(f.state.records, hidden, 'B')).toBe(true);
    rejectUnchanged(f, beforeGrant, { lookup: { kind: 'read', draftId: catalogue(beforeGrant).entries[0]!.draftId } }, 'refresh_required');
    f = commit(f, { lookup: { kind: 'refresh' } });
    f = commit(f, { lookup: { kind: 'next', cursor: catalogue(prepare(f)).nextCursor! } });
    const granted = prepare(f);
    expect(catalogue(granted).entries.map(d => d.draftId)).toContain(hidden.id);
    expect(catalogue(prepare(f, 'C')).total).toBe(4);
    expect(JSON.stringify(societyPublicView(f.state))).not.toContain(hidden.title);
  });

  it('revalidates current permission and actual body integrity before binding a prepared selection', () => {
    let f = write(recordFixture(), 'Access-controlled water', 'private');
    const source = f.state.records.drafts[0]!;
    f = recordAct(f, 'A', { kind: 'share', draftId: source.id, contentHash: source.contentHash, audience: 'B' });
    const turn = prepare(f);
    // Adversarial reader boundary, not a claim that a revocation operation exists.
    const withoutGrant = structuredClone(f); withoutGrant.state.records.shares = [];
    rejectUnchanged(withoutGrant, turn, { lookup: { kind: 'read', draftId: source.id } }, 'refresh_required');
    const corrupt = structuredClone(f); corrupt.state.records.drafts[0]!.text = 'Different body with an unchanged stored hash.';
    rejectUnchanged(corrupt, turn, { lookup: { kind: 'read', draftId: source.id } }, 'unavailable_record_draft');
    expect(f.state.retrieval.B.focus).toBeNull();
  });

  it('delivers a selected private revision without author permission, public references, or public disclosure', () => {
    let f = write(recordFixture(), 'Private observation', 'private'); const source = f.state.records.drafts[0]!;
    f = recordAct(f, 'A', { kind: 'share', draftId: source.id, contentHash: source.contentHash, audience: 'B' });
    const planTurn = prepareSocietyTurn(f.state, f.world, 'B', { nowMs: f.now,
      sequence: f.state.minds.B.lastAppliedSequence + 1, generation: 0 });
    const planned = applySocietyTurn(f.state, f.world, planTurn, { project: { mode: 'replace',
      goal: 'Review the received observation.', why: 'I want to consider it privately.', visibility: 'private', steps: [] } },
    { nowMs: f.now + 1, generation: 0 });
    expect(planned.ok, planned.code).toBe(true); f = { state: planned.state, world: planned.world, now: f.now + 100 };
    f = commit(f, { lookup: { kind: 'read', draftId: source.id } });
    const turn = prepare(f), payload = context(turn), schema = z.fromJSONSchema(retrievalCapabilityChoiceJsonSchema(f.state, f.world, turn));
    expect(payload.records.drafts[0]).toMatchObject({ id: source.id, contentHash: source.contentHash, text: source.text });
    expect(payload.records.referenceAccess.private).toContain(source.id);
    expect(payload.records.referenceAccess.public).not.toContain(source.id);
    const record = { kind: 'draft', title: 'Personal response', text: 'I have considered the supplied account.',
      refs: [source.id], parent: null, audience: 'private', publish: false };
    expect(schema.safeParse({ record }).success).toBe(true);
    expect(schema.safeParse({ record: { ...record, audience: 'public' } }).success).toBe(false);
    expect(schema.safeParse({ record: { kind: 'share', draftId: source.id, contentHash: source.contentHash, audience: 'C' } }).success).toBe(false);
    rejectUnchanged(f, turn, { record: { ...record, audience: 'public' } }, 'invalid_retrieval_choice');
    const publicBefore = societyPublicView(f.state), worldBefore = structuredClone(f.world);
    f = commit(f, { record }, turn);
    expect(f.state.retrieval.B.pending).toBe(false);
    expect(f.state.records.drafts.at(-1)!.refs).toEqual([{ id: source.id, audience: ['B'] }]);
    expect(canReadRecord(f.state.records, f.state.records.drafts.at(-1)!, 'C')).toBe(false);
    const publicAfter = societyPublicView(f.state);
    expect(publicAfter.records).toEqual(publicBefore.records);
    expect(publicAfter.conversations).toEqual(publicBefore.conversations);
    for (const privateValue of [source.id, source.contentHash, source.title, source.text, record.title, record.text])
      expect(JSON.stringify(publicAfter)).not.toContain(privateValue);
    expect(f.world).toEqual(worldBefore);
  });

  it('does not wash appraisal, consent, spoofed page data or unknown keys through the private alternative', () => {
    const f = collection(4), turn = prepare(f), lookup = { kind: 'read', draftId: catalogue(turn).entries[0]!.draftId };
    for (const extra of [{ appraisal: { axis: 'trust', delta: 1, ref: 'turn:999', why: 'No supplied speech.' } },
      { deal: { kind: 'accept', offerId: 'offer:999' } }, { retrieval: context(turn).retrieval },
      { unexpected: null }, { lookup: { ...lookup, actor: 'A' } }]) {
      rejectUnchanged(f, turn, { lookup, ...extra }, 'invalid_retrieval_choice');
    }
  });

  it('rejects missing or malformed trusted bindings instead of accepting page data from the model', () => {
    const f = collection(4), turn = prepare(f), source = catalogue(turn).entries[0]!;
    for (const recordRetrieval of [undefined, { ...turn.recordRetrieval, version: 9 },
      { ...turn.recordRetrieval, catalogue: { ok: true } }]) {
      const changed = { ...turn, recordRetrieval } as PreparedTurn;
      rejectUnchanged(f, changed, { lookup: { kind: 'read', draftId: source.draftId } }, 'invalid_retrieval_choice');
    }
    const changed = structuredClone(turn), result = changed.recordRetrieval!.catalogue;
    if (!result.ok) throw new Error(result.code);
    result.page.entries[0]!.contentHash = 'f'.repeat(64);
    rejectUnchanged(f, changed, { lookup: { kind: 'read', draftId: source.draftId } }, 'invalid_catalogue_page');
  });

  it('retains failed or expired pending delivery but removes inaccessible focused content from a new preparation', () => {
    let f = write(recordFixture(), 'Previously shared source', 'private'); const source = f.state.records.drafts[0]!;
    f = recordAct(f, 'A', { kind: 'share', draftId: source.id, contentHash: source.contentHash, audience: 'B' });
    f = commit(f, { lookup: { kind: 'read', draftId: source.id } });
    const turn = prepare(f), pending = structuredClone(f.state.retrieval.B);
    rejectUnchanged(f, turn, { lookup: { kind: 'read', draftId: 'record:draft:99999' } }, 'invalid_retrieval_choice');
    const expired = applyRetrievalCapabilityChoice(f.state, f.world, turn, { lookup: { kind: 'clear' } },
      { nowMs: turn.expiresAtMs, generation: 0 });
    expect(expired.ok).toBe(false); expect(expired.code).toBe('expired_job');
    expect(f.state.retrieval.B).toEqual(pending);
    // Access-change boundary only: the current protocol provides no revocation action.
    f.state.records.shares = [];
    const fresh = prepare(f), payload = context(fresh);
    expect(payload.retrieval.focus).toEqual({ draftId: source.id, status: 'unavailable' });
    expect(payload.records.drafts).toEqual([]); expect(fresh.evidenceIds).not.toContain(source.id);
    expect(payload.records.referenceAccess.private).not.toContain(source.id);
    expect(payload.records.referenceAccess.public).not.toContain(source.id);
    expect(JSON.stringify(payload)).not.toContain(source.title); expect(JSON.stringify(payload)).not.toContain(source.text);
    const schema = z.fromJSONSchema(retrievalCapabilityChoiceJsonSchema(f.state, f.world, fresh));
    expect(schema.safeParse({ record: { kind: 'share', draftId: source.id, contentHash: source.contentHash, audience: 'C' } }).success).toBe(false);
    expect(f.state.retrieval.B).toEqual(pending); // Preparation alone does not consume the request.
  });

  it('clears focus and query without another pending delivery or any conversational/document effect', () => {
    let f = collection(5);
    f = commit(f, { lookup: { kind: 'search', query: 'water note 0' } });
    f = commit(f, { lookup: { kind: 'read', draftId: catalogue(prepare(f)).entries[0]!.draftId } });
    const sourceId = f.state.retrieval.B.focus!.draftId, before = structuredClone(f);
    expect(context(prepare(f)).records.drafts.map((d: { id: string }) => d.id)).toContain(sourceId);
    const turn = prepare(f);
    f = commit(f, { lookup: { kind: 'clear' } }, turn);
    expect(f.state.retrieval.B).toMatchObject({ query: '', cursor: null, focus: null, pending: false,
      revision: before.state.retrieval.B.revision + 1, lastSequence: turn.sequence });
    expect(context(prepare(f)).records.drafts.map((d: { id: string }) => d.id)).not.toContain(sourceId);
    expect(f.state.records).toEqual(before.state.records); expect(f.state.conversations).toEqual(before.state.conversations);
    expect(f.state.minds.B.project).toEqual(before.state.minds.B.project); expect(f.world).toEqual(before.world);
    const decoded = parseSocietyState(JSON.parse(JSON.stringify(f.state)));
    expect(decoded.ok).toBe(true);
    const duplicate = applyRetrievalCapabilityChoice(f.state, f.world, turn, { lookup: { kind: 'clear' } },
      { nowMs: f.now, generation: 0 });
    expect(duplicate).toEqual({ ok: true, code: 'already_applied', state: f.state, world: f.world });
  });

  it('rejects a formerly valid normal commission when focus permission disappears before application', () => {
    let f = write(recordFixture(), 'Author-controlled report', 'private'); const source = f.state.records.drafts[0]!;
    f = recordAct(f, 'A', { kind: 'share', draftId: source.id, contentHash: source.contentHash, audience: 'B' });
    f = privatePurpose(f, 'B'); f = commit(f, { lookup: { kind: 'read', draftId: source.id } });
    const turn = prepare(f), raw = { record: { kind: 'commission', counterpart: 'A', draftId: source.id,
      contentHash: source.contentHash, cells: 1, dueInWatches: 4, audience: 'public', visibility: 'private' } };
    const valid = applyRetrievalCapabilityChoice(f.state, f.world, turn, raw, { nowMs: f.now + 1, generation: 0 });
    expect(valid.ok, valid.code).toBe(true); expect(valid.state.records.offers).toHaveLength(1);
    const pending = structuredClone(f.state.retrieval.B);
    f.state.records.shares = []; // Adversarial authorization boundary; no production revoke API is invented.
    rejectUnchanged(f, turn, raw, 'invalid_retrieval_choice');
    expect(f.state.retrieval.B).toEqual(pending);
    expect(f.state.records.offers).toEqual([]); expect(f.state.records.agreements).toEqual([]);
  });

  it('rejects an owned share after actual working-set eviction while retaining the pending exact focus', () => {
    let f = write(recordFixture(), 'Old private Alpha', 'private'); const source = f.state.records.drafts[0]!;
    f = write(f, 'Newer private Beta', 'private'); f = privatePurpose(f, 'A');
    f = commit(f, { lookup: { kind: 'search', query: 'Alpha' } }, prepare(f, 'A'));
    f = commit(f, { lookup: { kind: 'read', draftId: source.id } }, prepare(f, 'A'));
    const turn = prepare(f, 'A'), raw = { record: { kind: 'share', draftId: source.id,
      contentHash: source.contentHash, audience: 'B' } };
    const valid = applyRetrievalCapabilityChoice(f.state, f.world, turn, raw, { nowMs: f.now + 1, generation: 0 });
    expect(valid.ok, valid.code).toBe(true);
    const pending = structuredClone(f.state.retrieval.A);
    for (let n = 0; n < 255; n++) f = recordAct(f, 'C', { kind: 'draft', title: `Independent draft ${n}`,
      text: 'An independent retained account.', refs: [], parent: null, audience: 'private', publish: false });
    expect(f.state.records.drafts).toHaveLength(256);
    expect(f.state.records.drafts.some(d => d.id === source.id)).toBe(false);
    expect(f.state.records.archive.drafts).toBe(1);
    expect(f.now).toBeLessThan(turn.expiresAtMs);
    rejectUnchanged(f, turn, raw, 'invalid_retrieval_choice');
    expect(f.state.retrieval.A).toEqual(pending);
    expect(f.state.records.shares).toEqual([]);
  });
});
