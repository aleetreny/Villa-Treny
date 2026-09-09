import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { providerPacing, type PacingCharge } from '../src/cognition-pacing';
import { parseRuntimeConfig } from '../src/contracts';
import { GROQ_PROJECT_LIMITS, SqlQuotaLedger } from '../src/quota';
import { createGenesisWorld, deserializeWorldState, serializeWorldState } from '../src/domain';
import { createSocietyState, type SocietyState } from '../../../src/lib/habitat/society/index';
import { nextSocietyActor, prepareSocietyJob } from '../src/society-scheduler';
import { cognitionReadyAt, routeCognition } from '../src/providers/router';
import { cognitionJob } from './fixtures';

const DAY = 86_400_000, AT = Date.parse('2026-09-08T00:00:00Z');
const cfMaximum = { requests: 1, inputTokens: 15_900, outputTokens: 1024, neurons: 580 };
const sample = (at: number, charged = 80, model: string | null = 'current'): PacingCharge => ({
  dispatchedAtMs: at, activityAtMs: at, expiresAtMs: AT + DAY, charged, requests: 1, model,
});
const input = (charges: PacingCharge[], nowMs = AT + 60_000) => ({ nowMs, model: 'current',
  limit: 8000, maximum: 580, resetAtMs: AT + DAY, charges });

describe('observed-cost scheduling estimates, separate from quota permission', () => {
  it('allows a cold first opportunity without pretending the maximum is observed usage', () => {
    const result = providerPacing(input([]));
    expect(result.readyAtMs).toBe(AT + 60_000);
    expect(result.estimatedCost).toBe(580);
    expect(result.estimatedOpportunities).toBe(13);
  });
  it('uses confirmed costs and anchors waiting to real dispatch, unchanged by reads or restart', () => {
    const data = input([sample(AT)]), original = providerPacing(data);
    expect(original.estimatedCost).toBe(80);
    expect(original.estimatedOpportunities).toBe(92);
    expect(original.readyAtMs).toBe(AT + Math.ceil(DAY / 93));
    for (const delay of [1, 1000, 60_000, 300_000]) {
      expect(providerPacing({ ...structuredClone(data), nowMs: data.nowMs + delay }).readyAtMs).toBe(original.readyAtMs);
    }
  });
  it('includes charged failed/unknown calls, never turns missing or zero history into free capacity', () => {
    const result = providerPacing(input([sample(AT, 80), sample(AT + 1, 580, null)]));
    expect(result.estimatedCost).toBe(330); expect(result.remaining).toBe(7340);
    expect(providerPacing(input([sample(AT, 0)])).estimatedCost).toBe(1);
    expect(providerPacing(input([{ ...sample(AT, 580), dispatchedAtMs: null }])).remaining).toBe(7420);
    expect(providerPacing(input([{ ...sample(AT, 580), dispatchedAtMs: null }])).readyAtMs).toBe(AT + 60_000);
  });
  it('does not estimate a new model from a known cheaper old model', () => {
    const result = providerPacing(input([sample(AT, 2, 'old')]));
    expect(result.estimatedCost).toBe(580); expect(result.remaining).toBe(7998);
    expect(result.readyAtMs).toBeGreaterThan(AT + 3_600_000);
  });
  it('uses UTC only for CF; Groq keeps each rolling charge across midnight', () => {
    const at = AT + DAY - 60_000;
    const charges = [{ ...sample(at, 3000), expiresAtMs: at + DAY }];
    const groq = { nowMs: AT + DAY - 1, model: 'current', maximum: 4900,
      limit: GROQ_PROJECT_LIMITS.dayTokens, requestLimit: GROQ_PROJECT_LIMITS.dayRequests, charges };
    expect(providerPacing(groq).readyAtMs).toBe(providerPacing({ ...groq, nowMs: AT + DAY }).readyAtMs);
    const cf = providerPacing({ ...input([sample(at)], AT + DAY), resetAtMs: AT + DAY * 2 });
    expect(cf.remaining).toBe(8000); expect(cf.readyAtMs).toBe(AT + DAY);
  });
  it('uses staggered release dates and retains unknown CF carry after UTC reset', () => {
    const early = { ...sample(AT, 5000), expiresAtMs: AT + 3_600_000 };
    const late = { ...sample(AT + 1, 3000), expiresAtMs: AT + 7_200_000 };
    expect(providerPacing({ ...input([early, late]), maximum: 1000 }).readyAtMs).toBe(early.expiresAtMs);
    expect(providerPacing({ ...input([early, late], early.expiresAtMs), maximum: 1000 }).remaining).toBe(5000);
    const carry = { ...sample(AT, 8000, null), expiresAtMs: AT + DAY + 3_600_000 };
    expect(providerPacing({ ...input([carry], AT + DAY), resetAtMs: AT + DAY * 2 }).readyAtMs).toBe(carry.expiresAtMs);
  });
  it('does not compress abundant CF allowance into an early carry release', () => {
    const now = AT + 3_600_000;
    const carry = { ...sample(AT - DAY + 300_000, 580, null), expiresAtMs: now + 300_000 };
    const recent = sample(now - 1000, 80);
    const result = providerPacing(input([carry, recent], now));
    expect(result.remaining).toBe(7340);
    expect(result.readyAtMs).toBeGreaterThan(carry.expiresAtMs);
    const blocked = providerPacing({ ...input([
      { ...carry, charged: 100 }, { ...recent, charged: 7900, expiresAtMs: AT + DAY },
    ], now), maximum: 580 });
    expect(blocked.readyAtMs, 'The first small release still cannot fit the next maximum').toBe(AT + DAY);
  });
  it('keeps zero remaining request allowance unavailable even if token costs are tiny', () => {
    expect(providerPacing({ ...input([sample(AT, 1)]), requestLimit: 1 }).readyAtMs).toBe(AT + DAY);
  });
  it('prioritizes a never-successful resident over already-reviewed replies, respecting failed backoff', () => {
    const state = createSocietyState(createGenesisWorld(), AT);
    for (const m of Object.values(state.minds)) m.lastSuccessAtMs = AT;
    state.minds.C.lastSuccessAtMs = null;
    state.conversations.push({ id: 'synthetic', participants: ['A', 'B'], revision: 1,
      attentionThrough: [0, 0],
      nextSpeaker: 'B', status: 'open', createdAtMs: AT, expiresAtMs: AT + DAY,
      turns: [{ id: 'turn:1', index: 0, speaker: 'A', text: 'Synthetic request.', atMs: AT }] });
    expect(nextSocietyActor(state, AT + 1000, 1)).toBe('C');
    state.minds.C.lastAttemptAtMs = AT + 500;
    expect(nextSocietyActor(state, AT + 1000, 1)).toBe('B');
  });
});

describe('persistent indexed pacing and runtime admission', () => {
  it('uses real dispatched charges across reconstructed ledgers; reads and quota denials make no new anchor', async () => {
    const stub = env.HABITAT_WORLD.getByName('pacing-persistence');
    await runInDurableObject(stub, (_instance, state) => {
      const sql = state.storage.sql, config = { ...parseRuntimeConfig(env), WORKERS_AI_DAILY_NEURONS_LIMIT: 8000 };
      const ledger = new SqlQuotaLedger(sql, config);
      expect(ledger.reserve('pacing:workers-ai:1', 'workers-ai', cfMaximum, AT)).toEqual({ allowed: true });
      ledger.markDispatched('pacing:workers-ai:1', AT);
      ledger.settle('pacing:workers-ai:1', { inputTokens: 1500, outputTokens: 450, neurons: 80 }, AT + 1);
      const first = ledger.pacing('workers-ai', config.WORKERS_AI_MODEL, cfMaximum, AT + 60_000);
      const before = sql.exec('SELECT * FROM quota_reservations').toArray();
      ledger.reserve('oversize', 'workers-ai', { ...cfMaximum, neurons: 8001 }, AT + 120_000);
      expect(new SqlQuotaLedger(sql, config).pacing('workers-ai', config.WORKERS_AI_MODEL, cfMaximum, AT + 120_000)).toEqual(first);
      expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual(before);
      expect(ledger.reserve('hard-authority', 'workers-ai', { ...cfMaximum, neurons: 8000 }, AT + 120_000))
        .toMatchObject({ allowed: false, limit: 'day-neurons' });
    });
  });
  it('excludes an exhausted provider from preflight and returns terminal when both are spent', async () => {
    const stub = env.HABITAT_WORLD.getByName('pacing-spent-provider');
    await runInDurableObject(stub, async (_instance, state) => {
      const sql = state.storage.sql, config = parseRuntimeConfig(env), ledger = new SqlQuotaLedger(sql, config);
      const now = AT + 12 * 3_600_000, job = cognitionJob();
      for (const [ordinal, ago] of [[1, 13 * 60_000], [2, 10 * 60_000]]) {
        const id = `${job.jobId}:workers-ai:${ordinal}`;
        ledger.reserve(id, 'workers-ai', cfMaximum, now - ago!); ledger.markDispatched(id, now - ago!);
        ledger.settle(id, { inputTokens: 1500, outputTokens: 450, neurons: 80 }, now - ago!);
      }
      const groqMax = { requests: 1, inputTokens: 3800, outputTokens: 1024, neurons: 0 };
      ledger.reserve('other:groq:1', 'groq', groqMax, now - 1000); ledger.markDispatched('other:groq:1', now - 1000);
      ledger.settle('other:groq:1', { inputTokens: 2500, outputTokens: 500 }, now - 999);
      const ready = await cognitionReadyAt({ job, config, quota: ledger, nowMs: now, groqAvailable: true });
      expect(ready).toBeGreaterThan(now + 15 * 60_000);
      for (const ordinal of [1, 2]) {
        const at = now + ordinal * 60_000, id = `${job.jobId}:groq:${ordinal}`;
        ledger.reserve(id, 'groq', groqMax, at); ledger.markDispatched(id, at);
        ledger.settle(id, { inputTokens: 2500, outputTokens: 500 }, at);
      }
      expect(await cognitionReadyAt({ job, config, quota: ledger, nowMs: now + 180_000, groqAvailable: true })).toBeNull();
    });
  });
  it('uses a ready fallback when primary is paced, without inventing a failed primary attempt', async () => {
    const stub = env.HABITAT_WORLD.getByName('pacing-fallback');
    await runInDurableObject(stub, async (_instance, state) => {
      const sql = state.storage.sql, config = parseRuntimeConfig(env), ledger = new SqlQuotaLedger(sql, config);
      ledger.reserve('earlier:workers-ai:1', 'workers-ai', cfMaximum, AT);
      ledger.markDispatched('earlier:workers-ai:1', AT);
      ledger.settle('earlier:workers-ai:1', { inputTokens: 1500, outputTokens: 450, neurons: 80 }, AT + 1);
      const run = vi.fn(), groqFetch = vi.fn(async () => Response.json({
        choices: [{ message: { content: '{"thought":"wait"}' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }));
      const result = await routeCognition({ ai: { run }, groqApiKey: 'isolated-test-key', config, job: cognitionJob(),
        attemptOrdinal: 1, quota: ledger, pacing: true, now: () => AT + 1000, groqFetch, validatePayload: () => true });
      expect(result).toMatchObject({ status: 'completed', result: { provider: 'groq' }, attempts: [{ provider: 'groq' }] });
      expect(run).not.toHaveBeenCalled(); expect(groqFetch).toHaveBeenCalledTimes(1);
      const before = sql.exec('SELECT * FROM quota_reservations').toArray();
      const request = { ai: { run }, groqApiKey: 'isolated-test-key', config,
        job: cognitionJob({ jobId: 'another-job' }), attemptOrdinal: 1, quota: ledger, pacing: true, groqFetch };
      const firstWait = await routeCognition({ ...request, now: () => AT + 2000 });
      expect(firstWait).toMatchObject({ status: 'deferred', reasons: [] });
      expect(await routeCognition({ ...request, now: () => AT + 2001 })).toEqual(firstWait);
      expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual(before);
      expect(run).not.toHaveBeenCalled(); expect(groqFetch).toHaveBeenCalledTimes(1);
    });
  });
  it.each(['world-changed', 'already-claimed'] as const)('aborts a stale claim after pacing await: %s', async (interleaving) => {
    const now = AT + 3_600_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const stub = env.HABITAT_WORLD.getByName(`pacing-interleave-${interleaving}`);
      await runInDurableObject(stub, async (instance, state) => {
        const sql = state.storage.sql;
        const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
        const society = createSocietyState(world, AT);
        society.minds.A.lastAttemptAtMs = AT;
        sql.exec('UPDATE society_state SET state_json=?', JSON.stringify(society));
        sql.exec("UPDATE runtime_meta SET mode='running'");
        const meta = sql.exec<{ control_revision: number; world_revision: number }>('SELECT control_revision,world_revision FROM runtime_meta').one();
        const { turn, job } = prepareSocietyJob({ state: society, world, actor: 'A', nowMs: now, sequence: 1,
          generation: meta.control_revision, worldRevision: meta.world_revision, habitatId: parseRuntimeConfig(env).HABITAT_ID });
        sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,?)',
          1, job.jobId, 'A', JSON.stringify(turn), turn.generation);
        sql.exec("INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts) VALUES(?,?,'pending',0,?,?,0)",
          job.jobId, JSON.stringify(job), now, now);
        const pending = (instance as unknown as { processSocietyJob(id: string, now: number): Promise<void> }).processSocietyJob(job.jobId, now);
        // This is the real asynchronous preflight boundary, before claiming.
        if (interleaving === 'world-changed') {
          world.economy.stock.water -= 1;
          society.minds.B.revision += 1; society.revision += 1;
          sql.exec('UPDATE society_state SET revision=?,state_json=?', society.revision, JSON.stringify(society));
          sql.exec('UPDATE runtime_meta SET world_revision=world_revision+1');
          sql.exec('UPDATE world_state SET world_revision=world_revision+1,state_json=?', serializeWorldState(world));
        } else sql.exec("UPDATE cognition_jobs SET status='running',attempts=1,lease_expires_at_ms=?", now + 120_000);
        const savedWorld = sql.exec('SELECT * FROM world_state').toArray();
        const savedSociety = sql.exec('SELECT * FROM society_state').toArray();
        const savedJob = sql.exec('SELECT * FROM cognition_jobs').toArray();
        await pending;
        expect(sql.exec('SELECT * FROM world_state').toArray()).toEqual(savedWorld);
        expect(sql.exec('SELECT * FROM society_state').toArray()).toEqual(savedSociety);
        expect(sql.exec('SELECT * FROM cognition_jobs').toArray()).toEqual(savedJob);
        expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual([]);
      });
    } finally { vi.restoreAllMocks(); }
  });
  it('does not persist jobs, mark attempts, advance physics or call providers while both providers are paced', async () => {
    const now = AT + 3_600_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stub = env.HABITAT_WORLD.getByName('pacing-no-job');
    try {
      await runInDurableObject(stub, async (instance, state) => {
        const sql = state.storage.sql, config = parseRuntimeConfig(env), ledger = new SqlQuotaLedger(sql, config);
        const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
        const society = createSocietyState(world, AT);
        for (const mind of Object.values(society.minds)) { mind.lastAttemptAtMs = AT; mind.lastSuccessAtMs = AT; }
        // One genuine observation makes a review due without claiming a new physical watch.
        society.minds.A.memories.push({ id: 'memory:0', kind: 'observation', text: 'Synthetic observation.',
          refs: [], atWatch: 400, createdAtMs: now - 1, importance: 3, source: null });
        society.nextId = 1;
        sql.exec('UPDATE society_state SET state_json=?', JSON.stringify(society));
        sql.exec("UPDATE runtime_meta SET mode='running',next_cognition_at_ms=?,next_watch_at_ms=?", now, now + 21_600_000);
        for (const provider of ['workers-ai', 'groq'] as const) {
          const max = provider === 'workers-ai' ? cfMaximum : { requests: 1, inputTokens: 3800, outputTokens: 1024, neurons: 0 };
          const id = `pacing:${provider}:1`;
          ledger.reserve(id, provider, max, now - 1000); ledger.markDispatched(id, now - 1000);
          ledger.settle(id, provider === 'workers-ai' ? { inputTokens: 1500, outputTokens: 450, neurons: 80 }
            : { inputTokens: 2500, outputTokens: 500 }, now - 999);
        }
        const beforeWorld = sql.exec('SELECT * FROM world_state').toArray();
        const beforeMind = sql.exec('SELECT * FROM society_state').toArray();
        const beforeQuota = sql.exec('SELECT * FROM quota_reservations').toArray();
        const internal = instance as unknown as { runCognitionWake(now: number): Promise<void> };
        await internal.runCognitionWake(now);
        const next = sql.exec<{ next_cognition_at_ms: number }>('SELECT next_cognition_at_ms FROM runtime_meta').one().next_cognition_at_ms;
        expect(next).toBeGreaterThan(now + 180_000);
        expect(sql.exec('SELECT * FROM cognition_jobs').toArray()).toEqual([]);
        expect(sql.exec('SELECT * FROM cognition_contexts').toArray()).toEqual([]);
        expect(sql.exec('SELECT * FROM world_state').toArray()).toEqual(beforeWorld);
        expect(sql.exec('SELECT * FROM society_state').toArray()).toEqual(beforeMind);
        expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual(beforeQuota);
        await internal.runCognitionWake(now + 1000);
        expect(sql.exec<{ next_cognition_at_ms: number }>('SELECT next_cognition_at_ms FROM runtime_meta').one().next_cognition_at_ms).toBe(next);
        expect((JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState).minds.A.lastAttemptAtMs).toBe(AT);
        // A saved retry whose immutable context cannot survive the wait is
        // retired without another provider attempt; its eventual review starts
        // from fresh context when the already-fixed pacing deadline arrives.
        const candidate = prepareSocietyJob({ state: society, world, actor: 'A', nowMs: now, sequence: 1,
          generation: sql.exec<{ control_revision: number }>('SELECT control_revision FROM runtime_meta').one().control_revision,
          worldRevision: sql.exec<{ world_revision: number }>('SELECT world_revision FROM runtime_meta').one().world_revision,
          habitatId: config.HABITAT_ID });
        candidate.turn.expiresAtMs = now + 10_000;
        sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,?)',
          1, candidate.job.jobId, 'A', JSON.stringify(candidate.turn), candidate.turn.generation);
        sql.exec("INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts) VALUES(?,?,'pending',0,?,?,0)",
          candidate.job.jobId, JSON.stringify(candidate.job), now, now);
        await (instance as unknown as { processSocietyJob(id: string, now: number): Promise<void> }).processSocietyJob(candidate.job.jobId, now);
        expect(sql.exec('SELECT status,attempts,error_code FROM cognition_jobs').one())
          .toEqual({ status: 'dead', attempts: 0, error_code: 'pacing_context_expired' });
        expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual(beforeQuota);
        expect(sql.exec('SELECT * FROM society_state').toArray()).toEqual(beforeMind);

      });
    } finally { vi.restoreAllMocks(); }
  });
});
