import { describe, expect, it } from 'vitest';
import {
  TERRAIN, cellAt, gridSize, isSolid, isWalkable, perceptionWindow, placedObjects,
  type RoomLegend,
} from './grid';

/** A four-by-four room with a bench at (1,2) and a table at (2,2). */
const GRID = [
  '####',
  '#..#',
  '+bt#',
  '#==#',
];

const LEGEND: RoomLegend = {
  b: { name: 'a bench', solid: false },
  t: { name: 'a table', solid: true },
};

describe('the terrain alphabet', () => {
  it('marks floor and open air walkable and rock solid', () => {
    expect(TERRAIN['.'].walkable).toBe(true);
    expect(TERRAIN['='].walkable).toBe(true);
    expect(TERRAIN['+'].walkable).toBe(true);
    expect(TERRAIN['#'].walkable).toBe(false);
    expect(TERRAIN['|'].walkable).toBe(false);
  });

  it('marks vacuum unwalkable, because a suit is a separate question', () => {
    expect(TERRAIN['*'].walkable).toBe(false);
  });
});

describe('reading a grid', () => {
  it('reports its size', () => {
    expect(gridSize(GRID)).toEqual({ w: 4, h: 4 });
  });

  it('returns the character at a point', () => {
    expect(cellAt(GRID, 1, 2)).toBe('b');
    expect(cellAt(GRID, 0, 0)).toBe('#');
  });

  it('returns null outside the grid rather than throwing', () => {
    expect(cellAt(GRID, -1, 0)).toBeNull();
    expect(cellAt(GRID, 4, 0)).toBeNull();
    expect(cellAt(GRID, 0, 4)).toBeNull();
  });
});

describe('walkability', () => {
  it('lets a person stand on open floor and in a doorway', () => {
    expect(isWalkable(GRID, LEGEND, 1, 1)).toBe(true);
    expect(isWalkable(GRID, LEGEND, 0, 2)).toBe(true);
  });

  it('stops a person at rock', () => {
    expect(isWalkable(GRID, LEGEND, 0, 0)).toBe(false);
  });

  it('lets a person stand where a bench is but not where a table is', () => {
    expect(isWalkable(GRID, LEGEND, 1, 2)).toBe(true);
    expect(isWalkable(GRID, LEGEND, 2, 2)).toBe(false);
    expect(isSolid(GRID, LEGEND, 2, 2)).toBe(true);
  });

  it('treats outside the grid as not walkable', () => {
    expect(isWalkable(GRID, LEGEND, 99, 99)).toBe(false);
  });
});

describe('placed objects', () => {
  it('scans them out of the grid rather than keeping a second list', () => {
    expect(placedObjects(GRID, LEGEND)).toEqual([
      { glyph: 'b', name: 'a bench', x: 1, y: 2 },
      { glyph: 't', name: 'a table', x: 2, y: 2 },
    ]);
  });

  it('returns one entry per placement, because a glyph may repeat', () => {
    const many = ['####', '#bb#', '#==#'];
    expect(placedObjects(many, LEGEND)).toHaveLength(2);
  });
});

describe('perception', () => {
  it('returns the square window a person can see, clipped to the grid', () => {
    expect(perceptionWindow(GRID, { x: 1, y: 2 }, 1)).toEqual([
      '#..',
      '+bt',
      '#==',
    ]);
  });

  it('clips at a corner instead of padding', () => {
    expect(perceptionWindow(GRID, { x: 0, y: 0 }, 1)).toEqual([
      '##',
      '#.',
    ]);
  });
});
