import { describe, expect, it } from 'vitest';
import { parseSocietyState } from './schema';
import { emptyRetrievalState, recordRetrievalStateSchema } from './retrieval-state';
import { recordAct, recordFixture } from './records-test-fixture';
import { societyPublicView } from './public';

describe('private record retrieval codec', () => {
  it('migrates codec2 without changing authored bytes, minds, counters or obligations', () => {
    const f = recordAct(recordFixture(), 'A', { kind: 'draft', title: 'Earlier account', text: 'Exact retained words.',
      refs: [], parent: null, audience: 'private', publish: false });
    const { retrieval, ...fields } = f.state;
    const old = { ...fields, version: 2 }, saved = JSON.stringify(old);
    const result = parseSocietyState(old);
    expect(result).toEqual({ ok: true, state: { ...old, version: 4, retrieval } });
    expect(JSON.stringify(old)).toBe(saved);
    expect(Object.keys(retrieval)).toHaveLength(25);
    expect(retrieval).toEqual(emptyRetrievalState());
  });

  it('round trips pending queries and exact focus without exposing them or fabricating document access', () => {
    let f = recordAct(recordFixture(), 'A', { kind: 'draft', title: 'First retained account', text: 'Exact first words.',
      refs: [], parent: null, audience: 'private', publish: false });
    const first = f.state.records.drafts[0];
    // The domain really evicts its oldest unbound draft at the 256-entry limit.
    for (let i = 0; i < 256; i++) f = recordAct(f, 'A', { kind: 'draft', title: `Later account ${i}`, text: 'Later words.',
      refs: [], parent: null, audience: 'private', publish: false });
    const before = societyPublicView(f.state);
    f.state.retrieval.A = { version: 1, revision: 2, query: 'private search phrase', cursor: 'private-cursor',
      focus: { draftId: first.id, contentHash: first.contentHash }, pending: true, lastSequence: f.state.minds.A.lastAppliedSequence };
    const serialized = JSON.stringify(f.state), decoded = parseSocietyState(JSON.parse(serialized));
    expect(decoded).toEqual({ ok: true, state: f.state });
    // An unavailable binding is preserved rather than pinning or inventing a draft.
    expect(f.state.records.drafts).toHaveLength(256);
    expect(f.state.records.drafts.some(draft => draft.id === first.id)).toBe(false);
    const after = societyPublicView(f.state);
    expect(after).toEqual(before);
    expect(after.version).toBe(2);
    expect(after.records).toBeDefined();
    for (const secret of ['private search phrase', 'private-cursor', first.id, 'retrieval', 'pending']) {
      expect(JSON.stringify(after)).not.toContain(secret);
    }
  });

  it('rejects an impossible future focus or changed retained hash, but not a lost access grant', () => {
    const f = recordAct(recordFixture(), 'A', { kind: 'draft', title: 'Author only', text: 'Private account.',
      refs: [], parent: null, audience: 'private', publish: false });
    const draft = f.state.records.drafts[0];
    f.state.minds.B.lastAppliedSequence = 0;
    f.state.retrieval.B = { version: 1, revision: 1, query: '', cursor: null,
      focus: { draftId: draft.id, contentHash: draft.contentHash }, pending: true, lastSequence: 0 };
    // ACLs are rechecked on serving content, not treated as global corruption.
    expect(parseSocietyState(f.state).ok).toBe(true);
    f.state.retrieval.B.focus!.contentHash = 'a'.repeat(64);
    expect(parseSocietyState(f.state)).toEqual({ ok: false, code: 'retrieval_focus_hash_mismatch' });
    f.state.retrieval.B.focus = { draftId: `record:draft:${f.state.records.nextId}`, contentHash: draft.contentHash };
    expect(parseSocietyState(f.state)).toEqual({ ok: false, code: 'unissued_retrieval_focus' });
  });

  it('rejects missing/foreign actors, hidden extension data in old codecs, and cursor progress ahead of a committed mind', () => {
    const { state } = recordFixture();
    const missing = structuredClone(state) as unknown as { retrieval: Record<string, unknown> };
    delete missing.retrieval.A;
    expect(parseSocietyState(missing).ok).toBe(false);
    expect(parseSocietyState({ ...state, retrieval: { ...state.retrieval, Z: state.retrieval.A } }).ok).toBe(false);
    expect(parseSocietyState({ ...state, version: 2 }).ok).toBe(false);
    expect(parseSocietyState({ ...state, version: 1 }).ok).toBe(false);
    state.retrieval.A = { ...state.retrieval.A, revision: 1, pending: true, lastSequence: 0 };
    expect(parseSocietyState(state)).toEqual({ ok: false, code: 'retrieval_cursor_ahead_of_mind' });
    state.minds.A.lastAppliedSequence = 0;
    expect(parseSocietyState(state).ok).toBe(true);
  });

  it('requires initial state to be empty and committed retrieval to have a revision', () => {
    const { state } = recordFixture();
    state.retrieval.A.pending = true;
    expect(parseSocietyState(state)).toEqual({ ok: false, code: 'uncommitted_retrieval_state' });
    state.minds.A.lastAppliedSequence = 0;
    state.retrieval.A.lastSequence = 0;
    expect(parseSocietyState(state)).toEqual({ ok: false, code: 'missing_retrieval_revision' });
  });

  it('bounds Unicode query and cursor state without rejecting valid supplementary characters', () => {
    const initial = emptyRetrievalState().A;
    expect(recordRetrievalStateSchema.safeParse({ ...initial, query: '🌱'.repeat(96) }).success).toBe(true);
    expect(recordRetrievalStateSchema.safeParse({ ...initial, query: '🌱'.repeat(97) }).success).toBe(false);
    expect(recordRetrievalStateSchema.safeParse({ ...initial, cursor: 'x'.repeat(256) }).success).toBe(true);
    expect(recordRetrievalStateSchema.safeParse({ ...initial, cursor: 'x'.repeat(257) }).success).toBe(false);
    for (const focus of [{ draftId: 'record:share:1', contentHash: 'a'.repeat(64) },
      { draftId: 'record:draft:1', contentHash: 'not-a-hash' },
      { draftId: 'record:draft:1', contentHash: 'a'.repeat(64), audience: 'public' }]) {
      expect(recordRetrievalStateSchema.safeParse({ ...initial, focus }).success).toBe(false);
    }
  });
});
