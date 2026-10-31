#!/usr/bin/env bash
# Generates (a) crisper Clock Tower shaft wall textures and (b) the Library
# stage assets: towering bookshelf wall, library props, phantom ghost & biting
# tome enemies, the Spectral Archivist boss, plus the Lyria track & Daikon line.
set -u
G=/google/bin/releases/gemini-agents-generate/generate
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STYLE='32-bit era (mid-1990s console) 2D pixel art for a gothic horror side-scrolling action platformer. Crisp hard-edged pixel clusters, limited palette, flat shading with 2-3 tones per material, no anti-aliasing blur, no painterly or photoreal rendering, no 3D-render look. Cold moonlight rim light from the upper-left, warm amber candle glow. Strict side view, orthographic. No text, no letters, no numbers, no labels, no watermark, no signature, no frame borders.'
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

# ---- Clock tower: bold, readable interior wall textures ---------------------
gen clockwall2 "Palette: dark iron and gunmetal, polished brass and dull gold, dark oak, warm amber lamplight, deep indigo shadows. SEAMLESS TILING TEXTURE of the interior wall of a gothic clock tower: large clearly readable elements with strong contrast: two big interlocking brass cogwheels with sharp teeth, heavy riveted iron girders forming an X-brace, a vertical brass pipe, a round brass pressure gauge, and dark oak planking behind it all. Few elements, each large and crisp (nothing smaller than a brick), so the wall reads clearly from a distance. The texture must tile seamlessly both horizontally and vertically (the left edge continues the right edge, the top edge continues the bottom edge). Flat frontal view, evenly lit, no text." &
gen clockwall2b "Palette: dark iron and gunmetal, polished brass, dark oak, warm amber, deep indigo shadows. SEAMLESS TILING TEXTURE of a gothic clock tower interior wall: tall dark oak panelling with brass trim, a large brass pendulum disc hanging on a rod in the centre, a row of hanging brass bells across the top, chains and a counterweight on one side, and a heavy iron crossbeam. Few elements, each large and crisp so the wall reads clearly from a distance. The texture must tile seamlessly both horizontally and vertically. Flat frontal view, evenly lit, no text." &
# ---- Library: wall --------------------------------------------------------
gen librarywall "Palette: dark walnut shelving, leather-bound books in oxblood crimson, bottle green, navy and umber with gold spines, bone ivory scroll cases, dusty violet shadows, warm amber candle glow, deep indigo shadows. SEAMLESS TILING TEXTURE of a towering gothic castle library wall: floor-to-ceiling dark walnut bookshelves packed with leather-bound tomes of varying heights, a few shelves with rolled scrolls and skulls used as bookends, a gothic pointed-arch carved frame between shelf bays, cobwebs in the upper corners, a brass rail with a rolling ladder. The texture must tile seamlessly both horizontally and vertically (the left edge continues the right edge, the top edge continues the bottom edge). Flat frontal view, evenly lit, no text." &
wait

# ---- Library: props, enemies, boss -------------------------------------------
gen libraryprops "Palette: dark walnut wood, oxblood and bottle-green leather, gold leaf, bone ivory, brass, warm amber candle flame, deep indigo shadows. A ROW of 5 separate props for a haunted gothic castle library, in one horizontal row with wide even green gaps, strict side view, same scale, all standing on the same invisible baseline: (1) a tall free-standing walnut bookcase crammed with leather tomes, one shelf half-empty with books tumbling out, (2) a carved reading lectern with an open grimoire and a dripping candle, (3) a brass celestial globe on a wooden stand, (4) a tall wooden rolling ladder leaning at an angle, (5) a teetering stack of six huge dusty tomes with a skull on top. Each prop between one and three human heights tall. $KEY" &
gen ghost "Palette: translucent pale ice-blue and ghostly white, deep violet shadows inside the robes, glowing cyan eye sockets, faint lavender wisps. SPRITE SHEET of ONE phantom librarian ghost enemy facing RIGHT in every frame: a hooded spectral figure with no legs, its robe trailing off into wisps, long thin clawed hands and two glowing cyan eyes in a dark hood, carrying a small ghostly lantern. Layout: a single horizontal row of 3 cells with wide even green gaps, all at the same scale and centered in their cells: (1) drifting calmly with hands lowered, (2) drifting with hands raised and wisps flaring, (3) lunging forward with its hood thrown back revealing a screaming skull face and both claws outstretched to the right. $KEY" &
gen tome "Palette: oxblood crimson leather cover with gold corner fittings and a gold clasp, bone-ivory pages, a jagged mouth of ivory fangs on the page edges, one glowing amber eye on the cover, deep indigo shadows. SPRITE SHEET of ONE cursed flying book enemy facing RIGHT in every frame: a thick leather grimoire that flies by flapping its covers like wings, the open page-edges forming a toothy biting maw. Layout: a single horizontal row of 4 cells with wide even green gaps, all at the same scale and centered in their cells: (1) covers spread wide open like wings (flap up), (2) covers half closed (flap down), (3) book snapped shut with the fangs clenched together, (4) book gaping wide open in a chomp with fangs bared and loose pages flying. $KEY" &
wait

gen archivist "Palette: translucent pale ice-blue and ghostly white robes, deep violet and indigo shadows, glowing cyan eyes, gold spectacles, oxblood and gold floating tomes, warm amber candle flame. SPRITE SHEET of ONE towering ghostly librarian BOSS, the Spectral Archivist, facing RIGHT in every frame: a tall gaunt phantom scholar in flowing tattered robes with no legs (trailing into wisps), a long beard, round gold spectacles over glowing cyan eyes, one hand holding a huge chained grimoire and the other raised, with three smaller spectral books orbiting around the head. Layout: a single horizontal row of 4 cells with wide even green gaps, all at the same scale and centered in their cells: (1) floating calmly with the grimoire closed, (2) grimoire flung open with pages streaming out to the right, (3) both arms raised high with the orbiting books flaring outward, (4) hunched forward with a screaming skull face and the grimoire held like a shield. Large and highly detailed. $KEY" &
if [ ! -s "${ROOT}/assets/music/library.mp3" ]; then
  ( "$G" -prod -timeout=90s -output="/tmp/song_library.mp3" music "16-bit gothic action platformer stage music for a haunted castle library of ghosts and flying books, eerie whispering choir pads, harpsichord, pizzicato strings, music-box bells, pipe organ, driving tempo, loopable instrumental, no vocals" 2>&1 | tail -1
    [ -s /tmp/song_library.mp3 ] && cp /tmp/song_library.mp3 "${ROOT}/assets/music/library.mp3" && chmod 644 "${ROOT}/assets/music/library.mp3" ) &
fi
wait

cp /tmp/gen_clockwall2.png "${ROOT}/art/raw/tex_clock_wall.png"
cp /tmp/gen_clockwall2b.png "${ROOT}/art/raw/tex_clock_wall_b.png"
cp /tmp/gen_librarywall.png "${ROOT}/art/raw/tex_library_wall.png"
cp /tmp/gen_libraryprops.png "${ROOT}/art/raw/library_props_sheet.png"
cp /tmp/gen_ghost.png "${ROOT}/art/raw/ghost_sheet.png"
cp /tmp/gen_tome.png "${ROOT}/art/raw/tome_sheet.png"
cp /tmp/gen_archivist.png "${ROOT}/art/raw/archivist_sheet.png"
echo "LIBRARY_GEN_DONE"
