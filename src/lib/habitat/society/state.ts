import { RESIDENTS, type ResidentId } from '../residents';
import type { WorldState } from '../engine/state';
import { emptyRecordsState } from './record-schema';
import { emptyRetrievalState } from './retrieval-state';
import { SOCIETY_LIMITS as L, SOCIETY_VERSION, type Evidence, type SocietyState } from './types';

export function watchNumber(world: Pick<WorldState, 'day' | 'watch'>): number {
  return world.day * 4 + world.watch - 1;
}
export function createSocietyState(world: WorldState, nowMs: number): SocietyState {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError('Invalid society timestamp');
  const minds = {} as SocietyState['minds'];
  for (const { id } of RESIDENTS) minds[id] = { id, revision: 0,
      lastAttemptAtMs: null, lastSuccessAtMs: null, lastAppliedSequence: -1,
      lastPhysicalWatch: watchNumber(world) - 1, project: null, memories: [] };
  return { version: SOCIETY_VERSION, revision: 0, nextId: 0, createdAtMs: nowMs, minds,
    conversations: [], offers: [], agreements: [], records: emptyRecordsState(), retrieval: emptyRetrievalState() };
}
/** Helpers below mutate only a private draft owned by a pure public operation. */
export function nextSocietyId(state: SocietyState, kind: string): string { return `${kind}:${state.nextId++}`; }
export function addEvidence(state: SocietyState, actor: ResidentId, entry: Evidence): void {
  const m = state.minds[actor];
  if (m.memories.some((e) => e.id === entry.id)) return;
  m.memories.push(entry);
  m.memories = m.memories.slice(-L.memories);
  m.revision += 1;
}
export function evidence(state: SocietyState, actor: ResidentId, world: WorldState, nowMs: number,
  kind: Evidence['kind'], text: string, refs: string[] = [], source: ResidentId | null = null, importance = 3): string {
  const id = nextSocietyId(state, 'memory');
  addEvidence(state, actor, { id, kind, text: text.slice(0, 400), refs: refs.slice(0, 6),
    atWatch: watchNumber(world), createdAtMs: nowMs, importance, source });
  return id;
}
export function expireDraft(state: SocietyState, world: WorldState, nowMs: number): boolean {
  let changed = false;
  for (const c of state.conversations) {
    if (c.status !== 'open' || c.expiresAtMs > nowMs) continue;
    c.status = 'expired'; c.nextSpeaker = null; c.revision += 1; changed = true;
    for (const p of c.participants) evidence(state, p, world, nowMs, 'observation',
      'The conversation expired without another reply. Silence did not accept any terms.', [c.id]);
  }
  for (const o of state.offers) {
    if (o.status !== 'open') continue;
    const c = state.conversations.find((c) => c.id === o.conversationId);
    if (o.expiresAtWatch > watchNumber(world) && c?.status === 'open') continue;
    o.status = 'expired'; changed = true;
    for (const p of [o.proposer, o.counterpart]) evidence(state, p, world, nowMs, 'observation', 'The offer expired without acceptance.', [o.id]);
  }
  return changed;
}
export function expireSocietyState(state: SocietyState, world: WorldState, nowMs: number): SocietyState {
  const next = structuredClone(state);
  if (!expireDraft(next, world, nowMs)) return state;
  next.revision += 1;
  return next;
}
/** Calling a provider is observable even if it later fails. It is not a thought. */
export function markSocietyAttempt(state: SocietyState, actor: ResidentId, nowMs: number): SocietyState {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError('Invalid attempt timestamp');
  if ((state.minds[actor].lastAttemptAtMs ?? -1) >= nowMs) return state;
  const next = structuredClone(state);
  next.minds[actor].lastAttemptAtMs = nowMs; next.revision += 1;
  return next;
}
/** Closed history is bounded here; the runtime may archive immutable results. */
export function makeRoom<T>(items: T[], limit: number, canRemove: (item: T) => boolean): boolean {
  while (items.length >= limit) {
    const index = items.findIndex(canRemove);
    if (index < 0) return false;
    items.splice(index, 1);
  }
  return true;
}
