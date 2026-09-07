# Habitat room names and canonical occupancy

The observer uses the names in `src/lib/habitat/rooms.ts`. Room IDs are unchanged. These labels describe the existing place or its shared purpose; a room is not owned by the single person who first dug it.

Canonical homes come from `SLEEPS`; regular work postings come from `POSTED`, both in `src/lib/habitat/engine/state.ts`. Full names and duties come from `src/lib/habitat/residents.ts`. These are the authored arrangements, not a live attendance list: any resident can visit another room, and visual wandering does not reassign their home or duty.

## Naming decisions

| Room ID | Former observer label | Current name | Existing evidence |
| --- | --- | --- | --- |
| `dig1` | Mara’s | The Joined Rooms | Two chambers joined by an open gap; Mara Osei, Tomás Iriarte and Vero Castel share the home. |
| `dig2` | Quim’s | The Unfinished Rooms | The established unfinished dwelling shared by Quim Bassols, Wen Jiaming and Lior Ben-Ari. |
| `dig3` | Pilar’s | The Near Rooms | The rooms nearest the Common, shared by Pilar Ocaña, Kes Amankwah and Juno Petrakis. |
| `dig4` | Xan’s | The Square Room | Name retained from the earlier authored description; shared by Xan Moreira and Sten Malm. The current visible description does not claim a square perimeter. |
| `dig5` | Ulla’s | The Far Room | The room cut as far from the ship as the rock allowed, shared by Ulla Nyholm and Ama Oyelaran. |
| `dig6` | Yara’s | The Small Room | Name retained from the earlier authored description; shared by Yara Haddad and Noor Rahimi. The current image does not establish a two-person capacity. |
| `dispatch` | Duty Office | Communications | Kes Amankwah is posted here, with Communications as his authored duty. The handset and watch handover remain part of the room. |

Cabin One through Cabin Five already name shared quarters without attributing them to one housemate. Their names are retained. The remaining names were checked against their existing descriptions, resident duties and room connections; descriptive names such as The Common, The Hold, The Well, Hydroponics Yard and The Face are retained.

Proper names retain their authored spelling, including Ferran Solé, Pilar Ocaña and Tomás Iriarte. References to a “mansion wing” in observer copy are now descriptions of the wood-lined rooms; the habitat does not acquire a new mansion or new history. Existing journals and persisted event text are historical records and are not rewritten when a room label changes.

## All 48 places

| Room ID | Observer name | Setting | Canonical home for | Regular work posting |
| --- | --- | --- | --- | --- |
| `bridge` | The Bridge | hull | None assigned | None assigned |
| `dock` | The Dock | hull | None assigned | Dima Vashenko |
| `longwalk` | The Long Walk | hull | None assigned | Gita Raman |
| `cabin1` | Cabin One | hull | Dima Vashenko, Edda Halvorsen | None assigned |
| `cabin2` | Cabin Two | hull | Ferran Solé, Halim Zoubir | None assigned |
| `cabin3` | Cabin Three | hull | Cato Lindqvist, Gita Raman | None assigned |
| `cabin4` | Cabin Four | hull | Bex Ferreira, Reva Sandoval | None assigned |
| `cabin5` | Cabin Five | hull | Iris Calloway, Osvald Berg | None assigned |
| `breach` | The Breach | hull | None assigned | None assigned |
| `hold` | The Hold | hull | None assigned | Bex Ferreira, Lior Ben-Ari, Reva Sandoval |
| `infirmary` | The Infirmary | hull | None assigned | Cato Lindqvist, Noor Rahimi, Ulla Nyholm |
| `camp` | Surface Camp | surface | None assigned | None assigned |
| `garden` | Hydroponics Yard | surface | None assigned | Vero Castel |
| `sheltergate` | Shelter Entrance | surface | None assigned | None assigned |
| `graveyard` | Graveyard | surface | None assigned | None assigned |
| `yard` | Inner Yard | surface | None assigned | None assigned |
| `common` | The Common | rock | None assigned | Edda Halvorsen, Halim Zoubir, Mara Osei, Pilar Ocaña, Sten Malm, Tomás Iriarte |
| `administration` | Administration | rock | None assigned | Iris Calloway |
| `dispatch` | Communications | rock | None assigned | Kes Amankwah |
| `archive` | The Archive | rock | None assigned | None assigned |
| `records` | Records | rock | None assigned | Ama Oyelaran |
| `study` | The Study | rock | None assigned | None assigned |
| `sparebedroom` | Spare Bedroom | rock | None assigned | None assigned |
| `parlour` | The Parlour | rock | None assigned | None assigned |
| `projection` | Projection Room | rock | None assigned | None assigned |
| `winter` | Winter Parlour | rock | None assigned | None assigned |
| `library` | Old Library | rock | None assigned | None assigned |
| `grandbedroom` | Grand Bedroom | rock | None assigned | None assigned |
| `salon` | Formal Salon | rock | None assigned | None assigned |
| `hearth` | Hearth Room | rock | None assigned | None assigned |
| `maintenance` | Maintenance | rock | None assigned | None assigned |
| `kitchen` | The Kitchen | rock | None assigned | None assigned |
| `servicecounter` | Service Counter | rock | None assigned | None assigned |
| `maindiner` | Main Diner | rock | None assigned | None assigned |
| `sodabar` | Soda Bar | rock | None assigned | None assigned |
| `stalls` | The Stalls | rock | None assigned | None assigned |
| `washroom` | The Washroom | rock | None assigned | None assigned |
| `row` | The Row | rock | None assigned | None assigned |
| `games` | The Games Room | rock | None assigned | None assigned |
| `dig1` | The Joined Rooms | rock | Mara Osei, Tomás Iriarte, Vero Castel | None assigned |
| `dig2` | The Unfinished Rooms | rock | Lior Ben-Ari, Quim Bassols, Wen Jiaming | None assigned |
| `dig3` | The Near Rooms | rock | Juno Petrakis, Kes Amankwah, Pilar Ocaña | None assigned |
| `dig4` | The Square Room | rock | Sten Malm, Xan Moreira | None assigned |
| `dig5` | The Far Room | rock | Ama Oyelaran, Ulla Nyholm | None assigned |
| `dig6` | The Small Room | rock | Noor Rahimi, Yara Haddad | None assigned |
| `workshops` | The Workshops | rock | None assigned | Juno Petrakis, Quim Bassols, Wen Jiaming |
| `well` | The Well | rock | None assigned | Osvald Berg |
| `face` | The Face | rock | None assigned | Ferran Solé, Xan Moreira, Yara Haddad |

## Reading the occupancy table

- The eleven permanent homes house all 25 residents: ten in the five hull cabins and fifteen in the six rock dwellings.
- Spare Bedroom and Grand Bedroom have no permanent assignment. Their existing descriptions identify temporary or private use.
- The Long Walk and The Row remain canonical routes and archived RoomLab scenes. They are omitted from the room-only observer selector; their names and IDs remain valid for history and the engine.
- The Breach remains sealed in the observer. It has no resident or regular posting.
- Shared work rooms, kitchens, dining rooms, stores, study rooms and outdoor spaces remain available to visitors even when nobody has a regular posting there.
- The Common is the authored work posting for six residents, including Pilar; her duty remains cooking. The separate Kitchen expands the shared facilities without silently changing that posting.

## Regression checks

`src/lib/habitat/room-names.test.ts` checks distinct labels, shared-home names, all 25 housemates named in their home descriptions, physical evidence behind the six digging names, unassigned spare bedrooms and the Communications duty. The existing room tests continue to cover all 48 IDs, connections and movement grids.

## Visible-art review — Villa-Treny, 7 September 2026

All 45 selectable PNGs were compared with the descriptions shown in the room footer using the five complete contact sheets and the individual room view. The room IDs, names, housemates, duties, relationship history, notes and persisted journal entries remain intact. Twenty descriptions now avoid claims that the approved picture contradicts:

| Room | Correction grounded in the approved picture |
|---|---|
| Bridge | Pipes and wall units replace claims of a visible cracked port, two consoles and pilot chair. The pilot’s taboo remains history. |
| Dock | Describes the open ground, drums and hatch; the three suits and Dima’s responsibility remain canon without claiming visible suit racks. |
| Hold | Names the fenced drum store; Reva’s nine catalogued crates remain historical work, not a count of visible crates. |
| Infirmary | Names bottles, cylinders, lockers, table and chair instead of two visible beds and a slab. The unknown cold sleeper and unaudited medicine remain. |
| Common | Describes the fireplace, armchair, low table, tree and lights. The hull-plate table is retained as the first table they built, not presented as the current central furnishing. |
| Administration | Removes the incorrect count of two desks. |
| Spare Bedroom | One chair and rug, plus quiet/privacy instead of promising a door at the open threshold. |
| Parlour | Removes the obsolete “second” dining-table ranking tied to the earlier Common drawing. |
| Old Library | A single visible bookcase instead of a pair. |
| Kitchen | Removes the dependency on the absent long table in Common. |
| Stalls | Three cubicles, without claiming all are enclosed. |
| Washroom | No longer claims the habitat’s only public mirror; describes the actual divided layout. |
| Games | A worn armchair replaces the claimed sofa in the visible description. Its earlier shared-room history remains in the note. |
| Joined Rooms | Keeps the connected spaces and three residents without claiming it is currently the largest rendered home. |
| Unfinished Rooms | No longer claims an entire chamber lacks floor; the approved image has floor throughout. |
| Near Rooms | No longer places two residents in an absent second chamber; the three housemates and relationship remain. |
| Square Room | Keeps the established name and eleven-week construction, without claiming the visibly irregular perimeter is a perfect square. |
| Small Room | Keeps the name, builder and both residents; removes an unsupported two-person capacity claim. |
| Well | Names visible basins, toilets and supplies while retaining water-work responsibilities and the air-scrubbing history. |
| Face | Describes the surface approach to the cut, without claiming the image shows the tunnel interior or that its position on this static observer map moves. |

The remaining 25 descriptions did not show a material contradiction requiring a change. These corrections do not invent new objects or explanations for how furniture arrived. They align present-tense visual descriptions with the approved compositions while keeping the recorded past.
