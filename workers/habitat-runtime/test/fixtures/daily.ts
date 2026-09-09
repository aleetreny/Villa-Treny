import { applyDailyResult, newDebate, nextDailyTask, type DailyRecord, type DailyTask } from '../../src/debate/daily';
import type { GeminiResult } from '../../src/providers/gemini';
export const sampleCase = {
  title: 'The last quiet hour',
  context: 'A lunar settlement has one shared garden, used by people who work different shifts. The garden is the only place with living plants. Some residents meet there to sing after their shifts, while others use the same hour to sit quietly. Both groups have asked the elected council for reliable access. Sound carries through the whole garden, and the settlement cannot build another one for a year. The existing timetable changes every week, which makes planning difficult for both groups. Nobody has a private garden. The council can change how the space is scheduled, but any new arrangement must still leave time for maintenance.',
  question: 'What would a fair, lasting arrangement for sharing this garden look like?',
  facts: ['The garden is the only place with living plants.', 'Nobody has a private garden.', 'The existing timetable changes every week, which makes planning difficult for both groups.'],
  unknowns: ['The number of residents in each group is not specified.'],
  tension: 'Predictability and equal access to a shared space cannot give everyone their preferred hour.',
};
export const editorialOptions = [{proposal:'Publish a fixed timetable for each group.',reason:'Reliable hours make access practical for residents.',cost:'Some residents cannot attend their allocated session.'},{proposal:'Let residents book sessions each month.',reason:'Changing needs can be represented as shifts change.',cost:'Negotiation takes time and leaves schedules less predictable.'}];
export const body = 'I would start with a published timetable that everyone can understand. The garden is a shared place, and a reliable arrangement matters more than securing one perfect evening. Each group should receive regular sessions, with some hours left available for people who do not belong to either group. That would give residents a way to plan without treating every change of shift as a new dispute. I would review the arrangement after a month and ask who has actually been able to use it. A schedule that looks fair on paper can still exclude people whose hours change unexpectedly. The cost is that neither group gets its preferred time every day. I think that is a reasonable cost for an arrangement that remains open to revision.';
export function payloadFor(day: DailyRecord, task: DailyTask): unknown {
  if (task.kind === 'draft') return {candidates:[sampleCase,sampleCase,sampleCase]};
  if (task.kind === 'edit') return { publish: true, reasons: [], viableResponses: editorialOptions, case: sampleCase };
  if (task.kind === 'summary') return { overview: 'The residents propose different ways to share a scarce public space. Their discussion turns on whether equal time, reliable access or flexibility should carry the most weight.',
    disagreements: [{ text: 'The discussion compares predictable access with the need to accommodate changing shifts.', posts: [day.posts[0]!.id,day.posts[1]!.id] }], sharedGround: 'The garden should remain a shared resource.' };
  return { body, position: 'Publish a predictable timetable and review who can use it.', factsUsed: [1,2], ...(task.kind === 'reply' ? { quoteIndex: 1 } : {}) };
}
export function successful(payload: unknown): GeminiResult { return { ok: true, code: 'ok', model: 'gemini-3.5-flash-lite', modelVersion: 'gemini-3.5-flash-lite', responseId: 'fixture', status: 200, text: JSON.stringify(payload), payload,
  usage: { inputTokens: 10, outputTokens: 20, thinkingTokens: 0, totalTokens: 30, complete: true }, latencyMs: 10, retryAfterMs: null }; }
export function completedDay(date = '2026-09-09') {
  let day = newDebate(date, 'gemini-3.5-flash-lite', Date.parse(date+'T09:00:00Z'));
  for (let i=0; i<15; i++) { const task=nextDailyTask(day,[])!; day=applyDailyResult(day,task,successful(payloadFor(day,task)),[],day.updatedAt+1000).day; }
  return day;
}
