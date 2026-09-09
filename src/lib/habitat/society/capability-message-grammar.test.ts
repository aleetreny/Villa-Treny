import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { genesisState } from '../engine/state';
import { applyCapabilityChoice, capabilityChoiceJsonSchema, decodeCapabilityChoice } from './capabilities';
import { decodeSocietyChoice, societyChoiceJsonSchema } from './choice';
import { createSocietyState } from './state';
import { prepareSocietyTurn } from './turn';
import { parseTurnResponse } from './schema';
import type { ResidentId } from '../residents';

const purpose = { mode: 'replace', goal: 'Discuss a precise agreement.', why: 'Ask before committing.', visibility: 'private', steps: [] };
function fixture() {
  let world = genesisState(91), state = createSocietyState(world, 1000), now = 2000, sequence = 0;
  const prepare = (actor: ResidentId) => prepareSocietyTurn(state, world, actor, { nowMs: now, generation: 0, sequence: sequence++ });
  const act = (actor: ResidentId, raw: unknown) => {
    const result = applyCapabilityChoice(state, world, prepare(actor), raw, { nowMs: now + 1, generation: 0 });
    expect(result.ok, result.code).toBe(true); state = result.state; world = result.world; now += 100;
  };
  act('A', { project: purpose, message: { to: 'B', text: 'Would you consider a transfer?' } });
  act('B', { project: purpose, message: { to: 'A', text: 'I offer two cells.', close: false },
    deal: { kind: 'transfer', direction: 'give', cells: 2 } });
  return { state, world, turn: prepare('A'), now };
}

describe('deal and open-message grammar', () => {
  it('preserves the canonical valid language for ordinary refusals, accept/reject and relative offers', () => {
    const f = fixture(), schema = capabilityChoiceJsonSchema(f.state, f.world, f.turn), compiled = z.fromJSONSchema(schema);
    const offerId = f.state.offers[0]!.id;
    const deals = [undefined, { kind: 'accept', offerId }, { kind: 'reject', offerId },
      { kind: 'transfer', direction: 'give', cells: 1.1 }, { kind: 'loan', direction: 'borrow', cells: 1, dueInDays: 1 }];
    for (const deal of deals) for (const close of [undefined, false, true, null, 'false']) {
      const raw = { message: { to: 'B', text: 'I have considered the proposal.', ...(close === undefined ? {} : { close }) },
        ...(deal ? { deal } : {}) };
      // Version2's independent strict decoder already enforces this condition.
      const expected = decodeSocietyChoice(f.state, f.world, f.turn, raw).ok;
      expect(compiled.safeParse(raw).success, JSON.stringify(raw)).toBe(expected);
      expect(decodeCapabilityChoice(f.state, f.world, f.turn, raw).ok).toBe(expected);
      if (deal) expect(expected).toBe(close === false);
      else expect(expected).toBe(close === undefined || typeof close === 'boolean');
    }
    const valid = { message: { to: 'B', text: 'I accept.', close: false }, deal: { kind: 'accept', offerId } };
    const result = applyCapabilityChoice(f.state, f.world, f.turn, valid, { nowMs: f.now + 1, generation: 0 });
    expect(result.code).toBe('applied'); expect(result.state.agreements[0]!.status).toBe('fulfilled');
    expect(applyCapabilityChoice(result.state, result.world, f.turn, valid, { nowMs: f.now + 2, generation: 0 }).code).toBe('already_applied');
  });

  it('rejects unknown fields at every level and preserves amount, target, reference and facility restrictions', () => {
    const f = fixture(), compiled = z.fromJSONSchema(capabilityChoiceJsonSchema(f.state, f.world, f.turn));
    const message = { to: 'B', text: 'I accept those terms.', close: false };
    const valid = { message, deal: { kind: 'accept', offerId: f.state.offers[0]!.id } };
    const incoming = f.state.conversations[0]!.turns.at(-1)!.id;
    const appraisal = { axis: 'trust', delta: 1, ref: incoming, why: 'The terms were clear.' };
    expect(compiled.safeParse({ ...valid, appraisal }).success).toBe(true);
    const invalid = [
      { ...valid, unknown: true }, { ...valid, offer: {} }, { ...valid, respond: {} },
      { ...valid, message: { ...message, extra: 1 } }, { ...valid, message: { ...message, to: 'C' } },
      { ...valid, message: { ...message, text: 'x'.repeat(301) } }, { ...valid, message: { to: 'B', close: false } },
      { ...valid, deal: { ...valid.deal, extra: 1 } }, { ...valid, deal: { ...valid.deal, offerId: 'invented' } },
      { ...valid, project: { ...purpose, extra: true } }, { ...valid, project: { ...purpose, steps: [{ verb: 'grow', at: 'common' }] } },
      { ...valid, reflection: { text: 'Invented.', refs: ['invented'] } },
      { ...valid, reflection: { text: 'Real reference.', refs: [incoming], extra: 1 } },
      { ...valid, appraisal: { ...appraisal, delta: 2 } }, { ...valid, appraisal: { ...appraisal, ref: 'invented' } },
      { ...valid, appraisal: { ...appraisal, extra: 1 } },
      ...[0, 0.001, 1000.1, -1].map(cells => ({ message, deal: { kind: 'transfer', direction: 'give', cells } })),
      ...[0, 31, 1.5].map(dueInDays => ({ message, deal: { kind: 'loan', direction: 'borrow', cells: 1, dueInDays } })),
      ...[0, 5].map(units => ({ message, deal: { kind: 'work', role: 'work', verb: 'repair', room: 'common', cells: 1, units, slackWatches: 0 } })),
      { message, deal: { kind: 'work', role: 'work', verb: 'repair', room: 'common', cells: 1, units: 1, slackWatches: 12 } },
      { message, deal: { kind: 'work', role: 'work', verb: 'filter_water', room: 'common', cells: 1, units: 1, slackWatches: 0 } },
      null, [], {},
    ];
    for (const raw of invalid) expect(compiled.safeParse(raw).success, JSON.stringify(raw)).toBe(false);
    // JSON grammar can constrain terms, not whether an arbitrary purpose is
    // advanced by growing. This known semantic limitation must not be hidden.
    expect(compiled.safeParse({ message, project: { ...purpose, goal: 'Write a short story.' },
      deal: { kind: 'work', role: 'work', verb: 'grow', room: 'garden', cells: 0, units: 1, slackWatches: 0 } }).success).toBe(true);
  });

  it('keeps the scheduler directory literal, initial purpose required, and earlier protocol interpretation unchanged', () => {
    const f = fixture();
    const older = societyChoiceJsonSchema(f.state, f.world, f.turn), saved = structuredClone(older);
    const current = capabilityChoiceJsonSchema(f.state, f.world, f.turn) as { properties: Record<string, unknown>; anyOf?: unknown[] };
    expect(current.properties.message).toEqual((older.properties as Record<string, unknown>).message);
    expect(current.anyOf).toHaveLength(2);
    expect(societyChoiceJsonSchema(f.state, f.world, f.turn)).toEqual(saved);
    const omitted = { message: { to: 'B', text: 'I accept.' }, deal: { kind: 'accept', offerId: f.state.offers[0]!.id } };
    expect(z.fromJSONSchema(older).safeParse(omitted).success).toBe(true);
    expect(decodeSocietyChoice(f.state, f.world, f.turn, omitted)).toEqual({ ok: false, code: 'deal_requires_open_message' });
    expect(parseTurnResponse({ message: { to: 'B', text: 'I propose a transfer.' },
      offer: { terms: { kind: 'transfer', from: 'A', to: 'B', cells: 1 }, expiresInWatches: 2 } }).ok).toBe(true);
    const world = genesisState(91), state = createSocietyState(world, 1000);
    const turn = prepareSocietyTurn(state, world, 'A', { nowMs: 2000, generation: 0, sequence: 0 });
    const initial = capabilityChoiceJsonSchema(state, world, turn);
    expect(initial.anyOf).toBeUndefined();
    expect(initial.required).toEqual(['project', 'message']);
    expect(z.fromJSONSchema(initial).safeParse({ message: { to: 'B', text: 'Hello.' } }).success).toBe(false);
    expect(z.fromJSONSchema(initial).safeParse({ project: purpose, message: { to: 'B', text: 'Hello.', close: true } }).success).toBe(true);
  });
});
