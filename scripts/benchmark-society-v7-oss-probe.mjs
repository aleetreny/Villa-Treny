#!/usr/bin/env node
/* Two manual GPT-OSS120B comparisons against exact saved V7 contexts:
 * B reply0 (irrelevant grow offer) and L initial11 (plausible repair assistance).
 * Original SYSTEM/USER/schema/seed, no corrected fields or injected state.
 * Only provider/model wrapper differs: low reasoning,1024 output, strict schema.
 * Default offline, no credentials/HTTP. Two new IDs,390 neurons in total.
 * Reserve before request; original response durable before clone application.
 * Failed/unknown/reserved IDs are never retried. No production state or watch.
 */
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, BenchError, responseText } from './benchmark-society-models.mjs';
import { checkCredentialExpiry, countParts, credentialsFor, hash, MODEL, parseArgs,
  receipt, settle, sourceParts, spent, validateCounts, POLICY as OSS_POLICY } from './benchmark-society-oss-probe.mjs';
import { loadFrozenV7Core, prepareCases, validateCandidate } from './benchmark-society-frozen-v7.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = 'docs/research/model-society-v7-local-2026-09-08/ledger.json';
const SCRIPTS = ['scripts/benchmark-society-v7-oss-probe.mjs', 'scripts/benchmark-society-frozen-v7.mjs',
  'scripts/benchmark-society-oss-probe.mjs', 'scripts/benchmark-society-models.mjs', 'scripts/benchmark-society-runtime-v6.mjs'];
export const POLICY = Object.freeze({ ...OSS_POLICY, maxNeurons: 390, experiment: 'v7_exact_b_reply_l_initial' });
const fail = code => { throw new BenchError(code); };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function probeJob(fixture, counts) {
  const sourceJob = fixture.job, original = sourceJob.job;
  if (original.outputContract.name !== 'society_turn' || original.outputContract.version !== 3
    || hash(sourceJob.payload.messages) !== hash([{ role: 'system', content: original.prompt.system },
      { role: 'user', content: original.prompt.user }])
    || hash(sourceJob.payload.response_format.json_schema.schema) !== hash(original.outputContract.jsonSchema)) fail('source_context_mismatch');
  const payload = { messages: structuredClone(sourceJob.payload.messages), temperature: sourceJob.payload.temperature,
    seed: sourceJob.payload.seed, stream: false, max_completion_tokens: POLICY.maxOutputTokens,
    reasoning_effort: 'low', response_format: structuredClone(sourceJob.payload.response_format) };
  const reservedInputTokens = validateCounts(sourceParts(sourceJob), counts) + POLICY.templateTokens;
  const reservedNeurons = Math.ceil((reservedInputTokens * MODEL.inputRate + POLICY.maxOutputTokens * MODEL.outputRate) / 1e6);
  return { id: `v7-oss-probe-v1:${sourceJob.id}`, actor: sourceJob.actor, stage: sourceJob.stage,
    model: MODEL.id, beforeHash: fixture.beforeHash, sourceJob, counts, payload, reservedInputTokens, reservedNeurons };
}

const application = (core, fixture, received) => received.code ? { ok: false, code: received.code }
  : validateCandidate(core, fixture, received.output);

export function verifyProbe(core, ledger, config, jobs) {
  if (ledger?.binding !== hash(config) || hash(ledger.config) !== hash(config) || !Array.isArray(ledger.attempts)) fail('probe_binding');
  const ids = new Set();
  for (const row of ledger.attempts) {
    const job = jobs.find(value => value.id === row.id);
    if (!job || ids.has(row.id) || hash(row.job) !== hash(job)
      || !['reserved', 'completed', 'failed', 'timeout'].includes(row.state)) fail('probe_row');
    ids.add(row.id); validateCounts(sourceParts(job.sourceJob), job.counts);
    const checked = row.state === 'completed' ? receipt(core, job, row.response) : settle(job, null);
    if (row.accountedNeurons !== checked.accountedNeurons) fail('probe_accounting');
    if (checked.exceedsReservation) fail('provider_exceeded_reservation_manual_review');
    if (row.state === 'completed') {
      let raw; try { raw = JSON.parse(row.rawResponse); } catch { fail('probe_raw_response'); }
      if (raw.success !== true || hash(raw.result) !== hash(row.response) || hash(row.receipt) !== hash(checked)) fail('probe_raw_response');
    } else if (row.validation) fail('unknown_result_applied');
  }
  if (ids.size > POLICY.maxCalls || spent(ledger) > POLICY.maxNeurons) fail('probe_budget');
}

export async function runProbe(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls = 1,
  stopped = () => false, beforeReserve = async () => {}, redact = text => text } = {}) {
  if (!integer(maxNewCalls) || maxNewCalls > POLICY.maxCalls) fail('invalid_call_limit');
  let newCalls = 0, halted = null;
  for (const job of jobs) {
    const fixture = fixtures.find(value => value.job.id === job.sourceJob.id), prior = ledger.attempts.find(row => row.id === job.id);
    if (!fixture) fail('fixture_missing');
    if (prior) {
      if (prior.state === 'completed') {
        const checked = application(core, fixture, prior.receipt);
        if (prior.validation && hash(prior.validation) !== hash(checked)) fail('probe_replay_mismatch');
        if (!prior.validation) { prior.validation = checked; await persist(ledger); }
      }
      continue;
    }
    if (stopped() || newCalls >= maxNewCalls) { halted = stopped() ? 'interrupted' : 'call_limit_reached'; break; }
    if (ledger.attempts.length >= POLICY.maxCalls || spent(ledger) + job.reservedNeurons > POLICY.maxNeurons) { halted = 'budget_exhausted'; break; }
    await beforeReserve(job);
    const row = { id: job.id, job, state: 'reserved', startedAt: new Date().toISOString(), accountedNeurons: job.reservedNeurons };
    ledger.attempts.push(row); await persist(ledger);
    const started = performance.now(); newCalls += 1;
    try {
      const response = await dispatch(job); row.httpStatus = response.status; row.rawResponse = redact(response.text);
      if (!integer(response.status) || response.status < 200 || response.status >= 300) {
        row.state = 'failed'; row.errorCode = integer(response.status) ? `http_${response.status}` : 'invalid_http_status';
      } else {
        const envelope = JSON.parse(row.rawResponse);
        if (envelope.success !== true || !plain(envelope.result)) fail('invalid_provider_envelope');
        row.response = envelope.result; row.receipt = receipt(core, job, row.response);
        row.accountedNeurons = row.receipt.accountedNeurons; row.state = 'completed';
      }
    } catch (error) {
      row.state = ['AbortError', 'TimeoutError'].includes(error?.name) ? 'timeout' : 'failed';
      row.errorCode = error instanceof BenchError ? error.code : 'network_or_invalid_envelope';
    }
    row.latencyMs = Math.round(performance.now() - started); row.finishedAt = new Date().toISOString();
    await persist(ledger); // Original response persists before applying any effect.
    if (row.state === 'completed') { row.validation = application(core, fixture, row.receipt); await persist(ledger); }
    if (row.state !== 'completed' || row.receipt.exceedsReservation) { halted = row.errorCode ?? row.receipt.code; break; }
  }
  return { newCalls, halted };
}

export async function inputManifest() {
  return Promise.all([...SCRIPTS, REFERENCE].map(async path => ({ path, sha256: hash(await readFile(join(ROOT, path))) })));
}

export async function verifyInputs(core, manifest, jobs, options) {
  await core.verifyFrozenSources();
  if (hash(await inputManifest()) !== hash(manifest)) fail('probe_inputs_changed');
  for (const job of jobs) if (hash(countParts(sourceParts(job.sourceJob), options)) !== hash(job.counts)) fail('tokenizer_changed_before_dispatch');
}

async function live(core, fixtures, jobs, reference, manifest, options, env) {
  const credentials = credentialsFor(options, env), directory = resolve(options.out), path = join(directory, 'ledger.json');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, '.lock'); let lock;
  try { lock = await open(lockPath, 'wx', 0o600); } catch { fail('output_locked_manual_pid_review_required'); }
  let stopped = false, active = null;
  const stop = () => { stopped = true; active?.abort(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    await lock.writeFile(`${process.pid}\n`); await lock.sync(); let ledger;
    try { ledger = JSON.parse(await readFile(path, 'utf8')); } catch (error) {
      if (error.code !== 'ENOENT') fail('unreadable_ledger_manual_review');
      try { await stat(`${path}.tmp`); fail('incomplete_ledger_manual_review'); }
      catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
      if (!credentials) fail('replay_requires_existing_ledger');
    }
    const config = { policy: POLICY, model: MODEL, source: core.sourceFiles, frozen: core.frozenProvenance,
      inputs: manifest, referenceHash: hash(reference), accountHash: credentials ? hash(credentials.account) : ledger.config.accountHash,
      jobs: jobs.map(job => ({ id: job.id, hash: hash(job) })) };
    if (!ledger) { ledger = { config, binding: hash(config), attempts: [] }; await atomicJson(path, ledger); }
    verifyProbe(core, ledger, config, jobs);
    const dispatch = async job => {
      if (!credentials || stopped) fail('dispatch_not_authorized');
      checkCredentialExpiry(credentials); active = new AbortController();
      try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${credentials.account}/ai/run/${MODEL.id}`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.any([active.signal, AbortSignal.timeout(POLICY.timeoutMs)]),
          headers: { Authorization: `Bearer ${credentials.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(job.payload),
        });
        return { status: response.status, text: await responseText(response) };
      } finally { active = null; }
    };
    const result = await runProbe(core, fixtures, jobs, ledger, { persist: value => atomicJson(path, value), dispatch,
      maxNewCalls: options.maxNewCalls, stopped: () => stopped,
      beforeReserve: async job => {
        checkCredentialExpiry(credentials); await verifyInputs(core, manifest, [job], options); checkCredentialExpiry(credentials);
      }, redact: text => credentials ? text.replaceAll(credentials.token, '[REDACTED]').replaceAll(credentials.account, '[REDACTED]') : text });
    const summary = { scope: 'Two exact frozen V7 local contexts: B reply0, L initial11. Original SYSTEM/USER/schema/seed; GPT-OSS120B low reasoning/1024 output/strict wrapper. No injected fields, physical watch or production state. A two-case model/provider comparison, not a statistical ranking.',
      humanReview: 'pending', binding: ledger.binding, ...result, accountedNeurons: spent(ledger), maxNeurons: POLICY.maxNeurons,
      baselines: fixtures.map(fixture => {
        const row = reference.entries.find(value => value.id === fixture.job.id);
        return { actor: fixture.job.actor, stage: fixture.job.stage, beforeHash: fixture.beforeHash, sourceId: row.id,
          output: row.receipt.output, application: row.application };
      }),
      rows: ledger.attempts.map(row => ({ id: row.id, actor: row.job.actor, stage: row.job.stage, state: row.state,
        usage: row.response?.usage ?? null, output: row.receipt?.output ?? null, validation: row.validation ?? null,
        error: row.errorCode ?? row.receipt?.code ?? null, accountedNeurons: row.accountedNeurons, latencyMs: row.latencyMs ?? null })) };
    await atomicJson(join(directory, 'report.json'), summary);
    console.log(JSON.stringify({ report: join(directory, 'report.json'), ...result, accountedNeurons: spent(ledger), humanReview: 'pending' }, null, 2));
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); await lock.close(); await unlink(lockPath); }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.python ??= process.env.SOCIETY_TOKEN_PYTHON; options.cache ??= process.env.TIKTOKEN_CACHE_DIR;
  const core = await loadFrozenV7Core();
  try {
    const reference = JSON.parse(await readFile(join(ROOT, REFERENCE), 'utf8'));
    const fixtures = await prepareCases(core, reference), jobs = fixtures.map(fixture => probeJob(fixture, countParts(sourceParts(fixture.job), options)));
    const manifest = await inputManifest(); await core.verifyFrozenSources();
    if (!options.live) {
      console.log(JSON.stringify({ mode: 'offline_plan', apiCalls: 0, credentialReads: 0, policy: POLICY, model: MODEL,
        frozen: core.frozenProvenance, inputs: manifest, jobs: jobs.map(job => ({ id: job.id, actor: job.actor, stage: job.stage,
          beforeHash: job.beforeHash, counts: job.counts.parts.map(({ label, tokens, bytes, sha256 }) => ({ label, tokens, bytes, sha256 })),
          reservedInputTokens: job.reservedInputTokens, reservedNeurons: job.reservedNeurons })),
        sumMaximumReservations: jobs.reduce((sum, job) => sum + job.reservedNeurons, 0),
        bothCallsGuaranteedWithinCap: jobs.reduce((sum, job) => sum + job.reservedNeurons, 0) <= POLICY.maxNeurons }, null, 2)); return;
    }
    await live(core, fixtures, jobs, reference, manifest, options, process.env);
  } finally { await core.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(JSON.stringify({ error: error instanceof BenchError ? error.code : 'v7_oss_probe_failed' })); process.exitCode = 1;
});
