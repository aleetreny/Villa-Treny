# The library

Every 0_mem0ry asset pack the habitat draws from, plus the artist's own example
room renders, kept whole so that the next person does not have to go and find
them again. This is the archive the owner supplied; nothing here is generated.

```
sheets/   the packs, as downloaded — each with the artist's own Info.txt
rooms/    the example room renders that come with them
```

**This directory is not copied into `dist/`.** Nothing in it is served by the
site. The standalone observer uses the finished room PNGs in `public/habitat/rooms/`,
not the source sheets. `public/assets/props/` also contains complete source sheets
needed by local RoomLab and must be excluded from production output.

## What is in here that is not in `public/assets/props/`

The vendored sheets are one variant of each pack. The library also holds:

- **the 16 × 16 aligned versions** of every pack — the same art, cut on a
  different grid;
- **the `_Shadow` variants** — the same sprites with a drop shadow. Worth
  remembering: a render that will not match the plain sheet may be built from
  the shadowed one;
- **additional packs used by the finished rooms** — 50s Diner, Fancy Mansion,
  Graveyard, midcentury modern, professional kitchen, Xmas and canned food.

`Xmas/Xmas_Decorations.png` is worth knowing about: `rooms/Xmas_2.jpg` is a
container room that **traces** — 23 objects at ncc ≥ 0.90 across the xmas,
workshop, kitchen, bathroom, makeshift and shelter sheets — and it is the
densest domestic room in the whole archive. It is ×4, native 207 × 213, and
nothing in the habitat is that size yet.

`rooms/Post Apoc Shelter - Asset Pack_4.jpg` is the Dig3 reference and still
**does not trace**, even against the shadow variants and the 16 × 16 cut. Its
green footlocker's colour is in `Shelter_Furniture`, so the pack is right and
the render is not at any integer scale of it: the trunk is ~85 px wide where the
sheet's is 48. Do not spend another pass on it without a new idea.

## Licence

0_mem0ry's packs, and the artist's terms travel with them — see the `Info.txt`
inside each pack folder and `../../../public/assets/props/LICENSE-0_mem0ry.txt`.
They permit commercial and non-commercial use and modification. **They do not
permit resale or redistribution**. Villa-Treny is private; keep the original
archive and the local source sheets private. Production output must contain only
the application resources, finished room images and licensed interface fonts.
