// The twenty-five.
//
// Authored before the simulation runs, so that what the engine changes about a
// person is measurable against something real. A resident's initial is their
// identity on a grid and in the weave, which is why no two share one and why the
// alphabet stops at Y.
//
// `voice` is not a mood note. One model writing twenty-five journals will converge
// on a single register unless the register is pinned per person, so this is a hard
// constraint on that resident's generated prose.
//
// `boarding` is how each of them came to be aboard. Read together the twenty-five
// do not add up, and they are not going to: about a third are entirely ordinary, a
// third are odd in a way anybody would have rationalised at the time, and a handful
// do not sit down at all. Nothing here resolves it, because nothing anywhere does.
//
// The prose was authored in docs/superpowers/specs/2026-08-31-habitat-residents.md,
// which remains the design record. This file is the source of truth for the code.

import type { RoomId } from './rooms';

export type ResidentId =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y';

export type Cluster = 'I' | 'II' | 'III' | 'IV' | 'V';

/** Physical access inherited from wherever somebody happened to be standing when
 *  the triage woke them. Nobody chose this and nobody can undo it. */
export type Key = Extract<RoomId, 'workshops' | 'dock' | 'infirmary'>;

export type Resident = {
  id: ResidentId;
  name: string;
  /** At the crash. */
  age: number;
  cluster: Cluster;
  /** What they did before. */
  was: string;
  /** What the ship's triage gave them from a thin file. Several are plainly wrong. */
  duty: string | null;
  keys: readonly Key[];
  /** The life before, and who they are a hundred days in. */
  before: string;
  fears: string;
  wants: string;
  /** How they came to be aboard. */
  boarding: string;
  /** A hard constraint on this resident's generated prose. */
  voice: string;
};

export const RESIDENTS: readonly Resident[] = [
  {
    id: 'A',
    name: 'Ama Oyelaran',
    age: 59,
    cluster: 'I',
    was: 'Ran a small press; printed other people\'s books',
    duty: 'Records',
    keys: [],
    before:
      'Ran a small press for thirty-one years and printed other people\'s '
      + 'books. Good ones, mostly. She was the reason several of them existed '
      + 'and her name is in none of them. Grew up in Kilbeg, in a house four '
      + 'doors from the water. Her father drowned when she was four; she has '
      + 'one memory of him that she is fairly sure she constructed. A hundred '
      + 'days in she has quietly made the event record beautiful. Nobody asked '
      + 'her to and nobody has noticed. She has begun leaving small notes in '
      + 'the margins of it — the weather in the Common, who sat with whom — '
      + 'which is not what Records is for.',
    fears:
      'Having spent a life on other people\'s words.',
    wants:
      'To write something, and has never once said so aloud.',
    boarding:
      'A cultural passage grant, from a foundation whose name she cannot now '
      + 'recall and whose letter she no longer has.',
    voice:
      'Precise, bookish, asks questions instead of making statements. Notices '
      + 'objects before people. Never uses an intensifier.',
  },
  {
    id: 'B',
    name: 'Bex Ferreira',
    age: 33,
    cluster: 'V',
    was: 'Booking agent',
    duty: 'Stores and inventory',
    keys: [],
    before:
      'The youngest by four years. Sold passages for a living: thousands of '
      + 'them, from a booth, to people going somewhere better. Good at the job '
      + 'in the way that leaves no trace — she remembers the systems and not '
      + 'the faces. A hundred days in she is treating the older residents as a '
      + 'resource to be extracted from, and it is working: she has learned more '
      + 'than anybody. It reads as eagerness and is closer to fear. She is the '
      + 'only one aboard with no completed life behind her, which she '
      + 'experiences as being the only one with nothing to say.',
    fears:
      'Not being taken seriously, which makes her agree too fast.',
    wants:
      'To be consulted about something once.',
    boarding:
      'A staff-discount fare, approved by a manager who had already left the '
      + 'company. Payroll lag; she assumed.',
    voice:
      'Quick, over-apologetic, service language that has become personality — '
      + 'no problem at all, let me just check that for you. Fills silences.',
  },
  {
    id: 'C',
    name: 'Cato Lindqvist',
    age: 45,
    cluster: 'V',
    was: 'Neurologist',
    duty: 'The cold bed in the Infirmary',
    keys: ['infirmary'],
    before:
      'Neurologist. Spent his career telling people what was going to happen '
      + 'to them, accurately and on time, and came to believe that the kindness '
      + 'was in the accuracy. Colleagues found him cold. Patients, often, did '
      + 'not. The triage gave him the cold bed because his was the only doctor- '
      + 'shaped file, so the man who diagnoses people also decides who is '
      + 'woken. He has thought about that more than anybody realises and it has '
      + 'not made him hesitate, which is the thing about him that frightens '
      + 'people. He and Noor Rahimi are the habitat\'s two medical files and '
      + 'they agree on almost nothing about what medicine is for.',
    fears:
      'Sentiment corrupting a judgement.',
    wants:
      'The criteria for waking somebody to be written down before they are '
      + 'needed, and cannot get anybody to sit down and write them.',
    boarding:
      'A research position at the colony, studying a condition with almost no '
      + 'cases there. Which is the reason they would want a specialist.',
    voice:
      'Exact. Uses the correct term and does not soften it. Short '
      + 'declaratives. Does not do reassurance and will not pretend to.',
  },
  {
    id: 'D',
    name: 'Dima Vashenko',
    age: 52,
    cluster: 'II',
    was: 'Shipyard safety officer',
    duty: 'The dock and the three suits',
    keys: ['dock'],
    before:
      'Shipyard safety officer for nineteen years, which is a job made '
      + 'entirely of telling people they cannot do the thing they were about to '
      + 'do. He was mostly right. Once he signed a log he should not have '
      + 'signed, and nothing happened, and the nothing has been happening ever '
      + 'since. He holds the suits. Three of them, for twenty-five people, and '
      + 'every trip outside goes through him. He has been scrupulous about it '
      + 'to a degree that irritates everybody and that he cannot moderate, '
      + 'because the scruple is the apology.',
    fears:
      'Being found out, without being able to name what for.',
    wants:
      'The next hundred days to be as uneventful as the last hundred.',
    boarding:
      'A relocation allowance from a department that dissolved during the '
      + 'transfer. He filed it four times and eventually somebody paid it.',
    voice:
      'Procedural, hedged, over-qualified. Says in principle and as such. '
      + 'Explains the reason before the answer, always.',
  },
  {
    id: 'E',
    name: 'Edda Halvorsen',
    age: 56,
    cluster: 'V',
    was: 'Solicitor, estates and liquidation',
    duty: 'Allocation and disputes',
    keys: [],
    before:
      'Thirty years of estates and liquidations: she took apart the material '
      + 'remains of dead people for a living and was very good at it. She has '
      + 'seen what a life looks like itemised, which is a thing you cannot '
      + 'unsee. The habitat\'s proto-legal function fell to an actual lawyer, '
      + 'which everybody finds reassuring, and it has made her the most '
      + 'listened-to person aboard. She is careful with that and does not enjoy '
      + 'it as much as she expected to. She is fluent on every subject except '
      + 'one.',
    fears:
      'Having been a mechanism rather than a person.',
    wants:
      'To be argued with by somebody who is not intimidated.',
    boarding:
      'She spent thirty years liquidating other people\'s lives and then, at '
      + 'fifty-six, liquidated her own — everything, at once, with no post and '
      + 'no destination arranged. She will not say why. It is the only question '
      + 'that makes her stop talking.',
    voice:
      'Measured, structured, numbers her points. Warmth arrives late in a '
      + 'sentence and is usually real. Goes flat and short when the subject is '
      + 'herself.',
  },
  {
    id: 'F',
    name: 'Ferran Solé',
    age: 60,
    cluster: 'III',
    was: 'Structural draughtsman',
    duty: 'Excavation survey',
    keys: [],
    before:
      'Structural draughtsman, and for thirty years the man who knew '
      + 'everybody. He carried words between people — kindly, mostly — and was '
      + 'present at the beginning and end of several friendships that were not '
      + 'his. He is aware of what he is. It is not quite remorse. A hundred '
      + 'days in he has made himself useful to everyone and indispensable to '
      + 'nobody, which is a lifelong pattern he can see and cannot break. He is '
      + 'the best company in the habitat and the last person anybody tells a '
      + 'secret to.',
    fears:
      'That he has no opinions that did not begin as somebody else\'s.',
    wants:
      'To be the centre rather than the connective tissue, for once.',
    boarding:
      'An advisory post at the colony that he could not find a listing for '
      + 'afterwards. Recruiters exaggerate; he has been on the other side of '
      + 'that.',
    voice:
      'Anecdotal, digressive, drops names. Deflects with a joke exactly when '
      + 'a straight answer was available. Very funny.',
  },
  {
    id: 'G',
    name: 'Gita Raman',
    age: 58,
    cluster: 'II',
    was: 'Hull inspector',
    duty: 'Hull integrity',
    keys: [],
    before:
      'Hull inspector. Spent a career finding faults in other people\'s work '
      + 'and being right, which does not make anybody popular. Contemptuous of '
      + 'sentiment in a way she performs slightly more than she feels. She is '
      + 'the most quietly generous person aboard and has organised her whole '
      + 'manner to prevent this from being discovered. She likes knowing things '
      + 'other people do not, and holds at least one such thing about a man who '
      + 'eats near her most days.',
    fears:
      'Being liked for the wrong reasons, which she would find worse than '
      + 'being disliked for the right ones.',
    wants:
      'To be indispensable, and is close.',
    boarding:
      'A consultancy contract with a holding company. The client behind it '
      + 'was never named, which in her field is Tuesday.',
    voice:
      'Clipped, technical, devastating in asides. Never explains a joke. Uses '
      + 'somebody\'s surname when she is annoyed and their first name when she '
      + 'is not.',
  },
  {
    id: 'H',
    name: 'Halim Zoubir',
    age: 63,
    cluster: 'II',
    was: 'Yard supervisor, thirty-one years',
    duty: 'The work roster',
    keys: [],
    before:
      'Thirty-one years supervising a shipyard. He believes in procedure the '
      + 'way other people believe in God, and for the same reason: it decides '
      + 'so that he does not have to. Blocked a good welder\'s promotion twice '
      + 'and believes he was right. Buried a safety report that was correct, '
      + 'and was lucky, and knows it. The triage gave him the roster — the one '
      + 'assignment it plainly got right — and the habitat resents him for it '
      + 'in a way it cannot justify. He runs it well. Nobody thanks him.',
    fears:
      'That thirty-one years of procedure was cowardice with paperwork over '
      + 'it.',
    wants:
      'Somebody to tell him the roster is fair.',
    boarding:
      'An early retirement package. Generous, but so were the others in that '
      + 'round.',
    voice:
      'Formal, passive constructions, avoids the first person. It was decided '
      + 'that. Says we when he means I and one when he means you.',
  },
  {
    id: 'I',
    name: 'Iris Calloway',
    age: 52,
    cluster: 'III',
    was: 'Cartographer, then nothing for a long time',
    duty: 'Mapping',
    keys: [],
    before:
      'Cartographer, and then, for twenty-two years, nothing much. There was '
      + 'a thing she did at thirty that ended other people\'s lives in the way '
      + 'that things at thirty sometimes do, and she has organised herself '
      + 'around absorbing the blame for it ever since. She does not argue. It '
      + 'reads as serenity and is closer to a decision. She is drawing the map '
      + 'of the habitat. Every resident\'s sense of where they live will be her '
      + 'drawing of it. Nobody has remarked on this, including her.',
    fears:
      'Being one act, permanently.',
    wants:
      'To make something that is not about that act, and has not managed it '
      + 'in two decades.',
    boarding:
      'She remembers deciding to go. She does not remember buying a ticket. '
      + 'She had one.',
    voice:
      'Spare, exact, long pauses rendered as full stops. Self-deprecating '
      + 'without fishing. Answers the question that was asked and stops.',
  },
  {
    id: 'J',
    name: 'Juno Petrakis',
    age: 39,
    cluster: 'IV',
    was: 'Drove the 4:40',
    duty: 'The Workshops power bay',
    keys: ['workshops'],
    before:
      'Drove the 4:40 for eleven years. Knew four hundred people by face and '
      + 'thirty by name, and liked the shape of a route: the same thing, done '
      + 'well, forever. The triage gave her the reactor because the engineering '
      + 'lockers were nearest to where she woke. She holds the most '
      + 'consequential access in the habitat and has no qualification for it '
      + 'whatsoever. Nobody can justify this and nobody can undo it. She has '
      + 'responded by working harder than anybody. She reads at night. She asks '
      + 'questions that sound stupid and turn out, about a third of the time, '
      + 'to be the right one. Wen Jiaming works under her key and has never '
      + 'once made her feel it.',
    fears:
      'Killing everybody by touching the wrong thing.',
    wants:
      'To deserve the key before somebody takes it off her.',
    boarding:
      'A transport workers\' relocation scheme. She never applied to it. It '
      + 'wrote to her by name.',
    voice:
      'Plain, unpretentious, concrete. No abstractions. Asks the obvious '
      + 'question without embarrassment, which is her single greatest asset.',
  },
  {
    id: 'K',
    name: 'Kes Amankwah',
    age: 44,
    cluster: 'IV',
    was: 'Sound engineer',
    duty: 'Communications',
    keys: [],
    before:
      'Sound engineer. Spent twenty years making other people audible and '
      + 'developed the ear that comes with it — he can tell you what a room is '
      + 'doing with his eyes shut. His assignment is the emptiest in the '
      + 'habitat: there is nobody to communicate with. So he has started '
      + 'recording instead. The reactor at its low cycle. The Well. Pilar\'s '
      + 'kitchen at the second watch. Two people arguing in the Common, taken '
      + 'from far enough away that the words are gone and only the shape is '
      + 'left. He has not told anybody why he is doing it, largely because he '
      + 'does not know.',
    fears:
      'Silence, specifically.',
    wants:
      'Somebody to ask to hear one.',
    boarding:
      'He followed a woman. It ended three weeks before departure. He went '
      + 'anyway, because the alternative was staying where she was.',
    voice:
      'Attentive, describes how things sound before how they look. Notices '
      + 'when somebody\'s breathing changes. Gentle, and slightly absent.',
  },
  {
    id: 'L',
    name: 'Lior Ben-Ari',
    age: 48,
    cluster: 'IV',
    was: 'Sold things; never the same thing twice',
    duty: 'Salvage',
    keys: [],
    before:
      'Sold things. Never the same thing twice, and never quite badly enough '
      + 'to be prosecuted. Owes money to at least three people aboard and is '
      + 'charming about all of it, which works on two of them. Salvage suits '
      + 'him exactly and he is startlingly good at it — he can look at a '
      + 'collapsed section and see what is worth carrying out, which is a real '
      + 'skill and the first honest use he has found for it.',
    fears:
      'Being seen clearly by somebody whose opinion he cannot deflect.',
    wants:
      'To be the one who is owed for once, in a way he would deny.',
    boarding:
      'The big debt — the one that was going to end him — was written off a '
      + 'month before he booked, by a creditor he never met and cannot name.',
    voice:
      'Fast, flattering, changes the subject with a compliment. Tells the '
      + 'same three stories. Goes quiet and precise when he is actually '
      + 'working.',
  },
  {
    id: 'M',
    name: 'Mara Osei',
    age: 55,
    cluster: 'III',
    was: 'Schoolteacher, thirty years',
    duty: 'The Common',
    keys: [],
    before:
      'Thirty years teaching, and it never switched off. She runs the social '
      + 'life of the habitat by pure habit: who eats with whom, who has not '
      + 'spoken in a while, who needs drawing out. It is genuine and it is also '
      + 'control, and the two are not separable in her. She has carried a '
      + 'specific blame for twenty-two years and has not put it down. The '
      + 'person she blames eats in her room every day.',
    fears:
      'Being unnecessary, which for her means being unconsulted.',
    wants:
      'The habitat to have something like a proper table and something like '
      + 'proper manners, and is slowly getting both.',
    boarding:
      'Retirement age, a teaching placement at the colony, and a sister '
      + 'already out there. The most ordinary boarding of the twenty-five.',
    voice:
      'Teacherly. Rhetorical questions. Remembers and uses names constantly. '
      + 'Says now then. Can silence a room and knows it.',
  },
  {
    id: 'N',
    name: 'Noor Rahimi',
    age: 41,
    cluster: 'IV',
    was: 'General practitioner',
    duty: 'The infirmary',
    keys: ['infirmary'],
    before:
      'General practitioner in a neighbourhood clinic: eleven years of the '
      + 'same four hundred people, their families, their decline. She believes '
      + 'medicine is mostly company, which puts her at right angles to Cato '
      + 'Lindqvist on nearly everything. She is young for the authority she has '
      + 'and knows Ulla Nyholm resents it — thirty years of paediatrics, taking '
      + 'second under a GP. Noor has not found a way to hand any of it over '
      + 'that does not look like weakness. She sat with somebody\'s mother at '
      + 'the end, once, and one of the people aboard is that woman\'s daughter, '
      + 'and does not know.',
    fears:
      'A decision she cannot take back.',
    wants:
      'To be wrong about something early enough to fix it.',
    boarding:
      'A rural placement that offered to cover her passage. Unusual. Not '
      + 'unheard of.',
    voice:
      'Careful, warm at a slight professional distance, avoids absolutes. '
      + 'Asks how you slept before asking anything else.',
  },
  {
    id: 'O',
    name: 'Osvald Berg',
    age: 61,
    cluster: 'I',
    was: 'Fisherman, then harbour work',
    duty: 'The Well',
    keys: [],
    before:
      'Fished, then worked the harbour until the harbour stopped needing '
      + 'hands. Blunt, fair, superstitious about weather in a place that has '
      + 'none. Holds a grudge the way other people keep a garden. He has the '
      + 'Well: water reclamation and air scrubbing, the ugliest and most '
      + 'necessary work in the habitat, and he does it without complaint and '
      + 'without letting anybody forget. He treats Sten Malm with a deference '
      + 'he extends to nobody else and cannot account for. His half-sister is '
      + 'aboard. Nineteen years without a word, over a house that neither of '
      + 'them ended up with. They have been civil for a hundred days and it is '
      + 'costing them both more than the argument ever did.',
    fears:
      'Dying with it unfinished.',
    wants:
      'Not to be the one who apologises first, and would take a great deal to '
      + 'be talked out of it.',
    boarding:
      'The harbour automated and he was paid off. He went looking for '
      + 'somewhere that still needed hands.',
    voice:
      'Blunt, short, sea idioms in a place with no sea. Understates injury. '
      + 'Silence as a complete answer.',
  },
  {
    id: 'P',
    name: 'Pilar Ocaña',
    age: 66,
    cluster: 'IV',
    was: 'Baker, forty-one years',
    duty: 'The kitchen',
    keys: [],
    before:
      'Forty-one years of bread. Up at three, every day, in the same '
      + 'building, for four decades. She has fed more people than anybody '
      + 'aboard has met. A hundred days in, the habitat already organises '
      + 'itself around her without anybody having decided to. She has no '
      + 'interest in authority and exercises an enormous amount of it by '
      + 'feeding people at the moment they most need it and refusing to discuss '
      + 'why. The long table in the Common is a hull plate; she is the reason '
      + 'anybody sits at it.',
    fears:
      'Her hands. They are sixty-six years old and they are the whole of her '
      + 'usefulness.',
    wants:
      'To teach somebody the bread before they go, and has not asked anybody, '
      + 'because asking would mean saying the first part out loud.',
    boarding:
      'She sold the bakery, there was money left over, and she had never been '
      + 'anywhere. The sum left over was exactly enough.',
    voice:
      'Diminutives for everybody. Answers a question by putting food in front '
      + 'of you. Andalusian rhythm, short clauses, a great deal of anda and '
      + 'hijo. Deflects sincerity with practicality.',
  },
  {
    id: 'Q',
    name: 'Quim Bassols',
    age: 54,
    cluster: 'II',
    was: 'Welder and fabricator',
    duty: 'The workshops',
    keys: [],
    before:
      'Welder and fabricator, and the best maker in the habitat by a distance '
      + 'that is not close. Trained by somebody good. Held back twice by a '
      + 'supervisor who is aboard, and has built a substantial part of his '
      + 'self-image on the injustice of it. Generous with his hands and stingy '
      + 'with credit — he will spend two days fixing your thing and then '
      + 'mention it for a month. He is building the workshops into something '
      + 'and has already had one real fight about bay allocation.',
    fears:
      ', and has never articulated, that Halim might have been right.',
    wants:
      'To make one object that outlasts him, and has started three.',
    boarding:
      'His marriage ended, his shop closed, and a fabricator\'s post at the '
      + 'colony paid three times what he had ever earned. He did not think '
      + 'about it for long.',
    voice:
      'Warm, Catalan-inflected, swears affectionately. Explains the technique '
      + 'nobody asked about. Calls people home and nen. Talks with his hands '
      + 'and describes objects better than feelings.',
  },
  {
    id: 'R',
    name: 'Reva Sandoval',
    age: 47,
    cluster: 'V',
    was: 'Freight clerk',
    duty: 'The hold',
    keys: [],
    before:
      'Freight clerk. Twenty-two years of manifests, and a completely '
      + 'unremarkable life that she has never once experienced as a '
      + 'disappointment. She has the hold, which means she is the person who '
      + 'will open the crates. She has opened nine so far and catalogued them '
      + 'beautifully, because that is what she does. She is kind without '
      + 'appearing to notice she is doing it, which is why almost nobody '
      + 'notices either. One person aboard watched her do something quietly '
      + 'extraordinary some years ago and has never forgotten her face. Reva '
      + 'does not remember the afternoon at all.',
    fears:
      'Very little, which is itself the most unusual thing about her.',
    wants:
      'The inventory to be correct.',
    boarding:
      'Her transfer to the colony was approved eleven days before she '
      + 'requested it. She assumed a filing error and did not chase it, because '
      + 'it was in her favour.',
    voice:
      'Mild, unhurried, precise about objects and vague about feelings. '
      + 'Apologises for taking up time. Almost never says I.',
  },
  {
    id: 'S',
    name: 'Sten Malm',
    age: 78,
    cluster: 'I',
    was: 'Swimming instructor, then a lifeguard, then retired',
    duty: null,
    keys: [],
    before:
      'Taught half of Kilbeg to swim over forty years, then lifeguarded, then '
      + 'had thirty years of not much. The oldest person aboard by twelve '
      + 'years. His body is going and his mind is not, which he would tell you '
      + 'is the wrong way round. The triage assigned him nothing. He has '
      + 'experienced this as a verdict and has not mentioned it once. He has '
      + 'since made himself the person who sits with people, which is not a '
      + 'duty and is possibly the most load-bearing role in the habitat. There '
      + 'was a drowning, once, that he could not reach in time. It is the '
      + 'defining fact of his life. Somebody aboard is closer to it than they '
      + 'know.',
    fears:
      'Being a burden, and the specific hour at which he becomes one.',
    wants:
      'To be needed once, properly, before the end.',
    boarding:
      'He is seventy-eight and a carrier sold him a one-way long-haul fare. '
      + 'No carrier does that. He did not ask why.',
    voice:
      'Short sentences. Understatement to the point of comedy. Talks about '
      + 'weather and water in a place with neither. Long silences that are not '
      + 'awkward.',
  },
  {
    id: 'T',
    name: 'Tomás Iriarte',
    age: 58,
    cluster: 'III',
    was: 'Accountant',
    duty: 'Reckoning',
    keys: [],
    before:
      'Accountant. Keeps the count of everything, including the cells, which '
      + 'makes him quietly the most economically consequential person in the '
      + 'habitat and one of the least noticed. Moral about numbers in a way '
      + 'that is not really about numbers. Loyal to a dead sister past the '
      + 'point of usefulness: he took her side in a rupture her own daughter '
      + 'refuses to have sides about, and he cannot let it go, and it is '
      + 'costing him the only family he has left aboard.',
    fears:
      'An injustice going unrecorded more than he fears the injustice.',
    wants:
      'The ledger to balance, in every sense he can find for the word.',
    boarding:
      'After his sister died there was nothing keeping him anywhere. He sold '
      + 'the flat and bought a fare. It took about a week to decide.',
    voice:
      'Careful, numerical, moralising. Quantifies feelings by accident — the '
      + 'third time this month. Long, correct sentences. No jokes.',
  },
  {
    id: 'U',
    name: 'Ulla Nyholm',
    age: 57,
    cluster: 'I',
    was: 'Nurse, paediatrics',
    duty: 'The infirmary, second',
    keys: [],
    before:
      'Thirty years of paediatric nursing. She has been present for more of '
      + 'the worst days of other people\'s lives than everybody else aboard '
      + 'combined, and it has made her funny in a specific and slightly '
      + 'alarming way. Placed second under a general practitioner sixteen years '
      + 'her junior, which she has handled with a grace that is visibly '
      + 'effortful. She is better at the actual work than Noor and both of them '
      + 'know it and neither will say it. Warm with all twenty-four of them '
      + 'except one, and the exception is her brother.',
    fears:
      'That she is only kind at work.',
    wants:
      'The infirmary run properly, and has started running it properly '
      + 'without changing whose name is on it.',
    boarding:
      'She applied for a paediatric post at the colony clinic, interviewed '
      + 'twice, and was accepted. Entirely ordinary.',
    voice:
      'Nurse\'s directness. Gallows humour delivered flat. Says the thing '
      + 'everybody is avoiding, in the kindest available words, at the exact '
      + 'moment it stops being avoidable.',
  },
  {
    id: 'V',
    name: 'Vero Castel',
    age: 50,
    cluster: 'III',
    was: 'Chef, and before that six other things',
    duty: 'Hydroponics',
    keys: [],
    before:
      'Chef, and six other things before that. Raised by a mother who worked '
      + 'nights and an uncle who was around more than he was thanked for. Fast, '
      + 'profane, allergic to being managed, and very good at anything that '
      + 'involves keeping several things alive at once. Hydroponics is the only '
      + 'living green in the habitat and the only full-spectrum light, so it is '
      + 'the surface yard where every edible plant now grows. People come to '
      + 'sit in the daylight. She resents the sitters, depends on them for '
      + 'company, and has not resolved this in a '
      + 'hundred days. Her uncle is aboard and wants her to take a side about '
      + 'her mother. Her mother\'s best friend is aboard and mothers her, which '
      + 'she finds unbearable and cannot say.',
    fears:
      'Being trapped somewhere with no exit, which is now her permanent '
      + 'condition.',
    wants:
      'To run something that is hers.',
    boarding:
      'A kitchen job at the colony. She had done the same thing four times on '
      + 'four other worlds.',
    voice:
      'Fast, profane, food metaphors for everything including people. '
      + 'Interrupts. Enormously funny and uses it as a wall.',
  },
  {
    id: 'W',
    name: 'Wen Jiaming',
    age: 49,
    cluster: 'II',
    was: 'Yard electrician',
    duty: 'Power distribution',
    keys: [],
    before:
      'Yard electrician. The person everybody likes and nobody knows, which '
      + 'he has arranged carefully over about thirty years. He works in the '
      + 'Workshops power bay, directly '
      + 'under a key held by a bus driver, an arrangement he could reasonably '
      + 'object to and has never once mentioned. He simply does the work and '
      + 'lets Juno learn, and he has done more to keep the habitat lit than '
      + 'anybody except her. He saw something at the yard once and said '
      + 'nothing. It has come to bother him considerably more at forty-nine '
      + 'than it did at forty.',
    fears:
      'That keeping quiet is not a decision he makes but a thing he is.',
    wants:
      'To say one true difficult thing out loud before he dies.',
    boarding:
      'A company relocation lottery. He entered it. He thinks he entered it.',
    voice:
      'Very few words. Dry. Answers exactly the question asked and not the '
      + 'question meant. When he does speak at length it stops the room, and he '
      + 'knows it, and he rations it.',
  },
  {
    id: 'X',
    name: 'Xan Moreira',
    age: 60,
    cluster: 'I',
    was: 'Bricklayer, then site foreman',
    duty: 'Excavation',
    keys: [],
    before:
      'Bricklayer, then site foreman, then bricklayer again by choice. '
      + 'Competent in a way that requires no discussion, uncomfortable in any '
      + 'conversation that is not about work. He is the reason there is a '
      + 'habitat in the rock at all. He organised the first digging in the '
      + 'second week, badly and then well, and the Common exists because of it. '
      + 'This is common knowledge and embarrasses him physically. He was nine '
      + 'when Ama Oyelaran\'s father drowned, and old enough to remember the '
      + 'week properly. She was four and remembers none of it. He has never '
      + 'worked out whether telling her any of it would be a kindness.',
    fears:
      ', very simply, that the rock runs out of things worth digging.',
    wants:
      'To finish something.',
    boarding:
      'A construction contract at the colony. Real company, real contract; he '
      + 'telephoned to check, because he always does.',
    voice:
      'Talks about work. Renders feelings as physical states — my back\'s been '
      + 'at me since Tuesday meaning something else entirely. Deeply literal. '
      + 'Deflects praise by correcting a technical detail.',
  },
  {
    id: 'Y',
    name: 'Yara Haddad',
    age: 37,
    cluster: 'V',
    was: 'Illustrator',
    duty: null,
    keys: [],
    before:
      'Illustrator. The triage had no field for it and gave her nothing, '
      + 'which makes her the only person in the habitat with unstructured time, '
      + 'and that is the single most consequential fact in this document. She '
      + 'has started drawing. On paper first, then on a hull offcut, then — '
      + 'three weeks ago — on the rock of a gallery wall near the Face, where '
      + 'nobody goes. It is not good yet. Nobody has seen it. She is the '
      + 'youngest person who ever really talked to somebody about dying, which '
      + 'is a strange thing to be at thirty-seven and has left her both older '
      + 'and less certain than her peers.',
    fears:
      'Irrelevance, sharply and constantly, in a place where everybody else '
      + 'has a function.',
    wants:
      'To matter, and has not worked out what the currency for that is here.',
    boarding:
      'An artist\'s passage. She has no memory of applying and has never found '
      + 'the organisation.',
    voice:
      'Visual, observational, funny, faintly adrift. Describes people as '
      + 'shapes and colours. Self-interrupts. Underplays everything that '
      + 'matters to her.',
  },
];

export const RESIDENT_BY_ID = Object.fromEntries(
  RESIDENTS.map((r) => [r.id, r]),
) as Record<ResidentId, Resident>;

export function holdersOf(key: Key): ResidentId[] {
  return RESIDENTS.filter((r) => r.keys.includes(key)).map((r) => r.id);
}
