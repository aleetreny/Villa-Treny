import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { applySocietyTurn, createSocietyState, prepareSocietyTurn, type SocietyState } from '../../../src/lib/habitat/society/index';
import { recordAct } from '../../../src/lib/habitat/society/records-test-fixture';
import { createGenesisWorld, deserializeWorldState, serializeWorldState } from '../src/domain';
import { prepareSocietyJob } from '../src/society-scheduler';
import { RECOVERY_TABLES } from '../src/recovery';
import { restoreRecoveryBundle, verifyRecoveryBundle } from '../src/checkpoint';

type Internal = { saveSociety(state: SocietyState, atMs: number): void; applySocietyJob(jobId: string, atMs: number): void };
const snapshot = (sql: SqlStorage) => Object.fromEntries(RECOVERY_TABLES.map(table => [table,
  sql.exec(`SELECT rowid AS _exportRowId,* FROM ${table} ORDER BY rowid`).toArray()]));
const residentState = (sql: SqlStorage) => JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState;
const build = (sql: SqlStorage, nowMs: number, protocolVersion: 6 | 7 = 7) => {
  const state = residentState(sql), row = sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one();
  const runtime = sql.exec<{ world_revision: number; control_revision: number }>('SELECT world_revision,control_revision FROM runtime_meta').one();
  return prepareSocietyJob({ state, world: deserializeWorldState(row.state_json), actor: 'A',
    sequence: state.minds.A.lastAppliedSequence + 1, nowMs, generation: runtime.control_revision,
    worldRevision: runtime.world_revision, habitatId: env.HABITAT_ID, protocolVersion });
};
const queueAndApply = (sql: SqlStorage, internal: Internal, prepared: ReturnType<typeof build>, output: unknown, atMs: number) => {
  expect(z.fromJSONSchema(prepared.job.outputContract.jsonSchema as Record<string, unknown>).safeParse(output).success).toBe(true);
  sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,?)',
    prepared.turn.sequence, prepared.job.jobId, 'A', JSON.stringify(prepared.turn), prepared.turn.generation);
  sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts,output_json,provider)
    VALUES(?,?,'resolved',0,?,?,1,?,'offline-fixture')`, prepared.job.jobId, JSON.stringify(prepared.job), atMs, atMs, JSON.stringify(output));
  internal.applySocietyJob(prepared.job.jobId, atMs + 1);
  expect(sql.exec('SELECT status,error_code FROM cognition_jobs WHERE job_id=?', prepared.job.jobId).one())
    .toEqual({ status: 'applied', error_code: null });
  const before = snapshot(sql);
  internal.applySocietyJob(prepared.job.jobId, atMs + 2);
  expect(snapshot(sql)).toEqual(before);
};

it('durably applies a private search/read while waiting, restores its exact focus and acknowledges only an applied P7 turn', async () => {
  const world = createGenesisWorld(), now = Date.now();
  let f = { world, state: createSocietyState(world, now), now };
  for (const title of ['Alpha valve account', 'Beta', 'Gamma', 'Delta']) f = recordAct(f, 'A', {
    kind: 'draft', title, text: `Exact private ${title} text.`, refs: [], parent: null, audience: 'private', publish: false });
  const alpha = f.state.records.drafts[0]!;
  const turn = prepareSocietyTurn(f.state, f.world, 'A', { nowMs: f.now, sequence: 4, generation: 0 });
  const opened = applySocietyTurn(f.state, f.world, turn, {
    project: { mode: 'replace', goal: 'Review my earlier account.', why: 'I need the exact text.', visibility: 'private', steps: [] },
    message: { to: 'B', text: 'I will review my earlier account while you consider my question.' },
  }, { nowMs: f.now + 1, generation: 0 });
  expect(opened.ok).toBe(true);
  const initialConversations = structuredClone(opened.state.conversations), initialRecords = structuredClone(opened.state.records);
  expect(initialConversations[0]!.nextSpeaker).toBe('B');

  const source = env.HABITAT_WORLD.getByName('retrieval-real-job-source'); await source.getObserver();
  await runInDurableObject(source, (instance, storage) => {
    const sql = storage.storage.sql, internal = instance as unknown as Internal;
    sql.exec("UPDATE runtime_meta SET mode='running',control_revision=0,world_revision=0,sim_day=?,sim_minute=?",
      f.world.day, (f.world.watch - 1) * 360);
    sql.exec('UPDATE world_state SET world_revision=0,state_json=?', serializeWorldState(opened.world));
    internal.saveSociety(opened.state, f.now + 1);
    queueAndApply(sql, internal, build(sql, f.now + 1000), { lookup: { kind: 'search', query: 'Alpha valve' } }, f.now + 1000);
    expect(residentState(sql).retrieval.A).toMatchObject({ query: 'alpha valve', pending: true, focus: null });
    expect(residentState(sql).conversations).toEqual(initialConversations);
  });

  const queryBackup = await source.getRecoveryExport() as Record<string, unknown>;
  verifyRecoveryBundle(queryBackup, []);
  const target = env.HABITAT_WORLD.getByName('retrieval-real-job-target'); await target.getObserver();
  await runInDurableObject(target, (instance, storage) => {
    const sql = storage.storage.sql, internal = instance as unknown as Internal;
    restoreRecoveryBundle(storage.storage, queryBackup, [], env.HABITAT_ID);
    const beforePrepare = snapshot(sql);
    const selected = build(sql, f.now + 2000);
    build(sql, f.now + 2000); // Preview/admission work never consumes a pending request.
    expect(snapshot(sql)).toEqual(beforePrepare);
    expect(selected.turn.prompt).toContain(alpha.title);
    queueAndApply(sql, internal, selected, { lookup: { kind: 'read', draftId: alpha.id } }, f.now + 2000);
    expect(residentState(sql).retrieval.A).toMatchObject({ focus: { draftId: alpha.id, contentHash: alpha.contentHash }, pending: true });
    expect(residentState(sql).conversations).toEqual(initialConversations);
  });

  const focusBackup = await target.getRecoveryExport() as Record<string, unknown>;
  const restored = env.HABITAT_WORLD.getByName('retrieval-real-job-focus-restored'); await restored.getObserver();
  await runInDurableObject(restored, (instance, storage) => {
    const sql = storage.storage.sql, internal = instance as unknown as Internal;
    const verified = restoreRecoveryBundle(storage.storage, focusBackup, [], env.HABITAT_ID);
    expect(snapshot(sql)).toEqual(verified.tables);
    const pending = structuredClone(residentState(sql).retrieval.A);
    const legacy = build(sql, f.now + 3000, 6);
    expect(residentState(sql).conversations).toEqual(initialConversations);
    expect(legacy.turn.conversation).toEqual({ id: initialConversations[0]!.id,
      revision: initialConversations[0]!.revision, turn: initialConversations[0]!.turns.length });
    const reviewedConversations = structuredClone(initialConversations);
    // An ordinary P6/P7 review acknowledges its issued channel, even though
    // P6 cannot consume the separate P7 document focus. Neither lookup did so.
    reviewedConversations[0]!.attentionThrough[0] = legacy.turn.conversation!.revision;
    expect(legacy.turn.prompt).not.toContain(alpha.text);
    queueAndApply(sql, internal, legacy, { reflection: { text: 'I am still waiting for a reply.', refs: ['world:100:1'] } }, f.now + 3000);
    expect(residentState(sql).retrieval.A).toEqual(pending); // P6 cannot acknowledge a P7 focus.
    expect(residentState(sql).conversations).toEqual(reviewedConversations);
    const actual = build(sql, f.now + 4000);
    expect(actual.turn.conversation).toEqual(legacy.turn.conversation);
    expect(actual.turn.prompt).toContain(alpha.text);
    const before = snapshot(sql);
    build(sql, f.now + 4000);
    expect(snapshot(sql)).toEqual(before);
    queueAndApply(sql, internal, actual, { reflection: { text: 'I have the exact earlier account in this context.', refs: [alpha.id] } }, f.now + 4000);
    const after = residentState(sql);
    expect(after.retrieval.A).toMatchObject({ pending: false, focus: pending.focus });
    expect(after.conversations).toEqual(reviewedConversations);
    expect(after.records).toEqual(initialRecords);
    const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
    expect(world.economy).toEqual(opened.world.economy);
    expect([world.day, world.watch]).toEqual([opened.world.day, opened.world.watch]);
    expect(sql.exec('SELECT COUNT(*) n FROM quota_reservations').one()).toEqual({ n: 0 });
    expect(sql.exec('SELECT COUNT(*) n FROM provider_attempts').one()).toEqual({ n: 0 });
  });
  const publicJson = JSON.stringify(await restored.getObserver());
  for (const text of [alpha.text, alpha.title, '"retrieval"', 'alpha valve']) expect(publicJson).not.toContain(text);
});
