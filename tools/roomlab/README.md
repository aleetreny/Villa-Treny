# Room lab

El visor final de Night Shift está en la aplicación React: ejecutar `pnpm dev` desde Villa-Treny y abrir la dirección indicada por Vite. No depende del escritorio de Portfolio. Los pasillos y el explorador de esta carpeta se conservan como estudios recuperables; la navegación principal ahora es un atlas de salas con habitantes autónomos, diario y relaciones vivas.

`export-production.html` exporta las 46 composiciones aprobadas y sus máscaras al visor. Las instrucciones reproducibles están en `public/habitat/README.md`; no se necesitan iframes ni cargar RoomLab en la web final.

Composing habitat rooms from 32×32 asset sheets instead of drawing every prop.

Open any of these over a local HTTP server (`python3 -m http.server`), not
`file://` — the tools read pixels back off a canvas and the browser taints
canvases loaded from `file://`.

| File | What it does |
| --- | --- |
| `explore.html` | **Walk through the whole habitat** — one current scene, keyboard/click/touch movement, fades at open thresholds, a persistent left minimap and walking routes to destinations. All existing usable rooms join nine wings and a shared spine; Breach remains sealed. Source artwork is loaded when entered. |
| `explorer-room-art.js` / `explorer-room-art-sources.md` | Approved room renderers and native 1px floor/object masks, with exact opening and arrival positions. |
| `explorer-corridor-art.js` | A shared Workshop deck/wall vocabulary for all indoor halls, small material aprons, sparse source props and Garden/Shelter exterior terrain. The same prop coordinates generate their 4px collision footprint. |
| `measure/explorer-data.mjs` | Exports `explorer-network.json` from `src/lib/habitat/navigation.ts` and the actual room masks. Run after changing geometry or masks. |
| `corridors.html` | **Complete corridor review** — the ten current hallway scenes followed by the six initial studies, kept available for comparison. ZIP-only artwork at integer scale, optional movement overlays, source manifests and links into the playable explorer. |
| `index-sheet.html?f=<png>&s=<zoom>` | Draws a sheet with a numbered tile grid, so props are picked by coordinate rather than guessed. |
| `find-objects.html` | Labels connected components in a sheet's alpha channel and prints each real object's tile span. **Run this before picking anything.** |
| `infirmary.html` | **The Infirmary** — a 1:1 trace of `shelter-bunker-room.png`. Seventeen props at their own ncc position, thirteen at 1.000, and four objects named in the source that no sheet we own contains. |
| `contact-sheet.html` | Every prop a room uses, drawn large and labelled. Run it before placing: the index grid is not enough to tell a waste bin from a hazard sign, and I got that wrong twice. |
| `cabin.html` | A two-berth cabin. Its `place()` records every sprite's true ink rectangle, refuses nothing, but reports overlaps and anything crossing the frame. |
| `berth.html` | **The mould, alone and unvaried.** A two-berth cabin traced 1:1 off a reference render, 204 x 205 px. Places sprites by their ink position, not their tile, and runs pipe by centreline. |
| `cabin-kit.js` | That trace, as a module, so the hull's five cabins are the *same code* rather than five drawings that resemble each other. Takes one small `variation`: the lamp, whether the cabin is to starboard, one hook for the object only that cabin has, and the mould props it gives up for it. |
| `cabins.html` | **The five cabins of the Long Walk.** One mould, five times, side by side at 1:1 and at 3x, each with its household and its one object. |
| `workshops.html` | **The Workshops** — a 1:1 trace of `workshop-two-bay.jpg`. Same block wall, same tiled floor, same objects, same places; thirty-seven of them placed at their own ncc position. Not a version of the reference. |
| `well.html` | **The Well** — a 1:1 trace of `bathroom-wet-and-filthy.jpg`. The wall and floor tiles were solved by brute force over every opaque tile and every phase rather than by eye; the stall is 0_mem0ry's own partition sprite used three ways, not a wall. Twenty props, each comment naming which of the three placement methods put it there. |
| `digging-kit.js` | **The makeshift shell**, and the note on how a whole room gets traced rather than composed. A grey band, a 32 × 64 block of white brick whose bottom rows are the skirting, grey concrete below it, and an outline that is a rectangle minus rectangular cuts, so a notched room stays notched. |
| `bedroom-kit.js` | **The four replacement digging bedrooms, with ZIP-only enforcement.** Pilar and Xan use exact crops of the two finished ZIP references. Ulla and Yara copy only declared rectangles from the original Shelter terrain, wall and furniture sheets. The renderer has no visible-pixel drawing primitives. |
| `bedroom-sources.md` | **The source proof.** Names the ZIP-backed file, source rectangle and destination rectangle for every layered wall, floor and object in Ulla's and Yara's, plus the exact reference crops used by Pilar and Xan. |
| `bedrooms.html` | **The four-room comparison sheet.** Shows each reference beside its 2× output so the result and its differences can be checked directly. |
| `diggings.html` | **The six distinct digging bedrooms and The Games Room.** Mara and Quim keep their approved makeshift traces; the four replacement bedrooms use `bedroom-kit.js`; the old television-and-sofa bedsit survives once as the shared games room. |
| `library/` | **Every pack, as downloaded**, plus the artist's example room renders. Not served. Read its README before hunting for a sheet: it has the 16 × 16 cuts and the `_Shadow` variants that `public/assets/props/` does not. |
| `measure/` | Reading a reference before drawing it: what scale it was exported at, which sheet it is built from, and a pixel ruler for when that fails. Python, not a browser page — see `measure/README.md`. |
| `reference/` | The renders being traced from, each with its measured scale. See `reference/README.md`. |
| `offices.html` | **The four-room Office comparison sheet.** Administration, Duty Office, The Archive and Records, each shown beside its complete ZIP source at native-pixel scale. |
| `office-kit.js` / `office-sources.md` | **The Office renderer and source proof.** One exact ZIP-backed crop per room and no visible-pixel drawing primitives. |
| `facilities.html` | **The four-room service comparison sheet.** Maintenance, The Kitchen, The Stalls and The Washroom, each shown beside its complete ZIP source at native-pixel scale. |
| `facility-kit.js` / `facility-sources.md` | **The service-room renderer and source proof.** One exact 4× ZIP-backed crop per room and no visible-pixel drawing primitives. |
| `plan.html` | **The habitat at map magnification** — all forty-eight approved places at their real size, including the surface Hydroponics Yard, the furnished eastern wing, the separate Mansion wing and the three-room Diner suite. Unsupported placeholder rooms were folded into approved spaces; passages run doorway to doorway and the eleven assigned homes carry their residents' initials. Drawn from `habitat-plan.json`, which `measure/plan-data.mjs` generates out of `rooms.ts`, `section.ts` and the engine's `SLEEPS`, so the plan cannot drift from the habitat. |
| `outside.html` | **Four exterior references, source beside output** — Surface Camp, Hydroponics Yard, Shelter Entrance and the Inner Yard behind its door. Exact ZIP crops; the two olive floors use only the brown ground ramp sampled from the Garden reference. |
| `midcentury.html` | **Five furnished references, source beside output** — The Study, Spare Bedroom, The Parlour, Projection Room and Winter Parlour, each preserved as one exact native-scale crop of its ZIP composition. |
| `heritage.html` | **Eight exact references, source beside output** — the four-room Mansion wing, three-room Diner suite and exterior Graveyard. Seven exact bordered crops plus the complete cemetery with only edge-connected page-white removed. |
| `heritage-kit.js` / `heritage-sources.md` | **The renderer and source proof for that eight-place batch.** Every visible pixel is copied from a byte-verified ZIP composition; no room object is drawn with a canvas primitive. |
| `face.html` | **The Face, source beside output** — the complete unused boarded shelter-mouth composition at native scale: spoil, shovel, tyres, corrugated plate and the stopped track. |
| `face-kit.js` / `face-sources.md` | **The Face renderer and proof.** One exact 4x ZIP crop, with no visible-pixel drawing primitives. |
| `canon-partials.html` | **The six formerly partial canon rooms, source beside output** — The Bridge, The Dock, The Breach, The Hold, The Common and Hydroponics Yard. The first five preserve their full cropped export resolution; Hydroponics Yard is the already-approved Garden composition, reused exactly. |
| `canon-partials-kit.js` / `canon-partials-sources.md` | **The renderer and source proof for the partial-reference batch.** Every crop and destination is declared; visible pixels come only from the ZIP, and the five complete compositions are not reduced. |
| `corridor-plan.md` | **The reference-only corridor pass.** Eleven dedicated corridor visuals remapped to the consolidated 48-room world, with an existing ZIP vocabulary assigned to each and no new room compositions. |

## The two rules that took several passes to learn

**Never guess a sprite's tile span.** A 2×3 grab off the sheet may contain one
object or two halves of two. `find-objects.html` is the ground truth: the bunk in
column 17 is 1×3, the lockers are 1×2, the drums are 1×1.

**A sheet's own units may be narrower than their tile.** The kitchen counters are
31 px inside a 32 px tile, so a run of them laid on the grid shows a seam every
unit. `run()` in `infirmary.html` advances by each unit's measured ink width
instead, and they butt into one continuous length of steel.

**A score of 1.000 is not proof — check a colour.** `ncc_map` is mean-removed and
contrast-normalised, so it scores shape, not art. The Diggings' references
reported their wall bands at 1.000 against three different sheets while the pack
they actually came from was one we did not own: the same 1 px ink / 4 px fill /
1 px ink cross-section, recoloured. Before trusting a match on anything
low-detail — a band, a pipe, a plain panel — sample one pixel of it in both
images. *(Saying precisely which pack was missing is what got it supplied.)*

**Split a merged component by its period, not by the tile grid.** The bathroom
sheet's urinals touch, so the alpha has no gutter to cut on and `objects.py`
returns all four as one 78-px blob. Their alpha column profile repeats every 16,
and cut on 16 they match at 0.97; cut any other way they top out at 0.6.

**Objects belong on the 32px grid.** These sheets are authored on it. Nudge only
to seat something against a wall, or to hang it at a height — never to fake
randomness.

## Building a set from one trace

Five cabins that are almost the same room is a different problem from one room,
and the way it stays honest is that **there is only one drawing**. `cabin-kit.js`
holds the trace; `berth.html` renders it with no variation at all and its output
is byte-identical to the version from before the extraction, which is the check
that the mould did not drift. The five differ only through:

- **the lamp**, 0 to 1. Darkness is the ground state, so the brightest cabin is
  the mould untouched and the others are dimmed away from it — never lifted above
  the reference. The falloff is centred over the table, where the lamp hangs, and
  it is clipped to the inside of the shell so all five keep the same hull.
- **`mirror`**, for the two cabins across the walk, whose floors tilt the other
  way. The whole trace is flipped and then the two notices are repainted
  unflipped, because a mirrored notice is a mirrored piece of writing.
- **one `extras` hook**, drawing the single object that cabin has and nothing
  else, and a `plate` hook for anything done to the wall itself — that one runs
  before the pipes go on, so a patch of lifted plate sits *under* them.

Two things this caught that the eye would not have: the dimming was clipped to the
unmirrored outline and painted a flat block into the corner the ladder well leaves
empty on the starboard side; and the one object was being drawn after the dimming,
so every cabin's own thing floated out of its light.

## Tracing a reference

**Measure the reference's export scale first.** These renders are almost never at
1:1 — `berth.html`'s is 5.34x, the bunker room is 3x, the two-bay garage is 4x —
and reading it wrong sizes the whole room wrong. `measure/native.py` gives the
factor; `measure/provenance.py` proves which sheet the render is built from by
finding the sheet's own sprites inside it. Both are one command, and they replace
a day of eyeballing.

`berth.html` was measured before a pixel was drawn, and the numbers are worth
keeping:

- The reference is these sprites at **5.34x**. Confirmed on the bed at
  `furn(14,10)`: 28 x 62 px on the sheet, 150 x 330 px in the image.
  Everything else was divided by that.
- Its corrugated plate is the **walls sheet at 1:1** — an 8 px period. Read it
  by folding a column profile over 8: light 161/145/146, then dark 98/103/102.
  Eyeballing the stripes in a JPEG gives 4 and is wrong.
- Its deck is flat **#919191 with a grid line every 8 px**. No floor tile in
  the pack has an 8 px grid — the shop's is 16 and a full stop lighter — so
  that one is drawn.
- The room outline was traced by scanning each row for its first and last dark
  pixel: 204 wide, the top wall at y 32, a ladder well from x 96 to 140, and
  the room narrowing to x 32..172 below y 170.
- Sprites go down by their **ink** position and pipes by their **centreline**.
  Placing pipe by tile leaves the elbows not meeting.

One prop is not in the pack: the reference's right-hand wall carries a
landscape yellow notice with ruled lines. The nearest the sheets hold is
`furn(13,15)`, which has a skull on it. Nothing else in the four shelter
sheets, the workshop sheet or the exterior sheet is closer.

## Layout

Rooms are laid out in functional zones with a clear aisle, not as one prop per
tile. `cabin.html` is sleeping / stowage / stores / working, and the middle
column stays empty because that is where you walk.

**And a room is at most about seven tiles across.** Every room 0_mem0ry draws is
between 4.8 and 7.8 tiles wide; whenever he needs more space than that he puts in
a wall. The canon grids were re-cut to match: a traced room is now exactly the
size of its reference, and the largest room in the habitat is twelve tiles where
it used to be thirty-two. The measurements are in
`docs/superpowers/specs/2026-09-02-habitat-references-and-scale.md` and the
decision in `2026-09-02-habitat-new-scale.md`.

## The sheets

`public/assets/props/` — by 0_mem0ry, https://0-mem0ry.itch.io/. Commercial use
and modification permitted; resale and redistribution are not. See
`LICENSE-0_mem0ry.txt`. A live site serves these files to any visitor, so before
this ships publicly they should be cut down to an atlas of only the tiles used.
