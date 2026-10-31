#!/usr/bin/env python3
"""Imports the newest generated render for each asset name into art/raw/ as PNG.

Usage: .venv/bin/python tools/import_raw.py <generation_dir> [name ...]
"""
import glob
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "art", "raw")

NAMES = [
    "hero_sheet", "tex_wall_brick", "bg_forest", "tex_ground_strip",
    "tex_castle_floor_strip", "tex_platform", "props_sheet", "arch_sheet",
    "bg_sky", "bg_mountains", "bg_castle", "bg_fg", "skeleton_sheet",
    "bat_sheet", "zombie_sheet", "medusa_sheet", "boss_sheet", "items_sheet",
    "boss_vampire_sheet", "tex_catacomb_wall", "tex_catacomb_floor_strip",
    "tex_clock_wall", "tex_clock_floor_strip",
]


def main():
    src_dir = sys.argv[1]
    names = sys.argv[2:] or NAMES
    os.makedirs(RAW, exist_ok=True)
    for name in names:
        cands = sorted(glob.glob(os.path.join(src_dir, f"{name}_*.jpg")) +
                       glob.glob(os.path.join(src_dir, f"{name}_*.png")),
                       key=os.path.getmtime)
        if not cands:
            print(f"  - {name}: not generated yet")
            continue
        src = cands[-1]
        dst = os.path.join(RAW, f"{name}.png")
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            print(f"  = {name}: up to date")
            continue
        img = Image.open(src).convert("RGB")
        img.save(dst)
        print(f"  + {name}: {img.size[0]}x{img.size[1]} <- {os.path.basename(src)}")


if __name__ == "__main__":
    main()
