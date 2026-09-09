import { describe, expect, it, vi } from 'vitest';
import { genesisState } from './state';
import { advanceScheduledWatch } from './tick';
import type { PhysicalObservation } from '../society/types';

describe('authored publication uses one physical slot', () => {
  it('replaces the author action without completing their other work or firing a routine', () => {
    const world = genesisState(), observations: PhysicalObservation[] = [];
    world.bodies.A.condition = { rested: 90, fed: 90, well: 90, safe: 90, accompanied: 90 };
    const originalRoom = world.bodies.A.room;
    const publishRecord = vi.fn(() => ({ ok: true, happening: {
      day: world.day, watch: world.watch, minute: 0, room: world.bodies.A.room,
      who: ['A'] as ['A'], kind: 'note' as const, text: 'Ama published an attributed record.' } }));
    advanceScheduledWatch(world, undefined, undefined, undefined, {
      plans: { A: { stepId: 'step:unrelated', intent: { actor: 'A', verb: 'grow' }, at: 'garden' } },
      publications: { A: { intentId: 'record:intent:1' } }, publishRecord,
      onAction: (observation) => observations.push(observation),
    });
    expect(publishRecord).toHaveBeenCalledTimes(1);
    expect(observations).toHaveLength(24);
    expect(new Set(observations.map((o) => o.actor)).size).toBe(24);
    expect(observations.some((o) => o.actor === 'A')).toBe(false);
    expect(world.bodies.A.room).toBe(originalRoom);
    expect(world.economy.events.filter((event) => event.actor === 'A')).toEqual([]);
    expect(world.bodies.A.condition.rested).toBe(85);
    expect(world.record.filter((entry) => entry.text === 'Ama published an attributed record.')).toHaveLength(1);
  });

  it('lets exhaustion interrupt publication without consuming a second action', () => {
    const world = genesisState(), observations: PhysicalObservation[] = [];
    world.bodies.A.condition.fed = 90; world.bodies.A.condition.rested = 0;
    const publishRecord = vi.fn(() => ({ ok: true }));
    advanceScheduledWatch(world, undefined, undefined, undefined, { plans: {},
      publications: { A: { intentId: 'record:intent:1' } }, publishRecord,
      onAction: (observation) => observations.push(observation) });
    expect(publishRecord).not.toHaveBeenCalled();
    expect(observations).toHaveLength(25);
    expect(observations.find((o) => o.actor === 'A')).toMatchObject({
      intent: { actor: 'A', verb: 'sleep' }, interrupted: 'Exhaustion requires sleep' });
    expect(world.bodies.A.condition.rested).toBeGreaterThan(0);
  });

  it('records a refused publication without replacing it with productive work', () => {
    const world = genesisState(), observed: PhysicalObservation[] = [];
    world.bodies.A.condition.rested = 90; world.bodies.A.condition.fed = 90;
    const publishRecord = vi.fn(() => ({ ok: false, refused: 'draft binding changed' }));
    advanceScheduledWatch(world, undefined, undefined, undefined, { plans: {},
      publications: { A: { intentId: 'record:intent:1' } }, publishRecord, onAction: (o) => observed.push(o) });
    expect(publishRecord).toHaveBeenCalledTimes(1);
    expect(observed.some((o) => o.actor === 'A')).toBe(false);
    expect(world.economy.events.filter((event) => event.actor === 'A')).toEqual([]);
    expect(world.record.some((entry) => entry.text.includes('draft binding changed'))).toBe(true);
  });
});
