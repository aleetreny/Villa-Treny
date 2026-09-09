import { economicAccounts, outstanding, recordEconomicChange, remember } from '../engine/economy';
import { nudge, type WorldState } from '../engine/state';
import { VERBS } from '../engine/verbs';
import type { ResidentId } from '../residents';
import { SOCIETY_LIMITS as L, type Agreement, type Offer, type OfferTerms, type SocietyState } from './types';
import { evidence, makeRoom, nextSocietyId, watchNumber } from './state';
import { canSpendCells } from './money';
import { recordPromisedCells } from './records';

export function parties(terms: OfferTerms): [ResidentId, ResidentId] {
  return terms.kind === 'work' ? [terms.worker, terms.payer] : [terms.from, terms.to];
}
/** Reservations are promises, not an invented escrow account. Existing physical
 * spending can still use these cells, so payment always rechecks actual funds. */
export function promisedCells(state: SocietyState, payer: ResidentId, except?: string): number {
  return state.agreements.reduce((sum, a) => sum + (a.id !== except && a.terms.kind === 'work'
    && a.terms.payer === payer && ['active', 'payment_due'].includes(a.status) ? a.terms.cells : 0),
  // Historical P1–5 replay can pass its exact v1 state to this pure authority.
  // The runtime decoder upgrades that state before writing; no v2 validation
  // is relaxed by treating absent historical record promises as zero here.
  state.records ? recordPromisedCells(state.records, payer, except) : 0);
}
/** A watch supplies one productive action, including travel through `at`.
 * The due watch is inclusive. A slot already observed cannot be sold again;
 * choosing a separate `go` step still spends its own slot. This is feasibility,
 * not a promise that resources, health or the worker's priorities stay unchanged. */
export function minimumWorkDeadline(state: SocietyState, world: WorldState, worker: ResidentId, units: number): number {
  return Math.max(watchNumber(world), state.minds[worker].lastPhysicalWatch + 1) + units - 1;
}
export function workDeadlineProblem(state: SocietyState, world: WorldState,
  terms: Extract<OfferTerms, { kind: 'work' }>): string | null {
  if (terms.room === 'breach') return 'inaccessible_work_room';
  return terms.dueWatch < minimumWorkDeadline(state, world, terms.worker, terms.units)
    || terms.dueWatch > watchNumber(world) + 16 ? 'invalid_work_deadline' : null;
}
export function termsProblem(state: SocietyState, world: WorldState, terms: OfferTerms): string | null {
  const [a, b] = parties(terms);
  if (a === b) return 'self_agreement';
  if (terms.kind !== 'work') {
    if (terms.cells <= 0) return 'invalid_amount';
    if (!canSpendCells(world.bodies[terms.from].cells, terms.cells, promisedCells(state, terms.from))) return 'insufficient_cells';
    if (terms.kind === 'loan') {
      if (terms.dueDay <= world.day || terms.dueDay > world.day + 30) return 'invalid_loan_due_day';
      if (outstanding(world, terms.to).length >= 2 || outstanding(world, terms.to, terms.from).length) return 'existing_loan_limit';
    }
    return null;
  }
  const deadline = workDeadlineProblem(state, world, terms);
  if (deadline) return deadline;
  if (!canSpendCells(world.bodies[terms.payer].cells, terms.cells, promisedCells(state, terms.payer))) return 'insufficient_cells';
  // Completed labour no longer occupies its worker. An unpaid invoice remains
  // reserved against the payer, without preventing its creditor from working.
  if (state.agreements.some((a) => a.terms.kind === 'work' && a.terms.worker === terms.worker
    && a.status === 'active' && a.progress < a.terms.units)) return 'existing_work_commitment';
  if (state.records?.agreements.some((a) => a.status === 'active' && a.terms.author === terms.worker)) return 'existing_publication_commitment';
  // A work agreement may be made remotely. Its room is a destination, never an
  // assertion that a body has already moved there or performed labour.
  const sample = structuredClone(world);
  sample.bodies[terms.worker].room = terms.room;
  if (VERBS[terms.verb].requires?.(sample, { actor: terms.worker, verb: terms.verb })) return 'work_resources_unavailable';
  return null;
}
function transfer(world: WorldState, from: ResidentId, to: ResidentId, cells: number, label: string): void {
  const before = economicAccounts(world);
  // A tolerated rounding shortfall must not produce a negative account or mint
  // a correction. Debit and credit the same available representable amount.
  const transferred = Math.min(cells, world.bodies[from].cells);
  world.bodies[from].cells -= transferred; world.bodies[to].cells += transferred;
  recordEconomicChange(world, before, label, from);
  remember(world, from, { kind: 'agreement', other: to, amount: cells, outcome: `Transferred ${cells} cells under ${label}.` });
  remember(world, to, { kind: 'agreement', other: from, amount: cells, outcome: `Received ${cells} cells under ${label}.` });
}
/** Called only after exact counterpart acceptance has passed turn validation. */
export function acceptOfferDraft(state: SocietyState, world: WorldState, offer: Offer, nowMs: number): string | null {
  const problem = termsProblem(state, world, offer.terms);
  if (problem) return problem;
  if (!makeRoom(state.agreements, L.agreements, (a) => a.status === 'fulfilled' || (a.status === 'breached' && a.terms.kind === 'work'))) return 'agreement_capacity';
  const terms = offer.terms;
  const agreement: Agreement = { id: nextSocietyId(state, 'agreement'), offerId: offer.id, terms: structuredClone(terms),
    status: terms.kind === 'transfer' ? 'fulfilled' : 'active', acceptedAtMs: nowMs, acceptedAtWatch: watchNumber(world),
    acceptedAfterEventSequence: world.economy.nextEventSequence,
    progress: 0, completedAtMs: terms.kind === 'transfer' ? nowMs : null, evidenceIds: [], debtId: null };
  if (terms.kind !== 'work') {
    transfer(world, terms.from, terms.to, terms.cells, `agreement:${agreement.id}`);
    if (terms.kind === 'loan') {
      const sequence = world.economy.nextDebtSequence++;
      const debtId = `${world.day}-${world.watch}-${terms.from}${terms.to}-${sequence}`;
      const paid = world.economy.debts.filter((d) => d.status === 'paid').slice(-49);
      world.economy.debts = [...world.economy.debts.filter((d) => d.status !== 'paid'), ...paid,
        { id: debtId, lender: terms.from, borrower: terms.to, principal: terms.cells, remaining: terms.cells,
          issuedDay: world.day, dueDay: terms.dueDay, status: 'open' }];
      agreement.debtId = debtId;
      nudge(world, terms.to, terms.from, 'debt', terms.cells);
    }
    nudge(world, terms.to, terms.from, 'trust', 1);
  }
  offer.status = 'accepted'; offer.acceptedAtMs = nowMs;
  state.agreements.push(agreement);
  for (const actor of parties(terms)) evidence(state, actor, world, nowMs, 'commitment',
    `Both parties accepted ${JSON.stringify(terms)}.`, [offer.id], null, 5);
  return null;
}
/** Work completion and its negotiated payment commit together. If actual funds
 * disappeared, the completed labour remains evidenced and payment stays due. */
export function settleWorkDraft(state: SocietyState, world: WorldState, nowMs: number): boolean {
  let changed = false;
  for (const a of state.agreements) {
    if (a.terms.kind === 'loan' && ['active', 'breached'].includes(a.status)) {
      const debt = world.economy.debts.find((d) => d.id === a.debtId);
      if (debt?.status === 'paid') {
        a.status = 'fulfilled'; a.completedAtMs = nowMs; changed = true;
        for (const actor of parties(a.terms)) evidence(state, actor, world, nowMs, 'observation',
          `${a.id}: the ${a.terms.cells}-cell loan has been repaid.`, [debt.id], null, 5);
      } else if (debt?.status === 'overdue' && a.status !== 'breached') { a.status = 'breached'; changed = true; }
      continue;
    }
    if (a.terms.kind !== 'work' || !['active', 'payment_due'].includes(a.status)) continue;
    const terms = a.terms;
    if (a.progress >= terms.units) {
      if (!canSpendCells(world.bodies[terms.payer].cells, terms.cells)) { if (a.status !== 'payment_due') { a.status = 'payment_due'; changed = true; } continue; }
      transfer(world, terms.payer, terms.worker, terms.cells, `work:${a.id}`);
      a.status = 'fulfilled'; a.completedAtMs = nowMs; changed = true;
      nudge(world, terms.payer, terms.worker, 'trust', 2);
      nudge(world, terms.worker, terms.payer, 'trust', 2);
      for (const actor of parties(terms)) evidence(state, actor, world, nowMs, 'observation',
        `${a.id}: ${a.progress} agreed ${terms.verb} action(s) completed; ${terms.cells} cells paid.`, a.evidenceIds, null, 5);
    } else if (watchNumber(world) > terms.dueWatch) {
      a.status = 'breached'; changed = true;
      nudge(world, terms.payer, terms.worker, 'trust', -2);
      for (const actor of parties(terms)) evidence(state, actor, world, nowMs, 'observation',
        `${a.id} missed its work deadline (${a.progress}/${terms.units} actions). No completion payment was made.`, [a.id], null, 5);
    }
  }
  return changed;
}
export function settleSocietyAgreements(state: SocietyState, world: WorldState, nowMs: number) {
  const next = structuredClone(state), physical = structuredClone(world);
  if (!settleWorkDraft(next, physical, nowMs)) return { state, world };
  next.revision += 1;
  return { state: next, world: physical };
}
