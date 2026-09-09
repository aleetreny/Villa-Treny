import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { genesisState, type WorldState } from '../../../src/lib/habitat/engine/state';
import { RESIDENTS, type ResidentId } from '../../../src/lib/habitat/residents';
import { createSocietyState, markSocietyAttempt } from '../../../src/lib/habitat/society/state';
import { prepareSocietyTurn } from '../../../src/lib/habitat/society/turn';
import { SOCIETY_LIMITS, type SocietyState } from '../../../src/lib/habitat/society/types';
import { nextSocietyActor, prepareSocietyJob, COGNITION_FAILURE_BACKOFF_MS } from '../src/society-scheduler';
import { applySocietyProtocol } from '../src/society-protocol';

type Fixture = { state: SocietyState; world: WorldState; nowMs: number; sequence: number };
const project = { mode: 'replace', goal: 'Compare a proposal when the other person is available.',
  why: 'I want an answer before deciding.', visibility: 'private', steps: [] };
const fixture = (): Fixture => {
  const world = genesisState(91);
  return { world, state: createSocietyState(world, 1000), nowMs: 2000, sequence: 0 };
};
const prepare = (f: Fixture, actor: ResidentId, protocolVersion: 3 | 4 | 5 | 6 = 6) => prepareSocietyJob({
  ...f, actor, sequence: f.sequence + 1, generation: 0, worldRevision: f.sequence,
  habitatId: 'offline-closing-review', protocolVersion,
});
function act(f: Fixture, actor: ResidentId, raw: unknown) {
  const prepared = prepare(f, actor);
  const result = applySocietyProtocol(6, f.state, f.world, prepared.turn, raw, { nowMs: f.nowMs + 1, generation: 0 });
  expect(result.ok, result.code).toBe(true);
  f.state = result.state; f.world = result.world; f.sequence += 1; f.nowMs += 100;
  return prepared;
}
const only = (actor: ResidentId) => new Set(RESIDENTS.map(r => r.id).filter(id => id !== actor));
const context = (prompt: string) => JSON.parse(prompt.slice(prompt.lastIndexOf('\n{') + 1)) as {
  conversation: unknown; receivedClosure?: { conversationId: string; status: string; turn: { id: string; text: string } };
  memories: Array<{ text: string }>; records: { referenceAccess: { public: string[] } };
};
function closedFixture() {
  const f = fixture();
  act(f, 'B', { project, message: { to: 'C', text: 'I will think about my own proposal now.', close: true } });
  // Four real private reviews outrank the unrelated final message in the
  // previous memory retrieval. They do not fabricate events or change the goal.
  for (let i = 0; i < 4; i++) act(f, 'B', { reflection: {
    text: 'Compare a proposal when the other person is available. My own proposal still needs an answer before deciding.',
    refs: ['world:100:1'],
  } });
  act(f, 'A', { project, message: { to: 'B', text: 'I do not want this exchange to continue today.', close: true } });
  return f;
}

describe('closed conversation review', () => {
  it('retains an actual incoming closure in new P6 even when ranked memories omit it, without exposing another pair', () => {
    const f = closedFixture(), final = f.state.conversations.at(-1)!.turns.at(-1)!;
    const before = structuredClone(f.state);
    const raw = prepareSocietyTurn(f.state, f.world, 'B', {
      nowMs: f.nowMs, sequence: f.sequence + 1, generation: 0, maxPromptBytes: 6500,
    });
    expect(raw.prompt).not.toContain(final.text);
    expect(raw.evidenceIds).not.toContain(final.id);
    const issued = prepare(f, 'B'), shown = context(issued.turn.prompt);
    expect(shown.conversation).toBeNull();
    expect(shown.receivedClosure).toEqual({ conversationId: f.state.conversations.at(-1)!.id, status: 'closed',
      turn: { id: final.id, speaker: 'A', text: final.text, atMs: final.atMs } });
    expect(issued.turn.evidenceIds).toContain(final.id);
    expect(shown.records.referenceAccess.public).toContain(final.id);
    expect(prepare(f, 'D').turn.prompt).not.toContain(final.text);
    for (const version of [3, 4, 5] as const) {
      const older = prepare(f, 'B', version);
      expect(older.turn.prompt).not.toContain('receivedClosure');
      expect(older.turn.evidenceIds).not.toContain(final.id);
    }
    expect(f.state).toEqual(before);
  });

  it('makes only the recipient eligible and consumes the opportunity with one private review, without reopening or consenting', () => {
    const f = closedFixture(), before = structuredClone(f.state.conversations), world = structuredClone(f.world);
    const final = f.state.conversations.at(-1)!.turns.at(-1)!;
    expect(nextSocietyActor(f.state, f.nowMs, f.sequence, only('B'))).toBe('B');
    expect(nextSocietyActor(f.state, f.nowMs, f.sequence, only('A'))).toBeUndefined();
    const issued = prepare(f, 'B'), savedBytes = JSON.stringify(issued);
    const review = { reflection: { text: 'I will leave this exchange closed and think privately.', refs: [final.id] } };
    expect(z.fromJSONSchema(issued.job.outputContract.jsonSchema as Record<string, unknown>).safeParse(review).success).toBe(true);
    act(f, 'B', review);
    expect(nextSocietyActor(f.state, f.nowMs, f.sequence, only('B'))).toBeUndefined();
    expect(context(prepare(f, 'B').turn.prompt).receivedClosure).toBeUndefined();
    before.at(-1)!.attentionThrough[1] = before.at(-1)!.revision;
    expect(f.state.conversations).toEqual(before); expect(f.world).toEqual(world);
    expect(f.state.offers).toHaveLength(0); expect(f.state.agreements).toHaveLength(0);
    const duplicate = applySocietyProtocol(6, f.state, f.world, issued.turn, review, { nowMs: f.nowMs, generation: 0 });
    expect(duplicate.code).toBe('already_applied'); expect(duplicate.state).toBe(f.state);
    expect(JSON.stringify(issued)).toBe(savedBytes);
  });

  it('allows another available contact rather than forcing an answer to the closed exchange', () => {
    const f = closedFixture(), closed = structuredClone(f.state.conversations.at(-1));
    act(f, 'B', { message: { to: 'D', text: 'Dina, may we compare a proposal another time?' } });
    closed!.attentionThrough[1] = closed!.revision;
    expect(f.state.conversations.find(c => c.id === closed!.id)).toEqual(closed);
    expect(f.state.conversations.at(-1)).toMatchObject({ participants: ['B', 'D'], status: 'open', nextSpeaker: 'D' });
  });

  it('retains failure backoff while a received closure remains unreviewed', () => {
    const f = closedFixture(), failedAt = f.nowMs;
    f.state = markSocietyAttempt(f.state, 'B', failedAt);
    expect(nextSocietyActor(f.state, failedAt, f.sequence, only('B'))).toBeUndefined();
    expect(nextSocietyActor(f.state, failedAt + COGNITION_FAILURE_BACKOFF_MS - 1, f.sequence, only('B'))).toBeUndefined();
    expect(nextSocietyActor(f.state, failedAt + COGNITION_FAILURE_BACKOFF_MS, f.sequence, only('B'))).toBe('B');
    expect(context(prepare(f, 'B').turn.prompt).receivedClosure).toBeDefined();
  });

  it('acknowledges only the exact closing message delivered by a saved P6 preparation', () => {
    const f = closedFixture(), older = f.state.conversations.at(-1)!;
    act(f, 'D', { project, message: { to: 'B', text: 'I am ending my separate exchange here.', close: true } });
    const latest = f.state.conversations.at(-1)!, before = structuredClone(f.state.conversations);
    const shown = context(prepare(f, 'B').turn.prompt).receivedClosure!;
    expect(shown.conversationId).toBe(latest.id);
    act(f, 'B', { reflection: { text: 'I will consider the closing words that reached me.', refs: [shown.turn.id] } });
    before.at(-1)!.attentionThrough[1] = latest.revision;
    expect(f.state.conversations).toEqual(before);
    expect(f.state.conversations.find(c => c.id === older.id)!.attentionThrough[1]).toBe(0);
    // P8 still schedules the other retained, unacknowledged exchange even
    // though the older P6 timestamp-based closure helper now omits it.
    expect(context(prepare(f, 'B').turn.prompt).receivedClosure).toBeUndefined();
    expect(nextSocietyActor(f.state, f.nowMs, f.sequence, only('B'))).toBe('B');
  });

  it('leaves every channel marker untouched when a saved P7 turn only requests a record lookup', () => {
    const f = closedFixture(), before = structuredClone(f.state.conversations);
    const prepared = prepareSocietyJob({ ...f, actor: 'B', sequence: f.sequence + 1, generation: 0,
      worldRevision: f.sequence, habitatId: 'offline-closing-lookup', protocolVersion: 7 });
    expect(context(prepared.turn.prompt).receivedClosure).toBeDefined();
    const result = applySocietyProtocol(7, f.state, f.world, prepared.turn,
      { lookup: { kind: 'search', query: 'water' } }, { nowMs: f.nowMs + 1, generation: 0 });
    expect(result.ok, result.code).toBe(true);
    expect(result.state.conversations).toEqual(before);
    expect(result.state.retrieval.B.pending).toBe(true);
    expect(result.world).toEqual(f.world);
  });

  it('offers the last recipient one review when the existing turn cap closes the conversation automatically', () => {
    const f = fixture();
    for (let i = 0; i < SOCIETY_LIMITS.turns; i++) {
      const actor = i % 2 === 0 ? 'A' : 'B', to = actor === 'A' ? 'B' : 'A';
      act(f, actor, { ...(!f.state.minds[actor].project ? { project } : {}), message: { to, text: `This is consideration ${i + 1}.` } });
    }
    const conversation = f.state.conversations[0]!;
    expect(conversation.status).toBe('closed'); expect(conversation.nextSpeaker).toBeNull();
    expect(nextSocietyActor(f.state, f.nowMs, f.sequence, only('A'))).toBe('A');
    expect(nextSocietyActor(f.state, f.nowMs, f.sequence, only('B'))).toBeUndefined();
    expect(context(prepare(f, 'A').turn.prompt).receivedClosure?.turn.id).toBe(conversation.turns.at(-1)!.id);
  });
});
