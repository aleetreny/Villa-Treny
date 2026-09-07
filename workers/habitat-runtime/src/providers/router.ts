import { decodeCognition } from '../domain';
import type { ResidentId } from '../../../../src/lib/habitat/residents';
import type { CognitionJob, ProviderAttemptResult, RouterResult, RuntimeConfig } from '../contracts';
import { nextUtcDay, type QuotaMaximum, SqlQuotaLedger } from '../quota';
import { GROQ_MODEL, runGroq } from './groq';
import { estimateTokens } from './shared';
import {
  estimateQwenNeurons,
  runWorkersAI,
  WORKERS_AI_MODEL,
  type WorkersAIRunner,
} from './workers-ai';

export async function routeCognition(input: {
  ai: WorkersAIRunner;
  groqApiKey?: string;
  config: RuntimeConfig;
  job: CognitionJob;
  attemptOrdinal: number;
  quota: SqlQuotaLedger;
  now?: () => number;
  groqFetch?: typeof fetch;
}): Promise<RouterResult> {
  const now = input.now ?? Date.now;
  const promptTokens = estimateTokens([
    input.job.prompt.system,
    input.job.prompt.user,
    JSON.stringify(input.job.outputContract.jsonSchema),
  ].join('\n'));
  const reasons: ProviderAttemptResult[] = [];

  const workersAttemptId = `${input.job.jobId}:workers-ai:${input.attemptOrdinal}`;
  const workersMaximum: QuotaMaximum = {
    requests: 1,
    inputTokens: promptTokens,
    outputTokens: input.job.maxOutputTokens,
    neurons: estimateQwenNeurons(promptTokens, input.job.maxOutputTokens),
  };
  const workersReservation = input.quota.reserve(
    workersAttemptId,
    'workers-ai',
    workersMaximum,
    now(),
  );
  if (workersReservation.allowed) {
    input.quota.markDispatched(workersAttemptId, now());
    let result = await runWorkersAI({
      ai: input.ai,
      job: input.job,
      attemptId: workersAttemptId,
      model: input.config.WORKERS_AI_MODEL,
      now,
    });
    if (result.ok && !decodeCognition(input.job.subjects[0]!.id as ResidentId, result.payload)) {
      input.quota.settle(result.attemptId, result.usage, now());
      result = { ok: false, provider: result.provider, model: result.model, attemptId: result.attemptId,
        kind: 'invalid-response', retryable: false, detailCode: 'invalid_domain_intent', latencyMs: result.latencyMs };
    }
    input.quota.recordOutcome(result, now());
    if (result.ok) {
      input.quota.settle(workersAttemptId, result.usage, now());
      return { status: 'completed', result, attempts: [...reasons, result] };
    }
    reasons.push(result);
  } else {
    reasons.push(quotaFailure('workers-ai', WORKERS_AI_MODEL, workersAttemptId, workersReservation.retryAtMs));
  }

  const groqAttemptId = `${input.job.jobId}:groq:${input.attemptOrdinal}`;
  if (!input.groqApiKey) {
    const missingKey: Extract<ProviderAttemptResult, { ok: false }> = {
      ok: false,
      provider: 'groq',
      model: GROQ_MODEL,
      attemptId: groqAttemptId,
      kind: 'misconfigured',
      retryable: false,
      detailCode: 'missing_api_key',
      latencyMs: 0,
    };
    reasons.push(missingKey);
    return deferredOrRejected(reasons, now());
  }

  const groqMaximum: QuotaMaximum = {
    requests: 1,
    inputTokens: promptTokens,
    outputTokens: input.job.maxOutputTokens,
    neurons: 0,
  };
  const groqReservation = input.quota.reserve(
    groqAttemptId,
    'groq',
    groqMaximum,
    now(),
  );
  if (groqReservation.allowed) {
    input.quota.markDispatched(groqAttemptId, now());
    let result = await runGroq({
      apiKey: input.groqApiKey,
      job: input.job,
      attemptId: groqAttemptId,
      model: input.config.GROQ_MODEL,
      ...(input.groqFetch ? { fetcher: input.groqFetch } : {}),
      now,
    });
    if (!result.ok && result.kind === 'invalid-response' && input.attemptOrdinal > 1) {
      result = { ...result, retryable: false };
    }
    if (result.ok && !decodeCognition(input.job.subjects[0]!.id as ResidentId, result.payload)) {
      input.quota.settle(result.attemptId, result.usage, now());
      result = { ok: false, provider: result.provider, model: result.model, attemptId: result.attemptId,
        kind: 'invalid-response', retryable: false, detailCode: 'invalid_domain_intent', latencyMs: result.latencyMs };
    }
    input.quota.recordOutcome(result, now());
    if (result.ok) {
      input.quota.settle(groqAttemptId, result.usage, now());
      return { status: 'completed', result, attempts: [...reasons, result] };
    }
    reasons.push(result);
  } else {
    reasons.push(quotaFailure('groq', GROQ_MODEL, groqAttemptId, groqReservation.retryAtMs));
  }

  return deferredOrRejected(reasons, now());
}

function deferredOrRejected(reasons: ProviderAttemptResult[], nowMs: number): RouterResult {
  const retryable = reasons.filter(
    (reason): reason is Extract<ProviderAttemptResult, { ok: false }> => !reason.ok && reason.retryable,
  );
  if (retryable.length === 0) return { status: 'rejected', reasons };
  const firstProviderReadyAtMs = Math.min(
    ...retryable.map((reason) => reason.retryAtMs ?? nextUtcDay(nowMs)),
  );
  const retryAtMs = Math.max(nowMs + 15 * 60 * 1_000, firstProviderReadyAtMs);
  return { status: 'deferred', retryAtMs, reasons };
}

function quotaFailure(
  provider: 'workers-ai' | 'groq',
  model: string,
  attemptId: string,
  retryAtMs: number,
): Extract<ProviderAttemptResult, { ok: false }> {
  return {
    ok: false,
    provider,
    model,
    attemptId,
    kind: 'quota-exhausted',
    retryable: true,
    retryAtMs,
    detailCode: 'local_cost_firewall',
    latencyMs: 0,
  };
}
