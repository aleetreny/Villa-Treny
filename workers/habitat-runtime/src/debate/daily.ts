import { z } from 'zod';
import { CHARACTERS, CHARACTER_IDS, CHARACTER_VERSION, type CharacterId } from '../../../../src/lib/debate/characters';
import { DAILY_PROTOCOL, candidateCasesSchema, caseIssues, countWords, dailyPostSchema, editorialSchema, openingSchema,
  postIssues, quoteChoices, characterSchema, publicDebateSchema, replySchema, summarySchema, type DailyCase, type DailyPost, type PublicDebate } from '../../../../src/lib/debate/contracts';
import type { GeminiModel, GeminiPrompt, GeminiResult } from '../providers/gemini';
import { dailyBrief, dailyOpening, dailyReply, digestPrompt, draftPrompt, editPrompt } from './daily-prompts';

export const DAILY_HOUR_UTC = 9;
export const MAX_DAY_ATTEMPTS = 20;
export const dailyRecordSchema = publicDebateSchema.omit({ recommendations: true }).extend({
  phase: z.enum(['draft', 'edit', 'opening', 'replies', 'summary', 'done']),
  draft: candidateCasesSchema.nullable(), draftNumber: z.number().int().min(1).max(2),
  editorialFeedback: z.array(z.string()).max(12), attempts: z.record(z.string(), z.number().int().min(0).max(3)),
  heldReason: z.string().nullable(), lastFailure: z.string().nullable(),
});
export type DailyRecord = z.infer<typeof dailyRecordSchema>;
export type DailyTask = { id: string; kind: 'draft' | 'edit' | 'opening' | 'reply' | 'summary'; author: CharacterId | null;
  replyTo: string | null; prompt: GeminiPrompt };

export function newDebate(date: string, model: GeminiModel, now: number): DailyRecord {
  z.iso.date().parse(date);
  return { id: date, date, domain: dailyBrief(date).domain, status: 'preparing', phase: 'draft',
    model, protocol: DAILY_PROTOCOL, personaVersion: CHARACTER_VERSION, characters: structuredClone([...CHARACTERS]),
    case: null, draft: null, draftNumber: 1, editorialFeedback: [], posts: [], summary: null,
    createdAt: now, updatedAt: now, nextAttemptAt: null, attempts: {}, heldReason: null, lastFailure: null };
}
export function turnOrder(date: string): CharacterId[] {
  const offset = Math.floor(Date.parse(date + 'T12:00:00Z') / 86_400_000) % CHARACTER_IDS.length;
  return [...CHARACTER_IDS.slice(offset), ...CHARACTER_IDS.slice(0, offset)];
}
export function replyTarget(date: string, actor: CharacterId, openings: DailyPost[]): DailyPost {
  const offset = 1 + Math.floor(Date.parse(date + 'T12:00:00Z') / 86_400_000) % 5;
  const target = CHARACTER_IDS[(CHARACTER_IDS.indexOf(actor) + offset) % 6];
  const post = openings.find(post => post.author === target && post.round === 1);
  if (openings.length !== 6 || !post || new Set(openings.map(x => x.author)).size !== 6) throw new Error('complete_openings_required');
  return post;
}
export function nextDailyTask(day: DailyRecord, history: readonly DailyCase[]): DailyTask | null {
  if (day.phase === 'done' || day.status === 'held') return null;
  const base = { author: null, replyTo: null };
  if (day.phase === 'draft') return { ...base, id: day.id + '-draft-' + day.draftNumber, kind: 'draft',
    prompt: draftPrompt(day.date, day.model, history, day.editorialFeedback) };
  if (day.phase === 'edit') {
    if (!day.draft) throw new Error('missing_draft');
    return { ...base, id: day.id + '-edit-' + day.draftNumber, kind: 'edit', prompt: editPrompt(day.draft, day.model, history, day.date) };
  }
  if (!day.case) throw new Error('missing_case');
  if (day.phase === 'summary') return { ...base, id: day.id + '-summary', kind: 'summary', prompt: digestPrompt(day.case, day.model, day.posts) };
  const round = day.phase === 'opening' ? 1 : 2;
  const actor = turnOrder(day.date).find(id => !day.posts.some(post => post.author === id && post.round === round));
  if (!actor) throw new Error('invalid_phase');
  if (round === 1) return { id: day.id + '-o-' + actor, kind: 'opening', author: actor, replyTo: null, prompt: dailyOpening(day.case, actor, day.model, day.characters.find(p => p.id === actor)) };
  const openings = day.posts.filter(x => x.round === 1);
  const target = replyTarget(day.date, actor, openings);
  return { id: day.id + '-r-' + actor, kind: 'reply', author: actor, replyTo: target.id, prompt: dailyReply(day.case, actor, day.model, openings, target, day.characters.find(p => p.id === actor)) };
}

function statusFor(day: DailyRecord): PublicDebate['status'] {
  if (day.heldReason) return 'held';
  if (day.lastFailure) return 'delayed';
  return day.phase === 'done' ? 'complete' : day.phase === 'draft' || day.phase === 'edit' ? 'preparing' : day.phase === 'summary' ? 'summarizing' : day.phase;
}
function validatePayload(day: DailyRecord, task: DailyTask, payload: unknown, history: readonly DailyCase[]): string[] {
  if (task.kind === 'draft') {
    const p = candidateCasesSchema.safeParse(payload);
    if (!p.success) return ['candidate_schema'];
    return p.data.candidates.every(candidate=>caseIssues(candidate,history).length>0) ? ['no_valid_candidate'] : [];
  }
  if (task.kind === 'edit') {
    const p = editorialSchema.safeParse(payload); return p.success ? caseIssues(p.data.case, history) : ['editorial_schema'];
  }
  if (task.kind === 'summary') {
    const p = summarySchema.safeParse(payload);
    if (!p.success) return ['summary_schema'];
    if (day.posts.length !== 12 || p.data.disagreements.some(item => {
      const posts = item.posts.map(id => day.posts.find(post => post.id === id));
      return posts.some(post => !post) || new Set(posts.map(post => post?.author)).size < 2;
    })) return ['summary_references'];
    return [];
  }
  const p = (task.kind === 'reply' ? replySchema : openingSchema).safeParse(payload);
  if (!p.success || !day.case) return ['post_schema'];
  const issues = postIssues(p.data, day.case);
  if (task.kind === 'reply') {
    const quoteIndex = 'quoteIndex' in p.data ? Number(p.data.quoteIndex) : 0;
    const target = day.posts.find(post => post.id === task.replyTo && post.round === 1);
    if (!target || !quoteChoices(target.body)[quoteIndex - 1]) issues.push('exact_target_quote');
  }
  return issues;
}

/** State transition only. The store must charge and persist the attempt first.
 * Replayed/stale task results cannot append a duplicate or replace an accepted post. */
export function applyDailyResult(before: DailyRecord, task: DailyTask, result: GeminiResult, history: readonly DailyCase[], now: number): { day: DailyRecord; accepted: boolean; issues: string[] } {
  const current = nextDailyTask(before, history);
  if (!current || current.id !== task.id || result.model !== before.model) return { day: before, accepted: false, issues: ['stale_or_wrong_model'] };
  const day = structuredClone(before);
  const issues = result.ok ? validatePayload(day, task, result.payload, history) : [result.code];
  day.attempts[task.id] = (day.attempts[task.id] ?? 0) + 1;
  day.updatedAt = now;
  day.lastFailure = issues.join(',') || null;
  if (issues.length) {
    if (['authentication', 'missing_key', 'unexpected_model', 'invalid_request'].includes(result.code)) day.heldReason = result.code;
    else if (day.attempts[task.id]! >= 3 || Object.values(day.attempts).reduce((a, b) => a + b, 0) >= MAX_DAY_ATTEMPTS) day.heldReason = 'attempt_limit';
    day.nextAttemptAt = day.heldReason ? null : now + Math.max(result.retryAfterMs ?? (result.code === 'rate_limited' ? 3_600_000 : 60_000 * day.attempts[task.id]!), 30_000);
    day.status = statusFor(day);
    return { day, accepted: false, issues };
  }
  day.nextAttemptAt = now + 5_000;
  if (task.kind === 'draft') {
    day.draft = candidateCasesSchema.parse(result.payload); day.phase = 'edit';
  } else if (task.kind === 'edit') {
    const edit = editorialSchema.parse(result.payload);
    if (!edit.publish) {
      day.editorialFeedback = edit.reasons.slice(0, 5);
      if (day.draftNumber >= 2) day.heldReason = 'editorial_hold';
      else { day.draftNumber = 2; day.draft = null; day.phase = 'draft'; }
    } else { day.case = edit.case; day.phase = 'opening'; }
  } else if (task.kind === 'summary') {
    day.summary = summarySchema.parse(result.payload); day.phase = 'done'; day.nextAttemptAt = null;
  } else {
    const post = (task.kind === 'reply' ? replySchema : openingSchema).parse(result.payload);
    const target = day.posts.find(p => p.id === task.replyTo);
    const quote = task.kind === 'reply' && target ? quoteChoices(target.body)[replySchema.parse(result.payload).quoteIndex - 1] : null;
    day.posts.push(dailyPostSchema.parse({ body: post.body, position: post.position, factsUsed: post.factsUsed, id: task.id, author: task.author, round: task.kind === 'opening' ? 1 : 2,
      replyTo: task.replyTo, quote, createdAt: now }));
    if (day.posts.length === 6) day.phase = 'replies';
    if (day.posts.length === 12) day.phase = 'summary';
  }
  day.status = statusFor(day);
  if (day.heldReason) day.nextAttemptAt = null;
  return { day, accepted: true, issues: [] };
}
export function publicDay(day: DailyRecord, recommendations: number): PublicDebate {
  return publicDebateSchema.parse({ ...day, recommendations });
}
/** Imported acceptance runs must be internally valid, not merely schema-shaped. */
export function verifyCompletedDay(raw: unknown): DailyRecord {
  const day = dailyRecordSchema.parse(raw);
  z.iso.date().parse(day.date);
  if (day.phase !== 'done' || day.status !== 'complete' || !day.case || !day.summary || day.posts.length !== 12
    || day.heldReason || day.lastFailure || day.nextAttemptAt !== null || day.id !== day.date || day.protocol !== DAILY_PROTOCOL || day.personaVersion !== CHARACTER_VERSION
    || JSON.stringify(day.characters) !== JSON.stringify(z.array(characterSchema).parse(CHARACTERS)) || caseIssues(day.case, []).length) throw new Error('invalid_completed_day');
  for (const round of [1, 2]) if (new Set(day.posts.filter(p => p.round === round).map(p => p.author)).size !== 6) throw new Error('invalid_participation');
  for (const post of day.posts) {
    if (postIssues(post, day.case).length || post.id !== day.id + (post.round === 1 ? '-o-' : '-r-') + post.author) throw new Error('invalid_post');
    if (post.round === 2) {
      const target = replyTarget(day.date, post.author, day.posts.filter(p => p.round === 1));
      if (post.replyTo !== target.id || !post.quote || !target.body.includes(post.quote) || countWords(post.quote) < 5 || countWords(post.quote) > 40) throw new Error('invalid_reply');
    } else if (post.replyTo !== null || post.quote !== null) throw new Error('invalid_opening');
  }
  if (new Set(day.posts.map(p => p.id)).size !== 12 || Object.values(day.attempts).reduce((a,b) => a+b, 0) > MAX_DAY_ATTEMPTS) throw new Error('invalid_day_ledger');
  if (day.summary.disagreements.some(item => {
    const posts = item.posts.map(id => day.posts.find(post => post.id === id));
    return posts.some(post => !post) || new Set(posts.map(post => post?.author)).size < 2;
  })) throw new Error('invalid_summary_references');
  return day;
}
