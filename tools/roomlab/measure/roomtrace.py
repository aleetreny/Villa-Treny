"""Trace a whole room, not a handful of props.

`trace.py` answers "where does this sprite go". This answers "what is this room
made of", which is a different problem: the room is a pile of sprites drawn over
a shell, most of them partly hidden by the ones in front, and getting it right
means solving four things at once —

    which sprite, where, at what depth in the draw order, and whether it belongs
    at all

— against one measure only: **does the picture get closer to the reference**. A
score can be fooled; the difference cannot. Every pass here proposes and then
composites and counts, and nothing is kept that does not remove pixels.

Run the passes as a loop until it stops moving:

    L = greedy(name, L, places(name, cands, win))   # which sprite, where
    L = reorder(name, L)                            # at what depth
    L = prune(name, L)                              # does it belong
    L = nudge(name, L)                              # one pixel out

The shell here mirrors `tools/roomlab/digging-kit.js` so the search can run
without a browser. It is a mirror, not the thing that ships: **verify the final
numbers off the browser's own canvas**, because the two build the same shape by
different means and only one of them is the page. That is how the even-odd cut
bug was found, and it was worth 82 pixels.

    python3 roomtrace.py makeshift-two-rooms          # score the saved trace
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = __file__.rsplit('/', 1)[0]
P = HERE + '/../../../public/assets/props/'
N = HERE + '/native/'
RT = 'makeshift_roomtiles.png'
BANDFILL = (192, 184, 178, 255)
INK = (0, 0, 0, 255)
BAND = 6

_SHEETS = {}


def sheet(n):
    if n not in _SHEETS:
        _SHEETS[n] = Image.open(P + n).convert('RGBA')
    return _SHEETS[n]


# Every room, measured off its render. `cuts` are rectangles taken out of the
# outline; `stubs` are the walls *inside* it — x0/x1 the ink either side, `face`
# the row its 64 px brick block starts on, `phx` that block's x phase, `cap` the
# row its plan view starts on; `door` is the tile of the south band that is the
# way out. Keep this in step with REF in digging-kit.js.
GEO = {
    'makeshift-two-rooms': dict(
        W=245, H=181, ox0=4, oy0=4, ox1=239, oy1=175, top=10, ph=10,
        cuts=[(80, 4, 131, 35), (144, 144, 239, 175)], door=(74, 105),
        stubs=[dict(x0=74, x1=137, face=42, phx=10)]),
    'makeshift-two-rooms-b': dict(
        W=181, H=187, ox0=4, oy0=4, ox1=175, oy1=172, top=10, ph=10,
        cuts=[], door=(74, 105),
        stubs=[dict(x0=71, x1=76, face=42, phx=19, cap=9, capink=True)]),
    'makeshift-bedsit': dict(
        W=179, H=217, ox0=19, oy0=23, ox1=158, oy1=194, top=29, ph=25,
        cuts=[], door=(74, 105), stubs=[]),
}


def room_mask(g, cut_door=True):
    """What counts as room. The mouth does not: it is the way out, and the
    reference has nothing there to be right or wrong about."""
    m = np.zeros((g['H'], g['W']), bool)
    m[g['oy0']:g['oy1'] + 1, g['ox0']:g['ox1'] + 1] = True
    for (a, b, c, d) in g.get('cuts', []):
        m[b:d + 1, a:c + 1] = False
    if cut_door and 'door' in g:
        d0, d1 = g['door']
        m[g['oy1'] - 4:g['oy1'] + 2, d0:d1 + 1] = False
    return m


def shell(name):
    """Band, brick, floor, interior walls, mouth — the mirror of digging-kit."""
    g = GEO[name]
    m = room_mask(g, cut_door=False)          # the band follows walls, not doors
    inner = ndimage.binary_erosion(m, np.ones((3, 3), bool), iterations=BAND)
    a = np.zeros((g['H'], g['W'], 4), np.uint8)
    a[m & ~inner] = BANDFILL
    a[m & ~ndimage.binary_erosion(m, np.ones((3, 3), bool))] = INK
    a[ndimage.binary_dilation(inner, np.ones((3, 3), bool)) & ~inner] = INK
    im = Image.fromarray(a, 'RGBA')

    rt = sheet(RT)
    ys, xs = np.where(inner)
    ix1, iy1 = xs.max(), ys.max()
    fill = Image.new('RGBA', (g['W'], g['H']))
    for x in range(g['ph'] - 32, ix1 + 32, 32):
        fill.paste(rt.crop((128, 224, 160, 256)), (x, g['top'] - 32))
        fill.paste(rt.crop((128, 224, 160, 288)), (x, g['top']))
        for y in range(g['top'] + 64, iy1 + 64, 64):
            fill.paste(rt.crop((160, 224, 192, 288)), (x, y))
    fa = np.asarray(fill).copy()
    fa[~inner] = 0
    im.alpha_composite(Image.fromarray(fa, 'RGBA'))

    for s in g.get('stubs', ()):
        _stub(im, s, rt)
    if 'door' in g:
        d0, d1 = g['door']
        a = np.asarray(im).copy()
        a[g['oy1'] - 4:g['oy1'] + 2, d0:d1 + 1] = 0
        a[g['oy1'] - 5, d0:d1 + 1] = INK
        a[g['oy1'] - 4:g['oy1'] + 1, d0 - 1] = INK        # the jambs
        a[g['oy1'] - 4:g['oy1'] + 1, d1 + 1] = INK
        im = Image.fromarray(a, 'RGBA')
    return im, g


def _stub(im, s, rt):
    """One interior wall: its plan view, then its south face hanging below."""
    x0, x1, face = s['x0'], s['x1'], s['face']
    bot = face + 63
    a = np.asarray(im).copy()
    top = s.get('cap', face)
    if 'cap' in s:
        a[s['cap']:face, x0 + 1:x1] = BANDFILL
    strip = Image.new('RGBA', (x1 - x0 - 1, 64))
    x = x0 + 1 - ((x0 + 1 - s['phx']) % 32)
    while x < x1:
        strip.paste(rt.crop((128, 224, 160, 288)), (x - (x0 + 1), 0))
        x += 32
    a[face:bot + 1, x0 + 1:x1] = np.asarray(strip)
    a[top:bot + 1, x0] = INK
    a[top:bot + 1, x1] = INK
    a[bot, x0:x1 + 1] = INK
    if s.get('capink'):
        a[face, x0:x1 + 1] = INK
    im.paste(Image.fromarray(a, 'RGBA'), (0, 0))


def put(im, sh, sx, sy, w, h, dx, dy):
    im.alpha_composite(sheet(sh).crop((sx, sy, sx + w, sy + h)), (dx, dy))


def build(name, L):
    im, _ = shell(name)
    for e in L:
        put(im, e[0], e[1], e[2], e[3], e[4], e[5], e[6])
    return im


def reference(name):
    return np.asarray(Image.open(N + name + '.png').convert('RGB')).astype(float)


def bad(name, im):
    """The one number every pass is judged by: pixels differing inside the room."""
    d = np.abs(np.asarray(im.convert('RGB')).astype(int) - reference(name)).sum(2)
    return int(((d > 90) & room_mask(GEO[name])).sum())


def blobs(name, L, n=8):
    """Where the room is still wrong, biggest first."""
    d = np.abs(np.asarray(build(name, L).convert('RGB')).astype(int)
               - reference(name)).sum(2)
    m = (d > 90) & room_mask(GEO[name])
    lb, k = ndimage.label(m)
    if not k:
        return []
    sz = ndimage.sum(m, lb, range(1, k + 1))
    out = []
    for i in np.argsort(sz)[::-1][:n]:
        ys, xs = np.where(lb == i + 1)
        out.append((int(sz[i]), int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())))
    return out


def places(name, cands, win, frac=0.55, keep=6, sh='makeshift.png'):
    """Every position in `win` for every candidate, scored by **trimmed** mean
    colour error over the sprite's own opaque pixels — the best `frac` of them,
    which is the part of a half-hidden sprite you can still see. A plain mean
    throws away every large object in the room."""
    R = reference(name)
    H, W = R.shape[:2]
    px = np.asarray(sheet(sh)).astype(float)
    al = np.asarray(sheet(sh))[..., 3]
    out = []
    for (sx, sy, w, h) in cands:
        spr, m = px[sy:sy + h, sx:sx + w, :3], al[sy:sy + h, sx:sx + w] > 200
        if m.sum() < 20:
            continue
        best = []
        for dy in range(max(0, win[1]), min(H - h, win[3]) + 1):
            for dx in range(max(0, win[0]), min(W - w, win[2]) + 1):
                e = np.abs(spr - R[dy:dy + h, dx:dx + w]).sum(2)[m]
                e.sort()
                best.append((float(e[:max(1, int(len(e) * frac))].mean()), dx, dy))
        best.sort()
        out += [(round(sc, 1), sh, sx, sy, w, h, dx, dy) for (sc, dx, dy) in best[:keep]]
    out.sort()
    return out


def greedy(name, L, out, gain=15, maxerr=40, quiet=False):
    """Take the placement that removes the most pixels, and its best depth with
    it. Depth is not decoration: a box behind a cool box scores 5.7 and makes
    the room worse painted last."""
    L = list(L)
    while True:
        b0 = bad(name, build(name, L))
        take = None
        for (sc, sh, sx, sy, w, h, dx, dy) in out:
            if sc > maxerr:
                continue
            for i in range(len(L) + 1):
                b1 = bad(name, build(name, L[:i] + [[sh, sx, sy, w, h, dx, dy]] + L[i:]))
                if b0 - b1 > gain and (take is None or b0 - b1 > take[0]):
                    take = (b0 - b1, i, sc, [sh, sx, sy, w, h, dx, dy])
        if take is None:
            return L
        g_, i, sc, e = take
        L.insert(i, e)
        out = [o for o in out if not (o[2] == e[1] and o[3] == e[2]
                                      and o[6] == e[5] and o[7] == e[6])]
        if not quiet:
            print('  + src(%d,%d) %dx%d -> (%d,%d) depth %d err %.1f gain %d'
                  % (e[1], e[2], e[3], e[4], e[5], e[6], i, sc, g_), flush=True)


def reorder(name, L, quiet=False):
    """Offer every object every other depth. A jar found before the shelf it
    stands on is the right sprite in the right place and still wrong on screen."""
    L = list(L)
    while True:
        b0 = bad(name, build(name, L))
        take = None
        for i in range(len(L)):
            rest = L[:i] + L[i + 1:]
            for j in range(len(rest) + 1):
                if j == i:
                    continue
                b1 = bad(name, build(name, rest[:j] + [L[i]] + rest[j:]))
                if b0 - b1 > 0 and (take is None or b0 - b1 > take[0]):
                    take = (b0 - b1, i, j)
        if take is None:
            return L
        g_, i, j = take
        e = L.pop(i)
        L.insert(j, e)
        if not quiet:
            print('  ~ src(%d,%d) at (%d,%d): depth %d -> %d gain %d'
                  % (e[1], e[2], e[5], e[6], i, j, g_), flush=True)


def prune(name, L, quiet=False):
    """Drop anything the picture is no worse without. The greedy pass commits on
    the evidence it has at the time; once its neighbours are right, some of those
    commitments are simply wrong — eleven of forty-seven, in Mara's."""
    L = list(L)
    while True:
        b0 = bad(name, build(name, L))
        drop, best = None, 0
        for i in range(len(L)):
            b1 = bad(name, build(name, L[:i] + L[i + 1:]))
            if b1 <= b0 and b0 - b1 >= best:
                drop, best = i, b0 - b1
        if drop is None:
            return L
        e = L.pop(drop)
        if not quiet:
            print('  - src(%d,%d) %dx%d at (%d,%d) saves %d'
                  % (e[1], e[2], e[3], e[4], e[5], e[6], best), flush=True)


def nudge(name, L, r=1, quiet=False):
    """A sprite scored on its best 55 % can sit a pixel out and still win."""
    L = [list(e) for e in L]
    while True:
        b0 = bad(name, build(name, L))
        take = None
        for i in range(len(L)):
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    if not dx and not dy:
                        continue
                    T = [list(e) for e in L]
                    T[i][5] += dx
                    T[i][6] += dy
                    if T[i][5] < 0 or T[i][6] < 0:
                        continue
                    b1 = bad(name, build(name, T))
                    if b0 - b1 > 0 and (take is None or b0 - b1 > take[0]):
                        take = (b0 - b1, i, dx, dy)
        if take is None:
            return L
        g_, i, dx, dy = take
        L[i][5] += dx
        L[i][6] += dy
        if not quiet:
            print('  > src(%d,%d) moved %+d%+d to (%d,%d) gain %d'
                  % (L[i][1], L[i][2], dx, dy, L[i][5], L[i][6], g_), flush=True)


def load_html(key, path=HERE + '/../diggings.html'):
    """Read one TRACE list back out of the page, so a run can resume from what
    is committed rather than from a scratch file."""
    import re
    s = open(path).read()
    i = s.index('  %s: [' % key)
    j = s.index('\n  ],', i)
    rows = re.findall(r'\[\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]', s[i:j])
    return [['makeshift.png'] + [int(v) for v in r] for r in rows]


def as_js(key, L):
    return ('  %s: [\n' % key
            + '\n'.join('    [%3d,%3d,%3d,%3d,%3d,%3d],'
                        % (e[1], e[2], e[3], e[4], e[5], e[6]) for e in L)
            + '\n  ],')


if __name__ == '__main__':
    KEY = {'makeshift-two-rooms': 'twoRooms',
           'makeshift-two-rooms-b': 'twoRoomsB',
           'makeshift-bedsit': 'bedsit'}
    for name in (sys.argv[1:] or list(GEO)):
        L = load_html(KEY[name])
        m = room_mask(GEO[name])
        print('%-24s %3d objects  %5d px of %5d inside the outline  %.3f %%'
              % (name, len(L), bad(name, build(name, L)), m.sum(),
                 100 * bad(name, build(name, L)) / m.sum()))
