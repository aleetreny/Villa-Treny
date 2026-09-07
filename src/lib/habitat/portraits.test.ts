import { describe, expect, it } from 'vitest';
import { RESIDENTS } from './residents';
import { HAIRS, PORTRAITS, SKINS, isOld, portraitOf } from './portraits';
import { JOURNAL, journalOf } from './journal';

describe('twenty-five faces', () => {
  it('gives every resident one, and nobody else', () => {
    const ids = RESIDENTS.map((r) => r.id).sort();
    expect(Object.keys(PORTRAITS).sort()).toEqual(ids);
  });

  it('keeps every index inside its palette', () => {
    for (const [id, p] of Object.entries(PORTRAITS)) {
      expect(SKINS[p.skin], id).toBeDefined();
      expect(HAIRS[p.hair], id).toBeDefined();
      expect([0, 1, 2]).toContain(p.brow);
      expect([0, 1, 2]).toContain(p.eyes);
      expect([0, 1, 2]).toContain(p.mouth);
    }
  });

  it('makes no two faces the same, which is the whole reason they are hand-set', () => {
    const seen = Object.values(PORTRAITS).map((p) => JSON.stringify(p));
    expect(new Set(seen).size).toBe(25);
  });

  it('spreads them across the palettes instead of clustering on one tone', () => {
    const skins = new Set(Object.values(PORTRAITS).map((p) => p.skin));
    const hairs = new Set(Object.values(PORTRAITS).map((p) => p.hair));
    const styles = new Set(Object.values(PORTRAITS).map((p) => p.style));
    expect(skins.size).toBeGreaterThanOrEqual(6);
    expect(hairs.size).toBeGreaterThanOrEqual(6);
    expect(styles.size).toBeGreaterThanOrEqual(8);
  });

  it('lets the oldest carry their years', () => {
    expect(isOld('S')).toBe(true);
    expect(isOld('B')).toBe(false);
    expect(portraitOf('S').extra).toBe('lines');
  });
});

describe('the weekly journal', () => {
  it('has an entry for all twenty-five in the week the visitor arrives', () => {
    const week14 = JOURNAL.filter((e) => e.week === 14);
    expect(week14).toHaveLength(25);
    expect(new Set(week14.map((e) => e.who)).size).toBe(25);
  });

  it('names only residents who exist', () => {
    const ids = new Set(RESIDENTS.map((r) => r.id));
    for (const e of JOURNAL) expect(ids.has(e.who)).toBe(true);
  });

  it('is long enough to be a week rather than a log line', () => {
    for (const e of JOURNAL) expect(e.text.length, e.who).toBeGreaterThan(120);
  });

  it('is written in the first person — except by the one person whose voice forbids it', () => {
    const silent = JOURNAL.filter((e) => !/\b(I|my|me|we)\b/.test(e.text));
    // Reva Sandoval almost never says "I". Her diary is indistinguishable from her
    // inventory, which is the observation about her, so this is characterisation
    // rather than a gap. Anybody else turning up here is a gap.
    expect(silent.map((e) => e.who)).toEqual(['R']);
  });

  it('returns a person their own entries, newest week first', () => {
    const mine = journalOf('J');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.who).toBe('J');
    expect(mine[0]!.text).toMatch(/drove a bus/);
  });
});
