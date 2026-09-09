import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import matrix from '../../../docs/research/release-2026-09-08/public-dialogue-translations-115.json';
import fourth from '../../../docs/research/release-2026-09-08/public-dialogue-translation-turn-280.json';
import fifth from '../../../docs/research/release-2026-09-08/public-dialogue-translation-turn-324.json';
import sixth from '../../../docs/research/release-2026-09-08/public-dialogue-translation-turn-419.json';
import { presentDialogueTurn, presentJournalEntry } from './public-message-translation';
import type { ResidentId } from './residents';
import type { ArchiveEntry } from './live';

const entries = [...matrix.entries, ...fourth.entries, ...fifth.entries, ...sixth.entries];
const turns = entries.map(entry => ({ id: entry.turnId, speaker: entry.speaker as ResidentId,
  text: entry.sourceText, atMs: entry.atMs }));
const journal: ArchiveEntry[] = entries.map(entry => ({ text: entry.journal.sourceText,
  day: entry.journal.day, watch: entry.journal.watch, minute: entry.journal.minute,
  room: entry.journal.room as ArchiveEntry['room'], who: entry.journal.who as ResidentId[], kind: 'meeting',
  ...('speech' in entry.journal ? { speech: { speaker: entry.speaker as ResidentId, turnId: entry.turnId } } : {}) }));

describe('reviewed historical public-message translations', () => {
  it('matches all six preserved source hashes and gives both views the same reviewed translation without mutation', () => {
    const before = structuredClone({ turns, journal });
    for (const [i, entry] of entries.entries()) {
      expect(createHash('sha256').update(turns[i].text).digest('hex')).toBe(entry.sourceTextSha256);
      expect(createHash('sha256').update(journal[i].text).digest('hex')).toBe(entry.journal.sourceTextSha256);
      expect(presentDialogueTurn(entry.conversationId, Object.freeze(turns[i]))).toEqual({ text: entry.translation, translationLabel: 'English translation' });
      expect(presentJournalEntry(Object.freeze(journal[i]))).toEqual({ text: entry.journal.translation, translationLabel: 'English translation' });
    }
    expect({ turns, journal }).toEqual(before);
  });

  it('requires every later message’s exact turn, author, timestamp and public Journal provenance', () => {
    for (let index = matrix.entries.length; index < entries.length; index++) {
      const original = turns[index], archived = journal[index];
      const otherSpeaker = original.speaker === 'P' ? 'V' as const : 'P' as const;
      for (const change of [{ id: `${original.id}:other` }, { speaker: otherSpeaker },
        { atMs: original.atMs + 1 }, { text: `${original.text} ` }]) {
        const changed = { ...original, ...change };
        expect(presentDialogueTurn('conversation:115', changed)).toEqual({ text: changed.text });
      }
      expect(presentDialogueTurn('conversation:116', original)).toEqual({ text: original.text });
      for (const speech of [undefined, { speaker: otherSpeaker, turnId: original.id },
        { speaker: original.speaker, turnId: turns[0].id }]) {
        expect(presentJournalEntry({ ...archived, speech })).toEqual({ text: archived.text });
      }
      for (const clock of [{ minute: archived.minute + 1 }, { watch: archived.watch === 3 ? 4 : 3 },
        { watch: archived.watch === 3 ? 4 : 3, minute: archived.minute === 720 ? 1080 : 720 }]) {
        expect(presentJournalEntry({ ...archived, ...clock })).toEqual({ text: archived.text });
      }
    }
    // The older three still work with an older API, but conflicting supplied
    // provenance can never relabel another event as this historical message.
    expect(presentJournalEntry({ ...journal[1], speech: { speaker: 'V', turnId: 'turn:280' } })).toEqual({ text: journal[1].text });
  });

  it('does not translate a near-match, copied text in another turn, actor, conversation or timestamp', () => {
    const original = turns[0];
    for (const change of [{ text: `${original.text} ` }, { text: original.text.normalize('NFD') },
      { text: `Other claim: ${original.text}` }, { text: '¡Vero, hijita! A new message.' },
      { id: 'turn:117' }, { speaker: 'V' as const }, { atMs: original.atMs + 1 }]) {
      const turn = { ...original, ...change };
      expect(presentDialogueTurn('conversation:115', turn)).toEqual({ text: turn.text });
    }
    expect(presentDialogueTurn('conversation:116', original)).toEqual({ text: original.text });
  });

  it('does not translate Journal text without its exact prefix, clock, location, kind and participants', () => {
    const original = journal[0];
    const changes: Partial<ArchiveEntry>[] = [{ text: turns[0].text }, { text: original.text.replace('P:', 'V:') },
      { text: `${original.text}!` }, { day: 108 }, { watch: 4 }, { minute: 721 }, { room: 'garden' },
      { kind: 'note' }, { who: ['V', 'P'] }, { who: ['P'] }, { who: ['P', 'V', 'A'] }, { who: ['P', 'A'] }];
    for (const change of changes) {
      const entry = { ...original, ...change };
      expect(presentJournalEntry(entry)).toEqual({ text: entry.text });
    }
  });

  it('leaves unlisted English and Spanish content, including markup-looking strings, untouched and unlabelled', () => {
    for (const text of ['Thank you for the bread.', 'Otra frase en español.', '<script>alert("original")</script>', '']) {
      expect(presentDialogueTurn('conversation:115', { ...turns[0], text })).toEqual({ text });
      expect(presentJournalEntry({ ...journal[0], text })).toEqual({ text });
    }
  });
});
