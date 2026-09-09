import { z } from 'zod';

export const GENESIS_RESIDENT_COUNT = 25 as const;
export const MAX_RESIDENTS = 25 as const;
export const HABITAT_SCHEMA_VERSION = 1 as const;
export const SQL_SCHEMA_VERSION = 12 as const;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const simInstantSchema = z.strictObject({
  day: z.number().int().nonnegative(),
  minute: z.number().int().min(0).max(1439),
});

export type SimInstant = z.infer<typeof simInstantSchema>;

const subjectSchema = z.strictObject({
  kind: z.string().min(1).max(64),
  id: z.string().min(1).max(128),
});

export const cognitionJobSchema = z.strictObject({
  schemaVersion: z.literal(HABITAT_SCHEMA_VERSION),
  jobId: z.string().min(1).max(160),
  habitatId: z.string().min(1).max(80),
  origin: z.strictObject({
    kind: z.literal('alarm'),
    runId: z.string().min(1).max(160),
  }),
  cause: z.strictObject({
    worldRevision: z.number().int().nonnegative(),
    simTime: simInstantSchema,
    eventId: z.string().min(1).max(160).optional(),
  }),
  kind: z.string().min(1).max(80),
  subjects: z.array(subjectSchema).min(1).max(MAX_RESIDENTS),
  pressure: z.number().min(0).max(1),
  createdAtMs: z.number().int().nonnegative(),
  /** Absent on historical jobs: they retain the single-Groq route. */
  routingPolicy: z.literal('free-models-v1').optional(),
  prompt: z.strictObject({
    system: z.string().min(1).max(24_000),
    user: z.string().min(1).max(24_000),
  }),
  outputContract: z.strictObject({
    name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    version: z.number().int().positive(),
    schemaHash: z.string().min(8).max(128),
    jsonSchema: jsonValueSchema.refine(
      (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
      'jsonSchema must be an object',
    ),
  }),
  maxOutputTokens: z.number().int().min(1).max(1536),
}).refine(job => job.routingPolicy === undefined
  || (job.kind === 'society_turn' && job.outputContract.name === 'society_turn' && [6, 7, 8].includes(job.outputContract.version)),
'the versioned free-model route is only issued for P6/P7/P8 society turns');

export type CognitionJob = z.infer<typeof cognitionJobSchema>;

export const adminCommandSchema = z.strictObject({
  commandId: z.string().min(8).max(160),
  issuedAtMs: z.number().int().nonnegative(),
  expectedControlRevision: z.number().int().nonnegative().optional(),
  reason: z.string().min(1).max(240).optional(),
});

export type AdminCommand = z.infer<typeof adminCommandSchema>;

export const archiveFilterSchema = z.strictObject({
  day: z.number().int().nonnegative(),
  room: z.string().min(1).max(64).optional(),
  person: z.string().min(1).max(8).optional(),
});

export type ArchiveFilter = z.infer<typeof archiveFilterSchema>;
export const recordsFilterSchema = z.strictObject({
  before: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  limit: z.number().int().min(1).max(40).default(20),
});
export type RecordsFilter = z.infer<typeof recordsFilterSchema>;

export type ProviderId = 'workers-ai' | 'groq';

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  neurons?: number;
  /** Already included in outputTokens, never added a second time. */
  reasoningTokens?: number;
  /** Set when the provider supplied malformed or contradictory usage fields. */
  incomplete?: boolean;
};

/** Private, bounded evidence for a rejected provider candidate. Never part of a public DTO. */
export type ProviderRejectionDiagnostic = {
  version: 1;
  jobId: string;
  attemptId: string;
  provider: ProviderId;
  model: string;
  contract: { name: string; version: number; schemaSha256: string | null;
    schemaJson: string | null; schemaBytes: number | null; schemaComplete: boolean };
  prompt: { scope: 'actual_provider_messages'; systemSha256: string | null; userSha256: string | null };
  stage: 'parse' | 'schema' | 'domain' | 'truncated';
  phase: 'envelope_json' | 'content_json' | 'json_value' | 'root_shape' | 'schema_or_decode' | 'domain_validation' | 'provider_finish';
  code: string;
  source: 'workers_ai_binding' | 'groq_http_json';
  selectedField: 'choices[0].message.content' | 'response' | 'error.failed_generation' | 'none';
  selectedType: 'string' | 'object' | 'array' | 'null' | 'undefined' | 'number' | 'boolean' | 'other';
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | 'unknown' | null;
  httpStatus: number | null;
  candidate: {
    text: string | null;
    representation: 'selected_string' | 'binding_serialization' | 'not_captured';
    capturedBytes: number;
    renderedBytes: number | null;
    /** Hash of the stored UTF-8 text; fullSha256 hashes the entire selected/rendered candidate. */
    sha256: string | null;
    fullSha256: string | null;
    /** Completeness of capture, not of model generation or domain replay. */
    complete: boolean;
  };
  captureFailed: boolean;
};

export type ProviderAttemptResult =
  | {
      ok: true;
      provider: ProviderId;
      model: string;
      attemptId: string;
      providerRequestId?: string;
      payload: JsonValue;
      usage: ProviderUsage;
      latencyMs: number;
    }
  | {
      ok: false;
      provider: ProviderId;
      model: string;
      attemptId: string;
      kind:
        | 'quota-exhausted'
        | 'rate-limited'
        | 'timeout'
        | 'unavailable'
        | 'invalid-response'
        | 'authentication'
        | 'misconfigured'
        | 'policy-blocked'
        | 'rejected';
      retryable: boolean;
      retryAtMs?: number;
      detailCode?: string;
      diagnostic?: ProviderRejectionDiagnostic;
      /** The provider can report billable usage even when its output is invalid. */
      usage?: ProviderUsage;
      providerRequestId?: string;
      latencyMs: number;
    };

export type RouterResult =
  | { status: 'completed'; attempts?: ProviderAttemptResult[]; result: Extract<ProviderAttemptResult, { ok: true }> }
  | { status: 'deferred'; retryAtMs: number; reasons: ProviderAttemptResult[] }
  | { status: 'rejected'; reasons: ProviderAttemptResult[] };

// Env also contains bindings and platform-injected test values, so this schema
// intentionally selects only runtime policy fields instead of rejecting extras.
export const runtimeConfigSchema = z.object({
  HABITAT_ID: z.string().min(1),
  PUBLIC_ORIGIN: z.literal('https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev'),
  TICK_INTERVAL_MS: z.coerce.number().int().refine(
    (value) => value === 6 * 60 * 60 * 1_000,
    'one watch must equal exactly six real hours',
  ),
  MAX_COGNITIONS_PER_ALARM: z.coerce.number().int().min(1).max(1),
  WORKERS_AI_MODEL: z.enum(['@cf/google/gemma-4-26b-a4b-it', '@cf/qwen/qwen3-30b-a3b-fp8', '@cf/openai/gpt-oss-120b']),
  WORKERS_AI_DAILY_NEURONS_LIMIT: z.coerce.number().int().min(1).max(10_000),
  GROQ_MODEL: z.literal('openai/gpt-oss-20b'),
  GROQ_DAILY_TOTAL_TOKENS_LIMIT: z.coerce.number().int().min(1).max(200_000),
  GROQ_120B_ENABLED: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  GROQ_120B_DAILY_TOTAL_TOKENS_LIMIT: z.coerce.number().int().min(1).max(200_000).default(200_000),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export function parseRuntimeConfig(env: unknown): RuntimeConfig {
  return runtimeConfigSchema.parse(env);
}
