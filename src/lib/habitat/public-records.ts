import { RESIDENTS, type ResidentId } from './residents';
import { RECORD_LIMITS, type PublicRecordsView } from './society/record-types';

const residents = new Set<string>(RESIDENTS.map(r => r.id));
const encoder = new TextEncoder();
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const resident = (value: unknown): value is ResidentId => typeof value === 'string' && residents.has(value);
const counter = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown): value is number => counter(value) && value <= 8_640_000_000_000_000;
const recordId = (value: unknown, kind: string): value is string => {
  if (typeof value !== 'string' || value.length > 100 || !new RegExp(`^record:${kind}:[0-9]+$`).test(value)) return false;
  const ordinal = value.split(':')[2], number = Number(ordinal);
  return counter(number) && String(number) === ordinal;
};
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const bytes = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.length > 0 && encoder.encode(value).length <= maximum;
const money = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
const audience = (value: unknown) => value === 'public' || resident(value);
const oneOf = (value: unknown, values: readonly string[]) => typeof value === 'string' && values.includes(value);
const unique = (items: Array<{ id: string }>) => new Set(items.map(item => item.id)).size === items.length;

function terms(value: unknown): value is PublicRecordsView['offers'][number]['terms'] {
  return object(value) && exact(value, ['draftId', 'contentHash', 'author', 'payer', 'cells', 'dueWatch', 'audience'])
    && recordId(value.draftId, 'draft') && digest(value.contentHash) && resident(value.author) && resident(value.payer)
    && value.author !== value.payer && money(value.cells) && counter(value.dueWatch) && audience(value.audience);
}

/** The observer never accepts drafts, access lists, intentions or private
 * commissions. Published prose and citations remain authored claims. */
export function isPublicRecordsView(value: unknown): value is PublicRecordsView {
  if (!object(value) || !exact(value, ['publications', 'offers', 'agreements'])
    || !Array.isArray(value.publications) || value.publications.length > RECORD_LIMITS.publications
    || !Array.isArray(value.offers) || value.offers.length > RECORD_LIMITS.offers
    || !Array.isArray(value.agreements) || value.agreements.length > RECORD_LIMITS.agreements) return false;
  if (!value.publications.every((p: unknown) => object(p)
    && exact(p, ['id', 'draftId', 'contentHash', 'author', 'audience', 'atWatch', 'publishedAtMs', 'title', 'text', 'refs', 'parentPublicationId'])
    && recordId(p.id, 'publication') && recordId(p.draftId, 'draft') && digest(p.contentHash) && resident(p.author)
    && p.audience === 'public' && counter(p.atWatch) && date(p.publishedAtMs)
    && bytes(p.title, RECORD_LIMITS.titleBytes) && bytes(p.text, RECORD_LIMITS.contentBytes)
    && encoder.encode(p.title + p.text).length <= RECORD_LIMITS.contentBytes
    && Array.isArray(p.refs) && p.refs.length <= RECORD_LIMITS.refs
    && p.refs.every(ref => typeof ref === 'string' && ref.length > 0 && ref.length <= 160) && new Set(p.refs).size === p.refs.length
    && (p.parentPublicationId === null || (recordId(p.parentPublicationId, 'publication') && p.parentPublicationId !== p.id)))) return false;
  if (!value.offers.every((o: unknown) => object(o)
    && exact(o, ['id', 'proposer', 'counterpart', 'terms', 'visibility', 'status', 'createdAtMs', 'createdAtWatch', 'expiresAtWatch'])
    && recordId(o.id, 'offer') && resident(o.proposer) && resident(o.counterpart) && o.proposer !== o.counterpart
    && terms(o.terms) && [o.terms.author, o.terms.payer].includes(o.proposer) && [o.terms.author, o.terms.payer].includes(o.counterpart)
    && o.visibility === 'public' && oneOf(o.status, ['open', 'accepted', 'rejected', 'expired', 'replaced'])
    && date(o.createdAtMs) && counter(o.createdAtWatch) && counter(o.expiresAtWatch)
    && o.expiresAtWatch > o.createdAtWatch && o.terms.dueWatch > o.createdAtWatch)) return false;
  if (!value.agreements.every((a: unknown) => object(a)
    && exact(a, ['id', 'offerId', 'terms', 'visibility', 'status', 'acceptedAtMs', 'acceptedAtWatch', 'acceptedAfterId', 'publicationId', 'paidCells', 'settledAtMs'])
    && recordId(a.id, 'agreement') && recordId(a.offerId, 'offer') && terms(a.terms) && a.visibility === 'public'
    && oneOf(a.status, ['active', 'payment_due', 'fulfilled', 'breached']) && date(a.acceptedAtMs)
    && counter(a.acceptedAtWatch) && counter(a.acceptedAfterId) && money(a.paidCells) && a.paidCells <= a.terms.cells
    && (a.publicationId === null || recordId(a.publicationId, 'publication')) && (a.settledAtMs === null || date(a.settledAtMs))
    && (['payment_due', 'fulfilled'].includes(a.status as string) === (a.publicationId !== null))
    && ((a.status === 'fulfilled') === (a.settledAtMs !== null))
    && (a.status !== 'fulfilled' || Math.abs(a.paidCells - a.terms.cells) < 1e-8))) return false;
  const records = value as unknown as PublicRecordsView;
  if (![records.publications, records.offers, records.agreements].every(unique)) return false;
  // A recipient-only publication may settle a public commission without its
  // text being public. Validate visible links; do not require hidden records.
  for (const a of records.agreements) {
    const offer = records.offers.find(o => o.id === a.offerId);
    if (offer && (offer.status !== 'accepted' || Object.keys(a.terms).some(key => a.terms[key as keyof typeof a.terms] !== offer.terms[key as keyof typeof offer.terms]))) return false;
    const publication = records.publications.find(p => p.id === a.publicationId);
    if (publication && (publication.draftId !== a.terms.draftId || publication.contentHash !== a.terms.contentHash
      || publication.author !== a.terms.author || publication.audience !== a.terms.audience
      || publication.atWatch < a.acceptedAtWatch || publication.atWatch > a.terms.dueWatch
      || publication.publishedAtMs < a.acceptedAtMs
      || Number(publication.id.split(':')[2]) < a.acceptedAfterId)) return false;
  }
  return true;
}
