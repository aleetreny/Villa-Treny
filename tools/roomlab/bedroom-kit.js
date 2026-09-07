// Four private rooms assembled exclusively from images shipped in
// Archive_referencias_por_libreria.zip.
//
// Important invariant: this renderer never paints a visible pixel. It only
// clears, clips and copies pixels from a declared ZIP source with drawImage().
//
// Pilar and Xan use the exact flattened reference compositions from the ZIP.
// That is the only honest way to make those two rooms literal copies rather
// than increasingly approximate reconstructions of already-finished art.
// Ulla and Yara use the original Shelter terrain, wall and furniture sprites.

export const BEDROOM = {
  shelter: { W: 137, H: 222, label: 'exact ZIP shelter reference crop' },
  christmas: { W: 188, H: 188, label: 'exact ZIP Christmas reference crop' },
  olive: { W: 226, H: 273, label: 'ZIP Shelter sprites, reference layout' },
  oliveB: { W: 226, H: 273, label: 'ZIP Shelter sprites, alternate layout' },
};

const SHELTER_ROOT = './library/sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/';

export const BEDROOM_SOURCES = {
  shelterReference: './reference/shelter-bunk-and-stores.jpg',
  christmasReference: './reference/xmas-container-room.jpg',
  shelterFurniture: SHELTER_ROOT + 'Shelter_Furniture_32x32.png',
  shelterTerrain: SHELTER_ROOT + 'Shelter_Terrain_Tiles_32x32.png',
  shelterWalls: SHELTER_ROOT + 'Shelter_Walls_32x32.png',
};

const placement = (sheet, label, source, destination) => ({
  sheet, label, source, destination,
});

const OLIVE_FLOOR = {
  sheet: 'shelterTerrain',
  source: [96, 320, 32, 32],
  detailSource: [96, 352, 32, 32],
};

const OUTER_GROUND = {
  sheet: 'shelterTerrain',
  source: [320, 320, 32, 32],
  detailSource: [320, 352, 32, 32],
};

const ROUGH_OLIVE_PATCH = {
  sheet: 'shelterTerrain',
  source: [16, 272, 64, 64],
};

export const BEDROOM_MANIFEST = {
  shelter: {
    strategy: 'exact flattened crop from the ZIP reference',
    layers: [
      placement('shelterReference', 'complete shelter composition', [30, 27, 274, 444], [0, 0, 137, 222]),
    ],
  },
  christmas: {
    strategy: 'exact flattened crop from the ZIP reference',
    layers: [
      placement('christmasReference', 'complete Christmas composition', [38, 34, 752, 752], [0, 0, 188, 188]),
    ],
  },
  olive: {
    strategy: 'original ZIP sprites placed to match the supplied olive reference',
    surfaces: { outer: OUTER_GROUND, edge: ROUGH_OLIVE_PATCH, floor: OLIVE_FLOOR },
    floorPolygon: [[15, 28], [28, 19], [77, 20], [91, 11], [132, 11], [145, 20], [198, 20], [211, 31], [211, 240], [202, 253], [29, 253], [15, 241]],
    innerFloorPolygon: [[22, 33], [34, 27], [80, 27], [94, 19], [129, 19], [142, 28], [193, 28], [204, 35], [204, 236], [197, 246], [34, 246], [22, 237]],
    edgeDestination: [15, 19, 196, 234],
    layers: [
      placement('shelterWalls', 'left rust corrugated panel', [192, 320, 32, 64], [58, 19, 32, 64]),
      placement('shelterWalls', 'right rust corrugated panel', [192, 320, 32, 64], [132, 19, 32, 64]),
      placement('shelterFurniture', 'large clean mattress', [420, 50, 24, 43], [19, 39, 24, 43]),
      placement('shelterFurniture', 'small upright bedroll', [361, 359, 14, 24], [66, 65, 14, 24]),
      placement('shelterFurniture', 'tall mustard locker', [295, 384, 18, 31], [23, 98, 18, 31]),
      placement('shelterFurniture', 'open mustard storage bin', [356, 387, 26, 28], [174, 63, 26, 28]),
      placement('shelterFurniture', 'open green-front storage bin', [387, 387, 26, 28], [174, 100, 26, 28]),
      placement('shelterFurniture', 'white cup', [6, 129, 8, 8], [29, 190, 8, 8]),
      placement('shelterFurniture', 'white handled cup', [19, 131, 9, 10], [39, 194, 9, 10]),
      placement('shelterFurniture', 'orange gas cylinder', [72, 192, 16, 32], [184, 219, 16, 32]),
    ],
  },
  oliveB: {
    strategy: 'original ZIP sprites in a distinct, quiet variation',
    surfaces: { outer: OUTER_GROUND, edge: ROUGH_OLIVE_PATCH, floor: OLIVE_FLOOR },
    floorPolygon: [[17, 27], [30, 19], [73, 20], [82, 12], [137, 12], [146, 22], [196, 21], [210, 31], [211, 241], [200, 253], [31, 253], [16, 241]],
    innerFloorPolygon: [[23, 32], [35, 27], [76, 27], [86, 20], [134, 20], [143, 29], [192, 28], [203, 36], [204, 236], [195, 246], [36, 246], [23, 237]],
    edgeDestination: [16, 19, 195, 234],
    layers: [
      placement('shelterWalls', 'left damaged rust corrugated panel', [128, 320, 32, 64], [34, 20, 32, 64]),
      placement('shelterWalls', 'right rust corrugated panel', [192, 320, 32, 64], [153, 20, 32, 64]),
      placement('shelterFurniture', 'wide clean mattress', [456, 4, 48, 25], [153, 136, 48, 25]),
      placement('shelterFurniture', 'upright worn mattress', [420, 146, 24, 43], [24, 94, 24, 43]),
      placement('shelterFurniture', 'open green-front storage bin', [387, 387, 26, 28], [174, 86, 26, 28]),
      placement('shelterFurniture', 'compact mustard locker', [327, 391, 18, 24], [29, 157, 18, 24]),
      placement('shelterFurniture', 'open mustard storage bin', [356, 387, 26, 28], [166, 184, 26, 28]),
      placement('shelterFurniture', 'white cup', [6, 129, 8, 8], [109, 213, 8, 8]),
      placement('shelterFurniture', 'white handled cup', [19, 131, 9, 10], [120, 208, 9, 10]),
      placement('shelterFurniture', 'short orange gas cylinder', [40, 195, 16, 26], [72, 220, 16, 26]),
    ],
  },
};

export async function loadBedroomSheets() {
  const sheets = {};
  await Promise.all(Object.entries(BEDROOM_SOURCES).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { sheets[key] = image; resolve(); };
    image.onerror = () => reject(new Error('Could not load ZIP source: ' + src));
    image.src = src;
  })));
  return sheets;
}

function copy(g, sheets, layer) {
  const [sx, sy, sw, sh] = layer.source;
  const [dx, dy, dw = sw, dh = sh] = layer.destination;
  g.drawImage(sheets[layer.sheet], sx, sy, sw, sh, dx, dy, dw, dh);
}

function tile(g, image, source, W, H, detailSource = null) {
  const [, , sw, sh] = source;
  for (let y = 0; y < H; y += sh) {
    for (let x = 0; x < W; x += sw) {
      const cropW = Math.min(sw, W - x);
      const cropH = Math.min(sh, H - y);
      const useDetail = detailSource && ((x / sw) + (y / sh)) % 3 === 1;
      const [tx, ty] = useDetail ? detailSource : source;
      g.drawImage(image, tx, ty, cropW, cropH, x, y, cropW, cropH);
    }
  }
}

function clipPolygon(g, points) {
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) g.lineTo(points[i][0], points[i][1]);
  g.closePath();
  g.clip();
}

function drawOlive(g, sheets, key) {
  const room = BEDROOM[key];
  const manifest = BEDROOM_MANIFEST[key];
  const outer = manifest.surfaces.outer;
  const edge = manifest.surfaces.edge;
  const floor = manifest.surfaces.floor;

  tile(g, sheets[outer.sheet], outer.source, room.W, room.H, outer.detailSource);
  const [esx, esy, esw, esh] = edge.source;
  const [edx, edy, edw, edh] = manifest.edgeDestination;
  g.drawImage(sheets[edge.sheet], esx, esy, esw, esh, edx, edy, edw, edh);
  g.save();
  clipPolygon(g, manifest.innerFloorPolygon);
  tile(g, sheets[floor.sheet], floor.source, room.W, room.H, floor.detailSource);
  g.restore();

  for (const layer of manifest.layers) copy(g, sheets, layer);
}

export function drawBedroom(g, sheets, key) {
  const room = BEDROOM[key];
  const manifest = BEDROOM_MANIFEST[key];
  if (!room || !manifest) throw new Error('Unknown bedroom: ' + key);

  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, room.W, room.H);
  if (key === 'shelter' || key === 'christmas') copy(g, sheets, manifest.layers[0]);
  else drawOlive(g, sheets, key);
}

export function sourceCount(key) {
  const manifest = BEDROOM_MANIFEST[key];
  return manifest.layers.length + (manifest.surfaces ? Object.keys(manifest.surfaces).length : 0);
}
