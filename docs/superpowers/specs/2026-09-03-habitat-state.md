# WHERE THE HABITAT IS — read this first

**This is the handoff. If you are picking this project up, start here, then read
only the specs this file sends you to.** Branch: `night-shift-habitat`.
Last updated: 4 September 2026, after the two-room diggings were traced to the
pixel — 56 and 2 pixels differing — and the
whole asset library was vendored into the repo.

---

## What is being built

**The Habitat.** A pixel-art micro-civilisation: twenty-five people living in a
crashed ship half-buried in an asteroid, seen from the owner's portfolio site.
Twenty-seven rooms, each drawn as a top-down interior, plus a map and a minimap
that are generated from the same data the engine walks.

The art is built from 0_mem0ry's asset packs in `public/assets/props/`, and — this
is the whole method — **rooms are traced off that same artist's own room renders**,
which live in `tools/roomlab/reference/`.

## The one rule everything else hangs off

> **If there is a reference, it is traced. Not adapted, not reinterpreted, not
> rebuilt in another material. Traced.**
>
> The one exception so far is the Infirmary, and it is an exception the owner
> made after seeing the trace, not a licence to skip one. Trace first, name what
> is missing, and let the owner decide.
>
> Same walls, same floor, same objects, same places, same size.

The corollaries, all of which have already been paid for once:

- **Measure before drawing.** Never estimate a position or a size off the eye.
  `tools/roomlab/measure/` exists for exactly this and is described below.
- **Anything in a reference with no sprite is NAMED, not substituted.** Say which
  object it is, in a comment in the room's source, and leave it out. When the
  owner rules otherwise — the Infirmary, and the Well's dispenser — the
  substitution is marked `SUBSTITUTE` at the call site and written up in that
  room's spec, so nobody later reads it as a trace.
- **Show the work visually and often.** Render, look, correct, render again. Do
  not ship the first acceptable result.
- **Never guess a sprite's tile span.** Half of these sheets put two or three
  objects in one 32 px tile. Use the connected-component tools.
- **A high score is not proof. Check a colour.** `ncc_map` is mean-removed and
  contrast-normalised, so it scores *shape*, not art. The Diggings' references
  report their wall bands at **1.000** against three different sheets, and the
  pack they actually come from is one we do not have — same 1 px ink / 4 px fill
  / 1 px ink cross-section, recoloured. Before believing a match on anything
  low-detail (a band, a pipe, a plain panel), sample one pixel of it in both
  images.

The Workshops was built once as a "version" of its reference, with rock instead of
the block wall and dust instead of the tiled floor, and was rejected. The spec for
it (`2026-09-03-habitat-workshops.md`) records why, and it is the clearest
statement of the rule in the repo.

## Every trap that has actually bitten, and its tell

Read this before you measure anything. Each of these cost real time once.

1. **A score of 1.000 is not proof of the same art.** `ncc_map` is mean-removed
   and contrast-normalised: it scores *shape*. The Diggings' references matched
   three different roomtiles sheets at 1.000 on a band whose colour existed in
   none of them — they came from a pack we did not have, the same band kit
   recoloured. **Tell:** a low-detail object (a band, a pipe, a plain panel)
   scoring perfectly against several sheets at once. **Fix:** sample one pixel
   in both images before believing it. *(That pack has since arrived, and the
   references now match on colour too. The check is what proved it was missing.)*
2. **`native.py` under-reads heavily compressed JPEGs.** It called the Well's
   reference ×2 when it is ×4. **Tell:** `provenance.py` then reports its best
   matches at `x2.0` — the sprites having to be *doubled* to fit. **Fix:** reduce
   by hand with `Image.resize(..., NEAREST)`. Not BOX: BOX averages the JPEG's
   ringing into the pixels and halves the hit count.
3. **Never address a sprite by its tile.** Half these sheets put two or three
   objects in one 32 px tile. Use `objects.components`.
4. **When components merge, split them by their own period, not by the tile
   grid.** The bathroom sheet's four urinals touch, so they come back as one
   78 px blob. Their alpha column profile repeats every 16; cut on 16 they match
   at 0.97, cut any other way they top out at 0.6.
5. **`ncc_map` refuses a mask under 30 px** and returns `None`. Every small
   sprite — graffiti, and anything drawn at half alpha, like puddles — needs a
   different method: lowest mean colour error inside a box, or matching the
   colour blob's bounding box in sheet and render. Say which one placed each
   prop, in the comment.
6. **Re-run every placed prop through a ±5 px local search afterwards.** On the
   Well it moved five and confirmed the one my eye was certain was wrong.
7. **Solve walls and floors by brute force, not by eye:** every opaque tile ×
   every phase, scored on the *lowest half* of per-pixel errors so the props
   covering the wall cannot drag the fit. And check the sub-period — a tile with
   a 4 px or 8 px grid has several phases that score within noise of each other,
   and only its sparse features separate them.
8. **An autotile's edge may run through the middle of its rim tiles, not along
   their border.** `shelter_terrain`'s dirt families do. Lay the nine-slice on a
   half-tile offset or every floor lands 16 px out, which looks almost right.
9. **Canvas path fills antialias their diagonals.** Anything not axis-aligned
   must be filled a scanline at a time with `fillRect`.
10. **Draw order matters for two of the same sprite overlapping.** The back one
    first, so the front one's own outline separates them; the other way round
    they merge into one object.
11. **Serve the roomlab pages over `python3 -m http.server`, from the repo root.**
    `file://` taints the canvas and the pages read pixels back off it; a server
    started from the wrong directory 404s the sheets and the page just hangs.
12. **Draw a room from its own data, not beside it.** `diggings.html` reads the
    grids out of `habitat-plan.json`, which is generated from `rooms.ts`. That is
    what made three unenterable homes visible — they had passed every structural
    test for weeks.
13. **A room can be connected, closed and correct and still be impossible to walk
    into.** Graph connectivity is not interior reachability. There is a test for
    it now; keep it.
14. **Draw the room's *interior* walls before you look for its furniture.** Both
    two-room references have a wall stub inside the outline, and the first trace
    had no concept of one: the shell drew only the band round the edge, so the
    solver spent cardboard boxes and sofas explaining wall pixels and the rooms
    came back wrong in exactly the two ways the owner named — "the interior walls
    are not right and some objects are off". They are the same complaint. **Tell:**
    furniture that scores well, sits in an odd place, and hugs a straight line.
    **Fix:** count the ink columns and rows *inside* the outline first (`x=71` and
    `x=76`, `y=9…105` was the whole of the b partition), draw them, and only then
    solve the residual. With the walls right the same solver went from 7.8 % to
    0.16 %.
15. **A cut that touches the outline grows past it, and even-odd then paints it
    solid.** `outline(r, k)` insets the rectangle by k and *grows* each cut by k;
    a notch opening onto the top wall then sticks out above the inset rectangle,
    where it is crossed by one subpath instead of two — odd, so inside, so filled.
    **Tell:** wall drawn in the mouth of a notch, or a strip of floor outside the
    room's bottom-right corner. **Fix:** clamp every grown cut back to the inset
    rectangle. It is invisible until you diff the *browser's* canvas rather than
    the Python mirror of it; do that before you believe any trace number.
16. **The promo renders were made with more sheets than the packs ship** — and
    **saying exactly which sheet is missing is what gets it.** The Diggings were
    built once in a substituted material on a correct finding that their pack was
    absent; because the finding named the pack, the owner supplied it, and the
    six were rebuilt as traces. So when a reference will not trace: prove it —
    every sheet, several scales, colour as well as score — name the pack, and
    treat the substitution as temporary. The Hold and the Infirmary are still
    waiting on theirs.

## The method, in order

1. **`measure/native.py <render>`** — what integer scale was this exported at, and
   at what phase? Writes `measure/native/<name>.png`. Everything downstream works
   on native pixels. *Test every phase offset; the first version of this tool read
   every render as 1:1 and was wrong.*
   **It under-reads heavily compressed JPEGs.** It called the Well's reference ×2
   when it is ×4 — the tell is `provenance.py` then reporting its best matches at
   `x2.0`, i.e. the sprites having to be *doubled* to fit. When that happens,
   reduce by hand (`Image.resize(..., NEAREST)`, not BOX — BOX averages the JPEG's
   ringing into the pixels and halves the hit count) and re-run provenance until it
   matches at scale 1.0.
2. **`measure/provenance.py <native> <sheet>...`** — which sheet is it built from?
   A score of 1.000 at scale 1.0 means the render and the sheet are the same art
   at the same size, and the trace can be exact.
3. **`measure/trace.py <native> <sheet>... --thresh 0.93`** — **the trace list.**
   Every sheet object, with the source rectangle to cut and the position to cut it
   to. Each line of its output is one line of the room's source.
   **`trace.every_position()`** finds every place one sprite appears, not just its
   best: these references reuse a handful of small props many times over, and a
   global argmax only ever reports one of each.
4. **`measure/find_at.py`** and **`trace.whats_at(render, sheets, box)`** — the
   two directions of "and what about *this*": where does this rectangle go, and
   what sprite is at this place. The second is how a prop that is half covered by
   the things sitting on it gets pinned down.
5. **`measure/ruler.py <img> x0 y0 x1 y1 zoom out.png`** — a labelled pixel ruler
   over a crop, for everything the correlation cannot reach: wall bands, floor
   phases, where a wall meets a floor.
6. **Build the room as an HTML page in `tools/roomlab/`**, open over
   `python3 -m http.server` (never `file://` — the pages read pixels back off a
   canvas and `file://` taints it).
7. **Render it and diff it against the reference**, masked to the room's outline.
   That number is the target. The Workshops sits at 10.4 % and the Well at 15.8 %,
   most of which is the reference being a JPEG — its ink lines are grey, ours are
   black, and that difference cannot be closed and should not be.
7b. **When a whole room has to be traced, not a handful of props, solve the
   residual instead of the picture.** Plain best-NCC finds the small things and
   misses the furniture, because a sofa half hidden behind a table scores badly
   over the whole sprite. Score each candidate on the **trimmed** mean colour
   error over its own opaque pixels — the best 55 % of them, which is the part
   you can still see — search only where the residual still is, and **keep a
   placement only when it actually removes differing pixels**. A score can be
   fooled; the difference cannot. That took the Diggings from nineteen objects
   and 35 % to forty and 7.8 %. Large flat pieces — rugs, mattresses — still
   need a forced pass; they are too low-contrast to rank.
7c. **Then solve the other three degrees of freedom the same way — by the
   difference.** Position is not the whole placement. **Depth:** a cardboard box
   behind a cool box scores 5.7 and makes the room *worse* if it is painted last,
   so every candidate is composited at every index in the draw order and keeps the
   one that removes the most pixels (that single change found the boxes that had
   defeated four passes). **Existence:** offer to delete every object already
   placed, and drop the ones the picture is no worse without — the greedy pass
   commits on the evidence it had at the time, and eleven of forty-seven turned
   out to be wrong or hidden. **A pixel:** a sprite scored on its best 55 % can
   sit one pixel out and still win; ±1 on everything found the rug. Run
   place → reorder → prune → nudge in a loop until it stops moving. 7.8 % → 0.16 %
   came almost entirely from this, not from finding more sprites.
8. **Then run every placed prop back through a ±5 px local search.** This is the
   step that pays for itself: on the Well it moved five props, two of them badly
   (a tag at mean error 133 → 58, a puddle 27 → 9), and it *confirmed* the toilet
   my eye was certain was 18 px out. Trust the measure over the eye — but only
   after the measure has been allowed to look everywhere.
9. **Draw the room from its grid, not beside it.** `diggings.html` reads the six
   grids out of `habitat-plan.json`, which `measure/plan-data.mjs` generates from
   `rooms.ts`. A room drawn from its own walkability data cannot drift from it —
   and it makes that data's mistakes visible, which is how three sealed homes
   were found.

## Where each room is

| Room | State | Reference | Page |
| --- | --- | --- | --- |
| **The Cabins** ×5 | **done** | `two-berth-cabin.jpg` ×5.34 → 204 × 205 | `berth.html` (the mould), `cabin-kit.js`, `cabins.html` |
| **The Workshops** | **done** | `workshop-two-bay.jpg` ×4 → 250 × 228 | `workshops.html` |
| **The Infirmary** | **done**; traced, then composed on the owner's call | `shelter-bunker-room.png` ×3 → 154 × 218 | `infirmary.html` |
| The Hold | **blocked** — its reference is not traceable from our sheets, see below | `shelter-bunk-and-stores.jpg` | — |
| **The Well** | **done**; one object substituted, see below | `bathroom-wet-and-filthy.jpg` **×4 → 184 × 170** | `well.html` |
| **The six diggings** | **done — 1:1 traces**, **56 px / 2 px / 580 px** differing (0.16 % / 0.007 % / 2.4 %). The two-room pair is finished to the owner's eye; the bedsit was never asked for and is the one still worth work | `makeshift-two-rooms.png`, `-two-rooms-b.jpg`, `-bedsit.jpg` | `diggings.html`, `digging-kit.js` |
| The other sixteen | not started | some have none | — |

`tools/roomlab/reference/README.md` carries the measured scale of every reference.
`2026-09-02-habitat-references-and-scale.md` carries the full catalogue: what each
one shows, which sheet it is built from, and which canon room it is for.

## The five cabins, in one paragraph

One mould — `cabin-kit.js`, the two-berth cabin traced 1:1 — rendered five times.
`berth.html` calls it with **no variation at all**, and its output must stay
**byte-identical to the render from before the mould was extracted**. That is the
check that the trace has not drifted; if you change `cabin-kit.js`, re-render
`berth.html` and diff it. The five differ through exactly three things: the lamp
(1.0 / 0.55 / 0.3 / 0.6 / 0.45, always dimming away from the mould, never
brightening past the reference), starboard mirroring (Four and Five, with the two
notices repainted unflipped), and one object each. See
`2026-09-02-habitat-residential-system.md`.

## The rules that are not about art

- **Commit authorship.** `CLAUDE.md` is not optional here: every commit is
  authored *and committed* as Alejandro Treny Ortega, set per-command with the
  four `GIT_*` variables, and there is **no `Co-Authored-By: Claude` trailer and
  no `Claude-Session:` line**. Any command that writes a commit — rebase, merge,
  cherry-pick, amend — needs the same four variables.
- **Never open a pull request** unless the owner asks.
- **`pnpm check`** is `validate:repo && lint && typecheck && test`, and it is green
  at every commit. 591 tests, 33 files.
- **The asset licence.** 0_mem0ry's packs allow commercial use and modification;
  **resale and redistribution are not allowed**. `public/` is copied into `dist/`,
  so every sheet is currently served to every visitor. Cutting it down to an atlas
  of only the tiles used is open and unsolved.
- **The references are not served.** `tools/roomlab/reference/` is outside
  `public/`, deliberately.

## Open, and the owner's call

1. **`main` and `night-shift-habitat` have diverged** — 4 commits against 25 — so
   the `--ff-only` merge in `CLAUDE.md` is impossible and **nothing from this
   branch has deployed**. This is the oldest open item.
2. **The Workshops is `side: 'rock'` in `rooms.ts` while its trace is a built
   room.** Either leave it, or re-skin every room's material in one pass at the
   end. Do not decide this room by room.
3. **The lore the Workshops carries is not drawn** — the three bays, the
   fabricator, the queue, Lior's sorted scrap. Where authored content goes on top
   of a trace is unsettled, and it will come up in every room from here.
4. **Three lore edits** the residential system forced: nine diggings drawn as six,
   the invented line "Vero lost her digging to the rock", and "sixteen people are
   still in the Cabins" now being ten. The owner has said these are not worth time
   yet; fold them in with the next `rooms.ts` edit.
5. **Two stated distances** in `rooms.ts` no longer match the drawn space: the
   Great Wall's "twenty-six metres" and Ulla's "forty metres from Osvald's".
6. **`rooms.ts` grids that disagree with their room's own note** — the Workshops
   is 9 × 9 with partitions describing four cells while its note says three bays,
   and its east doorway opens onto a partition. Left alone: the grid is
   walkability data and re-cutting it moves every room below it on the map.
   Flagged for the corridor phase.
7. **The pack the Infirmary's render is dressed from, we do not have.** Four of
   its objects match nothing above 0.72. The owner's call for that room was to
   fill them with the nearest sprite the pack does have and to take the bed out,
   so **the Infirmary is composed off its reference rather than traced from it** —
   and its pixel-difference number no longer measures it. Getting that pack is
   still the only way to finish it as a trace. See
   `2026-09-03-habitat-infirmary.md` for the precedent this sets.
8. **The Hold cannot be traced.** `shelter-bunk-and-stores.jpg` matches nothing
   in `public/assets/props/` at any integer scale — not its bunk, not its
   footlockers, not even its wall. Its bunk is ~144 px wide where the sheet's is
   54, which is not a factor of two or three, and template-matching the wall, the
   mattress and a footlocker against every sheet at ×1..×4 tops out at 0.67. The
   reference README's "×2" came from a hand ruler in an early pass and does not
   hold. **This room needs the pack it is dressed from, or a different
   reference.** It is the same gap as the Infirmary's four objects, total instead
   of partial — which is now two rooms pointing at one missing pack.
9. **One object in the Well is a substitution.** Its reference's paper-towel
   dispenser is in no sheet we have — the best fit anywhere scores 54 mean
   colour error, which is not a match but the nearest grey rectangle. The
   bathroom pack's own dispenser stands there instead, marked at the call site.
   With the Hold and the Infirmary that is three rooms pointing at the same gap.
9b. **CLOSED — the Diggings' pack arrived.** They were the fourth and largest
   group to hit the missing-sheet gap, and were drawn once in a substituted
   material. `makeshift.png` and `makeshift_roomtiles.png` are now in
   `public/assets/props/`, their three references match at 1.000, and the six are
   traced. See `2026-09-03-habitat-diggings.md`.
   **Three groups still point at the gap:** the Hold (total), the Infirmary (four
   objects), the Well (one). Naming the missing pack precisely is what closed the
   Diggings, so name theirs the same way — the promo renders were made with more
   sheets than the packs ship, and asking for the right one works.
10. **`dig4`, `dig5` and `dig6` have identical grids**, and `dig2` and `dig3`
    share one. The canon says *the difference between them is the most public
    document in the habitat* — one is "finished to the millimetre", one is "the
    smallest" — and identical grids cannot say that. Re-cutting them moves rooms
    on the map, so it belongs with item 6 and the corridor phase.
11. **The corridors.** Nine of the eleven named connective spaces have routes but
   no grids and no floor. This is what makes the habitat walkable, and it is the
   next planning phase after the rooms.

## What drawing the rooms has caught in the data

Rooms are drawn from `rooms.ts` via `habitat-plan.json`, so a room that is wrong
in the data is wrong on the screen. Three finds so far, all now guarded by
**`rooms.test.ts` → "can be walked into: every open tile is reachable from a
door"**, which runs against all twenty-seven rooms:

- **Mara's, Quim's and Pilar's could not be entered.** Each had its front door in
  the wall directly below the spur of rock between its two chambers, so the whole
  interior — 31, 21 and 21 tiles — was sealed. Every existing test passed: the
  room graph was connected, the boundary was closed, the doors met the Row's.
  Nothing looked inside.
- **The Bridge sealed one tile** between its two dead consoles and the pilot's
  chair; **the Cold Berths sealed two** behind the bunks. One glyph moved each.
- The test deliberately allows two things: **vacuum is crossable** (the Breach is
  islands of floor in a tear, and reaching them is what a suit is for) and **a
  sealed `X` mouth still seeds the search** (it means "needs a key", not "no way
  in"). Floor sealed behind *furniture* is always a mistake.

## The library is in the repo

`tools/roomlab/library/` holds every 0_mem0ry pack the habitat draws from, as
downloaded, plus the artist's own example room renders — `sheets/` and `rooms/`.
It is **not** copied into `dist/`. Read `library/README.md` before hunting for a
sheet: it holds the 16 × 16 cuts and the `_Shadow` variants that
`public/assets/props/` does not, and it records which example rooms trace and
which do not.

**It also puts the whole archive in a public repository, and the artist's licence
forbids redistribution.** The owner asked for it there so other agents could use
it; it is his call, and it is recorded here so nobody assumes it was settled.

## The specs, and what each one closed

Read them in this order if you need the history. Each is closed unless it says
otherwise.

| Spec | What it settled |
| --- | --- |
| `2026-08-31-habitat-design.md` | the concept |
| `2026-08-31-habitat-residents.md`, `-roster-and-weave.md` | the twenty-five and the bonds between them |
| `2026-08-31-habitat-rooms.md` | the rooms and their lore |
| `2026-09-01-habitat-plan.md` | the layout and the eleven connective spaces |
| `2026-09-01-habitat-map-art.md` | the map: darkness is the ground state, six lights, world vs instrument |
| `2026-09-01-habitat-room-grammar.md` | four provenances, bolted never welded, the room sheet |
| `2026-09-02-habitat-references-and-scale.md` | every reference measured and mapped |
| `2026-09-02-habitat-new-scale.md` | **the size decision**: a traced room is exactly its reference's size |
| `2026-09-02-habitat-residential-system.md` | eleven homes, and the five cabins as built |
| `2026-09-03-habitat-workshops.md` | **the trace rule**, and what it cost to learn it |
| `2026-09-03-habitat-infirmary.md` | the trace, and the first room the sheets cannot finish |
| `2026-09-03-habitat-the-well.md` | the shell solved by brute force, the stall that is a sprite, and the three ways to place a prop |
| `2026-09-03-habitat-diggings.md` | how to trace a whole room by solving the residual, and the reference that scored 1.000 off the wrong pack |
| `2026-09-02-habitat-room-handoff.md` | superseded by this file |
