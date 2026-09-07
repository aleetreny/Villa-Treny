import { z } from 'zod';

export const GENESIS_RESIDENT_COUNT = 25 as const;
export const MAX_RESIDENTS = 25 as const;
export const HABITAT_SCHEMA_VERSION = 1 as const;
export const SQL_SCHEMA_VERSION = 6 as const;

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
  maxOutputTokens: z.number().int().min(1).max(384),
});

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

export type ProviderId = 'workers-ai' | 'groq';

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  neurons?: number;
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
  PUBLIC_ORIGIN: z.literal('https://aleetreny.github.io'),
  TICK_INTERVAL_MS: z.coerce.number().int().refine(
    (value) => value === 6 * 60 * 60 * 1_000,
    'one watch must equal exactly six real hours',
  ),
  MAX_COGNITIONS_PER_ALARM: z.coerce.number().int().min(1).max(1),
  WORKERS_AI_MODEL: z.literal('@cf/qwen/qwen3-30b-a3b-fp8'),
  WORKERS_AI_DAILY_NEURONS_LIMIT: z.coerce.number().int().min(1).max(10_000),
  GROQ_MODEL: z.literal('openai/gpt-oss-20b'),
  GROQ_DAILY_TOTAL_TOKENS_LIMIT: z.coerce.number().int().min(1).max(200_000),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export function parseRuntimeConfig(env: unknown): RuntimeConfig {
  return runtimeConfigSchema.parse(env);
}
