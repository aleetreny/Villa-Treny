import { describe, expect, it } from 'vitest';
import { genesisState, held, placeInRoom } from './state';
import { advanceScheduledWatch } from './tick';
import { attempt, decodeIntentFor, canPropose } from './verbs';
import { createEconomy, economicAccounts, closeEconomyDay, totalCells } from './economy';
import { FACTS } from './knowledge';

describe('audited agency and scarcity boundaries', () => {
  it.each([0, 1, 2])('recovers food production with %s initial water without a population-capacity exception', (water) => {
    const state = genesisState();
    state.economy.stock = { produce: 0, meals: 0, water, materials: 0 };
    for (const body of Object.values(state.bodies)) body.condition.fed = 20;
    for (let watch = 0; watch < 28; watch++) advanceScheduledWatch(state);
    expect(Math.min(...Object.values(state.bodies).map((body) => body.condition.fed))).toBeGreaterThan(18);
    expect(state.economy.stock.water).toBeGreaterThan(0);
    expect(state.economy.stock.meals).toBeGreaterThan(0);
  });

  it('honours a deliberate visit and retains the commitment beyond its first watch', () => {
    const state = genesisState();
    state.watch = 1;
    advanceScheduledWatch(state, { actor: 'A', verb: 'go', room: 'library' });
    expect(state.bodies.A.room).toBe('library');
    expect(state.bodies.A.plan).toMatchObject({ room: 'library', untilWatch: 402 });
    state.bodies.A.condition.fed = 90;
    advanceScheduledWatch(state);
    expect(state.bodies.A.room).toBe('library');
  });

  it('resolves willing contact independently of the observer position and before incidental routines', () => {
    const state = genesisState();
    placeInRoom(state, 'A', 'records'); placeInRoom(state, 'V', 'garden');
    let accepted = false;
    advanceScheduledWatch(state, { actor: 'A', verb: 'speak', target: 'V' }, 'A', (outcome) => { accepted = outcome.ok; });
    expect(accepted).toBe(true);
    expect(state.record.some((event) => event.who.includes('A') && event.who.includes('V') && event.text.includes('spoke'))).toBe(true);
  });

  it('refuses extra protocol fields without writing a remote memory', () => {
    const state = genesisState(), before = structuredClone(state);
    expect(decodeIntentFor('V', { verb: 'grow', target: 'B' }).ok).toBe(false);
    expect(attempt(state, { actor: 'V', verb: 'grow', target: 'B' }).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('respects recipient needs and limits repeated service in a watch', () => {
    const state = genesisState();
    state.bodies.B.condition.rested = 0;
    const before = structuredClone(state);
    expect(attempt(state, { actor: 'A', verb: 'speak', target: 'B' }).refused).toBe('recipient needs sleep');
    expect(state).toEqual(before);
    state.bodies.B.condition.rested = 80;
    expect(attempt(state, { actor: 'A', verb: 'speak', target: 'B' }).ok).toBe(true);
    expect(attempt(state, { actor: 'C', verb: 'speak', target: 'B' }).refused).toContain('already committed');
    expect(attempt(state, { actor: 'B', verb: 'speak', target: 'C' }).refused).toContain('already committed');
  });

  it('shares a secret only when an authorized owner explicitly chooses that fact', () => {
    const state = genesisState();
    const secret = Object.entries(FACTS).find(([, fact]) => fact.owner === 'E')![0];
    held(state, 'E', 'B').trust = 80;
    expect(attempt(state, { actor: 'E', verb: 'confide', target: 'B' }).ok).toBe(true);
    expect(state.bodies.B.knownFacts.some((fact) => fact.id === secret)).toBe(false);
    state.watch = 2;
    expect(attempt(state, { actor: 'E', verb: 'confide', target: 'B', fact: secret }).ok).toBe(true);
    expect(state.bodies.B.knownFacts).toContainEqual({ id: secret, source: 'E', learnedDay: 100 });
    expect(state.bodies.C.knownFacts.some((fact) => fact.id === secret)).toBe(false);
    const before = structuredClone(state);
    expect(attempt(state, { actor: 'C', verb: 'confide', target: 'D', fact: secret }).ok).toBe(false);
    expect(state).toEqual(before);
    expect(attempt(state, { actor: 'E', verb: 'teach', target: 'D', fact: secret }).ok).toBe(false);
  });

  it('changes desire only through an explicit reciprocated approach, not automatic romance', () => {
    const state = genesisState(); held(state, 'A', 'B').desire = 35; held(state, 'B', 'A').desire = 0;
    const intent = { actor: 'A', verb: 'flirt', target: 'B' } as const;
    expect(canPropose(state, intent)).toBe(true);
    const before = structuredClone(state);
    expect(attempt(state, intent).ok).toBe(false); expect(state).toEqual(before);
    held(state, 'B', 'A').desire = 30;
    expect(attempt(state, intent).ok).toBe(true);
    expect(held(state, 'A', 'B').desire).toBe(37); expect(held(state, 'B', 'A').desire).toBe(32);
  });

  it('teaches a concrete public skill and retains it after routine memory is overwritten', () => {
    const state = genesisState();
    expect(attempt(state, { actor: 'V', verb: 'teach', target: 'A', fact: 'skill:grow' }).ok).toBe(true);
    for (let watch = 0; watch < 40; watch++) advanceScheduledWatch(state);
    expect(state.bodies.A.knownFacts).toContainEqual({ id: 'skill:grow', source: 'V', learnedDay: 100 });
  });

  it('allocates an emergency meal in kind without creating charge or bypassing stock', () => {
    const state = genesisState();
    state.bodies.A.cells = 0; state.bodies.A.condition.fed = 10; placeInRoom(state, 'A', 'common');
    state.economy = createEconomy(100, totalCells(state));
    const initial = totalCells(state), stock = { ...state.economy.stock };
    expect(attempt(state, { actor: 'A', verb: 'eat' }).ok).toBe(true);
    expect(totalCells(state)).toBe(initial);
    expect(state.bodies.A.condition.fed).toBe(56);
    expect(state.economy.stock).toMatchObject({ meals: stock.meals - 1, water: stock.water - 1 });
    expect(state.economy.ledger.minted).toBe(0);
    state.economy.stock.meals = 0; state.bodies.A.condition.fed = 10;
    expect(attempt(state, { actor: 'A', verb: 'eat' }).ok).toBe(false);
  });

  it('makes broken or unpowered equipment reduce actual yield while preserving manual essentials', () => {
    const state = genesisState();
    state.reactor.output = 0; state.economy.maintenance = 0;
    const before = { ...state.economy.stock };
    expect(attempt(state, { actor: 'V', verb: 'grow' }).ok).toBe(true);
    expect(state.economy.stock.produce - before.produce).toBe(8);
    expect(attempt(state, { actor: 'E', verb: 'cook' }).ok).toBe(true);
    expect(state.economy.stock.meals - before.meals).toBe(4);
    const water = state.economy.stock.water;
    expect(attempt(state, { actor: 'O', verb: 'clean' }).ok).toBe(true);
    expect(state.economy.stock.water - water).toBe(12);
    expect(attempt(state, { actor: 'F', verb: 'dig' }).ok).toBe(true);
    expect(state.economy.stock.materials - before.materials).toBe(2);
  });

  it('gives limited company only for actual shared work or meals, without fabricating a relationship', () => {
    const state = genesisState();
    placeInRoom(state, 'A', 'common'); placeInRoom(state, 'B', 'common'); placeInRoom(state, 'C', 'common');
    state.bodies.A.condition.accompanied = 20; state.bodies.B.condition.accompanied = 20;
    const axes = structuredClone(state.axes);
    expect(attempt(state, { actor: 'A', verb: 'eat' }).ok).toBe(true);
    expect(state.bodies.A.condition.accompanied).toBe(20);
    expect(attempt(state, { actor: 'B', verb: 'eat' }).ok).toBe(true);
    expect(state.bodies.A.condition.accompanied).toBe(30);
    expect(state.bodies.B.condition.accompanied).toBe(30);
    expect(attempt(state, { actor: 'C', verb: 'eat' }).ok).toBe(true);
    expect(state.bodies.A.condition.accompanied).toBe(30);
    expect(state.axes).toEqual(axes);
    expect(state.economy.events.filter((event) => event.companions)).toHaveLength(1);
  });

  it('reconstructs exact accounts from typed transaction deltas including wages and leakage', () => {
    const state = genesisState(), replay = economicAccounts(state);
    attempt(state, { actor: 'V', verb: 'grow' });
    attempt(state, { actor: 'E', verb: 'cook' });
    attempt(state, { actor: 'E', verb: 'eat' });
    attempt(state, { actor: 'J', verb: 'repair' });
    closeEconomyDay(state, 90);
    for (const event of state.economy.events) for (const { account, delta } of event.entries) replay[account]! += delta;
    for (const [account, value] of Object.entries(economicAccounts(state))) expect(replay[account], account).toBeCloseTo(value, 10);
    expect(state.economy.events.map((event) => event.sequence)).toEqual(state.economy.events.map((_, index) => index));
  });
});
