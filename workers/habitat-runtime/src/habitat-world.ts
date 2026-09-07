import { recoveryCore, recoveryPage, type RecoveryPageRequest } from './recovery';
import { makeCheckpoint, RULES_VERSION, sealRecoveryExport } from './checkpoint';
import type { Outcome } from '../../../src/lib/habitat/engine/verbs';
import type { ResidentId } from '../../../src/lib/habitat/residents';
import { worldSociety } from '../../../src/lib/habitat/society';
import { DurableObject } from 'cloudflare:workers';
import {
  adminCommandSchema,
  archiveFilterSchema,
  cognitionJobSchema,
  MAX_RESIDENTS,
  parseRuntimeConfig,
  SQL_SCHEMA_VERSION,
  type ArchiveFilter,
  type CognitionJob,
  type ProviderAttemptResult,
  type RuntimeConfig,
} from './contracts';
import {
  advanceWorldWatch,
  createGenesisWorld,
  decodeCognition,
  deserializeWorldState,
  prepareCognition,
  selectCognitionSubject,
  serializeWorldState,
  WORLD_CODEC_VERSION,
  worldSnapshot,
  worldRelationships,
  projectHappening,
} from './domain';
import { SqlQuotaLedger } from './quota';
import { routeCognition } from './providers/router';
import type { Happening } from '../../../src/lib/habitat/engine/state';

type RuntimeRow = {
  mode: 'running' | 'paused';
  pause_reason: string | null;
  resident_capacity: number;
  world_revision: number;
  control_revision: number;
  sim_day: number;
  sim_minute: number;
  alarm_generation: number;
  next_alarm_at_ms: number | null;
  next_alarm_reason: string | null;
  next_watch_at_ms: number | null;
  last_committed_run_id: string | null;
  last_committed_at_ms: number | null;
  last_error_code: string | null;
};

type JobRow = {
  job_id: string;
  envelope_json: string;
  status: 'pending' | 'running' | 'deferred' | 'resolved' | 'applied' | 'dead';
  attempts: number;
  lease_expires_at_ms: number | null;
  provider: string | null;
  output_json: string | null;
};

type WorldRow = {
  codec_version: number;
  world_revision: number;
  state_json: string;
  updated_at_ms: number;
};

type WatchRunRow = {
  run_id: string;
  cause_world_revision: number;
  sim_day: number;
  sim_watch: number;
  control_revision: number;
  subject_id: string;
  cognition_job_id: string;
  phase: 'claimed' | 'committed' | 'cancelled';
  due_at_ms: number;
  committed_at_ms: number | null;
};

type HappeningRow = {
  sequence: number;
  happening_id: string;
  world_revision: number;
  day: number;
  watch: number;
  minute: number;
  room_id: string;
  who_json: string;
  text: string;
  kind: Happening['kind'];
  committed_at_ms: number;
};

type AttemptRow = {
  provider: string;
  model: string;
  ok: number;
  kind: string | null;
  retryable: number;
  retry_at_ms: number | null;
  detail_code: string | null;
  latency_ms: number;
  recorded_at_ms: number;
};

type CommandResult = {
  commandId: string;
  kind: 'pause' | 'resume';
  applied: boolean;
  mode: 'running' | 'paused';
  controlRevision: number;
};

export type SnapshotResult = {
  worldRevision: number;
  snapshot: ReturnType<typeof worldSnapshot>;
};

export type ArchiveResult = {
  day: number;
  filters: Omit<ArchiveFilter, 'day'>;
  entries: Array<Happening & { sourceRoom?: string }>;
};

export class HabitatWorld extends DurableObject<Env> {
  private readonly state: DurableObjectState;
  private readonly sql: SqlStorage;
  private readonly runtimeEnv: Env;
  private readonly config: RuntimeConfig;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.sql = state.storage.sql;
    this.runtimeEnv = env;
    this.config = parseRuntimeConfig(env);
    this.state.blockConcurrencyWhile(async () => {
      this.ensureSchema();
      await this.state.storage.sync();
    });
  }

  async getStatus(): Promise<Record<string, unknown>> {
    const runtime = this.runtime();
    const queueRows = this.sql.exec<{ status: string; count: number }>(
      'SELECT status, COUNT(*) AS count FROM cognition_jobs GROUP BY status ORDER BY status',
    ).toArray();
    const oldest = firstRow(this.sql.exec<{ oldest_due_at_ms: number | null }>(
      `SELECT MIN(due_at_ms) AS oldest_due_at_ms
         FROM cognition_jobs WHERE status IN ('pending', 'deferred')`,
    ));
    const alarm = await this.state.storage.getAlarm();
    const groqConfigured = Boolean(readSecret(this.runtimeEnv, 'GROQ_API_KEY'));
    const recentAttempts = this.sql.exec<AttemptRow>(
      `SELECT provider, model, ok, kind, retryable, retry_at_ms,
              detail_code, latency_ms, recorded_at_ms
         FROM provider_attempts ORDER BY recorded_at_ms DESC LIMIT 8`,
    ).toArray();
    const overdueByMs = runtime.mode === 'running' && runtime.next_watch_at_ms !== null ? Math.max(0, Date.now() - runtime.next_watch_at_ms) : 0;
    const healthy = runtime.mode === 'paused'
      || (
        runtime.last_error_code === null
        && overdueByMs < 120_000
        && runtime.next_watch_at_ms !== null
        && runtime.next_alarm_at_ms !== null
        && alarm !== null
      );

    return {
      schemaVersion: SQL_SCHEMA_VERSION,
      worldCodecVersion: WORLD_CODEC_VERSION,
      habitatId: this.config.HABITAT_ID,
      residentCapacity: runtime.resident_capacity,
      mode: runtime.mode,
      pauseReason: runtime.pause_reason,
      health: healthy ? 'healthy' : 'degraded',
      overdueByMs, lastSuccessfulWatchAtMs: runtime.last_committed_at_ms,
      worldRevision: runtime.world_revision,
      controlRevision: runtime.control_revision,
      simTime: { day: runtime.sim_day, minute: runtime.sim_minute },
      lastRun: runtime.last_committed_run_id === null ? null : {
        runId: runtime.last_committed_run_id,
        committedAtMs: runtime.last_committed_at_ms,
      },
      nextWatchAtMs: runtime.next_watch_at_ms,
      nextWake: runtime.next_alarm_at_ms === null ? null : {
        generation: runtime.alarm_generation,
        dueAtMs: runtime.next_alarm_at_ms,
        reason: runtime.next_alarm_reason,
        installedAtMs: alarm,
      },
      queue: {
        counts: Object.fromEntries(queueRows.map((row) => [row.status, row.count])),
        oldestDueAtMs: oldest?.oldest_due_at_ms ?? null,
      },
      providers: {
        ...new SqlQuotaLedger(this.sql, this.config).snapshot(Date.now()),
        configured: {
          workersAI: true,
          groq: groqConfigured,
        },
        recentAttempts: recentAttempts.map((attempt) => ({
          provider: attempt.provider,
          model: attempt.model,
          ok: attempt.ok === 1,
          kind: attempt.kind,
          retryable: attempt.retryable === 1,
          retryAtMs: attempt.retry_at_ms,
          detailCode: attempt.detail_code,
          latencyMs: attempt.latency_ms,
          recordedAtMs: attempt.recorded_at_ms,
        })),
      },
      lastErrorCode: runtime.last_error_code,
    };
  }

  getSnapshot(): SnapshotResult {
    const runtime = this.runtime();
    const stored = this.world();
    if (stored.world_revision !== runtime.world_revision) {
      throw new RangeError('world revision metadata is inconsistent');
    }
    return {
      worldRevision: stored.world_revision,
      snapshot: worldSnapshot(deserializeWorldState(stored.state_json)),
    };
  }

  /** One SQLite revision supplies both the population and its changing bonds. */
  getObserver() {
    const runtime = this.runtime();
    const stored = this.world();
    if (stored.world_revision !== runtime.world_revision) throw new RangeError('world revision mismatch');
    const state = deserializeWorldState(stored.state_json);
    return {
      worldRevision: stored.world_revision,
      snapshot: worldSnapshot(state),
      relationships: worldRelationships(state),
      society: worldSociety(state),
    };
  }

  getArchive(value: unknown): ArchiveResult {
    const filter = archiveFilterSchema.parse(value);
    const room = filter.room ?? null;
    const person = filter.person ?? null;
    const rows = this.sql.exec<HappeningRow>(
      `SELECT h.sequence, h.happening_id, h.world_revision, h.day, h.watch,
              h.minute, h.room_id, h.who_json, h.text, h.kind, h.committed_at_ms
         FROM happenings AS h
        WHERE h.day = ?
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM happening_people AS hp
             WHERE hp.happening_id = h.happening_id AND hp.resident_id = ?
          ))
        ORDER BY h.minute ASC, h.sequence ASC`,
      filter.day,
      person,
      person,
    ).toArray();
    return {
      day: filter.day,
      filters: {
        ...(filter.room ? { room: filter.room } : {}),
        ...(filter.person ? { person: filter.person } : {}),
      },
      // Filter after projecting aliases so old and new names form one timeline.
      // Original room_id and every original byte stay in the append-only table.
      entries: rows.map(happeningFromRow).map(projectHappening)
        .filter((entry) => room === null || entry.room === room || entry.sourceRoom === room),
    };
  }

  async pause(value: unknown): Promise<CommandResult> {
    const command = adminCommandSchema.parse(value);
    const replay = this.commandReplay(command.commandId, 'pause');
    if (replay) return replay;

    const runtime = this.runtime();
    this.assertControlRevision(runtime, command.expectedControlRevision);
    const applied = runtime.mode !== 'paused';
    const revision = applied ? runtime.control_revision + 1 : runtime.control_revision;
    const result: CommandResult = {
      commandId: command.commandId,
      kind: 'pause',
      applied,
      mode: 'paused',
      controlRevision: revision,
    };

    this.state.storage.transactionSync(() => {
      if (applied) {
        this.sql.exec(
          `UPDATE runtime_meta SET mode = 'paused', pause_reason = ?,
             control_revision = ?, next_alarm_at_ms = NULL, next_alarm_reason = NULL
           WHERE singleton = 1`,
          command.reason ?? 'administrative pause',
          revision,
        );
        this.appendEvent('runtime.paused', command.issuedAtMs, {
          commandId: command.commandId,
          reason: command.reason ?? null,
        });
      }
      this.saveCommand(command.commandId, 'pause', command.issuedAtMs, result);
    });
    await this.state.storage.deleteAlarm();
    return result;
  }

  async resume(value: unknown): Promise<CommandResult> {
    const command = adminCommandSchema.parse(value);
    const replay = this.commandReplay(command.commandId, 'resume');
    if (replay) return replay;

    const runtime = this.runtime();
    this.assertControlRevision(runtime, command.expectedControlRevision);
    const applied = runtime.mode !== 'running';
    const revision = applied ? runtime.control_revision + 1 : runtime.control_revision;
    const result: CommandResult = {
      commandId: command.commandId,
      kind: 'resume',
      applied,
      mode: 'running',
      controlRevision: revision,
    };
    const firstWatchAtMs = Date.now() + this.config.TICK_INTERVAL_MS;

    this.state.storage.transactionSync(() => {
      if (applied) {
        this.sql.exec(
          `UPDATE runtime_meta SET mode = 'running', pause_reason = NULL,
             control_revision = ?, next_watch_at_ms = ? WHERE singleton = 1`,
          revision,
          firstWatchAtMs,
        );
        this.appendEvent('runtime.resumed', command.issuedAtMs, {
          commandId: command.commandId,
          firstWatchAtMs,
        });
      }
      this.saveCommand(command.commandId, 'resume', command.issuedAtMs, result);
    });
    if (applied) {
      await this.scheduleWake(firstWatchAtMs, 'resume');
    } else if ((await this.state.storage.getAlarm()) === null) {
      await this.reconcile();
    }
    return result;
  }

  enqueueCognition(value: unknown): { accepted: boolean; jobId: string } {
    const job = cognitionJobSchema.parse(value);
    if (job.habitatId !== this.config.HABITAT_ID) {
      throw new TypeError('job habitatId does not match this runtime');
    }
    const cursor = this.sql.exec(
      `INSERT OR IGNORE INTO cognition_jobs (
         job_id, envelope_json, status, pressure, created_at_ms, due_at_ms, attempts
       ) VALUES (?, ?, 'pending', ?, ?, ?, 0)`,
      job.jobId,
      JSON.stringify(job),
      job.pressure,
      job.createdAtMs,
      job.createdAtMs,
    );
    return { accepted: cursor.rowsWritten > 0, jobId: job.jobId };
  }

  /** Operator-only smoke check: real bounded provider I/O, no world tick or
   * consequence. Persist the claim before awaiting so replay cannot spend twice. */
  async checkCognition(value: unknown): Promise<Record<string, unknown>> {
    const command = adminCommandSchema.parse(value);
    const replay = firstRow(this.sql.exec<{ kind: string; response_json: string }>(
      'SELECT kind, response_json FROM admin_commands WHERE command_id = ?', command.commandId,
    ));
    if (replay) {
      if (replay.kind !== 'cognition-check') throw new TypeError('commandId already used');
      return JSON.parse(replay.response_json) as Record<string, unknown>;
    }
    const runtime = this.runtime();
    this.assertControlRevision(runtime, command.expectedControlRevision);
    const world = deserializeWorldState(this.world().state_json);
    const prepared = prepareCognition({
      state: world, worldRevision: runtime.world_revision, habitatId: this.config.HABITAT_ID,
      runId: `check:${crypto.randomUUID()}`, createdAtMs: Date.now(),
      controlRevision: runtime.control_revision,
    });
    // Verification has its own quota identity and cannot consume a scheduled job.
    prepared.job.jobId = `check:${crypto.randomUUID()}`;
    const pending = { commandId: command.commandId, status: 'pending', worldRevision: runtime.world_revision };
    this.sql.exec('INSERT INTO admin_commands VALUES (?, ?, ?, ?)',
      command.commandId, 'cognition-check', command.issuedAtMs, JSON.stringify(pending));
    const groqApiKey = readSecret(this.runtimeEnv, 'GROQ_API_KEY');
    const result = await routeCognition({
      ai: this.runtimeEnv.AI, ...(groqApiKey ? { groqApiKey } : {}),
      config: this.config, job: prepared.job, attemptOrdinal: 1,
      quota: new SqlQuotaLedger(this.sql, this.config),
    });
    const attempts = result.status === 'completed' ? (result.attempts ?? [result.result]) : result.reasons;
    for (const attempt of attempts) this.saveAttempt(attempt, Date.now());
    const intent = result.status === 'completed' ? decodeCognition(prepared.actor, result.result.payload) : undefined;
    const response = {
      commandId: command.commandId, status: 'complete', ok: Boolean(intent),
      worldRevision: runtime.world_revision, actor: prepared.actor,
      ...(intent ? { verb: intent.verb } : {}),
      attempts: attempts.map((attempt) => ({ provider: attempt.provider, ok: attempt.ok,
        ...(!attempt.ok ? { kind: attempt.kind, detailCode: attempt.detailCode ?? null } : {}) })),
    };
    this.sql.exec('UPDATE admin_commands SET response_json = ? WHERE command_id = ?', JSON.stringify(response), command.commandId);
    return response;
  }

  async reconcile(): Promise<{ mode: string; repaired: boolean; dueAtMs: number | null }> {
    let runtime = this.runtime();
    if (runtime.mode === 'paused') {
      const alarm = await this.state.storage.getAlarm();
      if (alarm !== null) await this.state.storage.deleteAlarm();
      return { mode: runtime.mode, repaired: alarm !== null, dueAtMs: null };
    }

    if (runtime.next_watch_at_ms === null) {
      const nextWatchAtMs = Date.now() + this.config.TICK_INTERVAL_MS;
      this.sql.exec(
        'UPDATE runtime_meta SET next_watch_at_ms = ? WHERE singleton = 1',
        nextWatchAtMs,
      );
      runtime = this.runtime();
    }

    const dueAtMs = runtime.next_watch_at_ms!;
    const installed = await this.state.storage.getAlarm();
    if (runtime.next_alarm_at_ms === null) {
      await this.scheduleWake(dueAtMs, 'clock');
      return { mode: runtime.mode, repaired: true, dueAtMs };
    }
    if (installed === null) {
      await this.state.storage.setAlarm(Math.max(Date.now(), runtime.next_alarm_at_ms));
      return { mode: runtime.mode, repaired: true, dueAtMs: runtime.next_alarm_at_ms };
    }
    return { mode: runtime.mode, repaired: false, dueAtMs: runtime.next_alarm_at_ms };
  }

  async alarm(): Promise<void> {
    const nowMs = Date.now();
    let activeRunId: string | undefined;
    try {
      let runtime = this.runtime();
      if (runtime.mode === 'paused') {
        this.sql.exec(
          'UPDATE runtime_meta SET next_alarm_at_ms = NULL, next_alarm_reason = NULL WHERE singleton = 1',
        );
        return;
      }
      if (runtime.next_watch_at_ms === null) {
        const dueAtMs = nowMs + this.config.TICK_INTERVAL_MS;
        this.sql.exec(
          'UPDATE runtime_meta SET next_watch_at_ms = ? WHERE singleton = 1',
          dueAtMs,
        );
        await this.scheduleWake(dueAtMs, 'clock');
        return;
      }
      if (runtime.next_watch_at_ms > nowMs) {
        await this.scheduleWake(runtime.next_watch_at_ms, 'clock');
        return;
      }

      const prepared = this.prepareWatchRun(nowMs);
      activeRunId = prepared.runId;
      await this.processCognitionJob(prepared.jobId, nowMs);
      const outcome = this.commitWatchRun(prepared.runId, Date.now());
      runtime = this.runtime();
      if (outcome.status === 'waiting') {
        await this.scheduleWake(outcome.retryAtMs, 'retry');
        return;
      }
      if (outcome.status !== 'committed' || runtime.mode === 'paused') return;
      await this.scheduleWake(runtime.next_watch_at_ms!, 'clock');
    } catch (error) {
      const code = safeErrorCode(error);
      this.sql.exec(
        'UPDATE runtime_meta SET last_error_code = ? WHERE singleton = 1',
        code,
      );
      if (activeRunId) {
        this.sql.exec(
          'UPDATE watch_runs SET error_code = ? WHERE run_id = ? AND phase = ?',
          code,
          activeRunId,
          'claimed',
        );
      }
      if (this.runtime().mode === 'running') {
        await this.scheduleWake(Date.now() + 15 * 60 * 1_000, 'retry');
      }
    }
  }

  private prepareWatchRun(nowMs: number): { runId: string; jobId: string } {
    return this.state.storage.transactionSync(() => {
      const runtime = this.runtime();
      if (runtime.mode !== 'running') throw new RangeError('runtime is paused');
      if (runtime.next_watch_at_ms === null || runtime.next_watch_at_ms > nowMs) {
        throw new RangeError('the next simulation watch is not due');
      }
      const stored = this.world();
      if (stored.codec_version !== WORLD_CODEC_VERSION) {
        throw new RangeError('unsupported world codec version');
      }
      if (stored.world_revision !== runtime.world_revision) {
        throw new RangeError('world revision metadata is inconsistent');
      }

      const state = deserializeWorldState(stored.state_json);
      const runId = `${this.config.HABITAT_ID}:world:${runtime.world_revision}:watch`;
      const prepared = prepareCognition({
        state,
        worldRevision: runtime.world_revision,
        habitatId: this.config.HABITAT_ID,
        runId,
        createdAtMs: nowMs,
        controlRevision: runtime.control_revision,
        recentHistory: this.recentHistoryFor(selectCognitionSubject(state)),
      });
      const existing = firstRow(this.sql.exec<WatchRunRow>(
        'SELECT * FROM watch_runs WHERE cause_world_revision = ?',
        runtime.world_revision,
      ));

      if (existing && existing.phase !== 'committed'
        && (existing.control_revision !== runtime.control_revision || existing.phase === 'cancelled')) {
        this.sql.exec(
          `UPDATE cognition_jobs SET status = 'dead', lease_expires_at_ms = NULL,
             error_code = 'control_revision_changed'
           WHERE job_id = ? AND status NOT IN ('applied', 'dead')`,
          existing.cognition_job_id,
        );
        this.sql.exec(
          `UPDATE watch_runs SET control_revision = ?, subject_id = ?, cognition_job_id = ?,
             phase = 'claimed', due_at_ms = ?, decision_source = NULL, decision_json = NULL,
             committed_at_ms = NULL, error_code = NULL WHERE run_id = ?`,
          runtime.control_revision,
          prepared.actor,
          prepared.job.jobId,
          runtime.next_watch_at_ms,
          runId,
        );
      } else if (!existing) {
        this.sql.exec(
          `INSERT INTO watch_runs (
             run_id, cause_world_revision, sim_day, sim_watch, control_revision,
             subject_id, cognition_job_id, phase, due_at_ms
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'claimed', ?)`,
          runId,
          runtime.world_revision,
          state.day,
          state.watch,
          runtime.control_revision,
          prepared.actor,
          prepared.job.jobId,
          runtime.next_watch_at_ms,
        );
      }

      const active = existing?.phase === 'committed'
        ? existing
        : firstRow(this.sql.exec<WatchRunRow>('SELECT * FROM watch_runs WHERE run_id = ?', runId))!;
      if (active.phase === 'committed') return { runId, jobId: active.cognition_job_id };

      this.sql.exec(
        `INSERT OR IGNORE INTO cognition_jobs (
           job_id, envelope_json, status, pressure, created_at_ms, due_at_ms, attempts
         ) VALUES (?, ?, 'pending', ?, ?, ?, 0)`,
        prepared.job.jobId,
        JSON.stringify(prepared.job),
        prepared.job.pressure,
        prepared.job.createdAtMs,
        prepared.job.createdAtMs,
      );
      return { runId, jobId: prepared.job.jobId };
    });
  }

  private async processCognitionJob(jobId: string, nowMs: number): Promise<void> {
    const row = firstRow(this.sql.exec<JobRow>(
      `SELECT job_id, envelope_json, status, attempts, lease_expires_at_ms, provider, output_json
       FROM cognition_jobs WHERE job_id = ?`,
      jobId,
    ));
    if (!row || row.status !== 'pending') return;

    const claimed = this.sql.exec(
      `UPDATE cognition_jobs SET status = 'running', attempts = 1, lease_expires_at_ms = ?
       WHERE job_id = ? AND status = 'pending'`,
      nowMs + 5 * 60 * 1_000,
      jobId,
    );
    if (claimed.rowsWritten === 0) return;

    let job: CognitionJob;
    try {
      job = cognitionJobSchema.parse(JSON.parse(row.envelope_json));
    } catch {
      this.sql.exec(
        `UPDATE cognition_jobs SET status = 'dead', error_code = 'invalid_envelope',
           lease_expires_at_ms = NULL WHERE job_id = ?`,
        jobId,
      );
      return;
    }

    const quota = new SqlQuotaLedger(this.sql, this.config);
    const groqApiKey = readSecret(this.runtimeEnv, 'GROQ_API_KEY');
    const result = await routeCognition({
      ai: this.runtimeEnv.AI,
      ...(groqApiKey ? { groqApiKey } : {}),
      config: this.config,
      job,
      attemptOrdinal: 1,
      quota,
    });
    this.persistRouterResult(jobId, result, Date.now());
  }

  private commitWatchRun(
    runId: string,
    nowMs: number,
  ): { status: 'committed' | 'skipped' } | { status: 'waiting'; retryAtMs: number } {
    return this.state.storage.transactionSync(() => {
      const run = firstRow(this.sql.exec<WatchRunRow>(
        'SELECT * FROM watch_runs WHERE run_id = ?',
        runId,
      ));
      if (!run) throw new RangeError('watch run was not prepared');
      if (run.phase === 'committed') return { status: 'skipped' as const };
      if (run.phase !== 'claimed') throw new RangeError('watch run is not claimable');

      const runtime = this.runtime();
      if (runtime.mode !== 'running' || runtime.control_revision !== run.control_revision) {
        this.cancelWatchRun(run, 'control_revision_changed');
        return { status: 'skipped' as const };
      }
      if (runtime.world_revision !== run.cause_world_revision) {
        this.cancelWatchRun(run, 'world_revision_changed');
        return { status: 'skipped' as const };
      }

      const stored = this.world();
      if (stored.world_revision !== run.cause_world_revision) {
        throw new RangeError('stored world revision changed during cognition');
      }
      const state = deserializeWorldState(stored.state_json);
      const job = firstRow(this.sql.exec<JobRow>(
        `SELECT job_id, envelope_json, status, attempts, lease_expires_at_ms, provider, output_json
         FROM cognition_jobs WHERE job_id = ?`,
        run.cognition_job_id,
      ));
      if (job?.status === 'running' && job.lease_expires_at_ms !== null
        && job.lease_expires_at_ms > nowMs) {
        return {
          status: 'waiting' as const,
          retryAtMs: Math.max(nowMs + 1_000, job.lease_expires_at_ms),
        };
      }

      let intent: ReturnType<typeof decodeCognition>;
      let decisionSource = 'routine';
      if (job?.status === 'resolved' && job.output_json !== null) {
        try {
          const envelope = cognitionJobSchema.parse(JSON.parse(job.envelope_json));
          const actor = envelope.subjects[0]?.id;
          if (envelope.cause.worldRevision === run.cause_world_revision
            && actor === run.subject_id) {
            intent = decodeCognition(
              run.subject_id as Parameters<typeof decodeCognition>[0],
              JSON.parse(job.output_json),
            );
            if (intent) decisionSource = job.provider ?? 'model';
          }
        } catch {
          intent = undefined;
        }
      }

      let intentionOutcome: Outcome | undefined;
      advanceWorldWatch(state, intent, run.subject_id as ResidentId, (outcome) => { intentionOutcome = outcome; });
      const nextWorldRevision = runtime.world_revision + 1;
      const nextWatchAtMs = nextWatchDueAt(
        runtime.next_watch_at_ms ?? nowMs,
        nowMs,
        this.config.TICK_INTERVAL_MS,
      );
      const simMinute = (state.watch - 1) * 360;

      const worldUpdate = this.sql.exec(
        `UPDATE world_state SET codec_version = ?, world_revision = ?, state_json = ?,
           updated_at_ms = ? WHERE singleton = 1 AND world_revision = ?`,
        WORLD_CODEC_VERSION,
        nextWorldRevision,
        serializeWorldState(state),
        nowMs,
        run.cause_world_revision,
      );
      if (worldUpdate.rowsWritten !== 1) throw new RangeError('world commit lost its revision race');
      const runtimeUpdate = this.sql.exec(
        `UPDATE runtime_meta SET world_revision = ?, sim_day = ?, sim_minute = ?,
           next_watch_at_ms = ?, next_alarm_at_ms = NULL, next_alarm_reason = NULL,
           last_committed_run_id = ?, last_committed_at_ms = ?, last_error_code = NULL
         WHERE singleton = 1 AND world_revision = ?`,
        nextWorldRevision,
        state.day,
        simMinute,
        nextWatchAtMs,
        runId,
        nowMs,
        run.cause_world_revision,
      );
      if (runtimeUpdate.rowsWritten !== 1) throw new RangeError('runtime commit lost its revision race');

      this.archiveWatchHappenings(run, state, nextWorldRevision, nowMs);
      for (const event of state.economy.events) this.sql.exec(
        'INSERT OR IGNORE INTO economic_events (sequence, world_revision, day, watch, event_json) VALUES (?, ?, ?, ?, ?)',
        event.sequence, nextWorldRevision, event.day, event.watch, JSON.stringify(event));
      if (state.watch === 1) this.saveCheckpoint(nextWorldRevision, serializeWorldState(state), nowMs);
      this.appendEvent('world.intention.result', nowMs, { runId, actor: run.subject_id,
        intent: intent ? JSON.parse(JSON.stringify(intent)) : null,
        accepted: intentionOutcome?.ok ?? false,
        refusal: intentionOutcome?.refused ?? (intent ? null : 'no_valid_cognition'),
      });

      if (job) {
        if (intent && intentionOutcome?.ok) {
          this.sql.exec(
            `UPDATE cognition_jobs SET status = 'applied', lease_expires_at_ms = NULL,
               error_code = NULL WHERE job_id = ?`,
            job.job_id,
          );
        } else {
          this.sql.exec(
            `UPDATE cognition_jobs SET status = 'dead', lease_expires_at_ms = NULL,
               error_code = ? WHERE job_id = ?`,
            intent ? `intention_refused:${intentionOutcome?.refused ?? 'unknown'}` : job.status === 'resolved' ? 'invalid_domain_intent' : 'routine_fallback',
            job.job_id,
          );
        }
      }
      this.sql.exec(
        `UPDATE watch_runs SET phase = 'committed', decision_source = ?, decision_json = ?,
           committed_at_ms = ?, error_code = NULL WHERE run_id = ? AND phase = 'claimed'`,
        decisionSource,
        JSON.stringify(intent ?? null),
        nowMs,
        runId,
      );
      this.appendEvent('world.watch.committed', nowMs, {
        runId,
        worldRevision: nextWorldRevision,
        day: state.day,
        watch: state.watch,
        subjectId: run.subject_id,
        decisionSource,
      });
      return { status: 'committed' as const };
    });
  }

  private cancelWatchRun(run: WatchRunRow, errorCode: string): void {
    this.sql.exec(
      `UPDATE watch_runs SET phase = 'cancelled', error_code = ?
       WHERE run_id = ? AND phase = 'claimed'`,
      errorCode,
      run.run_id,
    );
    this.sql.exec(
      `UPDATE cognition_jobs SET status = 'dead', lease_expires_at_ms = NULL, error_code = ?
       WHERE job_id = ? AND status NOT IN ('applied', 'dead')`,
      errorCode,
      run.cognition_job_id,
    );
  }

  private persistRouterResult(
    jobId: string,
    result: Awaited<ReturnType<typeof routeCognition>>,
    nowMs: number,
  ): void {
    if (result.status === 'completed') {
      this.sql.exec(
        `UPDATE cognition_jobs SET status = 'resolved', provider = ?, model = ?,
           output_json = ?, resolved_at_ms = ?, lease_expires_at_ms = NULL,
           error_code = NULL WHERE job_id = ? AND status = 'running'`,
        result.result.provider,
        result.result.model,
        JSON.stringify(result.result.payload),
        nowMs,
        jobId,
      );
      for (const attempt of result.attempts ?? [result.result]) this.saveAttempt(attempt, nowMs);
      return;
    }

    for (const reason of result.reasons) this.saveAttempt(reason, nowMs);
    if (result.status === 'deferred') {
      this.sql.exec(
        `UPDATE cognition_jobs SET status = 'deferred', due_at_ms = ?,
           lease_expires_at_ms = NULL, error_code = 'providers_deferred'
         WHERE job_id = ? AND status = 'running'`,
        result.retryAtMs,
        jobId,
      );
      return;
    }
    this.sql.exec(
      `UPDATE cognition_jobs SET status = 'dead', lease_expires_at_ms = NULL,
         error_code = 'providers_rejected' WHERE job_id = ? AND status = 'running'`,
      jobId,
    );
  }

  private saveAttempt(result: ProviderAttemptResult, nowMs: number): void {
    this.sql.exec(
      `INSERT OR IGNORE INTO provider_attempts (
         attempt_id, provider, model, ok, kind, retryable, retry_at_ms,
         detail_code, latency_ms, recorded_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      result.attemptId,
      result.provider,
      result.model,
      result.ok ? 1 : 0,
      result.ok ? null : result.kind,
      result.ok ? 0 : result.retryable ? 1 : 0,
      result.ok ? null : result.retryAtMs ?? null,
      result.ok ? null : result.detailCode ?? null,
      result.latencyMs,
      nowMs,
    );
  }

  private recentHistoryFor(personId: string): Happening[] {
    const rows = this.sql.exec<HappeningRow>(
      `SELECT h.sequence, h.happening_id, h.world_revision, h.day, h.watch,
              h.minute, h.room_id, h.who_json, h.text, h.kind, h.committed_at_ms
         FROM happenings AS h
         JOIN happening_people AS hp ON hp.happening_id = h.happening_id
        WHERE hp.resident_id = ?
        ORDER BY h.day DESC, h.minute DESC, h.sequence DESC
        LIMIT 8`,
      personId,
    ).toArray();
    return rows.reverse().map(happeningFromRow);
  }

  private archiveWatchHappenings(
    run: WatchRunRow,
    state: ReturnType<typeof deserializeWorldState>,
    worldRevision: number,
    committedAtMs: number,
  ): void {
    const entries = state.record.filter(
      (entry) => entry.day === run.sim_day && entry.watch === run.sim_watch,
    );
    entries.forEach((entry, index) => {
      this.archiveHappening(
        `${run.run_id}:happening:${index}`,
        entry,
        worldRevision,
        committedAtMs,
      );
    });
  }

  private archiveHappening(
    happeningId: string,
    entry: Happening,
    worldRevision: number,
    committedAtMs: number,
  ): void {
    this.sql.exec(
      `INSERT OR IGNORE INTO happenings (
         happening_id, world_revision, day, watch, minute, room_id,
         who_json, text, kind, committed_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      happeningId,
      worldRevision,
      entry.day,
      entry.watch,
      entry.minute,
      entry.room,
      JSON.stringify(entry.who),
      entry.text,
      entry.kind,
      committedAtMs,
    );
    for (const residentId of entry.who) {
      this.sql.exec(
        `INSERT OR IGNORE INTO happening_people (happening_id, resident_id)
         VALUES (?, ?)`,
        happeningId,
        residentId,
      );
    }
  }

  private async scheduleWake(dueAtMs: number, reason: 'clock' | 'retry' | 'resume'): Promise<number> {
    const runtime = this.runtime();
    if (runtime.mode === 'paused') return dueAtMs;
    const generation = runtime.alarm_generation + 1;
    this.sql.exec(
      `UPDATE runtime_meta SET alarm_generation = ?, next_alarm_at_ms = ?,
         next_alarm_reason = ? WHERE singleton = 1`,
      generation,
      dueAtMs,
      reason,
    );
    await this.state.storage.setAlarm(dueAtMs);
    return dueAtMs;
  }

  private runtime(): RuntimeRow {
    return this.sql.exec<RuntimeRow>('SELECT * FROM runtime_meta WHERE singleton = 1').one();
  }

  private world(): WorldRow {
    return this.sql.exec<WorldRow>('SELECT * FROM world_state WHERE singleton = 1').one();
  }

  private assertControlRevision(runtime: RuntimeRow, expected?: number): void {
    if (expected !== undefined && expected !== runtime.control_revision) {
      throw new RangeError('control revision conflict');
    }
  }

  private commandReplay(commandId: string, kind: 'pause' | 'resume'): CommandResult | undefined {
    const row = firstRow(this.sql.exec<{ kind: string; response_json: string }>(
      'SELECT kind, response_json FROM admin_commands WHERE command_id = ?',
      commandId,
    ));
    if (!row) return undefined;
    if (row.kind !== kind) throw new TypeError('commandId was already used for another command');
    return JSON.parse(row.response_json) as CommandResult;
  }

  private saveCommand(
    commandId: string,
    kind: 'pause' | 'resume',
    issuedAtMs: number,
    result: CommandResult,
  ): void {
    this.sql.exec(
      `INSERT INTO admin_commands (command_id, kind, issued_at_ms, response_json)
       VALUES (?, ?, ?, ?)`,
      commandId,
      kind,
      issuedAtMs,
      JSON.stringify(result),
    );
  }

  private appendEvent(type: string, occurredAtMs: number, detail: Record<string, unknown>): void {
    this.sql.exec(
      'INSERT INTO runtime_events (type, occurred_at_ms, detail_json) VALUES (?, ?, ?)',
      type,
      occurredAtMs,
      JSON.stringify(detail),
    );
  }

  private ensureSchema(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runtime_meta (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        mode TEXT NOT NULL CHECK (mode IN ('running', 'paused')),
        pause_reason TEXT,
        resident_capacity INTEGER NOT NULL CHECK (resident_capacity = 25),
        world_revision INTEGER NOT NULL,
        control_revision INTEGER NOT NULL,
        sim_day INTEGER NOT NULL,
        sim_minute INTEGER NOT NULL,
        alarm_generation INTEGER NOT NULL,
        next_alarm_at_ms INTEGER,
        next_alarm_reason TEXT,
        last_committed_run_id TEXT,
        last_committed_at_ms INTEGER,
        last_error_code TEXT
      );
      CREATE TABLE IF NOT EXISTS alarm_runs (
        run_id TEXT PRIMARY KEY,
        generation INTEGER NOT NULL UNIQUE,
        phase TEXT NOT NULL CHECK (phase IN ('claimed', 'tick-committed', 'completed', 'failed')),
        received_at_ms INTEGER NOT NULL,
        tick_committed_at_ms INTEGER,
        completed_at_ms INTEGER,
        error_code TEXT
      );
      CREATE TABLE IF NOT EXISTS cognition_jobs (
        job_id TEXT PRIMARY KEY,
        envelope_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'deferred', 'resolved', 'applied', 'dead')),
        pressure REAL NOT NULL,
        created_at_ms INTEGER NOT NULL,
        due_at_ms INTEGER NOT NULL,
        attempts INTEGER NOT NULL,
        lease_expires_at_ms INTEGER,
        provider TEXT,
        model TEXT,
        output_json TEXT,
        resolved_at_ms INTEGER,
        error_code TEXT
      );
      CREATE INDEX IF NOT EXISTS cognition_due_idx
        ON cognition_jobs(status, due_at_ms, pressure DESC);
      CREATE TABLE IF NOT EXISTS provider_attempts (
        attempt_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        ok INTEGER NOT NULL,
        kind TEXT,
        retryable INTEGER NOT NULL,
        retry_at_ms INTEGER,
        detail_code TEXT,
        latency_ms INTEGER NOT NULL,
        recorded_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS provider_usage_daily (
        day TEXT NOT NULL,
        provider TEXT NOT NULL,
        requests INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        neurons INTEGER NOT NULL,
        actual_requests INTEGER NOT NULL,
        actual_input_tokens INTEGER NOT NULL,
        actual_output_tokens INTEGER NOT NULL,
        actual_neurons INTEGER NOT NULL,
        PRIMARY KEY (day, provider)
      );
      CREATE TABLE IF NOT EXISTS quota_reservations (
        reservation_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        day TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('reserved', 'dispatched', 'settled')),
        max_requests INTEGER NOT NULL,
        max_input_tokens INTEGER NOT NULL,
        max_output_tokens INTEGER NOT NULL,
        max_neurons INTEGER NOT NULL,
        actual_requests INTEGER,
        actual_input_tokens INTEGER,
        actual_output_tokens INTEGER,
        actual_neurons INTEGER,
        created_at_ms INTEGER NOT NULL,
        dispatched_at_ms INTEGER,
        settled_at_ms INTEGER
      );
      CREATE TABLE IF NOT EXISTS provider_breakers (
        provider TEXT PRIMARY KEY,
        open_until_ms INTEGER NOT NULL,
        reason TEXT,
        failure_streak INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS admin_commands (
        command_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        issued_at_ms INTEGER NOT NULL,
        response_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runtime_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        occurred_at_ms INTEGER NOT NULL,
        detail_json TEXT NOT NULL
      );
      INSERT OR IGNORE INTO runtime_meta (
        singleton, mode, pause_reason, resident_capacity, world_revision,
        control_revision, sim_day, sim_minute, alarm_generation
      ) VALUES (1, 'paused', 'awaiting-domain-engine', ${MAX_RESIDENTS}, 0, 0, 100, 0, 0);
    `);
    this.sql.exec(
      'INSERT OR IGNORE INTO _sql_schema_migrations (version, applied_at_ms) VALUES (1, ?)',
      Date.now(),
    );

    let version = firstRow(this.sql.exec<{ version: number }>(
      'SELECT MAX(version) AS version FROM _sql_schema_migrations',
    ))?.version ?? 0;
    if (version < 2) {
      this.migrateToV2();
      version = 2;
    }
    if (version < 3) this.migrateToV3();
    if (version < 4) this.migrateToV4();
    if (version < 5) this.migrateToV5();
    if (version < 6) this.migrateToV6();
  }

  private migrateToV2(): void {
    this.state.storage.transactionSync(() => {
      const legacy = this.sql.exec<{ world_revision: number }>(
        'SELECT world_revision FROM runtime_meta WHERE singleton = 1',
      ).one();
      if (legacy.world_revision !== 0) {
        throw new RangeError('cannot replace a non-empty legacy world during migration');
      }

      this.sql.exec('ALTER TABLE runtime_meta ADD COLUMN next_watch_at_ms INTEGER');
      this.sql.exec(`
        CREATE TABLE world_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          codec_version INTEGER NOT NULL,
          world_revision INTEGER NOT NULL,
          state_json TEXT NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );
        CREATE TABLE watch_runs (
          run_id TEXT PRIMARY KEY,
          cause_world_revision INTEGER NOT NULL UNIQUE,
          sim_day INTEGER NOT NULL,
          sim_watch INTEGER NOT NULL CHECK (sim_watch BETWEEN 1 AND 4),
          control_revision INTEGER NOT NULL,
          subject_id TEXT NOT NULL,
          cognition_job_id TEXT NOT NULL UNIQUE,
          phase TEXT NOT NULL CHECK (phase IN ('claimed', 'committed', 'cancelled')),
          decision_source TEXT,
          decision_json TEXT,
          due_at_ms INTEGER NOT NULL,
          committed_at_ms INTEGER,
          error_code TEXT
        );
      `);
      const nowMs = Date.now();
      this.sql.exec(
        `INSERT INTO world_state (
           singleton, codec_version, world_revision, state_json, updated_at_ms
         ) VALUES (1, ?, 0, ?, ?)`,
        WORLD_CODEC_VERSION,
        serializeWorldState(createGenesisWorld()),
        nowMs,
      );
      this.sql.exec(
        `UPDATE cognition_jobs SET status = 'dead', lease_expires_at_ms = NULL,
           error_code = 'superseded_by_domain_v2'
         WHERE status IN ('pending', 'running', 'deferred')`,
      );
      this.sql.exec(
        `UPDATE runtime_meta SET mode = 'paused',
           pause_reason = CASE WHEN mode = 'running' THEN 'domain_v2_migration' ELSE pause_reason END,
           next_watch_at_ms = NULL, next_alarm_at_ms = NULL, next_alarm_reason = NULL
         WHERE singleton = 1`,
      );
      this.sql.exec(
        'INSERT INTO _sql_schema_migrations (version, applied_at_ms) VALUES (?, ?)',
        2,
        nowMs,
      );
    });
  }

  private migrateToV3(): void {
    this.state.storage.transactionSync(() => {
      this.sql.exec(`
        CREATE TABLE happenings (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          happening_id TEXT NOT NULL UNIQUE,
          world_revision INTEGER NOT NULL,
          day INTEGER NOT NULL CHECK (day >= 0),
          watch INTEGER NOT NULL CHECK (watch BETWEEN 1 AND 4),
          minute INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 1439),
          room_id TEXT NOT NULL,
          who_json TEXT NOT NULL,
          text TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('work', 'need', 'meeting', 'power', 'note')),
          committed_at_ms INTEGER NOT NULL
        );
        CREATE INDEX happenings_day_idx
          ON happenings(day, minute, sequence);
        CREATE INDEX happenings_room_idx
          ON happenings(room_id, day, minute);
        CREATE TABLE happening_people (
          happening_id TEXT NOT NULL,
          resident_id TEXT NOT NULL,
          PRIMARY KEY (happening_id, resident_id)
        );
        CREATE INDEX happening_people_resident_idx
          ON happening_people(resident_id, happening_id);
      `);
      this.backfillCurrentRecord();
      this.sql.exec(
        'INSERT INTO _sql_schema_migrations (version, applied_at_ms) VALUES (?, ?)',
        3,
        Date.now(),
      );
    });
  }

  private migrateToV4(): void {
    this.state.storage.transactionSync(() => {
      const stored = this.world();
      const migrated = serializeWorldState(deserializeWorldState(stored.state_json));
      this.sql.exec(`CREATE TABLE IF NOT EXISTS world_layout_backups (
        migration INTEGER PRIMARY KEY,
        world_revision INTEGER NOT NULL,
        codec_version INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        archived_at_ms INTEGER NOT NULL
      )`);
      const nowMs = Date.now();
      this.sql.exec(
        'INSERT INTO world_layout_backups VALUES (?, ?, ?, ?, ?)',
        4, stored.world_revision, stored.codec_version, stored.state_json, nowMs,
      );
      this.sql.exec(
        'UPDATE world_state SET state_json = ?, codec_version = ?, updated_at_ms = ? WHERE singleton = 1',
        migrated, WORLD_CODEC_VERSION, nowMs,
      );
      this.sql.exec(
        'INSERT INTO _sql_schema_migrations (version, applied_at_ms) VALUES (?, ?)', 4, nowMs,
      );
      this.appendEvent('world.layout_migrated', nowMs, { fromCodec: stored.codec_version, toCodec: WORLD_CODEC_VERSION });
    });
  }

  private migrateToV5(): void {
    this.state.storage.transactionSync(() => {
      const stored = this.world();
      const migrated = deserializeWorldState(stored.state_json);
      const nowMs = Date.now();
      this.sql.exec('INSERT INTO world_layout_backups VALUES (?, ?, ?, ?, ?)',
        5, stored.world_revision, stored.codec_version, stored.state_json, nowMs);
      this.sql.exec('UPDATE world_state SET state_json = ?, codec_version = ?, updated_at_ms = ? WHERE singleton = 1',
        serializeWorldState(migrated), WORLD_CODEC_VERSION, nowMs);
      this.sql.exec('INSERT INTO _sql_schema_migrations (version, applied_at_ms) VALUES (?, ?)', 5, nowMs);
      this.appendEvent('world.economy_introduced', nowMs, {
        fromCodec: stored.codec_version, toCodec: WORLD_CODEC_VERSION,
        startedOnDay: migrated.economy.startedOnDay, initialCells: migrated.economy.ledger.initialCells,
        stock: migrated.economy.stock,
      });
    });
  }

  /** Read-only consistent recovery export. Callers must authenticate before this
   * RPC; public observer DTOs intentionally cannot restore private lives. */
  getRecoveryExport(): Record<string, unknown> {
    return this.state.storage.transactionSync(() => {
      const stored = this.world();
      const checkpoint = makeCheckpoint(stored.world_revision, stored.state_json);
      const exportedAtMs = Date.now();
      const core = recoveryCore(this.sql, exportedAtMs);
      return sealRecoveryExport({ format: 'villa-recovery-v1', exportedAtMs, habitatId: this.config.HABITAT_ID, checkpoint, ...core });
    });
  }

  getRecoveryPage(request: RecoveryPageRequest) {
    return this.state.storage.transactionSync(() => recoveryPage(this.sql, request));
  }

  private saveCheckpoint(revision: number, stateJson: string, nowMs: number): void {
    const checkpoint = makeCheckpoint(revision, stateJson);
    this.sql.exec('INSERT OR IGNORE INTO world_checkpoints (world_revision, codec_version, rules_version, sha256, state_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)',
      revision, checkpoint.codecVersion, RULES_VERSION, checkpoint.sha256, stateJson, nowMs);
  }

  private migrateToV6(): void {
    this.state.storage.transactionSync(() => {
      const stored = this.world(), nowMs = Date.now();
      const stateJson = serializeWorldState(deserializeWorldState(stored.state_json));
      this.sql.exec('INSERT INTO world_layout_backups VALUES (?, ?, ?, ?, ?)',
        6, stored.world_revision, stored.codec_version, stored.state_json, nowMs);
      this.sql.exec(`CREATE TABLE economic_events (
        sequence INTEGER PRIMARY KEY, world_revision INTEGER NOT NULL, day INTEGER NOT NULL, watch INTEGER NOT NULL, event_json TEXT NOT NULL);
        CREATE INDEX economic_events_day_idx ON economic_events(day, sequence);
        CREATE TABLE world_checkpoints (
          world_revision INTEGER PRIMARY KEY, codec_version INTEGER NOT NULL, rules_version TEXT NOT NULL,
          sha256 TEXT NOT NULL, state_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL);`);
      this.sql.exec('UPDATE world_state SET state_json = ?, codec_version = ?, updated_at_ms = ? WHERE singleton = 1', stateJson, WORLD_CODEC_VERSION, nowMs);
      this.saveCheckpoint(stored.world_revision, stateJson, nowMs);
      this.sql.exec(`UPDATE cognition_jobs SET status='dead', lease_expires_at_ms=NULL, error_code='unsupported_queue_retired'
        WHERE status IN ('pending','deferred') AND NOT EXISTS (SELECT 1 FROM watch_runs WHERE cognition_job_id=cognition_jobs.job_id AND phase='claimed')`);
      this.sql.exec('INSERT INTO _sql_schema_migrations (version, applied_at_ms) VALUES (?, ?)', 6, nowMs);
      this.appendEvent('world.agency_introduced', nowMs, { fromCodec: stored.codec_version, toCodec: WORLD_CODEC_VERSION,
        rulesVersion: RULES_VERSION, worldRevision: stored.world_revision });
    });
  }

  private backfillCurrentRecord(): void {
    const stored = this.world();
    const world = deserializeWorldState(stored.state_json);
    const ordinalByRun = new Map<string, number>();
    for (const entry of world.record) {
      const run = firstRow(this.sql.exec<WatchRunRow>(
        `SELECT * FROM watch_runs
          WHERE sim_day = ? AND sim_watch = ? AND phase = 'committed'
          ORDER BY cause_world_revision DESC LIMIT 1`,
        entry.day,
        entry.watch,
      ));
      const runId = run?.run_id ?? `migration:v3:world:${stored.world_revision}`;
      const ordinal = ordinalByRun.get(runId) ?? 0;
      ordinalByRun.set(runId, ordinal + 1);
      this.archiveHappening(
        `${runId}:happening:${ordinal}`,
        entry,
        run ? run.cause_world_revision + 1 : stored.world_revision,
        run?.committed_at_ms ?? stored.updated_at_ms,
      );
    }
  }
}

function happeningFromRow(row: HappeningRow): Happening {
  const who = JSON.parse(row.who_json) as Happening['who'];
  return {
    day: row.day,
    watch: row.watch,
    minute: row.minute,
    room: row.room_id as Happening['room'],
    who,
    text: row.text,
    kind: row.kind,
  };
}

function firstRow<T extends Record<string, SqlStorageValue>>(
  cursor: SqlStorageCursor<T>,
): T | undefined {
  return cursor.toArray()[0];
}

function readSecret(env: Env, key: 'GROQ_API_KEY' | 'ADMIN_TOKEN'): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error) return error.name.slice(0, 80);
  return 'unknown_error';
}

function nextWatchDueAt(previousDueAtMs: number, nowMs: number, intervalMs: number): number {
  let dueAtMs = previousDueAtMs + intervalMs;
  if (dueAtMs <= nowMs) {
    const missed = Math.floor((nowMs - dueAtMs) / intervalMs) + 1;
    dueAtMs += missed * intervalMs;
  }
  return dueAtMs;
}

export function adminSecret(env: Env): string | undefined {
  return readSecret(env, 'ADMIN_TOKEN');
}
