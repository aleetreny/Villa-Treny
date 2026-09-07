import { useEffect, useMemo, useRef, useState } from 'react';
import { ROOM_BY_ID, type RoomId } from './rooms';
import type { HabitatSnapshot } from './snapshot';
import { visibleRoom } from './room-art';
import { usePageVisible, useReducedMotion } from './observer-preferences';

/** Corridors remain in the canonical graph; the room observer folds them away. */
export function observerNeighbors(room: RoomId): RoomId[] {
  const candidates = new Set<RoomId>();
  const visit = (id: RoomId, visited: Set<RoomId>) => {
    if (id === 'breach' || visited.has(id)) return;
    visited.add(id);
    if (id === 'longwalk' || id === 'row') ROOM_BY_ID[id].connects.forEach((next) => visit(next, visited));
    else if (id !== room) candidates.add(id);
  };
  ROOM_BY_ID[room].connects.forEach((id) => visit(id, new Set([room])));
  return [...candidates];
}

const neighbors = new Map<RoomId, RoomId[]>();
function onward(room: RoomId) {
  if (!neighbors.has(room)) neighbors.set(room, observerNeighbors(room));
  return neighbors.get(room)!;
}

/** An unbroken, deterministic walk: each step extends the previous route.
 * No cycle restarts at home, and this clock never writes a world event. */
export function observerPresence(snapshot: HabitatSnapshot, seconds: number, origins = snapshot.people): HabitatSnapshot {
  const people = snapshot.people.map((person, index) => {
    const home = visibleRoom(origins.find((origin) => origin.id === person.id)?.room ?? person.room);
    const beat = Math.floor(Math.max(0, seconds) / (34 + index % 7 * 3));
    let room = home, previous = home;
    for (let step = 0; step < beat; step++) {
      const candidates = onward(room);
      const continuing = candidates.filter((id) => id !== previous);
      const visits = continuing.length ? continuing : candidates;
      if (!visits.length) break;
      previous = room;
      room = visits[(index * 7 + step * 3) % visits.length]!;
    }
    return { ...person, room, doing: room !== visibleRoom(person.room) ? 'taking a walk' : person.doing };
  });
  return { ...snapshot, people, rooms: snapshot.rooms.map((room) => ({ ...room, occupants: people.filter((person) => person.room === room.id).map((person) => person.id) })) };
}

export function useObserverPresence(snapshot: HabitatSnapshot | null, enabled = true): HabitatSnapshot | null {
  const reduced = useReducedMotion();
  const visible = usePageVisible();
  const [seconds, setSeconds] = useState(0);
  const elapsed = useRef(0);
  const lastSteps = useRef('');
  // Keep the presentation route when a newly committed world moves someone.
  const [origins, setOrigins] = useState<HabitatSnapshot['people'] | null>(null);
  if (snapshot && !origins) setOrigins(snapshot.people);
  const hasSnapshot = Boolean(snapshot);
  useEffect(() => {
    if (!hasSnapshot || !enabled || reduced || !visible) return;
    const timer = window.setInterval(() => {
      elapsed.current += 1;
      const steps = Array.from({ length: 7 }, (_, index) => Math.floor(elapsed.current / (34 + index * 3))).join(',');
      if (steps !== lastSteps.current) { lastSteps.current = steps; setSeconds(elapsed.current); }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasSnapshot, enabled, reduced, visible]);
  // Only a room crossing changes React state; idle clock ticks stay in refs.
  return useMemo(() => snapshot ? observerPresence(snapshot, seconds, origins ?? snapshot.people) : null,
    [snapshot, origins, seconds]);
}
