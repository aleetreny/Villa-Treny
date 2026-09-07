# The references, the scale, and the order the rooms get built

Planning, phase four. Branch: `night-shift-habitat`.

This settles **which reference sustains which canon room**, **how big a room is**,
and **what order the sixteen get built in**. It answers the blocking question left
open by `2026-09-02-habitat-room-handoff.md`.

It does not reopen the concept, the lore, the layout, the map art or the material
grammar. `2026-08-31-habitat-rooms.md`, `2026-09-01-habitat-plan.md`,
`2026-09-01-habitat-map-art.md` and `2026-09-01-habitat-room-grammar.md` stand.

Nothing is built yet. This is the plan the building follows.

> **Superseded on the size question.** The owner took a different decision from
> the one recommended below: the canon grids do not survive if they break the
> visual scale, so a traced room is now **exactly the size of its measured
> reference** and the map was rebuilt around that. See
> `2026-09-02-habitat-new-scale.md`. Everything else here — the catalogue, the
> measurements, the reference-to-room mapping and the build order — still
> stands, and the sizes in the tables below are the pre-decision ones.

---

## How every number below was got

The handoff's rule — *measure, do not estimate* — is the reason this document
exists, so the method is written down and the tools are committed in
`tools/roomlab/measure/`.

1. **Find the render's integer scale.** A pixel-art render is made of k × k
   constant blocks. Test every k from 2 to 8 **at every phase offset**, because a
   crop shifts the grid — this is what defeated the first attempt, which read
   every render as 1:1.
2. **Reduce to native.** Sample one pixel per block. Everything afterwards is
   measured in native pixels.
3. **Prove the library.** Take every connected component of every sheet's alpha
   channel — the sheet's real objects, the same ground truth as
   `find-objects.html` — and find each one's best normalised cross-correlation
   inside the native render. NCC over the sprite's own mask ignores a global tint
   or a room shadow, so a shaded copy still scores. A score of 1.000 is the same
   sprite, pixel for pixel.
4. **Where the automatic pass fails** — heavily recompressed JPEGs, and promo art
   that was redrawn — measure one prop against its sheet with a ruler overlay, the
   way the bed at `furn(14,10)` fixed the first reference at 5.34×.

Result: for every example in the archive, which pack it is built from and at what
scale, established by pixel evidence rather than by eye.

---

## The libraries: what the archive adds

Seven packs in the archive are **byte-identical** to sheets already in
`public/assets/props/`. Six are **new**.

| Pack | Status | Worth adopting? |
| --- | --- | --- |
| Post Apoc Shelter (32 × 32) | already have | — |
| PostApoc Workshop | already have | — |
| Public Bathroom (dirty) | already have | — |
| professional kitchen | already have | — |
| Garden Planters | already have | — |
| **makeshift furniture** | **new** | **Yes.** Squatted, improvised, personal. It is the missing vocabulary for the Diggings and for the Cabins' second clutter layer. |
| **Post Apoc Office** (32 × 32) | **new** | **Yes.** Desks, consoles, filing banks, corkboards, partition screens, safes — and a ruin set with broken walls and rebar that nothing else in the collection has. |
| **canned food and drink** | **new** | **Yes.** Cargo provenance: factory-finished, saturated, out of place. Exactly what comes out of a crate. |
| 50s Diner | new | No. Chrome and cherry red; wrong world. |
| Fancy Mansion | new | No. |
| Xmas Decorations | new | No. |
| midcentury modern | new | No. Clean, warm, wooden, undamaged — the opposite of the grammar. |
| Graveyard | new | Only two objects: the dug earth and the shovel-in-a-mound. Not worth the sheet. |

Also true, and worth fixing while we are here: **the repo mixes shadowed and
unshadowed variants.** `shelter_furniture.png`, `workshop.png` and `bathroom.png`
are the pack's *with-shadow* sheets; `kitchen.png` and `shelter_exterior.png` are
the *without-shadow* ones. Rooms that use kitchen steel next to shelter furniture
— the Common, the Infirmary, the Well — will have props that cast shadows sitting
beside props that do not.

---

## The catalogue

Every image in the archive, measured. **"tiles"** is native pixels ÷ 32, which is
the sprite tile and, on the evidence of the beds, about one metre.

### Room interiors, post-apocalyptic — the ones that matter

| Example | drawn at | native | tiles | library, proved by | What it is |
| --- | --- | --- | --- | --- | --- |
| `Post Apoc Shelter_7` | ×3 | 154 × 218 | **4.8 × 6.8** | `Shelter_Furniture_32x32`, 6 objects at ncc 1.000 | A bunker room: single bed, steel locker, two racks of stores, gas bottles, armchair, first-aid box, and a **stores alcove partitioned off the main room**. |
| `Post Apoc Shelter_5` (= the repo's `two-berth-cabin.jpg`) | 5.34× in the 1170 px version | ≈ 204 × 205 | **6.4 × 6.4** | shelter furniture + walls; already traced as `berth.html` | Two-berth cabin with a ladder well cut into the top wall. **The room the method was learned on.** |
| `Post Apoc Shelter_4` | ×2 (ruler: bunk `furn(18,0)` 54 × 73 → 146 px tall) | 166 × 250 | **5.2 × 7.8** | shelter furniture | Bunk room and stores: bunk with ladder, military footlocker, racks of jars and tins, cabinet, boxes, pinup and calendar. |
| `PostApoc_Workshop_3` | ×4 | 250 × 228 | **7.8 × 7.1** | `PostApoc_Workshop`, 7 objects at ncc 1.000 | **Two-bay garage.** Pegboard tool wall, dressed bench, red tool lockers, wheeled tool chest, stool, drum of timber, roller shutter, fire extinguisher, floor grate. |
| `PostApoc_Workshop_1` | ×4 | 179 × 212 | **5.6 × 6.6** | `PostApoc_Workshop`, 5 objects at ncc 0.997 | **An open workshop walled with salvaged corrugated sheet standing on bare dirt.** No drawn wall band, no floor tile. The single most useful image in the archive for the rock half of the map. |
| `PostApoc_Workshop_4` | ×2 (ruler: 2 px outlines at 3× zoom) | ≈ 600 × 430 | **18.7 × 13.4** | cross-pack; several props are in no shipped sheet | **Three rooms in one frame** — office, store closet, workshop bay — sharing walls. A composition reference, not a traceable one. |
| `Public_Bathroom_1` | ×4 (5 objects at ncc 0.92–0.98) | 184 × 170 | **5.8 × 5.3** | `dirty_publicbathroom_set` | Filthy public bathroom **with a partitioned stall**: urinals, sink, hand dryer, bins, mop, graffiti, puddles, litter, stains that run. |
| `Public_Bathroom_3` / `_4` | ×4 | 153 × 158 | **4.8 × 4.9** | bathroom set | Small washroom, clean and dirty variants of the same room. |
| `professional_kitchen_1` | ×4 | 178 × 212 | **5.6 × 6.6** | `professional_kitchen`, 8 objects at ncc 1.000 | Working kitchen: extractor hood, griddle, prep tables with under-shelves, warming cabinet, sink, stacked plates, ingredient racks, double swing doors. |
| `makeshift_furnitureset_1` | ×4 | 178 × 217 | **5.6 × 6.8** | `makeshift`, 9 objects at ncc 1.000 | Squatted bedsit: clothes rail, poster, TV on a crate, armchair, toolboxes as tables, cardboard boxes, plank-and-trestle desk, rug. |
| `makeshift_furnitureset_2` | ×3 | 245 × 181 | **7.7 × 5.7** | `makeshift`, 10 objects at ncc 1.000 | **Two rooms sharing a wall with a gap in it**, and a notched outline. Mattress on the floor, crates as shelving, cooler, TV. |
| `makeshift_furnitureset_3` | ×4 | 181 × 187 | **5.7 × 5.8** | `makeshift`, 8 objects at ncc 1.000 | Two more rooms sharing a wall: bed and laptop-on-crates one side, microwave on crate stacks and plank shelving the other. |
| `Post Apoc Office_6` | ×3 | 236 × 269 | **7.4 × 8.4** | `Office_Exterior` 9 + `Office_Furniture` 6, all ncc 1.000 | **A ruin.** Broken walls with exposed rebar, concrete rubble, a safe, a filing cabinet, a desk, dirt floor. The only torn-structure reference in the archive. |
| `Post Apoc Office_5` | ×4 | 199 × 199 | **6.2 × 6.2** | `Office_Furniture_32x32`, ncc 0.988 | Abandoned office: desks, filing banks, water cooler, bookcase, papers over the floor, dead plant, cracked window. |
| `Post Apoc Office_2` | native, 594 × 787 | — | see note | office pack, redrawn promo art | L of two rooms: desks, cubicle screens, corkboard, photocopier, bin, door. Props do not match the shipped sheets at any integer scale — promo art. |
| `Post Apoc Office_4` | native, 545 × 736 | — | see note | as above | Waiting room with collapsed ceiling, **rubble and a rock mass pushing in through the floor**. |
| `Post Apoc Office_3` (gif) | — | 609 × 516 | — | office pack | Two desks and a whiteboard, lit and unlit — the same room drawn twice for a light state. Directly relevant to the night watch. |

### Exteriors and ground

| Example | native | tiles | library | What it is |
| --- | --- | --- | --- | --- |
| `Post Apoc Shelter_1` | 237 × 258 | 7.4 × 8.1 | shelter exterior | **A shelter mouth cut into a hillside**, corrugated face under rock, boarded door, hazard sign, spoil heaps, drums, shovel. |
| `Post Apoc Shelter_3` | 310 × 215 | 9.7 × 6.7 | `Shelter_Exterior`, 8 at ncc 1.000 | Dugout entrance with a corrugated hood, barred door, tyres, jerry can, spoil, worn dirt tracks. |
| `Post Apoc Shelter_2` | 310 × 215 | 9.7 × 6.7 | exterior + furniture | Open ground: autotiled dirt, drums, sign on a post, corrugated fragment, dead scrub. |
| `Post Apoc Shelter_6` | 89 × 109 | 2.8 × 3.4 | shelter | **A hatch flush in the ground**, drums, radiation sign, tyre. |
| `Post Apoc Shelter_8` (gif) | 672 × 864 | — | exterior | Chain-link compound with gates around a ground hatch. |
| `Post Apoc Office_1` | 357 × 473 | 11.2 × 14.8 | `Office_Exterior`, 7 at ncc 1.000 | Office block from above with roof plant, ducting and rust runs. |
| `Garden_Planters_1` | 177 × 194 | 5.5 × 6.1 | Garden Planters, ncc 0.973 | **Improvised planters** — oil drums, tyres, buckets, tins — growing tomatoes on dirt. Birds. |
| `Graveyard_1` / `_2` | 218 × 280 / 197 × 240 | 6.8 × 8.8 / 6.2 × 7.5 | `Graveyard_Set`, ncc 1.000 | Fenced plot, headstone, **a dug grave and the spoil beside it**, dead trees. |
| `Camping_Set_1` | 106 × 119 | 3.3 × 3.7 | **no library in the archive** | Tent, camp chair, fire ring, tins, potted plants. Cannot be traced — the sheet is not here. |

### Other styles — present, not used

`50s_Diner_1` (7.8 × 6.8, ncc 1.000), `midcentury_modern_1–4` (5.6 × 6.6),
`FancyMansion_1–3`, `Xmas_1–3`. All are the same author, the same construction and
the same size band. They contribute **forms** — a booth, a counter run, a dining
table with chairs, a sideboard — but not materials. Under the room grammar every
object must be assignable to one of four provenances, and a walnut sideboard is
assignable to none of them.

`minimapa.jpg` is not an asset example. It is the labelled-corridor minimap the
plan spec already credits for the eleven named connective spaces.

The remaining images at 4.8 × 3.9 tiles (`50s_Diner_2`, `Graveyard_3`,
`PostApoc_Workshop_2`, `Public_Bathroom_2`, `Post Apoc Office_7`) are itch.io
store covers, not rooms.

---

## What the measurements say about size

Three facts, all measured, and together they dissolve the handoff's blocking
question into something smaller than it looked.

**1. The scales already agree.** A bed is 28 × 62 px on `shelter_furniture.png`,
which is 0.9 × 1.9 tiles, which is a bed. **One sprite tile is one metre and one
grid tile is one metre.** There is no scale mismatch between the art and the canon
grids. The reference room was never at a different scale from `rooms.ts`.

**2. The depth is already right, and only the width is out.** Every single room in
the archive is between 4.8 and 7.8 tiles wide and 4.9 and 8.4 deep — call it six
by six. The canon grids are 22–32 wide and 7–14 deep. So:

> A canon room is **two to five reference rooms long, and one reference room
> deep.**

That is drawn in `tools/roomlab/reference/fig-scale-audit.png`: every canon grid at
32 px per tile, filled with copies of the traced 204 × 205 cabin at the same scale.
The Cabins holds 4.1 of them. The Common holds 5.0. The Spine holds 2.2. In every
one of the sixteen, the reference room fits the depth with room to spare.

**3. What actually went wrong was density, not size.** The canon grids carry
**one significant object per 9.3 m² of walkable floor**. `Post Apoc Shelter_7`
carries roughly **one per 1.2 m²**. That is an eight-fold gap, and it is the whole
of why `infirmary.html` reads as a shelf of props against a wall: 22 × 7 metres of
floor holding two beds, two chairs, a cabinet and a slab.

The room grammar already has the answer and it was not being used: **set dressing
is drawn detail with written lore and no state, and never enters the grid.** The
grid holds what the simulation must know about. The drawing holds that *plus* the
tins, papers, cups, cable, spill and rust that make the reference rooms read.

And the author does not draw big rooms either. His largest composition,
`PostApoc_Workshop_4`, is 18.7 × 13.4 tiles — and it is **three rooms**, not one.
`makeshift_2` and `makeshift_3` are two rooms sharing a wall. `Public_Bathroom_1`
is a room with a stall partitioned off it. `Post Apoc Shelter_7` has a stores
alcove. **Every time this author needs more than about seven tiles, he puts in a
wall.**

---

## The decision

### The options

**A · Shrink the canon grids to reference size.** Every room becomes about 7 × 7.
`rooms.test.ts` would pass untouched — it asserts shape, closure, legend coverage
and connectivity, and **no test hard-codes a single dimension**. But the Berths'
four banks, the Diggings' nine homes and the Cabins' eight cabins do not fit in
seven tiles; the Great Wall's twenty-six metres of clean stone becomes seven; and
the Common's whole reading — *the hall is far bigger than the thing in it* —
becomes impossible. The map's day-one-hundred footprint collapses to a corner of
the frame. **Cheapest to draw, most expensive in meaning.**

**B · Change nothing and draw each room as a run of bays.** Zero code change.
Each canon room is drawn as two to five traced cells at the reference's size,
side by side, at the room's depth, divided where the grid already puts a `|`.
This is exactly how the author composes. It fixes the Infirmary, the Workshops,
the Hold, the Berths and Hydroponics on its own. It does **not** fix the rooms
whose compartments are two tiles deep — a cabin at 5 × 2 has a bunk and a metre of
floor, and the reference cabin it would be traced from is six deep.

**C · Bays, plus depth only where a compartment is too shallow to draw.**
B, and then re-cut the depth of the six rooms whose cells cannot hold what the
lore says is in them. Widths, ids, connections, legends and object counts all
stand. This is the recommendation.

### Recommended: C

| What it costs | |
| --- | --- |
| `rooms.ts` | Six grids re-cut **deeper only**: Cabins 26 × 8 → 26 × 18, Hold 28 × 8 → 28 × 12, Infirmary 22 × 7 → 22 × 9, Diggings 32 × 8 → 32 × 14, Workshops 30 × 9 → 30 × 13, Well 22 × 9 → 22 × 11. Ten grids untouched. No id, connection, legend entry or width changes. |
| `rooms.test.ts` | **Nothing.** It asserts rectangularity, a closed boundary, legend coverage, doors ≥ connections, 60–80 legend objects and full connectivity. It contains no dimension. Re-cut grids satisfy all of it. |
| The map | `section.ts` re-packs. It is already scheduled for rewrite by the plan spec — `HULL_ORDER`, `ROCK_AT`, `LINKS` and `FRAME` all go. The hull grows 16 rows and the warren 12, which is why the plan's 260 × 150 frame is the right one and the current `FRAME` of 200 × 116 is not. |
| The lore | Nothing. Every distance the specs name — twenty-six metres of wall, a twelve-metre table, forty metres between two doors, four metres north in the dark — survives, because no width changes. |

Two rooms keep their emptiness on purpose and are **not** divided into bays: the
Great Wall, whose lore is that it was cut too big, and the Common, whose reading
is a bright table in a dark hall. The Hollow is the third: it has nothing in it,
and that is the entry. In those three the sparseness is authored, and the density
rule is suspended by name rather than by accident.

### The rule that comes with it

> **No room is drawn as one undivided space wider than about eight tiles, except
> the Great Wall, the Common and the Hollow, where the size is the content.**

---

## The mapping: reference → canon room

**Cover** reads: *trace* — an example covers it as it stands; *adapt* — an example
covers it but something must change; *from 0* — no example, build from the sheets.

| Canon room | Cover | Reference | What it gives | What has to change, and what does not exist |
| --- | --- | --- | --- | --- |
| **The Cabins** 26 × 8 → 26 × 18 | **trace** ×4 | `Shelter_5` — **already traced as `berth.html`** | The whole cell, measured and clean | Repeat four times per deck. The variation is the light and the two clutter layers, not the geometry. The ladder well becomes the Long Walk's stair. |
| **The Workshops** 30 × 9 → 30 × 13 | **trace** ×3 | `PostApoc_Workshop_3` (two bays), `_1` (plate walls on dirt), `_4`'s right bay | Pegboard, dressed bench, tool chest, lockers, stool, shutter, grate | Brick wall → rock. Bay partitions are bolted hull plate, as in `_1`. **The fabricator does not exist** in any sheet. |
| **The Hold** 28 × 8 → 28 × 12 | **trace** ×3 | `Shelter_4` (racks, footlockers, jars), `Workshop_4`'s store closet, kitchen racking rows 12–13 | Racking, crates, boxes, tins, footlockers | Forty-one *unopened* crates is a repetition problem, not an art one. Cargo saturation comes from the new **canned food** sheet. |
| **The Infirmary** 22 × 7 → 22 × 9 | **trace** ×3 | `Shelter_7` (bed, first-aid, stores racks, gas bottles, alcove) | The ward bay, complete | **A diagnostic bed does not exist**; the nearest is `furn(17,0)`, a plain frame bed. **The slab does not exist**; the nearest is a kitchen steel prep table, `kitchen` row 7–8. Both are named, not substituted quietly. |
| **The Diggings** 32 × 8 → 32 × 14 | **trace** ×9 | `makeshift_2` and `_3` — **two rooms sharing a wall, which is the Row in miniature** | Mattress on the floor, crates as furniture, clothes rail, posters, cooler, plank shelving | Walls become rock. Nine cells that differ from each other *is* the content. Needs the **makeshift** sheet adopted. |
| **The Common** 32 × 9 | **adapt**, undivided | `professional_kitchen_1` (Pilar's corner), `50s_Diner_1` (booth and counter *forms* only) | Griddle, hood, prep tables, under-shelves, benches | **The long table is a hull plate and does not exist** — it is the one object the lore says was built, so it is drawn. No diner material survives, only the shape. |
| **The Well** 22 × 9 → 22 × 11 | **adapt** ×2 | `Public_Bathroom_1` | The entire wet vocabulary: puddles, running stains, drains, grating, mop and bucket, tile | **Tanks do not exist** — nearest is a stack of drums. **Filter housings do not exist.** Sinks and pumps come from the kitchen sheet. |
| **The Dock** 24 × 7 | **adapt** ×2 | `Shelter_3`, `Shelter_1`, `Shelter_6`, `Shelter_8`, `shelter_exterior` rows 3–4 and 12–16 | The outer hatch, ground hatches, hazard signs, spoil, big double doors | **Three suits and their racks do not exist anywhere in the collection.** This is the Dock's whole first sentence and it has to be drawn. |
| **Hydroponics** 30 × 10 | **adapt** ×3 | `Garden_Planters_1` | Improvised planters — drums, tyres, buckets, tins — and living plants | **The lamp bank does not exist**, and it is both the room's light and its most valuable object. **Tray racks do not exist**; the nearest are workshop shelving units. |
| **The Bridge** 22 × 8 | **adapt**, undivided | `Post Apoc Office_5`, `_2`, `_3`.gif | Desks read as consoles, a chair, scattered paper, a dead screen | **The cracked port does not exist.** `shelter_walls` rows 0–2 have small window frames; nothing spans a wall. Drawn. The pilot's chair nobody sits in is `Office_Furniture` t(11,9), and the taboo is drawn as the wear that is *not* there. |
| **The Breach** 26 × 8 | **adapt** ×2 | `Post Apoc Office_6` (broken walls, rebar, rubble), `_4` (rock pushing through a floor) | The torn structure, exactly | **Vacuum has no vocabulary in any sheet** — no stars, no unlit-and-still. Drawn, and it is the same problem as the Hollow, so solve it once. |
| **The Cold Berths** 30 × 10 | **adapt** ×4 | `kitchen` rows 9–10: tall upright cabinets with glass fronts, in a bank | The repeat, the glass, the bank | **They are refrigerators and will read as refrigerators** unless the glass frosts, the light goes cyan and the contents are a person. Flagged as the riskiest adaptation on this list. The manifest terminal is an office desk terminal. |
| **The Face** 24 × 7 | **from 0** | `Shelter_1`/`_3` for the dugout mouth; `Graveyard_2` for dug earth and spoil; exterior sheet for the shovels and picks | Tools left at the face, spoil, the mouth | An unfinished tunnel end has no reference. The progress marks and the three-week-old unsigned carving are drawn. |
| **The Spine** 14 × 14 | **from 0** | `workshop` rows 12–13 (electrical panels, sockets, compressor) is the only near thing | Panels, conduit, a shaft ladder from `furn` col 2–7 row 12–13 | **No reactor face, no charge-cell rack, no allocation panel.** The only square room in the canon, the only vertical one, and the only one with no reference at all. |
| **The Great Wall** 26 × 7 | **from 0**, undivided | One terminal (office), one stool (workshop) | Two objects | The room is twenty-six metres of flat, clean, blank stone that nobody has touched. There is nothing to trace because there is nothing in it. **The hardest room on the list and the one with the least to draw.** |
| **The Hollow** 28 × 10 | **from 0**, undivided | — | — | A natural void, orthogonal to nothing, floor not flat, roof unmeasured, and nothing in it. Shares the no-light problem with the Breach. |

**From nothing: five rooms** — the Cold Berths (adapted, but from an object that
fights it), the Spine, the Great Wall, the Face and the Hollow. **Objects that
exist in no sheet and must be drawn:** the three suits and their racks, the
fabricator, the lamp bank, the tray racks, the water tanks, the filter housings,
the diagnostic bed, the slab, the reactor face, the charge-cell racks, the
allocation panel, the cracked port, the long hull-plate table, and vacuum itself.

---

## The ship, room by room

Grid is the canon width × the depth under decision C. **Bays** is how many traced
cells the room is drawn as.

| # | Room | Side | Grid | Bays | Held up by |
| --- | --- | --- | --- | --- | --- |
| 1 | The Cabins | hull | 26 × 18 | 4 × 2 decks | `berth.html`, already traced |
| 2 | The Workshops | rock | 30 × 13 | 3 | `PostApoc_Workshop_3`, `_1` |
| 3 | The Hold | hull | 28 × 12 | 3 | `Shelter_4`, `Workshop_4` closet |
| 4 | The Infirmary | hull | 22 × 9 | 3 | `Shelter_7` |
| 5 | The Diggings | rock | 32 × 14 | 9 | `makeshift_2`, `_3` |
| 6 | The Common | rock | 32 × 9 | **1, on purpose** | `professional_kitchen_1` for one corner only |
| 7 | The Well | rock | 22 × 11 | 2 | `Public_Bathroom_1` |
| 8 | The Dock | hull | 24 × 7 | 2 | `Shelter_3`, `_6`, `_8` |
| 9 | Hydroponics | rock | 30 × 10 | 3 | `Garden_Planters_1` |
| 10 | The Bridge | hull | 22 × 8 | **1, on purpose** | `Post Apoc Office_5` |
| 11 | The Breach | hull | 26 × 8 | 2 | `Post Apoc Office_6` |
| 12 | The Cold Berths | hull | 30 × 10 | 4 | `kitchen` upright cabinets |
| 13 | The Face | rock | 24 × 7 | 2 | `Shelter_1`, `_3` |
| 14 | The Spine | hull | 14 × 14 | 3 decks | nothing |
| 15 | The Great Wall | rock | 26 × 7 | **1, on purpose** | nothing |
| 16 | The Hollow | rock | 28 × 10 | **1, on purpose** | nothing |

## Build order

Ordered by *learning per unit of risk*, not by the vocabulary batches in the room
grammar spec. That spec's batch one — Common, Cabins, Hydroponics — puts two of
the three hardest rooms first: the Common has no reference and its central object
must be drawn, and Hydroponics' light source exists in no sheet. The Cabins is the
right first room; the other two are not. **This is a deliberate departure and it is
the second decision below.**

1. **The Cabins.** The cell is already traced and clean. Building it is repetition
   plus variation, and it teaches the bay assembly with the risky part already
   done. *Learns:* how a canon room is made of bays; how a corridor cuts through
   one; how light carries variation across identical geometry.
2. **The Workshops.** Dense same-pack reference at a measured scale, and
   `Workshop_1` shows exactly how a rock-side room is walled in salvaged plate on
   dirt. *Learns:* the entire rock-side wall and floor grammar. Second in, because
   eight rooms depend on it.
3. **The Hold.** Racking and repetition, low risk, and the first room where cargo
   provenance has to read as cargo. *Learns:* the crate vocabulary and how to draw
   forty-one of something without it turning into wallpaper.
4. **The Infirmary.** Rebuilt from `Shelter_7` over the top of the existing
   composed version, so it is a direct before-and-after that proves the method to
   the eye. *Learns:* what to do when a named object is not in the sheets — the
   first time we draw one rather than substitute quietly.
5. **The Diggings.** Nine cells from `makeshift_2`/`_3`. *Learns:* personal
   provenance, and nine-way variation where the differences are the content.
6. **The Common.** First authored-emptiness room, first drawn hero object, and the
   boldest lighting call in the specs. It goes here because by now the method is
   proven and the failure would be legible rather than confusing.
7. **The Well.** *Learns:* water, stain, grating, and the wet end of the trace
   system.
8. **The Dock.** *Learns:* the outside, the hull-to-vacuum boundary, and the first
   wholly invented object that the lore leads with.
9. **Hydroponics.** *Learns:* the only green and the only white light, both drawn.
10. **The Bridge.** *Learns:* a drawn architectural feature — the cracked port —
    and a taboo drawn as absent wear.
11. **The Breach.** *Learns:* vacuum, and unlit space. Solved once, used twice.
12. **The Cold Berths.** *Learns:* cyan, and repetition at a scale nothing else
    needs. The riskiest adaptation, deliberately after eleven rooms of practice.
13. **The Face.** *Learns:* an edge that is unfinished on purpose and moves.
14. **The Spine.** *Learns:* heat and verticality, from nothing.
15. **The Great Wall.** One large blank surface, and making it hold attention.
16. **The Hollow.** Last, because its content is the absence of everything the
    first fifteen taught.

Then the eleven connective spaces, as the room grammar spec already sequences
them: fast, once the rooms they join exist.

---

## For the owner to decide

**1 · The size decision.** A, B or C above. *Recommended: C* — keep every width,
draw every room as a run of bays, and deepen only the six rooms whose compartments
are too shallow for what the lore puts in them. `rooms.test.ts` needs no change
either way; `section.ts` is rewritten either way.

**2 · The build order.** Follow the room grammar spec's batches, or reorder by
reference coverage as above. *Recommended: reorder.* The cost of following the
batches is starting with two rooms that have no reference and one object that has
to be invented before the method is proven.

**3 · What to do about objects that exist in no sheet.** There are fourteen, and
the Dock, Hydroponics and the Spine each lead with one. Three ways:
 - **(a)** Draw them into a small `habitat_extra.png` in the pack's palette and
   grid, every entry listed and attributed. *Recommended.* It is the only option
   that keeps the lore intact, and the grammar's "bolted, never welded" gives a
   consistent way to draw them.
 - **(b)** Adapt the nearest sheet object and accept the read — the Berths become
   fridges, the tanks become drums.
 - **(c)** Change the lore to what the sheets have. Cheapest, and it inverts the
   project.

**4 · Which new libraries to adopt.** The archive brings six packs the repo does
not have. *Recommended: adopt makeshift furniture, Post Apoc Office and canned
food; leave the diner, the mansion, midcentury, Xmas and the graveyard out* — they
are the same author and the same quality, but no object in them can be assigned a
provenance under the room grammar. The three packs are 128 KB against the 432 KB of
sheets the site already serves, so this lands on the parked atlas question rather
than resolving it.

---

## Fixed on the way through

`berth.html` loaded its sheets from `sheets/furn.png`, a directory that is not in
the repository, so the one room built by the right method rendered blank for
anyone who opened it. It now uses `../../public/assets/props/`, the same path
every other tool in `tools/roomlab/` uses.

## Open, not decided

1. The asset atlas and the licence. Unchanged and still parked: `public/` is
   copied into `dist/`, so every sheet is served to every visitor. Decision 4
   makes it slightly larger, not different in kind. Reference images live in
   `tools/roomlab/reference/`, which is **not** copied into `dist/`.
2. `main` and `night-shift-habitat` have diverged, so the `--ff-only` merge in
   `CLAUDE.md` is impossible and nothing from this branch has deployed.
3. The shadowed/unshadowed sheet mix described above. A one-file swap, but it
   changes every room that already uses `kitchen.png`.
