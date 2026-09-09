#!/usr/bin/env node
/* Offline physical follow-through of a completed, source-bound V4 ledger.
 * node scripts/continue-society-v4.mjs --ledger /absolute/ledger.json \
 *   --out /absolute/physical-continuation.json --watches 8
 * No credentials, providers, production state or new cognitive answers.
 * The original V4 ledger/report are never written. Output creation is exclusive.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCore, runFixture, verifyLedger, sourceManifest, POLICY, MODEL } from './benchmark-society-runtime-v4.mjs';

const WATCH_MS = 6 * 60 * 60_000;
const json = (value) => JSON.stringify(value, (_key, item) => item instanceof Map ? { $map: [...item] } : item);
const digest = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : json(value)).digest('hex');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const stamp = (world) => ({ day: world.day, watch: world.watch });
const sceneDigest = (scene) => digest({ state: scene.state, world: scene.world });

async function withoutNetwork(run) {
  const original = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = () => { attempts++; fail('offline_fetch_forbidden'); };
  try {
    const result = await run();
    if (attempts) fail('offline_fetch_attempted');
    return result;
  } finally { globalThis.fetch = original; }
}

function projectRecord(core, state) {
  return core.RESIDENTS.map(({ id }) => {
    const project = state.minds[id].project;
    return { actor: id, project: project ? { id: project.id, goal: project.goal, status: project.status,
      visibility: project.visibility, steps: structuredClone(project.steps) } : null };
  });
}

function moneyRecord(core, world) {
  const ledger = world.economy.ledger;
  const expected = ledger.initialCells + ledger.minted - ledger.burned - ledger.leaked;
  const total = core.totalCells(world);
  return { totalCells: total, expectedCells: expected, residual: total - expected,
    treasury: world.economy.treasury, ledger: structuredClone(ledger),
    balances: Object.fromEntries(core.RESIDENTS.map(({ id }) => [id, world.bodies[id].cells])),
    stock: structuredClone(world.economy.stock), debts: structuredClone(world.economy.debts) };
}

function checkScene(core, scene) {
  const ids = core.RESIDENTS.map(({ id }) => id).sort();
  assert.deepEqual(Object.keys(scene.world.bodies).sort(), ids, 'physical population changed');
  assert.deepEqual(Object.keys(scene.state.minds).sort(), ids, 'mind population changed');
  assert.equal(core.parseSocietyState(scene.state).ok, true, 'invalid society state');
  assert.equal(scene.world.axes.size, 600, 'directed relationship identities changed');
  assert.ok(Object.values(scene.world.bodies).every((body) => Number.isFinite(body.cells) && body.cells >= 0), 'invalid account');
  const money = moneyRecord(core, scene.world);
  assert.ok(Math.abs(money.residual) < 1e-8, `monetary conservation failed: ${money.residual}`);
  return money;
}

/** Replays only saved answers. Synthetic fixtures remain explicitly labelled;
 * a recorded provider ledger is provenance, not proof of semantic quality. */
export async function continueLedger(core, originalLedger, { watches = 8 } = {}) {
  return withoutNetwork(async () => {
    if (!Number.isInteger(watches) || watches < 1 || watches > 8) fail('watches_must_be_1_to_8');
    if (!originalLedger?.config) fail('missing_ledger_config');
    const ledger = structuredClone(originalLedger), beforeLedger = digest(ledger);
    const expectedConfig = { ...ledger.config, policy: POLICY, model: MODEL, source: core.sourceFiles };
    verifyLedger(ledger, expectedConfig, core);
    if (digest(core.sourceFiles) !== digest(await sourceManifest())) fail('source_changed_before_continuation');
    const replay = await runFixture(core, ledger, { maxNewCalls: 0,
      dispatch: () => fail('offline_dispatch_forbidden'), persist: () => fail('incomplete_ledger_requires_write') });
    if (replay.halted || replay.newCalls !== 0 || replay.consumedEntries !== ledger.entries.length
      || ledger.entries.filter((row) => row.kind === 'watch').length !== 1) fail('v4_ledger_not_complete');
    if (digest(ledger) !== beforeLedger) fail('offline_replay_changed_ledger');
    const scene = { state: replay.state, world: replay.world };
    const startingMoney = checkScene(core, scene), originalProjects = projectRecord(core, scene.state);
    const originalMinds = Object.fromEntries(core.RESIDENTS.map(({ id }) => [id, {
      projectId: scene.state.minds[id].project?.id ?? null,
      goal: scene.state.minds[id].project?.goal ?? null,
      lastAttemptAtMs: scene.state.minds[id].lastAttemptAtMs,
      lastSuccessAtMs: scene.state.minds[id].lastSuccessAtMs,
      lastAppliedSequence: scene.state.minds[id].lastAppliedSequence,
    }]));
    const starting = { clock: stamp(scene.world), hash: sceneDigest(scene), projects: originalProjects,
      agreements: structuredClone(scene.state.agreements), money: startingMoney };
    const cognition = ledger.entries.filter((row) => row.kind === 'cognition');
    const baseTime = Math.max(POLICY.epochMs, ...cognition.map((row) => row.job.nowMs)) + 1;
    const continuedWatches = [];
    let maxMoneyResidual = Math.abs(startingMoney.residual);
    for (let i = 0; i < watches; i++) {
      const beforeClock = stamp(scene.world), beforeHash = sceneDigest(scene);
      const beforeProjects = projectRecord(core, scene.state), beforeAgreements = structuredClone(scene.state.agreements);
      const beforeConversations = scene.state.conversations.map(({ id, status }) => ({ id, status }));
      const plans = core.plannedSocietyActions(scene.state, scene.world), observations = [];
      core.advanceScheduledWatch(scene.world, undefined, undefined, undefined, {
        plans, onAction: (observation) => observations.push(observation),
      });
      const nowMs = baseTime + (i + 1) * WATCH_MS;
      const observed = core.observeSocietyActions(scene.state, scene.world, observations, { nowMs });
      scene.state = observed.state; scene.world = observed.world;
      const duplicate = core.observeSocietyActions(scene.state, scene.world, observations, { nowMs: nowMs + 1 });
      assert.equal(sceneDigest(duplicate), sceneDigest(scene), 'physical observation applied twice');
      assert.equal(observations.length, 25, 'not all residents received a physical observation');
      assert.equal(new Set(observations.map(({ actor }) => actor)).size, 25, 'duplicate physical actor');
      const money = checkScene(core, scene);
      maxMoneyResidual = Math.max(maxMoneyResidual, Math.abs(money.residual));
      const afterProjects = projectRecord(core, scene.state);
      const projectChanges = afterProjects.filter((row, j) => digest(row) !== digest(beforeProjects[j]));
      const agreementChanges = scene.state.agreements.filter((a) => {
        const before = beforeAgreements.find((old) => old.id === a.id);
        return !before || digest(before) !== digest(a);
      }).map((agreement) => ({ before: beforeAgreements.find((a) => a.id === agreement.id) ?? null,
        after: structuredClone(agreement) }));
      continuedWatches.push({ number: i + 1, beforeClock, afterClock: stamp(scene.world), nowMs,
        beforeHash, afterHash: sceneDigest(scene), selectedPlans: structuredClone(plans),
        observations: structuredClone(observations),
        blockedOrInterrupted: observations.filter((o) => !o.outcome.ok || o.interrupted).map((o) => ({ actor: o.actor,
          selectedPlan: plans[o.actor] ?? null, actualIntent: o.intent, reason: o.interrupted ?? o.outcome.refused ?? 'unavailable',
          outcome: o.outcome })),
        projectChanges, agreementChanges,
        conversationStatusChanges: scene.state.conversations.filter((c) => beforeConversations.find((old) => old.id === c.id)?.status !== c.status)
          .map(({ id, status }) => ({ id, status })), money });
    }
    const finalProjects = projectRecord(core, scene.state);
    const continuity = core.RESIDENTS.map(({ id }) => {
      const before = originalMinds[id], after = scene.state.minds[id];
      const result = { actor: id, projectIdentityPreserved: before.projectId === (after.project?.id ?? null),
        goalPreserved: before.goal === (after.project?.goal ?? null),
        noNewCognition: before.lastSuccessAtMs === after.lastSuccessAtMs && before.lastAttemptAtMs === after.lastAttemptAtMs
          && before.lastAppliedSequence === after.lastAppliedSequence,
        beforeLastThoughtAtMs: before.lastSuccessAtMs, afterLastThoughtAtMs: after.lastSuccessAtMs,
        retainedMemoryCount: after.memories.length, finalProjectStatus: after.project?.status ?? null };
      assert.ok(result.noNewCognition && result.projectIdentityPreserved && result.goalPreserved, 'continuation invented a thought or project');
      return result;
    });
    if (digest(core.sourceFiles) !== digest(await sourceManifest())) fail('source_changed_during_continuation');
    if (digest(originalLedger) !== beforeLedger) fail('caller_ledger_changed');
    const synthetic = ledger.config.test !== undefined || !/^[a-f0-9]{64}$/.test(ledger.config.accountHash ?? '');
    return {
      version: 1, mode: synthetic ? 'synthetic_fixture_only' : 'offline_recorded_v4_continuation',
      scope: 'Physical follow-through of already-recorded V4 answers, using the same source-bound engine and society code.',
      limitations: [
        'No new LLM responses, adaptation, replanning or independently authored replies are generated.',
        'This does not demonstrate sustained cognitive adaptation, social quality, production scheduling or SQL durability.',
        'Plan-step completion is physical evidence, not independent verification that an open-ended goal was achieved.',
        'Six-hour observation timestamps are simulated; conversation expiry is expected when no one supplies new replies.',
      ],
      source: { ledgerBinding: ledger.binding, ledgerDigest: beforeLedger, sourceDigest: digest(core.sourceFiles),
        sourceFiles: core.sourceFiles, policy: POLICY, model: MODEL,
        recordedAttempts: cognition.filter((row) => row.state !== 'skipped').length,
        recordedAcceptedDecisions: cognition.filter((row) => row.application?.ok).length,
        recordedAccountedNeurons: cognition.reduce((sum, row) => sum + row.accountedNeurons, 0) },
      newModelCalls: 0, newAccountedNeurons: 0, sourceLedgerChanged: false,
      replayedPhysicalWatches: 1, additionalPhysicalWatches: watches, starting, continuedWatches,
      final: { clock: stamp(scene.world), hash: sceneDigest(scene), projects: finalProjects,
        agreements: structuredClone(scene.state.agreements), publicSociety: core.societyPublicView(scene.state),
        money: moneyRecord(core, scene.world) },
      continuity, checks: { all25PhysicalActionsPerWatch: true, validSocietyAtEveryWatch: true,
        duplicateObservationsIdempotent: true, unchangedCognitionAndProjectIdentity: true, maxMoneyResidual },
    };
  });
}

export function parseArgs(args) {
  const options = { ledger: null, out: null, watches: 8 };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--ledger', '--out', '--watches'].includes(key) || seen.has(key) || !args[i + 1]) fail('invalid_arguments');
    seen.add(key);
    if (key === '--watches') {
      const value = args[++i];
      if (!/^[1-8]$/.test(value)) fail('watches_must_be_1_to_8');
      options.watches = Number(value);
    } else options[key.slice(2)] = args[++i];
  }
  if (!options.ledger || !options.out || !isAbsolute(options.ledger) || !isAbsolute(options.out)) fail('absolute_ledger_and_out_required');
  options.ledger = resolve(options.ledger); options.out = resolve(options.out);
  if ([options.ledger, join(dirname(options.ledger), 'report.json')].includes(options.out)) fail('original_v4_files_are_read_only');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await withoutNetwork(async () => {
    const bytes = await readFile(options.ledger), ledger = JSON.parse(bytes.toString('utf8'));
    const core = await loadCore();
    try {
      const report = await continueLedger(core, ledger, { watches: options.watches });
      report.source.ledgerFileSha256 = digest(bytes);
      report.runner = { path: 'scripts/continue-society-v4.mjs', sha256: digest(await readFile(fileURLToPath(import.meta.url))) };
      if (digest(await readFile(options.ledger)) !== digest(bytes)) fail('input_ledger_changed_during_read');
      await mkdir(dirname(options.out), { recursive: true });
      const output = await open(options.out, 'wx', 0o600);
      try { await output.writeFile(`${JSON.stringify(report, null, 2)}\n`); await output.sync(); }
      finally { await output.close(); }
      console.log(JSON.stringify({ mode: report.mode, report: options.out, newModelCalls: 0,
        additionalPhysicalWatches: report.additionalPhysicalWatches, maxMoneyResidual: report.checks.maxMoneyResidual }));
    } finally { await core.close(); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(JSON.stringify({ error: error.code ?? error.message })); process.exitCode = 1; });
}
