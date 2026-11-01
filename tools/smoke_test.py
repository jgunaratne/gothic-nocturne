#!/usr/bin/env python3
"""Runtime smoke test: load every stage (plus title, map, ending) in headless
Chrome and fail on any uncaught JS error or missing render. Catches the class of
bug `node --check` cannot (missing imports, bad frame names, draw-time throws)."""
import os, subprocess, sys, tempfile

BASE = 'http://127.0.0.1:8711/'
N_STAGES = int(sys.argv[1]) if len(sys.argv) > 1 else 13
scenes = [('title', '?skip=40'), ('map', '?screen=stageselect&skip=20'), ('ending', '?screen=ending&skip=700')]
for i in range(1, N_STAGES + 1):
    scenes.append((f'stage{i}-start', f'?demo=1&stage={i}&skip=240'))
    scenes.append((f'stage{i}-boss', f'?screen=play&stage={i}&at=999&skip=900'))
fails = 0
for name, q in scenes:
    with tempfile.TemporaryDirectory() as udir:
        out = os.path.join(udir, 'shot.png')
        cmd = ['google-chrome', '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
               f'--user-data-dir={udir}', '--proxy-server=direct://', '--proxy-bypass-list=*', '--window-size=640,360',
               '--virtual-time-budget=3500', f'--screenshot={out}', BASE + q, '--enable-logging=stderr', '--v=0']
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            err = res.stderr or ''
        except subprocess.TimeoutExpired:
            err = 'TIMEOUT'
        errs = [l for l in err.splitlines() if ('Uncaught' in l or 'TIMEOUT' in l) and 'chrome-extension' not in l]
        size = os.path.getsize(out) if os.path.exists(out) else 0
        ok = not errs and size > 20000
        if not ok: fails += 1
        print(('OK  ' if ok else 'FAIL'), name.ljust(16), f'{size}B', (errs[0][:160] if errs else ''))
print('SMOKE_OK' if fails == 0 else f'SMOKE_FAILED ({fails})')
sys.exit(1 if fails else 0)
