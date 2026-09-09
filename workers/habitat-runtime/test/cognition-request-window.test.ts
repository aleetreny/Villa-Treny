import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSocietyState, markSocietyAttempt } from '../../../src/lib/habitat/society/index';
import { deserializeWorldState } from '../src/domain';
import { parseRuntimeConfig } from '../src/contracts';
import { SqlQuotaLedger } from '../src/quota';
import { COGNITION_CADENCE_MS, hasSocietyRequestWindow, prepareSocietyJob } from '../src/society-scheduler';
import * as estimator from '../src/providers/groq-token-estimate';

const NOW = Date.parse('2026-09-08T22:12:13.964Z');
const TTL = 900_000;
type Runtime = {
  runtimeEnv: Env;
  processSocietyJob(id: string, now: number): Promise<void>;
  applySocietyJob(id: string, now: number): void;
  prepareNextSocietyJob(now: number): Promise<string | undefined>;
  retireStaleJobs(now: number): void;
  runCognitionWake(now: number): Promise<void>;
};
const response = { attention: { kind: 'contact' }, content: {
  project: { mode: 'replace', goal: 'Check the stores.', why: 'Understand the available supplies.', visibility: 'private', steps: [] },
  message: { to: 'A', text: 'I will check the stores.', close: true },
} };
function setup(sql: SqlStorage, remaining: number, marked: boolean, retry = false) {
  const created = NOW + remaining - TTL;
  const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
  let society = createSocietyState(world, created - 1);
  const prepared = prepareSocietyJob({ state: society, world, actor: 'N', nowMs: created, sequence: 94,
    generation: 0, worldRevision: 0, habitatId: env.HABITAT_ID,
    ...(marked ? { routingPolicy: 'free-models-v1' as const } : {}) });
  if (retry) society = markSocietyAttempt(society, 'N', created + 1000);
  sql.exec('UPDATE society_state SET revision=?,state_json=?', society.revision, JSON.stringify(society));
  sql.exec("UPDATE runtime_meta SET mode='running',next_watch_at_ms=?,next_cognition_at_ms=?", NOW + 21_600_000, NOW + COGNITION_CADENCE_MS);
  sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,?)',
    prepared.turn.sequence, prepared.job.jobId, 'N', JSON.stringify(prepared.turn), 0);
  sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts,error_code)
    VALUES(?,?,?,0,?,?,?,?)`, prepared.job.jobId, JSON.stringify(prepared.job), retry ? 'deferred' : 'pending',
    created, NOW, retry ? 1 : 0, retry ? 'invalid_society:invalid_attention_choice' : null);
  return { ...prepared, society, created };
}
function immutable(sql: SqlStorage) {
  return {
    society: sql.exec('SELECT * FROM society_state').toArray(),
    world: sql.exec('SELECT * FROM world_state').toArray(),
    quota: sql.exec('SELECT * FROM quota_reservations').toArray(),
    attempts: sql.exec('SELECT * FROM provider_attempts').toArray(),
    clock: sql.exec('SELECT next_watch_at_ms,world_revision,control_revision FROM runtime_meta').one(),
  };
}
async function isolated(name: string, test: (runtime: Runtime, sql: SqlStorage) => Promise<void> | void) {
  const stub = env.HABITAT_WORLD.getByName(`request-window-${name}`);
  await stub.getObserver();
  await runInDurableObject(stub, async (instance, storage) => {
    const runtime = instance as unknown as Runtime, previous = runtime.runtimeEnv;
    // Any accidental provider dispatch fails locally; no remote binding or key.
    runtime.runtimeEnv = { ...previous, AI: { run: vi.fn(() => { throw new Error('Unexpected local dispatch'); }) } as unknown as Ai, GROQ_API_KEY: '' };
    try { await test(runtime, storage.storage.sql); } finally { runtime.runtimeEnv = previous; }
  });
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External HTTP is forbidden in request-window tests'); })));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('usable cognition request window before another claim', () => {
  it('uses one 45-second request plus the 10-second commit margin, inclusively', () => {
    expect(hasSocietyRequestWindow(NOW + 55_000, NOW)).toBe(true);
    expect(hasSocietyRequestWindow(NOW + 54_999, NOW)).toBe(false);
    expect(hasSocietyRequestWindow(NOW, NOW)).toBe(false);
    expect(hasSocietyRequestWindow(Infinity, NOW)).toBe(false);
  });

  it.each([false, true])('allows exactly 55 seconds for a %s marked job and applies its synthetic provider response', async marked => {
    await isolated(`boundary-${marked}`, async (runtime, sql) => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const { job } = setup(sql, 55_000, marked);
      expect(job.outputContract.version).toBe(8);
      const fake = vi.fn().mockResolvedValue({ response: JSON.stringify(response), usage: { prompt_tokens: 500, completion_tokens: 30 } });
      runtime.runtimeEnv.AI = { run: fake } as unknown as Ai;
      await runtime.processSocietyJob(job.jobId, NOW);
      expect(fake).toHaveBeenCalledTimes(1);
      expect(sql.exec('SELECT status,attempts FROM cognition_jobs').one()).toEqual({ status: 'resolved', attempts: 1 });
      // Once resolved, less than 55 s is sufficient to commit without another IO.
      runtime.retireStaleJobs(NOW + 54_999);
      runtime.applySocietyJob(job.jobId, NOW + 54_999);
      expect(sql.exec<{ status: string }>('SELECT status FROM cognition_jobs').one().status).toBe('applied');
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) n FROM quota_reservations WHERE usage_confirmed=1').one().n).toBe(1);
    });
  });

  it.each([false, true])('refuses 54,999 ms without any first claim for a %s marked job', async marked => {
    await isolated(`too-late-${marked}`, async (runtime, sql) => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const { job } = setup(sql, 54_999, marked), before = immutable(sql);
      await runtime.processSocietyJob(job.jobId, NOW);
      expect(sql.exec('SELECT status,attempts,error_code FROM cognition_jobs').one())
        .toEqual({ status: 'dead', attempts: 0, error_code: 'provider_window_expired' });
      expect(immutable(sql)).toEqual(before);
    });
  });

  it.each([false, true])('preserves a prior charged rejection without another claim or backoff for an unusable N94-style retry (%s marked)', async marked => {
    await isolated(`n94-${marked}`, async (runtime, sql) => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const { job, created } = setup(sql, 20_707, marked, true);
      const quota = new SqlQuotaLedger(sql, parseRuntimeConfig(env));
      const id = `${job.jobId}:groq:${marked ? 'openai%2Fgpt-oss-20b:' : ''}1`;
      expect(quota.reserve(id, 'groq', { requests: 1, inputTokens: 5925, outputTokens: 1024, neurons: 0 }, created, job.jobId,
        ...(marked ? ['openai/gpt-oss-20b'] : [])).allowed).toBe(true);
      quota.markDispatched(id, created); quota.settle(id, { inputTokens: 5893, outputTokens: 269 }, created + 941);
      // Force the actual preflight through Groq's awaited token counter.
      sql.exec("INSERT OR REPLACE INTO provider_breakers VALUES('workers-ai',?,'rate-limited',1,?)", NOW + 1_000_000, NOW);
      runtime.runtimeEnv.GROQ_API_KEY = 'synthetic-never-dispatched';
      const counted = vi.spyOn(estimator, 'estimateGroqInputTokens').mockImplementation(async () => {
        clock.mockReturnValue(NOW + 2); return 5946;
      });
      const before = immutable(sql);
      await runtime.processSocietyJob(job.jobId, NOW);
      expect(counted).toHaveBeenCalled();
      expect(sql.exec('SELECT status,attempts,error_code FROM cognition_jobs').one())
        .toEqual({ status: 'dead', attempts: 1,
          // The legacy route has only the previously charged 20B destination;
          // the marked route has a ready unused destination but too little TTL.
          error_code: marked ? 'provider_window_expired' : 'pacing_context_expired' });
      expect(immutable(sql)).toEqual(before);
      expect(sql.exec<{ n: number }>("SELECT COUNT(*) n FROM runtime_events WHERE type='society.turn.retry'").one().n).toBe(0);
    });
  });

  it('checks time lost in tokenization before a retry claim, and does not ignore a concurrent pause', async () => {
    for (const pause of [false, true]) await isolated(`token-delay-${pause}`, async (runtime, sql) => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const { job } = setup(sql, 100_000, true, true);
      sql.exec("INSERT OR REPLACE INTO provider_breakers VALUES('workers-ai',?,'rate-limited',1,?)", NOW + 1_000_000, NOW);
      runtime.runtimeEnv.GROQ_API_KEY = 'synthetic-never-dispatched';
      vi.spyOn(estimator, 'estimateGroqInputTokens').mockImplementation(async () => {
        clock.mockReturnValue(NOW + 45_001);
        if (pause) sql.exec("UPDATE runtime_meta SET mode='paused',control_revision=1");
        return 1000;
      });
      const before = immutable(sql);
      await runtime.processSocietyJob(job.jobId, NOW);
      expect(sql.exec('SELECT status,attempts FROM cognition_jobs').one())
        .toEqual({ status: pause ? 'deferred' : 'dead', attempts: 1 });
      const after = immutable(sql);
      expect(after.society).toEqual(before.society); expect(after.world).toEqual(before.world); expect(after.quota).toEqual(before.quota);
      vi.restoreAllMocks();
    });
  });

  it.each([false, true])('rejects a fresh context lost during counting and preserves a future cadence (later wait %s)', async laterWait => {
    await isolated(`fresh-token-delay-${laterWait}`, async (runtime, sql) => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
      let society = createSocietyState(world, NOW - 2_000_000);
      for (const id of Object.keys(society.minds) as Array<keyof typeof society.minds>) society = markSocietyAttempt(society, id, NOW - 1_900_000);
      sql.exec('UPDATE society_state SET revision=?,state_json=?', society.revision, JSON.stringify(society));
      sql.exec("UPDATE runtime_meta SET mode='running',next_cognition_at_ms=?", NOW);
      sql.exec("INSERT OR REPLACE INTO provider_breakers VALUES('workers-ai',?,'rate-limited',1,?)", NOW + 2_000_000, NOW);
      runtime.runtimeEnv.GROQ_API_KEY = 'synthetic-never-dispatched';
      const completedAt = NOW + TTL - 54_999;
      vi.spyOn(estimator, 'estimateGroqInputTokens').mockImplementation(async () => {
        clock.mockReturnValue(completedAt);
        if (laterWait) sql.exec('UPDATE runtime_meta SET next_cognition_at_ms=?', completedAt + 2 * COGNITION_CADENCE_MS);
        return 1000;
      });
      const before = immutable(sql);
      expect(await runtime.prepareNextSocietyJob(NOW)).toBeUndefined();
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) n FROM cognition_jobs').one().n).toBe(0);
      expect(immutable(sql)).toEqual(before);
      expect(sql.exec<{ next_cognition_at_ms: number }>('SELECT next_cognition_at_ms FROM runtime_meta').one().next_cognition_at_ms)
        .toBe(completedAt + (laterWait ? 2 : 1) * COGNITION_CADENCE_MS);
    });
  });

  it.each([10_000, 3_600_000])('includes the cadence floor and discards the retired provider wait (%i ms)', async wait => {
    await isolated(`cadence-floor-${wait}`, async (runtime, sql) => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const { job } = setup(sql, COGNITION_CADENCE_MS + 54_999, false, true);
      // Provider+55s fits, but the real cadence+55s misses by one millisecond.
      sql.exec("INSERT OR REPLACE INTO provider_breakers VALUES('workers-ai',?,'rate-limited',1,?)", NOW + wait, NOW);
      const before = immutable(sql);
      await runtime.processSocietyJob(job.jobId, NOW);
      expect(sql.exec('SELECT status,attempts FROM cognition_jobs').one()).toEqual({ status: 'dead', attempts: 1 });
      expect(immutable(sql)).toEqual(before);
      expect(sql.exec<{ next_cognition_at_ms: number }>('SELECT next_cognition_at_ms FROM runtime_meta').one().next_cognition_at_ms)
        .toBe(NOW + COGNITION_CADENCE_MS);
      // A retired N context leaves a different resident available next cadence.
      expect(await runtime.prepareNextSocietyJob(NOW)).toBeDefined();
      expect(sql.exec<{ actor: string }>('SELECT actor FROM cognition_contexts ORDER BY sequence DESC LIMIT 1').one().actor).not.toBe('N');
    });
  });

  it.each([false, true])('releases an impossible global delay without retiring a different usable job (reverse order %s)', async reverse => {
    await isolated(`old-impossible-delay-${reverse}`, (runtime, sql) => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const { turn, job, society } = setup(sql, 300_000, true, true);
      sql.exec('UPDATE cognition_jobs SET due_at_ms=?', NOW + 3_600_000);
      sql.exec('UPDATE runtime_meta SET next_cognition_at_ms=?', NOW + 3_600_000);
      const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
      const usable = prepareSocietyJob({ state: society, world, actor: 'D', nowMs: NOW - 300_000, sequence: 95,
        generation: 0, worldRevision: 0, habitatId: env.HABITAT_ID });
      sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,0)',
        usable.turn.sequence, usable.job.jobId, 'D', JSON.stringify(usable.turn));
      sql.exec("INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts) VALUES(?,?,'pending',0,?,?,0)",
        usable.job.jobId, JSON.stringify(usable.job), NOW - 300_000, NOW);
      if (reverse) {
        // Reverse row insertion independently of resident IDs and sequence.
        sql.exec('DELETE FROM cognition_jobs WHERE job_id=?', job.jobId);
        sql.exec("INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts) VALUES(?,?,'deferred',0,?,?,1)",
          job.jobId, JSON.stringify(job), turn.preparedAtMs, NOW + 3_600_000);
      }
      const otherBefore = sql.exec('SELECT j.*,c.prepared_json FROM cognition_jobs j JOIN cognition_contexts c USING(job_id) WHERE j.job_id=?', usable.job.jobId).one();
      const before = immutable(sql);
      runtime.retireStaleJobs(NOW);
      expect(sql.exec('SELECT status,attempts FROM cognition_jobs WHERE job_id=?', job.jobId).one()).toEqual({ status: 'dead', attempts: 1 });
      expect(sql.exec('SELECT j.*,c.prepared_json FROM cognition_jobs j JOIN cognition_contexts c USING(job_id) WHERE j.job_id=?', usable.job.jobId).one())
        .toEqual(otherBefore);
      expect(sql.exec<{ next_cognition_at_ms: number }>('SELECT next_cognition_at_ms FROM runtime_meta').one().next_cognition_at_ms)
        .toBe(NOW + COGNITION_CADENCE_MS);
      expect(immutable(sql)).toEqual(before);
    });
  });

  it('retains actual sent charges and the first attempt when its deferred result has no usable future wake', async () => {
    await isolated('charged-defer', async (runtime, sql) => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const { job } = setup(sql, 100_000, true);
      const fake = vi.fn().mockImplementation(async () => {
        clock.mockReturnValue(NOW + 40_000);
        return { response: JSON.stringify({ record: { kind: 'draft', refs: [{ $ref: 'world:100:1' }] } }),
          usage: { prompt_tokens: 500, completion_tokens: 30 } };
      });
      runtime.runtimeEnv.AI = { run: fake } as unknown as Ai;
      await runtime.processSocietyJob(job.jobId, NOW);
      expect(fake).toHaveBeenCalledTimes(1);
      expect(sql.exec('SELECT status,attempts,error_code FROM cognition_jobs').one())
        .toEqual({ status: 'dead', attempts: 1, error_code: 'provider_window_expired' });
      expect(sql.exec('SELECT usage_confirmed,actual_input_tokens,actual_output_tokens FROM quota_reservations').one())
        .toEqual({ usage_confirmed: 1, actual_input_tokens: 500, actual_output_tokens: 30 });
      expect(sql.exec<{ n: number }>("SELECT COUNT(*) n FROM provider_attempts WHERE provider='workers-ai'").one().n).toBe(1);
      // Missing-key decisions for the two Groq destinations are recorded too,
      // but they never create reservations or provider IO.
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) n FROM quota_reservations').one().n).toBe(1);
      const saved = immutable(sql);
      clock.mockReturnValue(NOW + COGNITION_CADENCE_MS);
      runtime.retireStaleJobs(Date.now()); await runtime.processSocietyJob(job.jobId, Date.now());
      expect(immutable(sql)).toEqual(saved);
    });
  });

  it('early-retires only pending/deferred work, preserves running/resolved until expiry, and expires exactly on time', async () => {
    await isolated('retirement-states', (runtime, sql) => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const { job, turn } = setup(sql, 54_999, true);
      const before = immutable(sql);
      for (const status of ['running', 'resolved']) {
        sql.exec('UPDATE cognition_jobs SET status=?,lease_expires_at_ms=?', status, NOW + 120_000);
        runtime.retireStaleJobs(NOW);
        expect(sql.exec<{ status: string }>('SELECT status FROM cognition_jobs').one().status).toBe(status);
      }
      sql.exec("UPDATE cognition_jobs SET status='deferred',due_at_ms=?", NOW);
      runtime.retireStaleJobs(NOW);
      expect(sql.exec('SELECT status,attempts FROM cognition_jobs').one()).toEqual({ status: 'dead', attempts: 0 });
      expect(immutable(sql)).toEqual(before);
      // Separate saved context for the exact-expiry resolved boundary.
      sql.exec('UPDATE cognition_contexts SET prepared_json=?', JSON.stringify(turn));
      sql.exec("UPDATE cognition_jobs SET status='resolved' WHERE job_id=?", job.jobId);
      runtime.retireStaleJobs(turn.expiresAtMs);
      expect(sql.exec<{ error_code: string }>('SELECT error_code FROM cognition_jobs').one().error_code).toBe('turn_expired');
    });
  });
});
