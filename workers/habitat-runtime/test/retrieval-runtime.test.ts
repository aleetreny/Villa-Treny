import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSocietyState, parseSocietyState, type SocietyState } from '../../../src/lib/habitat/society/index';
import { emptyRetrievalState } from '../../../src/lib/habitat/society/retrieval-state';
import { recordAct, recordFixture } from '../../../src/lib/habitat/society/records-test-fixture';
import { createGenesisWorld } from '../src/domain';
import { prepareSocietyJob } from '../src/society-scheduler';
import { RECOVERY_TABLES } from '../src/recovery';
import { restoreRecoveryBundle, sealRecoveryExport, verifyRecoveryBundle, type Checkpoint } from '../src/checkpoint';

type Internal = { migrateToV11(): void; saveSociety(state: SocietyState, nowMs: number): void };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const tables = (sql: SqlStorage) => Object.fromEntries(RECOVERY_TABLES.map(table => [table,
  sql.exec(`SELECT rowid AS _exportRowId,* FROM ${table} ORDER BY rowid`).toArray()]));
const reseal = (core: Record<string, unknown>) => {
  const { exportSha256, ...payload } = core;
  expect(exportSha256).toEqual(expect.any(String));
  return sealRecoveryExport(payload);
};

describe('SQL11 private retrieval persistence', () => {
  it('archives the exact codec2 row and preserves every other row, including a pending P6 preparation', async () => {
    const stub = env.HABITAT_WORLD.getByName('retrieval-migration-exact');
    await stub.getObserver();
    let original = '';
    await runInDurableObject(stub, (instance, storage) => {
      const sql = storage.storage.sql, world = createGenesisWorld(), current = createSocietyState(world, 1000);
      current.minds.A.lastAppliedSequence = 8; current.minds.A.revision = 2; current.revision = 14;
      const { retrieval, ...fields } = current;
      expect(retrieval).toEqual(emptyRetrievalState());
      original = JSON.stringify({ ...fields, version: 2 }, null, 2);
      sql.exec('DELETE FROM _sql_schema_migrations WHERE version>=11');
      sql.exec('DELETE FROM society_layout_backups WHERE migration_version>=11');
      sql.exec('UPDATE society_state SET codec_version=2,revision=14,state_json=?,updated_at_ms=1234', original);
      const prepared = prepareSocietyJob({ state: current, world, actor: 'A', sequence: 9, nowMs: 1500,
        generation: 0, worldRevision: 0, habitatId: env.HABITAT_ID, protocolVersion: 6 });
      sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts)
        VALUES(?,?,'pending',0,1500,2000,0)`, prepared.job.jobId, JSON.stringify(prepared.job));
      sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(9,?,\'A\',?,0)',
        prepared.job.jobId, JSON.stringify(prepared.turn));
      const before = tables(sql);
      (instance as unknown as Internal).migrateToV11();
      const after = tables(sql);
      for (const table of RECOVERY_TABLES) {
        if (['society_state', 'society_layout_backups', '_sql_schema_migrations'].includes(table)) continue;
        expect(after[table], table).toEqual(before[table]);
      }
      expect(after._sql_schema_migrations!.filter(row => row.version !== 11)).toEqual(before._sql_schema_migrations);
      expect(after.society_layout_backups!.filter(row => row.migration_version !== 11)).toEqual(before.society_layout_backups);
      const backup = sql.exec('SELECT * FROM society_layout_backups WHERE migration_version=11').one();
      expect(backup).toMatchObject({ codec_version: 2, revision: 14, state_json: original, sha256: hash(original) });
      const saved = sql.exec<{ codec_version: number; revision: number; state_json: string; archived_record_next_id: number }>('SELECT * FROM society_state').one();
      expect(saved.codec_version).toBe(3); expect(saved.revision).toBe(14);
      expect(saved.archived_record_next_id).toBe(before.society_state![0]!.archived_record_next_id);
      expect(parseSocietyState(JSON.parse(saved.state_json))).toEqual({ ok: true, state: current });
    });
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    const verified = verifyRecoveryBundle(core, []);
    expect(verified.tables.society_layout_backups!.find(row => row.migration_version === 11)!.state_json).toBe(original);
    // A genuine old-format reader path preserves original bytes; it does not
    // pretend that decoding a codec2 state has already changed its saved row.
    const legacy = structuredClone(core), oldTables = legacy.tables as Record<string, Array<Record<string, unknown>>>;
    oldTables._sql_schema_migrations = oldTables._sql_schema_migrations!.filter(row => row.version !== 11);
    oldTables.society_layout_backups = oldTables.society_layout_backups!.filter(row => row.migration_version !== 11);
    oldTables.society_state![0] = { ...oldTables.society_state![0], codec_version: 2, state_json: original };
    const checkpoint = legacy.checkpoint as Checkpoint;
    checkpoint.rulesVersion = 'villa-society-v10';
    checkpoint.sha256 = hash(JSON.stringify({ codecVersion: checkpoint.codecVersion, rulesVersion: checkpoint.rulesVersion,
      worldRevision: checkpoint.worldRevision, stateJson: checkpoint.stateJson }));
    expect(verifyRecoveryBundle(reseal(legacy), []).tables.society_state![0]!.state_json).toBe(original);
    const wrongVersion = structuredClone(core);
    (wrongVersion.tables as typeof oldTables).society_state![0] = { ...oldTables.society_state![0] };
    expect(() => verifyRecoveryBundle(reseal(wrongVersion), [])).toThrow('SQL11 recovery requires');
  });

  it('restores pending private focus and query exactly without exposing them to the observer', async () => {
    const source = env.HABITAT_WORLD.getByName('retrieval-recovery-source'); await source.getObserver();
    await runInDurableObject(source, (instance) => {
      const { state: society } = recordAct(recordFixture(), 'A', { kind: 'draft', title: 'Private focus source',
        text: 'Exact private focused content.', refs: [], parent: null, audience: 'private', publish: false });
      const draft = society.records.drafts[0]!;
      society.minds.A.lastAppliedSequence = 4;
      society.retrieval.A = { version: 1, revision: 1, query: 'private retained query', cursor: 'private-cursor',
        focus: { draftId: draft.id, contentHash: draft.contentHash }, pending: true, lastSequence: 4 };
      (instance as unknown as Internal).saveSociety(society, 2000);
    });
    const core = await source.getRecoveryExport() as Record<string, unknown>, verified = verifyRecoveryBundle(core, []);
    const target = env.HABITAT_WORLD.getByName('retrieval-recovery-target'); await target.getObserver();
    await runInDurableObject(target, (_instance, state) => {
      restoreRecoveryBundle(state.storage, core, [], env.HABITAT_ID);
      expect(tables(state.storage.sql)).toEqual(verified.tables);
      const society = JSON.parse(state.storage.sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json);
      expect(society.retrieval.A).toMatchObject({ pending: true, lastSequence: 4, query: 'private retained query' });
    });
    const observer = JSON.stringify(await target.getObserver());
    for (const secret of ['private retained query', 'private-cursor', 'Private focus source', 'Exact private focused content.', '"retrieval"']) expect(observer).not.toContain(secret);
    const bad = structuredClone(core), row = (bad.tables as Record<string, Array<Record<string, unknown>>>).society_state![0]!;
    const corrupt = JSON.parse(String(row.state_json)); corrupt.retrieval.A.lastSequence = 999;
    row.state_json = JSON.stringify(corrupt);
    expect(() => verifyRecoveryBundle(reseal(bad), [])).toThrow('society codec or revision');
  });

  it('rejects inconsistent old codec metadata before migration writes', async () => {
    const stub = env.HABITAT_WORLD.getByName('retrieval-migration-corrupt'); await stub.getObserver();
    await runInDurableObject(stub, (instance, state) => {
      const sql = state.storage.sql;
      sql.exec('DELETE FROM _sql_schema_migrations WHERE version>=11');
      sql.exec('DELETE FROM society_layout_backups WHERE migration_version>=11');
      sql.exec('UPDATE society_state SET codec_version=2'); // Its actual JSON remains the current codec.
      const before = tables(sql);
      expect(() => (instance as unknown as Internal).migrateToV11()).toThrow('metadata differs');
      expect(tables(sql)).toEqual(before);
    });
  });
});
