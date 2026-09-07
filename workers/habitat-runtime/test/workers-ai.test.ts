import { describe, expect, it, vi } from 'vitest';
import {
  estimateQwenNeurons,
  runWorkersAI,
  WORKERS_AI_MODEL,
} from '../src/providers/workers-ai';
import { cognitionJob } from './fixtures';

describe('Workers AI primary', () => {
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
});
