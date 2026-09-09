import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createGenesisWorld } from '../src/domain';
import { createSocietyState } from '../../../src/lib/habitat/society/index';
import { prepareSocietyJob } from '../src/society-scheduler';
import { buildProviderRejectionDiagnostic } from '../src/providers/shared';
import type { ProviderAttemptResult, ProviderRejectionDiagnostic } from '../src/contracts';
import { REJECTION_RETENTION, saveProviderRejection } from '../src/rejection-log';
import { sealRecoveryExport, verifyRecoveryBundle } from '../src/checkpoint';
import type { RecoveryManifest, RecoveryPage } from '../src/recovery';

type FailedAttempt = Extract<ProviderAttemptResult, { ok: false }>;
type Internal = { saveAttempt(result: ProviderAttemptResult, nowMs: number): void };
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
async function rejection(id: string, candidate = '<think>private discarded thought</think>{bad JSON'): Promise<FailedAttempt> {
  const world = createGenesisWorld(), state = createSocietyState(world, 1000);
  const { job } = prepareSocietyJob({ state, world, actor: 'A', sequence: 1, nowMs: 2000, generation: 0,
    worldRevision: 0, habitatId: 'rejection-fixture', protocolVersion: 6 });
  const diagnostic = await buildProviderRejectionDiagnostic({ job, attemptId: id, provider: 'workers-ai', model: 'offline-fixture',
    selected: { value: candidate, source: 'workers_ai_binding', selectedField: 'response', finishReason: 'stop',
      systemMessage: job.prompt.system, userMessage: job.prompt.user } },
  { stage: 'parse', phase: 'content_json', code: 'invalid_content_json' });
  return { ok: false, attemptId: id, provider: 'workers-ai', model: 'offline-fixture', kind: 'invalid-response',
    retryable: true, latencyMs: 5, usage: { inputTokens: 10, outputTokens: 5 }, diagnostic };
}
const attemptWithId = (result: FailedAttempt, id: string): FailedAttempt => ({ ...result, attemptId: id,
  diagnostic: { ...result.diagnostic!, attemptId: id } });

describe('bounded private provider rejection evidence', () => {
  it('stores exact rejected content privately once, with validated recovery and tamper detection', async () => {
    const stub = env.HABITAT_WORLD.getByName('rejection-private'); await stub.getObserver();
    const result = await rejection('private-attempt');
    await runInDurableObject(stub, (instance, durable) => {
      const internal = instance as unknown as Internal, now = Date.now();
      internal.saveAttempt(result, now); internal.saveAttempt(result, now + 1);
      const rows = durable.storage.sql.exec<{ diagnostic_json: string; recorded_at_ms: number }>('SELECT * FROM provider_rejections').toArray();
      expect(rows).toHaveLength(1); expect(rows[0]!.recorded_at_ms).toBe(now);
      expect(JSON.parse(rows[0]!.diagnostic_json)).toEqual(result.diagnostic);
      expect(durable.storage.sql.exec('SELECT * FROM provider_attempts').toArray()).toHaveLength(1);
    });
    const publicJson = JSON.stringify([await stub.getObserver(), await stub.getStatus()]);
    expect(publicJson).not.toContain('discarded thought'); expect(publicJson).not.toContain('schemaJson');
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    const verified = verifyRecoveryBundle(core, []);
    expect(verified.tables.provider_rejections).toHaveLength(1);
    const tables = structuredClone(core.tables) as Record<string, Array<Record<string, unknown>>>;
    const row = tables.provider_rejections![0]!;
    const diagnostic = JSON.parse(row.diagnostic_json as string) as ProviderRejectionDiagnostic;
    diagnostic.candidate.text = diagnostic.candidate.text!.replace('private', 'changed');
    row.diagnostic_json = JSON.stringify(diagnostic); row.byte_count = new TextEncoder().encode(row.diagnostic_json as string).length;
    const { exportSha256: _checksum, ...payload } = core; expect(_checksum).toBeDefined();
    expect(() => verifyRecoveryBundle(sealRecoveryExport({ ...payload, tables }), [])).toThrow('rejection content');
  });

  it('keeps accounting if diagnostic validation or its optional SQL storage fails', async () => {
    const stub = env.HABITAT_WORLD.getByName('rejection-failure'); await stub.getObserver();
    const result = await rejection('invalid-evidence');
    result.diagnostic!.candidate.sha256 = '0'.repeat(64);
    await runInDurableObject(stub, (instance, durable) => {
      const internal = instance as unknown as Internal;
      expect(() => internal.saveAttempt(result, Date.now())).not.toThrow();
      expect(durable.storage.sql.exec('SELECT * FROM provider_rejections').toArray()).toHaveLength(0);
      durable.storage.sql.exec('DROP TABLE provider_rejections');
      expect(() => internal.saveAttempt(attemptWithId(result, 'missing-evidence-table'), Date.now())).not.toThrow();
      expect(durable.storage.sql.exec('SELECT * FROM provider_attempts').toArray()).toHaveLength(2);
      expect(durable.storage.sql.exec("SELECT * FROM runtime_events WHERE type='provider.diagnostic.unavailable'").toArray()).toHaveLength(2);
    });
  });

  it('enforces both row and serialized-byte caps and preserves frozen evidence after live expiry', async () => {
    const stub = env.HABITAT_WORLD.getByName('rejection-retention'); await stub.getObserver();
    const result = await rejection('retention');
    const large = await rejection('large', '\0'.repeat(64 * 1024));
    const schemaJson = JSON.stringify({ description: '\0'.repeat(30000) });
    large.diagnostic!.contract = { ...large.diagnostic!.contract, schemaJson, schemaSha256: hash(schemaJson),
      schemaBytes: new TextEncoder().encode(schemaJson).length, schemaComplete: true };
    await runInDurableObject(stub, (_instance, durable) => {
      const sql = durable.storage.sql, now = Date.now();
      for (let i = 0; i < 70; i++) saveProviderRejection(sql, attemptWithId(result, `small-${i}`), now);
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) n FROM provider_rejections').one().n).toBe(64);
      expect(sql.exec('SELECT attempt_id FROM provider_rejections ORDER BY sequence LIMIT 1').one()).toEqual({ attempt_id: 'small-6' });
      sql.exec('DELETE FROM provider_rejections');
      for (let i = 0; i < 36; i++) saveProviderRejection(sql, attemptWithId(large, `large-${i}`), now);
      const stored = sql.exec<{ n: number; bytes: number }>('SELECT COUNT(*) n,SUM(byte_count) bytes FROM provider_rejections').one();
      expect(stored.n).toBeGreaterThan(1); expect(stored.n).toBeLessThan(36); expect(stored.bytes).toBeLessThanOrEqual(REJECTION_RETENTION.bytes);
      sql.exec('DELETE FROM provider_rejections');
      saveProviderRejection(sql, attemptWithId(result, 'frozen-private'), now);
      for (let i = 0; i < 130; i++) sql.exec("INSERT INTO runtime_events(type,occurred_at_ms,detail_json) VALUES('fixture',?,'{}')", i);
    });
    const core = await stub.getRecoveryExport() as Record<string, unknown>;
    expect(core.complete).toBe(false);
    await runInDurableObject(stub, (_instance, durable) => {
      saveProviderRejection(durable.storage.sql, { ok: true, provider: 'workers-ai', model: 'offline-fixture',
        attemptId: 'next-success', payload: {}, usage: {}, latencyMs: 1 }, Date.now() + REJECTION_RETENTION.ageMs + 1);
      expect(durable.storage.sql.exec('SELECT * FROM provider_rejections').toArray()).toHaveLength(0);
    });
    const pages: RecoveryPage[] = [];
    for (const item of core.manifest as RecoveryManifest[]) {
      let afterRowId: number | null = -1;
      while (afterRowId !== null) {
        const page: RecoveryPage = await stub.getRecoveryPage({ table: item.table, upperRowId: item.upperRowId,
          excludedRowIds: item.excludedRowIds, cutId: item.cutId, exportedAtMs: core.exportedAtMs as number, afterRowId });
        pages.push(page); afterRowId = page.nextAfterRowId;
      }
    }
    expect(verifyRecoveryBundle(core, pages).tables.provider_rejections![0]!.attempt_id).toBe('frozen-private');
  });
});
