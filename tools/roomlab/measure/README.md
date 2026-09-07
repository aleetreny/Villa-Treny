# Measuring a reference

The rest of `roomlab/` is HTML you open over a local server. This directory is
not: reading a reference is offline image analysis, and it happens once per
reference, before any drawing.

    pip install pillow numpy scipy

## Why this exists

A reference render off itch.io is almost never at 1:1. It is the artist's room
exported at 2×, 3×, 4× or 8×, and often cropped, which shifts the block grid off
the origin. Get the factor wrong and the room gets traced at the wrong size — and
you will not notice until the props do not fit.

The first pass at this read every render as 1:1 because it only tested phase
offset (0,0). `Post Apoc Shelter_7` is a 3× render at phase (1,2), and at (0,0)
it looks like native art. **Test every offset.**

## The order to run them in

**1 · What scale is it, and what is it natively?**

    python3 native.py "<render>"
    # -> x3 phase(1, 2) -> 154x218 px  = 4.81 x 6.81 tiles of 32

Writes `native/<name>.png`. Everything downstream measures native pixels.

**2 · Which sheet is it built from?**

    python3 provenance.py native/<name>.png ../../../public/assets/props/*.png
    # ->   6 objects  drawn x1.0  shelter_furniture.png   best ncc 1.000

Every real object of every sheet, correlated against the render over its own
alpha mask with the mean removed, so a room shadow or a global tint does not
defeat the match. **1.000 is the same sprite, pixel for pixel.** Matching at
scale 1.0 on a native render is the proof that the render and the sheet are the
same art at the same size.

**3 · When the automatic pass gives nothing.** Heavily recompressed JPEGs and
redrawn promo art both defeat it. Fall back to the method that fixed the first
reference: measure one prop by hand.

    python3 objects.py ../../../public/assets/props/shelter_furniture.png | grep 'furn'
    python3 ruler.py "<render>" 40 95 200 300 4 /tmp/bunk.png 16

`objects.py` gives the prop's true ink size on the sheet — never guess a sprite's
tile span, a 2×3 grab may be two halves of two objects. `ruler.py` puts a labelled
pixel ruler over a crop so the same prop can be read off the render in source
coordinates. Divide one by the other. At zoom Z a one-pixel outline is Z screen
pixels wide, which reads the scale on its own.

**4 · Writing the trace.** `provenance.py` says *which sheet*; these say *what
goes where*:

    python3 trace.py native/<render>.png <sheet.png>... --thresh 0.93
    # ->  0.999  workshop.png  src(194,130)  43x30 t(6, 4)  ->  ( 88, 52)

Every object of every sheet, with the source rectangle to cut and the position to
cut it to. That line is one line of the room's source. `find_at.py` answers the
same question for a rectangle you name, and `trace.whats_at(render, sheets, box)`
answers the reverse — *what sprite is at this place* — which is how a prop that
is half-covered by the things sitting on it gets pinned down.

`trace.every_position(render, sheet, sx, sy, w, h)` finds **every** place one
sprite appears, not just its best. These references reuse a handful of small
props many times over — the Infirmary puts the same crate in four places and the
same flask in four more — and a global argmax only ever reports one of each.

`sheet_grid.py` draws a whole sheet with a numbered tile grid — `index-sheet.html`
without a browser, for picking props by coordinate.

## The figure

    python3 scale_audit.py <a 1:1 render of berth.html's room> ../reference/fig-scale-audit.png

Every canon grid from `rooms.ts` at 32 px per tile, filled with copies of the
traced reference cabin at the same scale. It is the evidence behind the size
decision in `docs/superpowers/specs/2026-09-02-habitat-references-and-scale.md`.

To get the 1:1 render: serve the repo (`python3 -m http.server`), open
`tools/roomlab/berth.html`, and save the right-hand canvas — it is drawn at 1:1
next to the zoomed one.

## What was learned measuring the archive

- **Every single room this artist draws is between 4.8 and 7.8 tiles wide and 4.9
  and 8.4 deep.** Whenever he needs more space than that, he puts in a wall:
  `workshop-three-rooms` is three rooms, `makeshift-two-rooms` is two,
  `bathroom-wet-and-filthy` is a room with a stall.
- **One sprite tile is one metre.** A bed is 28 × 62 px on the sheet. There is no
  scale mismatch between the sheets and the canon grids in `rooms.ts`.
- **His rooms carry about one object per 1.2 m².** The canon grids carry one
  significant object per 9.3 m². The difference is set dressing, which by the room
  grammar never enters the grid — and drawing only the grid is why the first
  composed room read as a shelf of props.

## Tracing a whole room: `roomtrace.py`

The tools above answer *where does this sprite go*. `roomtrace.py` answers *what
is this room made of*, which is a different problem — a pile of sprites drawn
over a shell, most of them partly hidden — and it solves four things at once
against one measure: **does the picture get closer**.

    python3 roomtrace.py                    # score every trace in diggings.html

| Pass | Decides |
| --- | --- |
| `places` + `greedy` | which sprite, where, **and at what depth** |
| `reorder` | the depth again, once its neighbours exist |
| `prune` | whether the object belongs at all |
| `nudge` | one pixel each way |

Run them in a loop until nothing moves. On the two-room diggings that loop was
worth far more than finding more sprites: 7.8 % → 0.16 %.

Two things it will not do for you:

- **It is a mirror of `digging-kit.js`, not the thing that ships.** Verify the
  final number off the browser's canvas. The two build the same shape by
  different means, and the one time they disagreed it was a real bug in the page
  worth 82 pixels.
- **It cannot draw a wall it has not been told about.** If a room has an interior
  wall and the shell does not know, the solver will cover those pixels with
  furniture and every number will look fine. Measure the ink columns and rows
  *inside* the outline before you run it.
