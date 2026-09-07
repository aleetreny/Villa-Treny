# The Infirmary: a trace, and the first room the sheets cannot finish

Building, phase eight. Branch: `night-shift-habitat`.

`tools/roomlab/infirmary.html` — the old composed version of this room is gone;
this is a 1:1 trace of `reference/shelter-bunker-room.png` (×3 phase (1,2) →
**154 × 218** native). `pnpm check` green, the room reports **clean**, and
**8.0 % of its pixels differ from the render**, measured inside the outline.

**All of that 8 % is four objects that do not exist in any sheet we own.** The
structure, the deck, the alcove and every prop that does exist are in place.

---

## What was measured

| | |
| --- | --- |
| room | x 7..146, y 7..210 |
| bands | 6 px: 1 px ink, 4 px of `#666666`, 1 px ink |
| wall | `shelter_walls` row 10/11, one 32 px column at a time, at y 13; the plate meets the deck at **y 77** |
| panels | top `[2, 8, 8, 3]`, bottom `[8, 8, 8, 3]` — found by brute force, not by eye |
| deck | flat `#959595` with an `#8b8b8b` line every 8 px, x ≡ 0 and y ≡ 0. Drawn: no sheet carries this floor |
| alcove | partitioned off the bottom right — a 6 px band along y 104..109 from x 109, its own plate face from y 110, and its own deck from y 159 |
| door | the south wall is open from x 45 to x 108, with a 3 px threshold left in it |

**The wall columns were solved rather than chosen.** For each 32 px column of the
render's wall, every column of the sheet was scored against every source y, over
only the pixels the props do not cover. Panel two came back at **0.00 mean
error** and panel one's left edge at **0.00**. Panel one is the darker plate (c 2)
in its top half and the plain one (c 8) below, which is the darker corner you can
see behind the locker — and getting that wrong was the first version's one visible
artefact: c 2's lower half is *rusted*, and the rust showed as an orange bar in
the three-pixel gap between the locker and the bed.

## What was placed

Seventeen props, every one at its own normalised-cross-correlation position,
**thirteen of them at 1.000**. `measure/trace.py` finds them; a new
`every_position()` in the same file finds the ones the render **reuses** — the
same crate appears four times and the same flask four times, and a global argmax
only ever reports one of each.

## The four objects the sheets do not have, and what the owner decided

Every connected component of every one of the **nineteen** sheets in
`public/assets/props/` was correlated against this render. Nothing beat **0.72**
for any of these four:

| In the render | Best match anywhere |
| --- | --- |
| the brown examination chair in the middle, ~34 × 72 at (42,118) | 0.56 |
| the second, larger orange cylinder | 0.72 — we have the size below it |
| the alcove's upper white jug | 0.51 — same |
| the alcove's two large amber crates | 0.61 — same |

The first version of this page named them and left them out, which is the rule.
**The owner has since ruled on this room specifically:** fill them with the
nearest sprite the pack does have, and take the bed out. So, deliberately and
marked as such in the source:

- **The bed at (40,52) is gone.** It was an ncc 1.000 anchor. The top of the room
  is now the locker and the calendar on bare plate.
- **The examination chair is a table with a chair tucked under it** — the brown
  table at (42,128), and the render's own brown chair, which is an exact anchor at
  (48,158), pulled up to it. Which is what the owner asked for in words: *la mesa
  y la silla*.
- **The second cylinder is the same sprite as the first**, at (124,52), drawn
  **before** it so the front one's own outline cuts across it. Drawn the other way
  round, two identical bottles merge into one bottle with a bent neck — that was
  visible in the first attempt and is the only thing in this change that needed a
  second render.
- **The alcove's upper jug and its large crates** get more of the small ones.

Nothing in the render is unrepresented now. The three at 0.51–0.72 are marked as
the nearest sprite rather than as anchors, so the next person can tell the
difference.

> **The pixel-difference number no longer measures this room.** It is 14 % rather
> than 8 %, and that is the bed's absence plus three objects that are near rather
> than exact — it is a room composed off a reference now, not a trace of one. The
> other rooms are still measured that way.

## What this changes about the method

`every_position()` is the new tool and it matters for every room from here: these
references reuse a handful of small props many times over, and until now the
trace list only ever found the best instance of each. It is documented in
`measure/README.md` with the rest.

## Next

The Hold — `shelter-bunk-and-stores.jpg` ×2 → 166 × 250, the same sheet, and by
the look of the reference the same problem is unlikely there. Then the first
digging.

**The precedent this sets, for whoever builds those:** trace first and name what
is missing; if the owner then asks for the gaps filled, fill them with the pack's
own sprites, mark each one with its score so it is not mistaken for an anchor,
and say in the spec that the room is no longer measured by its difference from
the render.
