import { describe, expect, it } from 'vitest';
import {
  cognitionJobSchema,
  GENESIS_RESIDENT_COUNT,
  MAX_RESIDENTS,
  runtimeConfigSchema,
} from '../src/contracts';
import { cognitionJob } from './fixtures';

describe('runtime contracts', () => {
  it('hard-caps genesis and runtime population at twenty-five', () => {
    expect(GENESIS_RESIDENT_COUNT).toBe(25);
    expect(MAX_RESIDENTS).toBe(25);
    expect(cognitionJobSchema.parse(cognitionJob()).subjects).toHaveLength(1);

    const subjects = Array.from({ length: 26 }, (_, index) => ({
      kind: 'resident',
      id: String(index),
    }));
    expect(() => cognitionJobSchema.parse(cognitionJob({ subjects }))).toThrow();
  });

  it('accepts cognition only from an alarm and rejects provider injection', () => {
    const valid = cognitionJob();
    expect(cognitionJobSchema.parse(valid).origin.kind).toBe('alarm');
    expect(() => cognitionJobSchema.parse({
      ...valid,
      origin: { kind: 'visitor', runId: 'request:1' },
    })).toThrow();
    expect(() => cognitionJobSchema.parse({ ...valid, provider: 'paid-provider' })).toThrow();
    expect(() => cognitionJobSchema.parse({ ...valid, model: 'paid-model' })).toThrow();
  });

  it('rejects any provider/model configuration outside the free allowlist', () => {
    const config = {
      HABITAT_ID: 'habitat-canonical',
      PUBLIC_ORIGIN: 'https://aleetreny.github.io',
      TICK_INTERVAL_MS: '21600000',
      MAX_COGNITIONS_PER_ALARM: '1',
      WORKERS_AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
      WORKERS_AI_DAILY_NEURONS_LIMIT: '8000',
      GROQ_MODEL: 'openai/gpt-oss-20b',
      GROQ_DAILY_TOTAL_TOKENS_LIMIT: '150000',
    };
    expect(runtimeConfigSchema.parse(config).MAX_COGNITIONS_PER_ALARM).toBe(1);
    expect(() => runtimeConfigSchema.parse({ ...config, TICK_INTERVAL_MS: '3600000' })).toThrow();
    expect(() => runtimeConfigSchema.parse({ ...config, MAX_COGNITIONS_PER_ALARM: '2' })).toThrow();
    expect(() => runtimeConfigSchema.parse({ ...config, GROQ_MODEL: 'expensive-model' })).toThrow();
    expect(() => runtimeConfigSchema.parse({
      ...config,
      WORKERS_AI_DAILY_NEURONS_LIMIT: '10001',
    })).toThrow();
  });
});
