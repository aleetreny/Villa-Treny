// The rock, and the ship in it.
//
// This is the main plane: a cutaway of the whole habitat drawn as pixel art, not
// a survey. The asteroid is a real mass with a lit rim and craters, the wreck is
// driven into it bow-first at twenty-two degrees with its nose still in vacuum,
// and every one of the sixteen rooms is cut open and furnished with the same
// tiles its interior is built from. Click one and it opens.
//
// Everything is rectangles. No sprite sheet, no images, nothing to load — which
// is what lets it stay crisp at any size and cost the visitor nothing.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FRAME, LINKS, PLACEMENTS, PLACEMENT_BY_ID, ROCK_BODY, asteroidOutline, centreOf, craters,
  debris, facets, roomAt, RIGGING, type Placement,
} from '../../../lib/habitat/section';
import { ROOM_BY_ID, type RoomId } from '../../../lib/habitat/rooms';
import { PALETTE, shapeOf } from '../../../lib/habitat/tiles';
import { isTerrain } from '../../../lib/habitat/grid';
import type { HabitatSnapshot } from '../../../lib/habitat/snapshot';
import {
  dressTile, drawPerson, drawShape, drawTerrain, px, tileNoise, type Ctx,
} from './paint';

// Cold stone, not soil. An asteroid is grey with a bruise in it, and the warmth
// in this picture has to come from the windows or it means nothing.
const ROCK = {
  lit: '#8b8190',
  face: '#5c5564',
  dark: '#3b3644',
  deep: '#241f2c',
  cut: '#191420',
  seam: '#4a4352',
} as const;

const METAL = {
  lit: '#aab6c6',
  face: '#717d90',
  dark: '#464f60',
  deep: '#2c333f',
  hot: '#ff9a4d',
} as const;

/** Sunlight comes from the upper left, so everything catches its rim there. */
const SUN = { x: -0.72, y: -0.69 };

type Props = {
  snapshot: HabitatSnapshot;
  selected: RoomId | null;
  onSelect: (id: RoomId) => void;
};

function outlinePath(c: Ctx, pts: Array<{ x: number; y: number }>, t: number) {
  c.beginPath();
  pts.forEach((p, i) => {
    const x = p.x * t;
    const y = p.y * t;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  });
  c.closePath();
}

/** The hull envelope: the stacked decks, swollen by a margin, with a nose cone.
 *  Built from the placements so the shell can never drift off its own rooms. */
function hullPolygon(): Array<{ x: number; y: number }> {
  const hull = PLACEMENTS.filter((p) => p.side === 'hull').sort((a, b) => a.y - b.y);
  const pad = 2.2;
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  for (const p of hull) {
    left.push({ x: p.x - pad, y: p.y }, { x: p.x - pad, y: p.y + p.h });
    right.push({ x: p.x + p.w + pad, y: p.y }, { x: p.x + p.w + pad, y: p.y + p.h });
  }
  const bow = hull[0]!;
  const stern = hull[hull.length - 1]!;
  return [
    { x: bow.x + bow.w * 0.34, y: bow.y - 5.4 },
    { x: bow.x + bow.w + pad, y: bow.y - 0.6 },
    ...right,
    { x: stern.x + stern.w + pad - 1.6, y: stern.y + stern.h + 2.6 },
    { x: stern.x - pad + 1.6, y: stern.y + stern.h + 2.6 },
    ...left.reverse(),
    { x: bow.x - pad, y: bow.y - 0.6 },
  ];
}

function paintSpace(c: Ctx, w: number, h: number, t: number) {
  const g = c.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, '#0a0918');
  g.addColorStop(0.55, '#050510');
  g.addColorStop(1, '#02020a');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);

  // Two soft blooms of nebula, so the void is not a flat black rectangle.
  for (const [cx, cy, r, col] of [
    [w * 0.18, h * 0.12, w * 0.42, 'rgba(96, 62, 150, 0.20)'],
    [w * 0.86, h * 0.82, w * 0.36, 'rgba(38, 78, 140, 0.16)'],
  ] as const) {
    const n = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    n.addColorStop(0, col);
    n.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = n;
    c.fillRect(0, 0, w, h);
  }

  // Stars, on a fixed sky.
  const d = Math.max(1, Math.round(t / 12));
  for (let i = 0; i < 520; i += 1) {
    const sx = tileNoise(i, 7, 3) * w;
    const sy = tileNoise(i, 13, 5) * h;
    const b = tileNoise(i, 29, 11);
    if (b > 0.965) {
      px(c, sx, sy, d * 3, d, 'rgba(214,232,255,0.55)');
      px(c, sx + d, sy - d, d, d * 3, 'rgba(214,232,255,0.55)');
      px(c, sx + d, sy, d, d, '#ffffff');
    } else {
      px(c, sx, sy, d, d, `rgba(200,216,244,${(0.2 + b * 0.6).toFixed(2)})`);
    }
  }
}

function paintAsteroid(c: Ctx, t: number) {
  const ring = asteroidOutline();
  outlinePath(c, ring, t);
  c.fillStyle = ROCK.face;
  c.fill();

  // Rim light where the sun reaches, and a hard terminator away from it.
  c.save();
  c.clip();
  const cx = ROCK_BODY.x * t;
  const cy = ROCK_BODY.y * t;
  const g = c.createLinearGradient(
    cx + SUN.x * ROCK_BODY.rx * t, cy + SUN.y * ROCK_BODY.ry * t,
    cx - SUN.x * ROCK_BODY.rx * t, cy - SUN.y * ROCK_BODY.ry * t,
  );
  g.addColorStop(0, ROCK.lit);
  g.addColorStop(0.34, ROCK.face);
  g.addColorStop(0.72, ROCK.dark);
  g.addColorStop(1, ROCK.deep);
  c.fillStyle = g;
  c.fillRect(0, 0, FRAME.w * t, FRAME.h * t);

  // Faces. Stone at a distance is not texture, it is planes catching light
  // differently, and without them the whole rock reads as an airbrushed oval.
  for (const f of facets()) {
    outlinePath(c, f.pts, t);
    c.fillStyle = f.tone > 0.5
      ? `rgba(255,242,222,${(0.03 + f.tone * 0.06).toFixed(3)})`
      : `rgba(10,6,16,${(0.05 + (1 - f.tone) * 0.1).toFixed(3)})`;
    c.fill();
    c.lineWidth = Math.max(1, t / 10);
    c.strokeStyle = f.tone > 0.5 ? 'rgba(255,240,214,0.07)' : 'rgba(0,0,0,0.14)';
    c.stroke();
  }

  // Surface: boulders and dust, dense enough to read as rock at a glance.
  for (let y = 0; y < FRAME.h; y += 1) {
    for (let x = 0; x < FRAME.w; x += 1) {
      const n = tileNoise(x, y, 2);
      if (n > 0.955) px(c, x * t, y * t, t * 0.5, t * 0.4, 'rgba(255,240,214,0.12)');
      else if (n < 0.035) px(c, x * t, y * t, t * 0.42, t * 0.34, 'rgba(0,0,0,0.34)');
    }
  }

  // Craters: a bright sunward lip, a dark floor, a shadow on the far wall.
  for (const cr of craters()) {
    const r = cr.r * t;
    c.beginPath();
    c.ellipse(cr.x * t, cr.y * t, r, r * 0.82, 0, 0, Math.PI * 2);
    c.fillStyle = `rgba(20,15,10,${(0.2 + cr.deep * 0.3).toFixed(2)})`;
    c.fill();
    c.beginPath();
    c.ellipse(cr.x * t + SUN.x * r * 0.24, cr.y * t + SUN.y * r * 0.24, r * 0.82, r * 0.66, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fill();
    c.lineWidth = Math.max(1, t / 9);
    c.strokeStyle = 'rgba(255,236,206,0.16)';
    c.beginPath();
    c.ellipse(cr.x * t, cr.y * t, r, r * 0.82, 0, Math.PI * 1.05, Math.PI * 1.95);
    c.stroke();
  }
  c.restore();

  // The lit edge itself, one pixel of hot rim on the sunward side.
  c.save();
  c.lineWidth = Math.max(1, t / 7);
  c.strokeStyle = 'rgba(255,226,180,0.5)';
  c.beginPath();
  ring.forEach((p, i) => {
    const nx = (p.x - ROCK_BODY.x) / ROCK_BODY.rx;
    const ny = (p.y - ROCK_BODY.y) / ROCK_BODY.ry;
    const facing = nx * SUN.x + ny * SUN.y;
    const q = ring[(i + 1) % ring.length]!;
    if (facing > 0.25) {
      c.moveTo(p.x * t, p.y * t);
      c.lineTo(q.x * t, q.y * t);
    }
  });
  c.stroke();
  c.restore();
}

/** Rubble still hanging around the impact. */
function paintDebris(c: Ctx, t: number) {
  for (const d of debris()) {
    const r = d.r * t;
    px(c, d.x * t - r, d.y * t - r * 0.8, r * 2, r * 1.6, ROCK.dark);
    px(c, d.x * t - r * 0.7, d.y * t - r * 0.8, r * 0.9, r * 0.5, ROCK.face);
    px(c, d.x * t - r * 0.4, d.y * t + r * 0.3, r * 0.7, r * 0.4, ROCK.deep);
  }
}

/** The dug passages between rooms, cut through solid rock. */
function paintCorridors(c: Ctx, t: number) {
  for (const link of LINKS) {
    const a = centreOf(link.a);
    const b = centreOf(link.b);
    const pa = PLACEMENT_BY_ID[link.a];
    const pb = PLACEMENT_BY_ID[link.b];
    const dug = pa.side === 'rock' || pb.side === 'rock';
    c.save();
    c.lineCap = 'butt';
    c.lineWidth = t * 3;
    c.strokeStyle = ROCK.cut;
    c.beginPath();
    c.moveTo(a.x * t, a.y * t);
    c.lineTo(b.x * t, b.y * t);
    c.stroke();
    c.lineWidth = t * 2;
    c.strokeStyle = dug ? '#2f2519' : METAL.deep;
    c.beginPath();
    c.moveTo(a.x * t, a.y * t);
    c.lineTo(b.x * t, b.y * t);
    c.stroke();
    // A floor line, so a passage reads as somewhere you could walk.
    c.lineWidth = Math.max(1, t / 5);
    c.strokeStyle = dug ? '#4a3a26' : METAL.dark;
    c.beginPath();
    c.moveTo(a.x * t, a.y * t + t * 0.8);
    c.lineTo(b.x * t, b.y * t + t * 0.8);
    c.stroke();
    c.restore();
  }
}

/** Power runs from the Workshops reactor bay to everything that is lit, along
 *  the passages, so the habitat visibly hangs off one failing machine. */
function paintCables(c: Ctx, t: number, snapshot: HabitatSnapshot) {
  const from = centreOf('workshops');
  c.save();
  c.lineWidth = Math.max(1, t / 6);
  for (const room of snapshot.rooms) {
    if (!room.lit || room.id === 'workshops') continue;
    const to = centreOf(room.id);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 + 3.2;
    c.strokeStyle = 'rgba(198,124,58,0.34)';
    c.beginPath();
    c.moveTo(from.x * t, from.y * t);
    c.quadraticCurveTo(midX * t, midY * t, to.x * t, to.y * t);
    c.stroke();
  }
  c.restore();
}

/** The wreck's shell, and what is left on the outside of it. */
function paintHull(c: Ctx, t: number) {
  const poly = hullPolygon();
  outlinePath(c, poly, t);
  c.fillStyle = METAL.face;
  c.fill();

  c.save();
  c.clip();
  const g = c.createLinearGradient(0, 0, 70 * t, 80 * t);
  g.addColorStop(0, METAL.lit);
  g.addColorStop(0.4, METAL.face);
  g.addColorStop(1, METAL.deep);
  c.fillStyle = g;
  c.fillRect(0, 0, FRAME.w * t, FRAME.h * t);

  // Plating: seams across the hull, rivets along them, streaks below.
  const hull = PLACEMENTS.filter((p) => p.side === 'hull').sort((a, b) => a.y - b.y);
  for (const p of hull) {
    px(c, (p.x - 3) * t, p.y * t, (p.w + 6) * t, Math.max(1, t / 4), METAL.dark);
    px(c, (p.x - 3) * t, p.y * t - Math.max(1, t / 4), (p.w + 6) * t, Math.max(1, t / 5), METAL.lit);
    for (let i = 0; i < p.w + 4; i += 3) {
      px(c, (p.x - 2 + i) * t, (p.y + 0.6) * t, Math.max(1, t / 6), Math.max(1, t / 6), 'rgba(20,25,33,0.7)');
    }
  }
  for (let y = 0; y < FRAME.h; y += 1) {
    for (let x = 0; x < FRAME.w; x += 1) {
      const n = tileNoise(x, y, 17);
      if (n > 0.972) px(c, x * t, y * t, t * 0.4, t * 2.2, 'rgba(24,20,16,0.24)');
    }
  }
  c.restore();

  // The reactor burning in the Workshops power bay, deep in the rock.
  const workshops = PLACEMENT_BY_ID.workshops;
  const rx = (workshops.x + workshops.w / 2) * t;
  const ry = (workshops.y + workshops.h + 1.4) * t;
  const rg = c.createRadialGradient(rx, ry, 0, rx, ry, 9 * t);
  rg.addColorStop(0, 'rgba(255,168,88,0.85)');
  rg.addColorStop(0.4, 'rgba(214,96,40,0.34)');
  rg.addColorStop(1, 'rgba(214,96,40,0)');
  c.fillStyle = rg;
  c.fillRect(rx - 10 * t, ry - 10 * t, 20 * t, 20 * t);
}

/** Masts, a dish and bent radiator fins on the part still out in vacuum. */
function paintRigging(c: Ctx, t: number) {
  for (const r of RIGGING) {
    const a = ((r.lean - 90) * Math.PI) / 180;
    const x0 = r.x * t;
    const y0 = r.y * t;
    const x1 = x0 + Math.cos(a) * r.len * t;
    const y1 = y0 + Math.sin(a) * r.len * t;
    c.save();
    if (r.kind === 'fin') {
      c.lineWidth = t * 1.5;
      c.strokeStyle = METAL.dark;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.lineWidth = Math.max(1, t / 5);
      c.strokeStyle = 'rgba(150,166,190,0.6)';
      for (let i = 1; i < 6; i += 1) {
        const px0 = x0 + (x1 - x0) * (i / 6);
        const py0 = y0 + (y1 - y0) * (i / 6);
        c.beginPath();
        c.moveTo(px0 - Math.sin(a) * t, py0 + Math.cos(a) * t);
        c.lineTo(px0 + Math.sin(a) * t, py0 - Math.cos(a) * t);
        c.stroke();
      }
    } else if (r.kind === 'dish') {
      c.lineWidth = Math.max(1, t / 3.4);
      c.strokeStyle = METAL.face;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.beginPath();
      c.ellipse(x1, y1, t * 2.6, t * 1.5, a, 0, Math.PI * 2);
      c.fillStyle = METAL.lit; c.fill();
      c.fillStyle = 'rgba(20,26,34,0.55)';
      c.beginPath(); c.ellipse(x1, y1, t * 1.8, t * 1, a, 0, Math.PI * 2); c.fill();
    } else if (r.kind === 'lamp') {
      px(c, x0, y0, t * 0.7, t * 0.7, '#ff5f5f');
      const lg = c.createRadialGradient(x0, y0, 0, x0, y0, t * 2.4);
      lg.addColorStop(0, 'rgba(255,95,95,0.5)');
      lg.addColorStop(1, 'rgba(255,95,95,0)');
      c.fillStyle = lg;
      c.fillRect(x0 - t * 3, y0 - t * 3, t * 6, t * 6);
    } else {
      c.lineWidth = Math.max(1, t / 3.2);
      c.strokeStyle = METAL.lit;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      px(c, x1 - t * 0.3, y1 - t * 0.6, t * 0.7, t * 0.7, '#7ce8ff');
    }
    c.restore();
  }
}

/** One room, cut open: its own grid, furnished, with whoever is standing in it. */
function paintRoom(c: Ctx, p: Placement, t: number, snapshot: HabitatSnapshot) {
  const def = ROOM_BY_ID[p.id];
  const pal = PALETTE[def.side];
  const state = snapshot.rooms.find((r) => r.id === p.id);
  const lit = state?.lit ?? true;
  const rows = def.grid.length;

  // A dark bite of cut rock around the opening, so the room sits *in* the mass.
  px(c, (p.x - 1) * t, (p.y - 1) * t, (p.w + 2) * t, (p.h + 2) * t, ROCK.cut);

  for (let y = 0; y < rows; y += 1) {
    const line = def.grid[y]!;
    for (let x = 0; x < line.length; x += 1) {
      const ch = line[x]!;
      const gx = (p.x + x) * t;
      const gy = (p.y + y) * t;
      const seed = Math.floor(tileNoise(p.x + x, p.y + y, 1) * 997);
      const depth = rows > 1 ? 1 - y / (rows - 1) : 0;
      if (isTerrain(ch)) {
        drawTerrain(c, ch, gx, gy, t, pal, seed, depth, y);
        // Scenery goes on air and nowhere else, so it can never bury a thing
        // somebody wrote into the room on purpose.
        if (ch === '.') dressTile(c, gx, gy, t, pal, x, y, rows, p.x * 31 + p.y);
      } else {
        drawTerrain(c, '.', gx, gy, t, pal, seed, depth, y);
        const shape = shapeOf(p.id, ch);
        if (shape) drawShape(c, shape, gx, gy, t, pal, seed);
      }
    }
  }

  // Light falls from the fittings and runs out before it reaches the floor.
  const x0 = p.x * t;
  const y0 = p.y * t;
  if (lit) {
    const g = c.createLinearGradient(0, y0, 0, y0 + p.h * t);
    g.addColorStop(0, pal.glow);
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.fillStyle = g;
    c.fillRect(x0, y0, p.w * t, p.h * t);
  } else {
    c.fillStyle = 'rgba(2,2,8,0.62)';
    c.fillRect(x0, y0, p.w * t, p.h * t);
  }

  for (const person of snapshot.people) {
    if (person.room !== p.id) continue;
    drawPerson(c, person.id, (p.x + person.at.x) * t, (p.y + person.at.y - 0.1) * t, t, lit);
  }

  // The cut edge itself: bright where the rock was broken, dark inside.
  c.save();
  c.lineWidth = Math.max(1, t / 6);
  c.strokeStyle = def.side === 'hull' ? 'rgba(150,168,196,0.5)' : 'rgba(150,116,74,0.55)';
  c.strokeRect(x0, y0, p.w * t, p.h * t);
  c.restore();
}

/** A hex colour at an alpha, for the light that leaks out of a room. */
function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Warm light leaking out of every lit room into the rock around it. */
function paintBleed(c: Ctx, t: number, snapshot: HabitatSnapshot) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const room of snapshot.rooms) {
    if (!room.lit) continue;
    const p = PLACEMENT_BY_ID[room.id];
    const pal = PALETTE[ROOM_BY_ID[room.id].side];
    const cx = (p.x + p.w / 2) * t;
    const cy = (p.y + p.h / 2) * t;
    const r = Math.max(p.w, p.h) * t * 0.86;
    const g = c.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    g.addColorStop(0, withAlpha(pal.light, 0.13));
    g.addColorStop(1, withAlpha(pal.light, 0));
    c.fillStyle = g;
    c.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  c.restore();
}

export function HabitatMap({ snapshot, selected, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ref = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<RoomId | null>(null);
  const [box, setBox] = useState({ w: 900, h: 480, dpr: 2 });
  const [view, setView] = useState({ zoom: 1, ox: 0, oy: 0 });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      setBox({
        w: Math.round(r.width),
        h: Math.round(r.height),
        dpr: Math.min(2, window.devicePixelRatio || 1),
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const deviceW = box.w * box.dpr;
  const deviceH = box.h * box.dpr;
  /** Tile size that shows the whole rock at once. Zoom multiplies it. */
  const fitTile = Math.min(deviceW / FRAME.w, deviceH / FRAME.h);
  const tile = fitTile * view.zoom;

  /** Keep the world covering the window, so panning can never reveal a void.
   *  Derived at render rather than written back into state, so a resize cannot
   *  set off a cascade of renders correcting itself. */
  const fenced = useCallback((ox: number, oy: number, t: number) => {
    const ww = FRAME.w * t;
    const wh = FRAME.h * t;
    return {
      ox: ww <= deviceW ? (deviceW - ww) / 2 : Math.min(0, Math.max(deviceW - ww, ox)),
      oy: wh <= deviceH ? (deviceH - wh) / 2 : Math.min(0, Math.max(deviceH - wh, oy)),
    };
  }, [deviceH, deviceW]);

  const at = fenced(view.ox, view.oy, tile);

  // The whole world, painted once per zoom. Panning is then a blit rather than
  // fourteen thousand rectangles a frame.
  useEffect(() => {
    const world = worldRef.current ?? document.createElement('canvas');
    worldRef.current = world;
    const c = world.getContext('2d');
    if (!c || tile <= 0) return;
    world.width = Math.round(FRAME.w * tile);
    world.height = Math.round(FRAME.h * tile);
    c.imageSmoothingEnabled = false;
    paintSpace(c, world.width, world.height, tile);
    paintDebris(c, tile);
    paintAsteroid(c, tile);
    paintCorridors(c, tile);
    paintHull(c, tile);
    paintCables(c, tile, snapshot);
    for (const p of PLACEMENTS) paintRoom(c, p, tile, snapshot);
    paintBleed(c, tile, snapshot);
    paintRigging(c, tile);
  }, [snapshot, tile]);

  // What is on screen: a window onto that world, plus what the pointer is doing.
  useEffect(() => {
    const canvas = ref.current;
    const world = worldRef.current;
    const c = canvas?.getContext('2d');
    if (!canvas || !world || !c || tile <= 0) return;
    canvas.width = deviceW;
    canvas.height = deviceH;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#02020a';
    c.fillRect(0, 0, deviceW, deviceH);
    c.drawImage(world, Math.round(at.ox), Math.round(at.oy));

    for (const id of [hover, selected]) {
      if (!id) continue;
      const p = PLACEMENT_BY_ID[id];
      const on = id === selected;
      const x = p.x * tile + at.ox;
      const y = p.y * tile + at.oy;
      c.save();
      c.lineWidth = Math.max(1, tile / (on ? 3 : 4.5));
      c.strokeStyle = on ? '#ffd76a' : 'rgba(124,249,255,0.9)';
      c.strokeRect(x - tile * 0.5, y - tile * 0.5, (p.w + 1) * tile, (p.h + 1) * tile);
      if (on) {
        c.fillStyle = 'rgba(255,215,106,0.07)';
        c.fillRect(x, y, p.w * tile, p.h * tile);
      }
      const label = ROOM_BY_ID[id].name.toUpperCase();
      const fs = Math.max(9, Math.round(Math.min(tile * 1.5, box.dpr * 13)));
      c.font = `${fs}px "IBM Plex Mono", ui-monospace, monospace`;
      const tw = c.measureText(label).width;
      const lx = Math.max(4, Math.min(x, deviceW - tw - fs));
      const ly = Math.max(fs * 1.6, y - fs * 0.7);
      c.fillStyle = 'rgba(4,3,10,0.86)';
      c.fillRect(lx - fs * 0.4, ly - fs * 1.15, tw + fs * 0.8, fs * 1.6);
      c.fillStyle = on ? '#ffd76a' : '#7cf9ff';
      c.fillText(label, lx, ly);
      c.restore();
    }
  }, [at.ox, at.oy, box.dpr, deviceH, deviceW, hover, selected, tile]);

  const tileFromEvent = (e: { clientX: number; clientY: number }) => {
    const canvas = ref.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const dx = ((e.clientX - r.left) / r.width) * deviceW;
    const dy = ((e.clientY - r.top) / r.height) * deviceH;
    return roomAt(Math.floor((dx - at.ox) / tile), Math.floor((dy - at.oy) / tile));
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const px0 = ((e.clientX - r.left) / r.width) * deviceW;
    const py0 = ((e.clientY - r.top) / r.height) * deviceH;
    setView((v) => {
      // Zoom about the pointer, so the thing under it stays under it.
      const next = Math.max(1, Math.min(5, v.zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
      if (next === v.zoom) return v;
      const k = next / v.zoom;
      const from = fenced(v.ox, v.oy, fitTile * v.zoom);
      return { zoom: next, ...fenced(px0 - (px0 - from.ox) * k, py0 - (py0 - from.oy) * k, fitTile * next) };
    });
  };

  return (
    <div className="hab-map" ref={wrapRef}>
      <canvas
        ref={ref}
        className="hab-map__canvas"
        style={{ width: box.w, height: box.h }}
        onWheel={onWheel}
        onMouseDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY, ox: at.ox, oy: at.oy, moved: false };
        }}
        onMouseMove={(e) => {
          const d = dragRef.current;
          if (d) {
            const dx = (e.clientX - d.x) * box.dpr;
            const dy = (e.clientY - d.y) * box.dpr;
            if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
            setView((v) => ({ ...v, ...fenced(d.ox + dx, d.oy + dy, tile) }));
            return;
          }
          setHover(tileFromEvent(e));
        }}
        onMouseUp={(e) => {
          const d = dragRef.current;
          dragRef.current = null;
          if (d && !d.moved) {
            const id = tileFromEvent(e);
            if (id) onSelect(id);
          }
        }}
        onMouseLeave={() => { dragRef.current = null; setHover(null); }}
        role="img"
        aria-label="The habitat: a wrecked ship driven into an asteroid, cut open"
      />
      <div className="hab-map__bar">
        <span className="hab-map__hint">
          {hover ? ROOM_BY_ID[hover].name : 'Sixteen rooms · drag to move · scroll to go closer'}
        </span>
        {view.zoom > 1.01 ? (
          <button
            type="button"
            className="hab-map__reset"
            onClick={() => setView({ zoom: 1, ...fenced(0, 0, fitTile) })}
          >
            whole rock
          </button>
        ) : null}
      </div>
    </div>
  );
}
