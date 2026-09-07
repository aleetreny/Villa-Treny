# References

Room renders by 0_mem0ry — https://0-mem0ry.itch.io/ — kept here to be traced
from. They are the artist's own promo images for the packs in
`public/assets/props/`, and they are the reason a habitat room looks like a room
rather than like a shelf of props. **This directory is not copied into `dist/`,
so none of it is served by the site.**

Every scale below was measured, not estimated — see `../measure/README.md`.
**Drawn at** is the integer factor the render was exported at; divide by it to get
native pixels, which is the scale the sprites were drawn for and the scale a trace
works in.

| File | Drawn at | Native | Tiles of 32 | Traced for |
| --- | --- | --- | --- | --- |
| `two-berth-cabin.jpg` | 5.34× | ≈ 204 × 205 | 6.4 × 6.4 | **The Cabins.** Already traced, as `../berth.html`. |
| `shelter-bunker-room.png` | 3× | 154 × 218 | 4.8 × 6.8 | **The Infirmary.** A bed, stores racks, a first-aid box, and an alcove partitioned off the main room. |
| `shelter-bunk-and-stores.jpg` | **unknown — not integer** | 137 × 222 cropped | 4.3 × 6.9 | **Pilar's.** The rendered room is the exact finished ZIP composition cropped to its black room boundary and reduced to native size. This avoids redrawing its bunk, stores, trunks or cupboards when the promo itself has no single recoverable integer scale. |
| `workshop-two-bay.jpg` | 4× | 250 × 228 | 7.8 × 7.1 | **The Workshops.** Pegboard, dressed bench, tool chest, lockers, shutter, floor grate. |
| `workshop-plate-walls-on-dirt.png` | 4× | 179 × 212 | 5.6 × 6.6 | **The rock half of the map.** (It was the Diggings' material for one pass, before their own pack arrived.) A room walled in salvaged corrugated sheet standing on bare dirt. **Traces:** 22 objects at ncc ≥ 0.88, nine at 1.000, all from `workshop.png`; its dirt is `shelter_terrain` tile (1,9) at median error 0; its plate is `workshop.png` (194,273) at 0.919. |
| `workshop-three-rooms.jpg` | 2× | ≈ 600 × 430 | 18.7 × 13.4 | **How to compose.** Three rooms sharing walls in one frame. Cross-pack: it uses props that are in none of our sheets, so it is a composition reference, not a traceable one. |
| `xmas-container-room.jpg` | 4× | 188 × 188 cropped | 5.9 × 5.9 | **Xan's.** The rendered room is the exact finished ZIP composition cropped to its black room boundary and reduced from the clean 4× export. Bed, table, tins, toilet, tree and coloured lights remain literal source pixels. |
| `claude-olive-bedroom.png` | composition at 2× | 226 × 273 | 7.1 × 8.5 | **Ulla's.** The supplied sparse olive bedroom: rust-coloured wall panels, two pale sleeping forms, mustard lockers, two cups and one orange cylinder. Also the material reference for Yara's deliberately different variation. |
| `shelter-dorm.jpg` | unknown — not integer | — | — | Two made beds and chairs in a shelter. Same problem as `shelter-bunk-and-stores`: the pack is right and the scale is not. |
| `makeshift-two-rooms.png` | 3× | 245 × 181 | 7.7 × 5.7 | **The Diggings — traced 1:1 as Mara's**, 39 objects, 7.8 % differing. against `makeshift.png` + `makeshift_roomtiles.png` — nineteen objects, most at 1.000. It matched *nothing* until that pack arrived, and the band it reported at 1.000 the whole time was a different pack's band of the same shape: NCC scores shape, not colour. Two chambers sharing a partition with a gap in it, a notched outline, a doorway one 32 px tile wide. |
| `makeshift-two-rooms-b.jpg` | 4× | 181 × 187 | 5.7 × 5.8 | **The Diggings.** The shell was solved off this one: band `#c0b8b2`, wall block `makeshift_roomtiles` col 4 rows 7-8 at blockTop y 12, floor col 5 rows 7-8 at median error 6. Rectangle x 4..175, y 4..172, partition at x 71..76, doorway x 74..105. |
| `makeshift-bedsit.jpg` | 4× | 179 × 217 | 5.6 × 6.8 | **The Diggings**, the single-chamber three. Rectangle x 19..158, y 23..194, doorway x 74..105 — the same doorway, in the same place, in all three, which is how we knew they are one template scene dressed three ways. |
| `bathroom-wet-and-filthy.jpg` | 4× (native.py says ×2 — it under-reads this JPEG; reduce by hand with NEAREST) | 184 × 170 | 5.8 × 5.3 | **The Well.** The whole wet vocabulary: puddles, running stains, drains, grating, mop and bucket. |
| `kitchen-working.png` | 4× | 178 × 212 | 5.6 × 6.6 | **The Common**, Pilar's corner only. Griddle, hood, prep tables, under-shelves. |
| `office-ruin.png` | 3× | 236 × 269 | 7.4 × 8.4 | **The Breach.** Broken walls with exposed rebar, concrete rubble, a safe left standing. |
| `office-abandoned.jpg` | 4× | 199 × 199 | 6.2 × 6.2 | **The Bridge.** Desks that read as consoles, a chair, paper over the floor, a cracked window. |
| `office-rock-through-the-floor.png` | native promo art | 545 × 736 | — | **The Breach, the Landing.** Rock pushing up through a built floor. Redrawn promo art: its props do not match the shipped sheets at any integer scale, so trace the *idea*, not the pixels. |
| `shelter-dugout-mouth.png` | 3× | 310 × 215 | 9.7 × 6.7 | **The Dock, the Face.** A dugout entrance with a corrugated hood, spoil heaps, worn tracks. |
| `shelter-hillside-mouth.jpg` | 3× | 237 × 258 | 7.4 × 8.1 | **The Face.** A shelter mouth cut into rock. |
| `shelter-ground-hatch.jpg` | 8× | 89 × 109 | 2.8 × 3.4 | **The Dock.** A hatch flush in the ground. |
| `garden-planters.png` | 4× | 177 × 194 | 5.5 × 6.1 | **Hydroponics.** Improvised planters — drums, tyres, buckets, tins — with living plants in them. |

`fig-scale-audit.png` is not a reference. It is the evidence behind the size
decision in `docs/superpowers/specs/2026-09-02-habitat-references-and-scale.md`:
every canon grid at 32 px per tile, filled with copies of the traced cabin.
Regenerate it with `python3 ../measure/scale_audit.py <berth 1:1 render> fig-scale-audit.png`.

## Licence

0_mem0ry's packs permit commercial use and modification; resale and
redistribution are not permitted. See `../../../public/assets/props/LICENSE-0_mem0ry.txt`.
These are the artist's published promo images, kept out of the built site for
that reason. The wider question — that `public/assets/props/` *is* served to every
visitor and should be cut down to an atlas of only the tiles used — is still open.
