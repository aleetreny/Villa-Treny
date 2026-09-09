import { RESIDENTS, RESIDENT_BY_ID, type ResidentId } from '../residents';
import type { WorldState } from '../engine/state';
import type { Outcome } from '../engine/verbs';
import { advanceScheduledWatch } from '../engine/tick';
import { evidence, watchNumber } from './state';
import { plannedSocietyActions, observeSocietyActions } from './physical';
import { selectRecordPublication, confirmRecordPublication, settleRecordCommissions } from './records';
import type { PhysicalObservation, SocietyState } from './types';

export type RecordPhysicalObservation = {
  actor: ResidentId; day: number; watch: number; kind: 'record_publication';
  intentId: string; publicationId: string | null; outcome: Outcome;
};

/** The runtime commits this result atomically with its unique physical-run ID.
 * Publication is executed by the engine's one-slot hook, never afterwards as
 * an extra action. Models cannot supply these trusted observations. */
export function advanceSocietyWatch(state: SocietyState, world: WorldState, nowMs: number) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError('Invalid physical timestamp');
  let next = structuredClone(state);
  const physical = structuredClone(world), day = world.day, watch = world.watch;
  const observations: PhysicalObservation[] = [], publications: RecordPhysicalObservation[] = [];
  const candidates: Partial<Record<ResidentId, { intentId: string }>> = {};
  for (const { id } of RESIDENTS) {
    if (next.minds[id].lastPhysicalWatch >= watchNumber(world)) continue;
    const candidate = selectRecordPublication(next.records, physical, id);
    if (candidate) candidates[id] = { intentId: candidate.id };
  }
  advanceScheduledWatch(physical, undefined, undefined, undefined, {
    plans: plannedSocietyActions(next, physical), publications: candidates,
    publishRecord: (actor, intentId, current) => {
      const stamp = watchNumber(current);
      const published = confirmRecordPublication(next.records, current, { actor, intentId, watch: stamp, nowMs }, next);
      next.records = published.records;
      Object.assign(current, published.world);
      const publication = published.ok ? next.records.publications.find((p) => published.createdIds.includes(p.id)) : undefined;
      const draft = publication ? next.records.drafts.find((d) => d.id === publication.draftId) : undefined;
      const success = Boolean(publication && draft);
      // The actor knows their own text. Public history only names a title when
      // its exact publication is public, never for a private/shared draft.
      const ownDescription = success ? `Published ${publication!.id}: ${draft!.title}. The text remains an authored claim.`
        : `Publication refused: ${published.code}.`;
      evidence(next, actor, current, nowMs, 'observation', ownDescription,
        publication ? [publication.id] : [intentId], null, success ? 4 : 5);
      next.minds[actor].lastPhysicalWatch = stamp;
      next.revision += 1;
      const outcome: Outcome = success ? { ok: true, happening: {
        room: current.bodies[actor].room, who: [actor], kind: 'note',
        text: publication!.audience === 'public'
          ? `${RESIDENT_BY_ID[actor].name.split(' ')[0]} published “${draft!.title}”. Its contents are the author's claims.`
          : `${RESIDENT_BY_ID[actor].name.split(' ')[0]} completed a privately shared written record.`,
      } } : { ok: false, refused: published.code };
      publications.push({ actor, day, watch, kind: 'record_publication', intentId,
        publicationId: publication?.id ?? null, outcome: structuredClone(outcome) });
      return outcome;
    },
    onAction: (observation) => observations.push(observation),
  });
  const observed = observeSocietyActions(next, physical, observations, { nowMs });
  next = observed.state;
  const settled = settleRecordCommissions(next.records, observed.world, nowMs);
  if (settled.records !== next.records) { next.records = settled.records; next.revision += 1; }
  return { state: next, world: settled.world, observations: [...observations, ...publications] };
}
