import { RESIDENTS, type ResidentId } from './residents';
import { CONDITIONS, type Condition, type WorldState } from './engine/state';
import { CAPACITY, RESOURCES, type Debt, type Economy } from './engine/economy';

export type SocietySnapshot = {
  startedOnDay: number;
  stock: Economy['stock'];
  treasury: number;
  maintenance: number;
  balances: Array<{ id: ResidentId; cells: number; workCreditsToday: number; conditions: Record<Condition, number> }>;
  debts: Debt[];
  ledger: Economy['ledger'];
};

/** One projection of the same committed world as the room and relationship view. */
export function worldSociety(state: WorldState): SocietySnapshot {
  return {
    startedOnDay: state.economy.startedOnDay,
    stock: { ...state.economy.stock }, treasury: state.economy.treasury,
    maintenance: state.economy.maintenance,
    balances: RESIDENTS.map(({ id }) => ({
      id, cells: state.bodies[id].cells, workCreditsToday: state.economy.workCredits[id],
      conditions: { ...state.bodies[id].condition },
    })),
    debts: state.economy.debts.map((debt) => ({ ...debt })), ledger: { ...state.economy.ledger },
  };
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const knownId = (value: unknown): value is ResidentId => typeof value === 'string' && RESIDENTS.some((resident) => resident.id === value);

export function isSocietySnapshot(value: unknown): value is SocietySnapshot {
  if (!object(value) || !Number.isInteger(value.startedOnDay) || (value.startedOnDay as number) < 100
    || !object(value.stock) || !RESOURCES.every((key) => nonnegative(value.stock && (value.stock as Record<string, unknown>)[key])
      && ((value.stock as Record<string, number>)[key] ?? Infinity) <= CAPACITY[key])
    || !nonnegative(value.treasury) || !nonnegative(value.maintenance) || value.maintenance > 100
    || !Array.isArray(value.balances) || value.balances.length !== RESIDENTS.length
    || !Array.isArray(value.debts) || !object(value.ledger)
    || !['initialCells', 'minted', 'burned', 'leaked'].every((key) => nonnegative((value.ledger as Record<string, unknown>)[key]))) return false;
  const seen = new Set<string>();
  for (const balance of value.balances) {
    if (!object(balance) || !knownId(balance.id) || seen.has(balance.id)
      || !nonnegative(balance.cells) || !nonnegative(balance.workCreditsToday) || !object(balance.conditions)
      || !CONDITIONS.every((key) => nonnegative((balance.conditions as Record<string, unknown>)[key])
        && (balance.conditions as Record<string, number>)[key]! <= 100)) return false;
    seen.add(balance.id);
  }
  const debtIds = new Set<string>();
  for (const debt of value.debts) {
    if (!object(debt) || typeof debt.id !== 'string' || !debt.id || debtIds.has(debt.id)
      || !knownId(debt.lender) || !knownId(debt.borrower) || debt.lender === debt.borrower
      || !nonnegative(debt.principal) || debt.principal === 0 || !nonnegative(debt.remaining)
      || debt.remaining > debt.principal || !Number.isInteger(debt.issuedDay) || !Number.isInteger(debt.dueDay)
      || (debt.dueDay as number) < (debt.issuedDay as number) || !['open', 'paid', 'overdue'].includes(String(debt.status))
      || (debt.status === 'paid') !== (debt.remaining === 0)) return false;
    debtIds.add(debt.id);
  }
  const society = value as SocietySnapshot;
  const money = society.treasury + society.balances.reduce((sum, person) => sum + person.cells, 0);
  const expected = society.ledger.initialCells + society.ledger.minted - society.ledger.burned - society.ledger.leaked;
  return Math.abs(money - expected) < 1e-6 * Math.max(1, money);
}
