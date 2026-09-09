#!/usr/bin/env node
/*
 * V4 — staged, manual, isolated end-to-end society experiment. No production endpoint,
 * database, account state, or old society is read. Default and self-test modes
 * do not dispatch requests or read credentials.
 *
 * node scripts/benchmark-society-runtime-v4.mjs
 * node scripts/benchmark-society-runtime-v4.mjs --self-test
 * CF_ACCOUNT_ID=... CF_API_TOKEN=... node scripts/benchmark-society-runtime-v4.mjs \
 *   --live --max-new-calls 1 --out /absolute/new-v4-directory
 * Resume the SAME directory with --max-new-calls 4 for up to four NEW calls.
 * The per-invocation limit defaults to 1; 0 replays saved entries without calls.
 *
 * Keep the same output directory on resume. Every reserved ID, including a
 * timeout or an unknown result, is permanently spent. A new transport failure
 * stops that invocation; a manual resume can serve the remaining residents.
 * Never remove a ledger to retry. A stale .lock requires manual PID review.
 *
 * Actual core + scheduler + engine run through Vite SSR without a listening
 * server. Source hashes bind replay to this implementation and dependency lock.
 * Results are fsynced before application. Replay starts from the same GENESIS,
 * applies stored responses and advances exactly one local physical watch.
 * This is not a test of production SQL/leases, long-term emergence, or semantic
 * quality. The virtual clock is fixed; wall-clock latency is measured separately.
 *
 * The production workersAIInput helper supplies Qwen's exact prompt, schema
 * framing, /no_think, output cap and stable seed. V1/V2 remain unchanged.
 * Prices checked 2026-09-08: 4625 input / 30475 output neurons per million.
 * Reservation: UTF-8 bytes of messages + schema, plus 2048 template tokens,
 * plus 768 output tokens. This is conservative, not a tokenizer guarantee.
 * Unknown/failed usage retains the whole reservation. Only complete provider
 * usage refunds it. The 1100-neuron cap is local, not an account-wide allowance.
 * Previous experiments and production consume the same account allowance.
 * The 4200-byte context target is advisory; complete messages + response_format
 * may use up to 12000 UTF-8 bytes, subject to the remaining neuron reservation.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { z } from 'zod';
import { atomicJson, BenchError, decodeContent, responseText } from './benchmark-society-models.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY = Object.freeze({
  version: 4, initialTurns: 25, replyTurns: 8, replanningTurns: 4, maxCalls: 37,
  maxNeurons: 1100, maxPromptBytes: 12000, templateTokens: 2048,
  maxOutputTokens: 768, timeoutMs: 45000, seed: 91,
  epochMs: Date.parse('2026-09-08T00:00:00Z'), generation: 0,
  habitatId: 'isolated-society-runtime-v4', pricesCheckedOn: '2026-09-08',
});
export const MODEL = Object.freeze({ id: '@cf/qwen/qwen3-30b-a3b-fp8', inputRate: 4625, outputRate: 30475 });
const fail = (code) => { throw new BenchError(code); };
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const json = (v) => JSON.stringify(v, (_key, value) => value instanceof Map ? { $map: [...value] } : value);
const hash = (v) => createHash('sha256').update(typeof v === 'string' || Buffer.isBuffer(v) ? v : json(v)).digest('hex');
const neuronCost = (input, output) => Math.ceil((input * MODEL.inputRate + output * MODEL.outputRate) / 1_000_000);
const slots = (ledger) => ledger.entries.filter((entry) => entry.kind === 'cognition');
const attempts = (ledger) => slots(ledger).filter((entry) => entry.state !== 'skipped');
const spent = (ledger) => attempts(ledger).reduce((sum, row) => sum + row.accountedNeurons, 0);
const sceneHash = (scene) => hash({ state: scene.state, world: scene.world });

export async function loadCore() {
  const sourceFiles = await sourceManifest();
  const server = await createServer({ root: ROOT, configFile: false, appType: 'custom', logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const [society, engine, state, economy, residents, scheduler, provider, shared] = await Promise.all([
      '/src/lib/habitat/society/index.ts', '/src/lib/habitat/engine/tick.ts',
      '/src/lib/habitat/engine/state.ts', '/src/lib/habitat/engine/economy.ts',
      '/src/lib/habitat/residents.ts', '/workers/habitat-runtime/src/society-scheduler.ts',
      '/workers/habitat-runtime/src/providers/workers-ai.ts', '/workers/habitat-runtime/src/providers/shared.ts',
    ].map((path) => server.ssrLoadModule(path)));
    if (hash(sourceFiles) !== hash(await sourceManifest())) fail('source_changed_during_load');
    return { ...society, ...engine, ...state, ...economy, ...residents, ...scheduler, ...provider, ...shared,
      sourceFiles, close: () => server.close() };
  } catch (error) { await server.close(); throw error; }
}

export async function sourceManifest() {
  const paths = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(ts|json)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) paths.push(path);
    }
  }
  await walk(join(ROOT, 'src/lib/habitat'));
  await walk(join(ROOT, 'workers/habitat-runtime/src/providers'));
  paths.push(...['pnpm-lock.yaml', 'workers/habitat-runtime/src/contracts.ts',
    'workers/habitat-runtime/src/society-scheduler.ts', 'scripts/benchmark-society-models.mjs',
    'scripts/benchmark-society-runtime.mjs', 'scripts/benchmark-society-runtime-v4.mjs'].map((path) => join(ROOT, path)));
  return Promise.all(paths.sort().map(async (path) => ({ path: relative(ROOT, path), sha256: hash(await readFile(path)) })));
}

export function newLedger(config) {
  return { version: POLICY.version, config, binding: hash(config), entries: [] };
}

export function buildJob(core, scene, actor, stage, index) {
  const sequence = stage === 'initial' ? index : stage === 'reply' ? 25 + index : 33 + index;
  const nowMs = POLICY.epochMs + (sequence + 1) * 1000;
  const prepared = core.prepareSocietyJob({ state: scene.state, world: scene.world, actor,
    nowMs, sequence, generation: POLICY.generation, worldRevision: scene.worldRevision, habitatId: POLICY.habitatId });
  const payload = core.workersAIInput(prepared.job);
  if (payload.max_tokens !== POLICY.maxOutputTokens || prepared.job.maxOutputTokens !== POLICY.maxOutputTokens) fail('core_output_cap_changed');
  const promptBytes = Buffer.byteLength(JSON.stringify({ messages: payload.messages, response_format: payload.response_format }), 'utf8');
  const reservedInputTokens = promptBytes + POLICY.templateTokens;
  return { id: prepared.job.jobId, actor, stage, index, nowMs, ...prepared, payload, promptBytes,
    reservedInputTokens, reservedNeurons: neuronCost(reservedInputTokens, POLICY.maxOutputTokens) };
}

export function settleUsage(job, usage) {
  const reasoning = usage?.completion_tokens_details?.reasoning_tokens;
  const complete = plain(usage) && integer(usage.prompt_tokens) && integer(usage.completion_tokens)
    && integer(usage.total_tokens) && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens
    && (reasoning === undefined || integer(reasoning) && reasoning <= usage.completion_tokens);
  const estimated = complete ? neuronCost(usage.prompt_tokens, usage.completion_tokens) : null;
  const exceedsReservation = complete && (usage.prompt_tokens > job.reservedInputTokens
    || usage.completion_tokens > POLICY.maxOutputTokens || estimated > job.reservedNeurons);
  return { complete, exceedsReservation, estimatedNeuronsFromReportedTokens: estimated,
    accountedNeurons: complete ? (exceedsReservation ? Math.max(estimated, job.reservedNeurons) : estimated) : job.reservedNeurons,
    accounting: complete ? 'estimated_from_complete_reported_usage' : 'maximum_retained_usage_unknown' };
}

function decodedReceipt(job, response, parse = (content) => decodeContent(content).output) {
  if (!plain(response)) fail('invalid_provider_envelope');
  const settlement = settleUsage(job, response.usage);
  const finish = response.choices?.[0]?.finish_reason ?? null;
  let output = null, normalization = 'none', code = null;
  const content = response.choices?.[0]?.message?.content ?? response.response;
  if (typeof content === 'string' && /^\s*<think>[\s\S]*?<\/think>/.test(content)) {
    normalization = /^\s*<think>\s*<\/think>/.test(content) ? 'empty_think_wrapper' : 'complete_think_wrapper_preserved_in_response';
  }
  try { output = parse(content); }
  catch { code = 'invalid_structured_output'; }
  if (output === undefined) { output = null; code = 'missing_response'; }
  if (finish === 'length') code = 'output_truncated';
  if (Array.isArray(response.choices) && response.choices.length !== 1) code = 'completion_count';
  if (settlement.exceedsReservation) code = 'provider_exceeded_reservation';
  return { ...settlement, output, normalization, receiptCode: code, finishReason: finish };
}

export function verifyLedger(ledger, config, core) {
  if (!plain(ledger) || ledger.version !== POLICY.version || ledger.binding !== hash(config)
    || hash(ledger.config) !== hash(config) || !Array.isArray(ledger.entries)) fail('ledger_binding_or_format');
  const seen = new Set();
  for (const row of ledger.entries) {
    if (!plain(row) || typeof row.id !== 'string' || seen.has(row.id)) fail('duplicate_or_invalid_ledger_id');
    seen.add(row.id);
    if (row.kind === 'watch') continue; // Exact observations and hash checked during deterministic replay.
    if (row.kind !== 'cognition' || !plain(row.job) || row.id !== row.job.id
      || !['reserved', 'completed', 'failed', 'timeout', 'skipped'].includes(row.state)) fail('invalid_ledger_row');
    if (row.state === 'skipped') {
      if (!['context_overflow', 'budget_exhausted'].includes(row.errorCode) || row.accountedNeurons !== 0) fail('invalid_skipped_row');
      continue;
    }
    const settlement = row.state === 'completed' ? decodedReceipt(row.job, row.response, core.parseStructuredPayload) : settleUsage(row.job, null);
    if (row.accountedNeurons !== settlement.accountedNeurons) fail('ledger_accounting_invalid');
    if (settlement.exceedsReservation) fail('provider_exceeded_reservation_manual_review_required');
    if (row.state === 'completed' && hash(row.receipt) !== hash(settlement)) fail('ledger_receipt_invalid');
    if (row.state !== 'completed' && row.application) fail('unknown_response_cannot_be_applied');
  }
  if (attempts(ledger).length > POLICY.maxCalls || spent(ledger) > POLICY.maxNeurons) fail('ledger_budget_invalid');
}

/** Persist both reservation and full response before any caller applies it. */
export async function receive(job, ledger, persist, dispatch, redact = (text) => text, parse) {
  if (ledger.entries.some((row) => row.id === job.id)) fail('dispatch_id_already_spent');
  const overflow = job.promptBytes > POLICY.maxPromptBytes;
  const budget = attempts(ledger).length >= POLICY.maxCalls || spent(ledger) + job.reservedNeurons > POLICY.maxNeurons;
  const row = { kind: 'cognition', id: job.id, job, state: overflow || budget ? 'skipped' : 'reserved',
    startedAt: new Date().toISOString(), accountedNeurons: overflow || budget ? 0 : job.reservedNeurons,
    ...(overflow || budget ? { errorCode: overflow ? 'context_overflow' : 'budget_exhausted' } : {}) };
  ledger.entries.push(row);
  await persist(ledger);
  if (row.state === 'skipped') return row;
  const start = performance.now();
  try {
    const result = await dispatch(job);
    row.httpStatus = result.status;
    if (!integer(result.status) || result.status < 200 || result.status >= 300) {
      row.state = 'failed'; row.errorCode = integer(result.status) ? `http_${result.status}` : 'invalid_http_status';
    } else {
      const envelope = JSON.parse(redact(result.text));
      if (envelope.success !== true || !plain(envelope.result)) fail('invalid_provider_envelope');
      row.response = envelope.result;
      row.receipt = decodedReceipt(job, row.response, parse);
      row.accountedNeurons = row.receipt.accountedNeurons;
      row.state = 'completed';
    }
  } catch (error) {
    row.state = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'failed';
    row.errorCode = error instanceof BenchError ? error.code : 'network_or_invalid_envelope';
  }
  row.latencyMs = Math.round(performance.now() - start); row.finishedAt = new Date().toISOString();
  await persist(ledger);
  return row;
}

function observeApplication(core, scene, job, receipt) {
  scene.state = core.markSocietyAttempt(scene.state, job.actor, job.nowMs);
  if (receipt.receiptCode) return { ok: false, code: receipt.receiptCode, afterHash: sceneHash(scene) };
  const beforeWorld = hash(scene.world);
  const balances = Object.fromEntries(core.RESIDENTS.map(({ id }) => [id, scene.world.bodies[id].cells]));
  const result = core.applySocietyTurn(scene.state, scene.world, job.turn, receipt.output,
    { nowMs: job.nowMs + 1, generation: POLICY.generation });
  scene.state = result.state; scene.world = result.world;
  if (hash(scene.world) !== beforeWorld) scene.worldRevision += 1;
  if (result.ok) {
    const duplicate = core.applySocietyTurn(scene.state, scene.world, job.turn, receipt.output,
      { nowMs: job.nowMs + 2, generation: POLICY.generation });
    if (duplicate.code !== 'already_applied' || hash({ state: duplicate.state, world: duplicate.world }) !== sceneHash(scene)) fail('core_duplicate_application');
  }
  if (!core.parseSocietyState(scene.state).ok) fail('core_invalid_state');
  return { ok: result.ok, code: result.code, afterHash: sceneHash(scene),
    balanceChanges: core.RESIDENTS.filter(({ id }) => scene.world.bodies[id].cells !== balances[id])
      .map(({ id }) => ({ actor: id, before: balances[id], after: scene.world.bodies[id].cells })) };
}

export async function runFixture(core, ledger, { persist = async () => {}, dispatch, redact, afterReceipt,
  interrupted = () => false, maxNewCalls = POLICY.maxCalls } = {}) {
  if (!integer(maxNewCalls) || maxNewCalls > POLICY.maxCalls) fail('invalid_new_call_limit');
  const world = core.genesisState(POLICY.seed);
  const scene = { state: core.createSocietyState(world, POLICY.epochMs), world, worldRevision: 0 };
  let cursor = 0, halted = null, newCalls = 0;
  async function thought(actor, stage, index) {
    const job = buildJob(core, scene, actor, stage, index);
    const prior = ledger.entries[cursor];
    if (interrupted() && !prior) { halted = 'interrupted'; return false; }
    if (!prior && newCalls >= maxNewCalls) { halted = 'call_limit_reached'; return false; }
    if (prior && (prior.kind !== 'cognition' || hash(prior.job) !== hash(job))) fail('replay_job_mismatch');
    if (!prior && !dispatch) fail('offline_replay_incomplete');
    const row = prior ?? await receive(job, ledger, persist, async (nextJob) => {
      newCalls += 1;
      return dispatch(nextJob);
    }, redact, core.parseStructuredPayload);
    cursor += 1;
    if (!prior && afterReceipt) await afterReceipt(row);
    if (row.state === 'completed') {
      const application = observeApplication(core, scene, job, row.receipt);
      if (row.application && hash(row.application) !== hash(application)) fail('replay_application_mismatch');
      if (!row.application) { row.application = application; await persist(ledger); }
      if (row.receipt.exceedsReservation) { halted = 'provider_exceeded_reservation'; return false; }
    } else if (row.state !== 'skipped') {
      scene.state = core.markSocietyAttempt(scene.state, job.actor, job.nowMs);
      if (!prior) { halted = row.errorCode ?? 'unknown_response'; return false; }
    }
    return true;
  }
  function result() { return { ...scene, halted, consumedEntries: cursor, newCalls }; }
  for (let i = 0; i < POLICY.initialTurns; i++) if (!await thought(core.RESIDENTS[i].id, 'initial', i)) return result();
  for (let i = 0; i < POLICY.replyTurns; i++) {
    const now = POLICY.epochMs + (26 + i) * 1000;
    const eligible = new Set(scene.state.conversations.filter((c) => c.status === 'open' && c.nextSpeaker && c.expiresAtMs > now).map((c) => c.nextSpeaker));
    const occupied = new Set(core.RESIDENTS.map(({ id }) => id).filter((id) => !eligible.has(id)));
    const actor = core.nextSocietyActor(scene.state, now, 25 + i, occupied);
    if (!actor) break;
    if (!await thought(actor, 'reply', i)) return result();
  }
  if (interrupted() && ledger.entries[cursor]?.kind !== 'watch') { halted = 'interrupted'; return result(); }
  if (newCalls >= maxNewCalls && ledger.entries[cursor]?.kind !== 'watch') { halted = 'call_limit_reached'; return result(); }
  const beforeHash = sceneHash(scene), observations = [];
  const planned = core.plannedSocietyActions(scene.state, scene.world);
  core.advanceScheduledWatch(scene.world, undefined, undefined, undefined, { plans: planned, onAction: (o) => observations.push(o) });
  const observed = core.observeSocietyActions(scene.state, scene.world, observations, { nowMs: POLICY.epochMs + 33_500 });
  scene.state = observed.state; scene.world = observed.world; scene.worldRevision += 1;
  const duplicate = core.observeSocietyActions(scene.state, scene.world, observations, { nowMs: POLICY.epochMs + 33_501 });
  if (hash(duplicate) !== hash(observed)) fail('core_duplicate_physical_observation');
  const watch = { kind: 'watch', id: `${POLICY.habitatId}:physical:100:1`, beforeHash, observations, afterHash: sceneHash(scene) };
  const priorWatch = ledger.entries[cursor++];
  if (priorWatch && hash(priorWatch) !== hash(watch)) fail('replay_watch_mismatch');
  if (!priorWatch) { ledger.entries.push(watch); await persist(ledger); }
  const served = new Set();
  for (let i = 0; i < POLICY.replanningTurns; i++) {
    const actor = core.nextSocietyActor(scene.state, POLICY.epochMs + (34 + i) * 1000, 33 + i, served);
    if (!actor) break;
    served.add(actor);
    if (!await thought(actor, 'replan', i)) return result();
  }
  if (cursor !== ledger.entries.length) fail('replay_unconsumed_entries');
  return result();
}

export function report(core, ledger, result) {
  const residents = core.RESIDENTS.map(({ id }) => {
    const rows = slots(ledger).filter((r) => r.job.actor === id);
    return { id, initialOpportunity: rows.some((r) => r.job.stage === 'initial'),
      calls: rows.filter((r) => r.state !== 'skipped').length,
      acceptedDecisions: rows.filter((r) => r.application?.ok).length,
      skipped: rows.filter((r) => r.state === 'skipped').map((r) => r.errorCode) };
  });
  const watch = ledger.entries.find((e) => e.kind === 'watch');
  return { scope: 'Isolated GENESIS replay using the real scheduler, society core and physical engine. No production state.',
    limits: 'One physical watch. No SQL, production alarm, sustained emergence or semantic-quality verification. Virtual turn timestamps are fixed.',
    humanReview: { status: 'pending', questions: [
      'Does each voice follow its own situation without inventing names, evidence, resources or another voice?',
      'Do messages answer the actual received turn? Inspect refusals and counteroffers as well as acceptances.',
      'Do projects persist or change for a concrete reason after the physical observation?',
      'Were any offers made, independently accepted and physically fulfilled? Zero is a result, not success.',
      'Check claimed goal achievement against recorded steps; completed steps do not establish the broader goal.',
    ] },
    binding: ledger.binding, halted: result.halted, attemptCount: attempts(ledger).length, newCalls: result.newCalls,
    accountedNeurons: spent(ledger), maxNeurons: POLICY.maxNeurons,
    unknownUsageReservations: attempts(ledger).filter((r) => !r.receipt?.complete).length,
    residents, physicalWatchCount: watch ? 1 : 0, observations: watch?.observations ?? [],
    acceptedDecisionCount: slots(ledger).filter((r) => r.application?.ok).length,
    failures: slots(ledger).filter((r) => !r.application?.ok).map((r) => ({ id: r.id, actor: r.job.actor,
      state: r.state, code: r.application?.code ?? r.errorCode ?? 'unknown_response' })),
    final: { day: result.world.day, watch: result.world.watch, hash: sceneHash(result),
      publicSociety: core.societyPublicView(result.state), accounts: core.economicAccounts(result.world),
      balances: Object.fromEntries(core.RESIDENTS.map(({ id }) => [id, result.world.bodies[id].cells])),
      stock: result.world.economy.stock, economicEvents: result.world.economy.events, record: result.world.record },
  };
}

function fixtureResponseUnvalidated(job) {
  const context = JSON.parse(job.turn.prompt.slice(job.turn.prompt.indexOf('\n{') + 1));
  const project = { mode: 'replace', goal: 'Check the Common room and record the result.', why: 'I want a reliable account.',
    visibility: 'public', steps: [{ verb: 'inspect', at: 'common' }, { verb: 'note', at: 'common' }] };
  if (job.stage === 'initial' && job.actor === 'A') return { project,
    message: { to: 'B', text: 'Would you inspect Common once? We could agree on payment after the inspection.' } };
  if (job.stage === 'initial' && job.actor === 'B') return { project,
    message: { to: 'A', text: 'I propose one cell after one inspection of Common. Do you accept those terms?' },
    offer: { terms: { kind: 'work', payer: 'A', worker: 'B', cells: 1, verb: 'inspect', room: 'common', units: 1,
      dueWatch: context.public.watchNumber + 2 }, expiresInWatches: 2 } };
  if (job.stage === 'initial') return { project };
  if (job.stage === 'reply') {
    const to = job.job.outputContract.jsonSchema.properties?.message?.properties?.to?.enum?.[0]
      ?? context.conversation?.transcript.filter((turn) => turn.speaker !== job.actor).at(-1)?.speaker;
    if (!to) fail('offline_fixture_missing_counterpart');
    if (context.openOffers.length) return { message: { to, text: 'I accept one cell after your inspection of Common.' },
      respond: { offerId: context.openOffers[0].id, decision: 'accept' } };
    return { message: { to, text: 'Agreed. We can check the actual outcome after work.', close: true } };
  }
  return { reflection: { text: 'I will retain the next step and use the observed outcome.', refs: [job.turn.evidenceIds[0]] } };
}

function fixtureResponse(job) {
  const response = fixtureResponseUnvalidated(job);
  assert.equal(z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(response).success, true,
    `Offline response must respect the actual ${job.stage}/${job.actor} provider grammar`);
  return response;
}

export async function selfTest(core) {
  const config = { test: 'offline-v4', policy: POLICY, model: MODEL };
  const ledger = newLedger(config), persisted = [];
  let requests = 0;
  const dispatch = async (job) => {
    requests += 1;
    const durable = persisted.at(-1).entries.at(-1);
    assert.equal(durable.id, job.id); assert.equal(durable.state, 'reserved');
    return { status: 200, text: JSON.stringify({ success: true, result: { response: JSON.stringify(fixtureResponse(job)),
      usage: { prompt_tokens: 1000, completion_tokens: 150, total_tokens: 1150 } } }) };
  };
  const persist = async (value) => { persisted.push(structuredClone(value)); };
  const first = await runFixture(core, ledger, { persist, dispatch, afterReceipt: (row) => {
    assert.equal(persisted.at(-1).entries.at(-1).state, 'completed');
    assert.equal(row.application, undefined);
  } });
  verifyLedger(ledger, config, core);
  assert.equal(first.halted, null); assert.equal(requests, 31); // 25 first thoughts + two real replies + four replans.
  assert.equal(new Set(slots(ledger).filter((r) => r.job.stage === 'initial').map((r) => r.job.actor)).size, 25);
  assert.ok(slots(ledger).every((r) => r.application?.ok));
  assert.ok(slots(ledger).every((r) => r.application.balanceChanges.length === 0)); // A proposal/acceptance creates no prepaid wage.
  assert.ok(slots(ledger).every((r) => hash(r.job.payload) === hash(core.workersAIInput(r.job.job))));
  assert.equal(first.state.agreements.length, 1); assert.equal(first.state.agreements[0].status, 'fulfilled');
  assert.equal(first.world.bodies.A.cells, core.genesisState(POLICY.seed).bodies.A.cells - 1);
  assert.equal(first.world.bodies.B.cells, core.genesisState(POLICY.seed).bodies.B.cells + 1);
  assert.equal(core.totalCells(first.world), core.totalCells(core.genesisState(POLICY.seed)));
  assert.equal(first.world.day, 100); assert.equal(first.world.watch, 2);
  assert.ok(core.RESIDENTS.every(({ id }) => first.state.minds[id].project.steps[0].status === 'done'
    && first.state.minds[id].project.steps[1].status === 'pending' && first.world.economy.workCredits[id] === 1));
  const replay = await runFixture(core, ledger, { dispatch: () => fail('replay_called_provider') });
  assert.equal(sceneHash(first), sceneHash(replay)); assert.equal(requests, 31);
  const staged = newLedger(config), stagedIds = new Set();
  const stagedDispatch = async (job) => {
    assert.equal(stagedIds.has(job.id), false); stagedIds.add(job.id);
    return dispatch(job);
  };
  const stageOne = await runFixture(core, staged, { persist, dispatch: stagedDispatch, maxNewCalls: 1 });
  assert.equal(stageOne.halted, 'call_limit_reached'); assert.equal(stageOne.newCalls, 1);
  assert.equal(staged.entries.length, 1); assert.ok(staged.entries[0].application?.ok);
  const stageTwo = await runFixture(core, staged, { persist, dispatch: stagedDispatch, maxNewCalls: 4 });
  assert.equal(stageTwo.newCalls, 4); assert.equal(staged.entries.length, 5);
  const frozenLedger = hash(staged), callsBeforeReplay = requests;
  const inspection = await runFixture(core, staged, { persist, dispatch: () => fail('zero_stage_dispatched'), maxNewCalls: 0 });
  assert.equal(inspection.newCalls, 0); assert.equal(hash(staged), frozenLedger);
  assert.equal(sceneHash(inspection), sceneHash(stageTwo)); assert.equal(requests, callsBeforeReplay);
  let stagedResult = stageTwo;
  while (stagedResult.halted) stagedResult = await runFixture(core, staged, { persist, dispatch: stagedDispatch, maxNewCalls: 3 });
  assert.equal(stagedIds.size, 31); assert.equal(sceneHash(stagedResult), sceneHash(first));
  assert.equal(staged.entries.filter((entry) => entry.kind === 'watch').length, 1);
  verifyLedger(staged, config, core);
  const beforeWatch = newLedger(config);
  const pausedBeforeWatch = await runFixture(core, beforeWatch, { persist, dispatch, maxNewCalls: 27 });
  assert.equal(pausedBeforeWatch.halted, 'call_limit_reached'); assert.equal(pausedBeforeWatch.newCalls, 27);
  assert.equal(beforeWatch.entries.some((entry) => entry.kind === 'watch'), false);
  const afterWatch = await runFixture(core, beforeWatch, { persist, dispatch, maxNewCalls: 1 });
  assert.equal(afterWatch.newCalls, 1); assert.equal(beforeWatch.entries.filter((entry) => entry.kind === 'watch').length, 1);
  const afterWatchEntries = hash(beforeWatch);
  await runFixture(core, beforeWatch, { persist, dispatch: () => fail('watch_replay_dispatched'), maxNewCalls: 0 });
  assert.equal(hash(beforeWatch), afterWatchEntries);
  const crash = newLedger(config);
  await assert.rejects(runFixture(core, crash, { dispatch: async (job) => ({ status: 200,
    text: JSON.stringify({ success: true, result: { response: JSON.stringify(fixtureResponse(job)) } }) }),
    afterReceipt: () => fail('simulated_crash_before_apply') }), (e) => e.code === 'simulated_crash_before_apply');
  assert.equal(crash.entries[0].application, undefined); assert.equal(crash.entries[0].state, 'completed');
  let resumedCalls = 0;
  const resumed = await runFixture(core, crash, { dispatch: async (job) => {
    assert.notEqual(job.id, crash.entries[0].id); resumedCalls += 1;
    return { status: 200, text: JSON.stringify({ success: true, result: { response: JSON.stringify(fixtureResponse(job)),
      usage: { prompt_tokens: 1000, completion_tokens: 150, total_tokens: 1150 } } }) };
  } });
  assert.equal(resumedCalls, 30); assert.equal(sceneHash(resumed), sceneHash(first)); verifyLedger(crash, config, core);
  const unknown = newLedger(config);
  await assert.rejects(runFixture(core, unknown, { persist: async (l) => { if (l.entries.length) fail('crash_after_reservation'); },
    dispatch: () => fail('must_not_dispatch') }), (e) => e.code === 'crash_after_reservation');
  assert.equal(unknown.entries[0].state, 'reserved');
  let continued = false;
  await assert.rejects(runFixture(core, unknown, { dispatch: async (job) => {
    assert.notEqual(job.id, unknown.entries[0].id); continued = true; throw new Error('offline injected failure');
  }, afterReceipt: () => fail('stop_after_next_unrelated_job') }), (e) => e.code === 'stop_after_next_unrelated_job');
  assert.equal(continued, true); assert.equal(unknown.entries[0].accountedNeurons, unknown.entries[0].job.reservedNeurons);
  const tampered = structuredClone(ledger); tampered.entries.push(tampered.entries[0]);
  assert.throws(() => verifyLedger(tampered, config, core), (e) => e.code === 'duplicate_or_invalid_ledger_id');
  assert.throws(() => verifyLedger(ledger, { ...config, test: 'different' }, core), (e) => e.code === 'ledger_binding_or_format');
  const payloadTamper = structuredClone(ledger); payloadTamper.entries[0].job.payload.max_tokens = 999;
  await assert.rejects(runFixture(core, payloadTamper), (e) => e.code === 'replay_job_mismatch');
  const firstJob = ledger.entries[0].job;
  assert.equal(firstJob.promptBytes, Buffer.byteLength(JSON.stringify({ messages: firstJob.payload.messages,
    response_format: firstJob.payload.response_format }), 'utf8'));
  assert.ok(firstJob.promptBytes > Buffer.byteLength(JSON.stringify({ messages: firstJob.payload.messages }), 'utf8'));
  assert.equal(firstJob.reservedInputTokens, firstJob.promptBytes + POLICY.templateTokens);
  assert.deepEqual(firstJob.payload.response_format.json_schema, firstJob.job.outputContract.jsonSchema);
  let productionRequest = null;
  const productionResult = await core.runWorkersAI({ ai: { run: async (model, input) => {
    assert.equal(model, MODEL.id); productionRequest = input; return { response: '{}' };
  } }, job: firstJob.job, attemptId: 'offline-provider-shape', model: MODEL.id });
  assert.equal(productionResult.ok, true); assert.deepEqual(productionRequest, firstJob.payload);
  assert.equal(settleUsage(firstJob, { prompt_tokens: 3 }).accountedNeurons, firstJob.reservedNeurons);
  assert.equal(settleUsage(firstJob, { prompt_tokens: 1, completion_tokens: 769, total_tokens: 770 }).exceedsReservation, true);
  assert.equal(settleUsage(firstJob, { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2,
    completion_tokens_details: { reasoning_tokens: 3 } }).complete, false);
  const reasoningReceipt = decodedReceipt(firstJob, { response: '<think>Unexpected reasoning remains visible in the saved raw response.</think> {}' }, core.parseStructuredPayload);
  assert.equal(reasoningReceipt.receiptCode, null); assert.equal(reasoningReceipt.normalization, 'complete_think_wrapper_preserved_in_response');
  const overBudget = newLedger(config);
  overBudget.entries.push({ kind: 'cognition', state: 'reserved', id: 'offline-reservation', accountedNeurons: POLICY.maxNeurons });
  assert.equal((await receive(firstJob, overBudget, async () => {}, () => fail('budget_dispatched'))).errorCode, 'budget_exhausted');
  const overflow = newLedger(config);
  assert.equal((await receive({ ...firstJob, promptBytes: POLICY.maxPromptBytes + 1 }, overflow, async () => {}, () => fail('overflow_dispatched'))).errorCode, 'context_overflow');
  const advisory = newLedger(config);
  const advisoryJob = { ...firstJob, turn: { ...firstJob.turn, contextOverflow: true }, promptBytes: POLICY.maxPromptBytes,
    reservedInputTokens: POLICY.maxPromptBytes + POLICY.templateTokens,
    reservedNeurons: neuronCost(POLICY.maxPromptBytes + POLICY.templateTokens, POLICY.maxOutputTokens) };
  let advisoryCalls = 0;
  const advisoryRow = await receive(advisoryJob, advisory, async () => {}, async () => {
    advisoryCalls += 1; return { status: 200, text: JSON.stringify({ success: true, result: { response: '{}' } }) };
  });
  assert.equal(advisoryCalls, 1); assert.equal(advisoryRow.state, 'completed');
  assert.equal(advisoryRow.accountedNeurons, advisoryJob.reservedNeurons);
  const rejection = structuredClone(ledger); delete rejection.entries[0].application;
  rejection.entries = rejection.entries.slice(0, 1);
  rejection.entries[0].response.response = JSON.stringify({ actor: 'B', world: { cells: 1000 } });
  rejection.entries[0].receipt = decodedReceipt(firstJob, rejection.entries[0].response, core.parseStructuredPayload);
  const invalid = await runFixture(core, rejection, { dispatch: async () => { throw new Error('stop offline'); } });
  assert.equal(rejection.entries[0].application.ok, false);
  assert.equal(core.totalCells(invalid.world), core.totalCells(core.genesisState(POLICY.seed)));
  const cancelledReplay = await runFixture(core, ledger, { interrupted: () => true,
    dispatch: () => fail('cancelled_replay_dispatched') });
  assert.equal(sceneHash(cancelledReplay), sceneHash(first));
  assert.equal(parseArgs(['--live', '--out', '/tmp/offline-v4']).maxNewCalls, 1);
  assert.equal(parseArgs(['--live', '--out', '/tmp/offline-v4', '--max-new-calls', '0']).maxNewCalls, 0);
  for (const limit of ['-1', '1.5', '38', 'NaN']) assert.throws(() => parseArgs(['--live', '--out', '/tmp/offline-v4', '--max-new-calls', limit]));
  assert.throws(() => parseArgs(['--max-new-calls', '2']), (e) => e.code === 'live_requires_absolute_out_and_no_self_test');
  return { status: 'pass', realApiCalls: 0, primaryFixtureResponses: 31, additionalOfflineFixtureResponses: requests - 31, checks: [
    '25 independent initial turns', 'explicit bilateral work acceptance', 'one actual action per resident',
    '25 projects retain their next step', 'atomic work payment and conserved money', 'result persisted before apply',
    'identical replay without requests', 'crash before apply resumes stored response', 'unknown ID never retried',
    'staged 1 then 4 new-call budget and later resumes', 'zero-call replay preserves the ledger',
    'stop before a new physical watch at the call boundary', 'one physical watch across resumed stages',
    'duplicate ledger rejected', 'configuration and payload tampering rejected', 'complete-usage-only refunds',
    'over-budget and oversized contexts never dispatched', 'compact-context overflow is advisory below 12000 bytes',
    'messages and response_format included in byte count and reservation', 'invented actor/resources rejected', 'exact production provider payload and parser',
    'offline replies satisfy each dynamically offered provider grammar',
  ] };
}

export function parseArgs(args) {
  const options = { live: false, selfTest: false, out: null, maxNewCalls: 1 };
  let hasNewCallLimit = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live' && !options.live) options.live = true;
    else if (args[i] === '--self-test' && !options.selfTest) options.selfTest = true;
    else if (args[i] === '--out' && options.out === null && args[i + 1]) options.out = args[++i];
    else if (args[i] === '--max-new-calls' && !hasNewCallLimit && /^\d+$/.test(args[i + 1] ?? '')) {
      options.maxNewCalls = Number(args[++i]); hasNewCallLimit = true;
      if (!integer(options.maxNewCalls) || options.maxNewCalls > POLICY.maxCalls) fail('invalid_new_call_limit');
    }
    else fail('invalid_arguments');
  }
  if (options.live && options.selfTest || options.out !== null && (!options.live || !isAbsolute(options.out))
    || options.live && !options.out || hasNewCallLimit && !options.live) fail('live_requires_absolute_out_and_no_self_test');
  return options;
}

async function live(core, options) {
  const account = process.env.CF_ACCOUNT_ID, token = process.env.CF_API_TOKEN;
  if (!/^[a-f0-9]{32}$/i.test(account ?? '') || !token || /\s/.test(token)) fail('explicit_cf_credentials_required');
  if (hash(core.sourceFiles) !== hash(await sourceManifest())) fail('source_changed_after_load');
  const config = { policy: POLICY, model: MODEL, accountHash: hash(account), source: core.sourceFiles };
  const directory = resolve(options.out), path = join(directory, 'ledger.json'), lockPath = join(directory, '.lock');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); } catch { fail('output_locked_manual_pid_review_required'); }
  let stopped = false, active = null;
  const stop = () => { stopped = true; active?.abort(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    await lock.writeFile(`${process.pid}\n`); await lock.sync();
    let ledger;
    try { ledger = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') fail('unreadable_ledger_manual_review_required');
      try { await stat(`${path}.tmp`); fail('incomplete_ledger_manual_review_required'); }
      catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
      ledger = newLedger(config); await atomicJson(path, ledger);
    }
    verifyLedger(ledger, config, core);
    const dispatch = async (job) => {
      if (stopped) throw Object.assign(new Error(), { name: 'AbortError' });
      if (hash(core.sourceFiles) !== hash(await sourceManifest())) fail('source_changed_before_dispatch');
      active = new AbortController();
      const signal = AbortSignal.any([active.signal, AbortSignal.timeout(POLICY.timeoutMs)]);
      try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL.id}`, {
          method: 'POST', redirect: 'error', signal,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(job.payload),
        });
        if (!response.ok) { await response.body?.cancel(); return { status: response.status, text: '' }; }
        return { status: response.status, text: await responseText(response) };
      } finally { active = null; }
    };
    const result = await runFixture(core, ledger, { persist: (l) => atomicJson(path, l), dispatch,
      redact: (text) => text.replaceAll(token, '[REDACTED]').replaceAll(account, '[REDACTED]'), interrupted: () => stopped,
      maxNewCalls: options.maxNewCalls });
    const summary = report(core, ledger, result);
    await atomicJson(join(directory, 'report.json'), summary);
    console.log(JSON.stringify({ report: join(directory, 'report.json'), attempts: summary.attemptCount,
      accountedNeurons: summary.accountedNeurons, newCalls: summary.newCalls, maxNewCalls: options.maxNewCalls,
      halted: summary.halted, humanReview: 'pending' }, null, 2));
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    await lock.close(); await unlink(lockPath);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const core = await loadCore();
  try {
    if (options.selfTest) console.log(JSON.stringify(await selfTest(core), null, 2));
    else if (options.live) await live(core, options);
    else {
      const world = core.genesisState(POLICY.seed), scene = { world, state: core.createSocietyState(world, POLICY.epochMs), worldRevision: 0 };
      const jobs = core.RESIDENTS.map(({ id }, i) => buildJob(core, scene, id, 'initial', i));
      console.log(JSON.stringify({ mode: 'offline_plan', apiCalls: 0, ledgerWrites: 0, policy: POLICY, model: MODEL,
        initialPrompts: jobs.map((j) => ({ actor: j.actor, bytes: j.promptBytes, reserveNeurons: j.reservedNeurons,
          compactContextTargetExceeded: j.turn.contextOverflow, overflow: j.promptBytes > POLICY.maxPromptBytes })),
        conservativeInitialReservation: jobs.reduce((sum, job) => sum + job.reservedNeurons, 0),
        note: 'Replies depend on actual open conversations. Four post-watch replans use the real fair scheduler. No negotiation outcome or call-count completion is guaranteed.' }, null, 2));
    }
  } finally { await core.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(JSON.stringify({ error: error instanceof BenchError ? error.code : 'benchmark_failed' })); process.exitCode = 1; });
}
