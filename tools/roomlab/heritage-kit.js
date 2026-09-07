// Eight places copied exclusively from finished compositions in
// Archive_referencias_por_libreria.zip.
//
// This renderer never paints a visible pixel. Seven interiors are exact source
// crops; the Graveyard is the complete 3x composition with only page-white that
// is connected to the image edge made transparent.

export const HERITAGE = {
  library: { W: 140, H: 172, label: 'Old Library' },
  grandbedroom: { W: 140, H: 172, label: 'Grand Bedroom' },
  salon: { W: 236, H: 204, label: 'Formal Salon' },
  hearth: { W: 172, H: 204, label: 'Hearth Room' },
  maindiner: { W: 236, H: 204, label: 'Main Diner' },
  sodabar: { W: 172, H: 204, label: 'Soda Bar' },
  servicecounter: { W: 140, H: 172, label: 'Service Counter' },
  graveyard: { W: 197, H: 240, label: 'Graveyard' },
};

export const HERITAGE_SOURCES = {
  mansion1: './library/rooms/FancyMansion_Furniture_1.png',
  mansion2: './library/rooms/FancyMansion_Furniture_2.png',
  mansion3: './library/rooms/FancyMansion_Furniture_3.png',
  mansion4: './library/rooms/FancyMansion_Furniture_4.png',
  diner1: './library/rooms/50s_Diner_1.png',
  diner3: './library/rooms/50s_Diner_3.png',
  diner4: './library/rooms/50s_Diner_4.png',
  graveyard2: './library/rooms/Graveyard_2.png',
};

export const HERITAGE_MANIFEST = {
  library: { sheet: 'mansion1', source: [79, 82, 560, 688], destination: [0, 0, 140, 172], strategy: 'exact 4x ZIP composition crop' },
  grandbedroom: { sheet: 'mansion2', source: [79, 82, 560, 688], destination: [0, 0, 140, 172], strategy: 'exact 4x ZIP composition crop' },
  salon: { sheet: 'mansion3', source: [13, 15, 708, 612], destination: [0, 0, 236, 204], strategy: 'exact 3x ZIP composition crop' },
  hearth: { sheet: 'mansion4', source: [112, 13, 516, 612], destination: [0, 0, 172, 204], strategy: 'exact 3x ZIP composition crop' },
  maindiner: { sheet: 'diner1', source: [29, 28, 944, 816], destination: [0, 0, 236, 204], strategy: 'exact 4x ZIP composition crop' },
  sodabar: { sheet: 'diner3', source: [13, 15, 688, 816], destination: [0, 0, 172, 204], strategy: 'exact 4x ZIP composition crop' },
  servicecounter: { sheet: 'diner4', source: [78, 83, 560, 688], destination: [0, 0, 140, 172], strategy: 'exact 4x ZIP composition crop' },
  graveyard: { sheet: 'graveyard2', source: [0, 0, 591, 720], destination: [0, 0, 197, 240], strategy: 'complete 3x ZIP composition; only edge-connected page-white removed' },
};

export async function loadHeritageSources() {
  const sources = {};
  await Promise.all(Object.entries(HERITAGE_SOURCES).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { sources[key] = image; resolve(); };
    image.onerror = () => reject(new Error('Could not load ZIP heritage source: ' + src));
    image.src = src;
  })));
  return sources;
}

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

export function drawHeritage(g, sources, key) {
  const room = HERITAGE[key];
  const layer = HERITAGE_MANIFEST[key];
  if (!room || !layer) throw new Error('Unknown heritage room: ' + key);
  const [sx, sy, sw, sh] = layer.source;
  const [dx, dy, dw, dh] = layer.destination;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, room.W, room.H);
  g.drawImage(sources[layer.sheet], sx, sy, sw, sh, dx, dy, dw, dh);
  if (key === 'graveyard') clearOuterPage(g, room.W, room.H);
}
