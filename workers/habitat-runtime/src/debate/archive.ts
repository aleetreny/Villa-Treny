import { z } from 'zod';
import { DAILY_DOMAINS } from '../../../../src/lib/debate/contracts';
export const archiveFilterSchema = z.strictObject({
  before: z.iso.date().optional(), q: z.string().max(120).default(''), domain: z.enum(DAILY_DOMAINS).optional(),
  sort: z.enum(['recent','recommended']).default('recent'), score: z.number().int().nonnegative().optional(),
});
export type ArchiveFilter = z.infer<typeof archiveFilterSchema>;
/** Cursor score is kept separate from its date. Search wildcards are literal. */
export function archiveQuery(filter: ArchiveFilter) {
  const where = ["(?='' OR lower(COALESCE(json_extract(body,'$.case.title'),'') || ' ' || COALESCE(json_extract(body,'$.case.context'),'') || ' ' || COALESCE(json_extract(body,'$.summary.overview'),'')) LIKE ? ESCAPE '\\')"];
  const pattern = '%'+filter.q.toLowerCase().replace(/[\\%_]/g,'\\$&')+'%';
  const values: (string|number)[] = [filter.q,pattern];
  if (filter.domain) { where.push("json_extract(body,'$.domain')=?"); values.push(filter.domain); }
  if (filter.before) {
    if (filter.sort==='recommended') { if (filter.score===undefined) throw new TypeError('missing_cursor_score');where.push('(recommendations<? OR (recommendations=? AND id<?))');values.push(filter.score,filter.score,filter.before); }
    else { where.push('id<?');values.push(filter.before); }
  }
  const order=filter.sort==='recommended'?'recommendations DESC,id DESC':'id DESC';
  return {sql:'SELECT body,recommendations FROM debate_days WHERE '+where.join(' AND ')+' ORDER BY '+order+' LIMIT 21',values};
}
