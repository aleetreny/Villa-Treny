import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { loadFrozenV7Core, hash } from './benchmark-society-frozen-v7.mjs';
import { POLICY, prepareOrderCases, orderJob, dealFirst, runProbe, verifyLedger, validateOrder, parseArgs } from './benchmark-society-v7-deal-order-local.mjs';

const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;

test('exact frozen selection, paired grammar equivalence and unchanged messages/sampling', async () => {
  const core = await loadFrozenV7Core();
  try {
    const cases = await prepareOrderCases(core);
    assert.deepEqual(cases.map(item => item.actor), ['G', 'L', 'B']);
    for (const fixture of cases) {
      const a = orderJob(fixture, 'A'), b = orderJob(fixture, 'B');
      const sa = a.payload.response_format.json_schema.schema, sb = b.payload.response_format.json_schema.schema;
      assert.deepEqual(sorted(sa), sorted(sb)); assert.notEqual(hash(sa), hash(sb));
      for (const schema of [sb, ...sb.anyOf]) if (schema.properties?.deal)
        assert.ok(Object.keys(schema.properties).indexOf('deal') < Object.keys(schema.properties).indexOf('message'));
      assert.deepEqual(a.payload.messages, fixture.sourceJob.payload.messages);
      assert.deepEqual(b.payload.messages, a.payload.messages);
      assert.equal(a.payload.seed, b.payload.seed); assert.equal(a.payload.max_tokens, 1024);
      assert.equal(b.payload.chat_template_kwargs.enable_thinking, false);
      const baseline = structuredClone(fixture.baselineOutput), legal = structuredClone(baseline); legal.message.close = false;
      const noDeal = structuredClone(baseline); delete noDeal.deal;
      const inputs = [baseline, legal, noDeal, { ...legal, surprise: true }, { ...legal, message: { ...legal.message, close: true } },
        { ...legal, message: { ...legal.message, extra: 1 } }, { ...legal, deal: { ...legal.deal, cells: -1 } },
        { ...legal, deal: { ...legal.deal, extra: 1 } }, { ...legal, message: { ...legal.message, to: fixture.actor } },
        { ...legal, project: null }, { ...legal, appraisal: { axis: 'trust', delta: 3, ref: 'fake', why: 'fake' } }];
      for (const input of inputs) assert.equal(z.fromJSONSchema(sa).safeParse(input).success, z.fromJSONSchema(sb).safeParse(input).success);
      assert.equal(z.fromJSONSchema(sa).safeParse(baseline).success, false);
      assert.equal(z.fromJSONSchema(sb).safeParse(legal).success, true);
      assert.equal(validateOrder(core, fixture, b, legal).ok, true);
      assert.deepEqual(dealFirst(sb), sb);
    }
  } finally { await core.close(); }
});

test('six durable reservations and raw receipts precede effects; replay and unknown IDs make zero calls', async () => {
  const core = await loadFrozenV7Core();
  try {
    const fixtures = await prepareOrderCases(core), jobs = POLICY.order.map(pair => {
      const [actor, variant] = pair.split(':'); return orderJob(fixtures.find(item => item.actor === actor), variant); });
    const config = { fixture: true }, ledger = { config, binding: hash(config), attempts: [] };
    let writes = 0, calls = 0; const snapshots = [];
    const persist = async value => { writes += 1; snapshots.push(structuredClone(value)); };
    const dispatch = async job => {
      calls += 1; assert.equal(snapshots.at(-1).attempts.at(-1).state, 'reserved');
      const output = structuredClone(fixtures.find(item => item.actor === job.actor).baselineOutput); output.message.close = false;
      return { status: 200, text: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }) };
    };
    const result = await runProbe(core, fixtures, jobs, ledger, { persist, dispatch, maxNewCalls: 6,
      afterReceipt: async row => { assert.ok(row.rawResponse); assert.equal(row.validation, undefined); assert.ok(snapshots.at(-1).attempts.at(-1).rawResponse); } });
    assert.equal(result.newCalls, 6); assert.equal(calls, 6); assert.equal(writes, 18);
    assert.ok(ledger.attempts.every(row => row.validation.ok)); verifyLedger(core, ledger, config, jobs);
    const before = hash(ledger);
    assert.equal((await runProbe(core, fixtures, jobs, ledger, { maxNewCalls: 0, dispatch: () => assert.fail('replay HTTP') })).newCalls, 0);
    assert.equal(hash(ledger), before);
    const unknown = { config, binding: hash(config), attempts: [{ id: jobs[0].id, job: jobs[0], reservedCalls: 1, state: 'reserved' }] };
    await runProbe(core, fixtures, jobs, unknown, { maxNewCalls: 0, dispatch: () => assert.fail('unknown retry') });
    assert.equal(unknown.attempts.length, 1); assert.equal(unknown.attempts[0].validation, undefined);
  } finally { await core.close(); }
});

test('offline default and strict six-call cap', () => {
  assert.equal(parseArgs([]).run, false); assert.equal(parseArgs([]).maxNewCalls, 1);
  assert.throws(() => parseArgs(['--run', '--out', '/tmp/probe', '--server-pid', '1', '--max-new-calls', '7']));
  assert.throws(() => parseArgs(['--endpoint', 'https://elsewhere']));
});
