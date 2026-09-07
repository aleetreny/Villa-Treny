/** Read-only empirical audit. No cloud writes, model calls or clock changes.
 * Run: pnpm exec node tools/habitat/society-audit.mjs [--offline]
 */
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const origin = 'https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev';
const readPublic = async (path) => JSON.parse((await exec('curl', ['-fsS', '--max-time', '25', origin + path])).stdout);
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const summary = { method: 'Three seeded 90-day routine trials, plus separate one-observe-per-watch cognition access controls. No model calls; live endpoints are read-only.', checkedAt: new Date().toISOString() };
try {
  const S = await server.ssrLoadModule('/src/lib/habitat/engine/state.ts');
  const T = await server.ssrLoadModule('/src/lib/habitat/engine/tick.ts');
  const V = await server.ssrLoadModule('/src/lib/habitat/engine/verbs.ts');
  const D = await server.ssrLoadModule('/workers/habitat-runtime/src/domain.ts');
  const { RESIDENTS } = await server.ssrLoadModule('/src/lib/habitat/residents.ts');
  const { ROOMS } = await server.ssrLoadModule('/src/lib/habitat/rooms.ts');
  const { AXES } = await server.ssrLoadModule('/src/lib/habitat/weave.ts');
  const sumCells = (state) => RESIDENTS.reduce((sum, r) => sum + state.bodies[r.id].cells, 0);
  const firstNames = new RegExp(RESIDENTS.map((r) => r.name.split(' ')[0]).join('|'), 'g');
  const count = (map, key, amount = 1) => { map[key] = (map[key] ?? 0) + amount; };
  const sorted = (map) => Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]));
  const round = (n) => Math.round(n * 100) / 100;
  let active;
  // Wrap the existing table in memory; call the exact existing implementation.
  // The source, live object and world rules remain untouched.
  for (const [name, verb] of Object.entries(V.VERBS)) {
    const requires = verb.requires;
    const run = verb.run;
    verb.requires = (state, intent) => {
      const refusal = requires?.(state, intent) ?? null;
      if (active && /at (?:Module\.)?attempt\b/.test(new Error().stack ?? '')) {
        count(active.attempts, name);
        if (refusal) count(active.refused, refusal);
        else if ((verb.cost ?? 0) > state.bodies[intent.actor].cells) count(active.refused, 'not enough charge');
      }
      return refusal;
    };
    verb.run = (state, intent, movement) => {
      const before = sumCells(state) + (state.economy?.treasury ?? 0);
      const result = run(state, intent, movement);
      if (active) {
        count(active.verbs, name);
        count(active.dayVerbs, name);
        count(active.actorTurns, intent.actor);
        count(active.visits[intent.actor], state.bodies[intent.actor].room);
        const delta = sumCells(state) + (state.economy?.treasury ?? 0) - before;
        active.actionMint += Math.max(0, delta);
        active.actionBurn += (verb.cost ?? 0) + Math.max(0, -delta);
        if (result) count(active.templates, result.text.replace(firstNames, 'PERSON'));
      }
      return result;
    };
  }
  const trials = [];
  for (const seed of [1, 7, 23]) {
    const state = S.genesisState(seed);
    const startAxes = new Map([...state.axes].map(([key, value]) => [key, { ...value }]));
    active = { attempts: {}, verbs: {}, refused: {}, templates: {}, dayVerbs: {}, actorTurns: {}, actionMint: 0, actionBurn: 0,
      visits: Object.fromEntries(RESIDENTS.map((r) => [r.id, {}])) };
    let dailyMint = 0, nightsHome = 0, recordCount = 0;
    const daily = [];
    const examples = [];
    for (let day = 1; day <= 90; day++) {
      active.dayVerbs = {};
      for (let watch = 1; watch <= 4; watch++) {
        const ledgerMintBefore = state.economy?.ledger.minted;
        const beforeCells = sumCells(state), beforeMint = active.actionMint, beforeBurn = active.actionBurn;
        const attemptsBefore = Object.values(active.attempts).reduce((a,b)=>a+b,0);
        const runsBefore = Object.values(active.verbs).reduce((a,b)=>a+b,0);
        const refusedBefore = Object.values(active.refused).reduce((a,b)=>a+b,0);
        T.advanceScheduledWatch(state);
        const attemptsAfter = Object.values(active.attempts).reduce((a,b)=>a+b,0);
        const runsAfter = Object.values(active.verbs).reduce((a,b)=>a+b,0);
        const refusedAfter = Object.values(active.refused).reduce((a,b)=>a+b,0);
        const blockedPassage = attemptsAfter-attemptsBefore-(runsAfter-runsBefore)-(refusedAfter-refusedBefore);
        if(blockedPassage)count(active.refused,'no clear path through the passage',blockedPassage);
        if (watch === 4) {
          const preLeak = beforeCells + active.actionMint - beforeMint - (active.actionBurn - beforeBurn);
          dailyMint += ledgerMintBefore === undefined ? sumCells(state) - preLeak * .988 : state.economy.ledger.minted - ledgerMintBefore;
          nightsHome += RESIDENTS.filter((r) => state.bodies[r.id].room === S.SLEEPS[r.id]).length;
        }
      }
      recordCount += state.record.length;
      for (const entry of state.record) {
        if (/lent .*charge|repaid .*charge|paid .*for a repair|charge cells used/.test(entry.text)) examples.push({ ...entry });
      }
      const bodies = RESIDENTS.map((r) => state.bodies[r.id]);
      daily.push({ day: state.day, verbs: { ...active.dayVerbs }, events: state.record.length, cells: round(sumCells(state)),
        critical: Object.fromEntries(S.CONDITIONS.map((key) => [key, bodies.filter((b) => b.condition[key] < 18).length])) });
      if ([7,30,90].includes(day)) {
        const values = bodies.map((b)=>b.cells), mean = sumCells(state)/25;
        const gini = values.flatMap(a=>values.map(b=>Math.abs(a-b))).reduce((a,b)=>a+b,0)/(2*25*25*mean);
        trials.push({ seed, elapsedDays: day, day: state.day, records: recordCount,
          verbs: sorted(active.verbs), refused: sorted(active.refused), totalCells: round(sumCells(state)),
          cellRange: [round(Math.min(...values)),round(Math.max(...values))], gini: round(gini),
          economy: state.economy ? { ...structuredClone(state.economy), accountingError: round(sumCells(state) + state.economy.treasury - (state.economy.ledger.initialCells + state.economy.ledger.minted - state.economy.ledger.burned - state.economy.ledger.leaked)) } : undefined,
          actionMint: round(active.actionMint), actionBurn: round(active.actionBurn), dailyDistribution: round(dailyMint),
          nightsAtHomePct: round(nightsHome/(25*day)*100),
          conditions: Object.fromEntries(S.CONDITIONS.map(key=>[key,{mean:round(bodies.reduce((n,b)=>n+b.condition[key],0)/25), min:round(Math.min(...bodies.map(b=>b.condition[key]))), below18:bodies.filter(b=>b.condition[key]<18).length}])),
          axes: Object.fromEntries(AXES.map(axis=>[axis,{mean:round([...state.axes.values()].reduce((n,v)=>n+v[axis],0)/600), at100:[...state.axes.values()].filter(v=>v[axis]===100).length, changed:[...state.axes].filter(([key,v])=>v[axis]!==startAxes.get(key)[axis]).length}])),
          unchangedPairs:[...state.axes].filter(([key,v])=>AXES.every(axis=>v[axis]===startAxes.get(key)[axis])).length,
          visits: Object.fromEntries(Object.entries(active.visits).map(([id,rooms])=>[id,Object.keys(rooms).length])),
          darkRooms: ROOMS.filter(r=>!state.rooms[r.id].lit).map(r=>r.id),
          causalExamples: [ ...examples.filter((entry) => /lent .*charge|repaid .*charge/.test(entry.text)).slice(0, 12), ...examples.filter((entry) => /paid .*for a repair|charge cells used/.test(entry.text)).slice(0, 3) ],
          topTemplates: Object.entries(sorted(active.templates)).slice(0,8),
          last7Days: daily.slice(-7),
        });
      }
    }
  }
  summary.simulation = trials;
  active = undefined;
  // Control: a valid, non-mutating 'observe' cognition succeeds each watch.
  // This tests scheduler access, not how a real model would choose its actions.
  const cognition = [];
  const promptSamples = [];
  for(const seed of [1,7,23]){
    const state=S.genesisState(seed),subjects={},last={},maxGap={},first={};
    for(let tick=0;tick<360;tick++){
      const actor=D.selectCognitionSubject(state);count(subjects,actor);
      if (process.argv.includes('--prompts')) {
        const { job } = D.prepareCognition({ state, worldRevision: tick, habitatId: 'audit', runId: 'audit', createdAtMs: 1, controlRevision: 1, recentHistory: state.record });
        promptSamples.push([job.prompt.system, job.prompt.user, JSON.stringify(job.outputContract.jsonSchema)].join('\n'));
      }
      first[actor]??=tick;
      maxGap[actor]=Math.max(maxGap[actor]??0,tick-(last[actor]??0));last[actor]=tick;
      T.advanceScheduledWatch(state,{actor,verb:'observe'});
    }
    for(const r of RESIDENTS)maxGap[r.id]=Math.max(maxGap[r.id]??0,359-(last[r.id]??0));
    cognition.push({seed,selected:subjects,neverSelected:RESIDENTS.filter(r=>!subjects[r.id]).map(r=>r.id),maxGapWatches:maxGap,firstSelectedWatch:first});
  }
  summary.cognitionScheduler=cognition;
  if (promptSamples.length) await writeFile('/tmp/habitat-audit-prompts.json', JSON.stringify(promptSamples));
  // Counterexample to the stated 'only surplus is minted' invariant.
  const skewed=S.genesisState(1);
  for(const r of RESIDENTS){skewed.bodies[r.id].cells=0;skewed.bodies[r.id].condition.rested=10;}
  skewed.bodies.A.cells=1;skewed.watch=4;
  if (skewed.economy) skewed.economy.ledger.initialCells=1;
  const beforeSkewed=sumCells(skewed);T.advanceScheduledWatch(skewed);
  summary.zeroBalanceCounterexample={beforeCells:beforeSkewed,afterCells:round(sumCells(skewed)),reactorOutput:skewed.reactor.output,
    theoreticalAbsoluteMaxCellsFromReactor:Math.floor(skewed.reactor.output*1000/8),balances:RESIDENTS.map(r=>({id:r.id,cells:round(skewed.bodies[r.id].cells)}))};
  if(!process.argv.includes('--offline')){
    const [status,observer]=await Promise.all([readPublic('/v1/status'),readPublic('/v1/observer')]);
    const days=await Promise.all(Array.from({length:observer.snapshot.day-100+1},(_,i)=>readPublic(`/v1/archive?day=${100+i}`)));
    summary.live={checkedAt:new Date().toISOString(),status,day:observer.snapshot.day,watch:observer.snapshot.watch,people:observer.snapshot.people,
      relationships:observer.relationships,
      archives:days.map(d=>({day:d.day,entries:d.entries})),
      archiveKinds:days.flatMap(d=>d.entries).reduce((map,e)=>(count(map,e.kind),map),{}),
      archiveTemplates:sorted(days.flatMap(d=>d.entries).reduce((map,e)=>(count(map,e.text.replace(firstNames,'PERSON')),map),{}))};
  }
  await writeFile('docs/habitat-society-audit-data.json',JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({trials:trials.map(({seed,elapsedDays,totalCells,cellRange,conditions,verbs,refused})=>({seed,elapsedDays,totalCells,cellRange,conditions,verbs,refused})),cognition:summary.cognitionScheduler,zeroBalance:summary.zeroBalanceCounterexample,liveDays:summary.live?.archives.map(d=>({day:d.day,events:d.entries.length}))},null,2));
} finally { await server.close(); }
