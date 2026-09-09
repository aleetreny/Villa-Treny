import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CONDITIONS, genesisState } from '../engine/state';
import { totalCells } from '../engine/economy';
import { advanceScheduledWatch } from '../engine/tick';
import { attempt, type VerbName } from '../engine/verbs';
import { RESIDENTS, type ResidentId } from '../residents';
import { ROOMS, type RoomId } from '../rooms';
import { applySocietyChoice, decodeSocietyChoice, societyChoiceJsonSchema } from './choice';
import { applyCapabilityChoice, capabilityChoiceJsonSchema, capabilityForVerb, decodeCapabilityChoice, toCapabilityAction } from './capabilities';
import { createSocietyState } from './state';
import { prepareSocietyTurn } from './turn';
import { parseSocietyState } from './schema';
import { observeSocietyActions, plannedSocietyActions } from './physical';
import { settleSocietyAgreements } from './economy';
import type { PhysicalObservation, TurnResponse } from './types';

const purpose = { mode: 'replace', goal: 'Discuss an attainable next step.', why: 'I want an explicit agreement.',
  visibility: 'private', steps: [] } as const;
function fixture() {
  const world = genesisState(91);
  for (const { id } of RESIDENTS) {
    world.bodies[id].cells = 20;
    for (const condition of CONDITIONS) world.bodies[id].condition[condition] = 80;
  }
  world.economy.ledger.initialCells = totalCells(world);
  return { world, state: createSocietyState(world, 1000), now: 2000 };
}
type Fixture = ReturnType<typeof fixture>;
function prepare(f: Fixture, actor: ResidentId) {
  return prepareSocietyTurn(f.state, f.world, actor, { nowMs: f.now, generation: 0,
    sequence: f.state.minds[actor].lastAppliedSequence + 1 });
}
function message(actor: ResidentId, to: ResidentId = actor === 'A' ? 'B' : 'A') {
  return { to, text: 'Could we discuss a useful next step?', close: false };
}
function plan(actor: ResidentId, steps: unknown[]) { return { project: { ...purpose, steps }, message: message(actor) }; }
function act(f: Fixture, actor: ResidentId, raw: Record<string, unknown>, version: 2 | 3 = 3): Fixture {
  const result = (version === 3 ? applyCapabilityChoice : applySocietyChoice)(f.state, f.world, prepare(f, actor),
    { ...(!f.state.minds[actor].project ? { project: purpose } : {}), ...raw }, { nowMs: f.now + 1, generation: 0 });
  expect(result.code).toBe('applied'); expect(parseSocietyState(result.state).ok).toBe(true);
  return { state: result.state, world: result.world, now: f.now + 100 };
}
function rejected(f: Fixture, actor: ResidentId, raw: unknown) {
  const before = structuredClone(f);
  const result = applyCapabilityChoice(f.state, f.world, prepare(f, actor), raw, { nowMs: f.now + 1, generation: 0 });
  expect(result.ok).toBe(false); expect(result.state).toBe(f.state); expect(result.world).toBe(f.world); expect(f).toEqual(before);
  return result;
}

describe('protocol 3 capability boundary', () => {
  it('projects every accessible room without changing permanent restrictions or version 2 grammar', () => {
    const f = fixture();
    const restricted: Record<string, readonly RoomId[]> = { eat: ['common'], wash: ['well', 'infirmary', 'washroom'],
      dig: ['face'], grow: ['garden'], cook: ['common', 'kitchen'], charge: ['workshops'] };
    const verbs = ['rest', 'sleep', 'drink', 'work', 'clean', 'inspect', 'repair', 'note', ...Object.keys(restricted)];
    for (const actor of ['A', 'B'] as const) {
      const turn = prepare(f, actor), v2 = societyChoiceJsonSchema(f.state, f.world, turn), untouched = structuredClone(v2);
      const decoder = z.fromJSONSchema(capabilityChoiceJsonSchema(f.state, f.world, turn));
      for (const verb of verbs) for (const { id } of ROOMS) {
        const capability = capabilityForVerb(verb, id);
        const expected = id !== 'breach' && (verb !== 'note' || actor === 'A') && (!restricted[verb] || restricted[verb].includes(id));
        expect(decoder.safeParse(plan(actor, [{ verb: capability, at: id }])).success, `${actor} ${verb} in ${id}`).toBe(expected);
      }
      expect(societyChoiceJsonSchema(f.state, f.world, turn)).toEqual(untouched);
    }
  });

  it('rejects obsolete names and wrong cleaning destinations before canonical translation', () => {
    const f = fixture();
    for (const step of [
      ...['work', 'inspect', 'charge', 'note', 'clean', 'observe'].map(verb => ({ verb, at: 'common' })),
      { verb: 'filter_water', at: 'common' }, { verb: 'clean_space', at: 'well' },
      { verb: 'accrue_two_labor_credits', at: 'common' }, { verb: 'walk_room_and_log_visit' },
      { verb: 'walk_room_and_log_visit', at: 'well', measurements: { water: 100 } },
      { verb: 'diagnose_patient', at: 'infirmary' },
    ]) expect(rejected(f, 'A', plan('A', [step])).code).toBe('unavailable_capability_choice');
    const old = plan('B', [{ verb: 'observe', at: 'common' }]);
    expect(decodeSocietyChoice(f.state, f.world, prepare(f, 'B'), old).ok).toBe(true);
    expect(decodeCapabilityChoice(f.state, f.world, prepare(f, 'B'), old).ok).toBe(false);
    const legacy = act(f, 'B', old, 2);
    expect(legacy.state.minds.B.project?.steps[0].intent.verb).toBe('observe');
    const unchanged = structuredClone(legacy.world);
    expect(attempt(legacy.world, { actor: 'B', verb: 'observe' })).toEqual({ ok: true });
    expect(legacy.world).toEqual(unchanged);
  });

  it.each([
    ['accrue_labor_credit', 'work', 'common', 'B', 1, 0],
    ['walk_room_and_log_visit', 'inspect', 'well', 'B', 1, 0],
    ['accrue_two_labor_credits', 'charge', 'workshops', 'B', 2, 0],
    ['log_stock_register', 'note', 'common', 'A', 1, 0],
    ['filter_water', 'clean', 'well', 'B', 1, 24],
    ['clean_space', 'clean', 'common', 'B', 1, 0],
  ] as const)('%s produces the exact existing %s effect', (capability, canonical, room, actor, credits, water) => {
    const f = fixture(), turn = prepare(f, actor), raw = plan(actor, [{ verb: capability, at: room }]), before = structuredClone(raw);
    const decoded = decodeCapabilityChoice(f.state, f.world, turn, raw);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || decoded.value.project?.mode !== 'replace') throw Error('Expected decoded plan');
    expect(decoded.value.project.steps).toEqual([{ verb: canonical, at: room }]); expect(raw).toEqual(before);
    const actual = structuredClone(f.world), legacy = structuredClone(f.world);
    actual.bodies[actor].room = room; legacy.bodies[actor].room = room;
    const beforeCells = actual.bodies[actor].cells, beforeFacts = structuredClone(actual.bodies[actor].knownFacts);
    const step = decoded.value.project.steps[0];
    const result = attempt(actual, { actor, verb: step.verb });
    expect(result).toEqual(attempt(legacy, { actor, verb: canonical })); expect(actual).toEqual(legacy);
    expect(actual.economy.workCredits[actor] - f.world.economy.workCredits[actor]).toBe(credits);
    expect(actual.economy.stock.water - f.world.economy.stock.water).toBe(water);
    expect(actual.bodies[actor].cells).toBe(beforeCells); expect(actual.bodies[actor].knownFacts).toEqual(beforeFacts);
    if (canonical === 'inspect') expect(result.happening?.text).toBe('The Well was walked through and looked over.');
  });

  it('projects stored actions and terms without mutating them, inventing locations or offering a no-op', () => {
    const stored = { verb: 'clean', at: null, metadata: { stepId: 'old-step' } };
    expect(toCapabilityAction(stored)).toBeNull();
    expect(toCapabilityAction(stored, 'well')).toEqual({ ...stored, verb: 'filter_water' });
    expect(toCapabilityAction({ verb: 'clean', room: 'common', cells: 1.1 })).toEqual({ verb: 'clean_space', room: 'common', cells: 1.1 });
    expect(toCapabilityAction({ verb: 'clean', room: 'invented' })).toBeNull();
    expect(toCapabilityAction({ verb: 'observe', at: 'well' })).toBeNull();
    const projected = toCapabilityAction(stored, 'common')!; projected.metadata.stepId = 'changed';
    expect(stored).toEqual({ verb: 'clean', at: null, metadata: { stepId: 'old-step' } });
  });

  it('preserves full dialogue, amount, evidence and open-message validation before any effect', () => {
    let f = act(fixture(), 'A', { message: message('A') });
    const work = { kind: 'work', role: 'work', cells: 1.1, verb: 'filter_water', room: 'well', units: 1, slackWatches: 0 };
    for (const extra of [
      { deal: { ...work, cells: 1.001 } }, { deal: { ...work, room: 'common' } }, { deal: { ...work, verb: 'clean' } },
      { deal: { ...work, actor: 'A' } }, { deal: { ...work, units: 5 } },
      { deal: work, message: { ...message('B'), close: true } }, { deal: work, message: { ...message('B'), close: undefined } },
      { reflection: { text: 'Invented observation.', refs: ['invented:fact'] } },
    ]) rejected(f, 'B', { project: purpose, message: message('B'), ...extra });
    const pending = prepare(f, 'B');
    f = act(f, 'B', { message: message('B'), deal: work });
    expect(f.state.offers[0].terms).toMatchObject({ kind: 'work', verb: 'clean', room: 'well', cells: 1.1 });
    const duplicate = applyCapabilityChoice(f.state, f.world, pending, { impossible: 'ignored after the first application' },
      { nowMs: f.now, generation: 0 });
    expect(duplicate.code).toBe('already_applied'); expect(duplicate.state).toBe(f.state); expect(duplicate.world).toBe(f.world);
  });

  it.each([2, 3] as const)('executes and pays a version %i work promise once through the unchanged canonical engine', version => {
    let f = act(fixture(), 'A', { message: message('A') }, version);
    f = act(f, 'B', { message: message('B'), deal: { kind: 'work', role: 'work', cells: 1.1,
      verb: version === 3 ? 'walk_room_and_log_visit' : 'inspect', room: 'common', units: 1, slackWatches: 0 } }, version);
    const offer = f.state.offers[0];
    expect(offer.terms).toMatchObject({ verb: 'inspect', cells: 1.1 });
    // The new boundary accepts an incoming legacy agreement by its exact ID;
    // it never rewrites that agreement's terms or extends its deadline.
    f = act(f, 'A', { message: message('A'), deal: { kind: 'accept', offerId: offer.id } }, 3);
    const terms = structuredClone(f.state.agreements[0].terms), agreementId = f.state.agreements[0].id;
    const plans = plannedSocietyActions(f.state, f.world);
    expect(plans.B).toMatchObject({ intent: { actor: 'B', verb: 'inspect' }, at: 'common' });
    const observations: PhysicalObservation[] = [];
    advanceScheduledWatch(f.world, undefined, undefined, undefined, { plans, onAction: observation => observations.push(observation) });
    const observed = observeSocietyActions(f.state, f.world, observations, { nowMs: f.now + 1000 });
    expect(observed.state.agreements[0]).toMatchObject({ terms, progress: 1, status: 'fulfilled' });
    const payments = observed.world.economy.events.filter(event => event.action === `work:${agreementId}`);
    expect(payments).toHaveLength(1);
    expect(payments[0].entries.find(entry => entry.account === 'cells:A')?.delta).toBeCloseTo(-1.1, 12);
    expect(payments[0].entries.find(entry => entry.account === 'cells:B')?.delta).toBeCloseTo(1.1, 12);
    expect(payments[0].entries.reduce((sum, entry) => sum + entry.delta, 0)).toBe(0);
    const ledger = observed.world.economy.ledger;
    expect(totalCells(observed.world)).toBeCloseTo(ledger.initialCells + ledger.minted - ledger.burned - ledger.leaked, 10);
    expect(settleSocietyAgreements(observed.state, observed.world, f.now + 2000).world).toBe(observed.world);
    expect(parseSocietyState(observed.state).ok).toBe(true);
  });

  it('preserves clear verbs, target creditors and empty social plans', () => {
    const f = fixture();
    const steps: Array<{ verb: VerbName; room?: RoomId; at?: RoomId }> = [{ verb: 'go', room: 'garden' }, { verb: 'grow', at: 'garden' }];
    const decoded = decodeCapabilityChoice(f.state, f.world, prepare(f, 'B'), plan('B', steps));
    expect(decoded.ok && (decoded.value.project as Extract<TurnResponse['project'], { mode: 'replace' }>).steps).toEqual(steps);
    expect(decodeCapabilityChoice(f.state, f.world, prepare(f, 'B'), plan('B', [])).ok).toBe(true);
    rejected(f, 'B', plan('B', [{ verb: 'repay', target: 'A' }]));
  });

  it('applies an optional personal appraisal only after a valid reply, including a closing reply, exactly once', () => {
    const f = act(fixture(), 'A', { message: message('A') }), turn = prepare(f, 'B');
    const ref = f.state.conversations[0].turns[0].id;
    const raw = { project: purpose, message: { ...message('B'), close: true },
      appraisal: { axis: 'trust', delta: -1, ref, why: 'I find this request difficult to rely on.' } };
    expect(capabilityChoiceJsonSchema(f.state, f.world, turn).properties).toHaveProperty('appraisal');
    const decoded = decodeCapabilityChoice(f.state, f.world, turn, raw);
    expect(decoded.ok).toBe(true); if (decoded.ok) expect(decoded.value).not.toHaveProperty('appraisal');
    const before = structuredClone(f), result = applyCapabilityChoice(f.state, f.world, turn, raw, { nowMs: f.now + 1, generation: 0 });
    expect(result.code).toBe('applied'); expect(f).toEqual(before);
    expect(result.world.axes.get('BA')!.trust).toBe(f.world.axes.get('BA')!.trust - 1);
    expect(result.world.axes.get('AB')).toEqual(f.world.axes.get('AB'));
    expect(result.world.bodies).toEqual(f.world.bodies); expect(result.world.economy).toEqual(f.world.economy);
    expect(result.state.conversations[0]).toMatchObject({ status: 'closed', appraisedThrough: [-1, 0] });
    expect(result.state.minds.B.memories.at(-1)).toMatchObject({ kind: 'interpretation', refs: [ref] });
    expect(parseSocietyState(result.state).ok).toBe(true);
    const replay = applyCapabilityChoice(result.state, result.world, turn, { impossible: 'new grammar no longer matters' },
      { nowMs: f.now + 2, generation: 0 });
    expect(replay.code).toBe('already_applied'); expect(replay.state).toBe(result.state); expect(replay.world).toBe(result.world);
  });

  it('omitted, unavailable or failed-base appraisals never produce relationship changes', () => {
    const f = act(fixture(), 'A', { message: message('A') }), ref = f.state.conversations[0].turns[0].id;
    const appraisal = { axis: 'affection', delta: 1, ref, why: 'I appreciated the way this was asked.' };
    const quiet = act(f, 'B', { message: { ...message('B'), close: true } });
    expect(quiet.world).toEqual(f.world);
    for (const invalid of [{ ...appraisal, ref: 'invented' }, { ...appraisal, delta: 2 }, { ...appraisal, axis: 'debt' },
      { ...appraisal, target: 'C' }, { ...appraisal, why: '   ' }]) {
      rejected(f, 'B', { project: purpose, message: message('B'), appraisal: invalid });
    }
    rejected(fixture(), 'A', { project: purpose, message: message('A'), appraisal });
    const insufficient = rejected(f, 'B', { project: purpose, message: message('B'), appraisal,
      deal: { kind: 'transfer', direction: 'give', cells: 21 } });
    expect(insufficient.code).toBe('insufficient_cells');
    expect(insufficient.state.conversations[0].appraisedThrough).toBeUndefined();
  });
});
