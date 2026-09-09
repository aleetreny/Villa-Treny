/** Authenticated capture. The server freezes an auxiliary cut without advancing the world. */
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createServer } from 'vite';

const token = process.env.HABITAT_ADMIN_TOKEN;
if (!token || !process.argv[2]) throw new Error('Provide HABITAT_ADMIN_TOKEN and an output directory outside the repository.');
const output = resolve(process.argv[2]), repository = resolve(import.meta.dirname, '..');
if (output === repository || output.startsWith(`${repository}${sep}`)) throw new Error('Private recovery data must be stored outside the repository.');
const base = process.env.HABITAT_RUNTIME_URL ?? 'https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev';
const read = async (path) => {
  const response = await fetch(new URL(path, base), { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Recovery read failed (${response.status}).`);
  if (response.headers.get('cache-control') !== 'no-store') throw new Error('Recovery must be private and uncached.');
  return response.json();
};
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const { verifyRecoveryExport, verifyRecoveryBundle } = await server.ssrLoadModule('/workers/habitat-runtime/src/checkpoint.ts');
  const core = await read('/v1/admin/recovery');
  verifyRecoveryExport(core);
  const pages = [];
  for (const item of core.manifest ?? []) {
    let afterRowId = -1;
    do {
      const query = new URLSearchParams({ table: item.table, upperRowId: String(item.upperRowId), afterRowId: String(afterRowId),
        exportedAtMs: String(core.exportedAtMs), excludedRowIds: item.excludedRowIds.join(',') });
      if (item.cutId) query.set('cutId', item.cutId);
      const page = await read(`/v1/admin/recovery/page?${query}`);
      pages.push(page);
      if (page.nextAfterRowId !== null && page.nextAfterRowId <= afterRowId) throw new Error('Recovery cursor did not advance.');
      afterRowId = page.nextAfterRowId;
    } while (afterRowId !== null);
  }
  const verified = verifyRecoveryBundle(core, pages);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const actualOutput = await realpath(output), actualRepository = await realpath(repository);
  if (actualOutput === actualRepository || actualOutput.startsWith(`${actualRepository}${sep}`)) throw new Error('Private recovery output resolves inside the repository.');
  const summary = { capturedAt: new Date().toISOString(), worldRevision: verified.worldRevision, day: verified.world.day, watch: verified.world.watch,
    residents: Object.keys(verified.world.bodies).length, complete: verified.complete, pages: pages.length,
    tables: Object.fromEntries(Object.entries(verified.tables).map(([table, rows]) => [table, rows.length])), exportSha256: core.exportSha256 };
  await writeFile(resolve(output, 'recovery.json'), `${JSON.stringify({ core, pages }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await writeFile(resolve(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ output, worldRevision: summary.worldRevision, day: summary.day, watch: summary.watch, residents: summary.residents, complete: summary.complete, pages: pages.length }));
} finally { await server.close(); }
