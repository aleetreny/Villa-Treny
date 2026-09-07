// The Face, copied exclusively from the unused finished composition
// `Post Apoc Shelter - Asset Pack_3.png` in the supplied ZIP.
//
// No visible pixel is painted here. The complete room is one exact 3x source
// crop reduced to the asset pack's native pixel scale.

export const FACE = { W: 288, H: 192, label: 'The Face' };

export const FACE_SOURCE = './library/rooms/Post Apoc Shelter - Asset Pack_3.png';

export const FACE_MANIFEST = {
  source: [34, 34, 864, 576],
  destination: [0, 0, 288, 192],
  strategy: 'exact 3x ZIP composition crop',
};

export async function loadFaceSource() {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load ZIP Face source: ' + FACE_SOURCE));
    image.src = FACE_SOURCE;
  });
}

export function drawFace(g, source) {
  const [sx, sy, sw, sh] = FACE_MANIFEST.source;
  const [dx, dy, dw, dh] = FACE_MANIFEST.destination;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, FACE.W, FACE.H);
  g.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
}
