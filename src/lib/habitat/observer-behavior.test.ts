import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { fitRoom, roomCamera, followScroll } from './observer-camera';
import { ROOM_ART } from './room-art';
import { observerNeighbors, observerPresence } from './useObserverPresence';
import { genesisSnapshot } from './snapshot';
import { matrixStep, axisGap } from './observer-matrix';
import { edges, AXES } from './weave';
import { RESIDENTS } from './residents';
import { isHabitatSnapshot, type RuntimeStatus } from './live';
import { LiveStatus, worldClockLabel } from '../../components/desk/habitat/LiveStatus';

describe('room camera', () => {
  it('fits every room at an integer scale with no overscan when native art fits', () => {
    for (const view of [{ width: 736, height: 503 }, { width: 510, height: 375 }]) {
      for (const art of Object.values(ROOM_ART)) {
        if (!art) continue;
        const zoom = fitRoom(view, art);
        expect(Number.isInteger(zoom)).toBe(true);
        if (art.width + 4 <= view.width && art.height + 4 <= view.height) {
          expect(art.width * zoom + 4).toBeLessThanOrEqual(view.width);
          expect(art.height * zoom + 4).toBeLessThanOrEqual(view.height);
        }
      }
    }
  });
  it('does not lose an entire scale for optional padding', () => {
    const view = { width: 618, height: 700 }, art = { width: 204, height: 184 };
    expect(fitRoom(view, art)).toBe(3);
    expect(roomCamera(view, art, null).width).toBe(618);
  });
  it('provides scrollable native art in small viewports and bounded follow offsets', () => {
    const view = { width: 250, height: 200 };
    const camera = roomCamera(view, { width: 300, height: 260 }, 4);
    const person = { x: camera.x + 235 * 4, y: camera.y + (240 - 22) * 4 };
    const pan = followScroll(view, camera, person);
    expect(pan.left).toBeGreaterThan(0);
    expect(pan.top).toBeGreaterThan(0);
    expect(person.x - pan.left).toBe(view.width / 2);
    expect(person.y - pan.top).toBe(view.height / 2);
    expect(followScroll(view, camera, { x: -50, y: -50 })).toEqual({ left: 0, top: 0 });
    expect(followScroll(view, camera, { x: 9000, y: 9000 })).toEqual({ left: camera.width - view.width, top: camera.height - view.height });
    expect(fitRoom(view, { width: 300, height: 260 })).toBe(1);
  });
});

describe('presentation continuity and logical world independence', () => {
  it('crosses only adjacent rooms over a full hour, including old twelve-step wrap boundaries', () => {
    const world = genesisSnapshot(7);
    let previous = observerPresence(world, 0);
    for (let seconds = 1; seconds <= 3600; seconds++) {
      const next = observerPresence(world, seconds);
      next.people.forEach((person, index) => {
        const before = previous.people[index]!;
        if (person.room !== before.room) expect(observerNeighbors(before.room), `${person.id} at ${seconds}`).toContain(person.room);
      });
      expect(next.record).toBe(world.record);
      previous = next;
    }
  });
  it('keeps the presentation route after a saved-world location changes', () => {
    const world = genesisSnapshot(7);
    const moved = structuredClone(world);
    moved.people.forEach((person) => { person.room = 'common'; });
    const before = observerPresence(world, 405);
    const after = observerPresence(moved, 405, world.people);
    expect(after.people.map((person) => person.room)).toEqual(before.people.map((person) => person.room));
  });
  it('accepts several logical residents on one valid anchor without inventing floor capacity', () => {
    const snapshot = genesisSnapshot(7), anchor = snapshot.people[0]!;
    snapshot.people.forEach((person) => { person.room = anchor.room; person.at = { ...anchor.at }; });
    snapshot.rooms.forEach((room) => { room.occupants = room.id === anchor.room ? snapshot.people.map((person) => person.id) : []; });
    expect(isHabitatSnapshot(snapshot)).toBe(true);
  });
});

describe('relationship inspection', () => {
  it('moves with arrow keys in every matrix cell, skipping self and wrapping edges', () => {
    for (const from of RESIDENTS) for (const to of RESIDENTS) if (from.id !== to.id) {
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        const [a, b] = matrixStep(from.id, to.id, key);
        expect(a).not.toBe(b);
        expect(RESIDENTS.some((person) => person.id === a)).toBe(true);
        expect(RESIDENTS.some((person) => person.id === b)).toBe(true);
      }
    }
  });
  it('compares the selected feeling, not a hidden average of all axes', () => {
    const [forward, reverse] = edges().slice(0, 2).map((edge) => structuredClone(edge));
    AXES.forEach((axis) => { forward!.axes[axis] = reverse!.axes[axis] = 30; });
    reverse!.axes.resentment = 100;
    expect(axisGap(forward!, reverse!, 'trust')).toBe(0);
    expect(axisGap(forward!, reverse!, 'resentment')).toBe(70);
  });
});

describe('truthful health labels', () => {
  const status = { mode: 'running', health: 'healthy', lastErrorCode: null } as RuntimeStatus;
  it('does not equate a successful read with a running world', () => {
    expect(worldClockLabel(null)).toBe('Clock unknown');
    expect(worldClockLabel({ ...status, mode: 'paused' })).toBe('World paused');
    expect(worldClockLabel({ ...status, lastErrorCode: 'watch_failed' })).toBe('World delayed');
    expect(worldClockLabel({ ...status, health: 'degraded' })).toBe('World delayed');
    expect(worldClockLabel(status)).toBe('World running');
  });
  it('labels unavailable state without displaying day or fabricated events', () => {
    const html = renderToStaticMarkup(createElement(LiveStatus, { connection: 'offline', status: null, error: 'Could not connect.', statusError: null, lastConnectedAt: null, refresh: () => {} }));
    expect(html).toContain('Offline');
    expect(html).toContain('No saved world has been received yet.');
    expect(html).not.toContain('Day 100');
  });
});

describe('conditional world reads', () => {
  it('accepts 304 only when the caller supplied its saved-world ETag', async () => {
    const { fetchHabitatObserverUpdate } = await import('./live');
    let headers: HeadersInit | undefined;
    const fetcher = (async (_url, init) => { headers = init?.headers; return new Response(null, { status: 304 }); }) as typeof fetch;
    await expect(fetchHabitatObserverUpdate('https://example.test', { etag: '"revision-25"', fetcher })).resolves.toEqual({ unchanged: true, etag: '"revision-25"' });
    expect(new Headers(headers).get('if-none-match')).toBe('"revision-25"');
    await expect(fetchHabitatObserverUpdate('https://example.test', { fetcher })).rejects.toThrow('304');
  });
});
