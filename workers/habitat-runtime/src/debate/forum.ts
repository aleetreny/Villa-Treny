import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import { archiveFilterSchema, archiveQuery } from './archive';
import { DAILY_PROTOCOL, archiveSchema, type DailyCase } from '../../../../src/lib/debate/contracts';
import { GEMINI_MODELS, runGemini, type GeminiModel, type GeminiResult } from '../providers/gemini';
import { applyDailyResult, DAILY_HOUR_UTC, MAX_DAY_ATTEMPTS, newDebate, nextDailyTask, publicDay, verifyCompletedDay, type DailyRecord } from './daily';
import { modelDailyCap, nextQuotaDay, quotaDate, unknownResult } from './budget';

type Settings = { enabled: boolean; model: GeminiModel; activatedAt: number | null };
type Attempt = { id: string; day: string; task: string; model: GeminiModel; started: number; deadline: number; state: string; result: string | null };
const settingsSchema = z.strictObject({ enabled: z.boolean(), model: z.enum(GEMINI_MODELS) });
const externalSchema = z.array(z.strictObject({ model: z.enum(GEMINI_MODELS), date: z.iso.date(), count: z.number().int().min(0).max(500) })).max(40);
const nextEdition = (now: number) => { const d = new Date(now); d.setUTCHours(DAILY_HOUR_UTC, 0, 0, 0); if (+d <= now) d.setUTCDate(d.getUTCDate() + 1); return +d; };

/** One community owns its daily editions and anonymous recommendations. Reading
 * never schedules cognition. The previous HabitatWorld remains separately stored. */
export class DebateForum extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS forum_config (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS debate_days (id TEXT PRIMARY KEY, body TEXT NOT NULL, recommendations INTEGER NOT NULL DEFAULT 0 CHECK(recommendations>=0));
      CREATE TABLE IF NOT EXISTS debate_attempts (id TEXT PRIMARY KEY, day TEXT NOT NULL, task TEXT NOT NULL, model TEXT NOT NULL, quota_day TEXT NOT NULL,
        started INTEGER NOT NULL, deadline INTEGER NOT NULL, state TEXT NOT NULL, prompt TEXT, result TEXT);
      CREATE INDEX IF NOT EXISTS debate_attempt_budget ON debate_attempts(model,quota_day,started);
      CREATE INDEX IF NOT EXISTS debate_attempt_pending ON debate_attempts(state,started);
      CREATE TABLE IF NOT EXISTS debate_external_usage (model TEXT NOT NULL, date TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(model,date));
      CREATE TABLE IF NOT EXISTS debate_votes (day TEXT NOT NULL, reader TEXT NOT NULL, PRIMARY KEY(day,reader));
      CREATE TABLE IF NOT EXISTS debate_rate (key TEXT PRIMARY KEY, start INTEGER NOT NULL, count INTEGER NOT NULL);
    `);
  }
  private get sql() { return this.ctx.storage.sql; }
  private settings(): Settings {
    const row = this.sql.exec<{ body: string }>('SELECT body FROM forum_config WHERE id=1').toArray()[0];
    return row ? JSON.parse(row.body) as Settings : { enabled: false, model: 'gemini-3.8-flash', activatedAt: null };
  }
  private save(day: DailyRecord) {
    this.sql.exec('INSERT INTO debate_days(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', day.id, JSON.stringify(day));
  }
  private day(id: string): DailyRecord | null {
    const row = this.sql.exec<{ body: string }>('SELECT body FROM debate_days WHERE id=?', id).toArray()[0];
    return row ? JSON.parse(row.body) as DailyRecord : null;
  }
  private history(except?: string): DailyCase[] {
    return this.sql.exec<{ body: string }>('SELECT body FROM debate_days WHERE id<>? ORDER BY id DESC LIMIT 24', except ?? '').toArray()
      .map(r => JSON.parse(r.body) as DailyRecord).reverse().flatMap(d => d.case ? [d.case] : []);
  }
  getEdition(id: string) {
    const row = this.sql.exec<{ body: string; recommendations: number }>('SELECT body,recommendations FROM debate_days WHERE id=?', id).toArray()[0];
    return row ? publicDay(JSON.parse(row.body) as DailyRecord, row.recommendations) : null;
  }
  getArchive(input?: unknown) {
    const filter=archiveFilterSchema.parse(typeof input==='string'?{before:input}:input??{});
    const query=archiveQuery(filter);
    const rows = this.sql.exec<{ body: string; recommendations: number }>(query.sql,...query.values).toArray();
    const entries = rows.slice(0,20).map(row => { const { posts, ...card } = publicDay(JSON.parse(row.body) as DailyRecord, row.recommendations); return { ...card, postCount: posts.length }; });
    return archiveSchema.parse({ entries, nextCursor: rows.length > 20 ? entries.at(-1)?.id : null, nextScore: rows.length > 20 ? entries.at(-1)?.recommendations : null,
      schedule: { hourUtc: DAILY_HOUR_UTC, enabled: this.settings().enabled, model: this.settings().model } });
  }
  getVote(id: string, reader: string) {
    const edition = this.sql.exec<{ recommendations: number }>('SELECT recommendations FROM debate_days WHERE id=?', id).toArray()[0];
    if (!edition) return null;
    return { recommended: this.sql.exec('SELECT 1 FROM debate_votes WHERE day=? AND reader=?', id, reader).toArray().length > 0,
      recommendations: edition.recommendations };
  }
  /** Limits anonymous writes; buckets contain keyed hashes, never raw IPs. */
  private rate(key: string, now: number, cap: number, window: number) {
    const row = this.sql.exec<{ start: number; count: number }>('SELECT start,count FROM debate_rate WHERE key=?', key).toArray()[0];
    if (row && row.start + window > now && row.count >= cap) return false;
    this.sql.exec('INSERT INTO debate_rate(key,start,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET start=excluded.start,count=?', key,
      row && row.start + window > now ? row.start : now, row && row.start + window > now ? row.count + 1 : 1);
    return true;
  }
  vote(id: string, reader: string, recommended: boolean, network: string) {
    return this.ctx.storage.transactionSync(() => {
      const day = this.day(id);
      if (!day?.case || day.posts.length !== 12) return { error: 'not_ready' };
      const current = this.getVote(id, reader)!;
      if (current.recommended === recommended) return current;
      const now = Date.now();
      if (!this.rate('reader:' + reader, now, 20, 60_000) || !this.rate('network:' + network, now, 80, 3_600_000)) return { error: 'rate_limited' };
      if (recommended) this.sql.exec('INSERT INTO debate_votes(day,reader) VALUES(?,?)', id, reader);
      else this.sql.exec('DELETE FROM debate_votes WHERE day=? AND reader=?', id, reader);
      this.sql.exec('UPDATE debate_days SET recommendations=recommendations+? WHERE id=?', recommended ? 1 : -1, id);
      this.sql.exec('DELETE FROM debate_rate WHERE start<?', now - 86_400_000);
      return this.getVote(id, reader)!;
    });
  }
  async configure(raw: unknown) {
    const input = settingsSchema.parse(raw);
    const prior = this.settings();
    this.sql.exec('INSERT INTO forum_config(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', JSON.stringify({ ...input, activatedAt: prior.activatedAt ?? Date.now() }));
    if (!input.enabled) await this.ctx.storage.deleteAlarm();
    else await this.reconcile();
    return this.diagnostics();
  }
  accountExternal(raw: unknown) {
    const entries = externalSchema.parse(raw);
    this.ctx.storage.transactionSync(() => {
      for (const e of entries) this.sql.exec('INSERT INTO debate_external_usage(model,date,count) VALUES(?,?,?) ON CONFLICT(model,date) DO UPDATE SET count=MAX(count,excluded.count)', e.model, e.date, e.count);
    });
    return this.diagnostics();
  }
  adopt(raw: unknown, usage: unknown) {
    const day = verifyCompletedDay(raw);
    const entries = externalSchema.parse(usage);
    // Import reserves externally spent quota too. Re-import is immutable and idempotent.
    const required = Object.values(day.attempts).reduce((a,b) => a+b, 0);
    if (required < 15 || !entries.some(e => e.model === day.model && e.count >= required)) throw new TypeError('acceptance_usage_required');
    this.ctx.storage.transactionSync(() => {
      const existing = this.day(day.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(day)) throw new RangeError('edition_already_exists');
      if (!existing) this.save(day);
      for (const e of entries) this.sql.exec('INSERT INTO debate_external_usage(model,date,count) VALUES(?,?,?) ON CONFLICT(model,date) DO UPDATE SET count=MAX(count,excluded.count)', e.model, e.date, e.count);
    });
    return this.getEdition(day.id);
  }
  async diagnostics() {
    const nextAlarmAt = await this.ctx.storage.getAlarm();
    return { ...this.settings(), nextAlarmAt, hourUtc: DAILY_HOUR_UTC, today: new Date().toISOString().slice(0,10),
      attempts: this.sql.exec('SELECT model,quota_day,COUNT(*) AS count FROM debate_attempts GROUP BY model,quota_day ORDER BY quota_day DESC LIMIT 30').toArray(),
      external: this.sql.exec('SELECT * FROM debate_external_usage ORDER BY date DESC LIMIT 30').toArray(),
      editions: this.sql.exec<{ body: string }>('SELECT body FROM debate_days ORDER BY id DESC LIMIT 10').toArray().map(r => { const d = JSON.parse(r.body) as DailyRecord; return { id: d.id, status: d.status, phase: d.phase, posts: d.posts.length, attempts: d.attempts, heldReason: d.heldReason, lastFailure: d.lastFailure }; }) };
  }
  exportEdition(id: string) {
    return { day: this.day(id), attempts: this.sql.exec('SELECT * FROM debate_attempts WHERE day=? ORDER BY started', id).toArray() };
  }
  private async wake(at: number) {
    if (this.settings().enabled) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1_000, at));
  }
  async reconcile() {
    if (!this.settings().enabled) { await this.ctx.storage.deleteAlarm(); return; }
    const now = Date.now();
    const pending = this.sql.exec<Attempt>("SELECT * FROM debate_attempts WHERE state<>'applied' ORDER BY started LIMIT 1").toArray()[0];
    if (pending) { await this.wake(pending.state === 'result' ? now + 1000 : pending.deadline); return; }
    const date = new Date(now).toISOString().slice(0,10);
    if (new Date(now).getUTCHours() < DAILY_HOUR_UTC) { await this.wake(nextEdition(now)); return; }
    for (const row of this.sql.exec<{body:string}>("SELECT body FROM debate_days WHERE id<? AND json_extract(body,'$.status') NOT IN ('complete','held')", date).toArray()) {
      const old = JSON.parse(row.body) as DailyRecord; old.status = 'held'; old.heldReason = 'edition_window_closed'; old.nextAttemptAt = null; this.save(old);
    }
    const day = this.day(date) ?? newDebate(date, this.settings().model, now);
    if (!this.day(date)) this.save(day);
    if (day.phase === 'done' || day.status === 'held') await this.wake(nextEdition(now));
    else await this.wake(day.nextAttemptAt ?? now + 1000);
  }
  private settle(attempt: Attempt, result: GeminiResult) {
    this.ctx.storage.transactionSync(() => {
      const stored = this.sql.exec<{ state: string }>('SELECT state FROM debate_attempts WHERE id=?', attempt.id).toArray()[0];
      if (!stored || stored.state === 'applied') return;
      const day = this.day(attempt.day);
      const history = this.history(attempt.day);
      const task = day?.protocol === DAILY_PROTOCOL ? nextDailyTask(day, history) : null;
      if(day && day.protocol!==DAILY_PROTOCOL){day.status='held';day.heldReason='protocol_changed';day.nextAttemptAt=null;this.save(day);}
      else if (day && task?.id === attempt.task) this.save(applyDailyResult(day, task, result, history, Date.now()).day);
      this.sql.exec("UPDATE debate_attempts SET state='applied' WHERE id=?", attempt.id);
    });
  }
  async alarm() {
    if (!this.settings().enabled) return;
    const now = Date.now();
    const pending = this.sql.exec<Attempt>("SELECT * FROM debate_attempts WHERE state<>'applied' ORDER BY started LIMIT 1").toArray()[0];
    if (pending) {
      if (pending.state === 'pending' && pending.deadline > now) { await this.wake(pending.deadline); return; }
      this.settle(pending, pending.result ? JSON.parse(pending.result) as GeminiResult : unknownResult(pending.model));
      await this.reconcile(); return;
    }
    const date = new Date(now).toISOString().slice(0,10);
    const day = this.day(date);
    if(day && day.protocol!==DAILY_PROTOCOL && day.phase!=='done'){day.status='held';day.heldReason='protocol_changed';day.nextAttemptAt=null;this.save(day);}
    if (!day || day.phase === 'done' || day.status === 'held' || (day.nextAttemptAt ?? 0) > now) { await this.reconcile(); return; }
    const history = this.history(date);
    const task = nextDailyTask(day, history);
    if (!task) { await this.reconcile(); return; }
    const count = this.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM debate_attempts WHERE day=?', date).one().count;
    if (count >= MAX_DAY_ATTEMPTS) { day.status = 'held'; day.heldReason = 'attempt_limit'; day.nextAttemptAt = null; this.save(day); await this.reconcile(); return; }
    const quotaDay = quotaDate(now);
    const used = this.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM debate_attempts WHERE model=? AND quota_day=?', day.model, quotaDay).one().count;
    const external = this.sql.exec<{ count: number }>('SELECT count FROM debate_external_usage WHERE model=? AND date=?', day.model, quotaDay).toArray()[0]?.count ?? 0;
    const minute = this.sql.exec<{ started: number }>('SELECT started FROM debate_attempts WHERE model=? AND started>? ORDER BY started', day.model, now - 60_000).toArray();
    if (used + external >= modelDailyCap(day.model) || minute.length >= 3) {
      day.nextAttemptAt = used + external >= modelDailyCap(day.model) ? nextQuotaDay(now) + 1000 : minute[0]!.started + 61_000;
      day.status = 'delayed'; day.lastFailure = 'quota_wait'; this.save(day); await this.wake(day.nextAttemptAt); return;
    }
    // Synchronous reservation closes the crash and concurrent-alarm quota window.
    const attempt: Attempt = { id: crypto.randomUUID(), day: date, task: task.id, model: day.model, started: now, deadline: now + 180_000, state: 'pending', result: null };
    this.sql.exec('INSERT INTO debate_attempts(id,day,task,model,quota_day,started,deadline,state,prompt) VALUES(?,?,?,?,?,?,?,?,?)',
      attempt.id, date, task.id, day.model, quotaDay, now, attempt.deadline, 'pending', JSON.stringify(task.prompt));
    await this.wake(attempt.deadline);
    const result = await runGemini({ apiKey: this.env.GEMINI_API_KEY, prompt: task.prompt, model: day.model, timeoutMs: 150_000 });
    // Save the response before applying it; recovery never repeats accepted work.
    this.sql.exec("UPDATE debate_attempts SET state='result',result=? WHERE id=? AND state='pending'", JSON.stringify(result), attempt.id);
    this.settle(attempt, result);
    // Keep full prompts/results 90 days; permanent editions and quota receipts remain.
    this.sql.exec("UPDATE debate_attempts SET prompt=NULL,result=NULL WHERE state='applied' AND started<? AND (prompt IS NOT NULL OR result IS NOT NULL)", now - 90 * 86_400_000);
    await this.reconcile();
  }
}
