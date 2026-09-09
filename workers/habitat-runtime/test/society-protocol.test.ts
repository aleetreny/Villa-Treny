import { describe, expect, it } from 'vitest';
import { createSocietyState, prepareSocietyTurn, toOrderedChoice } from '../../../src/lib/habitat/society/index';
import { createGenesisWorld } from '../src/domain';
import { applySocietyProtocol } from '../src/society-protocol';

describe('saved society contract versions', () => {
  const fixture = () => {
    const world = createGenesisWorld(), state = createSocietyState(world, 1000);
    const turn = prepareSocietyTurn(state, world, 'A', { nowMs: 2000, generation: 0, sequence: 1 });
    const output = { project: { mode: 'replace', goal: 'Look around the Common.', why: 'I have time to look.',
      visibility: 'private', steps: [{ verb: 'observe', at: 'common' }] },
      message: { to: 'B', text: 'Can we discuss the shared stores?', close: true } };
    return { world, state, turn, output, control: { nowMs: 2001, generation: 0 } };
  };

  it.each([1, 2])('retains the older observe plan for an outstanding version %i job', (version) => {
    const f = fixture();
    const result = applySocietyProtocol(version, f.state, f.world, f.turn, f.output, f.control);
    expect(result.ok).toBe(true);
    expect(result.state.minds.A.project?.steps[0]?.intent.verb).toBe('observe');
    expect(result.world).toEqual(f.world);
  });

  it('rejects an obsolete noop in a new job and applies a named visit as its canonical action', () => {
    const f = fixture();
    const rejected = applySocietyProtocol(3, f.state, f.world, f.turn, f.output, f.control);
    expect(rejected.ok).toBe(false);
    expect(rejected.state).toBe(f.state);
    f.output.project.steps = [{ verb: 'walk_room_and_log_visit', at: 'common' }];
    const result = applySocietyProtocol(3, f.state, f.world, f.turn, f.output, f.control);
    expect(result.ok).toBe(true);
    expect(result.state.minds.A.project?.steps[0]?.intent.verb).toBe('inspect');
    expect(result.world).toEqual(f.world);
  });

  it('does not reinterpret an unknown future grammar as the oldest permissive protocol', () => {
    const f = fixture();
    const result = applySocietyProtocol(999, f.state, f.world, f.turn, f.output, f.control);
    expect(result).toEqual({ ok: false, code: 'unsupported_society_contract', state: f.state, world: f.world });
    expect(result.world).toBe(f.world);
  });

  it('binds opening-proposal authority to version 4 while preserving outstanding version 2/3 jobs', () => {
    const f = fixture();
    const opening = { project: { ...f.output.project, steps: [] },
      message: { to: 'B', text: 'May I lend you two cells?', close: false },
      deal: { kind: 'loan', direction: 'lend', cells: 2, dueInDays: 2 } };
    for (const version of [2, 3]) {
      const rejected = applySocietyProtocol(version, f.state, f.world, f.turn, opening, f.control);
      expect(rejected.ok).toBe(false); expect(rejected.state).toBe(f.state); expect(rejected.world).toBe(f.world);
    }
    const result = applySocietyProtocol(4, f.state, f.world, f.turn, opening, f.control);
    expect(result.code).toBe('applied'); expect(result.world).toEqual(f.world);
    expect(result.state.offers[0]).toMatchObject({ proposer: 'A', counterpart: 'B', status: 'open',
      terms: { kind: 'loan', from: 'A', to: 'B', cells: 2, dueDay: f.world.day + 2 } });
    const duplicate = applySocietyProtocol(4, result.state, result.world, f.turn, opening, { nowMs: 2002, generation: 0 });
    expect(duplicate.code).toBe('already_applied'); expect(duplicate.state).toBe(result.state); expect(duplicate.world).toBe(result.world);
  });

  it('dispatches the new tuple only for version5 and leaves saved version4 responses unchanged', () => {
    const f = fixture();
    const proposal = { project: { ...f.output.project, steps: [] },
      message: { to: 'B', text: 'May I lend you two cells?' },
      deal: { kind: 'loan', direction: 'lend', cells: 2, dueInDays: 2 } };
    const converted = toOrderedChoice(proposal);
    if (!converted.ok) throw new Error(converted.code);
    const expected = applySocietyProtocol(4, f.state, f.world, f.turn, proposal, f.control);
    expect(expected.ok).toBe(true);
    expect(applySocietyProtocol(5, f.state, f.world, f.turn, converted.value, f.control)).toEqual(expected);
    expect(applySocietyProtocol(4, f.state, f.world, f.turn, converted.value, f.control).ok).toBe(false);
    expect(applySocietyProtocol(5, f.state, f.world, f.turn, proposal, f.control).ok).toBe(false);
    const duplicate = applySocietyProtocol(5, expected.state, expected.world, f.turn, converted.value, f.control);
    expect(duplicate.code).toBe('already_applied'); expect(duplicate.state).toBe(expected.state);
  });
});
