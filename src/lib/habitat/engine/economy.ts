import type { RoomId } from '../rooms';
import { RESIDENTS, type ResidentId } from '../residents';
import type { WorldState } from './state';

export const RESOURCES = ['produce', 'meals', 'water', 'materials'] as const;
export type Resource = (typeof RESOURCES)[number];
export type Debt = {
  id: string; lender: ResidentId; borrower: ResidentId;
  principal: number; remaining: number; issuedDay: number; dueDay: number;
  status: 'open' | 'paid' | 'overdue';
};
export type MemoryFact = {
  day: number; watch: number; kind: string; other?: ResidentId;
  amount?: number; resource?: Resource; outcome: string;
};
export type EconomicEvent = { sequence: number; day: number; watch: number; actor?: ResidentId; room?: RoomId; companions?: ResidentId[];
  action: string; entries: Array<{ account: string; delta: number }> };
export type Economy = {
  events: EconomicEvent[];
  nextEventSequence: number;
  startedOnDay: number;
  stock: Record<Resource, number>;
  treasury: number;
  workCredits: Record<ResidentId, number>;
  debts: Debt[];
  nextDebtSequence: number;
  ledger: { initialCells: number; minted: number; burned: number; leaked: number };
  maintenance: number;
};

/** Capacity is physical storage. Production cannot silently discard its inputs. */
export const CAPACITY: Record<Resource, number> = { produce: 200, meals: 160, water: 400, materials: 180 };

/** First material inventory, explicitly dated. It makes no claim about the past.
 * Existing money is measured, never replenished by loading an old world. */
export function createEconomy(day: number, initialCells: number): Economy {
  return {
    events: [], nextEventSequence: 0,
    startedOnDay: day,
    stock: { produce: 60, meals: 100, water: 250, materials: 16 },
    treasury: 0,
    workCredits: Object.fromEntries(RESIDENTS.map(({ id }) => [id, 0])) as Record<ResidentId, number>,
    debts: [], nextDebtSequence: 0, ledger: { initialCells, minted: 0, burned: 0, leaked: 0 }, maintenance: 90,
  };
}

export function totalCells(state: WorldState): number {
  return state.economy.treasury + RESIDENTS.reduce((sum, { id }) => sum + state.bodies[id].cells, 0);
}

export function recordWork(state: WorldState, id: ResidentId, credits = 1): void {
  state.economy.workCredits[id] += credits;
}

export function remember(state: WorldState, id: ResidentId, fact: Omit<MemoryFact, 'day' | 'watch'>): void {
  const memory = state.bodies[id].memory;
  memory.push({ ...fact, day: state.day, watch: Math.min(4, state.watch) });
  if (memory.length > 8) memory.splice(0, memory.length - 8);
}

/** A recipient's reserve and remembered obligations constrain agreement. There
 * is no random acceptance coin, and a model cannot speak for the recipient. */
export function acceptsHelp(state: WorldState, from: ResidentId, to: ResidentId): boolean {
  return state.axes.get(`${to}${from}`)!.resentment < 70;
}

export function outstanding(state: WorldState, borrower: ResidentId, lender?: ResidentId): Debt[] {
  return state.economy.debts.filter((debt) => debt.borrower === borrower && debt.remaining > 0
    && (!lender || debt.lender === lender));
}

/** The only mint. Unused power becomes stored cells once, then actual work is
 * paid from that reserve. Every transfer and every leak has a balancing entry. */
export function closeEconomyDay(state: WorldState, surplusPower: number): void {
  const economy = state.economy;
  const before = economicAccounts(state);
  // A rack stores at most 100 cells. A full rack simply leaves power unconverted.
  const minted = Math.min(Math.floor(Math.max(0, surplusPower) / 8), Math.max(0, 100 - economy.treasury));
  economy.treasury += minted;
  economy.ledger.minted += minted;
  const credits = RESIDENTS.reduce((sum, { id }) => sum + economy.workCredits[id], 0);
  const pay = Math.min(economy.treasury, credits * 0.35);
  for (const { id } of RESIDENTS) {
    const wage = credits === 0 ? 0 : pay * economy.workCredits[id] / credits;
    state.bodies[id].cells += wage;
    economy.treasury -= wage;
    economy.workCredits[id] = 0;
  }
  if (economy.treasury < 0 && economy.treasury > -1e-10) economy.treasury = 0;
  for (const { id } of RESIDENTS) {
    const leak = state.bodies[id].cells * 0.012;
    state.bodies[id].cells -= leak;
    economy.ledger.leaked += leak;
  }
  const treasuryLeak = economy.treasury * 0.012;
  economy.treasury -= treasuryLeak;
  economy.ledger.leaked += treasuryLeak;
  economy.maintenance = Math.max(0, economy.maintenance - 2);
  // An unpaid date has one consequence, not another punishment every watch.
  for (const debt of economy.debts) {
    if (debt.status !== 'open' || debt.dueDay > state.day) continue;
    debt.status = 'overdue';
    const axes = state.axes.get(`${debt.lender}${debt.borrower}`)!;
    axes.trust = Math.max(0, axes.trust - 6);
    axes.resentment = Math.min(100, axes.resentment + 8);
    const outcome = `${debt.remaining} cells were still owed at the agreed date.`;
    remember(state, debt.lender, { kind: 'overdue', other: debt.borrower, amount: debt.remaining, outcome });
    remember(state, debt.borrower, { kind: 'overdue', other: debt.lender, amount: debt.remaining, outcome });
    state.record.push({ day: state.day, watch: 4, minute: 1420, room: state.bodies[debt.borrower].room,
      who: [debt.borrower, debt.lender], text: `Loan ${debt.id}: ${outcome}`, kind: 'need' });
  }
  recordEconomicChange(state, before, 'day-close');
}

/** Exact double-entry-compatible deltas, separate from the reader's diary. */
export function economicAccounts(state: WorldState): Record<string, number> {
  return { treasury: state.economy.treasury, maintenance: state.economy.maintenance,
    ...Object.fromEntries(RESIDENTS.map(({ id }) => [`cells:${id}`, state.bodies[id].cells])),
    ...Object.fromEntries(RESIDENTS.map(({ id }) => [`credits:${id}`, state.economy.workCredits[id]])),
    ...Object.fromEntries(RESOURCES.map((id) => [`stock:${id}`, state.economy.stock[id]])),
    ...Object.fromEntries(Object.entries(state.economy.ledger).map(([id, value]) => [`ledger:${id}`, value])),
  };
}
export function recordEconomicChange(state: WorldState, before: Record<string, number>, action: string, actor?: ResidentId): EconomicEvent | undefined {
  const entries = Object.entries(economicAccounts(state)).flatMap(([account, value]) => value === before[account]
    ? [] : [{ account, delta: value - (before[account] ?? 0) }]);
  if (!entries.length) return undefined;
  const event = { sequence: state.economy.nextEventSequence++, day: state.day,
    watch: Math.min(4, state.watch), ...(actor ? { actor, room: state.bodies[actor].room } : {}), action, entries };
  state.economy.events.push(event);
  return event;
}

/** Machinery is optional for essentials, but functioning equipment saves labour
 * and raises yield. Manual production remains available during a power crisis. */
export function mechanized(state: WorldState, room: keyof WorldState['rooms']): boolean {
  return state.reactor.output > 0 && state.rooms[room].lit && state.economy.maintenance >= 40;
}
export function yieldFor(state: WorldState, room: keyof WorldState['rooms'], normal: number): number {
  return mechanized(state, room) ? normal : Math.max(1, Math.floor(normal / 2));
}
