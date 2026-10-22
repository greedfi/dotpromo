#!/usr/bin/env python3
"""Dominant brand colors from a logo (Pillow median-cut). Skips transparent pixels and
near-white / near-black / grey backgrounds. Usage: python3 palette.py logo.png [n]"""
import colorsys, sys
from PIL import Image

def brand_colors(path, n=3):
    im = Image.open(path).convert('RGBA'); im.thumbnail((256, 256))
    px = [p[:3] for p in (im.get_flattened_data() if hasattr(im,'get_flattened_data') else im.getdata()) if p[3] > 128]
    keep = []
    for r, g, b in px:
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if 0.08 < l < 0.94 and s > 0.18: keep.append((r, g, b))
    if len(keep) < 50: keep = px or [(29, 155, 240)]
    q = Image.new('RGB', (len(keep), 1)); q.putdata(keep)
    q = q.quantize(colors=max(n * 3, 8), method=Image.MEDIANCUT)
    pal = q.getpalette(); counts = sorted(q.getcolors(), reverse=True)
    out = []
    for _, i in counts:
        c = tuple(pal[i * 3:i * 3 + 3])
        if all(sum(abs(a - b) for a, b in zip(c, o)) > 90 for o in out): out.append(c)
        if len(out) == n: break
    return ['#%02x%02x%02x' % c for c in out]

if __name__ == '__main__':
    print(brand_colors(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 3))
