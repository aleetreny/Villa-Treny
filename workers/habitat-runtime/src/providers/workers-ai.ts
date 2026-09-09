import type { CognitionJob, ProviderAttemptResult } from '../contracts';
import { buildProviderRejectionDiagnostic, errorCode, hasCompleteTokenUsage, notifyCandidate, parseStructuredPayload, sanitizeUsage, structuredPayloadReason, type CandidateObserver, type SelectedProviderCandidate } from './shared';
import { withProviderDeadline } from './deadline';

export const WORKERS_AI_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8' as const;
export const GEMMA_WORKERS_AI_MODEL = '@cf/google/gemma-4-26b-a4b-it' as const;
export const OSS_WORKERS_AI_MODEL = '@cf/openai/gpt-oss-120b' as const;
export type WorkersAIModel = typeof WORKERS_AI_MODEL | typeof GEMMA_WORKERS_AI_MODEL | typeof OSS_WORKERS_AI_MODEL;
export const WORKERS_AI_TIMEOUT_MS = 45_000;

export type WorkersAIRunner = {
  run(model: WorkersAIModel, input: unknown): Promise<unknown>;
};

export function isWorkersAIModel(model: string): model is WorkersAIModel {
  return model === WORKERS_AI_MODEL || model === GEMMA_WORKERS_AI_MODEL || model === OSS_WORKERS_AI_MODEL;
}

type WorkersAIResponse = {
  response?: unknown;
  choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    completion_tokens_details?: { reasoning_tokens?: unknown } | null;
    neurons?: unknown;
  };
};

function classifyWorkersAIError(error: unknown): {
  kind: Extract<ProviderAttemptResult, { ok: false }>['kind'];
  retryable: boolean;
} {
  const code = errorCode(error)?.toLowerCase() ?? '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const detail = `${code} ${message}`;

  if (code === 'providertimeout') return { kind: 'timeout', retryable: true };

  if (/rate.?limit|too many requests|429/.test(detail)) return { kind: 'rate-limited', retryable: true };
  if (detail.includes('quota') || detail.includes('10040')) {
    return { kind: 'quota-exhausted', retryable: true };
  }
  if (detail.includes('auth') || detail.includes('permission') || detail.includes('forbidden')) {
    return { kind: 'authentication', retryable: false };
  }
  if (detail.includes('model') || detail.includes('binding')) {
    return { kind: 'misconfigured', retryable: false };
  }
  return { kind: 'unavailable', retryable: true };
}

/** The live provider and isolated end-to-end experiment must use the same
 * prompt, schema framing, output cap and deterministic sampling seed. */
export function workersAIInput(job: CognitionJob, model: WorkersAIModel = WORKERS_AI_MODEL) {
  if (!isWorkersAIModel(model)) throw new Error('model_not_allowed');
  if (model === GEMMA_WORKERS_AI_MODEL || model === OSS_WORKERS_AI_MODEL) {
    return {
      messages: [
        { role: 'system', content: job.prompt.system },
        { role: 'user', content: job.prompt.user },
      ],
      max_completion_tokens: job.maxOutputTokens,
      temperature: 0.3,
      seed: stableSeed(job.jobId),
      stream: false,
      ...(model === GEMMA_WORKERS_AI_MODEL ? { chat_template_kwargs: { enable_thinking: false } }
        : { reasoning_effort: 'low' }),
      response_format: { type: 'json_schema', json_schema: {
        name: job.outputContract.name, schema: job.outputContract.jsonSchema, strict: true,
      } },
    };
  }
  // Preserve this historical Qwen payload, including the default argument,
  // so isolated replay tooling can still reconstruct its original requests.
  const society = job.outputContract.name === 'society_turn';
  return {
    messages: [
      { role: 'system', content: society ? job.prompt.system : `${job.prompt.system}\nOutput JSON Schema: ${JSON.stringify(job.outputContract.jsonSchema)}` },
      // Qwen's documented soft switch leaves the bounded budget for the JSON.
      { role: 'user', content: `${job.prompt.user}\n/no_think` },
    ],
    max_tokens: job.maxOutputTokens,
    temperature: 0.3,
    seed: stableSeed(job.jobId),
    ...(society ? { response_format: { type: 'json_schema', json_schema: job.outputContract.jsonSchema } } : {}),
  };
}

export async function runWorkersAI(input: {
  ai: WorkersAIRunner;
  job: CognitionJob;
  attemptId: string;
  model: string;
  now?: () => number;
  onCandidate?: CandidateObserver;
}): Promise<ProviderAttemptResult> {
  const now = input.now ?? Date.now;
  const startedAt = now();

  if (!isWorkersAIModel(input.model)) {
    return {
      ok: false,
      provider: 'workers-ai',
      model: input.model,
      attemptId: input.attemptId,
      kind: 'policy-blocked',
      retryable: false,
      detailCode: 'model_not_allowed',
      latencyMs: 0,
    };
  }

  try {
    const request = workersAIInput(input.job, input.model);
    const raw = (await withProviderDeadline(input.ai.run(input.model, request), WORKERS_AI_TIMEOUT_MS)) as WorkersAIResponse;

    // Qwen now returns the OpenAI chat-completion envelope, unlike older
    // Workers AI models. Reading only `response` discarded every valid thought.
    const usage = sanitizeUsage(raw?.usage);
    const reported = raw?.usage?.neurons;
    if (reported !== undefined && (typeof reported !== 'number' || !Number.isFinite(reported)
      || reported < 0 || reported > Number.MAX_SAFE_INTEGER)) usage.incomplete = true;
    if (hasCompleteTokenUsage(usage)) {
      const priced = estimateWorkersAINeurons(input.model, usage.inputTokens, usage.outputTokens);
      // A provider's complete metered amount can raise accounting; it never
      // authorizes a larger refund than the known tariff on reported tokens.
      usage.neurons = typeof reported === 'number'
        ? Math.max(priced, Math.ceil(reported)) : priced;
    }
    const choice = raw?.choices?.[0];
    const selected: SelectedProviderCandidate = {
      value: choice?.message?.content ?? raw?.response, source: 'workers_ai_binding',
      selectedField: choice?.message?.content != null ? 'choices[0].message.content' : raw?.response !== undefined ? 'response' : 'none',
      finishReason: choice?.finish_reason, systemMessage: request.messages[0]!.content, userMessage: request.messages[1]!.content,
    };
    notifyCandidate(input.onCandidate, selected);
    const diagnostic = (reason: Parameters<typeof buildProviderRejectionDiagnostic>[1]) => buildProviderRejectionDiagnostic({
      job: input.job, attemptId: input.attemptId, provider: 'workers-ai', model: input.model, selected,
    }, reason);
    if (choice?.finish_reason === 'length') {
      return {
        ok: false, provider: 'workers-ai', model: input.model,
        attemptId: input.attemptId, kind: 'invalid-response', retryable: true,
        detailCode: 'output_truncated', usage, latencyMs: now() - startedAt,
        diagnostic: await diagnostic({ stage: 'truncated', phase: 'provider_finish', code: 'output_truncated' }),
      };
    }
    let payload;
    try {
      payload = parseStructuredPayload(selected.value);
    } catch (error) {
      return { ok: false, provider: 'workers-ai', model: input.model, attemptId: input.attemptId,
        kind: 'invalid-response', retryable: true, detailCode: 'invalid_structured_output', usage, latencyMs: now() - startedAt,
        diagnostic: await diagnostic(structuredPayloadReason(error)) };
    }

    return {
      ok: true,
      provider: 'workers-ai',
      model: input.model,
      attemptId: input.attemptId,
      payload,
      usage,
      latencyMs: now() - startedAt,
    };
  } catch (error) {
    const classification = classifyWorkersAIError(error);
    const detailCode = errorCode(error);
    return {
      ok: false,
      provider: 'workers-ai',
      model: input.model,
      attemptId: input.attemptId,
      ...classification,
      ...(detailCode ? { detailCode } : {}),
      latencyMs: now() - startedAt,
    };
  }
}

export function estimateQwenNeurons(inputTokens: number, outputTokens: number): number {
  return estimateWorkersAINeurons(WORKERS_AI_MODEL, inputTokens, outputTokens);
}

/** Current rates for new reservations/results only; stored ledger usage is
 * already settled and must never be repriced after a configuration change. */
export function estimateWorkersAINeurons(model: WorkersAIModel, inputTokens: number, outputTokens: number): number {
  if (!isWorkersAIModel(model)) throw new Error('model_not_allowed');
  const rates = model === OSS_WORKERS_AI_MODEL ? { input: 31_818, output: 68_182 }
    : model === GEMMA_WORKERS_AI_MODEL ? { input: 9_091, output: 27_273 } : { input: 4_625, output: 30_475 };
  return Math.ceil((inputTokens * rates.input + outputTokens * rates.output) / 1_000_000);
}

function stableSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) || 1;
}
