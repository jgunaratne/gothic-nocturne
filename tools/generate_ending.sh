#!/usr/bin/env bash
# Generates the ending sequence art (three illustrated panels) and the Daikon
# narrator epilogue voice-over.
set -u
G=/google/bin/releases/gemini-agents-generate/generate
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STYLE='32-bit era (mid-1990s console) 2D pixel art illustration, widescreen 16:9 full-frame cinematic cutscene panel for a gothic horror side-scrolling action platformer. Crisp hard-edged pixel clusters, rich limited palette, flat shading with 2-3 tones per material, no anti-aliasing blur, no painterly or photoreal rendering. No text, no letters, no labels, no watermark, no borders.'
gen() {
  local name="$1"; shift
  if [ -s "/tmp/gen_${name}.png" ]; then echo "= ${name} exists"; return; fi
  for attempt in 1 2 3; do
    "$G" -prod -timeout=180s -output="/tmp/gen_${name}.png" image -model=gempix-2-flash-lite-png "$STYLE $*" 2>&1 | grep -E "Successfully|rror|denied|capacity" | tail -1
    [ -s "/tmp/gen_${name}.png" ] && break
    sleep 15
  done
}
gen ending1 "Palette: deep indigo night sky turning violet at the horizon, bone-ivory moon, crimson and amber fire, charcoal stone. The vampire count's gothic castle on a cliff at the moment of its destruction: the great keep splitting apart, towers toppling, the belfry collapsing, shards of masonry and bats pouring into the sky, cracks of crimson light bursting from the windows, a lone whip-wielding hunter silhouetted small on the drawbridge in the foreground looking back. Dramatic low angle, wide shot." &
gen ending2 "Palette: pre-dawn deep blue, pale rose and warm amber sunrise on the horizon, grey-violet mist, dark silhouettes. The same hunter with long dark hair, red headband, leather vest and coiled whip, walking away from the viewer along a misty graveyard road between leaning tombstones and bare trees toward a glowing sunrise, a small mossy turtle companion trotting beside him, the ruined castle smouldering far behind on the right. Wide, quiet, cinematic." &
gen ending3 "Palette: golden sunrise, warm amber and peach sky, pale blue distance, dark green hills. Dawn breaking over a peaceful valley seen from a hilltop: the ruins of the castle now just a dark broken crown on the far cliff, mist lifting from the fields, a flock of white birds rising, a wooden signpost and the hunter's coiled whip hanging on it in the foreground, sunbeams streaming. Hopeful and triumphant, wide shot." &
gen ending4 "Palette: deep indigo and charcoal stone, shattered crimson stained glass, radiant golden dawn rays and turquoise-gold soul motes. Inside the vampire count's shattered gothic throne hall at the moment the blood curse breaks: the obsidian throne split in two, a giant rose window fracturing as golden morning light pours in, glowing golden relic souls rising toward the vaulted ceiling, and in the foreground the hunter with long dark hair, red headband, and leather vest coiling his consecrated whip beside his small mossy turtle companion. Dramatic wide shot." &
gen ending5 "Palette: twilight indigo sky melting into warm rose-gold and amber sunrise, emerald moss, glowing campfire embers. A peaceful hilltop sanctuary overlooking a misty valley at first light: the same hunter with long dark hair, red headband, and leather vest resting beside a warm crackling campfire and a carved gothic waystone lantern, his small mossy turtle companion beside the fire, golden soul wisps rising into the dawn sky while the ruined castle smoulders on a far cliff in the distance. Wide cinematic shot." &
wait
cp /tmp/gen_ending1.png "${ROOT}/art/raw/ending_1.png"
cp /tmp/gen_ending2.png "${ROOT}/art/raw/ending_2.png"
cp /tmp/gen_ending3.png "${ROOT}/art/raw/ending_3.png"
cp /tmp/gen_ending4.png "${ROOT}/art/raw/ending_4.png"
cp /tmp/gen_ending5.png "${ROOT}/art/raw/ending_5.png"

# Gemini Omni (omni_1p5) image-to-video animation for Scene III (The Sanctuary Vigil):
if [ ! -s "${ROOT}/art/raw/clips/ending_omni.mp4" ]; then
  "$G" -prod -timeout=300s \
    -output="${ROOT}/art/raw/clips/ending_omni.mp4" \
    video -model=omni_1p5 \
    -media-uri="${ROOT}/art/raw/ending_5.png" \
    "2D 32-bit pixel art cutscene animation, locked static camera, crisp pixel clusters, no camera pan or zoom: the campfire flames flicker and dance warmly sending glowing orange embers and soft smoke curling up into the dawn sky, the stone lantern glows gently, the hunter breathes and subtly nods while resting on the rock, the small mossy turtle companion bobbing its head happily by the warm fire, and distant smoke drifts from the ruined castle on the far cliff."
fi
echo "ENDING_GEN_DONE"
