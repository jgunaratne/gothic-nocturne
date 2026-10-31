#!/usr/bin/env python3
"""Builds the blackletter bitmap font atlases from art/raw/font_gothic_sheet.png
(an 8x6 grid of glyph cells on chroma green). Produces assets/font_gothic_<cap>.png
plus assets/font_gothic.json with per-glyph metrics for cap heights 10/20/30/40 px
(used for text scales 1-4; larger scales reuse the 40px atlas with integer upscaling)."""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'raw', 'font_gothic_sheet.png')
OUT = os.path.join(ROOT, 'assets')
ORDER = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:!?-'/()+·")
COLS, ROWS = 8, 6
CAPS = [10, 20, 30, 40]

im = np.array(Image.open(SRC).convert('RGB')).astype(int)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
greenish = (g > r + 40) & (g > b + 40)
alpha = (~greenish).astype(np.uint8) * 255
H, W = alpha.shape
cw, chh = W / COLS, H / ROWS

# Locate each glyph's bbox inside its grid cell (ignoring thin border lines)
glyphs = {}
for idx, ch in enumerate(ORDER):
    cx, cy = idx % COLS, idx // COLS
    x0, y0 = int(cx * cw) + 6, int(cy * chh) + 6
    x1, y1 = int((cx + 1) * cw) - 6, int((cy + 1) * chh) - 6
    cell = alpha[y0:y1, x0:x1]
    # drop border remnants: columns/rows that are almost fully opaque spanning the cell
    colfrac = cell.mean(axis=0) / 255.0; rowfrac = cell.mean(axis=1) / 255.0
    cell = cell.copy()
    cell[:, colfrac > 0.9] = 0; cell[rowfrac > 0.9, :] = 0
    ys = np.flatnonzero(cell.any(axis=1)); xs = np.flatnonzero(cell.any(axis=0))
    if not len(ys): print('missing', ch); continue
    glyphs[ch] = dict(x=x0 + xs[0], y=y0 + ys[0], w=xs[-1] - xs[0] + 1, h=ys[-1] - ys[0] + 1, rowTop=y0, cellH=y1 - y0)

# Cap height reference: median height of the capital letters
capH = float(np.median([glyphs[c]['h'] for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" if c in glyphs]))
# Baseline reference per row: bottom of letters/digits in that row relative to row top
rowBase = {}
for ch, gl in glyphs.items():
    if ch.isalnum():
        rowBase.setdefault(gl['rowTop'], []).append(gl['y'] + gl['h'] - gl['rowTop'])
rowBase = {k: float(np.median(v)) for k, v in rowBase.items()}
rgba_src = Image.fromarray(np.dstack([im.clip(0, 255).astype(np.uint8), alpha]))

metrics = {'caps': {}, 'order': ORDER}
for cap in CAPS:
    scale = cap / capH
    cells = []
    for ch in ORDER:
        if ch not in glyphs: continue
        gl = glyphs[ch]
        crop = rgba_src.crop((gl['x'], gl['y'], gl['x'] + gl['w'], gl['y'] + gl['h']))
        w = max(1, round(gl['w'] * scale)); h = max(1, round(gl['h'] * scale))
        # box-downscale then hard alpha for crisp pixels
        small = crop.resize((w, h), Image.BOX)
        a = np.array(small)[..., 3]
        px = np.array(small).copy(); px[..., 3] = np.where(a > 110, 255, 0)
        base = rowBase.get(gl['rowTop'], gl['cellH'] * 0.75)
        # vertical offset of this glyph's top relative to the baseline (negative = above)
        dy = round((gl['y'] - gl['rowTop'] - base) * scale)
        cells.append((ch, Image.fromarray(px), dy))
    # pack in one row
    totalW = sum(c[1].width + 1 for c in cells); maxH = max(c[1].height for c in cells)
    atlas = Image.new('RGBA', (totalW, maxH), (0, 0, 0, 0))
    x = 0; m = {}
    for ch, img, dy in cells:
        atlas.paste(img, (x, 0), img)
        m[ch] = dict(x=x, y=0, w=img.width, h=img.height, dy=dy)
        x += img.width + 1
    fname = f'font_gothic_{cap}.png'
    atlas.save(os.path.join(OUT, fname))
    metrics['caps'][str(cap)] = dict(file=fname, cap=cap, glyphs=m)
    print(fname, atlas.size)
with open(os.path.join(OUT, 'font_gothic.json'), 'w') as fh:
    json.dump(metrics, fh)
print('wrote font_gothic.json')
