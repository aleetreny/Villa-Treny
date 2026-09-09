import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

/** Only an older valid release is retried; API/identity failures remain failures. */
export async function readPublishedRelease(readRelease, {
  expectedCommit, attempts = 7, wait = () => setTimeout(5_000), onWait = () => {},
} = {}) {
  assert.ok(Number.isInteger(attempts) && attempts > 0);
  let release;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    release = await readRelease();
    assert.equal(release.application, 'villa-treny');
    assert.match(release.commit, /^[a-f0-9]{40}$/);
    if (!expectedCommit || release.commit === expectedCommit) return release;
    if (attempt < attempts) {
      onWait(attempt, attempts);
      await wait();
    }
  }
  assert.equal(release.commit, expectedCommit, 'The public site does not match the release commit after the readiness window.');
}
