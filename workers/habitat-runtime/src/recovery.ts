import { createHash } from 'node:crypto';
import { z } from 'zod';

export const RECOVERY_TABLES = ['runtime_meta', 'watch_runs', 'cognition_jobs', 'provider_attempts', 'happenings',
  'happening_people', 'economic_events', 'world_checkpoints', 'world_layout_backups', '_sql_schema_migrations',
  'quota_reservations', 'provider_usage_daily', 'provider_breakers', 'alarm_runs', 'admin_commands', 'runtime_events'] as const;
export type RecoveryTable = typeof RECOVERY_TABLES[number];
export type RecoveryManifest = { table: RecoveryTable; upperRowId: number; count: number; excludedRowIds: number[] };
export const recoveryPageSchema = z.strictObject({ table: z.enum(RECOVERY_TABLES), upperRowId: z.number().int().nonnegative(),
  afterRowId: z.number().int().min(-1).default(-1), exportedAtMs: z.number().int().positive().max(8_000_000_000_000),
  excludedRowIds: z.array(z.number().int().nonnegative()).max(128).default([]) });
export type RecoveryPageRequest = z.infer<typeof recoveryPageSchema>;
type Row = Record<string, SqlStorageValue> & { _exportRowId: number };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

/** Closed jobs, attempts and journals never change. Billing older than two UTC
 * days is beyond the bounded provider deadline and belongs to the archive. */
function mutableWhere(table: RecoveryTable, atMs: number): string {
  const day = new Date(atMs - 86400000).toISOString().slice(0, 10);
  switch (table) {
    case 'runtime_meta': case 'provider_breakers': return '1=1';
    case 'watch_runs': return "phase='claimed'";
    case 'cognition_jobs': return "status NOT IN ('applied','dead')";
    case 'alarm_runs': return "phase IN ('claimed','tick-committed')";
    case 'admin_commands': return "COALESCE(json_extract(response_json, '$.status'), '')='pending'";
    case 'quota_reservations': case 'provider_usage_daily': return `day >= '${day}'`;
    default: return '0=1';
  }
}
export function recoveryCore(sql: SqlStorage, atMs: number) {
  const tables: Record<string, Row[]> = {}, manifest: RecoveryManifest[] = [];
  let totalBytes = 0;
  for (const table of RECOVERY_TABLES) {
    const where = mutableWhere(table, atMs);
    const core: Row[] = [];
    for (const row of sql.exec<Row>(`SELECT rowid AS _exportRowId,* FROM ${table} WHERE ${where} LIMIT 129`)) {
      if (core.length >= 128 || (totalBytes += bytes(row)) > 4 * 1024 * 1024) throw new RangeError('Recovery mutable core exceeds its bounded export contract');
      core.push(row);
    }
    tables[table] = core;
    const summary = sql.exec<{ count: number; upper: number | null }>(`SELECT COUNT(*) AS count, MAX(rowid) AS upper FROM ${table} WHERE NOT (${where})`).one();
    if (summary.count) manifest.push({ table, upperRowId: summary.upper ?? 0, count: summary.count, excludedRowIds: core.map((row) => row._exportRowId) });
  }
  // Preserve the existing single-file backup for a young, small world. Large
  // archives get immutable high-water marks rather than being loaded into RAM.
  const completeTables: Record<string, Row[]> = { ...tables };
  let complete = true;
  for (const item of manifest) {
    if (item.count > 128) { complete = false; break; }
    const page = recoveryPage(sql, { table: item.table, upperRowId: item.upperRowId, excludedRowIds: item.excludedRowIds, afterRowId: -1, exportedAtMs: atMs });
    if (page.nextAfterRowId !== null || (totalBytes += bytes(page.rows)) > 4 * 1024 * 1024) { complete = false; break; }
    completeTables[item.table] = [...tables[item.table]!, ...page.rows].sort((a, b) => a._exportRowId - b._exportRowId);
  }
  return { complete, tables: complete ? completeTables : tables, manifest: complete ? [] : manifest };
}

export function recoveryPage(sql: SqlStorage, raw: RecoveryPageRequest) {
  const request = recoveryPageSchema.parse(raw), rows: Row[] = [];
  const exclusions = request.excludedRowIds.length ? ` AND rowid NOT IN (${request.excludedRowIds.map(() => '?').join(',')})` : '';
  const query = `SELECT rowid AS _exportRowId,* FROM ${request.table} WHERE rowid > ? AND rowid <= ?${exclusions} ORDER BY rowid LIMIT 129`;
  let totalBytes = 0, more = false;
  for (const row of sql.exec<Row>(query, request.afterRowId, request.upperRowId, ...request.excludedRowIds)) {
    const size = bytes(row);
    if (size > 8 * 1024 * 1024) throw new RangeError('An archival row exceeds the recovery page limit');
    if (rows.length && (rows.length >= 128 || totalBytes + size > 1024 * 1024)) { more = true; break; }
    rows.push(row); totalBytes += size;
  }
  const payload = { format: 'villa-recovery-page-v1', ...request, rows, nextAfterRowId: more ? rows.at(-1)!._exportRowId : null };
  return { ...payload, sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}

export function verifyRecoveryPage(value: ReturnType<typeof recoveryPage>) {
  const { sha256, ...payload } = value;
  if (createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== sha256) throw new TypeError('Recovery page checksum is invalid');
  recoveryPageSchema.parse({ table: payload.table, upperRowId: payload.upperRowId, afterRowId: payload.afterRowId,
    exportedAtMs: payload.exportedAtMs, excludedRowIds: payload.excludedRowIds });
  let previous = payload.afterRowId;
  for (const row of payload.rows) {
    if (row._exportRowId <= previous || row._exportRowId > payload.upperRowId || payload.excludedRowIds.includes(row._exportRowId)) throw new TypeError('Recovery page range is inconsistent');
    previous = row._exportRowId;
  }
  if (payload.nextAfterRowId !== null && payload.nextAfterRowId !== previous) throw new TypeError('Recovery cursor is inconsistent');
  return payload;
}
