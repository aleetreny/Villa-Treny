import type { Point } from './grid';
import type { ResidentId } from './residents';
import { FEET, roomAccessible, roomComponent, roomPath, roomStandingSpots, standingFloor, type RoomArt } from './room-art';

export type Walker = {
  id: ResidentId; at: Point; route: Point[]; next: Point | null;
  waitUntil: number; movedAt: number; step: number;
  duration?: number; goal?: Point;
};
export type RoomOccupancy = { walkers: Walker[]; waiting: ResidentId[] };
/** Four native pixels per step, independently of navigation resolution. */
export const STEP_MS = 190;
export const feetOverlap = (a: Point, b: Point, cellSize = 1): boolean => Math.abs(a.x - b.x) * cellSize < FEET.width && Math.abs(a.y - b.y) * cellSize < FEET.depth;
export const walkerStandingFloor = standingFloor;
export const walkerStandingSpots = roomStandingSpots;

/** Reserve the swept footprint, not merely the two endpoint centres. */
function reservationsOverlap(a: Point, aNext: Point | null, b: Point, bNext: Point | null, cellSize: number): boolean {
  const an = aNext ?? a, bn = bNext ?? b;
  return Math.min(a.x, an.x) * cellSize < Math.max(b.x, bn.x) * cellSize + FEET.width
    && Math.min(b.x, bn.x) * cellSize < Math.max(a.x, an.x) * cellSize + FEET.width
    && Math.min(a.y, an.y) * cellSize < Math.max(b.y, bn.y) * cellSize + FEET.depth
    && Math.min(b.y, bn.y) * cellSize < Math.max(a.y, an.y) * cellSize + FEET.depth;
}
function clearSegment(art: RoomArt, from: Point, to: Point): boolean {
  if (from.x !== to.x && from.y !== to.y) return false;
  const distance = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  if (!distance || distance * art.cellSize > 4) return false;
  const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
  for (let n = 1; n <= distance; n++) if (!standingFloor(art, { x: from.x + dx * n, y: from.y + dy * n })) return false;
  return true;
}

/** Access is proved before placement. Isolated clear floor remains diagnosed, never relabelled as wall. */
export function reconcileWalkers(
  occupancy: RoomOccupancy, present: readonly ResidentId[], art: RoomArt,
  spots: readonly Point[], now: number, seed = 0,
): RoomOccupancy {
  const wanted = new Set(present), placed = new Set<ResidentId>();
  const walkers: Walker[] = [];
  for (const walker of occupancy.walkers) {
    if (!wanted.has(walker.id) || placed.has(walker.id) || !roomAccessible(art, walker.at)) continue;
    if (walker.next && !clearSegment(art, walker.at, walker.next)) continue;
    if (walkers.some((other) => reservationsOverlap(walker.at, walker.next, other.at, other.next, art.cellSize))) continue;
    walkers.push(walker); placed.add(walker.id);
  }
  const waiting: ResidentId[] = [];
  for (const id of new Set([...occupancy.waiting, ...present])) {
    if (!wanted.has(id) || placed.has(id)) continue;
    const ordinal = id.charCodeAt(0) - 65;
    const start = spots.length ? (ordinal * 73 + seed * 19) % spots.length : 0;
    let at: Point | undefined;
    for (let offset = 0; offset < spots.length; offset++) {
      const candidate = spots[(start + offset) % spots.length]!;
      if (roomAccessible(art, candidate) && !walkers.some((other) => reservationsOverlap(candidate, null, other.at, other.next, art.cellSize))) { at = candidate; break; }
    }
    if (!at) { waiting.push(id); continue; }
    walkers.push({ id, at, route: [], next: null, waitUntil: now + 500 + ordinal % 7 * 150, movedAt: now, step: 0 });
    placed.add(id);
  }
  return { walkers, waiting };
}

function availableTo(walker: Walker, walkers: Walker[], art: RoomArt, target: Point): boolean {
  return !walkers.some((other) => other !== walker && reservationsOverlap(target, null, other.at, other.next, art.cellSize));
}
/** Small straight groups preserve 21px/s movement on a 1px graph. Turns are never cut. */
function nextSegment(walker: Walker, art: RoomArt): { at: Point; count: number } | null {
  const first = walker.route[0]; if (!first) return null;
  const dx = Math.sign(first.x - walker.at.x), dy = Math.sign(first.y - walker.at.y);
  let at = first, count = 1;
  if (!clearSegment(art, walker.at, first)) return null;
  for (let i = 1; i < walker.route.length && (i + 1) * art.cellSize <= 4; i++) {
    const point = walker.route[i]!;
    if (point.x !== first.x + dx * i || point.y !== first.y + dy * i || !standingFloor(art, point)) break;
    at = point; count++;
  }
  return { at, count };
}

export function advanceWalkers(walkers: Walker[], art: RoomArt, spots: Point[], now: number): void {
  // Complete every in-flight reservation before planning this frame's next segments.
  for (const walker of walkers) {
    if (walker.next && now - walker.movedAt >= (walker.duration ?? STEP_MS)) {
      walker.at = walker.next; walker.next = null;
      if (!walker.route.length) walker.waitUntil = now + 1200 + (walker.id.charCodeAt(0) - 65) % 7 * 230;
    }
  }
  for (const walker of walkers) {
    if (walker.next) continue;
    const ordinal = walker.id.charCodeAt(0) - 65;
    if (!walker.route.length && now >= walker.waitUntil) {
      const component = roomComponent(art, walker.at);
      for (let attempt = 0; attempt < 12; attempt++) {
        const destination = spots[(ordinal * 47 + walker.step * 83 + attempt * 131) % spots.length];
        if (!destination || roomComponent(art, destination) !== component || !availableTo(walker, walkers, art, destination)) continue;
        const path = roomPath(art, walker.at, destination);
        if (path.length > 1) { walker.route = path.slice(1); walker.goal = destination; break; }
      }
      walker.step++; walker.waitUntil = now + 750 + ordinal % 5 * 130;
    }
    let segment = nextSegment(walker, art);
    if (!segment) { walker.route = []; continue; }
    let occupied = walkers.some((other) => other !== walker && reservationsOverlap(walker.at, segment!.at, other.at, other.next, art.cellSize));
    if (occupied && walker.goal) {
      // A person in the corridor can be walked around; an occupied first step is not a wall.
      walker.route = roomPath(art, walker.at, walker.goal, (point) => availableTo(walker, walkers, art, point)).slice(1);
      segment = nextSegment(walker, art);
      occupied = !segment || walkers.some((other) => other !== walker && reservationsOverlap(walker.at, segment!.at, other.at, other.next, art.cellSize));
    }
    if (occupied || !segment) {
      walker.route = []; walker.waitUntil = now + 320 + ordinal % 3 * 70;
    } else {
      walker.next = segment.at; walker.route.splice(0, segment.count); walker.movedAt = now;
      walker.duration = STEP_MS * (Math.abs(segment.at.x - walker.at.x) + Math.abs(segment.at.y - walker.at.y)) * art.cellSize / 4;
    }
  }
}

export function walkerPosition(walker: Walker, now: number): Point {
  const amount = walker.next ? Math.min(1, Math.max(0, (now - walker.movedAt) / (walker.duration ?? STEP_MS))) : 0;
  return { x: walker.at.x + (walker.next ? (walker.next.x - walker.at.x) * amount : 0), y: walker.at.y + (walker.next ? (walker.next.y - walker.at.y) * amount : 0) };
}
