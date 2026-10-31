#!/usr/bin/env bash
# Regenerates (a) a proper 8-frame hero walk cycle and (b) dedicated native-size
# boss sprite sheets for the bosses that were previously upscaled from small
# enemy sheets (Great Bat, Bone Captain, Gorgon Queen, Great Jack).
set -u
G=/google/bin/releases/gemini-agents-generate/generate
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STYLE='32-bit era (mid-1990s console) 2D pixel art for a gothic horror side-scrolling action platformer. Crisp hard-edged pixel clusters, limited palette, flat shading with 2-3 tones per material, no anti-aliasing blur, no painterly or photoreal rendering, no 3D-render look. Cold moonlight rim light from the upper-left. Strict side view, orthographic. No text, no labels, no watermark, no signature, no frame borders.'
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

gen herowalk "Palette: pale skin, shoulder-length dark brown hair with a red headband, studded brown leather vest over bare muscular arms, dark blue-grey trousers, tall brown boots, a coiled brown leather whip in the right hand, deep indigo shadows. SPRITE SHEET of ONE vampire-hunter hero WALKING, facing RIGHT in every frame. Layout: exactly ONE horizontal row of 8 cells with wide even green gaps (no second row, no other poses), all at identical scale with the feet on one shared baseline, forming a smooth looping walk cycle: (1) right foot forward contact, (2) recoil with weight down, (3) passing with legs together, (4) left knee lifting high, (5) left foot forward contact, (6) recoil with weight down, (7) passing with legs together, (8) right knee lifting high. The head stays at the same height in every frame, the arms swing opposite the legs, the whip stays coiled at the hip. $KEY" &
gen giantbat "Palette: violet-grey fur, dark indigo wing membranes with bone-ivory claws, glowing crimson eyes, pale fangs, deep indigo shadows. SPRITE SHEET of ONE enormous vampire bat BOSS facing RIGHT in every frame: a huge muscular bat with a wide wingspan, a snarling fanged face, large pointed ears, glowing crimson eyes and clawed feet. Layout: a 2 by 2 grid of cells with wide even green gaps, all at the same scale and centered in their cells: top-left wings raised high above the body, top-right wings spread flat and level, bottom-left wings swept down low, bottom-right wings folded forward in a dive with fangs bared and claws reaching. Large and highly detailed. $KEY" &
gen bonecaptain "Palette: bone ivory with blood-red stained armour plates, rusted iron, tattered crimson cloak, glowing red eye sockets, deep indigo shadows. SPRITE SHEET of ONE towering skeleton knight BOSS, the Bone Captain, facing RIGHT in every frame: a tall armoured skeleton with a horned iron helm, red-stained pauldrons and breastplate, a tattered crimson cloak, a round rusted shield on the back and glowing red eyes. Layout: two horizontal rows with wide even green gaps, all at the same scale with feet on a shared baseline per row. Top row, 4 walk frames: marching stride 1, legs passing, stride 2, legs passing. Bottom row, 2 frames: winding up a bone to throw with the arm pulled back, then the arm fully extended forward after the throw. $KEY" &
wait
gen gorgon "Palette: pale sickly green-grey skin, dark emerald serpent hair with amber eyes, gold jewelry and a gold crown, bone ivory, glowing amber eyes, deep indigo shadows. SPRITE SHEET of ONE floating gorgon queen BOSS facing RIGHT in every frame: a regal severed-torso gorgon with a writhing crown of serpents for hair, a golden crown and necklace, long clawed hands and glowing amber eyes, her lower body trailing off into wisps. Layout: a single horizontal row of 3 cells with wide even green gaps, all at the same scale and centered in their cells: (1) serpents coiled calmly with hands lowered, (2) serpents flaring outward with hands raised, (3) mouth open and eyes blazing in a petrifying stare with the serpents striking forward. Large and highly detailed. $KEY" &
gen greatjack "Palette: bright orange pumpkin skin with darker orange ribs, brown stem, glowing amber-yellow carved face, amber and white flames, dark indigo shadows. SPRITE SHEET of ONE colossal flaming jack-o-lantern BOSS facing RIGHT in every frame: a huge carved pumpkin head with a wicked jagged grin and triangular eyes glowing from within, a thick gnarled stem, and a crown of roaring amber flames. Layout: a single horizontal row of 3 cells with wide even green gaps, all at the same scale and centered in their cells: (1) flames rising straight up, (2) flames bent to the left as if rushing forward, (3) mouth gaping wide open spitting a burst of fire to the right. Large and highly detailed. $KEY" &
wait

cp /tmp/gen_herowalk.png "${ROOT}/art/raw/hero_walk_sheet.png"
cp /tmp/gen_giantbat.png "${ROOT}/art/raw/giantbat_sheet.png"
cp /tmp/gen_bonecaptain.png "${ROOT}/art/raw/bonecaptain_sheet.png"
cp /tmp/gen_gorgon.png "${ROOT}/art/raw/gorgon_sheet.png"
cp /tmp/gen_greatjack.png "${ROOT}/art/raw/greatjack_sheet.png"
echo "BOSS_GEN_DONE"
