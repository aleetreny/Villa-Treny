import { z } from 'zod';
import { CHARACTER_IDS } from './characters';

export const DAILY_PROTOCOL = 'villa-debate-v3';
export const DAILY_DOMAINS = ['space', 'bodies', 'relationships', 'work', 'culture', 'justice', 'education', 'nature', 'technology', 'belief', 'democracy', 'knowledge'] as const;
export const debateCaseSchema = z.strictObject({
  title: z.string().min(8).max(80), context: z.string().min(200).max(1600), question: z.string().min(25).max(220),
  facts: z.array(z.string().min(12).max(300)).min(3).max(5), unknowns: z.array(z.string().min(8).max(200)).min(1).max(2),
  tension: z.string().min(12).max(160),
});
export type DailyCase = z.infer<typeof debateCaseSchema>;
export const candidateCasesSchema = z.strictObject({ candidates: z.array(debateCaseSchema).length(3) });
export const editorialSchema = z.strictObject({ publish: z.boolean(), reasons: z.array(z.string().max(240)).max(5), viableResponses: z.array(z.strictObject({ proposal: z.string().min(15).max(200), reason: z.string().min(20).max(250), cost: z.string().min(15).max(200) })).min(2).max(3), case: debateCaseSchema });
export const openingSchema = z.strictObject({
  body: z.string().min(350).max(2100), position: z.string().min(15).max(180),
  factsUsed: z.array(z.number().int().min(1).max(5)).min(1).max(3),
});
export const replySchema = openingSchema.extend({ quoteIndex: z.number().int().min(1).max(16) });
export const dailyPostSchema = openingSchema.extend({
  id: z.string(), author: z.enum(CHARACTER_IDS), round: z.union([z.literal(1), z.literal(2)]),
  replyTo: z.string().nullable(), quote: z.string().nullable(), createdAt: z.number().int(),
});
export type DailyPost = z.infer<typeof dailyPostSchema>;
export const summarySchema = z.strictObject({
  overview: z.string().min(70).max(600),
  disagreements: z.array(z.strictObject({ text: z.string().min(30).max(300), posts: z.array(z.string()).min(2).max(3) })).min(1).max(3),
  sharedGround: z.string().max(350),
});
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
  if (countWords(value.context) < 85 || countWords(value.context) > 190) issues.push('context_length');
  if ((value.question.match(/\?/g) ?? []).length !== 1 || !value.question.endsWith('?')) issues.push('one_open_question');
  if (/^(should|would|could|can|may|must|is|are|do|does|will|has|have)\b/i.test(value.question)) issues.push('closed_question');
  if (/how should (?:society|humanity|a community) (?:balance|weigh)|^what should guide|^what principles should/i.test(value.question)) issues.push('stock_balance_template');
  if (history.some(old => normal(old.title) === normal(value.title) || normal(old.question) === normal(value.question))) issues.push('repeated_case');
  if (value.facts.some(fact => !normal(value.context).includes(normal(fact)))) issues.push('facts_must_quote_context');
  return issues;
}
export function postIssues(value: z.infer<typeof openingSchema>, debate: DailyCase): string[] {
  const issues: string[] = [];
  if (countWords(value.body) < 110 || countWords(value.body) > 280) issues.push('post_length');
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
