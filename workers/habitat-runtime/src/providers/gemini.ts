import { z } from 'zod';

// Server-only transport for the debate pilot. It does not join the historical
// society router: those jobs have a different output contract and quota ledger.
export const GEMINI_DEBATE_MODEL = 'gemini-3.5-flash-lite' as const;
export const GEMINI_MODELS = [GEMINI_DEBATE_MODEL, 'gemini-3.8-flash'] as const;
export type GeminiModel = typeof GEMINI_MODELS[number];
export const GEMINI_MAX_RESPONSE_BYTES = 128 * 1024;
export const GEMINI_MAX_REQUEST_BYTES = 20 * 1024;
export const GEMINI_REQUEST_TIMEOUT_MS = 90_000;

export type GeminiPrompt = {
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  maxRequestBytes?: number;
};
export type GeminiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;
  complete: boolean;
};
export type GeminiResult = {
  ok: boolean;
  code: 'ok' | 'missing_key' | 'invalid_request' | 'authentication' | 'rate_limited'
    | 'provider_error' | 'timeout' | 'network_error' | 'response_too_large'
    | 'invalid_envelope' | 'invalid_json' | 'blocked' | 'truncated' | 'unexpected_model';
  model: GeminiModel;
  modelVersion: string | null;
  responseId: string | null;
  status: number | null;
  text: string | null;
  payload: unknown;
  usage: GeminiUsage;
  latencyMs: number;
  retryAfterMs: number | null;
};
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const envelopeSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional(),
    finishReason: z.string().optional(),
  })).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  modelVersion: z.string().max(160).optional(),
  responseId: z.string().max(240).optional(),
  usageMetadata: z.object({
    promptTokenCount: z.unknown().optional(), candidatesTokenCount: z.unknown().optional(),
    thoughtsTokenCount: z.unknown().optional(), totalTokenCount: z.unknown().optional(),
  }).optional(),
});

export function geminiRequestBody(prompt: GeminiPrompt): string {
  const cap = prompt.maxOutputTokens ?? 4096;
  const byteCap = prompt.maxRequestBytes ?? GEMINI_MAX_REQUEST_BYTES;
  if (!Number.isInteger(cap) || cap < 256 || cap > 8192 || !prompt.system.trim() || !prompt.user.trim()
    || (prompt.thinkingLevel !== undefined && !['LOW', 'MEDIUM', 'HIGH'].includes(prompt.thinkingLevel))
    || !Number.isSafeInteger(byteCap) || byteCap < 1024 || byteCap > 64 * 1024
    || !prompt.jsonSchema || typeof prompt.jsonSchema !== 'object' || Array.isArray(prompt.jsonSchema)) {
    throw new Error('invalid_request');
  }
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: prompt.system }] },
    contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
    generationConfig: {
      candidateCount: 1, maxOutputTokens: cap, temperature: 1,
      thinkingConfig: { thinkingLevel: prompt.thinkingLevel ?? 'MEDIUM', includeThoughts: false },
      responseMimeType: 'application/json', responseJsonSchema: prompt.jsonSchema,
    },
  });
  if (new TextEncoder().encode(body).byteLength > byteCap) throw new Error('invalid_request');
  return body;
}

function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function usageOf(value: z.infer<typeof envelopeSchema>['usageMetadata']): GeminiUsage {
  const inputTokens = tokenCount(value?.promptTokenCount);
  const outputTokens = tokenCount(value?.candidatesTokenCount);
  // Protobuf omits zero-valued optional thought counters; retain that convention
  // only when a usage object exists. Missing usage never becomes zero usage.
  const thinkingTokens = value && value.thoughtsTokenCount === undefined ? 0 : tokenCount(value?.thoughtsTokenCount);
  const totalTokens = tokenCount(value?.totalTokenCount);
  return { inputTokens, outputTokens, thinkingTokens, totalTokens,
    complete: inputTokens !== null && outputTokens !== null && thinkingTokens !== null
      && totalTokens !== null && totalTokens === inputTokens + outputTokens + thinkingTokens };
}

async function boundedBody(response: Response, signal: AbortSignal): Promise<string> {
  if (Number(response.headers.get('content-length')) > GEMINI_MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error('response_too_large');
  }
  if (!response.body) throw new Error('invalid_envelope');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > GEMINI_MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('response_too_large');
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch (error) {
    // The signal can already be aborted before the listener was installed.
    await reader.cancel().catch(() => {});
    throw error;
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

/** Exactly one request; pacing, persistence and any retry belong to the caller.
 * Never expose HTTP error bodies (which can echo credentials), request headers,
 * hidden reasoning, or exception messages in the returned diagnostic. */
export async function runGemini(input: {
  apiKey?: string; prompt: GeminiPrompt; fetcher?: Fetcher; now?: () => number; signal?: AbortSignal;
  model?: GeminiModel; timeoutMs?: number;
}): Promise<GeminiResult> {
  const now = input.now ?? Date.now, started = now();
  const model = input.model ?? GEMINI_DEBATE_MODEL;
  const result: GeminiResult = { ok: false, code: 'missing_key', model,
    modelVersion: null, responseId: null, status: null, text: null, payload: null,
    usage: usageOf(undefined), latencyMs: 0, retryAfterMs: null };
  const finish = (code: GeminiResult['code']) => ({ ...result, ok: code === 'ok', code, latencyMs: Math.max(0, now() - started) });
  if (!input.apiKey?.trim()) return finish('missing_key');
  if (!GEMINI_MODELS.includes(model) || (input.timeoutMs !== undefined
    && (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1000 || input.timeoutMs > 150_000))) return finish('invalid_request');
  let body: string;
  try { body = geminiRequestBody(input.prompt); } catch { return finish('invalid_request'); }
  const deadline = AbortSignal.timeout(input.timeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([deadline, input.signal]) : deadline;
  try {
    signal.throwIfAborted();
    const response = await (input.fetcher ?? fetch)(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': input.apiKey.trim() }, body,
    });
    result.status = response.status;
    const retry = response.headers.get('retry-after');
    if (retry) {
      const delay = /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - now();
      if (Number.isFinite(delay) && delay >= 0) result.retryAfterMs = Math.min(delay, 86_400_000);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return finish([401, 403].includes(response.status) ? 'authentication'
        : response.status === 429 ? 'rate_limited' : 'provider_error');
    }
    let raw: unknown;
    const text = await boundedBody(response, signal);
    try { raw = JSON.parse(text); } catch { return finish('invalid_envelope'); }
    const decoded = envelopeSchema.safeParse(raw);
    if (!decoded.success) return finish('invalid_envelope');
    const data = decoded.data;
    result.usage = usageOf(data.usageMetadata);
    result.modelVersion = data.modelVersion ?? null;
    result.responseId = data.responseId ?? null;
    if (data.modelVersion && data.modelVersion !== model
      && !data.modelVersion.startsWith(`${model}-`)) return finish('unexpected_model');
    if (data.promptFeedback?.blockReason) return finish('blocked');
    if (data.candidates?.length !== 1) return finish('invalid_envelope');
    const candidate = data.candidates[0];
    if (!candidate) return finish('invalid_envelope');
    const parts = candidate.content?.parts ?? [];
    result.text = parts.filter(part => part.thought !== true).map(part => part.text ?? '').join('') || null;
    if (candidate.finishReason === 'MAX_TOKENS') return finish('truncated');
    if (candidate.finishReason !== 'STOP') return finish('blocked');
    try { result.payload = JSON.parse(result.text ?? ''); } catch { return finish('invalid_json'); }
    return finish('ok');
  } catch (error) {
    if (signal.aborted) return finish('timeout');
    if (error instanceof Error && error.message === 'response_too_large') return finish('response_too_large');
    return finish('network_error');
  }
}
