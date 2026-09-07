"""Where does this exact sub-rectangle of a sheet sit in the render?"""
from PIL import Image
import numpy as np, sys
from provenance import luma, ncc_map

def find(render, sheet, sx, sy, w, h):
    img = luma(np.asarray(Image.open(render).convert('RGBA')))
    a = np.asarray(Image.open(sheet).convert('RGBA'))
    t = luma(a)[sy:sy+h, sx:sx+w]
    m = (a[sy:sy+h, sx:sx+w, 3] > 200).astype(np.float64)
    if m.sum() < 30: m = np.ones_like(t)
    r = ncc_map(img, t, m)
    if r is None: return None
    i = np.unravel_index(np.nanargmax(r), r.shape)
    return int(i[1]), int(i[0]), float(r[i])
