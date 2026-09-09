import { describe, expect, it } from 'vitest';
import { conversationOutcomes } from './conversation-outcomes';
import { genesisState, CONDITIONS } from './engine/state';
import { totalCells } from './engine/economy';
import { advanceScheduledWatch } from './engine/tick';
import { attempt } from './engine/verbs';
import { RESIDENTS, RESIDENT_BY_ID, type ResidentId } from './residents';
import { createSocietyState } from './society/state';
import { prepareSocietyTurn, applySocietyTurn } from './society/turn';
import { societyPublicView } from './society/public';
import { plannedSocietyActions, observeSocietyActions } from './society/physical';
import { settleSocietyAgreements } from './society/economy';
import type { OfferTerms, PhysicalObservation } from './society/types';

function fixture() {
  const world = genesisState(91);
  for (const { id } of RESIDENTS) { world.bodies[id].cells = 20; for (const condition of CONDITIONS) world.bodies[id].condition[condition] = 80; }
  world.economy.ledger.initialCells = totalCells(world);
  return { world, state: createSocietyState(world, 1000), now: 2000 };
}
type Fixture = ReturnType<typeof fixture>;
function act(f: Fixture, actor: ResidentId, raw: unknown): Fixture {
  const turn = prepareSocietyTurn(f.state, f.world, actor, { nowMs: f.now, generation: 0, sequence: f.state.minds[actor].lastAppliedSequence + 1 });
  const result = applySocietyTurn(f.state, f.world, turn, raw, { nowMs: f.now + 1, generation: 0 });
  expect(result.code).toBe('applied'); return { state: result.state, world: result.world, now: f.now + 100 };
}
function propose(terms: OfferTerms) {
  return act(fixture(), 'A', { message: { to: 'B', text: 'Here it is, already done.' }, offer: { terms, expiresInWatches: 2 } });
}
function accept(f: Fixture) {
  return act(f, 'B', { message: { to: 'A', text: 'I accept this exact offer.' }, respond: { offerId: f.state.offers[0].id, decision: 'accept' } });
}
const outcomes = (f: Fixture) => conversationOutcomes(societyPublicView(f.state), f.state.conversations[0].id);
const work = (cells: number): OfferTerms => ({ kind: 'work', worker: 'B', payer: 'A', cells, units: 1, verb: 'clean', room: 'well', dueWatch: 402 });
function watch(f: Fixture): Fixture {
  const observations: PhysicalObservation[] = [];
  advanceScheduledWatch(f.world, undefined, undefined, undefined, { plans: plannedSocietyActions(f.state, f.world), onAction: o => observations.push(o) });
  const result = observeSocietyActions(f.state, f.world, observations, { nowMs: f.now + 1 });
  return { ...result, now: f.now + 100 };
}

describe('conversation outcomes use committed records, not narrated claims', () => {
  it('keeps an open transfer unpaid despite the words, then shows the real counterpart acceptance and transfer', () => {
    const proposed = propose({ kind: 'transfer', from: 'A', to: 'B', cells: 2 });
    expect(proposed.world.bodies.A.cells).toBe(20);
    expect(outcomes(proposed)[0]).toMatchObject({ title: `Proposed: ${RESIDENT_BY_ID.A.name} would give 2 cells to ${RESIDENT_BY_ID.B.name}.`,
      detail: `Awaiting ${RESIDENT_BY_ID.B.name}’s acceptance. No transfer is recorded for this proposal.` });
    const accepted = accept(proposed);
    expect(accepted.world.bodies.A.cells).toBe(18); expect(accepted.world.bodies.B.cells).toBe(22);
    expect(outcomes(accepted)[0]).toMatchObject({ title: `Transferred: 2 cells from ${RESIDENT_BY_ID.A.name} to ${RESIDENT_BY_ID.B.name}.`,
      detail: 'Acceptance and transfer were recorded together.', agreementId: accepted.state.agreements[0].id, acceptedAtMs: 2101, completedAtMs: 2101 });
  });

  it('keeps accepted work unpaid until a real credited action and settlement, with the exact evidence IDs', () => {
    const accepted = accept(propose(work(3)));
    expect(outcomes(accepted)[0].detail).toContain('0 of 1 agreed actions recorded.');
    expect(outcomes(accepted)[0].detail).toContain('Completion payment of 3 cells is not recorded.');
    const done = watch(accepted), agreement = done.state.agreements[0];
    expect(agreement.status).toBe('fulfilled'); expect(agreement.evidenceIds).toHaveLength(1);
    expect(done.world.bodies.A.cells).toBe(17); expect(done.world.bodies.B.cells).toBe(23);
    const before = structuredClone(done.state);
    expect(outcomes(done)[0]).toMatchObject({ evidenceIds: agreement.evidenceIds,
      detail: `1 of 1 agreed actions recorded. Payment recorded: 3 cells from ${RESIDENT_BY_ID.A.name} to ${RESIDENT_BY_ID.B.name}.` });
    expect(done.state).toEqual(before);
  });

  it('shows completed labour with payment still due when the payer no longer has funds', () => {
    const accepted = accept(propose(work(3)));
    accepted.world.economy.treasury += accepted.world.bodies.A.cells; accepted.world.bodies.A.cells = 0;
    const done = watch(accepted);
    expect(done.state.agreements[0].status).toBe('payment_due');
    expect(outcomes(done)[0].title).toContain('Work recorded; payment pending');
    expect(outcomes(done)[0].detail).toBe(`1 of 1 agreed actions recorded. 3 cells are still due from ${RESIDENT_BY_ID.A.name}.`);
    expect(outcomes(done)[0].completedAtMs).toBeUndefined();
  });

  it('describes zero-cell work as voluntary before and after its real completion, without inventing payment', () => {
    const proposed = propose(work(0)); expect(outcomes(proposed)[0].detail).toContain('Voluntary work; no payment proposed.');
    const done = watch(accept(proposed));
    expect(done.state.agreements[0].status).toBe('fulfilled');
    expect(outcomes(done)[0].detail).toBe('1 of 1 agreed actions recorded. Voluntary work; no payment agreed.');
    expect(outcomes(done)[0].detail).not.toContain('Payment recorded');
    expect(done.world.bodies.A.cells).toBe(20); expect(done.world.bodies.B.cells).toBe(20);
  });

  it('distinguishes principal already lent from repayment still open, and uses the actual loan settlement', () => {
    const accepted = accept(propose({ kind: 'loan', from: 'A', to: 'B', cells: 2, dueDay: 102 }));
    expect(accepted.world.bodies.B.cells).toBe(22);
    expect(outcomes(accepted)[0]).toMatchObject({ title: `Lent: 2 cells from ${RESIDENT_BY_ID.A.name} to ${RESIDENT_BY_ID.B.name}.`, detail: 'Repayment remains open; due day 102.', debtId: accepted.state.agreements[0].debtId });
    expect(attempt(accepted.world, { actor: 'B', verb: 'repay', target: 'A' }).ok).toBe(true);
    const settled = settleSocietyAgreements(accepted.state, accepted.world, accepted.now + 1);
    expect(outcomes({ ...settled, now: accepted.now })[0].detail).toBe('Repayment completed.');
  });

  it('does not attach a same-person project/agreement without the exact offer chain or turn missing history into a denial', () => {
    const done = watch(accept(propose(work(3)))), view = societyPublicView(done.state), before = structuredClone(view);
    const offer = view.offers[0], agreement = view.agreements[0], conversationId = offer.conversationId;
    expect(conversationOutcomes(view, conversationId)[0]).toMatchObject({ offerId: offer.id, agreementId: agreement.id, evidenceIds: agreement.evidenceIds });
    const otherConversation = { ...offer, id: 'offer:another', conversationId: 'conversation:another', status: 'open' as const };
    expect(conversationOutcomes({ ...view, offers: [...view.offers, otherConversation] }, otherConversation.conversationId)[0].agreementId).toBeUndefined();
    expect(conversationOutcomes({ ...view, offers: [] }, conversationId)).toEqual([]);
    const incomplete = conversationOutcomes({ ...view, agreements: [] }, conversationId)[0];
    expect(incomplete.detail).toContain('Acceptance is recorded; the agreement details are not visible');
    expect(incomplete.detail).not.toContain('No transfer'); expect(incomplete.detail).not.toContain('not recorded');
    expect(view).toEqual(before);
  });
});
