import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCore } from './benchmark-society-runtime-v4.mjs';
import { selfTest, parseArgs } from './benchmark-society-grounded-turns.mjs';

test('grounded-turn intervention replays contexts with per-model budgets and no network', async () => {
  const original = globalThis.fetch; let requests = 0, core;
  globalThis.fetch = () => { requests += 1; throw new Error('No network in comparison self-test'); };
  try {
    core = await loadCore(); const result = await selfTest(core);
    assert.equal(result.status, 'pass'); assert.equal(result.apiCalls, 0); assert.equal(result.credentialReads, 0);
    assert.equal(requests, 0); assert.equal(result.fakeComparisonCalls, 4);
    for (const limit of ['5', '-1', '1.5']) assert.throws(() => parseArgs(['--live', '--out', '/tmp/test', '--max-new-calls', limit]));
    assert.throws(() => parseArgs(['--live', '--out', 'relative']));
  } finally { await core?.close(); globalThis.fetch = original; }
});
