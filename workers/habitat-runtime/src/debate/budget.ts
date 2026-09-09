import type { GeminiModel } from '../providers/gemini';

const pacific = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
export function quotaDate(now: number): string { return pacific.format(now); }
export function nextQuotaDay(now: number): number {
  const today = quotaDate(now);
  for (let at = Math.ceil((now + 1) / 3_600_000) * 3_600_000; at <= now + 26 * 3_600_000; at += 3_600_000) {
    if (quotaDate(at) !== today) return at;
  }
  throw new Error('quota_calendar');
}
export const modelDailyCap = (model: GeminiModel) => model === 'gemini-3.8-flash' ? 20 : 300;
export function unknownResult(model: GeminiModel) {
  return { ok: false, code: 'timeout' as const, model, modelVersion: null, responseId: null, status: null, text: null, payload: null,
    usage: { inputTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: null, complete: false }, latencyMs: 150_000, retryAfterMs: null };
}
