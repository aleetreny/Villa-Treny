import { z } from 'zod';
import { LAB_EXPERIMENTS, labRunSchema, type LabDay, type LabExperiment, type LabRun } from '../../../../src/lib/lab/contracts';
import type { GeminiModel, GeminiPrompt, GeminiResult } from '../providers/gemini';
import { applyLabResult, closeRun, newCoinRun, newCompanionRun, newMysteryRun, newVerdictRun, nextUnit, type CompletedDebate } from './experiments';

export type LabSettings = { enabled: boolean; activatedOn: string | null };
export type LabAttempt = { id: string; run: string; unit: string; model: GeminiModel; quota_day: string; started: number; deadline: number; state: string; digest: string; result: string | null };
export const labSettingsSchema = z.strictObject({ enabled: z.boolean() });
/** Verdict first; the three independent experiments are then served fairly. */
const PRIORITY: LabExperiment[] = ['verdict', 'coin', 'companions', 'mystery'];

export async function digestOf(prompt: GeminiPrompt): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(prompt)));
  return 'sha256:' + [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** SQLite tables for the Lab, inside the forum's Durable Object so one alarm
 * and one quota ledger govern every model request. Reads never dispatch. */
export class LabStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS lab_config (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lab_runs (id TEXT PRIMARY KEY, experiment TEXT NOT NULL, date TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS lab_runs_by_experiment ON lab_runs(experiment,date);
      CREATE TABLE IF NOT EXISTS lab_attempts (id TEXT PRIMARY KEY, run TEXT NOT NULL, unit TEXT NOT NULL, model TEXT NOT NULL, quota_day TEXT NOT NULL,
        started INTEGER NOT NULL, deadline INTEGER NOT NULL, state TEXT NOT NULL, digest TEXT NOT NULL, prompt TEXT, result TEXT);
      CREATE INDEX IF NOT EXISTS lab_attempt_budget ON lab_attempts(model,quota_day,started);
      CREATE INDEX IF NOT EXISTS lab_attempt_pending ON lab_attempts(state,started);
    `);
  }
  settings(): LabSettings {
    const row = this.sql.exec<{ body: string }>('SELECT body FROM lab_config WHERE id=1').toArray()[0];
    return row ? JSON.parse(row.body) as LabSettings : { enabled: false, activatedOn: null };
  }
  configure(raw: unknown, today: string): LabSettings {
    const input = labSettingsSchema.parse(raw), prior = this.settings();
    const next = { enabled: input.enabled, activatedOn: prior.activatedOn ?? (input.enabled ? today : null) };
    this.sql.exec('INSERT INTO lab_config(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', JSON.stringify(next));
    return next;
  }
  run(id: string): LabRun | null {
    const row = this.sql.exec<{ body: string }>('SELECT body FROM lab_runs WHERE id=?', id).toArray()[0];
    return row ? JSON.parse(row.body) as LabRun : null;
  }
  save(run: LabRun) {
    labRunSchema.parse(run);
    this.sql.exec('INSERT INTO lab_runs(id,experiment,date,body) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', run.id, run.experiment, run.date, JSON.stringify(run));
  }
  runs(experiment: LabExperiment, limit = 400): LabRun[] {
    return this.sql.exec<{ body: string }>('SELECT body FROM lab_runs WHERE experiment=? ORDER BY date DESC LIMIT ?', experiment, limit).toArray().map(r => JSON.parse(r.body) as LabRun);
  }
  /** Charged attempts for the shared provider ledger. */
  used(model: string, quotaDay: string): number {
    return this.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM lab_attempts WHERE model=? AND quota_day=?', model, quotaDay).one().count;
  }
  starts(model: string, since: number): number[] {
    return this.sql.exec<{ started: number }>('SELECT started FROM lab_attempts WHERE model=? AND started>? ORDER BY started', model, since).toArray().map(r => r.started);
  }
  pending(): LabAttempt | null {
    return this.sql.exec<LabAttempt>("SELECT id,run,unit,model,quota_day,started,deadline,state,digest,result FROM lab_attempts WHERE state<>'applied' ORDER BY started LIMIT 1").toArray()[0] ?? null;
  }

  /** Creates today's independent runs and, once the debate is complete, its
   * jury. Idempotent: an existing run is never replaced. */
  ensure(date: string, model: GeminiModel, now: number, debate: CompletedDebate | null) {
    const s = this.settings();
    if (!s.enabled || !s.activatedOn || date < s.activatedOn) return;
    // A failed run construction (e.g. a puzzle that fails its independent
    // check) skips that experiment; it must never block the debate's alarm.
    const create = (id: string, make: () => LabRun) => { if (this.run(id)) return; try { this.save(make()); } catch (error) { console.error('lab_run_not_created', id, error instanceof Error ? error.message : 'unknown'); } };
    create(date + '/coin', () => newCoinRun(date, model, now));
    create(date + '/companions', () => newCompanionRun(date, model, now));
    create(date + '/mystery', () => newMysteryRun(date, model, now));
    if (debate && debate.id === date) create(date + '/verdict', () => newVerdictRun(debate, model, now));
  }
  /** Earlier dates close; their valid observations stay as recorded. */
  closeBefore(date: string, now: number) {
    for (const row of this.sql.exec<{ body: string }>("SELECT body FROM lab_runs WHERE date<? AND json_extract(body,'$.status')='running'", date).toArray()) {
      this.save(closeRun(JSON.parse(row.body) as LabRun, 'window_closed', now));
    }
  }
  /** The next dispatchable unit for a date: verdict first, then the run with
   * the fewest charged attempts so no experiment starves another. */
  next(date: string, now: number): { run: LabRun; unitId: string } | null {
    const runs = PRIORITY.map(e => this.run(date + '/' + e)).filter((r): r is LabRun => !!r && r.status === 'running' && (r.nextAttemptAt ?? 0) <= now && !!nextUnit(r));
    const verdict = runs.find(r => r.experiment === 'verdict');
    const spent = (r: LabRun) => r.units.reduce((n, u) => n + u.attempts, 0) / r.units.length;
    const pick = verdict ?? runs.sort((a, b) => spent(a) - spent(b) || PRIORITY.indexOf(a.experiment) - PRIORITY.indexOf(b.experiment))[0];
    return pick ? { run: pick, unitId: nextUnit(pick)!.id } : null;
  }
  /** Earliest time any running run for the date can dispatch, if any. */
  wakeAt(date: string): number | null {
    const times = LAB_EXPERIMENTS.map(e => this.run(date + '/' + e)).filter((r): r is LabRun => !!r && r.status === 'running' && !!nextUnit(r)).map(r => r.nextAttemptAt ?? 0);
    return times.length ? Math.min(...times) : null;
  }
  /** Synchronous reservation before any network call. The ID is unique per
   * unit and attempt number, so a crash can never reuse an execution identity. */
  reserve(run: LabRun, unitId: string, quotaDay: string, now: number, prompt: GeminiPrompt, digest: string): LabAttempt {
    const n = this.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM lab_attempts WHERE run=? AND unit=?', run.id, unitId).one().count + 1;
    const attempt: LabAttempt = { id: `${run.id}/${unitId}#${n}`, run: run.id, unit: unitId, model: run.model as GeminiModel, quota_day: quotaDay,
      started: now, deadline: now + 180_000, state: 'pending', digest, result: null };
    this.sql.exec('INSERT INTO lab_attempts(id,run,unit,model,quota_day,started,deadline,state,digest,prompt) VALUES(?,?,?,?,?,?,?,?,?,?)',
      attempt.id, attempt.run, attempt.unit, attempt.model, quotaDay, now, attempt.deadline, 'pending', digest, JSON.stringify(prompt));
    return attempt;
  }
  saveResult(id: string, result: GeminiResult) {
    this.sql.exec("UPDATE lab_attempts SET state='result',result=? WHERE id=? AND state='pending'", JSON.stringify(result), id);
  }
  /** Applies a saved (or unknown) outcome exactly once. */
  settle(attempt: LabAttempt, result: GeminiResult, now: number) {
    const stored = this.sql.exec<{ state: string }>('SELECT state FROM lab_attempts WHERE id=?', attempt.id).toArray()[0];
    if (!stored || stored.state === 'applied') return;
    const run = this.run(attempt.run);
    if (run) this.save(applyLabResult(run, attempt.unit, attempt.id, attempt.started, attempt.digest, result, now));
    this.sql.exec("UPDATE lab_attempts SET state='applied' WHERE id=?", attempt.id);
  }
  retain(now: number) {
    this.sql.exec("UPDATE lab_attempts SET prompt=NULL,result=NULL WHERE state='applied' AND started<? AND (prompt IS NOT NULL OR result IS NOT NULL)", now - 90 * 86_400_000);
  }

  /* ---------- public reads: stored results only ---------- */
  day(experiment: LabExperiment, date: string, today: string, debate: { status: string } | null): LabDay {
    const run = this.run(date + '/' + experiment), s = this.settings();
    if (run) return { date, run, availability: run.status === 'running' ? 'pending' : run.status === 'unavailable' ? 'unavailable' : 'recorded', reason: run.reason };
    const scheduled = s.enabled && !!s.activatedOn && date >= s.activatedOn && date === today;
    if (experiment === 'verdict') {
      if (!debate) return { date, run: null, availability: scheduled ? 'pending' : 'not_recorded', reason: scheduled ? 'debate_not_started' : null };
      if (debate.status === 'held') return { date, run: null, availability: 'unavailable', reason: 'debate_incomplete' };
      if (debate.status !== 'complete') return { date, run: null, availability: scheduled ? 'pending' : 'unavailable', reason: scheduled ? 'debate_in_progress' : 'debate_incomplete' };
      return { date, run: null, availability: scheduled ? 'pending' : 'not_recorded', reason: scheduled ? 'jury_scheduled' : null };
    }
    return { date, run: null, availability: scheduled ? 'pending' : 'not_recorded', reason: scheduled ? 'scheduled' : null };
  }
  /** Compact history: units keep their outputs; receipts stay in day views. */
  history(experiment: LabExperiment): LabRun[] {
    return this.runs(experiment).map(run => ({ ...run, units: run.units.map(u => ({ ...u, receipts: [] })) }));
  }
  dates(experiment: LabExperiment): string[] {
    return this.sql.exec<{ date: string }>('SELECT date FROM lab_runs WHERE experiment=? ORDER BY date DESC LIMIT 400', experiment).toArray().map(r => r.date);
  }
  diagnostics() {
    return { ...this.settings(),
      attempts: this.sql.exec('SELECT model,quota_day,COUNT(*) AS count FROM lab_attempts GROUP BY model,quota_day ORDER BY quota_day DESC LIMIT 30').toArray(),
      runs: this.sql.exec<{ body: string }>('SELECT body FROM lab_runs ORDER BY date DESC, experiment LIMIT 20').toArray().map(r => { const run = JSON.parse(r.body) as LabRun;
        return { id: run.id, status: run.status, reason: run.reason, units: run.units.map(u => u.id + ':' + u.status + ':' + u.attempts).join(' ') }; }) };
  }
  export(date: string) {
    return { runs: LAB_EXPERIMENTS.map(e => this.run(date + '/' + e)).filter(Boolean),
      attempts: this.sql.exec("SELECT * FROM lab_attempts WHERE run LIKE ? ORDER BY started", date + '/%').toArray() };
  }
}
