#!/usr/bin/env node
/* Two local Qwen requests against the exact saved V6 B/C contexts. Default is
 * an offline plan: no HTTP, credentials or writes. --run permits only the fixed
 * loopback endpoint, never starts a server or downloads a model. A durable row
 * consumes its attempt ID before HTTP; ambiguous attempts are never retried.
 * Results are applied only to a cloned in-memory core, with no physical watch.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, BenchError, responseText } from './benchmark-society-models.mjs';
import { loadCore, sourceManifest } from './benchmark-society-runtime-v6.mjs';
import { hash, prepareCases, validateCandidate } from './benchmark-society-oss-probe.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = join(ROOT, 'docs/research/model-society-v6-2026-09-08/ledger.json');
export const MODEL = Object.freeze({ id: 'Qwen3.6-35B-A3B-4bit',
  path: '/Users/alejandrotreny/.omlx/models/mlx-community/Qwen3.6-35B-A3B-4bit', serverVersion: '0.6.4' });
export const POLICY = Object.freeze({ version: 1, maxCalls: 2, maxOutputTokens: 768, timeoutMs: 120000,
  endpoint: 'http://127.0.0.1:8018/v1/chat/completions', concurrency: 1 });
const fail = code => { throw new BenchError(code); };
const integer = n => Number.isSafeInteger(n) && n >= 0;

export function localJob(fixture) {
  const sourceJob = fixture.sourceJob, original = sourceJob.job;
  if (!['B', 'C'].includes(fixture.actor) || original.outputContract.name !== 'society_turn'
    || original.outputContract.version !== 2
    || hash(sourceJob.payload.messages) !== hash([{ role: 'system', content: original.prompt.system },
      { role: 'user', content: original.prompt.user }])
    || hash(sourceJob.payload.response_format.json_schema.schema) !== hash(original.outputContract.jsonSchema)) fail('source_context_mismatch');
  return { id: `local-probe-v1:${sourceJob.id}`, actor: fixture.actor, beforeHash: fixture.beforeHash, sourceJob,
    payload: { model: MODEL.id, messages: structuredClone(sourceJob.payload.messages),
      temperature: sourceJob.payload.temperature, seed: sourceJob.payload.seed, stream: false,
      max_tokens: POLICY.maxOutputTokens, chat_template_kwargs: { enable_thinking: false },
      response_format: structuredClone(sourceJob.payload.response_format) } };
}

export function localReceipt(core, response, headers = {}) {
  let output = null, code = null;
  try { output = core.parseStructuredPayload(response?.choices?.[0]?.message?.content); }
  catch { code = 'invalid_structured_output'; }
  if (!Array.isArray(response?.choices) || response.choices.length !== 1) code = 'completion_count';
  else if (response.choices[0].finish_reason !== 'stop') code = response.choices[0].finish_reason === 'length'
    ? 'output_truncated' : 'nonfinal_completion';
  const usage = response?.usage, reasoning = usage?.completion_tokens_details?.reasoning_tokens;
  const usageComplete = integer(usage?.prompt_tokens) && integer(usage?.completion_tokens)
    && integer(usage?.total_tokens) && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens
    && (reasoning === undefined || integer(reasoning) && reasoning <= usage.completion_tokens);
  if (usageComplete && usage.completion_tokens > POLICY.maxOutputTokens) code = 'output_cap_exceeded';
  // A schema-warning response remains evidence, but is never counted as a
  // grammar-enforced success. The ordinary domain check is still recorded.
  return { output, code, usageComplete, warning: headers.warning ?? null,
    reasoningContent: response?.choices?.[0]?.message?.reasoning_content ?? null };
}

export function verifyLocal(core, ledger, config, jobs) {
  if (ledger?.binding !== hash(config) || hash(ledger.config) !== hash(config) || !Array.isArray(ledger.attempts)) fail('local_binding');
  const seen = new Set();
  for (const row of ledger.attempts) {
    const job = jobs.find(j => j.id === row.id);
    if (!job || seen.has(row.id) || hash(row.job) !== hash(job)
      || !['reserved', 'completed', 'failed', 'timeout'].includes(row.state)) fail('local_row');
    seen.add(row.id);
    if (row.state === 'completed') {
      let decoded; try { decoded = JSON.parse(row.rawResponse); } catch { fail('local_raw_response'); }
      if (hash(decoded) !== hash(row.response) || hash(row.receipt) !== hash(localReceipt(core, decoded, row.headers))) fail('local_raw_response');
    } else if (row.validation) fail('unknown_result_applied');
  }
  if (seen.size > POLICY.maxCalls) fail('local_call_limit');
}

export async function runLocal(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls = 1,
  beforeDispatch = async () => {}, measure = () => null, stopped = () => false } = {}) {
  if (!integer(maxNewCalls) || maxNewCalls > POLICY.maxCalls) fail('invalid_call_limit');
  let newCalls = 0, halted = null;
  for (const job of jobs) {
    const fixture = fixtures.find(f => f.actor === job.actor), prior = ledger.attempts.find(r => r.id === job.id);
    if (prior) {
      if (prior.state === 'completed') {
        const validation = validateCandidate(core, fixture, job, prior.receipt);
        if (prior.validation && hash(prior.validation) !== hash(validation)) fail('local_replay_mismatch');
        if (!prior.validation) { prior.validation = validation; await persist(ledger); }
      }
      continue;
    }
    if (newCalls >= maxNewCalls || stopped()) { halted = stopped() ? 'interrupted' : 'call_limit_reached'; break; }
    await beforeDispatch(job);
    const row = { id: job.id, job, state: 'reserved', startedAt: new Date().toISOString(), processSamples: [] };
    ledger.attempts.push(row); await persist(ledger);
    const sample = () => { const result = measure(); if (result) row.processSamples.push(result); };
    sample(); const timer = setInterval(sample, 1000), started = performance.now(); newCalls += 1;
    try {
      const received = await dispatch(job);
      row.httpStatus = received.status; row.headers = received.headers ?? {}; row.rawResponse = received.text;
      if (!integer(received.status) || received.status < 200 || received.status >= 300) {
        row.state = 'failed'; row.errorCode = `http_${received.status}`;
      } else {
        row.response = JSON.parse(row.rawResponse);
        row.receipt = localReceipt(core, row.response, row.headers); row.state = 'completed';
      }
    } catch (error) {
      row.state = ['AbortError', 'TimeoutError'].includes(error?.name) ? 'timeout' : 'failed';
      row.errorCode = error instanceof BenchError ? error.code : 'local_transport_or_invalid_response';
    } finally { clearInterval(timer); sample(); }
    row.latencyMs = Math.round(performance.now() - started); row.finishedAt = new Date().toISOString();
    await persist(ledger); // Raw bytes durable before effects in the in-memory copy.
    if (row.state === 'completed') {
      row.validation = validateCandidate(core, fixture, job, row.receipt); await persist(ledger);
    }
    if (stopped()) { halted = 'interrupted'; break; }
  }
  return { newCalls, halted };
}

export function parseArgs(args) {
  const options = { run: false, out: null, maxNewCalls: 1, pid: null }, seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]; if (seen.has(arg)) fail('duplicate_argument'); seen.add(arg);
    if (arg === '--run') options.run = true;
    else if (arg === '--out' && args[i + 1] && !args[i + 1].startsWith('--')) options.out = args[++i];
    else if (['--max-new-calls', '--server-pid'].includes(arg) && /^\d+$/.test(args[i + 1] ?? ''))
      options[arg === '--server-pid' ? 'pid' : 'maxNewCalls'] = Number(args[++i]);
    else fail('invalid_arguments');
  }
  if (!integer(options.maxNewCalls) || options.maxNewCalls > POLICY.maxCalls) fail('invalid_call_limit');
  if (options.run && (!isAbsolute(options.out ?? '') || !integer(options.pid) || options.pid === 0)) fail('absolute_out_and_server_pid_required');
  if (!options.run && (options.out || options.pid || seen.has('--max-new-calls'))) fail('offline_plan_has_no_run_options');
  return options;
}

export function processSample(pid) {
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'pid=,ppid=,rss=,%cpu=,time=,comm='],
    { encoding: 'utf8', timeout: 1500 });
  const match = result.status === 0 && result.stdout.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(.+)$/);
  return match ? { at: new Date().toISOString(), pid: Number(match[1]), parentPid: Number(match[2]),
    rssKiB: Number(match[3]), cpuPercent: Number(match[4]), cpuTime: match[5], command: match[6] } : null;
}

async function fileHash(path) {
  const digest = createHash('sha256');
  for await (const data of createReadStream(path)) digest.update(data);
  return digest.digest('hex');
}

async function provenance() {
  const index = JSON.parse(await readFile(join(MODEL.path, 'model.safetensors.index.json'), 'utf8'));
  const shards = [...new Set(Object.values(index.weight_map))].sort();
  if (shards.length !== 4 || shards.some(name => !/^model-\d{5}-of-00004\.safetensors$/.test(name))) fail('unexpected_model_shards');
  const files = [];
  for (const name of ['config.json', 'model.safetensors.index.json', 'tokenizer.json', 'tokenizer_config.json', 'chat_template.jinja', ...shards]) {
    const path = join(MODEL.path, name), info = await stat(path);
    files.push({ name, bytes: info.size, sha256: await fileHash(path) });
  }
  const source = '/Applications/oMLX.app/Contents/Resources/omlx';
  const serverSources = await Promise.all(['cli.py', 'server.py', 'settings.py', 'api/openai_models.py'].map(async name =>
    ({ name, sha256: await fileHash(join(source, name)) })));
  const version = spawnSync('/Users/alejandrotreny/.omlx/bin/omlx', ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (version.status !== 0 || version.stdout.trim() !== MODEL.serverVersion) fail('server_version_changed');
  return { modelFiles: files, serverSources, serverVersion: version.stdout.trim(),
    hardware: { chip: 'Apple M5 Pro', memoryGiB: 48, logicalCores: 18, basis: 'read-only machine inventory' } };
}

async function main() {
  const options = parseArgs(process.argv.slice(2)), core = await loadCore();
  try {
    const reference = JSON.parse(await readFile(REFERENCE, 'utf8')), fixtures = await prepareCases(core, reference);
    const jobs = fixtures.map(localJob);
    if (!options.run) {
      console.log(JSON.stringify({ mode: 'offline_plan', httpRequests: 0, credentialReads: 0, policy: POLICY,
        jobs: jobs.map(job => ({ id: job.id, actor: job.actor, beforeHash: job.beforeHash, payloadHash: hash(job.payload),
          sourceJobHash: hash(job.sourceJob) })) }, null, 2)); return;
    }
    const processInfo = processSample(options.pid);
    if (!processInfo || !processInfo.command.endsWith('omlx-server')) fail('expected_local_server_pid');
    const directory = resolve(options.out), path = join(directory, 'ledger.json'), lockPath = join(directory, '.lock');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let lock; try { lock = await open(lockPath, 'wx', 0o600); } catch { fail('output_locked_manual_pid_review_required'); }
    let stopped = false, active = null;
    const stop = () => { stopped = true; active?.abort(); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    try {
      await lock.writeFile(`${process.pid}\n`); await lock.sync();
      const config = { policy: POLICY, model: MODEL, referenceHash: hash(reference), source: core.sourceFiles,
        provenance: await provenance(), scriptHash: await fileHash(fileURLToPath(import.meta.url)),
        reconstructionScriptHash: await fileHash(join(ROOT, 'scripts/benchmark-society-oss-probe.mjs')),
        jobs: jobs.map(job => ({ id: job.id, hash: hash(job) })) };
      let ledger;
      try { ledger = JSON.parse(await readFile(path, 'utf8')); } catch (error) {
        if (error.code !== 'ENOENT') fail('unreadable_ledger_manual_review');
        try { await stat(`${path}.tmp`); fail('incomplete_ledger_manual_review'); } catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
        if (options.maxNewCalls === 0) fail('replay_requires_existing_ledger');
        ledger = { config, binding: hash(config), attempts: [] }; await atomicJson(path, ledger);
      }
      verifyLocal(core, ledger, config, jobs);
      const dispatch = async job => {
        if (stopped) fail('interrupted');
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
      const result = await runLocal(core, fixtures, jobs, ledger, { persist: value => atomicJson(path, value), dispatch,
        maxNewCalls: options.maxNewCalls, stopped: () => stopped, measure: () => processSample(options.pid),
        beforeDispatch: async () => { if (hash(core.sourceFiles) !== hash(await sourceManifest())) fail('source_changed_before_dispatch'); } });
      verifyLocal(core, ledger, config, jobs);
      const report = { scope: 'Two exact V6 B/C contexts, local Qwen only. No production or cloud calls, no physical watch, no sustained cognition claim.',
        humanReview: 'pending', binding: ledger.binding, ...result, server: { pid: options.pid, endpoint: POLICY.endpoint },
        memoryMeasurement: 'ps RSS is sampled process residency, not a complete Metal/unified-memory footprint or a guaranteed peak. CPU percentage is ps recent CPU, not a benchmark.',
        rows: ledger.attempts.map(row => ({ actor: row.job.actor, state: row.state, httpStatus: row.httpStatus,
          warning: row.headers?.warning ?? null, usage: row.response?.usage ?? null, latencyMs: row.latencyMs,
          maxSampledRssKiB: Math.max(0, ...row.processSamples.map(sample => sample.rssKiB)),
          maxSampledCpuPercent: Math.max(0, ...row.processSamples.map(sample => sample.cpuPercent)),
          validation: row.validation ?? null, output: row.receipt?.output ?? null, error: row.errorCode ?? row.receipt?.code ?? null })) };
      await atomicJson(join(directory, 'report.json'), report);
      console.log(JSON.stringify({ report: join(directory, 'report.json'), ...result, rows: report.rows.map(({ actor, state, latencyMs, warning, validation, usage }) =>
        ({ actor, state, latencyMs, warning, validation: validation?.code, usage })) }, null, 2));
    } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); await lock.close(); await unlink(lockPath); }
  } finally { await core.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(JSON.stringify({ error: error instanceof BenchError ? error.code : 'local_probe_failed' })); process.exitCode = 1;
});
