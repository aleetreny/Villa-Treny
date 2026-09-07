import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { canonicalDirectory, verifyLegacySources } from './legacy-room-art.mjs';

let root;
let manifest;
beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'villa-legacy-source-'));
  manifest = JSON.parse(await readFile(resolve(canonicalDirectory, 'manifest.json'), 'utf8'));
  const files = [...Object.keys(manifest.dependencies), ...Object.values(manifest.rooms).map((room) => room.file), `${canonicalDirectory}/manifest.json`];
  for (const file of files) {
    await mkdir(dirname(resolve(root, file)), { recursive: true });
    await cp(resolve(file), resolve(root, file));
  }
});
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

test('approved raw canvases and every recorded authoring source verify independently of final room PNGs', async () => {
  assert.deepEqual(await verifyLegacySources(root), { rooms: 11, dependencies: 24 });
});

test('a changed authoring dependency fails before any room export', async () => {
  await writeFile(resolve(root, 'tools/roomlab/cabin-kit.js'), '// changed authoring code');
  await assert.rejects(verifyLegacySources(root), /Legacy authoring source changed.*cabin-kit/);
});

test('modified canonical image bytes cannot be accepted with an old digest', async () => {
  const file = resolve(root, manifest.rooms.workshops.file);
  const png = await readFile(file);
  png[100] ^= 1;
  await writeFile(file, png);
  await assert.rejects(verifyLegacySources(root), /Canonical source canvas changed: workshops/);
});

test('the authoring page cannot be silently omitted from provenance', async () => {
  delete manifest.dependencies['tools/roomlab/diggings.html'];
  await writeFile(resolve(root, canonicalDirectory, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(verifyLegacySources(root), /Missing required legacy authoring dependency/);
});

test('a different raw canvas selector is rejected even if its PNG hash is unchanged', async () => {
  manifest.rooms.dig1.selector = '#wrap figure:nth-child(2) canvas';
  await writeFile(resolve(root, canonicalDirectory, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(verifyLegacySources(root), /Invalid canonical canvas definition: dig1/);
});
