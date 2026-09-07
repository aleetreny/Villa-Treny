// One material language for the ship. Every art pixel is a measured ZIP crop.
// Geometry (including solid crates) comes from the navigation model.
import { CORRIDOR_CROPS, loadCorridorSources } from './corridor-kit.js';

export const EXPLORER_CROPS = {
  ...CORRIDOR_CROPS,
  outdoorCenter: { sheet: 'shelterTerrain', rect: [32, 416, 32, 32] },
};

let sourcePromise;
const sourcesOnce = () => sourcePromise ??= loadCorridorSources();

export function corridorProps(scene) {
  const props = (scene.props ?? []).map((prop) => ({
    crop: 'crateClosed', x: prop.at.x * 32 + 7, y: prop.at.y * 32 + 4,
  }));
  if (scene.group === 'surface') {
    for (let x = 2; x < scene.grid[0].length - 1; x += 4) {
      if (scene.grid[0][x] === '#' && scene.grid[1][x] === '#') {
        props.push({ crop: x % 8 === 2 ? 'barrelLeaves' : 'tireFlowers', x: x * 32 + 4, y: 9 });
      }
    }
  }
  return props;
}

/** Expand the structural grid to 4px so the empty space beside boxes is free. */
export function corridorArtLayout(scene) {
  const width = scene.grid[0].length * 8;
  const height = scene.grid.length * 8;
  const grid = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    const cell = scene.grid[Math.floor(y / 8)][Math.floor(x / 8)];
    if (cell !== '#') return '.';
    // Outdoor rim is terrain, not an invisible wall. Its inset and all inner
    // soil remain usable; planter sprites below reserve their actual bounds.
    if (scene.group === 'surface' && x >= 4 && x < width - 4 && y >= 4 && y < height - 4) return '.';
    return '#';
  }));
  for (const prop of corridorProps(scene)) {
    const crop = EXPLORER_CROPS[prop.crop];
    const w = crop.rect[2] / (crop.exportScale ?? 1), h = crop.rect[3] / (crop.exportScale ?? 1);
    for (let y = Math.floor(prop.y / 4); y < Math.ceil((prop.y + h) / 4); y += 1) {
      for (let x = Math.floor(prop.x / 4); x < Math.ceil((prop.x + w) / 4); x += 1) grid[y][x] = '#';
    }
  }
  const toArtCell = (point) => ({ x: point.x * 8 + 4, y: point.y * 8 + 4 });
  const exits = scene.exits.map((exit) => {
    const at = toArtCell(exit.at);
    if (exit.outward === 'north') at.y = 0;
    if (exit.outward === 'south') at.y = height - 1;
    if (exit.outward === 'west') at.x = 0;
    if (exit.outward === 'east') at.x = width - 1;
    const along = exit.outward === 'north' || exit.outward === 'south' ? exit.at.x : exit.at.y;
    return { ...exit, at, span: { from: along * 8, to: along * 8 + 7 } };
  });
  return { grid: grid.map((row) => row.join('')), cellSize: 4, exits, toArtCell };
}

function stamp(g, sources, name, x, y, width, height, offsetY = 0) {
  const crop = EXPLORER_CROPS[name];
  const [sx, sy, sw, sh] = crop.rect;
  const scale = crop.exportScale ?? 1;
  const w = width ?? sw / scale;
  const h = height ?? sh / scale;
  g.drawImage(sources[crop.sheet], sx, sy + offsetY * scale, w * scale, h * scale, x, y, w, h);
}

function floorTile(g, sources, name, x, y) {
  const crop = EXPLORER_CROPS[name];
  const w = crop.rect[2] / (crop.exportScale ?? 1);
  const h = crop.rect[3] / (crop.exportScale ?? 1);
  for (let dy = 0; dy < 32; dy += h) {
    for (let dx = 0; dx < 32; dx += w) {
      stamp(g, sources, name, x + dx, y + dy, Math.min(w, 32 - dx), Math.min(h, 32 - dy));
    }
  }
}

function nearThreshold(scene, x, y) {
  return scene.exits.some((exit) => exit.to.startsWith('room:') && (
    exit.outward === 'north' && exit.at.x === x && y < 2
    || exit.outward === 'south' && exit.at.x === x && y >= scene.grid.length - 2
  ));
}

function wallTile(g, sources, scene, x, y) {
  const height = scene.grid.length;
  // A 64px back wall is copied as two original 32px rows, never stretched.
  const upper = y === 0;
  const crop = upper ? 'workshopWall' : 'workshopLowWall';
  stamp(g, sources, crop, x * 32, y * 32, 32, 32);
  // Small damaged panels flank administrative openings only.
  if (scene.group === 'office' && y < 2 && scene.exits.some((exit) => (
    exit.outward === 'north' && exit.at.x + 1 === x
  ))) stamp(g, sources, 'officeTornTop', x * 32, y * 32, 32, 32, y * 32);
  // Sparse fittings stay entirely on the solid wall cells.
  if (y === 0 && x % 8 === 1) stamp(g, sources, 'workshopLamp', x * 32 + 11, 9);
  if (y === 0 && x % 12 === 6) stamp(g, sources, 'workshopNotice', x * 32 + 9, 8);
  if (scene.corridorId === 'spine' && x === 0 && y > 0 && y < height - 1 && y % 12 === 5) {
    stamp(g, sources, 'workshopLamp', 11, y * 32 + 9);
  }
}

function outdoorTile(g, sources, scene, x, y, cell) {
  const width = scene.grid[0].length;
  const height = scene.grid.length;
  if (cell !== '#') {
    floorTile(g, sources, nearThreshold(scene, x, y) ? 'outdoorCenter' : 'gardenSoil', x * 32, y * 32);
    return;
  }
  // The original terrain rim supplies the exterior silhouette. Inner boundary
  // cells carry real planter sprites, so there is no invisible indoor wall.
  const column = x === 0 ? 0 : x === width - 1 ? 2 : 1;
  const row = y === 0 ? 12 : y === height - 1 ? 14 : 13;
  g.drawImage(sources.shelterTerrain, column * 32, row * 32, 32, 32, x * 32, y * 32, 32, 32);
}

/** Pure draw routine; tests pass a context exposing drawImage only. */
export function drawExplorerCorridor(g, sources, scene) {
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < scene.grid.length; y += 1) {
    for (let x = 0; x < scene.grid[y].length; x += 1) {
      const cell = scene.grid[y][x];
      if (scene.group === 'surface') outdoorTile(g, sources, scene, x, y, cell);
      else if (cell === '#') wallTile(g, sources, scene, x, y);
      else {
        const worn = (x * 7 + y * 11) % 31;
        floorTile(g, sources, worn === 0 ? 'workshopWornA' : worn === 1 ? 'workshopWornB' : 'workshopFloor', x * 32, y * 32);
        // Keep the entire missing-wall opening recognisable as deck. Only the
        // last 8px touch the next material: a tall timber patch reads as a door.
        if (['commons', 'office', 'midcentury', 'heritage', 'diner', 'diggings'].includes(scene.group)
          && nearThreshold(scene, x, y) && (y === 0 || y === scene.grid.length - 1)) {
          stamp(g, sources, 'commonFloor', x * 32, y * 32 + (y === 0 ? 0 : 24));
        }
      }
    }
  }
  for (const prop of corridorProps(scene)) stamp(g, sources, prop.crop, prop.x, prop.y);
}

export async function createCorridorArt(scene) {
  const sources = await sourcesOnce();
  const canvas = document.createElement('canvas');
  canvas.width = scene.grid[0].length * 32;
  canvas.height = scene.grid.length * 32;
  drawExplorerCorridor(canvas.getContext('2d'), sources, scene);
  return { canvas, ...corridorArtLayout(scene), cellWidth: 4, cellHeight: 4, width: canvas.width, height: canvas.height };
}
