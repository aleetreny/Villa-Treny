import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSocietyState, type SocietyState } from '../../../src/lib/habitat/society/index';
import { applyAttentionCapabilityChoice } from '../../../src/lib/habitat/society/attention-choice';
import { createGenesisWorld, deserializeWorldState, serializeWorldState } from '../src/domain';
import { prepareSocietyJob } from '../src/society-scheduler';
import { applyIssuedSocietyProtocol } from '../src/society-issued-protocol';
import { RESIDENT_BY_ID, type ResidentId } from '../../../src/lib/habitat/residents';

type Internal = { runtimeEnv: Env; saveSociety(state: SocietyState, atMs: number): void; applySocietyJob(id: string, atMs: number): void };
const project = { mode: 'replace', goal: 'Decide for myself.', why: 'I want to choose independently.', visibility: 'private', steps: [] };
const build = (state: SocietyState, world: ReturnType<typeof createGenesisWorld>, nowMs: number, actor: ResidentId = 'A') =>
  prepareSocietyJob({ state, world, nowMs, actor, protocolVersion: 8, sequence: state.minds[actor].lastAppliedSequence + 1,
    generation: 0, worldRevision: 0, habitatId: env.HABITAT_ID });

beforeEach(() => vi.stubGlobal('fetch', () => { throw new Error('Attention commit tests forbid external inference and HTTP'); }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function insertResolved(sql: SqlStorage, prepared: ReturnType<typeof build>, output: unknown, atMs: number): void {
  sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,?)',
    prepared.turn.sequence, prepared.job.jobId, prepared.turn.actor, JSON.stringify(prepared.turn), prepared.turn.generation);
  sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts,output_json,provider)
    VALUES(?,?,'resolved',0,?,?,1,?,'offline-fixture')`, prepared.job.jobId, JSON.stringify(prepared.job), atMs, atMs, JSON.stringify(output));
}

it('rechecks the exact issued schema and hash before applying a resolved P8 output, retaining idempotence', () => {
  const world = createGenesisWorld(), state = createSocietyState(world, 1000), { turn, job } = build(state, world, 2000);
  const raw = { attention: { kind: 'private', conversationId: null }, content: { project } };
  const result = applyIssuedSocietyProtocol(job, state, world, turn, raw, { nowMs: 2001, generation: 0 });
  expect(result.ok, result.code).toBe(true);
  const narrow = structuredClone(job);
  narrow.outputContract.jsonSchema = { type: 'object', additionalProperties: false, properties: {}, maxProperties: 0 };
  narrow.outputContract.schemaHash = `sha256:${createHash('sha256').update(JSON.stringify(narrow.outputContract.jsonSchema)).digest('hex')}`;
  expect(applyIssuedSocietyProtocol(narrow, state, world, turn, raw, { nowMs: 2001, generation: 0 }))
    .toMatchObject({ ok: false, code: 'invalid_attention_choice', state, world });
  expect(applyIssuedSocietyProtocol({ ...job, outputContract: { ...job.outputContract, schemaHash: 'sha256:wrong-digest' } },
    state, world, turn, raw, { nowMs: 2001, generation: 0 }).code).toBe('invalid_job');
  expect(applyIssuedSocietyProtocol(narrow, result.state, result.world, turn, raw, { nowMs: 2002, generation: 0 }).code).toBe('already_applied');
});

it.each([
  ['issued-schema', 'invalid_attention_choice'],
  ['schema-digest', 'invalid_job'],
] as const)('refuses a restored resolved P8 output with a mismatched %s before any durable effect', async (fault, expectedCode) => {
  const now = Date.now(), world = createGenesisWorld(), state = createSocietyState(world, now);
  const prepared = build(state, world, now + 10);
  const output = { attention: { kind: 'private', conversationId: null }, content: { project } };
  // This result is valid under today's grammar. A restored job must still obey
  // the narrower contract stored when it was issued, without another request.
  expect(applyAttentionCapabilityChoice(state, world, prepared.turn, output, { nowMs: now + 11, generation: 0 }).ok).toBe(true);
  if (fault === 'issued-schema') {
    prepared.job.outputContract.jsonSchema = { type: 'object', additionalProperties: false, properties: {}, maxProperties: 0 };
    prepared.job.outputContract.schemaHash = `sha256:${createHash('sha256').update(JSON.stringify(prepared.job.outputContract.jsonSchema)).digest('hex')}`;
  } else prepared.job.outputContract.schemaHash = `sha256:${'0'.repeat(64)}`;
  const stub = env.HABITAT_WORLD.getByName(`attention-commit-restored-${fault}`); await stub.getObserver();
  await runInDurableObject(stub, (instance, storage) => {
    const sql = storage.storage.sql, internal = instance as unknown as Internal;
    const originalEnv = internal.runtimeEnv, ai = vi.fn(() => { throw new Error('A resolved job cannot call inference'); });
    internal.runtimeEnv = { ...originalEnv, AI: { run: ai } as unknown as Ai, GROQ_API_KEY: '' };
    try {
      sql.exec("UPDATE runtime_meta SET mode='running',control_revision=0,world_revision=0,sim_day=?,sim_minute=?", world.day, (world.watch - 1) * 360);
      sql.exec('UPDATE world_state SET world_revision=0,state_json=?', serializeWorldState(world));
      internal.saveSociety(state, now);
      const snapshot = () => ({
        society: sql.exec('SELECT * FROM society_state').toArray(), world: sql.exec('SELECT * FROM world_state').toArray(),
        clocks: sql.exec('SELECT next_watch_at_ms,next_cognition_at_ms,control_revision,world_revision,sim_day,sim_minute FROM runtime_meta').one(),
        archive: sql.exec('SELECT * FROM happenings').toArray(), people: sql.exec('SELECT * FROM happening_people').toArray(),
        economy: sql.exec('SELECT * FROM economic_events').toArray(), events: sql.exec('SELECT * FROM society_events').toArray(),
        quotas: sql.exec('SELECT * FROM quota_reservations').toArray(),
      });
      const before = snapshot();
      insertResolved(sql, prepared, output, now + 10);
      internal.applySocietyJob(prepared.job.jobId, now + 11);
      expect(sql.exec('SELECT status,error_code,attempts,output_json FROM cognition_jobs WHERE job_id=?', prepared.job.jobId).one())
        .toEqual({ status: 'dead', error_code: expectedCode, attempts: 1, output_json: JSON.stringify(output) });
      expect(snapshot()).toEqual(before);
      const storedJob = JSON.parse(sql.exec<{ envelope_json: string }>('SELECT envelope_json FROM cognition_jobs WHERE job_id=?', prepared.job.jobId).one().envelope_json);
      const storedTurn = JSON.parse(sql.exec<{ prepared_json: string }>('SELECT prepared_json FROM cognition_contexts WHERE job_id=?', prepared.job.jobId).one().prepared_json);
      // Terminal compaction may omit duplicated prompt prose; the issued schema,
      // its digest, the exact output, and all prepared capabilities stay intact.
      expect(storedJob).toEqual({ ...prepared.job, prompt: storedJob.prompt });
      expect(storedTurn).toEqual({ ...prepared.turn, prompt: storedTurn.prompt });
      const terminal = sql.exec('SELECT * FROM cognition_jobs WHERE job_id=?', prepared.job.jobId).one();
      const runtimeEvents = sql.exec('SELECT * FROM runtime_events').toArray();
      internal.applySocietyJob(prepared.job.jobId, now + 12);
      expect(sql.exec('SELECT * FROM cognition_jobs WHERE job_id=?', prepared.job.jobId).one()).toEqual(terminal);
      expect(sql.exec('SELECT * FROM runtime_events').toArray()).toEqual(runtimeEvents);
      expect(snapshot()).toEqual(before); expect(ai).not.toHaveBeenCalled();
    } finally { internal.runtimeEnv = originalEnv; }
  });
});

it('retires an already applied P8 restored as resolved without publishing or refreshing physical coverage again', async () => {
  const now = Date.now(), world = createGenesisWorld(), state = createSocietyState(world, now);
  const prepared = build(state, world, now + 10);
  const output = { attention: { kind: 'private', conversationId: null }, content: { project } };
  const applied = applyAttentionCapabilityChoice(state, world, prepared.turn, output, { nowMs: now + 11, generation: 0 });
  expect(applied).toMatchObject({ ok: true, code: 'applied' });
  expect(applied.state.minds.A.lastAppliedSequence).toBe(prepared.turn.sequence);
  // A completed sequence takes precedence over schema validation on replay.
  prepared.job.outputContract.schemaHash = `sha256:${'0'.repeat(64)}`;
  const stub = env.HABITAT_WORLD.getByName('attention-commit-restored-already-applied'); await stub.getObserver();
  await runInDurableObject(stub, (instance, storage) => {
    const sql = storage.storage.sql, internal = instance as unknown as Internal;
    const originalEnv = internal.runtimeEnv, ai = vi.fn(() => { throw new Error('A resolved job cannot call inference'); });
    internal.runtimeEnv = { ...originalEnv, AI: { run: ai } as unknown as Ai, GROQ_API_KEY: '' };
    try {
      sql.exec("UPDATE runtime_meta SET mode='running',control_revision=0,world_revision=7,sim_day=?,sim_minute=?", world.day, (world.watch - 1) * 360);
      sql.exec('UPDATE world_state SET world_revision=7,state_json=?', serializeWorldState(applied.world));
      internal.saveSociety(applied.state, now + 11);
      insertResolved(sql, prepared, output, now + 10);
      const snapshot = () => ({
        society: sql.exec('SELECT * FROM society_state').toArray(), world: sql.exec('SELECT * FROM world_state').toArray(),
        runtime: sql.exec('SELECT * FROM runtime_meta').toArray(), events: sql.exec('SELECT * FROM runtime_events').toArray(),
        archive: sql.exec('SELECT * FROM happenings').toArray(), people: sql.exec('SELECT * FROM happening_people').toArray(),
        economy: sql.exec('SELECT * FROM economic_events').toArray(), social: sql.exec('SELECT * FROM society_events').toArray(),
        quotas: sql.exec('SELECT * FROM quota_reservations').toArray(),
      });
      const before = snapshot();
      internal.applySocietyJob(prepared.job.jobId, now + 12);
      expect(sql.exec('SELECT status,error_code,attempts,output_json FROM cognition_jobs WHERE job_id=?', prepared.job.jobId).one())
        .toEqual({ status: 'applied', error_code: null, attempts: 1, output_json: JSON.stringify(output) });
      expect(snapshot()).toEqual(before);
      internal.applySocietyJob(prepared.job.jobId, now + 13);
      expect(snapshot()).toEqual(before); expect(ai).not.toHaveBeenCalled();
    } finally { internal.runtimeEnv = originalEnv; }
  });
});

it('archives an actual unilateral departure once without fabricating a message or changing the physical clock', async () => {
  const now = Date.now(), world = createGenesisWorld(), state = createSocietyState(world, now);
  const first = build(state, world, now + 10);
  const opened = applyAttentionCapabilityChoice(state, world, first.turn, { attention: { kind: 'contact' }, content: {
    project, message: { to: 'B', text: 'I want to consider this with you.' } } }, { nowMs: now + 11, generation: 0 });
  expect(opened.ok).toBe(true);
  const channel = opened.state.conversations[0]!;
  const prepared = build(opened.state, opened.world, now + 20);
  const departureText = `${RESIDENT_BY_ID.A.name} left the conversation with ${RESIDENT_BY_ID.B.name}.`;
  const stub = env.HABITAT_WORLD.getByName('attention-commit-silent-leave'); await stub.getObserver();
  await runInDurableObject(stub, (instance, storage) => {
    const sql = storage.storage.sql, internal = instance as unknown as Internal;
    const originalEnv = internal.runtimeEnv, ai = vi.fn(() => { throw new Error('A resolved job cannot call inference'); });
    internal.runtimeEnv = { ...originalEnv, AI: { run: ai } as unknown as Ai, GROQ_API_KEY: '' };
    try {
      sql.exec("UPDATE runtime_meta SET mode='running',control_revision=0,world_revision=0,sim_day=?,sim_minute=?", world.day, (world.watch - 1) * 360);
      sql.exec('UPDATE world_state SET world_revision=0,state_json=?', serializeWorldState(world));
      internal.saveSociety(opened.state, now + 11);
      const clocks = sql.exec('SELECT next_watch_at_ms,next_cognition_at_ms,control_revision,sim_day,sim_minute FROM runtime_meta').one();
      const physical = sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json;
      const quota = sql.exec('SELECT * FROM quota_reservations').toArray();
      const economy = sql.exec('SELECT * FROM economic_events').toArray();
      const previousArchive = sql.exec('SELECT * FROM happenings').toArray();
      const previousPeople = sql.exec('SELECT * FROM happening_people').toArray();
      const output = { attention: { kind: 'leave', conversationId: channel.id }, content: {} };
      insertResolved(sql, prepared, output, now + 20);
      internal.applySocietyJob(prepared.job.jobId, now + 21);
      expect(sql.exec('SELECT status FROM cognition_jobs WHERE job_id=?', prepared.job.jobId).one().status).toBe('applied');
      const after = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState;
      expect(after.conversations[0]!.turns).toEqual(channel.turns);
      expect(after.conversations[0]!.status).toBe('closed');
      const event = JSON.parse(sql.exec<{ event_json: string }>('SELECT event_json FROM society_events WHERE job_id=?', prepared.job.jobId).one().event_json);
      expect(event.turns).toEqual([]); expect(event.departures).toEqual([{ conversationId: channel.id, actor: 'A' }]);
      const archive = sql.exec('SELECT * FROM happenings').toArray();
      const departureId = `${prepared.job.jobId}:left:${channel.id}`;
      expect(archive.filter(entry => entry.happening_id !== departureId)).toEqual(previousArchive);
      expect(sql.exec('SELECT * FROM happening_people WHERE happening_id<>?', departureId).toArray()).toEqual(previousPeople);
      expect(archive.filter(entry => entry.happening_id === departureId)).toEqual([expect.objectContaining({
        world_revision: 1, day: world.day, watch: world.watch, minute: (world.watch - 1) * 360,
        room_id: world.bodies.A.room, who_json: JSON.stringify(channel.participants), text: departureText, kind: 'meeting', committed_at_ms: now + 21,
      })]);
      expect(sql.exec('SELECT resident_id FROM happening_people WHERE happening_id=? ORDER BY resident_id', departureId).toArray())
        .toEqual([{ resident_id: 'A' }, { resident_id: 'B' }]);
      expect(sql.exec('SELECT next_watch_at_ms,next_cognition_at_ms,control_revision,sim_day,sim_minute FROM runtime_meta').one()).toEqual(clocks);
      const physicalAfter = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
      const expectedPhysical = deserializeWorldState(physical);
      expectedPhysical.bodies.A.thoughtOn = world.day;
      expectedPhysical.bodies.A.lastThoughtWatch = world.day * 4 + world.watch - 1;
      expectedPhysical.bodies.A.lastAttemptWatch = expectedPhysical.bodies.A.lastThoughtWatch;
      expect(physicalAfter).toEqual(expectedPhysical);
      expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual(quota);
      expect(sql.exec('SELECT * FROM economic_events').toArray()).toEqual(economy);
      const committed = {
        society: sql.exec('SELECT * FROM society_state').toArray(), world: sql.exec('SELECT * FROM world_state').toArray(),
        events: sql.exec('SELECT * FROM society_events').toArray(), people: sql.exec('SELECT * FROM happening_people').toArray(),
        runtime: sql.exec('SELECT * FROM runtime_meta').toArray(),
      };
      internal.applySocietyJob(prepared.job.jobId, now + 22);
      expect(sql.exec('SELECT * FROM happenings').toArray()).toEqual(archive);
      expect({
        society: sql.exec('SELECT * FROM society_state').toArray(), world: sql.exec('SELECT * FROM world_state').toArray(),
        events: sql.exec('SELECT * FROM society_events').toArray(), people: sql.exec('SELECT * FROM happening_people').toArray(),
        runtime: sql.exec('SELECT * FROM runtime_meta').toArray(),
      }).toEqual(committed);
      expect(ai).not.toHaveBeenCalled();
    } finally { internal.runtimeEnv = originalEnv; }
  });
  const archive = await stub.getArchive({ day: world.day, person: 'B' });
  const departure = archive.entries.filter(entry => entry.text === departureText);
  expect(departure).toHaveLength(1); expect(departure[0]).not.toHaveProperty('speech');
});
