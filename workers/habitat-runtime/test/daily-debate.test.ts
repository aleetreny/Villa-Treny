import { describe, expect, it } from 'vitest';
import { applyDailyResult, newDebate, nextDailyTask, publicDay, replyTarget, turnOrder, verifyCompletedDay } from '../src/debate/daily';
import { nextQuotaDay, quotaDate, unknownResult } from '../src/debate/budget';
import { completedDay, sampleCase, payloadFor, successful, editorialOptions } from './fixtures/daily';
import { CHARACTER_IDS } from '../../../src/lib/debate/characters';

describe('daily debate protocol', () => {
  it('finishes in 15 calls with six blind openings and one incoming reply per resident', () => {
    let day = newDebate('2026-09-09','gemini-3.5-flash-lite',0); let calls=0;
    while (nextDailyTask(day,[])) {
      const task = nextDailyTask(day,[])!;
      if (task.kind==='opening') expect(task.prompt.user).not.toContain('published timetable');
      if (task.kind==='reply') { expect(JSON.parse(task.prompt.user).openings).toHaveLength(6); expect(JSON.parse(task.prompt.user).openings.every((p: {round:number})=>p.round===1)).toBe(true); }
      const next=applyDailyResult(day,task,successful(payloadFor(day,task)),[],++calls*1000);
      expect(next.issues).toEqual([]); day=next.day;
    }
    expect(calls).toBe(15); expect(day.posts).toHaveLength(12); expect(day.status).toBe('complete');
    expect(new Set(day.posts.filter(p=>p.round===2).map(p=>p.replyTo)).size).toBe(6);
    expect(verifyCompletedDay(day)).toEqual(day);
    expect(publicDay(day,2)).not.toHaveProperty('attempts');
  });
  it('rotates first speaker and covers every directed peer pair over 30 days', () => {
    const pairs=new Set<string>(), first=new Set<string>();
    for(let i=0;i<30;i++){ const date=new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10); const day=completedDay(date); first.add(turnOrder(date)[0]!);
      for(const actor of CHARACTER_IDS){const target=replyTarget(date,actor,day.posts.filter(p=>p.round===1)); expect(target.author).not.toBe(actor);pairs.add(actor+target.author);}}
    expect(first.size).toBe(6);expect(pairs.size).toBe(30);
  });
  it('rejects invented quotations and resumes only the failed turn', () => {
    const full=completedDay();const day={...full,posts:full.posts.slice(0,6),summary:null,phase:'replies' as const,status:'replies' as const,attempts:{}};
    const task=nextDailyTask(day,[])!;
    const bad=applyDailyResult(day,task,successful({...payloadFor(day,task) as object,quoteIndex:16}),[],20_000);
    expect(bad.issues).toContain('exact_target_quote');expect(bad.day.posts).toHaveLength(6);expect(nextDailyTask(bad.day,[])?.id).toBe(task.id);
    const good=applyDailyResult(bad.day,task,successful(payloadFor(day,task)),[],80_000);
    expect(good.day.posts).toHaveLength(7);expect(good.day.attempts[task.id]).toBe(2);
    expect(applyDailyResult(good.day,task,successful(payloadFor(day,task)),[],90_000).day).toBe(good.day);
  });
  it('holds a repeatedly failing turn and does not spin on authentication errors', () => {
    let day=newDebate('2026-09-09','gemini-3.5-flash-lite',0);const task=nextDailyTask(day,[])!;
    for(let i=0;i<3;i++)day=applyDailyResult(day,task,unknownResult(day.model),[],i*100_000).day;
    expect(day.status).toBe('held');expect(nextDailyTask(day,[])).toBeNull();expect(day.attempts[task.id]).toBe(3);
    const fresh=newDebate(day.date,day.model,0);expect(applyDailyResult(fresh,nextDailyTask(fresh,[])!,{...unknownResult(day.model),code:'authentication'},[],1).day.status).toBe('held');
  });
  it('allows one replacement draft, never publishes an editorial rejection', () => {
    let day=newDebate('2026-09-09','gemini-3.5-flash-lite',0);
    for(let i=0;i<2;i++){let task=nextDailyTask(day,[])!;day=applyDailyResult(day,task,successful({candidates:[sampleCase,sampleCase,sampleCase]}),[],1).day;task=nextDailyTask(day,[])!;day=applyDailyResult(day,task,successful({publish:false,reasons:['The case has a trivial escape.'],viableResponses:editorialOptions,case:sampleCase}),[],2).day;}
    expect(day.status).toBe('held');expect(day.case).toBeNull();expect(day.posts).toHaveLength(0);
  });
  it('protects imported history and literal summary references', () => {
    const day=completedDay();day.summary!.disagreements[0]!.posts=['invented','invented2'];expect(()=>verifyCompletedDay(day)).toThrow('invalid_summary_references');
    const invalid=completedDay();invalid.posts[0]!.id='fake';expect(()=>verifyCompletedDay(invalid)).toThrow();
  });
  it('uses the Pacific quota reset through daylight saving transitions', () => {
    for(const date of ['2026-03-08T07:59:59Z','2026-11-01T06:59:59Z','2026-09-09T19:00:00Z']){ const now=Date.parse(date),next=nextQuotaDay(now);expect(quotaDate(next)).not.toBe(quotaDate(now));expect(quotaDate(next-1)).toBe(quotaDate(now));}
  });
});
