import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { parseRuntimeConfig } from '../src/contracts';
import { SqlQuotaLedger } from '../src/quota';
import { recoveryTablesForVersion } from '../src/recovery';
import { verifyRecoveryBundle } from '../src/checkpoint';

const DAY = 86_400_000, NOW = Date.parse('2026-09-08T12:00:00Z');
const indexes = ['provider_attempts_recent_idx', 'quota_day_provider_idx', 'quota_provider_activity_idx'];
type Internal = { migrateToV8(): void };

function tracked(sql: SqlStorage) {
  const cursors: Array<{ query: string; cursor: SqlStorageCursor<Record<string, SqlStorageValue>> }> = [];
  function exec<T extends Record<string, SqlStorageValue>>(query: string, ...bindings: SqlStorageValue[]) {
    const cursor = sql.exec<T>(query, ...bindings); cursors.push({ query, cursor }); return cursor;
  }
  const storage = new Proxy(sql, { get: (target, property) => property === 'exec' ? exec : Reflect.get(target, property, target) });
  return { storage, cursors, reset: () => { cursors.length = 0; },
    reads: () => cursors.reduce((sum, { cursor }) => sum + cursor.rowsRead, 0),
    writes: () => cursors.reduce((sum, { cursor }) => sum + cursor.rowsWritten, 0) };
}

function seedHistory(sql: SqlStorage, prefix: string, count: number, now: number, recent = false) {
  for (let i = 0; i < count; i++) {
    const at = now - (recent ? 600_000 : 10 * DAY) - i;
    const id = `${prefix}-${i}`, provider = i % 2 ? 'groq' : 'workers-ai';
    sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts)
      VALUES(?,?,?,0,?,?,1)`, id, '{}', i % 2 ? 'dead' : 'applied', at, at);
    sql.exec('INSERT INTO provider_attempts VALUES(?,?,?,1,NULL,0,NULL,NULL,1,?)', id, provider, 'offline-fixture', at);
    sql.exec(`INSERT INTO quota_reservations(reservation_id,provider,day,state,max_requests,max_input_tokens,max_output_tokens,max_neurons,actual_requests,actual_input_tokens,actual_output_tokens,actual_neurons,created_at_ms,dispatched_at_ms,settled_at_ms,usage_confirmed) VALUES(?,?,?,'settled',1,2000,512,80,1,1500,100,60,?,?,?,1)`,
      id, provider, new Date(at).toISOString().slice(0, 10), at, at, at);
  }
}

describe('bounded observer SQL reads', () => {
  it('reads the same active window with 100, 1000 or 5000 historical rows, preserving terminal history', async () => {
    const stub = env.HABITAT_WORLD.getByName('observer-history-cost');
    const results = await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql, clock = vi.spyOn(Date, 'now').mockReturnValue(NOW), audit = tracked(sql);
      await state.storage.deleteAlarm();
      seedHistory(sql, 'recent', 100, NOW, true);
      for (const [i, status] of ['pending', 'deferred', 'running', 'resolved'].entries()) {
        sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts)
          VALUES(?,?,?,0,?,?,1)`, `active-${i}`, '{}', status, NOW, NOW + 1);
        sql.exec('INSERT INTO cognition_contexts(job_id,actor,prepared_json,generation) VALUES(?,?,?,0)', `active-${i}`, 'ABCD'[i]!, '{}');
      }
      Reflect.set(instance, 'sql', audit.storage);
      const results = [];
      try {
        let total = 0;
        for (const historical of [100, 1000, 5000]) {
          seedHistory(sql, `old-${historical}`, historical - total, NOW); total = historical;
          // Each measurement is a real fresh status, outside its 10s cache.
          clock.mockReturnValue(NOW + historical * 100);
          audit.reset(); const status = await instance.getStatus();
          const rowsRead = audit.reads();
          expect(audit.writes()).toBe(0);
          expect(status.queue).toEqual({ scope: 'active', counts: { pending: 1, deferred: 1, running: 1, resolved: 1 }, oldestDueAtMs: NOW + 1 });
          expect(sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM cognition_jobs WHERE status IN ('applied','dead')").one().count).toBe(historical + 100);
          audit.reset(); await instance.getWorldRevision(); expect(audit.reads()).toBe(1);
          audit.reset(); await instance.getObserver(); expect(audit.reads()).toBe(3);
          expect(audit.writes()).toBe(0);
          results.push({ historical, rowsRead, providers: status.providers });
        }
      } finally { Reflect.set(instance, 'sql', sql); clock.mockRestore(); }
      return results;
    });
    // SQL10 adds one empty model-breaker table read; history remains constant.
    expect(results.map((row) => row.rowsRead)).toEqual([248, 248, 248]);
    expect(results[1]!.providers).toEqual(results[0]!.providers);
    expect(results[2]!.providers).toEqual(results[0]!.providers);
  });

  it('coalesces observer status reads for 10s, invalidates every runtime field, and never caches quota decisions', async () => {
    const stub = env.HABITAT_WORLD.getByName('observer-shared-status');
    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql, audit = tracked(sql), clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
      Reflect.set(instance, 'sql', audit.storage);
      try {
        const snapshots = await Promise.all(Array.from({ length: 20 }, () => instance.getStatus()));
        expect(snapshots.every((status) => JSON.stringify(status) === JSON.stringify(snapshots[0]))).toBe(true);
        expect(audit.cursors.filter(({ query }) => query.includes('FROM quota_reservations WHERE day'))).toHaveLength(1);
        audit.reset(); clock.mockReturnValue(NOW + 9_999); await instance.getStatus();
        expect(audit.reads()).toBe(1); expect(audit.cursors).toHaveLength(1);
        audit.reset(); clock.mockReturnValue(NOW + 10_000); await instance.getStatus();
        expect(audit.cursors.length).toBeGreaterThan(1);
        for (const mutation of [
          'UPDATE runtime_meta SET world_revision=world_revision+1',
          'UPDATE runtime_meta SET control_revision=control_revision+1',
          'UPDATE runtime_meta SET alarm_generation=alarm_generation+1',
          "UPDATE runtime_meta SET last_error_code='fixture-new-error'",
          "UPDATE runtime_meta SET last_cognition_error_code='fixture-mind-error'",
          "UPDATE runtime_meta SET mode='running'",
        ]) {
          sql.exec(mutation); audit.reset(); await instance.getStatus();
          expect(audit.cursors.length, mutation).toBeGreaterThan(1);
        }
        // UI quota may be at most 10s old. Admission never reads that cache.
        const ledger = new SqlQuotaLedger(sql, { ...parseRuntimeConfig(env), WORKERS_AI_DAILY_NEURONS_LIMIT: 10 });
        expect(ledger.reserve('after-cache', 'workers-ai', { requests: 1, inputTokens: 100, outputTokens: 20, neurons: 10 }, NOW)).toEqual({ allowed: true });
        expect(ledger.reserve('over-budget', 'workers-ai', { requests: 1, inputTokens: 1, outputTokens: 1, neurons: 1 }, NOW)).toMatchObject({ allowed: false, reason: 'limit' });
        expect(audit.writes()).toBe(0);
      } finally { Reflect.set(instance, 'sql', sql); clock.mockRestore(); }
    });
  });

  it('retries a failed status build and does not let an older rejection evict a newer revision', async () => {
    const stub = env.HABITAT_WORLD.getByName('observer-failed-cache');
    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      const original = Reflect.get(instance, 'buildStatus') as (runtime: unknown) => Promise<Record<string, unknown>>;
      let rejectOld!: (error: Error) => void;
      const old = new Promise<Record<string, unknown>>((_resolve, reject) => { rejectOld = reject; });
      const builder = vi.fn().mockImplementationOnce(() => old).mockImplementation((runtime) => original.call(instance, runtime));
      Reflect.set(instance, 'buildStatus', builder);
      try {
        const first = instance.getStatus(); const firstError = first.catch((error: Error) => error.message);
        state.storage.sql.exec('UPDATE runtime_meta SET control_revision=control_revision+1');
        const next = await instance.getStatus();
        rejectOld(new Error('offline-status-failure'));
        expect(await firstError).toBe('offline-status-failure');
        expect(await instance.getStatus()).toEqual(next); expect(builder).toHaveBeenCalledTimes(2);
        sql.exec('UPDATE runtime_meta SET control_revision=control_revision+1');
        builder.mockRejectedValueOnce(new Error('retryable-read-error'));
        await expect(instance.getStatus()).rejects.toThrow('retryable-read-error');
        await expect(instance.getStatus()).resolves.toBeDefined(); expect(builder).toHaveBeenCalledTimes(4);
      } finally { Reflect.set(instance, 'buildStatus', original); }
    });
  });

  it('adds only three indexes and migration8, preserving a complete SQL7 backup and every data row', async () => {
    const stub = env.HABITAT_WORLD.getByName('observer-sql8-migration');
    await runInDurableObject(stub, async (instance, state) => {
      const sql = state.storage.sql;
      for (const index of indexes) sql.exec(`DROP INDEX ${index}`);
      sql.exec(`DROP TABLE society_layout_backups; DROP TABLE authored_publications; DROP TABLE provider_rejections;
        DROP INDEX quota_provider_model_activity_idx; DROP TABLE provider_model_breakers; DROP TABLE quota_model_migration;
        ALTER TABLE quota_reservations DROP COLUMN model;
        ALTER TABLE society_state DROP COLUMN archived_record_next_id;
        DELETE FROM _sql_schema_migrations WHERE version>=8;`);
      const originalSociety = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json);
      // Reconstruct the actual codec1 shape, without either later extension.
      delete originalSociety.records; delete originalSociety.retrieval; originalSociety.version = 1;
      sql.exec('UPDATE society_state SET codec_version=1,state_json=?', JSON.stringify(originalSociety));
      seedHistory(sql, 'history', 20, NOW);
      sql.exec(`INSERT INTO quota_reservations(reservation_id,provider,day,state,max_requests,max_input_tokens,max_output_tokens,max_neurons,created_at_ms,dispatched_at_ms)
        VALUES('ancient-unknown','workers-ai','2020-01-01','dispatched',1,100,20,80,1,1)`);
      const before = Object.fromEntries(recoveryTablesForVersion(7).filter(table => table !== '_sql_schema_migrations')
        .map(table => [table, sql.exec(`SELECT rowid,* FROM ${table} ORDER BY rowid`).toArray()]));
      const backup7 = await instance.getRecoveryExport() as Record<string, unknown>;
      expect(verifyRecoveryBundle(backup7, []).complete).toBe(true);
      (instance as unknown as Internal).migrateToV8();
      for (const [table, rows] of Object.entries(before)) expect(sql.exec(`SELECT rowid,* FROM ${table} ORDER BY rowid`).toArray(), table).toEqual(rows);
      expect(sql.exec<{ version: number }>('SELECT MAX(version) AS version FROM _sql_schema_migrations').one().version).toBe(8);
      expect(sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index'").toArray().map(row => row.name)).toEqual(expect.arrayContaining(indexes));
      expect(verifyRecoveryBundle(backup7, []).complete).toBe(true);
      const backup8 = await instance.getRecoveryExport() as Record<string, unknown>;
      expect(verifyRecoveryBundle(backup8, []).complete).toBe(true);
      expect(Object.keys(backup8.tables as object)).toEqual(Object.keys(backup7.tables as object));
    });
  });

  it('preserves the Workers AI window for unordered, future, unknown and cross-midnight timestamps', async () => {
    const stub = env.HABITAT_WORLD.getByName('observer-quota-predicate-equivalence');
    await runInDurableObject(stub, (_instance, state) => {
      const sql = state.storage.sql, start = Date.parse('2026-09-08T00:00:00Z');
      const times = [0, NOW - DAY - 1, NOW - DAY, start - 1, start, NOW, NOW + DAY];
      let id = 0;
      for (const created of times) for (const dispatched of [null, ...times]) for (const settled of [null, ...times]) for (const confirmed of [0, 1]) {
        sql.exec(`INSERT INTO quota_reservations(reservation_id,provider,day,state,max_requests,max_input_tokens,max_output_tokens,max_neurons,actual_requests,actual_input_tokens,actual_output_tokens,actual_neurons,created_at_ms,dispatched_at_ms,settled_at_ms,usage_confirmed) VALUES(?,'workers-ai',?,'settled',1,100,20,80,1,70,10,40,?,?,?,?)`,
          `combination-${id++}`, new Date(created).toISOString().slice(0, 10), created, dispatched, settled, confirmed);
      }
      const ledger = new SqlQuotaLedger(sql, parseRuntimeConfig(env));
      for (const at of [start, NOW, start + DAY - 1, start + DAY, start + 2 * DAY]) {
        const utc = new Date(at).toISOString().slice(0, 10), boundary = Date.parse(`${utc}T00:00:00Z`);
        // The independent reference is the deployed SQL7 membership predicate.
        const expected = sql.exec<{ requests: number; input_tokens: number; output_tokens: number; neurons: number }>(`SELECT
          SUM(CASE WHEN usage_confirmed=1 THEN actual_requests ELSE max_requests END) AS requests,
          SUM(CASE WHEN usage_confirmed=1 THEN actual_input_tokens ELSE max_input_tokens END) AS input_tokens,
          SUM(CASE WHEN usage_confirmed=1 THEN actual_output_tokens ELSE max_output_tokens END) AS output_tokens,
          SUM(CASE WHEN usage_confirmed=1 THEN actual_neurons ELSE max_neurons END) AS neurons
          FROM quota_reservations WHERE provider='workers-ai' AND (created_at_ms>=? OR settled_at_ms>=?
          OR (usage_confirmed=0 AND MAX(created_at_ms,COALESCE(dispatched_at_ms,0),COALESCE(settled_at_ms,0))>?))`, boundary, boundary, at - DAY).one();
        expect(ledger.snapshot(at)).toMatchObject({ windows: { 'workers-ai': { usage: expected } } });
      }
    });
  });

  it('measures the additional per-row index writes without changing reservation values', async () => {
    const stub = env.HABITAT_WORLD.getByName('observer-index-write-cost');
    const result = await runInDurableObject(stub, (instance, state) => {
      const sql = state.storage.sql;
      for (const index of indexes) sql.exec(`DROP INDEX ${index}`);
      // Keep this historical SQL7→8 write-cost comparison isolated from SQL10.
      sql.exec('DROP INDEX quota_provider_model_activity_idx');
      sql.exec('DELETE FROM _sql_schema_migrations WHERE version=8');
      function writes(id: string) {
        const created = sql.exec(`INSERT INTO quota_reservations(reservation_id,provider,day,state,max_requests,max_input_tokens,max_output_tokens,max_neurons,created_at_ms)
          VALUES(?,'workers-ai','2026-09-08','reserved',1,100,20,80,?)`, id, NOW).rowsWritten;
        const dispatched = sql.exec("UPDATE quota_reservations SET state='dispatched',dispatched_at_ms=? WHERE reservation_id=?", NOW + 1, id).rowsWritten;
        const settled = sql.exec("UPDATE quota_reservations SET state='settled',settled_at_ms=?,usage_confirmed=1,actual_requests=1,actual_input_tokens=70,actual_output_tokens=10,actual_neurons=40 WHERE reservation_id=?", NOW + 2, id).rowsWritten;
        const attempt = sql.exec('INSERT INTO provider_attempts VALUES(?,?,?,1,NULL,0,NULL,NULL,1,?)', id, 'workers-ai', 'offline-fixture', NOW).rowsWritten;
        return { created, dispatched, settled, attempt };
      }
      const before = writes('before'); (instance as unknown as Internal).migrateToV8(); const after = writes('after');
      const rows = sql.exec('SELECT * FROM quota_reservations ORDER BY reservation_id').toArray();
      expect({ ...rows[0], reservation_id: '' }).toEqual({ ...rows[1], reservation_id: '' });
      return { before, after };
    });
    expect(result).toEqual({ before: { created: 3, dispatched: 1, settled: 1, attempt: 2 }, after: { created: 5, dispatched: 2, settled: 2, attempt: 3 } });
  });

  it('measures the one-time index construction at 100, 1000 and 5000 retained requests', async () => {
    const costs = [];
    for (const count of [100, 1000, 5000]) {
      const stub = env.HABITAT_WORLD.getByName(`observer-index-build-${count}`);
      costs.push(await runInDurableObject(stub, (instance, state) => {
        const sql = state.storage.sql;
        for (const index of indexes) sql.exec(`DROP INDEX ${index}`);
        sql.exec('DELETE FROM _sql_schema_migrations WHERE version=8');
        seedHistory(sql, 'historical', count, NOW);
        const audit = tracked(sql); Reflect.set(instance, 'sql', audit.storage);
        try {
          (instance as unknown as Internal).migrateToV8();
          return { count, reads: audit.reads(), writes: audit.writes() };
        } finally { Reflect.set(instance, 'sql', sql); }
      }));
    }
    for (const { count, reads, writes } of costs) {
      // Index population writes one entry per row plus three schema entries
      // and the migration marker. Read accounting also includes index pages.
      expect(writes).toBe(3 * count + 4);
      expect(reads).toBeGreaterThanOrEqual(6 * count);
      expect(reads).toBeLessThanOrEqual(6.1 * count + 10);
    }
  });

  it('bounds exact job submission counts by the reservation primary key, including wildcard and Unicode IDs', async () => {
    const stub = env.HABITAT_WORLD.getByName('quota-job-prefix-cost');
    const measured = await runInDurableObject(stub, (_instance, state) => {
      const sql = state.storage.sql, audit = tracked(sql), ledger = new SqlQuotaLedger(audit.storage, parseRuntimeConfig(env));
      const job = 'job%_🧭:居民', prefix = `${job}:groq:`;
      const add = (id: string, provider: string, status: string) => sql.exec(`INSERT INTO quota_reservations
        (reservation_id,provider,day,state,max_requests,max_input_tokens,max_output_tokens,max_neurons,created_at_ms)
        VALUES(?,?,'2026-09-08',?,1,1,0,0,?)`, id, provider, status, NOW - 2 * DAY);
      add(`${prefix}1`, 'groq', 'dispatched'); add(`${prefix}2`, 'groq', 'settled');
      add(`${prefix}3`, 'groq', 'reserved'); add(`${prefix}wrong-provider`, 'workers-ai', 'settled');
      for (const id of [`${job}:groq`, `${job}:groq;1`, `${job}x:groq:1`, 'jobAA🧭:居民:groq:1', `${job}:workers-ai:1`]) add(id, 'groq', 'settled');
      let previous = 0; const readings = [];
      for (const count of [100, 1000, 5000]) {
        for (let i = previous; i < count; i++) add(`unrelated-${i}:groq:1`, 'groq', 'settled');
        previous = count; audit.reset(); expect(ledger.dispatchedCount(job, 'groq')).toBe(2);
        readings.push(audit.reads());
        // Repeated scheduler wakes must not consume dispatch slots or create rows.
        for (let wake = 0; wake < 50; wake++) expect(ledger.reserve(`${prefix}wake-${wake}`, 'groq', { requests: 1, inputTokens: 1, outputTokens: 0, neurons: 0 }, NOW, job))
          .toMatchObject({ allowed: false, reason: 'attempt-limit' });
      }
      expect(sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM quota_reservations').one().count).toBe(5009);
      return readings;
    });
    expect(measured).toEqual([5, 5, 5]);
  });
});
