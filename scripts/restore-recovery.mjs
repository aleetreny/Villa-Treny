/** Produces a private SQL restoration plan for review. Never connects to a runtime. */
import { readFile, mkdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { createServer } from 'vite';
const [input, outputArgument, targetHabitatId] = process.argv.slice(2);
if (!input || !outputArgument || !targetHabitatId) throw new Error('Provide recovery.json, an output.sql path outside the repository, and the exact target habitat ID.');
const output = resolve(outputArgument), repository = await realpath(resolve(import.meta.dirname, '..'));
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
const parent = await realpath(dirname(output));
if (parent === repository || parent.startsWith(`${repository}${sep}`)) throw new Error('Private restore SQL must remain outside the repository.');
const bundle = JSON.parse(await readFile(input, 'utf8'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const literal = (value) => {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') throw new TypeError('Unsupported SQL value');
  if (value.includes('\0')) return `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`;
  return `'${value.replaceAll("'", "''")}'`;
};
try {
  const { recoveryRestorePlan } = await server.ssrLoadModule('/workers/habitat-runtime/src/checkpoint.ts');
  const plan = recoveryRestorePlan(bundle.core, bundle.pages ?? [], targetHabitatId);
  const statements = plan.statements.map(({ sql, bindings }) => {
    let index = 0;
    return `${sql.replaceAll('?', () => literal(bindings[index++]))};`;
  });
  const content = [`-- PRIVATE: verified restore plan for ${JSON.stringify(targetHabitatId)}.`,
    `-- Requires an existing database with SQL schema ${plan.schemaVersion}; review before any execution.`,
    '-- SQLite CLI plan, generated offline. No runtime was contacted or changed.',
    '.bail on', 'BEGIN IMMEDIATE;',
    'CREATE TEMP TABLE _villa_restore_schema_guard(ok INTEGER CHECK(ok=1));',
    `INSERT INTO _villa_restore_schema_guard SELECT CASE WHEN MAX(version)=${plan.schemaVersion} THEN 1 ELSE 0 END FROM _sql_schema_migrations;`,
    ...Object.entries(plan.columns).filter(([, columns]) => columns.length).map(([table, columns]) =>
      `INSERT INTO _villa_restore_schema_guard SELECT CASE WHEN COUNT(*)=${columns.length} AND SUM(name IN (${columns.map(literal).join(',')}))=${columns.length} THEN 1 ELSE 0 END FROM pragma_table_info(${literal(table)});`),
    'DROP TABLE _villa_restore_schema_guard;', ...statements, 'COMMIT;', ''].join('\n');
  await writeFile(output, content, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ output, schemaVersion: plan.schemaVersion, statements: statements.length, executed: false }));
} finally { await server.close(); }
