import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadFrozenV6Core as loadCore } from './benchmark-society-frozen-v6.mjs';
import { hash, prepareCases } from './benchmark-society-oss-probe.mjs';
import { localJob, runLocal, verifyLocal } from './benchmark-society-local-probe.mjs';
import { identityJob, VARIANT } from './benchmark-society-local-identity-probe.mjs';

test('identity variant changes only USER prefix using exact allowed names; independent attempt IDs, no HTTP', async () => {
  const savedFetch = globalThis.fetch; let core, calls = 0;
  globalThis.fetch = () => { calls += 1; throw Error('HTTP forbidden'); };
  try {
    core = await loadCore();
    const reference = JSON.parse(await readFile(new URL('../docs/research/model-society-v6-2026-09-08/ledger.json', import.meta.url), 'utf8'));
    const before = hash(reference), fixtures = await prepareCases(core, reference), jobs = fixtures.map(f => identityJob(core, f));
    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i], baseline = localJob(fixtures[i]), actor = core.RESIDENTS.find(person => person.id === job.actor);
      assert.notEqual(job.id, baseline.id); assert.equal(job.beforeHash, baseline.beforeHash);
      assert.deepEqual(job.sourceJob, baseline.sourceJob); assert.equal(job.variant.name, VARIANT);
      assert.ok(job.variant.prefix.startsWith(`You are ${actor.name} (${actor.id}).`));
      assert.ok(job.variant.prefix.endsWith('\nCurrent information:\n'));
      const originalPayload = structuredClone(job.payload);
      assert.equal(originalPayload.messages[1].content, job.variant.prefix + baseline.payload.messages[1].content);
      originalPayload.messages[1].content = baseline.payload.messages[1].content;
      assert.deepEqual(originalPayload, baseline.payload);
      assert.deepEqual(job.variant.recipientIds, baseline.sourceJob.job.outputContract.jsonSchema.properties.message.properties.to.enum);
      for (const id of job.variant.recipientIds)
        assert.ok(job.variant.prefix.includes(`${id}=${core.RESIDENTS.find(person => person.id === id).name}`));
      assert.ok(!job.variant.prefix.includes(`${actor.id}=${actor.name}`));
    }
    const noRecipient = structuredClone(fixtures[0]);
    noRecipient.sourceJob.job.outputContract.jsonSchema.properties.message.properties.to.enum = [];
    noRecipient.sourceJob.payload.response_format.json_schema.schema = structuredClone(noRecipient.sourceJob.job.outputContract.jsonSchema);
    assert.throws(() => identityJob(core, noRecipient), /recipient_enum_missing/);
    const config = { variant: VARIANT, source: core.sourceFiles }, ledger = { config, binding: hash(config), attempts: [] };
    const persist = async () => {};
    await runLocal(core, fixtures, jobs, ledger, { persist, maxNewCalls: 2, dispatch: async job => ({ status: 200,
      text: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
        project: { mode: 'replace', goal: 'Discuss an attainable next step.', why: 'I need to agree before taking action.', visibility: 'private', steps: [] },
        message: { to: job.actor === 'B' ? 'K' : 'N', text: 'Could we discuss a practical next step?', close: false },
      }) } }], usage: { prompt_tokens: 1900, completion_tokens: 170, total_tokens: 2070 } }) }) });
    assert.ok(ledger.attempts.every(row => row.validation.code === 'applied' && row.validation.balanceChanges.length === 0));
    verifyLocal(core, ledger, config, jobs);
    assert.equal(hash(reference), before); assert.equal(calls, 0);
  } finally { await core?.close(); globalThis.fetch = savedFetch; }
});
