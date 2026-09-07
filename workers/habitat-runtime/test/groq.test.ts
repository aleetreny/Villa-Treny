import { describe, expect, it, vi } from 'vitest';
import { GROQ_MODEL, runGroq } from '../src/providers/groq';
import { cognitionJob } from './fixtures';

describe('Groq free fallback', () => {
  it('fails closed before fetch when the key is absent', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await runGroq({
      apiKey: undefined,
      job: cognitionJob(),
      attemptId: 'attempt:1',
      model: GROQ_MODEL,
      fetcher,
    });
    expect(result).toMatchObject({ ok: false, kind: 'misconfigured' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('treats a failed JSON completion as a response failure rather than a day-long provider rejection', async () => {
    const result = await runGroq({
      apiKey: 'test-secret-not-real', job: cognitionJob(), attemptId: 'groq-bad-json', model: GROQ_MODEL,
      fetcher: async () => Response.json({ error: { code: 'json_validate_failed' } }, { status: 400 }),
    });
    expect(result).toMatchObject({ ok: false, kind: 'invalid-response', retryable: true });
  });

  it('sends strict structured output to the single allowed model', async () => {
    let captured: RequestInit | undefined;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return Response.json({
        id: 'groq-request-1',
        choices: [{ message: { content: '{"thought":"wait"}' } }],
        usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 },
      });
    });
    const result = await runGroq({
      apiKey: 'test-secret-not-real',
      job: cognitionJob(),
      attemptId: 'attempt:2',
      model: GROQ_MODEL,
      fetcher,
    });

    expect(result).toMatchObject({
      ok: true,
      provider: 'groq',
      model: GROQ_MODEL,
      payload: { thought: 'wait' },
    });
    const body = JSON.parse(String(captured?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: GROQ_MODEL,
      reasoning_effort: 'low',
      max_completion_tokens: 384,
      stream: false,
    });
    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'cognition_result', strict: true },
    });
    expect(new Headers(captured?.headers).get('authorization')).toBe('Bearer test-secret-not-real');
  });

  it('defers a 429 exactly as instructed instead of retrying', async () => {
    const now = 1_000_000;
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ error: { type: 'rate_limit_error' } }),
      { status: 429, headers: { 'retry-after': '45', 'content-type': 'application/json' } },
    ));
    const result = await runGroq({
      apiKey: 'test-secret-not-real',
      job: cognitionJob(),
      attemptId: 'attempt:3',
      model: GROQ_MODEL,
      fetcher,
      now: () => now,
    });
    expect(result).toMatchObject({
      ok: false,
      kind: 'rate-limited',
      retryable: true,
      retryAtMs: now + 45_000,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('blocks every model outside the allowlist', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await runGroq({
      apiKey: 'test-secret-not-real',
      job: cognitionJob(),
      attemptId: 'attempt:4',
      model: 'not-allowed',
      fetcher,
    });
    expect(result).toMatchObject({ ok: false, kind: 'policy-blocked' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
