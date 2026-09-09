import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextAdmission, pacificDay, parseOptions, PILOT_POLICY, renderReport } from './run-debate-pilot.mjs';

describe('manual Gemini pilot budget', () => {
  it('defaults to zero-call planning and rejects accidental flags', () => {
    assert.equal(parseOptions([]).live, false);
    assert.equal(parseOptions(['--live']).live, true);
    assert.throws(() => parseOptions(['--reset-budget']));
  });
  it('uses Pacific midnight across both seasonal offsets', () => {
    assert.equal(pacificDay(Date.parse('2026-09-09T06:59:59Z')), '2026-09-08');
    assert.equal(pacificDay(Date.parse('2026-09-09T07:00:00Z')), '2026-09-09');
    assert.equal(pacificDay(Date.parse('2026-01-09T07:59:59Z')), '2026-01-08');
    assert.equal(pacificDay(Date.parse('2026-01-09T08:00:00Z')), '2026-01-09');
  });
  it('counts every reserved request, including ambiguous failures, before granting more capacity', () => {
    const now = Date.parse('2026-09-09T12:00:00Z');
    assert.equal(nextAdmission([], now), now);
    const recent = Array.from({ length: 10 }, () => ({ atMs: now - 1000 }));
    assert.equal(nextAdmission(recent, now), now + 59_001);
    assert.throws(() => nextAdmission(Array.from({ length: 64 }, () => ({ atMs: now - 120_000 })), now), /daily_budget/);
    assert.throws(() => nextAdmission([{ atMs: now + 1 }], now), /clock_rollback/);
  });
  it('does not pretend provider failures are generated content or zero-token successes', () => {
    const report = { protocol: 'fixture', status: 'incomplete', questions: [{ domain: 'space', value: null, issues: ['authentication'] }],
      debates: [], entries: [{ id: 'q1', validationIssues: ['authentication'], result: { status: 403,
        usage: { inputTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: null, complete: false } } }], limitations: [] };
    const text = renderReport(report, { policy: PILOT_POLICY, attempts: [{}] });
    assert.match(text, /Not admitted: authentication/);
    assert.match(text, /unknown/);
    assert.match(text, /HTTP 403/);
  });
});
