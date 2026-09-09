import { describe, expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { createSocietyState } from './state';
import { parseSocietyState } from './schema';

describe('legacy society document migration', () => {
  it('adds an empty extension without changing old minds, counters or obligations', () => {
    const current = createSocietyState(genesisState(), 1000);
    current.minds.A.lastSuccessAtMs = 1100;
    current.minds.A.revision = 7;
    current.minds.A.lastAppliedSequence = 23;
    current.revision = 42;
    const { records, retrieval, ...oldFields } = current;
    const old = { ...oldFields, version: 1 }, saved = JSON.stringify(old);
    const result = parseSocietyState(old);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.state).toEqual({ ...old, version: 4, records, retrieval });
    expect(JSON.stringify(old)).toBe(saved);
    expect(parseSocietyState(result.state)).toEqual(result);
  });
  it('does not silently discard records hidden in an old codec or accept missing v2 state', () => {
    const current = createSocietyState(genesisState(), 1000);
    expect(parseSocietyState({ ...current, version: 1 }).ok).toBe(false);
    const { records: _records, ...missing } = current;
    expect(_records).toBeDefined();
    expect(parseSocietyState(missing).ok).toBe(false);
    expect(parseSocietyState({ ...current, version: 5 }).ok).toBe(false);
  });
  it.each(['lastSequence', 'lastPublicationWatch'] as const)('rejects a record %s ahead of its committed mind', (field) => {
    const current = createSocietyState(genesisState(), 1000);
    current.records.cursors.A[field] = field === 'lastSequence' ? 0 : current.minds.A.lastPhysicalWatch + 1;
    expect(parseSocietyState(current)).toEqual({ ok: false, code: 'record_cursor_ahead_of_mind' });
  });
});
