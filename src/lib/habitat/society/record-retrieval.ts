import { RESIDENT_BY_ID, type ResidentId } from '../residents';
import { canReadRecord } from './records';
import { recordContentHash, recordSha256 } from './record-schema';
import { RECORD_LIMITS, type AuthoredDraft, type RecordBinding, type RecordsState } from './record-types';

export const RECORD_CATALOGUE_PAGE_SIZE = 3;
export const RECORD_QUERY_MAX_CHARACTERS = 96;

/** Metadata is private to its authorized reader. It grants no content reference,
 * reading claim, publication permission or new reader access. */
export type RecordCatalogueEntry = RecordBinding & {
  title: string;
  author: ResidentId;
  createdAtMs: number;
};
export type RecordCatalogueRequest = { query: string; cursor?: string };
export type RecordCataloguePage = {
  version: 1;
  actor: ResidentId;
  query: string;
  snapshotHash: string;
  offset: number;
  entries: RecordCatalogueEntry[];
  total: number;
  nextCursor: string | null;
};
export type RecordCatalogueResult = { ok: true; page: RecordCataloguePage }
  | { ok: false; code: 'invalid_record_query' | 'invalid_record_cursor' | 'invalid_record_reader' | 'refresh_required' };
export type RecordCatalogueSelection = { ok: true; binding: RecordBinding }
  | { ok: false; code: 'invalid_catalogue_page' | 'refresh_required' | 'unavailable_record_draft' };

const normalize = (text: string) => text.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();
function queryOf(value: unknown): string | undefined {
  // The cheap UTF-16 bound precedes normalization. No oversized query is sliced.
  if (typeof value !== 'string' || value.length > RECORD_QUERY_MAX_CHARACTERS * 2
    || /[\uD800-\uDFFF]/u.test(value) || [...value].length > RECORD_QUERY_MAX_CHARACTERS) return undefined;
  const query = normalize(value);
  return [...query].length <= RECORD_QUERY_MAX_CHARACTERS ? query : undefined;
}
const cursorFor = (snapshotHash: string, offset: number) => `record-catalogue-v1:${snapshotHash}:${offset}`;
function cursorOf(value: unknown): { snapshotHash: string; offset: number } | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^record-catalogue-v1:([a-f0-9]{64}):([1-9][0-9]{0,2})$/.exec(value);
  if (!match || !match[1]) return undefined;
  const offset = Number(match[2]);
  return offset < RECORD_LIMITS.drafts && offset % RECORD_CATALOGUE_PAGE_SIZE === 0
    ? { snapshotHash: match[1], offset } : undefined;
}
const metadata = (draft: AuthoredDraft): RecordCatalogueEntry => ({
  draftId: draft.id, contentHash: draft.contentHash, title: draft.title,
  author: draft.author, createdAtMs: draft.createdAtMs,
});
function rank(draft: AuthoredDraft, query: string): number | undefined {
  if (query === '') return 0;
  const title = normalize(draft.title);
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  return normalize(draft.text).includes(query) ? 3 : undefined;
}
function compareIds(a: string, b: string): number {
  const ordinalDifference = Number(b.split(':').at(-1)) - Number(a.split(':').at(-1));
  return ordinalDifference || (a < b ? -1 : a > b ? 1 : 0);
}

/** Literal substring search, not generated summaries or semantic search.
 * NFC, Unicode lowercase and collapsed whitespace affect matching only; exact
 * authored metadata survives. Empty query browses the retained readable set.
 *
 * Results are title-exact, title-prefix, title-containing, then body-containing;
 * ties use newest creation time, then descending immutable record ordinal.
 * Authorization precedes all title/body matching, ranking, counting and hashing.
 *
 * A cursor is valid only while this reader's ordered matching metadata remains
 * identical. Relevant insertion, grant or eviction requires an explicit restart
 * without a cursor. Unreadable or nonmatching changes cannot invalidate it.
 * This is a private working-set catalogue, not the historical publication API.
 */
export function searchRecordCatalogue(records: RecordsState, actor: ResidentId,
  request: RecordCatalogueRequest): RecordCatalogueResult {
  if (!Object.hasOwn(RESIDENT_BY_ID, actor)) return { ok: false, code: 'invalid_record_reader' };
  const query = queryOf(request?.query);
  if (query === undefined) return { ok: false, code: 'invalid_record_query' };
  const cursor = request.cursor === undefined ? undefined : cursorOf(request.cursor);
  if (request.cursor !== undefined && !cursor) return { ok: false, code: 'invalid_record_cursor' };
  const matches = records.drafts.filter(draft => canReadRecord(records, draft, actor)).flatMap(draft => {
    const score = rank(draft, query);
    return score === undefined ? [] : [{ draft, score }];
  }).sort((a, b) => a.score - b.score || b.draft.createdAtMs - a.draft.createdAtMs || compareIds(a.draft.id, b.draft.id));
  const entries = matches.map(({ draft }) => metadata(draft));
  // Do not use records.revision/nextId or inaccessible hashes here. No global
  // activity counter or another resident's catalogue influences this version.
  const snapshotHash = recordSha256(JSON.stringify({ version: 1, actor, query, entries }));
  if (cursor && cursor.snapshotHash !== snapshotHash) return { ok: false, code: 'refresh_required' };
  const offset = cursor?.offset ?? 0;
  if (cursor && offset >= entries.length) return { ok: false, code: 'invalid_record_cursor' };
  const next = offset + RECORD_CATALOGUE_PAGE_SIZE;
  return { ok: true, page: { version: 1, actor, query, snapshotHash, offset,
    entries: entries.slice(offset, next), total: entries.length,
    nextCursor: next < entries.length ? cursorFor(snapshotHash, next) : null } };
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function isPage(value: unknown): value is RecordCataloguePage {
  if (!object(value) || !keysAre(value, ['version', 'actor', 'query', 'snapshotHash', 'offset', 'entries', 'total', 'nextCursor'])
    || value.version !== 1 || typeof value.actor !== 'string' || !Object.hasOwn(RESIDENT_BY_ID, value.actor)
    || typeof value.query !== 'string' || queryOf(value.query) !== value.query
    || typeof value.snapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.snapshotHash)
    || !Number.isSafeInteger(value.offset) || (value.offset as number) < 0
    || (value.offset as number) >= RECORD_LIMITS.drafts || (value.offset as number) % RECORD_CATALOGUE_PAGE_SIZE !== 0
    || !Number.isSafeInteger(value.total) || (value.total as number) < 0 || (value.total as number) > RECORD_LIMITS.drafts
    || (value.nextCursor !== null && typeof value.nextCursor !== 'string')
    || !Array.isArray(value.entries) || value.entries.length > RECORD_CATALOGUE_PAGE_SIZE) return false;
  return value.entries.every(entry => object(entry)
    && keysAre(entry, ['draftId', 'contentHash', 'title', 'author', 'createdAtMs'])
    && typeof entry.draftId === 'string' && typeof entry.contentHash === 'string'
    && typeof entry.title === 'string' && typeof entry.author === 'string' && Number.isSafeInteger(entry.createdAtMs));
}
function sameEntry(a: RecordCatalogueEntry, b: RecordCatalogueEntry): boolean {
  return a.draftId === b.draftId && a.contentHash === b.contentHash && a.title === b.title
    && a.author === b.author && a.createdAtMs === b.createdAtMs;
}

/** The caller must supply its TRUSTED, privately persisted prepared page, never
 * a page, actor or query taken from model output. Snapshot hashes are integrity
 * bindings, not signatures authenticating a model-provided page. The model may
 * select only a draftId from that issued page.
 *
 * Revalidation returns a binding only. It neither reads into a model context
 * nor grants citation access, persists a focus or changes any record state.
 */
export function selectRecordCatalogueEntry(records: RecordsState, actor: ResidentId,
  preparedPage: RecordCataloguePage, draftId: string): RecordCatalogueSelection {
  if (!isPage(preparedPage) || preparedPage.actor !== actor) return { ok: false, code: 'invalid_catalogue_page' };
  const current = searchRecordCatalogue(records, actor, { query: preparedPage.query,
    ...(preparedPage.offset ? { cursor: cursorFor(preparedPage.snapshotHash, preparedPage.offset) } : {}) });
  if (!current.ok) return { ok: false, code: current.code === 'refresh_required' ? 'refresh_required' : 'invalid_catalogue_page' };
  const page = current.page;
  if (page.snapshotHash !== preparedPage.snapshotHash) return { ok: false, code: 'refresh_required' };
  if (page.total !== preparedPage.total || page.nextCursor !== preparedPage.nextCursor
    || page.entries.length !== preparedPage.entries.length
    || !page.entries.every((entry, index) => {
      const preparedEntry = preparedPage.entries[index];
      return preparedEntry !== undefined && sameEntry(entry, preparedEntry);
    }))
    return { ok: false, code: 'invalid_catalogue_page' };
  const selected = page.entries.find(entry => entry.draftId === draftId);
  const draft = selected && records.drafts.find(item => item.id === selected.draftId);
  if (!draft || !canReadRecord(records, draft, actor) || recordContentHash(draft) !== selected!.contentHash)
    return { ok: false, code: 'unavailable_record_draft' };
  return { ok: true, binding: { draftId: draft.id, contentHash: draft.contentHash } };
}
