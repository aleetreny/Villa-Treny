// The six remaining canon rooms with partial visual references.
//
// Invariant: this renderer never paints a visible pixel. Bridge, Dock, Breach,
// Hold and Common are full-resolution crops from finished ZIP compositions.
// Hydroponics deliberately reuses the already-approved Planter Yard renderer;
// no alternate or custom Hydroponics composition exists.

import { drawOutside } from './outside-kit.js';

export const CANON_PARTIALS = {
  bridge: { W: 672, H: 898, label: 'The Bridge' },
  dock: { W: 864, H: 576, label: 'The Dock' },
  breach: { W: 672, H: 768, label: 'The Breach' },
  hold: { W: 576, H: 768, label: 'The Hold' },
  common: { W: 496, H: 560, label: 'The Common' },
  hydroponics: { W: 130, H: 159, label: 'Hydroponics Yard' },
};

export const CANON_PARTIAL_SOURCES = {
  office1: './library/rooms/Post Apoc Office - Asset Pack_1.png',
  shelter2: './library/rooms/Post Apoc Shelter - Asset Pack_2.png',
  office6: './library/rooms/Post Apoc Office - Asset Pack_6.png',
  shelter8: './library/rooms/Post Apoc Shelter - Asset Pack_8.gif',
  xmas3: './library/rooms/Xmas_3.png',
  garden1: './library/rooms/Garden_Planters_1.png',
};

const layer = (sheet, label, source, destination) => ({ sheet, label, source, destination });

export const CANON_PARTIAL_MANIFEST = {
  bridge: {
    strategy: 'uncut-detail export crop; every source pixel retained',
    layers: [layer('office1', 'complete ruined bridge composition', [21, 27, 672, 898], [0, 0, 672, 898])],
  },
  dock: {
    strategy: 'uncut-detail export crop; every source pixel retained',
    layers: [layer('shelter2', 'complete hazardous surface dock', [34, 35, 864, 576], [0, 0, 864, 576])],
  },
  breach: {
    strategy: 'uncut-detail export crop; every source pixel retained',
    layers: [layer('office6', 'complete collapsed breach composition', [18, 18, 672, 768], [0, 0, 672, 768])],
  },
  hold: {
    strategy: 'uncut-detail export crop; every source pixel retained',
    layers: [layer('shelter8', 'complete fenced cargo cache', [48, 48, 576, 768], [0, 0, 576, 768])],
  },
  common: {
    strategy: 'uncut-detail export crop; every source pixel retained',
    layers: [layer('xmas3', 'complete communal sitting room', [16, 14, 496, 560], [0, 0, 496, 560])],
  },
  hydroponics: {
    strategy: 'the exact already-approved Planter Yard composition; no custom assembly',
    layers: [layer('garden1', 'complete Planter Yard composition', [87, 71, 520, 636], [0, 0, 130, 159])],
  },
};

export async function loadCanonPartialSources() {
  const sources = {};
  await Promise.all(Object.entries(CANON_PARTIAL_SOURCES).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { sources[key] = image; resolve(); };
    image.onerror = () => reject(new Error('Could not load ZIP canon-room source: ' + src));
    image.src = src;
  })));
  return sources;
}

function copy(g, sources, item) {
  const [sx, sy, sw, sh] = item.source;
  const [dx, dy, dw = sw, dh = sh] = item.destination;
  g.drawImage(sources[item.sheet], sx, sy, sw, sh, dx, dy, dw, dh);
}

export function drawCanonPartial(g, sources, key) {
  const room = CANON_PARTIALS[key];
  const manifest = CANON_PARTIAL_MANIFEST[key];
  if (!room || !manifest) throw new Error('Unknown partial-reference room: ' + key);

  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, room.W, room.H);
  if (key === 'hydroponics') {
    drawOutside(g, { garden1: sources.garden1 }, 'garden');
    return;
  }
  for (const item of manifest.layers) copy(g, sources, item);
}

export function canonPartialSourceCount(key) {
  const manifest = CANON_PARTIAL_MANIFEST[key];
  return manifest.layers.length;
}
