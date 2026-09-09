import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRuntimeConfig } from '../src/contracts';
import { routeCognition } from '../src/providers/router';
import { GROQ_MODEL } from '../src/providers/groq';
import * as estimator from '../src/providers/groq-token-estimate';
import { OSS_WORKERS_AI_MODEL } from '../src/providers/workers-ai';
import type { SqlQuotaLedger } from '../src/quota';
import { cognitionJob } from './fixtures';

const NOW = 1_788_900_000_000;

function fixture() {
  const config = parseRuntimeConfig({ HABITAT_ID: 'habitat-canonical',
    PUBLIC_ORIGIN: 'https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev', TICK_INTERVAL_MS: 21_600_000,
    MAX_COGNITIONS_PER_ALARM: 1, WORKERS_AI_MODEL: OSS_WORKERS_AI_MODEL,
    WORKERS_AI_DAILY_NEURONS_LIMIT: 8_000, GROQ_MODEL,
    GROQ_DAILY_TOTAL_TOKENS_LIMIT: 200_000, GROQ_120B_ENABLED: 'true' });
  // A saved P6 envelope without routingPolicy must retain the historical route,
  // even after the deployment enables the new destination for newly issued jobs.
  const job = cognitionJob({ kind: 'society_turn', maxOutputTokens: 1024,
    outputContract: { name: 'society_turn', version: 6, schemaHash: 'sha256:legacy-time-fixture',
      jsonSchema: { type: 'object', properties: { choice: { type: 'string' } },
        required: ['choice'], additionalProperties: false } } });
  const quota = { reserve: vi.fn<SqlQuotaLedger['reserve']>(() => ({ allowed: true })),
    markDispatched: vi.fn(), settle: vi.fn(), recordOutcome: vi.fn(), dispatchedCount: vi.fn(() => 0) };
  return { job, quota, input: { job, config, quota: quota as unknown as SqlQuotaLedger,
    attemptOrdinal: 3, groqApiKey: 'synthetic-test-key', validatePayload: () => true,
    canDispatch: () => true } };
}

function acceptedResponse() {
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop',
    message: { content: '{"choice":"ready"}' } }],
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }),
  { headers: { 'content-type': 'application/json' } });
}

describe('historical route lease deadline', () => {
  beforeEach(() => { vi.spyOn(estimator, 'estimateGroqInputTokens').mockResolvedValue(256); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('defers with ten seconds left, before reserving quota or beginning either request', async () => {
    const { input, quota } = fixture(), run = vi.fn(), groqFetch = vi.fn();
    const result = await routeCognition({ ...input, now: () => NOW, deadlineAtMs: NOW + 10_000,
      ai: { run }, groqFetch });
    expect(result).toMatchObject({ status: 'deferred', reasons: expect.arrayContaining([
      expect.objectContaining({ detailCode: 'route_time_budget' }),
    ]) });
    expect(quota.reserve).not.toHaveBeenCalled();
    expect(quota.markDispatched).not.toHaveBeenCalled();
    expect(quota.settle).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(groqFetch).not.toHaveBeenCalled();
  });

  it('allows both full 45-second requests when their combined duration fits the deadline', async () => {
    const { input, quota, job } = fixture();
    let clock = NOW;
    const run = vi.fn(async () => { clock += 45_000; throw new Error('synthetic primary unavailable'); });
    const groqFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).model).toBe(GROQ_MODEL);
      clock += 45_000;
      return acceptedResponse();
    });
    const result = await routeCognition({ ...input, now: () => clock, deadlineAtMs: NOW + 90_000,
      ai: { run }, groqFetch });
    expect(result).toMatchObject({ status: 'completed', result: { provider: 'groq', model: GROQ_MODEL } });
    expect(clock).toBe(NOW + 90_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(groqFetch).toHaveBeenCalledTimes(1);
    expect(quota.reserve.mock.calls.map(call => [call[0], call[3]])).toEqual([
      [`${job.jobId}:workers-ai:3`, NOW], [`${job.jobId}:groq:3`, NOW + 45_000],
    ]);
    expect(quota.reserve.mock.calls.every(call => call.length === 5)).toBe(true);
    expect(quota.settle).toHaveBeenCalledExactlyOnceWith(`${job.jobId}:groq:3`,
      { inputTokens: 100, outputTokens: 20, totalTokens: 120 }, NOW + 90_000);
  });

  it('preserves the primary attempt but does not reserve fallback with less than 45 seconds remaining', async () => {
    const { input, quota, job } = fixture();
    let clock = NOW;
    const run = vi.fn(async () => { clock += 45_000; throw new Error('synthetic primary unavailable'); });
    const groqFetch = vi.fn();
    const result = await routeCognition({ ...input, now: () => clock, deadlineAtMs: NOW + 89_999,
      ai: { run }, groqFetch });
    expect(result).toMatchObject({ status: 'deferred', reasons: expect.arrayContaining([
      expect.objectContaining({ provider: 'workers-ai', attemptId: `${job.jobId}:workers-ai:3` }),
      expect.objectContaining({ provider: 'groq', detailCode: 'route_time_budget' }),
    ]) });
    expect(quota.reserve).toHaveBeenCalledTimes(1);
    expect(quota.markDispatched).toHaveBeenCalledExactlyOnceWith(`${job.jobId}:workers-ai:3`, NOW);
    // No authoritative usage was returned: retain the existing reservation.
    expect(quota.settle).not.toHaveBeenCalled();
    expect(quota.recordOutcome).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(groqFetch).not.toHaveBeenCalled();
  });

  it('keeps the historical provider order and attempt IDs when no deadline is supplied', async () => {
    const { input, quota, job } = fixture(), calls: string[] = [];
    let clock = NOW;
    const run = vi.fn(async (model: string) => {
      calls.push(model); clock += 45_000; throw new Error('synthetic primary unavailable');
    });
    const groqFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)).model as string);
      clock += 45_000;
      return acceptedResponse();
    });
    const result = await routeCognition({ ...input, now: () => clock, ai: { run }, groqFetch });
    expect(result).toMatchObject({ status: 'completed', result: { attemptId: `${job.jobId}:groq:3` } });
    expect(calls).toEqual([OSS_WORKERS_AI_MODEL, GROQ_MODEL]);
    expect(quota.reserve.mock.calls.map(call => call[0])).toEqual([
      `${job.jobId}:workers-ai:3`, `${job.jobId}:groq:3`,
    ]);
    expect(quota.reserve.mock.calls.every(call => call.length === 5)).toBe(true);
    expect(job).not.toHaveProperty('routingPolicy');
  });
});
