/** Scheduling estimates never grant quota. The authoritative maximum is still
 * reserved synchronously immediately before each provider dispatch. */
export type PacingCharge = {
  dispatchedAtMs: number | null;
  activityAtMs: number;
  expiresAtMs: number;
  charged: number;
  requests: number;
  model: string | null;
};
export type PacingDecision = {
  readyAtMs: number;
  estimatedCost: number;
  remaining: number;
  estimatedOpportunities: number;
};

export function providerPacing(input: {
  nowMs: number;
  model: string;
  limit: number;
  maximum: number;
  requestLimit?: number;
  /** Actual next UTC reset for Workers AI. Groq uses its charges' own expiry. */
  resetAtMs?: number;
  charges: readonly PacingCharge[];
}): PacingDecision {
  const active = input.charges.filter((c) => c.expiresAtMs > input.nowMs);
  const dispatched = active.filter((c) => c.dispatchedAtMs !== null)
    .sort((a, b) => b.dispatchedAtMs! - a.dispatchedAtMs!);
  // Unknown model/usage remains conservative. A known different model's cheap
  // history cannot make the currently selected model seem cheap.
  const samples = dispatched.filter((c) => c.model === null || c.model === input.model).slice(0, 8);
  const estimatedCost = Math.max(1, samples.length
    ? samples.reduce((sum, c) => sum + c.charged, 0) / samples.length : input.maximum);
  const used = active.reduce((sum, c) => sum + c.charged, 0);
  const usedRequests = active.reduce((sum, c) => sum + c.requests, 0);
  const remaining = Math.max(0, input.limit - used);
  const requestSlots = input.requestLimit === undefined ? Number.MAX_SAFE_INTEGER
    : Math.max(0, input.requestLimit - usedRequests);
  // Leave room for the next actual maximum; estimate later settlements using
  // observed cost, rather than treating a byte-based maximum as typical usage.
  const estimatedOpportunities = Math.min(requestSlots, remaining < input.maximum ? 0
    : 1 + Math.floor((remaining - input.maximum) / estimatedCost));
  // CF's available daily allowance is spread until UTC, even if one old
  // ambiguous reservation will release sooner. That small release is not a
  // reset of the whole remaining allowance. Groq has only rolling releases.
  const releaseAtMs = input.resetAtMs ?? (active.length
    ? Math.min(...active.map((c) => c.expiresAtMs)) : input.nowMs + 86_400_000);
  let admissionReleaseAtMs = releaseAtMs;
  if (estimatedOpportunities === 0) {
    let carried = used, requests = usedRequests;
    for (const charge of [...active].sort((a, b) => a.expiresAtMs - b.expiresAtMs)) {
      carried -= charge.charged; requests -= charge.requests;
      if (input.limit - carried >= input.maximum && (input.requestLimit === undefined || requests < input.requestLimit)) {
        admissionReleaseAtMs = charge.expiresAtMs; break;
      }
    }
  }
  const lastDispatch = dispatched[0]?.dispatchedAtMs;
  const readyAtMs = estimatedOpportunities === 0 ? admissionReleaseAtMs
    : lastDispatch == null ? input.nowMs
    : lastDispatch + Math.ceil(Math.max(0, releaseAtMs - lastDispatch) / (estimatedOpportunities + 1));
  return { readyAtMs, estimatedCost, remaining, estimatedOpportunities };
}
