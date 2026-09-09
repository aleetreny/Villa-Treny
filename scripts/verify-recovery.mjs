/** Offline verification only. Prints counts, never private minds or prompts. */
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
if (!process.argv[2]) throw new Error('Provide the recovery.json file to verify.');
const bundle = JSON.parse(await readFile(process.argv[2], 'utf8'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { verifyRecoveryBundle } = await server.ssrLoadModule('/workers/habitat-runtime/src/checkpoint.ts');
  const result = verifyRecoveryBundle(bundle.core, bundle.pages ?? []);
  console.log(JSON.stringify({ complete: result.complete, worldRevision: result.worldRevision,
    residents: Object.keys(result.world.bodies).length,
    tables: Object.fromEntries(Object.entries(result.tables).map(([name, rows]) => [name, rows.length])) }));
} finally { await server.close(); }
