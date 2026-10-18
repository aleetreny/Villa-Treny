import { CHARACTER_IDS, type CharacterId } from '../../../../src/lib/debate/characters';
import { CONVERSATION_TURNS, type DailyCase, type DailyPost } from '../../../../src/lib/debate/contracts';
import { BORDA_METHOD, LAB_PROTOCOLS, ballotIssues, coinOutputSchema, companionInputSchema, companionIssues, mysteryAnswerSchema, puzzleSchema, verdictInputSchema,
  type Ballot, type LabExperiment, type LabRun, type LabUnit, type Receipt, type RunStatus } from '../../../../src/lib/lab/contracts';
import { dayNumber, generatePuzzle, rng, seedOf, shuffle, solveStatements } from '../../../../src/lib/lab/mystery';
import { verdict } from '../../../../src/lib/lab/verdict';
import { ballotsOf } from '../../../../src/lib/lab/aggregate';
import type { GeminiModel, GeminiPrompt, GeminiResult } from '../providers/gemini';
import { COIN_INSTRUCTION, COMPANION_SCENARIO, COMPANION_SCENARIO_VERSION, THINKING, coinPrompt, companionPrompt, maxOutput, mysteryPrompt, verdictPrompt } from './prompts';

export const UNIT_ATTEMPT_CAP = 3;
/** Independent per-run budgets; each counts every charged attempt. */
export const RUN_ATTEMPT_CAP: Record<LabExperiment, number> = { verdict: 12, coin: 18, companions: 12, mystery: 12 };
/** Codes where the model returned content that is not a valid answer. */
const CONTENT_CODES = ['invalid_json', 'truncated', 'blocked'];
const FATAL_CODES = ['authentication', 'missing_key', 'unexpected_model', 'invalid_request'];

/** Systematic rotation: over five consecutive days each candidate appears once
 * in every position for each chooser. The order is stored with the run. */
export function rotatedCandidates(date: string, chooser: CharacterId): CharacterId[] {
  const others = CHARACTER_IDS.filter(id => id !== chooser);
  const offset = ((dayNumber(date) + CHARACTER_IDS.indexOf(chooser)) % 5 + 5) % 5;
  return [...others.slice(offset), ...others.slice(0, offset)];
}
const unit = (id: string, resident: CharacterId, condition: string): LabUnit => ({ id, resident, condition, status: 'pending', attempts: 0, output: null, receipts: [] });
function base(experiment: LabExperiment, date: string, model: GeminiModel, now: number, input: unknown, units: LabUnit[]): LabRun {
  return { id: date + '/' + experiment, experiment, date, protocol: LAB_PROTOCOLS[experiment], model,
    parameters: { temperature: 1, candidateCount: 1, thinkingLevel: THINKING[experiment], maxOutputTokens: maxOutput(model), structuredOutput: true },
    status: 'running', reason: null, createdAt: now, updatedAt: now, nextAttemptAt: now, input, units, result: null };
}

export function newCoinRun(date: string, model: GeminiModel, now: number): LabRun {
  // Randomness only decides which portrait displays each neutral answer.
  const portraits = shuffle(CHARACTER_IDS, rng(seedOf('coin-portraits:' + date)));
  const units = CHARACTER_IDS.flatMap((id, i) => [unit('neutral-' + (i + 1), portraits[i]!, 'neutral'), unit('persona-' + id, id, 'persona')]);
  return base('coin', date, model, now, { promptVersion: LAB_PROTOCOLS.coin + ':' + COIN_INSTRUCTION, conditions: ['neutral', 'persona'],
    portraits: Object.fromEntries(portraits.map((id, i) => ['neutral-' + (i + 1), id])) }, units);
}
export function newCompanionRun(date: string, model: GeminiModel, now: number): LabRun {
  return base('companions', date, model, now, { scenarioVersion: COMPANION_SCENARIO_VERSION, scenario: COMPANION_SCENARIO,
    candidateOrders: Object.fromEntries(CHARACTER_IDS.map(id => [id, rotatedCandidates(date, id)])) }, CHARACTER_IDS.map(id => unit(id, id, 'persona')));
}
export function newMysteryRun(date: string, model: GeminiModel, now: number): LabRun {
  const puzzle = generatePuzzle(date);
  // Never publish a puzzle whose independent check is not a single culprit.
  if (solveStatements(puzzle.statements).join() !== puzzle.culprit) throw new Error('invalid_puzzle');
  return base('mystery', date, model, now, puzzle, CHARACTER_IDS.map(id => unit(id, id, 'persona')));
}
export type CompletedDebate = { id: string; protocol: string; case: DailyCase; posts: DailyPost[] };
export function newVerdictRun(debate: CompletedDebate, model: GeminiModel, now: number): LabRun {
  if (debate.posts.length !== CONVERSATION_TURNS) throw new Error('incomplete_debate');
  return base('verdict', debate.id, model, now, { debateId: debate.id, debateProtocol: debate.protocol, method: BORDA_METHOD,
    participation: Object.fromEntries(CHARACTER_IDS.map(id => [id, debate.posts.filter(p => p.author === id).length])),
    firstTurn: Object.fromEntries(CHARACTER_IDS.map(id => { const i = debate.posts.findIndex(p => p.author === id); return [id, i < 0 ? null : i + 1]; })),
    candidateOrders: Object.fromEntries(CHARACTER_IDS.map(id => [id, rotatedCandidates(debate.id, id)])) }, CHARACTER_IDS.map(id => unit(id, id, 'persona')));
}

export function promptFor(run: LabRun, u: LabUnit, debate?: CompletedDebate | null): GeminiPrompt {
  const model = run.model as GeminiModel;
  if (run.experiment === 'coin') return coinPrompt(u.condition as 'neutral' | 'persona', u.resident, model);
  if (run.experiment === 'companions') return companionPrompt(u.resident, companionInputSchema.parse(run.input).candidateOrders[u.resident]!, model);
  if (run.experiment === 'mystery') return mysteryPrompt(puzzleSchema.parse(run.input), u.resident, model);
  if (!debate?.case) throw new Error('missing_debate');
  return verdictPrompt(debate.case, debate.posts, u.resident, verdictInputSchema.parse(run.input).candidateOrders[u.resident]!, model);
}
export function validate(run: LabRun, u: LabUnit, payload: unknown): string[] {
  if (run.experiment === 'verdict') return ballotIssues(u.resident, payload);
  if (run.experiment === 'companions') return companionIssues(u.resident, payload);
  if (run.experiment === 'coin') return coinOutputSchema.safeParse(payload).success ? [] : ['coin_schema'];
  return mysteryAnswerSchema.safeParse(payload).success ? [] : ['mystery_schema'];
}
/** Coin answers are observations: an invalid answer is recorded, never retried
 * or replaced. Other experiments may retry invalid structure within budget. */
const retriesInvalid = (experiment: LabExperiment) => experiment !== 'coin';

function finish(run: LabRun, reason: string | null) {
  const accepted = run.units.filter(u => u.status === 'accepted').length;
  const status: RunStatus = run.units.some(u => u.status === 'pending') ? 'running'
    : accepted === run.units.length ? 'complete' : accepted ? 'partial' : 'unavailable';
  run.status = status;
  if (status !== 'running') {
    run.nextAttemptAt = null;
    // A transient capacity wait never becomes a finished run's explanation.
    run.reason = reason ?? (run.reason === 'quota_wait' ? null : run.reason);
    if (run.experiment === 'verdict') run.result = verdict(ballotsOf(run) as Partial<Record<CharacterId, Ballot>>);
  }
}

/** Pure state transition for one charged attempt. Stale replays (a unit that
 * is no longer pending, or an attempt already recorded) change nothing. */
export function applyLabResult(before: LabRun, unitId: string, attemptId: string, startedAt: number, digest: string, result: GeminiResult, now: number): LabRun {
  const run = structuredClone(before);
  const u = run.units.find(x => x.id === unitId);
  if (!u || u.status !== 'pending' || run.status !== 'running' || u.receipts.some(r => r.id === attemptId)) return before;
  const issues = result.ok ? validate(run, u, result.payload) : [result.code];
  u.attempts++;
  const receipt: Receipt = { attempt: u.attempts, id: attemptId, startedAt, finishedAt: now, code: result.code, issues, modelVersion: result.modelVersion, responseId: result.responseId,
    usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, thinkingTokens: result.usage.thinkingTokens, totalTokens: result.usage.totalTokens },
    latencyMs: result.latencyMs, promptDigest: digest, raw: result.text ? result.text.slice(0, 4000) : null };
  u.receipts.push(receipt);
  run.updatedAt = now;
  let reason: string | null = null;
  if (run.reason === 'quota_wait') run.reason = null;
  if (!issues.length) { u.status = 'accepted'; u.output = result.payload; run.nextAttemptAt = now + 1_000; }
  else if (result.ok || CONTENT_CODES.includes(result.code)) {
    // The model answered, but not validly.
    if (!retriesInvalid(run.experiment) || u.attempts >= UNIT_ATTEMPT_CAP) u.status = 'invalid';
    run.nextAttemptAt = now + 30_000;
  } else if (FATAL_CODES.includes(result.code)) {
    for (const x of run.units) if (x.status === 'pending') x.status = 'failed';
    reason = result.code;
  } else {
    if (u.attempts >= UNIT_ATTEMPT_CAP) u.status = 'failed';
    run.nextAttemptAt = now + Math.max(result.retryAfterMs ?? (result.code === 'rate_limited' ? 3_600_000 : 60_000 * u.attempts), 30_000);
  }
  const spent = run.units.reduce((n, x) => n + x.attempts, 0);
  if (spent >= RUN_ATTEMPT_CAP[run.experiment] && run.units.some(x => x.status === 'pending')) {
    for (const x of run.units) if (x.status === 'pending') x.status = 'failed';
    reason = 'attempt_limit';
  }
  finish(run, reason);
  return run;
}
/** A date's window has passed: keep every valid observation, mark the rest. */
export function closeRun(before: LabRun, reason: string, now: number): LabRun {
  if (before.status !== 'running') return before;
  const run = structuredClone(before);
  for (const u of run.units) if (u.status === 'pending') u.status = 'failed';
  run.updatedAt = now;
  finish(run, reason);
  return run;
}
export const nextUnit = (run: LabRun) => run.status === 'running' ? run.units.find(u => u.status === 'pending') ?? null : null;
