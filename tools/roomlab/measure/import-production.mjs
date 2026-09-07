import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { encodeBitmapRow } from '../../../src/lib/habitat/bitmap-codec.ts';

const source = process.argv[2];
if (!source) throw new Error('Usage: node tools/roomlab/measure/import-production.mjs /path/nightshift-rooms-export.json');
const rooms = JSON.parse(await readFile(source, 'utf8'));
if (Object.keys(rooms).length !== 46) throw new Error('Expected all 46 approved compositions.');
const output = new URL('../../../public/habitat/', import.meta.url);
const manifest = { version: 3, encoding: 'rle-v1', source: 'tools/roomlab/explorer-room-art.js', rooms: {} };
const hashes = {};
await mkdir(new URL('rooms/', output), { recursive: true });
for (const [id, { png, ...layout }] of Object.entries(rooms)) {
  if (!/^[a-z][a-z0-9]*$/.test(id) || !png.startsWith('data:image/png;base64,')) throw new Error(`Invalid export: ${id}`);
  const bytes = Buffer.from(png.split(',')[1], 'base64');
  if (bytes.readUInt32BE(16) !== layout.width || bytes.readUInt32BE(20) !== layout.height) throw new Error(`Incorrect dimensions: ${id}`);
  await writeFile(new URL(`rooms/${id}.png`, output), bytes);
  manifest.rooms[id] = { ...layout,
    grid: layout.grid.map(encodeBitmapRow),
    ...(layout.outlineMask ? { outlineMask: layout.outlineMask.map(encodeBitmapRow) } : {}),
    ...(layout.objects ? { objects: layout.objects.map((object) => ({ ...object, mask: object.mask.map(encodeBitmapRow),
      ...(object.footprintMask ? { footprintMask: object.footprintMask.map(encodeBitmapRow) } : {}),
    })) } : {}),
  };
  hashes[id] = createHash('sha256').update(bytes).digest('hex');
}
const metadata = new URL('../../../src/lib/habitat/generated/', import.meta.url);
await mkdir(metadata, { recursive: true });
await writeFile(new URL('rooms.json', metadata), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(new URL('export-hashes.json', output), JSON.stringify(hashes, null, 2) + '\n');
console.log('46 source images and generated navigation masks imported.');
