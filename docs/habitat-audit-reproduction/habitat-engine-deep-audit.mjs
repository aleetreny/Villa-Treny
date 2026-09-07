import { createServer } from '/Users/alejandrotreny/Documents/ChatGPT/Portfolio/node_modules/vite/dist/node/index.js';
import { writeFile } from 'node:fs/promises';
const server = await createServer({root:'/Users/alejandrotreny/Documents/ChatGPT/Portfolio',configFile:false, cacheDir:'/tmp/habitat-vite-audit-cache', server:{middlewareMode:true},appType:'custom'});
try {
 const S=await server.ssrLoadModule('/src/lib/habitat/engine/state.ts');
 const V=await server.ssrLoadModule('/src/lib/habitat/engine/verbs.ts');
 const T=await server.ssrLoadModule('/src/lib/habitat/engine/tick.ts');
 const E=await server.ssrLoadModule('/src/lib/habitat/engine/economy.ts');
 const D=await server.ssrLoadModule('/workers/habitat-runtime/src/domain.ts');
 const R=await server.ssrLoadModule('/src/lib/habitat/residents.ts');
 const Rooms=await server.ssrLoadModule('/src/lib/habitat/rooms.ts');
 const count=(map,k)=>map[k]=(map[k]??0)+1;
 const results={};
 // True boundary case: one remaining water cannot start the food production chain.
 {
  const s=S.genesisState();s.economy.stock={produce:0,meals:0,water:1,materials:16};
  for(const b of Object.values(s.bodies))b.condition.fed=20;
  const choices=R.RESIDENTS.slice(0,3).map(r=>T.choose(s,r.id,()=>.5));
  let failure;for(let w=0;w<28;w++){try{T.advanceScheduledWatch(s);}catch(e){failure={watch:w,message:e.message,rooms:Object.fromEntries(Rooms.ROOMS.map(r=>[r.id,Object.values(s.bodies).filter(b=>b.room===r.id).length]).filter(([,n])=>n))};break;}}
  results.oneWater={choices,failure,stock:s.economy.stock,conditions:Object.fromEntries(S.CONDITIONS.map(k=>[k,{min:Math.min(...Object.values(s.bodies).map(b=>b.condition[k])),max:Math.max(...Object.values(s.bodies).map(b=>b.condition[k]))}])),lastMemories:s.bodies.A.memory};
 }
 // Cognition movement is overwritten by the following routine inside the same turn.
 {
  const s=S.genesisState();const intent={actor:'A',verb:'go',room:'archive'};
  const valid=V.VERBS.go.requires(s,intent);T.advanceScheduledWatch(s,intent);
  results.overwrittenCognition={intent,valid,finalRoom:s.bodies.A.room,doing:s.bodies.A.doing,lastThoughtWatch:s.bodies.A.lastThoughtWatch,memory:s.bodies.A.memory};
 }
 // Unused protocol fields can write memories into remote, uninvolved residents.
 {
  const s=S.genesisState();const targetRoom=s.bodies.B.room;
  const decoded=V.decodeIntentFor('V',{verb:'grow',target:'B'});const outcome=V.attempt(s,decoded.intent);
  results.remoteMemory={targetRoom,actorRoom:s.bodies.V.room,decoded,outcome,targetMemory:s.bodies.B.memory};
 }
 // Codec accepts physically and semantically inconsistent current worlds.
 results.codec=[];
 for(const [name,mutate] of [
  ['offGrid',s=>s.bodies.A.at={x:99999,y:99999}],
  ['duplicateBodyId',s=>s.bodies.A.id='B'],
  ['duplicatePosition',s=>{s.bodies.B.room=s.bodies.A.room;s.bodies.B.at={...s.bodies.A.at};}],
  ['futureThought',s=>s.bodies.A.lastThoughtWatch=999999],
  ['negativeCalendarRelation',s=>s.economy.startedOnDay=s.day+500],
 ]) {const s=JSON.parse(D.serializeWorldState(S.genesisState()));mutate(s);try{D.deserializeWorldState(JSON.stringify(s));results.codec.push({name,accepted:true});}catch(e){results.codec.push({name,accepted:false,message:e.message.slice(0,80)});}}
 // A consistently invalid provider intention for the selected person monopolises opportunity.
 {
  const s=S.genesisState();const counts={};for(let w=0;w<360;w++){const actor=D.selectCognitionSubject(s);count(counts,actor);T.advanceScheduledWatch(s);}
  results.failedThoughts={selected:counts,distinct:Object.keys(counts).length};
 }
 // Feasible social intention can be invalidated by earlier routine actors this watch.
 {
  const s=S.genesisState();let offered=0,refused=0;const examples=[];
  for(let w=0;w<365*4;w++){
   const actor=D.selectCognitionSubject(s), target=R.RESIDENTS.find(r=>r.id!==actor&&s.bodies[r.id].room===s.bodies[actor].room)?.id;
   const intent=target?{verb:'speak',actor,target}:{verb:'observe',actor};
   const before=target?{actorRoom:s.bodies[actor].room,targetRoom:s.bodies[target].room}:null;
   T.advanceScheduledWatch(s,intent);
   if(target){offered++;if(s.bodies[actor].doing==='at a loose end'){refused++;if(examples.length<4)examples.push({day:s.day,watch:s.watch,intent,before,after:{actorRoom:s.bodies[actor].room,targetRoom:s.bodies[target].room},memory:s.bodies[actor].memory.at(-1)});}}
  }
  results.socialRaces={offered,refused,examples};
 }
 // Time and production keep functioning with reactor and maintenance both zero.
 {
  const s=S.genesisState();s.reactor.output=0;s.economy.maintenance=0;for(const r of Object.values(s.rooms))r.lit=false;
  results.powerlessProduction=[];
  for(const intent of [{actor:'V',verb:'grow'},{actor:'E',verb:'cook'},{actor:'O',verb:'clean'},{actor:'F',verb:'dig'}]){
    const before={...s.economy.stock};const outcome=V.attempt(s,intent);results.powerlessProduction.push({intent,before,after:{...s.economy.stock},outcome});
  }
 }
 await writeFile('/tmp/habitat-deep-audit.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify({partial:results},null,2));
 let active;for(const [name,verb] of Object.entries(V.VERBS)){const run=verb.run;verb.run=(s,intent,m)=>{const o=run(s,intent,m);if(active){count(active.verbs,name);count(active.visits,s.bodies[intent.actor].room);if(intent.target)count(active.targetTurns,intent.target);}return o;};}
 const sample=(s,active,elapsed)=>({elapsed,day:s.day,power:s.reactor.output,stock:{...s.economy.stock},treasury:s.economy.treasury,money:E.totalCells(s),accountingError:E.totalCells(s)-(s.economy.ledger.initialCells+s.economy.ledger.minted-s.economy.ledger.burned-s.economy.ledger.leaked),dark:Rooms.ROOMS.filter(r=>!s.rooms[r.id].lit).map(r=>r.id),conditions:Object.fromEntries(S.CONDITIONS.map(k=>[k,{min:Math.min(...Object.values(s.bodies).map(b=>b.condition[k])),max:Math.max(...Object.values(s.bodies).map(b=>b.condition[k])),critical:Object.values(s.bodies).filter(b=>b.condition[k]<18).length}])),axes:Object.fromEntries(['trust','affection','admiration','debt','resentment','desire'].map(k=>[k,{at100:[...s.axes.values()].filter(v=>v[k]===100).length,at0:[...s.axes.values()].filter(v=>v[k]===0).length}])),verbs:{...active.verbs},neverVisited:Rooms.ROOMS.filter(r=>!active.visits[r.id]).map(r=>r.id),openDebts:s.economy.debts.filter(d=>d.status!=='paid').length,record:s.record.length});
 results.longRun=[];const long=S.genesisState(1);active={verbs:{},visits:{},targetTurns:{}};let firstCritical;
 longDays: for(let day=1;day<=5000;day++){
  for(let w=0;w<4;w++){try{T.advanceScheduledWatch(long);}catch(e){results.longRunFailure={elapsed:day,watch:w,message:e.message};console.log(JSON.stringify(results.longRunFailure));break longDays;}if(!firstCritical&&Object.values(long.bodies).some(b=>['fed','rested','well','safe'].some(k=>b.condition[k]<18)))firstCritical={elapsed:day,watch:w,bodies:Object.values(long.bodies).filter(b=>['fed','rested','well','safe'].some(k=>b.condition[k]<18)).map(b=>({id:b.id,room:b.room,cells:b.cells,condition:{...b.condition}}))};}
  if([90,365,1000,2000,2700,2800,3000,4000,5000].includes(day)){let codec='valid';try{D.serializeWorldState(long);}catch(e){codec=e.message.slice(0,180);}const out={...sample(long,active,day),codec};results.longRun.push(out);console.log(JSON.stringify({longRun:out}));await writeFile('/tmp/habitat-deep-audit.json',JSON.stringify({...results,firstCritical},null,2));}
 }
 results.firstCritical=firstCritical;
 // More seeds, one real year; keep audit engine unmodified.
 results.yearSeeds=[];
 for(let seed=2;seed<=20;seed++){
  const s=S.genesisState(seed);active={verbs:{},visits:{},targetTurns:{}};let minPhysical=100,worst;
  let failure;yearDays: for(let day=0;day<365;day++){for(let w=0;w<4;w++){try{T.advanceScheduledWatch(s);}catch(e){failure={elapsed:day,watch:w,message:e.message};break yearDays;}const nowMin=Math.min(...Object.values(s.bodies).flatMap(b=>['fed','rested','well','safe'].map(k=>b.condition[k])));if(nowMin<minPhysical){minPhysical=nowMin;worst={day:day+1,watch:w,people:Object.values(s.bodies).filter(b=>['fed','rested','well','safe'].some(k=>b.condition[k]===nowMin)).map(b=>({id:b.id,condition:{...b.condition},cells:b.cells,memory:[...b.memory]}))};}}}
  const out={seed,minPhysical,worst,failure,...sample(s,active,365)};results.yearSeeds.push(out);console.log(JSON.stringify({yearSeed:seed,minPhysical,openDebts:out.openDebts,accountingError:out.accountingError}));
 }
 await writeFile('/tmp/habitat-deep-audit.json',JSON.stringify(results,null,2));
}finally{await server.close();}
