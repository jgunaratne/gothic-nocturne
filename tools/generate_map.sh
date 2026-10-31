#!/usr/bin/env bash
# Generates the castle-map screen art: a gothic parchment backdrop and a row of
# ten region emblems (one per stage) via the Gemini image CLI.
set -u
G=/google/bin/releases/gemini-agents-generate/generate
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STYLE='32-bit era (mid-1990s console) 2D pixel art for a gothic horror side-scrolling action platformer. Crisp hard-edged pixel clusters, limited palette, flat shading with 2-3 tones per material, no anti-aliasing blur, no painterly or photoreal rendering. No text, no letters, no numbers, no labels, no watermark, no signature.'
KEY='The background must be one flat solid pure bright green (#00FF00) with no gradient, no ground shadows, and nothing touching the image edges. Nothing green anywhere on the subjects.'

gen() {
  local name="$1"; shift
  if [ -s "/tmp/gen_${name}.png" ]; then echo "= ${name} exists"; return; fi
  for attempt in 1 2 3; do
    "$G" -prod -timeout=180s -output="/tmp/gen_${name}.png" image -model=gempix-2-flash-lite-png "$STYLE $*" 2>&1 | grep -E "Successfully|rror|denied|capacity" | tail -1
    [ -s "/tmp/gen_${name}.png" ] && break
    sleep 15
  done
}

gen mapparchment "Palette: aged dark parchment in deep umber and charcoal with faded ink lines in dull steel blue, bone ivory, tarnished brass ornament, deep indigo vignette. A 16:9 FULL-FRAME BACKDROP for a castle map screen: an ancient weathered parchment chart seen flat, with a faint ink drawing of a gothic castle on a cliff in the upper middle (towers, a belfry on the right, crypts sketched beneath the ground line), bare dead trees and gravestones sketched in the lower left, snowy peaks sketched in the upper left, a small compass rose in the lower right corner, ink hatching and foxing stains, torn and burnt edges, and an ornate thin brass-and-iron gothic border running around all four edges with small bat and skull corner ornaments. Keep the overall image dark and low-contrast so bright user interface boxes can be drawn on top of it; the center of the image must be mostly empty parchment with only very faint ink grid lines. No text, no letters, no labels, no frame mockup, no glowing bright highlights." &
gen mapicons "Palette: bone ivory, steel blue, moss green, pumpkin orange, ice blue, tarnished brass, crimson, deep indigo shadows. A ROW of 10 separate small emblem icons for a castle map, in one horizontal row with wide even green gaps, all the same size and centered on the same baseline, each a clear simple silhouette readable at tiny size: (1) a gothic tombstone with a cross under a crescent moon, (2) a mossy turtle shell with a glowing teal rune, (3) a carved grinning jack-o-lantern, (4) a snow-capped fir tree with a tiny glowing cottage window, (5) a crenellated stone battlement tower with a red banner, (6) a skull resting on a pile of bones, (7) a hollow-eyed skull wreathed in teal spectral flame, (8) an ornate brass automaton cabinet with a glowing amber dial, (9) a round brass clock face with gears, (10) a crimson royal throne with a gold crown above it. $KEY" &
wait
cp /tmp/gen_mapparchment.png "${ROOT}/art/raw/bg_map_parchment.png"
cp /tmp/gen_mapicons.png "${ROOT}/art/raw/map_icons_sheet.png"
echo "MAP_GEN_DONE"
