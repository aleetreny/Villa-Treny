import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSocietyState, parseSocietyState, type SocietyState } from '../../../src/lib/habitat/society/index';
import { createGenesisWorld } from '../src/domain';
import { prepareSocietyJob } from '../src/society-scheduler';
import { RECOVERY_TABLES } from '../src/recovery';
import { restoreRecoveryBundle, sealRecoveryExport, verifyRecoveryBundle, type Checkpoint } from '../src/checkpoint';

type Internal = { migrateToV12(): void; saveSociety(state: SocietyState, nowMs: number): void };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const tables = (sql: SqlStorage) => Object.fromEntries(RECOVERY_TABLES.map(table => [table,
  sql.exec(`SELECT rowid AS _exportRowId,* FROM ${table} ORDER BY rowid`).toArray()]));
const reseal = (core: Record<string, unknown>) => {
  const { exportSha256, ...payload } = core;
  expect(exportSha256).toEqual(expect.any(String));
  return sealRecoveryExport(payload);
};
function fixture() {
  const world = createGenesisWorld(), current = createSocietyState(world, 0);
  current.minds.A.lastSuccessAtMs = 200; current.minds.A.lastAppliedSequence = 8;
  current.minds.A.revision = 2; current.revision = 14; current.nextId = 4;
  current.conversations = [{ id: 'conversation:0', participants: ['A', 'B'], revision: 3, nextSpeaker: 'B',
    status: 'open', createdAtMs: 50, expiresAtMs: 10_000, attentionThrough: [2, 0], appraisedThrough: [-1, 0],
    turns: [100, 200, 300].map((atMs, index) => ({ id: `turn:${index + 1}`, index,
      speaker: index % 2 ? 'B' as const : 'A' as const, text: `Exact retained speech ${index}.`, atMs })) }];
  const old = { ...current, version: 3, conversations: current.conversations.map(channel => {
    const { attentionThrough, ...legacy } = channel; void attentionThrough; return legacy;
  }) };
  return { world, current, old, original: JSON.stringify(Object.fromEntries(Object.entries(old).reverse()), null, 2) };
}
function beforeMigration(sql: SqlStorage, original: string) {
  sql.exec('DELETE FROM _sql_schema_migrations WHERE version=12');
  sql.exec('DELETE FROM society_layout_backups WHERE migration_version=12');
  sql.exec('UPDATE society_state SET codec_version=3,revision=14,state_json=?,updated_at_ms=1234', original);
}

describe('SQL12 private channel attention persistence', () => {
  it('archives the exact codec3 row and preserves all other rows, clocks and a pending P7 job', async () => {
    const stub = env.HABITAT_WORLD.getByName('attention-migration-exact'); await stub.getObserver();
    const { current, world, original } = fixture();
    await runInDurableObject(stub, (instance, storage) => {
      const sql = storage.storage.sql;
      beforeMigration(sql, original);
      const prepared = prepareSocietyJob({ state: current, world, actor: 'A', sequence: 9, nowMs: 1500,
        generation: 0, worldRevision: 0, habitatId: env.HABITAT_ID, protocolVersion: 7 });
      sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts)
        VALUES(?,?,'pending',0,1500,2000,0)`, prepared.job.jobId, JSON.stringify(prepared.job));
      sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(9,?,\'A\',?,0)',
        prepared.job.jobId, JSON.stringify(prepared.turn));
      const before = tables(sql);
      (instance as unknown as Internal).migrateToV12();
      const after = tables(sql);
      for (const table of RECOVERY_TABLES) {
        if (['society_state', 'society_layout_backups', '_sql_schema_migrations'].includes(table)) continue;
        expect(after[table], table).toEqual(before[table]);
      }
      expect(after._sql_schema_migrations!.filter(row => row.version !== 12)).toEqual(before._sql_schema_migrations);
      expect(after.society_layout_backups!.filter(row => row.migration_version !== 12)).toEqual(before.society_layout_backups);
      const backup = sql.exec('SELECT * FROM society_layout_backups WHERE migration_version=12').one();
      expect(backup).toMatchObject({ codec_version: 3, revision: 14, state_json: original, sha256: hash(original) });
      const saved = sql.exec<{ codec_version: number; revision: number; state_json: string; archived_record_next_id: number }>('SELECT * FROM society_state').one();
      expect(saved.codec_version).toBe(4); expect(saved.revision).toBe(14);
      expect(saved.archived_record_next_id).toBe(before.society_state![0]!.archived_record_next_id);
      expect(parseSocietyState(JSON.parse(saved.state_json))).toEqual({ ok: true, state: current });
      const normalized = JSON.parse(saved.state_json);
      normalized.version = 3;
      for (const channel of normalized.conversations) delete channel.attentionThrough;
      expect(normalized).toEqual(JSON.parse(original));
    });
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    expect(verifyRecoveryBundle(core, []).tables.society_layout_backups!.find(row => row.migration_version === 12)!.state_json).toBe(original);
    const legacy = structuredClone(core), oldTables = legacy.tables as Record<string, Array<Record<string, unknown>>>;
    oldTables._sql_schema_migrations = oldTables._sql_schema_migrations!.filter(row => row.version !== 12);
    oldTables.society_layout_backups = oldTables.society_layout_backups!.filter(row => row.migration_version !== 12);
    oldTables.society_state![0] = { ...oldTables.society_state![0], codec_version: 3, state_json: original };
    const checkpoint = legacy.checkpoint as Checkpoint;
    checkpoint.rulesVersion = 'villa-society-v11';
    checkpoint.sha256 = hash(JSON.stringify({ codecVersion: checkpoint.codecVersion, rulesVersion: checkpoint.rulesVersion,
      worldRevision: checkpoint.worldRevision, stateJson: checkpoint.stateJson }));
    expect(verifyRecoveryBundle(reseal(legacy), []).tables.society_state![0]!.state_json).toBe(original);
    const wrong = structuredClone(core);
    (wrong.tables as typeof oldTables).society_state![0] = { ...oldTables.society_state![0] };
    expect(() => verifyRecoveryBundle(reseal(wrong), [])).toThrow('SQL12 recovery requires');
  });

  it('restores private attention markers and all table rows exactly without publishing markers', async () => {
    const source = env.HABITAT_WORLD.getByName('attention-recovery-source'); await source.getObserver();
    const { current } = fixture();
    await runInDurableObject(source, instance => (instance as unknown as Internal).saveSociety(current, 2000));
    const core = await source.getRecoveryExport() as Record<string, unknown>, verified = verifyRecoveryBundle(core, []);
    const target = env.HABITAT_WORLD.getByName('attention-recovery-target'); await target.getObserver();
    await runInDurableObject(target, (_instance, state) => {
      restoreRecoveryBundle(state.storage, core, [], env.HABITAT_ID);
      expect(tables(state.storage.sql)).toEqual(verified.tables);
      const society = JSON.parse(state.storage.sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json);
      expect(society.conversations[0].attentionThrough).toEqual([2, 0]);
    });
    expect(JSON.stringify(await target.getObserver())).not.toContain('attentionThrough');
    const corrupt = structuredClone(core), row = (corrupt.tables as Record<string, Array<Record<string, unknown>>>).society_state![0]!;
    const malformed = JSON.parse(String(row.state_json)); malformed.conversations[0].attentionThrough[1] = 99;
    row.state_json = JSON.stringify(malformed);
    expect(() => verifyRecoveryBundle(reseal(corrupt), [])).toThrow('society codec or revision');
  });

  it.each(['metadata', 'legacy_overlap', 'hidden_marker', 'trimmed_text'] as const)('rejects %s before making any migration writes', async problem => {
    const stub = env.HABITAT_WORLD.getByName(`attention-migration-corrupt-${problem}`); await stub.getObserver();
    await runInDurableObject(stub, (instance, storage) => {
      const sql = storage.storage.sql, { old } = fixture();
      if (problem === 'legacy_overlap') {
        old.conversations.push({ ...structuredClone(old.conversations[0]!), id: 'conversation:4', participants: ['A', 'C'],
          nextSpeaker: 'C', turns: old.conversations[0]!.turns.map((turn, index) => ({ ...turn, id: `turn:${5 + index}`,
            speaker: index % 2 ? 'C' : 'A' })) });
        old.nextId = 8;
      }
      if (problem === 'trimmed_text') old.conversations[0]!.turns[0]!.text = '  Preserve these original outer spaces.  ';
      const serialized = problem === 'hidden_marker' ? JSON.stringify({ ...old, conversations: old.conversations.map(c => ({ ...c, attentionThrough: [0, 0] })) })
        : JSON.stringify(old);
      beforeMigration(sql, serialized);
      if (problem === 'metadata') sql.exec('UPDATE society_state SET revision=15');
      const before = tables(sql);
      expect(() => (instance as unknown as Internal).migrateToV12()).toThrow(problem === 'metadata' ? 'matching codec3'
        : problem === 'legacy_overlap' ? 'overlapping_conversation' : problem === 'trimmed_text' ? 'would change prior fields' : 'invalid_society_state');
      expect(tables(sql)).toEqual(before);
    });
  });
});
