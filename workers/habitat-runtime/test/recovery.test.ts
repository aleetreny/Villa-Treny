import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { recoveryPage, RECOVERY_TABLES, type RecoveryManifest, type RecoveryPage } from '../src/recovery';
import { restoreRecoveryBundle, sealRecoveryExport, verifyRecoveryBundle, verifyRecoveryExport, type Checkpoint } from '../src/checkpoint';
import { SOCIETY_LIMITS } from '../../../src/lib/habitat/society/types';

const get = (name: string) => env.HABITAT_WORLD.getByName(`recovery-focused-${name}`);
const reseal = (core: Record<string, unknown>) => {
  const { exportSha256: _checksum, ...payload } = core;
  void _checksum;
  return sealRecoveryExport(payload);
};
function pageRequest(core: Record<string, unknown>, item: RecoveryManifest, afterRowId = -1) {
  return { table: item.table, upperRowId: item.upperRowId, excludedRowIds: item.excludedRowIds, afterRowId,
    exportedAtMs: core.exportedAtMs as number, ...(item.cutId ? { cutId: item.cutId } : {}) };
}
async function download(stub: ReturnType<typeof get>, core: Record<string, unknown>): Promise<RecoveryPage[]> {
  const pages: RecoveryPage[] = [];
  for (const item of core.manifest as RecoveryManifest[]) {
    let cursor: number | null = -1;
    while (cursor !== null) {
      const page: RecoveryPage = await stub.getRecoveryPage(pageRequest(core, item, cursor));
      pages.push(page); cursor = page.nextAfterRowId;
    }
  }
  return pages;
}
async function archive(stub: ReturnType<typeof get>, count = 260) {
  await stub.getObserver();
  await runInDurableObject(stub, (_instance, state) => {
    for (let i = 0; i < count; i++) state.storage.sql.exec('INSERT INTO runtime_events(type,occurred_at_ms,detail_json) VALUES(?,?,?)', 'fixture.history', i, '{}');
  });
}

describe('complete society recovery', () => {
  it('freezes hundreds of mutable jobs, old ambiguous reservations and cache rows while history keeps growing', async () => {
    const stub = get('large-mutable'); await archive(stub);
    await runInDurableObject(stub, (_instance, state) => {
      const sql = state.storage.sql;
      for (let i = 0; i < 320; i++) {
        sql.exec("INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts) VALUES(?,?,'pending',0,1,1,0)", `job-${i}`, '{}');
        sql.exec("INSERT INTO quota_reservations(reservation_id,provider,day,state,max_requests,max_input_tokens,max_output_tokens,max_neurons,created_at_ms,dispatched_at_ms,model) VALUES(?,'workers-ai','2020-01-01','dispatched',1,100,20,3,1,1,'offline-fixture')", `quota-${i}`);
        sql.exec('INSERT INTO provider_usage_daily VALUES(?,?,1,100,20,3,0,0,0,0)', `fixture-day-${i}`, 'workers-ai');
        sql.exec('INSERT INTO admin_commands VALUES(?,?,?,?)', `pending-${i}`, 'cognition-check', 1, '{"status":"pending"}');
        sql.exec('INSERT INTO cognition_contexts(job_id,actor,prepared_json,generation) VALUES(?,?,?,?)', `job-${i}`, 'A', '{}', 0);
      }
      sql.exec('INSERT INTO physical_runs VALUES(?,?,?,?,?,?,?)', 'fixture-physical', 100, 1, 1, 0, 1, '[]');
      sql.exec('INSERT INTO society_events(world_revision,occurred_at_ms,job_id,actor,event_json) VALUES(?,?,?,?,?)', 0, 1, 'fixture-event', 'A', '{}');
      for (const model of ['openai/gpt-oss-20b', 'openai/gpt-oss-120b']) {
        sql.exec("INSERT INTO provider_model_breakers VALUES('groq',?,900,'rate-limited',1,1)", model);
      }
    });
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    expect(core.complete).toBe(false); expect(core.cutId).toEqual(expect.any(String));
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE cognition_jobs SET status='applied'");
      state.storage.sql.exec("UPDATE quota_reservations SET state='settled',usage_confirmed=1,actual_requests=1,actual_input_tokens=10,actual_output_tokens=2,actual_neurons=1,settled_at_ms=2");
      state.storage.sql.exec('UPDATE provider_usage_daily SET actual_neurons=1');
      state.storage.sql.exec("UPDATE provider_model_breakers SET open_until_ms=0,reason=NULL,updated_at_ms=2");
      state.storage.sql.exec("UPDATE admin_commands SET response_json='{\"status\":\"complete\"}'");
      state.storage.sql.exec("INSERT INTO runtime_events(type,occurred_at_ms,detail_json) VALUES('after.cut',2,'{}')");
    });
    const pages = await download(stub, core), recovered = verifyRecoveryBundle(core, pages);
    expect(recovered.tables.cognition_jobs).toHaveLength(320);
    expect(recovered.tables.cognition_jobs!.every((row) => row.status === 'pending')).toBe(true);
    expect(recovered.tables.quota_reservations).toHaveLength(320);
    expect(recovered.tables.quota_reservations!.every((row) => row.usage_confirmed === 0 && row.actual_neurons === null)).toBe(true);
    expect(recovered.tables.provider_usage_daily!.every((row) => row.actual_neurons === 0)).toBe(true);
    expect(recovered.tables.provider_model_breakers).toHaveLength(2);
    expect(recovered.tables.provider_model_breakers!.every((row) => row.open_until_ms === 900 && row.reason === 'rate-limited')).toBe(true);
    expect(recovered.tables.admin_commands!.every((row) => row.response_json === '{"status":"pending"}')).toBe(true);
    expect(recovered.tables.cognition_contexts).toHaveLength(320);
    expect(recovered.tables.physical_runs).toHaveLength(1); expect(recovered.tables.society_events).toHaveLength(1);
    expect(recovered.tables.runtime_events!.some((row) => row.type === 'after.cut')).toBe(false);
    expect(pages.every((page) => page.rows.length <= 128)).toBe(true);
    expect(Object.keys(recovered.world.bodies)).toHaveLength(25); expect(recovered.world.axes.size).toBe(600);

    const target = get('restored-large'); await target.getObserver();
    await runInDurableObject(target, (_instance, storageState) => {
      const restored = restoreRecoveryBundle(storageState.storage, core, pages, env.HABITAT_ID);
      for (const table of RECOVERY_TABLES) {
        const rows = storageState.storage.sql.exec(`SELECT rowid AS _exportRowId,* FROM ${table} ORDER BY rowid`).toArray();
        expect(rows, table).toEqual([...restored.tables[table]!].sort((a, b) => Number(a._exportRowId) - Number(b._exportRowId)));
      }
    });
  });

  it('retains a large valid society singleton without pagination loss', async () => {
    const stub = get('large-mind'); await archive(stub);
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one();
      const society = JSON.parse(row.state_json);
      for (const mind of Object.values(society.minds) as Array<{ memories: unknown[] }>) {
        mind.memories = Array.from({ length: SOCIETY_LIMITS.memories }, () => ({ id: `memory:${society.nextId++}`, kind: 'observation',
          text: '界'.repeat(400), refs: [], atWatch: 400, createdAtMs: 1, importance: 1, source: null }));
      }
      const serialized = JSON.stringify(society);
      expect(new TextEncoder().encode(serialized).length).toBeGreaterThan(400_000);
      state.storage.sql.exec('UPDATE society_state SET state_json=?', serialized);
    });
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    const checked = verifyRecoveryExport(core);
    expect(checked.tables.society_state).toHaveLength(1);
    expect(JSON.parse(String(checked.tables.society_state![0]!.state_json)).minds.A.memories).toHaveLength(SOCIETY_LIMITS.memories);
    expect(verifyRecoveryBundle(core, await download(stub, core)).complete).toBe(true);
  });

  it('rejects expired, evicted and mixed cuts instead of returning a plausible incomplete backup', async () => {
    const stub = get('expiry'); await archive(stub);
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    const first = (core.manifest as RecoveryManifest[])[0]!;
    await runInDurableObject(stub, (_instance, state) => {
      expect(() => recoveryPage(state.storage.sql, pageRequest(core, first), core.expiresAtMs as number)).toThrow('expired');
    });
    const pages = await download(stub, core);
    const wrong = { ...pages[0]!, cutId: crypto.randomUUID() };
    const { sha256: _hash, ...payload } = wrong;
    void _hash;
    wrong.sha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    expect(() => verifyRecoveryBundle(core, [wrong, ...pages.slice(1)])).toThrow('different cuts');
    for (let i = 0; i < 4; i++) await stub.getRecoveryExport();
    await runInDurableObject(stub, (_instance, state) => {
      expect(() => recoveryPage(state.storage.sql, pageRequest(core, first))).toThrow('unavailable');
      expect(state.storage.sql.exec('SELECT COUNT(*) AS count FROM _recovery_cuts').one()).toEqual({ count: 4 });
    });
  });

  it('continues to verify pre-society v1 backups with known v6 rules', async () => {
    const stub = get('legacy'); await stub.getObserver();
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    const tables = core.tables as Record<string, Array<Record<string, unknown>>>;
    for (const table of ['world_state', 'society_state', 'cognition_contexts', 'physical_runs', 'society_events']) delete tables[table];
    tables._sql_schema_migrations = tables._sql_schema_migrations!.filter((row) => Number(row.version) < 7);
    delete tables.runtime_meta![0]!.next_cognition_at_ms; delete tables.runtime_meta![0]!.last_cognition_error_code;
    const checkpoint = core.checkpoint as Checkpoint;
    checkpoint.rulesVersion = 'villa-society-v6';
    checkpoint.sha256 = createHash('sha256').update(JSON.stringify({ codecVersion: checkpoint.codecVersion,
      rulesVersion: checkpoint.rulesVersion, worldRevision: checkpoint.worldRevision, stateJson: checkpoint.stateJson })).digest('hex');
    const legacy = reseal(core), verified = verifyRecoveryBundle(legacy, []);
    expect(verified.world.axes.size).toBe(600); expect(verified.complete).toBe(true);
    await runInDurableObject(stub, (_instance, state) => {
      expect(() => restoreRecoveryBundle(state.storage, legacy, [], env.HABITAT_ID)).toThrow('matching SQL schema');
    });
  });

  it('rejects incomplete confirmed usage and mismatched society metadata even after rehashing', async () => {
    const stub = get('semantics'); await stub.getObserver();
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    const badUsage = structuredClone(core);
    (badUsage.tables as Record<string, unknown[]>).quota_reservations = [{ _exportRowId: 1, max_requests: 1, max_input_tokens: 100,
      max_output_tokens: 20, max_neurons: 3, state: 'settled', usage_confirmed: 1, actual_requests: 1,
      actual_input_tokens: null, actual_output_tokens: 0, actual_neurons: 0, settled_at_ms: 1 }];
    expect(() => verifyRecoveryExport(reseal(badUsage))).toThrow('Confirmed usage');
    const badSociety = structuredClone(core);
    (badSociety.tables as Record<string, Array<Record<string, unknown>>>).society_state![0]!.revision = 900;
    expect(() => verifyRecoveryExport(reseal(badSociety))).toThrow('society codec or revision');
    const missing = structuredClone(core); delete (missing.tables as Record<string, unknown>).cognition_contexts;
    expect(() => verifyRecoveryBundle(reseal(missing), [])).toThrow('missing a current-schema table');
  });

  it('rolls back every write if a valid-shaped restore encounters a duplicate SQL identity', async () => {
    const source = get('rollback-source'); await source.getObserver();
    const target = get('rollback-target'); await target.getObserver();
    const core = await source.getRecoveryExport() as Record<string, unknown>;
    await runInDurableObject(target, (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec("INSERT INTO admin_commands VALUES('target-marker','pause',1,'{}')");
      const original = sql.exec('SELECT * FROM runtime_meta').one();
      (core.tables as Record<string, unknown[]>).admin_commands = [
        { _exportRowId: 1, command_id: 'duplicate', kind: 'pause', issued_at_ms: 1, response_json: '{}' },
        { _exportRowId: 2, command_id: 'duplicate', kind: 'pause', issued_at_ms: 2, response_json: '{}' },
      ];
      expect(() => restoreRecoveryBundle(state.storage, reseal(core), [], env.HABITAT_ID)).toThrow();
      expect(sql.exec('SELECT command_id FROM admin_commands').toArray()).toEqual([{ command_id: 'target-marker' }]);
      expect(sql.exec('SELECT * FROM runtime_meta').one()).toEqual(original);
    });
  });
});
