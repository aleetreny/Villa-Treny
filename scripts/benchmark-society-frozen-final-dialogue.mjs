// Read-only reconstruction of the three final P4 replies. No HTTP or model use.
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { hash, verifyFrozenBundle } from './benchmark-society-frozen-v7.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FINAL_REFERENCE = join(ROOT, 'docs/research/model-society-final-dialogue-local-2026-09-08');
export const sceneHash = scene => hash({ state: scene.state, world: scene.world });
const fail = code => { throw new Error(code); };
const revive = (_key, value) => value && typeof value === 'object' && Object.keys(value).length === 1
  && Array.isArray(value.$map) ? new Map(value.$map) : value;

export async function loadFrozenFinalDialogue() {
  const names = ['ledger.json', 'source-bundle.json', 'probe-source-bundle.json', 'source-scene.json'];
  const bytes = await Promise.all(names.map(name => readFile(join(FINAL_REFERENCE, name))));
  const [reference, sourceBundle, probeBundle, capture] = bytes.map(value => JSON.parse(value, revive));
  const sourceFiles = verifyFrozenBundle(sourceBundle, reference);
  if (reference.binding !== hash(reference.config) || hash(bytes[3]) !== reference.config.captureSha256
    || sceneHash(capture.scene) !== reference.config.beforeHash || capture.beforeHash !== reference.config.beforeHash)
    fail('final_capture_binding');
  const probeFiles = verifyFrozenBundle({ format: 1, files: probeBundle.files }, { config: { source: reference.config.scripts } });
  const all = new Map(sourceFiles.map(file => [file.path, file]));
  for (const file of probeFiles) {
    if (all.has(file.path) && all.get(file.path).sha256 !== file.sha256) fail('final_overlapping_source');
    all.set(file.path, file);
  }
  const checkDependencies = async () => {
    const lock = all.get('pnpm-lock.yaml')?.text;
    if (!lock) fail('final_lock_missing');
    const versions = {};
    for (const name of ['vite', 'zod']) {
      const match = lock.match(new RegExp(`^      ${name}:\\n        specifier: [^\\n]+\\n        version: ([^\\n(]+)`, 'm'));
      const installed = JSON.parse(await readFile(join(ROOT, 'node_modules', name, 'package.json')));
      if (!match || installed.version !== match[1]) fail('final_dependency_version');
      versions[name] = installed.version;
    }
    return versions;
  };
  const provenance = { files: Object.fromEntries(names.map((name, i) => [name, hash(bytes[i])])),
    dependencies: await checkDependencies(), sourceFileCount: sourceFiles.length, probeFileCount: probeFiles.length };
  const directory = await mkdtemp(join(tmpdir(), 'villa-frozen-final-dialogue-'));
  let core;
  try {
    for (const file of all.values()) {
      const path = join(directory, file.path);
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, file.text);
    }
    await symlink(join(ROOT, 'node_modules'), join(directory, 'node_modules'), 'dir');
    const loader = await import(pathToFileURL(join(directory, 'scripts/benchmark-society-runtime-v7-local.mjs')).href);
    const harness = await import(pathToFileURL(join(directory, 'scripts/benchmark-society-final-dialogue-local.mjs')).href);
    core = await loader.loadCore();
    if (hash(core.sourceFiles) !== hash(reference.config.source)) fail('final_loaded_sources');
    const verifyFrozenSources = async () => {
      for (const name of names) if (hash(await readFile(join(FINAL_REFERENCE, name))) !== provenance.files[name]) fail('final_reference_changed');
      if (hash(await loader.sourceManifest()) !== hash(core.sourceFiles)) fail('final_overlay_changed');
      for (const file of probeFiles) if (hash(await readFile(join(directory, file.path))) !== file.sha256) fail('final_probe_overlay_changed');
      await checkDependencies();
    };
    return { ...core, reference, capture, provenance, frozenHarness: harness, verifyFrozenSources,
      close: async () => { try { await core.close(); } finally { await rm(directory, { recursive: true, force: true }); } } };
  } catch (error) {
    try { await core?.close(); } finally { await rm(directory, { recursive: true, force: true }); }
    throw error;
  }
}

export async function prepareFinalDialogueCases(core) {
  await core.verifyFrozenSources();
  const untouched = hash(core.reference), scene = structuredClone(core.capture.scene), cases = [];
  const rows = core.reference.entries.filter(row => row.kind === 'cognition');
  if (rows.length !== 3 || rows.some((row, i) => row.job.actor !== ['J', 'L', 'J'][i]
    || row.job.turn.sequence !== 44 + i || row.state !== 'completed' || !row.application?.ok)) fail('final_case_selection');
  for (const [index, row] of rows.entries()) {
    const generated = core.frozenHarness.buildJob(core, scene, index);
    if (hash(generated) !== hash(row.job)) fail('final_exact_job');
    if (hash(JSON.parse(row.rawResponse)) !== hash(row.response)
      || !z.fromJSONSchema(row.job.job.outputContract.jsonSchema).safeParse(row.receipt.output).success) fail('final_raw_or_schema');
    cases.push({ key: `${row.job.actor}${44 + index}`, actor: row.job.actor, sequence: 44 + index,
      sourceJob: structuredClone(row.job), beforeHash: sceneHash(scene), scene: structuredClone(scene),
      baselineOutput: structuredClone(row.receipt.output), baselineApplication: structuredClone(row.application) });
    scene.state = core.markSocietyAttempt(scene.state, row.job.actor, row.job.nowMs);
    const previousWorld = hash(scene.world);
    const result = core.applyProposalCapabilityChoice(scene.state, scene.world, row.job.turn, row.receipt.output,
      { nowMs: row.job.nowMs + 1, generation: 0 });
    if (!result.ok || result.code !== row.application.code || sceneHash(result) !== row.application.afterHash) fail('final_exact_application');
    scene.state = result.state; scene.world = result.world;
    if (hash(scene.world) !== previousWorld) scene.worldRevision++;
  }
  const watch = core.reference.entries.find(row => row.kind === 'watch');
  if (!watch || sceneHash(scene) !== watch.beforeHash || hash(core.reference) !== untouched) fail('final_pre_watch_continuity');
  return cases;
}
