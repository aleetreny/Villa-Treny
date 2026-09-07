import { describe, expect, it } from 'vitest';
import { ROOM_BY_ID } from './rooms';
import { RESIDENTS, RESIDENT_BY_ID, holdersOf } from './residents';

describe('the roster', () => {
  it('is twenty-five people', () => {
    expect(RESIDENTS).toHaveLength(25);
  });

  it('gives each of them a distinct initial from A to Y, so a grid reads without a key', () => {
    const ids = [...RESIDENTS.map((r) => r.id)].sort();
    const expected = Array.from({ length: 25 }, (_, i) => String.fromCharCode(65 + i));
    expect(ids).toEqual(expected);
  });

  it("starts each name with that resident's own initial", () => {
    for (const r of RESIDENTS) expect(r.name.charAt(0)).toBe(r.id);
  });

  it('splits them into five clusters of five', () => {
    for (const c of ['I', 'II', 'III', 'IV', 'V'] as const) {
      expect(RESIDENTS.filter((r) => r.cluster === c)).toHaveLength(5);
    }
  });

  it('keeps everybody between thirty-three and seventy-eight at the crash', () => {
    for (const r of RESIDENTS) {
      expect(r.age).toBeGreaterThanOrEqual(33);
      expect(r.age).toBeLessThanOrEqual(78);
    }
  });

  it('pins a distinct voice on every one of them, so twenty-five journals cannot converge', () => {
    for (const r of RESIDENTS) expect(r.voice.length).toBeGreaterThan(40);
    expect(new Set(RESIDENTS.map((r) => r.voice)).size).toBe(25);
  });

  it('gives everybody a life before, a fear, an aspiration and a boarding', () => {
    for (const r of RESIDENTS) {
      expect(r.before.length).toBeGreaterThan(100);
      expect(r.fears.length).toBeGreaterThan(15);
      expect(r.wants.length).toBeGreaterThan(15);
      expect(r.boarding.length).toBeGreaterThan(15);
    }
  });

  it('never leaks our analytical vocabulary into what a resident would know', () => {
    for (const r of RESIDENTS) {
      expect(r.before).not.toMatch(/Cluster/);
      expect(r.boarding).not.toMatch(/Cluster/);
    }
  });
});

describe('what the ship triage decided', () => {
  it('assigned nothing at all to exactly two of them', () => {
    const idle = RESIDENTS.filter((r) => r.duty === null);
    expect([...idle.map((r) => r.id)].sort()).toEqual(['S', 'Y']);
  });

  it('put the reactor in the hands of a bus driver', () => {
    expect(holdersOf('workshops')).toEqual(['J']);
    expect(RESIDENT_BY_ID.J.before).toMatch(/4:40/);
  });

  it('hands out exactly four physical keys, with medical access shared', () => {
    const holders = ['workshops', 'dock', 'infirmary'].flatMap((k) => holdersOf(k as 'workshops' | 'dock' | 'infirmary'));
    expect(holders).toHaveLength(4);
    expect(new Set(holders).size).toBe(4);
  });

  it('only ever names a room that exists', () => {
    for (const r of RESIDENTS) {
      for (const k of r.keys) expect(ROOM_BY_ID[k]).toBeDefined();
    }
  });
});
