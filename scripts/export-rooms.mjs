/* global window, document, Image */
/** Reproduce room PNGs and navigation metadata in an isolated browser.
 * No live API, desktop session, model or cloud mutation is used.
 */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const verify = process.argv.includes('--verify');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  // Source-over shadow compositing must use the software renderer on both
  // authoring Macs and Linux CI, rather than platform-specific GPU backends.
  browser = await chromium.launch({ args: ['--disable-gpu'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}tools/roomlab/export-production.html`);
  await page.waitForFunction(() => window.__ready === 1, { }, { timeout: 120_000 });
  if (errors.length) throw new Error(errors.join('\n'));
  const exported = await page.evaluate(() => window.__productionRooms);
  const alphaMasks = verify ? await page.evaluate(async () => {
    const sources = new Map();
    let count = 0;
    const readSource = async (file) => {
      if (!sources.has(file)) {
        if (!/^(public\/assets\/|tools\/roomlab\/)/.test(file) || file.split('/').includes('..')) throw new Error(`Invalid source path: ${file}`);
        const root = new URL('../../', window.location.href);
        const image = new Image(); image.src = new URL(file.replace(/^public\//, ''), root).href;
        try { await image.decode(); } catch { throw new Error(`Could not read original alpha source: ${file}`); }
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0);
        sources.set(file, { width: image.width, height: image.height, pixels: context.getImageData(0, 0, image.width, image.height).data });
      }
      return sources.get(file);
    };
    for (const [roomId, room] of Object.entries(window.__productionRooms)) {
      const ids = new Set();
      for (const object of room.objects ?? []) {
        const label = `${roomId}/${object.id}`;
        if (ids.has(object.id)) throw new Error(`Duplicate foreground object ID: ${label}`);
        ids.add(object.id);
        if (!object.source?.file || !object.source.rect) throw new Error(`Missing original alpha source: ${label}`);
        const source = await readSource(object.source.file);
        const [sx, sy, width, height] = object.source.rect;
        if (sx < 0 || sy < 0 || sx + width > source.width || sy + height > source.height
          || width !== object.bounds[2] || height !== object.bounds[3] || object.mask.length !== height) throw new Error(`Invalid native source dimensions: ${label}`);
        for (let y = 0; y < height; y++) {
          if (object.mask[y].length !== width) throw new Error(`Invalid foreground mask row: ${label}/${y}`);
          for (let x = 0; x < width; x++) {
            const sourceX = sx + (object.source.mirrored ? width - 1 - x : x);
            const expected = source.pixels[((sy + y) * source.width + sourceX) * 4 + 3] > 8 ? '1' : '0';
            if (object.mask[y][x] !== expected) throw new Error(`Foreground alpha differs from original: ${label} at ${x},${y}`);
          }
        }
        count++;
      }
    }
    return count;
  }) : 0;
  const { encodeBitmapRow } = await server.ssrLoadModule('/src/lib/habitat/bitmap-codec.ts');
  const rooms = {};
  const hashes = {};
  const mismatches = [];
  for (const [id, data] of Object.entries(exported)) {
    const { png, ...metadata } = data;
    if (!/^data:image\/png;base64,/.test(png)) throw new Error(`Invalid PNG: ${id}`);
    const bytes = Buffer.from(png.split(',')[1], 'base64');
    const path = resolve('public/habitat/rooms', `${id}.png`);
    if (verify) {
      // Compare decoded pixels. PNG encoder versions may change compression.
      const existing = await readFile(path);
      const comparison = await page.evaluate(async ([a, b]) => {
        const decode = async (base64) => {
          const img = new Image(); img.src = `data:image/png;base64,${base64}`; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0);
          return { w: c.width, h: c.height, px: g.getImageData(0, 0, c.width, c.height).data };
        };
        const [x, y] = await Promise.all([decode(a), decode(b)]);
        if (x.w !== y.w || x.h !== y.h) return { matches: false, dimensions: [[x.w, x.h], [y.w, y.h]] };
        const samples = [], deltas = {};
        let pixels = 0, alphaChanges = 0, maxDelta = 0;
        for (let i = 0; i < x.px.length; i += 4) {
          if ([0, 1, 2, 3].every((channel) => x.px[i + channel] === y.px[i + channel])) continue;
          pixels++;
          if (x.px[i + 3] !== y.px[i + 3]) alphaChanges++;
          const diff = [0, 1, 2, 3].map((channel) => x.px[i + channel] - y.px[i + channel]);
          for (const delta of diff) { maxDelta = Math.max(maxDelta, Math.abs(delta)); deltas[delta] = (deltas[delta] ?? 0) + 1; }
          if (samples.length < 25) samples.push({ x: (i / 4) % x.w, y: Math.floor(i / 4 / x.w), actual: [...x.px.slice(i, i + 4)], expected: [...y.px.slice(i, i + 4)] });
        }
        return { matches: pixels === 0, pixels, alphaChanges, maxDelta, deltas, samples };
      }, [bytes.toString('base64'), existing.toString('base64')]);
      if (!comparison.matches) {
        const evidence = resolve('test-results/room-export');
        await mkdir(evidence, { recursive: true });
        await writeFile(resolve(evidence, `${id}-actual.png`), bytes);
        await writeFile(resolve(evidence, `${id}-expected.png`), existing);
        mismatches.push({ id, ...comparison });
      }
    } else {
      await mkdir(resolve('public/habitat/rooms'), { recursive: true });
      await writeFile(path, bytes);
    }
    rooms[id] = { ...metadata,
      grid: metadata.grid.map(encodeBitmapRow),
      ...(metadata.outlineMask ? { outlineMask: metadata.outlineMask.map(encodeBitmapRow) } : {}),
      ...(metadata.objects ? { objects: metadata.objects.map((object) => ({ ...object, mask: object.mask.map(encodeBitmapRow),
        ...(object.footprintMask ? { footprintMask: object.footprintMask.map(encodeBitmapRow) } : {}),
      })) } : {}),
    };
    hashes[id] = createHash('sha256').update(bytes).digest('hex');
  }
  const manifest = { version: 3, encoding: 'rle-v1', source: 'tools/roomlab/explorer-room-art.js', rooms };
  const manifestPath = resolve('src/lib/habitat/generated/rooms.json');
  if (verify) {
    if (mismatches.length) {
      await writeFile(resolve('test-results/room-export/mismatches.json'), `${JSON.stringify(mismatches, null, 2)}\n`);
      throw new Error(`Room pixels differ from their source export: ${mismatches.map(({ id }) => id).join(', ')}. See test-results/room-export.`);
    }
    const committed = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (JSON.stringify(committed.rooms) !== JSON.stringify(rooms)) throw new Error('Navigation manifest is out of date. Run pnpm rooms:export.');
  } else {
    await mkdir(resolve('src/lib/habitat/generated'), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(resolve('public/habitat/export-hashes.json'), `${JSON.stringify(hashes, null, 2)}\n`);
  }
  console.log(`${verify ? 'Verified' : 'Exported'} ${Object.keys(rooms).length} source rooms and their navigation metadata.${verify ? ` ${alphaMasks} foreground masks match their original source alpha.` : ''}`);
} finally {
  await browser?.close();
  await server.close();
}
