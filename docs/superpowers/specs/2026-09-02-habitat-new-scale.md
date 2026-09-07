# A small, dense, legible world: the habitat re-cut to reference size

Planning, phase five. Branch: `night-shift-habitat`.

The owner has taken the size decision, and it is not the one recommended in
`2026-09-02-habitat-references-and-scale.md`. This spec records what was decided,
what it changed, and what it costs.

> **The decision.** The canon grids do not survive if they break the visual scale.
> A room that is traced is **exactly the size of its measured reference**. A room
> that is not traced may grow **a little**, and only a little, to keep the world
> small, dense and legible. The map and the minimap are rebuilt around that.

This is built. `rooms.ts`, `section.ts` and their tests are updated, `pnpm check`
is green, and `tools/roomlab/plan.html` draws the result from the same data.

Nothing else is reopened. The sixteen rooms, their twenty-one connections, the
material grammar and the map's art direction all stand.

> **Superseded on the room count.** The residential system was closed after this
> spec: the Cabins became the Long Walk plus five cabins you can enter, and the
> Diggings the Row plus six, so the habitat has twenty-seven rooms rather than
> sixteen. See `2026-09-02-habitat-residential-system.md`. The sizing rule, the
> frame and every other room here are unchanged.

---

## The rule

> **A room's grid is ⌈reference px ÷ 32⌉ + 1 in each axis.** The extra tile is the
> boundary ring, so the *interior* is the reference's own floor and a trace drops
> in without moving anything.

A sprite tile is 32 px and, on the evidence of the beds, about a metre. So the
rule reads in plain language: **the room is as big as the picture it is traced
from, plus its walls.**

Rooms with no reference yet are sized to the same family — five to nine tiles —
and three are allowed to reach twelve. Each of those three is a room whose
**emptiness is its content**, which is the only argument accepted for growth:

- **The Great Wall**, cut too big on purpose, whose subject is one flat face.
- **The Common**, whose reading is a bright table in a hall bigger than it.
- **The Hollow**, which has nothing in it, and that is the entry.

The Spine reaches eleven on one axis only, because it is a shaft rather than a
room: three decks stacked down a ladder well.

## The sixteen

`traced` means the grid comes from a measured render. `family` means no reference
yet, sized to the band the traced rooms establish. `grown` means bigger on
purpose, and why.

| Room | Was | Now | Class | Reference, measured |
| --- | --- | --- | --- | --- |
| The Cabins | 26 × 8 | **8 × 8** | traced | `two-berth-cabin.jpg` 204 × 205 px |
| The Hold | 28 × 8 | **7 × 9** | traced | `shelter-bunk-and-stores.jpg` 166 × 250 |
| The Infirmary | 22 × 7 | **6 × 8** | traced | `shelter-bunker-room.png` 154 × 218 |
| The Workshops | 30 × 9 | **9 × 9** | traced | `workshop-two-bay.jpg` 250 × 228 |
| The Well | 22 × 9 | **7 × 7** | traced | `bathroom-wet-and-filthy.jpg` 184 × 170 |
| The Bridge | 22 × 8 | **8 × 7** | family | — |
| The Dock | 24 × 7 | **7 × 7** | family | — |
| The Breach | 26 × 8 | **8 × 8** | family | — |
| The Cold Berths | 30 × 10 | **9 × 8** | family | — |
| Hydroponics | 30 × 10 | **8 × 8** | family | — |
| The Diggings | 32 × 8 | **9 × 7** | family | sized to `makeshift-two-rooms.png` 245 × 181 for when that library is approved |
| The Face | 24 × 7 | **8 × 7** | family | — |
| The Spine | 14 × 14 | **8 × 11** | grown | a shaft, three decks |
| The Great Wall | 26 × 7 | **12 × 7** | grown | the face is the content |
| The Common | 32 × 9 | **12 × 9** | grown | the hall is bigger than the thing in it |
| The Hollow | 28 × 10 | **12 × 9** | grown | nothing in it |

**3,576 tiles of room became 1,117.** The largest room is twelve tiles on its
longest side; it used to be thirty-two.

## The plan

`tools/roomlab/plan.html` draws it, from `habitat-plan.json`, which is generated
out of `rooms.ts` and `section.ts` by `measure/plan-data.mjs`. Nothing in the
drawing is authored: if the plan and the rooms ever disagree, the plan is wrong
and that is where you see it.

- **The frame is 78 × 80 tiles**, down from 200 × 116. The habitat's footprint is
  **66 × 70** inside it, and the rock still runs off three sides with unmapped
  stone east and south-east — the direction the warren grows.
- **The hull is a chain, not a stack.** Seven rooms strung bow to stern along the
  Long Walk with **two tiles of corridor between every pair**, the whole chain
  running at twenty-two degrees, measured off the placements rather than
  asserted. The Breach hangs off the flank west of the walk, with two sealed
  mouths and nothing on the other side.
- **The bow is out in vacuum.** The Bridge sits above the rock line; the Dock
  straddles it, which is where the hull's flank broke the surface; everything from
  the Cabins down is buried.
- **The warren is packed.** No room is more than **six tiles** from another, and
  most are two. That replaces the old area-ratio check, which stopped meaning
  anything when the rooms shrank and the corridors did not.
- **The Common keeps its four mouths** on four different faces, so it is crossed
  rather than entered, and the routes through it differ.
- **Every door faces the room it leads to.** The grids were re-cut with doorways
  on the faces that actually look at their neighbours, and the plan routes each
  passage orthogonally from doorway to doorway rather than drawing a line between
  two centres.

The eleven named connective spaces from `2026-09-01-habitat-plan.md` are labelled
on the drawing where the topology already forces their route. **Their widths and
shapes are not designed** — that is the next phase, and the walkable
`among us`-style corridors the owner asked for are part of it.

---

## What this cost, stated plainly

Three things do not survive at this scale. None of them is fixed here.

**1 · The Cabins is now one cabin, not eight.** The traced reference is a
two-berth cabin, so that is what the room is: two bunks, the wedges, one sleeping
passenger's things, and the ladder well. The other seven cabins become **doors
along the Long Walk**, which is a corridor and belongs to the next phase. The
lore is unchanged; where you see the eight changes.

**2 · Two stated distances no longer match the drawn space.** They are the only
two hard numbers in `rooms.ts`:

| Where | It says | It is now |
| --- | --- | --- |
| The Great Wall's description | "twenty-six metres of clean stone" | a ten-tile face — the longest single surface in the habitat, but ten metres |
| The Diggings, Ulla's | "forty metres from Osvald's" | six tiles, the widest separation the Row allows |

Both were left as written. Changing them is a lore edit and the owner's call. The
recommendation, if asked: keep the rooms and cut the two numbers, because what
both sentences actually mean — *the largest surface here*, *as far from him as she
could get* — survives without them.

**3 · Counted things are shown as a face, not a census.** Hundreds of sleepers,
forty-one unopened crates: the room shows a bank and a stack, and the rest
continues past the frame into unlit depth. That is better art direction than
drawing three hundred capsules, and it is consistent with the map-art spec's
"darkness is the ground state" — but it is a change in how those numbers read.

---

## What we can start now

Approved libraries: **post-apocalyptic / shelter, bathroom, kitchen**.
**Confirmed by the owner on 3 September: that includes the PostApoc Workshop
pack**, `workshop.png` and `workshop_roomtiles.png`, both already in the repo —
so the Workshops are unblocked. Exteriors and surface are
deferred, and so are `makeshift`, `Post Apoc Office`, `canned food` and
`Garden Planters`.

Five rooms have both a measured reference and an approved library:

| # | Room | Reference | Library | Blocked on |
| --- | --- | --- | --- | --- |
| 1 | **The Cabins** 8 × 8 | `two-berth-cabin.jpg`, already traced as `berth.html` | shelter furniture + walls | nothing |
| 2 | **The Workshops** 9 × 9 | `workshop-two-bay.jpg` ×4, `workshop-plate-walls-on-dirt.png` ×4 | workshop + roomtiles | nothing |
| 3 | **The Hold** 7 × 9 | `shelter-bunk-and-stores.jpg` ×2 | shelter furniture | nothing |
| 4 | **The Infirmary** 6 × 8 | `shelter-bunker-room.png` ×3 | shelter furniture, kitchen steel | the diagnostic bed and the slab are missing objects — deferred by decision, so they are drawn as the nearest thing and listed |
| 5 | **The Well** 7 × 7 | `bathroom-wet-and-filthy.jpg` ×4 | bathroom + kitchen | tanks and filter housings are missing objects |

The other eleven wait on a library, a missing object, or both. The Common needs
its hull-plate table, which exists in no sheet; the Diggings needs `makeshift`;
the Bridge and the Breach need `Post Apoc Office`; the Dock and the Face need the
exteriors; Hydroponics needs its lamp bank; the Cold Berths, the Spine, the Great
Wall and the Hollow have neither reference nor object.

## The next room after the Cabins: the Workshops

Three reasons, in order of weight:

1. **It teaches the rock half of the map.** `workshop-plate-walls-on-dirt.png` is
   a room walled in salvaged corrugated sheet standing on bare ground — no drawn
   wall band, no floor tile. That is the wall and floor grammar for all eight rock
   rooms, and nothing else in the collection shows it. Learn it once, on the room
   that needs it most.
2. **The reference is dense, same-pack and measured.** Seven objects match
   `workshop.png` at ncc 1.000 with the render at ×4. There is nothing to invent.
3. **It has four doorways on three sides**, so it is the room that will exercise
   the corridor rules first — and corridors are the phase after this one.

The Infirmary is the reasonable alternative, because rebuilding it over the old
composed version is a direct before-and-after that proves the method to the eye.
It is second on the list for exactly that reason.

---

## Open, not decided

1. **The missing objects.** Fourteen of them, deferred by decision until the
   structure is closed. The Common, Hydroponics, the Dock, the Spine and the Cold
   Berths each lead with one.
2. **The corridors.** Eleven named connective spaces with routes but no widths,
   no grids and no floor. This is the next planning phase and it is what makes the
   habitat walkable.
3. **The two stated distances** above.
4. **The asset atlas and the licence.** Unchanged: `public/` is copied into
   `dist/`, so every sheet is served to every visitor.
5. **`main` and `night-shift-habitat` have diverged**, so the `--ff-only` merge in
   `CLAUDE.md` is impossible and nothing from this branch has deployed.
