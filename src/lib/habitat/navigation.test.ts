import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROOMS, ROOM_BY_ID } from './rooms';
import type { Point } from './grid';
import { roomAccessible, roomNavigationDiagnostics, roomPath, type RoomArt } from './room-art';
import {
  DIRECTION_VECTOR, HABITAT_NAVIGATION, NAVIGATION_WINGS, createHabitatNavigation,
  isNavigationFloor, navigationScene, navigationScenePath, navigationWalkingPath,
  stepNavigation, type Direction, type NavigationScene, type RoomNavigationMask,
} from './navigation';

const network = HABITAT_NAVIGATION;
const rooms = network.scenes.filter((scene) => scene.roomId);
const halls = network.scenes.filter((scene) => scene.kind === 'corridor');

function cellKey(at: Point): string {
  return `${at.x},${at.y}`;
}

function floorComponent(scene: NavigationScene, from: Point): Set<string> {
  const queue = [from];
  const visited = new Set([cellKey(from)]);
  for (let index = 0; index < queue.length; index += 1) {
    for (const vector of Object.values(DIRECTION_VECTOR)) {
      const at = { x: queue[index]!.x + vector.x, y: queue[index]!.y + vector.y };
      if (!isNavigationFloor(scene, at) || visited.has(cellKey(at))) continue;
      visited.add(cellKey(at));
      queue.push(at);
    }
  }
  return visited;
}

describe('the scene-based habitat geometry', () => {
  it('represents all 48 existing RoomIds exactly once without changing authored rooms', () => {
    expect(rooms).toHaveLength(48);
    expect(new Set(rooms.map((scene) => scene.roomId)).size).toBe(48);
    expect(rooms.map((scene) => scene.roomId).sort()).toEqual(ROOMS.map((room) => room.id).sort());
    expect(navigationScene(network, 'room:longwalk')?.kind).toBe('corridor');
    expect(navigationScene(network, 'room:row')?.kind).toBe('corridor');
    expect(ROOM_BY_ID.longwalk.grid[0]).toBe('##+##');
    expect(new Set(network.scenes.map((scene) => scene.id)).size).toBe(network.scenes.length);
  });

  it('groups rooms by family without making bedrooms or offices into thoroughfares', () => {
    for (const scene of rooms.filter((scene) => scene.kind === 'room' && !scene.sealed)) {
      const destinations = new Set(scene.exits.map((exit) => exit.to));
      expect(destinations.size, scene.id).toBe(1);
      for (const destination of destinations) {
        const hall = navigationScene(network, destination)!;
        expect(hall.kind).toBe('corridor');
        expect(hall.group).toBe(scene.group);
      }
    }
    expect(NAVIGATION_WINGS).toHaveLength(9);
    expect(navigationScene(network, 'corridor:spine')?.sections?.map((section) => section.name))
      .toEqual(['The Climb', 'The Throat']);
  });

  it('keeps every physical room and passage rectangle clear of every other interior', () => {
    network.scenes.forEach((a, index) => {
      for (const b of network.scenes.slice(index + 1)) {
        const overlapX = Math.min(a.map.x + a.map.w, b.map.x + b.map.w) - Math.max(a.map.x, b.map.x);
        const overlapY = Math.min(a.map.y + a.map.h, b.map.y + b.map.h) - Math.max(a.map.y, b.map.y);
        expect(overlapX <= 0 || overlapY <= 0, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    });
  });

  it('places reciprocal openings on the same physical boundary, with matching directions', () => {
    const opposite: Record<Direction, Direction> = {
      north: 'south', south: 'north', east: 'west', west: 'east',
    };
    for (const scene of network.scenes) {
      expect(scene.grid.length).toBeGreaterThan(0);
      expect(scene.grid.every((row) => row.length === scene.grid[0]!.length), scene.id).toBe(true);
      for (const exit of scene.exits) {
        const other = navigationScene(network, exit.to)!;
        const reverse = other.exits.find((candidate) => candidate.to === scene.id
          && candidate.entranceIndex === exit.entranceIndex);
        expect(reverse, exit.id).toBeDefined();
        expect(reverse!.mapAt).toEqual(exit.mapAt);
        expect(reverse!.outward).toBe(opposite[exit.outward]);
        expect(isNavigationFloor(scene, exit.at), exit.id).toBe(true);
        expect(isNavigationFloor(other, exit.arrival), exit.id).toBe(true);
        expect(isNavigationFloor(scene, reverse!.arrival), reverse!.id).toBe(true);
        const width = scene.grid[0]!.length;
        const height = scene.grid.length;
        if (exit.outward === 'north') expect(exit.at.y).toBe(0);
        if (exit.outward === 'south') expect(exit.at.y).toBe(height - 1);
        if (exit.outward === 'west') expect(exit.at.x).toBe(0);
        if (exit.outward === 'east') expect(exit.at.x).toBe(width - 1);
        const edge = exit.outward === 'north' ? scene.map.y
          : exit.outward === 'south' ? scene.map.y + scene.map.h
            : exit.outward === 'west' ? scene.map.x : scene.map.x + scene.map.w;
        expect(exit.outward === 'north' || exit.outward === 'south' ? exit.mapAt.y : exit.mapAt.x).toBe(edge);
      }
    }
  });

  it('connects every open hallway cell and every opening around the sparse stores', () => {
    for (const scene of halls) {
      const visited = floorComponent(scene, scene.exits[0]!.at);
      scene.grid.forEach((row, y) => [...row].forEach((cell, x) => {
        if (cell === '.') expect(visited.has(`${x},${y}`), `${scene.id} ${x},${y}`).toBe(true);
      }));
      for (const exit of scene.exits) expect(visited.has(cellKey(exit.at)), exit.id).toBe(true);
      for (const prop of scene.props ?? []) {
        expect(scene.grid[prop.at.y]![prop.at.x]).toBe('c');
        expect(scene.exits.some((exit) => cellKey(exit.at) === cellKey(prop.at))).toBe(false);
      }
    }
  });

  it('reaches every usable room from the landing and keeps Breach sealed', () => {
    for (const scene of network.scenes) {
      const path = navigationScenePath(network, network.start.sceneId, scene.id);
      if (scene.id === 'room:breach') {
        expect(path).toBeNull();
        expect(scene.exits).toEqual([]);
        expect(scene.grid.join('')).not.toContain('.');
      } else {
        expect(path, scene.id).not.toBeNull();
        expect(path![0]).toBe(network.start.sceneId);
        expect(path!.at(-1)).toBe(scene.id);
        expect(navigationScenePath(network, scene.id, network.start.sceneId), scene.id).not.toBeNull();
      }
    }
  });
});

describe('walking between separately rendered scenes', () => {
  it('crosses every opening both ways, placing the visitor safely inside the destination', () => {
    for (const scene of network.scenes) {
      for (const exit of scene.exits) {
        const result = stepNavigation(network, { sceneId: scene.id, cell: exit.at }, exit.outward);
        expect(result.kind, exit.id).toBe('transition');
        expect(result.state).toEqual({ sceneId: exit.to, cell: exit.arrival });
        const destination = navigationScene(network, exit.to)!;
        const returning = destination.exits.find((candidate) => candidate.to === scene.id
          && candidate.entranceIndex === exit.entranceIndex)!;
        const approach = navigationWalkingPath(destination, result.state.cell, returning.at);
        expect(approach, exit.id).not.toBeNull();
        expect(approach!.length, exit.id).toBeGreaterThan(1);
        expect(stepNavigation(network, result.state, returning.outward).kind, exit.id).not.toBe('transition');
      }
    }
  });

  it('walks around a crate, blocks its footprint, and does not cross an unmarked wall', () => {
    const hall = navigationScene(network, 'corridor:landing')!;
    const crate = hall.props![0]!.at;
    expect(stepNavigation(network, {
      sceneId: hall.id, cell: { x: crate.x - 1, y: crate.y },
    }, 'east').kind).toBe('blocked');
    expect(navigationWalkingPath(hall,
      { x: crate.x - 1, y: crate.y }, { x: crate.x + 1, y: crate.y }))
      .toHaveLength(5);
    expect(stepNavigation(network, { sceneId: hall.id, cell: { x: 1, y: 2 } }, 'north').kind).toBe('blocked');
    expect(stepNavigation(network, { sceneId: hall.id, cell: { x: 1, y: 3 } }, 'east').kind).toBe('move');
  });

  it('enters and exits at the room artwork mask resolution instead of the semantic grid', () => {
    const precise = createHabitatNavigation({
      common: {
        cellSize: 4,
        grid: ['#########', '#...#...#', '#...#...#', '#.......#', '#.......#', '####.####'],
        exit: { x: 4, y: 5 }, spawn: { x: 4, y: 4 },
      },
    });
    const room = navigationScene(precise, 'room:common')!;
    expect(room.cellSize).toBe(4);
    expect(room.grid[1]).toBe('#...#...#');
    const hall = navigationScene(precise, 'corridor:landing')!;
    const opening = hall.exits.find((exit) => exit.to === room.id)!;
    expect(stepNavigation(precise, { sceneId: hall.id, cell: opening.at }, 'north')).toMatchObject({
      kind: 'transition', state: { sceneId: room.id, cell: { x: 4, y: 4 } },
    });
    expect(navigationWalkingPath(room, { x: 3, y: 1 }, { x: 5, y: 1 })).toHaveLength(7);
    expect(stepNavigation(precise, { sceneId: room.id, cell: { x: 3, y: 1 } }, 'east').kind).toBe('blocked');
  });

  it('gives the two separate washroom interiors distinct entrances and return paths', () => {
    const divided = createHabitatNavigation({
      washroom: {
        cellSize: 4,
        grid: ['#########', '#...#...#', '#...#...#', '#...#...#', '##.###.##'],
        exit: { x: 2, y: 4 }, spawn: { x: 2, y: 3 },
        exits: [
          { x: 2, y: 4, arrival: { x: 2, y: 3 } },
          { x: 6, y: 4, arrival: { x: 6, y: 3 } },
        ],
      },
    });
    const room = navigationScene(divided, 'room:washroom')!;
    expect(navigationWalkingPath(room, { x: 2, y: 3 }, { x: 6, y: 3 })).toBeNull();
    const hall = navigationScene(divided, 'corridor:utilityrun')!;
    const entrances = hall.exits.filter((exit) => exit.to === room.id);
    expect(entrances).toHaveLength(2);
    entrances.forEach((exit, index) => {
      const entered = stepNavigation(divided, { sceneId: hall.id, cell: exit.at }, exit.outward);
      expect(entered.kind).toBe('transition');
      expect(entered.state.cell).toEqual({ x: index === 0 ? 2 : 6, y: 3 });
      const back = room.exits[index]!;
      const left = stepNavigation(divided, { sceneId: room.id, cell: back.at }, back.outward);
      expect(left.state).toEqual({ sceneId: hall.id, cell: { x: exit.at.x, y: 2 } });
    });
  });

  it('rejects an obstructed arrival instead of moving an agent through furniture', () => {
    const blocked = createHabitatNavigation({
      common: { cellSize: 4, grid: ['#####', '#####', '##.##'], exit: { x: 2, y: 2 }, spawn: { x: 2, y: 1 } },
    });
    const hall = navigationScene(blocked, 'corridor:landing')!;
    const exit = hall.exits.find((item) => item.to === 'room:common')!;
    expect(stepNavigation(blocked, { sceneId: hall.id, cell: exit.at }, exit.outward).kind).toBe('blocked');
    expect(navigationScenePath(blocked, hall.id, 'room:common')).toBeNull();
    expect(stepNavigation(blocked, { sceneId: 'room:breach', cell: { x: 2, y: 2 } }, 'south').kind).toBe('blocked');
  });
});

describe('the actual room-art masks used by the browser', () => {
  async function authoredNetwork() {
    const roomArtModule = '../../../tools/roomlab/explorer-room-art.js';
    const { ROOM_ART, roomNavigation } = await import(roomArtModule) as {
      ROOM_ART: Record<string, unknown>;
      roomNavigation: (id: string) => RoomNavigationMask;
    };
    return createHabitatNavigation(Object.fromEntries(
      Object.keys(ROOM_ART).map((id) => [id, roomNavigation(id)]),
    ));
  }

  it('exports the same audited geometry and masks that the static browser consumes', async () => {
    const actual = await authoredNetwork();
    const saved = JSON.parse(readFileSync(new URL('../../../tools/roomlab/explorer-network.json', import.meta.url), 'utf8'));
    expect(saved).toEqual(actual);
    expect(actual.scenes.filter((scene) => scene.kind === 'room' && !scene.sealed)).toHaveLength(45);
    for (const room of actual.scenes.filter((scene) => scene.kind === 'room' && !scene.sealed)) {
      expect(room.cellSize, room.id).toBe(1);
      expect(room.grid.some((row) => row.includes('.')), room.id).toBe(true);
    }
  });

  it('walks through every actual boundary and returns through the matching opening', async () => {
    const actual = await authoredNetwork();
    for (const scene of actual.scenes) {
      if (!scene.sealed) expect(navigationScenePath(actual, actual.start.sceneId, scene.id), scene.id).not.toBeNull();
      for (const exit of scene.exits) {
        const entered = stepNavigation(actual, { sceneId: scene.id, cell: exit.at }, exit.outward);
        expect(entered.kind, exit.id).toBe('transition');
        const destination = navigationScene(actual, exit.to)!;
        const reverse = destination.exits.find((candidate) => candidate.to === scene.id
          && candidate.entranceIndex === exit.entranceIndex)!;
        expect(navigationWalkingPath(destination, entered.state.cell, reverse.at), exit.id).not.toBeNull();
        const returned = stepNavigation(actual, { sceneId: destination.id, cell: reverse.at }, reverse.outward);
        expect(returned.kind, exit.id).toBe('transition');
        expect(returned.state.sceneId, exit.id).toBe(scene.id);
      }
    }
  });

  it('uses native room sizes and physical openings on the same scale as the corridors', async () => {
    const actual = await authoredNetwork();
    const roomArtModule = '../../../tools/roomlab/explorer-room-art.js';
    const { ROOM_ART } = await import(roomArtModule) as { ROOM_ART: Record<string, { W: number; H: number }> };
    actual.scenes.forEach((scene, index) => {
      if (scene.kind === 'room') {
        const art = ROOM_ART[scene.roomId!]!;
        expect(scene.map.w * 32, scene.id).toBe(art.W);
        expect(scene.map.h * 32, scene.id).toBe(art.H);
        for (const exit of scene.exits) {
          const projectedX = scene.map.x + ((exit.at.x + 0.5) * scene.cellSize
            + (exit.mapAdjustmentPx ?? 0)) / 32;
          expect(exit.mapAt.x, exit.id).toBe(projectedX);
          expect(Math.abs(exit.mapAdjustmentPx ?? 0), exit.id).toBeLessThanOrEqual(scene.id === 'room:washroom' ? 24 : 4);
        }
      } else {
        expect(scene.map.w * 32, scene.id).toBe(scene.grid[0]!.length * scene.cellSize);
        expect(scene.map.h * 32, scene.id).toBe(scene.grid.length * scene.cellSize);
      }
      for (const other of actual.scenes.slice(index + 1)) {
        const overlapX = Math.min(scene.map.x + scene.map.w, other.map.x + other.map.w) - Math.max(scene.map.x, other.map.x);
        const overlapY = Math.min(scene.map.y + scene.map.h, other.map.y + other.map.h) - Math.max(scene.map.y, other.map.y);
        expect(overlapX <= 0 || overlapY <= 0, `${scene.id} overlaps ${other.id}`).toBe(true);
      }
    });
    const washroom = navigationScene(actual, 'room:washroom')!;
    expect(washroom.exits[1]!.mapAdjustmentPx).toBe(24);
    const utility = navigationScene(actual, 'corridor:utilityrun')!;
    const entrances = utility.exits.filter((exit) => exit.to === washroom.id);
    expect(entrances[1]!.at.x - entrances[0]!.at.x).toBe(2);
    expect(utility.grid[0]![entrances[0]!.at.x + 1]).toBe('#');
    expect(utility.grid[1]![entrances[0]!.at.x + 1]).toBe('#');
  });

  it('preserves isolated floor, diagnoses it, and connects every usable footprint to a real opening', async () => {
    const actual = await authoredNetwork();
    const roomArtModule = '../../../tools/roomlab/explorer-room-art.js';
    const { roomNavigation } = await import(roomArtModule) as { roomNavigation: (id: string) => RoomArt };
    let isolatedPixels = 0;
    for (const scene of actual.scenes.filter((item) => !item.sealed)) {
      const reached = new Set<string>();
      for (const exit of scene.exits) {
        if (reached.has(cellKey(exit.at))) continue;
        for (const key of floorComponent(scene, exit.at)) reached.add(key);
      }
      const isolated = scene.grid.reduce((sum, row, y) => sum + [...row].filter((cell, x) => cell === '.' && !reached.has(`${x},${y}`)).length, 0);
      if (scene.kind === 'corridor') expect(isolated, scene.id).toBe(0);
      else {
        const art = roomNavigation(scene.roomId!);
        expect(art.diagnostics?.inaccessibleFloorPixels, scene.id).toBe(isolated);
        const diagnostics = roomNavigationDiagnostics(art);
        expect(diagnostics.accessiblePositions, scene.id).toBeGreaterThan(0);
        for (const exit of art.exits) {
          expect(roomAccessible(art, exit.arrival), scene.id).toBe(true);
          expect(roomPath(art, exit.arrival, exit.at).length, scene.id).toBeGreaterThan(0);
        }
        isolatedPixels += isolated;
      }
    }
    // This real patch is still floor, but cannot receive a complete resident
    // from an access. Never paint it as a wall merely to satisfy connectivity.
    const gate = roomNavigation('sheltergate');
    expect(gate.grid[126]?.[15]).toBe('.');
    expect(roomAccessible(gate, { x: 15, y: 126 })).toBe(false);
    expect(isolatedPixels).toBeGreaterThan(0);
    const washroom = navigationScene(actual, 'room:washroom')!;
    expect(washroom.exits).toHaveLength(2);
    expect(navigationWalkingPath(washroom, washroom.exits[0]!.at, washroom.exits[1]!.at)).toBeNull();
  });
});
