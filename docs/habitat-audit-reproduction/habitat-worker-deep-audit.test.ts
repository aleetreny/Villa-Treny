import { env, exports } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe,it,expect } from '/Users/alejandrotreny/Documents/ChatGPT/Portfolio/node_modules/vitest';
import { serializeWorldState, deserializeWorldState, prepareCognition } from '/Users/alejandrotreny/Documents/ChatGPT/Portfolio/workers/habitat-runtime/src/domain';
import { createGenesisWorld } from '/Users/alejandrotreny/Documents/ChatGPT/Portfolio/workers/habitat-runtime/src/domain';
import { routeCognition } from '/Users/alejandrotreny/Documents/ChatGPT/Portfolio/workers/habitat-runtime/src/providers/router';
import { parseRuntimeConfig } from '/Users/alejandrotreny/Documents/ChatGPT/Portfolio/workers/habitat-runtime/src/contracts';

describe('Read-only audit against isolated local SQLite objects',()=>{
 it('a failed physical watch rolls back, retries and still reports healthy',async()=>{
  const stub=env.HABITAT_WORLD.getByName('audit-garden-full');await stub.resume({commandId:'audit-garden-resume',issuedAtMs:Date.now()});
  await runInDurableObject(stub,async(instance,state)=>{
   const stored=state.storage.sql.exec('SELECT state_json FROM world_state').one();const world=deserializeWorldState(stored.state_json as string);
   world.economy.stock={produce:0,meals:0,water:1,materials:16};for(const body of Object.values(world.bodies))body.condition.fed=20;
   state.storage.sql.exec('UPDATE world_state SET state_json=?',serializeWorldState(world));
   state.storage.sql.exec('UPDATE runtime_meta SET next_watch_at_ms=?,next_alarm_at_ms=?',Date.now()-1000,Date.now()-1000);
   for(const provider of ['workers-ai','groq'])state.storage.sql.exec('INSERT OR REPLACE INTO provider_breakers(provider,open_until_ms,reason,failure_streak,updated_at_ms)VALUES(?,?,?,?,?)',provider,Date.now()+86400000,'audit',1,Date.now());
   await state.storage.setAlarm(Date.now()-1000);
  });
  const before=await stub.getObserver();await runDurableObjectAlarm(stub);const after=await stub.getObserver();const status=await stub.getStatus();
  expect(after).toEqual(before);expect(status.worldRevision).toBe(0);expect(status.lastErrorCode).toBe('RangeError');expect(status.health).toBe('healthy');
  console.log('AUDIT_GARDEN',JSON.stringify({revision:status.worldRevision,error:status.lastErrorCode,health:status.health,nextWatch:status.nextWatchAtMs,nextWake:status.nextWake}));
 });
 it('arbitrary admin-enqueued jobs remain pending after an actual scheduled watch',async()=>{
  const stub=env.HABITAT_WORLD.getByName('audit-enqueued');await stub.resume({commandId:'audit-enqueue-resume',issuedAtMs:Date.now()});
  const prepared=prepareCognition({state:createGenesisWorld(),worldRevision:0,habitatId:env.HABITAT_ID,runId:'custom-audit',createdAtMs:Date.now(),controlRevision:0});
  prepared.job.jobId='custom-enqueued-never-selected';await stub.enqueueCognition(prepared.job);
  await runInDurableObject(stub,async(instance,state)=>{state.storage.sql.exec('UPDATE runtime_meta SET next_watch_at_ms=?,next_alarm_at_ms=?',Date.now()-1000,Date.now()-1000);for(const provider of ['workers-ai','groq'])state.storage.sql.exec('INSERT OR REPLACE INTO provider_breakers(provider,open_until_ms,reason,failure_streak,updated_at_ms)VALUES(?,?,?,?,?)',provider,Date.now()+86400000,'audit',1,Date.now());await state.storage.setAlarm(Date.now()-1000);});
  await runDurableObjectAlarm(stub);
  await runInDurableObject(stub,(instance,state)=>{const row=state.storage.sql.exec('SELECT status FROM cognition_jobs WHERE job_id=?','custom-enqueued-never-selected').one();expect(row.status).toBe('pending');console.log('AUDIT_ENQUEUE',row.status);});
 });
 it('syntactically valid but impossible-domain provider payload is labelled completed and blocks fallback',async()=>{
  let groqCalls=0;const prepared=prepareCognition({state:createGenesisWorld(),worldRevision:0,habitatId:env.HABITAT_ID,runId:'audit',createdAtMs:Date.now(),controlRevision:0});
  const result=await routeCognition({ai:{run:async()=>({choices:[{message:{content:'{"verb":"not_a_verb","room":null,"target":null}'}}]})},groqApiKey:'fake-audit-key',config:parseRuntimeConfig(env),job:prepared.job,attemptOrdinal:1,quota:{reserve:()=>({allowed:true}),markDispatched:()=>{},recordOutcome:()=>{},settle:()=>{}} as never,groqFetch:async()=>{groqCalls++;return new Response('{}');}});
  expect(result.status).toBe('completed');expect(groqCalls).toBe(0);console.log('AUDIT_DOMAIN_INVALID',JSON.stringify(result));
 });
});
