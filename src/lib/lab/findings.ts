import { CHARACTER_IDS, type CharacterId } from '../debate/characters';
import { LAB_EXPERIMENTS, companionInputSchema, verdictInputSchema, type LabExperiment, type LabRun } from './contracts';
import { coinOrder, coinSummary, companionSummary, mysterySummary, predictions, verdictOf, verdictSummary, type CoinOrder, type CoinSummary } from './aggregate';
import { rate, type Rate } from './stats';

/** Cross-experiment readings of the stored Lab history: the headline findings,
 * one resident's record and a flat export. Everything is recomputed from raw
 * stored answers by the deterministic functions in aggregate.ts. */
export type LabHistories = Record<LabExperiment, LabRun[]>;

/** The model of the most recent run. Findings never pool different models. */
export function currentModel(all: LabHistories): string | null {
  const runs = LAB_EXPERIMENTS.flatMap(e => all[e]).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return runs[0]?.model ?? null;
}
export function forModel(all: LabHistories, model: string | null): LabHistories {
  return Object.fromEntries(LAB_EXPERIMENTS.map(e => [e, all[e].filter(r => r.model === model)])) as LabHistories;
}
const accepted = (runs: LabRun[]) => runs.reduce((n, r) => n + r.units.filter(u => u.status === 'accepted').length, 0);

export type Findings = {
  model: string | null; answers: number; days: number; since: string | null;
  coin: { order: CoinOrder; neutral: CoinSummary; persona: CoinSummary };
  /** Share chosen by the slot a companion candidate was listed in (chance 40%). */
  companions: { decisions: number; positions: Rate[] };
  /** Average jury points by display slot (uniform 3) and by number of turns spoken. */
  verdict: { verdicts: number; slots: { mean: number | null; n: number }[]; twice: { mean: number | null; n: number }; once: { mean: number | null; n: number } };
  mystery: { answers: number; accuracy: Rate; meanConfidence: number | null; overconfidence: number | null };
};
export function labFindings(everything: LabHistories): Findings {
  const model = currentModel(everything), all = forModel(everything, model);
  const dates = [...new Set(LAB_EXPERIMENTS.flatMap(e => all[e].map(r => r.date)))].sort();
  const companions = companionSummary(all.companions), verdict = verdictSummary(all.verdict), mystery = mysterySummary(all.mystery);
  const mean = (p: { points: number; n: number }) => ({ mean: p.n ? p.points / p.n : null, n: p.n });
  return {
    model, answers: LAB_EXPERIMENTS.reduce((n, e) => n + accepted(all[e]), 0), days: dates.length, since: dates[0] ?? null,
    coin: { order: coinOrder(all.coin), neutral: coinSummary(all.coin, 'neutral'), persona: coinSummary(all.coin, 'persona') },
    companions: { decisions: companions.decisions, positions: companions.positions },
    verdict: { verdicts: verdict.verdicts, slots: verdict.slots, twice: mean(verdict.participation.twice), once: mean(verdict.participation.once) },
    mystery: { answers: mystery.answers, accuracy: mystery.accuracy,
      meanConfidence: mystery.overconfidence === null || mystery.accuracy.rate === null ? null : mystery.overconfidence + mystery.accuracy.rate,
      overconfidence: mystery.overconfidence },
  };
}

/* ---------------- One resident across the four experiments ---------------- */
export type ResidentRecord = {
  jury: { verdicts: number; wins: number; jointWins: number; averagePoints: number | null; place: number | null };
  invited: Rate & { place: number | null };
  invites: { decisions: number; favourite: CharacterId[]; count: number };
  mystery: { accuracy: Rate; meanConfidence: number | null };
  coin: { heads: Rate; closestToFair: boolean };
};
/** 1-based place among the six by a value (higher is better); ties share a place. */
function place(values: Record<CharacterId, number | null>, id: CharacterId): number | null {
  const mine = values[id];
  return mine === null ? null : 1 + CHARACTER_IDS.filter(o => (values[o] ?? -Infinity) > mine).length;
}
export function residentRecord(everything: LabHistories, id: CharacterId): ResidentRecord {
  const all = forModel(everything, currentModel(everything));
  const verdict = verdictSummary(all.verdict), companions = companionSummary(all.companions), mystery = mysterySummary(all.mystery);
  const persona = coinSummary(all.coin, 'persona');
  const row = companions.matrix[id], top = Math.max(0, ...CHARACTER_IDS.map(o => row[o]));
  const distance = (o: CharacterId) => persona.byResident[o].valid ? Math.abs(persona.byResident[o].heads / persona.byResident[o].valid - 0.5) : Infinity;
  const fairest = Math.min(...CHARACTER_IDS.map(distance));
  return {
    jury: { verdicts: verdict.timeline.filter(t => t.points[id] !== undefined).length, wins: verdict.wins[id], jointWins: verdict.jointWins[id],
      averagePoints: verdict.averagePoints[id], place: place(verdict.averagePoints, id) },
    invited: { ...companions.selected[id], place: place(Object.fromEntries(CHARACTER_IDS.map(o => [o, companions.selected[o].rate])) as Record<CharacterId, number | null>, id) },
    invites: { decisions: companions.decisionsBy[id], favourite: top ? CHARACTER_IDS.filter(o => row[o] === top) : [], count: top },
    mystery: { accuracy: mystery.byResident[id].all, meanConfidence: mystery.byResident[id].meanConfidence },
    coin: { heads: rate(persona.byResident[id].heads, persona.byResident[id].valid, 0.5), closestToFair: Number.isFinite(fairest) && distance(id) === fairest },
  };
}

/* ---------------- Flat export ---------------- */
export const OBSERVATION_COLUMNS = ['date', 'experiment', 'protocol', 'model', 'condition', 'unit', 'resident', 'status', 'attempts', 'answer', 'shown_order', 'correct', 'confidence', 'jury_points', 'note'] as const;
export type ObservationRow = Record<typeof OBSERVATION_COLUMNS[number], string | number | boolean | null>;
/** One row per recorded unit (pending units are not observations yet). */
export function observationRows(all: LabHistories): ObservationRow[] {
  const rows: ObservationRow[] = [];
  for (const experiment of LAB_EXPERIMENTS) for (const run of [...all[experiment]].sort((a, b) => a.date.localeCompare(b.date))) {
    const orders = experiment === 'verdict' ? verdictInputSchema.safeParse(run.input) : experiment === 'companions' ? companionInputSchema.safeParse(run.input) : null;
    const solved = experiment === 'mystery' ? predictions([run]) : [];
    const standings = experiment === 'verdict' ? verdictOf(run)?.standings ?? [] : [];
    for (const u of run.units) {
      if (u.status === 'pending') continue;
      const out = (u.status === 'accepted' ? u.output : null) as { result?: string; ranking?: string[]; choices?: string[]; culprit?: string; confidence?: number; reason?: string; explanation?: string } | null;
      const answer = out?.result ?? out?.ranking?.join('>') ?? out?.choices?.join('+') ?? out?.culprit ?? null;
      const order = orders?.success ? orders.data.candidateOrders[u.resident] : undefined;
      const prediction = solved.find(p => p.resident === u.resident);
      rows.push({ date: run.date, experiment, protocol: run.protocol, model: run.model, condition: u.condition, unit: u.id, resident: u.resident, status: u.status, attempts: u.attempts,
        answer, shown_order: order?.join('') ?? null, correct: experiment === 'mystery' && out ? prediction?.correct ?? null : null,
        confidence: out?.confidence ?? null, jury_points: standings.find(s => s.id === u.resident)?.points ?? null, note: out?.reason ?? out?.explanation ?? null });
    }
  }
  return rows;
}
/** RFC 4180 CSV. Text that a spreadsheet would read as a formula is prefixed with an apostrophe. */
export function toCsv(rows: ObservationRow[]): string {
  const cell = (value: ObservationRow[keyof ObservationRow]) => {
    if (value === null) return '';
    let text = String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  return [OBSERVATION_COLUMNS.join(','), ...rows.map(r => OBSERVATION_COLUMNS.map(c => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}
