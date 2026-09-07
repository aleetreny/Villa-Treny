"""A sheet drawn large with a numbered tile grid, so props are picked by
coordinate rather than guessed. index-sheet.html without a browser.

    python3 sheet_grid.py <sheet.png> <tile> <zoom> <out.png>
"""
from PIL import Image, ImageDraw, ImageFont
import sys

LEFT, TOP = 24, 16


def main(path, tile, zoom, out):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    canvas = Image.new('RGBA', (w * zoom + LEFT, h * zoom + TOP), (24, 26, 32, 255))
    canvas.alpha_composite(Image.new('RGBA', (w * zoom, h * zoom), (60, 62, 70, 255)), (LEFT, TOP))
    canvas.alpha_composite(im.resize((w * zoom, h * zoom), Image.NEAREST), (LEFT, TOP))
    d = ImageDraw.Draw(canvas)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 12)
    except OSError:
        f = ImageFont.load_default()
    for c in range(w // tile + 1):
        x = LEFT + c * tile * zoom
        d.line([(x, TOP), (x, TOP + h * zoom)], fill=(255, 80, 80, 150))
        if c < w // tile:
            d.text((x + 2, 3), str(c), fill=(255, 220, 120, 255), font=f)
    for r in range(h // tile + 1):
        y = TOP + r * tile * zoom
        d.line([(LEFT, y), (LEFT + w * zoom, y)], fill=(255, 80, 80, 150))
        if r < h // tile:
            d.text((2, y + 2), str(r), fill=(255, 220, 120, 255), font=f)
    canvas.convert('RGB').save(out)
    print(out, canvas.size)


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4])
