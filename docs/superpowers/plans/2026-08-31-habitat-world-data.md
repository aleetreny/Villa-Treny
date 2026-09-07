# Habitat World Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the authored Genesis content — sixteen room grids, twenty-five
residents, twenty-nine prior bonds — into typed, tested TypeScript that the
simulation engine, the renderer and the prompt builder all read from one place.

**Architecture:** Four browser-free modules under `src/lib/habitat/`, following the
pattern the repo already uses for `src/lib/world/city.ts` and `crew.ts`:
deterministic data with no DOM, no React and no services, exercised by vitest.
`grid.ts` holds the spatial primitives; `rooms.ts`, `residents.ts` and `weave.ts`
hold the content and the invariants that must never silently break.

**Tech Stack:** TypeScript 5 (strict, `tsconfig.app.json`), vitest, no new
dependencies.

**Spec:** `docs/superpowers/specs/2026-08-31-habitat-design.md`, with the Genesis
content in `2026-08-31-habitat-rooms.md`, `2026-08-31-habitat-residents.md` and
`2026-08-31-habitat-roster-and-weave.md`.

## Global Constraints

- **No new dependencies.** Nothing in this plan needs one.
- **Browser-free.** No DOM, no React, no `window`, no `fetch` in any module here.
  These are data and pure functions, like `src/lib/world/city.ts`.
- **Deterministic.** Same input, same output, every time. Where randomness is
  needed, use `mulberry32` from `src/lib/world/rng.ts` with an explicit seed.
- **`pnpm check` green** before every commit: `pnpm validate:repo && pnpm lint &&
  pnpm typecheck && pnpm test`.
- **Commit authorship.** Every commit in this repo must be authored *and*
  committed as `Alejandro Treny Ortega <alejandrotreny100@gmail.com>` via the four
  `GIT_*` environment variables. No `Co-Authored-By` trailer. See `CLAUDE.md`.
- **Copy in ES/EN** goes through `src/lib/ui-text.ts`. Nothing in this plan renders
  copy, so nothing here touches it — but resident and room *names* are content, not
  interface copy, and stay as data.
- **There is no answer to the ship's mystery.** No module may hold one, derive one,
  or expose an API that implies one exists.

---

## Task 0: The Node toolchain — done

There was no `node`, `pnpm`, `npm` or `corepack` reachable on this machine, inside
or outside the sandbox, and no Homebrew, so nothing below could be verified.

Resolved by installing the official Node build into the user's home, without sudo
and without touching anything system-wide:

- `node-v24.20.0-darwin-arm64.tar.gz` from `nodejs.org`, 50 MB, SHA-256 checked
  against `nodejs.org/dist/v24.20.0/SHASUMS256.txt`;
- extracted to `~/.local/node`;
- `corepack prepare pnpm@11.9.0 --activate`, matching the `packageManager` pin.

**It is not on the login PATH.** Add this to `~/.zshrc` to make it permanent:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

Baseline on arrival, with the repo untouched: `pnpm check` green — repo validation,
eslint, `tsc -b`, and 250 tests across 23 files.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/habitat/grid.ts` | The terrain alphabet and every pure operation on a character grid: what a cell is, whether it can be stood on, what objects are placed where, and the window of a grid a person can perceive. Knows nothing about which rooms exist. |
| `src/lib/habitat/grid.test.ts` | Grid primitives against small hand-built fixtures. |
| `src/lib/habitat/rooms.ts` | The sixteen rooms: grids, per-room object legends, connections, tilt, side. The content. |
| `src/lib/habitat/rooms.test.ts` | The structural invariants currently enforced by `scripts/habitat/build-rooms.py`, ported so that editing a room cannot quietly break the map. |
| `src/lib/habitat/residents.ts` | The twenty-five: identity, age, cluster, assigned duty, keys held, voice constraint. |
| `src/lib/habitat/residents.test.ts` | Roster invariants — distinct initials, cluster sizes, key holders. |
| `src/lib/habitat/weave.ts` | The six relationship axes, the twenty-three real bonds, the six latent bonds, the five clusters, and the clustering measurement. |
| `src/lib/habitat/weave.test.ts` | Bond integrity, latent-bond directionality, and the anomaly measured against random graphs. |

Nothing else is touched. No existing file is modified.

---

## Task 1: Grid primitives

**Files:**
- Create: `src/lib/habitat/grid.ts`
- Test: `src/lib/habitat/grid.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TERRAIN`, `type Terrain`, `type Point`, `type Placed`,
  `type RoomLegend`, `cellAt(grid, x, y): string | null`,
  `isTerrain(ch): ch is Terrain`, `isWalkable(grid, legend, x, y): boolean`,
  `isSolid(grid, legend, x, y): boolean`, `placedObjects(grid, legend): Placed[]`,
  `gridSize(grid): { w: number; h: number }`,
  `perceptionWindow(grid, centre, radius): string[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/habitat/grid.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm vitest run src/lib/habitat/grid.test.ts
```

Expected: FAIL — `Failed to resolve import "./grid"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/habitat/grid.ts`:

```ts
// The alphabet the habitat is written in.
//
// One representation of space serves three readers: the engine moves people
// across this grid, the canvas draws it, and it goes into a model's prompt
// verbatim. So everything here is a pure function over an array of strings, and
// nothing in this file knows which rooms exist.
//
// Three character classes, and they never collide. Symbols are terrain and mean
// the same thing everywhere. Lowercase letters and digits are objects, and their
// meaning is local to a room's legend. Uppercase A-Y are people, and they are
// composited on top at render and perception time rather than living in the grid.

export const TERRAIN = {
  '#': { label: 'solid rock or hull plate', walkable: false },
  '.': { label: 'open', walkable: true },
  '=': { label: 'deck plate or dug floor', walkable: true },
  '|': { label: 'partition', walkable: false },
  '+': { label: 'hatch or doorway', walkable: true },
  'X': { label: 'sealed - needs a key, a suit or a tool', walkable: false },
  '^': { label: 'climb up', walkable: true },
  'v': { label: 'climb down', walkable: true },
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

/** The character at a point, or null outside the grid. Callers get to decide
 *  what off-grid means rather than catching an exception. */
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

/** Objects are scanned out of the grid and never kept in a second list, so a
 *  grid and its objects cannot drift apart. Reading order: top to bottom, left
 *  to right. */
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
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm vitest run src/lib/habitat/grid.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Run the whole check**

```bash
pnpm check
```

Expected: all four stages green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/habitat/grid.ts src/lib/habitat/grid.test.ts
GIT_AUTHOR_NAME="Alejandro Treny Ortega" GIT_AUTHOR_EMAIL="alejandrotreny100@gmail.com" \
GIT_COMMITTER_NAME="Alejandro Treny Ortega" GIT_COMMITTER_EMAIL="alejandrotreny100@gmail.com" \
git commit -m "Give the habitat an alphabet

One representation of space for the engine, the canvas and the prompt.
Objects are scanned out of the grid rather than kept beside it, so the
two cannot drift apart."
```

---

## Task 2: The sixteen rooms

**Files:**
- Create: `src/lib/habitat/rooms.ts`
- Test: `src/lib/habitat/rooms.test.ts`

**Interfaces:**
- Consumes: `RoomLegend`, `Placed`, `isTerrain`, `placedObjects`, `gridSize` from
  `./grid`.
- Produces: `type RoomId`, `type Side`, `type Room`, `ROOMS: readonly Room[]`,
  `ROOM_BY_ID: Record<RoomId, Room>`, `roomObjects(id): Placed[]`,
  `doorsOf(room): Point[]`, `neighbours(id): RoomId[]`.

**Transcribing the content.** The sixteen grids, their legends, their connections
and their descriptions already exist, authored and checked, in
`docs/superpowers/specs/2026-08-31-habitat-rooms.md` and in the generator at
`scripts/habitat/build-rooms.py`. Copy them **verbatim**. Do not redesign a room,
do not resize a grid and do not invent an object: every one of those was a design
decision taken in the spec. The only addition is the `solid` flag per legend entry,
which the spec did not have — set it by common sense (a table, a berth, a tank, a
reactor face and a fabricator are solid; a bench, a doorway marking, a wall-mounted
notice and a scratch tally are not) and expect the reviewer to argue about a few.

- [ ] **Step 1: Write the failing test**

Create `src/lib/habitat/rooms.test.ts`. This is the Python validator, ported —
the rooms document claims these properties were checked mechanically, and this is
what keeps that claim true:

```ts
import { describe, expect, it } from 'vitest';
import { TERRAIN, gridSize, isTerrain, placedObjects } from './grid';
import { ROOMS, ROOM_BY_ID, doorsOf, neighbours, roomObjects } from './rooms';

const DOORS = new Set(['+', 'X']);
const BOUNDARY = new Set(['#', '|', '+', 'X']);

describe('the habitat is the shape the spec says it is', () => {
  it('has sixteen rooms, eight in the hull and eight in the rock', () => {
    expect(ROOMS).toHaveLength(16);
    expect(ROOMS.filter((r) => r.side === 'hull')).toHaveLength(8);
    expect(ROOMS.filter((r) => r.side === 'rock')).toHaveLength(8);
  });

  it('tilts the hull and leaves the rock level', () => {
    for (const room of ROOMS) {
      expect(room.tilt).toBe(room.side === 'hull' ? 22 : 0);
    }
  });

  it('gives every room a unique id', () => {
    expect(new Set(ROOMS.map((r) => r.id)).size).toBe(16);
  });

  it('carries between sixty and eighty significant objects in total', () => {
    const total = ROOMS.reduce((n, r) => n + Object.keys(r.legend).length, 0);
    expect(total).toBeGreaterThanOrEqual(60);
    expect(total).toBeLessThanOrEqual(80);
  });
});

describe.each(ROOMS.map((r) => [r.id, r] as const))('%s', (_id, room) => {
  it('is rectangular', () => {
    const { w } = gridSize(room.grid);
    for (const row of room.grid) expect(row).toHaveLength(w);
  });

  it('has a closed boundary, so nobody walks off the edge', () => {
    const { w, h } = gridSize(room.grid);
    for (let x = 0; x < w; x += 1) {
      expect(BOUNDARY.has(room.grid[0]![x]!)).toBe(true);
      expect(BOUNDARY.has(room.grid[h - 1]![x]!)).toBe(true);
    }
    for (const row of room.grid) {
      expect(BOUNDARY.has(row[0]!)).toBe(true);
      expect(BOUNDARY.has(row[w - 1]!)).toBe(true);
    }
  });

  it('uses no character that is not terrain or in its own legend', () => {
    for (const row of room.grid) {
      for (const ch of row) {
        expect(isTerrain(ch) || ch in room.legend).toBe(true);
      }
    }
  });

  it('places every object its legend declares', () => {
    const placed = new Set(placedObjects(room.grid, room.legend).map((p) => p.glyph));
    for (const glyph of Object.keys(room.legend)) expect(placed.has(glyph)).toBe(true);
  });

  it('has at least as many doors as connections', () => {
    const doors = room.grid.join('').split('').filter((c) => DOORS.has(c)).length;
    expect(doors).toBeGreaterThanOrEqual(room.connects.length);
    expect(doors).toBeGreaterThan(0);
  });

  it('connects only to rooms that exist, and is connected to in return', () => {
    for (const other of room.connects) {
      expect(ROOM_BY_ID[other]).toBeDefined();
      expect(ROOM_BY_ID[other].connects).toContain(room.id);
    }
  });

  it('never connects to itself', () => {
    expect(room.connects).not.toContain(room.id);
  });
});

describe('the habitat is one place', () => {
  it('can be walked from the Bridge to every other room', () => {
    const seen = new Set(['bridge']);
    const queue = ['bridge'] as const satisfies readonly string[];
    const work: string[] = [...queue];
    while (work.length) {
      const id = work.shift()!;
      for (const next of neighbours(id as never)) {
        if (!seen.has(next)) { seen.add(next); work.push(next); }
      }
    }
    expect(seen.size).toBe(16);
  });
});

describe('accessors', () => {
  it('finds the fabricator in the Workshops', () => {
    const names = roomObjects('workshops').map((o) => o.name);
    expect(names).toContain('the fabricator');
  });

  it('finds a door on the Great Wall', () => {
    expect(doorsOf(ROOM_BY_ID.greatwall).length).toBeGreaterThan(0);
  });

  it('leaves the Hollow empty, because that is the entry', () => {
    expect(roomObjects('hollow')).toHaveLength(0);
  });

  it('agrees with the terrain table about what a door is', () => {
    expect(TERRAIN['+'].walkable).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm vitest run src/lib/habitat/rooms.test.ts
```

Expected: FAIL — `Failed to resolve import "./rooms"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/habitat/rooms.ts`. The shape, with the Bridge and the Hollow shown
in full and the other fourteen transcribed the same way from the rooms document:

```ts
// The habitat, as sixteen grids.
//
// Eight rooms in the hull, which went into the rock at an angle and is finite and
// inherited, and eight cut into the stone by hand, which grow. Hull grids are
// axis-aligned in their own local coordinates and the tilt is applied at render,
// so distance and adjacency stay sane while the cutaway still shows a ship driven
// in crooked.
//
// The content of this file is authored, not derived. Every grid, every object and
// every connection is a decision recorded in
// docs/superpowers/specs/2026-08-31-habitat-rooms.md, and rooms.test.ts holds the
// invariants that keep an edit from quietly breaking the map.

import { placedObjects, type Placed, type Point, type RoomLegend } from './grid';

export type Side = 'hull' | 'rock';

export type RoomId =
  | 'bridge' | 'dock' | 'cabins' | 'breach' | 'hold' | 'infirmary' | 'berths' | 'spine'
  | 'greatwall' | 'common' | 'hydroponics' | 'diggings' | 'workshops' | 'well'
  | 'face' | 'hollow';

export type Room = {
  id: RoomId;
  name: string;
  side: Side;
  /** Degrees off the dug galleries. The hull is 22; the rock is 0. */
  tilt: number;
  connects: readonly RoomId[];
  /** What a visitor is told about the room. */
  description: string;
  /** The one thing about it that is not obvious. */
  note?: string;
  grid: readonly string[];
  legend: RoomLegend;
};

export const ROOMS: readonly Room[] = [
  {
    id: 'bridge',
    name: 'The Bridge',
    side: 'hull',
    tilt: 22,
    connects: ['dock'],
    description:
      'The bow, canted up and nearly at the surface. The port is cracked across '
      + 'its whole width and patched from the inside with plate and sealant, so the '
      + 'stars come through a repair. Both consoles are dead. Nobody sits in the '
      + "pilot's chair; the taboo formed in the second week and nobody can say who "
      + 'started it.',
    grid: [
      '######################',
      '#w.........p.........#',
      '#w...s...............#',
      '#w==============v====#',
      '#....t....u.....^....+',
      '#.................b..#',
      '#====================#',
      '######################',
    ],
    legend: {
      w: { name: 'the cracked port, patched from inside', solid: true },
      p: { name: "the pilot's chair", solid: true },
      s: { name: 'a scratch tally of the days, cut into the bulkhead', solid: false },
      t: { name: 'dead navigation console', solid: true },
      u: { name: 'dead helm console', solid: true },
      b: { name: 'a bench somebody dragged up here', solid: false },
    },
  },

  // ... dock, cabins, breach, hold, infirmary, berths, spine,
  // ... greatwall, common, hydroponics, diggings, workshops, well, face
  // transcribed identically from docs/superpowers/specs/2026-08-31-habitat-rooms.md

  {
    id: 'hollow',
    name: 'The Hollow',
    side: 'rock',
    tilt: 0,
    connects: ['face'],
    description:
      'They did not dig this. A gallery broke into it in week nine: a natural void, '
      + 'irregular, orthogonal to nothing, with a floor that is not flat and a roof '
      + 'nobody has measured. It has no assigned use. It is the only space in the '
      + 'habitat that nobody designed and nobody has decided about.',
    note: 'There is nothing in it. That is the entry.',
    grid: [
      '############################',
      '#####..................#####',
      '###.......................##',
      '##........................##',
      '#.........................##',
      '##.......,,,,,............##',
      '###...,,,,,,,,,,,,........##',
      '####,,,,,,,,,,,,,,,,,,,,,###',
      '+#,,,,,,,,,,,,,,,,,,,,,,,###',
      '############################',
    ],
    legend: {},
  },
];

export const ROOM_BY_ID = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
) as Record<RoomId, Room>;

export function roomObjects(id: RoomId): Placed[] {
  const room = ROOM_BY_ID[id];
  return placedObjects(room.grid, room.legend);
}

export function doorsOf(room: Room): Point[] {
  const out: Point[] = [];
  room.grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '+' || ch === 'X') out.push({ x, y });
    });
  });
  return out;
}

export function neighbours(id: RoomId): readonly RoomId[] {
  return ROOM_BY_ID[id].connects;
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm vitest run src/lib/habitat/rooms.test.ts
```

Expected: PASS. The per-room block runs sixteen times, so expect well over a
hundred assertions. If the boundary or door test fails on a room, **fix the grid
against the rooms document rather than relaxing the test** — the document's grids
already satisfy every one of these.

- [ ] **Step 5: Retire the Python generator**

`scripts/habitat/build-rooms.py` says in its own docstring that it should be
replaced by a test over engine data once that data exists. It now does. Delete the
script and correct the two places that point at it:

```bash
git rm scripts/habitat/build-rooms.py
```

In `docs/superpowers/specs/2026-08-31-habitat-rooms.md`, replace the sentence
"Both were checked mechanically." with "Both are checked by
`src/lib/habitat/rooms.test.ts`." and, in the closing section, replace "both were
checked mechanically when this document was generated" with "all of it is checked
by `src/lib/habitat/rooms.test.ts`".

- [ ] **Step 6: Run the whole check**

```bash
pnpm check
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/habitat/rooms.ts src/lib/habitat/rooms.test.ts docs/superpowers/specs/2026-08-31-habitat-rooms.md
GIT_AUTHOR_NAME="Alejandro Treny Ortega" GIT_AUTHOR_EMAIL="alejandrotreny100@gmail.com" \
GIT_COMMITTER_NAME="Alejandro Treny Ortega" GIT_COMMITTER_EMAIL="alejandrotreny100@gmail.com" \
git commit -m "Cut the sixteen rooms into typed data

The map's invariants move from a throwaway Python generator into vitest,
so editing a room cannot quietly open a wall or orphan a door."
```

---

## Task 3: The twenty-five

**Files:**
- Create: `src/lib/habitat/residents.ts`
- Test: `src/lib/habitat/residents.test.ts`

**Interfaces:**
- Consumes: `RoomId` from `./rooms`.
- Produces: `type ResidentId` (the letters `'A'`–`'Y'`), `type Cluster`,
  `type Key`, `type Resident`, `RESIDENTS: readonly Resident[]`,
  `RESIDENT_BY_ID: Record<ResidentId, Resident>`, `holdersOf(key): ResidentId[]`.

**Transcribing the content.** Names, ages, clusters and assigned duties are in the
roster table of `2026-08-31-habitat-roster-and-weave.md`; the prose, the voice
constraint and the boarding are in `2026-08-31-habitat-residents.md`. Copy both
verbatim.

- [ ] **Step 1: Write the failing test**

Create `src/lib/habitat/residents.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ROOM_BY_ID } from './rooms';
import { RESIDENTS, RESIDENT_BY_ID, holdersOf } from './residents';

describe('the roster', () => {
  it('is twenty-five people', () => {
    expect(RESIDENTS).toHaveLength(25);
  });

  it('gives each of them a distinct initial from A to Y, so a grid reads without a key', () => {
    const ids = RESIDENTS.map((r) => r.id).sort();
    const expected = Array.from({ length: 25 }, (_, i) => String.fromCharCode(65 + i));
    expect(ids).toEqual(expected);
  });

  it("starts each name with that resident's own initial", () => {
    for (const r of RESIDENTS) expect(r.name.charAt(0)).toBe(r.id);
  });

  it('has no Z, and that is deliberate', () => {
    expect(RESIDENTS.some((r) => r.id === ('Z' as never))).toBe(false);
  });

  it('splits them into five clusters of five', () => {
    for (const c of ['I', 'II', 'III', 'IV', 'V'] as const) {
      expect(RESIDENTS.filter((r) => r.cluster === c)).toHaveLength(5);
    }
  });

  it('keeps everybody between thirty-three and seventy-eight at the crash', () => {
    for (const r of RESIDENTS) {
      expect(r.age).toBeGreaterThanOrEqual(33);
      expect(r.age).toBeLessThanOrEqual(78);
    }
  });

  it('pins a voice on every one of them, so twenty-five journals cannot converge', () => {
    for (const r of RESIDENTS) expect(r.voice.length).toBeGreaterThan(20);
    expect(new Set(RESIDENTS.map((r) => r.voice)).size).toBe(25);
  });

  it('gives everybody a life before and a boarding', () => {
    for (const r of RESIDENTS) {
      expect(r.before.length).toBeGreaterThan(20);
      expect(r.boarding.length).toBeGreaterThan(20);
    }
  });
});

describe('what the ship triage decided', () => {
  it('assigned nothing at all to exactly two of them', () => {
    const idle = RESIDENTS.filter((r) => r.duty === null);
    expect(idle.map((r) => r.id).sort()).toEqual(['S', 'Y']);
  });

  it('put the reactor in the hands of a bus driver', () => {
    expect(holdersOf('spine')).toEqual(['J']);
    expect(RESIDENT_BY_ID.J.before).toMatch(/4:40/);
  });

  it('hands out exactly four keys, to four different people', () => {
    const keys = ['spine', 'berths', 'dock', 'infirmary'] as const;
    const holders = keys.flatMap((k) => holdersOf(k));
    expect(holders).toHaveLength(4);
    expect(new Set(holders).size).toBe(4);
  });

  it('only ever names a room that exists', () => {
    for (const r of RESIDENTS) {
      for (const k of r.keys) expect(ROOM_BY_ID[k]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm vitest run src/lib/habitat/residents.test.ts
```

Expected: FAIL — `Failed to resolve import "./residents"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/habitat/residents.ts`. The shape, with two entries shown and the
other twenty-three transcribed the same way:

```ts
// The twenty-five.
//
// Authored before the simulation runs, so that what the engine changes to a person
// is measurable against something real. A resident's initial is their identity on a
// grid and in the weave, which is why no two share one and why the alphabet stops
// at Y.
//
// `voice` is not a mood note. One model writing twenty-five journals will converge
// on one register unless the register is pinned per person, so this is a hard
// constraint on that resident's generated prose.

import type { RoomId } from './rooms';

export type ResidentId =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y';

export type Cluster = 'I' | 'II' | 'III' | 'IV' | 'V';

/** Physical access inherited from wherever somebody happened to be standing when
 *  the triage woke them. Nobody chose this and nobody can undo it. */
export type Key = Extract<RoomId, 'spine' | 'berths' | 'dock' | 'infirmary'>;

export type Resident = {
  id: ResidentId;
  name: string;
  /** At the crash. */
  age: number;
  cluster: Cluster;
  /** What they did before. */
  was: string;
  /** What the ship's triage gave them from a thin file. Several are plainly wrong. */
  duty: string | null;
  keys: readonly Key[];
  /** The life before, and who they are a hundred days in. */
  before: string;
  fears: string;
  wants: string;
  /** How they came to be aboard. No two of these add up. */
  boarding: string;
  /** A hard constraint on this resident's generated prose. */
  voice: string;
};

export const RESIDENTS: readonly Resident[] = [
  {
    id: 'A',
    name: 'Ama Oyelaran',
    age: 59,
    cluster: 'I',
    was: "Ran a small press; printed other people's books",
    duty: 'Records',
    keys: [],
    before:
      "Ran a small press for thirty-one years and printed other people's books. "
      + 'Good ones, mostly. She was the reason several of them existed and her name '
      + 'is in none of them. Her father drowned when she was four; she has one '
      + 'memory of him that she is fairly sure she constructed. A hundred days in '
      + 'she has quietly made the event record beautiful, and has begun leaving '
      + 'small notes in the margins of it, which is not what Records is for.',
    fears: "Having spent a life on other people's words.",
    wants: 'To write something, which she has never once said aloud.',
    boarding:
      'A cultural passage grant, from a foundation whose name she cannot now recall '
      + 'and whose letter she no longer has.',
    voice:
      'Precise, bookish, asks questions instead of making statements. Notices '
      + 'objects before people. Never uses an intensifier.',
  },

  // ... B through X transcribed identically from
  // ... docs/superpowers/specs/2026-08-31-habitat-residents.md

  {
    id: 'Y',
    name: 'Yara Haddad',
    age: 37,
    cluster: 'V',
    was: 'Illustrator',
    duty: null,
    keys: [],
    before:
      'Illustrator. The triage had no field for it and gave her nothing, which makes '
      + 'her the only person in the habitat with unstructured time. She has started '
      + 'drawing: on paper first, then on a hull offcut, then, three weeks ago, on '
      + 'the rock of a gallery wall near the Face where nobody goes. It is not good '
      + 'yet. Nobody has seen it.',
    fears: 'Irrelevance, sharply and constantly, in a place where everybody else has a function.',
    wants: 'To matter, and has not worked out what the currency for that is here.',
    boarding:
      'An artist’s passage. She has no memory of applying and has never found '
      + 'the organisation.',
    voice:
      'Visual, observational, funny, faintly adrift. Describes people as shapes and '
      + 'colours. Self-interrupts. Underplays everything that matters to her.',
  },
];

export const RESIDENT_BY_ID = Object.fromEntries(
  RESIDENTS.map((r) => [r.id, r]),
) as Record<ResidentId, Resident>;

export function holdersOf(key: Key): ResidentId[] {
  return RESIDENTS.filter((r) => r.keys.includes(key)).map((r) => r.id);
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm vitest run src/lib/habitat/residents.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Run the whole check and commit**

```bash
pnpm check
git add src/lib/habitat/residents.ts src/lib/habitat/residents.test.ts
GIT_AUTHOR_NAME="Alejandro Treny Ortega" GIT_AUTHOR_EMAIL="alejandrotreny100@gmail.com" \
GIT_COMMITTER_NAME="Alejandro Treny Ortega" GIT_COMMITTER_EMAIL="alejandrotreny100@gmail.com" \
git commit -m "Put the twenty-five into the codebase

A pinned voice each, because one model writing twenty-five journals will
converge on one register unless the register is a constraint."
```

---

## Task 4: The weave, and the anomaly

**Files:**
- Create: `src/lib/habitat/weave.ts`
- Test: `src/lib/habitat/weave.test.ts`

**Interfaces:**
- Consumes: `ResidentId`, `Cluster`, `RESIDENTS` from `./residents`;
  `mulberry32` from `../world/rng`.
- Produces: `type Axis`, `AXES`, `type Degree`, `type Bond`, `type LatentBond`,
  `BONDS: readonly Bond[]`, `LATENT: readonly LatentBond[]`,
  `pairKey(a, b): string`, `bondBetween(a, b): Bond | undefined`,
  `clusterOf(id): Cluster`, `withinClusterEdges(edges): number`,
  `modularity(edges): number`, `randomBaseline(seed, edges, trials)`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/habitat/weave.test.ts`. The last block is the one that matters:
the rooms document and the design spec both claim the prior graph is anomalously
clustered, and this is what makes that a fact rather than a line of lore.

```ts
import { describe, expect, it } from 'vitest';
import { RESIDENTS } from './residents';
import {
  AXES, BONDS, LATENT, bondBetween, clusterOf, modularity, pairKey,
  randomBaseline, withinClusterEdges,
} from './weave';

const EDGES = [...BONDS, ...LATENT].map((b) => pairKey(b.from, b.to));

describe('the axes', () => {
  it('measures six things between two people', () => {
    expect(AXES).toEqual(
      ['trust', 'affection', 'admiration', 'debt', 'resentment', 'desire'],
    );
  });
});

describe('the bonds', () => {
  it('carries twenty-three real bonds and six latent ones', () => {
    expect(BONDS).toHaveLength(23);
    expect(LATENT).toHaveLength(6);
  });

  it('never pairs somebody with themselves', () => {
    for (const b of [...BONDS, ...LATENT]) expect(b.from).not.toBe(b.to);
  });

  it('names only residents who exist', () => {
    const ids = new Set(RESIDENTS.map((r) => r.id));
    for (const b of [...BONDS, ...LATENT]) {
      expect(ids.has(b.from)).toBe(true);
      expect(ids.has(b.to)).toBe(true);
    }
  });

  it('has no duplicate pair, in either direction', () => {
    expect(new Set(EDGES).size).toBe(EDGES.length);
  });

  it('writes a line for every real bond, because no number says what is between two people', () => {
    for (const b of BONDS) expect(b.line.length).toBeGreaterThan(20);
  });

  it('finds a bond regardless of which way round it is asked', () => {
    expect(bondBetween('U', 'O')).toBeDefined();
    expect(bondBetween('O', 'U')).toBe(bondBetween('U', 'O'));
  });
});

describe('the latent bonds', () => {
  it('runs one way: one of them knows and the other does not', () => {
    for (const l of LATENT) expect(l.knower).toBe(l.from);
  });

  it('gives every one of them a route to surfacing, so no dotted edge can fail to resolve', () => {
    for (const l of LATENT) expect(l.route.length).toBeGreaterThan(30);
  });
});

describe('the anomaly is a measurement, not a claim', () => {
  it('puts twenty-three of the twenty-nine bonds inside a cluster', () => {
    expect(withinClusterEdges(EDGES)).toBe(23);
  });

  it('scores far above what chance produces on the five-way partition', () => {
    const observed = modularity(EDGES);
    const base = randomBaseline(7, EDGES.length, 2000);
    expect(observed).toBeGreaterThan(0.5);
    expect(base.meanModularity).toBeLessThan(0.15);
    expect(base.meanWithin).toBeLessThan(8);
    // Not one random graph in two thousand reaches it.
    expect(base.atLeastAsExtreme).toBe(0);
  });

  it('is reproducible, because the baseline is seeded', () => {
    expect(randomBaseline(7, EDGES.length, 200))
      .toEqual(randomBaseline(7, EDGES.length, 200));
  });

  it('assigns every resident to exactly one cluster', () => {
    for (const r of RESIDENTS) expect(clusterOf(r.id)).toBe(r.cluster);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm vitest run src/lib/habitat/weave.test.ts
```

Expected: FAIL — `Failed to resolve import "./weave"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/habitat/weave.ts`. Transcribe all twenty-three bonds and all six
latent bonds from section 4 and section 5 of
`2026-08-31-habitat-roster-and-weave.md`:

```ts
// What is between them.
//
// Six directed axes, because I may trust you a great deal more than you trust me
// and that difference is half of all human drama. Plus a written line per pair,
// because no number captures what is between two particular people: the axes are
// the instrument and the line is the person.
//
// The graph the twenty-five carried aboard is clustered far past what chance would
// produce, and nothing explains it. Not something withheld from the residents -
// something that does not exist. The measurement lives here so that editing a bond
// cannot quietly destroy the fact.

import { mulberry32 } from '../world/rng';
import { RESIDENTS, type Cluster, type ResidentId } from './residents';

export const AXES = [
  'trust', 'affection', 'admiration', 'debt', 'resentment', 'desire',
] as const;
export type Axis = (typeof AXES)[number];

export type Degree = 'nothing' | 'by-sight' | 'spoken' | 'real' | 'latent';

export type Bond = {
  from: ResidentId;
  to: ResidentId;
  degree: Extract<Degree, 'real'>;
  /** What no scale captures. Revised when something changes between them. */
  line: string;
};

export type LatentBond = {
  from: ResidentId;
  to: ResidentId;
  degree: Extract<Degree, 'latent'>;
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
      'Half-siblings. Nineteen years without a word, over a house neither of them '
      + 'ended up with. Neither knew the other had booked. They have been civil for '
      + 'a hundred days and it is costing them both.',
  },
  // ... the other twenty-two, from section 4 of the roster document
];

export const LATENT: readonly LatentBond[] = [
  {
    from: 'J', to: 'R', degree: 'latent', knower: 'J',
    line:
      'Juno was in a transit station some years ago and watched Reva sit with a '
      + 'crying older woman for forty minutes and then walk away without giving her '
      + 'name. Reva has no memory of the afternoon at all.',
    route:
      'Juno mentions it, most likely as a compliment, at a bad moment, meaning well.',
  },
  // ... the other five, from section 5 of the roster document
];

const CLUSTER_OF = new Map<ResidentId, Cluster>(
  RESIDENTS.map((r) => [r.id, r.cluster]),
);

export function clusterOf(id: ResidentId): Cluster {
  return CLUSTER_OF.get(id)!;
}

/** An undirected pair, in a stable order, so a bond can be looked up either way. */
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

export type Baseline = {
  meanWithin: number;
  meanModularity: number;
  /** How many random graphs matched or beat the real one on within-cluster edges. */
  atLeastAsExtreme: number;
};

/** Erdos-Renyi graphs of the same order and size, for comparison. Seeded, so the
 *  numbers in the spec are reproducible. */
export function randomBaseline(
  seed: number, edgeCount: number, trials: number,
): Baseline {
  const ids = RESIDENTS.map((r) => r.id);
  const allPairs: string[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) allPairs.push(pairKey(ids[i]!, ids[j]!));
  }
  const rand = mulberry32(seed);
  const observed = withinClusterEdges(
    [...BONDS, ...LATENT].map((b) => pairKey(b.from, b.to)),
  );
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
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm vitest run src/lib/habitat/weave.test.ts
```

Expected: PASS, 13 tests. The baseline over two thousand trials takes a second or
two; that is acceptable for the one test that keeps the central clue honest.

- [ ] **Step 5: Point the documents at the test**

In `docs/superpowers/specs/2026-08-31-habitat-roster-and-weave.md`, in section 6,
replace the closing paragraph "When the weave becomes data rather than prose, this
measurement should become a test that runs against it, so that editing a bond
cannot quietly destroy the clue." with "This measurement is
`src/lib/habitat/weave.test.ts`, so editing a bond cannot quietly destroy the
clue."

- [ ] **Step 6: Run the whole check and commit**

```bash
pnpm check
git add src/lib/habitat/weave.ts src/lib/habitat/weave.test.ts docs/superpowers/specs/2026-08-31-habitat-roster-and-weave.md
GIT_AUTHOR_NAME="Alejandro Treny Ortega" GIT_AUTHOR_EMAIL="alejandrotreny100@gmail.com" \
GIT_COMMITTER_NAME="Alejandro Treny Ortega" GIT_COMMITTER_EMAIL="alejandrotreny100@gmail.com" \
git commit -m "Measure the weave in the test suite

Twenty-three of twenty-nine prior bonds fall inside a cluster where chance
puts fewer than five. Nothing explains it, and now nothing can silently
erase it either."
```

---

## What this plan does not build

This is the first of five sub-projects. It produces the data every other one reads,
and nothing visible. In dependency order, the rest are:

1. **The world data.** This plan.
2. **The snapshot format and a Genesis fixture.** The light, read-only payload the
   frontend consumes — positions, room state, people, the day's events — plus a
   day-one hundred fixture generated from Task 1–4 data, so the whole frontend can
   be built and tested before an engine exists.
3. **The habitat view.** The cutaway, the room view, the dossiers and the record,
   lazy-loaded behind the existing `prepare` hook on `UvSwitch`
   (`src/components/desk/world/UvSwitch.tsx:47`) and rendered against the fixture.
   Game pixel art inside, ink-and-amber instrument frame around it.
4. **THE WEAVE.** Force graph, matrix and strings, with the time scrubber, over the
   same snapshot.
5. **The event engine.** The deterministic tick: verbs with physical preconditions,
   the commitment primitives, the cell economy, relationship movement, and the
   record. Emits the snapshots from (2).

Cognition — prompt assembly, the Workers AI and Groq adapters, quota and the cost
firewall, Durable Objects, D1 and alarms — is the separate piece being handed to
another agent, and it plugs in behind the engine's cognition port. **Nothing in
this plan or the four that follow may call inference.**
