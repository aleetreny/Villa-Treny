// The world advancing.
//
// Four watches to a day, inherited from the ship. Inside a watch the engine does
// not run a script: it lets everybody act, and what comes out is whatever their
// bodies, their posts and the people standing next to them make likely. The
// record is emitted from state that actually changed, never from a description of
// something that was supposed to have happened.
//
// There is no model here and there is deliberately a hole where one goes. The
// `choose` function is the seam: today it is a routine policy that reads needs and
// proximity, and a scarce oracle will one day be asked for the same thing — a verb
// and a target — for whichever handful of people have the most pressure. Both
// answers go through `attempt`, which is what stops either of them from asserting
// a fact into the world.

import { ROOM_BY_ID, ROOMS, type RoomId } from '../rooms';
import { RESIDENTS, RESIDENT_BY_ID, type ResidentId } from '../residents';
import {
  CONDITIONS, POSTED, SLEEPS, between, bounded, streamFor,
  type Happening, type WorldState,
} from './state';
import { closeEconomyDay, outstanding, remember } from './economy';
import { attempt, decodeIntentFor, VERBS, type Intent, type VerbName, type Outcome } from './verbs';
import { PLANNABLE_VERBS, type PhysicalObservation, type PlannedAction } from '../society/types';

export type SocietyWatchOptions = {
  plans: Partial<Record<ResidentId, PlannedAction>>;
  /** An authored publication uses this same action slot. Its authority lives in
   * the society domain; it is deliberately not a renamed note/work verb. */
  publications?: Partial<Record<ResidentId, { intentId: string }>>;
  publishRecord?: (actor: ResidentId, intentId: string, world: WorldState) => Outcome;
  /** Called once per resident, with the pre-advance day/watch, after their real
   * action. The caller persists these observations with the resulting world. */
  onAction?: (observation: PhysicalObservation) => void;
};

/** How fast the five conditions fall over one watch, with nobody doing anything
 *  about them. Slow: these are meant to bite over days, not hours. */
const DECAY = {
  rested: 5, fed: 9, well: 0.6, safe: 1, accompanied: 5,
} as const satisfies Record<(typeof CONDITIONS)[number], number>;

/** Watch four is the one nobody is posted for. It is when the habitat is
 *  quietest, cheapest to run, and when the people who live at night are awake. */
const NIGHT = 4;

/** Watches two and three are when the habitat eats.
 *
 *  Not decoration, and not a convenience: without it the Dock is four watches
 *  from the only food in the habitat, so anybody posted there could either work
 *  or eat and not both, and the engine quietly starved them. A shared mealtime
 *  fixes the physics and is the truer model anyway — it is also what makes the
 *  Common the social heart, because it is the one thing that puts everybody in
 *  one room at the same time every single day. */
const MEALS = new Set([2, 3]);

/** What the reactor loses a day. Small, relentless, and the reason every argument
 *  about allocation will eventually get worse. */
const DECLINE = 0.00022;


/** What it costs to keep a room lit for a day. Surface spaces need no allocation
 *  while the Workshops power bay and the Well keep their inherited machinery. */
function upkeep(room: RoomId): number {
  if (ROOM_BY_ID[room].side === 'surface') return 0;
  if (room === 'well' || room === 'workshops') return 18;
  return 8;
}

/** A watch includes travel through the habitat; visual corridors are archived
 * artwork, not time or capacity constraints on a resident's agency. */
function stepToward(from: RoomId, to: RoomId): RoomId | null {
  return from === to || to === 'breach' ? null : to;
}

function personalRetreat(id: ResidentId): RoomId {
  const words = `${RESIDENT_BY_ID[id].wants} ${RESIDENT_BY_ID[id].was}`.toLowerCase();
  if (/music|song|dance/.test(words)) return 'salon';
  if (/book|read|history|write/.test(words)) return 'library';
  if (/plant|grow|garden/.test(words)) return 'winter';
  if (/family|home|child/.test(words)) return 'hearth';
  const rooms: RoomId[] = ['study', 'parlour', 'games', 'projection', 'sodabar', 'yard'];
  return rooms[(id.charCodeAt(0) - 65) % rooms.length]!;
}

/**
 * What somebody does with this watch.
 *
 * This is the seam. It reads only the state a person could actually perceive —
 * their own body, the room they are in, who is standing in it — and returns an
 * intent, which the engine is then free to refuse. When cognition arrives it
 * replaces this for the handful of people with the most pressure, and everybody
 * else keeps running on exactly this, for free.
 */
export function choose(state: WorldState, id: ResidentId, roll: () => number): Intent {
  const b = state.bodies[id];
  // People can arrange contact during a watch regardless of display position.
  const here = RESIDENTS.map((resident) => resident.id).filter((other) => other !== id);
  const stock = state.economy.stock;
  const night = state.watch === NIGHT;
  const toward = (room: RoomId, verb: VerbName): Intent => {
    const hop = stepToward(b.room, room);
    return hop ? { verb: 'go', actor: id, room: hop } : { verb, actor: id };
  };
  const feasible = (verb: VerbName, target?: ResidentId): Intent | undefined => {
    const intent: Intent = { verb, actor: id, ...(target ? { target } : {}) };
    return !VERBS[verb].requires?.(state, intent) && b.cells >= (VERBS[verb].cost ?? 0) ? intent : undefined;
  };
  // Hunger has an actual supply chain. An empty plate asks for production,
  // never an impossible 'eat' repeated indefinitely beside an empty store.
  const findFood = (): Intent => {
    if (stock.water < (stock.meals < 1 && stock.produce < 4 ? 2 : 1)) return toward('well', 'clean');
    if (stock.meals >= 1) return toward('common', b.cells >= 0.5 || b.condition.fed < 28 ? 'eat' : 'work');
    if (stock.produce >= 4) return toward('common', 'cook');
    return toward('garden', 'grow');
  };
  if (b.condition.fed < 18) return findFood();
  if (b.condition.rested < 15) return { verb: 'sleep', actor: id };
  if (b.condition.fed < 28) return findFood();
  // A six-hour night is enough to cross the entire connected habitat and sleep.
  // Health and reserve work must not trap somebody halfway home each night.
  if (night) return toward(SLEEPS[id], 'sleep');
  if (MEALS.has(state.watch) && b.condition.fed < 62) return findFood();
  if (b.condition.well < 42) return stock.water >= 2 ? toward('well', 'wash') : toward('well', 'clean');
  if (b.condition.rested < 35) return { verb: 'rest', actor: id };

  // A remembered agreement competes with a new conversation. A borrower first
  // seeks their lender once they can afford a partial repayment.
  const owed = outstanding(state, id).find((debt) => b.cells >= Math.min(2, debt.remaining) + 2);
  if (owed) {
    return { verb: 'repay', actor: id, target: owed.lender };
  }
  if (b.condition.safe < 45) {
    const provider = here.filter((other) => feasible('trade', other))
      .sort((a, c) => state.bodies[a].cells - state.bodies[c].cells)[0];
    if (provider) return { verb: 'trade', actor: id, target: provider };
    const repair = feasible('repair');
    if (repair) return repair;
    return { verb: 'rest', actor: id };
  }
  // Communal shortage is visible and actionable. Specialised posts normally
  // cover reserves; anybody can lend a hand when the reserve becomes critical.
  if (stock.water < 40) return toward('well', 'clean');
  if (stock.produce < 8) return stock.water >= 2 ? toward('garden', 'grow') : toward('well', 'clean');
  if (stock.meals < 24) return stock.produce >= 4 ? toward('common', 'cook') : findFood();
  if (stock.materials < 4) return toward('face', 'dig');

  const inNeed = here.filter((other) => state.bodies[other].cells < 4)
    .sort((a, c) => state.bodies[a].cells - state.bodies[c].cells);
  for (const other of inNeed) {
    // Affection favours a gift; a less close but trusted pair can agree a loan.
    const mine = state.axes.get(`${id}${other}`)!;
    const offer = mine.affection >= 45 ? feasible('give', other) : feasible('lend', other);
    if (offer) return offer;
  }
  const willing = here.filter((other) => feasible('accompany', other));
  if (b.condition.accompanied < 40 && willing.length) {
    return { verb: 'accompany', actor: id, target: pickCompany(state, id, willing, roll) };
  }
  const struggling = here.filter((other) => Math.min(state.bodies[other].condition.safe, state.bodies[other].condition.accompanied) < 28)
    .sort((a, c) => state.bodies[a].condition.safe - state.bodies[c].condition.safe)[0];
  if (struggling && feasible('console', struggling) && between(state, id, struggling) > 26) return { verb: 'console', actor: id, target: struggling };

  const stamp = state.day * 4 + state.watch - 1;
  if (b.plan && b.plan.untilWatch >= stamp) {
    if (b.room !== b.plan.room) return toward(b.plan.room, 'observe');
    return b.condition.rested < 65 ? { verb: 'rest', actor: id } : { verb: 'observe', actor: id };
  }
  // Once today's duty is covered, a personal visit is a choice with an actual
  // destination. Needs and outstanding agreements still take precedence.
  if (state.economy.workCredits[id] >= 2 && state.watch === 3) return toward(personalRetreat(id), 'rest');
  const post = POSTED[id];
  if (b.room !== post) return toward(post, 'work');
  // A duty produces only what can be stored and is actually needed.
  const byRoom: Partial<Record<RoomId, VerbName>> = {
    face: stock.materials < 28 ? 'dig' : 'work',
    garden: stock.produce < 64 ? 'grow' : 'work',
    common: stock.meals < 64 && stock.produce >= 4 ? 'cook' : 'work',
    workshops: state.economy.maintenance < 88 && feasible('repair') ? 'repair' : 'charge',
    well: stock.water < 120 ? 'clean' : 'work', infirmary: 'inspect', records: 'note',
  };
  const duty = byRoom[post] ?? 'work';
  // Scarce stock and actual repairs take precedence over idle conversation.
  if (duty !== 'work' && duty !== 'inspect' && duty !== 'note' && duty !== 'charge') {
    const intent = feasible(duty);
    if (intent) return intent;
  }
  if (willing.length && roll() < 0.36) {
    const conversation = talkTo(state, id, willing, roll);
    if (!VERBS[conversation.verb].requires?.(state, conversation)) return conversation;
  }
  return feasible(duty) ?? { verb: 'work', actor: id };
}

/** Who, out of the people in this room.
 *
 *  Weighted by what is already between them, but never simply the strongest:
 *  taking the maximum meant Gita talked to Quim every single evening for a
 *  fortnight and met nobody else, so the weave calcified on day one and the
 *  design's whole claim that bonds form was quietly false. The floor is what
 *  gives a stranger a chance. */
function pickCompany(
  state: WorldState, id: ResidentId, here: ResidentId[], roll: () => number,
): ResidentId {
  const weights = here.map((o) => 8 + between(state, id, o) ** 1.5 / 12);
  const total = weights.reduce((n, w) => n + w, 0);
  let draw = roll() * total;
  for (let i = 0; i < here.length; i += 1) {
    draw -= weights[i]!;
    if (draw <= 0) return here[i]!;
  }
  return here[here.length - 1]!;
}

/** Which of the people in this room, and in what register. What is already
 *  between two people decides the register, which is why the weave compounds. */
function talkTo(
  state: WorldState, id: ResidentId, here: ResidentId[], roll: () => number,
): Intent {
  const target = pickCompany(state, id, here, roll);
  const mine = state.axes.get(`${id}${target}`)!;
  const r = roll();
  if (mine.resentment > 55 && r < 0.5) return { verb: 'argue', actor: id, target };
  if (mine.trust >= 55 && r < 0.16) return { verb: 'confide', actor: id, target };
  if (state.axes.get(`${target}${id}`)!.admiration > 55 && r < 0.3) return { verb: 'teach', actor: id, target };
  if (mine.admiration > 55 && r < 0.3) return { verb: 'ask', actor: id, target };
  if (mine.affection > 50 && r < 0.5) return { verb: 'joke', actor: id, target };
  if (r < 0.3) return { verb: 'listen', actor: id, target };
  if (r < 0.55) return { verb: 'ask', actor: id, target };
  return { verb: 'speak', actor: id, target };
}

/** A short phrase for what somebody is doing, for the view to show. */
function doingFor(intent: Intent, ok: boolean): string {
  if (!ok) return 'at a loose end';
  switch (intent.verb) {
    case 'go': return 'on their way somewhere';
    case 'sleep': return 'asleep';
    case 'rest': return 'sitting down for a bit';
    case 'eat': return 'eating';
    case 'dig': return 'cutting rock';
    case 'grow': return 'in among the trays';
    case 'cook': return 'cooking';
    case 'charge': return 'at the racks';
    case 'give': return 'sharing a few charge cells';
    case 'lend': return 'agreeing a small loan';
    case 'repay': return 'returning borrowed cells';
    case 'trade': return 'paying for a repair';
    case 'work': return 'working at their post';
    case 'clean': return 'keeping the water and rooms usable';
    case 'wash': return 'washing and recovering';
    case 'inspect': return 'checking the room';
    case 'observe': return 'watching quietly';
    case 'repair': return 'fixing something';
    case 'note': return 'writing something down';
    case 'console': return 'sitting with somebody who needs it';
    case 'argue': return 'in the middle of an argument';
    case 'confide': return 'saying something they have not said before';
    default: return 'talking';
  }
}

function assertCognitionActor(state: WorldState, cognition?: Readonly<Intent>): void {
  if (cognition
    && !Object.prototype.hasOwnProperty.call(state.bodies, cognition.actor)) {
    throw new TypeError(`Unknown cognition actor: ${String(cognition.actor)}`);
  }
}

function assertSocietyActors(state: WorldState, society?: SocietyWatchOptions): void {
  for (const [actor, step] of Object.entries(society?.plans ?? {})) {
    if (!step || !Object.hasOwn(state.bodies, actor) || step.intent.actor !== actor) throw new TypeError('Invalid planned actor');
    const { actor: subject, ...raw } = step.intent;
    if (!decodeIntentFor(subject, raw).ok || !(PLANNABLE_VERBS as readonly string[]).includes(raw.verb)) throw new TypeError('Invalid planned action');
  }
  for (const [actor, publication] of Object.entries(society?.publications ?? {})) {
    if (!publication || !Object.hasOwn(state.bodies, actor) || !publication.intentId || !society?.publishRecord) {
      throw new TypeError('Invalid publication action');
    }
  }
}

const NEGOTIATED_ROUTINES = new Set<VerbName>(['give', 'lend', 'trade', 'speak', 'ask', 'listen', 'joke', 'argue', 'confide', 'greet', 'flirt', 'teach']);
/** The old policy remains available to legacy callers. With independent minds,
 * it cannot invent dialogue or accept a financial exchange for a second actor. */
function routineFor(state: WorldState, id: ResidentId, roll: () => number, society?: SocietyWatchOptions): Intent {
  const proposed = choose(state, id, roll);
  if (!society || !NEGOTIATED_ROUTINES.has(proposed.verb)) return proposed;
  if (proposed.verb === 'trade' && !VERBS.repair.requires?.(state, { actor: id, verb: 'repair' })) return { actor: id, verb: 'repair' };
  return { actor: id, verb: state.bodies[id].condition.rested < 60 ? 'rest' : 'observe' };
}

/** Plan travel follows the authored topology. All hops fit within the existing
 * six-hour watch; crossing an opening is not another productive work action. */
function travelForPlan(state: WorldState, actor: ResidentId, destination: RoomId): Outcome {
  const start = state.bodies[actor].room;
  if (destination === 'breach' || !Object.hasOwn(ROOM_BY_ID, destination)) return { ok: false, refused: 'planned destination is inaccessible' };
  if (start === destination) return { ok: true };
  const queue: RoomId[] = [start], previous = new Map<RoomId, RoomId | null>([[start, null]]);
  for (let i = 0; i < queue.length && !previous.has(destination); i += 1) {
    for (const next of ROOM_BY_ID[queue[i]!].connects) {
      if (next === 'breach' || previous.has(next)) continue;
      previous.set(next, queue[i]!); queue.push(next);
    }
  }
  if (!previous.has(destination)) return { ok: false, refused: 'no connected route to planned destination' };
  const path: RoomId[] = [];
  for (let room: RoomId | null = destination; room !== start; room = previous.get(room!)!) path.unshift(room!);
  for (const room of path) {
    const moved = attempt(state, { actor, verb: 'go', room });
    if (!moved.ok) return moved;
  }
  return { ok: true };
}

function urgentPlanInterruption(state: WorldState, actor: ResidentId): string | undefined {
  const c = state.bodies[actor].condition;
  if (c.fed < 18) return 'Critical hunger requires food or its missing supplies';
  if (c.rested < 15) return 'Exhaustion requires sleep';
  if (c.fed < 28) return 'Hunger requires food or its missing supplies';
  if (c.well < 20) return 'Poor health requires washing or clean water';
  return undefined;
}

/** One watch. Everybody acts once, in an order that changes with the day so
 *  nobody is permanently first through the door. */
export function advanceWatch(
  state: WorldState, cognition?: Readonly<Intent>, attemptedActor?: ResidentId, onDecision?: (outcome: Outcome) => void,
  society?: SocietyWatchOptions,
): WorldState {
  assertCognitionActor(state, cognition);
  assertSocietyActors(state, society);
  const roll = streamFor(state, 7);
  const order = RESIDENTS.map(({ id }) => ({ id, priority: state.bodies[id].pressure + roll() * 40 }))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .map(({ id }) => id);

  if (cognition) { order.splice(order.indexOf(cognition.actor), 1); order.unshift(cognition.actor); }
  if (attemptedActor ?? cognition?.actor) {
    const subject = state.bodies[(attemptedActor ?? cognition!.actor)];
    subject.lastAttemptWatch = state.day * 4 + state.watch - 1;
  }
  const emitted: Happening[] = [];
  let slot = 0;
  for (const id of order) {
    // A watch is six hours and the habitat is a hundred and twenty-six metres
    // long. Walking to the next room is minutes, not a shift — so a person gets
    // to reach where they are going and then do something there. Charging a
    // whole watch per doorway collapsed the place into a commute: everybody
    // spent every watch in transit and nobody ever arrived at their post.
    const planned = society?.plans[id];
    const publication = society?.publications?.[id];
    const interrupted = planned || publication ? urgentPlanInterruption(state, id) : undefined;
    if (publication && !interrupted) {
      // Branch before ordinary actions: publication cannot also earn routine
      // labour, consume repair materials, or complete a different planned step.
      const result = society!.publishRecord!(id, publication.intentId, state);
      const body = state.bodies[id];
      body.doing = result.ok ? 'publishing an authored record' : 'unable to publish the intended record';
      body.pressure = bounded(body.pressure + (result.ok ? -1 : 6));
      if (body.plan && body.plan.untilWatch < state.day * 4 + state.watch - 1) body.plan = null;
      emitted.push(result.happening ? { ...result.happening, day: state.day, watch: state.watch,
        minute: (state.watch - 1) * 360 + Math.floor((slot / order.length) * 340) + 8 }
        : { day: state.day, watch: state.watch, minute: (state.watch - 1) * 360 + Math.floor((slot / order.length) * 340) + 8,
          room: body.room, who: [id], kind: 'note', text: result.ok ? `${RESIDENT_BY_ID[id].name.split(' ')[0]} published an authored record.`
            : `${RESIDENT_BY_ID[id].name.split(' ')[0]} could not publish the intended record: ${result.refused ?? 'unavailable'}.` });
      slot += 1;
      continue;
    }
    const injected = !planned && !publication && cognition?.actor === id ? cognition : undefined;
    let intent: Intent = planned && !interrupted ? { ...planned.intent } : injected ? { ...injected } : routineFor(state, id, roll, society);
    let outcome: Outcome;
    if (planned && !interrupted) {
      const destination = intent.verb === 'go' ? intent.room : planned.at;
      outcome = destination ? travelForPlan(state, id, destination) : { ok: true };
      if (outcome.ok && intent.verb !== 'go') outcome = attempt(state, intent);
      else if (!intent.room && intent.verb === 'go') outcome = { ok: false, refused: 'nowhere named' };
    } else if ((planned || publication) && interrupted?.startsWith('Poor health')) {
      intent = { actor: id, verb: state.economy.stock.water >= 2 ? 'wash' : 'clean' };
      outcome = travelForPlan(state, id, 'well');
      if (outcome.ok) outcome = attempt(state, intent);
    } else outcome = attempt(state, intent);
    for (let hops = 0; !injected && (!planned || interrupted) && hops < ROOMS.length && outcome.ok && intent.verb === 'go'; hops += 1) {
      intent = routineFor(state, id, roll, society);
      outcome = attempt(state, intent);
    }
    const b = state.bodies[id];
    society?.onAction?.({ actor: id, day: state.day, watch: state.watch, intent: { ...intent }, outcome: structuredClone(outcome),
      actualRoom: b.room, ...(planned ? { stepId: planned.stepId } : {}), ...(interrupted ? { interrupted } : {}) });
    // A thought happened even when the world refused what it proposed.
    if (injected) {
      b.thoughtOn = state.day;
      b.lastThoughtWatch = state.day * 4 + state.watch - 1;
      b.lastAttemptWatch = b.lastThoughtWatch;
      if (outcome.ok && intent.verb === 'go' && intent.room) b.plan = { room: intent.room, untilWatch: b.lastThoughtWatch + 2, reason: 'deliberate visit' };
      onDecision?.(outcome);
    }
    if (b.plan && b.plan.untilWatch < state.day * 4 + state.watch - 1) b.plan = null;
    if (!outcome.ok) remember(state, id, { kind: intent.verb, ...(intent.target ? { other: intent.target } : {}), outcome: outcome.refused ?? 'refused' });
    if ((injected || planned) && !outcome.ok) emitted.push({ day: state.day, watch: state.watch, minute: (state.watch - 1) * 360 + 1,
      room: b.room, who: [id], kind: 'note', text: `${RESIDENT_BY_ID[id].name.split(' ')[0]} tried ${intent.verb}: ${outcome.refused ?? 'refused'}.` });
    if (interrupted) emitted.push({ day: state.day, watch: state.watch, minute: (state.watch - 1) * 360 + 2,
      room: b.room, who: [id], kind: 'note', text: `${RESIDENT_BY_ID[id].name.split(' ')[0]}'s planned activity was interrupted: ${interrupted.toLowerCase()}.` });
    b.doing = doingFor(intent, outcome.ok);
    // A world that says no to somebody is a world they have to think about.
    b.pressure = bounded(b.pressure + (outcome.ok ? -1 : 6));
    if (outcome.happening) {
      emitted.push({
        ...outcome.happening,
        day: state.day,
        watch: state.watch,
        minute: (state.watch - 1) * 360 + Math.floor((slot / order.length) * 340) + 8,
      });
    }
    slot += 1;
  }

  // Bodies run down whatever anybody did about it.
  for (const r of RESIDENTS) {
    const b = state.bodies[r.id];
    for (const key of CONDITIONS) {
      b.condition[key] = bounded(b.condition[key] - DECAY[key]);
    }
    if (b.condition.fed < 18 || b.condition.rested < 12) {
      b.condition.well = bounded(b.condition.well - 3);
      b.pressure = bounded(b.pressure + 5);
    }
  }

  state.record.push(...emitted.sort((a, b) => a.minute - b.minute));
  state.watch += 1;
  return state;
}

/** Close a completed fourth watch: power, light and charge are daily books, not
 *  another action. Both the batch runner and the scheduler use this exact path. */
function closeDay(state: WorldState): void {
  // The reactor makes less than it did yesterday, and it will make less again.
  state.reactor.output = Math.max(0, state.reactor.output - DECLINE);
  const budget = Math.round(state.reactor.output * 1000);

  // Rooms are lit in the order they are needed, until the budget runs out. The
  // last ones on the list go dark, and nobody has agreed what the order is.
  const priority: RoomId[] = [
    'well', 'common', 'kitchen', 'stalls', 'washroom',
    'administration', 'dispatch', 'archive', 'records',
    'study', 'sparebedroom', 'parlour', 'projection', 'winter',
    'games', 'infirmary', 'workshops', 'maintenance',
    'row', 'longwalk',
    'camp', 'garden', 'sheltergate', 'yard',
    // Homes share the reactor allocation, after the essential common spaces.
    'dig1', 'dig2', 'dig3', 'dig4', 'dig5', 'dig6',
    'cabin1', 'cabin2', 'cabin3', 'cabin4', 'cabin5',
    'hold', 'dock', 'bridge', 'face',
  ];
  let left = budget;
  const wentDark: RoomId[] = [];
  for (const id of Object.keys(state.rooms) as RoomId[]) state.rooms[id].lit = false;
  // New catalogue rooms must never be omitted from the allocator.
  for (const id of [...priority, ...ROOMS.map((room) => room.id).filter((id) => id !== 'breach' && !priority.includes(id))]) {
    const cost = upkeep(id);
    if (left >= cost) { left -= cost; state.rooms[id].lit = true; } else wentDark.push(id);
  }
  state.rooms.breach.lit = false;

  // What is left over is minted as charge and goes to whoever worked. Cells leak,
  // so nobody's pile is a plan.
  closeEconomyDay(state, left);
  for (const { id } of RESIDENTS) {
    const b = state.bodies[id];
    b.pressure = bounded(b.pressure + (state.day - b.thoughtOn > 3 ? 4 : 0));
  }

  state.record.push({
    day: state.day, watch: 4, minute: 1430,
    room: 'workshops', who: ['J'],
    text: `Reactor at ${state.reactor.output.toFixed(4)} of first-day output.`
      + (wentDark.length ? ` ${wentDark.length} rooms unlit for want of power.` : ''),
    kind: 'power',
  });

  state.record.sort((a, b) => a.minute - b.minute);
  state.day += 1;
  state.watch = 1;
}

/** Advance exactly one scheduled watch, closing the books after watch IV.
 *
 * Unlike `advanceWatch`, this is a clock primitive: the previous day's record is
 * cleared when watch I begins and completing watch IV rolls the world forward. */
export function advanceScheduledWatch(
  state: WorldState, cognition?: Readonly<Intent>, attemptedActor?: ResidentId, onDecision?: (outcome: Outcome) => void,
  society?: SocietyWatchOptions,
): WorldState {
  assertCognitionActor(state, cognition);
  assertSocietyActors(state, society);
  if (!Number.isInteger(state.watch) || state.watch < 1 || state.watch > NIGHT) {
    throw new RangeError(`Cannot schedule invalid watch ${state.watch}`);
  }
  if (state.watch === 1) { state.record = []; state.economy.events = []; }
  advanceWatch(state, cognition, attemptedActor, onDecision, society);
  if (state.watch === NIGHT + 1) closeDay(state);
  return state;
}

/** One day: four watches, then the books. */
export function advanceDay(state: WorldState): WorldState {
  state.record = [];
  state.economy.events = [];
  state.watch = 1;
  for (let i = 0; i < 4; i += 1) advanceWatch(state);
  closeDay(state);
  return state;
}

/** Run a stretch of days, keeping every day's record rather than only the last.
 *  Used for burn-in and for tests; the live world keeps one day in memory. */
export function run(state: WorldState, days: number): { state: WorldState; log: Happening[] } {
  const log: Happening[] = [];
  for (let i = 0; i < days; i += 1) {
    advanceDay(state);
    log.push(...state.record);
  }
  return { state, log };
}
