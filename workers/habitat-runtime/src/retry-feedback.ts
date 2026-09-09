import { createHash } from 'node:crypto';
import type { CognitionJob, ProviderRejectionDiagnostic } from './contracts';
import { validRejectionDiagnostic } from './rejection-log';
import { parseStructuredPayload } from './providers/shared';
import { structuralValidationFeedback } from './structural-feedback';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/** Read one retained rejection for this job, never an unrelated resident's
 * candidate. Missing, stale or incomplete private evidence yields no hint.
 * The immutable job stays untouched; callers meter the actual augmented USER. */
export function savedStructuralRetryFeedback(sql: SqlStorage, job: CognitionJob, errorCode: string): string {
  if (job.kind !== 'society_turn' || job.outputContract.name !== 'society_turn'
    || ![6, 7, 8].includes(job.outputContract.version)
    || !['invalid_society:invalid_record_choice', 'invalid_society:invalid_record_operation',
      'invalid_society:invalid_retrieval_choice', 'invalid_society:invalid_attention_choice'].includes(errorCode)) return '';
  try {
    const prefix = `${job.jobId}:`;
    const row = sql.exec<{ diagnostic_json: string }>(
      `SELECT diagnostic_json FROM provider_rejections WHERE attempt_id>=? AND attempt_id<?
       ORDER BY recorded_at_ms DESC,sequence DESC LIMIT 1`, prefix, `${job.jobId};`).toArray()[0];
    if (!row) return '';
    const diagnostic: unknown = JSON.parse(row.diagnostic_json);
    if (!validRejectionDiagnostic(diagnostic)) return '';
    const rejected = diagnostic as ProviderRejectionDiagnostic;
    if (rejected.jobId !== job.jobId || rejected.contract.name !== job.outputContract.name
      || rejected.contract.version !== job.outputContract.version || rejected.code !== errorCode.slice('invalid_society:'.length)
      || rejected.stage !== 'schema' || rejected.phase !== 'schema_or_decode'
      || rejected.captureFailed || !rejected.candidate.complete || !rejected.contract.schemaComplete
      || rejected.candidate.text === null || rejected.contract.schemaJson === null
      || (rejected.finishReason !== 'stop' && rejected.finishReason !== null)
      || rejected.contract.schemaSha256 !== hash(JSON.stringify(job.outputContract.jsonSchema))
      || rejected.prompt.systemSha256 !== hash(job.prompt.system)) return '';
    if (rejected.prompt.userSha256 !== hash(job.prompt.user)) {
      // Prior retry text is bound by the already-existing exact input receipt.
      // Read at most32 recent rows by primary-key order, never scan history or
      // trust a claimed hash supplied in a model response.
      const retry = sql.exec<{ type: string; detail_json: string }>(
        'SELECT type,detail_json FROM runtime_events ORDER BY sequence DESC LIMIT 32').toArray().some(row => {
        if (row.type !== 'society.turn.retry') return false;
        const detail = JSON.parse(row.detail_json) as Record<string, unknown>;
        return detail.jobId === job.jobId && detail.baseUserHash === hash(job.prompt.user)
          && detail.systemHash === rejected.prompt.systemSha256
          && detail.userHash === rejected.prompt.userSha256;
      });
      if (!retry) return '';
    }
    const feedback = structuralValidationFeedback(job.outputContract.jsonSchema, parseStructuredPayload(rejected.candidate.text));
    return feedback ? ` Structure errors: ${JSON.stringify(feedback)}.` : '';
  } catch { return ''; }
}
