import { z } from 'zod';
import { hasValidAdminToken } from '../auth';
import { adminSecret } from '../habitat-world';
import { errorResponse, jsonResponse, readJson } from '../http';
import type { DebateForum } from './forum';
import { archiveFilterSchema } from './archive';

const dateSchema = z.iso.date();
const json = (value: unknown, privateResponse = false) => jsonResponse(value, { headers: { 'cache-control': privateResponse ? 'private, no-store' : 'public, max-age=10', 'x-content-type-options': 'nosniff' } });
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2,'0')).join('');
async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}
async function reader(request: Request, secret: string) {
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-villa-reader=([a-f0-9-]{36})\.([a-f0-9]{64})(?:;|$)/);
  if (!cookie?.[1] || !cookie[2]) return null;
  const expected = await sign(secret, 'reader:' + cookie[1]);
  // Constant-length keyed signatures, constant-time comparison.
  let difference = 0; for (let i=0; i<64; i++) difference |= expected.charCodeAt(i) ^ cookie[2].charCodeAt(i);
  return difference === 0 ? cookie[1] : null;
}
export async function debateHttp(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/debates') && !url.pathname.startsWith('/v1/admin/debates')) return null;
  const forum: DurableObjectStub<DebateForum> = env.DEBATE_FORUM.getByName('villa-treny-daily-v1');
  try {
    if (url.pathname.startsWith('/v1/admin/debates')) {
      const secret = adminSecret(env);
      if (!secret) return errorResponse(503, 'admin_not_configured', 'Administrative access is not configured.');
      if (!await hasValidAdminToken(request, secret)) return errorResponse(401, 'unauthorized', 'A valid bearer token is required.');
      if (request.method === 'GET' && url.pathname === '/v1/admin/debates') return json(await forum.diagnostics(), true);
      if (request.method === 'GET' && url.pathname === '/v1/admin/debates/export') return json(await forum.exportEdition(dateSchema.parse(url.searchParams.get('date'))), true);
      if (request.method === 'POST') {
        const body = await readJson(request);
        if (url.pathname === '/v1/admin/debates/configure') return json(await forum.configure(body), true);
        if (url.pathname === '/v1/admin/debates/usage') return json(await forum.accountExternal(body), true);
        if (url.pathname === '/v1/admin/debates/adopt') {
          const input = z.strictObject({ day: z.unknown(), usage: z.unknown() }).parse(body);
          return json(await forum.adopt(input.day, input.usage), true);
        }
      }
    } else {
      if (request.method === 'GET' && url.pathname === '/v1/debates') {
        const allowed=['before','q','domain','sort','score'];
        if ([...url.searchParams.keys()].some(k => !allowed.includes(k)) || allowed.some(k=>url.searchParams.getAll(k).length>1)) throw new TypeError('invalid_cursor');
        const raw=Object.fromEntries(url.searchParams);
        const filter=archiveFilterSchema.parse({...raw,...(raw.score!==undefined?{score:Number(raw.score)}:{})});
        return json(await forum.getArchive(filter));
      }
      const match = url.pathname.match(/^\/v1\/debates\/(\d{4}-\d{2}-\d{2})(\/recommendation)?$/);
      if (match) {
        const id = dateSchema.parse(match[1]);
        if (!match[2] && request.method === 'GET') {
          const day = await forum.getEdition(id);
          return day ? json(day) : errorResponse(404, 'edition_not_found', 'This debate is not in the archive.');
        }
        if (match[2] && ['GET','PUT'].includes(request.method)) {
          const secret = adminSecret(env);
          if (!secret) return errorResponse(503, 'voting_unavailable', 'Recommendations are temporarily unavailable.');
          let identity = await reader(request, secret);
          if (request.method === 'GET') {
            const fresh = !identity; identity ??= crypto.randomUUID();
            const vote = await forum.getVote(id, identity);
            if (!vote) return errorResponse(404, 'edition_not_found', 'This debate is not in the archive.');
            const response = json(vote, true);
            if (fresh) response.headers.set('set-cookie', `__Host-villa-reader=${identity}.${await sign(secret, 'reader:' + identity)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`);
            return response;
          }
          if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return errorResponse(403, 'origin_required', 'Open the board before recommending a debate.');
          if (!identity) return errorResponse(409, 'reader_cookie_required', 'Allow this site’s cookie, then try again.');
          const input = z.strictObject({ recommended: z.boolean() }).parse(await readJson(request));
          const network = await sign(secret, 'network:' + new Date().toISOString().slice(0,10) + ':' + (request.headers.get('cf-connecting-ip') ?? 'local'));
          const result = await forum.vote(id, identity, input.recommended, network);
          if ('error' in result) return errorResponse(result.error === 'rate_limited' ? 429 : 409, result.error!, result.error === 'rate_limited' ? 'Too many changes. Try again later.' : 'Recommendations open when all twelve posts are published.');
          return json(result, true);
        }
      }
    }
    return errorResponse(404, 'not_found', 'Route not found.');
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof TypeError) return errorResponse(400, 'invalid_debate_request', 'The request did not match the debate contract.');
    if (error instanceof RangeError) return errorResponse(409, 'edition_conflict', 'An edition already exists for that date.');
    throw error;
  }
}
