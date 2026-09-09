import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPublishedRelease } from './release-readiness.mjs';

const old = { application: 'villa-treny', commit: 'a'.repeat(40) };
const current = { application: 'villa-treny', commit: 'b'.repeat(40) };
test('waits for the exact expected release without accepting a stale success', async () => {
  let reads = 0, waits = 0;
  const result = await readPublishedRelease(async () => ++reads < 3 ? old : current, {
    expectedCommit: current.commit, wait: async () => { waits++; },
  });
  assert.equal(result, current); assert.equal(reads, 3); assert.equal(waits, 2);
});
test('a persistently wrong release still fails within the fixed attempt budget', async () => {
  let reads = 0, waits = 0;
  await assert.rejects(readPublishedRelease(async () => { reads++; return old; }, {
    expectedCommit: current.commit, attempts: 3, wait: async () => { waits++; },
  }), /does not match the release commit/);
  assert.equal(reads, 3); assert.equal(waits, 2);
});
test('read-only inspection without an expected commit returns the first valid release', async () => {
  assert.equal(await readPublishedRelease(async () => old, { wait: async () => { assert.fail('Unexpected wait'); } }), old);
});
test('a wrong application identity is rejected immediately', async () => {
  await assert.rejects(readPublishedRelease(async () => ({ ...current, application: 'unrelated' }), {
    expectedCommit: current.commit, wait: async () => { assert.fail('Unexpected wait'); },
  }), /villa-treny/);
});
test('transport failures are not disguised as publication propagation', async () => {
  await assert.rejects(readPublishedRelease(async () => { throw new Error('HTTP 503'); }, {
    expectedCommit: current.commit, wait: async () => { assert.fail('Unexpected wait'); },
  }), /HTTP 503/);
});
