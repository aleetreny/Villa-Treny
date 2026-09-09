import { expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { totalCells } from '../engine/economy';
import { attempt } from '../engine/verbs';
import type { ResidentId } from '../residents';
import { applySocietyTurn, createSocietyState, observeSocietyActions, parseSocietyState,
  prepareSocietyTurn, promisedCells, type TurnResponse } from './index';

it('lets a worker accept new work after completing an unpaid job while keeping the payment owed', () => {
  let world = genesisState(41);
  world.bodies.A.room = world.bodies.B.room = 'common';
  world.bodies.B.cells = 2;
  world.economy.ledger.initialCells = totalCells(world);
  let state = createSocietyState(world, 1000), sequence = 0, nowMs = 2000;
  function turn(actor: ResidentId, response: TurnResponse) {
    const job = prepareSocietyTurn(state, world, actor, { nowMs: ++nowMs, sequence: ++sequence, generation: 0 });
    const result = applySocietyTurn(state, world, job, response, { nowMs: ++nowMs, generation: 0 });
    if (result.ok) { state = result.state; world = result.world; }
    return result;
  }
  expect(turn('A', { message: { to: 'B', text: 'I can inspect Common once for two cells.' },
    offer: { terms: { kind: 'work', worker: 'A', payer: 'B', cells: 2, verb: 'inspect', room: 'common', units: 1, dueWatch: 416 }, expiresInWatches: 2 } }).ok).toBe(true);
  expect(turn('B', { message: { to: 'A', text: 'I accept those terms.' }, respond: { offerId: state.offers.at(-1)!.id, decision: 'accept' } }).ok).toBe(true);
  expect(turn('A', { message: { to: 'B', text: 'I will get to work.', close: true } }).ok).toBe(true);
  const firstId = state.agreements[0].id;
  expect(attempt(world, { actor: 'B', verb: 'eat' }).ok).toBe(true);
  const inspected = attempt(world, { actor: 'A', verb: 'inspect' });
  expect(inspected.ok).toBe(true);
  const observed = observeSocietyActions(state, world, [{ actor: 'A', day: 100, watch: 1,
    intent: { actor: 'A', verb: 'inspect' }, outcome: inspected, actualRoom: 'common' }], { nowMs: ++nowMs });
  state = observed.state; world = observed.world;
  expect(state.agreements[0]).toMatchObject({ status: 'payment_due', progress: 1, terms: { units: 1 } });
  expect(world.bodies.B.cells).toBe(1.5);
  expect(promisedCells(state, 'B')).toBe(2);
  const beforeNewJob = totalCells(world);
  expect(turn('C', { message: { to: 'A', text: 'Would you inspect the yard voluntarily?' },
    offer: { terms: { kind: 'work', worker: 'A', payer: 'C', cells: 0, verb: 'inspect', room: 'garden', units: 1, dueWatch: 416 }, expiresInWatches: 2 } }).ok).toBe(true);
  expect(turn('A', { message: { to: 'C', text: 'I accept this voluntary inspection.' }, respond: { offerId: state.offers.at(-1)!.id, decision: 'accept' } }).ok).toBe(true);
  expect(state.agreements.find((a) => a.id === firstId)).toMatchObject({ status: 'payment_due', progress: 1 });
  expect(state.agreements.at(-1)).toMatchObject({ status: 'active', progress: 0, terms: { payer: 'C', cells: 0 } });
  expect(promisedCells(state, 'B')).toBe(2);
  expect(totalCells(world)).toBe(beforeNewJob);
  expect(parseSocietyState(state).ok).toBe(true);
  // A genuinely unfinished job still occupies the worker.
  expect(turn('C', { message: { to: 'A', text: 'Until later.', close: true } }).ok).toBe(true);
  expect(turn('D', { message: { to: 'A', text: 'Can you also inspect my work area?' },
    offer: { terms: { kind: 'work', worker: 'A', payer: 'D', cells: 0, verb: 'inspect', room: 'workshops', units: 1, dueWatch: 416 }, expiresInWatches: 2 } }).ok).toBe(true);
  expect(turn('A', { message: { to: 'D', text: 'I accept this other job.' }, respond: { offerId: state.offers.at(-1)!.id, decision: 'accept' } }))
    .toMatchObject({ ok: false, code: 'existing_work_commitment' });
});
