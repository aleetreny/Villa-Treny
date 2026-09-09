import { describe, expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { createSocietyState } from './state';
import { societyPublicView } from './public';
import { isAgencySnapshot } from '../agency';

describe('explicit public society projection', () => {
  it('keeps three channels with one reply count and excludes private attention state', () => {
    const state = createSocietyState(genesisState(91), 1000);
    for (const [speaker, ordinal] of [['B', 1], ['C', 2], ['D', 3]] as const) state.conversations.push({
      id: `conversation:${ordinal}`, participants: [speaker, 'A'], revision: 1, attentionThrough: [0, 0],
      nextSpeaker: 'A', status: 'open', createdAtMs: 1100, expiresAtMs: 5000,
      turns: [{ id: `turn:${ordinal + 3}`, index: 0, speaker, text: `${speaker} has a separate proposal.`, atMs: 1100 }],
    });
    Object.assign(state.conversations[0]!, { attentionThrough: [1, 0], privateAttentionReason: 'PRIVATE_ATTENTION_REASON' });
    Object.assign(state.minds.A, { chosenAttention: 'PRIVATE_ATTENTION_SELECTION' });
    const original = structuredClone(state), view = societyPublicView(state);
    expect(isAgencySnapshot(view)).toBe(true);
    expect(view.version).toBe(2);
    expect(view.conversations).toHaveLength(3);
    expect(view.coverage.waitingForReply).toEqual(['A']);
    expect(JSON.stringify(view)).not.toContain('attentionThrough');
    expect(JSON.stringify(view)).not.toContain('PRIVATE_ATTENTION');
    expect(state).toEqual(original);
  });

  it('does not spread unknown private fields from an economic offer or agreement into public records', () => {
    const state = createSocietyState(genesisState(91), 1000);
    const terms = { kind: 'transfer' as const, from: 'A' as const, to: 'B' as const, cells: 2, privateReason: 'PRIVATE_TERMS_REASON' };
    state.offers = [{ id: 'offer:1', conversationId: 'conversation:1', proposer: 'A', counterpart: 'B',
      terms, status: 'accepted', replaces: null, createdAtMs: 1100, expiresAtWatch: 433, acceptedAtMs: 1200 }];
    state.agreements = [{ id: 'agreement:1', offerId: 'offer:1', terms, status: 'fulfilled',
      acceptedAtMs: 1200, acceptedAtWatch: 400, acceptedAfterEventSequence: 0, progress: 0,
      completedAtMs: 1200, debtId: null, evidenceIds: [] }];
    const original = structuredClone(state), view = societyPublicView(state);
    expect(isAgencySnapshot(view)).toBe(true);
    expect(view.offers[0].terms).toEqual({ kind: 'transfer', from: 'A', to: 'B', cells: 2 });
    expect(view.agreements[0].terms).toEqual(view.offers[0].terms);
    expect(JSON.stringify(view)).not.toContain('PRIVATE_TERMS_REASON');
    expect(state).toEqual(original);
  });
});
