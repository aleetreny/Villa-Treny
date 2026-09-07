# The Habitat: a persistent society under the night shift

Design specification. Closed 2026-08-31. Branch: `night-shift-habitat`.

This document settles product, world, simulation, aesthetic and mechanics. It
does **not** cover implementation — schemas, Workers, D1, alarms, queues and
prompts are designed afterwards, from this.

## Context

The board already has a night layer. `THE NIGHT SHIFT` is a lever that throws a
blacklight over the slate and reveals a deterministic city with two hundred
workers who have no memory (`src/lib/world/city.ts`, `crew.ts`, `UvCrew.tsx`).
It is client-side, stateless and serverless: it regenerates identically on every
visit.

What goes on top of it is a different kind of thing: **a persistent
micro-civilisation of twenty-five residents** living inside a ship wrecked in an
asteroid, advancing on its own in the cloud whether or not anybody is looking,
and producing a historical archive that can be read months later. The portfolio
does not maintain it and does not explain it. The portfolio is the window it is
watched from.

## 1. The thesis

**This is an observatory, not a game.** The proposition is *there is something
alive in here that does not need you*. The visitor does not play, does not
manage and does not optimise. They watch.

Three dogmas settle almost every doubtful decision:

1. **The product is the archive.** The agents are the engine that produces an
   archive; what the visitor consumes is history.
2. **Slowness is the feature.** A world that advances one real day per day and
   cannot be sped up is exactly a world that exists without you.
3. **The world knows; nobody inside knows all of it.** The engine always holds a
   complete, verifiable truth. Residents hold partial, biased and sometimes false
   memories of it. Four systems fall out of that one principle: the record
   against the account of it, commitments against what each party remembers
   promising, possession against legitimacy, and real reputation against what is
   said about you. **The model never decrees facts. It only interprets the ones
   the engine has already established.**

Tie-breaker in any dilemma: **moving and intimate** beats mechanically rich.

## 2. The constraint that orders the architecture

Cloudflare Workers AI free (~10,000 neurons a day) plus Groq free give an order
of **hundreds of calls a day**, not thousands. Across twenty-five residents that
is **ten to twenty thoughts per person per day**: enough for real deliberation
and for conversation with text in it, not enough for continuous thought.

Hence the central mechanism: **the attention budget**.

- The deterministic engine must be able to run the whole world **for days with
  no model call at all**. Most of the time people execute routine, commitments
  already made and cached policy. Free.
- Model cognition is **auctioned by pressure**: broken plans, failed
  predictions, debts falling due, open conflicts, unresolved thoughts,
  surprising perceptions, time since last thought.
- **Guaranteed floor:** nobody goes more than three days without a thought
  of their own.
- The world drifts towards its crises on its own, which is where the stories
  are, without abandoning anybody.

Hard cost rule: **no visitor action ever triggers inference.** Cognition happens
only on a scheduled alarm. And no code path can reach paid inference: once the
quota is spent, cognition is deferred until it resets. The system slows down
rather than spending money.

## 3. The world

### Premise

A ship went into an asteroid at an angle and stuck there. A hundred days later,
twenty-five people are still alive inside it.

**Nobody knows what that ship was doing.** The manifest and the destination were
lost in the impact. Each of them remembers their own life and their own reason
for boarding, but the twenty-five reasons do not add up to anything. The
question that eats at them is not *who am I* but **why the twenty-five of us** —
and they do not know whether the answer is "no reason".

> **There is no answer.** Not sealed in Genesis, not held by the engine, not
> written down anywhere and not known to the author. The ship is a real mystery
> rather than a puzzle, and real mysteries do not resolve.
>
> This is a deliberate choice with a known cost: nobody ever gets the
> satisfaction of finding out. What is bought with it is that the theories are
> the content. Over years the habitat will produce explanations, argue them,
> attach itself to them, split over them and abandon them, and none of that is
> rehearsal for a reveal — it is the whole thing.
>
> **Evidence still exists and still matters**, because of one asymmetry:
> **a theory can be falsified by evidence and never confirmed by it.** The
> breach, the hold and the berths hold real, findable, genuinely strange objects.
> Each find kills some explanations and licenses others. Nothing ever settles.
>
> Engine rules that keep this honest. A theory is recorded as somebody's theory,
> never as a fact. No model is ever handed a ground truth about the ship, because
> none exists to hand it. Where the engine must decide something physical — what
> is behind a door, who is in a berth — it decides at the moment of opening, and
> **whatever it decides explains nothing.**

The emergency is over — there is air, food and somewhere to sleep — so the
question stops being how to survive and becomes **how to live**. There is no
custom yet. The visitor will watch the first friendship, the first betrayal and
the first ritual happen.

**They are not all strangers to each other.** Most had never met; a few know each
other by sight; fewer have spoken; and a handful carry a real bond from before
boarding, with everything that brings. §8 sets this out.

### Geometry

**The hull went in crooked.** The ship's decks sit at twenty to twenty-five
degrees; the hand-dug tunnels are level. The tension between the two grids is
the silhouette, and it tells the history without a word of text: **what was
inherited, rigid and finite against what was made by hand, organic and
growing.** The habitat is slowly migrating out of the ship and into the stone.

- **The hull** cannot be dug. It can only be lost, abandoned or consumed.
- **The rock** grows. A workshop dug in year three is a new room on the map. The
  map is the physical record of what the society has decided.

### Resources

Four, tightly coupled.

| Resource | Rule |
| --- | --- |
| **Power** | The universal physical currency. Growing, processing rock, fabricating, warming a tunnel and turning on a light all cost power. |
| **Mass** | From the hull (finite, cannibalises the ship) or from the rock (abundant, expensive in power). |
| **Life support** | Air, water and food in a closed loop. Its failure kills. |
| **Hours** | Each person's time. |

### The four slow clocks

1. **The reactor decays.** Available power falls year on year. Everything
   tightens at once and allocation turns political. The background image: the
   light is going out slowly and all of them know it.
2. **Making things consumes the ship.** Every workshop, every dwelling and every
   object made of hull plate is a decision never to leave. The politics of
   staying or going emerges from a resource rule, with no factions coded.
3. **The sleepers run out.** Every waking spends a berth that does not come back.
4. **The passage.** The rock has an orbit and roughly every hundred and fifty
   days it crosses a debris stream. It is **predictable**, so it does not
   produce shocks — it produces a **calendar**: preparation, argument over
   whether preparing is worth it, prophecy, ritual and anniversary. A community
   inside a stone has no day, no night and no seasons. The passage gives them a
   year. **Without a year there is no culture.**

   The simulation opens on day one hundred, so **they have not lived through one
   yet.** The first passage is coming, none of them knows what it is like, and the
   argument about how much to spend preparing for it is the habitat's first real
   collective decision.

### The day

The ship's clock is inherited: four watches that structure routine. Inside them
the world advances **by event**, not by slot — people meet when they meet, and a
conversation happens when two of them coincide and have something outstanding.

The reactor cycles: there are cheap-power hours and expensive-power hours.
Working the cheap ones costs less and is lonelier, so a subculture lives at
night. **`THE NIGHT SHIFT` stops being a name and becomes physics of the world:**
throwing the lever means looking at the habitat during its night watch.

### The body

No Sims-style bars. Five conditions that move over days or weeks — rested, fed,
well, safe, accompanied — which only matter as they degrade, and which generate
cognitive pressure when they do.

## 4. The sixteen rooms

Design rule: **a room is not a function, it is a generator of social
situations.** No filler; every one has history, objects with lore, and something
that surprises.

### The hull — tilted, fixed, finite

| Room | What it is, and what it produces | The surprise |
| --- | --- | --- |
| **The Bridge** | The only real window. Instrumentation dead but for two readouts. Nobody works here; people climb up to look. Intimacy, break-ups, decisions. | The port is cracked and patched: the stars are seen **through a repair**. Nobody sits in the pilot's chair — a taboo that formed on its own in the first weeks. |
| **The Spine** | The reactor. With the ship tilted, running its length is a **diagonal climb**. Hot, loud, gated by an inherited key. | The allocation panel has **more outputs than known destinations**. Some circuits go somewhere nobody has found. |
| **The Cold Berths** | Hundreds of sleepers. Silence, cold, blue. Most will never wake. | **They do not know who is in there.** Somebody has started writing invented names on tape stuck to the frosted glass. |
| **The Cabins** | Metal dwelling. With the ship crooked, the floors slope and everything is shimmed and wedged. | Living here means living **in somebody else's room, surrounded by their things**, under an unwritten etiquette about what may be moved. |
| **The Breach** | Depressurised sections. A suit is needed. The source of salvage mass and of the mystery's evidence. | The only place where **nobody sees or hears you**: the habitat's only privacy, and the only place to hide something. |
| **The Dock** | The airlock where hull meets rock. The border with vacuum. | **Three suits for twenty-five people.** Going outside is a privilege that has to be negotiated, and there is a list of who has been out. |
| **The Infirmary** | Ship equipment, partly working. A drug cabinet nobody has audited. | It is also **where the dead are laid**: the same room where you are saved and where you are laid out. |
| **The Hold** | Cargo whose purpose is unknown because the manifest is gone. The mystery's warehouse. | **Unopened crates.** Each one is a latent event: opening one is an occasion, and there is no way to know what is inside. |

### The rock — level, hand-made, growing

| Room | What it is, and what it produces | The surprise |
| --- | --- | --- |
| **The Common** | The big dug chamber where people eat. Everybody passes through: most encounters happen here, and with them rumour, reputation and fashion. | The long table **is a hull plate**. The first thing they built was the place where they all sit down, and to build it they started eating the ship. |
| **Hydroponics** | Food, and the only living green under full-spectrum light. Farm and sanctuary at once. | The light costs power. People who go only to sit **are spending everybody's electricity to feel better.** A real conflict, recurring, with no clean answer. |
| **The Workshops** | Bays divided and reassigned as fortunes change. The economy lives here. One fabricator, with a queue. | Bay allocation is the most contested resource in the habitat **and no procedure for allocating it exists.** |
| **The Diggings** | Personal dwellings dug by their occupants. A category that multiplies: this is where the map grows. | Your house **is a hole you made**. Its size and finish are a public, permanent record of your labour, your skill, and how much help you could get. |
| **The Face** | The unfinished tunnel. Where people go to claim space, or to disappear for a while. | The only room that is **incomplete by definition**: it moves. Its position on the map changes over the months. |
| **The Well** | Water reclamation and air scrubbing. Consumable, finite filters. | The ugliest and most necessary work. Whoever does it **holds a power nobody acknowledges out loud.** |
| **The Great Wall** | The first chamber they cut, and too big, because they did not yet know how hard the rock was. One face came away almost flat. The point of contact with whoever is watching. | Twenty-six metres of clean stone, the largest surface in the habitat, and **in a hundred days nobody has put anything on it.** This is also where the observation is detected, and where the portfolio's board physically is. |
| **The Hollow** | A cavity they **found rather than dug**: a natural void a gallery broke into. Irregular, orthogonal to nothing, unassigned. | The only space in the habitat that is not a rectangle and that **nobody designed**. Nobody has decided what it is for. What the community eventually does with it will be the clearest statement of who they became. |

### The existing city

It is neither deleted nor canonised. Rule: **the city and the habitat never share
a frame.** `city.ts` remains the board's night skin — the landscape of that room.
The habitat is a separate view with its own palette and geometry. Nobody declares
what the city is. If in two years some resident takes to interpreting it, that
appears in the record as their interpretation, not as our lore. If nobody ever
looks at it, nothing is lost.

## 5. The twenty-five

Every resident is a **full dossier**, presented in the visual language of the
dossiers the portfolio already has: registry header, numbered blocks, same paper.

A dossier carries:

- **A pixel portrait with an identity.** Generated from parameters and then
  **hand-corrected, all twenty-five.** At this scale it is affordable, and it is
  the difference between twenty-five faces and twenty-five people.
- **A complete account of the life before**: where they come from, what they did,
  what they left, why they boarded. Written by hand in Genesis. **It is not a
  cage:** the person mutates with what happens to them, and the dossier shows the
  drift between who they were and who they are.
- Personality, traits, values, fears, aspirations.
- The role the ship's register assigned them, **and how far they have moved from
  it**.
- Relations with the other twenty-four (§8), **including who they already knew
  before boarding and how well** — and where a latent bond is carried, the fact
  of carrying it lives in world state even though the public dossier does not say
  so.
- Works, live commitments, open thoughts, possessions.
- **A navigable life-line**, by day and by year.
- **A weekly private journal** in the first person. One entry per resident per
  week is three or four calls a day: affordable, and it is where the project's
  intimacy lives. It does not tread on the event record, because they are
  different things — one says what happened, the other what it felt like.

### Work, authority and population

- **The inherited keys.** The ship had ranks. When it crashed, physical access to
  the reactor, the berths and the dock stayed with whoever happened to be where
  they were. The oldest political fact in the habitat is an accident nobody chose
  and nobody can justify. Structural inequality without a single institution
  coded.
- **The register assigns, and erodes.** Genesis starts from each person's role
  aboard. Over the years people abandon it, change it, and invent trades the ship
  never contemplated. The emergent economy is measured against an initial
  structure that is coming apart, and how far they have moved is visible.
- **Nobody is born; somebody is woken.** No birth and no childhood to model.
  Waking a sleeper costs power, another mouth, and a berth that does not come
  back — and there is no knowing who it will be. You ask for a doctor and wake a
  violinist who will never go home. It is the heaviest decision in the habitat.
- **People die.** Accident, illness, age, conflict. At twenty-five, one death is
  four per cent of the population: it reorders the whole community.

## 6. The engine

### The verb repertoire

**About a hundred and ten verbs in nine families.** A verb is cheap — it is engine
code, and the model already knows what "eavesdrop" means. Every one has
**physical preconditions** (where you are, what you carry, who is present, what
resources exist) and **deterministic effects**. The model chooses a verb and a
target; **the engine validates and executes.**

| Family | Verbs |
| --- | --- |
| Body and space | go, enter, leave, climb, approach, follow, wait, hide, look out, sleep, wake, rest, eat, drink, wash, tend to |
| Objects | take, drop, give, carry, store, open, close, lock, unlock, use, assemble, dismantle, repair, break, throw away, conceal, steal, find |
| Work | dig, extract, smelt, fabricate, grow, harvest, cook, lay, measure, calibrate, connect, charge, inspect, clean |
| Communication | speak, ask, answer, tell, keep silent, lie, confess, accuse, deny, warn, request, thank, apologise, threaten, joke, argue, whisper, eavesdrop, spread |
| Affection | greet, ignore, avoid, seek out, accompany, console, celebrate, weep, court, refuse, forgive, hold a grudge, introduce, exclude |
| **Commitment** | **transfer, offer, accept, promise, claim, register, delegate, renounce** |
| Knowledge | observe, examine, test, experiment, note, read, teach, learn, imitate, correct, refute |
| Creation | write, name, shape, decorate, convene, rehearse, officiate, paint |
| Transgression | trespass, force, sabotage, hide evidence, spy, default, appropriate |

The **commitment** family is the one that forms institutions, which is why it is
special: those eight verbs produce loans, wages, rents, partnerships and
cooperatives **without any of those objects existing**. What an observer calls a
guild or a cooperative is our interpretation, applied afterwards.

### The cognitive cycle

```
world -> perception -> persistent mind -> cognition -> intention
      -> primitive verbs -> the engine executes real consequences
      -> new perception -> memory and belief updates
```

The model **is not the agent**. The agent is its persistent state. One model
interprets the twenty-five minds in sequence. It interprets, reconsiders, invents
strategies, decides, reflects and converses. **It does not determine physical or
economic consequences.**

### Conversation

The main quota sink, so two tiers:

- **Default: one call per conversation.** The engine determines who coincides and
  about what; one call produces the outcome — what was agreed, what each of them
  changed their mind about, what was withheld — **and one quotable line**. That
  line is what makes the record and the dossier sing.
- **A full scene** when the weight justifies it: whole dialogue, archived and
  readable.

### Memory

- **Raw experience is immutable.** Every relevant perception is stored and **never
  deleted**, because something irrelevant today may matter in years. Beliefs,
  interpretations, associations and reflections are separate layers, and those do
  evolve.
- **No embeddings.** Retrieval runs on a **symbolic index** — the people, places,
  concepts and objects involved — weighted by recency, emotional charge, open
  thoughts, and **a random draw from old memory** so the past can come back
  unannounced. Free, deterministic, debuggable, and at twenty-five people it
  outperforms vector similarity.
- The model's context window is **working memory**, not the character's life.

### Learning: transmission with drift

One mechanism feeding four phenomena.

A **skill** is a named recipe with steps, conditions and an expected result,
written by whoever discovered it. It is taught, and **in being taught it degrades
or is altered.** A variant may work better and displace the original.

The same mechanism applies to **objects** (forms that are copied and drift),
**acts** (rituals imitated badly) and **names**. All of them have **lineage**: who
learned from whom can be read across generations. A ritual that began as two
friends eating together on a particular day becomes, twenty years on, a
habitat-wide feast with rules whose reason nobody remembers.

## 7. Economy and culture

### Money: charge cells

Power is stored in transferable cells. They are the universal commodity because
everything consumes them. Two strange properties, neither of them designed — both
fall out of physics already settled:

- **The money supply contracts on its own,** because the reactor decays.
- **Money rots if you hold it,** because charge leaks.

Hoarding impoverishes. We supply only the commodity: whether they invent credit,
notes or paper backed by cells is entirely theirs. And whoever holds the key to
the Spine is the mint, without anybody having decided it.

### Property

**Physical possession plus social legitimacy.** The engine knows who occupies and
uses each thing; society decides separately whether that is legitimate. Usually
they agree. When they stop agreeing there is a real dispute, with two parties who
both believe they are right and no court that exists yet.

### Objects

Two tiers:

- **Sixty to eighty simulated objects** with an owner, a state, a history and
  applicable verbs. They are used, broken, inherited, given and stolen.
- **Hundreds of set-dressing details**, drawn, with written lore and no state. The
  observer sees a corner full of things; the engine carries only what matters.

### Expressive media

Four, all renderable and all subject to lineage:

- **The written** — poems, accounts, manifestos, procedures, lists.
- **The act** — rituals, feasts, ceremonies, customs with a date. Technically
  almost free (a recurring shared commitment), and it is what turns a habit into a
  tradition and a group into a community.
- **The object and the name** — made things with parametric form; and the naming
  of rooms, years, groups and events. Naming costs nothing and is deeply cultural:
  when a room changes its name, that is history.
- **The mark** — painted symbols, **only in the rock**, on the walls they dug
  themselves. **Never on the board.** The portfolio stays untouched.

### The hand

Every agent carries a **persistent style vector** that drifts with what they see
and who they admire. The **form** of their works is generated deterministically
from that vector: zero cost, guaranteed aesthetic coherence, and recognisable
hands, schools and pupils who paint like their master appear on their own. **The
model only supplies the name, the intent and the meaning** — the one thing it is
genuinely good at.

When an agent has attention to spare it can **deliberately depart from its own
hand**. That deliberate departure is what we call a **break**.

## 8. THE WEAVE

The instrument for observing relations. It lives **outside the world**: agents do
not perceive it and cannot interact with it, so it **costs no simulation** — it
only reads state. Its Spanish name, `LA TRAMA`, means both the weave and the plot,
which is exactly what it is.

Twenty-five residents give six hundred **directed** bonds, because they are
**asymmetric**: I may trust you far more than you trust me, and that difference is
half of all human drama.

**Six measured axes**, moved by the engine on deterministic rules at every
interaction: **trust, affection, admiration, debt, resentment, desire.** Enough for
genuinely human combinations to appear — admiring somebody you cannot stand,
desiring somebody you do not trust, owing somebody you hate.

**Plus the line.** No number captures what is between two particular people, so
every pair carries a written line, revised when something changes between them:
*"He owes him something he could not name."* · *"They have avoided each other since
the passage."* · *"She was the first person who spoke to him, and he has not
forgotten it."* The axes are the instrument; the line is the person.

**Three views of the same data:**

1. **The force graph** — the community at a glance: clusters, bridges, the
   isolated.
2. **The 25x25 matrix** — the rigour. Asymmetry shows on its own, because the
   upper triangle does not match the lower. Nothing ever overlaps.
3. **The strings** — opening one person shows their twenty-four bonds as
   horizontal traces across their whole life. Watching a thick line run for two
   hundred days and simply stop is devastating.

**With history.** A time scrubber runs the days and the whole thing reorganises:
edges appear, thicken, invert and break. Every significant change links to **the
event in the record that caused it**, so it is possible to reach day 340, watch an
edge snap, and click through to read what happened.

### The Genesis weave

The graph **does not start empty.** It starts from a pre-boarding network,
authored by hand piece by piece, in five degrees.

| Degree | Approx. share | Meaning |
| --- | --- | --- |
| **Nothing** | ~60% of pairs | They had never met. |
| **By sight** | ~20% | Knows the face from the passage, the boarding, or somewhere public. No name. |
| **Spoken** | ~12% | They have exchanged words at some point. They recognise each other and little more. |
| **A real bond** | ~6% (about 18 pairs) | Actual history: colleagues, family, an ex, a creditor, a teacher, a rival. |
| **Latent** | ~2% (about 6 pairs) | **One of them knows who the other is, and the other does not know it.** |

The six axes are already directed, so **recognition can be asymmetric from day
zero**: A recognises B and B does not recognise A. That imbalance is the cheapest
dramatic engine there is.

**A palette of prior bonds** for the authoring — chosen and written by hand, never
generated:

- a couple who broke up, and neither knew the other was boarding;
- two siblings who had not spoken in years;
- a creditor and their debtor, who have not yet recognised each other;
- a teacher and a pupil who lost track of one another long ago;
- two who worked in the same place and detested each other;
- somebody with a publicly known face, whom half the passage can place without
  knowing at all;
- two who met in the boarding queue: the most recent bond, the most fragile, and
  the only one both remember the same way;
- somebody who knows something serious about another and says nothing;
- **a trio who were travelling together**: the one pre-existing cell, and
  therefore the habitat's first de facto power.

### Latent bonds

Latent pairs are drawn in the weave as a **dotted edge, visible but with no
content**: the visitor sees that there is something between those two people that
neither has mentioned, and **cannot know what**. When the bond surfaces inside the
world, the edge goes solid, fills in, and **links to the event that revealed it**.

It is the best-paid tension in the project: dramatic irony at zero cost, and a
payoff that may take four hundred days to arrive. And it does not break the dogma,
it fulfils it — the visitor watches from the world's side, which knows, not from
the residents', which does not.

### The weave as the mystery's evidence

Twenty-five passengers on an ordinary route **should not have more prior
connections than chance would give them.** The Genesis graph is deliberately
authored with **more clustering than chance would produce**, and that anomaly is
statistically checkable.

- The visitor can see it **on the first day**, looking at the graph, before any of
  them suspects anything.
- The residents can only discover it **by talking to each other** and adding up
  coincidences — exactly the kind of slow, social investigation this engine can
  simulate.
- Every latent bond that surfaces **tightens the anomaly a little further**, so the
  dramatic irony and the investigation are the same thread.
- And it tightens towards nothing. The better their evidence gets, the less
  bearable the absence of an explanation becomes.

The weave stops being only an observation instrument. It is **the mystery's
evidence board** — for a mystery that has no solution. The clustering is a
measured fact with no cause behind it, and no amount of investigation will
produce one. What the residents can do is notice it, and then live with having
noticed.

## 9. Experience and aesthetic

### Aesthetic

**A cold instrument on the outside, warm life within.** The world is **game pixel
art**: colour, detail, light, people, generous animation. But everything around it
— the header, the dimensions, the labels, the dossiers, the record, the weave —
stays in **ink, bone, rust and signal amber, monospaced, unrounded**, following
`docs/design-direction.md`. You are looking at something alive **through an
instrument**. The contrast is not a compromise: it is the thesis of the project,
and the frame is already built in this repo.

### The technical idea that ties it together

> **One representation of space for the engine, the renderer and the mind.** A
> room is a **character grid with a legend**. That is what the engine simulates,
> what the canvas draws, and **what goes into the model's prompt verbatim**. The
> agent does not receive a prose description of where it is: it receives the map.
> It can count steps, see who is in the corner, know the door is on its left.
> Spatial perception stops being a hallucination and becomes the reading of a true
> datum.

Cheaper, more debuggable and more honest, all at once.

### Navigation

- `THE NIGHT SHIFT` keeps working exactly as it does: the lever throws the
  blacklight over the board. Under that light the desk reveals itself as **the
  terminal in The Great Wall.** No structural refactor of the portfolio.
- From there, `MAP` leaves the board and enters the habitat. **The first thing
  shown is the day's headline**, and behind it the full cutaway: the hull driven in
  at an angle, the level caves, sixteen lit rooms and twenty-five figures moving
  right now.
- From the cutaway: approach a room, click a person, open the weave, open the
  archive, return to the board.

### The record

Typed events, dry and true, generated by the engine **spending no quota**, from
day one and everywhere. It is the archive. It can be read by day, by person, by
room, by object or by bond.

No chronicler is forced. If some resident decides on their own to start writing
down what happens, that is remarkable and it shows — and from that day there are
two layers, the truth and somebody's account of it. But it is not pushed, and so
it does not tread on the weekly journal.

### No content filter

Explicit decision by the owner: **agent text is published as it comes, with no
restrictions and no review queue.** The value is in the free will and the
absurdities. The only provision is an owner switch to pause the world or hide the
archive — operations, not censorship.

## 10. Infrastructure constraints

Context, not design. Whoever implements it closes the infrastructure.

- The simulation advances **on its own in the cloud**, with the Mac off, for
  years.
- **Recurring cost is zero.** No automatic branch may generate a bill. The system
  **accepts slowing down rather than spending money.**
- Cloudflare Free: Worker / Durable Object, alarms as the clock, persistent state,
  an event queue, D1. Workers AI (candidate: Qwen3-30B-A3B) with **Groq Free as the
  second provider**; with both spent, **cognition is deferred** until reset.
- **The cloud is canon.** The local model (Qwen3.6-35B-A3B-4bit through MLX) only
  precomputes Genesis or runs experiments outside canon. It never writes history.
- **The web does no inference.** The frontend receives light snapshots: positions,
  state, rooms, events, people. Rendering stays decoupled from the engine. Visiting
  the portfolio has to stay light.
- Repo patterns to respect: deterministic browserless data with tests
  (`src/lib/world/city.ts`, `crew.ts`, `rng.ts`), one animation loop (`frame.ts`),
  positions on refs rather than React state, `IntersectionObserver` on anything
  heavy, `React.lazy` on the canvases. Copy through `src/lib/ui-text.ts` in ES/EN.
  `pnpm check` green before anything.

## 11. Scope

**v1** — the sixteen rooms; the twenty-five dossiers with their past, portrait and
weekly journal; the real clock; the event engine and the hundred-odd verbs; the
cell economy; the record; the weave with its three views; the board integration.

**Deferred until the world has age** — settled rituals, lineages of objects and
skills, marks in the rock, the orbital passage, waking sleepers, the emergent
chronicler. The world gains layers as it ages.

**Out of v1** — sound, and agent music.

## 12. Open risks

1. **The real quota is unmeasured.** The attention budget rests on an estimate.
   First implementation task: measure neurons per real call and calibrate. The
   whole design degrades gracefully if it comes out lower — there is simply less
   thinking.
2. **A single voice.** All twenty-five may sound like one model. Mitigation: most
   model output is structure, not prose; long prose is reserved for the journal and
   for works; and every resident carries persistent voice constraints — lexicon,
   verbal tics, register.
3. **Model priors.** The model already knows companies, banks and religions, so if
   it "invents" something similar we cannot claim it emerged from nothing. This is
   not a paper: it is an artistic and observational experiment. Explicitly coded
   institutions are minimised anyway.
4. **Day one has little archive.** The twenty-five dense biographies are the launch
   content that covers it.

## 13. Design verification

Before implementing anything:

- Walk the sixteen rooms and confirm none is filler: each has lore, objects and a
  social reason to exist.
- Confirm the hundred-odd verbs cover, on paper, five hand-invented stories — a
  betrayal, a loan, a romance, a death, the founding of a group — without needing a
  new verb.
- Confirm no institution (bank, guild, court, party) exists as an engine object.
- Measure the clustering of the Genesis graph against a random graph of the same
  size and density: the anomaly has to be real and detectable, not a claim in the
  lore.
- Confirm every latent bond has a written **route to surfacing**: what would have to
  happen in the world for it to come out. A latent bond with no route is a dotted
  edge that never resolves.
- Confirm the world can advance seven consecutive days with **zero model calls**
  without breaking.

Implementation verification, when it comes: `pnpm check` green; the board with and
without the blacklight on desktop and at 390x844; the habitat navigable on test
data; and a thirty-day simulation run locally that produces a readable record.
