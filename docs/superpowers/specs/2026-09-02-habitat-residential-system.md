# Eleven homes: the habitat's residential system

Planning, phase six. Branch: `night-shift-habitat`.

The owner has closed the residential question. Neither one symbolic Cabins with
false doors nor twenty-five separate rooms: **eleven real homes**, all enterable,
all renderable, all small, cloned from measured references.

> **The decision.** Five cabins off the Long Walk — inherited, rigid, industrial,
> reused passenger quarters — housing ten. Six diggings off the Row — personal,
> improvised, domestic, irregular, made by the people in them — housing fifteen.
> Twenty-five in total. Each unit stays **as close as possible to its measured
> reference**: clone first, vary slightly afterwards.

This is built. `pnpm check` is green (591 tests) and
`tools/roomlab/plan.html` draws the result from the same data the engine walks.

Nothing else is reopened. The material grammar, the map's art direction and the
tracing method all stand.

---

## What it cost structurally

Sixteen rooms became **twenty-seven**, and that is the one closed thing this
changes.

| | Was | Now |
| --- | --- | --- |
| Rooms | 16 | **27** — 13 hull, 14 rock |
| The Cabins | one room, 8 × 8 | **The Long Walk** (5 × 27) + **five cabins** (8 × 8 each) |
| The Diggings | one room, 9 × 7 | **The Row** (25 × 5) + **six diggings** (9 × 7, 7 × 7 ×2, 7 × 8 ×3) |
| Everything else | 14 rooms | unchanged, not one grid touched |

**Two corridors became rooms**, because "connected to the Long Walk" only means
anything if the Long Walk is a place. They are the first two of the eleven
connective spaces in `2026-09-01-habitat-plan.md` to be built; the other nine wait
for the corridor phase.

Everything else in the hull and the warren is where it was, at the size it was.
The chain below the cabins shifts down as the block is taller than the room it
replaced, but that falls out of the generator rather than being re-placed by hand.

## The five cabins

All five are the traced two-berth cabin — `tools/roomlab/reference/two-berth-cabin.jpg`,
204 × 205 px, already built as `tools/roomlab/berth.html` — at its measured size of
8 × 8. **The structure is identical in all five**: two bunks against the outboard
wall, the ladder well in the far corner, the wedges under everything that has to
stand level, and the door amidships onto the walk. Three open to port, two to
starboard, and the free strip opposite the first cabin is where the Throat leaves
for the rock.

What varies is **one object each**, and nothing else:

| Cabin | Who | The one thing that is only in this cabin |
| --- | --- | --- |
| Cabin One | Dima Vashenko, Edda Halvorsen | a sleeping passenger's belongings, untouched |
| Cabin Two | Ferran Solé, Halim Zoubir | a shim stack in the after corner, grown over a hundred days as the floor settled |
| Cabin Three | Cato Lindqvist, Gita Raman | a photograph taped where the light is best |
| Cabin Four | Bex Ferreira, Reva Sandoval | a rope-and-plate shelf standing in the after corner |
| Cabin Five | Iris Calloway, Osvald Berg | a locker that is not the ship's, shut, wedged into the corner |

The starboard pair are mirrored, so their floors tilt the other way — the same
grid, flipped, which is what a passenger deck actually does.

The Long Walk carries **nine doorways**: five cabin doors, the Dock at its head,
the Hold at its foot, the Throat to starboard, and one hatch that does not open.
That hatch is the Breach, and it is the jammed one from the lore.

## The six diggings

Each is cloned from whichever makeshift reference best matches the household it
holds, at that reference's measured size:

| Digging | Who | Reference | Size | Shape |
| --- | --- | --- | --- | --- |
| **Mara's** | Mara Osei, Tomás Iriarte, Vero Castel | `makeshift-two-rooms.png` ×3, 245 × 181 | 9 × 7 | Two chambers, a gap cut between them rather than a door. The largest, and six people helped. |
| **Quim's** | Quim Bassols, Wen Jiaming, Lior Ben-Ari | `makeshift-two-rooms-b.jpg` ×4, 181 × 187 | 7 × 7 | Two chambers; the far one has no floor yet. |
| **Pilar's** | Pilar Ocaña, Kes Amankwah, Juno Petrakis | `makeshift-two-rooms-b.jpg` ×4 | 7 × 7 | Two chambers, nearest the Common. |
| **Xan's** | Xan Moreira, Sten Malm | `makeshift-bedsit.jpg` ×4, 178 × 217 | 7 × 8 | One room, square, finished to the millimetre. |
| **Ulla's** | Ulla Nyholm, Ama Oyelaran | `makeshift-bedsit.jpg` ×4 | 7 × 8 | One room, cut as far along the Row from the ship as the rock allowed. |
| **Yara's** | Yara Haddad, Noor Rahimi | `makeshift-bedsit.jpg` ×4 | 7 × 8 | One room, the smallest, and she dug it alone. |

Three face three across the Row, so every front door looks at another front door.
The Row is 25 × 5 with three metres of walkable width, and it carries nine
doorways: six homes, the Common at one end, the Face at the other, and the crawl
up from Hydroponics.

## Who lives with whom

Not assigned. **Read off the weave**, so every household is a bond you can point
at in `weave.ts`.

| Home | Residents | The bond it is built on |
| --- | --- | --- |
| Mara's | M · T · V | Mara and Tomás are thirty years, the closest bond that came aboard. Vero has been mothered by Mara since she was nine and finds it suffocating — and now lives in her house. |
| Quim's | Q · W · L | Quim and Wen are the most functional working relationship in the habitat. |
| Pilar's | P · K · J | Pilar and Kes, same building for nine years. Kes and Juno, a nodding acquaintance that turned into something neither has named. |
| Xan's | X · S | Sten taught Xan to swim forty-eight years ago. Xan is sixty and still defers to him. |
| Ulla's | U · A | Schoolmates, and the only bond in Cluster I with nothing wrong with it. |
| Yara's | Y · N | No prior bond. The two youngest-feeling in the warren, in the smallest room in it. |
| Cabin One | D · E | The outing list and the allocation ledger in the same four metres. |
| Cabin Two | F · H | One season together twenty years ago, never once mentioned. |
| Cabin Three | C · G | Hull integrity and shipyard safety: the two people who inspect things. |
| Cabin Four | B · R | Stores and the Hold: the two who catalogue. |
| Cabin Five | I · O | The Well and the map. Osvald sleeps in the ship; his half-sister has a digging. |

Three hostile pairs were kept apart deliberately: Dima and Halim (the buried
fault), Halim and Gita (would trust each other with their lives and would not sit
together), Cato and Yara (he was briefly her clinician and neither has raised it).

---

## Three lore edits this forced, all needing the owner's word

The number six does not fit the canon nine. These are the seams, and they are all
in text I wrote — say the word and any of them changes.

**1 · Nine diggings became six.** The Diggings' description said "Nine so far",
with nine named owners. Six are drawn. The Row's note now reads *"Three more
diggings were begun and are not lived in. Nobody talks about whose they were
going to be."* The three that lost their home are **Gita's**, **Vero's** and
**Osvald's**, chosen this way: Gita's could not survive being shared, because its
whole entry is that nobody has been inside it; Vero's had no lore attached to it
at all; and Osvald's going lets Ulla keep hers, which is where the half-sibling
distance lives. The alternative is to keep nine on the map and cut the household
sizes, which the owner has already ruled out.

**2 · Vero lost her home to the rock.** That sentence is mine. It is the reason
she is in Mara's house, and it is the best thing the constraint produced — the
woman who finds Mara's mothering suffocating and cannot say so now lives in her
spare chamber. But it is invented, and it is the one invention in this pass that
carries real weight.

**3 · "Sixteen people are still in the Cabins" is now ten.** That note went with
the old single Cabins room and has not been replaced. Osvald's line —
*"has not dug himself a home and will not say why"* — is mine, and does the same
work the old note did: choosing not to dig is visible.

Still open from the last phase, unchanged: the Great Wall's "twenty-six metres"
against a ten-tile face, and Ulla's "forty metres from Osvald's" — which this
pass makes true in a different way, since Osvald is now in the ship entirely.

## What the tests now hold

- Twenty-seven rooms, thirteen hull and fourteen rock; eleven of them homes.
- **Every home's door and its corridor's door are the same doorway** — checked as
  orthogonal adjacency between the two grids' door cells, so nudging a block and
  breaking a doorway fails the suite rather than the eye.
- Five cabins touching the Long Walk, three to port and two to starboard, each
  connecting to nothing else. Six diggings touching the Row, three facing three.
- Corridors are exempt from the twelve-tile cap on their long axis and held to
  three tiles of walkable width on their short one.

## Built: the five cabins

`tools/roomlab/cabins.html`. The mould was first pulled out of `berth.html` into
`cabin-kit.js`, and `berth.html` now renders it with no variation at all — its
output is **byte-identical to the version from before the extraction**, which is
the check that the mould did not drift while it was being made reusable.

The five differ through exactly three things and nothing else:

| | What varies | Why it is the only axis |
| --- | --- | --- |
| **The lamp** | 1.0, 0.55, 0.3, 0.6, 0.45 | The Cabins' authored direction is that the modularity is in the geometry and the variation is in the light. Darkness is the ground state, so the brightest cabin is the mould untouched and the rest are dimmed away from it — never lifted above the reference. The falloff is centred over the table, and clipped to the inside of the shell so all five keep the same hull. |
| **Starboard** | Cabins Four and Five | Across the walk the floor tilts the other way, so the whole trace is flipped and the two notices are then repainted unflipped — a mirrored notice is a mirrored piece of writing. |
| **One object** | one per cabin | The glyph that cabin's room legend already declares, and at most one mould prop given up to make room for it. |

| Cabin | The one object | Made of |
| --- | --- | --- |
| One | a sleeping passenger's case, stowed and never opened | `furn(17,13)`, plus a second document on the table |
| Two | a shim stack in the after corner, one plate every nine days | drawn — no sheet carries a stack of shims. Seen from here a stack is the top plate's face and the edges of the ones under it, so that is what is drawn, in the pack's own idiom: flat tones, hard steps, a dark line under every leaf. A cut edge is a date, and the top plate is bright because it was cut this week |
| Three | a photograph taped across a square of missing plate | the patch is drawn on the wall *before* the pipes, so the run crosses it; its cut edge is deliberately **broken and uneven**, because an unbroken bright line all the way round reads as a picture frame, which is the one thing it must not be. The photograph is `furn(13,0)` with its calendar cut away — the only photograph in the pack that is not a pin-up — held by two strips of tape corner to corner |
| Four | a plate shelf lashed onto two uprights, in the after corner | drawn — the plate, two uprights under its ends, and the same laid cord wrapped over plate and upright together at each end. The two documents are drawn *before* the plate, so its front edge cuts across their feet and they read as resting on it rather than standing behind it |
| Five | a locker that is not the ship's, shut | `furn(10,3)` — the closed locker, the one with its door shut, its vents and its handle — 20 x 56, wedged as far into the corner as the walls allow, with one shadow under its feet and no other mark anywhere |

All five report clean: no overlapping props and nothing crossing the frame.

Three things the render caught that reading the code would not have. The dimming
was clipped to the **unmirrored** outline, so on a starboard cabin it painted a
flat block into the corner the ladder well leaves empty. The one object was being
drawn **after** the dimming, so every cabin's own thing floated out of its own
light. And `lamp` defaulted to **0**, not 1 — so `berth.html`, which calls the
mould with no variation at all, was rendering at the *darkest* falloff the kit
can produce. It now defaults to 1, and berth.html's output is byte-identical to
the render from before the mould was extracted, which is the check that the trace
did not drift.

A fourth pass, on the pictures rather than the code, replaced three of the five
objects outright. The shim stack was a smooth eleven-step gradient that read as a
smear of dirt; the shelf was a grey bar with seven evenly spaced bolts on it,
which read as a control panel, and its ropes were completely hidden behind the
things resting on them; the photograph sat inside a clean bright rectangle that
read as a framed picture rather than a hole. In all three cases the caption was
describing something the picture did not show. Where the two disagreed the
picture was fixed, except in Cabin Four, where the seven mismatched bolts had no
legible place on a shelf that hangs from rope — there the sentence went.

### The owner's review pass

Shown the five, the owner changed three of them, and every change was the same
note in a different room: **the object must not cost the room.**

- **Two.** The stack moved out of the middle of the deck into the after corner,
  and the two papers that were lying there came out. One object in a corner beats
  two objects and a third thing in the traffic.
- **Four.** The shelf came off the bunk head entirely — *"no se ve la cama"*. It
  stands in the after corner now on two uprights. The berths are the room; a
  shelf that hides one is a worse shelf, however well it hangs.
- **Five.** The locker is the closed sprite rather than the angled one, wedged
  harder into the corner, and it now casts **one shadow, under its feet, and
  nothing else** — the drag marks and the side shadow are gone. Because the
  narrow locker no longer overruns the alcove, the mould's desk comes back, so
  the cabin keeps the density of the other four.

The pattern worth keeping for the Workshops: an added object is only allowed to
occupy floor nobody was using, and to cast light and shadow the way everything
else in the trace already does.

## Next: the Workshops

Unchanged from the last phase, and now more clearly right. It is the only room
whose reference shows how a rock-side room is walled — salvaged corrugated sheet
standing on bare ground, `workshop-plate-walls-on-dirt.png` — and the six
diggings need exactly that grammar. Building the Workshops first means the
diggings are built second with the wall question already answered.

Order from here: **the five cabins (done) → Workshops → Infirmary → Hold → a
first digging → the other five → Well.** The cabins came first at the owner's
call, while the mould was fresh; the diggings still go in one-and-then-the-rest,
because the first of them is where the clone-and-vary rule gets proved for the
makeshift references.
