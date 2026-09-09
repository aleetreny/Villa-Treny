import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrozenV7Core, hash } from './benchmark-society-frozen-v7.mjs';
import { prepareOrderCases } from './benchmark-society-v7-deal-order-local.mjs';
import { loadCore } from './benchmark-society-runtime-v7-local.mjs';
import { matchedJob, runScenario } from './benchmark-society-open-message-local.mjs';

async function setup(){const frozen=await loadFrozenV7Core(),core=await loadCore();return {frozen,core,fixtures:await prepareOrderCases(frozen),close:async()=>{await core.close();await frozen.close()}}}
const project={mode:'replace',goal:'Discuss precise terms.',why:'I want a clear decision.',visibility:'private',steps:[]};
const context=job=>JSON.parse(job.job.prompt.user.slice(job.job.prompt.user.lastIndexOf('\n')+1));
const envelope=output=>({status:200,text:JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}})});

test('matched requests retain exact USER/scene/sampling while currentP4 changes only system/schema/job identity',async()=>{
 const f=await setup();try{for(const fixture of f.fixtures){const before=hash(fixture.scene),job=matchedJob(f.core,fixture),old=fixture.sourceJob;
  assert.equal(job.job.prompt.user,old.job.prompt.user);assert.equal(job.payload.messages[1].content,old.payload.messages[1].content);
  assert.equal(job.payload.seed,old.payload.seed);assert.equal(job.payload.temperature,old.payload.temperature);assert.equal(job.payload.max_tokens,1024);
  assert.equal(job.job.outputContract.version,4);assert.ok(job.payload.messages[0].content.includes('Omit close to keep the exchange open'));
  assert.equal(hash(fixture.scene),before);
 }}finally{await f.close()}
});

test('synthetic separate offer/accept drives recorded work and conserved payment; six-call cap and zero-request replay',async()=>{
 const f=await setup();try{const ledger={entries:[]};let calls=0;const saves=[];
 const result=await runScenario(f.core,f.fixtures,ledger,{maxNewCalls:6,persist:async l=>saves.push(structuredClone(l)),dispatch:async job=>{
  calls++;assert.equal(saves.at(-1).entries.at(-1).state,'reserved');const ctx=context(job),to=job.job.outputContract.jsonSchema.properties.message.properties.to.enum[0];
  if(job.stage==='matched')return envelope({project,message:{to,text:'Would these terms suit you?'},...(job.actor==='L'?{deal:{kind:'work',role:'work',cells:2,verb:'repair',room:'workshops',units:1,slackWatches:0}}:{})});
  if(job.index===0)return envelope({message:{to,text:'I accept those exact terms.'},deal:{kind:'accept',offerId:ctx.openOffers[0].id}});
  return envelope({message:{to,text:'Understood.',...(job.index===2?{close:true}:{})}});
 }});
 assert.equal(calls,6);assert.equal(result.newCalls,6);assert.equal(result.halted,null);
 assert.ok(ledger.entries.filter(x=>x.kind==='cognition').every(x=>x.application.ok));
 assert.equal(ledger.entries.filter(x=>x.kind==='watch').length,1);
 const agreement=result.scenes.L.state.agreements.find(x=>x.terms.kind==='work'&&x.terms.worker==='L');
 assert.equal(agreement.status,'fulfilled');assert.equal(agreement.terms.cells,2);
 const initialL=f.fixtures.find(x=>x.actor==='L').scene.world;
 // L spends2 on real repair and receives2 from J; J pays2 without mint.
 assert.equal(result.scenes.L.world.bodies.L.cells,initialL.bodies.L.cells);
 assert.equal(result.scenes.L.world.bodies.J.cells,initialL.bodies.J.cells-2);
 const accounts=f.core.economicAccounts(result.scenes.L.world);
 assert.equal(accounts['ledger:initialCells']+accounts['ledger:minted']-accounts['ledger:burned']-accounts['ledger:leaked'],
  Object.entries(accounts).filter(([key])=>key.startsWith('cells:')||key==='treasury').reduce((n,[,value])=>n+value,0));
 const before=hash(ledger);const replay=await runScenario(f.core,f.fixtures,ledger,{maxNewCalls:0,persist:()=>assert.fail('replay write'),dispatch:()=>assert.fail('replay HTTP')});
 assert.equal(replay.newCalls,0);assert.equal(hash(ledger),before);assert.equal(hash(replay.scenes),hash(result.scenes));
 assert.ok(saves.some(l=>l.entries.some(row=>row.state==='completed'&&row.rawResponse&&!row.application)));
 }finally{await f.close()}
});

test('closed or unknown L result never seeds replies, and no unknown ID is retried',async()=>{
 const f=await setup();try{const ledger={entries:[]};let calls=0;
 const result=await runScenario(f.core,f.fixtures,ledger,{maxNewCalls:6,dispatch:async job=>{calls++;
  if(job.actor==='L')throw Error('unknown transport');
  return envelope({project,message:{to:job.job.outputContract.jsonSchema.properties.message.properties.to.enum[0],text:'Done.',close:true}});
 }});
 assert.equal(calls,3);assert.equal(result.newCalls,3);assert.equal(ledger.entries.filter(x=>x.job?.stage==='derived_reply').length,0);
 await runScenario(f.core,f.fixtures,ledger,{maxNewCalls:0,dispatch:()=>assert.fail('unknown retry')});
 assert.equal(calls,3);
 }finally{await f.close()}
});
