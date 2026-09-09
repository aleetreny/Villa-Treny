import { test } from 'node:test';
import assert from 'node:assert/strict';
import { options } from './run-daily-debate.mjs';
test('daily evaluator is offline by default and reserves Flash for current-date acceptance',()=>{
 assert.equal(options([]).live,false);assert.equal(options([]).model,'gemini-3.5-flash-lite');
 assert.throws(()=>options(['--live','--model','gemini-3.8-flash']));
 assert.throws(()=>options(['--live','--model','gemini-3.8-flash','--production-acceptance','--date','2020-01-01']));
 assert.equal(options(['--model','gemini-3.8-flash','--production-acceptance']).acceptance,true);
 assert.throws(()=>options(['--live','--model','unapproved-model']));assert.throws(()=>options(['--run','../../outside']));assert.throws(()=>options(['--fake-results']));
});
