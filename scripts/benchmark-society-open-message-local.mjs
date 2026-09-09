#!/usr/bin/env node
// Three exact V7 scenes with currentP4 SYSTEM/schema, then up to three actual
// alternating replies in L's resulting conversation. At most six LOCAL calls.
// No forced proposal, acceptance, closure, retries, cloud or production state.
import { readFile, mkdir, open, unlink, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadFrozenV7Core, hash } from './benchmark-society-frozen-v7.mjs';
import { prepareOrderCases, parseArgs } from './benchmark-society-v7-deal-order-local.mjs';
import { loadCore, sourceManifest, captureSourceBundle, receive, decodedReceipt, processSample, MODEL } from './benchmark-society-runtime-v7-local.mjs';
import { atomicJson, responseText, BenchError } from './benchmark-society-models.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const POLICY={version:1,protocol:4,maxCalls:6,matchedActors:['G','L','B'],replyBranch:'L',maxReplies:3,
 maxOutputTokens:1024,timeoutMs:120000,endpoint:'http://127.0.0.1:8018/v1/chat/completions',epochMs:Date.parse('2026-09-08T00:00:00Z'),generation:0};
const fail=code=>{throw new BenchError(code)};
const sceneHash=scene=>hash({state:scene.state,world:scene.world});
const cloned=fixture=>structuredClone(fixture.scene);
function prepared(core,scene,actor,sequence,nowMs) {
 return core.prepareSocietyJob({state:scene.state,world:scene.world,actor,sequence,nowMs,generation:0,worldRevision:scene.worldRevision,
  habitatId:'isolated-open-message-probe',protocolVersion:4});
}
export function matchedJob(core,fixture) {
 const source=fixture.sourceJob, current=prepared(core,fixture.scene,fixture.actor,source.turn.sequence,source.nowMs), job=structuredClone(source);
 if(hash(current.job.outputContract.jsonSchema)!==hash(core.proposalCapabilityChoiceJsonSchema(fixture.scene.state,fixture.scene.world,source.turn)))fail('matched_authority_changed');
 job.id=`open-message:matched:${source.id}`; job.job.jobId=job.id;
 job.job.prompt.system=current.job.prompt.system; job.job.outputContract=current.job.outputContract;
 job.payload.messages[0].content=current.job.prompt.system; job.payload.response_format.json_schema.schema=current.job.outputContract.jsonSchema;
 job.promptBytes=Buffer.byteLength(JSON.stringify({messages:job.payload.messages,response_format:job.payload.response_format}));
 job.stage='matched'; job.sourceJobHash=hash(source); job.beforeHash=fixture.beforeHash;
 if(job.job.outputContract.version!==4 || job.payload.max_tokens!==1024 || job.payload.chat_template_kwargs.enable_thinking!==false
  || job.job.prompt.user!==source.job.prompt.user || job.payload.seed!==source.payload.seed) fail('matched_context_changed');
 return job;
}
function replyJob(core,scene,actor,index) {
 const nowMs=POLICY.epochMs+40_000+index*1000, sequence=40+index;
 const p=prepared(core,scene,actor,sequence,nowMs), provider=core.workersAIInput(p.job,core.GEMMA_WORKERS_AI_MODEL);
 const payload={model:MODEL.id,messages:provider.messages,temperature:provider.temperature,seed:provider.seed,stream:false,max_tokens:1024,
  chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:{name:'society_turn',schema:p.job.outputContract.jsonSchema,strict:true}}};
 return {id:p.job.jobId,actor,stage:'derived_reply',index,nowMs,...p,payload,reservedCalls:1,outputTokenLimit:1024,
  promptBytes:Buffer.byteLength(JSON.stringify({messages:payload.messages,response_format:payload.response_format})),beforeHash:sceneHash(scene)};
}
function application(core,scene,job,row) {
 if(row.receipt.receiptCode) return {ok:false,code:row.receipt.receiptCode,afterHash:sceneHash(scene)};
 if(!z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(row.receipt.output).success) return {ok:false,code:'schema_violation',afterHash:sceneHash(scene)};
 scene.state=core.markSocietyAttempt(scene.state,job.actor,job.nowMs);
 const result=core.applyProposalCapabilityChoice(scene.state,scene.world,job.turn,row.receipt.output,{nowMs:job.nowMs+1,generation:0});
 const before=hash(scene.world);scene.state=result.state;scene.world=result.world;if(hash(scene.world)!==before)scene.worldRevision++;
 if(result.ok){const again=core.applyProposalCapabilityChoice(result.state,result.world,job.turn,row.receipt.output,{nowMs:job.nowMs+2,generation:0});
  if(again.code!=='already_applied'||sceneHash(again)!==sceneHash(result))fail('duplicate_effect');}
 if(!core.parseSocietyState(scene.state).ok)fail('invalid_state');
 return {ok:result.ok,code:result.code,afterHash:sceneHash(scene)};
}
export async function runScenario(core,fixtures,ledger,{persist=async()=>{},dispatch,beforeReserve,measure,maxNewCalls=1}={}) {
 if(!Number.isInteger(maxNewCalls)||maxNewCalls<0||maxNewCalls>6)fail('call_limit');
 const scenes=Object.fromEntries(fixtures.map(f=>[f.actor,cloned(f)]));let cursor=0,newCalls=0,halted=null;
 async function thought(scene,job){
  let row=ledger.entries[cursor];
  if(row){if(row.kind!=='cognition'||hash(row.job)!==hash(job))fail('saved_job_changed');}
  else {
   if(newCalls>=maxNewCalls){halted='call_limit_reached';return false;}
   if(ledger.entries.filter(r=>r.kind==='cognition').length>=6)fail('total_call_limit');
   row=await receive(job,ledger,persist,dispatch,core.parseStructuredPayload,{beforeReserve,measure});newCalls++;
  }
  cursor++;
  if(row.state==='completed'){
   const expected=application(core,scene,job,row);
   if(row.application&&hash(row.application)!==hash(expected))fail('replay_application');
   if(!row.application){row.application=expected;await persist(ledger);}
  }
  return true;
 }
 for(const fixture of fixtures)if(!await thought(scenes[fixture.actor],matchedJob(core,fixture)))return {scenes,newCalls,halted};
 const branch=scenes.L, l=fixtures.find(f=>f.actor==='L'), conversationId=l.sourceJob.turn.conversation?.id;
 let last=ledger.entries.find(r=>r.job?.stage==='matched'&&r.job.actor==='L');
 for(let i=0;i<3;i++){
  const conversation=branch.state.conversations.find(c=>c.id===conversationId);
  if(!last?.application?.ok||!conversation||conversation.status!=='open'||!conversation.nextSpeaker||!['J','L'].includes(conversation.nextSpeaker))break;
  const job=replyJob(core,branch,conversation.nextSpeaker,i);
  if(!await thought(branch,job))return {scenes,newCalls,halted}; last=ledger.entries[cursor-1];
 }
 if(ledger.entries[cursor]?.kind!=='watch'&&newCalls>=maxNewCalls&&maxNewCalls<6){halted='call_limit_reached';return {scenes,newCalls,halted};}
 const plans=core.plannedSocietyActions(branch.state,branch.world);
 if(Object.keys(plans).length){
  const beforeHash=sceneHash(branch),beforeAccounts=core.economicAccounts(branch.world),observations=[];
  core.advanceScheduledWatch(branch.world,undefined,undefined,undefined,{plans,onAction:o=>observations.push(o)});
  const observed=core.observeSocietyActions(branch.state,branch.world,observations,{nowMs:POLICY.epochMs+50_000});branch.state=observed.state;branch.world=observed.world;branch.worldRevision++;
  if(hash(core.observeSocietyActions(branch.state,branch.world,observations,{nowMs:POLICY.epochMs+50_001}))!==hash(observed))fail('duplicate_watch');
  const row={kind:'watch',id:'open-message:L:watch',beforeHash,plans,observations,beforeAccounts,afterAccounts:core.economicAccounts(branch.world),afterHash:sceneHash(branch)};
  if(ledger.entries[cursor]){if(hash(ledger.entries[cursor])!==hash(row))fail('replay_watch');}
  else{ledger.entries.push(row);await persist(ledger);}cursor++;
 }
 if(cursor!==ledger.entries.length)fail('unconsumed_entries');
 return {scenes,newCalls,halted};
}
function verifyLedger(core,ledger,config){
 if(ledger.binding!==hash(config)||hash(ledger.config)!==hash(config)||!Array.isArray(ledger.entries))fail('ledger_binding');
 const ids=new Set();let calls=0,watches=0;
 for(const row of ledger.entries){if(ids.has(row.id))fail('duplicate_id');ids.add(row.id);
  if(row.kind==='watch'){watches++;continue;}calls++;
  if(row.kind!=='cognition'||row.job.job.outputContract.version!==4||!['completed','reserved','failed','timeout','skipped'].includes(row.state))fail('ledger_row');
  if(row.state==='completed'){const raw=JSON.parse(row.rawResponse),parsed=decodedReceipt(raw,core.parseStructuredPayload,row.headers);
   if(hash(raw)!==hash(row.response)||hash(parsed)!==hash(row.receipt))fail('receipt_changed');}
  else if(row.application)fail('unknown_applied');
 }
 if(calls>6||watches>1)fail('ledger_cap');
}
async function localProvenance(frozen,pid){
 if(!processSample(pid)?.command.endsWith('omlx-server'))fail('owned_local_server');
 const listening=spawnSync('/usr/sbin/lsof',['-nP','-a','-p',String(pid),'-iTCP:8018','-sTCP:LISTEN'],{encoding:'utf8',timeout:3000});
 if(listening.status!==0||!listening.stdout.includes('127.0.0.1:8018 (LISTEN)'))fail('loopback_listener');
 for(const file of frozen.frozenReference.config.provenance.observedFiles){const path=join(MODEL.path,file.name),info=await stat(path);
  if(info.size!==file.bytes||info.ino!==file.inode||info.mtimeMs!==file.mtimeMs||info.ctimeMs!==file.ctimeMs)fail('weights_changed');
  if(!file.name.endsWith('.safetensors')&&hash(await readFile(path))!==file.sha256)fail('model_metadata_changed');}
 for(const file of frozen.frozenReference.config.provenance.serverSources)if(hash(await readFile(join('/Applications/oMLX.app/Contents/Resources/omlx',file.name)))!==file.sha256)fail('server_changed');
}
export async function main(args=process.argv.slice(2)){
 const options=parseArgs(args),frozen=await loadFrozenV7Core(),core=await loadCore();
 try{
  const fixtures=await prepareOrderCases(frozen),jobs=fixtures.map(f=>matchedJob(core,f));
  const scriptPaths=['scripts/benchmark-society-open-message-local.mjs','scripts/benchmark-society-v7-deal-order-local.mjs','scripts/benchmark-society-frozen-v7.mjs','scripts/benchmark-society-models.mjs'];
  const scripts=await Promise.all(scriptPaths.map(async path=>({path,sha256:hash(await readFile(join(ROOT,path)))})));
  const config={policy:POLICY,source:core.sourceFiles,frozen:frozen.frozenProvenance,scripts,model:MODEL,modelProvenance:frozen.frozenReference.config.provenance,
   intervention:'Matched cases retain exact V7 state and USER; currentP4 SYSTEM and corrected schema both change. Replies are newly derived, no forced deals or acceptance.',jobs:jobs.map(j=>({id:j.id,sha256:hash(j)}))};
  if(!options.run){console.log(JSON.stringify({mode:'offline',httpRequests:0,config},null,2));return;}
  const directory=resolve(options.out),path=join(directory,'ledger.json');await mkdir(directory,{recursive:true});const lock=await open(join(directory,'.lock'),'wx');
  try{
   let ledger;try{ledger=JSON.parse(await readFile(path));}catch(e){if(e.code!=='ENOENT')throw e;if(!options.maxNewCalls)fail('replay_requires_ledger');
    ledger={config,binding:hash(config),entries:[]};await atomicJson(join(directory,'source-bundle.json'),await captureSourceBundle(core.sourceFiles));
    await atomicJson(join(directory,'probe-source-bundle.json'),{files:await Promise.all(scripts.map(async file=>({...file,text:await readFile(join(ROOT,file.path),'utf8')})))});
    await atomicJson(join(directory,'frozen-cases.json'),{source:frozen.frozenProvenance,cases:fixtures.map(f=>({actor:f.actor,beforeHash:f.beforeHash,sourceJob:f.sourceJob})),jobs});
    await atomicJson(path,ledger);}
   verifyLedger(core,ledger,config);
   const result=await runScenario(core,fixtures,ledger,{maxNewCalls:options.maxNewCalls,persist:v=>atomicJson(path,v),measure:()=>processSample(options.pid),
    beforeReserve:async()=>{await frozen.verifyFrozenSources();if(hash(await sourceManifest())!==hash(core.sourceFiles))fail('source_changed');
     for(const file of scripts)if(hash(await readFile(join(ROOT,file.path)))!==file.sha256)fail('script_changed');await localProvenance(frozen,options.pid);},
    dispatch:async job=>{const response=await fetch(POLICY.endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(job.payload),signal:AbortSignal.timeout(POLICY.timeoutMs)});
     return {status:response.status,text:await responseText(response),headers:Object.fromEntries(['warning','content-type','server'].map(k=>[k,response.headers.get(k)]).filter(([,v])=>v!==null))};}});
   verifyLedger(core,ledger,config);
   const report={scope:config.intervention,limits:'Three isolated matched cases, up to three actual alternating replies only in L, one conditional physical watch in L. No sustained-autonomy claim or inference of consent.',humanReview:'pending',binding:ledger.binding,newCalls:result.newCalls,halted:result.halted,
    rows:ledger.entries.filter(r=>r.kind==='cognition').map(r=>({actor:r.job.actor,stage:r.job.stage,state:r.state,output:r.receipt?.output,application:r.application,usage:r.response?.usage,latencyMs:r.latencyMs,warning:r.headers?.warning??null})),
    watch:ledger.entries.find(r=>r.kind==='watch')??null,final:Object.fromEntries(Object.entries(result.scenes).map(([actor,s])=>[actor,{hash:sceneHash(s),publicSociety:core.societyPublicView(s.state),offers:s.state.offers,agreements:s.state.agreements,accounts:core.economicAccounts(s.world)}]))};
   await atomicJson(join(directory,'report.json'),report);console.log(JSON.stringify({newCalls:report.newCalls,halted:report.halted,rows:report.rows.map(r=>({actor:r.actor,stage:r.stage,state:r.state,application:r.application?.code,deal:r.output?.deal})),watch:Boolean(report.watch)}));
  }finally{await lock.close();await unlink(join(directory,'.lock'));}
 }finally{await core.close();await frozen.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.code??e.message);process.exitCode=1});
