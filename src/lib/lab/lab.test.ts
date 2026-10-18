import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, type CharacterId } from '../debate/characters';
import { binomialPmf, binomialTest, rate, rateReading, wilson } from './stats';
import { headToHead, tally, verdict } from './verdict';
import { FALLBACK_TEMPLATES, SCENARIOS, acceptable, culpritFor, dayNumber, generatePuzzle, rng, shuffle, solve, solveStatements } from './mystery';
import { acceptedOutput, ballotIssues, companionIssues, type Ballot, type LabRun, type LabUnit } from './contracts';
import { MUTUAL_BASELINE, PAIR_BASELINE, PICK_BASELINE, coinSummary, companionSummary, mysterySummary, verdictSummary } from './aggregate';

const dates = (from: string, count: number) => Array.from({ length: count }, (_, i) => new Date(Date.parse(from + 'T12:00:00Z') + i * 86_400_000).toISOString().slice(0, 10));
const others = (id: CharacterId) => CHARACTER_IDS.filter(o => o !== id);

describe('statistics', () => {
  it('computes Wilson intervals against known values', () => {
    const i = wilson(5, 10)!;
    expect(i.low).toBeCloseTo(0.2366, 4); expect(i.high).toBeCloseTo(0.7634, 4);
    expect(wilson(0, 10)!.low).toBe(0); expect(wilson(0, 10)!.high).toBeCloseTo(0.2775, 4);
    expect(wilson(0, 0)).toBeNull(); expect(wilson(11, 10)).toBeNull();
  });
  it('computes exact two-sided binomial tests', () => {
    expect(binomialTest(7, 10)).toBeCloseTo(0.34375, 10);
    expect(binomialTest(9, 10)).toBeCloseTo(0.021484375, 10);
    expect(binomialTest(0, 10)).toBeCloseTo(0.001953125, 10);
    expect(binomialTest(5, 10)).toBeCloseTo(1, 10);
    expect(binomialTest(1, 5, 0.4)).toBeCloseTo(0.6544, 10);
    expect(binomialTest(0, 0)).toBeNull();
    expect([...Array(31).keys()].reduce((n, k) => n + binomialPmf(k, 30, 0.4), 0)).toBeCloseTo(1, 12);
    expect(binomialTest(5000, 10_000)).toBeCloseTo(1, 6);
  });
  it('reads rates cautiously', () => {
    expect(rateReading(rate(3, 5, 0.4))).toBe('too_few');
    expect(rateReading(rate(20, 50, 0.4))).toBe('consistent');
    expect(rateReading(rate(45, 50, 0.4))).toBe('above');
    expect(rateReading(rate(2, 50, 0.4))).toBe('below');
  });
});

/** Cyclic ballots: voter v ranks v+1, v+2 … v+5. Every resident gets 15 points. */
const cyclic = (): Record<CharacterId, Ballot> => Object.fromEntries(CHARACTER_IDS.map((v, i) => [v, { reason: 'Fixture ballot.', ranking: [1, 2, 3, 4, 5].map(k => CHARACTER_IDS[(i + k) % 6]!) }])) as Record<CharacterId, Ballot>;
const randomBallots = (random: () => number) => Object.fromEntries(CHARACTER_IDS.map(v => [v, { reason: 'Fixture ballot.', ranking: shuffle(others(v), random) }])) as Record<CharacterId, Ballot>;
describe('the verdict', () => {
  it('validates ballots: five distinct eligible IDs, no self votes or duplicates', () => {
    expect(ballotIssues('A', { ranking: ['B', 'C', 'D', 'E', 'F'], reason: 'Bex was clearest.' })).toEqual([]);
    expect(ballotIssues('A', { ranking: ['A', 'C', 'D', 'E', 'F'], reason: 'Ama was clearest.' })).toEqual(['self_vote']);
    expect(ballotIssues('A', { ranking: ['B', 'B', 'D', 'E', 'F'], reason: 'Bex was clearest.' })).toEqual(['duplicate_ranking']);
    expect(ballotIssues('A', { ranking: ['B', 'C', 'D', 'E'], reason: 'Bex was clearest.' })).toEqual(['ballot_schema']);
    expect(ballotIssues('A', { ranking: ['B', 'C', 'D', 'E', 'G'], reason: 'Bex was clearest.' })).toEqual(['ballot_schema']);
    // A missing or empty note never invalidates a complete, valid ranking.
    expect(ballotIssues('A', { ranking: ['B', 'C', 'D', 'E', 'F'] })).toEqual([]);
    expect(ballotIssues('A', { ranking: ['B', 'C', 'D', 'E', 'F'], reason: '' })).toEqual([]);
  });
  it('totals Borda points and needs all six ballots', () => {
    const ballots = cyclic();
    ballots.A = { reason: 'Swap.', ranking: ['C', 'B', 'D', 'E', 'F'] };
    const result = verdict(ballots)!;
    expect(Object.fromEntries(result.standings.map(s => [s.id, s.points]))).toEqual({ A: 15, B: 14, C: 16, D: 15, E: 15, F: 15 });
    expect(result.winners).toEqual(['C']); expect(result.standings[0]).toMatchObject({ id: 'C', rank: 1, decidedBy: 'points' });
    expect(result.standings.reduce((n, s) => n + s.points, 0)).toBe(6 * 15);
    expect(verdict({ ...ballots, F: undefined })).toBeNull();
  });
  it('reports joint winners for a perfect tie instead of inventing a distinction', () => {
    const result = verdict(cyclic())!;
    expect(result.winners).toEqual([...CHARACTER_IDS]);
    expect(result.standings.every(s => s.rank === 1 && s.decidedBy === 'joint')).toBe(true);
    expect(result.tieNote).toMatch(/joint/);
  });
  it('applies the predefined tie-break order on many random juries', () => {
    const random = rng(42);
    let firstsCases = 0, headCases = 0;
    for (let n = 0; n < 4000; n++) {
      const ballots = randomBallots(random), result = verdict(ballots)!, t = tally(ballots);
      // Points recomputed independently.
      for (const s of result.standings) expect(s.points).toBe(t.find(x => x.id === s.id)!.points);
      for (let i = 1; i < 6; i++) {
        const a = result.standings[i - 1]!, b = result.standings[i]!;
        expect(a.points).toBeGreaterThanOrEqual(b.points);
        if (a.points === b.points && a.rank < b.rank && a.firsts !== b.firsts) { expect(a.firsts).toBeGreaterThan(b.firsts); firstsCases++; }
        if (a.points === b.points && a.firsts === b.firsts && a.rank < b.rank && result.standings.filter(s => s.points === a.points).length === 2) {
          const ab = headToHead(ballots, a.id, b.id), ba = headToHead(ballots, b.id, a.id);
          if (ab !== ba) { expect(ab).toBeGreaterThan(ba); headCases++; }
        }
        if (a.rank === b.rank) expect([a.points, a.firsts, ...a.positions]).toEqual([b.points, b.firsts, ...b.positions]);
      }
      expect(result.winners).toEqual(result.standings.filter(s => s.rank === 1).map(s => s.id));
    }
    expect(firstsCases).toBeGreaterThan(50); expect(headCases).toBeGreaterThan(20);
  });
  it('counts head-to-head only among neutral voters', () => {
    const ballots = cyclic();
    // A and B vote for themselves' rivals; only C–F decide A versus B.
    expect(headToHead(ballots, 'A', 'B') + headToHead(ballots, 'B', 'A')).toBe(4);
  });
});

describe('the Villa Liar generator', () => {
  const years = dates('2026-10-01', 3 * 366);
  it('publishes exactly one logically valid culprit on every date', () => {
    for (const date of years) {
      const p = generatePuzzle(date);
      expect(p.solutions).toEqual([p.culprit]);
      expect(solveStatements(p.statements)).toEqual([p.culprit]);
      expect(p.statements.map(s => s.speaker)).toEqual([...CHARACTER_IDS]);
      expect(p.difficulty.minimalClues).toBe(3);
      // The culprit's statement is false, the five others are true.
      for (const s of p.statements) expect(s.truthSet.includes(p.culprit)).toBe(s.speaker !== p.culprit);
      expect(p.explanation).toHaveLength(6);
    }
  });
  it('is deterministic and balances culprits exactly in every six-day block', () => {
    expect(generatePuzzle('2026-10-18')).toEqual(generatePuzzle('2026-10-18'));
    const start = years.findIndex(d => dayNumber(d) % 6 === 0);
    for (let i = start; i + 6 <= years.length; i += 6) expect(new Set(years.slice(i, i + 6).map(culpritFor)).size).toBe(6);
    const counts = Object.fromEntries(CHARACTER_IDS.map(id => [id, years.filter(d => culpritFor(d) === id).length]));
    // Only the partial blocks at either end of the window can differ.
    expect(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts))).toBeLessThanOrEqual(2);
  });
  it('renders statements whose wording matches their formal truth sets', () => {
    const name: Record<string, CharacterId> = { Ama: 'A', Bex: 'B', Cato: 'C', Dima: 'D', Edda: 'E', Ferran: 'F' };
    const read = (speaker: CharacterId, text: string): CharacterId[] => {
      const who = (w: string) => w === 'I' || w === 'me' ? speaker : name[w]!;
      const not = (...ids: CharacterId[]) => CHARACTER_IDS.filter(c => !ids.includes(c));
      const patterns: [RegExp, (ids: CharacterId[]) => CharacterId[]][] = [
        [/^(\w+) did not take it\.$/, ids => not(...ids)], [/^(\w+) took it\.$/, ids => ids], [/^(\w+) is lying\.$/, ids => ids],
        [/^(\w+) is telling the truth\.$/, ids => not(...ids)], [/^It was either (\w+) or (\w+)\.$/, ids => ids],
        [/^If it wasn’t (\w+), then it was (\w+)\.$/, ids => ids], [/^Neither (\w+) nor (\w+) took it\.$/, ids => not(...ids)],
        [/^It was one of (\w+), (\w+) and (\w+)\.$/, ids => ids]];
      for (const [pattern, meaning] of patterns) {
        const match = text.match(pattern);
        if (match) return meaning(match.slice(1).map(who));
      }
      throw new Error('Unrecognised statement: ' + text);
    };
    for (const date of years.slice(0, 400)) for (const s of generatePuzzle(date).statements) expect(read(s.speaker, s.text).sort()).toEqual([...s.truthSet].sort());
  });
  it('rejects inconsistent and ambiguous statement sets', () => {
    const none = [0, 1, 2, 3, 4, 5].map(speaker => ({ speaker, kind: 'accuse' as const, subjects: [(speaker + 1) % 6] }));
    expect(solve(none)).toEqual([]); expect(acceptable(none)).toBe(false);
    const all = [0, 1, 2, 3, 4, 5].map(speaker => ({ speaker, kind: 'innocent' as const, subjects: [speaker] }));
    expect(solve(all)).toHaveLength(6); expect(acceptable(all)).toBe(false);
    expect(solveStatements([])).toEqual([]);
  });
  it('keeps tested fallback templates valid', () => {
    for (const template of FALLBACK_TEMPLATES) expect(acceptable(template)).toBe(true);
    expect(SCENARIOS.length).toBeGreaterThan(3);
  });
  it('lets a resident be the culprit of its own puzzle', () => {
    for (const id of CHARACTER_IDS) expect(years.some(d => generatePuzzle(d).culprit === id)).toBe(true);
  });
});

/* ---------- aggregation with small synthetic runs (tests only) ---------- */
const parameters = { temperature: 1, candidateCount: 1, thinkingLevel: 'LOW', maxOutputTokens: 4096, structuredOutput: true as const };
const run = (experiment: LabRun['experiment'], date: string, units: LabUnit[], input: unknown = {}, result: unknown = null): LabRun => ({
  id: date + '/' + experiment, experiment, date, protocol: 'test', model: 'gemini-3.5-flash-lite', parameters, status: 'complete', reason: null,
  createdAt: 0, updatedAt: 0, nextAttemptAt: null, input, units, result });
const u = (id: string, resident: CharacterId, output: unknown, status: LabUnit['status'] = 'accepted', condition = 'persona'): LabUnit => ({ id, resident, condition, status, attempts: 1, output, receipts: [] });

describe('aggregation', () => {
  it('counts coin outcomes per condition without pooling, and tracks invalid answers separately', () => {
    const r = run('coin', '2026-10-18', [
      u('neutral-1', 'A', { result: 'heads' }, 'accepted', 'neutral'), u('neutral-2', 'B', { result: 'heads' }, 'accepted', 'neutral'),
      u('neutral-3', 'C', { result: 'tails' }, 'accepted', 'neutral'), u('neutral-4', 'D', null, 'invalid', 'neutral'),
      u('neutral-5', 'E', null, 'failed', 'neutral'), u('neutral-6', 'F', { result: 'heads' }, 'accepted', 'neutral'),
      u('persona-A', 'A', { result: 'tails' }), u('persona-B', 'B', { result: 'tails' })]);
    const neutral = coinSummary([r, { ...r, id: 'x', date: '2026-10-19' }], 'neutral');
    expect([neutral.heads, neutral.tails, neutral.invalid, neutral.failed, neutral.valid]).toEqual([6, 2, 2, 2, 8]);
    expect(neutral.days.map(d => d.cumulativeValid)).toEqual([4, 8]);
    expect(neutral.pValue).toBeCloseTo(binomialTest(6, 8)!, 12);
    const persona = coinSummary([r], 'persona');
    expect([persona.heads, persona.tails]).toEqual([0, 2]);
  });
  it('uses the correct opportunity denominators for companions', () => {
    const order = Object.fromEntries(CHARACTER_IDS.map(id => [id, others(id)]));
    const choose: Record<CharacterId, [CharacterId, CharacterId]> = { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'], D: ['B', 'C'], E: ['B', 'C'], F: ['A', 'B'] };
    const runs = dates('2026-10-18', 2).map(date => run('companions', date, CHARACTER_IDS.map(id => u(id, id, { choices: choose[id], reason: 'Fixture.' })), { scenarioVersion: 'v', scenario: 's', candidateOrders: order }));
    const s = companionSummary(runs);
    expect(s.decisions).toBe(12);
    // B is chosen by A, C, D, E and F: five of the five other decisions per day.
    expect(s.selected.B).toMatchObject({ count: 10, opportunities: 10, baseline: PICK_BASELINE });
    expect(s.selected.F).toMatchObject({ count: 0, opportunities: 10 });
    expect(s.matrix.A.B).toBe(2); expect(s.matrix.A.A).toBe(0); expect(s.decisionsBy.A).toBe(2);
    // Pair BC: chosen by A, D and E; eligible selectors are A, D, E, F (not B or C).
    expect(s.pairs.find(p => p.pair === 'BC')!.value).toMatchObject({ count: 6, opportunities: 8, baseline: PAIR_BASELINE });
    // Mutual A–B: A picks B and B picks A on both days.
    expect(s.mutual.find(p => p.pair === 'AB')!.value).toMatchObject({ count: 2, opportunities: 2, baseline: MUTUAL_BASELINE });
    expect(s.mutual.find(p => p.pair === 'DE')!.value.count).toBe(0);
    expect(s.positions.reduce((n, p) => n + p.count, 0)).toBe(24);
    expect(companionIssues('A', { choices: ['A', 'B'], reason: 'Fixture.' })).toEqual(['self_selection']);
    expect(companionIssues('A', { choices: ['B', 'B'], reason: 'Fixture.' })).toEqual(['duplicate_choice']);
    expect(companionIssues('A', { choices: ['B'], reason: 'Fixture.' })).toEqual(['companion_schema']);
    // Regression from production (18 October): valid choices with an empty reason.
    expect(companionIssues('C', { choices: ['B', 'D'], reason: '' })).toEqual([]);
    expect(acceptedOutput('companions', 'C', { choices: ['B', 'D'], reason: '' })).toEqual({ choices: ['B', 'D'], reason: '' });
    expect(acceptedOutput('mystery', 'A', { culprit: 'B', explanation: '', confidence: 80 })).toMatchObject({ culprit: 'B', confidence: 80 });
    expect(() => acceptedOutput('mystery', 'A', { culprit: 'B', explanation: 'x', confidence: 101 })).toThrow();
  });
  it('summarises mystery accuracy, calibration and own-guilt cases', () => {
    const puzzle = generatePuzzle('2026-10-18'), culprit = puzzle.culprit, wrong = others(culprit)[0]!;
    const units = CHARACTER_IDS.map((id, i) => u(id, id, { culprit: i < 3 ? culprit : wrong, explanation: 'Fixture explanation.', confidence: i < 3 ? 90 : 60 }));
    const s = mysterySummary([run('mystery', '2026-10-18', units, puzzle)]);
    expect(s.answers).toBe(6); expect(s.accuracy.count).toBe(3);
    expect(s.accuracy.brier).toBeCloseTo((3 * 0.01 + 3 * 0.36) / 6, 10);
    expect(s.falseAccusations[wrong]).toBe(3);
    expect(s.byResident[culprit].whenGuilty.opportunities).toBe(1);
    expect(s.calibration.find(b => b.range[0] === 90)).toMatchObject({ n: 3, accuracy: 1 });
  });
  it('summarises verdict wins, average points and the affinity matrix', () => {
    const ballots = cyclic(); ballots.A = { reason: 'Swap.', ranking: ['C', 'B', 'D', 'E', 'F'] };
    const r = run('verdict', '2026-10-18', CHARACTER_IDS.map(id => u(id, id, ballots[id])), { debateId: '2026-10-18', debateProtocol: 'villa-debate-v6', method: 'borda-5-4-3-2-1-v1',
      participation: { A: 2, B: 2, C: 2, D: 1, E: 1, F: 1 }, firstTurn: { A: 1, B: 2, C: 4, D: 5, E: 6, F: 8 }, candidateOrders: Object.fromEntries(CHARACTER_IDS.map(id => [id, others(id)])) }, verdict(ballots));
    const s = verdictSummary([r]);
    expect(s.wins.C).toBe(1); expect(s.averagePoints.C).toBe(16);
    expect(s.affinity.A.C).toEqual({ mean: 5, ballots: 1 }); expect(s.affinity.A.A).toEqual({ mean: null, ballots: 0 });
    expect(s.participation.twice).toEqual({ points: 15 + 14 + 16, n: 3 });
  });
});
