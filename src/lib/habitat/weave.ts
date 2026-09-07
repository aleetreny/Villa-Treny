// What is between them.
//
// Six directed axes, because I may trust you a great deal more than you trust me
// and that difference is half of all human drama. Plus a written line per pair,
// because no number captures what is between two particular people: the axes are
// the instrument and the line is the person.
//
// The graph the twenty-five carried aboard is clustered far past what chance would
// produce, and nothing explains it. Not something withheld from the residents —
// something that does not exist. The measurement lives here, and in weave.test.ts,
// so that editing a bond cannot quietly destroy the fact.

import { mulberry32 } from './random';
import { AUTHORED, BASELINE, SAME_CLUSTER_BONUS, type AxisSet, type Directed } from './axes';
import { RESIDENTS, type Cluster, type ResidentId } from './residents';

export const AXES = [
  'trust', 'affection', 'admiration', 'debt', 'resentment', 'desire',
] as const;
export type Axis = (typeof AXES)[number];

export type Degree = 'nothing' | 'by-sight' | 'spoken' | 'real' | 'latent';

export type Bond = {
  from: ResidentId;
  to: ResidentId;
  degree: 'real';
  /** What no scale captures. Revised when something changes between them. */
  line: string;
};

export type LatentBond = {
  from: ResidentId;
  to: ResidentId;
  degree: 'latent';
  /** Always `from`. One of them knows and the other does not. */
  knower: ResidentId;
  line: string;
  /** What would have to happen in the world for it to come out. A latent bond
   *  with no route is a dotted edge that never resolves, which would be a cheat. */
  route: string;
};

export const BONDS: readonly Bond[] = [
  {
    from: 'U', to: 'O', degree: 'real',
    line:
      'Half-siblings. Nineteen years without a word, over a house neither of '
      + 'them ended up with. Neither knew the other had booked. They have been '
      + 'civil for a hundred days and it is costing them both.',
  },
  {
    from: 'S', to: 'X', degree: 'real',
    line:
      'Sten taught Xan to swim, forty-eight years ago. Xan is sixty and still '
      + 'defers to him. Sten finds it embarrassing and does not say so.',
  },
  {
    from: 'A', to: 'U', degree: 'real',
    line:
      'Schoolmates. Fond, thin, entirely uncomplicated — the only bond in '
      + 'Cluster I with nothing wrong with it.',
  },
  {
    from: 'X', to: 'A', degree: 'real',
    line:
      'Same street. He remembers her family better than she remembers his.',
  },
  {
    from: 'S', to: 'O', degree: 'real',
    line:
      'Sten knew Osvald\'s father off the harbour. Osvald treats him with a '
      + 'respect he has never extended to anybody else, and cannot explain it.',
  },
  {
    from: 'H', to: 'Q', degree: 'real',
    line:
      'Halim blocked Quim\'s promotion twice and believes he was right. Quim '
      + 'knows it, and has arranged his whole professional self-image around '
      + 'it.',
  },
  {
    from: 'H', to: 'G', degree: 'real',
    line:
      'Twenty years of working well together with no warmth whatsoever. Each '
      + 'would trust the other with their life and neither would sit with them.',
  },
  {
    from: 'G', to: 'Q', degree: 'real',
    line:
      'Gita was hard on him because he was good. Quim resents her for it and '
      + 'does not know the reason was admiration.',
  },
  {
    from: 'D', to: 'H', degree: 'real',
    line:
      'Dima reported a structural fault; Halim buried it; the fault was real; '
      + 'nobody was hurt, which is luck and both of them know it. Neither has '
      + 'mentioned it in a hundred days. It is the loudest silence in the '
      + 'habitat.',
  },
  {
    from: 'Q', to: 'W', degree: 'real',
    line:
      'Two overlapping years, easy, superficial, genuinely warm. The most '
      + 'functional working relationship in Cluster II by a distance.',
  },
  {
    from: 'M', to: 'T', degree: 'real',
    line:
      'Thirty years. The closest bond that came aboard.',
  },
  {
    from: 'T', to: 'V', degree: 'real',
    line:
      'Her uncle. He took his sister\'s side in a rupture Vero refuses to have '
      + 'sides about. She loves him and will not discuss it.',
  },
  {
    from: 'M', to: 'V', degree: 'real',
    line:
      'Mara has known her since she was nine and mothers her. Vero finds it '
      + 'suffocating and cannot say so without cruelty.',
  },
  {
    from: 'F', to: 'M', degree: 'real',
    line:
      'He carried words between people for years and everyone knew it. She '
      + 'likes him and does not trust him, in that order.',
  },
  {
    from: 'F', to: 'I', degree: 'real',
    line:
      'He brought her into that circle, which is the origin of everything '
      + 'that went wrong there. Faded now into something almost fond.',
  },
  {
    from: 'M', to: 'I', degree: 'real',
    line:
      'Blame, twenty-two years old and undimmed. Iris knows exactly what she '
      + 'is blamed for and has decided to absorb it.',
  },
  {
    from: 'P', to: 'K', degree: 'real',
    line:
      'Same building, nine years. Warm, daily, shallow, and it has survived '
      + 'the crash better than any of the deep bonds.',
  },
  {
    from: 'K', to: 'J', degree: 'real',
    line:
      'He rode her route. Nodding acquaintance that has turned, in a hundred '
      + 'days, into something neither expected.',
  },
  {
    from: 'L', to: 'P', degree: 'real',
    line:
      'Lior owed the bakery money and is embarrassed. Pilar wrote it off '
      + 'years ago and cannot understand why he is odd with her.',
  },
  {
    from: 'C', to: 'Y', degree: 'real',
    line:
      'He was briefly her clinician. Neither has raised it. It makes every '
      + 'conversation between them slightly wrong.',
  },
  {
    from: 'C', to: 'N', degree: 'real',
    line:
      'Two doctors who met at conferences. Weak, cordial, and now the axis on '
      + 'which the habitat\'s entire medical politics turns. They come from '
      + 'different parts of the structure, which is why neither can place the '
      + 'other.',
  },
  {
    from: 'F', to: 'H', degree: 'real',
    line:
      'Ferran drew for the yard for one season, twenty-odd years ago, and '
      + 'neither of them thought about it again until they recognised each '
      + 'other across the Common on the fourth day. Halim has since remembered '
      + 'that the drawings were good and that he never said so.',
  },
  {
    from: 'P', to: 'A', degree: 'real',
    line:
      'Same region originally. They recognised the accent in the first week. '
      + 'This bond formed after the crash — the first new real bond in the '
      + 'habitat, and the proof that the weave grows.',
  },
];

export const LATENT: readonly LatentBond[] = [
  {
    from: 'E', to: 'B', degree: 'latent', knower: 'E',
    line:
      'Bex sold Edda her ticket. Edda remembers the desk, the office and the '
      + 'conversation. Bex sold thousands of fares that year and has no memory '
      + 'of her at all. Edda has not mentioned it, for the ordinary reason that '
      + 'the longer you do not mention something the stranger it becomes to '
      + 'mention it. A hundred days in, saying you sold me my ticket would now '
      + 'require explaining why she did not say it on the first day.',
    route:
      'anything that reaches the booking office, the fares, or how each of '
      + 'them came to be here; Bex recognising her unprompted; Edda deciding '
      + 'the weight of not-saying has overtaken the weight of saying.',
  },
  {
    from: 'G', to: 'L', degree: 'latent', knower: 'G',
    line:
      'Gita was the anonymous lender behind a debt Lior never repaid. He '
      + 'never learned who had lent it. She has known his face since the first '
      + 'week and has said nothing, partly out of tact and mostly because she '
      + 'enjoys it.',
    route:
      'Gita chooses to say it; or a debt dispute inside the habitat pushes '
      + 'her into saying it to make a point about character.',
  },
  {
    from: 'J', to: 'R', degree: 'latent', knower: 'J',
    line:
      'Juno was in a transit station some years ago and watched Reva sit with '
      + 'a crying older woman for forty minutes and then walk away without '
      + 'giving her name. It is the kindest thing Juno has ever seen a stranger '
      + 'do and she has never forgotten the face. Reva has no memory of the '
      + 'afternoon at all.',
    route:
      'Juno mentions it — most likely as a compliment, at a bad moment, '
      + 'meaning well.',
  },
  {
    from: 'N', to: 'V', degree: 'latent', knower: 'N',
    line:
      'Noor treated Vero\'s mother in her final year and was there at the end. '
      + 'Vero has no idea; she was not the one dealing with the doctors.',
    route:
      'any conversation that reaches Vero\'s mother; a death in the habitat '
      + 'that puts Noor back in that room; Noor breaking under it.',
  },
  {
    from: 'W', to: 'D', degree: 'latent', knower: 'W',
    line:
      'Wen saw Dima falsify a safety log at the yard and never reported it. '
      + 'Dima does not know he was seen. Wen has watched Dima hold the key to '
      + 'the suits for a hundred days.',
    route:
      'a safety failure in the habitat that echoes it; Dima\'s control of the '
      + 'dock becoming contested; Wen deciding that keeping quiet twice is '
      + 'different from keeping quiet once.',
  },
  {
    from: 'S', to: 'A', degree: 'latent', knower: 'S',
    line:
      'Ama\'s father drowned off Kilbeg when she was four. Sten was the '
      + 'lifeguard who could not reach him. It is the defining shame of a '
      + 'seventy-eight-year-old life. Ama does not know he was there, and has '
      + 'been perfectly warm to him for a hundred days.',
    route:
      'anything about the sea, Kilbeg, or drowning; Sten near death; Ama '
      + 'asking about her father, which she does perhaps once a year.',
  },
];

const CLUSTER_OF = new Map<ResidentId, Cluster>(
  RESIDENTS.map((r) => [r.id, r.cluster]),
);

export function clusterOf(id: ResidentId): Cluster {
  return CLUSTER_OF.get(id)!;
}

/** An undirected pair in a stable order, so a bond can be looked up either way. */
export function pairKey(a: ResidentId, b: ResidentId): string {
  return a < b ? `${a}${b}` : `${b}${a}`;
}

const BY_PAIR = new Map(BONDS.map((b) => [pairKey(b.from, b.to), b]));

export function bondBetween(a: ResidentId, b: ResidentId): Bond | undefined {
  return BY_PAIR.get(pairKey(a, b));
}

export function withinClusterEdges(edges: readonly string[]): number {
  return edges.filter((e) => {
    const a = e[0] as ResidentId;
    const b = e[1] as ResidentId;
    return clusterOf(a) === clusterOf(b);
  }).length;
}

/** Newman modularity of the authored five-way partition. */
export function modularity(edges: readonly string[]): number {
  const m = edges.length;
  if (m === 0) return 0;
  const degree = new Map<ResidentId, number>();
  for (const e of edges) {
    for (const ch of [e[0], e[1]] as ResidentId[]) {
      degree.set(ch, (degree.get(ch) ?? 0) + 1);
    }
  }
  let q = 0;
  for (const c of ['I', 'II', 'III', 'IV', 'V'] as const) {
    const members = RESIDENTS.filter((r) => r.cluster === c).map((r) => r.id);
    const inside = edges.filter(
      (e) => clusterOf(e[0] as ResidentId) === c && clusterOf(e[1] as ResidentId) === c,
    ).length;
    const stubs = members.reduce((n, id) => n + (degree.get(id) ?? 0), 0);
    q += inside / m - (stubs / (2 * m)) ** 2;
  }
  return q;
}

/** Every edge the twenty-five carried aboard, real and latent alike. */
export function priorEdges(): string[] {
  return [...BONDS, ...LATENT].map((b) => pairKey(b.from, b.to));
}

export type Baseline = {
  meanWithin: number;
  meanModularity: number;
  /** How many random graphs matched or beat the real one on within-cluster edges. */
  atLeastAsExtreme: number;
};

/** Erdős–Rényi graphs of the same order and size, for comparison. Seeded, so the
 *  numbers quoted in the design record are reproducible. */
export function randomBaseline(
  seed: number, edgeCount: number, trials: number,
): Baseline {
  const ids = RESIDENTS.map((r) => r.id);
  const allPairs: string[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) allPairs.push(pairKey(ids[i]!, ids[j]!));
  }
  const rand = mulberry32(seed);
  const observed = withinClusterEdges(priorEdges());
  let within = 0;
  let mod = 0;
  let extreme = 0;
  for (let t = 0; t < trials; t += 1) {
    const pool = [...allPairs];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const sample = pool.slice(0, edgeCount);
    const w = withinClusterEdges(sample);
    within += w;
    mod += modularity(sample);
    if (w >= observed) extreme += 1;
  }
  return {
    meanWithin: within / trials,
    meanModularity: mod / trials,
    atLeastAsExtreme: extreme,
  };
}

// ── the whole weave, as numbers ──────────────────────────────────────────────

export type Edge = {
  from: ResidentId;
  to: ResidentId;
  /** Zero to a hundred on each of the six. Directed: this is what `from` holds
   *  towards `to`, which is not what `to` holds back. */
  axes: Record<Axis, number>;
  /** Whether anything was authored here, or it is only a hundred days of
   *  sharing sixteen rooms. */
  bonded: boolean;
  latent: boolean;
};

function fill(set: AxisSet, sameCluster: boolean): Record<Axis, number> {
  const out = {} as Record<Axis, number>;
  for (const axis of AXES) {
    const authored = set[axis];
    if (authored !== undefined) out[axis] = authored;
    else out[axis] = BASELINE[axis] + (sameCluster ? SAME_CLUSTER_BONUS : 0);
  }
  return out;
}

const LATENT_PAIRS = new Set(LATENT.map((b) => pairKey(b.from, b.to)));
const BONDED_PAIRS = new Set([...BONDS, ...LATENT].map((b) => pairKey(b.from, b.to)));

/** The two moments the weave has so far. `embarkation` is what they carried
 *  aboard and nothing else: twenty-five people who mostly had never met, and the
 *  handful who had. `now` is day one hundred, with a hundred days of sharing
 *  sixteen rooms on top. Every later day is a third moment, a fourth, and so on,
 *  and the scrubber walks them. */
export type When = 'embarkation' | 'now';

/** Bonds that did not exist before the crash. They are the proof the weave grows,
 *  and at embarkation they are nothing at all. */
const FORMED_ABOARD = new Set(['AP', 'JK']);

/** Every directed edge between every pair: six hundred of them. Authored where
 *  somebody wrote one, and otherwise what a hundred days in the same sixteen
 *  rooms is worth on its own — because after a hundred days nobody here is a
 *  stranger, whatever else they are. */
export function edges(when: When = 'now'): Edge[] {
  const ids = RESIDENTS.map((r) => r.id);
  const out: Edge[] = [];
  for (const from of ids) {
    for (const to of ids) {
      if (from === to) continue;
      const sameCluster = clusterOf(from) === clusterOf(to);
      const key = pairKey(from, to);
      const forward = AUTHORED[`${from}${to}` as Directed];
      const backward = AUTHORED[`${to}${from}` as Directed];
      const set = forward?.fwd ?? backward?.bwd ?? {};
      const authored = forward !== undefined || backward !== undefined;
      const formedAboard = FORMED_ABOARD.has(key);
      let axes: Record<Axis, number>;
      if (when === 'now') {
        axes = fill(set, sameCluster);
      } else if (authored && !formedAboard) {
        // Whatever they carried aboard, without the hundred days on top.
        axes = fill(set, false);
      } else {
        // Strangers, and the two bonds that were made in here.
        axes = { trust: 0, affection: 0, admiration: 0, debt: 0, resentment: 0, desire: 0 };
      }
      out.push({
        from,
        to,
        axes,
        bonded: BONDED_PAIRS.has(key) && !(when === 'embarkation' && formedAboard),
        latent: LATENT_PAIRS.has(key),
      });
    }
  }
  return out;
}

/** How strongly `from` is drawn towards `to`, for laying the graph out. Debt and
 *  resentment pull people into each other's orbit as surely as affection does. */
export function pull(e: Edge): number {
  const { trust, affection, admiration, debt, resentment, desire } = e.axes;
  return (trust + affection + admiration + debt + resentment + desire) / 6;
}

/** The gap between what two people hold for each other. Half of all drama. */
export function asymmetry(a: Edge, b: Edge): number {
  return AXES.reduce((n, axis) => n + Math.abs(a.axes[axis] - b.axes[axis]), 0) / AXES.length;
}
