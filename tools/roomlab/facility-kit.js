// Four service rooms copied exclusively from finished compositions in
// Archive_referencias_por_libreria.zip.
//
// This renderer never paints visible pixels. It clears a canvas and copies one
// exact source rectangle from a ZIP-backed room image with drawImage().

export const FACILITY = {
  maintenance: { W: 288, H: 196, label: 'Maintenance' },
  kitchen: { W: 172, H: 204, label: 'The Kitchen' },
  stalls: { W: 108, H: 140, label: 'The Stalls' },
  washroom: { W: 140, H: 140, label: 'The Washroom' },
};

export const FACILITY_SOURCES = {
  workshop4: './library/rooms/PostApoc_Workshop_4.jpg',
  kitchen1: './library/rooms/professional_kitchen_1.png',
  bathroom3: './library/rooms/Public_Bathroom_3.png',
  bathroom4: './library/rooms/Public_Bathroom_4.png',
};

export const FACILITY_MANIFEST = {
  maintenance: {
    sheet: 'workshop4',
    source: [24, 24, 1152, 784],
    destination: [0, 0, 288, 196],
    strategy: 'exact 4× ZIP composition crop',
  },
  kitchen: {
    sheet: 'kitchen1',
    source: [14, 17, 688, 816],
    destination: [0, 0, 172, 204],
    strategy: 'exact 4× ZIP composition crop',
  },
  stalls: {
    sheet: 'bathroom3',
    source: [91, 34, 432, 560],
    destination: [0, 0, 108, 140],
    strategy: 'exact 4× ZIP composition crop',
  },
  washroom: {
    sheet: 'bathroom4',
    source: [28, 34, 560, 560],
    destination: [0, 0, 140, 140],
    strategy: 'exact 4× ZIP composition crop',
  },
};

export async function loadFacilitySources() {
  const sources = {};
  await Promise.all(Object.entries(FACILITY_SOURCES).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { sources[key] = image; resolve(); };
    image.onerror = () => reject(new Error('Could not load ZIP facility source: ' + src));
    image.src = src;
  })));
  return sources;
}

export function drawFacility(g, sources, key) {
  const room = FACILITY[key];
  const layer = FACILITY_MANIFEST[key];
  if (!room || !layer) throw new Error('Unknown facility room: ' + key);

  const [sx, sy, sw, sh] = layer.source;
  const [dx, dy, dw, dh] = layer.destination;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, room.W, room.H);
  g.drawImage(sources[layer.sheet], sx, sy, sw, sh, dx, dy, dw, dh);
}
