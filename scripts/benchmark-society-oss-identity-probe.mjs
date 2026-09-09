#!/usr/bin/env node
/* Manual identity intervention on the exact V6 B/C states. No inference,
 * credentials or permanent writes by default. Two new IDs; 300 neurons in total.
 * Only USER gains the byte-identical identity/directory prefix already tested
 * locally. SYSTEM, schema, state and all GPT-OSS120B controls stay unchanged.
 * Full canonical names, not a second first-name variant. No injected wants.
 * Each response is applied to a separate clone using the archived V6 core.
 * This tiny joint identity/directory intervention is not a model ranking.
 */
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, BenchError, responseText } from './benchmark-society-models.mjs';
import { loadFrozenV6Core } from './benchmark-society-frozen-v6.mjs';
import { checkCredentialExpiry, countParts, credentialsFor, hash, MODEL, parseArgs,
  POLICY as OSS_POLICY, prepareCases, probeJob, runProbe, sourceParts, spent, verifyProbe,
} from './benchmark-society-oss-probe.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = 'docs/research/model-society-v6-2026-09-08/ledger.json';
const LOCAL = 'docs/research/model-society-local-identity-probe-2026-09-08/ledger.json';
const BASELINE = 'docs/research/model-society-oss-probe-2026-09-08/ledger.json';
const SOURCES = [
  'scripts/benchmark-society-oss-identity-probe.mjs',
  'scripts/benchmark-society-frozen-v6.mjs',
  'scripts/benchmark-society-oss-probe.mjs',
  'scripts/benchmark-society-runtime-v6.mjs',
  'scripts/benchmark-society-models.mjs',
];
export const POLICY = Object.freeze({ ...OSS_POLICY, experiment: 'explicit_identity_and_offered_recipient_names_v1' });
const fail = code => { throw new BenchError(code); };

export function identityVariant(core, fixture, localJob) {
  const original = fixture.sourceJob, actor = core.RESIDENT_BY_ID[fixture.actor];
  const ids = original.job.outputContract.jsonSchema.properties?.message?.properties?.to?.enum;
  if (!actor || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length
    || ids.some(id => id === fixture.actor || !core.RESIDENT_BY_ID[id])) fail('invalid_identity_directory');
  const prefix = `You are ${actor.name} (${actor.id}). Speak and choose in the first person as ${actor.name}.\n`
    + `Available recipients: ${ids.map(id => `${id}=${core.RESIDENT_BY_ID[id].name}`).join('; ')}\nCurrent information:\n`;
  const variant = { name: POLICY.experiment, prefix, recipientIds: ids };
  const sourceJob = structuredClone(original);
  sourceJob.job.prompt.user = prefix + original.job.prompt.user;
  sourceJob.payload.messages = [{ role: 'system', content: original.job.prompt.system },
    { role: 'user', content: sourceJob.job.prompt.user }];
  if (hash(localJob?.sourceJob) !== hash(original) || localJob?.beforeHash !== fixture.beforeHash
    || hash(localJob?.variant) !== hash(variant)
    || hash(localJob?.payload?.messages) !== hash(sourceJob.payload.messages)
    || hash(localJob?.payload?.response_format) !== hash(original.payload.response_format)) fail('local_identity_variant_changed');
  return { ...fixture, sourceJob, referenceJob: original, variant };
}

export async function prepareIdentityCases(core, reference, local) {
  const fixtures = await prepareCases(core, reference);
  if (!Array.isArray(local?.attempts) || local.attempts.length !== fixtures.length) fail('identity_reference_cases');
  return fixtures.map(fixture => {
    const matching = local.attempts.filter(row => row.job?.actor === fixture.actor);
    if (matching.length !== 1) fail('identity_reference_cases');
    return identityVariant(core, fixture, matching[0].job);
  });
}

export function identityJob(fixture, counts) {
  const job = probeJob(fixture, counts);
  return { ...job, id: `oss-identity-probe-v1:${fixture.referenceJob.id}`,
    referenceJob: fixture.referenceJob, variant: fixture.variant };
}

export function validateCloudBaseline(jobs, baseline) {
  if (!Array.isArray(baseline?.attempts) || baseline.attempts.length !== jobs.length) fail('oss_baseline_cases');
  for (const job of jobs) {
    const matches = baseline.attempts.filter(row => row.job?.actor === job.actor), prior = matches[0];
    const payload = structuredClone(job.payload);
    payload.messages[1].content = job.referenceJob.job.prompt.user;
    if (matches.length !== 1 || prior.state !== 'completed' || prior.job.model !== MODEL.id
      || prior.job.beforeHash !== job.beforeHash || hash(prior.job.sourceJob) !== hash(job.referenceJob)
      || hash(prior.job.payload) !== hash(payload)) fail('oss_baseline_changed');
  }
}

export async function inputManifest(core) {
  // The imported historical runner functions must match the archived runner,
  // while unrelated live core/provider/WASM edits do not invalidate this replay.
  const inputs = await Promise.all([...SOURCES, REFERENCE, LOCAL, BASELINE].map(async path => ({
    path, sha256: hash(await readFile(join(ROOT, path))),
  })));
  for (const path of SOURCES.slice(3)) {
    if (inputs.find(file => file.path === path)?.sha256 !== core.sourceFiles.find(file => file.path === path)?.sha256)
      fail('historical_runner_changed');
  }
  return inputs;
}

export async function verifyInputs(core, manifest, jobs, options) {
  await core.verifyFrozenSources();
  if (hash(await inputManifest(core)) !== hash(manifest)) fail('identity_inputs_changed');
  for (const job of jobs) {
    if (hash(countParts(sourceParts(job.sourceJob), options)) !== hash(job.counts)) fail('tokenizer_changed_before_dispatch');
  }
}

async function live(core, fixtures, jobs, references, baseline, manifest, options, env) {
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
      inputs: manifest, referenceHashes: references,
      accountHash: credentials ? hash(credentials.account) : ledger.config.accountHash,
      jobs: jobs.map(job => ({ id: job.id, hash: hash(job) })) };
    if (!ledger) { ledger = { config, binding: hash(config), attempts: [] }; await atomicJson(path, ledger); }
    verifyProbe(core, ledger, config, jobs);
    const dispatch = async job => {
      if (!credentials || stopped) fail('dispatch_not_authorized');
      checkCredentialExpiry(credentials);
      active = new AbortController();
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
        checkCredentialExpiry(credentials);
        await verifyInputs(core, manifest, [job], options);
        checkCredentialExpiry(credentials);
      },
      redact: text => credentials ? text.replaceAll(credentials.token, '[REDACTED]').replaceAll(credentials.account, '[REDACTED]') : text });
    const report = { scope: 'Two exact frozen V6 contexts. Only USER gains canonical self identity and the offered recipient directory, identical to the local identity probe. GPT-OSS120B low reasoning /1024 output. No injected wants, state changes or physical watch. Not a statistical model ranking.',
      humanReview: 'pending', binding: ledger.binding, ...result, accountedNeurons: spent(ledger), maxNeurons: POLICY.maxNeurons,
      v6ReferenceRows: fixtures.map(({ actor, beforeHash, baselineOutput, baselineApplication }) => ({ actor, beforeHash, baselineOutput, baselineApplication })),
      ossBaselineRows: baseline.attempts.map(row => ({ id: row.id, actor: row.job.actor, beforeHash: row.job.beforeHash,
        output: row.receipt?.output ?? null, validation: row.validation ?? null, usage: row.response?.usage ?? null })),
      rows: ledger.attempts.map(row => ({ id: row.id, actor: row.job.actor, state: row.state, usage: row.response?.usage ?? null,
        output: row.receipt?.output ?? null, validation: row.validation ?? null, error: row.errorCode ?? row.receipt?.code ?? null,
        accountedNeurons: row.accountedNeurons, latencyMs: row.latencyMs ?? null })) };
    await atomicJson(join(directory, 'report.json'), report);
    console.log(JSON.stringify({ report: join(directory, 'report.json'), ...result,
      accountedNeurons: spent(ledger), humanReview: 'pending' }, null, 2));
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop); await lock.close(); await unlink(lockPath);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.python ??= process.env.SOCIETY_TOKEN_PYTHON;
  options.cache ??= process.env.TIKTOKEN_CACHE_DIR;
  const core = await loadFrozenV6Core();
  try {
    const [reference, local, baseline] = await Promise.all([REFERENCE, LOCAL, BASELINE].map(async path => JSON.parse(await readFile(join(ROOT, path), 'utf8'))));
    const fixtures = await prepareIdentityCases(core, reference, local);
    const jobs = fixtures.map(fixture => identityJob(fixture, countParts(sourceParts(fixture.sourceJob), options)));
    validateCloudBaseline(jobs, baseline);
    const manifest = await inputManifest(core);
    await core.verifyFrozenSources();
    if (!options.live) {
      console.log(JSON.stringify({ mode: 'offline_plan', apiCalls: 0, credentialReads: 0, policy: POLICY, model: MODEL,
        frozen: core.frozenProvenance, inputs: manifest, jobs: jobs.map(job => ({ id: job.id, actor: job.actor,
          beforeHash: job.beforeHash, prefix: job.variant.prefix,
          counts: job.counts.parts.map(({ label, tokens, bytes, sha256 }) => ({ label, tokens, bytes, sha256 })),
          reservedInputTokens: job.reservedInputTokens, reservedNeurons: job.reservedNeurons })),
        sumMaximumReservations: jobs.reduce((sum, job) => sum + job.reservedNeurons, 0),
        bothCallsGuaranteedWithinCap: jobs.reduce((sum, job) => sum + job.reservedNeurons, 0) <= POLICY.maxNeurons }, null, 2));
      return;
    }
    await live(core, fixtures, jobs, { v6: hash(reference), localIdentity: hash(local), ossBaseline: hash(baseline) }, baseline, manifest, options, process.env);
  } finally { await core.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(JSON.stringify({ error: error instanceof BenchError ? error.code : 'oss_identity_probe_failed' })); process.exitCode = 1;
});
