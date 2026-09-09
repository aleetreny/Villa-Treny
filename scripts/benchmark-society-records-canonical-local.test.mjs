import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';
import {loadCore,selectScenes,buildJob,runEvaluation,verifyLedger,parseArgs,privateDirectory,publicReport,POLICY,sourceManifest} from './benchmark-society-records-canonical-local.mjs';
import {hash,MODEL,captureSourceBundle,verifySourceBundle} from './benchmark-society-runtime-v7-local.mjs';
import {loadCore as progressCore} from './benchmark-society-progress-local.mjs';
const AT=Date.parse('2026-09-08T17:00:00Z'),PRIVATE='PRIVATE_GOAL_AND_DRAFT_DO_NOT_EXPORT';

// These are fabricated transport fixtures exclusively for offline tests. The
// real evaluation reads a verified private backup and never plants dialogue.
function fixture(core){
  let world=core.genesisState(91),state=core.createSocietyState(world,AT-20000);
  for(let i=0;i<POLICY.pairs.length;i++){
    const [a,b]=POLICY.pairs[i],turn=core.prepareSocietyTurn(state,world,a,{nowMs:AT-10000+i*1000,generation:3,sequence:i});
    const r=core.applySocietyTurn(state,world,turn,{project:{mode:'replace',goal:PRIVATE,why:PRIVATE,visibility:'private',steps:[]},
      message:{to:b,text:'Would you review a written proposal with me?',close:false}},
    {nowMs:AT-9999+i*1000,generation:3});
    assert.equal(r.ok,true,r.code);state=r.state;world=r.world;
  }
  const revision=4,stateJson=core.serializeWorldState(world),tables=Object.fromEntries(core.RECOVERY_TABLES.map(n=>[n,[]]));
  tables._sql_schema_migrations=[{version:9}];
  tables.runtime_meta=[{singleton:1,world_revision:revision,sim_day:world.day,sim_minute:(world.watch-1)*360,control_revision:3,next_watch_at_ms:AT+21600000}];
  tables.world_state=[{singleton:1,codec_version:core.WORLD_CODEC_VERSION,world_revision:revision,state_json:stateJson}];
  tables.society_state=[{singleton:1,codec_version:state.version,revision:state.revision,state_json:JSON.stringify(state)}];
  tables.cognition_contexts=[{job_id:'only_fixture',sequence:20}];
  const payload={format:'villa-recovery-v1',habitatId:'isolated-records-fixture',exportedAtMs:AT,
    checkpoint:core.makeCheckpoint(revision,stateJson),complete:true,tables,manifest:[]};
  return {core:core.sealRecoveryExport(payload),pages:[]};
}
function fakeOutput(job){
  const to=[...job.pair].find(id=>id!==job.actor);
  const output={message:{to,text:'I can review this proposal; its text is an authored claim.',close:false}};
  if(job.job.outputContract.jsonSchema.required?.includes('project'))output.project={mode:'replace',goal:PRIVATE,why:PRIVATE,visibility:'private',steps:[]};
  if(job.index===0)output.record={kind:'draft',title:'A bounded proposal',text:PRIVATE,refs:[],parent:null,audience:'private',publish:false};
  assert.equal(z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(output).success,true);
  return output;
}
const envelope=(job,output=fakeOutput(job),warning)=>({status:200,headers:warning?{warning}:{},text:JSON.stringify({model:MODEL.id,
  choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:2000,completion_tokens:200,total_tokens:2200}})});
const newLedger=()=>{const config={test:'strictly-offline',policy:POLICY};return{config,binding:hash(config),entries:[],forecasts:{}};};

async function offline(fn,loader=loadCore){const old=globalThis.fetch;let core,calls=0;globalThis.fetch=()=>{calls++;assert.fail('HTTP forbidden in tests');};
  try{core=await loader();await fn(core);assert.equal(calls,0);}finally{await core?.close();globalThis.fetch=old;}}

test('twelve bounded real-core fixture replies retain actual next speakers, private data, one forecast per clone and zero-call replay',()=>offline(async core=>{
  const bundle=fixture(core),unchanged=hash(bundle),selection=selectScenes(core,bundle),source=hash(selection);
  assert.equal(selection.sequenceStart,21);assert.deepEqual(selection.scenes.map(s=>s.initialNextSpeaker),['N','U','K','Y']);
  const ledger=newLedger();let persisted,calls=0,receipts=0,writes=0;
  const r=await runEvaluation(core,selection,ledger,{maxNewCalls:12,persist:async l=>{persisted=structuredClone(l);writes++;},dispatch:async job=>{
    calls++;assert.equal(persisted.entries.at(-1).state,'reserved');assert.equal(hash(persisted.entries.at(-1).job),hash(job));
    assert.equal(job.job.outputContract.version,6);assert.equal(job.payload.max_tokens,1024);assert.deepEqual(job.payload.chat_template_kwargs,{enable_thinking:false});
    assert.equal(job.payload.model,MODEL.id);assert.deepEqual(job.payload.messages,[{role:'system',content:job.job.prompt.system},{role:'user',content:job.job.prompt.user}]);
    assert.equal(job.payload.response_format.json_schema.schema,job.job.outputContract.jsonSchema);
    const reply=envelope(job),body=JSON.parse(reply.text);body.usage.untrustedText=PRIVATE;reply.text=JSON.stringify(body);return reply;
  },afterReceipt:row=>{receipts++;assert.equal(persisted.entries.at(-1).rawResponse,row.rawResponse);assert.equal(row.application,undefined);}});
  assert.equal(calls,12);assert.equal(receipts,12);assert.equal(r.newCalls,12);assert.equal(r.branches.length,4);
  assert.deepEqual(ledger.entries.map(x=>x.job.actor),['N','C','N','U','A','U','K','B','K','Y','T','Y']);
  assert.ok(ledger.entries.every(x=>x.application.ok),ledger.entries.map(x=>x.application.code).join(','));
  assert.ok(r.branches.every(x=>x.forecast&&!x.productionObservation&&x.physicalActions===25&&x.money.conserved));
  assert.equal(ledger.entries.reduce((n,r)=>n+r.application.recordsCreated,0),4);
  assert.equal(JSON.stringify({branches:r.branches,applications:ledger.entries.map(r=>r.application)}).includes(PRIVATE),false);
  assert.equal(JSON.stringify(publicReport(ledger,r)).includes(PRIVATE),false);
  assert.equal(hash(bundle),unchanged);assert.equal(hash(selection),source);
  verifyLedger(core,ledger,ledger.config);
  const ledgerHash=hash(ledger),beforeWrites=writes,replay=await runEvaluation(core,selection,ledger,{maxNewCalls:0,
    persist:async()=>{writes++;},dispatch:()=>assert.fail('Completed ID must not dispatch again')});
  assert.equal(replay.newCalls,0);assert.equal(hash(ledger),ledgerHash);assert.equal(writes,beforeWrites);
  assert.deepEqual(replay.branches,r.branches);
}));

test('unknown IDs, strict schema warnings, closed conversations and raw-result recovery cannot add retries or force a speaker',()=>offline(async core=>{
  const selection=selectScenes(core,fixture(core)),unknown=newLedger();
  await assert.rejects(runEvaluation(core,selection,unknown,{maxNewCalls:1,persist:async()=>{throw Error('test_crash_after_reserve');},
    dispatch:()=>assert.fail('No dispatch before persistence')}),/test_crash_after_reserve/);
  const spent=unknown.entries[0].id;
  await runEvaluation(core,selection,unknown,{maxNewCalls:1,dispatch:async job=>{assert.notEqual(job.id,spent);return{status:503,text:'Unavailable'};}});
  assert.equal(unknown.entries[0].state,'reserved');assert.equal(unknown.entries.length,2);verifyLedger(core,unknown,unknown.config);
  const crashed=newLedger();await assert.rejects(runEvaluation(core,selection,crashed,{maxNewCalls:1,dispatch:async job=>envelope(job),
    afterReceipt:()=>{throw Error('test_crash_before_apply');}}),/test_crash_before_apply/);
  assert.equal(crashed.entries[0].state,'completed');assert.equal(crashed.entries[0].application,undefined);
  await runEvaluation(core,selection,crashed,{maxNewCalls:0,dispatch:()=>assert.fail('Persisted output must be applied without inference')});
  assert.equal(crashed.entries[0].application.ok,true);
  const warned=newLedger();await runEvaluation(core,selection,warned,{maxNewCalls:1,dispatch:async job=>envelope(job,undefined,'299 schema fallback')});
  assert.equal(warned.entries[0].application.code,'schema_fallback_warning');
  const timeout=newLedger();await runEvaluation(core,selection,timeout,{maxNewCalls:1,dispatch:async()=>{const e=Error('test timeout');e.name='TimeoutError';throw e;}});
  assert.equal(timeout.entries[0].state,'timeout');assert.equal(timeout.entries[0].application.ok,false);
  const closed=newLedger();await runEvaluation(core,selection,closed,{maxNewCalls:12,dispatch:async job=>{
    const output=fakeOutput(job);output.message.close=true;return envelope(job,output);}});
  assert.equal(closed.entries.length,4,'A closed conversation never receives the remaining two calls');
  const changed=structuredClone(crashed);changed.entries[0].rawResponse='{}';assert.throws(()=>verifyLedger(core,changed,changed.config),/receipt_changed/);
  const duplicate=structuredClone(closed);duplicate.entries.push(duplicate.entries[0]);assert.throws(()=>verifyLedger(core,duplicate,duplicate.config),/invalid_ledger_row/);
  const invalid=newLedger();await runEvaluation(core,selection,invalid,{maxNewCalls:1,dispatch:async job=>envelope(job,{record:{kind:'mint',cells:999999}})});
  assert.equal(invalid.entries[0].application.code,'supplied_schema_violation');
  await assert.rejects(runEvaluation(core,selection,newLedger(),{maxNewCalls:13}),/call_cap/);
}));

test('backup integrity and exact source/context round trips fail before any model request',()=>offline(async core=>{
  const bundle=fixture(core),bad=structuredClone(bundle);bad.core.exportedAtMs++;assert.throws(()=>selectScenes(core,bad),/checksum/);
  const selection=selectScenes(core,bundle),serialized=JSON.stringify({...selection,scenes:selection.scenes.map(s=>({...s,source:{state:s.source.state,
    worldJson:core.serializeWorldState(s.source.world),worldRevision:s.source.worldRevision}}))});
  const raw=JSON.parse(serialized),reloaded={...raw,scenes:raw.scenes.map(s=>({...s,source:{state:s.source.state,
    world:core.deserializeWorldState(s.source.worldJson),worldRevision:s.source.worldRevision}}))};
  assert.equal(hash(selection),hash(reloaded));
  const branch=selection.scenes[0],before=hash(branch.source);assert.equal(buildJob(core,selection,branch,branch.source,0).actor,'N');assert.equal(hash(branch.source),before);
  const restricted={...core,societyPublicView:state=>({...core.societyPublicView(state),conversations:[]})};
  const privateSelection=selectScenes(restricted,bundle);assert.ok(privateSelection.scenes.every(s=>s.initialMessages.length===0));
  const privateLedger=newLedger();await runEvaluation(restricted,privateSelection,privateLedger,{maxNewCalls:1,dispatch:async job=>envelope(job)});
  assert.deepEqual(privateLedger.entries[0].application.messages,[],'The harness uses the authoritative public projection for speech');
  const schema=await sourceManifest(),frozen=await captureSourceBundle(schema);verifySourceBundle(frozen,schema);
  for(const path of ['src/lib/habitat/society/records.ts','src/lib/habitat/society/record-choice.ts','src/lib/habitat/society/record-watch.ts',
    'workers/habitat-runtime/src/checkpoint.ts','workers/habitat-runtime/src/rejection-log.ts','workers/habitat-runtime/src/providers/shared.ts',
    'workers/habitat-runtime/src/contracts.ts','scripts/benchmark-society-records-canonical-local.mjs'])assert.ok(schema.some(x=>x.path===path),path);
  const changed=structuredClone(frozen);changed.files[0].text+='\n';assert.throws(()=>verifySourceBundle(changed,schema));
}));

test('offline default, twelve-call hard cap, private paths and symlink guards need no credential, model or server',async()=>{
  assert.equal(parseArgs([]).mode,'plan');assert.equal(parseArgs(['--run','--private-out','/tmp/no_run','--max-new-calls','0']).pid,null);
  assert.equal(parseArgs(['--run','--private-out','/tmp/no_run','--server-pid','123']).maxNewCalls,1);
  assert.throws(()=>parseArgs(['--run','--private-out','/tmp/no_run','--server-pid','123','--max-new-calls','13']));
  assert.throws(()=>parseArgs(['--prepare','--private-out','/tmp/no_run']));assert.throws(()=>parseArgs(['--run','--private-out','relative']));
  const dir=await mkdtemp(join(tmpdir(),'records-offline-test-'));
  try{assert.equal(await privateDirectory(dir),await realpath(dir));const link=join(dir,'linked');await symlink(process.cwd(),link);
    await assert.rejects(privateDirectory(link),/unsafe_private_directory/);await assert.rejects(privateDirectory(process.cwd()),/private_output_inside_repository/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

function commissionReply(job){
  const output=fakeOutput(job);
  if(job.pair!=='CN'){output.message.close=true;delete output.record;return envelope(job,output);}
  const context=JSON.parse(job.turn.prompt.slice(job.turn.prompt.lastIndexOf('\n{')+1));
  if(job.index===0)output.record={...output.record,audience:'C'};
  if(job.index===1){const draft=context.records.drafts.find(d=>d.author==='N');assert.ok(draft);
    output.record={kind:'commission',draftId:draft.id,contentHash:draft.contentHash,counterpart:'N',cells:2,dueInWatches:2,audience:'C',visibility:'private'};}
  if(job.index===2){const offer=context.records.offers.find(o=>o.counterpart==='N');assert.ok(offer);
    output.record={kind:'accept',offerId:offer.id};}
  assert.equal(z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(output).success,true);
  return envelope(job,output);
}

test('historical SYSTEM fixture pays a synthetic publication commission only in its clone watch',()=>offline(async current=>{
  // Preserve the original transport ceiling and fabricated text. This test pins
  // only the prior SYSTEM: current schema, permissions, consent and money rules
  // still apply. The following regression covers the new SYSTEM overflow.
  const core={...current,prepareSocietyJob:args=>{const prepared=current.prepareSocietyJob(args);
    prepared.job.prompt.system=current.SOCIETY_RECORD_SYSTEM_BEFORE_PROGRESS;return prepared;}};
  const selection=selectScenes(core,fixture(core)),before=hash(selection),ledger=newLedger();
  const result=await runEvaluation(core,selection,ledger,{maxNewCalls:12,dispatch:async job=>commissionReply(job)});
  assert.equal(ledger.entries.length,6);assert.ok(ledger.entries.every(r=>r.application.ok),ledger.entries.map(r=>r.application.code).join(','));
  assert.equal(ledger.entries.filter(r=>r.job.pair==='CN').at(-1).application.recordAgreementsCreated,1);
  const branch=result.branches.find(b=>b.pair==='CN');assert.equal(branch.publicationActions,1);assert.equal(branch.paidRecordCells,2);
  assert.equal(branch.physicalActions,25);assert.equal(branch.money.conserved,true);
  assert.deepEqual(branch.publicRecords,{publications:[],offers:[],agreements:[]});
  assert.equal(hash(selection),before);assert.equal(JSON.stringify(publicReport(ledger,result)).includes(PRIVATE),false);
  const saved=hash(ledger);await runEvaluation(core,selection,ledger,{maxNewCalls:0,dispatch:()=>assert.fail('Paid publication must replay without model')});
  assert.equal(hash(ledger),saved);
},progressCore));

test('progress candidate overflows the historical 24,576-byte fixture ceiling without dispatch, agreement or payment',()=>offline(async current=>{
  const core={...current,prepareSocietyJob:args=>{const prepared=current.prepareSocietyJob(args);
    prepared.job.prompt.system=current.SOCIETY_RECORD_PROGRESS_CANDIDATE_SYSTEM;return prepared;}};
  const selection=selectScenes(core,fixture(core)),ledger=newLedger();let calls=0;
  const result=await runEvaluation(core,selection,ledger,{maxNewCalls:12,dispatch:async job=>{
    assert.ok(!(job.pair==='CN'&&job.index===2),'Oversized acceptance input must never dispatch');calls++;return commissionReply(job);}});
  const oversized=ledger.entries.find(row=>row.job.pair==='CN'&&row.job.index===2);
  assert.equal(POLICY.maxPromptBytes,24576);assert.ok(oversized.job.promptBytes>POLICY.maxPromptBytes);
  assert.equal(oversized.state,'skipped');assert.equal(oversized.errorCode,'context_overflow');assert.equal(oversized.reservedCalls,0);
  assert.equal(calls,5);assert.equal(ledger.entries.length,6);
  const branch=result.branches.find(b=>b.pair==='CN');assert.equal(branch.publicationActions,0);assert.equal(branch.paidRecordCells,0);
  assert.ok(ledger.entries.every(row=>(row.application.recordAgreementsCreated??0)===0));assert.equal(branch.money.conserved,true);
},progressCore));
