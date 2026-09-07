"""A sheet's real objects, as connected components of its alpha channel.

The same ground truth as find-objects.html, offline. Never guess a sprite's tile
span: a 2x3 grab off a sheet may be one object or two halves of two.

    python3 objects.py <sheet.png>
"""
from PIL import Image
import numpy as np
import sys

from scipy import ndimage

TILE = 32


def components(path: str, min_area: int = 40):
    """(objects, rgba array). Each object carries its ink rectangle and tile."""
    a = np.asarray(Image.open(path).convert('RGBA'))
    lab, _ = ndimage.label(a[..., 3] > 200, structure=np.ones((3, 3)))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        ys, xs = sl
        area = int((lab[sl] == i).sum())
        if area < min_area:
            continue
        out.append(dict(x0=xs.start, y0=ys.start, w=xs.stop - xs.start,
                        h=ys.stop - ys.start, area=area,
                        tile=(xs.start // TILE, ys.start // TILE)))
    return out, a


if __name__ == '__main__':
    objs, _ = components(sys.argv[1])
    print(len(objs), 'objects')
    for o in objs:
        print(f"  t({o['tile'][0]:2d},{o['tile'][1]:2d})  px({o['x0']:3d},{o['y0']:3d})"
              f"  {o['w']:3d}x{o['h']:<3d}  area {o['area']}")
