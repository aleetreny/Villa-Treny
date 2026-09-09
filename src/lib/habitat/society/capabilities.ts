import { z } from 'zod';
import type { WorldState } from '../engine/state';
import type { VerbName } from '../engine/verbs';
import { ROOMS } from '../rooms';
import { applySocietyChoice, decodeSocietyChoice, societyChoiceJsonSchema, type SocietyChoiceDecode, type SocietyChoiceOptions } from './choice';
import { appraisalJsonSchema, applyAppraisal, validateAppraisal, type ValidatedAppraisal } from './appraisal';
import type { PreparedTurn, SocietyResult, SocietyState } from './types';

/** Protocol 3 names describe existing effects. This is a model-facing boundary,
 * not new engine verbs or a migration of saved intentions and agreements. */
export const CAPABILITY_ALIASES = {
  accrue_labor_credit: 'work',
  walk_room_and_log_visit: 'inspect',
  accrue_two_labor_credits: 'charge',
  log_stock_register: 'note',
  filter_water: 'clean',
  clean_space: 'clean',
} as const satisfies Record<string, VerbName>;
const UNCHANGED_CAPABILITIES = ['go', 'rest', 'sleep', 'eat', 'drink', 'wash', 'dig', 'grow', 'cook', 'repair', 'repay'] as const;
export type CapabilityName = keyof typeof CAPABILITY_ALIASES | typeof UNCHANGED_CAPABILITIES[number];
type Shape = Record<string, unknown>;
const object = (value: unknown): value is Shape => value !== null && typeof value === 'object' && !Array.isArray(value);

/** `null` means there is no corresponding offered capability. Cleaning needs a
 * known destination: callers must not guess that a legacy at:null is outside
 * the Well. `observe` remains valid in the engine and version 2 only. */
export function capabilityForVerb(verb: string, room?: string | null): CapabilityName | null {
  switch (verb) {
    case 'work': return 'accrue_labor_credit';
    case 'inspect': return 'walk_room_and_log_visit';
    case 'charge': return 'accrue_two_labor_credits';
    case 'note': return 'log_stock_register';
    case 'clean': return ROOMS.some(({ id }) => id === room) ? room === 'well' ? 'filter_water' : 'clean_space' : null;
    default: return (UNCHANGED_CAPABILITIES as readonly string[]).includes(verb) ? verb as CapabilityName : null;
  }
}

/** Non-mutating projection for a step, example or work agreement's terms. For
 * stored steps, pass the canonical intent together with its `at`. Resolve the
 * destination before calling when a legacy step inherits its room. This names
 * the effect; it does not assert current resources, consent or availability. */
export function toCapabilityAction<T extends { verb: string; at?: string | null; room?: string }>(action: T,
  fallbackRoom?: string): (Omit<T, 'verb'> & { verb: CapabilityName }) | null {
  const verb = capabilityForVerb(action.verb, action.at ?? action.room ?? fallbackRoom);
  return verb ? { ...structuredClone(action), verb } : null;
}

function canonicalVerb(capability: string): string {
  return Object.hasOwn(CAPABILITY_ALIASES, capability)
    ? CAPABILITY_ALIASES[capability as keyof typeof CAPABILITY_ALIASES] : capability;
}

function stringChoices(schema: unknown, definitions: Shape): string[] {
  if (!object(schema)) return [];
  if (typeof schema.const === 'string') return [schema.const];
  if (Array.isArray(schema.enum)) return schema.enum.filter((value): value is string => typeof value === 'string');
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/$defs/'))
    return stringChoices(definitions[schema.$ref.slice('#/$defs/'.length)], definitions);
  return [];
}

/** Refine only a condition already required by the authoritative decoder.
 * A deal needs an open reply. Version3 requires explicit close:false; version4
 * follows canonical omission=keep open. Ordinary messages may still close. Complete branches preserve unknown-key checks in Zod4.4.3:
 * permissive partial branches can lose those errors during intersection.
 * Share large field schemas using $defs (arbitrary JSON-pointer refs are not
 * supported by that compiler). Keep the recipient directory directly readable.
 */
function requireOpenDealMessage(schema: Shape, allowOmittedClose = false): Shape {
  if (!object(schema.properties) || !object(schema.properties.deal) || !object(schema.properties.message)) return schema;
  const properties = schema.properties, message = properties.message as Shape;
  const definitions = object(schema.$defs) ? { ...schema.$defs } : {};
  const references: Record<string, Shape> = {};
  for (const [key, value] of Object.entries(properties)) {
    const name = `choice_${key}`;
    if (Object.hasOwn(definitions, name)) throw new RangeError('Choice schema definition collision');
    definitions[name] = value;
    references[key] = { $ref: `#/$defs/${name}` };
  }
  const withoutDeal = { ...references };
  delete withoutDeal.deal;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const openMessage = { ...message,
    properties: { ...(message.properties as Shape), close: { const: false } },
    required: [...new Set([...(Array.isArray(message.required) ? message.required : []), ...(allowOmittedClose ? [] : ['close'])])],
  };
  const branch = (fields: Record<string, Shape>, fieldsRequired: unknown[]) => ({ type: 'object', properties: fields,
    additionalProperties: false, minProperties: schema.minProperties ?? 1, required: fieldsRequired });
  return { ...schema, $defs: definitions, properties: { ...references, message }, anyOf: [
    branch(withoutDeal, required),
    branch({ ...references, message: openMessage }, [...new Set([...required, 'deal', 'message'])]),
  ] };
}

/** Keep every v2 recipient, amount, evidence, facility and dialogue restriction.
 * Only schemas for actual verb-bearing objects are rewritten; text/goal strings
 * and the negotiation's kind/role "work" are not actions and remain untouched. */
function capabilitySchema(state: SocietyState, world: WorldState, turn: PreparedTurn, options: SocietyChoiceOptions): Shape {
  const schema = structuredClone(societyChoiceJsonSchema(state, world, turn, options));
  const appraisal = appraisalJsonSchema(state, turn);
  if (appraisal && object(schema.properties)) schema.properties.appraisal = appraisal;
  const definitions = object(schema.$defs) ? schema.$defs : {};
  let needsNonWellRoom = false;
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!object(value)) return value;
    if (object(value.properties) && object(value.properties.verb)) {
      const properties = value.properties, verbs = stringChoices(properties.verb, definitions);
      const names = verbs.filter(verb => verb !== 'clean').flatMap(verb => {
        const capability = capabilityForVerb(verb);
        return capability ? [capability] : [];
      });
      const variants: Shape[] = [];
      if (names.length) variants.push({ ...value, properties: { ...properties,
        verb: names.length === 1 ? { const: names[0] } : { enum: names } } });
      if (verbs.includes('clean')) {
        const key = Object.hasOwn(properties, 'at') ? 'at' : 'room';
        const rooms = stringChoices(properties[key], definitions);
        if (rooms.includes('well')) variants.push({ ...value, properties: { ...properties,
          verb: { const: 'filter_water' }, [key]: { const: 'well' } } });
        const others = rooms.filter(room => room !== 'well');
        if (others.length) {
          const allOtherRooms = stringChoices(definitions.room, definitions).filter(room => room !== 'well');
          const shared = JSON.stringify(others) === JSON.stringify(allOtherRooms);
          if (shared) needsNonWellRoom = true;
          variants.push({ ...value, properties: { ...properties, verb: { const: 'clean_space' },
            [key]: shared ? { $ref: '#/$defs/nonWellRoom' } : { enum: others } } });
        }
      }
      return variants.length === 1 ? variants[0] : { anyOf: variants };
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      const translated = rewrite(child);
      // Flatten only wrappers introduced above, preserving metadata-bearing
      // branches. Compact, disjoint alternatives work in provider grammars too.
      return [key, key === 'anyOf' && Array.isArray(translated) ? translated.flatMap(branch =>
        object(branch) && Object.keys(branch).length === 1 && Array.isArray(branch.anyOf) ? branch.anyOf : [branch]) : translated];
    }));
  };
  const translated = rewrite(schema) as Shape;
  if (needsNonWellRoom) translated.$defs = { ...definitions,
    nonWellRoom: { enum: stringChoices(definitions.room, definitions).filter(room => room !== 'well') } };
  return requireOpenDealMessage(translated, options.allowOmittedDealClose === true);
}

/** Version 3 remains the conversation-first contract for outstanding jobs. */
export function capabilityChoiceJsonSchema(state: SocietyState, world: WorldState, turn: PreparedTurn): Shape {
  return capabilitySchema(state, world, turn, {});
}

/** Version 4 permits an optional proposal together with a first message.
 * Parties still come from the actor and the eligible message recipient. */
export function proposalCapabilityChoiceJsonSchema(state: SocietyState, world: WorldState, turn: PreparedTurn): Shape {
  return capabilitySchema(state, world, turn, { openingProposals: true, allowOmittedDealClose: true });
}

function translateValidatedChoice(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown,
  options: SocietyChoiceOptions):
  { ok: true; value: Shape; appraisal?: ValidatedAppraisal } | { ok: false; code: string } {
  if (!state.minds[turn.actor]) return { ok: false, code: 'invalid_job' };
  // Validate the entire external grammar before translation. Old aliases,
  // forbidden locations, fabricated evidence and extra fields cannot be washed
  // into valid canonical data by the adapter.
  if (!z.fromJSONSchema(capabilitySchema(state, world, turn, options)).safeParse(raw).success)
    return { ok: false, code: 'unavailable_capability_choice' };
  const choice = structuredClone(raw) as Shape;
  let appraisal: ValidatedAppraisal | undefined;
  if (Object.hasOwn(choice, 'appraisal')) {
    const validated = validateAppraisal(state, turn, choice.appraisal);
    if (!validated.ok) return validated;
    appraisal = validated.value;
    delete choice.appraisal;
  }
  if (object(choice.project) && choice.project.mode === 'replace' && Array.isArray(choice.project.steps)) {
    choice.project.steps = choice.project.steps.map((step: Shape) => ({ ...step, verb: canonicalVerb(step.verb as string) }));
  }
  if (object(choice.deal) && choice.deal.kind === 'work') choice.deal.verb = canonicalVerb(choice.deal.verb as string);
  return { ok: true, value: choice, ...(appraisal ? { appraisal } : {}) };
}

export function decodeCapabilityChoice(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown): SocietyChoiceDecode {
  const translated = translateValidatedChoice(state, world, turn, raw, {});
  return translated.ok ? decodeSocietyChoice(state, world, turn, translated.value) : translated;
}

export function decodeProposalCapabilityChoice(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown): SocietyChoiceDecode {
  const options = { openingProposals: true, allowOmittedDealClose: true };
  const translated = translateValidatedChoice(state, world, turn, raw, options);
  return translated.ok ? decodeSocietyChoice(state, world, turn, translated.value, options) : translated;
}

function applyCapability(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown,
  control: { nowMs: number; generation: number }, options: SocietyChoiceOptions): SocietyResult {
  // Current grammar may differ after the first application. Preserve version
  // 2's replay/control ordering before looking at a repeated response's shape.
  if (state.minds[turn.actor] && turn.sequence <= state.minds[turn.actor].lastAppliedSequence)
    return applySocietyChoice(state, world, turn, {}, control);
  const translated = translateValidatedChoice(state, world, turn, raw, options);
  if (!translated.ok) return { ok: false, code: translated.code, state, world };
  const result = applySocietyChoice(state, world, turn, translated.value, control, options);
  return translated.appraisal ? applyAppraisal(result, turn, translated.appraisal, control.nowMs) : result;
}

export function applyCapabilityChoice(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown,
  control: { nowMs: number; generation: number }): SocietyResult {
  return applyCapability(state, world, turn, raw, control, {});
}

export function applyProposalCapabilityChoice(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown,
  control: { nowMs: number; generation: number }): SocietyResult {
  return applyCapability(state, world, turn, raw, control, { openingProposals: true, allowOmittedDealClose: true });
}
