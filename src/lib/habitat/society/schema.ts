import { z } from 'zod';
import { RESIDENTS } from '../residents';
import { ROOMS } from '../rooms';
import { decodeIntentFor, VERB_NAMES } from '../engine/verbs';
import type { WorldState } from '../engine/state';
import { emptyRecordsState, recordsStateSchema, validateRecordsState } from './record-schema';
import { emptyRetrievalState, retrievalStateSchema, validateRetrievalState } from './retrieval-state';
import { availableChannelRecipients, conversationForTurn, MAX_OPEN_CHANNELS_PER_RESIDENT } from './dialogue';
import { legacyAttentionThrough } from './attention-state';
import { SOCIETY_LIMITS as L, SOCIETY_VERSION, WORK_VERBS, PLANNABLE_VERBS, type SocietyState, type TurnResponse, type PreparedTurn } from './types';

const resident = z.enum(RESIDENTS.map(({ id }) => id) as ['A', ...Array<(typeof RESIDENTS)[number]['id']>]);
const room = z.enum(ROOMS.map(({ id }) => id) as [(typeof ROOMS)[number]['id'], ...Array<(typeof ROOMS)[number]['id']>]);
const counter = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const timestamp = counter;
const text = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9:_-]+$/);
const amount = z.number().min(0).max(1000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-8, 'cells use at most two decimal places');
export const offerTermsSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('transfer'), from: resident, to: resident, cells: amount }),
  z.strictObject({ kind: z.literal('loan'), from: resident, to: resident, cells: amount, dueDay: counter }),
  z.strictObject({ kind: z.literal('work'), worker: resident, payer: resident, cells: amount,
    verb: z.enum(WORK_VERBS), room, units: z.number().int().min(1).max(4), dueWatch: counter }),
]);
const proposal = z.strictObject({ verb: z.enum(VERB_NAMES), room: room.optional(), target: resident.optional(), fact: text(100).optional(), at: room.optional() });
const response = z.strictObject({
  project: z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('replace'), goal: text(240), why: text(320), visibility: z.enum(['public', 'private']), steps: z.array(proposal).max(L.steps) }),
    z.strictObject({ mode: z.literal('abandon'), why: text(320) }),
  ]).optional(),
  reflection: z.strictObject({ text: text(320), refs: z.array(id).min(1).max(6) }).optional(),
  message: z.strictObject({ to: resident, text: text(360), close: z.boolean().optional() }).optional(),
  offer: z.strictObject({ terms: offerTermsSchema, expiresInWatches: z.number().int().min(1).max(4), replaces: id.optional() }).optional(),
  respond: z.strictObject({ offerId: id, decision: z.enum(['accept', 'reject']) }).optional(),
});
// Amount precision is validated locally; the provider schema stays plain JSON.
export const SOCIETY_RESPONSE_JSON_SCHEMA = z.toJSONSchema(response, { unrepresentable: 'any' });
/** Best-effort wire grammar only. Local strict validation above remains the
 * authority; strict:false is required by providers for these open subobjects. */
export const SOCIETY_WIRE_JSON_SCHEMA = { type: 'object', properties: {
  project: { type: 'object' }, reflection: { type: 'object' }, message: { type: 'object' },
  offer: { type: 'object' }, respond: { type: 'object' },
}, additionalProperties: false } as const;

/** A provider sees only the operations currently available to this voice.
 * Shared definitions avoid repeating room/person enums. This remains ordinary
 * canonical TurnResponse JSON; local parsing and execution stay authoritative. */
export function societyTurnJsonSchema(state: SocietyState, world: WorldState, turn: PreparedTurn): Record<string, unknown> {
  const actor = turn.actor, now = turn.preparedAtMs, stamp = world.day * 4 + world.watch - 1;
  const active = conversationForTurn(state, actor, now, turn);
  const available = !active || active.nextSpeaker === actor;
  const recipients = available ? (active ? active.participants.filter((id) => id !== actor)
    : turn.dialoguePolicy === 'concurrent-v1' ? availableChannelRecipients(state, actor, now)
      .filter(id => !turn.attention || turn.attention.availableContacts.includes(id))
      : RESIDENTS.map(({ id }) => id).filter((id) => id !== actor
        && !state.conversations.some((c) => c.status === 'open' && c.expiresAtMs > now && c.participants.includes(id)))) : [];
  const incoming = available ? state.offers.filter((o) => o.status === 'open' && o.counterpart === actor
    && o.conversationId === active?.id && o.expiresAtWatch > stamp && turn.evidenceIds.includes(o.id)).map((o) => o.id) : [];
  type Shape = Record<string, unknown>;
  const obj = (properties: Record<string, Shape>, required = Object.keys(properties)): Shape => ({ type: 'object', properties, required, additionalProperties: false });
  const str = (maxLength: number): Shape => ({ type: 'string', minLength: 1, maxLength });
  const choice = (values: readonly string[]): Shape => ({ enum: values });
  const ref = (name: string): Shape => ({ $ref: `#/$defs/${name}` });
  const number = (minimum: number, maximum: number): Shape => ({ type: 'integer', minimum, maximum });
  // Projected capabilities mirror only permanent engine restrictions. Empty
  // supplies can recover before a planned action; a missing burner cannot.
  // Legacy persisted steps and canonical decoding remain compatible without at.
  const steps: Shape[] = [obj({ verb: choice(['rest', 'sleep', 'drink', 'work', 'clean', 'inspect', 'repair', 'observe',
    ...(actor === 'A' ? ['note'] : [])]), at: ref('room') }),
  ...([['eat', ['common']], ['wash', ['well', 'infirmary', 'washroom']], ['dig', ['face']],
    ['grow', ['garden']], ['cook', ['common', 'kitchen']], ['charge', ['workshops']]] as const)
    .map(([verb, rooms]) => obj({ verb: { const: verb }, at: choice(rooms) })),
  obj({ verb: { const: 'go' }, room: ref('room') })];
  const creditors = [...new Set(world.economy.debts.filter((d) => d.borrower === actor && d.remaining > 0).map((d) => d.lender))];
  if (creditors.length) steps.push(obj({ verb: { const: 'repay' }, target: choice(creditors) }));
  const replace = obj({ mode: { const: 'replace' }, goal: str(160), why: str(180), visibility: choice(['public', 'private']),
    steps: { type: 'array', maxItems: L.steps, items: { anyOf: steps } } });
  const properties: Record<string, Shape> = {
    project: state.minds[actor].project ? { anyOf: [replace, obj({ mode: { const: 'abandon' }, why: str(180) })] } : replace,
    reflection: obj({ text: str(240), refs: { type: 'array', minItems: 1, maxItems: Math.min(6, new Set(turn.evidenceIds).size), items: choice(turn.evidenceIds) } }),
  };
  const definitions: Record<string, Shape> = { room: choice(ROOMS.filter((r) => r.id !== 'breach').map((r) => r.id)) };
  if (recipients.length) {
    properties.message = obj({ to: choice(recipients), text: str(300), close: { type: 'boolean' } }, ['to', 'text']);
    if (incoming.length) properties.respond = obj({ offerId: choice(incoming), decision: choice(['accept', 'reject']) });
  }
  // Start with an actual exchange of words. Concrete negotiated terms become
  // available once the counterpart is participating, not as an invented reply.
  if (recipients.length && active && active.turns.length < L.turns - 1) {
    definitions.person = choice([actor, ...recipients]);
    const cells = (minimum: number): Shape => ({ type: 'number', minimum, maximum: 1000, multipleOf: 0.01 });
    const parties = { from: ref('person'), to: ref('person'), cells: cells(0.01) };
    const terms = { anyOf: [obj({ kind: { const: 'transfer' }, ...parties }),
      obj({ kind: { const: 'loan' }, ...parties, dueDay: number(world.day + 1, world.day + 30) }),
      obj({ kind: { const: 'work' }, worker: ref('person'), payer: ref('person'), cells: cells(0), verb: choice(WORK_VERBS),
        room: ref('room'), units: number(1, 4), dueWatch: number(stamp + 1, stamp + 16) })] };
    properties.offer = obj({ terms, expiresInWatches: number(1, 4), ...(incoming.length ? { replaces: choice(incoming) } : {}) }, ['terms', 'expiresInWatches']);
  }
  return { type: 'object', properties, additionalProperties: false, minProperties: 1, $defs: definitions };
}
export function parseTurnResponse(raw: unknown): { ok: true; value: TurnResponse } | { ok: false; code: string } {
  const result = response.safeParse(raw);
  if (!result.success) return { ok: false, code: 'invalid_response' };
  if (!Object.values(result.data).some((value) => value !== undefined)) return { ok: false, code: 'empty_response' };
  if (result.data.offer && result.data.respond) return { ok: false, code: 'ambiguous_offer_response' };
  if ((result.data.offer || result.data.respond) && (!result.data.message || result.data.message.close)) return { ok: false, code: 'agreement_needs_open_message' };
  // Provider responses and persisted state are JSON. Normalize only after strict
  // validation; a repeated citation is still one source, not extra evidence.
  // Unknown references stay present for the actor-specific authority check.
  const value = JSON.parse(JSON.stringify(result.data)) as TurnResponse;
  if (value.reflection) value.reflection.refs = [...new Set(value.reflection.refs)];
  return { ok: true, value };
}
const intent = z.strictObject({ actor: resident, verb: z.enum(VERB_NAMES), room: room.optional(), target: resident.optional(), fact: text(100).optional() })
  .refine(({ actor, ...rest }) => decodeIntentFor(actor, rest).ok, 'invalid intent');
const step = z.strictObject({ id, intent, at: room.nullable(), status: z.enum(['pending', 'done', 'failed']), evidenceId: id.nullable() });
const project = z.strictObject({ id, goal: text(240), why: text(320), visibility: z.enum(['public', 'private']),
  status: z.enum(['active', 'completed', 'abandoned']), createdAtMs: timestamp, steps: z.array(step).max(L.steps) });
const evidence = z.strictObject({ id, kind: z.enum(['observation', 'claim', 'commitment', 'interpretation']), text: text(400),
  refs: z.array(id).max(6), atWatch: counter, createdAtMs: timestamp, importance: z.number().int().min(1).max(5), source: resident.nullable() });
const mind = z.strictObject({ id: resident, revision: counter, lastAttemptAtMs: timestamp.nullable(), lastSuccessAtMs: timestamp.nullable(),
  lastAppliedSequence: z.number().int().min(-1), lastPhysicalWatch: z.number().int().min(-1), project: project.nullable(), memories: z.array(evidence).max(L.memories) });
const turn = z.strictObject({ id, index: counter, speaker: resident, text: text(360), atMs: timestamp });
const legacyConversation = z.strictObject({ id, participants: z.tuple([resident, resident]), revision: counter, nextSpeaker: resident.nullable(),
  status: z.enum(['open', 'closed', 'expired']), createdAtMs: timestamp, expiresAtMs: timestamp, turns: z.array(turn).max(L.turns),
  appraisedThrough: z.tuple([z.number().int().min(-1).max(L.turns - 1), z.number().int().min(-1).max(L.turns - 1)]).optional() });
const conversation = legacyConversation.extend({ attentionThrough: z.tuple([counter, counter]) });
const offer = z.strictObject({ id, conversationId: id, proposer: resident, counterpart: resident, terms: offerTermsSchema,
  status: z.enum(['open', 'accepted', 'rejected', 'replaced', 'expired']), replaces: id.nullable(), createdAtMs: timestamp,
  expiresAtWatch: counter, acceptedAtMs: timestamp.nullable() });
const agreement = z.strictObject({ id, offerId: id, terms: offerTermsSchema, status: z.enum(['active', 'payment_due', 'fulfilled', 'breached']),
  acceptedAtMs: timestamp, acceptedAtWatch: counter, acceptedAfterEventSequence: counter, progress: z.number().int().min(0).max(4), completedAtMs: timestamp.nullable(),
  evidenceIds: z.array(id).max(4), debtId: id.nullable() });
const legacyState = z.strictObject({ version: z.literal(1), revision: counter, nextId: counter, createdAtMs: timestamp,
  minds: z.record(resident, mind), conversations: z.array(legacyConversation).max(L.conversations), offers: z.array(offer).max(L.offers),
  agreements: z.array(agreement).max(L.agreements) });
const recordsState = legacyState.extend({ version: z.literal(2), records: recordsStateSchema });
const retrievalState = recordsState.extend({ version: z.literal(3), retrieval: retrievalStateSchema });
const currentState = retrievalState.extend({ version: z.literal(SOCIETY_VERSION), conversations: z.array(conversation).max(L.conversations) });
const state = z.discriminatedUnion('version', [legacyState, recordsState, retrievalState, currentState]);
export function parseSocietyState(raw: unknown): { ok: true; state: SocietyState } | { ok: false; code: string } {
  const parsed = state.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'invalid_society_state' };
  // Decode old snapshots without inventing historical drafts or rewriting
  // their minds, IDs, revisions or obligations. SQL migration keeps raw bytes.
  const withRecords = parsed.data.version === 1 ? { ...parsed.data, version: 2 as const, records: emptyRecordsState() } : parsed.data;
  const s = withRecords.version === 2 ? { ...withRecords, version: 3 as const, retrieval: emptyRetrievalState() } : withRecords;
  const recordsProblem = validateRecordsState(s.records);
  if (!recordsProblem.ok) return { ok: false, code: recordsProblem.code };
  const retrievalProblem = validateRetrievalState(s.retrieval, s.minds, s.records);
  if (!retrievalProblem.ok) return retrievalProblem;
  const ids: string[] = [];
  for (const r of RESIDENTS) {
    const m = s.minds[r.id];
    if (!m || m.id !== r.id) return { ok: false, code: 'invalid_mind_identity' };
    const recordCursor = s.records.cursors[r.id];
    if (recordCursor.lastSequence > m.lastAppliedSequence || recordCursor.lastPublicationWatch > m.lastPhysicalWatch) {
      return { ok: false, code: 'record_cursor_ahead_of_mind' };
    }
    for (const e of m.memories) {
      ids.push(e.id);
      if (e.kind === 'interpretation' && !e.refs.length) return { ok: false, code: 'unevidenced_memory' };
    }
    if (new Set(m.memories.map((e) => e.id)).size !== m.memories.length) return { ok: false, code: 'duplicate_memory' };
    if (m.project) {
      ids.push(m.project.id, ...m.project.steps.map((p) => p.id));
      if (m.project.steps.some((p) => p.intent.actor !== r.id || (p.status === 'done' && !p.evidenceId))) return { ok: false, code: 'invalid_project_evidence' };
      if (m.project.steps.some((p) => !(PLANNABLE_VERBS as readonly string[]).includes(p.intent.verb)
        || p.at === 'breach' || p.intent.room === 'breach' || (p.at !== null && p.intent.verb === 'go'))) return { ok: false, code: 'invalid_executable_plan' };
      if (m.project.status === 'completed' && (!m.project.steps.length || m.project.steps.some((p) => p.status !== 'done'))) return { ok: false, code: 'uncompleted_project_steps' };
    }
  }
  const busy = new Map<string, number>(), openPairs = new Set<string>();
  for (const c of s.conversations) {
    ids.push(c.id, ...c.turns.map((t) => t.id));
    if (c.participants[0] === c.participants[1] || c.expiresAtMs <= c.createdAtMs) return { ok: false, code: 'invalid_conversation' };
    if (c.status === 'open' ? !c.participants.includes(c.nextSpeaker!) || c.turns.length >= L.turns : c.nextSpeaker !== null) return { ok: false, code: 'invalid_next_speaker' };
    if (c.turns.some((t, i) => t.index !== i || t.speaker !== c.participants[i % 2])) return { ok: false, code: 'invalid_turn_order' };
    if (c.appraisedThrough?.some((index, member) => index !== -1
      && (!c.turns[index] || c.turns[index].speaker === c.participants[member]))) return { ok: false, code: 'invalid_appraisal_watermark' };
    if (c.status === 'open' && c.nextSpeaker !== c.participants[c.turns.length % 2]) return { ok: false, code: 'invalid_next_speaker' };
    if ('attentionThrough' in c && c.attentionThrough.some(revision => revision > c.revision)) {
      return { ok: false, code: 'attention_cursor_ahead_of_conversation' };
    }
    if (c.status === 'open') {
      const pair = [...c.participants].sort().join(':');
      if (s.version === 4 && openPairs.has(pair)) return { ok: false, code: 'duplicate_open_conversation_pair' };
      openPairs.add(pair);
      for (const p of c.participants) {
        const count = (busy.get(p) ?? 0) + 1;
        if (s.version < 4 && count > 1) return { ok: false, code: 'overlapping_conversation' };
        if (count > MAX_OPEN_CHANNELS_PER_RESIDENT) return { ok: false, code: 'conversation_attention_capacity' };
        busy.set(p, count);
      }
    }
  }
  for (const o of s.offers) {
    ids.push(o.id);
    const parties = o.terms.kind === 'work' ? [o.terms.worker, o.terms.payer] : [o.terms.from, o.terms.to];
    if (o.proposer === o.counterpart || new Set(parties).size !== 2 || !parties.includes(o.proposer) || !parties.includes(o.counterpart)
      || (o.terms.kind !== 'work' && o.terms.cells <= 0)) return { ok: false, code: 'invalid_offer_parties' };
    if (o.status === 'open') {
      const c = s.conversations.find((c) => c.id === o.conversationId);
      if (!c || c.status !== 'open' || !c.participants.includes(o.proposer) || !c.participants.includes(o.counterpart)) return { ok: false, code: 'orphan_open_offer' };
    }
    if ((o.status === 'accepted') !== (o.acceptedAtMs !== null)) return { ok: false, code: 'invalid_acceptance' };
  }
  for (const a of s.agreements) {
    ids.push(a.id);
    const participants = a.terms.kind === 'work' ? [a.terms.worker, a.terms.payer] : [a.terms.from, a.terms.to];
    if (new Set(participants).size !== 2 || (a.terms.kind !== 'work' && a.terms.cells <= 0)) return { ok: false, code: 'invalid_agreement_parties' };
    if (a.terms.kind === 'work' && a.progress > a.terms.units) return { ok: false, code: 'invalid_work_progress' };
    if (a.terms.kind === 'work' && (a.progress !== a.evidenceIds.length || new Set(a.evidenceIds).size !== a.evidenceIds.length
      || (['payment_due', 'fulfilled'].includes(a.status) && a.progress !== a.terms.units))) return { ok: false, code: 'invalid_work_evidence' };
    if (a.status === 'fulfilled' && a.completedAtMs === null) return { ok: false, code: 'missing_fulfillment' };
    if (a.terms.kind === 'loan' ? a.debtId === null : a.debtId !== null) return { ok: false, code: 'invalid_debt_reference' };
    const original = s.offers.find((o) => o.id === a.offerId);
    if (original && (original.status !== 'accepted' || JSON.stringify(original.terms) !== JSON.stringify(a.terms))) return { ok: false, code: 'agreement_terms_changed' };
  }
  if (new Set(ids).size !== ids.length) return { ok: false, code: 'duplicate_society_id' };
  if (ids.some((id) => { const match = /^(?:project|step|memory|conversation|turn|offer|agreement):(\d+)$/.exec(id); return !match || Number(match[1]) >= s.nextId; })) return { ok: false, code: 'invalid_id_sequence' };
  // Historical invariants have passed before a legacy snapshot can acquire
  // concurrent-channel semantics. Preserve every old field and append only
  // the private per-participant marker; never silently drop legacy extensions.
  const current = s.version === 4 ? s : { ...s, version: SOCIETY_VERSION,
    conversations: s.conversations.map(c => ({ ...c, attentionThrough: legacyAttentionThrough(c, s.minds) })) };
  return { ok: true, state: JSON.parse(JSON.stringify(current)) as SocietyState };
}
