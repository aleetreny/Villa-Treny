#!/usr/bin/env node
/** Offline evidence audit. Reads two complete private recovery bundles and
 * reconstructs retained prompt hashes; it never calls a provider or runtime.
 * Public output contains hashes/IDs/booleans only. Full inputs can optionally
 * be saved outside the repository beside the private observation backup.
 */
import { readFile, writeFile, readdir, realpath, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { z } from 'zod';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const markerHash = value => value.match(/^\[villa-input-omitted:v1;sha256=([a-f0-9]{64});utf8=\d+\]$/)?.[1];
export const isWithinDirectory = (parent, child) => {
  const part = relative(parent, child);
  return part === '' || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part));
};

/** Resolve physical parents before writing. Exclusive creation below also
 * rejects existing files, hard links and final-component symlinks atomically. */
export async function auditOutputDestination(outputPath, { beforePath, afterPath, privateOutput = false }) {
  const [repository, before, after, directory] = await Promise.all([
    realpath(ROOT), realpath(beforePath), realpath(afterPath), realpath(dirname(resolve(outputPath))),
  ]);
  const destination = resolve(directory, basename(outputPath));
  if (privateOutput && isWithinDirectory(repository, destination)) {
    throw new Error('Full reconstructed inputs must remain outside the repository, including through directory symlinks.');
  }
  if (privateOutput && directory !== dirname(after)) {
    throw new Error('Full reconstructed inputs must stay beside the physical private observation backup.');
  }
  if ([before, after].includes(destination)) throw new Error('Audit output must not overwrite an input backup, including through directory aliases.');
  // Fail before expensive reconstruction if evidence already exists. The wx
  // write remains necessary in case a file appears after this read-only check.
  try {
    await lstat(destination);
    const error = new Error('Audit output already exists; preserve it and choose a new path.');
    error.code = 'EEXIST';
    throw error;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return destination;
}

export async function writeAuditOutput(outputPath, value, options) {
  const destination = await auditOutputDestination(outputPath, options);
  await writeFile(destination, JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx', mode: options.privateOutput ? 0o600 : 0o644,
  });
}

/** A reader's new default must never change the protocol of saved evidence. */
export function prepareSavedSocietyJob(prepare, input, savedVersion) {
  if (savedVersion !== 3 && savedVersion !== 4) throw new Error('This reconstruction supports only saved society protocol versions 3 and 4.');
  const rebuilt = prepare({ ...input, protocolVersion: savedVersion });
  if (rebuilt.job.outputContract.version !== savedVersion) throw new Error('The scheduler did not preserve the saved society protocol version.');
  return rebuilt;
}
async function auditSourcePaths(modulePaths) {
  const paths = [...modulePaths.map(path => path.slice(1)), 'scripts/review-first-live-turns.mjs',
    'src/lib/habitat/residents.ts', 'src/lib/habitat/rooms.ts', 'src/lib/habitat/weave.ts',
    'workers/habitat-runtime/src/contracts.ts', 'workers/habitat-runtime/src/recovery.ts'];
  for (const directory of ['src/lib/habitat/society', 'src/lib/habitat/engine']) {
    for (const file of await readdir(resolve(ROOT, directory))) if (file.endsWith('.ts') && !file.endsWith('.test.ts')) paths.push(`${directory}/${file}`);
  }
  return [...new Set(paths)].sort();
}
function changedPaths(before, after, path = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before === null || after === null || typeof before !== 'object' || typeof after !== 'object') return [path];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => changedPaths(before[key], after[key], `${path}/${key}`));
}

export async function reviewFirstLiveTurns({ beforePath, afterPath, privateOutputPath }) {
  if (privateOutputPath) await auditOutputDestination(privateOutputPath, { beforePath, afterPath, privateOutput: true });
  const beforeBytes = await readFile(beforePath), afterBytes = await readFile(afterPath);
  const beforeBundle = JSON.parse(beforeBytes), afterBundle = JSON.parse(afterBytes);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('HTTP is forbidden in this offline audit.'); };
  let server;
  try {
    server = await createServer({ root: ROOT, configFile: false, appType: 'custom', logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
    const modulePaths = ['/src/lib/habitat/society/index.ts', '/workers/habitat-runtime/src/domain.ts',
      '/workers/habitat-runtime/src/society-scheduler.ts', '/workers/habitat-runtime/src/society-protocol.ts',
      '/workers/habitat-runtime/src/checkpoint.ts'];
    const core = Object.assign({}, ...await Promise.all(modulePaths.map(path => server.ssrLoadModule(path))));
    const baseline = core.verifyRecoveryBundle(beforeBundle.core, beforeBundle.pages);
    const final = core.verifyRecoveryBundle(afterBundle.core, afterBundle.pages);
    if (!baseline.complete || !final.complete) throw new Error('The audit requires complete, verified backups.');
    const savedFinalSociety = JSON.parse(final.tables.society_state[0].state_json);
    let world = baseline.world, society = JSON.parse(baseline.tables.society_state[0].state_json);
    const publicTurns = final.tables.society_events.flatMap(event => JSON.parse(event.event_json).turns ?? []);
    const turns = [], privateInputs = [];
    const contexts = [...final.tables.cognition_contexts].sort((a, b) => a.sequence - b.sequence);
    for (const row of contexts) {
      const saved = JSON.parse(row.prepared_json);
      const stored = final.tables.cognition_jobs.find(job => job.job_id === row.job_id);
      const envelope = JSON.parse(stored.envelope_json), output = JSON.parse(stored.output_json);
      const event = final.tables.society_events.find(item => item.job_id === row.job_id);
      if (stored.status !== 'applied' || !event) throw new Error(`Unapplied or missing event at sequence ${row.sequence}.`);
      society = core.expireSocietyState(society, world, saved.preparedAtMs);
      const rebuilt = prepareSavedSocietyJob(core.prepareSocietyJob, { state: society, world, actor: row.actor, nowMs: saved.preparedAtMs,
        sequence: row.sequence, generation: row.generation, worldRevision: envelope.cause.worldRevision, habitatId: envelope.habitatId },
      envelope.outputContract.version);
      const hashes = Object.fromEntries([
        ['system', envelope.prompt.system, rebuilt.job.prompt.system], ['user', envelope.prompt.user, rebuilt.job.prompt.user],
        ['prepared', saved.prompt, rebuilt.turn.prompt],
      ].map(([kind, marker, text]) => { const expected = markerHash(marker), actual = sha256(text);
        return [kind, { expected, actual, matches: expected !== undefined && expected === actual }]; }));
      const schema = envelope.outputContract.jsonSchema;
      const originalSchemaAcceptsOutput = z.fromJSONSchema(schema).safeParse(output).success;
      if (!originalSchemaAcceptsOutput) throw new Error(`Stored original grammar rejects sequence ${row.sequence}.`);
      if (!publicTurns.some(turn => turn.speaker === row.actor && turn.text === output.message?.text)) {
        throw new Error(`Output message is not in the public event projection at sequence ${row.sequence}.`);
      }
      const schemaHashMatchesContent = envelope.outputContract.schemaHash === `sha256:${sha256(schema)}`;
      if (!schemaHashMatchesContent) throw new Error(`Stored schema hash mismatch at sequence ${row.sequence}.`);
      society = core.markSocietyAttempt(society, row.actor, stored.created_at_ms);
      const result = core.applySocietyProtocol(envelope.outputContract.version, society, world, rebuilt.turn, output,
        { nowMs: event.occurred_at_ms, generation: row.generation });
      if (!result.ok) throw new Error(`Offline replay rejected sequence ${row.sequence}: ${result.code}`);
      society = result.state; world = result.world;
      const body = world.bodies[row.actor];
      body.thoughtOn = world.day; body.lastThoughtWatch = world.day * 4 + world.watch - 1; body.lastAttemptWatch = body.lastThoughtWatch;
      turns.push({ sequence: row.sequence, actor: row.actor, jobId: row.job_id, protocolVersion: envelope.outputContract.version, hashes,
        evidenceIdsMatch: JSON.stringify(rebuilt.turn.evidenceIds) === JSON.stringify(saved.evidenceIds),
        originalSchemaSha256: sha256(schema), originalSchemaHashMatchesContent: schemaHashMatchesContent,
        originalSchemaAcceptsOutput, currentSchemaMatchesOriginal: rebuilt.job.outputContract.schemaHash === envelope.outputContract.schemaHash,
        changedCurrentSchemaPaths: changedPaths(schema, rebuilt.job.outputContract.jsonSchema),
        publicMessagePresent: true, appliedAtMs: event.occurred_at_ms, replayCode: result.code });
      privateInputs.push({ sequence: row.sequence, actor: row.actor, jobId: row.job_id,
        reconstructedPrompt: rebuilt.job.prompt, reconstructedPrepared: rebuilt.turn, originalSchema: schema, storedOutput: output });
    }
    const publicView = core.societyPublicView(society), savedView = core.societyPublicView(savedFinalSociety);
    const allPromptHashesMatch = turns.every(turn => Object.values(turn.hashes).every(value => value.matches));
    const evidenceMatches = turns.filter(turn => turn.evidenceIdsMatch).length;
    const finalPublicProjectionMatches = JSON.stringify(publicView) === JSON.stringify(savedView);
    const manifest = { version: 1, scope: 'Offline reconstruction and assistant semantic audit; no provider calls, no human evaluation.',
      beforeBackupSha256: sha256(beforeBytes), afterBackupSha256: sha256(afterBytes),
      sourceModules: await Promise.all((await auditSourcePaths(modulePaths)).map(async path => ({ path, sha256: sha256(await readFile(resolve(ROOT, path))) }))),
      promptsMatched: turns.reduce((total, turn) => total + Object.values(turn.hashes).filter(value => value.matches).length, 0),
      promptsChecked: turns.length * 3, allPromptHashesMatch, evidenceMatches, turnsChecked: turns.length,
      finalPublicProjectionSha256: sha256(publicView), savedPublicProjectionSha256: sha256(savedView), finalPublicProjectionMatches,
      physicalRunsSinceMigration: final.tables.physical_runs.length - baseline.tables.physical_runs.length,
      physicalTime: { before: { day: baseline.world.day, watch: baseline.world.watch }, after: { day: world.day, watch: world.watch } },
      offers: society.offers.length, agreements: society.agreements.length,
      publicConversationCount: publicView.conversations.length,
      bilateralConversations: publicView.conversations.filter(conversation => new Set(conversation.turns.map(turn => turn.speaker)).size === 2).length,
      successfulResidents: publicView.residents.filter(resident => resident.lastSuccessAtMs !== null).length,
      turns };
    if (!allPromptHashesMatch || evidenceMatches !== turns.length || !finalPublicProjectionMatches) throw new Error(`Reconstruction mismatch: ${JSON.stringify({ allPromptHashesMatch, evidenceMatches, finalPublicProjectionMatches, mismatches: turns.filter(turn => !Object.values(turn.hashes).every(value => value.matches)).map(turn => ({ sequence: turn.sequence, hashes: turn.hashes })) })}`);
    if (privateOutputPath) await writeAuditOutput(privateOutputPath, { manifest, privateInputs }, { beforePath, afterPath, privateOutput: true });
    return manifest;
  } finally { try { await server?.close(); } finally { globalThis.fetch = previousFetch; } }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const beforePath = option('--before'), afterPath = option('--after'), manifestPath = option('--manifest'), privateOutputPath = option('--private-output');
  if (!beforePath || !afterPath || !manifestPath) throw new Error('Usage: --before PRIVATE_RECOVERY --after PRIVATE_RECOVERY --manifest PUBLIC_JSON [--private-output PRIVATE_JSON_BESIDE_AFTER]');
  await auditOutputDestination(manifestPath, { beforePath, afterPath });
  const manifest = await reviewFirstLiveTurns({ beforePath, afterPath, privateOutputPath });
  await writeAuditOutput(manifestPath, manifest, { beforePath, afterPath });
  console.log(JSON.stringify({ promptsMatched: manifest.promptsMatched, evidenceMatches: manifest.evidenceMatches,
    finalPublicProjectionMatches: manifest.finalPublicProjectionMatches, physicalRunsSinceMigration: manifest.physicalRunsSinceMigration }));
}
