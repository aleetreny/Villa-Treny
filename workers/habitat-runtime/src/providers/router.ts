import { decodeCognition } from '../domain';
import type { ResidentId } from '../../../../src/lib/habitat/residents';
import type { CognitionJob, JsonValue, ProviderAttemptResult, RouterResult, RuntimeConfig } from '../contracts';
import { PROVIDER_RETRY_MS, type QuotaMaximum, type QuotaReservationDecision, SqlQuotaLedger } from '../quota';
import { GROQ_MODEL, runGroq } from './groq';
import { buildProviderRejectionDiagnostic, estimateTokens, validationDiagnosticReason, type SelectedProviderCandidate } from './shared';
import { estimateGroqInputTokens } from './groq-token-estimate';
import { freeModelsReadyAt, routeFreeModels } from './free-model-router';
import {
  estimateWorkersAINeurons,
  isWorkersAIModel,
  runWorkersAI,
  workersAIInput,
  type WorkersAIRunner,
} from './workers-ai';

export type RoutingInput = {
  ai: WorkersAIRunner;
  groqApiKey?: string;
  config: RuntimeConfig;
  job: CognitionJob;
  attemptOrdinal: number;
  quota: SqlQuotaLedger;
  now?: () => number;
  groqFetch?: typeof fetch;
  /** Only true accepts. An internal rejection code can enrich the private receipt. */
  validatePayload?: (payload: JsonValue) => boolean | string;
  canDispatch?: () => boolean;
  /** Synchronous durable receipt before fallback. Accounting failures must stop dispatch. */
  onAttempt?: (attempt: ProviderAttemptResult) => void;
  /** Autonomous runtime only; isolated explicit probes retain their own budgets. */
  pacing?: boolean;
  /** The caller leaves time to persist the result before its durable lease ends. */
  deadlineAtMs?: number;
};

export async function routeCognition(input: RoutingInput): Promise<RouterResult> {
  const now = input.now ?? Date.now;
  // Configuration is validated at startup, but injected/stale callers must
  // also fail closed before reserving quota or dispatching any fallback.
  if (!isWorkersAIModel(input.config.WORKERS_AI_MODEL)) {
    return { status: 'rejected', reasons: [{ ok: false, provider: 'workers-ai',
      model: input.config.WORKERS_AI_MODEL, attemptId: `${input.job.jobId}:workers-ai:${input.attemptOrdinal}`,
      kind: 'policy-blocked', retryable: false, detailCode: 'model_not_allowed', latencyMs: 0 }] };
  }
  if (input.job.routingPolicy === 'free-models-v1') return routeFreeModels(input);
  const canRetryInvalid = (provider: ProviderAttemptResult['provider']) =>
    // Older injected ledgers have no accessor. Production SQL counts actual
    // submissions, including an ambiguous response, rather than alarm wakes.
    (input.quota.dispatchedCount?.(input.job.jobId, provider) ?? input.attemptOrdinal) < 2;
  const validate = input.validatePayload ?? ((payload: JsonValue) => Boolean(decodeCognition(input.job.subjects[0]!.id as ResidentId, payload)));
  const validateResult = (result: ProviderAttemptResult, selected?: SelectedProviderCandidate): ProviderAttemptResult | Promise<ProviderAttemptResult> => {
    if (result.usage) input.quota.settle(result.attemptId, result.usage, now());
    let validation: boolean | string = true;
    if (result.ok) {
      try { validation = validate(result.payload); } catch { validation = 'validation_callback_failed'; }
    }
    if (result.ok && validation !== true) {
      const rejected: Extract<ProviderAttemptResult, { ok: false }> = {
        ok: false, provider: result.provider, model: result.model, attemptId: result.attemptId,
        kind: 'invalid-response', retryable: canRetryInvalid(result.provider),
        detailCode: input.validatePayload ? 'invalid_cognition_payload' : 'invalid_domain_intent',
        usage: result.usage, ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}), latencyMs: result.latencyMs,
      };
      return selected ? buildProviderRejectionDiagnostic({ job: input.job,
        attemptId: result.attemptId, provider: result.provider, model: result.model, selected,
      }, validationDiagnosticReason(input.validatePayload ? validation : 'invalid_domain_intent'))
        .then(diagnostic => ({ ...rejected, diagnostic }), () => rejected) : rejected;
    }
    if (!result.ok && result.kind === 'invalid-response') return { ...result, retryable: canRetryInvalid(result.provider) };
    return result;
  };
  const recordResult = (result: ProviderAttemptResult): ProviderAttemptResult => {
    const readyAt = input.quota.recordOutcome(result, now());
    const recorded = !result.ok && result.retryable && readyAt !== undefined
      ? { ...result, retryAtMs: Math.max(result.retryAtMs ?? 0, readyAt) } : result;
    input.onAttempt?.(recorded);
    return recorded;
  };
  const reasons: ProviderAttemptResult[] = [];
  const pacedUntil: number[] = [];
  const cancelled = (provider: ProviderAttemptResult['provider'], model: string, attemptId: string): RouterResult => ({
    status: 'rejected',
    reasons: [...reasons, { ok: false, provider, model, attemptId, kind: 'rejected',
      retryable: false, detailCode: 'control_revision_changed', latencyMs: 0 }],
  });
  const lacksRequestWindow = () => input.deadlineAtMs !== undefined
    && (!Number.isFinite(input.deadlineAtMs) || input.deadlineAtMs - now() < 45_000);
  const deadlineDeferred = (provider: ProviderAttemptResult['provider'], model: string, attemptId: string) =>
    deferredOrRejected([...reasons, { ok: false, provider, model, attemptId, kind: 'rejected',
      retryable: true, detailCode: 'route_time_budget', retryAtMs: now() + 60_000, latencyMs: 0 }], now(), pacedUntil);

  const workersAttemptId = `${input.job.jobId}:workers-ai:${input.attemptOrdinal}`;
  const workersMaximum = workersMaximumFor(input.job, input.config.WORKERS_AI_MODEL);
  // Keep this guard, reservation and dispatch synchronous: control cannot
  // interleave until the provider await. A paused job creates no reservation.
  if (input.canDispatch?.() === false) return cancelled('workers-ai', input.config.WORKERS_AI_MODEL, workersAttemptId);
  const workersReadyAt = input.pacing && input.quota.dispatchedCount(input.job.jobId, 'workers-ai') < 2 ? input.quota.pacing('workers-ai', input.config.WORKERS_AI_MODEL, workersMaximum, now()).readyAtMs : now();
  if (workersReadyAt <= now() && lacksRequestWindow()) return deadlineDeferred('workers-ai', input.config.WORKERS_AI_MODEL, workersAttemptId);
  const workersReservation = workersReadyAt > now() ? undefined : input.quota.reserve(
    workersAttemptId,
    'workers-ai',
    workersMaximum,
    now(),
    input.job.jobId,
  );
  if (workersReservation?.allowed) {
    input.quota.markDispatched(workersAttemptId, now());
    let selected: SelectedProviderCandidate | undefined;
    const attempt = await runWorkersAI({
      ai: input.ai,
      job: input.job,
      attemptId: workersAttemptId,
      model: input.config.WORKERS_AI_MODEL,
      now, onCandidate: candidate => { selected = candidate; },
    });
    const validated = validateResult(attempt, selected);
    // Preserve the synchronous acceptance path; only rejected evidence is hashed.
    const result = recordResult(validated instanceof Promise ? await validated : validated);
    if (result.ok) {
      return { status: 'completed', result, attempts: [...reasons, result] };
    }
    reasons.push(result);
  } else if (workersReservation) {
    reasons.push(quotaFailure('workers-ai', input.config.WORKERS_AI_MODEL, workersAttemptId, workersReservation));
    if (workersReservation.reason === 'duplicate') return { status: 'rejected', reasons };
  } else pacedUntil.push(workersReadyAt);

  const groqAttemptId = `${input.job.jobId}:groq:${input.attemptOrdinal}`;
  // Re-check after the primary await, before reserving or sending fallback.
  if (input.canDispatch?.() === false) return cancelled('groq', input.config.GROQ_MODEL, groqAttemptId);
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
    return deferredOrRejected(reasons, now(), pacedUntil);
  }

  const groqMaximum: QuotaMaximum = {
    requests: 1,
    inputTokens: await estimateGroqInputTokens(input.job, input.config.GROQ_MODEL),
    outputTokens: input.job.maxOutputTokens,
    neurons: 0,
  };
  // Lazy tokenizer initialization is an await point. Recheck control, then keep
  // reservation and dispatch synchronous so a pause cannot leak a submission.
  if (input.canDispatch?.() === false) return cancelled('groq', input.config.GROQ_MODEL, groqAttemptId);
  const groqReadyAt = input.pacing && input.quota.dispatchedCount(input.job.jobId, 'groq') < 2 ? input.quota.pacing('groq', input.config.GROQ_MODEL, groqMaximum, now()).readyAtMs : now();
  if (groqReadyAt <= now() && lacksRequestWindow()) return deadlineDeferred('groq', input.config.GROQ_MODEL, groqAttemptId);
  const groqReservation = groqReadyAt > now() ? undefined : input.quota.reserve(
    groqAttemptId,
    'groq',
    groqMaximum,
    now(),
    input.job.jobId,
  );
  if (groqReservation?.allowed) {
    input.quota.markDispatched(groqAttemptId, now());
    let selected: SelectedProviderCandidate | undefined;
    const attempt = await runGroq({
      apiKey: input.groqApiKey,
      job: input.job,
      attemptId: groqAttemptId,
      model: input.config.GROQ_MODEL,
      ...(input.groqFetch ? { fetcher: input.groqFetch } : {}),
      now, onCandidate: candidate => { selected = candidate; },
    });
    const validated = validateResult(attempt, selected);
    // Preserve the synchronous acceptance path; only rejected evidence is hashed.
    const result = recordResult(validated instanceof Promise ? await validated : validated);
    if (result.ok) {
      return { status: 'completed', result, attempts: [...reasons, result] };
    }
    reasons.push(result);
  } else if (groqReservation) {
    reasons.push(quotaFailure('groq', GROQ_MODEL, groqAttemptId, groqReservation));
  } else pacedUntil.push(groqReadyAt);

  return deferredOrRejected(reasons, now(), pacedUntil);
}

export function deferredOrRejected(reasons: ProviderAttemptResult[], nowMs: number, pacedUntil: number[] = []): RouterResult {
  const retryable = reasons.filter(
    (reason): reason is Extract<ProviderAttemptResult, { ok: false }> => !reason.ok && reason.retryable,
  );
  if (retryable.length === 0 && pacedUntil.length === 0) return { status: 'rejected', reasons };
  const firstProviderReadyAtMs = Math.min(
    ...pacedUntil,
    ...retryable.map((reason) => reason.retryAtMs ?? nowMs + PROVIDER_RETRY_MS),
  );
  const retryAtMs = Math.max(nowMs + 1_000, firstProviderReadyAtMs);
  return { status: 'deferred', retryAtMs, reasons };
}

export function quotaFailure(
  provider: 'workers-ai' | 'groq',
  model: string,
  attemptId: string,
  decision: Exclude<QuotaReservationDecision, { allowed: true }>,
): Extract<ProviderAttemptResult, { ok: false }> {
  return {
    ok: false,
    provider,
    model,
    attemptId,
    kind: decision.reason === 'duplicate' || decision.reason === 'attempt-limit' ? 'rejected'
      : decision.reason === 'circuit-open' ? 'unavailable' : 'quota-exhausted',
    retryable: decision.reason !== 'duplicate' && decision.reason !== 'attempt-limit' && decision.limit !== 'request-size',
    retryAtMs: decision.retryAtMs,
    detailCode: decision.reason === 'attempt-limit' ? 'provider_attempt_limit'
      : decision.reason === 'duplicate' ? 'duplicate_attempt' : decision.reason === 'circuit-open'
      ? 'provider_circuit_open' : `local_${decision.limit ?? 'quota'}_limit`,
    latencyMs: 0,
  };
}

export function workersMaximumFor(job: CognitionJob, model: RuntimeConfig['WORKERS_AI_MODEL']): QuotaMaximum {
  const inputTokens = estimateTokens(JSON.stringify(workersAIInput(job, model)));
  return { requests: 1, inputTokens, outputTokens: job.maxOutputTokens,
    neurons: estimateWorkersAINeurons(model, inputTokens, job.maxOutputTokens) };
}

/** Read-only preflight, before creating/claiming a durable job. Initializing the
 * tokenizer is the only await; callers must recheck their captured generation. */
export async function cognitionReadyAt(input: { job: CognitionJob; config: RuntimeConfig;
  quota: SqlQuotaLedger; nowMs: number; groqAvailable: boolean;
  /** Only a not-yet-persisted job with a newly allocated sequence. */
  freshJob?: boolean;
  pacingSnapshots?: { workersAI: ReturnType<SqlQuotaLedger['pacingSnapshot']>; groq?: ReturnType<SqlQuotaLedger['pacingSnapshot']>;
    groq120B?: ReturnType<SqlQuotaLedger['pacingSnapshot']> };
}): Promise<number | null> {
  if (input.job.routingPolicy === 'free-models-v1') return freeModelsReadyAt(input);
  const workersPacing = input.pacingSnapshots?.workersAI ?? ((maximum: QuotaMaximum) =>
    input.quota.pacing('workers-ai', input.config.WORKERS_AI_MODEL, maximum, input.nowMs));
  const workers = !input.freshJob && input.quota.dispatchedCount(input.job.jobId, 'workers-ai') >= 2
    ? Number.POSITIVE_INFINITY : workersPacing(workersMaximumFor(input.job, input.config.WORKERS_AI_MODEL)).readyAtMs;
  if (workers <= input.nowMs) return workers;
  if (!input.groqAvailable || (!input.freshJob && input.quota.dispatchedCount(input.job.jobId, 'groq') >= 2)) return Number.isFinite(workers) ? workers : null;
  const groqMaximum: QuotaMaximum = { requests: 1, neurons: 0, outputTokens: input.job.maxOutputTokens,
    inputTokens: await estimateGroqInputTokens(input.job, input.config.GROQ_MODEL) };
  const groqPacing = input.pacingSnapshots?.groq ?? ((maximum: QuotaMaximum) =>
    input.quota.pacing('groq', input.config.GROQ_MODEL, maximum, input.nowMs));
  return Math.min(workers, groqPacing(groqMaximum).readyAtMs);
}
