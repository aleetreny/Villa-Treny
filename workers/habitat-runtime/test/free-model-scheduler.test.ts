import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SocietyState } from '../../../src/lib/habitat/society/index';
import { cognitionJobSchema, parseRuntimeConfig, type CognitionJob, type RuntimeConfig } from '../src/contracts';
import { deserializeWorldState } from '../src/domain';
import * as router from '../src/providers/router';
import { prepareSocietyJob } from '../src/society-scheduler';

const NOW = Date.parse('2026-09-08T19:00:00Z');
type Internal = {
  config: RuntimeConfig;
  runtimeEnv: Record<string, unknown>;
  prepareNextSocietyJob(nowMs: number): Promise<string | undefined>;
  processSocietyJob(jobId: string, nowMs: number): Promise<void>;
};

function isolatedConfig(enabled?: 'true' | 'false') {
  const values: Record<string, unknown> = { ...env };
  delete values.GROQ_120B_ENABLED;
  if (enabled !== undefined) values.GROQ_120B_ENABLED = enabled;
  return parseRuntimeConfig(values);
}

function installRuntime(instance: unknown, sql: SqlStorage, enabled?: 'true' | 'false') {
  const runtime = instance as Internal;
  runtime.config = isolatedConfig(enabled);
  runtime.runtimeEnv = { ...runtime.runtimeEnv, GROQ_API_KEY: '',
    AI: { run: () => { throw new Error('unexpected model I/O in isolated scheduler test'); } } };
  // Set only the disposable test object running; no administrative request,
  // installed alarm, published habitat or production control is used.
  sql.exec("UPDATE runtime_meta SET mode='running',next_cognition_at_ms=?", NOW);
  return runtime;
}

function persistedJob(sql: SqlStorage, id: string) {
  return cognitionJobSchema.parse(JSON.parse(sql.exec<{ envelope_json: string }>(
    'SELECT envelope_json FROM cognition_jobs WHERE job_id=?', id).one().envelope_json));
}

describe('free-model scheduler integration in disposable Durable Objects', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it.each(['default', 'false', 'true'] as const)('marks only newly prepared P8 jobs with configuration %s', async flag => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const routed = vi.spyOn(router, 'routeCognition').mockRejectedValue(new Error('preparation must not route'));
    const stub = env.HABITAT_WORLD.getByName(`free-route-new-jobs-${flag}`);
    await runInDurableObject(stub, async (instance, storage) => {
      const sql = storage.storage.sql, runtime = installRuntime(instance, sql, flag === 'default' ? undefined : flag);
      const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
      const society = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState;
      const meta = sql.exec<{ world_revision: number; control_revision: number }>('SELECT world_revision,control_revision FROM runtime_meta').one();
      // Real older producer envelopes, preserving distinct bytes and saved
      // protocol dispatch. Existing pending jobs occupy their own residents.
      for (const [actor, sequence, protocolVersion] of [['Y', 40, 4], ['X', 41, 6]] as const) {
        const prior = prepareSocietyJob({ state: society, world, actor, sequence, protocolVersion,
          nowMs: NOW - 1000, generation: meta.control_revision, worldRevision: meta.world_revision,
          habitatId: runtime.config.HABITAT_ID });
        expect(prior.job.routingPolicy).toBeUndefined();
        sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,?)',
          sequence, prior.job.jobId, actor, JSON.stringify(prior.turn, null, 2), prior.turn.generation);
        sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts)
          VALUES(?,?,'pending',?,?,?,0)`, prior.job.jobId, JSON.stringify(prior.job, null, 2),
        prior.job.pressure, NOW - 1000, NOW - 1000);
      }
      const jobsBefore = sql.exec('SELECT * FROM cognition_jobs ORDER BY job_id').toArray();
      const contextsBefore = sql.exec('SELECT * FROM cognition_contexts ORDER BY sequence').toArray();
      const worldBefore = sql.exec('SELECT * FROM world_state').toArray();
      const societyBefore = sql.exec('SELECT * FROM society_state').toArray();
      const id = await runtime.prepareNextSocietyJob(NOW);
      expect(id).toBeDefined();
      const saved = persistedJob(sql, id!);
      expect(saved.outputContract).toMatchObject({ name: 'society_turn', version: 8 });
      expect(saved.routingPolicy).toBe(flag === 'true' ? 'free-models-v1' : undefined);
      expect(Object.hasOwn(saved, 'routingPolicy')).toBe(flag === 'true');
      expect(sql.exec('SELECT * FROM cognition_jobs WHERE job_id<>? ORDER BY job_id', id!).toArray()).toEqual(jobsBefore);
      expect(sql.exec('SELECT * FROM cognition_contexts WHERE job_id<>? ORDER BY sequence', id!).toArray()).toEqual(contextsBefore);
      expect(sql.exec('SELECT * FROM world_state').toArray()).toEqual(worldBefore);
      expect(sql.exec('SELECT * FROM society_state').toArray()).toEqual(societyBefore);
      expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual([]);
      expect(sql.exec('SELECT * FROM provider_attempts').toArray()).toEqual([]);
      expect(sql.exec<{ status: string; attempts: number }>('SELECT status,attempts FROM cognition_jobs WHERE job_id=?', id!).one())
        .toEqual({ status: 'pending', attempts: 0 });
      expect(routed).not.toHaveBeenCalled();
    });
  });

  it.each(['lease-replaced', 'lease-expired', 'turn-expired'] as const)(
    'passes a bounded deadline and invalidates dispatch after %s without a control or mind change', async change => {
      let clock = NOW;
      vi.spyOn(Date, 'now').mockImplementation(() => clock);
      const stub = env.HABITAT_WORLD.getByName(`free-route-lease-${change}`);
      await runInDurableObject(stub, async (instance, storage) => {
        const sql = storage.storage.sql, runtime = installRuntime(instance, sql, 'true');
        const id = await runtime.prepareNextSocietyJob(NOW);
        expect(id).toBeDefined();
        const preparedRow = sql.exec<{ prepared_json: string }>('SELECT prepared_json FROM cognition_contexts WHERE job_id=?', id!).one();
        const turn = JSON.parse(preparedRow.prepared_json) as { actor: string; mindRevision: number; expiresAtMs: number };
        if (change === 'turn-expired') {
          turn.expiresAtMs = NOW + 90_000;
          sql.exec('UPDATE cognition_contexts SET prepared_json=? WHERE job_id=?', JSON.stringify(turn), id!);
        }
        let received: CognitionJob | undefined;
        let replacementLeaseRow: unknown;
        const routed = vi.spyOn(router, 'routeCognition').mockImplementation(async request => {
          received = request.job;
          const lease = sql.exec<{ status: string; lease_expires_at_ms: number; attempts: number }>(
            'SELECT status,lease_expires_at_ms,attempts FROM cognition_jobs WHERE job_id=?', id!).one();
          expect(lease).toEqual({ status: 'running', attempts: 1, lease_expires_at_ms: NOW + 120_000 });
          expect(request.deadlineAtMs).toBe(Math.min(lease.lease_expires_at_ms, turn.expiresAtMs) - 10_000);
          expect(request.canDispatch?.()).toBe(true);
          const controlBefore = sql.exec('SELECT mode,control_revision FROM runtime_meta').one();
          const mindBefore = sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json;
          expect((JSON.parse(mindBefore) as SocietyState).minds[turn.actor as keyof SocietyState['minds']].revision).toBe(turn.mindRevision);
          if (change === 'lease-replaced') {
            sql.exec('UPDATE cognition_jobs SET lease_expires_at_ms=? WHERE job_id=?', lease.lease_expires_at_ms + 1, id!);
            replacementLeaseRow = sql.exec('SELECT * FROM cognition_jobs WHERE job_id=?', id!).one();
          } else clock = change === 'lease-expired' ? lease.lease_expires_at_ms : turn.expiresAtMs;
          expect(sql.exec('SELECT mode,control_revision FROM runtime_meta').one()).toEqual(controlBefore);
          expect(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json).toBe(mindBefore);
          expect(request.canDispatch?.()).toBe(false);
          // No provider or validation callback is invoked. This is the router's
          // refusal shape after its caller's dispatch control is invalidated.
          return { status: 'rejected', reasons: [] };
        });
        await runtime.processSocietyJob(id!, NOW);
        expect(routed).toHaveBeenCalledTimes(1);
        expect(received).toMatchObject({ routingPolicy: 'free-models-v1', outputContract: { version: 8 } });
        expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual([]);
        expect(sql.exec('SELECT * FROM provider_attempts').toArray()).toEqual([]);
        expect(sql.exec('SELECT * FROM physical_runs').toArray()).toEqual([]);
        if (change === 'lease-replaced') {
          // The old claimant's refusal must not retire the row now owned by a
          // different lease, even when generation and mind revision still match.
          expect(JSON.stringify(sql.exec('SELECT * FROM cognition_jobs WHERE job_id=?', id!).one()) === JSON.stringify(replacementLeaseRow),
            'the replacement lease must retain every original job field').toBe(true);
        }
      });
    });
});
