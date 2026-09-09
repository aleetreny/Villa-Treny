#!/usr/bin/env node
/* Explicit-identity variant of the local probe. Two additional distinct attempt
 * IDs. Only the user-message prefix changes: names come from RESIDENTS and the
 * exact offered recipient enum. SYSTEM, schema and reconstructed state stay
 * identical to the original V6 B/C contexts. No production or cloud calls.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, BenchError, responseText } from './benchmark-society-models.mjs';
import { loadCore, sourceManifest } from './benchmark-society-runtime-v6.mjs';
import { hash, prepareCases } from './benchmark-society-oss-probe.mjs';
import { localJob, verifyLocal, runLocal, parseArgs, processSample, MODEL, POLICY } from './benchmark-society-local-probe.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = join(ROOT, 'docs/research/model-society-v6-2026-09-08/ledger.json');
const fail = code => { throw new BenchError(code); };
export const VARIANT = 'explicit_identity_and_offered_recipient_names_v1';

export function identityJob(core, fixture) {
  const job = localJob(fixture), actor = core.RESIDENTS.find(resident => resident.id === job.actor);
  const recipients = job.sourceJob.job.outputContract.jsonSchema.properties?.message?.properties?.to?.enum;
  if (!actor || !Array.isArray(recipients) || !recipients.length || new Set(recipients).size !== recipients.length) fail('recipient_enum_missing');
  const directory = recipients.map(id => {
    const resident = core.RESIDENTS.find(person => person.id === id);
    if (!resident || id === job.actor) fail('recipient_identity_missing');
    return id + '=' + resident.name;
  }).join('; ');
  const prefix = 'You are ' + actor.name + ' (' + actor.id + '). Speak and choose in the first person as ' + actor.name
    + '.\nAvailable recipients: ' + directory + '\nCurrent information:\n';
  job.id = job.id.replace('local-probe-v1:', 'local-identity-probe-v1:');
  job.variant = { name: VARIANT, prefix, recipientIds: recipients };
  job.payload.messages[1].content = prefix + job.payload.messages[1].content;
  return job;
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
    const jobs = fixtures.map(fixture => identityJob(core, fixture));
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
      const config = { variant: VARIANT, policy: POLICY, model: MODEL, referenceHash: hash(reference), source: core.sourceFiles,
        provenance: await provenance(), scriptHash: await fileHash(fileURLToPath(import.meta.url)),
        sharedProbeScriptHash: await fileHash(join(ROOT, 'scripts/benchmark-society-local-probe.mjs')),
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
      const report = { scope: 'V6 B/C contexts with explicit self identity and offered recipient names prefixed to USER; original SYSTEM/schema/state, local Qwen only. No production or cloud calls, no physical watch, no sustained cognition claim.',
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
