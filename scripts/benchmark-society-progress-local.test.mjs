import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';
import {loadCore,prepareCases,runEvaluation,receiveProgress,verifyLedger,parseArgs,publicPlan,publicReport,POLICY,sourceManifest} from './benchmark-society-progress-local.mjs';
import {privateDirectory} from './benchmark-society-records-canonical-local.mjs';
import {hash,MODEL,captureSourceBundle,verifySourceBundle} from './benchmark-society-runtime-v7-local.mjs';
const AT=Date.parse('2026-09-08T20:21:56Z'),PRIVATE='PRIVATE_DRAFT_AND_WHY_NOT_FOR_PUBLIC_REPORT';

// Isolated transport fixtures only. Real preparation cannot create dialogue and
// accepts only a verified revision199 recovery containing all four open pairs.
function fixture(core){
  let world=core.genesisState(91),state=core.createSocietyState(world,AT-20000);
  for(const [i,pair] of POLICY.pairs.entries()){
    const [a,b]=pair,turn=core.prepareSocietyTurn(state,world,a,{nowMs:AT-10000+i*1000,generation:3,sequence:i});
    const r=core.applySocietyTurn(state,world,turn,{project:{mode:'replace',goal:PRIVATE,why:PRIVATE,visibility:'private',steps:[]},
      message:{to:b,text:'Would you review an attributed written proposal?',close:false}},
    {nowMs:AT-9999+i*1000,generation:3});
    assert.equal(r.ok,true,r.code);state=r.state;world=r.world;
  }
  const stateJson=core.serializeWorldState(world),tables=Object.fromEntries(core.RECOVERY_TABLES.map(n=>[n,[]]));
  tables._sql_schema_migrations=[{version:10}];
  tables.quota_model_migration=[{singleton:1,legacy_reservation_rowid:0,migrated_at_ms:AT}];
  tables.runtime_meta=[{singleton:1,world_revision:199,sim_day:world.day,sim_minute:(world.watch-1)*360,control_revision:3,next_watch_at_ms:AT+21600000}];
  tables.world_state=[{singleton:1,codec_version:core.WORLD_CODEC_VERSION,world_revision:199,state_json:stateJson}];
  tables.society_state=[{singleton:1,codec_version:state.version,revision:state.revision,state_json:JSON.stringify(state)}];
  tables.cognition_contexts=[{job_id:'only_fixture',sequence:80}];
  const payload={format:'villa-recovery-v1',habitatId:'isolated-progress-fixture',exportedAtMs:AT,
    checkpoint:core.makeCheckpoint(199,stateJson),complete:true,tables,manifest:[]};
  return{core:core.sealRecoveryExport(payload),pages:[]};
}
function output(job){
  const value={message:{to:[...job.pair].find(id=>id!==job.actor),text:'I will keep this as a private proposal for now.',close:true},
    record:{kind:'draft',title:'A proposal',text:PRIVATE,refs:[],parent:null,audience:'private',publish:false}};
  if(job.job.outputContract.jsonSchema.required?.includes('project'))value.project={mode:'replace',goal:PRIVATE,why:PRIVATE,visibility:'private',steps:[]};
  assert.equal(z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(value).success,true);
  return value;
}
const response=(job,value=output(job),warning)=>({status:200,headers:warning?{warning}:{},text:JSON.stringify({model:MODEL.id,
  choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:2000,completion_tokens:200,total_tokens:2200,notPublic:PRIVATE}})});
const newLedger=()=>{const config={policy:POLICY,fixture:'no-model-no-network'};return{config,binding:hash(config),entries:[]};};
async function offline(fn){const old=globalThis.fetch;let core,calls=0;globalThis.fetch=()=>{calls++;assert.fail('Network forbidden');};
  try{core=await loadCore();await fn(core);assert.equal(calls,0);}finally{await core?.close();globalThis.fetch=old;}}

test('eight counterbalanced responses use exact same input except SYSTEM; independent clones and zero-write replay',()=>offline(async core=>{
  const bundle=fixture(core),sourceHash=hash(bundle),selection=prepareCases(core,bundle),selectionHash=hash(selection);
  assert.deepEqual(selection.cases.map(c=>c.actor),['K','N','O','Q']);
  assert.deepEqual(selection.cases.flatMap(c=>c.jobs.map(j=>j.variant)),['A','B','B','A','A','B','B','A']);
  for(const c of selection.cases){const [a,b]=c.jobs;
    assert.notEqual(a.id,b.id);assert.equal(a.job.jobId,b.job.jobId);assert.equal(a.payload.seed,b.payload.seed);
    assert.equal(a.job.prompt.user,b.job.prompt.user);assert.equal(hash(a.job.outputContract),hash(b.job.outputContract));
    assert.equal(hash(a.turn),hash(b.turn));assert.notEqual(a.job.prompt.system,b.job.prompt.system);
    const strip=j=>({...j.payload,messages:j.payload.messages.filter(m=>m.role!=='system')});assert.equal(hash(strip(a)),hash(strip(b)));
    assert.equal(a.payload.max_tokens,1024);assert.equal(a.payload.model,MODEL.id);assert.deepEqual(a.payload.chat_template_kwargs,{enable_thinking:false});
  }
  const ledger=newLedger();let persisted,calls=0,writes=0,rawChecks=0;
  const result=await runEvaluation(core,selection,ledger,{maxNewCalls:8,persist:async l=>{persisted=structuredClone(l);writes++;},
    dispatch:async job=>{calls++;assert.equal(persisted.entries.at(-1).state,'reserved');assert.equal(hash(persisted.entries.at(-1).job),hash(job));return response(job);},
    afterReceipt:row=>{rawChecks++;assert.equal(persisted.entries.at(-1).rawResponse,row.rawResponse);assert.equal(row.application,undefined);}});
  assert.equal(calls,8);assert.equal(rawChecks,8);assert.equal(result.newCalls,8);assert.equal(ledger.entries.length,8);
  assert.ok(ledger.entries.every(r=>r.application.ok),ledger.entries.map(r=>r.application.code).join(','));
  assert.ok(result.results.every(r=>r.application.physicalWatches===0&&r.application.operations.drafts===1));
  assert.equal(hash(bundle),sourceHash);assert.equal(hash(selection),selectionHash);
  const plan=publicPlan({backupSha256:'fixture',source:[]},selection),report=publicReport(ledger,result);
  assert.equal(JSON.stringify({plan,report}).includes(PRIVATE),false);
  verifyLedger(core,ledger,ledger.config,selection);
  const before=hash(ledger),count=writes;
  const replay=await runEvaluation(core,selection,ledger,{maxNewCalls:0,persist:()=>assert.fail('No replay writes'),dispatch:()=>assert.fail('No replay HTTP')});
  assert.equal(replay.newCalls,0);assert.equal(hash(ledger),before);assert.equal(writes,count);assert.deepEqual(replay.results,result.results);
  await assert.rejects(runEvaluation(core,selection,ledger,{maxNewCalls:9}),/call_cap/);
}));

test('unknowns and rejections spend their fixed IDs, never retry or contaminate the paired case',()=>offline(async core=>{
  const selection=prepareCases(core,fixture(core)),ledger=newLedger();
  await assert.rejects(runEvaluation(core,selection,ledger,{maxNewCalls:1,persist:()=>{throw Error('crash_after_reservation');},dispatch:()=>assert.fail('Must persist first')}),/crash_after_reservation/);
  const first=ledger.entries[0].id,unknownHash=hash(ledger);
  await runEvaluation(core,selection,ledger,{maxNewCalls:0,persist:()=>assert.fail('Unknown replay cannot write'),dispatch:()=>assert.fail('Unknown replay cannot retry')});
  assert.equal(hash(ledger),unknownHash);
  let calls=0;const result=await runEvaluation(core,selection,ledger,{maxNewCalls:8,dispatch:async job=>{
    assert.notEqual(job.id,first);calls++;
    if(calls===1){const e=Error('transport_timeout');e.name='TimeoutError';throw e;}
    if(calls===2)return{status:503,text:'not ready'};
    if(calls===3)return response(job,undefined,'299 schema fallback');
    if(calls===4)return response(job,{record:{kind:'mint',cells:99999}});
    return response(job);
  }});
  assert.equal(calls,7);assert.equal(ledger.entries.length,8);assert.equal(result.newCalls,7);
  assert.deepEqual(ledger.entries.slice(0,5).map(r=>r.application.code),['reserved','timeout','failed','schema_fallback_warning','supplied_schema_violation']);
  assert.ok(ledger.entries.slice(5).every(r=>r.application.ok));verifyLedger(core,ledger,ledger.config,selection);
  const duplicate=structuredClone(ledger);duplicate.entries.push(duplicate.entries[0]);assert.throws(()=>verifyLedger(core,duplicate,duplicate.config,selection),/ledger_binding_or_cap/);
  const changed=structuredClone(ledger);changed.entries.at(-1).rawResponse='{}';assert.throws(()=>verifyLedger(core,changed,changed.config,selection),/receipt_changed/);
  const outputCrash=newLedger();await assert.rejects(runEvaluation(core,selection,outputCrash,{maxNewCalls:1,dispatch:async job=>response(job),afterReceipt:()=>{throw Error('raw_persisted_before_apply');}}),/raw_persisted_before_apply/);
  const rawHash=hash(outputCrash);await runEvaluation(core,selection,outputCrash,{maxNewCalls:0,persist:()=>assert.fail('No recovery write in readonly mode'),dispatch:()=>assert.fail('No repeat raw result')});
  assert.equal(hash(outputCrash),rawHash);assert.equal(outputCrash.entries[0].application,undefined);
  const wrongModel=newLedger();await runEvaluation(core,selection,wrongModel,{maxNewCalls:1,dispatch:async job=>{
    const r=response(job),body=JSON.parse(r.text);body.model='wrong-model';r.text=JSON.stringify(body);return r;}});
  assert.equal(wrongModel.entries[0].application.code,'unexpected_response_model');
}));

test('strict recovery, source hashes, actual next speakers and public projection are authoritative',()=>offline(async core=>{
  const bundle=fixture(core),corrupt=structuredClone(bundle);corrupt.core.exportedAtMs++;assert.throws(()=>prepareCases(core,corrupt),/checksum/);
  const selection=prepareCases(core,bundle),serialized=JSON.stringify({...selection,cases:selection.cases.map(c=>({...c,source:{state:c.source.state,
    worldJson:core.serializeWorldState(c.source.world),worldRevision:c.source.worldRevision}}))});
  const raw=JSON.parse(serialized),restored={...raw,cases:raw.cases.map(c=>({...c,source:{state:c.source.state,world:core.deserializeWorldState(c.source.worldJson),worldRevision:c.source.worldRevision}}))};
  assert.equal(hash(restored),hash(selection));
  const wrongRevision={...core,verifyRecoveryBundle:(...args)=>({...core.verifyRecoveryBundle(...args),worldRevision:198})};
  assert.throws(()=>prepareCases(wrongRevision,bundle),/expected_revision_199/);
  const closed={...core,parseSocietyState:value=>{const r=core.parseSocietyState(value);r.state.conversations[0].status='closed';return r;}};
  assert.throws(()=>prepareCases(closed,bundle),/selected_conversation_not_open/);
  const restricted={...core,societyPublicView:s=>({...core.societyPublicView(s),conversations:[]})},ledger=newLedger();
  const report=await runEvaluation(restricted,selection,ledger,{maxNewCalls:1,dispatch:async job=>response(job)});
  assert.deepEqual(report.results[0].application.messages,[]);assert.equal(JSON.stringify(publicReport(ledger,report)).includes(PRIVATE),false);
  const manifest=await sourceManifest(),source=await captureSourceBundle(manifest);verifySourceBundle(source,manifest);
  for(const path of ['scripts/benchmark-society-progress-local.mjs','scripts/benchmark-society-progress-local.test.mjs',
    'src/lib/habitat/society/record-instructions.ts','src/lib/habitat/society/closing-turn.ts','workers/habitat-runtime/src/checkpoint.ts','workers/habitat-runtime/src/society-scheduler.ts'])assert.ok(manifest.some(f=>f.path===path),path);
  source.files[0].text+='\n';assert.throws(()=>verifySourceBundle(source,manifest));
}));

test('offline default, eight-call ceiling and private directory guards need no credentials or model server',async()=>{
  assert.equal(parseArgs([]).mode,'plan');assert.equal(parseArgs(['--run','--private-out','/tmp/progress-example','--max-new-calls','0']).pid,null);
  assert.equal(parseArgs(['--run','--private-out','/tmp/progress-example','--server-pid','123']).maxNewCalls,1);
  assert.throws(()=>parseArgs(['--run','--private-out','/tmp/progress-example','--server-pid','123','--max-new-calls','9']));
  assert.throws(()=>parseArgs(['--prepare','--private-out','/tmp/progress-example']));
  const dir=await mkdtemp(join(tmpdir(),'progress-offline-'));
  try{assert.equal(await privateDirectory(dir),await realpath(dir));const link=join(dir,'linked');await symlink(process.cwd(),link);
    await assert.rejects(privateDirectory(link),/unsafe_private_directory/);await assert.rejects(privateDirectory(process.cwd()),/private_output_inside_repository/);
  }finally{await rm(dir,{recursive:true,force:true});}
});


test('new receiver measures the whole request at 31,999/32,001 bytes without changing the historic receiver',async()=>{
  const source=await import('./benchmark-society-runtime-v7-local.mjs');assert.equal(source.POLICY.maxPromptBytes,24576);
  const jobAt=(size,id)=>{const payload={text:''};payload.text='x'.repeat(size-Buffer.byteLength(JSON.stringify(payload)));
    return{id,payload,promptBytes:Buffer.byteLength(JSON.stringify(payload))};};
  let writes=0,dispatches=0,guarded=0;
  const ledger=newLedger(),parse=()=>({ok:true,value:{}});
  const small=jobAt(31999,'small'),large=jobAt(32001,'large');
  await receiveProgress(small,ledger,async()=>{writes++;},async()=>{dispatches++;assert.equal(writes,1);assert.equal(ledger.entries[0].state,'reserved');return{status:503,text:'fixture'};},parse,{beforeReserve:()=>{guarded++;}});
  await receiveProgress(large,ledger,async()=>{writes++;},()=>assert.fail('Over-bound request must not dispatch'),parse,{beforeReserve:()=>assert.fail('No reserve for oversize')});
  assert.equal(dispatches,1);assert.equal(guarded,1);assert.equal(writes,3);assert.equal(ledger.entries[1].errorCode,'context_overflow');assert.equal(ledger.entries[1].reservedCalls,0);
  await assert.rejects(receiveProgress(small,ledger,async()=>{},()=>assert.fail('Duplicate must not dispatch'),parse),/already_spent/);
  await assert.rejects(receiveProgress({...small,id:'wrong-size',promptBytes:1},ledger,async()=>{},()=>assert.fail('False count must not dispatch'),parse),/byte_count_changed/);
  const full={entries:Array.from({length:8},(_,i)=>({id:String(i)}))};
  await assert.rejects(receiveProgress(small,full,async()=>{},()=>assert.fail('Ninth request cannot reserve'),parse),/total_call_cap/);
});
