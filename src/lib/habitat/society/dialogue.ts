import { RESIDENTS, type ResidentId } from '../residents';
import { SOCIETY_LIMITS, type Conversation, type PreparedTurn, type SocietyState } from './types';

/** P8 limits simultaneous attention, not the person's physical location. */
export const MAX_OPEN_CHANNELS_PER_RESIDENT = 3;

/** New P8 contacts may reclaim acknowledged history, never a closure that
 * still needs delivery. The fixed total capacity remains a real constraint. */
export function canRetireChannel(channel: Conversation): boolean {
  return channel.status !== 'open' && channel.attentionThrough.every(revision => revision >= channel.revision);
}

export function openChannels(state: SocietyState, actor: ResidentId, nowMs: number): Conversation[] {
  return state.conversations.filter(c => c.status === 'open' && c.expiresAtMs > nowMs && c.participants.includes(actor));
}

export function canStartChannel(state: SocietyState, actor: ResidentId, recipient: ResidentId, nowMs: number): boolean {
  if (actor === recipient || !state.minds[actor] || !state.minds[recipient]) return false;
  const own = openChannels(state, actor, nowMs);
  return own.length < MAX_OPEN_CHANNELS_PER_RESIDENT
    && openChannels(state, recipient, nowMs).length < MAX_OPEN_CHANNELS_PER_RESIDENT
    && !own.some(c => c.participants.includes(recipient))
    && (state.conversations.length < SOCIETY_LIMITS.conversations || state.conversations.some(canRetireChannel));
}

export function availableChannelRecipients(state: SocietyState, actor: ResidentId, nowMs: number): ResidentId[] {
  return RESIDENTS.map(r => r.id).filter(id => canStartChannel(state, actor, id, nowMs));
}

/** Old issued turns retain the original exclusive-conversation interpretation. */
export function conversationForTurn(state: SocietyState, actor: ResidentId, nowMs: number,
  turn: Pick<PreparedTurn, 'conversation' | 'dialoguePolicy'>): Conversation | undefined {
  if (turn.dialoguePolicy === 'concurrent-v1') {
    return turn.conversation ? openChannels(state, actor, nowMs).find(c => c.id === turn.conversation!.id) : undefined;
  }
  return openChannels(state, actor, nowMs)[0];
}

export function channelNeedsReview(channel: Conversation, actor: ResidentId): boolean {
  const index = channel.participants.indexOf(actor);
  if (index < 0) return false;
  return (channel.attentionThrough?.[index] ?? 0) < channel.revision
    && (channel.status !== 'open' || channel.nextSpeaker === actor);
}
