import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTER_IDS, type CharacterId } from '../debate/characters';
import { readVotes, readerRecord, saveVote } from '../debate/reader-votes';
import { generatePuzzle } from './mystery';
import type { LabRun, LabUnit } from './contracts';
import { OBSERVATION_COLUMNS, currentModel, labFindings, observationRows, residentRecord, toCsv, type LabHistories } from './findings';

/* Small synthetic histories (tests only). */
const parameters = { temperature: 1, candidateCount: 1, thinkingLevel: 'LOW', maxOutputTokens: 4096, structuredOutput: true as const };
const run = (experiment: LabRun['experiment'], date: string, units: LabUnit[], input: unknown = {}, result: unknown = null, model = 'gemini-3.5-flash-lite'): LabRun => ({
  id: date + '/' + experiment, experiment, date, protocol: 'test', model, parameters, status: 'complete', reason: null,
  createdAt: Date.parse(date), updatedAt: 0, nextAttemptAt: null, input, units, result });
const u = (id: string, resident: CharacterId, output: unknown, status: LabUnit['status'] = 'accepted', condition = 'persona'): LabUnit => ({ id, resident, condition, status, attempts: 1, output, receipts: [] });
const others = (id: CharacterId) => CHARACTER_IDS.filter(o => o !== id);
const empty = (): LabHistories => ({ verdict: [], coin: [], companions: [], mystery: [] });

function coinRun(date: string, model?: string) {
  return run('coin', date, [
    ...CHARACTER_IDS.map((id, i) => u('neutral-' + (i + 1), id, { result: 'heads' }, 'accepted', 'neutral')),
    ...CHARACTER_IDS.map((id, i) => u('reversed-' + (i + 1), id, { result: i === 0 ? 'tails' : 'heads' }, 'accepted', 'reversed')),
    ...CHARACTER_IDS.map(id => u('persona-' + id, id, { result: id === 'A' ? 'tails' : 'heads' })),
  ], {}, null, model);
}

describe('Lab findings', () => {
  it('reports the coin per condition and never pools models', () => {
    const all = { ...empty(), coin: [coinRun('2026-10-20'), coinRun('2026-10-21'), coinRun('2026-10-01', 'older-model')] };
    expect(currentModel(all)).toBe('gemini-3.5-flash-lite');
    const f = labFindings(all);
    expect(f.days).toBe(2); expect(f.since).toBe('2026-10-20'); expect(f.answers).toBe(36);
    expect([f.coin.neutral.heads, f.coin.neutral.valid]).toEqual([12, 12]);
    expect([f.coin.order.tailsFirst.count, f.coin.order.tailsFirst.opportunities]).toEqual([10, 12]);
    expect([f.coin.persona.heads, f.coin.persona.valid]).toEqual([10, 12]);
  });
  it('builds a resident record from every experiment', () => {
    const puzzle = generatePuzzle('2026-10-20');
    const order = Object.fromEntries(CHARACTER_IDS.map(id => [id, others(id)]));
    const all: LabHistories = { ...empty(), coin: [coinRun('2026-10-20')],
      companions: [run('companions', '2026-10-20', CHARACTER_IDS.map(id => u(id, id, { choices: id === 'B' ? ['A', 'C'] : [others(id)[0], 'B' === others(id)[0] ? 'C' : 'B'], reason: '' })), { scenarioVersion: 'v', scenario: 's', candidateOrders: order })],
      mystery: [run('mystery', '2026-10-20', CHARACTER_IDS.map(id => u(id, id, { culprit: id === 'F' ? others(puzzle.culprit)[0] : puzzle.culprit, explanation: 'x', confidence: 90 })), puzzle)] };
    const b = residentRecord(all, 'B');
    expect(b.invited.opportunities).toBe(5);
    expect(b.invited.count).toBe(5);
    expect(b.invited.place).toBe(1);
    expect(b.invites).toEqual({ decisions: 1, favourite: ['A', 'C'], count: 1 });
    expect(b.mystery.accuracy.count).toBe(1); expect(b.mystery.meanConfidence).toBe(90);
    expect(residentRecord(all, 'F').mystery.accuracy.count).toBe(0);
    expect(residentRecord(all, 'A').coin.heads).toMatchObject({ count: 0, opportunities: 1 });
    expect(b.jury.verdicts).toBe(0); expect(b.jury.averagePoints).toBeNull();
  });
  it('exports one row per recorded unit as safe CSV', () => {
    const puzzle = generatePuzzle('2026-10-20');
    const all: LabHistories = { ...empty(), coin: [run('coin', '2026-10-20', [u('neutral-1', 'A', { result: 'heads' }, 'accepted', 'neutral'), u('neutral-2', 'B', null, 'invalid', 'neutral'), u('neutral-3', 'C', null, 'pending', 'neutral')])],
      mystery: [run('mystery', '2026-10-20', [u('A', 'A', { culprit: puzzle.culprit, explanation: '=HYPERLINK("x"), "quoted"', confidence: 70 })], puzzle)] };
    const rows = observationRows(all);
    expect(rows).toHaveLength(3);
    expect(rows.find(r => r.status === 'invalid')!.answer).toBeNull();
    expect(rows.find(r => r.experiment === 'mystery')).toMatchObject({ answer: puzzle.culprit, correct: true, confidence: 70 });
    const csv = toCsv(rows).split('\r\n');
    expect(csv[0]).toBe(OBSERVATION_COLUMNS.join(','));
    expect(csv).toHaveLength(5);
    expect(csv.find(line => line.includes('mystery'))).toContain(`"'=HYPERLINK(""x""), ""quoted"""`);
  });
});

describe('reader votes', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('persists picks locally, ignores corrupt storage and compares with the jury', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    expect(readVotes()).toEqual({});
    saveVote('2026-10-20', 'C'); saveVote('2026-10-21', 'C'); saveVote('2026-10-22', 'A');
    expect(readVotes()).toEqual({ '2026-10-20': 'C', '2026-10-21': 'C', '2026-10-22': 'A' });
    saveVote('2026-10-22', null);
    expect(Object.keys(readVotes())).toEqual(['2026-10-20', '2026-10-21']);
    expect(readerRecord(readVotes(), { '2026-10-20': ['C'], '2026-10-21': ['D', 'E'] })).toEqual({ votes: 2, compared: 2, agreed: 1, favourite: ['C'], favouriteCount: 2 });
    store.set('villa-treny:reader-votes', '{"x":"Z"}');
    expect(readVotes()).toEqual({});
    store.set('villa-treny:reader-votes', 'not json');
    expect(readVotes()).toEqual({});
  });
  it('still works when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(readVotes()).toEqual({});
    expect(() => saveVote('2026-10-20', 'A')).not.toThrow();
  });
});
