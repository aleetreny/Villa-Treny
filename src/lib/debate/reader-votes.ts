import { z } from 'zod';
import { CHARACTER_IDS, type CharacterId } from './characters';

/** The reader's own pick for each debate ("who made the strongest case?").
 * Kept only in this browser's localStorage; it is never sent anywhere. */
const KEY = 'villa-treny:reader-votes';
const votesSchema = z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.enum(CHARACTER_IDS));
export type ReaderVotes = Record<string, CharacterId>;

export function readVotes(): ReaderVotes {
  try { const parsed = votesSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? '{}')); return parsed.success ? parsed.data : {}; }
  catch { return {}; }
}
export function saveVote(date: string, id: CharacterId | null): ReaderVotes {
  const votes = readVotes();
  if (id) votes[date] = id; else delete votes[date];
  try { localStorage.setItem(KEY, JSON.stringify(votes)); } catch { /* private mode: the vote lasts for this visit */ }
  return votes;
}

export type ReaderRecord = { votes: number; compared: number; agreed: number; favourite: CharacterId[]; favouriteCount: number };
/** How the reader's picks compare with the residents' jury on dates that have a verdict. */
export function readerRecord(votes: ReaderVotes, winners: Record<string, CharacterId[]>): ReaderRecord {
  const dates = Object.keys(votes), judged = dates.filter(d => winners[d]?.length);
  const counts = CHARACTER_IDS.map(id => dates.filter(d => votes[d] === id).length), top = Math.max(0, ...counts);
  return { votes: dates.length, compared: judged.length, agreed: judged.filter(d => winners[d]!.includes(votes[d]!)).length,
    favourite: top ? CHARACTER_IDS.filter((_, i) => counts[i] === top) : [], favouriteCount: top };
}
