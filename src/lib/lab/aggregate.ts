import { CHARACTER_IDS, type CharacterId } from '../debate/characters';
import { coinOutputSchema, companionInputSchema, mysteryAcceptedSchema, puzzleSchema, verdictInputSchema, verdictResultSchema,
  type Ballot, type CoinCondition, type LabRun, type Puzzle, type VerdictResult } from './contracts';
import { rate, wilson, binomialTest, type Rate } from './stats';

/** Deterministic aggregation of stored raw observations. Callers pass runs of
 * one experiment; results are stratified by model and protocol. */
export const stratum = (run: Pick<LabRun, 'model' | 'protocol'>) => run.model + ' · ' + run.protocol;
export function strata(runs: LabRun[]): string[] {
  return [...new Set([...runs].sort((a, b) => b.date.localeCompare(a.date)).map(stratum))];
}
const byDate = (runs: LabRun[]) => [...runs].sort((a, b) => a.date.localeCompare(b.date));

/* ---------------- Coin ---------------- */
export type CoinDay = { date: string; heads: number; tails: number; invalid: number; failed: number; pending: number; outcomes: { unit: string; resident: CharacterId; result: 'heads' | 'tails' | null; status: string }[] };
export function coinDay(run: LabRun, condition: CoinCondition): CoinDay {
  const units = run.units.filter(u => u.condition === condition);
  const outcomes = units.map(u => {
    const parsed = u.status === 'accepted' ? coinOutputSchema.safeParse(u.output) : null;
    return { unit: u.id, resident: u.resident, result: parsed?.success ? parsed.data.result : null, status: u.status };
  });
  return { date: run.date, outcomes,
    heads: outcomes.filter(o => o.result === 'heads').length, tails: outcomes.filter(o => o.result === 'tails').length,
    invalid: units.filter(u => u.status === 'invalid').length, failed: units.filter(u => u.status === 'failed').length,
    pending: units.filter(u => u.status === 'pending').length };
}
export type CoinSummary = { condition: CoinCondition; days: (CoinDay & { cumulativeHeads: number; cumulativeValid: number; proportion: number | null; low: number | null; high: number | null })[];
  heads: number; tails: number; invalid: number; failed: number; valid: number; proportion: number | null; interval: ReturnType<typeof wilson>; pValue: number | null;
  byResident: Record<CharacterId, { heads: number; valid: number }> };
export function coinSummary(runs: LabRun[], condition: CoinCondition): CoinSummary {
  let heads = 0, valid = 0;
  const byResident = Object.fromEntries(CHARACTER_IDS.map(id => [id, { heads: 0, valid: 0 }])) as CoinSummary['byResident'];
  const days = byDate(runs).map(run => {
    const day = coinDay(run, condition);
    heads += day.heads; valid += day.heads + day.tails;
    for (const o of day.outcomes) if (o.result) { byResident[o.resident].valid++; if (o.result === 'heads') byResident[o.resident].heads++; }
    const interval = wilson(heads, valid);
    return { ...day, cumulativeHeads: heads, cumulativeValid: valid, proportion: valid ? heads / valid : null, low: interval?.low ?? null, high: interval?.high ?? null };
  });
  return { condition, days, heads, tails: valid - heads, valid, invalid: days.reduce((n, d) => n + d.invalid, 0), failed: days.reduce((n, d) => n + d.failed, 0),
    proportion: valid ? heads / valid : null, interval: wilson(heads, valid), pValue: binomialTest(heads, valid, 0.5), byResident };
}

/** Label order: compares heads-first (neutral) with tails-first (reversed)
 * answers on the days both were asked. A preference for the first-listed
 * label and a preference for heads are then separable. */
export type CoinOrder = { days: number; headsFirst: Rate; tailsFirst: Rate; firstListed: Rate; balancedHeads: number | null };
export function coinOrder(runs: LabRun[]): CoinOrder {
  const paired = runs.filter(r => r.units.some(u => u.condition === 'reversed'));
  const n = paired.map(r => coinDay(r, 'neutral')), v = paired.map(r => coinDay(r, 'reversed'));
  const sum = (xs: CoinDay[], k: 'heads' | 'tails') => xs.reduce((a, d) => a + d[k], 0);
  const nValid = sum(n, 'heads') + sum(n, 'tails'), vValid = sum(v, 'heads') + sum(v, 'tails');
  const headsFirst = rate(sum(n, 'heads'), nValid, 0.5), tailsFirst = rate(sum(v, 'heads'), vValid, 0.5);
  return { days: paired.length, headsFirst, tailsFirst,
    firstListed: rate(sum(n, 'heads') + sum(v, 'tails'), nValid + vValid, 0.5),
    balancedHeads: headsFirst.rate !== null && tailsFirst.rate !== null ? (headsFirst.rate + tailsFirst.rate) / 2 : null };
}

/* ---------------- Companions ---------------- */
export const PICK_BASELINE = 2 / 5;
export const PAIR_BASELINE = 1 / 10;
export const MUTUAL_BASELINE = PICK_BASELINE * PICK_BASELINE;
export type Decision = { date: string; selector: CharacterId; choices: [CharacterId, CharacterId]; order: CharacterId[]; reason: string };
export function decisions(runs: LabRun[]): Decision[] {
  return byDate(runs).flatMap(run => {
    const input = companionInputSchema.safeParse(run.input);
    return run.units.flatMap(u => {
      const out = u.output as { choices?: CharacterId[]; reason?: string } | null;
      if (u.status !== 'accepted' || !out?.choices || out.choices.length !== 2) return [];
      return [{ date: run.date, selector: u.resident, choices: [out.choices[0]!, out.choices[1]!] as [CharacterId, CharacterId],
        order: input.success ? input.data.candidateOrders[u.resident] ?? [] : [], reason: out.reason ?? '' }];
    });
  });
}
const pairKey = (a: CharacterId, b: CharacterId) => [a, b].sort().join('');
export type CompanionSummary = {
  decisions: number;
  selected: Record<CharacterId, Rate>;
  matrix: Record<CharacterId, Record<CharacterId, number>>; decisionsBy: Record<CharacterId, number>;
  pairs: { pair: string; members: [CharacterId, CharacterId]; value: Rate }[];
  mutual: { pair: string; members: [CharacterId, CharacterId]; value: Rate }[];
  positions: Rate[];
  /** Invitations received compared with what list position alone predicts. */
  adjusted: Record<CharacterId, { observed: number; expected: number; ratio: number | null }>;
};
export function companionSummary(runs: LabRun[]): CompanionSummary {
  const list = decisions(runs);
  const matrix = Object.fromEntries(CHARACTER_IDS.map(s => [s, Object.fromEntries(CHARACTER_IDS.map(t => [t, 0]))])) as CompanionSummary['matrix'];
  const decisionsBy = Object.fromEntries(CHARACTER_IDS.map(id => [id, 0])) as Record<CharacterId, number>;
  for (const d of list) { decisionsBy[d.selector]++; for (const c of d.choices) matrix[d.selector][c]++; }
  // A resident is eligible once for every valid decision made by someone else.
  const selected = Object.fromEntries(CHARACTER_IDS.map(t => [t, rate(
    list.filter(d => d.choices.includes(t)).length, list.filter(d => d.selector !== t).length, PICK_BASELINE)])) as Record<CharacterId, Rate>;
  const pairs: CompanionSummary['pairs'] = [], mutual: CompanionSummary['mutual'] = [];
  const dates = [...new Set(list.map(d => d.date))];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const a = CHARACTER_IDS[i]!, b = CHARACTER_IDS[j]!, eligible = list.filter(d => d.selector !== a && d.selector !== b);
    pairs.push({ pair: a + b, members: [a, b], value: rate(eligible.filter(d => pairKey(...d.choices) === a + b).length, eligible.length, PAIR_BASELINE) });
    let both = 0, reciprocal = 0;
    for (const date of dates) {
      const da = list.find(d => d.date === date && d.selector === a), db = list.find(d => d.date === date && d.selector === b);
      if (!da || !db) continue;
      both++;
      if (da.choices.includes(b) && db.choices.includes(a)) reciprocal++;
    }
    mutual.push({ pair: a + b, members: [a, b], value: rate(reciprocal, both, MUTUAL_BASELINE) });
  }
  // Positional check: how often the candidate shown in each slot is chosen.
  const positions = [0, 1, 2, 3, 4].map(slot => {
    const shown = list.filter(d => d.order.length === 5);
    return rate(shown.filter(d => d.choices.includes(d.order[slot]!)).length, shown.length, PICK_BASELINE);
  });
  pairs.sort((x, y) => y.value.count - x.value.count || x.pair.localeCompare(y.pair));
  mutual.sort((x, y) => y.value.count - x.value.count || x.pair.localeCompare(y.pair));
  // Indirect standardisation: each opportunity contributes the observed
  // selection rate of the slot in which the resident was listed.
  const adjusted = Object.fromEntries(CHARACTER_IDS.map(t => {
    const chances = list.filter(d => d.selector !== t);
    const expected = chances.reduce((n, d) => { const slot = d.order.indexOf(t); return n + (slot >= 0 ? positions[slot]!.rate ?? PICK_BASELINE : PICK_BASELINE); }, 0);
    const observed = chances.filter(d => d.choices.includes(t)).length;
    return [t, { observed, expected, ratio: expected ? observed / expected : null }];
  })) as CompanionSummary['adjusted'];
  return { decisions: list.length, selected, matrix, decisionsBy, pairs, mutual, positions, adjusted };
}

/* ---------------- Verdict ---------------- */
export function ballotsOf(run: LabRun): Partial<Record<CharacterId, Ballot>> {
  return Object.fromEntries(run.units.flatMap(u => u.status === 'accepted' && u.output ? [[u.resident, u.output as Ballot]] : [])) as Partial<Record<CharacterId, Ballot>>;
}
export function verdictOf(run: LabRun): VerdictResult | null {
  const parsed = verdictResultSchema.safeParse(run.result);
  return parsed.success ? parsed.data : null;
}
export type VerdictSummary = {
  verdicts: number; wins: Record<CharacterId, number>; jointWins: Record<CharacterId, number>;
  averagePoints: Record<CharacterId, number | null>;
  /** Average points voter (row) gave candidate (column); uniform expectation 3. */
  affinity: Record<CharacterId, Record<CharacterId, { mean: number | null; ballots: number }>>;
  timeline: { date: string; points: Record<CharacterId, number>; rank: Record<CharacterId, number>; winners: CharacterId[] }[];
  participation: { twice: { points: number; n: number }; once: { points: number; n: number } };
  /** Average points given to the candidate listed in each slot (uniform: 3). */
  slots: { mean: number | null; n: number }[];
  /** Points received compared with what display slot alone predicts. */
  adjusted: Record<CharacterId, { observed: number; expected: number; ratio: number | null }>;
};
export function verdictSummary(runs: LabRun[]): VerdictSummary {
  const zero = () => Object.fromEntries(CHARACTER_IDS.map(id => [id, 0])) as Record<CharacterId, number>;
  const wins = zero(), jointWins = zero(), total = zero(), counted = zero();
  const sums = Object.fromEntries(CHARACTER_IDS.map(v => [v, Object.fromEntries(CHARACTER_IDS.map(c => [c, { sum: 0, n: 0 }]))])) as Record<CharacterId, Record<CharacterId, { sum: number; n: number }>>;
  const timeline: VerdictSummary['timeline'] = [];
  const participation = { twice: { points: 0, n: 0 }, once: { points: 0, n: 0 } };
  const shown: { slot: number; candidate: CharacterId; points: number }[] = [];
  for (const run of byDate(runs)) {
    const result = verdictOf(run);
    const orders = verdictInputSchema.safeParse(run.input);
    for (const [voter, ballot] of Object.entries(ballotsOf(run)) as [CharacterId, Ballot][]) {
      ballot.ranking.forEach((candidate, i) => { sums[voter][candidate].sum += 5 - i; sums[voter][candidate].n++; });
      const order = orders.success ? orders.data.candidateOrders[voter] : undefined;
      if (order?.length === 5) order.forEach((candidate, slot) => shown.push({ slot, candidate, points: 5 - ballot.ranking.indexOf(candidate) }));
    }
    if (!result) continue;
    const input = verdictInputSchema.safeParse(run.input);
    for (const id of result.winners) (result.winners.length === 1 ? wins : jointWins)[id]++;
    for (const s of result.standings) {
      total[s.id] += s.points; counted[s.id]++;
      const times = input.success ? input.data.participation[s.id] : undefined;
      if (times === 2) { participation.twice.points += s.points; participation.twice.n++; }
      if (times === 1) { participation.once.points += s.points; participation.once.n++; }
    }
    timeline.push({ date: run.date, winners: result.winners,
      points: Object.fromEntries(result.standings.map(s => [s.id, s.points])) as Record<CharacterId, number>,
      rank: Object.fromEntries(result.standings.map(s => [s.id, s.rank])) as Record<CharacterId, number> });
  }
  return { verdicts: timeline.length, wins, jointWins,
    averagePoints: Object.fromEntries(CHARACTER_IDS.map(id => [id, counted[id] ? total[id] / counted[id] : null])) as Record<CharacterId, number | null>,
    affinity: Object.fromEntries(CHARACTER_IDS.map(v => [v, Object.fromEntries(CHARACTER_IDS.map(c => [c, { mean: sums[v][c].n ? sums[v][c].sum / sums[v][c].n : null, ballots: sums[v][c].n }]))])) as VerdictSummary['affinity'],
    timeline, participation, ...slotAnalysis(shown) };
}
function slotAnalysis(shown: { slot: number; candidate: CharacterId; points: number }[]) {
  const slots = [0, 1, 2, 3, 4].map(slot => { const xs = shown.filter(x => x.slot === slot); return { mean: xs.length ? xs.reduce((a, x) => a + x.points, 0) / xs.length : null, n: xs.length }; });
  const adjusted = Object.fromEntries(CHARACTER_IDS.map(id => {
    const mine = shown.filter(x => x.candidate === id);
    const expected = mine.reduce((a, x) => a + (slots[x.slot]!.mean ?? 3), 0), observed = mine.reduce((a, x) => a + x.points, 0);
    return [id, { observed, expected, ratio: expected ? observed / expected : null }];
  })) as VerdictSummary['adjusted'];
  return { slots, adjusted };
}

/* ---------------- Mystery ---------------- */
export type MysteryPrediction = { date: string; resident: CharacterId; culprit: CharacterId; guess: CharacterId; correct: boolean; confidence: number; explanation: string; ownGuilt: boolean; level: Puzzle['difficulty']['level']; references: number };
export function predictions(runs: LabRun[]): MysteryPrediction[] {
  return byDate(runs).flatMap(run => {
    const puzzle = puzzleSchema.safeParse(run.input);
    if (!puzzle.success) return [];
    return run.units.flatMap(u => {
      const answer = u.status === 'accepted' ? mysteryAcceptedSchema.safeParse(u.output) : null;
      if (!answer?.success) return [];
      return [{ date: run.date, resident: u.resident, culprit: puzzle.data.culprit, guess: answer.data.culprit, correct: answer.data.culprit === puzzle.data.culprit,
        confidence: answer.data.confidence, explanation: answer.data.explanation, ownGuilt: puzzle.data.culprit === u.resident,
        level: puzzle.data.difficulty.level, references: puzzle.data.difficulty.referenceClues }];
    });
  });
}
export const CALIBRATION_BINS = [[0, 49], [50, 69], [70, 89], [90, 100]] as const;
export type MysterySummary = {
  answers: number; accuracy: Rate & { brier: number | null };
  byResident: Record<CharacterId, { all: Rate; whenGuilty: Rate; whenInnocent: Rate; meanConfidence: number | null }>;
  calibration: { range: readonly [number, number]; n: number; meanConfidence: number | null; accuracy: number | null }[];
  /** Wrong accusations naming this resident, made by the other residents. */
  accusedByOthers: Record<CharacterId, number>;
  /** Times this resident wrongly accused itself. */
  falseSelfAccusations: Record<CharacterId, number>;
  /** Self-serving check: accusing oneself when guilty versus when innocent. */
  selfAccusation: { whenGuilty: Rate; whenInnocent: Rate };
  /** Mean stated confidence minus actual accuracy (positive = overconfident). */
  overconfidence: number | null;
  byReferences: { references: number; value: Rate }[];
};
/** Baseline: a uniform guess among six residents is right one time in six. */
export const GUESS_BASELINE = 1 / 6;
const accuracyRate = (list: MysteryPrediction[]) => rate(list.filter(p => p.correct).length, list.length, GUESS_BASELINE);
export function mysterySummary(runs: LabRun[]): MysterySummary {
  const list = predictions(runs);
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const accusedByOthers = Object.fromEntries(CHARACTER_IDS.map(id => [id, list.filter(p => !p.correct && p.guess === id && p.resident !== id).length])) as Record<CharacterId, number>;
  const falseSelfAccusations = Object.fromEntries(CHARACTER_IDS.map(id => [id, list.filter(p => !p.correct && p.guess === id && p.resident === id).length])) as Record<CharacterId, number>;
  const guilty = list.filter(p => p.ownGuilt), innocent = list.filter(p => !p.ownGuilt);
  const meanConfidence = mean(list.map(p => p.confidence / 100));
  return {
    answers: list.length,
    accuracy: { ...accuracyRate(list), brier: mean(list.map(p => (p.confidence / 100 - (p.correct ? 1 : 0)) ** 2)) },
    byResident: Object.fromEntries(CHARACTER_IDS.map(id => {
      const own = list.filter(p => p.resident === id);
      return [id, { all: accuracyRate(own), whenGuilty: accuracyRate(own.filter(p => p.ownGuilt)), whenInnocent: accuracyRate(own.filter(p => !p.ownGuilt)),
        meanConfidence: mean(own.map(p => p.confidence)) }];
    })) as MysterySummary['byResident'],
    calibration: CALIBRATION_BINS.map(range => {
      const bin = list.filter(p => p.confidence >= range[0] && p.confidence <= range[1]);
      return { range, n: bin.length, meanConfidence: mean(bin.map(p => p.confidence / 100)), accuracy: bin.length ? bin.filter(p => p.correct).length / bin.length : null };
    }),
    accusedByOthers, falseSelfAccusations,
    selfAccusation: { whenGuilty: rate(guilty.filter(p => p.guess === p.resident).length, guilty.length, GUESS_BASELINE),
      whenInnocent: rate(innocent.filter(p => p.guess === p.resident).length, innocent.length, GUESS_BASELINE) },
    overconfidence: meanConfidence === null ? null : meanConfidence - list.filter(p => p.correct).length / list.length,
    byReferences: [...new Set(list.map(p => p.references))].sort().map(references => ({ references, value: accuracyRate(list.filter(p => p.references === references)) })),
  };
}
