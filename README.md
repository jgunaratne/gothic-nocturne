# Gothic Nocturne

A 32-bit era, whip-cracking side-scrolling action platformer across eight
stages: a moonlit graveyard road, a pumpkin-lit haunted forest, a snowbound
village on a cursed Christmas night, the castle ramparts, catacombs and an
ossuary, a clock tower of grinding gears, and the throne hall of the Count. Multi-layer parallax outdoors, scrolling far walls
indoors, tile terrain, candelabra to whip for hearts and sub-weapons,
skeletons (and red reviving / axe-throwing variants), rising zombies and
ghouls, swooping and fire bats, medusa heads, hopping and flaming
jack-o'-lanterns, fire-breathing dragons, the petrifying catoblepas, ice
golems, killer snowmen, frost wisps, and a different boss at the end of every
stage.

- **Art**: every tile, sprite and backdrop was generated with Gemini's image
  model, then normalized into crisp pixel art by a deterministic pipeline.
- **Music**: twelve full-length tracks (2–2.5 minutes each) generated with
  **Lyria 3**: a distinct theme for every stage plus title, boss, stage-clear,
  game-over and ending, streamed on demand and looped with crossfades. Sound
  effects are synthesized in-browser with Web Audio.
- **Engine**: plain HTML5 canvas + ES modules, no build step, no dependencies.
  Native 640×360, integer-scaled with nearest-neighbour sampling.

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
| Mute | M | — |

Whip candelabra for hearts, money, and sub-weapons (dagger, axe, holy water).
Breakable blocks hide meat and gold. Spike pits hurt; bottomless pits kill.
Defeat each stage's boss and claim the orb to march into the next stage.

## Stages

Pick any stage on the "Select stage" screen (shown after the difficulty
choice; cleared stages are marked and your last stage is remembered).
Clearing a stage carries score, lives, hearts and sub-weapon into the next one;
clearing stage 6 plays the ending.

| # | Stage | Theme | Signature hazards | Boss |
| --- | --- | --- | --- | --- |
| 1 | The Graveyard Road | outdoors → castle gate | zombies, bats, medusa heads, a catoblepas | The Great Bat |
| 2 | The Jack-o'-Lantern | autumn forest of glowing pumpkins | hopping/flaming pumpkins, dragons, catoblepas | The Great Jack |
| 3 | The Frozen Yule | snowbound village, falling snow | ice golems, snowmen, frost wisps | Devil Santa |
| 4 | The Ramparts | outdoors, castle walls | long gaps, ledge hops, axe skeletons | The Bone Captain |
| 5 | The Catacombs | ossuary walls, crawl corridors | red skeletons, breakable walls | The Phantom Reaper |
| 6 | The Ossuary | darker crypt | spike fields, ghouls, fire bats | The Gorgon Queen |
| 7 | The Clock Tower | vertical climb, turning gears | ledge ascents, bat swarms | The Reaper Lord |
| 8 | The Throne Hall | the keep's great hall | everything at once | The Count |

The catoblepas breathes a petrifying cloud: touched by it, the hunter turns to
stone for a moment — mash any button to break free sooner.

Every material has two terrain strips that alternate per 8-tile chunk, exposed
faces are edge-shaded, fill tiles get a faint value jitter, ledges stand on
posts, and interior walls alternate texture panels between pilasters with
mouldings and arched alcoves.

Stage 1 is hand-built (`src/game/level_data.js`); stages 2–8 are composed
from prefab segments by `src/game/builder.js` (`flat`, `gap`, `spikeRun`,
`stepUp/stepDown`, `climb`, `corridor`, `blocks`, `arena`) in
`src/game/stages.js`, so adding a stage is a dozen lines.

## Difficulty

Chosen on the "Choose your fate" screen after the title (remembered in
`localStorage`, overridable with `?difficulty=easy|normal|hard`):

| | Lives | Hearts | Timer | Damage taken | Enemy HP | Spawn pressure | Boss | Score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Easy** | 5 | 10 | 600 s | ×0.5 | ×0.75 | slower, max 2 | slower, phase 2 at 40 % | ×0.5 |
| **Normal** | 3 | 5 | 420 s | ×1 | ×1 | standard, max 3 | standard, phase 2 at 50 % | ×1 |
| **Hard** | 2 | 3 | 300 s | ×1.5 | ×1.5 | faster, max 4 | faster, phase 2 at 65 % | ×2 |

One-hit fodder (bats, zombies, medusa heads) stays one-hit on every setting;
skeletons and the Reaper scale. Presets live in `src/engine/constants.js`.

## Layout

```
index.html            canvas shell
src/main.js           boot, scaling, fixed-step loop, title/pause/clear/game-over
src/engine/           input (keyboard, gamepad, scripted), assets, audio, font,
                      particles, camera, constants
src/game/             level grid + rendering, builder (prefabs + themes), stages,
                      level_data (stage 1), parallax, entities, player, enemies,
                      boss (Reaper), bosses (the other five + factory), objects
                      (candles/items/projectiles/fire), world (combat, scripting,
                      draw order), hud
assets/               engine-ready PNGs + atlas.json, music/*.mp3
art/raw/              untouched generations (provenance)   art/PROMPTS.md
tools/                process_assets.py (pipeline), asset_manifest.json,
                      import_raw.py, screenshot.sh
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
teleports to a tile column, `bosshp=N` weakens the boss,
`difficulty=easy|normal|hard` presets the difficulty, `stage=1..8` picks the
stage, `screen=difficulty|stageselect|ending` opens a screen directly.
