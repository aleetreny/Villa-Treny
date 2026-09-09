import { z } from 'zod';
import type { WorldState } from '../engine/state';
import type { PreparedTurn, SocietyResult, SocietyState } from './types';
import { attentionCapabilityChoiceJsonSchema, applyAttentionCapabilityChoice } from './attention-choice';
import { orderedChoiceJsonSchemaFromProposal, fromOrderedChoice, toOrderedChoice } from './ordered-choice';
import { shareRepeatedSchemas } from './record-choice';
import { compactSchemaReferences } from './compact-schema';
import { SOCIETY_ATTENTION_SYSTEM } from './attention-instructions';

type Shape = Record<string, unknown>;
const object = (x: unknown): x is Shape => x !== null && typeof x === 'object' && !Array.isArray(x);
const fields = (x: Shape): Shape => {
  if (!object(x.properties)) throw new RangeError('Expected complete object schema');
  return x.properties;
};
const obj = (properties: Shape, required = Object.keys(properties)): Shape =>
  ({ type: 'object', properties, required, additionalProperties: false });

/** Evaluation candidate, not an autonomous producer selection. The two
 * experimental forms differ ONLY in whether the no-deal selector is required.
 * All economic operations are still optional; no_deal is a legitimate choice. */
export type OfferDispositionOptions = { required?: boolean };

function schemaReader(schema: Shape) {
  const defs = object(schema.$defs) ? schema.$defs : {};
  const resolve = (value: unknown, seen = new Set<string>()): Shape => {
    if (!object(value)) throw new RangeError('Expected schema node');
    if (typeof value.$ref !== 'string') return value;
    if (!value.$ref.startsWith('#/$defs/') || Object.keys(value).length !== 1 || seen.has(value.$ref))
      throw new RangeError('Unsupported schema reference');
    return resolve(defs[value.$ref.slice(8)], new Set([...seen, value.$ref]));
  };
  const expand = (value: unknown, seen = new Set<string>()): unknown => {
    if (Array.isArray(value)) return value.map(child => expand(child, seen));
    if (!object(value)) return value;
    if (typeof value.$ref === 'string') {
      if (seen.has(value.$ref)) throw new RangeError('Recursive schema reference');
      return expand(resolve(value), new Set([...seen, value.$ref]));
    }
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$defs')
      .map(([key, child]) => [key, expand(child, seen)]));
  };
  return { resolve, expand };
}

/** Reuse P5's exact selector vocabulary and converters, but retain P8's
 * ordinary object, selected channel, complete content and record grammar.
 * There is no reinterpretation or modification of any saved P5/P8 contract. */
function economicDecision(deal: Shape): Shape {
  const projected = orderedChoiceJsonSchemaFromProposal({
    $defs: { choice_deal: deal }, anyOf: [obj({}), obj({ deal })],
  });
  const definitions = projected.$defs as Shape;
  return schemaReader(projected).expand(definitions.ordered_decision_deal) as Shape;
}

export function projectOfferDispositionSchema(original: Shape, options: OfferDispositionOptions = {}) {
  const source = structuredClone(original), read = schemaReader(source), channels: string[] = [];
  if (!Array.isArray(source.anyOf)) throw new RangeError('Expected attention alternatives');
  const variants = source.anyOf.flatMap((item): Shape[] => {
    const branch = read.resolve(item), properties = fields(branch);
    if (!properties.attention) return [branch]; // Exclusive lookup is unchanged.
    const attention = read.resolve(properties.attention), mode = read.resolve(fields(attention).kind);
    if (mode.const !== 'reply') return [branch];
    const content = read.resolve(properties.content);
    const alternatives = (Array.isArray(content.anyOf) ? content.anyOf : [content]).map(node => read.resolve(node));
    const economic = alternatives.find(node => fields(node).deal !== undefined);
    if (!economic) return [branch];
    const deal = read.expand(fields(economic).deal) as Shape;
    const incoming = Array.isArray(deal.anyOf) && deal.anyOf.some(node => object(node) && fields(node).offerId !== undefined);
    if (!incoming) return [branch]; // No unrelated channel must address an offer.
    const channel = read.resolve(fields(attention).conversationId).const;
    if (typeof channel !== 'string') throw new RangeError('Expected exact reply channel');
    channels.push(channel);
    const selected = economicDecision(deal);
    return alternatives.map(node => {
      const nextContent = structuredClone(node), nextFields = fields(nextContent), hasDeal = nextFields.deal !== undefined;
      delete nextFields.deal;
      nextContent.required = (Array.isArray(nextContent.required) ? nextContent.required : []).filter(key => key !== 'deal');
      // Speech remains required in both original complete branches, so removal
      // of deal cannot satisfy their minimum property count accidentally.
      const decision = hasDeal ? selected : obj({ choice: { const: 'no_deal' } });
      return obj({ attention: properties.attention, decision, content: nextContent },
        hasDeal || options.required !== false ? ['attention', 'decision', 'content'] : ['attention', 'content']);
    });
  });
  return { channels, schema: channels.length
    ? compactSchemaReferences(shareRepeatedSchemas({ ...source, anyOf: variants })) : source };
}

export function offerDispositionJsonSchema(state: SocietyState, world: WorldState, turn: PreparedTurn,
  options: OfferDispositionOptions = {}): Shape {
  return projectOfferDispositionSchema(attentionCapabilityChoiceJsonSchema(state, world, turn), options).schema;
}

/** A lossless format projection of a valid P8 response. Record bytes and
 * optional field absence are preserved; this helper creates no consent. */
export function toOfferDispositionResponse(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown): unknown {
  const base = attentionCapabilityChoiceJsonSchema(state, world, turn);
  if (!z.fromJSONSchema(base).safeParse(raw).success || !object(raw)) throw new RangeError('Invalid source attention choice');
  const copy = structuredClone(raw), channels = projectOfferDispositionSchema(base).channels;
  if (!object(copy.attention) || copy.attention.kind !== 'reply' || !channels.includes(String(copy.attention.conversationId))) return copy;
  if (!object(copy.content)) throw new RangeError('Invalid source content');
  const { deal, ...content } = copy.content;
  const converted = toOrderedChoice(deal === undefined ? {} : { deal });
  if (!converted.ok) throw new RangeError('Invalid source deal');
  return { ...copy, decision: converted.value.turn[0], content };
}

export function fromOfferDispositionResponse(raw: unknown): unknown {
  if (!object(raw)) throw new RangeError('Invalid disposition response');
  if (!Object.hasOwn(raw, 'decision')) return structuredClone(raw);
  if (!object(raw.content) || Object.hasOwn(raw.content, 'deal')) throw new RangeError('Duplicate economic operation');
  const { decision, content, ...rest } = raw;
  const converted = fromOrderedChoice({ turn: [decision, {}] });
  if (!converted.ok) throw new RangeError('Invalid disposition decision');
  return { ...structuredClone(rest), content: { ...structuredClone(content), ...converted.value } };
}

export function applyOfferDisposition(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown,
  control: { nowMs: number; generation: number }, options: OfferDispositionOptions = {}): SocietyResult {
  // P8 remains the sole authority for control, replay, consent and effects.
  // A successful duplicate must not be reconsidered under a later offer menu.
  if (turn.sequence <= (state.minds[turn.actor]?.lastAppliedSequence ?? -1))
    return applyAttentionCapabilityChoice(state, world, turn, {}, control);
  try {
    if (!z.fromJSONSchema(offerDispositionJsonSchema(state, world, turn, options)).safeParse(raw).success)
      return { ok: false, code: 'invalid_offer_disposition', state, world };
    return applyAttentionCapabilityChoice(state, world, turn, fromOfferDispositionResponse(raw), control);
  } catch { return { ok: false, code: 'invalid_offer_disposition', state, world }; }
}

// Identical wording in required/optional experiments. Requirement is expressed
// by the issued grammar alone, without urging agreement or penalizing deferral.
export const SOCIETY_OFFER_DISPOSITION_SYSTEM = SOCIETY_ATTENTION_SYSTEM.replace(
  'Deal is optional, including first contact; ordinary discussion needs none.',
  'Economic operations are optional. When replying to an incoming offer, a separate decision can select no_deal, accept:ID, reject:ID or a proposal. Follow the schema for required fields. no_deal performs no economic operation; it does not imply agreement or refusal. A present decision carries the economic choice; content must not contain a second deal. Other attention operations retain their existing form.',
);
