import { RESIDENTS } from '../residents';
import { parties } from './economy';
import { publicRecordView } from './records';
import type { OfferTerms, SocietyState } from './types';
export { publicRecordPublication } from './public-record-publication';

function publicTerms(terms: OfferTerms): OfferTerms {
  if (terms.kind === 'work') return { kind: terms.kind, worker: terms.worker, payer: terms.payer,
    cells: terms.cells, verb: terms.verb, room: terms.room, units: terms.units, dueWatch: terms.dueWatch };
  if (terms.kind === 'loan') return { kind: terms.kind, from: terms.from, to: terms.to, cells: terms.cells, dueDay: terms.dueDay };
  return { kind: terms.kind, from: terms.from, to: terms.to, cells: terms.cells };
}

/** Explicit allowlist. Never spread a mind, job, actor context or reflection
 * into public JSON. Conversation turns are voluntarily communicated claims. */
export function societyPublicView(state: SocietyState) {
  return {
    // Public DTO2 is independent of the private cognitive codec. Retrieval
    // queries, cursors and focus never enter an observer response.
    version: 2 as 1 | 2, revision: state.revision, startedAtMs: state.createdAtMs,
    records: publicRecordView(state.records),
    residents: RESIDENTS.map(({ id }) => {
      const m = state.minds[id], project = m.project;
      return { id, lastAttemptAtMs: m.lastAttemptAtMs, lastSuccessAtMs: m.lastSuccessAtMs,
        project: project ? { id: project.id, visibility: project.visibility,
          goal: project.visibility === 'public' ? project.goal : null,
          status: project.status === 'completed' ? 'steps_finished' as const : project.status,
          completedSteps: project.steps.filter((p) => p.status === 'done').length, totalSteps: project.steps.length } : null };
    }),
    conversations: state.conversations.map((c) => ({ id: c.id, participants: [...c.participants],
      status: c.status, nextSpeaker: c.nextSpeaker, expiresAtMs: c.expiresAtMs,
      turns: c.turns.map((t) => ({ id: t.id, speaker: t.speaker, text: t.text, atMs: t.atMs })) })),
    offers: state.offers.map((o) => ({ id: o.id, conversationId: o.conversationId, proposer: o.proposer,
      counterpart: o.counterpart, terms: publicTerms(o.terms), status: o.status, expiresAtWatch: o.expiresAtWatch, replaces: o.replaces })),
    agreements: state.agreements.map((a) => ({ id: a.id, offerId: a.offerId, participants: parties(a.terms), terms: publicTerms(a.terms),
      status: a.status, progress: a.progress, acceptedAtMs: a.acceptedAtMs, completedAtMs: a.completedAtMs, debtId: a.debtId,
      evidenceIds: [...a.evidenceIds] })),
    coverage: { total: RESIDENTS.length, neverThought: RESIDENTS.filter(({ id }) => state.minds[id].lastSuccessAtMs === null).length,
      // Coverage counts people, even when several channels offer one person a reply.
      waitingForReply: [...new Set(state.conversations.filter((c) => c.status === 'open').map((c) => c.nextSpeaker!))] },
  };
}
/** Observer readers still accept archived DTO1, which predates records. The
 * current projector always emits DTO2 with records and no retrieval state. */
export type SocietyPublicView = Omit<ReturnType<typeof societyPublicView>, 'records'>
  & { records?: ReturnType<typeof publicRecordView> };
