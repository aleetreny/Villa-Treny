#!/usr/bin/env node
/* Manual two-call production-protocol smoke test; default offline. Independent GENESIS per
 * actor/variant. No production state, physical watch, retry or repair of output.
 * --live --out /absolute/diagnostic-directory reads only explicit CF env values.
 * Resume with the same directory: every reserved ID is permanently spent.
 * Sequential cap150: refund only complete authoritative usage, otherwise retain
 * reservation. Full-schema prompts intentionally have their own 6500-byte cap.
 */
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, BenchError, responseText } from './benchmark-society-models.mjs';
import { loadCore, MODEL, settleUsage } from './benchmark-society-runtime.mjs';
const POLICY={version:2,maxCalls:2,maxNeurons:150,maxPromptBytes:6500,maxOutputTokens:768,templateTokens:2048,timeoutMs:45000,seed:91,epochMs:Date.parse('2026-09-08T00:00:00Z')};
const INSTRUCTION="Production dynamic protocol, unchanged.";
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const fail=code=>{throw new BenchError(code);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const spent=ledger=>ledger.attempts.reduce((n,r)=>n+r.accountedNeurons,0);
export function diagnosticJobs(core){
 return ["A","B"].map((actor,index)=>{
  const world=core.genesisState(POLICY.seed),state=core.createSocietyState(world,POLICY.epochMs);
  const prepared=core.prepareSocietyJob({state,world,actor,nowMs:POLICY.epochMs+1000,sequence:index,generation:0,worldRevision:0,habitatId:"isolated-society-protocol-v2"});
  const payload=core.workersAIInput(prepared.job);
  const promptBytes=Buffer.byteLength(JSON.stringify({messages:payload.messages,response_format:payload.response_format}));
  if(promptBytes>POLICY.maxPromptBytes||prepared.turn.contextOverflow)fail("diagnostic_context_overflow");
  const reservedInputTokens=promptBytes+POLICY.templateTokens;
  const reservedNeurons=Math.ceil((reservedInputTokens*MODEL.inputRate+POLICY.maxOutputTokens*MODEL.outputRate)/1e6);
  return {id:`protocol-v2:dynamic:${actor}`,actor,variant:"production-dynamic",...prepared,payload,promptBytes,reservedInputTokens,reservedNeurons};
 });
}
function receipt(core,job,response){
 const accounting=settleUsage(job,response?.usage);
 let output=null,code=null;
 try{output=core.parseStructuredPayload(response?.choices?.[0]?.message?.content??response?.response);}catch{code='invalid_structured_output';}
 if(response?.choices?.[0]?.finish_reason==='length')code='output_truncated';
 if(Array.isArray(response?.choices)&&response.choices.length!==1)code='completion_count';
 if(accounting.exceedsReservation)code='provider_exceeded_reservation';
 return {...accounting,output,code};
}
function validate(core,job,received){
 if(received.code)return{ok:false,code:received.code};
 const world=core.genesisState(POLICY.seed),state=core.createSocietyState(world,POLICY.epochMs);
 const result=core.applySocietyTurn(state,world,job.turn,received.output,{nowMs:POLICY.epochMs+1001,generation:0});
 return {ok:result.ok,code:result.code,project:result.state.minds[job.actor].project,
  conversations:result.state.conversations,offers:result.state.offers,agreements:result.state.agreements,
  balances:Object.fromEntries(['A','B'].map(id=>[id,{before:world.bodies[id].cells,after:result.world.bodies[id].cells}]))};
}
function verify(core,ledger,config,jobs){
 if(!plain(ledger)||ledger.binding!==hash(config)||hash(ledger.config)!==hash(config)||!Array.isArray(ledger.attempts))fail('ledger_binding');
 const ids=new Set();
 for(const row of ledger.attempts){
  const job=jobs.find(j=>j.id===row.id);
  if(!job||ids.has(row.id)||hash(row.job)!==hash(job)||!['reserved','completed','failed','timeout'].includes(row.state))fail('ledger_row');
  ids.add(row.id);
  const r=row.state==='completed'?receipt(core,job,row.response):settleUsage(job,null);
  if(row.accountedNeurons!==r.accountedNeurons)fail('ledger_accounting');
  if(r.exceedsReservation)fail('reservation_exceeded_manual_review');
  if(row.state==='completed'&&hash(row.receipt)!==hash(r))fail('ledger_receipt');
 }
 if(ids.size>POLICY.maxCalls||spent(ledger)>POLICY.maxNeurons)fail('ledger_budget');
}
async function main(){
 const args=process.argv.slice(2),live=args.includes('--live'),outIndex=args.indexOf('--out');
 if(args.some((a,i)=>a!=='--live'&&a!=='--out'&&!(outIndex>=0&&i===outIndex+1))||args.filter(x=>x==='--live').length>1||args.filter(x=>x==='--out').length>1)fail('arguments');
 const out=outIndex>=0?args[outIndex+1]:null;
 if(live?(!out||!isAbsolute(out)):args.length>0)fail('live_requires_absolute_out');
 const core=await loadCore();
 try{
  const jobs=diagnosticJobs(core);
  if(!live){console.log(JSON.stringify({mode:'offline',apiCalls:0,policy:POLICY,jobs:jobs.map(j=>({id:j.id,promptBytes:j.promptBytes,reservedNeurons:j.reservedNeurons})),sumMaxReservations:jobs.reduce((n,j)=>n+j.reservedNeurons,0)},null,2));return;}
  const account=process.env.CF_ACCOUNT_ID,token=process.env.CF_API_TOKEN;
  if(!/^[a-f0-9]{32}$/i.test(account??'')||!token||/\s/.test(token))fail('explicit_credentials_required');
  const config={policy:POLICY,model:MODEL,instruction:INSTRUCTION,accountHash:hash(account),sources:core.sourceFiles,
   diagnosticHash:hash(await readFile(fileURLToPath(import.meta.url),'utf8')),jobs:jobs.map(j=>({id:j.id,hash:hash(j)}))};
  const directory=resolve(out);await mkdir(directory,{recursive:true,mode:0o700});
  const lockPath=join(directory,'.lock'),path=join(directory,'ledger.json');let lock;
  try{lock=await open(lockPath,'wx',0o600);}catch{fail('directory_locked_manual_review');}
  let stopped=false,controller=null;const stop=()=>{stopped=true;controller?.abort();};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  try{
   await lock.writeFile(`${process.pid}\n`);await lock.sync();let ledger;
   try{ledger=JSON.parse(await readFile(path,'utf8'));}catch(error){
    if(error.code!=='ENOENT')fail('unreadable_ledger');
    try{await stat(`${path}.tmp`);fail('incomplete_ledger_manual_review');}catch(missing){if(missing.code!=='ENOENT')throw missing;}
    ledger={config,binding:hash(config),attempts:[]};await atomicJson(path,ledger);
   }
   verify(core,ledger,config,jobs);
   for(const job of jobs){
    const prior=ledger.attempts.find(r=>r.id===job.id);
    if(prior){
     if(prior.state==='completed'){
      const result=validate(core,job,prior.receipt);
      if(prior.validation&&hash(prior.validation)!==hash(result))fail('replay_domain_mismatch');
      if(!prior.validation){prior.validation=result;await atomicJson(path,ledger);}
     }
     continue;
    }
    if(stopped)break;
    if(ledger.attempts.length>=POLICY.maxCalls||spent(ledger)+job.reservedNeurons>POLICY.maxNeurons){ledger.stopped='budget_exhausted';await atomicJson(path,ledger);break;}
    const row={id:job.id,job,state:'reserved',startedAt:new Date().toISOString(),accountedNeurons:job.reservedNeurons};
    ledger.attempts.push(row);await atomicJson(path,ledger); // Durable before fetch.
    const start=performance.now();controller=new AbortController();
    try{
     const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL.id}`,{method:'POST',redirect:'error',
      signal:AbortSignal.any([controller.signal,AbortSignal.timeout(POLICY.timeoutMs)]),
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(job.payload)});
     row.httpStatus=response.status;
     if(!response.ok){await response.body?.cancel();row.state='failed';row.errorCode=`http_${response.status}`;}
     else{
      const raw=JSON.parse((await responseText(response)).replaceAll(token,'[REDACTED]').replaceAll(account,'[REDACTED]'));
      if(raw.success!==true||!plain(raw.result))fail('invalid_envelope');
      row.response=raw.result;row.receipt=receipt(core,job,raw.result);row.accountedNeurons=row.receipt.accountedNeurons;row.state='completed';
     }
    }catch(error){row.state=['TimeoutError','AbortError'].includes(error?.name)?'timeout':'failed';row.errorCode=error instanceof BenchError?error.code:'network_or_invalid_envelope';}
    finally{controller=null;}
    row.latencyMs=Math.round(performance.now()-start);row.finishedAt=new Date().toISOString();await atomicJson(path,ledger); // Result before apply.
    if(row.state==='completed'){row.validation=validate(core,job,row.receipt);await atomicJson(path,ledger);}
    console.log(JSON.stringify({id:row.id,state:row.state,validation:row.validation?.code??row.errorCode,accountedNeurons:row.accountedNeurons,total:spent(ledger)}));
    if(row.state!=='completed'||row.receipt.exceedsReservation)break;
   }
   const report={scope:'Two independent GENESIS decisions; no production mutation or physical watch. Syntax/domain acceptance are not semantic quality.',humanReview:'pending',
    binding:ledger.binding,attempts:ledger.attempts.length,accountedNeurons:spent(ledger),maxNeurons:POLICY.maxNeurons,stopped:ledger.stopped??null,
    rows:ledger.attempts.map(r=>({id:r.id,actor:r.job.actor,variant:r.job.variant,state:r.state,usage:r.response?.usage??null,
     error:r.errorCode??r.receipt?.code??null,output:r.receipt?.output??null,validation:r.validation??null,accountedNeurons:r.accountedNeurons,latencyMs:r.latencyMs??null}))};
   await atomicJson(join(directory,'report.json'),report);
  }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);await lock.close();await unlink(lockPath);}
 }finally{await core.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({error:error instanceof BenchError?error.code:'diagnostic_failed'}));process.exitCode=1;});
