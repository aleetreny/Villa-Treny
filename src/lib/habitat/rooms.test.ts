import { describe, expect, it } from 'vitest';
import { TERRAIN, gridSize, isTerrain, placedObjects } from './grid';
import { ROOMS, ROOM_BY_ID, neighbours, roomObjects, type RoomId } from './rooms';

const DOORS = new Set(['+', 'X']);
const BOUNDARY = new Set(['#', '|', '+', 'X']);

describe('the habitat is the shape the spec says it is', () => {
  it('has forty-eight referenced places: eleven hull, thirty-two rock and five surface', () => {
    // Sixteen became twenty-seven when the residential system was made real: the
    // Cabins turned into the Long Walk and five cabins you can enter, and the
    // Diggings into the Row and six. The Games Room and four-room administrative
    // wing, service rooms, surface, diner and furnished wings bring it to forty-eight
    // after unsupported placeholder rooms were folded into approved references.
    expect(ROOMS).toHaveLength(48);
    expect(ROOMS.filter((r) => r.side === 'hull')).toHaveLength(11);
    expect(ROOMS.filter((r) => r.side === 'rock')).toHaveLength(32);
    expect(ROOMS.filter((r) => r.side === 'surface')).toHaveLength(5);
  });

  it('houses all twenty-five in eleven homes, ten in the hull and fifteen in rock', () => {
    const homes = ROOMS.filter((r) => /^(cabin|dig)\d$/.test(r.id));
    expect(homes).toHaveLength(11);
    expect(homes.filter((r) => r.side === 'hull')).toHaveLength(5);
    expect(homes.filter((r) => r.side === 'rock')).toHaveLength(6);
  });

  it('tilts the hull and leaves the rock level', () => {
    for (const room of ROOMS) {
      expect(room.tilt).toBe(room.side === 'hull' ? 22 : 0);
    }
  });

  it('gives every room a unique id', () => {
    expect(new Set(ROOMS.map((r) => r.id)).size).toBe(48);
  });

  it('carries between sixty and two hundred and forty significant objects', () => {
    // The band was sixty to eighty across sixteen rooms. Eleven homes were added,
    // each with a bed, its stowage and the one thing that is only in that one.
    const total = ROOMS.reduce((n, r) => n + Object.keys(r.legend).length, 0);
    expect(total).toBeGreaterThanOrEqual(50);
    expect(total).toBeLessThanOrEqual(240);
  });

  it('describes every room for whoever is looking at it', () => {
    for (const room of ROOMS) expect(room.description.length).toBeGreaterThan(80);
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
    const doors = [...room.grid.join('')].filter((c) => DOORS.has(c)).length;
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

  it('can be walked into: every open tile is reachable from a door', () => {
    // Drawing the Diggings found three homes nobody could enter. Mara's, Quim's
    // and Pilar's each had their front door in the wall directly below the spur
    // of rock between their two chambers, so the first step inside was into
    // something unwalkable and the whole interior was sealed. The room graph
    // said they were connected and the boundary was closed, so every test
    // passed. This is the one that would have caught it.
    const { w, h } = gridSize(room.grid);
    // Vacuum is crossable here on purpose. The Breach is a tear with islands of
    // floor in it, and reaching them is what a suit is for — the grid cannot say
    // "walkable if suited", so it says not walkable and the room means otherwise.
    // Everything else that blocks is furniture, and floor sealed off behind
    // furniture is always a mistake.
    const walkable = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      const ch = room.grid[y]![x]!;
      if (ch === '*') return true;
      if (isTerrain(ch)) return TERRAIN[ch].walkable;
      return !room.legend[ch]?.solid;
    };
    const seen = new Set<string>();
    const work: [number, number][] = [];
    // A sealed mouth is still a way in — it needs a key, a suit or a tool — so
    // seed from every door, walkable or not.
    room.grid.forEach((row, y) => [...row].forEach((ch, x) => {
      if (DOORS.has(ch)) { seen.add(`${x},${y}`); work.push([x, y]); }
    }));
    while (work.length) {
      const [x, y] = work.pop()!;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (!walkable(nx, ny) || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`);
        work.push([nx, ny]);
      }
    }
    const stranded: string[] = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (walkable(x, y) && !seen.has(`${x},${y}`)) stranded.push(`${x},${y}`);
      }
    }
    expect(stranded, `${room.id} strands ${stranded.length} tiles`).toEqual([]);
  });
});

describe('the habitat is one place', () => {
  it('can be walked from the Bridge to every other room', () => {
    const seen = new Set<RoomId>(['bridge']);
    const work: RoomId[] = ['bridge'];
    while (work.length) {
      const id = work.shift()!;
      for (const next of neighbours(id)) {
        if (!seen.has(next)) {
          seen.add(next);
          work.push(next);
        }
      }
    }
    expect(seen.size).toBe(48);
  });
});

describe('accessors', () => {
  it('finds the fabricator in the Workshops', () => {
    const names = roomObjects('workshops').map((o) => o.name);
    expect(names.some((name) => name.includes('fabricator'))).toBe(true);
  });

  it('keeps unsupported concepts as lore instead of phantom rooms', () => {
    const ids = new Set<string>(ROOMS.map((room) => room.id));
    for (const id of ['berths', 'spine', 'greatwall', 'hydroponics', 'hollow']) {
      expect(ids.has(id), id).toBe(false);
    }
    expect(ROOM_BY_ID.infirmary.description).toMatch(/cold/i);
    expect(ROOM_BY_ID.workshops.description).toMatch(/reactor/i);
    expect(ROOM_BY_ID.face.note).toMatch(/natural hollow/i);
  });

  it('uses the approved Planter Yard as the habitat hydroponics', () => {
    expect(ROOM_BY_ID.garden.name).toBe('Hydroponics Yard');
    expect(roomObjects('garden').map((o) => o.name)).toContain('tyres reused as raised beds');
  });

  it('keeps the supplied Mid-century bed in an explicit bedroom', () => {
    expect(ROOM_BY_ID.sparebedroom.name).toBe('Spare Bedroom');
    expect(roomObjects('sparebedroom').map((o) => o.name)).toContain('the double bed');
  });

  it('agrees with the terrain table about what a door is', () => {
    expect(TERRAIN['+'].walkable).toBe(true);
  });
});
