#!/usr/bin/env node
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'vite';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const LOCAL=resolve(ROOT,'.local/daily-debate');
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
async function read(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function atomic(path,value){const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(tmp,path);}
export function options(args){
 const allowed=new Set(['--live','--date','--run','--model','--production-acceptance','--questions-only']);const result={live:false,date:new Date().toISOString().slice(0,10),run:'evaluation',model:'gemini-3.5-flash-lite',acceptance:false,questionsOnly:false};
 for(let i=0;i<args.length;i++){const key=args[i];if(!allowed.has(key))throw new Error('unknown_argument');if(key==='--live')result.live=true;else if(key==='--production-acceptance')result.acceptance=true;else if(key==='--questions-only')result.questionsOnly=true;else {const value=args[++i];if(!value||value.startsWith('--'))throw new Error('missing_argument');result[key.slice(2)]=value;}}
 if(!['gemini-3.5-flash-lite','gemini-3.8-flash'].includes(result.model)||!/^\d{4}-\d{2}-\d{2}$/.test(result.date)||!/^[-a-z0-9]{1,50}$/.test(result.run))throw new Error('invalid_argument');
 if(result.model==='gemini-3.8-flash'&&(!result.acceptance||result.questionsOnly||result.date!==new Date().toISOString().slice(0,10)))throw new Error('flash_requires_current_daily_acceptance');return result;
}
export async function main(args){
 const opt=options(args);if(!opt.live){console.log(JSON.stringify({mode:'plan',...opt,calls:0,baseline:15,maxPerEdition:20,liteDailyCap:300,flashDailyCap:20,priorPilotIncluded:true}));return;}
 if(!process.env.GEMINI_API_KEY)throw new Error('missing_GEMINI_API_KEY');await mkdir(LOCAL,{recursive:true,mode:0o700});
 // Shared lock with the original pilot; both spend the same project quota.
 const lockPath=resolve(ROOT,'.local/gemini-debate/pilot.lock');await mkdir(dirname(lockPath),{recursive:true,mode:0o700});const lock=await open(lockPath,'wx',0o600);
 let server;try{
 await lock.writeFile(JSON.stringify({pid:process.pid,at:Date.now(),task:'official-daily-debate'}));
 server=await createServer({root:ROOT,configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
 const [core,provider,budgetRules]=await Promise.all([server.ssrLoadModule('/workers/habitat-runtime/src/debate/daily.ts'),server.ssrLoadModule('/workers/habitat-runtime/src/providers/gemini.ts'),server.ssrLoadModule('/workers/habitat-runtime/src/debate/budget.ts')]);
 const out=resolve(LOCAL,opt.run+'-'+opt.date);await mkdir(out,{recursive:true,mode:0o700});
 const paths=['workers/habitat-runtime/src/debate/daily.ts','workers/habitat-runtime/src/debate/daily-prompts.ts','workers/habitat-runtime/src/debate/budget.ts','workers/habitat-runtime/src/providers/gemini.ts','src/lib/debate/characters.ts','src/lib/debate/contracts.ts','src/lib/habitat/residents.ts','scripts/run-daily-debate.mjs'];
 const sources=await Promise.all(paths.map(async path=>{const content=await readFile(resolve(ROOT,path),'utf8');return {path,sha256:hash(content),content};}));
 let receipt=await read(resolve(out,'receipt.json'),null);
 if(receipt&&JSON.stringify(receipt.sources)!==JSON.stringify(sources.map(({path,sha256})=>({path,sha256}))))throw new Error('source_changed_use_new_run');
 if(!receipt){receipt={startedAt:Date.now(),model:opt.model,date:opt.date,acceptance:opt.acceptance,sources:sources.map(({path,sha256})=>({path,sha256})),attempts:[]};for(const src of sources){const dest=resolve(out,'source',src.path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,src.content,{mode:0o600});}await atomic(resolve(out,'receipt.json'),receipt);}
 let day=await read(resolve(out,'day.json'),null)??core.newDebate(opt.date,opt.model,Date.now());
 if(day.model!==opt.model)throw new Error('model_mismatch');
 const ledgerPath=resolve(LOCAL,'budget.json');let ledger=await read(ledgerPath,{version:1,attempts:[]});
 const prior=await read(resolve(ROOT,'.local/gemini-debate/budget.json'),{attempts:[]});
 const history=await read(resolve(LOCAL,'history.json'),[]);
 console.log('Output: '+out);
 for(;;){
  const task=core.nextDailyTask(day,history);if(!task||(opt.questionsOnly&&day.case))break;
  const unfinished=receipt.attempts.find(a=>!a.applied);
  if(unfinished&&unfinished.task!==task.id){if(!day.attempts[unfinished.task])throw new Error('checkpoint_task_mismatch');unfinished.applied=true;await atomic(resolve(out,'receipt.json'),receipt);continue;}
  if(unfinished){const saved=await read(resolve(out,unfinished.id+'.json'),null);const r=saved?.result??budgetRules.unknownResult(opt.model);day=core.applyDailyResult(day,task,r,history,Date.now()).day;unfinished.applied=true;await atomic(resolve(out,'day.json'),day);await atomic(resolve(out,'receipt.json'),receipt);continue;}
  if(receipt.attempts.length>=20)throw new Error('edition_budget_exhausted');
  const now=Date.now(),past=ledger.attempts.filter(a=>a.model===opt.model).concat(opt.model==='gemini-3.5-flash-lite'?prior.attempts.map(a=>({...a,model:opt.model})):[]);
  if(past.filter(a=>budgetRules.quotaDate(a.atMs)===budgetRules.quotaDate(now)).length>=budgetRules.modelDailyCap(opt.model))throw new Error('daily_quota_exhausted');
  const recent=past.filter(a=>a.atMs>now-60000).sort((a,b)=>a.atMs-b.atMs);
  const wait=Math.max(day.nextAttemptAt??0,recent.length>=3?recent.at(-3).atMs+61000:0)-now;
  if(wait>300000)throw new Error('long_provider_cooldown_resume_later');if(wait>0){await sleep(Math.min(wait,60000));continue;}
  const request=provider.geminiRequestBody(task.prompt),attempt={id:randomUUID(),task:task.id,atMs:Date.now(),model:opt.model,requestSha256:hash(request),applied:false};
  ledger.attempts.push({id:attempt.id,atMs:attempt.atMs,model:opt.model,run:opt.run});await atomic(ledgerPath,ledger);
  receipt.attempts.push(attempt);await atomic(resolve(out,'receipt.json'),receipt);await atomic(resolve(out,attempt.id+'.json'),{task,pending:true});
  const result=await provider.runGemini({apiKey:process.env.GEMINI_API_KEY,prompt:task.prompt,model:opt.model,timeoutMs:150000});
  await atomic(resolve(out,attempt.id+'.json'),{task,result});
  const transition=core.applyDailyResult(day,task,result,history,Date.now());day=transition.day;attempt.applied=true;attempt.code=result.code;attempt.issues=transition.issues;
  await atomic(resolve(out,'day.json'),day);await atomic(resolve(out,'receipt.json'),receipt);
  console.log(`${task.id}: ${result.code}; ${transition.accepted?'accepted':transition.issues.join(',')}; tokens ${result.usage.totalTokens??'unknown'}`);
 }
 if(day.status==='complete')core.verifyCompletedDay(day);
 const publicDay=core.publicDay(day,0);await atomic(resolve(out,'public.json'),publicDay);
 const report=[`# ${day.case?.title??'Unpublished debate'}`,'',`Model: ${day.model}. Status: ${day.status}. Actual attempts: ${receipt.attempts.length}.`,'',day.case?.context??'', '',day.case?.question??'',...day.posts.flatMap(p=>['',`## ${day.characters.find(c=>c.id===p.author).name} · round ${p.round}`,'',...(p.quote?['> '+p.quote,'']:[]),p.body]),'', '## Summary','',day.summary?.overview??'Not yet generated.'];
 await writeFile(resolve(out,'read.md'),report.join('\n'),{mode:0o600});
 const usage=[];for(const model of provider.GEMINI_MODELS){const attempts=ledger.attempts.filter(a=>a.model===model).concat(model==='gemini-3.5-flash-lite'?prior.attempts:[]);for(const date of new Set(attempts.map(a=>budgetRules.quotaDate(a.atMs))))usage.push({model,date,count:attempts.filter(a=>budgetRules.quotaDate(a.atMs)===date).length});}
 await atomic(resolve(out,'adoption.json'),{day,usage});
 if(day.case&&!history.some(h=>h.title===day.case.title))await atomic(resolve(LOCAL,'history.json'),[...history,day.case].slice(-24));
 receipt.finishedAt=Date.now();receipt.status=day.status;await atomic(resolve(out,'receipt.json'),receipt);console.log(JSON.stringify({status:day.status,posts:day.posts.length,attempts:receipt.attempts.length,report:out+'/read.md'}));
 if(day.status!=='complete'&&!(opt.questionsOnly&&day.case))process.exitCode=1;
 }finally{await server?.close();await lock.close();await unlink(lockPath);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error('Daily evaluation stopped: '+String(e.code??e.message).replace(/[^a-zA-Z0-9_ -]/g,'').slice(0,120));process.exitCode=1;});
