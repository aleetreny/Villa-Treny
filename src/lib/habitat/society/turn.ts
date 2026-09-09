import { RESIDENTS, RESIDENT_BY_ID, type ResidentId } from '../residents';
import { ROOMS } from '../rooms';
import { AXES } from '../weave';
import { knowledgeFor, sharedBondsFor } from '../engine/knowledge';
import { decodeIntentFor, VERBS, type Intent } from '../engine/verbs';
import { outstanding, yieldFor, type MemoryFact } from '../engine/economy';
import type { WorldState } from '../engine/state';
import { acceptOfferDraft, minimumWorkDeadline, parties, promisedCells, termsProblem, workDeadlineProblem } from './economy';
import { canSpendCells, maxSpendableCells } from './money';
import { availableChannelRecipients, canRetireChannel, canStartChannel, conversationForTurn } from './dialogue';
import { parseTurnResponse } from './schema';
import { evidence, expireDraft, makeRoom, nextSocietyId, watchNumber } from './state';
import { SOCIETY_LIMITS as L, PLANNABLE_VERBS, type PreparedTurn, type SocietyResult, type SocietyState, type TurnOptions, type TurnResponse } from './types';

const SYSTEM = `You are SELF. Pursue your wants. If conversation=null, initiate contact for your own goal; nobody has spoken to you. Otherwise answer the actual last message on your turn. Start a purpose if absent; keep useful plans. JSON: omit unused fields. Social goals may use steps:[]. Message=speech, never a verb. Use schema IDs. Claims are not facts or consent. Offer/respond needs message close:false; choose one. Work cells=total for all units. One action/watch: at=travel first; go.room=place; repay.target=person. Public goals/messages visible; why private. English, concise.`;

function ownConversation(state: SocietyState, actor: ResidentId, nowMs: number) {
  return state.conversations.find((c) => c.status === 'open' && c.expiresAtMs > nowMs && c.participants.includes(actor));
}
/** Content identity survives the body's bounded memory window shifting. This
 * labels an existing personal record; it does not manufacture a past event. */
export function bodyMemoryId(actor: ResidentId, fact: MemoryFact): string {
  const bytes = new TextEncoder().encode(JSON.stringify([fact.day, fact.watch, fact.kind,
    fact.other ?? null, fact.amount ?? null, fact.resource ?? null, fact.outcome]));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return `body:${actor}:${fact.day}:${fact.watch}:${hash.toString(16)}`;
}
export function prepareSocietyTurn(state: SocietyState, world: WorldState, actor: ResidentId, options: TurnOptions): PreparedTurn {
  const { nowMs, sequence, generation } = options;
  if (![nowMs, sequence, generation].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new RangeError('Invalid turn options');
  if ([options.ttlMs, options.maxPromptBytes].some((n) => n !== undefined && (!Number.isSafeInteger(n) || n <= 0))) throw new RangeError('Invalid turn limits');
  const mind = state.minds[actor], r = RESIDENT_BY_ID[actor], b = world.bodies[actor];
  if (!mind || sequence <= mind.lastAppliedSequence) throw new RangeError('Turn sequence must increase');
  const concurrent = options.dialoguePolicy === 'concurrent-v1';
  const c = concurrent ? state.conversations.find(channel => channel.id === options.conversationId
    && channel.status === 'open' && channel.expiresAtMs > nowMs && channel.participants.includes(actor))
    : ownConversation(state, actor, nowMs);
  const query = `${mind.project?.goal ?? ''} ${c?.turns.at(-1)?.text ?? ''}`.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const rankedMemories = [...mind.memories].sort((a, b) => {
    const score = (e: typeof a) => e.importance + 2 * query.filter((word) => e.text.toLowerCase().includes(word)).length
      + Math.max(0, 4 - (nowMs - e.createdAtMs) / 21_600_000);
    return score(b) - score(a) || b.createdAtMs - a.createdAtMs || a.id.localeCompare(b.id);
  });
  // A repeated claim must not displace the engine receipt that could correct
  // it. Reserve existing observations inside the same four-memory allowance.
  const observable = mind.memories.filter((m) => m.kind === 'observation'
    && m.createdAtMs <= nowMs && m.atWatch <= watchNumber(world));
  const newest = (a: typeof mind.memories[number], b: typeof a) => b.atWatch - a.atWatch
    || b.createdAtMs - a.createdAtMs || b.id.localeCompare(a.id);
  const lastStepReceipt = mind.project?.steps.filter((step) => step.status !== 'pending' && step.evidenceId)
    .flatMap((step) => observable.filter((m) => m.id === step.evidenceId)).sort(newest)[0];
  const ownPhysicalReceipt = observable.filter((m) => m.refs.some((ref) =>
    /^physical:\d+:[1-4]:[A-Y]$/.test(ref) && ref.endsWith(`:${actor}`))).sort(newest)[0];
  const reserved = new Map([lastStepReceipt, ownPhysicalReceipt].flatMap((m) => m ? [[m.id, m] as const] : []));
  const memories = [...reserved.values(), ...rankedMemories.filter((m) => !reserved.has(m.id))]
    .slice(0, 4).map((m) => ({ id: m.id, kind: m.kind, text: m.text, refs: m.refs }));
  // This is recomputed after memory compaction: a duplicate that was removed
  // from the visible selection may still be the body's only surviving copy.
  const personalHistory = () => b.memory.filter((fact) => !memories.some((shown) => {
    const original = mind.memories.find((m) => m.id === shown.id);
    return shown.kind === 'observation' && original?.atWatch === watchNumber(fact) && shown.text === fact.outcome;
  }));
  let ownHistoryLimit = 3;
  const selectHistory = () => [...personalHistory()].reverse().sort((a, b) =>
    query.filter((word) => b.outcome.toLowerCase().includes(word)).length
      - query.filter((word) => a.outcome.toLowerCase().includes(word)).length)
    .slice(0, ownHistoryLimit).map((fact) => ({ id: bodyMemoryId(actor, fact), day: fact.day, watch: fact.watch,
      kind: fact.kind, ...(fact.other ? { other: fact.other } : {}), ...(fact.amount === undefined ? {} : { amount: fact.amount }),
      ...(fact.resource ? { resource: fact.resource } : {}), text: fact.outcome }));
  const ownHistory = selectHistory();
  const known = knowledgeFor(b.knownFacts).sort((a, b) => query.filter((word) => b.text.toLowerCase().includes(word)).length
    - query.filter((word) => a.text.toLowerCase().includes(word)).length).map((f) => ({ id: `fact:${f.id}`, text: f.text, private: f.private }));
  const publicId = `world:${world.day}:${world.watch}`;
  const transcript = c?.turns.slice(-6).map((t) => ({ id: t.id, speaker: t.speaker, text: t.text })) ?? [];
  const offers = state.offers.filter((o) => o.status === 'open' && o.expiresAtWatch > watchNumber(world)
    && [o.proposer, o.counterpart].includes(actor)).map((o) => ({ id: o.id, proposer: o.proposer, counterpart: o.counterpart, terms: o.terms, expiresAtWatch: o.expiresAtWatch }));
  const ownDebts = world.economy.debts.filter((d) => d.remaining > 0 && [d.borrower, d.lender].includes(actor))
    .sort((a, b) => a.dueDay - b.dueDay || a.id.localeCompare(b.id));
  const receivables = ownDebts.filter((d) => d.lender === actor)
    .map((d) => ({ id: d.id, from: d.borrower, remaining: d.remaining, dueDay: d.dueDay, status: d.status }));
  // A missed date changes a loan's status, never its outstanding balance. These
  // claims survive the bounded recollection of the original conversation.
  const agreements = state.agreements.filter((a) => parties(a.terms).includes(actor)
    && (['active', 'payment_due'].includes(a.status) || (a.terms.kind === 'loan' && a.status === 'breached'
      && ownDebts.some((d) => d.id === a.debtId))))
    .map((a) => ({ id: a.id, terms: a.terms, status: a.status, progress: a.progress }));
  const relationshipIds = [...new Set([
    ...(c?.participants ?? []),
    ...ownDebts.flatMap((d) => [d.borrower, d.lender]),
    ...(mind.project?.steps.flatMap((step) => step.intent.target ? [step.intent.target] : []) ?? []),
    ...[...b.memory].reverse().flatMap((fact) => fact.other ? [fact.other] : []),
  ])].filter((id) => id !== actor);
  const ownFeelings = relationshipIds.slice(0, 3).map((id) => ({ id,
    held: AXES.map((axis) => Math.round(world.axes.get(`${actor}${id}`)![axis])) }));
  const sharedHistory = sharedBondsFor(actor);
  const interests = `${query.join(' ')} ${r.wants} ${mind.project?.steps.map((step) => `${step.intent.verb} ${step.at ?? ''}`).join(' ') ?? ''}`.toLowerCase();
  const usefulDuties = [
    ...(/water|well|clean/.test(interests) || world.economy.stock.water < 100 ? ['well'] : []),
    ...(/cook|meal|kitchen/.test(interests) || world.economy.stock.meals < 40 ? ['kitchen'] : []),
    ...(/grow|garden|food|hydroponic/.test(interests) || world.economy.stock.produce < 30 ? ['hydroponics'] : []),
    ...(/repair|power|charge|workshop/.test(interests) || world.economy.maintenance < 60 ? ['workshops', 'power'] : []),
    ...(/health|medicine|patient|infirmary/.test(interests) || b.condition.well < 40 ? ['infirmary'] : []),
    ...(/record|write|note|consult/.test(interests) ? ['records', 'communications', 'roster'] : []),
    ...(/cell|supplies|inventory|stores/.test(interests) ? ['stores', 'allocation', 'reckoning'] : []),
  ];
  // This is a public duty directory, not knowledge of another mind. Stable
  // rotation breaks equal-relevance ties without prescribing whom to approach.
  const directory = RESIDENTS.filter((p) => p.id !== actor).sort((a, b) => {
    const score = (duty: string | null) => usefulDuties.filter((word) => duty?.toLowerCase().includes(word)).length;
    const rank = (id: ResidentId) => (id.charCodeAt(0) - actor.charCodeAt(0) - watchNumber(world) % RESIDENTS.length + RESIDENTS.length * 2) % RESIDENTS.length;
    return score(b.duty) - score(a.duty) || rank(a.id) - rank(b.id);
  });
  const contactIds = [...new Set([...(c?.participants ?? []), ...ownDebts.flatMap((d) => [d.borrower, d.lender]),
    ...sharedHistory.map((bond) => bond.other), ...directory.map((p) => p.id)])].filter((id) => id !== actor);
  const contacts = contactIds.slice(0, 4).map((id) => ({ id, name: RESIDENT_BY_ID[id].name, duty: RESIDENT_BY_ID[id].duty }));
  const importantWork = new Set([...(mind.project?.steps.filter((step) => step.status === 'pending').map((step) => step.intent.verb) ?? []),
    ...b.knownFacts.filter((fact) => fact.id.startsWith('skill:')).map((fact) => fact.id.slice(6))]);
  const context = {
    self: { id: actor, name: r.name, room: b.room, was: r.was, duty: r.duty, voice: r.voice, wants: r.wants,
      fears: r.fears, condition: b.condition,
      cells: b.cells, maxSpendableCells: maxSpendableCells(b.cells, promisedCells(state, actor)) },
    public: { id: publicId, day: world.day, watch: world.watch, watchNumber: watchNumber(world), stock: world.economy.stock,
      maintenance: world.economy.maintenance, reactor: world.reactor.output,
      people: RESIDENTS.map((p) => p.id), contacts,
      roomIds: ROOMS.filter((r) => r.id !== 'breach').map((r) => r.id) },
    ownProject: mind.project ? { goal: mind.project.goal, why: mind.project.why,
      status: mind.project.status === 'completed' ? 'steps_finished' : mind.project.status, visibility: mind.project.visibility,
      steps: mind.project.steps.map((p) => ({ id: p.id, intent: p.intent, at: p.at, status: p.status,
        ...(p.evidenceId && reserved.has(p.evidenceId) ? { evidenceId: p.evidenceId } : {}) })) } : null,
    ownKnowledge: known, sharedHistory: sharedHistory.filter((bond) => !c || c.participants.includes(bond.other)), memories, ownHistory,
    ownFeelings: { axes: AXES, towards: ownFeelings },
    conversation: c ? { id: c.id, nextSpeaker: c.nextSpeaker, turnsLeft: L.turns - c.turns.length, transcript } : null,
    openOffers: offers, commitments: agreements, receivables, refIds: [] as string[],
    affordances: { mayMessage: !c || c.nextSpeaker === actor, allowedRecipientIds: c ? c.participants.filter((p) => p !== actor)
      : concurrent ? availableChannelRecipients(state, actor, nowMs)
        : RESIDENTS.filter((p) => p.id !== actor && !ownConversation(state, p.id, nowMs)).map((p) => p.id),
    physicalVerbs: PLANNABLE_VERBS.filter((verb) => verb !== 'note' || actor === 'A'),
    verbMeaning: 'inspect=walk through the named room and record that visit, not sensor readings; observe=watch surroundings, no new measured facts; work=general labour credit; charge=2 labour credits at workshops, not immediate cells; note=A records stock totals and working-room register, not arbitrary writing. at=travel and action in one watch; go=travel-only watch.',
    agreements: 'transfer, loan, work; cells are exact, at most two decimals; work may be voluntary (0 cells)',
    workUnits: [1, 2, 3, 4],
    workExamples: ([['grow', 'garden'], ['cook', 'kitchen'], ['clean', 'well'], ['dig', 'face'], ['repair', 'workshops']] as const).map(([verb, room]) => {
      const sample = structuredClone(world); sample.bodies[actor].room = room;
      const blocked = VERBS[verb].requires?.(sample, { actor, verb }) ?? null;
      return { verb, at: room, available: !blocked, needs: ({ grow: { water: 2 }, cook: { produce: 4, water: 1 },
        clean: {}, dig: { water: 1 }, repair: { materials: 1, cells: b.cells >= 2 ? 2 : 0 } })[verb],
      produces: ({ grow: { produce: yieldFor(world, room, 16) }, cook: { meals: yieldFor(world, room, 8) },
        clean: { water: yieldFor(world, room, 24) }, dig: { materials: yieldFor(world, room, 4) }, repair: { maintenance: Math.min(100 - world.economy.maintenance, b.cells >= 2 ? 8 : 4) } })[verb] };
    }),
    repayments: outstanding(world, actor).map((d) => ({ debtId: d.id, target: d.lender, remaining: d.remaining,
      nextPayment: Math.min(2, d.remaining), affordable: b.cells >= Math.min(2, d.remaining), dueDay: d.dueDay, status: d.status })),
    loanDueDayRange: [world.day + 1, world.day + 30], workDueWatchRange: [minimumWorkDeadline(state, world, actor, 1), watchNumber(world) + 16],
    ownMinimumWorkDue: [1, 2, 3, 4].map((units) => minimumWorkDeadline(state, world, actor, units)) },
    omitted: { memories: Math.max(0, mind.memories.length - memories.length), ownHistory: Math.max(0, personalHistory().length - ownHistory.length),
      feelings: Math.max(0, relationshipIds.length - ownFeelings.length), knowledge: 0, sharedHistory: 0, contacts: contactIds.length - contacts.length,
      turns: Math.max(0, (c?.turns.length ?? 0) - transcript.length), workExamples: false, workExampleCount: 0, fears: false },
  };
  const limit = options.maxPromptBytes ?? 4200;
  const serialize = () => {
    context.refIds = [...new Set([publicId, ...context.ownKnowledge.map((f) => f.id), ...context.memories.map((m) => m.id), ...ownHistory.map((f) => f.id),
      ...transcript.map((t) => t.id), ...offers.map((o) => o.id), ...agreements.map((a) => a.id), ...ownDebts.map((d) => d.id)])];
    return `${SYSTEM}\n${JSON.stringify(context)}`;
  };
  const size = () => new TextEncoder().encode(serialize()).length;
  // Make room for people before repeating every unrelated production recipe.
  while (size() > limit && context.affordances.workExamples.length > 2) {
    const index = context.affordances.workExamples.map((example) => importantWork.has(example.verb)).lastIndexOf(false);
    if (index < 0) break;
    context.affordances.workExamples.splice(index, 1);
    context.omitted.workExamples = true; context.omitted.workExampleCount += 1;
  }
  if (size() > limit && contacts.length > 3) { contacts.pop(); context.omitted.contacts += 1; }
  // Remove entire evidence entries rather than truncate a fact into a different
  // claim. All active offers, commitments, own plans and the latest turn stay.
  while (size() > limit && context.sharedHistory.length) { context.sharedHistory.pop(); context.omitted.sharedHistory += 1; }
  while (size() > limit && transcript.length > 1) { transcript.shift(); context.omitted.turns += 1; }
  while (size() > limit && context.memories.length > Math.max(1, reserved.size)) {
    const index = context.memories.map((m) => reserved.has(m.id)).lastIndexOf(false);
    if (index < 0) break;
    context.memories.splice(index, 1); context.omitted.memories += 1;
    ownHistory.splice(0, ownHistory.length, ...selectHistory());
    context.omitted.ownHistory = Math.max(0, personalHistory().length - ownHistory.length);
  }
  while (size() > limit && ownHistory.length > 1) {
    ownHistoryLimit -= 1;
    ownHistory.splice(0, ownHistory.length, ...selectHistory());
    context.omitted.ownHistory = Math.max(0, personalHistory().length - ownHistory.length);
  }
  while (size() > limit && ownFeelings.length > 1) { ownFeelings.pop(); context.omitted.feelings += 1; }
  while (size() > limit && context.ownKnowledge.length > 1) { context.ownKnowledge.pop(); context.omitted.knowledge += 1; }
  if (size() > limit) {
    context.omitted.workExampleCount += context.affordances.workExamples.length;
    context.affordances.workExamples = []; context.omitted.workExamples = true;
  }
  // Voice and immediate wants are more useful under a tight budget than fears.
  if (size() > limit) { context.self.fears = ''; context.omitted.fears = true; }
  const evidenceIds = [...new Set([publicId, ...context.ownKnowledge.map((f) => f.id), ...context.memories.map((m) => m.id), ...ownHistory.map((f) => f.id),
    ...transcript.map((t) => t.id), ...offers.map((o) => o.id), ...agreements.map((a) => a.id), ...ownDebts.map((d) => d.id)])];
  const prompt = serialize(), promptBytes = new TextEncoder().encode(prompt).length;
  return { id: `${actor}:${mind.revision}:${sequence}`, actor, mindRevision: mind.revision, sequence, generation,
    preparedAtMs: nowMs, expiresAtMs: nowMs + Math.min(Math.max(options.ttlMs ?? 300_000, 1), 900_000),
    conversation: c ? { id: c.id, revision: c.revision, turn: c.turns.length } : null,
    evidenceIds, prompt, promptBytes, contextOverflow: promptBytes > limit,
    ...(concurrent ? { dialoguePolicy: 'concurrent-v1' as const } : {}) };
}

function validateSteps(world: WorldState, actor: ResidentId, response: TurnResponse): { ok: true; intents: Intent[] } | { ok: false; code: string } {
  const intents: Intent[] = [];
  if (response.project?.mode !== 'replace') return { ok: true, intents };
  for (const proposed of response.project.steps) {
    const { at, ...raw } = proposed;
    const result = decodeIntentFor(actor, raw);
    if (!result.ok || !(PLANNABLE_VERBS as readonly string[]).includes(raw.verb) || at === 'breach' || raw.room === 'breach') return { ok: false, code: 'invalid_plan_step' };
    if (at && raw.verb === 'go') return { ok: false, code: 'ambiguous_step_destination' };
    if (raw.fact && !world.bodies[actor].knownFacts.some((f) => f.id === raw.fact)) return { ok: false, code: 'unknown_private_fact' };
    if (raw.target === actor) return { ok: false, code: 'self_target' };
    intents.push(result.intent);
  }
  return { ok: true, intents };
}

export function applySocietyTurn(state: SocietyState, world: WorldState, job: PreparedTurn, raw: unknown,
  control: { nowMs: number; generation: number }): SocietyResult {
  return applyTurn(state, world, job, raw, control, false);
}

/** Internal P6 transaction entrypoint. The records adapter must first validate
 * a nonempty operation and discard this private draft if its application fails.
 * Older protocols and parseTurnResponse still reject an empty response. */
export function commitRecordOnlyTurn(state: SocietyState, world: WorldState, job: PreparedTurn,
  control: { nowMs: number; generation: number }): SocietyResult {
  return applyTurn(state, world, job, {}, control, true);
}

function applyTurn(state: SocietyState, world: WorldState, job: PreparedTurn, raw: unknown,
  control: { nowMs: number; generation: number }, recordOnly: boolean): SocietyResult {
  const fail = (code: string): SocietyResult => ({ ok: false, code, state, world });
  if (!Number.isSafeInteger(control.nowMs) || control.nowMs < job.preparedAtMs || control.generation !== job.generation) return fail('stale_control');
  const m = state.minds[job.actor];
  if (!m || !Number.isSafeInteger(job.sequence) || job.sequence < 0) return fail('invalid_job');
  if (job.sequence <= m.lastAppliedSequence) return { ok: true, code: 'already_applied', state, world };
  if (control.nowMs >= job.expiresAtMs) return fail('expired_job');
  if (m.revision !== job.mindRevision) return fail('stale_mind');
  const active = conversationForTurn(state, job.actor, control.nowMs, job);
  if (job.conversation ? !active || active.id !== job.conversation.id || active.revision !== job.conversation.revision
    || active.turns.length !== job.conversation.turn : active !== undefined) return fail('stale_conversation');
  const decoded = recordOnly ? { ok: true as const, value: {} as TurnResponse } : parseTurnResponse(raw);
  if (!decoded.ok) return fail(decoded.code);
  const response = decoded.value;
  if (response.project?.mode === 'abandon' && !m.project) return fail('no_project_to_abandon');
  if (response.reflection?.refs.some((ref) => !job.evidenceIds.includes(ref))) return fail('unknown_evidence');
  const steps = validateSteps(world, job.actor, response);
  if (!steps.ok) return fail(steps.code);
  const message = response.message;
  if (message && (message.to === job.actor || (active && (active.nextSpeaker !== job.actor || !active.participants.includes(message.to)))
    || (!active && (job.dialoguePolicy === 'concurrent-v1'
      ? !canStartChannel(state, job.actor, message.to, control.nowMs)
      : ownConversation(state, message.to, control.nowMs))))) return fail('unavailable_dialogue_turn');
  if (response.offer) {
    const members = parties(response.offer.terms);
    if (!message || members[0] === members[1] || !members.includes(job.actor) || !members.includes(message.to)) return fail('invalid_offer_parties');
    // Monetary feasibility is checked fully at acceptance. A proposal cannot
    // query a counterpart's private available balance as a consent oracle.
    const terms = response.offer.terms;
    const paying = terms.kind === 'work' ? terms.payer : terms.from;
    if (paying === job.actor && !canSpendCells(world.bodies[job.actor].cells, terms.cells, promisedCells(state, job.actor))) return fail('insufficient_cells');
    if (terms.kind !== 'work' && terms.cells <= 0) return fail('invalid_amount');
    if (terms.kind === 'loan' && (terms.dueDay <= world.day || terms.dueDay > world.day + 30)) return fail('invalid_loan_due_day');
    if (terms.kind === 'work') {
      const deadline = workDeadlineProblem(state, world, terms);
      if (deadline) return fail(deadline);
    }
    if (response.offer.replaces) {
      const old = state.offers.find((o) => o.id === response.offer!.replaces);
      if (!old || old.status !== 'open' || old.counterpart !== job.actor || old.proposer !== message.to
        || old.conversationId !== active?.id || old.expiresAtWatch <= watchNumber(world)) return fail('invalid_counteroffer');
    }
    if (active && active.turns.length >= L.turns - 1) return fail('conversation_turn_limit');
  }
  if (response.respond) {
    const offer = state.offers.find((o) => o.id === response.respond!.offerId);
    if (!offer || offer.status !== 'open' || offer.counterpart !== job.actor || offer.proposer !== message?.to
      || offer.conversationId !== active?.id || offer.expiresAtWatch <= watchNumber(world)) return fail('offer_not_acceptible');
    if (response.respond.decision === 'accept') {
      const problem = termsProblem(state, world, offer.terms);
      if (problem) return fail(problem);
    }
  }
  const next = structuredClone(state), physical = structuredClone(world), nowMs = control.nowMs;
  expireDraft(next, physical, nowMs);
  const mind = next.minds[job.actor];
  if (response.project) {
    if (mind.project && mind.project.status === 'active') {
      evidence(next, job.actor, physical, nowMs, 'interpretation',
        `Previous project: ${mind.project.goal}. ${response.project.mode === 'replace' ? 'Revised' : 'Abandoned'}: ${response.project.why}`,
        [mind.project.id], job.actor, 4);
    }
    if (response.project.mode === 'abandon') { if (mind.project) mind.project.status = 'abandoned'; }
    else mind.project = { id: nextSocietyId(next, 'project'), goal: response.project.goal, why: response.project.why,
      visibility: response.project.visibility, status: 'active', createdAtMs: nowMs,
      steps: response.project.steps.map((step, i) => ({ id: nextSocietyId(next, 'step'), intent: steps.intents[i]!,
        at: step.at ?? null, status: 'pending', evidenceId: null })) };
  }
  if (response.reflection) evidence(next, job.actor, physical, nowMs, 'interpretation', response.reflection.text, response.reflection.refs, job.actor, 4);
  if (message) {
    let conversation = active ? next.conversations.find((c) => c.id === active.id) : undefined;
    if (!conversation) {
      if (!makeRoom(next.conversations, L.conversations, job.dialoguePolicy === 'concurrent-v1'
        ? canRetireChannel : (c) => c.status !== 'open')) return fail('conversation_capacity');
      conversation = { id: nextSocietyId(next, 'conversation'), participants: [job.actor, message.to], revision: 0, attentionThrough: [0, 0],
        nextSpeaker: job.actor, status: 'open', createdAtMs: nowMs, expiresAtMs: nowMs + 86_400_000, turns: [] };
      next.conversations.push(conversation);
    }
    const turn = { id: nextSocietyId(next, 'turn'), index: conversation.turns.length, speaker: job.actor, text: message.text, atMs: nowMs };
    conversation.turns.push(turn); conversation.revision += 1; conversation.nextSpeaker = message.to;
    for (const actor of conversation.participants) evidence(next, actor, physical, nowMs, 'claim',
      `${job.actor}: ${message.text}`, [turn.id], job.actor, 3);
    if (response.offer) {
      if (!makeRoom(next.offers, L.offers, (o) => o.status !== 'open')) return fail('offer_capacity');
      if (response.offer.replaces) next.offers.find((o) => o.id === response.offer!.replaces)!.status = 'replaced';
      // One live set of terms per conversation. Fresh incompatible terms never
      // silently preserve acceptance rights to the previous offer.
      for (const old of next.offers) if (old.conversationId === conversation.id && old.status === 'open') old.status = 'replaced';
      next.offers.push({ id: nextSocietyId(next, 'offer'), conversationId: conversation.id, proposer: job.actor,
        counterpart: message.to, terms: response.offer.terms, status: 'open', replaces: response.offer.replaces ?? null,
        createdAtMs: nowMs, expiresAtWatch: watchNumber(world) + response.offer.expiresInWatches, acceptedAtMs: null });
    }
    if (response.respond) {
      const offer = next.offers.find((o) => o.id === response.respond!.offerId)!;
      if (response.respond.decision === 'reject') {
        offer.status = 'rejected';
        for (const actor of conversation.participants) evidence(next, actor, physical, nowMs, 'observation',
          `${job.actor} declined ${offer.id}; no resource transfer took place.`, [turn.id, offer.id], job.actor, 4);
      } else {
        const problem = acceptOfferDraft(next, physical, offer, nowMs);
        if (problem) return fail(problem);
      }
    }
    if (message.close || conversation.turns.length >= L.turns) {
      conversation.status = 'closed'; conversation.nextSpeaker = null;
      for (const o of next.offers) if (o.conversationId === conversation.id && o.status === 'open') o.status = 'expired';
    }
  }
  mind.lastAppliedSequence = job.sequence; mind.lastSuccessAtMs = nowMs;
  mind.lastAttemptAtMs = Math.max(mind.lastAttemptAtMs ?? 0, job.preparedAtMs);
  mind.revision += 1; next.revision += 1;
  return { ok: true, code: 'applied', state: next, world: physical };
}
