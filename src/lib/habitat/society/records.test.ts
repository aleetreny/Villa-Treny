import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { genesisState } from '../engine/state';
import { economicAccounts, totalCells } from '../engine/economy';
import { RESIDENTS, type ResidentId } from '../residents';
import { createSocietyState, watchNumber } from './state';
import { emptyRecordsState, recordContentHash, recordSha256, validateRecordsState } from './record-schema';
import { applyRecordOperation, canReadRecord, confirmRecordPublication, publicRecordView,
  recordContext, recordPromisedCells, selectRecordPublication, settleRecordCommissions } from './records';
import { RECORD_LIMITS, type AuthoredDraft, type RecordOperation, type RecordReference } from './record-types';

function fixture() {
  const world = genesisState(41);
  for (const {id} of RESIDENTS) world.bodies[id].cells = 20;
  world.economy.ledger.initialCells = totalCells(world);
  return { world, records: emptyRecordsState(), legacy: createSocietyState(world,1), clock: 1000 };
}
type Fixture = ReturnType<typeof fixture>;
const publicRef: RecordReference = { id: 'world:100:1', audience: 'public' };
function apply(f: Fixture, actor: ResidentId, op: RecordOperation, refs: RecordReference[] = [publicRef]) {
  const result = applyRecordOperation(f.records,f.world,{ actor,sequence:f.records.cursors[actor].lastSequence+1,
    expectedRevision:f.records.cursors[actor].revision,nowMs:++f.clock,preparedRefs:refs },op,f.legacy);
  expect(result.code).toBe('applied'); expect(result.ok).toBe(true);
  expect(validateRecordsState(result.records).ok).toBe(true);
  f.records=result.records;f.world=result.world; return result;
}
function draft(f: Fixture, options: Partial<Extract<RecordOperation,{kind:'draft'}>> = {}, actor: ResidentId = 'A') {
  apply(f,actor,{kind:'draft',title:'A proposed procedure',text:'This is my proposal, not a verified medical rule.',
    refs:[publicRef.id],parent:null,audience:'B',publish:false,...options});
  return f.records.drafts.at(-1)!;
}
const binding = (d: AuthoredDraft) => ({draftId:d.id,contentHash:d.contentHash});
function offer(f: Fixture, d: AuthoredDraft, cells=3, dueInWatches=2) {
  apply(f,'A',{kind:'commission',...binding(d),counterpart:'B',cells,dueInWatches,audience:'B',visibility:'private'});
  return f.records.offers.at(-1)!;
}
function accept(f: Fixture) { apply(f,'B',{kind:'accept',offerId:f.records.offers.at(-1)!.id}); }
function publish(f: Fixture, actor: ResidentId='A') {
  const intent=selectRecordPublication(f.records,f.world,actor);expect(intent).not.toBeNull();
  const result=confirmRecordPublication(f.records,f.world,{actor,intentId:intent!.id,watch:watchNumber(f.world),nowMs:++f.clock},f.legacy);
  expect(result.code).toBe('published'); expect(validateRecordsState(result.records).ok).toBe(true);
  f.records=result.records;f.world=result.world;return result;
}

describe('authored immutable records',()=>{
  it('uses standard SHA256 for exact UTF8, including multiblock and Unicode content',()=>{
    for(const text of ['', 'abc', 'ñ🙂α', 'a'.repeat(55), 'b'.repeat(56), 'c'.repeat(64), '⛵'.repeat(600)])
      expect(recordSha256(text)).toBe(createHash('sha256').update(text).digest('hex'));
  });
  it('starts empty with 25 independent cursors and does not invent resources or publication',()=>{
    const f=fixture(),before=structuredClone(f.world),d=draft(f);
    expect(Object.keys(f.records.cursors)).toHaveLength(25);expect(d.author).toBe('A');
    expect(d.contentHash).toBe(recordContentHash(d));expect(f.records.publications).toEqual([]);
    expect(f.records.intents).toEqual([]);expect(f.world).toEqual(before);
  });
  it('preserves exact authored bytes and own parent identity; edits create another immutable ID',()=>{
    const f=fixture(),first=draft(f,{text:'  Exact\nUTF-8: ñ 🙂  '}),saved=structuredClone(first);
    const second=draft(f,{text:'A different proposal.',parent:binding(first)});
    expect(first).toEqual(saved);expect(second.id).not.toBe(first.id);expect(second.contentHash).not.toBe(first.contentHash);
    expect(second.parent).toEqual(binding(first));expect(f.records.drafts[0]).toEqual(saved);
    const bad=structuredClone(f.records);bad.drafts[0]!.text+=' altered';expect(validateRecordsState(bad).ok).toBe(false);
    const r=applyRecordOperation(f.records,f.world,{actor:'B',sequence:0,expectedRevision:0,nowMs:2000,preparedRefs:[publicRef]},
      {kind:'draft',title:'Other',text:'My revision',refs:[],parent:binding(first),audience:'private',publish:false});
    expect(r.code).toBe('invalid_record_parent');expect(r.records).toBe(f.records);
  });
  it('rejects excessive UTF8, unknown or duplicate refs and extra author/hash fields atomically',()=>{
    const f=fixture(),base={kind:'draft',title:'Title',text:'🙂'.repeat(150),refs:[],parent:null,audience:'private',publish:false};
    const ctx={actor:'A' as const,sequence:0,expectedRevision:0,nowMs:1000,preparedRefs:[publicRef]};
    for(const raw of [base,{...base,text:'Text',author:'B'}, {...base,text:'Text',contentHash:'0'.repeat(64)},
      {...base,text:'Text',refs:['unseen']},{...base,text:'Text',refs:[publicRef.id,publicRef.id]}]){
      const r=applyRecordOperation(f.records,f.world,ctx,raw);expect(r.ok).toBe(false);expect(r.records).toBe(f.records);expect(r.world).toBe(f.world);
    }
  });
  it('protects private reference IDs when a draft is shared or published',()=>{
    const f=fixture(),privateRef:RecordReference={id:'memory:secret',audience:['A']};
    apply(f,'A',{kind:'draft',title:'Private',text:'My own thought.',refs:[privateRef.id],parent:null,audience:'private',publish:false},[privateRef]);
    const d=f.records.drafts[0]!;
    expect(canReadRecord(f.records,d,'B')).toBe(false);expect(recordContext(f.records,'B').drafts).toEqual([]);
    for(const kind of ['share','schedule'] as const){
      const r=applyRecordOperation(f.records,f.world,{actor:'A',sequence:1,expectedRevision:1,nowMs:1002,preparedRefs:[privateRef]},
        {kind,...binding(d),audience:'public'});expect(r.code).toBe('private_reference');
    }
    expect(JSON.stringify(publicRecordView(f.records))).not.toContain(privateRef.id);
    expect(JSON.stringify(publicRecordView(f.records))).not.toContain(d.contentHash);
  });
  it('shares exact text only with the explicit audience; sharing is not publication or endorsement',()=>{
    const f=fixture(),d=draft(f,{audience:'private'});
    apply(f,'A',{kind:'share',...binding(d),audience:'B'});
    expect(recordContext(f.records,'B').drafts[0]?.text).toBe(d.text);
    expect(recordContext(f.records,'C').drafts).toEqual([]);expect(publicRecordView(f.records).publications).toEqual([]);
    expect(f.records.agreements).toEqual([]);expect(f.records.publications).toEqual([]);
  });
  it('uses actor cursors, preserves duplicate effects, and rejects a stale same-actor response',()=>{
    const f=fixture(),ctx={actor:'A' as const,sequence:0,expectedRevision:0,nowMs:1000,preparedRefs:[]};
    const op:RecordOperation={kind:'draft',title:'Title',text:'Claim',refs:[],parent:null,audience:'private',publish:false};
    draft(f,{},'B');const r=applyRecordOperation(f.records,f.world,ctx,op);expect(r.ok).toBe(true);
    const again=applyRecordOperation(r.records,r.world,ctx,{...op,text:'Different'});expect(again.code).toBe('already_applied');expect(again.records).toBe(r.records);
    expect(applyRecordOperation(r.records,r.world,{...ctx,sequence:1},op).code).toBe('record_revision_changed');
  });
});

describe('publication occupies a real physical slot',()=>{
  it('selects the next available slot without charging another six hours, and publishes only once',()=>{
    const f=fixture(),before=economicAccounts(f.world),d=draft(f,{audience:'public',publish:true}),intent=f.records.intents[0]!;
    expect(f.records.publications).toEqual([]);expect(intent.earliestWatch).toBe(watchNumber(f.world));
    // An urgent action is represented by the engine withholding confirmation.
    expect(selectRecordPublication(f.records,f.world,'A')).toEqual(intent);expect(f.records.publications).toEqual([]);
    publish(f);expect(f.records.publications[0]).toMatchObject({draftId:d.id,contentHash:d.contentHash});
    expect(economicAccounts(f.world)).toEqual(before);expect(f.records.intents).toEqual([]);
    const again=confirmRecordPublication(f.records,f.world,{actor:'A',intentId:intent.id,watch:watchNumber(f.world),nowMs:2000});
    expect(again.code).toBe('already_published_this_watch');expect(again.records).toBe(f.records);
    expect(publicRecordView(f.records).publications[0]?.text).toBe(d.text);
  });
  it('defers after an already used slot and rejects a wrong/future physical stamp',()=>{
    const f=fixture();f.legacy.minds.A.lastPhysicalWatch=watchNumber(f.world);
    draft(f,{audience:'public',publish:true});expect(selectRecordPublication(f.records,f.world,'A')).toBeNull();
    expect(confirmRecordPublication(f.records,f.world,{actor:'A',intentId:f.records.intents[0]!.id,
      watch:watchNumber(f.world)+1,nowMs:2000}).code).toBe('invalid_publication_slot');
    f.world.watch++;expect(selectRecordPublication(f.records,f.world,'A')).not.toBeNull();
  });
  it('cannot spend a slot that the engine already consumed after scheduling',()=>{
    const f=fixture();draft(f,{audience:'public',publish:true});
    f.legacy.minds.A.lastPhysicalWatch=watchNumber(f.world);
    const r=confirmRecordPublication(f.records,f.world,{actor:'A',intentId:f.records.intents[0]!.id,
      watch:watchNumber(f.world),nowMs:2000},f.legacy);
    expect(r.code).toBe('physical_slot_already_used');expect(r.records).toBe(f.records);expect(r.world).toBe(f.world);
  });
  it('allows an explicit cancellation, but not cancellation of accepted publication work',()=>{
    const f=fixture(),d=draft(f,{publish:true});
    apply(f,'A',{kind:'cancel_publication',intentId:f.records.intents[0]!.id});expect(f.records.intents).toEqual([]);
    offer(f,d);accept(f);
    const r=applyRecordOperation(f.records,f.world,{actor:'A',sequence:20,expectedRevision:f.records.cursors.A.revision,
      nowMs:2000,preparedRefs:[]},{kind:'cancel_publication',intentId:f.records.intents[0]!.id});
    expect(r.code).toBe('committed_publication');
  });
});

describe('exact publication commissions',()=>{
  it('requires independent acceptance; an exact publication then conserves payment and records its cause',()=>{
    const f=fixture(),d=draft(f),o=offer(f,d,3),before=totalCells(f.world),stocks=structuredClone(f.world.economy.stock);
    expect(f.records.agreements).toEqual([]);expect(f.records.intents).toEqual([]);expect(f.world.bodies.B.cells).toBe(20);
    const self=applyRecordOperation(f.records,f.world,{actor:'A',sequence:8,expectedRevision:f.records.cursors.A.revision,nowMs:2000,preparedRefs:[]},
      {kind:'accept',offerId:o.id});expect(self.code).toBe('unavailable_record_offer');
    accept(f);expect(recordPromisedCells(f.records,'B')).toBe(3);expect(f.world.bodies.A.cells).toBe(20);
    publish(f);expect(f.records.agreements[0]).toMatchObject({status:'fulfilled',paidCells:3,publicationId:f.records.publications[0]!.id});
    expect(f.world.bodies.A.cells).toBe(23);expect(f.world.bodies.B.cells).toBe(17);expect(totalCells(f.world)).toBe(before);
    expect(f.world.economy.stock).toEqual(stocks);expect(Object.values(f.world.economy.workCredits).every(n=>n===0)).toBe(true);
    expect(f.world.economy.events.at(-1)?.action).toMatch(/^record-commission:/);
    const replay=settleRecordCommissions(f.records,f.world,3000);expect(replay.world).toBe(f.world);expect(recordPromisedCells(f.records,'B')).toBe(0);
  });
  it('never probes another payer balance when proposing; acceptance rechecks funds',()=>{
    const f=fixture(),d=draft(f);f.world.bodies.B.cells=0;
    const o=offer(f,d,3);
    const accepted=applyRecordOperation(f.records,f.world,{actor:'B',sequence:0,expectedRevision:0,nowMs:2000,preparedRefs:[]},
      {kind:'accept',offerId:o.id},f.legacy);
    expect(accepted.code).toBe('insufficient_cells');expect(accepted.records).toBe(f.records);expect(f.records.agreements).toEqual([]);
  });
  it('rejects unavailable hashes, unshared drafts, rejected/expired offers and already published work',()=>{
    const f=fixture(),d=draft(f,{audience:'private'}),ctx={actor:'A' as const,sequence:2,expectedRevision:1,nowMs:2000,preparedRefs:[]};
    const op:RecordOperation={kind:'commission',...binding(d),counterpart:'B',cells:2,dueInWatches:2,audience:'B',visibility:'private'};
    expect(applyRecordOperation(f.records,f.world,ctx,op).code).toBe('draft_not_shared_with_counterpart');
    expect(applyRecordOperation(f.records,f.world,ctx,{...op,contentHash:'0'.repeat(64)}).code).toBe('unavailable_record_draft');
    apply(f,'A',{kind:'share',...binding(d),audience:'B'});offer(f,d);apply(f,'B',{kind:'reject',offerId:f.records.offers[0]!.id});
    expect(f.records.agreements).toEqual([]);expect(f.records.intents).toEqual([]);
    offer(f,d);f.world.watch+=2;
    expect(applyRecordOperation(f.records,f.world,{actor:'B',sequence:1,expectedRevision:1,nowMs:3000,preparedRefs:[]},
      {kind:'accept',offerId:f.records.offers.at(-1)!.id}).code).toBe('unavailable_record_offer');
    apply(f,'A',{kind:'schedule',...binding(d),audience:'B'});publish(f);
    const r=applyRecordOperation(f.records,f.world,{actor:'A',sequence:50,expectedRevision:f.records.cursors.A.revision,nowMs:4000,preparedRefs:[]},op);
    expect(r.code).toBe('already_published');
  });
  it('keeps real publication evidence unpaid if funds disappear, and settles later without another publication',()=>{
    const f=fixture(),d=draft(f);offer(f,d,3);accept(f);
    f.world.bodies.C.cells+=f.world.bodies.B.cells;f.world.bodies.B.cells=0;
    const before=totalCells(f.world);publish(f);
    expect(f.records.agreements[0]).toMatchObject({status:'payment_due',paidCells:0});expect(recordPromisedCells(f.records,'B')).toBe(3);
    f.world.bodies.C.cells-=3;f.world.bodies.B.cells=3;
    const settled=settleRecordCommissions(f.records,f.world,3000);
    expect(settled.records.agreements[0]).toMatchObject({status:'fulfilled',paidCells:3});expect(totalCells(settled.world)).toBe(before);
    expect(settled.records.publications).toHaveLength(1);
  });
  it('does not pay for late publication, or turn zero-cell cooperation into money',()=>{
    const late=fixture(),d=draft(late);offer(late,d,3,1);accept(late);late.world.watch+=2;publish(late);
    expect(late.records.agreements[0]).toMatchObject({status:'breached',publicationId:null,paidCells:0});expect(late.world.bodies.A.cells).toBe(20);
    const free=fixture(),fd=draft(free);offer(free,fd,0);accept(free);const before=economicAccounts(free.world);publish(free);
    expect(free.records.agreements[0]).toMatchObject({status:'fulfilled',paidCells:0});expect(economicAccounts(free.world)).toEqual(before);
  });
  it('counts old work reservations and prevents competing productive commitments at acceptance',()=>{
    const f=fixture(),d=draft(f);offer(f,d,3);
    f.legacy.agreements.push({id:'agreement:999',offerId:'offer:998',terms:{kind:'work',worker:'C',payer:'B',cells:19,verb:'work',room:'records',units:1,dueWatch:402},
      status:'active',acceptedAtMs:1,acceptedAtWatch:400,acceptedAfterEventSequence:0,progress:0,completedAtMs:null,evidenceIds:[],debtId:null});
    const ctx={actor:'B' as const,sequence:0,expectedRevision:0,nowMs:2000,preparedRefs:[]};
    expect(applyRecordOperation(f.records,f.world,ctx,{kind:'accept',offerId:f.records.offers[0]!.id},f.legacy).code).toBe('insufficient_cells');
    f.legacy.agreements[0]!.terms={kind:'work',worker:'A',payer:'C',cells:1,verb:'work',room:'records',units:1,dueWatch:402};
    expect(applyRecordOperation(f.records,f.world,ctx,{kind:'accept',offerId:f.records.offers[0]!.id},f.legacy).code).toBe('existing_publication_commitment');
  });
  it('pays only the agreed revision, not a replacement text or a forged fulfillment marker',()=>{
    const f=fixture(),first=draft(f);offer(f,first,3);accept(f);
    const second=draft(f,{text:'New proposed wording.',parent:binding(first)});
    const before=structuredClone(f.records.agreements[0]);publish(f);
    expect(f.records.publications[0]!.draftId).toBe(first.id);expect(f.records.publications[0]!.contentHash).toBe(before!.terms.contentHash);
    expect(f.records.publications.some(p=>p.draftId===second.id)).toBe(false);
    const wrong=structuredClone(f.records);wrong.agreements[0]!.paidCells=0;expect(validateRecordsState(wrong).ok).toBe(false);
    const early=structuredClone(f.records);early.publications[0]!.publishedAtMs=0;expect(validateRecordsState(early).ok).toBe(false);
  });
});

describe('bounded working set and honest projection',()=>{
  it('evicts unpinned history with counters, keeping parent hashes and active commission bindings',()=>{
    const f=fixture();let parent=draft(f,{audience:'public'});
    const first=parent.id;
    for(let i=1;i<RECORD_LIMITS.drafts+3;i++)parent=draft(f,{parent:binding(parent),title:`Revision ${i}`,text:'An attributed revision.',audience:'public'});
    expect(f.records.drafts.length).toBe(RECORD_LIMITS.drafts);expect(f.records.archive.drafts).toBe(3);
    expect(f.records.drafts.some(d=>d.id===first)).toBe(false);expect(f.records.archive.parents).toHaveLength(1);
    expect(validateRecordsState(f.records).ok).toBe(true);
  });
  it('does not expose drafts, private commissions or private parent IDs through the public DTO',()=>{
    const f=fixture(),privateParent=draft(f,{audience:'private',refs:[]}),publicChild=draft(f,{parent:binding(privateParent),audience:'public',publish:true,refs:[]});
    publish(f);const view=publicRecordView(f.records);
    expect(view.publications[0]?.parentPublicationId).toBeNull();expect(view.publications[0]?.contentHash).toBe(publicChild.contentHash);
    expect(JSON.stringify(view)).not.toContain(privateParent.id);
    const reader=recordContext(f.records,'B');expect(JSON.stringify(reader)).not.toContain(privateParent.id);
    f.world.watch++;const d=draft(f);offer(f,d);accept(f);
    expect(publicRecordView(f.records).offers).toEqual([]);expect(publicRecordView(f.records).agreements).toEqual([]);
  });
  it('can complete more commissions than the bounded terminal-history capacity',()=>{
    const f=fixture();
    for(let i=0;i<RECORD_LIMITS.agreements+2;i++){
      f.world.day=100+Math.floor(i/4);f.world.watch=i%4+1;
      const d=draft(f,{title:`Text ${i}`});offer(f,d,0);accept(f);publish(f);
    }
    expect(f.records.agreements).toHaveLength(RECORD_LIMITS.agreements);
    expect(f.records.offers).toHaveLength(RECORD_LIMITS.offers);expect(f.records.publications).toHaveLength(RECORD_LIMITS.agreements+2);
    expect(f.records.agreements.every(a=>a.status==='fulfilled')).toBe(true);expect(validateRecordsState(f.records).ok).toBe(true);
  });
  it('does not truncate outstanding payment obligations from the actor context',()=>{
    const f=fixture();
    for(let i=0;i<6;i++){
      f.world.day=100+Math.floor(i/4);f.world.watch=i%4+1;
      f.world.bodies.B.cells=3*(i+1);const d=draft(f,{title:`Text ${i}`});offer(f,d,3);accept(f);
      f.world.bodies.C.cells+=f.world.bodies.B.cells;f.world.bodies.B.cells=0;publish(f);
    }
    expect(recordContext(f.records,'B').agreements).toHaveLength(6);
    expect(recordContext(f.records,'B').agreements.every(a=>a.status==='payment_due')).toBe(true);
    expect(recordPromisedCells(f.records,'B')).toBe(18);
  });
});
