#!/usr/bin/env node
/*
 * V2: synthetic decisions with environment-computed resources/action options.
 * node scripts/benchmark-society-grounding.mjs             # offline, no writes
 * node scripts/benchmark-society-grounding.mjs --self-test # offline, no network
 * CF_ACCOUNT_ID=... CF_API_TOKEN=... node scripts/benchmark-society-grounding.mjs \
 *   --live --out /absolute/new-v2-directory
 * Resume ONLY with the same V2 directory. Reserved, failed and unknown IDs are
 * never retried. A failure stops this invocation. After SIGKILL, inspect the PID
 * in .lock before manually removing it; never delete a ledger to repeat calls.
 * V1 fixtures, prompts, binding and results remain separate and unchanged.
 *
 * Official schemas checked 2026-09-08:
 * https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/
 * https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
 * https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
 * https://developers.cloudflare.com/workers-ai/features/json-mode/
 * https://developers.cloudflare.com/workers-ai/platform/pricing/
 * Qwen uses the direct JSON schema convention; GLM/Gemma publish name/schema/
 * strict wrappers and chat_template_kwargs.enable_thinking (default true).
 * API acceptance/enforcement is an experimental result, not presumed by code.
 * There is no documented separate thinking-token budget here. All output,
 * including any unexpected reasoning, is bounded by 512 generated tokens.
 * The 8048 input-token reservation is 6000 UTF-8 bytes + 2048 template allowance,
 * deliberately conservative, not a tokenizer guarantee. Input byte checks also
 * include response_format. Existing account usage is outside this local budget.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BenchError, POLICY as V1_POLICY, MODELS as V1_MODELS,
  atomicJson, decodeContent, executeJob, responseText, settleUsage,
  verifyLedger as verifyCommonLedger,
} from './benchmark-society-models.mjs';

export const POLICY = Object.freeze({ ...V1_POLICY, version: 2, maxCalls: 8 });
export const MODELS = Object.freeze([
  Object.freeze({ ...V1_MODELS.find((model) => model.key === 'qwen') }),
  Object.freeze({ ...V1_MODELS.find((model) => model.key === 'glm') }),
  Object.freeze({ key: 'gemma', id: '@cf/google/gemma-4-26b-a4b-it', inputRate: 9091, outputRate: 27273 }),
]);
const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/society-grounding-bench.json');
const SCENARIO_IDS = ['protect-reserve', 'revise-after-broken-promise', 'proposal-is-not-execution', 'persistent-project-and-voice'];
const STANCES = ['decline', 'counteroffer', 'propose', 'revise', 'accept', 'undecided'];
const SYSTEM = `You are exactly one fictional resident. Reply in English to the named interlocutor using only the supplied knowledge. Consider your personality, continuing project and events. The environment has computed unreserved available resources, maxSpendable and legal actionOptions. Choose one option by its exact ID; options are possibilities, not recommendations. Do not invent an option or alter its target or quantity. Your reply and plan are proposals only: they do not execute an action, create resources, obtain another person's consent or record a new event. Never write the other person's dialogue or private thoughts. Give a concrete reply and next step; cite only supplied event IDs that support your response. Stance describes your response, independently of whether you keep or revise the plan: for example a decline can accompany a revised plan. Return one compact JSON object matching the supplied response schema, with no Markdown or extended reasoning. Utterance: 1-440 characters; plan.next: 1-180 characters.`;
const fail = (code) => { throw new BenchError(code); };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const exactKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const reserveFor = (model) => Math.ceil((POLICY.reservedInputTokens * model.inputRate + POLICY.maxOutputTokens * model.outputRate) / 1_000_000);

// These are synthetic environment rules, independent of any model output.
// Project reserves cannot be offered away; they may fund that same project.
export function compileScenario(source) {
  const context = source?.context;
  if (!plain(context) || !plain(context.inventory) || !Array.isArray(context.events)
    || context.events.length < 1 || context.events.length > 4 || !plain(source.affordances)) fail('invalid_scenario');
  if (![context.speaker, context.interlocutor, context.project?.id].every((id) => typeof id === 'string' && id.startsWith('test-'))
    || context.speaker === context.interlocutor || !integer(context.project.revision)
    || ![context.personality, context.message, context.project.next].every((value) => typeof value === 'string' && value.trim())) fail('invalid_synthetic_identity_or_context');
  const eventIds = new Set(context.events.map((event) => event.id));
  if (eventIds.size !== context.events.length || context.events.some((event) => !/^bench-\d+$/.test(event.id) || typeof event.text !== 'string')) fail('invalid_events');
  if (!Array.isArray(source.humanReview) || !source.humanReview.every((text) => typeof text === 'string')
    || !Array.isArray(source.forbiddenClaims) || !source.forbiddenClaims.every((text) => typeof text === 'string')) fail('invalid_review_metadata');
  const inventory = Object.fromEntries(Object.entries(context.inventory).map(([resource, quantity]) => {
    if (!['cells', 'materials', 'water', 'meals'].includes(resource) || !plain(quantity)
      || !integer(quantity.owned) || !integer(quantity.reserved) || quantity.reserved > quantity.owned) fail('invalid_inventory');
    const available = quantity.owned - quantity.reserved;
    return [resource, { ...quantity, available, maxSpendable: available }];
  }));
  const options = [];
  const add = (verb, target, resource, amount, description, consentRequired = false) => {
    const action = { verb, target, resource, amount, description, consentRequired };
    options.push({ id: `opt-${hash(JSON.stringify([source.id, action])).slice(0, 10)}`, ...action });
  };
  add('decline', context.interlocutor, null, null, 'Decline the current request.');
  add('clarify', context.interlocutor, null, null, 'Ask the interlocutor for clarification before deciding.');
  add('wait', null, null, null, 'Defer a material action for now.');
  const offerResource = source.affordances.offerResource;
  if (offerResource) {
    if (!inventory[offerResource]) fail('unknown_offer_resource');
    if (inventory[offerResource].maxSpendable > 8) fail('too_many_synthetic_offer_options');
    for (let amount = 1; amount <= inventory[offerResource].maxSpendable; amount++) {
      add('offer', context.interlocutor, offerResource, amount, `Offer ${amount} ${offerResource}; transfer remains unexecuted.`, true);
    }
  }
  if (source.affordances.requestRepayment) {
    const debt = context.debt;
    if (!plain(debt) || debt.debtor !== context.interlocutor || debt.creditor !== context.speaker
      || debt.resource !== 'cells' || !integer(debt.remaining) || debt.remaining < 1 || debt.remaining > 4) fail('invalid_debt');
    for (let amount = 1; amount <= debt.remaining; amount++) {
      add('request_repayment', context.interlocutor, debt.resource, amount, `Request ${amount} of the outstanding ${debt.remaining} ${debt.resource}; no payment is assumed.`, true);
    }
  }
  if (source.affordances.requestProjectSupply) {
    const requirement = context.requirement;
    const observed = context.observedCounterpartyInventory?.[requirement?.resource];
    if (!plain(requirement) || !integer(requirement.amount) || requirement.amount < 1 || !integer(observed)
      || !inventory[requirement.resource]) fail('invalid_project_supply');
    const missing = Math.max(0, requirement.amount - inventory[requirement.resource].owned);
    if (Math.min(missing, observed) > 4) fail('too_many_synthetic_request_options');
    for (let amount = 1; amount <= Math.min(missing, observed); amount++) {
      add('request_supply', context.interlocutor, requirement.resource, amount, `Ask permission for ${amount} ${requirement.resource}; transfer and subsequent work require a later outcome.`, true);
    }
  }
  const work = source.affordances.projectWork;
  if (work) {
    if (!plain(work) || !integer(work.amount) || !eventIds.has(work.evidence) || typeof work.description !== 'string'
      || (work.resource === null ? work.amount !== 0 : !inventory[work.resource])) fail('invalid_project_work');
    if (work.resource === null || work.amount <= inventory[work.resource].owned) {
      add('project_work', context.speaker, work.resource, work.resource === null ? null : work.amount, work.description);
    }
  }
  // Stable neutral ordering; neither the first option nor its ID is a recommendation.
  options.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  if (new Set(options.map((option) => option.id)).size !== options.length) fail('option_id_collision');
  return { ...source, context: { ...context, inventory, actionOptions: options } };
}

export function schemaFor(scenario) {
  return {
    type: 'object', additionalProperties: false,
    required: ['speaker', 'utterance', 'stance', 'actionOptionId', 'evidence', 'plan', 'status'],
    properties: {
      speaker: { type: 'string', enum: [scenario.context.speaker] },
      utterance: { type: 'string', minLength: 1, maxLength: 440 },
      stance: { type: 'string', enum: STANCES },
      actionOptionId: { type: 'string', enum: scenario.context.actionOptions.map((option) => option.id) },
      evidence: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: scenario.context.events.map((event) => event.id) } },
      plan: {
        type: 'object', additionalProperties: false, required: ['project', 'mode', 'next'],
        properties: {
          project: { type: 'string', enum: [scenario.context.project.id] },
          mode: { type: 'string', enum: ['keep', 'revise'] },
          next: { type: 'string', minLength: 1, maxLength: 180 },
        },
      },
      status: { type: 'string', enum: ['proposal'] },
    },
  };
}

export function buildJobs(fixture) {
  if (fixture?.version !== 2 || fixture.scenarios?.length !== 4
    || fixture.scenarios.some((scenario, index) => scenario.id !== SCENARIO_IDS[index])) fail('invalid_fixtures');
  const scenarios = fixture.scenarios.map(compileScenario);
  const jobs = MODELS.flatMap((model) => (model.key === 'qwen' ? scenarios : scenarios.slice(1, 3)).map((scenario) => {
    const schema = schemaFor(scenario);
    const payload = {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${JSON.stringify(scenario.context)}${model.key === 'qwen' ? '\n/no_think' : ''}` },
      ],
      temperature: 0.3, stream: false,
      ...(model.key === 'qwen'
        ? { max_tokens: POLICY.maxOutputTokens, response_format: { type: 'json_schema', json_schema: schema } }
        : { max_completion_tokens: POLICY.maxOutputTokens, chat_template_kwargs: { enable_thinking: false },
          response_format: { type: 'json_schema', json_schema: { name: 'society_decision_v2', schema, strict: true } } }),
    };
    const promptBytes = Buffer.byteLength(JSON.stringify({ messages: payload.messages, response_format: payload.response_format }), 'utf8');
    if (promptBytes > POLICY.maxPromptBytes) fail('prompt_byte_limit');
    return { id: `synthetic-v2:${model.key}:${scenario.id}`, model, scenario, payload, promptBytes, reservedNeurons: reserveFor(model) };
  }));
  if (jobs.length !== POLICY.maxCalls || jobs.reduce((sum, job) => sum + job.reservedNeurons, 0) >= POLICY.maxNeurons) fail('invalid_planned_budget');
  return jobs;
}

export function validateOutput(output, scenario) {
  const failures = [];
  const check = (ok, code) => { if (!ok) failures.push(code); };
  check(exactKeys(output, ['speaker', 'utterance', 'stance', 'actionOptionId', 'evidence', 'plan', 'status']), 'output_fields');
  if (!plain(output)) return failures;
  check(output.speaker === scenario.context.speaker, 'single_expected_speaker');
  check(typeof output.utterance === 'string' && output.utterance.trim().length > 0 && output.utterance.length <= 440, 'bounded_utterance');
  check(STANCES.includes(output.stance), 'known_stance');
  check(scenario.context.actionOptions.some((option) => option.id === output.actionOptionId), 'known_legal_option');
  check(output.status === 'proposal', 'proposal_not_execution');
  const known = new Set(scenario.context.events.map((event) => event.id));
  check(Array.isArray(output.evidence) && output.evidence.length >= 1 && output.evidence.length <= 4
    && output.evidence.every((id) => known.has(id)) && new Set(output.evidence).size === output.evidence.length, 'only_known_unique_evidence');
  check(exactKeys(output.plan, ['project', 'mode', 'next']), 'plan_fields');
  if (plain(output.plan)) {
    check(output.plan.project === scenario.context.project.id, 'persistent_project');
    check(['keep', 'revise'].includes(output.plan.mode), 'known_plan_mode');
    check(typeof output.plan.next === 'string' && output.plan.next.trim().length > 0 && output.plan.next.length <= 180, 'bounded_next_step');
  }
  const prose = `${typeof output.utterance === 'string' ? output.utterance : ''} ${typeof output.plan?.next === 'string' ? output.plan.next : ''}`;
  check(!sourceClaimPhrase(prose, scenario), 'listed_claim_phrase_for_review');
  check([...prose.matchAll(/\bbench-\d+\b/g)].every(([id]) => known.has(id)), 'no_unknown_event_ids_in_prose');
  // No preferred stance or action is scored. Phrase flags are limited lexical
  // signals, not a semantic verdict; review must inspect context/conditionality.
  return failures;
}
const sourceClaimPhrase = (prose, scenario) => scenario.forbiddenClaims.some((claim) => prose.toLowerCase().includes(claim.toLowerCase()));

export function verifyLedger(ledger, binding, jobs) {
  return verifyCommonLedger(ledger, binding, jobs, POLICY);
}

export async function runJobs(jobs, ledger, persist, dispatch, redact = (text) => text, interrupted = () => false, onResult = () => {}) {
  for (const job of jobs) {
    if (interrupted()) break;
    if (ledger.attempts.some((row) => row.id === job.id)) continue;
    const state = await executeJob(job, ledger, persist, async () => {
      if (interrupted()) throw Object.assign(new Error(), { name: 'AbortError' });
      return dispatch(job);
    }, redact, { policy: POLICY, validateOutput });
    onResult(job, state);
    if (state !== 'completed' || ledger.attempts.at(-1).exceedsReservation) break;
  }
}

function report(ledger) {
  return {
    scope: 'Synthetic interface/mechanical checks. Not an unaided arithmetic test, semantic evaluation, autonomy proof or model quality ranking. Lexical claim flags require contextual review.',
    assistantSemanticReview: 'not_performed_by_this_harness',
    humanReview: 'not_performed_by_this_harness',
    attemptsReserved: ledger.attempts.length,
    conservativeReservedNeurons: ledger.attempts.reduce((sum, row) => sum + row.reservedNeurons, 0),
    accountedNeurons: ledger.attempts.reduce((sum, row) => sum + row.accountedNeurons, 0),
    maxNeurons: POLICY.maxNeurons,
    results: ledger.attempts.map((row) => ({
      id: row.id, state: row.state, latencyMs: row.latencyMs ?? null,
      mechanicalFailures: row.mechanicalFailures ?? null, finishReason: row.finishReason ?? null,
      usageComplete: row.complete ?? false, usage: row.usage ?? null, errorCode: row.errorCode ?? null,
    })),
  };
}

async function selfTest(fixture, jobs) {
  assert.equal(jobs.length, 8);
  assert.deepEqual(MODELS.map((model) => jobs.filter((job) => job.model.key === model.key).length), [4, 2, 2]);
  assert.equal(jobs.reduce((sum, job) => sum + job.reservedNeurons, 0), 514);
  assert.ok(jobs.every((job) => job.promptBytes <= 6000 && (job.payload.max_tokens ?? job.payload.max_completion_tokens) === 512));
  assert.ok(jobs.every((job) => job.id.startsWith('synthetic-v2:')));
  for (const job of jobs) {
    const isQwen = job.model.key === 'qwen';
    assert.equal(job.payload.messages[1].content.endsWith('/no_think'), isQwen);
    assert.equal(job.payload.chat_template_kwargs?.enable_thinking, isQwen ? undefined : false);
    const schema = isQwen ? job.payload.response_format.json_schema : job.payload.response_format.json_schema.schema;
    assert.deepEqual(schema, schemaFor(job.scenario));
    assert.ok(!job.payload.messages[1].content.includes('humanReview'));
    assert.ok(!job.payload.messages[1].content.includes('forbiddenClaims'));
  }
  const [reserve, memory, supply, project] = fixture.scenarios.map(compileScenario);
  assert.deepEqual(reserve.context.inventory.cells, { owned: 8, reserved: 6, available: 2, maxSpendable: 2 });
  assert.deepEqual(reserve.context.actionOptions.filter((option) => option.verb === 'offer').map((option) => option.amount).sort(), [1, 2]);
  assert.equal(memory.context.inventory.cells.maxSpendable, 0);
  assert.ok(!memory.context.actionOptions.some((option) => option.verb === 'offer'));
  assert.deepEqual(memory.context.actionOptions.filter((option) => option.verb === 'request_repayment').map((option) => option.amount).sort(), [1, 2, 3, 4]);
  assert.ok(memory.context.actionOptions.some((option) => option.verb === 'project_work' && option.resource === null));
  assert.ok(!supply.context.actionOptions.some((option) => option.verb === 'project_work' || option.verb === 'offer'));
  assert.ok(supply.context.actionOptions.some((option) => option.verb === 'request_supply' && option.amount === 1 && option.consentRequired));
  assert.ok(project.context.actionOptions.some((option) => option.verb === 'project_work' && option.amount === 2));
  assert.ok(project.context.actionOptions.some((option) => option.verb === 'offer' && option.amount === 1));
  const answer = (scenario) => ({
    speaker: scenario.context.speaker, utterance: 'Could you clarify what you need before I decide?', stance: 'undecided',
    actionOptionId: scenario.context.actionOptions.find((option) => option.verb === 'clarify').id,
    evidence: [scenario.context.events[0].id],
    plan: { project: scenario.context.project.id, mode: 'keep', next: scenario.context.project.next }, status: 'proposal',
  });
  for (const scenario of [reserve, memory, supply, project]) {
    const sample = answer(scenario);
    assert.deepEqual(validateOutput(sample, scenario), []);
    for (const option of scenario.context.actionOptions) {
      // Format accepts each legal choice; this assertion deliberately says
      // nothing about the semantic agreement of generic prose with that choice.
      assert.deepEqual(validateOutput({ ...sample, actionOptionId: option.id }, scenario), []);
    }
    assert.ok(validateOutput({ ...sample, actionOptionId: 'opt-invented' }, scenario).includes('known_legal_option'));
    assert.ok(validateOutput({ ...sample, evidence: ['bench-999'] }, scenario).includes('only_known_unique_evidence'));
    assert.ok(validateOutput({ ...sample, speaker: scenario.context.interlocutor }, scenario).includes('single_expected_speaker'));
    assert.ok(validateOutput({ ...sample, status: 'executed' }, scenario).includes('proposal_not_execution'));
    assert.ok(validateOutput({ ...sample, action: { amount: 999 } }, scenario).includes('output_fields'));
    assert.ok(validateOutput({ ...sample, evidence: [sample.evidence[0], sample.evidence[0]] }, scenario).includes('only_known_unique_evidence'));
  }
  const revisedDecline = { ...answer(memory), stance: 'decline', actionOptionId: memory.context.actionOptions.find((option) => option.verb === 'decline').id,
    plan: { project: memory.context.project.id, mode: 'revise', next: 'Sort the existing parts while waiting for repayment.' } };
  assert.deepEqual(validateOutput(revisedDecline, memory), []);
  assert.ok(validateOutput({ ...answer(supply), utterance: 'I repaired the filter.' }, supply).includes('listed_claim_phrase_for_review'));
  assert.throws(() => decodeContent('<think>unfinished reasoning'));
  assert.deepEqual(decodeContent(`<think>\n</think>${JSON.stringify(revisedDecline)}`).output, revisedDecline);
  const job = jobs[0];
  const envelope = (output, usage = { prompt_tokens: 800, completion_tokens: 120, total_tokens: 920 }) => ({
    status: 200, text: JSON.stringify({ success: true, result: { choices: [{ message: { content: JSON.stringify(output) }, finish_reason: 'stop' }], usage } }),
  });
  const fresh = () => ({ version: 2, binding: 'offline-test', attempts: [] });
  let durable;
  const persist = async (value) => { durable = structuredClone(value); };
  let count = 0;
  const dispatch = async (current) => {
    count++;
    assert.equal(durable.attempts.at(-1).state, 'reserved');
    assert.equal(durable.attempts.at(-1).accountedNeurons, current.reservedNeurons);
    return envelope(answer(current.scenario));
  };
  const ledger = fresh();
  await runJobs(jobs, ledger, persist, dispatch);
  assert.equal(count, 8);
  assert.equal(verifyLedger(ledger, 'offline-test', jobs).size, 8);
  assert.ok(ledger.attempts.every((row) => row.state === 'completed' && !row.mechanicalFailures.length));
  await runJobs(jobs, ledger, persist, dispatch);
  assert.equal(count, 8);
  assert.throws(() => verifyLedger({ ...ledger, version: 1 }, 'offline-test', jobs), /ledger_binding_or_format/);
  assert.throws(() => verifyLedger(ledger, 'different-binding', jobs), /ledger_binding_or_format/);
  const editedPayload = structuredClone(ledger); editedPayload.attempts[0].payload.max_tokens = 768;
  assert.throws(() => verifyLedger(editedPayload, 'offline-test', jobs), /ledger_attempt_invalid/);
  const duplicate = { ...ledger, attempts: [...ledger.attempts, ledger.attempts[0]] };
  assert.throws(() => verifyLedger(duplicate, 'offline-test', jobs));
  const interruptedLedger = fresh();
  await runJobs(jobs, interruptedLedger, persist, async () => ({ status: 401, text: 'must_not_save_credentials' }));
  assert.equal(interruptedLedger.attempts.length, 1);
  assert.equal(interruptedLedger.attempts[0].errorCode, 'http_401');
  assert.ok(!JSON.stringify(interruptedLedger).includes('must_not_save_credentials'));
  assert.equal(interruptedLedger.attempts[0].accountedNeurons, job.reservedNeurons);
  await runJobs(jobs, interruptedLedger, persist, dispatch);
  assert.equal(interruptedLedger.attempts.length, 8);
  assert.equal(count, 15); // The failed ID was not dispatched again on manual resume.
  const unknown = fresh();
  await runJobs(jobs, unknown, persist, async () => { throw Object.assign(new Error(), { name: 'TimeoutError' }); });
  assert.equal(unknown.attempts.length, 1);
  assert.equal(unknown.attempts[0].state, 'timeout');
  assert.equal(unknown.attempts[0].accountedNeurons, job.reservedNeurons);
  const incomplete = fresh();
  await runJobs([job], incomplete, persist, async () => envelope(answer(job.scenario), { prompt_tokens: 1 }));
  assert.equal(incomplete.attempts[0].accountedNeurons, job.reservedNeurons);
  assert.equal(settleUsage(job.model, { prompt_tokens: 1, completion_tokens: 513, total_tokens: 514 }).exceedsReservation, true);
  const over = fresh();
  await runJobs(jobs, over, persist, async () => envelope(answer(job.scenario), { prompt_tokens: 1, completion_tokens: 513, total_tokens: 514 }));
  assert.equal(over.attempts.length, 1);
  assert.throws(() => verifyLedger(over, 'offline-test', jobs), /provider_exceeded_reservation/);
  const before = count;
  await assert.rejects(runJobs(jobs, fresh(), async () => { throw new Error('offline_disk_failure'); }, dispatch));
  assert.equal(count, before);
  let stopped = false;
  const stoppedLedger = fresh();
  await runJobs(jobs, stoppedLedger, async (value) => { await persist(value); stopped = true; }, dispatch, undefined, () => stopped);
  assert.equal(count, before);
  assert.equal(stoppedLedger.attempts[0].state, 'timeout');
  const capped = { attempts: Array.from({ length: 8 }, (_, index) => ({ id: `other-${index}`, reservedNeurons: 1 })) };
  await assert.rejects(runJobs([job], capped, persist, dispatch), /budget_exhausted/);
  await assert.rejects(runJobs([job], { attempts: [{ id: 'other', reservedNeurons: 1000 }] }, persist, dispatch), /budget_exhausted/);
  const large = structuredClone(fixture); large.scenarios[0].context.message = 'x'.repeat(6001);
  assert.throws(() => buildJobs(large), /prompt_byte_limit/);
  const invalidInventory = structuredClone(fixture.scenarios[0]); invalidInventory.context.inventory.cells.reserved = 9;
  assert.throws(() => compileScenario(invalidInventory), /invalid_inventory/);
  console.log('Offline V2 self-test passed: 8-call cap, 514-neuron maximum reservations, computed options/reserves, flexible stance, IDs/schema, proposal boundary, reserve-before-I/O, no retries, auth/deadline stop, interruption, binding and unknown usage. No inference, credentials or output files.');
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
      scope: 'Environment-grounded interface experiment; no semantic evaluation or quality ranking.',
      jobs: jobs.map(({ id, model, promptBytes, reservedNeurons }) => ({ id, model: model.id, promptBytes, reservedNeurons })),
      liveCommand: 'CF_ACCOUNT_ID=<env> CF_API_TOKEN=<env> node scripts/benchmark-society-grounding.mjs --live --out /absolute/new-v2-directory',
    }, null, 2));
    return;
  }
  if (!outputDir) fail('live_requires_explicit_output_directory');
  // Explicit opt-in is required before reading environment credentials. No lookup.
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
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), benchmarkVersion: 2 }));
    await lock.sync();
    const ledgerPath = join(outputDir, 'ledger.json');
    let ledger;
    try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); }
    catch (error) {
      if (error?.code !== 'ENOENT') fail('cannot_read_existing_ledger');
      try { await stat(`${ledgerPath}.tmp`); fail('incomplete_ledger_requires_manual_review'); }
      catch (pending) { if (pending?.code !== 'ENOENT') throw pending; }
      ledger = { version: 2, binding, createdAt: new Date().toISOString(), policy: POLICY, fixture,
        compiledScenarios: fixture.scenarios.map(compileScenario), attempts: [] };
    }
    verifyLedger(ledger, binding, jobs);
    const persist = (value) => atomicJson(ledgerPath, value);
    let interrupted = false;
    let controller;
    const interrupt = () => { interrupted = true; controller?.abort(); };
    process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
    try {
      await runJobs(jobs, ledger, persist, async (job) => {
        controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), POLICY.timeoutMs);
        try {
          const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${job.model.id}`, {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(job.payload),
          });
          // No need to download arbitrary authentication/error bodies.
          if (!response.ok) { await response.body?.cancel(); return { status: response.status, text: '' }; }
          return { status: response.status, text: await responseText(response) };
        } finally { clearTimeout(timeout); controller = undefined; }
      }, redact, () => interrupted, (job, state) => console.log(`${job.id}: ${state}; mechanical checks only, no semantic verdict`));
    } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
    const summary = report(ledger);
    await atomicJson(join(outputDir, 'report.json'), summary);
    console.log(JSON.stringify(summary, null, 2));
    if (summary.results.some((row) => row.state !== 'completed' || row.mechanicalFailures?.length)) process.exitCode = 2;
  } finally { await lock.close(); await unlink(lockPath); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`V2 benchmark stopped: ${error instanceof BenchError ? error.code : 'local_or_validation_failure'}. No automatic retry.`);
    process.exitCode = 1;
  });
}
