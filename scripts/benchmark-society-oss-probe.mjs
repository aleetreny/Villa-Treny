#!/usr/bin/env node
/* Manual, isolated GPT-OSS120B probe of exact saved V6 B/C contexts. Default:
 * offline plan; no credentials, inference or writes. Two attempt IDs, global
 * cap300. Their maximum reservations do not fit together: complete usage from
 * the first must release enough capacity, otherwise stop. Never retry an ID.
 * Neither the source ledger nor production state is mutated. No physical watch.
 * Official references checked 2026-09-08:
 * https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/
 * https://developers.cloudflare.com/workers-ai/changelog/#2026-02-17
 * https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
 * https://developers.cloudflare.com/workers-ai/platform/pricing/
 * Current generated Wrangler types explicitly map120B to ChatCompletions or
 * Responses input. This probe uses messages + reasoning_effort:'low', the
 * documented ChatCompletions wrapper and max_completion_tokens:1024, not a
 * guessed mixture of Responses API fields. Provider support is not a guarantee
 * of schema enforcement, grounding or quality. All outputs need local review.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { atomicJson, BenchError, responseText } from './benchmark-society-models.mjs';
import { loadCore, sourceManifest, verifyLedger as verifyV6, runFixture, buildJob,
  POLICY as V6, MODEL as GEMMA } from './benchmark-society-runtime-v6.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = join(ROOT, 'docs/research/model-society-v6-2026-09-08/ledger.json');
export const POLICY = Object.freeze({ version: 1, maxCalls: 2, maxNeurons: 300,
  templateTokens: 2048, maxOutputTokens: 1024, timeoutMs: 45000, pricesCheckedOn: '2026-09-08' });
export const MODEL = Object.freeze({ id: '@cf/openai/gpt-oss-120b', inputRate: 31818, outputRate: 68182 });
const RANK_HASH = '446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d';
const fail = (code) => { throw new BenchError(code); };
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
export const hash = (v) => createHash('sha256').update(typeof v === 'string' || Buffer.isBuffer(v) ? v
  : JSON.stringify(v, (_key, value) => value instanceof Map ? { $map: [...value] } : value)).digest('hex');
const sceneHash = (scene) => hash({ state: scene.state, world: scene.world });
export const spent = (ledger) => ledger.attempts.reduce((sum, row) => sum + row.accountedNeurons, 0);
const cost = (input, output) => Math.ceil((input * MODEL.inputRate + output * MODEL.outputRate) / 1e6);

// No download fallback, cache deletion, credentials or network. The official
// tiktoken loader's expected hash must match every byte read from the cache.
const PYTHON = `import hashlib,json,pathlib,sys,tiktoken,tiktoken.load
assert tiktoken.__version__ == '0.14.0'
cache=pathlib.Path(sys.argv[1]); ranks=set()
def offline(url,expected_hash=None):
 data=(cache/hashlib.sha1(url.encode()).hexdigest()).read_bytes()
 digest=hashlib.sha256(data).hexdigest()
 assert expected_hash == '${RANK_HASH}' and digest == expected_hash
 ranks.add(digest)
 return data
tiktoken.load.read_file_cached=offline
encoding=tiktoken.get_encoding('o200k_harmony')
rows=[]
for item in json.load(sys.stdin):
 text=item['text']; ids=encoding.encode_ordinary(text)
 assert encoding.decode(ids)==text
 rows.append({'label':item['label'],'sha256':hashlib.sha256(text.encode()).hexdigest(),'bytes':len(text.encode()),'tokens':len(ids),'ids':ids})
assert ranks == {'${RANK_HASH}'}
json.dump({'encoding':encoding.name,'version':tiktoken.__version__,'rankSha256':list(ranks)[0],'parts':rows},sys.stdout)
`;

export function sourceParts(sourceJob) {
  const j = sourceJob.job;
  return [{ label: 'system', text: j.prompt.system }, { label: 'user', text: j.prompt.user },
    { label: 'schema', text: JSON.stringify(j.outputContract.jsonSchema) }];
}

export function validateCounts(parts, counts) {
  if (counts?.encoding !== 'o200k_harmony' || counts.version !== '0.14.0' || counts.rankSha256 !== RANK_HASH
    || counts.parts?.length !== parts.length) fail('tokenizer_provenance');
  for (let i = 0; i < parts.length; i += 1) {
    const expected = parts[i], actual = counts.parts[i];
    if (actual.label !== expected.label || actual.sha256 !== hash(expected.text)
      || actual.bytes !== Buffer.byteLength(expected.text) || !integer(actual.tokens)
      || !Array.isArray(actual.ids) || actual.ids.length !== actual.tokens || !actual.ids.every(integer)) fail('token_count_mismatch');
  }
  return counts.parts.reduce((sum, part) => sum + part.tokens, 0);
}

export function countParts(parts, { python, cache }) {
  if (!isAbsolute(python ?? '') || !isAbsolute(cache ?? '')) fail('absolute_tokenizer_paths_required');
  const counted = spawnSync(python, ['-c', PYTHON, cache], { input: JSON.stringify(parts), encoding: 'utf8',
    timeout: 10000, maxBuffer: 3 * 1024 * 1024, env: { PYTHONIOENCODING: 'utf-8' } });
  if (counted.status !== 0 || counted.error) fail('offline_tokenizer_cache_required');
  let counts; try { counts = JSON.parse(counted.stdout); } catch { fail('invalid_tokenizer_output'); }
  validateCounts(parts, counts); return counts;
}

export async function prepareCases(core, reference) {
  if (hash(reference.config?.policy) !== hash(V6) || hash(reference.config?.model) !== hash(GEMMA)
    || hash(reference.config?.source) !== hash(core.sourceFiles)) fail('v6_source_changed');
  verifyV6(reference, reference.config, core);
  const untouched = hash(reference), cases = [];
  for (const [actor, index] of [['B', 1], ['C', 2]]) {
    const position = reference.entries.findIndex((r) => r.kind === 'cognition' && r.job.actor === actor
      && r.job.stage === 'initial' && r.job.index === index);
    const target = reference.entries[position];
    if (position < 0 || target.state !== 'completed' || !target.application) fail('missing_completed_v6_case');
    const prefix = structuredClone({ ...reference, entries: reference.entries.slice(0, position) }), before = hash(prefix);
    const scene = await runFixture(core, prefix, { maxNewCalls: 0,
      dispatch: () => fail('prefix_cannot_dispatch'), persist: () => fail('prefix_cannot_write') });
    if (scene.newCalls || scene.consumedEntries !== position || scene.halted !== 'call_limit_reached'
      || hash(prefix) !== before) fail('prefix_replay_incomplete');
    if (hash(buildJob(core, scene, actor, 'initial', index)) !== hash(target.job)) fail('exact_v6_job_changed');
    cases.push({ actor, scene, beforeHash: sceneHash(scene), sourceJob: target.job,
      baselineOutput: target.receipt.output, baselineApplication: target.application });
  }
  if (hash(reference) !== untouched) fail('reference_mutated');
  return cases;
}

export function probeJob(fixture, counts) {
  const sourceJob = fixture.sourceJob, j = sourceJob.job;
  if (j.outputContract.name !== 'society_turn' || j.outputContract.version !== 2
    || hash(sourceJob.payload.messages) !== hash([{ role: 'system', content: j.prompt.system }, { role: 'user', content: j.prompt.user }])
    || hash(sourceJob.payload.response_format.json_schema.schema) !== hash(j.outputContract.jsonSchema)) fail('source_context_mismatch');
  const payload = { messages: structuredClone(sourceJob.payload.messages), temperature: sourceJob.payload.temperature,
    seed: sourceJob.payload.seed, stream: false, max_completion_tokens: POLICY.maxOutputTokens, reasoning_effort: 'low',
    response_format: structuredClone(sourceJob.payload.response_format) };
  const reservedInputTokens = validateCounts(sourceParts(sourceJob), counts) + POLICY.templateTokens;
  return { id: `oss-probe-v1:${sourceJob.id}`, actor: fixture.actor, model: MODEL.id, beforeHash: fixture.beforeHash,
    sourceJob, counts, payload, reservedInputTokens, reservedNeurons: cost(reservedInputTokens, POLICY.maxOutputTokens) };
}

export function settle(job, usage) {
  const reasoning = usage?.completion_tokens_details?.reasoning_tokens;
  const complete = plain(usage) && integer(usage.prompt_tokens) && integer(usage.completion_tokens)
    && integer(usage.total_tokens) && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens
    && (reasoning === undefined || integer(reasoning) && reasoning <= usage.completion_tokens);
  const measured = complete ? cost(usage.prompt_tokens, usage.completion_tokens) : null;
  const providerNeurons = Number.isFinite(usage?.neurons) && usage.neurons >= 0 ? Math.ceil(usage.neurons) : null;
  const accountedNeurons = complete ? Math.max(measured, providerNeurons ?? 0) : job.reservedNeurons;
  const exceedsReservation = complete && (usage.prompt_tokens > job.reservedInputTokens
    || usage.completion_tokens > POLICY.maxOutputTokens || accountedNeurons > job.reservedNeurons);
  return { complete, estimatedNeuronsFromReportedTokens: measured, exceedsReservation,
    accountedNeurons: exceedsReservation ? Math.max(accountedNeurons, job.reservedNeurons) : accountedNeurons };
}

export function receipt(core, job, response) {
  const accounting = settle(job, response?.usage); let output = null, code = null;
  try { output = core.parseStructuredPayload(response?.choices?.[0]?.message?.content); }
  catch { code = 'invalid_structured_output'; }
  if (!Array.isArray(response?.choices) || response.choices.length !== 1) code = 'completion_count';
  else if (response.choices[0].finish_reason !== 'stop') code = response.choices[0].finish_reason === 'length' ? 'output_truncated' : 'nonfinal_completion';
  if (accounting.exceedsReservation) code = 'provider_exceeded_reservation';
  return { ...accounting, output, code };
}

export function validateCandidate(core, fixture, job, received) {
  if (received.code) return { ok: false, code: received.code };
  if (!z.fromJSONSchema(job.sourceJob.job.outputContract.jsonSchema).safeParse(received.output).success) return { ok: false, code: 'source_schema_violation' };
  if (sceneHash(fixture.scene) !== job.beforeHash) fail('source_scene_changed');
  const scene = structuredClone(fixture.scene);
  scene.state = core.markSocietyAttempt(scene.state, job.actor, job.sourceJob.nowMs);
  const result = core.applySocietyChoice(scene.state, scene.world, job.sourceJob.turn, received.output,
    { nowMs: job.sourceJob.nowMs + 1, generation: V6.generation });
  if (!core.parseSocietyState(result.state).ok) fail('candidate_invalid_state');
  if (result.ok) {
    const duplicate = core.applySocietyChoice(result.state, result.world, job.sourceJob.turn, received.output,
      { nowMs: job.sourceJob.nowMs + 2, generation: V6.generation });
    if (duplicate.code !== 'already_applied' || sceneHash(duplicate) !== sceneHash(result)) fail('candidate_not_idempotent');
  }
  if (sceneHash(fixture.scene) !== job.beforeHash) fail('candidate_mutated_reference');
  return { ok: result.ok, code: result.code, afterHash: sceneHash(result), project: result.state.minds[job.actor].project,
    conversations: result.state.conversations.filter((c) => c.participants.includes(job.actor)),
    balanceChanges: core.RESIDENTS.filter(({ id }) => scene.world.bodies[id].cells !== result.world.bodies[id].cells)
      .map(({ id }) => ({ actor: id, before: scene.world.bodies[id].cells, after: result.world.bodies[id].cells })) };
}

export function verifyProbe(core, ledger, config, jobs) {
  if (ledger?.binding !== hash(config) || hash(ledger.config) !== hash(config) || !Array.isArray(ledger.attempts)) fail('probe_binding');
  const seen = new Set();
  for (const row of ledger.attempts) {
    const job = jobs.find((j) => j.id === row.id);
    if (!job || seen.has(row.id) || hash(row.job) !== hash(job) || !['reserved','completed','failed','timeout'].includes(row.state)) fail('probe_row');
    seen.add(row.id); validateCounts(sourceParts(job.sourceJob), job.counts);
    const checked = row.state === 'completed' ? receipt(core, job, row.response) : settle(job, null);
    if (row.accountedNeurons !== checked.accountedNeurons) fail('probe_accounting');
    if (checked.exceedsReservation) fail('provider_exceeded_reservation_manual_review');
    if (row.state === 'completed') {
      let original; try { original = JSON.parse(row.rawResponse); } catch { fail('probe_raw_response'); }
      if (original.success !== true || hash(original.result) !== hash(row.response) || hash(row.receipt) !== hash(checked)) fail('probe_raw_response');
    } else if (row.validation) fail('unknown_result_applied');
  }
  if (seen.size > POLICY.maxCalls || spent(ledger) > POLICY.maxNeurons) fail('probe_budget');
}

export async function runProbe(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls = 1,
  stopped = () => false, redact = (text) => text, beforeReserve = () => {} } = {}) {
  if (!integer(maxNewCalls) || maxNewCalls > POLICY.maxCalls) fail('invalid_call_limit');
  let newCalls = 0, halted = null;
  for (const job of jobs) {
    const fixture = fixtures.find((f) => f.actor === job.actor), prior = ledger.attempts.find((r) => r.id === job.id);
    if (prior) {
      if (prior.state === 'completed') {
        const validation = validateCandidate(core, fixture, job, prior.receipt);
        if (prior.validation && hash(prior.validation) !== hash(validation)) fail('probe_replay_mismatch');
        if (!prior.validation) { prior.validation = validation; await persist(ledger); }
      }
      continue; // Reserved, unknown, failed and completed IDs are never resubmitted.
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
      row.state = ['AbortError','TimeoutError'].includes(error?.name) ? 'timeout' : 'failed';
      row.errorCode = error instanceof BenchError ? error.code : 'network_or_invalid_envelope';
    }
    row.latencyMs = Math.round(performance.now() - started); row.finishedAt = new Date().toISOString();
    await persist(ledger); // Original provider response durable before local effects.
    if (row.state === 'completed') { row.validation = validateCandidate(core, fixture, job, row.receipt); await persist(ledger); }
    if (row.state !== 'completed' || row.receipt.exceedsReservation) { halted = row.errorCode ?? row.receipt.code; break; }
  }
  return { newCalls, halted };
}

export function parseArgs(args) {
  const options = { live: false, out: null, maxNewCalls: 1, python: null, cache: null }; const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]; if (seen.has(arg)) fail('duplicate_argument'); seen.add(arg);
    if (arg === '--live') options.live = true;
    else if (['--out','--token-python','--token-cache'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) {
      options[({ '--out': 'out', '--token-python': 'python', '--token-cache': 'cache' })[arg]] = args[++i];
    } else if (arg === '--max-new-calls' && /^\d+$/.test(args[i + 1] ?? '')) options.maxNewCalls = Number(args[++i]);
    else fail('invalid_arguments');
  }
  if (!integer(options.maxNewCalls) || options.maxNewCalls > POLICY.maxCalls) fail('invalid_call_limit');
  if (options.live && !isAbsolute(options.out ?? '') || !options.live && (options.out || seen.has('--max-new-calls'))) fail('live_requires_absolute_out');
  return options;
}

export function checkCredentialExpiry(credentials, nowMs = Date.now()) {
  if (!Number.isSafeInteger(credentials?.expiresAtMs) || credentials.expiresAtMs <= nowMs + 120000) fail('oauth_expiry_requires_refresh');
}

export function credentialsFor(options, env, nowMs = Date.now()) {
  if (!options.live || options.maxNewCalls === 0) return null;
  const account = env.CF_ACCOUNT_ID, token = env.CF_API_TOKEN, expiresAtMs = Date.parse(env.CF_TOKEN_EXPIRES_AT ?? '');
  if (!/^[a-f0-9]{32}$/i.test(account ?? '') || !token || /\s/.test(token)) fail('explicit_credentials_required');
  const credentials = { account, token, expiresAtMs };
  checkCredentialExpiry(credentials, nowMs); return credentials;
}

async function live(core, fixtures, jobs, reference, options, env) {
  const credentials = credentialsFor(options, env), directory = resolve(options.out), path = join(directory, 'ledger.json');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, '.lock'); let lock;
  try { lock = await open(lockPath, 'wx', 0o600); } catch { fail('output_locked_manual_pid_review_required'); }
  let stopped = false, active = null; const stop = () => { stopped = true; active?.abort(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    await lock.writeFile(`${process.pid}\n`); await lock.sync(); let ledger;
    try { ledger = JSON.parse(await readFile(path, 'utf8')); } catch (error) {
      if (error.code !== 'ENOENT') fail('unreadable_ledger_manual_review');
      try { await stat(`${path}.tmp`); fail('incomplete_ledger_manual_review'); } catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
      if (!credentials) fail('replay_requires_existing_ledger');
    }
    const config = { policy: POLICY, model: MODEL, source: core.sourceFiles, referenceHash: hash(reference),
      accountHash: credentials ? hash(credentials.account) : ledger.config.accountHash,
      scriptHash: hash(await readFile(fileURLToPath(import.meta.url))), pythonProgramHash: hash(PYTHON),
      jobs: jobs.map((j) => ({ id: j.id, hash: hash(j) })) };
    if (!ledger) { ledger = { config, binding: hash(config), attempts: [] }; await atomicJson(path, ledger); }
    verifyProbe(core, ledger, config, jobs);
    const dispatch = async (job) => {
      if (!credentials || stopped) fail('dispatch_not_authorized');
      checkCredentialExpiry(credentials);
      if (hash(core.sourceFiles) !== hash(await sourceManifest())) fail('source_changed_before_dispatch');
      if (hash(countParts(sourceParts(job.sourceJob), options)) !== hash(job.counts)) fail('tokenizer_changed_before_dispatch');
      active = new AbortController();
      try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${credentials.account}/ai/run/${MODEL.id}`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.any([active.signal, AbortSignal.timeout(POLICY.timeoutMs)]),
          headers: { Authorization: `Bearer ${credentials.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(job.payload),
        });
        return { status: response.status, text: await responseText(response) };
      } finally { active = null; }
    };
    const result = await runProbe(core, fixtures, jobs, ledger, { persist: (l) => atomicJson(path, l), dispatch,
      maxNewCalls: options.maxNewCalls, stopped: () => stopped,
      beforeReserve: () => checkCredentialExpiry(credentials),
      redact: (text) => credentials ? text.replaceAll(credentials.token, '[REDACTED]').replaceAll(credentials.account, '[REDACTED]') : text });
    const report = { scope: 'Two exact V6 contexts; GPT-OSS120B low reasoning with1024 output. No injected state or physical watch. Not a statistical model ranking.',
      humanReview: 'pending', binding: ledger.binding, ...result, accountedNeurons: spent(ledger), maxNeurons: POLICY.maxNeurons,
      baselines: fixtures.map(({ actor, beforeHash, baselineOutput, baselineApplication }) => ({ actor, beforeHash, baselineOutput, baselineApplication })),
      rows: ledger.attempts.map((r) => ({ id: r.id, actor: r.job.actor, state: r.state, usage: r.response?.usage ?? null,
        output: r.receipt?.output ?? null, validation: r.validation ?? null, error: r.errorCode ?? r.receipt?.code ?? null,
        accountedNeurons: r.accountedNeurons, latencyMs: r.latencyMs ?? null })) };
    await atomicJson(join(directory, 'report.json'), report);
    console.log(JSON.stringify({ report: join(directory, 'report.json'), ...result, accountedNeurons: spent(ledger), humanReview: 'pending' }, null, 2));
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); await lock.close(); await unlink(lockPath); }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.python ??= process.env.SOCIETY_TOKEN_PYTHON;
  options.cache ??= process.env.TIKTOKEN_CACHE_DIR;
  const core = await loadCore();
  try {
    const reference = JSON.parse(await readFile(REFERENCE, 'utf8')), fixtures = await prepareCases(core, reference);
    const jobs = fixtures.map((f) => probeJob(f, countParts(sourceParts(f.sourceJob), options)));
    if (!options.live) {
      console.log(JSON.stringify({ mode: 'offline_plan', apiCalls: 0, credentialReads: 0, policy: POLICY, model: MODEL,
        referenceHash: hash(reference), jobs: jobs.map((j) => ({ id: j.id, actor: j.actor, beforeHash: j.beforeHash,
          counts: j.counts.parts.map(({ label, tokens, bytes, sha256 }) => ({ label, tokens, bytes, sha256 })),
          reservedInputTokens: j.reservedInputTokens, reservedNeurons: j.reservedNeurons })),
        sumMaximumReservations: jobs.reduce((sum, j) => sum + j.reservedNeurons, 0),
        bothCallsGuaranteedWithinCap: jobs.reduce((sum, j) => sum + j.reservedNeurons, 0) <= POLICY.maxNeurons }, null, 2)); return;
    }
    await live(core, fixtures, jobs, reference, options, process.env);
  } finally { await core.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof BenchError ? error.code : 'oss_probe_failed' })); process.exitCode = 1;
});
