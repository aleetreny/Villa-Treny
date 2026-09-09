import { z } from 'zod';
import type { WorldState } from '../engine/state';
import { RESIDENTS, type ResidentId } from '../residents';
import { applyAppraisal, validateAppraisal } from './appraisal';
import { applyProposalCapabilityChoice, decodeProposalCapabilityChoice, proposalCapabilityChoiceJsonSchema } from './capabilities';
import { recordOperationSchema } from './record-schema';
import { applyRecordOperation, canReadRecord, recordContext } from './records';
import { RECORD_LIMITS as L, type RecordBinding, type RecordOperation, type RecordReference, type RecordTurnContext } from './record-types';
import { commitRecordOnlyTurn } from './turn';
import { latestUnreviewedClosingTurn } from './closing-turn';
import { evidence } from './state';
import type { PreparedTurn, SocietyResult, SocietyState } from './types';

type Shape = Record<string, unknown>;
const DRAFT_TEXT_MAX_LENGTH = L.contentBytes - L.titleBytes;
const object = (value: unknown): value is Shape => value !== null && typeof value === 'object' && !Array.isArray(value);
const contextOf = (turn: PreparedTurn): Shape => JSON.parse(turn.prompt.trimStart().startsWith('{')
  ? turn.prompt : turn.prompt.slice(turn.prompt.lastIndexOf('\n{') + 1)) as Shape;
const bound = (draft: { id: string; contentHash: string }): Shape => ({ type: 'object', additionalProperties: false,
  required: ['draftId', 'contentHash'], properties: { draftId: { const: draft.id }, contentHash: { const: draft.contentHash } } });

/** Add only complete, accessible revisions. The issued context binds the
 * records cursor and source visibility; later validation may not substitute a
 * new document or promote private evidence to public provenance. */
export function prepareRecordTurn(state: SocietyState, world: WorldState, turn: PreparedTurn, focus?: RecordBinding): PreparedTurn {
  const context = contextOf(turn), visible = recordContext(state.records, turn.actor, focus);
  // Keep the actual closing message even if relevance-ranked memories no
  // longer contain it. This is received speech, not an active reply obligation.
  const receivedClosure = turn.dialoguePolicy === 'concurrent-v1' ? undefined
    : latestUnreviewedClosingTurn(state, turn.actor, turn.preparedAtMs);
  const evidenceIds = [...new Set([...turn.evidenceIds, ...(receivedClosure ? [receivedClosure.turn.id] : [])])];
  const publicIds = new Set([`world:${world.day}:${world.watch}`,
    ...state.conversations.flatMap(c => c.turns.map(t => t.id)), ...state.offers.map(o => o.id),
    ...state.agreements.map(a => a.id), ...world.economy.debts.map(d => d.id)]);
  for (const fact of (context.ownKnowledge ?? []) as Array<{ id: string; private: boolean }>) {
    if (fact.private === false) publicIds.add(fact.id);
  }
  const preparedRefs: RecordReference[] = evidenceIds.map(id => ({ id,
    audience: publicIds.has(id) ? 'public' : [turn.actor] }));
  // Grants travel with the trusted prepared turn, not with model output. A
  // private shared revision is citable privately by this reader; that does not
  // grant them permission to republish its private provenance.
  for (const shown of visible.drafts) {
    const draft = state.records.drafts.find(d => d.id === shown.id)!;
    const publicDraft = draft.audience === 'public' || state.records.shares.some(s => s.draftId === draft.id && s.audience === 'public')
      || state.records.publications.some(p => p.draftId === draft.id && p.audience === 'public');
    preparedRefs.push({ id: draft.id, audience: publicDraft ? 'public' : [turn.actor] });
  }
  // Bind the narrower grammar to newly issued preparations. Saved P6 turns
  // without this marker retain their original 600-character body grammar.
  const records = { ...visible, draftTextMaxLength: DRAFT_TEXT_MAX_LENGTH, referenceAccess: {
    public: preparedRefs.filter(r => r.audience === 'public').map(r => r.id),
    private: preparedRefs.filter(r => r.audience !== 'public').map(r => r.id),
  } };
  const { cursor, referenceAccess, ...readableRecords } = records;
  const concurrent = turn.dialoguePolicy === 'concurrent-v1';
  const split = turn.prompt.lastIndexOf('\n{');
  const prefix = split < 0 ? '' : turn.prompt.slice(0, split + 1);
  const prompt = `${prefix}${JSON.stringify({ ...context, ...(receivedClosure ? { receivedClosure } : {}),
    records: concurrent ? readableRecords : records })}`;
  const promptBytes = new TextEncoder().encode(prompt).length;
  return { ...turn, evidenceIds: [...new Set([...evidenceIds, ...visible.drafts.map(d => d.id)])],
    ...(concurrent ? { recordAuthority: { version: 1 as const, cursor, referenceAccess } } : {}),
    prompt, promptBytes, contextOverflow: promptBytes > 6500 };
}

function preparedRecords(turn: PreparedTurn) {
  const shown = contextOf(turn).records;
  const authority = turn.recordAuthority;
  if (turn.dialoguePolicy === 'concurrent-v1' && (!authority || authority.version !== 1))
    throw new RangeError('Missing prepared record authority');
  const value = turn.dialoguePolicy === 'concurrent-v1' && object(shown)
    ? { ...shown, cursor: authority!.cursor, referenceAccess: authority!.referenceAccess } : shown;
  if (!object(value) || !object(value.cursor) || !Number.isSafeInteger(value.cursor.revision)
    || !Array.isArray(value.drafts) || !Array.isArray(value.offers) || !object(value.referenceAccess)
    || !Array.isArray(value.referenceAccess.public) || !Array.isArray(value.referenceAccess.private))
    throw new RangeError('Missing prepared records context');
  if (Object.hasOwn(value, 'draftTextMaxLength') && value.draftTextMaxLength !== DRAFT_TEXT_MAX_LENGTH)
    throw new RangeError('Invalid prepared draft text limit');
  return value as ReturnType<typeof recordContext> & { draftTextMaxLength?: number;
    referenceAccess: { public: string[]; private: string[] } };
}

function operationSchema(state: SocietyState, world: WorldState, turn: PreparedTurn): Shape {
  const context = preparedRecords(turn), actor = turn.actor;
  const shownIds = new Set(context.drafts.map(d => d.id));
  const drafts = state.records.drafts.filter(d => shownIds.has(d.id) && canReadRecord(state.records, d, actor));
  const own = drafts.filter(d => d.author === actor);
  const schema = z.toJSONSchema(recordOperationSchema, { unrepresentable: 'any' }) as Shape;
  const variants = (schema.anyOf as Shape[]).map(v => structuredClone(v));
  const output: Shape[] = [];
  const audiences = ['public', ...RESIDENTS.map(r => r.id)];
  // Offer only the intersection of source permissions, without exposing any
  // source's reader list. Visibility of a commission is a separate property.
  const shareAudiences = (draft: typeof drafts[number]) => audiences.filter(audience => draft.refs.every(ref =>
    ref.audience === 'public' || (audience !== 'public' && ref.audience.some(id => id === audience))));
  for (const variant of variants) {
    const props = variant.properties as Record<string, Shape>, kind = props.kind!;
    if (kind.const === 'draft') {
      const bounded = context.draftTextMaxLength === DRAFT_TEXT_MAX_LENGTH;
      props.title = { type: 'string', minLength: 1, maxLength: L.titleBytes,
        ...(bounded ? { description: `Max ${L.titleBytes} UTF-8 bytes; title + text max ${L.contentBytes} bytes.` } : {}) };
      props.text = { type: 'string', minLength: 1, maxLength: bounded ? DRAFT_TEXT_MAX_LENGTH : L.contentBytes,
        ...(bounded ? { description: `Max ${L.contentBytes} UTF-8 bytes; title + text max ${L.contentBytes} bytes.` } : {}) };
      const references = (ids: string[]): Shape => ids.length
        ? { type: 'array', maxItems: 4, items: { enum: ids } } : { type: 'array', maxItems: 0, items: { type: 'string' } };
      props.refs = references([...context.referenceAccess.public, ...context.referenceAccess.private]);
      props.parent = own.length ? { anyOf: [{ type: 'null' }, ...own.map(bound)] } : { type: 'null' };
      if (state.records.intents.some(i => i.author === actor)) props.publish = { const: false };
      output.push({ ...variant, properties: { ...props, audience: { const: 'private' }, publish: { const: false } } });
      if (context.referenceAccess.private.length) {
        output.push({ ...variant, properties: { ...props, audience: { const: actor } } });
        output.push({ ...variant, properties: { ...props,
          audience: { enum: audiences.filter(id => id !== actor) }, refs: references(context.referenceAccess.public) } });
      } else output.push({ ...variant, properties: { ...props, audience: { enum: audiences } } });
    } else if (Array.isArray(kind.enum) && kind.enum.includes('share')) {
      for (const d of own) {
        const permitted = shareAudiences(d);
        const sharedPublicly = d.audience === 'public' || state.records.shares.some(s => s.draftId === d.id && s.audience === 'public')
          || state.records.publications.some(p => p.draftId === d.id && p.audience === 'public');
        const newReaders = permitted.filter(audience => !sharedPublicly && (audience === 'public'
          || !canReadRecord(state.records, d, audience as ResidentId)));
        if (newReaders.length) output.push({ ...variant, properties: { ...props, ...(bound(d).properties as Shape),
          kind: { const: 'share' }, audience: { enum: newReaders } } });
        if (permitted.length && !state.records.intents.some(i => i.author === actor)
          && !state.records.publications.some(p => p.draftId === d.id))
          output.push({ ...variant, properties: { ...props, ...(bound(d).properties as Shape),
            kind: { const: 'schedule' }, audience: { enum: permitted } } });
      }
    } else if (kind.const === 'cancel_publication') {
      if (context.intent) output.push({ ...variant, properties: { ...props, intentId: { const: context.intent.id } } });
    } else if (kind.const === 'commission') {
      for (const d of drafts) {
        const recipients = RESIDENTS.filter(r => r.id !== actor && (d.author === actor || r.id === d.author)
          && canReadRecord(state.records, d, r.id)).map(r => r.id);
        const publicDraft = d.audience === 'public' || state.records.shares.some(s => s.draftId === d.id && s.audience === 'public')
          || state.records.publications.some(p => p.draftId === d.id && p.audience === 'public');
        const permitted = shareAudiences(d);
        if (recipients.length && permitted.length && !state.records.publications.some(p => p.draftId === d.id))
          output.push({ ...variant, properties: { ...props, ...(bound(d).properties as Shape),
          audience: { enum: permitted },
          counterpart: { enum: recipients }, visibility: publicDraft ? props.visibility : { const: 'private' },
          cells: { type: 'number', minimum: 0, maximum: 1000, multipleOf: 0.01 } } });
      }
    } else if (Array.isArray(kind.enum) && kind.enum.includes('accept')) {
      const incoming = context.offers.filter(o => o.counterpart === actor && o.status === 'open'
        && o.expiresAtWatch > world.day * 4 + world.watch - 1 && shownIds.has(o.terms.draftId)).map(o => o.id);
      if (incoming.length) output.push({ ...variant, properties: { ...props, offerId: { enum: incoming } } });
    }
  }
  return { anyOf: output, description: 'One explicit document operation. Text is an attributed claim. Draft title plus body must fit 600 UTF-8 bytes; references require audience permission. No operation implies consent.' };
}

/** P4 object shape, extended only for explicitly issued version6 turns. */
export function recordCapabilityChoiceJsonSchema(state: SocietyState, world: WorldState, turn: PreparedTurn): Shape {
  const schema = structuredClone(proposalCapabilityChoiceJsonSchema(state, world, turn));
  const record = operationSchema(state, world, turn);
  schema.$defs = { ...(schema.$defs as Shape), record_operation: record };
  const reference = { $ref: '#/$defs/record_operation' };
  (schema.properties as Shape).record = reference;
  if (Array.isArray(schema.anyOf)) for (const branch of schema.anyOf as Shape[])
    (branch.properties as Shape).record = reference;
  return shareRepeatedSchemas(schema);
}

/** Factor byte-identical schema subtrees only. It does not remove an operation,
 * range, property or evidence ID. JSON-pointer definitions keep the same P4
 * output object while avoiding repeated record bindings and field grammars. */
export function shareRepeatedSchemas(schema: Shape): Shape {
  const counts = new Map<string, number>();
  const candidate = (value: Shape) => ['$ref', 'type', 'enum', 'const', 'anyOf', 'oneOf', 'allOf']
    .some(key => Object.hasOwn(value, key)) && !Object.hasOwn(value, '$ref');
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!object(value)) return;
    if (candidate(value)) { const key = JSON.stringify(value); counts.set(key, (counts.get(key) ?? 0) + 1); }
    Object.values(value).forEach(visit);
  };
  visit(schema);
  const reserved = new Set(Object.keys((schema.$defs ?? {}) as Shape));
  let serial = 0;
  const shared = new Map([...counts].filter(([key, n]) => n > 1 && (key.length - 32) * n > key.length + 12)
    .map(([key]) => {
      let name: string;
      do { name = `record_s${serial++}`; } while (reserved.has(name));
      reserved.add(name); return [key, name];
    }));
  const definitions: Shape = {}, started = new Set<string>();
  const rewrite = (value: unknown, skip?: string): unknown => {
    if (Array.isArray(value)) return value.map(v => rewrite(v));
    if (!object(value)) return value;
    const key = JSON.stringify(value), name = candidate(value) ? shared.get(key) : undefined;
    if (name && key !== skip) {
      if (!started.has(name)) { started.add(name); definitions[name] = rewrite(value, key); }
      return { $ref: `#/$defs/${name}` };
    }
    return Object.fromEntries(Object.entries(value).map(([k, child]) => [k, rewrite(child)]));
  };
  const result = rewrite(schema) as Shape;
  return { ...result, $defs: { ...(result.$defs as Shape), ...definitions } };
}

export type RecordChoiceDecode = { ok: true; value: { common: Shape; record?: RecordOperation } }
  | { ok: false; code: string };

export function decodeRecordCapabilityChoice(state: SocietyState, world: WorldState, turn: PreparedTurn,
  raw: unknown): RecordChoiceDecode {
  try {
    if (!z.fromJSONSchema(recordCapabilityChoiceJsonSchema(state, world, turn)).safeParse(raw).success)
      return { ok: false, code: 'invalid_record_choice' };
    const { record, ...common } = raw as Shape;
    if (record === undefined) {
      const decoded = decodeProposalCapabilityChoice(state, world, turn, common);
      return decoded.ok ? { ok: true, value: { common } } : decoded;
    }
    const parsed = recordOperationSchema.safeParse(record);
    if (!parsed.success) return { ok: false, code: 'invalid_record_operation' };
    const ordinary = Object.keys(common).filter(key => key !== 'appraisal');
    if (ordinary.length) {
      const decoded = decodeProposalCapabilityChoice(state, world, turn, common);
      if (!decoded.ok) return decoded;
    } else if (common.appraisal !== undefined) {
      const appraisal = validateAppraisal(state, turn, common.appraisal);
      if (!appraisal.ok) return appraisal;
    }
    // Pure preview validates ownership, exact terms, reference permission and
    // capacities. Application repeats it against the successful base draft.
    const preview = applyRecordOperation(state.records, world, operationContext(turn, turn.preparedAtMs), parsed.data, state);
    return preview.ok && preview.code === 'applied' ? { ok: true, value: { common, record: parsed.data } }
      : { ok: false, code: preview.ok ? 'record_sequence_ahead' : preview.code };
  } catch {
    return { ok: false, code: 'invalid_record_choice' };
  }
}

function operationContext(turn: PreparedTurn, nowMs: number): RecordTurnContext {
  const prepared = preparedRecords(turn);
  const preparedRefs: RecordReference[] = [...prepared.referenceAccess.public.map(id => ({ id, audience: 'public' as const })),
    ...prepared.referenceAccess.private.map(id => ({ id, audience: [turn.actor] }))];
  return { actor: turn.actor, sequence: turn.sequence, expectedRevision: prepared.cursor.revision,
    nowMs, preparedRefs };
}

export function applyRecordCapabilityChoice(state: SocietyState, world: WorldState, turn: PreparedTurn, raw: unknown,
  control: { nowMs: number; generation: number }): SocietyResult {
  if (state.minds[turn.actor] && turn.sequence <= state.minds[turn.actor].lastAppliedSequence)
    return applyProposalCapabilityChoice(state, world, turn, {}, control);
  const decoded = decodeRecordCapabilityChoice(state, world, turn, raw);
  if (!decoded.ok) return { ok: false, code: decoded.code, state, world };
  const { common, record } = decoded.value;
  if (!record) return applyProposalCapabilityChoice(state, world, turn, common, control);
  let base: SocietyResult;
  if (Object.keys(common).some(key => key !== 'appraisal')) base = applyProposalCapabilityChoice(state, world, turn, common, control);
  else {
    base = commitRecordOnlyTurn(state, world, turn, control);
    if (common.appraisal !== undefined) {
      const appraisal = validateAppraisal(state, turn, common.appraisal);
      if (!appraisal.ok) return { ok: false, code: appraisal.code, state, world };
      base = applyAppraisal(base, turn, appraisal.value, control.nowMs);
    }
  }
  if (!base.ok || base.code !== 'applied') return base;
  const result = applyRecordOperation(base.state.records, base.world, operationContext(turn, control.nowMs), record, base.state);
  if (!result.ok || result.code !== 'applied')
    return { ok: false, code: result.ok ? 'record_sequence_ahead' : result.code, state, world };
  base.state.records = result.records;
  // Receiving an explicit share/offer is observable; reading, agreement and
  // publication are not implied. This wakes the named recipient through the
  // existing observation scheduler without broadcasting public drafts to25.
  const recipients = new Set<ResidentId>();
  if ((record.kind === 'draft' || record.kind === 'share') && record.audience !== 'private' && record.audience !== 'public')
    recipients.add(record.audience);
  if (record.kind === 'commission') recipients.add(record.counterpart);
  if (record.kind === 'accept' || record.kind === 'reject') {
    const offer = result.records.offers.find(o => o.id === record.offerId);
    if (offer) recipients.add(offer.proposer);
  }
  const refs = result.createdIds.length ? result.createdIds : 'offerId' in record ? [record.offerId]
    : 'draftId' in record ? [record.draftId] : 'intentId' in record ? [record.intentId] : [];
  const detail = `${turn.actor} recorded ${record.kind}: ${refs.join(', ')}. `
    + (record.kind === 'accept' ? 'The exact publication commission was accepted; publication is still pending.'
      : record.kind === 'reject' ? 'The publication commission was rejected; no payment occurred.'
        : 'This records the operation, not reading, endorsement, publication or payment.');
  evidence(base.state, turn.actor, result.world, control.nowMs, 'observation', detail, refs, turn.actor, 4);
  for (const recipient of recipients) if (recipient !== turn.actor)
    evidence(base.state, recipient, result.world, control.nowMs, 'observation', detail, refs, turn.actor, 4);
  return { ...base, world: result.world };
}
