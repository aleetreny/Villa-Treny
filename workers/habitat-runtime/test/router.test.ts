import { describe, expect, it, vi } from 'vitest';
import { parseRuntimeConfig } from '../src/contracts';
import { routeCognition } from '../src/providers/router';
import type { SqlQuotaLedger } from '../src/quota';
import { cognitionJob } from './fixtures';

describe('provider routing', () => {
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
        PUBLIC_ORIGIN: 'https://aleetreny.github.io',
        TICK_INTERVAL_MS: '21600000',
        MAX_COGNITIONS_PER_ALARM: '1',
        WORKERS_AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
        WORKERS_AI_DAILY_NEURONS_LIMIT: '8000',
        GROQ_MODEL: 'openai/gpt-oss-20b',
        GROQ_DAILY_TOTAL_TOKENS_LIMIT: '150000',
      }),
      job: cognitionJob(),
      attemptOrdinal: 1,
      quota,
      now: () => nowMs,
      groqFetch,
    });

    expect(result).toMatchObject({
      status: 'deferred',
      retryAtMs: nowMs + 15 * 60 * 1_000,
    });
  });
});
