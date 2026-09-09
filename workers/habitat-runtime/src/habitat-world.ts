import { archivedSpeech, type ArchivedSpeech } from '../../../src/lib/habitat/archive-message';
import { createHash } from 'node:crypto';
import { recoveryCore, recoveryPage, type RecoveryPageRequest } from './recovery';
import { makeCheckpoint, RULES_VERSION, sealRecoveryExport } from './checkpoint';
import { RESIDENT_BY_ID, type ResidentId } from '../../../src/lib/habitat/residents';
import { worldSociety } from '../../../src/lib/habitat/society';
import {
  createSocietyState, parseSocietyState, expireSocietyState, markSocietyAttempt,
  societyPublicView,
  type SocietyState, type PreparedTurn,
} from '../../../src/lib/habitat/society/index';
import { advanceSocietyWatch } from '../../../src/lib/habitat/society/record-watch';
import { COGNITION_CADENCE_MS, COGNITION_REVIEW_MS, hasSocietyRequestWindow, nextSocietyActor, nextSocietyReconsiderationAt, prepareSocietyJob } from './society-scheduler';
import { applyIssuedSocietyProtocol } from './society-issued-protocol';
import { applySocietyProtocol } from './society-protocol';
import { publicRecordPublication } from '../../../src/lib/habitat/society/public';
import { parseArchivedPublication } from '../../../src/lib/habitat/society/record-archive';
import { DurableObject } from 'cloudflare:workers';
import {
  adminCommandSchema,
  archiveFilterSchema,
  recordsFilterSchema,
  cognitionJobSchema,
  MAX_RESIDENTS,
  parseRuntimeConfig,
  SQL_SCHEMA_VERSION,
  type ArchiveFilter,
  type RecordsFilter,
  type ProviderAttemptResult,
  type RuntimeConfig,
} from './contracts';
import {
  createGenesisWorld,
  deserializeWorldState,
  serializeWorldState,
  WORLD_CODEC_VERSION,
  worldSnapshot,
  worldRelationships,
  projectHappening,
} from './domain';
import { SqlQuotaLedger } from './quota';
import { migrateQuotaModels } from './quota-migration';
import { cognitionReadyAt, routeCognition } from './providers/router';
import { GROQ_120B_MODEL } from './providers/groq';
import { compactTerminalCognition } from './cognition-retention';
import { saveProviderRejection } from './rejection-log';
import { savedStructuralRetryFeedback } from './retry-feedback';
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
  next_cognition_at_ms: number | null;
  last_committed_run_id: string | null;
  last_committed_at_ms: number | null;
  last_error_code: string | null;
  last_cognition_error_code: string | null;
};

type JobRow = {
  job_id: string;
  envelope_json: string;
  status: 'pending' | 'running' | 'deferred' | 'resolved' | 'applied' | 'dead';
  attempts: number;
  lease_expires_at_ms: number | null;
  provider: string | null;
  output_json: string | null;
  due_at_ms: number;
  error_code: string | null;
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
  entries: Array<Happening & { sourceRoom?: string; speech?: ArchivedSpeech }>;
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

  // Observer-only cache. Scheduling, quota reservations and administrative
  // decisions always read their authoritative rows directly.
  private statusCache: { key: string; expiresAtMs: number; value: Promise<Record<string, unknown>> } | undefined;

  async getStatus(): Promise<Record<string, unknown>> {
    const runtime = this.runtime(), now = Date.now(), key = JSON.stringify(runtime);
    if (this.statusCache?.key === key && this.statusCache.expiresAtMs > now) return this.statusCache.value;
    const value = this.buildStatus(runtime);
    const entry = { key, expiresAtMs: now + 10_000, value };
    this.statusCache = entry;
    try { return await value; }
    catch (error) {
      // An older failed request must not evict a newer revision's cache.
      if (this.statusCache === entry) this.statusCache = undefined;
      throw error;
    }
  }

  private async buildStatus(runtime: RuntimeRow): Promise<Record<string, unknown>> {
    const queueRows = this.sql.exec<{ status: string; count: number }>(
      `SELECT status, COUNT(*) AS count FROM cognition_jobs
         WHERE status IN ('pending','deferred','running','resolved') GROUP BY status ORDER BY status`,
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
      storage: { bytes: this.sql.databaseSize, perObjectFreeLimitBytes: 1_000_000_000 },
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
      cognition: this.cognitionHealth(Date.now()),
      nextWake: runtime.next_alarm_at_ms === null ? null : {
        generation: runtime.alarm_generation,
        dueAtMs: runtime.next_alarm_at_ms,
        reason: runtime.next_alarm_reason,
        installedAtMs: alarm,
      },
      queue: {
        scope: 'active',
        counts: Object.fromEntries(queueRows.map((row) => [row.status, row.count])),
        oldestDueAtMs: oldest?.oldest_due_at_ms ?? null,
      },
      providers: {
        ...new SqlQuotaLedger(this.sql, this.config).snapshot(Date.now()),
        configured: {
          workersAI: true,
          groq: groqConfigured,
          groq120B: groqConfigured && this.config.GROQ_120B_ENABLED,
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

  getWorldRevision(): number {
    return this.sql.exec<{ world_revision: number }>('SELECT world_revision FROM runtime_meta WHERE singleton=1').one().world_revision;
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
      agency: societyPublicView(this.society()),
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
      entries: rows.map(row => happeningFromRow(row, this.runtimeEnv.HABITAT_ID)).map(projectHappening)
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
             control_revision = ?, next_watch_at_ms = ?, next_cognition_at_ms = ? WHERE singleton = 1`,
          revision,
          firstWatchAtMs,
          Date.now() + 60_000,
        );
        this.appendEvent('runtime.resumed', command.issuedAtMs, {
          commandId: command.commandId,
          firstWatchAtMs,
        });
      }
      this.saveCommand(command.commandId, 'resume', command.issuedAtMs, result);
    });
    if (applied) {
      await this.scheduleWake(Math.min(firstWatchAtMs, this.runtime().next_cognition_at_ms!), 'resume');
    } else {
      // A deployment may introduce an earlier cognitive wake while preserving
      // the installed physical alarm. Reconciliation never advances either clock.
      await this.reconcile();
    }
    return result;
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
    const sequence = this.sql.exec<{ sequence: number }>('SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM cognition_contexts').one().sequence;
    const society = this.society(), actor = nextSocietyActor(society, Date.now(), sequence) ?? 'A';
    const prepared = prepareSocietyJob({ state: society, world, actor, worldRevision: runtime.world_revision,
      habitatId: this.config.HABITAT_ID, nowMs: Date.now(), sequence, generation: runtime.control_revision });
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
      canDispatch: () => this.runtime().control_revision === runtime.control_revision && Date.now() < prepared.turn.expiresAtMs,
      validatePayload: (payload) => {
        const checked = applySocietyProtocol(prepared.job.outputContract.version, society, world, prepared.turn, payload,
          { nowMs: Date.now(), generation: runtime.control_revision });
        return checked.ok ? true : checked.code;
      },
      onAttempt: (attempt) => { if (!attempt.ok) this.saveAttempt(attempt, Date.now()); },
    });
    const attempts = result.status === 'completed' ? (result.attempts ?? [result.result]) : result.reasons;
    for (const attempt of attempts) this.saveAttempt(attempt, Date.now());
    const valid = result.status === 'completed';
    const response = {
      commandId: command.commandId, status: 'complete', ok: valid,
      worldRevision: runtime.world_revision, actor, contract: 'society_turn',
      attempts: attempts.map((attempt) => ({ provider: attempt.provider, ok: attempt.ok,
        ...(!attempt.ok ? { kind: attempt.kind, detailCode: attempt.detailCode ?? null } : {}) })),
    };
    this.sql.exec('UPDATE admin_commands SET response_json = ? WHERE command_id = ?', JSON.stringify(response), command.commandId);
    return response;
  }

  async reconcile(): Promise<{ mode: string; repaired: boolean; dueAtMs: number | null }> {
    const runtime = this.runtime();
    const installed = await this.state.storage.getAlarm();
    if (runtime.mode === 'paused') {
      if (installed !== null) await this.state.storage.deleteAlarm();
      return { mode: runtime.mode, repaired: installed !== null, dueAtMs: null };
    }
    const nowMs = Date.now();
    if (runtime.next_watch_at_ms === null) this.sql.exec(
      'UPDATE runtime_meta SET next_watch_at_ms = ? WHERE singleton = 1', nowMs + this.config.TICK_INTERVAL_MS);
    if (runtime.next_cognition_at_ms === null) this.sql.exec(
      'UPDATE runtime_meta SET next_cognition_at_ms = ? WHERE singleton = 1', nowMs + 60_000);
    const dueAtMs = this.nextDueAt(nowMs);
    const repaired = installed === null || Math.abs(installed - Math.max(nowMs, dueAtMs)) > 1_000
      || runtime.next_alarm_at_ms === null;
    if (repaired) await this.scheduleWake(Math.max(nowMs, dueAtMs), 'clock');
    return { mode: runtime.mode, repaired, dueAtMs };
  }

  /** One authority, two independent clocks. No provider await surrounds the
   * physical commit, and a delayed thought cannot tick the world again. */
  async alarm(): Promise<void> {
    try {
      const nowMs = Date.now();
      if (this.runtime().mode === 'paused') {
        this.sql.exec('UPDATE runtime_meta SET next_alarm_at_ms = NULL, next_alarm_reason = NULL WHERE singleton = 1');
        return;
      }
      this.commitPhysicalWatch(nowMs);
      try {
        await this.runCognitionWake(nowMs);
      } catch (error) {
        this.sql.exec('UPDATE runtime_meta SET last_cognition_error_code=?,next_cognition_at_ms=? WHERE singleton=1',
          safeErrorCode(error), Date.now() + COGNITION_CADENCE_MS);
      }
      if (this.runtime().mode === 'running') await this.scheduleWake(this.nextDueAt(Date.now()), 'clock');
    } catch (error) {
      this.sql.exec('UPDATE runtime_meta SET last_error_code = ? WHERE singleton = 1', safeErrorCode(error));
      if (this.runtime().mode === 'running') await this.scheduleWake(Date.now() + 60_000, 'retry');
    }
  }

  private async runCognitionWake(nowMs: number): Promise<void> {
    this.retireStaleJobs(nowMs);
    // A crash after response persistence resumes here without another call.
    for (const row of this.sql.exec<{ job_id: string }>(
      "SELECT j.job_id FROM cognition_jobs j JOIN cognition_contexts c ON c.job_id=j.job_id WHERE j.status='resolved' ORDER BY c.sequence LIMIT 25",
    ).toArray()) this.applySocietyJob(row.job_id, nowMs);
    const runtime = this.runtime();
    if (runtime.next_cognition_at_ms === null || runtime.next_cognition_at_ms <= nowMs) {
      this.sql.exec('UPDATE runtime_meta SET next_cognition_at_ms = ? WHERE singleton = 1', nowMs + COGNITION_CADENCE_MS);
      const queued = firstRow(this.sql.exec<{ job_id: string }>(
        `SELECT j.job_id FROM cognition_jobs j JOIN cognition_contexts c ON c.job_id=j.job_id
         WHERE j.status IN ('pending','deferred') AND j.due_at_ms <= ? ORDER BY j.due_at_ms, c.sequence LIMIT 1`, nowMs));
      const jobId = queued?.job_id ?? await this.prepareNextSocietyJob(nowMs);
      if (jobId) {
        await this.processSocietyJob(jobId, nowMs);
        this.applySocietyJob(jobId, Date.now());
      }
    }
  }

  private nextDueAt(nowMs: number): number {
    const runtime = this.runtime();
    // Queue retries share the cadence. No busy-loop on a denied quota or lease.
    return Math.max(nowMs + 1_000, Math.min(runtime.next_watch_at_ms ?? nowMs + this.config.TICK_INTERVAL_MS,
      runtime.next_cognition_at_ms ?? nowMs + COGNITION_CADENCE_MS));
  }

  private society(): SocietyState {
    const row = this.sql.exec<{ state_json: string }>('SELECT state_json FROM society_state WHERE singleton=1').one();
    const parsed = parseSocietyState(JSON.parse(row.state_json));
    if (!parsed.ok) throw new RangeError(parsed.code);
    return parsed.state;
  }

  private saveSociety(society: SocietyState, nowMs: number): void {
    const validated = parseSocietyState(society);
    if (!validated.ok) throw new RangeError(validated.code);
    const archivedThrough = this.sql.exec<{ archived_record_next_id: number }>(
      'SELECT archived_record_next_id FROM society_state WHERE singleton=1').one().archived_record_next_id;
    for (const publication of society.records.publications) {
      const ordinal = Number(publication.id.split(':').at(-1));
      if (ordinal < archivedThrough) continue;
      const draft = society.records.drafts.find((draft) => draft.id === publication.draftId);
      if (!draft || draft.contentHash !== publication.contentHash) throw new RangeError('Missing publication content');
      this.sql.exec(`INSERT OR IGNORE INTO authored_publications
        (publication_id,draft_id,author,is_public,published_at_ms,publication_json) VALUES (?,?,?,?,?,?)`, publication.id,
        publication.draftId, publication.author, publication.audience === 'public' ? 1 : 0, publication.publishedAtMs, JSON.stringify({ publication, draft }));
    }
    this.sql.exec('UPDATE society_state SET codec_version=?, revision=?, state_json=?, updated_at_ms=?, archived_record_next_id=? WHERE singleton=1',
      society.version, society.revision, JSON.stringify(society), nowMs, society.records.nextId);
  }

  /** Explicit observer request only. Indexed, bounded and independent of the
   * model queue; private/shared drafts never enter this historical projection. */
  getRecords(raw: RecordsFilter) {
    const filter = recordsFilterSchema.parse(raw);
    const rows = this.sql.exec<{ sequence: number; publication_json: string }>(
      'SELECT sequence,publication_json FROM authored_publications WHERE is_public=1 AND sequence<? ORDER BY sequence DESC LIMIT ?',
      filter.before ?? Number.MAX_SAFE_INTEGER, filter.limit + 1).toArray();
    const page = rows.slice(0, filter.limit);
    const entries = page.map((row) => {
      const { publication, draft } = parseArchivedPublication(JSON.parse(row.publication_json));
      const parent = draft.parent ? firstRow(this.sql.exec<{ publication_id: string }>(
        'SELECT publication_id FROM authored_publications WHERE draft_id=? AND is_public=1 AND sequence<? ORDER BY sequence DESC LIMIT 1',
        draft.parent.draftId, row.sequence))?.publication_id ?? null : null;
      const entry = publicRecordPublication(publication, draft, parent);
      if (!entry) throw new RangeError('Invalid public publication archive');
      return entry;
    });
    return { entries, nextCursor: rows.length > filter.limit ? page.at(-1)!.sequence : null };
  }

  private cognitionHealth(nowMs: number) {
    const runtime = this.runtime(), society = this.society();
    const successes = Object.values(society.minds).flatMap((m) => m.lastSuccessAtMs === null ? [] : [m.lastSuccessAtMs]);
    const successfulLastWatch = successes.filter((at) => nowMs - at <= COGNITION_REVIEW_MS).length;
    const pendingResidents = this.sql.exec<{ actor: ResidentId }>(
      `SELECT DISTINCT c.actor FROM cognition_contexts c JOIN cognition_jobs j ON j.job_id=c.job_id
       WHERE j.status IN ('pending','deferred','running','resolved') ORDER BY c.actor`,
    ).toArray().map((r) => r.actor);
    return { health: runtime.mode === 'paused' ? 'paused' : runtime.last_cognition_error_code !== null ? 'degraded' : successfulLastWatch === 25 ? 'healthy'
      : nowMs - society.createdAtMs < COGNITION_REVIEW_MS ? 'starting' : 'degraded',
      successfulLastWatch, total: 25, neverThought: 25 - successes.length, lastErrorCode: runtime.last_cognition_error_code,
      lastSuccessfulThoughtAtMs: successes.length ? Math.max(...successes) : null,
      nextOpportunityAtMs: runtime.mode === 'running' ? runtime.next_cognition_at_ms : null,
      pendingResidents, waitingForReply: [...new Set(society.conversations.filter((c) => c.status === 'open').map((c) => c.nextSpeaker!))] };
  }

  private postponeCognition(readyAtMs: number, nowMs: number, society: SocietyState): void {
    // Counting a large context can await lazy tokenizer initialization. Never
    // persist a deadline that is already past when that work finishes.
    const currentMs = Math.max(nowMs, Date.now());
    // Selection used nowMs: a review/backoff crossing during that await must
    // still trigger reconsideration, at the fresh minimum rather than be lost.
    const reconsiderAt = nextSocietyReconsiderationAt(society, nowMs, this.runtime().next_watch_at_ms);
    this.sql.exec('UPDATE runtime_meta SET next_cognition_at_ms=? WHERE singleton=1',
      Math.max(currentMs + COGNITION_CADENCE_MS, Math.ceil(Math.min(readyAtMs, reconsiderAt ?? readyAtMs))));
  }

  private async prepareNextSocietyJob(nowMs: number): Promise<string | undefined> {
    const captured = this.state.storage.transactionSync(() => {
      const runtime = this.runtime();
      if (runtime.mode !== 'running') return undefined;
      const world = deserializeWorldState(this.world().state_json);
      let society = this.society();
      const expired = expireSocietyState(society, world, nowMs);
      if (expired !== society) { society = expired; this.publishSociety(society, world, nowMs); }
      const occupied = new Set(this.sql.exec<{ actor: ResidentId }>(
        `SELECT c.actor FROM cognition_contexts c JOIN cognition_jobs j ON j.job_id=c.job_id
         WHERE j.status IN ('pending','deferred','running','resolved')`).toArray().map((r) => r.actor));
      const sequence = this.sql.exec<{ sequence: number }>('SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM cognition_contexts').one().sequence;
      return { world, society, occupied, sequence, generation: runtime.control_revision, worldRevision: this.runtime().world_revision };
    });
    if (!captured) return undefined;
    const { world, society, sequence, generation, worldRevision } = captured;
    const rejected = new Set(captured.occupied), quota = new SqlQuotaLedger(this.sql, this.config);
    const groqAvailable = Boolean(readSecret(this.runtimeEnv, 'GROQ_API_KEY'));
    let pacingSnapshots: Parameters<typeof cognitionReadyAt>[0]['pacingSnapshots'];
    let selected: ReturnType<typeof prepareSocietyJob> | undefined, minimumReady = Number.POSITIVE_INFINITY;
    for (let checked = 0; checked < MAX_RESIDENTS; checked += 1) {
      const actor = nextSocietyActor(society, nowMs, sequence, rejected);
      if (!actor) break;
      rejected.add(actor);
      const candidate = prepareSocietyJob({ state: society, world, actor, nowMs, sequence,
        generation, worldRevision, habitatId: this.config.HABITAT_ID,
        ...(this.config.GROQ_120B_ENABLED ? { routingPolicy: 'free-models-v1' as const } : {}) });
      let readyAtMs: number | null = nowMs;
      if (society.minds[actor].lastAttemptAtMs !== null) {
        // One indexed quota snapshot per provider for the entire bounded search.
        // Different candidate sizes are evaluated without rereading its history.
        pacingSnapshots ??= { workersAI: quota.pacingSnapshot('workers-ai', this.config.WORKERS_AI_MODEL, nowMs),
          ...(groqAvailable ? { groq: quota.pacingSnapshot('groq', this.config.GROQ_MODEL, nowMs),
            ...(this.config.GROQ_120B_ENABLED ? { groq120B: quota.pacingSnapshot('groq', GROQ_120B_MODEL, nowMs) } : {}) } : {}) };
        readyAtMs = await cognitionReadyAt({ job: candidate.job, config: this.config, quota, nowMs,
          groqAvailable, pacingSnapshots, freshJob: true });
        const current = this.runtime();
        if (current.mode !== 'running' || current.control_revision !== generation || current.world_revision !== worldRevision) return undefined;
      }
      if (readyAtMs === null) continue;
      if (readyAtMs <= Date.now()) { selected = candidate; break; }
      minimumReady = Math.min(minimumReady, readyAtMs);
    }
    return this.state.storage.transactionSync(() => {
      const current = this.runtime();
      if (current.mode !== 'running' || current.control_revision !== generation || current.world_revision !== worldRevision) return undefined;
      if (!selected) {
        if (Number.isFinite(minimumReady)) this.postponeCognition(minimumReady, nowMs, society);
        return undefined;
      }
      const { turn, job } = selected;
      const currentMs = Date.now();
      if (!hasSocietyRequestWindow(turn.expiresAtMs, currentMs)) {
        // Lazy counting can outlive the original cadence. A discarded fresh
        // context must not leave nextDueAt retrying a past deadline at +1 s.
        // Preserve any later wait installed without a world/control change.
        const next = currentMs + COGNITION_CADENCE_MS;
        this.sql.exec('UPDATE runtime_meta SET next_cognition_at_ms=MAX(COALESCE(next_cognition_at_ms,?),?) WHERE singleton=1', next, next);
        return undefined;
      }
      // Another preparation can insert a job without changing the world yet.
      if (firstRow(this.sql.exec('SELECT sequence FROM cognition_contexts WHERE sequence=?', sequence))) return undefined;
      this.sql.exec('INSERT INTO cognition_contexts (sequence,job_id,actor,prepared_json,generation) VALUES (?,?,?,?,?)',
        turn.sequence, job.jobId, turn.actor, JSON.stringify(turn), turn.generation);
      this.sql.exec(`INSERT INTO cognition_jobs (job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts)
        VALUES (?,?,'pending',?,?,?,0)`, job.jobId, JSON.stringify(job), job.pressure, nowMs, nowMs);
      return job.jobId;
    });
  }

  private retireStaleJobs(nowMs: number): void {
    this.state.storage.transactionSync(() => {
      const runtime = this.runtime();
      for (const row of this.sql.exec<JobRow & { prepared_json: string; generation: number }>(
        `SELECT j.*,c.prepared_json,c.generation FROM cognition_jobs j JOIN cognition_contexts c ON c.job_id=j.job_id
         WHERE j.status IN ('pending','deferred','running','resolved')`).toArray()) {
        const turn = JSON.parse(row.prepared_json) as PreparedTurn;
        const reason = row.generation !== runtime.control_revision ? 'control_revision_changed'
          : turn.expiresAtMs <= nowMs ? 'turn_expired'
          : ['pending', 'deferred'].includes(row.status)
            && !hasSocietyRequestWindow(turn.expiresAtMs, Math.max(nowMs, row.due_at_ms)) ? 'provider_window_expired'
          : row.status === 'running' && (row.lease_expires_at_ms ?? 0) <= nowMs ? 'ambiguous_provider_lease' : null;
        if (reason) {
          this.finishSocietyJob(row.job_id, 'dead', reason);
          // Another job may remain usable once this wait is released. Do not
          // retire it merely because of the old, shared next_cognition deadline.
          if (['pending', 'deferred'].includes(row.status)) this.releaseCognitionWait(nowMs);
        }
      }
    });
  }

  // Terminal jobs become immutable at the same instant as their duplicated
  // input is compacted, so a recovery cut can never combine two versions.
  // Every caller must already hold a synchronous storage transaction.
  private finishSocietyJob(jobId: string, status: 'applied' | 'dead', code: string | null): void {
    this.sql.exec('UPDATE cognition_jobs SET status=?,error_code=?,lease_expires_at_ms=NULL WHERE job_id=?', status, code, jobId);
    compactTerminalCognition(this.sql, jobId);
  }

  /** A discarded context cannot keep its provider-specific wait over everyone
   * else. Preserve an earlier wake; never turn retirement into a tight retry. */
  private releaseCognitionWait(nowMs: number): void {
    const next = nowMs + COGNITION_CADENCE_MS;
    this.sql.exec(`UPDATE runtime_meta SET next_cognition_at_ms=MIN(COALESCE(next_cognition_at_ms,?),?)
      WHERE singleton=1 AND mode='running'`, next, next);
  }

  private async processSocietyJob(jobId: string, nowMs: number): Promise<void> {
    const row = firstRow(this.sql.exec<JobRow & { prepared_json: string }>(
      'SELECT j.*,c.prepared_json FROM cognition_jobs j JOIN cognition_contexts c ON c.job_id=j.job_id WHERE j.job_id=?', jobId));
    if (!row || !['pending', 'deferred'].includes(row.status) || row.due_at_ms > nowMs) return;
    const job = cognitionJobSchema.parse(JSON.parse(row.envelope_json));
    const baseUser = job.prompt.user;
    if (row.error_code?.startsWith('invalid_society:')) {
      const structure = savedStructuralRetryFeedback(this.sql, job, row.error_code);
      job.prompt.user += ` Previous attempt was refused: ${row.error_code.slice('invalid_society:'.length)}. Correct that issue using only the supplied state and exact IDs.${structure}`;
    }
    const turn = JSON.parse(row.prepared_json) as PreparedTurn;
    const before = this.society(), physical = deserializeWorldState(this.world().state_json);
    const capturedWorldRevision = this.runtime().world_revision;
    const mayClaim = () => {
      const current = this.runtime();
      const fresh = firstRow(this.sql.exec<{ status: string; attempts: number; due_at_ms: number }>(
        'SELECT status,attempts,due_at_ms FROM cognition_jobs WHERE job_id=?', jobId));
      return current.mode === 'running' && current.control_revision === turn.generation
        && current.world_revision === capturedWorldRevision
        && this.society().minds[turn.actor].revision === turn.mindRevision
        && fresh && ['pending', 'deferred'].includes(fresh.status) && fresh.attempts === row.attempts
        && fresh.due_at_ms <= nowMs;
    };
    if (before.minds[turn.actor].revision !== turn.mindRevision) {
      this.state.storage.transactionSync(() => this.finishSocietyJob(jobId, 'dead', 'mind_revision_changed')); return;
    }
    const firstOpportunity = before.minds[turn.actor].lastAttemptAtMs === null;
    const groqApiKey = readSecret(this.runtimeEnv, 'GROQ_API_KEY');
    if (!firstOpportunity) {
      const readyAtMs = await cognitionReadyAt({ job, config: this.config,
        quota: new SqlQuotaLedger(this.sql, this.config), nowMs, groqAvailable: Boolean(groqApiKey) });
      if (!mayClaim()) return;
      if (readyAtMs === null) {
        this.state.storage.transactionSync(() => this.finishSocietyJob(jobId, 'dead', 'provider_attempts_exhausted'));
        return;
      }
      if (readyAtMs > Date.now()) {
        this.state.storage.transactionSync(() => {
          if (!mayClaim()) return;
          // An early reconsideration can wake other residents, but this job
          // cannot dispatch before both its provider and the cadence permit it.
          const retryAtMs = Math.max(readyAtMs, Date.now() + COGNITION_CADENCE_MS);
          if (!hasSocietyRequestWindow(turn.expiresAtMs, retryAtMs)) {
            this.finishSocietyJob(jobId, 'dead', readyAtMs >= turn.expiresAtMs ? 'pacing_context_expired' : 'provider_window_expired');
            this.releaseCognitionWait(Date.now());
            return; // A retired context must not impose its provider wait globally.
          }
          this.sql.exec("UPDATE cognition_jobs SET status='deferred',due_at_ms=?,error_code=CASE WHEN substr(error_code,1,16)='invalid_society:' THEN error_code ELSE 'pacing_wait' END WHERE job_id=?", readyAtMs, jobId);
          this.postponeCognition(readyAtMs, nowMs, before);
        });
        return;
      }
    }
    let claimAtMs = 0, leaseExpiresAtMs = 0;
    const claimed = this.state.storage.transactionSync(() => {
      if (!mayClaim()) return false;
      claimAtMs = Date.now();
      if (!hasSocietyRequestWindow(turn.expiresAtMs, claimAtMs)) {
        this.finishSocietyJob(jobId, 'dead', 'provider_window_expired');
        this.releaseCognitionWait(claimAtMs);
        return false;
      }
      leaseExpiresAtMs = claimAtMs + 120_000;
      this.sql.exec("UPDATE cognition_jobs SET status='running',attempts=attempts+1,lease_expires_at_ms=? WHERE job_id=?", leaseExpiresAtMs, jobId);
      if (row.error_code?.startsWith('invalid_society:')) this.appendEvent('society.turn.retry', claimAtMs, {
        jobId, attempt: row.attempts + 1, reason: row.error_code,
        baseUserHash: createHash('sha256').update(baseUser).digest('hex'),
        systemHash: createHash('sha256').update(job.prompt.system).digest('hex'),
        userHash: createHash('sha256').update(job.prompt.user).digest('hex'),
      });
      this.publishSociety(markSocietyAttempt(before, turn.actor, claimAtMs), physical, claimAtMs);
      return true;
    });
    if (!claimed) return;
    let validationCode: string | undefined;
    const result = await routeCognition({ ai: this.runtimeEnv.AI, ...(groqApiKey ? { groqApiKey } : {}),
      config: this.config, job, attemptOrdinal: row.attempts + 1, quota: new SqlQuotaLedger(this.sql, this.config), pacing: !firstOpportunity,
      deadlineAtMs: Math.min(leaseExpiresAtMs, turn.expiresAtMs) - 10_000,
      onAttempt: (attempt) => { if (!attempt.ok) this.saveAttempt(attempt, Date.now()); },
      canDispatch: () => {
        const current = this.runtime();
        const active = firstRow(this.sql.exec<{ status: string; lease_expires_at_ms: number | null }>(
          'SELECT status,lease_expires_at_ms FROM cognition_jobs WHERE job_id=?', jobId));
        return current.mode === 'running' && current.control_revision === turn.generation
          && active?.status === 'running' && active.lease_expires_at_ms === leaseExpiresAtMs
          && Date.now() < Math.min(turn.expiresAtMs, leaseExpiresAtMs)
          && this.society().minds[turn.actor].revision === turn.mindRevision;
      },
      validatePayload: (payload) => {
        const checked = applyIssuedSocietyProtocol(job, this.society(), deserializeWorldState(this.world().state_json),
          turn, payload, { nowMs: Date.now(), generation: this.runtime().control_revision });
        if (!checked.ok) validationCode = checked.code;
        return checked.ok ? true : checked.code;
      },
    });
    // Keep the original attempt's evidence, but only the current lease owner
    // may resolve, defer, compact or close this job after a provider await.
    this.state.storage.transactionSync(() => {
      const completedAtMs = Date.now();
      const active = firstRow(this.sql.exec<{ status: string; lease_expires_at_ms: number | null }>(
        'SELECT status,lease_expires_at_ms FROM cognition_jobs WHERE job_id=?', jobId));
      if (active?.status !== 'running' || active.lease_expires_at_ms !== leaseExpiresAtMs
        || completedAtMs >= leaseExpiresAtMs) {
        const attempts = result.status === 'completed' ? result.attempts ?? [result.result] : result.reasons;
        for (const attempt of attempts) this.saveAttempt(attempt, completedAtMs);
        if (active?.status === 'running' && active.lease_expires_at_ms === leaseExpiresAtMs) {
          this.finishSocietyJob(jobId, 'dead', 'provider_lease_expired');
        }
        return;
      }
      // Store a result before effects; a lost response is never guessed.
      this.persistRouterResult(jobId, result, completedAtMs);
      if (result.status === 'deferred' && validationCode) this.sql.exec(
        "UPDATE cognition_jobs SET error_code=? WHERE job_id=? AND status='deferred'", `invalid_society:${validationCode}`, jobId);
      if (result.status !== 'completed' && this.runtime().control_revision === turn.generation) this.sql.exec(
        'UPDATE runtime_meta SET last_cognition_error_code=? WHERE singleton=1',
        validationCode ? `invalid_society:${validationCode}` : `providers_${result.status}`);
    });
  }

  private applySocietyJob(jobId: string, nowMs: number): void {
    this.state.storage.transactionSync(() => {
      const row = firstRow(this.sql.exec<JobRow & { prepared_json: string }>(
        'SELECT j.*,c.prepared_json FROM cognition_jobs j JOIN cognition_contexts c ON c.job_id=j.job_id WHERE j.job_id=?', jobId));
      if (row?.status !== 'resolved' || !row.output_json) return;
      const runtime = this.runtime(), turn = JSON.parse(row.prepared_json) as PreparedTurn;
      const world = deserializeWorldState(this.world().state_json), before = this.society();
      const job = cognitionJobSchema.parse(JSON.parse(row.envelope_json));
      const result = runtime.mode === 'running'
        ? applyIssuedSocietyProtocol(job, before, world, turn, JSON.parse(row.output_json), { nowMs, generation: runtime.control_revision })
        : { ok: false, code: 'runtime_paused', state: before, world };
      if (!result.ok) {
        this.finishSocietyJob(jobId, 'dead', result.code);
        this.sql.exec('UPDATE runtime_meta SET last_cognition_error_code=? WHERE singleton=1', result.code);
        this.appendEvent('society.turn.refused', nowMs, { jobId, actor: turn.actor, code: result.code }); return;
      }
      if (job.outputContract.version === 8 && result.code === 'already_applied') {
        this.finishSocietyJob(jobId, 'applied', null); return;
      }
      // A successful deliberation updates legacy coverage metadata without
      // implying a physical action, wage, meal or movement.
      const body = result.world.bodies[turn.actor];
      body.thoughtOn = result.world.day; body.lastThoughtWatch = result.world.day * 4 + result.world.watch - 1;
      body.lastAttemptWatch = body.lastThoughtWatch;
      this.publishSociety(result.state, result.world, nowMs);
      this.sql.exec('UPDATE runtime_meta SET last_cognition_error_code=NULL WHERE singleton=1');
      this.finishSocietyJob(jobId, 'applied', null);
      const view = societyPublicView(result.state);
      const changedTurns = result.state.conversations.flatMap((c) => c.turns.filter((t) =>
        !before.conversations.find((old) => old.id === c.id)?.turns.some((old) => old.id === t.id))
        .map((t) => ({ conversationId: c.id, participants: c.participants, ...t })));
      const departures = result.state.conversations.filter(c => c.status === 'closed' && c.participants.includes(turn.actor)
        && before.conversations.some(old => old.id === c.id && old.status === 'open' && old.turns.length === c.turns.length));
      this.sql.exec('INSERT OR IGNORE INTO society_events (world_revision,occurred_at_ms,job_id,actor,event_json) VALUES (?,?,?,?,?)',
        this.runtime().world_revision, nowMs, jobId, turn.actor, JSON.stringify({ source: row.provider,
          resident: view.residents.find((r) => r.id === turn.actor), turns: changedTurns,
          ...(departures.length ? { departures: departures.map(c => ({ conversationId: c.id, actor: turn.actor })) } : {}),
          offers: view.offers.filter((o) => !before.offers.some((old) => old.id === o.id && old.status === o.status)),
          agreements: view.agreements.filter((a) => !before.agreements.some((old) => old.id === a.id && old.status === a.status)) }));
      for (const t of changedTurns) this.archiveHappening(`${jobId}:${t.id}`, { day: result.world.day,
        watch: result.world.watch, minute: (result.world.watch - 1) * 360,
        room: body.room, who: [...t.participants], kind: 'meeting', text: `${t.speaker}: ${t.text}` }, this.runtime().world_revision, nowMs);
      for (const c of departures) this.archiveHappening(`${jobId}:left:${c.id}`, { day: result.world.day,
        watch: result.world.watch, minute: (result.world.watch - 1) * 360, room: body.room, who: [...c.participants], kind: 'meeting',
        text: `${RESIDENT_BY_ID[turn.actor].name} left the conversation with ${RESIDENT_BY_ID[c.participants.find(id => id !== turn.actor)!].name}.` },
      this.runtime().world_revision, nowMs);
      this.appendEvent('society.turn.applied', nowMs, { jobId, actor: turn.actor, source: row.provider });
    });
  }

  private publishSociety(society: SocietyState, world: ReturnType<typeof deserializeWorldState>, nowMs: number): void {
    const revision = this.runtime().world_revision + 1;
    this.saveSociety(society, nowMs);
    this.sql.exec('UPDATE world_state SET world_revision=?,state_json=?,updated_at_ms=? WHERE singleton=1', revision, serializeWorldState(world), nowMs);
    this.sql.exec('UPDATE runtime_meta SET world_revision=?,sim_day=?,sim_minute=? WHERE singleton=1', revision, world.day, (world.watch - 1) * 360);
    for (const e of world.economy.events) this.sql.exec(
      'INSERT OR IGNORE INTO economic_events (sequence,world_revision,day,watch,event_json) VALUES (?,?,?,?,?)',
      e.sequence, revision, e.day, e.watch, JSON.stringify(e));
  }

  private commitPhysicalWatch(nowMs: number): void {
    this.state.storage.transactionSync(() => {
      const runtime = this.runtime();
      if (runtime.mode !== 'running' || runtime.next_watch_at_ms === null || runtime.next_watch_at_ms > nowMs) return;
      let world = deserializeWorldState(this.world().state_json);
      const society = this.society(), day = world.day, watch = world.watch;
      const runId = `${this.config.HABITAT_ID}:physical:${day}:${watch}`;
      const observed = advanceSocietyWatch(society, world, nowMs), observations = observed.observations;
      world = observed.world;
      this.publishSociety(observed.state, world, nowMs);
      const revision = this.runtime().world_revision;
      this.sql.exec('INSERT INTO physical_runs VALUES (?,?,?,?,?,?,?)', runId, day, watch,
        runtime.next_watch_at_ms, revision, nowMs, JSON.stringify(observations));
      this.sql.exec(`UPDATE runtime_meta SET next_watch_at_ms=?,last_committed_run_id=?,last_committed_at_ms=?,last_error_code=NULL WHERE singleton=1`,
        nextWatchDueAt(runtime.next_watch_at_ms, nowMs, this.config.TICK_INTERVAL_MS), runId, nowMs);
      this.archiveWatchHappenings({ run_id: runId, sim_day: day, sim_watch: watch }, world, revision, nowMs);
      if (world.watch === 1) this.saveCheckpoint(revision, serializeWorldState(world), nowMs);
      this.appendEvent('world.watch.committed', nowMs, { runId, worldRevision: revision, day: world.day,
        watch: world.watch, plannedActions: observations.filter((o) => 'stepId' in o && o.stepId).length,
        publications: observations.filter((o) => 'kind' in o && o.kind === 'record_publication' && o.outcome.ok).length, source: 'physical-engine' });
    });
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
      const context = this.sql.exec<{ prepared_json: string }>(
        'SELECT prepared_json FROM cognition_contexts WHERE job_id=?', jobId).one();
      const turn = JSON.parse(context.prepared_json) as PreparedTurn;
      const retryAtMs = Math.max(result.retryAtMs, nowMs, this.runtime().next_cognition_at_ms ?? nowMs + COGNITION_CADENCE_MS);
      if (!hasSocietyRequestWindow(turn.expiresAtMs, retryAtMs)) {
        // Actual attempts and their usage were persisted above. Retirement is
        // not an additional attempt or a new resident failure/backoff.
        this.finishSocietyJob(jobId, 'dead', 'provider_window_expired');
        this.releaseCognitionWait(nowMs);
        return;
      }
      this.sql.exec(
        `UPDATE cognition_jobs SET status = 'deferred', due_at_ms = ?,
           lease_expires_at_ms = NULL, error_code = 'providers_deferred'
         WHERE job_id = ? AND status = 'running'`,
        result.retryAtMs,
        jobId,
      );
      return;
    }
    this.state.storage.transactionSync(() => {
      const row = firstRow(this.sql.exec<{ status: string }>('SELECT status FROM cognition_jobs WHERE job_id=?', jobId));
      if (row?.status === 'running') this.finishSocietyJob(jobId, 'dead', 'providers_rejected');
    });
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
    try { saveProviderRejection(this.sql, result, nowMs); }
    catch {
      // Optional capture cannot roll back an attempt or authorize another call.
      try { this.appendEvent('provider.diagnostic.unavailable', nowMs, { attemptId: result.attemptId }); }
      catch { /* Accounting and the original result remain authoritative. */ }
    }
  }

  private archiveWatchHappenings(
    run: Pick<WatchRunRow, 'run_id' | 'sim_day' | 'sim_watch'>,
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
    if (version < 7) this.migrateToV7();
    if (version < 8) this.migrateToV8();
    if (version < 9) this.migrateToV9();
    if (version < 10) this.migrateToV10();
    if (version < 11) this.migrateToV11();
    if (version < 12) this.migrateToV12();
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

  private migrateToV7(): void {
    this.state.storage.transactionSync(() => {
      const nowMs = Date.now();
      this.sql.exec(`
        ALTER TABLE quota_reservations ADD COLUMN usage_confirmed INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX quota_provider_created_idx ON quota_reservations(provider, created_at_ms);
        UPDATE provider_breakers SET open_until_ms = 0, failure_streak = 0, reason = NULL
          WHERE reason = 'invalid-response';
        ALTER TABLE runtime_meta ADD COLUMN next_cognition_at_ms INTEGER;
        ALTER TABLE runtime_meta ADD COLUMN last_cognition_error_code TEXT;
        CREATE TABLE society_state (
          singleton INTEGER PRIMARY KEY CHECK(singleton = 1), codec_version INTEGER NOT NULL,
          revision INTEGER NOT NULL, state_json TEXT NOT NULL, updated_at_ms INTEGER NOT NULL);
        CREATE TABLE cognition_contexts (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT UNIQUE,
          actor TEXT NOT NULL, prepared_json TEXT NOT NULL, generation INTEGER NOT NULL);
        CREATE TABLE physical_runs (
          run_id TEXT PRIMARY KEY, sim_day INTEGER NOT NULL, sim_watch INTEGER NOT NULL,
          due_at_ms INTEGER NOT NULL, world_revision INTEGER NOT NULL, committed_at_ms INTEGER NOT NULL,
          actions_json TEXT NOT NULL);
        CREATE TABLE society_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, world_revision INTEGER NOT NULL,
          occurred_at_ms INTEGER NOT NULL, job_id TEXT NOT NULL UNIQUE, actor TEXT NOT NULL,
          event_json TEXT NOT NULL);
        UPDATE cognition_jobs SET status = 'dead', lease_expires_at_ms = NULL, error_code = 'superseded_by_individual_minds'
          WHERE status NOT IN ('applied', 'dead');
        UPDATE watch_runs SET phase = 'cancelled', error_code = 'independent_physical_clock'
          WHERE phase = 'claimed';
      `);
      const society = createSocietyState(deserializeWorldState(this.world().state_json), nowMs);
      this.sql.exec('INSERT INTO society_state VALUES (1, ?, ?, ?, ?)', society.version, society.revision, JSON.stringify(society), nowMs);
      this.sql.exec('UPDATE runtime_meta SET next_cognition_at_ms = ? WHERE singleton = 1', nowMs + 60_000);
      this.sql.exec('INSERT INTO _sql_schema_migrations VALUES (7, ?)', nowMs);
      this.appendEvent('society.initialized', nowMs, { residents: 25, societyVersion: society.version, physicalWorldPreserved: true });
    });
  }

  /** Additive read indexes only: no world, quota or historical rows change. */
  private migrateToV8(): void {
    this.state.storage.transactionSync(() => {
      this.sql.exec('CREATE INDEX provider_attempts_recent_idx ON provider_attempts(recorded_at_ms DESC)');
      this.sql.exec('CREATE INDEX quota_day_provider_idx ON quota_reservations(day, provider)');
      this.sql.exec(`CREATE INDEX quota_provider_activity_idx ON quota_reservations(provider,
        MAX(created_at_ms, COALESCE(dispatched_at_ms, 0), COALESCE(settled_at_ms, 0)))`);
      this.sql.exec('INSERT INTO _sql_schema_migrations VALUES (8, ?)', Date.now());
    });
  }

  /** Preserve the exact previous cognitive singleton before adding documents.
   * No physical world, outstanding job, allowance or schedule is rewritten. */
  private migrateToV9(): void {
    this.state.storage.transactionSync(() => {
      const row = this.sql.exec<{ codec_version: number; revision: number; state_json: string }>(
        'SELECT codec_version,revision,state_json FROM society_state WHERE singleton=1').one();
      const decoded = parseSocietyState(JSON.parse(row.state_json));
      if (!decoded.ok) throw new RangeError(decoded.code);
      const nowMs = Date.now();
      this.sql.exec(`CREATE TABLE society_layout_backups (
        migration_version INTEGER PRIMARY KEY, codec_version INTEGER NOT NULL, revision INTEGER NOT NULL,
        state_json TEXT NOT NULL, sha256 TEXT NOT NULL, created_at_ms INTEGER NOT NULL);
        CREATE TABLE authored_publications (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, publication_id TEXT NOT NULL UNIQUE,
          draft_id TEXT NOT NULL,
          author TEXT NOT NULL, is_public INTEGER NOT NULL CHECK(is_public IN(0,1)),
          published_at_ms INTEGER NOT NULL, publication_json TEXT NOT NULL);
        CREATE INDEX authored_publications_public_idx ON authored_publications(is_public,sequence DESC);
        CREATE INDEX authored_publications_draft_idx ON authored_publications(draft_id,is_public,sequence DESC);
        CREATE TABLE provider_rejections (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id TEXT NOT NULL UNIQUE,
          recorded_at_ms INTEGER NOT NULL, diagnostic_json TEXT NOT NULL, byte_count INTEGER NOT NULL);
        CREATE INDEX provider_rejections_expiry_idx ON provider_rejections(recorded_at_ms);
        ALTER TABLE society_state ADD COLUMN archived_record_next_id INTEGER NOT NULL DEFAULT 0;`);
      this.sql.exec('INSERT INTO society_layout_backups VALUES (9,?,?,?,?,?)', row.codec_version, row.revision,
        row.state_json, createHash('sha256').update(row.state_json).digest('hex'), nowMs);
      // Historical intermediate codecs remain exact: SQL11 adds retrieval;
      // SQL12 adds the private channel attention markers independently.
      const { retrieval, ...recordSociety } = decoded.state;
      void retrieval;
      this.sql.exec('UPDATE society_state SET codec_version=?,state_json=?,updated_at_ms=? WHERE singleton=1',
        2, JSON.stringify({ ...recordSociety, version: 2, conversations: recordSociety.conversations.map(c => {
          const { attentionThrough, ...legacy } = c; void attentionThrough; return legacy;
        }) }), nowMs);
      this.sql.exec('INSERT INTO _sql_schema_migrations VALUES (9,?)', nowMs);
    });
  }

  private migrateToV10(): void {
    this.state.storage.transactionSync(() => {
      const nowMs = Date.now();
      migrateQuotaModels(this.sql, nowMs);
      this.sql.exec('INSERT INTO _sql_schema_migrations VALUES (10,?)', nowMs);
    });
  }

  /** Archive the exact old cognitive row before adding empty private lookup
   * state. No clock, world, queued job, quota or document content changes. */
  private migrateToV11(): void {
    this.state.storage.transactionSync(() => {
      const row = this.sql.exec<{ codec_version: number; revision: number; state_json: string }>(
        'SELECT codec_version,revision,state_json FROM society_state WHERE singleton=1').one();
      const original: unknown = JSON.parse(row.state_json), decoded = parseSocietyState(original);
      if (!decoded.ok) throw new RangeError(decoded.code);
      if (!original || typeof original !== 'object' || !('version' in original)
        || original.version !== row.codec_version || decoded.state.revision !== row.revision) {
        throw new RangeError('Society migration row metadata differs from its content');
      }
      const nowMs = Date.now();
      this.sql.exec('INSERT INTO society_layout_backups VALUES (11,?,?,?,?,?)', row.codec_version, row.revision,
        row.state_json, createHash('sha256').update(row.state_json).digest('hex'), nowMs);
      this.sql.exec('UPDATE society_state SET codec_version=?,state_json=?,updated_at_ms=? WHERE singleton=1',
        3, JSON.stringify({ ...decoded.state, version: 3, conversations: decoded.state.conversations.map(c => {
          const { attentionThrough, ...legacy } = c; void attentionThrough; return legacy;
        }) }), nowMs);
      this.sql.exec('INSERT INTO _sql_schema_migrations VALUES (11,?)', nowMs);
    });
  }

  /** Preserve the complete prior row before admitting concurrent channels.
   * Only the codec and derived private attention markers change; clocks,
   * jobs, authored records, quotas, obligations and physical state stay exact. */
  private migrateToV12(): void {
    this.state.storage.transactionSync(() => {
      const row = this.sql.exec<{ codec_version: number; revision: number; state_json: string }>(
        'SELECT codec_version,revision,state_json FROM society_state WHERE singleton=1').one();
      const original: unknown = JSON.parse(row.state_json), decoded = parseSocietyState(original);
      if (!decoded.ok) throw new RangeError(decoded.code);
      if (!original || typeof original !== 'object' || !('version' in original)
        || original.version !== 3 || row.codec_version !== 3 || decoded.state.revision !== row.revision) {
        throw new RangeError('Society attention migration requires matching codec3 row metadata');
      }
      const previousFields = { ...decoded.state, version: 3, conversations: decoded.state.conversations.map(c => {
        const { attentionThrough, ...legacy } = c; void attentionThrough; return legacy;
      }) };
      // Legacy validation trims text. Refuse to apply that normalization to a
      // saved row: this migration may append markers, never rewrite old fields.
      const canonical = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => item !== null
        && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
      if (canonical(previousFields) !== canonical(original)) throw new RangeError('Society attention migration would change prior fields');
      const nowMs = Date.now();
      this.sql.exec('INSERT INTO society_layout_backups VALUES (12,?,?,?,?,?)', row.codec_version, row.revision,
        row.state_json, createHash('sha256').update(row.state_json).digest('hex'), nowMs);
      this.sql.exec('UPDATE society_state SET codec_version=?,state_json=?,updated_at_ms=? WHERE singleton=1',
        decoded.state.version, JSON.stringify(decoded.state), nowMs);
      this.sql.exec('INSERT INTO _sql_schema_migrations VALUES (12,?)', nowMs);
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

function happeningFromRow(row: HappeningRow, habitatId: string): Happening & { speech?: ArchivedSpeech } {
  const who = JSON.parse(row.who_json) as Happening['who'];
  const speech = archivedSpeech(habitatId, row.happening_id, { who, text: row.text, kind: row.kind });
  return {
    ...(speech ? { speech } : {}),
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
