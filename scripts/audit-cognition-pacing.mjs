import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../', import.meta.url));
// Synthetic stress workload only. No saved world, provider calls or credentials.
let fetches=0; globalThis.fetch=()=>{fetches++;throw Error('Offline only');};
const server=await createServer({root,configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
try {
 const core=Object.assign({},...await Promise.all(['/src/lib/habitat/society/index.ts','/workers/habitat-runtime/src/domain.ts','/workers/habitat-runtime/src/society-scheduler.ts','/workers/habitat-runtime/src/quota.ts'].map(p=>server.ssrLoadModule(p))));
 const source=await readFile(root+'/workers/habitat-runtime/src/habitat-world.ts','utf8');
 const base=Date.parse('2026-09-09T00:00:00Z');
 for(const pacing of [false,true]) for(const groqActual of [null,3000]) {
  const db=new DatabaseSync(':memory:');
  for(const table of ['provider_usage_daily','quota_reservations','provider_breakers','provider_attempts']) db.exec(source.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]+?\\n      \\);`))[0]);
  db.exec('ALTER TABLE quota_reservations ADD COLUMN usage_confirmed INTEGER NOT NULL DEFAULT 0');
  const sql={exec(query,...args){const stmt=db.prepare(query);const rows=stmt.columns().length?stmt.all(...args):(stmt.run(...args),[]);return {toArray:()=>rows,one:()=>{assert.equal(rows.length,1);return rows[0];}};}};
  const quota=new core.SqlQuotaLedger(sql,{WORKERS_AI_DAILY_NEURONS_LIMIT:8000,GROQ_DAILY_TOTAL_TOKENS_LIMIT:150000});
  let world=core.createGenesisWorld(), society=core.createSocietyState(world,base), count=0, firstAll=null, exhausted=null, coverage14=null, lastSuccess=null, nextPhysical=base+21600000;
  const ids=Object.keys(society.minds), counts=Object.fromEntries(ids.map(id=>[id,0]));
  const providers={'workers-ai':0,groq:0};
  for(let slot=1;slot<480;slot++) {
   const now=base+slot*core.COGNITION_CADENCE_MS;
   if(now>=nextPhysical){const obs=[];core.advanceWorldWatch(world,undefined,undefined,undefined,{plans:core.plannedSocietyActions(society,world),onAction:o=>obs.push(o)});const r=core.observeSocietyActions(society,world,obs,{nowMs:now});society=r.state;world=r.world;nextPhysical+=21600000;}
   if(slot===280) coverage14=ids.filter(id=>society.minds[id].lastSuccessAtMs>=now-21600000).length;
   const actor=(pacing?core.nextSocietyActor:previousSelection)(society,now,count+1);
   if(!actor) continue;
   let acceptedProvider;
   for(const provider of ['workers-ai','groq']) {
    const maximum=provider==='workers-ai'?{requests:1,inputTokens:15900,outputTokens:1024,neurons:580}:{requests:1,inputTokens:3876,outputTokens:1024,neurons:0};
    const id=`synthetic:${slot}:${provider}`;
    if(pacing&&society.minds[actor].lastAttemptAtMs!==null&&quota.pacing(provider, 'synthetic-current',maximum,now).readyAtMs>now) continue;
    if(!quota.reserve(id,provider,maximum,now).allowed) continue;
    acceptedProvider=provider;quota.markDispatched(id,now);
    if(provider==='workers-ai') quota.settle(id,{inputTokens:1500,outputTokens:450,neurons:80},now);
    else if(groqActual!==null) quota.settle(id,{inputTokens:2500,outputTokens:500},now);
    break;
   }
   if(!acceptedProvider){exhausted??=now;continue;}
   count++;providers[acceptedProvider]++;lastSuccess=now;
   const active=society.conversations.find(c=>c.status==='open'&&c.participants.includes(actor));
   const other=active?active.participants.find(id=>id!==actor):ids.indexOf(actor)<24?ids[ids.indexOf(actor)^1]:undefined;
   const response={};
   if(!society.minds[actor].project) response.project={mode:'replace',goal:'Continue this synthetic scheduling exercise.',why:'A deterministic test, not a claim about production.',visibility:'private',steps:[]};
   if(other) response.message={to:other,text:'I will continue this synthetic exchange.',close:false};
   
   const turn=core.prepareSocietyTurn(society,world,actor,{nowMs:now,generation:0,sequence:count});
   if(!other&&!response.project) response.reflection={text:'I continue this synthetic scheduling exercise.',refs:turn.evidenceIds.slice(0,1)};
   const result=core.applySocietyTurn(society,world,turn,response,{nowMs:now,generation:0});
   assert.equal(result.ok,true,result.code);society=result.state;world=result.world;counts[actor]++;
   if(firstAll===null&&ids.every(id=>counts[id]))firstAll=now;
  }
  const minutes=at=>at===null?null:(at-base)/60000;
  console.log(JSON.stringify({pacing,scenario:'Synthetic workload; no model calls; actual scheduler, canonical valid turns, quota ledger and physical watches',assumedCF:{maximum:580,confirmedCost:80},assumedGroq:{maximum:4900,confirmedCost:groqActual},firstAllMinutes:minutes(firstAll),firstWaitMinutes:minutes(exhausted),lastSuccessMinutes:minutes(lastSuccess),successfulTurns:count,providers,minTurns:Math.min(...Object.values(counts)),maxTurns:Math.max(...Object.values(counts)),openConversations:society.conversations.filter(c=>c.status==='open').length,coverageAt14Hours:coverage14,usage:quota.snapshot(base+86399999).windows}));
  db.close();
 }
 assert.equal(fetches,0); console.log(JSON.stringify({networkCalls:fetches}));
}finally{await server.close();}

// Historical policy for an explicit before/after comparison. Current mode
// imports nextSocietyActor and SqlQuotaLedger.pacing directly from the runtime.
function previousSelection(state, nowMs, sequence) {
 const eligible=Object.keys(state.minds).filter(id=>{
  const m=state.minds[id];
  return m.lastAttemptAtMs===null||m.lastAttemptAtMs<=(m.lastSuccessAtMs??-1)||nowMs-m.lastAttemptAtMs>=1800000;
 });
 const waiting=state.conversations.filter(c=>c.status==='open'&&c.expiresAtMs>nowMs&&c.nextSpeaker&&eligible.includes(c.nextSpeaker))
  .sort((a,b)=>(a.turns.at(-1)?.atMs??a.createdAtMs)-(b.turns.at(-1)?.atMs??b.createdAtMs));
 const overdue=eligible.filter(id=>state.minds[id].lastSuccessAtMs===null||nowMs-state.minds[id].lastSuccessAtMs>=21600000
  ||state.minds[id].memories.some(m=>m.kind==='observation'&&m.createdAtMs>state.minds[id].lastSuccessAtMs))
  .sort((a,b)=>(state.minds[a].lastSuccessAtMs??-1)-(state.minds[b].lastSuccessAtMs??-1)
   ||(state.minds[a].lastAttemptAtMs??-1)-(state.minds[b].lastAttemptAtMs??-1)||a.localeCompare(b));
 return sequence%2===0?overdue[0]??waiting[0]?.nextSpeaker:waiting[0]?.nextSpeaker??overdue[0];
}
