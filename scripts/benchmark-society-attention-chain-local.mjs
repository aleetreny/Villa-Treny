#!/usr/bin/env node
// Six independently chosen LOCAL decisions; offline by default. No server start,
// credential access, cloud fallback, retries, production write or authored reply.
import { readFile, readdir, mkdir, open, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { z } from 'zod';
import { atomicJson, responseText } from './benchmark-society-models.mjs';
import { hash, MODEL, decodedReceipt, processSample, captureSourceBundle, verifySourceBundle } from './benchmark-society-runtime-v7-local.mjs';
import { privateDirectory, verifyModelProvenance } from './benchmark-society-records-canonical-local.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROVENANCE = 'docs/research/model-society-ordered-choice-local-2026-09-08/ledger.json';
export const POLICY = Object.freeze({ version: 1, sourceRevision: 322,
  sourceSha256: '832c560405d05fd67a21fcdb3196c5953475c17b3ae6871f7c04810283514779',
  protocols: [7, 8], actors: ['Y', 'T', 'Y'], maxCalls: 6, concurrency: 1,
  order: ['7:0', '8:0', '8:1', '7:1', 'watch:7', 'watch:8', 'watch:control', '7:2', '8:2'],
  times: [1788953353192, 1788953413192, 1788959344141], watchAtMs: 1788959284141,
  conversationId: 'conversation:145', offerId: 'offer:605',
  maxOutputTokens: 1024, maxRequestBytes: 65536, timeoutMs: 120000,
  temperature: 0.3, seeds: [91, 92, 93], thinking: false,
  endpoint: 'http://127.0.0.1:8018/v1/chat/completions',
  scope: 'Paired consent-to-effect diagnostic, not an isolated test of concurrent-channel capacity.',
  admission: 'Complete serialized request byte cap; not a claim about the local tokenizer or server context capacity.',
  physicalWatchesPerClone: 1, totalPhysicalWatches: 3, retries: 0 });
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sceneHash = scene => hash({ state: scene.state, world: scene.world, worldRevision: scene.worldRevision });
const jsonEqual = (a, b, code) => { if (hash(a) !== hash(b)) fail(code); };
const integer = n => Number.isSafeInteger(n) && n >= 0;

async function filesBelow(path) {
  const entries = await readdir(join(ROOT, path), { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? filesBelow(`${path}/${e.name}`)
    : /\.(ts|mjs)$/.test(e.name) ? [`${path}/${e.name}`] : []))).flat();
}
export async function sourceManifest() {
  // Freeze transitive runtime and evaluator sources, including local helpers.
  const paths = [...new Set([...(await filesBelow('src/lib/habitat')),
    ...(await filesBelow('workers/habitat-runtime/src')), ...(await filesBelow('scripts')),
    'package.json', 'workers/habitat-runtime/package.json', 'pnpm-lock.yaml', 'scripts/fixtures/attention-chain-synthetic.json'])].sort();
  return Promise.all(paths.map(async path => ({ path, sha256: hash(await readFile(join(ROOT, path))) })));
}
export async function loadCore() {
  const sourceFiles = await sourceManifest();
  const server = await createServer({ root: ROOT, configFile: false, appType: 'custom', logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const modules = await Promise.all(['/src/lib/habitat/society/index.ts', '/src/lib/habitat/society/record-watch.ts',
      '/workers/habitat-runtime/src/checkpoint.ts', '/workers/habitat-runtime/src/recovery.ts',
      '/workers/habitat-runtime/src/domain.ts', '/workers/habitat-runtime/src/society-scheduler.ts',
      '/workers/habitat-runtime/src/society-protocol.ts', '/workers/habitat-runtime/src/providers/shared.ts',
      '/src/lib/habitat/residents.ts', '/src/lib/habitat/engine/economy.ts',
      '/src/lib/habitat/engine/state.ts', '/src/lib/habitat/society/records.ts',
    ].map(path => server.ssrLoadModule(path)));
    const verifySources = async () => jsonEqual(await sourceManifest(), sourceFiles, 'sources_changed');
    await verifySources();
    return { ...Object.assign({}, ...modules), sourceFiles, verifySources, close: () => server.close() };
  } catch (e) { await server.close(); throw e; }
}

export function selectCase(core, bundle) {
  const verified = core.verifyRecoveryBundle(bundle.core, bundle.pages ?? []);
  if (!verified.complete || verified.worldRevision !== POLICY.sourceRevision) fail('expected_complete_revision_322');
  const sourceRow = verified.tables.society_state[0], parsed = core.parseSocietyState(JSON.parse(sourceRow.state_json));
  if (!parsed.ok) fail('invalid_source_society');
  const state = parsed.state, c = state.conversations.find(c => c.id === POLICY.conversationId);
  const offer = state.offers.find(o => o.id === POLICY.offerId);
  if (!c || c.status !== 'open' || c.nextSpeaker !== 'Y' || c.participants.join('') !== 'TY'
    || c.expiresAtMs <= POLICY.times[2]) fail('selected_conversation_changed');
  jsonEqual(offer?.terms, { kind: 'work', worker: 'Y', payer: 'T', cells: 0, verb: 'grow', room: 'garden', units: 1, dueWatch: 434 }, 'selected_terms_changed');
  if (offer.status !== 'open' || offer.acceptedAtMs !== null || offer.conversationId !== c.id
    || offer.proposer !== 'T' || offer.counterpart !== 'Y' || offer.expiresAtWatch !== 435) fail('selected_offer_changed');
  if (verified.world.day !== 108 || verified.world.watch !== 2 || verified.runtime.next_watch_at_ms !== POLICY.watchAtMs)
    fail('source_clock_changed');
  const sequenceStart = Math.max(-1, ...Object.values(state.minds).map(m => m.lastAppliedSequence),
    ...verified.tables.cognition_contexts.map(r => r.sequence).filter(integer)) + 1;
  return { source: { state, world: verified.world, worldRevision: verified.worldRevision }, sequenceStart,
    generation: verified.runtime.control_revision, sourceCodec: sourceRow.codec_version,
    sourceSchema: Math.max(...verified.tables._sql_schema_migrations.map(r => r.version)),
    baseline: phase(core, { state, world: verified.world }),
    fullRecoveryHash: hash(bundle), originalStateHash: hash(sourceRow.state_json) };
}

export function phase(core, scene) {
  const offer = scene.state.offers.find(o => o.id === POLICY.offerId);
  const agreements = scene.state.agreements.filter(a => a.offerId === POLICY.offerId);
  return { watch: core.watchNumber(scene.world), offer: offer ? structuredClone(offer) : null,
    agreements: structuredClone(agreements), chosenYPlan: structuredClone(core.plannedSocietyActions(scene.state, scene.world).Y ?? null),
    yRoom: scene.world.bodies.Y.room, stock: structuredClone(scene.world.economy.stock),
    pendingW: structuredClone(scene.state.records.intents.filter(i => i.author === 'W')) };
}
export function buildJob(core, selection, scene, protocol, index) {
  if (!POLICY.protocols.includes(protocol) || ![0, 1, 2].includes(index)) fail('unknown_opportunity');
  const actor = POLICY.actors[index], nowMs = POLICY.times[index], sequence = selection.sequenceStart + index;
  const prepared = core.prepareSocietyJob({ state: scene.state, world: scene.world, actor, nowMs, sequence,
    generation: selection.generation, worldRevision: scene.worldRevision,
    habitatId: `isolated-attention-chain-p${protocol}`, protocolVersion: protocol });
  if (prepared.job.outputContract.version !== protocol || prepared.job.maxOutputTokens !== POLICY.maxOutputTokens)
    fail('issued_protocol_changed');
  const payload = { model: MODEL.id, messages: [{ role: 'system', content: prepared.job.prompt.system },
    { role: 'user', content: prepared.job.prompt.user }], temperature: POLICY.temperature, seed: POLICY.seeds[index],
    stream: false, max_tokens: POLICY.maxOutputTokens, chat_template_kwargs: { enable_thinking: false },
    response_format: { type: 'json_schema', json_schema: { name: prepared.job.outputContract.name,
      schema: prepared.job.outputContract.jsonSchema, strict: true } } };
  return { id: `${protocol}:${index}`, protocol, index, actor, nowMs, beforeHash: sceneHash(scene),
    beforePhase: phase(core, scene), ...prepared, payload,
    requestBytes: Buffer.byteLength(JSON.stringify(payload)), payloadHash: hash(payload), reservedCalls: 1 };
}

export function receipt(core, response, headers) {
  const parsed = decodedReceipt(response, core.parseStructuredPayload, headers);
  if (response?.model !== MODEL.id) parsed.receiptCode = 'unexpected_response_model';
  if (Number.isSafeInteger(response?.usage?.completion_tokens) && response.usage.completion_tokens > POLICY.maxOutputTokens)
    parsed.receiptCode = 'output_cap_exceeded';
  return parsed;
}
function apply(core, scene, job, row) {
  const before = structuredClone(scene);
  if (row.state !== 'skipped') scene.state = core.markSocietyAttempt(scene.state, job.actor, job.nowMs);
  let result;
  if (row.state !== 'completed') result = { ok: false, code: row.state };
  else if (row.receipt.receiptCode || row.receipt.schemaFallbackWarning)
    result = { ok: false, code: row.receipt.receiptCode ?? 'schema_fallback_warning' };
  else if (!z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(row.receipt.output).success)
    result = { ok: false, code: 'issued_schema_violation' };
  else {
    const r = core.applySocietyProtocol(job.protocol, scene.state, scene.world, job.turn, row.receipt.output,
      { nowMs: job.nowMs + 1, generation: job.turn.generation });
    scene.state = r.state; scene.world = r.world; result = { ok: r.ok, code: r.code };
    if (hash(before.world) !== hash(scene.world)) scene.worldRevision++;
    if (!core.parseSocietyState(scene.state).ok) fail('invalid_applied_state');
    if (r.ok) {
      const duplicate = core.applySocietyProtocol(job.protocol, r.state, r.world, job.turn, row.receipt.output,
        { nowMs: job.nowMs + 2, generation: job.turn.generation });
      if (duplicate.code !== 'already_applied' || hash(duplicate.state) !== hash(r.state) || hash(duplicate.world) !== hash(r.world))
        fail('non_idempotent_application');
    }
  }
  const messages = core.societyPublicView(scene.state).conversations.flatMap(c => c.turns
    .filter(t => !before.state.conversations.find(old => old.id === c.id)?.turns.some(old => old.id === t.id))
    .map(t => ({ conversationId: c.id, ...t })));
  return { ...result, beforeHash: job.beforeHash, afterHash: sceneHash(scene), phase: phase(core, scene), messages,
    semanticAssessment: 'not_automatically_scored',
    newOffers: scene.state.offers.filter(o => !before.state.offers.some(old => old.id === o.id)),
    newAgreements: scene.state.agreements.filter(a => !before.state.agreements.some(old => old.id === a.id)) };
}
function watch(core, scene, arm) {
  const beforeHash = sceneHash(scene), before = phase(core, scene), sequence = scene.world.economy.nextEventSequence;
  const next = core.advanceSocietyWatch(scene.state, scene.world, POLICY.watchAtMs);
  scene.state = next.state; scene.world = next.world; scene.worldRevision++;
  if (!core.parseSocietyState(scene.state).ok || next.observations.length !== 25
    || new Set(next.observations.map(o => o.actor)).size !== 25) fail('invalid_physical_watch');
  const money = scene.world.economy.ledger, residual = core.totalCells(scene.world)
    - (money.initialCells + money.minted - money.burned - money.leaked);
  if (Math.abs(residual) > 1e-8) fail('money_not_conserved');
  return { id: `watch:${arm}`, kind: 'watch', arm, nowMs: POLICY.watchAtMs, beforeHash,
    afterHash: sceneHash(scene), beforePhase: before, phase: phase(core, scene), observations: next.observations,
    economicEvents: scene.world.economy.events.filter(e => e.sequence >= sequence), monetaryResidual: residual };
}

export function verifyLedger(core, ledger, config) {
  if (!ledger || ledger.binding !== hash(config) || hash(ledger.config) !== hash(config)
    || !Array.isArray(ledger.entries) || ledger.entries.length > POLICY.order.length) fail('ledger_binding_or_limit');
  let calls = 0;
  for (const [index, row] of ledger.entries.entries()) {
    if (row.id !== POLICY.order[index]) fail('ledger_order_or_duplicate');
    if (row.kind === 'watch') { if (!row.id.startsWith('watch:')) fail('invalid_watch_id'); continue; }
    if (row.kind !== 'cognition' || row.id !== row.job?.id || !POLICY.protocols.includes(row.job.protocol)
      || !['reserved', 'completed', 'failed', 'timeout', 'skipped'].includes(row.state)
      || row.reservedCalls !== (row.state === 'skipped' ? 0 : 1)) fail('invalid_attempt');
    calls += row.reservedCalls;
    if (row.state === 'skipped' && row.errorCode !== 'serialized_request_overflow') fail('invalid_skip');
    if (row.state === 'completed') {
      let raw; try { raw = JSON.parse(row.rawResponse); } catch { fail('invalid_raw_response'); }
      jsonEqual(raw, row.response, 'raw_response_changed');
      jsonEqual(receipt(core, raw, row.headers), row.receipt, 'receipt_changed');
      if (!integer(row.httpStatus) || row.httpStatus < 200 || row.httpStatus >= 300) fail('completed_http_failure');
    } else if (row.application?.ok) fail('unknown_response_applied');
  }
  if (calls > POLICY.maxCalls) fail('total_call_cap');
}

export async function runEvaluation(core, selection, ledger, { maxNewCalls = 0, persist = async () => {},
  dispatch, beforeReserve = async () => {}, afterReceipt } = {}) {
  if (!integer(maxNewCalls) || maxNewCalls > POLICY.maxCalls) fail('call_cap');
  verifyLedger(core, ledger, ledger.config);
  const originalSelection = hash(selection), scenes = Object.fromEntries(['7', '8', 'control'].map(a => [a, structuredClone(selection.source)]));
  const results = [], watched = [];
  let newCalls = 0;
  for (const [position, id] of POLICY.order.entries()) {
    let row = ledger.entries[position];
    if (id.startsWith('watch:')) {
      if (!row && maxNewCalls === 0) break;
      const arm = id.split(':')[1], actual = watch(core, scenes[arm], arm);
      if (row) jsonEqual(row, actual, 'watch_replay_changed');
      else { ledger.entries.push(actual); await persist(ledger); }
      watched.push(actual); continue;
    }
    const [arm, ordinal] = id.split(':'), job = buildJob(core, selection, scenes[arm], Number(arm), Number(ordinal));
    if (row) jsonEqual(row.job, job, 'prepared_job_replay_changed');
    else {
      if (newCalls >= maxNewCalls) break;
      if (!dispatch) fail('dispatch_required');
      const overflow = job.requestBytes > POLICY.maxRequestBytes;
      if (!overflow) await beforeReserve(job);
      row = { id, kind: 'cognition', job, state: overflow ? 'skipped' : 'reserved', reservedCalls: overflow ? 0 : 1,
        startedAt: new Date().toISOString(), ...(overflow ? { errorCode: 'serialized_request_overflow' } : {}) };
      ledger.entries.push(row); await persist(ledger); // Durable reservation before HTTP, including all exact private context.
      if (!overflow) {
        newCalls++; const started = performance.now();
        try {
          const r = await dispatch(job);
          row.httpStatus = r.status; row.headers = r.headers ?? {}; row.rawResponse = r.text;
          if (!integer(r.status) || r.status < 200 || r.status >= 300) { row.state = 'failed'; row.errorCode = `http_${r.status}`; }
          else { row.response = JSON.parse(r.text); row.receipt = receipt(core, row.response, row.headers); row.state = 'completed'; }
        } catch (e) {
          row.state = ['AbortError', 'TimeoutError'].includes(e?.name) ? 'timeout' : 'failed';
          row.errorCode = 'local_transport_or_invalid_response';
        }
        row.latencyMs = Math.round(performance.now() - started); row.finishedAt = new Date().toISOString();
        await persist(ledger); // Retain raw result before domain application.
        if (afterReceipt) await afterReceipt(row);
      }
    }
    const applied = apply(core, scenes[arm], job, row);
    if (row.application) jsonEqual(row.application, applied, 'effect_replay_changed');
    else if (maxNewCalls > 0) { row.application = applied; await persist(ledger); }
    results.push({ id, actor: job.actor, application: applied });
  }
  jsonEqual(hash(selection), originalSelection, 'source_scene_mutated');
  return { newCalls, consumedEntries: results.length + watched.length, complete: results.length === 6 && watched.length === 3,
    results, watches: watched, finalHashes: Object.fromEntries(Object.entries(scenes).map(([a, s]) => [a, sceneHash(s)])) };
}

export function publicReport(ledger, result) {
  return { policy: POLICY, mode: ledger.config.mode, model: MODEL.id, sourceSha256: ledger.config.backupSha256,
    sourceManifestHash: hash(ledger.config.source), newCalls: result.newCalls, complete: result.complete,
    consumedEntries: result.consumedEntries, productionWrites: 0, cloudRequests: 0,
    physicalWatches: result.watches.length, finalHashes: result.finalHashes,
    attempts: ledger.entries.filter(r => r.kind === 'cognition').map(r => ({ id: r.id, actor: r.job.actor,
      state: r.state, reservedCalls: r.reservedCalls, requestBytes: r.job.requestBytes, applicationCode: r.application?.code ?? null,
      usageComplete: r.receipt?.usageComplete ?? false, tokens: Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens'].map(k => [k, integer(r.response?.usage?.[k]) ? r.response.usage[k] : null])),
      reasoningTokens: integer(r.response?.usage?.completion_tokens_details?.reasoning_tokens) ? r.response.usage.completion_tokens_details.reasoning_tokens : null })),
    inferenceEvidence: ledger.config.mode === 'synthetic_fixture_only' ? 'NONE: synthetic transport fixture' : 'See original private ledger',
    limitation: POLICY.scope, privateEvidenceRetained: true, semanticAssessment: 'not_automatically_scored' };
}
export function parseArgs(args) {
  const o = { mode: 'plan', out: null, recovery: null, pid: null, maxNewCalls: 0 }, seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]; if (seen.has(a)) fail('duplicate_argument'); seen.add(a);
    if (['--prepare', '--run'].includes(a)) { if (o.mode !== 'plan') fail('multiple_modes'); o.mode = a.slice(2); }
    else if (['--private-out', '--recovery'].includes(a) && isAbsolute(args[i + 1] ?? '')) o[a === '--private-out' ? 'out' : 'recovery'] = args[++i];
    else if (['--server-pid', '--max-new-calls'].includes(a) && /^\d+$/.test(args[i + 1] ?? '')) o[a === '--server-pid' ? 'pid' : 'maxNewCalls'] = Number(args[++i]);
    else fail('invalid_argument');
  }
  if (!integer(o.maxNewCalls) || o.maxNewCalls > 6) fail('call_cap');
  if (o.mode !== 'plan' && !o.out || o.mode === 'prepare' && (!o.recovery || o.maxNewCalls || o.pid)
    || o.mode === 'run' && (o.recovery || o.maxNewCalls > 0 && !o.pid)
    || o.mode === 'plan' && (o.out || o.recovery || o.pid || o.maxNewCalls)) fail('missing_or_incompatible_options');
  return o;
}
async function verifyServer(pid, provenance) {
  if (!processSample(pid)?.command.endsWith('omlx-server')) fail('expected_owned_omlx_server');
  const listener = spawnSync('/usr/sbin/lsof', ['-nP', '-a', '-p', String(pid), '-iTCP:8018', '-sTCP:LISTEN'], { encoding: 'utf8', timeout: 3000 });
  const lines = listener.stdout?.split('\n').filter(l => l.includes('(LISTEN)')) ?? [];
  if (listener.status !== 0 || lines.length !== 1 || !lines[0].includes('127.0.0.1:8018 (LISTEN)')) fail('expected_loopback_only_listener');
  await verifyModelProvenance(provenance);
}
export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.mode === 'plan') { console.log(JSON.stringify({ policy: POLICY, httpRequests: 0, writes: 0 })); return; }
  const out = await privateDirectory(options.out), core = await loadCore();
  try {
    if (options.mode === 'prepare') {
      const bytes = await readFile(options.recovery);
      if (hash(bytes) !== POLICY.sourceSha256) fail('unexpected_backup_bytes');
      const selection = selectCase(core, JSON.parse(bytes));
      const provenanceBytes = await readFile(join(ROOT, PROVENANCE)), provenance = JSON.parse(provenanceBytes).config.modelProvenance;
      await verifyModelProvenance(provenance); await core.verifySources();
      const config = { mode: 'local_real_backup_diagnostic', policy: POLICY, model: MODEL, source: core.sourceFiles,
        backupPath: options.recovery, backupSha256: hash(bytes), selectionHash: hash(selection),
        modelProvenance: provenance, provenanceSource: { path: PROVENANCE, sha256: hash(provenanceBytes) } };
      await mkdir(out, { mode: 0o700 }); // Exclusive directory prevents preparing over spent IDs.
      await atomicJson(join(out, 'source-bundle.json'), await captureSourceBundle(core.sourceFiles));
      const file = await open(join(out, 'recovery.private.json'), 'wx', 0o600);
      try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
      await atomicJson(join(out, 'ledger.json'), { config, binding: hash(config), entries: [] });
      const firstJobs = [7, 8].map(protocol => buildJob(core, selection, structuredClone(selection.source), protocol, 0));
      await atomicJson(join(out, 'prepared-first-jobs.private.json'), firstJobs);
      const plan = { policy: POLICY, model: MODEL.id, sourceSha256: config.backupSha256, selectionHash: config.selectionHash,
        sourceManifestHash: hash(config.source), binding: hash(config), httpRequests: 0,
        firstRequests: firstJobs.map(j => ({ id: j.id, requestBytes: j.requestBytes, payloadHash: j.payloadHash })) };
      await atomicJson(join(out, 'public-plan.json'), plan); console.log(JSON.stringify(plan, null, 2)); return;
    }
    const lock = options.maxNewCalls ? await open(join(out, '.lock'), 'wx', 0o600) : null;
    try {
      if (lock) { await lock.writeFile(`${process.pid}\n`); await lock.sync(); }
      const original = await readFile(join(out, 'ledger.json')), ledger = JSON.parse(original), config = ledger.config;
      jsonEqual(config.policy, POLICY, 'policy_changed'); jsonEqual(config.model, MODEL, 'model_changed');
      jsonEqual(config.source, core.sourceFiles, 'sources_changed');
      verifySourceBundle(JSON.parse(await readFile(join(out, 'source-bundle.json'))), config.source);
      const bytes = await readFile(join(out, 'recovery.private.json'));
      if (hash(bytes) !== config.backupSha256 || config.backupSha256 !== POLICY.sourceSha256) fail('backup_copy_changed');
      const selection = selectCase(core, JSON.parse(bytes)); jsonEqual(hash(selection), config.selectionHash, 'selection_changed');
      const result = await runEvaluation(core, selection, ledger, { maxNewCalls: options.maxNewCalls,
        persist: l => atomicJson(join(out, 'ledger.json'), l),
        beforeReserve: async () => { await core.verifySources(); await verifyServer(options.pid, config.modelProvenance);
          if (hash(await readFile(config.backupPath)) !== config.backupSha256) fail('original_backup_changed'); },
        dispatch: async job => {
          const r = await fetch(POLICY.endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(POLICY.timeoutMs),
            headers: { 'content-type': 'application/json' }, body: JSON.stringify(job.payload) });
          return { status: r.status, text: await responseText(r), headers: Object.fromEntries(['warning', 'content-type', 'server']
            .map(k => [k, r.headers.get(k)]).filter(([, v]) => v !== null)) };
        } });
      verifyLedger(core, ledger, config); await core.verifySources();
      if (!options.maxNewCalls && hash(await readFile(join(out, 'ledger.json'))) !== hash(original)) fail('readonly_replay_mutated');
      const report = publicReport(ledger, result);
      if (options.maxNewCalls) await atomicJson(join(out, 'public-report.json'), report);
      console.log(JSON.stringify(report, null, 2));
    } finally { if (lock) { await lock.close(); await unlink(join(out, '.lock')); } }
  } finally { await core.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => {
  console.error(`attention_chain_evaluation_failed:${e.code ?? 'private_details_withheld'}`); process.exitCode = 1;
});
