import { describe, expect, it, vi } from 'vitest';
import { GEMINI_DEBATE_MODEL, GEMINI_MAX_RESPONSE_BYTES, geminiRequestBody, runGemini } from '../src/providers/gemini';

const prompt = { system: 'Fictional editor.', user: 'A test question.', jsonSchema: { type: 'object' } };
const envelope = (overrides: Record<string, unknown> = {}) => ({
  modelVersion: GEMINI_DEBATE_MODEL, responseId: 'fixture-response',
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"title":"Fixture only"}' }] } }],
  usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10, thoughtsTokenCount: 30, totalTokenCount: 90 },
  ...overrides,
});
const request = (response: Response) => runGemini({ apiKey: 'fixture-secret', prompt, fetcher: async () => response });

describe('Gemini debate transport (mock inference only)', () => {
  it('keeps credentials in the header, uses a pinned model, JSON schema and medium thinking', async () => {
    let capturedUrl = '', captured: RequestInit = {};
    const result = await runGemini({ apiKey: 'fixture-secret', prompt, fetcher: async (url, init) => {
      capturedUrl = url; captured = init;
      return Response.json(envelope());
    } });
    expect(capturedUrl).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DEBATE_MODEL}:generateContent`);
    expect(new Headers(captured.headers).get('x-goog-api-key')).toBe('fixture-secret');
    expect(captured.redirect).toBe('error');
    expect(String(captured.body)).not.toContain('fixture-secret');
    expect(JSON.parse(String(captured.body))).toMatchObject({ generationConfig: {
      responseMimeType: 'application/json', responseJsonSchema: { type: 'object' },
      maxOutputTokens: 4096, candidateCount: 1, thinkingConfig: { thinkingLevel: 'MEDIUM', includeThoughts: false },
    } });
    expect(result).toMatchObject({ ok: true, modelVersion: GEMINI_DEBATE_MODEL,
      payload: { title: 'Fixture only' }, usage: { inputTokens: 50, outputTokens: 10, thinkingTokens: 30, totalTokens: 90, complete: true } });
  });

  it('does not dispatch without a key or with an oversized prompt', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await runGemini({ prompt, fetcher })).toMatchObject({ code: 'missing_key' });
    expect(await runGemini({ apiKey: 'fixture', prompt: { ...prompt, user: 'x'.repeat(30_000) }, fetcher })).toMatchObject({ code: 'invalid_request' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => geminiRequestBody({ ...prompt, maxOutputTokens: 9000 })).toThrow('invalid_request');
  });

  it.each([[401, 'authentication'], [403, 'authentication'], [429, 'rate_limited'], [503, 'provider_error']] as const)('handles HTTP %s without leaking error bodies or retrying', async (status, code) => {
    const fetcher = vi.fn(async () => Response.json({ error: { message: 'fixture-secret' } }, { status, headers: { 'retry-after': '45' } }));
    const result = await runGemini({ apiKey: 'fixture-secret', prompt, fetcher });
    expect(result).toMatchObject({ ok: false, code, status, retryAfterMs: 45_000, text: null });
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not return hidden thought parts as a public answer', async () => {
    const result = await request(Response.json(envelope({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { thought: true, text: 'PRIVATE FIXTURE REASONING' }, { text: '{"body":' }, { text: '"Public fixture"}' },
    ] } }] })));
    expect(result).toMatchObject({ ok: true, payload: { body: 'Public fixture' } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE FIXTURE');
  });

  it.each(['MAX_TOKENS', 'SAFETY', 'RECITATION'])('rejects %s while retaining known usage', async reason => {
    const result = await request(Response.json(envelope({ candidates: [{ finishReason: reason,
      content: { parts: [{ text: '{"title":"partial"}' }] } }] })));
    expect(result.ok).toBe(false);
    expect(result.code).toBe(reason === 'MAX_TOKENS' ? 'truncated' : 'blocked');
    expect(result.usage.totalTokens).toBe(90);
  });

  it('rejects malformed JSON, unexpected models, and extra candidates', async () => {
    expect(await request(new Response('not json'))).toMatchObject({ code: 'invalid_envelope' });
    expect(await request(Response.json(envelope({ modelVersion: 'gemini-3.8-flash' })))).toMatchObject({ code: 'unexpected_model' });
    expect(await request(Response.json(envelope({ candidates: [] })))).toMatchObject({ code: 'invalid_envelope' });
    expect(await request(Response.json(envelope({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '```json\n{}\n```' }] } }] })))).toMatchObject({ code: 'invalid_json' });
  });

  it('represents absent and contradictory token counts as incomplete, not free usage', async () => {
    expect((await request(Response.json(envelope({ usageMetadata: undefined })))).usage).toMatchObject({ complete: false, inputTokens: null, totalTokens: null });
    expect((await request(Response.json(envelope({ usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10, totalTokenCount: 0 } })))).usage.complete).toBe(false);
    expect((await request(Response.json(envelope({ usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10, totalTokenCount: 60 } })))).usage.complete).toBe(true);
  });

  it('stops a streamed oversized body without trusting Content-Length', async () => {
    let cancelled = false, pulls = 0;
    const response = new Response(new ReadableStream<Uint8Array>({ pull(controller) {
      pulls++; controller.enqueue(new Uint8Array(32 * 1024));
    }, cancel() { cancelled = true; } }));
    expect(await request(response)).toMatchObject({ code: 'response_too_large' });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(GEMINI_MAX_RESPONSE_BYTES / (32 * 1024) + 2);
  });

  it('cancels a body stalled beyond the request deadline', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const fetcher = async () => new Response(new ReadableStream<Uint8Array>({
      pull() { controller.abort(); }, cancel() { cancelled = true; },
    }));
    expect(await runGemini({ apiKey: 'fixture', prompt, fetcher, signal: controller.signal })).toMatchObject({ code: 'timeout' });
    expect(cancelled).toBe(true);
  });
});
