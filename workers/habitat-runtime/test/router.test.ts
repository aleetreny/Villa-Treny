import { describe, expect, it, vi } from 'vitest';
import { parseRuntimeConfig, type RuntimeConfig } from '../src/contracts';
import { routeCognition } from '../src/providers/router';
import { estimateTokens } from '../src/providers/shared';
import { GEMMA_WORKERS_AI_MODEL, WORKERS_AI_MODEL, workersAIInput } from '../src/providers/workers-ai';
import type { SqlQuotaLedger } from '../src/quota';
import { cognitionJob } from './fixtures';
import * as groqEstimator from '../src/providers/groq-token-estimate';

function config(model: RuntimeConfig['WORKERS_AI_MODEL']): RuntimeConfig {
  return parseRuntimeConfig({ HABITAT_ID: 'habitat-canonical', PUBLIC_ORIGIN: 'https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev',
    TICK_INTERVAL_MS: '21600000', MAX_COGNITIONS_PER_ALARM: '1', WORKERS_AI_MODEL: model,
    WORKERS_AI_DAILY_NEURONS_LIMIT: '8000', GROQ_MODEL: 'openai/gpt-oss-20b',
    GROQ_DAILY_TOTAL_TOKENS_LIMIT: '200000' });
}

function quotaSpies() {
  return { reserve: vi.fn<SqlQuotaLedger['reserve']>(() => ({ allowed: true })),
    markDispatched: vi.fn(), recordOutcome: vi.fn(), settle: vi.fn(), dispatchedCount: vi.fn(() => 0) };
}

describe('provider routing', () => {
  it('rechecks control after lazy token counting before reserving or dispatching Groq', async () => {
    const quota = quotaSpies(), groqFetch = vi.fn();
    let active = true;
    const count = vi.spyOn(groqEstimator, 'estimateGroqInputTokens').mockImplementation(async () => {
      await Promise.resolve(); active = false; return 128;
    });
    try {
      const result = await routeCognition({ ai: { run: async () => { throw new Error('synthetic primary failure'); } },
        config: config(GEMMA_WORKERS_AI_MODEL), job: cognitionJob(), attemptOrdinal: 1,
        quota: quota as unknown as SqlQuotaLedger, groqApiKey: 'test-only', groqFetch,
        canDispatch: () => active });
      expect(result).toMatchObject({ status: 'rejected', reasons: expect.arrayContaining([
        expect.objectContaining({ provider: 'groq', detailCode: 'control_revision_changed' }),
      ]) });
      expect(count).toHaveBeenCalledTimes(1); expect(groqFetch).not.toHaveBeenCalled();
      expect(quota.reserve).toHaveBeenCalledTimes(1);
      expect(quota.reserve.mock.calls[0]![1]).toBe('workers-ai');
    } finally { count.mockRestore(); }
  });
  it.each([
    [GEMMA_WORKERS_AI_MODEL, 9_091, 27_273],
    [WORKERS_AI_MODEL, 4_625, 30_475],
  ] as const)('reserves and settles %s at its own tariff using its actual request framing', async (model, inputRate, outputRate) => {
    const quota = quotaSpies();
    const job = cognitionJob({ maxOutputTokens: 768 });
    const run = vi.fn(async () => ({ choices: [{ finish_reason: 'stop', message: {
      content: '{"verb":"rest","room":null,"target":null}',
    } }], usage: { prompt_tokens: 1_200, completion_tokens: 200, total_tokens: 1_400 } }));
    const result = await routeCognition({ ai: { run }, config: config(model), job, attemptOrdinal: 1,
      quota: quota as unknown as SqlQuotaLedger, now: () => 1_000, validatePayload: () => true });
    const estimatedInput = estimateTokens(JSON.stringify(workersAIInput(job, model)));
    expect(quota.reserve).toHaveBeenCalledExactlyOnceWith(`${job.jobId}:workers-ai:1`, 'workers-ai', {
      requests: 1, inputTokens: estimatedInput, outputTokens: 768,
      neurons: Math.ceil((estimatedInput * inputRate + 768 * outputRate) / 1_000_000),
    }, 1_000, job.jobId);
    expect(quota.settle).toHaveBeenCalledExactlyOnceWith(`${job.jobId}:workers-ai:1`, {
      inputTokens: 1_200, outputTokens: 200, totalTokens: 1_400,
      neurons: Math.ceil((1_200 * inputRate + 200 * outputRate) / 1_000_000),
    }, 1_000);
    expect(run).toHaveBeenCalledWith(model, workersAIInput(job, model));
    expect(result).toMatchObject({ status: 'completed', result: { model } });
  });

  it('rejects a disallowed injected model before reservation, accounting or fallback', async () => {
    const quota = quotaSpies();
    const run = vi.fn();
    const groqFetch = vi.fn();
    const result = await routeCognition({ ai: { run }, config: { ...config(GEMMA_WORKERS_AI_MODEL),
      WORKERS_AI_MODEL: '@cf/zai-org/glm-4.7-flash' } as unknown as RuntimeConfig,
      job: cognitionJob(), attemptOrdinal: 1, quota: quota as unknown as SqlQuotaLedger,
      groqApiKey: 'fake-key', groqFetch });
    expect(result).toMatchObject({ status: 'rejected', reasons: [{ kind: 'policy-blocked', detailCode: 'model_not_allowed' }] });
    for (const spy of Object.values(quota)) expect(spy).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(groqFetch).not.toHaveBeenCalled();
  });

  it('does not reprice or rerun an already recorded attempt after changing the configured model', async () => {
    const quota = quotaSpies();
    quota.reserve.mockReturnValue({ allowed: false, reason: 'duplicate', retryAtMs: 1_000 });
    const run = vi.fn();
    const groqFetch = vi.fn();
    const result = await routeCognition({ ai: { run }, config: config(GEMMA_WORKERS_AI_MODEL),
      job: cognitionJob(), attemptOrdinal: 1, quota: quota as unknown as SqlQuotaLedger,
      groqApiKey: 'fake-key', groqFetch });
    expect(result).toMatchObject({ status: 'rejected', reasons: [{ model: GEMMA_WORKERS_AI_MODEL, detailCode: 'duplicate_attempt' }] });
    expect(quota.settle).not.toHaveBeenCalled();
    expect(quota.markDispatched).not.toHaveBeenCalled();
    expect(quota.recordOutcome).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(groqFetch).not.toHaveBeenCalled();
  });

  it('retains the configured model name when its local quota cannot fit the request', async () => {
    const quota = quotaSpies();
    quota.reserve.mockReturnValue({ allowed: false, reason: 'limit', limit: 'request-size', retryAtMs: 1_000 });
    const run = vi.fn();
    const result = await routeCognition({ ai: { run }, config: config(GEMMA_WORKERS_AI_MODEL),
      job: cognitionJob(), attemptOrdinal: 1, quota: quota as unknown as SqlQuotaLedger });
    expect(result).toMatchObject({ status: 'rejected', reasons: [
      { model: GEMMA_WORKERS_AI_MODEL, detailCode: 'local_request-size_limit' },
      { detailCode: 'missing_api_key' },
    ] });
    expect(run).not.toHaveBeenCalled();
  });

  it('retries when the first provider can become available, not after the slowest one', async () => {
    const nowMs = 1_000_000;
    const quota = {
      reserve: vi.fn(() => ({ allowed: true as const })),
      markDispatched: vi.fn(),
      recordOutcome: vi.fn(),
      settle: vi.fn(),
    } as unknown as SqlQuotaLedger;
    const groqFetch = vi.fn(async () => new Response(
      JSON.stringify({ error: { type: 'rate_limit_error' } }),
      { status: 429, headers: { 'retry-after': '45', 'content-type': 'application/json' } },
    ));

    const result = await routeCognition({
      ai: { run: vi.fn(async () => { throw new Error('quota exhausted'); }) },
      groqApiKey: 'test-secret-not-real',
      config: parseRuntimeConfig({
        HABITAT_ID: 'habitat-canonical',
        PUBLIC_ORIGIN: 'https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev',
        TICK_INTERVAL_MS: '21600000',
        MAX_COGNITIONS_PER_ALARM: '1',
        WORKERS_AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
        WORKERS_AI_DAILY_NEURONS_LIMIT: '8000',
        GROQ_MODEL: 'openai/gpt-oss-20b',
        GROQ_DAILY_TOTAL_TOKENS_LIMIT: '200000',
      }),
      job: cognitionJob(),
      attemptOrdinal: 1,
      quota,
      now: () => nowMs,
      groqFetch,
    });

    expect(result).toMatchObject({
      status: 'deferred',
      retryAtMs: nowMs + 45_000,
    });
  });
});
