import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { parseRuntimeConfig, type ProviderAttemptResult, type ProviderRejectionDiagnostic } from '../src/contracts';
import { SqlQuotaLedger } from '../src/quota';
import { runWorkersAI, OSS_WORKERS_AI_MODEL, WORKERS_AI_MODEL, workersAIInput } from '../src/providers/workers-ai';
import { GROQ_MODEL, runGroq } from '../src/providers/groq';
import { routeCognition } from '../src/providers/router';
import { buildProviderRejectionDiagnostic, MAX_DIAGNOSTIC_CANDIDATE_BYTES, MAX_DIAGNOSTIC_HASH_BYTES,
  MAX_DIAGNOSTIC_SCHEMA_BYTES, providerRejectionDiagnosticHashes, verifyProviderRejectionDiagnostic } from '../src/providers/shared';
import { cognitionJob } from './fixtures';

async function hash(text: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function diagnostic(result: ProviderAttemptResult): ProviderRejectionDiagnostic {
  expect(result.ok).toBe(false);
  if (result.ok || !result.diagnostic) throw new Error('Missing fixture rejection receipt');
  return result.diagnostic;
}
const usage = { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 };
const workers = (content: unknown, finish_reason: unknown = 'stop', response?: unknown) => runWorkersAI({
  ai: { run: async () => ({ choices: [{ finish_reason, message: { content } }], response, usage }) },
  job: cognitionJob(), attemptId: 'diagnostic-workers', model: OSS_WORKERS_AI_MODEL,
});
const selected = (value: unknown) => ({ value, source: 'workers_ai_binding' as const,
  selectedField: 'response' as const, systemMessage: 'actual system', userMessage: 'actual user' });
const capture = (value: unknown, job = cognitionJob()) => buildProviderRejectionDiagnostic({
  job, attemptId: 'diagnostic-capture', provider: 'workers-ai', model: OSS_WORKERS_AI_MODEL, selected: selected(value),
}, { stage: 'domain', phase: 'domain_validation', code: 'insufficient_cells' });

describe('private rejected provider evidence', () => {
  it('distinguishes malformed JSON from a valid, unwrapped tuple without repairing either', async () => {
    const raw = ' \n<think>Private preliminary text.</think>\n {"turn":[';
    const malformed = diagnostic(await workers(raw));
    expect(malformed).toMatchObject({ stage: 'parse', phase: 'content_json', code: 'invalid_content_json',
      source: 'workers_ai_binding', selectedField: 'choices[0].message.content', selectedType: 'string',
      candidate: { text: raw, complete: true, representation: 'selected_string', fullSha256: await hash(raw) } });
    const tuple = diagnostic(await workers('["document",{"text":"private draft"}]'));
    expect(tuple).toMatchObject({ stage: 'schema', phase: 'root_shape', code: 'root_not_object', candidate: { complete: true } });
    expect(await verifyProviderRejectionDiagnostic(malformed)).toBe(true);
    expect(await verifyProviderRejectionDiagnostic(tuple)).toBe(true);
  });

  it('records length as a truncation even if its entire observed text is valid JSON', async () => {
    const result = await workers('{"thought":"wait"}', 'length');
    expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 30, totalTokens: 130 });
    expect(diagnostic(result)).toMatchObject({ stage: 'truncated', phase: 'provider_finish',
      code: 'output_truncated', finishReason: 'length', candidate: { complete: true, text: '{"thought":"wait"}' } });
  });

  it('keeps nullish selection and marks object serialization, never claiming original HTTP bytes', async () => {
    const object = [1, 'private tuple'];
    const result = await workers(null, 'untrusted private reason', object);
    const d = diagnostic(result);
    expect(d).toMatchObject({ selectedField: 'response', selectedType: 'array', finishReason: 'unknown',
      candidate: { text: JSON.stringify(object), representation: 'binding_serialization', complete: true } });
    expect(JSON.stringify(d)).not.toContain('untrusted private reason');
    const successful = await workers('{"thought":"wait"}', 'stop', 'ignored private field');
    expect(successful.ok).toBe(true);
    expect(successful).not.toHaveProperty('diagnostic');
    expect(JSON.stringify(successful)).not.toContain('ignored private field');
  });

  it('hashes actual legacy Qwen message framing, not the unmodified job prompts', async () => {
    const job = cognitionJob();
    const request = workersAIInput(job, WORKERS_AI_MODEL);
    const d = diagnostic(await runWorkersAI({ job, model: WORKERS_AI_MODEL, attemptId: 'qwen-framing',
      ai: { run: async () => ({ response: '{broken' }) } }));
    expect(d.prompt).toEqual({ scope: 'actual_provider_messages', systemSha256: await hash(request.messages[0]!.content),
      userSha256: await hash(request.messages[1]!.content) });
    expect(d.prompt.systemSha256).not.toBe(await hash(job.prompt.system));
    expect(d.contract).toMatchObject({ name: job.outputContract.name, version: job.outputContract.version,
      schemaJson: JSON.stringify(job.outputContract.jsonSchema), schemaSha256: await hash(JSON.stringify(job.outputContract.jsonSchema)), schemaComplete: true });
    expect(JSON.stringify(d)).not.toContain(job.prompt.user);
  });

  it('caps UTF-8 capture without cutting a code point, hashes full and partial scopes separately', async () => {
    const text = 'a'.repeat(MAX_DIAGNOSTIC_CANDIDATE_BYTES - 1) + '🧭é';
    const d = await capture(text);
    expect(d.candidate).toEqual({ text: text.slice(0, MAX_DIAGNOSTIC_CANDIDATE_BYTES - 1),
      representation: 'selected_string', capturedBytes: MAX_DIAGNOSTIC_CANDIDATE_BYTES - 1,
      renderedBytes: MAX_DIAGNOSTIC_CANDIDATE_BYTES + 5, complete: false,
      sha256: await hash(text.slice(0, MAX_DIAGNOSTIC_CANDIDATE_BYTES - 1)), fullSha256: await hash(text) });
    expect(await verifyProviderRejectionDiagnostic(d)).toBe(true);
    expect(await verifyProviderRejectionDiagnostic({ ...d, candidate: { ...d.candidate, complete: true } })).toBe(false);
    const surrogate = await capture('\ud800');
    expect(surrogate.candidate.text).toBe('\ud800');
    expect(await verifyProviderRejectionDiagnostic(surrogate)).toBe(true);
  });

  it('omits an oversized issued schema and never claims a full hash beyond the allocation budget', async () => {
    const job = cognitionJob(); job.outputContract.jsonSchema = { description: 'x'.repeat(MAX_DIAGNOSTIC_SCHEMA_BYTES) };
    const d = await capture('x'.repeat(MAX_DIAGNOSTIC_HASH_BYTES + 1), job);
    expect(d.contract).toMatchObject({ schemaJson: null, schemaComplete: false,
      schemaSha256: await hash(JSON.stringify(job.outputContract.jsonSchema)) });
    expect(d.candidate).toMatchObject({ capturedBytes: MAX_DIAGNOSTIC_CANDIDATE_BYTES, complete: false, fullSha256: null });
    expect(await verifyProviderRejectionDiagnostic(d)).toBe(true);
  });

  it('treats malformed envelope JSON as missing candidate, preserving authoritative HTTP classification', async () => {
    const result = await runGroq({ apiKey: 'fixture-key', job: cognitionJob(), model: GROQ_MODEL, attemptId: 'invalid-envelope',
      fetcher: async () => new Response('<private provider envelope>') });
    const d = diagnostic(result);
    expect(d).toMatchObject({ stage: 'parse', phase: 'envelope_json', code: 'invalid_envelope_json',
      selectedField: 'none', candidate: { text: null, complete: false, fullSha256: null } });
    expect(JSON.stringify(d)).not.toContain('private provider envelope');
    expect(await verifyProviderRejectionDiagnostic(d)).toBe(true);
    const forbidden = await runGroq({ apiKey: 'fixture-key', job: cognitionJob(), model: GROQ_MODEL, attemptId: 'forbidden-envelope',
      fetcher: async () => new Response('not JSON', { status: 403 }) });
    expect(forbidden).toMatchObject({ ok: false, kind: 'authentication', retryable: false });
  });

  it('captures only Groq failed_generation for provider schema rejection and retains reported usage', async () => {
    const result = await runGroq({ apiKey: 'fixture-key', job: cognitionJob(), model: GROQ_MODEL, attemptId: 'schema-rejection',
      fetcher: async () => Response.json({ error: { code: 'json_validate_failed', message: 'untrusted private provider message',
        failed_generation: '{"extra":true}', usage }, headers: 'not response metadata' }, { status: 400 }) });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 30, totalTokens: 130 });
    expect(diagnostic(result)).toMatchObject({ stage: 'schema', phase: 'schema_or_decode', code: 'json_validate_failed',
      selectedField: 'error.failed_generation', httpStatus: 400, candidate: { text: '{"extra":true}', complete: true } });
    expect(JSON.stringify(diagnostic(result))).not.toContain('untrusted private provider message');
    expect(JSON.stringify(diagnostic(result))).not.toContain('fixture-key');
  });

  it('does not let a diagnostic callback or failed hashing turn valid output into a resend', async () => {
    const run = vi.fn(async () => ({ response: '{"thought":"wait"}' }));
    const result = await runWorkersAI({ ai: { run }, job: cognitionJob(), attemptId: 'callback-throws', model: OSS_WORKERS_AI_MODEL,
      onCandidate: () => { throw new Error('private diagnostic failure'); } });
    expect(result.ok).toBe(true); expect(run).toHaveBeenCalledTimes(1);
    const digest = vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('synthetic hashing failure'));
    try {
      const invalidRun = vi.fn(async () => ({ response: '{broken', usage }));
      const rejected = await runWorkersAI({ ai: { run: invalidRun }, job: cognitionJob(), attemptId: 'hash-throws', model: OSS_WORKERS_AI_MODEL });
      expect(rejected).toMatchObject({ ok: false, kind: 'invalid-response', detailCode: 'invalid_structured_output',
        usage: { inputTokens: 100 }, diagnostic: { captureFailed: true, candidate: { text: '{broken', sha256: null } } });
      expect(invalidRun).toHaveBeenCalledTimes(1);
      expect(providerRejectionDiagnosticHashes(diagnostic(rejected))).not.toBeNull();
    } finally { digest.mockRestore(); }
  });

  it('recovers shape/hash evidence only when all captured bytes are consistent and allowlisted', async () => {
    const d = await capture('{"private":"fixture"}');
    expect(await verifyProviderRejectionDiagnostic(d)).toBe(true);
    for (const tamper of [
      { ...d, arbitraryPrivateKey: 'not allowed' },
      { ...d, selectedField: 'none' },
      { ...d, phase: 'provider_finish' },
      { ...d, code: 'private arbitrary callback message' },
      { ...d, candidate: { ...d.candidate, text: 'changed' } },
      { ...d, candidate: { ...d.candidate, fullSha256: '0'.repeat(64) } },
      { ...d, contract: { ...d.contract, schemaJson: '{}' } },
    ]) expect(await verifyProviderRejectionDiagnostic(tamper)).toBe(false);
    expect(providerRejectionDiagnosticHashes(d)).toEqual([
      { text: d.candidate.text, sha256: d.candidate.sha256 },
      { text: d.contract.schemaJson, sha256: d.contract.schemaSha256 },
    ]);
  });

  it('keeps per-attempt rejection evidence through fallback without another charge or dispatch', async () => {
    const stub = env.HABITAT_WORLD.getByName('diagnostics-real-sql-fallback');
    await runInDurableObject(stub, async (_instance, state) => {
      const config = parseRuntimeConfig(env), quota = new SqlQuotaLedger(state.storage.sql, config);
      const primary = ' \n<think>Private initial reasoning.</think>\n{"turn": ["invalid"]} ';
      const secondary = '{"thought":"wait"}';
      const run = vi.fn(async () => ({ choices: [{ finish_reason: 'stop', message: { content: primary } }], usage }));
      const receipts: ProviderAttemptResult[] = [];
      const groqFetch = vi.fn(async () => {
        expect(receipts).toHaveLength(1);
        expect(diagnostic(receipts[0]!).candidate.text).toBe(primary);
        return Response.json({ choices: [{ finish_reason: 'stop', message: { content: secondary } }], usage });
      });
      const result = await routeCognition({ ai: { run }, config, job: cognitionJob(), attemptOrdinal: 1, quota,
        now: () => Date.parse('2026-09-08T16:00:00Z'), groqApiKey: 'fixture-key', groqFetch, onAttempt: attempt => { receipts.push(attempt); },
        validatePayload: payload => typeof payload === 'object' && payload && !Array.isArray(payload) && 'thought' in payload ? true : 'invalid_record_choice' });
      expect(result.status).toBe('completed');
      if (result.status !== 'completed') throw new Error('Expected fallback completion');
      const rejected = result.attempts![0]!;
      expect(diagnostic(rejected)).toMatchObject({ stage: 'schema', phase: 'schema_or_decode', code: 'invalid_record_choice',
        candidate: { text: primary, complete: true, fullSha256: await hash(primary) } });
      expect(result.result.payload).toEqual({ thought: 'wait' });
      expect(result.result).not.toHaveProperty('diagnostic');
      expect(run).toHaveBeenCalledTimes(1); expect(groqFetch).toHaveBeenCalledTimes(1);
      expect(state.storage.sql.exec('SELECT provider, state, usage_confirmed, actual_requests, actual_input_tokens, actual_output_tokens FROM quota_reservations ORDER BY provider').toArray())
        .toEqual(['groq', 'workers-ai'].map(provider => ({ provider, state: 'settled', usage_confirmed: 1,
          actual_requests: 1, actual_input_tokens: 100, actual_output_tokens: 30 })));
      // Only private attempt receipts have candidate text. Quota snapshots stay public-safe.
      expect(JSON.stringify(quota.snapshot(Date.parse('2026-09-08T16:00:00Z')))).not.toContain('Private initial reasoning');
    });
  });

  it('stops before fallback if the synchronous durable receipt fails after settlement', async () => {
    const quota = { reserve: vi.fn(() => ({ allowed: true })), markDispatched: vi.fn(), settle: vi.fn(), recordOutcome: vi.fn(), dispatchedCount: () => 1 };
    const groqFetch = vi.fn();
    await expect(routeCognition({ ai: { run: async () => ({ response: '{broken', usage }) },
      config: parseRuntimeConfig(env), job: cognitionJob(), attemptOrdinal: 1, quota: quota as unknown as SqlQuotaLedger,
      groqApiKey: 'fixture-key', groqFetch, onAttempt: () => { throw new Error('synthetic accounting write failure'); },
    })).rejects.toThrow('synthetic accounting write failure');
    expect(quota.reserve).toHaveBeenCalledTimes(1); expect(quota.settle).toHaveBeenCalledTimes(1);
    expect(quota.recordOutcome).toHaveBeenCalledTimes(1); expect(groqFetch).not.toHaveBeenCalled();
  });

  it('rechecks control after rejection hashing and durable recording before any fallback reservation', async () => {
    const quota = { reserve: vi.fn(() => ({ allowed: true })), markDispatched: vi.fn(), settle: vi.fn(), recordOutcome: vi.fn(), dispatchedCount: () => 1 };
    let active = true;
    const groqFetch = vi.fn();
    const result = await routeCognition({ ai: { run: async () => ({ response: '{broken', usage }) },
      config: parseRuntimeConfig(env), job: cognitionJob(), attemptOrdinal: 1, quota: quota as unknown as SqlQuotaLedger,
      groqApiKey: 'fixture-key', groqFetch, canDispatch: () => active, onAttempt: attempt => {
        expect(diagnostic(attempt).candidate.complete).toBe(true); active = false;
      },
    });
    expect(result).toMatchObject({ status: 'rejected', reasons: [{ kind: 'invalid-response' }, { detailCode: 'control_revision_changed' }] });
    expect(quota.reserve).toHaveBeenCalledTimes(1); expect(groqFetch).not.toHaveBeenCalled();
  });

  it.each(['insufficient_cells', 'stale_mind', 'untrusted private error details'])('captures a fresh callback rejection %s without interpreting it as acceptance', async code => {
    const quota = { reserve: () => ({ allowed: true }), markDispatched: vi.fn(), settle: vi.fn(), recordOutcome: vi.fn(), dispatchedCount: () => 1 };
    const result = await routeCognition({ ai: { run: async () => ({ response: '{"thought":"wait"}', usage }) },
      config: parseRuntimeConfig(env), job: cognitionJob(), attemptOrdinal: 1, quota: quota as unknown as SqlQuotaLedger,
      validatePayload: () => code });
    expect(result.status).toBe('deferred');
    if (result.status === 'completed') throw new Error('Incorrect acceptance');
    expect(diagnostic(result.reasons[0]!)).toMatchObject({ stage: 'domain', phase: 'domain_validation',
      code: code.startsWith('untrusted') ? 'domain_validation_failed' : code });
    expect(JSON.stringify(diagnostic(result.reasons[0]!))).not.toContain('untrusted private error details');
    expect(quota.settle).toHaveBeenCalledTimes(1);
  });
});
