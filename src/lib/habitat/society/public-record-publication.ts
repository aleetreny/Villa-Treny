import type { AuthoredDraft, PublicRecordPublication, RecordPublication } from './record-types';

/** Shared live/archive allowlist. Publishing a document does not publish its
 * private predecessors, reference access lists or other drafts. */
export function publicRecordPublication(publication: RecordPublication, draft: AuthoredDraft,
  parentPublicationId: string | null = null): PublicRecordPublication | undefined {
  if (publication.audience !== 'public' || publication.draftId !== draft.id
    || publication.author !== draft.author || publication.contentHash !== draft.contentHash
    || draft.refs.some(ref => ref.audience !== 'public')) return undefined;
  return { id: publication.id, draftId: publication.draftId, contentHash: publication.contentHash,
    author: publication.author, audience: 'public', atWatch: publication.atWatch, publishedAtMs: publication.publishedAtMs,
    title: draft.title, text: draft.text, refs: draft.refs.map(ref => ref.id), parentPublicationId };
}
