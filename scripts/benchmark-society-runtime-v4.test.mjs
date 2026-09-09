import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCore, POLICY, selfTest, sourceManifest } from './benchmark-society-runtime-v4.mjs';

test('V4 survives staged calls and crash replay with every network request forbidden', async () => {
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
    assert.equal(POLICY.habitatId, 'isolated-society-runtime-v4');
    assert.equal(POLICY.maxNeurons, 1100);
    assert.equal(POLICY.maxCalls, 37);
    const source = await sourceManifest();
    for (const path of ['src/lib/habitat/society/turn.ts', 'src/lib/habitat/society/schema.ts',
      'src/lib/habitat/engine/tick.ts', 'workers/habitat-runtime/src/contracts.ts',
      'workers/habitat-runtime/src/society-scheduler.ts', 'workers/habitat-runtime/src/providers/workers-ai.ts',
      'workers/habitat-runtime/src/providers/shared.ts', 'workers/habitat-runtime/src/providers/deadline.ts',
      'scripts/benchmark-society-runtime-v4.mjs', 'scripts/benchmark-society-runtime.mjs',
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
