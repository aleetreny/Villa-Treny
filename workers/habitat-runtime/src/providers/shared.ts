import { z } from 'zod';
import { jsonValueSchema, type CognitionJob, type JsonValue, type ProviderRejectionDiagnostic, type ProviderUsage } from '../contracts';

export function estimateTokens(text: string): number {
  // UTF-8 bytes are a deliberately conservative upper bound for the byte-fallback
  // tokenizers used by the configured models. The fixed margin is an explicit
  // allowance for framing, not a measured server-side prompt count.
  return 128 + new TextEncoder().encode(text).byteLength;
}

export function parseStructuredPayload(value: unknown): JsonValue {
  // Strip only a complete leading reasoning wrapper. Never mine arbitrary
  // prose or unfinished reasoning for a JSON object that could be unintended.
  const content = typeof value === 'string'
    ? value.trim().replace(/^<think>[\s\S]*?<\/think>\s*/, '') : value;
  let decoded: unknown;
  try { decoded = typeof content === 'string' ? JSON.parse(content) : content; }
  catch { throw new StructuredPayloadError('parse', 'content_json', 'invalid_content_json'); }
  let payload: JsonValue;
  try { payload = jsonValueSchema.parse(decoded); }
  catch { throw new StructuredPayloadError('schema', 'json_value', 'invalid_json_value'); }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new StructuredPayloadError('schema', 'root_shape', 'root_not_object');
  }
  return payload;
}

export function sanitizeUsage(usage: {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
  completion_tokens_details?: { reasoning_tokens?: unknown } | null;
} | null | undefined): ProviderUsage {
  const result: ProviderUsage = {};
  if (isUsageInteger(usage?.prompt_tokens)) {
    result.inputTokens = usage.prompt_tokens;
  }
  if (isUsageInteger(usage?.completion_tokens)) {
    result.outputTokens = usage.completion_tokens;
  }
  if (isUsageInteger(usage?.total_tokens)) {
    result.totalTokens = usage.total_tokens;
  }
  if (isUsageInteger(usage?.completion_tokens_details?.reasoning_tokens)) {
    result.reasoningTokens = usage.completion_tokens_details.reasoning_tokens;
  }
  if ([usage?.prompt_tokens, usage?.completion_tokens, usage?.total_tokens,
    usage?.completion_tokens_details?.reasoning_tokens].some((value) => value !== undefined && !isUsageInteger(value))) {
    result.incomplete = true;
  }
  return result;
}

export function isUsageInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Missing, fractional or contradictory usage never authorizes a refund. */
export function hasCompleteTokenUsage(usage: ProviderUsage): usage is ProviderUsage & { inputTokens: number; outputTokens: number } {
  return usage.incomplete !== true && isUsageInteger(usage.inputTokens) && isUsageInteger(usage.outputTokens)
    && Number.isSafeInteger(usage.inputTokens + usage.outputTokens)
    && (usage.totalTokens === undefined || (isUsageInteger(usage.totalTokens)
      && usage.totalTokens === usage.inputTokens + usage.outputTokens))
    && (usage.reasoningTokens === undefined || (isUsageInteger(usage.reasoningTokens)
      && usage.reasoningTokens <= usage.outputTokens));
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { code?: unknown; name?: unknown };
  if (typeof candidate.code === 'string') return candidate.code.slice(0, 80);
  if (typeof candidate.name === 'string') return candidate.name.slice(0, 80);
  return undefined;
}


export const MAX_DIAGNOSTIC_CANDIDATE_BYTES = 64 * 1024;
export const MAX_DIAGNOSTIC_SCHEMA_BYTES = 192 * 1024;
// A binding has already materialized its response. Still avoid another unbounded
// hashing buffer: larger candidates retain a prefix, without claiming a full hash.
export const MAX_DIAGNOSTIC_HASH_BYTES = 4 * 1024 * 1024;

type DiagnosticReason = Pick<ProviderRejectionDiagnostic, 'stage' | 'phase' | 'code'>;
export type SelectedProviderCandidate = {
  value: unknown;
  source: ProviderRejectionDiagnostic['source'];
  selectedField: ProviderRejectionDiagnostic['selectedField'];
  finishReason?: unknown;
  httpStatus?: number;
  systemMessage: string;
  userMessage: string;
};

/** Transient handoff only: never attach the raw envelope/candidate to successes. */
export type CandidateObserver = (selected: SelectedProviderCandidate) => void;
export function notifyCandidate(observer: CandidateObserver | undefined, selected: SelectedProviderCandidate): void {
  try { observer?.(selected); } catch { /* Diagnostics must not change the attempt. */ }
}

class StructuredPayloadError extends Error {
  constructor(readonly stage: ProviderRejectionDiagnostic['stage'], readonly phase: ProviderRejectionDiagnostic['phase'], readonly code: string) {
    super(code);
  }
}
export function structuredPayloadReason(error: unknown): DiagnosticReason {
  return error instanceof StructuredPayloadError ? { stage: error.stage, phase: error.phase, code: error.code }
    : { stage: 'schema', phase: 'json_value', code: 'invalid_json_value' };
}

const SCHEMA_CODES = ['invalid_choice', 'unavailable_capability_choice', 'invalid_capability_choice',
  'invalid_proposal_choice', 'invalid_ordered_choice', 'invalid_record_choice', 'invalid_record_operation', 'invalid_retrieval_choice', 'invalid_attention_choice'] as const;
const DOMAIN_CODES = ['domain_validation_failed', 'invalid_domain_intent', 'validation_callback_failed',
  'record_sequence_ahead', 'record_revision_changed', 'record_integrity_failed', 'private_reference',
  'unavailable_record_draft', 'unavailable_record_offer', 'invalid_commission_parties', 'insufficient_cells',
  'record_not_author', 'publication_already_scheduled', 'record_content_too_large',
  'stale_control', 'stale_mind', 'stale_conversation', 'expired_job', 'unknown_evidence',
  'invalid_job', 'initial_project_required', 'unavailable_choice', 'deal_requires_open_message',
  'unavailable_dialogue_turn', 'invalid_work_deadline'] as const;
const DIAGNOSTIC_CODES = [...SCHEMA_CODES, ...DOMAIN_CODES, 'invalid_content_json', 'invalid_json_value',
  'root_not_object', 'invalid_envelope_json', 'invalid_envelope_shape', 'response_too_large',
  'output_truncated', 'json_validate_failed', 'provider_schema_rejected'] as const;

/** A callback code is data, not trusted prose. Grouped adapter failures do not
 * prove whether the issued schema, conversion or a dynamic enum rejected it. */
export function validationDiagnosticReason(code: unknown): DiagnosticReason {
  if (typeof code === 'string' && (SCHEMA_CODES as readonly string[]).includes(code))
    return { stage: 'schema', phase: 'schema_or_decode', code };
  return { stage: 'domain', phase: 'domain_validation',
    code: typeof code === 'string' && (DOMAIN_CODES as readonly string[]).includes(code) ? code : 'domain_validation_failed' };
}

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/).nullable();
const bytesSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const providerRejectionDiagnosticSchema = z.strictObject({
  version: z.literal(1), jobId: z.string().min(1).max(160), attemptId: z.string().min(1).max(240),
  provider: z.enum(['workers-ai', 'groq']), model: z.string().min(1).max(160),
  contract: z.strictObject({ name: z.string().min(1).max(80), version: z.number().int().positive(),
    schemaSha256: hashSchema, schemaJson: z.string().max(MAX_DIAGNOSTIC_SCHEMA_BYTES).nullable(),
    schemaBytes: bytesSchema.nullable(), schemaComplete: z.boolean() }),
  prompt: z.strictObject({ scope: z.literal('actual_provider_messages'), systemSha256: hashSchema, userSha256: hashSchema }),
  stage: z.enum(['parse', 'schema', 'domain', 'truncated']),
  phase: z.enum(['envelope_json', 'content_json', 'json_value', 'root_shape', 'schema_or_decode', 'domain_validation', 'provider_finish']),
  code: z.enum(DIAGNOSTIC_CODES), source: z.enum(['workers_ai_binding', 'groq_http_json']),
  selectedField: z.enum(['choices[0].message.content', 'response', 'error.failed_generation', 'none']),
  selectedType: z.enum(['string', 'object', 'array', 'null', 'undefined', 'number', 'boolean', 'other']),
  finishReason: z.enum(['stop', 'length', 'tool_calls', 'content_filter', 'function_call', 'unknown']).nullable(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  candidate: z.strictObject({ text: z.string().max(MAX_DIAGNOSTIC_CANDIDATE_BYTES).nullable(),
    representation: z.enum(['selected_string', 'binding_serialization', 'not_captured']),
    capturedBytes: bytesSchema.max(MAX_DIAGNOSTIC_CANDIDATE_BYTES), renderedBytes: bytesSchema.nullable(),
    sha256: hashSchema, fullSha256: hashSchema, complete: z.boolean() }),
  captureFailed: z.boolean(),
});

/** Exact UTF-8 byte length without allocating another full provider buffer. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes++;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length
      && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function selectedType(value: unknown): ProviderRejectionDiagnostic['selectedType'] {
  return value === null ? 'null' : Array.isArray(value) ? 'array'
    : ['string', 'object', 'undefined', 'number', 'boolean'].includes(typeof value)
      ? typeof value as ProviderRejectionDiagnostic['selectedType'] : 'other';
}
function finishReason(value: unknown): ProviderRejectionDiagnostic['finishReason'] {
  return value === undefined || value === null ? null
    : typeof value === 'string' && ['stop', 'length', 'tool_calls', 'content_filter', 'function_call'].includes(value)
      ? value as ProviderRejectionDiagnostic['finishReason'] : 'unknown';
}

/** Capture only the selected content, before trimming or removing <think>.
 * Strings are exact JavaScript strings hashed as UTF-8. Non-strings use ordinary
 * JSON.stringify of the binding/decoded field, never claim HTTP-wire identity.
 * Stored text is <=64KiB; a partial capture hashes both prefix and full rendered
 * value when the latter fits the 4MiB hashing budget. Missing hashes are explicit.
 * The issued schema is stored in full at <=192KiB, otherwise only its bounded
 * hash/length. No prompt text, headers, error messages or envelope are retained.
 * Completeness does not imply complete generation or replayable domain state.
 */
export async function buildProviderRejectionDiagnostic(input: {
  job: CognitionJob; attemptId: string; provider: ProviderRejectionDiagnostic['provider']; model: string;
  selected: SelectedProviderCandidate;
}, reason: DiagnosticReason): Promise<ProviderRejectionDiagnostic> {
  const { job, selected } = input;
  const result: ProviderRejectionDiagnostic = {
    version: 1, jobId: job.jobId, attemptId: input.attemptId, provider: input.provider, model: input.model,
    contract: { name: job.outputContract.name, version: job.outputContract.version,
      schemaSha256: null, schemaJson: null, schemaBytes: null, schemaComplete: false },
    prompt: { scope: 'actual_provider_messages', systemSha256: null, userSha256: null },
    ...reason, source: selected.source, selectedField: selected.selectedField,
    selectedType: selectedType(selected.value), finishReason: finishReason(selected.finishReason),
    httpStatus: selected.httpStatus ?? null,
    candidate: { text: null, representation: 'not_captured', capturedBytes: 0, renderedBytes: null,
      sha256: null, fullSha256: null, complete: false }, captureFailed: false,
  };
  try {
    const systemBytes = utf8Length(selected.systemMessage), userBytes = utf8Length(selected.userMessage);
    if (systemBytes <= MAX_DIAGNOSTIC_HASH_BYTES) result.prompt.systemSha256 = await sha256(selected.systemMessage);
    if (userBytes <= MAX_DIAGNOSTIC_HASH_BYTES) result.prompt.userSha256 = await sha256(selected.userMessage);
    const schema = JSON.stringify(job.outputContract.jsonSchema);
    result.contract.schemaBytes = utf8Length(schema);
    if (result.contract.schemaBytes <= MAX_DIAGNOSTIC_HASH_BYTES) result.contract.schemaSha256 = await sha256(schema);
    if (result.contract.schemaBytes <= MAX_DIAGNOSTIC_SCHEMA_BYTES) {
      result.contract.schemaJson = schema; result.contract.schemaComplete = true;
    }
  } catch { result.captureFailed = true; }
  try {
    if (selected.value === undefined || result.selectedType === 'other') return result;
    const rendered = typeof selected.value === 'string' ? selected.value : JSON.stringify(selected.value);
    if (typeof rendered !== 'string') { result.captureFailed = true; return result; }
    const renderedBytes = utf8Length(rendered);
    // encodeInto stops before a partial code point. Slice by UTF-16 units read
    // to preserve the original string (including lone surrogates) on JSON replay.
    const prefix = new TextEncoder().encodeInto(rendered, new Uint8Array(MAX_DIAGNOSTIC_CANDIDATE_BYTES));
    const text = rendered.slice(0, prefix.read);
    result.candidate = { text, representation: typeof selected.value === 'string' ? 'selected_string' : 'binding_serialization',
      capturedBytes: prefix.written, renderedBytes, sha256: null, fullSha256: null, complete: prefix.read === rendered.length };
    result.candidate.sha256 = await sha256(text);
    result.candidate.fullSha256 = result.candidate.complete ? result.candidate.sha256
      : renderedBytes <= MAX_DIAGNOSTIC_HASH_BYTES ? await sha256(rendered) : null;
  } catch { result.captureFailed = true; }
  return result;
}

/** Pure admin/recovery validation shared with synchronous transaction callers.
 * A prefix can verify its own bytes/hash but cannot authenticate an unavailable
 * full candidate, omitted schema or private domain state. */
export function providerRejectionDiagnosticHashes(value: unknown): Array<{ text: string; sha256: string }> | null {
  try {
    const parsed = providerRejectionDiagnosticSchema.safeParse(value);
    if (!parsed.success) return null;
    const d = parsed.data, c = d.candidate, contract = d.contract;
    const hashes: Array<{ text: string; sha256: string }> = [];
    if (d.source === 'workers_ai_binding' ? d.provider !== 'workers-ai' || d.httpStatus !== null
      || d.selectedField === 'error.failed_generation' : d.provider !== 'groq' || d.selectedField === 'response') return null;
    if (d.selectedField === 'none' && (d.selectedType !== 'undefined' || c.text !== null)) return null;
    if (d.phase === 'content_json' && (d.stage !== 'parse' || d.code !== 'invalid_content_json')
      || d.phase === 'provider_finish' && (d.stage !== 'truncated' || d.code !== 'output_truncated' || d.finishReason !== 'length')
      || d.phase === 'domain_validation' && (d.stage !== 'domain' || !(DOMAIN_CODES as readonly string[]).includes(d.code))
      || d.phase === 'schema_or_decode' && (d.stage !== 'schema' || ![...SCHEMA_CODES, 'json_validate_failed', 'provider_schema_rejected'].includes(d.code))
      || ['root_shape', 'json_value'].includes(d.phase) && d.stage !== 'schema') return null;
    if (c.text === null) {
      if (c.representation !== 'not_captured' || c.capturedBytes !== 0 || c.renderedBytes !== null
        || c.sha256 !== null || c.fullSha256 !== null || c.complete) return null;
    } else {
      if (c.representation === 'not_captured' || c.capturedBytes !== utf8Length(c.text)
        || c.capturedBytes > MAX_DIAGNOSTIC_CANDIDATE_BYTES || c.renderedBytes === null || c.renderedBytes < c.capturedBytes) return null;
      if (c.sha256 === null && !d.captureFailed) return null;
      if (c.complete ? c.renderedBytes !== c.capturedBytes || c.fullSha256 !== c.sha256
        : c.renderedBytes <= c.capturedBytes || c.capturedBytes < MAX_DIAGNOSTIC_CANDIDATE_BYTES - 3) return null;
      if (c.renderedBytes <= MAX_DIAGNOSTIC_HASH_BYTES && c.fullSha256 === null && !d.captureFailed) return null;
      if (c.sha256 !== null) hashes.push({ text: c.text, sha256: c.sha256 });
      if (c.representation === 'selected_string' ? d.selectedType !== 'string' : d.selectedType === 'string') return null;
    }
    if (contract.schemaJson === null) { if (contract.schemaComplete) return null; }
    else {
      if (!contract.schemaComplete || contract.schemaBytes !== utf8Length(contract.schemaJson)
        || contract.schemaBytes > MAX_DIAGNOSTIC_SCHEMA_BYTES || contract.schemaSha256 === null) return null;
      // It was serialized as JSON by the adapter, not arbitrary schema prose.
      const schema = JSON.parse(contract.schemaJson);
      if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return null;
      hashes.push({ text: contract.schemaJson, sha256: contract.schemaSha256 });
    }
    return hashes;
  } catch { return null; }
}

export async function verifyProviderRejectionDiagnostic(value: unknown): Promise<boolean> {
  try {
    const hashes = providerRejectionDiagnosticHashes(value);
    if (!hashes) return false;
    for (const entry of hashes) if (entry.sha256 !== await sha256(entry.text)) return false;
    return true;
  } catch { return false; }
}
