import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { NavigationScene, NavigationNetwork } from './navigation';

type Point = { x: number; y: number };
type ImageSource = { width: number; height: number };
type ArtLayout = {
  grid: string[];
  cellSize: number;
  exits: Array<{ at: Point; outward: string; span: { from: number; to: number } }>;
  toArtCell: (point: Point) => Point;
};
type CorridorArtModule = {
  corridorArtLayout: (scene: NavigationScene) => ArtLayout;
  drawExplorerCorridor: (g: {
    imageSmoothingEnabled: boolean;
    drawImage: (source: ImageSource, ...coordinates: number[]) => void;
  }, sources: Record<string, ImageSource>, scene: NavigationScene) => void;
};

async function artModule(): Promise<CorridorArtModule> {
  const modulePath = '../../../tools/roomlab/explorer-corridor-art.js';
  return import(modulePath);
}

function flood(grid: readonly string[], at: Point): Set<string> {
  const pending = [at], seen = new Set([`${at.x},${at.y}`]);
  for (let i = 0; i < pending.length; i += 1) {
    const { x, y } = pending[i]!;
    for (const point of [{ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }]) {
      const key = `${point.x},${point.y}`;
      if (grid[point.y]?.[point.x] !== '.' || seen.has(key)) continue;
      seen.add(key); pending.push(point);
    }
  }
  return seen;
}

describe('the explorable ship artwork', () => {
  const exported = JSON.parse(readFileSync(new URL('../../../tools/roomlab/explorer-network.json', import.meta.url), 'utf8')) as NavigationNetwork;
  const corridors = exported.scenes.filter((scene) => scene.kind === 'corridor');

  it('keeps all free 4px cells and the full width of every opening connected', async () => {
    const { corridorArtLayout } = await artModule();
    for (const scene of corridors) {
      const layout = corridorArtLayout(scene);
      const reachable = flood(layout.grid, layout.exits[0]!.at);
      const free = layout.grid.reduce((total, row) => total + [...row].filter((cell) => cell === '.').length, 0);
      expect(reachable.size, scene.id).toBe(free);
      for (const exit of layout.exits) {
        for (let offset = exit.span.from; offset <= exit.span.to; offset += 1) {
          const at = ['north', 'south'].includes(exit.outward) ? { x: offset, y: exit.at.y } : { x: exit.at.x, y: offset };
          expect(reachable.has(`${at.x},${at.y}`), `${scene.id} opening ${offset}`).toBe(true);
        }
      }
    }
  });

  it('renders every corridor entirely from in-bounds native source pixels', async () => {
    const modulePath = '../../../tools/roomlab/corridor-kit.js';
    const { CORRIDOR_SOURCES } = await import(modulePath) as { CORRIDOR_SOURCES: Record<string, string> };
    const sources = Object.fromEntries(Object.entries(CORRIDOR_SOURCES).map(([name, path]) => {
      const bytes = readFileSync(new URL(path, new URL('../../../tools/roomlab/', import.meta.url)));
      return [name, { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }];
    }));
    const { drawExplorerCorridor } = await artModule();
    for (const scene of corridors) {
      let stamps = 0;
      // No fill/stroke/path API: generated replacement artwork fails here.
      const context = {
        imageSmoothingEnabled: true,
        drawImage(image: ImageSource, ...numbers: number[]) {
          const [sx, sy, sw, sh, dx, dy, dw, dh] = numbers as [number, number, number, number, number, number, number, number];
          expect(numbers.every(Number.isInteger), scene.id).toBe(true);
          expect(sx).toBeGreaterThanOrEqual(0); expect(sy).toBeGreaterThanOrEqual(0);
          expect(sx + sw).toBeLessThanOrEqual(image.width); expect(sy + sh).toBeLessThanOrEqual(image.height);
          expect(dx).toBeGreaterThanOrEqual(0); expect(dy).toBeGreaterThanOrEqual(0);
          expect(dx + dw).toBeLessThanOrEqual(scene.grid[0]!.length * 32);
          expect(dy + dh).toBeLessThanOrEqual(scene.grid.length * 32);
          expect([1, 4]).toContain(sw / dw); expect(sw / dw).toBe(sh / dh);
          stamps += 1;
        },
      };
      drawExplorerCorridor(context, sources, scene);
      expect(context.imageSmoothingEnabled).toBe(false);
      expect(stamps, scene.id).toBeGreaterThan(10);
    }
  });

  it('leaves space beside a crate walkable while blocking the sprite footprint', async () => {
    const { corridorArtLayout } = await artModule();
    for (const scene of corridors) {
      const layout = corridorArtLayout(scene);
      for (const prop of scene.props ?? []) {
        const x = prop.at.x * 8, y = prop.at.y * 8;
        expect(layout.grid[y]![x]).toBe('.');
        expect(layout.grid[y + 3]![x + 4]).toBe('#');
        expect(layout.grid[y + 7]![x + 7]).toBe('.');
      }
    }
  });
});
