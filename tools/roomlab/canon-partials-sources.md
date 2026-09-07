# Remaining canon rooms — ZIP source proof

Every visible pixel in these six rooms comes from
`Archive_referencias_por_libreria.zip`. The five complete compositions retain
their full export resolution: they are cropped, but not reduced.

| Habitat room | ZIP source | Exact crop | Output |
| --- | --- | --- | --- |
| The Bridge | `Post Apoc Office - Asset Pack_1.png` | `21,27,672,898` | `672x898` |
| The Dock | `Post Apoc Shelter - Asset Pack_2.png` | `34,35,864,576` | `864x576` |
| The Breach | `Post Apoc Office - Asset Pack_6.png` | `18,18,672,768` | `672x768` |
| The Hold | `Post Apoc Shelter - Asset Pack_8.gif` | `48,48,576,768` | `576x768` |
| The Common | `Xmas_3.png` | `16,14,496,560` | `496x560` |

Hydroponics is the existing approved Planter Yard without any alternate visual:
the exact `87,71,520,636` crop of `Garden_Planters_1.png`, reduced by its clean
4× export factor to `130×159` native pixels. It is rendered by the same
`drawOutside(..., 'garden')` function used by `outside.html`, so the two cannot
drift apart.

The renderer contains no colour fills, paths, text, hand-drawn furniture or
generated pixel art. It clears canvases, makes only edge-connected page-white
transparent, and copies declared source rectangles with nearest-neighbour
`drawImage()` calls.
