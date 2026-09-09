import { env, exports } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { parseRuntimeConfig } from '../src/contracts';
import { deserializeWorldState, prepareCognition } from '../src/domain';
import { HabitatWorld } from '../src/habitat-world';
import { SqlQuotaLedger } from '../src/quota';
import { legacyWorld } from './legacy-fixture';

describe('habitat runtime Worker', () => {
  it('serves a lightweight health endpoint', async () => {
    const response = await exports.default.fetch('https://habitat.test/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://aleetreny.github.io');
    await expect(response.json()).resolves.toMatchObject({ ok: true, service: 'habitat-runtime' });
  });

  it('initializes one paused, canonical habitat with exactly 25 residents of capacity', async () => {
    const response = await exports.default.fetch('https://habitat.test/v1/status');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: 12,
      habitatId: 'habitat-canonical',
      residentCapacity: 25,
      mode: 'paused',
      pauseReason: 'awaiting-domain-engine',
    });
  });

  it('serves a live snapshot as a read-only public projection', async () => {
    const before = await exports.default.fetch('https://habitat.test/v1/status');
    const beforeStatus = await before.json() as { worldRevision: number; lastRun: unknown };

    const response = await exports.default.fetch('https://habitat.test/v1/snapshot');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://aleetreny.github.io');
    expect(response.headers.get('cache-control')).toContain('stale-while-revalidate');
    expect(response.headers.get('etag')).toBe(`"habitat-${beforeStatus.worldRevision}"`);
    await expect(response.json()).resolves.toMatchObject({
      day: 100,
      watch: 1,
      people: expect.arrayContaining([expect.objectContaining({ id: 'A' })]),
      rooms: expect.arrayContaining([expect.objectContaining({ id: 'bridge' })]),
    });

    const after = await exports.default.fetch('https://habitat.test/v1/status');
    await expect(after.json()).resolves.toMatchObject({
      worldRevision: beforeStatus.worldRevision,
      lastRun: beforeStatus.lastRun,
    });
  });

  it('requires a day for immutable archive reads', async () => {
    const invalid = await exports.default.fetch('https://habitat.test/v1/archive');
    expect(invalid.status).toBe(400);

    const response = await exports.default.fetch('https://habitat.test/v1/archive?day=100');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://aleetreny.github.io');
    await expect(response.json()).resolves.toMatchObject({ day: 100, entries: [] });
  });

  it('answers conditional world reads without advancing the world or starting thoughts', async () => {
    const stub = env.HABITAT_WORLD.getByName(env.HABITAT_ID);
    const before = await stub.getWorldRevision();
    for (const path of ['snapshot', 'observer']) {
      const fresh = await exports.default.fetch(`https://habitat.test/v1/${path}`);
      const tag = fresh.headers.get('etag')!;
      const unchanged = await exports.default.fetch(`https://habitat.test/v1/${path}`, { headers: { 'if-none-match': tag } });
      expect(unchanged.status).toBe(304); expect(await unchanged.text()).toBe('');
      expect(unchanged.headers.get('etag')).toBe(tag);
    }
    expect(await stub.getWorldRevision()).toBe(before);
    const status = await stub.getStatus() as unknown as { queue: { counts: Record<string, number> } };
    expect(status.queue.counts).toEqual({});
  });

  it('does not expose admin operations without a configured secret', async () => {
    const response = await exports.default.fetch('https://habitat.test/v1/admin/resume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'resume-test-0001', issuedAtMs: Date.now() }),
    });
    expect(response.status).toBe(503);
    const inference = await exports.default.fetch('https://habitat.test/v1/admin/cognition/check', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'check-test-0001', issuedAtMs: Date.now() }),
    });
    expect(inference.status).toBe(503);
  });

  it('keeps an operator cognition check idempotent and entirely outside the world clock', async () => {
    const stub = env.HABITAT_WORLD.getByName('operator-cognition-check');
    const before = await stub.getObserver();
    await runInDurableObject(stub, (_instance, state) => {
      for (const provider of ['workers-ai', 'groq']) state.storage.sql.exec(
        'INSERT OR REPLACE INTO provider_breakers VALUES (?, ?, ?, ?, ?)',
        provider, Date.now() + 86_400_000, 'authentication', 1, Date.now(),
      );
    });
    const command = { commandId: 'check-idempotency-0001', issuedAtMs: Date.now() };
    const result = await stub.checkCognition(command);
    expect(result).toMatchObject({ status: 'complete', ok: false });
    expect(await stub.checkCognition(command)).toEqual(result);
    expect(await stub.getObserver()).toEqual(before);
    await runInDurableObject(stub, (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM admin_commands').one().count).toBe(1);
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM quota_reservations').one().count).toBe(0);
    });
  });

  it('keeps pause and resume commands idempotent inside the Durable Object', async () => {
    const stub = env.HABITAT_WORLD.getByName('idempotency-test');
    const command = { commandId: 'resume-idempotency-test', issuedAtMs: Date.now() };
    const first = await stub.resume(command);
    const replay = await stub.resume(command);
    expect(replay).toEqual(first);
    expect(replay.applied).toBe(true);
    const firstStatus = await stub.getStatus() as unknown as {
      nextWake: { generation: number } | null;
    };

    const alreadyRunning = await stub.resume({
      commandId: 'resume-already-running-test',
      issuedAtMs: Date.now(),
    });
    expect(alreadyRunning).toMatchObject({
      applied: false,
      mode: 'running',
      controlRevision: first.controlRevision,
    });
    const secondStatus = await stub.getStatus() as unknown as {
      nextWake: { generation: number } | null;
    };
    expect(secondStatus.nextWake?.generation).toBe(firstStatus.nextWake?.generation);

    const paused = await stub.pause({ commandId: 'pause-idempotency-test', issuedAtMs: Date.now() });
    expect(paused.mode).toBe('paused');
    const status = await stub.getStatus() as unknown as { residentCapacity: number };
    expect(status.residentCapacity).toBe(25);
  });

  it('does not advance a watch when an operational alarm fires early', async () => {
    const stub = env.HABITAT_WORLD.getByName('alarm-before-watch-test');
    await stub.resume({ commandId: 'resume-alarm-test', issuedAtMs: Date.now() });
    await runInDurableObject(stub, async (_instance: HabitatWorld, state) => {
      await state.storage.setAlarm(Date.now() + 60_000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const status = await stub.getStatus() as unknown as {
      worldRevision: number;
      lastRun: { runId: string } | null;
      queue: { counts: Record<string, number> };
    };
    expect(status.worldRevision).toBe(0);
    expect(status.lastRun).toBeNull();
    expect(status.queue.counts).toEqual({});
    await stub.pause({ commandId: 'pause-alarm-test', issuedAtMs: Date.now() });
  });

  it('keeps the physical clock independent of an old cognition lease', async () => {
    const stub = env.HABITAT_WORLD.getByName('active-cognition-lease-test');
    const resumed = await stub.resume({
      commandId: 'resume-active-cognition-lease-test',
      issuedAtMs: Date.now(),
    });
    const leaseAtMs = Date.now() + 5 * 60_000;
    await runInDurableObject(stub, async (_instance: HabitatWorld, state) => {
      const sql = state.storage.sql;
      const stored = sql.exec<{ state_json: string }>(
        'SELECT state_json FROM world_state WHERE singleton = 1',
      ).one();
      const world = deserializeWorldState(stored.state_json);
      const runId = 'habitat-canonical:world:0:watch';
      const prepared = prepareCognition({
        state: world,
        worldRevision: 0,
        habitatId: 'habitat-canonical',
        runId,
        createdAtMs: Date.now(),
        controlRevision: resumed.controlRevision,
      });
      sql.exec(
        `INSERT INTO watch_runs (
           run_id, cause_world_revision, sim_day, sim_watch, control_revision,
           subject_id, cognition_job_id, phase, due_at_ms
         ) VALUES (?, 0, ?, ?, ?, ?, ?, 'claimed', 0)`,
        runId,
        world.day,
        world.watch,
        resumed.controlRevision,
        prepared.actor,
        prepared.job.jobId,
      );
      sql.exec(
        `INSERT INTO cognition_jobs (
           job_id, envelope_json, status, pressure, created_at_ms, due_at_ms,
           attempts, lease_expires_at_ms
         ) VALUES (?, ?, 'running', ?, ?, 0, 1, ?)`,
        prepared.job.jobId,
        JSON.stringify(prepared.job),
        prepared.job.pressure,
        prepared.job.createdAtMs,
        leaseAtMs,
      );
      sql.exec('UPDATE runtime_meta SET next_watch_at_ms = 0 WHERE singleton = 1');
      await state.storage.setAlarm(Date.now() + 60_000);
    });

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const status = await stub.getStatus() as unknown as {
      worldRevision: number;
      lastRun: unknown;
      nextWake: { dueAtMs: number; reason: string } | null;
      queue: { counts: Record<string, number> };
    };
    expect(status.worldRevision).toBe(1);
    expect(status.lastRun).not.toBeNull();
    expect(status.queue.counts.running).toBe(1);
    expect(status.nextWake?.reason).toBe('clock');
    await stub.pause({
      commandId: 'pause-active-cognition-lease-test',
      issuedAtMs: Date.now(),
    });
  });

  it('advances exactly one watch with deterministic fallback when providers are unavailable', async () => {
    const stub = env.HABITAT_WORLD.getByName('alarm-domain-fallback-test');
    await stub.resume({ commandId: 'resume-domain-fallback-test', issuedAtMs: Date.now() });
    await runInDurableObject(stub, async (_instance: HabitatWorld, state) => {
      const nowMs = Date.now();
      state.storage.sql.exec(
        `INSERT INTO provider_breakers (
           provider, open_until_ms, reason, failure_streak, updated_at_ms
         ) VALUES ('workers-ai', ?, 'test', 1, ?)`,
        nowMs + 60_000,
        nowMs,
      );
      state.storage.sql.exec(
        'UPDATE runtime_meta SET next_watch_at_ms = ? WHERE singleton = 1',
        0,
      );
      await state.storage.setAlarm(nowMs + 60_000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const status = await stub.getStatus() as unknown as {
      worldRevision: number;
      simTime: { day: number; minute: number };
      lastRun: { runId: string } | null;
      queue: { counts: Record<string, number> };
    };
    expect(status.worldRevision).toBe(1);
    expect(status.simTime).toEqual({ day: 100, minute: 360 });
    expect(status.lastRun?.runId).toBe('habitat-canonical:physical:100:1');
    expect(status.queue.counts).toEqual({});
    const snapshot = await stub.getSnapshot();
    expect(snapshot.snapshot.people).toHaveLength(25);
    expect(snapshot.snapshot.rooms).toHaveLength(48);
    await stub.pause({ commandId: 'pause-domain-fallback-test', issuedAtMs: Date.now() });
  });

  it('reads the population and all six hundred live bonds from the same revision without cognition', async () => {
    const before = await env.HABITAT_WORLD.getByName(env.HABITAT_ID).getStatus() as unknown as Record<string, unknown>;
    const response = await exports.default.fetch('https://habitat.test/v1/observer');
    const observer = await response.json() as { worldRevision: number; relationships: unknown[]; snapshot: { people: unknown[]; rooms: unknown[] } };
    expect(observer.worldRevision).toBe(before.worldRevision);
    expect(observer.relationships).toHaveLength(600);
    expect(observer.snapshot.people).toHaveLength(25);
    expect(observer.snapshot.rooms).toHaveLength(48);
    const after = await env.HABITAT_WORLD.getByName(env.HABITAT_ID).getStatus() as unknown as Record<string, unknown>;
    expect(after.worldRevision).toBe(before.worldRevision);
    expect(after.queue).toEqual(before.queue);
  });

  it('upgrades an existing SQLite world transactionally while preserving the original archive and backup', async () => {
    const stub = env.HABITAT_WORLD.getByName('legacy-layout-migration');
    await stub.getSnapshot();
    await runInDurableObject(stub, (instance, state) => {
      const sql = state.storage.sql;
      const serialized = JSON.stringify(legacyWorld());
      sql.exec('DELETE FROM _sql_schema_migrations WHERE version >= 4');
      sql.exec('DELETE FROM world_layout_backups WHERE migration >= 4');
      sql.exec('UPDATE world_state SET codec_version = 1, world_revision = 26, state_json = ? WHERE singleton = 1', serialized);
      sql.exec('UPDATE runtime_meta SET world_revision = 26, sim_day = 106, sim_minute = 720 WHERE singleton = 1');
      sql.exec(`INSERT INTO happenings (happening_id, world_revision, day, watch, minute, room_id, who_json, text, kind, committed_at_ms)
        VALUES ('old-life', 25, 105, 1, 8, 'hydroponics', '["V"]', 'The seedlings survived.', 'work', 1000)`);
      (instance as unknown as { migrateToV4(): void }).migrateToV4();
      const backup = sql.exec<{ state_json: string }>('SELECT state_json FROM world_layout_backups WHERE migration = 4').one();
      expect(backup.state_json).toBe(serialized);
      expect(sql.exec<{ room_id: string }>('SELECT room_id FROM happenings WHERE happening_id = ?', 'old-life').one().room_id)
        .toBe('hydroponics');
    });
    const observer = await stub.getObserver();
    expect(observer.worldRevision).toBe(26);
    expect(observer.snapshot).toMatchObject({ day: 106, watch: 3 });
    expect(observer.snapshot.rooms).toHaveLength(48);
    expect(observer.relationships.find((edge) => edge.from === 'A' && edge.to === 'B')?.axes.trust).toBe(91);
    const archive = await stub.getArchive({ day: 105, room: 'garden' });
    expect(archive.entries).toMatchObject([{ room: 'garden', sourceRoom: 'hydroponics', text: 'The seedlings survived.' }]);
  });

  it('backs up the economy migration byte-for-byte without changing revision, schedule or lives', async () => {
    const stub = env.HABITAT_WORLD.getByName('economy-migration');
    await stub.getObserver();
    await runInDurableObject(stub, (instance, state) => {
      const sql = state.storage.sql;
      const current = sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one();
      const previous = JSON.parse(current.state_json);
      previous.day = 106;
      previous.watch = 3;
      previous.bodies.A.cells = 27.321;
      delete previous.economy;
      for (const body of Object.values(previous.bodies) as Array<Record<string, unknown>>) {
        delete body.memory;
        delete body.lastThoughtWatch;
      for (const key of ['lastAttemptWatch', 'lastInteractionWatch', 'knownFacts', 'plan']) delete body[key];
      }
      const original = JSON.stringify(previous);
      sql.exec('DELETE FROM _sql_schema_migrations WHERE version = 5');
      sql.exec('DELETE FROM world_layout_backups WHERE migration = 5');
      sql.exec('UPDATE world_state SET codec_version = 2, world_revision = 26, state_json = ? WHERE singleton = 1', original);
      sql.exec('UPDATE runtime_meta SET world_revision = 26, sim_day = 106, sim_minute = 720 WHERE singleton = 1');
      const runtimeBefore = sql.exec('SELECT * FROM runtime_meta').one();
      const archiveBefore = sql.exec('SELECT * FROM happenings').toArray();
      (instance as unknown as { migrateToV5(): void }).migrateToV5();
      const backup = sql.exec<{ state_json: string; world_revision: number; codec_version: number }>('SELECT * FROM world_layout_backups WHERE migration = 5').one();
      expect(backup).toMatchObject({ state_json: original, world_revision: 26, codec_version: 2 });
      expect(sql.exec('SELECT * FROM runtime_meta').one()).toEqual(runtimeBefore);
      expect(sql.exec('SELECT * FROM happenings').toArray()).toEqual(archiveBefore);
      const migrated = sql.exec<{ state_json: string; world_revision: number; codec_version: number }>('SELECT * FROM world_state').one();
      expect(migrated).toMatchObject({ codec_version: 4, world_revision: 26 });
      const world = deserializeWorldState(migrated.state_json);
      expect(world.bodies.A.cells).toBe(27.321);
      expect([...world.axes]).toEqual(previous.axes);
      expect(world.economy).toMatchObject({ startedOnDay: 106, debts: [], treasury: 0,
        ledger: { minted: 0, burned: 0, leaked: 0 } });
    });
    const observer = await stub.getObserver();
    expect(observer.worldRevision).toBe(26);
    expect(observer.society.startedOnDay).toBe(106);
    expect(observer.society.balances).toHaveLength(25);
  });

  it('archives every committed happening and keeps the new day record honest', async () => {
    const stub = env.HABITAT_WORLD.getByName('daily-archive-test');
    await stub.resume({ commandId: 'resume-daily-archive-test', issuedAtMs: Date.now() });

    for (let watch = 1; watch <= 4; watch += 1) {
      await runInDurableObject(stub, async (_instance: HabitatWorld, state) => {
        const nowMs = Date.now();
        state.storage.sql.exec(
          `INSERT OR REPLACE INTO provider_breakers (
             provider, open_until_ms, reason, failure_streak, updated_at_ms
           ) VALUES ('workers-ai', ?, 'test', 1, ?)`,
          nowMs + 60_000,
          nowMs,
        );
        state.storage.sql.exec(
          'UPDATE runtime_meta SET next_watch_at_ms = ? WHERE singleton = 1',
          0,
        );
        await state.storage.setAlarm(nowMs + 60_000);
      });
      expect(await runDurableObjectAlarm(stub)).toBe(true);
    }

    const snapshot = await stub.getSnapshot();
    expect(snapshot.snapshot).toMatchObject({ day: 101, watch: 1, record: [] });

    const archive = await stub.getArchive({ day: 100 }) as unknown as {
      day: number;
      entries: Array<{
        day: number;
        watch: number;
        minute: number;
        room: string;
        who: string[];
        text: string;
        kind: string;
      }>;
    };
    expect(archive.day).toBe(100);
    expect(archive.entries.length).toBeGreaterThan(0);
    expect(new Set(archive.entries.map((entry) => entry.watch))).toEqual(new Set([1, 2, 3, 4]));
    expect(archive.entries.every((entry) => entry.day === 100)).toBe(true);

    const person = archive.entries[0]!.who[0]!;
    const personal = await stub.getArchive({ day: 100, person }) as unknown as {
      entries: Array<{ who: string[] }>;
    };
    expect(personal.entries.length).toBeGreaterThan(0);
    expect(personal.entries.every((entry) => entry.who.includes(person))).toBe(true);
    await stub.pause({ commandId: 'pause-daily-archive-test', issuedAtMs: Date.now() });
  });

  it('reserves quota before dispatch and settles each reservation once', async () => {
    const stub = env.HABITAT_WORLD.getByName('quota-idempotency-test');
    await stub.getStatus();

    await runInDurableObject(stub, async (_instance: HabitatWorld, state) => {
      const ledger = new SqlQuotaLedger(state.storage.sql, parseRuntimeConfig(env));
      const maximum = { requests: 1, inputTokens: 100, outputTokens: 20, neurons: 3 };
      const nowMs = Date.now();
      expect(ledger.reserve('quota:test:1', 'workers-ai', maximum, nowMs)).toEqual({
        allowed: true,
      });
      expect(ledger.reserve('quota:test:1', 'workers-ai', maximum, nowMs)).toMatchObject({
        allowed: false,
        reason: 'duplicate',
      });

      ledger.markDispatched('quota:test:1', nowMs);
      ledger.settle('quota:test:1', { inputTokens: 90, outputTokens: 10, neurons: 2 }, nowMs);
      ledger.settle('quota:test:1', { inputTokens: 90, outputTokens: 10, neurons: 2 }, nowMs);
      const usage = state.storage.sql.exec<{
        requests: number;
        actual_requests: number;
        actual_neurons: number;
      }>(
        `SELECT requests, actual_requests, actual_neurons
         FROM provider_usage_daily WHERE provider = 'workers-ai'`,
      ).one();
      expect(usage).toEqual({ requests: 1, actual_requests: 1, actual_neurons: 2 });
    });
  });
});
