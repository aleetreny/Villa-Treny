import { z } from 'zod';
import { ROOMS } from '../rooms';
import type { WorldState } from '../engine/state';
import { parseTurnResponse, societyTurnJsonSchema } from './schema';
import { minimumWorkDeadline } from './economy';
import { watchNumber } from './state';
import { applySocietyTurn } from './turn';
import { SOCIETY_LIMITS, WORK_VERBS, type PreparedTurn, type SocietyResult, type SocietyState, type TurnResponse } from './types';

export const SOCIETY_OFFER_LIFETIME_WATCHES = 2;
const cells = z.number().min(0).max(1000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, 'cells use at most two decimal places');
const positiveCells = cells.refine((value) => value > 0, 'a transfer or loan must be positive');
const room = z.enum(ROOMS.filter((r) => r.id !== 'breach').map((r) => r.id));
const dealSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('transfer'), direction: z.enum(['give', 'ask']), cells: positiveCells }),
  z.strictObject({ kind: z.literal('loan'), direction: z.enum(['lend', 'borrow']), cells: positiveCells,
    dueInDays: z.number().int().min(1).max(30) }),
  z.strictObject({ kind: z.literal('work'), role: z.enum(['work', 'hire']), cells,
    verb: z.enum(WORK_VERBS), room, units: z.number().int().min(1).max(4), slackWatches: z.number().int().min(0).max(11) }),
  z.strictObject({ kind: z.literal('accept'), offerId: z.string().min(1).max(100) }),
  z.strictObject({ kind: z.literal('reject'), offerId: z.string().min(1).max(100) }),
]);
const choiceSchema = z.strictObject({ project: z.unknown().optional(), reflection: z.unknown().optional(),
  message: z.unknown().optional(), deal: dealSchema.optional() });
export type SocietyDealChoice = z.infer<typeof dealSchema>;
export type SocietyChoice = Pick<TurnResponse, 'project' | 'reflection' | 'message'> & { deal?: SocietyDealChoice };
export type SocietyChoiceDecode = { ok: true; value: TurnResponse } | { ok: false; code: string };
/** Issued protocol policy, never a global runtime flag. Version 2/3 callers
 * omit this; version 4 explicitly enables proposals with a first contact. */
export type SocietyChoiceOptions = { openingProposals?: boolean; allowOmittedDealClose?: boolean };
type Shape = Record<string, unknown>;

/** External grammar only. Persisted offers and agreements continue using the
 * canonical TurnResponse contract, so old lives need no conversion or reset. */
export function societyChoiceJsonSchema(state: SocietyState, world: WorldState, turn: PreparedTurn,
  options: SocietyChoiceOptions = {}): Shape {
  const canonical = societyTurnJsonSchema(state, world, turn);
  const properties = { ...canonical.properties as Record<string, Shape> };
  delete properties.offer; delete properties.respond;
  const active = state.conversations.find((c) => c.id === turn.conversation?.id && c.status === 'open'
    && c.expiresAtMs > turn.preparedAtMs && c.participants.includes(turn.actor) && c.nextSpeaker === turn.actor);
  const opening = options.openingProposals === true && turn.conversation === null
    && (turn.dialoguePolicy === 'concurrent-v1' || !state.conversations.some((c) =>
      c.status === 'open' && c.expiresAtMs > turn.preparedAtMs && c.participants.includes(turn.actor)));
  const obj = (fields: Record<string, Shape>): Shape => ({ type: 'object', properties: fields,
    required: Object.keys(fields), additionalProperties: false });
  const integer = (minimum: number, maximum: number): Shape => ({ type: 'integer', minimum, maximum });
  const amount = (minimum: number): Shape => ({ type: 'number', minimum, maximum: 1000, multipleOf: 0.01 });
  const workFields = { kind: { const: 'work' }, role: { enum: ['work', 'hire'] }, cells: amount(0),
    units: integer(1, 4), slackWatches: integer(0, 11) };
  // Facilities are public permanent constraints. Stocks, health and the other
  // party's available funds are deliberately not a proposal-time oracle.
  const work = [
    obj({ ...workFields, verb: { enum: ['work', 'clean', 'inspect', 'repair'] }, room: { $ref: '#/$defs/room' } }),
    ...([['dig', ['face']], ['grow', ['garden']], ['cook', ['common', 'kitchen']], ['charge', ['workshops']]] as const)
      .map(([verb, rooms]) => obj({ ...workFields, verb: { const: verb }, room: { enum: rooms } })),
  ];
  const variants: Shape[] = [];
  if ((active || opening) && properties.message) {
    if (opening || active!.turns.length < SOCIETY_LIMITS.turns - 1) variants.push(
      obj({ kind: { const: 'transfer' }, direction: { enum: ['give', 'ask'] }, cells: amount(0.01) }),
      obj({ kind: { const: 'loan' }, direction: { enum: ['lend', 'borrow'] }, cells: amount(0.01), dueInDays: integer(1, 30) }),
      ...work,
    );
    const incoming = state.offers.filter((o) => o.conversationId === active?.id && o.status === 'open'
      && o.counterpart === turn.actor && o.expiresAtWatch > watchNumber(world) && turn.evidenceIds.includes(o.id)).map((o) => o.id);
    if (incoming.length) variants.push(obj({ kind: { enum: ['accept', 'reject'] }, offerId: { enum: incoming } }));
  }
  if (variants.length) properties.deal = { anyOf: variants,
    description: options.allowOmittedDealClose === true
      ? 'Choose one deal. Requires a message to your counterpart; omitted close keeps it open, while close:true cannot accompany a deal. New offers expire after 2 watches; a proposal does not accept any existing offer.'
      : 'Choose one deal. Requires a message to your counterpart with close:false. New offers expire after 2 watches; a proposal does not accept any existing offer.' };
  const firstPurpose = !state.minds[turn.actor].project;
  const required = firstPurpose ? ['project'] : [];
  // The first opportunity is an introduction when someone is available; an
  // active reply must address its speaker. Later private reviews may be silent.
  // Neither requirement exposes a private goal or implies agreement: close:true
  // remains available for a refusal without a deal.
  if (turn.dialoguePolicy !== 'concurrent-v1' && properties.message && (firstPurpose || active)) required.push('message');
  return { ...canonical, properties, ...(required.length ? { required } : {}) };
}

/** Resolve only relative roles and durations. No model-supplied party, price
 * correction, implied consent or rewrite of an existing offer is permitted. */
export function decodeSocietyChoice(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown,
  options: SocietyChoiceOptions = {}): SocietyChoiceDecode {
  if (!state.minds[turn.actor]) return { ok: false, code: 'invalid_job' };
  const parsed = choiceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'invalid_choice' };
  const { deal, ...common } = parsed.data;
  if (!state.minds[turn.actor]?.project && common.project === undefined) return { ok: false, code: 'initial_project_required' };
  const canonical = parseTurnResponse(common);
  if (!canonical.ok) return canonical;
  if (!z.fromJSONSchema(societyChoiceJsonSchema(state, world, turn, options)).safeParse(raw).success) {
    return { ok: false, code: 'unavailable_choice' };
  }
  const response = canonical.value;
  if (!deal) return { ok: true, value: response };
  const message = response.message;
  if (!message || message.close === true || (options.allowOmittedDealClose !== true && message.close !== false))
    return { ok: false, code: 'deal_requires_open_message' };
  const active = state.conversations.find((c) => c.id === turn.conversation?.id && c.status === 'open'
    && c.expiresAtMs > turn.preparedAtMs && c.nextSpeaker === turn.actor && c.participants.includes(turn.actor));
  // The issued opening grammar already restricts this literal recipient to a
  // free eligible resident. Canonical application rechecks availability, own
  // funds and control/revisions before creating either a conversation or offer.
  const counterpart = active?.participants.find((id) => id !== turn.actor)
    ?? (options.openingProposals === true && turn.conversation === null ? message.to : undefined);
  if (!counterpart || message.to !== counterpart) return { ok: false, code: 'unavailable_dialogue_turn' };
  if (deal.kind === 'accept' || deal.kind === 'reject') {
    return { ok: true, value: { ...response, respond: { decision: deal.kind, offerId: deal.offerId } } };
  }
  let terms: NonNullable<TurnResponse['offer']>['terms'];
  if (deal.kind === 'transfer') terms = { kind: 'transfer', cells: deal.cells,
    from: deal.direction === 'give' ? turn.actor : counterpart, to: deal.direction === 'give' ? counterpart : turn.actor };
  else if (deal.kind === 'loan') terms = { kind: 'loan', cells: deal.cells, dueDay: world.day + deal.dueInDays,
    from: deal.direction === 'lend' ? turn.actor : counterpart, to: deal.direction === 'lend' ? counterpart : turn.actor };
  else {
    const worker = deal.role === 'work' ? turn.actor : counterpart;
    // One safety watch beyond the inclusive minimum. Re-evaluated from actual
    // clocks when proposing; acceptance never extends the resulting dueWatch.
    const stamp = watchNumber(world);
    const dueWatch = minimumWorkDeadline(state, world, worker, deal.units) + 1 + deal.slackWatches;
    if (!Number.isSafeInteger(dueWatch) || dueWatch > stamp + 16) return { ok: false, code: 'invalid_work_deadline' };
    terms = { kind: 'work', worker, payer: worker === turn.actor ? counterpart : turn.actor,
      cells: deal.cells, verb: deal.verb, room: deal.room, units: deal.units, dueWatch };
  }
  return { ok: true, value: { ...response, offer: { terms, expiresInWatches: SOCIETY_OFFER_LIFETIME_WATCHES } } };
}

export function applySocietyChoice(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown,
  control: { nowMs: number; generation: number }, options: SocietyChoiceOptions = {}): SocietyResult {
  // Preserve the canonical replay rule before the now-current grammar changes
  // (e.g. an accepted offer disappears or the recipient's turn changes).
  if (state.minds[turn.actor] && turn.sequence <= state.minds[turn.actor].lastAppliedSequence) {
    return applySocietyTurn(state, world, turn, {}, control);
  }
  const decoded = decodeSocietyChoice(state, world, turn, raw, options);
  return decoded.ok ? applySocietyTurn(state, world, turn, decoded.value, control)
    : { ok: false, code: decoded.code, state, world };
}
