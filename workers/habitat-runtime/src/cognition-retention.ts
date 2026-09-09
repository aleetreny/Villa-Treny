import { createHash } from 'node:crypto';
import { cognitionJobSchema } from './contracts';

const MARKER = /^\[villa-input-omitted:v1;sha256=[a-f0-9]{64};utf8=(?:0|[1-9][0-9]*)\]$/;
const omitted = (text: string) => `[villa-input-omitted:v1;sha256=${createHash('sha256')
  .update(text, 'utf8').digest('hex')};utf8=${new TextEncoder().encode(text).length}]`;
type InputRow = { envelope_json: string; prepared_json: string };

/** Call synchronously INSIDE the transaction that first makes this one job
 * applied/dead. Never sweep already-terminal history: recovery treats terminal
 * jobs and their contexts as immutable. Resolved jobs still need their input.
 *
 * Only duplicated input prose is omitted. The job contract, original promptBytes,
 * prepared turn/control/evidence metadata and exact output_json remain intact.
 * Each marker hashes the original string's UTF-8 bytes, not JSON-escaped bytes.
 * No new columns, world/mind updates, provider calls or asynchronous work are involved.
 */
export function compactTerminalCognition(sql: SqlStorage, jobId: string): boolean {
  const row = sql.exec<InputRow>(`SELECT j.envelope_json,c.prepared_json FROM cognition_jobs j
    JOIN cognition_contexts c ON c.job_id=j.job_id
    WHERE j.job_id=? AND j.status IN ('applied','dead')`, jobId).toArray()[0];
  if (!row) return false;
  let originalJob: unknown, prepared: unknown;
  try {
    originalJob = JSON.parse(row.envelope_json);
    prepared = JSON.parse(row.prepared_json);
  } catch {
    // Unknown historical formats are retained exactly, not repaired here.
    return false;
  }
  const parsed = cognitionJobSchema.safeParse(originalJob);
  if (!parsed.success || parsed.data.kind !== 'society_turn' || parsed.data.outputContract.name !== 'society_turn') return false;
  const job = parsed.data;
  if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared)
    || !('prompt' in prepared) || typeof prepared.prompt !== 'string') return false;
  // The marker lives inside existing string fields, keeping both contracts
  // parseable without introducing an optional metadata schema or migration.
  if ([job.prompt.system, job.prompt.user, prepared.prompt].every((text) => MARKER.test(text))) return false;
  const envelopeJson = JSON.stringify({ ...job, prompt: {
    system: omitted(job.prompt.system), user: omitted(job.prompt.user),
  } });
  const preparedJson = JSON.stringify({ ...prepared, prompt: omitted(prepared.prompt) });
  sql.exec('UPDATE cognition_jobs SET envelope_json=? WHERE job_id=?', envelopeJson, jobId);
  sql.exec('UPDATE cognition_contexts SET prepared_json=? WHERE job_id=?', preparedJson, jobId);
  return true;
}
