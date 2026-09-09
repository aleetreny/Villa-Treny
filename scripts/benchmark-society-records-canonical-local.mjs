#!/usr/bin/env node
// Private, offline-first P6 evaluation. --prepare writes a plan; --run is a
// separately authorized operation against our owned loopback server only.
import {readFile,mkdir,open,unlink,realpath,stat,lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dirname,isAbsolute,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {z} from 'zod';
import {sourceManifest as baseManifest,loadCore as baseCore,captureSourceBundle,verifySourceBundle,
  receive,decodedReceipt,processSample,MODEL,hash} from './benchmark-society-runtime-v7-local.mjs';
import {atomicJson,responseText} from './benchmark-society-models.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PROVENANCE='docs/research/model-society-ordered-choice-local-2026-09-08/ledger.json';
export const POLICY=Object.freeze({version:1,protocol:6,maxCalls:12,turnsPerConversation:3,physicalWatchesPerClone:1,
  maxPromptBytes:24576,maxOutputTokens:1024,thinking:false,timeoutMs:120000,turnIntervalMs:180000,
  endpoint:'http://127.0.0.1:8018/v1/chat/completions',pairs:['CN','AU','BK','TY'],
  scope:'Four independent clones of one verified canonical recovery. Actual next speaker, no planted dialogue, no production writes.',
  negativeCase:'TY currently concerns a harvest forecast, not a request to write. No document is required.'});
class EvaluationError extends Error { constructor(code){super(code);this.code=code;} }
const fail=code=>{throw new EvaluationError(code);};
const sceneHash=s=>hash({state:s.state,world:s.world});
const extras=['scripts/benchmark-society-records-canonical-local.mjs','workers/habitat-runtime/src/checkpoint.ts',
  'workers/habitat-runtime/src/recovery.ts','workers/habitat-runtime/src/domain.ts','workers/habitat-runtime/src/rejection-log.ts'];
export async function sourceManifest(){
  const files=await baseManifest(),paths=[...new Set([...files.map(f=>f.path),...extras])].sort();
  return Promise.all(paths.map(async path=>({path,sha256:hash(await readFile(join(ROOT,path)))})));
}
export async function loadCore(){
  const sourceFiles=await sourceManifest(),base=await baseCore();
  const server=await createServer({root:ROOT,configFile:false,appType:'custom',logLevel:'silent',
    server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
  try{
    const modules=await Promise.all(['/workers/habitat-runtime/src/checkpoint.ts','/workers/habitat-runtime/src/domain.ts','/workers/habitat-runtime/src/recovery.ts',
      '/src/lib/habitat/society/record-choice.ts','/src/lib/habitat/society/record-watch.ts','/src/lib/habitat/society/records.ts'].map(p=>server.ssrLoadModule(p)));
    const verifySources=async()=>{if(hash(await sourceManifest())!==hash(sourceFiles))fail('sources_changed');};
    await verifySources();return{...base,...Object.assign({},...modules),sourceFiles,verifySources,
      close:async()=>{try{await server.close();}finally{await base.close();}}};
  }catch(e){await server.close();await base.close();throw e;}
}

export function selectScenes(core,bundle){
  const v=core.verifyRecoveryBundle(bundle.core,bundle.pages??[]),parsed=core.parseSocietyState(JSON.parse(v.tables.society_state[0].state_json));
  if(!parsed.ok)fail('invalid_society');
  const state=parsed.state,epochMs=bundle.core.exportedAtMs;
  const sequenceStart=Math.max(-1,...Object.values(state.minds).map(m=>m.lastAppliedSequence),
    ...(v.tables.cognition_contexts??[]).map(r=>r.sequence).filter(Number.isSafeInteger))+1;
  const scenes=POLICY.pairs.map((pair,index)=>{
    const c=state.conversations.find(c=>[...c.participants].sort().join('')===pair&&c.status==='open'&&c.expiresAtMs>epochMs&&c.nextSpeaker);
    const publicConversation=core.societyPublicView(state).conversations.find(shown=>shown.id===c?.id);
    return{pair,index,conversationId:c?.id??null,initialNextSpeaker:c?.nextSpeaker??null,
      source:{state:structuredClone(state),world:structuredClone(v.world),worldRevision:v.worldRevision},
      initialMessages:publicConversation?.turns.slice(-2).map(t=>({id:t.id,speaker:t.speaker,text:t.text,atMs:t.atMs}))??[]};
  });
  return{scenes,epochMs,sequenceStart,generation:v.runtime.control_revision,
    nextPhysicalAtMs:v.runtime.next_watch_at_ms,worldRevision:v.worldRevision,
    sourceSchemaVersion:Math.max(...v.tables._sql_schema_migrations.map(r=>r.version)),
    migration:'Current strict reader initializes records empty if the captured society is version1; no records are seeded from old claims.'};
}
export function buildJob(core,selection,branch,scene,index){
  const c=scene.state.conversations.find(c=>c.id===branch.conversationId);
  const ordinal=branch.index*POLICY.turnsPerConversation+index,nowMs=selection.epochMs+(ordinal+1)*POLICY.turnIntervalMs;
  if(!c||c.status!=='open'||!c.nextSpeaker||c.expiresAtMs<=nowMs)return null;
  const actor=c.nextSpeaker,sequence=selection.sequenceStart+ordinal;
  const prepared=core.prepareSocietyJob({state:scene.state,world:scene.world,actor,sequence,nowMs,
    generation:selection.generation,worldRevision:scene.worldRevision,habitatId:'isolated-records-canonical-v1',protocolVersion:6});
  if(prepared.turn.conversation?.id!==branch.conversationId)return null;
  const input=core.workersAIInput(prepared.job,core.GEMMA_WORKERS_AI_MODEL);
  const payload={model:MODEL.id,messages:input.messages,temperature:input.temperature,seed:input.seed,stream:false,
    max_tokens:1024,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:{
      name:'society_turn',schema:prepared.job.outputContract.jsonSchema,strict:true}}};
  if(prepared.job.outputContract.version!==6||prepared.job.maxOutputTokens!==1024)fail('protocol_changed');
  return{id:prepared.job.jobId,actor,pair:branch.pair,index,ordinal,nowMs,...prepared,payload,
    beforeHash:sceneHash(scene),reservedCalls:1,outputTokenLimit:1024,
    promptBytes:Buffer.byteLength(JSON.stringify({messages:payload.messages,response_format:payload.response_format}))};
}
function apply(core,scene,job,row){
  // An unresolved reservation stays spent; marking the opportunity does not
  // claim that the provider completed it, and cannot create speech or records.
  if(row.state!=='skipped')scene.state=core.markSocietyAttempt(scene.state,job.actor,job.nowMs);
  if(row.state!=='completed')return{ok:false,code:row.state,afterHash:sceneHash(scene)};
  if(row.receipt.receiptCode||row.receipt.schemaFallbackWarning)return{ok:false,
    code:row.receipt.receiptCode??'schema_fallback_warning',afterHash:sceneHash(scene)};
  if(!z.fromJSONSchema(job.job.outputContract.jsonSchema).safeParse(row.receipt.output).success)
    return{ok:false,code:'supplied_schema_violation',afterHash:sceneHash(scene)};
  const before=structuredClone(scene);
  const r=core.applyRecordCapabilityChoice(scene.state,scene.world,job.turn,row.receipt.output,
    {nowMs:job.nowMs+1,generation:job.turn.generation});
  scene.state=r.state;scene.world=r.world;if(hash(before.world)!==hash(scene.world))scene.worldRevision++;
  if(!core.parseSocietyState(scene.state).ok)fail('invalid_result_state');
  if(r.ok){const duplicate=core.applyRecordCapabilityChoice(r.state,r.world,job.turn,row.receipt.output,
    {nowMs:job.nowMs+2,generation:job.turn.generation});
    if(duplicate.code!=='already_applied'||sceneHash(duplicate)!==sceneHash(scene))fail('non_idempotent_result');}
  const messages=core.societyPublicView(scene.state).conversations.flatMap(c=>c.turns.filter(t=>!before.state.conversations
    .find(old=>old.id===c.id)?.turns.some(old=>old.id===t.id)).map(t=>({conversationId:c.id,id:t.id,speaker:t.speaker,text:t.text,atMs:t.atMs})));
  return{ok:r.ok,code:r.code,afterHash:sceneHash(scene),messages,
    recordsCreated:scene.state.records.drafts.filter(d=>!before.state.records.drafts.some(old=>old.id===d.id)).length,
    recordOffersCreated:scene.state.records.offers.filter(o=>!before.state.records.offers.some(old=>old.id===o.id)).length,
    recordAgreementsCreated:scene.state.records.agreements.filter(a=>!before.state.records.agreements.some(old=>old.id===a.id)).length,
    publicRecords:core.publicRecordView(scene.state.records)};
}
export function verifyLedger(core,ledger,config){
  if(ledger.binding!==hash(config)||hash(ledger.config)!==hash(config)||!Array.isArray(ledger.entries)
    ||ledger.entries.length>POLICY.maxCalls)fail('ledger_binding_or_cap');
  const ids=new Set();
  for(const row of ledger.entries){
    if(ids.has(row.id)||row.kind!=='cognition'||row.id!==row.job?.id||row.job.job.outputContract.version!==6
      ||!POLICY.pairs.includes(row.job.pair)||row.job.index<0||row.job.index>=3
      ||!['reserved','completed','failed','timeout','skipped'].includes(row.state)
      ||row.reservedCalls!==(row.state==='skipped'?0:1))fail('invalid_ledger_row');ids.add(row.id);
    if(row.state==='completed'){const response=JSON.parse(row.rawResponse);
      if(hash(response)!==hash(row.response)||hash(decodedReceipt(response,core.parseStructuredPayload,row.headers))!==hash(row.receipt))fail('receipt_changed');}
    else if(row.application?.ok)fail('unknown_applied');
  }
}
export async function runEvaluation(core,selection,ledger,{maxNewCalls=1,persist=async()=>{},dispatch,beforeReserve,measure,afterReceipt}={}){
  if(!Number.isInteger(maxNewCalls)||maxNewCalls<0||maxNewCalls>POLICY.maxCalls)fail('call_cap');
  let cursor=0,newCalls=0;const results=[];
  for(const branch of selection.scenes){
    const scene=structuredClone(branch.source);let stopped='three_turn_limit';
    for(let i=0;i<3;i++){
      const job=buildJob(core,selection,branch,scene,i);if(!job){stopped='no_legal_target_turn';break;}
      let row=ledger.entries[cursor];
      if(row){if(hash(row.job)!==hash(job))fail('replay_job_changed');}
      else{if(newCalls>=maxNewCalls)return{newCalls,stopped:'call_limit',branches:results};
        if(ledger.entries.length>=12)fail('total_call_cap');
        row=await receive(job,ledger,persist,dispatch,core.parseStructuredPayload,{beforeReserve,measure});
        if(row.state!=='skipped')newCalls++;
        if(afterReceipt)await afterReceipt(row);}
      cursor++;const a=apply(core,scene,job,row);
      if(row.application&&hash(row.application)!==hash(a))fail('replay_effect_changed');
      if(!row.application){row.application=a;await persist(ledger);}
      if(!a.ok){stopped='invalid_or_unknown_response';break;}
      const after=scene.state.conversations.find(c=>c.id===branch.conversationId);
      if(after?.nextSpeaker===job.actor){stopped='no_conversation_progress';break;}
    }
    const forecastAtMs=Math.max(selection.nextPhysicalAtMs??0,selection.epochMs+(POLICY.maxCalls+1)*POLICY.turnIntervalMs);
    const before=sceneHash(scene),oldEconomicSequence=scene.world.economy.nextEventSequence;
    const forecast=core.advanceSocietyWatch(scene.state,scene.world,forecastAtMs);
    if(!core.parseSocietyState(forecast.state).ok)fail('invalid_forecast_state');
    if(sceneHash(scene)!==before)fail('forecast_mutated_source');
    if(forecast.observations.length!==25||new Set(forecast.observations.map(o=>o.actor)).size!==25)fail('forecast_action_count');
    const ledgerMoney=forecast.world.economy.ledger;
    const expected=ledgerMoney.initialCells+ledgerMoney.minted-ledgerMoney.burned-ledgerMoney.leaked,actual=core.totalCells(forecast.world);
    if(Math.abs(expected-actual)>1e-7||Object.values(forecast.world.bodies).some(b=>b.cells<0))fail('forecast_money_invariant');
    const events=forecast.world.economy.events.filter(e=>e.sequence>=oldEconomicSequence&&e.action.startsWith('record-commission:'));
    const observed={pair:branch.pair,stopped,forecast:true,productionObservation:false,beforeHash:before,afterHash:sceneHash(forecast),
      physicalActions:forecast.observations.length,publicationActions:forecast.observations.filter(o=>o.kind==='record_publication').length,
      paidRecordCells:events.reduce((sum,e)=>sum+e.entries.filter(x=>x.account.startsWith('cells:')&&x.delta>0).reduce((a,x)=>a+x.delta,0),0),
      money:{conserved:true,expectedCells:expected,actualCells:actual},
      publicRecords:core.publicRecordView(forecast.state.records)};
    if(ledger.forecasts?.[branch.pair]&&hash(ledger.forecasts[branch.pair])!==hash(observed))fail('forecast_replay_changed');
    if(!ledger.forecasts?.[branch.pair]){ledger.forecasts??={};ledger.forecasts[branch.pair]=observed;await persist(ledger);}
    results.push(observed);
  }
  if(cursor!==ledger.entries.length)fail('unreplayed_rows');
  return{newCalls,stopped:'all_selected_branches_processed',branches:results};
}

function publicPlan(config,selection,firstJobs){return{protocol:6,policy:POLICY,model:MODEL.id,
  backupSha256:config.backupSha256,worldRevision:selection.worldRevision,sourceSchemaVersion:selection.sourceSchemaVersion,
  epochMs:selection.epochMs,sequenceStart:selection.sequenceStart,sourceManifestSha256:hash(config.source),
  branches:selection.scenes.map((s,i)=>({pair:s.pair,conversationId:s.conversationId,nextSpeaker:s.initialNextSpeaker,
    initialMessages:s.initialMessages,firstPromptBytes:firstJobs[i]?.promptBytes??null,firstJobSha256:firstJobs[i]?hash(firstJobs[i]):null})),
  migration:selection.migration,httpRequests:0,privateEvidence:'Full backup-derived states, prompts, receipts and source bundle remain in the private output directory.'};}
export function publicReport(ledger,run){return{...run,scope:POLICY.scope,usage:ledger.entries.map(r=>({pair:r.job.pair,actor:r.job.actor,state:r.state,
  usage:r.response?.usage?Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].map(k=>[k,
    Number.isSafeInteger(r.response.usage[k])&&r.response.usage[k]>=0?r.response.usage[k]:null])):null,
  latencyMs:r.latencyMs??null,application:r.application??null})),
  httpRequestsThisInvocation:run.newCalls,rawPrivate:true,productionWrites:0,cloudRequests:0};}
export async function privateDirectory(path){
  if(!isAbsolute(path??''))fail('absolute_private_directory_required');
  const parent=await realpath(dirname(path)),actual=join(parent,resolve(path).split(sep).at(-1));
  if(actual===ROOT||actual.startsWith(ROOT+sep))fail('private_output_inside_repository');
  try{const s=await lstat(actual);
    if(s.isSymbolicLink()||!s.isDirectory()||(s.mode&0o077)!==0)fail('unsafe_private_directory');
    const resolved=await realpath(actual);if(resolved===ROOT||resolved.startsWith(ROOT+sep))fail('private_output_inside_repository');
  }catch(e){if(e.code!=='ENOENT')throw e;}
  return actual;
}
async function verifyServer(pid,provenance){
  if(!processSample(pid)?.command.endsWith('omlx-server'))fail('not_owned_model_server');
  const listener=spawnSync('/usr/sbin/lsof',['-nP','-a','-p',String(pid),'-iTCP:8018','-sTCP:LISTEN'],{encoding:'utf8'});
  if(listener.status!==0||!listener.stdout.includes('127.0.0.1:8018 (LISTEN)'))fail('wrong_loopback_server');
  await verifyModelProvenance(provenance);
}
export async function verifyModelProvenance(provenance){
  for(const f of provenance.observedFiles){const path=join(MODEL.path,f.name),s=await stat(path);
    if(s.size!==f.bytes||s.ino!==f.inode||s.mtimeMs!==f.mtimeMs||s.ctimeMs!==f.ctimeMs)fail('model_file_changed');
    if(!f.name.endsWith('.safetensors')&&hash(await readFile(path))!==f.sha256)fail('model_metadata_changed');}
  for(const f of provenance.serverSources)if(hash(await readFile(join('/Applications/oMLX.app/Contents/Resources/omlx',f.name)))!==f.sha256)fail('server_source_changed');
}
export function parseArgs(args){
  const o={mode:'plan',out:null,recovery:null,pid:null,maxNewCalls:1},seen=new Set();
  for(let i=0;i<args.length;i++){const k=args[i];if(seen.has(k))fail('duplicate_arg');seen.add(k);
    if(k==='--prepare'||k==='--run'){if(o.mode!=='plan')fail('multiple_modes');o.mode=k.slice(2);}
    else if(['--private-out','--recovery'].includes(k)&&isAbsolute(args[i+1]??''))o[k==='--private-out'?'out':'recovery']=args[++i];
    else if(['--server-pid','--max-new-calls'].includes(k)&&/^\d+$/.test(args[i+1]??''))o[k==='--server-pid'?'pid':'maxNewCalls']=Number(args[++i]);
    else fail('invalid_arg');}
  if(o.maxNewCalls>12||!Number.isSafeInteger(o.maxNewCalls))fail('call_cap');
  if(o.mode!=='plan'&&!o.out||o.mode==='prepare'&&!o.recovery||o.mode==='run'&&o.maxNewCalls>0&&!o.pid)fail('missing_path_or_server');
  return o;
}
export async function main(args=process.argv.slice(2)){
  const options=parseArgs(args);if(options.mode==='plan'){console.log(JSON.stringify({mode:'offline',policy:POLICY,httpRequests:0}));return;}
  const out=await privateDirectory(options.out),core=await loadCore();
  try{
    if(options.mode==='prepare'){
      const backupBytes=await readFile(options.recovery),bundle=JSON.parse(backupBytes),selection=selectScenes(core,bundle);
      const provenanceBytes=await readFile(join(ROOT,PROVENANCE)),provenance=JSON.parse(provenanceBytes).config.modelProvenance;
      await verifyModelProvenance(provenance);
      const firstJobs=selection.scenes.map(s=>buildJob(core,selection,s,s.source,0));
      const config={policy:POLICY,model:MODEL,backupPath:options.recovery,backupSha256:hash(backupBytes),source:core.sourceFiles,
        modelProvenance:provenance,provenanceSource:{path:PROVENANCE,sha256:hash(provenanceBytes)},selectionHash:hash(selection),firstJobs:firstJobs.map(j=>j?hash(j):null)};
      await core.verifySources();await mkdir(out,{mode:0o700});
      await atomicJson(join(out,'source-bundle.json'),await captureSourceBundle(core.sourceFiles));
      const serial={...selection,scenes:selection.scenes.map(s=>({...s,source:{state:s.source.state,
        worldJson:core.serializeWorldState(s.source.world),worldRevision:s.source.worldRevision}}))};
      await atomicJson(join(out,'private-scenes.json'),serial);
      await atomicJson(join(out,'ledger.json'),{config,binding:hash(config),entries:[],forecasts:{}});
      const plan=publicPlan(config,selection,firstJobs);await atomicJson(join(out,'public-plan.json'),plan);
      console.log(JSON.stringify(plan,null,2));return;
    }
    const lock=await open(join(out,'.lock'),'wx',0o600);
    try{
      const ledger=JSON.parse(await readFile(join(out,'ledger.json'))),config=ledger.config;
      if(hash(config.policy)!==hash(POLICY)||hash(config.model)!==hash(MODEL)||hash(core.sourceFiles)!==hash(config.source))fail('frozen_configuration_changed');
      const source=JSON.parse(await readFile(join(out,'source-bundle.json')));verifySourceBundle(source,config.source);
      const raw=JSON.parse(await readFile(join(out,'private-scenes.json'))),selection={...raw,scenes:raw.scenes.map(s=>({...s,
        source:{state:s.source.state,world:core.deserializeWorldState(s.source.worldJson),worldRevision:s.source.worldRevision}}))};
      if(hash(selection)!==config.selectionHash||hash(await readFile(config.backupPath))!==config.backupSha256)fail('source_scene_changed');
      verifyLedger(core,ledger,config);
      const run=await runEvaluation(core,selection,ledger,{maxNewCalls:options.maxNewCalls,
        persist:l=>atomicJson(join(out,'ledger.json'),l),measure:()=>options.pid?processSample(options.pid):null,
        beforeReserve:async()=>{await core.verifySources();await verifyServer(options.pid,config.modelProvenance);
          if(hash(await readFile(config.backupPath))!==config.backupSha256)fail('backup_changed');},
        dispatch:async job=>{const r=await fetch(POLICY.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(POLICY.timeoutMs),
          headers:{'content-type':'application/json'},body:JSON.stringify(job.payload)});
          return{status:r.status,text:await responseText(r),headers:Object.fromEntries(['warning','content-type','server']
            .map(k=>[k,r.headers.get(k)]).filter(([,v])=>v!==null))};}});
      verifyLedger(core,ledger,config);await core.verifySources();
      const report=publicReport(ledger,run);
      if(options.maxNewCalls>0)await atomicJson(join(out,'public-report.json'),report);
      console.log(JSON.stringify(report,null,2));
    }finally{await lock.close();await unlink(join(out,'.lock'));}
  }finally{await core.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{
  console.error(e instanceof EvaluationError?e.code:'private_evaluation_failed');process.exitCode=1;
});
