import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { genesisState, type WorldState } from '../engine/state';
import { applyProposalCapabilityChoice, proposalCapabilityChoiceJsonSchema } from './capabilities';
import { applyOrderedCapabilityChoice } from './ordered-choice';
import { createSocietyState } from './state';
import { applySocietyTurn, prepareSocietyTurn } from './turn';
import { parseTurnResponse } from './schema';
import { applyRecordOperation } from './records';
import { SOCIETY_RECORD_SYSTEM } from './record-instructions';
import { applyRecordCapabilityChoice, prepareRecordTurn, recordCapabilityChoiceJsonSchema } from './record-choice';
import { RECORD_LIMITS } from './record-types';
import type { ResidentId } from '../residents';
import type { SocietyState } from './types';

const project = { mode: 'replace', goal: 'Write a proposal about the common stores.', why: 'I want a text people can inspect.',
  visibility: 'private', steps: [] };
const control = (nowMs = 2001) => ({ nowMs, generation: 0 });
const prepare = (state: SocietyState, world: WorldState, actor: ResidentId = 'A', sequence = 1, nowMs = 2000) =>
  prepareRecordTurn(state, world, prepareSocietyTurn(state, world, actor, { nowMs, generation: 0, sequence }));
const fixture = () => {
  const world = genesisState(91), state = createSocietyState(world, 1000);
  return { world, state, turn: prepare(state, world) };
};
const draft = (world: WorldState, overrides: Record<string, unknown> = {}) => ({ kind: 'draft', title: 'Stores proposal',
  text: 'I propose comparing the next stores register together. This is a proposal, not an observation.',
  refs: [`world:${world.day}:${world.watch}`], parent: null, audience: 'private', publish: false, ...overrides });
const opening = (world: WorldState, overrides: Record<string, unknown> = {}) => ({ project,
  message: { to: 'B', text: 'Bex, would you review a proposal about the stores?' }, record: draft(world), ...overrides });
const body = (turn: { prompt: string }) => JSON.parse(turn.prompt.slice(turn.prompt.lastIndexOf('\n{') + 1));

describe('explicit records protocol6', () => {
  it('bounds new ASCII title and body maxima to a combined 600 bytes without truncating either field', () => {
    const f = fixture(), schema = z.fromJSONSchema(recordCapabilityChoiceJsonSchema(f.state, f.world, f.turn));
    expect(body(f.turn).records.draftTextMaxLength).toBe(504);
    const title = 't'.repeat(RECORD_LIMITS.titleBytes), text = 'x'.repeat(RECORD_LIMITS.contentBytes - RECORD_LIMITS.titleBytes);
    const raw = opening(f.world, { record: draft(f.world, { title, text }) });
    expect(new TextEncoder().encode(title + text)).toHaveLength(600);
    expect(schema.safeParse(raw).success).toBe(true);
    const result = applyRecordCapabilityChoice(f.state, f.world, f.turn, raw, control());
    expect(result.ok, result.code).toBe(true);
    expect(result.state.records.drafts[0]).toMatchObject({ author: 'A', title, text, audience: 'private' });
    expect(result.state.records.shares).toHaveLength(0); expect(result.state.records.publications).toHaveLength(0);
    expect(result.state.records.agreements).toHaveLength(0); expect(result.world).toEqual(f.world);
    expect(body(prepare(result.state, result.world, 'B', 2, 3000)).records.drafts).toEqual([]);
    const oversized = opening(f.world, { record: draft(f.world, { title: 't'.repeat(25), text: 'x'.repeat(600) }) });
    expect(schema.safeParse(oversized).success).toBe(false);
    expect(applyRecordCapabilityChoice(f.state, f.world, f.turn, oversized, control()))
      .toEqual({ ok: false, code: 'invalid_record_choice', state: f.state, world: f.world });
  });

  it('retains the saved P6 grammar and valid 25+575-byte draft when the new preparation marker is absent', () => {
    const f = fixture(), oldTurn = structuredClone(f.turn), oldContext = body(oldTurn);
    delete oldContext.records.draftTextMaxLength;
    oldTurn.prompt = `${oldTurn.prompt.slice(0, oldTurn.prompt.lastIndexOf('\n{') + 1)}${JSON.stringify(oldContext)}`;
    oldTurn.promptBytes = new TextEncoder().encode(oldTurn.prompt).length;
    const oldSchema = recordCapabilityChoiceJsonSchema(f.state, f.world, oldTurn);
    const saved = { turn: oldTurn, jsonSchema: oldSchema }, savedBytes = JSON.stringify(saved);
    const title = 't'.repeat(25), text = 'x'.repeat(575), raw = opening(f.world, { record: draft(f.world, { title, text }) });
    expect(z.fromJSONSchema(oldSchema).safeParse(raw).success).toBe(true);
    expect(z.fromJSONSchema(recordCapabilityChoiceJsonSchema(f.state, f.world, f.turn)).safeParse(raw).success).toBe(false);
    const result = applyRecordCapabilityChoice(f.state, f.world, saved.turn, raw, control());
    expect(result.ok, result.code).toBe(true);
    expect(result.state.records.drafts[0]).toMatchObject({ author: 'A', title, text, audience: 'private' });
    expect(JSON.stringify(saved)).toBe(savedBytes);
    const repeated = applyRecordCapabilityChoice(result.state, result.world, saved.turn, raw, control());
    expect(repeated.code).toBe('already_applied'); expect(repeated.state).toBe(result.state);
  });

  it.each([
    { title: 'é'.repeat(49), text: 'x', code: 'invalid_record_operation' },
    { title: 'x', text: 'é'.repeat(301), code: 'invalid_record_operation' },
    { title: 't'.repeat(96), text: 'é'.repeat(253), code: 'record_content_too_large' },
  ])('keeps UTF-8 byte validation authoritative for $code', ({ title, text, code }) => {
    const f = fixture(), raw = opening(f.world, { record: draft(f.world, { title, text }) });
    expect(z.fromJSONSchema(recordCapabilityChoiceJsonSchema(f.state, f.world, f.turn)).safeParse(raw).success).toBe(true);
    const result = applyRecordCapabilityChoice(f.state, f.world, f.turn, raw, control());
    expect(result).toEqual({ ok: false, code, state: f.state, world: f.world });
    expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
  });

  it.each([0, 503, 505, 600, '504', null])('rejects an unrecognised prepared draft limit %j instead of enlarging the grammar', (limit) => {
    const f = fixture(), prepared = structuredClone(f.turn), context = body(prepared);
    context.records.draftTextMaxLength = limit;
    prepared.prompt = `${prepared.prompt.slice(0, prepared.prompt.lastIndexOf('\n{') + 1)}${JSON.stringify(context)}`;
    prepared.promptBytes = new TextEncoder().encode(prepared.prompt).length;
    expect(() => recordCapabilityChoiceJsonSchema(f.state, f.world, prepared)).toThrow('Invalid prepared draft text limit');
    expect(applyRecordCapabilityChoice(f.state, f.world, prepared, opening(f.world), control()))
      .toEqual({ ok: false, code: 'invalid_record_choice', state: f.state, world: f.world });
  });

  it('requires private drafts to stay unscheduled while allowing explicit resident or public publication', () => {
    const f = fixture(), schema = z.fromJSONSchema(recordCapabilityChoiceJsonSchema(f.state, f.world, f.turn));
    for (const audience of ['private', 'A', 'B', 'public']) for (const publish of [false, true]) {
      const raw = opening(f.world, { record: draft(f.world, { audience, publish }) });
      const allowed = audience !== 'private' || !publish;
      expect(schema.safeParse(raw).success, `${audience}/${publish}`).toBe(allowed);
      const applied = applyRecordCapabilityChoice(f.state, f.world, f.turn, raw, control());
      expect(applied.ok, applied.code).toBe(allowed);
      if (!allowed) {
        expect(applied.code).toBe('invalid_record_choice');
        expect(applied.state).toBe(f.state); expect(applied.world).toBe(f.world);
        expect(applied.state.records.drafts).toHaveLength(0);
      } else expect(applied.state.records.intents).toHaveLength(publish ? 1 : 0);
    }
    expect(SOCIETY_RECORD_SYSTEM).toContain('audience:private keeps an unscheduled draft and requires publish:false');
    expect(SOCIETY_RECORD_SYSTEM).toContain('a named recipient does not make the text public');
    expect(SOCIETY_RECORD_SYSTEM).toContain('A message saying sent, attached or read is a claim, not document access.');
    expect(SOCIETY_RECORD_SYSTEM).toContain('ask its author to share the exact revision before claiming to review it');
  });

  it('does not offer a second publication slot and keeps commission visibility independent of audience', () => {
    const f = fixture(), made = applyRecordCapabilityChoice(f.state, f.world, f.turn,
      opening(f.world, { record: draft(f.world, { audience: 'public', publish: true }) }), control());
    expect(made.ok).toBe(true);
    const authorTurn = prepare(made.state, made.world, 'A', 2, 3000);
    const authorSchema = z.fromJSONSchema(recordCapabilityChoiceJsonSchema(made.state, made.world, authorTurn));
    const d = made.state.records.drafts[0]!;
    expect(authorSchema.safeParse({ record: draft(made.world, { audience: 'B', publish: true }) }).success).toBe(false);
    expect(authorSchema.safeParse({ record: draft(made.world, { audience: 'B', publish: false }) }).success).toBe(true);
    expect(authorSchema.safeParse({ record: { kind: 'schedule', draftId: d.id, contentHash: d.contentHash, audience: 'B' } }).success).toBe(false);
    const reply = prepare(made.state, made.world, 'B', 3, 4000);
    const replySchema = z.fromJSONSchema(recordCapabilityChoiceJsonSchema(made.state, made.world, reply));
    for (const audience of ['A', 'B', 'public']) for (const visibility of ['private', 'public']) {
      const raw = { project, message: { to: 'A', text: 'May I commission this exact text?' }, record: {
        kind: 'commission', draftId: d.id, contentHash: d.contentHash, counterpart: 'A',
        cells: 0, dueInWatches: 2, audience, visibility } };
      expect(replySchema.safeParse(raw).success, `${audience}/${visibility}`).toBe(true);
      // The audience is grammatically legal. A different pre-existing pending
      // slot remains a domain refusal at acceptance, not another party's oracle.
    }
  });

  it('pairs private references with private or author-only audiences in the generated grammar', () => {
    const f = fixture();
    f.state.minds.A.memories.push({ id: 'memory:private', kind: 'interpretation', text: 'A private thought.', refs: [],
      importance: 5, atWatch: 400, createdAtMs: 1500, source: 'A' });
    const turn = prepare(f.state, f.world), schema = z.fromJSONSchema(recordCapabilityChoiceJsonSchema(f.state, f.world, turn));
    for (const audience of ['private', 'A', 'B', 'public']) for (const publish of [false, true]) {
      const raw = opening(f.world, { record: draft(f.world, { audience, publish, refs: ['memory:private'] }) });
      const allowed = audience === 'A' || (audience === 'private' && !publish);
      expect(schema.safeParse(raw).success, `${audience}/${publish}`).toBe(allowed);
      expect(applyRecordCapabilityChoice(f.state, f.world, turn, raw, control()).ok).toBe(allowed);
    }
  });

  it('restricts share, schedule and commission audiences to the exact source permissions', () => {
    const f = fixture();
    // A valid shared private source can authorize A and B without authorizing
    // the public or C. No source text or individual reader list enters context.
    const made = applyRecordOperation(f.state.records, f.world, { actor: 'A', sequence: 1,
      expectedRevision: 0, nowMs: 2001, preparedRefs: [{ id: 'fixture-source', audience: ['A', 'B'] }] },
    draft(f.world, { refs: ['fixture-source'] }), f.state);
    expect(made.ok, made.code).toBe(true);
    const state = structuredClone(f.state); state.records = made.records;
    state.minds.A.lastAppliedSequence = 1;
    state.minds.A.project = { id: 'project:fixture', goal: project.goal, why: project.why, visibility: 'private',
      status: 'active', createdAtMs: 2001, steps: [] };
    const d = state.records.drafts[0]!, turn = prepare(state, made.world, 'A', 2, 3000);
    const schema = z.fromJSONSchema(recordCapabilityChoiceJsonSchema(state, made.world, turn));
    for (const kind of ['share', 'schedule']) for (const audience of ['private', 'A', 'B', 'C', 'public']) {
      const raw = { record: { kind, draftId: d.id, contentHash: d.contentHash, audience } };
      const allowed = audience === 'B' || (kind === 'schedule' && audience === 'A');
      expect(schema.safeParse(raw).success, `${kind}/${audience}`).toBe(allowed);
      expect(applyRecordCapabilityChoice(state, made.world, turn, raw, control(3001)).ok).toBe(allowed);
    }
    const shared = applyRecordCapabilityChoice(state, made.world, turn,
      { record: { kind: 'share', draftId: d.id, contentHash: d.contentHash, audience: 'B' } }, control(3001));
    expect(shared.ok).toBe(true);
    const reply = prepare(shared.state, shared.world, 'B', 3, 4000);
    const replySchema = z.fromJSONSchema(recordCapabilityChoiceJsonSchema(shared.state, shared.world, reply));
    for (const audience of ['private', 'A', 'B', 'C', 'public']) for (const visibility of ['private', 'public']) {
      const raw = { project, message: { to: 'A', text: 'May I commission this exact text?' }, record: {
        kind: 'commission', draftId: d.id, contentHash: d.contentHash, counterpart: 'A',
        cells: 0, dueInWatches: 2, audience, visibility } };
      const allowed = visibility === 'private' && (audience === 'A' || audience === 'B');
      expect(replySchema.safeParse(raw).success, `${audience}/${visibility}`).toBe(allowed);
      expect(applyRecordCapabilityChoice(shared.state, shared.world, reply, raw, control(4001)).ok).toBe(allowed);
    }
  });

  it('extends the P4 object without mutating its schema or accepting tuples/legacy raw fields', () => {
    const f = fixture(), previous = proposalCapabilityChoiceJsonSchema(f.state, f.world, f.turn);
    const frozen = JSON.stringify(previous), schema = recordCapabilityChoiceJsonSchema(f.state, f.world, f.turn);
    expect(schema.type).toBe('object'); expect(JSON.stringify(schema)).not.toContain('prefixItems');
    expect(JSON.stringify(proposalCapabilityChoiceJsonSchema(f.state, f.world, f.turn))).toBe(frozen);
    expect(z.fromJSONSchema(schema).safeParse(opening(f.world)).success).toBe(true);
    for (const extra of [{ turn: [{ choice: 'no_deal' }, opening(f.world)] },
      { ...opening(f.world), offer: {} }, { ...opening(f.world), respond: {} }, { ...opening(f.world), records: [] }]) {
      const result = applyRecordCapabilityChoice(f.state, f.world, f.turn, extra, control());
      expect(result.ok).toBe(false); expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
    }
    expect(applyProposalCapabilityChoice(f.state, f.world, f.turn, opening(f.world), control()).ok).toBe(false);
    expect(applyOrderedCapabilityChoice(f.state, f.world, f.turn, opening(f.world), control()).ok).toBe(false);
  });

  it('factors repeated grammars without changing any existing P4 field, branch, enum or bound', () => {
    const expand = (schema: Record<string, unknown>, omitRecord: boolean): unknown => {
      const definitions = schema.$defs as Record<string, unknown>;
      const visit = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(visit);
        if (!value || typeof value !== 'object') return value;
        const node = value as Record<string, unknown>;
        if (typeof node.$ref === 'string') return visit(definitions[node.$ref.slice('#/$defs/'.length)]);
        return Object.fromEntries(Object.entries(node).filter(([key]) => key !== '$defs' && (!omitRecord || key !== 'record'))
          .map(([key, child]) => [key, visit(child)]));
      };
      return visit(schema);
    };
    const f = fixture(), loan = applyProposalCapabilityChoice(f.state, f.world, f.turn,
      { project, message: { to: 'B', text: 'May I lend you two cells?' },
        deal: { kind: 'loan', direction: 'lend', cells: 2, dueInDays: 2 } }, control());
    expect(loan.ok).toBe(true);
    const reply = prepare(loan.state, loan.world, 'B', 2, 3000);
    for (const [state, world, turn] of [[f.state, f.world, f.turn], [loan.state, loan.world, reply]] as const) {
      expect(expand(recordCapabilityChoiceJsonSchema(state, world, turn), true))
        .toEqual(expand(proposalCapabilityChoiceJsonSchema(state, world, turn), false));
    }
  });

  it('creates exact authored bytes without publishing, inventing supplies or changing physical time', () => {
    const f = fixture(), text = 'Line one.\nLine two: “a proposal”, not a measurement.';
    const result = applyRecordCapabilityChoice(f.state, f.world, f.turn,
      opening(f.world, { record: draft(f.world, { text }) }), control());
    expect(result.code).toBe('applied'); expect(result.world).toEqual(f.world);
    expect(result.state.records.drafts).toHaveLength(1);
    expect(result.state.records.drafts[0]).toMatchObject({ author: 'A', text, audience: 'private', parent: null });
    expect(result.state.records.drafts[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.state.records.intents).toHaveLength(0); expect(result.state.records.publications).toHaveLength(0);
    expect(f.state.records.drafts).toHaveLength(0);
  });

  it('permits a later private record-only operation without manufacturing a reflection or speech', () => {
    const f = fixture(), first = applyRecordCapabilityChoice(f.state, f.world, f.turn, opening(f.world), control());
    expect(first.ok).toBe(true);
    const next = prepare(first.state, first.world, 'A', 2, 3000), current = first.state.records.drafts[0]!;
    const result = applyRecordCapabilityChoice(first.state, first.world, next,
      { record: { kind: 'share', draftId: current.id, contentHash: current.contentHash, audience: 'B' } }, control(3001));
    expect(result.code).toBe('applied'); expect(result.state.conversations).toEqual(first.state.conversations);
    expect(result.state.minds.A.project).toEqual(first.state.minds.A.project);
    expect(result.state.minds.A.lastAppliedSequence).toBe(2);
    expect(result.state.records.shares).toHaveLength(1);
    expect(result.world).toEqual(first.world);
    expect(parseTurnResponse({})).toEqual({ ok: false, code: 'empty_response' });
    const later = prepare(result.state, result.world, 'A', 3, 4000);
    expect(applySocietyTurn(result.state, result.world, later, {}, control(4001)).code).toBe('empty_response');
    expect(applyRecordCapabilityChoice(result.state, result.world, later, {}, control(4001)).ok).toBe(false);
  });

  it('retains first-purpose and actual-reply requirements, while no record means ordinary P4 effects', () => {
    const f = fixture();
    expect(applyRecordCapabilityChoice(f.state, f.world, f.turn, { record: draft(f.world) }, control()).ok).toBe(false);
    const first = applyRecordCapabilityChoice(f.state, f.world, f.turn, opening(f.world), control());
    const reply = prepare(first.state, first.world, 'B', 2, 3000);
    expect(applyRecordCapabilityChoice(first.state, first.world, reply,
      { project, record: draft(first.world) }, control(3001)).ok).toBe(false);
    const raw = { project, message: { to: 'A', text: 'Please share the exact text before I review it.' } };
    expect(applyRecordCapabilityChoice(first.state, first.world, reply, raw, control(3001)))
      .toEqual(applyProposalCapabilityChoice(first.state, first.world, reply, raw, control(3001)));
  });

  it('shows the exact shared revision to its reader, without disclosing another private draft or source', () => {
    const f = fixture(), first = applyRecordCapabilityChoice(f.state, f.world, f.turn,
      opening(f.world, { record: draft(f.world, { audience: 'B' }) }), control());
    expect(first.ok).toBe(true);
    const shown = first.state.records.drafts[0]!, b = prepare(first.state, first.world, 'B', 2, 3000);
    expect(body(b).records.drafts.find((d: { id: string }) => d.id === shown.id)).toMatchObject({ text: shown.text, contentHash: shown.contentHash });
    expect(b.evidenceIds).toContain(shown.id);
    const c = prepare(first.state, first.world, 'C', 3, 3000);
    expect(c.prompt).not.toContain(shown.id); expect(c.prompt).not.toContain(shown.contentHash);
    expect(c.evidenceIds).not.toContain(shown.id);
  });

  it('rolls back the entire common response for forbidden source disclosure, identity or oversized UTF-8 text', () => {
    const f = fixture();
    f.state.minds.A.memories.push({ id: 'memory:private', kind: 'interpretation', text: 'A private thought.', refs: ['world:100:1'],
      importance: 5, atWatch: 400, createdAtMs: 1500, source: 'A' });
    const turn = prepare(f.state, f.world);
    expect(turn.evidenceIds).toContain('memory:private');
    for (const record of [draft(f.world, { audience: 'public', refs: ['memory:private'] }),
      draft(f.world, { author: 'B' }), draft(f.world, { refs: ['record:draft:99999'] }),
      draft(f.world, { text: '😀'.repeat(160) })]) {
      const result = applyRecordCapabilityChoice(f.state, f.world, turn, opening(f.world, { record }), control());
      expect(result.ok).toBe(false); expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
      expect(result.state.conversations).toHaveLength(0); expect(result.state.minds.A.lastAppliedSequence).toBe(-1);
    }
    const invalidMessage = applyRecordCapabilityChoice(f.state, f.world, turn,
      opening(f.world, { message: { to: 'A', text: 'Invalid self-address.' } }), control());
    expect(invalidMessage.ok).toBe(false); expect(invalidMessage.state.records.drafts).toHaveLength(0);
  });

  it('requires a fresh records cursor and preserves control, expiry and duplicate replay guards', () => {
    const f = fixture(), result = applyRecordCapabilityChoice(f.state, f.world, f.turn, opening(f.world), control());
    expect(result.ok).toBe(true);
    const repeat = applyRecordCapabilityChoice(result.state, result.world, f.turn, { nonsense: true }, control(2002));
    expect(repeat.code).toBe('already_applied'); expect(repeat.state).toBe(result.state); expect(repeat.world).toBe(result.world);
    expect(applyRecordCapabilityChoice(result.state, result.world, f.turn, opening(f.world), { nowMs: 2002, generation: 1 }).code).toBe('stale_control');
    expect(applyRecordCapabilityChoice(f.state, f.world, f.turn, opening(f.world), control(f.turn.expiresAtMs)).code).toBe('expired_job');
    const changed = structuredClone(f.state); changed.records.cursors.A.revision += 1;
    const stale = applyRecordCapabilityChoice(changed, f.world, f.turn, opening(f.world), control());
    expect(stale.ok).toBe(false); expect(stale.state).toBe(changed);
    const inconsistent = structuredClone(f.state);
    inconsistent.records.cursors.A.lastSequence = f.turn.sequence;
    const ahead = applyRecordCapabilityChoice(inconsistent, f.world, f.turn, opening(f.world), control());
    expect(ahead).toEqual({ ok: false, code: 'record_sequence_ahead', state: inconsistent, world: f.world });
    expect(ahead.state).toBe(inconsistent); expect(ahead.world).toBe(f.world);
    expect(ahead.state.minds.A.lastAppliedSequence).toBe(-1); expect(ahead.state.conversations).toHaveLength(0);
  });

  it('binds a requested revision, independent commission and exact acceptance to the scheduled bytes', () => {
    const f = fixture();
    let current = applyRecordCapabilityChoice(f.state, f.world, f.turn,
      opening(f.world, { record: draft(f.world, { audience: 'B' }) }), control());
    expect(current.ok).toBe(true);
    const original = structuredClone(current.state.records.drafts[0]!);
    const review = prepare(current.state, current.world, 'B', 2, 3000);
    current = applyRecordCapabilityChoice(current.state, current.world, review,
      { project, message: { to: 'A', text: 'Please mark any disagreement as an attributed claim, not a corrected total.' } }, control(3001));
    expect(current.ok).toBe(true); expect(current.state.records.drafts).toHaveLength(1);
    const revise = prepare(current.state, current.world, 'A', 3, 4000);
    current = applyRecordCapabilityChoice(current.state, current.world, revise,
      { message: { to: 'B', text: 'Here is a revision that labels disagreements as claims.' },
        record: draft(current.world, { text: 'Compare the register together. Attribute each disagreement to its speaker; do not overwrite the total.',
          audience: 'B', parent: { draftId: original.id, contentHash: original.contentHash } }) }, control(4001));
    expect(current.ok).toBe(true);
    const revised = current.state.records.drafts.at(-1)!;
    expect(revised.id).not.toBe(original.id); expect(revised.contentHash).not.toBe(original.contentHash);
    expect(current.state.records.drafts.find(d => d.id === original.id)).toEqual(original);
    expect(revised.author).toBe('A'); expect(current.state.records.publications).toHaveLength(0);
    const offer = prepare(current.state, current.world, 'B', 4, 5000);
    expect(body(offer).records.drafts).toContainEqual(expect.objectContaining({ id: revised.id, text: revised.text }));
    const forged = applyRecordCapabilityChoice(current.state, current.world, offer,
      { message: { to: 'A', text: 'May I commission publication?' }, record: { kind: 'commission',
        draftId: revised.id, contentHash: original.contentHash, counterpart: 'A', cells: 1, dueInWatches: 2,
        audience: 'B', visibility: 'private' } }, control(5001));
    expect(forged.ok).toBe(false); expect(forged.state).toBe(current.state);
    current = applyRecordCapabilityChoice(current.state, current.world, offer,
      { message: { to: 'A', text: 'I offer one cell for publication of this exact revision to me.' }, record: { kind: 'commission',
        draftId: revised.id, contentHash: revised.contentHash, counterpart: 'A', cells: 1, dueInWatches: 2,
        audience: 'B', visibility: 'private' } }, control(5001));
    expect(current.ok).toBe(true);
    const terms = structuredClone(current.state.records.offers[0]!.terms), offerId = current.state.records.offers[0]!.id;
    expect(current.state.records.agreements).toHaveLength(0); expect(current.state.records.intents).toHaveLength(0);
    const accept = prepare(current.state, current.world, 'A', 5, 6000);
    const accepted = applyRecordCapabilityChoice(current.state, current.world, accept,
      { message: { to: 'B', text: 'I accept this exact publication commission.' }, record: { kind: 'accept', offerId } }, control(6001));
    expect(accepted.ok).toBe(true);
    expect(accepted.state.records.agreements[0]).toMatchObject({ offerId, terms, status: 'active', paidCells: 0 });
    expect(accepted.state.records.intents[0]).toMatchObject({ author: 'A', draftId: revised.id, contentHash: revised.contentHash, audience: 'B' });
    expect(accepted.state.records.publications).toHaveLength(0); expect(accepted.state.offers).toHaveLength(0);
    expect(accepted.world).toEqual(f.world);
    expect(applyRecordCapabilityChoice(accepted.state, accepted.world, accept,
      { record: { kind: 'accept', offerId } }, control(6002)).code).toBe('already_applied');
  });
});
