import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSocietyState, prepareSocietyTurn } from '../../../src/lib/habitat/society/index';
import { prepareAttentionTurn } from '../../../src/lib/habitat/society/attention-choice';
import { createGenesisWorld } from '../src/domain';
import { cognitionJobSchema, parseRuntimeConfig, type CognitionJob } from '../src/contracts';
import { applySocietyProtocol } from '../src/society-protocol';
import { routeCognition } from '../src/providers/router';
import { buildProviderRejectionDiagnostic, validationDiagnosticReason } from '../src/providers/shared';
import { savedStructuralRetryFeedback } from '../src/retry-feedback';
import type { SqlQuotaLedger } from '../src/quota';
import { cognitionJob } from './fixtures';

const privateProject = { mode: 'replace', goal: 'Consider my own plans before speaking.',
  why: 'I want to decide independently.', visibility: 'private', steps: [] };
const fixtureJob = (): CognitionJob => cognitionJob({ kind: 'society_turn', routingPolicy: 'free-models-v1',
  outputContract: { name: 'society_turn', version: 8, schemaHash: 'sha256:synthetic-attention-transport',
    jsonSchema: { type: 'object', additionalProperties: false, required: ['content'], properties: {
      content: { type: 'object', additionalProperties: false, required: ['text'], properties: {
        text: { type: 'string', maxLength: 5 },
      } },
    } } } });

beforeEach(() => vi.stubGlobal('fetch', () => { throw new Error('Attention transport tests forbid external inference and HTTP'); }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('P8 saved transport integration', () => {
  it('marks only supported P6/P7/P8 society jobs for the free-model route', () => {
    const job = fixtureJob();
    for (const version of [6, 7, 8]) expect(cognitionJobSchema.safeParse({ ...job,
      outputContract: { ...job.outputContract, version } }).success).toBe(true);
    for (const version of [1, 2, 3, 4, 5, 9]) expect(cognitionJobSchema.safeParse({ ...job,
      outputContract: { ...job.outputContract, version } }).success).toBe(false);
    for (const version of [1, 2, 3, 4, 5, 6, 7]) expect(cognitionJobSchema.safeParse({ ...job, routingPolicy: undefined,
      outputContract: { ...job.outputContract, version } }).success).toBe(true);
    expect(cognitionJobSchema.safeParse({ ...job, kind: 'reflection' }).success).toBe(false);
    expect(cognitionJobSchema.safeParse({ ...job, outputContract: { ...job.outputContract, name: 'reflection' } }).success).toBe(false);
  });

  it('dispatches an independent P8 project once while saved P7 rejects its new attention wrapper', () => {
    const world = createGenesisWorld(), state = createSocietyState(world, 1000);
    const initial = prepareSocietyTurn(state, world, 'A', { nowMs: 2000, generation: 0, sequence: 1, dialoguePolicy: 'concurrent-v1' });
    const turn = prepareAttentionTurn(state, world, initial), bytes = JSON.stringify(turn);
    const raw = { attention: { kind: 'private', conversationId: null }, content: { project: privateProject } };
    const result = applySocietyProtocol(8, state, world, turn, raw, { nowMs: 2001, generation: 0 });
    expect(result.ok, result.code).toBe(true);
    expect(result.state.minds.A.project?.goal).toBe(privateProject.goal);
    expect(result.state.conversations).toEqual([]); expect(result.world).toEqual(world);
    const replay = applySocietyProtocol(8, result.state, result.world, turn, raw, { nowMs: 2002, generation: 0 });
    expect(replay.code).toBe('already_applied'); expect(replay.state).toBe(result.state);
    const old = applySocietyProtocol(7, state, world, turn, raw, { nowMs: 2001, generation: 0 });
    expect(old.ok).toBe(false); expect(old.state).toBe(state); expect(old.world).toBe(world);
    expect(applySocietyProtocol(9, state, world, turn, raw, { nowMs: 2001, generation: 0 }).code).toBe('unsupported_society_contract');
    expect(JSON.stringify(turn)).toBe(bytes);
  });

  it('routes a marked P8 through the real adapter and settles its single mocked request', async () => {
    const job = fixtureJob(), before = JSON.stringify(job), now = () => job.createdAtMs;
    const config = parseRuntimeConfig({ HABITAT_ID: job.habitatId, PUBLIC_ORIGIN: 'https://aleetreny.github.io',
      TICK_INTERVAL_MS: '21600000', MAX_COGNITIONS_PER_ALARM: '1', WORKERS_AI_DAILY_NEURONS_LIMIT: '8000',
      WORKERS_AI_MODEL: '@cf/openai/gpt-oss-120b', GROQ_MODEL: 'openai/gpt-oss-20b', GROQ_120B_ENABLED: 'true',
      GROQ_DAILY_TOTAL_TOKENS_LIMIT: '200000' });
    const quota = { dispatchedTotal: vi.fn(() => 0), dispatchedCount: vi.fn(() => 0),
      reserve: vi.fn(() => ({ allowed: true })), markDispatched: vi.fn(), settle: vi.fn(), recordOutcome: vi.fn() };
    const run = vi.fn(async () => ({ response: JSON.stringify({ content: { text: 'ready' } }),
      usage: { prompt_tokens: 10, completion_tokens: 3 } }));
    const result = await routeCognition({ ai: { run }, config, job, now, attemptOrdinal: 1,
      quota: quota as unknown as SqlQuotaLedger, validatePayload: () => true });
    expect(result.status).toBe('completed'); expect(run).toHaveBeenCalledTimes(1);
    expect(quota.reserve).toHaveBeenCalledTimes(1); expect(quota.markDispatched).toHaveBeenCalledTimes(1);
    expect(quota.settle).toHaveBeenCalledTimes(1); expect(quota.recordOutcome).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(job)).toBe(before);
    const unsupported = { ...job, outputContract: { ...job.outputContract, version: 9 } };
    const rejected = await routeCognition({ ai: { run }, config, job: unsupported, now, attemptOrdinal: 1,
      quota: quota as unknown as SqlQuotaLedger, validatePayload: () => true });
    expect(rejected).toMatchObject({ status: 'rejected', reasons: [{ detailCode: 'invalid_routing_contract' }] });
    expect(run).toHaveBeenCalledTimes(1); expect(quota.reserve).toHaveBeenCalledTimes(1);
  });

  it('binds P8 retry feedback to its saved nested schema without copying private text', async () => {
    const job = fixtureJob(), before = JSON.stringify(job), text = JSON.stringify({ content: { text: 'PRIVATE_REJECTED_TEXT' } });
    const reason = validationDiagnosticReason('invalid_attention_choice');
    expect(reason).toEqual({ stage: 'schema', phase: 'schema_or_decode', code: 'invalid_attention_choice' });
    const diagnostic = await buildProviderRejectionDiagnostic({ job, attemptId: `${job.jobId}:workers-ai:1`,
      provider: 'workers-ai', model: '@cf/openai/gpt-oss-120b', selected: { value: text, source: 'workers_ai_binding',
        selectedField: 'response', finishReason: 'stop', systemMessage: job.prompt.system, userMessage: job.prompt.user } }, reason);
    const diagnosticJson = JSON.stringify(diagnostic);
    const sql = { exec: vi.fn(() => ({ toArray: () => [{ diagnostic_json: diagnosticJson }] })) } as unknown as SqlStorage;
    const hint = savedStructuralRetryFeedback(sql, job, 'invalid_society:invalid_attention_choice');
    expect(hint).toBe(' Structure errors: {"issues":[{"field":"content.text","error":"maxLength","limit":5}],"omitted":false}.');
    expect(hint).not.toContain('PRIVATE_REJECTED_TEXT');
    expect(savedStructuralRetryFeedback(sql, { ...job, outputContract: { ...job.outputContract, version: 7 } },
      'invalid_society:invalid_attention_choice')).toBe('');
    expect(savedStructuralRetryFeedback(sql, { ...job, jobId: `${job.jobId}:other` }, 'invalid_society:invalid_attention_choice')).toBe('');
    expect(JSON.stringify(job)).toBe(before); expect(JSON.stringify(diagnostic)).toBe(diagnosticJson);
  });
});
