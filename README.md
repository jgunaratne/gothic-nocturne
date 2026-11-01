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
  Native 640×360, full-viewport 16:9 aspect-fit scaled (snapping to exact integer
  multiples when close and using band-limited sharp sub-pixel anti-aliased
  texel sampling at fractional/HiDPI scales to prevent shimmer), composited
  through a WebGL post-process (`src/engine/postfx.js`: half-res 320×180 bloom,
  per-stage colour grading across all 13 realms, phosphor scanlines, film grain,
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

- **Explore Any Region Independently**: Each hunter can roam any of the 13 castle stages simultaneously at their own pace while seeing every other hunter's live position across the **Castle Exploration Map (`M`)** and **7×4 HUD Mini-Map**.
- **Pass By One Another in Real Time**: When two or more hunters enter the same region, directional edge chevrons (`< VESPER 14M`) show which way nearby hunters are, and crossing paths renders each hunter in a distinct pixel-art cloak palette with smooth 60 fps stride/jump/whip interpolation, cooperative whip & sub-weapon combat, floating nameplates, **`G` Salute flares**, and a **Soul-Lantern resonance** spark shimmer as they pass one another.

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move / crouch | ← → / ↓ (WASD) | Left stick / D-pad |
| Jump (hold for height; ↓+jump drops through ledges) | Z, J or Space | A / B |
| Whip (also while crouching or airborne) | X or K | X / Y / RB / RT |
| Enter passageways / doorways | ↑ (at arched portal) | ↑ (at arched portal) |
| Throw sub-weapon (costs 1 heart) | ↑ + whip | ↑ + attack |
| Castle Exploration Map (live location & fast travel) | M or Tab | Back / Select / View |
| Expand the Castle (propose a new wing) | P, or the title menu | title menu |
| Salute / greet nearby hunters | G | — |
| Edit Hunter Callsign (on Title / Map / Pause) | C | — |
| Pause / start | Enter or Esc | Start |
| Mute | N or U | Right stick click (R3) |
| Toggle shaders (bloom, grading, scanlines) | F | Left stick click (L3) |

Whip candelabra for hearts, money, and sub-weapons (dagger, axe, holy water).
Breakable blocks hide meat and gold. Spike pits hurt; bottomless pits kill.
Defeat each stage's boss and claim the orb to march into the next stage.

## Castle Exploration Map & Interconnected Regions

All thirteen stages fit together as an interlocking **34×14 architectural cell grid** (`168` rooms across cobalt halls, crimson boss chambers, emerald-cyan Sanctuaries, and amber-gold secret vaults):

- **Press `M` (or `Tab` / Gamepad Select) Anytime**: Opens the full-screen **Castle Exploration Map** during gameplay, highlighting explored cells (`MAP XX% · RELICS XX/13 · VESSELS XX/13`) alongside a pulsing **`YOU` location beacon** tracking the hunter's exact room cell and fractional position, paired with a live **7×4 HUD Mini-Map radar** in the top-right corner.
- **Physical Passage Gateways (`↑`)**: Carved Gothic portals inside every stage connect directly into neighbouring regions on the map — carrying health, hearts, sub-weapon, lives, and score seamlessly across doorways. Five shortcut doorways are sealed by **ability-gated runic barriers** that open once their corresponding Boss Relic is claimed (*Night Wings*, *Lantern Flame*, *Soul Harvest*, *Clockwork Heart*).
- **Sanctuary Waystones & Fast Travel**: Walking past a region's carved **Sanctuary Waystone** mends `+4 HP` and attunes that Sanctuary so the hunter can warp between discovered Sanctuaries from the `M` map.
- **13 Hidden Ancient Life Vessels**: Each region hides one golden **Ancient Vessel** inside a sunken crypt vault or atop a high stone balcony reachable only with *Night Wings* Double Jump, permanently granting **`+1 Max HP`** and **`+2 Starting Hearts`**.

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
- **mid-depth furnishings** (z ≈ 90–104) — pews, bookcases, automata cabinets,
  angel statues, candle pillars, stalagmites and 3D sarcophagi standing on the
  receding floor between the play plane and the wall, fogged, darkened and
  grounded by contact shadows so the crisp play layer stays dominant.

Outdoors, small 3D mausoleums with gabled slate roofs and lit lancets stand on
the moor behind the Graveyard Road's cemetery fence. Background scenery (tree
colonnades, fences, tombs) is planted on the true ground (`Level.groundRow`),
never on an upper gallery ledge, viaduct span or ferry gap.

Stage 1 is hand-built (`src/game/level_data.js`); stages 2–13 are composed
from prefab segments by `src/game/builder.js` (`flat`, `vistaBridge`, `lavaRun`,
`crumbleRun`, `ferryGap`, `splitRoute`, `gearWheel`, `liftShaft`, `descent`,
`hiddenVault`, `swingRun`, `vestibule`, `gap`,
`spikeRun`, `stepUp/stepDown`, `climb`, `corridor`, `blocks`, `arena`) in
`src/game/stages.js`, so adding a stage is a dozen lines.

## Expand the Castle (Castle Forge)

The title screen's second entry, **EXPAND THE CASTLE** (also `P` on the castle
map), lets the player *propose* a new wing — "Abandoned Village", "Sunken
Cistern", "Alchemist's Observatory"… — and the castle raises it:

1. **Blueprint** — Gemini (`generate text`) designs the wing as strict JSON:
   name, subtitle, which of the thirteen base realms it inherits (3D vistas,
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
   free cells next to a fitting neighbour on the 34×14 castle grid, a passage
   gateway appears inside that neighbouring stage, the new region gets a
   Sanctuary, a hidden Ancient Vessel, a boss chamber and a relic, and the map
   shows the ghost rooms materialising while the forge works. Press `Esc` to
   keep playing; a ticker tracks the forge and a banner announces the new wing.

Raised wings live in `assets/forge/<key>/` with a registry in
`assets/forge/stages.json`, so every player on that server gets them at boot
(up to 16). Offline (plain static hosting) the forge still works in local
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
                      parallax, entities, player, hero_anim (hunter clips,
                      squash/stretch, whip timeline), anim_clips (generated
                      clip frames for enemies/bosses), ally (guardian turtle),
                      relics (boss power-ups), enemies, boss (Reaper), bosses
                      forest_assets (Darkwood pixel art), objects
                      (candles/items/projectiles/fire), exploration (Sanctuary
                      Waystones, Passage Gateways & Ancient Vessels), world
                      (combat, scripting, draw order), castlemap (interlocking
                      34x14 cell map, forge placement & HUD mini-map), hud,
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
                      generate_voices.sh, screenshot.sh, smoke_test.py
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

The hunter's clips (`hero_idle`, `hero_walk8`, `hero_whip`, `hero_cwhip`,
`hero_jump`, `hero_hurt`) are all optional: `src/game/hero_anim.js` picks the
frame for the local hunter and the network hunters alike and falls back to the
classic `hero.png` poses for any clip that is missing. The whip's eight phases
are tied to `PLAYER.whipActive` in normalized time, so the extended frames are
exactly the ticks the hit box is live however the Chrono Pendulum rescales the
lash. On top of the frames the engine adds the timing the sheets cannot:
landing squash and take-off stretch, a lean into acceleration and stops,
footstep sound + dust on the boot-contact frames, and a few ticks of hit-stop
when the whip connects (`world.hitStop`).

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
stage (forged wings follow the thirteen built-in ones),
`screen=play|map|difficulty|stageselect|forge|clear|ending` opens a screen directly,
`forge=<name>[&forgedesc=<text>][&local=1]` proposes a wing immediately
(`local=1` forces the offline procedural forge),
`discovered=all`, `vessels=all`, and `explored=all` unlock map exploration state, and `nofx`
disables the shader post-process.

`PORT=8712 .venv/bin/python tools/smoke_test.py 15` loads every screen and stage
(13 built-in + forged) in headless Chrome and fails on uncaught errors.
