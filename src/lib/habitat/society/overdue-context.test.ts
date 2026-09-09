import { expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { closeEconomyDay, remember, totalCells } from '../engine/economy';
import { attempt } from '../engine/verbs';
import type { ResidentId } from '../residents';
import { applySocietyTurn, createSocietyState, observeSocietyActions, parseSocietyState,
  prepareSocietyTurn, settleSocietyAgreements, type TurnResponse } from './index';

it('keeps overdue principal and the actual remaining balance known to both parties after their memories rotate', () => {
  let world = genesisState(41);
  world.bodies.A.cells = 20;
  world.bodies.A.room = world.bodies.B.room = 'common';
  world.economy.ledger.initialCells = totalCells(world);
  let state = createSocietyState(world, 1000), sequence = 0, nowMs = 2000;
  function turn(actor: ResidentId, response: TurnResponse) {
    const job = prepareSocietyTurn(state, world, actor, { nowMs: ++nowMs, sequence: ++sequence, generation: 0 });
    const result = applySocietyTurn(state, world, job, response, { nowMs: ++nowMs, generation: 0 });
    expect(result.ok).toBe(true); state = result.state; world = result.world;
  }
  const read = (actor: ResidentId) => {
    const job = prepareSocietyTurn(state, world, actor, { nowMs: ++nowMs, sequence: ++sequence, generation: 0 });
    return { job, context: JSON.parse(job.prompt.slice(job.prompt.indexOf('\n{') + 1)) };
  };
  turn('A', { message: { to: 'B', text: 'I propose lending four cells until day 101.' },
    offer: { terms: { kind: 'loan', from: 'A', to: 'B', cells: 4, dueDay: 101 }, expiresInWatches: 2 } });
  turn('B', { message: { to: 'A', text: 'I accept the exact loan.' }, respond: { offerId: state.offers.at(-1)!.id, decision: 'accept' } });
  turn('A', { message: { to: 'B', text: 'Talk later.', close: true } });
  const agreementId = state.agreements[0].id, debtId = state.agreements[0].debtId!;
  world.day = 101; world.watch = 4;
  closeEconomyDay(world, 0);
  let settled = settleSocietyAgreements(state, world, ++nowMs);
  state = settled.state; world = settled.world;
  expect(state.agreements[0].status).toBe('breached');
  for (let i = 0; i < 25; i++) {
    world.day = 102 + Math.floor(i / 4); world.watch = i % 4 + 1; nowMs += 21_600_000;
    const outcome = attempt(world, { actor: 'A', verb: 'rest' });
    expect(outcome.ok).toBe(true);
    // Populate both bounded stores with later, actually executed personal acts.
    remember(world, 'A', { kind: 'rest', outcome: 'The engine completed rest.' });
    const observed = observeSocietyActions(state, world, [{ actor: 'A', day: world.day, watch: world.watch,
      intent: { actor: 'A', verb: 'rest' }, outcome }], { nowMs });
    state = observed.state; world = observed.world;
  }
  expect(world.bodies.A.memory.every((m) => m.kind === 'rest')).toBe(true);
  expect(state.minds.A.memories.every((m) => m.text === 'The engine completed rest.')).toBe(true);
  expect(attempt(world, { actor: 'B', verb: 'repay', target: 'A' }).ok).toBe(true);
  const lender = read('A'), borrower = read('B'), stranger = read('C');
  expect(lender.context.receivables).toEqual([{ id: debtId, from: 'B', remaining: 2, dueDay: 101, status: 'overdue' }]);
  expect(lender.context.commitments).toContainEqual(expect.objectContaining({ id: agreementId, status: 'breached', terms: expect.objectContaining({ cells: 4 }) }));
  expect(borrower.context.affordances.repayments).toContainEqual(expect.objectContaining({ debtId, target: 'A', remaining: 2, dueDay: 101, status: 'overdue' }));
  expect(lender.job.evidenceIds).toContain(debtId); expect(borrower.job.evidenceIds).toContain(debtId);
  expect(stranger.job.evidenceIds).not.toContain(debtId); expect(stranger.job.prompt).not.toContain(agreementId);
  expect(parseSocietyState(state).ok).toBe(true);
  expect(lender.job.contextOverflow).toBe(false);
  world.watch += 1;
  expect(attempt(world, { actor: 'B', verb: 'repay', target: 'A' }).ok).toBe(true);
  settled = settleSocietyAgreements(state, world, ++nowMs); state = settled.state; world = settled.world;
  expect(state.agreements[0].status).toBe('fulfilled');
  expect(read('A').context.receivables).toEqual([]);
  expect(read('B').context.affordances.repayments).toEqual([]);
});
