// Where to put twenty-five people on a page.
//
// Not a physics simulation: a deterministic layout, run for a fixed number of
// steps from a fixed start, so the graph is the same graph every time it is
// drawn and a returning visitor recognises it. The clusters are seeded around a
// ring because that is the honest shape of the data — five dense groups with four
// bridges — and then a few relaxation passes let the bridges pull them about so
// it does not read as a diagram of five circles.

import { RESIDENTS, type Cluster, type ResidentId } from './residents';
import { edges, pull, type When } from './weave';

export type Node = { id: ResidentId; x: number; y: number };

const CLUSTERS: readonly Cluster[] = ['I', 'II', 'III', 'IV', 'V'];

/** Layout space. Square, so the view can scale it however it likes. */
export const SPACE = 100;

/** Below this, what is between two people is only proximity. */
const FLOOR = 22;

export function layout(when: When = 'now', steps = 220): Node[] {
  const nodes: Node[] = RESIDENTS.map((r) => {
    const ci = CLUSTERS.indexOf(r.cluster);
    const within = RESIDENTS.filter((o) => o.cluster === r.cluster).findIndex((o) => o.id === r.id);
    const ringA = (ci / CLUSTERS.length) * Math.PI * 2 - Math.PI / 2;
    const ringB = (within / 5) * Math.PI * 2;
    return {
      id: r.id,
      x: SPACE / 2 + Math.cos(ringA) * 30 + Math.cos(ringB) * 9,
      y: SPACE / 2 + Math.sin(ringA) * 30 + Math.sin(ringB) * 9,
    };
  });

  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const all = edges(when);
  const back = new Map(all.map((e) => [`${e.from}${e.to}`, e]));
  const links = all
    .filter((e) => e.from < e.to)
    .map((e) => {
      // Two people pull on each other by however much passes between them, in
      // both directions: one-sided debt draws you in as surely as affection.
      const both = (pull(e) + pull(back.get(`${e.to}${e.from}`)!)) / 2;
      // A hundred days of sharing sixteen rooms is not a bond and must not pull
      // like one, or the five groups the data actually has are flattened into an
      // even mesh and the anomaly stops being visible.
      const over = Math.max(0, both - FLOOR);
      return { a: index.get(e.from)!, b: index.get(e.to)!, strength: (over / 60) ** 1.4 };
    })
    .filter((l) => l.strength > 0);

  for (let step = 0; step < steps; step += 1) {
    const cool = 1 - step / steps;
    // Everybody pushes everybody away, so nobody sits on anybody.
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = Math.max(1.2, dx * dx + dy * dy);
        const f = (95 / d2) * cool;
        const d = Math.sqrt(d2);
        a.x -= (dx / d) * f;
        a.y -= (dy / d) * f;
        b.x += (dx / d) * f;
        b.y += (dy / d) * f;
      }
    }
    // What is between two people pulls them together.
    for (const l of links) {
      const a = nodes[l.a]!;
      const b = nodes[l.b]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(0.6, Math.hypot(dx, dy));
      const f = (d - 12) * 0.09 * l.strength * cool;
      a.x += (dx / d) * f;
      a.y += (dy / d) * f;
      b.x -= (dx / d) * f;
      b.y -= (dy / d) * f;
    }
    // And the page has edges.
    for (const n of nodes) {
      n.x = Math.min(SPACE - 6, Math.max(6, n.x));
      n.y = Math.min(SPACE - 6, Math.max(6, n.y));
    }
  }
  return nodes;
}
