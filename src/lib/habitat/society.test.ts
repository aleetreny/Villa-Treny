import { describe, expect, it } from 'vitest';
import { genesisState } from './engine/state';
import { isSocietySnapshot, worldSociety } from './society';

describe('the public shared ledger', () => {
  it('projects all 25 balances and reconciles money without exposing mutable state', () => {
    const state = genesisState(23);
    const snapshot = worldSociety(state);
    expect(isSocietySnapshot(snapshot)).toBe(true);
    expect(snapshot.balances).toHaveLength(25);
    snapshot.balances[0]!.conditions.well = 0;
    snapshot.stock.meals = 0;
    expect(state.bodies.A.condition.well).toBeGreaterThan(0);
    expect(state.economy.stock.meals).toBeGreaterThan(0);
  });
  it('rejects duplicated people, invalid conditions, negative stocks and missing money', () => {
    const snapshot = worldSociety(genesisState());
    expect(isSocietySnapshot({ ...snapshot, balances: [...snapshot.balances.slice(1), snapshot.balances[1]] })).toBe(false);
    expect(isSocietySnapshot({ ...snapshot, stock: { ...snapshot.stock, water: -1 } })).toBe(false);
    expect(isSocietySnapshot({ ...snapshot, treasury: snapshot.treasury + 5 })).toBe(false);
    expect(isSocietySnapshot({ ...snapshot, maintenance: NaN })).toBe(false);
    const invalid = structuredClone(snapshot);
    invalid.balances[0]!.conditions.well = 101;
    expect(isSocietySnapshot(invalid)).toBe(false);
  });
  it('rejects impossible loans rather than inventing repayment state', () => {
    const snapshot = worldSociety(genesisState());
    const debt = { id: 'one', lender: 'A', borrower: 'B', principal: 4, remaining: 2, issuedDay: 100, dueDay: 104, status: 'open' };
    expect(isSocietySnapshot({ ...snapshot, debts: [debt] })).toBe(true);
    expect(isSocietySnapshot({ ...snapshot, debts: [{ ...debt, remaining: 5 }] })).toBe(false);
    expect(isSocietySnapshot({ ...snapshot, debts: [{ ...debt, status: 'paid' }] })).toBe(false);
    expect(isSocietySnapshot({ ...snapshot, debts: [debt, debt] })).toBe(false);
  });
});
