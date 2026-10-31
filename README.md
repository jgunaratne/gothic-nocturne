# Gothic Nocturne

A 32-bit era, whip-cracking side-scrolling action platformer set on the
midnight road to a haunted castle. Six parallax layers (sky, mountains, castle,
dead forest, drifting fog, foreground branches), tile terrain, candelabra to
whip for hearts and sub-weapons, skeletons, rising zombies, swooping bats,
medusa heads, and a Phantom Reaper boss fight.

- **Art**: every tile, sprite and backdrop was generated with Gemini's image
  model, then normalized into crisp pixel art by a deterministic pipeline.
- **Music**: five tracks generated with **Lyria 3** (title, stage, boss,
  stage-clear, game-over), looped with crossfades. Sound effects are
  synthesized in-browser with Web Audio.
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
Reach the inner sanctum, defeat the Phantom Reaper, and claim the orb.

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
src/game/             level grid + rendering, stage data, parallax, entities,
                      player, enemies, boss, objects (candles/items/projectiles/fire),
                      world (combat, scripting, draw order), hud
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
`difficulty=easy|normal|hard` presets the difficulty, `screen=difficulty`
opens the select screen directly.
