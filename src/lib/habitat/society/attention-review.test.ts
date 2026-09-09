import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { genesisState, type WorldState } from '../engine/state';
import { totalCells } from '../engine/economy';
import { RESIDENTS, type ResidentId } from '../residents';
import { createSocietyState } from './state';
import { applySocietyTurn, prepareSocietyTurn } from './turn';
import { parseSocietyState } from './schema';
import { societyPublicView } from './public';
import { applyRetrievalCapabilityChoice, prepareRetrievalTurn, retrievalCapabilityChoiceJsonSchema } from './retrieval-choice';
import { channelNeedsReview } from './dialogue';
import { applyAttentionCapabilityChoice, attentionCapabilityChoiceJsonSchema, prepareAttentionTurn } from './attention-choice';
import type { PreparedTurn, SocietyState, TurnResponse } from './types';

type Fixture = { world: WorldState; state: SocietyState; now: number };
function fixture(): Fixture {
  const world = genesisState(91);
  for (const { id } of RESIDENTS) world.bodies[id].cells = 20;
  world.economy.ledger.initialCells = totalCells(world);
  let f = { world, state: createSocietyState(world, 1000), now: 2000 };
  // Real private decisions avoid making the tests depend on first-purpose grammar.
  for (const { id } of RESIDENTS) f = legacyAct(f, id, { project: { mode: 'replace',
    goal: `Consider my own choices as ${id}.`, why: `A private reason belonging only to ${id}.`, visibility: 'private', steps: [] } });
  return f;
}
function initial(f: Fixture, actor: ResidentId): PreparedTurn {
  return prepareSocietyTurn(f.state, f.world, actor, { nowMs: f.now, generation: 0,
    sequence: f.state.minds[actor].lastAppliedSequence + 1, maxPromptBytes: 6500 });
}
function legacyAct(f: Fixture, actor: ResidentId, response: TurnResponse): Fixture {
  const result = applySocietyTurn(f.state, f.world, initial(f, actor), response, { nowMs: f.now + 1, generation: 0 });
  if (!result.ok) throw new Error(`Fixture legacy operation failed: ${result.code}`);
  return { state: result.state, world: result.world, now: f.now + 100 };
}
const prepare = (f: Fixture, actor: ResidentId) => prepareAttentionTurn(f.state, f.world, initial(f, actor));
const contact = (to: ResidentId, extra: Record<string, unknown> = {}) => ({ attention: { kind: 'contact' },
  content: { message: { to, text: 'I would like to discuss this with you.' }, ...extra } });
const reply = (conversationId: string, to: ResidentId, extra: Record<string, unknown> = {}) => ({
  attention: { kind: 'reply', conversationId }, content: { message: { to, text: 'I am considering your message.' }, ...extra } });
const leave = (conversationId: string) => ({ attention: { kind: 'leave', conversationId }, content: {} });
const privateReview = (conversationId: string | null) => ({ attention: { kind: 'private', conversationId }, content: {} });
function act(f: Fixture, actor: ResidentId, raw: unknown, turn = prepare(f, actor)): Fixture {
  const schema = z.fromJSONSchema(attentionCapabilityChoiceJsonSchema(f.state, f.world, turn));
  expect(schema.safeParse(raw).success, 'The issued P8 contract must admit the chosen operation.').toBe(true);
  const result = applyAttentionCapabilityChoice(f.state, f.world, turn, raw, { nowMs: f.now + 1, generation: 0 });
  expect(result.ok, result.code).toBe(true);
  expect(result.code).toBe('applied');
  expect(parseSocietyState(JSON.parse(JSON.stringify(result.state))).ok).toBe(true);
  return { state: result.state, world: result.world, now: f.now + 100 };
}
function refused(f: Fixture, actor: ResidentId, raw: unknown, turn = prepare(f, actor)) {
  const original = structuredClone(f);
  const result = applyAttentionCapabilityChoice(f.state, f.world, turn, raw, { nowMs: f.now + 1, generation: 0 });
  expect(result.ok, 'An unavailable choice must not apply partially.').toBe(false);
  expect(result.state).toBe(f.state); expect(result.world).toBe(f.world); expect(f).toEqual(original);
  return result;
}
function channel(f: Fixture, first: ResidentId, second: ResidentId) {
  const found = f.state.conversations.find(c => c.status === 'open' && c.participants.includes(first) && c.participants.includes(second));
  if (!found) throw new Error('Missing fixture channel');
  return found;
}

beforeEach(() => vi.stubGlobal('fetch', () => { throw new Error('Independent P8 review forbids network and inference'); }));
afterEach(() => vi.unstubAllGlobals());

describe('independent P8 attention and consent review', () => {
  it('requires a first purpose before an empty private review, but does not require a first message', () => {
    const world = genesisState(91), f = { world, state: createSocietyState(world, 1000), now: 2000 };
    const turn = prepare(f, 'A');
    expect(z.fromJSONSchema(attentionCapabilityChoiceJsonSchema(f.state, f.world, turn))
      .safeParse(privateReview(null)).success).toBe(false);
    refused(f, 'A', privateReview(null), turn);
    const begun = act(f, 'A', { attention: { kind: 'private', conversationId: null }, content: { project: {
      mode: 'replace', goal: 'Consider whether I want to consult anybody.', why: 'I need time to decide.', visibility: 'private', steps: [] } } }, turn);
    expect(begun.state.conversations).toHaveLength(0);
    const considered = act(begun, 'A', privateReview(null));
    expect(considered.state.minds.A.project).toEqual(begun.state.minds.A.project);
    expect(considered.world).toEqual(f.world);
  });

  it('lets the unpaired twenty-fifth resident contact a person in a real legacy pair without replacing that pair', () => {
    let f = fixture();
    const pairs: Array<[ResidentId, ResidentId]> = [['A', 'U'], ['B', 'K'], ['C', 'N'], ['D', 'H'], ['E', 'L'], ['F', 'M'],
      ['G', 'Q'], ['I', 'O'], ['J', 'X'], ['P', 'V'], ['R', 'S'], ['T', 'Y']];
    for (const [from, to] of pairs) f = legacyAct(f, from, { message: { to, text: 'An existing conversation is waiting for a reply.' } });
    const old = prepareRetrievalTurn(f.state, f.world, initial(f, 'W'));
    expect(z.fromJSONSchema(retrievalCapabilityChoiceJsonSchema(f.state, f.world, old))
      .safeParse({ message: { to: 'A', text: 'May I consult you?' } }).success).toBe(false);
    const before = structuredClone(f), prepared = prepare(f, 'W');
    f = act(f, 'W', contact('A'), prepared);
    expect(f.state.conversations).toHaveLength(13);
    expect(f.state.conversations.slice(0, 12)).toEqual(before.state.conversations);
    expect(channel(f, 'W', 'A').nextSpeaker).toBe('A');
    expect(f.world).toEqual(before.world);
    expect(f.state.offers).toEqual(before.state.offers); expect(f.state.agreements).toEqual(before.state.agreements);
  });

  it('enforces three channels at either endpoint and one unordered pair, then frees a slot by an explicit unilateral leave', () => {
    let f = fixture();
    for (const to of ['B', 'C', 'D'] as const) f = act(f, 'A', contact(to));
    const first = channel(f, 'A', 'B');
    expect(first.nextSpeaker).toBe('B');
    refused(f, 'A', contact('E')); refused(f, 'W', contact('A')); refused(f, 'B', contact('A'));
    refused(f, 'A', reply(first.id, 'B'));
    f = act(f, 'B', reply(first.id, 'A'));
    expect(f.state.conversations).toHaveLength(3);
    f = act(f, 'A', leave(channel(f, 'A', 'C').id));
    f = act(f, 'A', contact('E'));
    expect(f.state.conversations.filter(c => c.status === 'open' && c.participants.includes('A'))).toHaveLength(3);
    expect(channel(f, 'A', 'E').participants).toEqual(['A', 'E']);
  });

  it('keeps issued contact permissions fixed when a third party frees capacity and rechecks capacity when it fills', () => {
    let f = fixture();
    for (const to of ['B', 'C', 'D'] as const) f = act(f, 'A', contact(to));
    const withheld = prepare(f, 'W');
    expect(z.fromJSONSchema(attentionCapabilityChoiceJsonSchema(f.state, f.world, withheld)).safeParse(contact('A')).success).toBe(false);
    f = act(f, 'A', leave(channel(f, 'A', 'D').id));
    expect(f.state.minds.W.revision).toBe(withheld.mindRevision);
    expect(z.fromJSONSchema(attentionCapabilityChoiceJsonSchema(f.state, f.world, withheld)).safeParse(contact('A')).success).toBe(false);
    refused(f, 'W', contact('A'), withheld);
    const newlyOffered = prepare(f, 'W');
    expect(z.fromJSONSchema(attentionCapabilityChoiceJsonSchema(f.state, f.world, newlyOffered)).safeParse(contact('A')).success).toBe(true);
    f = act(f, 'A', contact('E'));
    expect(f.state.minds.W.revision).toBe(newlyOffered.mindRevision);
    refused(f, 'W', contact('A'), newlyOffered);
  });

  it('leaves while waiting without changing accepted obligations or another channel’s open offer', () => {
    let f = act(fixture(), 'A', contact('B', { deal: { kind: 'loan', direction: 'lend', cells: 2, dueInDays: 2 } }));
    const ab = channel(f, 'A', 'B').id;
    f = act(f, 'B', reply(ab, 'A', { deal: { kind: 'accept', offerId: f.state.offers[0].id } }));
    f = act(f, 'A', reply(ab, 'B', { deal: { kind: 'work', role: 'hire', cells: 3, verb: 'filter_water', room: 'well', units: 1, slackWatches: 0 } }));
    f = act(f, 'A', contact('C', { deal: { kind: 'transfer', direction: 'give', cells: 1 } }));
    const ac = channel(f, 'A', 'C').id, before = structuredClone(f);
    expect(channel(f, 'A', 'B').nextSpeaker).toBe('B');
    f = act(f, 'A', leave(ab));
    expect(f.state.conversations.find(c => c.id === ab)).toMatchObject({ status: 'closed', nextSpeaker: null,
      turns: before.state.conversations.find(c => c.id === ab)!.turns });
    expect(f.state.offers.find(o => o.conversationId === ab && o.terms.kind === 'work')?.status).toBe('expired');
    expect(f.state.offers.find(o => o.conversationId === ac)?.status).toBe('open');
    expect(f.state.agreements).toEqual(before.state.agreements);
    expect(f.state.agreements[0]).toMatchObject({ status: 'active', terms: { kind: 'loan', cells: 2 } });
    expect(f.world).toEqual(before.world);
  });

  it('binds an acceptance to the selected counterpart and never treats speech or private consideration as consent', () => {
    let f = act(fixture(), 'B', contact('A', { deal: { kind: 'transfer', direction: 'give', cells: 2 } }));
    f = act(f, 'C', contact('A', { deal: { kind: 'transfer', direction: 'give', cells: 3 } }));
    const ab = channel(f, 'A', 'B').id, ac = channel(f, 'A', 'C').id;
    const offerB = f.state.offers.find(o => o.conversationId === ab)!, offerC = f.state.offers.find(o => o.conversationId === ac)!;
    refused(f, 'A', reply(ab, 'B', { deal: { kind: 'accept', offerId: offerC.id } }));
    refused(f, 'A', reply(ab, 'C', { deal: { kind: 'accept', offerId: offerC.id } }));
    refused(f, 'A', { attention: { kind: 'private', conversationId: ab }, content: { deal: { kind: 'accept', offerId: offerB.id } } });
    const considered = act(f, 'A', privateReview(ab));
    expect(considered.state.agreements).toHaveLength(0); expect(considered.world).toEqual(f.world);
    const words = act(f, 'A', reply(ab, 'B', { message: { to: 'B', text: 'I accept your offer.' } }));
    expect(words.state.agreements).toHaveLength(0); expect(words.world).toEqual(f.world);
    const accepted = act(f, 'A', reply(ab, 'B', { deal: { kind: 'accept', offerId: offerB.id } }));
    expect(accepted.state.agreements).toHaveLength(1);
    expect(accepted.world.bodies.A.cells).toBe(f.world.bodies.A.cells + 2);
    expect(accepted.world.bodies.B.cells).toBe(f.world.bodies.B.cells - 2);
    expect(accepted.world.bodies.C.cells).toBe(f.world.bodies.C.cells);
    expect(accepted.state.offers.find(o => o.id === offerC.id)?.status).toBe('open');
  });

  it('shows the exact latest own and received words from all three channels without exposing another private purpose', () => {
    let f = fixture();
    const exact: string[] = [];
    for (const other of ['B', 'C', 'D'] as const) {
      f = act(f, 'A', contact(other, { message: { to: other, text: `Earlier words for ${other}.` } }));
      const id = channel(f, 'A', other).id;
      const received = `Received from ${other}: quantities remain uncertain; do not claim delivery before a receipt exists.`;
      const own = `My latest reply to ${other}: I will consider this account and distinguish a proposal from a completed operation.`;
      exact.push(received, own);
      f = act(f, other, reply(id, 'A', { message: { to: 'A', text: received } }));
      f = act(f, 'A', reply(id, other, { message: { to: other, text: own } }));
    }
    const before = structuredClone(f), turn = prepare(f, 'A');
    for (const text of exact) expect(turn.prompt).toContain(text);
    expect(turn.prompt).not.toContain('A private reason belonging only to K.');
    expect(turn.prompt).not.toContain('Consider my own choices as K.');
    expect(turn.promptBytes).toBe(new TextEncoder().encode(turn.prompt).length);
    expect(f).toEqual(before);
  });

  it('acknowledges only the deliberately selected incoming channel, including an empty private review', () => {
    let f = act(fixture(), 'B', contact('A'));
    f = act(f, 'C', contact('A'));
    const ab = channel(f, 'A', 'B').id, ac = channel(f, 'A', 'C').id;
    expect(channelNeedsReview(channel(f, 'A', 'B'), 'A')).toBe(true);
    expect(channelNeedsReview(channel(f, 'A', 'C'), 'A')).toBe(true);
    const noSelection = act(f, 'A', privateReview(null));
    expect(channelNeedsReview(channel(noSelection, 'A', 'B'), 'A')).toBe(true);
    expect(channelNeedsReview(channel(noSelection, 'A', 'C'), 'A')).toBe(true);
    const before = structuredClone(f), turn = prepare(f, 'A');
    f = act(f, 'A', privateReview(ab), turn);
    expect(channelNeedsReview(channel(f, 'A', 'B'), 'A')).toBe(false);
    expect(channelNeedsReview(channel(f, 'A', 'C'), 'A')).toBe(true);
    expect(f.state.conversations.find(c => c.id === ac)).toEqual(before.state.conversations.find(c => c.id === ac));
    expect(f.state.conversations.flatMap(c => c.turns)).toEqual(before.state.conversations.flatMap(c => c.turns));
    expect(f.state.offers).toEqual(before.state.offers); expect(f.state.agreements).toEqual(before.state.agreements); expect(f.world).toEqual(before.world);
    const replay = applyAttentionCapabilityChoice(f.state, f.world, turn, privateReview(ab), { nowMs: f.now + 1, generation: 0 });
    expect(replay.code).toBe('already_applied'); expect(replay.state).toBe(f.state); expect(replay.world).toBe(f.world);
  });

  it('retains three unread closing exchanges across an unrelated private success and consumes only the selected closure', () => {
    let f = fixture();
    const finalWords = ['B', 'C', 'D'].map(other => `Final words from ${other}: no agreement has been made.`);
    for (const [index, from] of (['B', 'C', 'D'] as const).entries()) f = act(f, from,
      contact('A', { message: { to: 'A', text: finalWords[index], close: true } }));
    const closed = f.state.conversations.filter(c => c.status === 'closed');
    expect(closed).toHaveLength(3);
    for (const c of closed) expect(channelNeedsReview(c, 'A')).toBe(true);
    f = act(f, 'A', privateReview(null));
    const turn = prepare(f, 'A');
    for (const text of finalWords) expect(turn.prompt).toContain(text);
    f = act(f, 'A', privateReview(closed[1].id), turn);
    expect(f.state.conversations.map(c => channelNeedsReview(c, 'A'))).toEqual([true, false, true]);
    const publicJson = JSON.stringify(societyPublicView(f.state));
    expect(publicJson).not.toContain('attentionThrough');
  });

  it('does not consume an incoming channel when preparing, looking up records, or rejecting a model response', () => {
    let f = act(fixture(), 'B', contact('A'));
    const before = structuredClone(f), turn = prepare(f, 'A'), id = channel(f, 'A', 'B').id;
    expect(f).toEqual(before);
    refused(f, 'A', { attention: { kind: 'private', conversationId: id }, content: { message: { to: 'B', text: 'Not a private action.' } } }, turn);
    f = act(f, 'A', { lookup: { kind: 'search', query: 'water' } }, turn);
    expect(f.state.conversations).toEqual(before.state.conversations);
    expect(channelNeedsReview(channel(f, 'A', 'B'), 'A')).toBe(true);
    expect(f.state.retrieval.A.pending).toBe(true);
    expect(f.world).toEqual(before.world);
  });

  it('appraises only the selected speaker once, without treating another channel’s shown message as interchangeable evidence', () => {
    let f = act(fixture(), 'B', contact('A'));
    f = act(f, 'C', contact('A'));
    const ab = channel(f, 'A', 'B'), ac = channel(f, 'A', 'C');
    const appraisal = { axis: 'trust', delta: -1, ref: ab.turns.at(-1)!.id, why: 'I am unsure about the account I received.' };
    refused(f, 'A', { attention: { kind: 'private', conversationId: ab.id },
      content: { appraisal: { ...appraisal, ref: ac.turns.at(-1)!.id } } });
    const before = structuredClone(f), raw = { attention: { kind: 'private', conversationId: ab.id }, content: { appraisal } };
    f = act(f, 'A', raw);
    expect(f.world.axes.get('AC')).toEqual(before.world.axes.get('AC'));
    expect(f.world.axes.get('AB')!.trust).toBe(Math.max(0, before.world.axes.get('AB')!.trust - 1));
    expect(f.state.conversations.find(c => c.id === ac.id)).toEqual(before.state.conversations.find(c => c.id === ac.id));
    expect(f.state.conversations.flatMap(c => c.turns)).toEqual(before.state.conversations.flatMap(c => c.turns));
    refused(f, 'A', raw);
  });

  it('refuses a stale choice after incoming speech in another channel, without losing either incoming message', () => {
    let f = act(fixture(), 'B', contact('A'));
    f = act(f, 'A', contact('C'));
    const ab = channel(f, 'A', 'B').id, ac = channel(f, 'A', 'C').id, old = prepare(f, 'A');
    f = act(f, 'C', reply(ac, 'A'));
    const result = refused(f, 'A', privateReview(ab), old);
    expect(result.code).toBe('stale_mind');
    expect(channelNeedsReview(channel(f, 'A', 'B'), 'A')).toBe(true);
    expect(channelNeedsReview(channel(f, 'A', 'C'), 'A')).toBe(true);
  });

  it('rejects forged selection, cross-channel speech, unknown keys and combined lookup without partial effects', () => {
    let f = act(fixture(), 'B', contact('A'));
    f = act(f, 'C', contact('D'));
    const own = channel(f, 'A', 'B').id, other = channel(f, 'C', 'D').id, turn = prepare(f, 'A');
    for (const raw of [leave(other), privateReview(other), reply(other, 'C'), reply(own, 'D'),
      { attention: { kind: 'leave', conversationId: own }, content: { message: { to: 'B', text: 'Invented combined close.' } } },
      { ...privateReview(own), lookup: { kind: 'refresh' } },
      { attention: { kind: 'private', conversationId: own, actor: 'B' }, content: {} },
      { attention: { kind: 'private', conversationId: own }, content: {}, revision: 123 },
      { message: { to: 'B', text: 'Missing explicit attention choice.' } },
    ]) {
      expect(z.fromJSONSchema(attentionCapabilityChoiceJsonSchema(f.state, f.world, turn)).safeParse(raw).success).toBe(false);
      refused(f, 'A', raw, turn);
    }
  });

  it('preserves a previously issued P7 reply when the counterpart opens a different P8 channel', () => {
    let f = legacyAct(fixture(), 'A', { message: { to: 'B', text: 'This is the original exclusive exchange.' } });
    const ab = channel(f, 'A', 'B').id;
    const old = prepareRetrievalTurn(f.state, f.world, initial(f, 'B'));
    const oldSchema = retrievalCapabilityChoiceJsonSchema(f.state, f.world, old);
    f = act(f, 'A', contact('C'));
    const ac = structuredClone(channel(f, 'A', 'C'));
    expect(f.state.minds.B.revision).toBe(old.mindRevision);
    const raw = { message: { to: 'A', text: 'I am replying only to our original exchange.' } };
    expect(z.fromJSONSchema(oldSchema).safeParse(raw).success).toBe(true);
    const result = applyRetrievalCapabilityChoice(f.state, f.world, old, raw, { nowMs: f.now + 1, generation: 0 });
    expect(result.ok, result.code).toBe(true);
    expect(result.state.conversations.find(c => c.id === ab)?.turns.at(-1)?.speaker).toBe('B');
    expect(result.state.conversations.find(c => c.id === ac.id)).toEqual(ac);
    expect(result.world).toEqual(f.world);
    expect(parseSocietyState(result.state).ok).toBe(true);
  });
});
