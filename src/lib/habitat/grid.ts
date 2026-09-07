// The alphabet the habitat is written in.
//
// One representation of space serves three readers: the engine moves people
// across this grid, the canvas draws it, and it goes into a model's prompt
// verbatim. An agent is handed the map rather than a description of it, so it can
// count the steps to a door instead of guessing at one. Everything here is a pure
// function over an array of strings, and nothing in this file knows which rooms
// exist.
//
// Three character classes, and they never collide. Symbols are terrain and mean
// the same thing everywhere. Lowercase letters and digits are objects, and their
// meaning is local to a room's legend. Uppercase A–Y are people, and they are
// composited on top at render and perception time rather than living in the grid.

export const TERRAIN = {
  '#': { label: 'solid rock or hull plate', walkable: false },
  '.': { label: 'open', walkable: true },
  '=': { label: 'deck plate or dug floor', walkable: true },
  '|': { label: 'partition', walkable: false },
  '+': { label: 'hatch or doorway', walkable: true },
  X: { label: 'sealed — needs a key, a suit or a tool', walkable: false },
  '^': { label: 'climb up', walkable: true },
  v: { label: 'climb down', walkable: true },
  '~': { label: 'water', walkable: false },
  ':': { label: 'grating', walkable: true },
  ',': { label: 'loose spoil', walkable: true },
  '"': { label: 'living growth', walkable: true },
  '*': { label: 'vacuum, not survivable unsuited', walkable: false },
} as const satisfies Record<string, { label: string; walkable: boolean }>;

export type Terrain = keyof typeof TERRAIN;

export type Point = { x: number; y: number };

/** What a room's own legend says about one object glyph. */
export type LegendEntry = {
  name: string;
  /** Whether it blocks the tile it stands on. A table does; a bench does not. */
  solid: boolean;
};

export type RoomLegend = Record<string, LegendEntry>;

export type Placed = { glyph: string; name: string; x: number; y: number };

export function isTerrain(ch: string): ch is Terrain {
  return Object.prototype.hasOwnProperty.call(TERRAIN, ch);
}

export function gridSize(grid: readonly string[]): { w: number; h: number } {
  return { w: grid[0]?.length ?? 0, h: grid.length };
}

/** The character at a point, or null outside the grid. Callers decide what
 *  off-grid means rather than catching an exception. */
export function cellAt(grid: readonly string[], x: number, y: number): string | null {
  const row = grid[y];
  if (row === undefined) return null;
  if (x < 0 || x >= row.length) return null;
  return row[x] ?? null;
}

export function isSolid(
  grid: readonly string[], legend: RoomLegend, x: number, y: number,
): boolean {
  const ch = cellAt(grid, x, y);
  if (ch === null) return true;
  if (isTerrain(ch)) return !TERRAIN[ch].walkable;
  return legend[ch]?.solid ?? false;
}

export function isWalkable(
  grid: readonly string[], legend: RoomLegend, x: number, y: number,
): boolean {
  return cellAt(grid, x, y) !== null && !isSolid(grid, legend, x, y);
}

/** Objects are scanned out of the grid and never kept in a second list, so a grid
 *  and its objects cannot drift apart. Reading order: top to bottom, left to
 *  right. */
export function placedObjects(grid: readonly string[], legend: RoomLegend): Placed[] {
  const out: Placed[] = [];
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const entry = legend[ch];
      if (entry) out.push({ glyph: ch, name: entry.name, x, y });
    });
  });
  return out;
}

/** The square of grid a person at `centre` can take in, clipped rather than
 *  padded, so the caller can tell the edge of a room from open floor. */
export function perceptionWindow(
  grid: readonly string[], centre: Point, radius: number,
): string[] {
  const { w, h } = gridSize(grid);
  const y0 = Math.max(0, centre.y - radius);
  const y1 = Math.min(h - 1, centre.y + radius);
  const x0 = Math.max(0, centre.x - radius);
  const x1 = Math.min(w - 1, centre.x + radius);
  const out: string[] = [];
  for (let y = y0; y <= y1; y += 1) out.push((grid[y] ?? '').slice(x0, x1 + 1));
  return out;
}
