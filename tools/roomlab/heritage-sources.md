# Mansion, diner and graveyard source proof

Every visible room pixel comes from the finished compositions in
`Archive_referencias_por_libreria.zip`. The files under `library/rooms/` are
byte-identical runtime copies of the eight files supplied by the owner.

| Habitat place | ZIP file | Exact source rectangle | Native output |
| --- | --- | --- | --- |
| Old Library | `FancyMansion_Furniture_1.png` | `79,82,560,688` | `140x172` |
| Grand Bedroom | `FancyMansion_Furniture_2.png` | `79,82,560,688` | `140x172` |
| Formal Salon | `FancyMansion_Furniture_3.png` | `13,15,708,612` | `236x204` |
| Hearth Room | `FancyMansion_Furniture_4.png` | `112,13,516,612` | `172x204` |
| Main Diner | `50s_Diner_1.png` | `29,28,944,816` | `236x204` |
| Soda Bar | `50s_Diner_3.png` | `13,15,688,816` | `172x204` |
| Service Counter | `50s_Diner_4.png` | `78,83,560,688` | `140x172` |
| Graveyard | `Graveyard_2.png` | `0,0,591,720` | `197x240` |

The seven bordered interiors are reduced only by their integer export scale.
For the Graveyard, the complete 3x composition is reduced to native size and a
flood fill makes only page-white connected to the outer edge transparent. No
grave, fence, tree, soil, grass or internal pale detail is replaced or redrawn.
