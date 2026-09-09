import { env, exports } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSocietyState, parseSocietyState, watchNumber, type SocietyState } from '../../../src/lib/habitat/society/index';
import { applyRecordOperation, confirmRecordPublication } from '../../../src/lib/habitat/society/records';
import { createGenesisWorld } from '../src/domain';
import { RECOVERY_TABLES } from '../src/recovery';
import { sealRecoveryExport, verifyRecoveryBundle } from '../src/checkpoint';

type Internal = { migrateToV9(): void; saveSociety(state: SocietyState, nowMs: number): void };

describe('durable authored records', () => {
  it('migrates SQL8 preserving every old row and the exact cognitive bytes', async () => {
    const stub = env.HABITAT_WORLD.getByName('records-migrate-v8');
    await stub.getObserver();
    await runInDurableObject(stub, (instance, durable) => {
      const sql = durable.storage.sql;
      sql.exec(`DROP TABLE quota_model_migration; DROP TABLE provider_model_breakers;
        DROP INDEX quota_provider_model_activity_idx; ALTER TABLE quota_reservations DROP COLUMN model;
        DROP TABLE society_layout_backups; DROP TABLE authored_publications; DROP TABLE provider_rejections;
        ALTER TABLE society_state DROP COLUMN archived_record_next_id;
        DELETE FROM _sql_schema_migrations WHERE version>=9;`);
      const current = createSocietyState(createGenesisWorld(), 1000);
      current.minds.A.lastAppliedSequence = 15; current.minds.A.revision = 4;
      current.minds.A.lastSuccessAtMs = 1500; current.revision = 7;
      const { records: _records, retrieval: _retrieval, ...fields } = current;
      expect(_records.publications).toEqual([]);
      expect(_retrieval.A.pending).toBe(false);
      const original = JSON.stringify({ ...fields, version: 1 });
      sql.exec('UPDATE society_state SET codec_version=1,revision=7,state_json=?,updated_at_ms=1500', original);
      sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts)
        VALUES('saved-p4','{"outputContract":{"version":4}}','pending',0,10,20,0)`);
      const oldTables = RECOVERY_TABLES.filter(t => !['society_layout_backups','authored_publications','provider_rejections',
        'quota_model_migration','provider_model_breakers'].includes(t));
      const before = Object.fromEntries(oldTables.map(table => [table, sql.exec(`SELECT rowid AS _exportRowId,* FROM ${table} ORDER BY rowid`).toArray()]));
      (instance as unknown as Internal).migrateToV9();
      for (const table of oldTables) {
        if (table === 'society_state' || table === '_sql_schema_migrations') continue;
        expect(sql.exec(`SELECT rowid AS _exportRowId,* FROM ${table} ORDER BY rowid`).toArray(), table).toEqual(before[table]);
      }
      const saved = sql.exec<{ state_json: string; codec_version: number; revision: number; archived_record_next_id: number }>('SELECT * FROM society_state').one();
      expect(saved.codec_version).toBe(2); expect(saved.revision).toBe(7); expect(saved.archived_record_next_id).toBe(0);
      const migrated = parseSocietyState(JSON.parse(saved.state_json));
      expect(migrated.ok).toBe(true);
      if (!migrated.ok) throw new Error(migrated.code);
      expect(migrated.state).toEqual(current);
      expect(sql.exec('SELECT migration_version,codec_version,revision,state_json,sha256 FROM society_layout_backups').one())
        .toEqual({ migration_version: 9, codec_version: 1, revision: 7, state_json: original,
          sha256: createHash('sha256').update(original).digest('hex') });
    });
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    expect(verifyRecoveryBundle(core, []).tables.authored_publications).toEqual([]);
    // A complete historical SQL8 cut does not need future SQL9 tables.
    const tables = structuredClone(core.tables) as Record<string, Array<Record<string, unknown>>>;
    tables._sql_schema_migrations = tables._sql_schema_migrations!.filter(r => r.version !== 9);
    const backup = tables.society_layout_backups![0]!;
    tables.society_state = [{ ...tables.society_state![0], codec_version: backup.codec_version, state_json: backup.state_json }];
    delete tables.society_state[0]!.archived_record_next_id;
    delete tables.society_layout_backups; delete tables.authored_publications; delete tables.provider_rejections;
    const { exportSha256: _sha, ...oldCore } = core;
    expect(_sha).toBeDefined();
    expect(verifyRecoveryBundle(sealRecoveryExport({ ...oldCore, tables }), []).complete).toBe(true);
    const missingCurrent = structuredClone(core.tables) as Record<string, unknown>;
    delete missingCurrent.authored_publications;
    expect(() => verifyRecoveryBundle(sealRecoveryExport({ ...oldCore, tables: missingCurrent }), [])).toThrow('missing a current-schema table');
  });

  it('retains exact publications after working-set eviction, paginates around private entries and performs no writes on reads', async () => {
    const stub = env.HABITAT_WORLD.getByName('records-public-archive');
    await stub.getObserver();
    await runInDurableObject(stub, (instance, durable) => {
      const sql = durable.storage.sql, internal = instance as unknown as Internal;
      let world = createGenesisWorld();
      const society = createSocietyState(world, 1000);
      for (let index = 0; index < 3; index++) {
        const now = 2000 + index * 100;
        const applied = applyRecordOperation(society.records, world, { actor: 'A', sequence: index,
          expectedRevision: society.records.cursors.A.revision, nowMs: now, preparedRefs: [] }, {
          kind: 'draft', title: index === 1 ? 'A private note' : `Public note ${index}`,
          text: index === 1 ? 'This private text must never appear publicly.' : `Exact public text ${index}.`,
          refs: [], parent: null, audience: index === 1 ? 'B' : 'public', publish: true,
        }, society);
        expect(applied.ok, applied.code).toBe(true); society.records = applied.records; world = applied.world;
        society.minds.A.lastAppliedSequence = index;
        const intent = society.records.intents[0]!;
        const published = confirmRecordPublication(society.records, world, {
          actor: 'A', intentId: intent.id, watch: watchNumber(world), nowMs: now + 1 }, society);
        expect(published.ok, published.code).toBe(true); society.records = published.records; world = published.world;
        society.minds.A.lastPhysicalWatch = watchNumber(world);
        internal.saveSociety(society, now + 1);
        world.watch += 1;
      }
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) n FROM authored_publications').one().n).toBe(3);
      internal.saveSociety(society, 4000);
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) n FROM authored_publications').one().n).toBe(3);
      society.records.archive.drafts += society.records.drafts.length;
      society.records.archive.publications += society.records.publications.length;
      society.records.drafts = []; society.records.publications = [];
      internal.saveSociety(society, 4001);
      const before = Object.fromEntries(RECOVERY_TABLES.map(t => [t, sql.exec(`SELECT * FROM ${t} ORDER BY rowid`).toArray()]));
      const first = instance.getRecords({ limit: 1 });
      expect(first.entries.map(e => e.text)).toEqual(['Exact public text 2.']);
      expect(first.nextCursor).toBe(3);
      const second = instance.getRecords({ limit: 1, before: first.nextCursor! });
      expect(second.entries.map(e => e.text)).toEqual(['Exact public text 0.']);
      expect(second.nextCursor).toBeNull();
      expect(JSON.stringify([first, second])).not.toContain('private');
      for (const table of RECOVERY_TABLES) expect(sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray(), table).toEqual(before[table]);
    });
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    const restored = verifyRecoveryBundle(core, []);
    expect(restored.tables.authored_publications).toHaveLength(3);
    const tables = structuredClone(core.tables) as Record<string, Array<Record<string, unknown>>>;
    const first = tables.authored_publications![0]!;
    const publication = JSON.parse(first.publication_json as string); publication.draft.text = 'Changed after publication';
    first.publication_json = JSON.stringify(publication);
    const { exportSha256: _sha, ...payload } = core; expect(_sha).toBeDefined();
    expect(() => verifyRecoveryBundle(sealRecoveryExport({ ...payload, tables }), [])).toThrow('publication content');
  });

  it('exposes only bounded read-only public pagination parameters', async () => {
    for (const suffix of ['?limit=0','?limit=41','?before=0','?before=1.5','?before=','?limit=1&limit=2','?private=1']) {
      expect((await exports.default.fetch(`https://habitat.test/v1/records${suffix}`)).status).toBe(400);
    }
    const response = await exports.default.fetch('https://habitat.test/v1/records?limit=20');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev');
    expect(await response.json()).toEqual({ entries: [], nextCursor: null });
    expect((await exports.default.fetch(new Request('https://habitat.test/v1/records', { method: 'OPTIONS' }))).status).toBe(204);
  });
});
