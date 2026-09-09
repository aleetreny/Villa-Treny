import { describe, expect, it } from 'vitest';
import { runDebatePilot, type PilotCall } from '../src/debate/pilot';
import { GEMINI_DEBATE_MODEL, type GeminiResult } from '../src/providers/gemini';

const response = (call: PilotCall): GeminiResult => ({ ok: true, code: 'ok', model: GEMINI_DEBATE_MODEL,
  modelVersion: GEMINI_DEBATE_MODEL, responseId: call.id, status: 200,
  usage: { inputTokens: 30, outputTokens: 20, thinkingTokens: 10, totalTokens: 60, complete: true },
  text: 'Synthetic fixture, not a model output.', latencyMs: 1, retryAfterMs: null,
  payload: call.kind === 'question' ? { title: `Synthetic ${call.id}`, context: 'A synthetic context for a mechanical unit test. '.repeat(14),
    question: `What arrangement should the inhabitants of ${call.id} try to create?`, centralTension: 'A fictional test tension' }
    : call.kind === 'review' ? { usable: true, clarity: 4, roomForDisagreement: 4, originality: 3, problem: '' }
      : { body: 'This is an explicitly synthetic post for an isolated mechanics test. '.repeat(15) },
});

describe('Gemini debate pipeline (mock inference only)', () => {
  it('makes 32 separately supplied calls, preserves source records and completes two six-person debates', async () => {
    const calls: PilotCall[] = [];
    const result = await runDebatePilot({ generate: async call => { calls.push(call); return response(call); } });
    expect(result.status).toBe('complete');
    expect(calls).toHaveLength(32);
    expect(result.questions).toHaveLength(6);
    expect(result.debates.map(debate => debate.posts.length)).toEqual([12, 12]);
    expect(result.entries.every(entry => entry.result.responseId === entry.id)).toBe(true);
    for (const debate of result.debates) {
      expect(new Set(debate.posts.filter(post => post.round === 2).map(post => post.replyTo)).size).toBe(6);
    }
  });
  it('stops immediately on authentication failure and never authors a replacement question', async () => {
    let count = 0;
    const result = await runDebatePilot({ generate: async call => {
      count++;
      return { ...response(call), ok: false, code: 'authentication', status: 403, payload: null, text: null };
    } });
    expect(count).toBe(1);
    expect(result.status).toBe('incomplete');
    expect(result.questions[0]?.value).toBeNull();
    expect(result.debates).toEqual([]);
  });
  it('retains invalid questions while continuing other independent domains', async () => {
    const result = await runDebatePilot({ generate: async call => call.id === 'question-1'
      ? { ...response(call), payload: { question: 'Invalid fixture?' } } : response(call) });
    expect(result.status).toBe('incomplete');
    expect(result.questions[0]?.issues).toEqual(['question_schema']);
    expect(result.questions.filter(row => row.value)).toHaveLength(5);
    expect(result.entries[0]?.result.payload).toEqual({ question: 'Invalid fixture?' });
  });
  it('never starts replies to an incomplete independent round', async () => {
    const result = await runDebatePilot({ generate: async call => call.id === 'question-1-opening-C'
      ? { ...response(call), payload: { body: 'Too short' } } : response(call) });
    expect(result.status).toBe('incomplete');
    expect(result.debates[0]?.complete).toBe(false);
    expect(result.entries.filter(entry => entry.id.startsWith('question-1-reply'))).toEqual([]);
    expect(result.debates[1]?.complete).toBe(true);
  });
});
