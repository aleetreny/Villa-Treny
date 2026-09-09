import { describe, expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { economicAccounts, totalCells } from '../engine/economy';
import { attempt } from '../engine/verbs';
import { FACTS } from '../engine/knowledge';
import { RESIDENTS, type ResidentId } from '../residents';
import { applySocietyTurn, createSocietyState, expireSocietyState, markSocietyAttempt, observeSocietyActions,
  parseSocietyState, plannedSocietyActions, prepareSocietyTurn, settleSocietyAgreements, societyPublicView, watchNumber,
  SOCIETY_WIRE_JSON_SCHEMA, type OfferTerms, type SocietyState, type TurnResponse } from './index';

function fixture() {
  const world = genesisState(41);
  for (const r of RESIDENTS) world.bodies[r.id].cells = 20;
  world.economy.ledger.initialCells = totalCells(world);
  return { world, state: createSocietyState(world, 1000) };
}
type Fixture = ReturnType<typeof fixture>;
function turn(f: Fixture, actor: ResidentId, response: TurnResponse, nowMs = 2000) {
  const sequence = f.state.minds[actor].lastAppliedSequence + 1;
  const job = prepareSocietyTurn(f.state, f.world, actor, { nowMs, generation: 0, sequence });
  const result = applySocietyTurn(f.state, f.world, job, response, { nowMs: nowMs + 1, generation: 0 });
  expect(result.code).toBe('applied');
  expect(parseSocietyState(result.state).ok).toBe(true);
  return { state: result.state, world: result.world };
}
function propose(f: Fixture, terms: OfferTerms, actor: ResidentId = 'A', other: ResidentId = 'B') {
  return turn(f, actor, { message: { to: other, text: 'Here are my proposed terms. Do you agree?' }, offer: { terms, expiresInWatches: 2 } });
}
function accept(f: Fixture, actor: ResidentId = 'B', other: ResidentId = 'A') {
  return turn(f, actor, { message: { to: other, text: 'I agree to those exact terms.' }, respond: { offerId: f.state.offers.at(-1)!.id, decision: 'accept' } }, 3000);
}

describe('separate persistent minds', () => {
  it('keeps a social purpose without inventing physical steps or completing it by routine activity', () => {
    let f = fixture();
    f = turn(f, 'B', { project: { mode: 'replace', goal: 'Be consulted about shared stores.', why: 'I want a voice in the decisions.',
      visibility: 'public', steps: [] }, message: { to: 'A', text: 'Could I help you review the next stores decision?' } });
    expect(f.state.minds.B.project).toMatchObject({ status: 'active', steps: [] });
    expect(plannedSocietyActions(f.state, f.world).B).toBeUndefined();
    const outcome = attempt(f.world, { actor: 'B', verb: 'rest' });
    const observed = observeSocietyActions(f.state, f.world, [{ actor: 'B', day: f.world.day, watch: f.world.watch,
      intent: { actor: 'B', verb: 'rest' }, outcome }], { nowMs: 3000 });
    expect(observed.state.minds.B.project?.status).toBe('active');
    expect(parseSocietyState(observed.state).ok).toBe(true);
    expect(societyPublicView(observed.state).residents.find(r => r.id === 'B')!.project).toMatchObject({ totalSteps: 0, completedSteps: 0, status: 'active' });
  });

  it('rejects abandoning a project that does not exist', () => {
    const f = fixture(), job = prepareSocietyTurn(f.state, f.world, 'A', { nowMs: 2000, generation: 0, sequence: 0 });
    const result = applySocietyTurn(f.state, f.world, job, { project: { mode: 'abandon', why: 'No purpose chosen.' } }, { nowMs: 2001, generation: 0 });
    expect(result.code).toBe('no_project_to_abandon');
    expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
  });
  it('packs all initial actor contexts within the fallback budget and counts UTF-8 bytes honestly', () => {
    const f = fixture();
    const jobs = RESIDENTS.map(({ id }) => prepareSocietyTurn(f.state, f.world, id, { nowMs: 2000, generation: 0, sequence: 0 }));
    expect(Math.max(...jobs.map((j) => j.promptBytes))).toBeLessThanOrEqual(4200);
    const schemaBytes = new TextEncoder().encode(JSON.stringify(SOCIETY_WIRE_JSON_SCHEMA)).length;
    expect(Math.max(...jobs.map((j) => j.promptBytes)) + schemaBytes + 128 + 768).toBeLessThanOrEqual(6000);
    for (const job of jobs) {
      expect(job.promptBytes).toBe(new TextEncoder().encode(job.prompt).length);
      expect(job.contextOverflow).toBe(false);
    }
    const tiny = prepareSocietyTurn(f.state, f.world, 'A', { nowMs: 2000, generation: 0, sequence: 0, maxPromptBytes: 100 });
    expect(tiny.contextOverflow).toBe(true); // Never silently truncate essential context to meet a quota.
  });
  it('initializes exactly 25 empty minds and round-trips without changing the physical world', () => {
    const f = fixture(), original = structuredClone(f.world);
    expect(Object.keys(f.state.minds)).toHaveLength(25);
    expect(RESIDENTS.every(({ id }) => f.state.minds[id].project === null && !f.state.minds[id].memories.length)).toBe(true);
    const decoded = parseSocietyState(JSON.parse(JSON.stringify(f.state)));
    expect(decoded.ok && decoded.state).toEqual(f.state);
    expect(f.world).toEqual(original);
    expect(parseSocietyState({ ...f.state, version: 999 }).ok).toBe(false);
    const missing = structuredClone(f.state) as unknown as { minds: Record<string, unknown> };
    delete missing.minds.A;
    expect(parseSocietyState(missing).ok).toBe(false);
  });
  it('gives all 25 independent jobs the same world, without exposing another private mind or secret', () => {
    const f = fixture();
    const jobs = RESIDENTS.map(({ id }) => prepareSocietyTurn(f.state, f.world, id, { nowMs: 2000, generation: 0, sequence: 0 }));
    let s = f.state, w = f.world;
    for (const job of jobs) {
      const allowed = new Set(w.bodies[job.actor].knownFacts.map((fact) => fact.id));
      for (const [id, fact] of Object.entries(FACTS)) if (fact.private && !allowed.has(id)) {
        expect(job.prompt).not.toContain(id); expect(job.prompt).not.toContain(fact.text);
      }
      const result = applySocietyTurn(s, w, job, { project: { mode: 'replace', goal: `Private purpose of ${job.actor}`,
        why: 'A private reason', visibility: 'private', steps: [{ verb: 'observe' }] } }, { nowMs: 2001, generation: 0 });
      expect(result.ok).toBe(true); s = result.state; w = result.world;
    }
    expect(RESIDENTS.every(({ id }) => s.minds[id].lastSuccessAtMs === 2001)).toBe(true);
    const next = prepareSocietyTurn(s, w, 'A', { nowMs: 3000, generation: 0, sequence: 1 });
    expect(next.prompt).not.toContain('Private purpose of B');
    const publicJson = JSON.stringify(societyPublicView(s));
    expect(publicJson).not.toContain('Private purpose'); expect(publicJson).not.toContain('A private reason');
  });
  it('rejects hidden fields, counterfeit speakers, fabricated evidence and prose completion', () => {
    const f = fixture(), job = prepareSocietyTurn(f.state, f.world, 'A', { nowMs: 2000, generation: 0, sequence: 0 });
    for (const raw of [{ actor: 'B', message: { to: 'A', text: 'yes' } }, { nextSpeaker: 'B' }, { world: { cells: 100 } },
      { project: { mode: 'completed', goal: 'Already done' } }, { reflection: { text: 'I know everything.', refs: ['secret:unknown'] } }]) {
      const result = applySocietyTurn(f.state, f.world, job, raw, { nowMs: 2001, generation: 0 });
      expect(result.ok).toBe(false); expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
    }
  });
  it('retains projects on unrelated turns, records observed steps and cannot execute twice per watch', () => {
    let f = turn(fixture(), 'A', { project: { mode: 'replace', goal: 'Inspect and write a record', why: 'I want reliable notes.', visibility: 'public',
      steps: [{ verb: 'inspect', at: 'common' }, { verb: 'note' }] } });
    const projectId = f.state.minds.A.project!.id;
    const job = prepareSocietyTurn(f.state, f.world, 'A', { nowMs: 3000, generation: 0, sequence: 1 });
    const r = applySocietyTurn(f.state, f.world, job, { reflection: { text: 'My plan still matters.', refs: [job.evidenceIds[0]] } }, { nowMs: 3001, generation: 0 });
    f = { state: r.state, world: r.world };
    expect(f.state.minds.A.project!.id).toBe(projectId);
    const first = plannedSocietyActions(f.state, f.world).A!;
    f.world.bodies.A.room = 'common';
    const outcome = attempt(f.world, first.intent);
    const observation = { actor: 'A' as const, day: f.world.day, watch: f.world.watch, intent: first.intent, outcome, stepId: first.stepId };
    const result = observeSocietyActions(f.state, f.world, [observation], { nowMs: 4000 });
    expect(result.state.minds.A.project!.steps.map((s) => s.status)).toEqual(['done', 'pending']);
    expect(plannedSocietyActions(result.state, result.world).A).toBeUndefined();
    expect(observeSocietyActions(result.state, result.world, [observation], { nowMs: 4001 })).toEqual(result);
    result.world.watch += 1;
    const second = plannedSocietyActions(result.state, result.world).A!;
    const finished = observeSocietyActions(result.state, result.world, [{ actor: 'A', day: result.world.day, watch: result.world.watch,
      intent: second.intent, stepId: second.stepId, outcome: attempt(result.world, second.intent) }], { nowMs: 5000 });
    expect(finished.state.minds.A.project!.status).toBe('completed');
    expect(societyPublicView(finished.state).residents[0].project!.status).toBe('steps_finished');
    const review = prepareSocietyTurn(finished.state, finished.world, 'A', { nowMs: 6000, generation: 0, sequence: 2 });
    const context = JSON.parse(review.prompt.slice(review.prompt.indexOf('\n{') + 1));
    expect(context.ownProject.status).toBe('steps_finished');
    expect(context.ownProject.goal).toBe('Inspect and write a record');
    expect(finished.state.minds.A.project!.status).toBe('completed'); // No saved-state migration or claim that the goal was achieved.
    expect(parseSocietyState(JSON.parse(JSON.stringify(finished.state))).ok).toBe(true);
  });
  it('preserves interrupted steps and records failure for replanning without claiming success', () => {
    const f = turn(fixture(), 'A', { project: { mode: 'replace', goal: 'Grow food', why: 'Prepare for tomorrow.', visibility: 'public', steps: [{ verb: 'grow', at: 'garden' }] } });
    const step = plannedSocietyActions(f.state, f.world).A!;
    const interrupted = observeSocietyActions(f.state, f.world, [{ actor: 'A', day: f.world.day, watch: 1,
      intent: { actor: 'A', verb: 'eat' }, outcome: { ok: true }, stepId: step.stepId, interrupted: 'Hunger required a meal.' }], { nowMs: 4000 });
    expect(interrupted.state.minds.A.project!.steps[0].status).toBe('pending');
    expect(interrupted.state.minds.A.memories.at(-1)!.text).toContain('interrupted');
    interrupted.world.watch = 2; interrupted.world.bodies.A.room = 'garden';
    const failed = observeSocietyActions(interrupted.state, interrupted.world, [{ actor: 'A', day: f.world.day, watch: 2,
      intent: step.intent, outcome: { ok: false, refused: 'No water.' }, stepId: step.stepId }], { nowMs: 5000 });
    expect(failed.state.minds.A.project!.steps[0].status).toBe('failed');
    expect(failed.state.minds.A.project!.status).toBe('active');
  });
  it('invalidates late control and mind responses while duplicate results stay idempotent', () => {
    const f = fixture(), job = prepareSocietyTurn(f.state, f.world, 'A', { nowMs: 2000, generation: 1, sequence: 3 });
    const output = { reflection: { text: 'I should pay attention.', refs: [job.evidenceIds[0]] } };
    expect(applySocietyTurn(f.state, f.world, job, output, { nowMs: 2001, generation: 2 }).code).toBe('stale_control');
    expect(applySocietyTurn(f.state, f.world, job, output, { nowMs: job.expiresAtMs, generation: 1 }).code).toBe('expired_job');
    const attempted = markSocietyAttempt(f.state, 'A', 2000);
    expect(attempted.minds.A.revision).toBe(job.mindRevision);
    const result = applySocietyTurn(attempted, f.world, job, output, { nowMs: 2001, generation: 1 });
    expect(result.ok).toBe(true);
    const duplicate = applySocietyTurn(result.state, result.world, job, output, { nowMs: 2002, generation: 1 });
    expect(duplicate.code).toBe('already_applied'); expect(duplicate.state).toBe(result.state);
    expect(applySocietyTurn(result.state, result.world, { ...job, sequence: 4 }, output, { nowMs: 2003, generation: 1 }).code).toBe('stale_mind');
  });
});

describe('bilateral dialogue and exact economic terms', () => {
  it('moves no money until the counterpart accepts and then transfers once with balanced entries', () => {
    const original = fixture(), before = economicAccounts(original.world);
    const f = propose(original, { kind: 'transfer', from: 'A', to: 'B', cells: 3.25 });
    expect(economicAccounts(f.world)).toEqual(before);
    const job = prepareSocietyTurn(f.state, f.world, 'B', { nowMs: 3000, generation: 0, sequence: 0 });
    const raw = { message: { to: 'A', text: 'Yes, 3.25 cells.' }, respond: { offerId: f.state.offers[0].id, decision: 'accept' } };
    const result = applySocietyTurn(f.state, f.world, job, raw, { nowMs: 3001, generation: 0 });
    expect(result.ok).toBe(true); expect(result.world.bodies.A.cells).toBe(16.75); expect(result.world.bodies.B.cells).toBe(23.25);
    expect(totalCells(result.world)).toBe(totalCells(original.world));
    expect(result.world.economy.events.at(-1)!.entries.reduce((sum, e) => sum + e.delta, 0)).toBe(0);
    const again = applySocietyTurn(result.state, result.world, job, raw, { nowMs: 3002, generation: 0 });
    expect(again.code).toBe('already_applied'); expect(again.world).toBe(result.world);
    expect(original.world.bodies.A.cells).toBe(20);
  });
  it('rejects self-acceptance, double speaking, invented terms and acceptance after funds disappear', () => {
    const f = propose(fixture(), { kind: 'loan', from: 'A', to: 'B', cells: 6, dueDay: 103 });
    const own = prepareSocietyTurn(f.state, f.world, 'A', { nowMs: 3000, generation: 0, sequence: 1 });
    const output = { message: { to: 'B', text: 'I accept for you.' }, respond: { offerId: f.state.offers[0].id, decision: 'accept' } };
    expect(applySocietyTurn(f.state, f.world, own, output, { nowMs: 3001, generation: 0 }).ok).toBe(false);
    const job = prepareSocietyTurn(f.state, f.world, 'B', { nowMs: 3000, generation: 0, sequence: 0 });
    f.world.bodies.A.cells = 5;
    const result = applySocietyTurn(f.state, f.world, job, { message: { to: 'A', text: 'Agreed.' },
      respond: { offerId: f.state.offers[0].id, decision: 'accept' } }, { nowMs: 3001, generation: 0 });
    expect(result.code).toBe('insufficient_cells'); expect(result.state).toBe(f.state); expect(result.world.economy.debts).toHaveLength(0);
  });
  it('handles rejection and counteroffers without accepting superseded terms', () => {
    let f = propose(fixture(), { kind: 'transfer', from: 'A', to: 'B', cells: 8 });
    const oldId = f.state.offers[0].id;
    f = turn(f, 'B', { message: { to: 'A', text: 'Four cells would be enough.' }, offer: {
      terms: { kind: 'transfer', from: 'A', to: 'B', cells: 4 }, expiresInWatches: 1, replaces: oldId } }, 3000);
    expect(f.state.offers[0].status).toBe('replaced'); expect(f.world.bodies.A.cells).toBe(20);
    const a = prepareSocietyTurn(f.state, f.world, 'A', { nowMs: 4000, generation: 0, sequence: 1 });
    expect(applySocietyTurn(f.state, f.world, a, { message: { to: 'B', text: 'Yes.' }, respond: { offerId: oldId, decision: 'accept' } }, { nowMs: 4001, generation: 0 }).ok).toBe(false);
    f = accept(f, 'A', 'B');
    expect(f.world.bodies.A.cells).toBe(16); expect(f.world.bodies.B.cells).toBe(24);
    const refusal = propose(fixture(), { kind: 'loan', from: 'A', to: 'B', cells: 6, dueDay: 103 });
    const declined = turn(refusal, 'B', { message: { to: 'A', text: 'No, I cannot promise repayment.' }, respond: { offerId: refusal.state.offers[0].id, decision: 'reject' } }, 3000);
    expect(declined.world.economy.debts).toHaveLength(0); expect(declined.state.offers[0].status).toBe('rejected');
  });
  it('creates exact variable loans, follows repayment and never mints principal', () => {
    let f = accept(propose(fixture(), { kind: 'loan', from: 'A', to: 'B', cells: 3.5, dueDay: 103 }));
    const debt = f.world.economy.debts[0];
    expect(debt).toMatchObject({ principal: 3.5, remaining: 3.5, dueDay: 103 });
    expect(f.state.agreements[0].status).toBe('active');
    expect(totalCells(f.world)).toBe(500); expect(f.world.economy.ledger.minted).toBe(0);
    attempt(f.world, { actor: 'B', verb: 'repay', target: 'A' });
    attempt(f.world, { actor: 'B', verb: 'repay', target: 'A' });
    f = settleSocietyAgreements(f.state, f.world, 5000);
    expect(f.state.agreements[0].status).toBe('fulfilled'); expect(f.world.economy.debts[0].remaining).toBe(0);
    expect(totalCells(f.world)).toBe(500);
  });
  it('expires unanswered conversations and offers instead of treating silence as consent', () => {
    const f = propose(fixture(), { kind: 'transfer', from: 'A', to: 'B', cells: 2 });
    const expired = expireSocietyState(f.state, f.world, 90_000_000);
    expect(expired.conversations[0].status).toBe('expired'); expect(expired.offers[0].status).toBe('expired');
    expect(expired.agreements).toHaveLength(0); expect(totalCells(f.world)).toBe(500);
    expect(parseSocietyState(expired).ok).toBe(true);
  });
  it('bounds long conversations and rejects plan verbs that bypass bilateral consent', () => {
    let f = fixture();
    for (let i = 0; i < 16; i++) f = turn(f, i % 2 === 0 ? 'A' : 'B', { message: { to: i % 2 === 0 ? 'B' : 'A', text: `This is turn ${i}.` } }, 2000 + i * 10);
    expect(f.state.conversations[0].turns).toHaveLength(16); expect(f.state.conversations[0].status).toBe('closed');
    const job = prepareSocietyTurn(f.state, f.world, 'A', { nowMs: 4000, generation: 0, sequence: 9 });
    expect(applySocietyTurn(f.state, f.world, job, { project: { mode: 'replace', goal: 'Get money', why: 'I want it.', visibility: 'public',
      steps: [{ verb: 'lend', target: 'B' }] } }, { nowMs: 4001, generation: 0 }).code).toBe('invalid_plan_step');
  });
});

describe('work is evidenced by the physical engine', () => {
  function work(cells = 3, units = 1) {
    const f = fixture();
    return accept(propose(f, { kind: 'work', worker: 'B', payer: 'A', cells, verb: 'grow', room: 'garden', units, dueWatch: watchNumber(f.world) + 3 }));
  }
  it('pays only for successful eligible work, once; production remains solely in the physical engine', () => {
    const f = work(), initialStock = { ...f.world.economy.stock };
    expect(f.world.bodies.A.cells).toBe(20); expect(f.world.economy.stock).toEqual(initialStock);
    const plan = plannedSocietyActions(f.state, f.world).B!;
    expect(plan.at).toBe('garden'); f.world.bodies.B.room = 'garden';
    const outcome = attempt(f.world, plan.intent), produced = { ...f.world.economy.stock };
    const observation = { actor: 'B' as const, day: f.world.day, watch: f.world.watch, intent: plan.intent, outcome, stepId: plan.stepId };
    const result = observeSocietyActions(f.state, f.world, [observation, observation], { nowMs: 4000 });
    expect(result.state.agreements[0].status).toBe('fulfilled'); expect(result.state.agreements[0].progress).toBe(1);
    expect(result.world.bodies.A.cells).toBe(17); expect(result.world.bodies.B.cells).toBe(23);
    expect(result.world.economy.stock).toEqual(produced); expect(totalCells(result.world)).toBe(500);
    expect(observeSocietyActions(result.state, result.world, [observation], { nowMs: 4001 }).world).toBe(result.world);
  });
  it('does not pay for claimed work, failed attempts, or work done before consent', () => {
    const f = work();
    const fake = observeSocietyActions(f.state, f.world, [{ actor: 'B', day: f.world.day, watch: f.world.watch,
      intent: { actor: 'B', verb: 'grow' }, outcome: { ok: true } }], { nowMs: 4000 });
    expect(fake.state.agreements[0].progress).toBe(0); expect(fake.world.bodies.B.cells).toBe(20);
    const prior = fixture(); prior.world.bodies.B.room = 'garden';
    const earlier = attempt(prior.world, { actor: 'B', verb: 'grow' });
    const accepted = accept(propose(prior, { kind: 'work', worker: 'B', payer: 'A', cells: 3, verb: 'grow', room: 'garden', units: 1, dueWatch: watchNumber(prior.world) + 2 }));
    const observed = observeSocietyActions(accepted.state, accepted.world, [{ actor: 'B', day: prior.world.day, watch: prior.world.watch,
      intent: { actor: 'B', verb: 'grow' }, outcome: earlier }], { nowMs: 4000 });
    expect(observed.state.agreements[0].progress).toBe(0);
  });
  it('holds evidenced payment due without inventing cells; later settlement is idempotent', () => {
    const f = work(); f.world.bodies.A.cells = 1; f.world.bodies.B.room = 'garden';
    const intent = { actor: 'B' as const, verb: 'grow' as const }, outcome = attempt(f.world, intent);
    const result = observeSocietyActions(f.state, f.world, [{ actor: 'B', day: f.world.day, watch: f.world.watch, intent, outcome }], { nowMs: 4000 });
    expect(result.state.agreements[0]).toMatchObject({ status: 'payment_due', progress: 1 });
    expect(result.world.bodies.A.cells).toBe(1); expect(result.world.bodies.B.cells).toBe(20);
    // A real incoming transfer can make the recorded debt payable later.
    result.world.bodies.C.cells -= 4; result.world.bodies.A.cells += 4;
    const settled = settleSocietyAgreements(result.state, result.world, 5000);
    expect(settled.state.agreements[0].status).toBe('fulfilled'); expect(settled.world.bodies.A.cells).toBe(2);
    expect(settleSocietyAgreements(settled.state, settled.world, 5001).world).toBe(settled.world);
  });
  it('supports voluntary work and rejects currently impossible resource promises at acceptance', () => {
    const f = work(0); f.world.bodies.B.room = 'garden';
    const intent = { actor: 'B' as const, verb: 'grow' as const };
    const result = observeSocietyActions(f.state, f.world, [{ actor: 'B', day: f.world.day, watch: f.world.watch, intent,
      outcome: attempt(f.world, intent) }], { nowMs: 4000 });
    expect(result.state.agreements[0].status).toBe('fulfilled'); expect(result.world.bodies.B.cells).toBe(20);
    const poor = fixture();
    const offer = propose(poor, { kind: 'work', worker: 'B', payer: 'A', cells: 2, verb: 'grow', room: 'garden', units: 1, dueWatch: watchNumber(poor.world) + 2 });
    offer.world.economy.stock.water = 0;
    const job = prepareSocietyTurn(offer.state, offer.world, 'B', { nowMs: 3000, generation: 0, sequence: 0 });
    const refused = applySocietyTurn(offer.state, offer.world, job, { message: { to: 'A', text: 'I agree.' }, respond: { offerId: offer.state.offers[0].id, decision: 'accept' } }, { nowMs: 3001, generation: 0 });
    expect(refused.code).toBe('work_resources_unavailable');
  });
});

describe('bounded persistence validation', () => {
  it('rejects invalid ownership, turn order, unsupported amounts and invented completion evidence', () => {
    const f = turn(fixture(), 'A', { project: { mode: 'replace', goal: 'Inspect the records', why: 'Check what survived.', visibility: 'public', steps: [{ verb: 'inspect' }] } });
    const mutate = (change: (s: SocietyState) => void) => { const s = structuredClone(f.state); change(s); expect(parseSocietyState(s).ok).toBe(false); };
    mutate((s) => { s.minds.A.project!.steps[0].intent.actor = 'B'; });
    mutate((s) => { s.minds.A.project!.steps[0].status = 'done'; });
    mutate((s) => { s.minds.A.project!.status = 'completed'; });
    mutate((s) => { s.minds.A.memories = Array.from({ length: 25 }, (_, i) => ({ id: `memory:${i}`, kind: 'observation', text: 'A fact', refs: [], atWatch: 1, createdAtMs: 1, importance: 3, source: null })); });
    const conversation = turn(f, 'A', { message: { to: 'B', text: 'Hello.' } }, 3000);
    conversation.state.conversations[0].nextSpeaker = 'A';
    expect(parseSocietyState(conversation.state).ok).toBe(false);
  });
});
