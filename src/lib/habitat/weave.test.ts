import { describe, expect, it } from 'vitest';
import { RESIDENTS } from './residents';
import { ROOMS } from './rooms';
import { JOURNAL } from './journal';
import {
  AXES, BONDS, LATENT, asymmetry, bondBetween, clusterOf, edges, modularity,
  pairKey, priorEdges, randomBaseline, withinClusterEdges,
} from './weave';

describe('the axes', () => {
  it('measures six things between two people', () => {
    expect(AXES).toEqual(
      ['trust', 'affection', 'admiration', 'debt', 'resentment', 'desire'],
    );
  });
});

describe('the bonds', () => {
  it('carries twenty-three real bonds and six latent ones', () => {
    expect(BONDS).toHaveLength(23);
    expect(LATENT).toHaveLength(6);
  });

  it('never pairs somebody with themselves', () => {
    for (const b of [...BONDS, ...LATENT]) expect(b.from).not.toBe(b.to);
  });

  it('names only residents who exist', () => {
    const ids = new Set(RESIDENTS.map((r) => r.id));
    for (const b of [...BONDS, ...LATENT]) {
      expect(ids.has(b.from)).toBe(true);
      expect(ids.has(b.to)).toBe(true);
    }
  });

  it('has no duplicate pair, in either direction', () => {
    const edges = priorEdges();
    expect(new Set(edges).size).toBe(edges.length);
    expect(edges).toHaveLength(29);
  });

  it('writes a line for every bond, because no number says what is between two people', () => {
    for (const b of [...BONDS, ...LATENT]) expect(b.line.length).toBeGreaterThan(40);
  });

  it('finds a bond regardless of which way round it is asked', () => {
    expect(bondBetween('U', 'O')).toBeDefined();
    expect(bondBetween('O', 'U')).toBe(bondBetween('U', 'O'));
  });

  it('returns nothing for two people who carried no bond aboard', () => {
    expect(bondBetween('A', 'C')).toBeUndefined();
  });
});

describe('the latent bonds', () => {
  it('runs one way: one of them knows and the other does not', () => {
    for (const l of LATENT) expect(l.knower).toBe(l.from);
  });

  it('gives every one of them a route to surfacing, so no dotted edge can fail to resolve', () => {
    for (const l of LATENT) expect(l.route.length).toBeGreaterThan(30);
  });

  it('leaves Juno holding the one she does not know she is holding', () => {
    const juno = LATENT.find((l) => l.from === 'J' && l.to === 'R');
    expect(juno).toBeDefined();
    expect(juno!.line).toMatch(/transit station/);
  });
});

describe('the anomaly is a measurement, not a claim', () => {
  it('puts twenty-three of the twenty-nine bonds inside a cluster', () => {
    expect(withinClusterEdges(priorEdges())).toBe(23);
  });

  it('scores far above what chance produces on the five-way partition', () => {
    const observed = modularity(priorEdges());
    const base = randomBaseline(7, priorEdges().length, 2000);
    expect(observed).toBeGreaterThan(0.5);
    expect(base.meanModularity).toBeLessThan(0.15);
    expect(base.meanWithin).toBeLessThan(8);
    // Not one random graph in two thousand reaches it.
    expect(base.atLeastAsExtreme).toBe(0);
  });

  it('is reproducible, because the baseline is seeded', () => {
    expect(randomBaseline(7, 29, 200)).toEqual(randomBaseline(7, 29, 200));
  });

  it('assigns every resident to exactly one cluster', () => {
    for (const r of RESIDENTS) expect(clusterOf(r.id)).toBe(r.cluster);
  });

  it('orders a pair the same way whichever end it is given', () => {
    expect(pairKey('Y', 'A')).toBe(pairKey('A', 'Y'));
  });
});

describe('authored prose is prose', () => {
  // All of this was transcribed out of markdown design records, and a heading
  // once rode along inside a bond's text all the way to the screen. Nothing that
  // reaches a reader should carry the marks of the document it came from.
  const everything: Array<[string, string]> = [
    ...BONDS.map((b, i) => [`bond ${i}`, b.line] as [string, string]),
    ...LATENT.flatMap((b, i) => [
      [`latent ${i} line`, b.line], [`latent ${i} route`, b.route],
    ] as Array<[string, string]>),
    ...RESIDENTS.flatMap((r) => [
      [`${r.id} before`, r.before], [`${r.id} fears`, r.fears],
      [`${r.id} wants`, r.wants], [`${r.id} boarding`, r.boarding],
      [`${r.id} voice`, r.voice],
    ] as Array<[string, string]>),
    ...JOURNAL.map((e) => [`journal ${e.who}`, e.text] as [string, string]),
    ...ROOMS.flatMap((r) => [
      [`${r.id} description`, r.description],
      ...(r.note ? [[`${r.id} note`, r.note] as [string, string]] : []),
    ] as Array<[string, string]>),
  ];

  it('carries no heading, emphasis, list marker or table pipe', () => {
    for (const [where, text] of everything) {
      expect(text, where).not.toMatch(/#{2,}/);
      expect(text, where).not.toMatch(/\*\*/);
      expect(text, where).not.toMatch(/\|/);
      expect(text, where).not.toMatch(/^\s*[-*]\s/);
    }
  });

  it('carries no collapsed newline, so nothing was glued to its neighbour', () => {
    for (const [where, text] of everything) {
      expect(text, where).not.toMatch(/\n/);
      expect(text, where).not.toMatch(/ {2,}/);
    }
  });
});

describe('the weave as numbers', () => {
  const all = edges();
  const at = (from: string, to: string) => all.find((e) => e.from === from && e.to === to)!;

  it('has an edge each way between every pair, and none from anybody to themselves', () => {
    expect(all).toHaveLength(25 * 24);
    expect(all.some((e) => e.from === e.to)).toBe(false);
  });

  it('keeps every axis inside nought and a hundred', () => {
    for (const e of all) {
      for (const axis of AXES) {
        expect(e.axes[axis], `${e.from}${e.to} ${axis}`).toBeGreaterThanOrEqual(0);
        expect(e.axes[axis], `${e.from}${e.to} ${axis}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('leaves nobody a stranger after a hundred days in sixteen rooms', () => {
    for (const e of all) expect(e.axes.trust, `${e.from}${e.to}`).toBeGreaterThan(0);
  });

  it('marks exactly the twenty-nine authored pairs as bonded', () => {
    const bonded = new Set(all.filter((e) => e.bonded).map((e) => pairKey(e.from, e.to)));
    expect(bonded.size).toBe(29);
  });

  it('runs one way: Mara blames Iris and Iris does not blame her back', () => {
    expect(at('M', 'I').axes.resentment).toBeGreaterThan(70);
    expect(at('I', 'M').axes.resentment).toBeLessThan(20);
    expect(asymmetry(at('M', 'I'), at('I', 'M'))).toBeGreaterThan(15);
  });

  it('lets somebody be admired by a person who is not trusted back', () => {
    // Gita was hard on Quim because he was good. He resents her for it and does
    // not know the reason was admiration.
    expect(at('G', 'Q').axes.admiration).toBeGreaterThan(70);
    expect(at('Q', 'G').axes.resentment).toBeGreaterThan(50);
  });

  it('puts the heaviest debt on the man who could not reach her father', () => {
    const heaviest = [...all].sort((a, b) => b.axes.debt - a.axes.debt)[0]!;
    expect(`${heaviest.from}${heaviest.to}`).toBe('SA');
  });

  it('counts the asymmetric pairs, which is where the drama is', () => {
    const lopsided = all.filter((e) => {
      const back = at(e.to, e.from);
      return asymmetry(e, back) > 12;
    });
    expect(lopsided.length).toBeGreaterThan(10);
  });
});
