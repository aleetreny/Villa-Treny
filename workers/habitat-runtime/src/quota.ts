import type { ProviderAttemptResult, ProviderId, ProviderUsage, RuntimeConfig } from './contracts';
import { hasCompleteTokenUsage, isUsageInteger } from './providers/shared';
import { providerPacing, type PacingDecision } from './cognition-pacing';
import { GROQ_MODELS, GROQ_120B_MODEL, LEGACY_GROQ_MODEL } from './quota-migration';

export type QuotaMaximum = { requests: number; inputTokens: number; outputTokens: number; neurons: number };
export type QuotaLimit = 'minute-requests' | 'minute-tokens' | 'day-requests' | 'day-tokens' | 'day-neurons' | 'request-size';
export type QuotaReservationDecision =
  | { allowed: true }
  | { allowed: false; retryAtMs: number; reason: 'limit' | 'duplicate' | 'circuit-open' | 'attempt-limit'; limit?: QuotaLimit };
type UsageRow = { requests: number; input_tokens: number; output_tokens: number; neurons: number };
type BreakerRow = { open_until_ms: number; failure_streak: number; reason?: string | null };
type OutcomeBreakerRow = BreakerRow & { updated_at_ms: number };
type ReservationRow = {
  reservation_id: string; provider: ProviderId; model: string | null; day: string; state: string;
  max_requests: number; max_input_tokens: number; max_output_tokens: number; max_neurons: number;
  actual_requests: number | null; actual_input_tokens: number | null; actual_output_tokens: number | null;
  actual_neurons: number | null; usage_confirmed: number;
  created_at_ms: number; dispatched_at_ms: number | null; settled_at_ms: number | null;
};
type Charge = UsageRow & { at: number };
type ExpiringCharge = Charge & { expiresAtMs: number };
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const PROVIDER_RETRY_MS = 60_000;
// Free organization/model allowance and matching project limits verified in
// the account console on 2026-09-08. Historical reservations keep their values.
export const GROQ_PROJECT_LIMITS = { minuteRequests: 30, minuteTokens: 8_000, dayRequests: 1_000, dayTokens: 200_000 } as const;
const emptyUsage = (): UsageRow => ({ requests: 0, input_tokens: 0, output_tokens: 0, neurons: 0 });

export class SqlQuotaLedger {
  constructor(private readonly sql: SqlStorage, private readonly config: RuntimeConfig) {}

  dispatchedCount(jobId: string, provider: ProviderId, model?: string): number {
    const prefix = `${jobId}:${provider}:`;
    // The last ':' is ASCII; replacing it with ';' is the exclusive BINARY
    // upper bound for every suffix, including Unicode and literal '%'/'_'.
    // Filter provider/state after the PK range: adding provider equality to SQL
    // makes SQLite prefer its low-selectivity provider index and scan history.
    return this.sql.exec<{ provider: string; state: string; model: string | null }>(`SELECT provider, state, model FROM quota_reservations
      WHERE reservation_id >= ? AND reservation_id < ?`, prefix, `${prefix.slice(0, -1)};`).toArray()
      .filter((row) => row.provider === provider && (row.state === 'dispatched' || row.state === 'settled')
        && (model === undefined || row.model === model || (row.model === null
          && (provider === 'workers-ai' || model === LEGACY_GROQ_MODEL)))).length;
  }

  dispatchedTotal(jobId: string): number {
    // Two exact provider prefixes exclude similarly named jobs and avoid scans
    // across the entire history or a third, non-authorized provider.
    return this.dispatchedCount(jobId, 'workers-ai') + this.dispatchedCount(jobId, 'groq');
  }

  reserve(reservationId: string, provider: ProviderId, maximum: QuotaMaximum, nowMs: number, jobId?: string, model?: string): QuotaReservationDecision {
    if (!Object.values(maximum).every(isUsageInteger) || maximum.requests !== 1) {
      throw new RangeError('a provider reservation requires one request and finite integer maxima');
    }
    // Idempotency wins over transient breakers: the same attempt cannot dispatch twice.
    if (this.sql.exec('SELECT reservation_id FROM quota_reservations WHERE reservation_id = ?', reservationId).toArray().length) {
      return { allowed: false, retryAtMs: nowMs, reason: 'duplicate' };
    }
    if (jobId !== undefined) {
      const prefix = `${jobId}:${provider}:`;
      if (!reservationId.startsWith(prefix)) throw new RangeError('reservation does not belong to this job and provider');
      if (this.dispatchedCount(jobId, provider, model) >= 2 || this.dispatchedTotal(jobId) >= 4) {
        return { allowed: false, reason: 'attempt-limit', retryAtMs: nowMs };
      }
    }
    const identity = this.modelIdentity(provider, model);
    const blockedUntil = this.blockedUntil(provider, identity);
    if (blockedUntil > nowMs) return { allowed: false, retryAtMs: blockedUntil, reason: 'circuit-open' };
    const denied = this.checkLimits(provider, identity, maximum, nowMs);
    if (denied) return denied;
    const day = utcDay(nowMs);
    this.sql.exec(`INSERT INTO quota_reservations (reservation_id, provider, model, day, state, max_requests,
      max_input_tokens, max_output_tokens, max_neurons, created_at_ms, usage_confirmed)
      VALUES (?, ?, ?, ?, 'reserved', ?, ?, ?, ?, ?, 0)`,
    reservationId, provider, identity, day, maximum.requests, maximum.inputTokens, maximum.outputTokens, maximum.neurons, nowMs);
    // Reservations are authoritative. Rebuilding this compatibility cache makes
    // interruption between these writes recoverable without a lost debit/refund.
    this.refreshDaily(provider, day);
    return { allowed: true };
  }

  markDispatched(reservationId: string, nowMs: number): void {
    this.sql.exec(`UPDATE quota_reservations SET state = 'dispatched', dispatched_at_ms = ?
      WHERE reservation_id = ? AND state = 'reserved'`, nowMs, reservationId);
  }

  settle(reservationId: string, usage: ProviderUsage, nowMs: number): void {
    if (!hasCompleteTokenUsage(usage)) return;
    const row = this.sql.exec<ReservationRow>('SELECT * FROM quota_reservations WHERE reservation_id = ?', reservationId).toArray()[0];
    if (!row || row.state === 'reserved' || row.usage_confirmed === 1) return;
    const neurons = row.provider === 'groq' ? 0 : usage.neurons;
    if (!isUsageInteger(neurons)) return;
    const updated = this.sql.exec(`UPDATE quota_reservations SET state = 'settled', usage_confirmed = 1,
      actual_requests = 1, actual_input_tokens = ?, actual_output_tokens = ?, actual_neurons = ?, settled_at_ms = ?
      WHERE reservation_id = ? AND usage_confirmed = 0 AND state != 'reserved' RETURNING reservation_id`,
    usage.inputTokens, usage.outputTokens, neurons, nowMs, reservationId).toArray();
    if (updated.length) this.refreshDaily(row.provider, row.day);
  }

  recordOutcome(result: ProviderAttemptResult, nowMs: number): number | undefined {
    const model = this.modelIdentity(result.provider, result.model);
    const sharedFailure = !result.ok && ['authentication', 'misconfigured'].includes(result.kind);
    const scoped = result.provider === 'groq' && !sharedFailure;
    const global = this.globalBreaker(result.provider);
    const recovered = result.ok || result.kind === 'invalid-response' || result.kind === 'rejected';
    // A late in-flight response cannot erase a newer shared credential failure,
    // even when that response belongs to the other Groq model.
    if (global && this.protectRestriction(global, result, nowMs)) return global.open_until_ms;
    const previous = scoped ? this.modelBreaker(model) : global;
    if (previous && this.protectRestriction(previous, result, nowMs)) return previous.open_until_ms;
    if (scoped && global && recovered) {
      this.writeBreaker(result.provider, undefined, 0, null, 0, nowMs);
    }
    // A bad answer is a job failure, not evidence of provider unavailability.
    if (recovered) {
      this.writeBreaker(result.provider, scoped ? model : undefined, 0, null, 0, nowMs);
      return;
    }
    const streak = (previous?.failure_streak ?? 0) + 1;
    let until: number;
    if (result.kind === 'authentication' || result.kind === 'misconfigured' || result.kind === 'policy-blocked') {
      until = nowMs + DAY;
    } else if (result.kind === 'quota-exhausted') {
      until = Math.max(nowMs + 1_000, result.retryAtMs ?? (result.provider === 'workers-ai' ? nextUtcDay(nowMs) : nowMs + PROVIDER_RETRY_MS));
    } else if (result.kind === 'rate-limited') {
      until = Math.max(nowMs + 1_000, result.retryAtMs ?? nowMs + PROVIDER_RETRY_MS);
    } else {
      until = nowMs + Math.min(15 * MINUTE, PROVIDER_RETRY_MS * 2 ** Math.min(streak - 1, 4));
    }
    this.writeBreaker(result.provider, scoped ? model : undefined, until, result.kind, streak, nowMs);
    return until;
  }

  private protectRestriction(previous: OutcomeBreakerRow, result: ProviderAttemptResult, nowMs: number): boolean {
    const hard = ['authentication', 'misconfigured', 'policy-blocked'];
    if (previous.open_until_ms <= nowMs || !hard.includes(previous.reason ?? '')) return false;
    const dispatched = this.sql.exec<{ dispatched_at_ms: number | null }>(
      'SELECT dispatched_at_ms FROM quota_reservations WHERE reservation_id=? AND provider=?', result.attemptId, result.provider,
    ).toArray()[0]?.dispatched_at_ms;
    return dispatched === undefined || dispatched === null || dispatched <= previous.updated_at_ms
      || (!result.ok && !hard.includes(result.kind));
  }

  private globalBreaker(provider: ProviderId): OutcomeBreakerRow | undefined {
    const row = this.sql.exec<OutcomeBreakerRow>(
      'SELECT open_until_ms,failure_streak,reason,updated_at_ms FROM provider_breakers WHERE provider=?', provider).toArray()[0];
    // SQL10 retains the pre-migration row. Its model-specific restriction was
    // copied into 20B's scope and must not disable the new 120B allowance.
    return provider !== 'groq' || ['authentication', 'misconfigured'].includes(row?.reason ?? '') ? row : undefined;
  }

  private modelBreaker(model: string): OutcomeBreakerRow | undefined {
    return this.sql.exec<OutcomeBreakerRow>(`SELECT open_until_ms,failure_streak,reason,updated_at_ms
      FROM provider_model_breakers WHERE provider='groq' AND model=?`, model).toArray()[0];
  }

  private blockedUntil(provider: ProviderId, model: string): number {
    return Math.max(this.globalBreaker(provider)?.open_until_ms ?? 0,
      provider === 'groq' ? this.modelBreaker(model)?.open_until_ms ?? 0 : 0);
  }

  private writeBreaker(provider: ProviderId, model: string | undefined, until: number, reason: string | null, streak: number, nowMs: number): void {
    if (model !== undefined) {
      this.sql.exec(`INSERT INTO provider_model_breakers(provider,model,open_until_ms,reason,failure_streak,updated_at_ms)
        VALUES(?,?,?,?,?,?) ON CONFLICT(provider,model) DO UPDATE SET open_until_ms=excluded.open_until_ms,
        reason=excluded.reason,failure_streak=excluded.failure_streak,updated_at_ms=excluded.updated_at_ms`,
      provider, model, until, reason, streak, nowMs);
    } else {
      this.sql.exec(`INSERT INTO provider_breakers(provider,open_until_ms,reason,failure_streak,updated_at_ms)
        VALUES(?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET open_until_ms=excluded.open_until_ms,
        reason=excluded.reason,failure_streak=excluded.failure_streak,updated_at_ms=excluded.updated_at_ms`,
      provider, until, reason, streak, nowMs);
    }
  }

  /** Read-only admission estimate: bounded current-window charges and at most
   * sixteen indexed attempt lookups. No new clock, daily reset or history scan. */
  pacing(provider: ProviderId, model: string, maximum: QuotaMaximum, nowMs: number): PacingDecision {
    return this.pacingSnapshot(provider, model, nowMs)(maximum);
  }

  /** Reusable immutable view for comparing candidate sizes. It grants no
   * reservation; the router always checks fresh state before dispatch. */
  pacingSnapshot(provider: ProviderId, model: string, nowMs: number): (maximum: QuotaMaximum) => PacingDecision {
    const identity = this.modelIdentity(provider, model);
    const rows = this.activityRows(provider, nowMs - DAY, identity);
    const start = Date.parse(`${utcDay(nowMs)}T00:00:00Z`);
    const current = provider === 'groq' ? rows : rows.filter((row) => row.created_at_ms >= start
      || (row.settled_at_ms ?? -1) >= start || row.usage_confirmed === 0);
    // Read a bounded sample of provider identities using its primary key. All
    // other current charges still debit the meter and determine release dates.
    const latest = current.filter((row) => row.dispatched_at_ms !== null)
      .sort((a, b) => b.dispatched_at_ms! - a.dispatched_at_ms!).slice(0, 16);
    const models = new Map(latest.map((row) => [row.reservation_id, row.model
      ?? (provider === 'groq' ? LEGACY_GROQ_MODEL : this.sql.exec<{ model: string }>(
        'SELECT model FROM provider_attempts WHERE attempt_id = ?', row.reservation_id).toArray()[0]?.model ?? null)]));
    const charges = current.map((row) => {
      const charge = chargeFor(row);
      return { dispatchedAtMs: row.dispatched_at_ms, activityAtMs: charge.at,
        expiresAtMs: provider === 'workers-ai' && row.usage_confirmed === 1
          ? nextUtcDay(Math.max(row.created_at_ms, row.settled_at_ms ?? 0)) : charge.at + DAY,
        charged: provider === 'workers-ai' ? charge.neurons : charge.input_tokens + charge.output_tokens,
        requests: charge.requests,
        model: models.has(row.reservation_id) ? models.get(row.reservation_id)! : '__outside_sample__' };
    });
    const blockedUntil = this.blockedUntil(provider, identity);
    return (maximum) => {
      const estimate = providerPacing({ nowMs, model,
        limit: provider === 'workers-ai' ? this.config.WORKERS_AI_DAILY_NEURONS_LIMIT : this.groqDayLimit(identity),
        maximum: provider === 'workers-ai' ? maximum.neurons : maximum.inputTokens + maximum.outputTokens,
        ...(provider === 'workers-ai' ? { resetAtMs: nextUtcDay(nowMs) } : { requestLimit: GROQ_PROJECT_LIMITS.dayRequests }), charges });
      const oversized = provider === 'groq' && maximum.inputTokens + maximum.outputTokens > GROQ_PROJECT_LIMITS.minuteTokens;
      return { ...estimate, readyAtMs: Math.max(estimate.readyAtMs, blockedUntil,
        oversized ? nowMs + DAY : 0) };
    };
  }

  snapshot(nowMs: number): Record<string, unknown> {
    const day = utcDay(nowMs);
    // Public status remains read-only and correct even if a cache write was interrupted.
    const rows = this.sql.exec<ReservationRow>('SELECT * FROM quota_reservations WHERE day = ?', day).toArray();
    const providers = (['groq', 'workers-ai'] as const).filter((provider) => rows.some((row) => row.provider === provider));
    const usage = providers.map((provider) => ({ provider, ...sum(rows.filter((row) => row.provider === provider).map(chargeFor)) }));
    const actual = providers.map((provider) => ({ provider,
      ...sum(rows.filter((row) => row.provider === provider && row.usage_confirmed === 1).map(chargeFor)) }));
    const breakers = this.sql.exec(`SELECT provider, open_until_ms, reason, failure_streak FROM provider_breakers ORDER BY provider`).toArray();
    const groqRows = this.activityRows('groq', nowMs - DAY), groq = groqRows.map(chargeFor);
    const modelBreakers = this.sql.exec('SELECT provider,model,open_until_ms,reason,failure_streak FROM provider_model_breakers ORDER BY provider,model').toArray();
    const modelWindows = Object.fromEntries(GROQ_MODELS.map((model) => {
      const charges = groqRows.filter((row) => (row.model ?? LEGACY_GROQ_MODEL) === model).map(chargeFor);
      return [model, { provider: 'groq', scope: 'rolling-model',
        limits: { ...GROQ_PROJECT_LIMITS, dayTokens: this.groqDayLimit(model) },
        minute: sum(charges.filter((charge) => charge.at > nowMs - MINUTE)), day: sum(charges) }];
    }));
    return { day, resetAtMs: nextUtcDay(nowMs), usage, reserved: usage, actual, breakers, modelBreakers, modelWindows,
      // Daily rows attribute reservations to their original day. Actual guards
      // also count responses across midnight and unresolved previous-day calls.
      windows: {
        'workers-ai': { scope: 'utc-day-with-pending-carry', usage: sum(this.workersCharges(nowMs)) },
        groq: { scope: 'provider-total-informational',
          minute: sum(groq.filter((charge) => charge.at > nowMs - MINUTE)), day: sum(groq) },
      },
    };
  }

  private modelIdentity(provider: ProviderId, model?: string): string {
    const identity = model ?? (provider === 'groq' ? LEGACY_GROQ_MODEL : this.config.WORKERS_AI_MODEL);
    if (!identity || (provider === 'groq' && !(GROQ_MODELS as readonly string[]).includes(identity))) {
      throw new RangeError('quota reservation requires an explicitly supported model');
    }
    return identity;
  }

  private groqDayLimit(model: string): number {
    return Math.min(GROQ_PROJECT_LIMITS.dayTokens, model === GROQ_120B_MODEL
      ? this.config.GROQ_120B_DAILY_TOTAL_TOKENS_LIMIT : this.config.GROQ_DAILY_TOTAL_TOKENS_LIMIT);
  }

  private checkLimits(provider: ProviderId, model: string, maximum: QuotaMaximum, nowMs: number): Exclude<QuotaReservationDecision, { allowed: true }> | undefined {
    const tokens = maximum.inputTokens + maximum.outputTokens;
    if (!Number.isSafeInteger(tokens) || (provider === 'groq' && tokens > Math.min(GROQ_PROJECT_LIMITS.minuteTokens, this.groqDayLimit(model)))
      || (provider === 'workers-ai' && maximum.neurons > this.config.WORKERS_AI_DAILY_NEURONS_LIMIT)) {
      return { allowed: false, reason: 'limit', limit: 'request-size', retryAtMs: nowMs };
    }
    if (provider === 'workers-ai') {
      const active = this.workersCharges(nowMs).sort((a, b) => a.expiresAtMs - b.expiresAtMs);
      let used = sum(active).neurons;
      if (used + maximum.neurons > this.config.WORKERS_AI_DAILY_NEURONS_LIMIT) {
        // Confirmed charges reset at UTC midnight; ambiguous inherited calls
        // keep their own conservative 24-hour window, which can expire earlier.
        for (const charge of active) {
          used -= charge.neurons;
          if (used + maximum.neurons <= this.config.WORKERS_AI_DAILY_NEURONS_LIMIT) {
            return { allowed: false, reason: 'limit', limit: 'day-neurons', retryAtMs: charge.expiresAtMs };
          }
        }
      }
      return;
    }
    const charges = this.charges('groq', nowMs - DAY, model);
    const guards = [
      { duration: MINUTE, limit: 'minute-requests' as const, cap: GROQ_PROJECT_LIMITS.minuteRequests, required: maximum.requests, read: (u: UsageRow) => u.requests },
      { duration: MINUTE, limit: 'minute-tokens' as const, cap: GROQ_PROJECT_LIMITS.minuteTokens, required: tokens, read: (u: UsageRow) => u.input_tokens + u.output_tokens },
      { duration: DAY, limit: 'day-requests' as const, cap: GROQ_PROJECT_LIMITS.dayRequests, required: maximum.requests, read: (u: UsageRow) => u.requests },
      { duration: DAY, limit: 'day-tokens' as const, cap: this.groqDayLimit(model), required: tokens, read: (u: UsageRow) => u.input_tokens + u.output_tokens },
    ];
    let denied: Exclude<QuotaReservationDecision, { allowed: true }> | undefined;
    for (const guard of guards) {
      const active = charges.filter((charge) => charge.at > nowMs - guard.duration).sort((a, b) => a.at - b.at);
      let used = guard.read(sum(active));
      if (used + guard.required <= guard.cap) continue;
      let retryAtMs = nowMs + guard.duration;
      for (const charge of active) {
        used -= guard.read(charge);
        if (used + guard.required <= guard.cap) { retryAtMs = charge.at + guard.duration; break; }
      }
      if (!denied || retryAtMs > denied.retryAtMs) denied = { allowed: false, reason: 'limit', limit: guard.limit, retryAtMs };
    }
    return denied;
  }

  private activityRows(provider: ProviderId, afterMs: number, model?: string): ReservationRow[] {
    if (provider === 'groq' && model !== undefined) {
      return this.sql.exec<ReservationRow>(`SELECT * FROM quota_reservations WHERE provider=?
        AND COALESCE(model,'openai/gpt-oss-20b')=?
        AND MAX(created_at_ms,COALESCE(dispatched_at_ms,0),COALESCE(settled_at_ms,0))>?`, provider, model, afterMs).toArray();
    }
    return this.sql.exec<ReservationRow>(`SELECT * FROM quota_reservations WHERE provider = ?
      AND MAX(created_at_ms, COALESCE(dispatched_at_ms, 0), COALESCE(settled_at_ms, 0)) > ?`, provider, afterMs).toArray();
  }

  private charges(provider: ProviderId, afterMs: number, model?: string): Charge[] {
    return this.activityRows(provider, afterMs, model).map(chargeFor);
  }

  private workersCharges(nowMs: number): ExpiringCharge[] {
    const start = Date.parse(`${utcDay(nowMs)}T00:00:00Z`);
    // A creation/settlement in this UTC day necessarily has activity newer
    // than now-24h. The shared range admits the exact same rows as the prior
    // OR expression while using the provider/activity index for old history.
    return this.sql.exec<ReservationRow>(`SELECT * FROM quota_reservations WHERE provider = 'workers-ai'
      AND MAX(created_at_ms, COALESCE(dispatched_at_ms, 0), COALESCE(settled_at_ms, 0)) > ?
      AND (created_at_ms >= ? OR settled_at_ms >= ? OR usage_confirmed = 0)`,
    nowMs - DAY, start, start).toArray().map((row) => ({ ...chargeFor(row), expiresAtMs: row.usage_confirmed === 1
      ? nextUtcDay(Math.max(row.created_at_ms, row.settled_at_ms ?? 0))
      : Math.max(row.created_at_ms, row.dispatched_at_ms ?? 0, row.settled_at_ms ?? 0) + DAY }));
  }

  private refreshDaily(provider: ProviderId, day: string): void {
    this.sql.exec(`INSERT INTO provider_usage_daily (day, provider, requests, input_tokens, output_tokens, neurons,
      actual_requests, actual_input_tokens, actual_output_tokens, actual_neurons)
      SELECT ?, ?, COALESCE(SUM(CASE WHEN usage_confirmed = 1 THEN actual_requests ELSE max_requests END), 0),
        COALESCE(SUM(CASE WHEN usage_confirmed = 1 THEN actual_input_tokens ELSE max_input_tokens END), 0),
        COALESCE(SUM(CASE WHEN usage_confirmed = 1 THEN actual_output_tokens ELSE max_output_tokens END), 0),
        COALESCE(SUM(CASE WHEN usage_confirmed = 1 THEN actual_neurons ELSE max_neurons END), 0),
        COALESCE(SUM(CASE WHEN usage_confirmed = 1 THEN actual_requests ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN usage_confirmed = 1 THEN actual_input_tokens ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN usage_confirmed = 1 THEN actual_output_tokens ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN usage_confirmed = 1 THEN actual_neurons ELSE 0 END), 0)
      FROM quota_reservations WHERE provider = ? AND day = ?
      ON CONFLICT(day, provider) DO UPDATE SET requests = excluded.requests, input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens, neurons = excluded.neurons, actual_requests = excluded.actual_requests,
        actual_input_tokens = excluded.actual_input_tokens, actual_output_tokens = excluded.actual_output_tokens,
        actual_neurons = excluded.actual_neurons`, day, provider, provider, day);
  }
}

function chargeFor(row: ReservationRow): Charge {
  const confirmed = row.usage_confirmed === 1;
  return { at: Math.max(row.created_at_ms, row.dispatched_at_ms ?? 0, row.settled_at_ms ?? 0),
    requests: confirmed ? row.actual_requests! : row.max_requests,
    input_tokens: confirmed ? row.actual_input_tokens! : row.max_input_tokens,
    output_tokens: confirmed ? row.actual_output_tokens! : row.max_output_tokens,
    neurons: confirmed ? row.actual_neurons! : row.max_neurons };
}
function sum(charges: UsageRow[]): UsageRow {
  return charges.reduce((total, charge) => ({ requests: total.requests + charge.requests,
    input_tokens: total.input_tokens + charge.input_tokens, output_tokens: total.output_tokens + charge.output_tokens,
    neurons: total.neurons + charge.neurons }), emptyUsage());
}
export function utcDay(nowMs: number): string { return new Date(nowMs).toISOString().slice(0, 10); }
export function nextUtcDay(nowMs: number): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}
