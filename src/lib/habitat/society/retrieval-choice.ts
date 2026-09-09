import { z } from 'zod';
import type { WorldState } from '../engine/state';
import { canReadRecord } from './records';
import { applyRecordCapabilityChoice, prepareRecordTurn, recordCapabilityChoiceJsonSchema } from './record-choice';
import { searchRecordCatalogue, selectRecordCatalogueEntry, type RecordCatalogueResult } from './record-retrieval';
import type { RecordBinding } from './record-types';
import type { PreparedTurn, SocietyResult, SocietyState } from './types';

type Shape = Record<string, unknown>;
export type PreparedRecordRetrieval = { version: 1; revision: number; pending: boolean; catalogue: RecordCatalogueResult;
  focus: (RecordBinding & { status: 'available' | 'unavailable' }) | null };
const object = (v: unknown): v is Shape => v !== null && typeof v === 'object' && !Array.isArray(v);
const context = (turn: PreparedTurn): Shape => JSON.parse(turn.prompt.trimStart().startsWith('{')
  ? turn.prompt : turn.prompt.slice(turn.prompt.lastIndexOf('\n{') + 1)) as Shape;
function prepared(turn: PreparedTurn): PreparedRecordRetrieval {
  const value = turn.recordRetrieval;
  if (!object(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || typeof value.pending !== 'boolean' || !object(value.catalogue) || typeof value.catalogue.ok !== 'boolean')
    throw new RangeError('Missing prepared retrieval context');
  return value as PreparedRecordRetrieval;
}

/** Preparation never consumes a query or focus. Provider admission and retries
 * can fail; only an applied P7 result acknowledges the delivered context. */
export function prepareRetrievalTurn(state: SocietyState, world: WorldState, initial: PreparedTurn): PreparedTurn {
  const saved = state.retrieval[initial.actor];
  const draft = saved.focus && state.records.drafts.find(d => d.id === saved.focus!.draftId
    && d.contentHash === saved.focus!.contentHash && canReadRecord(state.records, d, initial.actor));
  const turn = prepareRecordTurn(state, world, initial, draft ? saved.focus! : undefined);
  const retrieval: PreparedRecordRetrieval = { version: 1, revision: saved.revision, pending: saved.pending,
    catalogue: searchRecordCatalogue(state.records, initial.actor, { query: saved.query, ...(saved.cursor ? { cursor: saved.cursor } : {}) }),
    focus: saved.focus ? { ...saved.focus, status: draft ? 'available' : 'unavailable' } : null };
  const split = turn.prompt.lastIndexOf('\n{'), prefix = split < 0 ? '' : turn.prompt.slice(0, split + 1);
  // Hashes, snapshot identity and cursor offsets are trusted server bindings.
  // The model needs the exact title/author/ID and an offered next operation,
  // not duplicate transport bookkeeping. No document body is shortened.
  const catalogue = retrieval.catalogue.ok ? { query: retrieval.catalogue.page.query,
    total: retrieval.catalogue.page.total, entries: retrieval.catalogue.page.entries.map(entry => ({
      draftId: entry.draftId, title: entry.title, author: entry.author, createdAtMs: entry.createdAtMs,
    })), hasNext: retrieval.catalogue.page.nextCursor !== null } : { error: retrieval.catalogue.code, query: saved.query };
  const shown = { catalogue, focus: retrieval.focus ? { draftId: retrieval.focus.draftId, status: retrieval.focus.status } : null };
  const prompt = `${prefix}${JSON.stringify({ ...context(turn), retrieval: shown })}`;
  const promptBytes = new TextEncoder().encode(prompt).length;
  return { ...turn, recordRetrieval: retrieval, prompt, promptBytes, contextOverflow: promptBytes > 6500 };
}

export function lookupSchema(turn: PreparedTurn): Shape {
  const { catalogue } = prepared(turn);
  const obj = (properties: Shape): Shape => ({ type: 'object', additionalProperties: false,
    properties, required: Object.keys(properties) });
  const choices = [obj({ kind: { const: 'search' }, query: { type: 'string', maxLength: 96 } }),
    obj({ kind: { const: 'refresh' } }), obj({ kind: { const: 'clear' } })];
  if (catalogue.ok) {
    if (catalogue.page.nextCursor) choices.push(obj({ kind: { const: 'next' }, cursor: { const: catalogue.page.nextCursor } }));
    if (catalogue.page.entries.length) choices.push(obj({ kind: { const: 'read' },
      draftId: { enum: catalogue.page.entries.map(entry => entry.draftId) } }));
  }
  return obj({ lookup: { anyOf: choices } });
}

/** Lookup is a private alternative, never a filler message or a combined
 * economic/document operation. P1–P6 have no lookup branch. */
export function retrievalCapabilityChoiceJsonSchema(state: SocietyState, world: WorldState, turn: PreparedTurn): Shape {
  const base = recordCapabilityChoiceJsonSchema(state, world, turn);
  const { $defs, ...ordinary } = base;
  return { type: 'object', $defs, anyOf: [ordinary, lookupSchema(turn)] };
}

type Lookup = { kind: 'search'; query: string } | { kind: 'next'; cursor: string }
  | { kind: 'refresh' } | { kind: 'clear' } | { kind: 'read'; draftId: string };

export function applyRetrievalCapabilityChoice(state: SocietyState, world: WorldState, turn: PreparedTurn,
  raw: unknown, control: { nowMs: number; generation: number }): SocietyResult {
  const fail = (code: string): SocietyResult => ({ ok: false, code, state, world });
  if (!Number.isSafeInteger(control.nowMs) || control.nowMs < turn.preparedAtMs || control.generation !== turn.generation)
    return fail('stale_control');
  const mind = state.minds[turn.actor], cursor = state.retrieval[turn.actor];
  if (!mind || !cursor || !Number.isSafeInteger(turn.sequence) || turn.sequence < 0) return fail('invalid_job');
  if (turn.sequence <= mind.lastAppliedSequence) return { ok: true, code: 'already_applied', state, world };
  if (control.nowMs >= turn.expiresAtMs) return fail('expired_job');
  if (mind.revision !== turn.mindRevision) return fail('stale_mind');
  try {
    const issued = prepared(turn);
    if (issued.revision !== cursor.revision) return fail('stale_retrieval');
    if (!z.fromJSONSchema(retrievalCapabilityChoiceJsonSchema(state, world, turn)).safeParse(raw).success)
      return fail('invalid_retrieval_choice');
    const lookup = (raw as { lookup?: Lookup }).lookup;
    if (!lookup) {
      const result = applyRecordCapabilityChoice(state, world, turn, raw, control);
      if (result.ok && result.code === 'applied' && cursor.pending) {
        // Keep the selected revision/query for future use; acknowledge only
        // this successfully delivered context, without asserting comprehension.
        result.state.retrieval[turn.actor].pending = false;
        result.state.retrieval[turn.actor].revision += 1;
        result.state.retrieval[turn.actor].lastSequence = turn.sequence;
      }
      return result;
    }
    let query = cursor.query, pageCursor = cursor.cursor, focus = cursor.focus;
    if (lookup.kind === 'search') {
      const searched = searchRecordCatalogue(state.records, turn.actor, { query: lookup.query });
      if (!searched.ok) return fail(searched.code);
      query = searched.page.query; pageCursor = null;
    } else if (lookup.kind === 'refresh') pageCursor = null;
    else if (lookup.kind === 'clear') { query = ''; pageCursor = null; focus = null; }
    else if (lookup.kind === 'next') {
      const searched = searchRecordCatalogue(state.records, turn.actor, { query, cursor: lookup.cursor });
      if (!searched.ok) return fail(searched.code);
      pageCursor = lookup.cursor;
    } else {
      if (!issued.catalogue.ok) return fail('unavailable_record_draft');
      const selected = selectRecordCatalogueEntry(state.records, turn.actor, issued.catalogue.page, lookup.draftId);
      if (!selected.ok) return fail(selected.code);
      focus = selected.binding;
    }
    // No expireDraft, appraisal, conversation watermark, record cursor or
    // economic operation: only this actor's durable private request changes.
    // Incoming speech changes mindRevision and correctly invalidates this job.
    const next = structuredClone(state), nextMind = next.minds[turn.actor];
    next.retrieval[turn.actor] = { ...cursor, query, cursor: pageCursor, focus, pending: lookup.kind !== 'clear',
      revision: cursor.revision + 1, lastSequence: turn.sequence };
    nextMind.lastAppliedSequence = turn.sequence; nextMind.lastSuccessAtMs = control.nowMs;
    nextMind.lastAttemptAtMs = Math.max(nextMind.lastAttemptAtMs ?? 0, turn.preparedAtMs);
    nextMind.revision += 1; next.revision += 1;
    return { ok: true, code: 'applied', state: next, world: structuredClone(world) };
  } catch { return fail('invalid_retrieval_choice'); }
}
