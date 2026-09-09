import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { genesisState } from '../engine/state';
import type { ResidentId } from '../residents';
import { emptyRecordsState, validateRecordsState } from './record-schema';
import { applyRecordOperation, canReadRecord, publicRecordView, recordContext } from './records';
import type { AuthoredDraft, RecordOperation } from './record-types';
import { RECORD_CATALOGUE_PAGE_SIZE, searchRecordCatalogue, selectRecordCatalogueEntry,
  type RecordCataloguePage } from './record-retrieval';

function fixture() { return { records: emptyRecordsState(), world: genesisState(41), clock: 1000 }; }
type Fixture = ReturnType<typeof fixture>;
function apply(f: Fixture, actor: ResidentId, operation: RecordOperation) {
  const cursor = f.records.cursors[actor];
  const result = applyRecordOperation(f.records, f.world, { actor, sequence: cursor.lastSequence + 1,
    expectedRevision: cursor.revision, nowMs: ++f.clock, preparedRefs: [] }, operation);
  expect(result.code).toBe('applied');
  f.records = result.records; f.world = result.world;
}
function draft(f: Fixture, title: string, options: { actor?: ResidentId; text?: string; audience?: 'private' | 'public' | ResidentId } = {}) {
  apply(f, options.actor ?? 'A', { kind: 'draft', title, text: options.text ?? 'Exact authored claim.',
    refs: [], parent: null, audience: options.audience ?? 'private', publish: false });
  return f.records.drafts.at(-1)!;
}
const binding = (d: AuthoredDraft) => ({ draftId: d.id, contentHash: d.contentHash });
function page(f: Fixture, actor: ResidentId, query = '', cursor?: string): RecordCataloguePage {
  const result = searchRecordCatalogue(f.records, actor, { query, ...(cursor ? { cursor } : {}) });
  if (!result.ok) throw Error(result.code);
  return result.page;
}
beforeEach(() => vi.stubGlobal('fetch', () => { throw Error('No model, network or server access is permitted'); }));
afterEach(() => vi.unstubAllGlobals());

describe('private authorized record search', () => {
  it('finds and selects retained Alpha after Beta, without changing P6 selection or sharing until explicitly requested', () => {
    const f = fixture(), alpha = draft(f, 'Alpha', { actor: 'W' });
    const beta = draft(f, 'Beta', { actor: 'W' });
    expect(recordContext(f.records, 'W').drafts.map(d => d.id)).toEqual([beta.id]);
    const before = structuredClone(f), publicBefore = publicRecordView(f.records);
    const catalogue = page(f, 'W', 'alpha');
    expect(catalogue.total).toBe(1);
    expect(catalogue.entries).toEqual([{ ...binding(alpha), title: 'Alpha', author: 'W', createdAtMs: alpha.createdAtMs }]);
    const selected = selectRecordCatalogueEntry(f.records, 'W', JSON.parse(JSON.stringify(catalogue)), alpha.id);
    expect(selected).toEqual({ ok: true, binding: binding(alpha) });
    expect(f).toEqual(before); expect(publicRecordView(f.records)).toEqual(publicBefore);
    expect(canReadRecord(f.records, alpha, 'B')).toBe(false);
    // Only this separate domain operation grants B access; selection itself did not.
    apply(f, 'W', { kind: 'share', ...binding(alpha), audience: 'B' });
    expect(canReadRecord(f.records, f.records.drafts[0], 'B')).toBe(true);
    expect(f.records.publications).toEqual([]); expect(f.records.agreements).toEqual([]);
    expect(f.world).toEqual(before.world);
  });

  it('uses exact-title/prefix/title-containing/body-containing ranks and preserves source metadata', () => {
    const f = fixture();
    const exact = draft(f, '  ALPHA  '), prefix = draft(f, 'Alpha plan'), contains = draft(f, 'Plan for alpha');
    const body = draft(f, 'Unrelated title', { text: 'A note concerning ALPHA.' });
    const first = page(f, 'A', ' AlPhA ');
    expect(first.query).toBe('alpha'); expect(first.total).toBe(4);
    expect(first.entries.map(d => d.draftId)).toEqual([exact.id, prefix.id, contains.id]);
    expect(first.entries[0].title).toBe('  ALPHA  ');
    expect(page(f, 'A', 'alpha', first.nextCursor!).entries.map(d => d.draftId)).toEqual([body.id]);
  });

  it('matches literal Unicode-normalized text and whitespace, with no regex, stemming or generated snippets', () => {
    const f = fixture(), d = draft(f, 'Cafe\u0301 \n water', { text: 'The marker .* is literal.' });
    expect(page(f, 'A', 'CAFÉ water').entries[0].title).toBe(d.title);
    expect(page(f, 'A', 'cafe').total).toBe(0); // Accent removal is not an implicit search rule.
    expect(page(f, 'A', '.*').entries[0].draftId).toBe(d.id);
    expect(page(f, 'A', '^Cafe').total).toBe(0);
    expect(Object.keys(page(f, 'A', '.*').entries[0]).sort())
      .toEqual(['author', 'contentHash', 'createdAtMs', 'draftId', 'title']);
    expect(JSON.stringify(page(f, 'A', '.*'))).not.toContain(d.text);
  });

  it('filters ACL before touching private title/body fields, counting or snapshot hashing', () => {
    const f = fixture(), visible = draft(f, 'Water', { audience: 'B' });
    draft(f, 'Hidden water', { actor: 'C', text: 'Secret water context.' });
    const secret = f.records.drafts.at(-1)!;
    Object.defineProperty(secret, 'title', { get: () => { throw Error('Unauthorized title was read'); } });
    Object.defineProperty(secret, 'text', { get: () => { throw Error('Unauthorized body was read'); } });
    Object.defineProperty(secret, 'contentHash', { get: () => { throw Error('Unauthorized hash was read'); } });
    const result = page(f, 'B', 'water');
    expect(result.total).toBe(1); expect(result.entries[0].draftId).toBe(visible.id);
    expect(page(f, 'D', 'water').total).toBe(0);
  });

  it('keeps a cursor identical under inaccessible changes and authorized changes that do not match', () => {
    const f = fixture(); for (let i = 0; i < 5; i++) draft(f, `Water ${i}`, { audience: 'B' });
    const first = page(f, 'B', 'water'), originalNext = page(f, 'B', 'water', first.nextCursor!);
    const hidden = draft(f, 'Water classified', { actor: 'C' });
    apply(f, 'C', { kind: 'share', ...binding(hidden), audience: 'D' });
    draft(f, 'Cooking', { audience: 'B', text: 'No search term is present.' });
    expect(page(f, 'B', 'water')).toEqual(first);
    expect(page(f, 'B', 'water', first.nextCursor!)).toEqual(originalNext);
  });

  it('requires explicit refresh for a relevant insertion instead of silently skipping or duplicating page entries', () => {
    const f = fixture(); for (let i = 0; i < 5; i++) draft(f, `Water ${i}`);
    const first = page(f, 'A', 'water'), added = draft(f, 'Water newest');
    expect(searchRecordCatalogue(f.records, 'A', { query: 'water', cursor: first.nextCursor! }))
      .toEqual({ ok: false, code: 'refresh_required' });
    expect(selectRecordCatalogueEntry(f.records, 'A', first, first.entries[0].draftId))
      .toEqual({ ok: false, code: 'refresh_required' });
    const refreshed = page(f, 'A', 'water');
    expect(refreshed.total).toBe(6); expect(refreshed.entries[0].draftId).toBe(added.id);
  });

  it('discovers a newly granted older revision after refresh without exposing the prior private catalogue', () => {
    const f = fixture(), older = draft(f, 'Water oldest', { actor: 'C' });
    for (let i = 0; i < 4; i++) draft(f, `Water ${i}`, { audience: 'B' });
    const first = page(f, 'B', 'water'); expect(first.total).toBe(4);
    apply(f, 'C', { kind: 'share', ...binding(older), audience: 'B' });
    expect(searchRecordCatalogue(f.records, 'B', { query: 'water', cursor: first.nextCursor! }))
      .toEqual({ ok: false, code: 'refresh_required' });
    const refreshed = page(f, 'B', 'water'), second = page(f, 'B', 'water', refreshed.nextCursor!);
    expect(refreshed.total).toBe(5); expect(second.entries.map(d => d.draftId)).toContain(older.id);
    expect(selectRecordCatalogueEntry(f.records, 'B', second, older.id)).toEqual({ ok: true, binding: binding(older) });
    expect(page(f, 'D', 'water').total).toBe(0);
  });

  it('requires refresh after actual working-set eviction and never reconstructs an eliminated private draft', () => {
    const f = fixture(), oldest = draft(f, 'Alpha');
    for (let i = 1; i < 256; i++) draft(f, `Other ${i}`);
    expect(validateRecordsState(f.records).ok).toBe(true);
    const first = page(f, 'A', 'alpha'); expect(first.total).toBe(1);
    draft(f, 'Replacement'); // The real domain evicts the oldest eligible draft.
    expect(f.records.drafts.some(d => d.id === oldest.id)).toBe(false);
    expect(selectRecordCatalogueEntry(f.records, 'A', first, oldest.id)).toEqual({ ok: false, code: 'refresh_required' });
    expect(page(f, 'A', 'alpha').entries).toEqual([]);
    expect(f.records.archive.drafts).toBe(1);
  });

  it('traverses a fixed matching snapshot without duplicates and deterministically breaks timestamp ties', () => {
    const f = fixture(); for (let i = 0; i < 8; i++) draft(f, 'Repeated title');
    for (const d of f.records.drafts) d.createdAtMs = 1001;
    const seen: string[] = []; let cursor: string | undefined;
    do { const current = page(f, 'A', '', cursor); expect(current.entries.length).toBeLessThanOrEqual(RECORD_CATALOGUE_PAGE_SIZE);
      seen.push(...current.entries.map(d => d.draftId)); cursor = current.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual([...f.records.drafts].reverse().map(d => d.id));
    expect(new Set(seen).size).toBe(8);
  });

  it('binds cursors to actor and normalized query and rejects malformed offsets without leaking results', () => {
    const f = fixture(); for (let i = 0; i < 5; i++) draft(f, `Water ${i}`, { audience: 'public' });
    const first = page(f, 'A', 'water');
    expect(page(f, 'A', ' WATER ', first.nextCursor!).entries).toHaveLength(2);
    for (const [actor, query] of [['B', 'water'], ['A', 'other']] as const)
      expect(searchRecordCatalogue(f.records, actor, { query, cursor: first.nextCursor! })).toEqual({ ok: false, code: 'refresh_required' });
    for (const cursor of ['', 'record-catalogue-v2:other:3', first.nextCursor!.replace(/:3$/, ':1'),
      first.nextCursor!.replace(/:3$/, ':999'), first.nextCursor!.replace(/:3$/, ':6')])
      expect(searchRecordCatalogue(f.records, 'A', { query: 'water', cursor })).toEqual({ ok: false, code: 'invalid_record_cursor' });
  });

  it('rejects forged page metadata, other actors and IDs not on the privately prepared page', () => {
    const f = fixture(); for (let i = 0; i < 5; i++) draft(f, `Water ${i}`, { audience: 'B' });
    const first = page(f, 'A', 'water'), shown = first.entries[0].draftId, absent = f.records.drafts[0].id;
    expect(selectRecordCatalogueEntry(f.records, 'B', first, shown)).toEqual({ ok: false, code: 'invalid_catalogue_page' });
    expect(selectRecordCatalogueEntry(f.records, 'A', first, absent)).toEqual({ ok: false, code: 'unavailable_record_draft' });
    for (const tamper of [
      (p: RecordCataloguePage) => { p.entries[0].title = 'Invented title'; },
      (p: RecordCataloguePage) => { p.entries[0].contentHash = '0'.repeat(64); },
      (p: RecordCataloguePage) => { p.entries[0].draftId = absent; },
      (p: RecordCataloguePage) => { p.total++; },
      (p: RecordCataloguePage) => { p.nextCursor = null; },
    ]) { const changed = structuredClone(first); tamper(changed);
      expect(selectRecordCatalogueEntry(f.records, 'A', changed, shown)).toEqual({ ok: false, code: 'invalid_catalogue_page' });
    }
    const reordered = { ...first, entries: first.entries.map(d => ({ createdAtMs: d.createdAtMs, author: d.author, title: d.title,
      contentHash: d.contentHash, draftId: d.draftId })) };
    expect(selectRecordCatalogueEntry(f.records, 'A', reordered, shown).ok).toBe(true);
  });

  it('rechecks current permissions and exact authored content at selection time', () => {
    const f = fixture(), source = draft(f, 'Alpha', { audience: 'B' }), before = page(f, 'B', 'alpha');
    f.records.drafts[0].audience = 'private'; // Adversarial access-change boundary.
    expect(selectRecordCatalogueEntry(f.records, 'B', before, source.id)).toEqual({ ok: false, code: 'refresh_required' });
    f.records.drafts[0].audience = 'B'; f.records.drafts[0].text = 'Tampered text with its old hash.';
    expect(selectRecordCatalogueEntry(f.records, 'B', before, source.id)).toEqual({ ok: false, code: 'unavailable_record_draft' });
  });

  it('rejects over-bound and malformed Unicode queries without silently truncating them', () => {
    const f = fixture();
    for (const query of ['a'.repeat(97), '🙂'.repeat(97), '\ud800', '\udfff', 'İ'.repeat(96)])
      expect(searchRecordCatalogue(f.records, 'A', { query })).toEqual({ ok: false, code: 'invalid_record_query' });
    for (const query of ['a'.repeat(96), '🙂'.repeat(96), '', ' \n\t '])
      expect(searchRecordCatalogue(f.records, 'A', { query }).ok).toBe(true);
    expect(searchRecordCatalogue(f.records, 'constructor' as ResidentId, { query: '' }))
      .toEqual({ ok: false, code: 'invalid_record_reader' });
  });
});
