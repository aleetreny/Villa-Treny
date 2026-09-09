import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCore} from './benchmark-society-runtime-v7-local.mjs';
import {hash} from './benchmark-society-frozen-v7.mjs';
import {loadScene,buildJob,applyAndWatch,parseArgs} from './benchmark-society-exact-accept-local.mjs';

test('exact saved pre-watch scene, clarified instructions, preserved acceptance/refusal choices',async()=>{
 const source=await loadScene(),core=await loadCore();try{const job=buildJob(core,source.scene);
  assert.equal(job.beforeHash,source.capture.beforeHash);assert.equal(job.actor,'L');assert.equal(job.payload.max_tokens,1024);
  assert.equal(job.payload.chat_template_kwargs.enable_thinking,false);assert.ok(job.job.prompt.system.includes('accept its exact offerId'));
  assert.ok(!JSON.stringify(job.job.outputContract.jsonSchema).includes('with close:false'));
  assert.equal(source.scene.state.offers.find(x=>x.status==='open').id,'offer:66');
  assert.equal(source.scene.world.day,100);assert.equal(source.scene.world.watch,1);
 }finally{await core.close()}
});

test('synthetic accept fulfils exact voluntary commitment after own real repair; words/reject/counter do not',async()=>{
 const source=await loadScene(),core=await loadCore();try{const job=buildJob(core,source.scene),before=hash(source.scene);
  for(const mode of ['accept','reject','counter','words']){
   const deal=mode==='counter'?{kind:'work',role:'work',cells:1,verb:'repair',room:'workshops',units:1,slackWatches:2}:
    mode==='words'?undefined:{kind:mode,offerId:'offer:66'};
   const output={message:{to:'J',text:'These are my chosen terms.'},...(deal?{deal}:{})};
   const row={state:'completed',receipt:{receiptCode:null,output}},scene=structuredClone(source.scene);
   const result=applyAndWatch(core,scene,job,row);assert.equal(result.application.ok,true);
   const agreements=result.watch.afterAgreements;
   assert.equal(agreements.length,mode==='accept'?1:0);
   if(mode==='accept'){assert.equal(agreements[0].offerId,'offer:66');assert.equal(agreements[0].status,'fulfilled');assert.equal(agreements[0].terms.cells,0);assert.equal(agreements[0].progress,1);}
   assert.equal(result.watch.afterAccounts['cells:L'],result.watch.beforeAccounts['cells:L']-2);
   assert.equal(result.watch.afterAccounts['cells:J'],result.watch.beforeAccounts['cells:J']);
   assert.equal(hash(source.scene),before);
   assert.equal(hash(applyAndWatch(core,structuredClone(source.scene),job,row)),hash(result));
  }
 }finally{await core.close()}
});

test('offline default, exactly one possible new request and no remote endpoint override',()=>{
 assert.equal(parseArgs([]).run,false);assert.equal(parseArgs([]).maxNewCalls,1);
 assert.throws(()=>parseArgs(['--run','--server-pid','1','--max-new-calls','2']));
 assert.throws(()=>parseArgs(['--endpoint','https://elsewhere']));
 assert.equal(parseArgs(['--run','--max-new-calls','0']).maxNewCalls,0);
});
