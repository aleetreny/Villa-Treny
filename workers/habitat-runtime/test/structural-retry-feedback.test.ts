import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createGenesisWorld, deserializeWorldState } from '../src/domain';
import { createSocietyState, type SocietyState } from '../../../src/lib/habitat/society/index';
import { prepareSocietyJob } from '../src/society-scheduler';
import { buildProviderRejectionDiagnostic } from '../src/providers/shared';
import { saveProviderRejection } from '../src/rejection-log';
import { savedStructuralRetryFeedback } from '../src/retry-feedback';
import { workersMaximumFor } from '../src/providers/router';
import { parseRuntimeConfig, type CognitionJob, type ProviderAttemptResult } from '../src/contracts';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const project = { mode: 'replace', goal: 'Read the stores register.', why: 'Check what can be shared.', visibility: 'private', steps: [] };
const valid = { project, message: { to: 'B', text: 'I will read the register.', close: true } };
const bad = { ...valid, message: { ...valid.message, text: 'PRIVATE_CANDIDATE '.repeat(41) } };
type Runtime = { runtimeEnv: Env; processSocietyJob(id: string, now: number): Promise<void> };
function jobFixture(protocolVersion: 6 | 7 = 6) {
  const world = createGenesisWorld(), state = createSocietyState(world, 1000);
  return prepareSocietyJob({ state, world, actor: 'A', nowMs: 2000, sequence: 1, generation: 0,
    worldRevision: 0, habitatId: 'structural-retry', protocolVersion }).job;
}
async function rejection(job: CognitionJob, ordinal = 1, raw: unknown = bad) {
  const attemptId = `${job.jobId}:workers-ai:${ordinal}`;
  const diagnostic = await buildProviderRejectionDiagnostic({ job, attemptId, provider: 'workers-ai', model: env.WORKERS_AI_MODEL,
    selected: { value: JSON.stringify(raw), source: 'workers_ai_binding', selectedField: 'response', finishReason: 'stop',
      systemMessage: job.prompt.system, userMessage: job.prompt.user } }, { stage: 'schema', phase: 'schema_or_decode',
    code: job.outputContract.version === 7 ? 'invalid_retrieval_choice' : 'invalid_record_choice' });
  return { ok: false, attemptId, provider: 'workers-ai', model: env.WORKERS_AI_MODEL, kind: 'invalid-response', retryable: true,
    detailCode: 'invalid_cognition_payload', latencyMs: 5, diagnostic } satisfies ProviderAttemptResult;
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External HTTP forbidden in structural-feedback tests'); })));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('bound private rejection feedback on an actual retry', () => {
  it.each([6, 7] as const)('reads only a matching complete P%i rejection and leaves saved evidence and legacy versions alone', async protocolVersion => {
    const stub = env.HABITAT_WORLD.getByName(`structural-read-binding-${protocolVersion}`); await stub.getObserver();
    const job = jobFixture(protocolVersion), result = await rejection(job);
    const code = `invalid_society:${result.diagnostic.code}`;
    await runInDurableObject(stub, (_, durable) => {
      const sql = durable.storage.sql;
      expect(savedStructuralRetryFeedback(sql, job, code)).toBe('');
      saveProviderRejection(sql, result, 3000);
      const before = sql.exec('SELECT * FROM provider_rejections').toArray(), bytes = JSON.stringify(job);
      const feedback = savedStructuralRetryFeedback(sql, job, code);
      expect(feedback).toBe(' Structure errors: {"issues":[{"field":"message.text","error":"maxLength","limit":300}],"omitted":false}.');
      expect(feedback).not.toContain('PRIVATE_CANDIDATE');
      expect(savedStructuralRetryFeedback(sql, { ...job, outputContract: { ...job.outputContract, version: 5 } }, 'invalid_society:invalid_record_choice')).toBe('');
      expect(sql.exec('SELECT * FROM provider_rejections').toArray()).toEqual(before); expect(JSON.stringify(job)).toBe(bytes);
    });
  });

  it.each(['job', 'schema', 'user', 'system', 'candidate_hash', 'truncated', 'schema_incomplete', 'finish_length', 'domain'] as const)('omits feedback for a %s mismatch instead of guessing from private content', async reason => {
    const stub = env.HABITAT_WORLD.getByName(`structural-reject-${reason}`); await stub.getObserver();
    const job = jobFixture(), result = await rejection(job, 1, reason === 'truncated' ? { ...bad, message: { ...bad.message, text: 'private'.repeat(12_000) } } : bad);
    if (reason === 'job') result.diagnostic.jobId += ':another-resident';
    if (reason === 'candidate_hash') result.diagnostic.candidate.sha256 = '0'.repeat(64);
    if (reason === 'schema_incomplete') { result.diagnostic.contract.schemaJson = null; result.diagnostic.contract.schemaComplete = false; }
    if (reason === 'finish_length') result.diagnostic.finishReason = 'length';
    if (reason === 'domain') { result.diagnostic.stage = 'domain'; result.diagnostic.phase = 'domain_validation'; result.diagnostic.code = 'insufficient_cells'; }
    if (reason === 'schema') job.outputContract.jsonSchema = { ...job.outputContract.jsonSchema as Record<string, never>, description: 'Changed grammar context.' };
    if (reason === 'user') job.prompt.user += ' New references that were not in the rejected input.';
    if (reason === 'system') job.prompt.system += ' New instructions.';
    await runInDurableObject(stub, (_, durable) => {
      const sql = durable.storage.sql, json = JSON.stringify(result.diagnostic);
      // A tampered/incomplete stored row is a refusal test, not evidence accepted
      // by saveProviderRejection. The retry helper must validate it independently.
      sql.exec('INSERT INTO provider_rejections(attempt_id,recorded_at_ms,diagnostic_json,byte_count) VALUES(?,?,?,?)',
        result.attemptId, 3000, json, new TextEncoder().encode(json).length);
      expect(savedStructuralRetryFeedback(sql, job, 'invalid_society:invalid_record_choice')).toBe('');
    });
  });

  it('accepts a changed retry USER only with its exact saved input receipt and never repeats older issue lists', async () => {
    const stub = env.HABITAT_WORLD.getByName('structural-retry-receipt'); await stub.getObserver();
    const job = jobFixture(), retried = structuredClone(job);
    retried.prompt.user += ' Previous attempt was refused: invalid_record_choice. Correct that issue using only the supplied state and exact IDs.';
    const result = await rejection(retried, 2);
    await runInDurableObject(stub, (_, durable) => {
      const sql = durable.storage.sql; saveProviderRejection(sql, result, 3000);
      expect(savedStructuralRetryFeedback(sql, job, 'invalid_society:invalid_record_choice')).toBe('');
      sql.exec('INSERT INTO runtime_events(type,occurred_at_ms,detail_json) VALUES(?,?,?)', 'society.turn.retry', 2999,
        JSON.stringify({ jobId: job.jobId, systemHash: hash(retried.prompt.system), userHash: hash(retried.prompt.user) }));
      // Historical receipts without baseUserHash stay intact and cannot bind a
      // changed base context. A new receipt explicitly binds both versions.
      expect(savedStructuralRetryFeedback(sql, job, 'invalid_society:invalid_record_choice')).toBe('');
      sql.exec('INSERT INTO runtime_events(type,occurred_at_ms,detail_json) VALUES(?,?,?)', 'society.turn.retry', 3000,
        JSON.stringify({ jobId: job.jobId, baseUserHash: hash(job.prompt.user), systemHash: hash(retried.prompt.system), userHash: hash(retried.prompt.user) }));
      const feedback = savedStructuralRetryFeedback(sql, job, 'invalid_society:invalid_record_choice');
      expect(feedback.match(/message\.text/g)).toHaveLength(1);
      expect(savedStructuralRetryFeedback(sql, job, 'invalid_society:invalid_record_choice')).toBe(feedback);
      expect(savedStructuralRetryFeedback(sql, { ...job, prompt: { ...job.prompt, user: job.prompt.user + ' Different evidence.' } },
        'invalid_society:invalid_record_choice')).toBe('');
    });
  });

  it.each([6, 7] as const)('retries P%i through the real Worker with one hint and reserves the full USER while keeping the saved envelope/schema', async protocolVersion => {
    const stub = env.HABITAT_WORLD.getByName(`structural-real-flow-${protocolVersion}`); await stub.getObserver();
    await runInDurableObject(stub, async (instance, durable) => {
      const runtime = instance as unknown as Runtime, sql = durable.storage.sql, previous = runtime.runtimeEnv;
      const start = Date.now(), clock = vi.spyOn(Date, 'now').mockReturnValue(start);
      const fake = vi.fn().mockResolvedValueOnce({ response: JSON.stringify(bad), usage: { prompt_tokens: 500, completion_tokens: 200 } })
        .mockResolvedValue({ response: JSON.stringify(valid), usage: { prompt_tokens: 530, completion_tokens: 30 } });
      runtime.runtimeEnv = { ...previous, AI: { run: fake } as unknown as Ai, GROQ_API_KEY: '' };
      try {
        const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
        const state = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState;
        const { turn, job } = prepareSocietyJob({ state, world, actor: 'A', nowMs: start, sequence: 1, generation: 0,
          worldRevision: 0, habitatId: env.HABITAT_ID, protocolVersion });
        const envelope = JSON.stringify(job), prepared = JSON.stringify(turn);
        sql.exec("UPDATE runtime_meta SET mode='running',next_watch_at_ms=?,next_cognition_at_ms=?", start + 21_600_000, start + 180_000);
        sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,0)', turn.sequence, job.jobId, turn.actor, prepared);
        sql.exec("INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts) VALUES(?,?,'pending',0,?,?,0)", job.jobId, envelope, start, start);
        await runtime.processSocietyJob(job.jobId, start);
        expect(fake).toHaveBeenCalledTimes(1);
        expect(sql.exec<{ error_code: string }>('SELECT error_code FROM cognition_jobs').one().error_code)
          .toBe(`invalid_society:${protocolVersion === 7 ? 'invalid_retrieval_choice' : 'invalid_record_choice'}`);
        const charged = sql.exec('SELECT * FROM quota_reservations').toArray(), minds = sql.exec('SELECT * FROM society_state').toArray();
        const availableAt = start + 360_000;
        sql.exec("UPDATE provider_breakers SET open_until_ms=?,reason='rate-limited' WHERE provider='workers-ai'", availableAt);
        clock.mockReturnValue(start + 180_000); await runtime.processSocietyJob(job.jobId, Date.now());
        expect(fake).toHaveBeenCalledTimes(1); expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual(charged);
        expect(sql.exec('SELECT * FROM society_state').toArray()).toEqual(minds);
        clock.mockReturnValue(availableAt + 1); await runtime.processSocietyJob(job.jobId, Date.now());
        expect(fake).toHaveBeenCalledTimes(2);
        const sent = fake.mock.calls[1]![1] as { messages: Array<{ content: string }> };
        const user = sent.messages[1]!.content;
        expect(user.match(/Structure errors:/g)).toHaveLength(1); expect(user.match(/"field":"message.text"/g)).toHaveLength(1);
        expect(user).toContain('"limit":300'); expect(user).not.toContain('PRIVATE_CANDIDATE');
        expect(sql.exec('SELECT envelope_json,status,attempts FROM cognition_jobs').one()).toEqual({ envelope_json: envelope, status: 'resolved', attempts: 2 });
        expect(sql.exec<{ prepared_json: string }>('SELECT prepared_json FROM cognition_contexts').one().prepared_json).toBe(prepared);
        const actualJob = { ...job, prompt: { ...job.prompt, user } };
        const maximum = workersMaximumFor(actualJob, parseRuntimeConfig(env).WORKERS_AI_MODEL);
        expect(sql.exec('SELECT max_input_tokens,actual_input_tokens,actual_output_tokens FROM quota_reservations ORDER BY created_at_ms DESC LIMIT 1').one())
          .toEqual({ max_input_tokens: maximum.inputTokens, actual_input_tokens: 530, actual_output_tokens: 30 });
        const receipt = JSON.parse(sql.exec<{ detail_json: string }>("SELECT detail_json FROM runtime_events WHERE type='society.turn.retry' ORDER BY sequence DESC LIMIT 1").one().detail_json);
        expect(receipt).toMatchObject({ baseUserHash: hash(job.prompt.user), userHash: hash(user), systemHash: hash(job.prompt.system) });
      } finally { runtime.runtimeEnv = previous; }
    });
  });
});
