import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { genesisState } from '../engine/state';
import { totalCells } from '../engine/economy';
import { RESIDENTS, type ResidentId } from '../residents';
import { createSocietyState } from './state';
import { prepareSocietyTurn, applySocietyTurn } from './turn';
import { prepareAttentionTurn, attentionCapabilityChoiceJsonSchema, applyAttentionCapabilityChoice } from './attention-choice';
import { advanceSocietyWatch } from './record-watch';
import { parseSocietyState } from './schema';
import { offerDispositionJsonSchema, applyOfferDisposition, toOfferDispositionResponse,
  fromOfferDispositionResponse, projectOfferDispositionSchema, SOCIETY_OFFER_DISPOSITION_SYSTEM } from './offer-disposition';

function initialFixture() {
  const world = genesisState(91);
  for (const { id } of RESIDENTS) {
    world.bodies[id].cells = 20;
    for (const key of Object.keys(world.bodies[id].condition) as Array<keyof typeof world.bodies.A.condition>)
      world.bodies[id].condition[key] = 95;
  }
  world.economy.ledger.initialCells = totalCells(world);
  let state = createSocietyState(world, 1000);
  for (const { id } of RESIDENTS) {
    const turn = prepareSocietyTurn(state, world, id, { nowMs: 2000, sequence: 0, generation: 0 });
    const result = applySocietyTurn(state, world, turn, { project: { mode: 'replace',
      goal: 'Consider my next contribution.', why: 'A synthetic private purpose.', visibility: 'private', steps: [] } },
    { nowMs: 2001, generation: 0 });
    expect(result.ok, result.code).toBe(true); state = result.state;
  }
  return { state, world, now: 3000 };
}
type Fixture = ReturnType<typeof initialFixture>;
let pristine: Fixture;
beforeAll(() => { pristine = initialFixture(); });
const fixture = () => structuredClone(pristine);
const prepare = (f: Fixture, actor: ResidentId) => prepareAttentionTurn(f.state, f.world,
  prepareSocietyTurn(f.state, f.world, actor, { nowMs: f.now, sequence: f.state.minds[actor].lastAppliedSequence + 1,
    generation: 0, maxPromptBytes: 6500, dialoguePolicy: 'concurrent-v1', conversationId: null }));
function act(f: Fixture, actor: ResidentId, raw: unknown): Fixture {
  const r = applyAttentionCapabilityChoice(f.state, f.world, prepare(f, actor), raw, { nowMs: f.now + 1, generation: 0 });
  expect(r.ok, r.code).toBe(true);
  return { state: r.state, world: r.world, now: f.now + 100 };
}
const contact = (to: ResidentId, deal?: unknown) => ({ attention: { kind: 'contact' },
  content: { message: { to, text: 'A synthetic proposal for your consideration.' }, ...(deal ? { deal } : {}) } });
const offered = (deal: unknown = { kind: 'transfer', direction: 'give', cells: 2 }) => act(fixture(), 'B', contact('A', deal));
const reply = (f: Fixture, extra = {}) => ({ attention: { kind: 'reply', conversationId: f.state.conversations[0]!.id },
  content: { message: { to: 'B', text: 'I am considering this proposal.' }, ...extra } });
const control = (f: Fixture) => ({ nowMs: f.now + 1, generation: 0 });
const valid = (schema: Record<string, unknown>, value: unknown) => z.fromJSONSchema(schema).safeParse(value).success;

describe('explicit disposition of an actual incoming offer', () => {
  it('changes no contract at all when no reply has an offered incoming decision', () => {
    const f = fixture(), turn = prepare(f, 'A'), old = attentionCapabilityChoiceJsonSchema(f.state, f.world, turn);
    expect(offerDispositionJsonSchema(f.state, f.world, turn)).toEqual(old);
    expect(projectOfferDispositionSchema(old).channels).toEqual([]);
    expect(SOCIETY_OFFER_DISPOSITION_SYSTEM).toContain('no_deal');
    expect(SOCIETY_OFFER_DISPOSITION_SYSTEM).not.toContain('Deal is optional, including first contact');
  });

  it('requires an explicit no-deal choice while the otherwise identical optional control permits omission', () => {
    const f = offered(), before = structuredClone(f), turn = prepare(f, 'A'), raw = reply(f);
    const converted = toOfferDispositionResponse(f.state, f.world, turn, raw);
    const required = offerDispositionJsonSchema(f.state, f.world, turn);
    const optional = offerDispositionJsonSchema(f.state, f.world, turn, { required: false });
    expect(valid(required, raw)).toBe(false); expect(valid(optional, raw)).toBe(true);
    expect(valid(required, converted)).toBe(true); expect(valid(optional, converted)).toBe(true);
    expect(fromOfferDispositionResponse(converted)).toEqual(raw);
    const failure = applyOfferDisposition(f.state, f.world, turn, raw, control(f));
    expect(failure.ok).toBe(false); expect(failure.state).toBe(f.state); expect(f).toEqual(before);
    const old = applyAttentionCapabilityChoice(f.state, f.world, turn, raw, control(f));
    expect(applyOfferDisposition(f.state, f.world, turn, converted, control(f))).toEqual(old);
    expect(applyOfferDisposition(f.state, f.world, turn, raw, control(f), { required: false })).toEqual(old);
    expect(old.state.agreements).toHaveLength(0); expect(old.world).toEqual(f.world);
  });

  it('keeps exact consent scoped to the chosen channel, with one transfer and idempotent replay', () => {
    let f = offered(); f = act(f, 'C', contact('A', { kind: 'transfer', direction: 'give', cells: 3 }));
    const turn = prepare(f, 'A'), raw = reply(f, { deal: { kind: 'accept', offerId: f.state.offers[0]!.id } });
    const projected = toOfferDispositionResponse(f.state, f.world, turn, raw);
    const result = applyOfferDisposition(f.state, f.world, turn, projected, control(f));
    expect(result).toEqual(applyAttentionCapabilityChoice(f.state, f.world, turn, raw, control(f)));
    expect(result.ok, result.code).toBe(true); expect(result.state.agreements).toHaveLength(1);
    expect(result.world.bodies.A.cells).toBe(22); expect(result.world.bodies.B.cells).toBe(18);
    expect(result.world.bodies.C.cells).toBe(20); expect(result.state.offers[1]!.status).toBe('open');
    const duplicate = applyOfferDisposition(result.state, result.world, turn, projected, control(f));
    expect(duplicate.code).toBe('already_applied'); expect(duplicate.state).toEqual(result.state); expect(duplicate.world).toEqual(result.world);
    const wrong = { ...(projected as object), decision: { choice: `accept:${f.state.offers[1]!.id}` } };
    expect(applyOfferDisposition(f.state, f.world, turn, wrong, control(f)).ok).toBe(false);
  });

  it('preserves every proposal family and exact numeric/capability bounds rather than choosing terms', () => {
    const f = offered(), turn = prepare(f, 'A');
    // Every case uses the same immutable state/turn. Compile its large schema
    // once; rebuilding it per payload made this regression time out on CI.
    const proposalSchema = z.fromJSONSchema(offerDispositionJsonSchema(f.state, f.world, turn));
    const deals = [
      { kind: 'accept', offerId: f.state.offers[0]!.id }, { kind: 'reject', offerId: f.state.offers[0]!.id },
      ...['give', 'ask'].map(direction => ({ kind: 'transfer', direction, cells: 1.25 })),
      ...['lend', 'borrow'].map(direction => ({ kind: 'loan', direction, cells: 2.75, dueInDays: 3 })),
      ...['work', 'hire'].flatMap(role => [['grow', 'garden'], ['filter_water', 'well'], ['clean_space', 'common'],
        ['repair', 'workshops'], ['dig', 'face'], ['cook', 'kitchen']].map(([verb, room]) =>
        ({ kind: 'work', role, cells: 0, units: 1, slackWatches: 0, verb, room }))),
    ];
    for (const deal of deals) {
      const raw = reply(f, { deal }), projected = toOfferDispositionResponse(f.state, f.world, turn, raw);
      expect(fromOfferDispositionResponse(projected)).toEqual(raw);
      expect(proposalSchema.safeParse(projected).success).toBe(true);
      expect(applyOfferDisposition(f.state, f.world, turn, projected, control(f)))
        .toEqual(applyAttentionCapabilityChoice(f.state, f.world, turn, raw, control(f)));
    }
    for (const decision of [
      { choice: 'accept:invented' }, { choice: 'no_deal', cells: 1 },
      { choice: 'propose_give', cells: 0 }, { choice: 'propose_give', cells: 1.001 },
      { choice: 'propose_work', cells: 0, units: 1, slackWatches: 0, task: { verb: 'grow', room: 'common' } },
    ]) expect(proposalSchema.safeParse({ ...reply(f), decision }).success).toBe(false);
  });

  it('does not require disposition during private work, contact, leaving or exclusive lookup', () => {
    const f = offered(), turn = prepare(f, 'A'), channel = f.state.conversations[0]!.id;
    for (const raw of [
      { attention: { kind: 'private', conversationId: channel }, content: {} },
      { attention: { kind: 'private', conversationId: null }, content: {} },
      { attention: { kind: 'leave', conversationId: channel }, content: {} },
      contact('D'), { lookup: { kind: 'search', query: '' } },
    ]) {
      expect(valid(attentionCapabilityChoiceJsonSchema(f.state, f.world, turn), raw)).toBe(true);
      expect(valid(offerDispositionJsonSchema(f.state, f.world, turn), raw)).toBe(true);
      expect(applyOfferDisposition(f.state, f.world, turn, raw, control(f)))
        .toEqual(applyAttentionCapabilityChoice(f.state, f.world, turn, raw, control(f)));
      expect(valid(offerDispositionJsonSchema(f.state, f.world, turn), { ...raw, decision: { choice: 'no_deal' } })).toBe(false);
    }
  });

  it('keeps records atomic with consent, exact text intact, and rejects a second economic operation', () => {
    const f = offered(), turn = prepare(f, 'A');
    const content = { deal: { kind: 'accept', offerId: f.state.offers[0]!.id },
      record: { kind: 'draft', parent: null, title: 'My synthetic decision', text: 'Exact text.\nA new line.',
        refs: [], audience: 'private', publish: false } };
    const raw = reply(f, content);
    const projected = toOfferDispositionResponse(f.state, f.world, turn, raw) as { content: Record<string, unknown> };
    const r = applyOfferDisposition(f.state, f.world, turn, projected, control(f));
    expect(r).toEqual(applyAttentionCapabilityChoice(f.state, f.world, turn, raw, control(f)));
    expect(r.ok, r.code).toBe(true); expect(r.state.records.drafts.at(-1)!.text).toBe('Exact text.\nA new line.');
    const duplicate = { ...projected, content: { ...projected.content, deal: content.deal } };
    expect(applyOfferDisposition(f.state, f.world, turn, duplicate, control(f)).ok).toBe(false);
    const badRecord = { ...projected, content: { ...projected.content, record: { ...content.record, text: '🙂'.repeat(200) } } };
    const failed = applyOfferDisposition(f.state, f.world, turn, badRecord, control(f));
    expect(failed.ok).toBe(false); expect(failed.state).toBe(f.state); expect(failed.world).toBe(f.world);
  });

  it('executes accepted work through the native physical engine and settles its actual paid obligation', () => {
    const f = offered({ kind: 'work', role: 'hire', cells: 3, units: 1, slackWatches: 1, verb: 'grow', room: 'garden' });
    const turn = prepare(f, 'A'), raw = reply(f, { deal: { kind: 'accept', offerId: f.state.offers[0]!.id } });
    const accepted = applyOfferDisposition(f.state, f.world, turn, toOfferDispositionResponse(f.state, f.world, turn, raw), control(f));
    expect(accepted.ok, accepted.code).toBe(true); expect(accepted.state.agreements[0]!.status).toBe('active');
    const watch = advanceSocietyWatch(accepted.state, accepted.world, f.now + 1000);
    expect(watch.observations.find(o => o.actor === 'A')).toMatchObject({ intent: { verb: 'grow' }, outcome: { ok: true }, actualRoom: 'garden' });
    expect(watch.state.agreements[0]).toMatchObject({ status: 'fulfilled', progress: 1, terms: { cells: 3 } });
    expect(watch.state.agreements[0]!.evidenceIds).toHaveLength(1);
    expect(parseSocietyState(watch.state).ok).toBe(true);
    const ledger = watch.world.economy.ledger;
    expect(totalCells(watch.world)).toBeCloseTo(ledger.initialCells + ledger.minted - ledger.burned - ledger.leaked);
  });
});
