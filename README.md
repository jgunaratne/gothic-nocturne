# Gothic Nocturne

A 32-bit era, whip-cracking 2.5D side-scrolling action platformer across thirteen
stages: a moonlit graveyard road, an ancient bioluminescent darkwood alongside a
guardian turtle companion, a pumpkin-lit haunted forest, a snowbound
village under northern lights, the castle ramparts, catacombs, a molten subterranean
dark cave of magma rivers and obsidian pillars, an
ossuary abyss, an arcade gallery of ancient brass automata, a haunted library of phantoms and
biting grimoires, a soaring cathedral of stained glass and waking gargoyles, a
cylindrical clock tower of grinding 3D gears, and the vaulted
throne hall of the Count. Combines crisp nearest-neighbour 2D sprite combat
with perspective-projected 3D architecture, scanline-projected vista planes,
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
  pixel-art sheets and 3D surface textures.
- **Music**: seventeen full-length tracks (2–3 minutes each) generated with
  **Lyria 3**: a distinct theme for every stage plus title, symphonic orchestral
  boss battle, stage-clear, game-over and ending, streamed on demand and looped
  with crossfades.
- **Voice**: thirteen bespoke male/female villain voice performances (with sinister laughs,
  whispers, coughs, and shouts) plus a narrated epilogue generated with the
  **Daikon** TTS model (`assets/voice/*.mp3`), triggered as the orchestral boss
  music rises underneath with ducking and a subtitle plate as the hunter enters each boss arena. Sound effects are
  synthesized in-browser with Web Audio (including multi-layered outdoor thunder), or replaced by sampled effects in
  `assets/sfx/` when generated with `tools/generate_sfx.sh` (ElevenLabs Sound
  Effects API, needs `ELEVENLABS_API_KEY`).
- **Engine**: plain HTML5 canvas + ES modules, no build step, no dependencies.
  Native 640×360, integer-scaled with nearest-neighbour sampling, composited
  through a WebGL post-process (`src/engine/postfx.js`: quarter-res bloom,
  per-stage colour grading, phosphor scanlines, film grain, directional storm-lightning
  exposure and damage pulse; press F to toggle, `?nofx` to disable) plus
  procedural shader layers (`src/engine/fxlayers.js`: storm-lit cloud banks,
  forked sky lightning bolts on outdoor stages, flowing / frozen water and churning
  molten lava pools, living flames on torches, braziers, candelabra, chandeliers
  and fire pools, and rolling foreground mist).

## Play

```bash
./serve.sh            # http://<host>:8711/   (ES modules need HTTP)
```

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move / crouch | ← → / ↓ (WASD) | Left stick / D-pad |
| Jump (hold for height; ↓+jump drops through ledges) | Z, J or Space | A / B |
| Whip (also while crouching or airborne) | X or K | X / Y / RB / RT |
| Throw sub-weapon (costs 1 heart) | ↑ + whip | ↑ + attack |
| Pause / start | Enter or Esc | Start |
| Mute | M | Back / Select / View |
| Toggle shaders (bloom, grading, scanlines) | F | Left stick click (L3) |

Whip candelabra for hearts, money, and sub-weapons (dagger, axe, holy water).
Breakable blocks hide meat and gold. Spike pits hurt; bottomless pits kill.
Defeat each stage's boss and claim the orb to march into the next stage.

## Stages

The stages form one connected **castle map** (shown after the difficulty
choice): regions are laid out as rooms on a cell grid joined by passages, and a
any region can be entered at any time; passages show the natural route and
light up as neighbouring regions are cleared. The Graveyard Road
is the entrance; the woods lie to the west, the catacombs beneath, the ramparts
and the east-wing Arcade lead up to the Clock Tower and finally the Throne Hall.
Clearing a stage carries score, lives, hearts and sub-weapon back to the map;
clearing the Throne Hall plays the ending.

| # | Stage | Theme | Signature 2.5D set-pieces & hazards | Boss | Boss Relic Power-Up |
| --- | --- | --- | --- | --- | --- |
| 1 | The Graveyard Road | moonlit moor → barbican gate & hall | 3D rotating distant keep, moat drawbridge, outdoor lightning & thunder | The Great Bat | **Night Wings** (Double Jump) |
| 2 | The Darkwood | 3D elder colonnade & bioluminescent stream | guardian turtle ally (shell-spin combat), root viaducts, log ferry | The Briar King | **Briar Bark** (+1 HP / 8s Regen) |
| 3 | The Jack-o'-Lantern | 3D forest colonnade & swaying lanterns | crumbling slabs, ravine trestle bridges, gorge ferry, canopy split route | The Great Jack | **Lantern Flame** (+1 Whip Damage & Ember Sparks) |
| 4 | The Frozen Yule | aurora sky & shimmering 3D ice lake | arched lake causeways, chain ice ferry, snow-gable split route | Devil Santa | **Frost Aegis** (+45% Mercy Invuln & -50% Knockback) |
| 5 | The Ramparts | high curtain walls over 3D torchlit bailey | open viaduct arches, diagonal siege lifts, shielded plate knights | The Bone Captain | **Iron Greaves** (+15% Speed & -50% Hazard Damage) |
| 6 | The Catacombs | vaulted skull-niche crypts | crumbling crypt slabs, shadow wraiths, burial gallery, vault ferry | The Phantom Reaper | **Soul Harvest** (Every 6 Kills: +1 HP & +1 Heart) |
| 7 | The Dark Cave | molten obsidian caverns & magma abyss | WebGL lava basins, stepping basalt islands, magma slimes, lava golems, cinder imps | The Cinder Queen | **Magma Heart** (-65% Lava/Fire Dmg & +1 Sub-Weapon Dmg) |
| 8 | The Ossuary | broken colonnade over 3D spectral abyss | abyssal viaduct spans, spectral chain ferry, reliquary split route | The Gorgon Queen | **Aegis Mirror** (Stone Immunity & -15% Damage) |
| 9 | The Arcade | gilded gallery of ancient automata | gallery lifts, balcony split route, clockwork annex cog-wheel | The Brass Automaton | **Clockwork Heart** (Every 2nd Throw Free & Loot Magnet) |
| 10 | The Library | towering bookshelf walls & reading-room apse | phantoms that phase through the whip, biting grimoires, page storms | The Spectral Archivist | **Forbidden Tome** (+28% Extended Whip Reach) |
| 11 | The Cathedral | 26-row nave, clerestory lancets & rose window | gargoyles that wake from the cornices, plate knights, organ-loft descent | The Gargoyle Archon | **Sanctuary Halo** (20 Max HP & Stronger Meat Healing) |
| 12 | The Clock Tower | cylindrical 3D shaft & extruded brass gears | orbiting 3D gear-wheel gondolas, counterweight shaft lift | The Reaper Lord | **Chrono Pendulum** (+25% Faster Whip & Slower Enemy Shots) |
| 13 | The Throne Hall | crimson rib-vaulted nave & chandeliers | clerestory split route, sanctuary lift, rose-window & pipe-organ dais | The Count | **Crimson Mantle** (Piercing Crimson Flame Wave on Whip) |

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

Stage 1 is hand-built (`src/game/level_data.js`); stages 2–13 are composed
from prefab segments by `src/game/builder.js` (`flat`, `vistaBridge`, `lavaRun`,
`crumbleRun`, `ferryGap`, `splitRoute`, `gearWheel`, `liftShaft`, `descent`,
`hiddenVault`, `swingRun`, `vestibule`, `gap`,
`spikeRun`, `stepUp/stepDown`, `climb`, `corridor`, `blocks`, `arena`) in
`src/game/stages.js`, so adding a stage is a dozen lines.

## Difficulty

Chosen on the "Choose your fate" screen after the title (remembered in
`localStorage`, overridable with `?difficulty=easy|normal|hard`):

| | Lives | Hearts | Timer | Damage taken | Enemy HP | Spawn pressure | Boss | Score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Easy** | 7 | 15 | 900 s | ×0.4 (most hits = 1) | ×0.6 | much slower, max 1 | slower, phase 2 at 30 % | ×0.5 |
| **Normal** | 3 | 5 | 420 s | ×1 | ×1 | standard, max 3 | standard, phase 2 at 50 % | ×1 |
| **Hard** | 2 | 3 | 300 s | ×1.5 | ×1.5 | faster, max 4 | faster, phase 2 at 65 % | ×2 |

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
src/engine/           input (keyboard, gamepad, scripted), assets, audio, font,
                      particles, camera, constants
src/game/             level grid + 2.5D mechanics/tiles, stage3d (perspective
                      projection, vistas, vaulted halls, 3D gears & boss arenas),
                      tex3d (pixel-art 3D polygon texture rasterizer & bank),
                      builder (prefabs + themes), stages, level_data (stage 1),
                      parallax, entities, player, ally (guardian turtle),
                      relics (boss power-ups), enemies, boss (Reaper), bosses
                      (all other bosses + factory), forest_assets (Darkwood
                      pixel art), objects (candles/items/projectiles/fire),
                      world (combat, scripting, draw order), castlemap
                      (connected stage map), hud
assets/               engine-ready PNGs + atlas.json, music/*.mp3, voice/*.mp3, sfx/*.mp3
art/raw/              untouched generations (provenance)   art/PROMPTS.md
tools/                process_assets.py (pipeline), asset_manifest.json,
                      import_raw.py, generate_voices.sh, screenshot.sh
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
`difficulty=easy|normal|hard` presets the difficulty, `stage=1..13` picks the
stage, `screen=play|difficulty|stageselect|clear|ending` opens a screen directly, `nofx`
disables the shader post-process.
