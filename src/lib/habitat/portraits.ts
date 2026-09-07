// Twenty-five faces.
//
// Parametric so they can be drawn in a few hundred bytes of code rather than
// shipped as images, and then hand-set one by one, because a generator left to
// itself produces twenty-five variations and what this needs is twenty-five
// people. Every field below was chosen against that resident's own dossier: Sten
// is seventy-eight and it shows, Reva is unremarkable on purpose, and Cato does
// not soften anything, including his mouth.
//
// No drawing here — this file is data, like everything else in lib/habitat.
// Portrait.tsx turns a spec into pixels.

import { RESIDENTS, type ResidentId } from './residents';

export const SKINS = [
  '#f0cfae', '#e0b189', '#c98f63', '#a86f45', '#8a5533', '#633d24', '#452a19', '#f6ddc6',
] as const;

export const HAIRS = [
  '#1c1712', '#3b2a1c', '#6b4423', '#9a6b34', '#c9993f', '#d9d2c4',
  '#a9a49b', '#7a7873', '#f2efe8', '#2b3a4a',
] as const;

export type HairStyle =
  | 'crop' | 'long' | 'tied' | 'bald' | 'wave' | 'braid' | 'tuft' | 'coils'
  | 'bob' | 'receded';

export type Extra =
  | 'none' | 'glasses' | 'beard' | 'stubble' | 'earring' | 'lines' | 'weathered';

export type Portrait = {
  skin: number;
  hair: number;
  style: HairStyle;
  /** 0 flat, 1 raised, 2 heavy. */
  brow: 0 | 1 | 2;
  /** 0 round, 1 narrow, 2 wide-set. */
  eyes: 0 | 1 | 2;
  /** 0 a line, 1 turned down, 2 turned up. */
  mouth: 0 | 1 | 2;
  extra: Extra;
};

export const PORTRAITS: Record<ResidentId, Portrait> = {
  // Kilbeg.
  S: { skin: 0, hair: 8, style: 'bald', brow: 2, eyes: 1, mouth: 1, extra: 'lines' },
  X: { skin: 1, hair: 6, style: 'crop', brow: 2, eyes: 1, mouth: 0, extra: 'weathered' },
  O: { skin: 7, hair: 8, style: 'crop', brow: 2, eyes: 0, mouth: 1, extra: 'beard' },
  U: { skin: 0, hair: 6, style: 'bob', brow: 1, eyes: 0, mouth: 2, extra: 'lines' },
  A: { skin: 5, hair: 6, style: 'coils', brow: 0, eyes: 1, mouth: 0, extra: 'glasses' },

  // The yard.
  H: { skin: 3, hair: 7, style: 'receded', brow: 2, eyes: 1, mouth: 0, extra: 'beard' },
  G: { skin: 3, hair: 6, style: 'tied', brow: 0, eyes: 1, mouth: 0, extra: 'none' },
  Q: { skin: 1, hair: 3, style: 'tuft', brow: 1, eyes: 0, mouth: 2, extra: 'stubble' },
  D: { skin: 0, hair: 7, style: 'receded', brow: 2, eyes: 1, mouth: 1, extra: 'stubble' },
  W: { skin: 7, hair: 0, style: 'crop', brow: 0, eyes: 1, mouth: 0, extra: 'none' },

  // The household.
  F: { skin: 1, hair: 6, style: 'wave', brow: 1, eyes: 0, mouth: 2, extra: 'none' },
  T: { skin: 1, hair: 7, style: 'receded', brow: 0, eyes: 1, mouth: 0, extra: 'glasses' },
  M: { skin: 6, hair: 5, style: 'braid', brow: 1, eyes: 0, mouth: 2, extra: 'earring' },
  I: { skin: 0, hair: 6, style: 'long', brow: 0, eyes: 2, mouth: 1, extra: 'none' },
  V: { skin: 2, hair: 1, style: 'tied', brow: 1, eyes: 0, mouth: 2, extra: 'earring' },

  // The street.
  P: { skin: 1, hair: 8, style: 'tied', brow: 1, eyes: 0, mouth: 2, extra: 'lines' },
  L: { skin: 2, hair: 1, style: 'wave', brow: 1, eyes: 2, mouth: 2, extra: 'stubble' },
  K: { skin: 6, hair: 0, style: 'coils', brow: 0, eyes: 2, mouth: 0, extra: 'none' },
  N: { skin: 4, hair: 0, style: 'tied', brow: 0, eyes: 0, mouth: 0, extra: 'none' },
  J: { skin: 2, hair: 2, style: 'crop', brow: 1, eyes: 0, mouth: 2, extra: 'none' },

  // The last years.
  E: { skin: 0, hair: 6, style: 'bob', brow: 0, eyes: 1, mouth: 0, extra: 'glasses' },
  C: { skin: 0, hair: 7, style: 'crop', brow: 0, eyes: 1, mouth: 0, extra: 'none' },
  Y: { skin: 3, hair: 0, style: 'long', brow: 1, eyes: 2, mouth: 2, extra: 'none' },
  R: { skin: 1, hair: 2, style: 'bob', brow: 0, eyes: 0, mouth: 0, extra: 'none' },
  B: { skin: 4, hair: 1, style: 'tied', brow: 1, eyes: 0, mouth: 2, extra: 'none' },
};

export function portraitOf(id: ResidentId): Portrait {
  return PORTRAITS[id];
}

/** Whether a face carries its years. Used for the lines around the eyes, which
 *  the generator would otherwise scatter at random. */
export function isOld(id: ResidentId): boolean {
  return (RESIDENTS.find((r) => r.id === id)?.age ?? 0) >= 58;
}
