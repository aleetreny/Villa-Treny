import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import type { SocietyState } from '../../../src/lib/habitat/society/index';
import { deserializeWorldState } from '../src/domain';
import { prepareSocietyJob } from '../src/society-scheduler';

type Runtime = {
  runtimeEnv: Env;
  processSocietyJob(id: string, nowMs: number): Promise<void>;
  applySocietyJob(id: string, nowMs: number): void;
};

it('preserves rejection feedback through a quota wait without dispatch, debit or another mind attempt', async () => {
  const stub = env.HABITAT_WORLD.getByName('society-retry-after-pacing');
  await stub.getObserver();
  await runInDurableObject(stub, async (instance, storage) => {
    const sql = storage.storage.sql, runtime = instance as unknown as Runtime;
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const originalEnv = runtime.runtimeEnv;
    const response = {
      message: { to: 'B', text: 'I will check the shared stores before spending.', close: true },
      project: { mode: 'replace', goal: 'Check the shared stores.', why: 'Understand what is available.',
        visibility: 'private', steps: [] },
      reflection: { text: 'I should check the stores.', refs: ['world:100:1'] },
    };
    const fake = vi.fn().mockResolvedValueOnce({ response: JSON.stringify({ ...response,
      reflection: { text: 'An unsupported claim.', refs: ['invented-reference'] } }),
    usage: { prompt_tokens: 500, completion_tokens: 30 } })
      .mockResolvedValue({ response: JSON.stringify(response), usage: { prompt_tokens: 530, completion_tokens: 30 } });
    try {
      runtime.runtimeEnv = { ...originalEnv, AI: { run: fake } as unknown as Ai, GROQ_API_KEY: '' };
      const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
      const state = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState;
      const prepared = prepareSocietyJob({ state, world, actor: 'A', nowMs: start, sequence: 1,
        generation: 0, worldRevision: 0, habitatId: env.HABITAT_ID, protocolVersion: 4 });
      const { job, turn } = prepared;
      sql.exec("UPDATE runtime_meta SET mode='running',next_watch_at_ms=?,next_cognition_at_ms=?", start + 21_600_000, start);
      sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,?)',
        turn.sequence, job.jobId, turn.actor, JSON.stringify(turn), turn.generation);
      sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts)
        VALUES(?,?,'pending',0,?,?,0)`, job.jobId, JSON.stringify(job), start, start);

      await runtime.processSocietyJob(job.jobId, start);
      const rejected = sql.exec<{ error_code: string }>('SELECT error_code FROM cognition_jobs').one().error_code;
      expect(rejected).toBe('invalid_society:unavailable_capability_choice');
      expect(fake).toHaveBeenCalledTimes(1);
      const availableAt = start + 360_000;
      sql.exec("UPDATE provider_breakers SET open_until_ms=?,reason='rate-limited' WHERE provider='workers-ai'", availableAt);
      const quota = sql.exec('SELECT * FROM quota_reservations').toArray();
      const minds = sql.exec('SELECT * FROM society_state').toArray();
      const worldBefore = sql.exec('SELECT * FROM world_state').toArray();
      clock.mockReturnValue(start + 180_000);
      await runtime.processSocietyJob(job.jobId, start + 180_000);
      expect(sql.exec('SELECT status,attempts,error_code,due_at_ms FROM cognition_jobs').one())
        .toEqual({ status: 'deferred', attempts: 1, error_code: rejected, due_at_ms: availableAt });
      expect(fake).toHaveBeenCalledTimes(1);
      expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual(quota);
      expect(sql.exec('SELECT * FROM society_state').toArray()).toEqual(minds);
      expect(sql.exec('SELECT * FROM world_state').toArray()).toEqual(worldBefore);

      clock.mockReturnValue(availableAt + 1);
      await runtime.processSocietyJob(job.jobId, availableAt + 1);
      expect(fake).toHaveBeenCalledTimes(2);
      const sent = fake.mock.calls as unknown as Array<[string, { messages: Array<{ content: string }> }]>;
      expect(sent[1]![1].messages[1]!.content).toBe(`${job.prompt.user} Previous attempt was refused: unavailable_capability_choice. Correct that issue using only the supplied state and exact IDs.`);
      expect(sent[1]![1].messages[0]!.content).toBe(job.prompt.system);
      expect(sql.exec('SELECT status,attempts FROM cognition_jobs').one()).toEqual({ status: 'resolved', attempts: 2 });
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) n FROM quota_reservations WHERE usage_confirmed=1').one().n).toBe(2);
      expect(JSON.parse(sql.exec<{ detail_json: string }>("SELECT detail_json FROM runtime_events WHERE type='society.turn.retry'").one().detail_json))
        .toMatchObject({ attempt: 2, reason: rejected });
      runtime.applySocietyJob(job.jobId, availableAt + 1);
      expect(sql.exec<{ status: string }>('SELECT status FROM cognition_jobs').one().status).toBe('applied');
    } finally { runtime.runtimeEnv = originalEnv; clock.mockRestore(); }
  });
});
