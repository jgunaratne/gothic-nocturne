#!/usr/bin/env bash
# Generates all eighteen gothic boss approach voice clips (plus ending narrator)
# using the Daikon NLM TTS engine (models/gemini-v4s-tts-nlm-daikon on Beyond prod),
# matching male voices to male bosses and female voices to female bosses, with
# expressive evil laughs, whispers, coughs, and dramatic shouting.
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
  local wav="/tmp/daikon_v2_${key}.wav"
  local req="/tmp/daikon_v2_${key}.textproto"
  local mp3="${OUT_DIR}/${key}.mp3"

  if [ -s "${mp3}" ]; then
    printf "%-20s -> exists (%ss)\n" "${key}" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp3}")"
    return
  fi

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

  printf "%-16s -> %s (%ss)\n" "${key}" "${mp3}" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp3}")"
}

# 1. Stage 1 — The Great Bat (Male: star07, gravelly dark nocturnal stalker)
gen_daikon "giantbat" "star07" "en-US" \
  $'Language: English\nRegion: United States\nVoice: adult male voice\nDirection: Begin with a wicked raspy chuckle and a dry throat-rattling cough, drop into a hungry nocturnal whisper, then snarl the final threat in an evil, fierce shout.\nEmotion: Evil, predatory, ravenous\nTexture: Raspy, gravelly, nocturnal\nPacing: Dynamic\nPitch: Low\nExpressivity: High\nRole: Winged Night Stalker\nCharacter: The Great Bat' \
  "<|chuckle|> <cough> <|whisper|> Smell that warm pulse in the mist, little hunter... <|/whisper|> MY FANGS SHALL DRAIN YOUR VEINS DRY!"

# 2. Stage 2 — The Briar King (Male: msm00001, deep ancient hollow-wood sovereign)
gen_daikon "treant" "msm00001" "en-US" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Start with a deep dry bark-like cough and a low rumbling evil laugh, whisper eerily like wind through dead branches, then roar with ancient wrath.\nEmotion: Ancient evil wrath, menacing\nTexture: Deep, hollow, gravelly, resonant\nPacing: Slow then thunderous\nPitch: Low\nExpressivity: High\nRole: Ancient Forest Sovereign\nCharacter: The Briar King' \
  "<cough> <|chuckle|> <|whisper|> Hear the hungry roots coiling beneath your boots... <|/whisper|> FEED YOUR BONES TO THE DARKWOOD!"

# 3. Stage 3 — The Great Jack (Male: star09, theatrical gleefully wicked trickster)
gen_daikon "greatjack" "star09" "en-US" \
  $'Language: English\nRegion: Ireland\nAccent: Irish\nVoice: adult male voice\nDirection: Open with unhinged theatrical evil laughter, lean in with a creepy conspiratorial whisper, and explode into a gleeful fiery shout.\nEmotion: Gleefully evil, manic, menacing\nTexture: Gravelly, theatrical, crackling\nPacing: Dynamic\nPitch: Medium-low\nExpressivity: High\nRole: Harvest Trickster Spirit\nCharacter: The Great Jack' \
  "<|laughter|> <|whisper|> Come closer to the lantern light, wanderer... <|/whisper|> MY GRINNING FLAMES WILL ROAST YOUR SOUL!"

# 4. Stage 4 — Devil Santa (Male: star13, booming cruel winter warlord)
gen_daikon "devilsanta" "star13" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nVoice: mature male voice\nDirection: Belt out a dark booming evil belly laugh and a frosty wheezing cough, drop to a chilling whisper, then bellow with cruel holiday malice.\nEmotion: Booming evil mirth, cruel, wrathful\nTexture: Deep, heavy, thunderous\nPacing: Moderate\nPitch: Low\nExpressivity: High\nRole: Dark Winter Warlord\nCharacter: Devil Santa' \
  "<|laughter|> <cough> <|whisper|> Another naughty mortal shivering in the snow... <|/whisper|> UNWRAP THE FROZEN GRAVE I CARVED FOR YOU!"

# 5. Stage 5 — The Bone Captain (Male: star15, barking undead fortress commander)
gen_daikon "bonecaptain" "star15" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nVoice: mature male voice\nDirection: Rattling dry bone cough followed by a cruel military laugh, then bark and shout like a ruthless undead commander ordering an execution.\nEmotion: Ruthless, wrathful, commanding\nTexture: Dry, weathered, percussive\nPacing: Brisk and forceful\nPitch: Low\nExpressivity: High\nRole: Undead Fortress Commander\nCharacter: The Bone Captain' \
  "<cough> <|chuckle|> Halt upon the battlements, worm! ARCHERS! CLEAVE THIS TRESPASSER TO RIBBONS!"

# 6. Stage 6 — The Phantom Reaper (Male: msm00001, ghostly whispery harbinger of death)
gen_daikon "reaper" "msm00001" "en-IE" \
  $'Language: English\nRegion: Ireland\nVoice: mature male voice\nDirection: Exhale a cold spectral sigh, speak in an icy grave-chill whisper, let out a sinister low chuckle, and swell into a haunting proclamation of doom.\nEmotion: Cold, sinister, ominous\nTexture: Whispery, hollow, echoing\nPacing: Slow\nPitch: Low\nExpressivity: High\nRole: Harbinger of Death\nCharacter: The Phantom Reaper' \
  "<|sigh|> <|whisper|> Every heartbeat echoes closer to the crypt, mortal... <|/whisper|> <|chuckle|> YIELD YOUR SOUL TO MY SCYTHE!"

# 7. Stage 7 — The Cinder Queen (Female: star17, blazing volcanic empress of the Dark Cave)
gen_daikon "cinderqueen" "star17" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature female voice\nDirection: Start with a smoky ash-choked cough and a wicked, imperious female laugh, drop to a sultry lethal whisper, then erupt into a blazing royal shout.\nEmotion: Fierce, evil, imperious, volcanic wrath\nTexture: Rich, smoky, commanding\nPacing: Dynamic\nPitch: Medium\nExpressivity: High\nRole: Volcanic Cavern Empress\nCharacter: The Cinder Queen' \
  "<cough> <|laughter|> <|whisper|> Feel the magma rising beneath your heels, little moth... <|/whisper|> BURN TO ASH BEFORE THE CINDER THRONE!"

# 8. Stage 8 — The Gorgon Queen (Female: msf00005, venomous aristocratic empress)
gen_daikon "gorgon" "msf00005" "en-US" \
  $'Language: English\nRegion: United States\nVoice: mature female voice\nDirection: Begin with a cruel, silky evil female laugh, coil into a hypnotic serpentine whisper, then command with furious regal venom.\nEmotion: Evil, imperious, cruel, venomous\nTexture: Silky, resonant, sharp\nPacing: Measured then fierce\nPitch: Medium\nExpressivity: High\nRole: Cursed Temple Sovereign\nCharacter: The Gorgon Queen' \
  "<|laughter|> <|whisper|> Dare you lift your trembling eyes to mine, intruder? <|/whisper|> SHATTER INTO ETERNAL STONE!"

# 9. Stage 9 — The Brass Automaton (Male: star09, unhinged clockwork warden)
gen_daikon "automaton" "star09" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: adult male voice\nDirection: Start with a stuttering mechanical cough and a cold, unhinged evil laugh, drop to an eerie music-box whisper, then boom with ruthless finality.\nEmotion: Cold, unhinged, sinister\nTexture: Crisp, metallic, resonant\nPacing: Measured staccato\nPitch: Medium-low\nExpressivity: High\nRole: Clockwork Gallery Warden\nCharacter: The Brass Automaton' \
  "<cough> <|laughter|> <|whisper|> Insert your beating heart into the slot, player... <|/whisper|> THE HOUSE ALWAYS COLLECTS IN BLOOD!"

# 10. Stage 10 — The Spectral Archivist (Male: star15, dusty whispering haunted scholar)
gen_daikon "archivist" "star15" "en-US" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Give a dry, dusty papery cough, hiss an eerie shushing library whisper, chuckle darkly, then shout in sudden ghostly fury.\nEmotion: Sinister, hushed, then furious\nTexture: Papery, whispery, expressive\nPacing: Slow then sudden outburst\nPitch: Low\nExpressivity: High\nRole: Keeper of the Forbidden Library\nCharacter: The Spectral Archivist' \
  "<cough> <|whisper|> Shhh... silence in the forbidden stacks, hunter... <|/whisper|> <|chuckle|> YOUR STORY ENDS IN BLOOD ON THIS PAGE!"

# 11. Stage 11 — The Gargoyle Archon (Male: star07, ancient gravelly stone guardian)
gen_daikon "archon" "star07" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nVoice: mature male voice\nDirection: Scrape out a stone-grinding cough and a dark guttural laugh, growl low, then roar like an awakened cathedral colossus.\nEmotion: Wrathful, merciless, ancient evil\nTexture: Gravelly, cavernous, rumbling\nPacing: Heavy and forceful\nPitch: Very low\nExpressivity: High\nRole: Guardian of the Desecrated Cathedral\nCharacter: The Gargoyle Archon' \
  "<cough> <|chuckle|> A thousand nights I have hungered in the rafters, worm! KNEEL BENEATH THE GLASS OR BE CRUSHED TO DUST!"

# 12. Stage 12 — The Reaper Lord (Male: star13, apocalyptic master of the belfry)
gen_daikon "reaperlord" "star13" "en-US" \
  $'Language: English\nRegion: United States\nVoice: mature male voice\nDirection: Unleash a deep, pitiless evil laugh, murmur a cold midnight whisper, then thunder every final word like the tolling of a doom bell.\nEmotion: Pitiless evil, apocalyptic authority\nTexture: Deep, dark, resonant\nPacing: Dramatic\nPitch: Low\nExpressivity: High\nRole: Master of the Belfry\nCharacter: The Reaper Lord' \
  "<|laughter|> <|whisper|> Listen... the gears of midnight toll your final breath... <|/whisper|> BOW BEFORE THE LORD OF DEATH!"

# 13. Stage 13 — The Count (Male: msm00001, aristocratic immortal vampire lord)
gen_daikon "count" "msm00001" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Open with a rich, velvety evil aristocratic laugh, lean close in a chilling predatory whisper, and rise into a grand, wrathful shout.\nEmotion: Aristocratic evil, theatrical, wrathful\nTexture: Deep, velvety, commanding\nPacing: Slow then explosive\nPitch: Low\nExpressivity: High\nRole: Immortal Castle Lord\nCharacter: The Count' \
  "<|laughter|> <|whisper|> So... the little hunter crawls bleeding into my throne hall... <|/whisper|> TONIGHT THE DARKNESS DRINKS ITS FILL!"

# 14. Stage 14 — The Grand Alchemist (Male: star09, manic arcane scholar)
gen_daikon "wing_alchemy_voice" "star09" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: adult male voice\nDirection: Start with an acrid fume-choked cough and a feverish, unhinged evil laugh, drop into an obsessive conspiratorial whisper, then shout with triumphant arcane madness.\nEmotion: Manic, obsessed, sinister, triumphant\nTexture: Sharp, theatrical, resonant\nPacing: Dynamic\nPitch: Medium-low\nExpressivity: High\nRole: Master of Forbidden Transmutation\nCharacter: The Grand Alchemist' \
  "<cough> <|laughter|> <|whisper|> Behold the Great Work, mortal... <|/whisper|> YOUR VERY BLOOD SHALL TRANSMUTE MY PHILOSOPHER STONE!"

# 15. Stage 15 — The Masquerade Duke (Male: msm00001, velvety decadent aristocrat)
gen_daikon "wing_ballroom_voice" "msm00001" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Begin with a cultured, sinister aristocratic chuckle, lean in with a silky, mocking ballroom whisper, then snap into a ruthless, booming command.\nEmotion: Cruel elegance, theatrical malice, wrathful\nTexture: Velvety, deep, resonant\nPacing: Graceful then sudden strike\nPitch: Low\nExpressivity: High\nRole: Phantom Ballroom Aristocrat\nCharacter: The Masquerade Duke' \
  "<|chuckle|> <|whisper|> May I have this final waltz, little hunter? <|/whisper|> WHEN THE HARPSICHORD STOPS, YOUR HEART SHALL TOO!"

# 16. Stage 16 — The Iron Gladiator (Male: star13, booming arena champion)
gen_daikon "wing_coliseum_voice" "star13" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nVoice: mature male voice\nDirection: Unleash a roaring, bloodthirsty arena laugh, bark out a fierce martial challenge, and bellow the final threat like an undefeated coliseum warlord.\nEmotion: Fierce, bloodthirsty, commanding, ruthless\nTexture: Thunderous, gravelly, brassy\nPacing: Forceful and driving\nPitch: Low\nExpressivity: High\nRole: Undefeated Arena Champion\nCharacter: The Iron Gladiator' \
  "<|laughter|> Salute the blood sands, challenger! NO MORTAL HAS EVER WALKED OUT THROUGH MY CHAMPION GATE!"

# 17. Stage 17 — The Drowned Oracle (Female: msf00005, haunting abyssal prophetess)
gen_daikon "wing_aqueduct_voice" "msf00005" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature female voice\nDirection: Exhale a cold, mournful sigh, speak in an eerie echoing subterranean whisper like dark water rising in stone vaults, then swell into a terrifying prophetic command.\nEmotion: Haunting, cold, merciless, ominous\nTexture: Silky, echoing, abyssal\nPacing: Slow then overwhelming\nPitch: Medium-low\nExpressivity: High\nRole: Abyssal Cistern Prophetess\nCharacter: The Drowned Oracle' \
  "<|sigh|> <|whisper|> Hear the black tide rising in the cisterns, hunter... <|/whisper|> SINK BENEATH MY SILENT WATERS FOREVER!"

# 18. Stage 18 — The Moonlit Seraph (Female: star17, imperious celestial guardian)
gen_daikon "wing_skykeep_voice" "star17" "en-GB" \
  $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature female voice\nDirection: Begin with a cold, crystalline, imperious laugh, murmur a lofty celestial whisper from high above the clouds, then thunder down with pitiless divine wrath.\nEmotion: Imperious, coldly radiant, wrathful\nTexture: Rich, resonant, commanding\nPacing: Majestic then fierce\nPitch: Medium\nExpressivity: High\nRole: Celestial Sanctuary Warden\nCharacter: The Moonlit Seraph' \
  "<|laughter|> <|whisper|> Above the clouds no mortal foot may tread... <|/whisper|> PLUMMET FROM THESE CELESTIAL GARDENS INTO THE NIGHT!"

# Ending narrator (epilogue, male chronicler — keep warm & solemn)
if [ ! -s "${OUT_DIR}/narrator_ending.mp3" ]; then
  gen_daikon "narrator_ending" "msm00001" "en-GB" \
    $'Language: English\nRegion: United Kingdom\nAccent: Received Pronunciation\nVoice: mature male voice\nDirection: Speak as a warm, grave storyteller closing an old legend: slow, resonant, intimate, rising to quiet triumph at the end.\nEmotion: Solemn, then hopeful\nTexture: Deep, warm, resonant\nPacing: Slow\nPitch: Low\nExpressivity: High\nRole: Chronicler\nCharacter: The Narrator' \
    "And so the Count was dust, and his keep fell silent. The bells of midnight cracked and tumbled from the belfry, and the darkness that had fed on the valley for a hundred years drained away like water from a broken cup. The hunter did not look back. He walked the graveyard road as the mist lifted, and for the first time in his life... he walked it toward the sunrise."
fi
