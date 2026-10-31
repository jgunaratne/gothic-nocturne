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
| `boss_vampire_sheet.png` | Aristocratic vampire count final boss facing right: regal idle, cape spread like bat wings, casting blue-violet hellfire, two claw lunges, hurt recoil. Pale skin, widow's peak, red eyes, black and crimson attire with gold trim. (Returned as 2 rows of 3.) |

| `catoblepas_sheet.png` | Catoblepas: a heavy stooped buffalo-like beast with a low-hanging boar head and horns; 3 lumbering walk frames and a breath frame exhaling violet-grey petrifying gas. (2×2.) |
| `pumpkin_sheet.png` | Jack-o'-lantern enemies: a hopping carved pumpkin on vine legs (crouch, mid-hop) and a floating flaming pumpkin head (2 flame frames). (2×2.) |
| `dragon_sheet.png` | Lean crimson wyvern: wings up, wings down, glide, fire-breath. (2×2.) |
| `ice_sheet.png` | Ice golem of jagged translucent blocks (2 walk frames) and a sinister top-hatted snowman (idle, throw). (2×2.) |
| `wisp_sheet.png` | Frost wisp: skull-faced spirit of swirling ice crystals, 4 rotation frames. (2×2.) |
| `santa_sheet.png` | Devil Santa boss: horned, crimson fur coat, sack over shoulder; idle, hurling a gift, lunging with a chain of bells, hurt. (2×2.) |

## Environment

| File | Subject |
| --- | --- |
| `tex_wall_brick.png` | Seamless castle interior stone-brick wall, running bond, cracks, faint moss. → `assets/wall.png` 192×192 (6 courses, one tile high each). |
| `tex_ground_strip.png` | Side-view graveyard terrain cross-section: green sky above a horizontal surface line with dead-grass tufts, bones and pebbles; layered dark earth with stones, roots and skulls below. → `assets/ground.png` (8 px grass overhang + 4 depth rows). |
| `tex_castle_floor_strip.png` | Side-view castle floor cross-section: carved stone ledge with a beveled top and moulding, running-bond blocks below. → `assets/floor.png`. |
| `tex_catacomb_wall.png` | Seamless ossuary wall: rough stone blocks with niches stacked with skulls and long bones, cobwebs, damp stains. → `assets/catacombwall.png` 192×192. |
| `tex_catacomb_floor_strip.png` | Side-view catacomb floor cross-section: uneven flagstones with bone fragments and a skull, packed rock with embedded skeletons below. → `assets/catacomb.png`. |
| `tex_clock_wall.png` | Seamless clock-tower interior wall: riveted iron plates, girders, aged brass panels and flush cogs. → `assets/clockwall.png` 192×192. |
| `tex_clock_floor_strip.png` | Side-view iron walkway cross-section: riveted plates with brass trim, girder lattice and gear fragments below. → `assets/clockfloor.png`. |
| `tex_forest_floor_strip.png` / `_b` | Autumn forest floor (fallen leaves over rooted earth) and an abandoned flagstone forest road. |
| `tex_snow_floor_strip.png` | Snow-covered ground over frozen earth (body compressed 0.5× so the strata show). |
| `tex_ground_strip_b.png` | Cobblestone graveyard path variant. |
| `tex_castle_floor_strip_b.png` | Castle hall floor with a crimson carpet runner and skull reliefs. |
| `tex_catacomb_floor_strip_b.png` | Flooded crypt floor with a murky puddle and stacked bones. |
| `tex_clock_floor_strip_b.png` | Clock-tower oak gallery over beams and cogs. |
| `tex_wall_brick_b.png` / `tex_catacomb_wall_b.png` / `tex_clock_wall_b.png` | Second wall textures (ashlar with a frieze, sealed burial niches, oak panelling with pipes) used for alternating wall panels. |
| `tex_platform_wood.png` | Wooden plank platform with brass caps (forest, yule, clock tower). |
| `pumpkin_props_sheet.png` | Forest props: large and small jack-o'-lanterns, a pumpkin pile, a scarecrow with a stump. |
| `xmas_props_sheet.png` | Yule props: decorated fir, wreath, candy-cane lamppost, gift pile, snowy stump. |
| `bg_deepforest.png` | Mid-distance haunted autumn forest with hanging and stacked glowing pumpkins (keyed, mirrored; also drawn darkened as a far layer). |
| `bg_winter.png` | Snowbound village: pines, chapel, cottages with lit windows, decorated firs (keyed, mirrored; also darkened far layer). |
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

## Music (Lyria 3 full-song recipe, ~2.5 min each, 192 kbps MP3)

Generated by `tools/generate_music.sh`; prompts are in that script. One theme per stage (graveyard, jack, yule, ramparts, catacombs, ossuary, tower, throne) plus title, boss and ending. `clear.mp3` and `gameover.mp3` remain 30 s stings. The original 30 s prompts:

| File | Prompt (abridged) |
| --- | --- |
| `stage.mp3` | Instrumental retro video-game soundtrack, 32-bit era: driving baroque rock in D minor at 150 BPM, harpsichord and pipe-organ arpeggios, pulsing synth bass, crisp drums, heroic lead synth; haunted-castle-at-midnight mood; loopable, no vocals. |
| `boss.mp3` | Intense boss-battle music: aggressive symphonic metal in A minor at 172 BPM, double-kick drums, distorted power-chord synth guitar, organ stabs, frantic harpsichord runs, low choir pad, screaming lead; loopable, no vocals. |
| `title.mp3` | Slow ominous title theme: haunting pipe organ in D minor at 70 BPM, tolling church bell, ethereal choir pad, sparse music-box melody, distant timpani; loopable, no vocals. |
| `clear.mp3` | Short triumphant victory fanfare in D major at 140 BPM: brass-like synth fanfare, rolling snare, harpsichord flourish, organ resolution. |
| `gameover.mp3` | Somber game-over sting: slow descending pipe-organ phrase in D minor at 60 BPM, single funeral bell, dark choir pad fading to silence. |
| `catacombs.mp3` | Eerie mid-tempo stage theme at 128 BPM in E minor: pizzicato synth bass, rattling bone percussion, ghostly detuned organ, mournful harpsichord, low choir swells, subterranean echo; loopable, no vocals. |
| `tower.mp3` | Driving mechanical stage theme at 160 BPM in G minor: ticking clockwork percussion, synth-bass ostinato, harpsichord and music-box arpeggios, heroic lead, organ accents; loopable, no vocals. |
| `ending.mp3` | Gentle triumphant ending at 92 BPM in D major: warm string pad, soft piano, distant bells, harpsichord counter-melody building to a hopeful crescendo. |

The in-game loop plays each track with a 350 ms equal-power crossfade and trims
encoder padding automatically (see `src/engine/audio.js`).
