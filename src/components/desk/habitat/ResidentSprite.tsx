import { memo, useEffect, useRef } from 'react';
import { drawPortrait } from './Portrait';
import { RESIDENTS, type ResidentId } from '../../../lib/habitat/residents';
import { SKINS, portraitOf } from '../../../lib/habitat/portraits';

const faces = new Map<ResidentId, HTMLCanvasElement>();
const COATS = ['#707d6d','#927b5b','#6b7282','#85735b','#5e777f','#807051','#6b8073','#927258','#667581','#7d665f','#738568','#7c778b','#965e51','#627883','#968453','#887761','#687d80','#806b8d','#918570','#8c6e68','#747a91','#697570','#879477','#8b7867','#756980'];

/** The existing, individually authored face becomes a full small person. */
export function drawResidentSprite(c: CanvasRenderingContext2D, id: ResidentId, frame = 0): void {
  const ordinal = RESIDENTS.findIndex((person) => person.id === id);
  let face = faces.get(id);
  if (!face) {
    face = document.createElement('canvas'); face.width = 24; face.height = 26;
    drawPortrait(face.getContext('2d')!, id); faces.set(id, face);
  }
  c.clearRect(0, 0, 24, 44); c.imageSmoothingEnabled = false;
  const pixel = (x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  const coat = COATS[ordinal]!, skin = SKINS[portraitOf(id).skin]!;
  const step = frame === 0 ? 0 : frame % 2 ? 1 : -1;
  // A 44px adult beside the pack's 62px bunk and 63px locker. A 2:1
  // nearest-neighbour face gives adult proportions, independent of room size.
  pixel(10, 10, 4, 4, skin);
  pixel(5, 13, 14, 18, '#242c32'); pixel(5, 13, 14, 16, coat);
  pixel(5, 15, 1, 13, '#515b58'); pixel(18, 15, 1, 13, '#515b58');
  pixel(8, 12, 2, 3, '#b5b09a'); pixel(14, 12, 2, 3, '#b5b09a');
  pixel(11, 15, 1, 13, '#515b58');
  for (const y of [17, 21, 25]) pixel(12, y, 1, 1, '#b5b09a');
  pixel(3, 14, 3, 12 + Math.max(0, step), coat); pixel(18, 14, 3, 12 + Math.max(0, -step), coat);
  pixel(3, 26 + Math.max(0, step), 3, 3, skin); pixel(18, 26 + Math.max(0, -step), 3, 3, skin);
  pixel(7, 30, 4, 12 + Math.max(0, step), '#424c55'); pixel(13, 30, 4, 12 + Math.max(0, -step), '#424c55');
  pixel(7, 32, 1, 8, '#626b70'); pixel(13, 32, 1, 8, '#626b70');
  pixel(6, 41 + Math.max(0, step), 5, 2, '#24292d'); pixel(13, 41 + Math.max(0, -step), 5, 2, '#24292d');
  pixel(5, 29, 14, 2, '#333639'); pixel(11, 29, 2, 2, '#c8ae72');
  pixel(ordinal % 2 ? 15 : 6, 18, 3, 3, '#c2b596');
  // A one-pixel seam belongs to the coat silhouette. It separates overlapping
  // shoulders without a halo, a scale change or extra room artwork.
  pixel(3, 14, 1, 14 + Math.max(0, step), '#242c32');
  pixel(20, 14, 1, 14 + Math.max(0, -step), '#242c32');
  pixel(5, 13, 5, 1, '#242c32'); pixel(14, 13, 5, 1, '#242c32');
  c.drawImage(face, 0, 0, 24, 22, 6, 0, 12, 11);
}

const frames = new Map<string, HTMLCanvasElement>();

export const ResidentSprite = memo(function ResidentSprite({ id, frame = 0 }: { id: ResidentId; frame?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const key = `${id}:${frame}`;
    let cached = frames.get(key);
    if (!cached) {
      cached = document.createElement('canvas'); cached.width = 24; cached.height = 44;
      drawResidentSprite(cached.getContext('2d')!, id, frame); frames.set(key, cached);
    }
    const c = ref.current?.getContext('2d');
    if (!c) return;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 24, 44);
    c.drawImage(cached, 0, 0);
  }, [id, frame]);
  return <canvas ref={ref} width={24} height={44} aria-hidden="true" />;
});
