#!/usr/bin/env node
// One explicitly authorized compatibility experiment, never production.
// Exact frozen V7 L context; only schema refinement and output1024->512 differ.
// Offline by default. One stable attempt ID, cap230; unknown IDs never retry.
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadFrozenV7Core, prepareCases, validateCandidate, hash } from './benchmark-society-frozen-v7.mjs';
import { countParts, sourceParts, validateCounts } from './benchmark-society-oss-probe.mjs';
import { atomicJson, responseText } from './benchmark-society-models.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'docs/research/model-society-v7-schema-probe-2026-09-08');
const OAUTH = '/Users/alejandrotreny/Library/Preferences/.wrangler/config/default.toml';
const ACCOUNT = '90441852398a77b41ec7859b372d5db5';
export const POLICY = Object.freeze({ maxCalls: 1, maxNeurons: 230, maxOutputTokens: 512,
  templateTokens: 2048, timeoutMs: 45_000, model: '@cf/openai/gpt-oss-120b', inputRate: 31818, outputRate: 68182 });
const fail = code => { const error = new Error(code); error.probeCode = code; throw error; };
const integer = n => Number.isSafeInteger(n) && n >= 0;
const cost = (input, output) => Math.ceil((input * POLICY.inputRate + output * POLICY.outputRate) / 1e6);

/** Candidate only: no change to producer, validator, stored jobs or effects.
 * Complete disjoint alternatives avoid Zod4.4.3's lost unknown-key errors in
 * intersections with a permissive partial branch. Only $defs refs work there.
 */
export function refineDealSchema(schema) {
  if (!schema.properties?.deal) return structuredClone(schema);
  const base = structuredClone(schema), definitions = { ...base.$defs }, references = {};
  for (const [key, value] of Object.entries(base.properties)) {
    const name = `choice_${key}`;
    if (Object.hasOwn(definitions, name)) fail('candidate_definition_collision');
    definitions[name] = value; references[key] = { $ref: `#/$defs/${name}` };
  }
  const withoutDeal = { ...references }; delete withoutDeal.deal;
  const message = base.properties.message;
  const openMessage = { ...message, properties: { ...message.properties, close: { const: false } },
    required: [...new Set([...(message.required ?? []), 'close'])] };
  const branch = (properties, required) => ({ type: 'object', properties,
    additionalProperties: false, minProperties: base.minProperties ?? 1, required });
  return { ...base, $defs: definitions, properties: { ...references, message }, anyOf: [
    branch(withoutDeal, base.required ?? []),
    branch({ ...references, message: openMessage }, [...new Set([...(base.required ?? []), 'deal', 'message'])]),
  ] };
}

export function jobFor(fixture, counts) {
  const source = fixture.sourceJob, schema = refineDealSchema(source.job.outputContract.jsonSchema);
  const parts = sourceParts(source); parts[2].text = JSON.stringify(schema);
  const inputTokens = validateCounts(parts, counts) + POLICY.templateTokens;
  const payload = { messages: structuredClone(source.payload.messages), temperature: source.payload.temperature,
    seed: source.payload.seed, stream: false, reasoning_effort: 'low', max_completion_tokens: POLICY.maxOutputTokens,
    response_format: { type: 'json_schema', json_schema: { name: 'society_turn', strict: true, schema } } };
  const job = { id: `v7-schema-compat:L:${source.id}`, actor: 'L', beforeHash: fixture.beforeHash,
    sourceJob: source, counts, payload, reservedInputTokens: inputTokens, reservedNeurons: cost(inputTokens, POLICY.maxOutputTokens) };
  if (source.actor !== 'L' || source.stage !== 'initial' || source.index !== 11 || job.reservedNeurons > POLICY.maxNeurons
    || hash(payload.messages) !== hash(source.payload.messages)) fail('source_case_or_budget');
  return job;
}

export function receipt(response, job) {
  const usage = response?.usage, reasoning = usage?.completion_tokens_details?.reasoning_tokens;
  const complete = integer(usage?.prompt_tokens) && integer(usage?.completion_tokens) && integer(usage?.total_tokens)
    && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens
    && (reasoning === undefined || integer(reasoning) && reasoning <= usage.completion_tokens);
  const reported = Number.isFinite(usage?.neurons) && usage.neurons >= 0 ? Math.ceil(usage.neurons) : 0;
  const accountedNeurons = complete ? Math.max(cost(usage.prompt_tokens, usage.completion_tokens), reported) : job.reservedNeurons;
  const exceedsReservation = complete && (usage.prompt_tokens > job.reservedInputTokens
    || usage.completion_tokens > POLICY.maxOutputTokens || accountedNeurons > job.reservedNeurons);
  let output = null, code = null;
  try { output = JSON.parse(response.choices[0].message.content); } catch { code = 'invalid_structured_output'; }
  if (response?.choices?.length !== 1 || response.choices[0].finish_reason !== 'stop') code = 'nonfinal_or_truncated';
  if (exceedsReservation) code = 'provider_exceeded_reservation';
  return { complete, accountedNeurons, exceedsReservation, output, code };
}

function validate(core, fixture, job, received) {
  if (received.code) return { ok: false, code: received.code };
  if (!z.fromJSONSchema(job.payload.response_format.json_schema.schema).safeParse(received.output).success)
    return { ok: false, code: 'candidate_schema_violation' };
  return validateCandidate(core, fixture, received.output);
}

export async function runOnce(core, fixture, job, ledger, { persist, dispatch, beforeReserve = async () => {}, maxNewCalls = 1 }) {
  if (![0, 1].includes(maxNewCalls) || ledger.attempts.length > 1) fail('call_limit');
  const existing = ledger.attempts[0];
  if (existing) {
    if (existing.id !== job.id || hash(existing.job) !== hash(job)
      || !['reserved', 'completed', 'failed', 'unknown'].includes(existing.state)) fail('existing_job_changed');
    if (existing.accountedNeurons !== (existing.state === 'completed' ? receipt(existing.response, job).accountedNeurons : job.reservedNeurons))
      fail('saved_accounting_changed');
    if (existing.state === 'completed') {
      const envelope = JSON.parse(existing.rawResponse);
      if (envelope.success !== true || hash(envelope.result) !== hash(existing.response)
        || hash(receipt(existing.response, job)) !== hash(existing.receipt)) fail('saved_receipt_changed');
      const checked = validate(core, fixture, job, existing.receipt);
      if (existing.validation && hash(existing.validation) !== hash(checked)) fail('saved_validation_changed');
      if (!existing.validation) { existing.validation = checked; await persist(ledger); }
    }
    return { newCalls: 0, state: existing.state, accountedNeurons: existing.accountedNeurons };
  }
  if (!maxNewCalls) return { newCalls: 0, state: 'offline', accountedNeurons: 0 };
  await beforeReserve();
  const row = { id: job.id, job, state: 'reserved', accountedNeurons: job.reservedNeurons, startedAt: new Date().toISOString() };
  ledger.attempts.push(row); await persist(ledger);
  const started = performance.now();
  try {
    const response = await dispatch(job);
    row.httpStatus = response.status; row.rawResponse = response.text;
    if (response.status < 200 || response.status >= 300) { row.state = 'failed'; row.code = `http_${response.status}`; }
    else {
      const envelope = JSON.parse(response.text);
      if (envelope.success !== true || !envelope.result) fail('invalid_provider_envelope');
      row.response = envelope.result; row.receipt = receipt(row.response, job); row.accountedNeurons = row.receipt.accountedNeurons;
      row.state = 'completed';
    }
  } catch (error) { row.state = 'unknown'; row.code = error.probeCode ?? 'transport_or_envelope_unknown'; }
  row.latencyMs = Math.round(performance.now() - started); row.finishedAt = new Date().toISOString();
  await persist(ledger); // Original response durable before validation on a clone.
  if (row.state === 'completed') { row.validation = validate(core, fixture, job, row.receipt); await persist(ledger); }
  return { newCalls: 1, state: row.state, accountedNeurons: row.accountedNeurons };
}

export function checkOAuth(text, nowMs) {
  const token = text.match(/^oauth_token\s*=\s*"([^"\n]+)"/m)?.[1];
  const expires = Date.parse(text.match(/^expiration_time\s*=\s*"([^"\n]+)"/m)?.[1] ?? '');
  if (!token || !Number.isFinite(expires) || expires - nowMs < 120_000) fail('oauth_missing_or_expiring');
  return { token, expires };
}

export function parseArgs(args) {
  const result = { live: false, maxNewCalls: 1, python: null, cache: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--live' && !result.live) result.live = true;
    else if (arg === '--max-new-calls' && /^[01]$/.test(args[i + 1] ?? '')) result.maxNewCalls = Number(args[++i]);
    else if (['--token-python', '--token-cache'].includes(arg) && args[i + 1]) result[arg === '--token-python' ? 'python' : 'cache'] = args[++i];
    else fail('invalid_argument');
  }
  if (!result.python || !result.cache) fail('offline_tokenizer_paths_required');
  return result;
}

async function sourceManifest() {
  return Promise.all(['scripts/benchmark-society-v7-schema-probe.mjs', 'scripts/benchmark-society-frozen-v7.mjs',
    'scripts/benchmark-society-oss-probe.mjs', 'scripts/benchmark-society-models.mjs', 'pnpm-lock.yaml']
    .map(async path => ({ path, sha256: hash(await readFile(join(ROOT, path))) })));
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args), sources = await sourceManifest();
  const core = await loadFrozenV7Core(); let lock;
  try {
    const fixture = (await prepareCases(core)).find(item => item.actor === 'L');
    const parts = sourceParts(fixture.sourceJob); parts[2].text = JSON.stringify(refineDealSchema(fixture.sourceJob.job.outputContract.jsonSchema));
    const counts = countParts(parts, { python: options.python, cache: options.cache }), job = jobFor(fixture, counts);
    const config = { policy: POLICY, accountId: ACCOUNT, sources, frozen: core.frozenProvenance,
      intervention: 'Exact V7 L context. Complete conditional schema branches; output cap512 instead of1024. No other instruction or state change.' };
    if (!options.live) { console.log(JSON.stringify({ mode: 'offline', reservedNeurons: job.reservedNeurons, reservedInputTokens: job.reservedInputTokens,
      maxOutputTokens: POLICY.maxOutputTokens, sourceJob: job.sourceJob.id, outputDirectory: OUTPUT })); return; }
    await mkdir(OUTPUT, { recursive: true }); lock = await open(join(OUTPUT, '.probe.lock'), 'wx');
    const path = join(OUTPUT, 'ledger.json'); let ledger;
    try { ledger = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; ledger = { config, binding: hash(config), attempts: [] }; }
    if (ledger.binding !== hash(config) || hash(ledger.config) !== hash(config)) fail('ledger_config_changed');
    let auth;
    const result = await runOnce(core, fixture, job, ledger, {
      maxNewCalls: options.maxNewCalls, persist: value => atomicJson(path, value),
      beforeReserve: async () => { await core.verifyFrozenSources(); if (hash(await sourceManifest()) !== hash(sources)) fail('probe_source_changed');
        auth = checkOAuth(await readFile(OAUTH, 'utf8'), Date.now()); },
      dispatch: async () => {
        if (auth.expires - Date.now() < 120_000) fail('oauth_expiring_after_reserve');
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${POLICY.model}`, {
          method: 'POST', headers: { authorization: `Bearer ${auth.token}`, 'content-type': 'application/json' },
          body: JSON.stringify(job.payload), signal: AbortSignal.timeout(POLICY.timeoutMs) });
        const text = await responseText(response); return { status: response.status, text: text.replaceAll(auth.token, '[redacted]') };
      },
    });
    await atomicJson(join(OUTPUT, 'report.json'), { ...result, validation: ledger.attempts[0]?.validation ?? null,
      warning: 'One format compatibility sample. It does not demonstrate conditional enforcement for every possible output, negotiation or sustained autonomy.' });
    console.log(JSON.stringify(result));
  } finally { await core.close(); if (lock) { await lock.close(); await unlink(join(OUTPUT, '.probe.lock')); } }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error.probeCode ?? 'probe_failed_without_new_verified_result'); process.exitCode = 1;
});
