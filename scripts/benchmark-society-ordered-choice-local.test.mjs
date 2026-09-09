import test from 'node:test';
import assert from 'node:assert/strict';
import { hash } from './benchmark-society-frozen-v7.mjs';
import { loadFrozenFinalDialogue, prepareFinalDialogueCases, sceneHash } from './benchmark-society-frozen-final-dialogue.mjs';
import { loadComparisonCore, comparisonJob, validateComparison, runComparison, verifyLedger, parseArgs, POLICY } from './benchmark-society-ordered-choice-local.mjs';

const fakeResponse = output => ({ status: 200, text: JSON.stringify({ choices: [{ finish_reason: 'stop',
  message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }) });
const jobsFor = (core, fixtures) => POLICY.order.map(item => {
  const [key, variant] = item.split(':'); return comparisonJob(core, fixtures.find(f => f.key === key), variant); });
const outputFor = (core, fixtures, job) => {
  const original = fixtures.find(f => f.key === job.caseKey).baselineOutput;
  if (job.variant === 'P4') return original;
  const converted = core.ordered.toOrderedChoice(original); assert.equal(converted.ok, true); return converted.value;
};

test('three historical scenes reproduce exact original jobs and never run a watch', async () => {
  const originalFetch = globalThis.fetch; globalThis.fetch = () => assert.fail('HTTP forbidden in frozen replay');
  const core = await loadFrozenFinalDialogue();
  try {
    core.advanceScheduledWatch = () => assert.fail('physical watch forbidden');
    const original = hash(core.reference), cases = await prepareFinalDialogueCases(core);
    assert.deepEqual(cases.map(f => f.key), ['J44', 'L45', 'J46']);
    assert.equal(cases[0].beforeHash, '31194e4160f17e63bdd28592e756224f193cee1dc579a615d48bf8d364acbcee');
    assert.equal(cases[1].beforeHash, core.reference.entries[0].application.afterHash);
    assert.equal(cases[2].beforeHash, core.reference.entries[1].application.afterHash);
    assert.equal(hash(core.reference), original); await core.verifyFrozenSources();
  } finally { await core.close(); globalThis.fetch = originalFetch; }
});

test('counterbalanced P4 is byte-exact; P5 changes only grammar and saved-system format instructions', async () => {
  const core = await loadComparisonCore();
  try {
    const fixtures = await prepareFinalDialogueCases(core.frozen), jobs = jobsFor(core, fixtures);
    assert.deepEqual(jobs.map(j => `${j.caseKey}:${j.variant}`), POLICY.order);
    for (const job of jobs) {
      const source = job.sourceJob.payload;
      assert.equal(job.payload.messages[1].content, source.messages[1].content);
      assert.equal(job.payload.seed, source.seed); assert.equal(job.payload.temperature, source.temperature);
      assert.equal(job.payload.max_tokens, 1024); assert.equal(job.payload.chat_template_kwargs.enable_thinking, false);
      if (job.variant === 'P4') assert.equal(hash(job.payload), hash(source));
      else {
        assert.equal(job.payload.messages[0].content, core.ordered.orderedSystemFromProposalSystem(source.messages[0].content));
        const restored = structuredClone(job.payload); restored.messages[0].content = source.messages[0].content;
        restored.response_format.json_schema.schema = source.response_format.json_schema.schema;
        assert.equal(hash(restored), hash(source));
      }
      const fixture = fixtures.find(f => f.key === job.caseKey), outcome = validateComparison(core, fixture, job, outputFor(core, fixtures, job));
      assert.equal(outcome.ok, true); assert.equal(outcome.clockUnchanged, true); assert.equal(outcome.newAgreements.length, 0);
      assert.deepEqual(outcome.proposedTermsMatchIncoming, [job.caseKey === 'J46']);
      assert.equal(sceneHash(fixture.scene), fixture.beforeHash);
    }
  } finally { await core.close(); }
});

test('explicit acceptance is classified separately from matching proposal; invalid IDs cannot move money', async () => {
  const core = await loadComparisonCore();
  try {
    const fixtures = await prepareFinalDialogueCases(core.frozen), fixture = fixtures[2];
    // Test-only branch uses the already-recorded acceptance wording, changing
    // only the executable decision. It is never saved as a model observation.
    const offer = fixture.scene.state.offers.find(o => o.status === 'open' && o.counterpart === fixture.actor);
    const accepted = { message: fixture.baselineOutput.message, deal: { kind: 'accept', offerId: offer.id } };
    for (const variant of ['P4', 'P5']) {
      const job = comparisonJob(core, fixture, variant), output = variant === 'P4' ? accepted : core.ordered.toOrderedChoice(accepted).value;
      const r = validateComparison(core, fixture, job, output);
      assert.equal(r.ok, true); assert.equal(r.decision, 'accept'); assert.equal(r.newAgreements.length, 1);
      assert.equal(r.newAgreements[0].status, 'active'); assert.deepEqual(r.balanceChanges, []); assert.equal(r.physicalWatches, 0);
      const invalid = { ...accepted, deal: { kind: 'accept', offerId: 'offer:999999' } };
      const wrong = variant === 'P4' ? invalid : core.ordered.toOrderedChoice(invalid).value;
      assert.equal(validateComparison(core, fixture, job, wrong).ok, false);
    }
  } finally { await core.close(); }
});

test('six-call cap, durable raw before apply, zero-request replay and no unknown retries', async () => {
  const core = await loadComparisonCore();
  try {
    const fixtures = await prepareFinalDialogueCases(core.frozen), jobs = jobsFor(core, fixtures), config = { test: true },
      ledger = { config, binding: hash(config), entries: [] }, saves = [];
    let calls = 0;
    const r = await runComparison(core, fixtures, jobs, ledger, { maxNewCalls: 6,
      persist: async l => saves.push(structuredClone(l)), dispatch: async job => {
        calls++; assert.equal(saves.at(-1).entries.at(-1).state, 'reserved');
        return fakeResponse(outputFor(core, fixtures, job));
      } });
    assert.equal(calls, 6); assert.equal(r.newCalls, 6);
    assert.ok(saves.some(l => l.entries.some(row => row.rawResponse && !row.validation)));
    verifyLedger(core, ledger, config, jobs);
    const before = hash(ledger), replay = await runComparison(core, fixtures, jobs, ledger, { maxNewCalls: 0,
      dispatch: () => assert.fail('replay HTTP'), persist: () => assert.fail('replay writes') });
    assert.equal(replay.newCalls, 0); assert.equal(hash(ledger), before);
    const unknown = { entries: [] };
    await runComparison(core, fixtures, jobs, unknown, { maxNewCalls: 1, dispatch: () => { throw Error('uncertain transport'); } });
    assert.equal(unknown.entries.length, 1); assert.equal(unknown.entries[0].validation, undefined);
    await runComparison(core, fixtures, jobs, unknown, { maxNewCalls: 0, dispatch: () => assert.fail('unknown retry') });
    assert.throws(() => parseArgs(['--run', '--max-new-calls', '7', '--server-pid', '1']));
    assert.equal(parseArgs([]).run, false); assert.equal(parseArgs([]).maxNewCalls, 1);
    const corrupted = structuredClone(ledger); corrupted.entries[0].rawResponse = '{}';
    assert.throws(() => verifyLedger(core, corrupted, config, jobs));
  } finally { await core.close(); }
});
