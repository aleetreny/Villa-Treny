import type { ProviderAttemptResult, ProviderId, RouterResult } from '../contracts';
import type { QuotaMaximum } from '../quota';
import { GROQ_120B_MODEL, GROQ_MODEL, runGroq } from './groq';
import { estimateGroqInputTokens } from './groq-token-estimate';
import { buildProviderRejectionDiagnostic, validationDiagnosticReason, type SelectedProviderCandidate } from './shared';
import { runWorkersAI } from './workers-ai';
import { deferredOrRejected, quotaFailure, workersMaximumFor, type RoutingInput, type cognitionReadyAt } from './router';

const REQUEST_WINDOW_MS = 45_000;
const ROUTE_WINDOW_MS = 110_000;
type Failure = Extract<ProviderAttemptResult, { ok: false }>;
type Destination = { provider: ProviderId; model: string };

/** This policy belongs to newly issued jobs only. Provider identity stays Groq;
 * the durable model identity selects its independent quota and circuit. */
function destinations(input: Pick<RoutingInput, 'config'>): Destination[] {
  return [
    { provider: 'workers-ai', model: input.config.WORKERS_AI_MODEL },
    ...(input.config.GROQ_120B_ENABLED ? [{ provider: 'groq' as const, model: GROQ_120B_MODEL }] : []),
    { provider: 'groq', model: GROQ_MODEL },
  ];
}

export async function routeFreeModels(input: RoutingInput): Promise<RouterResult> {
  const now = input.now ?? Date.now;
  const deadline = Math.min(now() + ROUTE_WINDOW_MS, input.deadlineAtMs ?? Number.POSITIVE_INFINITY);
  const reasons: ProviderAttemptResult[] = [], pacedUntil: number[] = [];
  // Both allowed Groq models use the same ordinary encoder and request framing.
  // Share this invocation's count only; never cache private prompts across jobs.
  let groqMaximum: QuotaMaximum | undefined;
  const refusal = (destination: Destination, attemptId: string, detailCode: string, retryable = false): Failure => ({
    ok: false, ...destination, attemptId, kind: 'rejected', retryable, detailCode, latencyMs: 0,
  });
  if (input.job.kind !== 'society_turn' || input.job.outputContract.name !== 'society_turn'
    || ![6, 7, 8].includes(input.job.outputContract.version) || !input.validatePayload) {
    return { status: 'rejected', reasons: [refusal(destinations(input)[0]!, input.job.jobId, 'invalid_routing_contract')] };
  }
  for (const destination of destinations(input)) {
    const { provider, model } = destination;
    const attemptId = `${input.job.jobId}:${provider}:${encodeURIComponent(model)}:${input.attemptOrdinal}`;
    if (input.canDispatch?.() === false) return { status: 'rejected',
      reasons: [...reasons, refusal(destination, attemptId, 'control_revision_changed')] };
    if (input.quota.dispatchedTotal(input.job.jobId) >= 4) {
      return { status: 'rejected', reasons: [...reasons, refusal(destination, attemptId, 'job_attempt_limit')] };
    }
    if (input.quota.dispatchedCount(input.job.jobId, provider, model) >= 2) {
      reasons.push(refusal(destination, attemptId, 'provider_attempt_limit'));
      continue;
    }
    if (provider === 'groq' && !input.groqApiKey) {
      reasons.push({ ...refusal(destination, attemptId, 'missing_api_key'), kind: 'misconfigured' });
      continue;
    }
    const maximum: QuotaMaximum = provider === 'workers-ai'
      ? workersMaximumFor(input.job, input.config.WORKERS_AI_MODEL)
      : (groqMaximum ??= { requests: 1, inputTokens: await estimateGroqInputTokens(input.job, GROQ_MODEL),
        outputTokens: input.job.maxOutputTokens, neurons: 0 });
    // Recheck after lazy tokenization before making any reservation. The
    // remaining window must fit a whole request, including a possible timeout.
    if (input.canDispatch?.() === false) return { status: 'rejected',
      reasons: [...reasons, refusal(destination, attemptId, 'control_revision_changed')] };
    const readyAt = input.pacing ? input.quota.pacing(provider, model, maximum, now()).readyAtMs : now();
    if (readyAt > now()) { pacedUntil.push(readyAt); continue; }
    if (!Number.isFinite(deadline) || deadline - now() < REQUEST_WINDOW_MS) {
      return deferredOrRejected([...reasons, { ...refusal(destination, attemptId, 'route_time_budget', true),
        retryAtMs: now() + 60_000 }], now(), pacedUntil);
    }
    const reservation = input.quota.reserve(attemptId, provider, maximum, now(), input.job.jobId, model);
    if (!reservation.allowed) {
      reasons.push(quotaFailure(provider, model, attemptId, reservation));
      if (reservation.reason === 'duplicate') return { status: 'rejected', reasons };
      continue;
    }
    input.quota.markDispatched(attemptId, now());
    let selected: SelectedProviderCandidate | undefined;
    const onCandidate = (candidate: SelectedProviderCandidate) => { selected = candidate; };
    const attempt = provider === 'workers-ai'
      ? await runWorkersAI({ ai: input.ai, job: input.job, attemptId, model, now, onCandidate })
      : await runGroq({ apiKey: input.groqApiKey, job: input.job, attemptId, model, now, onCandidate,
        ...(input.groqFetch ? { fetcher: input.groqFetch } : {}) });
    // A malformed answer still consumes provider resources. Settlement and the
    // durable result callback precede any alternative destination.
    if (attempt.usage) input.quota.settle(attempt.attemptId, attempt.usage, now());
    let result: ProviderAttemptResult = attempt;
    if (attempt.ok) {
      let validation: boolean | string;
      try { validation = input.validatePayload(attempt.payload); }
      catch { validation = 'validation_callback_failed'; }
      if (validation !== true) {
        result = { ok: false, provider, model, attemptId, kind: 'invalid-response', retryable: true,
          detailCode: 'invalid_cognition_payload', latencyMs: attempt.latencyMs, usage: attempt.usage,
          ...(attempt.providerRequestId ? { providerRequestId: attempt.providerRequestId } : {}) };
        if (selected) {
          try { result.diagnostic = await buildProviderRejectionDiagnostic({
            job: input.job, attemptId, provider, model, selected,
          }, validationDiagnosticReason(validation)); } catch { /* Accounting already retained. */ }
        }
      }
    }
    if (!result.ok && result.kind === 'invalid-response') {
      result = { ...result, retryable: input.quota.dispatchedCount(input.job.jobId, provider, model) < 2
        && input.quota.dispatchedTotal(input.job.jobId) < 4 };
    }
    const breakerReadyAt = input.quota.recordOutcome(result, now());
    if (!result.ok && result.retryable && breakerReadyAt !== undefined) {
      result = { ...result, retryAtMs: Math.max(result.retryAtMs ?? 0, breakerReadyAt) };
    }
    input.onAttempt?.(result);
    if (result.ok) return { status: 'completed', result, attempts: [...reasons, result] };
    reasons.push(result);
  }
  // Earlier failures can still carry retryable:true after a later destination
  // uses the final permitted submission. Do not leave that job retrying.
  if (input.quota.dispatchedTotal(input.job.jobId) >= 4) return { status: 'rejected', reasons };
  return deferredOrRejected(reasons, now(), pacedUntil);
}

/** A separate snapshot per model prevents both wasted capacity and multiplying
 * one model's remaining allowance. The dispatch path always checks again. */
export async function freeModelsReadyAt(input: Parameters<typeof cognitionReadyAt>[0]): Promise<number | null> {
  if (!input.freshJob && input.quota.dispatchedTotal(input.job.jobId) >= 4) return null;
  let earliest = Number.POSITIVE_INFINITY;
  let groqMaximum: QuotaMaximum | undefined;
  for (const { provider, model } of destinations(input)) {
    if (provider === 'groq' && !input.groqAvailable) continue;
    if (!input.freshJob && input.quota.dispatchedCount(input.job.jobId, provider, model) >= 2) continue;
    const maximum: QuotaMaximum = provider === 'workers-ai'
      ? workersMaximumFor(input.job, input.config.WORKERS_AI_MODEL)
      : (groqMaximum ??= { requests: 1, inputTokens: await estimateGroqInputTokens(input.job, GROQ_MODEL),
        outputTokens: input.job.maxOutputTokens, neurons: 0 });
    const snapshot = provider === 'workers-ai' ? input.pacingSnapshots?.workersAI
      : model === GROQ_120B_MODEL ? input.pacingSnapshots?.groq120B : input.pacingSnapshots?.groq;
    const decision = snapshot ? snapshot(maximum) : input.quota.pacing(provider, model, maximum, input.nowMs);
    earliest = Math.min(earliest, decision.readyAtMs);
    if (earliest <= input.nowMs) return earliest;
  }
  return Number.isFinite(earliest) ? earliest : null;
}
