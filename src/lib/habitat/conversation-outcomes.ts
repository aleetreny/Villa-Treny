import type { AgencySnapshot } from './agency';
import { RESIDENT_BY_ID, type ResidentId } from './residents';
import { ROOM_BY_ID } from './rooms';
import type { OfferTerms } from './society/types';

const amount = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const person = (id: ResidentId) => RESIDENT_BY_ID[id].name;
type Offer = AgencySnapshot['offers'][number];
type Agreement = AgencySnapshot['agreements'][number];
export type ConversationOutcome = {
  offerId: string; agreementId?: string; debtId?: string; evidenceIds: readonly string[];
  title: string; detail: string; acceptedAtMs?: number; completedAtMs?: number;
};

function workDescription(terms: Extract<OfferTerms, { kind: 'work' }>) {
  const action = { work: 'labour-credit', dig: 'digging', grow: 'growing', cook: 'cooking',
    clean: terms.room === 'well' ? 'water-filtering' : 'cleaning', inspect: 'room-visit', repair: 'repair', charge: 'rack-work' }[terms.verb];
  return `${terms.units} ${action} ${terms.units === 1 ? 'action' : 'actions'} at ${ROOM_BY_ID[terms.room].name}`;
}

function proposal(offer: Offer): ConversationOutcome {
  const terms = offer.terms;
  const title = terms.kind === 'work'
    ? `Proposed: ${person(terms.worker)} would complete ${workDescription(terms)}.`
    : `Proposed: ${person(terms.from)} would ${terms.kind === 'loan' ? 'lend' : 'give'} ${amount.format(terms.cells)} cells to ${person(terms.to)}.`;
  const state = offer.status === 'open' ? `Awaiting ${person(offer.counterpart)}’s acceptance.`
    : offer.status === 'accepted' ? 'Acceptance is recorded; the agreement details are not visible in this record.'
    : offer.status === 'replaced' ? 'This proposal was replaced.'
    : offer.status === 'rejected' ? 'This proposal was rejected.' : 'This proposal expired.';
  const consequence = offer.status === 'accepted' ? '' : terms.kind === 'work'
    ? ' No accepted work commitment is recorded for this proposal.'
    : ' No transfer is recorded for this proposal.';
  const payment = terms.kind === 'work' ? terms.cells === 0 ? ' Voluntary work; no payment proposed.'
    : ` ${person(terms.payer)} would pay ${amount.format(terms.cells)} cells on completion.` : '';
  return { offerId: offer.id, evidenceIds: [], title, detail: `${state}${consequence}${payment}` };
}

function agreementOutcome(offer: Offer, agreement: Agreement): ConversationOutcome {
  const terms = agreement.terms;
  const base = { offerId: offer.id, agreementId: agreement.id, evidenceIds: [...agreement.evidenceIds],
    ...(agreement.debtId ? { debtId: agreement.debtId } : {}), acceptedAtMs: agreement.acceptedAtMs,
    ...(agreement.completedAtMs !== null ? { completedAtMs: agreement.completedAtMs } : {}) };
  if (terms.kind === 'transfer') return { ...base,
    title: agreement.status === 'fulfilled'
      ? `Transferred: ${amount.format(terms.cells)} cells from ${person(terms.from)} to ${person(terms.to)}.` : 'Transfer agreement accepted.',
    detail: agreement.status === 'fulfilled' ? 'Acceptance and transfer were recorded together.' : 'A completed transfer is not established by the visible agreement.' };
  if (terms.kind === 'loan') return { ...base,
    title: `Lent: ${amount.format(terms.cells)} cells from ${person(terms.from)} to ${person(terms.to)}.`,
    detail: agreement.status === 'fulfilled' ? 'Repayment completed.' : agreement.status === 'breached'
      ? `Repayment is overdue (due day ${terms.dueDay}).` : `Repayment remains open; due day ${terms.dueDay}.` };
  const progress = `${agreement.progress} of ${terms.units} agreed actions recorded.`;
  const payment = terms.cells === 0 ? 'Voluntary work; no payment agreed.'
    : agreement.status === 'fulfilled' ? `Payment recorded: ${amount.format(terms.cells)} cells from ${person(terms.payer)} to ${person(terms.worker)}.`
    : agreement.status === 'payment_due' ? `${amount.format(terms.cells)} cells are still due from ${person(terms.payer)}.`
    : `Completion payment of ${amount.format(terms.cells)} cells is not recorded.`;
  const status = agreement.status === 'fulfilled' ? 'Completed' : agreement.status === 'payment_due' ? 'Work recorded; payment pending'
    : agreement.status === 'breached' ? 'Work deadline missed' : 'Work accepted';
  return { ...base, title: `${status}: ${person(terms.worker)}, ${workDescription(terms)}.`, detail: `${progress} ${payment}` };
}

/** Existing ID links only. Neither speech, projects, author identity nor a
 * balance change can establish acceptance, work or payment. Bounded public
 * arrays may omit old records; missing linkage is not proof nothing happened. */
export function conversationOutcomes(agency: Pick<AgencySnapshot, 'offers' | 'agreements'>, conversationId: string): ConversationOutcome[] {
  return agency.offers.filter(offer => offer.conversationId === conversationId).map(offer => {
    const matches = agency.agreements.filter(agreement => agreement.offerId === offer.id);
    if (matches.length === 1 && offer.status === 'accepted') return agreementOutcome(offer, matches[0]);
    if (matches.length) return { offerId: offer.id, evidenceIds: [], title: 'Linked records need clarification.',
      detail: 'The visible offer and agreement records do not establish a consistent outcome.' };
    return proposal(offer);
  });
}
