/* global window */
/** Deliberately recapture the original approved authoring canvases.
 * This is an art-authoring operation, never part of CI or normal export.
 * Review pixel changes before accepting a recapture on a different platform.
 */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LEGACY_ROOM_SOURCES } from '../tools/roomlab/legacy-room-sources.js';
import { canonicalDirectory, sha256, verifyLegacyDependencySet } from './legacy-room-art.mjs';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const origin = new URL(server.resolvedUrls.local[0]).origin;
  browser = await chromium.launch();
  const dependencies = new Set(['tools/roomlab/legacy-room-sources.js', 'scripts/capture-legacy-room-art.mjs']);
  const rooms = {};
  const rasters = new Map();
  for (const sourcePage of new Set(LEGACY_ROOM_SOURCES.map(([, , , page]) => page))) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== origin) { errors.push(`External authoring dependency: ${url.origin}`); return; }
      const path = decodeURIComponent(url.pathname).slice(1);
      if (/^(tools\/roomlab\/|public\/(assets|fonts)\/)/.test(path)) dependencies.add(path);
      else if (/^(assets|fonts)\//.test(path)) dependencies.add(`public/${path}`);
      // Only Vite's injected development clients are outside authoring input.
      // A new package request must not silently escape source provenance.
      else if (path !== '@vite/client' && path !== '@react-refresh'
        && !/^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?vite\/dist\/client\/env\.mjs$/.test(path)) errors.push(`Unmapped authoring dependency: ${path}`);
    });
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`Authoring source HTTP ${response.status()}: ${response.url()}`); });
    await page.goto(`${origin}/tools/roomlab/${sourcePage}`);
    await page.waitForFunction(() => window.__ready === 1, {}, { timeout: 60_000 });
    if (errors.length) throw new Error(errors.join('\n'));
    for (const [id, nativeWidth, nativeHeight, source, selector] of LEGACY_ROOM_SOURCES.filter(([, , , page]) => page === sourcePage)) {
      const capture = await page.locator(selector).evaluate((canvas) => ({
        width: canvas.width, height: canvas.height, png: canvas.toDataURL('image/png'),
      }));
      const bytes = Buffer.from(capture.png.split(',')[1], 'base64');
      const file = `${canonicalDirectory}/${id}.png`;
      rooms[id] = { file, page: source, selector, nativeWidth, nativeHeight,
        width: capture.width, height: capture.height, sha256: sha256(bytes) };
      rasters.set(file, bytes);
    }
    await page.close();
  }
  // A new import, image or fetched file must be declared and reviewed first.
  // Keep the approved rasters intact if the request closure does not match.
  verifyLegacyDependencySet(dependencies);
  const hashes = {};
  for (const file of [...dependencies].sort()) hashes[file] = sha256(await readFile(resolve(file)));
  const manifest = { version: 1, stage: 'original-authoring-canvas',
    environment: { platform: process.platform, architecture: process.arch, chromium: browser.version() },
    dependencies: hashes, rooms };
  await mkdir(resolve(canonicalDirectory), { recursive: true });
  for (const [file, bytes] of rasters) await writeFile(resolve(file), bytes);
  await writeFile(resolve(canonicalDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Captured ${Object.keys(rooms).length} original canvases with ${dependencies.size} hashed dependencies. Review export pixel differences before accepting changed art.`);
} finally {
  await browser?.close();
  await server.close();
}
