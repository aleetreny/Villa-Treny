import { describe, expect, it } from 'vitest';
import { decodeBitmapRow, encodeBitmapRow } from './bitmap-codec';

describe('lossless room bitmap storage', () => {
  it('recovers native obstacles and alpha edges without shifting a single pixel', () => {
    for (const row of ['#'.repeat(288), '00001111100000000011111111', '##...#.#......####', '010101', '', '.'.repeat(204)]) {
      const packed = encodeBitmapRow(row);
      expect(packed.length).toBeLessThanOrEqual(row.length);
      expect(decodeBitmapRow(packed)).toBe(row);
    }
    expect(decodeBitmapRow('~4:#;2:.;3:#')).toBe('####..###');
  });
  it('rejects malformed or unbounded runs instead of allocating corrupt masks', () => {
    for (const row of ['~0:#', '~zzzzzzz:0', '~2:x', '~broken']) expect(() => decodeBitmapRow(row)).toThrow('bitmap');
  });
});
