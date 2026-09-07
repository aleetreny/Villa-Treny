// Four administrative rooms copied exclusively from the finished Post Apoc
// Office compositions in Archive_referencias_por_libreria.
//
// This renderer never paints visible pixels. It clears a canvas and copies one
// exact source rectangle from the ZIP-backed room image with drawImage().

export const OFFICE = {
  administration: { W: 172, H: 236, label: 'Administration' },
  dispatch: { W: 203, H: 172, label: 'Duty Office' },
  archive: { W: 172, H: 236, label: 'The Archive' },
  records: { W: 172, H: 172, label: 'Records' },
};

export const OFFICE_SOURCES = {
  office2: './library/rooms/Post Apoc Office - Asset Pack_2.png',
  office3: './library/rooms/Post Apoc Office - Asset Pack_3.gif',
  office4: './library/rooms/Post Apoc Office - Asset Pack_4.png',
  office5: './library/rooms/Post Apoc Office - Asset Pack_5.jpg',
  officeWalls: './library/sheets/Post Apoc Office - Asset Pack/Post Apoc - Office 32x32 Grid/Office_Walls_32x32.png',
};

export const OFFICE_MANIFEST = {
  administration: {
    sheet: 'office2',
    source: [39, 35, 516, 708],
    destination: [0, 0, 172, 236],
    strategy: 'exact 3× ZIP composition crop',
  },
  dispatch: {
    sheet: 'office3',
    source: [0, 0, 609, 516],
    destination: [0, 0, 203, 172],
    overlay: {
      sheet: 'officeWalls',
      source: [0, 320, 64, 64],
      destination: [70, 4, 64, 64],
    },
    strategy: 'exact 3× ZIP GIF frame + closed ZIP double door',
  },
  archive: {
    sheet: 'office4',
    source: [13, 14, 516, 708],
    destination: [0, 0, 172, 236],
    strategy: 'exact 3× ZIP composition crop',
  },
  records: {
    sheet: 'office5',
    source: [54, 48, 688, 688],
    destination: [0, 0, 172, 172],
    strategy: 'exact 4× ZIP composition crop',
  },
};

export async function loadOfficeSources() {
  const sources = {};
  await Promise.all(Object.entries(OFFICE_SOURCES).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { sources[key] = image; resolve(); };
    image.onerror = () => reject(new Error('Could not load ZIP Office source: ' + src));
    image.src = src;
  })));
  return sources;
}

export function drawOffice(g, sources, key) {
  const room = OFFICE[key];
  const layer = OFFICE_MANIFEST[key];
  if (!room || !layer) throw new Error('Unknown Office room: ' + key);

  const [sx, sy, sw, sh] = layer.source;
  const [dx, dy, dw, dh] = layer.destination;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, room.W, room.H);
  g.drawImage(sources[layer.sheet], sx, sy, sw, sh, dx, dy, dw, dh);
  if (layer.overlay) {
    const [osx, osy, osw, osh] = layer.overlay.source;
    const [odx, ody, odw, odh] = layer.overlay.destination;
    g.drawImage(sources[layer.overlay.sheet], osx, osy, osw, osh, odx, ody, odw, odh);
  }
}
