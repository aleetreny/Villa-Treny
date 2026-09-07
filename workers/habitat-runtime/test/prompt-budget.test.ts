import { describe, expect, it } from 'vitest';
import { MAX_PROMPT_BYTES, packPromptContext, promptBytes } from '../src/prompt-budget';
import type { JsonValue } from '../src/contracts';

describe('prompt packing', () => {
  it('retains earliest obligations and every possible verb within a hard bound', () => {
    const schema: JsonValue = { type: 'object', properties: { verb: { type: 'string' } } };
    const actions = Array.from({ length: 30 }, (_, i) => ({ verb: `action-${i}`, targets: ['B', 'C', 'D', 'E', 'F'] }));
    const context = {
      resident: { id: 'A', name: 'Aleix', wants: 'Repair the refuge', before: 'history '.repeat(500) },
      economy: { obligations: Array.from({ length: 24 }, (_, i) => ({ id: `debt-${i}`, lender: 'A', borrower: 'B', remaining: 4, dueDay: 150 - i, status: 'open' })) },
      possibleActions: actions,
      knownBonds: Array.from({ length: 12 }, () => ({ history: 'long shared history '.repeat(100) })),
      memory: [{ outcome: 'repaired the well' }],
      recentHistory: [{ text: 'repaired the well' }],
      plan: { verb: 'repair', untilWatch: 405 },
      privateKnowledge: Array.from({ length: 11 }, (_, i) => ({ id: `owned-fact-${i}`, learnedDay: 100, source: 'A', text: 'A fact learned through participation.' })),
    };
    const packed = packPromptContext('Select one validated intention.', context, schema);
    const value = JSON.parse(packed);
    expect(promptBytes('Select one validated intention.', packed, schema)).toBeLessThanOrEqual(MAX_PROMPT_BYTES);
    expect(value.possibleActions.map((a: { verb: string }) => a.verb)).toEqual(actions.map((a) => a.verb));
    expect(value.economy.obligations.map((d: { dueDay: number }) => d.dueDay)).toEqual([127, 128, 129, 130]);
    expect(value.economy.obligationSummary).toMatchObject({ count: 24, shown: 4 });
    expect(value.plan).toEqual(context.plan);
    expect(value.privateKnowledge.map((fact: { id: string }) => fact.id)).toEqual(context.privateKnowledge.map((fact) => fact.id));
    expect(packPromptContext('Select one validated intention.', context, schema)).toBe(packed);
  });

  it('counts UTF-8 bytes and refuses an impossible required contract', () => {
    expect(promptBytes('é', '', {})).toBe(6);
    expect(() => packPromptContext('x'.repeat(MAX_PROMPT_BYTES), { possibleActions: [] }, {})).toThrow('byte budget');
  });

  it('keeps the most recent memories before truncating long source arrays', () => {
    const memory = Array.from({ length: 32 }, (_, day) => ({ day, outcome: `event-${day}` }));
    const recentHistory = Array.from({ length: 40 }, (_, day) => ({ day, text: `history-${day}` }));
    const packed = JSON.parse(packPromptContext('Choose.', { memory, recentHistory, possibleActions: [] }, {}));
    expect(packed.memory.map((fact: { day: number }) => fact.day)).toEqual([28, 29, 30, 31]);
    expect(packed.recentHistory.map((fact: { day: number }) => fact.day)).toEqual([37, 38, 39]);
  });
});
