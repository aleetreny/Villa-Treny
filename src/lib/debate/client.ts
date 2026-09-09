import { z } from 'zod';
import { archiveSchema, publicDebateSchema } from './contracts';
const base = import.meta.env.DEV ? '/__habitat/v1/debates' : '/v1/debates';
const voteSchema = z.object({ recommended: z.boolean(), recommendations: z.number().int().nonnegative() });
export type Recommendation = z.infer<typeof voteSchema>;
export class ForumError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function get<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const deadline=AbortSignal.timeout(15_000);
  const response = await fetch(url, { ...init, signal:signal?AbortSignal.any([signal,deadline]):deadline, credentials: 'same-origin', headers: { ...init?.headers, accept: 'application/json' } });
  if (!response.ok) throw new ForumError(response.status === 404 ? 'This debate could not be found.' : response.status === 429 ? 'Too many requests. Please try again in a minute.' : 'The board could not be reached. Please try again.', response.status);
  try { return schema.parse(await response.json()); } catch { throw new ForumError('The board returned an unreadable response. Please try again.',502); }
}
export type ArchiveQuery = { before?: string; score?: number; q?: string; domain?: string; sort?: string };
export const loadArchive = (query?: ArchiveQuery, signal?: AbortSignal) => { const params=new URLSearchParams();Object.entries(query??{}).forEach(([key,value])=>{if(value!==undefined&&value!=='')params.set(key,String(value));});return get(base+(params.size?'?'+params.toString():''),archiveSchema,signal); };
export const loadDebate = (date: string, signal?: AbortSignal) => get(base + '/' + encodeURIComponent(date), publicDebateSchema, signal);
export const loadRecommendation = (date: string, signal?: AbortSignal) => get(base + '/' + encodeURIComponent(date) + '/recommendation', voteSchema, signal);
export const setRecommendation = (date: string, recommended: boolean) => get(base + '/' + encodeURIComponent(date) + '/recommendation', voteSchema, undefined,
  { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recommended }) });
