import { describe, expect, it, vi } from 'vitest';
import { genesisSnapshot, type HabitatSnapshot } from './snapshot';
import {
  fetchHabitatSnapshot, isHabitatSnapshot, fetchHabitatObserver, isObserverState,
  fetchHabitatArchive, habitatEndpoint,
} from './live';
import { edges } from './weave';

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function liveSnapshot(): HabitatSnapshot {
  return { ...genesisSnapshot(), day: 101, watch: 3 };
}

describe('the live habitat snapshot boundary', () => {
  it('validates all six hundred directed relationships alongside one coherent population', () => {
    const value = { worldRevision: 26, snapshot: liveSnapshot(), relationships: edges() };
    expect(isObserverState(value)).toBe(true);
    expect(isObserverState({ ...value, relationships: value.relationships.slice(1) })).toBe(false);
    expect(isObserverState({ ...value, relationships: [value.relationships[1], ...value.relationships.slice(1)] })).toBe(false);
    expect(isObserverState({ ...value, relationships: value.relationships.map((edge, index) => index === 0
      ? { ...edge, axes: { ...edge.axes, trust: 101 } } : edge) })).toBe(false);
  });

  it('preserves a local proxy prefix and never sends credentials on observer reads', async () => {
    expect(String(habitatEndpoint('http://localhost:5173/__habitat', '/v1/observer')))
      .toBe('http://localhost:5173/__habitat/v1/observer');
    const value = { worldRevision: 26, snapshot: liveSnapshot(), relationships: edges() };
    const fetcher = vi.fn<typeof fetch>(async () => response(value));
    await expect(fetchHabitatObserver('http://localhost:5173/__habitat', { fetcher })).resolves.toEqual(value);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: 'GET', credentials: 'omit' });
  });

  it('reads a past day with its historical provenance and rejects entries filed under another day', async () => {
    const entries = [{ day: 105, watch: 2, minute: 366, room: 'garden', sourceRoom: 'hydroponics',
      who: ['V'], text: 'The seedlings survived.', kind: 'work' }];
    const fetcher = vi.fn<typeof fetch>(async () => response({ day: 105, filters: {}, entries }));
    await expect(fetchHabitatArchive('https://habitat.example', 105, { fetcher })).resolves.toEqual(entries);
    const broken = vi.fn<typeof fetch>(async () => response({ day: 105, entries: [{ ...entries[0], day: 104 }] }));
    await expect(fetchHabitatArchive('https://habitat.example', 105, { fetcher: broken })).rejects.toThrow();
  });
  it('retains verified speech provenance, accepts older archives and rejects conflicting attribution', async () => {
    const entry = { day: 107, watch: 3, minute: 720, room: 'workshops', who: ['G', 'Q'],
      text: 'Q: Here are two cells.', kind: 'meeting', speech: { speaker: 'Q', turnId: 'turn:263' } };
    const fetcher = vi.fn<typeof fetch>(async () => response({ day: 107, entries: [entry] }));
    await expect(fetchHabitatArchive('https://habitat.example', 107, { fetcher })).resolves.toEqual([entry]);
    for (const speech of [{ speaker: 'G', turnId: 'turn:263' }, { speaker: 'Q', turnId: 'turn:263', paid: true }, null]) {
      const invalid = vi.fn<typeof fetch>(async () => response({ day: 107, entries: [{ ...entry, speech }] }));
      await expect(fetchHabitatArchive('https://habitat.example', 107, { fetcher: invalid })).rejects.toThrow('could not be read');
    }
    const { speech: _speech, ...legacy } = entry;
    expect(_speech.speaker).toBe('Q');
    const older = vi.fn<typeof fetch>(async () => response({ day: 107, entries: [legacy] }));
    await expect(fetchHabitatArchive('https://habitat.example', 107, { fetcher: older })).resolves.toEqual([legacy]);
  });

  it('accepts a complete canonical snapshot', () => {
    expect(isHabitatSnapshot(liveSnapshot())).toBe(true);
  });

  it('rejects envelopes, unknown residents and inconsistent room membership', () => {
    const live = liveSnapshot();
    expect(isHabitatSnapshot({ snapshot: live })).toBe(false);
    expect(isHabitatSnapshot({
      ...live,
      people: [{ ...live.people[0], id: 'Z' }, ...live.people.slice(1)],
    })).toBe(false);
    expect(isHabitatSnapshot({
      ...live,
      rooms: live.rooms.map((room) => room.id === 'common' ? { ...room, occupants: [] } : room),
    })).toBe(false);
    expect(isHabitatSnapshot({
      ...live,
      people: live.people.map((person, index) => (
        index === 1 ? { ...person, room: live.people[0]!.room, at: live.people[0]!.at } : person
      )),
    })).toBe(false);
  });

  it('does not touch the network when no public runtime was configured', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(fetchHabitatSnapshot('', { fetcher })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('loads the public snapshot once without credentials', async () => {
    const live = liveSnapshot();
    const fetcher = vi.fn<typeof fetch>(async () => response(live));
    const controller = new AbortController();

    await expect(fetchHabitatSnapshot('https://habitat.example/base', {
      fetcher,
      signal: controller.signal,
    })).resolves.toEqual(live);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('https://habitat.example/v1/snapshot');
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      signal: controller.signal,
    });
  });

  it('returns null for HTTP, network, malformed JSON and invalid contract failures', async () => {
    const serverError = vi.fn<typeof fetch>(async () => response({ error: true }, 503));
    const offline = vi.fn<typeof fetch>(async () => { throw new TypeError('offline'); });
    const malformed = vi.fn<typeof fetch>(async () => new Response('{', { status: 200 }));
    const invalid = vi.fn<typeof fetch>(async () => response({ ...liveSnapshot(), people: [] }));

    await expect(fetchHabitatSnapshot('https://habitat.example', { fetcher: serverError }))
      .resolves.toBeNull();
    await expect(fetchHabitatSnapshot('https://habitat.example', { fetcher: offline }))
      .resolves.toBeNull();
    await expect(fetchHabitatSnapshot('https://habitat.example', { fetcher: malformed }))
      .resolves.toBeNull();
    await expect(fetchHabitatSnapshot('https://habitat.example', { fetcher: invalid }))
      .resolves.toBeNull();
  });

  it('turns an aborted request into a quiet fallback', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });

    await expect(fetchHabitatSnapshot('https://habitat.example', {
      fetcher,
      signal: controller.signal,
    })).resolves.toBeNull();
  });
});
