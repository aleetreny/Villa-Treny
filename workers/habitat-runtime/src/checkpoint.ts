import { verifyRecoveryPage, type RecoveryManifest, type recoveryPage } from './recovery';
import { createHash } from 'node:crypto';
import { deserializeWorldState, WORLD_CODEC_VERSION } from './domain';
export const RULES_VERSION = 'villa-society-v6';
export type Checkpoint = { codecVersion: number; rulesVersion: string; worldRevision: number; stateJson: string; sha256: string };
export function makeCheckpoint(worldRevision: number, stateJson: string): Checkpoint {
  deserializeWorldState(stateJson);
  const payload = { codecVersion: WORLD_CODEC_VERSION, rulesVersion: RULES_VERSION, worldRevision, stateJson };
  return { ...payload, sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
export function verifyCheckpoint(checkpoint: Checkpoint) {
  if (checkpoint.codecVersion !== WORLD_CODEC_VERSION || checkpoint.rulesVersion !== RULES_VERSION
    || !Number.isInteger(checkpoint.worldRevision) || checkpoint.worldRevision < 0
    || createHash('sha256').update(JSON.stringify({ codecVersion: checkpoint.codecVersion, rulesVersion: checkpoint.rulesVersion, worldRevision: checkpoint.worldRevision, stateJson: checkpoint.stateJson })).digest('hex') !== checkpoint.sha256) {
    throw new TypeError('Checkpoint checksum, version or revision is invalid');
  }
  return deserializeWorldState(checkpoint.stateJson);
}

export function sealRecoveryExport(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload, exportSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
export function verifyRecoveryExport(value: Record<string, unknown>) {
  const { exportSha256, ...payload } = value;
  if (payload.format !== 'villa-recovery-v1' || typeof exportSha256 !== 'string'
    || createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== exportSha256) throw new TypeError('Recovery export checksum is invalid');
  const checkpoint = payload.checkpoint as Checkpoint;
  const world = verifyCheckpoint(checkpoint);
  const tables = payload.tables as Record<string, Array<Record<string, unknown>>>;
  const runtime = tables.runtime_meta?.[0];
  if (!runtime || runtime.world_revision !== checkpoint.worldRevision || runtime.sim_day !== world.day
    || runtime.sim_minute !== (world.watch - 1) * 360) throw new TypeError('Recovery world and scheduler revisions differ');
  return { world, worldRevision: checkpoint.worldRevision, runtime, tables, complete: payload.complete !== false, manifest: payload.manifest ?? [] };
}

/** Client-side verification after downloading the immutable pages. A partial
 * core alone is a state checkpoint, never a claim that all history was backed up. */
export function verifyRecoveryBundle(core: Record<string, unknown>, pages: Array<ReturnType<typeof recoveryPage>>) {
  const restored = verifyRecoveryExport(core);
  const manifest = restored.manifest as RecoveryManifest[];
  const tables = { ...restored.tables };
  if (restored.complete && pages.length) throw new TypeError('Complete export needs no additional pages');
  for (const item of manifest) {
    const selected = pages.filter((page) => page.table === item.table).sort((a, b) => a.afterRowId - b.afterRowId);
    let cursor: number | null = -1, count = 0;
    const rows: Array<Record<string, unknown>> = [];
    for (const raw of selected) {
      const page = verifyRecoveryPage(raw);
      if (cursor === null || page.afterRowId !== cursor || page.upperRowId !== item.upperRowId
        || page.exportedAtMs !== core.exportedAtMs || JSON.stringify(page.excludedRowIds) !== JSON.stringify(item.excludedRowIds)) throw new TypeError('Recovery pages belong to different cuts or overlap');
      rows.push(...page.rows); count += page.rows.length; cursor = page.nextAfterRowId;
    }
    if (cursor !== null || count !== item.count) throw new TypeError(`Recovery history is incomplete for ${item.table}: expected ${item.count}, received ${count}`);
    tables[item.table] = [...(tables[item.table] ?? []), ...rows];
  }
  if (pages.some((page) => !manifest.some((item) => item.table === page.table))) throw new TypeError('Unexpected recovery table');
  return { ...restored, complete: true, tables };
}
