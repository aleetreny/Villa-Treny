import type { CognitionJob, ProviderAttemptResult } from '../contracts';
import { parseStructuredPayload, sanitizeUsage } from './shared';

export const GROQ_MODEL = 'openai/gpt-oss-20b' as const;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function retryAt(response: Response, now: number): number {
  const raw = response.headers.get('retry-after');
  if (!raw) return now + 60_000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return now + Math.max(1, seconds) * 1_000;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? Math.max(now + 1_000, timestamp) : now + 60_000;
}

async function groqErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as {
      error?: { code?: unknown; type?: unknown };
    };
    const code = body.error?.code ?? body.error?.type;
    return typeof code === 'string' ? code.slice(0, 80) : undefined;
  } catch {
    return undefined;
  }
}

export async function runGroq(input: {
  apiKey: string | undefined;
  job: CognitionJob;
  attemptId: string;
  model: string;
  fetcher?: Fetcher;
  now?: () => number;
}): Promise<ProviderAttemptResult> {
  const now = input.now ?? Date.now;
  const startedAt = now();

  if (input.model !== GROQ_MODEL) {
    return failure(input, 'policy-blocked', false, startedAt, now, 'model_not_allowed');
  }
  if (!input.apiKey) {
    return failure(input, 'misconfigured', false, startedAt, now, 'missing_api_key');
  }

  const fetcher = input.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
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
            strict: true,
            schema: input.job.outputContract.jsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(45_000),
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

  if (!response.ok) {
    const detailCode = await groqErrorCode(response);
    const latencyMs = now() - startedAt;
    if (detailCode === 'json_validate_failed') {
      return failure(input, 'invalid-response', true, startedAt, now, detailCode);
    }
    if (detailCode === 'blocked_api_access') {
      return {
        ok: false,
        provider: 'groq',
        model: GROQ_MODEL,
        attemptId: input.attemptId,
        kind: 'policy-blocked',
        retryable: false,
        ...(detailCode ? { detailCode } : {}),
        latencyMs,
      };
    }
    if (response.status === 429) {
      return {
        ok: false,
        provider: 'groq',
        model: GROQ_MODEL,
        attemptId: input.attemptId,
        kind: 'rate-limited',
        retryable: true,
        retryAtMs: retryAt(response, now()),
        ...(detailCode ? { detailCode } : {}),
        latencyMs,
      };
    }
    if (response.status === 401 || response.status === 403) {
      return failure(input, 'authentication', false, startedAt, now, detailCode);
    }
    if (response.status >= 500) {
      return failure(input, 'unavailable', true, startedAt, now, detailCode);
    }
    if (response.status === 422) {
      return failure(input, 'invalid-response', true, startedAt, now, detailCode);
    }
    return failure(input, 'rejected', false, startedAt, now, detailCode);
  }

  try {
    const body = (await response.json()) as {
      id?: unknown;
      choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }>;
      usage?: {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        total_tokens?: unknown;
      };
      x_groq?: { id?: unknown };
    };
    const content = body.choices?.[0]?.message?.content;
    if (body.choices?.[0]?.finish_reason === 'length') {
      return failure(input, 'invalid-response', true, startedAt, now, 'output_truncated');
    }
    const payload = parseStructuredPayload(content);
    const requestId = body.x_groq?.id ?? body.id;
    return {
      ok: true,
      provider: 'groq',
      model: GROQ_MODEL,
      attemptId: input.attemptId,
      ...(typeof requestId === 'string' ? { providerRequestId: requestId.slice(0, 160) } : {}),
      payload,
      usage: sanitizeUsage(body.usage),
      latencyMs: now() - startedAt,
    };
  } catch {
    return failure(input, 'invalid-response', false, startedAt, now, 'invalid_structured_output');
  }
}

function failure(
  input: { attemptId: string },
  kind: Extract<ProviderAttemptResult, { ok: false }>['kind'],
  retryable: boolean,
  startedAt: number,
  now: () => number,
  detailCode?: string,
): Extract<ProviderAttemptResult, { ok: false }> {
  return {
    ok: false,
    provider: 'groq',
    model: GROQ_MODEL,
    attemptId: input.attemptId,
    kind,
    retryable,
    ...(detailCode ? { detailCode } : {}),
    latencyMs: now() - startedAt,
  };
}
