import { RESIDENTS, type ResidentId } from './residents';
import { ROOMS } from './rooms';
import type { SocietyPublicView } from './society/public';
import type { OfferTerms } from './society/types';
import { isPublicRecordsView } from './public-records';

/** Public projection only; never import a resident's private mind into the UI. */
export type AgencySnapshot = SocietyPublicView;
export type CognitionStatus = {
  health: 'starting' | 'healthy' | 'degraded' | 'paused';
  successfulLastWatch: number;
  total: number;
  neverThought: number;
  lastSuccessfulThoughtAtMs: number | null;
  nextOpportunityAtMs: number | null;
  pendingResidents: ResidentId[];
  waitingForReply: ResidentId[];
  lastErrorCode?: string | null;
};

const residentIds: ReadonlySet<string> = new Set(RESIDENTS.map(({ id }) => id));
const roomIds: ReadonlySet<string> = new Set(ROOMS.map(({ id }) => id));
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const counter = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const dateValue = (value: unknown): value is number => counter(value) && value <= 8_640_000_000_000_000;
const timestamp = (value: unknown) => value === null || dateValue(value);
const resident = (value: unknown): value is ResidentId => typeof value === 'string' && residentIds.has(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(value);
const nullableId = (value: unknown) => value === null || identifier(value);
const uniqueIds = (values: unknown[]): boolean => values.every(identifier) && new Set(values).size === values.length;
const residentList = (value: unknown): value is ResidentId[] => Array.isArray(value) && value.length <= RESIDENTS.length && value.every(resident) && new Set(value).size === value.length;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const oneOf = (value: unknown, choices: readonly string[]) => typeof value === 'string' && choices.includes(value);

function isTerms(value: unknown): value is OfferTerms {
  if (!object(value) || typeof value.cells !== 'number' || !Number.isFinite(value.cells) || value.cells < 0 || value.cells > 1000) return false;
  if (value.kind === 'work') return exact(value, ['kind', 'worker', 'payer', 'cells', 'verb', 'room', 'units', 'dueWatch'])
    && resident(value.worker) && resident(value.payer) && value.worker !== value.payer
    && oneOf(value.verb, ['work', 'dig', 'grow', 'cook', 'clean', 'inspect', 'repair', 'charge'])
    && typeof value.room === 'string' && roomIds.has(value.room)
    && counter(value.units) && value.units >= 1 && value.units <= 4 && counter(value.dueWatch);
  return (value.kind === 'transfer' || value.kind === 'loan')
    && exact(value, ['kind', 'from', 'to', 'cells', ...(value.kind === 'loan' ? ['dueDay'] : [])])
    && resident(value.from) && resident(value.to) && value.from !== value.to && value.cells > 0
    && (value.kind !== 'loan' || counter(value.dueDay));
}

/** Reject private payload fields as well as malformed public state. */
export function isAgencySnapshot(value: unknown): value is AgencySnapshot {
  if (!object(value) || !exact(value, ['version', 'revision', 'startedAtMs', 'residents', 'conversations', 'offers', 'agreements', 'coverage', ...(value.version === 2 ? ['records'] : [])])
    || (value.version !== 1 && value.version !== 2) || (value.version === 2 && !isPublicRecordsView(value.records))
    || !counter(value.revision) || !dateValue(value.startedAtMs)
    || !Array.isArray(value.residents) || value.residents.length !== RESIDENTS.length
    || !Array.isArray(value.conversations) || value.conversations.length > 40
    || !Array.isArray(value.offers) || value.offers.length > 64
    || !Array.isArray(value.agreements) || value.agreements.length > 64) return false;
  if (!value.residents.every((entry: unknown) => {
    if (!object(entry) || !exact(entry, ['id', 'lastAttemptAtMs', 'lastSuccessAtMs', 'project'])
      || !resident(entry.id) || !timestamp(entry.lastAttemptAtMs) || !timestamp(entry.lastSuccessAtMs)) return false;
    const project = entry.project;
    return project === null || (object(project) && exact(project, ['id', 'visibility', 'goal', 'status', 'completedSteps', 'totalSteps'])
      && identifier(project.id) && oneOf(project.visibility, ['public', 'private'])
      && (project.visibility === 'private' ? project.goal === null : text(project.goal, 240))
      && oneOf(project.status, ['active', 'steps_finished', 'abandoned'])
      && counter(project.completedSteps) && counter(project.totalSteps)
      && project.totalSteps <= 6 && project.completedSteps <= project.totalSteps
      && (project.status !== 'steps_finished' || project.totalSteps > 0));
  }) || !uniqueIds(value.residents.map((entry: { id: unknown }) => entry.id))) return false;
  if (!value.conversations.every((conversation: unknown) => {
    if (!object(conversation) || !exact(conversation, ['id', 'participants', 'status', 'nextSpeaker', 'expiresAtMs', 'turns'])
      || !identifier(conversation.id) || !residentList(conversation.participants) || conversation.participants.length !== 2
      || !oneOf(conversation.status, ['open', 'closed', 'expired']) || !dateValue(conversation.expiresAtMs)
      || !Array.isArray(conversation.turns) || conversation.turns.length > 16) return false;
    const participants = conversation.participants;
    if (conversation.status === 'open' ? !resident(conversation.nextSpeaker) || !participants.includes(conversation.nextSpeaker) : conversation.nextSpeaker !== null) return false;
    return conversation.turns.every((turn: unknown, index) => object(turn) && exact(turn, ['id', 'speaker', 'text', 'atMs'])
      && identifier(turn.id) && resident(turn.speaker) && turn.speaker === participants[index % 2]
      && text(turn.text, 600) && dateValue(turn.atMs))
      && uniqueIds(conversation.turns.map((turn: { id: unknown }) => turn.id));
  }) || !uniqueIds(value.conversations.map((conversation: { id: unknown }) => conversation.id))) return false;
  if (!value.offers.every((offer: unknown) => object(offer)
    && exact(offer, ['id', 'conversationId', 'proposer', 'counterpart', 'terms', 'status', 'expiresAtWatch', 'replaces'])
    && identifier(offer.id) && identifier(offer.conversationId) && resident(offer.proposer) && resident(offer.counterpart)
    && offer.proposer !== offer.counterpart && isTerms(offer.terms)
    && oneOf(offer.status, ['open', 'accepted', 'rejected', 'replaced', 'expired'])
    && counter(offer.expiresAtWatch) && nullableId(offer.replaces))
    || !uniqueIds(value.offers.map((offer: { id: unknown }) => offer.id))) return false;
  if (!value.agreements.every((agreement: unknown) => {
    if (!object(agreement) || !exact(agreement, ['id', 'offerId', 'participants', 'terms', 'status', 'progress', 'acceptedAtMs', 'completedAtMs', 'debtId', 'evidenceIds'])
      || !identifier(agreement.id) || !identifier(agreement.offerId) || !residentList(agreement.participants) || agreement.participants.length !== 2
      || !isTerms(agreement.terms) || !oneOf(agreement.status, ['active', 'payment_due', 'fulfilled', 'breached'])
      || !counter(agreement.progress) || agreement.progress > 4 || !dateValue(agreement.acceptedAtMs)
      || !timestamp(agreement.completedAtMs) || !nullableId(agreement.debtId)
      || !Array.isArray(agreement.evidenceIds) || agreement.evidenceIds.length > 4 || !uniqueIds(agreement.evidenceIds)) return false;
    const terms = agreement.terms;
    const participants = terms.kind === 'work' ? [terms.worker, terms.payer] : [terms.from, terms.to];
    return participants.every((id) => (agreement.participants as ResidentId[]).includes(id))
      && (terms.kind !== 'work' || (agreement.progress <= terms.units && agreement.progress === agreement.evidenceIds.length));
  }) || !uniqueIds(value.agreements.map((agreement: { id: unknown }) => agreement.id))) return false;
  const coverage = value.coverage;
  if (!object(coverage) || !exact(coverage, ['total', 'neverThought', 'waitingForReply'])
    || coverage.total !== RESIDENTS.length || !counter(coverage.neverThought)
    || !residentList(coverage.waitingForReply)) return false;
  const snapshot = value as unknown as AgencySnapshot;
  const waiting = new Set(snapshot.conversations.filter((conversation) => conversation.status === 'open').map((conversation) => conversation.nextSpeaker));
  return coverage.neverThought === snapshot.residents.filter((person) => person.lastSuccessAtMs === null).length
    && waiting.size === coverage.waitingForReply.length && snapshot.coverage.waitingForReply.every((id) => waiting.has(id));
}

export function isCognitionStatus(value: unknown): value is CognitionStatus {
  return object(value) && exact(value, ['health', 'successfulLastWatch', 'total', 'neverThought', 'lastSuccessfulThoughtAtMs', 'nextOpportunityAtMs', 'pendingResidents', 'waitingForReply', ...(Object.hasOwn(value, 'lastErrorCode') ? ['lastErrorCode'] : [])])
    && oneOf(value.health, ['starting', 'healthy', 'degraded', 'paused']) && value.total === RESIDENTS.length
    && counter(value.successfulLastWatch) && value.successfulLastWatch <= RESIDENTS.length
    && counter(value.neverThought) && value.neverThought <= RESIDENTS.length
    && timestamp(value.lastSuccessfulThoughtAtMs) && timestamp(value.nextOpportunityAtMs)
    && residentList(value.pendingResidents) && residentList(value.waitingForReply)
    && (value.lastErrorCode === undefined || value.lastErrorCode === null || text(value.lastErrorCode, 100));
}
