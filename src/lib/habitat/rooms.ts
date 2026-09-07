// The habitat, as a set of linked room grids.
//
// Eleven rooms in the hull, which went into the rock at an angle and is finite
// and inherited, thirty-two cut into the stone by hand, and five places on the
// surface. Hull grids are
// axis-aligned in their own local coordinates and the tilt is applied at render,
// so distance and adjacency stay sane while the cutaway still shows a ship driven
// in crooked.
//
// The content of this file is authored, not derived. Every grid, every object and
// every connection is a decision recorded in
// docs/superpowers/specs/2026-08-31-habitat-rooms.md, and rooms.test.ts holds the
// invariants that keep an edit from quietly breaking the map.

import { placedObjects, type Placed, type Point, type RoomLegend } from './grid';

export type Side = 'hull' | 'rock' | 'surface';

export type RoomId =
  | 'bridge' | 'dock' | 'breach' | 'hold' | 'infirmary'
  | 'longwalk' | 'cabin1' | 'cabin2' | 'cabin3' | 'cabin4' | 'cabin5'
  | 'common' | 'workshops' | 'well' | 'face'
  | 'row' | 'games' | 'administration' | 'dispatch' | 'archive' | 'records'
  | 'maintenance' | 'kitchen' | 'stalls' | 'washroom'
  | 'camp' | 'garden' | 'sheltergate' | 'yard'
  | 'study' | 'sparebedroom' | 'parlour' | 'projection' | 'winter'
  | 'library' | 'grandbedroom' | 'salon' | 'hearth'
  | 'servicecounter' | 'maindiner' | 'sodabar' | 'graveyard'
  | 'dig1' | 'dig2' | 'dig3' | 'dig4' | 'dig5' | 'dig6';

export type Room = {
  id: RoomId;
  name: string;
  side: Side;
  /** Degrees off the dug galleries. The hull is 22; the rock is 0. */
  tilt: number;
  connects: readonly RoomId[];
  /** What a visitor is told about the room. */
  description: string;
  /** The one thing about it that is not obvious. */
  note?: string;
  grid: readonly string[];
  legend: RoomLegend;
};

export const ROOMS: readonly Room[] = [
  {
    id: 'bridge',
    name: 'The Bridge',
    side: 'hull',
    tilt: 22,
    connects: ['dock'],
    description:
      "The bow, canted up and nearly at the surface. Exposed pipes and damaged wall "
      + "units line the compartment. Nobody has taken the pilot's place since the "
      + "taboo formed in the second week, and nobody can say who started it.",
    grid: [
      '########',
      '#wwwwww#',
      '#..t..u#',
      '#...p..#',
      '#s.....#',
      '#..b...#',
      '###+####',
    ],
    legend: {
      w: { name: 'the cracked port, patched from inside', solid: true },
      p: { name: 'the pilot\'s chair', solid: true },
      s: { name: 'a scratch tally of the days, cut into the bulkhead', solid: false },
      t: { name: 'dead navigation console', solid: true },
      u: { name: 'dead helm console', solid: true },
      b: { name: 'a bench somebody dragged up here', solid: false },
    },
  },
  {
    id: 'dock',
    name: 'The Dock',
    side: 'hull',
    tilt: 22,
    connects: ['bridge', 'longwalk', 'camp'],
    description:
      "Where the hull's flank broke the surface. Drums, broken plate and a hatch lie "
      + "across the open ground. Dima Vashenko logs the surface outings with a scruple "
      + "that irritates everybody. There are three suits for twenty-five people.",
    grid: [
      '###+###',
      '+.1.2.+',
      '#.....#',
      '#..3..#',
      '#l...k#',
      '#..r..+',
      'X##+###',
    ],
    legend: {
      '1': { name: 'suit rack one', solid: true },
      '2': { name: 'suit rack two', solid: true },
      '3': { name: 'suit rack three', solid: true },
      r: { name: 'tether reel', solid: true },
      l: { name: 'the outing list, a plate scratched with names and dates', solid: false },
      k: { name: 'tool locker', solid: true },
    },
  },
  {
    id: 'longwalk',
    name: 'The Long Walk',
    side: 'hull',
    tilt: 22,
    connects: ['dock', 'breach', 'hold', 'cabin1', 'cabin2', 'cabin3', 'cabin4', 'cabin5'],
    description:
      'The ship\'s corridor, straight, metal and downhill the whole way, with five '
      + 'cabin openings off it. Everybody passes every threshold every day, which is the '
      + 'whole of the etiquette in this half of the habitat. The floor is the most '
      + 'worn in the place and it is worn off-centre, because on a twenty-two '
      + 'degree deck you drift as you walk down it.',
    note:
      'The five cabins open directly onto the walking lane. The passage to the '
      + 'Breach remains sealed behind hull plate.',
    grid: [
      '##+##',
      '#===#',
      '+===#',
      '#===#',
      '#===#',
      '#=p=#',
      '#===#',
      '#===#',
      '#===#',
      '#===#',
      '+===+',
      '#===#',
      '#===#',
      '#===#',
      '#===#',
      '#===#',
      '#===#',
      '#===#',
      '+===+',
      '#===#',
      '#===#',
      '#=l=#',
      '#===#',
      '#===#',
      '#===#',
      'X===#',
      '##+##',
    ],
    legend: {
      l: { name: 'a strip lamp; half the run is dead', solid: false },
      p: { name: 'a bite out of the wall where the plate was lifted', solid: false },
    },
  },
  {
    id: 'cabin1',
    name: 'Cabin One',
    side: 'hull',
    tilt: 22,
    connects: ['longwalk'],
    description:
      'The first cabin off the Dock, and the one everybody passes twice a day. '
      + 'Two bunks, a floor that runs downhill, and a wedge under everything that '
      + 'has to stand level. Dima Vashenko and Edda Halvorsen sleep here, which '
      + 'means the outing list and the allocation ledger live in the same four '
      + 'metres.',
    note:
      'Its lamp is the brightest of the five. Neither of them has said who chose '
      + 'that.',
    grid: [
      '########',
      '#.^....#',
      '#m.m..e+',
      '#m.m...#',
      '#..d...#',
      '#......#',
      '#......#',
      '########',
    ],
    legend: {
      e: { name: 'a sleeping passenger\'s belongings, untouched', solid: false },
      m: { name: 'a bunk', solid: true },
      d: { name: 'wedges and shims holding something level', solid: false },
    },
  },
  {
    id: 'cabin2',
    name: 'Cabin Two',
    side: 'hull',
    tilt: 22,
    connects: ['longwalk'],
    description:
      'Identical to the first, because they all are, and slowly not. Halim Zoubir '
      + 'and Ferran Solé are in it, two men who worked one season together twenty '
      + 'years ago and have never once mentioned it.',
    note:
      'The shim stack by the bunk has a shim added roughly every nine days. It is '
      + 'the closest thing in the habitat to a calendar nobody meant to keep.',
    grid: [
      '########',
      '#.^....#',
      '#m.m..s+',
      '#m.m...#',
      '#..d...#',
      '#......#',
      '#......#',
      '########',
    ],
    legend: {
      s: { name: 'a shim stack, grown over a hundred days as the floor settled', solid: false },
      m: { name: 'a bunk', solid: true },
      d: { name: 'wedges and shims holding something level', solid: false },
    },
  },
  {
    id: 'cabin3',
    name: 'Cabin Three',
    side: 'hull',
    tilt: 22,
    connects: ['longwalk'],
    description:
      'The furthest cabin down the walk, and the darkest. Gita Raman and Cato '
      + 'Lindqvist, who between them are responsible for whether the hull holds and '
      + 'whether anybody is standing under it when it does not.',
    note:
      'The photograph is taped over a patch where plate was lifted, which is the '
      + 'only reason anybody knows the patch is there.',
    grid: [
      '########',
      '#.^....#',
      '#m.m..p+',
      '#m.m...#',
      '#..d...#',
      '#......#',
      '#......#',
      '########',
    ],
    legend: {
      p: { name: 'a photograph taped where the light is best', solid: false },
      m: { name: 'a bunk', solid: true },
      d: { name: 'wedges and shims holding something level', solid: false },
    },
  },
  {
    id: 'cabin4',
    name: 'Cabin Four',
    side: 'hull',
    tilt: 22,
    connects: ['longwalk'],
    description:
      'Across the walk, so its floor tilts the other way. Bex Ferreira and Reva '
      + 'Sandoval sleep here, and both of them catalogue things for a living, and '
      + 'the cabin shows it.',
    note:
      'The shelf is bolted, not welded, and you can count the bolts. Four of them '
      + 'are not the same as the other three.',
    grid: [
      '########',
      '#....^.#',
      '+r..m.m#',
      '#...m.m#',
      '#...d..#',
      '#......#',
      '#......#',
      '########',
    ],
    legend: {
      r: { name: 'a rope-and-plate shelf bolted over the bunk', solid: false },
      m: { name: 'a bunk', solid: true },
      d: { name: 'wedges and shims holding something level', solid: false },
    },
  },
  {
    id: 'cabin5',
    name: 'Cabin Five',
    side: 'hull',
    tilt: 22,
    connects: ['longwalk'],
    description:
      'At the far end of the five cabins. Osvald Berg and Iris Calloway sleep here. '
      + 'He is up before anybody and back after everybody, and she draws the map of '
      + 'a place she has still not walked all of.',
    note:
      'Osvald has not dug himself a home and will not say why. His half-sister '
      + 'has one, forty metres of rock and the whole ship away.',
    grid: [
      '########',
      '#....^.#',
      '+k..m.m#',
      '#...m.m#',
      '#...d..#',
      '#......#',
      '#......#',
      '########',
    ],
    legend: {
      k: { name: 'a locker that is not the ship\'s, and does not fit', solid: false },
      m: { name: 'a bunk', solid: true },
      d: { name: 'wedges and shims holding something level', solid: false },
    },
  },
  {
    id: 'breach',
    name: 'The Breach',
    side: 'hull',
    tilt: 22,
    connects: ['longwalk', 'hold'],
    description:
      'Where the hull tore. No pressure, no light, no sound, and the only place '
      + 'in the habitat where nobody can see or hear you. It is the source of '
      + 'salvage mass and it is where things go that are not meant to be found.',
    note:
      'Nobody has read the nameplate. They do not know what their ship is '
      + 'called.',
    grid: [
      '########',
      '#**n**.X',
      '#*c****#',
      '#..**p*#',
      '#=*****#',
      '#**s***#',
      '#*****.X',
      '########',
    ],
    legend: {
      n: { name: 'the ship\'s nameplate, half buried, unread', solid: false },
      c: { name: 'cargo that came loose and stopped', solid: true },
      p: { name: 'a torn plate, the tear itself', solid: true },
      s: { name: 'the salvage pile, what has been dragged near the hatch', solid: true },
    },
  },
  {
    id: 'hold',
    name: 'The Hold',
    side: 'hull',
    tilt: 22,
    connects: ['longwalk', 'breach', 'infirmary'],
    description:
      "Stores behind a wire fence, with drums gathered around a clear path. The "
      + "manifest went in the impact, so the old labels mean little. Reva Sandoval has "
      + "opened nine crates in a hundred days and catalogued all nine beautifully.",
    note:
      'Forty-one crates remain unopened. Opening one is an occasion and there '
      + 'is no way to know what is inside until it is open.',
    grid: [
      '###+###',
      '+u...u#',
      '#u...u#',
      '#u...u+',
      '#.....#',
      '#o...u#',
      '#o...u#',
      '+v...u#',
      '###+###',
    ],
    legend: {
      o: { name: 'an opened crate, catalogued', solid: true },
      u: { name: 'an unopened crate', solid: true },
      v: { name: 'Reva\'s inventory board', solid: false },
    },
  },
  {
    id: 'infirmary',
    name: 'The Infirmary',
    side: 'hull',
    tilt: 22,
    connects: ['hold', 'workshops'],
    description:
      "Ship medical, partly working. Bottles, lockers and cylinders crowd around a "
      + "worktable and chair. The drug stock has never been audited. This is where "
      + "people are treated and watched; the cold sleeper absent from every manifest "
      + "remains an unresolved case.",
    note:
      'Cato has taped an invented name to the cold bed. Nobody has asked whether '
      + 'that makes its occupant more real or less.',
    grid: [
      '##+###',
      '+b..k#',
      '#b...#',
      '#....+',
      '#..c.#',
      '#....#',
      '#z...+',
      '##+###',
    ],
    legend: {
      b: { name: 'two medical beds - one diagnostic, one kept cold', solid: true },
      c: { name: 'the consulting corner, two chairs', solid: false },
      k: { name: 'the unaudited cabinet', solid: true },
      z: { name: 'the slab', solid: true },
    },
  },
  {
    id: 'camp',
    name: 'Surface Camp',
    side: 'surface',
    tilt: 0,
    connects: ['dock', 'garden'],
    description:
      'A field tent stands just beyond the Dock with a fire ring, a folding chair '
      + 'and the sealed tins used on long surface watches. It is the first safe '
      + 'stopping place outside the hull and the last place with a direct tether.',
    note:
      'The pumpkins beside the cold fire were brought up as a joke and nobody has '
      + 'taken them back down.',
    grid: [
      '##+###',
      '#tt.p#',
      '#tt.c#',
      '#..f.#',
      '#s...#',
      '#p...#',
      '#....#',
      '##+###',
    ],
    legend: {
      t: { name: 'the patched surface tent', solid: true },
      c: { name: 'the folding field chair', solid: false },
      f: { name: 'a stone fire ring', solid: true },
      s: { name: 'sealed tins and field supplies', solid: true },
      p: { name: 'hardy plants carried up from below', solid: false },
    },
  },
  {
    id: 'garden',
    name: 'Hydroponics Yard',
    side: 'surface',
    tilt: 0,
    connects: ['camp', 'sheltergate', 'graveyard'],
    description:
      'This is Hydroponics: rusting drums and old tyres filled with surface soil '
      + 'between the camp and the shelter. It is the habitat\'s only working farm. '
      + 'Vero moved it into daylight when the underground lamps began costing '
      + 'more power than the crop returned. The birds consider it theirs too.',
    note:
      'Three seedlings appeared outside any marked container after the first rain. '
      + 'Vero refuses to pull them or to call that sentiment.',
    grid: [
      '##+###',
      '#d.p.#',
      '#.rr.#',
      '+b...#',
      '#s.bd#',
      '#.p.d#',
      '##+###',
    ],
    legend: {
      d: { name: 'drums reused as soil planters', solid: true },
      r: { name: 'tyres reused as raised beds', solid: true },
      p: { name: 'the plants that survived the surface', solid: false },
      b: { name: 'birds feeding between the planters', solid: false },
      s: { name: 'unplanned seedlings in open soil', solid: false },
    },
  },
  {
    id: 'sheltergate',
    name: 'Shelter Entrance',
    side: 'surface',
    tilt: 0,
    connects: ['garden', 'yard'],
    description:
      'A corrugated shelter mouth is buried under a broad bank of packed earth. '
      + 'Drums and sandbags hold its sides while one closed door marks the way '
      + 'into the enclosed yard hidden behind the mound.',
    note:
      'The radiation sign predates the crash, but nobody has established what it '
      + 'was warning the old occupants about.',
    grid: [
      '###+####',
      '#......#',
      '#..v...#',
      '#......#',
      '#wb..br#',
      '#rb..br#',
      '#......#',
      '###+####',
    ],
    legend: {
      v: { name: 'a vent rising through the earth bank', solid: true },
      w: { name: 'the old radiation warning', solid: false },
      b: { name: 'sandbags bracing the buried frontage', solid: true },
      r: { name: 'sealed yellow and rusted drums', solid: true },
    },
  },
  {
    id: 'graveyard',
    name: 'Graveyard',
    side: 'surface',
    tilt: 0,
    connects: ['garden'],
    description:
      'An iron-fenced cemetery lies beyond the planter yard, with one marked '
      + 'stone, one open grave and dead trees enclosing a narrow strip of ground.',
    note: 'The empty grave predates the crash, but its shovel was left standing in fresh soil.',
    grid: [
      '###+###',
      '#t...t#',
      '#.g...#',
      '#s.h.t#',
      '#..h..#',
      '#..h.t#',
      '#.....#',
      '#f...f#',
      '#######',
    ],
    legend: {
      t: { name: 'the dead cemetery trees', solid: true },
      f: { name: 'the iron fence and stone posts', solid: true },
      g: { name: 'the single marked gravestone', solid: true },
      s: { name: 'the shovel left in fresh soil', solid: false },
      h: { name: 'the long open grave', solid: true },
    },
  },
  {
    id: 'yard',
    name: 'Inner Yard',
    side: 'surface',
    tilt: 0,
    connects: ['sheltergate', 'common'],
    description:
      'Behind the shelter door is an open yard bounded by mismatched corrugated '
      + 'plate. Shelves of cans, repair tools, drums and one green chest make it '
      + 'the surface store before the entrance passage descends to the Common.',
    note:
      'It has no roof. At night the shelves cast the longest shadows in the habitat.',
    grid: [
      '##+###',
      '#h.h.#',
      '#h.h.#',
      '#t.d.#',
      '#..c.#',
      '#s...#',
      '#....#',
      '##+###',
    ],
    legend: {
      h: { name: 'open shelves of workshop stores', solid: true },
      t: { name: 'loose repair tools', solid: false },
      d: { name: 'drums holding long-handled tools', solid: true },
      c: { name: 'the green sealed field chest', solid: true },
      s: { name: 'boxed supplies inside the plate fence', solid: true },
    },
  },
  {
    id: 'common',
    name: 'The Common',
    side: 'rock',
    tilt: 0,
    connects: ['yard', 'administration', 'row', 'workshops', 'games', 'kitchen'],
    description:
      "The room the habitat happens in. Everybody passes through it and almost "
      + "everybody eats here. The first table they built came from a hull plate. A fireplace, an armchair and a low table make a place to "
      + "stay; coloured lights and a decorated tree fill the corner.",
    note:
      'The clean stone beside the entrance is the remnant of the first chamber '
      + 'they cut. Somebody pinned a drawing there eleven days ago and did not '
      + 'sign it.',
    grid: [
      '####+#######',
      '+..........+',
      '#k.s.......#',
      '#.....P....#',
      '#....:.....#',
      '#.bbbbbbbb.#',
      '#.TTTTTTTT.#',
      '+.bbbbbbbb.+',
      '######+#####',
    ],
    legend: {
      k: { name: 'Pilar\'s corner - two burners and everything she owns', solid: true },
      s: { name: 'the stove', solid: true },
      'T': { name: 'the long table, a hull plate', solid: true },
      b: { name: 'benches, none of them matching', solid: false },
      'P': { name: 'the pinning wall - notices, lists, one drawing', solid: false },
    },
  },
  {
    id: 'administration',
    name: 'Administration',
    side: 'rock',
    tilt: 0,
    connects: ['common', 'dispatch'],
    description:
      "Salvaged desks and filing drawers make this the place where stores, shifts "
      + "and unresolved requests are written down. Nothing here has legal authority, "
      + "but everybody checks the board before arguing.",
    note:
      'The right-hand desk is always clear at the start of a watch and covered in '
      + 'loose paper by the end of it.',
    grid: [
      '###+###',
      '#d...f#',
      '#d...f#',
      '#....f#',
      '#.....#',
      '#q.d..#',
      '#..d..#',
      '#p....#',
      '###+###',
    ],
    legend: {
      d: { name: 'one of the mismatched administration desks', solid: true },
      f: { name: 'filing drawers holding the habitat inventory', solid: true },
      q: { name: 'loose forms that have not reached the board', solid: false },
      p: { name: 'the leafless office plant nobody has thrown away', solid: false },
    },
  },
  {
    id: 'dispatch',
    name: 'Communications',
    side: 'rock',
    tilt: 0,
    connects: ['administration', 'archive'],
    description:
      'Kes Amankwah monitors the empty communication channels here. Two desks '
      + 'face each other across a clear strip of floor, with the handset, rota '
      + 'and calculator between them for the watch handover.',
    note:
      'The chair nearest the plant is treated as the senior position, although '
      + 'nobody ever decided that it was.',
    grid: [
      '###+####',
      '#......#',
      '#d....d#',
      '#f....f#',
      '#..q.p.#',
      '#......#',
      '####+###',
    ],
    legend: {
      d: { name: 'one of the two duty desks', solid: true },
      f: { name: 'a filing unit for completed watch sheets', solid: true },
      q: { name: 'the handset and calculator used during handover', solid: false },
      p: { name: 'a small plant kept alive under office light', solid: false },
    },
  },
  {
    id: 'archive',
    name: 'The Archive',
    side: 'rock',
    tilt: 0,
    connects: ['dispatch', 'records'],
    description:
      'A computer, one complete bookcase and every chair that could be spared. '
      + 'The digital archive fails often enough that paper copies are kept beside '
      + 'it, and people wait here while somebody finds the version that matters.',
    note:
      'The exposed rock in the middle of the floor has been measured every week. '
      + 'It has not moved, but the measurements continue.',
    grid: [
      '###+###',
      '#c...b#',
      '#c...b#',
      '#.....#',
      '#ss...#',
      '#..r..#',
      '#.....#',
      '#p..ss#',
      '###+###',
    ],
    legend: {
      c: { name: 'the archive computer and its desk', solid: true },
      b: { name: 'the bookcase of paper originals', solid: true },
      s: { name: 'blue waiting chairs recovered from the offices', solid: false },
      r: { name: 'the exposed rock breaking through the office floor', solid: true },
      p: { name: 'a cutting propagated in a coffee cup', solid: false },
    },
  },
  {
    id: 'records',
    name: 'Records',
    side: 'rock',
    tilt: 0,
    connects: ['archive', 'study'],
    description:
      'The paper end of the administrative wing: drawers, shelves, two desks and '
      + 'the water reserve that did not fit in the Well. Old ship records sit '
      + 'beside new habitat records because there is nowhere else for either.',
    note:
      'One filing drawer is labelled for deaths. It is empty, and nobody uses it '
      + 'for anything else.',
    grid: [
      '###+###',
      '#d..b.#',
      '#d..b.#',
      '#ff.w.#',
      '#ff...#',
      '#q..d.#',
      '###+###',
    ],
    legend: {
      d: { name: 'a desk covered in active records', solid: true },
      b: { name: 'the tall shelf of bound ship records', solid: true },
      f: { name: 'rusted filing cabinets sorted by year', solid: true },
      w: { name: 'stacked water dispensers waiting for the Well', solid: true },
      q: { name: 'forms left on the floor during the last count', solid: false },
    },
  },
  {
    id: 'study',
    name: 'The Study',
    side: 'rock',
    tilt: 0,
    connects: ['records', 'sparebedroom'],
    description:
      'A writing desk, a reading chair and more living plants than the room was '
      + 'assigned have turned this into a private place for correspondence and '
      + 'quiet work beyond the administrative wing.',
    note:
      'The desk drawers contain letters addressed to places the habitat cannot reach.',
    grid: [
      '###+###',
      '#d..d.#',
      '#d..p.#',
      '#.....#',
      '#p.r.c#',
      '#p...l#',
      '#....l#',
      '###+###',
    ],
    legend: {
      d: { name: 'the desk and long storage cabinet', solid: true },
      p: { name: 'the study plants in white pots', solid: false },
      r: { name: 'the abstract rug around the reading chair', solid: false },
      c: { name: 'the green reading chair', solid: false },
      l: { name: 'the standing lamp and low lamp table', solid: true },
    },
  },
  {
    id: 'sparebedroom',
    name: 'Spare Bedroom',
    side: 'rock',
    tilt: 0,
    connects: ['study', 'parlour'],
    description:
      "A complete double bedroom was assembled from a matching bed, two small "
      + "tables, a chair, a rug and plants. Nobody is assigned to it permanently, so "
      + "it is used when somebody needs quiet and privacy.",
    note:
      'The bed is remade after every use even when nobody knows who used it.',
    grid: [
      '###+###',
      '#n.bnn#',
      '#..bb.#',
      '#..bb.#',
      '#..r..#',
      '#c..p.#',
      '#c....#',
      '###+###',
    ],
    legend: {
      n: { name: 'the paired bedside tables and lamps', solid: true },
      b: { name: 'the double bed', solid: true },
      r: { name: 'the round green bedroom rug', solid: false },
      c: { name: 'two low bedroom chairs', solid: false },
      p: { name: 'the bedroom plants and candle stand', solid: false },
    },
  },
  {
    id: 'parlour',
    name: 'The Parlour',
    side: 'rock',
    tilt: 0,
    connects: ['sparebedroom', 'projection'],
    description:
      "A long room combines a sofa and coffee table with a proper dining table. It "
      + "is quieter than the Common and formal enough that people lower their voices "
      + "when they enter.",
    note:
      'Four chairs face the table, but meals here almost always end with five people.',
    grid: [
      '###+####',
      '#p.s.d.#',
      '#..s.d.#',
      '#..t...#',
      '#.ctcc.#',
      '#...c..#',
      '#d...p.#',
      '#......#',
      '###+####',
    ],
    legend: {
      p: { name: 'the parlour plants on their tall stands', solid: false },
      s: { name: 'the grey sofa and white lounge chair', solid: false },
      d: { name: 'the low cabinets and book stands', solid: true },
      t: { name: 'the coffee table and square dining table', solid: true },
      c: { name: 'the dining chairs around the second table', solid: false },
    },
  },
  {
    id: 'projection',
    name: 'Projection Room',
    side: 'rock',
    tilt: 0,
    connects: ['parlour', 'winter'],
    description:
      'Two office chairs face a salvaged film projector while books and recorded '
      + 'media fill the shelves around them. It is used for screenings, briefings '
      + 'and arguments that need a picture larger than a page.',
    note:
      'The projector still advances film, but its lamp is borrowed from the archive.',
    grid: [
      '###+###',
      '#f..b.#',
      '#q..b.#',
      '#q....#',
      '#..r..#',
      '#..q.p#',
      '#b....#',
      '###+###',
    ],
    legend: {
      f: { name: 'the restored film projector', solid: true },
      b: { name: 'shelves of books and recorded media', solid: true },
      q: { name: 'the two black screening chairs', solid: false },
      r: { name: 'the orange circular rug', solid: false },
      p: { name: 'the broad plants beside the shelves', solid: false },
    },
  },
  {
    id: 'winter',
    name: 'Winter Parlour',
    side: 'rock',
    tilt: 0,
    connects: ['projection'],
    description:
      'White-and-gold decorations, a bright tree and two lounge chairs make this '
      + 'the habitat\'s seasonal sitting room. The display stays up because nobody '
      + 'agrees which calendar would tell them when to take it down.',
    note:
      'The wrapped boxes are empty; their weight comes from scraps of ballast.',
    grid: [
      '###+###',
      '#d..t.#',
      '#s....#',
      '#s..x.#',
      '#s.xxx#',
      '#r.xxx#',
      '#p..xx#',
      '#######',
    ],
    legend: {
      d: { name: 'the decorated cabinet beneath the clock', solid: true },
      t: { name: 'the small lamp table and ornament', solid: true },
      s: { name: 'the two pale lounge chairs', solid: false },
      x: { name: 'the white-and-gold tree and hanging decorations', solid: true },
      r: { name: 'the round green parlour rug', solid: false },
      p: { name: 'plants and the stack of empty wrapped boxes', solid: true },
    },
  },
  {
    id: 'library',
    name: 'Old Library',
    side: 'rock',
    tilt: 0,
    connects: ['maintenance', 'grandbedroom'],
    description:
      "A dark timber office begins the wood-lined wing: a bookcase, a writing desk, "
      + "a red chaise, a globe and the few framed pictures carried out of storage.",
    note: 'The clock is wound every morning although nobody uses it to begin a watch.',
    grid: [
      '###+###',
      '#bb.q.#',
      '#bb.d.+',
      '#...d.#',
      '#s.rr.#',
      '#t...g#',
      '#.....#',
      '#######',
    ],
    legend: {
      b: { name: 'the paired dark bookcases', solid: true },
      q: { name: 'the grandfather clock and framed pictures', solid: true },
      d: { name: 'the writing desk and its chair', solid: true },
      s: { name: 'the red reading chaise', solid: false },
      r: { name: 'the layered formal rugs', solid: false },
      t: { name: 'the low lamp table', solid: true },
      g: { name: 'the old terrestrial globe', solid: true },
    },
  },
  {
    id: 'grandbedroom',
    name: 'Grand Bedroom',
    side: 'rock',
    tilt: 0,
    connects: ['library', 'salon'],
    description:
      'A carved double bed under a red canopy makes this the most elaborate '
      + 'bedroom in the habitat, surrounded by portraits, lamps and heavy rugs.',
    note: 'Nobody is permanently assigned to it; the canopy makes every temporary stay feel ceremonial.',
    grid: [
      '###+###',
      '#q...q#',
      '#n...n#',
      '+.bbb.+',
      '#.rrr.#',
      '#t....#',
      '#....l#',
      '#######',
    ],
    legend: {
      q: { name: 'the paired formal portraits', solid: false },
      b: { name: 'the carved canopy bed', solid: true },
      n: { name: 'the bedside tables and lamps', solid: true },
      r: { name: 'the layered bedroom rugs', solid: false },
      t: { name: 'the candle table with an open book', solid: true },
      l: { name: 'the glass bedside lantern', solid: true },
    },
  },
  {
    id: 'salon',
    name: 'Formal Salon',
    side: 'rock',
    tilt: 0,
    connects: ['grandbedroom', 'hearth'],
    description:
      'Two adjoining chambers form a formal dining room and sitting room, with '
      + 'red upholstered furniture, bookcases, cabinets and a tea service.',
    note: 'The dividing wall remains because the two halves sound different when crowded.',
    grid: [
      '#########',
      '#b..q.ss#',
      '#b..q.ss#',
      '+dt...t.+',
      '#cc.rrcc#',
      '#cc.rrcc#',
      '#t....ll#',
      '#########',
    ],
    legend: {
      b: { name: 'the salon bookcases and cabinets', solid: true },
      q: { name: 'the framed paintings and decorative jars', solid: false },
      s: { name: 'the red sofa and armchairs', solid: false },
      d: { name: 'the formal dining table', solid: true },
      t: { name: 'the tea and side tables', solid: true },
      c: { name: 'the carved dining and salon chairs', solid: false },
      r: { name: 'the red and grey formal rug', solid: false },
      l: { name: 'the paired glass lamps', solid: true },
    },
  },
  {
    id: 'hearth',
    name: 'Hearth Room',
    side: 'rock',
    tilt: 0,
    connects: ['salon'],
    description:
      'A working fireplace sits between two full bookcases, facing a pair of red '
      + 'chairs and the small tea table that makes this the quiet end of the wing.',
    note: 'The fire is real, so this room smells different from the rock around it.',
    grid: [
      '########',
      '#b.f.b.#',
      '#b.f.b.#',
      '+......#',
      '#.c.tc.#',
      '#.rrr..#',
      '#l...l.#',
      '########',
    ],
    legend: {
      b: { name: 'the twin bookcases', solid: true },
      f: { name: 'the working stone fireplace', solid: true },
      c: { name: 'the paired red hearth chairs', solid: false },
      t: { name: 'the small tea table', solid: true },
      r: { name: 'the layered hearth rugs', solid: false },
      l: { name: 'the candle tables and glass jars', solid: true },
    },
  },
  {
    id: 'maintenance',
    name: 'Maintenance',
    side: 'rock',
    tilt: 0,
    connects: ['workshops', 'library'],
    description:
      'The repair room that takes over when the Workshops run out of bench space. '
      + 'One half still looks like an office; the other is packed with parts, '
      + 'tools, cylinders and half-finished machines waiting for the right hands.',
    note:
      'The desk terminal contains service manuals for equipment nobody has found.',
    grid: [
      '####+####',
      '#d.f.rrr#',
      '#d.f.rrr#',
      '#..t....#',
      '#p.t.s..#',
      '#.......+',
      '#########',
    ],
    legend: {
      d: { name: 'the maintenance desk and its surviving terminal', solid: true },
      f: { name: 'filing drawers full of repair histories', solid: true },
      r: { name: 'racks of parts, tools and pressurised cylinders', solid: true },
      t: { name: 'the central repair bench', solid: true },
      p: { name: 'a broad-leafed plant carried out of the old office', solid: false },
      s: { name: 'packed stores waiting for a free shelf', solid: true },
    },
  },
  {
    id: 'kitchen',
    name: 'The Kitchen',
    side: 'rock',
    tilt: 0,
    connects: ['common', 'servicecounter'],
    description:
      "A professional kitchen assembled behind the Common: extraction hoods, ovens, "
      + "preparation islands and enough washing space to feed everybody without "
      + "turning the shared rooms into a permanent food-production line.",
    note:
      'The double doors stay shut during service because every argument sounds '
      + 'different when heard through them.',
    grid: [
      '###+###',
      '#v...o#',
      '#v...o#',
      '#..tt.#',
      '#s.tt.#',
      '#mm...#',
      '#...w.+',
      '#######',
    ],
    legend: {
      v: { name: 'the extraction hoods and cooking range', solid: true },
      o: { name: 'the warming and dish racks', solid: true },
      t: { name: 'stainless preparation tables', solid: true },
      s: { name: 'the narrow ingredient shelves', solid: true },
      m: { name: 'the mixer and food-processing machines', solid: true },
      w: { name: 'the washing station', solid: true },
    },
  },
  {
    id: 'servicecounter',
    name: 'Service Counter',
    side: 'rock',
    tilt: 0,
    connects: ['kitchen', 'maindiner'],
    description:
      'The compact service end of the diner holds the drinks machine, menu board '
      + 'and a short counter where food passes from the Kitchen into the public rooms.',
    note: 'The coloured drink labels survived better than the machine behind them.',
    grid: [
      '###+###',
      '#q..m.#',
      '#...m.+',
      '#ccccc#',
      '#s.t.s#',
      '#s...s#',
      '#.....#',
      '###+###',
    ],
    legend: {
      q: { name: 'the old illuminated menu board', solid: false },
      m: { name: 'the drinks and warming machines', solid: true },
      c: { name: 'the narrow service counter', solid: true },
      s: { name: 'the turquoise counter stools', solid: false },
      t: { name: 'the two small customer tables', solid: true },
    },
  },
  {
    id: 'maindiner',
    name: 'Main Diner',
    side: 'rock',
    tilt: 0,
    connects: ['servicecounter', 'sodabar'],
    description:
      'Red booths, a chequered floor, counter stools and a jukebox make this the '
      + 'largest public eating room beyond the Common and the loudest when occupied.',
    note: 'The jukebox lights up, but only four of its selections still contain music.',
    grid: [
      '#########',
      '#ccc..q.#',
      '#c....j.#',
      '+c.tt.ss+',
      '#c.tt.ss#',
      '#c..t.ss#',
      '#c..t.ss#',
      '#########',
    ],
    legend: {
      c: { name: 'the long red service counter and stools', solid: true },
      q: { name: 'the diner signs and framed drinks posters', solid: false },
      j: { name: 'the illuminated jukebox', solid: true },
      t: { name: 'the small diner tables', solid: true },
      s: { name: 'the red upholstered booths', solid: false },
    },
  },
  {
    id: 'sodabar',
    name: 'Soda Bar',
    side: 'rock',
    tilt: 0,
    connects: ['maindiner'],
    description:
      'Pink walls, turquoise booths and a broad soda counter preserve a brighter '
      + 'version of the diner, used for drinks, small meals and late conversations.',
    note: 'The neon word still glows even though the letters no longer switch off separately.',
    grid: [
      '########',
      '#q....m#',
      '#ss..cc#',
      '+....cc#',
      '#ss..cc#',
      '#...sss#',
      '#t.....#',
      '########',
    ],
    legend: {
      q: { name: 'the neon sign, clocks and wall records', solid: false },
      m: { name: 'the soda and milkshake machines', solid: true },
      s: { name: 'the turquoise and pink booth seats', solid: false },
      c: { name: 'the broad grey soda counter', solid: true },
      t: { name: 'the small café tables', solid: true },
    },
  },
  {
    id: 'stalls',
    name: 'The Stalls',
    side: 'rock',
    tilt: 0,
    connects: ['well', 'washroom'],
    description:
      "Three toilet cubicles cut beside the water works, with two small basins and "
      + "the habitat's cleaning cart parked in the only corner where it does not block "
      + "an opening. It is cleaner than anyone expected it to remain.",
    note:
      'The middle cubicle never acquired a door, so a curtain hangs from a pipe.',
    grid: [
      '##+##',
      '#bbb#',
      '#bbb#',
      '#...#',
      '#s.c#',
      '##+##',
    ],
    legend: {
      b: { name: 'the three toilet cubicles', solid: true },
      s: { name: 'the pair of hand basins', solid: true },
      c: { name: 'the yellow cleaning cart', solid: false },
    },
  },
  {
    id: 'washroom',
    name: 'The Washroom',
    side: 'rock',
    tilt: 0,
    connects: ['stalls'],
    description:
      "The smaller washroom holds a cubicle, an exposed toilet, a urinal, basins and "
      + "a mirror. Old office partitions divide its two halves.",
    note:
      'Somebody cleans the mirror every watch and nobody admits it is them.',
    grid: [
      '##+###',
      '#u.t.#',
      '#s.b.#',
      '#....#',
      '#...c#',
      '##+###',
    ],
    legend: {
      u: { name: 'the wall-mounted urinal', solid: true },
      t: { name: 'the exposed toilet', solid: true },
      s: { name: 'the basin and mirror', solid: true },
      b: { name: 'the enclosed toilet cubicle', solid: true },
      c: { name: 'a narrow waste bin beside the exit', solid: true },
    },
  },
  {
    id: 'row',
    name: 'The Row',
    side: 'rock',
    tilt: 0,
    connects: ['common', 'well', 'face', 'dig1', 'dig2', 'dig3', 'dig4', 'dig5', 'dig6'],
    description:
      'Six front doors facing each other across three metres of cut rock. '
      + 'Everyone sees who goes into whose, and going home means having crossed the '
      + 'Common first. It is the only corridor in the warren that anybody has '
      + 'decorated.',
    note:
      'Three more diggings were begun and are not lived in. Nobody talks about '
      + 'whose they were going to be.',
    grid: [
      '####+########+#######+###',
      '+=n=====================#',
      '#=======================+',
      '+=====================s=#',
      '###+#######+#######+#####',
    ],
    legend: {
      n: { name: 'names scratched into the rock beside each door', solid: false },
      s: { name: 'the drift of things left outside doors', solid: false },
    },
  },
  {
    id: 'games',
    name: 'The Games Room',
    side: 'rock',
    tilt: 0,
    connects: ['common'],
    description:
      "A television and a worn armchair mark the turn between the Common and the "
      + "Row. It was first cut as another digging, then everybody kept drifting into "
      + "it with cards, controllers and whatever could be repaired into a game.",
    note:
      'Nobody booked it or claimed it. The room became shared because the first '
      + 'person to fall asleep on the sofa woke up covered by somebody else\'s coat.',
    grid: [
      '###+###',
      '#...v.#',
      '#k..v.#',
      '#.....#',
      '#.ss..#',
      '#.ss.k#',
      '#..q..#',
      '#######',
    ],
    legend: {
      v: { name: 'the repaired television and its borrowed speakers', solid: true },
      s: { name: 'the sofa everybody insists is still good', solid: true },
      k: { name: 'cabinets full of cards, cables and unfinished games', solid: true },
      q: { name: 'the controller with the reliable left trigger', solid: false },
    },
  },
  {
    id: 'dig1',
    name: 'The Joined Rooms',
    side: 'rock',
    tilt: 0,
    connects: ['row'],
    description:
      "Six people helped dig this home. Its connected spaces share a gap instead of "
      + "a door. Mara Osei, Tomás Iriarte and Vero Castel live here; Vero did not "
      + "choose to be here.",
    note:
      'Vero lost her own digging to the rock and moved in with the woman who has '
      + 'mothered her since she was nine. She has not said what that costs her.',
    // Three people sleep here, so there are three places to sleep. The partition
    // runs two courses down from the back wall and stops, which leaves the whole
    // front of the room as one shared space you come into — the arrangement the
    // makeshift references use, and the fix for a neck that used to sit right on
    // top of the door. The bite out of the south-west corner is this room's own
    // shape; no two diggings have the same one.
    grid: [
      '#########',
      '#b.b|b..#',
      '#b.b|b..#',
      '#...|...#',
      '#k.....k#',
      '##.....q#',
      '####+####',
    ],
    legend: {
      q: { name: 'a chair somebody brought and left', solid: false },
      b: { name: 'one of three places to sleep — a bed, a mattress and a couch', solid: true },
      k: { name: 'crates doing the work of furniture', solid: true },
    },
  },
  {
    id: 'dig2',
    name: 'The Unfinished Rooms',
    side: 'rock',
    tilt: 0,
    connects: ['row'],
    description:
      "Unfinished, because Quim Bassols keeps stopping to work on other people's. "
      + "Furniture and stores still compete for space in the second chamber. Wen "
      + "Jiaming and Lior Ben-Ari share this home with him.",
    note:
      'It has been three weeks from finished for eleven weeks.',
    grid: [
      '#######',
      '#b.|b.#',
      '#b.|b.#',
      '#..|.q#',
      '#k...b#',
      '##...b#',
      '###+###',
    ],
    legend: {
      q: { name: 'a tool left mid-job, for the ninth time', solid: false },
      b: { name: 'one of three places to sleep, and none of them finished', solid: true },
      k: { name: 'crates doing the work of furniture', solid: true },
    },
  },
  {
    id: 'dig3',
    name: 'The Near Rooms',
    side: 'rock',
    tilt: 0,
    connects: ['row'],
    description:
      "Nearest the Common, which was not an accident: Pilar Ocaña cooks, and she "
      + "wanted the short walk. Kes Amankwah and Juno Petrakis share this home with "
      + "her, in an arrangement neither of them has named. Bunks and stores line the "
      + "narrow room.",
    note:
      'You can hear the Common from inside it. Everybody knows this and comes '
      + 'anyway.',
    grid: [
      '#######',
      '#bbkkk#',
      '#bbkkk#',
      '#bb.kk#',
      '#k....#',
      '#k.q.##',
      '###+###',
    ],
    legend: {
      q: { name: 'the cup and spill in the middle of the clear aisle', solid: false },
      b: { name: 'the stacked bunks, packed against the left wall', solid: true },
      k: { name: 'stores, lockers and cupboards around the room\'s edge', solid: true },
    },
  },
  {
    id: 'dig4',
    name: 'The Square Room',
    side: 'rock',
    tilt: 0,
    connects: ['row'],
    description:
      "Finished with a care that took Xan Moreira eleven weeks. Sten Malm sleeps "
      + "here too, at seventy-eight. The bed, table and small wash corner fit around "
      + "shelves and a tree kept under coloured lights.",
    note:
      'Sten taught Xan to swim forty-eight years ago. Xan is sixty and still '
      + 'defers to him, and Sten has never found a way to say that he would rather '
      + 'he did not.',
    grid: [
      '###+###',
      '#q..kk#',
      '#b..kk#',
      '#b.T.k#',
      '#..T..#',
      '#.....#',
      '#.....#',
      '#######',
    ],
    legend: {
      q: { name: 'the Christmas tree and coloured lights, kept up all year', solid: false },
      b: { name: 'the bed beside the tree', solid: true },
      k: { name: 'shelves of tins and the tiny wash corner', solid: true },
      T: { name: 'a table laid for whoever is awake', solid: true },
    },
  },
  {
    id: 'dig5',
    name: 'The Far Room',
    side: 'rock',
    tilt: 0,
    connects: ['row'],
    description:
      'Cut as far along the Row from the ship as the rock allowed. Ulla Nyholm '
      + 'dug it in five weeks and nobody asked her why she was in a hurry. Ama '
      + 'Oyelaran moved in on the ninetieth day.',
    note:
      'Ama and Ulla were at school together. It is the only bond in their cluster '
      + 'with nothing wrong with it, and Ulla has needed it since the Dock list '
      + 'went up.',
    grid: [
      '###+###',
      '#bb...#',
      '#bb..k#',
      '#.....#',
      '#k...k#',
      '#q....#',
      '#....##',
      '#######',
    ],
    legend: {
      q: { name: 'two cups, and only one of them used', solid: false },
      b: { name: 'two plain sleeping places below the rust-coloured wall', solid: true },
      k: { name: 'mustard lockers made from mismatched panels', solid: true },
    },
  },
  {
    id: 'dig6',
    name: 'The Small Room',
    side: 'rock',
    tilt: 0,
    connects: ['row'],
    description:
      "Yara Haddad dug this home alone. She and Noor Rahimi share it. The "
      + "furnishings are sparse, with bedding and a few lockers around an open floor.",
    note:
      'The marks on the back wall are the same hand as the ones on the side '
      + 'gallery at the Face. Nobody has put the two together.',
    grid: [
      '###+###',
      '#bb..##',
      '#bb..k#',
      '#...bb#',
      '#...bb#',
      '#..q.k#',
      '##....#',
      '#######',
    ],
    legend: {
      q: { name: 'two cups left together in the otherwise empty centre', solid: false },
      b: { name: 'two simple beds, turned away from one another', solid: true },
      k: { name: 'the few lockers and drawers the room needs', solid: true },
    },
  },
  {
    id: 'workshops',
    name: 'The Workshops',
    side: 'rock',
    tilt: 0,
    connects: ['common', 'infirmary', 'well', 'maintenance'],
    description:
      'Bays, divided by whoever got there first. The economy and the failing '
      + 'reactor share this room. There is one fabricator, one allocation panel '
      + 'and a queue for both power and bench time. Everybody can see that no '
      + 'procedure is enough for either.',
    note:
      'Juno holds the reactor key because she woke beside it. Wen knows more about '
      + 'the wiring and has never once used that fact against her.',
    grid: [
      '#########',
      '+..|...|+',
      '#t.|.f.|#',
      '#..|...|#',
      '#=======#',
      '+..|..t|#',
      '#h.|..q|+',
      '#..|...|#',
      '####+####',
    ],
    legend: {
      t: { name: 'tools, each set marked with an owner\'s mark', solid: false },
      f: { name: 'the fabricator and reactor allocation panel', solid: true },
      q: { name: 'the combined bench and power queue board', solid: false },
      h: { name: 'the scrap heap - hull offcuts, sorted by Lior', solid: true },
    },
  },
  {
    id: 'well',
    name: 'The Well',
    side: 'rock',
    tilt: 0,
    connects: ['row', 'workshops', 'stalls'],
    description:
      "Water reclamation and air scrubbing. Basins, toilets and cleaning supplies "
      + "occupy the lowest room, where water runs downhill. It is the ugliest work in "
      + "the habitat, and everybody's life depends on it. Osvald Berg does it without "
      + "complaint and without letting anybody forget.",
    note:
      'Eleven spare filters. When they are gone there is no more air scrubbing '
      + 'and nobody has worked out what happens then.',
    grid: [
      '###+###',
      '+T...T+',
      '#T.p.T#',
      '#..:..#',
      '#f.f.f#',
      '#~~~~~+',
      '#######',
    ],
    legend: {
      'T': { name: 'a tank', solid: true },
      p: { name: 'the pump', solid: true },
      f: { name: 'filter housings - the filters are consumable', solid: true },
    },
  },
  {
    id: 'face',
    name: 'The Face',
    side: 'rock',
    tilt: 0,
    connects: ['row'],
    description:
      "The approach to the unfinished cut. Corrugated plate, sandbags and tools mark "
      + "the entrance; the work continues beyond the frontage. People come here to "
      + "claim space and to be somewhere nobody is.",
    note:
      'A side gallery has broken into a natural hollow nobody has measured. It '
      + 'remains beyond the mapped boundary: a fact in the diary, not a room on '
      + 'the plan. Yara\'s marks are the only sign anybody has approached it.',
    grid: [
      '######+',
      '+..t..#',
      '#.m...#',
      '#y==.,#',
      '###+###',
    ],
    legend: {
      t: { name: 'the tools, left at the face', solid: false },
      m: { name: 'progress marks, cut weekly', solid: false },
      y: { name: 'marks in the rock on a side gallery, three weeks old, unsigned', solid: false },
    },
  },
];

export const ROOM_BY_ID = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
) as Record<RoomId, Room>;

export function roomObjects(id: RoomId): Placed[] {
  const room = ROOM_BY_ID[id];
  return placedObjects(room.grid, room.legend);
}

export function doorsOf(room: Room): Point[] {
  const out: Point[] = [];
  room.grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '+' || ch === 'X') out.push({ x, y });
    });
  });
  return out;
}

export function neighbours(id: RoomId): readonly RoomId[] {
  return ROOM_BY_ID[id].connects;
}
