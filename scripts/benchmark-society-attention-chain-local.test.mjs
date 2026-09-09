import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { loadCore, selectCase, phase, buildJob, runEvaluation, verifyLedger, publicReport, parseArgs, POLICY, sourceManifest } from './benchmark-society-attention-chain-local.mjs';
import { hash, MODEL } from './benchmark-society-runtime-v7-local.mjs';

let core, originalFetch;
const PRIVATE = 'PRIVATE_SYNTHETIC_CONTEXT_DO_NOT_PUBLISH';
const saved = JSON.parse(await readFile(new URL('./fixtures/attention-chain-synthetic.json', import.meta.url)));
before(async () => { originalFetch = globalThis.fetch; globalThis.fetch = () => assert.fail('Offline tests forbid network and inference'); core = await loadCore(); });
after(async () => { await core?.close(); globalThis.fetch = originalFetch; });

function fixture() {
  let world = core.genesisState(91); world.day = 108; world.watch = 2;
  for (const body of Object.values(world.bodies)) for (const key of Object.keys(body.condition)) body.condition[key] = 95;
  const at = POLICY.times[0] - 10000, state = core.createSocietyState(world, at);
  for (const [i, actor] of ['T', 'Y'].entries()) {
    state.minds[actor].project = { id: `project:${i}`, goal: PRIVATE, why: PRIVATE, visibility: 'private', status: 'active', createdAtMs: at, steps: [] };
    state.minds[actor].lastSuccessAtMs = at; state.minds[actor].lastAppliedSequence = i;
  }
  state.conversations = [{ id: POLICY.conversationId, participants: ['T', 'Y'], revision: 1, nextSpeaker: 'Y', status: 'open',
    createdAtMs: at, expiresAtMs: POLICY.times[2] + 10000, attentionThrough: [1, 0],
    turns: [{ id: 'turn:602', index: 0, speaker: 'T', text: 'Synthetic fixture: would you grow voluntarily?', atMs: at }] }];
  state.offers = [{ id: POLICY.offerId, conversationId: POLICY.conversationId, proposer: 'T', counterpart: 'Y',
    terms: { kind: 'work', worker: 'Y', payer: 'T', cells: 0, verb: 'grow', room: 'garden', units: 1, dueWatch: 434 },
    status: 'open', replaces: null, createdAtMs: at, expiresAtWatch: 435, acceptedAtMs: null }];
  state.nextId = 606;
  const rec = core.applyRecordOperation(state.records, world, { actor: 'W', sequence: 0, expectedRevision: 0, nowMs: at,
    preparedRefs: [{ id: 'world:108:2', audience: 'public' }] }, { kind: 'draft', title: 'Synthetic baseline publication',
    text: 'A pre-existing synthetic record to exercise the control.', refs: ['world:108:2'], parent: null, audience: 'public', publish: true }, state);
  assert.equal(rec.ok, true, rec.code); state.records = rec.records; world = rec.world; state.minds.W.lastAppliedSequence = 0; state.minds.W.lastSuccessAtMs = at;
  assert.equal(core.parseSocietyState(state).ok, true, JSON.stringify(core.parseSocietyState(state))); 
  return { source: { state, world, worldRevision: 322 }, sequenceStart: 700, generation: 0,
    baseline: phase(core, { state, world }), sourceCodec: 4, sourceSchema: 12 };
}
function ledger() { const config = { mode: 'synthetic_fixture_only', policy: POLICY, source: [], backupSha256: 'SYNTHETIC_NOT_PRODUCTION' };
  return { config, binding: hash(config), entries: [] }; }
function response(job, mode = 'accept', override) {
  const output = override ?? saved[mode]?.[job.id] ?? saved.accept[job.id];
  return { status: 200, headers: {}, text: JSON.stringify({ model: MODEL.id, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }],
    usage: { prompt_tokens: 1200, completion_tokens: 90, total_tokens: 1290 } }) };
}

test('six fixed paired opportunities use genuine contracts, apply sequentially and run exactly one watch per clone', async () => {
  const selection = fixture(), before = hash(selection), l = ledger(); let persisted, calls = 0, rawChecks = 0;
  const result = await runEvaluation(core, selection, l, { maxNewCalls: 6, persist: async value => { persisted = structuredClone(value); },
    dispatch: async job => { calls++; assert.equal(persisted.entries.at(-1).state, 'reserved');
      assert.equal(hash(persisted.entries.at(-1).job), hash(job));
      assert.equal(z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(saved.accept[job.id]).success, true, job.id);
      return response(job); }, afterReceipt: row => { rawChecks++; assert.equal(persisted.entries.at(-1).rawResponse, row.rawResponse);
      assert.equal(row.application, undefined); } });
  assert.equal(calls, 6); assert.equal(rawChecks, 6); assert.equal(result.complete, true); assert.equal(result.watches.length, 3);
  assert.deepEqual(l.entries.map(r => r.id), POLICY.order);
  assert.ok(result.results.every(r => r.application.ok), result.results.map(r => r.application.code).join(','));
  assert.equal(hash(selection), before);
  for (const watch of result.watches) { assert.equal(watch.observations.length, 25); assert.equal(watch.nowMs, POLICY.watchAtMs);
    assert.ok(watch.observations.some(o => o.actor === 'W' && o.kind === 'record_publication' && o.outcome.ok)); }
  for (const watch of result.watches.filter(w => w.arm !== 'control')) {
    assert.equal(watch.beforePhase.offer.status, 'accepted'); assert.equal(watch.beforePhase.agreements[0].progress, 0);
    assert.equal(watch.phase.agreements[0].status, 'fulfilled'); assert.equal(watch.phase.agreements[0].progress, 1);
    assert.equal(watch.phase.agreements[0].terms.cells, 0); assert.equal(watch.phase.agreements[0].evidenceIds.length, 1);
    assert.ok(watch.observations.some(o => o.actor === 'Y' && o.intent?.verb === 'grow' && o.outcome.ok));
  }
  assert.equal(result.watches.find(w => w.arm === 'control').phase.offer.status, 'open');
  const first7 = l.entries.find(r => r.id === '7:0').job, first8 = l.entries.find(r => r.id === '8:0').job;
  assert.equal(first7.payload.seed, first8.payload.seed); assert.notEqual(first7.job.outputContract.version, first8.job.outputContract.version);
  assert.equal(first7.beforeHash, first8.beforeHash); assert.equal(first7.requestBytes, Buffer.byteLength(JSON.stringify(first7.payload)));
  assert.equal(first7.payload.max_tokens, 1024); assert.deepEqual(first8.payload.chat_template_kwargs, { enable_thinking: false });
  verifyLedger(core, l, l.config);
  const lhash = hash(l), replay = await runEvaluation(core, selection, l, { maxNewCalls: 0,
    persist: () => assert.fail('Readonly replay writes'), dispatch: () => assert.fail('Readonly replay calls') });
  assert.equal(hash(l), lhash); assert.deepEqual(replay.finalHashes, result.finalHashes); assert.equal(replay.newCalls, 0);
  const report = publicReport(l, replay); assert.equal(JSON.stringify(report).includes(PRIVATE), false);
  assert.equal(report.inferenceEvidence, 'NONE: synthetic transport fixture');
});

test('rejection and unsupported completion speech create no accepted obligation or forced replacement', async () => {
  for (const mode of ['reject', 'claimsOnly']) {
    const l = ledger(), result = await runEvaluation(core, fixture(), l, { maxNewCalls: 6, dispatch: async job => response(job, mode) });
    assert.equal(result.complete, true); assert.equal(l.entries.filter(r => r.kind === 'cognition').length, 6);
    assert.ok(result.results.every(r => r.application.ok), result.results.map(r => r.application.code).join(','));
    for (const watch of result.watches.filter(w => w.arm !== 'control')) {
      assert.equal(watch.beforePhase.offer.status, mode === 'reject' ? 'rejected' : 'open');
      assert.deepEqual(watch.phase.agreements, []);
    }
    assert.ok(result.results.every(r => r.application.semanticAssessment === 'not_automatically_scored'));
  }
});

test('a reservation interrupted before HTTP remains spent, failure and malformed response are never retried', async () => {
  const selection = fixture(), l = ledger();
  await assert.rejects(runEvaluation(core, selection, l, { maxNewCalls: 1, persist: () => { throw Error('crash_at_reservation'); },
    dispatch: () => assert.fail('Dispatch before durable reservation') }), /crash_at_reservation/);
  const original = hash(l); await runEvaluation(core, selection, l, { maxNewCalls: 0, persist: () => assert.fail('No replay mutation') });
  assert.equal(hash(l), original); let calls = 0;
  const result = await runEvaluation(core, selection, l, { maxNewCalls: 6, dispatch: async job => {
    assert.notEqual(job.id, '7:0'); calls++;
    if (calls === 1) throw Object.assign(Error('synthetic timeout'), { name: 'TimeoutError' });
    if (calls === 2) return { status: 503, text: 'synthetic unavailable' };
    if (calls === 3) return response(job, 'accept', { madeUpPower: true });
    return response(job, 'claimsOnly');
  } });
  assert.equal(calls, 5); assert.equal(result.complete, true);
  assert.deepEqual(result.results.slice(0,4).map(r => r.application.code), ['reserved', 'timeout', 'failed', 'issued_schema_violation']);
  verifyLedger(core, l, l.config);
  const changed = structuredClone(l); changed.entries.at(-1).rawResponse = '{}';
  assert.throws(() => verifyLedger(core, changed, changed.config), /raw_response_changed/);
  const duplicate = structuredClone(l); duplicate.entries.push(duplicate.entries[0]); assert.throws(() => verifyLedger(core, duplicate, duplicate.config));
});

test('persisted raw outputs can be replayed without a second call, while altered watches and jobs fail closed', async () => {
  const selection = fixture(), l = ledger();
  await assert.rejects(runEvaluation(core, selection, l, { maxNewCalls: 1, dispatch: async job => response(job),
    afterReceipt: () => { throw Error('crash_after_raw'); } }), /crash_after_raw/);
  const before = hash(l); await runEvaluation(core, selection, l, { maxNewCalls: 0, persist: () => assert.fail('Readonly replay writes') });
  assert.equal(hash(l), before); assert.equal(l.entries[0].application, undefined);
  await runEvaluation(core, selection, l, { maxNewCalls: 5, dispatch: async job => response(job) });
  const clock = structuredClone(l); clock.entries.find(r => r.kind === 'watch').nowMs++;
  await assert.rejects(runEvaluation(core, selection, clock), /watch_replay_changed/);
  const job = structuredClone(l); job.entries[1].job.payload.messages[0].content += 'edited';
  await assert.rejects(runEvaluation(core, selection, job), /prepared_job_replay_changed/);
  const foreign = ledger(); await runEvaluation(core, selection, foreign, { maxNewCalls: 1, dispatch: async job => {
    const r = response(job), body = JSON.parse(r.text); body.model = 'other'; return { ...r, text: JSON.stringify(body) }; } });
  assert.equal(foreign.entries[0].application.code, 'unexpected_response_model');
});

test('complete source validation binds real IDs and clocks; fixtures cannot become an admitted real backup', () => {
  const f = fixture(), worldJson = core.serializeWorldState(f.source.world), tables = Object.fromEntries(core.RECOVERY_TABLES.map(t => [t, []]));
  tables._sql_schema_migrations = [{ version: 12 }]; tables.quota_model_migration = [{ singleton: 1, legacy_reservation_rowid: 0, migrated_at_ms: POLICY.times[0] }];
  tables.runtime_meta = [{ singleton: 1, world_revision: 322, sim_day: 108, sim_minute: 360, control_revision: 0, next_watch_at_ms: POLICY.watchAtMs }];
  tables.world_state = [{ singleton: 1, codec_version: core.WORLD_CODEC_VERSION, world_revision: 322, state_json: worldJson }];
  tables.society_state = [{ singleton: 1, codec_version: 4, revision: f.source.state.revision, state_json: JSON.stringify(f.source.state) }];
  const payload = { format: 'villa-recovery-v1', habitatId: 'isolated-attention-synthetic-fixture', exportedAtMs: POLICY.times[0] - 1000,
    checkpoint: core.makeCheckpoint(322, worldJson), complete: true, tables, manifest: [] };
  const bundle = { core: core.sealRecoveryExport(payload), pages: [] }, before = hash(bundle);
  const selected = selectCase(core, bundle); assert.equal(selected.baseline.offer.id, 'offer:605'); assert.equal(hash(bundle), before);
  assert.notEqual(hash(JSON.stringify(bundle)), POLICY.sourceSha256);
  const modified = structuredClone(bundle); modified.core.exportedAtMs++;
  assert.throws(() => selectCase(core, modified), /checksum/);
  const badClock = { ...core, verifyRecoveryBundle: (...args) => { const v = core.verifyRecoveryBundle(...args); return { ...v, runtime: { ...v.runtime, next_watch_at_ms: v.runtime.next_watch_at_ms + 1 } };  } };
  assert.throws(() => selectCase(badClock, bundle), /source_clock_changed/);
  const badOffer = { ...core, parseSocietyState: x => { const r = core.parseSocietyState(x); r.state.offers[0].status = 'accepted'; return r; } };
  assert.throws(() => selectCase(badOffer, bundle), /selected_offer_changed/);
});

test('offline default, six-call ceiling, complete serialization accounting and source coverage', async () => {
  assert.equal(parseArgs([]).mode, 'plan'); assert.equal(parseArgs(['--run', '--private-out', '/tmp/attention-chain-test']).maxNewCalls, 0);
  assert.throws(() => parseArgs(['--run', '--private-out', '/tmp/x', '--max-new-calls', '7', '--server-pid', '123']), /call_cap/);
  assert.throws(() => parseArgs(['--run', '--private-out', '/tmp/x', '--max-new-calls', '6']), /missing_or_incompatible_options/);
  assert.throws(() => parseArgs(['--prepare', '--private-out', '/tmp/x', '--recovery', '/tmp/b', '--max-new-calls', '1']));
  await assert.rejects(runEvaluation(core, fixture(), ledger(), { maxNewCalls: 7 }), /call_cap/);
  const source = await sourceManifest();
  for (const path of ['scripts/benchmark-society-attention-chain-local.mjs', 'scripts/benchmark-society-attention-chain-local.test.mjs',
    'scripts/fixtures/attention-chain-synthetic.json', 'src/lib/habitat/society/record-watch.ts', 'src/lib/habitat/society/attention-choice.ts',
    'workers/habitat-runtime/src/society-protocol.ts', 'workers/habitat-runtime/src/checkpoint.ts']) assert.ok(source.some(f => f.path === path), path);
  const f = fixture(), job = buildJob(core, f, f.source, 8, 0); assert.equal(job.requestBytes, Buffer.byteLength(JSON.stringify(job.payload)));
  assert.ok(job.requestBytes < POLICY.maxRequestBytes);
});


test('public usage projection discards arbitrary response fields and overflow consumes opportunities without HTTP', async () => {
  const f = fixture(), l = ledger();
  await runEvaluation(core, f, l, { maxNewCalls: 1, dispatch: async job => {
    const r = response(job), body = JSON.parse(r.text); body.usage.privateText = PRIVATE;
    body.usage.completion_tokens_details = { reasoning_tokens: 0, privateText: PRIVATE };
    return { ...r, text: JSON.stringify(body) };
  } });
  const report = publicReport(l, { newCalls: 1, complete: false, consumedEntries: 1, watches: [], finalHashes: {} });
  assert.equal(JSON.stringify(report).includes(PRIVATE), false);
  assert.deepEqual(report.attempts[0].tokens, { prompt_tokens: 1200, completion_tokens: 90, total_tokens: 1290 });
  const oversized = { ...core, prepareSocietyJob: input => { const p = core.prepareSocietyJob(input);
    p.job.prompt.system += 'x'.repeat(POLICY.maxRequestBytes); return p; } };
  const skipped = ledger(), result = await runEvaluation(oversized, f, skipped, { maxNewCalls: 6,
    dispatch: () => assert.fail('An oversized serialization must not dispatch') });
  assert.equal(result.newCalls, 0); assert.equal(result.complete, true);
  assert.equal(skipped.entries.filter(r => r.kind === 'cognition').length, 6);
  assert.ok(skipped.entries.filter(r => r.kind === 'cognition').every(r => r.state === 'skipped' && r.reservedCalls === 0));
});
