import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cognitionJobSchema, parseRuntimeConfig, type CognitionJob, type ProviderId,
  type ProviderUsage, type RuntimeConfig } from '../src/contracts';
import { routeCognition } from '../src/providers/router';
import { GROQ_120B_MODEL, GROQ_MODEL } from '../src/providers/groq';
import { OSS_WORKERS_AI_MODEL } from '../src/providers/workers-ai';
import * as estimator from '../src/providers/groq-token-estimate';
import type { QuotaMaximum, QuotaReservationDecision, SqlQuotaLedger } from '../src/quota';
import { cognitionJob } from './fixtures';

const NOW = 1_788_900_000_000;
const CF = OSS_WORKERS_AI_MODEL;
const G120 = GROQ_120B_MODEL;
const G20 = GROQ_MODEL;

function config(enabled?: 'true' | 'false'): RuntimeConfig {
  return parseRuntimeConfig({ HABITAT_ID: 'habitat-canonical', PUBLIC_ORIGIN: 'https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev',
    TICK_INTERVAL_MS: '21600000', MAX_COGNITIONS_PER_ALARM: '1', WORKERS_AI_MODEL: CF,
    WORKERS_AI_DAILY_NEURONS_LIMIT: '8000', GROQ_MODEL: G20, GROQ_DAILY_TOTAL_TOKENS_LIMIT: '200000',
    ...(enabled === undefined ? {} : { GROQ_120B_ENABLED: enabled }) });
}

// A transport-only fixture: domain approval is injected explicitly. These tests
// exercise the real provider adapters without generating or applying a thought.
function job(marker = true): CognitionJob {
  return cognitionJob({ kind: 'society_turn', maxOutputTokens: 1024,
    ...(marker ? { routingPolicy: 'free-models-v1' as const } : {}),
    outputContract: { name: 'society_turn', version: 6, schemaHash: 'sha256:routing-fixture',
      jsonSchema: { type: 'object', properties: { choice: { type: 'string' } },
        required: ['choice'], additionalProperties: false } } });
}

function envelope(choice = 'ready') {
  return { id: 'synthetic-provider-request', choices: [{ finish_reason: 'stop',
    message: { content: JSON.stringify({ choice }) } }],
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } };
}

function response(choice = 'ready') {
  return new Response(JSON.stringify(envelope(choice)), { headers: { 'content-type': 'application/json' } });
}

function modelFrom(init?: RequestInit): string {
  return (JSON.parse(String(init?.body)) as { model: string }).model;
}

type Row = { id: string; jobId: string; provider: ProviderId; model: string;
  maximum: QuotaMaximum; dispatched: boolean; usage?: ProviderUsage };

/** Stateful reservation/dispatch test double. Real SQLite quota tests own the
 * windows and model migration; here counts change only when actual mock I/O is
 * about to begin, so alarm ordinals cannot masquerade as submitted requests. */
function ledger(events: string[] = []) {
  const rows = new Map<string, Row>();
  const ready = new Map<string, number>();
  const count = (id: string, provider: ProviderId, model?: string) => [...rows.values()]
    .filter(row => row.jobId === id && row.provider === provider && row.dispatched
      && (model === undefined || row.model === model)).length;
  const total = (id: string) => [...rows.values()].filter(row => row.jobId === id && row.dispatched).length;
  const reserve = vi.fn((id: string, provider: ProviderId, maximum: QuotaMaximum, at: number,
    jobId = '', model?: string): QuotaReservationDecision => {
    events.push(`reserve:${model ?? provider}`);
    if (rows.has(id)) return { allowed: false, reason: 'duplicate', retryAtMs: at };
    if (count(jobId, provider, model) >= 2 || (model !== undefined && total(jobId) >= 4)) {
      return { allowed: false, reason: 'attempt-limit', retryAtMs: at };
    }
    rows.set(id, { id, jobId, provider, model: model ?? (provider === 'workers-ai' ? CF : G20),
      maximum, dispatched: false });
    return { allowed: true };
  });
  const markDispatched = vi.fn((id: string) => {
    const row = rows.get(id);
    if (!row || row.dispatched) throw new Error('duplicate or unreserved mock dispatch');
    row.dispatched = true; events.push(`dispatch:${row.model}`);
  });
  const settle = vi.fn((id: string, usage: ProviderUsage) => {
    const row = rows.get(id);
    if (!row?.dispatched) throw new Error('settlement without submitted request');
    if (usage.inputTokens !== undefined && usage.outputTokens !== undefined && !usage.incomplete) row.usage ??= usage;
    events.push(`settle:${row.model}`);
  });
  const recordOutcome = vi.fn((result: { model: string }) => { events.push(`outcome:${result.model}`); });
  const pacing = vi.fn((_provider: ProviderId, model: string, _maximum: QuotaMaximum, at: number) =>
    ({ readyAtMs: ready.get(model) ?? at }));
  const mock = { reserve, markDispatched, settle, recordOutcome, pacing,
    dispatchedCount: vi.fn(count), dispatchedTotal: vi.fn(total) };
  return { rows, ready, ...mock, quota: mock as unknown as SqlQuotaLedger };
}

function input(quota: SqlQuotaLedger, currentJob = job()) {
  return { config: config('true'), job: currentJob, quota, attemptOrdinal: 1,
    now: () => NOW, groqApiKey: 'isolated-test-key', validatePayload: () => true };
}

describe('explicit free-model route', () => {
  beforeEach(() => { vi.spyOn(estimator, 'estimateGroqInputTokens').mockResolvedValue(256); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('requires an explicit flag for Groq120B and preserves the separate Free daily ceiling', () => {
    expect(config()).toMatchObject({ GROQ_120B_ENABLED: false, GROQ_120B_DAILY_TOTAL_TOKENS_LIMIT: 200_000 });
    expect(config('false').GROQ_120B_ENABLED).toBe(false);
    expect(config('true').GROQ_120B_ENABLED).toBe(true);
    expect(() => parseRuntimeConfig({ ...config(), GROQ_120B_ENABLED: 'yes' })).toThrow();
  });

  it.each([1, 2, 3, 4, 5])('does not reinterpret saved protocol %i as a marked P6 job', version => {
    const current = job();
    expect(cognitionJobSchema.safeParse({ ...current, outputContract: { ...current.outputContract, version } }).success).toBe(false);
    const historical = job(false);
    expect(cognitionJobSchema.safeParse({ ...historical, outputContract: { ...historical.outputContract, version } }).success).toBe(true);
  });

  it('tries eligible CF, Groq120B and Groq20B in order, preserving actual model, usage and model-scoped IDs', async () => {
    const q = ledger(), requests: string[] = [];
    const run = vi.fn(async (model: string) => { requests.push(model); throw new Error('synthetic primary unavailable'); });
    const groqFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const model = modelFrom(init); requests.push(model);
      return response(model === G120 ? 'reject' : 'ready');
    });
    const current = job();
    const result = await routeCognition({ ...input(q.quota, current), ai: { run }, groqFetch,
      validatePayload: payload => (payload as { choice: string }).choice === 'ready' });
    expect(requests).toEqual([CF, G120, G20]);
    expect(result).toMatchObject({ status: 'completed', result: { provider: 'groq', model: G20,
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } } });
    expect([...q.rows.values()].map(row => [row.id, row.model])).toEqual([
      [`${current.jobId}:workers-ai:${encodeURIComponent(CF)}:1`, CF],
      [`${current.jobId}:groq:${encodeURIComponent(G120)}:1`, G120],
      [`${current.jobId}:groq:${encodeURIComponent(G20)}:1`, G20],
    ]);
    expect(q.reserve.mock.calls.every(call => call[5] !== undefined)).toBe(true);
    expect(estimator.estimateGroqInputTokens).toHaveBeenCalledWith(current, G20);
    // Both OSS models use the same encoder/framing for this unchanged job.
    // Count once within this route, while reserving each model independently.
    expect(estimator.estimateGroqInputTokens).toHaveBeenCalledTimes(1);
    expect(q.reserve.mock.calls.filter(call => call[1] === 'groq').map(call => call[2].inputTokens)).toEqual([256, 256]);
    const sent = JSON.parse(String(groqFetch.mock.calls[0]![1]!.body));
    expect(sent).toMatchObject({ model: G120, reasoning_effort: 'low', max_completion_tokens: 1024,
      response_format: { type: 'json_schema', json_schema: { name: 'society_turn', strict: false,
        schema: current.outputContract.jsonSchema } } });
    expect(q.rows.get(`${current.jobId}:groq:${encodeURIComponent(G120)}:1`)?.usage)
      .toMatchObject({ inputTokens: 100, outputTokens: 20, totalTokens: 120 });
  });

  it('returns Groq120B as the completed model when its actual response is accepted', async () => {
    const q = ledger();
    const groqFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(modelFrom(init)).toBe(G120); return response();
    });
    const result = await routeCognition({ ...input(q.quota), ai: { run: async () => { throw new Error('synthetic unavailable'); } }, groqFetch });
    expect(result).toMatchObject({ status: 'completed', result: { model: G120, provider: 'groq',
      payload: { choice: 'ready' }, providerRequestId: 'synthetic-provider-request' } });
    expect(groqFetch).toHaveBeenCalledTimes(1);
  });

  it('omits disabled Groq120B even on a newly marked job', async () => {
    const q = ledger();
    const groqFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(modelFrom(init)).toBe(G20); return response();
    });
    await routeCognition({ ...input(q.quota), config: config('false'),
      ai: { run: async () => { throw new Error('synthetic unavailable'); } }, groqFetch });
    expect(groqFetch).toHaveBeenCalledTimes(1);
    expect(q.reserve.mock.calls.map(call => call[5])).toEqual([CF, G20]);
    expect(estimator.estimateGroqInputTokens).not.toHaveBeenCalledWith(expect.anything(), G120);
  });

  it('keeps the historical 20B-only route and IDs when the saved job has no routing marker', async () => {
    const q = ledger(), current = job(false);
    const groqFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(modelFrom(init)).toBe(G20); return response();
    });
    const result = await routeCognition({ ...input(q.quota, current),
      ai: { run: async () => { throw new Error('synthetic unavailable'); } }, groqFetch });
    expect(result.status).toBe('completed');
    expect([...q.rows.keys()]).toEqual([`${current.jobId}:workers-ai:1`, `${current.jobId}:groq:1`]);
    expect(q.reserve.mock.calls.every(call => call.length === 5)).toBe(true);
    expect(groqFetch).toHaveBeenCalledTimes(1);
  });

  it('selects the first currently eligible destination without charging paced models', async () => {
    const q = ledger(); q.ready.set(CF, NOW + 600_000); q.ready.set(G120, NOW + 300_000);
    const run = vi.fn();
    const groqFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(modelFrom(init)).toBe(G20); return response();
    });
    const result = await routeCognition({ ...input(q.quota), pacing: true, ai: { run }, groqFetch });
    expect(result).toMatchObject({ status: 'completed', result: { model: G20 } });
    expect(run).not.toHaveBeenCalled();
    expect(q.pacing.mock.calls.map(call => call[1])).toEqual([CF, G120, G20]);
    expect(q.reserve.mock.calls.map(call => call[5])).toEqual([G20]);
    expect(q.rows.size).toBe(1);
  });

  it('defers to the first eligible paced model, with no reservation or mock I/O', async () => {
    const q = ledger(); q.ready.set(CF, NOW + 600_000); q.ready.set(G120, NOW + 300_000); q.ready.set(G20, NOW + 900_000);
    const run = vi.fn(), groqFetch = vi.fn();
    const result = await routeCognition({ ...input(q.quota), pacing: true, ai: { run }, groqFetch });
    expect(result).toMatchObject({ status: 'deferred', retryAtMs: NOW + 300_000 });
    expect(q.reserve).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled(); expect(groqFetch).not.toHaveBeenCalled();
  });

  it('does not reuse an attempt ID or dispatch fallback when the first reservation is already recorded', async () => {
    const q = ledger(), run = vi.fn(async () => envelope()), groqFetch = vi.fn();
    const args = { ...input(q.quota), ai: { run }, groqFetch };
    expect((await routeCognition(args)).status).toBe('completed');
    const charged = structuredClone([...q.rows.values()]);
    expect((await routeCognition(args)).status).toBe('rejected');
    expect([...q.rows.values()]).toEqual(charged);
    expect(run).toHaveBeenCalledTimes(1); expect(groqFetch).not.toHaveBeenCalled();
  });

  it('counts actual submissions across wakes, enforcing four per job and at most two per destination', async () => {
    const q = ledger(), requests: string[] = [], current = job();
    const run = vi.fn(async (model: string) => { requests.push(model); return envelope('reject'); });
    const groqFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(modelFrom(init)); return response('reject');
    });
    const args = { ...input(q.quota, current), ai: { run }, groqFetch, validatePayload: () => false };
    await routeCognition(args);
    await routeCognition({ ...args, attemptOrdinal: 2 });
    const charged = structuredClone([...q.rows.values()]);
    const third = await routeCognition({ ...args, attemptOrdinal: 3 });
    expect(requests).toEqual([CF, G120, G20, CF]);
    expect(q.dispatchedTotal(current.jobId)).toBe(4);
    expect(q.dispatchedCount(current.jobId, 'workers-ai', CF)).toBe(2);
    expect(q.dispatchedCount(current.jobId, 'groq', G120)).toBe(1);
    expect(q.dispatchedCount(current.jobId, 'groq', G20)).toBe(1);
    expect([...q.rows.values()]).toEqual(charged);
    expect(third.status).toBe('rejected');
  });

  it('does not treat a high alarm ordinal as four submitted requests', async () => {
    const q = ledger(), run = vi.fn(async () => envelope());
    const result = await routeCognition({ ...input(q.quota), attemptOrdinal: 9, ai: { run } });
    expect(result.status).toBe('completed'); expect(run).toHaveBeenCalledTimes(1);
    expect([...q.rows.keys()]).toEqual([`${job().jobId}:workers-ai:${encodeURIComponent(CF)}:9`]);
  });

  it('allows a second Groq120B submission even when Groq20B has already been used for this job', async () => {
    const q = ledger(), current = job(); q.ready.set(CF, NOW + 600_000);
    for (const model of [G120, G20]) {
      const id = `${current.jobId}:groq:${encodeURIComponent(model)}:1`;
      q.reserve(id, 'groq', { requests: 1, inputTokens: 256, outputTokens: 1024, neurons: 0 }, NOW - 60_000, current.jobId, model);
      q.markDispatched(id);
    }
    q.reserve.mockClear();
    const groqFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(modelFrom(init)).toBe(G120); return response();
    });
    const result = await routeCognition({ ...input(q.quota, current), pacing: true, attemptOrdinal: 2,
      ai: { run: vi.fn() }, groqFetch });
    expect(result).toMatchObject({ status: 'completed', result: { model: G120 } });
    expect(q.reserve.mock.calls.map(call => call[5])).toEqual([G120]);
    expect(q.dispatchedCount(current.jobId, 'groq', G120)).toBe(2);
    expect(q.dispatchedCount(current.jobId, 'groq', G20)).toBe(1);
  });

  it.each(['ready', 'reject'] as const)('skips an exhausted destination and handles the fourth global response as terminal: %s', async choice => {
    const q = ledger(), current = job(); q.ready.set(CF, NOW + 600_000);
    for (const [model, ordinal] of [[G120, 1], [G120, 2], [G20, 1]] as const) {
      const id = `${current.jobId}:groq:${encodeURIComponent(model)}:${ordinal}`;
      q.reserve(id, 'groq', { requests: 1, inputTokens: 256, outputTokens: 1024, neurons: 0 }, NOW - 60_000, current.jobId, model);
      q.markDispatched(id);
    }
    q.reserve.mockClear();
    const groqFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(modelFrom(init)).toBe(G20); return response(choice);
    });
    const result = await routeCognition({ ...input(q.quota, current), pacing: true, attemptOrdinal: 3,
      ai: { run: vi.fn() }, groqFetch,
      validatePayload: payload => (payload as { choice: string }).choice === 'ready' });
    if (choice === 'ready') expect(result).toMatchObject({ status: 'completed', result: { model: G20 } });
    else expect(result.status).toBe('rejected');
    expect(q.reserve.mock.calls.map(call => call[5])).toEqual([G20]);
    expect(q.dispatchedTotal(current.jobId)).toBe(4);
    expect(q.dispatchedCount(current.jobId, 'groq', G120)).toBe(2);
    expect(q.dispatchedCount(current.jobId, 'groq', G20)).toBe(2);
  });

  it('requires a complete 45-second window before the first reservation', async () => {
    const q = ledger(), run = vi.fn(), groqFetch = vi.fn();
    const result = await routeCognition({ ...input(q.quota), deadlineAtMs: NOW + 44_999, ai: { run }, groqFetch });
    expect(result).toMatchObject({ status: 'deferred', reasons: expect.arrayContaining([
      expect.objectContaining({ detailCode: 'route_time_budget' }),
    ]) });
    expect(q.reserve).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled(); expect(groqFetch).not.toHaveBeenCalled();
  });

  it('stops after two 45-second attempts instead of reserving a third provider beyond the route deadline', async () => {
    const q = ledger(); let clock = NOW;
    const run = vi.fn(async () => { clock += 45_000; throw new Error('synthetic unavailable'); });
    const groqFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(modelFrom(init)).toBe(G120); clock += 45_000; return response('reject');
    });
    const result = await routeCognition({ ...input(q.quota), now: () => clock, deadlineAtMs: NOW + 90_000,
      ai: { run }, groqFetch, validatePayload: () => false });
    expect(result).toMatchObject({ status: 'deferred', reasons: expect.arrayContaining([
      expect.objectContaining({ detailCode: 'route_time_budget' }),
    ]) });
    expect(run).toHaveBeenCalledTimes(1); expect(groqFetch).toHaveBeenCalledTimes(1);
    expect(q.reserve.mock.calls.map(call => call[5])).toEqual([CF, G120]);
    expect(q.settle).toHaveBeenCalledTimes(1);
  });

  it('rechecks pause after tokenization, before reserving either Groq model', async () => {
    const q = ledger(); let active = true;
    vi.mocked(estimator.estimateGroqInputTokens).mockImplementation(async () => { await Promise.resolve(); active = false; return 256; });
    const groqFetch = vi.fn();
    const result = await routeCognition({ ...input(q.quota), canDispatch: () => active,
      ai: { run: async () => { throw new Error('synthetic unavailable'); } }, groqFetch });
    expect(result).toMatchObject({ status: 'rejected', reasons: expect.arrayContaining([
      expect.objectContaining({ detailCode: 'control_revision_changed' }),
    ]) });
    expect(q.reserve.mock.calls.map(call => call[5])).toEqual([CF]);
    expect(groqFetch).not.toHaveBeenCalled();
  });

  it('rechecks route time after tokenization rather than reserving with an expired preflight', async () => {
    const q = ledger(); q.ready.set(CF, NOW + 500_000); let clock = NOW;
    vi.mocked(estimator.estimateGroqInputTokens).mockImplementation(async () => { clock += 60_001; return 256; });
    const run = vi.fn(), groqFetch = vi.fn();
    const result = await routeCognition({ ...input(q.quota), now: () => clock, pacing: true,
      deadlineAtMs: NOW + 105_000, ai: { run }, groqFetch });
    expect(result).toMatchObject({ status: 'deferred', reasons: expect.arrayContaining([
      expect.objectContaining({ detailCode: 'route_time_budget' }),
    ]) });
    expect(q.reserve).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled(); expect(groqFetch).not.toHaveBeenCalled();
  });

  it('settles a billed rejected answer and records its durable receipt before reserving the fallback', async () => {
    const events: string[] = [], q = ledger(events);
    const run = vi.fn(async () => envelope('reject'));
    const groqFetch = vi.fn(async () => {
      expect(events).toEqual([`reserve:${CF}`, `dispatch:${CF}`, `settle:${CF}`, `outcome:${CF}`, `receipt:${CF}`,
        `reserve:${G120}`, `dispatch:${G120}`]);
      return response();
    });
    const result = await routeCognition({ ...input(q.quota), ai: { run }, groqFetch,
      validatePayload: payload => (payload as { choice: string }).choice === 'ready',
      onAttempt: attempt => { events.push(`receipt:${attempt.model}`); } });
    expect(result).toMatchObject({ status: 'completed', result: { model: G120 } });
    const primary = [...q.rows.values()].find(row => row.model === CF)!;
    expect(primary.usage).toMatchObject({ inputTokens: 100, outputTokens: 20, neurons: 5 });
    expect(q.settle).toHaveBeenCalledTimes(2);
  });

  it('stops if durable accounting fails instead of sending an unrecorded fallback', async () => {
    const q = ledger(), groqFetch = vi.fn();
    q.settle.mockImplementation(() => { throw new Error('synthetic accounting write failure'); });
    await expect(routeCognition({ ...input(q.quota), ai: { run: async () => envelope('reject') },
      groqFetch, validatePayload: () => false })).rejects.toThrow('synthetic accounting write failure');
    expect(groqFetch).not.toHaveBeenCalled(); expect(q.reserve).toHaveBeenCalledTimes(1);
  });

  it('does not send fallback when persisting the previous attempt receipt fails', async () => {
    const q = ledger(), groqFetch = vi.fn();
    await expect(routeCognition({ ...input(q.quota), ai: { run: async () => envelope('reject') },
      groqFetch, validatePayload: () => false,
      onAttempt: () => { throw new Error('synthetic receipt write failure'); },
    })).rejects.toThrow('synthetic receipt write failure');
    expect(q.settle).toHaveBeenCalledTimes(1);
    expect(q.recordOutcome).toHaveBeenCalledTimes(1);
    expect(groqFetch).not.toHaveBeenCalled(); expect(q.reserve).toHaveBeenCalledTimes(1);
  });

  it('preserves an unknown primary charge at its reserved maximum before using a fallback', async () => {
    const q = ledger(), current = job();
    const groqFetch = vi.fn(async () => {
      const primary = [...q.rows.values()].find(row => row.model === CF)!;
      expect(primary.dispatched).toBe(true); expect(primary.usage).toBeUndefined();
      expect(primary.maximum.neurons).toBeGreaterThan(0);
      expect(q.recordOutcome).toHaveBeenCalledTimes(1);
      return response();
    });
    const result = await routeCognition({ ...input(q.quota, current),
      ai: { run: async () => { throw new DOMException('synthetic unknown completion', 'TimeoutError'); } }, groqFetch });
    expect(result).toMatchObject({ status: 'completed', result: { model: G120 } });
    expect([...q.rows.values()].find(row => row.model === CF)?.usage).toBeUndefined();
    expect(q.settle).toHaveBeenCalledTimes(1);
    expect(q.settle.mock.calls[0]![0]).toBe(`${current.jobId}:groq:${encodeURIComponent(G120)}:1`);
  });

  it('rejects a marked route without the explicit domain validator before reserving or requesting', async () => {
    const q = ledger(), run = vi.fn(), groqFetch = vi.fn();
    const result = await routeCognition({ config: config('true'), job: job(), quota: q.quota,
      attemptOrdinal: 1, groqApiKey: 'isolated-test-key', ai: { run }, groqFetch });
    expect(result).toMatchObject({ status: 'rejected', reasons: [expect.objectContaining({ detailCode: 'invalid_routing_contract' })] });
    expect(q.reserve).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled(); expect(groqFetch).not.toHaveBeenCalled();
  });
});
