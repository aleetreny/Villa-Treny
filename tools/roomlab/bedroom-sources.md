# Four bedroom source manifest

Every visible pixel in the four replacement bedroom canvases is copied from a
file contained in `Archive_referencias_por_libreria.zip`. Source rectangles are
`x, y, width, height`; destination rectangles use the same order.

## Pilar — exact shelter room

| Visible layer | ZIP-backed source | Source | Destination |
|---|---|---:|---:|
| Complete composition | `reference/shelter-bunk-and-stores.jpg` | `30,27,274,444` | `0,0,137,222` |

The repository reference is byte-identical to `Ejemplos de sala/Post Apoc
Shelter - Asset Pack_4.jpg` in the supplied ZIP.

## Xan — exact Christmas room

| Visible layer | ZIP-backed source | Source | Destination |
|---|---|---:|---:|
| Complete composition | `reference/xmas-container-room.jpg` | `38,34,752,752` | `0,0,188,188` |

The repository reference is byte-identical to `Ejemplos de sala/Xmas_2.jpg` in
the supplied ZIP.

## Ulla — olive reference layout

| Visible layer | ZIP-backed source | Source | Destination |
|---|---|---:|---:|
| Outer ground repeat | `Shelter_Terrain_Tiles_32x32.png` | `320,320,32,32` / `320,352,32,32` | complete canvas |
| Rough olive room edge | `Shelter_Terrain_Tiles_32x32.png` | `16,272,64,64` | `15,19,196,234` |
| Olive floor repeat | `Shelter_Terrain_Tiles_32x32.png` | `96,320,32,32` / `96,352,32,32` | clipped room floor |
| Two rust wall panels | `Shelter_Walls_32x32.png` | `192,320,32,64` | `58,19,32,64` / `132,19,32,64` |
| Large mattress | `Shelter_Furniture_32x32.png` | `420,50,24,43` | `19,31,29,51` |
| Small bedroll | `Shelter_Furniture_32x32.png` | `361,359,14,24` | `66,65,14,24` |
| Mustard locker | `Shelter_Furniture_32x32.png` | `295,384,18,31` | `23,98,18,31` |
| Mustard open bin | `Shelter_Furniture_32x32.png` | `356,387,26,28` | `174,63,26,28` |
| Green-front open bin | `Shelter_Furniture_32x32.png` | `387,387,26,28` | `174,100,26,28` |
| Two cups | `Shelter_Furniture_32x32.png` | `6,129,8,8` / `19,131,9,10` | `29,190,8,8` / `39,194,9,10` |
| Orange cylinder | `Shelter_Furniture_32x32.png` | `72,192,16,32` | `184,219,16,32` |

## Yara — olive variation

Yara uses the same terrain repeats and rough olive edge sprite as Ulla; its
rough edge is placed at `16,19,195,234`.

| Visible layer | ZIP-backed source | Source | Destination |
|---|---|---:|---:|
| Damaged rust wall panel | `Shelter_Walls_32x32.png` | `128,320,32,64` | `34,20,32,64` |
| Rust wall panel | `Shelter_Walls_32x32.png` | `192,320,32,64` | `153,20,32,64` |
| Wide mattress | `Shelter_Furniture_32x32.png` | `456,4,48,25` | `153,136,48,25` |
| Upright worn mattress | `Shelter_Furniture_32x32.png` | `420,146,24,43` | `24,86,29,51` |
| Green-front open bin | `Shelter_Furniture_32x32.png` | `387,387,26,28` | `174,86,26,28` |
| Mustard locker | `Shelter_Furniture_32x32.png` | `327,391,18,24` | `29,157,18,24` |
| Mustard open bin | `Shelter_Furniture_32x32.png` | `356,387,26,28` | `166,184,26,28` |
| Two cups | `Shelter_Furniture_32x32.png` | `6,129,8,8` / `19,131,9,10` | `109,213,8,8` / `120,208,9,10` |
| Orange cylinder | `Shelter_Furniture_32x32.png` | `40,195,16,26` | `72,220,16,26` |

The executable version of this manifest is exported as `BEDROOM_MANIFEST` from
`bedroom-kit.js`. The renderer contains no `fillRect`, `strokeRect`, text,
gradients or custom furniture-drawing functions.
