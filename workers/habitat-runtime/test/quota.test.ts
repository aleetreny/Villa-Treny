import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { parseRuntimeConfig, type RuntimeConfig, type ProviderAttemptResult, type ProviderUsage } from '../src/contracts';
import { GROQ_PROJECT_LIMITS, SqlQuotaLedger } from '../src/quota';
import { routeCognition } from '../src/providers/router';
import { cognitionJob } from './fixtures';

const NOW = Date.parse('2026-09-08T23:59:59.900Z');
const DAY = 86_400_000;
const maximum = (inputTokens = 100, outputTokens = 20, neurons = 3) => ({ requests: 1, inputTokens, outputTokens, neurons });
type Test = (ledger: SqlQuotaLedger, sql: SqlStorage, config: RuntimeConfig) => void | Promise<void>;
async function withLedger(name: string, test: Test, overrides: Partial<RuntimeConfig> = {}) {
  const stub = env.HABITAT_WORLD.getByName(`quota-focused-${name}`);
  await runInDurableObject(stub, async (_instance, state) => {
    const fields = state.storage.sql.exec<{ name: string }>('PRAGMA table_info(quota_reservations)').toArray();
    expect(fields.some((field) => field.name === 'usage_confirmed')).toBe(true);
    const config = { ...parseRuntimeConfig(env), ...overrides };
    await test(new SqlQuotaLedger(state.storage.sql, config), state.storage.sql, config);
  });
}
function failed(kind: Extract<ProviderAttemptResult, { ok: false }>['kind'], retryable = false): ProviderAttemptResult {
  return { ok: false, provider: 'groq', model: 'openai/gpt-oss-20b', attemptId: 'fixture', kind, retryable, latencyMs: 1 };
}
function dispatch(ledger: SqlQuotaLedger, id: string, at: number, size = maximum(), provider: 'groq' | 'workers-ai' = 'groq') {
  expect(ledger.reserve(id, provider, size, at)).toEqual({ allowed: true });
  ledger.markDispatched(id, at);
}

describe('real SQL quota ledger', () => {
  it('uses the verified Free limits while preserving existing reservations and the other provider policy', async () => {
    await withLedger('verified-free-limits', (ledger, sql, config) => {
      expect(GROQ_PROJECT_LIMITS).toEqual({ minuteRequests: 30, minuteTokens: 8_000, dayRequests: 1_000, dayTokens: 200_000 });
      expect(config.GROQ_DAILY_TOTAL_TOKENS_LIMIT).toBe(200_000);
      expect(config.GROQ_MODEL).toBe('openai/gpt-oss-20b');
      expect(config.WORKERS_AI_DAILY_NEURONS_LIMIT).toBe(10_000);
      const earlier = new SqlQuotaLedger(sql, { ...config, GROQ_DAILY_TOTAL_TOKENS_LIMIT: 150_000 });
      dispatch(earlier, 'existing-6000-maximum', NOW, maximum(4_976, 1_024));
      const saved = sql.exec('SELECT * FROM quota_reservations WHERE reservation_id=?', 'existing-6000-maximum').one();
      expect(ledger.reserve('new-capacity', 'groq', maximum(976, 1_024), NOW)).toEqual({ allowed: true });
      expect(ledger.reserve('excess', 'groq', maximum(1, 0), NOW)).toMatchObject({ allowed: false, limit: 'minute-tokens' });
      expect(sql.exec('SELECT * FROM quota_reservations WHERE reservation_id=?', 'existing-6000-maximum').one()).toEqual(saved);
    });
  });

  it('counts only dispatched or settled submissions for the exact provider and job prefix', async () => {
    await withLedger('dispatch-count', (ledger) => {
      const jobId = 'cognition-🧭';
      const reserved = `${jobId}:groq:1`;
      expect(ledger.reserve(reserved, 'groq', maximum(), NOW, jobId)).toEqual({ allowed: true });
      expect(ledger.dispatchedCount(jobId, 'groq')).toBe(0);
      ledger.markDispatched(reserved, NOW);
      expect(ledger.dispatchedCount(jobId, 'groq')).toBe(1);
      ledger.settle(reserved, { inputTokens: 10, outputTokens: 1 }, NOW);
      expect(ledger.dispatchedCount(jobId, 'groq')).toBe(1);
      dispatch(ledger, `${jobId}-other:groq:1`, NOW);
      dispatch(ledger, `${jobId}:workers-ai:1`, NOW, maximum(), 'workers-ai');
      expect(ledger.dispatchedCount(jobId, 'groq')).toBe(1);
      expect(ledger.dispatchedCount(jobId, 'workers-ai')).toBe(1);
    });
  });

  it('refunds confirmed unused capacity once and never refunds an undispatched reservation', async () => {
    await withLedger('refund', (ledger, sql) => {
      expect(ledger.reserve('a', 'workers-ai', maximum(100, 20, 8), NOW)).toEqual({ allowed: true });
      ledger.settle('a', { inputTokens: 1, outputTokens: 0, neurons: 1 }, NOW);
      expect(ledger.reserve('before', 'workers-ai', maximum(1, 1, 3), NOW)).toMatchObject({ allowed: false });
      ledger.markDispatched('a', NOW);
      ledger.settle('a', { inputTokens: 30, outputTokens: 10, neurons: 2 }, NOW + 1);
      ledger.settle('a', { inputTokens: 0, outputTokens: 0, neurons: 0 }, NOW + 2);
      expect(sql.exec('SELECT input_tokens, output_tokens, neurons, actual_requests FROM provider_usage_daily WHERE provider = ?', 'workers-ai').one())
        .toEqual({ input_tokens: 30, output_tokens: 10, neurons: 2, actual_requests: 1 });
      expect(ledger.reserve('after', 'workers-ai', maximum(1, 1, 8), NOW + 2)).toEqual({ allowed: true });
    }, { WORKERS_AI_DAILY_NEURONS_LIMIT: 10 });
  });

  it.each<ProviderUsage>([{}, { inputTokens: 12 }, { inputTokens: NaN, outputTokens: 0 },
    { inputTokens: 3.2, outputTokens: 0 }, { inputTokens: 1, outputTokens: Infinity },
    { inputTokens: 10, outputTokens: 20, totalTokens: 29 }, { inputTokens: 10, outputTokens: 20, reasoningTokens: 21 },
    { inputTokens: 10, outputTokens: 20, incomplete: true }])('retains the full ambiguous reservation for %j', async (usage) => {
    await withLedger(`unknown-${JSON.stringify(usage)}`, (ledger, sql) => {
      dispatch(ledger, 'a', NOW, maximum(7_000, 1_000));
      ledger.settle('a', usage, NOW + 1);
      expect(sql.exec('SELECT usage_confirmed, state FROM quota_reservations').one()).toEqual({ usage_confirmed: 0, state: 'dispatched' });
      expect(ledger.reserve('blocked', 'groq', maximum(1, 0), NOW + 1)).toMatchObject({ allowed: false, reason: 'limit', limit: 'minute-tokens' });
    });
  });

  it('treats historical settled zero usage as unknown until explicitly confirmed', async () => {
    await withLedger('legacy-zero', (ledger, sql) => {
      dispatch(ledger, 'old', NOW, maximum(8_000, 0));
      sql.exec("UPDATE quota_reservations SET state='settled', actual_requests=1, actual_input_tokens=0, actual_output_tokens=0, actual_neurons=0, settled_at_ms=?", NOW);
      expect(ledger.reserve('new', 'groq', maximum(1, 0), NOW + 1)).toMatchObject({ allowed: false, limit: 'minute-tokens' });
      ledger.settle('old', { inputTokens: 0, outputTokens: 0 }, NOW + 2);
      expect(ledger.reserve('new', 'groq', maximum(1, 0), NOW + 3)).toEqual({ allowed: true });
    });
  });

  it('enforces 30 requests per rolling minute even after zero-token settlements', async () => {
    await withLedger('rpm', (ledger) => {
      for (let i = 0; i < 30; i++) { dispatch(ledger, `r${i}`, NOW); ledger.settle(`r${i}`, { inputTokens: 0, outputTokens: 0 }, NOW); }
      expect(ledger.reserve('thirty-first', 'groq', maximum(), NOW + 59_999)).toMatchObject({ allowed: false, limit: 'minute-requests', retryAtMs: NOW + 60_000 });
      expect(ledger.reserve('thirty-first', 'groq', maximum(), NOW + 60_000)).toEqual({ allowed: true });
    });
  });

  it('enforces 8000 TPM, includes reasoning once, and releases only reported unused tokens', async () => {
    await withLedger('tpm', (ledger) => {
      dispatch(ledger, 'a', NOW, maximum(7_000, 1_000));
      ledger.settle('a', { inputTokens: 500, outputTokens: 400, totalTokens: 900, reasoningTokens: 300 }, NOW);
      expect(ledger.reserve('b', 'groq', maximum(7_000, 101), NOW)).toMatchObject({ allowed: false, limit: 'minute-tokens' });
      expect(ledger.reserve('b', 'groq', maximum(7_000, 100), NOW)).toEqual({ allowed: true });
      expect(ledger.reserve('oversized', 'groq', maximum(8_000, 1), NOW)).toMatchObject({ allowed: false, limit: 'request-size' });
    });
  });

  it('does not reset the 1000-request rolling day at UTC midnight', async () => {
    await withLedger('rpd', (ledger) => {
      for (let i = 0; i < 1_000; i++) dispatch(ledger, `r${i}`, NOW + i * 61_000, maximum(1, 0));
      expect(ledger.reserve('1001', 'groq', maximum(1, 0), NOW + 1_000 * 61_000)).toMatchObject({ allowed: false, limit: 'day-requests', retryAtMs: NOW + DAY });
      expect(ledger.reserve('1001', 'groq', maximum(1, 0), NOW + DAY)).toEqual({ allowed: true });
    });
  });

  it('admits the verified 200000-token rolling day and rejects its first excess token', async () => {
    await withLedger('tpd', (ledger) => {
      for (let i = 0; i < 25; i++) dispatch(ledger, `r${i}`, NOW + i * 61_000, maximum(8_000, 0));
      expect(ledger.reserve('extra', 'groq', maximum(1, 0), NOW + 25 * 61_000)).toMatchObject({ allowed: false, limit: 'day-tokens', retryAtMs: NOW + DAY });
      expect(ledger.reserve('extra', 'groq', maximum(1, 0), NOW + DAY)).toEqual({ allowed: true });
    });
  });

  it('keeps a cross-midnight settlement in the rolling day until its completion expires', async () => {
    await withLedger('cross-day', (ledger) => {
      dispatch(ledger, 'a', NOW, maximum(1_000, 0));
      ledger.settle('a', { inputTokens: 1_000, outputTokens: 0 }, NOW + 200);
      expect(ledger.reserve('b', 'groq', maximum(1, 0), NOW + DAY)).toMatchObject({ allowed: false, retryAtMs: NOW + DAY + 200 });
      expect(ledger.reserve('b', 'groq', maximum(1, 0), NOW + DAY + 200)).toEqual({ allowed: true });
    }, { GROQ_DAILY_TOTAL_TOKENS_LIMIT: 1_000 });
  });

  it('still honors an explicitly smaller daily policy instead of raising it implicitly', async () => {
    await withLedger('lower-configured-day', (ledger) => {
      for (let i = 0; i < 30; i++) dispatch(ledger, `r${i}`, NOW + i * 61_000, maximum(5_000, 0));
      expect(ledger.reserve('extra', 'groq', maximum(1, 0), NOW + 30 * 61_000))
        .toMatchObject({ allowed: false, limit: 'day-tokens', retryAtMs: NOW + DAY });
    }, { GROQ_DAILY_TOTAL_TOKENS_LIMIT: 150_000 });
  });

  it('charges confirmed and unknown prior-day Workers AI calls conservatively across midnight', async () => {
    await withLedger('workers-cross-day', (ledger) => {
      dispatch(ledger, 'a', NOW, maximum(100, 20, 8), 'workers-ai');
      expect(ledger.reserve('b', 'workers-ai', maximum(1, 0, 3), NOW + 150)).toMatchObject({ allowed: false });
      ledger.settle('a', { inputTokens: 90, outputTokens: 10, neurons: 8 }, NOW + 200);
      expect(ledger.reserve('b', 'workers-ai', maximum(1, 0, 3), NOW + 201)).toMatchObject({ allowed: false });
      expect(ledger.snapshot(NOW + 201)).toMatchObject({ windows: { 'workers-ai': { usage: { neurons: 8 } } } });
    }, { WORKERS_AI_DAILY_NEURONS_LIMIT: 10 });
  });

  it.each([
    { unknown: 8_000, confirmed: 0, requested: 1, ready: '2026-09-09T12:00:00Z' },
    { unknown: 7_000, confirmed: 1_000, requested: 2_000, ready: '2026-09-09T12:00:00Z' },
    { unknown: 1_000, confirmed: 7_000, requested: 2_000, ready: '2026-09-10T00:00:00Z' },
  ])('retries Workers AI at the first sufficient expiry for $unknown carried and $confirmed confirmed neurons', async ({ unknown, confirmed, requested, ready }) => {
    await withLedger(`workers-expiry-${unknown}`, (ledger) => {
      const old = Date.parse('2026-09-08T12:00:00Z'), at = Date.parse('2026-09-09T01:00:00Z'), readyAt = Date.parse(ready);
      dispatch(ledger, 'old-ambiguous', old, maximum(100, 20, unknown), 'workers-ai');
      if (confirmed) {
        dispatch(ledger, 'today-confirmed', at, maximum(100, 20, confirmed), 'workers-ai');
        ledger.settle('today-confirmed', { inputTokens: 100, outputTokens: 20, neurons: confirmed }, at);
      }
      expect(ledger.reserve('next', 'workers-ai', maximum(1, 0, requested), at)).toMatchObject({ allowed: false,
        reason: 'limit', limit: 'day-neurons', retryAtMs: readyAt });
      expect(ledger.reserve('next', 'workers-ai', maximum(1, 0, requested), readyAt - 1)).toMatchObject({ allowed: false, retryAtMs: readyAt });
      expect(ledger.reserve('next', 'workers-ai', maximum(1, 0, requested), readyAt)).toEqual({ allowed: true });
    }, { WORKERS_AI_DAILY_NEURONS_LIMIT: 8_000 });
  });

  it('charges usage above the reservation and remains correct after interrupted cache writes without mutating status', async () => {
    await withLedger('cache-recovery', (ledger, sql) => {
      dispatch(ledger, 'a', NOW, maximum(100, 0));
      ledger.settle('a', { inputTokens: 8_001, outputTokens: 0 }, NOW);
      sql.exec('DELETE FROM provider_usage_daily');
      expect(ledger.reserve('b', 'groq', maximum(1, 0), NOW)).toMatchObject({ allowed: false, limit: 'minute-tokens' });
      expect(ledger.snapshot(NOW)).toMatchObject({ actual: [{ provider: 'groq', input_tokens: 8_001 }] });
      expect(sql.exec('SELECT COUNT(*) AS count FROM provider_usage_daily').one()).toEqual({ count: 0 });
    });
  });

  it('never turns invalid responses into outages, while authentication and rate limits remain blocked', async () => {
    await withLedger('breakers', (ledger) => {
      for (let i = 0; i < 5; i++) ledger.recordOutcome(failed('invalid-response'), NOW);
      expect(ledger.reserve('a', 'groq', maximum(), NOW)).toEqual({ allowed: true });
      ledger.recordOutcome(failed('rate-limited', true), NOW);
      expect(ledger.reserve('b', 'groq', maximum(), NOW)).toMatchObject({ allowed: false, reason: 'circuit-open', retryAtMs: NOW + 60_000 });
      ledger.recordOutcome(failed('authentication'), NOW);
      ledger.recordOutcome(failed('invalid-response'), NOW);
      expect(ledger.reserve('b', 'groq', maximum(), NOW)).toMatchObject({ allowed: false, reason: 'circuit-open', retryAtMs: NOW + DAY });
      expect(ledger.reserve('a', 'groq', maximum(), NOW)).toMatchObject({ allowed: false, reason: 'duplicate' });
    });
  });

  it.each(['authentication', 'misconfigured', 'policy-blocked'] as const)('keeps a newer %s restriction when an older request finishes', async (kind) => {
    await withLedger(`late-hard-${kind}`, (ledger, sql) => {
      dispatch(ledger, 'old:groq:1', NOW);
      ledger.recordOutcome({ ...failed(kind), attemptId: 'new:groq:1' }, NOW + 20);
      const table = kind === 'policy-blocked' ? 'provider_model_breakers' : 'provider_breakers';
      const blocked = sql.exec(`SELECT * FROM ${table}`).one();
      const success: ProviderAttemptResult = { ok: true, provider: 'groq', model: 'openai/gpt-oss-20b',
        attemptId: 'old:groq:1', payload: { verb: 'observe' }, usage: { inputTokens: 10, outputTokens: 2 }, latencyMs: 30 };
      for (const result of [success, { ...success, attemptId: 'unknown-order' },
        { ...failed('timeout', true), attemptId: 'old:groq:1' }, { ...failed('invalid-response'), attemptId: 'old:groq:1' }]) {
        expect(ledger.recordOutcome(result, NOW + 30)).toBe(NOW + 20 + DAY);
        expect(sql.exec(`SELECT * FROM ${table}`).one()).toEqual(blocked);
      }
      expect(ledger.reserve('third:groq:1', 'groq', maximum(), NOW + 31, 'third')).toMatchObject({ allowed: false,
        reason: 'circuit-open', retryAtMs: NOW + 20 + DAY });
      expect(ledger.reserve('third:groq:1', 'groq', maximum(), NOW + 20 + DAY, 'third')).toEqual({ allowed: true });
      ledger.markDispatched('third:groq:1', NOW + 20 + DAY);
      ledger.recordOutcome({ ...success, attemptId: 'third:groq:1' }, NOW + 21 + DAY);
      expect(sql.exec(`SELECT open_until_ms FROM ${table}`).one()).toEqual({ open_until_ms: 0 });
    });
  });
});

describe('router with the real quota ledger', () => {
  it('creates no reservation when control has already changed', async () => {
    await withLedger('router-control-before', async (ledger, sql, config) => {
      const run = vi.fn(), groqFetch = vi.fn<typeof fetch>();
      expect(await routeCognition({ ai: { run }, groqApiKey: 'fixture-only', config, job: cognitionJob(),
        attemptOrdinal: 1, quota: ledger, now: () => NOW, groqFetch, canDispatch: () => false }))
        .toMatchObject({ status: 'rejected', reasons: [{ detailCode: 'control_revision_changed', retryable: false }] });
      expect(run).not.toHaveBeenCalled(); expect(groqFetch).not.toHaveBeenCalled();
      expect(sql.exec('SELECT COUNT(*) AS count FROM quota_reservations').one()).toEqual({ count: 0 });
    });
  });

  it('settles the in-flight primary after pause but does not reserve or send fallback', async () => {
    await withLedger('router-control-during', async (ledger, sql, config) => {
      let allowed = true;
      let finish!: (value: unknown) => void;
      const run = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
      const groqFetch = vi.fn<typeof fetch>();
      const pending = routeCognition({ ai: { run }, groqApiKey: 'fixture-only', config, job: cognitionJob(),
        attemptOrdinal: 1, quota: ledger, now: () => NOW, groqFetch, canDispatch: () => allowed });
      expect(run).toHaveBeenCalledTimes(1);
      allowed = false;
      finish({ response: '{broken', usage: { prompt_tokens: 100, completion_tokens: 20 } });
      expect(await pending).toMatchObject({ status: 'rejected', reasons: [
        { provider: 'workers-ai', kind: 'invalid-response' },
        { provider: 'groq', detailCode: 'control_revision_changed', retryable: false },
      ] });
      expect(groqFetch).not.toHaveBeenCalled();
      expect(sql.exec('SELECT provider, state, usage_confirmed, actual_input_tokens FROM quota_reservations').toArray())
        .toEqual([{ provider: 'workers-ai', state: 'settled', usage_confirmed: 1, actual_input_tokens: 100 }]);
      expect(ledger.dispatchedCount(cognitionJob().jobId, 'workers-ai')).toBe(1);
      expect(ledger.dispatchedCount(cognitionJob().jobId, 'groq')).toBe(0);
    });
  });

  it.each(['workers-ai', 'groq'] as const)('allows two real %s responses after several quota-only wakes', async (provider) => {
    await withLedger(`router-real-count-${provider}`, async (ledger, _sql, config) => {
      if (provider === 'workers-ai') ledger.recordOutcome({ ...failed('rate-limited', true), provider }, NOW);
      else dispatch(ledger, 'unrelated-minute-charge', NOW, maximum(8_000, 0));
      const run = vi.fn(async () => ({ response: '{broken', usage: { prompt_tokens: 100, completion_tokens: 20 } }));
      const groqFetch = vi.fn(async () => Response.json({ choices: [{ message: { content: '{"verb":"rest","room":"common"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 10 } }));
      const request = { ai: { run }, ...(provider === 'groq' ? { groqApiKey: 'fixture-only' } : {}), config,
        job: cognitionJob(), quota: ledger, groqFetch };
      for (let attemptOrdinal = 1; attemptOrdinal <= 3; attemptOrdinal++) {
        expect(await routeCognition({ ...request, attemptOrdinal, now: () => NOW })).toMatchObject({ status: 'deferred' });
      }
      expect(ledger.dispatchedCount(request.job.jobId, provider)).toBe(0);
      const first = await routeCognition({ ...request, attemptOrdinal: 4, now: () => NOW + 60_000 });
      expect(first).toMatchObject({ status: 'deferred', reasons: expect.arrayContaining([
        expect.objectContaining({ provider, kind: 'invalid-response', retryable: true }),
      ]) });
      expect(ledger.dispatchedCount(request.job.jobId, provider)).toBe(1);
      expect(await routeCognition({ ...request, attemptOrdinal: 5, now: () => NOW + 60_001 }))
        .toMatchObject({ status: 'rejected', reasons: expect.arrayContaining([
          expect.objectContaining({ provider, kind: 'invalid-response', retryable: false }),
        ]) });
      expect(ledger.dispatchedCount(request.job.jobId, provider)).toBe(2);
      await routeCognition({ ...request, attemptOrdinal: 6, now: () => NOW + 120_001 });
      expect(provider === 'workers-ai' ? run : groqFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('caps two dispatched attempts per provider while quota-only retries leave the other provider available', async () => {
    await withLedger('router-dispatch-cap', async (ledger, sql, config) => {
      dispatch(ledger, 'unrelated-full-minute', NOW, maximum(8_000, 0));
      const run = vi.fn(async () => ({ response: '{broken', usage: { prompt_tokens: 100, completion_tokens: 20 } }));
      const groqFetch = vi.fn(async () => Response.json({ choices: [{ message: { content: '{"verb":"observe"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 10 } }));
      const request = { ai: { run }, groqApiKey: 'fixture-only', config, job: cognitionJob(), quota: ledger, now: () => NOW, groqFetch };
      for (let attemptOrdinal = 1; attemptOrdinal <= 3; attemptOrdinal++) {
        expect(await routeCognition({ ...request, attemptOrdinal })).toMatchObject({ status: 'deferred' });
      }
      expect(run).toHaveBeenCalledTimes(2); expect(groqFetch).not.toHaveBeenCalled();
      expect(await routeCognition({ ...request, now: () => NOW + 60_000, attemptOrdinal: 4 })).toMatchObject({ status: 'completed' });
      expect(run).toHaveBeenCalledTimes(2); expect(groqFetch).toHaveBeenCalledTimes(1);
      expect(sql.exec("SELECT COUNT(*) AS count FROM quota_reservations WHERE usage_confirmed=1").one()).toEqual({ count: 3 });
    });
  });

  it('accepts a job-specific non-Intent contract and prevents duplicate failover dispatch', async () => {
    await withLedger('router-custom', async (ledger, _sql, config) => {
      const run = vi.fn(async () => ({ response: '{"thought":"wait"}', usage: { prompt_tokens: 100, completion_tokens: 10 } }));
      const groqFetch = vi.fn<typeof fetch>();
      const request = { ai: { run }, groqApiKey: 'fixture-only', config, job: cognitionJob(), attemptOrdinal: 1,
        quota: ledger, now: () => NOW, groqFetch, validatePayload: (payload: unknown) => typeof payload === 'object' && payload !== null && 'thought' in payload };
      expect(await routeCognition(request)).toMatchObject({ status: 'completed', result: { payload: { thought: 'wait' } } });
      expect(await routeCognition(request)).toMatchObject({ status: 'rejected', reasons: [{ detailCode: 'duplicate_attempt', retryable: false }] });
      expect(run).toHaveBeenCalledTimes(1); expect(groqFetch).not.toHaveBeenCalled();
    });
  });

  it('settles schema-valid/domain-invalid answers, bounds retries, and leaves providers available', async () => {
    await withLedger('router-invalid', async (ledger, sql, config) => {
      const invalid = { verb: 'rest', room: 'common', target: null, fact: null };
      const request = { ai: { run: async () => ({ response: JSON.stringify(invalid), usage: { prompt_tokens: 100, completion_tokens: 20 } }) },
        groqApiKey: 'fixture-only', config, job: cognitionJob(), attemptOrdinal: 1, quota: ledger, now: () => NOW,
        groqFetch: async () => Response.json({ id: 'retained-request', choices: [{ message: { content: JSON.stringify(invalid) } }], usage: { prompt_tokens: 110, completion_tokens: 20 } }) };
      expect(await routeCognition(request)).toMatchObject({ status: 'deferred', retryAtMs: NOW + 60_000,
        reasons: [{ detailCode: 'invalid_domain_intent', usage: { inputTokens: 100 } }, { providerRequestId: 'retained-request' }] });
      expect(await routeCognition({ ...request, attemptOrdinal: 2 })).toMatchObject({ status: 'rejected' });
      expect(sql.exec('SELECT COUNT(*) AS count FROM quota_reservations WHERE usage_confirmed=1').one()).toEqual({ count: 4 });
      expect(sql.exec('SELECT SUM(open_until_ms) AS blocked FROM provider_breakers').one()).toEqual({ blocked: 0 });
      expect(ledger.reserve('another-resident', 'groq', maximum(), NOW)).toEqual({ allowed: true });
    });
  });

  it('reports circuit-open and local minute limits distinctly without making inference calls', async () => {
    await withLedger('router-reasons', async (ledger, _sql, config) => {
      ledger.recordOutcome({ ...failed('authentication'), provider: 'workers-ai' }, NOW);
      dispatch(ledger, 'full-minute', NOW, maximum(8_000, 0));
      const run = vi.fn(), groqFetch = vi.fn<typeof fetch>();
      expect(await routeCognition({ ai: { run }, groqApiKey: 'fixture-only', config, job: cognitionJob(), attemptOrdinal: 1,
        quota: ledger, now: () => NOW, groqFetch })).toMatchObject({ status: 'deferred', retryAtMs: NOW + 60_000,
        reasons: [{ detailCode: 'provider_circuit_open', kind: 'unavailable' }, { detailCode: 'local_minute-tokens_limit', kind: 'quota-exhausted' }] });
      expect(run).not.toHaveBeenCalled(); expect(groqFetch).not.toHaveBeenCalled();
    });
  });
});
