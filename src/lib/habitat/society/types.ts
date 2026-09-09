import type { ResidentId } from '../residents';
import type { RoomId } from '../rooms';
import type { Intent, Outcome, VerbName } from '../engine/verbs';
import type { WorldState } from '../engine/state';
import type { RecordsState } from './record-types';
import type { PreparedRecordRetrieval } from './retrieval-choice';
import type { RetrievalState } from './retrieval-state';
import type { PreparedAttention } from './attention-choice';

export const SOCIETY_VERSION = 4 as const;
export const SOCIETY_LIMITS = { memories: 24, steps: 6, conversations: 40, turns: 16, offers: 64, agreements: 64 } as const;
export const WORK_VERBS = ['work', 'dig', 'grow', 'cook', 'clean', 'inspect', 'repair', 'charge'] as const;
export const PLANNABLE_VERBS = ['go', 'rest', 'sleep', 'eat', 'drink', 'wash', 'work', 'dig', 'grow', 'cook', 'clean', 'inspect', 'repair', 'charge', 'observe', 'note', 'repay'] as const;
export type WorkVerb = (typeof WORK_VERBS)[number];
export type Evidence = {
  id: string; kind: 'observation' | 'claim' | 'commitment' | 'interpretation';
  text: string; refs: string[]; atWatch: number; createdAtMs: number;
  importance: number; source: ResidentId | null;
};
export type PlannedStep = {
  id: string; intent: Intent; at: RoomId | null; status: 'pending' | 'done' | 'failed'; evidenceId: string | null;
};
export type Project = {
  id: string; goal: string; why: string; visibility: 'public' | 'private';
  status: 'active' | 'completed' | 'abandoned'; createdAtMs: number; steps: PlannedStep[];
};
export type Mind = {
  id: ResidentId; revision: number; lastAttemptAtMs: number | null; lastSuccessAtMs: number | null;
  lastAppliedSequence: number; lastPhysicalWatch: number; project: Project | null; memories: Evidence[];
};
export type ConversationTurn = { id: string; index: number; speaker: ResidentId; text: string; atMs: number };
export type Conversation = {
  id: string; participants: [ResidentId, ResidentId]; revision: number; nextSpeaker: ResidentId | null;
  status: 'open' | 'closed' | 'expired'; createdAtMs: number; expiresAtMs: number; turns: ConversationTurn[];
  /** Private delivered revision per participant, not understanding or consent. */
  attentionThrough: [number, number];
  /** Latest incoming turn appraised by each participant. Absent in legacy v1.
   * Current readers retain v1 compatibility; older strict readers cannot read
   * this extension, so rolling back their binary after a write is unsupported. */
  appraisedThrough?: [number, number];
};
export type OfferTerms =
  | { kind: 'transfer'; from: ResidentId; to: ResidentId; cells: number }
  | { kind: 'loan'; from: ResidentId; to: ResidentId; cells: number; dueDay: number }
  | { kind: 'work'; worker: ResidentId; payer: ResidentId; cells: number; verb: WorkVerb; room: RoomId; units: number; dueWatch: number };
export type Offer = {
  id: string; conversationId: string; proposer: ResidentId; counterpart: ResidentId;
  terms: OfferTerms; status: 'open' | 'accepted' | 'rejected' | 'replaced' | 'expired';
  replaces: string | null; createdAtMs: number; expiresAtWatch: number; acceptedAtMs: number | null;
};
export type Agreement = {
  id: string; offerId: string; terms: OfferTerms; status: 'active' | 'payment_due' | 'fulfilled' | 'breached';
  acceptedAtMs: number; acceptedAtWatch: number; acceptedAfterEventSequence: number; progress: number; completedAtMs: number | null;
  evidenceIds: string[]; debtId: string | null;
};
/** Separate from the physical WorldState codec. No seeded history or achievements. */
export type SocietyState = {
  version: typeof SOCIETY_VERSION; revision: number; nextId: number; createdAtMs: number;
  minds: Record<ResidentId, Mind>; conversations: Conversation[]; offers: Offer[]; agreements: Agreement[];
  records: RecordsState;
  retrieval: RetrievalState;
};
export type StepProposal = Omit<Intent, 'actor'> & { at?: RoomId };
export type TurnResponse = {
  project?: { mode: 'replace'; goal: string; why: string; visibility: 'public' | 'private'; steps: StepProposal[] }
    | { mode: 'abandon'; why: string };
  reflection?: { text: string; refs: string[] };
  message?: { to: ResidentId; text: string; close?: boolean };
  offer?: { terms: OfferTerms; expiresInWatches: number; replaces?: string };
  respond?: { offerId: string; decision: 'accept' | 'reject' };
};
export type TurnOptions = { nowMs: number; generation: number; sequence: number; ttlMs?: number; maxPromptBytes?: number;
  dialoguePolicy?: 'concurrent-v1'; conversationId?: string | null };
export type PreparedTurn = {
  id: string; actor: ResidentId; mindRevision: number; sequence: number; generation: number;
  preparedAtMs: number; expiresAtMs: number;
  conversation: { id: string; revision: number; turn: number } | null;
  evidenceIds: string[]; prompt: string; promptBytes: number; contextOverflow: boolean;
  /** P7 trusted selection bindings; not model-authored and not provider prose. */
  recordRetrieval?: PreparedRecordRetrieval;
  /** P8 selected-channel authority is issued by preparation, never by model prose. */
  dialoguePolicy?: 'concurrent-v1';
  attention?: PreparedAttention;
  /** P8 durable authority, omitted from prose because IDs are in field enums. */
  recordAuthority?: { version: 1; cursor: RecordsState['cursors'][ResidentId];
    referenceAccess: { public: string[]; private: string[] } };
};
export type SocietyResult = { ok: boolean; code: string; state: SocietyState; world: WorldState };
/** Trusted engine input, never accepted from a model response. */
export type PhysicalObservation = {
  actor: ResidentId; day: number; watch: number; intent: Intent; outcome: Outcome;
  stepId?: string; interrupted?: string; actualRoom?: RoomId;
};
export type PlannedAction = { stepId: string; intent: Intent; at: RoomId | null };
export type WorkAction = { actor: ResidentId; verb: VerbName; room: RoomId };
