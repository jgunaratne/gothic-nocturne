#!/usr/bin/env bash
# Generates the Arcade (Gallery of Automata) assets: a gilded gallery wall
# texture, a row of castle-appropriate ancient amusement machines, the Brass
# Automaton boss sheet, the Lyria stage track and the Daikon boss voice line.
set -u
G=/google/bin/releases/gemini-agents-generate/generate
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STYLE='32-bit era (mid-1990s console) 2D pixel art for a gothic horror side-scrolling action platformer. Crisp hard-edged pixel clusters, limited palette, flat shading with 2-3 tones per material, no anti-aliasing blur, no painterly or photoreal rendering, no 3D-render look. Cold moonlight rim light from the upper-left, warm amber candle and brass glow. Strict side view, orthographic. No text, no letters, no numbers, no labels, no watermark, no signature, no frame borders.'
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

gen arcadeprops "Palette: polished brass and dull gold, dark walnut wood, crimson velvet, bone ivory, glowing amber lantern light, cold violet glass, deep indigo shadows. A ROW of 5 separate antique mechanical amusement machines that would stand in a medieval gothic castle gallery, in one horizontal row with wide even green gaps, strict side view, same scale, all standing on the same invisible baseline: (1) a tall ornate walnut-and-brass fortune-telling automaton cabinet with a glass case containing a hooded mechanical sage figure lit by an amber lamp, (2) a brass zoetrope drum on an iron pedestal with vertical viewing slits glowing amber from a candle inside, (3) an upright clockwork oracle engine cabinet with a large round glowing violet glass dial, brass levers and a hand crank on the side, (4) a mechanical chess-playing automaton: a wooden desk with a brass chessboard and a seated robed clockwork figure with one arm raised, (5) a brass magic-lantern projector with a glowing lens mounted on a wooden tripod. Each machine is between one and two human heights tall. $KEY" &
gen automaton "Palette: tarnished brass and dull gold plating, dark iron joints, crimson velvet drapery, glowing amber furnace eyes, copper pipes, deep indigo shadows. SPRITE SHEET of ONE hulking brass clockwork automaton boss facing RIGHT in every frame: a heavy humanoid machine of riveted brass plates with a barrel-shaped boiler chest with a glowing amber furnace grate, a small domed head with two glowing amber eye lenses, massive piston-driven arms ending in huge iron fists, exposed spinning gears at the shoulders and a key wound in its back, standing on thick iron legs. Layout: a single horizontal row of 4 cells with wide even green gaps, all at the same scale with feet on a shared baseline: (1) standing idle with fists lowered, (2) stepping forward mid-stride, (3) one giant fist thrust straight forward to the right in a piston punch with steam jets from the elbow, (4) both arms raised high with the chest furnace blazing open and gears flying out. $KEY" &
gen arcadewall "Palette: dark walnut panelling, polished brass trim and dull gold inlay, crimson velvet panels, bone ivory, deep indigo shadows. SEAMLESS TILING TEXTURE of a gothic castle gallery interior wall: dark carved walnut wainscot panels framed with brass trim, alternating with crimson velvet wall panels, a brass rail running horizontally, small brass cog ornaments inset at the panel corners. The texture must tile seamlessly both horizontally and vertically (the left edge continues the right edge, the top edge continues the bottom edge). Flat frontal view, evenly lit, no objects in front of the wall, no windows, no text." &
wait

if [ ! -s "${ROOT}/assets/music/arcade.mp3" ]; then
  "$G" -prod -timeout=90s -output="/tmp/song_arcade.mp3" music "16-bit gothic action platformer stage music for a haunted castle gallery of clockwork automatons and antique amusement machines, eerie music-box melody, harpsichord, pipe-organ stabs, ticking clockwork percussion, driving tempo, loopable instrumental, no vocals" 2>&1 | tail -1
  [ -s /tmp/song_arcade.mp3 ] && cp /tmp/song_arcade.mp3 "${ROOT}/assets/music/arcade.mp3" && chmod 644 "${ROOT}/assets/music/arcade.mp3"
fi

for k in arcadeprops automaton arcadewall; do
  case $k in
    arcadeprops) dst=arcade_props_sheet.png;;
    automaton) dst=automaton_sheet.png;;
    arcadewall) dst=tex_arcade_wall.png;;
  esac
  [ -s "/tmp/gen_${k}.png" ] && cp "/tmp/gen_${k}.png" "${ROOT}/art/raw/${dst}"
done
ls -la /tmp/gen_arcadeprops.png /tmp/gen_automaton.png /tmp/gen_arcadewall.png "${ROOT}/assets/music/arcade.mp3"
echo "ARCADE_GEN_DONE"
