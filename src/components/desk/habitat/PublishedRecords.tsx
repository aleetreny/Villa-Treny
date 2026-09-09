import { useEffect, useRef, useState } from 'react';
import { RESIDENT_BY_ID, type ResidentId } from '../../../lib/habitat/residents';
import { fetchHabitatRecords } from '../../../lib/habitat/live';
import type { PublicRecordPublication, PublicRecordsView, RecordCommissionTerms } from '../../../lib/habitat/society/record-types';
import { AgencyTime } from './ResidentThoughts';

type OpenPerson = (id: ResidentId) => void;
const amount = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const watches = ['I', 'II', 'III', 'IV'];
const when = (watch: number) => `day ${Math.floor(watch / 4)}, watch ${watches[watch % 4]}`;

function Person({ id, onOpen }: { id: ResidentId; onOpen: OpenPerson }) {
  return <button type="button" className="ns-ledger__person" onClick={() => onOpen(id)}>{RESIDENT_BY_ID[id].name}</button>;
}

function Publication({ publication: p, onOpen }: { publication: PublicRecordPublication; onOpen: OpenPerson }) {
  return <article className="ns-publication" aria-label={p.title}>
    <h3>{p.title}</h3>
    <p className="ns-ledger__note">Written by <Person id={p.author} onOpen={onOpen} />.<br />Published <AgencyTime atMs={p.publishedAtMs} /> · {when(p.atWatch)}.</p>
    <div className="ns-publication__text">{p.text}</div>
    <details className="ns-evidence"><summary>Revision and cited references</summary>
      <p>Publication <code>{p.id}</code></p><p>Written revision <code>{p.draftId}</code></p>
      <p>Content hash <code>{p.contentHash}</code></p>
      {p.parentPublicationId ? <p>Previous public version <code>{p.parentPublicationId}</code></p> : null}
      {p.refs.length ? <ul>{p.refs.map(ref => <li key={ref}><code>{ref}</code></li>)}</ul> : <p>No references cited.</p>}
    </details>
  </article>;
}

function CommissionTerms({ terms, onOpen }: { terms: RecordCommissionTerms; onOpen: OpenPerson }) {
  return <>
    <p><Person id={terms.author} onOpen={onOpen} /> is the author; <Person id={terms.payer} onOpen={onOpen} /> is the commissioner.</p>
    <p>{terms.cells === 0 ? 'Voluntary publication; no payment agreed.' : `Agreed completion payment: ${amount.format(terms.cells)} cells.`}
      {' '}Publication due by {when(terms.dueWatch)}.</p>
    <p className="ns-ledger__note">Audience: {terms.audience === 'public' ? 'everyone' : RESIDENT_BY_ID[terms.audience].name}.</p>
  </>;
}

/** This component receives only the public DTO, never drafts or access lists.
 * Browsing older publications is an explicit GET, independent of world time. */
export function PublishedRecords({ records, person, onOpen, base }: {
  records: PublicRecordsView | undefined; person: ResidentId | ''; onOpen: OpenPerson; base?: string;
}) {
  const [archive, setArchive] = useState<PublicRecordPublication[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [readArchive, setReadArchive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  if (!records) return null;
  const includes = (...ids: ResidentId[]) => person === '' || ids.includes(person);
  const combined = new Map(archive.map(p => [p.id, p]));
  for (const publication of records.publications) combined.set(publication.id, publication);
  const publications = [...combined.values()].filter(p => p.audience === 'public' && includes(p.author))
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs || b.id.localeCompare(a.id));
  const offers = records.offers.filter(o => o.visibility === 'public' && includes(o.proposer, o.counterpart)).slice().reverse();
  const agreements = records.agreements.filter(a => a.visibility === 'public' && includes(a.terms.author, a.terms.payer)).slice().reverse();
  const earlier = async () => {
    if (!base || request.current) return;
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(null);
    try {
      const page = await fetchHabitatRecords(base, { ...(readArchive && nextCursor !== null ? { before: nextCursor } : {}),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      if (controller.signal.aborted) return;
      setArchive(previous => [...new Map([...previous, ...page.entries].map(p => [p.id, p])).values()]);
      setNextCursor(page.nextCursor); setReadArchive(true);
    } catch {
      if (!controller.signal.aborted) setError('The writing archive could not be read. You can try again.');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  };
  return <>
    <details className="ns-ledger ns-publications">
      <summary>Published writings · {publications.length}</summary>
      <p className="ns-ledger__note">These are the authors’ exact published words. Publication and citations do not verify their claims or imply approval or payment.</p>
      {!publications.length ? <p className="ns-ledger__note">No public writings are visible in this selection.</p>
        : <ul className="ns-lives-list">{publications.map(p => <li key={p.id}><Publication publication={p} onOpen={onOpen} /></li>)}</ul>}
      {base && (!readArchive || nextCursor !== null) ? <button type="button" className="ns-ledger__person" disabled={loading} onClick={() => { void earlier(); }}>
        {loading ? 'Reading earlier writings…' : readArchive ? 'Earlier writings' : 'Browse writing archive'}</button> : null}
      {readArchive && nextCursor === null ? <p className="ns-ledger__note">Start of the public writing archive reached.</p> : null}
      {error ? <p className="ns-message" role="status">{error}</p> : null}
    </details>
    <details className="ns-ledger ns-document-commissions">
      <summary>Publication commissions · {offers.length} {offers.length === 1 ? 'proposal' : 'proposals'}, {agreements.length} accepted</summary>
      <p className="ns-ledger__note">Acceptance binds an exact written revision for publication. It does not endorse the text’s claims. Only explicitly public commissions appear here.</p>
      <ul className="ns-lives-list">{offers.map(o => <li key={o.id}>
        <h3>{o.status === 'open' ? 'Proposed commission' : `Commission proposal ${o.status}`}</h3>
        <p>Proposed by <Person id={o.proposer} onOpen={onOpen} /> to <Person id={o.counterpart} onOpen={onOpen} />.</p>
        <p>{o.terms.cells === 0 ? 'Voluntary publication; no payment proposed.' : `Proposed completion payment: ${amount.format(o.terms.cells)} cells.`}</p>
        <p className="ns-ledger__note">{o.status === 'open' ? `Awaiting acceptance. Expires at the start of ${when(o.expiresAtWatch)}.`
          : o.status === 'accepted' && !agreements.some(a => a.offerId === o.id) ? 'The accepted agreement is outside the visible record.' : 'This proposal alone is not a publication or payment record.'}</p>
        <details className="ns-evidence"><summary>Proposed revision</summary>
          <p>Offer <code>{o.id}</code></p><p>Written revision <code>{o.terms.draftId}</code></p><p>Content hash <code>{o.terms.contentHash}</code></p>
          <p>Audience: {o.terms.audience === 'public' ? 'everyone' : RESIDENT_BY_ID[o.terms.audience].name}. Due by {when(o.terms.dueWatch)}.</p>
        </details>
      </li>)}</ul>
      <ul className="ns-lives-list">{agreements.map(a => <li key={a.id}>
        <h3>{({ active: 'Accepted; awaiting publication', payment_due: 'Published; payment pending', fulfilled: 'Publication commission fulfilled', breached: 'Publication deadline missed' })[a.status]}</h3>
        <CommissionTerms terms={a.terms} onOpen={onOpen} />
        <p>{a.terms.cells === 0 ? 'No payment required.' : a.paidCells > 0 ? `Payment recorded: ${amount.format(a.paidCells)} cells.` : 'No payment recorded for this commission.'}</p>
        <p className="ns-ledger__note">Accepted <AgencyTime atMs={a.acceptedAtMs} />.
          {a.settledAtMs !== null ? <> Settled <AgencyTime atMs={a.settledAtMs} />.</> : null}</p>
        <details className="ns-evidence"><summary>Commission record and publication</summary>
          <p>Agreement <code>{a.id}</code></p><p>Accepted offer <code>{a.offerId}</code></p>
          <p>Written revision <code>{a.terms.draftId}</code></p><p>Content hash <code>{a.terms.contentHash}</code></p>
          {a.publicationId ? <p>Publication <code>{a.publicationId}</code>{a.terms.audience !== 'public' ? ' · The text is visible only to its recipient and author.' : null}</p> : <p>No qualifying publication is recorded for this commission.</p>}
        </details>
      </li>)}</ul>
      {!offers.length && !agreements.length ? <p className="ns-ledger__note">No public commission records are visible in this selection.</p> : null}
    </details>
  </>;
}
