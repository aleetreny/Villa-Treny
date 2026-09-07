// What the inside of a room looks like.
//
// Sixty-five objects do not need sixty-five sprites. They need fifteen shapes and
// a name: the shape says how much space a thing takes and how it catches light,
// and the legend says what it actually is. A crate and a seed store are the same
// box; one of them is the last eleven varieties anybody will ever grow.
//
// The mapping is authored rather than guessed from the name, because guessing
// would quietly get one wrong and nobody would notice. tiles.test.ts checks that
// every object in every room has been given a shape.
//
// Colour is warm inside and cold in the hull, which is the same distinction the
// cutaway draws in hairlines: what was inherited against what was made by hand.

import { ROOMS, type RoomId, type Side } from './rooms';

export type Shape =
  /** A box. Crates, lockers, stores, somebody's things. */
  | 'crate'
  /** Somewhere to lie down. */
  | 'bunk'
  /** Wall-mounted, lit or dead. Consoles, boards, notices. */
  | 'panel'
  /** A flat surface on legs. Tables, trays, beds, the slab. */
  | 'table'
  /** A vessel. */
  | 'tank'
  /** Apparatus with a vent and a hum. */
  | 'machine'
  /** A vertical frame holding things. */
  | 'rack'
  /** Something alive. */
  | 'plant'
  /** Somewhere to sit. */
  | 'seat'
  /** Something put on a surface: a pinned sheet, tape, a nameplate, a drawing. */
  | 'mark'
  /** A dressed face of rock or plate with nothing on it. */
  | 'surface'
  /** A capsule with somebody asleep in it. */
  | 'berth'
  /** The same, with a strip of tape on the glass and a name somebody invented. */
  | 'berth-named'
  /** An irregular heap. */
  | 'pile'
  /** A light. */
  | 'lamp'
  /** A hole in the hull with the outside on the other side of it. */
  | 'port'
  /** Somebody lives here: a warm point in a cell they dug themselves. */
  | 'home';

/** Every object glyph, per room, and the shape it takes. */
export const SHAPES: Record<RoomId, Record<string, Shape>> = {
  bridge: { w: 'port', p: 'seat', s: 'mark', t: 'panel', u: 'panel', b: 'seat' },
  dock: { 1: 'rack', 2: 'rack', 3: 'rack', r: 'machine', l: 'mark', k: 'crate' },
  longwalk: { l: 'lamp', p: 'pile' },
  cabin1: { m: 'bunk', d: 'pile', e: 'crate' },
  cabin2: { m: 'bunk', d: 'pile', s: 'pile' },
  cabin3: { m: 'bunk', d: 'pile', p: 'mark' },
  cabin4: { m: 'bunk', d: 'pile', r: 'rack' },
  cabin5: { m: 'bunk', d: 'pile', k: 'crate' },
  breach: { n: 'mark', c: 'crate', p: 'pile', s: 'pile' },
  hold: { o: 'crate', u: 'crate', v: 'panel' },
  infirmary: { b: 'bunk', c: 'seat', k: 'rack', z: 'table' },
  common: { k: 'machine', s: 'machine', T: 'table', b: 'seat', P: 'mark' },
  administration: { d: 'table', f: 'crate', q: 'mark', p: 'plant' },
  dispatch: { d: 'table', f: 'crate', q: 'panel', p: 'plant' },
  archive: { c: 'table', b: 'rack', s: 'seat', r: 'pile', p: 'plant' },
  records: { d: 'table', b: 'rack', f: 'crate', w: 'tank', q: 'mark' },
  maintenance: { d: 'table', f: 'crate', r: 'rack', t: 'table', p: 'plant', s: 'crate' },
  kitchen: { v: 'machine', o: 'rack', t: 'table', s: 'rack', m: 'machine', w: 'tank' },
  stalls: { b: 'machine', s: 'tank', c: 'machine' },
  washroom: { u: 'machine', t: 'machine', s: 'tank', b: 'machine', c: 'crate' },
  camp: { t: 'bunk', c: 'seat', f: 'pile', s: 'crate', p: 'plant' },
  garden: { d: 'tank', r: 'plant', p: 'plant', b: 'mark', s: 'plant' },
  sheltergate: { v: 'machine', w: 'mark', b: 'pile', r: 'tank' },
  yard: { h: 'rack', t: 'pile', d: 'tank', c: 'crate', s: 'crate' },
  study: { d: 'table', p: 'plant', r: 'mark', c: 'seat', l: 'lamp' },
  sparebedroom: { n: 'table', b: 'bunk', r: 'mark', c: 'seat', p: 'plant' },
  parlour: { p: 'plant', s: 'seat', d: 'crate', t: 'table', c: 'seat' },
  projection: { f: 'machine', b: 'rack', q: 'seat', r: 'mark', p: 'plant' },
  winter: { d: 'crate', t: 'table', s: 'seat', x: 'plant', r: 'mark', p: 'crate' },
  library: { b: 'rack', q: 'panel', d: 'table', s: 'seat', r: 'mark', t: 'table', g: 'machine' },
  grandbedroom: { q: 'mark', b: 'bunk', n: 'table', r: 'mark', t: 'table', l: 'lamp' },
  salon: { b: 'rack', q: 'mark', s: 'seat', d: 'table', t: 'table', c: 'seat', r: 'mark', l: 'lamp' },
  hearth: { b: 'rack', f: 'machine', c: 'seat', t: 'table', r: 'mark', l: 'lamp' },
  servicecounter: { q: 'panel', m: 'machine', c: 'table', s: 'seat', t: 'table' },
  maindiner: { c: 'table', q: 'mark', j: 'machine', t: 'table', s: 'seat' },
  sodabar: { q: 'panel', m: 'machine', s: 'seat', c: 'table', t: 'table' },
  graveyard: { t: 'plant', f: 'rack', g: 'mark', s: 'pile', h: 'pile' },
  row: { n: 'mark', s: 'pile' },
  games: { v: 'panel', s: 'seat', k: 'crate', q: 'mark' },
  dig1: { b: 'bunk', k: 'crate', q: 'seat' },
  dig2: { b: 'bunk', k: 'crate', q: 'pile' },
  dig3: { b: 'bunk', k: 'crate', q: 'machine' },
  dig4: { b: 'bunk', k: 'crate', q: 'plant', T: 'table' },
  dig5: { b: 'bunk', k: 'crate', q: 'crate' },
  dig6: { b: 'bunk', k: 'crate', q: 'mark' },
  workshops: { t: 'rack', f: 'machine', q: 'panel', h: 'pile' },
  well: { T: 'tank', p: 'machine', f: 'rack' },
  face: { t: 'pile', m: 'mark', y: 'mark' },
};

export function shapeOf(room: RoomId, glyph: string): Shape | null {
  return SHAPES[room][glyph] ?? null;
}

export type Palette = {
  /** The rock or plate the room is cut into. */
  solid: string;
  solidEdge: string;
  /** Air, which is not nothing: it is the dark of the room. */
  air: string;
  /** The far wall. In a cutaway there is no empty air where a room is — there is
   *  the surface on the other side of it. */
  back: string;
  backGrain: string;
  /** What is underfoot. */
  floor: string;
  floorEdge: string;
  /** Light in this room, and what it warms. */
  light: string;
  glow: string;
  /** Objects, before their own tint. */
  matter: string;
  matterEdge: string;
};

/** The hull is cold and was inherited. The rock is warm and was made by hand. */
export const PALETTE: Record<Side, Palette> = {
  hull: {
    solid: '#4a5568',
    solidEdge: '#68768c',
    air: '#1b2330',
    back: '#3a465e',
    backGrain: '#4e5d78',
    // Decks are pale, the way a floor you have to keep clean is pale. This is
    // most of the light in a hull room and the reason the furniture on it reads.
    floor: '#8d9aab',
    floorEdge: '#b0bcca',
    light: '#ffe3a8',
    glow: 'rgba(255, 216, 142, 0.17)',
    matter: '#7b8799',
    matterEdge: '#a0aec0',
  },
  rock: {
    solid: '#5e4b38',
    solidEdge: '#7f664a',
    air: '#241d17',
    back: '#4b3b2d',
    backGrain: '#65523d',
    floor: '#8b7459',
    floorEdge: '#a88f6e',
    light: '#ffd18a',
    glow: 'rgba(255, 198, 122, 0.19)',
    matter: '#8b6d49',
    matterEdge: '#af8c60',
  },
  surface: {
    solid: '#78531b',
    solidEdge: '#a8834b',
    air: '#2b2117',
    back: '#8c672f',
    backGrain: '#a8834b',
    floor: '#a8834b',
    floorEdge: '#c29a62',
    light: '#f2d08a',
    glow: 'rgba(242, 208, 138, 0.16)',
    matter: '#80633f',
    matterEdge: '#b28a55',
  },
};

/** A resident's own two colours, so twenty-five figures a few pixels tall are
 *  still twenty-five people. Derived from the initial, so they never drift. */
export function personColours(id: string): { body: string; head: string } {
  const i = id.charCodeAt(0) - 65;
  const hue = (i * 137.508) % 360;
  return {
    body: `hsl(${hue.toFixed(0)} 46% 52%)`,
    head: `hsl(${((hue + 18) % 360).toFixed(0)} 34% 74%)`,
  };
}

/** Rooms whose objects should be tinted away from the room's own matter colour,
 *  because the thing is not made of the same stuff as everything else. */
export const ACCENTS: Partial<Record<Shape, string>> = {
  plant: '#7bbf5a',
  lamp: '#ffe9b0',
  berth: '#6fa8c8',
  'berth-named': '#6fa8c8',
  port: '#0a1020',
  home: '#ffb765',
  mark: '#c9d6e4',
};

/** Sanity for the authoring: how many objects have been given a shape. */
export function shapedCount(): number {
  return ROOMS.reduce((n, r) => n + Object.keys(SHAPES[r.id]).length, 0);
}
