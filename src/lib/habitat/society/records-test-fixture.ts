// Isolated authored-record fixtures for unit/browser tests. Never a UI fallback.
import { genesisState } from '../engine/state';
import { createSocietyState, watchNumber } from './state';
import { applyRecordOperation, confirmRecordPublication, selectRecordPublication } from './records';
import type { RecordOperation, RecordReference } from './record-types';
import type { ResidentId } from '../residents';
import { RESIDENTS } from '../residents';

export const RECORD_FIXTURE_TIME = Date.parse('2026-09-08T12:00:00Z');
export function recordFixture() {
  const world = genesisState(91);
  for (const { id } of RESIDENTS) world.bodies[id].cells = 20;
  return { world, state: createSocietyState(world, RECORD_FIXTURE_TIME), now: RECORD_FIXTURE_TIME };
}
export type RecordFixture = ReturnType<typeof recordFixture>;
export function recordAct(f: RecordFixture, actor: ResidentId, operation: RecordOperation, preparedRefs: RecordReference[] = []): RecordFixture {
  const cursor = f.state.records.cursors[actor];
  const result = applyRecordOperation(f.state.records, f.world, { actor, sequence: cursor.lastSequence + 1,
    expectedRevision: cursor.revision, nowMs: f.now + 1, preparedRefs }, operation, f.state);
  if (!result.ok) throw new Error(`Fixture record operation failed: ${result.code}`);
  const state = { ...structuredClone(f.state), records: result.records };
  state.minds[actor].lastAppliedSequence = cursor.lastSequence + 1;
  return { world: result.world, state, now: f.now + 100 };
}
/** A trusted publication slot on the next watch; no model can call this API. */
export function publishFixture(f: RecordFixture, actor: ResidentId): RecordFixture {
  const world = structuredClone(f.world); world.watch++;
  if (world.watch === 5) { world.watch = 1; world.day++; }
  const selected = selectRecordPublication(f.state.records, world, actor);
  if (!selected) throw new Error('Fixture publication was not selected');
  const result = confirmRecordPublication(f.state.records, world, { actor, intentId: selected.id,
    watch: watchNumber(world), nowMs: f.now + 1 }, f.state);
  if (!result.ok) throw new Error(`Fixture publication failed: ${result.code}`);
  const state = { ...structuredClone(f.state), records: result.records };
  state.minds[actor].lastPhysicalWatch = watchNumber(world);
  return { world: result.world, state, now: f.now + 100 };
}
export function publicCommissionFixture(cells = 3, visibility: 'public' | 'private' = 'public', audience: 'public' | ResidentId = 'public') {
  let f = recordAct(recordFixture(), 'A', { kind: 'draft', title: 'Filter visit notes',
    text: 'I visited the filter.\nThis is my account, not a water-quality measurement.\n<em>Exact authored text</em>',
    refs: ['observation:public:1'], parent: null, audience: 'public', publish: false },
  [{ id: 'observation:public:1', audience: 'public' }]);
  const draft = f.state.records.drafts[0]!;
  f = recordAct(f, 'B', { kind: 'commission', counterpart: 'A', draftId: draft.id, contentHash: draft.contentHash,
    cells, dueInWatches: 4, audience, visibility });
  return f;
}
export function acceptCommissionFixture(f: RecordFixture): RecordFixture {
  return recordAct(f, 'A', { kind: 'accept', offerId: f.state.records.offers[0]!.id });
}
