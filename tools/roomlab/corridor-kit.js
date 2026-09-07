// Habitat corridors: source pixels only.
//
// Interiors have opaque ZIP floors; the exterior uses the source terrain rim.
// Every visible layer is copied with drawImage; there are
// no colour fills, strokes, paths, gradients or generated furniture.

export const T = 32;

export const CORRIDORS = {
  climb: {
    label: 'The Climb', W: 160, H: 288, zoom: 2,
    grid: [
      '##+##', '##^##', '##^##', '##^##', '##^##',
      '##v##', '##v##', '##v##', '##+##',
    ],
    exits: [{ room: 'Bridge', x: 2, y: 0 }, { room: 'Dock', x: 2, y: 8 }],
  },
  longwalk: {
    label: 'The Long Walk', W: 160, H: 864, zoom: 1,
    grid: [
      '##+##', '#===#', '+===#', '#===#', '#===#', '#=p=#', '#===#',
      '#===#', '#===#', '#===#', '+===+', '#===#', '#===#', '#===#',
      '#===#', '#===#', '#===#', '#===#', '+===+', '#===#', '#===#',
      '#=l=#', '#===#', '#===#', '#===#', 'X===#', '##+##',
    ],
    exits: [
      { room: 'Dock', x: 2, y: 0 },
      { room: 'Cabin One', x: 0, y: 2 },
      { room: 'Cabin Two', x: 0, y: 10 },
      { room: 'Cabin Four', x: 4, y: 10 },
      { room: 'Cabin Three', x: 0, y: 18 },
      { room: 'Cabin Five', x: 4, y: 18 },
      { room: 'Breach', x: 0, y: 25, sealed: true },
      { room: 'Hold', x: 2, y: 26 },
    ],
  },
  throat: {
    label: 'The Throat', W: 320, H: 192, zoom: 2,
    grid: ['##########', '###====###', '+========+', '#========#', '###====###', '##########'],
    exits: [{ room: 'Infirmary', x: 0, y: 2 }, { room: 'Workshops', x: 9, y: 2 }],
  },
  landing: {
    label: 'The Landing', W: 384, H: 224, zoom: 2,
    grid: [
      '############', '############', '############',
      '+==========+', '#==========#', '#==###=====#', '############',
    ],
    exits: [{ room: 'Workshops', x: 0, y: 3 }, { room: 'Common', x: 11, y: 3 }],
  },
  cut: {
    label: 'The Cut', W: 320, H: 192, zoom: 2,
    grid: ['##########', '##########', '#========#', '+========+', '#========#', '##########'],
    exits: [{ room: 'Common', x: 0, y: 3 }, { room: 'Administration', x: 9, y: 3 }],
  },
  greenrun: {
    label: 'The Green Run', W: 384, H: 192, zoom: 2,
    grid: ['############', '############', '#==========#', '+==========+', '#==##===##=#', '############'],
    exits: [{ room: 'Hydroponics Yard', x: 0, y: 3 }, { room: 'Shelter Entrance', x: 11, y: 3 }],
  },
};

export const CORRIDOR_SOURCES = {
  shelterFurniture: './library/sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Furniture_32x32.png',
  shelterWalls: './library/sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Walls_32x32.png',
  workshop: './library/sheets/PostApoc_Workshop/PostApoc_Workshop.png',
  workshopRoom: './library/sheets/PostApoc_Workshop/PostApoc_Workshop_RoomTiles.png',
  common: './library/rooms/Xmas_3.png',
  officeWalls: './library/sheets/Post Apoc Office - Asset Pack/Post Apoc - Office 32x32 Grid/Office_Walls_32x32.png',
  garden: './library/rooms/Garden_Planters_1.png',
  gardenBarrels: './library/sheets/Garden_Planters/Garden_Planters_OilBarrel.png',
  gardenTires: './library/sheets/Garden_Planters/Garden_Planters_RubberTire.png',
  shelterTerrain: './library/sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Terrain_Tiles_32x32.png',
};

export const CORRIDOR_MANIFEST = {
  climb: [
    'Workshop room tile (8,8) · opaque deck underlay',
    'Shelter wall tiles, rows 10–11 · corrugated shaft',
    'Shelter furniture tile (4,12), 1×2 · repeated grey ladder',
  ],
  longwalk: [
    'Workshop room tiles (8,8), (7,7) and (7,8) · deck and worn patches',
    'Shelter wall tiles, rows 10–11 · inherited hull sides',
    'Workshop deck at the seven usable exits · gaps in the hull, with no doors or frames',
    'Shelter plate closes the unused service recess and the sealed Breach access',
    'Workshop raw crops (131,352,10,14) · strip lamps',
  ],
  throat: [
    'Workshop room tile (8,8) · continuous floor',
    'Shelter wall tiles, rows 10–11 · Infirmary-side plate',
    'Workshop room tile (4,7), 1×2 · Workshop-side block wall',
    'Workshop floor at both endpoints · gaps in the side walls, with no doors or frames',
    'Shelter first-aid tile (8,8) and Workshop notice crop (465,388,14,21) · endpoint markers',
  ],
  landing: [
    'Workshop · continuous block walls, worn tiles, grate and wall fittings',
    'Common · exact timber floor from Xmas_3.png, at the Common entrance',
    'Shelter · three original storage-crate sprites, outside the walking lane',
  ],
  cut: [
    'Common · the same timber floor as the approved sitting room',
    'Post Apoc Office · torn wallpaper and exposed masonry; open gaps at the exits',
  ],
  greenrun: [
    'Garden Planters · exact Yard soil, planted oil barrels and tire planters',
    'Post Apoc Shelter · original brown exterior terrain; no recolouring',
  ],
};

// Original export rectangles. The two room PNGs contain 4× enlarged art:
// division by four recovers native pixels; final display zoom stays integral.
// Every other crop is copied 1:1. These are also consumed by the source audit.
export const CORRIDOR_CROPS = {
  workshopFloor: { sheet: 'workshopRoom', rect: [256, 256, 32, 32] },
  workshopWornA: { sheet: 'workshopRoom', rect: [224, 224, 32, 32] },
  workshopWornB: { sheet: 'workshopRoom', rect: [224, 256, 32, 32] },
  workshopWall: { sheet: 'workshopRoom', rect: [128, 224, 32, 64] },
  workshopLowWall: { sheet: 'workshopRoom', rect: [128, 256, 32, 32] },
  workshopEdge: { sheet: 'workshopRoom', rect: [26, 64, 6, 32] },
  workshopCap: { sheet: 'workshopRoom', rect: [32, 58, 32, 6] },
  workshopGrate: { sheet: 'workshop', rect: [227, 417, 59, 31] },
  workshopLamp: { sheet: 'workshop', rect: [131, 352, 10, 14] },
  workshopNotice: { sheet: 'workshop', rect: [465, 388, 14, 21] },
  workshopPipe: { sheet: 'workshop', rect: [140, 422, 16, 5] },
  workshopValve: { sheet: 'workshop', rect: [0, 436, 16, 8] },
  commonFloor: { sheet: 'common', rect: [232, 510, 128, 32], exportScale: 4 },
  crateClosed: { sheet: 'shelterFurniture', rect: [327, 391, 18, 24] },
  crateOpen: { sheet: 'shelterFurniture', rect: [356, 387, 26, 28] },
  crateWide: { sheet: 'shelterFurniture', rect: [483, 385, 24, 30] },
  officeWall: { sheet: 'officeWalls', rect: [192, 224, 32, 64] },
  officeTornTop: { sheet: 'officeWalls', rect: [224, 224, 32, 64] },
  officeTornBase: { sheet: 'officeWalls', rect: [256, 224, 32, 64] },
  officeMasonry: { sheet: 'officeWalls', rect: [288, 224, 64, 64] },
  officeLowWall: { sheet: 'officeWalls', rect: [192, 256, 32, 32] },
  officeEdge: { sheet: 'officeWalls', rect: [26, 130, 6, 32] },
  officeCap: { sheet: 'officeWalls', rect: [32, 122, 32, 6] },
  officeSkirting: { sheet: 'officeWalls', rect: [192, 280, 32, 8] },
  gardenSoil: { sheet: 'garden', rect: [331, 379, 128, 96], exportScale: 4 },
  barrelSeedling: { sheet: 'gardenBarrels', rect: [70, 113, 20, 46] },
  barrelLeaves: { sheet: 'gardenBarrels', rect: [102, 112, 20, 47] },
  tireFlowers: { sheet: 'gardenTires', rect: [100, 183, 24, 40] },
  tireFruit: { sheet: 'gardenTires', rect: [132, 183, 24, 40] },
};

// Full sprite bounds, not just their stems or bases, reserve space in the grid.
// Floor grates and wall-mounted fittings are deliberately not solid objects.
export const CORRIDOR_OBSTACLES = {
  landing: [
    { crop: 'crateWide', x: 88, y: 62 },
    { crop: 'crateOpen', x: 274, y: 66 },
    { crop: 'crateClosed', x: 308, y: 70 },
    { crop: 'crateOpen', x: 104, y: 163 },
    { crop: 'crateClosed', x: 142, y: 168 },
  ],
  cut: [],
  greenrun: [
    { crop: 'barrelLeaves', x: 38, y: 16 },
    { crop: 'tireFruit', x: 84, y: 23 },
    { crop: 'tireFlowers', x: 244, y: 23 },
    { crop: 'barrelSeedling', x: 310, y: 17 },
    { crop: 'barrelSeedling', x: 110, y: 129 },
    { crop: 'tireFlowers', x: 268, y: 135 },
  ],
};

export async function loadCorridorSources() {
  const sources = {};
  await Promise.all(Object.entries(CORRIDOR_SOURCES).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { sources[key] = image; resolve(); };
    image.onerror = () => reject(new Error('Could not load corridor source: ' + src));
    image.src = src;
  })));
  return sources;
}

function copy(g, image, sx, sy, sw, sh, dx, dy, dw = sw, dh = sh) {
  g.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

function tile(g, image, sx, sy, sw, sh, x0, y0, x1, y1) {
  for (let y = y0; y < y1; y += sh) {
    for (let x = x0; x < x1; x += sw) {
      copy(g, image, sx, sy, Math.min(sw, x1 - x), Math.min(sh, y1 - y), x, y);
    }
  }
}

function deck(g, sources, W, H) {
  tile(g, sources.workshopRoom, 8 * T, 8 * T, T, T, 0, 0, W, H);
}

function shelterPanel(g, sources, column, x, y, height = T * 2) {
  copy(g, sources.shelterWalls, column * T, 10 * T, T, height, x, y);
}

function drawClimb(g, sources) {
  const { W, H } = CORRIDORS.climb;
  deck(g, sources, W, H);
  const panels = [1, 2, 3, 4, 5, 6, 8, 10, 11];
  for (let y = 0; y < H; y += T * 2) {
    for (let x = 0; x < W; x += T) {
      shelterPanel(g, sources, panels[(x / T + y / (T * 2)) % panels.length], x, y, Math.min(T * 2, H - y));
    }
  }
  // Two actual landings, with the shaft running continuously between them.
  tile(g, sources.workshopRoom, 8 * T, 8 * T, T, T, 0, 0, W, T);
  tile(g, sources.workshopRoom, 8 * T, 8 * T, T, T, 0, H - T, W, H);
  for (const y of [T, T * 3, T * 5, T * 7]) {
    copy(g, sources.shelterFurniture, 4 * T, 12 * T, T, T * 2, T * 2, y);
  }
}

function drawLongWalk(g, sources) {
  const { W, H } = CORRIDORS.longwalk;
  deck(g, sources, W, H);
  const panels = [1, 2, 3, 4, 5, 6, 8, 10, 11];
  for (let y = 0; y < H; y += T * 2) {
    shelterPanel(g, sources, panels[(y / (T * 2)) % panels.length], 0, y, Math.min(T * 2, H - y));
    shelterPanel(g, sources, panels[(y / (T * 2) + 4) % panels.length], W - T, y, Math.min(T * 2, H - y));
  }

  // The off-centre worn route described in the room lore. These are alternate
  // floor tiles from the same measured Workshop floor family.
  const worn = [[2, 4, 7], [1, 7, 8], [2, 12, 8], [2, 16, 7], [1, 20, 8], [2, 23, 7]];
  for (const [x, y, row] of worn) copy(g, sources.workshopRoom, 7 * T, row * T, T, T, x * T, y * T);

  // Each real exit is floor continuing through a missing wall cell. The old
  // unconnected hatch and the sealed Breach access retain their hull plate.
  for (const y of [0, H - T]) {
    for (const x of [1, 3]) shelterPanel(g, sources, x, x * T, y, T);
  }
  for (const exit of CORRIDORS.longwalk.exits.filter((item) => !item.sealed)) {
    copy(g, sources.workshopRoom, 8 * T, 8 * T, T, T, exit.x * T, exit.y * T);
  }

  for (const y of [T * 6, T * 14, T * 22]) {
    copy(g, sources.workshop, 131, 352, 10, 14, W - T + 10, y + 8);
  }
}

function drawThroat(g, sources) {
  const { W, H } = CORRIDORS.throat;
  deck(g, sources, W, H);

  const leftPanels = [8, 10, 11, 8, 10];
  for (let x = 0; x < W / 2; x += T) {
    shelterPanel(g, sources, leftPanels[x / T], x, 0);
  }
  for (let x = W / 2; x < W; x += T) {
    copy(g, sources.workshopRoom, 4 * T, 7 * T, T, T * 2, x, 0);
  }

  // One wall-row underfoot at the lower edge makes the passage a tube rather
  // than an open room, while the middle three rows stay entirely free.
  for (let x = 0; x < W / 2; x += T) {
    copy(g, sources.shelterWalls, leftPanels[x / T] * T, 11 * T, T, T, x, H - T);
  }
  for (let x = W / 2; x < W; x += T) {
    copy(g, sources.workshopRoom, 4 * T, 8 * T, T, T, x, H - T);
  }

  // At either side the wall simply stops for the exit cell. There are no
  // front-facing door sprites standing across the horizontal walking lane.
  for (let row = 2; row < 5; row += 1) {
    if (CORRIDORS.throat.grid[row][0] === '#') {
      copy(g, sources.shelterWalls, 8 * T, (10 + row % 2) * T, T, T, 0, row * T);
      copy(g, sources.workshopRoom, 4 * T, (7 + row % 2) * T, T, T, W - T, row * T);
    }
  }
  copy(g, sources.shelterFurniture, 8 * T, 8 * T, T, T, T * 2, 18);
  copy(g, sources.workshop, 465, 388, 14, 21, W - T * 2 - 2, 18);
}

function stamp(g, sources, name, x, y, width, height) {
  const crop = CORRIDOR_CROPS[name];
  const [sx, sy, sw, sh] = crop.rect;
  const scale = crop.exportScale ?? 1;
  const w = width ?? sw / scale;
  const h = height ?? sh / scale;
  copy(g, sources[crop.sheet], sx, sy, w * scale, h * scale, x, y, w, h);
}

function repeatCrop(g, sources, name, x0, y0, x1, y1) {
  const crop = CORRIDOR_CROPS[name];
  const w = crop.rect[2] / (crop.exportScale ?? 1);
  const h = crop.rect[3] / (crop.exportScale ?? 1);
  for (let y = y0; y < y1; y += h) {
    for (let x = x0; x < x1; x += w) {
      stamp(g, sources, name, x, y, Math.min(w, x1 - x), Math.min(h, y1 - y));
    }
  }
}

function placeObstacles(g, sources, key) {
  for (const prop of CORRIDOR_OBSTACLES[key]) stamp(g, sources, prop.crop, prop.x, prop.y);
}

function drawLanding(g, sources) {
  const { W, H } = CORRIDORS.landing;
  // One Workshop structure throughout. Only the apron beside Common uses
  // its timber floor, so the passage does not become two different interiors.
  repeatCrop(g, sources, 'workshopFloor', 0, 0, 320, H);
  repeatCrop(g, sources, 'commonFloor', 320, 0, W, H);
  repeatCrop(g, sources, 'workshopWall', 0, 0, W, 64);
  repeatCrop(g, sources, 'workshopLowWall', 0, H - T, W, H);

  // The missing side wall is the entrance: exactly the open grid cell y=3.
  for (const x of [0, W - 6]) {
    repeatCrop(g, sources, 'workshopEdge', x, 0, x + 6, 96);
    repeatCrop(g, sources, 'workshopEdge', x, 128, x + 6, H);
  }
  for (const y of [0, H - 6]) {
    repeatCrop(g, sources, 'workshopCap', 0, y, W, y + 6);
  }

  stamp(g, sources, 'workshopWornA', 64, 96);
  stamp(g, sources, 'workshopWornB', 128, 128);
  stamp(g, sources, 'workshopGrate', 292, 104);

  repeatCrop(g, sources, 'workshopPipe', 64, 24, 144, 29);
  stamp(g, sources, 'workshopValve', 94, 22);
  stamp(g, sources, 'workshopLamp', 36, 12);
  stamp(g, sources, 'workshopNotice', 156, 18);
  placeObstacles(g, sources, 'landing');
}

function drawCut(g, sources) {
  const { W, H } = CORRIDORS.cut;
  repeatCrop(g, sources, 'commonFloor', 0, 0, W, H);
  repeatCrop(g, sources, 'officeWall', 0, 0, W, 64);
  stamp(g, sources, 'officeTornTop', 64, 0);
  stamp(g, sources, 'officeTornBase', 128, 0);
  stamp(g, sources, 'officeMasonry', 192, 0);
  repeatCrop(g, sources, 'officeLowWall', 0, H - T, W, H);
  repeatCrop(g, sources, 'officeSkirting', 0, H - T, W, H - T + 8);
  for (const x of [0, W - 6]) {
    repeatCrop(g, sources, 'officeEdge', x, 0, x + 6, 96);
    repeatCrop(g, sources, 'officeEdge', x, 128, x + 6, H);
  }
  for (const y of [0, H - 6]) repeatCrop(g, sources, 'officeCap', 0, y, W, y + 6);
}

function drawGreenRun(g, sources) {
  const { W, H } = CORRIDORS.greenrun;
  // The brown Shelter terrain family has exactly the Garden ground RGB
  // (168,131,75). Use its original nine-slice border, never recolour either pack.
  // Its silhouette sits 16 px inside the outer tiles, as in the source atlas.
  for (let y = 0; y < H; y += T) {
    for (let x = 0; x < W; x += T) {
      const column = x === 0 ? 0 : x === W - T ? 2 : 1;
      const row = y === 0 ? 12 : y === H - T ? 14 : 13;
      copy(g, sources.shelterTerrain, column * T, row * T, T, T, x, y);
    }
  }
  repeatCrop(g, sources, 'gardenSoil', 32, 32, W - 32, H - 32);
  // Actual soil tongues continue through both edge cells, not into a fence.
  copy(g, sources.shelterTerrain, 32, 416, T, T, 0, 96);
  copy(g, sources.shelterTerrain, 32, 416, T, T, W - T, 96);
  placeObstacles(g, sources, 'greenrun');
}

export function drawCorridor(g, sources, key) {
  const corridor = CORRIDORS[key];
  if (!corridor) throw new Error('Unknown corridor: ' + key);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, corridor.W, corridor.H);
  if (key === 'climb') drawClimb(g, sources);
  else if (key === 'longwalk') drawLongWalk(g, sources);
  else if (key === 'throat') drawThroat(g, sources);
  else if (key === 'landing') drawLanding(g, sources);
  else if (key === 'cut') drawCut(g, sources);
  else drawGreenRun(g, sources);
}

export function corridorReachability(key) {
  const corridor = CORRIDORS[key];
  const open = (x, y) => {
    const cell = corridor.grid[y]?.[x];
    return cell !== undefined && '#X'.includes(cell) === false;
  };
  const start = corridor.exits.find((exit) => !exit.sealed);
  const seen = new Set([`${start.x},${start.y}`]);
  const work = [{ x: start.x, y: start.y }];
  while (work.length) {
    const here = work.pop();
    for (const [x, y] of [[here.x + 1, here.y], [here.x - 1, here.y], [here.x, here.y + 1], [here.x, here.y - 1]]) {
      const id = `${x},${y}`;
      if (!open(x, y) || seen.has(id)) continue;
      seen.add(id); work.push({ x, y });
    }
  }
  const liveExits = corridor.exits.filter((exit) => !exit.sealed);
  const connected = liveExits.every((exit) => seen.has(`${exit.x},${exit.y}`));
  return { connected, reachable: seen.size, liveExits: liveExits.length };
}
