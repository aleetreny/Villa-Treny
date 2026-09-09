import type { CognitionJob, ProviderAttemptResult } from '../contracts';
import { buildProviderRejectionDiagnostic, notifyCandidate, parseStructuredPayload, sanitizeUsage, structuredPayloadReason, type CandidateObserver, type SelectedProviderCandidate } from './shared';

export const GROQ_MODEL = 'openai/gpt-oss-20b' as const;
export const GROQ_120B_MODEL = 'openai/gpt-oss-120b' as const;
export type GroqModel = typeof GROQ_MODEL | typeof GROQ_120B_MODEL;
export function isGroqModel(model: string): model is GroqModel {
  return model === GROQ_MODEL || model === GROQ_120B_MODEL;
}
export const GROQ_MAX_RESPONSE_BYTES = 256 * 1024;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

class ResponseTooLargeError extends Error {}

/** The output token cap does not bound HTTP error bodies. Count decoded stream
 * bytes even without Content-Length, and keep the request deadline through EOF.
 * No partial body can establish usage or become a resident's response. */
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > GROQ_MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw new ResponseTooLargeError();
  }
  if (!response.body) throw new SyntaxError('Empty provider response');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > GROQ_MAX_RESPONSE_BYTES) throw new ResponseTooLargeError();
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

function retryAt(response: Response, now: number): number {
  const raw = response.headers.get('retry-after');
  if (!raw) return now + 60_000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return now + Math.max(1, seconds) * 1_000;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? Math.max(now + 1_000, timestamp) : now + 60_000;
}

type GroqResponse = {
  id?: unknown;
  choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }>;
  usage?: Parameters<typeof sanitizeUsage>[0];
  error?: { code?: unknown; type?: unknown; failed_generation?: unknown; usage?: Parameters<typeof sanitizeUsage>[0] };
  x_groq?: { id?: unknown; usage?: Parameters<typeof sanitizeUsage>[0] };
};

export async function runGroq(input: {
  apiKey: string | undefined;
  job: CognitionJob;
  attemptId: string;
  model: string;
  fetcher?: Fetcher;
  now?: () => number;
  onCandidate?: CandidateObserver;
}): Promise<ProviderAttemptResult> {
  const now = input.now ?? Date.now;
  const startedAt = now();

  if (!isGroqModel(input.model)) {
    return failure(input, 'policy-blocked', false, startedAt, now, 'model_not_allowed');
  }
  if (!input.apiKey) {
    return failure(input, 'misconfigured', false, startedAt, now, 'missing_api_key');
  }

  const fetcher = input.fetcher ?? fetch;
  const signal = AbortSignal.timeout(45_000);
  let response: Response;
  try {
    response = await fetcher(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: 'system', content: input.job.prompt.system },
          { role: 'user', content: input.job.prompt.user },
        ],
        reasoning_effort: 'low',
        max_completion_tokens: input.job.maxOutputTokens,
        stream: false,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: input.job.outputContract.name,
            // The compact society wire has optional union members. Local
            // validation remains mandatory; the legacy intent stays strict.
            strict: input.job.outputContract.name !== 'society_turn',
            schema: input.job.outputContract.jsonSchema,
          },
        },
      }),
      signal,
    });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === 'TimeoutError';
    return failure(
      input,
      timeout ? 'timeout' : 'unavailable',
      true,
      startedAt,
      now,
      timeout ? 'request_timeout' : 'network_error',
    );
  }

  let body: GroqResponse | undefined;
  let bodyError: 'response_too_large' | undefined;
  let envelopeCode: 'invalid_envelope_json' | 'invalid_envelope_shape' | 'response_too_large' | undefined;
  try {
    const decoded = await boundedJson(response, signal);
    if (decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)) body = decoded;
    else envelopeCode = 'invalid_envelope_shape';
  } catch (error) {
    if (signal.aborted) return failure(input, 'timeout', true, startedAt, now, 'request_timeout');
    if (error instanceof ResponseTooLargeError) bodyError = 'response_too_large';
    envelopeCode = bodyError ?? 'invalid_envelope_json';
    // HTTP status remains authoritative even when its body is not usable.
  }
  const usage = sanitizeUsage(body?.usage ?? body?.x_groq?.usage ?? body?.error?.usage);
  const requestId = body?.x_groq?.id ?? body?.id;
  const metadata = { usage, ...(typeof requestId === 'string' ? { providerRequestId: requestId.slice(0, 160) } : {}) };
  const reject = (kind: Extract<ProviderAttemptResult, { ok: false }>['kind'], retryable: boolean, code?: string) =>
    ({ ...failure(input, kind, retryable, startedAt, now, code), ...metadata });

  const choice = body?.choices?.[0];
  const failedGeneration = !response.ok && body?.error?.failed_generation !== undefined;
  const selected: SelectedProviderCandidate = {
    value: failedGeneration ? body?.error?.failed_generation : choice?.message?.content, source: 'groq_http_json',
    selectedField: failedGeneration ? 'error.failed_generation' : choice?.message?.content !== undefined ? 'choices[0].message.content' : 'none',
    finishReason: choice?.finish_reason, httpStatus: response.status,
    systemMessage: input.job.prompt.system, userMessage: input.job.prompt.user,
  };
  notifyCandidate(input.onCandidate, selected);
  const diagnostic = (reason: Parameters<typeof buildProviderRejectionDiagnostic>[1]) => buildProviderRejectionDiagnostic({
    job: input.job, attemptId: input.attemptId, provider: 'groq', model: input.model, selected,
  }, reason);

  if (!response.ok) {
    const errorCode = body?.error?.code ?? body?.error?.type;
    const detailCode = typeof errorCode === 'string' ? errorCode.slice(0, 80) : bodyError;
    const latencyMs = now() - startedAt;
    if (detailCode === 'json_validate_failed') {
      return { ...reject('invalid-response', true, detailCode), diagnostic: await diagnostic({
        stage: 'schema', phase: 'schema_or_decode', code: 'json_validate_failed',
      }) };
    }
    if (detailCode === 'blocked_api_access') {
      return {
        ok: false,
        provider: 'groq',
        model: input.model,
        attemptId: input.attemptId,
        kind: 'policy-blocked',
        retryable: false,
        ...(detailCode ? { detailCode } : {}),
        latencyMs,
        ...metadata,
      };
    }
    if (response.status === 429) {
      return {
        ok: false,
        provider: 'groq',
        model: input.model,
        attemptId: input.attemptId,
        kind: 'rate-limited',
        retryable: true,
        retryAtMs: retryAt(response, now()),
        ...(detailCode ? { detailCode } : {}),
        latencyMs,
        ...metadata,
      };
    }
    if (response.status === 401 || response.status === 403) {
      return reject('authentication', false, detailCode);
    }
    if (response.status >= 500) {
      return reject('unavailable', true, detailCode);
    }
    if (response.status === 422) {
      return { ...reject('invalid-response', true, detailCode), diagnostic: await diagnostic({
        stage: 'schema', phase: 'schema_or_decode', code: 'provider_schema_rejected',
      }) };
    }
    return reject('rejected', false, detailCode);
  }

  if (bodyError) return { ...reject('invalid-response', true, bodyError), diagnostic: await diagnostic({
    stage: 'truncated', phase: 'envelope_json', code: bodyError,
  }) };
  try {
    if (choice?.finish_reason === 'length') {
      return { ...reject('invalid-response', true, 'output_truncated'), diagnostic: await diagnostic({
        stage: 'truncated', phase: 'provider_finish', code: 'output_truncated',
      }) };
    }
    const payload = parseStructuredPayload(selected.value);
    return {
      ok: true,
      provider: 'groq',
      model: input.model,
      attemptId: input.attemptId,
      ...metadata,
      payload,
      latencyMs: now() - startedAt,
    };
  } catch (error) {
    return { ...reject('invalid-response', true, 'invalid_structured_output'),
      diagnostic: await diagnostic(envelopeCode ? { stage: envelopeCode === 'invalid_envelope_shape' ? 'schema' : 'parse',
        phase: 'envelope_json', code: envelopeCode } : structuredPayloadReason(error)) };
  }
}

function failure(
  input: { attemptId: string; model: string },
  kind: Extract<ProviderAttemptResult, { ok: false }>['kind'],
  retryable: boolean,
  startedAt: number,
  now: () => number,
  detailCode?: string,
): Extract<ProviderAttemptResult, { ok: false }> {
  return {
    ok: false,
    provider: 'groq',
    model: input.model,
    attemptId: input.attemptId,
    kind,
    retryable,
    ...(detailCode ? { detailCode } : {}),
    latencyMs: now() - startedAt,
  };
}
