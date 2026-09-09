#!/usr/bin/env node
// Offline by default. Six fixed matched cases; no server start, credentials or
// physical watch. --run needs a separately authorized owned loopback server.
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { z } from 'zod';
import { atomicJson, responseText } from './benchmark-society-models.mjs';
import { sourceManifest, captureSourceBundle, receive, decodedReceipt, processSample, MODEL } from './benchmark-society-runtime-v7-local.mjs';
import { hash } from './benchmark-society-frozen-v7.mjs';
import { loadFrozenFinalDialogue, prepareFinalDialogueCases, sceneHash } from './benchmark-society-frozen-final-dialogue.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY = Object.freeze({ version: 1, maxCalls: 6, outputTokens: 1024, timeoutMs: 120000,
  endpoint: 'http://127.0.0.1:8018/v1/chat/completions', thinking: false, physicalWatches: 0,
  order: ['J44:P4', 'J44:P5', 'L45:P5', 'L45:P4', 'J46:P4', 'J46:P5'],
  interpretation: { J44: 'The recorded counterproposal changed the deadline; accepting is not required.',
    L45: 'The recorded counterproposal changed the deadline; accepting is not required.',
    J46: 'The recorded proposal had exactly the incoming terms while its prose said it accepted.',
    economics: 'Zero-cell work is unpaid cooperation, never a monetary payment. No physical watch in this comparison.' } });
export const DEFAULT_DIRECTORY = join(ROOT, 'docs/research/model-society-ordered-choice-local-2026-09-08');
const fail = code => { throw new Error(code); };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const scriptPaths = ['scripts/benchmark-society-ordered-choice-local.mjs', 'scripts/benchmark-society-frozen-final-dialogue.mjs',
  'scripts/benchmark-society-frozen-v7.mjs', 'scripts/benchmark-society-runtime-v7-local.mjs', 'scripts/benchmark-society-models.mjs'];

export async function loadComparisonCore() {
  const frozen = await loadFrozenFinalDialogue(), sourceFiles = await sourceManifest();
  const server = await createServer({ root: ROOT, configFile: false, appType: 'custom', logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const modules = await Promise.all(['/src/lib/habitat/society/ordered-choice.ts', '/src/lib/habitat/society/instructions.ts']
      .map(path => server.ssrLoadModule(path)));
    if (hash(sourceFiles) !== hash(await sourceManifest())) fail('comparison_source_changed');
    return { frozen, ordered: Object.assign({}, ...modules), sourceFiles,
      verifySources: async () => { await frozen.verifyFrozenSources();
        if (hash(sourceFiles) !== hash(await sourceManifest())) fail('comparison_source_changed'); },
      close: async () => { try { await server.close(); } finally { await frozen.close(); } } };
  } catch (error) { await server.close(); await frozen.close(); throw error; }
}

export function comparisonJob(core, fixture, variant) {
  if (!['P4', 'P5'].includes(variant)) fail('variant');
  const source = fixture.sourceJob, payload = structuredClone(source.payload);
  if (source.job.outputContract.version !== 4 || payload.max_tokens !== 1024
    || payload.chat_template_kwargs?.enable_thinking !== false || payload.messages.length !== 2
    || payload.messages[0].role !== 'system' || payload.messages[1].role !== 'user') fail('historical_payload_shape');
  if (variant === 'P5') {
    payload.messages[0].content = core.ordered.orderedSystemFromProposalSystem(source.payload.messages[0].content);
    payload.response_format.json_schema.schema = core.ordered.orderedChoiceJsonSchemaFromProposal(source.job.outputContract.jsonSchema);
  }
  const restored = structuredClone(payload);
  restored.messages[0].content = source.payload.messages[0].content;
  restored.response_format.json_schema.schema = source.payload.response_format.json_schema.schema;
  if (hash(restored) !== hash(source.payload)) fail('unexpected_payload_change');
  return { id: `ordered-choice-v1:${fixture.key}:${variant}:${source.id}`, caseKey: fixture.key, actor: fixture.actor,
    sequence: fixture.sequence, variant, beforeHash: fixture.beforeHash, sourceJob: source, payload,
    outputTokenLimit: 1024, reservedCalls: 1,
    promptBytes: Buffer.byteLength(JSON.stringify({ messages: payload.messages, response_format: payload.response_format })) };
}

function proposalApply(core, fixture, output) {
  const scene = structuredClone(fixture.scene), source = fixture.sourceJob;
  scene.state = core.markSocietyAttempt(scene.state, fixture.actor, source.nowMs);
  return core.applyProposalCapabilityChoice(scene.state, scene.world, source.turn, output, { nowMs: source.nowMs + 1, generation: 0 });
}

export function validateComparison(core, fixture, job, output) {
  if (sceneHash(fixture.scene) !== fixture.beforeHash) fail('fixture_mutated');
  if (!z.fromJSONSchema(job.payload.response_format.json_schema.schema).safeParse(output).success)
    return { ok: false, code: 'candidate_schema_violation' };
  let proposal = output;
  if (job.variant === 'P5') {
    const decoded = core.ordered.fromOrderedChoice(output);
    if (!decoded.ok) return { ok: false, code: decoded.code };
    proposal = decoded.value;
  }
  const canonical = proposalApply(core.frozen, fixture, proposal);
  let result = canonical;
  if (job.variant === 'P5') {
    const scene = structuredClone(fixture.scene), source = fixture.sourceJob;
    scene.state = core.frozen.markSocietyAttempt(scene.state, fixture.actor, source.nowMs);
    result = core.ordered.applyOrderedCapabilityChoice(scene.state, scene.world, source.turn, output,
      { nowMs: source.nowMs + 1, generation: 0 });
    if (result.ok !== canonical.ok || sceneHash(result) !== sceneHash(canonical)) fail('p5_canonical_effect_difference');
  }
  if (result.ok) {
    const apply = job.variant === 'P5' ? core.ordered.applyOrderedCapabilityChoice : core.frozen.applyProposalCapabilityChoice;
    const duplicate = apply(result.state, result.world, fixture.sourceJob.turn, output,
      { nowMs: fixture.sourceJob.nowMs + 2, generation: 0 });
    if (duplicate.code !== 'already_applied' || sceneHash(duplicate) !== sceneHash(result)) fail('candidate_not_idempotent');
  }
  if (!core.frozen.parseSocietyState(result.state).ok || result.world.day !== fixture.scene.world.day
    || result.world.watch !== fixture.scene.world.watch || sceneHash(fixture.scene) !== fixture.beforeHash) fail('candidate_state_or_clock');
  const offers = result.state.offers.filter(o => !fixture.scene.state.offers.some(old => old.id === o.id));
  const agreements = result.state.agreements.filter(a => !fixture.scene.state.agreements.some(old => old.id === a.id));
  const incoming = fixture.scene.state.offers.filter(o => o.status === 'open' && o.counterpart === fixture.actor);
  return { ok: result.ok, code: result.code, afterHash: sceneHash(result), canonicalEffectEquivalent: true,
    decision: proposal.deal?.kind === 'work' ? 'propose_work' : proposal.deal?.kind ?? 'no_deal',
    explicitOfferId: proposal.deal?.offerId ?? null, newOffers: offers, newAgreements: agreements,
    proposedTermsMatchIncoming: offers.length ? offers.map(o => incoming.some(old => hash(old.terms) === hash(o.terms))) : [],
    balanceChanges: core.frozen.RESIDENTS.filter(({ id }) => fixture.scene.world.bodies[id].cells !== result.world.bodies[id].cells)
      .map(({ id }) => ({ actor: id, before: fixture.scene.world.bodies[id].cells, after: result.world.bodies[id].cells })),
    clockUnchanged: true, physicalWatches: 0 };
}

export function verifyLedger(core, ledger, config, jobs) {
  if (ledger.binding !== hash(config) || hash(ledger.config) !== hash(config) || !Array.isArray(ledger.entries)
    || ledger.entries.length > 6 || jobs.length !== 6) fail('ledger_binding_or_cap');
  for (const [index, row] of ledger.entries.entries()) {
    if (row.kind !== 'cognition' || row.id !== jobs[index].id || hash(row.job) !== hash(jobs[index])
      || !['reserved', 'completed', 'failed', 'timeout', 'skipped'].includes(row.state)
      || row.reservedCalls !== (row.state === 'skipped' ? 0 : 1)) fail('ledger_job_order');
    if (row.state === 'completed') {
      const response = JSON.parse(row.rawResponse);
      if (hash(response) !== hash(row.response)
        || hash(decodedReceipt(response, core.frozen.parseStructuredPayload, row.headers)) !== hash(row.receipt)) fail('ledger_raw');
    } else if (row.validation) fail('unknown_response_applied');
  }
}

export async function runComparison(core, fixtures, jobs, ledger, { maxNewCalls = 1, persist = async () => {},
  dispatch, beforeReserve = async () => {}, measure = () => null } = {}) {
  if (!integer(maxNewCalls) || maxNewCalls > 6 || jobs.length !== 6 || ledger.entries.length > 6) fail('call_cap');
  let newCalls = 0;
  for (const [index, job] of jobs.entries()) {
    const fixture = fixtures.find(f => f.key === job.caseKey);
    let row = ledger.entries[index];
    if (row && (row.id !== job.id || hash(row.job) !== hash(job))) fail('replay_job');
    if (!row) {
      if (newCalls >= maxNewCalls) return { newCalls, stopped: 'call_limit_reached' };
      if (ledger.entries.length >= 6) fail('call_cap');
      row = await receive(job, ledger, persist, dispatch, core.frozen.parseStructuredPayload, { beforeReserve, measure });
      if (row.state !== 'skipped') newCalls++;
    }
    if (row.state === 'completed') {
      const validation = row.receipt.receiptCode ? { ok: false, code: row.receipt.receiptCode }
        : validateComparison(core, fixture, job, row.receipt.output);
      if (row.validation && hash(row.validation) !== hash(validation)) fail('replay_validation');
      if (!row.validation) { row.validation = validation; await persist(ledger); }
      if (row.receipt.exceedsReservation) return { newCalls, stopped: 'output_limit_exceeded' };
    }
    // Failed/unknown IDs stay spent. A different fixed case may still run.
  }
  return { newCalls, stopped: 'all_six_cases_processed' };
}

export function parseArgs(args) {
  const options = { run: false, out: DEFAULT_DIRECTORY, maxNewCalls: 1, pid: null }, seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]; if (seen.has(key)) fail('duplicate_arg'); seen.add(key);
    if (key === '--run') options.run = true;
    else if (key === '--out' && isAbsolute(args[i + 1] ?? '')) options.out = args[++i];
    else if (key === '--max-new-calls' && /^[0-6]$/.test(args[i + 1] ?? '')) options.maxNewCalls = Number(args[++i]);
    else if (key === '--server-pid' && /^\d+$/.test(args[i + 1] ?? '')) options.pid = Number(args[++i]);
    else fail('arg');
  }
  if (options.run && options.maxNewCalls > 0 && !options.pid) fail('owned_server_required');
  return options;
}

async function verifyOwnedServer(core, pid) {
  if (!processSample(pid)?.command.endsWith('omlx-server')) fail('owned_server');
  const listener = spawnSync('/usr/sbin/lsof', ['-nP', '-a', '-p', String(pid), '-iTCP:8018', '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (listener.status !== 0 || !listener.stdout.includes('127.0.0.1:8018 (LISTEN)')) fail('owned_loopback');
  const provenance = core.frozen.reference.config.modelProvenance;
  for (const file of provenance.observedFiles) {
    const path = join(MODEL.path, file.name), info = await stat(path);
    if (info.size !== file.bytes || info.ino !== file.inode || info.mtimeMs !== file.mtimeMs || info.ctimeMs !== file.ctimeMs) fail('model_changed');
    if (!file.name.endsWith('.safetensors') && hash(await readFile(path)) !== file.sha256) fail('model_metadata_changed');
  }
  for (const file of provenance.serverSources)
    if (hash(await readFile(join('/Applications/oMLX.app/Contents/Resources/omlx', file.name))) !== file.sha256) fail('server_source_changed');
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args), core = await loadComparisonCore();
  try {
    if (hash(MODEL) !== hash(core.frozen.reference.config.model)) fail('historical_model_changed');
    const fixtures = await prepareFinalDialogueCases(core.frozen), jobs = POLICY.order.map(item => {
      const [key, variant] = item.split(':'); return comparisonJob(core, fixtures.find(f => f.key === key), variant); });
    const scripts = await Promise.all(scriptPaths.map(async path => ({ path, sha256: hash(await readFile(join(ROOT, path))) })));
    const config = { policy: POLICY, frozen: core.frozen.provenance, source: core.sourceFiles, scripts,
      model: MODEL, modelProvenance: core.frozen.reference.config.modelProvenance, jobs: jobs.map(j => ({ id: j.id, sha256: hash(j) })) };
    await core.verifySources();
    if (!options.run) { console.log(JSON.stringify({ mode: 'offline_plan', httpRequests: 0, config,
      cases: fixtures.map(f => ({ key: f.key, beforeHash: f.beforeHash, sourceJobHash: hash(f.sourceJob) })),
      payloadHashes: jobs.map(j => ({ id: j.id, hash: hash(j.payload) })) }, null, 2)); return; }
    await mkdir(options.out, { recursive: true });
    const lock = await open(join(options.out, '.lock'), 'wx');
    try {
      const path = join(options.out, 'ledger.json'); let ledger;
      try { ledger = JSON.parse(await readFile(path)); } catch (error) {
        if (error.code !== 'ENOENT') throw error; if (!options.maxNewCalls) fail('replay_requires_ledger');
        ledger = { config, binding: hash(config), entries: [] };
        await atomicJson(join(options.out, 'source-bundle.json'), await captureSourceBundle(core.sourceFiles));
        await atomicJson(join(options.out, 'probe-source-bundle.json'), { files: await Promise.all(scripts.map(async file =>
          ({ ...file, text: await readFile(join(ROOT, file.path), 'utf8') }))) });
        await atomicJson(join(options.out, 'frozen-cases.json'), { policy: POLICY,
          cases: fixtures.map(f => ({ key: f.key, beforeHash: f.beforeHash, sourceJob: f.sourceJob, baselineOutput: f.baselineOutput })), jobs });
        await atomicJson(path, ledger);
      }
      verifyLedger(core, ledger, config, jobs);
      const result = await runComparison(core, fixtures, jobs, ledger, { maxNewCalls: options.maxNewCalls,
        persist: value => atomicJson(path, value), measure: () => processSample(options.pid),
        beforeReserve: async () => { await core.verifySources(); await verifyOwnedServer(core, options.pid);
          for (const file of scripts) if (hash(await readFile(join(ROOT, file.path))) !== file.sha256) fail('script_changed'); },
        dispatch: async job => {
          const response = await fetch(POLICY.endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(POLICY.timeoutMs),
            headers: { 'content-type': 'application/json' }, body: JSON.stringify(job.payload) });
          return { status: response.status, text: await responseText(response), headers: Object.fromEntries(
            ['warning', 'content-type', 'server'].map(name => [name, response.headers.get(name)]).filter(([, value]) => value !== null)) };
        } });
      verifyLedger(core, ledger, config, jobs);
      const report = { scope: 'Three exact historical J44/L45/J46 contexts, each P4/P5, counterbalanced. No physical watch.',
        intervention: 'P5 changes only its response format/grammar and format instructions derived from the saved P4 SYSTEM. USER, sampling and seed unchanged. No later English instruction added.',
        limitation: 'Selected negotiation contexts; not spontaneous economics, model ranking or a requirement to accept legitimate counterproposals.',
        humanReview: 'pending', ...result, rows: ledger.entries.map(row => ({ caseKey: row.job.caseKey, variant: row.job.variant,
          state: row.state, output: row.receipt?.output ?? null, validation: row.validation ?? null,
          warning: row.headers?.warning ?? null, usage: row.response?.usage ?? null, latencyMs: row.latencyMs ?? null })) };
      await atomicJson(join(options.out, 'report.json'), report); console.log(JSON.stringify(report));
    } finally { await lock.close(); await unlink(join(options.out, '.lock')); }
  } finally { await core.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error.message); process.exitCode = 1;
});
