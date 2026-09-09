import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { genesisState } from '../engine/state';
import { totalCells } from '../engine/economy';
import { FACTS } from '../engine/knowledge';
import { VERBS } from '../engine/verbs';
import { RESIDENTS, type ResidentId } from '../residents';
import { ROOMS } from '../rooms';
import { applySocietyChoice, createSocietyState, decodeSocietyChoice, parseSocietyState,
  prepareSocietyTurn, societyChoiceJsonSchema, societyPublicView, watchNumber, type SocietyChoice, type SocietyDealChoice,
  WORK_VERBS, type OfferTerms, type PreparedTurn, type TurnResponse } from './index';

const purpose: TurnResponse['project'] = { mode: 'replace', goal: 'Keep track of my commitments.',
  why: 'I want promises to remain clear.', visibility: 'private', steps: [] };
function fixture() {
  const world = genesisState(91);
  for (const { id } of RESIDENTS) world.bodies[id].cells = 20;
  world.economy.ledger.initialCells = totalCells(world);
  return { world, state: createSocietyState(world, 1000), time: 2000 };
}
type Fixture = ReturnType<typeof fixture>;
function prepare(f: Fixture, actor: ResidentId): PreparedTurn {
  return prepareSocietyTurn(f.state, f.world, actor, { nowMs: f.time, generation: 0,
    sequence: f.state.minds[actor].lastAppliedSequence + 1 });
}
function initial(f: Fixture, actor: ResidentId, output: SocietyChoice): SocietyChoice {
  // Explicit synthetic fixture purpose; the adapter never supplies one.
  return { ...(!f.state.minds[actor].project ? { project: purpose } : {}), ...output };
}
function act(f: Fixture, actor: ResidentId, output: SocietyChoice): Fixture {
  const result = applySocietyChoice(f.state, f.world, prepare(f, actor), initial(f, actor, output),
    { nowMs: f.time + 1, generation: 0 });
  expect(result.code).toBe('applied');
  expect(parseSocietyState(result.state).ok).toBe(true);
  return { state: result.state, world: result.world, time: f.time + 100 };
}
function dialogue() {
  return act(fixture(), 'A', { message: { to: 'B', text: 'Could we discuss a possible arrangement?', close: false } });
}
function propose(deal: SocietyDealChoice, f = dialogue()) {
  return act(f, 'B', { message: { to: 'A', text: 'These are my proposed terms. Do you agree?', close: false }, deal });
}
function answer(f: Fixture, kind: 'accept' | 'reject' = 'accept'): SocietyChoice {
  return { message: { to: 'B', text: kind === 'accept' ? 'I agree to those exact terms.' : 'I do not agree.', close: false },
    deal: { kind, offerId: f.state.offers.at(-1)!.id } };
}
function rejectUnchanged(f: Fixture, actor: ResidentId, raw: unknown) {
  const before = JSON.stringify(f);
  const result = applySocietyChoice(f.state, f.world, prepare(f, actor), raw, { nowMs: f.time + 1, generation: 0 });
  expect(result.ok).toBe(false);
  expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
  expect(JSON.stringify(f)).toBe(before);
  return result;
}

describe('external choice grammar', () => {
  it('requires an authored initial purpose, permits a social purpose without fake work, and retains it later', () => {
    const f = fixture(), turn = prepare(f, 'A');
    const schema = societyChoiceJsonSchema(f.state, f.world, turn);
    expect(schema.required).toEqual(['project', 'message']);
    expect(Object.keys(schema.properties as object)).toEqual(['project', 'reflection', 'message']);
    expect(decodeSocietyChoice(f.state, f.world, turn, { message: { to: 'B', text: 'Hello.' } })).toEqual({ ok: false, code: 'initial_project_required' });
    rejectUnchanged(f, 'A', { project: purpose });
    rejectUnchanged(f, 'A', { project: { mode: 'abandon', why: 'There was no purpose.' } });
    const first = act(f, 'A', { project: purpose, message: { to: 'B', text: 'Could we speak another time?', close: true } });
    expect(first.state.minds.A.project).toMatchObject({ goal: purpose.goal, steps: [], status: 'active' });
    const next = act(first, 'A', { message: { to: 'B', text: 'Could we speak?' } });
    expect(next.state.minds.A.project).toEqual(first.state.minds.A.project);
  });

  it('requires a reply on an active turn but allows the speaker to decline and close without accepting', () => {
    const f = propose({ kind: 'transfer', direction: 'ask', cells: 2 }), turn = prepare(f, 'A');
    expect(societyChoiceJsonSchema(f.state, f.world, turn).required).toEqual(['message']);
    rejectUnchanged(f, 'A', { reflection: { text: 'I am not willing to pay.', refs: [turn.evidenceIds[0]] } });
    const closed = act(f, 'A', { message: { to: 'B', text: 'I do not agree. I need to stop here.', close: true } });
    expect(closed.state.conversations[0].status).toBe('closed');
    expect(closed.state.agreements).toHaveLength(0);
    expect(totalCells(closed.world)).toBe(totalCells(f.world));
    expect(closed.world.bodies.A.cells).toBe(f.world.bodies.A.cells);
  });

  it('permits later private reviews both while awaiting a reply and when another contact is available', () => {
    const f = dialogue(), waiting = prepare(f, 'A');
    const waitingSchema = societyChoiceJsonSchema(f.state, f.world, waiting);
    expect(waitingSchema.required).toBeUndefined();
    expect(waitingSchema.properties).not.toHaveProperty('message');
    const reviewed = act(f, 'A', { reflection: { text: 'I can consider this while waiting.', refs: [waiting.evidenceIds[0]] } });
    expect(reviewed.state.conversations[0].turns).toHaveLength(1);
    const closed = act(reviewed, 'B', { message: { to: 'A', text: 'I cannot discuss it today.', close: true } });
    const next = prepare(closed, 'A'), schema = societyChoiceJsonSchema(closed.state, closed.world, next);
    expect(schema.properties).toHaveProperty('message');
    expect(schema.required).toBeUndefined();
    const privateReview = act(closed, 'A', { reflection: { text: 'I will leave this purpose unchanged.', refs: [next.evidenceIds[0]] } });
    expect(privateReview.state.conversations[0].turns).toHaveLength(2);
    expect(privateReview.state.minds.A.project).toEqual(f.state.minds.A.project);
  });

  it('does not force an initial contact when all other residents are already in conversations', () => {
    let f = fixture();
    const others = RESIDENTS.filter(({ id }) => id !== 'A').map(({ id }) => id);
    for (let i = 0; i < others.length; i += 2) {
      f = act(f, others[i], { message: { to: others[i + 1], text: 'Could we discuss tomorrow?', close: false } });
    }
    const turn = prepare(f, 'A'), schema = societyChoiceJsonSchema(f.state, f.world, turn);
    expect(schema.required).toEqual(['project']);
    expect(schema.properties).not.toHaveProperty('message');
    const started = act(f, 'A', { project: purpose });
    expect(started.state.minds.A.project).toMatchObject({ goal: purpose.goal, visibility: 'private' });
    expect(started.state.conversations).toHaveLength(12);
  });

  it('can make a first contact without publishing its private goal, reason or inner reflection', () => {
    const privatePurpose: TurnResponse['project'] = { mode: 'replace', goal: 'Write a private manuscript.',
      why: 'I have never admitted this ambition.', visibility: 'private', steps: [] };
    const f = act(fixture(), 'A', { project: privatePurpose,
      reflection: { text: 'I can keep this intention to myself.', refs: ['world:100:1'] },
      message: { to: 'U', text: 'Would you have a moment to talk later?', close: false } });
    const publicJson = JSON.stringify(societyPublicView(f.state));
    expect(publicJson).toContain('Would you have a moment to talk later?');
    expect(publicJson).not.toContain(privatePurpose.goal); expect(publicJson).not.toContain(privatePurpose.why);
    expect(publicJson).not.toContain('I can keep this intention to myself.');
    const recipient = prepare(f, 'U');
    expect(recipient.prompt).not.toContain(privatePurpose.goal); expect(recipient.prompt).not.toContain(privatePurpose.why);
    expect(recipient.prompt).not.toContain('I can keep this intention to myself.');
  });

  it('does not accept legacy offer/respond, extra identities, invented evidence or two choices', () => {
    const f = dialogue(), common = initial(f, 'B', { message: { to: 'A', text: 'Terms.', close: false } });
    for (const extra of [
      { offer: { terms: { kind: 'transfer', from: 'B', to: 'A', cells: 2 }, expiresInWatches: 2 } },
      { respond: { offerId: 'offer:1', decision: 'accept' } },
      { actor: 'A' }, { deal: { kind: 'transfer', direction: 'give', cells: 2, from: 'A' } },
      { deal: [{ kind: 'transfer', direction: 'give', cells: 2 }, { kind: 'accept', offerId: 'offer:1' }] },
      { deal: { kind: 'accept', offerId: 'offer:1', cells: 1 } },
      { reflection: { text: 'An event that never happened.', refs: ['event:invented'] } },
    ]) rejectUnchanged(f, 'B', { ...common, ...extra });
  });

  it('bounds exact decimal amounts and relative deadlines without rounding model values', () => {
    const f = dialogue(), common = initial(f, 'B', { message: { to: 'A', text: 'Terms.', close: false } });
    const invalid = [
      ...[0, -1, 1000.01, 1.001, Number.NaN, Number.POSITIVE_INFINITY].map(cells => ({ kind: 'transfer', direction: 'give', cells })),
      ...[0, 31, 1.5].map(dueInDays => ({ kind: 'loan', direction: 'lend', cells: 2, dueInDays })),
      ...[0, 5, 1.5].map(units => ({ kind: 'work', role: 'work', cells: 2, verb: 'clean', room: 'well', units, slackWatches: 0 })),
      ...[-1, 12, 0.5].map(slackWatches => ({ kind: 'work', role: 'work', cells: 2, verb: 'clean', room: 'well', units: 1, slackWatches })),
    ];
    for (const deal of invalid) rejectUnchanged(f, 'B', { ...common, deal });
    const decoded = decodeSocietyChoice(f.state, f.world, prepare(f, 'B'), { ...common,
      deal: { kind: 'transfer', direction: 'give', cells: 0.29 } });
    expect(decoded.ok && decoded.value.offer?.terms.cells).toBe(0.29);
  });

  it('requires a real conversation, its next speaker, the counterpart and explicitly open speech', () => {
    const deal: SocietyDealChoice = { kind: 'transfer', direction: 'give', cells: 1 };
    const alone = fixture();
    rejectUnchanged(alone, 'A', { project: purpose, message: { to: 'B', text: 'Terms.', close: false }, deal });
    const f = dialogue();
    for (const message of [undefined, { to: 'A', text: 'Terms.' }, { to: 'A', text: 'Terms.', close: true },
      { to: 'C', text: 'Terms.', close: false }, { to: 'B', text: 'Terms.', close: false }]) {
      rejectUnchanged(f, 'B', { project: purpose, ...(message ? { message } : {}), deal });
    }
    rejectUnchanged(f, 'A', { message: { to: 'B', text: 'Speaking twice.', close: false }, deal });
    const stale = prepare(f, 'B');
    const closed = act(f, 'B', { message: { to: 'A', text: 'We can stop here.', close: true } });
    const repeated = applySocietyChoice(closed.state, closed.world, stale, { project: purpose,
      message: { to: 'A', text: 'Terms.', close: false }, deal }, { nowMs: closed.time, generation: 0 });
    // That sequence has already applied: its second result is ignored, not executed.
    expect(repeated.code).toBe('already_applied');
    expect(repeated.state).toBe(closed.state); expect(repeated.world).toBe(closed.world);
    expect(repeated.state.offers).toHaveLength(0);
  });

  it('keeps new executable steps grounded while canonical legacy steps remain a separate contract', () => {
    const f = fixture();
    for (const steps of [[{ verb: 'inspect' }], [{ verb: 'grow', at: 'common' }], [{ verb: 'note', at: 'common' }],
      [{ verb: 'go', room: 'well', at: 'common' }], [{ verb: 'repay', target: 'A' }]]) {
      rejectUnchanged(f, 'B', { project: { ...purpose, steps }, message: { to: 'A', text: 'Could we discuss a plan?' } });
    }
    const plan = { ...purpose, steps: [{ verb: 'inspect', at: 'well' }, { verb: 'go', room: 'garden' }, { verb: 'grow', at: 'garden' }] };
    expect(decodeSocietyChoice(f.state, f.world, prepare(f, 'B'), { project: plan,
      message: { to: 'A', text: 'Could we discuss a plan?' } }).ok).toBe(true);
    expect(decodeSocietyChoice(f.state, f.world, prepare(f, 'A'), { project: { ...purpose, steps: [{ verb: 'note', at: 'common' }] },
      message: { to: 'B', text: 'Could we discuss a plan?' } }).ok).toBe(true);
  });

  it('offers work only at real facilities without using changing resources as a proposal oracle', () => {
    const f = dialogue();
    f.world.economy.stock = { water: 100, produce: 20, meals: 20, materials: 10 };
    const turn = prepare(f, 'B'), decoder = z.fromJSONSchema(societyChoiceJsonSchema(f.state, f.world, turn));
    const raw = (verb: typeof WORK_VERBS[number], room: typeof ROOMS[number]['id'], role: 'work' | 'hire' = 'work') =>
      initial(f, 'B', { message: { to: 'A', text: 'Would these terms work for you?', close: false },
        deal: { kind: 'work', role, cells: 0, verb, room, units: 1, slackWatches: 0 } });
    for (const verb of WORK_VERBS) for (const { id } of ROOMS) {
      f.world.bodies.B.room = id;
      const actual = id !== 'breach' && !VERBS[verb].requires?.(f.world, { actor: 'B', verb });
      expect(decoder.safeParse(raw(verb, id)).success, `${verb} at ${id}`).toBe(actual);
    }
    rejectUnchanged(f, 'B', raw('grow', 'common'));
    rejectUnchanged(f, 'B', raw('cook', 'dock', 'hire'));
    f.world.economy.stock.water = 0; f.world.economy.stock.materials = 0;
    f.world.bodies.A.cells = 0;
    const temporarilyEmpty = prepare(f, 'B');
    expect(decodeSocietyChoice(f.state, f.world, temporarilyEmpty, raw('grow', 'garden', 'hire')).ok).toBe(true);
    expect(decodeSocietyChoice(f.state, f.world, temporarilyEmpty, raw('repair', 'library', 'hire')).ok).toBe(true);
  });

  it('never includes another private memory, secret or offer ID in a voice schema', () => {
    const f = propose({ kind: 'loan', direction: 'lend', cells: 2, dueInDays: 3 });
    for (const { id } of RESIDENTS) {
      const turn = prepare(f, id), schema = societyChoiceJsonSchema(f.state, f.world, turn);
      const json = JSON.stringify(schema);
      const known = new Set(f.world.bodies[id].knownFacts.map(fact => fact.id));
      for (const [factId, fact] of Object.entries(FACTS)) if (fact.private && !known.has(factId)) {
        expect(json).not.toContain(factId); expect(json).not.toContain(fact.text);
      }
      if (id !== 'A' && id !== 'B') expect(json).not.toContain(f.state.offers[0].id);
      const messageSchema = (schema.properties as { message?: { properties: { to: { enum: ResidentId[] } } } }).message;
      expect(z.fromJSONSchema(schema).safeParse(initial(f, id, {
        ...(messageSchema ? { message: { to: messageSchema.properties.to.enum[0], text: 'Could we speak?' } } : {}),
        reflection: { text: 'I will consider what I know.', refs: [turn.evidenceIds[0]] },
      })).success).toBe(true);
    }
  });
});

describe('relative roles become exact bilateral terms', () => {
  const roles: Array<[SocietyDealChoice, Partial<OfferTerms>]> = [
    [{ kind: 'transfer', direction: 'give', cells: 2.75 }, { kind: 'transfer', from: 'B', to: 'A', cells: 2.75 }],
    [{ kind: 'transfer', direction: 'ask', cells: 2.75 }, { kind: 'transfer', from: 'A', to: 'B', cells: 2.75 }],
    [{ kind: 'loan', direction: 'lend', cells: 2.75, dueInDays: 3 }, { kind: 'loan', from: 'B', to: 'A', cells: 2.75, dueDay: 103 }],
    [{ kind: 'loan', direction: 'borrow', cells: 2.75, dueInDays: 3 }, { kind: 'loan', from: 'A', to: 'B', cells: 2.75, dueDay: 103 }],
    [{ kind: 'work', role: 'work', cells: 2.75, verb: 'clean', room: 'well', units: 2, slackWatches: 1 },
      { kind: 'work', worker: 'B', payer: 'A', cells: 2.75, verb: 'clean', room: 'well', units: 2, dueWatch: 403 }],
    [{ kind: 'work', role: 'hire', cells: 2.75, verb: 'clean', room: 'well', units: 2, slackWatches: 1 },
      { kind: 'work', worker: 'A', payer: 'B', cells: 2.75, verb: 'clean', room: 'well', units: 2, dueWatch: 403 }],
  ];
  it.each(roles)('maps %j without moving money or implying acceptance', (deal, expected) => {
    const f = propose(deal);
    expect(f.state.offers).toHaveLength(1);
    expect(f.state.offers[0]).toMatchObject({ proposer: 'B', counterpart: 'A', terms: expected,
      status: 'open', expiresAtWatch: watchNumber(f.world) + 2 });
    expect(f.state.agreements).toHaveLength(0);
    expect(f.world.bodies.A.cells).toBe(20); expect(f.world.bodies.B.cells).toBe(20);
  });

  it('transfers exactly once after the counterpart accepts the visible offer ID', () => {
    const f = propose({ kind: 'transfer', direction: 'give', cells: 3.25 }), turn = prepare(f, 'A'), output = answer(f);
    const before = totalCells(f.world);
    const result = applySocietyChoice(f.state, f.world, turn, output, { nowMs: f.time + 1, generation: 0 });
    expect(result.code).toBe('applied');
    expect(result.state.offers[0].status).toBe('accepted');
    expect(result.world.bodies.A.cells).toBe(23.25); expect(result.world.bodies.B.cells).toBe(16.75);
    expect(totalCells(result.world)).toBe(before);
    const duplicate = applySocietyChoice(result.state, result.world, turn, output, { nowMs: f.time + 2, generation: 0 });
    expect(duplicate.code).toBe('already_applied');
    expect(duplicate.state).toBe(result.state); expect(duplicate.world).toBe(result.world);
    expect(parseSocietyState(result.state).ok).toBe(true);
  });

  it('exposes only an exact incoming available ID; self, stale, outside or unprovided acceptance cannot run', () => {
    const f = propose({ kind: 'transfer', direction: 'give', cells: 2 }), id = f.state.offers[0].id;
    rejectUnchanged(f, 'B', { message: { to: 'A', text: 'I accept for you.', close: false }, deal: { kind: 'accept', offerId: id } });
    rejectUnchanged(f, 'C', { project: purpose, message: { to: 'B', text: 'I accept.', close: false }, deal: { kind: 'accept', offerId: id } });
    rejectUnchanged(f, 'A', { ...answer(f), deal: { kind: 'accept', offerId: 'offer:9999' } });
    const turn = prepare(f, 'A'); turn.evidenceIds = turn.evidenceIds.filter(ref => ref !== id);
    expect(decodeSocietyChoice(f.state, f.world, turn, answer(f)).ok).toBe(false);
    f.world.watch += 2;
    rejectUnchanged(f, 'A', answer(f));
    expect(f.state.offers[0].status).toBe('open'); // A failed read/choice does not mutate expiry either.
  });

  it('treats a counterproposal as new unaccepted terms, even if its price matches', () => {
    const first = propose({ kind: 'transfer', direction: 'give', cells: 2 });
    const next = act(first, 'A', { message: { to: 'B', text: 'I propose these terms.', close: false },
      deal: { kind: 'transfer', direction: 'ask', cells: 2 } });
    expect(next.state.offers.map(o => o.status)).toEqual(['replaced', 'open']);
    expect(next.state.offers[1].terms).toEqual(first.state.offers[0].terms);
    expect(next.state.agreements).toHaveLength(0); expect(next.world.bodies.A.cells).toBe(20);
    rejectUnchanged(next, 'B', { message: { to: 'A', text: 'Old terms.', close: false }, deal: { kind: 'accept', offerId: first.state.offers[0].id } });
  });

  it('allows a refusal without payment, and cannot trim unaffordable accepted terms', () => {
    const f = propose({ kind: 'transfer', direction: 'ask', cells: 3.25 });
    const declined = act(f, 'A', answer(f, 'reject'));
    expect(declined.state.offers[0].status).toBe('rejected');
    expect(declined.world.bodies.A.cells).toBe(20); expect(declined.state.agreements).toHaveLength(0);
    f.world.bodies.A.cells = 1;
    expect(rejectUnchanged(f, 'A', answer(f)).code).toBe('insufficient_cells');
    expect(f.state.offers[0].terms.cells).toBe(3.25);
  });

  it('lets the proposer request funds without observing the counterpart balance as consent', () => {
    const f = dialogue(); f.world.bodies.A.cells = 0;
    const offered = propose({ kind: 'loan', direction: 'borrow', cells: 3, dueInDays: 2 }, f);
    expect(offered.state.offers[0].status).toBe('open');
    expect(rejectUnchanged(offered, 'A', answer(offered)).code).toBe('insufficient_cells');
  });

  it('permits explicitly voluntary work without creating an advance or fake completed units', () => {
    const f = propose({ kind: 'work', role: 'work', cells: 0, verb: 'clean', room: 'well', units: 2, slackWatches: 1 });
    const accepted = act(f, 'A', answer(f));
    expect(accepted.state.agreements[0]).toMatchObject({ progress: 0, status: 'active', evidenceIds: [], terms: { cells: 0, units: 2 } });
    expect(totalCells(accepted.world)).toBe(totalCells(f.world));
  });
});

describe('relative dates retain real clock constraints', () => {
  it('reserves one safety watch and respects an already spent worker slot and the absolute horizon', () => {
    const f = dialogue(), stamp = watchNumber(f.world);
    const deal: SocietyDealChoice = { kind: 'work', role: 'work', cells: 2, verb: 'clean', room: 'well', units: 4, slackWatches: 11 };
    expect(propose(deal, f).state.offers[0].terms).toMatchObject({ dueWatch: stamp + 15 });
    f.state.minds.B.lastPhysicalWatch = stamp;
    expect(propose(deal, f).state.offers[0].terms).toMatchObject({ dueWatch: stamp + 16 });
    f.state.minds.B.lastPhysicalWatch = stamp + 1;
    expect(rejectUnchanged(f, 'B', initial(f, 'B', { message: { to: 'A', text: 'Terms.', close: false }, deal })).code).toBe('invalid_work_deadline');
  });

  it('reevaluates remaining work slots at acceptance without extending the offered date', () => {
    const f = propose({ kind: 'work', role: 'work', cells: 2, verb: 'clean', room: 'well', units: 4, slackWatches: 0 });
    const terms = structuredClone(f.state.offers[0].terms);
    f.world.watch += 1; f.state.minds.B.lastPhysicalWatch = watchNumber(f.world);
    expect(rejectUnchanged(f, 'A', answer(f)).code).toBe('invalid_work_deadline');
    expect(f.state.offers[0].terms).toEqual(terms); expect(f.state.agreements).toHaveLength(0);
  });

  it('calculates loan dates once and rejects a date reached before acceptance instead of extending it', () => {
    const before = dialogue(); before.world.watch = 4;
    const f = propose({ kind: 'loan', direction: 'lend', cells: 2.25, dueInDays: 1 }, before);
    expect(f.state.offers[0].terms).toMatchObject({ dueDay: 101 });
    f.world.day += 1; f.world.watch = 1;
    expect(f.state.offers[0].expiresAtWatch).toBeGreaterThan(watchNumber(f.world));
    expect(rejectUnchanged(f, 'A', answer(f)).code).toBe('invalid_loan_due_day');
    expect(f.state.offers[0].terms).toMatchObject({ dueDay: 101 });
  });

  it('does not bypass pause generations, expiry or mind revisions after valid external decoding', () => {
    const f = dialogue(), turn = prepare(f, 'B'), raw = initial(f, 'B', { message: { to: 'A', text: 'Terms.', close: false },
      deal: { kind: 'transfer', direction: 'give', cells: 2 } });
    expect(applySocietyChoice(f.state, f.world, turn, raw, { nowMs: f.time + 1, generation: 1 }).code).toBe('stale_control');
    expect(applySocietyChoice(f.state, f.world, turn, raw, { nowMs: turn.expiresAtMs, generation: 0 }).code).toBe('expired_job');
    f.state.minds.B.revision += 1;
    expect(applySocietyChoice(f.state, f.world, turn, raw, { nowMs: f.time + 1, generation: 0 }).code).toBe('stale_mind');
    expect(f.state.offers).toHaveLength(0);
    const invalidJob = { ...turn, actor: 'not-a-resident' } as unknown as PreparedTurn;
    expect(applySocietyChoice(f.state, f.world, invalidJob, raw, { nowMs: f.time + 1, generation: 0 }).code).toBe('invalid_job');
  });
});
