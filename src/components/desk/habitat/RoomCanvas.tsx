// Inside a room.
//
// The warm half. The cutaway is a survey drawn in hairlines; this is the place the
// survey is of, and it is drawn as pixels on a canvas with smoothing off and an
// integer scale, so a tile is always a whole number of screen pixels and nothing
// is ever half a colour.
//
// The grid it draws is the same array the engine walks people across and the same
// one that goes into a prompt. There is no second representation and no
// translation step, which is why a person standing at (14, 5) is standing at
// (14, 5) here too.

import { useEffect, useRef, useState } from 'react';
import { ROOM_BY_ID, type RoomId } from '../../../lib/habitat/rooms';
import { RESIDENT_BY_ID } from '../../../lib/habitat/residents';
import { PALETTE, ACCENTS, personColours, shapeOf, type Shape } from '../../../lib/habitat/tiles';
import type { HabitatSnapshot, PersonState } from '../../../lib/habitat/snapshot';
import { isTerrain } from '../../../lib/habitat/grid';

/** Logical pixels per tile before the integer scale is applied. */
const TILE = 12;

type Props = {
  room: RoomId;
  snapshot: HabitatSnapshot;
  hovered: PersonState | null;
  onHover: (p: PersonState | null) => void;
  onPick: (p: PersonState) => void;
};

type Ctx = CanvasRenderingContext2D;

function px(c: Ctx, x: number, y: number, w: number, h: number, fill: string) {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}

/** Deterministic speckle, so stone looks like stone and does not crawl. */
function grain(c: Ctx, x: number, y: number, seed: number, tint: string) {
  const a = (seed * 2654435761) >>> 0;
  c.fillStyle = tint;
  if ((a & 3) === 0) c.fillRect(x + 2, y + 3, 1, 1);
  if ((a & 12) === 4) c.fillRect(x + 7, y + 8, 1, 1);
  if ((a & 48) === 16) c.fillRect(x + 9, y + 2, 1, 1);
  if ((a & 192) === 64) c.fillRect(x + 4, y + 9, 1, 1);
}

/** The far wall of the room, receding upward away from the floor. Drawing `.` as
 *  flat air makes a nine-metre hall read as a void; drawing it as the surface you
 *  would actually be looking at makes it a room. */
function backWall(c: Ctx, x: number, y: number, pal: typeof PALETTE.hull, seed: number, depth: number) {
  px(c, x, y, TILE, TILE, pal.back);
  c.globalAlpha = 0.16 + depth * 0.5;
  px(c, x, y, TILE, TILE, pal.air);
  c.globalAlpha = 1;
  grain(c, x, y, seed, pal.backGrain);
  // A course line every few tiles, so the surface has a scale to read against.
  if ((y / TILE) % 3 === 0) {
    c.globalAlpha = 0.35;
    px(c, x, y, TILE, 1, pal.backGrain);
    c.globalAlpha = 1;
  }
}

function drawTerrain(
  c: Ctx, ch: string, x: number, y: number, pal: typeof PALETTE.hull, seed: number,
  depth = 0,
) {
  switch (ch) {
    case '#':
    case '|':
      px(c, x, y, TILE, TILE, pal.solid);
      grain(c, x, y, seed, pal.solidEdge);
      px(c, x, y, TILE, 1, pal.solidEdge);
      break;
    case '=':
      px(c, x, y, TILE, TILE, pal.floor);
      px(c, x, y, TILE, 2, pal.floorEdge);
      px(c, x, y + 2, TILE, 1, pal.solid);
      grain(c, x, y, seed, pal.solid);
      break;
    case '.':
      backWall(c, x, y, pal, seed, depth);
      break;
    case '+':
      backWall(c, x, y, pal, seed, depth);
      px(c, x, y, 2, TILE, pal.floorEdge);
      px(c, x + TILE - 2, y, 2, TILE, pal.floorEdge);
      break;
    case 'X':
      px(c, x, y, TILE, TILE, pal.solid);
      px(c, x + 1, y + 1, TILE - 2, TILE - 2, pal.matter);
      px(c, x + 4, y + 4, 4, 4, pal.matterEdge);
      break;
    case '^':
    case 'v':
      backWall(c, x, y, pal, seed, depth);
      px(c, x + 2, y, 2, TILE, pal.matterEdge);
      px(c, x + TILE - 4, y, 2, TILE, pal.matterEdge);
      px(c, x + 2, y + 5, TILE - 6, 2, pal.matterEdge);
      break;
    case '~':
      px(c, x, y, TILE, TILE, '#12303a');
      px(c, x, y + ((seed % 3) + 2), TILE, 1, '#2c6a7d');
      break;
    case ':':
      backWall(c, x, y, pal, seed, depth);
      for (let i = 1; i < TILE; i += 3) px(c, x + i, y, 1, TILE, pal.matterEdge);
      break;
    case ',':
      backWall(c, x, y, pal, seed, depth);
      px(c, x, y + 6, TILE, 6, pal.solid);
      grain(c, x, y, seed, pal.solidEdge);
      break;
    case '"':
      backWall(c, x, y, pal, seed, depth);
      px(c, x + 2, y + 4, 2, 8, '#4e7d3a');
      px(c, x + 6, y + 2, 2, 10, '#67a04b');
      px(c, x + 9, y + 6, 2, 6, '#4e7d3a');
      break;
    case '*':
      px(c, x, y, TILE, TILE, '#010104');
      if ((seed & 7) === 3) px(c, x + 5, y + 4, 1, 1, '#93a7c4');
      break;
    default:
      backWall(c, x, y, pal, seed, depth);
  }
}

function drawShape(
  c: Ctx, shape: Shape, x: number, y: number, pal: typeof PALETTE.hull,
) {
  const body = ACCENTS[shape] ?? pal.matter;
  const edge = ACCENTS[shape] ? body : pal.matterEdge;
  switch (shape) {
    case 'crate':
      px(c, x + 1, y + 3, TILE - 2, TILE - 3, body);
      px(c, x + 1, y + 3, TILE - 2, 1, edge);
      px(c, x + 1, y + 7, TILE - 2, 1, edge);
      break;
    case 'bunk':
      px(c, x, y + 7, TILE, 5, body);
      px(c, x, y + 6, TILE, 1, edge);
      px(c, x + 1, y + 4, 4, 2, '#b9c3d2');
      break;
    case 'panel':
      px(c, x + 1, y + 1, TILE - 2, 7, '#101822');
      px(c, x + 1, y + 1, TILE - 2, 1, edge);
      px(c, x + 3, y + 3, 2, 1, pal.light);
      px(c, x + 6, y + 5, 3, 1, pal.light);
      break;
    case 'table':
      // Tiles abut, so a run of them becomes one long table with trestles.
      px(c, x, y + 4, TILE, 3, edge);
      px(c, x, y + 7, TILE, 2, body);
      px(c, x + 2, y + 9, 2, 3, body);
      px(c, x + TILE - 4, y + 9, 2, 3, body);
      break;
    case 'tank':
      px(c, x + 2, y + 1, TILE - 4, TILE - 1, body);
      px(c, x + 2, y + 1, TILE - 4, 2, edge);
      px(c, x + 4, y + 5, 1, 5, edge);
      break;
    case 'machine':
      px(c, x + 1, y + 2, TILE - 2, TILE - 2, body);
      px(c, x + 1, y + 2, TILE - 2, 1, edge);
      for (let i = 0; i < 3; i += 1) px(c, x + 3, y + 5 + i * 2, TILE - 6, 1, edge);
      break;
    case 'rack':
      px(c, x + 1, y, 2, TILE, edge);
      px(c, x + TILE - 3, y, 2, TILE, edge);
      px(c, x + 3, y + 2, TILE - 6, 3, body);
      px(c, x + 3, y + 7, TILE - 6, 3, body);
      break;
    case 'plant':
      px(c, x + 4, y + 7, 3, 5, '#5d4326');
      px(c, x + 2, y + 3, 8, 4, body);
      px(c, x + 4, y + 1, 4, 3, body);
      break;
    case 'seat':
      // A plank on two short legs, sitting lower than the table it serves, so a
      // run of benches beside a run of table reads as two different things.
      px(c, x, y + 8, TILE, 2, body);
      px(c, x, y + 8, TILE, 1, edge);
      px(c, x + 2, y + 10, 2, 2, edge);
      px(c, x + TILE - 4, y + 10, 2, 2, edge);
      break;
    case 'mark':
      px(c, x + 2, y + 2, TILE - 4, 8, body);
      px(c, x + 3, y + 4, TILE - 7, 1, '#3a3a3a');
      px(c, x + 3, y + 6, TILE - 6, 1, '#3a3a3a');
      px(c, x + 5, y + 1, 2, 2, '#c8622f');
      break;
    case 'surface':
      // Dressed, clean, and with nothing on it. Which is the entry.
      px(c, x, y, TILE, TILE, pal.solidEdge);
      px(c, x, y, TILE, 1, pal.matterEdge);
      px(c, x, y + TILE - 1, TILE, 1, pal.solid);
      break;
    case 'berth':
    case 'berth-named':
      px(c, x + 1, y + 1, TILE - 2, TILE - 2, '#1d2f3c');
      px(c, x + 2, y + 2, TILE - 4, TILE - 4, body);
      px(c, x + 3, y + 4, TILE - 6, 3, '#bfe6f5');
      if (shape === 'berth-named') {
        // Tape, and a name nobody had any way of knowing.
        px(c, x + 2, y + 8, TILE - 4, 2, '#e8dcc0');
        px(c, x + 3, y + 9, 2, 1, '#4a4438');
        px(c, x + 6, y + 9, 3, 1, '#4a4438');
      }
      break;
    case 'pile':
      px(c, x + 1, y + 8, TILE - 2, 4, body);
      px(c, x + 3, y + 6, TILE - 7, 2, body);
      px(c, x + 5, y + 4, 3, 2, edge);
      break;
    case 'lamp':
      px(c, x, y, TILE, 3, body);
      px(c, x + 2, y + 3, TILE - 4, 1, '#fff4d0');
      break;
    case 'port':
      px(c, x + 1, y + 1, TILE - 2, TILE - 2, body);
      px(c, x + 2, y + 2, TILE - 4, TILE - 4, '#05070f');
      px(c, x + 4, y + 4, 1, 1, '#dce8ff');
      px(c, x + 7, y + 8, 1, 1, '#dce8ff');
      // The crack, and the patch over it.
      px(c, x + 1, y + 5, TILE - 2, 1, '#8d97a8');
      break;
    case 'home':
      px(c, x + 3, y + 6, TILE - 6, 6, '#3a2a1c');
      px(c, x + 4, y + 8, TILE - 8, 3, body);
      break;
  }
}

/** A person, ten pixels tall, with their own two colours. */
function drawPerson(c: Ctx, p: PersonState, x: number, y: number, lit: boolean) {
  const { body, head } = personColours(p.id);
  const dim = lit ? 1 : 0.45;
  // Contact with the floor, or the figure hovers over it.
  c.globalAlpha = dim * 0.45;
  px(c, x + 3, y + 12, 7, 1, '#000000');
  c.globalAlpha = dim;
  px(c, x + 4, y + 2, 4, 4, head);
  px(c, x + 4, y + 6, 4, 5, body);
  px(c, x + 3, y + 7, 1, 3, body);
  px(c, x + 8, y + 7, 1, 3, body);
  px(c, x + 4, y + 11, 1, 1, '#1b1a17');
  px(c, x + 7, y + 11, 1, 1, '#1b1a17');
  c.globalAlpha = 1;
}

export function RoomCanvas({ room, snapshot, hovered, onHover, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(3);
  const def = ROOM_BY_ID[room];
  const state = snapshot.rooms.find((r) => r.id === room);
  const here = snapshot.people.filter((p) => p.room === room);

  // An integer scale, so a tile is always a whole number of screen pixels.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const fit = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const cols = def.grid[0]?.length ?? 1;
      const rows = def.grid.length || 1;
      const next = Math.max(2, Math.floor(Math.min(width / (cols * TILE), height / (rows * TILE))));
      setScale(next);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [def]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const c = canvas.getContext('2d');
    if (!c) return;
    const cols = def.grid[0]?.length ?? 1;
    const rows = def.grid.length || 1;
    canvas.width = cols * TILE;
    canvas.height = rows * TILE;
    c.imageSmoothingEnabled = false;
    const pal = PALETTE[def.side];
    const lit = state?.lit ?? true;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const ch = def.grid[y]![x]!;
        const gx = x * TILE;
        const gy = y * TILE;
        const seed = x * 73856093 + y * 19349663;
        const depth = rows > 1 ? 1 - y / (rows - 1) : 0;
        if (isTerrain(ch)) {
          drawTerrain(c, ch, gx, gy, pal, seed, depth);
        } else {
          drawTerrain(c, '.', gx, gy, pal, seed, depth);
          const shape = shapeOf(room, ch);
          if (shape) drawShape(c, shape, gx, gy, pal);
        }
      }
    }

    // Light comes from the fittings near the ceiling and falls off downward, and
    // it is the difference between a room and a diagram of one.
    if (lit) {
      const grad = c.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, pal.glow);
      grad.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
      c.fillStyle = grad;
      c.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      c.fillStyle = 'rgba(2, 2, 6, 0.55)';
      c.fillRect(0, 0, canvas.width, canvas.height);
    }

    for (const p of here) drawPerson(c, p, p.at.x * TILE, p.at.y * TILE - 1, lit);

    if (hovered && hovered.room === room) {
      c.strokeStyle = '#ffd76a';
      c.lineWidth = 1;
      c.strokeRect(hovered.at.x * TILE + 0.5, hovered.at.y * TILE - 1.5, TILE - 1, TILE + 1);
    }
  }, [def, here, hovered, room, state]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>): PersonState | null => {
    const canvas = ref.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const tx = Math.floor(((e.clientX - r.left) / r.width) * (def.grid[0]?.length ?? 1));
    const ty = Math.floor(((e.clientY - r.top) / r.height) * def.grid.length);
    return here.find((p) => p.at.x === tx && p.at.y === ty) ?? null;
  };

  return (
    <div className="hab-room-view" ref={wrapRef}>
      <canvas
        ref={ref}
        className="hab-room-view__canvas"
        style={{
          width: `${(def.grid[0]?.length ?? 1) * TILE * scale}px`,
          height: `${def.grid.length * TILE * scale}px`,
        }}
        onMouseMove={(e) => onHover(pick(e))}
        onMouseLeave={() => onHover(null)}
        onClick={(e) => {
          const p = pick(e);
          if (p) onPick(p);
        }}
        aria-label={`Inside ${def.name}`}
      />
      {hovered && hovered.room === room ? (
        <p className="hab-room-view__tip">
          <b>{RESIDENT_BY_ID[hovered.id].name}</b>
          {' — '}
          {hovered.doing}
        </p>
      ) : null}
    </div>
  );
}
