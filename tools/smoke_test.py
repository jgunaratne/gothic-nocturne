#!/usr/bin/env python3
"""Runtime smoke test: load every stage (plus title, map, ending) in headless
Chrome and fail on any uncaught JS error or missing render. Catches the class of
bug `node --check` cannot (missing imports, bad frame names, draw-time throws)."""
import os, subprocess, sys, tempfile

BASE = f"http://127.0.0.1:{os.environ.get('PORT', '8711')}/"
N_STAGES = int(sys.argv[1]) if len(sys.argv) > 1 else 21   # pass 21 + number of forged wings to cover them too
scenes = [('title', '?skip=40'), ('map', '?screen=stageselect&skip=20'), ('ending', '?screen=ending&skip=700'),
          ('armory', '?screen=armory&weapons=all&handL=herald_shield_rod&handR=pyre_shield&skip=20'),
          ('souls', '?screen=souls&souls=all&skip=20'),
          ('bestiary', '?screen=bestiary&bestiary=all&souls=all&weapons=all&skip=20'),
          ('armory-settings', '?screen=armory&tab=settings&weapons=all&souls=all&skip=20'),
          ('dual-wield', '?screen=play&weapons=all&souls=all&handL=zephyr_galeblade&handR=heraldic_buckler&skip=60'),
          ('forge', '?screen=forge&skip=30'), ('forging-local', '?forge=Smoke%20Test%20Wing&local=1&skip=30')]
for i in range(1, N_STAGES + 1):
    scenes.append((f'stage{i}-start', f'?demo=1&stage={i}&skip=240'))
    scenes.append((f'stage{i}-boss', f'?screen=play&stage={i}&at=999&skip=900'))
fails = 0
def shoot(q):
    """Loads one scene in headless Chrome; returns (screenshot bytes, JS error lines)."""
    with tempfile.TemporaryDirectory() as udir:
        out = os.path.join(udir, 'shot.png')
        cmd = ['google-chrome', '--headless=new', '--disable-extensions', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
               f'--user-data-dir={udir}', '--proxy-server=direct://', '--proxy-bypass-list=*', '--window-size=640,360',
               '--virtual-time-budget=3500', f'--screenshot={out}', BASE + q, '--enable-logging=stderr', '--v=0']
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            err = res.stderr or ''
        except subprocess.TimeoutExpired:
            err = 'TIMEOUT'
        errs = [l for l in err.splitlines() if ('Uncaught' in l or 'TIMEOUT' in l) and 'chrome-extension' not in l and 'extensions::' not in l]
        size = os.path.getsize(out) if os.path.exists(out) else 0
        return size, errs

for name, q in scenes:
    size, errs = shoot(q)
    if not errs and size == 0:
        # Chrome exited without writing a screenshot and without a JS error: a busy box
        # (another headless Chrome running), not the game. One retry before failing.
        size, errs = shoot(q)
    ok = not errs and size > 20000
    if not ok: fails += 1
    print(('OK  ' if ok else 'FAIL'), name.ljust(16), f'{size}B', (errs[0][:160] if errs else ''))
print('SMOKE_OK' if fails == 0 else f'SMOKE_FAILED ({fails})')
sys.exit(1 if fails else 0)
