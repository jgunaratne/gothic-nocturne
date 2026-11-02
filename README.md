# Gothic Nocturne

A 32-bit era, whip-cracking 2.5D side-scrolling action platformer across eighteen
interconnected stages: a moonlit graveyard road rising up the Great Stairway into
a multi-story entrance hall and sunken undercroft, an ancient bioluminescent darkwood alongside a
guardian turtle companion, a pumpkin-lit haunted forest, a snowbound
village under northern lights, the castle ramparts, catacombs, a molten subterranean
dark cave of magma rivers and obsidian pillars, an
ossuary abyss, an arcade gallery of ancient brass automata, a haunted library of phantoms and
biting grimoires, a soaring cathedral of stained glass and waking gargoyles, a
cylindrical clock tower of grinding 3D gears, an emerald-lit alchemy laboratory,
a phantom masquerade ballroom, a torchlit blood coliseum, a sunken subterranean
aqueduct, a moonlit floating garden high in the clouds, and the vaulted
throne hall of the Count. Combines crisp nearest-neighbour 2D sprite combat
with perspective-projected 3D architecture, scanline-projected vista planes,
deep one-point-perspective passages and moonlit lancets cut through the halls'
far walls, grand 3D staircases, mid-depth furnishings,
extruded viaduct bridges, orbiting gear gondolas, chain-drawn ferries,
crumbling masonry, candelabra to whip for hearts and sub-weapons,
skeletons (and red reviving / axe-throwing variants), rising zombies and
ghouls, swooping and fire bats, medusa heads, briar wolves, sporecap myconids,
swooping night-owls, hopping and flaming jack-o'-lanterns, fire-breathing
dragons, the petrifying catoblepas, ice golems, killer snowmen, frost wisps,
magma slimes, boulder-hurling lava golems, swooping cinder imps, shielded plate
knights, teleporting shadow wraiths, bespoke boss relic power-ups, and a 3D boss
arena with spoken Daikon boss voice lines at the end of every stage.

- **Art**: tiles, sprites and backdrops generated with Gemini's image
  model and normalized into crisp pixel art, paired with procedural 32-bit
  pixel-art sheets and 3D surface textures. The hunter's animation clips
  (breathing idle, 8-frame walk, 8-phase whip crack, jump arc with landing
  squash, flinch and death) and the walk / flight / idle cycles, wind-ups and
  attacks of every enemy and boss are cut from **Gemini Omni** video of the
  sprites themselves (`tools/animate_sprites.py`, `tools/animate_cast.py`).
- **Music**: twenty-three full-length tracks (2–3 minutes each) generated with
  **Lyria 3**: a distinct theme for every one of the 18 stages plus title, symphonic orchestral
  boss battle, stage-clear, game-over and ending (plus dedicated tracks for forged wings), streamed on demand and looped
  with crossfades.
- **Voice**: eighteen bespoke male/female villain voice performances (with sinister laughs,
  whispers, coughs, and shouts — one for every stage's guardian boss, plus forged bosses) and a narrated epilogue generated with the
  **Daikon** TTS model (`assets/voice/*.mp3`), triggered as the orchestral boss
  music rises underneath with ducking and a subtitle plate as the hunter enters each boss arena. Sound effects are
  synthesized in-browser with Web Audio (including multi-layered outdoor thunder), or replaced by sampled effects in
  `assets/sfx/` when generated with `tools/generate_sfx.sh` (ElevenLabs Sound
  Effects API, needs `ELEVENLABS_API_KEY`).
- **Engine**: plain HTML5 canvas + ES modules, no build step, no dependencies.
  Native 640×360, full-viewport 16:9 aspect-fit scaled (snapping to exact integer
  multiples when close and using band-limited sharp sub-pixel anti-aliased
  texel sampling at fractional/HiDPI scales to prevent shimmer), composited
  through a WebGL post-process (`src/engine/postfx.js`: half-res 320×180 bloom,
  per-stage colour grading across all 18 realms, phosphor scanlines, film grain,
  convective lower-screen lava heat haze, radial shockwave refraction +
  chromatic dispersion, directional storm-lightning exposure, and damage pulse;
  press F to toggle, `?nofx` to disable) plus native-res 640×360 procedural
  shader layers (`src/engine/fxlayers.js`: storm-lit cloud banks, Arctic aurora
  borealis curtains, moonlit and stained-glass volumetric god-rays with drifting
  dust motes, forked sky lightning bolts, flowing / frozen water and churning
  molten lava pools, living flames on torches, braziers, candelabra, chandeliers
  and fire pools, batched combat comet-sparks, whip-slash star bursts, embers,
  faceted shards and wispy vapour puffs, enemy & boss plasma/beam/miasma/crescent
  attack shaders, expanding arena shockwave rings, and rolling foreground mist).

## Play (Single-Player & Network Multiplayer)

```bash
./serve.sh            # http://<host>:8711/   (HTTP + WebSocket/SSE multiplayer + Castle Forge API)
```

`serve.sh` starts `node server.mjs` (static files, multiplayer, and a proxy for
`/api/forge/*`) alongside `tools/forge_server.py` on port 8712 (plain Python,
uses `.venv` when present so generated pixel art can be processed). Any static
server still works for playing; without the forge API the castle can only be
expanded in local procedural mode.

Opening the URL in multiple browsers or across machines on the network automatically connects every player into the shared **`castle`** realm (`?room=<name>` to join a private room, `?name=<callsign>` to set a Hunter callsign, or `?offline=1` for solo offline mode):

- **Explore Any Region Independently**: Each hunter can roam any of the 18 castle stages simultaneously at their own pace while seeing every other hunter's live position across the **Castle Exploration Map (`M`)** and **9×5 HUD Mini-Map**.
- **Pass By One Another in Real Time**: When two or more hunters enter the same region, directional edge chevrons (`< VESPER 14M`) show which way nearby hunters are, and crossing paths renders each hunter in a distinct pixel-art cloak palette with smooth 60 fps stride/jump/whip interpolation, cooperative whip & sub-weapon combat, floating nameplates, **`G` Salute flares**, and a **Soul-Lantern resonance** spark shimmer as they pass one another.

| Action | Keyboard | Gamepad | Mobile / Touch |
| --- | --- | --- | --- |
| Move / crouch | ← → / ↓ (WASD) | Left stick / D-pad | Virtual 8-way D-pad |
| Jump (hold for height; ↓+jump drops through ledges) | Z, J or Space | A / B | **JUMP** button (hold for height) |
| Left Hand (`Hand_L` / Slot 0 — defaults to Whip) | X or K | X / RB | **L-HAND** button |
| Right Hand (`Hand_R` / Slot 1 — blade, shield, catalyst, ring) | C, V, L or Shift | Y / LB / LT / RT | **R-HAND** button (shown when armed) |
| Hidden Weapon Command Skill (30-frame motion) | `↓ ↘ →` + Hand button | `↓ ↘ →` + Hand button | `↓ ↘ →` + **L-HAND** / **R-HAND** |
| Cross-Hand Combo Resonance (matching Set Tags) | `Hand_L` + `Hand_R` together | `X` + `Y` / `RB` + `LB` | **L-HAND** + **R-HAND** together |
| Dual-Hand Equipment Matrix (`Armory`) | E or I | — | **GEAR** pill or tap HUD `L` / `R` sockets |
| Enter passageways / doorways | ↑ (at arched portal) | ↑ (at arched portal) | D-pad **▲**, portal prompt pill, or tap portal |
| Throw sub-weapon (costs 1 heart) | ↑ + Left Hand | ↑ + Left Hand | **SUB** button (or tap HUD sub-weapon box) |
| Castle Exploration Map (live location & fast travel) | M or Tab | Back / Select / View | **MAP** pill or tap HUD Mini-Map (tap rooms to inspect / warp) |
| Expand the Castle (propose a new wing) | P, or the title menu | title menu | **FORGE** pill or tap **EXPAND THE CASTLE** (opens OS keyboard) |
| Salute / greet nearby hunters | G | — | **SALUTE** pill |
| Edit Hunter Callsign (on Title / Map / Pause) | C | — | **NAME** pill or tap online status line |
| Pause / start | Enter or Esc | Start | **PAUSE** / **START** pill (auto-pauses on background) |
| Mute | N or U | Right stick click (R3) | **SOUND** pill |
| Toggle shaders (bloom, grading, scanlines) | F | Left stick click (L3) | **FX ON** pill (**FULL** toggles fullscreen) |

Whip candelabra for hearts, money, and sub-weapons (dagger, axe, holy water).
Breakable blocks hide meat and gold. Spike pits hurt; bottomless pits kill.
Defeat each stage's boss and claim the orb to march into the next stage.

## Castle Exploration Map & Interconnected Regions

All eighteen stages fit together as an interlocking **72×27 architectural cell grid** (`672` cells across multi-story galleries, vertical tower shafts, diagonal grand stairways, sunken undercrofts, cobalt halls, crimson boss chambers, emerald-cyan Sanctuaries, and amber-gold secret vaults, joined by `36` doorways including `18` Boss-Relic Golden Loop shortcuts):

- **Press `M` (or `Tab` / Gamepad Select) Anytime**: Opens the full-screen **Castle Exploration Map** during gameplay, highlighting explored cells (`MAP XX% · RELICS XX/18 · VESSELS XX/18`) alongside a pulsing **`YOU` location beacon** projected 1:1 (`20×5` tiles = `640×160 px` per map cell via `src/game/grid_composer.js` & `src/game/level_schema.js`) so moving 1 screen left/right or 1 story up/down on screen always moves 1 cell on both the Castle Map and **9×5 HUD Mini-Map radar**.
- **Physical Passage Gateways (`↑`)**: Carved Gothic portals inside every stage (framed by safe 9-tile flat buffers) connect directly into neighbouring regions on the map — carrying health, hearts, sub-weapon, lives, and score seamlessly across doorways. Shortcut doorways are sealed by **ability-gated runic barriers** that open once their corresponding Boss Relic is claimed (*Night Wings*, *Briar Bark*, *Lantern Flame*, *Frost Aegis*, *Iron Greaves*, *Soul Harvest*, *Clockwork Heart*, and each guardian's relic).
- **Sanctuary Waystones & Fast Travel**: Walking past a region's carved **Sanctuary Waystone** mends `+4 HP` and attunes that Sanctuary so the hunter can warp between discovered Sanctuaries from the `M` map.
- **18 Hidden Ancient Life Vessels**: Each region hides one golden **Ancient Vessel** inside a sunken crypt vault or atop a high stone balcony reachable only with *Night Wings* Double Jump, permanently granting **`+1 Max HP`** and **`+2 Starting Hearts`**.

## Character Leveling & Adaptive Curve System

The hunter begins at **Level 1** (`0/100 EXP`, up to **Level 99**) and earns experience points whenever enemies and stage bosses are vanquished (`src/game/progression.js`), persisted in `localStorage` (`gothic.progression.v1`):

1. **Phase 1 — Quadratic Escalation (Levels 1–18)**: Early-to-mid progression scales quadratically via `EXP_req = 25 * (L + 1)^2 + 25 * (L + 1) - 50` (`100 -> 250 -> 450 -> 700 -> ... -> 9,450 EXP`), preventing early-stage fodder from over-accelerating ranks.
2. **Phase 2 — Linear Cap Shift (Levels 19–99)**: Once the hunter enters late-game and open-castle routing (`Lv 19+`), `EXP_req` shifts to a flat `10,000 EXP` per level so progression pacing is driven by region rank and enemy tier rather than runaway math curves.
3. **Dynamic Return Formula (Anti-Grind & Rubber-Band Multiplier)**: Each castle region and enemy species carries a natural **Enemy Rank** (`Rank 01` in the Graveyard Road up to `Rank 23+` in the Throne Hall, shown on the HUD and Castle Exploration Map). Actual yield scales by `Level_Delta = Player_Level - Enemy_Level`:
   - **Over-leveled (`Delta > 0`)**: `Base_EXP * (0.66 ^ Delta)`, aggressively diminishing grind yield down to a minimum floor of `1 EXP`.
   - **Under-leveled (`Delta < 0`)**: `Base_EXP * min(3.5, 1.25 ^ |Delta|)`, granting an intentional rubber-band catch-up bonus when sequence-breaking into higher-rank castle wings.
4. **Stat Growth & Level-Up Mend**: Each rank increases **Strength (`+1 STR/lv`)**, **Attack Power** (whip, sub-weapons, and fire pools), **Max Vitality**, and **Defense** without trivializing late-game brutes or bosses, accompanied by a subtle `LV` indicator, gentle chime, and mid-combat `+3 HP` / `+2 Hearts` mend.

## Modular Dual-Hand Equipment Matrix

Across all eighteen stages, the hunter can claim signature weapons from carved **Arsenal Pedestals** (`1` per region) and rare drops from themed castle monsters (`src/game/weapons.js`, `src/game/armory_ui.js`), pressing **`E` / `I`** (or tapping **GEAR** / HUD `L` & `R` sockets) to open the **Dual-Hand Equipment Matrix**:

1. **Ambidextrous Dual-Slot Handler (`Hand_L` & `Hand_R`)**: Both hands act as generic weapon sockets bound to independent buttons (`X`/`K` for `Hand_L`, `C`/`V`/`L`/`Shift` for `Hand_R`). Initiating an off-hand strike during the other hand's recovery frames triggers **Parallel Interruption**, and equipping a **Two-Handed (`isTwoHanded`)** weapon in `Hand_L` automatically locks and visually hides `Hand_R`.
2. **Weapon Classification Matrix (20 Weapons)**:
   - **Light Blade (1H)**: Linear forward thrust, full movement allowed, instant startup (*Quicksilver Estoc*, *Glacial Stiletto*, *Fulgurite Uchigatana*).
   - **Standard Blade (1H)**: Forward overhead arc with combat step & free jump (*Crypt Falchion*, *Sanctified Mace*, *Cinder Shamshir*).
   - **Heavy Blade (2H)**: Massive `180°` overhead-to-floor sweep, rooted to ground, heavy knockback (*Executioner Greatsword*, *Magma Maul*, *Voidreaver Scythe*).
   - **Brawler / Fist (1H)**: Short horizontal multi-hit blitz with forward lunge; ignores frontal shield guards (*Spiked Caestus*, *Galvanic Talons*).
   - **Boomerang / Projectile (1H)**: Outward loop & homing return with full movement and outbound + inbound double-hit potential (*Halcyon Chakram*, *Umbral Glaive-Ring*).
   - **Shield & Catalyst (1H)**: Hold-to-guard heater/tower shields (*Heraldic Buckler*, *Salamander Shield*, *Glacial Aegis*) that block frontal shots & halve contact hits, paired with arcane spell foci (*Pyre Tome*, *Boreal Phylactery*, *Abyssal Grimoire*) and starter *Hunter's Lash*.
3. **30-Frame Input Buffer & Cross-Hand Combo Resonance**: Inputting `[Down, Down-Forward, Forward]` (`↓ ↘ →`) + Hand button within a 30-frame buffer fires that weapon's unique **Command Skill** (*Fleche Lunge*, *Guillotine Arc*, *Lightning Blitz*, *Soul Harvest Arc*, …). Pressing `Hand_L + Hand_R` simultaneously while both hands share a **Set Tag** (*Infernal*, *Glacial*, *Consecrated*, *Knightly*, *Duelist*, *Tempest*, *Abyssal*) unleashes a **Cross-Hand Combo Resonance** detonation and protective ward.
4. **Stat Deficit Gate & Physical / Elemental Resistance Matrix**:
   - **Stat Deficit Gate**: `Final_Damage = Base_Damage + (Player_Strength * Scaling * (Player_Strength < Req_Strength ? 0.5 : 1.0))` — under-statted endgame weapons remain usable at a `0.5x` scaling penalty until the hunter's `STR` (from Character Levels, Boss Relics, and Ancient Vessels) meets `Req_Strength`.
   - **Damage Types & Resistances**: Every weapon pairs a Physical type (**Cut** or **Blunt**) with an optional Elemental type (**Fire**, **Frost**, **Volt**, **Holy**, **Void**) evaluated against per-species multipliers (e.g., armored skeletons resist `Cut` `0.35×` while shattering to `Blunt` `2.0×` and `Holy` `1.75×`; magma brutes resist `Fire` `0.25×` and crack to `Frost` `2.0×`).

| # | Stage | Theme | Signature 2.5D set-pieces & hazards | Boss | Boss Relic Power-Up |
| --- | --- | --- | --- | --- | --- |
| 1 | The Graveyard Road | moonlit moor → Great Stairway, Entrance Hall & basement | 3D rotating keep, moat viaduct, 3-story Entrance Hall & sunken undercroft | The Great Bat | **Night Wings** (Double Jump) |
| 2 | The Darkwood | 3D elder colonnade & bioluminescent stream | guardian turtle ally (shell-spin combat), canopy terraces, root viaducts, log ferry | The Briar King | **Briar Bark** (+1 HP / 8s Regen) |
| 3 | The Jack-o'-Lantern | 3D forest colonnade & swaying lanterns | crumbling slabs, ravine viaducts, gorge plunge shaft, canopy galleries | The Great Jack | **Lantern Flame** (+1 Whip Damage & Ember Sparks) |
| 4 | The Frozen Yule | aurora sky & shimmering 3D ice lake | arched lake causeways, multi-deck snow-gable galleries, chain ice ferry | Devil Santa | **Frost Aegis** (+45% Mercy Invuln & -50% Knockback) |
| 5 | The Ramparts | high curtain walls over 3D torchlit bailey | open viaduct arches, watchtower climbs, diagonal siege lifts, plate knights | The Bone Captain | **Iron Greaves** (+15% Speed & -50% Hazard Damage) |
| 6 | The Catacombs | vaulted skull-niche crypts | sunken crypt undercroft loops, crumbling slabs, shadow wraiths, vault ferry | The Phantom Reaper | **Soul Harvest** (Every 6 Kills: +1 HP & +1 Heart) |
| 7 | The Dark Cave | molten obsidian caverns & magma abyss | WebGL lava basins, deep plunge shafts, magma slimes, lava golems, cinder imps | The Cinder Queen | **Magma Heart** (-65% Lava/Fire Dmg & +1 Sub-Weapon Dmg) |
| 8 | The Ossuary | broken colonnade over 3D spectral abyss | abyssal viaduct spans, multi-tier bone galleries, spectral chain ferry | The Gorgon Queen | **Aegis Mirror** (Stone Immunity & -15% Damage) |
| 9 | The Arcade | gilded gallery of ancient automata | 3-tier promenade stacks, grand stairways, clockwork annex cog-wheel | The Brass Automaton | **Clockwork Heart** (Every 2nd Throw Free & Loot Magnet) |
| 10 | The Library | towering bookshelf walls & reading-room apse | 3-story reading stacks, spiral ladder tower, phantoms, biting grimoires | The Spectral Archivist | **Forbidden Tome** (+28% Extended Whip Reach) |
| 11 | The Cathedral | 26-row nave, clerestory lancets & rose window | belfry tower climb, clerestory balconies, waking gargoyles, organ-loft descent | The Gargoyle Archon | **Sanctuary Halo** (20 Max HP & Stronger Meat Healing) |
| 12 | The Clock Tower | cylindrical 3D shaft & extruded brass gears | soaring gear-shaft climbs, orbiting 3D gear-wheel gondolas, counterweight lift | The Reaper Lord | **Chrono Pendulum** (+25% Faster Whip & Slower Enemy Shots) |
| 13 | The Throne Hall | crimson rib-vaulted nave & chandeliers | grand ceremonial stairways, 3-tier clerestory nave, rose-window & organ dais | The Count | **Crimson Mantle** (Piercing Crimson Flame Wave on Whip) |
| 14 | The Alchemy Lab | emerald-lit retort halls & alembic vaults | multi-story reagent galleries, sunken alembic undercroft, bubbling vats, ring runs | The Grand Alchemist | **Philosopher Vial** (+2 Max HP & +3 Starting Hearts) |
| 15 | The Phantom Ballroom | rose-velvet grand salon & chandelier promenade | diagonal grand stairways, 3-tier waltz balconies, crumbling mezzanine, salon ferry | The Masquerade Duke | **Masquerade Mask** (+35% Mercy Invuln & +2 Max HP) |
| 16 | The Blood Coliseum | brazen gladiatorial tiers & spiked arena | 3-deck spectator galleries, iron-ring vault runs, spiked pit gauntlets | The Iron Gladiator | **Champion Crest** (+1 Whip Damage & +10% Speed) |
| 17 | The Sunken Aqueduct | subterranean cisterns & cerulean water channels | flooded undercroft loops, deep plunge shafts, arched cistern viaducts, ferry | The Drowned Oracle | **Tidal Talisman** (+1 Sub-Weapon Dmg & +2 Max HP) |
| 18 | The Floating Garden | high cloud-sea colonnades & aurora sky | moonlit sky viaducts, 3-story terrace stacks, spiral tower climbs, wind ferries | The Moonlit Seraph | **Celestial Plume** (+12% Speed & +3 Starting Hearts) |

The catoblepas breathes a petrifying cloud: touched by it, the hunter turns to
stone for a moment — mash any button to break free sooner.

Walkable terrain stays razor-sharp on the `z = 0` collision plane while receding
3D top decks, perspective step faces, 3D viaduct arches, contact shadows,
vaulted Gothic halls, cylindrical clockwork shafts, and auto-fading foreground
pillars frame the action in depth (`src/game/stage3d.js` + `src/game/level.js`).
Every 3D polygon is texture-mapped with nearest-neighbour pixel-art textures
(`src/game/tex3d.js` — `CanvasPattern.setTransform(DOMMatrix)` + perspective Z
subdivision, directional Lambert shading, and atmospheric depth fog) built from
each stage's PNG tilesets alongside bespoke pixel-art procedural materials
(lathe-turned riveted brass/iron gears, ashlar masonry, slate conical roofs,
carved organ cases, and tufted velvet).

Inside the halls the far wall is never flat: each group of six wall bays plans
its own depth set-pieces around the doorways, shrines and terrain in front of it
(`Stage3D.bayKind` / `bayFooting`), so every indoor stage gets

- **deep perspective passages** — one-point-perspective arcaded corridors cut
  through the far wall (z 200 → 600) with receding transverse ribs, fog-to-black
  falloff and torches at the far end (crypt passages sink toward deeper vaults,
  cave tunnels glow amber), clipped to their arch so they only show through the
  opening;
- **open lancets onto the night** — unglazed windows (castle halls only) that
  look out on the screen-locked moonlit sky, drifting shader clouds and far
  ridges behind iron Y-tracery, parallaxing against the bricks as you walk, with
  cool moonlight pools on the hall floor;
- **a grand 3D staircase** — a texture-mapped flight (carpet runner in carpeted
  halls) rising to a balustraded landing and its own doorway in the far wall;
- **a turning brass orrery** in the Library and Arcade;
- **monumental 2-bay 3D recessed murals & tapestries** — `512×288` non-repeating
  pixel-art frescoes and woven tapestries (`mural_alchemy..mural_catacombs`) recessed
  behind carved 3D stone/marble jambs, entablature cornices and gallery lighting;
- **wing-specific 3D hall & vista structures** — overhead riveted alchemy distillation
  gantries with meshing 3D cogwheels, marble ballroom opera galleries, coliseum
  travertine vomitoria and blazing arena braziers, multi-tier subterranean 3D
  Roman aqueduct viaducts rising out of cistern waters, and receding 3D cloud-sea
  marble skykeep sanctums alongside ultra-wide `1280×360`–`1920×360` outdoor vistas;
- **mid-depth furnishings** (z ≈ 90–104) — pews, bookcases, automata cabinets,
  alembics, gilded mirrors, gladiatorial trophies, canal sluice wheels, astrolabes,
  angel statues, candle pillars, stalagmites and 3D sarcophagi standing on the
  receding floor between the play plane and the wall, fogged, darkened and
  grounded by contact shadows so the crisp play layer stays dominant.

Outdoors, small 3D mausoleums with gabled slate roofs and lit lancets stand on
the moor behind the Graveyard Road's cemetery fence. Background scenery (tree
colonnades, fences, tombs) is planted on the true ground (`Level.groundRow`),
never on an upper gallery ledge, viaduct span or ferry gap.

All 18 built-in stages (`380–760` tiles / `19–38` screens wide) are compiled directly in 2D tile space (`20×5` tiles per map cell) from `src/game/map_layout.js` via `src/game/grid_composer.js` (`src/game/level_data.js` + `src/game/stages.js`) using architectural room archetypes (Opening Parvis, Portal Vestibule, Sanctuary Chapel, stepped Armory Dais, Skylight Atrium, Vault Antechamber, Grand Staircase, Switchback Tower Shaft, Colonnade Nave, Twin-Balcony Amphitheater, Sunken Hazard Court, Viaduct Promenade, and 4-cell Pre-Boss Accordion + Save Sanctum), while Castle Forge wings build from `src/game/builder.js` prefabs.

## Expand the Castle (Castle Forge)

The title screen's second entry, **EXPAND THE CASTLE** (also `P` on the castle
map), lets the player *propose* a new wing — "Abandoned Village", "Sunken
Cistern", "Alchemist's Observatory"… — and the castle raises it:

1. **Blueprint** — Gemini (`generate text`) designs the wing as strict JSON:
   name, subtitle, which of the built-in base realms it inherits (3D vistas,
   grading, enemy feel), weather, palette, 12–20 prefab segments for
   `StageBuilder`, enemy placements, a new boss (name, look, spoken line) built
   on an existing boss behaviour, a relic with one of five generic effects, art
   prompts, a Lyria prompt and an ambience prompt. The client always ships a
   deterministic procedural blueprint as the fallback, so a bad draft never
   blocks the forge.
2. **Art** — Gempix paints the wing's terrain cross-section strip, a seamless
   wall (indoor) or a parallax skyline (outdoor), four themed props, a map
   emblem and, for single-row boss sheets, a new boss sprite sheet; everything
   runs through the same `process_assets.py` pipeline as the hand-made art
   (chroma key, palette, seams, surface alignment, atlas packing). Whatever is
   missing is inherited from the base realm and hue-shifted on the client.
3. **Music** — a full-length Lyria 3 stage theme, streamed and looped like the
   others. **Voice** — a Daikon performance of the boss's approach line,
   ducked under the boss theme with its subtitle plate. **Ambience** — an
   optional ElevenLabs loop under the music (needs `ELEVENLABS_API_KEY`).
4. **The castle expands** — the wing's rooms are placed deterministically in
   free cells next to a fitting neighbour on the 72×27 castle grid, a passage
   gateway appears inside that neighbouring stage, the new region gets a
   Sanctuary, a hidden Ancient Vessel, a boss chamber and a relic, and the map
   shows the ghost rooms materialising while the forge works. Press `Esc` to
   keep playing; a ticker tracks the forge and a banner announces the new wing.

Raised wings live in `assets/forge/<key>/` with a registry in
`assets/forge/stages.json`, so every player on that server gets them at boot
(up to 12). Offline (plain static hosting) the forge still works in local
procedural mode and remembers wings in `localStorage`.

```
POST /api/forge              {name, description, fallback}  -> job
GET  /api/forge/job/<id>     steps, blueprint, registry entry
GET  /api/forge/stages       raised wings
GET  /api/forge/health       capabilities (generate CLI, pipeline, ffmpeg, ElevenLabs)

.venv/bin/python tools/forge_server.py --list            # raised wings and their stage numbers
.venv/bin/python tools/forge_server.py --remove <key>    # tear a wing down (registry, assets, job files)
```

Removing a wing shifts the stage numbers of the wings raised after it (and their
bits in saved progress), so prefer tearing down the newest one.

## Difficulty

Chosen on the "Choose your fate" screen after the title (remembered in
`localStorage`, overridable with `?difficulty=easy|normal|hard`):

| | Lives | Hearts | Timer | Damage taken | Enemy HP | Spawn pressure | Boss | Score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Easy** | 7 | 15 | 1000 s | ×0.4 (most hits = 1) | ×0.6 | much slower, max 1 | slower, phase 2 at 30 % | ×0.5 |
| **Normal** | 3 | 5 | 540 s | ×1 | ×1 | standard, max 3 | standard, phase 2 at 50 % | ×1 |
| **Hard** | 2 | 3 | 390 s | ×1.5 | ×1.5 | faster, max 4 | faster, phase 2 at 65 % | ×2 |

Easy also hits 1.5× harder with whip and sub-weapons, grants longer
invincibility and softer knockback after a hit, and forgives bottomless pits:
you climb back out at your last solid footing for a little damage instead of
losing a life. One-hit fodder (bats, zombies, medusa heads) stays one-hit on
every setting; skeletons, brutes and bosses scale. Presets live in
`src/engine/constants.js`.

## Layout

```
index.html            canvas shell
src/main.js           boot, scaling, fixed-step loop, title/pause/clear/game-over
src/engine/           input (keyboard, gamepad, touch, scripted), touch (mobile
                      portrait deck, landscape overlay, canvas tap & IME proxy),
                      assets, audio, font, particles, camera, constants
src/game/             level grid + 2.5D mechanics/tiles, stage3d (perspective
                      projection, vistas, vaulted halls, 3D gears & boss arenas),
                      tex3d (pixel-art 3D polygon texture rasterizer & bank),
                      builder (Forge prefabs + themes), grid_composer (20x5 tile
                      per-cell 2D architectural stage compiler), map_layout
                      (72x27 Castle Map topology & doors), level_schema (1:1 2D
                      grid coordinate lookup & fog-of-war), stages, level_data,
                      parallax, entities, player, hero_anim (hunter clips,
                      squash/stretch, whip timeline), anim_clips (generated
                      clip frames for enemies/bosses), ally (guardian turtle),
                      progression (Adaptive Curve leveling & EXP system),
                      weapons (Dual-Hand Equipment Matrix, 30-frame input buffer,
                      Stat Deficit Gate & Cut/Blunt + Elemental damage engine),
                      armory_ui (Armory screen & in-stage Arsenal Pedestals),
                      relics (boss power-ups), enemies, boss (Reaper), bosses
                      forest_assets (Darkwood pixel art), castle_wings_assets
                      (Alchemy, Ballroom, Coliseum, Aqueduct & Floating Garden
                      pixel art), objects
                      (candles/items/projectiles/fire), exploration (Sanctuary
                      Waystones, Passage Gateways & Ancient Vessels), world
                      (combat, scripting, draw order), castlemap (interlocking
                      72x27 cell map, forge placement & HUD mini-map), hud,
                      forge (blueprints, validation, wing registration, API
                      client), forge_ui (proposal / forging / reveal screens)
assets/               engine-ready PNGs + atlas.json, music/*.mp3, voice/*.mp3, sfx/*.mp3,
                      forge/<key>/ (raised wings) + forge/stages.json (registry)
art/raw/              untouched generations (provenance)   art/PROMPTS.md
art/raw/clips/        frame sheets + frames.json cut from the Omni clips (.mp4, local only)
tools/                forge_server.py (game + Castle Forge API), process_assets.py
                      (pipeline), asset_manifest.json, import_raw.py,
                      animate_sprites.py (video -> sprite clips), animate_cast.py
                      (batch: every enemy / boss clip),
                      generate_wings.sh, generate_music.sh, generate_voices.sh,
                      screenshot.sh, smoke_test.py
```

## Asset pipeline

```bash
python3 -m venv .venv && .venv/bin/pip install pillow numpy
.venv/bin/python tools/process_assets.py --preview     # art/raw -> assets/
```

Each entry in `tools/asset_manifest.json` declares how a raw generation becomes
an asset: chroma-key the flat green, premultiplied box downscale, hard alpha,
median-cut palette (no dither), then either seam repair (`blend` for textures,
`mirror` for parallax layers), terrain-strip surface alignment, or sprite-sheet
segmentation (row bands → column runs → per-frame anchors) packed into an
atlas. Previews land in `art/work/`.

### Animating sprites with video (Gemini Omni)

Multi-frame animations come from short video clips rather than hand-posed
sheets, so the in-betweens, arm swing, hair and whip follow-through are real
motion. `tools/animate_sprites.py` cuts a reference pose out of its raw sheet,
puts it on flat green and hands it to the Omni video model (image-to-video,
locked camera, one action per 10 s clip); the frames come back through the same
chroma-key / box-downscale steps as the hand-made art, with the scale calibrated
against the atlas, the colours matched and locked to the sheet's palette,
detached specks (impact flashes, dropped props) removed and every frame anchored
at the feet / body centre:

```bash
.venv/bin/python tools/animate_sprites.py hero_walk8 --sheet hero --frame idle \
    --action walk --subject "vampire hunter" --select period --count 8 --names walk
.venv/bin/python tools/animate_sprites.py hero_whip --sheet hero --frame idle \
    --action whip --stop-after contact        # pick frames from art/work/clips/hero_whip/contact.png
.venv/bin/python tools/animate_sprites.py hero_whip --sheet hero --frame idle \
    --pick 34,46,58,67,72,76,93,116 --names whip
.venv/bin/python tools/animate_sprites.py hero_jump --sheet hero --frame idle --select jump
.venv/bin/python tools/process_assets.py --only hero_whip    # type "clip" in the manifest
```

Frame selection: `--select period` autocorrelates the silhouette to find a loop
(walk, idle breathing), `--select motion` spaces one-shot frames by equal
cumulative motion, `--select jump` reads the feet trajectory (crouch, rise,
apex, fall, land, recover), and `--pick` takes explicit frame indices. The
generated `<name>_sheet.png` + `<name>_frames.json` (frame rects, anchors, the
prompt and the exact picks) live in `art/raw/clips/` and are what the
manifest's `clip` entries copy into `assets/`; the `.mp4` clips themselves stay
next to them locally but are git-ignored (~3 MB each).

The hunter's clips (`hero_idle`, `hero_fidget`, `hero_walk8`, `hero_whip`,
`hero_cwhip`, `hero_jump`, `hero_turn`, `hero_hurt`) are all optional:
`src/game/hero_anim.js` picks the frame for the local hunter and the network
hunters alike and falls back to the classic `hero.png` poses for any clip that
is missing. The whip is the one place frames are not enough — a crack is a
travelling wave, not a pose — so its timeline is wind-up frames → the
extended-arm body with a **procedural lash flying out** (S-wave, 4 ticks) →
the crack on the exact tick the hit box goes live (`whipActive[0]`: white tip
flash, sparks, `crack` sfx, 1 px punch) → overshoot and a decaying tip wave →
the tip dropping → the painted slack frames. On top of the frames the engine
adds the timing the sheets cannot: landing squash (20 %) and take-off stretch,
a lean into acceleration and stops, a skid frame on direction changes, a
half-crouch in-between, footstep sound + dust on the boot-contact frames, an
idle fidget after five still seconds, and hit-stop when the whip connects
(`world.hitStop`: 5 ticks on an enemy, 7 on a boss).
`tools/anim_strip.html` renders every hunter animation tick by tick on one
canvas for checking (`http://localhost:8711/tools/anim_strip.html`).

Enemies, bosses and the turtle get the same treatment without touching their
state machines. `tools/animate_cast.py` holds one job per `<sheet>_<family>`
clip (the family is the frame family the game already names: `walk`, `fly`,
`float`, `idle`, `throw`, `windup`, `swing`, `cast`, …) and
`src/game/anim_clips.js` swaps the clip frame in at draw time inside
`Enemy.drawSprite()`: loops run on the world clock or on distance travelled
(walkers never slide, a standing walker snaps back to its contact pose),
one-shots play from the moment their family first appears and hold the last
frame, and the clock freezes with hit-stop. A sheet without a clip draws exactly
as before, so the cast can be regenerated or extended one clip at a time:

```bash
.venv/bin/python tools/animate_cast.py --list
.venv/bin/python tools/animate_cast.py --only skeleton --only boss   # cached clips are reused
```

## Testing aids

Headless screenshots (needs `serve.sh` running and Chrome):

```bash
tools/screenshot.sh "demo=1&skip=600" /tmp/shot.png
```

URL parameters: `demo=1` drives the hunter with a scripted input loop,
`skip=N` pre-simulates N fixed steps before the first frame, `at=<column>`
teleports to a tile column, `boss=1` teleports to the boss vestibule,
`bosshp=N` weakens the boss, `relics=all` (or `relics=graveyard,darkcave`)
enables boss power-ups, `lightning=1` triggers an immediate outdoor storm bolt,
`ending=<seconds>` jumps into the ending sequence,
`difficulty=easy|normal|hard` presets the difficulty, `stage=1..N` picks the
stage (forged wings follow the eighteen built-in ones),
`screen=play|armory|map|difficulty|stageselect|forge|clear|ending` opens a screen directly,
`forge=<name>[&forgedesc=<text>][&local=1]` proposes a wing immediately
(`local=1` forces the offline procedural forge),
`discovered=all`, `vessels=all`, and `explored=all` unlock map exploration state,
`weapons=all`, `handL=<id>`, `handR=<id>`, `str=<N>`, and `resetarmory=1` configure the Dual-Hand Equipment Matrix,
`level=1..99`, `exp=N`, and `resetlevel=1` override or reset hunter level & EXP,
`touch=1` (or `touch=0`) forces the mobile touch controller UI on or off, and `nofx`
disables the shader post-process.

`PORT=8712 .venv/bin/python tools/smoke_test.py 20` loads every screen and stage
(18 built-in + forged) in headless Chrome and fails on uncaught errors.
