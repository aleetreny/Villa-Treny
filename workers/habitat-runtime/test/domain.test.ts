import { describe, expect, it } from 'vitest';
import { isWalkable } from '../../../src/lib/habitat/grid';
import { ROOM_BY_ID } from '../../../src/lib/habitat/rooms';
import { RESIDENTS, type ResidentId } from '../../../src/lib/habitat/residents';
import { initialKnowledge, knowledgeFor } from '../../../src/lib/habitat/engine/knowledge';
import { LATENT } from '../../../src/lib/habitat/weave';
import { legacyWorld } from './legacy-fixture';
import {
  advanceWorldWatch,
  createGenesisWorld,
  decodeCognition,
  deserializeWorldState,
  prepareCognition,
  serializeWorldState,
  selectCognitionSubject,
  worldSnapshot,
} from '../src/domain';

describe('canonical world adapter', () => {
  it('carries personal history and shared bonds, keeping every latent fact with its actual knower', () => {
    const contextFor = (id: ResidentId) => {
      const state = createGenesisWorld();
      state.bodies[id].lastAttemptWatch = 0;
      const prepared = prepareCognition({ state, worldRevision: 0, habitatId: 'test', runId: 'test', createdAtMs: 1, controlRevision: 1 });
      expect(prepared.actor).toBe(id);
      return JSON.parse(prepared.job.prompt.user);
    };
    expect(contextFor('U').knownBonds).toContainEqual(expect.objectContaining({ other: 'O', history: expect.stringContaining('Half-siblings') }));
    for (const resident of RESIDENTS) {
      const context = contextFor(resident.id);
      if (context.resident.before) expect(resident.before).toContain(context.resident.before);
      expect(context.resident).not.toHaveProperty('boarding');
      expect(context.privateKnowledge.map((fact: { id: string }) => fact.id)).toEqual(initialKnowledge(resident.id).map((fact) => fact.id));
      for (const fact of context.privateKnowledge) expect(knowledgeFor(initialKnowledge(resident.id)).some((known) => known.id === fact.id && known.text.startsWith(fact.text))).toBe(true);
      for (const bond of LATENT) expect(JSON.stringify(context)).not.toContain(bond.route);
    }
  });

  it('introduces material accounting into a version-2 world once, preserving every prior fact', () => {
    const previous = JSON.parse(serializeWorldState(createGenesisWorld()));
    previous.day = 106;
    previous.watch = 3;
    previous.bodies.A.cells = 27.321;
    delete previous.economy;
    for (const body of Object.values(previous.bodies) as Array<Record<string, unknown>>) {
      delete body.memory;
      delete body.lastThoughtWatch;
      for (const key of ['lastAttemptWatch', 'lastInteractionWatch', 'knownFacts', 'plan']) delete body[key];
    }
    const encoded = JSON.stringify(previous);
    const migrated = deserializeWorldState(encoded);
    expect(migrated.economy.startedOnDay).toBe(106);
    expect(migrated.economy.ledger.initialCells).toBe(Object.values(migrated.bodies).reduce((sum, body) => sum + body.cells, 0));
    expect(migrated.economy.ledger.minted).toBe(0);
    expect(migrated.economy.debts).toEqual([]);
    expect(migrated.bodies.A.cells).toBe(27.321);
    for (const [id, old] of Object.entries(previous.bodies)) {
      const { memory, lastThoughtWatch, lastAttemptWatch: _attempt, lastInteractionWatch: _interaction, knownFacts: _facts, plan: _plan, ...preserved } = migrated.bodies[id as keyof typeof migrated.bodies];
      expect(preserved).toEqual(old);
      expect(_attempt).toEqual(expect.any(Number));
      expect(_interaction).toBe(0);
      expect(_facts).toEqual(expect.any(Array));
      expect(_plan).toBeNull();
      expect(memory).toEqual([]);
      expect(lastThoughtWatch).toBe(preserved.thoughtOn * 4);
    }
    expect(migrated.record).toEqual(previous.record);
    expect([...migrated.axes]).toEqual(previous.axes);
    expect(deserializeWorldState(serializeWorldState(migrated))).toEqual(migrated);
    const corrupt = JSON.parse(serializeWorldState(migrated));
    corrupt.bodies.A.cells += 1;
    expect(() => deserializeWorldState(JSON.stringify(corrupt))).toThrow('charge cells do not balance');
  });

  it.each([1, 7, 23])('gives all 25 residents access to the single thought through 90 days, seed %s', (seed) => {
    const state = createGenesisWorld();
    state.seed = seed;
    const latest = new Map<string, number>();
    for (let watch = 0; watch < 360; watch += 1) {
      const actor = selectCognitionSubject(state);
      const previous = latest.get(actor);
      if (previous !== undefined) expect(watch - previous).toBeLessThanOrEqual(38);
      latest.set(actor, watch);
      advanceWorldWatch(state, { actor, verb: 'observe' });
      if (watch === 37) expect(latest.size).toBe(25);
    }
    expect(latest.size).toBe(25);
    expect(Math.min(...latest.values())).toBeGreaterThanOrEqual(322);
  });

  it('feeds current resources, valid options, relevant history and remembered refusals to cognition', () => {
    const state = createGenesisWorld();
    state.bodies.A.lastAttemptWatch = 0;
    state.bodies.A.memory = [{ day: 100, watch: 1, kind: 'cook', outcome: 'not enough produce to cook' }];
    const prepared = prepareCognition({ state, worldRevision: 0, habitatId: 'test', runId: 'test', createdAtMs: 1, controlRevision: 1,
      recentHistory: [{ day: 99, watch: 4, minute: 1300, room: 'common', who: ['B', 'C'], text: 'Other people spoke.', kind: 'meeting' }],
    });
    const prompt = JSON.parse(prepared.job.prompt.user);
    expect(prompt.economy.stock).toEqual(state.economy.stock);
    expect(prompt.economy.sinceDay).toBe(100);
    expect(prompt.memory).toEqual(state.bodies.A.memory);
    expect(prompt.possibleActions.some((action: { verb: string }) => action.verb === 'work')).toBe(true);
    expect(prompt.possibleActions.some((action: { verb: string }) => action.verb === 'cook')).toBe(false);
    expect(prompt.recentHistory).toEqual([]);
  });

  it('round-trips all twenty-five bodies and six hundred directed relationships', () => {
    const restored = deserializeWorldState(serializeWorldState(createGenesisWorld()));
    expect(Object.keys(restored.bodies)).toHaveLength(25);
    expect(restored.axes.size).toBe(25 * 24);
    expect(serializeWorldState(restored)).toBe(serializeWorldState(createGenesisWorld()));
  });

  it('projects walkable, non-overlapping positions', () => {
    const snapshot = worldSnapshot(createGenesisWorld());
    const occupied = new Set<string>();
    for (const person of snapshot.people) {
      const room = ROOM_BY_ID[person.room];
      expect(isWalkable(room.grid, room.legend, person.at.x, person.at.y)).toBe(true);
      const key = `${person.room}:${person.at.x}:${person.at.y}`;
      expect(occupied.has(key)).toBe(false);
      occupied.add(key);
    }
  });

  it('builds one bounded cognition request and fixes the actor outside model output', () => {
    const state = createGenesisWorld();
    const prepared = prepareCognition({
      state,
      worldRevision: 0,
      habitatId: 'habitat-canonical',
      runId: 'habitat-canonical:world:0:watch',
      createdAtMs: 1_788_225_600_000,
      controlRevision: 1,
    });
    expect(prepared.job.subjects).toEqual([{ kind: 'resident', id: prepared.actor }]);
    expect(prepared.job.maxOutputTokens).toBe(384);

    const intent = decodeCognition(prepared.actor, {
      verb: 'rest',
      room: null,
      target: null,
    });
    expect(intent).toEqual({ actor: prepared.actor, verb: 'rest' });
    expect(decodeCognition(prepared.actor, {
      actor: 'Y', verb: 'rest', room: null, target: null,
    })).toBeUndefined();

    const beforeDay = state.day;
    const beforeWatch = state.watch;
    advanceWorldWatch(state, intent);
    expect(state.day).toBe(beforeDay);
    expect(state.watch).toBe(beforeWatch + 1);
    expect(state.bodies[prepared.actor].thoughtOn).toBe(beforeDay);
  });

  it('migrates the inhabited sixteen-room world without resetting anybody or their history', () => {
    const legacy = legacyWorld();
    const migrated = deserializeWorldState(JSON.stringify(legacy));
    expect(migrated).toMatchObject({ day: 106, watch: 3 });
    expect(Object.keys(migrated.rooms)).toHaveLength(48);
    expect(migrated.bodies.A).toMatchObject({ room: 'records', cells: 19 });
    expect(migrated.bodies.J.room).toBe('workshops');
    expect(migrated.bodies.V.room).toBe('garden');
    expect(migrated.bodies.D.room).toBe('cabin1');
    expect(migrated.bodies.Y.room).toBe('dig6');
    for (const [id, previous] of Object.entries(legacy.bodies)) {
      const current = migrated.bodies[id as keyof typeof migrated.bodies];
      const { memory, lastThoughtWatch, lastAttemptWatch: _attempt, lastInteractionWatch: _interaction, knownFacts: _facts, plan: _plan, ...preserved } = current;
      expect(_attempt).toEqual(expect.any(Number));
      expect(_interaction).toBe(0);
      expect(_facts).toEqual(expect.any(Array));
      expect(_plan).toBeNull();
      expect(memory).toEqual([]);
      expect(lastThoughtWatch).toBe(current.thoughtOn * 4);
      expect({ ...preserved, room: previous.room, at: previous.at }).toEqual(previous);
    }
    expect([...migrated.axes]).toEqual(legacy.axes);
    expect(migrated.record).toEqual([{ ...legacy.record[0], room: 'garden' }]);
    const occupied = new Set<string>();
    for (const person of worldSnapshot(migrated).people) {
      const room = ROOM_BY_ID[person.room];
      expect(isWalkable(room.grid, room.legend, person.at.x, person.at.y)).toBe(true);
      const cell = `${person.room}:${person.at.x}:${person.at.y}`;
      expect(occupied.has(cell)).toBe(false);
      occupied.add(cell);
    }
    expect(deserializeWorldState(serializeWorldState(migrated))).toEqual(migrated);
  });

  it('rejects corrupt legacy data instead of inventing missing lives or relationships', () => {
    const missing = legacyWorld();
    delete missing.bodies.A;
    expect(() => deserializeWorldState(JSON.stringify(missing))).toThrow();
    const broken = legacyWorld();
    broken.axes[0] = broken.axes[1]!;
    expect(() => deserializeWorldState(JSON.stringify(broken))).toThrow();
    const unknown = legacyWorld();
    unknown.bodies.A!.room = 'made-up';
    expect(() => deserializeWorldState(JSON.stringify(unknown))).toThrow();
  });

  it('places recent immutable history in working memory without changing the output authority', () => {
    const state = createGenesisWorld();
    state.bodies.A.lastAttemptWatch = 0;
    const prepared = prepareCognition({
      state,
      worldRevision: 7,
      habitatId: 'habitat-canonical',
      runId: 'habitat-canonical:world:7:watch',
      createdAtMs: 1_788_225_600_000,
      controlRevision: 2,
      recentHistory: [{
        day: 99,
        watch: 4,
        minute: 1_390,
        room: 'common',
        who: ['A', 'E'],
        text: 'A promise was recorded and left unresolved.',
        kind: 'meeting',
      }],
    });
    const prompt = JSON.parse(prepared.job.prompt.user) as {
      recentHistory: Array<Record<string, unknown>>;
    };
    expect(prompt.recentHistory).toEqual([{
      day: 99,
      watch: 4,
      minute: 1_390,
      room: 'common',
      people: ['A', 'E'],
      text: 'A promise was recorded and left unresolved.',
      kind: 'meeting',
    }]);
    expect(prepared.job.outputContract.jsonSchema).toMatchObject({
      required: ['verb', 'room', 'target', 'fact'],
      additionalProperties: false,
    });
  });
});
