import { useState } from 'react';
import type { AgencySnapshot, CognitionStatus } from '../../../lib/habitat/agency';
import { RESIDENTS, RESIDENT_BY_ID, type ResidentId } from '../../../lib/habitat/residents';
import { ROOM_BY_ID } from '../../../lib/habitat/rooms';
import type { OfferTerms } from '../../../lib/habitat/society/types';
import { AgencyTime, ResidentThoughts, thoughtStatusLabel } from './ResidentThoughts';
import { presentDialogueTurn } from '../../../lib/habitat/public-message-translation';
import { conversationOutcomes } from '../../../lib/habitat/conversation-outcomes';
import { PublishedRecords } from './PublishedRecords';

const amount = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const WATCH = ['I', 'II', 'III', 'IV'];
type OpenPerson = (id: ResidentId) => void;
type PublicResident = AgencySnapshot['residents'][number];

function Person({ id, onOpen }: { id: ResidentId; onOpen: OpenPerson }) {
  return <button type="button" className="ns-ledger__person" onClick={() => onOpen(id)}>{RESIDENT_BY_ID[id].name}</button>;
}

function watchLabel(watch: number) {
  return `day ${Math.floor(watch / 4)}, watch ${WATCH[watch % 4]}`;
}

function ProjectRecord({ person }: { person: PublicResident }) {
  const project = person.project;
  if (!project) return <p className="ns-ledger__note">No current project has been recorded.</p>;
  return <>
    <p>{project.visibility === 'private' ? 'This project is private.' : project.goal}</p>
    <p className="ns-ledger__note">{project.status === 'steps_finished' ? 'Planned steps finished' : project.status === 'abandoned' ? 'Abandoned' : 'In progress'}
      {project.totalSteps ? <> · {project.completedSteps} of {project.totalSteps} planned steps completed.</> : ' · No physical action planned.'}</p>
    {project.status === 'steps_finished' ? <p className="ns-ledger__note">Finished steps do not by themselves prove the broader goal was achieved.</p> : null}
  </>;
}

export function ResidentAgency({ id, agency }: { id: ResidentId; agency: AgencySnapshot | null | undefined }) {
  const person = agency?.residents.find((resident) => resident.id === id);
  return <article className="hab-block ns-resident-agency">
    <h3 className="hab-block__head">What they are working toward</h3>
    {!person ? <p className="hab-block__body--quiet">Their current project and thought record are not available yet.</p> : <>
      <ProjectRecord person={person} />
      <p className="ns-ledger__note">{person.lastSuccessAtMs === null ? 'No completed thought recorded yet.' : <>Last completed thought: <AgencyTime atMs={person.lastSuccessAtMs} />.</>}</p>
    </>}
  </article>;
}

export function AgreementTerms({ terms, onOpen, proposed = false }: { terms: OfferTerms; onOpen: OpenPerson; proposed?: boolean }) {
  if (terms.kind === 'work') return <p className="ns-terms">
    <Person id={terms.worker} onOpen={onOpen} />: {terms.units} {terms.verb} {terms.units === 1 ? 'action' : 'actions'} at {ROOM_BY_ID[terms.room].name}.
    {' '}{terms.cells === 0 ? <>Voluntary work; no payment {proposed ? 'proposed' : 'agreed'}.</> : <><Person id={terms.payer} onOpen={onOpen} /> {proposed ? 'would pay' : 'pays'} {amount.format(terms.cells)} cells on completion.</>} Due {watchLabel(terms.dueWatch)}.
  </p>;
  return <p className="ns-terms"><Person id={terms.from} onOpen={onOpen} /> {terms.kind === 'loan' ? proposed ? 'would lend' : 'lends' : proposed ? 'would give' : 'gives'} {amount.format(terms.cells)} cells to <Person id={terms.to} onOpen={onOpen} />.
    {terms.kind === 'loan' ? ` Repayment due day ${terms.dueDay}.` : null}</p>;
}

function RecordedOutcome({ agency, conversationId }: { agency: AgencySnapshot; conversationId: string }) {
  const outcomes = conversationOutcomes(agency, conversationId);
  return <section className="ns-recorded-outcome" aria-label="Recorded outcome">
    <h4>Recorded outcome</h4>
    {!outcomes.length ? <p className="ns-ledger__note">No offer or agreement record is visible for this conversation.</p>
      : <ul>{outcomes.map(outcome => <li key={outcome.offerId}>
        <p className="ns-recorded-outcome__title">{outcome.title}</p>
        <p>{outcome.detail}</p>
        {outcome.acceptedAtMs !== undefined ? <p className="ns-ledger__note">Accepted <AgencyTime atMs={outcome.acceptedAtMs} />.
          {outcome.completedAtMs !== undefined ? <> Completed <AgencyTime atMs={outcome.completedAtMs} />.</> : null}</p> : null}
        <details className="ns-evidence"><summary>Recorded references</summary>
          <p>Offer <code>{outcome.offerId}</code></p>
          {outcome.agreementId ? <p>Agreement <code>{outcome.agreementId}</code></p> : null}
          {outcome.debtId ? <p>Loan <code>{outcome.debtId}</code></p> : null}
          {outcome.evidenceIds.length ? <ul>{outcome.evidenceIds.map(id => <li key={id}><code>{id}</code></li>)}</ul> : null}
        </details>
      </li>)}</ul>}
  </section>;
}

export function AgencyNotebook({ agency, cognition, onOpen, recordsBase }: {
  agency: AgencySnapshot | null; cognition: CognitionStatus | null | undefined; onOpen: OpenPerson; recordsBase?: string;
}) {
  const [person, setPerson] = useState<ResidentId | ''>('');
  const includes = (participants: readonly ResidentId[]) => person === '' || participants.includes(person);
  const conversations = agency?.conversations.filter((conversation) => includes(conversation.participants)).slice().sort((a, b) => {
    const open = Number(b.status === 'open') - Number(a.status === 'open');
    return open || (b.turns.at(-1)?.atMs ?? 0) - (a.turns.at(-1)?.atMs ?? 0);
  }) ?? [];
  const projects = agency?.residents.filter((resident) => includes([resident.id]) && resident.project?.visibility === 'public') ?? [];
  const privateCount = agency?.residents.filter((resident) => includes([resident.id]) && resident.project?.visibility === 'private').length ?? 0;
  const offers = agency?.offers.filter((offer) => includes([offer.proposer, offer.counterpart])).slice().reverse() ?? [];
  const agreements = agency?.agreements.filter((agreement) => includes(agreement.participants)).slice().reverse() ?? [];
  return <div className="ns-lives">
    <details className="ns-ledger ns-thought-record">
      <summary>{thoughtStatusLabel(cognition)}</summary>
      <ResidentThoughts status={cognition} />
    </details>
    {!agency ? <p className="ns-message">Projects and conversations are not available yet. The journal, rooms and shared accounts can still be read.</p> : <>
      <label className="ns-search"><span>Read about</span><select value={person} onChange={(event) => setPerson(event.target.value as ResidentId | '')}>
        <option value="">Everyone</option>{RESIDENTS.map((resident) => <option key={resident.id} value={resident.id}>{resident.name}</option>)}
      </select></label>
      <details className="ns-ledger ns-projects">
        <summary>Projects · {projects.length} public{privateCount ? `, ${privateCount} private` : ''}</summary>
        {!projects.length ? <p className="ns-ledger__note">No public projects in this selection.</p> : <ul className="ns-lives-list">{projects.map((resident) => <li key={resident.id}>
          <h3><Person id={resident.id} onOpen={onOpen} /></h3><ProjectRecord person={resident} />
        </li>)}</ul>}
        {privateCount ? <p className="ns-ledger__note">Private goals and reasons remain private.</p> : null}
      </details>
      <PublishedRecords records={agency.records} person={person} onOpen={onOpen} base={recordsBase} />
      <section className="ns-conversations" aria-label="Resident conversations">
        <h3>In their own words</h3>
        <p className="ns-ledger__note">Words are their claims. Agreements and recorded outcomes show what followed.</p>
        {!conversations.length ? <p className="ns-message">No conversations have been recorded for this selection.</p> : <ol className="ns-lives-list">{conversations.map((conversation) => <li key={conversation.id} className="ns-conversation">
          <div className="ns-conversation__head"><span>{conversation.participants.map((id, index) => <span key={id}>{index ? ' & ' : ''}<Person id={id} onOpen={onOpen} /></span>)}</span><small>{conversation.status === 'open' ? 'Open' : conversation.status === 'closed' ? 'Closed' : 'Expired'}</small></div>
          <ol className="ns-conversation__turns">{conversation.turns.map((turn) => {
            const display = presentDialogueTurn(conversation.id, turn);
            return <li key={turn.id}>
              <div><Person id={turn.speaker} onOpen={onOpen} /><AgencyTime atMs={turn.atMs} /></div>
              <blockquote>{display.text}</blockquote>
              {display.translationLabel ? <p className="ns-ledger__note">{display.translationLabel}</p> : null}
            </li>;
          })}</ol>
          <RecordedOutcome agency={agency} conversationId={conversation.id} />
          {conversation.nextSpeaker ? <p className="ns-conversation__waiting">A reply is available to <Person id={conversation.nextSpeaker} onOpen={onOpen} />.<br /><span>Open until <AgencyTime atMs={conversation.expiresAtMs} />.</span></p> : null}
          <details className="ns-evidence"><summary>Record reference</summary><code>{conversation.id}</code></details>
        </li>)}</ol>}
      </section>
      <details className="ns-ledger ns-agreements">
        <summary>Offers &amp; agreements</summary>
        <h3>Offers</h3>
        <p className="ns-ledger__note">An open offer awaits the other resident’s decision. It is not a completed exchange.</p>
        {!offers.length ? <p className="ns-ledger__note">No offers in this selection.</p> : <ul className="ns-lives-list">{offers.map((offer) => <li key={offer.id}>
          <p className="ns-agreement__status">{offer.status === 'open' ? 'Awaiting a response' : offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}</p>
          <AgreementTerms terms={offer.terms} onOpen={onOpen} proposed />
          <p className="ns-ledger__note">Proposed by <Person id={offer.proposer} onOpen={onOpen} /> to <Person id={offer.counterpart} onOpen={onOpen} />. {offer.status === 'open' ? `Expires at the start of ${watchLabel(offer.expiresAtWatch)}.` : null}</p>
          <details className="ns-evidence"><summary>Record references</summary><p>Offer <code>{offer.id}</code></p><p>Conversation <code>{offer.conversationId}</code></p>{offer.replaces ? <p>Replaces <code>{offer.replaces}</code></p> : null}</details>
        </li>)}</ul>}
        <h3>Accepted agreements</h3>
        {!agreements.length ? <p className="ns-ledger__note">No agreements in this selection.</p> : <ul className="ns-lives-list">{agreements.map((agreement) => <li key={agreement.id}>
          <p className="ns-agreement__status" data-status={agreement.status}>{({ active: 'In progress', payment_due: 'Work completed · payment still due', fulfilled: 'Fulfilled', breached: 'Deadline missed' })[agreement.status]}</p>
          <AgreementTerms terms={agreement.terms} onOpen={onOpen} />
          {agreement.terms.kind === 'work' ? <p>{agreement.progress} of {agreement.terms.units} agreed actions recorded.</p> : null}
          <p className="ns-ledger__note">Accepted <AgencyTime atMs={agreement.acceptedAtMs} />.{agreement.completedAtMs !== null ? <> Completed <AgencyTime atMs={agreement.completedAtMs} />.</> : null}</p>
          <details className="ns-evidence"><summary>Recorded evidence{agreement.evidenceIds.length ? ` · ${agreement.evidenceIds.length}` : ''}</summary>
            <p>Agreement <code>{agreement.id}</code></p><p>Accepted offer <code>{agreement.offerId}</code></p>
            {agreement.debtId ? <p>Loan record <code>{agreement.debtId}</code></p> : null}
            {agreement.evidenceIds.length ? <ul>{agreement.evidenceIds.map((id) => <li key={id}><code>{id}</code></li>)}</ul> : <p>No work-event references are attached.</p>}
          </details>
        </li>)}</ul>}
      </details>
      <p className="ns-ledger__note">These records began <AgencyTime atMs={agency.startedAtMs} />. Earlier history remains in the journal.</p>
    </>}
  </div>;
}
