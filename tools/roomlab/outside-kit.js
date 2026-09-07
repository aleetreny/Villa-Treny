// Four connected exterior zones copied from finished compositions in
// Archive_referencias_por_libreria.zip.
//
// Visible forms are never drawn here: each zone is one exact reference crop.
// The only colour edit is the requested ground unification in Shelter Entrance
// and Inner Yard. Its three replacement colours are sampled from the Garden ZIP
// reference, and the source manifests below name every mapping explicitly.
import { cropNative, clearPageFringe } from './source-sampling.js';

export const OUTSIDE = {
  camp: { W: 134, H: 183, label: 'Surface Camp' },
  garden: { W: 130, H: 159, label: 'Hydroponics Yard' },
  sheltergate: { W: 207, H: 204, label: 'Shelter Entrance' },
  yard: { W: 133, H: 175, label: 'Inner Yard' },
};

export const OUTSIDE_SOURCES = {
  camp1: './library/rooms/Camping_Set_1.jpg',
  garden1: './library/rooms/Garden_Planters_1.png',
  shelter1: './library/rooms/Post Apoc Shelter - Asset Pack_1.jpg',
  workshop1: './library/rooms/PostApoc_Workshop_1.png',
};

const BROWN_GROUND = {
  main: [168, 131, 75],
  shadow: [140, 103, 47],
  deep: [120, 83, 27],
};

export const OUTSIDE_MANIFEST = {
  camp: {
    sheet: 'camp1', source: [114, 75, 402, 549], destination: [0, 0, 134, 183],
    strategy: 'exact 3× ZIP composition crop',
  },
  garden: {
    sheet: 'garden1', source: [87, 71, 520, 636], destination: [0, 0, 130, 159],
    strategy: 'exact 4× ZIP composition crop',
  },
  sheltergate: {
    sheet: 'shelter1', source: [44, 75, 621, 612], destination: [0, 0, 207, 204],
    strategy: 'exact 3× ZIP composition crop; exterior ground recoloured from Garden ZIP palette',
    palette: [
      { from: [157, 141, 66], to: BROWN_GROUND.main, tolerance: 18 },
      { from: [141, 125, 50], to: BROWN_GROUND.shadow, tolerance: 14 },
    ],
  },
  yard: {
    sheet: 'workshop1', source: [92, 72, 532, 700], destination: [0, 0, 133, 175],
    strategy: 'exact 4× ZIP composition crop; exterior ground recoloured from Garden ZIP palette',
    palette: [
      { from: [156, 141, 66], to: BROWN_GROUND.main, tolerance: 1 },
      { from: [132, 114, 19], to: BROWN_GROUND.shadow, tolerance: 1 },
      { from: [106, 89, 0], to: BROWN_GROUND.deep, tolerance: 1 },
    ],
  },
};

export async function loadOutsideSources() {
  const sources = {};
  await Promise.all(Object.entries(OUTSIDE_SOURCES).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { sources[key] = image; resolve(); };
    image.onerror = () => reject(new Error('Could not load ZIP exterior source: ' + src));
    image.src = src;
  })));
  return sources;
}

function colourDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function recolourDeclaredGround(g, W, H, palette) {
  if (!palette) return;
  const frame = g.getImageData(0, 0, W, H);
  const px = frame.data;
  for (let i = 0; i < px.length; i += 4) {
    const colour = [px[i], px[i + 1], px[i + 2]];
    for (const mapping of palette) {
      if (colourDistance(colour, mapping.from) > mapping.tolerance) continue;
      [px[i], px[i + 1], px[i + 2]] = mapping.to;
      break;
    }
  }
  g.putImageData(frame, 0, 0);
}

// Remove only page-white connected to the crop's outer edge. Pale pixels inside
// objects remain untouched; this strips the reference page, not object detail.
function clearOuterPage(g, W, H) {
  const frame = g.getImageData(0, 0, W, H);
  const px = frame.data;
  const seen = new Uint8Array(W * H);
  const queue = [];
  const pageWhite = (n) => px[n * 4] >= 244 && px[n * 4 + 1] >= 244 && px[n * 4 + 2] >= 244;
  const offer = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const n = y * W + x;
    if (seen[n] || !pageWhite(n)) return;
    seen[n] = 1;
    queue.push(n);
  };
  for (let x = 0; x < W; x += 1) { offer(x, 0); offer(x, H - 1); }
  for (let y = 0; y < H; y += 1) { offer(0, y); offer(W - 1, y); }
  for (let head = 0; head < queue.length; head += 1) {
    const n = queue[head];
    const x = n % W;
    const y = Math.floor(n / W);
    px[n * 4 + 3] = 0;
    offer(x - 1, y); offer(x + 1, y); offer(x, y - 1); offer(x, y + 1);
  }
  g.putImageData(frame, 0, 0);
}

export function drawOutside(g, sources, key) {
  const zone = OUTSIDE[key];
  const layer = OUTSIDE_MANIFEST[key];
  if (!zone || !layer) throw new Error('Unknown exterior zone: ' + key);

  const [sx, sy, sw, sh] = layer.source;
  const [dx, dy, dw, dh] = layer.destination;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, zone.W, zone.H);
  const cleanPage = key === 'camp' || key === 'sheltergate';
  if (cleanPage) cropNative(g, sources[layer.sheet], layer.source, layer.destination);
  else g.drawImage(sources[layer.sheet], sx, sy, sw, sh, dx, dy, dw, dh);
  recolourDeclaredGround(g, zone.W, zone.H, layer.palette);
  if (cleanPage) clearPageFringe(g, zone.W, zone.H);
  else clearOuterPage(g, zone.W, zone.H);
}
