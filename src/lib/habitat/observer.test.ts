import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOM_ART, roomFloor, roomPath, roomStandingSpots, standingFloor } from './room-art';
import { ROOMS } from './rooms';
import { genesisSnapshot } from './snapshot';
import { observerPresence } from './useObserverPresence';

const usable = ROOMS.filter((room) => !['longwalk', 'row', 'breach'].includes(room.id));

describe('the production room artwork and safe walking floor', () => {
  it('ships all 45 visitable interiors and the sealed reference at native PNG size', () => {
    expect(usable).toHaveLength(45);
    expect(Object.keys(ROOM_ART)).toHaveLength(46);
    for (const room of usable) {
      const art = ROOM_ART[room.id]!;
      const png = readFileSync(new URL(`../../../public/habitat/rooms/${room.id}.png`, import.meta.url));
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16), room.id).toBe(art.width);
      expect(png.readUInt32BE(20), room.id).toBe(art.height);
      expect(art.cellSize).toBe(1);
      expect(art.grid.every((row) => row.length === art.grid[0]!.length)).toBe(true);
      expect(art.sealed).toBe(false);
      expect(roomFloor(art, art.entry), room.id).toBe(true);
      expect(roomStandingSpots(art).length, room.id).toBeGreaterThan(2);
    }
  });

  it('routes around furniture without cutting corners or crossing a narrow gap', () => {
    const art = { width: 28, height: 28, cellSize: 4, entry: { x: 2, y: 2 }, exits: [], sealed: false,
      grid: ['#######', '#.....#', '#.....#', '#..#..#', '#.....#', '#.....#', '#######'] };
    expect(roomPath(art, { x: 2, y: 2 }, { x: 4, y: 2 })).toHaveLength(3);
    expect(roomPath(art, { x: 2, y: 2 }, { x: 4, y: 4 })).toEqual([]);
    expect(standingFloor(art, { x: 2, y: 3 })).toBe(false);
    expect(roomPath(art, { x: 3, y: 3 }, { x: 4, y: 2 })).toEqual([]);
  });
});

describe('visual life, independent of cognition', () => {
  it('never mutates the saved world or fabricates diary entries while people wander', () => {
    const original = genesisSnapshot(7);
    const before = JSON.stringify(original);
    let moved = false;
    for (let seconds = 0; seconds <= 600; seconds += 5) {
      const visible = observerPresence(original, seconds);
      expect(visible.people).toHaveLength(25);
      expect(new Set(visible.people.map((person) => person.id)).size).toBe(25);
      expect(visible.record).toBe(original.record);
      expect([visible.day, visible.watch, visible.power]).toEqual([original.day, original.watch, original.power]);
      for (const person of visible.people) {
        expect(usable.some((room) => room.id === person.room), person.id).toBe(true);
        expect(visible.rooms.find((room) => room.id === person.room)?.occupants).toContain(person.id);
        if (person.doing === 'taking a walk') moved = true;
      }
      expect(visible.rooms.flatMap((room) => room.occupants).sort()).toEqual(original.people.map((person) => person.id).sort());
    }
    expect(moved).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
  });
});
