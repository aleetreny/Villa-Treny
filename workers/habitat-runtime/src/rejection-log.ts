import { createHash } from 'node:crypto';
import type { ProviderAttemptResult } from './contracts';
import { providerRejectionDiagnosticHashes } from './providers/shared';

export const REJECTION_RETENTION = { rows: 64, bytes: 16 * 1024 * 1024, ageMs: 7 * 24 * 60 * 60 * 1000 } as const;

/** Shared shape/byte checks plus synchronous hashes for transactionSync/recovery. */
export function validRejectionDiagnostic(value: unknown): boolean {
  const hashes = providerRejectionDiagnosticHashes(value);
  return hashes !== null && hashes.every(item => createHash('sha256').update(item.text).digest('hex') === item.sha256);
}

/** Optional private evidence. The caller persists accounting first and catches
 * failure here: losing diagnostics must never trigger another inference.
 * Expiry is collected on the next attempt write, never by observer requests.
 * Private exports keep their original cut even when live evidence is evicted. */
export function saveProviderRejection(sql: SqlStorage, result: ProviderAttemptResult, nowMs: number): void {
  sql.exec('DELETE FROM provider_rejections WHERE recorded_at_ms<=?', nowMs - REJECTION_RETENTION.ageMs);
  if (result.ok || !result.diagnostic) return;
  const diagnostic = result.diagnostic;
  if (diagnostic.attemptId !== result.attemptId || diagnostic.provider !== result.provider
    || diagnostic.model !== result.model || !validRejectionDiagnostic(diagnostic)) {
    throw new TypeError('Invalid private rejection diagnostic');
  }
  const json = JSON.stringify(diagnostic), size = new TextEncoder().encode(json).byteLength;
  if (size > REJECTION_RETENTION.bytes) throw new RangeError('Private rejection exceeds retention bound');
  sql.exec(`INSERT OR IGNORE INTO provider_rejections(attempt_id,recorded_at_ms,diagnostic_json,byte_count)
    VALUES(?,?,?,?)`, result.attemptId, nowMs, json, size);
  const rows = sql.exec<{ sequence: number; byte_count: number }>(
    'SELECT sequence,byte_count FROM provider_rejections ORDER BY sequence DESC LIMIT ?', REJECTION_RETENTION.rows + 1).toArray();
  let bytes = 0;
  for (let index = 0; index < rows.length; index++) {
    bytes += rows[index]!.byte_count;
    if (index >= REJECTION_RETENTION.rows || bytes > REJECTION_RETENTION.bytes) {
      sql.exec('DELETE FROM provider_rejections WHERE sequence<=?', rows[index]!.sequence);
      break;
    }
  }
}

export function validateRejectionRow(row: Record<string, unknown>): void {
  if (typeof row.diagnostic_json !== 'string' || !Number.isSafeInteger(row.sequence) || Number(row.sequence) <= 0
    || !Number.isSafeInteger(row.recorded_at_ms) || Number(row.recorded_at_ms) < 0
    || new TextEncoder().encode(row.diagnostic_json).byteLength !== row.byte_count) {
    throw new TypeError('Private rejection metadata is invalid');
  }
  const diagnostic: unknown = JSON.parse(row.diagnostic_json);
  if (!validRejectionDiagnostic(diagnostic) || (diagnostic as { attemptId: string }).attemptId !== row.attempt_id) {
    throw new TypeError('Private rejection content is invalid');
  }
}
