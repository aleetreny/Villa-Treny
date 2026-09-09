import { describe, expect, it } from 'vitest';
import { RESIDENTS } from '../residents';
import { ROOM_BY_ID } from '../rooms';
import { CONDITIONS, genesisState } from '../engine/state';
import { advanceScheduledWatch } from '../engine/tick';
import { createSocietyState, observeSocietyActions, parseSocietyState, type PhysicalObservation, type PlannedAction } from './index';

function healthyWorld() {
  const s = genesisState(91);
  for (const { id } of RESIDENTS) for (const k of CONDITIONS) s.bodies[id].condition[k] = 90;
  return s;
}
const plansFor = (verb: 'observe' | 'inspect') => Object.fromEntries(RESIDENTS.map(({ id }) => [id,
  { stepId: `test:${id}`, intent: { actor: id, verb }, at: 'common' }])) as Partial<Record<(typeof RESIDENTS)[number]['id'], PlannedAction>>;

describe('persistent plans at the existing physical watch boundary', () => {
  it('executes all 25 plans once, records all actors and consumes one work action each', () => {
    const world = healthyWorld(), society = createSocietyState(world, 1000), observations: PhysicalObservation[] = [];
    advanceScheduledWatch(world, undefined, undefined, undefined, { plans: plansFor('inspect'), onAction: (o) => observations.push(o) });
    expect(observations).toHaveLength(25); expect(new Set(observations.map((o) => o.actor)).size).toBe(25);
    for (const { id } of RESIDENTS) {
      expect(observations.find((o) => o.actor === id)).toMatchObject({ day: 100, watch: 1, intent: { actor: id, verb: 'inspect' }, actualRoom: 'common', outcome: { ok: true } });
      expect(world.economy.workCredits[id]).toBe(1);
    }
    expect(world.day).toBe(100); expect(world.watch).toBe(2);
    const observed = observeSocietyActions(society, world, observations, { nowMs: 2000 });
    expect(RESIDENTS.every(({ id }) => observed.state.minds[id].lastPhysicalWatch === 400)).toBe(true);
    expect(parseSocietyState(observed.state).ok).toBe(true);
  });
  it('crosses a connected multi-room route before work without spending a watch per opening', () => {
    const world = healthyWorld(), observations: PhysicalObservation[] = [], plans = plansFor('observe');
    world.bodies.V.room = 'bridge';
    expect(ROOM_BY_ID.bridge.connects).not.toContain('garden');
    plans.V = { stepId: 'test:V', intent: { actor: 'V', verb: 'grow' }, at: 'garden' };
    const before = { ...world.economy.stock };
    advanceScheduledWatch(world, undefined, undefined, undefined, { plans, onAction: (o) => observations.push(o) });
    expect(observations.find((o) => o.actor === 'V')).toMatchObject({ intent: { verb: 'grow' }, actualRoom: 'garden', outcome: { ok: true } });
    expect(world.economy.stock.produce - before.produce).toBe(16);
    expect(before.water - world.economy.stock.water).toBe(2);
    expect(world.economy.workCredits.V).toBe(2);
    expect(world.watch).toBe(2);
  });
  it('interrupts a plan for critical hunger, records the cause, and does not also perform the planned work', () => {
    const world = healthyWorld(), plans = plansFor('observe'), observations: PhysicalObservation[] = [];
    plans.V = { stepId: 'test:V', intent: { actor: 'V', verb: 'grow' }, at: 'garden' };
    world.bodies.V.condition.fed = 10;
    const beforeProduce = world.economy.stock.produce;
    advanceScheduledWatch(world, undefined, undefined, undefined, { plans, onAction: (o) => observations.push(o) });
    const v = observations.find((o) => o.actor === 'V')!;
    expect(v.interrupted).toContain('hunger'); expect(v.stepId).toBe('test:V'); expect(v.intent.verb).toBe('eat');
    expect(world.economy.workCredits.V).toBe(0); expect(world.economy.stock.produce).toBe(beforeProduce);
    expect(world.record.some((h) => h.who.includes('V') && h.text.includes('interrupted'))).toBe(true);
  });
  it('records routine outcomes too and preserves the original four-argument behavior', () => {
    const old = genesisState(82), compatible = genesisState(82), observed = genesisState(82), observations: PhysicalObservation[] = [];
    advanceScheduledWatch(old);
    advanceScheduledWatch(compatible, undefined, undefined, undefined);
    expect(compatible).toEqual(old);
    advanceScheduledWatch(observed, undefined, undefined, undefined, { plans: {}, onAction: (o) => observations.push(o) });
    expect(observations).toHaveLength(25);
    expect(observations.every((o) => o.stepId === undefined)).toBe(true);
    expect(observations.every((o) => !['give', 'lend', 'trade', 'speak', 'ask', 'confide', 'teach', 'joke'].includes(o.intent.verb))).toBe(true);
  });
  it('does not let fallback routines accept a loan or gift for a needy counterpart', () => {
    const world = healthyWorld(), observations: PhysicalObservation[] = [];
    world.bodies.B.cells = 0;
    for (const { id } of RESIDENTS) if (id !== 'B') {
      world.bodies[id].cells = 15;
      world.axes.get(`${id}B`)!.affection = 80; world.axes.get(`${id}B`)!.trust = 80;
    }
    advanceScheduledWatch(world, undefined, undefined, undefined, { plans: {}, onAction: (o) => observations.push(o) });
    expect(world.economy.debts).toHaveLength(0);
    expect(world.bodies.B.cells).toBe(0);
    expect(observations.some((o) => ['give', 'lend'].includes(o.intent.verb))).toBe(false);
  });
  it('keeps pre-advance timestamps at day close and does not fabricate a destination', () => {
    const world = healthyWorld(), plans = plansFor('observe'), observations: PhysicalObservation[] = [];
    world.watch = 4;
    plans.A = { stepId: 'test:A', intent: { actor: 'A', verb: 'inspect' }, at: 'breach' };
    advanceScheduledWatch(world, undefined, undefined, undefined, { plans, onAction: (o) => observations.push(o) });
    expect(observations.every((o) => o.day === 100 && o.watch === 4)).toBe(true);
    expect(observations.find((o) => o.actor === 'A')!.outcome.ok).toBe(false);
    expect(world.bodies.A.room).not.toBe('breach'); expect(world.day).toBe(101); expect(world.watch).toBe(1);
  });
  it('rejects a mismatched actor before any physical mutation', () => {
    const world = healthyWorld(), original = structuredClone(world);
    expect(() => advanceScheduledWatch(world, undefined, undefined, undefined, { plans: {
      A: { stepId: 'test:A', intent: { actor: 'B', verb: 'work' }, at: null },
    } })).toThrow('Invalid planned actor');
    expect(world).toEqual(original);
  });
});
