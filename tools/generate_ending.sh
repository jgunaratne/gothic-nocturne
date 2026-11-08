#!/usr/bin/env bash
# Generates the 5-act late-1990s / early-2000s CD-ROM style Full-Motion Video (FMV)
# ending sequence (`assets/video/ending_fmv.mp4`) using Omni Live (`generate world`),
# strictly 1 session at a time, and stitches them to match `narrator_ending.mp3`.
set -euo pipefail

G=/google/bin/releases/gemini-agents-generate/generate
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "${ROOT}/assets/video"

FMV_STYLE="Late-1990s early-2000s PlayStation 1 and Dreamcast CD-ROM dark-fantasy video game pre-rendered 3D CGI Full-Motion Video (FMV) cutscene aesthetic, Softimage/3ds Max era gothic 3D architecture, dramatic colored theatrical rim lighting, rich volumetric fog and god-rays, slightly moody gothic dark-fantasy palette, cinematic widescreen camera, zero HUD, zero UI, zero text, zero watermarks."

gen_fmv_act() {
  local out="$1"
  local dur="$2"
  local key_arg="$3"
  local evt_arg="$4"
  local prompt="$5"

  if [ -s "$out" ]; then
    local existing_dur
    existing_dur="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out" 2>/dev/null || echo 0)"
    if awk "BEGIN { exit !($existing_dur >= 2.5) }"; then
      echo "= $(basename "$out") already valid (${existing_dur}s)"
      return 0
    fi
    rm -f "$out"
  fi

  for model in omni-live-nonprod omni-live-nonprod genie-4-fast; do
    echo "-> Generating $(basename "$out") (${dur}) with model=${model} ..."
    local cmd=("$G" -timeout=300s -output="$out" world -model="$model" -duration="$dur")
    if [ -n "$key_arg" ]; then
      cmd+=(-key="$key_arg")
    fi
    if [ -n "$evt_arg" ]; then
      cmd+=(-event="$evt_arg")
    fi
    cmd+=("${FMV_STYLE} ${prompt}")

    if "${cmd[@]}"; then
      if [ -s "$out" ]; then
        local got_dur
        got_dur="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out" 2>/dev/null || echo 0)"
        if awk "BEGIN { exit !($got_dur >= 2.5) }"; then
          echo "✓ Generated $(basename "$out") (${got_dur}s)"
          return 0
        fi
      fi
    fi
    rm -f "$out"
    sleep 10
  done

  echo "ERROR: Failed to generate $out" >&2
  return 1
}

# Strictly sequential (concurrency = 1) per Omni Live TPU slice policy:

# Act I (0.0 - 14.1s): The Shattering of Castle Nocturne
gen_fmv_act "/tmp/fmv_act1.mp4" "15s" \
  "0.4s:S:13s" \
  "3.5s:Crimson lightning strikes the belfry as massive gothic stone towers crack apart, giant bronze bells tumble in flames, and swarms of bats burst into the stormy night sky" \
  "Wide low-angle 3D CGI cutscene view from an ancient stone drawbridge looking up at Dracula's colossal gothic cathedral castle perched atop a jagged moonlit cliff at midnight, glowing crimson stained-glass windows, swirling purple storm clouds, gargoyles, and burning fissures tearing through the keep as the camera dollies backward."

# Act II (14.1 - 24.2s): The Shattered Sovereign Throne & Breaking of the Blood Curse
gen_fmv_act "/tmp/fmv_act2.mp4" "11s" \
  "0.4s:W:9s" \
  "2.5s:The giant crimson stained-glass rose window shatters outward as brilliant golden morning sunbeams and luminous turquoise-gold soul wisps flood the ruined hall" \
  "Inside Dracula's cavernous 3D gothic throne room: cracked marble pillars, tattered crimson velvet banners, and a massive obsidian vampire throne split in two on a raised dais beneath a towering gothic rose window, dark cursed mist draining away as radiant dawn light pours in."

# Act III (24.2 - 27.6s): The Sanctuary Watchfire Vigil
gen_fmv_act "/tmp/fmv_act3.mp4" "5s" \
  "0.3s:D+ArrowLeft:3.8s" \
  "" \
  "Twilight hilltop sanctuary overlooking a misty Transylvanian valley at first light: a crackling orange campfire beside a carved gothic stone lantern, glowing embers drifting upward, a lone vampire hunter with long dark hair, red headband, and dark leather coat standing up from the fire with a coiled leather whip at his belt, looking toward the dawn horizon while the ruined castle smoulders on a distant cliff."

# Act IV (27.6 - 32.3s): The Graveyard Road at First Light
gen_fmv_act "/tmp/fmv_act4.mp4" "6s" \
  "0.3s:W:5s" \
  "2.0s:Silver morning mist parts and lifts off the mossy cobblestones revealing warm rose-gold sunrise glow ahead" \
  "Atmospheric 3D tracking camera gliding steadily forward along a winding cobblestone graveyard road flanked by ancient leaning iron-fenced tombstones, weathered stone angels, and tall dark cypress trees shrouded in silver pre-dawn fog."

# Act V (32.3 - 42.3s): Sunrise Over the Freed Valley
gen_fmv_act "/tmp/fmv_act5.mp4" "11s" \
  "0.4s:W+ArrowUp:8.5s" \
  "2.5s:Blazing golden sunbeams crest the mountain ridge as a flock of white birds soars across the emerald valley" \
  "Triumphant 3D crane shot rising past a weathered wooden hilltop signpost with a coiled vampire-killer leather whip hanging on it in the foreground, sweeping out over a vast peaceful green Transylvanian valley bathed in warm golden-amber sunrise, mist lifting from winding rivers, with the dark broken ruins of the castle tiny on a far cliff."

detect_crop() {
  local f="$1"
  local c
  c="$(ffmpeg -ss 1 -t 3 -i "$f" -vf cropdetect=24:2:0 -f null - 2>&1 | awk -F'crop=' '/crop=/{print $2}' | tail -n 1)"
  if [ -n "$c" ]; then
    echo "crop=${c},"
  else
    echo ""
  fi
}

C1="$(detect_crop /tmp/fmv_act1.mp4)"
C2="$(detect_crop /tmp/fmv_act2.mp4)"
C3="$(detect_crop /tmp/fmv_act3.mp4)"
C4="$(detect_crop /tmp/fmv_act4.mp4)"
C5="$(detect_crop /tmp/fmv_act5.mp4)"

echo "-> Stitching 5 Omni Live FMV acts into assets/video/ending_fmv.mp4 ..."
ffmpeg -y \
  -i /tmp/fmv_act1.mp4 \
  -i /tmp/fmv_act2.mp4 \
  -i /tmp/fmv_act3.mp4 \
  -i /tmp/fmv_act4.mp4 \
  -i /tmp/fmv_act5.mp4 \
  -filter_complex "\
    [0:v]trim=0:14.1,setpts=PTS-STARTPTS,fps=24,${C1}scale=640:360:force_original_aspect_ratio=increase,crop=640:360,setsar=1[v0]; \
    [1:v]trim=0:10.1,setpts=PTS-STARTPTS,fps=24,${C2}scale=640:360:force_original_aspect_ratio=increase,crop=640:360,setsar=1[v1]; \
    [2:v]trim=0:3.4,setpts=PTS-STARTPTS,fps=24,${C3}scale=640:360:force_original_aspect_ratio=increase,crop=640:360,setsar=1[v2]; \
    [3:v]trim=0:4.7,setpts=PTS-STARTPTS,fps=24,${C4}scale=640:360:force_original_aspect_ratio=increase,crop=640:360,setsar=1[v3]; \
    [4:v]trim=0:10.0,setpts=PTS-STARTPTS,fps=24,${C5}scale=640:360:force_original_aspect_ratio=increase,crop=640:360,setsar=1[v4]; \
    [v0][v1][v2][v3][v4]concat=n=5:v=1:a=0,format=yuv420p[vout]" \
  -map "[vout]" \
  -an \
  -c:v libx264 -preset slow -crf 20 -g 24 -keyint_min 12 \
  -movflags +faststart \
  "${ROOT}/assets/video/ending_fmv.mp4"

ls -lh "${ROOT}/assets/video/ending_fmv.mp4"
echo "ENDING_FMV_GEN_DONE"
