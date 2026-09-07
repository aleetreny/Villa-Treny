# Room art for the explorable habitat

The explorer adapts the 46 already-approved room interiors; Long Walk and Row retain their existing RoomIds and are rendered as navigable halls. There are no additional RoomIds. Only the active room's canvas is mounted. Source images may be cached, but complete room scenes are loaded on demand. An older page used to produce a room canvas is removed immediately after the copy.

## Contract and scale

`ROOM_ART` is the raster inventory. `roomNavigation(id)` synchronously returns a 4-native-pixel movement grid, explicit entry and exit coordinates, outward direction, full opening spans and every arrival cell. `loadExplorerRoom(id)` / `createRoomArt(scene)` adds the loaded canvas. All coordinates in `grid`, `spawn` and `exits` are grid cells; image crop coordinates below are pixels.

Nearest-neighbour sampling removes only the measured 2×/3×/4× enlargement in source exports. The explorer then displays an integer enlargement. The five original canon comparisons remain unchanged. The Bridge exploration scene uses its approved upper section, [181,27,384,288] in `library/rooms/Post Apoc Office - Asset Pack_1.png`, shown as 192×144 native pixels; the facade remains in the original comparison. This makes the selected section reachable without inventing stairs, teleporting through its building or creating a new room.

## Pixel provenance

No new painted object, wall, floor, gradient or decoration is introduced by this adapter. It uses existing kit renderers and `drawImage`. Edge-connected white from the export page is made transparent; white furniture is untouched. Small thresholds copy clear floor from the same approved room. These source and destination coordinates are recorded at runtime as `thresholdSources` and listed below.

Eleven older rooms predate the ZIP-only corridor rule: Workshops, Infirmary, Well, the five Cabins, Diggings One and Two and Games. Their existing renderers contain hand-painted shell or light pixels. The source renderers remain unchanged and are not retroactively described as wholly ZIP-derived. The adapter adds no new primitive drawing to those renderers. For the three Makeshift traces, only light spilling outside the exact source silhouette is omitted from the copy, as documented below.

### Exact silhouette copies for the three Makeshift traces

`diggings.html` renders `REF.twoRooms`, `REF.twoRoomsB` and `REF.bedsit` from `digging-kit.js`. Its existing `lamp()` applies its illumination and tint across the whole canvas after drawing the room, so previously transparent margins and notches acquire a visible rectangular veil. This is not floor, wall or an object. The other eight legacy renderers do not have this problem: cabin lamps already clip to the room; Workshops, Infirmary and Well have no full-canvas light overlay.

The explorer now imports the original `REF` geometry. `legacyOutlineCopies()` converts the inclusive outer rectangle and its inclusive rectangular cuts into disjoint image-copy windows. `legacyCanvas()` copies those windows directly from the source page, using `drawImage` and nearest-neighbour reduction. It does not paint a mask, change a colour, infer boundaries from colour, or use the movement grid to clip the art. Each retained source pixel is copied exactly once. Walls, props, interior light and the original page are preserved.

All rectangles below are `[x,y,width,height]` in native pixels; the page displays these same canvases at exactly 2×, so each source-copy coordinate is multiplied by two before reducing it back to native size.

| Room | Source geometry | Exact native copy windows |
| --- | --- | --- |
| The Joined Rooms (`dig1`) | `REF.twoRooms`: outer `[4,4]`–`[239,175]`; cuts `[80,4]`–`[131,35]` and `[144,144]`–`[239,175]`, all inclusive | `[4,4,76,32]`, `[132,4,108,32]`, `[4,36,236,108]`, `[4,144,140,32]` |
| The Unfinished Rooms (`dig2`) | `REF.twoRoomsB`: outer `[4,4]`–`[175,172]`, inclusive; no cuts | `[4,4,172,169]` |
| The Games Room (`games`) | `REF.bedsit`: outer `[19,23]`–`[158,194]`, inclusive; no cuts | `[19,23,140,172]` |

The existing threshold floor copies still run afterwards. Their intentional extensions beyond the old outer rectangle are retained: 96 opaque native pixels at Digging Two's entrance and 32 at Games. These are copied floor, not light spill. Before this correction the unwanted exterior veil covered 8,489 pixels in Digging One, 4,683 in Digging Two and 14,731 in Games. All five cabin silhouettes had zero visible exterior pixels; the other three rooms had only their existing opaque wall/threshold geometry, which is unchanged.

An exhaustive check of all 117,035 native coordinates verifies the 89,004 retained pixels against the source geometry: every inside pixel has exactly one copy window, and every outside pixel has none. Source-page files and the eight unaffected legacy adapters are untouched.

After Chromium re-exported the 46 production images, all eleven legacy PNGs were compared pixel by pixel with their preceding exports. Digging One changed exactly 8,489 exterior pixels to transparent, Digging Two 4,683 and Games 14,731. Every retained wall, object, interior and threshold pixel has identical RGBA values. The other eight legacy PNGs have no changed pixel. The three new PNGs were also inspected visually. The comparison script and its JSON result are `/tmp/habitat-legacy-before-clip/verify.py` and `/tmp/habitat-legacy-before-clip/verified.json`.

The Hold's front fence gate is opened at native [85,160,22,59], using floor [99,117,8,8] from the same approved Hold image. Exact original ZIP source: `library/rooms/Post Apoc Shelter - Asset Pack_8.gif` [345,399,24,24], reduced to 8×8 and repeated. The crate, barrels and all other fence panels are preserved. This connects the interior cache to the exterior approach.

## Reused compositions and existing source manifests

| Family | Original render / exact source manifest | Rooms |
| --- | --- | --- |
| Canon | [canon-partials-kit.js](canon-partials-kit.js), [canon-partials-sources.md](canon-partials-sources.md) | Bridge, Dock, Breach, Hold, Common |
| Office | [office-kit.js](office-kit.js), [office-sources.md](office-sources.md) | Administration, Dispatch, Archive, Records |
| Exterior | [outside-kit.js](outside-kit.js), [outside-sources.md](outside-sources.md) | Camp, Garden, Shelter Entrance, Inner Yard |
| Bedrooms | [bedroom-kit.js](bedroom-kit.js), [bedroom-sources.md](bedroom-sources.md) | Diggings Three–Six |
| Mid-century | [midcentury-kit.js](midcentury-kit.js), [midcentury-sources.md](midcentury-sources.md) | Study, Spare Bedroom, Parlour, Projection, Winter |
| Heritage | [heritage-kit.js](heritage-kit.js), [heritage-sources.md](heritage-sources.md) | Library, Grand Bedroom, Salon, Hearth, Main Diner, Soda Bar, Service Counter, Graveyard |
| Facilities | [facility-kit.js](facility-kit.js), [facility-sources.md](facility-sources.md) | Maintenance, Kitchen, Stalls, Washroom |
| Face | [face-kit.js](face-kit.js), [face-sources.md](face-sources.md) | Face |
| Preserved traces | [workshops.html](workshops.html), [infirmary.html](infirmary.html), [well.html](well.html), [cabins.html](cabins.html), [diggings.html](diggings.html) | Eleven older scenes; original sprite coordinates remain in these files |

## Additional threshold copies

Rectangles are [x,y,width,height] in the approved native room canvas, before the threshold change. They identify the exact pixels copied, with their ZIP composition or original renderer named in the table above. Source rectangles are chosen wholly on the authored empty floor. No furniture is moved to make an entrance. Native opening widths follow the artist's existing gaps: 16–64 pixels; cabin ladder wells preserve their full 32-pixel span.

| Room | Floor source in native canvas | Threshold destination |
| --- | --- | --- |
| bridge | [40,56,8,8] | [36,64,16,8] |
| dock | [96,128,8,8] | [95,136,16,8] |
| breach | [76,172,8,8] | [73,180,16,8] |
| hold | [84,176,8,8] | [81,184,16,8] |
| common | [56,124,8,8] | [38,132,48,8] |
| administration | [72,220,8,8] | [70,228,16,8] |
| dispatch | [96,156,8,8] | [94,164,16,8] |
| archive | [64,220,8,8] | [38,228,64,8] |
| records | [80,156,8,8] | [70,164,32,8] |
| camp | [60,164,8,8] | [56,172,16,8] |
| garden | [36,140,8,8] | [34,148,16,8] |
| sheltergate | [128,184,8,8] | [124,192,16,8] |
| yard | [64,156,8,8] | [60,164,16,8] |
| study | [64,156,8,8] | [54,164,32,8] |
| sparebedroom | [64,156,8,8] | [54,164,32,8] |
| parlour | [80,188,8,8] | [70,196,32,8] |
| projection | [64,156,8,8] | [54,164,32,8] |
| winter | [64,156,8,8] | [62,164,16,8] |
| library | [64,156,8,8] | [54,164,32,8] |
| grandbedroom | [64,156,8,8] | [54,164,32,8] |
| salon | [160,188,8,8] | [150,196,32,8] |
| hearth | [80,188,8,8] | [70,196,32,8] |
| maindiner | [136,188,8,8] | [132,196,16,8] |
| sodabar | [112,188,8,8] | [102,196,32,8] |
| servicecounter | [40,156,8,8] | [36,164,16,8] |
| graveyard | [92,220,8,8] | [88,228,16,8] |
| maintenance | [184,180,8,8] | [174,188,32,8] |
| kitchen | [128,188,8,8] | [124,196,16,8] |
| stalls | [48,124,8,8] | [38,132,32,8] |
| washroom | [44,124,8,8] | [34,132,32,8] |
| washroom | [84,124,8,8] | [74,132,32,8] |
| face | [124,128,8,8] | [120,136,16,8] |
| dig3 | [64,204,8,8] | [48,212,44,8] |
| dig4 | [100,172,8,8] | [98,180,16,8] |
| dig5 | [108,232,8,8] | [104,240,16,8] |
| dig6 | [108,232,8,8] | [105,240,16,8] |
| workshops | [56,196,8,8] | [46,204,32,8] |
| infirmary | [72,196,8,8] | [46,204,64,8] |
| well | [68,132,8,8] | [58,140,32,8] |
| dig1 | [84,160,8,8] | [74,168,32,8] |
| dig2 | [84,156,8,8] | [74,168,32,8] |
| games | [84,180,8,8] | [74,188,32,8] |

## Movement masks and limits

The room's collision geometry is authored separately in `ROOM_COLLISION`, using the real native floor extents and the furniture's image positions. A 4-pixel cell is passable only when its centre lies on an authored floor area and outside every solid footprint. Grates, rugs, flat paper and puddles remain floor; beds, desks, planted containers, rocks, fences, walls and fixed furniture block movement. The source art is not inferred from the older narrative room grid.

Every passable cell belongs to a component connected to a usable entrance. Washroom keeps two independent compartments and two separate entrances; neither room partition nor toilet is traversable. Breach remains sealed. The Bridge opens directly into the original upper-section crop, and the Hold's cache is now reachable through its open fence.

Some source compositions contain pockets of floor completely enclosed by furniture or structural objects. They remain unreachable rather than allowing a character to cross those objects. Main Diner's enclosed U-shaped bar has no staff entrance in the original art and stays inaccessible behind the counter. Tiny gaps narrower than the 4-pixel navigation resolution are likewise not treated as paths. `inaccessibleFloorCells` records these excluded components explicitly; this is not a claim that every pixel of the original flattened image is walkable.

| Room | Reachable 4px floor cells | Enclosed / inaccessible cells |
| --- | ---: | ---: |
| bridge | 720 | 0 |
| dock | 2702 | 4 |
| breach | — | — |
| hold | 1851 | 51 |
| common | 173 | 43 |
| administration | 707 | 0 |
| dispatch | 561 | 0 |
| archive | 809 | 0 |
| records | 387 | 6 |
| camp | 691 | 0 |
| garden | 597 | 0 |
| sheltergate | 162 | 47 |
| yard | 425 | 0 |
| study | 416 | 0 |
| sparebedroom | 346 | 0 |
| parlour | 572 | 0 |
| projection | 414 | 0 |
| winter | 336 | 3 |
| library | 437 | 0 |
| grandbedroom | 349 | 0 |
| salon | 1026 | 0 |
| hearth | 664 | 0 |
| maindiner | 902 | 130 |
| sodabar | 803 | 0 |
| servicecounter | 348 | 0 |
| graveyard | 790 | 0 |
| maintenance | 667 | 0 |
| kitchen | 438 | 0 |
| stalls | 189 | 0 |
| washroom | 341 | 0 |
| face | 2367 | 0 |
| dig3 | 441 | 22 |
| dig4 | 511 | 0 |
| dig5 | 1707 | 0 |
| dig6 | 1604 | 0 |
| workshops | 899 | 0 |
| infirmary | 553 | 0 |
| well | 317 | 0 |
| cabin1 | 746 | 24 |
| cabin2 | 766 | 24 |
| cabin3 | 802 | 24 |
| cabin4 | 765 | 21 |
| cabin5 | 740 | 21 |
| dig1 | 574 | 0 |
| dig2 | 444 | 0 |
| games | 547 | 0 |

## Verification

All 46 room render adapters were loaded in Chromium without a page error. Every exit and arrival is passable and every exit lies on its movement-grid boundary. Every passable cell was checked against the authored solid footprints. Individual room PNGs and overlaid masks were inspected, including the two beds in Digging Six, Cabin-specific luggage/locker/shelves, the stepped Workshop bays and both Washroom compartments. The temporary inspection files are under `/tmp/explorer-room-art-audit/`; original comparison pages were not edited.


## Native-detail review, 7 September 2026

The source pixel lattice, rather than the screenshot size, sets the reduction.
The explorer now uses these exact crops (original files are under `library/rooms/`):

| Room | ZIP image | Original rectangle | Native result |
| --- | --- | --- | --- |
| Bridge | Post Apoc Office - Asset Pack_1.png | [181,27,384,288] | 192×144 (2×) |
| Dock | Post Apoc Shelter - Asset Pack_2.png | [34,35,864,576] | 288×192 (3×) |
| Hold | Post Apoc Shelter - Asset Pack_8.gif | [48,48,576,768] | 192×256 (3×) |
| Face | Post Apoc Shelter - Asset Pack_3.png | [34,34,864,576] | 288×192 (3×) |
| Breach, still sealed | Post Apoc Office - Asset Pack_6.png | [18,18,672,768] | 224×256 (3×) |

Collision rectangles and openings scale with the recovered source pixels. No new room, fixture or opening is introduced by this correction. The 4-pixel movement grid is regenerated from those rectangles; the exported `src/lib/habitat/generated/rooms.json` contains the current reachable and excluded counts.

The two upright residential mattresses are copied 1:1 from the existing bedroom sheet: clean [420,50,24,43] → Digging Five [19,39,24,43], worn [420,146,24,43] → Digging Six [24,94,24,43]. Their previous stretched rectangles have been removed; collision footprints follow the real 24×43 image.

Camp (`Camping_Set_1.jpg`, [114,75,402,549] → 134×183) and Shelter Entrance (`Post Apoc Shelter - Asset Pack_1.jpg`, [44,75,621,612] → 207×204) use the source-pixel medoid from `source-sampling.js`. Each output pixel is an actual RGBA pixel within its own 3×3 source block; there is no averaging, sharpening, new edge or invented colour. A flood removes only near-white page fringe connected to the image perimeter (minimum channel 230, channel spread ≤20). Dark outlines and enclosed white objects remain. The already documented Shelter ground palette still applies. The garden PNG and Inner Yard PNG remain nearest-neighbour copies.

Records and Maintenance retain detail limitations already present in their JPEG source. Tested replacement sampling did not establish a reliable improvement, so no synthetic detail is added. See `docs/habitat-art-audit.md` for the 45-room inspection and measured evidence.

Residents use a 24×44 native sprite with an 18-pixel coat and 12×8 foot reservation. Its size is anchored to 28×62 beds and 26×63 lockers, independent of a room's canvas dimensions. The face uses an exact 2:1 nearest-neighbour copy of its authored portrait, giving an 11-pixel head within the 44-pixel adult. Both room and resident are enlarged by the same integer CSS zoom.
