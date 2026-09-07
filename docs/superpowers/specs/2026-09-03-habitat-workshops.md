# The Workshops: a trace, not a version

Building, phase seven. Branch: `night-shift-habitat`.

`tools/roomlab/workshops.html`. 250 × 228 px, the reference's own native size.
`pnpm check` is green and the room reports **clean** — 8 props on the floor, 12
on the wall, nothing overlapping that the render does not also overlap.

> **What this room is.** A 1:1 trace of `reference/workshop-two-bay.jpg`. Same
> block wall, same tiled floor, same objects, same places. Not a version of it,
> not an adaptation of it, and not the same room rebuilt in another material.

---

## The first attempt, and why it was wrong

The first build of this room substituted the materials: rock for the concrete
block, rock dust for the tiled floor, bolted plate for the wall between the bays.
The reasoning was that the Workshops is a rock-side room in the habitat and the
reference is a built one.

That broke the rule this whole project runs on — *if there is a reference, it is
traced* — and the owner rejected it. A room that changes its walls, its floor and
its dividers is not the reference at a new size; it is a different room that
happens to have the same furniture. The materials came back.

## How the trace was made

Nothing here was estimated. `measure/trace.py` — added in this pass — takes every
connected component of every candidate sheet, correlates it over its own alpha
mask against the render, and prints the source rectangle, the destination
position and the score. **Thirty-seven objects matched at ncc ≥ 0.93**, twelve of
them at 1.000, and those positions are used verbatim; each one is marked `ANCHOR`
in the source with its score.

`measure/find_at.py` does the reverse for a rectangle you name, and
`trace.whats_at()` answers "what sprite is at this place", which is how the
shutter, the tool chest, the grate and the stool were pinned down.

The structure was read off the render the same way, a pixel column at a time:

| | Measured |
| --- | --- |
| the room | x 7..242, y 7..210 |
| the step | bay two is cut 32 px higher; its west wall is x 135..140 |
| the bands | 6 px everywhere — 1 px ink, 4 px of `#6c6c6c`, 1 px ink |
| the wall | one 32 × 64 block-wall tile pair, `rt(4,7)`+`rt(4,8)`, mortar every 8 px. Bay one's sits at y 45, bay two's at y 13 — which *is* the 32 px step |
| the floor | `rt(8,8)`, phase (29,29), matched at ncc 0.975, with the two cracked variants where the render has them |
| the doorway | the south wall is open from x 46 to x 75 |

The wall's phases are forced rather than chosen: the render's mortar rows fall on
y ≡ 1 (mod 8) and its vertical joints on x ≡ 1 (mod 16), and the tile's own are
at rel 4 and rel 4 — which fixes the placement to y 45 / y 13 and x ≡ 13 (mod 32).

**10.4 % of the room's pixels still differ from the render**, measured inside the
room outline. Most of that is the reference being a JPEG; the rest is the four
items below.

## What is not in it, and why

The rule is that anything in a reference with no sprite is **named, not
substituted**. Four things qualify:

1. **The spill under the lockers.** A pale run-out with a tin lying in it. The
   best match in either sheet is 0.64 — it is drawn in the render, not stamped.
   The one part of it that *is* a sprite (ncc 0.957) is placed; the rest is left
   out.
2. **The dressing on the bottom bench.** The bench is `ws(11,0)` at ncc 0.66 and
   the timber on it is anchored, but the red caddy and one container are the
   nearest sprite rather than the exact one.
3. **The pipe run's left elbow**, where the horizontal run turns down into the
   drop. The run itself is exact — its bright row is the sheet's row 423, and it
   lands on y 52, which fixes the piece at y 51 and the run at x 21..67.
4. **A second container** by the bottom bench's right end.

## What the habitat still owes this room

The Workshops is `side: 'rock'` in `rooms.ts` and this trace is a built room.
That is a real inconsistency and it is now the owner's call, not mine:

- **Leave it.** The bays were built by people who had hull plate and a shipyard
  to cut it in, and a block wall is what they made. Cheapest, and the trace stands.
- **Re-skin it later**, once every room is traced, so the material pass is one
  decision made across the whole map rather than room by room.

The lore that the room carries — three bays, the fabricator, the queue, Lior's
sorted scrap — is **not drawn in this pass**. The trace came first because the
trace is the thing that was wrong. Where those go is the next question.

`rooms.ts` also gives the Workshops a 9 × 9 grid with `|` in both halves and a
full-width `=`, which describes four cells while its own note says three bays.
Untouched: the grid is walkability data, and re-cutting it moves every room below
it on the map. Flagged for the corridor phase.

## Next

The Infirmary and the Hold, both hull rooms with measured references and approved
libraries, traced the same way — and now with `trace.py` doing the measuring,
which is the tool this pass was really for.
