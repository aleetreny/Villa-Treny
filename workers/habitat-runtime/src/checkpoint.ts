import { RECOVERY_TABLES, recoveryTablesForVersion, verifyRecoveryPage, type RecoveryManifest, type RecoveryPage } from './recovery';
import { createHash } from 'node:crypto';
import { deserializeWorldState, WORLD_CODEC_VERSION } from './domain';
import { parseSocietyState } from '../../../src/lib/habitat/society/schema';
import { parseArchivedPublication } from '../../../src/lib/habitat/society/record-archive';
import { validateRejectionRow } from './rejection-log';
import { GROQ_MODELS, LEGACY_GROQ_MODEL } from './quota-migration';
export const RULES_VERSION = 'villa-society-v12';
const KNOWN_RULES = new Set(['villa-society-v6', 'villa-society-v7', 'villa-society-v9', 'villa-society-v10', 'villa-society-v11', RULES_VERSION]);
export type Checkpoint = { codecVersion: number; rulesVersion: string; worldRevision: number; stateJson: string; sha256: string };
export function makeCheckpoint(worldRevision: number, stateJson: string): Checkpoint {
  deserializeWorldState(stateJson);
  const payload = { codecVersion: WORLD_CODEC_VERSION, rulesVersion: RULES_VERSION, worldRevision, stateJson };
  return { ...payload, sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
export function verifyCheckpoint(checkpoint: Checkpoint) {
  if (checkpoint.codecVersion !== WORLD_CODEC_VERSION || !KNOWN_RULES.has(checkpoint.rulesVersion)
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
  validateTables(tables);
  const runtime = tables.runtime_meta?.[0];
  if (!runtime || runtime.world_revision !== checkpoint.worldRevision || runtime.sim_day !== world.day
    || runtime.sim_minute !== (world.watch - 1) * 360) throw new TypeError('Recovery world and scheduler revisions differ');
  const storedWorld = tables.world_state?.[0];
  if (storedWorld && (tables.world_state?.length !== 1 || storedWorld.singleton !== 1
    || storedWorld.codec_version !== checkpoint.codecVersion || storedWorld.world_revision !== checkpoint.worldRevision
    || storedWorld.state_json !== checkpoint.stateJson)) throw new TypeError('Recovery world row differs from its checkpoint');
  validateSociety(tables);
  const manifest = (payload.manifest ?? []) as RecoveryManifest[];
  if (!Array.isArray(manifest) || new Set(manifest.map((item) => item.table)).size !== manifest.length
    || manifest.some((item) => !RECOVERY_TABLES.includes(item.table) || !Number.isSafeInteger(item.count) || item.count < 1
      || !Number.isSafeInteger(item.upperRowId) || item.upperRowId < 0 || !Array.isArray(item.excludedRowIds)
      || item.excludedRowIds.length > 128 || item.excludedRowIds.some((id) => !Number.isSafeInteger(id) || id < 0)
      || (item.cutId !== undefined && item.cutId !== payload.cutId))
    || (payload.complete !== false && manifest.length > 0)) throw new TypeError('Recovery manifest is invalid');
  return { world, worldRevision: checkpoint.worldRevision, runtime, tables, complete: payload.complete !== false, manifest };
}

/** Client-side verification after downloading the immutable pages. A partial
 * core alone is a state checkpoint, never a claim that all history was backed up. */
export function verifyRecoveryBundle(core: Record<string, unknown>, pages: RecoveryPage[]) {
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
        || page.exportedAtMs !== core.exportedAtMs || page.cutId !== item.cutId
        || JSON.stringify(page.excludedRowIds) !== JSON.stringify(item.excludedRowIds)) throw new TypeError('Recovery pages belong to different cuts or overlap');
      rows.push(...page.rows); count += page.rows.length; cursor = page.nextAfterRowId;
    }
    if (cursor !== null || count !== item.count) throw new TypeError(`Recovery history is incomplete for ${item.table}: expected ${item.count}, received ${count}`);
    tables[item.table] = [...(tables[item.table] ?? []), ...rows];
  }
  if (pages.some((page) => !manifest.some((item) => item.table === page.table))) throw new TypeError('Unexpected recovery table');
  validateTables(tables);
  validateSociety(tables);
  const migrations = tables._sql_schema_migrations ?? [];
  const sourceVersion = Math.max(...migrations.map((row) => Number(row.version)));
  if (sourceVersion >= 7
    && (tables.society_state?.length !== 1 || recoveryTablesForVersion(sourceVersion).some((table) => !Object.hasOwn(tables, table)))) {
    throw new TypeError('Recovery is missing a current-schema table');
  }
  if (sourceVersion >= 10) validateQuotaModels(tables);
  if (sourceVersion >= 12 && tables.society_state?.[0]?.codec_version !== 4) {
    throw new TypeError('SQL12 recovery requires the private attention codec');
  }
  if (sourceVersion === 11 && tables.society_state?.[0]?.codec_version !== 3) {
    throw new TypeError('SQL11 recovery requires the private retrieval codec');
  }
  return { ...restored, complete: true, tables };
}

function validateTables(tables: Record<string, Array<Record<string, unknown>>>) {
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) throw new TypeError('Recovery tables are invalid');
  for (const [name, rows] of Object.entries(tables)) {
    if (!(RECOVERY_TABLES as readonly string[]).includes(name) || !Array.isArray(rows)) throw new TypeError('Unknown recovery table');
    const rowIds = new Set<number>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError('Recovery row is invalid');
      if (row._exportRowId !== undefined) {
        if (!Number.isSafeInteger(row._exportRowId) || Number(row._exportRowId) < 0 || rowIds.has(Number(row._exportRowId))) {
          throw new TypeError('Recovery row identity is invalid or duplicated');
        }
        rowIds.add(Number(row._exportRowId));
      }
      if (name === 'quota_reservations') {
        if (row.usage_confirmed !== undefined && row.usage_confirmed !== 0 && row.usage_confirmed !== 1) throw new TypeError('Invalid usage confirmation');
        for (const field of ['max_requests', 'max_input_tokens', 'max_output_tokens', 'max_neurons']) {
          if (!Number.isSafeInteger(row[field]) || Number(row[field]) < 0) throw new TypeError('Invalid quota reservation maximum');
        }
        if (row.usage_confirmed === 1 && (row.state !== 'settled' || row.actual_requests !== 1
          || ['actual_input_tokens', 'actual_output_tokens', 'actual_neurons', 'settled_at_ms'].some((field) =>
            !Number.isSafeInteger(row[field]) || Number(row[field]) < 0))) throw new TypeError('Confirmed usage is incomplete');
      }
      if (name === 'provider_model_breakers' && (row.provider !== 'groq'
        || !(GROQ_MODELS as readonly unknown[]).includes(row.model)
        || ['open_until_ms', 'failure_streak', 'updated_at_ms'].some((field) => !Number.isSafeInteger(row[field]) || Number(row[field]) < 0)
        || (row.reason !== null && typeof row.reason !== 'string'))) throw new TypeError('Invalid model breaker');
      if (name === 'authored_publications') {
        if (typeof row.publication_json !== 'string') throw new TypeError('Missing archived publication');
        const { publication } = parseArchivedPublication(JSON.parse(row.publication_json));
        if (publication.id !== row.publication_id || publication.draftId !== row.draft_id || publication.author !== row.author
          || publication.publishedAtMs !== row.published_at_ms || (publication.audience === 'public' ? 1 : 0) !== row.is_public) {
          throw new TypeError('Publication archive metadata differs from its content');
        }
      }
      if (name === 'provider_rejections') validateRejectionRow(row);
      if (name === 'society_layout_backups') {
        if (typeof row.state_json !== 'string' || createHash('sha256').update(row.state_json).digest('hex') !== row.sha256) {
          throw new TypeError('Historical society backup checksum is invalid');
        }
        const original = JSON.parse(row.state_json), decoded = parseSocietyState(original);
        if (!decoded.ok || original.version !== row.codec_version || decoded.state.revision !== row.revision) {
          throw new TypeError('Historical society backup codec is invalid');
        }
      }
    }
  }
}

/** Run only after all pages are joined: the migration boundary and immutable
 * attempts may be on other pages of the same verified capture. */
function validateQuotaModels(tables: Record<string, Array<Record<string, unknown>>>) {
  const boundaries = tables.quota_model_migration ?? [], boundary = boundaries[0];
  if (boundaries.length !== 1 || boundary?.singleton !== 1
    || !Number.isSafeInteger(boundary.legacy_reservation_rowid) || Number(boundary.legacy_reservation_rowid) < 0
    || !Number.isSafeInteger(boundary.migrated_at_ms) || Number(boundary.migrated_at_ms) < 0) {
    throw new TypeError('Recovery quota model migration boundary is invalid');
  }
  const attempts = new Map((tables.provider_attempts ?? []).map((row) => [row.attempt_id, row]));
  const identities = new Set<unknown>();
  for (const row of tables.quota_reservations ?? []) {
    if (identities.has(row.reservation_id)) throw new TypeError('Recovery reservation identity is duplicated');
    identities.add(row.reservation_id);
    const historical = Number.isSafeInteger(row._exportRowId)
      && Number(row._exportRowId) <= Number(boundary.legacy_reservation_rowid);
    const legacy = row.model === null && historical;
    if ((historical && !legacy) || (!legacy && (typeof row.model !== 'string' || !row.model.length))
      || (row.provider !== 'groq' && row.provider !== 'workers-ai')
      || (row.provider === 'groq' && !legacy && !(GROQ_MODELS as readonly unknown[]).includes(row.model))) {
      throw new TypeError('Recovery reservation model is missing or unsupported');
    }
    const attempt = attempts.get(row.reservation_id);
    if (attempt && (attempt.provider !== row.provider || (legacy
      ? row.provider === 'groq' && attempt.model !== LEGACY_GROQ_MODEL : attempt.model !== row.model))) {
      throw new TypeError('Recovery attempt and reservation models differ');
    }
  }
}

function validateSociety(tables: Record<string, Array<Record<string, unknown>>>) {
  const rows = tables.society_state ?? [];
  if (rows.length > 1) throw new TypeError('Recovery society singleton is duplicated');
  if (!rows.length) return; // Legacy v1 snapshots predate the independent minds.
  const row = rows[0]!;
  if (row.singleton !== 1 || typeof row.state_json !== 'string') throw new TypeError('Recovery society row is invalid');
  const original: unknown = JSON.parse(row.state_json);
  const parsed = parseSocietyState(original);
  // Decoding upgrades old records/retrieval extensions only in memory. The archived
  // row must still agree with its own original codec, not the current one.
  const originalVersion = original && typeof original === 'object' && 'version' in original ? original.version : undefined;
  if (!parsed.ok || originalVersion !== row.codec_version || parsed.state.revision !== row.revision) {
    throw new TypeError('Recovery society codec or revision is invalid');
  }
}

export type RestoreStatement = { sql: string; bindings: SqlStorageValue[] };
/** Creates a reviewable plan only; it does not contact or modify any runtime. */
export function recoveryRestorePlan(core: Record<string, unknown>, pages: RecoveryPage[], targetHabitatId: string) {
  const verified = verifyRecoveryBundle(core, pages);
  if (core.habitatId !== targetHabitatId) throw new TypeError('Recovery habitat identity does not match its target');
  const tables = { ...verified.tables };
  if (!tables.world_state) {
    // Old v1 exports did not retain updated_at_ms. Preserve their physical
    // checkpoint exactly and use the documented capture time for that metadata.
    const checkpoint = core.checkpoint as Checkpoint;
    tables.world_state = [{ singleton: 1, codec_version: checkpoint.codecVersion, world_revision: checkpoint.worldRevision,
      state_json: checkpoint.stateJson, updated_at_ms: core.exportedAtMs }];
  }
  const schemaVersion = Math.max(...(tables._sql_schema_migrations ?? []).map((row) => Number(row.version)));
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) throw new TypeError('Recovery has no source schema version');
  const statements: RestoreStatement[] = [];
  for (const table of Object.keys(tables)) statements.push({ sql: `DELETE FROM "${table}"`, bindings: [] });
  // Explicit row IDs preserve page identity; resetting these counters also
  // preserves the next sequence when restoring into a previously used database.
  statements.push({ sql: `DELETE FROM sqlite_sequence WHERE name IN (${Object.keys(tables).map(() => '?').join(',')})`, bindings: Object.keys(tables) });
  for (const [table, rows] of Object.entries(tables)) for (const row of rows) {
    const fields = Object.keys(row).filter((key) => key !== '_exportRowId');
    const names = [...(row._exportRowId === undefined ? [] : ['rowid']), ...fields];
    const values = [...(row._exportRowId === undefined ? [] : [row._exportRowId]), ...fields.map((key) => row[key])];
    if (!values.every((value) => value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))) {
      throw new TypeError('Recovery contains a non-SQL value');
    }
    statements.push({ sql: `INSERT INTO "${table}" (${names.map((name) => `"${name.replaceAll('"', '""')}"`).join(',')}) VALUES (${names.map(() => '?').join(',')})`,
      bindings: values as SqlStorageValue[] });
  }
  statements.push({ sql: 'DROP TABLE IF EXISTS _recovery_rows', bindings: [] }, { sql: 'DROP TABLE IF EXISTS _recovery_cuts', bindings: [] });
  return { verified, schemaVersion, statements, columns: Object.fromEntries(Object.entries(tables).map(([table, rows]) =>
    [table, [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => key !== '_exportRowId')))]])) };
}

/** Local restoration primitive. No administrative endpoint exposes it. Caller
 * must explicitly provide storage and the intended habitat identity. */
export function restoreRecoveryBundle(storage: Pick<DurableObjectStorage, 'sql' | 'transactionSync'>,
  core: Record<string, unknown>, pages: RecoveryPage[], targetHabitatId: string) {
  const plan = recoveryRestorePlan(core, pages, targetHabitatId);
  return storage.transactionSync(() => {
    const current = storage.sql.exec<{ version: number }>('SELECT MAX(version) AS version FROM _sql_schema_migrations').one().version;
    if (current !== plan.schemaVersion) throw new TypeError('Restore into the matching SQL schema before applying subsequent migrations');
    for (const [table, expected] of Object.entries(plan.columns)) {
      const actual = storage.sql.exec<{ name: string }>(`PRAGMA table_info("${table}")`).toArray().map((field) => field.name);
      if (!actual.length || (expected.length && (actual.length !== expected.length || expected.some((field) => !actual.includes(field))))) {
        throw new TypeError('Restore source and target table columns differ');
      }
    }
    for (const statement of plan.statements) storage.sql.exec(statement.sql, ...statement.bindings);
    return plan.verified;
  });
}
