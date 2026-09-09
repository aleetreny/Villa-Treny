/* Offline source overlay for historical V6-based probes. No install, HTTP,
 * inference or production state. Only a fresh OS temporary directory is written.
 * The archive must exactly match the source list already bound into the V6
 * ledger; installed Vite/Zod versions must match its lockfile. Other historical
 * dependency changes may still require reinstalling the archived lockfile in an
 * isolated workspace, never silently reinterpreting a saved result.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs/research/model-society-v6-2026-09-08');
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(code); };

export function verifyFrozenBundle(bundle, reference) {
  if (bundle?.format !== 1 || !Array.isArray(bundle.files) || !Array.isArray(reference?.config?.source)) fail('frozen_bundle_format');
  const expected = new Map(reference.config.source.map(file => [file.path, file.sha256]));
  if (expected.size !== reference.config.source.length || bundle.files.length !== expected.size) fail('frozen_source_set');
  const seen = new Set();
  for (const file of bundle.files) {
    if (typeof file.path !== 'string' || isAbsolute(file.path) || file.path.split('/').some(part => !part || part === '.' || part === '..')
      || file.path.includes('\\') || seen.has(file.path) || typeof file.text !== 'string'
      || file.sha256 !== expected.get(file.path) || hash(file.text) !== file.sha256) fail('frozen_source_integrity');
    seen.add(file.path);
  }
  return bundle.files;
}

async function checkDependencies(files) {
  const lock = files.find(file => file.path === 'pnpm-lock.yaml')?.text;
  if (!lock) fail('frozen_lock_missing');
  const dependencies = {};
  for (const name of ['vite', 'zod']) {
    const match = lock.match(new RegExp(`^      ${name}:\\n        specifier: [^\\n]+\\n        version: ([^\\n(]+)`, 'm'));
    const installed = JSON.parse(await readFile(join(ROOT, 'node_modules', name, 'package.json'), 'utf8'));
    if (!match || installed.version !== match[1]) fail(`frozen_dependency_mismatch_${name}`);
    dependencies[name] = installed.version;
  }
  return dependencies;
}

export async function loadFrozenV6Core() {
  const [bundleBytes, referenceBytes] = await Promise.all(['source-bundle.json', 'ledger.json'].map(name => readFile(join(DIR, name))));
  const bundle = JSON.parse(bundleBytes), reference = JSON.parse(referenceBytes);
  const files = verifyFrozenBundle(bundle, reference);
  const dependencies = await checkDependencies(files);
  const frozenProvenance = { sourceBundleSha256: hash(bundleBytes), referenceLedgerSha256: hash(referenceBytes),
    sourceFileCount: files.length, dependencies };
  const directory = await mkdtemp(join(tmpdir(), 'villa-frozen-v6-'));
  let core;
  try {
    for (const file of files) {
      const path = join(directory, file.path);
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, file.text);
    }
    await symlink(join(ROOT, 'node_modules'), join(directory, 'node_modules'), 'dir');
    const archived = await import(pathToFileURL(join(directory, 'scripts/benchmark-society-runtime-v6.mjs')).href);
    core = await archived.loadCore();
    if (JSON.stringify(core.sourceFiles) !== JSON.stringify(reference.config.source)) fail('frozen_loaded_source_mismatch');
    const close = core.close;
    const verifyFrozenSources = async () => {
      if (hash(await readFile(join(DIR, 'source-bundle.json'))) !== frozenProvenance.sourceBundleSha256
        || hash(await readFile(join(DIR, 'ledger.json'))) !== frozenProvenance.referenceLedgerSha256
        || JSON.stringify(await archived.sourceManifest()) !== JSON.stringify(core.sourceFiles)) fail('frozen_source_changed');
      await checkDependencies(files);
    };
    return { ...core, frozenProvenance, verifyFrozenSources,
      close: async () => { try { await close(); } finally { await rm(directory, { recursive: true, force: true }); } } };
  } catch (error) {
    try { await core?.close(); } finally { await rm(directory, { recursive: true, force: true }); }
    throw error;
  }
}
