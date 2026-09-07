import { describe, expect, it } from 'vitest';
import { isWalkable } from './grid';
import { ROOM_BY_ID } from './rooms';
import { RESIDENTS } from './residents';
import { genesisSnapshot } from './snapshot';

const snap = genesisSnapshot();

describe('the genesis snapshot', () => {
  it('opens on day one hundred, with the emergency behind them', () => {
    expect(snap.day).toBe(100);
  });

  it('reports the reactor already below where it started', () => {
    expect(snap.power).toBeLessThan(1);
    expect(snap.power).toBeGreaterThan(0.5);
  });

  it('is deterministic, so the view can be developed against a fixed world', () => {
    expect(genesisSnapshot(1)).toEqual(genesisSnapshot(1));
  });

  it('places all twenty-five and nobody else', () => {
    expect(snap.people).toHaveLength(25);
    expect(new Set(snap.people.map((p) => p.id)).size).toBe(25);
    const known = new Set(RESIDENTS.map((r) => r.id));
    for (const p of snap.people) expect(known.has(p.id)).toBe(true);
  });

  it('covers every room, so the cutaway has no holes in it', () => {
    expect(snap.rooms).toHaveLength(48);
    expect(new Set(snap.rooms.map((r) => r.id)).size).toBe(48);
  });

  it('leaves the Breach dark, because there is no power in vacuum', () => {
    expect(snap.rooms.find((r) => r.id === 'breach')!.lit).toBe(false);
  });
});

describe('where people are standing', () => {
  it('never stands anybody inside rock, a partition or an object that blocks', () => {
    for (const p of snap.people) {
      const { grid, legend } = ROOM_BY_ID[p.room];
      expect(isWalkable(grid, legend, p.at.x, p.at.y)).toBe(true);
    }
  });

  it('gives everybody something under their feet', () => {
    for (const p of snap.people) {
      const { grid, legend } = ROOM_BY_ID[p.room];
      expect(isWalkable(grid, legend, p.at.x, p.at.y + 1)).toBe(false);
    }
  });

  it('never draws two people on the same tile', () => {
    const occupied = snap.people.map((person) => (
      `${person.room}:${person.at.x}:${person.at.y}`
    ));
    expect(new Set(occupied).size).toBe(occupied.length);
  });

  it('agrees with each room about who is in it', () => {
    for (const room of snap.rooms) {
      const here = snap.people.filter((p) => p.room === room.id).map((p) => p.id);
      expect([...room.occupants].sort()).toEqual(here.sort());
    }
  });

  it('puts nobody in the Breach unsuited', () => {
    expect(snap.rooms.find((r) => r.id === 'breach')!.occupants).toHaveLength(0);
  });

  it('puts the most people in the Common, which is the point of the Common', () => {
    const busiest = [...snap.rooms].sort((a, b) => b.occupants.length - a.occupants.length)[0]!;
    expect(busiest.id).toBe('common');
  });

  it('says what each of them is doing', () => {
    for (const p of snap.people) expect(p.doing.length).toBeGreaterThan(15);
  });
});

describe('the record', () => {
  it('is in order, so it can be read as a day', () => {
    const minutes = snap.record.map((e) => e.minute);
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
  });

  it('stays inside the day', () => {
    for (const e of snap.record) {
      expect(e.minute).toBeGreaterThanOrEqual(0);
      expect(e.minute).toBeLessThan(24 * 60);
    }
  });

  it('names only rooms and residents that exist', () => {
    const known = new Set(RESIDENTS.map((r) => r.id));
    for (const e of snap.record) {
      expect(ROOM_BY_ID[e.room]).toBeDefined();
      for (const w of e.who) expect(known.has(w)).toBe(true);
    }
  });

  it('is dry: it states what happened and draws no conclusion', () => {
    for (const e of snap.record) {
      expect(e.text.length).toBeGreaterThan(20);
      expect(e.text).not.toMatch(/\b(because|therefore|which means|suggests)\b/i);
    }
  });
});
