"""What scale is this render, and what is it in native pixels?

A reference render off itch.io is almost never at 1:1 — it is the artist's room
exported at 2x, 3x, 4x, sometimes 8x, and often cropped, which shifts the block
grid off the origin. Reading the scale wrong is how a room ends up traced at the
wrong size, so this is the first thing run against any new reference.

    python3 native.py <image>...          # report, and write native/<name>.png

Method: a pixel-art render is made of k x k constant blocks. Try every k from 2
to 8 at *every phase offset* — testing only offset (0,0) reads a cropped 3x
render as 1:1, which cost this project a session.
"""
from PIL import Image
import numpy as np
import os
import sys

MAX_SCALE = 8


def detect(a: np.ndarray, lossy: bool, max_k: int = MAX_SCALE):
    """Return (scale, (offset_x, offset_y)) for an H x W x C array."""
    h, w = a.shape[:2]
    tol = 14 if lossy else 0          # JPEG ringing never lands exactly on zero
    best, off = 1, (0, 0)
    for k in range(2, max_k + 1):
        spread, at = 1e9, None
        for oy in range(k):
            for ox in range(k):
                hh, ww = (h - oy) // k * k, (w - ox) // k * k
                if hh < k * 8 or ww < k * 8:
                    continue
                b = a[oy:oy + hh, ox:ox + ww].reshape(hh // k, k, ww // k, k, -1)
                s = float((b.max(axis=(1, 3)) - b.min(axis=(1, 3))).mean())
                if s < spread:
                    spread, at = s, (ox, oy)
        if spread <= tol:
            best, off = k, at
    return best, off


def to_native(path: str):
    """The image reduced to one pixel per block, plus the scale and phase."""
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(np.int16)
    k, (ox, oy) = detect(a, path.lower().endswith(('.jpg', '.jpeg')))
    if k == 1:
        return im, 1, (0, 0)
    return Image.fromarray(np.asarray(im)[oy + k // 2::k, ox + k // 2::k]), k, (ox, oy)


def main(paths):
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'native')
    os.makedirs(out_dir, exist_ok=True)
    for p in paths:
        im, k, off = to_native(p)
        name = os.path.splitext(os.path.basename(p))[0]
        im.save(os.path.join(out_dir, name + '.png'))
        print(f'{name:46s} x{k} phase{off} -> {im.width}x{im.height} px'
              f'  = {im.width / 32:.2f} x {im.height / 32:.2f} tiles of 32')


if __name__ == '__main__':
    main(sys.argv[1:])
