import { describe, expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { closeEconomyDay, totalCells } from '../engine/economy';
import { attempt } from '../engine/verbs';
import type { ResidentId } from '../residents';
import { applySocietyTurn, createSocietyState, observeSocietyActions, plannedSocietyActions,
  prepareSocietyTurn, settleSocietyAgreements, watchNumber, type OfferTerms, type TurnResponse } from './index';

function fixture() {
  const world = genesisState(41);
  expect(world.bodies.B.cells).toBe(17);
  return { world, state: createSocietyState(world, 1000), time: 2000 };
}
type Fixture = ReturnType<typeof fixture>;
function turn(f: Fixture, actor: ResidentId, raw: TurnResponse, expected = 'applied') {
  const job = prepareSocietyTurn(f.state, f.world, actor, { nowMs: ++f.time, generation: 0,
    sequence: f.state.minds[actor].lastAppliedSequence + 1 });
  const result = applySocietyTurn(f.state, f.world, job, raw, { nowMs: ++f.time, generation: 0 });
  expect(result.code).toBe(expected);
  if (result.ok) { f.state = result.state; f.world = result.world; }
  return result;
}
function offer(f: Fixture, terms: OfferTerms, actor: ResidentId = 'B', other: ResidentId = 'A', expected = 'applied') {
  return turn(f, actor, { message: { to: other, text: 'Do you agree to these exact terms?' },
    offer: { terms, expiresInWatches: 2 } }, expected);
}
function accept(f: Fixture, actor: ResidentId = 'A', other: ResidentId = 'B', expected = 'applied') {
  return turn(f, actor, { message: { to: other, text: 'I accept those exact terms.' },
    respond: { offerId: f.state.offers.at(-1)!.id, decision: 'accept' } }, expected);
}
function transfer(f: Fixture, cells: number) {
  offer(f, { kind: 'transfer', from: 'B', to: 'A', cells }); accept(f);
}
function available(f: Fixture): number {
  const job = prepareSocietyTurn(f.state, f.world, 'B', { nowMs: ++f.time, generation: 0,
    sequence: f.state.minds.B.lastAppliedSequence + 1 });
  return JSON.parse(job.prompt.slice(job.prompt.indexOf('\n') + 1)).self.maxSpendableCells;
}
function expectConserved(f: Fixture, total: number) {
  expect(totalCells(f.world)).toBeCloseTo(total, 12);
  expect(Object.values(f.world.bodies).every((body) => body.cells >= 0)).toBe(true);
  for (const event of f.world.economy.events.filter((event) => /^(agreement|work):/.test(event.action))) {
    expect(event.entries.reduce((sum, entry) => sum + entry.delta, 0)).toBeCloseTo(0, 12);
  }
}
function work(f: Fixture, cells: number) {
  offer(f, { kind: 'work', worker: 'A', payer: 'B', cells, verb: 'grow', room: 'garden', units: 1,
    dueWatch: watchNumber(f.world) + 3 }); accept(f);
}

describe('consented decimal money at actual affordability boundaries', () => {
  it.each([1.1, 0.1, 0.01])('reports the full remaining cents after a %s-cell transfer', (cells) => {
    const f = fixture(), total = totalCells(f.world);
    transfer(f, cells);
    expect(available(f)).toBe((1700 - Math.round(cells * 100)) / 100);
    expectConserved(f, total);
  });

  it.each([0.1, 0.01])('can transfer every remaining cent after two accepted %s-cell payments', (cells) => {
    const f = fixture(), total = totalCells(f.world), ledger = structuredClone(f.world.economy.ledger);
    transfer(f, cells); transfer(f, cells);
    const remaining = (1700 - 2 * Math.round(cells * 100)) / 100;
    expect(f.world.bodies.B.cells).toBeLessThan(remaining); // Real accumulated binary roundoff.
    expect(available(f)).toBe(remaining);
    transfer(f, remaining);
    expect(f.world.bodies.B.cells).toBe(0);
    expect(f.world.bodies.A.cells).toBeCloseTo(29, 12);
    expect(f.world.economy.ledger).toEqual(ledger);
    expectConserved(f, total);
  });

  it('accepts a counterpart loan request for the exact remaining balance and records real repayments', () => {
    const f = fixture(), total = totalCells(f.world);
    transfer(f, 0.1); transfer(f, 0.1);
    turn(f, 'B', { message: { to: 'A', text: 'Let us end this exchange.', close: true } });
    offer(f, { kind: 'loan', from: 'B', to: 'A', cells: 16.8, dueDay: f.world.day + 1 }, 'A', 'B');
    accept(f, 'B', 'A');
    expect(f.world.bodies.B.cells).toBe(0);
    expect(f.world.economy.debts.at(-1)).toMatchObject({ principal: 16.8, remaining: 16.8, status: 'open' });
    for (let i = 0; i < 9; i++) expect(attempt(f.world, { actor: 'A', verb: 'repay', target: 'B' }).ok).toBe(true);
    const settled = settleSocietyAgreements(f.state, f.world, ++f.time);
    f.state = settled.state; f.world = settled.world;
    expect(f.world.economy.debts.at(-1)).toMatchObject({ remaining: 0, status: 'paid' });
    expect(f.state.agreements.at(-1)!.status).toBe('fulfilled');
    expectConserved(f, total);
  });

  it('keeps the complete 0.20 available after reserving a consented 16.80-cell work payment', () => {
    const f = fixture(), total = totalCells(f.world);
    work(f, 16.8);
    expect(available(f)).toBe(0.2);
    transfer(f, 0.2);
    expect(available(f)).toBe(0);
    expect(f.state.agreements[0]).toMatchObject({ status: 'active', terms: { cells: 16.8 } });
    expectConserved(f, total);
  });

  it.each([
    { payment: 16.3, status: 'fulfilled' },
    { payment: 16.31, status: 'payment_due' },
  ])('records actual work as $status when its payment is $payment cells', ({ payment, status }) => {
    const f = fixture(), total = totalCells(f.world);
    transfer(f, 0.1); transfer(f, 0.1); work(f, payment);
    f.world.bodies.B.room = 'common';
    expect(attempt(f.world, { actor: 'B', verb: 'eat' }).ok).toBe(true);
    expect(f.world.bodies.B.cells).toBeLessThan(16.3);
    const workerBefore = f.world.bodies.A.cells;
    const plan = plannedSocietyActions(f.state, f.world).A!;
    f.world.bodies.A.room = plan.at!;
    const outcome = attempt(f.world, plan.intent);
    expect(outcome.ok).toBe(true);
    const observation = { actor: 'A' as const, day: f.world.day, watch: f.world.watch, intent: plan.intent, outcome, stepId: plan.stepId };
    const result = observeSocietyActions(f.state, f.world, [observation], { nowMs: ++f.time });
    f.state = result.state; f.world = result.world;
    expect(f.state.agreements.at(-1)).toMatchObject({ status, progress: 1 });
    expect(f.world.bodies.A.cells).toBeCloseTo(workerBefore + (status === 'fulfilled' ? payment : 0), 12);
    if (status === 'fulfilled') expect(f.world.bodies.B.cells).toBe(0);
    const again = observeSocietyActions(f.state, f.world, [observation], { nowMs: ++f.time });
    expect(again.world).toBe(f.world);
    expectConserved(f, total);
  });

  it.each(['transfer', 'loan', 'work'] as const)('rejects a %s one cent above the balance without partial acceptance', (kind) => {
    const f = fixture(); transfer(f, 0.1); transfer(f, 0.1);
    const terms: OfferTerms = kind === 'work'
      ? { kind, worker: 'A', payer: 'B', cells: 16.81, verb: 'grow', room: 'garden', units: 1, dueWatch: watchNumber(f.world) + 3 }
      : kind === 'loan' ? { kind, from: 'B', to: 'A', cells: 16.81, dueDay: f.world.day + 1 }
        : { kind, from: 'B', to: 'A', cells: 16.81 };
    const beforeProposal = structuredClone({ state: f.state, world: f.world });
    offer(f, terms, 'B', 'A', 'insufficient_cells');
    expect({ state: f.state, world: f.world }).toEqual(beforeProposal);
    turn(f, 'B', { message: { to: 'A', text: 'Let us end this exchange.', close: true } });
    offer(f, terms, 'A', 'B'); // Asking cannot inspect another resident's balance.
    const beforeAcceptance = structuredClone({ state: f.state, world: f.world });
    accept(f, 'B', 'A', 'insufficient_cells');
    expect({ state: f.state, world: f.world }).toEqual(beforeAcceptance);
  });

  it('preserves genuine sub-cent leakage and refuses to round it into new spending power', () => {
    const f = fixture();
    closeEconomyDay(f.world, 0);
    expect(f.world.bodies.B.cells).toBeCloseTo(16.796, 12);
    const total = totalCells(f.world), ledger = structuredClone(f.world.economy.ledger);
    const untouched = f.world.bodies.C.cells;
    expect(available(f)).toBe(16.79);
    offer(f, { kind: 'transfer', from: 'B', to: 'A', cells: 16.8 }, 'B', 'A', 'insufficient_cells');
    transfer(f, 16.79);
    expect(f.world.bodies.B.cells).toBeCloseTo(0.006, 12);
    expect(f.world.bodies.C.cells).toBe(untouched);
    expect(f.world.economy.ledger).toEqual(ledger);
    expectConserved(f, total);
  });
});
