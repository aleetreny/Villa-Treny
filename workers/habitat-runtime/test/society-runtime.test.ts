import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { RESIDENTS } from '../../../src/lib/habitat/residents';
import { createSocietyState, markSocietyAttempt, type SocietyState } from '../../../src/lib/habitat/society/index';
import { advanceWorldWatch, createGenesisWorld, deserializeWorldState, serializeWorldState } from '../src/domain';
import { COGNITION_CADENCE_MS, nextSocietyActor, prepareSocietyJob } from '../src/society-scheduler';

type Internal = {
  applySocietyJob(id: string, now: number): void;
  commitPhysicalWatch(now: number): void;
  retireStaleJobs(now: number): void;
  migrateToV7(): void;
};
const reflect = { message: { to: 'B', text: 'I am watching the shared stores before committing cells.', close: true }, project: { mode: 'replace', goal: 'Watch the shared stores before committing cells.', why: 'I want to understand their condition first.', visibility: 'private', steps: [] }, reflection: { text: 'I will watch the shared stores before committing cells.', refs: ['world:100:1'] } };

describe('independent individual cognition', () => {
  it('migrates an inhabited v6 database without rewriting the world, accounts, history or physical schedule', async () => {
    const stub = env.HABITAT_WORLD.getByName('society-migrate-v6');
    await stub.getObserver();
    await runInDurableObject(stub, (instance, storage) => {
      const sql = storage.storage.sql;
      // Remove the later indexes and v7 additions to exercise the actual migration against
      // the preceding schema. This isolated world has already lived 28 watches.
      sql.exec(`DROP TABLE society_state; DROP TABLE cognition_contexts; DROP TABLE physical_runs; DROP TABLE society_events;
        DROP INDEX provider_attempts_recent_idx; DROP INDEX quota_day_provider_idx; DROP INDEX quota_provider_activity_idx;
        DROP INDEX quota_provider_created_idx; ALTER TABLE quota_reservations DROP COLUMN usage_confirmed;
        ALTER TABLE runtime_meta DROP COLUMN next_cognition_at_ms; ALTER TABLE runtime_meta DROP COLUMN last_cognition_error_code;
        DELETE FROM _sql_schema_migrations WHERE version>=7;`);
      const world = createGenesisWorld();
      for (let i = 0; i < 28; i++) advanceWorldWatch(world);
      const body = serializeWorldState(world), now = Date.now(), due = now + 12_345_678;
      sql.exec('UPDATE world_state SET world_revision=29,state_json=?,updated_at_ms=?', body, now - 1000);
      sql.exec("UPDATE runtime_meta SET mode='running',world_revision=29,control_revision=3,sim_day=?,sim_minute=?,next_watch_at_ms=?,next_alarm_at_ms=?",
        world.day, (world.watch - 1) * 360, due, due);
      sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts,output_json)
        VALUES('old-resolved','{}','resolved',0,1,1,1,'{"verb":"inspect"}')`);
      sql.exec(`INSERT INTO watch_runs(run_id,cause_world_revision,sim_day,sim_watch,control_revision,subject_id,cognition_job_id,phase,due_at_ms)
        VALUES('old-claim',29,107,1,3,'A','old-resolved','claimed',1)`);
      sql.exec(`INSERT INTO quota_reservations(reservation_id,provider,day,state,max_requests,max_input_tokens,max_output_tokens,max_neurons,
        actual_requests,actual_input_tokens,actual_output_tokens,actual_neurons,created_at_ms,dispatched_at_ms,settled_at_ms)
        VALUES('old-usage','workers-ai','2026-09-08','settled',1,100,20,3,1,40,10,1,1,1,2)`);
      sql.exec("INSERT INTO provider_breakers VALUES('workers-ai',9999999999999,'invalid-response',1,1),('groq',9999999999999,'authentication',1,1)");
      const before = sql.exec('SELECT * FROM world_state').one();
      const history = sql.exec('SELECT * FROM happenings ORDER BY sequence').toArray();
      const quota = sql.exec('SELECT * FROM quota_reservations').one();
      (instance as unknown as Internal).migrateToV7();
      expect(sql.exec('SELECT * FROM world_state').one()).toEqual(before);
      expect(sql.exec('SELECT * FROM happenings ORDER BY sequence').toArray()).toEqual(history);
      expect(sql.exec('SELECT mode,world_revision,control_revision,next_watch_at_ms,next_alarm_at_ms FROM runtime_meta').one())
        .toEqual({ mode: 'running', world_revision: 29, control_revision: 3, next_watch_at_ms: due, next_alarm_at_ms: due });
      expect(sql.exec('SELECT * FROM quota_reservations').one()).toEqual({ ...quota, usage_confirmed: 0 });
      expect(sql.exec('SELECT status,output_json FROM cognition_jobs').one()).toEqual({ status: 'dead', output_json: '{"verb":"inspect"}' });
      expect(sql.exec<{ phase: string }>('SELECT phase FROM watch_runs').one().phase).toBe('cancelled');
      expect(sql.exec<{ open_until_ms: number }>("SELECT open_until_ms FROM provider_breakers WHERE provider='workers-ai'").one().open_until_ms).toBe(0);
      expect(sql.exec<{ reason: string }>("SELECT reason FROM provider_breakers WHERE provider='groq'").one().reason).toBe('authentication');
      const minds = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState;
      expect(Object.values(minds.minds)).toHaveLength(25);
      expect(Object.values(minds.minds).every(m => m.project === null && m.lastSuccessAtMs === null && m.memories.length === 0)).toBe(true);
      expect(deserializeWorldState(body).axes.size).toBe(600);
    });
    await stub.pause({ commandId: 'society-migration-pause', issuedAtMs: Date.now() });
  });
  it('gives all 25 residents a slot despite repeated provider failures', () => {
    const now = 1_800_000_000_000;
    let state = createSocietyState(createGenesisWorld(), now);
    const seen = new Set();
    for (let i = 0; i < 25; i++) {
      const time = now + i * COGNITION_CADENCE_MS;
      const actor = nextSocietyActor(state, time, i);
      expect(actor).toBeDefined(); seen.add(actor);
      state = markSocietyAttempt(state, actor!, time);
    }
    expect(seen.size).toBe(25);
  });

  it('resumes 25 saved protocol5 reviews despite the default6 producer, exactly once without a physical watch', async () => {
    const stub = env.HABITAT_WORLD.getByName('society-all-residents');
    const resumed = await stub.resume({ commandId: 'society-all-resume', issuedAtMs: Date.now() });
    const before = await stub.getObserver();
    await runInDurableObject(stub, (instance, storage) => {
      const sql = storage.storage.sql, internal = instance as unknown as Internal, nowMs = Date.now();
      const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
      const society = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState;
      // Independent reviews of already-established private purposes may be
      // resumed together. Actual messages correctly invalidate their recipient's
      // stale mind, which is covered by the conversation/pipeline tests.
      for (const { id } of RESIDENTS) society.minds[id].project = {
        id: `project:${society.nextId++}`, goal: reflect.project.goal, why: reflect.project.why,
        visibility: 'private', status: 'active', createdAtMs: nowMs - 1, steps: [],
      };
      sql.exec('UPDATE society_state SET state_json=?', JSON.stringify(society));
      const choice = { turn: [{ choice: 'no_deal' }, { project: reflect.project, reflection: reflect.reflection }] };
      const jobs = RESIDENTS.map(({ id: actor }, i) => prepareSocietyJob({ state: society, world, actor, nowMs,
        sequence: i + 1, generation: resumed.controlRevision, worldRevision: 0, habitatId: env.HABITAT_ID, protocolVersion: 5 }));
      for (const { turn, job } of jobs) {
        sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,?)',
          turn.sequence, job.jobId, turn.actor, JSON.stringify(turn), turn.generation);
        sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts,output_json,provider)
          VALUES(?,?,'resolved',0,?,?,1,?,'fixture')`, job.jobId, JSON.stringify(job), nowMs, nowMs, JSON.stringify(choice));
      }
      for (const { job } of jobs) internal.applySocietyJob(job.jobId, nowMs + 1);
      expect(sql.exec<{ n: number }>("SELECT COUNT(*) n FROM cognition_jobs WHERE status='applied'").one().n).toBe(25);
      for (const saved of sql.exec<{ prepared_json: string; output_json: string }>(
        'SELECT c.prepared_json,j.output_json FROM cognition_contexts c JOIN cognition_jobs j USING(job_id)').toArray()) {
        expect(JSON.parse(saved.prepared_json).prompt).toMatch(/^\[villa-input-omitted:v1;sha256=/);
        expect(JSON.parse(saved.output_json)).toEqual(choice);
      }
      const after = sql.exec('SELECT * FROM world_state').one();
      for (const { job } of jobs) internal.applySocietyJob(job.jobId, nowMs + 2);
      expect(sql.exec('SELECT * FROM world_state').one()).toEqual(after);
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) n FROM society_events').one().n).toBe(25);
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) n FROM physical_runs').one().n).toBe(0);
    });
    const after = await stub.getObserver();
    expect(after.worldRevision).toBe(before.worldRevision + 25);
    expect(after.snapshot).toMatchObject({ day: before.snapshot.day, watch: before.snapshot.watch });
    expect(after.society).toEqual(before.society);
    expect(after.agency.coverage.neverThought).toBe(0);
    expect(await stub.getStatus()).toMatchObject({ cognition: { successfulLastWatch: 25, health: 'healthy' } });
    await stub.pause({ commandId: 'society-all-pause', issuedAtMs: Date.now() });
  });

  it.each(['pause', 'expiry', 'mind'])('rejects a saved answer invalidated by %s', async (reason) => {
    const stub = env.HABITAT_WORLD.getByName(`society-stale-${reason}`);
    const resumed = await stub.resume({ commandId: `society-resume-${reason}`, issuedAtMs: Date.now() });
    await runInDurableObject(stub, (instance, storage) => {
      const sql = storage.storage.sql, nowMs = Date.now();
      const society = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState;
      const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
      const { turn, job } = prepareSocietyJob({ state: society, world, actor: 'A', nowMs, sequence: 1,
        generation: resumed.controlRevision, worldRevision: 0, habitatId: env.HABITAT_ID, protocolVersion: 5 });
      sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,?)',
        1, job.jobId, 'A', JSON.stringify(turn), turn.generation);
      sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts,output_json)
        VALUES(?,?,'resolved',0,?,?,1,?)`, job.jobId, JSON.stringify(job), nowMs, nowMs, JSON.stringify({ turn: [{ choice: 'no_deal' }, reflect] }));
      if (reason === 'pause') sql.exec("UPDATE runtime_meta SET mode='paused',control_revision=control_revision+1");
      if (reason === 'mind') { society.minds.A.revision++; sql.exec('UPDATE society_state SET state_json=?', JSON.stringify(society)); }
      const before = sql.exec('SELECT * FROM world_state').one();
      (instance as unknown as Internal).applySocietyJob(job.jobId, reason === 'expiry' ? turn.expiresAtMs + 1 : nowMs + 1);
      expect(sql.exec('SELECT * FROM world_state').one()).toEqual(before);
      expect(sql.exec<{ status: string }>('SELECT status FROM cognition_jobs').one().status).toBe('dead');
      expect(JSON.parse(sql.exec<{ prepared_json: string }>('SELECT prepared_json FROM cognition_contexts').one().prepared_json).prompt)
        .toMatch(/^\[villa-input-omitted:v1;sha256=/);
    });
    await stub.pause({ commandId: `society-pause-${reason}`, issuedAtMs: Date.now() });
  });

  it('advances and records all physical lives without invoking a model', async () => {
    const stub = env.HABITAT_WORLD.getByName('society-independent-physical');
    await stub.resume({ commandId: 'society-physical-resume', issuedAtMs: Date.now() });
    await runInDurableObject(stub, (instance, storage) => {
      const sql = storage.storage.sql, nowMs = Date.now();
      sql.exec('UPDATE runtime_meta SET next_watch_at_ms=?', nowMs - 1);
      (instance as unknown as Internal).commitPhysicalWatch(nowMs);
      const state = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState;
      expect(Object.values(state.minds).every((m) => m.lastPhysicalWatch === 400 && m.memories.length > 0)).toBe(true);
      const before = sql.exec('SELECT * FROM world_state').one();
      (instance as unknown as Internal).commitPhysicalWatch(nowMs);
      expect(sql.exec('SELECT * FROM world_state').one()).toEqual(before);
      const actions = JSON.parse(sql.exec<{ actions_json: string }>('SELECT actions_json FROM physical_runs').one().actions_json) as unknown[];
      expect(actions).toHaveLength(25);
    });
    expect((await stub.getSnapshot()).snapshot).toMatchObject({ day: 100, watch: 2 });
    expect(await stub.getStatus()).toMatchObject({ cognition: { neverThought: 25, successfulLastWatch: 0 } });
    await stub.pause({ commandId: 'society-physical-pause', issuedAtMs: Date.now() });
  });
});


describe('alarm-to-provider-to-society pipeline (fake binding only)', () => {
  it('dispatches, persists, applies and retries invalid responses independently of physical time', async () => {
    const stub = env.HABITAT_WORLD.getByName('society-fake-provider-pipeline');
    await stub.resume({ commandId: 'fake-provider-resume', issuedAtMs: Date.now() });
    await runInDurableObject(stub, async (instance, storage) => {
      const sql = storage.storage.sql;
      const runtimeEnv = (instance as unknown as { runtimeEnv: Env }).runtimeEnv;
      const originalAI = runtimeEnv.AI;
      const fake = vi.fn().mockResolvedValueOnce({ response: JSON.stringify({
        attention: { kind: 'contact' }, content: { ...reflect,
          reflection: { text: 'A claim without a known reference.', refs: ['invented'] } },
      }), usage: { prompt_tokens: 500, completion_tokens: 30 } })
        .mockResolvedValue({ response: JSON.stringify({ attention: { kind: 'contact' }, content: reflect }), usage: { prompt_tokens: 500, completion_tokens: 30 } });
      const start = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
      try {
        runtimeEnv.AI = { run: fake } as unknown as Ai;
        sql.exec('UPDATE runtime_meta SET next_cognition_at_ms=?', start - 1);
        await instance.alarm();
        expect(fake).toHaveBeenCalledTimes(1);
        expect(sql.exec<{ status: string }>('SELECT status FROM cognition_jobs').one().status).toBe('deferred');
        expect(JSON.parse(sql.exec<{ envelope_json: string }>('SELECT envelope_json FROM cognition_jobs').one().envelope_json)
          .outputContract.version).toBe(8);
        expect(await instance.getStatus()).toMatchObject({ cognition: { health: 'degraded' } });
        expect(sql.exec<{ sim_minute: number }>('SELECT sim_minute FROM runtime_meta').one().sim_minute).toBe(0);
        expect(sql.exec<{ n: number }>("SELECT COUNT(*) n FROM provider_breakers WHERE reason='invalid-response' AND open_until_ms>0").one().n).toBe(0);
        clock.mockReturnValue(start + COGNITION_CADENCE_MS + 1);
        await instance.alarm();
        expect(fake).toHaveBeenCalledTimes(2);
        const retryEvent = JSON.parse(sql.exec<{ detail_json: string }>("SELECT detail_json FROM runtime_events WHERE type='society.turn.retry'").one().detail_json);
        expect(retryEvent).toMatchObject({ attempt: 2, reason: 'invalid_society:invalid_attention_choice' });
        expect(retryEvent.userHash).toMatch(/^[a-f0-9]{64}$/);
        const sent = fake.mock.calls as unknown as Array<[string, { messages: Array<{ content: string }> }]>;
        expect(sent[1]![1].messages[0]!.content).toBe(sent[0]![1].messages[0]!.content);
        expect(sent[1]![1].messages[1]!.content).toContain('Previous attempt was refused: invalid_attention_choice');
        expect(sql.exec<{ status: string }>('SELECT status FROM cognition_jobs').one().status).toBe('applied');
        expect(sql.exec<{ sim_minute: number }>('SELECT sim_minute FROM runtime_meta').one().sim_minute).toBe(0);
        const committed = sql.exec('SELECT * FROM world_state').one();
        await instance.alarm();
        expect(fake).toHaveBeenCalledTimes(2);
        expect(sql.exec('SELECT * FROM world_state').one()).toEqual(committed);
        expect(sql.exec<{ n: number }>('SELECT COUNT(*) n FROM quota_reservations WHERE usage_confirmed=1').one().n).toBe(2);
      } finally { runtimeEnv.AI = originalAI; clock.mockRestore(); }
    });
    await stub.pause({ commandId: 'fake-provider-pause', issuedAtMs: Date.now() });
  });
});
