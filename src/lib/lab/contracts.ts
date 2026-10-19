import { z } from 'zod';
import { CHARACTER_IDS, type CharacterId } from '../debate/characters';

/** The Lab: four small daily experiments about model choices. Protocol strings
 * are part of every stored run; results from different protocols, models or
 * conditions are never pooled without stratification. */
export const LAB_EXPERIMENTS = ['verdict', 'coin', 'companions', 'mystery'] as const;
export type LabExperiment = typeof LAB_EXPERIMENTS[number];
export const LAB_PROTOCOLS = {
  verdict: 'lab-verdict-v2', coin: 'lab-coin-v2', companions: 'lab-companions-v2', mystery: 'lab-mystery-v1',
} as const satisfies Record<LabExperiment, string>;
/** v1 → v2 (from 20 October 2026): verdict and companion candidates are listed
 * in a seeded random order instead of a rotation of one fixed sequence, which
 * kept the same residents adjacent; the coin adds a counterbalanced condition.
 * Prompt wording is unchanged and every order is stored with the run. */
export const PROTOCOL_HISTORY = { verdict: ['lab-verdict-v1'], coin: ['lab-coin-v1'], companions: ['lab-companions-v1'], mystery: [] } as const;
/** neutral: heads listed first; reversed: identical except tails listed first. */
export const COIN_CONDITIONS = ['neutral', 'reversed', 'persona'] as const;
export type CoinCondition = typeof COIN_CONDITIONS[number];
export const BORDA_METHOD = 'borda-5-4-3-2-1-v1';

const id = z.enum(CHARACTER_IDS);
export const residentIdSchema = id;
export const unitStatusSchema = z.enum(['pending', 'accepted', 'invalid', 'failed']);
export type UnitStatus = z.infer<typeof unitStatusSchema>;
export const runStatusSchema = z.enum(['running', 'complete', 'partial', 'unavailable']);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const receiptSchema = z.object({
  attempt: z.number().int().min(1), id: z.string(), startedAt: z.number(), finishedAt: z.number().nullable(),
  code: z.string(), issues: z.array(z.string()), modelVersion: z.string().nullable(), responseId: z.string().nullable(),
  usage: z.object({ inputTokens: z.number().nullable(), outputTokens: z.number().nullable(), thinkingTokens: z.number().nullable(), totalTokens: z.number().nullable() }),
  latencyMs: z.number().nullable(), promptDigest: z.string(), raw: z.string().nullable(),
});
export type Receipt = z.infer<typeof receiptSchema>;
export const unitSchema = z.object({
  id: z.string(), resident: id, condition: z.string(), status: unitStatusSchema, attempts: z.number().int().min(0),
  output: z.unknown().nullable(), receipts: z.array(receiptSchema),
});
export type LabUnit = z.infer<typeof unitSchema>;
export const parametersSchema = z.object({ temperature: z.number(), candidateCount: z.number(), thinkingLevel: z.string(), maxOutputTokens: z.number(), structuredOutput: z.literal(true) });

/* ---------- model-facing output contracts ---------- */
const others = (self: CharacterId) => CHARACTER_IDS.filter(other => other !== self) as [CharacterId, ...CharacterId[]];
export const ballotSchemaFor = (voter: CharacterId) => z.strictObject({
  ranking: z.array(z.enum(others(voter))).length(5).describe('All five other residents, strongest arguments first. Each ID exactly once. Never your own ID.'),
  reason: z.string().min(10).max(220).describe('One public sentence explaining your first choice.'),
});
export const coinOutputSchema = z.strictObject({ result: z.enum(['heads', 'tails']) });
export const companionSchemaFor = (selector: CharacterId) => z.strictObject({
  choices: z.array(z.enum(others(selector))).length(2).describe('Exactly two different residents from the list.'),
  reason: z.string().min(5).max(180).describe('One short public sentence.'),
});
export const mysteryAnswerSchema = z.strictObject({
  culprit: id.describe('The ID of the one resident whose statement must be the false one.'),
  explanation: z.string().min(10).max(320).describe('A brief public explanation of the deduction, at most two sentences.'),
  confidence: z.number().int().min(0).max(100).describe('How confident you are, from 0 to 100.'),
});
export type Ballot = { ranking: CharacterId[]; reason: string };
export type CompanionChoice = { choices: CharacterId[]; reason: string };
export type MysteryAnswer = z.infer<typeof mysteryAnswerSchema>;


/* Acceptance is checked on the measured fields only. The schemas above are
 * what the model is asked for; a missing or short free-text note does not
 * invalidate an otherwise valid choice, because rejecting it would select
 * which choices get recorded. */
const note = (max: number) => z.string().max(max).catch('');
const acceptedBallotFor = (voter: CharacterId) => z.object({ ranking: z.array(z.enum(others(voter))).length(5), reason: note(400) });
const acceptedCompanionFor = (selector: CharacterId) => z.object({ choices: z.array(z.enum(others(selector))).length(2), reason: note(400) });
export const mysteryAcceptedSchema = z.object({ culprit: id, explanation: note(600), confidence: z.number().int().min(0).max(100) });
/** The stored output for an accepted answer, with notes normalised to strings. */
export function acceptedOutput(experiment: 'verdict' | 'companions' | 'mystery' | 'coin', resident: CharacterId, value: unknown): unknown {
  if (experiment === 'verdict') return acceptedBallotFor(resident).parse(value);
  if (experiment === 'companions') return acceptedCompanionFor(resident).parse(value);
  if (experiment === 'mystery') return mysteryAcceptedSchema.parse(value);
  return coinOutputSchema.parse(value);
}
/** Server-side ballot validation independent of the structured-output schema. */
export function ballotIssues(voter: CharacterId, value: unknown): string[] {
  const parsed = acceptedBallotFor(voter).safeParse(value);
  if (!parsed.success) {
    const raw = value as { ranking?: unknown };
    if (Array.isArray(raw?.ranking) && raw.ranking.includes(voter)) return ['self_vote'];
    if (Array.isArray(raw?.ranking) && new Set(raw.ranking).size !== raw.ranking.length) return ['duplicate_ranking'];
    return ['ballot_schema'];
  }
  if (new Set(parsed.data.ranking).size !== 5) return ['duplicate_ranking'];
  return [];
}
export function companionIssues(selector: CharacterId, value: unknown): string[] {
  const parsed = acceptedCompanionFor(selector).safeParse(value);
  if (!parsed.success) {
    const raw = value as { choices?: unknown };
    if (Array.isArray(raw?.choices) && raw.choices.includes(selector)) return ['self_selection'];
    return ['companion_schema'];
  }
  return parsed.data.choices[0] === parsed.data.choices[1] ? ['duplicate_choice'] : [];
}

/* ---------- experiment inputs ---------- */
export const verdictInputSchema = z.object({
  debateId: z.string(), debateProtocol: z.string(), method: z.literal(BORDA_METHOD),
  participation: z.partialRecord(id, z.number().int().min(0)), firstTurn: z.partialRecord(id, z.number().int().min(0).nullable()),
  candidateOrders: z.partialRecord(id, z.array(id)),
});
export const coinInputSchema = z.object({ promptVersion: z.string(), portraits: z.record(z.string(), id), conditions: z.array(z.enum(COIN_CONDITIONS)) });
export const companionInputSchema = z.object({ scenarioVersion: z.string(), scenario: z.string(), candidateOrders: z.partialRecord(id, z.array(id)) });

export const statementKindSchema = z.enum(['innocent', 'accuse', 'either', 'neither', 'liar', 'truthful', 'group', 'conditional']);
export type StatementKind = z.infer<typeof statementKindSchema>;
export const statementSchema = z.object({ speaker: id, kind: statementKindSchema, subjects: z.array(id), text: z.string(), truthSet: z.array(id) });
export type Statement = z.infer<typeof statementSchema>;
export const puzzleSchema = z.object({
  version: z.string(), seed: z.number().int(), attempts: z.number().int().min(1),
  scenario: z.object({ id: z.string(), title: z.string(), setting: z.string(), question: z.string() }),
  rule: z.string(), culprit: id, statements: z.array(statementSchema).length(6), solutions: z.array(id),
  template: z.object({ signature: z.string(), roles: z.array(id).length(6) }),
  difficulty: z.object({ minimalClues: z.number().int(), directClues: z.number().int(), referenceClues: z.number().int(), level: z.enum(['standard', 'hard']) }),
  explanation: z.array(z.string()),
});
export type Puzzle = z.infer<typeof puzzleSchema>;

export const verdictResultSchema = z.object({
  method: z.literal(BORDA_METHOD),
  standings: z.array(z.object({ id, points: z.number(), firsts: z.number(), positions: z.array(z.number()).length(5), rank: z.number().int(), decidedBy: z.string() })),
  winners: z.array(id), tieNote: z.string().nullable(),
});
export type VerdictResult = z.infer<typeof verdictResultSchema>;

export const labRunSchema = z.object({
  id: z.string(), experiment: z.enum(LAB_EXPERIMENTS), date: z.iso.date(), protocol: z.string(), model: z.string(), parameters: parametersSchema,
  status: runStatusSchema, reason: z.string().nullable(), createdAt: z.number(), updatedAt: z.number(), nextAttemptAt: z.number().nullable(),
  input: z.unknown(), units: z.array(unitSchema), result: z.unknown().nullable(),
});
export type LabRun = z.infer<typeof labRunSchema>;

/* ---------- public read contracts ---------- */
export const labAvailabilitySchema = z.enum(['recorded', 'pending', 'unavailable', 'not_recorded']);
export const labDaySchema = z.object({ date: z.iso.date(), availability: labAvailabilitySchema, reason: z.string().nullable(), run: labRunSchema.nullable() });
export type LabDay = z.infer<typeof labDaySchema>;
export const labScheduleSchema = z.object({ enabled: z.boolean(), model: z.string(), hourUtc: z.number(), activatedOn: z.string().nullable(), today: z.string() });
export const labIndexSchema = z.object({ dates: z.array(z.string()), schedule: labScheduleSchema });
export const labOverviewSchema = z.object({ schedule: labScheduleSchema, today: z.record(z.enum(LAB_EXPERIMENTS), labDaySchema), latest: z.record(z.enum(LAB_EXPERIMENTS), z.string().nullable()) });
export type LabOverview = z.infer<typeof labOverviewSchema>;
export const labHistorySchema = z.object({ experiment: z.enum(LAB_EXPERIMENTS), runs: z.array(labRunSchema), schedule: labScheduleSchema });
export type LabHistory = z.infer<typeof labHistorySchema>;
