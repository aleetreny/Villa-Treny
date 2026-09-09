import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { parseSocietyState } from '../../../src/lib/habitat/society/schema';
import { compactTerminalCognition } from '../src/cognition-retention';
import { cognitionJobSchema } from '../src/contracts';
import { deserializeWorldState } from '../src/domain';
import { recoveryCore, recoveryPage } from '../src/recovery';
import { prepareSocietyJob } from '../src/society-scheduler';

const NOW = 1_788_867_200_000;
function fixture(sql: SqlStorage) {
  const society = parseSocietyState(JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json));
  if (!society.ok) throw new Error(society.code);
  const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
  return prepareSocietyJob({ state: society.state, world, actor: 'A', nowMs: NOW,
    sequence: 1, generation: 0, worldRevision: 0, habitatId: env.HABITAT_ID });
}
function insert(sql: SqlStorage, f: ReturnType<typeof fixture>, status = 'pending', output = ' { "decision" : "keep café 🧭" }\n') {
  const envelope = JSON.stringify(f.job), prepared = JSON.stringify(f.turn);
  sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts,output_json)
    VALUES(?,?,?,0,1,1,0,?)`, f.job.jobId, envelope, status, output);
  sql.exec('INSERT INTO cognition_contexts(job_id,actor,prepared_json,generation) VALUES(?,?,?,?)', f.job.jobId, f.turn.actor, prepared, f.turn.generation);
  return { envelope, prepared, output };
}
function rows(sql: SqlStorage) {
  return { jobs: sql.exec('SELECT * FROM cognition_jobs ORDER BY job_id').toArray(),
    contexts: sql.exec('SELECT * FROM cognition_contexts ORDER BY sequence').toArray() };
}
async function withStorage<T>(name: string, test: (storage: DurableObjectStorage) => T | Promise<T>) {
  const stub = env.HABITAT_WORLD.getByName(`retention-focused-${name}`);
  await stub.getObserver();
  return runInDurableObject(stub, (_instance, state) => test(state.storage));
}

describe('terminal society input retention', () => {
  it('compacts 320 real prepared jobs atomically while preserving output and every other field', async () => {
    const { before, after } = await withStorage('320', (storage) => {
      const sql = storage.sql, base = fixture(sql);
      const originals = Array.from({ length: 320 }, (_, i) => {
        const f = { job: { ...base.job, jobId: `${base.job.jobId}:${i}` }, turn: { ...base.turn, sequence: i + 1 } };
        return { f, ...insert(sql, f) };
      });
      const size = () => sql.exec<{ bytes: number }>(`SELECT
        (SELECT SUM(length(CAST(envelope_json AS BLOB))) FROM cognition_jobs)
        + (SELECT SUM(length(CAST(prepared_json AS BLOB))) FROM cognition_contexts) AS bytes`).one().bytes;
      const before = size();
      for (const { f } of originals) storage.transactionSync(() => {
        sql.exec("UPDATE cognition_jobs SET status='applied' WHERE job_id=?", f.job.jobId);
        expect(compactTerminalCognition(sql, f.job.jobId)).toBe(true);
      });
      const after = size();
      expect(before - after).toBeGreaterThan(1_000_000);
      expect(after).toBeLessThan(before * 0.65);
      for (const { f, output } of originals) {
        const job = sql.exec<{ envelope_json: string; output_json: string }>('SELECT envelope_json,output_json FROM cognition_jobs WHERE job_id=?', f.job.jobId).one();
        const parsed = cognitionJobSchema.parse(JSON.parse(job.envelope_json));
        expect({ ...parsed, prompt: f.job.prompt }).toEqual(f.job);
        const prepared = JSON.parse(sql.exec<{ prepared_json: string }>('SELECT prepared_json FROM cognition_contexts WHERE job_id=?', f.job.jobId).one().prepared_json);
        expect({ ...prepared, prompt: f.turn.prompt }).toEqual(f.turn);
        expect(job.output_json).toBe(output);
      }
      const compacted = rows(sql);
      for (const { f } of originals) expect(storage.transactionSync(() => compactTerminalCognition(sql, f.job.jobId))).toBe(false);
      expect(rows(sql)).toEqual(compacted);
      return { before, after };
    });
    console.info(`Terminal input retention: ${before} → ${after} UTF-8 bytes for 320 jobs (${Math.round(100 * (before - after) / before)}% saved).`);
  });

  it.each(['pending', 'running', 'deferred', 'resolved'])('leaves %s jobs and contexts byte-exact', async (status) => {
    await withStorage(status, (storage) => {
      const f = fixture(storage.sql); insert(storage.sql, f, status);
      const before = rows(storage.sql);
      expect(storage.transactionSync(() => compactTerminalCognition(storage.sql, f.job.jobId))).toBe(false);
      expect(rows(storage.sql)).toEqual(before);
    });
  });

  it('leaves legacy terminal jobs and jobs without a society context byte-exact', async () => {
    await withStorage('legacy', (storage) => {
      const f = fixture(storage.sql);
      f.job.kind = 'reflection'; f.job.outputContract.name = 'cognition_result';
      insert(storage.sql, f, 'applied');
      const another = fixture(storage.sql); another.job.jobId += ':without-context';
      insert(storage.sql, another, 'dead');
      storage.sql.exec('DELETE FROM cognition_contexts WHERE job_id=?', another.job.jobId);
      const before = rows(storage.sql);
      expect(storage.transactionSync(() => compactTerminalCognition(storage.sql, f.job.jobId))).toBe(false);
      expect(storage.transactionSync(() => compactTerminalCognition(storage.sql, another.job.jobId))).toBe(false);
      expect(rows(storage.sql)).toEqual(before);
    });
  });

  it('hashes the original UTF-8 text and preserves the original promptBytes', async () => {
    await withStorage('hash', async (storage) => {
      const f = fixture(storage.sql);
      f.job.prompt.user = 'I remember café 🧭.\n'; f.turn.prompt = f.job.prompt.user;
      f.turn.promptBytes = new TextEncoder().encode(f.turn.prompt).length;
      insert(storage.sql, f, 'dead');
      const expected = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(f.turn.prompt)))]
        .map((byte) => byte.toString(16).padStart(2, '0')).join('');
      expect(storage.transactionSync(() => compactTerminalCognition(storage.sql, f.job.jobId))).toBe(true);
      const saved = JSON.parse(storage.sql.exec<{ prepared_json: string }>('SELECT prepared_json FROM cognition_contexts').one().prepared_json);
      expect(saved.prompt).toBe(`[villa-input-omitted:v1;sha256=${expected};utf8=23]`);
      expect(saved.promptBytes).toBe(23);
    });
  });

  it('retains unknown historical JSON formats instead of repairing their bytes', async () => {
    await withStorage('unknown-format', (storage) => {
      const f = fixture(storage.sql); insert(storage.sql, f, 'dead');
      storage.sql.exec("UPDATE cognition_jobs SET envelope_json='{legacy' WHERE job_id=?", f.job.jobId);
      const before = rows(storage.sql);
      expect(storage.transactionSync(() => compactTerminalCognition(storage.sql, f.job.jobId))).toBe(false);
      expect(rows(storage.sql)).toEqual(before);
    });
  });

  it('rolls both input compaction and terminal status back if the enclosing transaction fails', async () => {
    await withStorage('rollback', (storage) => {
      const f = fixture(storage.sql); insert(storage.sql, f);
      const before = rows(storage.sql);
      expect(() => storage.transactionSync(() => {
        storage.sql.exec("UPDATE cognition_jobs SET status='dead' WHERE job_id=?", f.job.jobId);
        expect(compactTerminalCognition(storage.sql, f.job.jobId)).toBe(true);
        throw new Error('abort-terminal');
      })).toThrow('abort-terminal');
      expect(rows(storage.sql)).toEqual(before);
    });
  });

  it('freezes open and orphaned contexts in a recovery cut before later terminal compaction', async () => {
    await withStorage('recovery-cut', (storage) => {
      const sql = storage.sql, f = fixture(sql), original = insert(sql, f);
      sql.exec('INSERT INTO cognition_contexts(job_id,actor,prepared_json,generation) VALUES(?,?,?,?)', 'orphan', 'A', original.prepared, 0);
      for (let i = 0; i < 130; i++) sql.exec('INSERT INTO runtime_events(type,occurred_at_ms,detail_json) VALUES(?,?,?)', 'fixture', NOW, '{}');
      const cut = storage.transactionSync(() => recoveryCore(sql, NOW));
      expect(cut.complete).toBe(false);
      storage.transactionSync(() => {
        sql.exec("UPDATE cognition_jobs SET status='dead' WHERE job_id=?", f.job.jobId);
        compactTerminalCognition(sql, f.job.jobId);
        sql.exec("UPDATE cognition_contexts SET prepared_json='{}' WHERE job_id='orphan'");
      });
      for (const table of ['cognition_jobs', 'cognition_contexts'] as const) {
        const item = cut.manifest.find((entry) => entry.table === table)!;
        const page = recoveryPage(sql, { table, upperRowId: item.upperRowId, excludedRowIds: item.excludedRowIds,
          cutId: item.cutId, afterRowId: -1, exportedAtMs: NOW }, NOW + 1);
        if (table === 'cognition_jobs') expect(page.rows[0]).toMatchObject({ status: 'pending', envelope_json: original.envelope, output_json: original.output });
        else expect(page.rows.map((row) => row.prepared_json)).toEqual([original.prepared, original.prepared]);
      }
    });
  });
});
