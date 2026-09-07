import { jsonValueSchema, type JsonValue, type ProviderUsage } from '../contracts';

export function estimateTokens(text: string): number {
  // UTF-8 bytes are a deliberately conservative upper bound for the byte-fallback
  // tokenizers used by both allowlisted models. The fixed margin covers chat and
  // structured-output framing that is not visible in the authored prompt.
  return 128 + new TextEncoder().encode(text).byteLength;
}

export function parseStructuredPayload(value: unknown): JsonValue {
  // Strip only a complete leading reasoning wrapper. Never mine arbitrary
  // prose or unfinished reasoning for a JSON object that could be unintended.
  const content = typeof value === 'string'
    ? value.trim().replace(/^<think>[\s\S]*?<\/think>\s*/, '') : value;
  const decoded = typeof content === 'string' ? JSON.parse(content) : content;
  const payload = jsonValueSchema.parse(decoded);
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('structured output must be a JSON object');
  }
  return payload;
}

export function sanitizeUsage(usage: {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
} | null | undefined): ProviderUsage {
  const result: ProviderUsage = {};
  if (typeof usage?.prompt_tokens === 'number' && usage.prompt_tokens >= 0) {
    result.inputTokens = usage.prompt_tokens;
  }
  if (typeof usage?.completion_tokens === 'number' && usage.completion_tokens >= 0) {
    result.outputTokens = usage.completion_tokens;
  }
  if (typeof usage?.total_tokens === 'number' && usage.total_tokens >= 0) {
    result.totalTokens = usage.total_tokens;
  }
  return result;
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { code?: unknown; name?: unknown };
  if (typeof candidate.code === 'string') return candidate.code.slice(0, 80);
  if (typeof candidate.name === 'string') return candidate.name.slice(0, 80);
  return undefined;
}
