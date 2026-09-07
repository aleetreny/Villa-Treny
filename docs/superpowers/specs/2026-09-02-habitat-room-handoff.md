# Building habitat rooms — where this stands

Written at the end of the session that traced the first room off a reference.
Read this before touching `tools/roomlab/` or `src/lib/habitat/rooms.ts`.

## What is settled

Four specs are closed and should not be reopened:

| Spec | What it fixes |
| --- | --- |
| `2026-09-01-habitat-plan.md` | The layout skeleton — one top-down projection, 11 connective spaces, two hull↔rock crossings, a fixed 260×150 frame. |
| `2026-09-01-habitat-map-art.md` | Map art direction. Darkness is the ground state, light is the information; six diegetic lights; two registers (world = pixel art, instrument = flat ink); seven slow traces driven by simulation state. |
| `2026-09-01-habitat-room-grammar.md` | Material grammar. Four provenances — hull plate, rock, grown, cargo — plus personal effects. Bolted, never welded. |
| `2026-08-31-habitat-rooms.md` | The 16 rooms and their 21 connections, checked by `rooms.test.ts`. |

## The thing that changed this session

Rooms composed by judgement kept coming out too big and too sparse. The fix was
to stop composing and start **tracing**: take a reference render, measure it,
and put every sprite where the measurement says.

`tools/roomlab/berth.html` is the first room built that way, off
`tools/roomlab/reference/two-berth-cabin.jpg`. It is 204 × 205 px — about six
tiles across. The method is written up in `tools/roomlab/README.md`; the parts
that will save the next session a day:

- **Establish the reference's scale from one prop before anything else.** That
  one is these sprites at 5.34×, confirmed on the bed at `furn(14,10)`: 28 × 62
  on the sheet, 150 × 330 in the image.
- **Measure the background by folding a profile, not by eye.** The corrugation
  reads as a 4 px period in a JPEG and is actually 8 — the walls sheet at 1:1.
- **Place sprites by their ink rectangle, pipes by their centreline.** Placing
  by tile leaves objects cut in half and elbows that do not meet.
- **`find-objects.html` before picking anything.** A 2×3 grab off a sheet may
  be one object or two halves of two.

## The tension nobody has resolved — **answered, see below**

> Resolved by `2026-09-02-habitat-references-and-scale.md`, which measured it
> instead of estimating it. Short version: the scales already agree — one sprite
> tile is one metre and so is one grid tile — the canon *depths* are right, and
> only the widths are long, because **a canon room is two to five reference rooms
> laid end to end**. It gets drawn as a run of bays, not as one hall. What
> actually made the first room look wrong was density: the canon grids carry one
> object per 9.3 m² and the reference carries one per 1.2 m². The section below
> is kept as written, because the observation that started it was right.

The canon grids in `rooms.ts` are four to five times larger than the room that
actually looks right:

| | tiles |
| --- | --- |
| `berth.html`, traced, reads well | ≈ 6 × 6 |
| The Cabins, canon | 26 × 8 |
| The Common, canon | 32 × 9 |
| The Spine, canon | 14 × 14 |

Either the canon grids shrink, or a canon room becomes several traced rooms
joined by corridor. **That decision is the first real piece of planning work
and it has not been taken.** It changes `rooms.ts`, `rooms.test.ts` and the
map, so take it deliberately and write it down before building anything.

## The 16 rooms

| id | name | side | canon grid |
| --- | --- | --- | --- |
| `bridge` | The Bridge | hull | 22 × 8 |
| `dock` | The Dock | hull | 24 × 7 |
| `cabins` | The Cabins | hull | 26 × 8 |
| `breach` | The Breach | hull | 26 × 8 |
| `hold` | The Hold | hull | 28 × 8 |
| `infirmary` | The Infirmary | hull | 22 × 7 |
| `berths` | The Cold Berths | hull | 30 × 10 |
| `spine` | The Spine | hull | 14 × 14 |
| `greatwall` | The Great Wall | rock | 26 × 7 |
| `common` | The Common | rock | 32 × 9 |
| `hydroponics` | Hydroponics | rock | 30 × 10 |
| `diggings` | The Diggings | rock | 32 × 8 |
| `workshops` | The Workshops | rock | 30 × 9 |
| `well` | The Well | rock | 22 × 9 |
| `face` | The Face | rock | 24 × 7 |
| `hollow` | The Hollow | rock | 28 × 10 |

Two are built and neither is final: `infirmary.html` (composed, before the
tracing method) and `berth.html` (traced, and the one to copy).

## The sheets

`public/assets/props/`, all by 0_mem0ry — https://0-mem0ry.itch.io/.

| File | Grid | What it holds |
| --- | --- | --- |
| `shelter_furniture.png` | 20 × 16 | Beds, chairs, tables, lockers, pipes, ladders, notices, signs, barrels, papers. The workhorse. |
| `shelter_walls.png` | 14 × 12 | Doors, hatches, window frames, and the corrugated plate at rows 10–11. |
| `shelter_terrain.png` | | Outdoor ground. Not floors. |
| `shelter_icons.png` | | Small pickups — books, cans, papers. |
| `shelter_buildings.png` | | Exterior structures. |
| `shelter_exterior.png` | | Fences, roofs, doors, rubble. |
| `workshop.png` | | Benches, tool walls, lockers, safety notices, compressors. |
| `workshop_roomtiles.png` | 18 × 12 | Brick and tiled floors, shutters. |
| `kitchen.png` | 15 × 18 | Stainless steel. Counters tile at a 47 px pitch, not 32. |
| `kitchen_roomtiles.png` | | Kitchen floor and door tiles. |
| `bathroom.png` | | The dirty public-bathroom set, with shadows. |
| `bathroom_roomtiles.png` | | Bathroom floor and door tiles. |
| `garden/` | | Planters — barrels, buckets, tyres, a toilet, plant bases. |

Licence: commercial use and modification permitted; resale and redistribution
are not. See `LICENSE-0_mem0ry.txt`. **A live site serves these files to any
visitor**, so before this ships publicly they must be cut down to an atlas of
only the tiles actually used. The owner has parked this; it is not resolved.

## Ways of working the owner has asked for

- Go slowly and in detail. One room at a time.
- Show the work visually and often — render, look, fix, render again. Do not
  deliver the first acceptable output.
- References beat invention. When a reference exists, trace it and say what in
  the pack could not match it, rather than substituting something invented.
- Commit as Alejandro Treny Ortega (see `CLAUDE.md`); no Claude trailers.

## Open, not decided

1. ~~Room size versus the canon grids (above). Blocking.~~ **Answered** in
   `2026-09-02-habitat-references-and-scale.md`, which also carries the reference
   catalogue, the reference-to-room mapping, the build order, and four decisions
   waiting on the owner.
2. `main` has diverged from `night-shift-habitat` — 4 ahead, 17 behind — so the
   `--ff-only` merge in `CLAUDE.md` is impossible. Nothing has been deployed
   from this branch. The owner has not said how to reconcile it.
3. The asset atlas / licence question above.
