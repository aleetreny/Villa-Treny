import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { genesisState } from '../engine/state';
import { totalCells } from '../engine/economy';
import { applySocietyTurn, prepareSocietyTurn } from './turn';
import { createSocietyState } from './state';
import { applyCapabilityChoice, applyProposalCapabilityChoice, capabilityChoiceJsonSchema, proposalCapabilityChoiceJsonSchema } from './capabilities';
import { applySocietyChoice } from './choice';
import { SOCIETY_SYSTEM, SOCIETY_PROPOSAL_SYSTEM } from './instructions';

const project = { mode: 'replace', goal: 'Agree on terms together.', why: 'I want a clear decision.', visibility: 'private', steps: [] } as const;
const fixture = () => { const world = genesisState(91); return { world, state: createSocietyState(world, 1000) }; };
const control = { nowMs: 2001, generation: 0 };
const prepare = (f: ReturnType<typeof fixture>, actor: 'A' | 'B', sequence = 1, nowMs = 2000) =>
  prepareSocietyTurn(f.state, f.world, actor, { nowMs, sequence, generation: 0 });
const message = { to: 'B', text: 'Would you like a loan of two cells?' };
const deal = { kind: 'loan', direction: 'lend', cells: 2, dueInDays: 2 };

describe('protocol4 keeps an omitted close open without inferring a deal or consent', () => {
  it('has exactly the same persisted effect for omitted and explicit false on a real opening proposal', () => {
    const f = fixture(), turn = prepare(f, 'A'), before = structuredClone(f);
    const oldSchema = capabilityChoiceJsonSchema(f.state, f.world, turn);
    const schema = proposalCapabilityChoiceJsonSchema(f.state, f.world, turn);
    const omitted = { project, message, deal }, explicit = { ...omitted, message: { ...message, close: false } };
    expect(z.fromJSONSchema(schema).safeParse(omitted).success).toBe(true);
    const a = applyProposalCapabilityChoice(f.state, f.world, turn, omitted, control);
    const b = applyProposalCapabilityChoice(f.state, f.world, turn, explicit, control);
    expect(a.ok).toBe(true); expect(a).toEqual(b); expect(f).toEqual(before);
    expect(a.world).toEqual(f.world); expect(a.state.offers).toHaveLength(1); expect(a.state.agreements).toHaveLength(0);
    expect(a.state.conversations[0]).toMatchObject({ status: 'open', nextSpeaker: 'B' });
    expect(capabilityChoiceJsonSchema(f.state, f.world, turn)).toEqual(oldSchema);
    expect(applyProposalCapabilityChoice(a.state, a.world, turn, omitted, control).code).toBe('already_applied');
  });

  it('requires a separate counterpart accept and keeps verbal acceptance and rejection distinct', () => {
    const f = fixture(), proposed = applyProposalCapabilityChoice(f.state, f.world, prepare(f, 'A'), { project, message, deal }, control);
    expect(proposed.ok).toBe(true);
    const next = { state: proposed.state, world: proposed.world }, turn = prepare(next, 'B', 1, 2100);
    const reply = { project, message: { to: 'A', text: 'I accept the loan.' } }, offerId = next.state.offers[0].id;
    const words = applyProposalCapabilityChoice(next.state, next.world, turn, reply, { ...control, nowMs: 2101 });
    expect(words.ok).toBe(true); expect(words.state.agreements).toHaveLength(0); expect(words.world).toEqual(next.world);
    const accepted = applyProposalCapabilityChoice(next.state, next.world, turn, { ...reply, deal: { kind: 'accept', offerId } }, { ...control, nowMs: 2101 });
    expect(accepted.ok).toBe(true); expect(accepted.state.agreements).toHaveLength(1);
    expect(accepted.world.bodies.A.cells).toBe(next.world.bodies.A.cells - 2);
    expect(accepted.world.bodies.B.cells).toBe(next.world.bodies.B.cells + 2);
    expect(totalCells(accepted.world)).toBe(totalCells(next.world));
    const rejected = applyProposalCapabilityChoice(next.state, next.world, turn, { ...reply, deal: { kind: 'reject', offerId } }, { ...control, nowMs: 2101 });
    expect(rejected.ok).toBe(true); expect(rejected.state.offers[0].status).toBe('rejected'); expect(rejected.world).toEqual(next.world);
  });

  it('rejects explicit closure, missing words, fake parties, null and unknown keys without partial effects', () => {
    const f = fixture(), turn = prepare(f, 'A'), schema = z.fromJSONSchema(proposalCapabilityChoiceJsonSchema(f.state, f.world, turn));
    for (const raw of [
      { project, message: { ...message, close: true }, deal }, { project, deal },
      { project, message: { ...message, close: null }, deal }, { project, message, deal: null },
      { project, message: { ...message, extra: true }, deal }, { project, message, deal, extra: true },
      { project, message, deal: { ...deal, cells: -1 } }, { project, message, deal: { ...deal, to: 'C' } },
      { project, message: { ...message, to: 'A' }, deal }, { project, message, deal: { kind: 'accept', offerId: 'invented' } },
    ]) {
      expect(schema.safeParse(raw).success).toBe(false);
      const result = applyProposalCapabilityChoice(f.state, f.world, turn, raw, control);
      expect(result.ok).toBe(false); expect(result.state).toBe(f.state); expect(result.world).toBe(f.world);
    }
  });

  it('preserves old conversation-first version2/3 decisions and canonical version1 omission semantics', () => {
    const f = fixture(), a = prepare(f, 'A');
    const opened = applySocietyTurn(f.state, f.world, a, { project, message }, control);
    const next = { state: opened.state, world: opened.world }, b = prepare(next, 'B', 1, 2100);
    const raw = { project, message: { to: 'A', text: 'May I lend you two cells?' }, deal };
    const c = { nowMs: 2101, generation: 0 };
    expect(applySocietyChoice(next.state, next.world, b, raw, c).code).toBe('deal_requires_open_message');
    expect(applyCapabilityChoice(next.state, next.world, b, raw, c).ok).toBe(false);
    expect(applyProposalCapabilityChoice(next.state, next.world, b, raw, c).ok).toBe(true);
    const canonical = { project, message: raw.message, offer: { terms: { kind: 'loan', from: 'B', to: 'A', cells: 2, dueDay: 102 }, expiresInWatches: 2 } };
    expect(applySocietyTurn(next.state, next.world, b, canonical, c).ok).toBe(true);
  });

  it('changes only version4 instructions and still lets ordinary messages explicitly close', () => {
    expect(SOCIETY_SYSTEM).toContain('with close:false');
    expect(SOCIETY_PROPOSAL_SYSTEM).not.toContain('with close:false');
    expect(SOCIETY_PROPOSAL_SYSTEM).toContain('Omit close to keep the exchange open');
    expect(SOCIETY_PROPOSAL_SYSTEM).toContain('Acceptance requires a separate accept');
    expect(SOCIETY_PROPOSAL_SYSTEM).toContain('role:work means you work and the other person pays');
    expect(SOCIETY_PROPOSAL_SYSTEM).toContain('role:hire means you pay and the other person works');
    expect(SOCIETY_PROPOSAL_SYSTEM).toContain('accept its exact offerId');
    expect(SOCIETY_PROPOSAL_SYSTEM).toContain('Counterpropose only when you want different terms');
    expect(SOCIETY_SYSTEM).not.toContain('role:work means');
    const f = fixture();
    const schema = proposalCapabilityChoiceJsonSchema(f.state, f.world, prepare(f, 'A'));
    expect(JSON.stringify(schema)).not.toContain('with close:false');
    expect(JSON.stringify(schema)).toContain('omitted close keeps it open');
    expect(JSON.stringify(schema)).toContain('close:true cannot accompany a deal');
    const result = applyProposalCapabilityChoice(f.state, f.world, prepare(f, 'A'), { project, message: { ...message, close: true } }, control);
    expect(result.ok).toBe(true); expect(result.state.conversations[0].status).toBe('closed'); expect(result.state.offers).toHaveLength(0);
  });
});
