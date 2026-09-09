import { describe, expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import type { ResidentId } from '../residents';
import { createSocietyState, expireSocietyState } from './state';
import { parseSocietyState } from './schema';
import { societyPublicView } from './public';
import type { Conversation, SocietyState } from './types';

function addChannel(state: SocietyState, participants: [ResidentId, ResidentId] = ['A', 'B']): Conversation {
  const channel: Conversation = { id: `conversation:${state.nextId++}`, participants, revision: 3,
    nextSpeaker: participants[1], status: 'open', createdAtMs: 50, expiresAtMs: 400,
    turns: [100, 200, 300].map((atMs, index) => ({ id: `turn:${state.nextId++}`, index,
      speaker: participants[index % 2]!, text: `Exact original message ${index}.`, atMs })),
    appraisedThrough: [-1, 0], attentionThrough: [0, 0] };
  state.conversations.push(channel);
  return channel;
}
function oldState(current: SocietyState, version: 1 | 2 | 3 = 3) {
  const { records, retrieval, ...base } = current;
  return { ...base, version, conversations: current.conversations.map(channel => {
    const { attentionThrough, ...old } = channel; void attentionThrough; return old;
  }), ...(version >= 2 ? { records } : {}), ...(version === 3 ? { retrieval } : {}) };
}

describe('private per-channel attention codec', () => {
  it.each([1, 2, 3] as const)('strictly upgrades codec%s without rewriting old fields or mutating input', version => {
    const current = createSocietyState(genesisState(), 0), channel = addChannel(current);
    current.minds.A.lastSuccessAtMs = 210;
    current.revision = 17;
    const original = oldState(current, version), saved = JSON.stringify(original);
    const decoded = parseSocietyState(original);
    expect(decoded).toEqual({ ok: true, state: { ...current, conversations: [{ ...channel, attentionThrough: [2, 0] }] } });
    expect(JSON.stringify(original)).toBe(saved);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(parseSocietyState(decoded.state)).toEqual(decoded);
  });

  it('recognizes the closing revision only after the last speech was available', () => {
    const current = createSocietyState(genesisState(), 0), channel = addChannel(current);
    channel.status = 'closed'; channel.nextSpeaker = null;
    current.minds.A.lastSuccessAtMs = 210; current.minds.B.lastSuccessAtMs = 300;
    const decoded = parseSocietyState(oldState(current));
    expect(decoded.ok && decoded.state.conversations[0].attentionThrough).toEqual([2, 3]);
  });

  it('keeps an unseen expiration pending even after the final message was reviewed', () => {
    const world = genesisState();
    let current = createSocietyState(world, 0); addChannel(current);
    current.minds.A.lastSuccessAtMs = 390; current.minds.B.lastSuccessAtMs = 400;
    current = expireSocietyState(current, world, 400);
    const decoded = parseSocietyState(oldState(current));
    expect(decoded.ok && decoded.state.conversations[0].attentionThrough).toEqual([3, 4]);
  });

  it('does not mistake the scheduled expiry for a later actual event after a successful private review', () => {
    const world = genesisState();
    let current = createSocietyState(world, 0); addChannel(current);
    current.minds.A.lastSuccessAtMs = 500; current.minds.B.lastSuccessAtMs = 600;
    current = expireSocietyState(current, world, 600);
    const original = oldState(current), saved = JSON.stringify(original);
    const decoded = parseSocietyState(original);
    expect(decoded.ok && decoded.state.conversations[0].attentionThrough).toEqual([3, 4]);
    expect(JSON.stringify(original)).toBe(saved);
  });

  it('leaves an expiration pending when its exact receipt has left bounded memory', () => {
    const world = genesisState();
    let current = createSocietyState(world, 0); addChannel(current);
    current = expireSocietyState(current, world, 600);
    for (const actor of ['A', 'B'] as const) {
      current.minds[actor].lastSuccessAtMs = 700;
      current.minds[actor].memories = [];
    }
    const decoded = parseSocietyState(oldState(current));
    expect(decoded.ok && decoded.state.conversations[0].attentionThrough).toEqual([3, 3]);
  });

  it.each(['claim', 'interpretation', 'different_channel', 'early_receipt'] as const)('does not use a %s as an expiry receipt', kind => {
    const world = genesisState();
    let current = createSocietyState(world, 0); addChannel(current);
    current = expireSocietyState(current, world, 600);
    current.minds.A.lastSuccessAtMs = 700;
    const receipt = current.minds.A.memories[0];
    if (kind === 'claim' || kind === 'interpretation') receipt.kind = kind;
    else if (kind === 'different_channel') receipt.refs = ['conversation:unrelated'];
    else receipt.createdAtMs = 399;
    const decoded = parseSocietyState(oldState(current));
    expect(decoded.ok && decoded.state.conversations[0].attentionThrough[0]).toBe(3);
  });

  it('does not acknowledge a future interior turn behind an earlier-dated closing turn', () => {
    const current = createSocietyState(genesisState(), 0), channel = addChannel(current);
    channel.status = 'closed'; channel.nextSpeaker = null;
    channel.turns[1].atMs = 900;
    current.minds.A.lastSuccessAtMs = 500;
    const decoded = parseSocietyState(oldState(current));
    expect(decoded.ok && decoded.state.conversations[0].attentionThrough[0]).toBe(1);
  });

  it.each([1, 2, 3] as const)('rejects codec%s overlapping channels before upgrading', version => {
    const current = createSocietyState(genesisState(), 0);
    addChannel(current, ['A', 'B']); addChannel(current, ['C', 'A']);
    expect(parseSocietyState(oldState(current, version))).toEqual({ ok: false, code: 'overlapping_conversation' });
  });

  it.each([1, 2, 3] as const)('rejects attention fields smuggled into legacy codec%s', version => {
    const current = createSocietyState(genesisState(), 0); addChannel(current);
    const original = oldState(current, version);
    expect(parseSocietyState({ ...original, conversations: current.conversations }).ok).toBe(false);
  });

  it('accepts three concurrent channels but refuses a fourth without discarding one', () => {
    const current = createSocietyState(genesisState(), 0);
    addChannel(current, ['A', 'B']); addChannel(current, ['C', 'A']); addChannel(current, ['A', 'D']);
    expect(parseSocietyState(current)).toEqual({ ok: true, state: current });
    addChannel(current, ['E', 'A']);
    const saved = JSON.stringify(current);
    expect(parseSocietyState(current)).toEqual({ ok: false, code: 'conversation_attention_capacity' });
    expect(JSON.stringify(current)).toBe(saved);
  });

  it('treats a reversed participant pair as the same live channel, while retaining closed history', () => {
    const current = createSocietyState(genesisState(), 0);
    const first = addChannel(current, ['A', 'B']); addChannel(current, ['B', 'A']);
    expect(parseSocietyState(current)).toEqual({ ok: false, code: 'duplicate_open_conversation_pair' });
    first.status = 'closed'; first.nextSpeaker = null;
    expect(parseSocietyState(current)).toEqual({ ok: true, state: current });
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])('rejects unsafe attention marker %s', marker => {
    const current = createSocietyState(genesisState(), 0), channel = addChannel(current);
    channel.attentionThrough[0] = marker;
    expect(parseSocietyState(current).ok).toBe(false);
  });

  it('requires both current markers and rejects a marker beyond the exact channel revision', () => {
    const current = createSocietyState(genesisState(), 0), channel = addChannel(current);
    expect(parseSocietyState({ ...oldState(current), version: 4 }).ok).toBe(false);
    channel.attentionThrough = [0, 4];
    expect(parseSocietyState(current)).toEqual({ ok: false, code: 'attention_cursor_ahead_of_conversation' });
    channel.attentionThrough = [3, 3];
    expect(parseSocietyState(current)).toEqual({ ok: true, state: current });
    expect(JSON.stringify(societyPublicView(current))).not.toContain('attentionThrough');
  });
});
