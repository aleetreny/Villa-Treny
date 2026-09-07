import {createServer} from '/Users/alejandrotreny/Documents/ChatGPT/Portfolio/node_modules/vite/dist/node/index.js';
import {writeFile}from'node:fs/promises';
const server=await createServer({root:'/Users/alejandrotreny/Documents/ChatGPT/Portfolio',configFile:false,cacheDir:'/tmp/habitat-prompt-boundary-cache',server:{middlewareMode:true},appType:'custom'});
try{const D=await server.ssrLoadModule('/workers/habitat-runtime/src/domain.ts'),S=await server.ssrLoadModule('/src/lib/habitat/engine/state.ts'),V=await server.ssrLoadModule('/src/lib/habitat/engine/verbs.ts'),R=await server.ssrLoadModule('/src/lib/habitat/residents.ts');
const s=S.genesisState();for(const {id}of R.RESIDENTS){S.placeInRoom(s,id,'common');s.bodies[id].cells=id==='A'?200:2;if(id!=='A'){S.held(s,'A',id).trust=60;S.held(s,id,'A').resentment=0;}}
s.economy.ledger.initialCells=Object.values(s.bodies).reduce((n,b)=>n+b.cells,0);s.bodies.A.lastThoughtWatch=0;s.bodies.A.thoughtOn=0;const history=[];
for(const{id}of R.RESIDENTS.filter(r=>r.id!=='A')){const o=V.attempt(s,{actor:'A',verb:'lend',target:id});if(!o.ok)throw new Error(o.refused);history.push({...o.happening,day:100,watch:1,minute:8});}
D.serializeWorldState(s);const job=D.prepareCognition({state:s,worldRevision:0,habitatId:'test',runId:'test',createdAtMs:1,controlRevision:1,recentHistory:history}).job;await writeFile('/tmp/habitat-boundary-prompt.txt',[job.prompt.system,job.prompt.user,JSON.stringify(job.outputContract.jsonSchema)].join('\n'));console.log({debts:s.economy.debts.length,bytes:job.prompt.user.length});
}finally{await server.close();}
