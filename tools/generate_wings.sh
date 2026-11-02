#!/usr/bin/env bash
# Generates all real Gempix pixel-art assets for the 5 new Castle Wings
# (Stages 14–18: Alchemy Lab, Phantom Ballroom, Blood Coliseum, Sunken Aqueduct,
# Floating Garden) plus wide 16:9 multi-bay walls, monumental indoor murals,
# wide 1280x360 panoramic vistas, hanging mechanism sprites, map icons, and
# 5 dedicated boss sprite sheets.
#
# Stages all intermediate requests and PNGs in /tmp/gen_*.png (never .gemini/)
# with at most 3 concurrent `generate` processes per batch, then copies into
# art/raw/ for tools/process_assets.py.
set -u

G=/google/bin/releases/gemini-agents-generate/generate
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW_DIR="${ROOT}/art/raw"
mkdir -p "${RAW_DIR}"

STYLE='32-bit era (mid-1990s console) 2D pixel art for a gothic horror side-scrolling action platformer. Crisp hard-edged pixel clusters, limited palette, flat shading with 2-3 tones per material, no anti-aliasing blur, no painterly or photoreal rendering, no 3D-render look. Strict orthographic view. No text, no letters, no numbers, no labels, no watermark, no signature, no frame borders.'
KEY='The background must be one flat solid pure bright green (#00FF00) with no gradient, no ground shadows, and nothing touching the image edges. Nothing pure bright green (#00FF00) anywhere on the subjects; use deep teal, cyan-turquoise, sapphire, crimson, amber-gold or dark slate-olive instead.'

gen_sq() {
  local name="$1"; shift
  local prompt="${STYLE} $*"
  local out="/tmp/gen_${name}.png"
  if [ -s "${out}" ]; then echo "= ${name} exists"; return 0; fi

  "$G" -prod -timeout=90s -output="${out}" image -model=gempix-2-flash-lite-png "${prompt}" 2>&1 | grep -E "Successfully|rror|denied|Overloaded" | tail -1
  [ -s "${out}" ] && return 0
  sleep 4
  "$G" -prod -timeout=120s -output="${out}" image -model=gempix2-flash -no-thoughts "${prompt}" 2>&1 | grep -E "Successfully|rror|denied|Overloaded" | tail -1
  [ -s "${out}" ] && return 0
  sleep 6
  "$G" -prod -timeout=120s -output="${out}" image -model=gempix-1 "${prompt}" 2>&1 | grep -E "Successfully|rror|denied|Overloaded" | tail -1
}

gen_wide() {
  local name="$1"; shift
  local prompt="${STYLE} $*"
  local out="/tmp/gen_${name}.png"
  local req="/tmp/req_${name}.json"
  if [ -s "${out}" ]; then echo "= ${name} (16:9) exists"; return 0; fi

  for model in "models/gempix2-flash" "models/gempix-2"; do
    python3 - "${req}" "${model}" "${prompt}" << 'PY'
import json, sys
req_path, model_name, text = sys.argv[1:4]
payload = {
  "model": model_name,
  "contents": [{"role": "user", "parts": [{"text": text}]}],
  "generation_config": {
    "response_modalities": ["IMAGE"],
    "thinking_config": {"include_thoughts": False},
    "image_config": {"aspect_ratio": "16:9"}
  }
}
with open(req_path, "w", encoding="utf-8") as fh:
  json.dump(payload, fh)
PY
    "$G" -prod -timeout=120s -output="${out}" -request="${req}" > "/tmp/log_${name}.txt" 2>&1
    if [ -s "${out}" ]; then
      echo "+ ${name} (16:9) ok"
      return 0
    fi
    tail -2 "/tmp/log_${name}.txt"
    sleep 5
  done
}

# ---- Batch 1: Terrain Strips (Alchemy & Ballroom) ---------------------------
gen_sq alchemyfloor "Palette: dark charcoal-indigo slate, burnished copper, brass gold, glowing cyan-turquoise (#2ad8c8) and warm amber, deep midnight shadows. SIDE-VIEW TERRAIN CROSS-SECTION STRIP of a forbidden gothic alchemy laboratory floor, horizontally seamless (the left edge continues the right edge). The top 25 percent of the image is flat solid pure bright green (#00FF00) with nothing in it. At exactly 25 percent from the top is a perfectly horizontal walking surface of heavy dark slate flagstones inlaid with thin brass geometric channels and tiny glowing cyan-turquoise arcane sigils. Below the surface the remaining 75 percent is dark laboratory brickwork laced with horizontal riveted copper alembic pipes, brass pressure valves, and glass conduits glowing cyan-turquoise and amber, getting darker toward the bottom edge. Never use pure bright green (#00FF00) on the tiles or pipes." &
sleep 1
gen_sq alchemyfloor_b "Palette: dark charcoal-indigo slate, burnished brass, dark crimson brick, glowing amber-gold and cyan-turquoise (#2ad8c8), deep shadows. SIDE-VIEW TERRAIN CROSS-SECTION STRIP of an alchemical furnace grating floor, horizontally seamless (the left edge continues the right edge). The top 25 percent of the image is flat solid pure bright green (#00FF00) with nothing in it. At exactly 25 percent from the top is a perfectly horizontal walking surface of heavy brass floor grates and dark carved slate slabs with warm amber furnace glow peeking between the bars. Below the surface the remaining 75 percent is arched dark brick furnace flues, copper coils, and glowing amber coal beds, getting darker toward the bottom edge. Never use pure bright green (#00FF00) below the sky band." &
sleep 1
gen_sq ballroomfloor "Palette: polished obsidian black marble, warm bone-ivory marble, rose-quartz pink, burnished gold leaf, deep plum-indigo shadows. SIDE-VIEW TERRAIN CROSS-SECTION STRIP of an aristocratic haunted grand ballroom floor, horizontally seamless (the left edge continues the right edge). The top 25 percent of the image is flat solid pure bright green (#00FF00) with nothing in it. At exactly 25 percent from the top is a perfectly horizontal walking surface of gleaming black-and-ivory checkerboard marble slabs edged with a thin gold-leaf fillet. Below the surface the remaining 75 percent is carved rose-marble frieze moulding, gilded scroll corbels, and dark plum-shadowed undercroft stone arches, getting darker toward the bottom edge. Nothing pure bright green (#00FF00) on the stone." &
wait

# ---- Batch 2: Terrain Strips (Ballroom B & Coliseum A/B) --------------------
gen_sq ballroomfloor_b "Palette: rich crimson-burgundy velvet, burnished gold braid, dark walnut wood, cream marble, deep indigo shadows. SIDE-VIEW TERRAIN CROSS-SECTION STRIP of a royal ballroom carpeted gallery floor, horizontally seamless (the left edge continues the right edge). The top 25 percent of the image is flat solid pure bright green (#00FF00) with nothing in it. At exactly 25 percent from the top is a perfectly horizontal walking surface of plush crimson-burgundy velvet runner carpet trimmed with gold fringe laid over polished walnut and cream marble. Below the surface the remaining 75 percent is carved cream-marble balusters, gilded rosettes, and dark stone masonry, getting darker toward the bottom edge. Nothing pure bright green (#00FF00) on the floor." &
sleep 1
gen_sq coliseumfloor "Palette: warm ochre-rust arena sand, dried crimson stains, weathered tan travertine stone, dark bronze, bone ivory, deep charcoal shadows. SIDE-VIEW TERRAIN CROSS-SECTION STRIP of a subterranean blood-stained gladiator coliseum floor, horizontally seamless (the left edge continues the right edge). The top 25 percent of the image is flat solid pure bright green (#00FF00) with nothing in it. At exactly 25 percent from the top is a perfectly horizontal walking surface of packed ochre-rust arena sand and cracked travertine slabs with tiny broken bronze spear tips lying flat. Below the surface the remaining 75 percent is ancient Roman brick hypogeum vaults, iron-barred beast cage grates, bronze chains, and skulls in dark recesses, getting darker toward the bottom edge. Nothing pure bright green (#00FF00) on the stone or sand." &
sleep 1
gen_sq coliseumfloor_b "Palette: weathered tan travertine ashlar, dark forged iron, tarnished bronze, crimson banner cloth, deep umber shadows. SIDE-VIEW TERRAIN CROSS-SECTION STRIP of an imperial coliseum podium wall and walkway, horizontally seamless (the left edge continues the right edge). The top 25 percent of the image is flat solid pure bright green (#00FF00) with nothing in it. At exactly 25 percent from the top is a perfectly horizontal walking surface of massive dressed travertine blocks clamped with dark iron dovetails. Below the surface the remaining 75 percent is carved Roman shield-and-sword stone reliefs, bronze lion rings, and dark arched stone masonry, getting darker toward the bottom edge. Nothing pure bright green (#00FF00) on the stone." &
wait

# ---- Batch 3: Terrain Strips (Aqueduct A/B & Skykeep A) ---------------------
gen_sq aqueductfloor "Palette: wet slate-blue limestone, deep sea-teal moss (#1c787c), tarnished bronze, glowing ice-cyan water puddles, deep abyssal navy shadows. SIDE-VIEW TERRAIN CROSS-SECTION STRIP of a flooded subterranean Roman aqueduct walkway, horizontally seamless (the left edge continues the right edge). The top 25 percent of the image is flat solid pure bright green (#00FF00) with nothing in it. At exactly 25 percent from the top is a perfectly horizontal walking surface of wet slate-blue Roman flagstones with thin glistening cyan water puddles and dark sea-teal moss in the joints. Below the surface the remaining 75 percent is monumental Roman voussoir stone arches, bronze water-sluice grates, barnacles, and wet dark navy brickwork, getting darker toward the bottom edge. Never use pure bright green (#00FF00) on the moss; use deep sea-teal (#1c787c) and slate-blue." &
sleep 1
gen_sq aqueductfloor_b "Palette: blue-grey cut stone, oxidized copper-teal (#26858a), tarnished brass, pale cyan mineral crust, deep navy-black shadows. SIDE-VIEW TERRAIN CROSS-SECTION STRIP of an ancient sunken cistern sluice bridge, horizontally seamless (the left edge continues the right edge). The top 25 percent of the image is flat solid pure bright green (#00FF00) with nothing in it. At exactly 25 percent from the top is a perfectly horizontal walking surface of heavy bronze-grated canal stone slabs with pale cyan wet highlights. Below the surface the remaining 75 percent is riveted copper cistern pipes, arched stone water conduits, and salt-crusted dark masonry, getting darker toward the bottom edge. Never use pure bright green (#00FF00) on the stone or pipes." &
sleep 1
gen_sq skykeepfloor "Palette: luminous moonlit white Carrara marble, pale silver-blue, burnished celestial gold, deep midnight-teal ivy (#165868), deep indigo shadows. SIDE-VIEW TERRAIN CROSS-SECTION STRIP of a floating celestial marble sanctuary terrace high in the night sky, horizontally seamless (the left edge continues the right edge). The top 25 percent of the image is flat solid pure bright green (#00FF00) with nothing in it. At exactly 25 percent from the top is a perfectly horizontal walking surface of polished white-and-silver marble slabs inlaid with golden star filigree. Below the surface the remaining 75 percent is fluted white marble corbels, carved cloud-and-wing friezes, gold trim, and trailing dark midnight-teal ivy vines, getting darker toward the bottom edge. Never use pure bright green (#00FF00) on the vines; use dark midnight-teal (#165868)." &
wait

# ---- Batch 4: Skykeep B Strip + Wide 16:9 Indoor Walls (1 & 2) --------------
gen_sq skykeepfloor_b "Palette: midnight-teal celestial turf (#186272), luminous white marble, pale silver star-petals, burnished gold, slate-blue cliff stone, deep indigo shadows. SIDE-VIEW TERRAIN CROSS-SECTION STRIP of a moonlit hanging sanctuary garden island, horizontally seamless (the left edge continues the right edge). The top 25 percent of the image is flat solid pure bright green (#00FF00) with nothing in it. At exactly 25 percent from the top is a perfectly horizontal walking surface of midnight-teal sanctuary turf with inlaid white marble stepping stones and tiny silver-white blossoms. Below the surface the remaining 75 percent is carved white marble retaining masonry, golden astronomical medallions, and rugged blue-grey floating-island cliff stone, getting darker toward the bottom edge. Never use pure bright green (#00FF00) on the turf; use midnight-teal (#186272) and slate-blue." &
sleep 1
gen_wide alchemywall "Palette: dark slate-indigo stone, warm walnut wood, burnished copper and brass, glowing cyan-turquoise and amber-gold glass, deep indigo shadows. WIDE MULTI-BAY SEAMLESS INTERIOR WALL TEXTURE of a grand gothic alchemy laboratory, filling the entire 16:9 frame edge to edge with no border, no floor, and no green background. Across four distinct architectural bays framed by slender clustered stone piers and copper pipes: (bay 1) tall wooden apothecary shelves crowded with glowing cyan, amber, and violet glass retorts and flasks, (bay 2) a recessed stone arch holding a giant copper distillation spiral and engraved celestial brass chart, (bay 3) shelved grimoires, skull specimens, and brass pressure gauges, (bay 4) a tall pointed gothic leaded-glass lancet window glowing with cold moonlight, all above a continuous dark slate wainscot so the left edge seamlessly continues the right edge and top continues bottom. Flat frontal orthographic view, no text." &
sleep 1
gen_wide ballroomwall "Palette: cream and rose-veined marble, deep plum and crimson velvet, burnished gold leaf, silvered dark mirror glass, warm candle amber, deep indigo shadows. WIDE MULTI-BAY SEAMLESS INTERIOR WALL TEXTURE of a haunted aristocratic baroque ballroom, filling the entire 16:9 frame edge to edge with no border, no floor, and no green background. Across four distinct architectural bays separated by fluted cream-marble Corinthian pilasters with gold capitals: alternating tall arched gilded Venetian mirrors reflecting ghostly candle-glow and sweeping crimson-and-plum velvet draperies tied with gold cords, surmounted by painted baroque lunette reliefs and a gilded cornice above carved marble wainscoting so the left edge seamlessly continues the right edge and top continues bottom. Flat frontal orthographic view, no text." &
wait

# ---- Batch 5: Wide 16:9 Indoor Walls (3 & 4) + Skykeep Far Panorama ---------
gen_wide coliseumwall "Palette: weathered ochre-grey Roman travertine stone, dark forged iron, tarnished bronze, tattered crimson and gold banners, warm torchlight amber, deep charcoal-indigo shadows. WIDE MULTI-BAY SEAMLESS INTERIOR WALL TEXTURE of a monumental subterranean Roman-gothic gladiator coliseum, filling the entire 16:9 frame edge to edge with no border, no floor, and no green background. Across four grand architectural bays: tiered stone spectator arcades in deep shadow above heavy arched travertine piers, iron-barred beast portcullises, hanging tattered crimson-and-gold legion banners, carved stone gladiator battle friezes, and bronze lion-head sconces, arranged so the left edge seamlessly continues the right edge and top continues bottom. Flat frontal orthographic view, no text." &
sleep 1
gen_wide aqueductwall "Palette: damp blue-grey Roman ashlar stone, deep sea-teal moss, oxidized bronze, glowing pale-cyan mineral veins, deep abyssal navy shadows. WIDE MULTI-BAY SEAMLESS INTERIOR WALL TEXTURE of a vast flooded subterranean Roman cistern and aqueduct, filling the entire 16:9 frame edge to edge with no border, no floor, and no green background. Across four grand architectural bays: double-tiered monumental mossy stone arches opening into dark misty flooded vaults, carved bronze lion-head water spouts weeping thin silver-cyan trickles, rusted iron sluice-gate wheels, and glowing pale-cyan crystal seams in wet brickwork, arranged so the left edge seamlessly continues the right edge and top continues bottom. Flat frontal orthographic view, no text." &
sleep 1
gen_wide skykeep_far "Palette: deep midnight-indigo and royal-violet night sky, luminous silver-white and ice-blue clouds, pale gold stars and celestial rings, moonlit white marble silhouettes. WIDE 16:9 PANORAMIC FAR BACKGROUND of a celestial realm high above the clouds at night, filling the entire 16:9 frame edge to edge with no green background and no border. Upper two-thirds: a vast star-strewn midnight-indigo sky with a huge luminous pale-silver crescent moon, faint golden constellation lines, and distant floating white-marble observatory towers and giant golden astronomical armillary rings on the horizon. Bottom third: a sweeping moonlit sea of silver-rimmed indigo cloud banks stretching to the horizon. Horizontally seamless so the left edge blends into the right edge. Crisp 32-bit pixel art, no text." &
wait

# ---- Batch 6: Wide 16:9 Chroma-Keyed Panoramas & Vistas ---------------------
gen_wide skykeep_mid "Palette: moonlit white and pale-blue marble, burnished celestial gold, dark midnight-teal cypress foliage (#145060), silver-cyan waterfalls, deep indigo shadows. WIDE 16:9 MID-DISTANCE PARALLAX LAYER of floating gothic-classical marble sanctuary gardens in the sky: an asymmetric panoramic chain of floating white-marble cliff islands crowned with ruined fluted colonnade rotundas, pointed astronomical arches, dark midnight-teal cypress trees, and thin silver-cyan waterfalls cascading down, with a continuous dark indigo cloud-and-cliff base filling the bottom 12 percent of the frame so the bottom edge is solid. Horizontally seamless from left edge to right edge. Everything that is open sky above and between the islands must be one flat solid pure bright green (#00FF00) with no gradient, no stars, and no moon. Never use pure bright green (#00FF00) on the trees or stone; use dark midnight-teal (#145060) and slate-blue." &
sleep 1
gen_wide graveyard_vista "Palette: midnight indigo, desaturated slate-blue stone, charcoal silhouettes, pale silver moonlight rim highlights, tiny warm amber window pinpoints. WIDE 16:9 MID-DISTANCE PARALLAX PANORAMA of a vast gothic valley at night: an asymmetric non-repeating horizon spanning craggy mountain peaks on the left, a long multi-tiered stone aqueduct bridge spanning a misty gorge in the centre, a ruined cliffside abbey, and a colossal multi-towered gothic vampire castle with flying buttresses and soaring spires on the right, with a solid dark indigo ground silhouette across the bottom 14 percent so the bottom edge is completely filled. Horizontally seamless from left edge to right edge. All open sky above the mountains, bridge, and castle must be one flat solid pure bright green (#00FF00) with no stars, moon, or gradient. Nothing pure bright green (#00FF00) on the landscape." &
sleep 1
gen_wide mural_alchemy "Palette: dark slate stone, burnished gold leaf, copper, glowing emerald-teal, ruby crimson, sapphire blue, parchment ivory. GRAND GOTHIC WALL FRESCO PAINTING filling the entire 16:9 frame edge to edge (no green background): a monumental medieval-baroque alchemical mural painted on aged stone plaster depicting a giant golden Ouroboros dragon ring encircling a blazing faceted crimson-and-cyan Philosopher Stone, flanked by the radiant Sun and silver Moon, copper retorts, geometric star diagrams, and robed scholars in an arched stone border. Crisp 32-bit pixel art, flat frontal view, no text or letters." &
wait

# ---- Batch 7: Monumental Non-Repeating Indoor Wall Murals -------------------
gen_wide mural_ballroom "Palette: rich crimson, royal plum, antique gold, bone ivory, candlelit amber, midnight indigo. GRAND BAROQUE WALL FRESCO PAINTING filling the entire 16:9 frame edge to edge (no green background): a wide haunting oil-on-plaster ballroom mural depicting masked aristocratic couples in sweeping crimson and ivory gowns waltzing across a checkered hall beneath crystal chandeliers while a skeletal violinist conducts from a gilded balcony, framed by painted baroque scrollwork. Crisp 32-bit pixel art, flat frontal view, no text." &
sleep 1
gen_wide mural_coliseum "Palette: weathered travertine ochre, terracotta red, tarnished bronze, bone ivory, charcoal umber shadows. MONUMENTAL CARVED STONE RELIEF AND MOSAIC MURAL filling the entire 16:9 frame edge to edge (no green background): an ancient Roman-gothic bas-relief frieze and tesserae mosaic depicting armored gladiators with tridents, shields, and roaring lions clashing before an arched amphitheater beneath a dark eclipsed sun, framed by carved stone laurel garlands and legion eagles. Crisp 32-bit pixel art, flat frontal view, no text." &
sleep 1
gen_wide mural_aqueduct "Palette: sapphire blue, sea-turquoise, antique gold tesserae, seafoam ivory, deep abyssal navy. MONUMENTAL ANCIENT BYZANTINE MOSAIC MURAL filling the entire 16:9 frame edge to edge (no green background): a weathered subterranean stone-tile mosaic depicting a crowned sea-oracle priestess rising from swirling turquoise whirlpools flanked by twin coiled Leviathan sea-serpents and triple Roman aqueduct arches pouring silver water, framed by a classical wave-scroll border. Crisp 32-bit pixel art, flat frontal view, no text." &
wait

# ---- Batch 8: Remaining Murals (Throne & Catacombs) + Wing Icons ------------
gen_wide mural_throne "Palette: deep blood-crimson, antique gold thread, midnight indigo, bone ivory, charcoal black. MONUMENTAL WOVEN GOTHIC CASTLE TAPESTRY filling the entire 16:9 frame edge to edge (no green background): a rich medieval woven wall tapestry depicting a towering dark mountain fortress beneath a giant crimson full moon, winged night-beasts soaring above pine crags, and armored knights kneeling before a dark sovereign throne, framed by an ornate woven heraldic floral border. Crisp 32-bit pixel art, flat frontal view, no text." &
sleep 1
gen_wide mural_catacombs "Palette: weathered limestone grey, bone ivory, ochre gold, muted crimson, deep crypt umber. MONUMENTAL MEDIEVAL DANSE MACABRE FRESCO MURAL filling the entire 16:9 frame edge to edge (no green background): an ancient cracked crypt wall painting depicting crowned skeletons holding hourglasses, lanterns, and scythes leading robed kings and armored knights in a solemn procession beneath pointed gothic trefoil arches. Crisp 32-bit pixel art, flat frontal view, no text." &
sleep 1
gen_sq wing_icons "Palette: burnished gold, pale silver, glowing cyan-turquoise, ruby crimson, bone ivory, deep indigo outlines. A ROW of 5 separate small map emblem icons in one horizontal row with wide even green gaps, all the same height and centred on the same baseline: (1) a bubbling cyan-turquoise glass alchemy flask in a brass ring, (2) an ornate gilded masquerade mask with a crimson rose, (3) a bronze gladiator helmet crossed with a trident, (4) a stone triple-arch Roman aqueduct over cyan waves, (5) a winged white-marble crescent moon astrolabe. Crisp readable 32-bit pixel silhouettes. ${KEY}" &
wait

# ---- Batch 9: Wing Prop Sprite Sheets (1–3) ---------------------------------
gen_sq alchemy_props "Palette: burnished copper, brass gold, dark walnut wood, slate stone, glowing cyan-turquoise (#2ad8c8) and warm amber glass, deep indigo shadows. A ROW of 4 separate props for a gothic alchemy laboratory, in one horizontal row with wide even green gaps, strict side view, same scale, all standing on the same invisible baseline: (1) a brass tripod retort stand holding a bubbling cyan-turquoise glass alembic over a small amber burner, (2) a tall copper high-voltage Tesla coil pillar crackling with pale cyan arcs, (3) a carved wooden rack of glowing amber, violet, and cyan potion bottles, (4) a domed riveted brick-and-brass alchemical athanor furnace glowing warm orange inside its grate. ${KEY}" &
sleep 1
gen_sq ballroom_props "Palette: burnished gold leaf, crimson-burgundy velvet, polished cream and rose marble, warm candle amber, silvered dark mirror glass, deep indigo shadows. A ROW of 4 separate props for a haunted baroque ballroom, in one horizontal row with wide even green gaps, strict side view, same scale, all standing on the same invisible baseline: (1) a tall standing gilded oval floor mirror with dark haunted reflections, (2) an ornate tall golden seven-branch floor candelabra with lit amber candles, (3) a tall freestanding gilded drapery stand hung with pleated crimson velvet curtains and gold tassels, (4) a carved white-marble noble bust on a fluted rose-marble pedestal. ${KEY}" &
sleep 1
gen_sq coliseum_props "Palette: dark forged iron, tarnished bronze, weathered travertine stone, crimson cloth, bone ivory, blazing orange fire, deep charcoal shadows. A ROW of 4 separate props for a subterranean gladiator coliseum, in one horizontal row with wide even green gaps, strict side view, same scale, all standing on the same invisible baseline: (1) a heavy wooden-and-iron gladiator weapon rack holding bronze shields, spears, and swords, (2) a stone trophy column topped with horned skulls and dented bronze armor, (3) a wide tripod wrought-iron arena brazier blazing with orange coals and flames, (4) a tall Roman legion war standard pole with a golden eagle, laurel wreath, and tattered crimson banner. ${KEY}" &
wait

# ---- Batch 10: Wing Prop Sheets (4–5) + Hanging Mechanism Props -------------
gen_sq aqueduct_props "Palette: weathered blue-grey limestone, oxidized bronze, dark sea-teal moss (#1c787c), terracotta clay, glowing cyan lantern light, deep navy shadows. A ROW of 4 separate props for a flooded subterranean Roman aqueduct, in one horizontal row with wide even green gaps, strict side view, same scale, all standing on the same invisible baseline: (1) a carved stone plinth with a bronze lion-head fountain spout pouring cyan water into a basin, (2) a heavy geared iron-and-bronze sluice gate wheel mechanism on a stone mount, (3) a cluster of three ancientbarnacle-and-moss-encrusted terracotta Roman amphora jars, (4) a wrought-iron canal post holding a glowing cyan-glass storm lantern. ${KEY}" &
sleep 1
gen_sq skykeep_props "Palette: luminous white Carrara marble, burnished celestial gold, pale silver-blue, dark midnight-teal ivy (#165868), glowing starlight cyan, deep indigo shadows. A ROW of 4 separate props for a moonlit floating marble sanctuary garden, in one horizontal row with wide even green gaps, strict side view, same scale, all standing on the same invisible baseline: (1) an ornate golden armillary sphere astrolabe on a white marble pedestal, (2) a broken fluted white marble Corinthian column wrapped in dark midnight-teal ivy, (3) a carved white marble tiered starlight fountain basin brimming with glowing pale-cyan water, (4) a slender silver-and-gold sanctuary pedestal lantern glowing with warm starlight. ${KEY}" &
sleep 1
gen_sq hanging_props "Palette: dark forged iron, tarnished brass and gold, bone ivory, crimson rust, deep indigo shadows. A ROW of 3 separate gothic castle hanging mechanism props in one horizontal row with wide even green gaps, strict front-side orthographic view, all at the same scale and aligned cleanly: (1) a heavy ornate circular brass-and-iron clockwork pendulum bob with a razor crescent lower blade and crimson jewel core, (2) a wrought-iron hanging dungeon gibbet cage holding a bleached skeleton inside the bars, (3) an ornate heavy iron-and-brass ceiling chain pulley hoist wheel. ${KEY}" &
wait

# ---- Batch 11: Dedicated Wing Boss Sprite Sheets (Alchemist, Masquerade, Gladiator)
gen_sq alchemist "Palette: deep midnight-teal and charcoal velvet robes, burnished brass and gold trim, copper mechanical gauntlet, glowing cyan-turquoise (#2ad8c8) and amber-gold elixirs, pale gaunt face with brass monocle, deep indigo shadows. SPRITE SHEET of ONE boss monster facing RIGHT in every frame: The Grand Alchemist, a tall gaunt gothic master alchemist levitating slightly above the floor in brass-trimmed dark robes with glowing cyan glass vials strapped to his shoulders and a floating copper-and-crystal alembic staff. Layout: a single horizontal row of 4 cells with wide even green gaps, all at the same scale and same baseline: (1) floating idle holding a glowing cyan flask and alembic staff, (2) casting forward with robes swept back and hurling glowing transmutation vials to the right, (3) summoning with both arms raised high and brass rings orbiting him, (4) shielded behind a spinning geometric golden-cyan alchemical transmutation circle. ${KEY}" &
sleep 1
gen_sq masquerade "Palette: royal crimson, deep plum-violet and black brocade tailcoat, ornate gold-and-ivory venetian masquerade mask, silver rapier, swirling rose-magenta cape, deep indigo shadows. SPRITE SHEET of ONE aristocratic vampire boss facing RIGHT in every frame: The Masquerade Duke, a tall regal phantom nobleman in a gilded masquerade mask, ruffled lace cravat, and sweeping crimson-lined cape wielding a gleaming silver dueling rapier. Layout: a single horizontal row of 4 cells with wide even green gaps, all at the same scale with boots on a shared baseline: (1) standing poised in an elegant fencing en-garde stance with cape draped, (2) swirling his vast crimson-and-plum cape wide open like bat wings, (3) raising one gloved hand to cast dark rose-fire magic while holding his rapier back, (4) lunging sharply forward to the right in a full fencing thrust with rapier extended. ${KEY}" &
sleep 1
gen_sq gladiator "Palette: blackened forged iron plate, burnished bronze shoulder pauldrons and crested gladiator helm, tattered blood-crimson cape, glowing fiery-orange eyes inside the visor, heavy spiked chain-flail and notched tower shield, deep charcoal shadows. SPRITE SHEET of ONE towering armored coliseum champion boss facing RIGHT in every frame: The Iron Gladiator, a colossal undead Roman-gothic arena warlord in plumed bronze-and-iron lorica armor. Layout: a single horizontal row of 4 cells with wide even green gaps, all at the same scale with greaves on a shared baseline: (1) marching forward heavy-footed, shield raised, step 1, (2) marching forward, opposite leg striding, step 2, (3) winding his massive weapon arm back behind his shoulder to hurl a heavy iron javelin, (4) thrusting and charging fiercely forward to the right with weapon and shield slamming ahead. ${KEY}" &
wait

# ---- Batch 12: Dedicated Wing Boss Sprite Sheets (Oracle, Seraph) -----------
gen_sq oracle "Palette: abyssal sapphire-blue and sea-turquoise scales, tarnished antique gold crown and jewelry, tattered pearl-ivory silk veil, glowing ice-cyan eyes, bioluminescent coral fins, deep navy shadows. SPRITE SHEET of ONE aquatic serpent-bodied prophetess boss facing RIGHT in every frame: The Drowned Oracle, a haunting regal siren-medusa sovereign with a long coiled sea-serpent lower body, finned crest, golden trident-scepter, and writhing venomous water-serpent locks. Layout: a single horizontal row of 3 cells with wide even green gaps, all at the same scale and same baseline: (1) coiled upright hovering gracefully with scepter held low, pose A, (2) coiled swaying with tail undulating and clawed hand raised, pose B, (3) leaning fiercely forward to the right with mouth open and eyes blazing bright cyan in a petrifying abyssal stare. ${KEY}" &
sleep 1
gen_sq seraph "Palette: luminous moonlit white-and-silver marble armor, burnished celestial gold halo-crown and wing-trim, six vast feathered alabaster-and-slate wings, glowing ice-cyan eyes and starlight fissures, silver greatspear, deep indigo shadows. SPRITE SHEET of ONE colossal winged celestial guardian boss facing RIGHT in every frame: The Moonlit Seraph, a fallen gothic marble-and-gold angel statue awakened to guard the sky sanctum. Layout: a single horizontal row of 4 cells with wide even green gaps, all at the same scale and centered cleanly: (1) hovering upright with alabaster wings folded regally around its armor, (2) wings spread vast and wide with spear raised in a celestial roar, (3) diving forward to the right in a fierce aerial pounce with spear and talons thrust ahead, (4) all six marble wings wrapped tightly around its body as an impenetrable silver-and-gold stone sanctuary shell. ${KEY}" &
wait

# Copy all generated assets into art/raw/ under manifest names
declare -A MAP=(
  [alchemyfloor]=tex_alchemy_floor_strip.png
  [alchemyfloor_b]=tex_alchemy_floor_strip_b.png
  [ballroomfloor]=tex_ballroom_floor_strip.png
  [ballroomfloor_b]=tex_ballroom_floor_strip_b.png
  [coliseumfloor]=tex_coliseum_floor_strip.png
  [coliseumfloor_b]=tex_coliseum_floor_strip_b.png
  [aqueductfloor]=tex_aqueduct_floor_strip.png
  [aqueductfloor_b]=tex_aqueduct_floor_strip_b.png
  [skykeepfloor]=tex_skykeep_floor_strip.png
  [skykeepfloor_b]=tex_skykeep_floor_strip_b.png
  [alchemywall]=tex_alchemy_wall.png
  [ballroomwall]=tex_ballroom_wall.png
  [coliseumwall]=tex_coliseum_wall.png
  [aqueductwall]=tex_aqueduct_wall.png
  [skykeep_far]=bg_skykeep_far.png
  [skykeep_mid]=bg_skykeep_mid.png
  [graveyard_vista]=bg_graveyard_vista.png
  [mural_alchemy]=mural_alchemy.png
  [mural_ballroom]=mural_ballroom.png
  [mural_coliseum]=mural_coliseum.png
  [mural_aqueduct]=mural_aqueduct.png
  [mural_throne]=mural_throne.png
  [mural_catacombs]=mural_catacombs.png
  [wing_icons]=wing_icons_sheet.png
  [alchemy_props]=alchemy_props_sheet.png
  [ballroom_props]=ballroom_props_sheet.png
  [coliseum_props]=coliseum_props_sheet.png
  [aqueduct_props]=aqueduct_props_sheet.png
  [skykeep_props]=skykeep_props_sheet.png
  [hanging_props]=hanging_props_sheet.png
  [alchemist]=alchemist_sheet.png
  [masquerade]=masquerade_sheet.png
  [gladiator]=gladiator_sheet.png
  [oracle]=oracle_sheet.png
  [seraph]=seraph_sheet.png
)

missing=0
for k in "${!MAP[@]}"; do
  if [ -s "/tmp/gen_${k}.png" ]; then
    cp "/tmp/gen_${k}.png" "${RAW_DIR}/${MAP[$k]}"
  else
    echo "MISSING: ${k}"
    missing=$((missing + 1))
  fi
done
echo "WINGS_GEN_DONE (missing=${missing})"
