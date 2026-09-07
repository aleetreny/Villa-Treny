// Offline actual-engine verification. No provider, API or database writes.
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
const server = await createServer({ root: process.cwd(), configFile: false, cacheDir: '/tmp/villa-society-vite', server: { middlewareMode: true }, appType: 'custom' });
try {
  const S = await server.ssrLoadModule('/src/lib/habitat/engine/state.ts');
  const T = await server.ssrLoadModule('/src/lib/habitat/engine/tick.ts');
  const V = await server.ssrLoadModule('/src/lib/habitat/engine/verbs.ts');
  const E = await server.ssrLoadModule('/src/lib/habitat/engine/economy.ts');
  const D = await server.ssrLoadModule('/workers/habitat-runtime/src/domain.ts');
  const results = [], long = process.argv.includes('--long');
  let counts = {};
  for (const [verb, definition] of Object.entries(V.VERBS)) {
    const original = definition.run;
    definition.run = (...args) => { counts[verb] = (counts[verb] ?? 0) + 1; return original(...args); };
  }
  for (const seed of [1, 7, 23]) {
    const state = S.genesisState(seed), days = long && seed === 1 ? 5000 : 365;
    counts = {};
    const samples = [], visits = new Set(), thoughts = {}, minima = { fed: 100, rested: 100, well: 100, safe: 100, accompanied: 100 };
    let maxMoneyError = 0, maxReplayError = 0, seenEvent = -1, firstCritical = null, examples = [];
    const replay = E.economicAccounts(state);
    for (let watch = 0; watch < days * 4; watch++) {
      const actor = D.selectCognitionSubject(state); thoughts[actor] = (thoughts[actor] ?? 0) + 1;
      T.advanceScheduledWatch(state, undefined, actor);
      for (const event of state.economy.events.filter((event) => event.sequence > seenEvent)) {
        for (const { account, delta } of event.entries) replay[account] += delta;
        seenEvent = event.sequence;
      }
      const actual = E.economicAccounts(state);
      maxReplayError = Math.max(maxReplayError, ...Object.keys(actual).map((key) => Math.abs(actual[key] - replay[key])));
      const ledger = state.economy.ledger;
      maxMoneyError = Math.max(maxMoneyError, Math.abs(E.totalCells(state) - (ledger.initialCells + ledger.minted - ledger.burned - ledger.leaked)));
      for (const body of Object.values(state.bodies)) {
        visits.add(body.room);
        for (const key of Object.keys(minima)) minima[key] = Math.min(minima[key], body.condition[key]);
        if (!firstCritical && Math.min(body.condition.fed, body.condition.rested, body.condition.well, body.condition.safe) <= 18) firstCritical = { elapsedDay: Math.floor(watch / 4), id: body.id, conditions: { ...body.condition } };
      }
      for (const resource of E.RESOURCES) if (state.economy.stock[resource] < 0 || state.economy.stock[resource] > E.CAPACITY[resource]) throw new Error('Invalid resource capacity');
      if (state.watch === 1 && [7, 30, 90, 365, 1000, 2000, 2700, 3000, 4000, 5000].includes((watch + 1) / 4)) {
        D.deserializeWorldState(D.serializeWorldState(state));
        samples.push({ elapsedDays: (watch + 1) / 4, power: state.reactor.output, money: E.totalCells(state), treasury: state.economy.treasury, stock: { ...state.economy.stock },
          conditions: Object.fromEntries(Object.keys(minima).map((key) => [key, { min: Math.min(...Object.values(state.bodies).map((body) => body.condition[key])), max: Math.max(...Object.values(state.bodies).map((body) => body.condition[key])) }])) });
        console.log(JSON.stringify({ seed, elapsedDays: (watch + 1) / 4, maxMoneyError, maxReplayError, firstCritical }));
      }
      if (examples.length < 12) for (const event of state.record.filter((event) => /lent|repaid|emergency|by hand/.test(event.text))) {
        if (examples.length < 12 && !examples.some((old) => JSON.stringify(old) === JSON.stringify(event))) examples.push(event);
      }
    }
    if (maxMoneyError > 1e-8 || maxReplayError > 1e-8) throw new Error('Economic conservation or replay failed');
    results.push({ seed, days, minima, firstCritical, maxMoneyError, maxReplayError, visits: [...visits].sort(), counts, thoughts, samples, examples });
  }
  await writeFile('docs/society-validation-after.json', JSON.stringify(results, null, 2));
} finally { await server.close(); }
