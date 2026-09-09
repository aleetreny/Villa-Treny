#!/usr/bin/env node
/* Two isolated V7 comparisons, never a production worker. Default: offline plan.
 * Only --run may POST to the fixed loopback server. The ONLY payload changes are
 * enable_thinking:true and max_tokens4096 (reasoning+answer), versus V7's1024.
 * This larger local allowance is not equivalent to the cloud output budget.
 * An attempt ID is reserved durably before HTTP; unknown IDs are never retried.
 * Raw responses precede cloned-core validation. --max-new-calls0 needs no server.
 */
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, BenchError, responseText } from './benchmark-society-models.mjs';
import { hash, loadFrozenV7Core, prepareCases, validateCandidate } from './benchmark-society-frozen-v7.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY = Object.freeze({ version: 1, protocol: 3, maxCalls: 2, maxOutputTokens: 4096,
  baselineOutputTokens: 1024, thinking: true, timeoutMs: 120000, concurrency: 1,
  endpoint: 'http://127.0.0.1:8018/v1/chat/completions' });
const fail = code => { throw new BenchError(code); };
const integer = value => Number.isSafeInteger(value) && value >= 0;

export function reasoningJob(fixture) {
  const sourceJob = fixture.sourceJob, original = sourceJob.job, payload = structuredClone(sourceJob.payload);
  if (original.outputContract.version !== 3 || original.maxOutputTokens !== POLICY.baselineOutputTokens
    || payload.max_tokens !== POLICY.baselineOutputTokens || payload.chat_template_kwargs?.enable_thinking !== false
    || hash(payload.messages) !== hash([{ role: 'system', content: original.prompt.system }, { role: 'user', content: original.prompt.user }])
    || hash(payload.response_format.json_schema.schema) !== hash(original.outputContract.jsonSchema)) fail('source_context_mismatch');
  payload.max_tokens = POLICY.maxOutputTokens; payload.chat_template_kwargs.enable_thinking = true;
  const restored = structuredClone(payload); restored.max_tokens = POLICY.baselineOutputTokens; restored.chat_template_kwargs.enable_thinking = false;
  if (hash(restored) !== hash(sourceJob.payload)) fail('unexpected_payload_difference');
  return { id: `v7-local-reasoning-v1:${sourceJob.id}`, actor: fixture.actor, sourceJob,
    beforeHash: fixture.beforeHash, payload, reservedCalls: 1, outputTokenLimit: POLICY.maxOutputTokens };
}

export function receipt(core, response, headers = {}) {
  let output = null, code = null;
  try { output = core.parseStructuredPayload(response?.choices?.[0]?.message?.content); }
  catch { code = 'invalid_structured_output'; }
  if (!Array.isArray(response?.choices) || response.choices.length !== 1) code = 'completion_count';
  else if (response.choices[0].finish_reason !== 'stop') code = response.choices[0].finish_reason === 'length'
    ? 'output_truncated' : 'nonfinal_completion';
  const usage = response?.usage, reasoning = usage?.completion_tokens_details?.reasoning_tokens;
  const usageComplete = integer(usage?.prompt_tokens) && integer(usage?.completion_tokens) && integer(usage?.total_tokens)
    && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens
    && (reasoning === undefined || integer(reasoning) && reasoning <= usage.completion_tokens);
  const exceedsReservation = integer(usage?.completion_tokens) && usage.completion_tokens > POLICY.maxOutputTokens;
  if (exceedsReservation) code = 'output_cap_exceeded';
  const warning = headers.warning ?? null;
  return { output, code, usageComplete, exceedsReservation, warning,
    schemaFallbackWarning: typeof warning === 'string' && /schema|grammar|fallback/i.test(warning),
    reasoningContent: response?.choices?.[0]?.message?.reasoning_content ?? null };
}

export function verifyLedger(core, ledger, config, jobs) {
  if (ledger?.binding !== hash(config) || hash(ledger.config) !== hash(config) || !Array.isArray(ledger.attempts)) fail('probe_binding');
  const seen = new Set();
  for (const row of ledger.attempts) {
    const job = jobs.find(job => job.id === row.id);
    if (!job || seen.has(row.id) || hash(row.job) !== hash(job) || row.reservedCalls !== 1
      || !['reserved', 'completed', 'failed', 'timeout'].includes(row.state)) fail('probe_row');
    seen.add(row.id);
    if (row.state === 'completed') {
      let raw; try { raw = JSON.parse(row.rawResponse); } catch { fail('probe_raw_response'); }
      if (row.httpStatus < 200 || row.httpStatus >= 300 || hash(raw) !== hash(row.response)
        || hash(row.receipt) !== hash(receipt(core, raw, row.headers))) fail('probe_receipt_mismatch');
    } else if (row.validation) fail('unknown_response_applied');
  }
  if (seen.size > POLICY.maxCalls || jobs.length !== POLICY.maxCalls) fail('probe_call_limit');
}

export async function runProbe(core, fixtures, jobs, ledger, { persist = async () => {}, dispatch,
  maxNewCalls = 1, beforeReserve = async () => {}, afterReceipt, measure = () => null, stopped = () => false } = {}) {
  if (!integer(maxNewCalls) || maxNewCalls > POLICY.maxCalls) fail('invalid_call_limit');
  let newCalls = 0, halted = null;
  for (const job of jobs) {
    const fixture = fixtures.find(item => item.actor === job.actor);
    let row = ledger.attempts.find(item => item.id === job.id);
    if (!row) {
      if (newCalls >= maxNewCalls || stopped()) { halted = stopped() ? 'interrupted' : 'call_limit_reached'; break; }
      if (!dispatch) fail('offline_replay_incomplete');
      await beforeReserve(job);
      row = { id: job.id, job, state: 'reserved', reservedCalls: 1, startedAt: new Date().toISOString(), processSamples: [] };
      ledger.attempts.push(row); await persist(ledger);
      if (stopped()) { halted = 'interrupted_reserved_id_not_retried'; break; }
      const sample = () => { const value = measure(); if (value) row.processSamples.push(value); };
      sample(); const timer = setInterval(sample, 1000), started = performance.now(); newCalls += 1;
      try {
        const received = await dispatch(job);
        row.httpStatus = received.status; row.headers = received.headers ?? {}; row.rawResponse = received.text;
        if (!integer(received.status) || received.status < 200 || received.status >= 300) {
          row.state = 'failed'; row.errorCode = `http_${received.status}`;
        } else {
          row.response = JSON.parse(row.rawResponse); row.receipt = receipt(core, row.response, row.headers); row.state = 'completed';
        }
      } catch (error) {
        row.state = ['AbortError', 'TimeoutError'].includes(error?.name) ? 'timeout' : 'failed';
        row.errorCode = error instanceof BenchError ? error.code : 'local_transport_or_invalid_response';
      } finally { clearInterval(timer); sample(); }
      row.latencyMs = Math.round(performance.now() - started); row.finishedAt = new Date().toISOString();
      await persist(ledger); // Durable raw bytes before cloned-core application.
      if (afterReceipt) await afterReceipt(row);
    }
    if (row.state === 'completed') {
      const validation = row.receipt.code ? { ok: false, code: row.receipt.code } : validateCandidate(core, fixture, row.receipt.output);
      if (row.validation && hash(row.validation) !== hash(validation)) fail('probe_replay_mismatch');
      if (!row.validation) { row.validation = validation; await persist(ledger); }
      if (row.receipt.exceedsReservation) { halted = 'provider_exceeded_reservation'; break; }
    }
    // Existing unknown/failed rows consume their IDs permanently; a distinct
    // remaining case may run on resume, never the ambiguous request again.
    if (stopped()) { halted = 'interrupted'; break; }
  }
  return { newCalls, halted, attempts: ledger.attempts.length };
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
  if (options.run && (!isAbsolute(options.out ?? '') || options.maxNewCalls > 0 && (!integer(options.pid) || !options.pid)))
    fail('absolute_out_and_server_pid_required');
  if (!options.run && (options.out || options.pid || seen.has('--max-new-calls'))) fail('offline_plan_has_no_run_options');
  return options;
}

function processSample(pid) {
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'pid=,ppid=,rss=,%cpu=,time=,comm='], { encoding: 'utf8', timeout: 1500 });
  const match = result.status === 0 && result.stdout.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(.+)$/);
  return match ? { at: new Date().toISOString(), pid: Number(match[1]), parentPid: Number(match[2]), rssKiB: Number(match[3]),
    cpuPercent: Number(match[4]), cpuTime: match[5], command: match[6] } : null;
}

async function verifyLocalProvenance(core, pid) {
  const model = core.frozenHarness.MODEL, provenance = core.frozenReference.config.provenance;
  if (!processSample(pid)?.command.endsWith('omlx-server')) fail('expected_local_server_pid');
  const listening = spawnSync('/usr/sbin/lsof', ['-nP', '-a', '-p', String(pid), '-iTCP:8018', '-sTCP:LISTEN'], { encoding: 'utf8', timeout: 3000 });
  if (listening.status !== 0 || !listening.stdout.includes('127.0.0.1:8018 (LISTEN)')
    || listening.stdout.split('\n').filter(line => line.includes('(LISTEN)')).some(line => !line.includes('127.0.0.1:8018 (LISTEN)')))
    fail('expected_loopback_server_listener');
  for (const file of provenance.observedFiles) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(file.name)) fail('invalid_provenance_path');
    const path = join(model.path, file.name), info = await stat(path);
    if (!info.isFile() || info.size !== file.bytes || info.ino !== file.inode || info.mtimeMs !== file.mtimeMs || info.ctimeMs !== file.ctimeMs)
      fail('local_model_changed_since_v7');
    if (!file.name.endsWith('.safetensors') && hash(await readFile(path)) !== file.sha256) fail('model_metadata_changed');
  }
  for (const file of provenance.serverSources) {
    if (hash(await readFile(join('/Applications/oMLX.app/Contents/Resources/omlx', file.name))) !== file.sha256) fail('server_source_changed');
  }
  await core.verifyFrozenSources();
}

async function main() {
  const options = parseArgs(process.argv.slice(2)), core = await loadFrozenV7Core();
  try {
    const fixtures = await prepareCases(core), jobs = fixtures.map(reasoningJob);
    if (!options.run) {
      console.log(JSON.stringify({ mode: 'offline_plan', httpRequests: 0, policy: POLICY, source: core.frozenProvenance,
        jobs: jobs.map(job => ({ id: job.id, actor: job.actor, stage: job.sourceJob.stage, index: job.sourceJob.index,
          beforeHash: job.beforeHash, payloadHash: hash(job.payload), sourceJobHash: hash(job.sourceJob) })) }, null, 2)); return;
    }
    const directory = resolve(options.out), path = join(directory, 'ledger.json'), lockPath = join(directory, '.lock');
    await mkdir(directory, { recursive: true, mode: 0o700 }); let lock;
    try { lock = await open(lockPath, 'wx', 0o600); } catch { fail('output_locked_manual_pid_review_required'); }
    let stopped = false, active = null;
    const stop = () => { stopped = true; active?.abort(); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    try {
      await lock.writeFile(`${process.pid}\n`); await lock.sync();
      const scripts = await Promise.all(['scripts/benchmark-society-v7-local-reasoning-probe.mjs',
        'scripts/benchmark-society-frozen-v7.mjs', 'scripts/benchmark-society-models.mjs'].map(async path => ({ path, sha256: hash(await readFile(join(ROOT, path))) })));
      const config = { policy: POLICY, model: core.frozenHarness.MODEL, source: core.sourceFiles,
        frozen: core.frozenProvenance, modelProvenance: core.frozenReference.config.provenance, scripts,
        jobs: jobs.map(job => ({ id: job.id, hash: hash(job) })) };
      let ledger;
      try { ledger = JSON.parse(await readFile(path, 'utf8')); } catch (error) {
        if (error.code !== 'ENOENT') fail('unreadable_ledger_manual_review');
        try { await stat(`${path}.tmp`); fail('incomplete_ledger_manual_review'); } catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
        if (options.maxNewCalls === 0) fail('replay_requires_existing_ledger');
        ledger = { config, binding: hash(config), attempts: [] }; await atomicJson(path, ledger);
      }
      verifyLedger(core, ledger, config, jobs);
      const dispatch = async job => {
        if (stopped) fail('interrupted'); active = new AbortController();
        try {
          const response = await fetch(POLICY.endpoint, { method: 'POST', redirect: 'error',
            signal: AbortSignal.any([active.signal, AbortSignal.timeout(POLICY.timeoutMs)]),
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job.payload) });
          return { status: response.status, text: await responseText(response), headers: Object.fromEntries(
            ['warning', 'content-type', 'server', 'x-request-id'].map(name => [name, response.headers.get(name)]).filter(([, value]) => value !== null)) };
        } finally { active = null; }
      };
      const result = await runProbe(core, fixtures, jobs, ledger, { persist: value => atomicJson(path, value), dispatch,
        maxNewCalls: options.maxNewCalls, stopped: () => stopped, measure: () => processSample(options.pid),
        beforeReserve: async () => { await verifyLocalProvenance(core, options.pid);
          for (const file of scripts) if (hash(await readFile(join(ROOT, file.path))) !== file.sha256) fail('probe_script_changed'); } });
      verifyLedger(core, ledger, config, jobs);
      const report = { scope: 'Exact frozen V7 B/reply0 and L/initial11, local Qwen with reasoning enabled and4096 combined output tokens. No cloud or production writes; no physical watch.',
        limitation: 'Only two isolated comparisons.4096 reasoning+answer tokens are not equivalent to cloud1024. Local availability requires the Mac awake. Zero provider API fee does not mean zero hardware/time cost. No sustained autonomy claim.',
        humanReview: 'pending', binding: ledger.binding, ...result, server: { pid: options.pid, endpoint: POLICY.endpoint },
        memoryMeasurement: 'ps RSS is sampled process residency, not a complete Metal/unified-memory footprint or guaranteed peak; CPU is a sampled process statistic.',
        rows: ledger.attempts.map(row => ({ actor: row.job.actor, state: row.state, usage: row.response?.usage ?? null,
          warning: row.headers?.warning ?? null, schemaFallbackWarning: row.receipt?.schemaFallbackWarning ?? false,
          latencyMs: row.latencyMs ?? null, maxSampledRssKiB: Math.max(0, ...row.processSamples.map(sample => sample.rssKiB)),
          maxSampledCpuPercent: Math.max(0, ...row.processSamples.map(sample => sample.cpuPercent)),
          output: row.receipt?.output ?? null, reasoningContent: row.receipt?.reasoningContent ?? null,
          validation: row.validation ?? null, baselineValidation: fixtures.find(fixture => fixture.actor === row.job.actor).baselineApplication,
          error: row.errorCode ?? row.receipt?.code ?? null })) };
      await atomicJson(join(directory, 'report.json'), report);
      console.log(JSON.stringify({ report: join(directory, 'report.json'), ...result,
        rows: report.rows.map(({ actor, state, usage, latencyMs, warning, validation }) => ({ actor, state, usage, latencyMs, warning, validation: validation?.code })) }, null, 2));
    } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); await lock.close(); await unlink(lockPath); }
  } finally { await core.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(JSON.stringify({ error: error instanceof BenchError ? error.code : error.message ?? 'reasoning_probe_failed' })); process.exitCode = 1;
});
