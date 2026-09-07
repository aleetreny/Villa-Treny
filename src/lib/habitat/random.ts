// Deterministic randomness shared by the world and its observer.

/** A fast, decent 32-bit PRNG. Same seed, same sequence, every time. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit seed for any string — an id, a caption, a country. */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Smoothly map `value` from one range onto another, clamped at both ends. */
export function remap(value: number, a0: number, a1: number, b0: number, b1: number): number {
  if (a1 === a0) return b0;
  return b0 + (b1 - b0) * clamp((value - a0) / (a1 - a0), 0, 1);
}

/** A cheap 1-D value noise, good enough for a wobble that has to look alive. */
export function wobble(t: number, seed = 1): number {
  return (
    Math.sin(t * 1.13 + seed * 2.7) * 0.55
    + Math.sin(t * 2.37 + seed * 5.1) * 0.3
    + Math.sin(t * 4.91 + seed * 1.3) * 0.15
  );
}
