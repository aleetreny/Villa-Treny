import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadCore, newLedger, runFixture, POLICY, MODEL } from './benchmark-society-runtime-v4.mjs';
import { continueLedger, parseArgs } from './continue-society-v4.mjs';

function response(job) {
  const context = JSON.parse(job.turn.prompt.slice(job.turn.prompt.indexOf('\n') + 1));
  const project = { mode: 'replace', goal: 'Synthetic fixture: inspect then record Common.', why: 'An offline physical-follow-through test.',
    visibility: 'public', steps: [{ verb: 'inspect', at: 'common' }, { verb: 'note', at: 'common' }] };
  if (job.stage === 'initial' && job.actor === 'A') return { project,
    message: { to: 'B', text: 'Would you inspect Common once for one cell?' } };
  if (job.stage === 'initial' && job.actor === 'B') return { project,
    message: { to: 'A', text: 'I propose one cell for that inspection.' }, offer: { expiresInWatches: 2,
      terms: { kind: 'work', payer: 'A', worker: 'B', cells: 1, verb: 'inspect', room: 'common', units: 1,
        dueWatch: context.public.watchNumber + 3 } } };
  if (job.stage === 'initial' && job.actor === 'C') return { project: { ...project,
    goal: 'Synthetic fixture: expose physically unavailable cultivation.', steps: [{ verb: 'grow', at: 'common' }] } };
  if (job.stage === 'initial' && job.actor === 'D') return { project: { ...project,
    goal: 'Synthetic fixture: keep an open social purpose.', steps: [] } };
  if (job.stage === 'initial') return { project };
  if (job.stage === 'reply') {
    const to = job.actor === 'A' ? 'B' : 'A';
    const incoming = context.openOffers.find((offer) => offer.counterpart === job.actor);
    return incoming ? { message: { to, text: 'I accept that exact one-cell inspection.' },
      respond: { offerId: incoming.id, decision: 'accept' } }
      : { message: { to, text: 'We will check the physical evidence later.', close: true } };
  }
  return { reflection: { text: 'Synthetic fixture: retain the recorded next step.', refs: [job.turn.evidenceIds[0]] } };
}

test('eight offline watches preserve V4, expose real failures and never invent new cognition', async () => {
  const oldFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = () => { networkCalls++; throw new Error('Test forbids network'); };
  const core = await loadCore();
  let directory;
  try {
    const config = { policy: POLICY, model: MODEL, source: core.sourceFiles, test: 'synthetic-follow-through-only' };
    const ledger = newLedger(config);
    const initial = await runFixture(core, ledger, { dispatch: async (job) => ({ status: 200,
      text: JSON.stringify({ success: true, result: { response: JSON.stringify(response(job)),
        usage: { prompt_tokens: 600, completion_tokens: 100, total_tokens: 700 } } }) }) });
    assert.equal(initial.halted, null);
    assert.ok(ledger.entries.filter((entry) => entry.kind === 'cognition').every((entry) => entry.application?.ok));
    const original = structuredClone(ledger);
    const report = await continueLedger(core, ledger);
    assert.equal(report.mode, 'synthetic_fixture_only');
    assert.equal(report.newModelCalls, 0);
    assert.equal(report.newAccountedNeurons, 0);
    assert.equal(networkCalls, 0);
    assert.equal(report.additionalPhysicalWatches, 8);
    assert.equal(report.replayedPhysicalWatches, 1);
    assert.deepEqual(report.starting.clock, { day: 100, watch: 2 });
    assert.deepEqual(report.final.clock, { day: 102, watch: 2 });
    assert.equal(report.continuedWatches.flatMap((watch) => watch.observations).length, 200);
    assert.equal(report.continuity.length, 25);
    assert.ok(report.continuity.every((row) => row.noNewCognition && row.projectIdentityPreserved && row.goalPreserved));
    assert.ok(report.checks.maxMoneyResidual < 1e-8);
    assert.equal(report.final.projects.find((row) => row.actor === 'D').project.status, 'active');
    assert.equal(report.final.projects.find((row) => row.actor === 'C').project.steps[0].status, 'failed');
    assert.ok(report.starting.projects.find((row) => row.actor === 'C').project.steps[0].status === 'failed'
      || report.continuedWatches.some((watch) => watch.blockedOrInterrupted.some((row) => row.actor === 'C')));
    assert.ok(report.final.projects.some((row) => row.project?.steps.some((step) => step.status === 'done')));
    assert.ok(report.final.agreements.some((agreement) => agreement.status === 'fulfilled' && agreement.terms.kind === 'work'));
    assert.deepEqual(ledger, original);
    assert.deepEqual(await continueLedger(core, ledger), report, 'identical saved answers replay deterministically');

    const incomplete = structuredClone(ledger); incomplete.entries.pop();
    await assert.rejects(continueLedger(core, incomplete), (error) => error.code === 'v4_ledger_not_complete');
    const missingApplication = structuredClone(ledger);
    delete missingApplication.entries.find((entry) => entry.application).application;
    await assert.rejects(continueLedger(core, missingApplication), (error) => error.code === 'incomplete_ledger_requires_write');
    const wrongSource = newLedger({ ...config, source: [] }); wrongSource.entries = ledger.entries;
    await assert.rejects(continueLedger(core, wrongSource), (error) => error.code === 'ledger_binding_or_format');
    const wrongUsage = structuredClone(ledger); wrongUsage.entries[0].accountedNeurons++;
    await assert.rejects(continueLedger(core, wrongUsage), (error) => error.code === 'ledger_accounting_invalid');
    for (const watches of [0, 9, 1.5]) await assert.rejects(continueLedger(core, ledger, { watches }),
      (error) => error.code === 'watches_must_be_1_to_8');

    // CLI evidence stays in a temporary directory and labelled synthetic. No
    // generated fixture output is published as a real model experiment.
    directory = await mkdtemp(join(tmpdir(), 'villa-continuation-fixture-'));
    const input = join(directory, 'ledger.json'), originalReport = join(directory, 'report.json');
    const output = join(directory, 'physical-continuation.json');
    const bytes = `${JSON.stringify(ledger, null, 2)}\n`;
    await writeFile(input, bytes); await writeFile(originalReport, 'original V4 report sentinel');
    const args = [resolve('scripts/continue-society-v4.mjs'), '--ledger', input, '--out', output, '--watches', '2'];
    const run = spawnSync(process.execPath, args, { encoding: 'utf8', env: { PATH: process.env.PATH, NO_COLOR: '1' } });
    assert.equal(run.status, 0, run.stderr);
    const written = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(written.mode, 'synthetic_fixture_only');
    assert.equal(written.additionalPhysicalWatches, 2);
    assert.equal(written.newModelCalls, 0);
    assert.match(written.source.ledgerFileSha256, /^[a-f0-9]{64}$/);
    assert.match(written.runner.sha256, /^[a-f0-9]{64}$/);
    const repeated = spawnSync(process.execPath, args, { encoding: 'utf8', env: { PATH: process.env.PATH, NO_COLOR: '1' } });
    assert.equal(repeated.status, 1);
    assert.match(repeated.stderr, /EEXIST/);
    assert.equal(await readFile(input, 'utf8'), bytes);
    assert.equal(await readFile(originalReport, 'utf8'), 'original V4 report sentinel');
  } finally {
    await core.close(); globalThis.fetch = oldFetch;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

test('CLI refuses live options, original outputs and unbounded continuation', () => {
  const base = ['--ledger', '/private/ledger.json', '--out', '/private/physical-continuation.json'];
  assert.equal(parseArgs(base).watches, 8);
  assert.throws(() => parseArgs([...base, '--live']), /invalid_arguments/);
  assert.throws(() => parseArgs([...base, '--watches', '9']), /watches_must_be_1_to_8/);
  assert.throws(() => parseArgs(['--ledger', '/private/ledger.json', '--out', '/private/report.json']), /original_v4_files_are_read_only/);
  assert.throws(() => parseArgs(['--ledger', '/private/ledger.json', '--out', '/private/ledger.json']), /original_v4_files_are_read_only/);
  assert.throws(() => parseArgs(['--ledger', 'relative.json', '--out', '/private/continuation.json']), /absolute_ledger_and_out_required/);
});
