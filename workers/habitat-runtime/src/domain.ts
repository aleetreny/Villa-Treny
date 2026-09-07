import { createHash } from 'node:crypto';
import { packPromptContext } from './prompt-budget';
import { z } from 'zod';
import { ROOM_BY_ID, ROOMS, type RoomId } from '../../../src/lib/habitat/rooms';
import {
  RESIDENT_BY_ID,
  RESIDENTS,
  type ResidentId,
} from '../../../src/lib/habitat/residents';
import {
  CONDITIONS,
  genesisState,
  placeInRoom,
  POSTED,
  SLEEPS,
  snapshotFrom,
  type Happening,
  type WorldState,
} from '../../../src/lib/habitat/engine/state';
import { createEconomy, CAPACITY, RESOURCES } from '../../../src/lib/habitat/engine/economy';
import { initialKnowledge, isKnownFactId, MAX_KNOWN_FACTS, knowledgeFor, sharedBondsFor } from '../../../src/lib/habitat/engine/knowledge';
import { advanceScheduledWatch } from '../../../src/lib/habitat/engine/tick';
import {
  decodeIntentFor,
  canPropose,
  VERB_NAMES,
  VERBS,
  type Intent,
} from '../../../src/lib/habitat/engine/verbs';
import { AXES, LATENT, edges } from '../../../src/lib/habitat/weave';
import { isWalkable } from '../../../src/lib/habitat/grid';
import type { HabitatSnapshot } from '../../../src/lib/habitat/snapshot';
import {
  HABITAT_SCHEMA_VERSION,
  type CognitionJob,
  type JsonValue,
} from './contracts';

export const WORLD_CODEC_VERSION = 4 as const;

/** Historical names remain in the immutable archive. This is a projection into
 * the present room catalogue, never a rewrite of their original record. */
export const LEGACY_ROOMS = {
  cabins: 'longwalk', berths: 'infirmary', spine: 'workshops',
  greatwall: 'administration', hydroponics: 'garden', diggings: 'row', hollow: 'face',
} as const satisfies Record<string, RoomId>;

export function presentRoom(id: string): RoomId {
  if (Object.hasOwn(ROOM_BY_ID, id)) return id as RoomId;
  if (Object.hasOwn(LEGACY_ROOMS, id)) return LEGACY_ROOMS[id as keyof typeof LEGACY_ROOMS];
  throw new RangeError(`Unknown historical room: ${id}`);
}

export function projectHappening<T extends { room: string }>(entry: T): T & { room: RoomId; sourceRoom?: string } {
  const room = presentRoom(entry.room);
  return { ...entry, room, ...(room !== entry.room ? { sourceRoom: entry.room } : {}) };
}

const RESIDENT_IDS = RESIDENTS.map((resident) => resident.id) as [
  ResidentId,
  ...ResidentId[],
];
const ROOM_IDS = ROOMS.map((room) => room.id) as [RoomId, ...RoomId[]];
const residentIdSchema = z.enum(RESIDENT_IDS);
const roomIdSchema = z.enum(ROOM_IDS);

const pointSchema = z.strictObject({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});

const conditionSchema = z.strictObject(Object.fromEntries(
  CONDITIONS.map((condition) => [condition, z.number().min(0).max(100)]),
) as Record<(typeof CONDITIONS)[number], z.ZodNumber>);

const axisSchema = z.strictObject(Object.fromEntries(
  AXES.map((axis) => [axis, z.number().min(0).max(100)]),
) as Record<(typeof AXES)[number], z.ZodNumber>);

const bodySchema = z.strictObject({
  id: residentIdSchema,
  room: roomIdSchema,
  at: pointSchema,
  condition: conditionSchema,
  cells: z.number().nonnegative().max(1_000_000),
  pressure: z.number().min(0).max(100),
  thoughtOn: z.number().int().nonnegative(),
  lastThoughtWatch: z.number().int().nonnegative(),
  lastAttemptWatch: z.number().int().nonnegative().optional(),
  lastInteractionWatch: z.number().int().nonnegative().optional(),
  knownFacts: z.array(z.strictObject({ id: z.string().refine(isKnownFactId), learnedDay: z.number().int().nonnegative().nullable(), source: residentIdSchema })).max(MAX_KNOWN_FACTS).optional(),
  plan: z.strictObject({ room: roomIdSchema, untilWatch: z.number().int().nonnegative(), reason: z.string().min(1).max(200) }).nullable().optional(),
  memory: z.array(z.strictObject({
    day: z.number().int().nonnegative(), watch: z.number().int().min(1).max(4),
    kind: z.string().min(1).max(80), other: residentIdSchema.optional(),
    amount: z.number().nonnegative().optional(), resource: z.enum(RESOURCES).optional(),
    outcome: z.string().min(1).max(2_000),
  })).max(8),
  doing: z.string().min(1).max(240),
});

const happeningSchema = z.strictObject({
  day: z.number().int().nonnegative(),
  watch: z.number().int().min(1).max(4),
  minute: z.number().int().min(0).max(1439),
  room: roomIdSchema,
  who: z.array(residentIdSchema).min(1).max(25),
  text: z.string().min(1).max(2_000),
  kind: z.enum(['work', 'need', 'meeting', 'power', 'note']),
});

const economySchema = z.strictObject({
  nextEventSequence: z.number().int().nonnegative().default(0),
  events: z.array(z.strictObject({ sequence: z.number().int().nonnegative(), day: z.number().int().nonnegative(),
    watch: z.number().int().min(1).max(4), actor: residentIdSchema.optional(), room: roomIdSchema.optional(), companions: z.array(residentIdSchema).min(2).max(2).optional(), action: z.string().min(1).max(80),
    entries: z.array(z.strictObject({ account: z.string().min(1).max(100), delta: z.number() })).max(100),
  })).max(1024).default([]),
  startedOnDay: z.number().int().nonnegative(),
  stock: z.strictObject(Object.fromEntries(RESOURCES.map((resource) => [resource,
    z.number().nonnegative().max(CAPACITY[resource])])) as Record<(typeof RESOURCES)[number], z.ZodNumber>),
  treasury: z.number().nonnegative().max(1_000_000),
  workCredits: z.record(residentIdSchema, z.number().nonnegative().max(1_000)),
  nextDebtSequence: z.number().int().nonnegative(),
  debts: z.array(z.strictObject({ id: z.string().min(1).max(100), lender: residentIdSchema, borrower: residentIdSchema,
    principal: z.number().positive(), remaining: z.number().nonnegative(), issuedDay: z.number().int().nonnegative(),
    dueDay: z.number().int().nonnegative(), status: z.enum(['open', 'paid', 'overdue']),
  }).superRefine((debt, ctx) => {
    if (debt.lender === debt.borrower || debt.remaining > debt.principal || debt.dueDay < debt.issuedDay
      || (debt.status === 'paid') !== (debt.remaining === 0)) ctx.addIssue({ code: 'custom', message: 'inconsistent obligation' });
  })).max(100),
  ledger: z.strictObject({ initialCells: z.number().nonnegative(), minted: z.number().nonnegative(),
    burned: z.number().nonnegative(), leaked: z.number().nonnegative() }),
  maintenance: z.number().min(0).max(100),
});

const storedWorldSchema = z.strictObject({
  seed: z.number().int(),
  day: z.number().int().nonnegative(),
  watch: z.number().int().min(1).max(4),
  bodies: z.record(residentIdSchema, bodySchema),
  rooms: z.record(roomIdSchema, z.strictObject({
    id: roomIdSchema,
    lit: z.boolean(),
  })),
  reactor: z.strictObject({ output: z.number().min(0).max(1) }),
  economy: economySchema,
  axes: z.array(z.tuple([z.string(), axisSchema])).length(RESIDENTS.length * (RESIDENTS.length - 1)),
  record: z.array(happeningSchema).max(256),
}).superRefine((world, context) => {
  const now = world.day * 4 + world.watch - 1;
  const issue = (path: PropertyKey[], message: string) => context.addIssue({ code: 'custom', path, message });
  for (const [id, body] of Object.entries(world.bodies)) {
    const room = ROOM_BY_ID[body.room];
    if (body.id !== id) issue(['bodies', id, 'id'], 'resident key and identity differ');
    if (!isWalkable(room.grid, room.legend, body.at.x, body.at.y)) issue(['bodies', id, 'at'], 'invalid presentation anchor');
    if (body.thoughtOn > world.day || body.lastThoughtWatch > now || (body.lastAttemptWatch ?? 0) > now
      || (body.lastInteractionWatch ?? 0) > now) issue(['bodies', id], 'cognition clock is in the future');
    if (body.memory.some((fact) => fact.day * 4 + fact.watch - 1 > now)) issue(['bodies', id, 'memory'], 'memory is in the future');
    if (body.knownFacts && (new Set(body.knownFacts.map((fact) => fact.id)).size !== body.knownFacts.length
      || body.knownFacts.some((fact) => fact.learnedDay !== null && fact.learnedDay > world.day))) issue(['bodies', id, 'knownFacts'], 'invalid learned knowledge');
    if (body.plan && (body.plan.room === 'breach' || body.plan.untilWatch > now + 100)) issue(['bodies', id, 'plan'], 'invalid visit commitment');
  }
  for (const entry of world.record) if (entry.day * 4 + entry.watch - 1 > now || new Set(entry.who).size !== entry.who.length) issue(['record'], 'invalid event calendar or duplicate participants');
  for (const [id, room] of Object.entries(world.rooms)) if (room.id !== id) issue(['rooms', id, 'id'], 'room key and identity differ');
  if (world.economy.startedOnDay > world.day) issue(['economy', 'startedOnDay'], 'economy begins in the future');
  for (const debt of world.economy.debts) if (debt.issuedDay > world.day || debt.issuedDay < world.economy.startedOnDay) issue(['economy', 'debts'], 'debt is outside the economic calendar');
  for (const event of world.economy.events) if (event.sequence >= world.economy.nextEventSequence || event.day * 4 + event.watch - 1 > now) issue(['economy', 'events'], 'invalid event sequence or clock');
  const actual = world.economy.treasury + Object.values(world.bodies).reduce((sum, body) => sum + body.cells, 0);
  const ledger = world.economy.ledger;
  if (Math.abs(actual - (ledger.initialCells + ledger.minted - ledger.burned - ledger.leaked)) > 1e-8) {
    context.addIssue({ code: 'custom', path: ['economy', 'ledger'], message: 'charge cells do not balance' });
  }
  const accounts = new Set(['treasury', 'maintenance', ...RESIDENTS.flatMap(({ id }) => [`cells:${id}`, `credits:${id}`]),
    ...RESOURCES.map((id) => `stock:${id}`), ...['initialCells', 'minted', 'burned', 'leaked'].map((id) => `ledger:${id}`)]);
  if (new Set(world.economy.events.map((event) => event.sequence)).size !== world.economy.events.length
    || world.economy.events.some((event) => new Set(event.entries.map((entry) => entry.account)).size !== event.entries.length
      || event.entries.some((entry) => !accounts.has(entry.account))
      || (event.companions && (new Set(event.companions).size !== 2 || !event.actor || !event.companions.includes(event.actor))))) issue(['economy', 'events'], 'invalid transaction accounts or duplicate sequence');
  if (new Set(world.economy.debts.map((debt) => debt.id)).size !== world.economy.debts.length) {
    context.addIssue({ code: 'custom', path: ['economy', 'debts'], message: 'duplicate obligation' });
  }
  const expected = new Set(
    RESIDENTS.flatMap((from) => RESIDENTS
      .filter((to) => to.id !== from.id)
      .map((to) => `${from.id}${to.id}`)),
  );
  const received = new Set(world.axes.map(([key]) => key));
  if (received.size !== expected.size || [...expected].some((key) => !received.has(key))) {
    context.addIssue({
      code: 'custom',
      path: ['axes'],
      message: 'the directed relationship matrix is incomplete',
    });
  }
});

// The old world used sixteen broad spaces. Validate its structure and every
// identifier before translating it; malformed current worlds are never repaired.
const legacyIds = ['bridge', 'dock', 'cabins', 'breach', 'hold', 'infirmary',
  'berths', 'spine', 'greatwall', 'common', 'hydroponics', 'diggings',
  'workshops', 'well', 'face', 'hollow'] as const;
const legacyRoomSchema = z.enum(legacyIds);
const previousBodySchema = bodySchema.omit({ lastThoughtWatch: true, memory: true, lastAttemptWatch: true, lastInteractionWatch: true, knownFacts: true, plan: true });
const previousWorldSchema = z.strictObject({ ...z.strictObject(storedWorldSchema.shape).omit({ economy: true }).shape,
  bodies: z.record(residentIdSchema, previousBodySchema) });
const legacyWorldSchema = z.strictObject({
  ...previousWorldSchema.shape,
  bodies: z.record(residentIdSchema, previousBodySchema.extend({ room: legacyRoomSchema })),
  rooms: z.record(legacyRoomSchema, z.strictObject({ id: legacyRoomSchema, lit: z.boolean() })),
  record: z.array(happeningSchema.extend({ room: legacyRoomSchema })).max(256),
});

export function migrateLegacyWorld(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('rooms' in value)) return value;
  const rooms = (value as { rooms: unknown }).rooms;
  if (typeof rooms !== 'object' || rooms === null || !Object.hasOwn(rooms, 'cabins')) return value;
  const legacy = legacyWorldSchema.parse(value);
  const bodies = Object.fromEntries(RESIDENTS.map(({ id }) => {
    const body = legacy.bodies[id];
    const room = body.room === 'cabins' || body.room === 'diggings' ? SLEEPS[id]
      : body.room === 'greatwall' && ['A', 'I', 'K'].includes(id) ? POSTED[id]
      : presentRoom(body.room);
    return [id, { ...body, room, at: { ...body.at }, lastThoughtWatch: body.thoughtOn * 4, lastAttemptWatch: body.thoughtOn * 4, lastInteractionWatch: 0, knownFacts: initialKnowledge(id), plan: null, memory: [] as WorldState['bodies'][ResidentId]['memory'] }];
  })) as WorldState['bodies'];
  const state: WorldState = {
    ...legacy,
    bodies,
    economy: createEconomy(legacy.day, Object.values(bodies).reduce((sum, body) => sum + body.cells, 0)),
    rooms: Object.fromEntries(ROOMS.map((room) => {
      const previous = legacy.rooms[room.id as keyof typeof legacy.rooms];
      const parent = Object.entries(LEGACY_ROOMS).find(([, current]) => current === room.id)?.[0];
      const inherited = parent ? legacy.rooms[parent as keyof typeof legacy.rooms] : undefined;
      return [room.id, { id: room.id, lit: previous?.lit ?? inherited?.lit ?? room.id !== 'breach' }];
    })) as WorldState['rooms'],
    axes: new Map(legacy.axes) as WorldState['axes'],
    record: legacy.record.map((entry) => ({ ...entry, room: presentRoom(entry.room) })),
  };
  const occupied = new Set<string>();
  for (const { id } of RESIDENTS) {
    const body = state.bodies[id];
    const definition = ROOM_BY_ID[body.room];
    const key = `${body.room}:${body.at.x}:${body.at.y}`;
    if (!isWalkable(definition.grid, definition.legend, body.at.x, body.at.y) || occupied.has(key)) {
      placeInRoom(state, id, body.room);
    }
    occupied.add(`${body.room}:${body.at.x}:${body.at.y}`);
  }
  return { ...state, axes: [...state.axes] };
}

export function migrateEconomyWorld(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Object.hasOwn(value, 'economy')) return value;
  const previous = previousWorldSchema.parse(value);
  return { ...previous,
    bodies: Object.fromEntries(Object.entries(previous.bodies).map(([id, body]) => [id,
      { ...body, lastThoughtWatch: body.thoughtOn * 4, memory: [] as WorldState['bodies'][ResidentId]['memory'] }])),
    economy: createEconomy(previous.day, Object.values(previous.bodies).reduce((sum, body) => sum + body.cells, 0)),
  };
}

const DECISION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    verb: { type: 'string', enum: [...VERB_NAMES] },
    room: { anyOf: [{ type: 'string', enum: [...ROOM_IDS] }, { type: 'null' }] },
    target: { anyOf: [{ type: 'string', enum: [...RESIDENT_IDS] }, { type: 'null' }] },
    fact: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['verb', 'room', 'target', 'fact'],
  additionalProperties: false,
} satisfies JsonValue;

export type PreparedCognition = {
  actor: ResidentId;
  job: CognitionJob;
};

export function serializeWorldState(state: WorldState): string {
  const stored = storedWorldSchema.parse({
    ...state,
    axes: [...state.axes.entries()].sort(([left], [right]) => left.localeCompare(right)),
  });
  return JSON.stringify(stored);
}

export function deserializeWorldState(serialized: string): WorldState {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    throw new RangeError('stored habitat world is not valid JSON');
  }
  const stored = storedWorldSchema.parse(migrateEconomyWorld(migrateLegacyWorld(raw)));
  return {
    ...stored,
    bodies: Object.fromEntries(Object.entries(stored.bodies).map(([id, body]) => [id, { ...body,
      lastAttemptWatch: body.lastAttemptWatch ?? body.lastThoughtWatch, lastInteractionWatch: body.lastInteractionWatch ?? 0,
      knownFacts: body.knownFacts ?? initialKnowledge(id as ResidentId), plan: body.plan ?? null,
    }])) as WorldState['bodies'],
    rooms: stored.rooms as WorldState['rooms'],
    economy: stored.economy as WorldState['economy'],
    axes: new Map(stored.axes) as WorldState['axes'],
  };
}

export function createGenesisWorld(): WorldState {
  return deserializeWorldState(serializeWorldState(genesisState(1)));
}

export function worldSnapshot(state: WorldState): HabitatSnapshot {
  return snapshotFrom(state);
}

const AUTHOR_EDGES = edges();
export function worldRelationships(state: WorldState) {
  return AUTHOR_EDGES.map((edge) => {
    const secret = edge.latent ? LATENT.find((fact) => (fact.from === edge.from && fact.to === edge.to)
      || (fact.to === edge.from && fact.from === edge.to)) : undefined;
    const learned = secret && state.bodies[secret.to].knownFacts.some((fact) => fact.id === `secret:${secret.from}:${secret.to}:${secret.knower}`);
    return { ...edge, latent: edge.latent && !learned, axes: { ...state.axes.get(`${edge.from}${edge.to}`)! } };
  });
}

export function advanceWorldWatch(state: WorldState, cognition?: Intent, attemptedActor?: ResidentId, onDecision?: Parameters<typeof advanceScheduledWatch>[3]): WorldState {
  return advanceScheduledWatch(state, cognition, attemptedActor, onDecision);
}

export function decodeCognition(actor: ResidentId, payload: unknown): Intent | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
  const candidate = { ...(payload as Record<string, unknown>) };
  if (candidate.room === null) delete candidate.room;
  if (candidate.target === null) delete candidate.target;
  if (candidate.fact === null) delete candidate.fact;
  const decoded = decodeIntentFor(actor, candidate);
  return decoded.ok ? decoded.intent : undefined;
}

export function selectCognitionSubject(state: WorldState): ResidentId {
  const now = state.day * 4 + state.watch - 1;
  return [...RESIDENTS].sort((left, right) => {
    const a = state.bodies[left.id], b = state.bodies[right.id];
    // Every delayed watch adds unbounded priority. Pressure can alter the next
    // few choices, but can never buy permanent ownership of the scarce oracle.
    const scoreA = (now - a.lastAttemptWatch) * 8 + a.pressure;
    const scoreB = (now - b.lastAttemptWatch) * 8 + b.pressure;
    return scoreB - scoreA || a.lastAttemptWatch - b.lastAttemptWatch || left.id.localeCompare(right.id);
  })[0]!.id;
}

export function prepareCognition(input: {
  state: WorldState;
  worldRevision: number;
  habitatId: string;
  runId: string;
  createdAtMs: number;
  controlRevision: number;
  recentHistory?: readonly Happening[];
}): PreparedCognition {
  const actor = selectCognitionSubject(input.state);
  const body = input.state.bodies[actor];
  const resident = RESIDENT_BY_ID[actor];
  const room = ROOM_BY_ID[body.room];
  const coLocated = RESIDENTS
    .filter((other) => other.id !== actor && input.state.bodies[other.id].room === body.room)
    .map((other) => ({
      id: other.id,
      name: other.name,
      doing: input.state.bodies[other.id].doing,
    }));
  const possibleActions = VERB_NAMES.flatMap((verb) => {
    const definition = VERBS[verb];
    if (body.cells < (definition.cost ?? 0)) return [];
    const candidates: Intent[] = [ { actor, verb },
      ...room.connects.map((destination) => ({ actor, verb, room: destination })),
      ...RESIDENTS.filter(({ id }) => id !== actor).map(({ id: target }) => ({ actor, verb, target })),
    ];
    const accepted = candidates.filter((intent) => canPropose(input.state, intent));
    if (!accepted.length) return [];
    return [{ verb, ...(['confide', 'teach'].includes(verb) ? { facts: knowledgeFor(body.knownFacts).filter((fact) => verb === 'confide' || !fact.private).map((fact) => fact.id) } : {}), ...(verb === 'go' ? { rooms: accepted.flatMap((intent) => intent.room ? [intent.room] : []) }
      : accepted.some((intent) => !intent.target) ? {} : { targets: accepted.flatMap((intent) => intent.target ? [intent.target] : []).slice(0, 5) }) }];
  });
  const jobId = `${input.habitatId}:world:${input.worldRevision}:control:${input.controlRevision}:action`;

  const prepared: PreparedCognition = {
    actor,
    job: {
      schemaVersion: HABITAT_SCHEMA_VERSION,
      jobId,
      habitatId: input.habitatId,
      origin: { kind: 'alarm', runId: input.runId },
      cause: {
        worldRevision: input.worldRevision,
        simTime: {
          day: input.state.day,
          minute: (input.state.watch - 1) * 360,
        },
      },
      kind: 'resident_action',
      subjects: [{ kind: 'resident', id: actor }],
      pressure: body.pressure / 100,
      createdAtMs: input.createdAtMs,
      prompt: {
        system: [
          'Choose one immediate intention for one persistent resident of a closed habitat.',
          'Return only the JSON object required by the schema.',
          'You choose a verb and optional room or target; you never claim consequences.',
          'The deterministic world engine will validate location, resources, access and relationships.',
          'Listed actions are proposals from your own resources, not advance consent. Other residents can decline; their private feelings are not supplied.',
          'A refused intention is allowed and becomes part of the resident\'s pressure.',
          'Prefer a concrete action grounded in the supplied present state and personal history.',
          "Authored bonds are history, not proof of another person's unspoken thoughts. Only privateKnowledge belongs to this resident. Never invent a revelation or resolve a secret from coincidence.",
        ].join(' '),
        user: JSON.stringify({
          time: { day: input.state.day, watch: input.state.watch },
          resident: {
            id: actor,
            name: resident.name,
            age: resident.age,
            formerWork: resident.was,
            before: resident.before,
            duty: resident.duty,
            fears: resident.fears,
            wants: resident.wants,
            voice: resident.voice,
          },
          body: {
            room: body.room,
            conditions: Object.fromEntries(CONDITIONS.map((key) => [key, Math.round(body.condition[key] * 10) / 10])),
            cells: Math.round(body.cells * 100) / 100,
            pressure: body.pressure,
            daysSinceThought: input.state.day - body.thoughtOn,
            doing: body.doing,
          },
          surroundings: {
            room: { id: room.id, name: room.name },
            connectedRooms: room.connects,
            peopleHere: coLocated.map(({ id }) => id),
          },
          economy: { sinceDay: input.state.economy.startedOnDay, stock: input.state.economy.stock,
            maintenance: input.state.economy.maintenance, treasury: input.state.economy.treasury,
            workCreditsToday: input.state.economy.workCredits[actor],
            obligations: input.state.economy.debts.filter((debt) => debt.status !== 'paid' && (debt.lender === actor || debt.borrower === actor)),
            terms: 'give: 2 cells; lend: 4 due in 5 days, recipient may decline; repay: up to 2; trade: pay 2 for a real repair. Work earns credits, worth up to 0.35 cells at day close; eat costs 0.5 cells transferred to the treasury.',
          },
          knownBonds: sharedBondsFor(actor),
          privateKnowledge: knowledgeFor(body.knownFacts),
          plan: body.plan,
          relationshipAxisOrder: AXES,
          relationships: coLocated.slice(0, 6).map(({ id }) => ({ id,
            held: AXES.map((axis) => Math.round(input.state.axes.get(`${actor}${id}`)![axis])),
          })),
          memory: body.memory.map((fact) => ({ ...fact, outcome: fact.outcome.slice(0, 120) })), possibleActions,
          recentHistory: (input.recentHistory ?? [])
            .filter((entry) => entry.who.includes(actor))
            .slice(-8)
            .map((entry) => ({
              day: entry.day,
              watch: entry.watch,
              minute: entry.minute,
              room: entry.room,
              people: entry.who,
              text: entry.text.slice(0, 120),
              kind: entry.kind,
            })),
        }),
      },
      outputContract: {
        name: 'habitat_intent',
        version: 3,
        schemaHash: `sha256:${createHash('sha256').update(JSON.stringify(DECISION_JSON_SCHEMA)).digest('hex')}`,
        jsonSchema: DECISION_JSON_SCHEMA,
      },
    // Includes the provider's reasoning tokens. The original 128-token budget
    // could end before the small JSON intention; keep the existing hard cap.
    maxOutputTokens: 384,
    },
  };  prepared.job.prompt.user = packPromptContext(prepared.job.prompt.system, JSON.parse(prepared.job.prompt.user) as Record<string, JsonValue>, prepared.job.outputContract.jsonSchema);
  return prepared;
}
