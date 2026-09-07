import { env, exports } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { matchesEntityTag } from '../src/conditional';
import { runWorkersAI, WORKERS_AI_MODEL, WORKERS_AI_TIMEOUT_MS } from '../src/providers/workers-ai';
import { cognitionJob } from './fixtures';
import worker from '../src/index';
import { verifyRecoveryExport } from '../src/checkpoint';

describe('bounded and conditional public service', () => {
  it('exports a private checked recovery only with authentication and without advancing time', async () => {
    const token = 'test-only-recovery-token-with-more-than-32-characters';
    const configured = { ...env, ADMIN_TOKEN: token } as Env;
    const address = 'https://habitat.test/v1/admin/recovery';
    const missing = await worker.fetch(new Request(address), configured);
    const wrong = await worker.fetch(new Request(address, { headers: { authorization: `Bearer ${token}x` } }), configured);
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    const before = await (await worker.fetch(new Request('https://habitat.test/v1/status'), configured)).json() as { worldRevision: number; simTime: unknown };
    const response = await worker.fetch(new Request(address, { headers: { authorization: `Bearer ${token}` } }), configured);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
    const recovery = verifyRecoveryExport(await response.json() as Record<string, unknown>);
    expect(recovery.worldRevision).toBe(before.worldRevision);
    const after = await (await worker.fetch(new Request('https://habitat.test/v1/status'), configured)).json() as { worldRevision: number; simTime: unknown };
    expect(after.worldRevision).toBe(before.worldRevision);
    expect(after.simTime).toEqual(before.simTime);
  });

  it('does not retransmit a world unchanged since the observer read it', async () => {
    const first = await exports.default.fetch('https://habitat.test/v1/observer');
    const tag = first.headers.get('etag')!;
    expect(first.status).toBe(200);
    const repeated = await exports.default.fetch('https://habitat.test/v1/observer', {
      headers: { 'if-none-match': tag },
    });
    expect(repeated.status).toBe(304);
    expect(await repeated.text()).toBe('');
    expect(repeated.headers.get('etag')).toBe(tag);
    expect(repeated.headers.get('access-control-allow-origin')).toBe('https://aleetreny.github.io');
    const obsolete = await exports.default.fetch('https://habitat.test/v1/observer', {
      headers: { 'if-none-match': '"habitat-observer-obsolete"' },
    });
    expect(obsolete.status).toBe(200);
  });

  it('accepts weak and multiple GET validators without matching a different revision', () => {
    expect(matchesEntityTag('W/"world-3", "world-2"', '"world-3"')).toBe(true);
    expect(matchesEntityTag('"world-30"', '"world-3"')).toBe(false);
    expect(matchesEntityTag('*', '"world-3"')).toBe(true);
  });

  it('allows a cross-origin conditional read without exposing administrative headers', async () => {
    const response = await exports.default.fetch('https://habitat.test/v1/observer', { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toBe('if-none-match');
    expect(response.headers.get('access-control-allow-methods')).not.toContain('POST');
  });

  it('finishes a hung Workers AI request and ignores its late output', async () => {
    vi.useFakeTimers();
    try {
      let finish!: (value: unknown) => void;
      const pending = new Promise<unknown>((resolve) => { finish = resolve; });
      const run = vi.fn(() => pending);
      const result = runWorkersAI({ ai: { run }, job: cognitionJob(), attemptId: 'deadline', model: WORKERS_AI_MODEL });
      await vi.advanceTimersByTimeAsync(WORKERS_AI_TIMEOUT_MS);
      const failure = await result;
      expect(failure).toMatchObject({ ok: false, kind: 'timeout', detailCode: 'ProviderTimeout' });
      finish({ response: '{"thought":"late"}' });
      await Promise.resolve();
      expect(await result).toEqual(failure);
      expect(run).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
