import type { ProviderAttemptResult, ProviderId, ProviderUsage, RuntimeConfig } from './contracts';

export type QuotaMaximum = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  neurons: number;
};

export type QuotaReservationDecision =
  | { allowed: true }
  | { allowed: false; retryAtMs: number; reason: 'limit' | 'duplicate' | 'circuit-open' };

type UsageRow = {
  requests: number;
  input_tokens: number;
  output_tokens: number;
  neurons: number;
};

type BreakerRow = {
  open_until_ms: number;
  failure_streak: number;
};

export class SqlQuotaLedger {
  constructor(
    private readonly sql: SqlStorage,
    private readonly config: RuntimeConfig,
  ) {}

  reserve(
    reservationId: string,
    provider: ProviderId,
    maximum: QuotaMaximum,
    nowMs: number,
  ): QuotaReservationDecision {
    const day = utcDay(nowMs);
    const resetAtMs = nextUtcDay(nowMs);

    return this.reserveAtomic(reservationId, provider, maximum, day, resetAtMs, nowMs);
  }

  private reserveAtomic(
    reservationId: string,
    provider: ProviderId,
    maximum: QuotaMaximum,
    day: string,
    resetAtMs: number,
    nowMs: number,
  ): QuotaReservationDecision {
    const breaker = this.sql
      .exec<BreakerRow>(
        'SELECT open_until_ms, failure_streak FROM provider_breakers WHERE provider = ?',
        provider,
      )
      .toArray()[0];
    if (breaker && breaker.open_until_ms > nowMs) {
      return { allowed: false, retryAtMs: breaker.open_until_ms, reason: 'circuit-open' };
    }

    const duplicate = this.sql
      .exec<{ reservation_id: string }>(
        'SELECT reservation_id FROM quota_reservations WHERE reservation_id = ?',
        reservationId,
      )
      .toArray()[0];
    if (duplicate) {
      return { allowed: false, retryAtMs: resetAtMs, reason: 'duplicate' };
    }

    const current = this.sql
      .exec<UsageRow>(
        `SELECT requests, input_tokens, output_tokens, neurons
           FROM provider_usage_daily WHERE day = ? AND provider = ?`,
        day,
        provider,
      )
      .toArray()[0] ?? { requests: 0, input_tokens: 0, output_tokens: 0, neurons: 0 };

    if (!this.withinLimit(provider, current, maximum)) {
      return { allowed: false, retryAtMs: resetAtMs, reason: 'limit' };
    }

    this.sql.exec(
      `INSERT INTO quota_reservations (
         reservation_id, provider, day, state, max_requests, max_input_tokens,
         max_output_tokens, max_neurons, created_at_ms
       ) VALUES (?, ?, ?, 'reserved', ?, ?, ?, ?, ?)`,
      reservationId,
      provider,
      day,
      maximum.requests,
      maximum.inputTokens,
      maximum.outputTokens,
      maximum.neurons,
      nowMs,
    );
    this.sql.exec(
      `INSERT INTO provider_usage_daily (
         day, provider, requests, input_tokens, output_tokens, neurons,
         actual_requests, actual_input_tokens, actual_output_tokens, actual_neurons
       ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
       ON CONFLICT(day, provider) DO UPDATE SET
         requests = requests + excluded.requests,
         input_tokens = input_tokens + excluded.input_tokens,
         output_tokens = output_tokens + excluded.output_tokens,
         neurons = neurons + excluded.neurons`,
      day,
      provider,
      maximum.requests,
      maximum.inputTokens,
      maximum.outputTokens,
      maximum.neurons,
    );
    return { allowed: true };
  }

  markDispatched(reservationId: string, nowMs: number): void {
    this.sql.exec(
      `UPDATE quota_reservations
          SET state = 'dispatched', dispatched_at_ms = ?
        WHERE reservation_id = ? AND state = 'reserved'`,
      nowMs,
      reservationId,
    );
  }

  settle(reservationId: string, usage: ProviderUsage, nowMs: number): void {
    const reservation = this.sql
      .exec<{ provider: ProviderId; day: string; state: string }>(
        'SELECT provider, day, state FROM quota_reservations WHERE reservation_id = ?',
        reservationId,
      )
      .toArray()[0];
    if (!reservation || reservation.state === 'settled') return;

    const actualRequests = 1;
    const actualInput = nonnegativeInteger(usage.inputTokens);
    const actualOutput = nonnegativeInteger(usage.outputTokens);
    const actualNeurons = nonnegativeInteger(usage.neurons);
    this.sql.exec(
      `UPDATE quota_reservations SET
         state = 'settled', actual_requests = ?, actual_input_tokens = ?,
         actual_output_tokens = ?, actual_neurons = ?, settled_at_ms = ?
       WHERE reservation_id = ? AND state != 'settled'`,
      actualRequests,
      actualInput,
      actualOutput,
      actualNeurons,
      nowMs,
      reservationId,
    );
    this.sql.exec(
      `UPDATE provider_usage_daily SET
         actual_requests = actual_requests + ?,
         actual_input_tokens = actual_input_tokens + ?,
         actual_output_tokens = actual_output_tokens + ?,
         actual_neurons = actual_neurons + ?
       WHERE day = ? AND provider = ?`,
      actualRequests,
      actualInput,
      actualOutput,
      actualNeurons,
      reservation.day,
      reservation.provider,
    );
  }

  recordOutcome(result: ProviderAttemptResult, nowMs: number): void {
    if (result.ok) {
      this.sql.exec(
        `INSERT INTO provider_breakers (provider, open_until_ms, reason, failure_streak, updated_at_ms)
         VALUES (?, 0, NULL, 0, ?)
         ON CONFLICT(provider) DO UPDATE SET
           open_until_ms = 0, reason = NULL, failure_streak = 0, updated_at_ms = excluded.updated_at_ms`,
        result.provider,
        nowMs,
      );
      return;
    }

    const previous = this.sql
      .exec<BreakerRow>(
        'SELECT open_until_ms, failure_streak FROM provider_breakers WHERE provider = ?',
        result.provider,
      )
      .toArray()[0];
    const failureStreak = (previous?.failure_streak ?? 0) + 1;
    let openUntilMs = 0;
    if (result.kind === 'rate-limited' || result.kind === 'quota-exhausted') {
      openUntilMs = result.retryAtMs ?? nextUtcDay(nowMs);
    } else if (!result.retryable) {
      openUntilMs = nowMs + 24 * 60 * 60 * 1_000;
    } else if (failureStreak >= 3) {
      openUntilMs = nowMs + 15 * 60 * 1_000;
    }

    this.sql.exec(
      `INSERT INTO provider_breakers (provider, open_until_ms, reason, failure_streak, updated_at_ms)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
         open_until_ms = excluded.open_until_ms,
         reason = excluded.reason,
         failure_streak = excluded.failure_streak,
         updated_at_ms = excluded.updated_at_ms`,
      result.provider,
      openUntilMs,
      result.kind,
      failureStreak,
      nowMs,
    );
  }

  snapshot(nowMs: number): Record<string, unknown> {
    const day = utcDay(nowMs);
    const usage = [...this.sql.exec<UsageRow & { provider: ProviderId }>(
      `SELECT provider, requests, input_tokens, output_tokens, neurons
       FROM provider_usage_daily WHERE day = ? ORDER BY provider`,
      day,
    )];
    const breakers = [...this.sql.exec<{
      provider: ProviderId;
      open_until_ms: number;
      reason: string | null;
      failure_streak: number;
    }>(
      `SELECT provider, open_until_ms, reason, failure_streak
       FROM provider_breakers ORDER BY provider`,
    )];
    const actual = this.sql.exec<{ provider: ProviderId; requests: number; input_tokens: number; output_tokens: number; neurons: number }>(
      `SELECT provider, actual_requests AS requests, actual_input_tokens AS input_tokens,
        actual_output_tokens AS output_tokens, actual_neurons AS neurons FROM provider_usage_daily WHERE day = ? ORDER BY provider`, day).toArray();
    return { day, resetAtMs: nextUtcDay(nowMs), usage, reserved: usage, actual, breakers };
  }

  private withinLimit(provider: ProviderId, current: UsageRow, maximum: QuotaMaximum): boolean {
    if (provider === 'workers-ai') {
      return current.neurons + maximum.neurons <= this.config.WORKERS_AI_DAILY_NEURONS_LIMIT;
    }
    return (
      current.requests + maximum.requests <= 200
      && current.input_tokens + current.output_tokens
        + maximum.inputTokens + maximum.outputTokens
        <= this.config.GROQ_DAILY_TOTAL_TOKENS_LIMIT
    );
  }
}

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function nextUtcDay(nowMs: number): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function nonnegativeInteger(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}
