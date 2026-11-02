#!/usr/bin/env python3
"""Builds the legible Gothic display bitmap font atlases from art/fonts/Almendra-Bold.ttf
(SIL OFL 1.1). Produces assets/font_gothic_<cap>.png plus assets/font_gothic.json with
per-glyph metrics for cap heights 10/20/30/40 px (used for large display scales 3+;
scales above 4 reuse the 40px atlas with integer upscaling).

Glyphs are rasterized with 4x supersampling + hard pixel alpha, a chiseled top-lit
neutral ivory-white face (so Canvas2D `multiply` tinting hits exact gold/crimson/ivory
colors), and a crisp 1px dark gothic outline that remains dark under tinting."""
import json
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TTF = os.path.join(ROOT, 'art', 'fonts', 'Almendra-Bold.ttf')
OUT = os.path.join(ROOT, 'assets')
ORDER = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:!?-'\"/()+·&%*")
CAPS = [10, 20, 30, 40]
SS = 4  # supersample factor before box-downscaling to pixel grid


def find_pt_for_cap(target_cap_ss):
    """Finds the TrueType point size whose 'H' ink height matches `target_cap_ss`."""
    best_f, best_d = None, 10**9
    for pt in range(max(8, target_cap_ss), target_cap_ss * 3):
        f = ImageFont.truetype(TTF, pt)
        im = Image.new('L', (pt * 2, pt * 2), 0)
        ImageDraw.Draw(im).text((20, 20), 'H', fill=255, font=f)
        ys = np.flatnonzero(np.array(im).any(axis=1))
        if not len(ys):
            continue
        h = int(ys[-1] - ys[0] + 1)
        d = abs(h - target_cap_ss)
        if d < best_d:
            best_d, best_f = d, f
    return best_f


def build_cap_atlas(cap):
    # Reserve 1px top and 1px bottom for the dark pixel outline so total cap height == `cap`.
    body_cap = max(8, cap - 2)
    f_main = find_pt_for_cap(body_cap * SS)
    canvas_sz = body_cap * SS * 4
    ox = oy = body_cap * SS

    im_h = Image.new('L', (canvas_sz, canvas_sz), 0)
    ImageDraw.Draw(im_h).text((ox, oy), 'H', fill=255, font=f_main)
    ys_h = np.flatnonzero(np.array(im_h).any(axis=1))
    cap_top_ss, base_ss = int(ys_h[0]), int(ys_h[-1])
    cap_h_ss = base_ss - cap_top_ss + 1

    cells = []
    for ch in ORDER:
        im = Image.new('L', (canvas_sz, canvas_sz), 0)
        d = ImageDraw.Draw(im)
        if ch.isdigit():
            # Normalize medieval oldstyle figures into crisp cap-height lining digits
            # so ALL-CAPS display banners ("STAGE 12", "100%", "2X") align cleanly.
            d.text((ox, oy), ch, fill=255, font=f_main)
            ys0 = np.flatnonzero(np.array(im).any(axis=1))
            h0 = max(1, int(ys0[-1] - ys0[0] + 1))
            f_dig = ImageFont.truetype(TTF, max(8, round(f_main.size * (cap_h_ss / h0))))
            im = Image.new('L', (canvas_sz, canvas_sz), 0)
            ImageDraw.Draw(im).text((ox, oy), ch, fill=255, font=f_dig)
            arr = np.array(im)
            ys = np.flatnonzero(arr.any(axis=1))
            xs = np.flatnonzero(arr.any(axis=0))
            crop_ss = arr[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
            rel_top_ss = -cap_h_ss
        else:
            d.text((ox, oy), ch, fill=255, font=f_main)
            arr = np.array(im)
            ys = np.flatnonzero(arr.any(axis=1))
            xs = np.flatnonzero(arr.any(axis=0))
            if not len(ys):
                print('missing', ch)
                continue
            crop_ss = arr[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
            rel_top_ss = int(ys[0]) - (base_ss + 1)
            # Center brackets/operators vertically against ALL-CAPS height
            if ch in '()%+':
                gh = int(ys[-1] - ys[0] + 1)
                rel_top_ss = -round((cap_h_ss + gh) * 0.5)

        w1 = max(1, round(crop_ss.shape[1] / SS))
        h1 = max(1, round(crop_ss.shape[0] / SS))
        down = np.array(Image.fromarray(crop_ss).resize((w1, h1), Image.BOX))
        thresh = 98 if cap <= 12 else 106
        body = down >= thresh
        if not body.any():
            body = down >= max(30, int(down.max()) // 2)

        h_out, w_out = h1 + 2, w1 + 2
        bpad = np.zeros((h_out, w_out), dtype=bool)
        bpad[1:-1, 1:-1] = body

        dil = bpad.copy()
        neighbors = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if cap >= 18:
            neighbors += [(-1, -1), (-1, 1), (1, -1), (1, 1)]
        for dy_n, dx_n in neighbors:
            sh = np.zeros_like(bpad)
            sy0, sy1 = max(0, dy_n), h_out + min(0, dy_n)
            sx0, sx1 = max(0, dx_n), w_out + min(0, dx_n)
            sh[sy0:sy1, sx0:sx1] = bpad[sy0 - dy_n:sy1 - dy_n, sx0 - dx_n:sx1 - dx_n]
            dil |= sh
        outline = dil & (~bpad)

        rgba = np.zeros((h_out, w_out, 4), dtype=np.uint8)
        dy_body = round(rel_top_ss / SS)
        for py in range(h_out):
            cap_y = (py - 1) + (body_cap + dy_body)
            t = float(np.clip(cap_y / max(1, body_cap - 1), 0.0, 1.0))
            base_v = 1.0 - 0.18 * (t ** 1.25)
            for px in range(w_out):
                if bpad[py, px]:
                    top_spec = not bpad[py - 1, px]
                    bot_bevel = not bpad[py + 1, px]
                    v = base_v + (0.06 if top_spec else 0.0) - (0.05 if bot_bevel and not top_spec else 0.0)
                    v = float(np.clip(v, 0.76, 1.0))
                    c_val = round(255 * v)
                    rgba[py, px] = [c_val, c_val, max(0, c_val - 4), 255]
                elif outline[py, px]:
                    rgba[py, px] = [20, 12, 24, 255]

        # Baseline sits `cap` px below line top `y`; `dy_body` is relative to body baseline (`cap - 1`)
        # and `bpad` adds a 1px top outline row, so `dy = dy_body - 2` places capitals cleanly at `gy = y`.
        dy = int(dy_body - 2)
        cells.append((ch, Image.fromarray(rgba), dy))

    total_w = sum(c[1].width + 1 for c in cells)
    max_h = max(c[1].height for c in cells)
    atlas = Image.new('RGBA', (total_w, max_h), (0, 0, 0, 0))
    x = 0
    glyph_meta = {}
    for ch, img, dy in cells:
        atlas.paste(img, (x, 0), img)
        glyph_meta[ch] = dict(x=x, y=0, w=img.width, h=img.height, dy=dy)
        x += img.width + 1
    return atlas, glyph_meta


def main():
    metrics = {'caps': {}, 'order': ORDER}
    for cap in CAPS:
        atlas, glyph_meta = build_cap_atlas(cap)
        fname = f'font_gothic_{cap}.png'
        atlas.save(os.path.join(OUT, fname))
        metrics['caps'][str(cap)] = dict(file=fname, cap=cap, glyphs=glyph_meta)
        print(fname, atlas.size)
    with open(os.path.join(OUT, 'font_gothic.json'), 'w') as fh:
        json.dump(metrics, fh)
    print('wrote font_gothic.json')


if __name__ == '__main__':
    main()
