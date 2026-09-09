import { describe, expect, it } from 'vitest';
import { archivedSpeech, isArchivedSpeech } from './archive-message';

const entry = { kind: 'meeting', text: 'Q: Here are two cells.', who: ['G', 'Q'] as const };
const id = 'habitat-canonical:mind:Q:5:50:g:3:turn:263';

describe('archived speech provenance', () => {
  it('projects a real archived turn without interpreting the claim or changing history', () => {
    const before = structuredClone(entry);
    const speech = archivedSpeech('habitat-canonical', id, entry);
    expect(speech).toEqual({ speaker: 'Q', turnId: 'turn:263' });
    expect(isArchivedSpeech(speech, entry)).toBe(true);
    expect(entry).toEqual(before);
  });

  it('does not classify speech from words, a historical routine, another habitat or a malformed actor', () => {
    for (const happening of ['habitat-canonical:world:29:watch:happening:4',
      'different:mind:Q:5:50:g:3:turn:263', 'habitat-canonical:mind:Z:5:50:g:3:turn:263',
      'habitat-canonical:mind:Q:5:50:g:3:turn:263:extra', 'habitat-canonical:mind:Q:5:50:g:3:turn:-1']) {
      expect(archivedSpeech('habitat-canonical', happening, entry)).toBeUndefined();
    }
    for (const changed of [{ ...entry, text: 'Quim transferred two cells.' }, { ...entry, text: 'G: Here are two cells.' },
      { ...entry, kind: 'work' }, { ...entry, who: ['A', 'B'] as const }, { ...entry, who: ['Q', 'Q'] as const }]) {
      expect(archivedSpeech('habitat-canonical', id, changed)).toBeUndefined();
    }
  });

  it('rejects malformed public provenance and inconsistent sender attribution', () => {
    for (const metadata of [null, [], { speaker: 'Q', turnId: 'turn:263', approved: true },
      { speaker: 'G', turnId: 'turn:263' }, { speaker: 'Q', turnId: 'anything' }, { speaker: 'Z', turnId: 'turn:1' }]) {
      expect(isArchivedSpeech(metadata, entry)).toBe(false);
    }
  });
});
