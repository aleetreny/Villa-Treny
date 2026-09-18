import { z } from 'zod';
import { CHARACTER_IDS } from './characters';

export const DAILY_PROTOCOL = 'villa-debate-v5';
export const DAILY_DOMAINS = ['space', 'bodies', 'relationships', 'work', 'culture', 'justice', 'education', 'nature', 'technology', 'belief', 'democracy', 'knowledge'] as const;
export const debateCaseSchema = z.strictObject({
  title: z.string().min(8).max(80), context: z.string().min(200).max(1600),
  question: z.string().min(25).max(220).describe('Start with What should or How should. Ask what the person should actually do, without listing two alternatives or asking how to balance values. End with one question mark.'),
  facts: z.array(z.string().min(12).max(300)).min(3).max(5), unknowns: z.array(z.string().min(8).max(200)).min(1).max(2),
  tension: z.string().min(12).max(160),
});
export type DailyCase = z.infer<typeof debateCaseSchema>;
const generatedCaseSchema = debateCaseSchema.extend({
  context: z.string().min(200).max(800).describe('A complete scene in 65–100 words. Rewrite the draft if needed; do not copy an overlong paragraph.'),
  facts: debateCaseSchema.shape.facts.describe('Copy 3–5 short excerpts EXACTLY from the final context, preserving the wording. Do not paraphrase.'),
});
export const candidateCasesSchema = z.strictObject({ candidates: z.array(generatedCaseSchema).length(3) });
export const editorialSchema = z.strictObject({
  reasons: z.array(z.string().max(240)).max(5).describe('First examine the candidates: identify specific causal flaws or credible competing wants before selecting a scene.'),
  case: generatedCaseSchema, decisiveConstraint: z.string().min(12).max(300),
  viableResponses: z.array(z.strictObject({ proposal: z.string().min(15).max(200), reason: z.string().min(20).max(250), cost: z.string().min(15).max(200) })).min(2).max(3),
  publish: z.boolean(),
});
const postFields = {
  position: z.string().min(15).max(180),
  factsUsed: z.array(z.number().int().min(1).max(5)).min(1).max(3),
};
// Generation is deliberately tighter than the public archive contract. Old posts
// retain their original body and remain readable after the protocol changes.
export const openingSchema = z.strictObject({ ...postFields, position: z.string().min(15).max(120),
  paragraphs: z.array(z.string().min(30).max(500)).length(2) });
export const replySchema = z.strictObject({
  quoteIndex: z.number().int().min(1).max(16),
  engagement: z.enum(['agree_and_extend', 'disagree', 'revise']).describe('Choose agree_and_extend when you support their main action, disagree for a real difference, or revise when changing your own view.'),
  ...openingSchema.shape,
  paragraphs: z.array(z.string().min(30).max(240).describe('One short paragraph of 15–25 words.')).length(2),
});
export const dailyPostSchema = z.strictObject({ ...postFields, body: z.string().min(60).max(2100),
  id: z.string(), author: z.enum(CHARACTER_IDS), round: z.union([z.literal(1), z.literal(2)]),
  replyTo: z.string().nullable(), quote: z.string().nullable(), createdAt: z.number().int(),
});
export type DailyPost = z.infer<typeof dailyPostSchema>;
export const summarySchema = z.strictObject({
  overview: z.string().min(70).max(600),
  disagreements: z.array(z.strictObject({ text: z.string().min(30).max(300), posts: z.array(z.string()).min(2).max(3) })).max(3),
  sharedGround: z.string().max(350),
});
export const digestSchema = summarySchema.extend({ overview: z.string().min(70).max(400),
  disagreements: z.array(z.strictObject({ text: z.string().min(30).max(190), posts: z.array(z.string()).min(2).max(3) })).max(3),
  sharedGround: z.string().max(200) });
export type DebateSummary = z.infer<typeof summarySchema>;
export const dayStatusSchema = z.enum(['preparing', 'opening', 'replies', 'summarizing', 'complete', 'delayed', 'held']);
export const characterSchema = z.object({ id: z.enum(CHARACTER_IDS), name: z.string(), background: z.string(), version: z.number(),
  lens: z.string(), introduction: z.string(), belief: z.string(), accepts: z.string(), blindSpot: z.string(), changesMind: z.string(), voice: z.string() });
export const publicDebateSchema = z.object({
  id: z.string(), date: z.string(), domain: z.enum(DAILY_DOMAINS), status: dayStatusSchema,
  model: z.enum(['gemini-3.5-flash-lite', 'gemini-3.8-flash']), protocol: z.string(), personaVersion: z.number(),
  characters: z.array(characterSchema).length(6),
  case: debateCaseSchema.nullable(), posts: z.array(dailyPostSchema).max(12), summary: summarySchema.nullable(),
  recommendations: z.number().int().nonnegative(), createdAt: z.number(), updatedAt: z.number(), nextAttemptAt: z.number().nullable(),
});
export type PublicDebate = z.infer<typeof publicDebateSchema>;
export const debateCardSchema = publicDebateSchema.omit({ posts: true, characters: true }).extend({ postCount: z.number().int().min(0).max(12) });
export type DebateCard = z.infer<typeof debateCardSchema>;
export const archiveSchema = z.object({ entries: z.array(debateCardSchema), nextCursor: z.string().nullable(), nextScore: z.number().nullable().optional(),
  schedule: z.object({ hourUtc: z.number(), enabled: z.boolean(), model: z.string() }) });
export type DebateArchive = z.infer<typeof archiveSchema>;

export const countWords = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;
export const normal = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12' }); delete json.$schema; return json;
}
export function caseIssues(value: DailyCase, history: readonly DailyCase[]): string[] {
  const issues: string[] = [];
  if (countWords(value.context) < 50 || countWords(value.context) > 125) issues.push('context_length');
  if ((value.question.match(/\?/g) ?? []).length !== 1 || !value.question.endsWith('?')) issues.push('one_open_question');
  if (/^(should|would|could|can|may|must|is|are|do|does|will|has|have)\b/i.test(value.question)) issues.push('closed_question');
  if (/^how (?:should|can|could|might) .{1,80}\b(?:balance|weigh)\b|^what should guide|^what principles should/i.test(value.question)) issues.push('stock_balance_template');
  if (history.some(old => normal(old.title) === normal(value.title) || normal(old.question) === normal(value.question))) issues.push('repeated_case');
  if (value.facts.some(fact => !normal(value.context).includes(normal(fact)))) issues.push('facts_must_quote_context');
  return issues;
}
export function postIssues(value: Pick<DailyPost, 'body' | 'factsUsed'>, debate: DailyCase, round: 1 | 2): string[] {
  const issues: string[] = [];
  const paragraphs = value.body.split(/\n\s*\n/u);
  const words = countWords(value.body);
  if (words < (round === 1 ? 50 : 20) || words > (round === 1 ? 105 : 75)) issues.push('post_length');
  if (paragraphs.length !== 2 || paragraphs.some(text => /[\r\n]/u.test(text) || countWords(text) < 10 || countWords(text) > 55)) issues.push('post_paragraphs');
  if (new Set(value.factsUsed).size !== value.factsUsed.length || value.factsUsed.some(id => id > debate.facts.length)) issues.push('invalid_fact_reference');
  return issues;
}

/** Quotes are selected, never reconstructed by a language model. */
export function quoteChoices(body: string): string[] {
  const sentences = (body.match(/[^.!?]+[.!?]+/gu) ?? [body]).map(s => s.trim()).filter(s => countWords(s) >= 5 && countWords(s) <= 40 && s.length <= 280);
  const words=[...body.matchAll(/\S+/gu)];
  const last=words[Math.min(24,words.length-1)];
  const fallback=last?body.slice(0,last.index+last[0].length):body;
  return (sentences.length ? sentences : [fallback]).slice(0,16);
}
