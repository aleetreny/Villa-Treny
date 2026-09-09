import { z } from 'zod';

export const DEBATE_PROTOCOL = 'debate-pilot-v2' as const;
export const DEBATE_DOMAINS = ['space', 'biology', 'relationships', 'institutions', 'art-and-belief', 'nonhuman-life'] as const;
export const questionDraftSchema = z.strictObject({
  title: z.string().min(8).max(80),
  context: z.string().min(250).max(1800),
  question: z.string().min(30).max(280),
  centralTension: z.string().min(15).max(180),
});
export type QuestionDraft = z.infer<typeof questionDraftSchema>;
export type DebateCase = QuestionDraft & { id: string; domain: typeof DEBATE_DOMAINS[number] };
export const contributionSchema = z.strictObject({ body: z.string().min(300).max(2200) });
export const reviewSchema = z.strictObject({
  usable: z.boolean(),
  clarity: z.number().int().min(1).max(5),
  roomForDisagreement: z.number().int().min(1).max(5),
  originality: z.number().int().min(1).max(5),
  problem: z.string().max(500),
});
export type DebatePost = { id: string; personaId: string; round: 1 | 2; replyTo: string | null; body: string };

export function words(text: string): number { return text.trim().split(/\s+/u).filter(Boolean).length; }

/** Mechanical eligibility, not an assertion that a question is interesting. */
export function questionIssues(value: QuestionDraft, history: readonly QuestionDraft[]): string[] {
  const issues: string[] = [];
  if (words(value.context) < 80 || words(value.context) > 210) issues.push('context_word_count');
  if ((value.question.match(/\?/g) ?? []).length !== 1 || !value.question.trim().endsWith('?')) issues.push('one_question_required');
  // A narrow syntax check only: it cannot certify an open or unbiased framing.
  if (/^(?:should|would|could|can|may|must|is|are|was|were|do|does|did|will|has|have)\b/iu.test(value.question.trim())) issues.push('closed_question');
  const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (history.some(old => normalize(old.question) === normalize(value.question) || normalize(old.title) === normalize(value.title))) issues.push('exact_repeat');
  return issues;
}

export function contributionIssues(body: string): string[] {
  return words(body) < 120 || words(body) > 300 ? ['post_word_count'] : [];
}

export function outputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12' });
  delete json.$schema;
  return json;
}
