#!/usr/bin/env node
/* Experimental joint intervention: stronger separate SYSTEM, required initial
 * project and strict:true; Gemma no-thinking768 vs GLM thinking1536.
 * This does not isolate prompt, schema, thinking or model effects.
 * Hard local cap300; four calls fit only if complete usage releases reservation.
 * Default: offline plan, no environment credentials, network or output writes.
 * --self-test: local fake providers only.
 * --live --out /absolute/new-directory --max-new-calls 1: explicitly staged.
 * Resume the SAME directory; reserved/failed/unknown IDs are never dispatched again.
 * No production state. Replay each V4 prefix with maxNewCalls:0, clone the exact
 * pre-decision state, and apply each candidate separately. No physical watch.
 * Official model schemas checked 2026-09-08:
 * https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
 * https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
 * Both publish enable_thinking (default true), max_completion_tokens and the
 * response_format.json_schema {name,schema,strict} wrapper. strict:true with this
 * optional nested schema is an empirical question; local validation is mandatory.
 * No separate thinking-token budget is assumed. Complete usage includes output
 * reasoning once. Prices: https://developers.cloudflare.com/workers-ai/platform/pricing/
 */
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, BenchError, responseText } from './benchmark-society-models.mjs';
import { loadCore, sourceManifest, verifyLedger as verifyV4, runFixture, buildJob,
  newLedger as newV4Ledger, POLICY as V4, MODEL as QWEN } from './benchmark-society-runtime-v4.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = join(ROOT, 'docs/research/model-society-v4-2026-09-08/ledger.json');
const SYSTEM_PATH = join(ROOT, 'docs/research/society-prompt-candidate-2026-09-08.txt');
const SYSTEM = (await readFile(SYSTEM_PATH, 'utf8')).trim();
export const POLICY = Object.freeze({ version: 1, maxCalls: 4, maxNeurons: 300, maxPromptBytes: 12000,
  templateTokens: 2048, maxOutputTokens: 1536, timeoutMs: 45000, pricesCheckedOn: '2026-09-08' });
export const MODELS = Object.freeze([
  Object.freeze({ key: 'gemma', id: '@cf/google/gemma-4-26b-a4b-it', inputRate: 9091, outputRate: 27273, thinking: false, maxOutputTokens: 768 }),
  Object.freeze({ key: 'glm', id: '@cf/zai-org/glm-4.7-flash', inputRate: 5500, outputRate: 36400, thinking: true, maxOutputTokens: 1536 }),
]);
const CASES = [{ actor: 'G', index: 6 }, { actor: 'B', index: 1 }];
const fail = (code) => { throw new BenchError(code); };
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const hash = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value
  : JSON.stringify(value, (_key, v) => v instanceof Map ? { $map: [...v] } : v)).digest('hex');
const sceneHash = (scene) => hash({ state: scene.state, world: scene.world });
const spent = (ledger) => ledger.attempts.reduce((total, row) => total + row.accountedNeurons, 0);
const neurons = (model, input, output) => Math.ceil((input * model.inputRate + output * model.outputRate) / 1e6);

export function alternativeJob(sourceJob, model, beforeHash) {
  if (sourceJob.job.maxOutputTokens !== V4.maxOutputTokens || sourceJob.payload.max_tokens !== V4.maxOutputTokens) fail('source_output_cap');
  const split = sourceJob.job.prompt.user.lastIndexOf('\n{');
  if (split < 0) fail('missing_source_context');
  const contextText = sourceJob.job.prompt.user.slice(split + 1), context = JSON.parse(contextText);
  const schema = structuredClone(sourceJob.job.outputContract.jsonSchema);
  const requiresProject = context.ownProject === null;
  if (requiresProject) schema.required = [...new Set([...(schema.required ?? []), 'project'])];
  const payload = {
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: contextText }],
    temperature: sourceJob.payload.temperature, seed: sourceJob.payload.seed, stream: false,
    max_completion_tokens: model.maxOutputTokens, chat_template_kwargs: { enable_thinking: model.thinking },
    response_format: { type: 'json_schema', json_schema: { name: 'society_turn', schema, strict: true } },
  };
  const promptBytes = Buffer.byteLength(JSON.stringify({ messages: payload.messages, response_format: payload.response_format }), 'utf8');
  if (promptBytes > POLICY.maxPromptBytes) fail('comparison_context_overflow');
  const reservedInputTokens = promptBytes + POLICY.templateTokens;
  return { id: `grounded-v1:${model.key}:${sourceJob.id}`, actor: sourceJob.actor, model, sourceJob,
    beforeHash, requiresProject, payload, promptBytes, reservedInputTokens, reservedNeurons: neurons(model, reservedInputTokens, model.maxOutputTokens) };
}

export async function prepareCases(core, reference) {
  if (hash(reference.config?.policy) !== hash(V4) || hash(reference.config?.model) !== hash(QWEN)
    || hash(reference.config?.source) !== hash(core.sourceFiles)) fail('v4_source_changed');
  verifyV4(reference, reference.config, core);
  const originalHash = hash(reference), cases = [];
  for (const selection of CASES) {
    const position = reference.entries.findIndex((row) => row.kind === 'cognition' && row.job.actor === selection.actor
      && row.job.stage === 'initial' && row.job.index === selection.index);
    const target = reference.entries[position];
    if (position < 0 || target.state !== 'completed' || !target.application) fail('missing_completed_v4_case');
    const prefix = structuredClone({ ...reference, entries: reference.entries.slice(0, position) }), prefixHash = hash(prefix);
    const scene = await runFixture(core, prefix, { maxNewCalls: 0,
      dispatch: () => fail('prefix_must_not_dispatch'), persist: () => fail('prefix_must_not_write') });
    if (scene.newCalls !== 0 || scene.consumedEntries !== position || scene.halted !== 'call_limit_reached'
      || prefixHash !== hash(prefix)) fail('prefix_replay_incomplete');
    const rebuilt = buildJob(core, scene, selection.actor, 'initial', selection.index);
    if (hash(rebuilt) !== hash(target.job)) fail('exact_v4_job_changed');
    cases.push({ actor: selection.actor, scene, beforeHash: sceneHash(scene), referenceJob: target.job,
      qwenOutput: target.receipt.output, qwenApplication: target.application });
  }
  if (hash(reference) !== originalHash) fail('reference_mutated');
  return cases;
}

export function settle(job, usage) {
  const reasoning = usage?.completion_tokens_details?.reasoning_tokens;
  const complete = plain(usage) && integer(usage.prompt_tokens) && integer(usage.completion_tokens)
    && integer(usage.total_tokens) && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens
    && (reasoning === undefined || integer(reasoning) && reasoning <= usage.completion_tokens);
  const estimate = complete ? neurons(job.model, usage.prompt_tokens, usage.completion_tokens) : null;
  const exceedsReservation = complete && (usage.prompt_tokens > job.reservedInputTokens
    || usage.completion_tokens > job.model.maxOutputTokens || estimate > job.reservedNeurons);
  return { complete, exceedsReservation, estimatedNeuronsFromReportedTokens: estimate,
    accountedNeurons: complete ? (exceedsReservation ? Math.max(estimate, job.reservedNeurons) : estimate) : job.reservedNeurons };
}

function receipt(core, job, response) {
  const accounting = settle(job, response?.usage), content = response?.choices?.[0]?.message?.content ?? response?.response;
  let output = null, code = null;
  try { output = core.parseStructuredPayload(content); } catch { code = 'invalid_structured_output'; }
  if (output === undefined) { output = null; code = 'missing_response'; }
  if (response?.choices?.[0]?.finish_reason === 'length') code = 'output_truncated';
  if (Array.isArray(response?.choices) && response.choices.length !== 1) code = 'completion_count';
  if (accounting.exceedsReservation) code = 'provider_exceeded_reservation';
  return { ...accounting, output, code };
}

export function validateCandidate(core, fixture, job, received) {
  if (received.code) return { ok: false, code: received.code };
  if (job.requiresProject && !received.output?.project) return { ok: false, code: 'missing_initial_project' };
  const grammar = z.fromJSONSchema(job.payload.response_format.json_schema.schema).safeParse(received.output);
  if (!grammar.success) return { ok: false, code: 'experimental_schema_violation',
    issues: grammar.error.issues.slice(0, 6).map(({ path, message }) => ({ path, message })) };
  if (sceneHash(fixture.scene) !== job.beforeHash) fail('comparison_scene_changed');
  const scene = structuredClone(fixture.scene), before = sceneHash(scene);
  scene.state = core.markSocietyAttempt(scene.state, job.actor, job.sourceJob.nowMs);
  const result = core.applySocietyTurn(scene.state, scene.world, job.sourceJob.turn, received.output,
    { nowMs: job.sourceJob.nowMs + 1, generation: V4.generation });
  if (!core.parseSocietyState(result.state).ok) fail('candidate_invalid_state');
  if (result.ok) {
    const replay = core.applySocietyTurn(result.state, result.world, job.sourceJob.turn, received.output,
      { nowMs: job.sourceJob.nowMs + 2, generation: V4.generation });
    if (replay.code !== 'already_applied' || sceneHash(replay) !== sceneHash(result)) fail('candidate_not_idempotent');
  }
  if (sceneHash(fixture.scene) !== before) fail('candidate_mutated_reference');
  return { ok: result.ok, code: result.code, afterHash: sceneHash(result),
    project: result.state.minds[job.actor].project,
    conversations: result.state.conversations.filter((c) => c.participants.includes(job.actor)),
    offers: result.state.offers.filter((o) => o.proposer === job.actor || o.counterpart === job.actor),
    agreements: result.state.agreements.filter((a) => a.terms.kind === 'work'
      ? a.terms.worker === job.actor || a.terms.payer === job.actor : a.terms.from === job.actor || a.terms.to === job.actor),
    balanceChanges: core.RESIDENTS.filter(({ id }) => scene.world.bodies[id].cells !== result.world.bodies[id].cells)
      .map(({ id }) => ({ actor: id, before: scene.world.bodies[id].cells, after: result.world.bodies[id].cells })) };
}

export function verifyComparison(core, ledger, config, jobs) {
  if (!plain(ledger) || ledger.binding !== hash(config) || hash(ledger.config) !== hash(config) || !Array.isArray(ledger.attempts)) fail('comparison_binding');
  const seen = new Set();
  for (const row of ledger.attempts) {
    const job = jobs.find((j) => j.id === row.id);
    if (!job || seen.has(row.id) || hash(job) !== hash(row.job) || !['reserved', 'completed', 'failed', 'timeout'].includes(row.state)) fail('comparison_row');
    seen.add(row.id);
    const checked = row.state === 'completed' ? receipt(core, job, row.response) : settle(job, null);
    if (row.accountedNeurons !== checked.accountedNeurons) fail('comparison_accounting');
    if (checked.exceedsReservation) fail('provider_exceeded_reservation_manual_review');
    if (row.state === 'completed') {
      let original; try { original = JSON.parse(row.rawResponse); } catch { fail('comparison_raw_response'); }
      if (original.success !== true || hash(original.result) !== hash(row.response)) fail('comparison_raw_response');
      if (hash(checked) !== hash(row.receipt)) fail('comparison_receipt');
    }
    if (row.state !== 'completed' && row.validation) fail('unknown_result_applied');
  }
  if (seen.size > POLICY.maxCalls || spent(ledger) > POLICY.maxNeurons) fail('comparison_budget');
}

export async function runComparison(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls = 1,
  stopped = () => false, redact = (value) => value } = {}) {
  if (!integer(maxNewCalls) || maxNewCalls > POLICY.maxCalls) fail('invalid_call_limit');
  let newCalls = 0, halted = null;
  for (const job of jobs) {
    const fixture = fixtures.find((f) => f.actor === job.actor), prior = ledger.attempts.find((r) => r.id === job.id);
    if (prior) {
      if (prior.state === 'completed') {
        const validation = validateCandidate(core, fixture, job, prior.receipt);
        if (prior.validation && hash(prior.validation) !== hash(validation)) fail('comparison_replay_mismatch');
        if (!prior.validation) { prior.validation = validation; await persist(ledger); }
      }
      continue; // Every reserved/unknown/failed/completed ID is permanently spent.
    }
    if (stopped() || newCalls >= maxNewCalls) { halted = stopped() ? 'interrupted' : 'call_limit_reached'; break; }
    if (ledger.attempts.length >= POLICY.maxCalls || spent(ledger) + job.reservedNeurons > POLICY.maxNeurons) { halted = 'budget_exhausted'; break; }
    const row = { id: job.id, job, state: 'reserved', startedAt: new Date().toISOString(), accountedNeurons: job.reservedNeurons };
    ledger.attempts.push(row); await persist(ledger); // Durable reservation before dispatch.
    const start = performance.now(); newCalls += 1;
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
      row.state = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'failed';
      row.errorCode = error instanceof BenchError ? error.code : 'network_or_invalid_envelope';
    }
    row.latencyMs = Math.round(performance.now() - start); row.finishedAt = new Date().toISOString();
    await persist(ledger); // Preserve original response before local application.
    if (row.state === 'completed') { row.validation = validateCandidate(core, fixture, job, row.receipt); await persist(ledger); }
    if (row.state !== 'completed' || row.receipt.exceedsReservation) { halted = row.errorCode ?? row.receipt.code; break; }
  }
  return { newCalls, halted };
}

export function parseArgs(args) {
  const options = { live: false, selfTest: false, out: null, maxNewCalls: 1 }; let limited = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live' && !options.live) options.live = true;
    else if (args[i] === '--self-test' && !options.selfTest) options.selfTest = true;
    else if (args[i] === '--out' && options.out === null && args[i + 1]) options.out = args[++i];
    else if (args[i] === '--max-new-calls' && !limited && /^\d+$/.test(args[i + 1] ?? '')) {
      options.maxNewCalls = Number(args[++i]); limited = true;
      if (!integer(options.maxNewCalls) || options.maxNewCalls > POLICY.maxCalls) fail('invalid_call_limit');
    } else fail('invalid_arguments');
  }
  if (options.live && options.selfTest || options.out !== null && (!options.live || !isAbsolute(options.out))
    || options.live && !options.out || limited && !options.live) fail('live_requires_absolute_out');
  return options;
}

export function credentialsFor(options, env) {
  if (!options.live || options.maxNewCalls === 0) return null;
  const account = env.CF_ACCOUNT_ID, token = env.CF_API_TOKEN;
  if (!/^[a-f0-9]{32}$/i.test(account ?? '') || !token || /\s/.test(token)) fail('explicit_credentials_required');
  return { account, token };
}

function summary(ledger, fixtures, result) {
  return { scope: 'Joint intervention: explicit system, mandatory initial purpose, strict schema, and configured thinking/output. Matched V4 contexts; no production mutation or physical watch. Not a factorial comparison or model ranking.',
    humanReview: 'pending', binding: ledger.binding, ...result, attempts: ledger.attempts.length, accountedNeurons: spent(ledger), maxNeurons: POLICY.maxNeurons,
    baselines: fixtures.map((f) => ({ actor: f.actor, beforeHash: f.beforeHash, qwenOutput: f.qwenOutput, qwenApplication: f.qwenApplication })),
    rows: ledger.attempts.map((r) => ({ id: r.id, actor: r.job.actor, model: r.job.model.id, state: r.state,
      usage: r.response?.usage ?? null, output: r.receipt?.output ?? null, validation: r.validation ?? null,
      error: r.errorCode ?? r.receipt?.code ?? null, accountedNeurons: r.accountedNeurons, latencyMs: r.latencyMs ?? null })) };
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
    const config = { policy: POLICY, models: MODELS, accountHash: credentials ? hash(credentials.account) : ledger.config.accountHash,
      source: core.sourceFiles, referenceHash: hash(reference), instructionHash: hash(SYSTEM), scriptHash: hash(await readFile(fileURLToPath(import.meta.url))),
      jobs: jobs.map((job) => ({ id: job.id, hash: hash(job) })) };
    if (!ledger) { ledger = { config, binding: hash(config), attempts: [] }; await atomicJson(path, ledger); }
    verifyComparison(core, ledger, config, jobs);
    const dispatch = async (job) => {
      if (!credentials || stopped) fail('dispatch_not_authorized');
      if (hash(core.sourceFiles) !== hash(await sourceManifest())) fail('source_changed_before_dispatch');
      active = new AbortController();
      try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${credentials.account}/ai/run/${job.model.id}`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.any([active.signal, AbortSignal.timeout(POLICY.timeoutMs)]),
          headers: { Authorization: `Bearer ${credentials.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(job.payload),
        });
        return { status: response.status, text: await responseText(response) };
      } finally { active = null; }
    };
    const result = await runComparison(core, fixtures, jobs, ledger, { persist: (l) => atomicJson(path, l), dispatch,
      maxNewCalls: options.maxNewCalls, stopped: () => stopped,
      redact: (value) => credentials ? value.replaceAll(credentials.token, '[REDACTED]').replaceAll(credentials.account, '[REDACTED]') : value });
    const report = summary(ledger, fixtures, result); await atomicJson(join(directory, 'report.json'), report);
    console.log(JSON.stringify({ report: join(directory, 'report.json'), newCalls: result.newCalls, halted: result.halted,
      attempts: ledger.attempts.length, accountedNeurons: spent(ledger), humanReview: 'pending' }, null, 2));
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); await lock.close(); await unlink(lockPath); }
}

export async function selfTest(core) {
  const reference = newV4Ledger({ policy: V4, model: QWEN, accountHash: 'offline', source: core.sourceFiles });
  const envelope = (output, usage = { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 }) => ({ status: 200,
    text: JSON.stringify({ success: true, result: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }], usage } }) });
  await runFixture(core, reference, { maxNewCalls: 7, dispatch: async (job) => envelope(job.actor === 'D'
    ? { message: { to: 'G', text: 'Gita, can we discuss a hull inspection?' } }
    : { reflection: { text: 'I am considering my own purpose.', refs: [job.turn.evidenceIds[0]] } }) });
  const untouched = hash(reference), fixtures = await prepareCases(core, reference);
  assert.equal(hash(reference), untouched); assert.equal(fixtures.find((f) => f.actor === 'B').scene.state.conversations.length, 0);
  assert.equal(fixtures.find((f) => f.actor === 'G').scene.state.conversations[0].nextSpeaker, 'G');
  const jobs = fixtures.flatMap((f) => MODELS.map((model) => alternativeJob(f.referenceJob, model, f.beforeHash)));
  assert.equal(jobs.length, 4); assert.ok(jobs.every((j) => j.reservedNeurons <= POLICY.maxNeurons));
  assert.ok(jobs.reduce((n, j) => n + j.reservedNeurons, 0) > POLICY.maxNeurons);
  for (const job of jobs) {
    assert.equal(job.payload.messages[1].content, job.sourceJob.job.prompt.user.slice(job.sourceJob.job.prompt.user.lastIndexOf('\n{') + 1));
    assert.equal(job.payload.messages[0].content, SYSTEM);
    assert.equal(job.payload.chat_template_kwargs.enable_thinking, job.model.thinking);
    assert.equal(job.payload.response_format.json_schema.strict, true);
    assert.deepEqual(job.payload.response_format.json_schema.schema.properties, job.sourceJob.job.outputContract.jsonSchema.properties);
    assert.deepEqual(job.payload.response_format.json_schema.schema.required, ['project']);
    assert.equal(job.payload.max_completion_tokens, job.model.maxOutputTokens); assert.equal(job.payload.max_tokens, undefined);
    assert.equal(job.reservedInputTokens, job.promptBytes + 2048);
  }
  let secretReads = 0; const env = new Proxy({}, { get() { secretReads += 1; throw new Error('Credential access forbidden'); } });
  assert.equal(credentialsFor(parseArgs([]), env), null);
  assert.equal(credentialsFor(parseArgs(['--live', '--out', '/tmp/offline', '--max-new-calls', '0']), env), null);
  assert.equal(secretReads, 0);
  const config = { test: true }, ledger = { config, binding: hash(config), attempts: [] }; let persisted, calls = 0;
  const persist = async (value) => { persisted = structuredClone(value); };
  const dispatch = async (job) => {
    calls += 1; assert.equal(persisted.attempts.at(-1).state, 'reserved');
    assert.equal(persisted.attempts.at(-1).accountedNeurons, job.reservedNeurons);
    return envelope(job.actor === 'B'
      ? { project: { mode: 'replace', goal: 'Ask to contribute to a shared decision.', why: 'My inventory knowledge could help.', visibility: 'private', steps: [] },
        message: { to: 'H', text: 'Halim, could we look at the next stores decision together?' } }
      : { project: { mode: 'replace', goal: 'Agree a hull inspection with Dima.', why: 'An inspection would support my own responsibility.', visibility: 'public', steps: [] },
        message: { to: 'D', text: 'I can inspect the hull before we decide what work is needed.', close: false },
        offer: { expiresInWatches: 1, terms: { kind: 'work', worker: 'G', payer: 'G', cells: 0, verb: 'inspect', room: 'workshops', units: 1, dueWatch: 401 } } });
  };
  const first = await runComparison(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls: 1 });
  assert.equal(first.newCalls, 1); assert.equal(ledger.attempts.length, 1);
  const resumed = await runComparison(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls: 3 });
  assert.equal(resumed.newCalls, 3); assert.equal(calls, 4); assert.equal(ledger.attempts[2].validation.code, 'applied');
  assert.equal(ledger.attempts[0].validation.code, 'invalid_offer_parties');
  assert.deepEqual(ledger.attempts[0].validation.balanceChanges, []);
  verifyComparison(core, ledger, config, jobs);
  const saved = hash(ledger);
  await runComparison(core, fixtures, jobs, ledger, { persist, dispatch: () => fail('duplicate_dispatch'), maxNewCalls: 0 });
  assert.equal(hash(ledger), saved); assert.equal(hash(reference), untouched);
  const crash = structuredClone(ledger); delete crash.attempts[0].validation;
  await runComparison(core, fixtures, jobs, crash, { persist, dispatch: () => fail('crash_retried'), maxNewCalls: 0 });
  assert.deepEqual(crash.attempts[0].validation, ledger.attempts[0].validation);
  const unknown = { config, binding: hash(config), attempts: [{ id: jobs[0].id, job: jobs[0], state: 'reserved', accountedNeurons: jobs[0].reservedNeurons }] };
  verifyComparison(core, unknown, config, jobs);
  await runComparison(core, fixtures, jobs, unknown, { persist, dispatch: () => fail('unknown_retried'), maxNewCalls: 0 });
  assert.equal(unknown.attempts.length, 1); assert.equal(spent(unknown), jobs[0].reservedNeurons);
  assert.equal(settle(jobs[0], { prompt_tokens: 10 }).accountedNeurons, jobs[0].reservedNeurons);
  for (const job of jobs) assert.equal(settle(job, { prompt_tokens: 1, completion_tokens: job.model.maxOutputTokens + 1, total_tokens: job.model.maxOutputTokens + 2 }).exceedsReservation, true);
  const capped = { config, binding: hash(config), attempts: [] }; let unknownCalls = 0;
  const cappedResult = await runComparison(core, fixtures, jobs, capped, { persist, maxNewCalls: 4, dispatch: async () => {
    unknownCalls += 1; return envelope({ reflection: { text: 'No invented evidence.', refs: ['world:100:1'] } }, {});
  } });
  assert.equal(unknownCalls, 2); assert.equal(cappedResult.halted, 'budget_exhausted');
  assert.ok(spent(capped) <= 300);
  const missing = validateCandidate(core, fixtures[0], jobs[0], { code: null, output: { message: { to: 'D', text: 'I will consider it.' } } });
  assert.equal(missing.code, 'missing_initial_project');
  const tampered = structuredClone(ledger); tampered.attempts[0].job.payload.max_completion_tokens = 999;
  assert.throws(() => verifyComparison(core, tampered, config, jobs), /comparison_row/);
  const rawTampered = structuredClone(ledger); rawTampered.attempts[0].rawResponse = '{}';
  assert.throws(() => verifyComparison(core, rawTampered, config, jobs), /comparison_raw_response/);
  assert.throws(() => verifyComparison(core, { ...ledger, attempts: [ledger.attempts[0], ledger.attempts[0]] }, config, jobs), /comparison_row/);
  return { status: 'pass', apiCalls: 0, credentialReads: secretReads, fakeComparisonCalls: calls,
    checks: ['exact V4 prefix/job replay', 'model-specific payload and reserves', 'reserve before dispatch', 'isolated clone/domain validation',
      'mandatory initial purpose', 'per-model output budgets', '300 cap stops unknown-usage calls', 'idempotent candidate replay', 'unknown IDs never retried', 'complete usage only', 'tamper/duplicate rejection', 'offline credentials never read'] };
}

async function main() {
  const options = parseArgs(process.argv.slice(2)), core = await loadCore();
  try {
    if (options.selfTest) { console.log(JSON.stringify(await selfTest(core), null, 2)); return; }
    const reference = JSON.parse(await readFile(REFERENCE, 'utf8')), fixtures = await prepareCases(core, reference);
    const jobs = fixtures.flatMap((f) => MODELS.map((model) => alternativeJob(f.referenceJob, model, f.beforeHash)));
    if (!options.live) {
      console.log(JSON.stringify({ mode: 'offline_plan', apiCalls: 0, credentialReads: 0, policy: POLICY,
        referenceHash: hash(reference), instructionHash: hash(SYSTEM), jointIntervention: true, jobs: jobs.map((j) => ({ id: j.id, actor: j.actor, model: j.model.id, beforeHash: j.beforeHash,
          promptBytes: j.promptBytes, reservedNeurons: j.reservedNeurons })), sumMaxReservations: jobs.reduce((n, j) => n + j.reservedNeurons, 0) }, null, 2)); return;
    }
    await live(core, fixtures, jobs, reference, options, process.env);
  } finally { await core.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof BenchError ? error.code : 'comparison_failed' })); process.exitCode = 1;
});
