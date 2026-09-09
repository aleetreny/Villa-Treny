import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJob, loadCore, MODEL, newLedger, POLICY, receive, selfTest, sourceManifest, verifyLedger } from './benchmark-society-runtime-v5.mjs';

test('V5 survives staged calls and crash replay with every network request forbidden', async () => {
  const savedFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = () => { networkCalls += 1; throw new Error('Network is forbidden in the offline experiment'); };
  let core;
  try {
    core = await loadCore();
    const result = await selfTest(core);
    assert.equal(result.status, 'pass');
    assert.equal(result.realApiCalls, 0);
    assert.equal(result.primaryFixtureResponses, 31);
    assert.equal(networkCalls, 0);
    assert.equal(POLICY.habitatId, 'isolated-society-runtime-v5');
    assert.equal(POLICY.maxNeurons, 750);
    assert.equal(POLICY.maxCalls, 37);
    const source = await sourceManifest();
    for (const path of ['src/lib/habitat/society/turn.ts', 'src/lib/habitat/society/schema.ts',
      'src/lib/habitat/society/instructions.ts', 'src/lib/habitat/society/choice.ts', 'src/lib/habitat/society/economy.ts',
      'src/lib/habitat/engine/tick.ts', 'workers/habitat-runtime/src/contracts.ts',
      'workers/habitat-runtime/src/society-scheduler.ts', 'workers/habitat-runtime/src/providers/workers-ai.ts',
      'workers/habitat-runtime/src/providers/shared.ts', 'workers/habitat-runtime/src/providers/deadline.ts',
      'workers/habitat-runtime/src/providers/groq-token-estimate.ts', 'workers/habitat-runtime/src/providers/router.ts',
      'scripts/benchmark-society-runtime-v5.mjs', 'scripts/benchmark-society-runtime.mjs',
      'scripts/benchmark-society-models.mjs', 'pnpm-lock.yaml']) {
      assert.match(source.find((entry) => entry.path === path)?.sha256 ?? '', /^[a-f0-9]{64}$/);
    }
    assert.equal(source.some((entry) => entry.path === 'package.json'), false);
    assert.equal(new Set(source.map((entry) => entry.path)).size, source.length);
  } finally {
    await core?.close();
    globalThis.fetch = savedFetch;
  }
});

test('V5 retains authoritative unknown reservations and refuses the next complete request before its cap', async () => {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network is forbidden in the offline experiment'); };
  let core;
  try {
    core = await loadCore();
    const world = core.genesisState(POLICY.seed);
    const scene = { world, state: core.createSocietyState(world, POLICY.epochMs), worldRevision: 0 };
    const config = { test: 'offline-v5-full-reservations', policy: POLICY, model: MODEL, source: core.sourceFiles };
    const ledger = newLedger(config);
    let sends = 0, refused = false;
    for (const [i, { id }] of core.RESIDENTS.entries()) {
      const job = buildJob(core, scene, id, 'initial', i);
      const before = ledger.entries.reduce((sum, row) => sum + row.accountedNeurons, 0);
      const previousSends = sends;
      const row = await receive(job, ledger, async () => {}, async () => {
        sends += 1;
        return { status: 200, text: JSON.stringify({ success: true, result: { response: '{}' } }) };
      }, undefined, core.parseStructuredPayload);
      if (before + job.reservedNeurons > POLICY.maxNeurons) {
        assert.equal(row.state, 'skipped'); assert.equal(row.errorCode, 'budget_exhausted');
        assert.equal(row.accountedNeurons, 0); assert.equal(sends, previousSends); refused = true;
      } else {
        assert.equal(row.state, 'completed'); assert.equal(row.receipt.complete, false);
        assert.equal(row.accountedNeurons, job.reservedNeurons); assert.equal(sends, previousSends + 1);
      }
      assert.ok(ledger.entries.reduce((sum, entry) => sum + entry.accountedNeurons, 0) <= 750);
    }
    assert.equal(refused, true); assert.ok(sends > 0 && sends < 25);
    verifyLedger(ledger, config, core);
  } finally { await core?.close(); globalThis.fetch = savedFetch; }
});
