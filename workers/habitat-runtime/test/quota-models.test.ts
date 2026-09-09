import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { parseRuntimeConfig, type ProviderAttemptResult, type RuntimeConfig } from '../src/contracts';
import { SqlQuotaLedger } from '../src/quota';
import { GROQ_120B_MODEL as LARGE, LEGACY_GROQ_MODEL as SMALL, migrateQuotaModels } from '../src/quota-migration';
import { recoveryTablesForVersion } from '../src/recovery';
import { restoreRecoveryBundle, sealRecoveryExport, verifyRecoveryBundle } from '../src/checkpoint';

const NOW = Date.parse('2026-09-08T23:59:59Z'), DAY = 86_400_000;
const max = (inputTokens = 100, outputTokens = 20, neurons = 0) => ({ requests: 1, inputTokens, outputTokens, neurons });
const stub = (name: string) => env.HABITAT_WORLD.getByName(`quota-models-${name}`);
type Fixture = (ledger: SqlQuotaLedger, sql: SqlStorage, config: RuntimeConfig) => void | Promise<void>;
async function fixture(name: string, run: Fixture, overrides: Partial<RuntimeConfig> = {}) {
  await runInDurableObject(stub(name), async (_instance, state) => {
    const config = { ...parseRuntimeConfig(env), ...overrides };
    await run(new SqlQuotaLedger(state.storage.sql, config), state.storage.sql, config);
  });
}
function send(ledger: SqlQuotaLedger, id: string, model: string, at = NOW, size = max(), job?: string) {
  expect(ledger.reserve(id, 'groq', size, at, job, model)).toEqual({ allowed: true });
  ledger.markDispatched(id, at);
}
function failure(model: string, kind: Extract<ProviderAttemptResult, { ok: false }>['kind'], id = 'failure'): ProviderAttemptResult {
  return { ok: false, provider: 'groq', model, kind, attemptId: id, retryable: false, latencyMs: 1 };
}
function asSql9(sql: SqlStorage) {
  sql.exec(`DROP INDEX quota_provider_model_activity_idx; DROP TABLE provider_model_breakers; DROP TABLE quota_model_migration;
    ALTER TABLE quota_reservations DROP COLUMN model; DELETE FROM _sql_schema_migrations WHERE version>=10;
    DELETE FROM society_layout_backups WHERE migration_version>=10;`);
  // This fixture represents an actual SQL9/codec2 source, not a future codec
  // with only its schema-number row removed.
  const society = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json);
  delete society.retrieval; society.version = 2;
  sql.exec('UPDATE society_state SET codec_version=2,state_json=?', JSON.stringify(society));
}
function migrate(sql: SqlStorage) {
  migrateQuotaModels(sql, NOW); sql.exec('INSERT INTO _sql_schema_migrations VALUES(10,?)', NOW);
}
const reseal = (core: Record<string, unknown>) => {
  const { exportSha256, ...payload } = core; void exportSha256; return sealRecoveryExport(payload);
};

describe('two free Groq allowances with one canonical ledger', () => {
  it('writes model identity before dispatch, resolves only legacy20B implicitly, and rejects unknown models', async () => {
    await fixture('identity', (ledger, sql, config) => {
      expect(ledger.reserve('old-caller', 'groq', max(), NOW)).toEqual({ allowed: true });
      expect(ledger.reserve('cf-caller', 'workers-ai', max(10, 1, 20), NOW)).toEqual({ allowed: true });
      expect(ledger.reserve('explicit-120', 'groq', max(), NOW, undefined, LARGE)).toEqual({ allowed: true });
      expect(sql.exec('SELECT reservation_id,model,state FROM quota_reservations ORDER BY rowid').toArray()).toEqual([
        { reservation_id: 'old-caller', model: SMALL, state: 'reserved' },
        { reservation_id: 'cf-caller', model: config.WORKERS_AI_MODEL, state: 'reserved' },
        { reservation_id: 'explicit-120', model: LARGE, state: 'reserved' },
      ]);
      expect(() => ledger.reserve('unknown', 'groq', max(), NOW, undefined, 'unknown')).toThrow('supported model');
      expect(sql.exec('SELECT COUNT(*) n FROM quota_reservations').one()).toEqual({ n: 3 });
    });
  });

  it('keeps minute and rolling-day charges independent, including unknown failures across UTC', async () => {
    await fixture('rolling', (ledger, sql) => {
      send(ledger, 'twenty-full', SMALL, NOW, max(7_000, 1_000));
      const previous = sql.exec("SELECT * FROM quota_reservations WHERE reservation_id='twenty-full'").one();
      expect(ledger.reserve('small-blocked', 'groq', max(1, 0), NOW + 1_000, undefined, SMALL)).toMatchObject({ allowed: false, limit: 'minute-tokens' });
      send(ledger, 'large-free', LARGE, NOW + 1_000, max(7_000, 1_000));
      expect(sql.exec("SELECT * FROM quota_reservations WHERE reservation_id='twenty-full'").one()).toEqual(previous);
      ledger.settle('large-free', { inputTokens: 100, outputTokens: 10 }, NOW + 2_000);
      ledger.settle('large-free', { inputTokens: 0, outputTokens: 0 }, NOW + 3_000);
      const snapshot = ledger.snapshot(NOW + 3_000);
      expect(snapshot).toMatchObject({ modelWindows: {
        [SMALL]: { day: { requests: 1, input_tokens: 7_000, output_tokens: 1_000 } },
        [LARGE]: { day: { requests: 1, input_tokens: 100, output_tokens: 10 } },
      }, windows: { groq: { scope: 'provider-total-informational', day: { requests: 2, input_tokens: 7_100, output_tokens: 1_010 } } } });
      const small = ledger.pacing('groq', SMALL, max(200, 10), NOW + 3_000);
      expect(small.remaining).toBe(192_000); expect(small.estimatedCost).toBe(8_000);
      const large = ledger.pacing('groq', LARGE, max(200, 10), NOW + 3_000);
      expect(large.remaining).toBe(199_890); expect(large.estimatedCost).toBe(110);
      expect(ledger.pacing('groq', SMALL, max(200, 10), NOW + DAY).remaining).toBe(200_000);
      expect(new SqlQuotaLedger(sql, parseRuntimeConfig(env)).pacing('groq', LARGE, max(200, 10), NOW + 4_000)).toEqual(large);
    });
  });

  it('enforces each exact 200k daily ceiling without treating the aggregate as a third ceiling', async () => {
    await fixture('daily', (ledger) => {
      for (const model of [SMALL, LARGE]) for (let i = 0; i < 25; i++) {
        send(ledger, `${model}-${i}`, model, NOW - (25 - i) * 60_000, max(7_000, 1_000));
      }
      for (const model of [SMALL, LARGE]) expect(ledger.reserve(`${model}-excess`, 'groq', max(1, 0), NOW, undefined, model))
        .toMatchObject({ allowed: false, limit: 'day-tokens', retryAtMs: NOW - 25 * 60_000 + DAY });
      expect(ledger.snapshot(NOW)).toMatchObject({ windows: { groq: { day: { requests: 50, input_tokens: 350_000, output_tokens: 50_000 } } } });
    });
  });

  it('enforces the documented request ceilings per model independently of token use', async () => {
    await fixture('request-limits', (ledger) => {
      for (let i = 0; i < 1_000; i++) send(ledger, `request-${i}`, SMALL, NOW - (1_000 - i) * 61_000, max(1, 0));
      expect(ledger.reserve('small-request-over', 'groq', max(1, 0), NOW, undefined, SMALL)).toMatchObject({ allowed: false, limit: 'day-requests' });
      for (let i = 0; i < 30; i++) send(ledger, `large-minute-${i}`, LARGE, NOW, max(1, 0));
      expect(ledger.reserve('large-minute-over', 'groq', max(1, 0), NOW, undefined, LARGE)).toMatchObject({ allowed: false, limit: 'minute-requests', retryAtMs: NOW + 60_000 });
      expect(ledger.reserve('large-minute-over', 'groq', max(1, 0), NOW + 60_000, undefined, LARGE)).toEqual({ allowed: true });
    });
  });

  it('uses the model/activity index without reading other models or growing historical scans', async () => {
    await fixture('indexed-models', (_ledger, sql, config) => {
      const cursors: Array<SqlStorageCursor<Record<string, SqlStorageValue>>> = [];
      function exec<T extends Record<string, SqlStorageValue>>(query: string, ...bindings: SqlStorageValue[]) {
        const cursor = sql.exec<T>(query, ...bindings); cursors.push(cursor); return cursor;
      }
      const tracked = new Proxy(sql, { get: (target, name) => name === 'exec' ? exec : Reflect.get(target, name, target) });
      const ledger = new SqlQuotaLedger(tracked, config), results = [];
      let previous = 0;
      send(ledger, 'one-small', SMALL, NOW - 1_000, max(100, 0));
      for (const count of [100, 1_000, 5_000]) {
        for (let i = previous; i < count; i++) {
          // Both retained history and current charges of the other model must
          // stay outside this model's indexed range, not be filtered after IO.
          for (const [id, model, at] of [[`old-${i}`, SMALL, NOW - 2 * DAY], [`other-${i}`, LARGE, NOW - 1_000]] as const) {
            sql.exec(`INSERT INTO quota_reservations(reservation_id,provider,model,day,state,max_requests,max_input_tokens,max_output_tokens,max_neurons,created_at_ms)
              VALUES(?,'groq',?,'fixture','reserved',1,1,0,0,?)`, id, model, at);
          }
        }
        previous = count; cursors.length = 0;
        expect(ledger.pacing('groq', SMALL, max(), NOW).remaining).toBe(199_900);
        results.push(cursors.reduce((n, cursor) => n + cursor.rowsRead, 0));
        expect(cursors.reduce((n, cursor) => n + cursor.rowsWritten, 0)).toBe(0);
      }
      expect(results).toEqual([results[0], results[0], results[0]]);
      expect(results[0]).toBeLessThanOrEqual(6);
    });
  });

  it('honors lower per-model policy and keeps all CF models in the existing 8000-neuron pool', async () => {
    await fixture('lower-policy', (ledger) => {
      expect(ledger.reserve('large-over', 'groq', max(5_001, 0), NOW, undefined, LARGE)).toMatchObject({ allowed: false, limit: 'request-size' });
      send(ledger, 'small-still-8000', SMALL, NOW, max(8_000, 0));
      for (const [i, model] of ['cf-old', 'cf-current'].entries()) {
        expect(ledger.reserve(`cf-${i}`, 'workers-ai', max(100, 20, 4_000), NOW, undefined, model)).toEqual({ allowed: true });
      }
      expect(ledger.reserve('cf-over', 'workers-ai', max(1, 0, 1), NOW, undefined, 'cf-third')).toMatchObject({ allowed: false, limit: 'day-neurons' });
    }, { GROQ_120B_DAILY_TOTAL_TOKENS_LIMIT: 5_000, WORKERS_AI_DAILY_NEURONS_LIMIT: 8_000 });
  });

  it('caps two sends per explicit destination and four total, retaining legacy two-per-provider behavior', async () => {
    await fixture('attempts', (ledger, sql) => {
      const job = 'job%_居民';
      for (const i of [1, 2]) send(ledger, `${job}:groq:20b:${i}`, SMALL, NOW, max(), job);
      expect(ledger.reserve(`${job}:groq:20b:3`, 'groq', max(), NOW, job, SMALL)).toMatchObject({ allowed: false, reason: 'attempt-limit' });
      expect(ledger.reserve(`${job}:groq:legacy:3`, 'groq', max(), NOW, job)).toMatchObject({ allowed: false, reason: 'attempt-limit' });
      send(ledger, `${job}:groq:120b:1`, LARGE, NOW, max(), job);
      expect(ledger.reserve(`${job}:workers-ai:1`, 'workers-ai', max(100, 20, 10), NOW, job, 'cf')).toEqual({ allowed: true });
      ledger.markDispatched(`${job}:workers-ai:1`, NOW);
      expect(ledger.dispatchedCount(job, 'groq', SMALL)).toBe(2);
      expect(ledger.dispatchedCount(job, 'groq', LARGE)).toBe(1);
      expect(ledger.dispatchedTotal(job)).toBe(4);
      expect(ledger.reserve(`${job}:groq:120b:2`, 'groq', max(), NOW, job, LARGE)).toMatchObject({ allowed: false, reason: 'attempt-limit' });
      expect(ledger.reserve(`${job}:workers-ai:2`, 'workers-ai', max(), NOW, job)).toMatchObject({ allowed: false, reason: 'attempt-limit' });
      expect(ledger.reserve(`${job}:groq:20b:1`, 'groq', max(), NOW, job, SMALL)).toMatchObject({ allowed: false, reason: 'duplicate' });
      expect(sql.exec('SELECT COUNT(*) n FROM quota_reservations').one()).toEqual({ n: 4 });
    });
  });

  it.each(['rate-limited', 'quota-exhausted', 'policy-blocked'] as const)('isolates %s while authentication remains shared and late cross-model success cannot clear it', async (kind) => {
    await fixture(`breaker-${kind}`, (ledger, sql) => {
      send(ledger, 'older-120', LARGE, NOW - 1);
      ledger.recordOutcome(failure(SMALL, kind), NOW);
      expect(ledger.reserve('small-denied', 'groq', max(), NOW, undefined, SMALL)).toMatchObject({ allowed: false, reason: 'circuit-open' });
      expect(ledger.reserve('large-ready', 'groq', max(), NOW, undefined, LARGE)).toEqual({ allowed: true });
      ledger.recordOutcome(failure(SMALL, 'authentication'), NOW + 1);
      const auth = sql.exec("SELECT * FROM provider_breakers WHERE provider='groq'").one();
      const good: ProviderAttemptResult = { ok: true, provider: 'groq', model: LARGE, attemptId: 'older-120',
        payload: {}, usage: { inputTokens: 10, outputTokens: 1 }, latencyMs: 1 };
      expect(ledger.recordOutcome(good, NOW + 2)).toBe(NOW + 1 + DAY);
      expect(sql.exec("SELECT * FROM provider_breakers WHERE provider='groq'").one()).toEqual(auth);
      for (const model of [SMALL, LARGE]) expect(ledger.reserve(`denied-${model}`, 'groq', max(), NOW + 2, undefined, model))
        .toMatchObject({ allowed: false, reason: 'circuit-open', retryAtMs: NOW + 1 + DAY });
    });
  });
});

describe('additive SQL10 identity migration and complete recovery', () => {
  it('preserves every SQL9 value and attributes historical Groq reservations and rate guards only to20B', async () => {
    const source = stub('migration');
    await runInDurableObject(source, async (instance, state) => {
      const sql = state.storage.sql; asSql9(sql);
      sql.exec(`INSERT INTO quota_reservations(reservation_id,provider,day,state,max_requests,max_input_tokens,max_output_tokens,max_neurons,created_at_ms,dispatched_at_ms)
        VALUES('old:groq:1','groq','2026-09-08','dispatched',1,6000,1000,0,?,?)`, NOW, NOW);
      sql.exec('INSERT INTO provider_attempts VALUES(?,?,?,0,?,1,NULL,NULL,1,?)', 'old:groq:1', 'groq', SMALL, 'timeout', NOW);
      sql.exec("INSERT INTO provider_breakers VALUES('groq',?,'rate-limited',2,?)", NOW + 60_000, NOW);
      const before = Object.fromEntries(recoveryTablesForVersion(9).map((table) => [table,
        sql.exec(`SELECT rowid AS _exportRowId,* FROM ${table} ORDER BY rowid`).toArray()]));
      const core9 = await instance.getRecoveryExport() as Record<string, unknown>;
      expect(verifyRecoveryBundle(core9, []).complete).toBe(true);
      state.storage.transactionSync(() => migrate(sql));
      for (const [table, original] of Object.entries(before)) {
        const after = sql.exec(`SELECT rowid AS _exportRowId,* FROM ${table} ORDER BY rowid`).toArray();
        if (table === '_sql_schema_migrations') expect(after.filter((row) => Number(row.version) < 10)).toEqual(original);
        else if (table === 'quota_reservations') expect(after.map(({ model, ...old }) => { expect(model).toBeNull(); return old; })).toEqual(original);
        else expect(after, table).toEqual(original);
      }
      const ledger = new SqlQuotaLedger(sql, parseRuntimeConfig(env));
      expect(ledger.dispatchedCount('old', 'groq', SMALL)).toBe(1); expect(ledger.dispatchedCount('old', 'groq', LARGE)).toBe(0);
      expect(ledger.pacing('groq', SMALL, max(), NOW).remaining).toBe(193_000);
      expect(ledger.pacing('groq', LARGE, max(), NOW).remaining).toBe(200_000);
      expect(ledger.reserve('20-denied', 'groq', max(), NOW, undefined, SMALL)).toMatchObject({ allowed: false, reason: 'circuit-open' });
      send(ledger, 'new:groq:120:1', LARGE, NOW, max(7_000, 1_000), 'new');
      const core10 = await instance.getRecoveryExport() as Record<string, unknown>;
      const verified = verifyRecoveryBundle(core10, []);
      expect(verified.tables.quota_reservations).toHaveLength(2);
      expect(verifyRecoveryBundle(core9, []).complete).toBe(true);
      for (const mutation of ['missing-model', 'mismatched-attempt'] as const) {
        const corrupted = structuredClone(core10), tables = corrupted.tables as Record<string, Array<Record<string, unknown>>>;
        if (mutation === 'missing-model') tables.quota_reservations![1]!.model = null;
        else tables.provider_attempts![0]!.model = LARGE;
        expect(() => verifyRecoveryBundle(reseal(corrupted), [])).toThrow(/model/);
      }
      const target = stub('restore'); await target.getObserver();
      await runInDurableObject(target, (_target, restored) => {
        asSql9(restored.storage.sql); migrate(restored.storage.sql);
        expect(restoreRecoveryBundle(restored.storage, core10, [], env.HABITAT_ID).complete).toBe(true);
        for (const table of recoveryTablesForVersion(10)) expect(restored.storage.sql.exec(`SELECT rowid AS _exportRowId,* FROM ${table} ORDER BY rowid`).toArray())
          .toEqual(verified.tables[table]);
      });
    });
  });

  it('rejects ambiguous historical models atomically rather than assigning them an allowance', async () => {
    await runInDurableObject(stub('bad-history'), (_instance, state) => {
      const sql = state.storage.sql; asSql9(sql);
      sql.exec('INSERT INTO provider_attempts VALUES(?,?,?,1,NULL,0,NULL,NULL,1,?)', 'unexpected', 'groq', LARGE, NOW);
      expect(() => state.storage.transactionSync(() => migrate(sql))).toThrow('historical Groq model');
      expect(sql.exec<{ name: string }>('PRAGMA table_info(quota_reservations)').toArray().some((row) => row.name === 'model')).toBe(false);
      expect(sql.exec('SELECT MAX(version) version FROM _sql_schema_migrations').one()).toEqual({ version: 9 });
    });
  });
});
