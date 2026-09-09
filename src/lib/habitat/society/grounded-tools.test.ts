import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RESIDENTS, type ResidentId } from '../residents';
import { ROOMS } from '../rooms';
import { CONDITIONS, genesisState } from '../engine/state';
import { attempt, VERBS } from '../engine/verbs';
import { totalCells } from '../engine/economy';
import { advanceScheduledWatch } from '../engine/tick';
import { createSocietyState, watchNumber } from './state';
import { applySocietyTurn, prepareSocietyTurn } from './turn';
import { parseSocietyState, parseTurnResponse, societyTurnJsonSchema } from './schema';
import { minimumWorkDeadline, settleSocietyAgreements } from './economy';
import { observeSocietyActions, plannedSocietyActions } from './physical';
import { PLANNABLE_VERBS, type OfferTerms, type PhysicalObservation, type PlannedAction, type SocietyResult, type TurnResponse } from './types';

function fixture() {
  const world = genesisState(91);
  for (const { id } of RESIDENTS) {
    world.bodies[id].cells = 20;
    for (const key of CONDITIONS) world.bodies[id].condition[key] = 100;
  }
  world.economy.ledger.initialCells = totalCells(world);
  return { world, state: createSocietyState(world, 1000) };
}
type Fixture = ReturnType<typeof fixture>;
function prepare(f: Fixture, actor: ResidentId, nowMs = 2000) {
  return prepareSocietyTurn(f.state, f.world, actor, { nowMs, generation: 0, sequence: f.state.minds[actor].lastAppliedSequence + 1 });
}
function apply(f: Fixture, actor: ResidentId, response: TurnResponse, nowMs = 2000) {
  return applySocietyTurn(f.state, f.world, prepare(f, actor, nowMs), response, { nowMs: nowMs + 1, generation: 0 });
}
function accepted(result: SocietyResult): Fixture {
  expect(result.ok, result.code).toBe(true);
  expect(parseSocietyState(result.state).ok).toBe(true);
  return { state: result.state, world: result.world };
}
const plan = (step: unknown) => ({ project: { mode: 'replace', goal: 'Check the named place.', why: 'Resolve an uncertainty.',
  visibility: 'public', steps: [step] } });
function grammar(f: Fixture, actor: ResidentId) { return z.fromJSONSchema(societyTurnJsonSchema(f.state, f.world, prepare(f, actor))); }
function proposal(f: Fixture, units: number, dueWatch: number, verb: 'inspect' | 'grow' = 'inspect') {
  const terms: OfferTerms = { kind: 'work', worker: 'B', payer: 'A', cells: 2.3, verb, room: verb === 'grow' ? 'garden' : 'library', units, dueWatch };
  return apply(f, 'A', { message: { to: 'B', text: 'Will you do this work for the agreed total?' },
    offer: { terms, expiresInWatches: 4 } });
}
function accept(f: Fixture, nowMs = 3000) {
  return apply(f, 'B', { message: { to: 'A', text: 'I accept the exact work and total payment.' },
    respond: { offerId: f.state.offers.at(-1)!.id, decision: 'accept' } }, nowMs);
}
function advance(f: Fixture, nowMs: number): Fixture {
  const plans = Object.fromEntries(RESIDENTS.map(({ id }) => [id,
    { stepId: `test:${id}`, intent: { actor: id, verb: 'observe' }, at: f.world.bodies[id].room }])) as Partial<Record<ResidentId, PlannedAction>>;
  Object.assign(plans, plannedSocietyActions(f.state, f.world));
  const observations: PhysicalObservation[] = [];
  advanceScheduledWatch(f.world, undefined, undefined, undefined, { plans, onAction: (o) => observations.push(o) });
  return observeSocietyActions(f.state, f.world, observations, { nowMs });
}

describe('grounded physical capabilities', () => {
  it('matches permanent engine constraints across every accessible room, without removing recoverable resource actions', () => {
    const f = fixture();
    f.world.economy.stock = { produce: 20, meals: 20, water: 100, materials: 10 };
    for (const actor of ['A', 'B'] as const) {
      const decoder = grammar(f, actor);
      for (const verb of PLANNABLE_VERBS.filter((v) => v !== 'go' && v !== 'repay')) {
        expect(decoder.safeParse(plan({ verb })).success, `${actor} ${verb} needs an explicit place`).toBe(false);
        for (const room of ROOMS) {
          f.world.bodies[actor].room = room.id;
          const actual = room.id !== 'breach' && !VERBS[verb].requires?.(f.world, { actor, verb });
          expect(decoder.safeParse(plan({ verb, at: room.id })).success, `${actor} ${verb} at ${room.id}`).toBe(actual);
        }
      }
    }
    f.world.economy.stock.water = 0; f.world.economy.stock.materials = 0;
    const empty = grammar(f, 'B');
    expect(empty.safeParse(plan({ verb: 'grow', at: 'garden' })).success).toBe(true);
    expect(empty.safeParse(plan({ verb: 'repair', at: 'library' })).success).toBe(true);
    expect(empty.safeParse(plan({ verb: 'clean', at: 'library' })).success).toBe(true);
  });

  it('offers note only to its actual operator and keeps historical canonical steps readable', () => {
    const f = fixture();
    for (const { id } of RESIDENTS) {
      expect(grammar(f, id).safeParse(plan({ verb: 'note', at: 'library' })).success).toBe(id === 'A');
      const context = JSON.parse(prepare(f, id).prompt.slice(prepare(f, id).prompt.lastIndexOf('\n{') + 1));
      expect(context.affordances.physicalVerbs.includes('note')).toBe(id === 'A');
    }
    const historical = plan({ verb: 'inspect' });
    expect(parseTurnResponse(historical).ok).toBe(true);
    const applied = applySocietyTurn(f.state, f.world, prepare(f, 'A'), historical, { nowMs: 2001, generation: 0 });
    expect(applied.ok).toBe(true); expect(parseSocietyState(applied.state).ok).toBe(true);
  });

  it('supplies the current location and describes real effects rather than imagined sensors or money', () => {
    const f = fixture(); f.world.bodies.N.room = 'infirmary';
    const job = prepare(f, 'N'), context = JSON.parse(job.prompt.slice(job.prompt.lastIndexOf('\n{') + 1));
    expect(context.self.room).toBe('infirmary');
    expect(context.affordances.verbMeaning).toContain('not sensor readings');
    expect(context.affordances.verbMeaning).toContain('not immediate cells');
    expect(context.affordances.verbMeaning).toContain('not arbitrary writing');
    f.world.bodies.N.room = 'well';
    expect(attempt(f.world, { actor: 'N', verb: 'inspect' }).happening).toMatchObject({ room: 'well', text: 'The Well was walked through and looked over.' });
    f.world.bodies.N.room = 'workshops'; const cells = f.world.bodies.N.cells, credits = f.world.economy.workCredits.N;
    expect(attempt(f.world, { actor: 'N', verb: 'charge' }).ok).toBe(true);
    expect(f.world.bodies.N.cells).toBe(cells); expect(f.world.economy.workCredits.N - credits).toBe(2);
    expect(attempt(f.world, { actor: 'N', verb: 'note' }).ok).toBe(false);
    expect(attempt(f.world, { actor: 'A', verb: 'note' }).happening?.text).toBe('The current store totals and working-room register were written down.');
  });
});

describe('work deadlines count actual available physical slots', () => {
  it('rejects four units due after only two available watches before publishing any offer or message', () => {
    const f = fixture(), before = structuredClone(f);
    const result = proposal(f, 4, watchNumber(f.world) + 1);
    expect(result.code).toBe('invalid_work_deadline');
    expect(result.state).toBe(f.state); expect(result.world).toBe(f.world); expect(f).toEqual(before);
  });

  it('rechecks a previously feasible offer at acceptance after time has passed', () => {
    let f = fixture(); const due = minimumWorkDeadline(f.state, f.world, 'B', 4);
    f = accepted(proposal(f, 4, due));
    f = advance(f, 3000); f = advance(f, 4000);
    const before = structuredClone(f), result = accept(f, 5000);
    expect(f.state.offers[0].expiresAtWatch).toBeGreaterThan(watchNumber(f.world));
    expect(result.code).toBe('invalid_work_deadline'); expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
    expect(f).toEqual(before); expect(f.state.agreements).toHaveLength(0);
  });

  it('includes the final due watch, travels within the productive slot and pays the exact negotiated total once', () => {
    let f = fixture(); f.world.bodies.B.room = 'bridge';
    const due = minimumWorkDeadline(f.state, f.world, 'B', 4);
    expect(due).toBe(watchNumber(f.world) + 3);
    f = accepted(accept(accepted(proposal(f, 4, due))));
    const agreementId = f.state.agreements[0].id;
    for (let i = 0; i < 4; i++) {
      f = advance(f, 4000 + i * 1000);
      expect(f.state.agreements[0].progress).toBe(i + 1);
      expect(f.world.bodies.B.room).toBe('library');
      expect(f.state.agreements[0].status).toBe(i === 3 ? 'fulfilled' : 'active');
    }
    const payment = f.world.economy.events.filter((event) => event.action === `work:${agreementId}`);
    expect(payment).toHaveLength(1);
    expect(f.state.agreements[0].terms.cells).toBe(2.3);
    expect(payment[0].entries.find((entry) => entry.account === 'cells:A')?.delta).toBeCloseTo(-2.3, 12);
    expect(payment[0].entries.find((entry) => entry.account === 'cells:B')?.delta).toBeCloseTo(2.3, 12);
    expect(payment[0].entries.reduce((sum, entry) => sum + entry.delta, 0)).toBe(0);
    const ledger = f.world.economy.ledger;
    expect(totalCells(f.world) - (ledger.initialCells + ledger.minted - ledger.burned - ledger.leaked)).toBeCloseTo(0, 10);
    expect(settleSocietyAgreements(f.state, f.world, 9000).world).toBe(f.world);
  });

  it('does not sell an already observed current slot, while one untouched current slot can finish a one-unit job', () => {
    const f = fixture(), stamp = watchNumber(f.world);
    expect(minimumWorkDeadline(f.state, f.world, 'B', 1)).toBe(stamp);
    const acceptedNow = accepted(accept(accepted(proposal(f, 1, stamp, 'grow'))));
    const result = advance(acceptedNow, 4000);
    expect(result.state.agreements[0]).toMatchObject({ progress: 1, status: 'fulfilled' });
    const spent = fixture(), intent = { actor: 'B' as const, verb: 'rest' as const };
    const observed = observeSocietyActions(spent.state, spent.world, [{ actor: 'B', day: spent.world.day, watch: spent.world.watch,
      intent, outcome: attempt(spent.world, intent) }], { nowMs: 1500 });
    expect(minimumWorkDeadline(observed.state, observed.world, 'B', 1)).toBe(stamp + 1);
    expect(proposal(observed, 1, stamp).code).toBe('invalid_work_deadline');
  });
});
