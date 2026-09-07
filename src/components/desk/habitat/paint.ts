// The brush.
//
// Every pixel in the habitat is drawn here, at whatever tile size it is asked
// for, so the map and a room interior are the same world at two magnifications
// rather than two pictures somebody has to keep in agreement. Change how a bunk
// looks and it changes in both.
//
// Nothing is loaded: there are no sprite sheets and no images. It is all
// rectangles, which is what keeps it crisp at any scale and free to ship.

import { PALETTE, ACCENTS, personColours, type Shape } from '../../../lib/habitat/tiles';

export type Ctx = CanvasRenderingContext2D;
export type Pal = typeof PALETTE.hull;

/** A block of colour, snapped to whole device pixels so nothing is ever half a
 *  colour and no edge is ever soft. */
export function px(c: Ctx, x: number, y: number, w: number, h: number, fill: string) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  c.fillStyle = fill;
  c.fillRect(x0, y0, Math.max(1, Math.round(x + w) - x0), Math.max(1, Math.round(y + h) - y0));
}

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${cl(((n >> 16) & 255) * amount)} ${cl(((n >> 8) & 255) * amount)} ${cl((n & 255) * amount)})`;
}

/** A hash that is stable for a tile, so stone speckle never crawls or shimmers. */
export function tileNoise(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Speckle. The single cheapest thing that stops a flat fill reading as plastic. */
export function grain(c: Ctx, x: number, y: number, t: number, seed: number, tint: string) {
  const d = Math.max(1, Math.round(t / 12));
  c.fillStyle = tint;
  if (seed % 7 === 0) c.fillRect(Math.round(x + t * 0.18), Math.round(y + t * 0.26), d, d);
  if (seed % 5 === 1) c.fillRect(Math.round(x + t * 0.62), Math.round(y + t * 0.68), d, d);
  if (seed % 11 === 2) c.fillRect(Math.round(x + t * 0.78), Math.round(y + t * 0.16), d, d);
  if (seed % 9 === 3) c.fillRect(Math.round(x + t * 0.34), Math.round(y + t * 0.82), d, d);
}

/** The far wall of a room. In a cutaway there is no empty air where a room is —
 *  there is the surface on the other side of it, receding as it rises. */
export function backWall(c: Ctx, x: number, y: number, t: number, pal: Pal, seed: number, depth: number, row: number) {
  px(c, x, y, t, t, pal.back);
  c.globalAlpha = 0.14 + depth * 0.46;
  px(c, x, y, t, t, pal.air);
  c.globalAlpha = 1;
  grain(c, x, y, t, seed, pal.backGrain);
  if (row % 3 === 0) {
    c.globalAlpha = 0.3;
    px(c, x, y, t, Math.max(1, t / 14), pal.backGrain);
    c.globalAlpha = 1;
  }
}

export function drawTerrain(
  c: Ctx, ch: string, x: number, y: number, t: number, pal: Pal,
  seed: number, depth: number, row: number,
) {
  const u = t / 12;
  switch (ch) {
    case '#':
    case '|':
      px(c, x, y, t, t, pal.solid);
      grain(c, x, y, t, seed, pal.solidEdge);
      px(c, x, y, t, Math.max(1, u), pal.solidEdge);
      break;
    case '=':
      px(c, x, y, t, t, pal.floor);
      px(c, x, y, t, 2 * u, pal.floorEdge);
      px(c, x, y + 2 * u, t, u, pal.solid);
      grain(c, x, y, t, seed, pal.solid);
      break;
    case '.':
      backWall(c, x, y, t, pal, seed, depth, row);
      break;
    case '+':
      backWall(c, x, y, t, pal, seed, depth, row);
      px(c, x, y, 2 * u, t, pal.floorEdge);
      px(c, x + t - 2 * u, y, 2 * u, t, pal.floorEdge);
      break;
    case 'X':
      px(c, x, y, t, t, pal.solid);
      px(c, x + u, y + u, t - 2 * u, t - 2 * u, pal.matter);
      px(c, x + 4 * u, y + 4 * u, 4 * u, 4 * u, pal.matterEdge);
      px(c, x + 5 * u, y + 5 * u, 2 * u, 2 * u, pal.matter);
      break;
    case '^':
    case 'v':
      backWall(c, x, y, t, pal, seed, depth, row);
      px(c, x + 2 * u, y, 2 * u, t, pal.matterEdge);
      px(c, x + t - 4 * u, y, 2 * u, t, pal.matterEdge);
      px(c, x + 2 * u, y + 5 * u, t - 6 * u, 2 * u, pal.matterEdge);
      break;
    case '~':
      px(c, x, y, t, t, '#12303a');
      px(c, x, y + ((seed % 3) + 2) * u, t, u, '#2f7286');
      px(c, x + (seed % 5) * u, y + 7 * u, 2 * u, u, '#3d8ba1');
      break;
    case ':':
      backWall(c, x, y, t, pal, seed, depth, row);
      for (let i = 1; i < 12; i += 3) px(c, x + i * u, y, u, t, pal.matterEdge);
      break;
    case ',':
      backWall(c, x, y, t, pal, seed, depth, row);
      px(c, x, y + 6 * u, t, 6 * u, pal.solid);
      grain(c, x, y + 6 * u, t, seed, pal.solidEdge);
      break;
    case '"':
      backWall(c, x, y, t, pal, seed, depth, row);
      px(c, x + 2 * u, y + 4 * u, 2 * u, 8 * u, '#4e7d3a');
      px(c, x + 6 * u, y + 2 * u, 2 * u, 10 * u, '#69a84c');
      px(c, x + 9 * u, y + 6 * u, 2 * u, 6 * u, '#4e7d3a');
      break;
    case '*':
      px(c, x, y, t, t, '#01010a');
      if (seed % 9 === 3) px(c, x + 5 * u, y + 4 * u, u, u, '#9fb4d4');
      break;
    default:
      backWall(c, x, y, t, pal, seed, depth, row);
  }
}

/** Below this many pixels a tile cannot hold a drawn object, only a read one.
 *  A crate rendered with its slats at seven pixels is four grey smudges; the same
 *  crate as three values of one block is unmistakably a crate. */
const COARSE = 11;

/** The same fifteen shapes, told in three or four blocks instead of ten.
 *
 *  This is the whole-habitat view: what has to survive is the silhouette and
 *  which way the light falls, and detail below the size of the eye's own
 *  resolution only turns into noise. */
function drawShapeCoarse(c: Ctx, shape: Shape, x: number, y: number, t: number, pal: Pal) {
  const body = ACCENTS[shape] ?? pal.matter;
  const top = ACCENTS[shape] ? shade(ACCENTS[shape]!, 1.3) : pal.matterEdge;
  const low = shade(pal.matter, 0.55);
  const q = t / 4;
  switch (shape) {
    case 'crate':
    case 'machine':
      px(c, x + q * 0.4, y + q, t - q * 0.8, t - q, body);
      px(c, x + q * 0.4, y + q, t - q * 0.8, q * 0.7, top);
      break;
    case 'bunk':
      px(c, x, y + q * 2.2, t, q * 1.8, body);
      px(c, x, y + q * 2.2, t, q * 0.6, top);
      px(c, x + q * 0.3, y + q * 1.6, q * 1.2, q * 0.7, '#c3ccda');
      break;
    case 'panel':
      px(c, x + q * 0.4, y + q * 0.4, t - q * 0.8, q * 2.2, '#111a24');
      px(c, x + q, y + q, q * 0.8, q * 0.5, pal.light);
      break;
    case 'table':
      px(c, x, y + q * 1.8, t, q * 0.9, top);
      px(c, x + q * 0.5, y + q * 2.7, q * 0.7, q * 1.3, low);
      px(c, x + t - q * 1.2, y + q * 2.7, q * 0.7, q * 1.3, low);
      break;
    case 'tank':
      px(c, x + q * 0.8, y + q * 0.3, t - q * 1.6, t - q * 0.3, body);
      px(c, x + q * 0.8, y + q * 0.3, t - q * 1.6, q * 0.7, top);
      break;
    case 'rack':
      px(c, x + q * 0.4, y, q * 0.7, t, top);
      px(c, x + t - q * 1.1, y, q * 0.7, t, top);
      px(c, x + q, y + q * 0.7, t - q * 2, q * 0.9, body);
      px(c, x + q, y + q * 2.4, t - q * 2, q * 0.9, body);
      break;
    case 'plant':
      px(c, x + q * 1.3, y + q * 2.6, q * 1.4, q * 1.4, '#6a4a28');
      px(c, x + q * 0.5, y + q * 0.8, t - q, q * 2, body);
      px(c, x + q * 1.3, y + q * 0.2, q * 1.6, q * 0.9, shade('#7bbf5a', 1.25));
      break;
    case 'seat':
      px(c, x + q * 0.7, y + q * 2.3, t - q * 1.4, q * 1.1, body);
      px(c, x + q * 0.7, y + q * 3.2, t - q * 1.4, q * 0.8, low);
      break;
    case 'mark':
      px(c, x + q * 0.6, y + q, t - q * 1.2, q * 0.5, body);
      px(c, x + q, y + q * 2.1, t - q * 2.2, q * 0.4, body);
      break;
    case 'berth':
      px(c, x + q * 0.3, y + q * 0.3, t - q * 0.6, t - q * 0.6, shade('#6fa8c8', 0.5));
      px(c, x + q, y + q * 1.2, t - q * 2, q * 1.2, '#cdeefc');
      break;
    case 'pile':
      px(c, x + q * 0.3, y + q * 2.5, t - q * 0.6, q * 1.5, body);
      px(c, x + q * 1.2, y + q * 1.6, t - q * 2.4, q * 0.9, top);
      break;
    case 'lamp':
      px(c, x + q * 0.3, y, t - q * 0.6, q, '#8d97a8');
      px(c, x + q * 0.7, y + q, t - q * 1.4, q * 0.6, '#fff4d0');
      break;
    case 'port':
      px(c, x + q * 0.3, y + q * 0.3, t - q * 0.6, t - q * 0.6, '#6b7a92');
      px(c, x + q, y + q, t - q * 2, t - q * 2, '#04070f');
      break;
    case 'home':
      px(c, x + q * 0.7, y + q * 1.6, t - q * 1.4, q * 2.4, '#2e2117');
      px(c, x + q * 1.5, y + q * 2.3, q * 1.2, q * 1.1, '#ffb765');
      break;
  }
}

/** The fifteen shapes every object in the habitat takes. */
export function drawShape(c: Ctx, shape: Shape, x: number, y: number, t: number, pal: Pal, seed = 0) {
  if (t < COARSE) { drawShapeCoarse(c, shape, x, y, t, pal); return; }
  const u = t / 12;
  const body = ACCENTS[shape] ?? pal.matter;
  const edge = ACCENTS[shape] ? shade(ACCENTS[shape]!, 1.25) : pal.matterEdge;
  const dark = shade(typeof body === 'string' && body.startsWith('#') ? body : pal.matter, 0.6);
  switch (shape) {
    case 'crate':
      px(c, x + u, y + 3 * u, t - 2 * u, t - 3 * u, body);
      px(c, x + u, y + 3 * u, t - 2 * u, u, edge);
      px(c, x + u, y + 7 * u, t - 2 * u, u, dark);
      px(c, x + 2 * u, y + 4 * u, 2 * u, 2 * u, dark);
      break;
    case 'bunk':
      px(c, x, y + 7 * u, t, 5 * u, body);
      px(c, x, y + 6 * u, t, u, edge);
      px(c, x + u, y + 4 * u, 4 * u, 2 * u, '#c3ccda');
      px(c, x + 5 * u, y + 7 * u, 6 * u, 2 * u, shade('#4a5468', 1));
      break;
    case 'panel':
      px(c, x + u, y + u, t - 2 * u, 7 * u, '#0d141d');
      px(c, x + u, y + u, t - 2 * u, u, edge);
      px(c, x + 3 * u, y + 3 * u, 2 * u, u, pal.light);
      px(c, x + 6 * u, y + 3 * u, u, u, '#ff8a5c');
      px(c, x + 3 * u, y + 5 * u, 5 * u, u, shade(pal.light, 0.7));
      break;
    case 'table':
      px(c, x, y + 5 * u, t, 2 * u, edge);
      px(c, x, y + 7 * u, t, u, dark);
      px(c, x + u, y + 8 * u, 2 * u, 4 * u, body);
      px(c, x + t - 3 * u, y + 8 * u, 2 * u, 4 * u, body);
      break;
    case 'tank':
      px(c, x + 2 * u, y + u, t - 4 * u, t - u, body);
      px(c, x + 2 * u, y + u, t - 4 * u, 2 * u, edge);
      px(c, x + 3 * u, y + 4 * u, u, 6 * u, dark);
      px(c, x + 7 * u, y + 3 * u, u, u, '#6fd4e8');
      break;
    case 'machine':
      px(c, x + u, y + 2 * u, t - 2 * u, t - 2 * u, body);
      px(c, x + u, y + 2 * u, t - 2 * u, u, edge);
      for (let i = 0; i < 3; i += 1) px(c, x + 3 * u, y + (5 + i * 2) * u, t - 6 * u, u, dark);
      px(c, x + 2 * u, y + 3 * u, u, u, '#ffbe5c');
      break;
    case 'rack':
      px(c, x + u, y, 2 * u, t, edge);
      px(c, x + t - 3 * u, y, 2 * u, t, edge);
      px(c, x + 3 * u, y + 2 * u, t - 6 * u, 3 * u, body);
      px(c, x + 3 * u, y + 7 * u, t - 6 * u, 3 * u, body);
      px(c, x + 4 * u, y + 3 * u, 2 * u, u, dark);
      break;
    case 'plant':
      px(c, x + 4 * u, y + 8 * u, 4 * u, 4 * u, '#6a4a28');
      px(c, x + 3 * u, y + 7 * u, 6 * u, u, '#83603a');
      px(c, x + 2 * u, y + 3 * u, 8 * u, 4 * u, body);
      px(c, x + 4 * u, y + u, 4 * u, 3 * u, shade('#7bbf5a', 1.2));
      px(c, x + u, y + 5 * u, 2 * u, 2 * u, shade('#7bbf5a', 0.8));
      break;
    case 'seat':
      px(c, x + 2 * u, y + 7 * u, t - 4 * u, 2 * u, body);
      px(c, x + 2 * u, y + 9 * u, 2 * u, 3 * u, edge);
      px(c, x + t - 4 * u, y + 9 * u, 2 * u, 3 * u, edge);
      px(c, x + 2 * u, y + 4 * u, u, 3 * u, edge);
      break;
    case 'mark':
      px(c, x + 2 * u, y + 3 * u, t - 4 * u, u, body);
      px(c, x + 3 * u, y + 6 * u, t - 7 * u, u, body);
      if (seed % 3 === 0) px(c, x + 4 * u, y + 8 * u, 3 * u, u, body);
      break;
    case 'berth':
      px(c, x + u, y + u, t - 2 * u, t - 2 * u, '#141f2b');
      px(c, x + 2 * u, y + 2 * u, t - 4 * u, t - 4 * u, body);
      px(c, x + 3 * u, y + 4 * u, t - 6 * u, 3 * u, '#c9ecfa');
      px(c, x + 3 * u, y + 9 * u, 2 * u, u, '#5cd98a');
      break;
    case 'pile':
      px(c, x + u, y + 8 * u, t - 2 * u, 4 * u, body);
      px(c, x + 3 * u, y + 6 * u, t - 7 * u, 2 * u, body);
      px(c, x + 5 * u, y + 4 * u, 3 * u, 2 * u, edge);
      px(c, x + 2 * u, y + 9 * u, 2 * u, u, dark);
      break;
    case 'lamp':
      px(c, x + u, y, t - 2 * u, 3 * u, shade('#8d97a8', 1));
      px(c, x + 2 * u, y + 3 * u, t - 4 * u, u, '#fff4d0');
      break;
    case 'port':
      px(c, x + u, y + u, t - 2 * u, t - 2 * u, '#5d6a80');
      px(c, x + 2 * u, y + 2 * u, t - 4 * u, t - 4 * u, '#04070f');
      px(c, x + 4 * u, y + 4 * u, u, u, '#e6f0ff');
      px(c, x + 8 * u, y + 8 * u, u, u, '#c8d8f5');
      px(c, x + u, y + 5 * u, t - 2 * u, u, '#96a1b4');
      break;
    case 'home':
      px(c, x + 2 * u, y + 5 * u, t - 4 * u, 7 * u, '#2e2117');
      px(c, x + 3 * u, y + 7 * u, t - 6 * u, 4 * u, '#5b3f24');
      px(c, x + 5 * u, y + 8 * u, 2 * u, 2 * u, '#ffb765');
      break;
  }
}

/** A person. Ten pixels of somebody, in their own two colours. */
export function drawPerson(c: Ctx, id: string, x: number, y: number, t: number, lit: boolean) {
  const { body, head } = personColours(id);
  c.globalAlpha = lit ? 1 : 0.55;
  if (t < COARSE) {
    // Twenty-five people are the point of the picture. At this size they are two
    // blocks and a rim, and they still have to be the brightest thing in a room.
    const q = t / 4;
    px(c, x + q * 1.1, y + q * 1.5, q * 1.8, q * 1.4, head);
    px(c, x + q * 0.9, y + q * 2.6, q * 2.2, q * 1.6, body);
    c.globalAlpha = 1;
    return;
  }
  const u = t / 12;
  px(c, x + 4 * u, y + 2 * u, 4 * u, 4 * u, head);
  px(c, x + 4 * u, y + 6 * u, 4 * u, 5 * u, body);
  px(c, x + 3 * u, y + 7 * u, u, 3 * u, body);
  px(c, x + 8 * u, y + 7 * u, u, 3 * u, body);
  px(c, x + 4 * u, y + 11 * u, u, u, '#16151a');
  px(c, x + 7 * u, y + 11 * u, u, u, '#16151a');
  c.globalAlpha = 1;
}

// ── dressing ────────────────────────────────────────────────────────────────
//
// The authored objects in a room's grid are the ones that mean something: the
// pinning wall, the long table, the berth with no name. There are about four of
// them per room, and four objects do not make a room — they make a diagram of
// one. Everything below is scenery: conduit, vents, notices, shelving, columns
// and the clutter that collects along a floor.
//
// It is deterministic from the tile's own coordinates, so it never shimmers, and
// it is only ever drawn on air, so it can never bury something that matters.

const WALL_KINDS = ['panel', 'vent', 'poster', 'shelf', 'cable', 'sign', 'hook'] as const;
const FLOOR_KINDS = ['barrel', 'sack', 'stool', 'bucket', 'box'] as const;

function dressWall(c: Ctx, kind: string, x: number, y: number, t: number, pal: Pal, n: number) {
  const u = t / 12;
  const coarse = t < COARSE;
  switch (kind) {
    case 'panel':
      px(c, x + 2 * u, y + 2 * u, 8 * u, 7 * u, '#111a24');
      px(c, x + 2 * u, y + 2 * u, 8 * u, u, pal.matterEdge);
      if (!coarse) {
        px(c, x + 3 * u, y + 4 * u, 2 * u, u, pal.light);
        px(c, x + 6 * u, y + 4 * u, u, u, n > 0.5 ? '#7ce8a0' : '#ff8a5c');
        px(c, x + 3 * u, y + 6 * u, 5 * u, u, 'rgba(255,255,255,0.18)');
      } else {
        px(c, x + 3 * u, y + 4 * u, 3 * u, 2 * u, pal.light);
      }
      break;
    case 'vent':
      px(c, x + 2 * u, y + 3 * u, 8 * u, 6 * u, shade(pal.matter, 0.8));
      for (let i = 0; i < 3; i += 1) {
        px(c, x + 3 * u, y + (4 + i * 2) * u, 6 * u, u, shade(pal.matter, 0.45));
      }
      break;
    case 'poster':
      px(c, x + 3 * u, y + 2 * u, 6 * u, 8 * u, n > 0.5 ? '#c9b48a' : '#8aa8b4');
      px(c, x + 3 * u, y + 2 * u, 6 * u, u, 'rgba(255,255,255,0.28)');
      if (!coarse) {
        px(c, x + 4 * u, y + 4 * u, 4 * u, u, 'rgba(20,16,12,0.55)');
        px(c, x + 4 * u, y + 6 * u, 3 * u, u, 'rgba(20,16,12,0.4)');
      }
      break;
    case 'shelf':
      px(c, x, y + 8 * u, t, 1.4 * u, pal.matterEdge);
      px(c, x + u, y + 4 * u, 2 * u, 4 * u, shade(pal.matter, 1.1));
      px(c, x + 4 * u, y + 5 * u, 2 * u, 3 * u, n > 0.5 ? '#7bbf5a' : shade(pal.matter, 0.9));
      if (!coarse) px(c, x + 7 * u, y + 3 * u, 3 * u, 5 * u, shade(pal.matter, 1.2));
      break;
    case 'cable':
      px(c, x + 4 * u, y, 1.2 * u, t, 'rgba(150,96,40,0.55)');
      px(c, x + 7 * u, y, u, t, 'rgba(70,80,96,0.5)');
      break;
    case 'sign':
      px(c, x + 3 * u, y + 4 * u, 6 * u, 4 * u, '#1a1a10');
      px(c, x + 4 * u, y + 5 * u, 4 * u, 2 * u, '#ffc94a');
      break;
    case 'hook':
      px(c, x + 5 * u, y + 2 * u, u, 3 * u, pal.matterEdge);
      px(c, x + 3 * u, y + 5 * u, 5 * u, 4 * u, shade(pal.matter, 1.05));
      break;
  }
}

function dressFloor(c: Ctx, kind: string, x: number, y: number, t: number, pal: Pal, n: number) {
  const u = t / 12;
  const body = shade(pal.matter, 0.95 + n * 0.3);
  switch (kind) {
    case 'barrel':
      px(c, x + 3 * u, y + 3 * u, 6 * u, 9 * u, body);
      px(c, x + 3 * u, y + 3 * u, 6 * u, 1.4 * u, pal.matterEdge);
      px(c, x + 3 * u, y + 7 * u, 6 * u, u, shade(pal.matter, 0.6));
      break;
    case 'sack':
      px(c, x + 2 * u, y + 7 * u, 8 * u, 5 * u, body);
      px(c, x + 4 * u, y + 5 * u, 4 * u, 2 * u, body);
      break;
    case 'stool':
      px(c, x + 3 * u, y + 8 * u, 6 * u, 1.6 * u, pal.matterEdge);
      px(c, x + 4 * u, y + 9.6 * u, 1.4 * u, 2.4 * u, body);
      px(c, x + 7 * u, y + 9.6 * u, 1.4 * u, 2.4 * u, body);
      break;
    case 'bucket':
      px(c, x + 4 * u, y + 8 * u, 5 * u, 4 * u, shade(pal.matter, 1.15));
      px(c, x + 4 * u, y + 8 * u, 5 * u, u, pal.matterEdge);
      break;
    case 'box':
      px(c, x + 3 * u, y + 8 * u, 6 * u, 4 * u, body);
      px(c, x + 3 * u, y + 8 * u, 6 * u, u, pal.matterEdge);
      break;
  }
}

/**
 * Scenery for one air tile, decided entirely by where it is.
 *
 * `row` is measured from the top of the room and `rows` is its height, because
 * what belongs on a tile depends on whether it is under the ceiling, up the back
 * wall, or down where the floor collects things.
 */
export function dressTile(
  c: Ctx, x: number, y: number, t: number, pal: Pal,
  col: number, row: number, rows: number, salt: number,
) {
  const u = t / 12;
  const n = tileNoise(col, row, salt);

  // Structural columns, at a regular spacing that has nothing to do with taste.
  if (col % 9 === 4 && row > 0 && row < rows - 2) {
    px(c, x + 4 * u, y, 3 * u, t, shade(pal.solid, 1.15));
    px(c, x + 4 * u, y, u, t, shade(pal.solid, 1.5));
    return;
  }

  // Conduit under the ceiling, running the length of every room.
  if (row === 1) {
    px(c, x, y + 3 * u, t, 2 * u, shade(pal.matter, 0.85));
    px(c, x, y + 3 * u, t, 0.8 * u, pal.matterEdge);
    px(c, x, y + 6.5 * u, t, 1.2 * u, 'rgba(150,96,40,0.5)');
    if (n > 0.86) px(c, x + 4 * u, y + 2 * u, 4 * u, 4 * u, shade(pal.matter, 1.2));
    return;
  }

  // Lamps, every so often, with the light they actually throw.
  if (row === 2 && col % 8 === 3) {
    px(c, x + 4 * u, y, 1.5 * u, 2 * u, shade(pal.matter, 0.7));
    px(c, x + 2 * u, y + 2 * u, 8 * u, 2 * u, '#d9cfae');
    px(c, x + 3 * u, y + 4 * u, 6 * u, u, '#fff6d4');
    const g = c.createRadialGradient(x + 6 * u, y + 4 * u, 0, x + 6 * u, y + 4 * u, t * 3.4);
    g.addColorStop(0, 'rgba(255,228,160,0.30)');
    g.addColorStop(1, 'rgba(255,228,160,0)');
    c.fillStyle = g;
    c.fillRect(x - t * 3, y, t * 7, t * 5);
    return;
  }

  // Up the wall.
  if (row >= 2 && row < rows - 3) {
    if (n > 0.68) {
      dressWall(c, WALL_KINDS[Math.floor(n * 9973) % WALL_KINDS.length]!, x, y, t, pal, n);
    }
    return;
  }

  // And whatever has collected along the floor.
  if (row === rows - 3 && n > 0.72) {
    dressFloor(c, FLOOR_KINDS[Math.floor(n * 7919) % FLOOR_KINDS.length]!, x, y, t, pal, n);
  }
}
