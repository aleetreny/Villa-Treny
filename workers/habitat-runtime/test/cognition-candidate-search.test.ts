import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { applyProposalCapabilityChoice, applySocietyTurn, createSocietyState, parseSocietyState, prepareSocietyTurn,
  type SocietyState } from '../../../src/lib/habitat/society/index';
import { applyRecordCapabilityChoice, prepareRecordTurn } from '../../../src/lib/habitat/society/record-choice';
import { createGenesisWorld, deserializeWorldState, serializeWorldState } from '../src/domain';
import { prepareSocietyJob, nextSocietyActor, nextSocietyReconsiderationAt, COGNITION_CADENCE_MS, COGNITION_REVIEW_MS, COGNITION_FAILURE_BACKOFF_MS } from '../src/society-scheduler';
import { estimateGroqInputTokens } from '../src/providers/groq-token-estimate';
import { GROQ_120B_MODEL, GROQ_MODEL } from '../src/providers/groq';
import { cognitionReadyAt } from '../src/providers/router';
import { cognitionJobSchema, parseRuntimeConfig } from '../src/contracts';
import { GROQ_PROJECT_LIMITS, SqlQuotaLedger } from '../src/quota';
import type { ResidentId } from '../../../src/lib/habitat/residents';

const NOW = Date.parse('2026-09-08T12:00:00Z');
type Runtime = {
  runtimeEnv: Record<string, unknown>;
  sql: SqlStorage;
  prepareNextSocietyJob(nowMs: number): Promise<string | undefined>;
  runCognitionWake(nowMs: number): Promise<void>;
  commitPhysicalWatch(nowMs: number): void;
  processSocietyJob(jobId: string, nowMs: number): Promise<void>;
};

/** Reachable current-protocol state, not a fabricated oversized prompt. Every
 * loan has a separate offer and acceptance; each party authors its own turn. */
function fixture(secondConversation = true, replied = false) {
  let clock = NOW - 300_000, sequence = 0;
  let world = createGenesisWorld(), society = createSocietyState(world, clock - 1000);
  function speak(actor: ResidentId, message: { to: ResidentId; text: string; close: boolean }, deal?: unknown) {
    const turn = prepareSocietyTurn(society, world, actor, { nowMs: ++clock, sequence: ++sequence, generation: 0 });
    const response = { message, ...(deal ? { deal } : {}), ...(!society.minds[actor].project
      ? { project: { mode: 'replace', goal: 'Keep a synthetic loan register.', why: 'This is an isolated scheduling test.', visibility: 'private', steps: [] } } : {}) };
    const result = applyProposalCapabilityChoice(society, world, turn, response, { nowMs: clock, generation: 0 });
    expect(result.ok, result.code).toBe(true); society = result.state; world = result.world;
  }
  for (const id of Object.keys(society.minds).slice(1).filter(id => id !== 'K') as ResidentId[]) {
    speak('A', { to: id, text: 'Synthetic loan offer.', close: false }, { kind: 'loan', direction: 'lend', cells: 0.1, dueInDays: 1 });
    speak(id, { to: 'A', text: 'I accept this synthetic loan.', close: false }, { kind: 'accept', offerId: society.offers.at(-1)!.id });
    speak('A', { to: id, text: 'This synthetic exchange is closed.', close: true });
    // A received closing turn is real pending work. Review it with the actual
    // P6 operation before isolating the later physical/review/backoff trigger.
    const review = prepareRecordTurn(society, world, prepareSocietyTurn(society, world, id,
      { nowMs: ++clock, sequence: ++sequence, generation: 0 }));
    const closingId = society.conversations.at(-1)!.turns.at(-1)!.id;
    expect(review.evidenceIds).toContain(closingId);
    const reviewed = applyRecordCapabilityChoice(society, world, review, { reflection: {
      text: 'This exchange is closed; the accepted loan remains unchanged.', refs: [closingId],
    } }, { nowMs: clock, generation: 0 });
    expect(reviewed.ok, reviewed.code).toBe(true); society = reviewed.state; world = reviewed.world;
  }
  // K reviews its purpose after A finishes the loans, before either new request.
  // This leaves A first under resident-based fairness and K genuinely smaller.
  // This remains a genuinely smaller P6 reply rather than a lower quota or an
  // older protocol selected only for the runtime admission comparison.
  const purposeTurn = prepareSocietyTurn(society, world, 'K', { nowMs: ++clock, sequence: ++sequence, generation: 0 });
  const purpose = applySocietyTurn(society, world, purposeTurn, { project: { mode: 'replace',
    goal: 'Check stores.', why: 'Count first.', visibility: 'private', steps: [] } },
  { nowMs: clock, generation: 0 });
  expect(purpose.ok, purpose.code).toBe(true); society = purpose.state; world = purpose.world;
  speak('B', { to: 'A', text: 'Please review these existing obligations.', close: false });
  if (secondConversation) {
    speak('C', { to: 'K', text: 'Can we compare stores?', close: false });
    if (replied) speak('K', { to: 'C', text: 'Which stores?', close: false });
  }
  expect(world.economy.debts).toHaveLength(23);
  expect(world.economy.debts.some(d => d.borrower === 'K' || d.lender === 'K')).toBe(false);
  // These direct P4/P6 operations represent the historical state before P8.
  // Its real closing-message reviews already succeeded above. Decode the exact
  // legacy form to derive markers without acknowledging either new request.
  const legacy = { ...society, version: 3, conversations: society.conversations.map(channel => {
    const { attentionThrough, ...old } = channel; void attentionThrough; return old;
  }) };
  const migrated = parseSocietyState(legacy);
  expect(migrated.ok).toBe(true);
  if (!migrated.ok) throw new Error(migrated.code);
  society = migrated.state;
  for (const channel of society.conversations) {
    if (channel.status === 'closed') expect(channel.attentionThrough).toEqual([channel.revision, channel.revision]);
    else expect(channel.attentionThrough[channel.participants.indexOf(channel.nextSpeaker!)]).toBeLessThan(channel.revision);
  }
  world = deserializeWorldState(serializeWorldState(world));
  return { world, society };
}

function install(sql: SqlStorage, f: ReturnType<typeof fixture>, remainingNeurons: number, chargedAt = NOW - 60_000) {
  const config = parseRuntimeConfig(env), quota = new SqlQuotaLedger(sql, config);
  // Exercise the current runtime allowance with the same deliberately scarce
  // remainder; an increased free allowance must not dilute this fixture.
  const charged = config.WORKERS_AI_DAILY_NEURONS_LIMIT - remainingNeurons;
  sql.exec('UPDATE world_state SET state_json=?', serializeWorldState(f.world));
  sql.exec('UPDATE society_state SET revision=?,state_json=?', f.society.revision, JSON.stringify(f.society));
  sql.exec("UPDATE runtime_meta SET mode='running',next_cognition_at_ms=?", NOW);
  sql.exec("INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts) VALUES('synthetic-prior','{}','applied',0,?,?,0)", NOW - 1, NOW - 1);
  sql.exec("INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(100,'synthetic-prior','A','{}',0)");
  const maximum = { requests: 1, inputTokens: 1, outputTokens: 1, neurons: charged };
  expect(quota.reserve('synthetic-history:workers-ai:1', 'workers-ai', maximum, chargedAt).allowed).toBe(true);
  quota.markDispatched('synthetic-history:workers-ai:1', chargedAt);
  quota.settle('synthetic-history:workers-ai:1', { inputTokens: 1000, outputTokens: 100, neurons: charged }, chargedAt + 1000);
  return { quota, config };
}

function instrument(runtime: Runtime, sql: SqlStorage) {
  const queries: Array<{ query: string; bindings: SqlStorageValue[] }> = [];
  runtime.sql = new Proxy(sql, { get(target, key) {
    if (key !== 'exec') return Reflect.get(target, key, target) as unknown;
    return (query: string, ...bindings: SqlStorageValue[]) => { queries.push({ query, bindings }); return target.exec(query, ...bindings); };
  } });
  return queries;
}

function paceGroqPastExpiry(quota: SqlQuotaLedger) {
  const at = NOW - 1000;
  for (const model of [GROQ_MODEL, GROQ_120B_MODEL]) {
    const id = `synthetic-history:groq:${encodeURIComponent(model)}:1`;
    expect(quota.reserve(id, 'groq', { requests: 1,
      inputTokens: GROQ_PROJECT_LIMITS.minuteTokens - 1024, outputTokens: 1024, neurons: 0 }, at, undefined, model))
      .toEqual({ allowed: true });
    // Each independent model allowance needs its own submitted reservation.
    // Unknown usage retains the full 8k maximum; leaving 120B empty would make
    // it immediately eligible and invalidate this deliberately paced scenario.
    quota.markDispatched(id, at);
    expect(quota.dispatchedCount('synthetic-history', 'groq', model)).toBe(1);
  }
}

describe('bounded scheduler search with shared quota snapshots', () => {
  it.each(['ready-groq', 'earlier-cf'] as const)('does not let a large A context block K: %s', async (mode) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    try {
      const f = fixture(), stub = env.HABITAT_WORLD.getByName(`candidate-search-${mode}`);
      await runInDurableObject(stub, async (instance, state) => {
        const runtime = instance as unknown as Runtime, sql = state.storage.sql;
        runtime.runtimeEnv = { ...runtime.runtimeEnv, GROQ_API_KEY: mode === 'ready-groq' ? 'synthetic-not-dispatched' : '' };
        const { quota, config } = install(sql, f, mode === 'ready-groq' ? 100 : 800);
        const shared = { ...f, state: f.society, nowMs: NOW, sequence: 101, generation: 0, worldRevision: 0, habitatId: config.HABITAT_ID };
        const a = prepareSocietyJob({ ...shared, actor: 'A' }), k = prepareSocietyJob({ ...shared, actor: 'K' });
        expect(nextSocietyActor(f.society, NOW, 101)).toBe('A');
        expect(await estimateGroqInputTokens(a.job) + 1024).toBeGreaterThan(GROQ_PROJECT_LIMITS.minuteTokens);
        expect(await estimateGroqInputTokens(k.job) + 1024).toBeLessThan(GROQ_PROJECT_LIMITS.minuteTokens);
        const readyA = await cognitionReadyAt({ job: a.job, config, quota, nowMs: NOW, groqAvailable: mode === 'ready-groq' });
        const readyK = await cognitionReadyAt({ job: k.job, config, quota, nowMs: NOW, groqAvailable: mode === 'ready-groq' });
        expect(readyK).toBeLessThan(readyA!);
        const savedSociety = sql.exec('SELECT * FROM society_state').toArray();
        const savedWorld = sql.exec('SELECT * FROM world_state').toArray();
        const savedQuota = sql.exec('SELECT * FROM quota_reservations').toArray();
        const queries = instrument(runtime, sql);
        const id = await runtime.prepareNextSocietyJob(NOW);
        // Read each enabled model window once for the entire candidate search,
        // including both Groq scopes; whitespace is not part of the SQL contract.
        const windows = queries.filter(({ query }) => query.includes('MAX(created_at_ms') && /WHERE provider\s*=\s*\?/.test(query));
        expect(windows.map(({ bindings }) => bindings[0] === 'groq' ? ['groq', bindings[1]] : [bindings[0]])).toEqual([
          ['workers-ai'], ...(mode === 'ready-groq' ? [['groq', GROQ_MODEL],
            ...(config.GROQ_120B_ENABLED ? [['groq', GROQ_120B_MODEL]] : [])] : []),
        ]);
        if (mode === 'ready-groq') {
          expect(id).toBe(k.job.jobId);
          expect(sql.exec('SELECT actor FROM cognition_contexts WHERE sequence=101').one()).toEqual({ actor: 'K' });
          expect(sql.exec('SELECT attempts,status FROM cognition_jobs WHERE job_id=?', id!).one()).toEqual({ attempts: 0, status: 'pending' });
        } else {
          expect(id).toBeUndefined();
          expect(sql.exec('SELECT actor FROM cognition_contexts WHERE sequence=101').toArray()).toEqual([]);
          expect(sql.exec<{ next_cognition_at_ms: number }>('SELECT next_cognition_at_ms FROM runtime_meta').one().next_cognition_at_ms).toBe(Math.max(NOW + COGNITION_CADENCE_MS,
            Math.min(readyK!, nextSocietyReconsiderationAt(f.society, NOW, null) ?? readyK!)));
        }
        expect(sql.exec('SELECT * FROM society_state').toArray()).toEqual(savedSociety);
        expect(sql.exec('SELECT * FROM world_state').toArray()).toEqual(savedWorld);
        expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual(savedQuota);
      });
    } finally { vi.restoreAllMocks(); }
  });

  it.each(['physical-watch', 'individual-review', 'failed-backoff', 'conversation-expiry'] as const)('reconsiders new eligible work at %s without moving provider or physical clocks', async (cause) => {
    const date = vi.spyOn(Date, 'now').mockReturnValue(NOW);
    try {
      const f = fixture(cause === 'failed-backoff' || cause === 'conversation-expiry', cause === 'conversation-expiry');
      if (cause === 'failed-backoff') f.society.minds.K.lastAttemptAtMs = NOW - 60_000;
      const expiring = f.society.conversations.find(c => c.status === 'open'
        && (cause !== 'conversation-expiry' || c.participants.includes('K')))!;
      if (cause === 'conversation-expiry') expiring.expiresAtMs = NOW + 30 * 60_000;
      const nextPhysical = cause === 'physical-watch' ? NOW + 3_600_000 : NOW + 8 * 3_600_000;
      const due = cause === 'physical-watch' ? nextPhysical : cause === 'failed-backoff'
        ? f.society.minds.K.lastAttemptAtMs! + COGNITION_FAILURE_BACKOFF_MS
        : cause === 'conversation-expiry' ? expiring.expiresAtMs
          : Math.min(...Object.values(f.society.minds).map(m => m.lastSuccessAtMs! + COGNITION_REVIEW_MS));
      const stub = env.HABITAT_WORLD.getByName(`candidate-new-eligibility-${cause}`);
      await runInDurableObject(stub, async (instance, state) => {
        const runtime = instance as unknown as Runtime, sql = state.storage.sql;
        runtime.runtimeEnv = { ...runtime.runtimeEnv, GROQ_API_KEY: 'synthetic-not-dispatched' };
        // Real prior reservations pace both Groq destinations beyond expiry.
        // The 760 remaining CF allowance becomes usable after the exchange
        // expires. Compact P8 now admits C's review, as well as K's; the older
        // resident opportunity must win without changing any provider quota.
        const { quota, config } = install(sql, f, cause === 'conversation-expiry' ? 760 : 100,
          cause === 'conversation-expiry' ? NOW - 43_200_000 : NOW - 60_000);
        if (cause === 'conversation-expiry') paceGroqPastExpiry(quota);
        sql.exec('UPDATE runtime_meta SET next_watch_at_ms=?', nextPhysical);
        const savedQuota = sql.exec('SELECT * FROM quota_reservations').toArray();
        const savedSociety = sql.exec('SELECT * FROM society_state').toArray();
        const invokeProvider = vi.fn<Runtime['processSocietyJob']>(async () => {});
        runtime.processSocietyJob = invokeProvider;
        await runtime.runCognitionWake(NOW);
        expect(sql.exec<{ next_cognition_at_ms: number }>('SELECT next_cognition_at_ms FROM runtime_meta').one().next_cognition_at_ms).toBe(due);
        expect(sql.exec('SELECT actor FROM cognition_contexts WHERE sequence=101').toArray()).toEqual([]);
        expect(sql.exec('SELECT * FROM society_state').toArray()).toEqual(savedSociety);
        expect(sql.exec<{ next_watch_at_ms: number }>('SELECT next_watch_at_ms FROM runtime_meta').one().next_watch_at_ms).toBe(nextPhysical);
        // Reads/early wakes neither slide the deadline nor create attempts.
        date.mockReturnValue(due - 1);
        await runtime.runCognitionWake(due - 1);
        expect(invokeProvider).not.toHaveBeenCalled();
        expect(sql.exec<{ next_cognition_at_ms: number }>('SELECT next_cognition_at_ms FROM runtime_meta').one().next_cognition_at_ms).toBe(due);
        date.mockReturnValue(due);
        if (cause === 'physical-watch') {
          runtime.commitPhysicalWatch(due);
          expect(sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM physical_runs').one().count).toBe(1);
          expect(sql.exec<{ next_watch_at_ms: number }>('SELECT next_watch_at_ms FROM runtime_meta').one().next_watch_at_ms).toBe(nextPhysical + 21_600_000);
        }
        await runtime.runCognitionWake(due);
        expect(invokeProvider).toHaveBeenCalledTimes(1);
        const chosen = sql.exec<{ actor: ResidentId }>('SELECT actor FROM cognition_contexts WHERE sequence=101').one().actor;
        // A physical watch can itself settle obligations and shrink A's
        // context. Any newly chosen job must now fit the available provider.
        const envelope = sql.exec<{ envelope_json: string }>('SELECT envelope_json FROM cognition_jobs WHERE job_id=?', invokeProvider.mock.calls[0]![0]).one().envelope_json;
        const chosenJob = cognitionJobSchema.parse(JSON.parse(envelope));
        expect(chosenJob.outputContract.version).toBe(8);
        if (cause === 'conversation-expiry') {
          expect(f.society.minds.C.lastSuccessAtMs!).toBeLessThan(f.society.minds.K.lastSuccessAtMs!);
          expect(chosen).toBe('C');
          expect(await estimateGroqInputTokens(chosenJob) + chosenJob.maxOutputTokens).toBeLessThanOrEqual(GROQ_PROJECT_LIMITS.minuteTokens);
          expect(await cognitionReadyAt({ job: chosenJob, config, quota, nowMs: due, groqAvailable: true })).toBeLessThanOrEqual(due);
        } else expect(await estimateGroqInputTokens(chosenJob) + chosenJob.maxOutputTokens).toBeLessThanOrEqual(GROQ_PROJECT_LIMITS.minuteTokens);
        if (cause !== 'physical-watch' && cause !== 'conversation-expiry') expect(chosen).not.toBe('A');
        if (cause === 'failed-backoff') expect(chosen).toBe('K');
        expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual(savedQuota);
        const nowSociety = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState;
        if (cause === 'conversation-expiry') {
          expect(nowSociety.conversations.find(c => c.id === expiring.id)?.status).toBe('expired');
          expect(nextSocietyActor(nowSociety, due, 101, new Set(['A']))).toBe('C');
          for (const actor of expiring.participants) expect(nowSociety.minds[actor].memories.some(m =>
            m.kind === 'observation' && m.createdAtMs === due && m.refs.includes(expiring.id))).toBe(true);
        }
        expect(nowSociety.minds[chosen].lastAttemptAtMs).toBe(f.society.minds[chosen].lastAttemptAtMs);
        await runtime.runCognitionWake(due);
        expect(invokeProvider).toHaveBeenCalledTimes(1);
      });
    } finally { vi.restoreAllMocks(); }
  });

  it.each([0, 300_000])('keeps a future three-minute minimum after %i ms of async counting, ignoring past eligibility dates', async (elapsed) => {
    const date = vi.spyOn(Date, 'now').mockReturnValue(NOW);
    try {
      const f = fixture(false), stub = env.HABITAT_WORLD.getByName(`candidate-reconsider-minimum-${elapsed}`);
      await runInDurableObject(stub, async (instance, state) => {
        const runtime = instance as unknown as Runtime, sql = state.storage.sql;
        runtime.runtimeEnv = { ...runtime.runtimeEnv, GROQ_API_KEY: 'synthetic-not-dispatched' };
        install(sql, f, 100);
        sql.exec('UPDATE runtime_meta SET next_watch_at_ms=?', NOW + 1);
        const pending = runtime.prepareNextSocietyJob(NOW);
        date.mockReturnValue(NOW + elapsed);
        expect(await pending).toBeUndefined();
        expect(sql.exec<{ next_cognition_at_ms: number }>('SELECT next_cognition_at_ms FROM runtime_meta').one().next_cognition_at_ms).toBe(NOW + elapsed + COGNITION_CADENCE_MS);
        const afterDeadlines = Math.max(NOW + COGNITION_REVIEW_MS, ...f.society.conversations.map(c => c.expiresAtMs)) + 1;
        expect(nextSocietyReconsiderationAt(f.society, afterDeadlines, NOW + 1)).toBeUndefined();
      });
    } finally { vi.restoreAllMocks(); }
  });

  it.each(['individual-review', 'failed-backoff', 'conversation-expiry'] as const)('does not lose a %s that crosses during asynchronous counting', async (cause) => {
    const date = vi.spyOn(Date, 'now').mockReturnValue(NOW);
    try {
      const f = fixture(cause === 'failed-backoff' || cause === 'conversation-expiry', cause === 'conversation-expiry');
      if (cause === 'failed-backoff') f.society.minds.K.lastAttemptAtMs = NOW - 60_000;
      const expiring = f.society.conversations.find(c => c.status === 'open'
        && (cause !== 'conversation-expiry' || c.participants.includes('K')))!;
      if (cause === 'conversation-expiry') expiring.expiresAtMs = NOW + 30 * 60_000;
      const changedAt = cause === 'failed-backoff'
        ? f.society.minds.K.lastAttemptAtMs! + COGNITION_FAILURE_BACKOFF_MS
        : cause === 'conversation-expiry' ? expiring.expiresAtMs
          : Math.min(...Object.values(f.society.minds).map(m => m.lastSuccessAtMs! + COGNITION_REVIEW_MS));
      const completedAt = changedAt + COGNITION_CADENCE_MS;
      const stub = env.HABITAT_WORLD.getByName(`candidate-crossed-eligibility-${cause}`);
      await runInDurableObject(stub, async (instance, state) => {
        const runtime = instance as unknown as Runtime, sql = state.storage.sql;
        runtime.runtimeEnv = { ...runtime.runtimeEnv, GROQ_API_KEY: 'synthetic-not-dispatched' };
        const { quota } = install(sql, f, cause === 'conversation-expiry' ? 760 : 100,
          cause === 'conversation-expiry' ? NOW - 43_200_000 : NOW - 60_000);
        if (cause === 'conversation-expiry') paceGroqPastExpiry(quota);
        sql.exec('UPDATE runtime_meta SET next_watch_at_ms=?', NOW + 8 * 3_600_000);
        const savedSociety = sql.exec('SELECT * FROM society_state').toArray();
        const savedQuota = sql.exec('SELECT * FROM quota_reservations').toArray();
        const pending = runtime.prepareNextSocietyJob(NOW);
        date.mockReturnValue(completedAt);
        expect(await pending).toBeUndefined();
        const reconsiderAt = completedAt + COGNITION_CADENCE_MS;
        expect(sql.exec<{ next_cognition_at_ms: number }>('SELECT next_cognition_at_ms FROM runtime_meta').one().next_cognition_at_ms).toBe(reconsiderAt);
        expect(sql.exec('SELECT actor FROM cognition_contexts WHERE sequence=101').toArray()).toEqual([]);
        expect(sql.exec('SELECT * FROM society_state').toArray()).toEqual(savedSociety);
        const invokeProvider = vi.fn<Runtime['processSocietyJob']>(async () => {});
        runtime.processSocietyJob = invokeProvider;
        date.mockReturnValue(reconsiderAt);
        await runtime.runCognitionWake(reconsiderAt);
        expect(invokeProvider).toHaveBeenCalledTimes(1);
        const chosen = sql.exec<{ actor: ResidentId }>('SELECT actor FROM cognition_contexts WHERE sequence=101').one().actor;
        if (cause !== 'conversation-expiry') expect(chosen).not.toBe('A');
        if (cause === 'failed-backoff') expect(chosen).toBe('K');
        expect(sql.exec('SELECT * FROM quota_reservations').toArray()).toEqual(savedQuota);
      });
    } finally { vi.restoreAllMocks(); }
  });

  it('abandons the bounded search when control changes during token counting', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    try {
      const f = fixture(), stub = env.HABITAT_WORLD.getByName('candidate-search-control');
      await runInDurableObject(stub, async (instance, state) => {
        const runtime = instance as unknown as Runtime, sql = state.storage.sql;
        runtime.runtimeEnv = { ...runtime.runtimeEnv, GROQ_API_KEY: 'synthetic-not-dispatched' };
        install(sql, f, 100);
        const saved = sql.exec('SELECT * FROM society_state').toArray();
        const pending = runtime.prepareNextSocietyJob(NOW);
        sql.exec("UPDATE runtime_meta SET mode='paused',control_revision=control_revision+1");
        expect(await pending).toBeUndefined();
        expect(sql.exec('SELECT actor FROM cognition_contexts WHERE sequence=101').toArray()).toEqual([]);
        expect(sql.exec('SELECT * FROM society_state').toArray()).toEqual(saved);
        expect((JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState).minds.A.lastAttemptAtMs).toBe(f.society.minds.A.lastAttemptAtMs);
      });
    } finally { vi.restoreAllMocks(); }
  });
});
