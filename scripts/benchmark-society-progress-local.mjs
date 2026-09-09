#!/usr/bin/env node
// Offline-first, eight fixed SYSTEM comparisons. Never starts a model server.
import {readFile,mkdir,open,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {z} from 'zod';
import {loadCore as recordsCore,sourceManifest as recordsManifest,privateDirectory,verifyModelProvenance} from './benchmark-society-records-canonical-local.mjs';
import {decodedReceipt,MODEL,hash,captureSourceBundle,verifySourceBundle,processSample} from './benchmark-society-runtime-v7-local.mjs';
import {atomicJson,responseText} from './benchmark-society-models.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PROVENANCE='docs/research/model-society-ordered-choice-local-2026-09-08/ledger.json';
export const POLICY=Object.freeze({version:1,protocol:6,sourceRevision:199,pairs:['BK','CN','IO','GQ'],
  order:[['A','B'],['B','A'],['A','B'],['B','A']],maxCalls:8,maxOutputTokens:1024,maxPromptBytes:32000,
  timeoutMs:120000,concurrency:1,thinking:false,endpoint:'http://127.0.0.1:8018/v1/chat/completions',
  continuations:0,physicalWatches:0,variable:'SYSTEM only: exact 7a reference guidance versus progress guidance',
  byteAccounting:'32,000 UTF-8 bytes of the complete serialized local request, including sampling and model fields. The historic shared receiver remains at 24,576 messages-plus-schema bytes.',
  common:'Current pure core, one prepared USER/schema/seed per pair, isolated clone per response. No historic output is planted.'});
const fail=code=>{throw new Error(code);};
const sceneHash=scene=>hash({state:scene.state,world:scene.world});
export async function sourceManifest(){
  const paths=[...new Set([...(await recordsManifest()).map(f=>f.path),'scripts/benchmark-society-progress-local.mjs',
    'scripts/benchmark-society-progress-local.test.mjs','src/lib/habitat/society/record-instructions.ts'])].sort();
  return Promise.all(paths.map(async path=>({path,sha256:hash(await readFile(join(ROOT,path)))})));
}
export async function loadCore(){
  const sourceFiles=await sourceManifest(),base=await recordsCore();
  const server=await createServer({root:ROOT,configFile:false,appType:'custom',logLevel:'silent',
    server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
  try{
    const instructions=await server.ssrLoadModule('/src/lib/habitat/society/record-instructions.ts');
    const verifySources=async()=>{await base.verifySources();if(hash(await sourceManifest())!==hash(sourceFiles))fail('sources_changed');};
    await verifySources();
    if(['SOCIETY_RECORD_SYSTEM_BEFORE_PROGRESS','SOCIETY_RECORD_SYSTEM','SOCIETY_RECORD_PROGRESS_CANDIDATE_SYSTEM']
      .some(name=>typeof instructions[name]!=='string'))fail('instruction_exports_missing');
    return{...base,...instructions,sourceFiles,verifySources,close:async()=>{try{await server.close();}finally{await base.close();}}};
  }catch(e){await server.close();await base.close();throw e;}
}
export function prepareCases(core,bundle){
  const verified=core.verifyRecoveryBundle(bundle.core,bundle.pages??[]);
  if(verified.worldRevision!==POLICY.sourceRevision)fail('expected_revision_199');
  const parsed=core.parseSocietyState(JSON.parse(verified.tables.society_state[0].state_json));
  if(!parsed.ok)fail('invalid_society');
  const state=parsed.state,nowMs=bundle.core.exportedAtMs+1,generation=verified.runtime.control_revision;
  const sequenceStart=Math.max(-1,...Object.values(state.minds).map(m=>m.lastAppliedSequence),
    ...(verified.tables.cognition_contexts??[]).map(r=>r.sequence).filter(Number.isSafeInteger))+1;
  if(core.SOCIETY_RECORD_SYSTEM_BEFORE_PROGRESS===core.SOCIETY_RECORD_PROGRESS_CANDIDATE_SYSTEM)fail('no_instruction_intervention');
  const cases=POLICY.pairs.map((pair,index)=>{
    const c=state.conversations.find(c=>[...c.participants].sort().join('')===pair&&c.status==='open'&&c.expiresAtMs>nowMs&&c.nextSpeaker);
    if(!c)fail('selected_conversation_not_open');
    const scene={state:structuredClone(state),world:structuredClone(verified.world),worldRevision:verified.worldRevision};
    const prepared=core.prepareSocietyJob({state:scene.state,world:scene.world,actor:c.nextSpeaker,sequence:sequenceStart+index,
      nowMs,generation,worldRevision:verified.worldRevision,habitatId:'isolated-progress-system-v1',protocolVersion:6});
    if(prepared.turn.conversation?.id!==c.id||prepared.turn.actor!==c.nextSpeaker||prepared.job.outputContract.version!==6
      ||prepared.job.maxOutputTokens!==1024||prepared.job.prompt.system!==core.SOCIETY_RECORD_SYSTEM)fail('prepared_contract_changed');
    const jobs=POLICY.order[index].map(variant=>{
      const cloned=structuredClone(prepared),system=variant==='A'?core.SOCIETY_RECORD_SYSTEM_BEFORE_PROGRESS:core.SOCIETY_RECORD_PROGRESS_CANDIDATE_SYSTEM;
      cloned.job.prompt.system=system;
      const input=core.workersAIInput(cloned.job,core.GEMMA_WORKERS_AI_MODEL);
      if(hash(input.messages)!==hash([{role:'system',content:system},{role:'user',content:prepared.job.prompt.user}]))fail('mapped_messages_changed');
      const payload={model:MODEL.id,messages:input.messages,temperature:input.temperature,seed:input.seed,stream:false,max_tokens:1024,
        chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:{name:'society_turn',schema:cloned.job.outputContract.jsonSchema,strict:true}}};
      return{...cloned,id:`${prepared.job.jobId}:progress:${variant}`,actor:c.nextSpeaker,pair,variant,index,nowMs,payload,
        beforeHash:sceneHash(scene),reservedCalls:1,outputTokenLimit:1024,
        promptBytes:Buffer.byteLength(JSON.stringify(payload)),
        historicPromptBytes:Buffer.byteLength(JSON.stringify({messages:payload.messages,response_format:payload.response_format}))};
    });
    if(jobs.some(job=>job.promptBytes>POLICY.maxPromptBytes))fail('prepared_context_exceeds_policy');
    const withoutSystem=job=>({...job.payload,messages:job.payload.messages.filter(m=>m.role!=='system')});
    if(hash(withoutSystem(jobs[0]))!==hash(withoutSystem(jobs[1]))||hash(jobs[0].turn)!==hash(jobs[1].turn))fail('paired_non_system_difference');
    return{pair,index,conversationId:c.id,actor:c.nextSpeaker,source:scene,jobs};
  });
  return{cases,epochMs:bundle.core.exportedAtMs,worldRevision:verified.worldRevision,generation,sequenceStart};
}
// This receiver is intentionally local to this new policy: do not reinterpret
// historical ledgers by changing the shared V7 receiver's size or call limits.
export async function receiveProgress(job,ledger,persist,dispatch,parse,{beforeReserve=async()=>{},measure=()=>null}={}){
  if(ledger.entries.some(row=>row.id===job.id))fail('dispatch_id_already_spent');
  if(ledger.entries.length>=POLICY.maxCalls)fail('total_call_cap');
  const bytes=Buffer.byteLength(JSON.stringify(job.payload));
  if(job.promptBytes!==bytes)fail('prompt_byte_count_changed');
  const overflow=bytes>POLICY.maxPromptBytes;
  if(!overflow)await beforeReserve(job);
  const row={kind:'cognition',id:job.id,job,state:overflow?'skipped':'reserved',reservedCalls:overflow?0:1,
    startedAt:new Date().toISOString(),processSamples:[],...(overflow?{errorCode:'context_overflow'}:{})};
  ledger.entries.push(row);await persist(ledger);
  if(overflow)return row;
  const sample=()=>{const value=measure();if(value)row.processSamples.push(value);};
  sample();const timer=setInterval(sample,1000),started=performance.now();
  try{
    const received=await dispatch(job);
    row.httpStatus=received.status;row.headers=received.headers??{};row.rawResponse=received.text;
    if(!Number.isSafeInteger(received.status)||received.status<200||received.status>=300){row.state='failed';row.errorCode=`http_${received.status}`;}
    else{row.response=JSON.parse(row.rawResponse);row.receipt=decodedReceipt(row.response,parse,row.headers);row.state='completed';}
  }catch(error){row.state=['AbortError','TimeoutError'].includes(error?.name)?'timeout':'failed';row.errorCode='local_transport_or_invalid_response';}
  finally{clearInterval(timer);sample();}
  row.latencyMs=Math.round(performance.now()-started);row.finishedAt=new Date().toISOString();
  await persist(ledger); // Raw bytes durable before domain application.
  return row;
}
export function applyCandidate(core,entry,row){
  const job=row.job,scene=structuredClone(entry.source),before=structuredClone(scene);
  if(row.state!=='skipped')scene.state=core.markSocietyAttempt(scene.state,job.actor,job.nowMs);
  const refused=code=>({ok:false,code,afterHash:sceneHash(scene),messages:[],operations:{},physicalWatches:0});
  if(row.state!=='completed')return refused(row.state);
  if(row.response?.model!==MODEL.id)return refused('unexpected_response_model');
  if(row.receipt.receiptCode||row.receipt.schemaFallbackWarning)return refused(row.receipt.receiptCode??'schema_fallback_warning');
  if(!z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(row.receipt.output).success)return refused('supplied_schema_violation');
  const r=core.applyRecordCapabilityChoice(scene.state,scene.world,job.turn,row.receipt.output,{nowMs:job.nowMs+1,generation:job.turn.generation});
  scene.state=r.state;scene.world=r.world;
  if(!core.parseSocietyState(scene.state).ok)fail('invalid_result_state');
  if(scene.world.day!==before.world.day||scene.world.watch!==before.world.watch)fail('physical_clock_changed');
  const ledger=scene.world.economy.ledger;
  if(Math.abs(core.totalCells(scene.world)-(ledger.initialCells+ledger.minted-ledger.burned-ledger.leaked))>1e-7)fail('money_invariant');
  if(!r.ok)return refused(r.code);
  const duplicate=core.applyRecordCapabilityChoice(scene.state,scene.world,job.turn,row.receipt.output,{nowMs:job.nowMs+2,generation:job.turn.generation});
  if(duplicate.code!=='already_applied'||sceneHash(duplicate)!==sceneHash(scene))fail('non_idempotent');
  const newItems=(after,old)=>after.filter(x=>!old.some(o=>o.id===x.id));
  const messages=core.societyPublicView(scene.state).conversations.flatMap(c=>c.turns.filter(t=>!before.state.conversations
    .find(old=>old.id===c.id)?.turns.some(old=>old.id===t.id)).map(t=>({conversationId:c.id,id:t.id,speaker:t.speaker,text:t.text,atMs:t.atMs})));
  const a=scene.state.records,b=before.state.records;
  return{ok:true,code:r.code,afterHash:sceneHash(scene),messages,physicalWatches:0,
    operations:{drafts:newItems(a.drafts,b.drafts).length,shares:newItems(a.shares,b.shares).length,
      publications:newItems(a.publications,b.publications).length,recordOffers:newItems(a.offers,b.offers).length,
      recordAgreements:newItems(a.agreements,b.agreements).length,offers:newItems(scene.state.offers,before.state.offers).length,
      agreements:newItems(scene.state.agreements,before.state.agreements).length,
      conversationsClosed:scene.state.conversations.filter(c=>c.status==='closed'&&before.state.conversations.find(o=>o.id===c.id)?.status==='open').length,
      economicEvents:scene.world.economy.nextEventSequence-before.world.economy.nextEventSequence}};
}
export function verifyLedger(core,ledger,config,selection){
  if(ledger.binding!==hash(config)||hash(ledger.config)!==hash(config)||!Array.isArray(ledger.entries)||ledger.entries.length>8)fail('ledger_binding_or_cap');
  const jobs=selection.cases.flatMap(c=>c.jobs),ids=new Set();
  for(const [i,row] of ledger.entries.entries()){
    if(ids.has(row.id)||row.kind!=='cognition'||row.id!==row.job?.id||hash(row.job)!==hash(jobs[i])
      ||!['reserved','completed','failed','timeout','skipped'].includes(row.state)||row.reservedCalls!==(row.state==='skipped'?0:1))fail('ledger_job_or_id_changed');
    ids.add(row.id);
    if(row.state==='completed'){
      if(hash(JSON.parse(row.rawResponse))!==hash(row.response)||hash(decodedReceipt(row.response,core.parseStructuredPayload,row.headers))!==hash(row.receipt))fail('receipt_changed');
    }else if(row.application?.ok)fail('unknown_applied');
  }
}
export async function runEvaluation(core,selection,ledger,{maxNewCalls=1,persist=async()=>{},dispatch,beforeReserve,measure,afterReceipt}={}){
  if(!Number.isSafeInteger(maxNewCalls)||maxNewCalls<0||maxNewCalls>8)fail('call_cap');
  let newCalls=0,cursor=0;const results=[];
  for(const entry of selection.cases)for(const job of entry.jobs){
    let row=ledger.entries[cursor];
    if(row){if(hash(row.job)!==hash(job))fail('replay_job_changed');}
    else{
      if(newCalls>=maxNewCalls)return{newCalls,stopped:'call_limit',results};
      if(ledger.entries.length>=8)fail('total_call_cap');
      row=await receiveProgress(job,ledger,persist,dispatch,core.parseStructuredPayload,{beforeReserve,measure});
      if(row.state!=='skipped')newCalls++;
      if(afterReceipt)await afterReceipt(row);
    }
    const application=applyCandidate(core,entry,row);
    if(row.application&&hash(row.application)!==hash(application))fail('replay_effect_changed');
    if(!row.application&&maxNewCalls>0){row.application=application;await persist(ledger);}
    results.push({pair:entry.pair,variant:job.variant,actor:job.actor,application});cursor++;
  }
  if(cursor!==ledger.entries.length)fail('unreplayed_rows');
  return{newCalls,stopped:'all_eight_cases_processed',results};
}
export function publicPlan(config,selection){return{policy:POLICY,model:MODEL.id,backupSha256:config.backupSha256,
  sourceManifestSha256:hash(config.source),worldRevision:selection.worldRevision,epochMs:selection.epochMs,
  cases:selection.cases.map(c=>({pair:c.pair,conversationId:c.conversationId,nextSpeaker:c.actor,beforeHash:sceneHash(c.source),
    jobs:c.jobs.map(j=>({id:j.id,variant:j.variant,jobHash:hash(j),systemHash:hash(j.job.prompt.system),userHash:hash(j.job.prompt.user),
      schemaHash:hash(j.job.outputContract.jsonSchema),seed:j.payload.seed,promptBytes:j.promptBytes,historicPromptBytes:j.historicPromptBytes,exceedsHistoricReceiver:j.historicPromptBytes>24576}))})),httpRequests:0,
  privacy:'Full state, prompts, outputs, source bundle and ledger stay outside Git. Public speech comes only from the authoritative projection.'};}
export function publicReport(ledger,run){return{...run,policy:POLICY,productionWrites:0,cloudRequests:0,physicalWatches:0,
  usage:ledger.entries.map(row=>({pair:row.job.pair,variant:row.job.variant,actor:row.job.actor,state:row.state,
    reservedCalls:row.reservedCalls,modelMatched:row.response?.model===MODEL.id,usageComplete:row.receipt?.usageComplete??false,
    tokens:Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].map(k=>[k,Number.isSafeInteger(row.response?.usage?.[k])&&row.response.usage[k]>=0?row.response.usage[k]:null])),
    latencyMs:row.latencyMs??null})),privateEvidenceRetained:true};}
export function parseArgs(args){
  const o={mode:'plan',out:null,recovery:null,pid:null,maxNewCalls:1},seen=new Set();
  for(let i=0;i<args.length;i++){const k=args[i];if(seen.has(k))fail('duplicate_arg');seen.add(k);
    if(k==='--prepare'||k==='--run'){if(o.mode!=='plan')fail('multiple_modes');o.mode=k.slice(2);}
    else if(['--private-out','--recovery'].includes(k)&&isAbsolute(args[i+1]??''))o[k==='--private-out'?'out':'recovery']=args[++i];
    else if(['--server-pid','--max-new-calls'].includes(k)&&/^\d+$/.test(args[i+1]??''))o[k==='--server-pid'?'pid':'maxNewCalls']=Number(args[++i]);
    else fail('invalid_arg');
  }
  if(!Number.isSafeInteger(o.maxNewCalls)||o.maxNewCalls<0||o.maxNewCalls>8)fail('call_cap');
  if((o.mode!=='plan'&&!o.out)||(o.mode==='prepare'&&!o.recovery)||(o.mode==='run'&&o.maxNewCalls>0&&!o.pid))fail('missing_path_or_server');
  return o;
}
async function verifyServer(pid,provenance){
  if(!processSample(pid)?.command.endsWith('omlx-server'))fail('not_owned_model_server');
  const listener=spawnSync('/usr/sbin/lsof',['-nP','-a','-p',String(pid),'-iTCP:8018','-sTCP:LISTEN'],{encoding:'utf8'});
  if(listener.status!==0||!listener.stdout.includes('127.0.0.1:8018 (LISTEN)'))fail('wrong_loopback_server');
  await verifyModelProvenance(provenance);
}
export async function main(args=process.argv.slice(2)){
  const options=parseArgs(args);if(options.mode==='plan'){console.log(JSON.stringify({mode:'offline',policy:POLICY,httpRequests:0,credentialReads:0}));return;}
  const out=await privateDirectory(options.out),core=await loadCore();
  try{
    if(options.mode==='prepare'){
      const backupBytes=await readFile(options.recovery),selection=prepareCases(core,JSON.parse(backupBytes));
      const provenanceBytes=await readFile(join(ROOT,PROVENANCE)),provenance=JSON.parse(provenanceBytes).config.modelProvenance;
      await verifyModelProvenance(provenance);await core.verifySources();
      const config={policy:POLICY,model:MODEL,source:core.sourceFiles,backupPath:options.recovery,backupSha256:hash(backupBytes),
        modelProvenance:provenance,provenanceSource:{path:PROVENANCE,sha256:hash(provenanceBytes)},selectionHash:hash(selection)};
      const serial={...selection,cases:selection.cases.map(c=>({...c,source:{state:c.source.state,worldJson:core.serializeWorldState(c.source.world),worldRevision:c.source.worldRevision}}))};
      await mkdir(out,{mode:0o700});
      await atomicJson(join(out,'source-bundle.json'),await captureSourceBundle(core.sourceFiles));
      await atomicJson(join(out,'private-cases.json'),serial);
      await atomicJson(join(out,'ledger.json'),{config,binding:hash(config),entries:[]});
      const plan=publicPlan(config,selection);await atomicJson(join(out,'public-plan.json'),plan);console.log(JSON.stringify(plan,null,2));return;
    }
    // A zero-call replay makes no file at all, including no lock or report.
    const lock=options.maxNewCalls>0?await open(join(out,'.lock'),'wx',0o600):null;
    try{
      const original=await readFile(join(out,'ledger.json')),ledger=JSON.parse(original),config=ledger.config;
      if(hash(config.policy)!==hash(POLICY)||hash(config.model)!==hash(MODEL)||hash(config.source)!==hash(core.sourceFiles))fail('frozen_configuration_changed');
      verifySourceBundle(JSON.parse(await readFile(join(out,'source-bundle.json'))),config.source);
      const raw=JSON.parse(await readFile(join(out,'private-cases.json'))),selection={...raw,cases:raw.cases.map(c=>({...c,source:{state:c.source.state,
        world:core.deserializeWorldState(c.source.worldJson),worldRevision:c.source.worldRevision}}))};
      if(hash(selection)!==config.selectionHash||hash(await readFile(config.backupPath))!==config.backupSha256)fail('source_scene_changed');
      verifyLedger(core,ledger,config,selection);
      const run=await runEvaluation(core,selection,ledger,{maxNewCalls:options.maxNewCalls,persist:l=>atomicJson(join(out,'ledger.json'),l),
        measure:()=>options.pid?processSample(options.pid):null,beforeReserve:async()=>{
          await core.verifySources();await verifyServer(options.pid,config.modelProvenance);
          if(hash(await readFile(config.backupPath))!==config.backupSha256)fail('backup_changed');},
        dispatch:async job=>{const r=await fetch(POLICY.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(POLICY.timeoutMs),
          headers:{'content-type':'application/json'},body:JSON.stringify(job.payload)});
          return{status:r.status,text:await responseText(r),headers:Object.fromEntries(['warning','content-type','server'].map(k=>[k,r.headers.get(k)]).filter(([,v])=>v!==null))};}});
      verifyLedger(core,ledger,config,selection);await core.verifySources();
      if(options.maxNewCalls===0&&hash(await readFile(join(out,'ledger.json')))!==hash(original))fail('readonly_replay_ledger_changed');
      const report=publicReport(ledger,run);if(options.maxNewCalls>0)await atomicJson(join(out,'public-report.json'),report);
      console.log(JSON.stringify(report,null,2));
    }finally{if(lock){await lock.close();await unlink(join(out,'.lock'));}}
  }finally{await core.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('private_progress_evaluation_failed');process.exitCode=1;});
