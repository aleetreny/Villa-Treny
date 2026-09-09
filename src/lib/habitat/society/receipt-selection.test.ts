import { describe, expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { createSocietyState, evidence, watchNumber } from './state';
import { applySocietyTurn, bodyMemoryId, prepareSocietyTurn } from './turn';
import type { PreparedTurn, SocietyState } from './types';

const context = (turn: PreparedTurn) => JSON.parse(turn.prompt.slice(turn.prompt.lastIndexOf('\n{') + 1));
const fixture = () => {
  const world = genesisState(91), state = createSocietyState(world, 1000);
  const outcome = 'A repaired the Workshop; the recorded maintenance increased.';
  const receipt = evidence(state, 'A', world, 1100, 'observation', outcome, ['physical:100:1:A']);
  world.bodies.A.memory.push({ day: 100, watch: 1, kind: 'work', outcome });
  state.minds.A.project = { id: 'project:receipt', goal: 'Repair materials and equipment.', why: 'Maintain the Workshop.',
    visibility: 'private', status: 'completed', createdAtMs: 1000,
    steps: [{ id: 'step:receipt', intent: { actor: 'A', verb: 'repair' }, at: 'workshops', status: 'done', evidenceId: receipt }] };
  for (let i = 0; i < 4; i++) evidence(state, 'A', world, 1200 + i, 'interpretation',
    `Repair materials and equipment: my repeated interpretation ${i}.`, [], 'A', 5);
  return { world, state, outcome, receipt };
};
const prepare = (f: ReturnType<typeof fixture>, maxPromptBytes = 6500) => prepareSocietyTurn(f.state, f.world, 'A',
  { nowMs: 3000, sequence: 1, generation: 0, maxPromptBytes });

describe('selection of actual personal receipts', () => {
  it('keeps the real result and its step link inside four memories, alongside other recollections', () => {
    const f = fixture(), before = structuredClone(f), turn = prepare(f), read = context(turn);
    expect(read.memories).toHaveLength(4);
    expect(read.memories.find((m: { id: string }) => m.id === f.receipt)).toMatchObject({ kind: 'observation', text: f.outcome });
    expect(read.memories.filter((m: { kind: string }) => m.kind === 'interpretation')).toHaveLength(3);
    expect(read.ownProject.steps[0].evidenceId).toBe(f.receipt);
    expect(read.ownHistory.filter((m: { text: string }) => m.text === f.outcome)).toEqual([]);
    expect(turn.evidenceIds).toContain(f.receipt);
    expect(f).toEqual(before);
  });

  it('retains a distinct newer physical receipt and the latest step outcome under tight compaction', () => {
    const f = fixture(); f.world.watch = 2;
    const newer = evidence(f.state, 'A', f.world, 2000, 'observation', 'A drank water.', ['physical:100:2:A']);
    const turn = prepare(f, 1000), read = context(turn);
    expect(read.memories.map((m: { id: string }) => m.id)).toEqual([f.receipt, newer]);
    expect(read.ownProject.steps[0].evidenceId).toBe(f.receipt);
    expect(turn.contextOverflow).toBe(true);
    expect(read.refIds).toEqual(turn.evidenceIds);
    expect(read.memories.every((m: { id: string }) => turn.evidenceIds.includes(m.id))).toBe(true);
  });

  it('restores the body copy when the matching ordinary observation is removed by compaction', () => {
    const f = fixture();
    const outcome = 'Repair materials and equipment: an older personal exchange was recorded.';
    const old = evidence(f.state, 'A', f.world, 1050, 'observation', outcome, ['economic:receipt'], 'B', 5);
    f.world.bodies.A.memory.push({ day: 100, watch: 1, kind: 'gift', outcome });
    // Ensure it starts in the four visible memories, then the byte budget
    // removes it. It must not suppress both independent retained copies.
    for (const memory of f.state.minds.A.memories) if (memory.kind === 'interpretation') memory.importance = 3;
    expect(context(prepare(f)).memories.some((m: { id: string }) => m.id === old)).toBe(true);
    const turn = prepare(f, 1000), read = context(turn);
    expect(read.memories.some((m: { id: string }) => m.id === old)).toBe(false);
    const restored = read.ownHistory.find((m: { text: string }) => m.text === outcome);
    expect(restored?.id).toBe(bodyMemoryId('A', f.world.bodies.A.memory.at(-1)!));
    expect(turn.evidenceIds).toContain(restored.id);
    expect(turn.evidenceIds).not.toContain(old);
  });

  it('does not reserve a claim as an outcome or leak another resident’s private memory', () => {
    const f = fixture();
    const fake = evidence(f.state, 'A', f.world, 2500, 'claim', 'I say the work is done.', ['physical:100:1:A'], 'A', 5);
    f.state.minds.A.project!.steps[0]!.evidenceId = fake;
    evidence(f.state, 'C', f.world, 2600, 'observation', 'Private violet inventory.', ['physical:100:1:C']);
    const turn = prepare(f, 1000), read = context(turn);
    expect(read.memories.map((m: { id: string }) => m.id)).toEqual([f.receipt]);
    expect(read.ownProject.steps[0]).not.toHaveProperty('evidenceId');
    expect(turn.prompt).not.toContain('Private violet');
    expect(turn.evidenceIds).not.toContain(fake);
  });

  it('does not invent an evicted step receipt and preserves an already prepared job', () => {
    const f = fixture(), saved = prepare(f), bytes = JSON.stringify(saved);
    const next: SocietyState = structuredClone(f.state);
    next.minds.A.memories = next.minds.A.memories.filter((m) => m.id !== f.receipt);
    const newTurn = prepare({ ...f, state: next }), read = context(newTurn);
    expect(read.ownProject.steps[0]).not.toHaveProperty('evidenceId');
    expect(newTurn.evidenceIds).not.toContain(f.receipt);
    expect(read.ownHistory.some((m: { text: string }) => m.text === f.outcome)).toBe(true);
    expect(JSON.stringify(saved)).toBe(bytes);
    const applied = applySocietyTurn(f.state, f.world, saved,
      { reflection: { text: 'I can refer to my existing result.', refs: [f.receipt] } }, { nowMs: 3001, generation: 0 });
    expect(applied.ok).toBe(true);
    expect(applied.world).toEqual(f.world);
    expect(f.state.minds.A.lastPhysicalWatch).toBeLessThanOrEqual(watchNumber(f.world));
  });

  it.each(['future-time', 'future-watch', 'foreign-action'] as const)('does not reserve %s as a current own receipt', (kind) => {
    const f = fixture();
    const id = evidence(f.state, 'A', f.world, 2500, 'observation', 'Another retained observation.',
      [kind === 'foreign-action' ? 'physical:100:1:B' : 'physical:100:1:A'], null, 5);
    const observation = f.state.minds.A.memories.find((m) => m.id === id)!;
    if (kind === 'future-time') observation.createdAtMs = 3001;
    if (kind === 'future-watch') observation.atWatch = watchNumber(f.world) + 1;
    const read = context(prepare(f, 1000));
    expect(read.memories.map((m: { id: string }) => m.id)).toEqual([f.receipt]);
  });
});
