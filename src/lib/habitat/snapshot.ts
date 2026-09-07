// What the window is allowed to see.
//
// The renderer never reads world state. It reads a snapshot: a small, flat,
// read-only description of where everybody is and what has just happened. That
// boundary exists so the simulation can move to a scheduler somewhere else without
// the frontend noticing, and so visiting the portfolio stays cheap.
//
// Until an engine exists, `genesisSnapshot` builds day one hundred straight from
// the authored content. It is deterministic — same seed, same habitat — so the
// view can be developed and tested against a fixed world.

import { mulberry32 } from './random';
import { isWalkable, type Point } from './grid';
import { ROOM_BY_ID, type RoomId } from './rooms';
import { RESIDENTS, type ResidentId } from './residents';

export type PersonState = {
  id: ResidentId;
  room: RoomId;
  /** Tile inside that room's own grid. */
  at: Point;
  /** A short, present-tense phrase. What a passer-by would say they were doing. */
  doing: string;
};

export type RoomState = {
  id: RoomId;
  occupants: readonly ResidentId[];
  /** Whether the lamps are on. Light costs power, and not every room gets it. */
  lit: boolean;
};

export type RecordEntry = {
  /** Minutes since the start of the day, so the record sorts without a clock. */
  minute: number;
  room: RoomId;
  who: readonly ResidentId[];
  text: string;
};

export type HabitatSnapshot = {
  /** Days since the crash. Advances one per real day. */
  day: number;
  /** The ship's inherited watch, one to four. */
  watch: 1 | 2 | 3 | 4;
  /** Reactor output as a fraction of what it made on the first day. It only falls. */
  power: number;
  rooms: readonly RoomState[];
  people: readonly PersonState[];
  /** The day's record so far. Dry, typed, true, and free to produce. */
  record: readonly RecordEntry[];
};

/** Where the triage's assignment puts somebody during a working watch. Several of
 *  these are people doing a job they were given rather than one they can do. */
const HOME_ROOM: Record<ResidentId, RoomId> = {
  A: 'records',
  B: 'hold',
  C: 'infirmary',
  D: 'dock',
  E: 'common',
  F: 'face',
  G: 'longwalk',
  H: 'common',
  I: 'administration',
  J: 'workshops',
  K: 'dispatch',
  L: 'hold',
  M: 'common',
  N: 'infirmary',
  O: 'well',
  P: 'common',
  Q: 'workshops',
  R: 'hold',
  S: 'common',
  T: 'common',
  U: 'infirmary',
  V: 'garden',
  W: 'workshops',
  X: 'face',
  Y: 'face',
};

const DOING: Record<ResidentId, string> = {
  A: 'writing the day down, and a little more than the day',
  B: 'counting what is left of something',
  C: 'reading the same frost-covered plate again',
  D: 'logging a suit back onto its rack',
  E: 'listening to two people who both think they are right',
  F: 'measuring how far the tunnel moved this week',
  G: 'running a hand along a seam she does not like',
  H: 'redrawing the roster nobody thanks him for',
  I: 'drawing a corridor she has walked eleven times',
  J: 'reading beside the workshop reactor, with her lips moving',
  K: 'recording the empty communication channels',
  L: 'sorting hull offcuts by a system only he understands',
  M: 'making sure the table gets laid properly',
  N: 'writing up a consultation nobody asked for',
  O: 'changing a filter, which is eleven from the end',
  P: 'proving bread with hands she is worried about',
  Q: 'finishing somebody else’s thing instead of his own',
  R: 'cataloguing crate ten before opening it',
  S: 'sitting where people pass, which is not a duty',
  T: 'counting cells and disliking the total',
  U: 'doing the work with somebody else’s name on it',
  V: 'resenting the two people sitting between her planters',
  W: 'saying nothing while the woman with the key learns',
  X: 'cutting rock, badly at first and then well',
  Y: 'drawing on a wall nobody has seen',
};

/** The first walkable tile of a room, walking its floor rows, offset so several
 *  people in one room do not stand on each other. */
function standingSpot(
  room: RoomId,
  index: number,
  rand: () => number,
  occupied: ReadonlySet<string>,
): Point {
  const { grid, legend } = ROOM_BY_ID[room];
  const spots: Point[] = [];
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < (grid[y]?.length ?? 0); x += 1) {
      // Somewhere you can stand, with something to stand on underneath.
      if (isWalkable(grid, legend, x, y) && !isWalkable(grid, legend, x, y + 1)) {
        spots.push({ x, y });
      }
    }
  }
  if (spots.length === 0) return { x: 1, y: 1 };
  const jitter = Math.floor(rand() * spots.length);
  const start = (index * 5 + jitter) % spots.length;
  for (let offset = 0; offset < spots.length; offset += 1) {
    const candidate = spots[(start + offset) % spots.length]!;
    if (!occupied.has(`${candidate.x}:${candidate.y}`)) return candidate;
  }
  throw new RangeError(`No unoccupied standing tile remains in ${room}`);
}

/** Day one hundred, built from the authored content. Deterministic. */
export function genesisSnapshot(seed = 1): HabitatSnapshot {
  const rand = mulberry32(seed);
  const perRoom = new Map<RoomId, number>();
  const occupied = new Map<RoomId, Set<string>>();

  const people: PersonState[] = RESIDENTS.map((r) => {
    const room = HOME_ROOM[r.id];
    const index = perRoom.get(room) ?? 0;
    perRoom.set(room, index + 1);
    const roomOccupied = occupied.get(room) ?? new Set<string>();
    occupied.set(room, roomOccupied);
    const at = standingSpot(room, index, rand, roomOccupied);
    roomOccupied.add(`${at.x}:${at.y}`);
    return { id: r.id, room, at, doing: DOING[r.id] };
  });

  const occupants = new Map<RoomId, ResidentId[]>();
  for (const p of people) {
    const list = occupants.get(p.room) ?? [];
    list.push(p.id);
    occupants.set(p.room, list);
  }

  const rooms: RoomState[] = Object.values(ROOM_BY_ID).map((room) => ({
    id: room.id,
    occupants: occupants.get(room.id) ?? [],
    // The Breach has no power and never will. Everywhere else somebody has run a
    // line, whether or not it was agreed.
    lit: room.id !== 'breach',
  }));

  return {
    day: 100,
    watch: 2,
    power: 0.94,
    rooms,
    people,
    record: GENESIS_RECORD,
  };
}

/** The hundredth day, as the engine would have emitted it: typed, dry and true. */
const GENESIS_RECORD: readonly RecordEntry[] = [
  {
    minute: 74, room: 'well', who: ['O'],
    text: 'Filter changed. Eleven remain.',
  },
  {
    minute: 132, room: 'common', who: ['P', 'S'],
    text: 'Two residents ate before the watch. They have done this eleven days running.',
  },
  {
    minute: 219, room: 'workshops', who: ['J', 'W'],
    text: 'Reactor output logged at 0.94 of first-day figure. Down 0.01 since day sixty.',
  },
  {
    minute: 301, room: 'workshops', who: ['Q', 'L'],
    text: 'Bay three contested for the fourth time. No procedure exists. Nothing decided.',
  },
  {
    minute: 388, room: 'garden', who: ['V', 'M', 'K'],
    text: 'Two residents sat between the planters for ninety minutes without working.',
  },
  {
    minute: 455, room: 'hold', who: ['R'],
    text: 'Crate nine opened and catalogued. Contents: fastenings, unlabelled. Forty-one remain.',
  },
  {
    minute: 502, room: 'records', who: ['A'],
    text: 'A margin note was added to the event record and left unsigned.',
  },
  {
    minute: 610, room: 'face', who: ['Y'],
    text: 'Marks added to the gallery wall. Unsigned. Nobody has been to see them.',
  },
  {
    minute: 688, room: 'infirmary', who: ['C'],
    text: 'Cold-bed survey resumed. Its occupant remains absent from every list.',
  },
  {
    minute: 741, room: 'bridge', who: ['X', 'S'],
    text: 'Two residents were at the port for an hour and said almost nothing.',
  },
];
