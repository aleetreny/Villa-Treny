import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DebateForum } from '../src/debate/forum';
import { debateHttp } from '../src/debate/http';
import { nextDailyTask } from '../src/debate/daily';
import { runGemini } from '../src/providers/gemini';
import { completedDay, payloadFor, successful } from './fixtures/daily';
vi.mock('../src/providers/gemini', async original => ({...await original<typeof import('../src/providers/gemini')>(),runGemini:vi.fn()}));
beforeEach(()=>vi.clearAllMocks());
afterEach(()=>vi.restoreAllMocks());
const stub=()=>env.DEBATE_FORUM.getByName('test-'+crypto.randomUUID());
const seed=async(s:DurableObjectStub<DebateForum>,day=completedDay())=>runInDurableObject(s,(_i,ctx)=>{ctx.storage.sql.exec('INSERT INTO debate_days(id,body) VALUES(?,?)',day.id,JSON.stringify(day));});
describe('durable daily forum',()=>{
 it('keeps reads inert and default scheduling disabled',async()=>{const s=stub();expect((await s.getArchive()).schedule.enabled).toBe(false);expect(await s.getEdition('2026-09-09')).toBeNull();await runInDurableObject(s,async(_i,ctx)=>expect(await ctx.storage.getAlarm()).toBeNull());expect(runGemini).not.toHaveBeenCalled();});
 it('stores idempotent recommendations across requests and rejects unfinished editions',async()=>{const s=stub();await seed(s);expect(await s.vote('2026-09-09','reader',true,'net')).toEqual({recommended:true,recommendations:1});expect(await s.vote('2026-09-09','reader',true,'net')).toEqual({recommended:true,recommendations:1});expect(await s.getVote('2026-09-09','reader')).toEqual({recommended:true,recommendations:1});expect(await s.vote('2026-09-09','other',true,'net')).toEqual({recommended:true,recommendations:2});expect(await s.vote('2026-09-09','reader',false,'net')).toEqual({recommended:false,recommendations:1});expect((await s.getEdition('2026-09-09'))?.recommendations).toBe(1);expect(await s.vote('2099-01-01','reader',true,'net')).toEqual({error:'not_ready'});});
 it('pages permanent history without repeating or dropping editions',async()=>{const s=stub();for(let i=1;i<=23;i++)await seed(s,completedDay('2026-08-'+String(i).padStart(2,'0')));const first=await s.getArchive();expect(first.entries).toHaveLength(20);const last=await s.getArchive(first.nextCursor!);expect(last.entries).toHaveLength(3);expect(last.nextCursor).toBeNull();expect(new Set([...first.entries,...last.entries].map(d=>d.id)).size).toBe(23);});
 it('reserves calls before dispatch and completes an edition without visitor triggers',async()=>{
   const s=stub();let now=Date.UTC(2026,8,10,9);vi.spyOn(Date,'now').mockImplementation(()=>now);
   await s.configure({enabled:true,model:'gemini-3.5-flash-lite'});
   for(let i=0;i<15;i++){
     const exported=await s.exportEdition('2026-09-10');const day=exported.day!;const task=nextDailyTask(day,[])!;
     now+=61_000;await runInDurableObject(s,async(instance,ctx)=>{vi.mocked(runGemini).mockImplementationOnce(async()=>{expect(ctx.storage.sql.exec('SELECT COUNT(*) AS count FROM debate_attempts').one().count).toBe(i+1);return successful(payloadFor(day,task));});await instance.alarm();});
   }
   expect((await s.getEdition('2026-09-10'))?.status).toBe('complete');expect((await s.getEdition('2026-09-10'))?.posts).toHaveLength(12);
   await runInDurableObject(s,instance=>instance.alarm());expect((await s.exportEdition('2026-09-10')).attempts).toHaveLength(15);expect((await s.diagnostics()).nextAlarmAt).toBe(Date.UTC(2026,8,11,9));
 });
 it('charges uncertain outcomes, recovers saved responses, and blocks exhausted quota',async()=>{
   const s=stub();const now=Date.UTC(2026,8,11,9);vi.spyOn(Date,'now').mockReturnValue(now);await s.configure({enabled:true,model:'gemini-3.8-flash'});
   await s.accountExternal([{date:'2026-09-11',model:'gemini-3.8-flash',count:20}]);await runInDurableObject(s,instance=>instance.alarm());
   expect((await s.exportEdition('2026-09-11')).attempts).toHaveLength(0);expect((await s.getEdition('2026-09-11'))?.status).toBe('delayed');
   const t=stub();await t.configure({enabled:true,model:'gemini-3.5-flash-lite'});
   await runInDurableObject(t,(_instance,ctx)=>{ctx.storage.sql.exec("INSERT INTO debate_attempts(id,day,task,model,quota_day,started,deadline,state,result) VALUES('crashed','2026-09-11','2026-09-11-draft-1','gemini-3.5-flash-lite','2026-09-11',?,?, 'pending',NULL)",now-200000,now-1);});
   await runInDurableObject(t,instance=>instance.alarm());const recovered=await t.exportEdition('2026-09-11');expect(recovered.day?.attempts['2026-09-11-draft-1']).toBe(1);expect(recovered.attempts).toHaveLength(1);
   const draftTask=nextDailyTask(recovered.day!,[])!;const response=successful(payloadFor(recovered.day!,draftTask));
   await runInDurableObject(t,(_instance,ctx)=>{ctx.storage.sql.exec("INSERT INTO debate_attempts(id,day,task,model,quota_day,started,deadline,state,result) VALUES('saved','2026-09-11','2026-09-11-draft-1','gemini-3.5-flash-lite','2026-09-11',?,?, 'result',?)",now-1000,now+200000,JSON.stringify(response));});
   await runInDurableObject(t,instance=>instance.alarm());expect((await t.exportEdition('2026-09-11')).day?.phase).toBe('edit');
 });
 it('imports acceptance once, accounts external quota monotonically and refuses changed history',async()=>{
   const s=stub(),day=completedDay();
   await runInDurableObject(s,instance=>expect(()=>instance.adopt(day,[])).toThrow('acceptance_usage_required'));
   const usage=[{model:day.model,date:day.id,count:15}];
   expect((await s.adopt(day,usage))?.posts).toHaveLength(12);
   await s.vote(day.id,'reader',true,'net');
   expect((await s.adopt(day,usage))?.recommendations).toBe(1);
   await s.accountExternal([{...usage[0]!,count:5}]);
   expect((await s.diagnostics()).external).toEqual([{model:day.model,date:day.id,count:15}]);
   await runInDurableObject(s,instance=>expect(()=>instance.adopt({...day,updatedAt:day.updatedAt+1},usage)).toThrow('edition_already_exists'));
   expect((await s.getArchive()).entries).toHaveLength(1);expect(runGemini).not.toHaveBeenCalled();
 });
 it('filters all history and paginates recommendation ties with literal search characters',async()=>{
   const s=stub();for(let i=1;i<=23;i++){const day=completedDay('2026-08-'+String(i).padStart(2,'0'));day.domain=i===1?'space':'bodies';if(i===1)day.case!.title='A promise of 100%';await seed(s,day);}
   await s.vote('2026-08-01','reader',true,'net');
   const first=await s.getArchive({sort:'recommended'});expect(first.entries[0]?.id).toBe('2026-08-01');
   const second=await s.getArchive({sort:'recommended',before:first.nextCursor,score:first.nextScore});
   expect(new Set([...first.entries,...second.entries].map(d=>d.id)).size).toBe(23);
   expect((await s.getArchive({q:'100%'})).entries.map(d=>d.id)).toEqual(['2026-08-01']);
   expect((await s.getArchive({q:'_'})).entries).toHaveLength(0);
   expect((await s.getArchive({domain:'space'})).entries.map(d=>d.id)).toEqual(['2026-08-01']);
 });
 it('holds an unfinished older protocol on upgrade without issuing a request',async()=>{
   const s=stub();vi.spyOn(Date,'now').mockReturnValue(Date.UTC(2026,8,10,9));await s.configure({enabled:true,model:'gemini-3.5-flash-lite'});
   await runInDurableObject(s,(_instance,ctx)=>{ctx.storage.sql.exec("UPDATE debate_days SET body=json_set(body,'$.protocol','villa-debate-v1','$.phase','edit','$.draft',NULL)");});
   await runInDurableObject(s,instance=>instance.alarm());expect((await s.exportEdition('2026-09-10')).day?.heldReason).toBe('protocol_changed');expect(runGemini).not.toHaveBeenCalled();
 });
 it('serves signed cookie votes and rejects cross-site or forged writes',async()=>{
   const s=env.DEBATE_FORUM.getByName('villa-treny-daily-v1');await seed(s);
   const testEnv={...env,ADMIN_TOKEN:'test-debate-admin-secret'};
   const get=await debateHttp(new Request('https://forum.test/v1/debates/2026-09-09/recommendation'),testEnv);expect(get?.status).toBe(200);
   const cookie=get!.headers.get('set-cookie')!.split(';')[0]!;expect(get!.headers.get('set-cookie')).toContain('HttpOnly');
   const make=(origin:string,cookieValue=cookie)=>new Request('https://forum.test/v1/debates/2026-09-09/recommendation',{method:'PUT',headers:{origin,cookie:cookieValue,'content-type':'application/json'},body:JSON.stringify({recommended:true})});
   expect((await debateHttp(make('https://evil.test'),testEnv))?.status).toBe(403);
   expect((await debateHttp(make('https://forum.test',cookie+'a'),testEnv))?.status).toBe(409);
   expect((await debateHttp(make('https://forum.test'),testEnv))?.status).toBe(200);
   expect(await s.getEdition('2026-09-09')).toMatchObject({recommendations:1});
 });
});
