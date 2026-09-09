import { z } from 'zod';
import { recordContentHash, recordsStateSchema } from './record-schema';

const archived = z.strictObject({
  publication: recordsStateSchema.shape.publications.element,
  draft: recordsStateSchema.shape.drafts.element,
});

/** Self-contained immutable content check. The parent reference is bound by
 * the content hash; reading one document does not reveal private predecessors. */
export function parseArchivedPublication(raw: unknown) {
  const parsed = archived.safeParse(raw);
  if (!parsed.success) throw new TypeError('Invalid archived publication shape');
  const { publication: p, draft: d } = parsed.data;
  if (!/^record:publication:\d+$/.test(p.id) || !/^record:draft:\d+$/.test(d.id)
    || p.draftId !== d.id || p.author !== d.author || p.contentHash !== d.contentHash
    || recordContentHash(d) !== d.contentHash || new TextEncoder().encode(d.title + d.text).length > 600
    || Number(p.id.split(':')[2]) <= Number(d.id.split(':')[2])
    || p.publishedAtMs < d.createdAtMs || p.atWatch < d.createdAtWatch
    || d.refs.some((ref) => p.audience === 'public' ? ref.audience !== 'public'
      : ref.audience !== 'public' && !ref.audience.includes(p.audience))) {
    throw new TypeError('Invalid archived publication content or attribution');
  }
  return parsed.data;
}
