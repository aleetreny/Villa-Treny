import type { ResidentId } from '../residents';
import type { WorldState } from '../engine/state';
import type { SocietyState } from './types';

export const RECORDS_VERSION = 1 as const;
export const RECORD_LIMITS = { contentBytes: 600, titleBytes: 96, refs: 4, drafts: 256,
  publications: 256, shares: 256, offers: 64, agreements: 64, intents: 25 } as const;
export type RecordAudience = 'public' | ResidentId;
/** A trusted preparation-time grant, never supplied by the model. */
export type RecordReference = { id: string; audience: 'public' | ResidentId[] };
export type RecordBinding = { draftId: string; contentHash: string };
export type AuthoredDraft = {
  id: string; author: ResidentId; title: string; text: string; refs: RecordReference[];
  parent: RecordBinding | null; contentHash: string; audience: RecordAudience | 'private';
  createdAtMs: number; createdAtWatch: number;
};
export type RecordShare = { id: string; draftId: string; contentHash: string; author: ResidentId;
  audience: RecordAudience; sharedAtMs: number };
export type RecordPublication = { id: string; draftId: string; contentHash: string;
  author: ResidentId; audience: RecordAudience; atWatch: number; publishedAtMs: number };
export type RecordPublicationIntent = { id: string; author: ResidentId; draftId: string;
  contentHash: string; audience: RecordAudience; scheduledAtWatch: number; earliestWatch: number };
export type RecordCommissionTerms = RecordBinding & { author: ResidentId; payer: ResidentId;
  cells: number; dueWatch: number; audience: RecordAudience };
export type RecordCommissionOffer = { id: string; proposer: ResidentId; counterpart: ResidentId;
  terms: RecordCommissionTerms; visibility: 'private' | 'public';
  status: 'open' | 'accepted' | 'rejected' | 'expired' | 'replaced';
  createdAtMs: number; createdAtWatch: number; expiresAtWatch: number };
export type RecordCommissionAgreement = { id: string; offerId: string; terms: RecordCommissionTerms;
  visibility: 'private' | 'public'; status: 'active' | 'payment_due' | 'fulfilled' | 'breached';
  acceptedAtMs: number; acceptedAtWatch: number; acceptedAfterId: number;
  publicationId: string | null; paidCells: number; settledAtMs: number | null };
export type RecordsState = {
  version: typeof RECORDS_VERSION; nextId: number; revision: number;
  archive: { drafts: number; publications: number; parents: Array<RecordBinding & { author: ResidentId }> };
  drafts: AuthoredDraft[]; publications: RecordPublication[]; shares: RecordShare[];
  offers: RecordCommissionOffer[]; agreements: RecordCommissionAgreement[]; intents: RecordPublicationIntent[];
  cursors: Record<ResidentId, { revision: number; lastSequence: number; lastPublicationWatch: number }>;
};
export type RecordOperation =
  | { kind: 'draft'; title: string; text: string; refs: string[]; parent: RecordBinding | null;
      audience: RecordAudience | 'private'; publish: boolean }
  | ({ kind: 'share' | 'schedule'; audience: RecordAudience } & RecordBinding)
  | { kind: 'cancel_publication'; intentId: string }
  | ({ kind: 'commission'; counterpart: ResidentId; cells: number; dueInWatches: number;
      audience: RecordAudience; visibility: 'private' | 'public' } & RecordBinding)
  | { kind: 'accept' | 'reject'; offerId: string };
export type RecordTurnContext = { actor: ResidentId; sequence: number; expectedRevision: number;
  nowMs: number; preparedRefs: readonly RecordReference[]; eligibleRecipients?: readonly ResidentId[] };
/** Old promises are read directly, avoiding a circular/double-counted money bridge. */
export type RecordLegacyContext = Pick<SocietyState, 'minds' | 'agreements'>;
export type RecordResult = { ok: boolean; code: string; records: RecordsState; world: WorldState; createdIds: string[] };
export type RecordPublicationSlot = { actor: ResidentId; intentId: string; watch: number; nowMs: number };
export type PublicRecordPublication = RecordPublication & { title: string; text: string; refs: string[];
  parentPublicationId: string | null };
export type PublicRecordsView = { publications: PublicRecordPublication[];
  offers: RecordCommissionOffer[]; agreements: RecordCommissionAgreement[] };
/** An authorized reader sees exact text and reference IDs, never access lists. */
export type RecordContextDraft = Omit<AuthoredDraft, 'refs'> & { refs: string[]; parentOmitted: boolean };
export type RecordContext = { cursor: RecordsState['cursors'][ResidentId]; drafts: RecordContextDraft[];
  offers: RecordCommissionOffer[]; agreements: RecordCommissionAgreement[];
  intent: RecordPublicationIntent | null; omitted: { drafts: number; offers: number; agreements: number } };
