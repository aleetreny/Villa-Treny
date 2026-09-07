// How much of each thing, in which direction.
//
// The six axes are the instrument and the written line is the person, and this is
// the instrument half. Every number is authored against that bond's own line: Mara
// blames Iris at seventy-two and Iris returns eleven, because absorbing blame is a
// decision and not a feeling. Nothing here is derived from the prose, because
// deriving it would quietly get one wrong and nobody would notice.
//
// Zero to a hundred, directed. `fwd` runs from → to; `bwd` runs back. An axis left
// out is the baseline for that degree of acquaintance, not zero: two people who
// have shared sixteen rooms for a hundred days are not strangers, whatever else
// they are.

import type { Axis } from './weave';
import type { ResidentId } from './residents';

export type AxisSet = Partial<Record<Axis, number>>;

/** A directed pair key: the two initials, from then to. */
export type Directed = `${ResidentId}${ResidentId}`;

/** What a hundred days in the same sixteen rooms is worth on its own, before
 *  anybody has done anything to anybody. */
export const BASELINE: Record<Axis, number> = {
  trust: 22, affection: 18, admiration: 12, debt: 0, resentment: 6, desire: 2,
};

/** A little more for people who arrived out of the same part of their lives. */
export const SAME_CLUSTER_BONUS = 8;

export const AUTHORED: Partial<Record<Directed, { fwd: AxisSet; bwd: AxisSet }>> = {
  // Kilbeg.
  UO: { // Ulla → Osvald. Half-siblings, nineteen years silent.
    fwd: { trust: 44, affection: 58, resentment: 66, admiration: 20 },
    bwd: { trust: 38, affection: 52, resentment: 74, admiration: 16 },
  },
  SX: { // Sten taught Xan to swim.
    fwd: { trust: 74, affection: 68, admiration: 30, resentment: 4 },
    bwd: { trust: 88, affection: 76, admiration: 82, resentment: 2 },
  },
  AU: { // Schoolmates. The only bond in Kilbeg with nothing wrong with it.
    fwd: { trust: 70, affection: 66, admiration: 28 },
    bwd: { trust: 72, affection: 68, admiration: 24 },
  },
  XA: { // Same street. He remembers her family better than she remembers his.
    fwd: { trust: 62, affection: 58, admiration: 22 },
    bwd: { trust: 54, affection: 44, admiration: 20 },
  },
  SO: { // Sten knew Osvald's father off the harbour.
    fwd: { trust: 60, affection: 46, admiration: 18 },
    bwd: { trust: 78, affection: 40, admiration: 74 },
  },

  // The yard.
  HQ: { // Halim blocked Quim twice and believes he was right.
    fwd: { trust: 58, affection: 24, admiration: 46, resentment: 18 },
    bwd: { trust: 30, affection: 12, admiration: 34, resentment: 78 },
  },
  HG: { // Twenty years of working well together with no warmth at all.
    fwd: { trust: 88, affection: 10, admiration: 66 },
    bwd: { trust: 86, affection: 8, admiration: 62 },
  },
  GQ: { // She was hard on him because he was good.
    fwd: { trust: 66, affection: 30, admiration: 74 },
    bwd: { trust: 40, affection: 14, admiration: 44, resentment: 62 },
  },
  DH: { // A buried safety report, and a hundred days of not mentioning it.
    fwd: { trust: 26, affection: 12, resentment: 58, debt: 34 },
    bwd: { trust: 30, affection: 14, resentment: 44, debt: 40 },
  },
  QW: { // Two overlapping years, easy and genuinely warm.
    fwd: { trust: 76, affection: 64, admiration: 40 },
    bwd: { trust: 74, affection: 60, admiration: 52 },
  },

  // The household.
  MT: { // Thirty years. The closest bond that came aboard.
    fwd: { trust: 92, affection: 90, admiration: 54 },
    bwd: { trust: 90, affection: 88, admiration: 58 },
  },
  TV: { // Uncle and niece, on opposite sides of a rupture she refuses to take.
    fwd: { trust: 62, affection: 78, resentment: 34 },
    bwd: { trust: 58, affection: 80, resentment: 28 },
  },
  MV: { // Mothers her; she finds it suffocating and cannot say so.
    fwd: { trust: 74, affection: 86, admiration: 30 },
    bwd: { trust: 50, affection: 54, resentment: 48 },
  },
  FM: { // She likes him and does not trust him, in that order.
    fwd: { trust: 60, affection: 70, admiration: 44 },
    bwd: { trust: 32, affection: 64, admiration: 30 },
  },
  FI: { // He brought her into that circle. Faded into something almost fond.
    fwd: { trust: 54, affection: 50, admiration: 26 },
    bwd: { trust: 52, affection: 46, admiration: 22, resentment: 20 },
  },
  MI: { // Blame, twenty-two years old and undimmed. Iris absorbs it.
    fwd: { trust: 14, affection: 8, resentment: 84 },
    bwd: { trust: 40, affection: 26, resentment: 11, debt: 52 },
  },

  // The street.
  PK: { // Same building, nine years. Warm, daily, shallow, and it survived.
    fwd: { trust: 80, affection: 74, admiration: 26 },
    bwd: { trust: 82, affection: 78, admiration: 32 },
  },
  KJ: { // He rode her route. Turned in a hundred days into something neither expected.
    fwd: { trust: 68, affection: 62, admiration: 40, desire: 44 },
    bwd: { trust: 66, affection: 64, admiration: 46, desire: 38 },
  },
  LP: { // He owed the bakery and is embarrassed; she wrote it off years ago.
    fwd: { trust: 56, affection: 58, debt: 62, resentment: 8 },
    bwd: { trust: 60, affection: 66, debt: 0 },
  },

  // The last years.
  CY: { // He was briefly her clinician. Neither has raised it.
    fwd: { trust: 48, affection: 30, admiration: 24 },
    bwd: { trust: 44, affection: 26, admiration: 38, resentment: 22 },
  },

  // The bridges.
  CN: { // Two doctors who met at conferences, now the whole medical politics.
    fwd: { trust: 52, affection: 22, admiration: 40 },
    bwd: { trust: 46, affection: 28, admiration: 34, resentment: 24 },
  },
  FH: { // One season of drawings, and a compliment never paid.
    fwd: { trust: 50, affection: 34, admiration: 30 },
    bwd: { trust: 52, affection: 30, admiration: 56, debt: 18 },
  },
  PA: { // The first new real bond in the habitat. Formed after the crash.
    fwd: { trust: 64, affection: 68, admiration: 30 },
    bwd: { trust: 66, affection: 70, admiration: 34 },
  },

  // The latent ones. The knower's side carries the weight; the other side is
  // ordinary, which is exactly what makes it unbearable to look at.
  EB: { // Edda sold nothing; Bex sold her the ticket and does not remember.
    fwd: { trust: 40, affection: 34, debt: 26 },
    bwd: { trust: 36, affection: 30 },
  },
  GL: { // Gita was the anonymous lender and enjoys knowing it.
    fwd: { trust: 34, affection: 26, admiration: 10, debt: 0 },
    bwd: { trust: 42, affection: 40 },
  },
  JR: { // Juno saw her do the kindest thing she has seen a stranger do.
    fwd: { trust: 72, affection: 54, admiration: 80 },
    bwd: { trust: 44, affection: 36 },
  },
  NV: { // Noor was there at the end of Vero's mother.
    fwd: { trust: 40, affection: 44, debt: 56, resentment: 14 },
    bwd: { trust: 46, affection: 38 },
  },
  WD: { // Wen saw the log falsified and said nothing, twice.
    fwd: { trust: 18, affection: 14, admiration: 6, resentment: 46 },
    bwd: { trust: 44, affection: 32 },
  },
  SA: { // Sten could not reach her father. She has been warm to him for a hundred days.
    fwd: { trust: 56, affection: 62, debt: 88, resentment: 0 },
    bwd: { trust: 68, affection: 60, admiration: 30 },
  },
};
