"""Every sheet object found in a render, with the source rectangle and the
destination position — the list a 1:1 trace is written from.

    python3 trace.py <native render.png> <sheet.png>... [--thresh 0.9] [--min-area 60]
"""
from PIL import Image
import numpy as np, os, sys
from provenance import luma, ncc_map
from objects import components

def run(render, sheets, thresh=0.9, min_area=60):
    img = luma(np.asarray(Image.open(render).convert('RGBA')))
    hits = []
    for sheet in sheets:
        objs, sa = components(sheet, min_area=min_area)
        sl, sm = luma(sa), (sa[..., 3] > 200).astype(np.float64)
        for o in objs:
            y, x, h, w = o['y0'], o['x0'], o['h'], o['w']
            t, m = sl[y:y+h, x:x+w], sm[y:y+h, x:x+w]
            if t.shape[0] > img.shape[0] or t.shape[1] > img.shape[1]:
                continue
            r = ncc_map(img, t, m)
            if r is None:
                continue
            i = np.unravel_index(np.nanargmax(r), r.shape)
            v = float(r[i])
            if v >= thresh:
                hits.append(dict(sheet=os.path.basename(sheet), sx=x, sy=y, w=w, h=h,
                                 tile=o['tile'], ncc=round(v,4),
                                 dx=int(i[1]), dy=int(i[0])))
    hits.sort(key=lambda h: (-h['ncc']))
    return hits

if __name__ == '__main__':
    args = []
    th = 0.9; ma = 60
    i = 1
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--thresh':
            th = float(sys.argv[i + 1]); i += 2
        elif a == '--min-area':
            ma = int(sys.argv[i + 1]); i += 2
        else:
            args.append(a); i += 1
    hits = run(args[0], args[1:], th, ma)
    print(f'{len(hits)} objects at ncc >= {th}')
    for h in hits:
        print(f"  {h['ncc']:.3f}  {h['sheet']:26s} src({h['sx']:3d},{h['sy']:3d}) "
              f"{h['w']:3d}x{h['h']:<3d} t{h['tile']}  ->  ({h['dx']:3d},{h['dy']:3d})")


def whats_at(render, sheets, box, min_area=60, top=6):
    """The sheet objects whose best position lands inside a destination box."""
    from provenance import luma, ncc_map
    from objects import components
    from PIL import Image
    import numpy as np, os
    x0, y0, x1, y1 = box
    img = luma(np.asarray(Image.open(render).convert('RGBA')))
    out = []
    for sheet in sheets:
        objs, sa = components(sheet, min_area=min_area)
        sl, sm = luma(sa), (sa[..., 3] > 200).astype(np.float64)
        for o in objs:
            y, x, h, w = o['y0'], o['x0'], o['h'], o['w']
            if h > img.shape[0] or w > img.shape[1]:
                continue
            t, m = sl[y:y+h, x:x+w], sm[y:y+h, x:x+w]
            r = ncc_map(img, t, m)
            if r is None:
                continue
            sub = r[max(0, y0):min(r.shape[0], y1), max(0, x0):min(r.shape[1], x1)]
            if sub.size == 0:
                continue
            i = np.unravel_index(np.nanargmax(sub), sub.shape)
            v = float(sub[i])
            out.append((v, os.path.basename(sheet), x, y, w, h, o['tile'],
                        int(i[1]) + max(0, x0), int(i[0]) + max(0, y0)))
    out.sort(reverse=True)
    return out[:top]


def every_position(render, sheet, sx, sy, w, h, thresh=0.95, sep=6):
    """Every place this sub-rectangle appears in the render, not just the best.
    A prop the render reuses — a jar, a crate — needs all of them."""
    from provenance import luma, ncc_map
    from PIL import Image
    import numpy as np
    img = luma(np.asarray(Image.open(render).convert('RGBA')))
    a = np.asarray(Image.open(sheet).convert('RGBA'))
    if h > img.shape[0] or w > img.shape[1]:
        return []
    t = luma(a)[sy:sy + h, sx:sx + w]
    m = (a[sy:sy + h, sx:sx + w, 3] > 200).astype(np.float64)
    if m.sum() < 30:
        m = np.ones_like(t)
    r = ncc_map(img, t, m)
    if r is None:
        return []
    r = np.nan_to_num(r, nan=-1)
    out = []
    while True:
        i = np.unravel_index(np.argmax(r), r.shape)
        v = float(r[i])
        if v < thresh:
            break
        out.append((int(i[1]), int(i[0]), round(v, 3)))
        y0, y1 = max(0, i[0] - sep), i[0] + sep
        x0, x1 = max(0, i[1] - sep), i[1] + sep
        r[y0:y1, x0:x1] = -1
    return out
