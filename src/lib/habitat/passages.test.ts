import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isWalkable, type Point, type RoomLegend } from './grid';
import { ROOM_BY_ID } from './rooms';
import {
  PASSAGES, PASSAGE_BY_ID, passageForLink, planPassageMovement, walkingPath,
  type PassageId,
} from './passages';

const NEXT_PASSAGES = ['landing', 'cut', 'greenrun'] as const;

type SourceImage = { key: string; width: number; height: number };
type Crop = { sheet: string; rect: [number, number, number, number]; exportScale?: number };
type RoomLabCanvas = {
  imageSmoothingEnabled: boolean;
  clearRect: (...coordinates: number[]) => void;
  drawImage: (image: SourceImage, ...coordinates: number[]) => void;
};
type RoomLab = {
  T: number;
  CORRIDORS: Record<PassageId, {
    W: number; H: number; zoom: number; grid: string[];
    exits: Array<{ room: string; x: number; y: number; sealed?: boolean }>;
  }>;
  CORRIDOR_SOURCES: Record<string, string>;
  CORRIDOR_CROPS: Record<string, Crop>;
  CORRIDOR_OBSTACLES: Record<(typeof NEXT_PASSAGES)[number], Array<{ crop: string; x: number; y: number }>>;
  drawCorridor: (canvas: RoomLabCanvas, sources: Record<string, SourceImage>, id: PassageId) => void;
};

async function roomLab(): Promise<RoomLab> {
  // RoomLab is a browser-only JS module, outside the TypeScript app build.
  const roomlabModule = '../../../tools/roomlab/corridor-kit.js';
  return import(roomlabModule);
}

function sourceImages(sources: Record<string, string>): Record<string, SourceImage> {
  return Object.fromEntries(Object.entries(sources).map(([key, path]) => {
    const bytes = readFileSync(new URL(path, new URL('../../../tools/roomlab/', import.meta.url)));
    expect(bytes.subarray(1, 4).toString(), path).toBe('PNG');
    return [key, { key, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }];
  }));
}

function expectContinuousPath(grid: readonly string[], legend: RoomLegend, path: readonly Point[]): void {
  expect(path.length).toBeGreaterThan(0);
  path.forEach((point, index) => {
    expect(isWalkable(grid, legend, point.x, point.y), `${point.x},${point.y}`).toBe(true);
    const before = path[index - 1];
    if (before) expect(Math.abs(point.x - before.x) + Math.abs(point.y - before.y)).toBe(1);
  });
}

function reachableCells(passage: (typeof PASSAGES)[number]): Set<string> {
  const legend = passage.id === 'longwalk' ? ROOM_BY_ID.longwalk.legend : {};
  const start = passage.exits.find((exit) => !exit.sealed)!.at;
  const seen = new Set([`${start.x},${start.y}`]);
  const work = [start];
  while (work.length) {
    const here = work.pop()!;
    for (const [x, y] of [
      [here.x + 1, here.y], [here.x - 1, here.y],
      [here.x, here.y + 1], [here.x, here.y - 1],
    ] as const) {
      const key = `${x},${y}`;
      if (seen.has(key) || !isWalkable(passage.grid, legend, x, y)) continue;
      seen.add(key);
      work.push({ x, y });
    }
  }
  return seen;
}

describe('the six passages', () => {
  it('uses the existing Long Walk grid instead of inventing a second corridor', () => {
    expect(PASSAGE_BY_ID.longwalk.grid).toBe(ROOM_BY_ID.longwalk.grid);
  });

  it('maps every named passage to a real reciprocal room connection', () => {
    expect(passageForLink('bridge', 'dock')).toBe('climb');
    expect(passageForLink('infirmary', 'workshops')).toBe('throat');
    for (const id of NEXT_PASSAGES) {
      const [a, b] = PASSAGE_BY_ID[id].exits;
      expect(passageForLink(a!.room, b!.room)).toBe(id);
      expect(passageForLink(b!.room, a!.room)).toBe(id);
    }
    expect(passageForLink('workshops', 'administration')).toBeNull();
    expect(passageForLink('garden', 'common')).toBeNull();
    for (const passage of PASSAGES) {
      if (passage.id === 'longwalk') {
        for (const exit of passage.exits) {
          expect(ROOM_BY_ID.longwalk.connects).toContain(exit.room);
          expect(ROOM_BY_ID[exit.room].connects).toContain('longwalk');
        }
        continue;
      }
      const [a, b] = passage.exits;
      expect(ROOM_BY_ID[a!.room].connects).toContain(b!.room);
      expect(ROOM_BY_ID[b!.room].connects).toContain(a!.room);
    }
  });

  it('keeps each live threshold on an open cell at the edge of its grid', () => {
    for (const passage of PASSAGES) {
      const width = passage.grid[0]!.length;
      expect(passage.grid.every((row) => row.length === width)).toBe(true);
      for (const exit of passage.exits.filter((item) => !item.sealed)) {
        const { x, y } = exit.at;
        expect(passage.grid[y]?.[x], `${passage.id} → ${exit.room}`).toBe('+');
        expect(x === 0 || x === width - 1 || y === 0 || y === passage.grid.length - 1).toBe(true);
      }
    }
  });

  it('connects every live exit through one continuous walking lane', () => {
    for (const passage of PASSAGES) {
      const seen = reachableCells(passage);
      for (const exit of passage.exits.filter((item) => !item.sealed)) {
        expect(seen.has(`${exit.at.x},${exit.at.y}`), `${passage.id} → ${exit.room}`).toBe(true);
      }
    }
  });

  it('leaves no open floor stranded behind a wall', () => {
    for (const passage of PASSAGES) {
      const legend = passage.id === 'longwalk' ? ROOM_BY_ID.longwalk.legend : {};
      const seen = reachableCells(passage);
      passage.grid.forEach((row, y) => [...row].forEach((_cell, x) => {
        if (isWalkable(passage.grid, legend, x, y)) {
          expect(seen.has(`${x},${y}`), `${passage.id} strands ${x},${y}`).toBe(true);
        }
      }));
    }
  });

  it('uses the same dimensions, movement grids and exits as the six RoomLab canvases', async () => {
    const { CORRIDORS } = await roomLab();
    expect(Object.keys(CORRIDORS).sort()).toEqual(PASSAGES.map((passage) => passage.id).sort());
    for (const passage of PASSAGES) {
      const visual = CORRIDORS[passage.id];
      expect(visual.grid, passage.id).toEqual(passage.grid);
      expect(visual.W).toBe(passage.grid[0]!.length * 32);
      expect(visual.H).toBe(passage.grid.length * 32);
      const label = (name: string) => name.replace(/^The /, '');
      expect(visual.exits.map(({ room, x, y, sealed }) => ({ room: label(room), at: { x, y }, sealed: !!sealed })))
        .toEqual(passage.exits.map(({ room, at, sealed }) => ({ room: label(ROOM_BY_ID[room].name), at, sealed: !!sealed })));
    }
  });
});

describe('the three new corridors use measured source art', () => {
  it('keeps every full solid sprite outside all walkable cells', async () => {
    const { T, CORRIDOR_CROPS, CORRIDOR_OBSTACLES } = await roomLab();
    for (const id of NEXT_PASSAGES) {
      const passage = PASSAGE_BY_ID[id];
      for (const prop of CORRIDOR_OBSTACLES[id]) {
        const crop = CORRIDOR_CROPS[prop.crop]!;
        const width = crop.rect[2] / (crop.exportScale ?? 1);
        const height = crop.rect[3] / (crop.exportScale ?? 1);
        expect([prop.x, prop.y, width, height].every(Number.isInteger), `${id} ${prop.crop}`).toBe(true);
        expect(prop.x).toBeGreaterThanOrEqual(0);
        expect(prop.y).toBeGreaterThanOrEqual(0);
        expect(prop.x + width).toBeLessThanOrEqual(passage.grid[0]!.length * T);
        expect(prop.y + height).toBeLessThanOrEqual(passage.grid.length * T);
        for (let y = Math.floor(prop.y / T); y < Math.ceil((prop.y + height) / T); y += 1) {
          for (let x = Math.floor(prop.x / T); x < Math.ceil((prop.x + width) / T); x += 1) {
            expect(isWalkable(passage.grid, {}, x, y), `${id} ${prop.crop} overlaps ${x},${y}`).toBe(false);
          }
        }
      }
    }
  });

  it('uses integer source rectangles within the existing PNGs and recovers whole native pixels', async () => {
    const { CORRIDOR_SOURCES, CORRIDOR_CROPS } = await roomLab();
    const sources = sourceImages(CORRIDOR_SOURCES);
    for (const [name, crop] of Object.entries(CORRIDOR_CROPS)) {
      const source = sources[crop.sheet]!;
      expect(source, name).toBeDefined();
      const [x, y, width, height] = crop.rect;
      expect(crop.rect.every(Number.isInteger), name).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(x + width, name).toBeLessThanOrEqual(source.width);
      expect(y + height, name).toBeLessThanOrEqual(source.height);
      const scale = crop.exportScale ?? 1;
      expect(scale, name).toBe(['common', 'garden'].includes(crop.sheet) ? 4 : 1);
      expect(Number.isInteger(width / scale) && Number.isInteger(height / scale), name).toBe(true);
    }
  });

  it('draws the actual new compositions using only image copies with integer coordinates and no smoothing', async () => {
    const { CORRIDORS, CORRIDOR_SOURCES, drawCorridor } = await roomLab();
    const sources = sourceImages(CORRIDOR_SOURCES);
    for (const id of NEXT_PASSAGES) {
      const visual = CORRIDORS[id];
      let copies = 0;
      // No drawing primitives exist on this context. Introducing one into the
      // composition fails this test rather than silently accepting invented art.
      const canvas: RoomLabCanvas = {
        imageSmoothingEnabled: true,
        clearRect: () => {},
        drawImage: (source, ...coordinates) => {
          copies += 1;
          expect(Object.values(sources)).toContain(source);
          expect(coordinates.every(Number.isInteger), `${id} ${source.key}`).toBe(true);
          const [sx, sy, sw, sh, dx, dy, dw, dh] = coordinates as [number, number, number, number, number, number, number, number];
          expect(Math.min(sx, sy, dx, dy)).toBeGreaterThanOrEqual(0);
          expect(Math.min(sw, sh, dw, dh)).toBeGreaterThan(0);
          expect(sx + sw).toBeLessThanOrEqual(source.width);
          expect(sy + sh).toBeLessThanOrEqual(source.height);
          expect(dx + dw).toBeLessThanOrEqual(visual.W);
          expect(dy + dh).toBeLessThanOrEqual(visual.H);
          const exportScale = ['common', 'garden'].includes(source.key) ? 4 : 1;
          expect(sw / dw).toBe(exportScale);
          expect(sh / dh).toBe(exportScale);
        },
      };
      drawCorridor(canvas, sources, id);
      expect(copies).toBeGreaterThan(0);
      expect(canvas.imageSmoothingEnabled).toBe(false);
      expect(Number.isInteger(visual.zoom) && visual.zoom > 0).toBe(true);
    }
  });
});

describe.each(NEXT_PASSAGES)('%s cell-based movement', (id) => {
  const passage = PASSAGE_BY_ID[id];

  it('crosses from inside either room through existing doors and every passage cell', () => {
    for (const entry of passage.exits) {
      const exit = passage.exits.find((item) => item.room !== entry.room)!;
      const room = ROOM_BY_ID[entry.room];
      // Start inside the room, so an isolated doorway cannot pass this test.
      const start = { x: 2, y: id === 'greenrun' && entry.room === 'garden' ? 1 : 2 };
      const movement = planPassageMovement(entry.room, exit.room, start);
      expect(movement, `${entry.room} → ${exit.room}`).not.toBeNull();
      expect(movement!.passage).toBe(id);
      expect(movement!.approach[0]).toEqual(start);
      expect(movement!.approach.at(-1)).toEqual(entry.roomAt);
      expect(movement!.cells[0]).toEqual(entry.at);
      expect(movement!.cells.at(-1)).toEqual(exit.at);
      expect(movement!.arrival).toEqual(exit.roomAt);
      expectContinuousPath(room.grid, room.legend, movement!.approach);
      expectContinuousPath(passage.grid, {}, movement!.cells);
      const destination = ROOM_BY_ID[exit.room];
      expect(destination.grid[movement!.arrival.y]?.[movement!.arrival.x]).toBe('+');
    }
  });

  it('refuses to start inside a wall and cannot cross a blocked lane', () => {
    const [entry, exit] = passage.exits;
    expect(planPassageMovement(entry!.room, exit!.room, { x: 0, y: 0 })).toBeNull();
    const blocked = passage.grid.map((row) => row.slice(0, 6) + '#' + row.slice(7));
    expect(walkingPath(blocked, {}, entry!.at, exit!.at)).toBeNull();
  });
});
