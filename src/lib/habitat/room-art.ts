import manifest from './generated/rooms.json';
import type { Point } from './grid';
import type { RoomId } from './rooms';
import { decodeBitmapRow } from './bitmap-codec';

export type RoomObject = {
  id: string; bounds: [number, number, number, number]; baseY: number;
  mask: readonly string[]; footprintMask?: readonly string[];
  source?: { file: string; rect: [number, number, number, number]; mirrored: boolean };
};
export type RoomExit = {
  at: Point; arrival: Point; outward?: 'north' | 'east' | 'south' | 'west';
  span?: { from: number; to: number }; nativeCenter?: number; width?: number;
};
export type RoomArt = {
  width: number; height: number; cellSize: number; grid: readonly string[];
  entry: Point; exits: readonly RoomExit[]; sealed: boolean;
  footprint?: { width: number; depth: number; behind: number };
  objects?: readonly RoomObject[]; outlineMask?: readonly string[];
  diagnostics?: { pointComponents: number[]; inaccessibleFloorPixels: number };
};
const sourceRooms = manifest.rooms as unknown as Partial<Record<RoomId, RoomArt>>;
export const ROOM_ART = Object.fromEntries(Object.entries(sourceRooms).map(([id, art]) => [id, {
  ...art,
  grid: art.grid.map(decodeBitmapRow),
  ...(art.outlineMask ? { outlineMask: art.outlineMask.map(decodeBitmapRow) } : {}),
  ...(art.objects ? { objects: art.objects.map((object) => ({ ...object, mask: object.mask.map(decodeBitmapRow),
    ...(object.footprintMask ? { footprintMask: object.footprintMask.map(decodeBitmapRow) } : {}),
  })) } : {}),
}])) as Partial<Record<RoomId, RoomArt>>;
export const FEET = { width: 12, depth: 8, behind: 6 } as const;

export function visibleRoom(id: RoomId): RoomId {
  return id === 'longwalk' || id === 'row' || id === 'breach' ? 'common' : id;
}

/** This is also the renderer's integer anchor, including at fractional interpolation times. */
export function roomAnchor(art: RoomArt, point: Point): Point {
  return { x: Math.round((point.x + .5) * art.cellSize), y: Math.round((point.y + .5) * art.cellSize) };
}
export function roomFloor(art: RoomArt, point: Point): boolean {
  return art.grid[point.y]?.[point.x] === '.';
}

type Clearance = { width: number; height: number; free: Uint8Array; components: Int32Array; accessible: Set<number>; spots: Point[] };
const clearances = new WeakMap<RoomArt, Clearance>();
const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

function throughPortal(art: RoomArt, left: number, top: number, right: number, bottom: number, width: number, height: number): boolean {
  return art.exits.some((exit) => {
    const side = exit.outward ?? (exit.at.y === 0 ? 'north' : 'south');
    const center = roomAnchor(art, exit.at);
    const horizontal = side === 'north' || side === 'south';
    const from = exit.nativeCenter !== undefined && exit.width !== undefined ? exit.nativeCenter - exit.width / 2
      : exit.span ? exit.span.from * art.cellSize : (horizontal ? center.x : center.y) - 8;
    const to = exit.nativeCenter !== undefined && exit.width !== undefined ? from + exit.width
      : exit.span ? (exit.span.to + 1) * art.cellSize : from + 16;
    if (horizontal && (left < from || right > to || left < 0 || right > width)) return false;
    if (!horizontal && (top < from || bottom > to || top < 0 || bottom > height)) return false;
    return side === 'north' ? top < 0 && bottom <= height
      : side === 'south' ? bottom > height && top >= 0
        : side === 'west' ? left < 0 && right <= width : right > width && left >= 0;
  });
}

function clearance(art: RoomArt): Clearance {
  const cached = clearances.get(art);
  if (cached) return cached;
  const cols = art.grid[0]?.length ?? 0, rows = art.grid.length;
  const width = cols * art.cellSize, height = rows * art.cellSize;
  const stride = width + 1, sums = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += art.grid[Math.floor(y / art.cellSize)]?.[Math.floor(x / art.cellSize)] === '.' ? 1 : 0;
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1]! + row;
    }
  }
  const footprint = art.footprint ?? FEET;
  const free = new Uint8Array(cols * rows), components = new Int32Array(cols * rows).fill(-1);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const at = roomAnchor(art, { x, y });
    const left = at.x - footprint.width / 2, top = at.y - footprint.behind;
    const right = left + footprint.width, bottom = top + footprint.depth;
    if ((left < 0 || top < 0 || right > width || bottom > height) && !throughPortal(art, left, top, right, bottom, width, height)) continue;
    const l = Math.max(0, left), t = Math.max(0, top), r = Math.min(width, right), b = Math.min(height, bottom);
    if (l >= r || t >= b) continue;
    const covered = sums[b * stride + r]! - sums[t * stride + r]! - sums[b * stride + l]! + sums[t * stride + l]!;
    if (covered === (r - l) * (b - t)) free[y * cols + x] = 1;
  }
  let component = 0;
  for (let index = 0; index < free.length; index++) {
    if (!free[index] || components[index] !== -1) continue;
    const queue = [index]; components[index] = component;
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]!, x = current % cols, y = Math.floor(current / cols);
      for (const [dx, dy] of directions) {
        const nx = x + dx, ny = y + dy, next = ny * cols + nx;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !free[next] || components[next] !== -1) continue;
        components[next] = component; queue.push(next);
      }
    }
    component++;
  }
  const accessible = new Set<number>();
  for (const entry of art.exits.length ? art.exits.map((exit) => exit.arrival) : [art.entry]) {
    const index = entry.y * cols + entry.x;
    if (free[index]) accessible.add(components[index]!);
  }
  const spots: Point[] = [];
  if (!art.sealed) for (let index = 0; index < free.length; index++) {
    if (free[index] && accessible.has(components[index]!)) spots.push({ x: index % cols, y: Math.floor(index / cols) });
  }
  const result = { width: cols, height: rows, free, components, accessible, spots };
  clearances.set(art, result); return result;
}

/** All 96 native footprint pixels must be floor; a cell centre is insufficient. */
export function standingFloor(art: RoomArt, point: Point): boolean {
  const mask = clearance(art);
  return Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.y >= 0
    && point.x < mask.width && point.y < mask.height && mask.free[point.y * mask.width + point.x] === 1;
}
export function roomAccessible(art: RoomArt, point: Point): boolean {
  const mask = clearance(art);
  return standingFloor(art, point) && mask.accessible.has(mask.components[point.y * mask.width + point.x]!);
}
export function roomComponent(art: RoomArt, point: Point): number {
  const mask = clearance(art);
  return standingFloor(art, point) ? mask.components[point.y * mask.width + point.x]! : -1;
}

export function roomPath(art: RoomArt, from: Point, to: Point, available?: (point: Point) => boolean): Point[] {
  const mask = clearance(art);
  if (!standingFloor(art, from) || !standingFloor(art, to) || roomComponent(art, from) !== roomComponent(art, to)) return [];
  const start = from.y * mask.width + from.x, goal = to.y * mask.width + to.x;
  const previous = new Int32Array(mask.free.length).fill(-2); previous[start] = -1;
  const pending = [start];
  for (let head = 0; head < pending.length; head++) {
    const at = pending[head]!;
    if (at === goal) {
      const route: Point[] = [];
      for (let index = at; index !== -1; index = previous[index]!) route.push({ x: index % mask.width, y: Math.floor(index / mask.width) });
      return route.reverse();
    }
    const x = at % mask.width, y = Math.floor(at / mask.width);
    for (const [dx, dy] of directions) {
      const nx = x + dx, ny = y + dy, next = ny * mask.width + nx;
      if (nx < 0 || nx >= mask.width || ny < 0 || ny >= mask.height || !mask.free[next] || previous[next] !== -2) continue;
      if (available && !available({ x: nx, y: ny })) continue;
      previous[next] = at; pending.push(next);
    }
  }
  return [];
}

/** Isolated but physically clear floor remains in grid; only arrivals exclude it. */
export function roomStandingSpots(art: RoomArt): Point[] { return clearance(art).spots; }
export function roomNavigationDiagnostics(art: RoomArt) {
  const mask = clearance(art); const counts = new Map<number, number>();
  for (let i = 0; i < mask.free.length; i++) if (mask.free[i]) counts.set(mask.components[i]!, (counts.get(mask.components[i]!) ?? 0) + 1);
  return { components: [...counts].map(([id, positions]) => ({ id, positions, accessible: mask.accessible.has(id) })), accessiblePositions: mask.spots.length };
}
export function roomImage(id: RoomId): string { return `${import.meta.env.BASE_URL}habitat/rooms/${visibleRoom(id)}.png`; }
