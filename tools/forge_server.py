#!/usr/bin/env python3
"""Castle Forge server for Gothic Nocturne.

Serves the game (static files, like `python3 -m http.server`) and raises
player-proposed wings on demand:

  POST /api/forge                {name, description, fallback}  -> job
  GET  /api/forge/job/<id>       job status (steps, blueprint, entry)
  GET  /api/forge/stages         registry of raised wings (assets/forge/stages.json)
  GET  /api/forge/health         capabilities

A job drafts a blueprint with Gemini (`generate text`), paints pixel art with
Gempix (`generate image`) through the same deterministic pipeline as the rest
of the game's art (tools/process_assets.py), composes a Lyria 3 stage theme,
gives the boss a Daikon voice line, optionally renders an ElevenLabs ambience
loop, and appends the wing to the registry the client loads at boot. Every
step degrades gracefully: whatever could not be generated is inherited from
the wing's base realm by the client (src/game/forge.js).

Run with the asset-pipeline venv so PIL/numpy are available:

    .venv/bin/python tools/forge_server.py --port 8712
"""

import argparse
import base64
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
import urllib.parse
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
FORGE_DIR = os.path.join(ASSETS, 'forge')
JOBS_DIR = os.path.join(FORGE_DIR, 'jobs')
REGISTRY = os.path.join(FORGE_DIR, 'stages.json')
GENERATE = os.environ.get('GENERATE_CLI', '/google/bin/releases/gemini-agents-generate/generate')
TEXT_MODEL = os.environ.get('FORGE_TEXT_MODEL', '')          # '' = CLI default
IMAGE_MODEL = os.environ.get('FORGE_IMAGE_MODEL', 'gempix-2-flash-lite-png')
MUSIC_MODEL = os.environ.get('FORGE_MUSIC_MODEL', 'lyria-3-full-song-mp3')
TTS_MODEL = os.environ.get('FORGE_TTS_MODEL', 'models/gemini-v4s-tts-nlm-daikon')
MAX_WINGS = 16

sys.path.insert(0, os.path.join(ROOT, 'tools'))
try:
    import process_assets as pa   # noqa: E402  (PIL + numpy)
    PIPELINE_OK = True
except Exception as exc:          # pragma: no cover - depends on the interpreter
    pa = None
    PIPELINE_OK = False
    PIPELINE_ERR = str(exc)

LOCK = threading.Lock()
ART_LOCK = threading.Lock()   # process_assets uses module-level RAW/OUT paths
JOBS = {}

# --------------------------------------------------------------- vocabulary
# Mirrors src/game/forge.js so Gemini only proposes things the client can build.

BASE_THEMES = {
    'graveyard': 'moonlit graveyard road and moor (outdoor)',
    'darkwood': 'ancient bioluminescent dark forest (outdoor)',
    'forest': 'haunted autumn pumpkin woods (outdoor)',
    'yule': 'snowbound haunted village under northern lights (outdoor)',
    'ramparts': 'castle curtain walls and battlements over a courtyard (outdoor)',
    'catacombs': 'vaulted skull-niche crypts (indoor)',
    'darkcave': 'molten obsidian caverns with lava (indoor)',
    'ossuary': 'bone-choked abyss over a spectral chasm (indoor)',
    'arcade': 'gilded gallery of brass automata (indoor)',
    'library': 'towering haunted library stacks (indoor)',
    'cathedral': 'soaring stained-glass cathedral nave (indoor)',
    'clocktower': 'cylindrical clock tower of grinding gears (indoor)',
    'throne': 'crimson rib-vaulted royal halls (indoor)',
}
OUTDOOR = {'graveyard', 'darkwood', 'forest', 'yule', 'ramparts'}
BOSS_BASES = {
    'treant': ('a huge gnarled tree-like colossus', ['standing idle with arms lowered', 'idle swaying slightly', 'both arms slammed down into the ground, hunched', 'roaring with maw open and arms raised high'], 'treant'),
    'greatjack': ('a colossal floating flaming head', ['floating with flames rising (flame frame 1)', 'floating with flames bent as if rushing forward (flame frame 2)', 'mouth wide open spitting a fireball to the right'], 'greatjack'),
    'cinderqueen': ('a tall regal sorceress-like figure', ['standing idle, arms at sides', 'casting with one arm raised and a glowing orb', 'surging forward with cloak flaring', 'erupting with both arms up and energy bursting'], 'cinderqueen'),
    'gorgon': ('a serpent-bodied queen', ['coiled upright, arms at sides (pose a)', 'coiled upright swaying, hands raised (pose b)', 'leaning forward with glowing eyes wide in a petrifying stare'], 'gorgon'),
    'automaton': ('a hulking mechanical construct', ['standing idle', 'mid-stride walking', 'punching forward with a huge fist', 'overloading with sparks and steam bursting from its chest'], 'automaton'),
    'archivist': ('a hooded spectral scholar floating above the ground', ['floating idle with a tome', 'casting with pages swirling', 'summoning with both arms raised', 'shielded behind a spinning wall of books'], 'archivist'),
    'archon': ('a massive winged stone gargoyle', ['crouched idle with wings folded', 'roaring with wings spread wide', 'pouncing forward with claws out', 'curled into a defensive stone shell'], 'archon'),
    'reaper': ('a floating hooded reaper with a scythe', ['floating idle, scythe lowered (idle 1)', 'floating idle, cloak drifting (idle 2)', 'winding up the scythe behind its back', 'swinging the scythe in a wide arc to the right'], 'boss'),
    # Two-row sheets stay tinted base sprites (no sheet generation):
    'devilsanta': None, 'bonecaptain': None, 'giantbat': None, 'reaperlord': None, 'count': None,
}
BOSS_SHEET_SPECS = {   # mirrors tools/asset_manifest.json for frame processing
    'treant': {'height': 136, 'ref': 'idle0', 'colors': 32, 'rows': [['idle0', 'idle1', 'slam', 'roar']]},
    'greatjack': {'height': 96, 'ref': 'flame0', 'colors': 24, 'rows': [['flame0', 'flame1', 'spit']], 'anchors': {'spit': 'left'}},
    'cinderqueen': {'height': 116, 'ref': 'idle', 'colors': 32, 'rows': [['idle', 'cast', 'surge', 'erupt']]},
    'gorgon': {'height': 96, 'ref': 'a', 'colors': 28, 'rows': [['a', 'b', 'stare']]},
    'automaton': {'height': 110, 'ref': 'idle', 'colors': 32, 'rows': [['idle', 'walk', 'punch', 'overload']], 'anchors': {'punch': 'left'}},
    'archivist': {'height': 120, 'ref': 'idle', 'colors': 28, 'rows': [['idle', 'cast', 'summon', 'shield']]},
    'archon': {'height': 120, 'ref': 'idle', 'colors': 28, 'rows': [['idle', 'roar', 'pounce', 'shell']]},
    'reaper': {'height': 136, 'ref': 'idle0', 'colors': 24, 'rows': [['idle0', 'idle1', 'windup', 'swing']]},
}
GROUND_ENEMIES = ['skeleton', 'catoblepas', 'pumpkin', 'icegolem', 'snowman', 'wolf', 'mushroom', 'magmaslime', 'lavagolem', 'armor']
FLYING_ENEMIES = ['bat', 'dragon', 'owl', 'ghost', 'tome', 'gargoyle', 'cinderimp', 'wraith']
SPAWNERS = ['zombie', 'pumpkin', 'medusa', 'lantern', 'wisp', 'ghost', 'wraith', 'cinderimp', 'tome', 'gargoyle', 'bat', 'owl']
RELIC_EFFECTS = ['vitality', 'hearts', 'whip', 'stride', 'ward']
MALE_VOICES = ['star07', 'star09', 'star13', 'star15', 'msm00001']
FEMALE_VOICES = ['star17', 'msf00005']

STYLE = ('32-bit era (mid-1990s console) 2D pixel art for a gothic horror side-scrolling action platformer. '
         'Crisp hard-edged pixel clusters, limited palette, flat shading with 2-3 tones per material, no anti-aliasing blur, '
         'no painterly or photoreal rendering. Strict side view, orthographic. No text, no labels, no watermark, no signature, no frame borders.')
KEY = ('The background must be one flat solid pure bright green (#00FF00) with no gradient, no ground shadows, and nothing '
       'touching the image edges. Nothing green anywhere on the subjects.')
MUSIC_STYLE = ('Full-length instrumental video game music (about two and a half minutes, with an intro, main theme, a contrasting '
               'bridge and a return to the main theme that can loop) for a gothic horror side-scrolling action platformer, 32-bit '
               'console era style with clean bright slightly compressed sound. No vocals, no lyrics, instrumental only.')

BLUEPRINT_SCHEMA = r'''{
  "name": "THE ABANDONED VILLAGE",            // uppercase, starts with THE, <= 30 chars
  "subtitle": "WHERE THE BELLS RING FOR NO ONE", // uppercase, <= 44 chars
  "where": "FORSAKEN HAMLET",                  // short uppercase map wing label, <= 20 chars
  "description": "one vivid sentence of what the place is",
  "base": "yule",                               // ONE of the base realm keys; pick the closest mood/architecture
  "connectsTo": ["yule", "graveyard"],          // 1-3 existing region keys it should neighbour on the map
  "palette": {"accent": "#c9a86a", "bg": "#0b0a12", "hueShift": 12, "saturate": 1.0},
  "weather": "snow",                            // none | snow | fireflies | embers | leaves
  "segments": [                                 // 12-20 prefab segments, the client appends the boss arena
    {"type": "flat", "len": 12, "candles": [3, 9], "enemies": [["snowman", 6], ["bat", 10, {"h": 5}]]},
    {"type": "crumbleRun", "len": 3, "safe": true, "belowBlock": "money"},
    {"type": "flat", "len": 10, "candles": [[4, "dagger"], 8], "enemies": [["skeleton", 5, {"variant": "axe"}]], "spawn": "wisp"},
    {"type": "stepUp", "n": 2},
    {"type": "vistaBridge", "len": 10, "candles": [3, 7], "enemies": [["bat", 4, {"h": 5}]]},
    {"type": "ferryGap", "len": 6, "rise": 0, "candle": "axe", "safeFloor": false},
    {"type": "splitRoute", "len": 14, "reward": "meat", "spawn": "zombie", "enemies": [["skeleton", 5], ["icegolem", 10]], "upperEnemies": [["bat", 8, {"h": 6}]]},
    {"type": "corridor", "len": 10, "ceil": 3, "candles": [4], "spawn": "medusa"},
    {"type": "liftShaft", "h": 4, "spawn": "bat", "reward": "holy_water"},
    {"type": "descent", "h": 4, "enemies": [["bat", 3, {"h": 2}]]},
    {"type": "hiddenVault", "reward": "meat", "weapon": "axe", "enemies": [["skeleton", 7]]},
    {"type": "swingRun", "n": 3, "period": 2.8, "reward": "heart_big"},
    {"type": "climb", "n": 3, "candles": true},
    {"type": "blocks", "h": 3, "drops": ["meat", null, "money"]},
    {"type": "gearWheel", "safe": true, "speed": 0.5, "reward": "dagger"},     // clockwork places only
    {"type": "lavaRun", "len": 8, "islands": [[2, 2], [5, 2]], "candles": [[3, "dagger"]]} // volcanic places only
  ],
  "boss": {
    "type": "bonecaptain",                      // ONE of the boss behaviour keys
    "name": "THE HOLLOW BELLRINGER",            // uppercase, <= 28 chars
    "line": "NO ONE LEAVES THE VILLAGE ALIVE, HUNTER... THE BELLS TOLL FOR YOU!",  // spoken approach line, <= 120 chars
    "voice": {"female": false, "direction": "how the voice should perform the line (laugh, whisper, shout...)"},
    "art": "what the boss looks like, one sentence, matching its behaviour archetype"
  },
  "relic": {"name": "BELL OF THE LOST", "effect": "vitality", "color": "#c9a86a"},
  "art": {
    "palette": "comma separated colour words for this place",
    "floorSurface": "what the walking surface is (cobbles, frost, roots...)",
    "floorBelow": "what the earth / masonry under the surface looks like",
    "wall": "seamless interior wall texture description (indoor bases only)",
    "backdrop": "mid-distance silhouette row behind the play area (outdoor bases only)",
    "props": [{"name": "well", "desc": "a dry stone well with a broken windlass"}, {"name": "cart", "desc": "..."}, {"name": "gallows", "desc": "..."}, {"name": "shrine", "desc": "..."}],
    "icon": "a tiny emblem for the map: one clear silhouette"
  },
  "music": "Lyria prompt: tempo, key, instruments, mood for this stage theme",
  "ambience": "short sound-design prompt for a loopable background ambience"
}'''


# ------------------------------------------------------------------ helpers

def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def load_registry():
    try:
        with open(REGISTRY, encoding='utf-8') as fh:
            data = json.load(fh)
        return data.get('stages', []) if isinstance(data, dict) else []
    except (OSError, ValueError):
        return []


def save_registry(stages):
    os.makedirs(FORGE_DIR, exist_ok=True)
    tmp = REGISTRY + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump({'version': 1, 'stages': stages}, fh, indent=1)
    os.replace(tmp, REGISTRY)


def save_job(job):
    os.makedirs(JOBS_DIR, exist_ok=True)
    with open(os.path.join(JOBS_DIR, job['id'] + '.json'), 'w', encoding='utf-8') as fh:
        json.dump(job, fh, indent=1)


def load_job(job_id):
    try:
        with open(os.path.join(JOBS_DIR, job_id + '.json'), encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def capabilities():
    env = load_env()
    return {
        'ok': True,
        'generate': os.path.exists(GENERATE) and os.access(GENERATE, os.X_OK),
        'pipeline': PIPELINE_OK,
        'ffmpeg': shutil.which('ffmpeg') is not None,
        'elevenlabs': bool(env.get('ELEVENLABS_API_KEY') or env.get('ELEVENLABS')),
        'wings': len(load_registry()),
        'maxWings': MAX_WINGS,
        'jobs': sum(1 for j in JOBS.values() if j['status'] in ('queued', 'running')),
    }


def load_env():
    """ELEVENLABS key from the environment or the git-ignored .env file."""
    env = dict(os.environ)
    path = os.path.join(ROOT, '.env')
    try:
        with open(path, encoding='utf-8') as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except OSError:
        pass
    return env


def run(cmd, timeout, cwd=None, stdin=None):
    """Runs a CLI, returning (returncode, stdout, stderr); never raises."""
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd, input=stdin)
        return res.returncode, res.stdout, res.stderr
    except subprocess.TimeoutExpired:
        return -1, '', 'timeout'
    except OSError as exc:
        return -2, '', str(exc)


def slug(s):
    s = re.sub(r'[^a-z0-9]+', '_', str(s or '').lower()).strip('_')[:24] or 'wing'
    return 'w_' + s if s[0].isdigit() else s


def unique_key(key, taken):
    base = key
    n = 2
    while key in taken:
        key = f'{base}_{n}'
        n += 1
    return key


def set_step(job, key, state, detail=None):
    for s in job['steps']:
        if s['key'] == key:
            s['state'] = state
            if detail is not None:
                s['detail'] = str(detail)[:60].upper()
    job['updatedAt'] = int(time.time() * 1000)
    save_job(job)


def sentence_case(line):
    """ALL-CAPS subtitle line -> readable TTS text (keeps the final shout in caps)."""
    parts = re.split(r'(\.\.\.|[.!?]\s+)', str(line or ''))
    out = ''
    for part in parts:
        if not part:
            continue
        if re.fullmatch(r'(\.\.\.|[.!?]\s+)', part):
            out += part
            continue
        p = part.strip().lower()
        out += (p[:1].upper() + p[1:]) if p else ''
    # Shout the last clause, as the built-in bosses do.
    m = re.search(r'([^.!?]+[!]?)\s*$', out)
    if m and len(m.group(1)) < 70:
        out = out[:m.start(1)] + m.group(1).upper()
    return out.strip()


# ------------------------------------------------------------- blueprint step

def build_blueprint_prompt(proposal, fallback, existing):
    bases = '\n'.join(f'  - {k}: {v}' for k, v in BASE_THEMES.items())
    bosses = ', '.join(BOSS_BASES.keys())
    names = ', '.join(sorted(existing)) if existing else 'none yet'
    return f"""You are the level designer, art director and composer for GOTHIC NOCTURNE, a 32-bit era gothic
whip-cracking side-scrolling action platformer in the spirit of classic castle-exploration games.
A player has proposed a NEW WING for the vampire's castle. Design it completely.

PROPOSAL
  name: {proposal.get('name', '')}
  description: {proposal.get('description', '') or '(none given)'}

RULES
- Output ONLY one JSON object matching the schema below (no markdown fences, no commentary).
- "base" must be one of these realm keys (the wing inherits that realm's 3D vistas, decor and enemy feel):
{bases}
- "connectsTo" lists existing region keys the wing should neighbour, best first. Existing regions: graveyard, darkwood, jack, yule, ramparts, catacombs, darkcave, ossuary, arcade, library, cathedral, clocktower, throne.
- Segment types: flat, vistaBridge, corridor, crumbleRun, ferryGap, splitRoute, gearWheel, liftShaft, descent, hiddenVault, swingRun, lavaRun, stepUp, stepDown, climb, blocks, spikeRun, gap.
  Use 12-20 segments. Start with a flat. Teach each hazard safely before testing it. Mix calm runs, vertical moves and one risk/reward splitRoute.
  Only use lavaRun for volcanic places and gearWheel for clockwork places. corridor only makes sense indoors; vistaBridge is best outdoors.
- Ground enemies: {', '.join(GROUND_ENEMIES)}. Flying enemies (need "h" 2-7): {', '.join(FLYING_ENEMIES)}.
  Enemy entries are [type, offsetTilesFromSegmentStart, options]; options may hold "h" (flying height) and "variant" (skeleton: axe|red, bat: fire).
  Spawners ("spawn"): {', '.join(SPAWNERS)}. Candle drops: dagger, axe, holy_water, meat, heart_big, heart_small, money.
- Boss "type" (behaviour reused from a built-in boss): {bosses}. Give it a NEW name, look and spoken line that fit the place.
- Relic "effect": one of {', '.join(RELIC_EFFECTS)}.
- Keep every string family-friendly, menacing gothic fun. All display strings UPPERCASE as shown. Colours as #rrggbb.
- Already raised wings (avoid duplicate names): {names}.

SCHEMA (comments explain each field; your output must be valid JSON without comments):
{BLUEPRINT_SCHEMA}

A procedurally generated fallback for this proposal follows; improve on it rather than copying it:
{json.dumps({k: fallback.get(k) for k in ('base', 'segments', 'boss', 'relic') if k in fallback})[:3000]}
"""


def parse_json_blob(text):
    """Extracts the first JSON object from model output (tolerates fences / prose)."""
    if not text:
        return None
    t = text.strip()
    t = re.sub(r'^```(?:json)?\s*', '', t)
    t = re.sub(r'\s*```$', '', t)
    try:
        return json.loads(t)
    except ValueError:
        pass
    start = t.find('{')
    end = t.rfind('}')
    if start < 0 or end <= start:
        return None
    candidate = t[start:end + 1]
    try:
        return json.loads(candidate)
    except ValueError:
        # Strip trailing commas, a common model slip.
        candidate = re.sub(r',\s*([}\]])', r'\1', candidate)
        try:
            return json.loads(candidate)
        except ValueError:
            return None


def draft_blueprint(job, proposal, fallback, caps):
    set_step(job, 'blueprint', 'running', 'GEMINI IS DRAFTING')
    bp = None
    if caps['generate']:
        existing = [e.get('blueprint', {}).get('name', e.get('key')) for e in load_registry()]
        prompt = build_blueprint_prompt(proposal, fallback, existing)
        cmd = [GENERATE, '-timeout=150s', 'text']
        if TEXT_MODEL:
            cmd.append(f'-model={TEXT_MODEL}')
        cmd.append(prompt)
        for attempt in range(2):
            code, out, err = run(cmd, timeout=170)
            parsed = parse_json_blob(out) if code == 0 else None
            if isinstance(parsed, dict) and parsed.get('segments') and parsed.get('boss'):
                bp = parsed
                break
            log('blueprint attempt', attempt + 1, 'failed:', (err or out)[:200].replace('\n', ' '))
    if bp is None:
        bp = dict(fallback)
        bp['source'] = 'procedural'
        set_step(job, 'blueprint', 'done', 'PROCEDURAL DRAFT (GEMINI UNAVAILABLE)' if caps['generate'] else 'PROCEDURAL DRAFT')
    else:
        bp['source'] = 'gemini'
        set_step(job, 'blueprint', 'done', f"{str(bp.get('base', '?')).upper()} · {len(bp.get('segments', []))} SEGMENTS · BOSS {str(bp.get('boss', {}).get('name', '?'))[:18]}")
    # Keep fallback plumbing the client relies on.
    bp.setdefault('name', fallback.get('name'))
    bp.setdefault('description', proposal.get('description') or fallback.get('description'))
    bp['seed'] = fallback.get('seed', 1)
    if bp.get('base') not in BASE_THEMES:
        bp['base'] = fallback.get('base', 'yule')
    bp['outdoor'] = bp['base'] in OUTDOOR
    return bp


# ------------------------------------------------------------------ art step

def gen_image(out_path, prompt, attempts=3):
    for attempt in range(attempts):
        code, out, err = run([GENERATE, '-prod', '-timeout=180s', f'-output={out_path}', 'image', f'-model={IMAGE_MODEL}', prompt], timeout=200)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
            return True
        msg = (err or out)[-200:].replace('\n', ' ')
        log('image failed', os.path.basename(out_path), attempt + 1, msg)
        # Per-second quota throttling clears quickly; back off a little longer each time.
        time.sleep(5 + attempt * 6 + (4 if 'xhausted' in msg else 0))
    return False


def art_prompts(bp):
    art = bp.get('art') or {}
    pal = art.get('palette') or 'midnight indigo, desaturated steel-blue stone, bone ivory highlights, warm amber accents'
    place = bp.get('description') or bp.get('name', 'a haunted place')
    surface = art.get('floorSurface') or 'weathered stone slabs'
    below = art.get('floorBelow') or 'packed dark earth with embedded stones and bones'
    prompts = {}
    prompts['floor'] = (f"Palette: {pal}. SIDE-VIEW TERRAIN CROSS-SECTION STRIP of the ground of {place}, horizontally seamless "
                        f"(the left edge continues the right edge). The top 25 percent of the image is flat solid pure bright green (#00FF00) "
                        f"with nothing in it. At exactly 25 percent from the top is a perfectly horizontal walking surface of {surface}, with only tiny "
                        f"details poking slightly up into the pure green. Below the surface the remaining 75 percent is {below}, getting darker toward "
                        f"the bottom edge. Nothing on the surface or below may be pure bright green. No objects above the surface, no text.")
    if bp.get('outdoor'):
        backdrop = art.get('backdrop') or f'a continuous row of silhouetted structures of {place}'
        prompts['backdrop'] = (f"Palette: {pal}, deep indigo shadows, pale moonlit rim highlights on the upper-left edges. MID-DISTANCE PARALLAX BACKGROUND "
                               f"LAYER of {place}: {backdrop}, drawn as dark layered silhouettes with a few small warm lit details; a solid dark ground fill "
                               f"across the bottom 12 percent so the bottom edge is completely filled. The layer must be horizontally seamless (the left "
                               f"edge continues the right edge), and the composition must fit within the middle horizontal band of the image (the top "
                               f"20 percent and bottom 5 percent may be empty). Everything above and between the structures that is open air must be "
                               f"one flat solid pure bright green (#00FF00) with no gradient, no stars, no moon, no fog. Nothing pure bright green on the structures.")
    else:
        wall = art.get('wall') or f'the interior wall of {place}'
        prompts['wall'] = (f"Palette: {pal}. SEAMLESS TILEABLE TEXTURE of {wall}, filling the entire square image edge to edge with no border and no "
                           f"vignette, strict front view, flat even lighting, repeating pattern so the left edge continues the right edge and the top "
                           f"edge continues the bottom edge. No text, no green.")
    props = art.get('props') or []
    descs = []
    for i, p in enumerate(props[:4]):
        if isinstance(p, dict):
            descs.append(f"({i + 1}) {p.get('desc') or p.get('name') or 'a prop'}")
        else:
            descs.append(f"({i + 1}) {p}")
    while len(descs) < 4:
        descs.append(f"({len(descs) + 1}) a weathered prop that belongs in {place}")
    prompts['props'] = (f"Palette: {pal}. A ROW of 4 separate props for {place}, in one horizontal row with wide even green gaps, strict side view, "
                        f"same scale, all standing on the same invisible baseline: {', '.join(descs)}. Do not write their names: absolutely no captions, "
                        f"letters or labels anywhere in the image. {KEY}")
    icon = art.get('icon') or f'a tiny emblem of {place}'
    prompts['icon'] = (f"Palette: {pal}. ONE small emblem icon for a castle map: {icon}, a clear simple silhouette with 2-3 tones that stays readable "
                       f"at tiny size, centred, filling about half of the image. {KEY}")
    boss = bp.get('boss') or {}
    base = BOSS_BASES.get(boss.get('type'))
    if base:
        body, frames, _sheet = base
        cells = ', '.join(f'({i + 1}) {d}' for i, d in enumerate(frames))
        look = boss.get('art') or f"{boss.get('name', 'the guardian')}, {body}"
        prompts['boss'] = (f"Palette: {pal}, glowing eyes, deep indigo shadows. SPRITE SHEET of ONE boss monster facing RIGHT in every frame: "
                           f"{look}. It is {body}. Layout: a single horizontal row of {len(frames)} cells with wide even green gaps, all at the same "
                           f"scale with the same baseline: {cells}. {KEY}")
    return prompts


def process_art(job, bp, key, raw, images):
    """Runs the shared deterministic pipeline on the generated PNGs -> atlas fragment."""
    if not PIPELINE_OK:
        return {}
    wing_dir = os.path.join(FORGE_DIR, key)
    os.makedirs(wing_dir, exist_ok=True)
    pa.RAW = raw
    pa.OUT = wing_dir
    pa.WORK = os.path.join(raw, 'work')
    report = {}
    overhang = 6 if bp.get('outdoor') else 4
    specs = {
        'floor': ('strip', {'src': 'floor.png', 'size': [512, None], 'overhang': overhang, 'depth_tiles': 4, 'colors': 32}),
        'wall': ('texture', {'src': 'wall.png', 'size': [256, 256], 'colors': 32, 'seamless': 'blend'}),
        'backdrop': ('texture', {'src': 'backdrop.png', 'key': True, 'crop': [0, 0.14, 1, 0.9], 'size': [640, 360], 'colors': 24, 'seamless': 'mirror'}),
        'props': ('sheet', {'src': 'props.png', 'height': 80, 'ref': None, 'colors': 32, 'rows': [prop_names(bp)]}),
        'icon': ('sheet', {'src': 'icon.png', 'height': 26, 'ref': 'icon', 'colors': 24, 'rows': [['icon']]}),
    }
    boss_type = (bp.get('boss') or {}).get('type')
    if boss_type in BOSS_SHEET_SPECS:
        spec = dict(BOSS_SHEET_SPECS[boss_type])
        spec['src'] = 'boss.png'
        specs['boss'] = ('sheet', spec)
    out = {}
    for kind, path in images.items():
        if kind not in specs or not path:
            continue
        typ, spec = specs[kind]
        if spec.get('ref') is None and typ == 'sheet':
            spec['ref'] = spec['rows'][0][0]
        try:
            if typ == 'strip':
                pa.process_strip(kind, spec, report)
            elif typ == 'texture':
                pa.process_texture(kind, spec, report)
            else:
                pa.process_sheet(kind, spec, report, False)
            rec = report.get(kind)
            if not rec:
                continue
            if typ == 'sheet':
                expected = spec['rows'][0]
                got = list(rec.get('frames', {}).keys())
                missing = [f for f in expected if f not in got]
                if kind == 'boss' and missing:
                    log('boss sheet frames mismatch, dropping sheet', missing, got)
                    continue
                if kind == 'props' and len(got) < 2:
                    continue
                if kind == 'props':
                    rec['frames'] = {f: v for f, v in rec['frames'].items() if not f.startswith('extra_')}
            rec['file'] = f'forge/{key}/{rec["file"]}'
            out[kind] = rec
        except Exception as exc:   # one bad image must not sink the wing
            log('processing failed', kind, exc)
            traceback.print_exc()
    return out


def prop_names(bp):
    props = (bp.get('art') or {}).get('props') or []
    names = []
    for p in props[:4]:
        n = p.get('name') if isinstance(p, dict) else p
        n = slug(n)[:16]
        if n and n not in names:
            names.append(n)
    while len(names) < 4:
        names.append(f'prop_{len(names)}')
    return names


def forge_art(job, bp, key, caps):
    if not (caps['generate'] and caps['pipeline']):
        set_step(job, 'art', 'skipped', 'NO IMAGE GENERATION HERE · BASE ART INHERITED')
        return {}
    set_step(job, 'art', 'running', 'GEMPIX IS PAINTING TILES, PROPS, BOSS AND SKY')
    raw = os.path.join(FORGE_DIR, key, 'raw')
    os.makedirs(raw, exist_ok=True)
    prompts = art_prompts(bp)
    images = {}
    threads = []

    def worker(kind, prompt):
        path = os.path.join(raw, f'{kind}.png')
        if gen_image(path, f'{STYLE} {prompt}'):
            images[kind] = path
            set_step(job, 'art', 'running', f'PAINTED {kind.upper()} ({len(images)}/{len(prompts)})')

    for kind, prompt in prompts.items():
        t = threading.Thread(target=worker, args=(kind, prompt), daemon=True)
        t.start()
        threads.append(t)
        time.sleep(1.5)   # stagger starts under the image model's per-second quota
    for t in threads:
        t.join(timeout=420)
    with ART_LOCK:
        processed = process_art(job, bp, key, raw, images)
    if processed:
        set_step(job, 'art', 'done', f"{len(processed)}/{len(prompts)} · {', '.join(k.upper() for k in processed)}")
    else:
        set_step(job, 'art', 'failed', 'NOTHING USABLE · BASE ART INHERITED')
    return processed


# ---------------------------------------------------------------- audio steps

def forge_music(job, bp, key, caps):
    if not caps['generate']:
        set_step(job, 'music', 'skipped', 'BASE THEME SCORE')
        return None
    set_step(job, 'music', 'running', 'LYRIA 3 IS COMPOSING (2-3 MIN)')
    wing_dir = os.path.join(FORGE_DIR, key)
    os.makedirs(wing_dir, exist_ok=True)
    out = os.path.join(wing_dir, 'music.mp3')
    prompt = f"{bp.get('music') or 'Dark gothic stage theme in a minor key, pipe organ, harpsichord, pulsing synth bass, crisp drums.'} {MUSIC_STYLE}"
    for attempt in range(2):
        code, so, se = run([GENERATE, '-timeout=600s', f'-output={out}', 'music', f'-model={MUSIC_MODEL}', prompt], timeout=640)
        if os.path.exists(out) and os.path.getsize(out) > 200000:
            set_step(job, 'music', 'done', 'LYRIA 3 STAGE THEME')
            return f'forge/{key}/music.mp3'
        log('music failed', attempt + 1, (se or so)[-200:].replace('\n', ' '))
    set_step(job, 'music', 'failed', 'LYRIA UNAVAILABLE · BASE THEME SCORE')
    return None


def forge_voice(job, bp, key, caps):
    if not caps['generate']:
        set_step(job, 'voice', 'skipped', 'SUBTITLED ONLY')
        return None
    set_step(job, 'voice', 'running', 'DAIKON IS REHEARSING THE BOSS')
    boss = bp.get('boss') or {}
    voice_cfg = boss.get('voice') or {}
    female = bool(voice_cfg.get('female'))
    voices = FEMALE_VOICES if female else MALE_VOICES
    voice = voices[int(bp.get('seed', 0)) % len(voices)]
    direction = str(voice_cfg.get('direction') or 'Begin with a cruel echoing laugh, drop to a chilling whisper, then shout the final threat with evil fury.')[:400]
    line = sentence_case(boss.get('line') or 'None shall pass beyond this threshold!')
    text = f"<|laughter|> <|whisper|> {line.split('...')[0].strip()}... <|/whisper|> {line.split('...', 1)[1].strip() if '...' in line else ''}".strip()
    style = (f"Language: English\nRegion: United Kingdom\nVoice: mature {'female' if female else 'male'} voice\nDirection: {direction}\n"
             f"Emotion: Evil, menacing, theatrical\nTexture: Resonant, expressive\nPacing: Dynamic\nPitch: {'Medium' if female else 'Low'}\n"
             f"Expressivity: High\nRole: Guardian of {bp.get('name', 'the wing').title()}\nCharacter: {str(boss.get('name', 'The Guardian')).title()}")
    esc = json.dumps
    proto = f'''model: {esc(TTS_MODEL)}
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
    language_code: "en-GB"
    voice_config {{
      prebuilt_voice_config {{
        voice_name: {esc(voice)}
      }}
    }}
  }}
}}
'''
    wing_dir = os.path.join(FORGE_DIR, key)
    os.makedirs(wing_dir, exist_ok=True)
    req = os.path.join(wing_dir, 'raw', 'voice.textproto')
    os.makedirs(os.path.dirname(req), exist_ok=True)
    with open(req, 'w', encoding='utf-8') as fh:
        fh.write(proto)
    wav = os.path.join(wing_dir, 'raw', 'voice.wav')
    for attempt in range(2):
        code, so, se = run([GENERATE, '-prod', '-timeout=90s', f'-output={wav}', f'-request={req}'], timeout=110)
        if os.path.exists(wav) and os.path.getsize(wav) > 20000:
            break
        log('voice failed', attempt + 1, (se or so)[-200:].replace('\n', ' '))
    if not (os.path.exists(wav) and os.path.getsize(wav) > 20000):
        set_step(job, 'voice', 'failed', 'DAIKON UNAVAILABLE · SUBTITLED ONLY')
        return None
    mp3 = os.path.join(wing_dir, 'voice.mp3')
    if caps['ffmpeg']:
        code, so, se = run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-af',
                            'silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB,areverse,'
                            'silenceremove=start_periods=1:start_silence=0.18:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11',
                            '-codec:a', 'libmp3lame', '-qscale:a', '4', mp3], timeout=120)
        if code == 0 and os.path.exists(mp3):
            set_step(job, 'voice', 'done', f"DAIKON {voice.upper()} · {'FEMALE' if female else 'MALE'}")
            return f'forge/{key}/voice.mp3'
    shutil.copyfile(wav, os.path.join(wing_dir, 'voice.wav'))
    set_step(job, 'voice', 'done', 'DAIKON (WAV)')
    return f'forge/{key}/voice.wav'


def forge_ambience(job, bp, key, caps):
    env = load_env()
    api_key = env.get('ELEVENLABS_API_KEY') or env.get('ELEVENLABS')
    if not api_key:
        set_step(job, 'ambience', 'skipped', 'NO ELEVENLABS KEY')
        return None
    set_step(job, 'ambience', 'running', 'ELEVENLABS IS RECORDING THE AIR')
    wing_dir = os.path.join(FORGE_DIR, key)
    os.makedirs(os.path.join(wing_dir, 'raw'), exist_ok=True)
    prompt = str(bp.get('ambience') or 'eerie wind through an abandoned place, sparse, loopable')[:300]
    body = json.dumps({'text': prompt, 'duration_seconds': 14.0, 'prompt_influence': 0.5, 'loop': True}).encode('utf-8')
    tmp = os.path.join(wing_dir, 'raw', 'ambient_raw.mp3')
    try:
        req = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation', data=body,
                                     headers={'xi-api-key': api_key, 'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=90) as res:
            data = res.read()
        if len(data) < 5000:
            raise RuntimeError('short response')
        with open(tmp, 'wb') as fh:
            fh.write(data)
    except Exception as exc:
        set_step(job, 'ambience', 'failed', f'ELEVENLABS: {str(exc)[:30]}')
        return None
    out = os.path.join(wing_dir, 'ambient.mp3')
    if caps['ffmpeg']:
        code, so, se = run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-af', 'loudnorm=I=-24:TP=-2:LRA=9',
                            '-codec:a', 'libmp3lame', '-qscale:a', '5', out], timeout=120)
        if code != 0:
            shutil.copyfile(tmp, out)
    else:
        shutil.copyfile(tmp, out)
    set_step(job, 'ambience', 'done', 'LOOPING AMBIENCE BED')
    return f'forge/{key}/ambient.mp3'


# -------------------------------------------------------------------- pipeline

def run_job(job):
    job['status'] = 'running'
    job['startedAt'] = int(time.time() * 1000)
    save_job(job)
    proposal = job['proposal']
    fallback = job['fallback']
    caps = capabilities()
    try:
        with LOCK:
            taken = {e['key'] for e in load_registry()}
        key = unique_key(slug(fallback.get('key') or proposal.get('name')), taken)
        fallback['key'] = key
        bp = draft_blueprint(job, proposal, fallback, caps)
        bp['key'] = key
        job['blueprint'] = bp
        save_job(job)

        results = {}

        def stage(name, fn):
            try:
                results[name] = fn(job, bp, key, caps)
            except Exception as exc:
                log(name, 'crashed', exc)
                traceback.print_exc()
                set_step(job, name, 'failed', str(exc)[:50])
                results[name] = None

        threads = [threading.Thread(target=stage, args=(n, f), daemon=True) for n, f in
                   (('art', forge_art), ('music', forge_music), ('voice', forge_voice), ('ambience', forge_ambience))]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        set_step(job, 'register', 'running', 'RAISING THE WALLS')
        entry = {
            'key': key,
            'blueprint': bp,
            'assets': results.get('art') or None,
            'music': results.get('music'),
            'voice': results.get('voice'),
            'ambient': results.get('ambience'),
            'createdAt': int(time.time() * 1000),
            'source': bp.get('source', 'gemini'),
            'proposal': proposal,
        }
        with LOCK:
            stages = load_registry()
            if len(stages) >= MAX_WINGS:
                raise RuntimeError('THE CASTLE CAN HOLD NO MORE WINGS')
            stages = [e for e in stages if e.get('key') != key]
            stages.append(entry)
            save_registry(stages)
        job['entry'] = entry
        job['status'] = 'done'
        set_step(job, 'register', 'done', f'WING {len(stages)} OF {MAX_WINGS}')
        log('wing raised:', key)
    except Exception as exc:
        traceback.print_exc()
        job['status'] = 'error'
        job['error'] = str(exc).upper()[:160]
        job['updatedAt'] = int(time.time() * 1000)
        save_job(job)


def new_job(payload):
    proposal = {
        'name': str(payload.get('name', ''))[:40].strip(),
        'description': str(payload.get('description', ''))[:240].strip(),
    }
    if len(proposal['name']) < 3:
        raise ValueError('name too short')
    fallback = payload.get('fallback') if isinstance(payload.get('fallback'), dict) else {}
    job = {
        'id': uuid.uuid4().hex[:12],
        'status': 'queued',
        'proposal': proposal,
        'fallback': fallback,
        'blueprint': None,
        'entry': None,
        'error': None,
        'steps': [
            {'key': 'blueprint', 'label': 'DRAFTING THE BLUEPRINT', 'state': 'pending', 'detail': ''},
            {'key': 'art', 'label': 'PAINTING TILES, PROPS AND SKY', 'state': 'pending', 'detail': ''},
            {'key': 'music', 'label': 'COMPOSING THE SCORE', 'state': 'pending', 'detail': ''},
            {'key': 'voice', 'label': 'VOICING THE GUARDIAN', 'state': 'pending', 'detail': ''},
            {'key': 'ambience', 'label': 'RECORDING THE AMBIENCE', 'state': 'pending', 'detail': ''},
            {'key': 'register', 'label': 'RAISING THE WALLS', 'state': 'pending', 'detail': ''},
        ],
        'createdAt': int(time.time() * 1000),
        'startedAt': None,
        'updatedAt': int(time.time() * 1000),
    }
    JOBS[job['id']] = job
    save_job(job)
    threading.Thread(target=run_job, args=(job,), daemon=True).start()
    return job


def public_job(job):
    return {k: v for k, v in job.items() if k != 'fallback'}


# ------------------------------------------------------------------- server

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):   # quieter static logs
        first = str(args[0]) if args else ''
        if '/api/forge' in first:
            return
        if getattr(self, 'path', '').endswith(('.png', '.mp3', '.js', '.json', '.wav')) and 'code' not in fmt:
            return
        super().log_message(fmt, *args)

    def send_json(self, obj, status=200):
        data = json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        # Forge registry/assets change at runtime; never let the browser pin stale copies.
        if '/assets/forge/' in self.path or self.path.endswith('.json'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path.rstrip('/')
        if path == '/api/forge/health':
            return self.send_json(capabilities())
        if path == '/api/forge/stages':
            return self.send_json({'stages': load_registry()})
        if path.startswith('/api/forge/job/'):
            job_id = path.rsplit('/', 1)[-1]
            job = JOBS.get(job_id) or load_job(job_id)
            if not job:
                return self.send_json({'error': 'no such job'}, 404)
            return self.send_json(public_job(job))
        if path.startswith('/api/'):
            return self.send_json({'error': 'not found'}, 404)
        return super().do_GET()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path.rstrip('/') != '/api/forge':
            return self.send_json({'error': 'not found'}, 404)
        length = int(self.headers.get('Content-Length') or 0)
        if length > 256 * 1024:
            return self.send_json({'error': 'payload too large'}, 413)
        try:
            payload = json.loads(self.rfile.read(length) or b'{}')
        except ValueError:
            return self.send_json({'error': 'bad json'}, 400)
        running = sum(1 for j in JOBS.values() if j['status'] in ('queued', 'running'))
        if running >= 2:
            return self.send_json({'error': 'THE FORGE IS BUSY · TRY AGAIN IN A MOMENT'}, 429)
        if len(load_registry()) >= MAX_WINGS:
            return self.send_json({'error': 'THE CASTLE CAN HOLD NO MORE WINGS'}, 409)
        try:
            job = new_job(payload)
        except ValueError as exc:
            return self.send_json({'error': str(exc)}, 400)
        log('forge job', job['id'], 'for', payload.get('name'))
        return self.send_json(public_job(job), 202)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', type=int, default=int(os.environ.get('PORT', '8712')))
    ap.add_argument('--host', default=os.environ.get('HOST', '0.0.0.0'))
    args = ap.parse_args()
    os.makedirs(JOBS_DIR, exist_ok=True)
    # Jobs interrupted by a restart are reported as failed rather than hanging forever.
    for fn in os.listdir(JOBS_DIR):
        if fn.endswith('.json'):
            job = load_job(fn[:-5])
            if job and job['status'] in ('queued', 'running'):
                job['status'] = 'error'
                job['error'] = 'THE FORGE WAS RESTARTED MID-WORK'
                save_job(job)
    caps = capabilities()
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    srv = http.server.ThreadingHTTPServer((args.host, args.port), Handler)
    host = subprocess.run(['hostname', '-f'], capture_output=True, text=True).stdout.strip() or 'localhost'
    log(f'Castle Forge  ->  http://{host}:{args.port}/')
    log('capabilities:', json.dumps({k: v for k, v in caps.items() if k != 'ok'}))
    if not PIPELINE_OK:
        log('asset pipeline disabled (run with .venv/bin/python for PIL/numpy):', PIPELINE_ERR)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
