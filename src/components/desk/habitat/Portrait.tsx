// A face, twenty-four pixels across.
//
// Small enough that every pixel is a decision and large enough that the decisions
// show. The spec comes from portraits.ts, where all twenty-five were set by hand
// against their own dossier; this only turns a spec into pixels.

import { memo, useEffect, useRef } from 'react';
import { HAIRS, SKINS, isOld, portraitOf } from '../../../lib/habitat/portraits';
import type { ResidentId } from '../../../lib/habitat/residents';

const W = 24;
const H = 26;

type Ctx = CanvasRenderingContext2D;

function px(c: Ctx, x: number, y: number, w: number, h: number, fill: string) {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * amount);
  const g = clamp(((n >> 8) & 255) * amount);
  const b = clamp((n & 255) * amount);
  return `rgb(${r} ${g} ${b})`;
}

export function drawPortrait(c: Ctx, id: ResidentId) {
  const p = portraitOf(id);
  const skin = SKINS[p.skin]!;
  const hair = HAIRS[p.hair]!;
  const dark = shade(skin, 0.78);
  const old = isOld(id);

  c.clearRect(0, 0, W, H);

  // Shoulders, so the head is attached to somebody.
  px(c, 3, 22, 18, 4, '#2b3038');
  px(c, 3, 22, 18, 1, '#3d444f');

  // Head.
  px(c, 6, 4, 12, 16, skin);
  px(c, 5, 7, 1, 9, skin);
  px(c, 18, 7, 1, 9, skin);
  px(c, 6, 19, 12, 2, dark);
  px(c, 9, 20, 6, 2, skin);

  // Ears.
  px(c, 4, 11, 1, 3, dark);
  px(c, 19, 11, 1, 3, dark);

  // Brow.
  const browY = p.brow === 2 ? 10 : 9;
  const browTone = shade(hair, 0.9);
  if (p.brow === 2) {
    px(c, 7, browY, 4, 2, browTone);
    px(c, 13, browY, 4, 2, browTone);
  } else if (p.brow === 1) {
    px(c, 7, browY, 4, 1, browTone);
    px(c, 13, browY - 1, 4, 1, browTone);
  } else {
    px(c, 7, browY, 4, 1, browTone);
    px(c, 13, browY, 4, 1, browTone);
  }

  // Eyes.
  const ex = p.eyes === 2 ? 1 : 0;
  const eh = p.eyes === 1 ? 1 : 2;
  px(c, 8 - ex, 12, 2, eh, '#20242c');
  px(c, 14 + ex, 12, 2, eh, '#20242c');

  // Nose and mouth.
  px(c, 11, 14, 2, 2, dark);
  if (p.mouth === 1) {
    px(c, 9, 17, 6, 1, dark);
    px(c, 9, 16, 1, 1, dark);
    px(c, 14, 16, 1, 1, dark);
  } else if (p.mouth === 2) {
    px(c, 9, 17, 6, 1, dark);
    px(c, 8, 16, 1, 1, dark);
    px(c, 15, 16, 1, 1, dark);
  } else {
    px(c, 9, 17, 6, 1, dark);
  }

  // Hair.
  switch (p.style) {
    case 'bald':
      px(c, 6, 4, 12, 2, shade(skin, 0.94));
      px(c, 5, 8, 2, 5, hair);
      px(c, 17, 8, 2, 5, hair);
      break;
    case 'crop':
      px(c, 5, 3, 14, 4, hair);
      px(c, 5, 7, 1, 3, hair);
      px(c, 18, 7, 1, 3, hair);
      break;
    case 'receded':
      px(c, 5, 3, 3, 4, hair);
      px(c, 16, 3, 3, 4, hair);
      px(c, 5, 6, 14, 1, hair);
      break;
    case 'long':
      px(c, 5, 2, 14, 5, hair);
      px(c, 3, 5, 2, 14, hair);
      px(c, 19, 5, 2, 14, hair);
      break;
    case 'tied':
      px(c, 5, 3, 14, 4, hair);
      px(c, 4, 6, 1, 4, hair);
      px(c, 19, 6, 3, 5, hair);
      break;
    case 'bob':
      px(c, 5, 2, 14, 5, hair);
      px(c, 3, 5, 2, 10, hair);
      px(c, 19, 5, 2, 10, hair);
      break;
    case 'wave':
      px(c, 5, 2, 14, 4, hair);
      px(c, 4, 4, 1, 2, hair);
      px(c, 7, 1, 4, 2, hair);
      px(c, 14, 1, 4, 2, hair);
      break;
    case 'braid':
      px(c, 5, 3, 14, 4, hair);
      px(c, 19, 6, 2, 12, hair);
      px(c, 19, 9, 2, 1, shade(hair, 0.7));
      px(c, 19, 13, 2, 1, shade(hair, 0.7));
      break;
    case 'tuft':
      px(c, 6, 3, 12, 3, hair);
      px(c, 9, 0, 5, 3, hair);
      break;
    case 'coils':
      px(c, 5, 2, 14, 5, hair);
      for (let i = 0; i < 5; i += 1) px(c, 5 + i * 3, 1, 2, 2, hair);
      px(c, 4, 6, 2, 4, hair);
      px(c, 18, 6, 2, 4, hair);
      break;
  }

  // The years, and what people carry on their faces.
  if (old || p.extra === 'lines') {
    px(c, 6, 14, 2, 1, dark);
    px(c, 16, 14, 2, 1, dark);
  }
  switch (p.extra) {
    case 'glasses':
      px(c, 6, 11, 5, 4, '#20242c');
      px(c, 13, 11, 5, 4, '#20242c');
      px(c, 7, 12, 3, 2, 'rgba(180, 220, 240, 0.35)');
      px(c, 14, 12, 3, 2, 'rgba(180, 220, 240, 0.35)');
      px(c, 11, 12, 2, 1, '#20242c');
      break;
    case 'beard':
      px(c, 6, 17, 12, 4, shade(hair, 0.95));
      px(c, 9, 17, 6, 1, dark);
      break;
    case 'stubble':
      px(c, 7, 18, 10, 2, shade(hair, 0.55));
      break;
    case 'earring':
      px(c, 19, 14, 1, 1, '#e8c063');
      break;
    case 'weathered':
      px(c, 7, 8, 2, 1, dark);
      px(c, 15, 8, 2, 1, dark);
      px(c, 6, 16, 1, 2, dark);
      break;
    default:
      break;
  }
}

export const Portrait = memo(function Portrait({ id, scale = 3 }: { id: ResidentId; scale?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const c = canvas?.getContext('2d');
    if (!canvas || !c) return;
    canvas.width = W;
    canvas.height = H;
    c.imageSmoothingEnabled = false;
    drawPortrait(c, id);
  }, [id]);
  return (
    <canvas
      ref={ref}
      className="hab-portrait"
      style={{ width: W * scale, height: H * scale }}
      aria-hidden="true"
    />
  );
});
