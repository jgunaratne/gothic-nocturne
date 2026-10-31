#!/usr/bin/env bash
# Generates the Cathedral stage assets: a soaring stained-glass clerestory wall,
# three great rose/lancet windows, nave props, a stone gargoyle enemy, the
# Gargoyle Archon boss, plus the Lyria track.
set -u
G=/google/bin/releases/gemini-agents-generate/generate
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STYLE='32-bit era (mid-1990s console) 2D pixel art for a gothic horror side-scrolling action platformer. Crisp hard-edged pixel clusters, limited palette, flat shading with 2-3 tones per material, no anti-aliasing blur, no painterly or photoreal rendering, no 3D-render look. Cold moonlight from the upper-left, coloured light from stained glass. Strict side view, orthographic. No text, no letters, no labels, no watermark, no signature, no frame borders.'
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
gen cathedralwall "Palette: pale grey-blue ashlar limestone, dark slate mortar, deep indigo shadows, jewel-toned stained glass in crimson, sapphire, violet and gold. SEAMLESS TILING TEXTURE of a towering gothic cathedral nave wall: tall clustered stone piers rising between bays, each bay holding a tall narrow pointed lancet window of glowing jewel-coloured stained glass with stone tracery, a carved stone string-course band, blind trefoil arcading beneath the windows, and a vaulted rib springing at the top. The texture must tile seamlessly both horizontally and vertically (the left edge continues the right edge, the top edge continues the bottom edge). Flat frontal view, evenly lit, no text." &
gen stainedglass "Palette: luminous jewel-toned stained glass in crimson, sapphire blue, emerald, violet and gold, dark lead lines, pale grey stone tracery. A ROW of 3 separate huge gothic cathedral stained-glass windows, in one horizontal row with wide even green gaps, strict frontal view, all the same height and standing on the same baseline: (1) a giant circular rose window with twelve radiating petals and a blazing golden centre, (2) a tall pointed lancet window depicting a robed figure with a whip standing over a fallen winged demon, in crimson and gold glass, (3) a tall pointed lancet window depicting a crescent moon over a castle on a cliff with a flight of bats, in sapphire and violet glass. Each window glows from within. $KEY" &
gen cathedralprops "Palette: pale grey limestone, dark walnut wood, gold leaf, bone ivory, crimson velvet, warm candle amber, deep indigo shadows. A ROW of 5 separate props for a gothic cathedral nave, in one horizontal row with wide even green gaps, strict side view, same scale, all standing on the same invisible baseline: (1) a tall carved stone angel statue with folded wings on a plinth, head bowed, (2) a wooden church pew, (3) a tall wrought-iron candle stand holding seven lit candles, (4) a stone baptismal font with still water, (5) a tall carved wooden pulpit with a spiral stair and a crimson cloth. $KEY" &
wait
gen gargoyle "Palette: weathered grey stone with dark moss stains, glowing crimson eyes, deep indigo shadows. SPRITE SHEET of ONE stone gargoyle enemy facing RIGHT in every frame: a crouching horned winged demon carved from grey stone, with a snarling fanged muzzle, bat-like stone wings and clawed hands and feet. Layout: a single horizontal row of 4 cells with wide even green gaps, all at the same scale: (1) perched crouched on all fours with wings folded, eyes dark, (2) crouched with wings half spread and eyes glowing crimson as it wakes, (3) in flight with wings raised high, claws reaching forward, (4) in flight with wings swept down. $KEY" &
gen archon "Palette: dark basalt stone with gold-leaf trim, glowing crimson eyes and crimson veins of light in the cracks, bone-ivory horns, deep indigo shadows. SPRITE SHEET of ONE colossal gargoyle BOSS, the Gargoyle Archon, facing RIGHT in every frame: a huge horned winged demon statue of dark basalt come to life, with a crown of gold leaf, vast bat wings, a long tail, massive clawed hands and glowing crimson cracks across its body. Layout: a single horizontal row of 4 cells with wide even green gaps, all at the same scale and centered in their cells: (1) standing upright with wings folded like a cloak, (2) wings spread wide and both claws raised in a roar, (3) hunched forward in a diving pounce with claws thrust toward the right, (4) wings wrapped around its body as an impenetrable stone shell with only the crimson eyes glowing. Large and highly detailed. $KEY" &
if [ ! -s "${ROOT}/assets/music/cathedral.mp3" ]; then
  ( "$G" -prod -timeout=600s -output=/tmp/song_cathedral.mp3 music -model=lyria-3-full-song-mp3 "Stage theme for a vast gothic cathedral nave lit by stained glass, where stone gargoyles wake: a towering pipe-organ toccata in D minor at 136 BPM, full organ counterpoint, Latin-style choir swells (wordless), tolling bells, timpani, driving strings and crisp drums, majestic, holy and menacing. Full-length instrumental video game music (about two and a half minutes, with an intro, main theme, a contrasting bridge and a return to the main theme that can loop) for a gothic horror side-scrolling action platformer, 32-bit console era style with clean bright slightly compressed sound. No vocals, no lyrics, instrumental only." 2>&1 | grep -E "Successfully|rror" | tail -1
    [ -s /tmp/song_cathedral.mp3 ] && cp /tmp/song_cathedral.mp3 "${ROOT}/assets/music/cathedral.mp3" && chmod 644 "${ROOT}/assets/music/cathedral.mp3" ) &
fi
wait
cp /tmp/gen_cathedralwall.png "${ROOT}/art/raw/tex_cathedral_wall.png"
cp /tmp/gen_stainedglass.png "${ROOT}/art/raw/stained_glass_sheet.png"
cp /tmp/gen_cathedralprops.png "${ROOT}/art/raw/cathedral_props_sheet.png"
cp /tmp/gen_gargoyle.png "${ROOT}/art/raw/gargoyle_sheet.png"
cp /tmp/gen_archon.png "${ROOT}/art/raw/archon_sheet.png"
echo "CATHEDRAL_GEN_DONE"
