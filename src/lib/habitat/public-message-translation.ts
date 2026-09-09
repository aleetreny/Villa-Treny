import type { AgencySnapshot } from './agency';
import type { ArchiveEntry } from './live';

type PublicTurn = AgencySnapshot['conversations'][number]['turns'][number];
type JournalEntry = Pick<ArchiveEntry, 'text' | 'day' | 'watch' | 'minute' | 'room' | 'who' | 'kind' | 'speech'>;
export type PresentedMessage = { text: string; translationLabel?: 'English translation' };

// Only these six already-public historical messages have a reviewed English
// translation. Provenance: docs/research/release-2026-09-08/
// public-dialogue-translations-115.json, public-dialogue-translation-turn-280.json
// public-dialogue-translation-turn-324.json and public-dialogue-translation-turn-419.json.
// Keep persisted text, API responses and future model input entirely original.
const HISTORICAL_MESSAGES = [
  {
    "turnId": "turn:116",
    "speaker": "P",
    "atMs": 1788876943005,
    "watch": 3,
    "minute": 720,
    "room": "hold",
    "source": "¡Vero, hijita! ¿Te enseño a hacer pan antes de que te vayas? Andá, que te lo pongo en la mano.",
    "english": "Vero, my dear! Shall I teach you to make bread before you leave? Come on, I'll put it in your hand."
  },
  {
    "turnId": "turn:155",
    "speaker": "V",
    "atMs": 1788878376517,
    "watch": 3,
    "minute": 720,
    "room": "garden",
    "source": "¡Claro, Pilar! Dame una mano con la masa, que quiero que mi propio horno no sea solo una metáfora.",
    "english": "Of course, Pilar! Give me a hand with the dough; I don't want my own oven to be just a metaphor."
  },
  {
    "turnId": "turn:227",
    "speaker": "P",
    "atMs": 1788880718892,
    "watch": 3,
    "minute": 720,
    "room": "hold",
    "source": "¡Vamos, Vero, hijita! Poné la harina y el agua, y yo te enseño a amasar con ritmo, ¿listita?",
    "english": "Come on, Vero, my dear! Put in the flour and water, and I'll teach you to knead with rhythm. Ready?"
  },
  {
    "turnId": "turn:280",
    "speaker": "V",
    "atMs": 1788884706557,
    "watch": 3,
    "minute": 720,
    "room": "garden",
    "requiresJournalSpeech": true,
    "source": "¡Dale, Pilar! Pasá la harina y el agua, y decime la proporción que le da ritmo al pan, que quiero que mi horno sea una fiesta, no solo una metáfora.",
    "english": "All right, Pilar! Pass the flour and water, and tell me the ratio that gives the bread its rhythm; I want my oven to be a celebration, not just a metaphor."
  },
  {
    "turnId": "turn:324",
    "speaker": "P",
    "atMs": 1788891420360,
    "watch": 3,
    "minute": 720,
    "room": "hold",
    "requiresJournalSpeech": true,
    "source": "¡Claro, hijita! La proporción es 5 partes de harina por 3 de agua, ¿tienes ya la harina a mano?",
    "english": "Of course, my dear! The ratio is 5 parts flour to 3 parts water; do you already have the flour to hand?"
  },
  {
    "turnId": "turn:419",
    "speaker": "V",
    "atMs": 1788901683450,
    "watch": 4,
    "minute": 1080,
    "room": "kitchen",
    "requiresJournalSpeech": true,
    "source": "¡Pilar, la harina ya está en la mesa, pero ¿qué tal si me das una pista de la temperatura ideal para que la masa se levante como una fiesta?",
    "english": "Pilar, the flour is already on the table, but how about giving me a hint about the ideal temperature for the dough to rise like a celebration?"
  }
] as const;

export function presentDialogueTurn(conversationId: string, turn: PublicTurn): PresentedMessage {
  const match = conversationId === 'conversation:115' && HISTORICAL_MESSAGES.find(entry =>
    entry.turnId === turn.id && entry.speaker === turn.speaker && entry.atMs === turn.atMs && entry.source === turn.text);
  return match ? { text: match.english, translationLabel: 'English translation' } : { text: turn.text };
}

export function presentJournalEntry(entry: JournalEntry): PresentedMessage {
  // New archives expose speech provenance, but not the real-world timestamp.
  // Require it for newly reviewed entries; preserve the original three matches
  // for older APIs. Supplied provenance must always agree with the exact copy.
  const match = entry.day === 107 && entry.kind === 'meeting'
    && entry.who.length === 2 && entry.who[0] === 'P' && entry.who[1] === 'V'
    && HISTORICAL_MESSAGES.find(message => message.watch === entry.watch && message.minute === entry.minute
      && message.room === entry.room && `${message.speaker}: ${message.source}` === entry.text
      && (entry.speech ? entry.speech.speaker === message.speaker && entry.speech.turnId === message.turnId
        : !('requiresJournalSpeech' in message && message.requiresJournalSpeech)));
  return match ? { text: `${match.speaker}: ${match.english}`, translationLabel: 'English translation' } : { text: entry.text };
}
