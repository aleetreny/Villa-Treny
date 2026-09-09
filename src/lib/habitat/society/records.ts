import { RESIDENTS, type ResidentId } from '../residents';
import type { WorldState } from '../engine/state';
import { economicAccounts, recordEconomicChange, remember } from '../engine/economy';
import { canSpendCells } from './money';
import { watchNumber } from './state';
import { recordContentHash, recordOperationSchema, validateRecordsState } from './record-schema';
import { publicRecordPublication } from './public-record-publication';
import { RECORD_LIMITS as L, type AuthoredDraft, type RecordAudience, type RecordBinding,
  type RecordCommissionTerms, type RecordContext, type RecordLegacyContext, type RecordOperation,
  type RecordPublicationIntent, type RecordPublicationSlot, type RecordReference, type RecordResult,
  type RecordsState, type RecordTurnContext, type PublicRecordsView } from './record-types';

const ordinal = (id: string) => Number(id.split(':')[2]);
const nextId = (state: RecordsState, kind: string) => `record:${kind}:${state.nextId++}`;
const boundDraft = (state: RecordsState, binding: RecordBinding) =>
  state.drafts.find(d => d.id === binding.draftId && d.contentHash === binding.contentHash);
const result = (records: RecordsState, world: WorldState, code: string, ok = false, createdIds: string[] = []): RecordResult =>
  ({ ok, code, records, world, createdIds });
const reads = (audience: RecordAudience | 'private', author: ResidentId, actor: ResidentId) =>
  author === actor || audience === 'public' || audience === actor;

export function canReadRecord(state: RecordsState, draft: AuthoredDraft, actor: ResidentId): boolean {
  return reads(draft.audience, draft.author, actor) || state.shares.some(s => s.draftId === draft.id
    && reads(s.audience, s.author, actor)) || state.publications.some(p => p.draftId === draft.id
    && reads(p.audience, p.author, actor));
}
const publicDraft = (state: RecordsState, d: AuthoredDraft) => d.audience === 'public'
  || state.shares.some(s => s.draftId === d.id && s.audience === 'public')
  || state.publications.some(p => p.draftId === d.id && p.audience === 'public');
const referenceAllows = (ref: RecordReference, actor: ResidentId) => ref.audience === 'public' || ref.audience.includes(actor);
function sharingAllowed(draft: AuthoredDraft, audience: RecordAudience | 'private'): boolean {
  return draft.refs.every(ref => audience === 'private' || (audience === 'public'
    ? ref.audience === 'public' : referenceAllows(ref, audience)));
}
function targetAllowed(ctx: RecordTurnContext, audience: RecordAudience | 'private'): boolean {
  return audience === 'public' || audience === 'private' || audience === ctx.actor
    || ctx.eligibleRecipients === undefined || ctx.eligibleRecipients.includes(audience);
}

/** Promised cells stay in real wallets and can be spent physically; recheck at payment. */
export function recordPromisedCells(state: RecordsState, payer: ResidentId, except?: string): number {
  return state.agreements.reduce((sum,a) => sum + (a.id !== except && a.terms.payer === payer
    && ['active','payment_due'].includes(a.status) ? a.terms.cells : 0), 0);
}
function oldPromises(legacy: RecordLegacyContext | undefined, payer: ResidentId): number {
  return legacy?.agreements.reduce((sum,a) => sum + (a.terms.kind === 'work' && a.terms.payer === payer
    && ['active','payment_due'].includes(a.status) ? a.terms.cells : 0), 0) ?? 0;
}
function oldCommitment(legacy: RecordLegacyContext | undefined, author: ResidentId): boolean {
  return legacy?.agreements.some(a => a.status === 'active' && a.terms.kind === 'work'
    && a.terms.worker === author && a.progress < a.terms.units) ?? false;
}

/** Eviction is a bounded working-set operation. The runtime must archive every
 * publication together with its draft before a subsequent state is committed. */
function releaseOldDraft(state: RecordsState, protect: readonly string[] = []): boolean {
  const candidate = state.drafts.find(d => {
    if (protect.includes(d.id) || state.publications.some(p => p.draftId === d.id && protect.includes(p.id))) return false;
    if (state.intents.some(i => i.draftId === d.id)
      || state.offers.some(o => o.terms.draftId === d.id && o.status === 'open')
      || state.agreements.some(a => a.terms.draftId === d.id && ['active','payment_due'].includes(a.status))) return false;
    const refIds = new Set([d.id, ...state.publications.filter(p => p.draftId === d.id).map(p => p.id)]);
    return !state.drafts.some(other => other.id !== d.id && other.refs.some(r => refIds.has(r.id)));
  });
  if (!candidate) return false;
  const removed = state.publications.filter(p => p.draftId === candidate.id);
  state.archive.drafts++; state.archive.publications += removed.length;
  if (state.drafts.some(d => d.parent?.draftId === candidate.id)) state.archive.parents.push({
    draftId: candidate.id, contentHash: candidate.contentHash, author: candidate.author });
  state.drafts = state.drafts.filter(d => d.id !== candidate.id);
  state.publications = state.publications.filter(p => p.draftId !== candidate.id);
  state.shares = state.shares.filter(s => s.draftId !== candidate.id);
  state.offers = state.offers.filter(o => o.terms.draftId !== candidate.id);
  state.agreements = state.agreements.filter(a => a.terms.draftId !== candidate.id);
  state.archive.parents = state.archive.parents.filter(p => state.drafts.some(d => d.parent?.draftId === p.draftId));
  return true;
}
function roomFor(state: RecordsState, kind: 'drafts'|'publications', protect: readonly string[] = []): boolean {
  while (state[kind].length >= L[kind]) if (!releaseOldDraft(state,protect)) return false;
  return true;
}
function agreementRoom(state: RecordsState): boolean {
  if (state.agreements.length < L.agreements) return true;
  const index = state.agreements.findIndex(a => ['fulfilled','breached'].includes(a.status)
    && !state.drafts.some(d => d.refs.some(r => r.id === a.id)));
  if (index === -1) return false;
  state.agreements.splice(index,1); return true;
}
function offerRoom(state: RecordsState): boolean {
  if (state.offers.length < L.offers) return true;
  const index = state.offers.findIndex(o => o.status !== 'open'
    && !state.agreements.some(a => a.offerId === o.id && ['active','payment_due'].includes(a.status))
    && !state.drafts.some(d => d.refs.some(r => r.id === o.id
      || state.agreements.some(a => a.offerId === o.id && a.id === r.id))));
  if (index === -1) return false;
  const old = state.offers[index]!;
  state.agreements = state.agreements.filter(a => a.offerId !== old.id);
  state.offers.splice(index,1); return true;
}
function expireInPlace(state: RecordsState, watch: number): boolean {
  let changed = false;
  for (const offer of state.offers) if (offer.status === 'open' && offer.expiresAtWatch <= watch) {
    offer.status = 'expired'; changed = true;
  }
  for (const a of state.agreements) if (a.status === 'active' && a.terms.dueWatch < watch) {
    a.status = 'breached'; changed = true;
  }
  return changed;
}
function schedule(state: RecordsState, draft: AuthoredDraft, audience: RecordAudience, watch: number,
  legacy?: RecordLegacyContext): string | null {
  if (state.publications.some(p => p.draftId === draft.id)) return 'already_published';
  if (!sharingAllowed(draft,audience)) return 'private_reference';
  const existing = state.intents.find(i => i.author === draft.author);
  if (existing) return 'publication_already_scheduled';
  const earliestWatch = Math.max(watch, state.cursors[draft.author].lastPublicationWatch + 1,
    (legacy?.minds[draft.author].lastPhysicalWatch ?? -1) + 1);
  state.intents.push({ id: nextId(state,'intent'), author: draft.author, draftId: draft.id,
    contentHash: draft.contentHash, audience, scheduledAtWatch: watch, earliestWatch });
  return null;
}
function commissionProblem(state: RecordsState, world: WorldState, terms: RecordCommissionTerms,
  legacy?: RecordLegacyContext, proposingActor?: ResidentId): string | null {
  const draft = boundDraft(state,terms), watch = watchNumber(world);
  if (!draft || draft.author !== terms.author || terms.author === terms.payer) return 'invalid_commission_parties';
  if (!canReadRecord(state,draft,terms.payer)) return 'draft_not_shared_with_payer';
  if (!sharingAllowed(draft,terms.audience)) return 'private_reference';
  if (state.publications.some(p => p.draftId === draft.id)) return 'already_published';
  if (terms.dueWatch < Math.max(watch, (legacy?.minds[terms.author].lastPhysicalWatch ?? -1) + 1)
    || terms.dueWatch > watch + 16) return 'invalid_publication_deadline';
  if ((proposingActor === undefined || terms.payer === proposingActor)
    && !canSpendCells(world.bodies[terms.payer].cells, terms.cells,
    oldPromises(legacy,terms.payer) + recordPromisedCells(state,terms.payer))) return 'insufficient_cells';
  if ((proposingActor === undefined || terms.author === proposingActor)
    && (oldCommitment(legacy,terms.author) || state.agreements.some(a => a.terms.author === terms.author
    && a.status === 'active'))) return 'existing_publication_commitment';
  const pending = state.intents.find(i => i.author === terms.author);
  if ((proposingActor === undefined || terms.author === proposingActor) && pending
    && (pending.draftId !== draft.id || pending.contentHash !== draft.contentHash
    || pending.audience !== terms.audience)) return 'publication_already_scheduled';
  return null;
}

function operate(state: RecordsState, world: WorldState, ctx: RecordTurnContext, op: RecordOperation,
  legacy?: RecordLegacyContext): string | null {
  const watch = watchNumber(world);
  if (op.kind === 'draft') {
    if (new TextEncoder().encode(op.title + op.text).length > L.contentBytes) return 'record_content_too_large';
    if (new Set(op.refs).size !== op.refs.length) return 'duplicate_record_reference';
    const refs = op.refs.map(id => ctx.preparedRefs.find(ref => ref.id === id));
    if (refs.some(ref => !ref || !referenceAllows(ref,ctx.actor))) return 'unknown_record_reference';
    const parent = op.parent ? boundDraft(state,op.parent) : null;
    if (op.parent && (!parent || parent.author !== ctx.actor)) return 'invalid_record_parent';
    if (!targetAllowed(ctx,op.audience)) return 'ineligible_recipient';
    const data = { author: ctx.actor, title: op.title, text: op.text, refs: structuredClone(refs as RecordReference[]), parent: op.parent };
    const draft: AuthoredDraft = { ...data, id: nextId(state,'draft'), audience: op.audience,
      contentHash: recordContentHash(data), createdAtMs: ctx.nowMs, createdAtWatch: watch };
    if (!sharingAllowed(draft,op.audience)) return 'private_reference';
    if (op.publish && op.audience === 'private') return 'publication_requires_audience';
    if (!roomFor(state,'drafts',[...op.refs,...(op.parent ? [op.parent.draftId] : [])])) return 'record_capacity';
    state.drafts.push(draft);
    if (op.publish) return schedule(state,draft,op.audience as RecordAudience,watch,legacy);
    return null;
  }
  if (op.kind === 'cancel_publication') {
    const intent = state.intents.find(i => i.id === op.intentId && i.author === ctx.actor);
    if (!intent) return 'unknown_publication_intent';
    if (state.agreements.some(a => a.terms.draftId === intent.draftId && a.status === 'active')) return 'committed_publication';
    state.intents = state.intents.filter(i => i.id !== intent.id); return null;
  }
  if (op.kind === 'accept' || op.kind === 'reject') {
    const offer = state.offers.find(o => o.id === op.offerId);
    if (!offer || offer.counterpart !== ctx.actor || offer.status !== 'open') return 'unavailable_record_offer';
    if (op.kind === 'reject') { offer.status = 'rejected'; return null; }
    const problem = commissionProblem(state,world,offer.terms,legacy); if (problem) return problem;
    if (!agreementRoom(state)) return 'record_agreement_capacity';
    const terms = structuredClone(offer.terms), draft = boundDraft(state,terms)!;
    if (!state.intents.some(i => i.author === terms.author)) {
      const scheduled = schedule(state,draft,terms.audience,watch,legacy); if (scheduled) return scheduled;
    } else { const pending = state.intents.find(i => i.author === terms.author)!;
      pending.earliestWatch = Math.max(pending.earliestWatch,watch); }
    offer.status = 'accepted';
    state.agreements.push({ id: nextId(state,'agreement'), offerId: offer.id, terms, visibility: offer.visibility,
      status: 'active', acceptedAtMs: ctx.nowMs, acceptedAtWatch: watch, acceptedAfterId: state.nextId,
      publicationId: null, paidCells: 0, settledAtMs: null });
    return null;
  }
  if (!('draftId' in op)) return 'invalid_record_operation';
  const draft = boundDraft(state,op);
  if (!draft || !canReadRecord(state,draft,ctx.actor)) return 'unavailable_record_draft';
  if (!targetAllowed(ctx,op.audience)) return 'ineligible_recipient';
  if (op.kind === 'share' || op.kind === 'schedule') {
    if (draft.author !== ctx.actor) return 'record_not_author';
    if (!sharingAllowed(draft,op.audience)) return 'private_reference';
    if (op.kind === 'schedule') return schedule(state,draft,op.audience,watch,legacy);
    if (state.shares.some(s => s.draftId === draft.id && s.audience === op.audience)) return 'already_shared';
    // Public sharing supersedes narrower grants without withdrawing access.
    if (op.audience === 'public') state.shares = state.shares.filter(s => s.draftId !== draft.id);
    if (publicDraft(state,draft) || reads(draft.audience,draft.author,op.audience as ResidentId)) return 'already_shared';
    while (state.shares.length >= L.shares) {
      const redundant = state.shares.findIndex(s => {
        const d = boundDraft(state,s); return d && (d.audience === 'public' || d.audience === s.audience
          || state.publications.some(p => p.draftId === s.draftId && (p.audience === 'public' || p.audience === s.audience)));
      });
      if (redundant >= 0) state.shares.splice(redundant,1);
      else if (!releaseOldDraft(state,[draft.id])) return 'record_share_capacity';
    }
    state.shares.push({ id: nextId(state,'share'), draftId: draft.id, contentHash: draft.contentHash,
      author: ctx.actor, audience: op.audience, sharedAtMs: ctx.nowMs }); return null;
  }
  if (op.kind === 'commission') {
    if (op.counterpart === ctx.actor || !targetAllowed(ctx,op.counterpart)) return 'ineligible_recipient';
    const author = draft.author, payer = author === ctx.actor ? op.counterpart : ctx.actor;
    if (author !== ctx.actor && op.counterpart !== author) return 'invalid_commission_parties';
    if (!canReadRecord(state,draft,op.counterpart)) return 'draft_not_shared_with_counterpart';
    if (op.visibility === 'public' && !publicDraft(state,draft)) return 'private_commission_draft';
    const terms: RecordCommissionTerms = { draftId: draft.id, contentHash: draft.contentHash, author, payer,
      cells: op.cells, dueWatch: watch + op.dueInWatches, audience: op.audience };
    const problem = commissionProblem(state,world,terms,legacy,ctx.actor); if (problem) return problem;
    if (!offerRoom(state)) return 'record_offer_capacity';
    for (const old of state.offers) if (old.status === 'open' && old.terms.author === author && old.terms.payer === payer)
      old.status = 'replaced';
    state.offers.push({ id: nextId(state,'offer'), proposer: ctx.actor, counterpart: op.counterpart,
      terms, visibility: op.visibility, status: 'open', createdAtMs: ctx.nowMs, createdAtWatch: watch, expiresAtWatch: watch + 2 });
    return null;
  }
  return 'invalid_record_operation';
}

/** Atomic cognition operation. No publication, movement, time advance or mint. */
export function applyRecordOperation(records: RecordsState, world: WorldState, ctx: RecordTurnContext,
  raw: unknown, legacy?: RecordLegacyContext): RecordResult {
  const cursor = records.cursors[ctx.actor];
  if (!cursor || !Number.isSafeInteger(ctx.sequence) || ctx.sequence < 0 || !Number.isSafeInteger(ctx.nowMs)
    || ctx.nowMs < 0) return result(records,world,'invalid_record_turn');
  if (ctx.sequence <= cursor.lastSequence) return result(records,world,'already_applied',true);
  if (ctx.expectedRevision !== cursor.revision) return result(records,world,'record_revision_changed');
  const parsed = recordOperationSchema.safeParse(raw);
  if (!parsed.success) return result(records,world,'invalid_record_operation');
  const state = structuredClone(records), physical = structuredClone(world), first = state.nextId;
  expireInPlace(state,watchNumber(world));
  const problem = operate(state,physical,ctx,parsed.data as RecordOperation,legacy);
  if (problem) return result(records,world,problem);
  state.cursors[ctx.actor].lastSequence = ctx.sequence; state.cursors[ctx.actor].revision++; state.revision++;
  if (!validateRecordsState(state).ok) return result(records,world,'record_integrity_failed');
  const createdIds = [...state.drafts,...state.shares,...state.intents,...state.offers,...state.agreements]
    .filter(item => ordinal(item.id) >= first).map(item => item.id);
  return result(state,physical,'applied',true,createdIds);
}

/** Called inside the engine's single action slot, after its urgent-needs check. */
export function selectRecordPublication(state: RecordsState, world: WorldState, actor: ResidentId): RecordPublicationIntent | null {
  const watch = watchNumber(world), intent = state.intents.find(i => i.author === actor);
  return intent && intent.earliestWatch <= watch && state.cursors[actor].lastPublicationWatch < watch
    && boundDraft(state,intent) && !state.publications.some(p => p.draftId === intent.draftId) ? structuredClone(intent) : null;
}
function settleInPlace(state: RecordsState, world: WorldState, nowMs: number): boolean {
  let changed = expireInPlace(state,watchNumber(world));
  for (const a of state.agreements) {
    if (a.status !== 'payment_due') continue;
    if (!canSpendCells(world.bodies[a.terms.payer].cells,a.terms.cells)) continue;
    const before = economicAccounts(world), amount = Math.min(a.terms.cells,world.bodies[a.terms.payer].cells);
    world.bodies[a.terms.payer].cells -= amount; world.bodies[a.terms.author].cells += amount;
    recordEconomicChange(world,before,`record-commission:${a.id}`,a.terms.payer);
    a.paidCells = amount; a.status = 'fulfilled'; a.settledAtMs = nowMs; changed = true;
    for (const actor of [a.terms.author,a.terms.payer]) remember(world,actor,{ kind: 'record-commission',
      other: actor === a.terms.author ? a.terms.payer : a.terms.author, amount,
      outcome: `Publication ${a.publicationId} fulfilled ${a.id}; ${amount} cells transferred.` });
  }
  return changed;
}
export function settleRecordCommissions(records: RecordsState, world: WorldState, nowMs: number): RecordResult {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return result(records,world,'invalid_record_time');
  const state = structuredClone(records), physical = structuredClone(world);
  if (!settleInPlace(state,physical,nowMs)) return result(records,world,'unchanged',true);
  state.revision++;
  return result(state,physical,'settled',true);
}

/** Trusted physical confirmation, never a model operation. The caller owns the
 * action slot and commits returned records and world in the same transaction. */
export function confirmRecordPublication(records: RecordsState, world: WorldState, slot: RecordPublicationSlot,
  legacy?: RecordLegacyContext): RecordResult {
  if (slot.watch !== watchNumber(world) || !Number.isSafeInteger(slot.nowMs) || slot.nowMs < 0)
    return result(records,world,'invalid_publication_slot');
  if (records.cursors[slot.actor]?.lastPublicationWatch === slot.watch) return result(records,world,'already_published_this_watch',true);
  if ((legacy?.minds[slot.actor]?.lastPhysicalWatch ?? -1) >= slot.watch) return result(records,world,'physical_slot_already_used');
  const selected = selectRecordPublication(records,world,slot.actor);
  if (!selected || selected.id !== slot.intentId) return result(records,world,'publication_not_ready');
  const state = structuredClone(records), physical = structuredClone(world);
  if (!roomFor(state,'publications',[selected.draftId])) return result(records,world,'record_capacity');
  const draft = boundDraft(state,selected);
  if (!draft || recordContentHash(draft) !== selected.contentHash || !sharingAllowed(draft,selected.audience))
    return result(records,world,'invalid_publication_content');
  if (draft.createdAtMs > slot.nowMs || state.agreements.some(a => a.terms.draftId === draft.id
    && a.status === 'active' && a.acceptedAtMs > slot.nowMs)) return result(records,world,'publication_before_authorship_or_acceptance');
  const publication = { id: nextId(state,'publication'), draftId: draft.id, contentHash: draft.contentHash,
    author: slot.actor, audience: selected.audience, atWatch: slot.watch, publishedAtMs: slot.nowMs };
  state.publications.push(publication); state.intents = state.intents.filter(i => i.id !== selected.id);
  state.cursors[slot.actor].lastPublicationWatch = slot.watch; state.cursors[slot.actor].revision++;
  for (const a of state.agreements) if (a.status === 'active' && a.terms.draftId === draft.id
    && a.terms.contentHash === draft.contentHash && a.terms.author === slot.actor
    && a.terms.audience === publication.audience && a.acceptedAtWatch <= slot.watch && a.acceptedAtMs <= slot.nowMs
    && a.terms.dueWatch >= slot.watch && ordinal(publication.id) >= a.acceptedAfterId) {
    a.publicationId = publication.id; a.status = 'payment_due';
  }
  settleInPlace(state,physical,slot.nowMs); state.revision++;
  physical.bodies[slot.actor].doing = 'publishing an authored record';
  remember(physical,slot.actor,{ kind: 'publication', outcome: `Published ${publication.id} (${draft.contentHash}).` });
  if (!validateRecordsState(state).ok) return result(records,world,'record_integrity_failed');
  return result(state,physical,'published',true,[publication.id]);
}

export function recordContext(state: RecordsState, actor: ResidentId, focus?: RecordBinding): RecordContext {
  const offers = state.offers.filter(o => [o.proposer,o.counterpart].includes(actor));
  const agreements = state.agreements.filter(a => [a.terms.author,a.terms.payer].includes(actor));
  const visible = state.drafts.filter(d => canReadRecord(state,d,actor)), selected: AuthoredDraft[] = [];
  const add = (draft?: AuthoredDraft) => { if (draft && !selected.some(d => d.id === draft.id)) selected.push(draft); };
  // Explicit P7 focus occupies one of the same three complete-content slots.
  // Recheck existence, exact revision and current permission before selection.
  const focused = focus ? boundDraft(state, focus) : undefined;
  if (focused && canReadRecord(state, focused, actor)) add(focused);
  for (const o of offers.filter(o => o.status === 'open').slice(-2)) add(boundDraft(state,o.terms));
  add(visible.filter(d => d.author === actor).at(-1));
  add(visible.filter(d => d.author !== actor).at(-1));
  const drafts = selected.slice(0,3).map(d => {
    const parent = d.parent ? boundDraft(state,d.parent) : undefined;
    const parentVisible = parent && canReadRecord(state,parent,actor);
    return { ...structuredClone(d), refs: d.refs.map(r => r.id), parent: parentVisible ? structuredClone(d.parent) : null,
      parentOmitted: d.parent !== null && !parentVisible };
  });
  const shownOffers = offers.filter(o => o.status === 'open' && drafts.some(d => d.id === o.terms.draftId)).slice(-4);
  const shownAgreements = agreements.filter(a => ['active','payment_due'].includes(a.status));
  return { cursor: { ...state.cursors[actor] }, drafts, offers: structuredClone(shownOffers), agreements: structuredClone(shownAgreements),
    intent: structuredClone(state.intents.find(i => i.author === actor) ?? null),
    omitted: { drafts: visible.length - drafts.length,
      offers: offers.length - shownOffers.length, agreements: agreements.length - shownAgreements.length } };
}

/** Explicit DTO: no private drafts, grants, pending intents or inferred consent. */
export function publicRecordView(state: RecordsState): PublicRecordsView {
  const publications = state.publications.filter(p => p.audience === 'public').flatMap(p => {
    const d = boundDraft(state,p); if (!d) return [];
    const parent = d.parent ? state.publications.find(old => old.draftId === d.parent!.draftId && old.audience === 'public') : undefined;
    const view = publicRecordPublication(p,d,parent?.id ?? null); return view ? [view] : [];
  });
  const terms = (t: RecordCommissionTerms): RecordCommissionTerms => ({ draftId: t.draftId, contentHash: t.contentHash,
    author: t.author,payer:t.payer,cells:t.cells,dueWatch:t.dueWatch,audience:t.audience });
  return { publications, offers: state.offers.filter(o => o.visibility === 'public').map(o => ({ id:o.id,
    proposer:o.proposer,counterpart:o.counterpart,terms:terms(o.terms),visibility:o.visibility,status:o.status,
    createdAtMs:o.createdAtMs,createdAtWatch:o.createdAtWatch,expiresAtWatch:o.expiresAtWatch })),
    agreements: state.agreements.filter(a => a.visibility === 'public').map(a => ({ id:a.id,offerId:a.offerId,
      terms:terms(a.terms),visibility:a.visibility,status:a.status,acceptedAtMs:a.acceptedAtMs,
      acceptedAtWatch:a.acceptedAtWatch,acceptedAfterId:a.acceptedAfterId,publicationId:a.publicationId,
      paidCells:a.paidCells,settledAtMs:a.settledAtMs })) };
}

export { emptyRecordsState } from './record-schema';
export const RECORD_AUTHORS = RESIDENTS.map(r => r.id);
