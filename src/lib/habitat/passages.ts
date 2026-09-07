import { ROOM_BY_ID, type RoomId } from './rooms';
import { isWalkable, type Point, type RoomLegend } from './grid';

export type PassageId = 'climb' | 'longwalk' | 'throat' | 'landing' | 'cut' | 'greenrun';

export type PassageExit = {
  room: RoomId;
  at: Point;
  /** Existing doorway in the adjoining room's own grid. */
  roomAt?: Point;
  sealed?: boolean;
};

export type Passage = {
  id: PassageId;
  name: string;
  /** The exact local floor an agent crosses while using this passage. */
  grid: readonly string[];
  exits: readonly PassageExit[];
};

/**
 * Physical passages between existing rooms. The Climb and Throat are named spans
 * between two rooms; the Long Walk is large enough to be a room in its own
 * right, so its grid is the same authored grid the engine already exposes.
 */
export const PASSAGES: readonly Passage[] = [
  {
    id: 'climb',
    name: 'The Climb',
    grid: [
      '##+##',
      '##^##',
      '##^##',
      '##^##',
      '##^##',
      '##v##',
      '##v##',
      '##v##',
      '##+##',
    ],
    exits: [
      { room: 'bridge', at: { x: 2, y: 0 } },
      { room: 'dock', at: { x: 2, y: 8 } },
    ],
  },
  {
    id: 'longwalk',
    name: 'The Long Walk',
    grid: ROOM_BY_ID.longwalk.grid,
    exits: [
      { room: 'dock', at: { x: 2, y: 0 } },
      { room: 'cabin1', at: { x: 0, y: 2 } },
      { room: 'cabin2', at: { x: 0, y: 10 } },
      { room: 'cabin4', at: { x: 4, y: 10 } },
      { room: 'cabin3', at: { x: 0, y: 18 } },
      { room: 'cabin5', at: { x: 4, y: 18 } },
      { room: 'breach', at: { x: 0, y: 25 }, sealed: true },
      { room: 'hold', at: { x: 2, y: 26 } },
    ],
  },
  {
    id: 'throat',
    name: 'The Throat',
    grid: [
      '##########',
      '###====###',
      '+========+',
      '#========#',
      '###====###',
      '##########',
    ],
    exits: [
      { room: 'infirmary', at: { x: 0, y: 2 } },
      { room: 'workshops', at: { x: 9, y: 2 } },
    ],
  },
  {
    id: 'landing',
    name: 'The Landing',
    grid: [
      '############',
      '############',
      '############',
      '+==========+',
      '#==========#',
      '#==###=====#',
      '############',
    ],
    exits: [
      { room: 'workshops', at: { x: 0, y: 3 }, roomAt: { x: 0, y: 5 } },
      { room: 'common', at: { x: 11, y: 3 }, roomAt: { x: 0, y: 7 } },
    ],
  },
  {
    id: 'cut',
    name: 'The Cut',
    grid: [
      '##########',
      '##########',
      '#========#',
      '+========+',
      '#========#',
      '##########',
    ],
    exits: [
      { room: 'common', at: { x: 0, y: 3 }, roomAt: { x: 11, y: 1 } },
      { room: 'administration', at: { x: 9, y: 3 }, roomAt: { x: 3, y: 8 } },
    ],
  },
  {
    id: 'greenrun',
    name: 'The Green Run',
    grid: [
      '############',
      '############',
      '#==========#',
      '+==========+',
      '#==##===##=#',
      '############',
    ],
    exits: [
      { room: 'garden', at: { x: 0, y: 3 }, roomAt: { x: 2, y: 0 } },
      { room: 'sheltergate', at: { x: 11, y: 3 }, roomAt: { x: 3, y: 0 } },
    ],
  },
];

export const PASSAGE_BY_ID: Record<PassageId, Passage> = Object.fromEntries(
  PASSAGES.map((passage) => [passage.id, passage]),
) as Record<PassageId, Passage>;

export function passageForLink(a: RoomId, b: RoomId): PassageId | null {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (key === 'bridge|dock') return 'climb';
  if (key === 'infirmary|workshops') return 'throat';
  if (key === 'common|workshops') return 'landing';
  if (key === 'administration|common') return 'cut';
  if (key === 'garden|sheltergate') return 'greenrun';
  if (a === 'longwalk' || b === 'longwalk') return 'longwalk';
  return null;
}

/** A completed passage crossing can be replayed without inventing a RoomId. */
export type PassageMovement = {
  passage: PassageId;
  from: RoomId;
  to: RoomId;
  /** Includes the resident's starting tile and the existing room doorway. */
  approach: readonly Point[];
  /** Includes both thresholds; consecutive cells share an edge. */
  cells: readonly Point[];
  /** Existing doorway in the destination room. */
  arrival: Point;
};

/** Shortest four-direction route; solid objects and sealed doors are impassable. */
export function walkingPath(
  grid: readonly string[], legend: RoomLegend, from: Point, to: Point,
): Point[] | null {
  if (!isWalkable(grid, legend, from.x, from.y)
    || !isWalkable(grid, legend, to.x, to.y)) return null;
  const key = (point: Point) => `${point.x},${point.y}`;
  const queue = [from];
  const previous = new Map<string, Point | null>([[key(from), null]]);
  for (let index = 0; index < queue.length; index += 1) {
    const here = queue[index]!;
    if (here.x === to.x && here.y === to.y) {
      const path = [here];
      let before = previous.get(key(here));
      while (before) {
        path.push(before);
        before = previous.get(key(before));
      }
      return path.reverse();
    }
    for (const next of [
      { x: here.x + 1, y: here.y }, { x: here.x - 1, y: here.y },
      { x: here.x, y: here.y + 1 }, { x: here.x, y: here.y - 1 },
    ]) {
      if (previous.has(key(next)) || !isWalkable(grid, legend, next.x, next.y)) continue;
      previous.set(key(next), here);
      queue.push(next);
    }
  }
  return null;
}

/** Only passages with authored room thresholds opt into cell-based movement. */
export function hasPassageMovement(from: RoomId, to: RoomId): boolean {
  const id = passageForLink(from, to);
  if (!id) return false;
  const exits = PASSAGE_BY_ID[id].exits;
  return exits.some((exit) => exit.room === from && exit.roomAt)
    && exits.some((exit) => exit.room === to && exit.roomAt);
}

export function planPassageMovement(
  from: RoomId, to: RoomId, at: Point,
): PassageMovement | null {
  if (!ROOM_BY_ID[from].connects.includes(to) || !ROOM_BY_ID[to].connects.includes(from)) return null;
  const id = passageForLink(from, to);
  if (!id) return null;
  const passage = PASSAGE_BY_ID[id];
  const entry = passage.exits.find((exit) => exit.room === from && !exit.sealed);
  const exit = passage.exits.find((item) => item.room === to && !item.sealed);
  if (!entry?.roomAt || !exit?.roomAt) return null;
  const room = ROOM_BY_ID[from];
  const destination = ROOM_BY_ID[to];
  if (room.grid[entry.roomAt.y]?.[entry.roomAt.x] !== '+'
    || destination.grid[exit.roomAt.y]?.[exit.roomAt.x] !== '+') return null;
  const approach = walkingPath(room.grid, room.legend, at, entry.roomAt);
  const cells = walkingPath(passage.grid, {}, entry.at, exit.at);
  if (!approach || !cells) return null;
  return { passage: id, from, to, approach, cells, arrival: { ...exit.roomAt } };
}
