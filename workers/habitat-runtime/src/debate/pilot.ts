import { DEBATE_DOMAINS, DEBATE_PROTOCOL, contributionIssues, contributionSchema, questionDraftSchema, questionIssues,
  reviewSchema, type DebateCase, type DebatePost, type QuestionDraft } from '../../../../src/lib/habitat/debate/contracts';
import { DEBATE_PERSONAS, DEBATE_PERSONAS_VERSION } from '../../../../src/lib/habitat/debate/personas';
import { openingPrompt, questionPrompt, replyPlan, replyPrompt, reviewPrompt } from '../../../../src/lib/habitat/debate/prompts';
import { GEMINI_DEBATE_MODEL, type GeminiPrompt, type GeminiResult } from '../providers/gemini';

export type PilotCall = { id: string; kind: 'question' | 'review' | 'opening' | 'reply'; prompt: GeminiPrompt };
export type PilotEntry = PilotCall & { result: GeminiResult; validationIssues: string[] };
export type PilotReport = {
  protocol: typeof DEBATE_PROTOCOL; model: typeof GEMINI_DEBATE_MODEL; personaVersion: number;
  status: 'running' | 'complete' | 'incomplete'; entries: PilotEntry[];
  questions: Array<{ domain: DebateCase['domain']; value: DebateCase | null; issues: string[] }>;
  debates: Array<{ caseId: string; posts: DebatePost[]; complete: boolean }>;
  limitations: string[];
};
export const PILOT_MAX_CALLS = 32; // 6 questions + 2 reviews + 2 * (6 openings + 6 replies)
export const PILOT_LIMITATIONS = [
  'A small exploratory sample; not proof of long-term novelty, reasoning quality, or human-like behaviour.',
  'Editor ratings come from the same model and are not independent human evaluation.',
  'All six profiles are authored, versioned pilot overlays on existing fictional residents.',
  'No automatic fallback, authored replacement response, production mutation, or economic side effect.',
];
const fatal = (result: GeminiResult) => ['authentication', 'missing_key', 'rate_limited', 'unexpected_model'].includes(result.code);

/** Pure orchestration. A Worker or CLI supplies the metered, persisted dispatch.
 * Posts are admitted only after validation. Failures remain in the report; an
 * incomplete first round never masquerades as a complete six-person debate. */
export async function runDebatePilot(input: {
  generate: (call: PilotCall) => Promise<GeminiResult>;
  history?: readonly QuestionDraft[];
  checkpoint?: (report: PilotReport) => Promise<void>;
}): Promise<PilotReport> {
  const report: PilotReport = { protocol: DEBATE_PROTOCOL, model: GEMINI_DEBATE_MODEL,
    personaVersion: DEBATE_PERSONAS_VERSION, status: 'running', entries: [], questions: [], debates: [],
    limitations: [...PILOT_LIMITATIONS] };
  const checkpoint = async () => { await input.checkpoint?.(structuredClone(report)); };
  const history = [...(input.history ?? [])];
  let stopped = false;
  async function call(spec: PilotCall) {
    if (report.entries.length >= PILOT_MAX_CALLS || stopped) throw new Error('pilot_stopped');
    const result = await input.generate(spec);
    const entry: PilotEntry = { ...spec, result, validationIssues: result.ok ? [] : [result.code] };
    report.entries.push(entry);
    if (fatal(result)) stopped = true;
    return entry;
  }
  for (const [index, domain] of DEBATE_DOMAINS.entries()) {
    const entry = await call({ id: `question-${index + 1}`, kind: 'question', prompt: questionPrompt(domain, history) });
    const parsed = questionDraftSchema.safeParse(entry.result.payload);
    let value: DebateCase | null = null;
    if (entry.result.ok && parsed.success) {
      entry.validationIssues = questionIssues(parsed.data, history);
      if (!entry.validationIssues.length) {
        value = { id: entry.id, domain, ...parsed.data };
        history.push(parsed.data);
      }
    } else if (entry.result.ok) entry.validationIssues = ['question_schema'];
    report.questions.push({ domain, value, issues: [...entry.validationIssues] });
    await checkpoint();
    if (stopped) break;
  }
  // Predeclared first two eligible domains; no selection by flattering scores.
  const selected = report.questions.flatMap(row => row.value ? [row.value] : []).slice(0, 2);
  for (const [caseIndex, debate] of selected.entries()) {
    if (stopped) break;
    const review = await call({ id: `${debate.id}-review`, kind: 'review', prompt: reviewPrompt(debate) });
    if (review.result.ok && !reviewSchema.safeParse(review.result.payload).success) review.validationIssues = ['review_schema'];
    await checkpoint();
    if (stopped) break;
    const round: PilotReport['debates'][number] = { caseId: debate.id, posts: [], complete: false };
    report.debates.push(round);
    for (const persona of DEBATE_PERSONAS) {
      const entry = await call({ id: `${debate.id}-opening-${persona.id}`, kind: 'opening', prompt: openingPrompt(debate, persona) });
      const parsed = contributionSchema.safeParse(entry.result.payload);
      if (entry.result.ok && parsed.success) {
        entry.validationIssues = contributionIssues(parsed.data.body);
        if (!entry.validationIssues.length) round.posts.push({ id: entry.id, personaId: persona.id, round: 1, replyTo: null, body: parsed.data.body });
      } else if (entry.result.ok) entry.validationIssues = ['post_schema'];
      await checkpoint();
      if (stopped) break;
    }
    if (stopped) break;
    if (round.posts.length !== DEBATE_PERSONAS.length) continue;
    const openings = structuredClone(round.posts);
    for (const assignment of replyPlan(openings, 1 + caseIndex)) {
      const persona = DEBATE_PERSONAS.find(person => person.id === assignment.personaId);
      if (!persona) throw new Error('unknown_persona');
      const entry = await call({ id: `${debate.id}-reply-${persona.id}`, kind: 'reply',
        prompt: replyPrompt(debate, persona, openings, assignment.replyTo) });
      const parsed = contributionSchema.safeParse(entry.result.payload);
      if (entry.result.ok && parsed.success) {
        entry.validationIssues = contributionIssues(parsed.data.body);
        if (!entry.validationIssues.length) round.posts.push({ id: entry.id, personaId: persona.id, round: 2,
          replyTo: assignment.replyTo, body: parsed.data.body });
      } else if (entry.result.ok) entry.validationIssues = ['post_schema'];
      await checkpoint();
      if (stopped) break;
    }
    round.complete = round.posts.length === 2 * DEBATE_PERSONAS.length;
  }
  report.status = !stopped && report.questions.length === 6 && report.questions.every(row => row.value)
    && report.debates.length === 2 && report.debates.every(debate => debate.complete)
    && report.entries.every(entry => !entry.validationIssues.length) ? 'complete' : 'incomplete';
  await checkpoint();
  return report;
}
