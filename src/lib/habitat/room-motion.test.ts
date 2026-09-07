import { describe, expect, it } from 'vitest';
import { advanceWalkers, feetOverlap, reconcileWalkers, walkerPosition, walkerStandingSpots, type RoomOccupancy, type Walker } from './room-motion';
import { ROOM_ART, roomAccessible, roomAnchor, roomComponent, roomFloor, roomNavigationDiagnostics, roomPath, standingFloor, visibleRoom, type RoomArt } from './room-art';
import { RESIDENTS, type ResidentId } from './residents';
import { genesisSnapshot } from './snapshot';
import type { Point } from './grid';

const body = (id: ResidentId, x: number, y: number): Walker => ({ id, at: { x, y }, route: [], next: null, waitUntil: 0, movedAt: 0, step: 0 });
const empty = (): RoomOccupancy => ({ walkers: [], waiting: [] });
const at = (x: number, y: number): Point => ({ x: x - 1, y: y - 1 });
function floor(width: number, height: number): RoomArt {
  return { width, height, cellSize: 1, entry: at(6, 6), exits: [], sealed: false,
    grid: Array.from({ length: height }, () => '.'.repeat(width)) };
}
function expectClearFeet(art: RoomArt, walkers: Walker[], time: number) {
  for (const walker of walkers) {
    expect(roomAccessible(art, walker.at)).toBe(true);
    // Read every occupied native pixel directly, including during interpolation.
    const anchor = roomAnchor(art, walkerPosition(walker, time));
    for (let y = anchor.y - 6; y < anchor.y + 2; y++) for (let x = anchor.x - 6; x < anchor.x + 6; x++) {
      if (x < 0 || y < 0 || x >= art.grid[0]!.length || y >= art.grid.length) continue; // open portal
      expect(art.grid[y]?.[x], `${walker.id}: pixel ${x},${y}`).toBe('.');
    }
  }
  for (let a = 0; a < walkers.length; a++) for (let b = a + 1; b < walkers.length; b++) {
    expect(feetOverlap(walkerPosition(walkers[a]!, time), walkerPosition(walkers[b]!, time), art.cellSize), `${walkers[a]!.id}/${walkers[b]!.id} at ${time}`).toBe(false);
  }
}

describe('native artwork, complete footprint and actual entrances', () => {
  // Measured on room PNGs independently of ROOM_COLLISION. Each old planner accepted these furniture pixels.
  it.each([
    ['common', 'footstool', 94, 114], ['games', 'blue crate', 114, 146],
    ['dock', 'barrel', 62, 162], ['hold', 'yellow barrel', 66, 106],
    ['maintenance', 'workbench', 178, 122], ['archive', 'bottom left chair', 14, 214],
    ['winter', 'left armchair', 18, 130], ['servicecounter', 'tabletop', 78, 106],
  ] as const)('rejects the measured %s %s footprint at %i,%i', (id, _object, x, y) => {
    const art = ROOM_ART[id]!;
    expect(standingFloor(art, at(x, y))).toBe(false);
    expect(roomPath(art, art.entry, at(x, y))).toEqual([]);
  });

  it('retains genuine floor instead of changing inaccessible islands into obstacles', () => {
    const art = floor(42, 22);
    art.grid = art.grid.map((row) => row.slice(0, 20) + '##' + row.slice(22));
    expect(roomFloor(art, at(34, 14))).toBe(true);
    expect(standingFloor(art, at(34, 14))).toBe(true);
    expect(roomAccessible(art, at(34, 14))).toBe(false);
    expect(walkerStandingSpots(art).some((point) => point.x > 22)).toBe(false);
    expect(roomNavigationDiagnostics(art).components).toHaveLength(2);
  });

  it('allows a real 12-pixel gap at its native phase and rejects an 11-pixel gap', () => {
    const art = floor(30, 40);
    art.entry = at(15, 8);
    art.grid = art.grid.map((row, y) => y >= 16 && y < 24 ? '#'.repeat(9) + '.'.repeat(12) + '#'.repeat(9) : row);
    expect(roomPath(art, at(15, 8), at(15, 32)).length).toBeGreaterThan(0);
    const narrow = { ...art, grid: art.grid.map((row, y) => y >= 16 && y < 24 ? '#'.repeat(10) + '.'.repeat(11) + '#'.repeat(9) : row) };
    expect(roomPath(narrow, at(15, 8), at(15, 32))).toEqual([]);
  });

  it.each(Object.entries(ROOM_ART).filter(([, art]) => !art.sealed))('%s connects each real opening to a valid arrival and only spawns in its accessible components', (_id, art) => {
    expect(art.cellSize).toBe(1);
    expect(new Set(art.objects?.map((object) => object.id)).size).toBe(art.objects?.length ?? 0);
    for (const object of art.objects ?? []) {
      expect(object.mask.length).toBe(object.bounds[3]);
      expect(object.mask.every((row) => row.length === object.bounds[2] && /^[01]+$/.test(row))).toBe(true);
      expect(object.baseY).toBe(object.bounds[1] + object.bounds[3]);
      expect(object.source?.file).toBeTruthy();
    }
    const entrances = new Set(art.exits.map((exit) => roomComponent(art, exit.arrival)));
    for (const exit of art.exits) {
      expect(standingFloor(art, exit.at)).toBe(true);
      expect(roomPath(art, exit.arrival, exit.at).length).toBeGreaterThan(0);
    }
    const occupancy = reconcileWalkers(empty(), RESIDENTS.map((person) => person.id), art, walkerStandingSpots(art), 0);
    expect(occupancy.walkers.length).toBeGreaterThan(0);
    for (const walker of occupancy.walkers) expect(entrances.has(roomComponent(art, walker.at))).toBe(true);
    expect(new Set([...occupancy.walkers.map((walker) => walker.id), ...occupancy.waiting]).size).toBe(25);
  });

  it('keeps both Washroom compartments reachable through their own accesses', () => {
    const art = ROOM_ART.washroom!, [left, right] = art.exits;
    expect(art.exits).toHaveLength(2);
    expect(roomAccessible(art, left!.arrival)).toBe(true);
    expect(roomAccessible(art, right!.arrival)).toBe(true);
    expect(roomPath(art, left!.arrival, right!.arrival)).toEqual([]);
    expect(roomComponent(art, left!.arrival)).not.toBe(roomComponent(art, right!.arrival));
  });

  it('keeps the source chest silhouette as foreground instead of covering its transparent gaps', () => {
    const object = ROOM_ART.cabin1!.objects!.find((item) => item.id.includes('passenger'))!;
    expect(object).toBeDefined();
    expect(object.bounds.slice(0, 2)).toEqual([136, 132]);
    expect(object.baseY).toBe(164);
    expect(object.mask.length).toBe(object.bounds[3]);
    expect(object.mask.every((row) => row.length === object.bounds[2])).toBe(true);
    expect(object.mask.join('')).toContain('0');
    expect(object.mask.join('')).toContain('1');
  });
});

describe('continuous native movement and reservations', () => {
  it('accepts a one-pixel route and preserves physical speed', () => {
    const art = floor(64, 32), a = body('A', 15, 15);
    a.route = [{ x: 16, y: 15 }];
    advanceWalkers([a], art, walkerStandingSpots(art), 0);
    expect(a.next).toEqual({ x: 16, y: 15 });
    expect(a.duration).toBe(47.5);
    expect(walkerPosition(a, 23.75)).toEqual({ x: 15.5, y: 15 });
  });
  it('never cuts a corner or skips blocked pixels when grouping a route', () => {
    const art = floor(64, 32), a = body('A', 15, 15);
    a.route = [{ x: 16, y: 15 }, { x: 17, y: 15 }, { x: 17, y: 16 }];
    advanceWalkers([a], art, walkerStandingSpots(art), 0);
    expect(a.next).toEqual({ x: 17, y: 15 });
    expect(a.route).toEqual([{ x: 17, y: 16 }]);
  });
  it('stops two people approaching head-on before their feet overlap', () => {
    const art = floor(64, 20), a = body('A', 15, 10), b = body('B', 39, 10);
    a.route = roomPath(art, a.at, at(36, 11)).slice(1);
    b.route = roomPath(art, b.at, at(20, 11)).slice(1);
    for (let time = 0; time <= 2000; time += 20) {
      advanceWalkers([a, b], art, walkerStandingSpots(art), time);
      expectClearFeet(art, [a, b], time);
    }
  });
  it('finds a physical detour around a waiting person', () => {
    const art = floor(80, 48), a = body('A', 15, 23), b = body('B', 29, 23);
    b.waitUntil = 100_000; a.goal = { x: 55, y: 23 }; a.route = roomPath(art, a.at, a.goal).slice(1);
    let detoured = false;
    for (let time = 0; time <= 5000; time += 20) {
      advanceWalkers([a, b], art, walkerStandingSpots(art), time);
      detoured ||= Math.abs(walkerPosition(a, time).y - 23) >= 8;
      expectClearFeet(art, [a, b], time);
      if (a.at.x === 55) break;
    }
    expect(detoured).toBe(true);
    expect(a.at.x).toBe(55);
  });
});

describe('capacity keeps residents queued without erasing their data', () => {
  it('admits the oldest waiting resident after a departure in a one-person room', () => {
    const art = floor(12, 8), spots = walkerStandingSpots(art);
    const full = reconcileWalkers(empty(), ['A', 'B', 'C'], art, spots, 0);
    expect(full.walkers.map((walker) => walker.id)).toEqual(['A']);
    expect(full.waiting).toEqual(['B', 'C']);
    const freed = reconcileWalkers(full, ['C', 'D', 'B'], art, spots, 100);
    expect(freed.walkers.map((walker) => walker.id)).toEqual(['B']);
    expect(freed.waiting).toEqual(['C', 'D']);
  });
  it('keeps a room with no complete footprint queued', () => {
    const art = floor(12, 7);
    expect(reconcileWalkers(empty(), ['A', 'B'], art, walkerStandingSpots(art), 0)).toEqual({ walkers: [], waiting: ['A', 'B'] });
  });
  it('places all 25 initial residents on accessible floor, including Administration and Dispatch', () => {
    const snapshot = genesisSnapshot(); let visible = 0;
    for (const [id, art] of Object.entries(ROOM_ART)) {
      if (art.sealed) continue;
      const present = snapshot.people.filter((person) => visibleRoom(person.room) === id).map((person) => person.id);
      const occupancy = reconcileWalkers(empty(), present, art, walkerStandingSpots(art), 0, id.length);
      expect(occupancy.waiting, id).toEqual([]);
      expectClearFeet(art, occupancy.walkers, 0); visible += occupancy.walkers.length;
    }
    expect(visible).toBe(25); expect(snapshot.people).toHaveLength(25);
  });
  it('preserves and separates 25 visitors while they move through Common', () => {
    const art = ROOM_ART.common!, residents = RESIDENTS.map((person) => person.id), spots = walkerStandingSpots(art);
    let occupancy = reconcileWalkers(empty(), residents, art, spots, 0);
    const initial = new Map(occupancy.walkers.map((walker) => [walker.id, { ...walker.at }]));
    for (let time = 0; time <= 6000; time += 95) {
      advanceWalkers(occupancy.walkers, art, spots, time);
      occupancy = reconcileWalkers(occupancy, residents, art, spots, time);
      expectClearFeet(art, occupancy.walkers, time);
      expect(new Set([...occupancy.walkers.map((walker) => walker.id), ...occupancy.waiting]).size).toBe(25);
    }
    expect(occupancy.walkers.some((walker) => initial.get(walker.id)?.x !== walker.at.x || initial.get(walker.id)?.y !== walker.at.y)).toBe(true);
  });
});
