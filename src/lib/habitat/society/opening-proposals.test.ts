import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CONDITIONS, genesisState } from '../engine/state';
import { totalCells } from '../engine/economy';
import { advanceScheduledWatch } from '../engine/tick';
import { RESIDENTS, type ResidentId } from '../residents';
import { applyCapabilityChoice, capabilityChoiceJsonSchema, decodeCapabilityChoice,
  applyProposalCapabilityChoice, decodeProposalCapabilityChoice, proposalCapabilityChoiceJsonSchema } from './capabilities';
import { decodeSocietyChoice, societyChoiceJsonSchema } from './choice';
import { createSocietyState, watchNumber } from './state';
import { applySocietyTurn, prepareSocietyTurn } from './turn';
import { parseSocietyState } from './schema';
import { plannedSocietyActions, observeSocietyActions } from './physical';
import { promisedCells } from './economy';
import { SOCIETY_PROPOSAL_SYSTEM, SOCIETY_SYSTEM } from './instructions';
import type { PhysicalObservation } from './types';

const purpose = { mode: 'replace', goal: 'Arrange a useful exchange.', why: 'I want explicit terms.',
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
function message(to: ResidentId = 'B') { return { to, text: 'Would these precise terms suit you?', close: false }; }
function raw(deal?: object, to: ResidentId = 'B') { return { project: purpose, message: message(to), ...(deal ? { deal } : {}) }; }
function act(f: Fixture, actor: ResidentId, value: unknown): Fixture {
  const result = applyProposalCapabilityChoice(f.state, f.world, prepare(f, actor), value, { nowMs: f.now + 1, generation: 0 });
  expect(result.code).toBe('applied'); expect(parseSocietyState(result.state).ok).toBe(true);
  return { state: result.state, world: result.world, now: f.now + 100 };
}
function rejected(f: Fixture, actor: ResidentId, value: unknown) {
  const before = structuredClone(f);
  const result = applyProposalCapabilityChoice(f.state, f.world, prepare(f, actor), value, { nowMs: f.now + 1, generation: 0 });
  expect(result.ok).toBe(false); expect(result.state).toBe(f.state); expect(result.world).toBe(f.world); expect(f).toEqual(before);
  return result;
}
const work = { kind: 'work', role: 'hire', cells: 3, verb: 'filter_water', room: 'well', units: 1, slackWatches: 0 };

describe('version 4 opening proposals', () => {
  it('keeps earlier protocols and ordinary discussion unchanged while exposing eligible opening proposals', () => {
    const f = fixture(), turn = prepare(f, 'A');
    const v2 = societyChoiceJsonSchema(f.state, f.world, turn), v3 = capabilityChoiceJsonSchema(f.state, f.world, turn);
    const v4 = proposalCapabilityChoiceJsonSchema(f.state, f.world, turn);
    expect(societyChoiceJsonSchema(f.state, f.world, turn)).toEqual(v2);
    expect(capabilityChoiceJsonSchema(f.state, f.world, turn)).toEqual(v3);
    expect((v4.properties as Record<string, unknown>).message).toEqual((v3.properties as Record<string, unknown>).message);
    const decoder = z.fromJSONSchema(v4), offer = raw({ kind: 'transfer', direction: 'give', cells: 2 });
    expect(decoder.safeParse(offer).success).toBe(true);
    expect(decodeSocietyChoice(f.state, f.world, turn, offer).ok).toBe(false);
    expect(decodeCapabilityChoice(f.state, f.world, turn, offer).ok).toBe(false);
    expect(decodeProposalCapabilityChoice(f.state, f.world, turn, offer).ok).toBe(true);
    for (const close of [undefined, false, true]) {
      const ordinary = { project: purpose, message: { to: 'B', text: 'No exchange is needed.', ...(close === undefined ? {} : { close }) } };
      expect(decoder.safeParse(ordinary).success).toBe(true);
      expect(decodeProposalCapabilityChoice(f.state, f.world, turn, ordinary)).toEqual(decodeCapabilityChoice(f.state, f.world, turn, ordinary));
    }
    expect(decoder.safeParse({ message: message() }).success).toBe(false);
    expect(decoder.safeParse(raw({ kind: 'accept', offerId: 'invented' })).success).toBe(false);
    expect(decoder.safeParse(raw({ kind: 'reject', offerId: 'invented' })).success).toBe(false);
    const canonical = { ...raw(), offer: { terms: { kind: 'transfer', from: 'A', to: 'B', cells: 2 }, expiresInWatches: 2 } };
    expect(applySocietyTurn(f.state, f.world, turn, canonical, { nowMs: 2001, generation: 0 }).ok).toBe(true);
    expect(SOCIETY_SYSTEM).toContain('available only on your turn in an existing conversation');
    expect(SOCIETY_PROPOSAL_SYSTEM).toContain('Words alone do not schedule work or move cells. Ordinary discussion needs no deal.');
    expect(SOCIETY_PROPOSAL_SYSTEM).not.toContain('available only on your turn in an existing conversation');
  });

  it.each([
    [{ kind: 'transfer', direction: 'give', cells: 3.25 }, { kind: 'transfer', from: 'A', to: 'B', cells: 3.25 }],
    [{ kind: 'transfer', direction: 'ask', cells: 3.25 }, { kind: 'transfer', from: 'B', to: 'A', cells: 3.25 }],
    [{ kind: 'loan', direction: 'lend', cells: 3.25, dueInDays: 2 }, { kind: 'loan', from: 'A', to: 'B', cells: 3.25, dueDay: 102 }],
    [{ kind: 'loan', direction: 'borrow', cells: 3.25, dueInDays: 2 }, { kind: 'loan', from: 'B', to: 'A', cells: 3.25, dueDay: 102 }],
    [work, { kind: 'work', worker: 'B', payer: 'A', cells: 3, verb: 'clean', room: 'well', units: 1, dueWatch: 401 }],
    [{ ...work, role: 'work', cells: 0 }, { kind: 'work', worker: 'A', payer: 'B', cells: 0, verb: 'clean', room: 'well', units: 1, dueWatch: 401 }],
  ])('constructs opening roles/dates itself and transfers nothing on proposal %#', (deal, terms) => {
    const f = fixture(), proposed = act(f, 'A', raw(deal));
    expect(proposed.world).toEqual(f.world);
    expect(proposed.state.conversations[0]).toMatchObject({ participants: ['A', 'B'], nextSpeaker: 'B', status: 'open' });
    expect(proposed.state.offers).toHaveLength(1);
    expect(proposed.state.offers[0]).toMatchObject({ proposer: 'A', counterpart: 'B', terms, status: 'open', expiresAtWatch: watchNumber(f.world) + 2 });
    expect(proposed.state.agreements).toHaveLength(0);
    expect(promisedCells(proposed.state, 'A')).toBe(0); // No invented escrow for an unaccepted offer.
    expect(plannedSocietyActions(proposed.state, proposed.world).B).toBeUndefined();
  });

  it('requires a separate counterpart acceptance and applies a loan exactly once', () => {
    const f = act(fixture(), 'A', raw({ kind: 'loan', direction: 'lend', cells: 3.25, dueInDays: 2 }));
    const offerId = f.state.offers[0].id, acceptance = raw({ kind: 'accept', offerId }, 'A');
    rejected(f, 'A', raw({ kind: 'accept', offerId }));
    const turn = prepare(f, 'B');
    const result = applyProposalCapabilityChoice(f.state, f.world, turn, acceptance, { nowMs: f.now + 1, generation: 0 });
    expect(result.code).toBe('applied');
    expect(result.world.bodies.A.cells).toBe(16.75); expect(result.world.bodies.B.cells).toBe(23.25);
    expect(result.world.economy.debts).toMatchObject([{ lender: 'A', borrower: 'B', principal: 3.25, remaining: 3.25, dueDay: 102 }]);
    expect(totalCells(result.world)).toBe(500);
    const duplicate = applyProposalCapabilityChoice(result.state, result.world, turn, acceptance, { nowMs: f.now + 2, generation: 0 });
    expect(duplicate.code).toBe('already_applied'); expect(duplicate.world).toBe(result.world); expect(duplicate.state).toBe(result.state);
    const staleControl = applyProposalCapabilityChoice(result.state, result.world, turn, acceptance, { nowMs: f.now + 2, generation: 1 });
    expect(staleControl.code).toBe('stale_control');
  });

  it('distinguishes rejection, ordinary closure and a verbal assurance from acceptance', () => {
    for (const mode of ['reject', 'close', 'words'] as const) {
      const f = act(fixture(), 'A', raw(work)), offerId = f.state.offers[0].id;
      const response = { project: purpose, message: { to: 'A', text: mode === 'words' ? 'Yes, I will do that work.' : 'I decline.', close: mode === 'close' },
        ...(mode === 'reject' ? { deal: { kind: 'reject', offerId } } : {}) };
      const answer = act(f, 'B', response);
      expect(answer.state.offers[0].status).toBe(mode === 'reject' ? 'rejected' : mode === 'close' ? 'expired' : 'open');
      expect(answer.state.agreements).toHaveLength(0); expect(answer.world).toEqual(f.world);
      expect(plannedSocietyActions(answer.state, answer.world).B).toBeUndefined();
    }
  });

  it('keeps silence available without an eligible recipient and never requires a deal', () => {
    let f = fixture();
    for (let i = 0; i < 24; i += 2) f = act(f, RESIDENTS[i].id, raw(undefined, RESIDENTS[i + 1].id));
    const turn = prepare(f, 'Y'), schema = proposalCapabilityChoiceJsonSchema(f.state, f.world, turn);
    expect((schema.properties as Record<string, unknown>).message).toBeUndefined();
    expect((schema.properties as Record<string, unknown>).deal).toBeUndefined();
    expect(z.fromJSONSchema(schema).safeParse({ project: purpose }).success).toBe(true);
    expect(decodeProposalCapabilityChoice(f.state, f.world, turn, { project: purpose }).ok).toBe(true);
  });

  it('makes a counterproposal replace the old offer without accepting it or rewriting dates later', () => {
    let f = act(fixture(), 'A', raw({ kind: 'loan', direction: 'lend', cells: 3.25, dueInDays: 2 }));
    const oldId = f.state.offers[0].id;
    f = act(f, 'B', raw({ kind: 'loan', direction: 'borrow', cells: 2, dueInDays: 3 }, 'A'));
    expect(f.state.offers[0].status).toBe('replaced'); expect(f.state.agreements).toHaveLength(0);
    const revised = f.state.offers[1], terms = structuredClone(revised.terms);
    rejected(f, 'A', raw({ kind: 'accept', offerId: oldId }));
    f.world.watch = 2;
    f = act(f, 'A', raw({ kind: 'accept', offerId: revised.id }));
    expect(f.state.agreements[0].terms).toEqual(terms);
    expect(f.world.bodies.A.cells).toBe(18); expect(f.world.bodies.B.cells).toBe(22);
    expect(f.world.economy.debts[0].dueDay).toBe(103); expect(totalCells(f.world)).toBe(500);
  });

  it('rejects unavailable recipients, stale openings, extra authority, false closure and fabricated evidence', () => {
    const f = fixture(), turn = prepare(f, 'A');
    for (const value of [
      raw(work, 'A'), { ...raw(work), message: { ...message(), close: true } },
      { ...raw(work), message: { to: 'B', text: 'Terms.', close: null } }, { project: purpose, deal: work },
      raw({ ...work, actor: 'B' }), raw({ ...work, units: 5 }), raw({ ...work, room: 'common' }),
      raw({ ...work, cells: 1.001 }), { ...raw(work), offer: {} },
      { ...raw(work), message: { ...message(), extra: true } },
      { ...raw(work), reflection: { text: 'Invented.', refs: ['fact:other:private'] } },
      { ...raw(work), appraisal: { axis: 'trust', delta: 1, ref: 'invented', why: 'No incoming turn.' } },
    ]) rejected(f, 'A', value);
    const busy = act(f, 'C', raw(undefined, 'B'));
    const schema = proposalCapabilityChoiceJsonSchema(busy.state, busy.world, prepare(busy, 'A'));
    expect(JSON.stringify((schema.properties as Record<string, unknown>).message)).not.toContain('"B"');
    expect(applyProposalCapabilityChoice(busy.state, busy.world, turn, raw(work), { nowMs: busy.now + 1, generation: 0 }).ok).toBe(false);
    const incoming = act(f, 'C', raw(undefined, 'A'));
    expect(applyProposalCapabilityChoice(incoming.state, incoming.world, turn, raw(work), { nowMs: incoming.now + 1, generation: 0 }).ok).toBe(false);
    expect(applyProposalCapabilityChoice(f.state, f.world, turn, raw(work), { nowMs: turn.expiresAtMs, generation: 0 }).code).toBe('expired_job');
  });

  it('checks own funds without using the counterpart balance as a proposal oracle, then revalidates at acceptance', () => {
    const f = fixture(); rejected(f, 'A', raw({ kind: 'transfer', direction: 'give', cells: 21 }));
    const poor = structuredClone(f); poor.world.bodies.B.cells = 0; poor.world.economy.ledger.initialCells = totalCells(poor.world);
    expect(proposalCapabilityChoiceJsonSchema(poor.state, poor.world, prepare(poor, 'A')))
      .toEqual(proposalCapabilityChoiceJsonSchema(f.state, f.world, prepare(f, 'A')));
    const request = act(poor, 'A', raw({ kind: 'loan', direction: 'borrow', cells: 3, dueInDays: 2 }));
    expect(request.state.offers).toHaveLength(1);
    expect(rejected(request, 'B', raw({ kind: 'accept', offerId: request.state.offers[0].id }, 'A')).code).toBe('insufficient_cells');
  });

  it('reserves accepted work, executes its real capability before payment, and preserves money', () => {
    let f = act(fixture(), 'A', raw(work));
    const before = structuredClone(f.world), offerId = f.state.offers[0].id;
    f = act(f, 'B', raw({ kind: 'accept', offerId }, 'A'));
    expect(f.world).toEqual(before); expect(promisedCells(f.state, 'A')).toBe(3);
    const plans = plannedSocietyActions(f.state, f.world);
    expect(plans.B).toMatchObject({ intent: { actor: 'B', verb: 'clean' }, at: 'well' });
    const observations: PhysicalObservation[] = [];
    advanceScheduledWatch(f.world, undefined, undefined, undefined, { plans, onAction: o => observations.push(o) });
    const result = observeSocietyActions(f.state, f.world, observations, { nowMs: f.now + 1 });
    expect(observations.find(o => o.actor === 'B')).toMatchObject({ stepId: plans.B!.stepId, outcome: { ok: true } });
    expect(result.state.agreements[0]).toMatchObject({ status: 'fulfilled', progress: 1 });
    expect(result.world.bodies.A.cells).toBe(17); expect(result.world.bodies.B.cells).toBe(23);
    expect(totalCells(result.world)).toBe(500); expect(result.world.economy.ledger.minted).toBe(0);
    expect(promisedCells(result.state, 'A')).toBe(0);
    expect(observeSocietyActions(result.state, result.world, observations, { nowMs: f.now + 2 })).toEqual(result);
  });

  it('retains accepted reservations and exact dates when funds or time change', () => {
    let f = act(fixture(), 'A', raw({ ...work, cells: 18 }));
    f = act(f, 'B', raw({ kind: 'accept', offerId: f.state.offers[0].id }, 'A'));
    f = act(f, 'A', { message: { to: 'B', text: 'The terms are set.', close: true } });
    expect(promisedCells(f.state, 'A')).toBe(18);
    expect(rejected(f, 'A', raw({ kind: 'transfer', direction: 'give', cells: 3 }, 'C')).code).toBe('insufficient_cells');
    const late = act(fixture(), 'A', raw(work));
    const terms = structuredClone(late.state.offers[0].terms);
    late.world.watch = 3;
    rejected(late, 'B', raw({ kind: 'accept', offerId: late.state.offers[0].id }, 'A'));
    expect(late.state.offers[0].terms).toEqual(terms); expect(late.state.agreements).toHaveLength(0);
  });

  it('does not let a protocol 3 response gain opening authority after a version 4 release', () => {
    const f = fixture(), turn = prepare(f, 'A'), offer = raw(work);
    expect(applyCapabilityChoice(f.state, f.world, turn, offer, { nowMs: f.now + 1, generation: 0 }).ok).toBe(false);
    expect(applyProposalCapabilityChoice(f.state, f.world, turn, offer, { nowMs: f.now + 1, generation: 0 }).ok).toBe(true);
  });
});
