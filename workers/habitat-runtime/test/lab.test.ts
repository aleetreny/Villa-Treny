import { env } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebateForum } from '../src/debate/forum';
import { labHttp } from '../src/lab/http';
import { applyLabResult, closeRun, newCoinRun, newVerdictRun, randomCandidates, rotatedCandidates } from '../src/lab/experiments';
import { COIN_INSTRUCTION, COIN_INSTRUCTION_REVERSED, coinPrompt } from '../src/lab/prompts';
import { runGemini, type GeminiPrompt, type GeminiResult } from '../src/providers/gemini';
import { generatePuzzle } from '../../../src/lib/lab/mystery';
import { CHARACTER_IDS, type CharacterId } from '../../../src/lib/debate/characters';
import { LAB_PROTOCOLS, type LabDay, type LabExperiment, type LabHistory, type LabOverview, type LabRun } from '../../../src/lib/lab/contracts';
import { completedConversation, successful } from './fixtures/daily';

vi.mock('../src/providers/gemini', async original => ({ ...await original<typeof import('../src/providers/gemini')>(), runGemini: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

/** RPC typings collapse the Lab's open JSON fields; the values themselves are plain data. */
type LabReads = { getLabOverview(): Promise<LabOverview>; getLabDay(e: LabExperiment, d: string): Promise<LabDay>; getLabHistory(e: LabExperiment): Promise<LabHistory>;
  exportLab(d: string): Promise<{ runs: LabRun[]; attempts: unknown[] }>; configureLab(raw: unknown): Promise<unknown> };
type Forum = Omit<DurableObjectStub<DebateForum>, keyof LabReads> & LabReads;
const typed = (s: DurableObjectStub<DebateForum>) => s as unknown as Forum & DurableObjectStub<DebateForum>;
const stub = () => typed(env.DEBATE_FORUM.getByName('lab-' + crypto.randomUUID()));
// Workerd fires native alarms on wall time; keep test time in the future and consume alarms explicitly.
const futureTime = (hour = 10) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 2); d.setUTCHours(hour, 0, 0, 0); return +d; };
const seedDebate = (s: DurableObjectStub<DebateForum>, day: ReturnType<typeof completedConversation>) =>
  runInDurableObject(s, (_i, ctx) => { ctx.storage.sql.exec('INSERT INTO debate_days(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', day.id, JSON.stringify(day)); });
const failure = (code: GeminiResult['code']): GeminiResult => ({ ...successful(null), ok: false, code, text: null, payload: null });

type Call = { prompt: GeminiPrompt; kind: string };
/** Fixture answers built from the prompt the engine actually sent. */
function answer(prompt: GeminiPrompt, coins: string[] = []): unknown {
  if (prompt.user === COIN_INSTRUCTION || prompt.user === COIN_INSTRUCTION_REVERSED) return { result: coins.shift() ?? 'heads' };
  const user = JSON.parse(prompt.user) as { protocol: string; candidates?: { id: CharacterId }[]; you?: { id: CharacterId }; title?: string };
  if (user.protocol === LAB_PROTOCOLS.verdict) return { ranking: user.candidates!.map(c => c.id), reason: 'Their argument was the clearest.' };
  if (user.protocol === LAB_PROTOCOLS.companions) return { choices: user.candidates!.slice(0, 2).map(c => c.id), reason: 'Good company for a walk.' };
  if (user.protocol === LAB_PROTOCOLS.mystery) return { culprit: 'A', explanation: 'Only one statement can be false.', confidence: 70 };
  throw new Error('Unexpected prompt ' + user.protocol);
}
const kindOf = (prompt: GeminiPrompt) => prompt.user === COIN_INSTRUCTION || prompt.user === COIN_INSTRUCTION_REVERSED ? 'coin' : (JSON.parse(prompt.user) as { protocol: string }).protocol;
async function drain(s: Forum & DurableObjectStub<DebateForum>, clock: { now: number }, calls: Call[], limit = 80) {
  for (let i = 0; i < limit; i++) {
    clock.now += 61_000;
    const alarm = (await s.diagnostics()).nextAlarmAt;
    if (alarm === null) break;
    if (alarm > clock.now) clock.now = alarm;
    await runDurableObjectAlarm(s);
    if (calls.length && (await s.getLabOverview()) && i > 0 && Object.values((await s.getLabOverview()).today).every(d => d.run && d.run.status !== 'running')) break;
  }
}
function mockModel(calls: Call[], coins: string[] = []) {
  vi.mocked(runGemini).mockImplementation(async ({ prompt }) => { calls.push({ prompt, kind: kindOf(prompt) }); return successful(answer(prompt, coins)); });
}

describe('the Lab', () => {
  it('serves read-only routes that never create runs or call the model', async () => {
    const s = typed(env.DEBATE_FORUM.getByName('villa-treny-daily-v1'));
    for (const path of ['/v1/lab', '/v1/lab/coin', '/v1/lab/companions', '/v1/lab/mystery', '/v1/lab/verdict', '/v1/lab/coin/2026-10-18', '/v1/lab/verdict/2026-09-20']) {
      const response = await labHttp(new Request('https://lab.test' + path), env);
      expect(response?.status, path).toBe(200);
    }
    expect((await labHttp(new Request('https://lab.test/v1/lab/coin', { method: 'POST' }), env))?.status).toBe(405);
    expect((await labHttp(new Request('https://lab.test/v1/lab/dice'), env))?.status).toBe(400);
    expect((await labHttp(new Request('https://lab.test/v1/lab/coin?run=1'), env))?.status).toBe(400);
    expect((await labHttp(new Request('https://lab.test/v1/admin/lab'), { ...env, ADMIN_TOKEN: 'test-lab-admin-secret' }))?.status).toBe(401);
    expect((await s.getLabHistory('coin')).runs).toHaveLength(0);
    await runInDurableObject(s, async (_i, ctx) => expect(await ctx.storage.getAlarm()).toBeNull());
    expect(runGemini).not.toHaveBeenCalled();
  });

  it('stays disabled until the operator enables it, independently of the debate', async () => {
    const s = stub(), clock = { now: futureTime() }, date = new Date(clock.now).toISOString().slice(0, 10);
    vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
    await seedDebate(s, completedConversation(date));
    await s.configure({ enabled: true, model: 'gemini-3.5-flash-lite' });
    await runDurableObjectAlarm(s);
    expect((await s.getLabOverview()).today.coin.availability).toBe('not_recorded');
    expect(runGemini).not.toHaveBeenCalled();
  });

  it('runs a complete day after the debate: jury first, then fair independent experiments', async () => {
    const s = stub(), clock = { now: futureTime() }, date = new Date(clock.now).toISOString().slice(0, 10), calls: Call[] = [];
    vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
    await seedDebate(s, completedConversation(date));
    await s.configure({ enabled: true, model: 'gemini-3.5-flash-lite' });
    mockModel(calls, ['heads', 'tails', 'heads', 'heads', 'tails', 'heads', 'tails', 'tails', 'tails', 'heads', 'heads', 'heads']);
    await s.configureLab({ enabled: true });
    await drain(s, clock, calls);
    const overview = await s.getLabOverview();
    expect(Object.values(overview.today).map(d => d.run?.status)).toEqual(['complete', 'complete', 'complete', 'complete']);
    // Routine per-minute pacing is not reported as a capacity problem.
    expect(Object.values(overview.today).map(d => d.run?.reason)).toEqual([null, null, null, null]);
    // 6 ballots + 18 coins (neutral, tails-first, persona) + 6 companion choices + 6 mystery answers.
    expect(calls).toHaveLength(36);
    expect(calls.slice(0, 6).every(c => c.kind === LAB_PROTOCOLS.verdict)).toBe(true);
    // Fair interleaving: the three independent experiments alternate rather than run back to back.
    expect(new Set(calls.slice(6, 9).map(c => c.kind)).size).toBe(3);

    const verdict = overview.today.verdict.run!;
    expect(verdict.result).toMatchObject({ method: 'borda-5-4-3-2-1-v1' });
    const result = verdict.result as { standings: { id: string; points: number }[]; winners: string[] };
    expect(result.standings.reduce((n, x) => n + x.points, 0)).toBe(6 * 15);
    expect(result.winners.length).toBeGreaterThanOrEqual(1);
    // Every ballot came from its own independent request containing no other ballot.
    for (const call of calls.slice(0, 6)) expect(call.prompt.user).not.toContain('ranking');
    expect(verdict.input).toMatchObject({ participation: { [completedConversation(date).posts[0]!.author]: 2 } });

    // Neutral coin requests are byte-identical, and actual model answers are stored.
    const coins = calls.filter(c => c.kind === 'coin');
    const neutral = coins.filter(c => !c.prompt.system.includes('You are ') && c.prompt.user === COIN_INSTRUCTION);
    expect(neutral).toHaveLength(6);
    // The counterbalanced requests are identical to each other and differ from neutral only in label order.
    const reversed = coins.filter(c => c.prompt.user === COIN_INSTRUCTION_REVERSED);
    expect(reversed).toHaveLength(6);
    expect(new Set(reversed.map(c => JSON.stringify(c.prompt))).size).toBe(1);
    expect(reversed[0]!.prompt.system).toBe(neutral[0]!.prompt.system);
    expect(JSON.stringify(reversed[0]!.prompt.jsonSchema).replace('"tails","heads"', '"heads","tails"')).toBe(JSON.stringify(neutral[0]!.prompt.jsonSchema));
    expect(new Set(neutral.map(c => JSON.stringify(c.prompt))).size).toBe(1);
    expect(coins.filter(c => c.prompt.system.includes('You are '))).toHaveLength(6);
    const coin = overview.today.coin.run!;
    expect(coin.units.filter(u => u.condition === 'neutral').map(u => (u.output as { result: string }).result).filter(Boolean)).toHaveLength(6);
    expect(coin.units.every(u => u.receipts[0]!.promptDigest.startsWith('sha256:') && u.receipts[0]!.raw)).toBe(true);

    // Companion candidate orders are recorded and rotated.
    const companions = overview.today.companions.run!;
    expect((companions.input as { candidateOrders: Record<string, string[]> }).candidateOrders.A).toEqual(randomCandidates(date, 'A', 'companions'));
    const mystery = overview.today.mystery.run!;
    expect((mystery.input as { culprit: string }).culprit).toBe(generatePuzzle(date).culprit);
    // Reloading reads the same stored results without new inference.
    const before = calls.length;
    expect((await s.getLabDay('coin', date)).run).toEqual(overview.today.coin.run);
    expect(calls.length).toBe(before);
    expect((await s.diagnostics()).nextAlarmAt).toBeGreaterThan(clock.now + 3_600_000);
  });

  it('gives the unfinished debate priority over every Lab experiment', async () => {
    const s = stub(), clock = { now: futureTime() }, date = new Date(clock.now).toISOString().slice(0, 10), calls: Call[] = [];
    vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
    await s.configure({ enabled: true, model: 'gemini-3.5-flash-lite' });
    await s.configureLab({ enabled: true });
    vi.mocked(runGemini).mockImplementation(async ({ prompt }) => { calls.push({ prompt, kind: 'x' }); return failure('provider_error'); });
    await runDurableObjectAlarm(s);
    // The first dispatch of the day is the debate draft, not a Lab request.
    expect(calls).toHaveLength(1); expect(calls[0]!.prompt.user).not.toContain('lab-');
    expect((await s.exportLab(date)).attempts).toHaveLength(0);
    // During a short debate retry backoff the Lab does not take the slot.
    clock.now += 30_000; await runDurableObjectAlarm(s);
    expect((await s.exportLab(date)).attempts).toHaveLength(0);
  });

  it('records invalid coin answers without retrying, but retries an invalid ballot', async () => {
    const date = '2026-10-18', now = Date.parse(date + 'T10:00:00Z');
    let coin = newCoinRun(date, 'gemini-3.5-flash-lite', now);
    coin = applyLabResult(coin, 'neutral-1', 'a#1', now, 'sha256:x', successful({ result: 'edge' }), now + 1);
    const unitOf = (id: string) => coin.units.find(u => u.id === id);
    expect(unitOf('neutral-1')).toMatchObject({ status: 'invalid', attempts: 1, output: null });
    coin = applyLabResult(coin, 'neutral-2', 'b#1', now, 'sha256:x', failure('invalid_json'), now + 2);
    expect(unitOf('neutral-2')).toMatchObject({ status: 'invalid' });
    coin = applyLabResult(coin, 'persona-A', 'c#1', now, 'sha256:x', failure('provider_error'), now + 3);
    expect(unitOf('persona-A')).toMatchObject({ status: 'pending', attempts: 1 });
    // A replayed attempt identity changes nothing.
    expect(applyLabResult(coin, 'persona-A', 'c#1', now, 'sha256:x', successful({ result: 'heads' }), now + 4)).toBe(coin);

    const debate = completedConversation(date);
    let jury = newVerdictRun({ id: debate.id, protocol: debate.protocol, case: debate.case!, posts: debate.posts }, 'gemini-3.5-flash-lite', now);
    jury = applyLabResult(jury, 'A', 'j#1', now, 'sha256:x', successful({ ranking: ['A', 'B', 'C', 'D', 'E'], reason: 'I argued best of all.' }), now + 1);
    expect(jury.units[0]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(jury.units[0]!.receipts[0]!.issues).toEqual(['self_vote']);
    jury = applyLabResult(jury, 'A', 'j#2', now, 'sha256:x', successful({ ranking: ['B', 'B', 'D', 'E', 'F'], reason: 'Bex argued best of all.' }), now + 2);
    expect(jury.units[0]!.receipts[1]!.issues).toEqual(['duplicate_ranking']);
    jury = applyLabResult(jury, 'A', 'j#3', now, 'sha256:x', successful({ ranking: ['B', 'C', 'D', 'E', 'F'], reason: 'Bex argued best of all.' }), now + 3);
    expect(jury.units[0]).toMatchObject({ status: 'accepted', attempts: 3 });
    // Without six valid ballots there is no winner.
    const closed = closeRun(jury, 'window_closed', now + 10);
    expect(closed).toMatchObject({ status: 'partial', result: null, reason: 'window_closed' });
    expect(closed.units.slice(1).every(u => u.status === 'failed')).toBe(true);
  });

  it('recovers interrupted requests without repeating accepted work', async () => {
    const s = stub(), clock = { now: futureTime() }, date = new Date(clock.now).toISOString().slice(0, 10);
    vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
    await seedDebate(s, completedConversation(date));
    await s.configure({ enabled: true, model: 'gemini-3.5-flash-lite' });
    vi.mocked(runGemini).mockImplementation(async () => { throw new Error('Gemini must not be called during recovery'); });
    await s.configureLab({ enabled: true });
    const run = (await s.getLabDay('coin', date)).run!;
    const unknown = run.units[0]!.id, saved = run.units[1]!.id;
    await runInDurableObject(s, (_i, ctx) => {
      ctx.storage.sql.exec("INSERT INTO lab_attempts(id,run,unit,model,quota_day,started,deadline,state,digest) VALUES(?,?,?,'gemini-3.5-flash-lite',?,?,?,'pending','sha256:t')", run.id + '/' + unknown + '#1', run.id, unknown, date, clock.now - 200_000, clock.now - 1);
      ctx.storage.sql.exec("INSERT INTO lab_attempts(id,run,unit,model,quota_day,started,deadline,state,digest,result) VALUES(?,?,?,'gemini-3.5-flash-lite',?,?,?,'result','sha256:t',?)", run.id + '/' + saved + '#1', run.id, saved, date, clock.now - 100_000, clock.now + 100_000, JSON.stringify(successful({ result: 'tails' })));
    });
    await runDurableObjectAlarm(s); await runDurableObjectAlarm(s);
    const after = (await s.getLabDay('coin', date)).run!;
    expect(after.units[0]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(after.units[0]!.receipts[0]!.code).toBe('timeout');
    expect(after.units[1]).toMatchObject({ status: 'accepted', output: { result: 'tails' } });
    expect(runGemini).not.toHaveBeenCalled();
    const ledger = await runInDurableObject(s, (_i, ctx) => ctx.storage.sql.exec("SELECT COUNT(*) AS n FROM lab_attempts WHERE state='applied'").one().n);
    expect(ledger).toBe(2);
  });

  it('shares the provider quota and keeps the debate reserve', async () => {
    const s = stub(), clock = { now: futureTime() }, date = new Date(clock.now).toISOString().slice(0, 10), calls: Call[] = [];
    vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
    // An unfinished debate in a long backoff, with 290 of 300 requests used elsewhere.
    const debate = completedConversation(date);
    await seedDebate(s, { ...debate, phase: 'summary', status: 'delayed', summary: null, nextAttemptAt: clock.now + 3_600_000, lastFailure: 'provider_error' });
    await s.configure({ enabled: true, model: 'gemini-3.5-flash-lite' });
    const quotaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(clock.now);
    await s.accountExternal([{ model: 'gemini-3.5-flash-lite', date: quotaDay, count: 290 }]);
    mockModel(calls);
    await s.configureLab({ enabled: true });
    await runDurableObjectAlarm(s);
    // 290 + 20 reserved debate attempts ≥ 300: no Lab request.
    expect(calls).toHaveLength(0);
    expect((await s.getLabDay('coin', date)).run?.reason).toBe('quota_wait');
    await s.accountExternal([{ model: 'gemini-3.5-flash-lite', date: quotaDay, count: 200 }]);
    expect((await s.diagnostics()).external[0]).toMatchObject({ count: 290 });
  });

  it('reports verdict availability honestly for historical, held and unfinished debates', async () => {
    const s = stub(), clock = { now: futureTime() }, date = new Date(clock.now).toISOString().slice(0, 10);
    vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
    await seedDebate(s, completedConversation('2026-09-20'));
    const held = completedConversation('2026-09-21');
    await seedDebate(s, { ...held, status: 'held', phase: 'conversation', heldReason: 'attempt_limit', posts: held.posts.slice(0, 4), summary: null });
    const unfinished = completedConversation(date);
    await seedDebate(s, { ...unfinished, status: 'replies', phase: 'conversation', posts: unfinished.posts.slice(0, 4), summary: null, nextAttemptAt: clock.now + 3_600_000 });
    await s.configure({ enabled: true, model: 'gemini-3.5-flash-lite' });
    await s.configureLab({ enabled: true });
    expect(await s.getLabDay('verdict', '2026-09-20')).toMatchObject({ availability: 'not_recorded', run: null });
    expect(await s.getLabDay('verdict', '2026-09-21')).toMatchObject({ availability: 'unavailable', reason: 'debate_incomplete' });
    expect(await s.getLabDay('verdict', date)).toMatchObject({ availability: 'pending', reason: 'debate_in_progress' });
    // No jury run exists for an unfinished debate, and history is never backfilled.
    expect((await s.getLabHistory('verdict')).runs).toHaveLength(0);
  });

  it('closes an earlier date while keeping its valid observations', async () => {
    const s = stub(), clock = { now: futureTime() }, date = new Date(clock.now).toISOString().slice(0, 10), calls: Call[] = [];
    vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
    await seedDebate(s, completedConversation(date));
    await s.configure({ enabled: true, model: 'gemini-3.5-flash-lite' });
    mockModel(calls);
    await s.configureLab({ enabled: true });
    for (let i = 0; i < 4; i++) { clock.now += 61_000; await runDurableObjectAlarm(s); }
    expect(calls.length).toBe(4);
    clock.now = Date.parse(date + 'T09:00:00Z') + 86_400_000 + 5_000;
    await s.reconcile();
    const old = (await s.getLabHistory('verdict')).runs.find(r => r.date === date)!;
    expect(old.status).toBe('partial'); expect(old.reason).toBe('window_closed');
    expect(old.units.filter(u => u.status === 'accepted')).toHaveLength(4);
    expect((old as LabRun).result).toBeNull();
    // Re-ensuring a date never duplicates or replaces runs.
    const count = await runInDurableObject(s, (_i, ctx) => ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM lab_runs').one().n);
    await s.reconcile();
    expect(await runInDurableObject(s, (_i, ctx) => ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM lab_runs').one().n)).toBe(count);
  });

  it('lists candidates in independent random orders instead of rotating one fixed sequence', () => {
    const days = Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2026, 9, 20 + i)).toISOString().slice(0, 10));
    const slots = Object.fromEntries(CHARACTER_IDS.filter(id => id !== 'A').map(id => [id, [0, 0, 0, 0, 0]])) as Record<string, number[]>;
    const neighbours = new Set<string>();
    for (const day of days) {
      const order = randomCandidates(day, 'A', 'companions');
      expect([...order].sort()).toEqual(['B', 'C', 'D', 'E', 'F']);
      order.forEach((id, slot) => slots[id]![slot]!++);
      neighbours.add(order.slice(0, 2).sort().join(''));
    }
    expect(randomCandidates('2026-10-20', 'A', 'companions')).toEqual(randomCandidates('2026-10-20', 'A', 'companions'));
    // Every pair can appear in the top two slots; the old rotation allowed only five.
    expect(neighbours.size).toBe(10);
    expect(new Set(days.slice(0, 30).map(d => rotatedCandidates(d, 'A').slice(0, 2).sort().join(''))).size).toBe(5);
    for (const counts of Object.values(slots)) for (const n of counts) expect(n).toBeGreaterThan(35);
  });

  it('builds identical neutral coin prompts and persona prompts that differ only by profile', () => {
    const prompts = CHARACTER_IDS.map(() => coinPrompt('neutral', 'A', 'gemini-3.5-flash-lite'));
    expect(new Set(prompts.map(p => JSON.stringify(p))).size).toBe(1);
    const persona = coinPrompt('persona', 'C', 'gemini-3.5-flash-lite');
    expect(persona.user).toBe(prompts[0]!.user); expect(persona.jsonSchema).toEqual(prompts[0]!.jsonSchema);
    expect(persona.system).toContain('Cato');
  });
});
