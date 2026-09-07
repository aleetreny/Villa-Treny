# Four service-room source manifest

Every visible room pixel is copied from a complete composition included in
`Archive_referencias_por_libreria`. Coordinates are `x, y, width, height`.

| Habitat room | ZIP-backed source | Source crop | Native output |
|---|---|---:|---:|
| Maintenance | `PostApoc_Workshop_4.jpg` | `24,24,1152,784` | `288×196` |
| The Kitchen | `professional_kitchen_1.png` | `14,17,688,816` | `172×204` |
| The Stalls | `Public_Bathroom_3.png` | `91,34,432,560` | `108×140` |
| The Washroom | `Public_Bathroom_4.png` | `28,34,560,560` | `140×140` |

The executable manifest is `FACILITY_MANIFEST` in `facility-kit.js`. That
renderer contains no `fillRect`, `strokeRect`, text, gradients or custom
object-drawing functions. Each room is one exact crop of its ZIP image.
