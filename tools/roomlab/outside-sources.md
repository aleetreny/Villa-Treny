# Exterior-zone source manifest

Every visible shape is copied from a finished composition included in
`Archive_referencias_por_libreria`. Coordinates are `x, y, width, height`.

| Habitat zone | ZIP-backed source | Source crop | Native output |
|---|---|---:|---:|
| Surface Camp | `Camping_Set_1.jpg` | `114,75,402,549` | `134×183` |
| Hydroponics Yard | `Garden_Planters_1.png` | `87,71,520,636` | `130×159` |
| Shelter Entrance | `Post Apoc Shelter - Asset Pack_1.jpg` | `44,75,621,612` | `207×204` |
| Inner Yard | `PostApoc_Workshop_1.png` | `92,72,532,700` | `133×175` |

The third and fourth crops keep their exact ZIP objects and structure. Only
their olive exterior-ground ramp is replaced, as requested, with these exact
colours sampled from `Garden_Planters_1.png`:

- main ground: `#a8834b`
- shadow: `#8c672f`
- deep shadow: `#78531b`

`clearOuterPage` removes only near-white page pixels connected to an output
edge. It cannot erase pale highlights enclosed inside an object. The executable
manifest is `OUTSIDE_MANIFEST` in `outside-kit.js`.
