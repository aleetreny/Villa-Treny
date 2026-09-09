import { z } from 'zod';
import { nudge } from '../engine/state';
import type { ResidentId } from '../residents';
import { evidence } from './state';
import type { PreparedTurn, SocietyResult, SocietyState } from './types';

const AXES = ['trust', 'affection', 'admiration', 'resentment'] as const;
const appraisal = z.strictObject({ axis: z.enum(AXES), delta: z.union([z.literal(-1), z.literal(1)]),
  ref: z.string().min(1).max(100), why: z.string().trim().min(1).max(180) });
export type ValidatedAppraisal = z.infer<typeof appraisal> & {
  conversationId: string; target: ResidentId; index: number;
};

/** Only the current, offered incoming message can ground a personal appraisal.
 * A transcript is a claim, not proof that its speaker's assertions are true. */
function receivedTurn(state: SocietyState, turn: PreparedTurn) {
  const c = state.conversations.find((c) => c.id === turn.conversation?.id);
  if (!c || c.status !== 'open' || c.expiresAtMs <= turn.preparedAtMs || c.nextSpeaker !== turn.actor
    || c.revision !== turn.conversation?.revision || c.turns.length !== turn.conversation.turn) return null;
  const member = c.participants.indexOf(turn.actor), received = c.turns.at(-1);
  if (member < 0 || !received || received.speaker === turn.actor || !c.participants.includes(received.speaker)
    || !turn.evidenceIds.includes(received.id) || received.atMs > turn.preparedAtMs
    || received.index <= (c.appraisedThrough?.[member] ?? -1)) return null;
  return { c, received };
}

export function appraisalJsonSchema(state: SocietyState, turn: PreparedTurn): Record<string, unknown> | undefined {
  const available = receivedTurn(state, turn);
  if (!available) return undefined;
  return { type: 'object', additionalProperties: false, required: ['axis', 'delta', 'ref', 'why'],
    properties: { axis: { enum: AXES }, delta: { type: 'integer', enum: [-1, 1] },
      ref: { const: available.received.id }, why: { type: 'string', minLength: 1, maxLength: 180 } },
    description: 'Optional private interpretation of the latest received message. Change only one of your own feelings toward its speaker by one point; omission changes none. Speech is not proof or consent.' };
}

export function validateAppraisal(state: SocietyState, turn: PreparedTurn, raw: unknown):
  { ok: true; value: ValidatedAppraisal } | { ok: false; code: string } {
  const parsed = appraisal.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'invalid_appraisal' };
  const available = receivedTurn(state, turn);
  if (!available || parsed.data.ref !== available.received.id) return { ok: false, code: 'unavailable_appraisal' };
  return { ok: true, value: { ...parsed.data, conversationId: available.c.id,
    target: available.received.speaker, index: available.received.index } };
}

/** Mutates only the successful base operation's private draft. Call validation
 * before applying the base response: its reply may close the conversation.
 * Failed/replayed operations and repeated helper calls have no appraisal effect. */
export function applyAppraisal(result: SocietyResult, turn: PreparedTurn, value: ValidatedAppraisal, nowMs: number): SocietyResult {
  if (!result.ok || result.code !== 'applied' || result.state.minds[turn.actor]?.lastAppliedSequence !== turn.sequence
    || !Number.isSafeInteger(nowMs) || nowMs < turn.preparedAtMs || nowMs >= turn.expiresAtMs) return result;
  const c = result.state.conversations.find((c) => c.id === value.conversationId), member = c?.participants.indexOf(turn.actor) ?? -1;
  const received = c?.turns[value.index];
  if (!c || member < 0 || c.id !== turn.conversation?.id || value.index !== turn.conversation.turn - 1
    || !received || received.id !== value.ref || received.speaker !== value.target || value.target === turn.actor
    || !c.participants.includes(value.target) || !turn.evidenceIds.includes(value.ref)
    || value.index <= (c.appraisedThrough?.[member] ?? -1)) return result;
  // Watermarks belong to the retained conversation, not its evictable memories.
  // Consume even a clamped change so the same message cannot be tried again.
  c.appraisedThrough ??= [-1, -1];
  c.appraisedThrough[member] = value.index;
  nudge(result.world, turn.actor, value.target, value.axis, value.delta);
  evidence(result.state, turn.actor, result.world, nowMs, 'interpretation',
    `My ${value.axis} toward ${value.target}: ${value.delta > 0 ? '+' : ''}${value.delta} requested after ${value.ref}. ${value.why}`,
    [value.ref], turn.actor, 4);
  return result;
}
