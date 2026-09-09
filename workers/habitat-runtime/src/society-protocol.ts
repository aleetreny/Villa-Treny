import { applySocietyTurn, applySocietyChoice, applyCapabilityChoice, applyProposalCapabilityChoice,
  applyOrderedCapabilityChoice } from '../../../src/lib/habitat/society/index';
import { applyRetrievalCapabilityChoice } from '../../../src/lib/habitat/society/retrieval-choice';
import { applyRecordCapabilityChoice } from '../../../src/lib/habitat/society/record-choice';
import { applyAttentionCapabilityChoice } from '../../../src/lib/habitat/society/attention-choice';
import type { PreparedTurn, SocietyResult, SocietyState } from '../../../src/lib/habitat/society/types';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A saved P1–P7 decision still has its exact old effects. Record only which
 * channel revision that successful decision actually delivered, so P8 does
 * not schedule its author to reread their own closing message. This private
 * codec bookkeeping never acknowledges another retained exchange or lookup. */
function acknowledgeLegacyChannels(version: number, result: SocietyResult, before: SocietyState, turn: PreparedTurn,
  raw: unknown): SocietyResult {
  if (!result.ok || result.code !== 'applied' || result.state.minds[turn.actor]?.lastAppliedSequence !== turn.sequence
    || (object(raw) && Object.hasOwn(raw, 'lookup'))) return result;
  const mark = (id: string, revision: number) => {
    const channel = result.state.conversations.find(c => c.id === id), member = channel?.participants.indexOf(turn.actor) ?? -1;
    if (channel && member >= 0 && revision <= channel.revision)
      channel.attentionThrough[member] = Math.max(channel.attentionThrough[member]!, revision);
  };
  if (turn.conversation) {
    const issued = turn.conversation, prior = before.conversations.find(c => c.id === issued.id);
    const current = result.state.conversations.find(c => c.id === issued.id);
    if (prior && current && prior.participants.includes(turn.actor) && prior.revision === issued.revision
      && prior.turns.length === issued.turn) {
      const sent = current.turns.length === prior.turns.length + 1 && current.turns.at(-1)?.speaker === turn.actor;
      mark(issued.id, sent ? current.revision : issued.revision);
    }
  } else {
    for (const channel of result.state.conversations) if (!before.conversations.some(c => c.id === channel.id)
      && channel.participants[0] === turn.actor && channel.turns.length === 1 && channel.turns[0]!.speaker === turn.actor)
      mark(channel.id, channel.revision);
  }
  if (version < 6) return result;
  try {
    const context: unknown = JSON.parse(turn.prompt.trimStart().startsWith('{')
      ? turn.prompt : turn.prompt.slice(turn.prompt.lastIndexOf('\n{') + 1));
    if (!object(context) || !object(context.receivedClosure)) return result;
    const closure = context.receivedClosure;
    if (closure.status !== 'closed' || !object(closure.turn)) return result;
    const prior = before.conversations.find(c => c.id === closure.conversationId);
    const current = result.state.conversations.find(c => c.id === closure.conversationId), last = prior?.turns.at(-1);
    if (prior?.status === 'closed' && current?.status === 'closed' && current.revision === prior.revision
      && current.turns.length === prior.turns.length && current.turns.at(-1)?.id === last?.id
      && prior.participants.includes(turn.actor) && last && last.speaker !== turn.actor && last.atMs <= turn.preparedAtMs
      && turn.evidenceIds.includes(last.id) && closure.turn.id === last.id && closure.turn.speaker === last.speaker
      && closure.turn.text === last.text && closure.turn.atMs === last.atMs) mark(prior.id, prior.revision);
  } catch { /* An older preparation without a bound closure acknowledges none. */ }
  return result;
}

/** A saved job keeps the grammar it was issued with. New prompts must never
 * reinterpret an outstanding response, and unknown versions fail closed. */
export function applySocietyProtocol(version: number, ...args: Parameters<typeof applySocietyTurn>) {
  if (version === 8) return applyAttentionCapabilityChoice(...args);
  const legacy = [applySocietyTurn, applySocietyChoice, applyCapabilityChoice, applyProposalCapabilityChoice,
    applyOrderedCapabilityChoice, applyRecordCapabilityChoice, applyRetrievalCapabilityChoice][version - 1];
  if (legacy) return acknowledgeLegacyChannels(version, legacy(...args), args[0], args[2], args[3]);
  return { ok: false, code: 'unsupported_society_contract', state: args[0], world: args[1] };
}
