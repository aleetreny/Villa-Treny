"""Which sheet is this render built from, and at what scale?

Takes every real object off every candidate sheet and finds its best normalised
cross-correlation inside the render. NCC is computed over the sprite's own alpha
mask with the mean removed, so a global tint or a room shadow does not defeat the
match. A score of 1.000 is the same sprite, pixel for pixel.

Run it on a *native* image (see native.py) with scale 1.0, or on the original at
several scales when the native reduction is unreliable — a heavily recompressed
JPEG, usually.

    python3 provenance.py <render.png> <sheet.png>...
"""
from PIL import Image
import numpy as np
import os
import sys

from scipy.signal import fftconvolve

from objects import components

LUMA = np.array([.299, .587, .114])


def luma(rgba):
    return rgba[..., :3].astype(np.float64) @ LUMA


def ncc_map(img, tpl, mask):
    """Masked, mean-removed NCC of tpl over img. None when the template is flat."""
    n = mask.sum()
    if n < 30:
        return None
    t = (tpl - (tpl * mask).sum() / n) * mask
    tss = float((t * t).sum())
    if tss < 1e-6:
        return None
    flip = lambda k: k[::-1, ::-1]
    num = fftconvolve(img, flip(t), 'valid')
    s1 = fftconvolve(img, flip(mask), 'valid')
    s2 = fftconvolve(img * img, flip(mask), 'valid')
    return num / np.sqrt(np.maximum(s2 - s1 * s1 / n, 1e-6) * tss)


def rescale(t, m, s):
    if s == 1.0:
        return t, m
    hh, ww = max(2, round(t.shape[0] * s)), max(2, round(t.shape[1] * s))
    ti = Image.fromarray(np.clip(t, 0, 255).astype(np.uint8)).resize((ww, hh), Image.NEAREST)
    mi = Image.fromarray((m * 255).astype(np.uint8)).resize((ww, hh), Image.NEAREST)
    return np.asarray(ti).astype(np.float64), (np.asarray(mi) > 128).astype(np.float64)


def run(render, sheets, scales=(1.0,), thresh=0.93, min_area=250):
    """Every sheet object found in the render, best first."""
    img = luma(np.asarray(Image.open(render).convert('RGBA')))
    hits = []
    for sheet in sheets:
        objs, sa = components(sheet, min_area=min_area)
        sl, sm = luma(sa), (sa[..., 3] > 200).astype(np.float64)
        for o in objs:
            y, x, h, w = o['y0'], o['x0'], o['h'], o['w']
            t0, m0 = sl[y:y + h, x:x + w], sm[y:y + h, x:x + w]
            for s in scales:
                t, m = rescale(t0, m0, s)
                if t.shape[0] > img.shape[0] or t.shape[1] > img.shape[1]:
                    continue
                r = ncc_map(img, t, m)
                if r is None:
                    continue
                i = np.unravel_index(np.nanargmax(r), r.shape)
                v = float(r[i])
                if v >= thresh:
                    hits.append(dict(sheet=os.path.basename(sheet), tile=o['tile'],
                                     size=f"{w}x{h}", scale=s, ncc=round(v, 4),
                                     at=(int(i[1]), int(i[0]))))
    hits.sort(key=lambda h: -h['ncc'])
    return hits


if __name__ == '__main__':
    render, sheets = sys.argv[1], sys.argv[2:]
    hits = run(render, sheets, scales=(1.0, 0.5, 2.0, 3.0, 4.0))
    print(f'== {os.path.basename(render)}  {Image.open(render).size}')
    grouped = {}
    for h in hits:
        grouped.setdefault((h['sheet'], h['scale']), []).append(h)
    for (sheet, s), hs in sorted(grouped.items(), key=lambda kv: -len(kv[1])):
        print(f'  {len(hs):3d} objects  drawn x{s}  {sheet}   best ncc {hs[0]["ncc"]}')
    if not hits:
        print('  no sheet matched — measure a prop by hand with ruler.py')
    for h in hits[:20]:
        print(f'     {h["ncc"]:.3f}  {h["sheet"][:30]:30s} t{h["tile"]} {h["size"]:>8s}'
              f'  x{h["scale"]}  at {h["at"]}')
