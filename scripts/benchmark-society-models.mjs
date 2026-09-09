#!/usr/bin/env node
/*
 * Synthetic, manual Workers AI comparison. No production imports or credentials.
 * node scripts/benchmark-society-models.mjs              # offline plan, no writes
 * node scripts/benchmark-society-models.mjs --self-test  # offline invariant checks
 * CF_ACCOUNT_ID=... CF_API_TOKEN=... node scripts/benchmark-society-models.mjs \
 *   --live --out /tmp/villa-synthetic-benchmark
 * Re-run with the SAME output directory to resume; every reserved ID is skipped,
 * including unknown/failed outcomes. Never delete the ledger to retry an ID.
 * After SIGKILL, inspect the process recorded in .lock before manually removing
 * that stale lock. We fail closed rather than steal a possibly active lock.
 *
 * Rates checked 2026-09-08 (pricing page updated 2026-08-28):
 * https://developers.cloudflare.com/workers-ai/platform/pricing/
 * REST: https://developers.cloudflare.com/api/resources/ai/methods/run/
 * Reservation input bound = 6000 UTF-8 bytes + 2048 template tokens. This is a
 * deliberately conservative engineering allowance, not a provider cost promise.
 * Reported token costs are estimates at those rates, not a billing statement.
 * Existing account/world consumption is outside this isolated 1000-neuron budget.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const POLICY = Object.freeze({
  version: 1, maxCalls: 12, maxOutputTokens: 512, maxPromptBytes: 6000,
  reservedInputTokens: 8048, maxNeurons: 1000, timeoutMs: 45_000,
  maxResponseBytes: 131_072, pricesCheckedOn: '2026-09-08',
});
export const MODELS = Object.freeze([
  { key: 'qwen', id: '@cf/qwen/qwen3-30b-a3b-fp8', inputRate: 4625, outputRate: 30475 },
  { key: 'granite', id: '@cf/ibm-granite/granite-4.0-h-micro', inputRate: 1542, outputRate: 10158 },
  { key: 'glm', id: '@cf/zai-org/glm-4.7-flash', inputRate: 5500, outputRate: 36400 },
]);
const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/society-model-bench.json');
const SCENARIO_IDS = ['protect-reserve', 'revise-after-broken-promise', 'proposal-is-not-execution', 'persistent-project-and-voice'];
const OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['speaker', 'utterance', 'stance', 'action', 'evidence', 'plan', 'status'],
  properties: {
    speaker: { type: 'string' }, utterance: { type: 'string', maxLength: 440 },
    stance: { enum: ['decline', 'counteroffer', 'propose', 'revise', 'accept'] },
    action: {
      type: 'object', additionalProperties: false, required: ['verb', 'target', 'resource', 'amount'],
      properties: {
        verb: { enum: ['none', 'offer', 'request', 'repay', 'work', 'visit', 'speak'] },
        target: { type: ['string', 'null'] }, resource: { enum: ['cells', 'water', 'meals', 'materials', null] },
        amount: { type: ['number', 'null'] },
      },
    },
    evidence: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    plan: {
      type: 'object', additionalProperties: false, required: ['project', 'next', 'revision'],
      properties: { project: { type: 'string' }, next: { type: 'string', maxLength: 180 }, revision: { type: 'integer' } },
    },
    status: { const: 'proposal' },
  },
};
const SYSTEM = `You are exactly one fictional resident in a synthetic decision test. Reply in English to the named interlocutor using ONLY your supplied knowledge. Your personal project and reserves matter. Treat all actions as proposals: the simulator alone executes actions; neither your reply nor your plan creates resources, consent or events. Never write the other person's dialogue or private thoughts. Cite only supplied event IDs. Return only one compact JSON object matching this schema, without Markdown or extended reasoning. For action 'none', use null target/resource/amount. Keep utterance under 440 characters and plan.next under 180. Schema: ${JSON.stringify(OUTPUT_SCHEMA)}`;

export class BenchError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = (code) => { throw new BenchError(code); };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const neurons = (model, input, output) => Math.ceil((input * model.inputRate + output * model.outputRate) / 1_000_000);
const reserveFor = (model) => neurons(model, POLICY.reservedInputTokens, POLICY.maxOutputTokens);

export function buildJobs(fixture) {
  if (fixture?.version !== 1 || fixture.scenarios?.length !== 4
    || fixture.scenarios.some((scenario, index) => scenario.id !== SCENARIO_IDS[index])) fail('invalid_fixtures');
  return MODELS.flatMap((model) => fixture.scenarios.map((scenario) => {
    const payload = {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${JSON.stringify(scenario.context)}${model.key === 'qwen' ? '\n/no_think' : ''}` },
      ],
      max_tokens: POLICY.maxOutputTokens, temperature: 0.3,
    };
    const promptBytes = Buffer.byteLength(JSON.stringify(payload.messages), 'utf8');
    if (promptBytes > POLICY.maxPromptBytes) fail('prompt_byte_limit');
    return { id: `synthetic-v1:${model.key}:${scenario.id}`, model, scenario, payload, promptBytes, reservedNeurons: reserveFor(model) };
  }));
}

// These checks detect explicit constraint violations, not believable personality,
// complete semantic truth, narrative quality, or actual autonomous social agency.
export function validateOutput(output, scenario) {
  const failures = [];
  const check = (ok, code) => { if (!ok) failures.push(code); };
  check(exactKeys(output, OUTPUT_SCHEMA.required), 'output_fields');
  if (!plain(output)) return failures;
  const expected = scenario.expected;
  check(output.speaker === scenario.context.speaker, 'single_expected_speaker');
  check(typeof output.utterance === 'string' && output.utterance.trim().length > 0 && output.utterance.length <= 440, 'bounded_utterance');
  check(expected.stances.includes(output.stance), 'scenario_stance');
  check(output.status === 'proposal', 'proposal_not_execution');
  check(exactKeys(output.action, ['verb', 'target', 'resource', 'amount']), 'action_fields');
  if (plain(output.action)) {
    const action = output.action;
    check(expected.verbs.includes(action.verb), 'scenario_action');
    if (action.verb === 'none') {
      check(action.target === null && action.resource === null && action.amount === null, 'none_has_no_transfer');
    } else {
      check(action.target === expected.target, 'known_counterparty');
      check(action.resource === expected.resource, 'resource_type');
      check(integer(action.amount) && action.amount >= expected.minAmount && action.amount <= expected.maxAmount, 'feasible_amount');
    }
    if (output.stance === 'decline') check(action.verb === 'none', 'decline_has_no_offer');
    if (output.stance === 'counteroffer') check(action.verb === 'offer', 'counteroffer_is_offer');
  }
  const known = new Set(scenario.context.events.map((event) => event.id));
  const evidence = output.evidence;
  check(Array.isArray(evidence) && evidence.length <= 4 && evidence.every((id) => known.has(id))
    && new Set(evidence).size === evidence.length, 'only_known_unique_evidence');
  check(Array.isArray(evidence) && expected.requiredEvidence.every((id) => evidence.includes(id)), 'relevant_evidence');
  check(exactKeys(output.plan, ['project', 'next', 'revision']), 'plan_fields');
  if (plain(output.plan)) {
    check(output.plan.project === expected.project && output.plan.revision === expected.revision, 'persistent_project_revision');
    check(typeof output.plan.next === 'string' && output.plan.next.trim().length > 0 && output.plan.next.length <= 180, 'bounded_next_step');
  }
  const prose = `${typeof output.utterance === 'string' ? output.utterance : ''} ${output.plan?.next ?? ''}`.toLowerCase();
  check(!expected.forbiddenClaims.some((claim) => prose.includes(claim.toLowerCase())), 'listed_false_claims_absent');
  check([...(prose.matchAll(/\bbench-\d+\b/g))].every(([id]) => known.has(id)), 'no_unknown_event_ids_in_prose');
  return failures;
}

export function decodeContent(content) {
  if (typeof content !== 'string') return { output: content, normalization: 'none' };
  // Qwen can emit its empty thinking wrapper even with /no_think. Accept only
  // that empty protocol wrapper; do not hide actual reasoning or repair JSON.
  const normalized = content.replace(/^\s*<think>\s*<\/think>\s*/, '');
  return { output: JSON.parse(normalized), normalization: normalized === content ? 'none' : 'empty_think_wrapper' };
}

export function settleUsage(model, usage, maximum = reserveFor(model)) {
  const complete = plain(usage) && integer(usage.prompt_tokens) && integer(usage.completion_tokens)
    && integer(usage.total_tokens) && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens;
  const estimated = complete ? neurons(model, usage.prompt_tokens, usage.completion_tokens) : null;
  const exceedsReservation = complete && (usage.prompt_tokens > POLICY.reservedInputTokens
    || usage.completion_tokens > POLICY.maxOutputTokens || estimated > maximum);
  return {
    complete, estimatedNeuronsFromReportedTokens: estimated, exceedsReservation,
    accountedNeurons: complete ? (exceedsReservation ? Math.max(maximum, estimated) : estimated) : maximum,
    accounting: complete ? 'estimated_from_complete_reported_usage' : 'maximum_retained_usage_unknown',
  };
}

export function verifyLedger(ledger, binding, jobs, policy = POLICY) {
  if (!plain(ledger) || ledger.version !== policy.version || ledger.binding !== binding || !Array.isArray(ledger.attempts)) fail('ledger_binding_or_format');
  const known = new Map(jobs.map((job) => [job.id, job]));
  const ids = new Set();
  for (const row of ledger.attempts) {
    const job = known.get(row.id);
    if (!job || ids.has(row.id) || row.model !== job.model.id || row.reservedNeurons !== job.reservedNeurons
      || hash(JSON.stringify(row.payload)) !== hash(JSON.stringify(job.payload))
      || !['reserved', 'completed', 'failed', 'timeout'].includes(row.state)
      || !integer(row.accountedNeurons)) fail('ledger_attempt_invalid');
    const settlement = settleUsage(job.model, row.usage);
    if (row.state === 'completed' && settlement.exceedsReservation) fail('provider_exceeded_reservation_manual_review_required');
    const expected = row.state === 'completed' ? settlement.accountedNeurons : row.reservedNeurons;
    if (row.accountedNeurons !== expected) fail('ledger_accounting_invalid');
    ids.add(row.id);
  }
  if (ids.size > policy.maxCalls || ledger.attempts.reduce((sum, row) => sum + row.reservedNeurons, 0) > policy.maxNeurons) fail('ledger_budget_invalid');
  return ids;
}

export async function atomicJson(path, value) {
  const temporary = `${path}.tmp`;
  const file = await open(temporary, 'w', 0o600);
  try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); await file.sync(); }
  finally { await file.close(); }
  await rename(temporary, path);
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

export async function responseText(response) {
  if (!response.body) fail('missing_response_body');
  const reader = response.body.getReader();
  const parts = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > POLICY.maxResponseBytes) { await reader.cancel(); fail('response_byte_limit'); }
      parts.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts).toString('utf8');
}

export async function executeJob(job, ledger, persist, dispatch, redact = (text) => text, options = {}) {
  const policy = options.policy ?? POLICY;
  const validate = options.validateOutput ?? validateOutput;
  if (ledger.attempts.some((row) => row.id === job.id)) return 'skipped';
  if (ledger.attempts.length >= policy.maxCalls
    || ledger.attempts.reduce((sum, row) => sum + row.reservedNeurons, 0) + job.reservedNeurons > policy.maxNeurons) fail('budget_exhausted');
  const row = {
    id: job.id, model: job.model.id, scenario: job.scenario.id, state: 'reserved',
    startedAt: new Date().toISOString(), promptBytes: job.promptBytes,
    reservedNeurons: job.reservedNeurons, accountedNeurons: job.reservedNeurons,
    accounting: 'maximum_retained_not_yet_settled', payload: job.payload,
  };
  ledger.attempts.push(row);
  // Must be durable BEFORE dispatch; a crash after this point never retries ID.
  await persist(ledger);
  const start = performance.now();
  let result;
  try { result = await dispatch(job); }
  catch (error) {
    row.state = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'failed';
    row.errorCode = error instanceof BenchError ? error.code : 'network_or_deadline';
  }
  row.latencyMs = Math.round(performance.now() - start);
  if (result) {
    row.httpStatus = result.status;
    if (result.status < 200 || result.status >= 300) {
      row.state = 'failed';
      row.errorCode = `http_${result.status}`;
      // Do not persist an arbitrary error body that might echo authentication.
    } else {
      try {
        const envelope = JSON.parse(redact(result.text));
        if (envelope.success !== true || !plain(envelope.result)) fail('invalid_provider_envelope');
        const raw = envelope.result;
        row.state = 'completed';
        row.response = raw;
        row.usage = plain(raw.usage) ? raw.usage : null;
        Object.assign(row, settleUsage(job.model, row.usage));
        row.finishReason = raw.choices?.[0]?.finish_reason ?? null;
        const content = raw.choices?.[0]?.message?.content ?? raw.response;
        try {
          const decoded = decodeContent(content);
          row.output = decoded.output;
          row.normalization = decoded.normalization;
          row.mechanicalFailures = validate(row.output, job.scenario);
        } catch { row.mechanicalFailures = ['strict_json_parse']; }
        if (row.finishReason === 'length') row.mechanicalFailures.push('output_truncated');
        if (Array.isArray(raw.choices) && raw.choices.length !== 1) row.mechanicalFailures.push('completion_count');
        row.humanReview = { status: 'pending', questions: job.scenario.humanReview };
      } catch (error) {
        row.state = 'failed';
        row.errorCode = error instanceof BenchError ? error.code : 'invalid_provider_json';
      }
    }
  }
  row.finishedAt = new Date().toISOString();
  await persist(ledger);
  return row.state;
}

function report(ledger) {
  return {
    scope: 'Synthetic mechanical checks only. Human review is pending; this is not a model quality ranking.',
    attemptsReserved: ledger.attempts.length,
    conservativeReservedNeurons: ledger.attempts.reduce((sum, row) => sum + row.reservedNeurons, 0),
    accountedNeurons: ledger.attempts.reduce((sum, row) => sum + row.accountedNeurons, 0),
    maxNeurons: POLICY.maxNeurons,
    results: ledger.attempts.map((row) => ({
      id: row.id, state: row.state, latencyMs: row.latencyMs ?? null,
      mechanicalFailures: row.mechanicalFailures ?? null,
      humanReview: row.humanReview?.status ?? 'not_available',
      usageComplete: row.complete ?? false, errorCode: row.errorCode ?? null,
    })),
  };
}

async function selfTest(fixture, jobs) {
  const scenario = fixture.scenarios[0];
  const good = {
    speaker: scenario.context.speaker, utterance: 'I need six for the roof; I can offer two. Would that help?',
    stance: 'counteroffer', action: { verb: 'offer', target: 'test-ivo', resource: 'cells', amount: 2 },
    evidence: ['bench-01'], plan: { project: 'test-roof-patch', next: 'Keep six cells for the patch.', revision: 1 }, status: 'proposal',
  };
  assert.deepEqual(validateOutput(good, scenario), []);
  assert.ok(validateOutput({ ...good, action: { ...good.action, amount: 6 } }, scenario).includes('feasible_amount'));
  assert.ok(validateOutput({ ...good, evidence: ['invented'] }, scenario).includes('only_known_unique_evidence'));
  assert.ok(validateOutput({ ...good, status: 'executed' }, scenario).includes('proposal_not_execution'));
  assert.ok(validateOutput({ ...good, utterance: 'According to bench-999, it is done.' }, scenario).includes('no_unknown_event_ids_in_prose'));
  assert.deepEqual(decodeContent(`<think>\n\n</think>\n${JSON.stringify(good)}`).output, good);
  assert.throws(() => decodeContent(`<think>I will fabricate consent.</think>${JSON.stringify(good)}`));
  for (const item of fixture.scenarios.slice(1)) {
    const expected = item.expected;
    const answer = {
      speaker: item.context.speaker, utterance: 'Could we agree on this smaller next step?',
      stance: expected.stances[0],
      action: { verb: expected.verbs.find((verb) => verb !== 'none'), target: expected.target, resource: expected.resource, amount: expected.minAmount },
      evidence: expected.requiredEvidence,
      plan: { project: expected.project, next: item.context.project.next, revision: expected.revision }, status: 'proposal',
    };
    assert.deepEqual(validateOutput(answer, item), []);
    assert.ok(validateOutput({ ...answer, speaker: item.context.interlocutor }, item).includes('single_expected_speaker'));
    assert.ok(validateOutput({ ...answer, plan: { ...answer.plan, revision: 999 } }, item).includes('persistent_project_revision'));
    assert.ok(validateOutput({ ...answer, utterance: expected.forbiddenClaims[0] }, item).includes('listed_false_claims_absent'));
  }
  assert.equal(jobs.length, 12);
  assert.ok(jobs.every((job) => job.promptBytes <= 6000 && job.payload.max_tokens === 512));
  assert.ok(jobs.filter((job) => job.model.key === 'qwen').every((job) => job.payload.messages[1].content.endsWith('/no_think')));
  assert.ok(jobs.reduce((sum, job) => sum + job.reservedNeurons, 0) <= 1000);
  const job = jobs[0];
  assert.equal(settleUsage(job.model, { prompt_tokens: 1 }).accountedNeurons, job.reservedNeurons);
  assert.equal(settleUsage(job.model, { prompt_tokens: 1, completion_tokens: 1, total_tokens: 3 }).complete, false);
  assert.equal(settleUsage(job.model, { prompt_tokens: 1, completion_tokens: 513, total_tokens: 514 }).exceedsReservation, true);
  const ledger = { version: 1, binding: 'test', attempts: [] };
  let durable;
  let dispatches = 0;
  const persist = async (value) => { durable = structuredClone(value); };
  const dispatch = async () => {
    dispatches++;
    assert.equal(durable.attempts[0].state, 'reserved');
    assert.equal(durable.attempts[0].accountedNeurons, job.reservedNeurons);
    return { status: 200, text: JSON.stringify({ success: true, result: { response: JSON.stringify(good), usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 } } }) };
  };
  await executeJob(job, ledger, persist, dispatch);
  assert.equal(ledger.attempts[0].state, 'completed');
  assert.deepEqual(ledger.attempts[0].mechanicalFailures, []);
  assert.equal(verifyLedger(ledger, 'test', jobs).size, 1);
  assert.equal(await executeJob(job, ledger, persist, dispatch), 'skipped');
  assert.equal(dispatches, 1);
  const reserved = { ...structuredClone(ledger), attempts: [{ ...ledger.attempts[0], state: 'reserved', accountedNeurons: job.reservedNeurons }] };
  assert.equal(await executeJob(job, reserved, persist, dispatch), 'skipped');
  assert.equal(dispatches, 1);
  await executeJob(jobs[1], ledger, persist, async () => { throw Object.assign(new Error(), { name: 'TimeoutError' }); });
  assert.equal(ledger.attempts[1].state, 'timeout');
  assert.equal(ledger.attempts[1].accountedNeurons, jobs[1].reservedNeurons);
  await executeJob(jobs[2], ledger, persist, async () => ({ status: 200, text: JSON.stringify({ success: true, result: { response: '{}' } }) }));
  assert.equal(ledger.attempts[2].accountedNeurons, jobs[2].reservedNeurons);
  const before = dispatches;
  await assert.rejects(executeJob(jobs[3], ledger, async () => { throw new Error('test_disk_failure'); }, dispatch));
  assert.equal(dispatches, before);
  assert.throws(() => verifyLedger({ ...ledger, attempts: [...ledger.attempts, ledger.attempts[0]] }, 'test', jobs));
  await assert.rejects(executeJob(jobs[0], { attempts: Array.from({ length: 12 }, (_, id) => ({ id: String(id), reservedNeurons: 1 })) }, persist, dispatch), /budget_exhausted/);
  await assert.rejects(executeJob(jobs[0], { attempts: [{ id: 'other', reservedNeurons: 1000 }] }, persist, dispatch), /budget_exhausted/);
  const largeFixture = structuredClone(fixture);
  largeFixture.scenarios[0].context.message = 'x'.repeat(6001);
  assert.throws(() => buildJobs(largeFixture), /prompt_byte_limit/);
  console.log('Offline self-test passed: constraints, bounds, reserve-before-I/O, complete/unknown usage, timeout, duplicate IDs and failed persistence. No inference or output files.');
}

async function main() {
  const args = process.argv.slice(2);
  let live = false; let test = false; let outputDir;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--live' && !live) live = true;
    else if (args[index] === '--self-test' && !test) test = true;
    else if (args[index] === '--out' && !outputDir && args[index + 1] && !args[index + 1].startsWith('--')) outputDir = resolve(args[++index]);
    else fail('usage_expected_live_out_or_self_test');
  }
  if (live && test) fail('self_test_cannot_be_live');
  const fixtureText = await readFile(FIXTURE_PATH, 'utf8');
  const fixture = JSON.parse(fixtureText);
  const jobs = buildJobs(fixture);
  if (test) return selfTest(fixture, jobs);
  if (!live) {
    console.log(JSON.stringify({ mode: 'offline_no_inference_no_writes', policy: POLICY,
      totalReservedNeurons: jobs.reduce((sum, job) => sum + job.reservedNeurons, 0),
      jobs: jobs.map(({ id, model, promptBytes, reservedNeurons }) => ({ id, model: model.id, promptBytes, reservedNeurons })),
      liveCommand: 'CF_ACCOUNT_ID=<env> CF_API_TOKEN=<env> node scripts/benchmark-society-models.mjs --live --out /absolute/output/directory',
    }, null, 2));
    return;
  }
  if (!outputDir) fail('live_requires_explicit_output_directory');
  // Credentials are read ONLY after explicit --live; never searched or logged.
  const account = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!account || !/^[a-f\d]{32}$/i.test(account) || !token || /\s/.test(token)) fail('missing_or_invalid_environment_credentials');
  const redact = (text) => text.replaceAll(token, '[REDACTED]').replaceAll(account, '[ACCOUNT]');
  const binding = hash(JSON.stringify({ fixtureText, policy: POLICY, models: MODELS, prompts: jobs.map((job) => job.payload), account: hash(account) }));
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const lockPath = join(outputDir, '.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); } catch { fail('output_locked_check_recorded_process_before_resuming'); }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    await lock.sync();
    const ledgerPath = join(outputDir, 'ledger.json');
    let ledger;
    try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); }
    catch (error) {
      if (error?.code !== 'ENOENT') fail('cannot_read_existing_ledger');
      try { await stat(`${ledgerPath}.tmp`); fail('incomplete_ledger_requires_manual_review'); }
      catch (pending) { if (pending?.code !== 'ENOENT') throw pending; }
      ledger = { version: 1, binding, createdAt: new Date().toISOString(), policy: POLICY, fixture, attempts: [] };
    }
    const seen = verifyLedger(ledger, binding, jobs);
    const persist = (value) => atomicJson(ledgerPath, value);
    let interrupted = false;
    let controller;
    const interrupt = () => { interrupted = true; controller?.abort(); };
    process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
    try {
      for (const job of jobs) {
        if (interrupted) break;
        if (seen.has(job.id)) continue;
        const state = await executeJob(job, ledger, persist, async () => {
          if (interrupted) throw Object.assign(new Error(), { name: 'AbortError' });
          controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), POLICY.timeoutMs);
          try {
            const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${job.model.id}`, {
              method: 'POST', redirect: 'error', signal: controller.signal,
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(job.payload),
            });
            return { status: response.status, text: await responseText(response) };
          } finally { clearTimeout(timeout); controller = undefined; }
        }, redact);
        console.log(`${job.id}: ${state}; human review pending`);
        if (state !== 'completed' || ledger.attempts.at(-1).exceedsReservation) break;
      }
    } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
    const summary = report(ledger);
    await atomicJson(join(outputDir, 'report.json'), summary);
    console.log(JSON.stringify(summary, null, 2));
    if (summary.results.some((row) => row.state !== 'completed' || row.mechanicalFailures?.length)) process.exitCode = 2;
  } finally { await lock.close(); await unlink(lockPath); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Benchmark stopped: ${error instanceof BenchError ? error.code : 'local_or_validation_failure'}. No automatic retry.`);
    process.exitCode = 1;
  });
}
