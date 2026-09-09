import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, link, rm, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import { auditOutputDestination, writeAuditOutput, prepareSavedSocietyJob, isWithinDirectory } from './review-first-live-turns.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('directory containment distinguishes a parent traversal from a ..named child', () => {
  assert.equal(isWithinDirectory(ROOT, join(ROOT, '..private', 'inputs.json')), true);
  assert.equal(isWithinDirectory(ROOT, join(ROOT, '..', 'private', 'inputs.json')), false);
});
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'villa-live-review-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const privateDirectory = join(directory, 'private');
  await mkdir(privateDirectory);
  const beforePath = join(privateDirectory, 'before.json'), afterPath = join(privateDirectory, 'after.json');
  await writeFile(beforePath, '{"before":"synthetic backup"}\n');
  await writeFile(afterPath, '{"after":"synthetic backup"}\n');
  return { directory, privateDirectory, beforePath, afterPath };
}

test('private output cannot escape into the repository through a directory symlink', async t => {
  const f = await fixture(t), alias = join(f.directory, 'repository-alias');
  await symlink(ROOT, alias, 'dir');
  await assert.rejects(writeAuditOutput(join(alias, 'never-write-private-inputs.json'), {}, { ...f, privateOutput: true }), /outside the repository/);
});

test('private output is beside the physical after backup, with restrictive permissions', async t => {
  const f = await fixture(t), alias = join(f.directory, 'private-alias');
  await symlink(f.privateDirectory, alias, 'dir');
  await assert.rejects(auditOutputDestination(join(f.directory, 'wrong-place.json'), { ...f, privateOutput: true }), /beside the physical/);
  const path = join(alias, 'new-inputs.json');
  assert.equal(await auditOutputDestination(path, { ...f, privateOutput: true }), join(await realpath(f.privateDirectory), 'new-inputs.json'));
  await writeAuditOutput(path, { input: 'synthetic, not a real resident' }, { ...f, privateOutput: true });
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { input: 'synthetic, not a real resident' });
  assert.equal(await readFile(f.afterPath, 'utf8'), '{"after":"synthetic backup"}\n');
});

test('manifest creation refuses backup directory aliases and existing hard links', async t => {
  const f = await fixture(t), alias = join(f.directory, 'alias');
  await symlink(f.privateDirectory, alias, 'dir');
  await assert.rejects(writeAuditOutput(join(alias, 'after.json'), {}, f), /must not overwrite an input backup/);
  const hardLink = join(f.directory, 'manifest-hard-link.json');
  await link(f.beforePath, hardLink);
  await assert.rejects(writeAuditOutput(hardLink, {}, f), { code: 'EEXIST' });
  assert.equal(await readFile(f.beforePath, 'utf8'), '{"before":"synthetic backup"}\n');
  assert.equal(await readFile(f.afterPath, 'utf8'), '{"after":"synthetic backup"}\n');
});

test('existing private evidence and final-component symlinks are never followed or overwritten', async t => {
  const f = await fixture(t), existing = join(f.privateDirectory, 'inputs.json');
  const alias = join(f.privateDirectory, 'inputs-link.json');
  await writeFile(existing, 'preserved private evidence\n');
  await symlink(existing, alias);
  for (const path of [existing, alias]) {
    await assert.rejects(writeAuditOutput(path, { changed: true }, { ...f, privateOutput: true }), { code: 'EEXIST' });
  }
  const missingTarget = join(f.directory, 'must-remain-absent.json');
  const dangling = join(f.privateDirectory, 'dangling.json');
  await symlink(missingTarget, dangling);
  await assert.rejects(writeAuditOutput(dangling, {}, { ...f, privateOutput: true }), { code: 'EEXIST' });
  await assert.rejects(stat(missingTarget), { code: 'ENOENT' });
  assert.equal(await readFile(existing, 'utf8'), 'preserved private evidence\n');
});

test('exclusive creation lets only one concurrent manifest writer win and preserves its bytes', async t => {
  const f = await fixture(t), path = join(f.directory, 'new-manifest.json');
  const values = [{ writer: 'first' }, { writer: 'second' }];
  const results = await Promise.allSettled(values.map(value => writeAuditOutput(path, value, f)));
  const winner = results.findIndex(result => result.status === 'fulfilled');
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'EEXIST');
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), values[winner]);
  await assert.rejects(writeAuditOutput(path, { writer: 'later' }, f), { code: 'EEXIST' });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), values[winner]);
});

test('reconstruction pins saved V3 while the production scheduler defaults to V8', async () => {
  const server = await createServer({ root: ROOT, configFile: false, appType: 'custom', logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const [society, domain, scheduler, instructions] = await Promise.all([
      '/src/lib/habitat/society/index.ts', '/workers/habitat-runtime/src/domain.ts',
      '/workers/habitat-runtime/src/society-scheduler.ts', '/src/lib/habitat/society/instructions.ts',
    ].map(path => server.ssrLoadModule(path)));
    const world = domain.createGenesisWorld(), state = society.createSocietyState(world, 1000);
    const input = { state, world, actor: 'A', nowMs: 2000, sequence: 1, generation: 0, worldRevision: 0, habitatId: 'offline-synthetic' };
    assert.equal(scheduler.prepareSocietyJob(input).job.outputContract.version, 8);
    const v3 = prepareSavedSocietyJob(scheduler.prepareSocietyJob, input, 3);
    const v4 = prepareSavedSocietyJob(scheduler.prepareSocietyJob, input, 4);
    assert.equal(v3.job.outputContract.version, 3);
    assert.equal(v4.job.outputContract.version, 4);
    assert.equal(v3.job.prompt.system, instructions.SOCIETY_SYSTEM);
    assert.equal(v4.job.prompt.system, instructions.SOCIETY_PROPOSAL_SYSTEM);
    assert.notEqual(v3.job.prompt.system, v4.job.prompt.system);
    assert.equal(input.protocolVersion, undefined);
  } finally { await server.close(); }
});

test('unsupported or untyped saved versions fail before any reconstruction', () => {
  let calls = 0;
  for (const version of [undefined, null, 1, 2, 5, '3', 3.5]) {
    assert.throws(() => prepareSavedSocietyJob(() => { calls++; }, {}, version), /only saved society protocol versions 3 and 4/);
  }
  assert.equal(calls, 0);
});

test('a scheduler that silently ignores the saved version is rejected', () => {
  assert.throws(() => prepareSavedSocietyJob(() => ({ job: { outputContract: { version: 4 } } }), {}, 3), /did not preserve/);
});
