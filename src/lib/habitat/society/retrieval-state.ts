import { z } from 'zod';
import { RESIDENTS, type ResidentId } from '../residents';
import type { RecordBinding, RecordsState } from './record-types';

/** Private retrieval bookkeeping, separate from document authorship and ACLs. */
export type RecordRetrievalState = {
  version: 1; revision: number; query: string; cursor: string | null;
  focus: RecordBinding | null; pending: boolean; lastSequence: number;
};
export type RetrievalState = Record<ResidentId, RecordRetrievalState>;

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const recordRetrievalStateSchema = z.strictObject({
  version: z.literal(1), revision: counter,
  query: z.string().refine(value => Array.from(value).length <= 96
    && new TextEncoder().encode(value).length <= 384, 'retrieval query exceeds its bound'),
  cursor: z.string().min(1).max(256).nullable(),
  focus: z.strictObject({ draftId: z.string().regex(/^record:draft:\d+$/).max(100),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).nullable(),
  pending: z.boolean(), lastSequence: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER),
});
export const retrievalStateSchema = z.record(z.enum(RESIDENTS.map(resident => resident.id)), recordRetrievalStateSchema);

export function emptyRetrievalState(): RetrievalState {
  return Object.fromEntries(RESIDENTS.map(({ id }) => [id, {
    version: 1, revision: 0, query: '', cursor: null, focus: null, pending: false, lastSequence: -1,
  }])) as RetrievalState;
}

/** A retained focus can become unavailable after eviction. Keep its exact
 * binding so preparation can report that fact; never pin or substitute it.
 * Existence and current reader access are checked at each retrieval boundary. */
export function validateRetrievalState(retrieval: RetrievalState,
  minds: Record<ResidentId, { lastAppliedSequence: number }>,
  records: Pick<RecordsState, 'nextId' | 'drafts'>): { ok: true } | { ok: false; code: string } {
  if (!retrievalStateSchema.safeParse(retrieval).success) return { ok: false, code: 'invalid_retrieval_state' };
  for (const { id } of RESIDENTS) {
    const value = retrieval[id];
    if (value.lastSequence > minds[id].lastAppliedSequence) return { ok: false, code: 'retrieval_cursor_ahead_of_mind' };
    if (value.lastSequence === -1 && (value.revision !== 0 || value.query !== '' || value.cursor !== null
      || value.focus !== null || value.pending)) return { ok: false, code: 'uncommitted_retrieval_state' };
    if (value.lastSequence >= 0 && value.revision === 0) return { ok: false, code: 'missing_retrieval_revision' };
    if (value.focus) {
      const ordinal = Number(value.focus.draftId.slice('record:draft:'.length));
      if (!Number.isSafeInteger(ordinal) || ordinal >= records.nextId
        || `record:draft:${ordinal}` !== value.focus.draftId) return { ok: false, code: 'unissued_retrieval_focus' };
      const retained = records.drafts.find(draft => draft.id === value.focus!.draftId);
      if (retained && retained.contentHash !== value.focus.contentHash) return { ok: false, code: 'retrieval_focus_hash_mismatch' };
    }
  }
  return { ok: true };
}
