import { createHash } from 'node:crypto';
import { RESIDENTS, RESIDENT_BY_ID, type ResidentId } from '../../../src/lib/habitat/residents';
import { prepareSocietyTurn, type SocietyState, type PreparedTurn } from '../../../src/lib/habitat/society/index';
import { capabilityChoiceJsonSchema, proposalCapabilityChoiceJsonSchema, toCapabilityAction } from '../../../src/lib/habitat/society/capabilities';
import { orderedChoiceJsonSchemaFromProposal } from '../../../src/lib/habitat/society/ordered-choice';
import { prepareRecordTurn, recordCapabilityChoiceJsonSchema } from '../../../src/lib/habitat/society/record-choice';
import { prepareRetrievalTurn, retrievalCapabilityChoiceJsonSchema } from '../../../src/lib/habitat/society/retrieval-choice';
import { SOCIETY_RETRIEVAL_SYSTEM } from '../../../src/lib/habitat/society/retrieval-instructions';
import { attentionCapabilityChoiceJsonSchema, prepareAttentionTurn } from '../../../src/lib/habitat/society/attention-choice';
import { SOCIETY_ATTENTION_SYSTEM } from '../../../src/lib/habitat/society/attention-instructions';
import { channelNeedsReview } from '../../../src/lib/habitat/society/dialogue';
import { SOCIETY_SYSTEM, SOCIETY_PROPOSAL_SYSTEM, SOCIETY_ORDERED_SYSTEM } from '../../../src/lib/habitat/society/instructions';
import { SOCIETY_RECORD_SYSTEM } from '../../../src/lib/habitat/society/record-instructions';
import type { WorldState } from '../../../src/lib/habitat/engine/state';
import { cognitionJobSchema, type CognitionJob, type JsonValue } from './contracts';

export const COGNITION_CADENCE_MS = 3 * 60_000;
export const COGNITION_REVIEW_MS = 6 * 60 * 60_000;
export const COGNITION_FAILURE_BACKOFF_MS = 30 * 60_000;
// One provider request (45 s) plus the existing 10 s result/commit margin.
// A stored result needs no new request; this only gates pending/deferred work.
export const COGNITION_REQUEST_WINDOW_MS = 55_000;
export function hasSocietyRequestWindow(expiresAtMs: number, startAtMs: number): boolean {
  return Number.isFinite(expiresAtMs) && Number.isFinite(startAtMs)
    && expiresAtMs - startAtMs >= COGNITION_REQUEST_WINDOW_MS;
}

/** The grammar already carries these exact IDs/ranges. Do not charge the
 * provider twice for them; preserve all narrative evidence and its references. */
function withoutGrammarDuplicates(turn: PreparedTurn, schema: Record<string, unknown>, protocolVersion: 3 | 4 | 5 | 6 | 7 | 8): PreparedTurn {
  const split = turn.prompt.lastIndexOf('\n{');
  if (split < 0) throw new RangeError('Missing resident context');
  const context = JSON.parse(turn.prompt.slice(split + 1)) as {
    public: Record<string, unknown>; affordances: Record<string, unknown>; omitted: Record<string, unknown>; refIds?: unknown;
  };
  delete context.public.roomIds;
  const people = (schema.$defs as { person?: { enum: string[] } }).person?.enum
    ?? [turn.actor, ...((schema.properties as { message?: { properties: { to: { enum: string[] } } } }).message?.properties.to.enum ?? [])];
  if (Array.isArray(context.public.people) && people && context.public.people.every((id) => people.includes(id))) delete context.public.people;
  for (const key of ['allowedRecipientIds', 'mayMessage', 'physicalVerbs', 'workUnits', 'loanDueDayRange', 'workDueWatchRange', 'ownMinimumWorkDue', 'verbMeaning', 'agreements']) delete context.affordances[key];
  // Fixed verb meanings live in the stable SYSTEM message. Compact this
  // variable recipe table without removing quantities, prerequisites or effects.
  if (Array.isArray(context.affordances.workExamples)) {
    context.affordances.workExamples = { columns: ['verb', 'at', 'available', 'needs', 'produces'],
      rows: context.affordances.workExamples.map((entry: Record<string, unknown>) => {
        const action = toCapabilityAction(entry as { verb: string; at: string });
        return [action?.verb ?? entry.verb, entry.at, entry.available, entry.needs, entry.produces];
      }) };
  }
  // Empty sections add no evidence. Keep ownProject/conversation explicit so
  // first contact cannot be mistaken for an already-running conversation.
  const fields = context as Record<string, unknown>;
  if (protocolVersion === 8) {
    delete fields.conversation;
    // The exact contact IDs/names are already in the directory and grammar.
    delete (fields.attentionCapacity as Record<string, unknown>).availableContacts;
  }
  // Preserve Pilar's canonical voice and historical jobs. Protocol-4 and later
  // guidance renders her regional examples in English; received speech stays exact.
  if (protocolVersion >= 4 && turn.actor === 'P') {
    const self = fields.self as { voice: string };
    self.voice = self.voice.replace('a great deal of anda and hijo',
      'familiar encouragement and affectionate address, rendered in English');
  }
  // Show a stored action using the same vocabulary as the new choices, while
  // leaving persisted plans, agreements and historic evidence untouched.
  const ownProject = fields.ownProject as { steps?: Array<{ intent: Record<string, unknown> & { verb?: string; room?: string }; at: string | null; legacyReason?: string }> } | null;
  for (const step of ownProject?.steps ?? []) {
    const verb = step.intent.verb;
    if (!verb) continue;
    const action = toCapabilityAction({ ...step.intent, verb, ...(step.at ? { at: step.at } : {}) });
    if (action) step.intent.verb = action.verb;
    else {
      // A saved step without an explicit destination uses its eventual room,
      // which an urgent interruption can change. Do not guess a water yield or
      // present an old engine name as a currently offered capability.
      const { verb: legacyVerb, ...intent } = step.intent;
      step.intent = { ...intent, legacyVerb };
      step.legacyReason = verb === 'clean' ? 'Its effect depends on the room when this saved step executes.'
        : 'This saved engine action is not offered as a new capability.';
    }
  }
  for (const key of ['openOffers', 'commitments']) {
    for (const item of (fields[key] ?? []) as Array<{ terms?: { kind: string; verb?: string; room?: string } }>) {
      if (item.terms?.kind === 'work' && item.terms.verb) {
        const action = toCapabilityAction({ verb: item.terms.verb, ...(item.terms.room ? { room: item.terms.room } : {}) });
        if (action) item.terms.verb = action.verb;
      }
    }
  }
  for (const key of ['ownKnowledge', 'sharedHistory', 'memories', 'ownHistory', 'openOffers', 'commitments', 'receivables']) {
    if (Array.isArray(fields[key]) && (fields[key] as unknown[]).length === 0) delete fields[key];
  }
  const feelings = fields.ownFeelings as { towards?: unknown[] } | undefined;
  if (feelings?.towards?.length === 0) delete fields.ownFeelings;
  if (Array.isArray(context.affordances.repayments) && context.affordances.repayments.length === 0) delete context.affordances.repayments;
  if (context.omitted.workExampleCount) {
    context.omitted.workRecipes = context.omitted.workExampleCount;
    delete context.omitted.workExampleCount;
    delete context.omitted.workExamples;
  }
  delete context.refIds;
  context.omitted = Object.fromEntries(Object.entries(context.omitted).filter(([, value]) => value !== 0 && value !== false));
  // The provider receives the full instructions once, in the system role.
  // PreparedTurn keeps the same context/evidence binding for durable replay.
  const actor = RESIDENT_BY_ID[turn.actor];
  const recipients = (schema.properties as { message?: { properties: { to: { enum: ResidentId[] } } } }).message?.properties.to.enum ?? [];
  const directory = recipients.map((id) => `${id}=${RESIDENT_BY_ID[id].name}`).join('; ');
  const prompt = `You are ${actor.name} (${actor.id}). Speak and choose in the first person as ${actor.name}.\nAvailable ${protocolVersion === 8 ? 'new contacts' : 'recipients'}: ${directory || 'none'}\nCurrent information:\n${JSON.stringify(context)}`;
  const promptBytes = new TextEncoder().encode(prompt).length;
  // Essential ongoing plans/agreements may exceed the compact 4200 target.
  // Keep them for Workers AI; Groq's actual quota guard can reject a large job.
  return { ...turn, prompt, promptBytes, contextOverflow: promptBytes > 6500 };
}

/** Alternate scarce slots between overdue individual reviews and replies. An
 * unanswered voice cannot monopolize the queue; successful recent talk counts
 * as that individual's review. Selection reads no other mind's private prose. */
export function nextSocietyActor(state: SocietyState, nowMs: number, sequence: number,
  occupied: ReadonlySet<ResidentId> = new Set()): ResidentId | undefined {
  const eligible = RESIDENTS.map(({ id }) => id).filter((id) => {
    const m = state.minds[id];
    return !occupied.has(id) && (m.lastAttemptAtMs === null || m.lastAttemptAtMs <= (m.lastSuccessAtMs ?? -1)
      || nowMs - m.lastAttemptAtMs >= COGNITION_FAILURE_BACKOFF_MS);
  });
  const unseen = eligible.filter((id) => state.minds[id].lastSuccessAtMs === null)
    .sort((a, b) => (state.minds[a].lastAttemptAtMs ?? -1) - (state.minds[b].lastAttemptAtMs ?? -1) || a.localeCompare(b));
  if (unseen.length) return unseen[0];
  const waitingSince = new Map<ResidentId, number>();
  for (const c of state.conversations) {
    if (c.status !== 'open' || c.expiresAtMs <= nowMs || !c.nextSpeaker
      || !eligible.includes(c.nextSpeaker) || !channelNeedsReview(c, c.nextSpeaker)) continue;
    waitingSince.set(c.nextSpeaker, Math.min(waitingSince.get(c.nextSpeaker) ?? Infinity,
      c.turns.at(-1)?.atMs ?? c.createdAtMs));
  }
  // Fairness belongs to people, not the number of channels they accumulate.
  const waiting = [...waitingSince.keys()].sort((a, b) =>
    (state.minds[a].lastSuccessAtMs ?? -1) - (state.minds[b].lastSuccessAtMs ?? -1)
    || waitingSince.get(a)! - waitingSince.get(b)! || a.localeCompare(b));
  const overdue = eligible.filter((id) => state.minds[id].lastSuccessAtMs === null
    || nowMs - state.minds[id].lastSuccessAtMs! >= COGNITION_REVIEW_MS
    || state.retrieval[id].pending
    || state.conversations.some(c => c.status !== 'open' && channelNeedsReview(c, id))
    || state.minds[id].memories.some((m) => m.kind === 'observation' && m.createdAtMs > state.minds[id].lastSuccessAtMs!))
    .sort((a, b) => (state.minds[a].lastSuccessAtMs ?? -1) - (state.minds[b].lastSuccessAtMs ?? -1)
      || (state.minds[a].lastAttemptAtMs ?? -1) - (state.minds[b].lastAttemptAtMs ?? -1) || a.localeCompare(b));
  return sequence % 2 === 0 ? overdue[0] ?? waiting[0] : waiting[0] ?? overdue[0];
}

/** A future quota estimate must be reconsidered when known new work can
 * become eligible. This does not grant admission or move any provider clock. */
export function nextSocietyReconsiderationAt(state: SocietyState, nowMs: number, nextPhysicalAtMs: number | null): number | undefined {
  const dates: number[] = [];
  if (nextPhysicalAtMs !== null && nextPhysicalAtMs > nowMs) dates.push(nextPhysicalAtMs);
  // Expiry creates real observations for both participants and can remove
  // ongoing-context requirements, so admission must be reconsidered then.
  for (const conversation of state.conversations) {
    if (conversation.status === 'open' && conversation.expiresAtMs > nowMs) dates.push(conversation.expiresAtMs);
  }
  for (const mind of Object.values(state.minds)) {
    if (mind.lastSuccessAtMs !== null && mind.lastSuccessAtMs + COGNITION_REVIEW_MS > nowMs) {
      dates.push(mind.lastSuccessAtMs + COGNITION_REVIEW_MS);
    }
    if (mind.lastAttemptAtMs !== null && mind.lastAttemptAtMs > (mind.lastSuccessAtMs ?? -1)
      && mind.lastAttemptAtMs + COGNITION_FAILURE_BACKOFF_MS > nowMs) {
      dates.push(mind.lastAttemptAtMs + COGNITION_FAILURE_BACKOFF_MS);
    }
  }
  return dates.length ? Math.min(...dates) : undefined;
}

export function prepareSocietyJob(input: { state: SocietyState; world: WorldState; actor: ResidentId;
  nowMs: number; sequence: number; generation: number; worldRevision: number; habitatId: string;
  /** Saved versions keep their original interpretation. New autonomous jobs
   * use the object contract with explicit record and private retrieval capabilities. */
  protocolVersion?: 3 | 4 | 5 | 6 | 7 | 8;
  routingPolicy?: CognitionJob['routingPolicy'];
}): { turn: PreparedTurn; job: CognitionJob } {
  const protocolVersion = input.protocolVersion ?? 8;
  const initialTurn = prepareSocietyTurn(input.state, input.world, input.actor, {
    nowMs: input.nowMs, sequence: input.sequence, generation: input.generation, ttlMs: 900_000, maxPromptBytes: 6500,
    ...(protocolVersion === 8 ? { dialoguePolicy: 'concurrent-v1' as const, conversationId: null } : {}),
  });
  const rawTurn = protocolVersion === 8 ? prepareAttentionTurn(input.state, input.world, initialTurn)
    : protocolVersion === 7 ? prepareRetrievalTurn(input.state, input.world, initialTurn)
    : protocolVersion === 6 ? prepareRecordTurn(input.state, input.world, initialTurn) : initialTurn;
  const proposalSchema = (protocolVersion === 3 ? capabilityChoiceJsonSchema : proposalCapabilityChoiceJsonSchema)(input.state, input.world, rawTurn);
  const schema = (protocolVersion === 8 ? attentionCapabilityChoiceJsonSchema(input.state, input.world, rawTurn)
    : protocolVersion === 7 ? retrievalCapabilityChoiceJsonSchema(input.state, input.world, rawTurn)
    : protocolVersion === 6 ? recordCapabilityChoiceJsonSchema(input.state, input.world, rawTurn)
    : protocolVersion === 5 ? orderedChoiceJsonSchemaFromProposal(proposalSchema) : proposalSchema) as JsonValue;
  // The same recipient/evidence directory underlies either external format.
  const turn = withoutGrammarDuplicates(rawTurn, proposalSchema, protocolVersion);
  const job = cognitionJobSchema.parse({
    schemaVersion: 1, jobId: `${input.habitatId}:mind:${turn.id}:g:${input.generation}`,
    habitatId: input.habitatId, origin: { kind: 'alarm', runId: `society:${input.sequence}` },
    cause: { worldRevision: input.worldRevision, simTime: { day: input.world.day, minute: (input.world.watch - 1) * 360 } },
    kind: 'society_turn', subjects: [{ kind: 'resident', id: input.actor }],
    pressure: input.world.bodies[input.actor].pressure / 100, createdAtMs: input.nowMs,
    ...(input.routingPolicy ? { routingPolicy: input.routingPolicy } : {}),
    prompt: { system: protocolVersion === 8 ? SOCIETY_ATTENTION_SYSTEM : protocolVersion === 7 ? SOCIETY_RETRIEVAL_SYSTEM : protocolVersion === 6 ? SOCIETY_RECORD_SYSTEM : protocolVersion === 3 ? SOCIETY_SYSTEM
      : protocolVersion === 4 ? SOCIETY_PROPOSAL_SYSTEM : SOCIETY_ORDERED_SYSTEM, user: turn.prompt },
    outputContract: { name: 'society_turn', version: protocolVersion,
      schemaHash: `sha256:${createHash('sha256').update(JSON.stringify(schema)).digest('hex')}`, jsonSchema: schema },
    maxOutputTokens: 1024,
  });
  return { turn, job };
}
