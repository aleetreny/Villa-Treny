import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { buildJob, captureSourceBundle, decodedReceipt, hash, loadCore, MODEL, newLedger, parseArgs,
  POLICY, receive, report, runFixture, sourceManifest, verifyLedger, verifySourceBundle } from './benchmark-society-runtime-v7-local.mjs';

// Fabricated replies are test-only transport fixtures. The runnable harness has
// no artificial responses or target outcomes: only actual local output advances it.
function fakeOutput(job) {
  const context = JSON.parse(job.turn.prompt.slice(job.turn.prompt.lastIndexOf('\n{') + 1));
  const project = { mode: 'replace', goal: 'Walk Common and record the visit, then rest.', why: 'I want an actual visit followed by rest.',
    visibility: 'public', steps: [{ verb: 'walk_room_and_log_visit', at: 'common' }, { verb: 'rest', at: 'common' }] };
  let response;
  if (job.stage === 'initial' && job.actor === 'A') response = { project,
    message: { to: 'B', text: 'Would you walk Common once? We could agree on a payment for the recorded visit.' } };
  else if (job.stage === 'initial' && job.actor === 'B') response = {
    project: { ...project, goal: 'Agree on a paid visit to Common.', steps: [] },
    message: { to: 'A', text: 'I propose one cell after I walk Common once and record the visit. Do you accept?', close: false },
    deal: { kind: 'work', role: 'work', cells: 1, verb: 'walk_room_and_log_visit', room: 'common', units: 1, slackWatches: 1 } };
  else if (job.stage === 'initial') {
    const to = job.job.outputContract.jsonSchema.properties?.message?.properties?.to?.enum?.[0];
    response = { project, ...(to ? { message: { to, text: 'I plan to walk Common, record the visit, then rest.', close: true } } : {}) };
  } else if (job.stage === 'reply') {
    const to = job.job.outputContract.jsonSchema.properties?.message?.properties?.to?.enum?.[0];
    assert.ok(to);
    response = context.openOffers?.length ? { message: { to, text: 'I accept one cell after your recorded visit to Common.', close: false },
      deal: { kind: 'accept', offerId: context.openOffers[0].id } }
      : { message: { to, text: 'We can check the recorded outcome after the visit.', close: true } };
  } else {
    response = { reflection: { text: 'I will retain the next step and use the recorded result.', refs: [job.turn.evidenceIds[0]] } };
    if (job.job.outputContract.jsonSchema.required?.includes('message')) {
      const to = job.job.outputContract.jsonSchema.properties.message.properties.to.enum[0];
      response.message = { to, text: 'I have received your reply. We can now use the recorded result.', close: true };
    }
  }
  assert.equal(z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(response).success, true,
    `Fixture must respect actual capability grammar for ${job.actor}/${job.stage}`);
  return response;
}

const envelope = (job, output = fakeOutput(job), warning) => ({ status: 200,
  headers: warning ? { warning } : {}, text: JSON.stringify({ model: MODEL.id,
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(output) } }],
    usage: { prompt_tokens: 1600, completion_tokens: 250, total_tokens: 1850 } }) });

test('V7 uses actual capability3, 25 independent voices, bilateral consent, one watch and conserved payment', async () => {
  const savedFetch = globalThis.fetch; let networkCalls = 0, core;
  globalThis.fetch = () => { networkCalls += 1; throw Error('Network forbidden'); };
  try {
    core = await loadCore();
    const config = { test: 'offline-local-v7', policy: POLICY, model: MODEL }, ledger = newLedger(config);
    let persisted, calls = 0;
    const persist = async value => { persisted = structuredClone(value); };
    const dispatch = async job => {
      calls += 1;
      const durable = persisted.entries.at(-1);
      assert.equal(durable.state, 'reserved'); assert.deepEqual(durable.job, job); assert.equal(durable.reservedCalls, 1);
      assert.equal(job.job.outputContract.version, 3); assert.equal(job.payload.max_tokens, 1024);
      assert.equal(job.payload.max_completion_tokens, undefined); assert.equal(job.payload.model, MODEL.id);
      assert.deepEqual(job.payload.chat_template_kwargs, { enable_thinking: false });
      assert.deepEqual(job.payload.messages, [{ role: 'system', content: job.job.prompt.system }, { role: 'user', content: job.job.prompt.user }]);
      assert.deepEqual(job.payload.response_format.json_schema, { name: 'society_turn', schema: job.job.outputContract.jsonSchema, strict: true });
      return envelope(job);
    };
    const result = await runFixture(core, ledger, { persist, dispatch, afterReceipt: row => {
      assert.equal(persisted.entries.at(-1).rawResponse, row.rawResponse);
      assert.equal(row.application, undefined);
    } });
    verifyLedger(ledger, config, core);
    const rows = ledger.entries.filter(row => row.kind === 'cognition'), watch = ledger.entries.find(row => row.kind === 'watch');
    assert.equal(result.halted, null); assert.equal(calls, 31); assert.equal(result.newCalls, 31);
    assert.equal(new Set(rows.filter(row => row.job.stage === 'initial').map(row => row.job.actor)).size, 25);
    assert.equal(rows.filter(row => row.job.stage === 'reply').length, 2);
    assert.equal(rows.filter(row => row.job.stage === 'replan').length, 4);
    assert.ok(rows.every(row => row.application.ok));
    assert.ok(rows.every(row => row.application.balanceChanges.length === 0), 'Proposing/accepting work cannot prepay it');
    assert.equal(result.state.agreements.length, 1); assert.equal(result.state.agreements[0].status, 'fulfilled');
    assert.equal(result.state.agreements[0].terms.verb, 'inspect', 'The V3 capability maps to the exact canonical action');
    const initial = core.genesisState(POLICY.seed);
    assert.equal(result.world.bodies.A.cells, initial.bodies.A.cells - 1);
    assert.equal(result.world.bodies.B.cells, initial.bodies.B.cells + 1);
    assert.equal(core.totalCells(result.world), core.totalCells(initial));
    assert.equal(result.world.day, 100); assert.equal(result.world.watch, 2);
    assert.equal(watch.observations.length, 25); assert.equal(new Set(watch.observations.map(row => row.actor)).size, 25);
    assert.ok(core.RESIDENTS.filter(({ id }) => id !== 'B').every(({ id }) =>
      result.state.minds[id].project.steps[0].status === 'done' && result.state.minds[id].project.steps[1].status === 'pending'));
    assert.deepEqual(result.state.minds.B.project.steps, []); assert.equal(result.state.minds.B.project.status, 'active');
    const summary = report(core, ledger, result);
    assert.equal(summary.physicalWatchCount, 1); assert.equal(summary.humanReview.status, 'pending');
    assert.equal(summary.schemaFallbackWarnings, 0); assert.equal(summary.final.agreements[0].status, 'fulfilled');
    const frozen = hash(ledger), end = hash({ state: result.state, world: result.world });
    const replay = await runFixture(core, ledger, { maxNewCalls: 0, dispatch: () => assert.fail('Replay requested inference') });
    assert.equal(hash(ledger), frozen); assert.equal(hash({ state: replay.state, world: replay.world }), end);
    assert.equal(networkCalls, 0);
  } finally { await core?.close(); globalThis.fetch = savedFetch; }
});

test('staging, unknown IDs, raw-result recovery, warnings and tamper checks remain fail-closed', async () => {
  const savedFetch = globalThis.fetch; let networkCalls = 0, core;
  globalThis.fetch = () => { networkCalls += 1; throw Error('Network forbidden'); };
  try {
    core = await loadCore();
    const config = { test: 'staged-v7', policy: POLICY }, ledger = newLedger(config);
    const persist = async () => {}, sent = new Set();
    const dispatch = async job => { assert.ok(!sent.has(job.id)); sent.add(job.id); return envelope(job); };
    const first = await runFixture(core, ledger, { persist, dispatch, maxNewCalls: 1 });
    assert.equal(first.newCalls, 1); assert.equal(ledger.entries.length, 1); assert.equal(first.halted, 'call_limit_reached');
    const second = await runFixture(core, ledger, { persist, dispatch, maxNewCalls: 4 });
    assert.equal(second.newCalls, 4);
    const frozen = hash(ledger);
    await runFixture(core, ledger, { maxNewCalls: 0, dispatch: () => assert.fail('Zero-call replay dispatched') });
    assert.equal(hash(ledger), frozen);
    let current = second;
    while (current.halted) current = await runFixture(core, ledger, { persist, dispatch, maxNewCalls: 3 });
    assert.equal(sent.size, 31); assert.equal(ledger.entries.filter(row => row.kind === 'watch').length, 1);
    verifyLedger(ledger, config, core);
    const crash = newLedger(config);
    await assert.rejects(runFixture(core, crash, { dispatch: async job => envelope(job),
      afterReceipt: () => { throw Error('crash-before-apply'); } }), /crash-before-apply/);
    assert.equal(crash.entries[0].state, 'completed'); assert.equal(crash.entries[0].application, undefined);
    await runFixture(core, crash, { maxNewCalls: 0, dispatch: () => assert.fail('Durable result retried') });
    assert.equal(crash.entries[0].application.code, 'applied');
    const unknown = newLedger(config);
    await assert.rejects(runFixture(core, unknown, { persist: async () => { throw Error('crash-after-reserve'); },
      dispatch: () => assert.fail('No request before durable reservation') }), /crash-after-reserve/);
    assert.equal(unknown.entries[0].state, 'reserved');
    const consumed = unknown.entries[0].id;
    const resumed = await runFixture(core, unknown, { maxNewCalls: 1,
      dispatch: async job => { assert.notEqual(job.id, consumed); return { status: 503, text: 'Unavailable' }; } });
    assert.equal(resumed.newCalls, 1); assert.equal(unknown.entries[0].state, 'reserved');
    assert.equal(unknown.entries[1].state, 'failed'); verifyLedger(unknown, config, core);
    const warned = newLedger(config);
    await runFixture(core, warned, { maxNewCalls: 1, dispatch: async job => envelope(job, fakeOutput(job), '299 schema fallback: unsupported keyword') });
    assert.equal(warned.entries[0].receipt.schemaFallbackWarning, true);
    assert.equal(warned.entries[0].application.code, 'applied', 'Local domain validation remains authoritative despite recorded grammar fallback');
    assert.equal(report(core, warned, first).schemaFallbackWarnings, 1);
    const world = core.genesisState(POLICY.seed), scene = { world, state: core.createSocietyState(world, POLICY.epochMs), worldRevision: 0 };
    const job = buildJob(core, scene, 'A', 'initial', 0);
    const oversized = newLedger(config);
    assert.equal((await receive({ ...job, promptBytes: POLICY.maxPromptBytes + 1 }, oversized, persist,
      () => assert.fail('Oversized context sent'), core.parseStructuredPayload)).errorCode, 'context_overflow');
    assert.equal(oversized.entries[0].reservedCalls, 0);
    const invalid = newLedger(config);
    const invalidResult = await runFixture(core, invalid, { maxNewCalls: 1, dispatch: async next => envelope(next, { actor: 'B', cells: 999999 }) });
    assert.equal(invalid.entries[0].application.code, 'provider_schema_violation');
    assert.equal(core.totalCells(invalidResult.world), core.totalCells(world));
    const duplicate = structuredClone(ledger); duplicate.entries.push(duplicate.entries[0]);
    assert.throws(() => verifyLedger(duplicate, config, core), /duplicate_or_invalid_ledger_id/);
    const rawTamper = structuredClone(ledger); rawTamper.entries[0].rawResponse = '{}';
    assert.throws(() => verifyLedger(rawTamper, config, core), /receipt_mismatch/);
    const payloadTamper = structuredClone(ledger); payloadTamper.entries[0].job.payload.max_tokens = 2048;
    await assert.rejects(runFixture(core, payloadTamper, { maxNewCalls: 0 }), /replay_job_mismatch/);
    const truncated = decodedReceipt({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }, core.parseStructuredPayload);
    assert.equal(truncated.receiptCode, 'output_truncated');
    assert.equal(networkCalls, 0);
  } finally { await core?.close(); globalThis.fetch = savedFetch; }
});

test('current source freeze and CLI limits do not need local HTTP, model or credentials', async () => {
  assert.equal(parseArgs([]).run, false);
  assert.equal(parseArgs([]).protocolVersion, 3);
  assert.equal(parseArgs(['--run', '--out', '/tmp/protocol4', '--max-new-calls', '0', '--protocol-version', '4']).protocolVersion, 4);
  assert.throws(() => parseArgs(['--run', '--out', '/tmp/unknown', '--max-new-calls', '0', '--protocol-version', '5']));
  assert.equal(parseArgs(['--run', '--out', '/tmp/unexecuted', '--server-pid', '123']).maxNewCalls, 1);
  assert.equal(parseArgs(['--run', '--out', '/tmp/unexecuted', '--max-new-calls', '0']).pid, null);
  for (const n of ['38', '-1', '1.5']) assert.throws(() => parseArgs(['--run', '--out', '/tmp/unexecuted', '--server-pid', '123', '--max-new-calls', n]));
  assert.throws(() => parseArgs(['--run', '--out', 'relative', '--server-pid', '123']));
  assert.throws(() => parseArgs(['--run', '--out', '/tmp/unexecuted']));
  assert.equal(POLICY.maxOutputTokens, 1024); assert.equal(POLICY.timeoutMs, 120000); assert.equal(POLICY.concurrency, 1);
  assert.equal(POLICY.endpoint, 'http://127.0.0.1:8018/v1/chat/completions');
  const source = await sourceManifest(), bundle = await captureSourceBundle(source, 'offline-test');
  verifySourceBundle(bundle, source);
  for (const path of ['src/lib/habitat/society/capabilities.ts', 'workers/habitat-runtime/src/society-scheduler.ts', 'scripts/benchmark-society-runtime-v7-local.mjs'])
    assert.ok(source.some(file => file.path === path));
  const changed = structuredClone(bundle); changed.files[0].text += '\n';
  assert.throws(() => verifySourceBundle(changed, source), /source_bundle_integrity/);
});

test('explicit protocol4 can offer on first contact, preserves independent consent, and cannot reinterpret a protocol3 ledger', async () => {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('Offline fixture must not request inference');
  let core;
  try {
    core = await loadCore();
    const config = { test: 'opening-proposals-only-synthetic', policy: { ...POLICY, protocol: 4 }, model: MODEL };
    const ledger = newLedger(config); let persisted, calls = 0;
    const result = await runFixture(core, ledger, { persist: async value => { persisted = structuredClone(value); }, dispatch: async job => {
      calls++;
      assert.equal(persisted.entries.at(-1).state, 'reserved');
      assert.deepEqual(persisted.entries.at(-1).job, job);
      assert.equal(job.job.outputContract.version, 4);
      assert.equal(job.payload.max_tokens, 1024);
      assert.deepEqual(job.payload.chat_template_kwargs, { enable_thinking: false });
      let output;
      if (job.stage === 'initial' && job.actor === 'A') {
        output = { ...fakeOutput(job), message: { to: 'B', text: 'Would you walk Common once for one cell after the recorded visit?', close: false },
          deal: { kind: 'work', role: 'hire', cells: 1, verb: 'walk_room_and_log_visit', room: 'common', units: 1, slackWatches: 1 } };
      } else if (job.stage === 'initial' && job.actor === 'B') {
        const context = JSON.parse(job.turn.prompt.slice(job.turn.prompt.lastIndexOf('\n{') + 1));
        assert.equal(context.openOffers.length, 1);
        output = { project: { mode: 'replace', goal: 'Perform the visit I choose to accept.', why: 'The terms are clear.', visibility: 'private', steps: [] },
          message: { to: 'A', text: 'I accept one cell after my recorded visit.', close: false },
          deal: { kind: 'accept', offerId: context.openOffers[0].id } };
      } else output = fakeOutput(job);
      assert.ok(z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(output).success);
      return envelope(job, output);
    } });
    verifyLedger(ledger, config, core);
    assert.equal(result.halted, null); assert.equal(calls, 30);
    assert.equal(result.state.agreements[0].status, 'fulfilled');
    const before = core.genesisState(POLICY.seed);
    assert.equal(result.world.bodies.A.cells, before.bodies.A.cells - 1);
    assert.equal(result.world.bodies.B.cells, before.bodies.B.cells + 1);
    assert.equal(core.totalCells(result.world), core.totalCells(before));
    assert.ok(ledger.entries.filter(row => row.kind === 'cognition').every(row => row.application.ok));
    const replay = await runFixture(core, ledger, { maxNewCalls: 0, dispatch: () => assert.fail('Replay must not dispatch') });
    assert.equal(hash({ state: replay.state, world: replay.world }), hash({ state: result.state, world: result.world }));
    const changed = structuredClone(ledger); changed.config.policy.protocol = 3; changed.binding = hash(changed.config);
    assert.throws(() => verifyLedger(changed, changed.config, core), /ledger_protocol_mismatch/);
    await assert.rejects(runFixture(core, changed, { maxNewCalls: 0 }), /replay_job_mismatch/);
    const invalid = newLedger({ policy: { ...POLICY, protocol: 5 } });
    await assert.rejects(runFixture(core, invalid, { maxNewCalls: 0 }), /unsupported_fixture_protocol/);
  } finally { await core?.close(); globalThis.fetch = savedFetch; }
});

test('eight replies use actual preceding turns, reach37 calls and never exceed the fixed local budget', async t => {
  const savedFetch = globalThis.fetch; let calls = 0, core;
  globalThis.fetch = () => assert.fail('Offline test accessed network');
  try {
    core = await loadCore();
    const config = { test: 'full-37-local-v7' }, ledger = newLedger(config);
    const dispatch = async job => {
      calls += 1;
      const output = fakeOutput(job);
      if (job.stage === 'reply') {
        const context = JSON.parse(job.turn.prompt.slice(job.turn.prompt.lastIndexOf('\n{') + 1));
        const last = context.conversation.transcript.at(-1);
        assert.notEqual(last.speaker, job.actor);
        assert.equal(output.message.to, last.speaker);
        // Keep the real server-owned conversation open for all eight replies.
        output.message.close = false;
        if (!output.deal) output.message.text = `I have read your reply. Let us check the recorded visit after work. Reply ${job.index}.`;
      }
      return envelope(job, output);
    };
    const result = await runFixture(core, ledger, { maxNewCalls: 37, dispatch });
    assert.equal(result.halted, null); assert.equal(calls, 37);
    const thoughts = ledger.entries.filter(row => row.kind === 'cognition');
    assert.equal(thoughts.filter(row => row.job.stage === 'reply').length, 8);
    assert.ok(thoughts.every(row => row.application.ok));
    assert.ok(thoughts.every(row => row.job.promptBytes < POLICY.maxPromptBytes));
    t.diagnostic(JSON.stringify({ syntheticFixturePromptBytes: Object.fromEntries(['initial', 'reply', 'replan'].map(stage => {
      const values = thoughts.filter(row => row.job.stage === stage).map(row => row.job.promptBytes);
      return [stage, { min: Math.min(...values), max: Math.max(...values) }];
    })) }));
    assert.equal(ledger.entries.filter(row => row.kind === 'watch').length, 1);
    verifyLedger(ledger, config, core);
    const cappedJob = { ...thoughts[0].job, id: 'forbidden-thirty-eighth-request' };
    const capped = structuredClone(ledger);
    const row = await receive(cappedJob, capped, async () => {}, () => assert.fail('Call38 sent'), core.parseStructuredPayload);
    assert.equal(row.state, 'skipped'); assert.equal(row.errorCode, 'call_budget_exhausted'); assert.equal(row.reservedCalls, 0);
    const before = hash(ledger);
    await runFixture(core, ledger, { maxNewCalls: 0, dispatch: () => assert.fail('Completed37calls retried') });
    assert.equal(hash(ledger), before);
  } finally { await core?.close(); globalThis.fetch = savedFetch; }
});
