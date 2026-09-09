import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { genesisState, type WorldState } from '../../../src/lib/habitat/engine/state';
import { RESIDENTS, type ResidentId } from '../../../src/lib/habitat/residents';
import { createSocietyState, markSocietyAttempt } from '../../../src/lib/habitat/society/state';
import { applySocietyTurn, prepareSocietyTurn } from '../../../src/lib/habitat/society/turn';
import { channelNeedsReview } from '../../../src/lib/habitat/society/dialogue';
import type { SocietyState } from '../../../src/lib/habitat/society/types';
import { applySocietyProtocol } from '../src/society-protocol';
import { COGNITION_FAILURE_BACKOFF_MS, COGNITION_REVIEW_MS, nextSocietyActor, prepareSocietyJob } from '../src/society-scheduler';

type Fixture = { state: SocietyState; world: WorldState; nowMs: number; sequence: number };
function fixture(): Fixture {
  const world = genesisState(91);
  const f = { world, state: createSocietyState(world, 1000), nowMs: 2000, sequence: 0 };
  for (const { id: actor } of RESIDENTS) {
    const turn = prepareSocietyTurn(f.state, f.world, actor, { nowMs: f.nowMs, sequence: ++f.sequence, generation: 0 });
    const result = applySocietyTurn(f.state, f.world, turn, { project: { mode: 'replace', goal: 'Consider my next choice.',
      why: 'I want to decide for myself.', visibility: 'private', steps: [] } }, { nowMs: f.nowMs + 1, generation: 0 });
    expect(result.ok, result.code).toBe(true);
    f.state = result.state; f.world = result.world; f.nowMs += 100;
  }
  return f;
}
function prepare(f: Fixture, actor: ResidentId) {
  return prepareSocietyJob({ state: f.state, world: f.world, actor, nowMs: f.nowMs, sequence: f.sequence + 1,
    generation: 0, worldRevision: f.sequence, habitatId: 'offline-attention-review', protocolVersion: 8 });
}
function act(f: Fixture, actor: ResidentId, raw: unknown): void {
  const issued = prepare(f, actor);
  expect(issued.job.outputContract.version).toBe(8);
  const result = applySocietyProtocol(8, f.state, f.world, issued.turn, raw, { nowMs: f.nowMs + 1, generation: 0 });
  expect(result.ok, result.code).toBe(true);
  f.state = result.state; f.world = result.world; f.sequence++; f.nowMs += 100;
}
const contact = (to: ResidentId, close = false) => ({ attention: { kind: 'contact' },
  content: { message: { to, text: 'I would like you to consider this account.', close } } });
const review = (conversationId: string | null) => ({ attention: { kind: 'private', conversationId }, content: {} });
const only = (...actors: ResidentId[]) => new Set(RESIDENTS.map(r => r.id).filter(id => !actors.includes(id)));
const between = (f: Fixture, a: ResidentId, b: ResidentId) => {
  const found = f.state.conversations.find(c => c.participants.includes(a) && c.participants.includes(b));
  if (!found) throw new Error('Missing real conversation fixture');
  return found;
};

beforeEach(() => vi.stubGlobal('fetch', () => { throw new Error('Attention scheduler tests must not call inference'); }));
afterEach(() => vi.unstubAllGlobals());

describe('P8 scheduler keeps attention per channel and opportunity per resident', () => {
  it('preserves two unread closures after another successful private decision, then consumes them separately', () => {
    const f = fixture();
    act(f, 'B', contact('A', true)); act(f, 'C', contact('A', true));
    const ab = between(f, 'A', 'B').id, ac = between(f, 'A', 'C').id;
    act(f, 'A', review(null));
    for (const parity of [0, 1]) expect(nextSocietyActor(f.state, f.nowMs, parity, only('A'))).toBe('A');
    act(f, 'A', review(ab));
    expect(channelNeedsReview(between(f, 'A', 'B'), 'A')).toBe(false);
    expect(channelNeedsReview(between(f, 'A', 'C'), 'A')).toBe(true);
    expect(nextSocietyActor(f.state, f.nowMs, 0, only('A'))).toBe('A');
    act(f, 'A', review(ac));
    for (const parity of [0, 1]) expect(nextSocietyActor(f.state, f.nowMs, parity, only('A'))).toBeUndefined();
    expect(f.state.conversations.every(c => c.status === 'closed')).toBe(true);
  });

  it('does not schedule endless replies after a private consideration, while retaining the ordinary periodic review', () => {
    const f = fixture(); act(f, 'B', contact('A'));
    const ab = between(f, 'A', 'B').id;
    expect(nextSocietyActor(f.state, f.nowMs, 1, only('A'))).toBe('A');
    act(f, 'A', review(ab));
    expect(between(f, 'A', 'B')).toMatchObject({ status: 'open', nextSpeaker: 'A' });
    for (const parity of [0, 1]) expect(nextSocietyActor(f.state, f.nowMs, parity, only('A'))).toBeUndefined();
    const deadline = f.state.minds.A.lastSuccessAtMs! + COGNITION_REVIEW_MS;
    expect(nextSocietyActor(f.state, deadline - 1, 0, only('A'))).toBeUndefined();
    expect(nextSocietyActor(f.state, deadline, 0, only('A'))).toBe('A');
  });

  it('gives a waiting resident a turn before granting another opportunity merely because one person has three channels', () => {
    const f = fixture();
    for (const actor of ['B', 'C', 'D'] as const) act(f, actor, contact('A'));
    act(f, 'F', contact('E'));
    expect(nextSocietyActor(f.state, f.nowMs, 1, only('A', 'E'))).toBe('A');
    act(f, 'A', review(between(f, 'A', 'B').id));
    expect(channelNeedsReview(between(f, 'A', 'C'), 'A')).toBe(true);
    expect(channelNeedsReview(between(f, 'A', 'D'), 'A')).toBe(true);
    for (const parity of [0, 1]) expect(nextSocietyActor(f.state, f.nowMs, parity, only('A', 'E'))).toBe('E');
    act(f, 'E', review(between(f, 'E', 'F').id));
    expect(nextSocietyActor(f.state, f.nowMs, 1, only('A', 'E'))).toBe('A');
  });

  it('keeps unread attention across preparation and failure, preserving backoff and already occupied residents', () => {
    const f = fixture(); act(f, 'B', contact('A', true));
    const before = structuredClone(f.state.conversations);
    prepare(f, 'A'); prepare(f, 'A');
    expect(f.state.conversations).toEqual(before);
    f.state = markSocietyAttempt(f.state, 'A', f.nowMs);
    expect(nextSocietyActor(f.state, f.nowMs, 0, only('A'))).toBeUndefined();
    const deadline = f.nowMs + COGNITION_FAILURE_BACKOFF_MS;
    expect(nextSocietyActor(f.state, deadline - 1, 1, only('A'))).toBeUndefined();
    expect(nextSocietyActor(f.state, deadline, 1, only('A'))).toBe('A');
    expect(nextSocietyActor(f.state, deadline, 1, new Set(RESIDENTS.map(r => r.id)))).toBeUndefined();
    expect(f.state.conversations).toEqual(before);
  });

  it('notices a unilateral closure revision even though it adds no speech, and another private success cannot erase it', () => {
    const f = fixture(); act(f, 'A', contact('B'));
    const ab = between(f, 'A', 'B').id;
    act(f, 'B', review(ab));
    expect(nextSocietyActor(f.state, f.nowMs, 1, only('B'))).toBeUndefined();
    const words = structuredClone(between(f, 'A', 'B').turns);
    act(f, 'A', { attention: { kind: 'leave', conversationId: ab }, content: {} });
    act(f, 'B', review(null));
    expect(between(f, 'A', 'B').turns).toEqual(words);
    expect(channelNeedsReview(between(f, 'A', 'B'), 'B')).toBe(true);
    expect(nextSocietyActor(f.state, f.nowMs, 1, only('B'))).toBe('B');
    act(f, 'B', review(ab));
    expect(nextSocietyActor(f.state, f.nowMs, 1, only('B'))).toBeUndefined();
  });
});
