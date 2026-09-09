import { env } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';
import { createGenesisWorld, serializeWorldState, deserializeWorldState, prepareCognition, selectCognitionSubject, advanceWorldWatch, worldRelationships } from '../src/domain';
import { routeCognition } from '../src/providers/router';
import { parseRuntimeConfig } from '../src/contracts';
import { attempt } from '../../../src/lib/habitat/engine/verbs';
import { held } from '../../../src/lib/habitat/engine/state';
import { FACTS } from '../../../src/lib/habitat/engine/knowledge';
import { makeCheckpoint, verifyCheckpoint, verifyRecoveryExport } from '../src/checkpoint';

async function due(stub: DurableObjectStub<import('../src/habitat-world').HabitatWorld>) {
  await runInDurableObject(stub, async (_instance, state) => {
    const now = Date.now();
    state.storage.sql.exec('UPDATE runtime_meta SET next_watch_at_ms=?, next_alarm_at_ms=?', now - 1000, now - 1000);
    for (const provider of ['workers-ai', 'groq']) state.storage.sql.exec('INSERT OR REPLACE INTO provider_breakers(provider,open_until_ms,reason,failure_streak,updated_at_ms) VALUES(?,?,?,?,?)', provider, now + 86400000, 'authentication', 1, now);
    await state.storage.setAlarm(now - 1000);
  });
}

describe('audited persistence and cognition boundaries', () => {
  it('rotates all residents even when every cognition attempt fails', () => {
    const world = createGenesisWorld(), selected = new Map<string, number>();
    for (let watch = 0; watch < 360; watch++) {
      const actor = selectCognitionSubject(world);
      if (selected.has(actor)) expect(watch - selected.get(actor)!).toBeLessThanOrEqual(38);
      selected.set(actor, watch);
      advanceWorldWatch(world, undefined, actor);
      if (watch === 37) expect(selected.size).toBe(25);
    }
    expect(selected.size).toBe(25);
  });

  it.each(['identity', 'anchor', 'thought', 'attempt', 'economyCalendar', 'transaction', 'eventCalendar', 'eventParticipants'])('rejects invalid %s without rewriting a current world', (mutation) => {
    const world = JSON.parse(serializeWorldState(createGenesisWorld()));
    if (mutation === 'identity') world.bodies.A.id = 'B';
    if (mutation === 'anchor') world.bodies.A.at = { x: 9999, y: 9999 };
    if (mutation === 'thought') world.bodies.A.lastThoughtWatch = 9999;
    if (mutation === 'attempt') world.bodies.A.lastAttemptWatch = 9999;
    if (mutation === 'economyCalendar') world.economy.startedOnDay = 900;
    if (mutation.startsWith('event')) world.record = [{ day: mutation === 'eventCalendar' ? 150 : 100, watch: 1, minute: 8, room: 'common', who: mutation === 'eventParticipants' ? ['A', 'A'] : ['A'], text: 'A real event.', kind: 'note' }];
    if (mutation === 'transaction') { world.economy.nextEventSequence = 1; world.economy.events = [{ sequence: 0, day: 100, watch: 1, action: 'work', entries: [{ account: 'cells:unknown', delta: 1 }] }]; }
    expect(() => deserializeWorldState(JSON.stringify(world))).toThrow();
  });

  it('keeps unknown secrets out of the entire prompt, including the output schema', () => {
    for (const id of Object.keys(createGenesisWorld().bodies) as Array<keyof ReturnType<typeof createGenesisWorld>['bodies']>) {
      const state = createGenesisWorld(); state.bodies[id].lastAttemptWatch = 0;
      const prepared = prepareCognition({ state, worldRevision: 0, habitatId: 'test', runId: 'test', createdAtMs: 1, controlRevision: 1 });
      expect(prepared.actor).toBe(id);
      const entire = JSON.stringify(prepared.job);
      expect(entire).not.toContain('heldBy');
      for (const [key, fact] of Object.entries(FACTS)) if (fact.private && fact.owner !== id) {
        expect(entire, `${id} cannot know ${key}`).not.toContain(key);
        expect(entire).not.toContain(fact.text);
      }
      if (id === 'Q') expect(entire).not.toContain('the reason was admiration');
    }
  });

  it('resolves a latent edge only after its real, explicit disclosure', () => {
    const world = createGenesisWorld(); held(world, 'E', 'B').trust = 90;
    expect(worldRelationships(world).find((edge) => edge.from === 'E' && edge.to === 'B')?.latent).toBe(true);
    expect(attempt(world, { actor: 'E', verb: 'confide', target: 'B', fact: 'secret:E:B:E' }).ok).toBe(true);
    expect(worldRelationships(world).find((edge) => edge.from === 'E' && edge.to === 'B')?.latent).toBe(false);
    expect(worldRelationships(world).find((edge) => edge.from === 'G' && edge.to === 'L')?.latent).toBe(true);
  });

  it('does not reveal another mind through the list of proposed targets', () => {
    const state = createGenesisWorld(); state.bodies.A.lastAttemptWatch = 0;
    const prepare = () => JSON.parse(prepareCognition({ state, worldRevision: 0, habitatId: 'test', runId: 'test', createdAtMs: 1, controlRevision: 1 }).job.prompt.user).possibleActions;
    const before = prepare(); held(state, 'B', 'A').resentment = 100; held(state, 'B', 'A').desire = 100;
    expect(prepare()).toEqual(before);
  });

  it('marks invalid provider-domain output as failure and preserves both failover attempts', async () => {
    const prepared = prepareCognition({ state: createGenesisWorld(), worldRevision: 0, habitatId: 'test', runId: 'test', createdAtMs: 1, controlRevision: 1 });
    const groqFetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ verb: 'observe', room: null, target: null, fact: null }) } }], usage: { prompt_tokens: 50, completion_tokens: 12 } }), { headers: { 'content-type': 'application/json' } }));
    const quota = { reserve: () => ({ allowed: true }), markDispatched: vi.fn(), recordOutcome: vi.fn(), settle: vi.fn() };
    const result = await routeCognition({ ai: { run: async () => ({ choices: [{ message: { content: '{"verb":"not_a_verb","room":null,"target":null}' } }] }) },
      groqApiKey: 'fake-test-key', config: parseRuntimeConfig(env), job: prepared.job, attemptOrdinal: 1, quota: quota as never, groqFetch });
    expect(groqFetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.attempts).toMatchObject([{ ok: false, detailCode: 'invalid_domain_intent' }, { ok: true, provider: 'groq' }]);
  });

  it('commits a one-water crisis instead of rolling back the whole scheduled world', async () => {
    const stub = env.HABITAT_WORLD.getByName('v6-water');
    await stub.resume({ commandId: 'v6-water-resume', issuedAtMs: Date.now() });
    await runInDurableObject(stub, (_instance, state) => {
      const world = deserializeWorldState(state.storage.sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
      world.economy.stock = { produce: 0, meals: 0, water: 1, materials: 16 };
      for (const body of Object.values(world.bodies)) body.condition.fed = 20;
      state.storage.sql.exec('UPDATE world_state SET state_json=?', serializeWorldState(world));
    });
    await due(stub); await runDurableObjectAlarm(stub);
    const status = await stub.getStatus() as Record<string, unknown>;
    expect(status.worldRevision).toBe(1); expect(status.lastErrorCode).toBeNull(); expect(status.health).toBe('healthy');
    expect(status.lastSuccessfulWatchAtMs).toEqual(expect.any(Number));
    const exported = await stub.getRecoveryExport();
    const restored = verifyRecoveryExport(exported);
    expect(restored.worldRevision).toBe(1); expect(Object.keys(restored.world.bodies)).toHaveLength(25);
    expect(restored.tables.economic_events!.length).toBeGreaterThan(0);
    expect(restored.tables.quota_reservations).toBeDefined();
  });

  it('reports a failed overdue world as degraded despite a retry alarm', async () => {
    const stub = env.HABITAT_WORLD.getByName('v6-stalled');
    await stub.resume({ commandId: 'v6-stalled-resume', issuedAtMs: Date.now() });
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec("UPDATE runtime_meta SET next_watch_at_ms=?,last_error_code='RangeError'", Date.now() - 300000);
      await state.storage.setAlarm(Date.now() + 900000);
    });
    expect(await stub.getStatus()).toMatchObject({ health: 'degraded', lastErrorCode: 'RangeError' });
  });

  it('verifies exact checkpoint recovery and rejects a tampered world', () => {
    const original = createGenesisWorld(); advanceWorldWatch(original, { actor: 'A', verb: 'observe' });
    const checkpoint = makeCheckpoint(1, serializeWorldState(original));
    expect(verifyCheckpoint(checkpoint)).toEqual(original);
    expect(() => verifyCheckpoint({ ...checkpoint, worldRevision: 2 })).toThrow();
    expect(() => verifyCheckpoint({ ...checkpoint, stateJson: checkpoint.stateJson.replace('records', 'garden') })).toThrow();
  });

  it('backs up codec3 byte-for-byte before adding cognition, knowledge and transaction metadata', async () => {
    const stub = env.HABITAT_WORLD.getByName('v6-migration'); await stub.getObserver();
    await runInDurableObject(stub, (instance, state) => {
      const sql = state.storage.sql, value = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
      for (const body of Object.values(value.bodies) as Array<Record<string, unknown>>) for (const key of ['lastAttemptWatch', 'lastInteractionWatch', 'knownFacts', 'plan']) delete body[key];
      delete value.economy.events; delete value.economy.nextEventSequence;
      const old = JSON.stringify(value), runtime = sql.exec('SELECT * FROM runtime_meta').one();
      sql.exec('UPDATE world_state SET codec_version=3,state_json=?', old);
      sql.exec('DELETE FROM world_layout_backups WHERE migration=6'); sql.exec('DELETE FROM _sql_schema_migrations WHERE version=6');
      sql.exec('DROP TABLE economic_events'); sql.exec('DROP TABLE world_checkpoints');
      (instance as unknown as { migrateToV6(): void }).migrateToV6();
      expect(sql.exec<{ state_json: string }>('SELECT state_json FROM world_layout_backups WHERE migration=6').one().state_json).toBe(old);
      expect(sql.exec('SELECT * FROM runtime_meta').one()).toEqual(runtime);
      const current = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
      for (const [id, body] of Object.entries(value.bodies)) expect(current.bodies[id as keyof typeof current.bodies]).toMatchObject(body as object);
      expect([...current.axes]).toEqual(value.axes); expect(current.economy.ledger).toEqual(value.economy.ledger);
      expect(sql.exec('SELECT * FROM world_checkpoints').toArray()).toHaveLength(1);
    });
  });
});

describe('bounded recovery archives', () => {
  it('exports a mutable core and paginates an immutable cut without newer rows or silent truncation', async () => {
    const { verifyRecoveryBundle } = await import('../src/checkpoint');
    const stub = env.HABITAT_WORLD.getByName('v6-recovery-pages'); await stub.getObserver();
    await runInDurableObject(stub, (_instance, state) => {
      for (let index = 0; index < 260; index++) state.storage.sql.exec('INSERT INTO runtime_events(type,occurred_at_ms,detail_json) VALUES(?,?,?)', 'test.archive', index, JSON.stringify({ index }));
      state.storage.sql.exec('INSERT INTO admin_commands VALUES (?,?,?,?)', 'pending-check', 'cognition-check', Date.now(), JSON.stringify({ status: 'pending' }));
      state.storage.sql.exec('INSERT INTO admin_commands VALUES (?,?,?,?)', 'closed-pause', 'pause', Date.now(), JSON.stringify({ mode: 'paused' }));
    });
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    expect(core.complete).toBe(false);
    const manifest = core.manifest as Array<{ table: import('../src/recovery').RecoveryTable; upperRowId: number; count: number; excludedRowIds: number[] }>;
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec('INSERT INTO runtime_events(type,occurred_at_ms,detail_json) VALUES(?,?,?)', 'after.cut', Date.now(), '{}');
      state.storage.sql.exec('UPDATE admin_commands SET response_json=? WHERE command_id=?', JSON.stringify({ status: 'complete' }), 'pending-check');
    });
    const pages: Array<ReturnType<typeof import('../src/recovery').recoveryPage>> = [];
    for (const item of manifest) {
      let cursor: number | null = -1;
      while (cursor !== null) {
        const page: ReturnType<typeof import('../src/recovery').recoveryPage> = await stub.getRecoveryPage({ table: item.table, upperRowId: item.upperRowId, excludedRowIds: item.excludedRowIds, afterRowId: cursor, exportedAtMs: core.exportedAtMs as number });
        expect(page.rows.length).toBeLessThanOrEqual(128); pages.push(page); cursor = page.nextAfterRowId;
      }
    }
    expect(() => verifyRecoveryBundle(core, pages.slice(1))).toThrow();
    const restored = verifyRecoveryBundle(core, pages);
    expect(restored.complete).toBe(true);
    expect(restored.tables.runtime_events!.some((row) => row.type === 'after.cut')).toBe(false);
    expect(restored.tables.runtime_events!.filter((row) => row.type === 'test.archive')).toHaveLength(260);
    expect(restored.tables.admin_commands!.find((row) => row.command_id === 'pending-check')?.response_json).toBe(JSON.stringify({ status: 'pending' }));
    expect(restored.tables.admin_commands!.some((row) => row.command_id === 'closed-pause')).toBe(true);
    expect(() => verifyRecoveryBundle(core, [...pages, pages[0]!])).toThrow();
  });
});
