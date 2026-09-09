import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { genesisState } from '../engine/state';
import { applyAppraisal, appraisalJsonSchema, validateAppraisal, type ValidatedAppraisal } from './appraisal';
import { parseSocietyState } from './schema';
import { createSocietyState, evidence } from './state';
import { applySocietyTurn, prepareSocietyTurn } from './turn';
import { societyPublicView } from './public';
import type { PreparedTurn, SocietyResult } from './types';

function fixture() {
  const world = genesisState(91), initial = createSocietyState(world, 1000);
  const opening = prepareSocietyTurn(initial, world, 'A', { nowMs: 2000, generation: 0, sequence: 1 });
  const opened = applySocietyTurn(initial, world, opening,
    { message: { to: 'B', text: 'I can hear your suggestion before making my next plan.', close: false } }, { nowMs: 2001, generation: 0 });
  expect(opened.ok).toBe(true);
  const turn = prepareSocietyTurn(opened.state, opened.world, 'B', { nowMs: 3000, generation: 0, sequence: 1 });
  return { ...opened, turn, raw: { axis: 'trust' as const, delta: 1 as const,
    ref: opened.state.conversations[0].turns[0].id, why: 'I feel more willing to speak because A offered to listen.' } };
}
function checked(f: ReturnType<typeof fixture>): ValidatedAppraisal {
  const validated = validateAppraisal(f.state, f.turn, f.raw);
  expect(validated.ok).toBe(true);
  if (!validated.ok) throw new Error(validated.code);
  return validated.value;
}
function base(f: ReturnType<typeof fixture>, response: unknown = { message: { to: 'A', text: 'I would like that.', close: false } },
  nowMs = 3001, generation = 0) {
  return applySocietyTurn(f.state, f.world, f.turn, response, { nowMs, generation });
}
function apply(f: ReturnType<typeof fixture>, response?: unknown): SocietyResult {
  return applyAppraisal(base(f, response), f.turn, checked(f), 3001);
}

describe('private appraisal of a real received turn', () => {
  it('offers exactly the incoming evidence and derives its target and index', () => {
    const f = fixture(), schema = appraisalJsonSchema(f.state, f.turn)!;
    expect(z.fromJSONSchema(schema).safeParse(f.raw).success).toBe(true);
    expect(checked(f)).toEqual({ ...f.raw, conversationId: f.state.conversations[0].id, target: 'A', index: 0 });
    const value = JSON.stringify(schema);
    expect(value).toContain(f.raw.ref);
    expect(value).not.toContain('heldBy');
    expect(value).not.toContain('appraisedThrough');
    const waiting = prepareSocietyTurn(f.state, f.world, 'A', { nowMs: 3000, generation: 0, sequence: 2 });
    expect(appraisalJsonSchema(f.state, waiting)).toBeUndefined();
    const absent = prepareSocietyTurn(f.state, f.world, 'C', { nowMs: 3000, generation: 0, sequence: 1 });
    expect(appraisalJsonSchema(f.state, absent)).toBeUndefined();
  });

  it('changes only the actor’s directed feeling, without physical time, consent or financial effects', () => {
    const f = fixture(), original = structuredClone(f), result = apply(f), expected = structuredClone(f.world);
    expected.axes.get('BA')!.trust += 1;
    expect(result.ok).toBe(true);
    expect(result.world).toEqual(expected);
    expect(f).toEqual(original);
    expect(result.state.conversations[0].appraisedThrough).toEqual([-1, 0]);
    expect(result.state.offers).toEqual(f.state.offers);
    expect(result.state.agreements).toEqual(f.state.agreements);
    expect(result.state.minds.B.memories.at(-1)).toMatchObject({ kind: 'interpretation', source: 'B',
      refs: [f.raw.ref], createdAtMs: 3001, atWatch: f.world.day * 4 + f.world.watch - 1 });
  });

  it('rejects fabricated, unoffered, self-written, old and unrelated evidence', () => {
    const f = fixture();
    for (const ref of ['turn:999999', `world:${f.world.day}:${f.world.watch}`, f.state.minds.B.memories[0].id])
      expect(validateAppraisal(f.state, f.turn, { ...f.raw, ref }).ok).toBe(false);
    expect(validateAppraisal(f.state, { ...f.turn, evidenceIds: [] }, f.raw).ok).toBe(false);
    expect(validateAppraisal(f.state, { ...f.turn, actor: 'A' }, f.raw).ok).toBe(false);
    expect(validateAppraisal(f.state, { ...f.turn, conversation: null }, f.raw).ok).toBe(false);
    const responded = base(f);
    const a = prepareSocietyTurn(responded.state, responded.world, 'A', { nowMs: 4000, generation: 0, sequence: 2 });
    expect(validateAppraisal(responded.state, a, f.raw).ok).toBe(false);
    const answer = applySocietyTurn(responded.state, responded.world, a,
      { message: { to: 'B', text: 'Please continue.', close: false } }, { nowMs: 4001, generation: 0 });
    const b = prepareSocietyTurn(answer.state, answer.world, 'B', { nowMs: 5000, generation: 0, sequence: 2 });
    expect(validateAppraisal(answer.state, b, f.raw).ok).toBe(false);
    expect(validateAppraisal(answer.state, b, { ...f.raw, ref: answer.state.conversations[0].turns.at(-1)!.id }).ok).toBe(true);
  });

  it('allows only a single nonzero point and a bounded reason, with no chosen target or economic axes', () => {
    const f = fixture();
    for (const patch of [{ axis: 'debt' }, { axis: 'desire' }, { axis: 'cells' }, { delta: 0 }, { delta: 2 },
      { delta: -2 }, { delta: 0.5 }, { delta: Number.NaN }, { target: 'C' }, { why: '' }, { why: '   ' }, { why: 'a'.repeat(181) }])
      expect(validateAppraisal(f.state, f.turn, { ...f.raw, ...patch }).ok).toBe(false);
    for (const axis of ['trust', 'affection', 'admiration', 'resentment'])
      for (const delta of [-1, 1]) expect(validateAppraisal(f.state, f.turn, { ...f.raw, axis, delta }).ok).toBe(true);
  });

  it('is optional and refuses stale conversation metadata or unavailable clocks', () => {
    const f = fixture(), ordinary = base(f);
    expect(ordinary.world.axes).toEqual(f.world.axes);
    expect(ordinary.state.conversations[0].appraisedThrough).toBeUndefined();
    for (const status of ['closed', 'expired'] as const) {
      const altered = structuredClone(f.state); altered.conversations[0].status = status;
      expect(validateAppraisal(altered, f.turn, f.raw).ok).toBe(false);
    }
    const expired = { ...f.turn, preparedAtMs: f.state.conversations[0].expiresAtMs };
    expect(validateAppraisal(f.state, expired, f.raw).ok).toBe(false);
    const changed = { ...f.turn, conversation: { ...f.turn.conversation!, revision: 99 } };
    expect(validateAppraisal(f.state, changed, f.raw).ok).toBe(false);
    const future = structuredClone(f.state); future.conversations[0].turns[0].atMs = f.turn.preparedAtMs + 1;
    expect(validateAppraisal(future, f.turn, f.raw).ok).toBe(false);
  });

  it('never appraises a failed base operation, expired job, stale generation or repeated job', () => {
    const f = fixture(), value = checked(f);
    const failed = base(f, { project: { mode: 'replace', goal: 'Bad action', why: 'Not offered',
      visibility: 'public', steps: [{ verb: 'invent_cells' }] } });
    expect(failed.ok).toBe(false);
    for (const result of [failed, base(f, undefined, f.turn.expiresAtMs), base(f, undefined, 3001, 1)]) {
      const before = structuredClone(result);
      expect(applyAppraisal(result, f.turn, value, 3001)).toEqual(before);
    }
    const first = apply(f), before = structuredClone(first);
    expect(applyAppraisal(first, f.turn, value, 3001)).toEqual(before);
    const replay = applySocietyTurn(first.state, first.world, f.turn,
      { message: { to: 'A', text: 'Repeated response.' } }, { nowMs: 3002, generation: 0 });
    expect(replay.code).toBe('already_applied');
    const replayBefore = structuredClone(replay);
    expect(applyAppraisal(replay, f.turn, value, 3002)).toEqual(replayBefore);
  });

  it.each([[100, 1], [0, -1]] as const)('consumes the watermark at the %s boundary for delta %s', (amount, delta) => {
    const f = fixture(); f.world.axes.get('BA')!.trust = amount;
    const value = validateAppraisal(f.state, f.turn, { ...f.raw, delta });
    if (!value.ok) throw new Error(value.code);
    const first = applyAppraisal(base(f, { reflection: { text: 'I am considering what I heard.', refs: [f.raw.ref] } }), f.turn, value.value, 3001);
    expect(first.world.axes.get('BA')!.trust).toBe(amount);
    expect(first.state.conversations[0].appraisedThrough).toEqual([-1, 0]);
    const later = prepareSocietyTurn(first.state, first.world, 'B', { nowMs: 4000, generation: 0, sequence: 2 });
    expect(appraisalJsonSchema(first.state, later)).toBeUndefined();
    expect(validateAppraisal(first.state, later, { ...f.raw, delta: -delta }).ok).toBe(false);
  });

  it('persists independent monotonic member watermarks and allows appraisal while closing the reply', () => {
    const f = fixture(), first = apply(f);
    const a = prepareSocietyTurn(first.state, first.world, 'A', { nowMs: 4000, generation: 0, sequence: 2 });
    const ref = first.state.conversations[0].turns.at(-1)!.id;
    const value = validateAppraisal(first.state, a, { ...f.raw, ref, delta: -1 });
    if (!value.ok) throw new Error(value.code);
    const closed = applyAppraisal(applySocietyTurn(first.state, first.world, a,
      { message: { to: 'B', text: 'I need to pause our discussion.', close: true } }, { nowMs: 4001, generation: 0 }), a, value.value, 4001);
    expect(closed.state.conversations[0]).toMatchObject({ status: 'closed', appraisedThrough: [1, 0] });
    expect(closed.world.axes.get('AB')!.trust).toBe(first.world.axes.get('AB')!.trust - 1);
    expect(closed.world.axes.get('BA')).toEqual(first.world.axes.get('BA'));
    expect(parseSocietyState(JSON.parse(JSON.stringify(closed.state)))).toEqual({ ok: true, state: closed.state });
  });

  it('reads untouched v1 states and rejects forged watermark shape, ownership and future indices', () => {
    const f = fixture();
    const { records, retrieval, ...fields } = f.state;
    const legacy = { ...fields, version: 1, conversations: fields.conversations.map(c => {
      const { attentionThrough, ...old } = c; void attentionThrough; return old;
    }) };
    expect(records.drafts).toEqual([]);
    expect(retrieval.A.pending).toBe(false);
    expect(parseSocietyState(legacy)).toEqual({ ok: true, state: { ...f.state,
      conversations: f.state.conversations.map(c => ({ ...c, attentionThrough: [1, 0] })) } });
    for (const appraisedThrough of [[0, -1], [-1, 1], [-2, 0], [-1, 0.5], [-1, 0, 1], [-1, 16]]) {
      const raw = { ...legacy, conversations: [{ ...legacy.conversations[0], appraisedThrough }] };
      expect(parseSocietyState(raw).ok).toBe(false);
    }
    expect(parseSocietyState({ ...legacy, conversations: [{ ...legacy.conversations[0], appraisedThrough: [-1, 0] }] }).ok).toBe(true);
  });

  it('keeps deduplication through recovery and memory eviction, while private reasons stay out of other minds and public DTOs', () => {
    const f = fixture(), result = apply(f, { reflection: { text: 'I am considering a reply.', refs: [f.raw.ref] } });
    const restored = parseSocietyState(JSON.parse(JSON.stringify(result.state)));
    if (!restored.ok) throw new Error(restored.code);
    for (let i = 0; i < 30; i++) evidence(restored.state, 'B', result.world, 4000 + i, 'observation', `Later personal note ${i}.`);
    expect(restored.state.minds.B.memories.some(m => m.text.includes(f.raw.why))).toBe(false);
    const later = prepareSocietyTurn(restored.state, result.world, 'B', { nowMs: 5000, generation: 0, sequence: 2 });
    expect(validateAppraisal(restored.state, later, f.raw).ok).toBe(false);
    expect(parseSocietyState(restored.state).ok).toBe(true);
    const publicText = JSON.stringify(societyPublicView(result.state));
    expect(publicText).not.toContain(f.raw.why);
    expect(publicText).not.toContain('appraisedThrough');
    const others = ['A', 'C'] as const;
    for (const actor of others) {
      expect(JSON.stringify(result.state.minds[actor])).not.toContain(f.raw.why);
      const next: PreparedTurn = prepareSocietyTurn(result.state, result.world, actor,
        { nowMs: 5000, generation: 0, sequence: 2 });
      expect(next.prompt).not.toContain(f.raw.why);
      expect(next.prompt).not.toContain('heldBy');
    }
  });
});
