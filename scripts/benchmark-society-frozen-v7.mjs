/* Offline V7 source/context reconstruction shared by isolated comparison probes.
 * No HTTP or inference. Replay uses the archived harness, not current core code.
 * Installed Vite/Zod must match the archived lockfile; a fresh temporary overlay
 * is removed by close(). Reference ledgers and their raw responses stay intact.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REFERENCE_DIR = join(ROOT, 'docs/research/model-society-v7-local-2026-09-08');
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value
  : JSON.stringify(value, (_key, item) => item instanceof Map ? { $map: [...item] } : item)).digest('hex');
const sceneHash = scene => hash({ state: scene.state, world: scene.world });
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

export async function loadFrozenV7Core() {
  const [bundleBytes, referenceBytes] = await Promise.all(['source-bundle.json', 'ledger.json'].map(name => readFile(join(REFERENCE_DIR, name))));
  const bundle = JSON.parse(bundleBytes), reference = JSON.parse(referenceBytes);
  const files = verifyFrozenBundle(bundle, reference), dependencies = await checkDependencies(files);
  const frozenProvenance = { sourceBundleSha256: hash(bundleBytes), referenceLedgerSha256: hash(referenceBytes),
    sourceFileCount: files.length, dependencies };
  const directory = await mkdtemp(join(tmpdir(), 'villa-frozen-v7-'));
  let core;
  try {
    for (const file of files) {
      const path = join(directory, file.path);
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, file.text);
    }
    await symlink(join(ROOT, 'node_modules'), join(directory, 'node_modules'), 'dir');
    const archived = await import(pathToFileURL(join(directory, 'scripts/benchmark-society-runtime-v7-local.mjs')).href);
    core = await archived.loadCore();
    if (hash(core.sourceFiles) !== hash(reference.config.source)) fail('frozen_loaded_source_mismatch');
    const close = core.close;
    const verifyFrozenSources = async () => {
      if (hash(await readFile(join(REFERENCE_DIR, 'source-bundle.json'))) !== frozenProvenance.sourceBundleSha256
        || hash(await readFile(join(REFERENCE_DIR, 'ledger.json'))) !== frozenProvenance.referenceLedgerSha256
        || hash(await archived.sourceManifest()) !== hash(core.sourceFiles)) fail('frozen_source_changed');
      await checkDependencies(files);
    };
    return { ...core, frozenProvenance, verifyFrozenSources, frozenHarness: archived, frozenReference: reference,
      close: async () => { try { await close(); } finally { await rm(directory, { recursive: true, force: true }); } } };
  } catch (error) {
    try { await core?.close(); } finally { await rm(directory, { recursive: true, force: true }); }
    throw error;
  }
}

/** Exact before-response states: B's first reply (sequence25) and L's first
 * turn (index11). Every earlier response is replayed from durable V7 evidence. */
export async function prepareCases(core, reference = core.frozenReference) {
  const archived = core.frozenHarness;
  if (!archived || hash(reference.config?.policy) !== hash(archived.POLICY)
    || hash(reference.config?.model) !== hash(archived.MODEL) || hash(reference.config?.source) !== hash(core.sourceFiles)) fail('v7_source_changed');
  await core.verifyFrozenSources();
  archived.verifyLedger(reference, reference.config, core);
  const untouched = hash(reference), cases = [];
  for (const [actor, stage, index] of [['B', 'reply', 0], ['L', 'initial', 11]]) {
    const position = reference.entries.findIndex(row => row.kind === 'cognition' && row.job.actor === actor
      && row.job.stage === stage && row.job.index === index);
    const target = reference.entries[position];
    if (position < 0 || target.state !== 'completed' || !target.application) fail('missing_completed_v7_case');
    const prefix = structuredClone({ ...reference, entries: reference.entries.slice(0, position) }), before = hash(prefix);
    const scene = await archived.runFixture(core, prefix, { maxNewCalls: 0,
      dispatch: () => fail('prefix_cannot_dispatch'), persist: () => fail('prefix_cannot_write') });
    if (scene.newCalls || scene.consumedEntries !== position || scene.halted !== 'call_limit_reached'
      || hash(prefix) !== before) fail('prefix_replay_incomplete');
    if (hash(archived.buildJob(core, scene, actor, stage, index)) !== hash(target.job)) fail('exact_v7_job_changed');
    cases.push({ actor, scene, beforeHash: sceneHash(scene), job: structuredClone(target.job), sourceJob: structuredClone(target.job),
      baselineOutput: structuredClone(target.receipt.output), baselineApplication: structuredClone(target.application) });
  }
  if (hash(reference) !== untouched) fail('reference_mutated');
  return cases;
}

/** Validate the saved dynamic grammar first, then apply only to a private clone.
 * Reports effects rather than inferring successful work from dialogue. */
export function validateCandidate(core, fixture, output) {
  const job = fixture.sourceJob;
  if (sceneHash(fixture.scene) !== fixture.beforeHash) fail('source_scene_changed');
  if (!z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(output).success)
    return { ok: false, code: 'source_schema_violation' };
  const scene = structuredClone(fixture.scene);
  scene.state = core.markSocietyAttempt(scene.state, fixture.actor, job.nowMs);
  const result = core.applyCapabilityChoice(scene.state, scene.world, job.turn, output,
    { nowMs: job.nowMs + 1, generation: core.frozenHarness.POLICY.generation });
  if (!core.parseSocietyState(result.state).ok) fail('candidate_invalid_state');
  if (result.ok) {
    const duplicate = core.applyCapabilityChoice(result.state, result.world, job.turn, output,
      { nowMs: job.nowMs + 2, generation: core.frozenHarness.POLICY.generation });
    if (duplicate.code !== 'already_applied' || sceneHash(duplicate) !== sceneHash(result)) fail('candidate_not_idempotent');
  }
  if (sceneHash(fixture.scene) !== fixture.beforeHash) fail('candidate_mutated_reference');
  return { ok: result.ok, code: result.code, afterHash: sceneHash(result), project: result.state.minds[fixture.actor].project,
    conversations: result.state.conversations.filter(conversation => conversation.participants.includes(fixture.actor)),
    balanceChanges: core.RESIDENTS.filter(({ id }) => scene.world.bodies[id].cells !== result.world.bodies[id].cells)
      .map(({ id }) => ({ actor: id, before: scene.world.bodies[id].cells, after: result.world.bodies[id].cells })),
    relationshipChanges: [...result.world.axes].filter(([pair, axes]) => hash(axes) !== hash(scene.world.axes.get(pair)))
      .map(([pair, axes]) => ({ pair, before: scene.world.axes.get(pair), after: axes })),
    clockUnchanged: result.world.day === scene.world.day && result.world.watch === scene.world.watch };
}
