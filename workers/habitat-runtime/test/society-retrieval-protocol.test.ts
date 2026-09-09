import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RESIDENTS } from '../../../src/lib/habitat/residents';
import { recordAct, recordFixture } from '../../../src/lib/habitat/society/records-test-fixture';
import { societyPublicView } from '../../../src/lib/habitat/society/public';
import { prepareSocietyJob, nextSocietyActor, COGNITION_FAILURE_BACKOFF_MS } from '../src/society-scheduler';
import { applySocietyProtocol } from '../src/society-protocol';
import { cognitionJobSchema } from '../src/contracts';
import { SOCIETY_RECORD_SYSTEM } from '../../../src/lib/habitat/society/record-instructions';
import { SOCIETY_RETRIEVAL_SYSTEM } from '../../../src/lib/habitat/society/retrieval-instructions';

function fixture() {
  let f = recordFixture();
  for (const title of ['Alpha', 'Beta', 'Gamma', 'Delta']) f = recordAct(f, 'A', {
    kind: 'draft', title, text: `Exact ${title} notes.`, refs: [], parent: null, audience: 'private', publish: false });
  for (const { id } of RESIDENTS) {
    f.state.minds[id].lastSuccessAtMs = f.now - 1; f.state.minds[id].lastAttemptAtMs = f.now - 1;
  }
  return { ...f, actor: 'A' as const, nowMs: f.now, sequence: f.state.minds.A.lastAppliedSequence + 1,
    generation: 0, worldRevision: 0, habitatId: 'isolated-retrieval-protocol', protocolVersion: 7 as const,
    routingPolicy: 'free-models-v1' as const };
}

describe('P7 protocol and ordinary scheduling', () => {
  it('issues an explicit version7 with a private alternative and keeps explicit6 byte-stable and unexpanded', () => {
    const f = fixture(), old = prepareSocietyJob({ ...f, protocolVersion: 6 });
    const saved = JSON.stringify(old), current = prepareSocietyJob({ ...f, protocolVersion: 7 });
    expect(old.job.prompt.system).toBe(SOCIETY_RECORD_SYSTEM); expect(current.job.prompt.system).toBe(SOCIETY_RETRIEVAL_SYSTEM);
    expect(current).toEqual(prepareSocietyJob(f));
    expect(current.job.outputContract.version).toBe(7); expect(current.job.maxOutputTokens).toBe(1024);
    expect(cognitionJobSchema.safeParse(current.job).success).toBe(true);
    const raw = { lookup: { kind: 'search', query: 'Alpha' } };
    expect(z.fromJSONSchema(current.job.outputContract.jsonSchema as Record<string, unknown>).safeParse(raw).success).toBe(true);
    expect(z.fromJSONSchema(old.job.outputContract.jsonSchema as Record<string, unknown>).safeParse(raw).success).toBe(false);
    for (const version of [1, 2, 3, 4, 5, 6]) {
      const refused = applySocietyProtocol(version, f.state, f.world, old.turn, raw, { nowMs: f.now + 1, generation: 0 });
      expect(refused.ok).toBe(false); expect(refused.state).toBe(f.state);
    }
    expect(JSON.stringify(old)).toBe(saved);
  });

  it('makes pending retrieval eligible in the existing queue, honours failure backoff and lets older peers go first', () => {
    const f = fixture(), job = prepareSocietyJob({ ...f, protocolVersion: 7 });
    expect(nextSocietyActor(f.state, f.now + 1, 10)).toBeUndefined();
    const result = applySocietyProtocol(7, f.state, f.world, job.turn,
      { lookup: { kind: 'search', query: 'Alpha' } }, { nowMs: f.now + 1, generation: 0 });
    expect(result.ok, result.code).toBe(true);
    expect(nextSocietyActor(result.state, f.now + 2, 10)).toBe('A');
    expect(nextSocietyActor(result.state, f.now + 2, 10, new Set(['A']))).toBeUndefined();
    result.state.minds.A.lastAttemptAtMs = f.now + 2;
    expect(nextSocietyActor(result.state, f.now + 3, 10)).toBeUndefined();
    expect(nextSocietyActor(result.state, f.now + 2 + COGNITION_FAILURE_BACKOFF_MS, 10)).toBe('A');
    result.state.minds.A.lastAttemptAtMs = f.now;
    const b = prepareSocietyJob({ ...f, state: result.state, world: result.world, actor: 'B', protocolVersion: 7, sequence: 10 });
    const other = applySocietyProtocol(7, result.state, result.world, b.turn,
      { lookup: { kind: 'search', query: '' } }, { nowMs: f.now + 2, generation: 0 });
    expect(other.ok).toBe(true);
    expect(nextSocietyActor(other.state, f.now + 3, 12)).toBe('A');
    const aAgain = prepareSocietyJob({ ...f, state: other.state, world: other.world, actor: 'A', protocolVersion: 7,
      nowMs: f.now + 3, sequence: 11 });
    const newer = applySocietyProtocol(7, other.state, other.world, aAgain.turn,
      { lookup: { kind: 'search', query: 'Alpha' } }, { nowMs: f.now + 4, generation: 0 });
    expect(newer.ok).toBe(true); expect(nextSocietyActor(newer.state, f.now + 5, 12)).toBe('B');
  });

  it('emits no public retrieval metadata and leaves provider limits and output allowance unchanged', () => {
    const f = fixture(), generated = prepareSocietyJob({ ...f, protocolVersion: 7 });
    const result = applySocietyProtocol(7, f.state, f.world, generated.turn,
      { lookup: { kind: 'search', query: 'Alpha' } }, { nowMs: f.now + 1, generation: 0 });
    expect(result.ok).toBe(true);
    const text = JSON.stringify(societyPublicView(result.state));
    for (const secret of ['Alpha', 'lookup', 'retrieval', 'snapshotHash', 'Exact Alpha notes.']) expect(text).not.toContain(secret);
    expect(generated.job.routingPolicy).toBe('free-models-v1');
    expect(generated.job.maxOutputTokens).toBe(prepareSocietyJob({ ...f, protocolVersion: 6 }).job.maxOutputTokens);
  });
});
