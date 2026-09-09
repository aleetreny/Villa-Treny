import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { isPublicRecordsView } from './public-records';
import { isAgencySnapshot } from './agency';
import { fetchHabitatRecords, isObserverState } from './live';
import { genesisSnapshot } from './snapshot';
import { edges } from './weave';
import { societyPublicView, publicRecordPublication } from './society/public';
import { recordAct, recordFixture, publicCommissionFixture, acceptCommissionFixture, publishFixture } from './society/records-test-fixture';
import { advanceSocietyWatch } from './society/record-watch';
import { PublishedRecords } from '../../components/desk/habitat/PublishedRecords';

const render = (records: ReturnType<typeof societyPublicView>['records']) => renderToStaticMarkup(createElement(PublishedRecords, { records, person: '', onOpen: () => {} }));

describe('public written records', () => {
  it('keeps private, recipient-only and unpublished drafts out of the exact public projection', () => {
    let f = recordAct(recordFixture(), 'C', { kind: 'draft', title: 'PRIVATE_TITLE', text: 'PRIVATE_TEXT',
      refs: ['memory:PRIVATE_REF'], parent: null, audience: 'private', publish: false }, [{ id: 'memory:PRIVATE_REF', audience: ['C'] }]);
    f = recordAct(f, 'D', { kind: 'draft', title: 'SHARED_TITLE', text: 'SHARED_TEXT',
      refs: [], parent: null, audience: 'E', publish: true });
    f = publishFixture(f, 'D');
    f = recordAct(f, 'F', { kind: 'draft', title: 'UNPUBLISHED_TITLE', text: 'UNPUBLISHED_TEXT', refs: [], parent: null, audience: 'public', publish: false });
    const before = structuredClone(f.state), view = societyPublicView(f.state), text = JSON.stringify(view);
    expect(isAgencySnapshot(view)).toBe(true);
    expect(view.records).toEqual({ publications: [], offers: [], agreements: [] });
    for (const hidden of ['PRIVATE_', 'SHARED_', 'UNPUBLISHED_', 'cursors', 'drafts', 'intents', 'shares', 'archive']) expect(text).not.toContain(hidden);
    expect(f.state).toEqual(before);
  });

  it('separates proposal, acceptance, exact publication and actual payment without changing the world', () => {
    const proposed = publicCommissionFixture(), accepted = acceptCommissionFixture(proposed), published = publishFixture(accepted, 'A');
    const proposedView = societyPublicView(proposed.state), acceptedView = societyPublicView(accepted.state), publishedView = societyPublicView(published.state);
    for (const view of [proposedView, acceptedView, publishedView]) expect(isAgencySnapshot(view)).toBe(true);
    expect(proposedView.records!.publications).toEqual([]);
    expect(render(proposedView.records)).toContain('Proposed commission');
    expect(render(proposedView.records)).not.toContain('Payment recorded:');
    expect(render(acceptedView.records)).toContain('Accepted; awaiting publication');
    expect(accepted.world.bodies.A.cells).toBe(20); expect(accepted.world.bodies.B.cells).toBe(20);
    expect(published.world.bodies.A.cells).toBe(23); expect(published.world.bodies.B.cells).toBe(17);
    const publication = publishedView.records!.publications[0], before = JSON.stringify(published);
    expect(publication.title).toBe(proposed.state.records.drafts[0].title);
    expect(publication.text).toBe(proposed.state.records.drafts[0].text);
    expect(publication.refs).toEqual(['observation:public:1']);
    const html = render(publishedView.records);
    expect(html).toContain('Payment recorded: 3 cells.');
    expect(html).toContain(publication.contentHash); expect(html).toContain(publication.id);
    expect(html).toContain('&lt;em&gt;Exact authored text&lt;/em&gt;'); expect(html).not.toContain('<em>Exact authored text</em>');
    expect(html).toContain('do not verify their claims or imply approval or payment');
    expect(JSON.stringify(published)).toBe(before);
  });

  it('accepts a real publication in the pending physical watch while requiring later time and a new publication ID', () => {
    const accepted = acceptCommissionFixture(publicCommissionFixture());
    const completed = advanceSocietyWatch(accepted.state, accepted.world, accepted.now + 1);
    const view = societyPublicView(completed.state), records = view.records!;
    const publication = records.publications[0], agreement = records.agreements[0];
    expect(publication.atWatch).toBe(agreement.acceptedAtWatch);
    expect(agreement).toMatchObject({ status: 'fulfilled', publicationId: publication.id, paidCells: 3 });
    expect(isAgencySnapshot(view)).toBe(true);
    expect(isAgencySnapshot({ ...view, records: { ...records, publications: [{ ...publication, publishedAtMs: agreement.acceptedAtMs - 1 }] } })).toBe(false);
    expect(isAgencySnapshot({ ...view, records: { ...records, agreements: [{ ...agreement, acceptedAfterId: Number(publication.id.split(':')[2]) + 1 }] } })).toBe(false);
    expect(isAgencySnapshot({ ...view, records: { ...records, publications: [{ ...publication, atWatch: agreement.acceptedAtWatch - 1 }] } })).toBe(false);
  });

  it('keeps pending payment and voluntary publication distinct from recorded paid work', () => {
    const accepted = acceptCommissionFixture(publicCommissionFixture());
    accepted.world.bodies.B.cells = 0;
    const pending = publishFixture(accepted, 'A'), view = societyPublicView(pending.state);
    expect(isAgencySnapshot(view)).toBe(true); expect(view.records!.agreements[0].status).toBe('payment_due');
    expect(render(view.records)).toContain('Published; payment pending');
    expect(render(view.records)).not.toContain('Payment recorded:');
    const voluntary = publishFixture(acceptCommissionFixture(publicCommissionFixture(0)), 'A');
    const html = render(societyPublicView(voluntary.state).records);
    expect(html).toContain('Voluntary publication; no payment agreed.');
    expect(html).toContain('No payment required.'); expect(html).not.toContain('Payment recorded:');
    expect(voluntary.world.bodies.A.cells).toBe(20); expect(voluntary.world.bodies.B.cells).toBe(20);
  });

  it('keeps commission visibility independent from document audience, including real private payments', () => {
    const hiddenCommission = publishFixture(acceptCommissionFixture(publicCommissionFixture(3, 'private')), 'A');
    const view = societyPublicView(hiddenCommission.state);
    expect(isAgencySnapshot(view)).toBe(true);
    expect(view.records!.publications).toHaveLength(1);
    expect(view.records!.offers).toEqual([]); expect(view.records!.agreements).toEqual([]);
    expect(hiddenCommission.world.bodies.A.cells).toBe(23);
    expect(render(view.records)).not.toContain('Payment recorded:');
    const hiddenText = publishFixture(acceptCommissionFixture(publicCommissionFixture(3, 'public', 'B')), 'A');
    const recipientView = societyPublicView(hiddenText.state);
    expect(isAgencySnapshot(recipientView)).toBe(true);
    expect(recipientView.records!.publications).toEqual([]);
    expect(recipientView.records!.agreements[0].status).toBe('fulfilled');
    const html = render(recipientView.records);
    expect(html).toContain('Payment recorded: 3 cells.');
    expect(html).toContain('The text is visible only to its recipient and author.');
    expect(html).not.toContain('Filter visit notes');
    expect(html).not.toContain('water-quality measurement');
  });

  it('rejects private fields, recipient-only publications, corrupt links, invalid times and invented payment', () => {
    const view = societyPublicView(publishFixture(acceptCommissionFixture(publicCommissionFixture()), 'A').state);
    const records = view.records!;
    const mutations = [
      { ...records, drafts: [] },
      { ...records, publications: [{ ...records.publications[0], audience: 'B' }] },
      { ...records, publications: [{ ...records.publications[0], refs: [{ id: 'memory:1', audience: ['A'] }] }] },
      { ...records, publications: [{ ...records.publications[0], publishedAtMs: Number.MAX_SAFE_INTEGER }] },
      { ...records, publications: [records.publications[0], records.publications[0]] },
      { ...records, offers: [{ ...records.offers[0], visibility: 'private' }] },
      { ...records, agreements: [{ ...records.agreements[0], paidCells: 2.99 }] },
      { ...records, agreements: [{ ...records.agreements[0], terms: { ...records.agreements[0].terms, author: 'C' } }] },
    ];
    for (const records of mutations) expect(isAgencySnapshot({ ...view, records })).toBe(false);
    expect(isAgencySnapshot({ ...view, version: 2, records: undefined })).toBe(false);
    const { records: _records, ...legacy } = view;
    expect(_records).toBeDefined(); expect(isAgencySnapshot({ ...legacy, version: 1 })).toBe(true);
    expect(isObserverState({ worldRevision: 10, snapshot: genesisSnapshot(), relationships: edges(), agency: view })).toBe(true);
  });

  it('uses the same publication allowlist in permanent archives and never exposes a private reference or parent draft', () => {
    const f = publishFixture(acceptCommissionFixture(publicCommissionFixture()), 'A');
    const p = f.state.records.publications[0], d = f.state.records.drafts[0];
    expect(publicRecordPublication(p, d)).toEqual(societyPublicView(f.state).records!.publications[0]);
    expect(publicRecordPublication({ ...p, audience: 'B' }, d)).toBeUndefined();
    expect(publicRecordPublication(p, { ...d, author: 'B' })).toBeUndefined();
    expect(publicRecordPublication(p, { ...d, refs: [{ id: 'memory:PRIVATE', audience: ['A'] }] })).toBeUndefined();
    expect(publicRecordPublication(p, { ...d, parent: { draftId: 'record:draft:999', contentHash: 'a'.repeat(64) } })!.parentPublicationId).toBeNull();
  });

  it('reads validated public archive pages with no credentials and rejects private content or stalled cursors', async () => {
    const p = societyPublicView(publishFixture(acceptCommissionFixture(publicCommissionFixture()), 'A').state).records!.publications[0];
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ entries: [p], nextCursor: 8 })));
    await expect(fetchHabitatRecords('https://fixture.example/prefix', { before: 9, fetcher })).resolves.toEqual({ entries: [p], nextCursor: 8 });
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://fixture.example/prefix/v1/records?limit=20&before=9');
    expect(options).toMatchObject({ method: 'GET', credentials: 'omit' });
    for (const page of [{ entries: [p], nextCursor: 9 }, { entries: [{ ...p, audience: 'B' }], nextCursor: null }, { entries: [p], nextCursor: null, privateDrafts: [] }]) {
      const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(page)));
      await expect(fetchHabitatRecords('https://fixture.example', { before: 9, fetcher })).rejects.toThrow('could not be read');
    }
    expect(isPublicRecordsView({ publications: [p], offers: [], agreements: [] })).toBe(true);
  });
});
