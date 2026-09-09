import { describe, expect, it, vi } from 'vitest';
import { GROQ_MAX_RESPONSE_BYTES, GROQ_MODEL, runGroq } from '../src/providers/groq';
import { cognitionJob } from './fixtures';

describe('Groq free fallback', () => {
  it.each([200, 429])('stops an oversized %s stream without Content-Length and cannot refund partial usage', async (status) => {
    let pulls = 0, cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode(pulls === 1
          ? '{"usage":{"prompt_tokens":1,"completion_tokens":1},"padding":"'
          : 'x'.repeat(32 * 1024)));
      },
      cancel() { cancelled = true; },
    }), { status, headers: { 'retry-after': '60' } });
    expect(response.headers.has('content-length')).toBe(false);
    const result = await runGroq({ apiKey: 'fixture-only', job: cognitionJob(), attemptId: `oversized-${status}`,
      model: GROQ_MODEL, fetcher: async () => response });
    expect(result).toMatchObject({ ok: false, kind: status === 200 ? 'invalid-response' : 'rate-limited',
      detailCode: 'response_too_large', usage: {} });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(GROQ_MAX_RESPONSE_BYTES / (32 * 1024) + 2);
  });

  it('rejects an oversized declared body before consuming it', async () => {
    let consumed = false, cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull() { consumed = true; }, cancel() { cancelled = true; },
    }, { highWaterMark: 0 }), { headers: { 'content-length': String(GROQ_MAX_RESPONSE_BYTES + 1) } });
    const result = await runGroq({ apiKey: 'fixture-only', job: cognitionJob(), attemptId: 'declared-oversize',
      model: GROQ_MODEL, fetcher: async () => response });
    expect(result).toMatchObject({ ok: false, kind: 'invalid-response', detailCode: 'response_too_large', usage: {} });
    expect(consumed).toBe(false); expect(cancelled).toBe(true);
  });

  it('keeps the request deadline while a response body is stalled', async () => {
    const controller = new AbortController();
    const timer = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    let cancelled = false;
    try {
      const pending = runGroq({ apiKey: 'fixture-only', job: cognitionJob(), attemptId: 'body-timeout',
        model: GROQ_MODEL, fetcher: async () => new Response(new ReadableStream<Uint8Array>({
          pull() { controller.abort(new DOMException('Fixture deadline', 'TimeoutError')); },
          cancel() { cancelled = true; },
        })) });
      expect(await pending).toMatchObject({ ok: false, kind: 'timeout', detailCode: 'request_timeout' });
      expect(cancelled).toBe(true);
    } finally { timer.mockRestore(); }
  });

  it('uses best-effort schema mode only for the society_turn contract', async () => {
    const job = cognitionJob(); job.outputContract.name = 'society_turn';
    let body: unknown;
    await runGroq({ apiKey: 'fixture-only', job, attemptId: 'society-wire', model: GROQ_MODEL,
      fetcher: async (_url, init) => { body = JSON.parse(String(init?.body)); return Response.json({ choices: [{ message: { content: '{"thought":"wait"}' } }] }); } });
    expect(body).toMatchObject({ response_format: { type: 'json_schema', json_schema: { name: 'society_turn', strict: false } } });
  });

  it.each(['malformed', 'truncated', 'http-error'])('preserves authoritative usage and request identity for %s output', async (kind) => {
    const usage = { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180,
      completion_tokens_details: { reasoning_tokens: 60 } };
    const result = await runGroq({ apiKey: 'fixture-only', job: cognitionJob(), attemptId: `usage-${kind}`, model: GROQ_MODEL,
      fetcher: async () => Response.json({ id: 'failed-request', usage,
        ...(kind === 'http-error' ? { error: { code: 'json_validate_failed' } }
          : { choices: [{ finish_reason: kind === 'truncated' ? 'length' : 'stop', message: { content: '{broken' } }] }) },
      { status: kind === 'http-error' ? 400 : 200 }) });
    expect(result).toMatchObject({ ok: false, kind: 'invalid-response', retryable: true, providerRequestId: 'failed-request',
      usage: { inputTokens: 100, outputTokens: 80, totalTokens: 180, reasoningTokens: 60 } });
  });

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
