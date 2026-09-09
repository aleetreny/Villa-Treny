import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadFrozenV6Core } from './benchmark-society-frozen-v6.mjs';
import { identityJob, identityVariant, inputManifest, POLICY, prepareIdentityCases, validateCloudBaseline, verifyInputs } from './benchmark-society-oss-identity-probe.mjs';
import { checkCredentialExpiry, countParts, credentialsFor, hash, parseArgs, prepareCases,
  runProbe, sourceParts, spent, verifyProbe } from './benchmark-society-oss-probe.mjs';

const paths = { python: process.env.SOCIETY_TOKEN_PYTHON, cache: process.env.TIKTOKEN_CACHE_DIR };
const readJson = async path => JSON.parse(await readFile(new URL(`../docs/research/${path}/ledger.json`, import.meta.url), 'utf8'));
const references = () => Promise.all([readJson('model-society-v6-2026-09-08'), readJson('model-society-local-identity-probe-2026-09-08')]);

test('offline and replay modes do not read credentials; expiry remains mandatory before a call', () => {
  let reads = 0;
  const env = new Proxy({}, { get() { reads += 1; throw Error('Credentials forbidden'); } });
  assert.equal(credentialsFor(parseArgs([]), env), null);
  assert.equal(credentialsFor(parseArgs(['--live', '--out', '/tmp/not-used', '--max-new-calls', '0']), env), null);
  assert.equal(reads, 0);
  assert.equal(POLICY.maxNeurons, 300);
  assert.equal(POLICY.maxCalls, 2);
  assert.throws(() => checkCredentialExpiry({ expiresAtMs: 121000 }, 1000), /oauth_expiry_requires_refresh/);
  assert.doesNotThrow(() => checkCredentialExpiry({ expiresAtMs: 121001 }, 1000));
});

test('identity intervention exactly matches local full names, and preserves V6 state, schema and SYSTEM', async () => {
  const fetchBefore = globalThis.fetch; let apiCalls = 0, core;
  globalThis.fetch = () => { apiCalls += 1; throw Error('Network forbidden'); };
  try {
    core = await loadFrozenV6Core();
    const [reference, local] = await references(), before = hash({ reference, local });
    const originals = await prepareCases(core, reference), fixtures = await prepareIdentityCases(core, reference, local);
    assert.deepEqual(fixtures.map(fixture => fixture.actor), ['B', 'C']);
    assert.deepEqual(fixtures.map(fixture => fixture.beforeHash), [
      '8f2fc4c9ba00ef9998fa175afbb947d6eafc6ccb460b718e75889af3c3d8d893',
      'f42b69895d555c63410ac28cfb8cc67d07fc80903d43b76a9bb108a402bf35f8',
    ]);
    for (const fixture of fixtures) {
      const original = originals.find(value => value.actor === fixture.actor), variant = fixture.variant;
      const localJob = local.attempts.find(row => row.job.actor === fixture.actor).job;
      const resident = core.RESIDENT_BY_ID[fixture.actor];
      assert.equal(variant.prefix.split('\n')[0], `You are ${resident.name} (${resident.id}). Speak and choose in the first person as ${resident.name}.`);
      assert.equal(fixture.sourceJob.job.prompt.user, variant.prefix + original.sourceJob.job.prompt.user);
      assert.deepEqual(fixture.sourceJob.payload.messages, localJob.payload.messages);
      assert.deepEqual(fixture.sourceJob.turn, original.sourceJob.turn);
      assert.equal(hash(fixture.scene), hash(original.scene));
      assert.deepEqual(fixture.sourceJob.job.outputContract, original.sourceJob.job.outputContract);
      assert.equal(fixture.sourceJob.job.prompt.system, original.sourceJob.job.prompt.system);
      assert.deepEqual(variant.recipientIds, original.sourceJob.job.outputContract.jsonSchema.properties.message.properties.to.enum);
      assert.ok(!variant.recipientIds.includes(fixture.actor));
      const reversed = structuredClone(fixture.sourceJob);
      reversed.job.prompt.user = original.sourceJob.job.prompt.user;
      reversed.payload.messages = original.sourceJob.payload.messages;
      assert.deepEqual(reversed, original.sourceJob); // Exactly two copies of the same USER string changed.
      for (const mutation of [job => { job.variant.prefix = job.variant.prefix.replace(resident.name, 'An invented identity'); },
        job => { job.sourceJob.turn.actor = 'A'; }, job => { job.payload.messages[0].content += ' Changed'; }]) {
        const changed = structuredClone(localJob); mutation(changed);
        assert.throws(() => identityVariant(core, original, changed), /local_identity_variant_changed/);
      }
    }
    assert.equal(hash({ reference, local }), before);
    await core.verifyFrozenSources();
    const manifest = await inputManifest(core);
    assert.equal(manifest.find(file => file.path.endsWith('runtime-v6.mjs')).sha256,
      core.sourceFiles.find(file => file.path.endsWith('runtime-v6.mjs')).sha256);
    const changedManifest = structuredClone(manifest); changedManifest[0].sha256 = '0'.repeat(64);
    await assert.rejects(verifyInputs(core, changedManifest, [], paths), /identity_inputs_changed/);
    assert.equal(apiCalls, 0);
  } finally { await core?.close(); globalThis.fetch = fetchBefore; }
});

test('cached full-input counts, reserve-before-dispatch, replay, unknown usage and strict 300-neuron ceiling', {
  skip: !paths.python || !paths.cache ? 'Requires reviewed offline tiktoken cache paths.' : false,
}, async () => {
  const fetchBefore = globalThis.fetch; let apiCalls = 0, core;
  globalThis.fetch = () => { apiCalls += 1; throw Error('Network forbidden'); };
  try {
    core = await loadFrozenV6Core();
    const [reference, local] = await references(), fixtures = await prepareIdentityCases(core, reference, local);
    const sceneHashes = fixtures.map(fixture => hash(fixture.scene));
    const jobs = fixtures.map(fixture => identityJob(fixture, countParts(sourceParts(fixture.sourceJob), paths)));
    const baseline = await readJson('model-society-oss-probe-2026-09-08');
    validateCloudBaseline(jobs, baseline);
    const changedBaseline = structuredClone(baseline); changedBaseline.attempts[0].job.payload.reasoning_effort = 'high';
    assert.throws(() => validateCloudBaseline(jobs, changedBaseline), /oss_baseline_changed/);
    assert.deepEqual(jobs.map(job => job.counts.parts.map(part => part.tokens)), [[625, 619, 716], [625, 659, 712]]);
    assert.deepEqual(jobs.map(job => job.reservedInputTokens), [4008, 4044]);
    assert.deepEqual(jobs.map(job => job.reservedNeurons), [198, 199]);
    assert.equal(jobs.reduce((sum, job) => sum + job.reservedNeurons, 0), 397);
    for (const job of jobs) {
      assert.ok(job.id.startsWith('oss-identity-probe-v1:'));
      assert.equal(job.payload.reasoning_effort, 'low');
      assert.equal(job.payload.max_completion_tokens, 1024);
      assert.deepEqual(job.payload.response_format, job.referenceJob.payload.response_format);
      assert.deepEqual(job.sourceJob.turn, job.referenceJob.turn);
      assert.equal(job.payload.response_format.json_schema.strict, true);
    }
    await verifyInputs(core, await inputManifest(core), jobs, paths);
    const altered = structuredClone(jobs); altered[0].counts.parts[0].ids[0] += 1;
    await assert.rejects(verifyInputs(core, await inputManifest(core), altered, paths), /tokenizer_changed_before_dispatch/);
    const config = { policy: POLICY, test: true }, fresh = () => ({ config, binding: hash(config), attempts: [] });
    let persisted, calls = 0;
    const persist = async value => { persisted = structuredClone(value); };
    const response = (job, usage = { prompt_tokens: 1800, completion_tokens: 200, total_tokens: 2000 }) => ({
      status: 200, text: JSON.stringify({ success: true, result: { usage, choices: [{ finish_reason: 'stop', message: {
        content: JSON.stringify({ project: { mode: 'replace', goal: 'Discuss one decision relevant to my own responsibility.',
          why: 'I want a concrete next step I can pursue.', visibility: 'private', steps: [] },
        message: { to: job.variant.recipientIds[0], text: 'Could we discuss one useful next step?', close: false } }),
      } }] } }),
    });
    const dispatch = async job => {
      calls += 1;
      assert.equal(persisted.attempts.at(-1).state, 'reserved');
      assert.deepEqual(persisted.attempts.at(-1).job, job);
      assert.equal(persisted.attempts.at(-1).accountedNeurons, job.reservedNeurons);
      assert.ok(spent(persisted) <= POLICY.maxNeurons);
      return response(job);
    };
    const ledger = fresh(), result = await runProbe(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls: 2 });
    assert.equal(result.newCalls, 2); assert.equal(calls, 2); assert.equal(spent(ledger), 142);
    assert.ok(ledger.attempts.every(row => row.validation.code === 'applied' && row.validation.balanceChanges.length === 0));
    verifyProbe(core, ledger, config, jobs);
    const saved = hash(ledger);
    await runProbe(core, fixtures, jobs, ledger, { persist, maxNewCalls: 0, dispatch: () => assert.fail('Duplicate dispatched') });
    assert.equal(hash(ledger), saved);
    const crash = structuredClone(ledger); delete crash.attempts[0].validation;
    await runProbe(core, fixtures, jobs, crash, { persist, maxNewCalls: 0, dispatch: () => assert.fail('Crash retry dispatched') });
    assert.deepEqual(crash.attempts[0].validation, ledger.attempts[0].validation);
    for (const usage of [{}, { prompt_tokens: 1800, completion_tokens: 200, total_tokens: 2000, neurons: 102 }]) {
      const capped = fresh(); let cappedCalls = 0;
      const stopped = await runProbe(core, fixtures, jobs, capped, { persist, maxNewCalls: 2,
        dispatch: async job => { cappedCalls += 1; return response(job, usage); } });
      assert.equal(cappedCalls, 1); assert.equal(stopped.halted, 'budget_exhausted');
      assert.ok(spent(capped) + jobs[1].reservedNeurons > POLICY.maxNeurons);
      verifyProbe(core, capped, config, jobs);
      await runProbe(core, fixtures, jobs, capped, { persist, maxNewCalls: 2, dispatch: () => assert.fail('Capped/unknown result retried') });
    }
    const unknown = fresh(); unknown.attempts.push({ id: jobs[0].id, job: jobs[0], state: 'reserved', accountedNeurons: 198 });
    verifyProbe(core, unknown, config, jobs);
    assert.equal((await runProbe(core, fixtures, jobs, unknown, { persist, maxNewCalls: 2,
      dispatch: () => assert.fail('Reserved result retried') })).halted, 'budget_exhausted');
    const expired = fresh();
    await assert.rejects(runProbe(core, fixtures, jobs, expired, { persist, dispatch: () => assert.fail('Expired token used'),
      beforeReserve: () => checkCredentialExpiry({ expiresAtMs: 120000 }, 0) }), /oauth_expiry_requires_refresh/);
    assert.equal(expired.attempts.length, 0);
    assert.deepEqual(fixtures.map(fixture => hash(fixture.scene)), sceneHashes);
    assert.equal(apiCalls, 0);
  } finally { await core?.close(); globalThis.fetch = fetchBefore; }
});
