import { describe, expect, it, vi } from 'vitest';
import {
  estimateQwenNeurons,
  estimateWorkersAINeurons,
  GEMMA_WORKERS_AI_MODEL,
  OSS_WORKERS_AI_MODEL,
  runWorkersAI,
  WORKERS_AI_MODEL,
  workersAIInput,
} from '../src/providers/workers-ai';
import { cognitionJob } from './fixtures';

describe('Workers AI primary', () => {
  it('uses the measured GPT-OSS ChatCompletions contract and accounts its own tariff including reasoning', async () => {
    const original = cognitionJob(), job = { ...original, maxOutputTokens: 1024,
      outputContract: { ...original.outputContract, name: 'society_turn', version: 3 } };
    const input = workersAIInput(job, OSS_WORKERS_AI_MODEL);
    expect(input).toMatchObject({ max_completion_tokens: 1024, reasoning_effort: 'low', stream: false,
      response_format: { type: 'json_schema', json_schema: { name: 'society_turn', schema: job.outputContract.jsonSchema, strict: true } } });
    expect(input).not.toHaveProperty('chat_template_kwargs');
    expect(input).not.toHaveProperty('max_tokens');
    const run = vi.fn(async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"message":{"to":"K","text":"Can we discuss the stores?"}}' } }],
      usage: { prompt_tokens: 1311, completion_tokens: 180, total_tokens: 1491,
        completion_tokens_details: { reasoning_tokens: 20 }, neurons: 53.986122131347656 } }));
    const result = await runWorkersAI({ ai: { run }, job, model: OSS_WORKERS_AI_MODEL, attemptId: 'oss-v3' });
    expect(run).toHaveBeenCalledWith(OSS_WORKERS_AI_MODEL, input);
    expect(result).toMatchObject({ ok: true, usage: { inputTokens: 1311, outputTokens: 180, reasoningTokens: 20, neurons: 54 } });
    expect(estimateWorkersAINeurons(OSS_WORKERS_AI_MODEL, 2000, 512)).toBe(99);
  });

  it('retains a larger provider-metered cost and never settles incomplete usage from a neuron figure alone', async () => {
    const execute = (usage: Record<string, unknown>) => runWorkersAI({ ai: { run: async () => ({ response: '{"thought":"wait"}', usage }) },
      job: cognitionJob(), model: OSS_WORKERS_AI_MODEL, attemptId: 'oss-metered' });
    expect((await execute({ prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, neurons: 8.2 })).usage?.neurons).toBe(9);
    expect((await execute({ prompt_tokens: 10, neurons: 8.2 })).usage).not.toHaveProperty('neurons');
    for (const neurons of ['8.2', Infinity, -1, 1e30]) {
      expect((await execute({ prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, neurons })).usage)
        .toMatchObject({ incomplete: true });
    }
  });

  it('maps the configured Gemma society v2 contract once with thinking off and the bounded output cap', async () => {
    const original = cognitionJob();
    const job = { ...original, maxOutputTokens: 768, kind: 'society_turn',
      outputContract: { ...original.outputContract, name: 'society_turn', version: 2 } };
    const input = workersAIInput(job, GEMMA_WORKERS_AI_MODEL);
    expect(input).toMatchObject({ max_completion_tokens: 768, stream: false, temperature: 0.3,
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: 'system', content: job.prompt.system }, { role: 'user', content: job.prompt.user }],
      response_format: { type: 'json_schema', json_schema: {
        name: 'society_turn', schema: job.outputContract.jsonSchema, strict: true,
      } } });
    expect(input).not.toHaveProperty('max_tokens');
    expect(JSON.stringify(input)).not.toContain('/no_think');
    expect(input.seed).toBe(workersAIInput(job).seed);
    const run = vi.fn(async () => ({ choices: [{ finish_reason: 'stop', message: {
      content: '{"project":{"goal":"Ask to be consulted"}}' } }],
      usage: { prompt_tokens: 1_200, completion_tokens: 193, total_tokens: 1_393 } }));
    const result = await runWorkersAI({ ai: { run }, job, model: GEMMA_WORKERS_AI_MODEL, attemptId: 'gemma-v2' });
    expect(run).toHaveBeenCalledWith(GEMMA_WORKERS_AI_MODEL, input);
    expect(result).toMatchObject({ ok: true, model: GEMMA_WORKERS_AI_MODEL,
      payload: { project: { goal: 'Ask to be consulted' } },
      usage: { neurons: Math.ceil((1_200 * 9_091 + 193 * 27_273) / 1_000_000) } });
  });

  it('wraps legacy contracts for Gemma without duplicating their schema in the system message', () => {
    const job = cognitionJob();
    const input = workersAIInput(job, GEMMA_WORKERS_AI_MODEL);
    expect(input.messages[0]!.content).toBe(job.prompt.system);
    expect(input.response_format).toEqual({ type: 'json_schema', json_schema: {
      name: job.outputContract.name, schema: job.outputContract.jsonSchema, strict: true,
    } });
  });

  it('sends society grammar through real JSON mode once, while retaining deterministic generation settings', async () => {
    const original = cognitionJob();
    const job = { ...original, kind: 'society_turn' as const, outputContract: { ...original.outputContract,
      name: 'society_turn' as const, jsonSchema: { type: 'object', properties: { message: { type: 'object' } }, additionalProperties: false } } };
    const input = workersAIInput(job);
    expect(input.response_format).toEqual({ type: 'json_schema', json_schema: job.outputContract.jsonSchema });
    expect(input.messages[0]!.content).toBe(job.prompt.system);
    expect(input.messages[0]!.content).not.toContain('Output JSON Schema:');
    expect(input.messages[1]!.content).toBe(`${job.prompt.user}\n/no_think`);
    expect(input.seed).toBe(workersAIInput(job).seed);
    expect(input.seed).not.toBe(workersAIInput({ ...job, jobId: `${job.jobId}:next` }).seed);
    const run = vi.fn(async () => ({ response: { message: { to: 'B', text: 'Can we discuss tomorrow?' } } }));
    const result = await runWorkersAI({ ai: { run }, job, attemptId: 'society-json-mode', model: WORKERS_AI_MODEL });
    expect(run).toHaveBeenCalledWith(WORKERS_AI_MODEL, input);
    expect(result).toMatchObject({ ok: true, payload: { message: { to: 'B', text: 'Can we discuss tomorrow?' } } });
  });

  it.each(['malformed', 'truncated'])('retains actual usage on %s JSON instead of classifying it as an outage', async (kind) => {
    const result = await runWorkersAI({ ai: { run: async () => ({ choices: [{ finish_reason: kind === 'truncated' ? 'length' : 'stop',
      message: { content: '{broken' } }], usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 } }) },
      job: cognitionJob(), attemptId: `usage-${kind}`, model: WORKERS_AI_MODEL });
    expect(result).toMatchObject({ ok: false, kind: 'invalid-response', retryable: true,
      usage: { inputTokens: 100, outputTokens: 80, totalTokens: 180, neurons: estimateQwenNeurons(100, 80) } });
  });

  it.each([{ prompt_tokens: 100 }, { prompt_tokens: Infinity, completion_tokens: 2 },
    { prompt_tokens: 100, completion_tokens: 2, total_tokens: 102.5 }])('never invents zero usage or refundable neurons for %j', async (usage) => {
    const result = await runWorkersAI({ ai: { run: async () => ({ response: '{"thought":"wait"}', usage }) },
      job: cognitionJob(), attemptId: 'unknown-usage', model: WORKERS_AI_MODEL });
    expect(result.usage).not.toHaveProperty('neurons');
  });

  it('uses the fixed Qwen model and carries the JSON contract in its prompt', async () => {
    const run = vi.fn(async (model: string, request: unknown) => {
      void model;
      void request;
      return {
        response: '{"thought":"observe"}',
        usage: { prompt_tokens: 18, completion_tokens: 4, total_tokens: 22 },
      };
    });
    const result = await runWorkersAI({
      ai: { run },
      job: cognitionJob(),
      attemptId: 'workers:1',
      model: WORKERS_AI_MODEL,
    });
    expect(result).toMatchObject({
      ok: true,
      provider: 'workers-ai',
      payload: { thought: 'observe' },
    });
    expect(run).toHaveBeenCalledWith(WORKERS_AI_MODEL, expect.objectContaining({ max_tokens: 384 }));
    const request = run.mock.calls[0]![1] as { messages: Array<{ content: string }> };
    expect(request.messages[0]!.content).toContain('Output JSON Schema:');
    expect(request.messages[0]!.content).toContain('additionalProperties');
    expect(request).not.toHaveProperty('response_format');
  });

  it('parses the actual Qwen chat-completion envelope and ignores only complete reasoning wrappers', async () => {
    const result = await runWorkersAI({
      ai: { run: async () => ({ choices: [{ finish_reason: 'stop', message: {
        content: '<think>\n</think>\n{"verb":"rest","room":null,"target":null}',
      } }], usage: { prompt_tokens: 200, completion_tokens: 24 } }) },
      job: cognitionJob(), attemptId: 'qwen-current-envelope', model: WORKERS_AI_MODEL,
    });
    expect(result).toMatchObject({ ok: true, payload: { verb: 'rest', room: null, target: null } });
  });

  it('refuses a truncated model output even if its prefix happens to contain JSON', async () => {
    const result = await runWorkersAI({
      ai: { run: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{"verb":"rest"}' } }] }) },
      job: cognitionJob(), attemptId: 'qwen-truncated', model: WORKERS_AI_MODEL,
    });
    expect(result).toMatchObject({ ok: false, kind: 'invalid-response', detailCode: 'output_truncated' });
  });

  it('uses conservative integer neuron estimates', () => {
    expect(estimateQwenNeurons(1_000, 384)).toBe(
      Math.ceil((1_000 * 4_625 + 384 * 30_475) / 1_000_000),
    );
    expect(estimateWorkersAINeurons(GEMMA_WORKERS_AI_MODEL, 1_000, 384)).toBe(
      Math.ceil((1_000 * 9_091 + 384 * 27_273) / 1_000_000),
    );
  });

  it.each(['malformed', 'truncated'])('retains Gemma usage on %s output with its own tariff', async (kind) => {
    const result = await runWorkersAI({ ai: { run: async () => ({ choices: [{
      finish_reason: kind === 'truncated' ? 'length' : 'stop', message: { content: '{broken' },
    }], usage: { prompt_tokens: 1_200, completion_tokens: 700, total_tokens: 1_900 } }) },
      job: cognitionJob(), attemptId: `gemma-${kind}`, model: GEMMA_WORKERS_AI_MODEL });
    expect(result).toMatchObject({ ok: false, kind: 'invalid-response', model: GEMMA_WORKERS_AI_MODEL,
      usage: { inputTokens: 1_200, outputTokens: 700, totalTokens: 1_900,
        neurons: Math.ceil((1_200 * 9_091 + 700 * 27_273) / 1_000_000) } });
  });

  it.each([undefined, { prompt_tokens: 123 }, { prompt_tokens: 123, completion_tokens: -1 }])(
    'leaves unknown Gemma usage unpriced rather than inventing a refundable amount', async (usage) => {
      const result = await runWorkersAI({ ai: { run: async () => ({ choices: [{
        finish_reason: 'stop', message: { content: '{"thought":"wait"}' },
      }], usage }) }, job: cognitionJob(), attemptId: 'gemma-unknown', model: GEMMA_WORKERS_AI_MODEL });
      expect(result).toMatchObject({ ok: true, model: GEMMA_WORKERS_AI_MODEL });
      expect(result.usage).not.toHaveProperty('neurons');
    },
  );

  it.each([
    ['authentication failed', 'authentication', false],
    ['quota exhausted', 'quota-exhausted', true],
    ['model binding missing', 'misconfigured', false],
  ])('preserves Gemma model identity and classifies %s', async (message, kind, retryable) => {
    const result = await runWorkersAI({ ai: { run: async () => { throw new Error(message as string); } },
      job: cognitionJob(), attemptId: 'gemma-error', model: GEMMA_WORKERS_AI_MODEL });
    expect(result).toMatchObject({ ok: false, model: GEMMA_WORKERS_AI_MODEL, kind, retryable });
    expect(result.usage).toBeUndefined();
  });

  it('never calls a model outside the allowlist', async () => {
    const run = vi.fn();
    const result = await runWorkersAI({
      ai: { run },
      job: cognitionJob(),
      attemptId: 'workers:2',
      model: '@cf/another/model',
    });
    expect(result).toMatchObject({ ok: false, kind: 'policy-blocked' });
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps the truncated experimental GLM configuration outside the production allowlist', async () => {
    const run = vi.fn();
    const result = await runWorkersAI({ ai: { run }, job: cognitionJob(), attemptId: 'glm-not-production',
      model: '@cf/zai-org/glm-4.7-flash' });
    expect(result).toMatchObject({ ok: false, kind: 'policy-blocked', detailCode: 'model_not_allowed' });
    expect(run).not.toHaveBeenCalled();
  });
});
