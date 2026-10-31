# Generation prompts (provenance)

Every raster asset in `art/raw/` was generated with Gemini's image generation
model (Nano Banana) on 2026-10-31, then normalized by
`tools/process_assets.py` (chroma key → premultiplied box downscale → hard
alpha → median-cut palette → seam repair / sheet slicing). Music was generated
with **Lyria 3**, Google's music generation model.

All prompts begin with the shared STYLE block from [`STYLE.md`](STYLE.md);
keyed assets end with the "flat solid pure green (#00FF00)" suffix. Only the
subject part is listed here.

## Characters

| File | Subject |
| --- | --- |
| `hero_sheet.png` | Vampire-hunter hero facing right, 2×6 grid: 6-frame walk; idle, jump, crouch, whip wind-up, whip strike (whip fully extended), hurt. Shoulder-length dark hair, red headband, studded leather vest, tall boots, coiled leather whip. |
| `skeleton_sheet.png` | Skeleton warrior facing right: 4-frame walk, bone-throw wind-up, throw. Rusty round shield on the back, tattered cloth. (Came out as two rows: 4 walk + 3 walk/2 throw.) |
| `zombie_sheet.png` | Rotting zombie facing right, 4-frame shamble with arms outstretched, ashen blue-grey skin, torn burial clothes. |
| `bat_sheet.png` | Vampire bat facing right, 3 flap frames (wings up / level / down), violet-grey fur, red eyes. (Returned 2 rows; row 1 used.) |
| `medusa_sheet.png` | Floating severed medusa head facing right, 2 frames (snakes up / out), lavender-grey skin, amber eyes. |
| `boss_sheet.png` | Spectral grim-reaper phantom boss, 4 frames: hover A, hover B, scythe raised wind-up, forward scythe swing. Tattered violet-black robe, skeletal hands, crimson eyes, bone-handled scythe. |

## Environment

| File | Subject |
| --- | --- |
| `tex_wall_brick.png` | Seamless castle interior stone-brick wall, running bond, cracks, faint moss. → `assets/wall.png` 192×192 (6 courses, one tile high each). |
| `tex_ground_strip.png` | Side-view graveyard terrain cross-section: green sky above a horizontal surface line with dead-grass tufts, bones and pebbles; layered dark earth with stones, roots and skulls below. → `assets/ground.png` (8 px grass overhang + 4 depth rows). |
| `tex_castle_floor_strip.png` | Side-view castle floor cross-section: carved stone ledge with a beveled top and moulding, running-bond blocks below. → `assets/floor.png`. |
| `tex_platform.png` | Single floating carved stone ledge, ~10:1, distinct left/right end caps, moss and a cobweb underneath. → `assets/platform.png` 320×68 (32 px caps). |
| `props_sheet.png` | Row of 6 props: 3-candle iron candelabra, wall torch in a sconce, cracked breakable block, four floor spikes, gothic tombstone with a cross, dead shrub. |
| `arch_sheet.png` | Row of 5 architectural props: gothic column, pointed-arch stained-glass window (violet/crimson), spiked portcullis in an archway, crimson heraldic banner with a gold bat crest, hanging chain with shackle. |
| `items_sheet.png` | Row of 8 pickup icons: small heart, large heart, throwing axe, dagger, holy-water flask, roast meat, crystal orb, money bag. |

## Parallax layers

| File | Subject |
| --- | --- |
| `bg_sky.png` | Night sky in 5–6 posterized indigo bands, pixel stars, huge pale full moon upper-right with a halo and violet cloud wisps. Not keyed; horizontally seamless. |
| `bg_mountains.png` | Far jagged mountain range in two flat silhouette rows (dusky violet / deep indigo) with mist at the base; peaks in the lower 55 %. Keyed, mirrored to 1280 px. |
| `bg_castle.png` | Distant gothic castle on a cliff in flat slate-blue silhouette: spires, keep, bell tower, buttresses, tiny amber windows. Keyed, mirrored. |
| `bg_forest.png` | Mid-distance graveyard: dead twisted trees, crooked tombstones and crosses, wrought-iron fence, dark ground fill at the bottom. Keyed, mirrored. |
| `bg_fg.png` | Foreground overlay: three fence spear-posts, gnarled branches from the top corners, a hanging chain; ≥80 % empty. Keyed, mirrored, drawn at scroll factor 1.3 outdoors only. |

## Music (Lyria 3, 30 s clips, 44.1 kHz stereo MP3)

| File | Prompt (abridged) |
| --- | --- |
| `stage.mp3` | Instrumental retro video-game soundtrack, 32-bit era: driving baroque rock in D minor at 150 BPM, harpsichord and pipe-organ arpeggios, pulsing synth bass, crisp drums, heroic lead synth; haunted-castle-at-midnight mood; loopable, no vocals. |
| `boss.mp3` | Intense boss-battle music: aggressive symphonic metal in A minor at 172 BPM, double-kick drums, distorted power-chord synth guitar, organ stabs, frantic harpsichord runs, low choir pad, screaming lead; loopable, no vocals. |
| `title.mp3` | Slow ominous title theme: haunting pipe organ in D minor at 70 BPM, tolling church bell, ethereal choir pad, sparse music-box melody, distant timpani; loopable, no vocals. |
| `clear.mp3` | Short triumphant victory fanfare in D major at 140 BPM: brass-like synth fanfare, rolling snare, harpsichord flourish, organ resolution. |
| `gameover.mp3` | Somber game-over sting: slow descending pipe-organ phrase in D minor at 60 BPM, single funeral bell, dark choir pad fading to silence. |

The in-game loop plays each track with a 350 ms equal-power crossfade and trims
encoder padding automatically (see `src/engine/audio.js`).
