import { z } from 'zod';
import type { WorldState } from '../engine/state';
import { applyProposalCapabilityChoice, decodeProposalCapabilityChoice, proposalCapabilityChoiceJsonSchema } from './capabilities';
import type { SocietyChoiceDecode } from './choice';
import type { PreparedTurn, SocietyResult, SocietyState } from './types';

type Shape = Record<string, unknown>;
const object = (value: unknown): value is Shape => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (shape: Shape): Shape => {
  if (!object(shape.properties)) throw new RangeError('Expected a proposal object schema');
  return shape.properties;
};
const obj = (properties: Shape): Shape => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const ref = (name: string): Shape => ({ $ref: `#/$defs/${name}` });

/** Remove only unreachable schema definitions, never choices or supplied IDs. */
function reachableDefinitions(schema: Shape): Shape {
  const definitions = schema.$defs as Shape, used = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!object(value)) return;
    if (typeof value.$ref === 'string' && value.$ref.startsWith('#/$defs/')) {
      const name = value.$ref.slice(8);
      if (!used.has(name)) { used.add(name); visit(definitions[name]); }
    }
    for (const [key, child] of Object.entries(value)) if (key !== '$defs') visit(child);
  };
  visit(schema);
  return { ...schema, $defs: Object.fromEntries(Object.entries(definitions).filter(([name]) => used.has(name))) };
}

/** Pure format projection, also usable with an exact archived P4 schema.
 * Decisions remain the same P4 operations; numeric terms are not menu presets.
 * Tuple positions, rather than JSON object key order, put the complete economic
 * decision before any free prose. This does not prove semantic agreement with it.
 */
export function orderedChoiceJsonSchemaFromProposal(proposal: Shape): Shape {
  const source = structuredClone(proposal), definitions: Shape = object(source.$defs) ? source.$defs : {};
  const deal = definitions.choice_deal;
  const hasDeal = object(deal) && Array.isArray(deal.anyOf);
  const branches = Array.isArray(source.anyOf) ? source.anyOf : [];
  const plain = hasDeal ? branches[0] : { type: 'object', properties: fields(source),
    required: source.required ?? [], additionalProperties: false, minProperties: source.minProperties ?? 1 };
  if (!object(plain)) throw new RangeError('Expected a complete proposal branch');
  definitions.ordered_content_plain = plain;
  definitions.ordered_decision_plain = obj({ choice: { const: 'no_deal' } });
  const tuple = (decision: string, content: string): Shape => ({ type: 'array',
    prefixItems: [ref(decision), ref(content)], minItems: 2, maxItems: 2 });
  const alternatives = [tuple('ordered_decision_plain', 'ordered_content_plain')];
  if (hasDeal) {
    const economic = branches[1];
    if (!object(economic)) throw new RangeError('Expected a complete economic branch');
    delete fields(economic).deal;
    economic.required = (economic.required as string[]).filter((name) => name !== 'deal');
    definitions.ordered_content_deal = economic;
    const variants = (deal.anyOf as unknown[]).filter(object), choices: Shape[] = [];
    const kind = (variant: Shape): unknown => (fields(variant).kind as Shape).const;
    const transfer = variants.find((variant) => kind(variant) === 'transfer');
    if (transfer) choices.push(obj({ choice: { enum: ['propose_give', 'propose_ask'] }, cells: fields(transfer).cells }));
    const loan = variants.find((variant) => kind(variant) === 'loan');
    if (loan) choices.push(obj({ choice: { enum: ['propose_lend', 'propose_borrow'] },
      cells: fields(loan).cells, dueInDays: fields(loan).dueInDays }));
    const work = variants.filter((variant) => kind(variant) === 'work');
    if (work.length) {
      const common = fields(work[0]!);
      // Share the amounts and durations; retain every permanent verb/room pair.
      choices.push(obj({ choice: { enum: ['propose_work', 'propose_hire'] }, cells: common.cells,
        units: common.units, slackWatches: common.slackWatches,
        task: { anyOf: work.map((variant) => obj({ verb: fields(variant).verb, room: fields(variant).room })) } }));
    }
    const answer = variants.find((variant) => object(fields(variant).offerId));
    if (answer) {
      const ids = (fields(answer).offerId as { enum: string[] }).enum;
      choices.push(obj({ choice: { enum: ids.flatMap((id) => [`accept:${id}`, `reject:${id}`]) } }));
    }
    definitions.ordered_decision_deal = { anyOf: choices };
    alternatives.push(tuple('ordered_decision_deal', 'ordered_content_deal'));
  }
  return reachableDefinitions({ ...obj({ turn: { anyOf: alternatives } }), $defs: definitions });
}

export function orderedCapabilityChoiceJsonSchema(state: SocietyState, world: WorldState, turn: PreparedTurn): Shape {
  return orderedChoiceJsonSchemaFromProposal(proposalCapabilityChoiceJsonSchema(state, world, turn));
}

const cells = z.number().min(0).max(1000).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8);
const positiveCells = cells.refine((value) => value > 0);
const days = z.number().int().min(1).max(30), units = z.number().int().min(1).max(4), slack = z.number().int().min(0).max(11);
const name = z.string().min(1).max(100);
const content = z.strictObject({ project: z.unknown().optional(), reflection: z.unknown().optional(),
  message: z.unknown().optional(), appraisal: z.unknown().optional() });
const proposalDeal = z.union([
  z.strictObject({ kind: z.literal('transfer'), direction: z.enum(['give', 'ask']), cells: positiveCells }),
  z.strictObject({ kind: z.literal('loan'), direction: z.enum(['lend', 'borrow']), cells: positiveCells, dueInDays: days }),
  z.strictObject({ kind: z.literal('work'), role: z.enum(['work', 'hire']), cells, verb: name, room: name, units, slackWatches: slack }),
  z.strictObject({ kind: z.enum(['accept', 'reject']), offerId: name }),
]);
const decision = z.union([
  z.strictObject({ choice: z.literal('no_deal') }),
  z.strictObject({ choice: z.enum(['propose_give', 'propose_ask']), cells: positiveCells }),
  z.strictObject({ choice: z.enum(['propose_lend', 'propose_borrow']), cells: positiveCells, dueInDays: days }),
  z.strictObject({ choice: z.enum(['propose_work', 'propose_hire']), cells, units, slackWatches: slack,
    task: z.strictObject({ verb: name, room: name }) }),
  z.strictObject({ choice: z.string().regex(/^(accept|reject):.{1,100}$/) }),
]);
const ordered = z.strictObject({ turn: z.tuple([decision, content]) });
type Conversion<T> = { ok: true; value: T } | { ok: false; code: 'invalid_ordered_choice' | 'invalid_proposal_choice' };
export type OrderedChoice = z.infer<typeof ordered>;

/** Format conversion only. Availability, consent and effects require the stateful
 * decoder/application below; this helper never authorizes an action by itself. */
export function toOrderedChoice(raw: unknown): Conversion<OrderedChoice> {
  const parsed = content.extend({ deal: proposalDeal.optional() }).safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'invalid_proposal_choice' };
  const { deal, ...rest } = parsed.data;
  if (!deal) return { ok: true, value: { turn: [{ choice: 'no_deal' }, rest] } };
  let selected: z.infer<typeof decision>;
  if ('offerId' in deal) selected = { choice: `${deal.kind}:${deal.offerId}` };
  else if (deal.kind === 'work') selected = { choice: deal.role === 'work' ? 'propose_work' : 'propose_hire',
    cells: deal.cells, units: deal.units, slackWatches: deal.slackWatches, task: { verb: deal.verb, room: deal.room } };
  else if (deal.kind === 'loan') selected = { choice: deal.direction === 'lend' ? 'propose_lend' : 'propose_borrow',
    cells: deal.cells, dueInDays: deal.dueInDays };
  else selected = { choice: deal.direction === 'give' ? 'propose_give' : 'propose_ask', cells: deal.cells };
  return { ok: true, value: { turn: [selected, rest] } };
}

export function fromOrderedChoice(raw: unknown): Conversion<Shape> {
  const parsed = ordered.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'invalid_ordered_choice' };
  const [selected, rest] = parsed.data.turn;
  if (selected.choice === 'no_deal') return { ok: true, value: rest };
  let deal: Shape;
  if ('task' in selected) deal = { kind: 'work', role: selected.choice === 'propose_work' ? 'work' : 'hire',
    cells: selected.cells, units: selected.units, slackWatches: selected.slackWatches, ...selected.task };
  else if ('dueInDays' in selected) deal = { kind: 'loan', direction: selected.choice === 'propose_lend' ? 'lend' : 'borrow',
    cells: selected.cells, dueInDays: selected.dueInDays };
  else if ('cells' in selected) deal = { kind: 'transfer', direction: selected.choice === 'propose_give' ? 'give' : 'ask', cells: selected.cells };
  else {
    const colon = selected.choice.indexOf(':');
    deal = { kind: selected.choice.slice(0, colon), offerId: selected.choice.slice(colon + 1) };
  }
  return { ok: true, value: { ...rest, deal } };
}

function validatedProposal(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown): Conversion<Shape> {
  if (!z.fromJSONSchema(orderedCapabilityChoiceJsonSchema(state, world, turn)).safeParse(raw).success)
    return { ok: false, code: 'invalid_ordered_choice' };
  return fromOrderedChoice(raw);
}

export function decodeOrderedCapabilityChoice(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown): SocietyChoiceDecode {
  if (!state.minds[turn.actor]) return { ok: false, code: 'invalid_job' };
  const converted = validatedProposal(state, world, turn, raw);
  return converted.ok ? decodeProposalCapabilityChoice(state, world, turn, converted.value) : converted;
}

export function applyOrderedCapabilityChoice(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown,
  control: { nowMs: number; generation: number }): SocietyResult {
  // Replay must precede a grammar that has changed after the first application.
  if (state.minds[turn.actor] && turn.sequence <= state.minds[turn.actor].lastAppliedSequence)
    return applyProposalCapabilityChoice(state, world, turn, {}, control);
  if (!state.minds[turn.actor]) return { ok: false, code: 'invalid_job', state, world };
  const converted = validatedProposal(state, world, turn, raw);
  return converted.ok ? applyProposalCapabilityChoice(state, world, turn, converted.value, control)
    : { ok: false, code: converted.code, state, world };
}
