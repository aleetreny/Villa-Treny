import { genesisState } from '../../src/lib/habitat/engine/state';
import { createSocietyState } from '../../src/lib/habitat/society/state';
import { societyPublicView } from '../../src/lib/habitat/society/public';
import { isAgencySnapshot, type CognitionStatus } from '../../src/lib/habitat/agency';

export const LIVES_TIME = Date.parse('2026-09-08T12:00:00Z');
export const PRIVATE_GOAL = 'PRIVATE_BROWSER_FIXTURE_GOAL_ONLY';
export const PRIVATE_REASON = 'PRIVATE_BROWSER_FIXTURE_REASON_ONLY';
export const PRIVATE_MEMORY = 'PRIVATE_BROWSER_FIXTURE_MEMORY_ONLY';
export const PUBLIC_GOAL = 'Restore the shared water filter.';
export const UPDATED_GOAL = 'Inspect the filter before arranging replacement materials.';
export const FIRST_MESSAGE = 'Can you inspect the filter with me?';
export const REPLY_MESSAGE = 'I can inspect it, but I cannot promise materials.';
export const NEXT_MESSAGE = 'Then let us inspect it before promising any cells.';

/** Explicitly synthetic history for local browser tests. Public JSON is always
 * produced by the real projection; this is never shipped as a UI fallback. */
export function livesFixture(updated = false) {
  const world = genesisState(91); world.day = 106; world.watch = 3;
  const state = createSocietyState(world, LIVES_TIME - 3_600_000);
  state.revision = updated ? 5 : 4; state.nextId = 100;
  for (const id of ['A', 'B', 'C'] as const) {
    state.minds[id].lastAttemptAtMs = LIVES_TIME - 1_000;
    state.minds[id].lastSuccessAtMs = LIVES_TIME - 1_000;
  }
  if (updated) state.minds.A.lastSuccessAtMs = LIVES_TIME + 1_000;
  state.minds.A.project = { id: 'project:1', goal: updated ? UPDATED_GOAL : PUBLIC_GOAL, why: PRIVATE_REASON, visibility: 'public',
    status: 'active', createdAtMs: LIVES_TIME - 3_000,
    steps: [{ id: 'step:1', intent: { actor: 'A', verb: 'inspect' }, at: 'well', status: 'done', evidenceId: 'physical:1' },
      { id: 'step:2', intent: { actor: 'A', verb: 'repair' }, at: 'well', status: 'pending', evidenceId: null }] };
  state.minds.B.project = { id: 'project:2', goal: PRIVATE_GOAL, why: PRIVATE_REASON, visibility: 'private',
    status: 'active', createdAtMs: LIVES_TIME - 3_000,
    steps: [{ id: 'step:3', intent: { actor: 'B', verb: 'observe' }, at: null, status: 'pending', evidenceId: null }] };
  state.minds.A.memories.push({ id: 'memory:1', kind: 'interpretation', text: PRIVATE_MEMORY,
    refs: [], atWatch: 426, createdAtMs: LIVES_TIME - 1_000, importance: 1, source: null });
  state.conversations = [
    { id: 'conversation:1', participants: ['A', 'B'], revision: updated ? 3 : 2, nextSpeaker: updated ? 'B' : 'A',
      status: 'open', createdAtMs: LIVES_TIME - 2_000, expiresAtMs: LIVES_TIME + 3_600_000,
      turns: [{ id: 'turn:1', index: 0, speaker: 'A', text: FIRST_MESSAGE, atMs: LIVES_TIME - 2_000 },
        { id: 'turn:2', index: 1, speaker: 'B', text: REPLY_MESSAGE, atMs: LIVES_TIME - 1_000 },
        ...(updated ? [{ id: 'turn:3', index: 2, speaker: 'A' as const, text: NEXT_MESSAGE, atMs: LIVES_TIME + 1_000 }] : [])] },
    { id: 'conversation:2', participants: ['D', 'C'], revision: 2, nextSpeaker: null, status: 'closed',
      createdAtMs: LIVES_TIME - 5_000, expiresAtMs: LIVES_TIME + 3_600_000,
      turns: [{ id: 'turn:4', index: 0, speaker: 'D', text: 'Three cells for two recorded repairs?', atMs: LIVES_TIME - 5_000 },
        { id: 'turn:5', index: 1, speaker: 'C', text: 'I accept that exact offer.', atMs: LIVES_TIME - 4_000 }] },
  ];
  state.offers = [{ id: 'offer:1', conversationId: 'conversation:1', proposer: 'B', counterpart: 'A',
    terms: { kind: 'loan', from: 'B', to: 'A', cells: 2, dueDay: 110 }, status: 'open',
    expiresAtWatch: 433, replaces: null, createdAtMs: LIVES_TIME - 1_000, acceptedAtMs: null },
    { id: 'offer:2', conversationId: 'conversation:2', proposer: 'D', counterpart: 'C',
      terms: { kind: 'work', worker: 'C', payer: 'D', cells: 3, verb: 'repair', room: 'workshops', units: 2, dueWatch: 435 },
      status: 'accepted', expiresAtWatch: 433, replaces: null, createdAtMs: LIVES_TIME - 5_000, acceptedAtMs: LIVES_TIME - 4_000 }];
  state.agreements = [{ id: 'agreement:1', offerId: 'offer:2', terms: { kind: 'work', worker: 'C', payer: 'D',
    cells: 3, verb: 'repair', room: 'workshops', units: 2, dueWatch: 435 }, status: 'active', progress: 1,
    acceptedAtMs: LIVES_TIME - 4_000, acceptedAtWatch: 426, acceptedAfterEventSequence: 0,
    completedAtMs: null, debtId: null, evidenceIds: ['physical:repair:1'] }];
  const agency = societyPublicView(state);
  if (!isAgencySnapshot(agency)) throw new Error('Synthetic public Lives fixture no longer matches its real API contract');
  const cognition: CognitionStatus = { health: 'degraded', successfulLastWatch: 3, total: 25, neverThought: 22,
    lastSuccessfulThoughtAtMs: updated ? LIVES_TIME + 1_000 : LIVES_TIME - 1_000,
    nextOpportunityAtMs: LIVES_TIME + 180_000, pendingResidents: ['D'], waitingForReply: updated ? ['B'] : ['A'], lastErrorCode: null };
  return { agency, cognition };
}
