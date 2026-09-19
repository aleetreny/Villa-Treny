import { describe, expect, it } from 'vitest';
import { applyDailyResult, dailyRecordSchema, newDebate as newCurrentDebate, nextDailyTask, publicDay, replyTarget, turnOrder, verifyCompletedDay, conversationOrder } from '../src/debate/daily';
import { nextQuotaDay, quotaDate, unknownResult } from '../src/debate/budget';
import { completedDay, completedConversation, sampleCase, payloadFor, successful, editorialOptions, openingParagraphs, replyParagraphs } from './fixtures/daily';
import { CHARACTER_IDS } from '../../../src/lib/debate/characters';
import { caseIssues, publicDebateSchema } from '../../../src/lib/debate/contracts';
const newDebate = (...args: Parameters<typeof newCurrentDebate>) => ({ ...newCurrentDebate(...args), protocol: 'villa-debate-v5' });

describe('continuous conversation protocol', () => {
  it('uses twelve calls for nine connected turns, with all six residents and exact earlier references', () => {
    let day = newCurrentDebate('2026-09-20', 'gemini-3.5-flash-lite', 0), calls = 0;
    while (nextDailyTask(day, [])) {
      const task = nextDailyTask(day, [])!;
      if (task.kind === 'turn') {
        const input = JSON.parse(task.prompt.user);
        expect(input.conversation.map((p: {body: string}) => p.body)).toEqual(day.posts.map(p => p.body));
      }
      const next = applyDailyResult(day, task, successful(payloadFor(day, task)), [], ++calls * 1000);
      expect(next.issues).toEqual([]); day = next.day;
    }
    expect(calls).toBe(12); expect(day.posts).toHaveLength(9); expect(day.status).toBe('complete');
    expect(day.posts.map(p => p.author)).toEqual(conversationOrder(day.date));
    expect(new Set(day.posts.map(p => p.author)).size).toBe(6);
    expect(day.posts.every(p => p.quote === null && !p.body.includes('\n'))).toBe(true);
    expect(day.posts[1]!.replyTo).toBe(day.posts[0]!.id);
    expect(day.posts[0]).not.toHaveProperty('newPoint');
    expect(day.posts[0]).not.toHaveProperty('theirPoint');
    expect(verifyCompletedDay(day)).toEqual(day);
  });
  it('retries only a bad reference and preserves accepted contributions on replay', () => {
    const full = completedConversation();
    const day = { ...full, posts: full.posts.slice(0, 2), summary: null, phase: 'conversation' as const, status: 'replies' as const, attempts: {} };
    const task = nextDailyTask(day, [])!;
    const bad = applyDailyResult(day, task, successful({ ...payloadFor(day, task) as object, replyToIndex: 1 }), [], 1);
    expect(bad.issues).toEqual(['conversation_reference']);
    expect(bad.day.posts).toEqual(day.posts);
    expect(nextDailyTask(bad.day, [])!.prompt.user).toContain('someone else');
    const accepted = applyDailyResult(bad.day, task, successful(payloadFor(day, task)), [], 2);
    expect(accepted.day.posts).toHaveLength(3);
    expect(applyDailyResult(accepted.day, task, successful(payloadFor(day, task)), [], 3).day).toBe(accepted.day);
  });
  it('rejects dense paragraphs, fabricated fact IDs and corrupt imports', () => {
    const full = completedConversation();
    const day = { ...full, posts: [], summary: null, phase: 'conversation' as const, status: 'replies' as const, attempts: {} };
    const task = nextDailyTask(day, [])!, payload = payloadFor(day, task) as object;
    expect(applyDailyResult(day, task, successful({ ...payload, body: 'A b c. '.repeat(18).trim() }), [], 1).issues).toContain('conversation_length');
    expect(applyDailyResult(day, task, successful({ ...payload, factsUsed: [5] }), [], 1).issues).toContain('invalid_fact_reference');
    const broken = structuredClone(full); broken.posts[2]!.replyTo = broken.posts[8]!.id;
    expect(() => verifyCompletedDay(broken)).toThrow('invalid_reply');
    expect(verifyCompletedDay(completedDay()).protocol).toBe('villa-debate-v5');
  });
  it('accepts a short question without padding and rotates the extra speaking turns fairly', () => {
    const full = completedConversation();
    const day = { ...full, posts: full.posts.slice(0, 1), summary: null, phase: 'conversation' as const, status: 'replies' as const, attempts: {} };
    const task = nextDailyTask(day, [])!;
    const short = applyDailyResult(day, task, successful({ ...payloadFor(day, task) as object, body: 'What about singers?' }), [], 1);
    expect(short.issues).toEqual([]);
    expect(short.day.posts[1]!.body).toBe('What about singers?');
    const total = Object.fromEntries(CHARACTER_IDS.map(id => [id, 0]));
    const first = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const order = conversationOrder(new Date(Date.UTC(2026, 8, 20 + i)).toISOString().slice(0, 10));
      expect(new Set(order).size).toBe(6); first.add(order[0]!);
      for (const id of order) total[id]!++;
    }
    expect(first.size).toBe(6); expect(Object.values(total)).toEqual([9, 9, 9, 9, 9, 9]);
  });
  it('selects literal highlights without inventing a recap, attribution or disagreement', () => {
    const full = completedConversation();
    const day = { ...full, summary: null, phase: 'summary' as const, status: 'summarizing' as const, attempts: {} };
    const task = nextDailyTask(day, [])!;
    expect(JSON.parse(task.prompt.user).posts[0]).not.toHaveProperty('position');
    const rejected = applyDailyResult(day, task, successful({ postIndices: [1, 3] }), [], 1);
    expect(rejected.issues).toEqual(['highlight_references']);
    expect(rejected.day.posts).toEqual(day.posts);
    expect(applyDailyResult(day, task, successful({ postIndices: [2, 1] }), [], 1).issues).toEqual(['highlight_references']);
    expect(applyDailyResult(day, task, successful({ postIndices: [1, 10] }), [], 1).issues).toEqual(['highlight_schema']);
    const retry = nextDailyTask(rejected.day, [])!;
    const accepted = applyDailyResult(rejected.day, retry, successful({ postIndices: [1, 2] }), [], 2).day;
    expect(accepted.status).toBe('complete');
    expect(accepted.summary).toEqual(full.summary);
    expect(accepted.summary!.overview).toContain(day.posts[0]!.body);
    expect(accepted.summary!.highlights).toEqual(day.posts.slice(0, 2).map(p => p.id));
    expect(accepted.summary!.disagreements).toEqual([]);
    expect(() => verifyCompletedDay({ ...full, summary: { ...full.summary!, overview: 'An invented conclusion that nobody in the discussion ever actually said.' } })).toThrow('invalid_summary_references');
    const shortDay = { ...day, posts: day.posts.map((p, i) => i ? p : { ...p, body: 'What about singers?' }) };
    const shortTask = nextDailyTask(shortDay, [])!;
    const short = applyDailyResult(shortDay, shortTask, successful({ postIndices: [1, 2] }), [], 3);
    expect(short.issues).toEqual([]);
    expect(short.day.summary!.overview).toContain('“What about singers?”');
  });
});

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
    expect(day.posts[6]).not.toHaveProperty('engagement');
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
    expect(retry.prompt.system.startsWith('Your previous attempt was rejected.')).toBe(true);
    const good=applyDailyResult(bad.day,retry,successful(payloadFor(bad.day,retry)),[],80_000);
    expect(good.day.posts).toHaveLength(1);
    expect(nextDailyTask(good.day,[])!.prompt.user).not.toContain('validationFeedback');
    const malformed=[openingParagraphs[0]!.replace('. ','.\n'),openingParagraphs[1]];
    expect(applyDailyResult(day,task,successful({...payloadFor(day,task) as object,paragraphs:malformed}),[],1).issues).toContain('post_paragraphs');
    const legacyBody={body:openingParagraphs.join(' '),position:'Give both groups a predictable timetable.',factsUsed:[1]};
    expect(applyDailyResult(day,task,successful(legacyBody),[],1).issues).toContain('post_schema');
    expect(nextDailyTask({...day,lastFailure:'network_error,untrusted_provider_text',attempts:{[task.id]:1}},[])!.prompt.user).not.toContain('untrusted_provider_text');
    expect(nextDailyTask({...day,lastFailure:'network_error,untrusted_provider_text',attempts:{[task.id]:1}},[])!.prompt.system).not.toContain('untrusted_provider_text');
  });
  it('applies the shorter reply limit without weakening fact and quotation checks', () => {
    const full=completedDay();
    const day={...full,posts:full.posts.slice(0,6),summary:null,phase:'replies' as const,status:'replies' as const,attempts:{}};
    const task=nextDailyTask(day,[])!;
    expect(applyDailyResult(day,task,successful({...payloadFor(day,task) as object,engagement:'invent_a_disagreement'}),[],1).issues).toEqual(['post_schema']);
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
  it('bounds new drafts without making earlier stored drafts unreadable', () => {
    const longCase={...sampleCase,context:sampleCase.context+' '+sampleCase.context};
    expect(longCase.context.length).toBeGreaterThan(800);
    expect(longCase.context.length).toBeLessThanOrEqual(1600);
    const draft={candidates:[longCase,longCase,longCase]};
    const fresh=newDebate('2026-09-20','gemini-3.5-flash-lite',0);
    expect(applyDailyResult(fresh,nextDailyTask(fresh,[])!,successful(draft),[],1).issues).toEqual(['candidate_schema']);
    const previous={...fresh,protocol:'villa-debate-v4',draft};
    expect(dailyRecordSchema.parse(previous).draft).toEqual(draft);
  });
  it('uses the Pacific quota reset through daylight saving transitions', () => {
    for(const date of ['2026-03-08T07:59:59Z','2026-11-01T06:59:59Z','2026-09-09T19:00:00Z']){ const now=Date.parse(date),next=nextQuotaDay(now);expect(quotaDate(next)).not.toBe(quotaDate(now));expect(quotaDate(next-1)).toBe(quotaDate(now));}
  });
});
