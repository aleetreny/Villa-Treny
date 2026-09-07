"""Crop a region and lay a labelled pixel ruler over it.

The fallback when provenance.py cannot place a sprite automatically: read a
prop's extent off the image in source coordinates and divide by the same prop's
ink size on its sheet. Also the fastest way to read a render's scale — at zoom Z
a one-pixel outline is Z screen pixels wide, a two-pixel outline is 2Z.

    python3 ruler.py <image> x0 y0 x1 y1 <zoom> <out.png> [step=8]
"""
from PIL import Image, ImageDraw, ImageFont
import sys

PAD = 30


def main(argv):
    path, x0, y0, x1, y1 = argv[1], *map(int, argv[2:6])
    zoom, out = int(argv[6]), argv[7]
    step = int(argv[8]) if len(argv) > 8 else 8

    im = Image.open(path).convert('RGBA').crop((x0, y0, x1, y1))
    w, h = im.size
    canvas = Image.new('RGBA', (w * zoom + PAD, h * zoom + PAD), (20, 22, 28, 255))
    canvas.alpha_composite(Image.new('RGBA', (w * zoom, h * zoom), (255, 0, 255, 255)), (PAD, PAD))
    canvas.alpha_composite(im.resize((w * zoom, h * zoom), Image.NEAREST), (PAD, PAD))

    d = ImageDraw.Draw(canvas)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 12)
    except OSError:
        f = ImageFont.load_default()
    for x in range(0, w + 1, step):
        d.line([(PAD + x * zoom, PAD), (PAD + x * zoom, PAD + h * zoom)], fill=(0, 255, 255, 90))
        d.text((PAD + x * zoom + 1, 2), str(x0 + x), fill=(255, 230, 120, 255), font=f)
    for y in range(0, h + 1, step):
        d.line([(PAD, PAD + y * zoom), (PAD + w * zoom, PAD + y * zoom)], fill=(0, 255, 255, 90))
        d.text((1, PAD + y * zoom + 1), str(y0 + y), fill=(255, 230, 120, 255), font=f)
    canvas.convert('RGB').save(out)
    print(out, canvas.size)


if __name__ == '__main__':
    main(sys.argv)
