// What it felt like.
//
// The record says what happened. This says what it was like to be there, once a
// week, in the first person, in that resident's own register. The two never
// overlap and they are not meant to agree: the record is the world's account and
// this is somebody's.
//
// Week fourteen is the last one before the visitor arrives, and it is authored.
// Everything after it will be generated — one entry per resident per week, which
// is three or four model calls a day and the cheapest intimacy in the design.
// Each entry is held to the voice pinned in residents.ts, which is the only thing
// stopping twenty-five journals from converging into one.

import type { ResidentId } from './residents';

export type Entry = {
  who: ResidentId;
  /** Weeks since the crash. Day one hundred falls in week fourteen. */
  week: number;
  text: string;
};

export const JOURNAL: readonly Entry[] = [
  {
    who: 'A', week: 14,
    text:
      'Is a record allowed to notice things? I wrote down that it was warm in the '
      + 'Common on the ninth and that Pilar had the burners on for longer than the '
      + 'bread needed. Neither is an event. I put them in anyway. Nobody reads it.',
  },
  {
    who: 'B', week: 14,
    text:
      'Asked Halim four questions today and he answered all of them, which I think '
      + 'means he does not mind. Everyone here has a whole life already finished '
      + 'behind them. I have a job I did for eleven years and no idea what it was for.',
  },
  {
    who: 'C', week: 14,
    text:
      'Nobody will sit down and write the criteria with me. They would rather I '
      + 'decided alone and resented me for it than agree in advance what a good '
      + 'reason to wake somebody is. I will keep asking. The asking is the work.',
  },
  {
    who: 'D', week: 14,
    text:
      'Three suits, twenty-five people, and a list that anybody can read. In '
      + 'principle that is transparent. In practice they think I like it. I do not '
      + 'like it. I have counted the tether twice a day since the eleventh.',
  },
  {
    who: 'E', week: 14,
    text:
      'I took apart the material remains of dead people for thirty years and I was '
      + 'good at it. Here they ask me who a bay belongs to and I say something '
      + 'careful and they go away satisfied. I am not sure that is the same skill.',
  },
  {
    who: 'F', week: 14,
    text:
      'Mara laughed at something I said and then looked at me the way she does, '
      + 'and I thought: she likes me and does not trust me, and she is right about '
      + 'both. Forty years of being the one who carries things between people.',
  },
  {
    who: 'G', week: 14,
    text:
      'Found a seam on the lower deck that has moved two millimetres since the '
      + 'sixtieth. Told Halim. He wrote it down without arguing, which after twenty '
      + 'years I find harder to take than the arguing.',
  },
  {
    who: 'H', week: 14,
    text:
      'The roster was posted on time and worked. It is not thanked and should not '
      + 'need to be. It was, however, noticed that bay three has been contested four '
      + 'times and that no procedure exists. It is not for me to invent one alone.',
  },
  {
    who: 'I', week: 14,
    text:
      'Drew the fourth gallery again. Everyone will see this place the way I put it '
      + 'down and nobody has said so, including me. Twenty-two years of being one '
      + 'thing I did. Here I am the person who knows where the corners are.',
  },
  {
    who: 'J', week: 14,
    text:
      'I drove a bus. I want that written down somewhere that is not the manifest. '
      + 'Wen watched me get the allocation wrong on Tuesday and did not say '
      + 'anything, and then on Wednesday showed me a thing about the panel that '
      + 'meant I could not get it wrong the same way again.',
  },
  {
    who: 'K', week: 14,
    text:
      'Recorded the Well at the third watch. It has a low note in it about eleven '
      + 'seconds long that I cannot hear when I am standing in the room. I keep '
      + 'playing it back. I have not told anybody I am doing this.',
  },
  {
    who: 'L', week: 14,
    text:
      'Best week yet. Pulled forty kilos of good plate out of the near section, '
      + 'sorted it, and Quim came and looked at it for a long time without saying '
      + 'anything, which from him is applause. Pilar still looks at me oddly.',
  },
  {
    who: 'M', week: 14,
    text:
      'Now then. We ate together every night this week without anybody arranging '
      + 'it, and Vero came twice, which is twice more than the week before. That is '
      + 'not nothing. Iris eats at the far end and I have not moved to fix it.',
  },
  {
    who: 'N', week: 14,
    text:
      'Ulla is better at this than I am and we both know it and neither of us has '
      + 'said it out loud. I keep asking her opinion in a way I hope reads as '
      + 'respect. Somebody here has a face I know from a room I would rather forget.',
  },
  {
    who: 'O', week: 14,
    text:
      'Filters: eleven. Changed one. She was in the Common when I came through and '
      + 'we both said something about the food. Nineteen years and we talk about '
      + 'the food. The tide goes out slower than this.',
  },
  {
    who: 'P', week: 14,
    text:
      'Hands were bad on the eleventh and good after. Fed everybody, twice on the '
      + 'ninth. The little one asks questions while I work and I let her, hijo, she '
      + 'has nobody. Somebody should learn the bread. I have not asked anybody.',
  },
  {
    who: 'Q', week: 14,
    text:
      'Started nothing of my own again. Fixed Ulla’s hinge, fixed the stove door, '
      + 'reground three bits for Xan. Every one of them better than it was, and '
      + 'nothing with my mark on it. Home, I know. I know.',
  },
  {
    who: 'R', week: 14,
    text:
      'Crate nine: fastenings, unlabelled, one hundred and sixty. Catalogued. Crate '
      + 'ten tomorrow. It is good work and there is a great deal of it left. '
      + 'Somebody said thank you on the tenth. Writing it down so as not to forget.',
  },
  {
    who: 'S', week: 14,
    text:
      'Sat where people pass. Four of them stopped. That is the week. Ama asked me '
      + 'about the water at Kilbeg and I told her about the harbour and not about '
      + 'the other thing. Some weather coming, I would say, if there were weather.',
  },
  {
    who: 'T', week: 14,
    text:
      'Cells counted: down four on the week, and the reactor accounts for two of '
      + 'them. The other two are unaccounted for and that is the third week running. '
      + 'Vero will not talk to me about her mother. The ledger does not balance.',
  },
  {
    who: 'U', week: 14,
    text:
      'Thirty years of paediatrics and I am second to a GP who is sixteen years '
      + 'younger and doing her best, which is the most annoying combination '
      + 'available. Osvald has not looked at me directly since the seventh.',
  },
  {
    who: 'V', week: 14,
    text:
      'Two of them sat under my lamps for an hour and a half on the twelfth doing '
      + 'absolutely nothing and I said nothing, and then I was furious for the rest '
      + 'of the day. It is the only green in the place. That is the problem.',
  },
  {
    who: 'W', week: 14,
    text:
      'Juno is learning fast. The panel has two outputs drawing power to somewhere '
      + 'nobody has found and I have not raised it. That is twice now that I have '
      + 'known a thing and kept it. I am starting to think it is not a decision.',
  },
  {
    who: 'X', week: 14,
    text:
      'Cut eleven metres. Face is running true now. Back’s been at me since '
      + 'Tuesday. Ama asked about her father again, the way she does about once a '
      + 'year, and I said what I always say, which is not much.',
  },
  {
    who: 'Y', week: 14,
    text:
      'Went back to the gallery wall four times. It is still not good. Nobody has '
      + 'a job for me and nobody has come looking, and I have all the hours there '
      + 'are, which everybody else would kill for and I would trade tomorrow.',
  },
];

export function journalOf(id: ResidentId): readonly Entry[] {
  return JOURNAL.filter((e) => e.who === id).sort((a, b) => b.week - a.week);
}
