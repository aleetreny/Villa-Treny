/** Check the built deployable, not the private source library. */
import { readdir, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const walk = async (directory) => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async (entry) => {
  const path = resolve(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [relative(root, path).replaceAll('\\', '/')];
}))).flat();
const files = await walk(root);
const forbidden = files.filter((file) => /(?:^|\/)(?:props|library|tools|workers|node_modules)(?:\/|$)/.test(file)
  || /(?:^|\/)(?:\.env|\.dev\.vars)/.test(file));
if (forbidden.length) throw new Error(`Source-only files in distribution: ${forbidden.join(', ')}`);
const rooms = files.filter((file) => /^habitat\/rooms\/[^/]+\.png$/.test(file));
if (rooms.length !== 46) throw new Error(`Expected 46 final room images, found ${rooms.length}`);
await stat(resolve(root, 'index.html'));
for (const font of ['fonts/PixelifySans.ttf', 'fonts/IBMPlexSansCondensed-Regular.ttf', 'fonts/IBMPlexMono-Regular.ttf']) {
  await stat(resolve(root, font));
}
console.log(`Verified ${files.length} deployable files and ${rooms.length} rooms; no raw packs or private runtime files.`);
