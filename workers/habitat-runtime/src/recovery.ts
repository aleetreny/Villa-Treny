import { createHash } from 'node:crypto';
import { z } from 'zod';

export const RECOVERY_TABLES = ['runtime_meta', 'world_state', 'watch_runs', 'cognition_jobs', 'provider_attempts', 'happenings',
  'happening_people', 'economic_events', 'world_checkpoints', 'world_layout_backups', '_sql_schema_migrations',
  'quota_reservations', 'provider_usage_daily', 'provider_breakers', 'alarm_runs', 'admin_commands', 'runtime_events',
  'society_state', 'cognition_contexts', 'physical_runs', 'society_events',
  'society_layout_backups', 'authored_publications', 'provider_rejections',
  'quota_model_migration', 'provider_model_breakers'] as const;
/** Required tables depend on the captured schema, not the reader's version. */
export function recoveryTablesForVersion(version: number): readonly RecoveryTable[] {
  return RECOVERY_TABLES.filter((table) => (version >= 9 || !['society_layout_backups', 'authored_publications', 'provider_rejections'].includes(table))
    && (version >= 10 || !['quota_model_migration', 'provider_model_breakers'].includes(table)));
}
export type RecoveryTable = typeof RECOVERY_TABLES[number];
export type RecoveryManifest = { table: RecoveryTable; upperRowId: number; count: number; excludedRowIds: number[]; cutId?: string };
export const recoveryPageSchema = z.strictObject({ table: z.enum(RECOVERY_TABLES), upperRowId: z.number().int().nonnegative(),
  afterRowId: z.number().int().min(-1).default(-1), exportedAtMs: z.number().int().positive().max(8_000_000_000_000),
  excludedRowIds: z.array(z.number().int().nonnegative()).max(128).default([]), cutId: z.string().uuid().optional() });
export type RecoveryPageRequest = z.infer<typeof recoveryPageSchema>;
export type RecoveryRow = Record<string, SqlStorageValue> & { _exportRowId: number };
type CutRow = { cut_id: string; exported_at_ms: number; expires_at_ms: number; schema_version: number; manifest_json: string };
type JsonRow = { row_id: number; payload_json: string };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const MAX_CORE_BYTES = 4 * 1024 * 1024;
export const RECOVERY_CUT_TTL_MS = 60 * 60 * 1_000;
const MAX_CUTS = 4;

/** Everything outside these predicates is append-only under this SQL version.
 * In particular, unconfirmed quota can be settled late, regardless of its age. */
function mutableWhere(table: RecoveryTable): string {
  switch (table) {
    case 'runtime_meta': case 'world_state': case 'society_state': case 'provider_breakers': case 'provider_usage_daily':
    case 'provider_rejections': case 'provider_model_breakers': return '1=1';
    case 'watch_runs': return "phase='claimed'";
    case 'cognition_jobs': return "status NOT IN ('applied','dead')";
    // An open job's input is compacted atomically when it becomes terminal.
    // Orphans cannot safely be assumed immutable either.
    case 'cognition_contexts': return "NOT EXISTS (SELECT 1 FROM cognition_jobs j WHERE j.job_id=cognition_contexts.job_id AND j.status IN ('applied','dead'))";
    case 'alarm_runs': return "phase IN ('claimed','tick-committed')";
    case 'admin_commands': return "COALESCE(json_extract(response_json, '$.status'), '')='pending'";
    case 'quota_reservations': return 'usage_confirmed=0';
    default: return '0=1';
  }
}

function ensureCuts(sql: SqlStorage) {
  sql.exec(`CREATE TABLE IF NOT EXISTS _recovery_cuts (cut_id TEXT PRIMARY KEY, exported_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL, schema_version INTEGER NOT NULL, manifest_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS _recovery_rows (cut_id TEXT NOT NULL, table_name TEXT NOT NULL,
      row_id INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(cut_id,table_name,row_id));`);
}
function currentSchema(sql: SqlStorage): number {
  return sql.exec<{ version: number }>('SELECT COALESCE(MAX(version),0) AS version FROM _sql_schema_migrations').one().version;
}
function jsonExpression(sql: SqlStorage, table: RecoveryTable, alias = ''): string {
  const prefix = alias ? `${alias}.` : '';
  const fields = sql.exec<{ name: string }>(`PRAGMA table_info(${table})`).toArray();
  return `json_object('_exportRowId',${prefix}rowid,${fields.map(({ name }) =>
    `'${name.replaceAll("'", "''")}',${prefix}"${name.replaceAll('"', '""')}"`).join(',')})`;
}

/** The caller holds transactionSync around both the checkpoint and this cut.
 * Frozen rows stay in SQL, so the number of pending jobs does not bound backup size. */
export function recoveryCore(sql: SqlStorage, atMs: number) {
  const enabledTables = recoveryTablesForVersion(currentSchema(sql));
  const summaries = enabledTables.map((table) => ({ table,
    ...sql.exec<{ count: number; upper: number }>(`SELECT COUNT(*) AS count, COALESCE(MAX(rowid),0) AS upper FROM ${table}`).one() }));
  const tables: Record<string, RecoveryRow[]> = Object.fromEntries(enabledTables.map((table) => [table, []]));
  if (summaries.every((item) => item.count <= 128)) {
    let totalBytes = 0;
    for (const { table } of summaries) {
      tables[table] = sql.exec<RecoveryRow>(`SELECT rowid AS _exportRowId,* FROM ${table} ORDER BY rowid`).toArray();
      totalBytes += bytes(tables[table]);
      if (totalBytes > MAX_CORE_BYTES) break;
    }
    if (totalBytes <= MAX_CORE_BYTES) return { complete: true, tables, manifest: [] as RecoveryManifest[] };
  }
  for (const table of enabledTables) tables[table] = [];
  ensureCuts(sql);
  const old = sql.exec<CutRow>('SELECT * FROM _recovery_cuts ORDER BY exported_at_ms DESC, rowid DESC').toArray();
  for (const [index, cut] of old.entries()) if (cut.expires_at_ms <= atMs || index >= MAX_CUTS - 1) {
    sql.exec('DELETE FROM _recovery_rows WHERE cut_id=?', cut.cut_id);
    sql.exec('DELETE FROM _recovery_cuts WHERE cut_id=?', cut.cut_id);
  }
  const cutId = crypto.randomUUID(), expiresAtMs = atMs + RECOVERY_CUT_TTL_MS;
  sql.exec('INSERT INTO _recovery_cuts VALUES(?,?,?,?,?)', cutId, atMs, expiresAtMs, currentSchema(sql), '[]');
  const manifest: RecoveryManifest[] = [];
  let coreBytes = 0;
  for (const { table, count, upper } of summaries) {
    sql.exec(`INSERT INTO _recovery_rows(cut_id,table_name,row_id,payload_json)
      SELECT ?,?,rowid,${jsonExpression(sql, table)} FROM ${table} WHERE ${mutableWhere(table)}`, cutId, table);
    if (table === 'runtime_meta' || table === 'world_state' || table === 'society_state') {
      tables[table] = sql.exec<JsonRow>('SELECT row_id,payload_json FROM _recovery_rows WHERE cut_id=? AND table_name=? ORDER BY row_id', cutId, table)
        .toArray().map((row) => JSON.parse(row.payload_json) as RecoveryRow);
      coreBytes += bytes(tables[table]);
    }
    const excludedRowIds = tables[table]!.map((row) => row._exportRowId);
    if (count > excludedRowIds.length) manifest.push({ table, upperRowId: upper, count: count - excludedRowIds.length, excludedRowIds, cutId });
  }
  if (coreBytes > MAX_CORE_BYTES) throw new RangeError('Recovery singleton state exceeds its export bound');
  sql.exec('UPDATE _recovery_cuts SET manifest_json=? WHERE cut_id=?', JSON.stringify(manifest), cutId);
  return { complete: false, tables, manifest, cutId, expiresAtMs };
}

function findCut(sql: SqlStorage, request: RecoveryPageRequest, nowMs: number): CutRow {
  ensureCuts(sql);
  // Timestamp lookup supports clients of the previous page API. New clients use
  // the random ID; ambiguous timestamps never silently select a different cut.
  const cuts = request.cutId
    ? sql.exec<CutRow>('SELECT * FROM _recovery_cuts WHERE cut_id=?', request.cutId).toArray()
    : sql.exec<CutRow>('SELECT * FROM _recovery_cuts WHERE exported_at_ms=?', request.exportedAtMs).toArray();
  if (cuts.length !== 1) throw new RangeError('Recovery cut is unavailable; start a new complete capture');
  const cut = cuts[0]!;
  if (cut.expires_at_ms <= nowMs) throw new RangeError('Recovery cut expired; start a new complete capture');
  if (cut.exported_at_ms !== request.exportedAtMs || cut.schema_version !== currentSchema(sql)) {
    throw new RangeError('Recovery cut no longer matches the source schema');
  }
  const item = (JSON.parse(cut.manifest_json) as RecoveryManifest[]).find((item) => item.table === request.table);
  if (!item || item.upperRowId !== request.upperRowId || JSON.stringify(item.excludedRowIds) !== JSON.stringify(request.excludedRowIds)) {
    throw new TypeError('Recovery page does not match its frozen manifest');
  }
  return cut;
}

export function recoveryPage(sql: SqlStorage, raw: RecoveryPageRequest, nowMs = Date.now()) {
  const request = recoveryPageSchema.parse(raw), cut = findCut(sql, request, nowMs);
  const exclusions = request.excludedRowIds.length ? ` AND row_id NOT IN (${request.excludedRowIds.map(() => '?').join(',')})` : '';
  const query = `SELECT row_id,payload_json FROM (
    SELECT row_id,payload_json FROM _recovery_rows WHERE cut_id=? AND table_name=?
    UNION ALL SELECT live.rowid AS row_id,${jsonExpression(sql, request.table, 'live')} AS payload_json
      FROM ${request.table} AS live WHERE NOT EXISTS (
        SELECT 1 FROM _recovery_rows AS frozen WHERE frozen.cut_id=? AND frozen.table_name=? AND frozen.row_id=live.rowid))
    WHERE row_id>? AND row_id<=?${exclusions} ORDER BY row_id LIMIT 129`;
  const rows: RecoveryRow[] = [];
  let totalBytes = 0, more = false;
  for (const stored of sql.exec<JsonRow>(query, cut.cut_id, request.table, cut.cut_id, request.table,
    request.afterRowId, request.upperRowId, ...request.excludedRowIds)) {
    const row = JSON.parse(stored.payload_json) as RecoveryRow, size = bytes(row);
    if (size > 8 * 1024 * 1024) throw new RangeError('A recovery row exceeds the page limit');
    if (rows.length && (rows.length >= 128 || totalBytes + size > 1024 * 1024)) { more = true; break; }
    rows.push(row); totalBytes += size;
  }
  const payload = { format: 'villa-recovery-page-v1', ...request, cutId: cut.cut_id, rows,
    nextAfterRowId: more ? rows.at(-1)!._exportRowId : null };
  return { ...payload, sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}

export type RecoveryPage = Omit<ReturnType<typeof recoveryPage>, 'cutId'> & { cutId?: string };
export function verifyRecoveryPage(value: RecoveryPage) {
  const { sha256, ...payload } = value;
  if (payload.format !== 'villa-recovery-page-v1'
    || createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== sha256) throw new TypeError('Recovery page checksum is invalid');
  recoveryPageSchema.parse({ table: payload.table, upperRowId: payload.upperRowId, afterRowId: payload.afterRowId,
    exportedAtMs: payload.exportedAtMs, excludedRowIds: payload.excludedRowIds, ...(payload.cutId ? { cutId: payload.cutId } : {}) });
  if (!Array.isArray(payload.rows) || payload.rows.length > 128 || (payload.nextAfterRowId !== null && !payload.rows.length)) {
    throw new TypeError('Recovery page rows are invalid');
  }
  let previous = payload.afterRowId;
  for (const row of payload.rows) {
    if (!Number.isSafeInteger(row._exportRowId) || row._exportRowId <= previous || row._exportRowId > payload.upperRowId
      || payload.excludedRowIds.includes(row._exportRowId)) throw new TypeError('Recovery page range is inconsistent');
    previous = row._exportRowId;
  }
  if (payload.nextAfterRowId !== null && payload.nextAfterRowId !== previous) throw new TypeError('Recovery cursor is inconsistent');
  return payload;
}
