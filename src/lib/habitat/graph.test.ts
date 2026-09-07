import { describe, expect, it } from 'vitest';
import { RESIDENTS } from './residents';
import { SPACE, layout } from './graph';
import { edges, pairKey } from './weave';

describe('the layout', () => {
  const nodes = layout();

  it('places all twenty-five and nobody twice', () => {
    expect(nodes).toHaveLength(25);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(25);
    const known = new Set(RESIDENTS.map((r) => r.id));
    for (const n of nodes) expect(known.has(n.id)).toBe(true);
  });

  it('keeps everybody on the page', () => {
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(SPACE);
      expect(n.y).toBeLessThanOrEqual(SPACE);
    }
  });

  it('never stacks two people on the same spot', () => {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const d = Math.hypot(nodes[i]!.x - nodes[j]!.x, nodes[i]!.y - nodes[j]!.y);
        expect(d, `${nodes[i]!.id} and ${nodes[j]!.id}`).toBeGreaterThan(1.5);
      }
    }
  });

  it('is deterministic, so a returning visitor sees the same graph', () => {
    expect(layout()).toEqual(layout());
  });

  it('draws the clusters together, which is the anomaly made visible', () => {
    const by = new Map(nodes.map((n) => [n.id, n]));
    const gap = (a: string, b: string) => Math.hypot(
      by.get(a as never)!.x - by.get(b as never)!.x,
      by.get(a as never)!.y - by.get(b as never)!.y,
    );
    let within = 0;
    let withinN = 0;
    let across = 0;
    let acrossN = 0;
    for (const a of RESIDENTS) {
      for (const b of RESIDENTS) {
        if (a.id >= b.id) continue;
        const d = gap(a.id, b.id);
        if (a.cluster === b.cluster) { within += d; withinN += 1; } else { across += d; acrossN += 1; }
      }
    }
    expect(within / withinN).toBeLessThan(across / acrossN);
  });
});

describe('the two moments', () => {
  it('starts most of them at nothing and ends them somewhere', () => {
    const then = edges('embarkation');
    const now = edges('now');
    const blank = then.filter((e) => e.axes.trust === 0);
    expect(blank.length).toBeGreaterThan(400);
    expect(now.every((e) => e.axes.trust > 0)).toBe(true);
  });

  it('has the two bonds made aboard at nothing before boarding', () => {
    const then = edges('embarkation');
    for (const key of ['AP', 'JK']) {
      const [a, b] = [key[0]!, key[1]!];
      const e = then.find((x) => x.from === a && x.to === b)!;
      expect(e.axes.affection, key).toBe(0);
      expect(e.bonded, key).toBe(false);
    }
    const now = edges('now');
    for (const key of ['AP', 'JK']) {
      const e = now.find((x) => pairKey(x.from, x.to) === key)!;
      expect(e.bonded, key).toBe(true);
    }
  });

  it('carries the prior bonds aboard already made', () => {
    const then = edges('embarkation');
    const mara = then.find((e) => e.from === 'M' && e.to === 'T')!;
    expect(mara.axes.affection).toBeGreaterThan(80);
  });
});
