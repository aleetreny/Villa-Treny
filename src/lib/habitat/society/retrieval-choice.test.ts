import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { recordAct, recordFixture, type RecordFixture } from './records-test-fixture';
import { prepareSocietyTurn, applySocietyTurn } from './turn';
import { applyRecordCapabilityChoice, prepareRecordTurn, recordCapabilityChoiceJsonSchema } from './record-choice';
import { applyRetrievalCapabilityChoice, prepareRetrievalTurn, retrievalCapabilityChoiceJsonSchema } from './retrieval-choice';
import { canReadRecord } from './records';
import { parseSocietyState } from './schema';
import { societyPublicView } from './public';
import type { ResidentId } from '../residents';
import type { PreparedTurn } from './types';

const body = (turn: PreparedTurn) => JSON.parse(turn.prompt.slice(turn.prompt.lastIndexOf('\n{') + 1));
const initial = (f: RecordFixture, actor: ResidentId = 'A') => prepareSocietyTurn(f.state, f.world, actor,
  { nowMs: f.now, sequence: f.state.minds[actor].lastAppliedSequence + 1, generation: 0 });
const prepare = (f: RecordFixture, actor: ResidentId = 'A') => prepareRetrievalTurn(f.state, f.world, initial(f, actor));
const apply = (f: RecordFixture, raw: unknown, actor: ResidentId = 'A', turn = prepare(f, actor)) => {
  const result = applyRetrievalCapabilityChoice(f.state, f.world, turn, raw, { nowMs: f.now + 1, generation: 0 });
  expect(result.ok, result.code).toBe(true);
  return { world: result.world, state: result.state, now: f.now + 100 };
};
const draft = (f: RecordFixture, title: string, actor: ResidentId = 'A') => recordAct(f, actor, {
  kind: 'draft', title, text: `Exact ${title} body.\nA resident's claim, not a measurement.`,
  refs: [], parent: null, audience: 'private', publish: false });
const oldDocumentFixture = () => {
  let f = draft(recordFixture(), 'Alpha valve log');
  for (const title of ['Beta', 'Gamma', 'Delta']) f = draft(f, title);
  const turn = initial(f);
  const planned = applySocietyTurn(f.state, f.world, turn, { project: { mode: 'replace',
    goal: 'Review the retained valve log.', why: 'I want to use my own earlier notes.', visibility: 'private',
    steps: [{ verb: 'inspect', at: 'workshops' }] } }, { nowMs: f.now + 1, generation: 0 });
  if (!planned.ok) throw new Error(planned.code);
  return { ...f, state: planned.state, world: planned.world, now: f.now + 100 };
};

describe('P7 explicit private retrieval', () => {
  it('discovers omitted Alpha, supplies its exact revision later and permits a separate explicit share', () => {
    let f = oldDocumentFixture();
    const alpha = f.state.records.drafts[0]!, before = structuredClone(f);
    expect(body(prepare(f)).records.drafts.map((d: { id: string }) => d.id)).not.toContain(alpha.id);
    expect(body(prepare(f)).retrieval.catalogue.entries.map((d: { draftId: string }) => d.draftId)).not.toContain(alpha.id);
    f = apply(f, { lookup: { kind: 'search', query: 'Alpha valve' } });
    expect(f.world).toEqual(before.world); expect(f.state.records).toEqual(before.state.records);
    expect(f.state.conversations).toEqual(before.state.conversations);
    expect(f.state.minds.B).toEqual(before.state.minds.B);
    let turn = prepare(f), projected = body(turn);
    expect(projected.retrieval.catalogue.entries).toEqual([expect.objectContaining({ draftId: alpha.id, title: alpha.title })]);
    expect(turn.evidenceIds).not.toContain(alpha.id);
    expect(projected.records.referenceAccess.private).not.toContain(alpha.id);
    expect(projected.records.drafts.some((d: { id: string }) => d.id === alpha.id)).toBe(false);
    expect(canReadRecord(f.state.records, alpha, 'B')).toBe(false);
    f = apply(f, { lookup: { kind: 'read', draftId: alpha.id } });
    const saved = JSON.stringify(f.state), decoded = parseSocietyState(JSON.parse(saved));
    expect(decoded.ok).toBe(true); if (!decoded.ok) throw new Error(decoded.code);
    expect(decoded.state).toEqual(JSON.parse(saved));
    f.state = decoded.state; // real codec round-trip before content delivery
    const decodedBytes = JSON.stringify(f.state);
    turn = prepare(f); projected = body(turn);
    expect(JSON.stringify(f.state)).toBe(decodedBytes); // preparing/denied admission does not consume focus
    expect(projected.records.drafts[0]).toMatchObject({ id: alpha.id, contentHash: alpha.contentHash, title: alpha.title, text: alpha.text });
    expect(projected.records.drafts.length).toBeLessThanOrEqual(3);
    expect(turn.evidenceIds).toContain(alpha.id); expect(projected.records.referenceAccess.private).toContain(alpha.id);
    expect(canReadRecord(f.state.records, alpha, 'B')).toBe(false);
    f = apply(f, { record: { kind: 'share', draftId: alpha.id, contentHash: alpha.contentHash, audience: 'B' } });
    expect(canReadRecord(f.state.records, alpha, 'B')).toBe(true);
    expect(f.state.retrieval.A.pending).toBe(false); expect(f.state.retrieval.A.focus).toEqual({ draftId: alpha.id, contentHash: alpha.contentHash });
    expect(f.state.records.publications).toEqual([]); expect(f.state.records.agreements).toEqual([]);
    expect(f.world.economy).toEqual(before.world.economy);
    expect(f.state.records.drafts[0]).toEqual(alpha);
  });

  it('never adds catalogue-only IDs to references, share grammar or another resident/public view', () => {
    let f = oldDocumentFixture(); const alpha = f.state.records.drafts[0]!;
    f = apply(f, { lookup: { kind: 'search', query: 'Alpha' } });
    const turn = prepare(f), schema = z.fromJSONSchema(retrievalCapabilityChoiceJsonSchema(f.state, f.world, turn));
    expect(schema.safeParse({ record: { kind: 'share', draftId: alpha.id, contentHash: alpha.contentHash, audience: 'B' } }).success).toBe(false);
    const other = JSON.stringify(body(prepare(f, 'B'))), publicText = JSON.stringify(societyPublicView(f.state));
    for (const value of [alpha.id, alpha.contentHash, alpha.title, alpha.text, 'snapshotHash', 'retrieval']) {
      expect(publicText).not.toContain(value);
      if (value !== 'retrieval' && value !== 'snapshotHash') expect(other).not.toContain(value);
    }
    expect(body(prepare(f, 'B')).retrieval.catalogue.total).toBe(0);
  });

  it('lets a waiting speaker consult privately without modifying any conversation, expired exchange, offer or project', () => {
    let f = oldDocumentFixture();
    const first = initial(f), spoken = applySocietyTurn(f.state, f.world, first,
      { message: { to: 'B', text: 'Please consider the valve log.' } }, { nowMs: f.now + 1, generation: 0 });
    expect(spoken.ok).toBe(true); f = { state: spoken.state, world: spoken.world, now: f.now + 100 };
    // Another expired exchange is not globally processed as a side effect of lookup.
    f.state.conversations.push({ id: `conversation:${f.state.nextId++}`, participants: ['C', 'D'], revision: 0,
      attentionThrough: [0, 0],
      nextSpeaker: 'C', status: 'open', createdAtMs: f.now - 100, expiresAtMs: f.now - 1, turns: [] });
    const before = structuredClone(f);
    const schema = z.fromJSONSchema(retrievalCapabilityChoiceJsonSchema(f.state, f.world, prepare(f)));
    expect(schema.safeParse({ lookup: { kind: 'search', query: 'valve' } }).success).toBe(true);
    f = apply(f, { lookup: { kind: 'search', query: 'valve' } });
    expect(f.state.conversations).toEqual(before.state.conversations);
    expect(f.state.offers).toEqual(before.state.offers); expect(f.state.agreements).toEqual(before.state.agreements);
    expect(f.state.minds.A.project).toEqual(before.state.minds.A.project); expect(f.world).toEqual(before.world);
  });

  it('rejects incoming speech during lookup without consuming its pending focus or conversation', () => {
    let f = oldDocumentFixture();
    f = apply(f, { lookup: { kind: 'search', query: 'Alpha' } });
    const turn = prepare(f), fromB = initial(f, 'B');
    const incoming = applySocietyTurn(f.state, f.world, fromB, { message: { to: 'A', text: 'A new question.' } },
      { nowMs: f.now + 1, generation: 0 });
    expect(incoming.ok).toBe(true);
    const rejected = applyRetrievalCapabilityChoice(incoming.state, incoming.world, turn,
      { lookup: { kind: 'read', draftId: f.state.records.drafts[0]!.id } }, { nowMs: f.now + 2, generation: 0 });
    expect(rejected).toEqual({ ok: false, code: 'stale_mind', state: incoming.state, world: incoming.world });
    expect(incoming.state.retrieval.A).toEqual(f.state.retrieval.A);
  });

  it('preserves pending state on invalid, stale-control and expired responses; duplicate application is a no-op', () => {
    const f = oldDocumentFixture(), turn = prepare(f), raw = { lookup: { kind: 'search', query: 'Alpha' } };
    for (const [candidate, control, code] of [
      [{ lookup: { kind: 'read', draftId: 'record:draft:999' } }, { nowMs: f.now + 1, generation: 0 }, 'invalid_retrieval_choice'],
      [raw, { nowMs: f.now + 1, generation: 1 }, 'stale_control'],
      [raw, { nowMs: turn.expiresAtMs, generation: 0 }, 'expired_job'],
    ] as const) expect(applyRetrievalCapabilityChoice(f.state, f.world, turn, candidate, control))
      .toEqual({ ok: false, code, state: f.state, world: f.world });
    const next = apply(f, raw, 'A', turn);
    expect(applyRetrievalCapabilityChoice(next.state, next.world, turn, raw, { nowMs: next.now, generation: 0 }))
      .toEqual({ ok: true, code: 'already_applied', state: next.state, world: next.world });
  });

  it('reports a lost focused revision without substituting content, references or sharing authority', () => {
    let f = oldDocumentFixture(); const alpha = f.state.records.drafts[0]!;
    f = apply(f, { lookup: { kind: 'search', query: 'Alpha' } });
    f = apply(f, { lookup: { kind: 'read', draftId: alpha.id } });
    f.state.records.drafts = f.state.records.drafts.filter(d => d.id !== alpha.id);
    const turn = prepare(f), projected = body(turn);
    expect(projected.retrieval.focus.status).toBe('unavailable');
    expect(turn.evidenceIds).not.toContain(alpha.id); expect(JSON.stringify(projected)).not.toContain(alpha.text);
    expect(f.state.retrieval.A.pending).toBe(true);
  });

  it('keeps P6 grammar and output acceptance separate from lookup and focus delivery', () => {
    let f = oldDocumentFixture();
    const old = prepareRecordTurn(f.state, f.world, initial(f));
    const saved = JSON.stringify(recordCapabilityChoiceJsonSchema(f.state, f.world, old));
    const lookup = { lookup: { kind: 'search', query: 'Alpha' } };
    expect(applyRecordCapabilityChoice(f.state, f.world, old, lookup, { nowMs: f.now + 1, generation: 0 }).ok).toBe(false);
    f = apply(f, lookup);
    expect(JSON.stringify(recordCapabilityChoiceJsonSchema(f.state, f.world, old))).toBe(saved);
    const oldNext = prepareRecordTurn(f.state, f.world, initial(f));
    const result = applyRecordCapabilityChoice(f.state, f.world, oldNext, { record: { kind: 'draft', title: 'Another',
      text: 'Still private.', refs: [], parent: null, audience: 'private', publish: false } }, { nowMs: f.now + 1, generation: 0 });
    expect(result.ok, result.code).toBe(true); expect(result.state.retrieval.A.pending).toBe(true);
  });

  it('does not permit lookup to be combined with speech, projects, documents or consent', () => {
    const f = oldDocumentFixture(), turn = prepare(f);
    for (const extra of [{ message: { to: 'B', text: 'Sent.' } }, { record: { kind: 'accept', offerId: 'record:offer:1' } },
      { project: { mode: 'abandon', why: 'No longer needed.' } }, { unexpected: 'private body' }]) {
      const result = applyRetrievalCapabilityChoice(f.state, f.world, turn,
        { lookup: { kind: 'search', query: 'Alpha' }, ...extra }, { nowMs: f.now + 1, generation: 0 });
      expect(result.ok).toBe(false); expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
    }
  });
});
