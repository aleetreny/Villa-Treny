import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { analyzeRecoveryBundle, loadAnalyzerCore, parseArgs, writePrivateReport } from './analyze-society-recovery.mjs';

const PRIVATE = 'PRIVATE_INPUT_GOAL_WHY_REFLECTION_MUST_NOT_LEAK';
const AT = Date.parse('2026-09-08T13:00:00Z');

function fixture(core) {
  let world = core.createGenesisWorld(), society = core.createSocietyState(world, AT - 20_000);
  const outputA = { project: { mode: 'replace', goal: PRIVATE, why: PRIVATE, visibility: 'private',
    steps: [{ verb: 'clean', at: 'well' }] },
  message: { to: 'B', text: 'I offer two cells without a work condition.', close: false },
  offer: { terms: { kind: 'transfer', from: 'A', to: 'B', cells: 2 }, expiresInWatches: 2 } };
  const turnA = core.prepareSocietyTurn(society, world, 'A', { nowMs: AT - 10_000, generation: 0, sequence: 1 });
  const first = core.applySocietyTurn(society, world, turnA, outputA, { nowMs: AT - 9_999, generation: 0 });
  assert.equal(first.ok, true, first.code); society = first.state; world = first.world;
  const turnB = core.prepareSocietyTurn(society, world, 'B', { nowMs: AT - 5_000, generation: 0, sequence: 2 });
  const outputB = { message: { to: 'A', text: 'I accept those two cells.', close: false },
    respond: { offerId: society.offers[0].id, decision: 'accept' } };
  const second = core.applySocietyTurn(society, world, turnB, outputB, { nowMs: AT - 4_999, generation: 0 });
  assert.equal(second.ok, true, second.code); society = second.state; world = second.world;
  const tables = Object.fromEntries(core.RECOVERY_TABLES.map(name => [name, []]));
  const stateJson = core.serializeWorldState(world), revision = 2;
  tables._sql_schema_migrations = [{ version: 7 }];
  tables.runtime_meta = [{ singleton: 1, world_revision: revision, sim_day: world.day, sim_minute: (world.watch - 1) * 360,
    next_watch_at_ms: AT + 6 * 3_600_000 }];
  tables.world_state = [{ singleton: 1, codec_version: core.WORLD_CODEC_VERSION, world_revision: revision, state_json: stateJson }];
  tables.society_state = [{ singleton: 1, codec_version: society.version, revision: society.revision, state_json: JSON.stringify(society) }];
  tables.cognition_contexts = [{ job_id: 'fixture:A', actor: 'A', prepared_json: PRIVATE },
    { job_id: 'fixture:B', actor: 'B', prepared_json: PRIVATE }];
  tables.cognition_jobs = [{ job_id: 'fixture:A', status: 'applied', provider: 'groq', model: 'openai/gpt-oss-20b',
    envelope_json: JSON.stringify({ prompt: { system: PRIVATE, user: PRIVATE } }), output_json: JSON.stringify(outputA) },
  { job_id: 'fixture:B', status: 'applied', provider: 'workers-ai', model: '@cf/openai/gpt-oss-120b',
    envelope_json: PRIVATE, output_json: JSON.stringify(outputB) }];
  const conversation = core.societyPublicView(society).conversations[0];
  tables.society_events = conversation.turns.map(turn => ({ job_id: `fixture:${turn.speaker}`, actor: turn.speaker,
    event_json: JSON.stringify({ resident: { privateUnknownFutureField: PRIVATE },
      turns: [{ ...turn, conversationId: conversation.id, participants: conversation.participants }],
      offers: [{ privateUnknownFutureField: PRIVATE }], agreements: turn.speaker === 'B' ? [{}] : [] }) }));
  tables.economic_events = world.economy.events.map(event => ({ sequence: event.sequence, event_json: JSON.stringify(event) }));
  tables.provider_attempts = [
    { attempt_id: 'fixture:A:workers-ai:1', provider: 'workers-ai', model: '@cf/openai/gpt-oss-120b', ok: 0, detail_code: PRIVATE },
    { attempt_id: 'fixture:A:groq:1', provider: 'groq', model: 'openai/gpt-oss-20b', ok: 1 },
    { attempt_id: 'fixture:B:workers-ai:1', provider: 'workers-ai', model: '@cf/openai/gpt-oss-120b', ok: 1 },
  ];
  tables.quota_reservations = tables.provider_attempts.map((attempt, index) => ({ reservation_id: attempt.attempt_id,
    provider: attempt.provider, day: '2026-09-08', state: index === 2 ? 'dispatched' : 'settled',
    max_requests: 1, max_input_tokens: 15_000, max_output_tokens: 1_024, max_neurons: attempt.provider === 'groq' ? 0 : 550,
    usage_confirmed: index === 2 ? 0 : 1, actual_requests: index === 2 ? null : 1,
    actual_input_tokens: index === 2 ? null : 1_500, actual_output_tokens: index === 2 ? null : 400,
    actual_neurons: index === 2 ? null : attempt.provider === 'groq' ? 0 : 75,
    created_at_ms: AT - 10_000, dispatched_at_ms: AT - 9_000, settled_at_ms: index === 2 ? null : AT - 8_000 }));
  const payload = { format: 'villa-recovery-v1', habitatId: 'isolated-analyzer-test', exportedAtMs: AT,
    checkpoint: core.makeCheckpoint(revision, stateJson), complete: true, tables, manifest: [] };
  return { core: core.sealRecoveryExport(payload), pages: [] };
}

test('verified real core separates coverage, paid consent, provider usage and clone forecast without leaking private data', async () => {
  const savedFetch = globalThis.fetch;
  let calls = 0, core;
  globalThis.fetch = () => { calls += 1; throw Error('Network forbidden'); };
  try {
    core = await loadAnalyzerCore();
    const bundle = fixture(core), before = JSON.stringify(bundle);
    const { publicReport: report, privateReport } = analyzeRecoveryBundle(core, bundle, { forecastWatch: true });
    assert.equal(calls, 0);
    assert.equal(report.completeRecovery, true);
    assert.equal(report.coverage.total, 25); assert.equal(report.coverage.everSucceeded, 2);
    assert.equal(report.coverage.neverSucceeded, 23);
    assert.equal(report.cognition.appliedWithPublicCommit, 2);
    assert.equal(report.cognition.appliedWithMessages, 2);
    assert.equal(report.conversations.uniquePublicMessages, 2, 'Archive and current projection are deduplicated');
    assert.equal(report.conversations.bilateral, 1);
    assert.equal(report.offers.statuses.accepted, 1); assert.equal(report.agreements.statuses.fulfilled, 1);
    assert.equal(report.agreements.history.archivedAndCurrent, 1);
    assert.equal(report.agreements.history.latestKnownStatuses.fulfilled, 1);
    assert.equal(report.economy.history.agreementTransferOrLoanEvents, 1);
    assert.equal(report.economy.history.negotiatedWorkPaymentEvents, 0, 'A gift is not a work payment');
    assert.equal(report.economy.money.conserved, true);
    assert.equal(report.economy.history.nonconservingEvents, 0);
    const cf = report.providers.find(row => row.provider === 'workers-ai');
    assert.equal(cf.recordedDispatches, 2); assert.equal(cf.successfulProviderResponses, 1);
    assert.equal(cf.confirmed.neurons, 75); assert.equal(cf.unresolved.neurons, 550);
    assert.equal(cf.chargedInCurrentWindow.neurons, 625);
    assert.equal(report.providers.find(row => row.provider === 'groq').appliedSocietyJobs, 1);
    assert.equal(report.physical.actions, 0, 'No forecast is counted as observed');
    assert.match(report.forecast.source, /NOT observed production/);
    assert.equal(report.forecast.actions, 25); assert.equal(report.forecast.plannedExecutions, 1);
    const action = privateReport.forecast.actions.find(row => row.actor === 'A');
    assert.equal(action.intent.verb, 'clean'); assert.equal(action.actualRoom, 'well'); assert.equal(action.outcome.ok, true);
    assert.equal(privateReport.forecast.society.minds.A.project.steps[0].status, 'done');
    assert.equal(report.forecast.money.conserved, true);
    assert.equal(JSON.stringify(report).includes(PRIVATE), false);
    assert.equal(JSON.stringify(report).includes('privateUnknownFutureField'), false);
    assert.equal(JSON.stringify(bundle), before);
    assert.deepEqual(analyzeRecoveryBundle(core, bundle, { forecastWatch: true }).publicReport, report, 'Forecast is reproducible');
  } finally { globalThis.fetch = savedFetch; await core?.close(); }
});

test('bad checksum, incomplete history and duplicate physical records fail before a plausible report', async () => {
  const core = await loadAnalyzerCore();
  try {
    const bundle = fixture(core);
    const changed = structuredClone(bundle); changed.core.checkpoint.worldRevision += 1;
    assert.throws(() => analyzeRecoveryBundle(core, changed));
    const { exportSha256: _checksum, ...payload } = bundle.core; void _checksum;
    const reordered = structuredClone(payload);
    for (const row of reordered.tables.economic_events) {
      const event = JSON.parse(row.event_json);
      event.entries = event.entries.map(entry => Object.fromEntries(Object.entries(entry).reverse()));
      row.event_json = JSON.stringify(Object.fromEntries(Object.entries(event).reverse()));
    }
    assert.deepEqual(analyzeRecoveryBundle(core, { core: core.sealRecoveryExport(reordered), pages: [] }).publicReport.economy,
      analyzeRecoveryBundle(core, bundle).publicReport.economy,
      'Archived and decoded economic events may use different object-key orders');
    const conflicting = structuredClone(reordered);
    const changedEvent = JSON.parse(conflicting.tables.economic_events[0].event_json);
    changedEvent.entries[0].delta += 1;
    conflicting.tables.economic_events[0].event_json = JSON.stringify(changedEvent);
    assert.throws(() => analyzeRecoveryBundle(core, { core: core.sealRecoveryExport(conflicting), pages: [] }),
      /conflicting_economic_history/, 'A real delta mismatch must never be hidden by canonical comparison');
    const archived = payload.tables.society_events.map((row, index) => ({ ...row, _exportRowId: index + 1 }));
    const pagedPayload = structuredClone(payload); pagedPayload.tables.society_events = [];
    const page = { format: 'villa-recovery-page-v1', table: 'society_events', upperRowId: 2,
      afterRowId: -1, exportedAtMs: AT, excludedRowIds: [], nextAfterRowId: null, rows: archived };
    const paged = { core: core.sealRecoveryExport({ ...pagedPayload, complete: false,
      manifest: [{ table: 'society_events', count: 2, upperRowId: 2, excludedRowIds: [] }] }),
    pages: [{ ...page, sha256: createHash('sha256').update(JSON.stringify(page)).digest('hex') }] };
    assert.equal(analyzeRecoveryBundle(core, paged).publicReport.cognition.appliedWithPublicCommit, 2,
      'A complete paged cut includes applied history absent from its core');
    assert.throws(() => analyzeRecoveryBundle(core, { ...paged, pages: [] }), /incomplete/);
    const incomplete = { core: core.sealRecoveryExport({ ...payload, complete: false,
      manifest: [{ table: 'runtime_events', count: 1, upperRowId: 1, excludedRowIds: [] }] }), pages: [] };
    assert.throws(() => analyzeRecoveryBundle(core, incomplete), /incomplete/);
    const observation = { actor: 'A', day: 100, watch: 1, intent: { actor: 'A', verb: 'rest' }, outcome: { ok: true } };
    payload.tables.physical_runs = [{ sim_day: 100, sim_watch: 1, actions_json: JSON.stringify([observation, observation]) }];
    assert.throws(() => analyzeRecoveryBundle(core, { core: core.sealRecoveryExport(payload), pages: [] }), /duplicate_physical/);
  } finally { await core.close(); }
});

test('private detailed output is exclusive, mode0600 and cannot resolve through a symlink into the repository', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'villa-analyzer-private-'));
  try {
    const path = join(directory, 'report.json');
    await writePrivateReport(path, { fixture: PRIVATE });
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).fixture, PRIVATE);
    await assert.rejects(writePrivateReport(path, {}), /EEXIST/);
    await symlink(resolve('.'), join(directory, 'repo'));
    await assert.rejects(writePrivateReport(join(directory, 'repo', 'private-analysis.json'), {}), /inside_repository/);
    await assert.rejects(writePrivateReport('relative.json', {}), /absolute_private/);
    assert.deepEqual(parseArgs(['/private/recovery.json', '--forecast-watch']),
      { bundle: '/private/recovery.json', forecastWatch: true, privateOut: null });
    assert.throws(() => parseArgs(['--live']), /invalid_arguments/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
