# The Diggings — six rooms, three traces

**Status:** done, `tools/roomlab/diggings.html` + `tools/roomlab/digging-kit.js`.
Six rooms, each a **1:1 trace** of one of 0_mem0ry's own makeshift rooms.

| | Reference | Size | Objects | Pixels differing inside the outline |
| --- | --- | --- | --- | --- |
| **Mara's** | `makeshift-two-rooms.png` | 245 × 181 | 36 | **56 of 35 696 — 0.16 %** |
| **Quim's**, **Pilar's** | `makeshift-two-rooms-b.jpg` | 181 × 187 | 23 | **2 of 28 908 — 0.007 %** |
| **Xan's**, **Ulla's**, **Yara's** | `makeshift-bedsit.jpg` | 179 × 217 | 18 | 580 of 23 920 — 2.4 % |

Those numbers are measured off the **browser's** canvas, not off a Python mirror
of it, so they are the numbers the page actually draws. The two-room pair is a
trace in the literal sense: two pixels in Quim's, and in Mara's fifty-six, which
are twelve inside a wardrobe's printed label, four in the middle of a bed, and
forty single speckles of floor grit. Nothing in either is a wrong sprite, a wrong
place or a wrong depth.

The bedsit is the one still worth work. It was never asked for — it was traced
alongside the two the owner sent — and at 580 px it is an order of magnitude
behind them.

The sizes are the canon ones and they are already each reference's own native
size, so a trace drops in without moving anything.

---

## How the trace was made, because the obvious way does not work

A plain best-NCC search over the sheet's components finds the small props and
misses almost every large one. The reason is occlusion: a sofa half hidden
behind a table scores badly over the whole sprite even when the visible half is
exact, so the true placement never wins. Nineteen objects out of forty, and none
of the furniture.

Three changes fixed it, and they are the transferable part:

1. **Score on the part you can still see.** Each candidate is scored by the
   *trimmed* mean colour error over its own opaque pixels — the best 55 % of
   them. A sprite half covered still matches perfectly on its visible half.
2. **Search the residual, not the picture.** Each pass works on what the
   reference has and the canvas does not, so the search shrinks as the room
   fills and never re-finds what is already drawn.
3. **Keep a placement only if the picture gets closer.** The top candidates by
   score are each composited on a copy and measured; the one that removes the
   most differing pixels wins, and if none removes at least forty, the pass
   stops. **A score can be fooled. The difference cannot.** Without this the
   solver cheerfully added a rug at 23.7 error that made the room worse.

A final pass force-places the large flat pieces — rugs, mattresses, wardrobes —
which are too low-contrast for the residual search to rank highly on its own.
That found the blue rug in all three rooms, worth 866, 955 and 187 pixels.

That got the rooms to 7.8 % / 5.5 % / 8.9 %, and the owner's answer was that the
interior walls were not right and some objects were off. **Both halves of that
were the same fault**, and closing it is what took the pair to 56 and 2 pixels.

### The wall was missing, so furniture was drawing it

The shell knew how to draw a band round the outline and nothing else. Both
two-room references have a wall *inside* the outline — a partition hanging off
the north wall in `-two-rooms-b`, the block under the notch in `-two-rooms` — and
because the shell never drew them, the residual solver did what it is built to
do and covered those pixels with the best-scoring sprites it could find. Hence
cardboard boxes and a sofa in a corridor. Draw the walls first and the same
solver puts the furniture where the artist put it.

Measure them the way the Well's stall posts were measured — count ink columns and
rows inside the outline, do not eyeball them:

```
-two-rooms-b   x=71 and x=76 are ink for y 9…105        the partition
-two-rooms     x=74 and x=137 are ink for y 9…105/110   the notch block
```

### The other three degrees of freedom

Once the walls were right, four more passes were needed, and they matter more
than finding another sprite:

| Pass | What it decides | What it was worth |
| --- | --- | --- |
| **reorder** | the index in the draw order | the cardboard box that four passes had failed to place scores 5.7 and makes the room **worse** by 331 px painted last, and better by 356 painted first |
| **prune** | whether the object should be there at all | eleven of forty-seven dropped, and the diff *fell* — the greedy pass commits on the evidence it has at the time |
| **nudge** | ±1 px | the rug was one row high; 125 px |
| **fine** | small sprites, error ≤ 26, gain ≥ 10 | the third jar on the shelf, the cans, the red crate |

Run them as a loop — place, reorder, prune, nudge — until it stops moving. The
loop is what closed the last two orders of magnitude, not more searching.

## The shell

Solved by brute force over every opaque tile and every phase, scored on the
lowest 55 % of per-pixel errors so the furniture could not drag the fit:

| Part | What it is |
| --- | --- |
| band | 1 px ink, 4 px of `#c0b8b2`, 1 px ink — the sheet's own cross-section |
| wall | `makeshift_roomtiles` column 4, rows 7–8: one 32 × 64 block of white brick whose bottom four rows are the skirting. Block top y 10, 10 and 29; x phase 10, 10 and 25. |
| floor | the same sheet's column 5, rows 7–8, grey concrete |
| shape | a rectangle **minus rectangular cuts**, so the two-room flat keeps the notch in its top wall (x 80–131, y 4–35) and the corner missing from its bottom right (x 144–239, y 144–175). Drawn as one even-odd path filled at four insets, which gives the ink/fill/ink cross-section for free. |
| stub | an interior wall: `#c0b8b2` where the wall stands in plan, then **one 64 px brick block hanging below it** as its south face, with ink down both sides and closing the bottom. The face's tile origin is y 42 in both rooms; its x phase is the room's own in `-two-rooms` and 19 in `-two-rooms-b`. Measured, not guessed: the notch block matches the sheet's wall tile at **error 0.0**. |
| door | one 32 px tile of band cut away at x 74–105, its inner ink line running on across the gap as a threshold **and a 1 px jamb inked down each side** — **the same tile in all three renders**, which is how we knew they are one template scene dressed three ways |

### The even-odd trap in `outline()`

`outline(r, k)` insets the rectangle by k and grows each cut by k. A cut that
opens onto an edge — the notch in `-two-rooms`, the missing bottom-right corner —
then sticks out past the inset rectangle, and out there it is crossed by **one**
subpath instead of two: odd, so even-odd calls it inside, so it gets painted.
The result is brick in the mouth of the notch and a strip of floor outside the
room. Every grown cut is now clamped back to the inset rectangle.

It cost 82 pixels in Mara's and it was invisible in the Python mirror of the
shell, which builds the same shape by eroding a mask. **Diff the browser's
canvas.** `tools/roomlab/` pages are the thing that ships.

## What varies between two diggings sharing a reference

The lamp, and nothing else. The map's art direction gives every private door its
own warm, so Quim's and Pilar's are the same room at different brightnesses, and
so are Xan's, Ulla's and Yara's. That is the deliberate consequence of tracing
to the letter: three references, six rooms.

## What is left open

0. **The bedsit, at 580 px.** The owner sent five references and asked for the
   first two; this is the sixth room, traced unasked alongside them. The same
   loop that took the pair to 56 and 2 pixels has been run on it and it stops at
   580, which means something structural is still wrong with it — most likely the
   same thing that was wrong with the other two before the walls went in. Measure
   its ink before adding any more furniture.
1. **The drawing no longer derives from `rooms.ts`.** It used to, and that is
   what caught three homes nobody could enter. Now each room is an exact copy of
   a render, so the furniture in the picture and the `b`/`k`/`q` glyphs in the
   grid agree on size and shape but not on where anything stands — and the drawn
   doorway is one tile left of where the grid puts it, because the reference puts
   it there and the grid column is pinned by the Row. Reconciling them belongs
   with the corridor phase.
2. **Two rooms the owner showed do not fit any digging.**
   `library/rooms/Xmas_2.jpg` **traces** — 23 objects at ncc ≥ 0.90, and it is
   the densest domestic room in the archive — but it is 207 × 213 and no digging
   is that size. `library/rooms/Post Apoc Shelter - Asset Pack_4.jpg` is the
   Hold's reference and **still does not trace**, even against the shadow
   variants and the 16 × 16 cut that came with the full pack: its footlocker is
   85 px wide where the sheet's is 48, which is not an integer ratio.

## The history, kept because it is the lesson

These six were drawn twice before. First in a substituted rock material, on a
finding that was correct — the makeshift references matched nothing above 0.766
and their wall band `#c0b8b2` existed in no sheet we owned, while `trace.py`
reported their band pieces at 1.000 anyway, because NCC is mean-removed and
contrast-normalised and scores *shape*, not art. Then, when the owner supplied
the pack that finding had named, as compositions in the makeshift style with a
sleeping place per resident. Now, as traces.

**Naming the missing pack precisely is what got it.** The Hold, the Infirmary
and the Well are still waiting on theirs; name them the same way.
