import { describe, expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { totalCells } from '../engine/economy';
import { attempt } from '../engine/verbs';
import { AXES } from '../weave';
import { RESIDENTS } from '../residents';
import { createSocietyState, observeSocietyActions, parseSocietyState, prepareSocietyTurn,
  applySocietyTurn, societyPublicView, SOCIETY_WIRE_JSON_SCHEMA, type PreparedTurn } from './index';
import { bodyMemoryId } from './turn';

function fixture() {
  const world = genesisState(41);
  world.bodies.A.room = world.bodies.B.room = 'common';
  world.bodies.A.cells = 1; world.bodies.B.cells = 20;
  world.axes.get('AB')!.resentment = 0;
  world.axes.get('AB')!.trust = 80;
  world.axes.get('BA')!.trust = 80;
  world.economy.ledger.initialCells = totalCells(world);
  return world;
}
function context(job: PreparedTurn) {
  return JSON.parse(job.prompt.slice(job.prompt.indexOf('\n{') + 1));
}

describe('personal continuity across body and mind', () => {
  it.each(['before', 'after'])('remembers real companionship when the recipient acts %s its partner, exactly once', (order) => {
    const world = fixture(), initial = createSocietyState(world, 1000);
    const together = attempt(world, { actor: 'B', verb: 'accompany', target: 'A' });
    const rest = attempt(world, { actor: 'A', verb: 'rest' });
    expect(together.ok).toBe(true);
    const pair = { actor: 'B' as const, day: world.day, watch: world.watch,
      intent: { actor: 'B' as const, verb: 'accompany' as const, target: 'A' as const }, outcome: together };
    const own = { actor: 'A' as const, day: world.day, watch: world.watch,
      intent: { actor: 'A' as const, verb: 'rest' as const }, outcome: rest };
    const observations = order === 'before' ? [own, pair] : [pair, own];
    const result = observeSocietyActions(initial, world, observations, { nowMs: 2000 });
    expect(parseSocietyState(result.state).ok).toBe(true);
    const memories = result.state.minds.A.memories.filter((m) => m.text === together.happening!.text);
    expect(memories).toHaveLength(1);
    expect(memories[0]).toMatchObject({ source: 'B', refs: ['physical:100:1:B'], kind: 'observation' });
    expect(result.state.minds.A.lastPhysicalWatch).toBe(400);
    expect(result.state.minds.C.memories).toEqual([]);
    expect(observeSocietyActions(result.state, result.world, observations, { nowMs: 2001 })).toEqual(result);
    const prepared = prepareSocietyTurn(result.state, result.world, 'A', { nowMs: 2100, generation: 0, sequence: 1 });
    const read = context(prepared);
    expect(read.memories.filter((m: { text: string }) => m.text === together.happening!.text)).toHaveLength(1);
    expect(read.ownHistory.filter((m: { text: string }) => m.text === together.happening!.text)).toEqual([]);
    expect(prepared.evidenceIds).toContain(memories[0].id);
  });

  it('retains a real pre-migration loan, its terms and only the actor’s feelings and private history', () => {
    const world = fixture();
    const loan = attempt(world, { actor: 'B', verb: 'lend', target: 'A' });
    expect(loan.ok).toBe(true);
    world.axes.get('AB')!.trust = 13; world.axes.get('BA')!.trust = 97;
    world.bodies.C.memory.push({ day: 100, watch: 1, kind: 'note', outcome: 'C alone knows the violet ledger phrase.' });
    const state = createSocietyState(world, 2000), before = structuredClone(world);
    const prepared = prepareSocietyTurn(state, world, 'A', { nowMs: 2100, generation: 0, sequence: 1 });
    const read = context(prepared), memory = read.ownHistory.find((m: { text: string }) => m.text === loan.happening!.text);
    expect(memory).toMatchObject({ id: bodyMemoryId('A', world.bodies.A.memory[0]), day: 100, watch: 1, other: 'B' });
    expect(read.affordances.repayments[0]).toMatchObject({ target: 'B', remaining: 4, nextPayment: 2 });
    expect(read.self.cells).toBe(world.bodies.A.cells);
    expect(read.ownFeelings.axes).toEqual(AXES);
    expect(read.ownFeelings.towards.find((p: { id: string }) => p.id === 'B').held)
      .toEqual(AXES.map((axis) => Math.round(world.axes.get('AB')![axis])));
    expect(prepared.prompt).not.toContain('heldBy');
    expect(prepared.prompt).not.toContain('violet ledger');
    expect(prepared.evidenceIds).toContain(memory.id);
    expect(world).toEqual(before);
    const applied = applySocietyTurn(state, world, prepared,
      { reflection: { text: 'I remember this loan before making another promise.', refs: [memory.id] } }, { nowMs: 2101, generation: 0 });
    expect(applied.ok).toBe(true);
    expect(JSON.stringify(societyPublicView(applied.state))).not.toContain('I remember this loan');
    expect(JSON.stringify(societyPublicView(applied.state))).not.toContain(memory.id);
  });

  it('keeps historical IDs stable when older records leave the body window and lists only retained references', () => {
    const world = fixture();
    attempt(world, { actor: 'B', verb: 'give', target: 'A' });
    const fact = world.bodies.A.memory[0], id = bodyMemoryId('A', fact);
    let state = createSocietyState(world, 1000);
    const first = prepareSocietyTurn(state, world, 'A', { nowMs: 1100, generation: 0, sequence: 1 });
    const echo = applySocietyTurn(state, world, first, { reflection: { text: fact.outcome, refs: [id] } },
      { nowMs: 1101, generation: 0 });
    expect(echo.ok).toBe(true); state = echo.state;
    for (let n = 0; n < 7; n++) world.bodies.A.memory.unshift({ day: 99, watch: 1,
      kind: 'note', outcome: `An earlier personal observation ${n}: ${'old record '.repeat(15)}` });
    const prepared = prepareSocietyTurn(state, world, 'A', { nowMs: 2000, generation: 0, sequence: 2 });
    const read = context(prepared);
    expect(read.ownHistory.some((m: { id: string }) => m.id === id)).toBe(true);
    expect(read.omitted.ownHistory).toBeGreaterThan(0);
    expect(read.refIds).toEqual(prepared.evidenceIds);
    const retained = new Set([read.public.id,
      ...[read.ownKnowledge, read.memories, read.ownHistory, read.conversation?.transcript ?? [], read.openOffers, read.commitments]
        .flat().map((entry: { id: string }) => entry.id)]);
    expect(prepared.evidenceIds.every((ref) => retained.has(ref))).toBe(true);
    world.bodies.A.memory.shift();
    expect(bodyMemoryId('A', fact)).toBe(id);
    expect(bodyMemoryId('B', fact)).not.toBe(id);
  });

  it('keeps all 25 initial contexts inside the configured conservative Groq request size', () => {
    const world = genesisState(41), state = createSocietyState(world, 1000);
    const schemaBytes = new TextEncoder().encode(JSON.stringify(SOCIETY_WIRE_JSON_SCHEMA)).length;
    for (const { id } of RESIDENTS) {
      const prepared = prepareSocietyTurn(state, world, id, { nowMs: 2000, generation: 0, sequence: 0 });
      expect(prepared.contextOverflow).toBe(false);
      expect(prepared.promptBytes + schemaBytes + 128 + 768).toBeLessThanOrEqual(6000);
    }
  });
});
