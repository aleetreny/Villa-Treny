// Five rooms copied exclusively from finished compositions in
// Archive_referencias_por_libreria.zip.
//
// This renderer never paints a visible pixel. It clears a canvas and copies one
// exact source rectangle from a byte-verified ZIP room image with drawImage().

export const MIDCENTURY = {
  study: { W: 140, H: 172, label: 'The Study' },
  sparebedroom: { W: 140, H: 172, label: 'Spare Bedroom' },
  parlour: { W: 172, H: 204, label: 'The Parlour' },
  projection: { W: 140, H: 172, label: 'Projection Room' },
  winter: { W: 140, H: 172, label: 'Winter Parlour' },
};

export const MIDCENTURY_SOURCES = {
  mid1: './library/rooms/midcentury_modern_furnitureset_1.png',
  mid2: './library/rooms/midcentury_modern_furnitureset_2.png',
  mid3: './library/rooms/midcentury_modern_furnitureset_3.png',
  mid4: './library/rooms/midcentury_modern_furnitureset_4.png',
  xmas1: './library/rooms/Xmas_1.png',
};

export const MIDCENTURY_MANIFEST = {
  study: {
    sheet: 'mid1', source: [79, 82, 560, 688], destination: [0, 0, 140, 172],
    strategy: 'exact 4× ZIP composition crop',
  },
  sparebedroom: {
    sheet: 'mid2', source: [79, 82, 560, 688], destination: [0, 0, 140, 172],
    strategy: 'exact 4× ZIP composition crop',
  },
  parlour: {
    sheet: 'mid3', source: [15, 17, 688, 816], destination: [0, 0, 172, 204],
    strategy: 'exact 4× ZIP composition crop',
  },
  projection: {
    sheet: 'mid4', source: [79, 82, 560, 688], destination: [0, 0, 140, 172],
    strategy: 'exact 4× ZIP composition crop',
  },
  winter: {
    sheet: 'xmas1', source: [17, 20, 560, 688], destination: [0, 0, 140, 172],
    strategy: 'exact 4× ZIP composition crop',
  },
};

export async function loadMidcenturySources() {
  const sources = {};
  await Promise.all(Object.entries(MIDCENTURY_SOURCES).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { sources[key] = image; resolve(); };
    image.onerror = () => reject(new Error('Could not load ZIP Mid-century source: ' + src));
    image.src = src;
  })));
  return sources;
}

export function drawMidcentury(g, sources, key) {
  const room = MIDCENTURY[key];
  const layer = MIDCENTURY_MANIFEST[key];
  if (!room || !layer) throw new Error('Unknown Mid-century room: ' + key);

  const [sx, sy, sw, sh] = layer.source;
  const [dx, dy, dw, dh] = layer.destination;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, room.W, room.H);
  g.drawImage(sources[layer.sheet], sx, sy, sw, sh, dx, dy, dw, dh);
}
