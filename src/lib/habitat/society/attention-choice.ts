import { z } from 'zod';
import { RESIDENT_BY_ID, type ResidentId } from '../residents';
import type { WorldState } from '../engine/state';
import { availableChannelRecipients, channelNeedsReview, openChannels } from './dialogue';
import { recordCapabilityChoiceJsonSchema, shareRepeatedSchemas } from './record-choice';
import { applyRetrievalCapabilityChoice, lookupSchema, prepareRetrievalTurn } from './retrieval-choice';
import { commitRecordOnlyTurn } from './turn';
import { evidence } from './state';
import { applyAppraisal, validateAppraisal } from './appraisal';
import { compactSchemaReferences } from './compact-schema';
import type { Conversation, PreparedTurn, SocietyResult, SocietyState } from './types';

type Shape = Record<string, unknown>;
export type PreparedAttentionChannel = {
  id: string; revision: number; turns: number; counterpart: ResidentId;
  status: Conversation['status']; mayReply: boolean; shownTurnIds: string[];
};
export type PreparedAttention = { version: 1; channels: PreparedAttentionChannel[]; availableContacts: ResidentId[] };
type Attention = { kind: 'reply' | 'leave'; conversationId: string }
  | { kind: 'private'; conversationId: string | null } | { kind: 'contact' };
const object = (value: unknown): value is Shape => value !== null && typeof value === 'object' && !Array.isArray(value);
const obj = (properties: Shape, required = Object.keys(properties)): Shape =>
  ({ type: 'object', properties, required, additionalProperties: false });
const contextOf = (turn: PreparedTurn): Shape => JSON.parse(turn.prompt.trimStart().startsWith('{')
  ? turn.prompt : turn.prompt.slice(turn.prompt.lastIndexOf('\n{') + 1)) as Shape;

function attentionOf(turn: PreparedTurn): PreparedAttention {
  const value = turn.attention;
  if (turn.dialoguePolicy !== 'concurrent-v1' || !value || value.version !== 1 || !Array.isArray(value.channels)
    || !Array.isArray(value.availableContacts) || value.availableContacts.length > 24
    || new Set(value.availableContacts).size !== value.availableContacts.length
    || value.availableContacts.some(id => !RESIDENT_BY_ID[id] || id === turn.actor)
    || value.channels.length > 6 || new Set(value.channels.map(c => c.id)).size !== value.channels.length
    || value.channels.some(c => typeof c.id !== 'string' || !Number.isSafeInteger(c.revision) || c.revision < 0
      || !Number.isSafeInteger(c.turns) || c.turns < 0 || !RESIDENT_BY_ID[c.counterpart] || c.counterpart === turn.actor
      || !['open', 'closed', 'expired'].includes(c.status) || typeof c.mayReply !== 'boolean'
      || !Array.isArray(c.shownTurnIds) || c.shownTurnIds.length > 2
      || c.shownTurnIds.some(id => typeof id !== 'string' || !turn.evidenceIds.includes(id)))) {
    throw new RangeError('Missing prepared attention');
  }
  return value;
}

/** The same call sees a bounded inbox. Selecting a channel is part of its
 * decision, not a second hidden inference or an automatically sent reply. */
export function prepareAttentionTurn(state: SocietyState, world: WorldState, initial: PreparedTurn): PreparedTurn {
  const actor = initial.actor, now = initial.preparedAtMs, context = contextOf(initial);
  const olderFirst = (a: Conversation, b: Conversation) =>
    (a.turns.at(-1)?.atMs ?? a.createdAtMs) - (b.turns.at(-1)?.atMs ?? b.createdAtMs) || a.id.localeCompare(b.id);
  const live = openChannels(state, actor, now).sort(olderFirst);
  const closures = state.conversations.filter(c => c.status !== 'open' && channelNeedsReview(c, actor)).sort(olderFirst);
  const selected = [...live, ...closures.slice(0, 3)];
  if (live.length > 3) throw new RangeError('Attention capacity exceeded');
  const shown = selected.map(c => {
    const latestOwn = [...c.turns].reverse().find(t => t.speaker === actor);
    const latestOther = [...c.turns].reverse().find(t => t.speaker !== actor);
    const transcript = [latestOwn, latestOther].filter((t): t is NonNullable<typeof t> => t !== undefined)
      .sort((a, b) => a.index - b.index);
    return { id: c.id, counterpart: c.participants.find(id => id !== actor)!, status: c.status,
      nextSpeaker: c.nextSpeaker, turnsLeft: 16 - c.turns.length,
      needsReview: channelNeedsReview(c, actor), transcript: transcript.map(t => ({ id: t.id, speaker: t.speaker, text: t.text })),
      omittedTurns: c.turns.length - transcript.length };
  });
  const old = (context.conversation as { transcript?: Array<{ id: string }> } | null)?.transcript ?? [];
  const removedIds = new Set(old.map(t => t.id));
  const shownIds = shown.flatMap(c => c.transcript.map(t => t.id));
  const evidenceIds = [...new Set([...initial.evidenceIds.filter(id => !removedIds.has(id)), ...shownIds])];
  const channels: PreparedAttentionChannel[] = selected.map((c, i) => ({ id: c.id, revision: c.revision,
    turns: c.turns.length, counterpart: shown[i]!.counterpart, status: c.status,
    mayReply: c.status === 'open' && c.nextSpeaker === actor,
    shownTurnIds: shown[i]!.transcript.map(t => t.id) }));
  const split = initial.prompt.lastIndexOf('\n{'), prefix = split < 0 ? '' : initial.prompt.slice(0, split + 1);
  const omitted = { ...(object(context.omitted) ? context.omitted : {}) };
  delete omitted.turns;
  if (closures.length > 3) omitted.closedChannels = closures.length - 3;
  const availableContacts = availableChannelRecipients(state, actor, now);
  const prompt = `${prefix}${JSON.stringify({ ...context, conversation: null, refIds: evidenceIds, omitted,
    channels: shown, attentionCapacity: { maximumOpen: 3, ownOpen: live.length,
      availableContacts } })}`;
  return prepareRetrievalTurn(state, world, { ...initial, conversation: null, dialoguePolicy: 'concurrent-v1',
    attention: { version: 1, channels, availableContacts }, evidenceIds, prompt, promptBytes: new TextEncoder().encode(prompt).length });
}

function scopedTurn(turn: PreparedTurn, channel?: PreparedAttentionChannel): PreparedTurn {
  return { ...turn, dialoguePolicy: 'concurrent-v1', conversation: channel?.status === 'open'
    ? { id: channel.id, revision: channel.revision, turn: channel.turns } : null };
}

/** Resolve pre-factored local references before sharing the whole P8 tree.
 * Schema constraints are identical; annotation prose is already in SYSTEM.
 * Canonical property order makes equivalent subtrees share one definition even
 * when the legacy compiler produced different aliases or insertion orders. */
function schemaCollector() {
  const add = (schema: Shape): Shape => {
    const local = object(schema.$defs) ? schema.$defs : {};
    const visiting = new Set<string>(), resolved = new Map<string, Shape>();
    const rewrite = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(rewrite);
      if (!object(value)) return value;
      if (typeof value.$ref === 'string' && value.$ref.startsWith('#/$defs/')) {
        if (Object.keys(value).length !== 1) throw new RangeError('Schema reference siblings are unsupported');
        const key = value.$ref.slice(8);
        if (resolved.has(key)) return resolved.get(key);
        if (visiting.has(key) || !object(local[key])) throw new RangeError('Invalid attention schema reference');
        visiting.add(key);
        const body = rewrite(local[key]) as Shape;
        resolved.set(key, body); visiting.delete(key); return body;
      }
      return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !['$defs', '$schema', 'description'].includes(key))
        .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key,
          (key === 'enum' || key === 'required') && Array.isArray(child)
            ? [...child].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : rewrite(child)]));
    };
    return rewrite(schema) as Shape;
  };
  return { add };
}

function contentSchema(state: SocietyState, world: WorldState, turn: PreparedTurn, mode: 'speech' | 'private'): Shape {
  const base = recordCapabilityChoiceJsonSchema(state, world, turn);
  if (mode === 'speech') {
    const requireSpeech = (branch: Shape): Shape => ({ ...branch,
      required: [...new Set([...(Array.isArray(branch.required) ? branch.required : []), 'message'])] });
    // P7's complete anyOf branches already repeat all root constraints. Keep
    // each complete branch (including unknown-key/deal-close checks) once.
    return Array.isArray(base.anyOf) ? { $defs: base.$defs, anyOf: (base.anyOf as Shape[]).map(requireSpeech) }
      : requireSpeech(base);
  }
  const properties = { ...(base.properties as Shape) };
  delete properties.message; delete properties.deal;
  return { type: 'object', additionalProperties: false, properties, $defs: base.$defs,
    minProperties: 0, required: (Array.isArray(base.required) ? base.required : []).filter(key => key !== 'message') };
}

export function attentionCapabilityChoiceJsonSchema(state: SocietyState, world: WorldState, turn: PreparedTurn): Shape {
  const prepared = attentionOf(turn), collector = schemaCollector();
  const variants: Shape[] = [lookupSchema(turn)];
  const branch = (attention: Shape, content: Shape) => obj({ attention, content: collector.add(content) });
  const noChannel = scopedTurn(turn);
  variants.push(branch(obj({ kind: { const: 'private' }, conversationId: { type: 'null' } }),
    contentSchema(state, world, noChannel, 'private')));
  if (prepared.availableContacts.some(id => availableChannelRecipients(state, turn.actor, turn.preparedAtMs).includes(id))) {
    variants.push(branch(obj({ kind: { const: 'contact' } }), contentSchema(state, world, noChannel, 'speech')));
  }
  for (const channel of prepared.channels) {
    const scoped = scopedTurn(turn, channel);
    variants.push(branch(obj({ kind: { const: 'private' }, conversationId: { const: channel.id } }),
      contentSchema(state, world, scoped, 'private')));
    if (channel.status !== 'open') continue;
    variants.push(branch(obj({ kind: { const: 'leave' }, conversationId: { const: channel.id } }), obj({})));
    if (channel.mayReply) variants.push(branch(obj({ kind: { const: 'reply' }, conversationId: { const: channel.id } }),
      contentSchema(state, world, scoped, 'speech')));
  }
  // A private review or leave has identical content for several IDs. Group
  // only those byte-identical branches; replies retain their exact counterpart
  // and appraisal/consent grammar. Null continues to mean no selected channel.
  const groups = new Map<string, { variant: Shape; ids: unknown[] }>();
  const grouped: Shape[] = [];
  for (const variant of variants) {
    const properties = variant.properties as Shape;
    const fields = (properties.attention as Shape | undefined)?.properties as Shape | undefined;
    const kind = (fields?.kind as Shape | undefined)?.const;
    if ((kind !== 'private' && kind !== 'leave') || !fields?.conversationId) { grouped.push(variant); continue; }
    const id = fields.conversationId as Shape, value = id.type === 'null' ? null : id.const;
    const key = `${kind}:${JSON.stringify(properties.content)}`, existing = groups.get(key);
    if (existing) existing.ids.push(value);
    else { groups.set(key, { variant, ids: [value] }); grouped.push(variant); }
  }
  for (const { variant, ids } of groups.values()) if (ids.length > 1) {
    const properties = variant.properties as Shape, attention = properties.attention as Shape;
    (attention.properties as Shape).conversationId = { enum: ids };
  }
  return compactSchemaReferences(shareRepeatedSchemas({ type: 'object', anyOf: grouped }));
}

function acknowledgeRetrieval(result: SocietyResult, turn: PreparedTurn): void {
  const cursor = result.state.retrieval[turn.actor];
  if (cursor.pending && cursor.revision === turn.recordRetrieval?.revision) {
    cursor.pending = false; cursor.revision += 1; cursor.lastSequence = turn.sequence;
  }
}

export function applyAttentionCapabilityChoice(state: SocietyState, world: WorldState, turn: PreparedTurn,
  raw: unknown, control: { nowMs: number; generation: number }): SocietyResult {
  const fail = (code: string): SocietyResult => ({ ok: false, code, state, world });
  if (!Number.isSafeInteger(control.nowMs) || control.nowMs < turn.preparedAtMs || control.generation !== turn.generation)
    return fail('stale_control');
  const mind = state.minds[turn.actor];
  if (!mind || !Number.isSafeInteger(turn.sequence) || turn.sequence < 0) return fail('invalid_job');
  if (turn.sequence <= mind.lastAppliedSequence) return { ok: true, code: 'already_applied', state, world };
  if (control.nowMs >= turn.expiresAtMs) return fail('expired_job');
  if (mind.revision !== turn.mindRevision) return fail('stale_mind');
  try {
    const prepared = attentionOf(turn);
    if (turn.recordRetrieval?.revision !== state.retrieval[turn.actor].revision) return fail('stale_retrieval');
    if (!object(raw)) return fail('invalid_attention_choice');
    if (Object.hasOwn(raw, 'lookup')) return applyRetrievalCapabilityChoice(state, world, scopedTurn(turn), raw, control);
    if (!object(raw.attention) || !object(raw.content)) return fail('invalid_attention_choice');
    const choice = raw.attention as Attention;
    const selected = 'conversationId' in choice && choice.conversationId !== null
      ? prepared.channels.find(c => c.id === choice.conversationId) : undefined;
    if ('conversationId' in choice && choice.conversationId !== null && !selected) return fail('unavailable_channel');
    const channel = selected ? state.conversations.find(c => c.id === selected.id) : undefined;
    if (selected && (!channel || !channel.participants.includes(turn.actor)
      || channel.revision !== selected.revision || channel.turns.length !== selected.turns || channel.status !== selected.status
      || !channel.participants.includes(selected.counterpart)
      || selected.mayReply !== (channel.status === 'open' && channel.nextSpeaker === turn.actor)
      || selected.shownTurnIds.some(id => !channel.turns.some(t => t.id === id))
      || (channel.status === 'open' && channel.expiresAtMs <= control.nowMs))) return fail('stale_conversation');
    if (!z.fromJSONSchema(attentionCapabilityChoiceJsonSchema(state, world, turn)).safeParse(raw).success)
      return fail('invalid_attention_choice');
    if (choice.kind === 'leave') {
      if (!channel || channel.status !== 'open') return fail('unavailable_channel');
      const next = structuredClone(state), closed = next.conversations.find(c => c.id === channel.id)!;
      closed.status = 'closed'; closed.nextSpeaker = null; closed.revision += 1;
      for (const offer of next.offers) if (offer.conversationId === closed.id && offer.status === 'open') offer.status = 'expired';
      for (const actor of closed.participants) evidence(next, actor, world, control.nowMs, 'observation',
        `${RESIDENT_BY_ID[turn.actor].name} ended this conversation. Existing accepted agreements remain in force.`, [closed.id], turn.actor, 4);
      closed.attentionThrough[closed.participants.indexOf(turn.actor)] = closed.revision;
      const own = next.minds[turn.actor];
      own.lastAppliedSequence = turn.sequence; own.lastSuccessAtMs = control.nowMs;
      own.lastAttemptAtMs = Math.max(own.lastAttemptAtMs ?? 0, turn.preparedAtMs);
      next.revision += 1;
      return { ok: true, code: 'applied', state: next, world: structuredClone(world) };
    }
    const scoped = scopedTurn(turn, selected);
    // A private appraisal may be the whole decision. Legacy decoders require
    // a nonempty canonical operation after stripping appraisal; keep that
    // historical rule and handle this explicit P8 alternative here.
    const appraisalOnly = choice.kind === 'private' && Object.keys(raw.content).length === 1
      && Object.hasOwn(raw.content, 'appraisal');
    const appraisal = appraisalOnly ? validateAppraisal(state, scoped, raw.content.appraisal) : undefined;
    if (appraisal && !appraisal.ok) return fail(appraisal.code);
    let result = Object.keys(raw.content).length && !appraisalOnly
      ? applyRetrievalCapabilityChoice(state, world, scoped, raw.content, control)
      : commitRecordOnlyTurn(state, world, scoped, control);
    if (appraisal?.ok) result = applyAppraisal(result, scoped, appraisal.value, control.nowMs);
    if (!result.ok || result.code !== 'applied') return result;
    if (selected) {
      const considered = result.state.conversations.find(c => c.id === selected.id)!;
      considered.attentionThrough[considered.participants.indexOf(turn.actor)] = choice.kind === 'reply'
        ? considered.revision : selected.revision;
    } else if (choice.kind === 'contact') {
      const created = result.state.conversations.find(c => !state.conversations.some(old => old.id === c.id))!;
      created.attentionThrough[created.participants.indexOf(turn.actor)] = created.revision;
    }
    acknowledgeRetrieval(result, turn);
    return result;
  } catch { return fail('invalid_attention_choice'); }
}
