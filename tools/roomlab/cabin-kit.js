// ── THE CABIN MOULD ───────────────────────────────────────────────────────
//
// The two-berth cabin, traced 1:1 off reference/two-berth-cabin.jpg, extracted
// from berth.html so that the five cabins in the hull are the *same code* rather
// than five drawings that resemble each other. Every number below was measured
// off that image and divided by its 5.34x display scale; nothing here is
// composed.
//
// The rule the owner set for the five: clone first, vary afterwards, and vary
// very little. So this module draws the mould and takes a small `variation`:
// how bright the cabin's own lamp is, whether it is a starboard cabin (mirrored,
// because its floor tilts the other way), and one `extras` hook for the single
// object that is only in that cabin. There is no other way to change it.

export const T = 32;                  // the sheets' tile
export const W = 204, H = 205;        // the room, as measured
export const SHAFT_X0 = 96, SHAFT_X1 = 140;   // the ladder well, cut into the top wall
export const ROOM_Y0 = 32;            // where the main room's top wall begins
export const STEP_Y = 170;            // the room narrows here
export const STEP_X0 = 32, STEP_X1 = 172;
export const BAND = 6;                // 1 px outline + 4 px wall + 1 px outline
export const FACE = 82;               // floor begins here, under the top wall
export const SHAFT_FLOOR = 70;        // and here inside the well
export const INK = '#1a1a1a', WALL = '#626262';

/** The ink rectangle of a sprite, so nothing is ever placed by its tile. */
export function inkBox(sheets, cache, sheet, c, r, w, h) {
  const k = sheet + c + ',' + r + ',' + w + ',' + h;
  if (cache[k] !== undefined) return cache[k];
  const cv = document.createElement('canvas');
  cv.width = T * w; cv.height = T * h;
  const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false;
  cx.drawImage(sheets[sheet], c * T, r * T, T * w, T * h, 0, 0, T * w, T * h);
  const d = cx.getImageData(0, 0, T * w, T * h).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < T * h; y++) {
    for (let x = 0; x < T * w; x++) {
      if (d[(y * T * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return cache[k] = (x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
}

/** The deck. #919191 with a grid line every 8 px, both read straight off the
 *  reference — the shop sheet's floor is a full stop lighter and its grout far
 *  heavier than what the reference actually shows. */
export function floor(g, x0, y0, w, h) {
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  g.fillStyle = '#919191'; g.fillRect(x0, y0, w, h);
  g.fillStyle = '#8a8a8a';
  for (let x = Math.ceil(x0 / 8) * 8; x < x0 + w; x += 8) g.fillRect(x, y0, 1, h);
  for (let y = Math.ceil(y0 / 8) * 8; y < y0 + h; y += 8) g.fillRect(x0, y, w, 1);
  g.restore();
}

/** An algal stain, drawn rather than stamped: the sheets carry rust, not moss. */
export function moss(g, x, y, w, h, seed) {
  g.save(); g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < w; i++) {
    const t = i + seed;
    const n = (Math.sin(t * 1.9) * .35 + Math.sin(t * .53) * .4 + Math.sin(t * .17) * .25 + 1) / 2;
    const d = Math.max(3, Math.round(h * (.45 + .55 * n)));
    g.fillStyle = 'rgba(172,170,126,' + (.56 + .2 * n).toFixed(2) + ')';
    g.fillRect(x + i, y, 1, d);
    g.fillStyle = 'rgba(168,166,120,.3)';                    // where it has run
    g.fillRect(x + i, y + d, 1, Math.round(h * .35 * n));
  }
  g.restore();
}

function outline(d) {
  return [[SHAFT_X0 + d, 0], [SHAFT_X1 - d, 0], [SHAFT_X1 - d, ROOM_Y0 + d], [W - d, ROOM_Y0 + d],
    [W - d, STEP_Y - d], [STEP_X1 - d, STEP_Y - d], [STEP_X1 - d, H - d], [STEP_X0 + d, H - d],
    [STEP_X0 + d, STEP_Y - d], [d, STEP_Y - d], [d, ROOM_Y0 + d], [SHAFT_X0 + d, ROOM_Y0 + d]];
}
function path(g, pts) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
}

/** Is a rectangle inside the room's walkable outline? */
export function inside(r) {
  const pad = BAND - 1;
  const corners = [[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]];
  return corners.every(([x, y]) => {
    if (y < ROOM_Y0) return x >= SHAFT_X0 + pad && x <= SHAFT_X1 - pad;   // in the well
    if (y < STEP_Y) return x >= pad && x <= W - pad;                      // the wide part
    return x >= STEP_X0 + pad && x <= STEP_X1 - pad && y <= H - pad;      // below the step
  });
}

/** Draw one cabin. `variation` is the only way this differs between the five:
 *   mirror  — a starboard cabin, so the whole trace is flipped and the two
 *             notices are repainted the right way round afterwards
 *   lamp    — 0..1, how bright this cabin's own lamp is. The Cabins' art
 *             direction is that the modularity is in the geometry and the
 *             variation is in the light, so this is the main axis. It defaults
 *             to 1, which is no dimming at all: the mould called with no
 *             variation has to come out as the trace, or berth.html stops being
 *             the thing the five are checked against.
 *   plate   — one function, for anything done to the wall itself; it runs before
 *             the pipes and notices go on, so a patch reads as part of the wall.
 *   extras  — one function, drawing the single object only this cabin has.
 *   omit    — names of mould props this cabin does without.
 */
export function drawCabin(sheets, variation = {}) {
  const { mirror = false, lamp = 1, plate = null, extras = null, omit = [] } = variation;
  const room = document.createElement('canvas');
  room.width = W; room.height = H;
  const g = room.getContext('2d');
  g.imageSmoothingEnabled = false;

  const BB = {};
  const FLOORPROPS = [], WALLPROPS = [], CLASH = [];
  const skip = new Set(omit);

  // put a sprite so that its INK lands exactly at (ix,iy). Tracing works in ink
  // coordinates: the tile a sprite happens to sit in is the sheet's business.
  function put(name, sheet, c, r, w, h, ix, iy, layer) {
    if (skip.has(name)) return null;
    const b = inkBox(sheets, BB, sheet, c, r, w, h);
    if (!b) { CLASH.push('EMPTY  ' + name); return null; }
    const rect = { x: ix, y: iy, w: b.w, h: b.h, name };
    const list = layer === 'wall' ? WALLPROPS : layer === 'on' ? [] : FLOORPROPS;
    for (const o of list) {
      const ox = Math.max(0, Math.min(rect.x + rect.w, o.x + o.w) - Math.max(rect.x, o.x));
      const oy = Math.max(0, Math.min(rect.y + rect.h, o.y + o.h) - Math.max(rect.y, o.y));
      if (ox > 2 && oy > 2) CLASH.push('OVERLAP  ' + name + ' x ' + o.name + '  (' + ox + 'x' + oy + ')');
    }
    if (!inside(rect)) CLASH.push('OFF-FRAME  ' + name + '  [' + rect.x + ',' + rect.y + ' ' + rect.w + 'x' + rect.h + ']');
    list.push(rect);
    g.drawImage(sheets[sheet], c * T, r * T, T * w, T * h, ix - b.x0, iy - b.y0, T * w, T * h);
    return rect;
  }
  // raw sub-rectangle of a sheet, for pipe runs cut out of a longer sprite
  function cut(sheet, sx, sy, sw, sh, dx, dy) {
    g.drawImage(sheets[sheet], sx, sy, sw, sh, dx, dy, sw, sh);
  }
  // Everything below is addressed by the pipe's CENTRELINE, which is how the
  // reference's runs were measured, so the joints actually meet.
  const runH = (cx, cy, w, off) => cut('furn', (off || 0), 299, w, 10, cx, cy - 4.5 | 0);
  const runV = (cx, cy, h, off) => cut('furn', 11, 320 + (off || 0), 10, h, cx - 4.5 | 0, cy);
  const elbowUpLeft = (cx, cy) => cut('furn', 42, 394, 11, 11, cx - 5 | 0, cy - 6 | 0);
  const elbowRightDown = (cx, cy) => cut('furn', 13, 363, 10, 12, cx - 3 | 0, cy - 5 | 0);

  // ── shell ────────────────────────────────────────────────────────────────
  path(g, outline(0)); g.fillStyle = INK; g.fill();
  path(g, outline(1)); g.fillStyle = WALL; g.fill();
  path(g, outline(BAND - 1)); g.fillStyle = INK; g.fill();

  g.save(); path(g, outline(BAND)); g.clip();

  floor(g, 0, 0, W, H);

  // top wall in elevation: corrugated plate, whole panels. It stops at FACE in
  // the room and higher, at SHAFT_FLOOR, inside the ladder well.
  const panel = [10, 8, 1, 10, 8, 10, 1, 8];       // plain plate only — the sheet's
                                                   // rusted variants are not in the reference
  g.save();
  g.beginPath(); g.rect(0, 0, W, FACE); g.clip();
  for (let x = 0; x < W; x += T) {
    const c = panel[(x / T) % panel.length];
    for (let y = FACE - 2 * T; y > -2 * T; y -= 2 * T) {
      g.drawImage(sheets.walls, c * T, 10 * T, T, 2 * T, x, y, T, 2 * T);
    }
  }
  g.restore();
  // the well's floor is higher than the room's, which is what makes it read
  // as a shaft you climb out of rather than a niche
  floor(g, SHAFT_X0, SHAFT_FLOOR, SHAFT_X1 - SHAFT_X0, FACE - SHAFT_FLOOR);

  // Anything done to the plate itself goes on here, between the panels and the
  // fittings, so a patch of lifted plate sits under the pipes the way a patch of
  // lifted plate would.
  if (plate) plate({ g, sheets, W, H, T, cut });

  // algae creeping down from the top of the plate, two patches, as measured
  moss(g, 6, 38, 34, 11, 0); moss(g, 168, 38, 30, 10, 3);

  // the shadow the plate casts on the deck
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillRect(0, FACE - 1, SHAFT_X0, 2); g.fillRect(SHAFT_X1, FACE - 1, W - SHAFT_X1, 2);
  g.fillRect(SHAFT_X0, SHAFT_FLOOR - 1, SHAFT_X1 - SHAFT_X0, 2);

  // ── on the wall ──────────────────────────────────────────────────────────
  // Left run: three lengths butted, so the sheet's own collar-then-valve rhythm
  // falls where the reference's does — the second valve lands behind the notice
  // board, which is why only one is visible there.
  runH(6, 54, 32); runH(38, 54, 32); runH(70, 54, 12);
  runV(85, 37, 13, 13);                            // the drop it comes off
  elbowUpLeft(85, 54);                             // and the bend into the run
  put('firstaid', 'furn', 8, 9, 1, 1, 14, 63, 'wall');
  put('notice', 'furn', 2, 11, 1, 1, 38, 40, 'wall');

  // Right run: down off the plate top, left along the wall, then down again in
  // two rusted lengths to the deck.
  runV(182, 37, 12, 13);
  elbowUpLeft(182, 54);
  runH(148, 54, 32);
  elbowRightDown(150, 54);
  runV(150, 55, 32);
  cut('furn', 11, 324, 10, 8, 145, 75);            // its second valve, as measured
  put('yellownotice', 'furn', 13, 15, 1, 1, 160, 60, 'wall');
  // and one length low down along the deck, cut so its wheel lands where the
  // reference's does rather than a full length running out under the trestle
  runH(180, 86, 18, 14);

  // ── the ladder well ──────────────────────────────────────────────────────
  put('ladder', 'furn', 4, 12, 1, 2, 109, 4);

  // ── two berths, head to the plate, a footlocker shared between them ──────
  put('bunkA', 'furn', 14, 10, 1, 2, 8, 82);
  put('locker', 'furn', 8, 13, 1, 1, 38, 93);
  put('bunkB', 'furn', 14, 10, 1, 2, 70, 82);

  // ── the stores corner: a trestle, bedding folded on it, kit on top ───────
  put('trestle', 'furn', 11, 9, 2, 2, 141, 93);
  put('foldedC', 'furn', 16, 6, 1, 1, 140, 86, 'on');   // three blankets, stacked
  put('foldedB', 'furn', 16, 6, 1, 1, 140, 83, 'on');
  put('foldedA', 'furn', 16, 6, 1, 1, 140, 80, 'on');
  put('kit', 'furn', 2, 8, 1, 1, 169, 90, 'on');        // jacket and hard hat
  put('desk', 'furn', 7, 6, 1, 2, 167, 129);

  // ── the mess end: one table, two chairs, and what got left on the deck ───
  put('chairL', 'furn', 6, 4, 1, 2, 41, 157);
  put('table', 'furn', 7, 4, 1, 2, 67, 160);
  put('chairR', 'furn', 5, 4, 1, 2, 107, 157);
  put('sheet', 'furn', 0, 5, 1, 1, 72, 163, 'on');      // somebody's list, left out
  put('book', 'furn', 1, 4, 1, 1, 135, 172);
  put('paper', 'furn', 2, 4, 1, 1, 151, 178);

  g.restore();

  // ── starboard cabins ─────────────────────────────────────────────────────
  // Across the walk the floor tilts the other way, so the whole trace is
  // flipped rather than re-laid. The two notices are then repainted unflipped,
  // because a mirrored notice is a mirrored piece of writing.
  let out = room;
  if (mirror) {
    out = document.createElement('canvas');
    out.width = W; out.height = H;
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = false;
    o.translate(W, 0); o.scale(-1, 1);
    o.drawImage(room, 0, 0);
    o.setTransform(1, 0, 0, 1, 0, 0);
    for (const [name, c, r, ix, iy] of [['notice', 2, 11, 38, 40], ['yellownotice', 13, 15, 160, 60]]) {
      if (skip.has(name)) continue;
      const b = inkBox(sheets, BB, 'furn', c, r, 1, 1);
      o.drawImage(sheets.furn, c * T, r * T, T, T, W - (ix + b.w) - b.x0, iy - b.y0, T, T);
    }
  }

  const gg = out.getContext('2d');
  gg.imageSmoothingEnabled = false;
  // The room's silhouette as it now stands. A starboard cabin is flipped, so
  // anything clipped to the outline afterwards has to be flipped too, or it
  // paints into the corner the ladder well leaves empty on the other side.
  const shape = (d) => outline(d).map(([x, y]) => [mirror ? W - x : x, y]);

  // ── the one thing only this cabin has ────────────────────────────────────
  if (extras) {
    extras({
      g: gg, sheets, W, H, mirror,
      /** x in mould coordinates, wherever the cabin faces. */
      mx: (x, w = 0) => (mirror ? W - x - w : x),
      sprite(sheet, c, r, w, h, ix, iy) {
        const b = inkBox(sheets, BB, sheet, c, r, w, h);
        gg.drawImage(sheets[sheet], c * T, r * T, T * w, T * h, ix - b.x0, iy - b.y0, T * w, T * h);
        return b;
      },
      cut(sheet, sx, sy, sw, sh, dx, dy) {
        gg.drawImage(sheets[sheet], sx, sy, sw, sh, dx, dy, sw, sh);
      },
      clip() { gg.save(); path(gg, shape(BAND)); gg.clip(); },
      unclip() { gg.restore(); },
    });
  }

  // ── the cabin's own lamp ─────────────────────────────────────────────────
  // Each cabin has its own lamp and they are all different brightnesses, because
  // each is powered by whoever lives there and they each made a different choice.
  // Darkness is the ground state, so the brightest cabin is the mould untouched
  // and the rest are dimmed away from it — never lifted above the reference,
  // which would drift the whole set off the trace. The falloff is centred over
  // the table, because that is where the one lamp hangs.
  if (lamp < 1) {
    const tone = (v) => `rgb(${Math.round(255 * v)},${Math.round(253 * v)},`
      + `${Math.round(255 * Math.min(1, v * 1.05))})`;
    const cx = mirror ? W - 92 : 92, cy = 168;
    const grd = gg.createRadialGradient(cx, cy, 10, cx, cy, 190);
    grd.addColorStop(0, tone(0.78 + 0.22 * lamp));      // under the lamp
    grd.addColorStop(1, tone(0.58 + 0.42 * lamp));      // the far corners
    gg.save();
    // Inside the shell only. The wall band is the same plate in all five and
    // dimming it would give the set five different-coloured hulls.
    path(gg, shape(BAND)); gg.clip();
    gg.globalCompositeOperation = 'multiply';
    gg.fillStyle = grd; gg.fillRect(0, 0, W, H);
    gg.restore();
  }

  return { canvas: out, clash: CLASH, floor: FLOORPROPS, wall: WALLPROPS };
}
