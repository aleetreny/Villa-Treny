import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { genesisState } from '../engine/state';
import { totalCells } from '../engine/economy';
import { RESIDENTS, type ResidentId } from '../residents';
import { applyProposalCapabilityChoice, proposalCapabilityChoiceJsonSchema } from './capabilities';
import { createSocietyState } from './state';
import { prepareSocietyTurn } from './turn';
import { parseSocietyState } from './schema';
import { SOCIETY_PROPOSAL_SYSTEM, SOCIETY_ORDERED_SYSTEM, orderedSystemFromProposalSystem } from './instructions';
import { applyOrderedCapabilityChoice, decodeOrderedCapabilityChoice, fromOrderedChoice,
  orderedCapabilityChoiceJsonSchema, orderedChoiceJsonSchemaFromProposal, toOrderedChoice } from './ordered-choice';

const project = { mode: 'replace', goal: 'Discuss a useful exchange.', why: 'I want clear terms.', visibility: 'private', steps: [] };
function fixture() {
  const world = genesisState(91);
  for (const body of Object.values(world.bodies)) body.cells = 20;
  world.economy.ledger.initialCells = totalCells(world);
  return { world, state: createSocietyState(world, 1000), now: 2000 };
}
type Fixture = ReturnType<typeof fixture>;
function turn(f: Fixture, actor: ResidentId = 'A') {
  return prepareSocietyTurn(f.state, f.world, actor, { nowMs: f.now, generation: 0, sequence: f.state.minds[actor].lastAppliedSequence + 1 });
}
function raw(deal?: unknown, to: ResidentId = 'B') {
  return { project, message: { to, text: 'Would this exchange suit you?' }, ...(deal ? { deal } : {}) };
}
function ordered(value: unknown) {
  const converted = toOrderedChoice(value);
  if (!converted.ok) throw new Error(converted.code);
  return converted.value;
}
function equivalent(f: Fixture, actor: ResidentId, value: unknown) {
  const prepared = turn(f, actor), base = proposalCapabilityChoiceJsonSchema(f.state, f.world, prepared);
  const before = structuredClone({ base, state: f.state, world: f.world }), encoded = ordered(value);
  expect(z.fromJSONSchema(base).safeParse(value).success).toBe(true);
  expect(z.fromJSONSchema(orderedChoiceJsonSchemaFromProposal(base)).safeParse(encoded).success).toBe(true);
  expect(fromOrderedChoice(encoded)).toEqual({ ok: true, value });
  expect(base).toEqual(before.base);
  const control = { nowMs: f.now + 1, generation: 0 };
  const legacy = applyProposalCapabilityChoice(f.state, f.world, prepared, value, control);
  const result = applyOrderedCapabilityChoice(f.state, f.world, prepared, encoded, control);
  expect(legacy.code).toBe('applied'); expect(result).toEqual(legacy);
  expect(parseSocietyState(result.state).ok).toBe(true);
  expect(f.state).toEqual(before.state); expect(f.world).toEqual(before.world);
  return { ...result, now: f.now + 100 };
}
const work = { kind: 'work', role: 'hire', cells: 3.25, verb: 'filter_water', room: 'well', units: 1, slackWatches: 0 };

describe('ordered protocol 5 preserves protocol 4 authority', () => {
  it.each([
    { kind: 'transfer', direction: 'give', cells: 3.25 },
    { kind: 'transfer', direction: 'ask', cells: 3.25 },
    { kind: 'loan', direction: 'lend', cells: 3.25, dueInDays: 30 },
    { kind: 'loan', direction: 'borrow', cells: 3.25, dueInDays: 1 },
    work, { ...work, role: 'work', cells: 0, units: 4, slackWatches: 11 },
  ])('roundtrips $kind/$direction/$role with identical parties, amount, dates and IDs', (deal) => {
    const f = fixture(), result = equivalent(f, 'A', raw(deal));
    expect(result.world).toEqual(f.world); expect(result.state.agreements).toEqual([]);
    expect(result.state.offers[0]).toMatchObject({ proposer: 'A', counterpart: 'B', status: 'open' });
  });

  it('retains all legal facility/capability pairs in the factored work grammar', () => {
    const f = fixture(), prepared = turn(f);
    const p4 = z.fromJSONSchema(proposalCapabilityChoiceJsonSchema(f.state, f.world, prepared));
    const p5 = z.fromJSONSchema(orderedCapabilityChoiceJsonSchema(f.state, f.world, prepared));
    const verbs = ['accrue_labor_credit', 'walk_room_and_log_visit', 'repair', 'filter_water', 'clean_space',
      'dig', 'grow', 'cook', 'accrue_two_labor_credits'];
    const rooms = ['common', 'well', 'garden', 'face', 'workshops', 'kitchen', 'dock', 'breach', 'invented'];
    for (const verb of verbs) for (const room of rooms) for (const role of ['work', 'hire']) {
      const value = raw({ ...work, verb, room, role }), encoded = ordered(value);
      expect(p5.safeParse(encoded).success, `${verb}/${room}/${role}`).toBe(p4.safeParse(value).success);
      if (p4.safeParse(value).success) expect(decodeOrderedCapabilityChoice(f.state, f.world, prepared, encoded).ok).toBe(true);
    }
  });

  it.each(['accept', 'reject'] as const)('answers only the exact incoming ID using %s', (kind) => {
    const f = equivalent(fixture(), 'A', raw({ kind: 'loan', direction: 'lend', cells: 3.25, dueInDays: 2 }));
    const offer = f.state.offers[0]!, value = raw({ kind, offerId: offer.id }, 'A');
    const response = ordered(value);
    expect(response.turn[0]).toEqual({ choice: `${kind}:${offer.id}` });
    const result = equivalent(f, 'B', value);
    expect(result.state.offers[0].status).toBe(kind === 'accept' ? 'accepted' : 'rejected');
    expect(totalCells(result.world)).toBe(totalCells(f.world));
    if (kind === 'accept') {
      expect(result.state.agreements[0].terms).toEqual(offer.terms);
      expect(result.world.bodies.A.cells).toBe(16.75); expect(result.world.bodies.B.cells).toBe(23.25);
    } else expect(result.world).toEqual(f.world);
    const prepared = turn(f, 'B');
    for (const [actor, choice] of [['A', `accept:${offer.id}`], ['B', 'accept:offer:missing']] as const) {
      const invalid = { turn: [{ choice }, response.turn[1]] };
      const rejected = applyOrderedCapabilityChoice(f.state, f.world, actor === 'B' ? prepared : turn(f, actor), invalid,
        { nowMs: f.now + 1, generation: 0 });
      expect(rejected.ok).toBe(false); expect(rejected.state).toBe(f.state); expect(rejected.world).toBe(f.world);
    }
  });

  it('keeps matching counterproposals and ordinary assurances distinct from acceptance', () => {
    const f = equivalent(fixture(), 'A', raw(work));
    const terms = structuredClone(f.state.offers[0].terms);
    const words = { ...raw(undefined, 'A'), message: { to: 'A', text: 'I accept those terms.' } };
    const spoken = equivalent(f, 'B', words);
    expect(spoken.state.agreements).toEqual([]); expect(spoken.state.offers[0].status).toBe('open');
    const proposed = equivalent(f, 'B', { ...words, deal: { ...work, role: 'work' } });
    expect(proposed.state.offers[0].status).toBe('replaced');
    expect(proposed.state.offers[1].terms).toEqual(terms);
    expect(proposed.state.offers[1].id).not.toBe(f.state.offers[0].id);
    expect(proposed.state.agreements).toEqual([]); expect(proposed.world).toEqual(f.world);
  });

  it('preserves private goals, reflection and optional appraisal without altering others’ feelings', () => {
    const f = equivalent(fixture(), 'A', raw()), prepared = turn(f, 'B');
    const reference = f.state.conversations[0].turns[0].id;
    const reply = { ...raw(undefined, 'A'), reflection: { text: 'I can consider the question.', refs: [reference] },
      appraisal: { axis: 'trust', delta: 1, ref: reference, why: 'I feel invited to contribute.' } };
    const before = f.world.axes.get('AB');
    const result = equivalent(f, 'B', reply);
    expect(result.world.axes.get('AB')).toEqual(before);
    expect(result.world.axes.get('BA')?.trust).toBe(Math.min(100, f.world.axes.get('BA')!.trust + 1));
    const repeated = applyOrderedCapabilityChoice(result.state, result.world, prepared, ordered(reply), { nowMs: result.now, generation: 0 });
    expect(repeated.code).toBe('already_applied'); expect(repeated.state).toBe(result.state); expect(repeated.world).toBe(result.world);
    const privateUpdate = { reflection: { text: 'My purpose can remain private.', refs: [turn(result, 'B').evidenceIds[0]] } };
    equivalent(result, 'B', privateUpdate);
  });

  it('requires first contact and replies as before but permits silence when nobody is available', () => {
    let f: Fixture = fixture();
    for (let i = 0; i < 24; i += 2) f = equivalent(f, RESIDENTS[i].id, raw(undefined, RESIDENTS[i + 1].id));
    equivalent(f, 'Y', { project });
    const fresh = fixture(), missing = ordered({ project });
    expect(decodeOrderedCapabilityChoice(fresh.state, fresh.world, turn(fresh), missing).ok).toBe(false);
    const active = equivalent(fresh, 'A', raw());
    expect(decodeOrderedCapabilityChoice(active.state, active.world, turn(active, 'B'), missing).ok).toBe(false);
  });

  it('does not normalize malformed structure, unknown refs, fabricated parties or impossible work', () => {
    const f = fixture(), prepared = turn(f), valid = ordered(raw(work));
    const bad = [raw(work), { turn: [...valid.turn].reverse() }, { turn: [valid.turn[0]] }, { turn: [...valid.turn, {}] },
      { turn: valid.turn, deal: work }, { turn: [valid.turn[0], { ...valid.turn[1], deal: work }] },
      { turn: [{ ...valid.turn[0], from: 'B' }, valid.turn[1]] }, { turn: [{ choice: 'no_deal', cells: 1 }, valid.turn[1]] },
      { turn: [{ choice: 'accept:offer:missing' }, valid.turn[1]] },
      ordered(raw({ ...work, verb: 'grow', room: 'common' })),
      { turn: [valid.turn[0], { ...valid.turn[1], message: { to: 'B', text: 'A claim.', close: true } }] },
      { turn: [valid.turn[0], { ...valid.turn[1], reflection: { text: 'Unknown secret.', refs: ['secret:unknown'] } }] },
      { turn: [valid.turn[0], { ...valid.turn[1], message: { to: 'A', text: 'Speaking for someone else.' } }] },
    ];
    for (const value of bad) {
      const result = applyOrderedCapabilityChoice(f.state, f.world, prepared, value, { nowMs: f.now + 1, generation: 0 });
      expect(result.ok).toBe(false); expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
    }
    for (const deal of [{ ...work, cells: 1.001 }, { ...work, units: 5 }, { ...work, slackWatches: 12 }])
      expect(toOrderedChoice(raw(deal)).ok).toBe(false);
    expect(toOrderedChoice({ ...raw(), offer: {} }).ok).toBe(false);
    expect(fromOrderedChoice({ turn: [{ choice: 'no_deal' }, { respond: {} }] }).ok).toBe(false);
  });

  it('revalidates clocks, control, funds and replay against the unchanged authoritative core', () => {
    const f = equivalent(fixture(), 'A', raw(work)), prepared = turn(f, 'B');
    const response = ordered(raw({ kind: 'accept', offerId: f.state.offers[0].id }, 'A'));
    const before = structuredClone(f);
    for (const control of [{ nowMs: f.now + 1, generation: 1 }, { nowMs: prepared.expiresAtMs, generation: 0 }]) {
      const result = applyOrderedCapabilityChoice(f.state, f.world, prepared, response, control);
      expect(result.ok).toBe(false); expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
    }
    const poor = structuredClone(f); poor.world.bodies.A.cells = 0;
    expect(applyOrderedCapabilityChoice(poor.state, poor.world, prepared, response, { nowMs: f.now + 1, generation: 0 }).code).toBe('insufficient_cells');
    const expired = structuredClone(f); expired.world.watch = 3;
    expect(applyOrderedCapabilityChoice(expired.state, expired.world, prepared, response, { nowMs: f.now + 1, generation: 0 }).ok).toBe(false);
    const accepted = applyOrderedCapabilityChoice(f.state, f.world, prepared, response, { nowMs: f.now + 1, generation: 0 });
    expect(accepted.code).toBe('applied');
    expect(applyOrderedCapabilityChoice(accepted.state, accepted.world, prepared, { malformed: true }, { nowMs: f.now + 2, generation: 0 }).code).toBe('already_applied');
    expect(applyOrderedCapabilityChoice(accepted.state, accepted.world, prepared, response, { nowMs: f.now + 2, generation: 1 }).code).toBe('stale_control');
    expect(f).toEqual(before);
  });

  it('does not consult private counterpart balances or expose another person’s private context', () => {
    const f = fixture(), p4 = proposalCapabilityChoiceJsonSchema(f.state, f.world, turn(f));
    const before = JSON.stringify(p4), poor = structuredClone(f);
    poor.world.bodies.B.cells = 0;
    const schema = orderedCapabilityChoiceJsonSchema(f.state, f.world, turn(f));
    expect(orderedCapabilityChoiceJsonSchema(poor.state, poor.world, turn(poor))).toEqual(schema);
    expect(orderedChoiceJsonSchemaFromProposal(p4)).toEqual(schema);
    expect(JSON.stringify(p4)).toBe(before);
    for (const resident of RESIDENTS) expect(JSON.stringify(schema)).not.toContain(resident.wants);
  });

  it('adapts formatting of exact older instructions without changing normative rules or language policy', () => {
    const saved = SOCIETY_PROPOSAL_SYSTEM;
    const frozen = saved.replace('Write all free text in English:', 'Synthetic frozen language instruction:');
    const adapted = orderedSystemFromProposalSystem(frozen);
    expect(SOCIETY_PROPOSAL_SYSTEM).toBe(saved);
    expect(SOCIETY_ORDERED_SYSTEM).toBe(orderedSystemFromProposalSystem(saved));
    expect(adapted).toContain('Synthetic frozen language instruction:');
    expect(adapted).toContain('Return only {"turn":[decision,content]}');
    expect(adapted).toContain('Acceptance keeps the exact existing terms.');
    expect(adapted).toContain('A new matching proposal replaces the old offer; it does not accept it.');
    expect(adapted).toContain('A proposal is not consent, execution or payment.');
    expect(adapted).toContain('propose_work means you work and the other person pays');
    expect(adapted).not.toContain('Choose one deal:'); expect(adapted).not.toContain('use deal, including first contact');
  });
});
