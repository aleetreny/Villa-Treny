import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { type ResidentId } from '../residents';
import { genesisState } from '../engine/state';
import { applySocietyTurn, createSocietyState, prepareSocietyTurn } from './index';
import { parseTurnResponse, societyTurnJsonSchema } from './schema';

const options = { nowMs: 2000, sequence: 0, generation: 0 };
function fixture() { const world = genesisState(91); return { world, state: createSocietyState(world, 1000) }; }
type Fixture = ReturnType<typeof fixture>;
function grammar(f: Fixture, actor: ResidentId, nowMs = 2000, sequence = 0) {
  const turn = prepareSocietyTurn(f.state, f.world, actor, { ...options, nowMs, sequence });
  const schema = societyTurnJsonSchema(f.state, f.world, turn);
  return { turn, schema, accepts: (raw: unknown) => z.fromJSONSchema(schema).safeParse(raw).success };
}
const purpose = { project: { mode: 'replace', goal: 'Ask to be consulted about a shared decision.', why: 'I want a meaningful part in this place.',
  visibility: 'public', steps: [] } };
function apply(f: Fixture, actor: ResidentId, raw: unknown, nowMs = 2000, sequence = 0): Fixture {
  const result = applySocietyTurn(f.state, f.world, grammar(f, actor, nowMs, sequence).turn, raw, { nowMs: nowMs + 1, generation: 0 });
  expect(result.ok, result.code).toBe(true); return { state: result.state, world: result.world };
}

describe('the provider receives the current voice’s actual operations', () => {
  it('admits a social purpose without a fake physical action and excludes inapplicable commands', () => {
    const g = grammar(fixture(), 'B');
    expect(g.accepts(purpose)).toBe(true); expect(parseTurnResponse(purpose).ok).toBe(true);
    expect(g.accepts({ project: { mode: 'abandon', why: 'No project.' } })).toBe(false);
    expect(g.accepts({ respond: { offerId: 'none', decision: 'reject' } })).toBe(false);
    expect(g.accepts({ offer: { terms: {}, expiresInWatches: 1 } })).toBe(false);
    expect(g.accepts({ message: { to: 'B', text: 'Answer for myself.' } })).toBe(false);
    expect(g.accepts({ message: { to: 'A', text: 'Could you ask me about a shared decision?' } })).toBe(true);
    expect(g.accepts({ message: null })).toBe(false); // No silent null/default/placeholder normalization.
  });

  it('distinguishes destinations from people and rejects invented physical verbs', () => {
    const g = grammar(fixture(), 'A');
    const plan = (step: unknown) => ({ project: { ...purpose.project, steps: [step] } });
    expect(g.accepts(plan({ verb: 'note', at: 'library' }))).toBe(true);
    expect(g.accepts(plan({ verb: 'go', room: 'library' }))).toBe(true);
    expect(g.accepts(plan({ verb: 'go', at: 'library' }))).toBe(false);
    expect(g.accepts(plan({ verb: 'note', target: 'old books' }))).toBe(false);
    expect(g.accepts(plan({ verb: 'note', target: 'B' }))).toBe(false);
    expect(g.accepts(plan({ verb: 'inspect', at: 'imagined-room' }))).toBe(false);
    for (const verb of ['write', 'message', 'repairreactor', 'give', 'lend']) expect(g.accepts(plan({ verb }))).toBe(false);
    expect(g.accepts(plan({ verb: 'repay', target: 'B' }))).toBe(false);
    const f = fixture(); f.world.economy.debts.push({ id: 'loan:test', lender: 'B', borrower: 'A', principal: 2, remaining: 2,
      issuedDay: 100, dueDay: 101, status: 'open' });
    expect(grammar(f, 'A').accepts(plan({ verb: 'repay', target: 'B' }))).toBe(true);
    expect(grammar(f, 'A').accepts(plan({ verb: 'repay', target: 'C' }))).toBe(false);
  });

  it('stores a repeated citation once without repairing unknown evidence or changing the raw response', () => {
    const f = fixture(), g = grammar(f, 'A'), ref = g.turn.evidenceIds[0]!;
    const raw = { reflection: { text: 'I can take a first step towards my own purpose.', refs: [ref, ref, ref] } };
    // The initial provider grammar has only one available reference, so it asks
    // for one. Canonical parsing also handles repetitions in later/raw replies.
    expect(g.accepts(raw)).toBe(false);
    const parsed = parseTurnResponse(raw);
    expect(parsed.ok && parsed.value.reflection?.refs).toEqual([ref]);
    expect(raw.reflection.refs).toEqual([ref, ref, ref]);
    const applied = applySocietyTurn(f.state, f.world, g.turn, raw, { nowMs: 2001, generation: 0 });
    expect(applied.ok, applied.code).toBe(true);
    expect(applied.state.minds.A.memories.at(-1)?.refs).toEqual([ref]);
    const replay = applySocietyTurn(applied.state, applied.world, g.turn, raw, { nowMs: 2002, generation: 0 });
    expect(replay.code).toBe('already_applied'); expect(replay.state).toBe(applied.state);
    const unknown = { reflection: { ...raw.reflection, refs: [ref, 'fact:someone_else', 'fact:someone_else'] } };
    expect(applySocietyTurn(f.state, f.world, g.turn, unknown, { nowMs: 2001, generation: 0 }).code).toBe('unknown_evidence');
    expect(parseTurnResponse({ reflection: { ...raw.reflection, refs: Array(7).fill(ref) } }).ok).toBe(false);
  });

  it('opens negotiation only after a real message, keeps turn ownership and references exact live offers', () => {
    let f = apply(fixture(), 'A', { ...purpose, message: { to: 'B', text: 'Can we discuss a small loan?' } });
    const waiting = grammar(f, 'A', 3000, 1);
    expect(waiting.accepts({ message: { to: 'B', text: 'Your fabricated response.' } })).toBe(false);
    expect(waiting.accepts({ project: { mode: 'abandon', why: 'I changed my mind.' } })).toBe(true);
    const reply = grammar(f, 'B', 3000);
    const offer = { message: { to: 'A', text: 'I can lend two cells until day 101.', close: false },
      offer: { terms: { kind: 'loan', from: 'B', to: 'A', cells: 2, dueDay: 101 }, expiresInWatches: 2 } };
    expect(reply.accepts(offer)).toBe(true);
    expect(reply.accepts({ message: { to: 'C', text: 'A different conversation.' } })).toBe(false);
    f = apply(f, 'B', offer, 3000);
    const answer = grammar(f, 'A', 4000, 1), offerId = f.state.offers[0]!.id;
    const response = (id: string) => ({ message: { to: 'B', text: 'I agree to those terms.', close: false }, respond: { offerId: id, decision: 'accept' } });
    expect(answer.accepts(response(offerId))).toBe(true);
    expect(answer.accepts(response('none'))).toBe(false);
    expect(answer.accepts({ reflection: { text: 'I will use this claim carefully.', refs: [answer.turn.evidenceIds[0]] } })).toBe(true);
    expect(answer.accepts({ reflection: { text: 'Someone else’s private claim.', refs: ['fact:unknown-secret'] } })).toBe(false);
    expect(parseTurnResponse({ ...offer, ...response(offerId) }).ok).toBe(false); // Combined offer + answer remains invalid locally.
    for (const [raw, code] of [
      [{ ...offer, ...response(offerId) }, 'ambiguous_offer_response'],
      [{ ...response(offerId), message: { ...response(offerId).message, close: true } }, 'agreement_needs_open_message'],
      [{ respond: response(offerId).respond }, 'agreement_needs_open_message'],
    ] as const) {
      const rejected = applySocietyTurn(f.state, f.world, answer.turn, raw, { nowMs: 4001, generation: 0 });
      expect(rejected.code).toBe(code); expect(rejected.ok).toBe(false);
      expect(rejected.state).toBe(f.state); expect(rejected.world).toBe(f.world);
    }
    expect(grammar(f, 'C', 4000).accepts({ message: { to: 'A', text: 'Interrupt their active conversation.' } })).toBe(false);
  });

});
