#!/usr/bin/env python3
"""Batch-animates the cast (enemies, bosses, the ally) with animate_sprites.py.

One job per <sheet>_<family> clip: the family is the legacy frame family the
game already names ('walk', 'fly', 'windup', ...), so src/game/anim_clips.js
can swap the generated frames in at draw time without touching any state
machine. Loops are sampled by silhouette period, one-shots by cumulative
motion; everything is scale-calibrated and palette-locked to its sheet.

  .venv/bin/python tools/animate_cast.py                 # everything (resumable; clips are cached)
  .venv/bin/python tools/animate_cast.py --only skeleton --only boss
  .venv/bin/python tools/animate_cast.py --list
  .venv/bin/python tools/animate_cast.py --stop-after contact   # just render the clips + contact sheets
  .venv/bin/python tools/animate_cast.py --jobs 4        # parallel Omni generations

After the sheets are cut, the `clip` entries are added to tools/asset_manifest.json
and process_assets.py is run for them.
"""

import argparse
import collections
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable
TOOL = os.path.join(ROOT, "tools", "animate_sprites.py")
MANIFEST = os.path.join(ROOT, "tools", "asset_manifest.json")

LOOP, SHOT = "period", "motion"

# Hovering sprites keep the first frame's ground line as their anchor (a flap or
# bob must not move the body); walkers are anchored at the feet.
FLYERS = {"bat", "medusa", "pumpkin", "dragon", "wisp", "owl", "ghost", "tome", "gargoyle", "cinderimp",
          "wraith", "valkyrie", "necromancer", "gearharpy", "waltzdancer", "siren",
          "boss", "giantbat", "gorgon", "archivist", "greatjack", "archon"}

# (sheet, subject, [(family, action, select, count, ref_frame, extra), ...])
CAST = [
    # ---------------------------------------------------------------- enemies
    ("skeleton", "skeleton warrior carrying a bone club", [
        ("walk", "walk", LOOP, 8, "walk0", "a rattling bony stride"),
        ("walkb", "walk", LOOP, 8, "walkb0", "a rattling bony stride"),
        ("throw", "throw", SHOT, 4, "walk0", "it hurls a bone"),
    ]),
    ("zombie", "rotting zombie", [
        ("walk", "shamble", LOOP, 8, "walk0", ""),
    ]),
    ("bat", "bat", [
        ("fly", "fly", LOOP, 6, "fly1", ""),
    ]),
    ("medusa", "floating severed medusa head with writhing snake hair", [
        ("wave", "float", LOOP, 6, "a", "the snakes writhe and hiss"),
    ]),
    ("catoblepas", "catoblepas, a heavy stooped buffalo-like beast with a huge low-hanging head", [
        ("walk", "walk", LOOP, 8, "walk0", "a heavy four-legged plod, head hanging low"),
        ("breath", "breath", SHOT, 4, "walk0", "it exhales a cloud of petrifying breath"),
    ]),
    ("pumpkin", "floating flaming jack-o'-lantern head", [
        ("flame", "flame", LOOP, 4, "flame0", ""),
    ]),
    ("dragon", "lean wyvern dragon", [
        ("fly", "fly", LOOP, 6, "fly0", ""),
        ("breath", "breath", SHOT, 4, "fly0", "it stays airborne and breathes a jet of fire"),
    ]),
    ("ice", "hulking ice golem", [
        ("golem", "walk", LOOP, 6, "golem0", "a slow heavy lumbering stride"),
    ]),
    ("wisp", "frost wisp spirit", [
        ("wisp", "wisp", LOOP, 6, "wisp0", ""),
    ]),
    ("wolf", "briar wolf", [
        ("walk", "prowl", LOOP, 8, "walk0", ""),
        ("lunge", "lunge", SHOT, 3, "walk0", "a leaping bite"),
    ]),
    ("sporecap", "myconid mushroom creature", [
        ("walk", "walk", LOOP, 6, "walk0", "waddling on stubby legs"),
        ("puff", "puff", SHOT, 4, "walk0", ""),
    ]),
    ("owl", "night owl", [
        ("fly", "fly", LOOP, 6, "fly1", ""),
    ]),
    ("ghost", "phantom ghost", [
        ("float", "float", LOOP, 6, "float0", "its tattered shroud trailing"),
        ("lunge", "lunge", SHOT, 3, "float0", "it stays airborne"),
    ]),
    ("tome", "biting grimoire book with fangs", [
        ("flap", "fly", LOOP, 6, "flap0", "flapping its covers like wings"),
    ]),
    ("gargoyle", "stone gargoyle", [
        ("fly", "fly", LOOP, 6, "fly0", ""),
        ("wake", "wake", SHOT, 4, "perch", ""),
    ]),
    ("magmaslime", "magma slime", [
        ("crawl", "crawl", LOOP, 6, "crawl0", "molten surface glowing through the cracks"),
    ]),
    ("lavagolem", "lava golem", [
        ("walk", "walk", LOOP, 8, "walk0", "heavy lumbering strides"),
        ("hurl", "hurl", SHOT, 4, "walk0", ""),
    ]),
    ("cinderimp", "cinder imp", [
        ("fly", "fly", LOOP, 6, "fly0", ""),
        ("spit", "spit", SHOT, 3, "fly0", "it stays airborne"),
    ]),
    ("armor", "armoured plate knight with a sword and shield", [
        ("walk", "walk", LOOP, 8, "walk0", "a heavy armoured march, shield held forward"),
        ("slash", "slash", SHOT, 4, "walk0", ""),
    ]),
    ("wraith", "shadow wraith", [
        ("float", "float", LOOP, 6, "float0", "its shadowy robes trailing"),
        ("shriek", "shriek", SHOT, 4, "float0", ""),
    ]),
    ("turtle", "giant armoured turtle", [
        ("walk", "walk", LOOP, 8, "walk0", "a slow four-legged plod"),
    ]),
    ("alchfiend", "hunchbacked plague alchemist carrying glowing green glass vials", [
        ("walk", "walk", LOOP, 8, "walk0", "a hunched sneaky stride, vials clinking"),
        ("lob", "throw", SHOT, 4, "walk0", "it underhand-tosses a flask gesture; no projectiles, no detached flasks, no splashes"),
    ]),
    ("duelist", "aristocratic undead fencing duelist in velvet coat with silver rapier", [
        ("step", "walk", LOOP, 8, "step0", "a poised nimble fencing footwork stride, rapier held ready"),
        ("lunge", "lunge", SHOT, 4, "step0", "a swift rapier thrust forward and clean recovery; no detached slash waves"),
    ]),
    ("executioner", "towering hooded executioner carrying a massive iron greataxe", [
        ("walk", "walk", LOOP, 8, "walk0", "a slow heavy menacing march dragging the greataxe"),
        ("cleave", "swing", SHOT, 4, "heave", "it slams the massive greataxe down in front of it; no shockwaves, no sparks"),
    ]),
    ("merman", "finned amphibious abyssal merman creature", [
        ("stalk", "walk", LOOP, 8, "stalk0", "a crouched stalking webbed-foot stride"),
        ("spit", "spit", SHOT, 4, "stalk0", "no projectiles, no water jets, no detached droplets"),
    ]),
    ("valkyrie", "winged armoured valkyrie sentinel holding a spear and shield", [
        ("hover", "fly", LOOP, 6, "hover0", "feathered wings beating smoothly up and down while hovering"),
        ("aim", "throw", SHOT, 4, "hover0", "staying airborne, it thrusts its spear forward in a throwing motion; no projectiles, no detached spears, no energy beams"),
    ]),
    ("necromancer", "floating skeletal lich necromancer in tattered robes holding a skull staff", [
        ("float", "float", LOOP, 6, "float0", "hovering smoothly as tattered robes drift"),
        ("cast", "cast", SHOT, 4, "float0", "staying airborne, it raises and thrusts its skull staff forward; no projectiles, no energy beams, no detached skulls"),
    ]),
    # ------------------------------------------------- biome-specific enemies
    ("gravekeeper", "hunched undead gravedigger carrying a glowing amber lantern and iron spade", [
        ("walk", "shamble", LOOP, 8, "walk0", "heavy trudging steps, amber lantern swinging gently"),
        ("attack", "slash", SHOT, 4, "walk0", "it swings its iron spade forward in a heavy scoop slash; no dirt clouds, no projectiles"),
    ]),
    ("spriggan", "antlered wooden forest fey archer with a gnarled briar bow", [
        ("walk", "walk", LOOP, 8, "walk0", "a light stalking woodland stride, leafy cloak swaying"),
        ("attack", "cast", SHOT, 4, "walk0", "it draws and releases its wooden briar bowstring toward the right; no projectiles, no detached arrows, no energy beams"),
    ]),
    ("scarecrow", "cursed stilt-legged harvest scarecrow in a tattered witch hat holding a rusted scythe", [
        ("walk", "shamble", LOOP, 8, "walk0", "jerky eerie stilt-legged harvest strides, straw coat fluttering"),
        ("attack", "slash", SHOT, 4, "walk0", "it sweeps its rusted scythe across in a wide reaping slash; no projectiles, no detached blades"),
    ]),
    ("arbalest", "armoured castle siege crossbowman in dark steel kettle helm carrying a heavy crossbow", [
        ("walk", "walk", LOOP, 8, "walk0", "a disciplined armoured march carrying the heavy siege crossbow"),
        ("attack", "punch", SHOT, 4, "walk0", "it shoulders and fires its heavy crossbow forward with sharp recoil; no projectiles, no detached bolts, no muzzle flashes"),
    ]),
    ("pyromancer", "horned obsidian volcano cultist carrying a blazing magma brazier staff", [
        ("walk", "walk", LOOP, 8, "walk0", "a solemn robed stride, brazier flames flickering"),
        ("attack", "cast", SHOT, 4, "walk0", "it raises its magma brazier staff and thrusts it forward; no projectiles, no detached fireballs, no energy beams"),
    ]),
    ("clockknight", "clockwork brass halberdier automaton with porcelain mask and gear pauldrons", [
        ("walk", "walk", LOOP, 8, "walk0", "a crisp mechanical clockwork march, halberd held at guard"),
        ("attack", "slash", SHOT, 4, "walk0", "it thrusts and sweeps its brass gear-halberd forward; no sparks, no projectiles"),
    ]),
    ("gearharpy", "flying clockwork brass gear-owl mechanical drone with copper pinion wings", [
        ("fly", "fly", LOOP, 6, "fly0", "copper mechanical wings flapping up and down in a crisp rhythmic cycle"),
        ("attack", "spit", SHOT, 4, "fly0", "staying airborne, it snaps forward to fire a gear; no projectiles, no detached cogs, no energy beams"),
    ]),
    ("inkscholar", "blindfolded occult library warlock levitating an open chained grimoire", [
        ("walk", "walk", LOOP, 8, "walk0", "a measured robed scholar stride while the chained grimoire hovers beside its hand"),
        ("attack", "cast", SHOT, 4, "walk0", "the open grimoire flares as the warlock thrusts a hand forward; no projectiles, no detached pages, no energy beams"),
    ]),
    ("censerprelate", "tall mitred undead cathedral bishop swinging a heavy smoking brass censer on a chain", [
        ("walk", "walk", LOOP, 8, "walk0", "a solemn heavy liturgical procession stride, chained censer swaying"),
        ("attack", "swing", SHOT, 4, "windup", "it swings the chained brass censer forward in a wide heavy arc; no projectiles, no detached smoke clouds"),
    ]),
    ("bloodknight", "tall aristocratic vampire knight in crimson-and-ebony bat-wing plate wielding a crimson greatsword", [
        ("walk", "walk", LOOP, 8, "walk0", "a regal menacing armoured knight stride, cape flowing"),
        ("attack", "slash", SHOT, 4, "walk0", "a ferocious sweeping greatsword slash forward; no projectiles, no detached blood waves, no shockwaves"),
    ]),
    ("waltzdancer", "gliding masked phantom ballroom courtesan in tattered crimson silk gown holding a silver war-fan", [
        ("float", "float", LOOP, 6, "float0", "gliding gracefully above the floor, silk gown hem billowing"),
        ("attack", "slash", SHOT, 4, "float0", "staying afloat, she snaps her bladed silver war-fan open in a graceful sweeping slash; no projectiles, no detached blades"),
    ]),
    ("retiarius", "crested undead Roman gladiator holding a bronze buckler and barbed javelin", [
        ("walk", "walk", LOOP, 8, "walk0", "an aggressive gladiator arena stride, buckler raised"),
        ("attack", "throw", SHOT, 4, "walk0", "it lunges and thrusts its barbed javelin forward; no projectiles, no detached spears"),
    ]),
    ("siren", "hovering finned sea-nymph siren playing a golden shell-lyre", [
        ("fly", "fly", LOOP, 6, "fly0", "hovering smoothly as iridescent fin-wings undulate and beat gently"),
        ("attack", "shriek", SHOT, 4, "fly0", "staying airborne, she strums her shell-lyre and sings forward; no projectiles, no soundwave rings, no energy beams"),
    ]),
    ("astralarcher", "white-marble-and-gold celestial sentinel drawing a radiant crescent bow", [
        ("walk", "walk", LOOP, 8, "walk0", "a poised noble sentinel stride, navy star-cloak swaying"),
        ("attack", "cast", SHOT, 4, "walk0", "it draws its golden crescent bow and releases the bowstring forward; no projectiles, no detached arrows, no energy beams"),
    ]),
    # ---------------------------------------------- oversized colossal enemies
    ("mosstroll", "colossal ancient moss-and-root forest troll carrying an uprooted oak trunk club", [
        ("walk", "walk", LOOP, 8, "walk0", "earth-shaking lumbering giant strides, heavy oak club swaying"),
        ("attack", "slam", SHOT, 4, "windup", "it smashes its massive oak trunk club down onto the ground in front of it; no shockwaves, no flying rocks"),
    ]),
    ("wickerman", "colossal burning wicker harvest effigy giant with horned pumpkin head and iron furnace belly", [
        ("walk", "walk", LOOP, 8, "walk0", "heavy creaking colossus strides, inner furnace flames flickering"),
        ("attack", "slam", SHOT, 4, "windup", "it swings both flaming wicker arms down in a crushing smash; no projectiles, no detached fireballs, no shockwaves"),
    ]),
    ("wendigo", "colossal frost-furred antlered elk-skull wendigo beast with jagged ice claws", [
        ("walk", "walk", LOOP, 8, "walk0", "hulking predatory beast strides, frosted mane swaying"),
        ("attack", "lunge", SHOT, 4, "windup", "it lunges and rakes both huge ice claws downward in a savage swipe; no projectiles, no ice shockwaves"),
    ]),
    ("bonegoliath", "colossal multi-skull fused skeletal ossuary giant wielding a jagged bone great-cleaver", [
        ("walk", "walk", LOOP, 8, "walk0", "ponderous towering bone-giant strides, dragging the bone great-cleaver"),
        ("attack", "slam", SHOT, 4, "windup", "it heaves and slams its colossal bone great-cleaver down in front of it; no shockwaves, no flying bones"),
    ]),
    ("brasstitan", "colossal steam-powered brass clockwork juggernaut with twin smokestacks and piston hammer", [
        ("walk", "walk", LOOP, 8, "walk0", "heavy mechanical piston-driven colossus strides"),
        ("attack", "punch", SHOT, 4, "windup", "it drives its massive brass piston hammer forward in a crushing blow; no detached steam clouds, no shockwaves"),
    ]),
    ("vathulk", "colossal stitched alchemical homunculus brute with glowing cyan glass reactor vat on its back", [
        ("walk", "walk", LOOP, 8, "walk0", "heavy hulking brute strides, glowing cyan fluid sloshing inside its back tank"),
        ("attack", "slam", SHOT, 4, "windup", "it smashes its iron-gauntleted fists down in front of it; no detached splashes, no shockwaves"),
    ]),
    ("minotaur", "colossal armoured bull-headed gladiator minotaur wielding a huge bronze double-bladed battleaxe", [
        ("walk", "walk", LOOP, 8, "walk0", "thunderous hooved colossus strides, broken iron chains swaying"),
        ("attack", "swing", SHOT, 4, "windup", "it cleaves its massive bronze double-axe forward in a devastating arc; no shockwaves, no dust clouds"),
    ]),
    ("cisterncrab", "colossal armoured cavern crab carrying broken Roman marble columns on its shell", [
        ("walk", "walk", LOOP, 8, "walk0", "heavy multi-legged crustacean scuttle in place, marble ruins shifting slightly"),
        ("attack", "punch", SHOT, 4, "windup", "it snaps its colossal barnacle-crusted crushing claw forward; no water jets, no bubbles, no projectiles"),
    ]),
    ("marblecolossus", "colossal winged white-marble-and-gold celestial temple guardian wielding a gilded halberd", [
        ("walk", "walk", LOOP, 8, "walk0", "majestic heavy statue colossus strides, golden halo gleaming"),
        ("attack", "slash", SHOT, 4, "windup", "it sweeps its giant gilded halberd down in a grand arc; no projectiles, no light beams, no shockwaves"),
    ]),
    # ----------------------------------------------------------------- bosses
    ("boss", "Phantom Reaper, a hooded spectre holding a great scythe", [
        ("idle", "float", LOOP, 6, "idle0", "its robes drifting"),
        ("windup", "windup", SHOT, 4, "idle0", "it raises the scythe high"),
        ("swing", "swing", SHOT, 4, "windup", "the scythe sweeps down and across"),
    ]),
    ("giantbat", "giant bat", [
        ("fly", "fly", LOOP, 6, "fly0", ""),
    ]),
    ("bonecaptain", "skeletal Bone Captain in a tattered officer's coat", [
        ("walk", "walk", LOOP, 8, "walk0", ""),
        ("throw", "throw", SHOT, 4, "walk0", "it hurls a bone"),
    ]),
    ("gorgon", "Gorgon Queen with serpent hair in an emerald gown", [
        ("idle", "float", LOOP, 6, "a", "hovering, serpents writhing"),
        ("stare", "stare", SHOT, 4, "a", ""),
    ]),
    ("vampire", "vampire Count in a high-collared cape", [
        ("idle", "idle_creature", LOOP, 6, "idle", "cape stirring"),
        ("fly", "fly", LOOP, 6, "cape", "levitating airborne with boots dangling loosely and flapping his vast bat-wing cape"),
        ("cape", "cape", SHOT, 4, "idle", ""),
        ("cast", "cast", SHOT, 4, "idle", ""),
        ("lunge", "lunge", SHOT, 4, "idle", "a sweeping clawed lunge"),
    ]),
    ("greatjack", "giant flaming jack-o'-lantern", [
        ("flame", "flame", LOOP, 6, "flame0", ""),
        ("spit", "spit", SHOT, 4, "flame0", "it spits a gout of fire"),
    ]),
    ("santa", "Devil Santa, a demonic horned Santa Claus", [
        ("idle", "idle_creature", LOOP, 6, "idle", ""),
        ("throw", "throw", SHOT, 4, "idle", "it hurls a gift bomb"),
        ("lunge", "lunge", SHOT, 4, "idle", "swinging a chain of iron bells"),
    ]),
    ("treant", "Briar King, an ancient thorned treant", [
        ("idle", "idle_creature", LOOP, 6, "idle0", "branches creaking and swaying"),
        ("roar", "roar", SHOT, 4, "idle0", ""),
        ("slam", "slam", SHOT, 4, "roar", "its root-arms crash down"),
    ]),
    ("automaton", "Brass Automaton, a clockwork knight", [
        ("idle", "idle_creature", LOOP, 6, "idle", "gears ticking, steam puffing"),
        ("walk", "walk", LOOP, 8, "walk", "a stiff mechanical march"),
        ("punch", "punch", SHOT, 4, "idle", ""),
        ("overload", "overload", SHOT, 4, "idle", ""),
    ]),
    ("archivist", "Spectral Archivist, a ghostly robed librarian", [
        ("idle", "float", LOOP, 6, "idle", "pages fluttering around it"),
        ("cast", "cast", SHOT, 4, "idle", ""),
        ("summon", "summon", SHOT, 4, "idle", ""),
        ("shield", "shield", SHOT, 4, "idle", "books swirl up into a barrier"),
    ]),
    ("archon", "Gargoyle Archon, a colossal winged basalt gargoyle statue with a gold crown", [
        ("fly", "fly", LOOP, 6, "pounce", "vast stone bat wings sweeping high above its back and down in a heavy rhythmic wingbeat"),
        ("roar", "roar", SHOT, 4, "roar", "staying airborne, it spreads its stone wings and claws wide in a roar; no magic beams, no shockwaves, no particles"),
        ("pounce", "lunge", SHOT, 4, "pounce", "staying airborne in place, it coils back then thrusts both clawed hands forward in a fierce pounce"),
        ("shell", "shield", SHOT, 4, "idle", "it wraps its huge stone bat wings tightly around its body like a closed stone cloak and holds still"),
    ]),
    ("cinderqueen", "Cinder Queen, a tall armoured warrior-queen in black obsidian and gold plate with a spiked golden crown, faceplate visor, crimson cape and flame-topped scepter", [
        ("idle", "idle_creature", LOOP, 6, "idle", "the brazier flame on her scepter flickers and her cape stirs as she breathes"),
        ("walk", "walk", LOOP, 8, "idle", "a regal heavy armoured stride in place, cape swaying, holding the flame scepter"),
        ("cast", "cast", SHOT, 4, "cast", "she raises her flame-topped scepter high and thrusts it forward to command a spell; no projectiles, no energy beams, no detached fireballs"),
        ("surge", "surge", SHOT, 4, "surge", "leaning low in place in a lunging dash, cape billowing behind her; no detached fire trails"),
        ("erupt", "erupt", SHOT, 4, "erupt", "holding her scepter horizontally with both hands, she braces low and heaves the scepter high overhead; no screen-filling explosions"),
    ]),
]


def jobs(only):
    for sheet, subject, clips in CAST:
        if only and sheet not in only:
            continue
        for family, action, select, count, ref, extra in clips:
            yield {"name": f"{sheet}_{family}", "sheet": sheet, "subject": subject, "family": family,
                   "action": action, "select": select, "count": count, "ref": ref, "extra": extra}


def command(job, args):
    cmd = [PY, TOOL, job["name"], "--sheet", job["sheet"], "--frame", job["ref"], "--action", job["action"],
           "--subject", job["subject"], "--select", job["select"], "--count", str(job["count"]),
           "--names", job["family"], "--hero-px", str(args.hero_px),
           "--anchor-y", "ground" if job["sheet"] in FLYERS else "feet"]
    if job["extra"]:
        cmd += ["--extra", job["extra"] + "."]
    if job["select"] == LOOP:
        cmd += ["--loop", "--start", "30"]
    else:
        cmd += ["--start", "12"]
    if args.stop_after:
        cmd += ["--stop-after", args.stop_after]
    if args.force:
        cmd += ["--force"]
    return cmd


def run(job, args):
    cmd = command(job, args)
    res = subprocess.run(cmd, capture_output=True, text=True)
    tail = [l for l in (res.stdout + res.stderr).splitlines() if l.strip()][-3:]
    ok = res.returncode == 0
    print(("ok   " if ok else "FAIL ") + job["name"] + "  " + " | ".join(t.strip()[:90] for t in tail), flush=True)
    return ok


def register(names):
    """Adds `clip` manifest entries (next to their sheet) for the cut clips."""
    with open(MANIFEST) as fh:
        m = json.load(fh, object_pairs_hook=collections.OrderedDict)
    assets = m["assets"]
    added = 0
    for name in names:
        if name in assets:
            continue
        sheet = name.split("_", 1)[0]
        keys = list(assets.keys())
        anchors = [i for i, k in enumerate(keys)
                   if k == sheet or (k.startswith(sheet + "_") and assets[k].get("type") == "clip")]
        keys.insert((max(anchors) if anchors else len(keys) - 1) + 1, name)
        assets[name] = collections.OrderedDict([("type", "clip"), ("src", f"clips/{name}_sheet.png"),
                                                ("frames", f"clips/{name}_frames.json")])
        assets = collections.OrderedDict((k, assets[k]) for k in keys)
        m["assets"] = assets
        added += 1
    with open(MANIFEST, "w") as fh:
        json.dump(m, fh, indent=1)
        fh.write("\n")
    return added


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", action="append", default=[], help="sheet name(s) to process")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--jobs", type=int, default=4, help="parallel generations")
    ap.add_argument("--hero-px", type=int, default=480)
    ap.add_argument("--stop-after", choices=["clip", "contact"], default=None)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-register", action="store_true", help="skip the manifest / process_assets step")
    args = ap.parse_args()
    todo = list(jobs(args.only))
    if args.list:
        for j in todo:
            print(j["name"].ljust(22), j["select"].ljust(7), j["count"], j["ref"].ljust(8), j["action"])
        print(len(todo), "clips")
        return
    with ThreadPoolExecutor(max_workers=args.jobs) as ex:
        results = list(ex.map(lambda j: run(j, args), todo))
    done = [j["name"] for j, ok in zip(todo, results) if ok]
    failed = [j["name"] for j, ok in zip(todo, results) if not ok]
    print(f"\n{len(done)} ok, {len(failed)} failed" + (": " + ", ".join(failed) if failed else ""))
    if args.stop_after or args.no_register:
        return
    cut = [n for n in done if os.path.exists(os.path.join(ROOT, "art", "raw", "clips", f"{n}_sheet.png"))]
    added = register(cut)
    print(f"manifest: {added} clip entries added")
    subprocess.run([PY, os.path.join(ROOT, "tools", "process_assets.py")] + sum([["--only", n] for n in cut], []),
                   check=False)


if __name__ == "__main__":
    main()
