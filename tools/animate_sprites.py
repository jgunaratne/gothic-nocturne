#!/usr/bin/env python3
"""Animates an existing sprite with the Gemini Omni video model and turns the
clip into a palette-locked pixel-art sprite sheet for process_assets.py.

The reference cell (e.g. the hero's idle pose) is cut from its raw sheet, put
on flat #00FF00 and handed to `generate video -model=omni_1p5 -media-uri=...`
(image-to-video) with a locked-camera prompt for one action. The frames come
back through the same chroma-key / box-downscale steps as the hand-made art,
with the scale calibrated against the atlas, the colours matched and locked to
the reference sheet's palette, detached specks removed and every frame anchored
at the feet. Everything is cached on disk, so a run can be resumed or re-picked
without regenerating the clip.

  .venv/bin/python tools/animate_sprites.py hero_walk8 --sheet hero --frame idle \
      --action walk --select period --count 8 --names walk
  .venv/bin/python tools/animate_sprites.py hero_whip --sheet hero --frame idle \
      --action whip --stop-after contact            # look at art/work/clips/hero_whip/contact.png
  .venv/bin/python tools/animate_sprites.py hero_whip --sheet hero --frame idle \
      --action whip --pick 40,60,72,84,92,104,120,140 --names whip
  .venv/bin/python tools/animate_sprites.py hero_jump --sheet hero --frame idle \
      --action jump --select jump

Outputs (declared as `"type": "clip"` in tools/asset_manifest.json):
  art/raw/clips/<name>.mp4             the Omni clip (provenance)
  art/raw/clips/<name>_sheet.png       packed native-resolution frames (transparent)
  art/raw/clips/<name>_frames.json     frame rects + anchors + how they were made
  art/work/clips/<name>/               extracted frames, contact sheet, preview GIF
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import process_assets as pa  # noqa: E402  (chroma_key, resize, segment, pack)

ROOT = pa.ROOT
RAW = pa.RAW
CLIPS = os.path.join(RAW, "clips")
WORK = os.path.join(pa.WORK, "clips")
GENERATE = os.environ.get("GENERATE_CLI", "/google/bin/releases/gemini-agents-generate/generate")

FIRST_W, FIRST_H = 1280, 720
GROUND_Y = FIRST_H - 80          # feet baseline in the composed first frame

STYLE = ("Pixel art sprite animation test footage, 32-bit era console style, crisp "
         "hard-edged pixels, limited palette, flat shading. The character stays EXACTLY "
         "the same design, proportions, colours and pixel scale as the first frame.")
CAMERA = ("Locked static camera, strict orthographic side view, no zoom, no pan, no camera "
          "motion. The background stays a perfectly flat solid pure bright green (#00FF00) "
          "with no shadow, no floor, no gradient, no particles, no impact flashes, no sparks, "
          "no motion lines, nothing else in frame. No text.")

ACTIONS = {
    "walk": ("The {subject} performs a smooth, looping treadmill WALK CYCLE in place facing "
             "right: deliberate heavy strides, knees lifting, arms swinging naturally opposite "
             "to the legs, hair and loose cloth swaying with each step, slight torso bob. "
             "The character stays centred and does not travel across the screen."),
    "idle": ("The {subject} stands in place facing right in a relaxed ready stance and "
             "breathes slowly and visibly: chest rising and falling, shoulders lifting "
             "slightly, weight shifting a little from foot to foot, loose hair and cloth "
             "stirring. Two slow breaths over the clip. The character never steps, turns "
             "or attacks."),
    "whip": ("The {subject} performs ONE full WHIP ATTACK facing right, then returns to the "
             "idle pose: anticipation as the whip arm draws back over the shoulder and the "
             "body leans back, a fast lunge forward as the leather whip uncoils and cracks "
             "fully extended horizontally to the right, follow-through as the whip tip "
             "flicks and the lash falls slack, then a recoil back to the starting stance. "
             "Weight shifts between the feet, hair whips with the motion."),
    "cwhip": ("The {subject} stays crouched low facing right and performs ONE low WHIP "
              "ATTACK: the whip arm draws back, the leather whip lashes forward fully "
              "extended horizontally close to the ground toward the right, the tip flicks, "
              "the lash falls slack, then the character settles back into the crouched "
              "ready pose. The character never stands up."),
    "jump": ("The {subject} performs ONE vertical JUMP in place facing right: a deep knee "
             "bend in anticipation, a push off the toes rising straight up with the knees "
             "tucking, a brief hang at the apex, a fall with the legs extending down, a "
             "landing with a deep knee bend absorbing the impact, then straightening back "
             "into the idle stance and holding still."),
    "hurt": ("The {subject} is struck hard from the right while facing right: a sharp "
             "flinch with the head snapping back and the arms flung up, two staggering "
             "steps backwards to the left, then a collapse to the knees and a fall onto "
             "the back, lying still for the rest of the clip."),
}


def log(msg):
    print(msg, flush=True)


# --------------------------------------------------------------------------
# 1. First frame
# --------------------------------------------------------------------------

def reference_cell(sheet, frame, manifest, pad=12):
    """Crops the raw (still green) cell of `frame` from `sheet`'s source image."""
    spec = manifest["assets"][sheet]
    raw = Image.open(os.path.join(RAW, spec["src"])).convert("RGB")
    px = pa.chroma_key(np.asarray(raw.convert("RGBA")).astype(np.float32))
    rows = pa.segment_sheet(px[..., 3], [len(r) for r in spec["rows"]])
    for r_i, row in enumerate(rows):
        names = spec["rows"][r_i] if r_i < len(spec["rows"]) else []
        for c_i, (x0, y0, x1, y1) in enumerate(row):
            if c_i < len(names) and names[c_i] == frame:
                return raw.crop((max(0, x0 - pad), max(0, y0 - pad),
                                 min(raw.width, x1 + pad), min(raw.height, y1 + pad)))
    raise SystemExit(f"frame {frame!r} not found in sheet {sheet!r}")


def compose_first_frame(cell, out_path, hero_px):
    canvas = Image.new("RGB", (FIRST_W, FIRST_H), (0, 255, 0))
    scale = hero_px / cell.height
    hero = cell.resize((max(1, int(cell.width * scale)), hero_px), Image.Resampling.LANCZOS)
    canvas.paste(hero, ((FIRST_W - hero.width) // 2, GROUND_Y - hero.height))
    canvas.save(out_path)
    return out_path


# --------------------------------------------------------------------------
# 2. Clip
# --------------------------------------------------------------------------

def generate_clip(first_frame, prompt, out_mp4, model, attempts=3):
    if os.path.exists(out_mp4) and os.path.getsize(out_mp4) > 0:
        log(f"= clip exists: {os.path.relpath(out_mp4, ROOT)}")
        return out_mp4
    for attempt in range(1, attempts + 1):
        cmd = [GENERATE, "-prod", "-timeout=300s", f"-output={out_mp4}", "video",
               f"-model={model}", f"-media-uri={first_frame}", prompt]
        log(f"> omni {model} (attempt {attempt}) ...")
        t0 = time.time()
        res = subprocess.run(cmd, capture_output=True, text=True)
        tail = (res.stdout + res.stderr).strip().splitlines()[-1:] or [""]
        log(f"  {tail[0][:160]}  ({time.time() - t0:.0f}s)")
        if os.path.exists(out_mp4) and os.path.getsize(out_mp4) > 0:
            return out_mp4
        time.sleep(15)
    raise SystemExit("video generation failed")


def extract_frames(mp4, frames_dir):
    if os.path.isdir(frames_dir) and len(os.listdir(frames_dir)) > 0:
        return sorted(os.path.join(frames_dir, f) for f in os.listdir(frames_dir) if f.endswith(".png"))
    os.makedirs(frames_dir, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4,
                    os.path.join(frames_dir, "f%03d.png")], check=True)
    return sorted(os.path.join(frames_dir, f) for f in os.listdir(frames_dir) if f.endswith(".png"))


# --------------------------------------------------------------------------
# 3. Analysis
# --------------------------------------------------------------------------

class Frame:
    __slots__ = ("path", "alpha", "box", "sig")

    def __init__(self, path, alpha, box, sig):
        self.path, self.alpha, self.box, self.sig = path, alpha, box, sig


def analyse(paths):
    """Keys every frame: silhouette mask, bounding box and a 64x36 signature."""
    frames = []
    for p in paths:
        px = pa.chroma_key(pa.load_rgba(p))
        a = px[..., 3] > 128
        ys, xs = np.where(a)
        box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1) if len(xs) else (0, 0, 1, 1)
        sig = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((64, 36), Image.Resampling.BOX),
                         dtype=np.float32).ravel() / 255.0
        frames.append(Frame(p, None, box, sig))
    return frames


def contact_sheet(frames, out_path, cols=8, rows=4, thumb=(240, 135)):
    n = cols * rows
    idx = [int(round(i * (len(frames) - 1) / (n - 1))) for i in range(n)]
    sheet = Image.new("RGB", (cols * thumb[0], rows * thumb[1]), (0, 0, 0))
    d = ImageDraw.Draw(sheet)
    for k, i in enumerate(idx):
        im = Image.open(frames[i].path).convert("RGB").resize(thumb, Image.Resampling.LANCZOS)
        x, y = (k % cols) * thumb[0], (k // cols) * thumb[1]
        sheet.paste(im, (x, y))
        d.rectangle([x, y, x + 34, y + 13], fill=(0, 0, 0))
        d.text((x + 3, y + 1), f"{i}", fill=(255, 255, 255))
    sheet.save(out_path)


def select_period(frames, count, start, min_lag=8, max_lag=72):
    X = np.array([f.sig for f in frames[start:]])
    X -= X.mean(0)
    best = (None, -1.0)
    for lag in range(min_lag, min(max_lag, len(X) - 2)):
        a, b = X[:-lag], X[lag:]
        den = np.sqrt((a * a).sum() * (b * b).sum()) or 1.0
        c = float((a * b).sum() / den)
        if c > best[1]:
            best = (lag, c)
    period, corr = best
    log(f"  period {period} frames ({period / 24:.2f}s), correlation {corr:.2f}"
        + ("  ! weak loop, consider --pick" if corr < 0.3 else ""))
    return [start + int(round(i * period / count)) for i in range(count)], {"period": period, "corr": corr}


def motion_energy(frames):
    e = np.zeros(len(frames))
    for i in range(1, len(frames)):
        e[i] = np.abs(frames[i].sig - frames[i - 1].sig).sum()
    k = np.ones(3) / 3.0
    return np.convolve(e, k, mode="same")


def select_motion(frames, count, start, end):
    """One-shot actions: frames spaced by equal cumulative silhouette motion
    inside the active window (so fast phases get more frames than holds)."""
    e = motion_energy(frames)
    lo, hi = start, (end if end is not None else len(frames) - 1)
    act = np.flatnonzero(e[lo:hi + 1] > 0.15 * e[lo:hi + 1].max()) + lo
    a0, a1 = int(act[0]), int(act[-1])
    c = np.cumsum(e[a0:a1 + 1])
    targets = np.linspace(0, c[-1], count)
    picks = [a0 + int(np.searchsorted(c, t)) for t in targets]
    picks = sorted(set(min(p, a1) for p in picks))
    while len(picks) < count:  # pad with evenly spaced frames if duplicates collapsed
        extra = a0 + int(round(len(picks) * (a1 - a0) / count))
        picks = sorted(set(picks + [extra]))
    log(f"  active window {a0}..{a1}, picks {picks}")
    return picks[:count], {"window": [a0, a1]}


def select_jump(frames, ground):
    """Vertical jump in place -> crouch, rise0, rise1, apex, fall0, fall1, land0, land1."""
    feet = np.array([f.box[3] for f in frames], dtype=float)
    head = np.array([f.box[1] for f in frames], dtype=float)
    airborne = np.flatnonzero(feet < ground - 6)
    if len(airborne) == 0:
        raise SystemExit("no airborne frames found; use --pick")
    takeoff = int(airborne[0])
    apex = int(np.argmin(feet))
    after = np.flatnonzero(feet[apex:] >= ground - 2)
    landing = apex + int(after[0]) if len(after) else len(frames) - 1
    crouch = int(np.argmax(head[max(0, takeoff - 30):takeoff])) + max(0, takeoff - 30)
    land0 = landing + int(np.argmax(head[landing:landing + 10]))
    idle_h = ground - head[0]
    rec = np.flatnonzero((ground - head[land0:]) >= idle_h * 0.97)
    recover = land0 + int(rec[0]) if len(rec) else min(len(frames) - 1, land0 + 12)
    land1 = land0 + max(1, (recover - land0) // 2)
    lerp = lambda a, b, t: int(round(a + (b - a) * t))
    picks = [crouch, lerp(takeoff, apex, 0.25), lerp(takeoff, apex, 0.6), apex,
             lerp(apex, landing, 0.45), lerp(apex, landing, 0.85), land0, land1]
    log(f"  takeoff {takeoff} apex {apex} landing {landing} -> picks {picks}")
    return picks, {"takeoff": takeoff, "apex": apex, "landing": landing}


# --------------------------------------------------------------------------
# 4. Pixelize
# --------------------------------------------------------------------------

def components(mask):
    """8-connected component labels for a small boolean mask (no scipy)."""
    h, w = mask.shape
    labels = np.zeros((h, w), np.int32)
    n = 0
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or labels[y, x]:
                continue
            n += 1
            stack = [(y, x)]
            labels[y, x] = n
            while stack:
                cy, cx = stack.pop()
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                            labels[ny, nx] = n
                            stack.append((ny, nx))
    return labels, n


def remove_specks(px, reach=2):
    """Keeps the main silhouette plus anything chained to it within `reach` px
    (a whip lash broken into dashes survives, floating flashes do not)."""
    mask = px[..., 3] > 0
    labels, n = components(mask)
    if n <= 1:
        return px
    sizes = np.bincount(labels.ravel())[1:]
    keep = {int(np.argmax(sizes)) + 1}
    changed = True
    while changed:
        changed = False
        kept = np.isin(labels, list(keep))
        # dilate the kept mask by `reach`
        dil = kept.copy()
        for _ in range(reach):
            d = dil.copy()
            d[1:] |= dil[:-1]; d[:-1] |= dil[1:]; d[:, 1:] |= dil[:, :-1]; d[:, :-1] |= dil[:, 1:]
            dil = d
        for lab in range(1, n + 1):
            if lab not in keep and (dil & (labels == lab)).any():
                keep.add(lab); changed = True
    out = px.copy()
    out[~np.isin(labels, list(keep))] = 0
    return out


def sheet_palette(sheet_png):
    px = np.asarray(Image.open(sheet_png).convert("RGBA")).astype(np.float32)
    return np.unique(px[px[..., 3] > 0][:, :3], axis=0)


def lock_palette(px, pal):
    out = px.copy()
    m = px[..., 3] > 0
    rgb = px[..., :3][m]
    if len(rgb) == 0:
        return out
    idx = np.empty(len(rgb), np.int32)
    for i in range(0, len(rgb), 65536):
        d = ((rgb[i:i + 65536, None, :] - pal[None, :, :]) ** 2).sum(-1)
        idx[i:i + 65536] = d.argmin(1)
    out[..., :3][m] = pal[idx]
    return out


def crop_frame(frame, scale, ground, min_col_frac=0.35):
    """Keys, crops and downscales one frame. Returns the pixels plus the feet row
    (`ay`, the ground line when a lash hangs lower) and the body centre (`ax`)
    inside the crop, and the crop's left edge in scaled clip coordinates.

    The body centre is the middle of the *dense* columns (opaque run of at least
    `min_col_frac` of the body height): an extended whip, flying hair or a lash
    lying on the ground are thin and do not pull the anchor around."""
    px = pa.chroma_key(pa.load_rgba(frame.path))
    x0, y0, x1, y1 = frame.box
    crop = px[y0:y1, x0:x1]
    w = max(1, int(round((x1 - x0) * scale)))
    h = max(1, int(round((y1 - y0) * scale)))
    small = pa.harden_alpha(pa.resize_premultiplied(crop, (w, h)))
    small = remove_specks(small)
    feet_row = min(h, int(round((min(y1, ground) - y0) * scale)))
    # Trim to what is left after the speck removal (a dropped prop shrinks the frame).
    a = small[..., 3] > 0
    ys, xs = np.flatnonzero(a.any(1)), np.flatnonzero(a.any(0))
    if len(xs) == 0:
        return {"index": None, "px": small, "ax": w / 2.0, "ay": float(feet_row), "left": x0 * scale}
    tx0, tx1, ty0, ty1 = int(xs[0]), int(xs[-1]) + 1, int(ys[0]), int(ys[-1]) + 1
    small = small[ty0:ty1, tx0:tx1]
    a = a[ty0:ty1, tx0:tx1]
    feet_row = min(small.shape[0], feet_row - ty0)
    body_h = max(1, feet_row)
    cols = a[:feet_row].sum(0)
    dense = np.flatnonzero(cols >= max(2, min_col_frac * body_h))
    if len(dense) == 0:
        dense = np.flatnonzero(cols > 0)
    body_x = (dense.min() + dense.max() + 1) / 2.0
    return {"index": None, "px": small, "ax": body_x, "ay": float(feet_row), "left": (x0 + tx0 / scale) * scale}


def pixelize(frames, picks, scale, ground, anchor_mode, ref_px, pal):
    """Downscales the picked frames with one shared scale, anchors them at the
    feet / hips, colour-matches them to the reference frame and locks the palette."""
    out = []
    for i in picks:
        it = crop_frame(frames[i], scale, ground)
        it["index"] = i
        out.append(it)
    if anchor_mode in ("mean", "first"):
        # One body position for every frame (relative to its own crop) so a loop
        # does not wobble; "first" pins it to the reference pose instead.
        if anchor_mode == "mean":
            target = float(np.mean([o["left"] + o["ax"] for o in out]))
        else:
            f0 = crop_frame(frames[0], scale, ground)
            target = f0["left"] + f0["ax"]
        for o in out:
            o["ax"] = target - o["left"]
    # Colour match: one global gain so the clip's slightly muddier video tones land
    # on the reference frame's exposure, then snap to the sheet palette.
    ref_rgb = ref_px[..., :3][ref_px[..., 3] > 0]
    clip_rgb = np.concatenate([o["px"][..., :3][o["px"][..., 3] > 0] for o in out])
    gain = np.clip(ref_rgb.mean(0) / np.maximum(clip_rgb.mean(0), 1.0), 0.8, 1.3)
    log(f"  colour gain {np.round(gain, 3).tolist()}")
    for o in out:
        p = o["px"].copy()
        p[..., :3] = np.clip(p[..., :3] * gain, 0, 255)
        o["px"] = lock_palette(p, pal) if pal is not None else p
    return out


# --------------------------------------------------------------------------
# 5. Sheet + previews
# --------------------------------------------------------------------------

def write_sheet(name, items, names, meta):
    os.makedirs(CLIPS, exist_ok=True)
    frames = [(n, it["px"]) for n, it in zip(names, items)]
    atlas, rects = pa.pack_frames(frames)
    sheet_path = os.path.join(CLIPS, f"{name}_sheet.png")
    pa.to_image(atlas).save(sheet_path)
    records = {}
    for (n, it), (rx, ry, rw, rh) in zip(zip(names, items), [rects[n] for n in names]):
        records[n] = {"x": rx, "y": ry, "w": rw, "h": rh,
                      "ax": round(float(it["ax"]), 1), "ay": round(float(it["ay"]), 1),
                      "clipFrame": it["index"]}
    meta = dict(meta, frames=records, sheet=os.path.basename(sheet_path))
    with open(os.path.join(CLIPS, f"{name}_frames.json"), "w") as fh:
        json.dump(meta, fh, indent=1, sort_keys=True)
    log(f"  wrote {os.path.relpath(sheet_path, ROOT)} ({atlas.shape[1]}x{atlas.shape[0]}, {len(frames)} frames)")
    return sheet_path


def write_previews(name, items, names, work, fps):
    scale = 3
    W = max(it["px"].shape[1] for it in items) + 6
    H = max(int(it["ay"]) for it in items) + max(0, max(it["px"].shape[0] - int(it["ay"]) for it in items)) + 6
    base_y = max(int(it["ay"]) for it in items) + 3
    gif = []
    strip = Image.new("RGBA", (W * scale * len(items), H * scale), (40, 40, 60, 255))
    for k, (n, it) in enumerate(zip(names, items)):
        im = pa.to_image(it["px"]).resize((it["px"].shape[1] * scale, it["px"].shape[0] * scale), Image.Resampling.NEAREST)
        cell = Image.new("RGBA", (W * scale, H * scale), (40, 40, 60, 255))
        x = int(round((W / 2.0 - it["ax"]) * scale))
        y = int(round((base_y - it["ay"]) * scale))
        cell.alpha_composite(im, (x, y))
        d = ImageDraw.Draw(cell)
        d.line([(0, base_y * scale), (W * scale, base_y * scale)], fill=(90, 90, 120, 255))
        d.line([(W / 2.0 * scale, 0), (W / 2.0 * scale, H * scale)], fill=(70, 70, 100, 255))
        d.text((3, 3), n, fill=(230, 225, 200, 255))
        strip.paste(cell, (k * W * scale, 0))
        gif.append(cell.convert("P", palette=Image.Palette.ADAPTIVE))
    strip.save(os.path.join(work, "frames.png"))
    gif[0].save(os.path.join(work, "preview.gif"), save_all=True, append_images=gif[1:],
                duration=int(1000 / fps), loop=0, disposal=2)


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("name", help="clip asset name, e.g. hero_whip")
    ap.add_argument("--sheet", required=True, help="manifest sheet the character comes from (scale, palette)")
    ap.add_argument("--frame", default=None, help="reference frame in that sheet (default: the sheet's ref)")
    ap.add_argument("--first-frame", default=None, help="use this PNG as the I2V first frame instead")
    ap.add_argument("--hero-px", type=int, default=560, help="character height in the composed first frame")
    ap.add_argument("--action", choices=sorted(ACTIONS), default=None, help="prompt template")
    ap.add_argument("--prompt", default=None, help="full custom action prompt (replaces --action)")
    ap.add_argument("--extra", default="", help="appended to the action prompt")
    ap.add_argument("--subject", default="character", help="noun used in the prompt, e.g. 'vampire hunter'")
    ap.add_argument("--model", default="omni_1p5")
    ap.add_argument("--force", action="store_true", help="regenerate the clip even if it exists")
    ap.add_argument("--select", choices=["period", "motion", "jump", "pick"], default=None)
    ap.add_argument("--pick", default=None, help="explicit frame indices, e.g. 40,60,72")
    ap.add_argument("--count", type=int, default=8)
    ap.add_argument("--start", type=int, default=36, help="first frame considered (skip the ramp-in)")
    ap.add_argument("--end", type=int, default=None)
    ap.add_argument("--min-lag", type=int, default=8, help="period search range in frames (--select period)")
    ap.add_argument("--max-lag", type=int, default=72)
    ap.add_argument("--names", default=None, help="'walk' -> walk0..N, or an explicit comma list")
    ap.add_argument("--anchor", choices=["hips", "mean", "first"], default=None,
                    help="x anchor: per-frame hips (one-shots), their mean (loops) or the first frame")
    ap.add_argument("--no-lock", action="store_true", help="skip the palette lock (median-cut to --colors instead)")
    ap.add_argument("--colors", type=int, default=32)
    ap.add_argument("--fps", type=float, default=8, help="preview GIF rate")
    ap.add_argument("--stop-after", choices=["clip", "contact"], default=None)
    args = ap.parse_args()

    with open(os.path.join(ROOT, "tools", "asset_manifest.json")) as fh:
        manifest = json.load(fh)
    with open(os.path.join(pa.OUT, "atlas.json")) as fh:
        atlas = json.load(fh)
    spec = manifest["assets"][args.sheet]
    ref_name = args.frame or spec.get("ref") or spec["rows"][0][0]
    ref_rec = atlas[args.sheet]["frames"][ref_name]
    work = os.path.join(WORK, args.name)
    os.makedirs(work, exist_ok=True)
    os.makedirs(CLIPS, exist_ok=True)

    # 1. first frame
    first = args.first_frame or os.path.join(work, "first_frame.png")
    if not args.first_frame and not os.path.exists(first):
        compose_first_frame(reference_cell(args.sheet, ref_name, manifest), first, args.hero_px)
        log(f"  first frame -> {os.path.relpath(first, ROOT)}")

    # 2. clip
    mp4 = os.path.join(CLIPS, f"{args.name}.mp4")
    if args.force and os.path.exists(mp4):
        os.remove(mp4)
        shutil.rmtree(os.path.join(work, "frames"), ignore_errors=True)
    action = args.prompt or (ACTIONS[args.action].format(subject=args.subject) if args.action else None)
    if not os.path.exists(mp4):
        if not action:
            raise SystemExit("need --action or --prompt to generate the clip")
        prompt = f"{STYLE} {CAMERA} {action} {args.extra}".strip()
        generate_clip(first, prompt, mp4, args.model)
    else:
        prompt = None
    if args.stop_after == "clip":
        return

    # 3. frames + analysis
    paths = extract_frames(mp4, os.path.join(work, "frames"))
    frames = analyse(paths)
    contact_sheet(frames, os.path.join(work, "contact.png"))
    log(f"  {len(frames)} frames, contact sheet -> {os.path.relpath(os.path.join(work, 'contact.png'), ROOT)}")
    if args.stop_after == "contact":
        return

    # scale: atlas reference height / silhouette height in the clip's first frame
    fb = frames[0].box
    ground = fb[3]
    scale = ref_rec["h"] / float(fb[3] - fb[1])
    log(f"  scale {scale:.4f} (atlas {ref_name} h={ref_rec['h']} / clip {fb[3] - fb[1]}px), ground y={ground}")

    # 4. select
    select = args.select or ("pick" if args.pick else "motion")
    info = {}
    if select == "pick":
        if not args.pick:
            raise SystemExit("--select pick needs --pick")
        picks = [int(v) for v in args.pick.split(",")]
    elif select == "period":
        picks, info = select_period(frames, args.count, args.start, args.min_lag, args.max_lag)
    elif select == "jump":
        picks, info = select_jump(frames, ground)
    else:
        picks, info = select_motion(frames, args.count, args.start, args.end)
    picks = [max(0, min(len(frames) - 1, p)) for p in picks]

    if args.names and "," in args.names:
        names = [n.strip() for n in args.names.split(",")]
    elif select == "jump" and not args.names:
        names = ["crouch", "rise0", "rise1", "apex", "fall0", "fall1", "land0", "land1"]
    else:
        # prefix: --names walk, or derived from the asset name (hero_walk8 -> walk)
        prefix = args.names or re.sub(r"\d+$", "", args.name.split("_", 1)[-1])
        names = [f"{prefix}{i}" for i in range(len(picks))]
    if len(names) != len(picks):
        raise SystemExit(f"{len(names)} names for {len(picks)} frames")

    # 5. pixelize
    anchor = args.anchor or ("mean" if select == "period" else "hips")
    ref_img = np.asarray(Image.open(os.path.join(pa.OUT, atlas[args.sheet]["file"])).convert("RGBA")).astype(np.float32)
    ref_px = ref_img[ref_rec["y"]:ref_rec["y"] + ref_rec["h"], ref_rec["x"]:ref_rec["x"] + ref_rec["w"]]
    pal = None if args.no_lock else sheet_palette(os.path.join(pa.OUT, atlas[args.sheet]["file"]))
    items = pixelize(frames, picks, scale, ground, anchor, ref_px, pal)
    if pal is None:
        strip = np.zeros((max(i["px"].shape[0] for i in items), sum(i["px"].shape[1] for i in items), 4), np.float32)
        x = 0
        for it in items:
            strip[:it["px"].shape[0], x:x + it["px"].shape[1]] = it["px"]; x += it["px"].shape[1]
        strip = pa.quantize(strip, args.colors)
        x = 0
        for it in items:
            it["px"] = strip[:it["px"].shape[0], x:x + it["px"].shape[1]].copy(); x += it["px"].shape[1]

    meta = {"source": {"sheet": args.sheet, "frame": ref_name, "clip": os.path.basename(mp4),
                       "model": args.model, "action": args.action, "prompt": prompt or "(cached clip)",
                       "select": select, "picks": picks, "scale": round(scale, 4), "anchor": anchor,
                       "paletteLocked": pal is not None, **info}}
    write_sheet(args.name, items, names, meta)
    write_previews(args.name, items, names, work, args.fps)
    log(f"  preview -> {os.path.relpath(os.path.join(work, 'preview.gif'), ROOT)}")
    log(f"  manifest: \"{args.name}\": {{\"type\": \"clip\", \"src\": \"clips/{args.name}_sheet.png\", "
        f"\"frames\": \"clips/{args.name}_frames.json\"}}")


if __name__ == "__main__":
    main()
