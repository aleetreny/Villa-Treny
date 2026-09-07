/** Public, read-only evidence. This is not a full recovery checkpoint. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const base = process.env.HABITAT_RUNTIME_URL ?? 'https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev';
const output = resolve(process.argv[2] ?? 'test-results/runtime-read');
await mkdir(output, { recursive: true });
const read = async (path) => {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Read failed (${response.status}): ${path}`);
  return response.json();
};
const [status, observer] = await Promise.all([read('/v1/status'), read('/v1/observer')]);
const archives = [];
for (let day = 100; day <= observer.snapshot.day; day++) archives.push(await read(`/v1/archive?day=${day}`));
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const evidence = {
  capturedAt: new Date().toISOString(), base, status,
  snapshot: { day: observer.snapshot.day, watch: observer.snapshot.watch, residents: observer.snapshot.people.length, rooms: observer.snapshot.rooms.length },
  relationships: { count: observer.relationships.length, sha256: hash(observer.relationships) },
  society: observer.society,
  archives: archives.map((archive) => ({ day: archive.day, entries: archive.entries.length, sha256: hash(archive.entries) })),
};
await Promise.all([
  writeFile(resolve(output, 'summary.json'), `${JSON.stringify(evidence, null, 2)}\n`),
  writeFile(resolve(output, 'observer.json'), `${JSON.stringify(observer, null, 2)}\n`),
  writeFile(resolve(output, 'status.json'), `${JSON.stringify(status, null, 2)}\n`),
  writeFile(resolve(output, 'archives.json'), `${JSON.stringify(archives, null, 2)}\n`),
]);
console.log(JSON.stringify({ output, revision: status.worldRevision, ...evidence.snapshot, archiveEvents: archives.reduce((sum, a) => sum + a.entries.length, 0) }));
