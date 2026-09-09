import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { loadFrozenV7Core, prepareCases, hash } from './benchmark-society-frozen-v7.mjs';
import { validateCounts, sourceParts } from './benchmark-society-oss-probe.mjs';
import { checkOAuth, jobFor, POLICY, receipt, refineDealSchema, runOnce } from './benchmark-society-v7-schema-probe.mjs';

test('complete shared branches preserve supplied constraints and reject all eight V7 open-message omissions', async () => {
  const originalFetch = globalThis.fetch; let requests = 0, core;
  globalThis.fetch = () => { requests += 1; throw Error('No network'); };
  try {
    core = await loadFrozenV7Core();
    let rejectedBaselines = 0, tested = 0;
    for (const row of core.frozenReference.entries.filter(entry => entry.kind === 'cognition')) {
      const schema = row.job.job.outputContract.jsonSchema, before = hash(schema), candidate = refineDealSchema(schema);
      const old = z.fromJSONSchema(schema), refined = z.fromJSONSchema(candidate);
      assert.equal(hash(schema), before); assert.deepEqual(candidate.properties.message, schema.properties.message);
      if (!schema.properties.deal) assert.deepEqual(candidate, schema);
      const output = row.receipt.output;
      if (old.safeParse(output).success && !refined.safeParse(output).success) rejectedBaselines += 1;
      const cases = [output, null, [], {}, { ...output, extra: true }];
      for (const close of [undefined, false, true, null, 'false', 0]) {
        const raw = structuredClone(output);
        if (raw.message) { delete raw.message.close; if (close !== undefined) raw.message.close = close; }
        cases.push(raw, { ...raw, extra: 1 }, { ...raw, offer: {} });
        if (raw.message) cases.push({ ...raw, message: { ...raw.message, extra: 1 } });
        const noDeal = { ...raw }; delete noDeal.deal; cases.push(noDeal);
        const noMessage = { ...raw }; delete noMessage.message; cases.push(noMessage);
        const noProject = { ...raw }; delete noProject.project; cases.push(noProject);
      }
      for (const raw of cases) {
        const expected = old.safeParse(raw).success && (!raw?.deal || raw.message?.close === false);
        assert.equal(refined.safeParse(raw).success, expected, `${row.job.actor}/${row.job.stage}: ${JSON.stringify(raw)}`);
        tested += 1;
      }
    }
    assert.equal(rejectedBaselines, 8); assert.ok(tested > 1000); assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; await core?.close(); }
});

test('real incoming offer: accept/reject, decimals, ranges, refs and appraisal preserve the old valid language', async () => {
  const core = await loadFrozenV7Core();
  try {
    let world = core.genesisState(91), state = core.createSocietyState(world, 1000), sequence = 0, now = 2000;
    const project = { mode: 'replace', goal: 'Discuss precise terms.', why: 'Ask before committing.', visibility: 'private', steps: [] };
    const prepare = actor => core.prepareSocietyTurn(state, world, actor, { nowMs: now, generation: 0, sequence: sequence++ });
    const act = (actor, raw) => { const result = core.applyCapabilityChoice(state, world, prepare(actor), raw, { nowMs: now + 1, generation: 0 });
      assert.equal(result.ok, true, result.code); state = result.state; world = result.world; now += 100; };
    act('A', { project, message: { to: 'B', text: 'Would you discuss a transfer?' } });
    act('B', { project, message: { to: 'A', text: 'I offer two cells.', close: false }, deal: { kind: 'transfer', direction: 'give', cells: 2 } });
    const turn = prepare('A'), schema = core.capabilityChoiceJsonSchema(state, world, turn);
    const old = z.fromJSONSchema(schema), candidate = z.fromJSONSchema(refineDealSchema(schema));
    const message = { to: 'B', text: 'I received the terms.', close: false };
    const accepted = { message, deal: { kind: 'accept', offerId: state.offers[0].id } };
    const cases = [accepted, { message, deal: { kind: 'reject', offerId: state.offers[0].id } },
      { ...accepted, extra: true }, { ...accepted, message: { ...message, extra: true } },
      { ...accepted, message: { ...message, to: 'C' } }, { ...accepted, message: { ...message, text: 'x'.repeat(301) } },
      { ...accepted, deal: { ...accepted.deal, offerId: 'invented' } }, { ...accepted, deal: { ...accepted.deal, extra: true } },
      { ...accepted, reflection: { text: 'I received an offer.', refs: [turn.evidenceIds[0]] } },
      { ...accepted, reflection: { text: 'Unsupported.', refs: ['invented'] } },
      ...[1, 2].map(delta => ({ ...accepted, appraisal: { axis: 'trust', delta,
        ref: state.conversations[0].turns.at(-1).id, why: 'The proposal was clear.' } })),
      ...[0, 0.001, 0.01, 1.1, 1000, 1000.1, -1].map(cells => ({ message, deal: { kind: 'transfer', direction: 'give', cells } })),
      ...[0, 1, 30, 31, 1.5].map(dueInDays => ({ message, deal: { kind: 'loan', direction: 'borrow', cells: 1, dueInDays } })),
      ...['filter_water', 'clean_space', 'grow', 'repair', 'observe', 'message'].flatMap(verb => ['well', 'common', 'garden', 'breach'].map(room =>
        ({ message, deal: { kind: 'work', role: 'work', verb, room, cells: 0, units: 1, slackWatches: 0 } }))),
      ...[0, 1, 4, 5].map(units => ({ message, deal: { kind: 'work', role: 'hire', verb: 'repair', room: 'common', cells: 0, units, slackWatches: 0 } })),
      ...[0, 11, 12].map(slackWatches => ({ message, deal: { kind: 'work', role: 'work', verb: 'repair', room: 'common', cells: 0, units: 1, slackWatches } })),
    ];
    for (const raw of cases) {
      assert.equal(candidate.safeParse(raw).success, old.safeParse(raw).success && (!raw.deal || raw.message?.close === false));
      if (core.decodeCapabilityChoice(state, world, turn, raw).ok) assert.equal(candidate.safeParse(raw).success, true);
    }
    const result = core.applyCapabilityChoice(state, world, turn, accepted, { nowMs: now + 1, generation: 0 });
    assert.equal(result.ok, true); assert.equal(result.state.agreements[0].status, 'fulfilled');
    assert.equal(core.applyCapabilityChoice(result.state, result.world, turn, accepted, { nowMs: now + 2, generation: 0 }).code, 'already_applied');
  } finally { await core.close(); }
});

test('one durable attempt, exact context and512 limit; replay and expiry cannot spend another call', async () => {
  const originalFetch = globalThis.fetch; let networkCalls = 0, core;
  globalThis.fetch = () => { networkCalls += 1; throw Error('No network'); };
  try {
    core = await loadFrozenV7Core();
    const fixture = (await prepareCases(core)).find(item => item.actor === 'L');
    const parts = sourceParts(fixture.sourceJob); parts[2].text = JSON.stringify(refineDealSchema(fixture.sourceJob.job.outputContract.jsonSchema));
    // This is a replay of one frozen historical job, not a fresh tokenizer
    // benchmark. Bind its recorded token IDs to every exact component hash;
    // tests must not depend on one Mac's deleted temporary Python environment.
    const archived = JSON.parse(await readFile(new URL('../docs/research/model-society-v7-schema-probe-2026-09-08/ledger.json', import.meta.url), 'utf8'));
    const counts = archived.attempts[0].job.counts;
    validateCounts(parts, counts);
    const job = jobFor(fixture, counts);
    assert.equal(job.reservedNeurons, 221); assert.equal(job.reservedInputTokens, 5835);
    assert.deepEqual(job.payload.messages, fixture.sourceJob.payload.messages); assert.equal(job.payload.max_completion_tokens, 512);
    const ledger = { attempts: [] }; let persisted, calls = 0, rawDurable = false;
    const persist = async value => { persisted = structuredClone(value); if (value.attempts[0]?.rawResponse && !value.attempts[0]?.validation) rawDurable = true; };
    // Fabricated transport fixture only, never used by the runnable experiment.
    const output = { project: { mode: 'replace', goal: 'Assist Juno with maintenance.', why: 'Juno asked for help.',
      visibility: 'private', steps: [{ verb: 'repair', at: 'workshops' }] }, message: { to: 'J', text: 'I can help with that repair.' } };
    const response = { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }],
      usage: { prompt_tokens: 1500, completion_tokens: 100, total_tokens: 1600 } };
    const dispatch = async () => { calls += 1; assert.equal(persisted.attempts[0].state, 'reserved');
      assert.deepEqual(persisted.attempts[0].job, job); return { status: 200, text: JSON.stringify({ success: true, result: response }) }; };
    await runOnce(core, fixture, job, ledger, { persist, dispatch });
    assert.equal(rawDurable, true); assert.equal(ledger.attempts[0].validation.ok, true);
    await runOnce(core, fixture, job, ledger, { persist, dispatch }); assert.equal(calls, 1);
    const unknown = { attempts: [] };
    await runOnce(core, fixture, job, unknown, { persist, dispatch: async () => { throw Error('timeout'); } });
    assert.equal(unknown.attempts[0].accountedNeurons, 221);
    await runOnce(core, fixture, job, unknown, { persist, dispatch }); assert.equal(calls, 1);
    const blocked = { attempts: [] };
    await assert.rejects(runOnce(core, fixture, job, blocked, { persist, dispatch,
      beforeReserve: async () => checkOAuth('oauth_token="test-only"\nexpiration_time="2026-09-08T00:00:00Z"', Date.parse('2026-09-08T00:01:00Z')) }));
    assert.equal(blocked.attempts.length, 0); assert.equal(calls, 1);
    assert.equal(receipt({ ...response, usage: { prompt_tokens: 1500, completion_tokens: 513, total_tokens: 2013 } }, job).code, 'provider_exceeded_reservation');
    assert.equal(POLICY.maxCalls, 1); assert.equal(networkCalls, 0);
  } finally { globalThis.fetch = originalFetch; await core?.close(); }
});
