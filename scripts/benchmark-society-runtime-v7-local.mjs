#!/usr/bin/env node
/* Local capability experiment. Format7; protocol3 remains the explicit default,
 * --protocol-version4 selects the separately versioned opening-proposal rules.
 * Default is an offline plan; no HTTP,
 * credentials, model download, server start, production state or permanent writes.
 * --run allows only the fixed loopback endpoint. 25 first turns, up to8 actual
 * replies, one physical watch and four reviews; at most37 sequential calls.
 * Full jobs are durable before requests; raw responses before local application.
 * Unknown IDs are never retried. Resume the SAME directory; --max-new-calls0
 * replays without a server. This exercises core causality, not production leases,
 * long-term autonomy or semantic quality. Live outputs are never fabricated.
 */
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { z } from 'zod';
import { atomicJson, BenchError, responseText } from './benchmark-society-models.mjs';
import { sourceManifest as previousManifest } from './benchmark-society-runtime-v6.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROVENANCE = 'docs/research/model-society-local-identity-probe-2026-09-08/ledger.json';
export const POLICY = Object.freeze({ version: 7, protocol: 3, initialTurns: 25, replyTurns: 8, replanningTurns: 4,
  maxCalls: 37, maxPromptBytes: 24576, maxOutputTokens: 1024, timeoutMs: 120000, concurrency: 1,
  endpoint: 'http://127.0.0.1:8018/v1/chat/completions', seed: 91,
  epochMs: Date.parse('2026-09-08T00:00:00Z'), generation: 0, habitatId: 'isolated-society-runtime-v7-local' });
export const MODEL = Object.freeze({ id: 'Qwen3.6-35B-A3B-4bit',
  path: '/Users/alejandrotreny/.omlx/models/mlx-community/Qwen3.6-35B-A3B-4bit', serverVersion: '0.6.4' });
const fail = code => { throw new BenchError(code); };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value
  : JSON.stringify(value, (_key, item) => item instanceof Map ? { $map: [...item] } : item)).digest('hex');
const sceneHash = scene => hash({ state: scene.state, world: scene.world });
const slots = ledger => ledger.entries.filter(row => row.kind === 'cognition');
const attempts = ledger => slots(ledger).filter(row => row.state !== 'skipped');
function protocolVersion(value = POLICY.protocol) {
  if (value !== 3 && value !== 4) fail('unsupported_fixture_protocol');
  return value;
}

export async function sourceManifest() {
  const previous = await previousManifest();
  const paths = ['scripts/benchmark-society-runtime-v7-local.mjs', 'package.json', 'workers/habitat-runtime/package.json',
    'workers/habitat-runtime/src/society-protocol.ts'];
  const added = await Promise.all(paths.map(async path => ({ path, sha256: hash(await readFile(join(ROOT, path))) })));
  return [...previous, ...added].sort((a, b) => a.path.localeCompare(b.path));
}

export async function loadCore() {
  const sourceFiles = await sourceManifest();
  const server = await createServer({ root: ROOT, configFile: false, appType: 'custom', logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const modules = await Promise.all(['/src/lib/habitat/society/index.ts', '/src/lib/habitat/society/capabilities.ts',
      '/src/lib/habitat/engine/tick.ts', '/src/lib/habitat/engine/state.ts', '/src/lib/habitat/engine/economy.ts',
      '/src/lib/habitat/residents.ts', '/workers/habitat-runtime/src/society-scheduler.ts',
      '/workers/habitat-runtime/src/providers/workers-ai.ts', '/workers/habitat-runtime/src/providers/shared.ts',
    ].map(path => server.ssrLoadModule(path)));
    if (hash(sourceFiles) !== hash(await sourceManifest())) fail('source_changed_during_load');
    return { ...Object.assign({}, ...modules), sourceFiles, close: () => server.close() };
  } catch (error) { await server.close(); throw error; }
}

export function newLedger(config) { return { version: POLICY.version, config, binding: hash(config), entries: [] }; }

export function buildJob(core, scene, actor, stage, index, protocol = POLICY.protocol) {
  protocolVersion(protocol);
  const sequence = stage === 'initial' ? index : stage === 'reply' ? 25 + index : 33 + index;
  const nowMs = POLICY.epochMs + (sequence + 1) * 1000;
  const prepared = core.prepareSocietyJob({ state: scene.state, world: scene.world, actor, nowMs, sequence,
    generation: POLICY.generation, worldRevision: scene.worldRevision, habitatId: POLICY.habitatId, protocolVersion: protocol });
  if (prepared.job.outputContract.name !== 'society_turn' || prepared.job.outputContract.version !== protocol
    || prepared.job.maxOutputTokens !== POLICY.maxOutputTokens) fail('capability_protocol_or_output_changed');
  const providerInput = core.workersAIInput(prepared.job, core.GEMMA_WORKERS_AI_MODEL);
  if (hash(providerInput.messages) !== hash([{ role: 'system', content: prepared.job.prompt.system },
    { role: 'user', content: prepared.job.prompt.user }])) fail('production_prompt_shape_changed');
  const payload = { model: MODEL.id, messages: providerInput.messages, temperature: providerInput.temperature,
    seed: providerInput.seed, stream: false, max_tokens: POLICY.maxOutputTokens,
    chat_template_kwargs: { enable_thinking: false },
    response_format: { type: 'json_schema', json_schema: { name: 'society_turn',
      schema: prepared.job.outputContract.jsonSchema, strict: true } } };
  return { id: prepared.job.jobId, actor, stage, index, nowMs, ...prepared, payload,
    promptBytes: Buffer.byteLength(JSON.stringify({ messages: payload.messages, response_format: payload.response_format })),
    reservedCalls: 1, outputTokenLimit: POLICY.maxOutputTokens };
}

export function decodedReceipt(response, parse, headers = {}) {
  let output = null, receiptCode = null;
  try { output = parse(response?.choices?.[0]?.message?.content); } catch { receiptCode = 'invalid_structured_output'; }
  if (!Array.isArray(response?.choices) || response.choices.length !== 1) receiptCode = 'completion_count';
  else if (response.choices[0].finish_reason !== 'stop') receiptCode = response.choices[0].finish_reason === 'length'
    ? 'output_truncated' : 'nonfinal_completion';
  const usage = response?.usage, reasoning = usage?.completion_tokens_details?.reasoning_tokens;
  const usageComplete = integer(usage?.prompt_tokens) && integer(usage?.completion_tokens) && integer(usage?.total_tokens)
    && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens
    && (reasoning === undefined || integer(reasoning) && reasoning <= usage.completion_tokens);
  const exceedsReservation = usageComplete && usage.completion_tokens > POLICY.maxOutputTokens;
  if (exceedsReservation) receiptCode = 'output_cap_exceeded';
  const warning = headers.warning ?? null;
  return { output, receiptCode, usageComplete, exceedsReservation, warning,
    schemaFallbackWarning: typeof warning === 'string' && /schema|grammar|fallback/i.test(warning),
    reasoningContent: response?.choices?.[0]?.message?.reasoning_content ?? null };
}

export function verifyLedger(ledger, config, core) {
  if (ledger?.version !== POLICY.version || ledger.binding !== hash(config) || hash(ledger.config) !== hash(config)
    || !Array.isArray(ledger.entries)) fail('ledger_binding_or_format');
  const protocol = protocolVersion(config.policy?.protocol);
  const ids = new Set(); let watches = 0;
  for (const row of ledger.entries) {
    if (!plain(row) || typeof row.id !== 'string' || ids.has(row.id)) fail('duplicate_or_invalid_ledger_id');
    ids.add(row.id);
    if (row.kind === 'watch') { watches += 1; continue; }
    if (row.kind !== 'cognition' || !plain(row.job) || row.id !== row.job.id
      || !['reserved', 'completed', 'failed', 'timeout', 'skipped'].includes(row.state)) fail('invalid_ledger_row');
    if (row.job.job.outputContract.version !== protocol) fail('ledger_protocol_mismatch');
    if (row.reservedCalls !== (row.state === 'skipped' ? 0 : 1)) fail('call_reservation_invalid');
    if (row.state === 'skipped' && !['context_overflow', 'call_budget_exhausted'].includes(row.errorCode)) fail('invalid_skipped_row');
    if (row.state === 'completed') {
      let raw; try { raw = JSON.parse(row.rawResponse); } catch { fail('raw_response_invalid'); }
      if (hash(raw) !== hash(row.response) || hash(row.receipt) !== hash(decodedReceipt(raw, core.parseStructuredPayload, row.headers))) fail('receipt_mismatch');
    } else if (row.application) fail('unknown_response_cannot_be_applied');
  }
  if (attempts(ledger).length > POLICY.maxCalls || slots(ledger).length > POLICY.maxCalls || watches > 1) fail('fixture_call_or_watch_limit');
}

export async function receive(job, ledger, persist, dispatch, parse, { beforeReserve = async () => {}, measure = () => null } = {}) {
  if (ledger.entries.some(row => row.id === job.id)) fail('dispatch_id_already_spent');
  const overflow = job.promptBytes > POLICY.maxPromptBytes, full = attempts(ledger).length >= POLICY.maxCalls;
  if (!overflow && !full) await beforeReserve(job);
  const row = { kind: 'cognition', id: job.id, job, state: overflow || full ? 'skipped' : 'reserved',
    reservedCalls: overflow || full ? 0 : 1, startedAt: new Date().toISOString(), processSamples: [],
    ...(overflow || full ? { errorCode: overflow ? 'context_overflow' : 'call_budget_exhausted' } : {}) };
  ledger.entries.push(row); await persist(ledger);
  if (row.state === 'skipped') return row;
  const sample = () => { const value = measure(); if (value) row.processSamples.push(value); };
  sample(); const timer = setInterval(sample, 1000), started = performance.now();
  try {
    const received = await dispatch(job);
    row.httpStatus = received.status; row.headers = received.headers ?? {}; row.rawResponse = received.text;
    if (!integer(received.status) || received.status < 200 || received.status >= 300) {
      row.state = 'failed'; row.errorCode = `http_${received.status}`;
    } else {
      row.response = JSON.parse(row.rawResponse);
      row.receipt = decodedReceipt(row.response, parse, row.headers); row.state = 'completed';
    }
  } catch (error) {
    row.state = ['AbortError', 'TimeoutError'].includes(error?.name) ? 'timeout' : 'failed';
    row.errorCode = error instanceof BenchError ? error.code : 'local_transport_or_invalid_response';
  } finally { clearInterval(timer); sample(); }
  row.latencyMs = Math.round(performance.now() - started); row.finishedAt = new Date().toISOString();
  await persist(ledger); // Raw response durable before any core application.
  return row;
}

function observeApplication(core, scene, job, receipt) {
  scene.state = core.markSocietyAttempt(scene.state, job.actor, job.nowMs);
  if (receipt.receiptCode) return { ok: false, code: receipt.receiptCode, afterHash: sceneHash(scene) };
  if (!z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(receipt.output).success)
    return { ok: false, code: 'provider_schema_violation', afterHash: sceneHash(scene) };
  const before = hash(scene.world), balances = Object.fromEntries(core.RESIDENTS.map(({ id }) => [id, scene.world.bodies[id].cells]));
  const protocol = protocolVersion(job.job.outputContract.version);
  const apply = protocol === 4 ? core.applyProposalCapabilityChoice : core.applyCapabilityChoice;
  const result = apply(scene.state, scene.world, job.turn, receipt.output,
    { nowMs: job.nowMs + 1, generation: POLICY.generation });
  scene.state = result.state; scene.world = result.world;
  if (hash(scene.world) !== before) scene.worldRevision += 1;
  if (result.ok) {
    const duplicate = apply(scene.state, scene.world, job.turn, receipt.output,
      { nowMs: job.nowMs + 2, generation: POLICY.generation });
    if (duplicate.code !== 'already_applied' || sceneHash(duplicate) !== sceneHash(scene)) fail('core_duplicate_application');
  }
  if (!core.parseSocietyState(scene.state).ok) fail('core_invalid_state');
  return { ok: result.ok, code: result.code, afterHash: sceneHash(scene),
    balanceChanges: core.RESIDENTS.filter(({ id }) => scene.world.bodies[id].cells !== balances[id])
      .map(({ id }) => ({ actor: id, before: balances[id], after: scene.world.bodies[id].cells })) };
}

export async function runFixture(core, ledger, { persist = async () => {}, dispatch, afterReceipt, beforeReserve, measure,
  interrupted = () => false, maxNewCalls = POLICY.maxCalls } = {}) {
  if (!integer(maxNewCalls) || maxNewCalls > POLICY.maxCalls) fail('invalid_new_call_limit');
  const protocol = protocolVersion(ledger.config.policy?.protocol);
  const world = core.genesisState(POLICY.seed);
  const scene = { state: core.createSocietyState(world, POLICY.epochMs), world, worldRevision: 0 };
  let cursor = 0, halted = null, newCalls = 0;
  async function thought(actor, stage, index) {
    const job = buildJob(core, scene, actor, stage, index, protocol);
    const prior = ledger.entries[cursor];
    if (interrupted() && !prior) { halted = 'interrupted'; return false; }
    if (!prior && newCalls >= maxNewCalls) { halted = 'call_limit_reached'; return false; }
    if (prior && (prior.kind !== 'cognition' || hash(prior.job) !== hash(job))) fail('replay_job_mismatch');
    if (!prior && !dispatch) fail('offline_replay_incomplete');
    const row = prior ?? await receive(job, ledger, persist, async (nextJob) => {
      newCalls += 1;
      return dispatch(nextJob);
    }, core.parseStructuredPayload, { beforeReserve, measure });
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
  const rows = slots(ledger), watch = ledger.entries.find(row => row.kind === 'watch');
  return { scope: `Isolated GENESIS using actual capability protocol${protocolVersion(ledger.config.policy?.protocol)}, scheduler and physical engine. Local Qwen only.`,
    limits: 'One watch, at most37 calls. No production SQL, alarms, cloud requests or sustained autonomy claim. Virtual time is fixed. Schema/domain acceptance is not semantic success.',
    humanReview: { status: 'pending', questions: ['Does each voice keep its own identity, knowledge and purpose?',
      'Does each reply respond to the actual preceding message without inventing facts?',
      'Do chosen capabilities actually advance the stated purpose?',
      'Did a real counterpart accept any precise terms, and did recorded work cause payment? Zero is a result.',
      'Do projects retain or revise their purpose after actual physical observations?'] },
    binding: ledger.binding, halted: result.halted, attemptCount: attempts(ledger).length, newCalls: result.newCalls,
    maxCalls: POLICY.maxCalls, schemaFallbackWarnings: rows.filter(row => row.receipt?.schemaFallbackWarning).length,
    incompleteUsageResponses: attempts(ledger).filter(row => !row.receipt?.usageComplete).length,
    acceptedDecisionCount: rows.filter(row => row.application?.ok).length,
    residents: core.RESIDENTS.map(({ id }) => ({ id, initialOpportunity: rows.some(row => row.job.actor === id && row.job.stage === 'initial'),
      attempts: rows.filter(row => row.job.actor === id && row.state !== 'skipped').length,
      accepted: rows.filter(row => row.job.actor === id && row.application?.ok).length })),
    rows: rows.map(row => ({ id: row.id, actor: row.job.actor, stage: row.job.stage, state: row.state, promptBytes: row.job.promptBytes,
      output: row.receipt?.output ?? null, application: row.application ?? null, usage: row.response?.usage ?? null,
      warning: row.headers?.warning ?? null, schemaFallbackWarning: row.receipt?.schemaFallbackWarning ?? false,
      error: row.errorCode ?? row.receipt?.receiptCode ?? null, latencyMs: row.latencyMs ?? null,
      maxSampledRssKiB: Math.max(0, ...(row.processSamples ?? []).map(sample => sample.rssKiB)) })),
    physicalWatchCount: watch ? 1 : 0, observations: watch?.observations ?? [],
    memoryMeasurement: 'ps RSS is sampled residency, not a complete Metal/unified-memory footprint or guaranteed peak.',
    final: { day: result.world.day, watch: result.world.watch, hash: sceneHash(result),
      publicSociety: core.societyPublicView(result.state), accounts: core.economicAccounts(result.world),
      agreements: result.state.agreements, offers: result.state.offers,
      projects: Object.fromEntries(core.RESIDENTS.map(({ id }) => [id, result.state.minds[id].project])),
      balances: Object.fromEntries(core.RESIDENTS.map(({ id }) => [id, result.world.bodies[id].cells])),
      stock: result.world.economy.stock, economicEvents: result.world.economy.events, record: result.world.record } };
}

export function parseArgs(args) {
  const options = { run: false, out: null, maxNewCalls: 1, pid: null, protocolVersion: POLICY.protocol }, seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]; if (seen.has(arg)) fail('duplicate_argument'); seen.add(arg);
    if (arg === '--run') options.run = true;
    else if (arg === '--out' && args[i + 1] && !args[i + 1].startsWith('--')) options.out = args[++i];
    else if (['--max-new-calls', '--server-pid'].includes(arg) && /^\d+$/.test(args[i + 1] ?? ''))
      options[arg === '--server-pid' ? 'pid' : 'maxNewCalls'] = Number(args[++i]);
    else if (arg === '--protocol-version' && /^[34]$/.test(args[i + 1] ?? '')) options.protocolVersion = Number(args[++i]);
    else fail('invalid_arguments');
  }
  if (!integer(options.maxNewCalls) || options.maxNewCalls > POLICY.maxCalls) fail('invalid_call_limit');
  if (options.run && (!isAbsolute(options.out ?? '') || options.maxNewCalls > 0 && (!integer(options.pid) || !options.pid)))
    fail('absolute_out_and_server_pid_required');
  if (!options.run && (options.out || options.pid || seen.has('--max-new-calls') || seen.has('--protocol-version'))) fail('offline_plan_has_no_run_options');
  return options;
}

export function processSample(pid) {
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'pid=,ppid=,rss=,%cpu=,time=,comm='], { encoding: 'utf8', timeout: 1500 });
  const match = result.status === 0 && result.stdout.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(.+)$/);
  return match ? { at: new Date().toISOString(), pid: Number(match[1]), parentPid: Number(match[2]), rssKiB: Number(match[3]),
    cpuPercent: Number(match[4]), cpuTime: match[5], command: match[6] } : null;
}

async function cachedProvenance() {
  const bytes = await readFile(join(ROOT, PROVENANCE)), prior = JSON.parse(bytes).config;
  if (hash(prior.model) !== hash(MODEL) || prior.provenance.serverVersion !== MODEL.serverVersion) fail('model_provenance_changed');
  const observedFiles = [];
  const weights = prior.provenance.modelFiles.filter(file => file.name.endsWith('.safetensors'));
  if (weights.length !== 4) fail('expected_four_measured_shards');
  for (const file of prior.provenance.modelFiles) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(file.name)) fail('invalid_provenance_path');
    const path = join(MODEL.path, file.name), info = await stat(path);
    if (!info.isFile() || info.size !== file.bytes) fail('model_file_size_changed');
    const inheritedWeight = file.name.endsWith('.safetensors');
    if (!inheritedWeight && hash(await readFile(path)) !== file.sha256) fail('model_metadata_changed');
    observedFiles.push({ ...file, sha256Basis: inheritedWeight ? 'inherited_prior_full_hash_not_rehashed' : 'fresh_full_hash',
      inode: info.ino, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs });
  }
  for (const file of prior.provenance.serverSources) {
    if (hash(await readFile(join('/Applications/oMLX.app/Contents/Resources/omlx', file.name))) !== file.sha256) fail('server_source_changed');
  }
  return { priorLedger: PROVENANCE, priorLedgerSha256: hash(bytes), observedFiles,
    serverSources: prior.provenance.serverSources, serverVersion: prior.provenance.serverVersion,
    limitation: 'Four weight hashes are inherited from the preceding measured local run. Current size/inode/mtime/ctime guard this batch; the weight bytes were not rehashed.' };
}

export async function captureSourceBundle(source, capturedAt = new Date().toISOString()) {
  const files = await Promise.all(source.map(async file => {
    const text = await readFile(join(ROOT, file.path), 'utf8');
    if (hash(text) !== file.sha256) fail('source_changed_during_capture');
    return { ...file, text };
  }));
  return { format: 1, capturedAt, files };
}

export function verifySourceBundle(bundle, source) {
  if (bundle?.format !== 1 || !Array.isArray(bundle.files) || bundle.files.length !== source.length) fail('source_bundle_format');
  for (let i = 0; i < source.length; i += 1) {
    if (bundle.files[i].path !== source[i].path || bundle.files[i].sha256 !== source[i].sha256
      || hash(bundle.files[i].text) !== source[i].sha256) fail('source_bundle_integrity');
  }
}

async function run(core, options) {
  const directory = resolve(options.out), path = join(directory, 'ledger.json'), bundlePath = join(directory, 'source-bundle.json');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, '.lock'); let lock;
  try { lock = await open(lockPath, 'wx', 0o600); } catch { fail('output_locked_manual_pid_review_required'); }
  let stopped = false, active = null;
  const stop = () => { stopped = true; active?.abort(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    await lock.writeFile(`${process.pid}\n`); await lock.sync(); let ledger, bundle;
    try { ledger = JSON.parse(await readFile(path, 'utf8')); } catch (error) {
      if (error.code !== 'ENOENT') fail('unreadable_ledger_manual_review');
      try { await stat(`${path}.tmp`); fail('incomplete_ledger_manual_review'); }
      catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
      if (options.maxNewCalls === 0) fail('replay_requires_existing_ledger');
    }
    if (ledger) bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
    else {
      try { await stat(bundlePath); fail('unbound_source_bundle_manual_review'); }
      catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
      bundle = await captureSourceBundle(core.sourceFiles); await atomicJson(bundlePath, bundle);
    }
    verifySourceBundle(bundle, core.sourceFiles);
    const provenance = options.maxNewCalls > 0 ? await cachedProvenance() : ledger.config.provenance;
    const config = { policy: { ...POLICY, protocol: options.protocolVersion }, model: MODEL, source: core.sourceFiles, sourceBundleHash: hash(bundle), provenance };
    if (!ledger) { ledger = newLedger(config); await atomicJson(path, ledger); }
    verifyLedger(ledger, config, core);
    const beforeReserve = async () => {
      if (hash(await sourceManifest()) !== hash(core.sourceFiles)
        || hash(JSON.parse(await readFile(bundlePath, 'utf8'))) !== config.sourceBundleHash) fail('source_changed_before_dispatch');
      if (hash(await cachedProvenance()) !== hash(config.provenance)) fail('model_or_server_changed_before_dispatch');
      const process = processSample(options.pid);
      if (!process?.command.endsWith('omlx-server')) fail('expected_local_server_pid');
    };
    const dispatch = async job => {
      if (stopped || options.maxNewCalls === 0) fail('dispatch_not_authorized');
      active = new AbortController();
      try {
        const response = await fetch(POLICY.endpoint, { method: 'POST', redirect: 'error',
          signal: AbortSignal.any([active.signal, AbortSignal.timeout(POLICY.timeoutMs)]),
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job.payload) });
        return { status: response.status, text: await responseText(response),
          headers: Object.fromEntries(['warning', 'content-type', 'server', 'x-request-id']
            .map(name => [name, response.headers.get(name)]).filter(([, value]) => value !== null)) };
      } finally { active = null; }
    };
    const result = await runFixture(core, ledger, { persist: value => atomicJson(path, value), dispatch, beforeReserve,
      maxNewCalls: options.maxNewCalls, interrupted: () => stopped, measure: () => options.pid ? processSample(options.pid) : null });
    verifyLedger(ledger, config, core);
    const summary = report(core, ledger, result); await atomicJson(join(directory, 'report.json'), summary);
    console.log(JSON.stringify({ report: join(directory, 'report.json'), halted: result.halted, newCalls: result.newCalls,
      attemptCount: summary.attemptCount, accepted: summary.acceptedDecisionCount, physicalWatchCount: summary.physicalWatchCount,
      schemaFallbackWarnings: summary.schemaFallbackWarnings, humanReview: 'pending' }, null, 2));
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); await lock.close(); await unlink(lockPath); }
}

async function main() {
  const options = parseArgs(process.argv.slice(2)), core = await loadCore();
  try {
    if (!options.run) {
      const world = core.genesisState(POLICY.seed), scene = { world, state: core.createSocietyState(world, POLICY.epochMs), worldRevision: 0 };
      const firstJob = buildJob(core, scene, core.RESIDENTS[0].id, 'initial', 0);
      console.log(JSON.stringify({ mode: 'offline_plan', httpRequests: 0, credentialReads: 0, policy: POLICY, model: MODEL,
        source: core.sourceFiles, firstJob: { id: firstJob.id, protocol: firstJob.job.outputContract.version,
          promptBytes: firstJob.promptBytes, payloadHash: hash(firstJob.payload) },
        note: 'Later contexts are built from actual earlier outcomes. No future response is injected.' }, null, 2)); return;
    }
    await run(core, options);
  } finally { await core.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(JSON.stringify({ error: error instanceof BenchError ? error.code : 'local_v7_failed' })); process.exitCode = 1;
});
