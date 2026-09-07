# The Well — traced

**Status:** drawn, `tools/roomlab/well.html`. 15.8 % of the pixels inside the
outline differ from the reference, and most of what is left is JPEG.

**Reference:** `tools/roomlab/reference/bathroom-wet-and-filthy.jpg`, exported at
**×4**. `native.py` calls it ×2 — it under-reads heavily recompressed JPEGs, and
the tell is that `provenance.py` then finds its matches at `x2.0` instead of
`x1.0`. Reduce it by hand with NEAREST; BOX averages the JPEG's ringing into the
pixels and halves the hit count. Native is **184 × 170**, kept at
`tools/roomlab/measure/native/bathroom-wet-and-filthy.png`.

## What the room is

Water reclamation and air scrubbing. The reference is a filthy public bathroom
with a stall partitioned off the top left, two urinals, a sink, two bins, a wet
floor sign, puddles and a wall covered in tags. Every one of those reads as
habitat plumbing without changing a pixel, which is why this reference was worth
tracing before the ones that need reinterpretation.

## The shell, measured

Nothing here was judged by eye. Each line is a number taken off the native
render and then found in a sheet.

| Part | What it is |
| --- | --- |
| outline | ink at x 20 and 160, y 22 and 146. The band between is **1 px ink, 4 px tan, 1 px ink** — the roomtiles band cross-section sampled off the sheet. The tan is `#786953`, not the `#766952` the first pass used. |
| door | the south band is cut from x 59 to x 90, but its inner ink line at y 141 runs straight across the gap. The doorway reads as a threshold, not a hole. |
| wall | `bathroom_roomtiles` column 5, rows 7–8 — **one 32 × 64 block** whose bottom five rows *are* the skirting. Block top y = 29, x phase 27. That puts the skirting's dark row on y 92, which is where the reference puts it, to the pixel. |
| floor | `bathroom_roomtiles` tile (6,8), phase (27,13). Median error 9 out of a possible 765. Its grout falls on x ≡ 6 and y ≡ 0 (mod 8), exactly as the reference's does. |
| stall | **not a wall.** It is 0_mem0ry's own stall-partition sprite from `bathroom.png`, used three ways. |

### How the wall and floor were solved

By brute force, not by eye: every fully opaque tile on the sheet × every phase,
scored on the **lowest 50 % of per-pixel errors** so that the props covering half
the wall could not drag the fit. The wall block's top came out at y = 29 with a
clear margin; the x phase came out 27 but only just — the wall's own tile grid
has a 4 px sub-period, so phases 3, 7, 11 … all score within noise of each other
and only the sparse grey squares separate them. Worth knowing before trusting a
wall phase again.

### The stall is a sprite, not a wall

The reference's partition changes width partway down, and the first pass read
that as a wall thickening. It is not. The artist changed sprite:

- **above the rail** — the 4 px light post, sheet `(14,128)`, x 57..60, y 27..67
- **the rail** — sheet `(20,150)`, 4 px tall: ink, light tan, dark tan, ink. Laid
  across y 67..70 from the west band to the post.
- **below the rail** — the 6 px dark post, sheet `(14,160)`, x 55..60, y 70..124,
  standing on the floor with its own ink foot.

There is a **second post**, at x 26..29, hard against the west band. I missed it
completely until the masked diff lit up a stripe the full height of the room. It
is what makes the toilet a stall rather than a corner.

That west post reads **4 px wide** — ink 26, tan 27–28, ink 29 — and no sheet
holds a 4 px dark post. It is the 6 px one clipped: its left three columns, then
its own right-hand ink column butted against them. Every pixel is still the
sprite's; only the width is the artist's edit. It also throws a 1 px shadow east,
at 50 %, which the east post does not. That asymmetry is in the reference, so it
is traced, not invented — the Cabin 5 rule is *no shadows I made up*, not *no
shadows*.

## Placing the props

Three methods, in descending order of trust, and each prop's comment in the file
says which one placed it:

1. **Masked mean-removed NCC** (`measure/trace.py`, `measure/find_at.py`). Twelve
   props placed this way, seven of them over 0.96 and one at 1.000.
2. **Lowest mean colour error** over the sprite's own alpha, searched in a box.
   `ncc_map` refuses any template whose mask is under 30 px, which rules out most
   of the graffiti and all of the puddles — the puddles are drawn at half alpha.
3. **Colour-blob correspondence** — the tag's bounding box in the sheet against
   the same-coloured blob in the render. Used for the four graffiti tags NCC
   would not touch.

The single most useful check was running every placed prop back through a ±5 px
local search afterwards. It moved five props, two of them badly wrong (the blue
tag was at MAE 133 and dropped to 58; the blue puddle went 27 → 9), and it
**confirmed the toilet**, which my eye had insisted was 18 px too high and which
was in fact exact. Trust the measure, not the eye — but only after checking that
the measure was allowed to look everywhere.

### Splitting the urinals

`objects.py` returns the sheet's urinal row as one 78 × 51 blob: they touch, so
there is no transparent gutter to cut on. The alpha column profile has a clean
period of **16**, so the row is four 16 px urinals at x 48, 64, 80, 96. Cut that
way they land at 0.966 and 0.969. Cut any other way they top out at 0.6. Same
lesson as the Workshops: address the sheet by what is actually there, not by the
tile grid.

## The one substitution

The reference's top-left cell has a **paper-towel dispenser**: a grey body with a
recessed slot and a white towel hanging out of it, about 21 × 17. It is not in
`public/assets/props/`. Searched every sheet, every component of the right size,
scored by mean colour error at the measured spot — the best fit anywhere is 54,
which is not a match, it is the nearest grey rectangle. The bathroom pack's own
dispenser `(224,66,16,19)` is the same object at different proportions, so that
is what stands there, marked `SUBSTITUTE` in the file.

This is the third room to hit the same wall (the Hold, the Infirmary's four
missing objects, now this). The pattern is worth naming: **the promo renders were
made with more sheets than the packs ship.**

## What is still missing

- The dark object on the floor at x 36..46, y 110..120. Nothing in either sheet
  fits it under MAE 33, and the one thing that scored 11 turned out to be a piece
  of the partition rail matching tan on tan. Left out rather than faked.
- The wall's 32 px x phase is 27 by a margin inside the noise. If a later pass
  finds a grey square out of place, that is the number to move.

## The number

15.8 % of pixels inside the outline differ by more than 30 per channel. The
worst columns are 20, 21, 25, 26, 155, 156 and 160 — every one of them an ink
line that the JPEG softened to grey. The reference's own outline is not black;
ours is. That difference cannot be closed and should not be.
