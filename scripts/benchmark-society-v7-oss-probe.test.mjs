import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrozenV7Core, prepareCases, validateCandidate } from './benchmark-society-frozen-v7.mjs';
import { inputManifest, POLICY, probeJob, runProbe, verifyInputs, verifyProbe } from './benchmark-society-v7-oss-probe.mjs';
import { checkCredentialExpiry, countParts, credentialsFor, hash, parseArgs, sourceParts, spent } from './benchmark-society-oss-probe.mjs';

const paths = { python: process.env.SOCIETY_TOKEN_PYTHON, cache: process.env.TIKTOKEN_CACHE_DIR };

test('probe remains offline by default and caps390 with two unique attempts and expiry guard', () => {
  let credentialReads = 0;
  const env = new Proxy({}, { get() { credentialReads += 1; throw Error('Credentials forbidden'); } });
  assert.equal(credentialsFor(parseArgs([]), env), null);
  assert.equal(credentialsFor(parseArgs(['--live', '--out', '/tmp/not-used', '--max-new-calls', '0']), env), null);
  assert.equal(credentialReads, 0); assert.equal(POLICY.maxCalls, 2); assert.equal(POLICY.maxNeurons, 390);
  assert.equal(parseArgs(['--live', '--out', '/tmp/not-used']).maxNewCalls, 1);
  assert.throws(() => parseArgs(['--live', '--out', '/tmp/not-used', '--max-new-calls', '3']));
  assert.throws(() => checkCredentialExpiry({ expiresAtMs: 120000 }, 0), /oauth_expiry_requires_refresh/);
});

test('exact B reply25 and L initial11 keep original failed evidence and do not repair close or inject plans', async () => {
  const savedFetch = globalThis.fetch; let core, calls = 0;
  globalThis.fetch = () => { calls += 1; throw Error('No HTTP permitted'); };
  try {
    core = await loadFrozenV7Core();
    const before = hash(core.frozenReference), fixtures = await prepareCases(core);
    assert.deepEqual(fixtures.map(fixture => [fixture.actor, fixture.job.stage, fixture.job.turn.sequence]), [['B', 'reply', 25], ['L', 'initial', 11]]);
    for (const fixture of fixtures) {
      assert.equal(fixture.job.job.outputContract.version, 3);
      assert.equal(fixture.baselineOutput.message.close, undefined);
      const sceneBefore = hash(fixture.scene);
      assert.equal(validateCandidate(core, fixture, fixture.baselineOutput).code, 'deal_requires_open_message');
      assert.equal(hash(fixture.scene), sceneBefore);
    }
    assert.equal(fixtures[0].baselineOutput.deal.verb, 'grow');
    assert.equal(fixtures[1].baselineOutput.deal.verb, 'repair');
    assert.equal(hash(core.frozenReference), before); await core.verifyFrozenSources();
    assert.equal(calls, 0);
  } finally { await core?.close(); globalThis.fetch = savedFetch; }
});

test('full offline tokens, original payload,390 ceiling, raw-before-apply and unknown/replay conservation', {
  skip: !paths.python || !paths.cache ? 'Requires reviewed offline tiktoken cache.' : false,
}, async () => {
  const savedFetch = globalThis.fetch; let core, apiCalls = 0;
  globalThis.fetch = () => { apiCalls += 1; throw Error('No HTTP permitted'); };
  try {
    core = await loadFrozenV7Core();
    const fixtures = await prepareCases(core), scenesBefore = fixtures.map(fixture => hash(fixture.scene));
    const jobs = fixtures.map(fixture => probeJob(fixture, countParts(sourceParts(fixture.job), paths)));
    assert.deepEqual(jobs.map(job => job.counts.parts.map(part => part.tokens)), [[724, 797, 2111], [724, 679, 2056]]);
    assert.deepEqual(jobs.map(job => job.reservedInputTokens), [5680, 5507]);
    assert.deepEqual(jobs.map(job => job.reservedNeurons), [251, 246]);
    for (const job of jobs) {
      assert.ok(job.id.startsWith('v7-oss-probe-v1:'));
      assert.deepEqual(job.payload.messages, job.sourceJob.payload.messages);
      assert.deepEqual(job.payload.response_format, job.sourceJob.payload.response_format);
      assert.equal(job.payload.seed, job.sourceJob.payload.seed); assert.equal(job.payload.temperature, job.sourceJob.payload.temperature);
      assert.equal(job.payload.reasoning_effort, 'low'); assert.equal(job.payload.max_completion_tokens, 1024);
      assert.equal(job.payload.max_tokens, undefined); assert.equal(job.payload.chat_template_kwargs, undefined);
    }
    await verifyInputs(core, await inputManifest(), jobs, paths);
    const altered = structuredClone(jobs); altered[0].counts.parts[0].ids[0] += 1;
    await assert.rejects(verifyInputs(core, await inputManifest(), altered, paths), /tokenizer_changed_before_dispatch/);
    const config = { test: 'v7-oss-offline', policy: POLICY }, fresh = () => ({ config, binding: hash(config), attempts: [] });
    let persisted, calls = 0;
    const persist = async value => { persisted = structuredClone(value); };
    const output = job => job.actor === 'B' ? { message: { to: 'C', text: 'Which conditions should the criteria cover?', close: false } }
      : { project: { mode: 'replace', goal: 'Agree to help Juno repair the workshops.', why: 'Juno has asked me for repair assistance.', visibility: 'private', steps: [] },
        message: { to: 'J', text: 'I offer one repair in the workshops for one cell after completion. Do you accept?', close: false },
        deal: { kind: 'work', role: 'work', cells: 1, units: 1, slackWatches: 2, verb: 'repair', room: 'workshops' } };
    const envelope = (job, usage = { prompt_tokens: 2000, completion_tokens: 300, total_tokens: 2300 }) => ({ status: 200,
      text: JSON.stringify({ success: true, result: { usage, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output(job)) } }] } }) });
    const dispatch = async job => {
      calls += 1; assert.equal(persisted.attempts.at(-1).state, 'reserved');
      assert.deepEqual(persisted.attempts.at(-1).job, job); assert.equal(persisted.attempts.at(-1).accountedNeurons, job.reservedNeurons);
      assert.ok(spent(persisted) <= 390); return envelope(job);
    };
    const ledger = fresh(), result = await runProbe(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls: 2 });
    assert.equal(result.newCalls, 2); assert.equal(result.halted, null); assert.equal(calls, 2);
    assert.ok(ledger.attempts.every(row => row.validation.ok && row.validation.clockUnchanged));
    assert.ok(ledger.attempts.every(row => row.validation.balanceChanges.length === 0), 'A proposal does not prepay work');
    assert.equal(spent(ledger), 170); verifyProbe(core, ledger, config, jobs);
    const before = hash(ledger);
    await runProbe(core, fixtures, jobs, ledger, { persist, maxNewCalls: 0, dispatch: () => assert.fail('Duplicate sent') });
    assert.equal(hash(ledger), before);
    const crash = structuredClone(ledger); delete crash.attempts[0].validation;
    await runProbe(core, fixtures, jobs, crash, { persist, maxNewCalls: 0, dispatch: () => assert.fail('Crash retried') });
    assert.deepEqual(crash.attempts[0].validation, ledger.attempts[0].validation);
    for (const usage of [{}, { prompt_tokens: 2000, completion_tokens: 300, total_tokens: 2300, neurons: 145 }]) {
      const capped = fresh(); let sent = 0;
      const stopped = await runProbe(core, fixtures, jobs, capped, { persist, maxNewCalls: 2,
        dispatch: async job => { sent += 1; return envelope(job, usage); } });
      assert.equal(sent, 1); assert.equal(stopped.halted, 'budget_exhausted');
      verifyProbe(core, capped, config, jobs);
      await runProbe(core, fixtures, jobs, capped, { persist, maxNewCalls: 2, dispatch: () => assert.fail('Capped attempt repeated') });
    }
    const unknown = fresh(); unknown.attempts.push({ id: jobs[0].id, job: jobs[0], state: 'reserved', accountedNeurons: 251 });
    verifyProbe(core, unknown, config, jobs);
    assert.equal((await runProbe(core, fixtures, jobs, unknown, { persist, maxNewCalls: 2,
      dispatch: () => assert.fail('Unknown attempted again') })).halted, 'budget_exhausted');
    const expired = fresh();
    await assert.rejects(runProbe(core, fixtures, jobs, expired, { persist, dispatch: () => assert.fail('Expired token used'),
      beforeReserve: () => checkCredentialExpiry({ expiresAtMs: 1 }, 0) }), /oauth_expiry_requires_refresh/);
    assert.equal(expired.attempts.length, 0);
    const tampered = structuredClone(ledger); tampered.attempts[0].job.payload.messages[1].content += ' Fix the fields.';
    assert.throws(() => verifyProbe(core, tampered, config, jobs), /probe_row/);
    assert.deepEqual(fixtures.map(fixture => hash(fixture.scene)), scenesBefore); assert.equal(apiCalls, 0);
  } finally { await core?.close(); globalThis.fetch = savedFetch; }
});
