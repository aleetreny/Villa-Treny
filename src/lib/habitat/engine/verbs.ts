// What a person can do, and what it costs them.
//
// A verb is engine code, not narration. Each one carries physical preconditions —
// where you are, what you hold, who is present, what power there is — and a
// deterministic effect. Whoever is choosing, whether that is the routine policy
// or a model, only ever names a verb and a target. **The engine validates and
// executes.** Nothing that says it happened makes it happen.
//
// This is the working subset: the verbs a day is made of. The catalogue is a flat
// table on purpose, so the rest of the hundred and ten are additions rather than
// changes — a new verb is a new row, and nothing else moves.

import { ROOM_BY_ID, type RoomId } from '../rooms';
import { RESIDENT_BY_ID, type ResidentId } from '../residents';
import {
  bounded, nudge, placeInRoom, type Body, type Condition, type Happening, type WorldState,
} from './state';
import { CAPACITY, acceptsHelp, outstanding, recordWork, remember, economicAccounts, recordEconomicChange, mechanized, yieldFor } from './economy';
import { FACTS } from './knowledge';

export type VerbFamily =
  | 'body' | 'objects' | 'work' | 'talk' | 'affection' | 'commitment' | 'knowledge';

export type Intent = {
  verb: VerbName;
  actor: ResidentId;
  /** Where the verb wants to happen, for the ones that move somebody. */
  room?: RoomId;
  /** Who it is aimed at. */
  target?: ResidentId;
  /** Explicit knowledge to share; generic conversation never reveals a secret. */
  fact?: string;
};

export type IntentDecodeResult =
  | { ok: true; intent: Intent }
  | { ok: false; error: string };

export type Outcome = {
  ok: boolean;
  /** Why not, when it did not. Kept because a refused intent is data: it is
   *  pressure, and pressure is what buys a person a thought. */
  refused?: string;
  happening?: Omit<Happening, 'day' | 'watch' | 'minute'>;

};

export type Verb = {
  name: string;
  family: VerbFamily;
  /** Charge cells the actor spends. Most things are free; making things is not. */
  cost?: number;
  /** Whether the actor must be somewhere in particular. */
  requires?: (state: WorldState, intent: Intent) => string | null;
  run: (
    state: WorldState, intent: Intent,
  ) => Omit<Happening, 'day' | 'watch' | 'minute'> | null;
};

const CATALOGUE = [
  'go', 'rest', 'sleep', 'eat', 'drink', 'wash',
  'work', 'dig', 'grow', 'cook', 'clean', 'inspect', 'repair', 'charge',
  'speak', 'ask', 'listen', 'joke', 'argue', 'confide',
  'greet', 'accompany', 'console', 'avoid', 'seek out', 'flirt',
  'observe', 'note', 'teach', 'give', 'lend', 'repay', 'trade',
] as const;
export type VerbName = (typeof CATALOGUE)[number];

const INTENT_FIELDS = new Set(['verb', 'room', 'target', 'fact']);
const TARGET_VERBS = new Set<VerbName>(['speak', 'ask', 'listen', 'joke', 'argue', 'confide', 'greet', 'accompany', 'console', 'avoid', 'seek out', 'flirt', 'teach', 'give', 'lend', 'repay', 'trade']);

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Decode a model proposal without ever letting the model choose who is acting.
 *
 * This validates only the protocol boundary: known identifiers and no hidden
 * fields. Whether the proposal is possible in the current world remains solely
 * `attempt`'s decision. */
export function decodeIntentFor(actor: unknown, raw: unknown): IntentDecodeResult {
  if (typeof actor !== 'string' || !hasOwn(RESIDENT_BY_ID, actor)) {
    return { ok: false, error: 'unknown actor' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'intent must be an object' };
  }
  const candidate = raw as Record<string, unknown>;
  const unexpected = Object.keys(candidate).find((key) => !INTENT_FIELDS.has(key));
  if (unexpected) return { ok: false, error: `unexpected field: ${unexpected}` };
  if (!hasOwn(candidate, 'verb') || typeof candidate.verb !== 'string'
    || !(CATALOGUE as readonly string[]).includes(candidate.verb)) {
    return { ok: false, error: 'unknown verb' };
  }
  if (hasOwn(candidate, 'room')
    && (typeof candidate.room !== 'string' || !hasOwn(ROOM_BY_ID, candidate.room))) {
    return { ok: false, error: 'unknown room' };
  }
  if (hasOwn(candidate, 'target')
    && (typeof candidate.target !== 'string' || !hasOwn(RESIDENT_BY_ID, candidate.target))) {
    return { ok: false, error: 'unknown target' };
  }

  const verb = candidate.verb as VerbName;
  if (verb === 'go' && !hasOwn(candidate, 'room')) return { ok: false, error: 'go needs a room' };
  if (TARGET_VERBS.has(verb) && !hasOwn(candidate, 'target')) return { ok: false, error: 'this verb needs a target' };
  if (hasOwn(candidate, 'room') && verb !== 'go') return { ok: false, error: 'room is only valid for go' };
  if (hasOwn(candidate, 'target') && !TARGET_VERBS.has(verb)) return { ok: false, error: 'target is not valid for this verb' };
  if (hasOwn(candidate, 'fact') && (!['confide', 'teach'].includes(verb) || typeof candidate.fact !== 'string' || candidate.fact.length < 1 || candidate.fact.length > 100)) {
    return { ok: false, error: 'invalid knowledge field' };
  }
  const intent: Intent = {
    actor: actor as ResidentId,
    verb: candidate.verb as VerbName,
  };
  if (hasOwn(candidate, 'room')) intent.room = candidate.room as RoomId;
  if (hasOwn(candidate, 'target')) intent.target = candidate.target as ResidentId;
  if (hasOwn(candidate, 'fact')) intent.fact = candidate.fact as string;
  return { ok: true, intent };
}

function body(state: WorldState, id: ResidentId): Body {
  return state.bodies[id];
}

function condition(b: Body, key: Condition, by: number): void {
  b.condition[key] = bounded(b.condition[key] + by);
}

function first(name: ResidentId): string {
  return RESIDENT_BY_ID[name].name.split(' ')[0]!;
}

/** Presence is a consequence of an activity, not a pixel prerequisite. The
 * six-hour watch includes arranging and reaching a willing counterpart. */
function arrive(state: WorldState, id: ResidentId, room: RoomId): void {
  placeInRoom(state, id, room);
}

function together(state: WorldState, intent: Intent): string | null {
  if (!intent.target) return 'nobody named';
  if (intent.target === intent.actor) return 'alone';
  if (intent.verb === 'avoid' || intent.verb === 'repay') return null;
  const recipient = body(state, intent.target);
  if (['give', 'lend'].includes(intent.verb)) return null; // receiving help does not demand a working shift
  if (recipient.condition.rested < 15) return 'recipient needs sleep';
  if (recipient.condition.fed < 18) return 'recipient needs food';
  const stamp = state.day * 4 + state.watch - 1;
  if (body(state, intent.actor).lastInteractionWatch === stamp) return 'actor has already committed this watch';
  if (recipient.lastInteractionWatch === stamp) return 'recipient has already committed this watch';
  if (state.axes.get(`${intent.target}${intent.actor}`)!.resentment >= 70) return 'recipient declines contact';
  return null;
}

function shareFact(state: WorldState, intent: Intent): string | undefined {
  const from = body(state, intent.actor), to = body(state, intent.target!);
  const id = intent.fact ?? (intent.verb === 'teach' ? from.knownFacts.find((fact) => !FACTS[fact.id]!.private
    && !to.knownFacts.some((known) => known.id === fact.id))?.id : undefined);
  if (id && !to.knownFacts.some((fact) => fact.id === id)) {
    to.knownFacts.push({ id, learnedDay: state.day, source: intent.actor });
    return id;
  }
  return undefined;
}

/** How a conversation moves the six axes. Warm verbs move affection and trust,
 *  hard ones move resentment, and every one of them moves `accompanied`, because
 *  even an argument is company. */
function social(
  state: WorldState, intent: Intent,
  moves: Array<[Parameters<typeof nudge>[3], number, number]>,
  text: (a: string, b: string) => string,
  kind: Happening['kind'] = 'meeting',
): Omit<Happening, 'day' | 'watch' | 'minute'> {
  const { actor } = intent;
  const target = intent.target!;
  // A willing visit is resolved before either person's next visual presence.
  arrive(state, actor, body(state, target).room);
  if (!['give', 'lend', 'repay'].includes(intent.verb)) {
    body(state, target).lastInteractionWatch = state.day * 4 + state.watch - 1;
    body(state, actor).lastInteractionWatch = state.day * 4 + state.watch - 1;
  }
  for (const [axis, fwd, bwd] of moves) {
    nudge(state, actor, target, axis, fwd);
    nudge(state, target, actor, axis, bwd);
  }
  // Enough that company actually answers loneliness. At nine it never did, so
  // the need stayed lit for everybody all the time and drowned out every other
  // reason a person might have to do anything.
  condition(body(state, actor), 'accompanied', 24);
  condition(body(state, target), 'accompanied', 24);
  return {
    room: body(state, actor).room,
    who: [actor, target],
    text: text(first(actor), first(target)),
    kind,
  };
}

export const VERBS: Record<VerbName, Verb> = {
  go: {
    name: 'go',
    family: 'body',
    requires: (state, intent) => {
      if (!intent.room) return 'nowhere named';
      const here = body(state, intent.actor).room;
      if (here === intent.room) return 'already there';
      if (intent.room === 'breach') return 'no air, and the suits are logged out';
      return null;
    },
    run: (state, intent) => {
      const b = body(state, intent.actor);
      arrive(state, intent.actor, intent.room!);
      condition(b, 'rested', -0.2);
      return null;
    },
  },

  rest: {
    name: 'rest',
    family: 'body',
    run: (state, intent) => {
      condition(body(state, intent.actor), 'rested', 30);
      condition(body(state, intent.actor), 'safe', 8);
      return null;
    },
  },

  sleep: {
    name: 'sleep',
    family: 'body',
    run: (state, intent) => {
      const b = body(state, intent.actor);
      condition(b, 'rested', 50);
      condition(b, 'well', 2);
      condition(b, 'safe', 1);
      return null;
    },
  },

  eat: {
    name: 'eat',
    family: 'body',
    requires: (state, intent) => (
      body(state, intent.actor).room !== 'common' ? 'nothing to eat here'
        : body(state, intent.actor).cells < 0.5 && body(state, intent.actor).condition.fed >= 28 ? 'not enough charge; emergency rations are reserved for urgent hunger'
          : state.economy.stock.meals < 1 ? 'no prepared meals remain'
          : state.economy.stock.water < 1 ? 'no clean water remains' : null
    ),
    run: (state, intent) => {
      const b = body(state, intent.actor);
      const fee = Math.min(0.5, b.cells);
      b.cells -= fee;
      state.economy.treasury += fee;
      state.economy.stock.meals -= 1;
      state.economy.stock.water -= 1;
      condition(b, 'fed', 46);
      return fee < 0.5 ? { room: b.room, who: [intent.actor], kind: 'need',
        text: `${first(intent.actor)} received an emergency meal and water; ${fee.toFixed(3)} cells paid, the remaining meal fee waived.` } : null;
    },
  },

  drink: {
    name: 'drink',
    family: 'body',
    requires: (state) => state.economy.stock.water >= 1 ? null : 'no clean water remains',
    run: (state, intent) => {
      state.economy.stock.water -= 1;
      condition(body(state, intent.actor), 'fed', 6);
      return null;
    },
  },

  wash: {
    name: 'wash',
    family: 'body',
    requires: (state, intent) => (
      !['well', 'infirmary', 'washroom'].includes(body(state, intent.actor).room) ? 'no washing station here'
        : state.economy.stock.water < 2 ? 'no clean water remains' : null
    ),
    run: (state, intent) => {
      state.economy.stock.water -= 2;
      condition(body(state, intent.actor), 'well', 26);
      condition(body(state, intent.actor), 'safe', 10);
      return null;
    },
  },

  work: {
    name: 'work',
    family: 'work',
    run: (state, intent) => {
      const b = body(state, intent.actor);
      condition(b, 'rested', -5);
      recordWork(state, intent.actor);
      return null;
    },
  },

  dig: {
    name: 'dig',
    family: 'work',
    requires: (state, intent) => (
      body(state, intent.actor).room !== 'face' ? 'nothing to cut here'
        : state.economy.stock.materials + yieldFor(state, 'face', 4) > CAPACITY.materials ? 'material store is full'
          : state.economy.stock.water < 1 ? 'no water for the cutting equipment' : null
    ),
    run: (state, intent) => {
      const b = body(state, intent.actor);
      const amount = yieldFor(state, b.room, 4);
      condition(b, 'rested', mechanized(state, b.room) ? -8 : -10);
      state.economy.stock.water -= 1;
      state.economy.stock.materials += amount;
      recordWork(state, intent.actor, 2);
      return { room: 'face', who: [intent.actor], text: `${first(intent.actor)} recovered ${amount} usable materials at the face${mechanized(state, b.room) ? '' : ' by hand'}; 1 water used.`, kind: 'work' };
    },
  },

  grow: {
    name: 'grow',
    family: 'work',
    requires: (state, intent) => (
      body(state, intent.actor).room !== 'garden' ? 'nothing growing here'
        : state.economy.stock.produce + yieldFor(state, 'garden', 16) > CAPACITY.produce ? 'produce store is full'
          : state.economy.stock.water < 2 ? 'not enough water for the trays' : null
    ),
    run: (state, intent) => {
      const b = body(state, intent.actor);
      condition(b, 'rested', -5);
      state.economy.stock.water -= 2;
      const amount = yieldFor(state, b.room, 16);
      if (!mechanized(state, b.room)) condition(b, 'rested', -3);
      state.economy.stock.produce += amount;
      recordWork(state, intent.actor, 2);
      return { room: b.room, who: [intent.actor], text: `${first(intent.actor)} harvested ${amount} produce${mechanized(state, b.room) ? '' : ' by hand'}; 2 water used.`, kind: 'work' };
    },
  },

  cook: {
    name: 'cook',
    family: 'work',
    requires: (state, intent) => (
      !['common', 'kitchen'].includes(body(state, intent.actor).room) ? 'no burners here'
        : state.economy.stock.meals + yieldFor(state, body(state, intent.actor).room, 8) > CAPACITY.meals ? 'prepared meal store is full'
          : state.economy.stock.produce < 4 ? 'not enough produce to cook'
            : state.economy.stock.water < 1 ? 'no water for cooking' : null
    ),
    run: (state, intent) => {
      const b = body(state, intent.actor);
      condition(b, 'rested', -5);
      state.economy.stock.produce -= 4;
      state.economy.stock.water -= 1;
      const amount = yieldFor(state, b.room, 8);
      if (!mechanized(state, b.room)) condition(b, 'rested', -3);
      state.economy.stock.meals += amount;
      recordWork(state, intent.actor, 2);
      return { room: b.room, who: [intent.actor], text: `${first(intent.actor)} prepared ${amount} meals${mechanized(state, b.room) ? '' : ' without powered burners'} from 4 produce and 1 water.`, kind: 'work' };
    },
  },

  clean: {
    name: 'clean',
    family: 'work',
    requires: (state, intent) => body(state, intent.actor).room === 'well' && state.economy.stock.water + yieldFor(state, 'well', 24) > CAPACITY.water
      ? 'clean-water store is full' : null,
    run: (state, intent) => {
      const b = body(state, intent.actor);
      condition(b, 'rested', -5);
      condition(b, 'well', 2);
      recordWork(state, intent.actor);
      if (b.room === 'well') {
        const amount = yieldFor(state, b.room, 24);
        if (!mechanized(state, b.room)) condition(b, 'rested', -3);
        state.economy.stock.water += amount;
        return { room: b.room, who: [intent.actor], text: `${first(intent.actor)} filtered ${amount} water at the well${mechanized(state, b.room) ? '' : ' by hand'}.`, kind: 'work' };
      }
      return null;
    },
  },

  inspect: {
    name: 'inspect',
    family: 'work',
    run: (state, intent) => {
      const b = body(state, intent.actor);
      condition(b, 'rested', -3);
      recordWork(state, intent.actor);
      return {
        room: b.room,
        who: [intent.actor],
        text: `${ROOM_BY_ID[b.room].name} was walked through and looked over.`,
        kind: 'work',
      };
    },
  },

  repair: {
    name: 'repair',
    family: 'work',
    requires: (state) => state.economy.stock.materials >= 1 ? null : 'no repair materials remain',
    run: (state, intent) => {
      const b = body(state, intent.actor);
      condition(b, 'rested', -6);
      const powered = b.cells >= 2;
      const charge = powered ? 2 : 0;
      b.cells -= charge; state.economy.ledger.burned += charge;
      condition(b, 'safe', powered ? 22 : 12);
      state.economy.stock.materials -= 1;
      state.economy.maintenance = Math.min(100, state.economy.maintenance + (powered ? 8 : 4));
      recordWork(state, intent.actor, 2);
      return {
        room: b.room,
        who: [intent.actor],
        text: `${first(intent.actor)} repaired ${ROOM_BY_ID[b.room].name}; 1 material and ${charge} charge cells used${powered ? '' : '; slower manual repair'}.`,
        kind: 'work',
      };
    },
  },

  charge: {
    name: 'charge',
    family: 'work',
    requires: (state, intent) => (
      body(state, intent.actor).room === 'workshops' ? null : 'no rack here'
    ),
    run: (state, intent) => {
      recordWork(state, intent.actor, 2);
      condition(body(state, intent.actor), 'rested', -4);
      return null;
    },
  },

  give: {
    name: 'give', family: 'commitment',
    requires: (state, intent) => together(state, intent)
      ?? (body(state, intent.actor).cells < 6 ? 'cannot spare 2 cells and keep a reserve'
        : body(state, intent.target!).cells >= 8 ? 'recipient already has a reserve'
          : !acceptsHelp(state, intent.actor, intent.target!) ? 'recipient declines the gift' : null),
    run: (state, intent) => {
      body(state, intent.actor).cells -= 2;
      body(state, intent.target!).cells += 2;
      return social(state, intent, [['trust', 0, 4], ['affection', 1, 3]],
        (a, b) => `${a} gave ${b} 2 charge cells.`);
    },
  },
  lend: {
    name: 'lend', family: 'commitment',
    requires: (state, intent) => together(state, intent)
      ?? (body(state, intent.actor).cells < 8 ? 'cannot lend 4 cells and keep a reserve'
        : body(state, intent.target!).cells >= 6 ? 'recipient does not need a loan'
          : !acceptsHelp(state, intent.actor, intent.target!) ? 'recipient declines the loan'
            : state.axes.get(`${intent.actor}${intent.target}`)!.trust < 30 ? 'not enough trust to lend'
              : outstanding(state, intent.target!).length >= 2 || outstanding(state, intent.target!, intent.actor).length
                ? 'existing obligation takes precedence' : null),
    run: (state, intent) => {
      const sequence = state.economy.nextDebtSequence++;
      const debt = { id: `${state.day}-${state.watch}-${intent.actor}${intent.target}-${sequence}`, lender: intent.actor,
        borrower: intent.target!, principal: 4, remaining: 4, issuedDay: state.day, dueDay: state.day + 5, status: 'open' as const };
      body(state, intent.actor).cells -= 4;
      body(state, intent.target!).cells += 4;
      // Closed agreements remain in the archive and the most recent 50 in state.
      const paid = state.economy.debts.filter((entry) => entry.status === 'paid').slice(-49);
      state.economy.debts = [...state.economy.debts.filter((entry) => entry.status !== 'paid'), ...paid, debt];
      return social(state, intent, [['trust', 0, 2], ['debt', 0, 4]],
        (a, b) => `${a} lent ${b} 4 charge cells, due on day ${debt.dueDay}.`);
    },
  },
  repay: {
    name: 'repay', family: 'commitment',
    requires: (state, intent) => together(state, intent)
      ?? (!outstanding(state, intent.actor, intent.target).length ? 'nothing owed to this person'
        : body(state, intent.actor).cells < Math.min(2, outstanding(state, intent.actor, intent.target)[0]!.remaining)
          ? 'not enough cells to repay' : null),
    run: (state, intent) => {
      const debt = outstanding(state, intent.actor, intent.target)[0]!;
      const amount = Math.min(2, debt.remaining);
      body(state, intent.actor).cells -= amount;
      body(state, intent.target!).cells += amount;
      debt.remaining -= amount;
      if (debt.remaining === 0) debt.status = 'paid';
      return social(state, intent, [['debt', -amount, 0], ['trust', 0, 3], ['resentment', 0, -4]],
        (a, b) => `${a} repaid ${b} ${amount} charge cells; ${debt.remaining} still owed.`);
    },
  },
  trade: {
    name: 'trade', family: 'commitment',
    requires: (state, intent) => together(state, intent)
      ?? (body(state, intent.actor).cells < 2 ? 'cannot pay the repair fee'
        : state.economy.stock.materials < 1 ? 'no repair materials remain'
          : body(state, intent.target!).cells < 1 || body(state, intent.target!).condition.rested < 35
            ? 'provider lacks charge or strength for the repair'
            : body(state, intent.actor).condition.safe >= 65 && state.economy.maintenance >= 90 ? 'no repair needed'
              : !acceptsHelp(state, intent.actor, intent.target!) ? 'provider declines the repair' : null),
    run: (state, intent) => {
      const buyer = body(state, intent.actor), provider = body(state, intent.target!);
      buyer.cells -= 2;
      provider.cells += 1; // Receives 2; the repair actually consumes 1.
      state.economy.ledger.burned += 1;
      state.economy.stock.materials -= 1;
      state.economy.maintenance = Math.min(100, state.economy.maintenance + 8);
      condition(buyer, 'safe', 22);
      condition(provider, 'rested', -6);
      return social(state, intent, [['trust', 3, 1], ['admiration', 2, 0]],
        (a, b) => `${a} paid ${b} 2 cells for a repair; ${b} used 1 material and 1 cell.`);
    },
  },

  speak: {
    name: 'speak',
    family: 'talk',
    requires: together,
    run: (state, intent) => social(state, intent, [
      ['trust', 1, 1], ['affection', 1, 1],
    ], (a, b) => `${a} and ${b} spoke.`),
  },

  ask: {
    name: 'ask',
    family: 'talk',
    requires: together,
    run: (state, intent) => social(state, intent, [
      ['trust', 2, 1], ['admiration', 0, 2],
    ], (a, b) => `${a} asked ${b} something, and ${b} answered.`),
  },

  listen: {
    name: 'listen',
    family: 'talk',
    requires: together,
    run: (state, intent) => social(state, intent, [
      ['trust', 1, 3], ['affection', 1, 2],
    ], (a, b) => `${b} talked and ${a} listened.`),
  },

  joke: {
    name: 'joke',
    family: 'talk',
    requires: together,
    run: (state, intent) => social(state, intent, [
      ['affection', 3, 3], ['resentment', -2, -2],
    ], (a, b) => `${a} made ${b} laugh.`),
  },

  argue: {
    name: 'argue',
    family: 'talk',
    requires: together,
    run: (state, intent) => social(state, intent, [
      ['resentment', 5, 5], ['trust', -2, -2], ['admiration', 0, 1],
    ], (a, b) => `${a} and ${b} argued.`),
  },

  confide: {
    name: 'confide',
    family: 'talk',
    requires: (state, intent) => {
      const near = together(state, intent);
      if (near) return near;
      // You do not tell somebody something that matters unless you already
      // trust them, which is the whole reason it means anything when you do.
      const t = state.axes.get(`${intent.actor}${intent.target}`)!.trust;
      return t >= 55 ? null : 'not that close';
    },
    run: (state, intent) => { const fact = shareFact(state, intent); return social(state, intent, [
      ['trust', 4, 6], ['affection', 3, 4],
    ], (a, b) => `${a} spoke privately with ${b}${fact ? '; a specific confidence was shared' : ''}.`); },
  },

  flirt: {
    name: 'flirt', family: 'affection',
    requires: (state, intent) => together(state, intent)
      ?? (state.axes.get(`${intent.actor}${intent.target}`)!.desire < 20 ? 'actor feels no such interest'
        : state.axes.get(`${intent.target}${intent.actor}`)!.desire < 20 ? 'recipient does not return the interest' : null),
    run: (state, intent) => social(state, intent, [['desire', 2, 2], ['affection', 1, 1]],
      (a, b) => `${a} flirted with ${b}, who returned the interest.`),
  },

  greet: {
    name: 'greet',
    family: 'affection',
    requires: together,
    run: (state, intent) => social(state, intent, [['affection', 1, 1]],
      (a, b) => `${a} greeted ${b}.`),
  },

  accompany: {
    name: 'accompany',
    family: 'affection',
    requires: together,
    run: (state, intent) => social(state, intent, [
      ['affection', 2, 2], ['trust', 1, 1],
    ], (a, b) => `${a} sat with ${b} a while.`),
  },

  console: {
    name: 'console',
    family: 'affection',
    requires: (state, intent) => {
      const near = together(state, intent);
      if (near) return near;
      const t = body(state, intent.target!);
      const low = Math.min(t.condition.well, t.condition.accompanied, t.condition.safe);
      return low < 45 ? null : 'nothing the matter';
    },
    run: (state, intent) => {
      const out = social(state, intent, [
        ['affection', 3, 6], ['trust', 2, 5], ['debt', 0, 4],
      ], (a, b) => `${b} was in a bad way. ${a} stayed.`);
      const t = body(state, intent.target!);
      condition(t, 'safe', 12);
      condition(t, 'well', 6);
      return out;
    },
  },

  avoid: {
    name: 'avoid',
    family: 'affection',
    requires: together,
    run: (state, intent) => {
      nudge(state, intent.actor, intent.target!, 'affection', -2);
      nudge(state, intent.target!, intent.actor, 'resentment', 3);
      condition(body(state, intent.target!), 'accompanied', -4);
      return null;
    },
  },

  'seek out': {
    name: 'seek out',
    family: 'affection',
    requires: (state, intent) => {
      if (!intent.target) return 'nobody named';
      const a = body(state, intent.actor);
      const b = body(state, intent.target);
      if (a.room === b.room) return 'already there';
      return null;
    },
    run: (state, intent) => {
      const a = body(state, intent.actor);
      arrive(state, intent.actor, body(state, intent.target!).room);
      condition(a, 'rested', -0.2);
      nudge(state, intent.actor, intent.target!, 'affection', 1);
      return null;
    },
  },

  observe: {
    name: 'observe',
    family: 'knowledge',
    run: () => null,
  },

  note: {
    name: 'note',
    family: 'knowledge',
    requires: (state, intent) => (
      intent.actor === 'A' ? null : 'not their job, though nobody has said so'
    ),
    run: (state, intent) => { recordWork(state, intent.actor); return ({
      room: body(state, intent.actor).room,
      who: [intent.actor],
      text: 'The current store totals and working-room register were written down.',
      kind: 'note',
    }); },
  },

  teach: {
    name: 'teach',
    family: 'knowledge',
    requires: together,
    run: (state, intent) => { const fact = shareFact(state, intent); return social(state, intent, [
      ['admiration', 0, 5], ['trust', 2, 3], ['debt', 0, 3],
    ], (a, b) => fact ? `${a} taught ${b}: ${FACTS[fact]!.text}` : `${a} and ${b} reviewed a task together.`); },
  },
};

export const VERB_NAMES = CATALOGUE;

/** Try an intent. Refusals are returned rather than thrown, because a refused
 *  intent is information: somebody wanted something and the world said no, and
 *  that is exactly the kind of thing that should cost them a thought later. */
export function attempt(state: WorldState, intent: Intent): Outcome {
  const { actor, ...proposal } = intent;
  const decoded = decodeIntentFor(actor, proposal);
  if (!decoded.ok) return { ok: false, refused: decoded.error };
  const verb = VERBS[intent.verb];
  if (intent.fact && (!body(state, actor).knownFacts.some((fact) => fact.id === intent.fact)
    || (intent.verb === 'teach' && FACTS[intent.fact]!.private))) return { ok: false, refused: 'not authorized to share this knowledge' };
  const why = verb.requires?.(state, intent) ?? null;
  if (why) return { ok: false, refused: why };
  const cost = verb.cost ?? 0;
  const b = body(state, intent.actor);
  if (cost > 0 && b.cells < cost) return { ok: false, refused: 'not enough charge' };
  const before = economicAccounts(state);
  b.cells -= cost;
  state.economy.ledger.burned += cost;
  const happening = verb.run(state, intent);
  const transaction = recordEconomicChange(state, before, intent.verb, intent.actor);
  // A shared meal or task gives company without inventing a conversation,
  // changing trust, or using another resident's deliberate decision. Pair only
  // people who actually performed this activity in this room during this watch.
  if (transaction && (verb.family === 'work' || intent.verb === 'eat')) {
    const earlier = state.economy.events.filter((event) => event !== transaction && event.day === state.day && event.watch === state.watch);
    const paired = new Set(earlier.flatMap((event) => event.companions ?? []));
    const partner = !paired.has(intent.actor) && earlier.find((event) => event.action === intent.verb && event.room === b.room
      && event.actor && event.actor !== intent.actor && !paired.has(event.actor))?.actor;
    if (partner) {
      transaction.companions = [intent.actor, partner];
      condition(b, 'accompanied', 10); condition(body(state, partner), 'accompanied', 10);
    }
  }
  if (happening && !['inspect', 'note'].includes(intent.verb)) {
    remember(state, intent.actor, { kind: intent.verb, ...(intent.target ? { other: intent.target } : {}), outcome: happening.text });
    for (const participant of happening.who) if (participant !== intent.actor) remember(state, participant, { kind: intent.verb, other: intent.actor, outcome: happening.text });
  }
  return { ok: true, ...(happening ? { happening } : {}) };
}

/** What the actor can propose from their own resources and knowledge. A target
 * on this list has not consented; their actual response is evaluated at attempt. */
export function canPropose(state: WorldState, intent: Intent): boolean {
  const { actor, ...proposal } = intent;
  if (!decodeIntentFor(actor, proposal).ok) return false;
  if (!intent.target) return !VERBS[intent.verb].requires?.(state, intent);
  if (intent.target === actor) return false;
  const b = body(state, actor), own = state.axes.get(`${actor}${intent.target}`)!;
  switch (intent.verb) {
    case 'give': return b.cells >= 6;
    case 'lend': return b.cells >= 8 && own.trust >= 30;
    case 'repay': return outstanding(state, actor, intent.target).some((debt) => b.cells >= Math.min(2, debt.remaining));
    case 'trade': return b.cells >= 2 && state.economy.stock.materials >= 1;
    case 'confide': return own.trust >= 55;
    case 'flirt': return own.desire >= 20;
    default: return true;
  }
}
