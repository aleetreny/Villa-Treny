/** Read-only post-deployment check. Never calls a model or changes a vote. */
import assert from 'node:assert/strict';
import { readPublishedRelease } from './release-readiness.mjs';

const origin = 'https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev';
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--commit' || !/^[a-f0-9]{40}$/.test(args[1]))) {
  throw new Error('Usage: node scripts/verify-public.mjs [--commit FULL_GIT_SHA]');
}

async function read(path, type = 'application/json', status = 200) {
  const response = await fetch(origin + path, {
    headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(20_000), redirect: 'error',
  });
  assert.equal(response.status, status, `${path}: unexpected HTTP status`);
  assert.ok(response.headers.get('content-type')?.includes(type), `${path}: unexpected content type`);
  return type === 'application/json' ? response.json() : response.text();
}

const release = await readPublishedRelease(() => read('/release.json'), {
  expectedCommit: args[1],
  onWait: (attempt, attempts) => console.log(`Waiting for the expected public commit (${attempt}/${attempts}).`),
});
assert.equal((await read('/health')).ok, true);
const archive = await read('/v1/debates');
assert.ok(Array.isArray(archive.entries), 'Archive must be an actual API result.');
const paths = ['/', '/archive', '/residents', '/residents/A', '/rooms', '/about'];
if (archive.entries[0]) {
  const date = archive.entries[0].date;
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  const edition = await read(`/v1/debates/${date}`);
  assert.equal(edition.date, date);
  assert.ok(Array.isArray(edition.posts));
  paths.push(`/debates/${date}`);
}
for (const path of paths) {
  const html = await read(path, 'text/html');
  assert.match(html, /<title>[^<]*Villa Treny/);
  assert.match(html, /id="root"/);
}
await read('/v1/admin/debates', 'application/json', 401);
console.log(`Public Villa Treny release ${release.commit.slice(0, 7)} verified: ${paths.length} pages, saved archive, protected administration; zero mutations or inference.`);
