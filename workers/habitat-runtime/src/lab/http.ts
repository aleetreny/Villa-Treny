import { z } from 'zod';
import { hasValidAdminToken } from '../auth';
import { adminSecret } from '../habitat-world';
import { errorResponse, jsonResponse, readJson } from '../http';
import type { DebateForum } from '../debate/forum';
import { LAB_EXPERIMENTS } from '../../../../src/lib/lab/contracts';

const experimentSchema = z.enum(LAB_EXPERIMENTS);
const dateSchema = z.iso.date();
const json = (value: unknown, privateResponse = false) => jsonResponse(value, { headers: { 'cache-control': privateResponse ? 'private, no-store' : 'public, max-age=10', 'x-content-type-options': 'nosniff' } });

/** Public Lab routes are GET-only reads of stored results. No public request
 * can create a run, dispatch a model request or change an observation. */
export async function labHttp(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/v1/lab' && !url.pathname.startsWith('/v1/lab/') && !url.pathname.startsWith('/v1/admin/lab')) return null;
  const forum: DurableObjectStub<DebateForum> = env.DEBATE_FORUM.getByName('villa-treny-daily-v1');
  try {
    if (url.pathname.startsWith('/v1/admin/lab')) {
      const secret = adminSecret(env);
      if (!secret) return errorResponse(503, 'admin_not_configured', 'Administrative access is not configured.');
      if (!await hasValidAdminToken(request, secret)) return errorResponse(401, 'unauthorized', 'A valid bearer token is required.');
      if (request.method === 'GET' && url.pathname === '/v1/admin/lab') return json(await forum.labDiagnostics(), true);
      if (request.method === 'GET' && url.pathname === '/v1/admin/lab/export') return json(await forum.exportLab(dateSchema.parse(url.searchParams.get('date'))), true);
      if (request.method === 'POST' && url.pathname === '/v1/admin/lab/configure') return json(await forum.configureLab(await readJson(request)), true);
      return errorResponse(404, 'not_found', 'Route not found.');
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return errorResponse(405, 'read_only', 'The Lab is read-only.');
    if ([...url.searchParams.keys()].length) throw new TypeError('unexpected_query');
    if (url.pathname === '/v1/lab') return json(await forum.getLabOverview());
    const match = url.pathname.match(/^\/v1\/lab\/([a-z]+)(?:\/(\d{4}-\d{2}-\d{2}))?$/);
    if (match) {
      const experiment = experimentSchema.parse(match[1]);
      return json(match[2] ? await forum.getLabDay(experiment, dateSchema.parse(match[2])) : await forum.getLabHistory(experiment));
    }
    return errorResponse(404, 'not_found', 'Route not found.');
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof TypeError) return errorResponse(400, 'invalid_lab_request', 'The request did not match the Lab contract.');
    throw error;
  }
}
