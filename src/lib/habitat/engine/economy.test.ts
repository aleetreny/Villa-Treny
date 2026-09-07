import { describe, expect, it } from 'vitest';
import { RESIDENTS } from '../residents';
import { genesisState, held, placeInRoom, SLEEPS } from './state';
import { CAPACITY, closeEconomyDay, createEconomy, RESOURCES, totalCells } from './economy';
import { attempt } from './verbs';
import { advanceScheduledWatch } from './tick';

function balance(state: ReturnType<typeof genesisState>) {
  const ledger = state.economy.ledger;
  expect(Math.abs(totalCells(state) - (ledger.initialCells + ledger.minted - ledger.burned - ledger.leaked))).toBeLessThan(1e-8);
}
function pair() {
  const state = genesisState();
  placeInRoom(state, 'A', 'common');
  placeInRoom(state, 'B', 'common');
  state.bodies.A.cells = 12;
  state.bodies.B.cells = 2;
  held(state, 'A', 'B').trust = 60;
  held(state, 'B', 'A').resentment = 0;
  state.economy = createEconomy(state.day, Object.values(state.bodies).reduce((sum, b) => sum + b.cells, 0));
  return state;
}

describe('material and monetary transactions', () => {
  it('grows produce, cooks meals and eats by consuming the actual inputs', () => {
    const state = pair();
    const initial = totalCells(state);
    const stock = { ...state.economy.stock };
    expect(attempt(state, { actor: 'V', verb: 'grow' }).ok).toBe(true);
    expect(state.economy.stock.produce).toBe(stock.produce + 16);
    expect(state.economy.stock.water).toBe(stock.water - 2);
    expect(attempt(state, { actor: 'A', verb: 'cook' }).ok).toBe(true);
    expect(state.economy.stock.produce).toBe(stock.produce + 12);
    expect(state.economy.stock.meals).toBe(stock.meals + 8);
    const wallet = state.bodies.A.cells;
    expect(attempt(state, { actor: 'A', verb: 'eat' }).ok).toBe(true);
    expect(state.economy.stock.meals).toBe(stock.meals + 7);
    expect(state.economy.stock.water).toBe(stock.water - 4);
    expect(state.bodies.A.cells).toBe(wallet - 0.5);
    expect(state.economy.treasury).toBe(0.5);
    expect(totalCells(state)).toBe(initial);
    expect(state.economy.workCredits.A).toBe(2);
    balance(state);
  });

  it('refuses absent inputs and full stores before changing anything', () => {
    const state = pair();
    state.economy.stock.produce = 0;
    const before = structuredClone(state);
    expect(attempt(state, { actor: 'A', verb: 'cook' }).ok).toBe(false);
    expect(state).toEqual(before);
    state.economy.stock.produce = CAPACITY.produce;
    const full = structuredClone(state);
    expect(attempt(state, { actor: 'V', verb: 'grow' }).ok).toBe(false);
    expect(state).toEqual(full);
  });

  it('records work without creating cells and pays only workers from available funds', () => {
    const state = pair();
    const initial = totalCells(state);
    attempt(state, { actor: 'A', verb: 'work' });
    expect(totalCells(state)).toBe(initial);
    const a = state.bodies.A.cells, b = state.bodies.B.cells;
    closeEconomyDay(state, 8);
    expect(state.economy.ledger.minted).toBe(1);
    expect(state.bodies.A.cells).toBeCloseTo((a + 0.35) * 0.988);
    expect(state.bodies.B.cells).toBeCloseTo(b * 0.988);
    expect(state.economy.workCredits.A).toBe(0);
    balance(state);
  });

  it('cannot multiply issuance when only one resident has a positive wallet', () => {
    const state = genesisState();
    for (const { id } of RESIDENTS) state.bodies[id].cells = 0;
    state.bodies.A.cells = 1;
    state.economy = createEconomy(state.day, 1);
    closeEconomyDay(state, 939);
    expect(state.economy.ledger.minted).toBeLessThanOrEqual(939 / 8);
    expect(totalCells(state)).toBeLessThanOrEqual(1 + 939 / 8);
    balance(state);
  });

  it('can offer a gift, but cannot force the recipient to accept', () => {
    const state = pair();
    const initial = totalCells(state);
    held(state, 'B', 'A').resentment = 90;
    const before = structuredClone(state);
    expect(attempt(state, { actor: 'A', verb: 'give', target: 'B' }).ok).toBe(false);
    expect(state).toEqual(before);
    held(state, 'B', 'A').resentment = 0;
    expect(attempt(state, { actor: 'A', verb: 'give', target: 'B' }).ok).toBe(true);
    expect(state.bodies.B.cells).toBe(4);
    expect(totalCells(state)).toBe(initial);
    balance(state);
  });

  it('keeps a persistent loan, returns it in two real payments and remembers both', () => {
    const state = pair();
    const initial = totalCells(state);
    expect(attempt(state, { actor: 'A', verb: 'lend', target: 'B' }).ok).toBe(true);
    expect(state.economy.debts[0]).toMatchObject({ principal: 4, remaining: 4, dueDay: 105, status: 'open' });
    const before = structuredClone(state);
    expect(attempt(state, { actor: 'A', verb: 'lend', target: 'B' }).ok).toBe(false);
    expect(state).toEqual(before);
    expect(attempt(state, { actor: 'B', verb: 'repay', target: 'A' }).ok).toBe(true);
    expect(state.economy.debts[0]!.remaining).toBe(2);
    expect(attempt(state, { actor: 'B', verb: 'repay', target: 'A' }).ok).toBe(true);
    expect(state.economy.debts[0]!.status).toBe('paid');
    expect(state.bodies.A.memory.at(-1)?.kind).toBe('repay');
    expect(totalCells(state)).toBe(initial);
    balance(state);
  });

  it('makes an overdue date consequential once, and a repayment repairs trust', () => {
    const state = pair();
    attempt(state, { actor: 'A', verb: 'lend', target: 'B' });
    state.day = 105;
    const trust = held(state, 'A', 'B').trust;
    closeEconomyDay(state, 0);
    expect(state.economy.debts[0]!.status).toBe('overdue');
    expect(held(state, 'A', 'B').trust).toBe(trust - 6);
    closeEconomyDay(state, 0);
    expect(held(state, 'A', 'B').trust).toBe(trust - 6);
    attempt(state, { actor: 'B', verb: 'repay', target: 'A' });
    expect(held(state, 'A', 'B').trust).toBe(trust - 3);
    balance(state);
  });

  it('never reuses a loan ID after repayment within the same watch', () => {
    const state = pair();
    for (let round = 0; round < 60; round += 1) {
      expect(attempt(state, { actor: 'A', verb: 'lend', target: 'B' }).ok).toBe(true);
      const debt = state.economy.debts.at(-1)!;
      expect(debt.id).toBe(`100-1-AB-${round}`);
      expect(attempt(state, { actor: 'B', verb: 'repay', target: 'A' }).ok).toBe(true);
      expect(attempt(state, { actor: 'B', verb: 'repay', target: 'A' }).ok).toBe(true);
    }
    expect(state.economy.nextDebtSequence).toBe(60);
    expect(new Set(state.economy.debts.map((debt) => debt.id)).size).toBe(state.economy.debts.length);
    expect(state.economy.debts).toHaveLength(50);
    balance(state);
  });

  it('settles a paid repair atomically with the provider’s consent and actual material', () => {
    const state = pair();
    state.bodies.A.condition.safe = 30;
    state.bodies.B.condition.rested = 20;
    const before = structuredClone(state);
    expect(attempt(state, { actor: 'A', verb: 'trade', target: 'B' }).ok).toBe(false);
    expect(state).toEqual(before);
    state.bodies.B.condition.rested = 80;
    const money = totalCells(state), material = state.economy.stock.materials;
    expect(attempt(state, { actor: 'A', verb: 'trade', target: 'B' }).ok).toBe(true);
    expect(state.bodies.A.cells).toBe(10);
    expect(state.bodies.B.cells).toBe(3);
    expect(state.bodies.A.condition.safe).toBe(52);
    expect(state.economy.stock.materials).toBe(material - 1);
    expect(totalCells(state)).toBe(money - 1);
    balance(state);
  });
});

describe('a society that can reach its remedies', () => {
  for (const seed of [1, 7, 23]) {
    it(`keeps cells balanced and needs resolvable through 90 days, seed ${seed}`, () => {
      const state = genesisState(seed);
      for (let watch = 0; watch < 360; watch += 1) {
        advanceScheduledWatch(state);
        balance(state);
        for (const resource of RESOURCES) {
          expect(state.economy.stock[resource]).toBeGreaterThanOrEqual(0);
          expect(state.economy.stock[resource]).toBeLessThanOrEqual(CAPACITY[resource]);
        }
        for (const { id } of RESIDENTS) {
          const body = state.bodies[id];
          for (const key of ['fed', 'well', 'rested', 'safe'] as const) {
            expect(body.condition[key], `${seed}/${watch}/${id}/${key}`).toBeGreaterThan(18);
          }
          if (state.watch === 1) expect(body.room).toBe(SLEEPS[id]);
        }
      }
    });
  }
  it('recovers from an empty material inventory with production rather than an invented refill', () => {
    const state = genesisState();
    state.economy.stock = { produce: 0, meals: 0, water: 0, materials: 0 };
    for (let watch = 0; watch < 28; watch += 1) advanceScheduledWatch(state);
    for (const { id } of RESIDENTS) expect(state.bodies[id].condition.fed).toBeGreaterThan(18);
    expect(state.economy.stock.water).toBeGreaterThan(0);
    expect(state.economy.stock.meals).toBeGreaterThan(0);
    balance(state);
  });
});
