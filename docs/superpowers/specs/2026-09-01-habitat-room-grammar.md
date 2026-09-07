# Four provenances: the grammar for room interiors

Art direction, phase three. Branch: `night-shift-habitat`.

This settles **the shared vocabulary every room interior is built from**, and
blocks the first three rooms as a calibration set. It builds on
`2026-09-01-habitat-plan.md` (the layout) and `2026-09-01-habitat-map-art.md`
(the map's art direction) and does not reopen either. The sixteen canon grids in
`src/lib/habitat/rooms.ts` are the substrate and are not edited here.

## The law that makes clutter mean something

The reason the reference images read as lived-in is not that they are full. It is
that everything in them plainly belongs to one world — a garage is full of garage
things. The habitat has a much stronger version of that law available:

> **There is no shop. Every object came from one of four places, and you can tell
> which by looking.**

The habitat is a desaturated grey-brown, so **any saturated pixel is a light, a
living thing, or something out of a crate.** Saturation is provenance, which makes
every bright mark carry story instead of decoration.

| Provenance | Where from | How it reads |
| --- | --- | --- |
| **Hull plate** | the ship | Cold grey, bolted, never the right size because it was cut from something that was already a shape. Bright at a fresh cut, rusting warm within months. |
| **Rock** | the stone | Warm brown, chiselled, immovable. Tool marks everywhere, no two faces at the same angle. |
| **Grown** | Hydroponics | The only green and the only soft thing. Fibre, cord, matting. Scarce enough that a length of it is a gift. |
| **Cargo** | the crates | Factory-finished, saturated, out of place. Nine opened in a hundred days, forty-one still shut. The only manufactured objects, and none of them explain anything. |
| **Personal** | from before | What the twenty-five carried aboard, and what the sleeping passengers left in the Cabins. Neat, worn, unmatched, untouchable. |

Checkable consequence: **every object in every room must be assignable to exactly
one provenance.** A room whose objects are all one provenance is either wrong or is
making a point — the Common is nearly all salvaged plate, and that is the point.

## Bolted, never welded

Welding costs power and power is what they cannot spare. Nothing in the habitat is
welded, and that one rule does more work than it looks like it should.

1. **Every join is visible.** Bolts, clamps, wire, wedges, tension. You can see how
   a thing was put together, which means you can see that *a person* put it
   together. A welded seam hides labour; a bolted one displays it.
2. **Nothing is the right size.** Bolt holes in the wrong places, an edge that was
   somebody else's edge, a curve where a flat was wanted. Wrong-sizedness is the
   cheapest signal of reuse there is.
3. **Cut edges stay bright.** Fresh plate is almost white and dulls, then rusts,
   over months. A cut edge is therefore a **date**: bright means this week, warm
   brown means the first month.
4. **Repairs are the wrong colour, always.** A patch never matches what it patches.
   Over years a floor becomes a quilt. This is the slow trace the owner confirmed
   as canon, and it is the one that will change the map most.

## The room sheet

Twenty-seven spaces need a repeatable format or they drift apart. A sheet is not
finished until every field is filled.

| Field | What it settles |
| --- | --- |
| **The reading** | What you see in the first second, and what you find on the second look. If these are the same thing, the room has no depth. |
| **Light** | Sources, positions, colour, level — **and the night watch state**, authored rather than filtered. |
| **Circulation** | Where you enter and leave, the worn track between, and whether there is a seen route and an unseen one. |
| **Clutter zones** | Which walls are packed and with what. Centres stay open. Chaos budget checked, not felt. |
| **Provenance mix** | Which of the four, and where. Anything unassignable does not go in. |
| **Traces** | Which of the seven marks appear, and the simulation quantity driving each. |
| **Set dressing** | Drawn detail with written lore and no state. Never enters the grid. |
| **Must not have** | The negative list. **This is the field that stops all sixteen rooms converging on the same room.** |

---

# Calibration set

A **blocking pass** — footprint, light field, circulation, clutter zones, traces.
Not finished pixel art: dressing twenty-seven rooms before the blocking is agreed
is how they end up looking like each other.

## The Common — rock · 32 × 9 m · lamp amber · the hub, four mouths

**The reading.** *First second:* one long lit table down the low side of a wide
dark hall, and the hall is far bigger than the thing in it. *Second look:* the
table is a hull plate with rivet holes still in it, no two benches match, and the
only densely packed corner is one woman's entire property.

**Light.** A run of salvaged lamps **over the table only**. The rest is unlit.
That is the whole decision: a bright table in a dark hall, not a bright room. It
costs less, it reads bigger, and it makes the table a gravity well. *Night watch:*
one lamp in three, cooler — two people at a twelve-metre table with everything
around them dark.

**Circulation.** Four mouths. West to east can be walked **along the table**, past
everyone eating, or **four metres north in the dark**. Both tracks are worn, and
that the far one is worn at all is a datum: people do avoid the table.

**Clutter.** Deliberately the **least cluttered room in the habitat**, because
nobody keeps anything here. Two packed spots only: Pilar's corner, and the drift of
things left under the pinning wall. Public space is space nobody has claimed, so it
is empty — which is what makes a hub feel like one.

**Provenance.** Salvaged plate dominant. Rock walls and floor. **No green at all**,
which is the entire reason Hydroponics matters. One or two cargo items pinned up.

**Traces.** Polish on both tracks, heavy. Wear-to-bare under the benches. One
stain, grease, under the stove — the only stain in the room. Accumulation below the
pinning wall. One floor repair where they took stone.

**Set dressing.** The unsigned drawing, eleven days up. Scratches where the same
people sit in the same seats. A bench whose leg is a different plate from its seat.

**Must not have.** Personal storage. Anything green. Cold light. Any two objects
that match.

## The Cabins — hull · 26 × 8 m · eight lamps, eight levels · the Long Walk runs through

**The reading.** *First second:* a straight metal corridor with doors down both
sides, and everything behind every door is tilted. *Second look:* everything has a
wedge under it, the plate is missing in patches that worsen toward one end, and one
door is barred.

**Light.** Each cabin has **its own lamp and they are all different brightnesses**,
because each is powered by whoever lives there and they each made a different
choice. The corridor strip is half dead. This is the answer to keeping a rigid
repeating structure interesting: *the modularity is in the geometry and the
variation is in the light.* *Night watch:* three lit of eight — and you can tell
whose. On the night watch the Cabins say who is awake.

**Circulation.** Everyone passes every door daily. The most worn floor in the
habitat, and **worn off-centre**, hugging the uphill side, because on a twenty-two
degree floor you drift as you walk down it.

**Clutter.** Each cabin's perimeter carries **two layers**: the original
passenger's things, neat and factory-finished, and the occupant's, improvised out
of plate. The boundary between them is the etiquette nobody wrote, and it is
visible.

**Provenance.** All four, and the only room where all four are legible at once.

**Traces.** Polish, heavy and off-centre. Rust bloom, worst at the end nearest the
Throat where the plate went. **Slide:** everything loose sits against the aft
bulkhead of every cabin. Repairs where plate was taken and partly given back.

**Set dressing.** The jammed hatch and the bar somebody added later. A shim stack
that has grown over a hundred days as the shims settled.

**Must not have.** Anything level. Two cabins lit the same. An unclaimed cabin. A
welded seam.

## Hydroponics — rock · 30 × 10 m · grow white, full · a destination, not a route

**The reading.** *First second:* the only green on the map under the only white
light, painfully bright next to everything around it — coming in off the Lamp Run
your eye has to adjust. *Second look:* there are chairs in here that do not belong
in here, at the edge of the light, facing the trays, and nobody is working in them.

**Light.** The one room where **the light is the machine**: it is not illuminating
the room, it is feeding it, and the illumination is a by-product people are
stealing. *Night watch:* **it does not dim.** Plants keep a cycle that is not the
ship's, so at night this is the only bright thing on the map and everything else is
embers — which is exactly when the cost of the sitters is most visible.

**Circulation.** The working track skirts the trays between the two doors. Then a
second worn patch that **goes nowhere and ends at a chair**. A track terminating in
a seat is the signature of loitering, drawn from real footfall: the trace system
proves the lore without anybody writing it down.

**Clutter.** Perimeter packed with the seed store, spare trays, trimmings. But the
trays are ordered rows — **the only orthogonal grid in the rock half of the map**,
because plants need rows. The most organic room has the most regular layout, and
the tension is the point.

**Provenance.** Grown, dominant, and only here. Hull plate cut and bolted into tray
frames. The lamp bank is cargo, and the most valuable object in the habitat.

**Traces.** Polish on the working track and the loitering patch. Stain, but
**pale** — mineral rings under the trays, not the dark of grease. Accumulation of
dead matter. Tray repairs, in the wrong plate.

**Set dressing.** `f`, the plant nobody planted, in a tray at the edge. The chairs,
none of them from here. Eleven seed packets and no twelfth.

**Must not have.** Cold light. Grey as a dominant. Darkness anywhere at all — this
is the one room with no shadow in it.

---

## Sequence for the remaining twenty-four

Ordered so the vocabulary is built up rather than discovered late. Each batch
introduces one thing the previous ones did not need.

| Batch | Rooms | What it adds |
| --- | --- | --- |
| **1 · done** | Common, Cabins, Hydroponics | Public rock, cannibalised hull, the light extreme. |
| **2** | Workshops, The Well, Great Wall | The economy and its queue; the wet and stain vocabulary; and one large blank surface, which is the hardest thing on the list to draw. |
| **3** | Diggings, The Row, The Face | Nine homes in one pass, because their differences from each other *are* the content. Plus the frontier and its unfinished edge. |
| **4** | Dock, Bridge, Infirmary, Berths | The hull's set pieces. Three suits, a cracked port, a slab, and the cyan. |
| **5** | Hold, Breach, Spine, Hollow | The four strange ones: forty-one unopened crates, vacuum, heat, and nothing at all. Two have no light, which needs solving once. |
| **6** | The eleven corridors | Fast once the rooms exist — a corridor's character is mostly what it connects and how worn it is. |

## Open, for the owner

- **Does the Common's darkness land?** The boldest call in the batch: a hub that is
  mostly unlit with one bright table in it. If it reads as unfinished rather than
  vast, the light-first direction needs softening before batch two.
- **Is the two-layer clutter in the Cabins legible enough?** The passenger's neat
  things against the occupant's improvised ones carries a lot of story on a small
  difference in finish.
- **The chairs in Hydroponics.** A worn track that ends at a seat is the first place
  the trace system says something the lore only implied. Confirm traces should do
  that much narrative work.
