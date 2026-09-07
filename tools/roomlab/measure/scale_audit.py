"""The scale audit, drawn.

Every canon grid from rooms.ts at 32 px per tile, filled with copies of the
traced reference cabin at the same scale. The picture is the argument: a canon
room is two to five reference rooms long, and one reference room deep.

Needs a 1:1 render of berth.html's room canvas alongside it as reference.png —
open tools/roomlab/berth.html over a local server and save the right-hand canvas.

    python3 scale_audit.py <reference.png> <out.png>
"""
from PIL import Image, ImageDraw, ImageFont
import os
import re
import sys

ROOMS_TS = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        '..', '..', '..', 'src', 'lib', 'habitat', 'rooms.ts')
TILE, SHRINK = 32, 2
PAD, GAP, LABEL, COLS = 24, 34, 18, 3


def read_rooms(path):
    src = open(path).read()
    names = re.findall(r"name: '([^']+)',\s*\n\s*side", src)
    sides = re.findall(r"side: '(\w+)'", src)
    grids = [re.findall(r"'([^']*)'", g) for g in
             re.findall(r'grid: \[\n((?:\s*\'[^\']*\',\n)+)\s*\],', src)]
    return list(zip(names, sides, grids))


def main(reference, out):
    rooms = read_rooms(ROOMS_TS)
    ref = Image.open(reference).convert('RGB')
    true_w, true_h = ref.size
    ref = ref.resize((ref.width // SHRINK, ref.height // SHRINK), Image.NEAREST)
    rw, rh = ref.size

    cell_w = max(len(g[0]) for *_, g in rooms) * TILE // SHRINK + GAP
    cell_h = max(len(g) for *_, g in rooms) * TILE // SHRINK + GAP + LABEL
    im = Image.new('RGB', (PAD * 2 + COLS * cell_w,
                           PAD * 2 + 46 + ((len(rooms) + COLS - 1) // COLS) * cell_h),
                   (13, 14, 18))
    d = ImageDraw.Draw(im)

    def font(size):
        try:
            return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', size)
        except OSError:
            return ImageFont.load_default()

    f, fb = font(12), font(15)
    d.text((PAD, 8), 'THE SCALE AUDIT', fill=(240, 240, 246), font=fb)
    d.text((PAD, 26), 'Each canon grid at 32 px per tile, filled with the traced '
                      f'{true_w}x{true_h} px reference cabin at the same scale.',
           fill=(170, 178, 196), font=f)

    for i, (name, side, g) in enumerate(rooms):
        cx = PAD + (i % COLS) * cell_w
        cy = PAD + 46 + (i // COLS) * cell_h
        w, h = len(g[0]) * TILE // SHRINK, len(g) * TILE // SHRINK
        d.rectangle([cx - 1, cy + LABEL - 1, cx + w, cy + LABEL + h], fill=(22, 24, 29))
        for k in range(max(1, round(w / rw))):
            x0 = cx + k * rw
            if x0 + rw > cx + w:
                break
            im.paste(ref, (x0, cy + LABEL))
            d.rectangle([x0, cy + LABEL, x0 + rw - 1, cy + LABEL + rh - 1], outline=(232, 146, 64))
        d.rectangle([cx - 1, cy + LABEL - 1, cx + w, cy + LABEL + h],
                    outline=(96, 132, 180) if side == 'hull' else (172, 126, 74), width=2)
        d.text((cx, cy + 2), f'{name}   {len(g[0])}x{len(g)} tiles'
                             f'   = {w / rw:.1f} reference rooms wide',
               fill=(206, 212, 228), font=f)
    im.save(out)
    print(out, im.size)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
