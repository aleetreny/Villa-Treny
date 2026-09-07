import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// These lattice periods were measured from the ZIP exports themselves. A room's
// apparent size on screen is not evidence for throwing away source pixels.
describe('recovering original ZIP pixel detail', () => {
  it('retains the measured 2x Bridge and 3x Shelter pixels in production', () => {
    for (const [id, width, height] of [
      ['bridge', 192, 144], ['dock', 288, 192], ['hold', 192, 256],
      ['face', 288, 192], ['breach', 224, 256],
    ] as const) {
      const png = readFileSync(new URL(`../../../public/habitat/rooms/${id}.png`, import.meta.url));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], id).toEqual([width, height]);
    }
  });
  it('copies both residential mattresses pixel-for-pixel instead of stretching them', async () => {
    const path = '../../../tools/roomlab/bedroom-kit.js';
    const { BEDROOM_MANIFEST } = await import(path) as { BEDROOM_MANIFEST: Record<string, { layers: Array<{ label: string; source: number[]; destination: number[] }> }> };
    for (const id of ['olive', 'oliveB']) {
      const mattresses = BEDROOM_MANIFEST[id]!.layers.filter((layer) => layer.label.includes('mattress'));
      expect(mattresses.length).toBeGreaterThan(0);
      for (const mattress of mattresses) expect(mattress.destination.slice(2)).toEqual(mattress.source.slice(2));
    }
  });
});


describe('source-only JPEG cleanup', () => {
  it('copies an original RGBA pixel from each matching source block at 3x and 4x', async () => {
    const modulePath = '../../../tools/roomlab/source-sampling.js';
    const { nativeMedoid } = await import(modulePath);
    for (const factor of [3, 4]) {
      const width = factor * 4, height = factor * 3;
      const data = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => (i * 73 + i % 17) % 256);
      const result = nativeMedoid(data, width, height, factor);
      for (let y = 0; y < result.height; y++) for (let x = 0; x < result.width; x++) {
        const n = y * result.width + x, origin = result.origins[n];
        expect(Math.floor((origin % width) / factor)).toBe(x);
        expect(Math.floor(Math.floor(origin / width) / factor)).toBe(y);
        expect([...result.data.slice(n * 4, n * 4 + 4)]).toEqual([...data.slice(origin * 4, origin * 4 + 4)]);
      }
    }
  });
  it('removes only page-connected fringe while keeping white inside a dark outline', async () => {
    const modulePath = '../../../tools/roomlab/source-sampling.js';
    const { clearPageFringe } = await import(modulePath);
    const data = new Uint8ClampedArray(5 * 5 * 4).fill(255);
    for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) {
      if (x === 2 && y === 2) continue;
      const n = (y * 5 + x) * 4;
      data.set([70, 60, 50, 255], n);
    }
    const before = data.slice();
    const result = clearPageFringe({ getImageData: () => ({ data }), putImageData: () => {} }, 5, 5);
    expect(result.removedPixels).toBe(16);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const n = (y * 5 + x) * 4;
      expect([...data.slice(n, n + 3)]).toEqual([...before.slice(n, n + 3)]);
      expect(data[n + 3]).toBe(x === 0 || x === 4 || y === 0 || y === 4 ? 0 : 255);
    }
  });
});
