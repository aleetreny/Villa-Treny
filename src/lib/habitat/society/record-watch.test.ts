import { describe, expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { totalCells } from '../engine/economy';
import { createSocietyState, watchNumber } from './state';
import { applyRecordOperation } from './records';
import { advanceSocietyWatch } from './record-watch';
import { parseSocietyState } from './schema';
import { promisedCells, termsProblem } from './economy';
import type { ResidentId } from '../residents';
import type { RecordOperation } from './record-types';

function preparedCommission() {
  let world = genesisState(), state = createSocietyState(world, 1000), nowMs = 1001, sequence = 0;
  for (const [id, mind] of Object.entries(state.minds)) {
    world.bodies[id as ResidentId].condition = { fed: 90, rested: 90, well: 90, safe: 90, accompanied: 90 };
    mind.project = { id: `project:${state.nextId++}`, goal: 'Observe before choosing more work', why: 'A deliberate pause',
      visibility: 'private', status: 'active', createdAtMs: 1000,
      steps: [{ id: `step:${state.nextId++}`, intent: { actor: id as ResidentId, verb: 'observe' }, at: null, status: 'pending', evidenceId: null }] };
  }
  const apply = (actor: ResidentId, op: RecordOperation) => {
    const answer = applyRecordOperation(state.records, world, { actor, sequence: sequence++,
      expectedRevision: state.records.cursors[actor].revision, nowMs: nowMs++, preparedRefs: [] }, op, state);
    expect(answer.ok, answer.code).toBe(true); state = { ...state, records: answer.records }; world = answer.world;
    state.minds[actor].lastAppliedSequence = sequence - 1;
  };
  apply('A', { kind: 'draft', title: 'Water ledger proposal', text: 'Compare the shared stock before each allocation.',
    refs: [], parent: null, audience: 'public', publish: false });
  const d = state.records.drafts[0]!;
  apply('A', { kind: 'commission', draftId: d.id, contentHash: d.contentHash, counterpart: 'B',
    cells: 2, dueInWatches: 1, audience: 'public', visibility: 'public' });
  apply('B', { kind: 'accept', offerId: state.records.offers[0]!.id });
  return { world, state, nowMs: nowMs + 1 };
}

describe('authored work through the full physical watch', () => {
  it('publishes the exact accepted document once, conserves payment and leaves an unrelated plan unfinished', () => {
    const f = preparedCommission(), before = structuredClone(f), total = totalCells(f.world);
    const payerBefore = f.world.bodies.B.cells, authorBefore = f.world.bodies.A.cells;
    const next = advanceSocietyWatch(f.state, f.world, f.nowMs);
    expect(f).toEqual(before);
    expect(next.observations).toHaveLength(25);
    expect(new Set(next.observations.map(o => o.actor)).size).toBe(25);
    const publication = next.state.records.publications[0]!;
    expect(publication.contentHash).toBe(f.state.records.drafts[0]!.contentHash);
    expect(next.state.records.agreements[0]).toMatchObject({ status: 'fulfilled', publicationId: publication.id, paidCells: 2 });
    expect(next.world.bodies.A.cells).toBeCloseTo(authorBefore + 2, 10);
    expect(next.world.bodies.B.cells).toBeCloseTo(payerBefore - 2, 10);
    expect(totalCells(next.world)).toBeCloseTo(total, 10);
    expect(next.state.minds.A.project!.steps[0]!.status).toBe('pending');
    expect(next.state.minds.A.lastPhysicalWatch).toBe(watchNumber(f.world));
    expect(next.state.minds.A.memories.some(m => m.refs.includes(publication.id))).toBe(true);
    expect(parseSocietyState(next.state).ok).toBe(true);
    const paid = next.world.economy.events.filter(e => e.action.startsWith('record-commission:'));
    expect(paid).toHaveLength(1);
    expect(paid[0]!.entries.reduce((sum,e) => sum + e.delta, 0)).toBeCloseTo(0, 10);
    // Advancing a different watch cannot publish/pay that fulfilled obligation again.
    const again = advanceSocietyWatch(next.state, next.world, f.nowMs + 1000);
    expect(again.state.records.publications).toHaveLength(1);
    expect(again.world.economy.events.filter(e => e.action.startsWith('record-commission:'))).toHaveLength(1);
  });

  it('preserves a pending draft through urgent sleep and performs it in the next available slot', () => {
    const f = preparedCommission(); f.world.bodies.A.condition.rested = 0;
    const first = advanceSocietyWatch(f.state, f.world, f.nowMs);
    expect(first.state.records.publications).toEqual([]);
    expect(first.state.records.agreements[0]!.status).toBe('active');
    expect(first.state.records.intents).toHaveLength(1);
    expect(first.observations.find(o => o.actor === 'A')).toMatchObject({ intent: { verb: 'sleep' }, interrupted: expect.any(String) });
    const second = advanceSocietyWatch(first.state, first.world, f.nowMs + 1000);
    expect(second.state.records.publications).toHaveLength(1);
    expect(second.state.records.agreements[0]!.status).toBe('fulfilled');
  });

  it('shares monetary and action commitments with the old economic protocol', () => {
    const f = preparedCommission();
    expect(promisedCells(f.state, 'B')).toBe(2);
    f.world.bodies.B.cells = 2;
    expect(termsProblem(f.state, f.world, { kind: 'transfer', from: 'B', to: 'C', cells: 1 })).toBe('insufficient_cells');
    expect(termsProblem(f.state, f.world, { kind: 'work', worker: 'A', payer: 'C', cells: 0,
      verb: 'work', room: 'records', units: 1, dueWatch: watchNumber(f.world) + 1 })).toBe('existing_publication_commitment');
  });
});
