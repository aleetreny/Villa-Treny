import { describe, expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { createSocietyState } from './state';
import { latestUnreviewedClosingTurn } from './closing-turn';
import type { Conversation } from './types';

const fixture = () => {
  const state = createSocietyState(genesisState(91), 100);
  state.minds.B.lastSuccessAtMs = 1000;
  const conversation: Conversation = { id: 'conversation:1', participants: ['A', 'B'], revision: 1,
    attentionThrough: [0, 0],
    nextSpeaker: null, status: 'closed', createdAtMs: 1500, expiresAtMs: 86_401_500,
    turns: [{ id: 'turn:2', index: 0, speaker: 'A', text: 'I will leave this exchange here.', atMs: 2000 }] };
  state.conversations.push(conversation);
  return { state, conversation };
};

describe('unreviewed received closing turn', () => {
  it('derives the recipient and actual final text without mutating state or claiming it was read', () => {
    const { state } = fixture(), before = structuredClone(state);
    const closure = latestUnreviewedClosingTurn(state, 'B', 2000);
    expect(closure).toEqual({ conversationId: 'conversation:1', status: 'closed',
      turn: { id: 'turn:2', speaker: 'A', text: 'I will leave this exchange here.', atMs: 2000 } });
    expect(latestUnreviewedClosingTurn(state, 'A', 2000)).toBeUndefined();
    expect(latestUnreviewedClosingTurn(state, 'C', 2000)).toBeUndefined();
    expect(state).toEqual(before);
  });

  it.each(['open', 'expired', 'empty', 'future', 'self-last', 'foreign'] as const)('excludes %s exchanges', (kind) => {
    const { state, conversation } = fixture();
    if (kind === 'open' || kind === 'expired') conversation.status = kind;
    if (kind === 'empty') conversation.turns = [];
    if (kind === 'future') conversation.turns[0]!.atMs = 2001;
    if (kind === 'self-last') conversation.turns[0]!.speaker = 'B';
    if (kind === 'foreign') conversation.participants = ['A', 'C'];
    expect(latestUnreviewedClosingTurn(state, 'B', 2000)).toBeUndefined();
  });

  it('offers only the latest received closure and consumes it after a successful review', () => {
    const { state, conversation } = fixture();
    const newer = structuredClone(conversation);
    newer.id = 'conversation:3'; newer.turns[0]!.id = 'turn:4'; newer.turns[0]!.atMs = 2500;
    state.conversations.unshift(newer);
    expect(latestUnreviewedClosingTurn(state, 'B', 3000)?.turn.id).toBe('turn:4');
    state.minds.B.lastSuccessAtMs = 2500;
    expect(latestUnreviewedClosingTurn(state, 'B', 3000)).toBeUndefined();
    state.minds.B.lastSuccessAtMs = null;
    expect(latestUnreviewedClosingTurn(state, 'B', 3000)?.turn.id).toBe('turn:4');
  });
});
