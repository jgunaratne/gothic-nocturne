#!/usr/bin/env bash
# Generates the sample-based sound-effect set with the ElevenLabs Sound
# Effects API and writes compact MP3s to assets/sfx/<name>.mp3. The in-game
# AudioSys plays these when present and falls back to its Web Audio synth
# otherwise, so the game works with or without them.
#
# Usage:  ELEVENLABS_API_KEY=... bash tools/generate_sfx.sh
set -euo pipefail
: "${ELEVENLABS_API_KEY:?Set ELEVENLABS_API_KEY (ElevenLabs account -> Profile -> API keys)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/assets/sfx"
mkdir -p "${OUT}"

# name | duration seconds | prompt  (keep each short, punchy, dry, game-ready)
SFX=(
  "whip|0.6|short sharp leather bullwhip crack, dry, close, punchy, no reverb tail"
  "jump|0.4|quick soft cloth and leather hop effort, short, 16-bit game jump feel but realistic foley"
  "land|0.35|heavy boots landing on stone, short thud, dry"
  "hit|0.4|whip strike impact on a creature, wet thwack with a tiny bone crack"
  "hurt|0.6|male hero pained grunt, short, breathy"
  "die|1.4|male hero dying cry falling, dramatic, short, trailing off"
  "candle|0.5|iron candelabra shattering, small metallic clang with scattering wax"
  "heart|0.5|bright magical sparkle pickup chime, short"
  "pickup|0.6|rising three-note magical treasure pickup chime, retro game style"
  "throw|0.5|quick whoosh of a thrown dagger, short air cut"
  "enemy_die|0.8|creature dissolving into dust with crumbling bones, short"
  "bone|0.4|dry bone clatter, two bones knocking, short"
  "block|0.7|stone block cracking and crumbling apart, dry debris"
  "boss_hit|0.6|heavy impact on armoured monster, deep thud with metallic ring"
  "boss_roar|1.6|monstrous demonic roar, deep, cavernous, with a slight echo"
  "boss_die|2.4|huge monster death: roar collapsing into rubble and a shockwave boom"
  "thunder|2.6|distant rolling thunder with a sharp initial crack, stormy night"
  "gate|1.2|heavy iron portcullis slamming down with chains rattling"
  "select|0.4|short gothic menu confirm: a soft bell ding with a metallic tick"
  "pause|0.4|two-tone soft click chime, menu pause"
  "fire|0.9|burst of flame igniting with a crackle, short"
  "orb|1.8|shimmering holy relic appearing, ascending angelic sparkle with a choir shimmer"
)

for entry in "${SFX[@]}"; do
  IFS='|' read -r name dur prompt <<< "${entry}"
  dst="${OUT}/${name}.mp3"
  if [ -s "${dst}" ]; then echo "= ${name} exists"; continue; fi
  tmp="/tmp/sfx_${name}.mp3"
  echo "> ${name} (${dur}s)"
  curl -sS --fail -X POST "https://api.elevenlabs.io/v1/sound-generation" \
    -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "duration_seconds": float(sys.argv[2]), "prompt_influence": 0.55}))' "${prompt}" "${dur}")" \
    -o "${tmp}"
  # Normalise and trim trailing silence so hits land exactly on the frame they trigger
  ffmpeg -y -hide_banner -loglevel error -i "${tmp}" \
    -af "silenceremove=start_periods=1:start_silence=0.02:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_silence=0.08:start_threshold=-50dB,areverse,loudnorm=I=-18:TP=-1.5:LRA=9" \
    -codec:a libmp3lame -qscale:a 4 "${dst}"
  rm -f "${tmp}"
done
ls -la "${OUT}"
echo "SFX_DONE"
