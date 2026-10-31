#!/usr/bin/env bash
# Generates all nine gothic boss approach voice clips using the Daikon NLM TTS
# engine (models/gemini-v4s-tts-nlm-daikon on Beyond prod), trims trailing
# silence, and encodes compact stereo-ready MP3 assets in assets/voice/.
set -euo pipefail

G=/google/bin/releases/gemini-agents-generate/generate
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT}/assets/voice"
mkdir -p "${OUT_DIR}"

gen_daikon() {
  local key="$1"
  local voice="$2"
  local lang="$3"
  local style="$4"
  local text="$5"
  local wav="/tmp/daikon_boss_${key}.wav"
  local req="/tmp/daikon_boss_${key}.textproto"
  local mp3="${OUT_DIR}/${key}.mp3"

  if [ ! -s "${wav}" ]; then
    python3 - "${req}" "${voice}" "${lang}" "${style}" "${text}" << 'PY'
import json, sys
req_path, voice, lang, style, text = sys.argv[1:6]
esc = lambda s: json.dumps(s)
proto = f'''model: "models/gemini-v4s-tts-nlm-daikon"
contents {{
  role: "user"
  parts {{
    text: {esc(text)}
    part_metadata {{
      fields {{ key: "level" value {{ number_value: 0 }} }}
      fields {{ key: "speaker" value {{ string_value: "0" }} }}
      fields {{ key: "contain_backchannel" value {{ bool_value: false }} }}
      fields {{ key: "style" value {{ string_value: {esc(style)} }} }}
    }}
  }}
}}
generation_config {{
  response_modalities: AUDIO
  stop_sequences: "<end_of_audio>"
  speech_config {{
    language_code: {esc(lang)}
    voice_config {{
      prebuilt_voice_config {{
        voice_name: {esc(voice)}
      }}
    }}
  }}
}}
'''
with open(req_path, 'w', encoding='utf-8') as f:
    f.write(proto)
PY
    "${G}" -prod -timeout=90s -output="${wav}" -request="${req}"
  fi

  # Trim leading/trailing silence cleanly and normalize for crisp in-game playback
  ffmpeg -y -hide_banner -loglevel error -i "${wav}" \
    -af "silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_silence=0.18:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11" \
    -codec:a libmp3lame -qscale:a 4 "${mp3}"

  printf "%-14s -> %s (%ss)\n" "${key}" "${mp3}" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp3}")"
}

# Reuse verified Count clip if already staged in /tmp/probe_daikon.wav
if [ -s /tmp/probe_daikon.wav ] && [ ! -s /tmp/daikon_boss_count.wav ]; then
  cp /tmp/probe_daikon.wav /tmp/daikon_boss_count.wav
fi

gen_daikon "giantbat" "msm00013" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nVoice: adult male voice\nDirection: Speak with a raspy, nocturnal, predatory hiss and eerie cavernous menace.\nEmotion: Predatory, sinister\nTexture: Raspy, breathy, resonant\nPacing: Moderate\nPitch: Low\nExpressivity: High\nRole: Winged Night Stalker\nCharacter: Ancient Giant Bat Guardian' \
  "Cower beneath the moon, little hunter... my wings shall drink the warmth from your veins!"

gen_daikon "treant" "msm00001" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Speak in a deep, ancient, creaking hollow-wood guardian roar, slow, primordial, and menacing.\nEmotion: Ancient wrath, ominous\nTexture: Deep, gravelly, resonant, hollow\nPacing: Slow\nPitch: Low\nExpressivity: High\nRole: Ancient Forest Sovereign\nCharacter: The Briar King' \
  "The ancient roots awaken, trespasser... feed your bones to the darkwood!"

gen_daikon "greatjack" "msm00013" "en-IE" \
  $'Language: English\nRegion: Ireland\nAccent: Irish\nVoice: adult male voice\nDirection: Speak with theatrical, gleefully wicked harvest mischief and crackling firelight energy.\nEmotion: Gleefully menacing\nTexture: Gravelly, expressive\nPacing: Moderate\nPitch: Medium\nExpressivity: High\nRole: Harvest Trickster Spirit\nCharacter: The Great Jack-o-Lantern' \
  "<|chuckle|> Step into the harvest fire, wanderer! My grinning flames will hollow your bones!"

gen_daikon "devilsanta" "msm00001" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nVoice: mature male voice\nDirection: Speak with booming, dark winter mirth that turns chillingly cruel.\nEmotion: Booming sinister joviality\nTexture: Deep, gravelly, thunderous\nPacing: Moderate\nPitch: Low\nExpressivity: High\nRole: Dark Winter Warlord\nCharacter: Devil Santa' \
  "<|laughter|> A naughty soul trudging through the frost! Come unwrap the frozen grave I made for you!"

gen_daikon "bonecaptain" "msm00013" "en-GB" \
  $'Language: English\nRegion: Scotland\nAccent: Scottish\nVoice: mature male voice\nDirection: Speak as an iron-willed undead fortress commander barking an ultimatum from the battlements.\nEmotion: Stern, commanding, wrathful\nTexture: Gravelly, weathered\nPacing: Moderate\nPitch: Low\nExpressivity: High\nRole: Undead Fortress Commander\nCharacter: The Bone Captain' \
  "Halt upon the battlements, trespasser! None shall breach these walls while my legion stands!"

gen_daikon "reaper" "msm00013" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Speak in a cold, spectral, solemn graveyard whisper with haunting finality.\nEmotion: Cold, solemn, ominous\nTexture: Whispery, hollow, echoing\nPacing: Slow\nPitch: Low\nExpressivity: Moderate\nRole: Harbinger of Death\nCharacter: The Phantom Reaper' \
  "<|sigh|> Every footstep echoes closer to the crypt, mortal... yield your soul to the harvest."

gen_daikon "gorgon" "msf00005" "en-US" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature female voice\nDirection: Speak with regal, hypnotic, serpentine elegance and cold aristocratic cruelty.\nEmotion: Imperious, hypnotic, cold\nTexture: Silky, resonant, venomous\nPacing: Slow\nPitch: Medium\nExpressivity: High\nRole: Cursed Temple Sovereign\nCharacter: The Gorgon Queen' \
  "Lift your eyes to perfection, intruder, and join my silent gallery of eternal stone!"

gen_daikon "reaperlord" "msm00001" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Speak with apocalyptic authority and thunderous belfry dread.\nEmotion: Wrathful, ominous, commanding\nTexture: Deep, dark, resonant\nPacing: Slow\nPitch: Low\nExpressivity: High\nRole: Master of the Belfry\nCharacter: The Reaper Lord' \
  "The gears of midnight strike your final hour! Kneel before the master of the belfry!"

gen_daikon "count" "msm00001" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Speak with aristocratic gothic menace, slow dramatic cadence, and cold theatrical authority.\nEmotion: Menacing\nTexture: Deep, resonant, velvety\nPacing: Slow\nPitch: Low\nExpressivity: High\nRole: Gothic Castle Lord\nCharacter: Ancient Immortal Count' \
  "<|chuckle|> Welcome to my throne hall, hunter. Tonight, the darkness drinks its fill!"

gen_daikon "automaton" "msm00013" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: adult male voice\nDirection: Speak as a clanking brass clockwork machine: stiff, metallic, measured cadence with mechanical menace, like a wound-up music box turned cruel.\nEmotion: Cold, mechanical, menacing\nTexture: Metallic, clipped, resonant\nPacing: Measured\nPitch: Low\nExpressivity: Moderate\nRole: Clockwork Gallery Warden\nCharacter: The Brass Automaton' \
  "Insert your soul, player. The gallery of automata demands one more game... and the house always wins."

gen_daikon "archivist" "msm00013" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Speak as a dry, hollow, whispering spectral librarian: hushed, papery, echoing, with sudden cold menace, as if shushing a reader in a haunted library.\nEmotion: Cold, hushed, menacing\nTexture: Whispery, papery, echoing\nPacing: Slow\nPitch: Low\nExpressivity: Moderate\nRole: Keeper of the Forbidden Library\nCharacter: The Spectral Archivist' \
  "<|sigh|> Silence in the stacks, hunter... every tome here hungers, and your story ends on this page."


gen_daikon "archon" "msm00001" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Speak as an ancient stone guardian awakening: grinding, cavernous, slow and thunderous, like rock scraping rock, with righteous fury.\nEmotion: Wrathful, ancient, imperious\nTexture: Gravelly, cavernous, resonant\nPacing: Slow\nPitch: Very low\nExpressivity: High\nRole: Guardian of the Cathedral\nCharacter: The Gargoyle Archon' \
  "A thousand years I have watched from the rafters, mortal. Kneel beneath the glass... or be ground to dust beneath the stone."

# Ending narrator (epilogue), played over the dawn sequence.
gen_daikon "narrator_ending" "msm00001" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Speak as a warm, grave storyteller closing an old legend: slow, resonant, intimate, rising to quiet triumph at the end.\nEmotion: Solemn, then hopeful\nTexture: Deep, warm, resonant\nPacing: Slow\nPitch: Low\nExpressivity: High\nRole: Chronicler\nCharacter: The Narrator' \
  "And so the Count was dust, and his keep fell silent. The bells of midnight cracked and tumbled from the belfry, and the darkness that had fed on the valley for a hundred years drained away like water from a broken cup. The hunter did not look back. He walked the graveyard road as the mist lifted, and for the first time in his life... he walked it toward the sunrise."
