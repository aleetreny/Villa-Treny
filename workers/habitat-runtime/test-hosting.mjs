/* global Response */
// Separate post-build verification. No Wrangler config/dev-variable loader,
// credentials, remote bindings, persistent local state, or external HTTP.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = await import(
  pathToFileURL(wranglerRequire.resolve('miniflare')).href
);

test('built observer and canonical API share one offline Worker', async (t) => {
  const config = JSON.parse(await readFile(join(here, 'wrangler.jsonc'), 'utf8'));
  assert.equal(config.name, 'aleetreny-habitat-runtime');
  assert.equal(config.vars.HABITAT_ID, 'habitat-canonical');
  assert.equal(config.assets.binding, undefined);
  assert.deepEqual(config.assets.run_worker_first, ['/v1', '/v1/*', '/health', '/health/*']);
  const assetRoot = resolve(here, config.assets.directory);
  const bundleRoot = join(here, 'dist/dry-run');
  const html = await readFile(join(assetRoot, 'index.html'));
  const javascript = html.toString().match(/<script\b[^>]*\bsrc="([^"]+\.js)"/u)?.[1];
  assert.ok(javascript?.startsWith('/assets/'), 'Build the observer at base / first.');
  const files = await readdir(assetRoot, { recursive: true });
  const png = files.filter((file) => file.startsWith('habitat/') && file.endsWith('.png')).sort()[0];
  assert.ok(png, 'The verified room PNGs must be in the production build.');
  assert.equal(files.some((file) => /(?:^|\/)(?:\.env|\.dev\.vars|tools|library|props|workers|node_modules)(?:\/|$)/u.test(file)), false);

  let userInvocations = 0;
  let outboundAttempts = 0;
  const wrapper = `
    import handler from './index.js';
    export { HabitatWorld, DebateForum } from './index.js';
    export default {
      async fetch(request, env, ctx) {
        await env.HOSTING_TEST_VISIT.fetch('https://local.invalid/visit');
        const response = await handler.fetch(request, env, ctx);
        const instrumented = new Response(response.body, response);
        instrumented.headers.set('x-hosting-test-user-worker', '1');
        return instrumented;
      }
    };
  `;
  const modules = [
    { type: 'ESModule', path: join(bundleRoot, '__hosting-test-entry.mjs'), contents: wrapper },
    { type: 'ESModule', path: join(bundleRoot, 'index.js'), contents: await readFile(join(bundleRoot, 'index.js'), 'utf8') },
  ];
  for (const file of await readdir(bundleRoot)) {
    if (file.endsWith('.wasm')) modules.push({ type: 'CompiledWasm', path: join(bundleRoot, file), contents: await readFile(join(bundleRoot, file)) });
  }
  const blockOutbound = () => {
    outboundAttempts += 1;
    return new Response('External network is disabled in the hosting test.', { status: 503 });
  };
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: config.name,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags,
    telemetry: { enabled: false },
    modulesRoot: bundleRoot,
    modules,
    bindings: { ...config.vars, ADMIN_TOKEN: 'isolated-hosting-test-token', GROQ_API_KEY: '' },
    durableObjects: Object.fromEntries(config.durable_objects.bindings.map((binding) => {
      assert.equal(binding.script_name, undefined);
      assert.equal(config.exports[binding.class_name].type, 'durable-object');
      return [binding.name, { className: binding.class_name, useSQLite: config.exports[binding.class_name].storage === 'sqlite' }];
    })),
    serviceBindings: {
      HOSTING_TEST_VISIT: () => { userInvocations += 1; return new Response(null, { status: 204 }); },
      AI: blockOutbound,
    },
    outboundService: blockOutbound,
    assets: {
      directory: assetRoot,
      run_worker_first: config.assets.run_worker_first,
      routerConfig: { has_user_worker: true },
      assetConfig: { not_found_handling: config.assets.not_found_handling },
    },
  }));

  const request = (path, navigate = false) => mf.dispatchFetch(`https://hosting.invalid${path}`, {
    headers: navigate ? { 'sec-fetch-mode': 'navigate', accept: 'text/html' } : {},
  });
  try {
    await mf.ready;
    await t.test('HTML, JavaScript, PNG and SPA navigation bypass the user Worker', async () => {
      for (const [path, expected, contentType] of [
        ['/', html, 'text/html'],
        [javascript, await readFile(join(assetRoot, javascript)), 'javascript'],
        [`/${png}`, await readFile(join(assetRoot, png)), 'image/png'],
        ['/observer/common', html, 'text/html'],
      ]) {
        const response = await request(path, path === '/' || path.startsWith('/observer/'));
        assert.equal(response.status, 200, path);
        assert.ok(response.headers.get('content-type')?.includes(contentType), path);
        assert.equal(response.headers.has('x-hosting-test-user-worker'), false, path);
        assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array(expected), path);
      }
      assert.equal(userInvocations, 0, 'The application Worker did not handle any asset request.');
      assert.equal(outboundAttempts, 0);
    });

    let firstStatus;
    await t.test('direct API navigation reaches JSON status and health, never the SPA', async () => {
      const status = await request('/v1/status', true);
      assert.equal(status.status, 200);
      assert.match(status.headers.get('content-type') ?? '', /application\/json/u);
      assert.equal(status.headers.get('x-hosting-test-user-worker'), '1');
      assert.equal(status.headers.get('access-control-allow-origin'), config.vars.PUBLIC_ORIGIN);
      firstStatus = await status.json();
      assert.equal(firstStatus.mode, 'paused');
      const health = await request('/health', true);
      assert.equal(health.status, 200);
      assert.equal(health.headers.get('x-hosting-test-user-worker'), '1');
      assert.equal((await health.json()).ok, true);
      const writings = await request('/v1/records?limit=1', true);
      assert.equal(writings.status, 200);
      assert.equal(writings.headers.get('x-hosting-test-user-worker'), '1');
      assert.deepEqual(await writings.json(), { entries: [], nextCursor: null });
    });

    await t.test('daily board APIs are JSON, inert and separate from the old world', async () => {
      const response=await request('/v1/debates',true);assert.equal(response.status,200);const archive=await response.json();assert.deepEqual(archive.entries,[]);assert.equal(archive.schedule.enabled,false);
      const missing=await request('/v1/debates/2026-09-09',true);assert.equal(missing.status,404);assert.equal((await missing.json()).error.code,'edition_not_found');
    });

    await t.test('reserved API roots and descendants keep their JSON 404', async () => {
      for (const path of ['/v1', '/v1/unknown', '/v1/unknown/child', '/health/', '/health/unknown']) {
        const response = await request(path, true);
        assert.equal(response.status, 404, path);
        assert.match(response.headers.get('content-type') ?? '', /application\/json/u, path);
        assert.equal(response.headers.get('x-hosting-test-user-worker'), '1', path);
        assert.equal((await response.json()).error.code, 'not_found', path);
      }
    });

    await t.test('recovery stays authenticated even when requested as a page', async () => {
      const recovery = await request('/v1/admin/recovery', true);
      assert.equal(recovery.status, 401);
      assert.equal(recovery.headers.get('x-hosting-test-user-worker'), '1');
      assert.equal((await recovery.json()).error.code, 'unauthorized');
    });

    await t.test('reads preserve the world and make no provider or external requests', async () => {
      const finalStatus = await (await request('/v1/status')).json();
      assert.equal(finalStatus.mode, 'paused');
      assert.equal(finalStatus.worldRevision, firstStatus.worldRevision);
      assert.equal(finalStatus.nextWatchAtMs, firstStatus.nextWatchAtMs);
      assert.equal(outboundAttempts, 0);
      assert.equal(userInvocations, 12);
    });
    t.diagnostic('Actual dry-run bundle; 4 asset routes bypassed the user Worker; 12 API invocations including writings and daily debates; 0 external requests.');
  } finally {
    await mf.dispose();
  }
});
