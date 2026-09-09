import { expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { createSocietyState } from './state';
import { prepareSocietyTurn } from './turn';
import { prepareAttentionTurn, applyAttentionCapabilityChoice } from './attention-choice';
import { availableChannelRecipients, channelNeedsReview } from './dialogue';
import { parseSocietyState } from './schema';
import { SOCIETY_LIMITS } from './types';
import type { ResidentId } from '../residents';

it('keeps every unread closure at the retention cap and reclaims only a fully acknowledged channel', () => {
  let world = genesisState(91), state = createSocietyState(world, 1000), now = 2000, sequence = 0;
  const act = (actor: ResidentId, raw: unknown) => {
    const base = prepareSocietyTurn(state, world, actor, { nowMs: now, sequence: ++sequence,
      generation: 0, dialoguePolicy: 'concurrent-v1', maxPromptBytes: 6500 });
    const prepared = prepareAttentionTurn(state, world, base);
    const result = applyAttentionCapabilityChoice(state, world, prepared, raw, { nowMs: now + 1, generation: 0 });
    expect(result.ok, result.code).toBe(true);
    state = result.state; world = result.world; now += 100;
  };
  const project = { mode: 'replace', goal: 'Consider when to speak.', why: 'I make my own decision.', visibility: 'private', steps: [] };
  for (const actor of ['A', 'B', 'W'] as const) act(actor, { attention: { kind: 'private', conversationId: null }, content: { project } });
  for (let n = 0; n < SOCIETY_LIMITS.conversations; n++) act('A', { attention: { kind: 'contact' },
    content: { message: { to: 'B', text: `I am closing consideration ${n}.`, close: true } } });
  expect(state.conversations).toHaveLength(40);
  expect(state.conversations.every(c => channelNeedsReview(c, 'B'))).toBe(true);
  expect(availableChannelRecipients(state, 'W', now)).toEqual([]);
  const original = structuredClone(state.conversations), acknowledged = original[0]!;
  act('B', { attention: { kind: 'private', conversationId: acknowledged.id }, content: {} });
  expect(availableChannelRecipients(state, 'W', now)).toContain('C');
  act('W', { attention: { kind: 'contact' }, content: { message: { to: 'C', text: 'May I speak with you?' } } });
  expect(state.conversations).toHaveLength(40);
  expect(state.conversations.some(c => c.id === acknowledged.id)).toBe(false);
  expect(state.conversations.slice(0, 39)).toEqual(original.slice(1));
  expect(parseSocietyState(state).ok).toBe(true);
}, 20_000);
