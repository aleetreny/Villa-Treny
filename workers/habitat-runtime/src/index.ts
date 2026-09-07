import { recoveryPageSchema } from './recovery';
import { z } from 'zod';
import { hasValidAdminToken } from './auth';
import {
  adminCommandSchema,
  archiveFilterSchema,
} from './contracts';
import { matchesEntityTag } from './conditional';
import { errorResponse, jsonResponse, readJson } from './http';
import { adminSecret, HabitatWorld } from './habitat-world';

export { HabitatWorld } from './habitat-world';

function habitat(env: Env): DurableObjectStub<HabitatWorld> {
  return env.HABITAT_WORLD.getByName(env.HABITAT_ID, { locationHint: 'weur' });
}

function publicJson(value: unknown, env: Env): Response {
  const response = jsonResponse(value);
  response.headers.set('access-control-allow-origin', env.PUBLIC_ORIGIN);
  response.headers.set('vary', 'Origin');
  response.headers.set('access-control-expose-headers', 'etag');
  response.headers.set('cache-control', 'public, max-age=10, stale-while-revalidate=30');
  return response;
}

function notModified(request: Request, tag: string, env: Env): Response | undefined {
  if (!matchesEntityTag(request.headers.get('if-none-match'), tag)) return undefined;
  const headers = publicJson(null, env).headers;
  headers.delete('content-type');
  headers.set('etag', tag);
  return new Response(null, { status: 304, headers });
}

async function requireAdmin(request: Request, env: Env): Promise<Response | undefined> {
  const expected = adminSecret(env);
  if (!expected) {
    return errorResponse(503, 'admin_not_configured', 'Administrative access is not configured.');
  }
  if (!(await hasValidAdminToken(request, expected))) {
    return errorResponse(401, 'unauthorized', 'A valid bearer token is required.');
  }
  return undefined;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && (
      url.pathname === '/health'
      || url.pathname === '/v1/status'
      || url.pathname === '/v1/snapshot'
      || url.pathname === '/v1/observer'
      || url.pathname === '/v1/archive'
    )) {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': env.PUBLIC_ORIGIN,
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'if-none-match',
          'access-control-max-age': '86400',
          vary: 'Origin',
        },
      });
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return publicJson({
        ok: true,
        service: 'habitat-runtime',
        groqConfigured: typeof env.GROQ_API_KEY === 'string' && env.GROQ_API_KEY.length > 0,
      }, env);
    }
    if (request.method === 'GET' && url.pathname === '/v1/status') {
      return publicJson(await habitat(env).getStatus(), env);
    }
    if (request.method === 'GET' && url.pathname === '/v1/snapshot') {
      if (request.headers.has('if-none-match')) {
        const { worldRevision } = await habitat(env).getStatus();
        const cached = notModified(request, `"habitat-${worldRevision}"`, env);
        if (cached) return cached;
      }
      const current = await habitat(env).getSnapshot();
      const response = publicJson(current.snapshot, env);
      response.headers.set('etag', `"habitat-${current.worldRevision}"`);
      return response;
    }
    if (request.method === 'GET' && url.pathname === '/v1/observer') {
      if (request.headers.has('if-none-match')) {
        const { worldRevision } = await habitat(env).getStatus();
        const cached = notModified(request, `"habitat-observer-${worldRevision}"`, env);
        if (cached) return cached;
      }
      const current = await habitat(env).getObserver();
      const response = publicJson(current, env);
      response.headers.set('etag', `"habitat-observer-${current.worldRevision}"`);
      return response;
    }
    if (request.method === 'GET' && url.pathname === '/v1/archive') {
      try {
        const allowed = new Set(['day', 'room', 'person']);
        if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) {
          throw new TypeError('unknown archive filter');
        }
        const day = url.searchParams.get('day');
        if (day === null || day.trim() === '') throw new TypeError('archive day is required');
        const room = url.searchParams.get('room');
        const person = url.searchParams.get('person');
        const filter = archiveFilterSchema.parse({
          day: Number(day),
          ...(room ? { room } : {}),
          ...(person ? { person } : {}),
        });
        return publicJson(await habitat(env).getArchive(filter), env);
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof TypeError) {
          return errorResponse(400, 'invalid_archive_filter', 'A valid day is required.');
        }
        throw error;
      }
    }
    if (request.method === 'GET' && url.pathname === '/v1/admin/recovery/page') {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      try {
        const value = recoveryPageSchema.parse({ table: url.searchParams.get('table'),
          upperRowId: Number(url.searchParams.get('upperRowId')), afterRowId: Number(url.searchParams.get('afterRowId') ?? -1),
          exportedAtMs: Number(url.searchParams.get('exportedAtMs')),
          excludedRowIds: (url.searchParams.get('excludedRowIds') ?? '').split(',').filter(Boolean).map(Number) });
        return jsonResponse(await habitat(env).getRecoveryPage(value), { headers: { 'cache-control': 'no-store' } });
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof TypeError || error instanceof RangeError) return errorResponse(400, 'invalid_recovery_page', 'Use a valid table, cursor and bounds from the recovery manifest.');
        throw error;
      }
    }
    if (request.method === 'GET' && url.pathname === '/v1/admin/recovery') {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      try {
        return jsonResponse(await habitat(env).getRecoveryExport(), { headers: { 'cache-control': 'no-store' } });
      } catch (error) {
        if (error instanceof RangeError) return errorResponse(413, 'recovery_core_too_large', 'The mutable recovery core exceeds its export bound; operator investigation is required.');
        throw error;
      }
    }
    if (request.method === 'POST' && url.pathname.startsWith('/v1/admin/')) {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;

      try {
        const body = await readJson(request);
        if (url.pathname === '/v1/admin/pause') {
          return jsonResponse(await habitat(env).pause(adminCommandSchema.parse(body)));
        }
        if (url.pathname === '/v1/admin/resume') {
          return jsonResponse(await habitat(env).resume(adminCommandSchema.parse(body)));
        }
        if (url.pathname === '/v1/admin/cognition/enqueue') {
          return errorResponse(410, 'enqueue_not_supported', 'Cognition is scheduled by the world clock. Arbitrary jobs cannot be enqueued.');
        }
        if (url.pathname === '/v1/admin/cognition/check') {
          return jsonResponse(await habitat(env).checkCognition(adminCommandSchema.parse(body)));
        }
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof TypeError) {
          return errorResponse(400, 'invalid_request', 'The request did not match the runtime contract.');
        }
        if (error instanceof RangeError) {
          return errorResponse(409, 'revision_conflict', error.message);
        }
        throw error;
      }
    }
    return errorResponse(404, 'not_found', 'Route not found.');
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(habitat(env).reconcile());
  },
} satisfies ExportedHandler<Env>;
