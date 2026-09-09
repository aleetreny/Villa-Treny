#!/usr/bin/env node
// Final predeclared LOCAL extension: at most J/L/J, stop on invalid/closed or
// accepted/rejected offer. Same current producer, no instruction changes,
// synthetic messages, retries or cloud. One physical watch after the dialogue.
import {readFile,mkdir,open,unlink,stat} from 'node:fs/promises';
import{spawnSync}from'node:child_process';import{dirname,join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{z}from'zod';
import{loadCore,sourceManifest,captureSourceBundle,receive,decodedReceipt,processSample,MODEL}from'./benchmark-society-runtime-v7-local.mjs';
import{hash}from'./benchmark-society-frozen-v7.mjs';import{atomicJson,responseText}from'./benchmark-society-models.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const DIRECTORY=join(ROOT,'docs/research/model-society-final-dialogue-local-2026-09-08');
const PRIOR=join(ROOT,'docs/research/model-society-exact-accept-local-2026-09-08');
export const POLICY={maxCalls:3,actors:['J','L','J'],sequenceStart:44,epochMs:Date.parse('2026-09-08T00:00:00Z'),maxOutputTokens:1024,timeoutMs:120000,endpoint:'http://127.0.0.1:8018/v1/chat/completions'};
const fail=code=>{throw Error(code)},sceneHash=s=>hash({state:s.state,world:s.world});
export async function loadScene(){const bytes=await readFile(join(DIRECTORY,'source-scene.json'));const capture=JSON.parse(bytes,(_k,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v);
const raw=await readFile(join(PRIOR,'ledger.json')),prior=JSON.parse(raw);if(hash(raw)!==capture.sourceLedgerSha256||sceneHash(capture.scene)!==capture.beforeHash||prior.entries[0].result.application.afterHash!==capture.beforeHash||hash(await readFile(join(PRIOR,'source-bundle.json')))!==capture.sourceBundleSha256)fail('source_continuity');
return {capture,scene:structuredClone(capture.scene),captureSha256:hash(bytes),provenance:prior.config.modelProvenance};}
export function buildJob(core,scene,index){const actor=POLICY.actors[index],sequence=POLICY.sequenceStart+index,nowMs=POLICY.epochMs+sequence*1000;
const p=core.prepareSocietyJob({state:scene.state,world:scene.world,actor,sequence,nowMs,generation:0,worldRevision:scene.worldRevision,habitatId:'isolated-final-dialogue',protocolVersion:4});
const input=core.workersAIInput(p.job,core.GEMMA_WORKERS_AI_MODEL),payload={model:MODEL.id,messages:input.messages,temperature:input.temperature,seed:input.seed,stream:false,max_tokens:1024,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:{name:'society_turn',schema:p.job.outputContract.jsonSchema,strict:true}}};
return {id:p.job.jobId,actor,stage:'final_reply',index,nowMs,...p,payload,beforeHash:sceneHash(scene),reservedCalls:1,outputTokenLimit:1024,promptBytes:Buffer.byteLength(JSON.stringify({messages:payload.messages,response_format:payload.response_format}))};}
function apply(core,scene,job,row){if(row.state!=='completed')return {ok:false,code:row.state,afterHash:sceneHash(scene)};
if(row.receipt.receiptCode)return {ok:false,code:row.receipt.receiptCode,afterHash:sceneHash(scene)};
if(!z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(row.receipt.output).success)return{ok:false,code:'schema_violation',afterHash:sceneHash(scene)};
scene.state=core.markSocietyAttempt(scene.state,job.actor,job.nowMs);const before=hash(scene.world),r=core.applyProposalCapabilityChoice(scene.state,scene.world,job.turn,row.receipt.output,{nowMs:job.nowMs+1,generation:0});scene.state=r.state;scene.world=r.world;if(hash(scene.world)!==before)scene.worldRevision++;
if(r.ok){const d=core.applyProposalCapabilityChoice(r.state,r.world,job.turn,row.receipt.output,{nowMs:job.nowMs+2,generation:0});if(d.code!=='already_applied'||sceneHash(d)!==sceneHash(scene))fail('duplicate_decision');}
return{ok:r.ok,code:r.code,afterHash:sceneHash(scene)};}
export async function run(core,source,ledger,{maxNewCalls=1,persist=async()=>{},dispatch,beforeReserve,measure}={}){
if(!Number.isInteger(maxNewCalls)||maxNewCalls<0||maxNewCalls>3)fail('cap');const scene=structuredClone(source);let cursor=0,newCalls=0,stopped=null;
for(let i=0;i<3;i++){
const c=scene.state.conversations.find(x=>x.id==='conversation:41');if(!c||c.status!=='open'||c.nextSpeaker!==POLICY.actors[i]){stopped='closed_or_no_legal_turn';break;}
const job=buildJob(core,scene,i);let row=ledger.entries[cursor];
if(row){if(row.kind!=='cognition'||hash(row.job)!==hash(job))fail('replay_job');}
else{if(newCalls>=maxNewCalls)return{scene,newCalls,stopped:'call_limit_reached'};if(ledger.entries.filter(r=>r.kind==='cognition').length>=3)fail('total_cap');row=await receive(job,ledger,persist,dispatch,core.parseStructuredPayload,{beforeReserve,measure});newCalls++;}
cursor++;const a=apply(core,scene,job,row);if(row.application&&hash(row.application)!==hash(a))fail('replay_application');if(!row.application){row.application=a;await persist(ledger);}
if(!a.ok){stopped='invalid_or_unknown_response';break;}
if(['accept','reject'].includes(row.receipt.output.deal?.kind)){stopped='offer_resolved';break;}
}
const beforeHash=sceneHash(scene),plans=core.plannedSocietyActions(scene.state,scene.world),observations=[],beforeAccounts=core.economicAccounts(scene.world),beforeAgreements=structuredClone(scene.state.agreements);
core.advanceScheduledWatch(scene.world,undefined,undefined,undefined,{plans,onAction:o=>observations.push(o)});
const observed=core.observeSocietyActions(scene.state,scene.world,observations,{nowMs:POLICY.epochMs+60_000});scene.state=observed.state;scene.world=observed.world;
if(hash(core.observeSocietyActions(scene.state,scene.world,observations,{nowMs:POLICY.epochMs+60_001}))!==hash(observed))fail('duplicate_physical');
if(!core.parseSocietyState(scene.state).ok)fail('invalid_state');
const watch={kind:'watch',id:'final-dialogue:watch',beforeHash,plans,observations,beforeAccounts,afterAccounts:core.economicAccounts(scene.world),beforeAgreements,afterAgreements:scene.state.agreements,afterHash:sceneHash(scene)};
if(ledger.entries[cursor]){if(hash(ledger.entries[cursor])!==hash(watch))fail('replay_watch');}else{ledger.entries.push(watch);await persist(ledger);}cursor++;
if(cursor!==ledger.entries.length)fail('unconsumed');return{scene,newCalls,stopped};}
export function parseArgs(args){const o={run:false,maxNewCalls:1,pid:null},seen=new Set();for(let i=0;i<args.length;i++){const k=args[i];if(seen.has(k))fail('duplicate_arg');seen.add(k);
if(k==='--run')o.run=true;else if(k==='--max-new-calls'&&/^[0-3]$/.test(args[i+1]??''))o.maxNewCalls=Number(args[++i]);else if(k==='--server-pid'&&/^\d+$/.test(args[i+1]??''))o.pid=Number(args[++i]);else fail('arg');}if(o.run&&o.maxNewCalls&&!o.pid)fail('server_required');return o;}
export async function main(args=process.argv.slice(2)){const options=parseArgs(args),source=await loadScene(),core=await loadCore();try{
const scripts=await Promise.all(['scripts/benchmark-society-final-dialogue-local.mjs','scripts/benchmark-society-runtime-v7-local.mjs','scripts/benchmark-society-frozen-v7.mjs','scripts/benchmark-society-models.mjs'].map(async path=>({path,sha256:hash(await readFile(join(ROOT,path)))})));
const config={policy:POLICY,source:core.sourceFiles,scripts,model:MODEL,modelProvenance:source.provenance,captureSha256:source.captureSha256,sourceLedgerSha256:source.capture.sourceLedgerSha256,beforeHash:source.capture.beforeHash};
if(!options.run){console.log(JSON.stringify({mode:'offline',httpRequests:0,config},null,2));return;}await mkdir(DIRECTORY,{recursive:true});const lock=await open(join(DIRECTORY,'.lock'),'wx');try{const path=join(DIRECTORY,'ledger.json');let ledger;
try{ledger=JSON.parse(await readFile(path));}catch(e){if(e.code!=='ENOENT')throw e;if(!options.maxNewCalls)fail('replay_requires_ledger');ledger={config,binding:hash(config),entries:[]};await atomicJson(join(DIRECTORY,'source-bundle.json'),await captureSourceBundle(core.sourceFiles));await atomicJson(join(DIRECTORY,'probe-source-bundle.json'),{files:await Promise.all(scripts.map(async f=>({...f,text:await readFile(join(ROOT,f.path),'utf8')})))});await atomicJson(path,ledger);}
if(ledger.binding!==hash(config)||hash(ledger.config)!==hash(config)||ledger.entries.filter(r=>r.kind==='cognition').length>3)fail('config');
for(const r of ledger.entries)if(r.kind==='cognition'&&r.state==='completed'){const raw=JSON.parse(r.rawResponse);if(hash(raw)!==hash(r.response)||hash(decodedReceipt(raw,core.parseStructuredPayload,r.headers))!==hash(r.receipt))fail('raw_changed');}
const result=await run(core,source.scene,ledger,{maxNewCalls:options.maxNewCalls,persist:l=>atomicJson(path,l),measure:()=>processSample(options.pid),beforeReserve:async()=>{
if(hash(await sourceManifest())!==hash(core.sourceFiles)||hash(await readFile(join(DIRECTORY,'source-scene.json')))!==config.captureSha256)fail('source_changed');for(const f of scripts)if(hash(await readFile(join(ROOT,f.path)))!==f.sha256)fail('script_changed');if(!processSample(options.pid)?.command.endsWith('omlx-server'))fail('owned_server');
const check=spawnSync('/usr/sbin/lsof',['-nP','-a','-p',String(options.pid),'-iTCP:8018','-sTCP:LISTEN'],{encoding:'utf8'});if(check.status!==0||!check.stdout.includes('127.0.0.1:8018 (LISTEN)'))fail('loopback');
for(const f of source.provenance.observedFiles){const path=join(MODEL.path,f.name),s=await stat(path);if(s.size!==f.bytes||s.ino!==f.inode||s.mtimeMs!==f.mtimeMs||s.ctimeMs!==f.ctimeMs)fail('model_changed');if(!f.name.endsWith('.safetensors')&&hash(await readFile(path))!==f.sha256)fail('metadata');}for(const f of source.provenance.serverSources)if(hash(await readFile(join('/Applications/oMLX.app/Contents/Resources/omlx',f.name)))!==f.sha256)fail('server_source');},
dispatch:async job=>{const r=await fetch(POLICY.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(POLICY.timeoutMs),headers:{'content-type':'application/json'},body:JSON.stringify(job.payload)});return{status:r.status,text:await responseText(r),headers:Object.fromEntries(['warning','content-type','server'].map(k=>[k,r.headers.get(k)]).filter(([,v])=>v!==null))};}});
const report={scope:'Final fixed up-to-three replies J/L/J from exact offer70 scene. No instruction, schema, sampling-policy or core change. Early stop on accepted/rejected offer, invalid response or closed conversation; one physical watch.',humanReview:'pending',newCalls:result.newCalls,stopped:result.stopped,rows:ledger.entries.filter(r=>r.kind==='cognition').map(r=>({actor:r.job.actor,output:r.receipt?.output,state:r.state,application:r.application,usage:r.response?.usage,latencyMs:r.latencyMs,warning:r.headers?.warning??null})),watch:ledger.entries.find(r=>r.kind==='watch'),offers:result.scene.state.offers,agreements:result.scene.state.agreements,finalHash:sceneHash(result.scene)};
await atomicJson(join(DIRECTORY,'report.json'),report);console.log(JSON.stringify({newCalls:report.newCalls,stopped:report.stopped,rows:report.rows,agreements:report.agreements,finalHash:report.finalHash}));
}finally{await lock.close();await unlink(join(DIRECTORY,'.lock'));}}finally{await core.close();}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1});
