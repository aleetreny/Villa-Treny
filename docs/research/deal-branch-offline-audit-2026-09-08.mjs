// Offline schema/compiler audit only: no core edits, inference or response repair.
/* global structuredClone, console, URL */
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { countParts } from '../../scripts/benchmark-society-oss-probe.mjs';
import { hash } from '../../scripts/benchmark-society-frozen-v7.mjs';
const directory = new URL('./model-society-protocol4-local-2026-09-08/', import.meta.url);
const tokenizer = { python: '/var/folders/hj/8gb1hypn0qd3rpd94jql_8g80000gp/T/villa-static-token-audit-6y4773qu/venv/bin/python',
 cache: '/var/folders/hj/8gb1hypn0qd3rpd94jql_8g80000gp/T/villa-static-token-audit-6y4773qu/cache' };
function closeTransform(value, mode) {
 if(Array.isArray(value)) return value.map(x=>closeTransform(x,mode));
 if(!value || typeof value !== 'object') return value;
 const next=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,closeTransform(v,mode)]));
 if(next.properties?.to && next.properties?.text && next.properties?.close) {
  if(mode==='required') next.required=[...new Set([...(next.required??[]),'close'])];
  if(mode==='implicit' && next.properties.close.const===false) next.required=(next.required??[]).filter(x=>x!=='close');
 }
 return next;
}
function nullableDeal(schema, flat=false) {
 const next=structuredClone(schema); if(!next.properties.deal) return next;
 const required=fields=>[...new Set([...(fields??[]),'deal'])];
 next.properties.deal={anyOf:[next.properties.deal,{type:'null'}]}; next.required=required(next.required);
 if(flat){ delete next.anyOf; return next; }
 next.anyOf[0].properties.deal={type:'null'}; next.anyOf[0].required=required(next.anyOf[0].required);
 return next;
}
const raw=await readFile(new URL('ledger.json',directory)), ledger=JSON.parse(raw), rows=ledger.entries.filter(x=>x.kind==='cognition');
const part=[], counts=[], cases=[]; let checks=0;
for(const [i,row] of rows.entries()) {
 const base=row.job.job.outputContract.jsonSchema;
 const variants={current:base,requiredClose:closeTransform(base,'required'),implicitOpen:closeTransform(base,'implicit'),nullableDeal:nullableDeal(base),nullableFlat:nullableDeal(base,true)};
 const wireChecks={};
 for(const [name,schema] of Object.entries(variants)) {
  const c=z.fromJSONSchema(schema); wireChecks[name]=c.safeParse(row.receipt.output).success; checks++;
  part.push({label:`${i}:${name}`,text:JSON.stringify(schema)});
 }
 for(const [name,text] of [['system',row.job.job.prompt.system],['user',row.job.job.prompt.user]]) part.push({label:`${i}:${name}`,text});
 cases.push({actor:row.job.actor,stage:row.job.stage,index:row.job.index,dealExposed:Boolean(base.properties.deal),wireChecks});
}
for(let i=0;i<part.length;i+=25) counts.push(...countParts(part.slice(i,i+25),tokenizer).parts);
const by=new Map(counts.map(x=>[x.label,x]));
for(const [i,item] of cases.entries()) {
 item.counts=Object.fromEntries(['current','requiredClose','implicitOpen','nullableDeal','nullableFlat'].map(name=>[name,{schemaTokens:by.get(`${i}:${name}`).tokens,schemaBytes:by.get(`${i}:${name}`).bytes,
  groqReservation:by.get(`${i}:${name}`).tokens+by.get(`${i}:system`).tokens+by.get(`${i}:user`).tokens+128+1024}]));
}
// Actual frozen G has a concrete deal and a required project/message. Construct
// only independent test inputs; historical output bytes remain unchanged.
const probe=JSON.parse(await readFile(new URL('./model-society-v7-deal-order-local-2026-09-08/frozen-cases.json',import.meta.url)));
const g=probe.cases.find(x=>x.actor==='G'), base=probe.jobs.find(x=>x.actor==='G'&&x.variant==='A').payload.response_format.json_schema.schema;
const schemas={current:base,requiredClose:closeTransform(base,'required'),implicitOpen:closeTransform(base,'implicit'),nullableDeal:nullableDeal(base),nullableFlat:nullableDeal(base,true)};
const output=structuredClone(g.baselineOutput); output.message.text='Test terms.';
const withoutDeal=structuredClone(output); delete withoutDeal.deal;
const samples={omittedCloseDeal:output,explicitFalseDeal:{...output,message:{...output.message,close:false}},
 trueCloseDeal:{...output,message:{...output.message,close:true}},omittedCloseNoDeal:withoutDeal,
 falseCloseNoDeal:{...withoutDeal,message:{...output.message,close:false}},trueCloseNoDeal:{...withoutDeal,message:{...output.message,close:true}},
 nullDeal:{...withoutDeal,deal:null},nullDealCloseTrue:{...withoutDeal,message:{...output.message,close:true},deal:null},
 noMessageDeal:{project:output.project,deal:output.deal},extraTop:{...output,extra:1},extraMessage:{...output,message:{...output.message,extra:1}},
 negativeCells:{...output,deal:{...output.deal,cells:-1}},selfRecipient:{...output,message:{...output.message,to:'G'}},noRequiredProject:{message:output.message,deal:output.deal}};
const validity=Object.fromEntries(Object.entries(schemas).map(([name,schema])=>[name,Object.fromEntries(Object.entries(samples).map(([id,value])=>{checks++;return[id,z.fromJSONSchema(schema).safeParse(value).success]}))]));
assert.equal(validity.implicitOpen.omittedCloseDeal,true); assert.equal(validity.implicitOpen.trueCloseDeal,false);
assert.equal(validity.implicitOpen.noMessageDeal,false); assert.equal(validity.requiredClose.omittedCloseNoDeal,false);
assert.equal(validity.nullableDeal.nullDealCloseTrue,true); assert.equal(validity.nullableFlat.trueCloseDeal,true);
for(const name of ['implicitOpen','requiredClose','nullableDeal']) for(const key of ['extraTop','extraMessage','negativeCells','selfRecipient','noRequiredProject']) assert.equal(validity[name][key],false);
const range=a=>[Math.min(...a),Math.max(...a)];
const summary=Object.fromEntries(Object.keys(schemas).map(name=>[name,{total:cases.reduce((n,x)=>n+x.counts[name].groqReservation,0),range:range(cases.map(x=>x.counts[name].groqReservation)),
 schemaDelta:range(cases.map(x=>x.counts[name].schemaTokens-x.counts.current.schemaTokens)),above6000:cases.filter(x=>x.counts[name].groqReservation>6000).length,
 unmodifiedSavedOutputsAccepted:cases.filter(x=>x.wireChecks[name]).length}]));
assert.equal(hash(await readFile(new URL('ledger.json',directory))),hash(raw));
await writeFile(new URL('./deal-branch-offline-audit-2026-09-08.json',import.meta.url),JSON.stringify({scope:'Offline counterfactual wire schemas; no model outputs modified or applied.',httpRequests:0,ledgerSha256:hash(raw),cases:37,dealExposed:cases.filter(x=>x.dealExposed).length,checks,tokenizer:{name:'o200k_harmony',version:'0.14.0',framing:128,outputReservation:1024},summary,validity,rows:cases},null,2)+'\n');
await writeFile(new URL('./deal-branch-compiler-input-2026-09-08.json',import.meta.url),JSON.stringify({schemas,samples},null,2)+'\n');
console.log(JSON.stringify({checks,summary,validity},null,2));
