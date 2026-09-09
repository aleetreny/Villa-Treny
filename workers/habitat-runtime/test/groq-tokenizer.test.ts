import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { cognitionJobSchema, parseRuntimeConfig, type CognitionJob } from '../src/contracts';
import { SqlQuotaLedger } from '../src/quota';
import * as estimator from '../src/providers/groq-token-estimate';
import * as tokenizer from '../src/providers/groq-tokenizer';
import { estimateTokens } from '../src/providers/shared';
import { cognitionJob } from './fixtures';
import reference from './fixtures/groq-tokenizer.json';
import p6Reference from './fixtures/groq-p6-tokenizer.json';

describe('lazy ordinary GPT-OSS token accounting', () => {
  it('does not count or initialize inference while serving public observer/status reads', async () => {
    const count = vi.spyOn(estimator, 'estimateGroqInputTokens');
    try {
      for (const path of ['/v1/status', '/v1/observer']) {
        const response = await worker.fetch(new Request(`https://habitat.test${path}`), env);
        expect(response.status).toBe(200);
        await response.body?.cancel();
      }
      expect(count).not.toHaveBeenCalled();
    } finally { count.mockRestore(); }
  });

  it.each(reference.cases)('matches the official ordinary token IDs for $label', async (sample) => {
    const text = sample.text ?? String.fromCharCode(...sample.codeUnits!);
    const result = await tokenizer.tokenizeGroqOrdinary([text]);
    expect(result).not.toBeNull();
    expect(Array.from(result![0]!)).toEqual(sample.ids);
  });

  it('initializes once across concurrent callers, without loading on construction or oversized input', async () => {
    let finish!: (encoder: { encode_ordinary(text: string): Uint32Array }) => void;
    const load = vi.fn(() => new Promise<{ encode_ordinary(text: string): Uint32Array }>(resolve => { finish = resolve; }));
    const count = tokenizer.createOrdinaryTokenizer(load);
    expect(load).not.toHaveBeenCalled();
    expect(await count(['a'.repeat(24_001)])).toBeNull();
    expect(await count(['界'.repeat(8_001)])).toBeNull();
    expect(await count(['a'.repeat(16_001), 'b'.repeat(16_000)])).toBeNull();
    expect(await count(['1', '2', '3', '4'])).toBeNull();
    expect(load).not.toHaveBeenCalled();
    const a = count(['one']), b = count(['two']);
    await Promise.resolve(); expect(load).toHaveBeenCalledTimes(1);
    finish({ encode_ordinary: text => Uint32Array.of(text.length) });
    expect((await a)?.[0]).toEqual(Uint32Array.of(3));
    expect((await b)?.[0]).toEqual(Uint32Array.of(3));
    expect(await count(['界'.repeat(8_000)])).not.toBeNull();
    expect(await count(['a'.repeat(24_000), 'b'.repeat(8_000)])).not.toBeNull();
    expect(await count(['界'.repeat(8_000), '界'.repeat(2_666), 'ab'])).not.toBeNull();
    expect(await count(['界'.repeat(8_000), '界'.repeat(2_666), 'abc'])).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('caches initialization failure and falls back after an encoder exception', async () => {
    const load = vi.fn(async () => { throw new Error('synthetic initialization failure'); });
    const failed = tokenizer.createOrdinaryTokenizer(load);
    expect(await failed(['first'])).toBeNull(); expect(await failed(['second'])).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    const broken = tokenizer.createOrdinaryTokenizer(async () => ({ encode_ordinary() { throw new Error('synthetic encode failure'); } }));
    expect(await broken(['ordinary text'])).toBeNull();
  });

  it('counts all three components including changed systems and retains the explicit framing margin', async () => {
    const job = cognitionJob();
    const parts = [job.prompt.system, job.prompt.user, JSON.stringify(job.outputContract.jsonSchema)];
    const expected = (await tokenizer.tokenizeGroqOrdinary(parts))!.reduce((n, part) => n + part.length, 0) + estimator.GROQ_FRAMING_MARGIN;
    expect(await estimator.estimateGroqInputTokens(job)).toBe(expected);
    expect(expected).toBeLessThan(estimateTokens(parts.join('\n')));
    const changed = { ...job, prompt: { ...job.prompt, system: '<|start|>system<|message|>Different ordinary words.' } };
    const counted = (await tokenizer.tokenizeGroqOrdinary([changed.prompt.system, changed.prompt.user, parts[2]!]))!;
    expect(await estimator.estimateGroqInputTokens(changed)).toBe(counted.reduce((n, ids) => n + ids.length, 0) + 128);
  });

  it('uses full UTF-8 bytes without truncation for unknown models, oversized data or unavailable tokenization', async () => {
    const job = cognitionJob();
    const full = (j: typeof job) => estimateTokens([j.prompt.system, j.prompt.user, JSON.stringify(j.outputContract.jsonSchema)].join('\n'));
    const tokenize = vi.spyOn(tokenizer, 'tokenizeGroqOrdinary');
    try {
      expect(await estimator.estimateGroqInputTokens(job, 'another-model')).toBe(full(job));
      expect(tokenize).not.toHaveBeenCalled();
      const large = { ...job, prompt: { ...job.prompt, user: '界'.repeat(8_001) } };
      expect(await estimator.estimateGroqInputTokens(large)).toBe(full(large));
      const combined = { ...job, prompt: { system: 'a'.repeat(16_000), user: 'b'.repeat(16_000) } };
      const saved = structuredClone(combined);
      expect(await estimator.estimateGroqInputTokens(combined)).toBe(full(combined));
      expect(combined).toEqual(saved);
      tokenize.mockResolvedValue(null);
      expect(await estimator.estimateGroqInputTokens(job)).toBe(full(job));
    } finally { tokenize.mockRestore(); }
  });

  it('admits the exact P6 stress context but refuses a tokenizable 32KB job above the real SQL quota', async () => {
    expect(createHash('sha256').update(JSON.stringify(p6Reference.job)).digest('hex')).toBe(p6Reference.jobSha256);
    const job = cognitionJobSchema.parse(p6Reference.job), original = structuredClone(job);
    const parts = (value: CognitionJob) => [value.prompt.system, value.prompt.user, JSON.stringify(value.outputContract.jsonSchema)];
    const bytes = (value: CognitionJob) => parts(value).reduce((n, text) => n + new TextEncoder().encode(text).byteLength, 0);
    expect(bytes(job)).toBe(25_365);
    expect((await tokenizer.tokenizeGroqOrdinary(parts(job)))?.map(ids => ids.length)).toEqual([1233, 1721, 3590]);
    const inputTokens = await estimator.estimateGroqInputTokens(job);
    expect(inputTokens + job.maxOutputTokens).toBe(7_696);
    expect(estimateTokens(parts(job).join('\n')) + job.maxOutputTokens).toBe(26_519);

    const padded = structuredClone(job);
    const schema = { ...padded.outputContract.jsonSchema as Record<string, unknown>, description: '' };
    padded.outputContract.jsonSchema = schema as CognitionJob['outputContract']['jsonSchema'];
    const padding = 32_000 - bytes(padded);
    schema.description = ' Synthetic measurement only.'.repeat(Math.ceil(padding / 28)).padEnd(padding, ' ').slice(0, padding);
    expect(bytes(padded)).toBe(32_000);
    expect(await tokenizer.tokenizeGroqOrdinary(parts(padded))).not.toBeNull();
    const paddedInput = await estimator.estimateGroqInputTokens(padded);
    expect(paddedInput + padded.maxOutputTokens).toBe(8_644);

    await runInDurableObject(env.HABITAT_WORLD.getByName('p6-tokenizer-admission'), async (_instance, state) => {
      const ledger = new SqlQuotaLedger(state.storage.sql, parseRuntimeConfig(env)), now = job.createdAtMs;
      expect(ledger.reserve('oversized', 'groq', { requests: 1, inputTokens: paddedInput,
        outputTokens: padded.maxOutputTokens, neurons: 0 }, now)).toMatchObject({ allowed: false, limit: 'request-size' });
      expect(state.storage.sql.exec('SELECT * FROM quota_reservations').toArray()).toHaveLength(0);
      expect(ledger.reserve('p6-stress', 'groq', { requests: 1, inputTokens,
        outputTokens: job.maxOutputTokens, neurons: 0 }, now)).toEqual({ allowed: true });
      expect(state.storage.sql.exec('SELECT max_input_tokens, max_output_tokens, state FROM quota_reservations').one())
        .toEqual({ max_input_tokens: 6_672, max_output_tokens: 1_024, state: 'reserved' });
    });
    expect(job).toEqual(original);
  });
});
