#!/usr/bin/env python3
"""Deterministic asset pipeline for Gothic Nocturne.

Reads raw generations from art/raw/, applies the operations declared in
tools/asset_manifest.json, and writes engine-ready PNGs plus assets/atlas.json.

Operations (per asset):
  key        chroma-key flat green to alpha (full resolution, before scaling)
  scale      premultiplied box downscale to an exact width/height or factor
  seamless   "blend" (wrap-blend seam) or "mirror" (append a flipped copy)
  quantize   palette reduction (median cut, no dither) on opaque pixels only
  sheet      segment a sprite sheet into named frames and pack an atlas
  strip      terrain cross-section: locate the surface line and align it

Run:  .venv/bin/python tools/process_assets.py [--only name] [--preview]
"""

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "art", "raw")
WORK = os.path.join(ROOT, "art", "work")
OUT = os.path.join(ROOT, "assets")


# --------------------------------------------------------------------------
# Pixel helpers
# --------------------------------------------------------------------------

def load_rgba(path):
    img = Image.open(path).convert("RGBA")
    return np.asarray(img).astype(np.float32)


def chroma_key(px, key=(0, 255, 0), tol=120.0, soft=40.0):
    """Keys out `key` colour. Returns RGBA float array with alpha in 0..255.

    A pixel is fully transparent when its distance to the key colour is below
    `tol - soft`, fully opaque above `tol`, linear in between. Green spill on
    the remaining edge pixels is suppressed by clamping G to max(R, B).
    """
    rgb = px[..., :3]
    d = np.sqrt(((rgb - np.array(key, dtype=np.float32)) ** 2).sum(-1))
    # Also treat "greenish" pixels (G dominant by a wide margin) as key.
    g_dom = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
    d = np.where(g_dom > 110, np.minimum(d, tol - soft - 1), d)
    a = np.clip((d - (tol - soft)) / soft, 0.0, 1.0)
    out = px.copy()
    out[..., 3] = a * 255.0
    # Despill: pull green down toward the max of red/blue where it dominates.
    spill = np.clip(rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2]), 0, None)
    out[..., 1] = rgb[..., 1] - spill * 0.85
    return out


def resize_premultiplied(px, size):
    """Box-filter resize of an RGBA float array with premultiplied alpha."""
    a = px[..., 3:4] / 255.0
    prem = np.concatenate([px[..., :3] * a, px[..., 3:4]], axis=-1)
    img = Image.fromarray(np.clip(prem, 0, 255).astype(np.uint8), "RGBA")
    img = img.resize(size, Image.Resampling.BOX)
    arr = np.asarray(img).astype(np.float32)
    a2 = arr[..., 3:4] / 255.0
    rgb = np.where(a2 > 0.001, arr[..., :3] / np.maximum(a2, 0.001), 0)
    return np.concatenate([np.clip(rgb, 0, 255), arr[..., 3:4]], axis=-1)


def harden_alpha(px, threshold=0.5):
    out = px.copy()
    out[..., 3] = np.where(px[..., 3] >= threshold * 255.0, 255.0, 0.0)
    return out


def quantize(px, colors):
    """Median-cut palette on opaque pixels, nearest-colour remap, no dither."""
    opaque = px[..., 3] > 0
    if opaque.sum() == 0:
        return px
    samples = px[..., :3][opaque].astype(np.uint8)
    strip = Image.fromarray(samples.reshape(1, -1, 3), "RGB")
    pal_img = strip.quantize(colors=colors, method=Image.Quantize.MEDIANCUT,
                             dither=Image.Dither.NONE)
    pal = np.array(pal_img.getpalette()[: 3 * colors], dtype=np.float32)
    pal = pal.reshape(-1, 3)
    used = np.unique(np.asarray(pal_img))
    pal = pal[used]
    rgb = px[..., :3][opaque]
    # Chunked nearest-neighbour to bound memory.
    idx = np.empty(len(rgb), dtype=np.int32)
    step = 65536
    for i in range(0, len(rgb), step):
        chunk = rgb[i:i + step]
        d = ((chunk[:, None, :] - pal[None, :, :]) ** 2).sum(-1)
        idx[i:i + step] = d.argmin(1)
    out = px.copy()
    out[..., :3][opaque] = pal[idx]
    return out


def wrap_blend(px, frac=0.08):
    """Removes the horizontal seam by blending the edge zone with the image
    centre. a(x)=1 at the seam, falling to 0 at distance frac*W."""
    h, w, _ = px.shape
    k = max(2, int(w * frac))
    shifted = np.roll(px, w // 2, axis=1)
    x = np.arange(w)
    dist = np.minimum(x, w - x)  # distance to the wrap seam
    a = np.clip(1.0 - dist / k, 0.0, 1.0)
    a = a * a * (3 - 2 * a)
    a = a[None, :, None]
    return px * (1 - a) + shifted * a


def mirror_h(px):
    return np.concatenate([px, px[:, ::-1, :]], axis=1)


def to_image(px):
    return Image.fromarray(np.clip(px, 0, 255).astype(np.uint8), "RGBA")


# --------------------------------------------------------------------------
# Sheet segmentation
# --------------------------------------------------------------------------

def runs(mask1d, min_gap, min_len):
    """Returns [(start, end)] runs of True, merging gaps shorter than min_gap
    and dropping runs shorter than min_len."""
    idx = np.flatnonzero(mask1d)
    if len(idx) == 0:
        return []
    out = []
    s = idx[0]
    p = idx[0]
    for i in idx[1:]:
        if i - p > min_gap:
            out.append((s, p + 1))
            s = i
        p = i
    out.append((s, p + 1))
    return [(a, b) for a, b in out if b - a >= min_len]


def split_wide_cells(band, cells):
    """Splits cells that are much wider than the median at their thinnest
    interior column (handles poses whose props nearly touch a neighbour)."""
    if len(cells) < 2:
        return cells
    widths = sorted(b - a for a, b in cells)
    median = widths[len(widths) // 2]
    out = []
    for (a, b) in cells:
        if b - a > median * 1.9:
            col = band[:, a:b].sum(0)
            lo, hi = int((b - a) * 0.3), int((b - a) * 0.7)
            cut = a + lo + int(np.argmin(col[lo:hi]))
            if col[cut - a] <= 1:  # only split through (near-)empty columns
                out.append((a, cut))
                out.append((cut, b))
                continue
        out.append((a, b))
    return out


def segment_sheet(alpha, expected_rows, min_area_frac=0.0004):
    """Segments a keyed sheet into row bands then cells. Returns a list of rows,
    each a list of (x0, y0, x1, y1) bounding boxes."""
    h, w = alpha.shape
    mask = alpha > 127
    row_proj = mask.sum(1) > max(2, w * 0.002)
    bands = runs(row_proj, min_gap=int(h * 0.02), min_len=int(h * 0.03))
    rows = []
    for (y0, y1) in bands:
        band = mask[y0:y1]
        col_proj = band.sum(0) > 0
        cells = runs(col_proj, min_gap=max(3, int(w * 0.003)),
                     min_len=int(w * 0.01))
        cells = split_wide_cells(band, cells)
        boxes = []
        for (x0, x1) in cells:
            sub = band[:, x0:x1]
            ys = np.flatnonzero(sub.any(1))
            xs = np.flatnonzero(sub.any(0))
            bx0, bx1 = x0 + xs[0], x0 + xs[-1] + 1
            by0, by1 = y0 + ys[0], y0 + ys[-1] + 1
            if (bx1 - bx0) * (by1 - by0) >= min_area_frac * w * h:
                boxes.append((bx0, by0, bx1, by1))
        if boxes:
            rows.append(boxes)
    if expected_rows is not None and [len(r) for r in rows] != expected_rows:
        print(f"    ! expected row counts {expected_rows}, got "
              f"{[len(r) for r in rows]}")
    return rows


def pack_frames(frames, pad=1):
    """Shelf-packs a list of (name, rgba) into one image. Returns (img, rects)."""
    max_w = 1024
    x = y = pad
    shelf_h = 0
    rects = {}
    placed = []
    for name, px in frames:
        h, w, _ = px.shape
        if x + w + pad > max_w:
            x = pad
            y += shelf_h + pad
            shelf_h = 0
        rects[name] = (x, y, w, h)
        placed.append((x, y, px))
        x += w + pad
        shelf_h = max(shelf_h, h)
    total_w = max_w if y > pad else x
    total_h = y + shelf_h + pad
    atlas = np.zeros((total_h, total_w, 4), dtype=np.float32)
    for (ax, ay, px) in placed:
        h, w, _ = px.shape
        atlas[ay:ay + h, ax:ax + w] = px
    return atlas, rects


# --------------------------------------------------------------------------
# Asset processors
# --------------------------------------------------------------------------

def process_texture(name, spec, report):
    px = load_rgba(os.path.join(RAW, spec["src"]))
    if spec.get("key"):
        px = chroma_key(px)
    if "crop" in spec:  # fractional crop box [l, t, r, b]
        h, w, _ = px.shape
        l, t, r, b = spec["crop"]
        px = px[int(t * h):int(b * h), int(l * w):int(r * w)]
    if spec.get("cropAlpha"):  # tight crop to the opaque bounding box
        mask = px[..., 3] > 127
        ys = np.flatnonzero(mask.any(1))
        xs = np.flatnonzero(mask.any(0))
        px = px[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
    tw, th = spec["size"]
    if th is None:
        th = int(round(px.shape[0] * tw / px.shape[1]))
    px = resize_premultiplied(px, (tw, th))
    if spec.get("key"):
        px = harden_alpha(px)
    px = quantize(px, spec.get("colors", 48))
    seam = spec.get("seamless")
    if seam == "blend":
        px = wrap_blend(px)
    elif seam == "mirror":
        px = mirror_h(px)
    out = spec.get("out", name + ".png")
    to_image(px).save(os.path.join(OUT, out))
    report[name] = {"type": "texture", "file": out,
                    "w": px.shape[1], "h": px.shape[0]}
    print(f"  {name}: {px.shape[1]}x{px.shape[0]} -> assets/{out}")


def process_strip(name, spec, report):
    """Terrain cross-section with a green sky above the surface line."""
    px = chroma_key(load_rgba(os.path.join(RAW, spec["src"])))
    tw = spec["size"][0]
    scale = tw / px.shape[1]
    th = int(round(px.shape[0] * scale))
    px = harden_alpha(resize_premultiplied(px, (tw, th)))
    # Surface = first row where most pixels are opaque.
    opaque_frac = (px[..., 3] > 127).mean(1)
    surface_rows = np.flatnonzero(opaque_frac > 0.9)
    surface = int(surface_rows[0]) if len(surface_rows) else 0
    overhang = spec.get("overhang", 8)
    top = max(0, surface - overhang)
    px = px[top:]
    # Guarantee the overhang band exists even if the surface was at y=0.
    if surface - overhang < 0:
        pad = np.zeros((overhang - surface, px.shape[1], 4), np.float32)
        px = np.concatenate([pad, px], axis=0)
    tile = spec.get("tile", 32)
    depth_px = spec.get("depth_tiles", 3) * tile
    body = px[overhang:overhang + depth_px * 2]
    if spec.get("bodyScale"):  # compress the cross-section so deeper strata show sooner
        bs = spec["bodyScale"]
        body = resize_premultiplied(body, (body.shape[1], max(tile, int(body.shape[0] * bs))))
        body = harden_alpha(body)
    body = body[:depth_px]
    if body.shape[0] < depth_px:  # repeat the last tile row to fill depth
        reps = int(np.ceil(depth_px / max(1, body.shape[0])))
        body = np.concatenate([body] * reps, axis=0)[:depth_px]
    px = np.concatenate([px[:overhang], body], axis=0)
    # Fill any stray transparency inside the body with the darkest soil tone.
    px = quantize(px, spec.get("colors", 40))
    px = wrap_blend(px, 0.05) if spec.get("seamless", "blend") == "blend" else px
    px = harden_alpha(px)
    out = spec.get("out", name + ".png")
    to_image(px).save(os.path.join(OUT, out))
    report[name] = {"type": "strip", "file": out, "w": px.shape[1],
                    "h": px.shape[0], "overhang": overhang, "tile": tile}
    print(f"  {name}: {px.shape[1]}x{px.shape[0]} surface@{surface} "
          f"-> assets/{out}")


def process_sheet(name, spec, report, preview):
    px = chroma_key(load_rgba(os.path.join(RAW, spec["src"])))
    rows_spec = spec["rows"]  # list of lists of frame names
    expected = [len(r) for r in rows_spec]
    rows = segment_sheet(px[..., 3], expected)
    # Flatten with names; tolerate count mismatches by zipping what we have.
    boxes = []
    for r_i, row in enumerate(rows):
        names = rows_spec[r_i] if r_i < len(rows_spec) else []
        for c_i, box in enumerate(row):
            fname = names[c_i] if c_i < len(names) else f"extra_{r_i}_{c_i}"
            boxes.append((fname, box))
    if not boxes:
        print(f"  ! {name}: no frames found")
        return
    # Shared scale: reference frame height -> target height.
    ref = spec.get("ref", boxes[0][0])
    ref_box = dict(boxes).get(ref, boxes[0][1])
    ref_h = ref_box[3] - ref_box[1]
    scale = spec["height"] / float(ref_h)
    body_w = None
    frames = []
    anchors = {}
    overrides = spec.get("anchors", {})
    fits = spec.get("fit", {})
    for fname, (x0, y0, x1, y1) in boxes:
        crop = px[y0:y1, x0:x1]
        if fname in fits:  # exact size override (e.g. a 32x32 block)
            w, h = fits[fname]
        else:
            w = max(1, int(round((x1 - x0) * scale)))
            h = max(1, int(round((y1 - y0) * scale)))
        f = harden_alpha(resize_premultiplied(crop, (w, h)))
        frames.append((fname, f))
        if fname == ref:
            body_w = w
    if body_w is None:
        body_w = frames[0][1].shape[1]
    colors = spec.get("colors", 32)
    # Quantize all frames together for a consistent palette.
    heights = [f.shape[0] for _, f in frames]
    widths = [f.shape[1] for _, f in frames]
    strip = np.zeros((max(heights), sum(widths), 4), np.float32)
    x = 0
    for _, f in frames:
        strip[: f.shape[0], x:x + f.shape[1]] = f
        x += f.shape[1]
    strip = quantize(strip, colors)
    x = 0
    q_frames = []
    for fname, f in frames:
        q_frames.append((fname, strip[: f.shape[0], x:x + f.shape[1]].copy()))
        x += f.shape[1]
    frames = q_frames
    for fname, f in frames:
        h, w, _ = f.shape
        side = overrides.get(fname, "center")
        if side == "left":      # body on the left (e.g. whip extends right)
            ax = min(w, body_w) / 2.0
        elif side == "right":   # body on the right (e.g. whip trails left)
            ax = w - min(w, body_w) / 2.0
        else:
            ax = w / 2.0
        anchors[fname] = (round(ax, 1), h)
    atlas, rects = pack_frames(frames)
    out = spec.get("out", name + ".png")
    to_image(atlas).save(os.path.join(OUT, out))
    report[name] = {
        "type": "sheet", "file": out, "w": atlas.shape[1], "h": atlas.shape[0],
        "frames": {
            fname: {"x": rx, "y": ry, "w": rw, "h": rh,
                    "ax": anchors[fname][0], "ay": anchors[fname][1]}
            for fname, (rx, ry, rw, rh) in rects.items()
        },
    }
    print(f"  {name}: {len(frames)} frames, scale {scale:.3f}, "
          f"atlas {atlas.shape[1]}x{atlas.shape[0]} -> assets/{out}")
    if preview:
        write_preview(name, frames)


def write_preview(name, frames, cell=160):
    os.makedirs(WORK, exist_ok=True)
    cols = min(8, len(frames))
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (40, 40, 60, 255))
    for i, (fname, f) in enumerate(frames):
        img = to_image(f)
        s = min((cell - 8) / img.width, (cell - 8) / img.height, 4)
        img = img.resize((max(1, int(img.width * s)),
                          max(1, int(img.height * s))),
                         Image.Resampling.NEAREST)
        cx = (i % cols) * cell + (cell - img.width) // 2
        cy = (i // cols) * cell + (cell - img.height) // 2
        sheet.alpha_composite(img, (cx, cy))
    sheet.save(os.path.join(WORK, f"preview_{name}.png"))


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append", default=[])
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()
    with open(os.path.join(ROOT, "tools", "asset_manifest.json")) as fh:
        manifest = json.load(fh)
    os.makedirs(OUT, exist_ok=True)
    atlas_path = os.path.join(OUT, "atlas.json")
    report = {}
    if os.path.exists(atlas_path):
        with open(atlas_path) as fh:
            report = json.load(fh)
    for name, spec in manifest["assets"].items():
        if args.only and name not in args.only:
            continue
        src = os.path.join(RAW, spec["src"])
        if not os.path.exists(src):
            print(f"  - {name}: missing {spec['src']} (skipped)")
            continue
        kind = spec["type"]
        try:
            if kind == "texture":
                process_texture(name, spec, report)
            elif kind == "strip":
                process_strip(name, spec, report)
            elif kind == "sheet":
                process_sheet(name, spec, report, args.preview)
        except Exception as exc:  # keep going; report at the end
            print(f"  ! {name}: {exc}")
            raise
    with open(atlas_path, "w") as fh:
        json.dump(report, fh, indent=1, sort_keys=True)
    print(f"wrote {atlas_path}")


if __name__ == "__main__":
    sys.exit(main())
