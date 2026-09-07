# Four Office room source manifest

Every visible room pixel is copied from a complete Post Apoc Office composition
included in `Archive_referencias_por_libreria`. Coordinates are `x, y, width,
height`.

| Habitat room | ZIP-backed source | Source crop | Native output |
|---|---|---:|---:|
| Administration | `Post Apoc Office - Asset Pack_2.png` | `39,35,516,708` | `172×236` |
| Duty Office base | `Post Apoc Office - Asset Pack_3.gif` | complete `609×516` frame | `203×172` |
| Duty Office closed door | `Office_Walls_32x32.png` | `0,320,64,64` | `70,4,64,64` |
| The Archive | `Post Apoc Office - Asset Pack_4.png` | `13,14,516,708` | `172×236` |
| Records | `Post Apoc Office - Asset Pack_5.jpg` | `54,48,688,688` | `172×172` |

The executable manifest is `OFFICE_MANIFEST` in `office-kit.js`. That renderer
contains no `fillRect`, `strokeRect`, text, gradients or custom object-drawing
functions. Three rooms are one exact crop of the artist's finished ZIP image;
Duty Office adds one complete closed double-door sprite from the same Office pack.
