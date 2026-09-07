# Five Mid-century/Xmas room source manifest

Every visible room pixel is copied from a complete composition included in
`Archive_referencias_por_libreria`. Coordinates are `x, y, width, height`.

| Habitat room | ZIP-backed source | Source crop | Native output |
|---|---|---:|---:|
| The Study | `midcentury_modern_furnitureset_1.png` | `79,82,560,688` | `140×172` |
| Spare Bedroom | `midcentury_modern_furnitureset_2.png` | `79,82,560,688` | `140×172` |
| The Parlour | `midcentury_modern_furnitureset_3.png` | `15,17,688,816` | `172×204` |
| Projection Room | `midcentury_modern_furnitureset_4.png` | `79,82,560,688` | `140×172` |
| Winter Parlour | `Xmas_1.png` | `17,20,560,688` | `140×172` |

All five runtime sources are byte-identical to the files supplied by the user.
The executable manifest is `MIDCENTURY_MANIFEST` in `midcentury-kit.js`. The
renderer contains no furniture, surface, wall or decoration drawing code.
