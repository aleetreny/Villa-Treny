// ── THE DIGGING MOULD ─────────────────────────────────────────────────────
//
// The six diggings are 1:1 traces of three of 0_mem0ry's own makeshift rooms.
// Not compositions in that style — traces: every object is the sprite the
// artist used, at the position it is in the render, found by matching and
// checked against the render pixel by pixel.
//
// HOW THE TRACE WAS MADE, because the obvious way does not work here.
//
// A plain best-NCC search finds the small props and misses almost every large
// one, because a sofa half hidden behind a table matches badly over the whole
// sprite even when the visible half is exact. So each candidate is scored by
// the **trimmed** mean colour error over its own opaque pixels — the best 55 %
// of them — which is precisely the part you can still see. The search runs
// greedily against the residual (what the reference has and the canvas does
// not), and **a placement is only kept if it actually reduces the pixel
// difference**, because a score can be fooled and the difference cannot.
//
// Position is only a third of a placement. The same difference decides the
// other two: every candidate is composited at **every depth** in the draw order
// (a box behind the cool box scores 5.7 and makes the room worse painted last),
// every object already placed is offered for **deletion** and dropped if the
// picture is no worse without it, and everything is **nudged** a pixel each way
// at the end. Run those as a loop — place, reorder, prune, nudge — until it
// stops moving. `measure/roomtrace.py` is that loop.
//
// The three references now differ by **56**, **2** and 580 pixels inside the
// outline — 0.16 %, 0.007 % and 2.4 %, against 10.4 % for the Workshops and
// 15.8 % for the Well. Measured off this file's own canvas in a browser, which
// is the only measurement that counts.
//
// The shell, all of it solved by brute force over every opaque tile and every
// phase:
//   band   1 px ink, 4 px of #c0b8b2, 1 px ink — the sheet's own cross-section
//   wall   makeshift_roomtiles column 4, rows 7-8: one 32 x 64 block of white
//          brick whose bottom four rows are the skirting
//   floor  the same sheet's column 5, rows 7-8, grey concrete
//   shape  a rectangle minus rectangular cuts, so the two-room flat keeps the
//          notch in its top wall and the corner missing from its bottom right
//   stub   an interior wall: 4 px of #c0b8b2 seen from above where it stands
//          in plan, then one 64 px brick block hanging below it as its south
//          face, ink down both sides and closing the bottom. Both two-room
//          references have one; without it the solver spends furniture
//          explaining wall pixels, which is what went wrong the first time
//   door   one 32 px tile of band cut away, its inner ink line running on
//          across the gap as a threshold — the same tile in all three renders,
//          and the artist's own renders have it in exactly that tile too

export const INK = '#000000', BANDFILL = '#c0b8b2';
export const BAND = 6;
export const WALL = { sx: 128, sy: 224 };      // col 4, rows 7-8
export const FLOOR = { sx: 160, sy: 224 };     // col 5, rows 7-8

/** The three rooms, measured off their renders. `top` is where the 32 x 64
 *  brick block starts and `ph` its x phase; `cuts` are taken out of the
 *  outline; `door` is the tile of the south band that is missing; `stubs` are
 *  the interior walls — `x0`/`x1` the ink either side of them, `face` the row
 *  the brick block starts on, `phx` its x phase, `cap` the row the plan view
 *  of the wall starts on and `capInk` whether an ink line closes it. */
export const REF = {
  twoRooms: {
    W: 245, H: 181, x0: 4, y0: 4, x1: 239, y1: 175, top: 10, ph: 10,
    cuts: [[80, 4, 131, 35], [144, 144, 239, 175]], door: [74, 105],
    // the block under the notch: the band already draws its plan and the ink
    // line at y 41, so only the face below it is left to hang
    stubs: [{ x0: 74, x1: 137, face: 42, phx: 10 }],
  },
  twoRoomsB: {
    W: 181, H: 187, x0: 4, y0: 4, x1: 175, y1: 172, top: 10, ph: 10,
    cuts: [], door: [74, 105],
    // the partition between the two chambers, hanging off the north wall
    stubs: [{ x0: 71, x1: 76, face: 42, phx: 19, cap: 9, capInk: true }],
  },
  bedsit: {
    W: 179, H: 217, x0: 19, y0: 23, x1: 158, y1: 194, top: 29, ph: 25,
    cuts: [], door: [74, 105],
  },
};

/** The room's outline inset by `k`: the rectangle shrunk by k, minus every cut
 *  grown by k. Filled even-odd, which is how a shape with bites in it is drawn
 *  in one path — and why each grown cut has to be **clipped back to the
 *  rectangle**. A cut that touches an edge grows past it, and the part sticking
 *  out is then crossed by one subpath instead of two, so even-odd calls it
 *  inside and paints wall where the notch should be open. */
function outline(g, r, k) {
  const X0 = r.x0 + k, Y0 = r.y0 + k, X1 = r.x1 - k, Y1 = r.y1 - k;
  g.beginPath();
  g.rect(X0, Y0, X1 - X0 + 1, Y1 - Y0 + 1);
  for (const [a, b, c, d] of r.cuts) {
    const ax = Math.max(X0, a - k), ay = Math.max(Y0, b - k);
    const bx = Math.min(X1, c + k), by = Math.min(Y1, d + k);
    if (bx >= ax && by >= ay) g.rect(ax, ay, bx - ax + 1, by - ay + 1);
  }
}

export function shell(g, SH, r) {
  // ink, four of fill, ink — by filling the same outline at four insets
  g.fillStyle = INK; outline(g, r, 0); g.fill('evenodd');
  g.fillStyle = BANDFILL; outline(g, r, 1); g.fill('evenodd');
  g.fillStyle = INK; outline(g, r, BAND - 1); g.fill('evenodd');

  g.save();
  outline(g, r, BAND); g.clip('evenodd');
  const face = r.top + 64;
  for (let x = r.ph - 32; x < r.x1 + 32; x += 32) {
    g.drawImage(SH.rt, WALL.sx, WALL.sy, 32, 32, x, r.top - 32, 32, 32);
    g.drawImage(SH.rt, WALL.sx, WALL.sy, 32, 64, x, r.top, 32, 64);
    for (let y = face; y < r.y1 + 64; y += 64) {
      g.drawImage(SH.rt, FLOOR.sx, FLOOR.sy, 32, 64, x, y, 32, 64);
    }
  }
  g.restore();

  for (const s of r.stubs || []) wall(g, SH, s);
}

/** One interior wall, drawn over the floor the shell has just laid down. */
export function wall(g, SH, s) {
  const bot = s.face + 63, top = s.cap == null ? s.face : s.cap;
  if (s.cap != null) {
    g.fillStyle = BANDFILL;
    g.fillRect(s.x0 + 1, s.cap, s.x1 - s.x0 - 1, s.face - s.cap);
  }
  g.save();
  g.beginPath(); g.rect(s.x0 + 1, s.face, s.x1 - s.x0 - 1, 64); g.clip();
  for (let x = s.x0 + 1 - (((s.x0 + 1 - s.phx) % 32) + 32) % 32; x < s.x1; x += 32) {
    g.drawImage(SH.rt, WALL.sx, WALL.sy, 32, 64, x, s.face, 32, 64);
  }
  g.restore();
  g.fillStyle = INK;
  g.fillRect(s.x0, top, 1, bot - top + 1);
  g.fillRect(s.x1, top, 1, bot - top + 1);
  g.fillRect(s.x0, bot, s.x1 - s.x0 + 1, 1);
  if (s.capInk) g.fillRect(s.x0, s.face, s.x1 - s.x0 + 1, 1);
}

/** The mouth, cut out of the south band after everything else is drawn: the
 *  band's inner ink line runs on across the gap as a threshold, and the two
 *  jambs are inked down the sides of it — the artist's own renders have all
 *  three, in this same tile. */
export function mouth(g, r) {
  const [dx0, dx1] = r.door;
  g.clearRect(dx0, r.y1 - BAND + 2, dx1 - dx0 + 1, BAND);
  g.fillStyle = INK;
  g.fillRect(dx0, r.y1 - BAND + 1, dx1 - dx0 + 1, 1);
  g.fillRect(dx0 - 1, r.y1 - BAND + 2, 1, BAND - 1);
  g.fillRect(dx1 + 1, r.y1 - BAND + 2, 1, BAND - 1);
}

/** Private space is dim and every door has its own warm — the map's art
 *  direction, applied inside the room rather than only at its mouth. */
export function lamp(g, W, H, at, strength, tint) {
  const rad = Math.max(W, H) * 0.95;
  const grd = g.createRadialGradient(at[0], at[1], 8, at[0], at[1], rad);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.45, 'rgba(0,0,0,' + (0.22 * (1 - strength)).toFixed(3) + ')');
  grd.addColorStop(1, 'rgba(0,0,0,' + (0.42 - 0.22 * strength).toFixed(3) + ')');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.save(); g.globalCompositeOperation = 'overlay';
  g.fillStyle = tint; g.fillRect(0, 0, W, H);
  g.restore();
}
