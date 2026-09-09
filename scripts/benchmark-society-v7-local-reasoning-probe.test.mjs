import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, loadFrozenV7Core, prepareCases, REFERENCE_DIR, validateCandidate, verifyFrozenBundle } from './benchmark-society-frozen-v7.mjs';
import { parseArgs, POLICY, reasoningJob, receipt, runProbe, verifyLedger } from './benchmark-society-v7-local-reasoning-probe.mjs';

const noHTTP = async operation => {
  const original = globalThis.fetch; let networkCalls = 0;
  globalThis.fetch = () => { networkCalls += 1; assert.fail('Offline test requested HTTP'); };
  try { await operation(); assert.equal(networkCalls, 0); } finally { globalThis.fetch = original; }
};

// Synthetic envelopes below are transport fixtures only. They are never written
// into research results or used as claims about actual model performance.
const envelope = output => ({ status: 200, headers: { warning: '299 schema fallback: fixture' }, text: JSON.stringify({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output), reasoning_content: 'TEST reasoning only.' } }],
  usage: { prompt_tokens: 2000, completion_tokens: 1600, total_tokens: 3600, completion_tokens_details: { reasoning_tokens: 1400 } },
}) });

test('frozen V7 reconstructs exact B reply and L initial despite current core changes, with only two requested payload differences', () => noHTTP(async () => {
  const core = await loadFrozenV7Core();
  try {
    const frozen = hash(core.frozenReference), fixtures = await prepareCases(core);
    assert.equal(core.frozenProvenance.sourceFileCount, 62);
    assert.deepEqual(fixtures.map(fixture => [fixture.actor, fixture.job.stage, fixture.job.index, fixture.job.turn.sequence]),
      [['B', 'reply', 0, 25], ['L', 'initial', 11, 11]]);
    for (const fixture of fixtures) {
      const before = hash(fixture), job = reasoningJob(fixture), restored = structuredClone(job.payload);
      assert.equal(job.payload.max_tokens, 4096); assert.equal(job.payload.chat_template_kwargs.enable_thinking, true);
      restored.max_tokens = 1024; restored.chat_template_kwargs.enable_thinking = false;
      assert.deepEqual(restored, fixture.sourceJob.payload);
      assert.equal(validateCandidate(core, fixture, fixture.baselineOutput).code, 'deal_requires_open_message');
      assert.equal(hash(fixture), before);
      assert.equal(validateCandidate(core, fixture, { actor: 'Z', cells: 999 }).code, 'source_schema_violation');
    }
    assert.equal(hash(core.frozenReference), frozen); await core.verifyFrozenSources();
    const bundle = JSON.parse(await readFile(join(REFERENCE_DIR, 'source-bundle.json'), 'utf8'));
    assert.equal(verifyFrozenBundle(bundle, core.frozenReference).length, 62);
    const changed = structuredClone(bundle); changed.files[0].text += '\n';
    assert.throws(() => verifyFrozenBundle(changed, core.frozenReference), /frozen_source_integrity/);
    const missing = structuredClone(bundle); missing.files.pop();
    assert.throws(() => verifyFrozenBundle(missing, core.frozenReference), /frozen_source_set/);
  } finally { await core.close(); }
}));

test('reservation, raw durability, exact local application, zero-call replay and unknown IDs use frozen source with no HTTP', () => noHTTP(async () => {
  const core = await loadFrozenV7Core();
  try {
    const fixtures = await prepareCases(core), jobs = fixtures.map(reasoningJob), config = { fixture: 'offline-only', jobs: jobs.map(hash) };
    const fresh = () => ({ config, binding: hash(config), attempts: [] });
    let persisted, calls = 0; const ledger = fresh();
    const persist = async value => { persisted = structuredClone(value); };
    const dispatch = async job => {
      calls += 1;
      const reserved = persisted.attempts.at(-1);
      assert.equal(reserved.state, 'reserved'); assert.equal(reserved.reservedCalls, 1); assert.deepEqual(reserved.job, job);
      const corrected = structuredClone(fixtures.find(fixture => fixture.actor === job.actor).baselineOutput);
      corrected.message.close = false; // Explicit synthetic causal fixture, not a model result.
      return envelope(corrected);
    };
    const result = await runProbe(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls: 2, afterReceipt: row => {
      assert.equal(row.rawResponse, persisted.attempts.at(-1).rawResponse); assert.equal(row.validation, undefined);
    } });
    assert.equal(calls, 2); assert.equal(result.newCalls, 2); assert.equal(result.halted, null);
    assert.ok(ledger.attempts.every(row => row.receipt.schemaFallbackWarning && row.receipt.usageComplete));
    assert.ok(ledger.attempts.every(row => row.validation.code === 'applied' && row.validation.clockUnchanged));
    verifyLedger(core, ledger, config, jobs);
    const frozen = hash(ledger);
    const replay = await runProbe(core, fixtures, jobs, ledger, { maxNewCalls: 0, dispatch: () => assert.fail('Replay dispatched') });
    assert.equal(replay.newCalls, 0); assert.equal(hash(ledger), frozen);
    const crash = fresh();
    await assert.rejects(runProbe(core, fixtures, jobs, crash, { persist, dispatch,
      afterReceipt: () => { throw Error('crash-before-apply'); } }), /crash-before-apply/);
    assert.equal(crash.attempts[0].state, 'completed'); assert.equal(crash.attempts[0].validation, undefined);
    await runProbe(core, fixtures, jobs, crash, { maxNewCalls: 0, dispatch: () => assert.fail('Durable result retried') });
    assert.equal(crash.attempts[0].validation.code, 'applied');
    const unknown = fresh();
    await assert.rejects(runProbe(core, fixtures, jobs, unknown, { persist: () => { throw Error('crash-after-reserve'); },
      dispatch: () => assert.fail('Reservation was not durable') }), /crash-after-reserve/);
    const spent = unknown.attempts[0].id;
    const resumed = await runProbe(core, fixtures, jobs, unknown, { maxNewCalls: 1, persist, dispatch: async job => {
      assert.notEqual(job.id, spent); return { status: 503, text: 'TEST unavailable', headers: {} };
    } });
    assert.equal(resumed.newCalls, 1); assert.equal(unknown.attempts[0].state, 'reserved');
    assert.equal(unknown.attempts[1].state, 'failed'); verifyLedger(core, unknown, config, jobs);
    const changed = structuredClone(ledger); changed.attempts[0].rawResponse = '{}';
    assert.throws(() => verifyLedger(core, changed, config, jobs), /probe_receipt_mismatch/);
    const repeated = structuredClone(ledger); repeated.attempts.push(repeated.attempts[0]);
    assert.throws(() => verifyLedger(core, repeated, config, jobs), /probe_row/);
    const alteredPayload = structuredClone(ledger); alteredPayload.attempts[0].job.payload.seed += 1;
    assert.throws(() => verifyLedger(core, alteredPayload, config, jobs), /probe_row/);
  } finally { await core.close(); }
}));

test('local reasoning budget covers reasoning tokens, rejects truncation and records missing usage and grammar fallback honestly', () => {
  const core = { parseStructuredPayload: JSON.parse }, raw = JSON.parse(envelope({}).text);
  assert.equal(receipt(core, raw).code, null); assert.equal(receipt(core, raw).usageComplete, true);
  const over = structuredClone(raw); over.usage.completion_tokens = 4097; over.usage.total_tokens = 6097;
  assert.equal(receipt(core, over).code, 'output_cap_exceeded');
  const truncated = structuredClone(raw); truncated.choices[0].finish_reason = 'length';
  assert.equal(receipt(core, truncated).code, 'output_truncated');
  const incomplete = structuredClone(raw); delete incomplete.usage;
  assert.equal(receipt(core, incomplete).usageComplete, false);
  assert.equal(receipt(core, raw, { warning: '299 grammar fallback' }).schemaFallbackWarning, true);
  assert.equal(POLICY.endpoint, 'http://127.0.0.1:8018/v1/chat/completions');
  assert.equal(POLICY.timeoutMs, 120000); assert.equal(POLICY.concurrency, 1);
  assert.equal(parseArgs([]).run, false);
  assert.equal(parseArgs(['--run', '--out', '/tmp/test-only', '--max-new-calls', '0']).pid, null);
  assert.equal(parseArgs(['--run', '--out', '/tmp/test-only', '--server-pid', '14483']).maxNewCalls, 1);
  for (const count of ['3', '-1', '0.5']) assert.throws(() => parseArgs(['--run', '--out', '/tmp/test-only', '--server-pid', '1', '--max-new-calls', count]));
  assert.throws(() => parseArgs(['--run', '--out', 'relative', '--server-pid', '1']));
  assert.throws(() => parseArgs(['--endpoint', 'https://elsewhere.invalid']));
});
