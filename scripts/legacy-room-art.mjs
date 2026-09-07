import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LEGACY_ROOM_SOURCES } from '../tools/roomlab/legacy-room-sources.js';

export const canonicalDirectory = 'tools/roomlab/canonical-legacy';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Verify the approved raw canvases, not the final exported room fixtures.
 * A changed authoring page, imported kit, source sheet or capture algorithm
 * requires an explicit new capture and visual review; CI never regenerates it.
 */
export async function verifyLegacySources(root = process.cwd()) {
  const manifest = JSON.parse(await readFile(resolve(root, canonicalDirectory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.stage !== 'original-authoring-canvas') throw new Error('Invalid legacy source manifest');
  const ids = LEGACY_ROOM_SOURCES.map(([id]) => id).sort();
  if (JSON.stringify(Object.keys(manifest.rooms).sort()) !== JSON.stringify(ids)) throw new Error('Legacy source room set changed');
  for (const [file, expected] of Object.entries(manifest.dependencies)) {
    if (!/^(tools\/roomlab\/|public\/(assets|fonts)\/|scripts\/)/.test(file)
      || file.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Invalid legacy source path or hash: ${file}`);
    if (sha256(await readFile(resolve(root, file))) !== expected) throw new Error(`Legacy authoring source changed: ${file}. Capture and review the original canvases before exporting.`);
  }
  const required = ['tools/roomlab/legacy-room-sources.js', 'scripts/capture-legacy-room-art.mjs'];
  for (const [id, width, height, page, selector] of LEGACY_ROOM_SOURCES) {
    const room = manifest.rooms[id];
    required.push(`tools/roomlab/${page}`);
    if (room.page !== page || room.selector !== selector || room.nativeWidth !== width || room.nativeHeight !== height
      || !Number.isInteger(room.width) || !Number.isInteger(room.height) || room.width < width || room.height < height
      || room.width / width !== room.height / height || !Number.isInteger(room.width / width)
      || room.file !== `${canonicalDirectory}/${id}.png`) throw new Error(`Invalid canonical canvas definition: ${id}`);
    const png = await readFile(resolve(root, room.file));
    if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.length < 24
      || png.readUInt32BE(16) !== room.width || png.readUInt32BE(20) !== room.height
      || sha256(png) !== room.sha256) throw new Error(`Canonical source canvas changed: ${id}`);
  }
  if (required.some((file) => !manifest.dependencies[file])) throw new Error('Missing required legacy authoring dependency');
  return { rooms: ids.length, dependencies: Object.keys(manifest.dependencies).length };
}
