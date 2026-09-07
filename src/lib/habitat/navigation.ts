import { isWalkable, type Point } from './grid';
import { ROOM_BY_ID, type RoomId } from './rooms';

/** Explorer scenes do not add rooms to the simulation's authored RoomId union. */
export type CorridorId =
  | 'spine' | 'greenrun' | 'longwalk' | 'landing' | 'cut' | 'quietwalk'
  | 'gallery' | 'servicewalk' | 'utilityrun' | 'row';
export type SceneId = `room:${RoomId}` | `corridor:${CorridorId}`;
export type Direction = 'north' | 'east' | 'south' | 'west';
export type NavigationGroup =
  | 'spine' | 'surface' | 'hull' | 'commons' | 'office' | 'midcentury'
  | 'heritage' | 'diner' | 'utility' | 'diggings';

export type NavigationExit = {
  id: string;
  /** The last walkable cell. Changing scenes requires stepping beyond this edge. */
  at: Point;
  outward: Direction;
  to: SceneId;
  /** An interior cell, so arriving never immediately sends somebody back. */
  arrival: Point;
  /** Index of the destination/source room's opening, for rooms with partitions. */
  entranceIndex?: number;
  /** Shared physical boundary on the map, independent of either raster's scale. */
  mapAt: Point;
  /** Washroom's second access shifts +24px to keep a wall between hall openings. */
  mapAdjustmentPx?: number;
};

export type NavigationScene = {
  id: SceneId;
  kind: 'room' | 'corridor';
  name: string;
  roomId?: RoomId;
  corridorId?: CorridorId;
  group: NavigationGroup;
  /** Rectangles share boundaries only: no room sits on another room or passage. */
  map: { x: number; y: number; w: number; h: number };
  cellSize: number;
  /** '.' is open floor; '#' is a wall or an object's actual footprint. */
  grid: readonly string[];
  exits: readonly NavigationExit[];
  props?: readonly { crop: 'crate'; at: Point }[];
  sections?: readonly { name: string; from: number; to: number }[];
  sealed?: boolean;
};

export type NavigationState = { sceneId: SceneId; cell: Point };
export type NavigationNetwork = {
  scenes: readonly NavigationScene[];
  start: NavigationState;
};

export type RoomNavigationMask = {
  width?: number;
  height?: number;
  grid: readonly string[];
  cellSize: number;
  exit: Point;
  spawn: Point;
  outward?: 'north' | 'south';
  /** Some approved rasters contain separate interiors with separate openings. */
  exits?: readonly (({ at: Point } | Point) & { arrival: Point })[];
};

type Wing = {
  id: Exclude<CorridorId, 'spine'>;
  name: string;
  group: Exclude<NavigationGroup, 'spine'>;
  rooms: readonly RoomId[];
  existingRoom?: 'longwalk' | 'row';
};

/**
 * Each family opens onto one modest hall; bedrooms are never thoroughfares.
 * All interior halls use the same ship materials. The family-specific art is
 * confined to their openings, while the surface path keeps its outdoor terrain.
 * This exploration topology does not rewrite the simulation's room adjacency.
 */
export const NAVIGATION_WINGS: readonly Wing[] = [
  {
    id: 'greenrun', name: 'The Green Run', group: 'surface',
    rooms: ['camp', 'garden', 'sheltergate', 'yard', 'graveyard'],
  },
  {
    id: 'longwalk', name: 'The Long Walk', group: 'hull', existingRoom: 'longwalk',
    rooms: ['bridge', 'dock', 'cabin1', 'cabin2', 'cabin3', 'cabin4', 'cabin5', 'hold', 'infirmary', 'breach'],
  },
  {
    id: 'landing', name: 'The Landing', group: 'commons',
    rooms: ['workshops', 'common', 'games', 'maintenance'],
  },
  {
    id: 'cut', name: 'The Cut', group: 'office',
    rooms: ['administration', 'dispatch', 'archive', 'records'],
  },
  {
    id: 'quietwalk', name: 'The Quiet Walk', group: 'midcentury',
    rooms: ['study', 'sparebedroom', 'parlour', 'projection', 'winter'],
  },
  {
    id: 'gallery', name: 'The Gallery', group: 'heritage',
    rooms: ['library', 'grandbedroom', 'salon', 'hearth'],
  },
  {
    id: 'servicewalk', name: 'The Service Walk', group: 'diner',
    rooms: ['kitchen', 'servicecounter', 'maindiner', 'sodabar'],
  },
  {
    id: 'utilityrun', name: 'The Utility Run', group: 'utility',
    rooms: ['well', 'stalls', 'washroom'],
  },
  {
    id: 'row', name: 'The Row', group: 'diggings', existingRoom: 'row',
    rooms: ['dig1', 'dig2', 'dig3', 'dig4', 'dig5', 'dig6', 'face'],
  },
];

export const DIRECTION_VECTOR: Readonly<Record<Direction, Point>> = {
  north: { x: 0, y: -1 }, east: { x: 1, y: 0 },
  south: { x: 0, y: 1 }, west: { x: -1, y: 0 },
};

const SPINE_WIDTH = 7;
const HALL_HEIGHT = 7;

function openRectangle(width: number, height: number): string[][] {
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (
    x > 0 && x < width - 1 && y > 0 && y < height - 1 ? '.' : '#'
  )));
}

function strings(grid: readonly (readonly string[])[]): string[] {
  return grid.map((row) => row.join(''));
}

/**
 * Semantic fallback used by tests/export before the actual room raster loads.
 * The browser replaces this with the room-art mask, including every floor pixel
 * and every solid sprite footprint. It is never drawn over the approved artwork.
 */
function fallbackRoomMask(id: RoomId): RoomNavigationMask {
  const room = ROOM_BY_ID[id];
  const width = room.grid[0]!.length;
  const height = room.grid.length;
  const grid = room.grid.map((row, y) => [...row].map((_, x) => (
    x > 0 && x < width - 1 && y > 0 && y < height - 1
      && isWalkable(room.grid, room.legend, x, y) ? '.' : '#'
  )));
  // The semantic Well has water across its lower edge; its fallback therefore
  // uses the clear upper approach. The audited raster supplies its real exit.
  const outward = id.startsWith('cabin') || !grid[height - 2]!.includes('.') ? 'north' : 'south';
  const edgeY = outward === 'north' ? 0 : height - 1;
  const insideY = outward === 'north' ? 1 : height - 2;
  const candidates = Array.from({ length: width - 2 }, (_, x) => x + 1)
    .filter((x) => grid[insideY]![x] === '.')
    .sort((a, b) => Math.abs(a - width / 2) - Math.abs(b - width / 2));
  // A fallback need not move an object. A room with no clear lower edge waits
  // for its audited art mask rather than silently cutting a path through it.
  const x = candidates[0] ?? Math.floor(width / 2);
  grid[edgeY]![x] = grid[insideY]![x]!;
  const exits = [x, ...(id === 'washroom' ? [candidates.find((candidate) => candidate !== x) ?? x] : [])]
    .sort((a, b) => a - b)
    .map((openingX) => {
      grid[edgeY]![openingX] = grid[insideY]![openingX]!;
      return { x: openingX, y: edgeY, arrival: { x: openingX, y: insideY } };
    });
  return {
    grid: strings(grid), cellSize: 32, outward, exits,
    exit: { x: exits[0]!.x, y: edgeY }, spawn: { ...exits[0]!.arrival },
  };
}

function openings(mask: RoomNavigationMask): readonly { x: number; y: number; arrival: Point }[] {
  return mask.exits?.length
    ? mask.exits.map((exit) => ({ ...('at' in exit ? exit.at : exit), arrival: exit.arrival }))
    : [{ ...mask.exit, arrival: mask.spawn }];
}

/** Build the same geometry used by movement, rendering and the persistent map. */
export function createHabitatNavigation(
  masks: Partial<Record<RoomId, RoomNavigationMask>> = {},
): NavigationNetwork {
  let previousBottom = 0;
  let previousBelow = 0;
  const preparedWings = NAVIGATION_WINGS.map((wing) => {
    let nextLeft = 2;
    const prepared = wing.rooms.map((id) => {
      const mask = masks[id] ?? fallbackRoomMask(id);
      const roomOpenings = openings(mask);
      const count = Math.max(id === 'washroom' ? 2 : 1, roomOpenings.length);
      const outward = mask.outward ?? (mask.exit.y === 0 ? 'north' : 'south');
      const belowHall = outward === 'north';
      const roomWidth = (mask.width ?? mask.grid[0]!.length * mask.cellSize) / 32;
      const roomHeight = (mask.height ?? mask.grid.length * mask.cellSize) / 32;
      const firstOpening = roomOpenings[0]!;
      const firstOffset = (firstOpening.x + 0.5) * mask.cellSize / 32;
      const firstX = Math.ceil(nextLeft + firstOffset - 0.5);
      const left = firstX + 0.5 - firstOffset;
      const openingXs: number[] = [];
      for (let index = 0; index < count; index += 1) {
        const opening = roomOpenings[index] ?? firstOpening;
        const aligned = firstX + Math.round((opening.x - firstOpening.x) * mask.cellSize / 32);
        // Washroom contains two separate interiors. Keep the two destinations
        // visibly separate in their hall: a wall tile must divide its openings.
        // Its 40px raster spacing therefore becomes 64px, a measured +24px
        // perspective adjustment at the second scene transition, not a route
        // through the partition or a new room.
        openingXs.push(index === 0 ? aligned : Math.max(aligned, openingXs[index - 1]! + 2));
      }
      nextLeft = left + roomWidth + 2;
      return { id, mask, roomOpenings, count, outward, belowHall, roomWidth, roomHeight, left, openingXs };
    });
    const above = Math.max(0, ...prepared.filter((room) => !room.belowHall).map((room) => room.roomHeight));
    const below = Math.max(0, ...prepared.filter((room) => room.belowHall).map((room) => room.roomHeight));
    const y = Math.ceil(previousBottom + previousBelow + 2 + above);
    previousBottom = y + HALL_HEIGHT;
    previousBelow = below;
    return { wing, prepared, y, width: Math.ceil(nextLeft) };
  });
  const spineY = preparedWings[0]!.y + 1;
  const spineHeight = preparedWings.at(-1)!.y + HALL_HEIGHT - spineY;
  const spineGrid = openRectangle(SPINE_WIDTH, spineHeight);
  const spine: NavigationScene = {
    id: 'corridor:spine', kind: 'corridor', corridorId: 'spine',
    name: 'The Spine', group: 'spine', cellSize: 32,
    map: { x: 0, y: spineY, w: SPINE_WIDTH, h: spineHeight },
    grid: [], exits: [],
    sections: [
      { name: 'The Climb', from: preparedWings[0]!.y + 3 - spineY, to: preparedWings[1]!.y + 3 - spineY },
      { name: 'The Throat', from: preparedWings[1]!.y + 3 - spineY, to: preparedWings[2]!.y + 3 - spineY },
    ],
  };
  const spineExits: NavigationExit[] = [];
  const scenes: NavigationScene[] = [spine];

  preparedWings.forEach(({ wing, prepared, y, width }) => {
    const sceneId: SceneId = wing.existingRoom ? `room:${wing.existingRoom}` : `corridor:${wing.id}`;
    const hallGrid = openRectangle(width, HALL_HEIGHT);
    // Two source-sprite rows form the visible back wall; only openings cut it.
    hallGrid[1]!.fill('#');
    hallGrid[3]![0] = '.';
    const hallExits: NavigationExit[] = [{
      id: `${sceneId}:spine`, at: { x: 0, y: 3 }, outward: 'west',
      to: spine.id, arrival: { x: SPINE_WIDTH - 2, y: y + 3 - spineY },
      mapAt: { x: SPINE_WIDTH, y: y + 3.5 },
    }];
    const props: { crop: 'crate'; at: Point }[] = [];
    spineGrid[y + 3 - spineY]![SPINE_WIDTH - 1] = '.';
    spineExits.push({
      id: `corridor:spine:${wing.id}`, at: { x: SPINE_WIDTH - 1, y: y + 3 - spineY },
      outward: 'east', to: sceneId, arrival: { x: 1, y: 3 },
      mapAt: { x: SPINE_WIDTH, y: y + 3.5 },
    });
    for (const { id, mask, roomOpenings, count, outward, belowHall, roomWidth, roomHeight, left, openingXs } of prepared) {
      const roomExits: NavigationExit[] = [];
      const sealed = id === 'breach';
      const edgeY = belowHall ? HALL_HEIGHT - 1 : 0;
      for (let index = 0; index < count; index += 1) {
        const x = openingXs[index]!;
        const opening = roomOpenings[index] ?? roomOpenings[0]!;
        const mapAt = { x: SPINE_WIDTH + x + 0.5, y: y + (belowHall ? HALL_HEIGHT : 0) };
        const adjustment = (x - openingXs[0]!) * 32 - (opening.x - roomOpenings[0]!.x) * mask.cellSize;
        const mapAdjustment = adjustment ? { mapAdjustmentPx: adjustment } : {};
        if (!sealed) {
          hallGrid[edgeY]![x] = '.';
          if (!belowHall) hallGrid[1]![x] = '.';
          hallExits.push({
            id: `${sceneId}:${id}:${index}`, at: { x, y: edgeY }, outward: belowHall ? 'south' : 'north',
            to: `room:${id}`, arrival: { ...opening.arrival }, entranceIndex: index, mapAt, ...mapAdjustment,
          });
          roomExits.push({
            id: `room:${id}:${index}`, at: { x: opening.x, y: opening.y }, outward,
            to: sceneId, arrival: { x, y: belowHall ? HALL_HEIGHT - 2 : 2 }, entranceIndex: index, mapAt, ...mapAdjustment,
          });
        }
      }
      scenes.push({
        id: `room:${id}`, kind: 'room', roomId: id, name: ROOM_BY_ID[id].name,
        group: wing.group, cellSize: mask.cellSize,
        map: { x: SPINE_WIDTH + left, y: belowHall ? y + HALL_HEIGHT : y - roomHeight, w: roomWidth, h: roomHeight },
        grid: sealed ? mask.grid.map((row) => '#'.repeat(row.length)) : mask.grid,
        exits: roomExits, ...(sealed ? { sealed: true } : {}),
      });
    }
    // Sparse stores sit against the lower wall, never below a room opening or
    // on an arrival cell. Their shared footprint is consumed by the renderer.
    for (let x = 5; x < width - 2; x += 12) {
      if (hallExits.some((exit) => exit.outward === 'south' && Math.abs(exit.at.x - x) <= 1)) continue;
      hallGrid[HALL_HEIGHT - 2]![x] = 'c';
      props.push({ crop: 'crate', at: { x, y: HALL_HEIGHT - 2 } });
    }
    scenes.push({
      id: sceneId, kind: 'corridor', corridorId: wing.id,
      ...(wing.existingRoom ? { roomId: wing.existingRoom } : {}),
      name: wing.name, group: wing.group, cellSize: 32,
      map: { x: SPINE_WIDTH, y, w: width, h: HALL_HEIGHT },
      grid: strings(hallGrid), exits: hallExits, props,
    });
  });
  spine.grid = strings(spineGrid);
  spine.exits = spineExits;
  return { scenes, start: { sceneId: 'corridor:landing', cell: { x: 2, y: 3 } } };
}

export const HABITAT_NAVIGATION = createHabitatNavigation();
export const NAVIGATION_SCENE_BY_ID = Object.fromEntries(
  HABITAT_NAVIGATION.scenes.map((scene) => [scene.id, scene]),
) as Record<SceneId, NavigationScene>;

export function isNavigationFloor(scene: Pick<NavigationScene, 'grid'>, at: Point): boolean {
  return Number.isInteger(at.x) && Number.isInteger(at.y) && scene.grid[at.y]?.[at.x] === '.';
}

export function navigationScene(network: NavigationNetwork, id: SceneId): NavigationScene | undefined {
  return network.scenes.find((scene) => scene.id === id);
}

export type NavigationStep =
  | { kind: 'blocked'; state: NavigationState }
  | { kind: 'move'; state: NavigationState }
  | { kind: 'transition'; state: NavigationState; exit: NavigationExit };

/** Pure collision/edge-crossing contract; the view supplies animation and fades. */
export function stepNavigation(
  network: NavigationNetwork, state: NavigationState, direction: Direction,
): NavigationStep {
  const scene = navigationScene(network, state.sceneId);
  if (!scene || scene.sealed || !isNavigationFloor(scene, state.cell)) return { kind: 'blocked', state };
  const vector = DIRECTION_VECTOR[direction];
  const next = { x: state.cell.x + vector.x, y: state.cell.y + vector.y };
  if (isNavigationFloor(scene, next)) return { kind: 'move', state: { ...state, cell: next } };
  const exit = scene.exits.find((candidate) => candidate.outward === direction
    && candidate.at.x === state.cell.x && candidate.at.y === state.cell.y);
  if (!exit) return { kind: 'blocked', state };
  // Portals are boundary crossings, never teleporters hidden inside a room.
  if (next.x >= 0 && next.x < (scene.grid[0]?.length ?? 0)
    && next.y >= 0 && next.y < scene.grid.length) return { kind: 'blocked', state };
  const destination = navigationScene(network, exit.to);
  if (!destination || destination.sealed || !isNavigationFloor(destination, exit.arrival)) {
    return { kind: 'blocked', state };
  }
  return {
    kind: 'transition', exit,
    state: { sceneId: destination.id, cell: { ...exit.arrival } },
  };
}

/** Four-neighbour pathfinding exposes every open cell, not a prescribed centre line. */
export function navigationWalkingPath(
  scene: Pick<NavigationScene, 'grid'>, from: Point, to: Point,
): Point[] | null {
  if (!isNavigationFloor(scene, from) || !isNavigationFloor(scene, to)) return null;
  const key = (point: Point) => `${point.x},${point.y}`;
  const queue = [{ ...from }];
  const previous = new Map<string, Point | null>([[key(from), null]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const at = queue[cursor]!;
    if (at.x === to.x && at.y === to.y) {
      const path = [at];
      let before = previous.get(key(at));
      while (before) {
        path.push(before);
        before = previous.get(key(before));
      }
      return path.reverse();
    }
    for (const vector of Object.values(DIRECTION_VECTOR)) {
      const next = { x: at.x + vector.x, y: at.y + vector.y };
      if (previous.has(key(next)) || !isNavigationFloor(scene, next)) continue;
      previous.set(key(next), at);
      queue.push(next);
    }
  }
  return null;
}

/** Scene routing for visitors/agents. It cannot route through a sealed room. */
export function navigationScenePath(
  network: NavigationNetwork, from: SceneId, to: SceneId,
): SceneId[] | null {
  if (!navigationScene(network, from) || navigationScene(network, from)?.sealed
    || !navigationScene(network, to) || navigationScene(network, to)?.sealed) return null;
  const queue = [from];
  const previous = new Map<SceneId, SceneId | null>([[from, null]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor]!;
    if (id === to) {
      const path = [id];
      let before = previous.get(id);
      while (before) {
        path.push(before);
        before = previous.get(before);
      }
      return path.reverse();
    }
    for (const exit of navigationScene(network, id)!.exits) {
      const destination = navigationScene(network, exit.to);
      if (previous.has(exit.to) || !destination || destination.sealed
        || !isNavigationFloor(navigationScene(network, id)!, exit.at)
        || !isNavigationFloor(destination, exit.arrival)) continue;
      previous.set(exit.to, id);
      queue.push(exit.to);
    }
  }
  return null;
}
