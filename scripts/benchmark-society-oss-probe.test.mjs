import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadCore } from './benchmark-society-runtime-v6.mjs';
import { checkCredentialExpiry, countParts, credentialsFor, hash, parseArgs, POLICY, prepareCases,
  probeJob, receipt, runProbe, settle, sourceParts, spent, validateCounts, verifyProbe } from './benchmark-society-oss-probe.mjs';

const paths = { python: process.env.SOCIETY_TOKEN_PYTHON, cache: process.env.TIKTOKEN_CACHE_DIR };

test('probe arguments and expiry fail closed without reading credentials offline', () => {
  let reads = 0;
  const env = new Proxy({}, { get() { reads += 1; throw Error('Credential access forbidden'); } });
  assert.equal(credentialsFor(parseArgs([]), env), null);
  assert.equal(credentialsFor(parseArgs(['--live','--out','/tmp/unused','--max-new-calls','0']), env), null);
  assert.equal(reads, 0);
  for (const limit of ['3','-1','1.5']) assert.throws(() => parseArgs(['--live','--out','/tmp/unused','--max-new-calls',limit]));
  assert.throws(() => parseArgs(['--live','--out','relative']));
  assert.throws(() => parseArgs(['--live','--live']));
  const fake = { CF_ACCOUNT_ID: 'a'.repeat(32), CF_API_TOKEN: 'fake-token', CF_TOKEN_EXPIRES_AT: new Date(121001).toISOString() };
  assert.equal(credentialsFor({live:true,maxNewCalls:1}, fake, 1000).expiresAtMs, 121001);
  assert.throws(() => credentialsFor({live:true,maxNewCalls:1}, {...fake,CF_TOKEN_EXPIRES_AT:new Date(121000).toISOString()},1000), /oauth_expiry_requires_refresh/);
  assert.throws(() => credentialsFor({live:true,maxNewCalls:1}, {...fake,CF_TOKEN_EXPIRES_AT:'invalid'},1000), /oauth_expiry_requires_refresh/);
});

test('real V6 B/C probe: exact context, cached token counts, conservation and no API calls', {
  skip: !paths.python || !paths.cache ? 'Set SOCIETY_TOKEN_PYTHON and TIKTOKEN_CACHE_DIR to the reviewed offline cache.' : false,
}, async () => {
  const originalFetch = globalThis.fetch; let requests = 0, core;
  globalThis.fetch = () => { requests += 1; throw Error('No network permitted'); };
  try {
    core = await loadCore();
    const reference = JSON.parse(await readFile(new URL('../docs/research/model-society-v6-2026-09-08/ledger.json',import.meta.url),'utf8'));
    const before = hash(reference), fixtures = await prepareCases(core,reference);
    assert.equal(hash(reference),before); assert.deepEqual(fixtures.map(f=>f.actor),['B','C']);
    const jobs = fixtures.map(f=>probeJob(f,countParts(sourceParts(f.sourceJob),paths)));
    assert.deepEqual(jobs.map(j=>j.counts.parts.map(p=>p.tokens)),[[625,441,716],[625,491,712]]);
    assert.deepEqual(jobs.map(j=>j.reservedNeurons),[192,194]);
    assert.ok(jobs.reduce((n,j)=>n+j.reservedNeurons,0)>POLICY.maxNeurons);
    for(const job of jobs) {
      assert.deepEqual(job.payload.messages,job.sourceJob.payload.messages);
      assert.deepEqual(job.payload.response_format,job.sourceJob.payload.response_format);
      assert.equal(job.payload.reasoning_effort,'low');
      assert.equal(job.payload.max_completion_tokens,1024);
      assert.equal(job.payload.response_format.json_schema.strict,true);
      assert.equal(job.payload.chat_template_kwargs,undefined);
      assert.equal(job.reservedInputTokens,job.counts.parts.reduce((n,p)=>n+p.tokens,0)+2048);
      const tampered=structuredClone(job.counts); tampered.parts[0].tokens+=1;
      assert.throws(()=>validateCounts(sourceParts(job.sourceJob),tampered),/token_count_mismatch/);
      const changed=sourceParts(job.sourceJob); changed[1].text+=' changed';
      assert.throws(()=>validateCounts(changed,job.counts),/token_count_mismatch/);
    }
    assert.throws(()=>countParts(sourceParts(jobs[0].sourceJob),{...paths,cache:'/tmp/nonexistent-oss-probe-cache'}),/offline_tokenizer_cache_required/);
    const config={test:true}, ledger={config,binding:hash(config),attempts:[]}; let persisted,calls=0;
    const persist=async value=>{persisted=structuredClone(value);};
    const output=(job)=>({project:{mode:'replace',goal:'Discuss one decision relevant to my own responsibility.',
      why:'I want a concrete next step that I can actually pursue.',visibility:'private',steps:[]},
      message:{to:job.actor==='B'?'K':'N',text:'Could we discuss one useful next step?',close:false}});
    const envelope=(job,usage={prompt_tokens:1800,completion_tokens:200,total_tokens:2000})=>({status:200,
      text:JSON.stringify({success:true,result:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(output(job))}}],usage}})});
    const dispatch=async job=>{
      calls+=1; assert.equal(persisted.attempts.at(-1).state,'reserved');
      assert.equal(persisted.attempts.at(-1).accountedNeurons,job.reservedNeurons);
      assert.ok(spent(persisted)<=300); return envelope(job);
    };
    const first=await runProbe(core,fixtures,jobs,ledger,{persist,dispatch,maxNewCalls:1});
    assert.equal(first.newCalls,1); assert.equal(ledger.attempts[0].validation.code,'applied');
    const next=await runProbe(core,fixtures,jobs,ledger,{persist,dispatch,maxNewCalls:1});
    assert.equal(next.newCalls,1); assert.equal(calls,2); assert.equal(spent(ledger),142);
    assert.ok(ledger.attempts.every(r=>r.validation.balanceChanges.length===0));
    verifyProbe(core,ledger,config,jobs);
    const saved=hash(ledger);
    await runProbe(core,fixtures,jobs,ledger,{persist,dispatch:()=>assert.fail('Duplicate sent'),maxNewCalls:0});
    assert.equal(hash(ledger),saved); assert.equal(hash(reference),before);
    const crash=structuredClone(ledger); delete crash.attempts[0].validation;
    await runProbe(core,fixtures,jobs,crash,{persist,dispatch:()=>assert.fail('Crash resubmitted'),maxNewCalls:0});
    assert.deepEqual(crash.attempts[0].validation,ledger.attempts[0].validation);
    const unknown={config,binding:hash(config),attempts:[]}; let unknownCalls=0;
    const capped=await runProbe(core,fixtures,jobs,unknown,{persist,maxNewCalls:2,dispatch:async job=>{unknownCalls+=1;return envelope(job,{});}});
    assert.equal(capped.halted,'budget_exhausted'); assert.equal(unknownCalls,1); assert.equal(spent(unknown),192);
    await runProbe(core,fixtures,jobs,unknown,{persist,maxNewCalls:2,dispatch:()=>assert.fail('Unknown usage retried')});
    assert.equal(unknown.attempts.length,1);
    const expired={config,binding:hash(config),attempts:[]};
    await assert.rejects(runProbe(core,fixtures,jobs,expired,{persist,maxNewCalls:1,dispatch:()=>assert.fail('Expired token sent'),
      beforeReserve:()=>checkCredentialExpiry({expiresAtMs:1000},1000)}),/oauth_expiry_requires_refresh/);
    assert.equal(expired.attempts.length,0);
    const interrupted={config,binding:hash(config),attempts:[{id:jobs[0].id,job:jobs[0],state:'reserved',accountedNeurons:192}]};
    verifyProbe(core,interrupted,config,jobs);
    const stopped=await runProbe(core,fixtures,jobs,interrupted,{persist,maxNewCalls:2,dispatch:()=>assert.fail('Reserved ID sent')});
    assert.equal(stopped.halted,'budget_exhausted');
    for(const usage of [{}, {prompt_tokens:1,completion_tokens:2,total_tokens:4}, {prompt_tokens:1,completion_tokens:Infinity,total_tokens:2}])
      assert.equal(settle(jobs[0],usage).accountedNeurons,192);
    assert.equal(settle(jobs[0],{prompt_tokens:1800,completion_tokens:200,total_tokens:2000,completion_tokens_details:{reasoning_tokens:100}}).accountedNeurons,71);
    assert.equal(settle(jobs[0],{prompt_tokens:1,completion_tokens:1025,total_tokens:1026}).exceedsReservation,true);
    assert.equal(receipt(core,jobs[0],{choices:[{finish_reason:'length',message:{content:'{"valid":"prefix"}'}}]}).code,'output_truncated');
    const changed=structuredClone(ledger); changed.attempts[0].job.payload.reasoning_effort='high';
    assert.throws(()=>verifyProbe(core,changed,config,jobs),/probe_row/);
    assert.throws(()=>verifyProbe(core,{...ledger,attempts:[ledger.attempts[0],ledger.attempts[0]]},config,jobs),/probe_row/);
    const changedRaw=structuredClone(ledger); changedRaw.attempts[0].rawResponse='{}';
    assert.throws(()=>verifyProbe(core,changedRaw,config,jobs),/probe_raw_response/);
    assert.equal(requests,0);
  } finally { await core?.close(); globalThis.fetch=originalFetch; }
});
