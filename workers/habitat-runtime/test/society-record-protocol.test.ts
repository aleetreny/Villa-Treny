import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { genesisState } from '../../../src/lib/habitat/engine/state';
import { RESIDENTS } from '../../../src/lib/habitat/residents';
import { createSocietyState } from '../../../src/lib/habitat/society/state';
import { prepareSocietyTurn } from '../../../src/lib/habitat/society/turn';
import { SOCIETY_RECORD_SYSTEM, SOCIETY_RECORD_SYSTEM_BEFORE_PROGRESS } from '../../../src/lib/habitat/society/record-instructions';
import { SOCIETY_PROPOSAL_SYSTEM } from '../../../src/lib/habitat/society/instructions';
import { nextSocietyActor, prepareSocietyJob } from '../src/society-scheduler';
import { applySocietyProtocol } from '../src/society-protocol';
import { workersAIInput, OSS_WORKERS_AI_MODEL } from '../src/providers/workers-ai';

const fixture = () => {
  const world = genesisState(91), state = createSocietyState(world, 1000);
  return { state, world, actor: 'A' as const, nowMs: 2000, sequence: 1,
    generation: 0, worldRevision: 0, habitatId: 'offline-records-protocol', protocolVersion: 6 as const };
};
const output = { project: { mode: 'replace', goal: 'Write a stores proposal.', why: 'I want an exact text to discuss.', visibility: 'private', steps: [] },
  message: { to: 'B', text: 'Bex, would you read a stores proposal?' },
  record: { kind: 'draft', title: 'Stores proposal', text: 'Let us compare the register together.',
    refs: ['world:100:1'], parent: null, audience: 'private', publish: false } };

describe('explicit records producer and saved dispatcher', () => {
  it('clarifies string references only in new P6 instructions, retaining saved instructions and strict rejection of $ref objects', () => {
    const f = fixture(), issued = prepareSocietyJob(f);
    const clarification = 'Every refs field is an array of plain strings copied exactly from the IDs allowed for that field, never objects or $ref wrappers.';
    expect(issued.job.prompt.system).toContain(clarification);
    for (const protocolVersion of [3, 4, 5] as const) {
      expect(prepareSocietyJob({ ...f, protocolVersion }).job.prompt.system).not.toContain(clarification);
    }
    const stored = structuredClone(issued);
    stored.job.prompt.system = SOCIETY_RECORD_SYSTEM_BEFORE_PROGRESS.replace(`${clarification} `, '');
    delete stored.job.routingPolicy;
    // Previous P6 SYSTEM hash, independently captured from the complete saved
    // U80 job. No private prompt, response or biography is copied into this test.
    expect(createHash('sha256').update(stored.job.prompt.system).digest('hex'))
      .toBe('7778fd04b498b9ca4dc1b0c3634bcfa7fdc86a8931a1ba01e827d23eef286e42');
    const savedBytes = JSON.stringify(stored);
    expect(stored.turn).toEqual(issued.turn);
    expect(stored.job.outputContract).toEqual(issued.job.outputContract);
    expect(workersAIInput(stored.job, OSS_WORKERS_AI_MODEL).messages[0]!.content).toBe(stored.job.prompt.system);
    const schema = z.fromJSONSchema(stored.job.outputContract.jsonSchema as Record<string, unknown>);
    const reference = output.record.refs[0]!;
    expect(JSON.parse(stored.turn.prompt.slice(stored.turn.prompt.indexOf('\n{') + 1)).records.referenceAccess.public).toContain(reference);
    const wrongShape = { ...output, record: { ...output.record, refs: [{ $ref: reference }] } };
    expect(schema.safeParse(wrongShape).success).toBe(false);
    const rejected = applySocietyProtocol(6, f.state, f.world, stored.turn, wrongShape, { nowMs: 2001, generation: 0 });
    expect(rejected).toEqual({ ok: false, code: 'invalid_record_choice', state: f.state, world: f.world });
    expect(rejected.state).toBe(f.state); expect(rejected.world).toBe(f.world);
    expect(schema.safeParse(output).success).toBe(true);
    const accepted = applySocietyProtocol(6, f.state, f.world, stored.turn, output, { nowMs: 2001, generation: 0 });
    expect(accepted.ok).toBe(true);
    expect(accepted.state.records.drafts[0]!.refs[0]!.id).toBe(reference);
    expect(JSON.stringify(stored)).toBe(savedBytes);
  });

  it('retains explicit6 and4 while issuing the separate retrieval protocol7', () => {
    const f = fixture(), current = prepareSocietyJob({ ...f, protocolVersion: 7 }), explicit4 = prepareSocietyJob({ ...f, protocolVersion: 4 });
    const records = prepareSocietyJob({ ...f, protocolVersion: 6 });
    expect(current.job.outputContract.version).toBe(7); expect(current).not.toEqual(records);
    expect(explicit4.job.prompt.system).toBe(SOCIETY_PROPOSAL_SYSTEM);
    expect(records.job.outputContract.version).toBe(6); expect(records.job.maxOutputTokens).toBe(1024);
    expect(records.job.prompt.system).toBe(SOCIETY_RECORD_SYSTEM);
    expect(records.job.outputContract.jsonSchema).toMatchObject({ type: 'object' });
    expect(JSON.stringify(records.job.outputContract.jsonSchema)).not.toContain('prefixItems');
    expect(records.job.prompt.user).toContain('You are Ama Oyelaran (A).');
    expect(records.job.prompt.user).toContain('"records":');
    expect(explicit4.job.prompt.user).not.toContain('"records":');
    expect(z.fromJSONSchema(records.job.outputContract.jsonSchema as Record<string, unknown>).safeParse(output).success).toBe(true);
  });

  it('applies stored6 without reinterpreting previous contracts', () => {
    const f = fixture(), prepared = prepareSocietyJob({ ...f, protocolVersion: 6 });
    const control = { nowMs: 2001, generation: 0 };
    for (const version of [1, 2, 3, 4, 5]) {
      const rejected = applySocietyProtocol(version, f.state, f.world, prepared.turn, output, control);
      expect(rejected.ok).toBe(false); expect(rejected.state).toBe(f.state);
    }
    const result = applySocietyProtocol(6, f.state, f.world, prepared.turn, output, control);
    expect(result.code).toBe('applied'); expect(result.state.records.drafts).toHaveLength(1);
    expect(result.world).toEqual(f.world);
    const repeated = applySocietyProtocol(6, result.state, result.world, prepared.turn, output, control);
    expect(repeated.code).toBe('already_applied'); expect(repeated.state).toBe(result.state);
    const stale = applySocietyProtocol(6, f.state, f.world, prepared.turn, output, { nowMs: 2001, generation: 1 });
    expect(stale.code).toBe('stale_control'); expect(stale.state).toBe(f.state);
  });

  it('makes only an explicitly notified reader eligible and invalidates their earlier preparation', () => {
    const f = fixture();
    const prior = prepareSocietyTurn(f.state, f.world, 'B', { nowMs: 1500, generation: 0, sequence: 0 });
    const begun = applySocietyProtocol(1, f.state, f.world, prior, { project: output.project }, { nowMs: 1501, generation: 0 });
    expect(begun.ok, begun.code).toBe(true);
    f.state = begun.state; f.world = begun.world;
    const first = prepareSocietyJob({ ...f, protocolVersion: 6 });
    const closed = applySocietyProtocol(6, f.state, f.world, first.turn,
      { ...output, message: { ...output.message, close: true } }, { nowMs: 2001, generation: 0 });
    expect(closed.ok).toBe(true);
    // Complete an actual private review before testing the later notification.
    // Advancing a success timestamp alone no longer acknowledges a channel.
    const review = prepareSocietyJob({ ...f, state: closed.state, world: closed.world, actor: 'B', nowMs: 2200 });
    const reviewed = applySocietyProtocol(6, closed.state, closed.world, review.turn,
      { record: { kind: 'draft', title: 'Private consideration', text: 'I will consider the request when its exact text is shared.',
        refs: [closed.state.conversations[0]!.turns[0]!.id], parent: null, audience: 'private', publish: false } },
      { nowMs: 2201, generation: 0 });
    expect(reviewed.ok, reviewed.code).toBe(true);
    closed.state = reviewed.state; closed.world = reviewed.world;
    for (const { id } of RESIDENTS) {
      closed.state.minds[id].lastSuccessAtMs = 2500;
      closed.state.minds[id].lastAttemptAtMs = 2500;
    }
    const input = { ...f, state: closed.state, world: closed.world, nowMs: 3000, sequence: 2, protocolVersion: 6 as const };
    const staleReader = prepareSocietyJob({ ...input, actor: 'B' });
    expect(nextSocietyActor(closed.state, 3000, 2)).toBeUndefined();
    const share = prepareSocietyJob(input), draft = closed.state.records.drafts[0]!;
    const result = applySocietyProtocol(6, closed.state, closed.world, share.turn,
      { record: { kind: 'share', draftId: draft.id, contentHash: draft.contentHash, audience: 'B' } },
      { nowMs: 3001, generation: 0 });
    expect(result.ok).toBe(true);
    expect(nextSocietyActor(result.state, 3002, 2)).toBe('B');
    expect(result.state.minds.B.memories.at(-1)).toMatchObject({ kind: 'observation', source: 'A' });
    expect(result.state.minds.B.memories.at(-1)!.text).toContain('not reading, endorsement, publication or payment');
    expect(result.state.minds.C).toEqual(closed.state.minds.C);
    const refused = applySocietyProtocol(6, result.state, result.world, staleReader.turn,
      { project: output.project, message: { to: 'A', text: 'Can we discuss the stores?' } }, { nowMs: 3002, generation: 0 });
    expect(refused.code).toBe('stale_mind'); expect(refused.state).toBe(result.state);
  });
});
