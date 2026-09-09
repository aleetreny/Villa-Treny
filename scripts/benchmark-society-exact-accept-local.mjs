#!/usr/bin/env node
// One expressly authorized local continuation from the exact saved pre-watch L
// scene. No server start, credentials, cloud, default HTTP or unknown retry.
import {readFile,mkdir,open,unlink,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {loadCore,sourceManifest,captureSourceBundle,receive,decodedReceipt,processSample,MODEL} from './benchmark-society-runtime-v7-local.mjs';
import {hash} from './benchmark-society-frozen-v7.mjs';
import {atomicJson,responseText} from './benchmark-society-models.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const DIRECTORY=join(ROOT,'docs/research/model-society-exact-accept-local-2026-09-08');
const SOURCE=join(ROOT,'docs/research/model-society-open-message-local-2026-09-08');
export const POLICY={maxCalls:1,maxOutputTokens:1024,timeoutMs:120000,endpoint:'http://127.0.0.1:8018/v1/chat/completions',sequence:43,nowMs:Date.parse('2026-09-08T00:00:43Z')};
const fail=code=>{throw Error(code)},sceneHash=s=>hash({state:s.state,world:s.world});
export async function loadScene(){
 const bytes=await readFile(join(DIRECTORY,'source-scene.json'));
 const capture=JSON.parse(bytes,(_k,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v);
 const ledgerBytes=await readFile(join(SOURCE,'ledger.json')),ledger=JSON.parse(ledgerBytes);
 if(hash(ledgerBytes)!==capture.sourceLedgerSha256||hash(await readFile(join(SOURCE,'source-bundle.json')))!==capture.sourceBundleSha256
  ||sceneHash(capture.scene)!==capture.beforeHash||ledger.entries.filter(r=>r.kind==='cognition').at(-1).application.afterHash!==capture.beforeHash)fail('source_scene_changed');
 return {capture,scene:structuredClone(capture.scene),captureSha256:hash(bytes),provenance:ledger.config.modelProvenance};
}
export function buildJob(core,scene){
 const p=core.prepareSocietyJob({state:scene.state,world:scene.world,actor:'L',sequence:POLICY.sequence,nowMs:POLICY.nowMs,generation:0,
  worldRevision:scene.worldRevision,habitatId:'isolated-exact-accept-continuation',protocolVersion:4});
 const input=core.workersAIInput(p.job,core.GEMMA_WORKERS_AI_MODEL),payload={model:MODEL.id,messages:input.messages,temperature:input.temperature,seed:input.seed,stream:false,
  max_tokens:1024,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:{name:'society_turn',schema:p.job.outputContract.jsonSchema,strict:true}}};
 if(JSON.stringify(p.job.outputContract.jsonSchema).includes('with close:false'))fail('contradictory_description');
 return {id:p.job.jobId,actor:'L',stage:'exact_continuation',index:0,nowMs:POLICY.nowMs,...p,payload,reservedCalls:1,outputTokenLimit:1024,beforeHash:sceneHash(scene),
  promptBytes:Buffer.byteLength(JSON.stringify({messages:payload.messages,response_format:payload.response_format}))};
}
export function applyAndWatch(core,scene,job,row){
 const before=sceneHash(scene);let application={ok:false,code:row.state,afterHash:before};
 if(row.state==='completed'){
  if(row.receipt.receiptCode)application.code=row.receipt.receiptCode;
  else if(!z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(row.receipt.output).success)application.code='schema_violation';
  else{scene.state=core.markSocietyAttempt(scene.state,'L',job.nowMs);const result=core.applyProposalCapabilityChoice(scene.state,scene.world,job.turn,row.receipt.output,{nowMs:job.nowMs+1,generation:0});scene.state=result.state;scene.world=result.world;
   application={ok:result.ok,code:result.code,afterHash:sceneHash(scene)};
   if(result.ok){const duplicate=core.applyProposalCapabilityChoice(scene.state,scene.world,job.turn,row.receipt.output,{nowMs:job.nowMs+2,generation:0});if(duplicate.code!=='already_applied'||sceneHash(duplicate)!==sceneHash(scene))fail('duplicate_decision');}}
 }
 const beforeAgreements=structuredClone(scene.state.agreements),beforeAccounts=core.economicAccounts(scene.world),plans=core.plannedSocietyActions(scene.state,scene.world),observations=[];
 core.advanceScheduledWatch(scene.world,undefined,undefined,undefined,{plans,onAction:o=>observations.push(o)});
 const observed=core.observeSocietyActions(scene.state,scene.world,observations,{nowMs:POLICY.nowMs+100});scene.state=observed.state;scene.world=observed.world;
 if(hash(core.observeSocietyActions(scene.state,scene.world,observations,{nowMs:POLICY.nowMs+101}))!==hash(observed))fail('duplicate_physical');
 if(!core.parseSocietyState(scene.state).ok)fail('invalid_state');
 return {application,watch:{plans,observations,beforeAgreements,afterAgreements:scene.state.agreements,beforeAccounts,afterAccounts:core.economicAccounts(scene.world)},finalHash:sceneHash(scene)};
}
export function parseArgs(args){const out={run:false,maxNewCalls:1,pid:null},seen=new Set();
 for(let i=0;i<args.length;i++){const k=args[i];if(seen.has(k))fail('duplicate_argument');seen.add(k);
  if(k==='--run')out.run=true;else if(k==='--server-pid'&&/^\d+$/.test(args[i+1]??''))out.pid=Number(args[++i]);
  else if(k==='--max-new-calls'&&/^[01]$/.test(args[i+1]??''))out.maxNewCalls=Number(args[++i]);else fail('argument');}
 if(out.run&&out.maxNewCalls&&!out.pid)fail('server_pid_required');return out;}
export async function main(args=process.argv.slice(2)){
 const options=parseArgs(args),source=await loadScene(),core=await loadCore();
 try{const job=buildJob(core,source.scene),scripts=await Promise.all(['scripts/benchmark-society-exact-accept-local.mjs','scripts/benchmark-society-runtime-v7-local.mjs','scripts/benchmark-society-frozen-v7.mjs','scripts/benchmark-society-models.mjs'].map(async path=>({path,sha256:hash(await readFile(join(ROOT,path)))})));
  const config={policy:POLICY,source:core.sourceFiles,scripts,model:MODEL,modelProvenance:source.provenance,captureSha256:source.captureSha256,sourceLedgerSha256:source.capture.sourceLedgerSha256,beforeHash:job.beforeHash,jobSha256:hash(job)};
  if(!options.run){console.log(JSON.stringify({mode:'offline',httpRequests:0,config},null,2));return;}
  await mkdir(DIRECTORY,{recursive:true});const lock=await open(join(DIRECTORY,'.lock'),'wx');
  try{const path=join(DIRECTORY,'ledger.json');let ledger;
   try{ledger=JSON.parse(await readFile(path));}catch(e){if(e.code!=='ENOENT')throw e;if(!options.maxNewCalls)fail('replay_requires_ledger');ledger={config,binding:hash(config),entries:[]};
    await atomicJson(join(DIRECTORY,'source-bundle.json'),await captureSourceBundle(core.sourceFiles));
    await atomicJson(join(DIRECTORY,'probe-source-bundle.json'),{files:await Promise.all(scripts.map(async f=>({...f,text:await readFile(join(ROOT,f.path),'utf8')})))});await atomicJson(path,ledger);}
   if(ledger.binding!==hash(config)||hash(ledger.config)!==hash(config)||ledger.entries.length>1)fail('ledger_config');
   let row=ledger.entries[0],newCalls=0;
   if(!row&&options.maxNewCalls){
    row=await receive(job,ledger,v=>atomicJson(path,v),async job=>{const response=await fetch(POLICY.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(POLICY.timeoutMs),headers:{'content-type':'application/json'},body:JSON.stringify(job.payload)});
     return {status:response.status,text:await responseText(response),headers:Object.fromEntries(['warning','content-type','server'].map(k=>[k,response.headers.get(k)]).filter(([,v])=>v!==null))};},core.parseStructuredPayload,
     {measure:()=>processSample(options.pid),beforeReserve:async()=>{
      if(hash(await sourceManifest())!==hash(core.sourceFiles)||hash(await readFile(join(DIRECTORY,'source-scene.json')))!==config.captureSha256)fail('source_changed');
      for(const f of scripts)if(hash(await readFile(join(ROOT,f.path)))!==f.sha256)fail('script_changed');
      if(!processSample(options.pid)?.command.endsWith('omlx-server'))fail('owned_server');
      const listener=spawnSync('/usr/sbin/lsof',['-nP','-a','-p',String(options.pid),'-iTCP:8018','-sTCP:LISTEN'],{encoding:'utf8'});
      if(listener.status!==0||!listener.stdout.includes('127.0.0.1:8018 (LISTEN)'))fail('loopback_listener');
      for(const f of source.provenance.observedFiles){const p=join(MODEL.path,f.name),s=await stat(p);if(s.size!==f.bytes||s.ino!==f.inode||s.mtimeMs!==f.mtimeMs||s.ctimeMs!==f.ctimeMs)fail('weights_changed');if(!f.name.endsWith('.safetensors')&&hash(await readFile(p))!==f.sha256)fail('model_metadata');}
      for(const f of source.provenance.serverSources)if(hash(await readFile(join('/Applications/oMLX.app/Contents/Resources/omlx',f.name)))!==f.sha256)fail('server_source');}});newCalls=1;
   }
   if(!row){console.log(JSON.stringify({newCalls:0,state:'offline'}));return;}
   if(hash(row.job)!==hash(job))fail('saved_job_changed');
   if(row.state==='completed'){const raw=JSON.parse(row.rawResponse);if(hash(raw)!==hash(row.response)||hash(decodedReceipt(raw,core.parseStructuredPayload,row.headers))!==hash(row.receipt))fail('raw_changed');}
   const result=applyAndWatch(core,structuredClone(source.scene),job,row);
   if(row.result&&hash(row.result)!==hash(result))fail('replay_mismatch');
   if(!row.result){row.result=result;await atomicJson(path,ledger);}
   const report={scope:'One preselected continuation from L before the preceding physical watch. Current clarified P4 SYSTEM and schema descriptions. No forced acceptance or synthetic terms.',humanReview:'pending',newCalls,state:row.state,output:row.receipt?.output,usage:row.response?.usage,warning:row.headers?.warning??null,latencyMs:row.latencyMs,result};
   await atomicJson(join(DIRECTORY,'report.json'),report);console.log(JSON.stringify({newCalls,state:row.state,output:report.output,usage:report.usage,result}));
  }finally{await lock.close();await unlink(join(DIRECTORY,'.lock'));}
 }finally{await core.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1});
