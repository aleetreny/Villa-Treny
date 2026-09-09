import { RESIDENTS, type ResidentId } from '../residents';
import type { WorldState } from '../engine/state';
import type { Intent } from '../engine/verbs';
import { settleWorkDraft } from './economy';
import { evidence, expireDraft, watchNumber } from './state';
import type { PhysicalObservation, PlannedAction, SocietyState } from './types';

/** Pure selection, not execution. The runtime traverses `at` within the watch,
 * then asks the existing engine to execute exactly one physical action. */
export function plannedSocietyActions(state: SocietyState, world: WorldState): Partial<Record<ResidentId, PlannedAction>> {
  const chosen: Partial<Record<ResidentId, PlannedAction>> = {};
  const stamp = watchNumber(world);
  for (const { id } of RESIDENTS) {
    const m = state.minds[id];
    if (m.lastPhysicalWatch >= stamp) continue;
    const project = m.project;
    const step = project?.status === 'active' ? project.steps.find((p) => p.status !== 'done') : undefined;
    if (step?.status === 'pending') { chosen[id] = { stepId: step.id, intent: { ...step.intent }, at: step.at }; continue; }
    // An explicitly accepted work promise supplies its own executable plan if
    // the worker has no other runnable personal step. A refusal creates none.
    const commitment = state.agreements.find((a) => a.status === 'active' && a.terms.kind === 'work'
      && a.terms.worker === id && a.progress < a.terms.units && a.terms.dueWatch >= stamp);
    if (commitment?.terms.kind === 'work') chosen[id] = { stepId: `${commitment.id}:${commitment.progress}`,
      intent: { actor: id, verb: commitment.terms.verb }, at: commitment.terms.room };
  }
  return chosen;
}
function sameIntent(a: Intent, b: Intent): boolean {
  return a.actor === b.actor && a.verb === b.verb && a.room === b.room && a.target === b.target && a.fact === b.fact;
}
/** Trusted outcomes must be observed in the same atomic persistence cut as the
 * physical world. Models cannot call this API or supply PhysicalObservation. */
export function observeSocietyActions(state: SocietyState, world: WorldState, observations: readonly PhysicalObservation[],
  options: { nowMs: number }): { state: SocietyState; world: WorldState } {
  if (!Number.isSafeInteger(options.nowMs) || options.nowMs < 0) throw new RangeError('Invalid observation timestamp');
  const next = structuredClone(state), physical = structuredClone(world);
  let changed = expireDraft(next, physical, options.nowMs);
  for (const o of observations) {
    if (!next.minds[o.actor] || o.actor !== o.intent.actor || !Number.isInteger(o.day) || !Number.isInteger(o.watch)
      || o.watch < 1 || o.watch > 4 || o.day < 0) continue;
    const stamp = watchNumber(o), m = next.minds[o.actor];
    if (stamp <= m.lastPhysicalWatch || stamp > watchNumber(world)) continue;
    m.lastPhysicalWatch = stamp; changed = true;
    const physicalRef = `physical:${o.day}:${o.watch}:${o.actor}`;
    const description = o.interrupted ? `Planned activity interrupted: ${o.interrupted}. Actual action: ${o.intent.verb}.`
      : o.outcome.ok ? o.outcome.happening?.text ?? `The engine completed ${o.intent.verb}.`
        : `The engine refused ${o.intent.verb}: ${o.outcome.refused ?? 'unavailable'}.`;
    const memoryId = evidence(next, o.actor, physical, options.nowMs, 'observation', description, [physicalRef], null, o.outcome.ok ? 3 : 5);
    m.memories.at(-1)!.atWatch = stamp;
    // A real shared outcome belongs to its participants, even when their own
    // action this watch happened earlier. Do not consume their physical slot.
    if (o.outcome.ok && o.outcome.happening) for (const participant of new Set(o.outcome.happening.who)) {
      if (participant === o.actor || !next.minds[participant]
        || next.minds[participant].memories.some((entry) => entry.refs.includes(physicalRef))) continue;
      evidence(next, participant, physical, options.nowMs, 'observation', o.outcome.happening.text, [physicalRef], o.actor, 4);
      next.minds[participant].memories.at(-1)!.atWatch = stamp;
    }
    const project = m.project;
    if (project?.status === 'active' && !o.interrupted) {
      const step = project.steps.find((p) => p.status !== 'done');
      if (step?.status === 'pending' && step.id === o.stepId && sameIntent(step.intent, o.intent)
        && (!o.outcome.ok || !step.at || (o.actualRoom ?? o.outcome.happening?.room ?? physical.bodies[o.actor].room) === step.at)) {
        step.status = o.outcome.ok ? 'done' : 'failed'; step.evidenceId = memoryId;
        if (project.steps.every((p) => p.status === 'done')) {
          // This proves execution of the plan, not a semantic interpretation of
          // an arbitrary goal. Public projection calls this "steps_finished".
          project.status = 'completed';
          evidence(next, o.actor, physical, options.nowMs, 'observation',
            `All planned steps finished for: ${project.goal}. The broader goal has not been independently assessed.`,
            project.steps.map((p) => p.evidenceId!).slice(-6), null, 4);
        }
      }
    }
    if (!o.outcome.ok) continue;
    const event = physical.economy.events.find((e) => e.actor === o.actor && e.day === o.day && e.watch === o.watch
      && e.action === o.intent.verb && e.entries.some((entry) => entry.account === `credits:${o.actor}` && entry.delta > 0));
    if (!event) continue; // Narrated success alone cannot earn negotiated wages.
    const eligible = next.agreements.find((a) => a.status === 'active' && a.terms.kind === 'work' && a.terms.worker === o.actor
      && a.terms.verb === o.intent.verb && a.terms.room === event.room && a.acceptedAtWatch <= stamp && a.acceptedAfterEventSequence <= event.sequence
      && a.terms.dueWatch >= stamp && a.progress < a.terms.units);
    if (eligible) { eligible.progress += 1; eligible.evidenceIds.push(physicalRef); }
  }
  changed = settleWorkDraft(next, physical, options.nowMs) || changed;
  if (!changed) return { state, world };
  next.revision += 1;
  return { state: next, world: physical };
}
