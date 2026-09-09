import type { ResidentId } from '../residents';
import type { SocietyState } from './types';

export type ReceivedClosure = {
  conversationId: string;
  status: 'closed';
  turn: { id: string; speaker: ResidentId; text: string; atMs: number };
};

/** A closed exchange has no next speaker, but its recipient may still need to
 * consider the final message. Derive this from existing history and the last
 * successful review; do not claim it was read or reopen the conversation. */
export function latestUnreviewedClosingTurn(state: SocietyState, actor: ResidentId, nowMs: number): ReceivedClosure | undefined {
  const lastSuccessAtMs = state.minds[actor].lastSuccessAtMs ?? -1;
  let latest: ReceivedClosure | undefined;
  for (const conversation of state.conversations) {
    if (conversation.status !== 'closed' || !conversation.participants.includes(actor)) continue;
    const turn = conversation.turns.at(-1);
    if (!turn || turn.speaker === actor || turn.atMs > nowMs || turn.atMs <= lastSuccessAtMs) continue;
    if (latest && (latest.turn.atMs > turn.atMs
      || (latest.turn.atMs === turn.atMs && latest.conversationId >= conversation.id))) continue;
    latest = { conversationId: conversation.id, status: 'closed',
      turn: { id: turn.id, speaker: turn.speaker, text: turn.text, atMs: turn.atMs } };
  }
  return latest;
}
