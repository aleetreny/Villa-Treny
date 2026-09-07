/** Produce bounded cognition contexts locally; never calls a provider. */
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const destination = resolve(process.argv[2] ?? 'test-results/prompts.json');
try {
  const { genesisState } = await server.ssrLoadModule('/src/lib/habitat/engine/state.ts');
  const { advanceScheduledWatch } = await server.ssrLoadModule('/src/lib/habitat/engine/tick.ts');
  const { prepareCognition } = await server.ssrLoadModule('/workers/habitat-runtime/src/domain.ts');
  const { FACTS } = await server.ssrLoadModule('/src/lib/habitat/engine/knowledge.ts');
  const samples = [];
  for (const seed of [1, 7, 23]) {
    const state = genesisState(seed);
    for (let watch = 0; watch < 120; watch++) {
      const { actor, job } = prepareCognition({ state, worldRevision: watch, habitatId: 'offline-audit', runId: `audit-${watch}`, createdAtMs: 1, controlRevision: 1, recentHistory: state.record });
      samples.push({ scenario: `routine-${seed}-${watch}`, actor, text: [job.prompt.system, job.prompt.user, JSON.stringify(job.outputContract.jsonSchema)].join('\n') });
      advanceScheduledWatch(state, undefined, actor);
    }
  }
  const state = genesisState(1);
  const { actor } = prepareCognition({ state, worldRevision: 0, habitatId: 'audit', runId: 'boundary', createdAtMs: 1, controlRevision: 1 });
  // Every known fact is legitimate in this deliberately late, synthetic state.
  // This tests packing capacity, not an in-world claim about learned history.
  state.bodies[actor].knownFacts = Object.keys(FACTS).map((id) => ({ id, source: actor, learnedDay: state.day }));
  state.economy.debts = Object.keys(state.bodies).filter((id) => id !== actor).map((id, index) => ({ id: `loan-${index}`, lender: actor, borrower: id, principal: 4, remaining: 4, issuedDay: state.day, dueDay: state.day + index, status: 'open' }));
  const { job } = prepareCognition({ state, worldRevision: 0, habitatId: 'audit', runId: 'boundary', createdAtMs: 1, controlRevision: 1, recentHistory: state.record });
  samples.push({ scenario: '24-loans-all-learned-facts', actor, text: [job.prompt.system, job.prompt.user, JSON.stringify(job.outputContract.jsonSchema)].join('\n') });
  await mkdir(resolve(destination, '..'), { recursive: true });
  await writeFile(destination, JSON.stringify(samples, null, 2) + '\n');
  console.log(JSON.stringify({ destination, samples: samples.length, maxBytes: Math.max(...samples.map((sample) => Buffer.byteLength(sample.text))) }));
} finally { await server.close(); }
