import type { Conversation, Mind } from './types';
import type { ResidentId } from '../residents';

/** Preserve the legacy global-review semantics only for observations whose
 * timestamps already preceded that participant's successful thought. This
 * cannot establish comprehension and never fabricates a historical message. */
export function legacyAttentionThrough(conversation: Pick<Conversation, 'id' | 'participants' | 'status' | 'expiresAtMs' | 'revision' | 'turns'>,
  minds: Record<ResidentId, Pick<Mind, 'lastSuccessAtMs' | 'memories'>>): [number, number] {
  return conversation.participants.map(actor => {
    const reviewedAt = minds[actor].lastSuccessAtMs;
    if (reviewedAt === null) return 0;
    const lastTurn = conversation.turns.at(-1);
    // The scheduled deadline is not the actual expiration event. A private
    // lookup can succeed between the deadline and the wake that expires it.
    // Without a retained exact receipt, leave that terminal revision pending.
    const expirationWasAvailable = minds[actor].memories.some(memory => memory.kind === 'observation'
      && memory.source === null && memory.refs.length === 1 && memory.refs[0] === conversation.id
      && memory.text === 'The conversation expired without another reply. Silence did not accept any terms.'
      && memory.createdAtMs >= conversation.expiresAtMs && memory.createdAtMs <= reviewedAt);
    const endWasAvailable = conversation.turns.every(turn => turn.atMs <= reviewedAt)
      && (conversation.status === 'expired' ? expirationWasAvailable
        : conversation.status === 'closed' && lastTurn !== undefined && lastTurn.atMs <= reviewedAt);
    if (endWasAvailable) return conversation.revision;
    let delivered = 0;
    // A watermark covers a prefix, so an anomalous later-dated old turn cannot
    // be acknowledged merely because a subsequent index has an earlier date.
    for (const turn of conversation.turns) {
      if (turn.atMs > reviewedAt) break;
      delivered = turn.index + 1;
    }
    return Math.min(delivered, conversation.revision);
  }) as [number, number];
}
