import { describe, expect, it } from 'vitest';
import { applyDailyResult, newDebate, nextDailyTask, publicDay, replyTarget, turnOrder, verifyCompletedDay } from '../src/debate/daily';
import { nextQuotaDay, quotaDate, unknownResult } from '../src/debate/budget';
import { completedDay, sampleCase, payloadFor, successful, editorialOptions, openingParagraphs, replyParagraphs } from './fixtures/daily';
import { CHARACTER_IDS } from '../../../src/lib/debate/characters';
import { caseIssues, publicDebateSchema } from '../../../src/lib/debate/contracts';

describe('daily debate protocol', () => {
  it('finishes in 15 calls with six blind openings and one incoming reply per resident', () => {
    let day = newDebate('2026-09-09','gemini-3.5-flash-lite',0); let calls=0;
    while (nextDailyTask(day,[])) {
      const task = nextDailyTask(day,[])!;
      if (task.kind==='opening') expect(task.prompt.user).not.toContain('published timetable');
      if (task.kind==='reply') {
        const input=JSON.parse(task.prompt.user);
        expect(input).not.toHaveProperty('openings');
        expect(input.ownOpening.author).toBe(task.author);
        expect(input.ownOpening.round).toBe(1);
        expect(input.target.body).toBe(day.posts.find(p=>p.id===task.replyTo)!.body);
      }
      const next=applyDailyResult(day,task,successful(payloadFor(day,task)),[],++calls*1000);
      expect(next.issues).toEqual([]); day=next.day;
    }
    expect(calls).toBe(15); expect(day.posts).toHaveLength(12); expect(day.status).toBe('complete');
    expect(new Set(day.posts.filter(p=>p.round===2).map(p=>p.replyTo)).size).toBe(6);
    expect(day.posts.every(p=>p.body.split('\n\n').length===2)).toBe(true);
    expect(day.posts[0]!.body).toBe(openingParagraphs.join('\n\n'));
    expect(day.posts[6]!.body).toBe(replyParagraphs.join('\n\n'));
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
    for(let i=0;i<2;i++){let task=nextDailyTask(day,[])!;day=applyDailyResult(day,task,successful({candidates:[sampleCase,sampleCase,sampleCase]}),[],1).day;task=nextDailyTask(day,[])!;day=applyDailyResult(day,task,successful({publish:false,reasons:['The case has a trivial escape.'],decisiveConstraint:sampleCase.facts[0],viableResponses:editorialOptions,case:sampleCase}),[],2).day;}
    expect(day.status).toBe('held');expect(day.case).toBeNull();expect(day.posts).toHaveLength(0);
  });
  it('protects imported history and literal summary references', () => {
    const day=completedDay();day.summary!.disagreements[0]!.posts=['invented','invented2'];expect(()=>verifyCompletedDay(day)).toThrow('invalid_summary_references');
    const invalid=completedDay();invalid.posts[0]!.id='fake';expect(()=>verifyCompletedDay(invalid)).toThrow();
  });
  it('rejects long or malformed posts and gives a bounded retry useful feedback', () => {
    const full=completedDay();
    const day={...full,posts:[],summary:null,phase:'opening' as const,status:'opening' as const,attempts:{}};
    const task=nextDailyTask(day,[])!;
    const tooLong=['This is a point. '.repeat(13).trim(),'This is another point. '.repeat(14).trim()];
    const bad=applyDailyResult(day,task,successful({...payloadFor(day,task) as object,paragraphs:tooLong}),[],20_000);
    expect(bad.issues).toContain('post_length');
    expect(bad.day.posts).toHaveLength(0);
    const retry=nextDailyTask(bad.day,[])!;
    expect(retry.id).toBe(task.id);
    expect(JSON.parse(retry.prompt.user).validationFeedback.join(' ')).toContain('50–105');
    const good=applyDailyResult(bad.day,retry,successful(payloadFor(bad.day,retry)),[],80_000);
    expect(good.day.posts).toHaveLength(1);
    expect(nextDailyTask(good.day,[])!.prompt.user).not.toContain('validationFeedback');
    const malformed=[openingParagraphs[0]!.replace('. ','.\n'),openingParagraphs[1]];
    expect(applyDailyResult(day,task,successful({...payloadFor(day,task) as object,paragraphs:malformed}),[],1).issues).toContain('post_paragraphs');
    const legacyBody={body:openingParagraphs.join(' '),position:'Give both groups a predictable timetable.',factsUsed:[1]};
    expect(applyDailyResult(day,task,successful(legacyBody),[],1).issues).toContain('post_schema');
    expect(nextDailyTask({...day,lastFailure:'network_error,untrusted_provider_text',attempts:{[task.id]:1}},[])!.prompt.user).not.toContain('untrusted_provider_text');
  });
  it('applies the shorter reply limit without weakening fact and quotation checks', () => {
    const full=completedDay();
    const day={...full,posts:full.posts.slice(0,6),summary:null,phase:'replies' as const,status:'replies' as const,attempts:{}};
    const task=nextDailyTask(day,[])!;
    const tooLong=['These are all plain words. '.repeat(8).trim(),'These are all plain words. '.repeat(8).trim()];
    expect(applyDailyResult(day,task,successful({...payloadFor(day,task) as object,paragraphs:tooLong}),[],1).issues).toEqual(['post_length']);
    expect(applyDailyResult(day,task,successful({...payloadFor(day,task) as object,factsUsed:[5]}),[],1).issues).toContain('invalid_fact_reference');
    const brief=['You are right to keep a little quiet time every day.', 'I would rotate the hours so everyone can enjoy that time.'];
    expect(applyDailyResult(day,task,successful({...payloadFor(day,task) as object,paragraphs:brief}),[],1).issues).toEqual([]);
    const invalid=completedDay();invalid.posts[6]!.body=tooLong.join('\n\n');
    expect(()=>verifyCompletedDay(invalid)).toThrow('invalid_post');
  });
  it('requires the editor to put the decisive constraint in the reader-visible case', () => {
    const fresh=newDebate('2026-09-09','gemini-3.5-flash-lite',0);
    const draft=nextDailyTask(fresh,[])!;
    const day=applyDailyResult(fresh,draft,successful(payloadFor(fresh,draft)),[],1).day;
    const task=nextDailyTask(day,[])!;
    const bad=applyDailyResult(day,task,successful({...payloadFor(day,task) as object,decisiveConstraint:'An invented deadline leaves them only one day.'}),[],2);
    expect(bad.issues).toEqual(['constraint_must_quote_context']);expect(bad.day.case).toBeNull();
    expect(caseIssues({...sampleCase,question:'How should the director balance access against preservation?'},[])).toContain('stock_balance_template');
    expect(caseIssues({...sampleCase,question:'What should the director do with the proposed offer?'},[])).toEqual([]);
  });
  it('lets the editor repair draft questions but never publishes an invalid final case', () => {
    const day=newDebate('2026-09-09','gemini-3.5-flash-lite',0);
    const candidate={...sampleCase,question:'Should residents use a fixed timetable to share the garden?'};
    const drafted=applyDailyResult(day,nextDailyTask(day,[])!,successful({candidates:[candidate,candidate,candidate]}),[],1);
    expect(drafted.accepted).toBe(true);expect(drafted.day.case).toBeNull();
    const task=nextDailyTask(drafted.day,[])!;
    const bad=applyDailyResult(drafted.day,task,successful({...payloadFor(drafted.day,task) as object,case:candidate}),[],2);
    expect(bad.issues).toEqual(['closed_question']);expect(bad.day.case).toBeNull();
    expect(JSON.parse(nextDailyTask(bad.day,[])!.prompt.user).validationFeedback.join(' ')).toContain('What should');
    const repaired=applyDailyResult(bad.day,nextDailyTask(bad.day,[])!,successful(payloadFor(bad.day,task)),[],3);
    expect(repaired.day.case).toEqual(sampleCase);expect(repaired.day.posts).toHaveLength(0);
    const rejected=applyDailyResult(drafted.day,task,successful({...payloadFor(drafted.day,task) as object,publish:false,case:candidate,reasons:['The draft forces a false choice.']}),[],4);
    expect(rejected.accepted).toBe(true);expect(rejected.day.phase).toBe('draft');
    expect(rejected.day.draftNumber).toBe(2);expect(rejected.day.case).toBeNull();
  });
  it('allows an honest summary with no disagreement and still rejects invented references', () => {
    const full=completedDay();const day={...full,summary:null,phase:'summary' as const,status:'summarizing' as const,attempts:{}};
    const task=nextDailyTask(day,[])!;
    const summary={...payloadFor(day,task) as object,disagreements:[]};
    const result=applyDailyResult(day,task,successful(summary),[],1);
    expect(result.issues).toEqual([]);expect(verifyCompletedDay(result.day).summary!.disagreements).toEqual([]);
    const invalid={...summary,disagreements:[{text:'A disagreement that cites posts which were never published.',posts:['fake1','fake2']}]};
    expect(applyDailyResult(day,task,successful(invalid),[],1).issues).toEqual(['summary_references']);
  });
  it('keeps the public archive compatible with longer, single-paragraph v3 editions', () => {
    const old=publicDay(completedDay(),0);old.protocol='villa-debate-v3';old.personaVersion=4;
    old.characters=old.characters.map(person=>({...person,version:4}));
    old.case!.context=sampleCase.context+' '+sampleCase.context;
    old.posts=old.posts.map(post=>({...post,body:openingParagraphs.join(' ')+' '+openingParagraphs.join(' ')}));
    old.summary!.overview='Earlier summaries could be longer. '.repeat(14);
    expect(publicDebateSchema.parse(old)).toEqual(old);
  });
  it('uses the Pacific quota reset through daylight saving transitions', () => {
    for(const date of ['2026-03-08T07:59:59Z','2026-11-01T06:59:59Z','2026-09-09T19:00:00Z']){ const now=Date.parse(date),next=nextQuotaDay(now);expect(quotaDate(next)).not.toBe(quotaDate(now));expect(quotaDate(next-1)).toBe(quotaDate(now));}
  });
});
