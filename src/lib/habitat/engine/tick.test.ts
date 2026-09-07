import { describe, expect, it } from 'vitest';
import { isWalkable } from '../grid';
import { RESIDENTS } from '../residents';
import { ROOM_BY_ID, type RoomId } from '../rooms';
import { AXES } from '../weave';
import { CONDITIONS, genesisState, held, snapshotFrom } from './state';
import { advanceDay, advanceScheduledWatch, advanceWatch, choose, run } from './tick';
import { attempt, decodeIntentFor } from './verbs';

function expectBodiesPlaced(state: ReturnType<typeof genesisState>): void {
  const occupied = new Set<string>();
  for (const resident of RESIDENTS) {
    const body = state.bodies[resident.id];
    const { grid, legend } = ROOM_BY_ID[body.room];
    expect(isWalkable(grid, legend, body.at.x, body.at.y), resident.id).toBe(true);
    const key = `${body.room}:${body.at.x}:${body.at.y}`;
    expect(occupied.has(key), key).toBe(false);
    occupied.add(key);
  }
}

describe('a watch', () => {
  it('starts everybody on a distinct walkable tile', () => {
    expectBodiesPlaced(genesisState());
  });

  it('gives everybody exactly one go at it', () => {
    const s = genesisState();
    advanceWatch(s);
    expect(s.watch).toBe(2);
    for (const r of RESIDENTS) expect(s.bodies[r.id].doing.length).toBeGreaterThan(3);
  });

  it('keeps every watch destination in the accessible room catalogue', () => {
    const s = genesisState();
    const before = Object.fromEntries(RESIDENTS.map((r) => [r.id, s.bodies[r.id].room]));
    advanceWatch(s);
    for (const r of RESIDENTS) {
      const from = before[r.id]!;
      const to = s.bodies[r.id].room;
      if (from === to) continue;
      expect(ROOM_BY_ID[to], `${r.id} ${from}->${to}`).toBeDefined();
      expect(to).not.toBe('breach');
    }
  });

  it('never puts anybody in the Breach, which has no air', () => {
    const { state } = run(genesisState(), 12);
    for (const r of RESIDENTS) expect(state.bodies[r.id].room).not.toBe('breach');
  });

  it('keeps positions walkable and distinct when somebody changes rooms', () => {
    const s = genesisState();
    expect(s.bodies.A.room).toBe('records');
    expect(attempt(s, { verb: 'go', actor: 'A', room: 'archive' }).ok).toBe(true);
    expect(s.bodies.A.room).toBe('archive');
    expectBodiesPlaced(s);
    run(s, 12);
    expectBodiesPlaced(s);
  });
});

describe('a day', () => {
  it('runs four watches and lands back on the first', () => {
    const s = genesisState();
    const day = s.day;
    advanceDay(s);
    expect(s.day).toBe(day + 1);
    expect(s.watch).toBe(1);
  });

  it('produces a record of things that happened', () => {
    const s = genesisState();
    advanceDay(s);
    expect(s.record.length).toBeGreaterThan(3);
    for (const e of s.record) {
      expect(e.text.length).toBeGreaterThan(8);
      expect(ROOM_BY_ID[e.room]).toBeDefined();
      expect(e.minute).toBeGreaterThanOrEqual(0);
      expect(e.minute).toBeLessThan(24 * 60);
    }
  });

  it('reads in order, so a day reads as a day', () => {
    const s = genesisState();
    advanceDay(s);
    const byWatch = s.record.map((e) => e.watch);
    expect([...byWatch].sort((a, b) => a - b)).toEqual(byWatch);
  });

  it('can be advanced by the scheduler one watch at a time without changing it', () => {
    const scheduled = genesisState(9);
    const batched = genesisState(9);
    const day = scheduled.day;
    const output = scheduled.reactor.output;

    for (let watch = 1; watch <= 3; watch += 1) advanceScheduledWatch(scheduled);
    expect(scheduled.day).toBe(day);
    expect(scheduled.watch).toBe(4);
    expect(scheduled.reactor.output).toBe(output);

    advanceScheduledWatch(scheduled);
    advanceDay(batched);
    expect(scheduled.day).toBe(day + 1);
    expect(scheduled.watch).toBe(1);
    expect(scheduled).toEqual(batched);
  });

  it('leaves the lower-level watch primitive unchanged after watch IV', () => {
    const s = genesisState();
    const day = s.day;
    const output = s.reactor.output;
    for (let watch = 1; watch <= 4; watch += 1) advanceWatch(s);
    expect(s.day).toBe(day);
    expect(s.watch).toBe(5);
    expect(s.reactor.output).toBe(output);
  });
});

describe('a month', () => {
  const { state, log } = run(genesisState(), 30);

  it('is deterministic, so the world can be replayed and debugged', () => {
    const again = run(genesisState(), 30);
    expect(again.log.map((e) => `${e.day}:${e.minute}:${e.text}`))
      .toEqual(log.map((e) => `${e.day}:${e.minute}:${e.text}`));
  });

  it('keeps everybody alive and nobody in a state nothing can reach', () => {
    for (const r of RESIDENTS) {
      const b = state.bodies[r.id];
      for (const key of CONDITIONS) {
        expect(b.condition[key], `${r.id} ${key}`).toBeGreaterThanOrEqual(0);
        expect(b.condition[key], `${r.id} ${key}`).toBeLessThanOrEqual(100);
      }
      expect(b.condition.fed, `${r.id} fed`).toBeGreaterThan(10);
    }
  });

  it('keeps every axis in range through thirty days of pushing them about', () => {
    for (const a of RESIDENTS) {
      for (const b of RESIDENTS) {
        if (a.id === b.id) continue;
        const set = held(state, a.id, b.id);
        for (const axis of AXES) {
          expect(set[axis], `${a.id}${b.id} ${axis}`).toBeGreaterThanOrEqual(0);
          expect(set[axis], `${a.id}${b.id} ${axis}`).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('runs the reactor down and never back up', () => {
    let last = 1;
    const s = genesisState();
    for (let i = 0; i < 30; i += 1) {
      advanceDay(s);
      expect(s.reactor.output).toBeLessThan(last);
      last = s.reactor.output;
    }
  });

  it('lets nobody hoard their way out, because charge leaks', () => {
    const s = genesisState();
    const idle = 'S';
    s.bodies[idle].cells = 400;
    for (let i = 0; i < 30; i += 1) advanceDay(s);
    expect(s.bodies[idle].cells).toBeLessThan(400);
  });

  it('moves the weave because of what actually happened', () => {
    const before = genesisState();
    const pairs = RESIDENTS.flatMap((a) => RESIDENTS
      .filter((b) => b.id !== a.id)
      .map((b) => [a.id, b.id] as const));
    const moved = pairs.filter(([a, b]) => {
      const then = held(before, a, b);
      const now = held(state, a, b);
      return AXES.some((axis) => Math.abs(then[axis] - now[axis]) > 2);
    });
    expect(moved.length).toBeGreaterThan(20);
  });

  it('writes a record somebody would read', () => {
    const meetings = log.filter((e) => e.kind === 'meeting');
    expect(meetings.length).toBeGreaterThan(20);
    expect(new Set(meetings.map((e) => e.text)).size).toBeGreaterThan(8);
  });
});

describe('the seam where cognition goes', () => {
  it('decodes a proposal while keeping the actor outside the model payload', () => {
    expect(decodeIntentFor('A', { verb: 'speak', target: 'B' })).toEqual({
      ok: true,
      intent: { verb: 'speak', actor: 'A', target: 'B' },
    });
  });

  it('rejects malformed identifiers and any attempt by the payload to choose an actor', () => {
    const rejected = [
      decodeIntentFor('Z', { verb: 'rest' }),
      decodeIntentFor('A', []),
      decodeIntentFor('A', { verb: 'invent' }),
      decodeIntentFor('A', { verb: 'go', room: 'moon' }),
      decodeIntentFor('A', { verb: 'speak', target: 'Z' }),
      decodeIntentFor('A', { verb: 'rest', actor: 'B' }),
    ];
    for (const result of rejected) expect(result.ok).toBe(false);
  });

  it('returns an intent that names a verb and, when social, somebody', () => {
    const s = genesisState();
    const roll = () => 0.5;
    for (const r of RESIDENTS) {
      const intent = choose(s, r.id, roll);
      expect(intent.actor).toBe(r.id);
      expect(typeof intent.verb).toBe('string');
    }
  });

  it('spends at most one thought in a watch and uses its intent', () => {
    const s = genesisState();
    for (const resident of RESIDENTS) s.bodies[resident.id].thoughtOn = 0;
    const decoded = decodeIntentFor('A', { verb: 'sleep' });
    if (!decoded.ok) throw new Error(decoded.error);

    advanceWatch(s, decoded.intent);

    expect(s.bodies.A.doing).toBe('asleep');
    expect(s.bodies.A.thoughtOn).toBe(s.day);
    expect(RESIDENTS.filter((resident) => (
      s.bodies[resident.id].thoughtOn === s.day
    )).map((resident) => resident.id)).toEqual(['A']);
  });

  it('still spends the thought when the world refuses the proposed intent', () => {
    const s = genesisState();
    s.bodies.A.thoughtOn = 0;
    s.bodies.V.condition.rested = 0;
    const decoded = decodeIntentFor('A', { verb: 'speak', target: 'V' });
    if (!decoded.ok) throw new Error(decoded.error);

    advanceWatch(s, decoded.intent);

    expect(s.bodies.A.doing).toBe('at a loose end');
    expect(s.bodies.A.thoughtOn).toBe(s.day);
    expect(s.bodies.A.room).toBe('records');
  });

  it('replays the same external intent deterministically', () => {
    const first = genesisState(23);
    const again = genesisState(23);
    const decoded = decodeIntentFor('Q', { verb: 'rest' });
    if (!decoded.ok) throw new Error(decoded.error);
    advanceWatch(first, decoded.intent);
    advanceWatch(again, decoded.intent);
    expect(first).toEqual(again);
  });

  it('refuses an intent the world does not allow, rather than obeying it', () => {
    const s = genesisState();
    // A resident cannot force a hungry counterpart to participate.
    s.bodies.A.room = 'bridge';
    s.bodies.V.room = 'garden';
    s.bodies.V.condition.fed = 0;
    const out = attempt(s, { verb: 'speak', actor: 'A', target: 'V' });
    expect(out.ok).toBe(false);
    expect(out.refused).toBe('recipient needs food');
  });

  it('refuses an uninhabitable destination', () => {
    const s = genesisState();
    s.bodies.A.room = 'bridge';
    const out = attempt(s, { verb: 'go', actor: 'A', room: 'breach' as RoomId });
    expect(out.ok).toBe(false);
    expect(out.refused).toBe('no air, and the suits are logged out');
  });

  it('refuses to let somebody confide in a person they barely know', () => {
    const s = genesisState();
    s.bodies.C.room = 'common';
    s.bodies.O.room = 'common';
    const out = attempt(s, { verb: 'confide', actor: 'C', target: 'O' });
    expect(out.ok).toBe(false);
    expect(out.refused).toBe('not that close');
  });

  it('uses slower manual repair without cells and consumes charge when available', () => {
    const s = genesisState();
    s.bodies.Q.cells = 0;
    expect(attempt(s, { verb: 'repair', actor: 'Q' }).ok).toBe(true);
    expect(s.bodies.Q.cells).toBe(0);
    s.bodies.Q.cells = 5;
    expect(attempt(s, { verb: 'repair', actor: 'Q' }).ok).toBe(true);
    expect(s.bodies.Q.cells).toBe(3);
  });
});

describe('the way out', () => {
  it('hands the view a snapshot it already knows how to read', () => {
    const s = genesisState();
    run(s, 5);
    const snap = snapshotFrom(s);
    expect(snap.people).toHaveLength(25);
    expect(snap.rooms).toHaveLength(48);
    expect(snap.day).toBe(105);
    for (const room of snap.rooms) {
      const here = snap.people.filter((p) => p.room === room.id).map((p) => p.id);
      expect([...room.occupants].sort()).toEqual(here.sort());
    }
    for (const e of snap.record) {
      expect(e.minute).toBeGreaterThanOrEqual(0);
      expect(e.text.length).toBeGreaterThan(8);
    }
  });

  it('spreads the habitat out over a day instead of piling it into one room', () => {
    const s = genesisState();
    run(s, 12);
    const seen = new Set<string>();
    for (let w = 0; w < 4; w += 1) {
      for (const p of snapshotFrom(s).people) seen.add(p.room);
      advanceWatch(s);
    }
    // A watch is six hours and a doorway is a few steps. If walking costs a
    // whole shift the place collapses into a commute and everybody ends up in
    // the same three rooms.
    expect(seen.size).toBeGreaterThan(9);
  });

  it('writes a day worth reading: enough happening, in enough places', () => {
    const { log } = run(genesisState(), 30);
    expect(Math.round(log.length / 30)).toBeGreaterThan(12);
    expect(new Set(log.map((e) => e.room)).size).toBeGreaterThan(9);
  });
});

describe('logical room presence', () => {
  it('reaches a distant room within a watch without a corridor pixel dependency', () => {
    const state = genesisState();
    const before = state.bodies.A.condition.rested;
    expect(attempt(state, { verb: 'go', actor: 'A', room: 'garden' }).ok).toBe(true);
    expect(state.bodies.A.room).toBe('garden');
    expect(state.bodies.A.condition.rested).toBeCloseTo(before - 0.2);
    const { at } = state.bodies.A;
    expect(isWalkable(ROOM_BY_ID.garden.grid, ROOM_BY_ID.garden.legend, at.x, at.y)).toBe(true);
  });
  it('keeps every anchor walkable while permitting a population larger than the artwork grid', () => {
    const state = genesisState();
    for (const { id } of RESIDENTS) {
      if (state.bodies[id].room !== 'garden') expect(attempt(state, { actor: id, verb: 'go', room: 'garden' }).ok).toBe(true);
    }
    expect(snapshotFrom(state).rooms.find((room) => room.id === 'garden')?.occupants).toHaveLength(25);
    for (const body of Object.values(state.bodies)) expect(isWalkable(ROOM_BY_ID.garden.grid, ROOM_BY_ID.garden.legend, body.at.x, body.at.y)).toBe(true);
  });
  it('preserves access restrictions such as the uninhabitable breach', () => {
    const state = genesisState();
    expect(attempt(state, { actor: 'A', verb: 'go', room: 'breach' }).ok).toBe(false);
  });
});
