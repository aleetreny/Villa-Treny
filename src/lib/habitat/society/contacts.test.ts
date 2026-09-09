import { expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { RESIDENTS, RESIDENT_BY_ID, type ResidentId } from '../residents';
import { applySocietyTurn, createSocietyState, prepareSocietyTurn, type TurnResponse } from './index';

it('prioritizes the interlocutor, financial counterpart and known bonds without exposing their private profiles', () => {
  let world = genesisState(41), state = createSocietyState(world, 1000), sequence = 0;
  const turn = (actor: ResidentId, response: TurnResponse) => {
    const job = prepareSocietyTurn(state, world, actor, { nowMs: 2000, sequence: ++sequence, generation: 0 });
    const result = applySocietyTurn(state, world, job, response, { nowMs: 2001, generation: 0 });
    expect(result.ok).toBe(true); state = result.state; world = result.world;
  };
  turn('B', { project: { mode: 'replace', goal: 'Keep my violet ledger hidden.', why: 'A confidential personal reason.', visibility: 'private', steps: [{ verb: 'observe' }] } });
  turn('C', { message: { to: 'A', text: 'Can we discuss the shared records?' } });
  world.economy.debts.push({ id: '100-1-BA-0', lender: 'B', borrower: 'A', principal: 2, remaining: 2, issuedDay: 100, dueDay: 110, status: 'open' });
  world.economy.nextDebtSequence = 1;
  const job = prepareSocietyTurn(state, world, 'A', { nowMs: 3000, sequence: ++sequence, generation: 0 });
  const context = JSON.parse(job.prompt.slice(job.prompt.indexOf('\n{') + 1));
  expect(context.self.duty).toBe(RESIDENT_BY_ID.A.duty);
  expect(context.public.contacts.slice(0, 3).map((person: { id: ResidentId }) => person.id)).toEqual(['C', 'B', 'U']);
  expect(context.public.contacts.length).toBeGreaterThanOrEqual(3);
  expect(context.public.contacts.length).toBeLessThanOrEqual(4);
  for (const person of context.public.contacts as { id: ResidentId; name: string; duty: string | null }[]) {
    expect(person).toEqual({ id: person.id, name: RESIDENT_BY_ID[person.id].name, duty: RESIDENT_BY_ID[person.id].duty });
  }
  expect(job.prompt).not.toContain('violet ledger');
  expect(job.prompt).not.toContain('confidential personal reason');
  expect(job.prompt).not.toContain(RESIDENT_BY_ID.B.fears);
  expect(job.prompt).not.toContain(RESIDENT_BY_ID.C.wants);
  expect(context.omitted.contacts + context.public.contacts.length).toBe(24);
});

it('offers a relevant public duty for an actual supply shortage without changing anyone’s action', () => {
  const world = genesisState(41); world.economy.stock.water = 20;
  const state = createSocietyState(world, 1000), before = structuredClone({ world, state });
  const job = prepareSocietyTurn(state, world, 'R', { nowMs: 2000, sequence: 0, generation: 0 });
  const context = JSON.parse(job.prompt.slice(job.prompt.indexOf('\n{') + 1));
  expect(context.public.contacts).toContainEqual({ id: 'O', name: RESIDENT_BY_ID.O.name, duty: 'The Well' });
  expect({ world, state }).toEqual(before);
  expect(context.affordances.allowedRecipientIds).toContain('O');
});

it('preserves one private voice and three or four public contacts for each initial resident within the context budget', () => {
  const world = genesisState(41), state = createSocietyState(world, 1000);
  for (const resident of RESIDENTS) {
    const job = prepareSocietyTurn(state, world, resident.id, { nowMs: 2000, sequence: 0, generation: 0 });
    const context = JSON.parse(job.prompt.slice(job.prompt.indexOf('\n{') + 1));
    expect(context.self.voice).toBe(resident.voice);
    expect(context.self.wants).toBe(resident.wants);
    expect(context.self.duty).toBe(resident.duty);
    expect(context.public.contacts.length).toBeGreaterThanOrEqual(3);
    expect(context.public.contacts.length).toBeLessThanOrEqual(4);
    expect(new Set(context.public.contacts.map((person: { id: string }) => person.id)).size).toBe(context.public.contacts.length);
    expect(context.public.contacts.some((person: { id: string }) => person.id === resident.id)).toBe(false);
    expect(context.affordances.workExamples.length + context.omitted.workExampleCount).toBe(5);
    expect(job.contextOverflow).toBe(false);
  }
});
