import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadFrozenV6Core as loadCore, verifyFrozenBundle } from './benchmark-society-frozen-v6.mjs';
import { hash, prepareCases } from './benchmark-society-oss-probe.mjs';
import { localJob, localReceipt, MODEL, parseArgs, POLICY, runLocal, verifyLocal } from './benchmark-society-local-probe.mjs';

test('local probe has fixed loopback transport, no credential options, bounded explicit run', () => {
  assert.equal(POLICY.endpoint, 'http://127.0.0.1:8018/v1/chat/completions');
  assert.equal(parseArgs([]).run, false);
  assert.equal(parseArgs(['--run', '--out', '/tmp/local-probe', '--server-pid', '123']).maxNewCalls, 1);
  for (const args of [['--url', 'https://example.com'], ['--token', 'secret'], ['--run'],
    ['--run', '--out', 'relative', '--server-pid', '123'], ['--run', '--run'], ['--max-new-calls', '2'],
    ['--run', '--out', '/tmp/local', '--server-pid', '123', '--max-new-calls', '3']]) assert.throws(() => parseArgs(args));
  const parse = { parseStructuredPayload: JSON.parse };
  const response = { choices: [{ finish_reason: 'stop', message: { content: '{}' } }], usage: {} };
  assert.equal(localReceipt(parse, response).usageComplete, false);
  assert.equal(localReceipt(parse, response, { warning: 'schema not enforced' }).warning, 'schema not enforced');
  response.usage = { prompt_tokens: 100, completion_tokens: 769, total_tokens: 869 };
  assert.equal(localReceipt(parse, response).code, 'output_cap_exceeded');
  response.choices[0].finish_reason = 'length'; delete response.usage;
  assert.equal(localReceipt(parse, response).code, 'output_truncated');
});

test('frozen source provenance rejects omission, changed contents, duplicate and escaped paths', async () => {
  const source = new URL('../docs/research/model-society-v6-2026-09-08/', import.meta.url);
  const bundle = JSON.parse(await readFile(new URL('source-bundle.json', source), 'utf8'));
  const reference = JSON.parse(await readFile(new URL('ledger.json', source), 'utf8'));
  assert.equal(verifyFrozenBundle(bundle, reference).length, reference.config.source.length);
  const missing = structuredClone(bundle); missing.files.pop();
  assert.throws(() => verifyFrozenBundle(missing, reference), /frozen_source_set/);
  const changed = structuredClone(bundle); changed.files[0].text += 'changed';
  assert.throws(() => verifyFrozenBundle(changed, reference), /frozen_source_integrity/);
  const escaped = structuredClone(bundle); escaped.files[0].path = '../escape';
  assert.throws(() => verifyFrozenBundle(escaped, reference), /frozen_source_integrity/);
  const duplicate = structuredClone(bundle); duplicate.files[1] = duplicate.files[0];
  assert.throws(() => verifyFrozenBundle(duplicate, reference), /frozen_source_integrity/);
});

test('exact real V6 B/C context, safe local application, durable receipts and immutable replay without HTTP', async () => {
  const originalFetch = globalThis.fetch; let requests = 0, core;
  globalThis.fetch = () => { requests += 1; throw Error('Offline test prohibits every HTTP request'); };
  try {
    core = await loadCore();
    await core.verifyFrozenSources();
    assert.equal(core.frozenProvenance.dependencies.zod, '4.4.3');
    const reference = JSON.parse(await readFile(new URL('../docs/research/model-society-v6-2026-09-08/ledger.json', import.meta.url), 'utf8'));
    const original = hash(reference), fixtures = await prepareCases(core, reference), jobs = fixtures.map(localJob);
    assert.deepEqual(jobs.map(job => job.actor), ['B', 'C']);
    for (const job of jobs) {
      assert.deepEqual(job.payload.messages, job.sourceJob.payload.messages);
      assert.deepEqual(job.payload.response_format, job.sourceJob.payload.response_format);
      assert.equal(job.payload.model, MODEL.id); assert.equal(job.payload.max_tokens, 768);
      assert.deepEqual(job.payload.chat_template_kwargs, { enable_thinking: false });
      assert.equal(job.payload.max_completion_tokens, undefined);
      assert.equal(job.payload.response_format.json_schema.strict, true);
    }
    const changedFixture = structuredClone(fixtures[0]); changedFixture.sourceJob.payload.messages[0].content += 'changed';
    assert.throws(() => localJob(changedFixture), /source_context_mismatch/);
    const config = { source: core.sourceFiles, referenceHash: original, test: true };
    const ledger = { config, binding: hash(config), attempts: [] }; let persisted, calls = 0, concurrent = 0;
    const persist = async value => { persisted = structuredClone(value); };
    const output = job => ({ project: { mode: 'replace', goal: 'Discuss a useful next step in my own responsibility.',
      why: 'I want to agree on a concrete decision before acting.', visibility: 'private', steps: [] },
    message: { to: job.actor === 'B' ? 'K' : 'N', text: 'Could we discuss one useful next step?', close: false } });
    const dispatch = async job => {
      calls += 1; concurrent += 1; assert.equal(concurrent, 1);
      assert.equal(persisted.attempts.at(-1).state, 'reserved');
      await Promise.resolve(); concurrent -= 1;
      return { status: 200, headers: { 'content-type': 'application/json', ...(job.actor === 'C' ? { warning: 'test fallback warning' } : {}) },
        text: JSON.stringify({ model: MODEL.id, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output(job)) } }],
          usage: { prompt_tokens: 1700, completion_tokens: 140, total_tokens: 1840 } }) };
    };
    assert.equal((await runLocal(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls: 1 })).newCalls, 1);
    assert.equal(ledger.attempts[0].validation.code, 'applied');
    assert.equal((await runLocal(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls: 1 })).newCalls, 1);
    assert.equal(calls, 2); assert.equal(ledger.attempts[1].receipt.warning, 'test fallback warning');
    assert.ok(ledger.attempts.every(row => row.validation.balanceChanges.length === 0));
    verifyLocal(core, ledger, config, jobs);
    const beforeReplay = hash(ledger);
    await runLocal(core, fixtures, jobs, ledger, { persist, maxNewCalls: 0, dispatch: () => assert.fail('Replay dispatch') });
    assert.equal(hash(ledger), beforeReplay);
    const crash = structuredClone(ledger); delete crash.attempts[0].validation;
    await runLocal(core, fixtures, jobs, crash, { persist, maxNewCalls: 0, dispatch: () => assert.fail('Crash retry') });
    assert.deepEqual(crash.attempts[0].validation, ledger.attempts[0].validation);
    const ambiguous = { config, binding: hash(config), attempts: [{ id: jobs[0].id, job: jobs[0], state: 'reserved' }] };
    verifyLocal(core, ambiguous, config, jobs);
    await runLocal(core, fixtures, jobs, ambiguous, { persist, maxNewCalls: 1, dispatch: job => {
      assert.equal(job.actor, 'C'); return dispatch(job);
    } });
    assert.equal(ambiguous.attempts[0].state, 'reserved');
    const tampered = structuredClone(ledger); tampered.attempts[0].rawResponse = '{}';
    assert.throws(() => verifyLocal(core, tampered, config, jobs), /local_raw_response/);
    const wrongPayload = structuredClone(ledger); wrongPayload.attempts[0].job.payload.max_tokens = 1024;
    assert.throws(() => verifyLocal(core, wrongPayload, config, jobs), /local_row/);
    assert.throws(() => verifyLocal(core, { ...ledger, binding: 'changed' }, config, jobs), /local_binding/);
    const wrongApply = structuredClone(ledger); wrongApply.attempts[0].validation.code = 'forged';
    await assert.rejects(runLocal(core, fixtures, jobs, wrongApply, { persist, maxNewCalls: 0 }), /local_replay_mismatch/);
    const timeout = { config, binding: hash(config), attempts: [] };
    await runLocal(core, fixtures, jobs, timeout, { persist, maxNewCalls: 2, dispatch: job => {
      if (job.actor === 'B') throw new DOMException('Timeout', 'TimeoutError');
      return dispatch(job);
    } });
    assert.equal(timeout.attempts[0].state, 'timeout'); assert.equal(timeout.attempts[0].validation, undefined);
    assert.equal(timeout.attempts[1].validation.code, 'applied');
    verifyLocal(core, timeout, config, jobs);
    assert.equal(hash(reference), original); assert.equal(requests, 0);
  } finally { await core?.close(); globalThis.fetch = originalFetch; }
});
