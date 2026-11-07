# Steam Deck Agent Setup Runbook — Gothic Nocturne

> [!IMPORTANT]
> **Instructions for the Coding Agent on the Steam Deck:**
> Execute all steps below as the standard `deck` user (`/home/deck` or `$HOME`). **Do NOT use `sudo` or `steamos-readonly disable`** — every step works in user-space on SteamOS's immutable filesystem using pre-installed `/usr/bin/python3`, `/usr/bin/flatpak`, and Google Chrome.

## Target Configuration Summary

- **Game Name**: `Gothic Nocturne`
- **Live Auto-Update URL**: `https://gothic.gunaratne.com/?touch=0`
  - The host serves `index.html`, ES modules, and JSON manifests with `Cache-Control: no-cache`, so **every launch on Wi-Fi automatically pulls the latest game update**, multiplayer room (`castle`), and forged castle wings with zero manual patching.
  - `?touch=0` prevents accidental taps on the Steam Deck touchscreen from showing the mobile virtual D-pad overlay.
- **Display Scaling**: `--window-size=1280,800 --force-device-scale-factor=1 --device-scale-factor=1` renders the native `640×360` canvas at an exact **2× integer pixel scale (`1280×720`)** centered cleanly on the Steam Deck's `1280×800` display.
- **Persistent Saves**: Stored in an isolated Chrome profile at `$HOME/.var/app/com.google.Chrome/data/gothic-nocturne` so `localStorage` progression, armory, souls, map cells, and callsign survive updates and never collide with normal Desktop Chrome windows.
- **Steam Deck Selector Screen**: Registered in `shortcuts.vdf` with `LastPlayTime` set to the current timestamp, `"Favorite"` tag, and all 5 custom Steam Grid artwork files (`<appid>.png`, `<appid>p.png`, `<appid>_hero.png`, `<appid>_logo.png`, `<appid>_icon.png`) so **Gothic Nocturne appears immediately in Slot #1 on the Gaming Mode Home Selector Screen ("Recent Games")**, **Favorites**, and **Non-Steam**.

---

## Step 1: Ensure Google Chrome Flatpak & Controller `udev` Access

Flatpak sandboxes block access to `/run/udev` by default, which prevents HTML5 `navigator.getGamepads()` from seeing the Steam Deck's built-in XInput controller. Install `com.google.Chrome` (if not already present) and grant read-only `/run/udev` access:

```bash
set -euo pipefail

if ! flatpak info com.google.Chrome >/dev/null 2>&1; then
  flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
  flatpak install --user -y flathub com.google.Chrome
fi

# Required so Web Gamepad API detects the Steam Deck controller in Gaming Mode
flatpak --user override --filesystem=/run/udev:ro com.google.Chrome
```

---

## Step 2: Create the Kiosk Wrapper Script & Desktop Launcher

Create `$HOME/.local/bin/gothic-nocturne`.
- **Crucial**: `unset LD_LIBRARY_PATH` and `unset LD_PRELOAD` MUST run before `/usr/bin/flatpak`, because Steam injects Scout runtime libraries and `gameoverlayrenderer.so` into child processes, which otherwise crash `flatpak` on startup.
- **Clean Exit**: Resetting `"exit_type":"Normal"` in Chrome's `Preferences` prevents **STEAM → Exit Game** from showing a `"Restore pages?"` bubble on the next launch.

```bash
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.local/share/icons/hicolor/256x256/apps"

cat > "$HOME/.local/bin/gothic-nocturne" << 'EOF'
#!/usr/bin/env bash
# Strip Steam Runtime preload/library paths so /usr/bin/flatpak never crashes
unset LD_LIBRARY_PATH
unset LD_PRELOAD

PROFILE_DIR="$HOME/.var/app/com.google.Chrome/data/gothic-nocturne"
mkdir -p "$PROFILE_DIR/Default"

# Prevent Chrome's "Restore pages? Chrome didn't shut down correctly" bubble after STEAM -> Exit Game
PREFS="$PROFILE_DIR/Default/Preferences"
if [ -f "$PREFS" ]; then
  sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/g; s/"exited_cleanly":false/"exited_cleanly":true/g' "$PREFS" 2>/dev/null || true
fi

URL="${GOTHIC_URL:-https://gothic.gunaratne.com/?touch=0}"

exec /usr/bin/flatpak run \
  --filesystem=/run/udev:ro \
  --command=/app/bin/chrome \
  com.google.Chrome \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --disable-infobars \
  --disable-features=TranslateUI \
  --autoplay-policy=no-user-gesture-required \
  --window-size=1280,800 \
  --force-device-scale-factor=1 \
  --device-scale-factor=1 \
  --kiosk "$URL" "$@"
EOF

chmod +x "$HOME/.local/bin/gothic-nocturne"

cat > "$HOME/.local/share/applications/gothic-nocturne.desktop" << EOF
[Desktop Entry]
Name=Gothic Nocturne
Comment=32-bit era 2.5D gothic side-scrolling action platformer (live updates from gothic.gunaratne.com)
Exec="$HOME/.local/bin/gothic-nocturne"
Path=$HOME/.local/bin
Icon=$HOME/.local/share/icons/hicolor/256x256/apps/gothic-nocturne.png
Terminal=false
Type=Application
Categories=Game;ActionGame;
StartupNotify=false
EOF

chmod +x "$HOME/.local/share/applications/gothic-nocturne.desktop"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
```

---

## Step 3: Render Custom Steam Deck Selector Screen Artwork

Use Headless Chrome (writing inside `$HOME/.var/app/com.google.Chrome/cache/gothic-art`, which is natively bind-mounted inside the Flatpak sandbox) to composite official pixel art (`castle.png`, `sky.png`, `skykeep_backdrop.png`, `mural_throne.png`) and the game's display font (`Almendra-Bold.ttf`) directly from `https://gothic.gunaratne.com` into all 5 Steam Deck UI artwork sizes:

| Asset Key | Dimensions | Steam Deck UI Placement |
| :--- | :--- | :--- |
| `wide.png` → `<appid>.png` | `920 × 430` | **Home Selector Screen** featured card ("Recent Games" slot #1) |
| `portrait.png` → `<appid>p.png` | `600 × 900` | **Library Grid** vertical box-art poster |
| `hero.png` → `<appid>_hero.png` | `1920 × 620` | **Game Details Page** top hero backdrop |
| `logo.png` → `<appid>_logo.png` | `1280 × 720` | **Game Details Page** transparent title logo overlay |
| `icon.png` → `<appid>_icon.png` | `256 × 256` | Small square game icon in lists & Desktop Mode |

Run this script to generate the 5 PNG files:

```bash
ART_DIR="$HOME/.var/app/com.google.Chrome/cache/gothic-art"
rm -rf "$ART_DIR"
mkdir -p "$ART_DIR"

python3 - "$ART_DIR" << 'PYEOF'
import os, subprocess, sys

art_dir = sys.argv[1]
base_url = "https://gothic.gunaratne.com"

COMMON_CSS = f"""
@font-face {{
  font-family: 'Almendra';
  src: url('{base_url}/art/fonts/Almendra-Bold.ttf') format('truetype');
  font-weight: bold;
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 100%; height: 100%; overflow: hidden; background: #07060c; font-family: 'Almendra', Georgia, serif; }}
.pix {{ image-rendering: pixelated; image-rendering: crisp-edges; }}
.title {{
  color: #f6ddb0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  line-height: 0.96;
  text-align: center;
  text-shadow:
    0 3px 0 #2a0d18,
    0 6px 18px rgba(0,0,0,0.95),
    0 0 28px rgba(196,48,68,0.65);
}}
.sub {{
  color: #b8c7e0;
  font-family: ui-monospace, monospace;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  text-shadow: 0 2px 8px #000;
}}
"""

PAGES = {
    "wide": (920, 430, False, f"""<!DOCTYPE html><html><head><style>{COMMON_CSS}
      body {{ position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 34px; }}
      .sky {{ position: absolute; inset: 0; background: url('{base_url}/assets/sky.png') center top / cover no-repeat; opacity: 0.9; }}
      .castle {{ position: absolute; inset: 0; background: url('{base_url}/assets/castle.png') center bottom / cover no-repeat; }}
      .vignette {{ position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 42%, rgba(20,12,38,0.12) 0%, rgba(7,6,12,0.88) 100%), linear-gradient(180deg, rgba(7,6,12,0.15) 0%, rgba(7,6,12,0.88) 100%); }}
      .wrap {{ position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 10px; }}
      .rule {{ width: 320px; height: 2px; background: linear-gradient(90deg, transparent, #c99b4b, transparent); }}
      .title {{ font-size: 68px; }}
      .sub {{ font-size: 13px; }}
    </style></head><body class="pix">
      <div class="sky"></div><div class="castle"></div><div class="vignette"></div>
      <div class="wrap">
        <div class="title">Gothic Nocturne</div>
        <div class="rule"></div>
        <div class="sub">The Midnight Hunt</div>
      </div>
    </body></html>"""),

    "portrait": (600, 900, False, f"""<!DOCTYPE html><html><head><style>{COMMON_CSS}
      body {{ position: relative; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 54px 28px 46px; border: 2px solid rgba(182,138,68,0.45); }}
      .sky {{ position: absolute; inset: 0; background: url('{base_url}/assets/skykeep_backdrop.png') 52% top / cover no-repeat; }}
      .mural {{ position: absolute; left: 0; right: 0; top: 18%; height: 55%; background: url('{base_url}/assets/mural_throne.png') center / cover no-repeat; opacity: 0.42; mix-blend-mode: screen; }}
      .castle {{ position: absolute; left: -120px; right: -120px; bottom: 0; height: 62%; background: url('{base_url}/assets/castle.png') center bottom / cover no-repeat; }}
      .vignette {{ position: absolute; inset: 0; background: linear-gradient(180deg, rgba(7,6,12,0.85) 0%, rgba(16,10,28,0.28) 46%, rgba(7,6,12,0.94) 100%); }}
      .top, .bot {{ position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; }}
      .title {{ font-size: 74px; letter-spacing: 0.06em; }}
      .rule {{ width: 260px; height: 2px; margin-top: 14px; background: linear-gradient(90deg, transparent, #d4a454, transparent); }}
      .sub {{ font-size: 13px; color: #ffd27a; letter-spacing: 0.24em; }}
    </style></head><body class="pix">
      <div class="sky"></div><div class="mural"></div><div class="castle"></div><div class="vignette"></div>
      <div class="top">
        <div class="title">Gothic<br>Nocturne</div>
        <div class="rule"></div>
      </div>
      <div class="bot"><div class="sub">XVIII Realms of the Count</div></div>
    </body></html>"""),

    "hero": (1920, 620, False, f"""<!DOCTYPE html><html><head><style>{COMMON_CSS}
      body {{ position: relative; }}
      .sky {{ position: absolute; inset: 0; background: url('{base_url}/assets/skykeep_backdrop.png') center top / cover no-repeat; }}
      .castle {{ position: absolute; inset: 0; background: url('{base_url}/assets/castle.png') center 75% / cover no-repeat; }}
      .vignette {{ position: absolute; inset: 0; background: linear-gradient(90deg, rgba(7,6,12,0.82) 0%, rgba(7,6,12,0.18) 55%, rgba(7,6,12,0.72) 100%), linear-gradient(180deg, rgba(7,6,12,0.2) 0%, rgba(7,6,12,0.92) 100%); }}
    </style></head><body class="pix"><div class="sky"></div><div class="castle"></div><div class="vignette"></div></body></html>"""),

    "logo": (1280, 720, True, f"""<!DOCTYPE html><html><head><style>{COMMON_CSS}
      html, body {{ background: transparent !important; display: flex; align-items: flex-end; justify-content: flex-start; padding: 0 0 56px 56px; }}
      .box {{ display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }}
      .title {{ font-size: 108px; text-align: left; }}
      .rule {{ width: 460px; height: 3px; background: linear-gradient(90deg, #ffd27a, rgba(201,59,74,0.8), transparent); }}
      .sub {{ font-size: 16px; color: #e2d4b7; }}
    </style></head><body>
      <div class="box">
        <div class="title">Gothic<br>Nocturne</div>
        <div class="rule"></div>
        <div class="sub">32-Bit Gothic Action Platformer</div>
      </div>
    </body></html>"""),

    "icon": (256, 256, False, f"""<!DOCTYPE html><html><head><style>{COMMON_CSS}
      body {{ position: relative; display: flex; align-items: center; justify-content: center; border: 4px solid #b68a44; background: radial-gradient(circle at 50% 38%, #34162c 0%, #090712 78%); }}
      .castle {{ position: absolute; inset: 0; background: url('{base_url}/assets/mural_throne.png') center / cover no-repeat; opacity: 0.35; }}
      .glyph {{ position: relative; z-index: 2; font-size: 138px; color: #ffd27a; text-shadow: 0 4px 0 #3a101e, 0 0 24px rgba(214,56,76,0.85); }}
    </style></head><body class="pix"><div class="castle"></div><div class="glyph">G</div></body></html>"""),
}

env = {k: v for k, v in os.environ.items() if k not in ("LD_LIBRARY_PATH", "LD_PRELOAD")}

for name, (w, h, transparent, html) in PAGES.items():
    html_path = os.path.join(art_dir, f"{name}.html")
    png_path = os.path.join(art_dir, f"{name}.png")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    cmd = [
        "/usr/bin/flatpak", "run", "--command=/app/bin/chrome", "com.google.Chrome",
        "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", "--virtual-time-budget=5000",
        f"--window-size={w},{h}",
        f"--screenshot={png_path}",
    ]
    if transparent:
        cmd.append("--default-background-color=00000000")
    cmd.append(f"file://{html_path}")
    subprocess.run(cmd, env=env, check=True)
    print(f"Rendered {png_path} ({os.path.getsize(png_path)} bytes)")
PYEOF

cp "$ART_DIR/icon.png" "$HOME/.local/share/icons/hicolor/256x256/apps/gothic-nocturne.png"
```

---

## Step 4: Safely Stop Steam, Update `shortcuts.vdf` + `grid/`, and Reload Selector Screen

> [!WARNING]
> **Why stopping Steam before writing `shortcuts.vdf` matters:**
> If Steam is running while `shortcuts.vdf` is edited on disk, Steam will either ignore the change until restarted or overwrite `shortcuts.vdf` from memory during shutdown.
> However, **check ancestor PIDs first** so that if you (the coding agent) are running inside a terminal nested under `gamescope-session`, you do NOT kill your own parent process!

Run this all-in-one registration & reload script (uses 100% Python 3 standard library — no `pip` or external packages required):

```bash
python3 - << 'PYEOF'
import glob
import os
import shutil
import struct
import subprocess
import sys
import time
import zlib

HOME = os.path.expanduser("~")
EXE_RAW = os.path.join(HOME, ".local/bin/gothic-nocturne")
EXE_QUOTED = f'"{EXE_RAW}"'
START_DIR_QUOTED = f'"{os.path.dirname(EXE_RAW)}"'
ICON_PATH = os.path.join(HOME, ".local/share/icons/hicolor/256x256/apps/gothic-nocturne.png")
DESKTOP_PATH = os.path.join(HOME, ".local/share/applications/gothic-nocturne.desktop")
ART_DIR = os.path.join(HOME, ".var/app/com.google.Chrome/cache/gothic-art")
APP_NAME = "Gothic Nocturne"

# Deterministic unsigned 32-bit Non-Steam AppID used by Steam & grid/ filenames
APPID = (zlib.crc32((EXE_QUOTED + APP_NAME).encode("utf-8")) & 0xFFFFFFFF) | 0x80000000

# ---------------- Pure-Stdlib Binary VDF (shortcuts.vdf) Codec ----------------
BIN_MAP = 0x00
BIN_STR = 0x01
BIN_INT32 = 0x02
BIN_FLOAT32 = 0x03
BIN_PTR = 0x04
BIN_WIDESTR = 0x05
BIN_COLOR = 0x06
BIN_UINT64 = 0x07
BIN_END = 0x08
BIN_INT64 = 0x0A


def read_cstr(buf, pos):
    end = buf.index(0, pos)
    return buf[pos:end].decode("utf-8", errors="replace"), end + 1


def parse_binary_vdf(buf, pos=0):
    out = {}
    n = len(buf)
    while pos < n:
        t = buf[pos]
        pos += 1
        if t == BIN_END:
            break
        key, pos = read_cstr(buf, pos)
        if t == BIN_MAP:
            val, pos = parse_binary_vdf(buf, pos)
            out[key] = ("map", val)
        elif t == BIN_STR:
            val, pos = read_cstr(buf, pos)
            out[key] = ("str", val)
        elif t in (BIN_INT32, BIN_PTR, BIN_COLOR):
            val = struct.unpack_from("<I", buf, pos)[0]
            pos += 4
            out[key] = (t, val)
        elif t == BIN_FLOAT32:
            val = struct.unpack_from("<f", buf, pos)[0]
            pos += 4
            out[key] = (t, val)
        elif t in (BIN_UINT64, BIN_INT64):
            val = struct.unpack_from("<Q", buf, pos)[0]
            pos += 8
            out[key] = (t, val)
        elif t == BIN_WIDESTR:
            end = pos
            while end + 1 < n and not (buf[end] == 0 and buf[end + 1] == 0):
                end += 2
            val = buf[pos:end].decode("utf-16-le", errors="replace")
            pos = end + 2
            out[key] = (t, val)
        else:
            raise ValueError(f"Unsupported binary VDF tag 0x{t:02x} at byte {pos - 1}")
    return out, pos


def dump_binary_vdf(mapping):
    chunks = bytearray()
    for key, (t, val) in mapping.items():
        kbytes = key.encode("utf-8") + b"\x00"
        if t == "map":
            chunks.append(BIN_MAP)
            chunks.extend(kbytes)
            chunks.extend(dump_binary_vdf(val))
        elif t == "str":
            chunks.append(BIN_STR)
            chunks.extend(kbytes)
            chunks.extend(str(val).encode("utf-8") + b"\x00")
        elif t in ("int", BIN_INT32, BIN_PTR, BIN_COLOR):
            tag = BIN_INT32 if t == "int" else t
            chunks.append(tag)
            chunks.extend(kbytes)
            chunks.extend(struct.pack("<I", int(val) & 0xFFFFFFFF))
        elif t == BIN_FLOAT32:
            chunks.append(BIN_FLOAT32)
            chunks.extend(kbytes)
            chunks.extend(struct.pack("<f", float(val)))
        elif t in (BIN_UINT64, BIN_INT64):
            chunks.append(t)
            chunks.extend(kbytes)
            chunks.extend(struct.pack("<Q", int(val) & 0xFFFFFFFFFFFFFFFF))
        elif t == BIN_WIDESTR:
            chunks.append(BIN_WIDESTR)
            chunks.extend(kbytes)
            chunks.extend(str(val).encode("utf-16-le") + b"\x00\x00")
    chunks.append(BIN_END)
    return bytes(chunks)


# ---------------- Safe Steam Session Detection ----------------
def ancestor_comm_names():
    names = set()
    pid = os.getpid()
    while pid > 1:
        try:
            with open(f"/proc/{pid}/comm", "r", encoding="utf-8") as f:
                names.add(f.read().strip())
            with open(f"/proc/{pid}/ status" if False else f"/proc/{pid}/stat", "r", encoding="utf-8") as f:
                stat = f.read()
            ppid = int(stat[stat.rfind(")") + 2:].split()[1])
            if ppid == pid:
                break
            pid = ppid
        except Exception:
            break
    return names


def proc_running(name):
    return subprocess.run(["pgrep", "-x", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def wait_steam_exit(timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not proc_running("steam"):
            return True
        time.sleep(0.5)
    return not proc_running("steam")


ancestors = ancestor_comm_names()
in_gamescope_tree = any("gamescope" in a for a in ancestors)
was_gamescope_active = (
    subprocess.run(["systemctl", "--user", "is-active", "--quiet", "gamescope-session"]).returncode == 0
    or proc_running("gamescope")
)
was_desktop_steam_active = (not was_gamescope_active) and proc_running("steam")

restart_mode = "none"
if was_gamescope_active and not in_gamescope_tree:
    print("Gaming Mode active (agent is on SSH/background) -> stopping gamescope-session cleanly before VDF edit...")
    subprocess.run(["systemctl", "--user", "stop", "gamescope-session"], check=False)
    wait_steam_exit(15.0)
    restart_mode = "gamescope"
elif was_desktop_steam_active:
    print("Desktop Steam active -> shutting down Steam cleanly before VDF edit...")
    subprocess.run(["steam", "-shutdown"], check=False)
    wait_steam_exit(15.0)
    restart_mode = "desktop_steam"
elif was_gamescope_active and in_gamescope_tree:
    print("Agent is running inside gamescope-session -> will also invoke steamos-add-to-steam live.")
    restart_mode = "live_inside_gamescope"

# ---------------- Locate All Steam Userdata Directories ----------------
userdata_roots = set()
for candidate in [
    os.path.join(HOME, ".local/share/Steam/userdata"),
    os.path.join(HOME, ".steam/steam/userdata"),
]:
    if os.path.isdir(candidate):
        userdata_roots.add(os.path.realpath(candidate))

user_dirs = []
for root in sorted(userdata_roots):
    for entry in sorted(os.listdir(root)):
        full = os.path.join(root, entry)
        if entry.isdigit() and int(entry) > 0 and os.path.isdir(full):
            user_dirs.append(full)

if not user_dirs:
    raise RuntimeError("No Steam userdata/<STEAM_ID3> directories found! Log into Steam once on the Deck first.")

now_ts = int(time.time())


def build_shortcut_entry(existing_map=None):
    base = dict(existing_map) if existing_map else {}
    base["appid"] = ("int", APPID)
    base["AppName"] = ("str", APP_NAME)
    base["Exe"] = ("str", EXE_QUOTED)
    base["StartDir"] = ("str", START_DIR_QUOTED)
    base["icon"] = ("str", ICON_PATH)
    base["ShortcutPath"] = ("str", "")
    base["LaunchOptions"] = ("str", "")
    base["IsHidden"] = ("int", 0)
    base["AllowDesktopConfig"] = ("int", 1)
    base["AllowOverlay"] = ("int", 1)
    base["OpenVR"] = ("int", 0)
    base["Devkit"] = ("int", 0)
    base["DevkitGameID"] = ("str", "")
    base["DevkitOverrideAppID"] = ("int", 0)
    # Non-zero LastPlayTime places Gothic Nocturne in Slot #1 of the Gaming Mode Home Selector ("Recent Games")
    base["LastPlayTime"] = ("int", now_ts)
    base["FlatpakAppID"] = ("str", "")
    tags = dict(base.get("tags", ("map", {}))[1])
    if not any(v[1] == "Favorite" for v in tags.values() if v[0] == "str"):
        tags[str(len(tags))] = ("str", "Favorite")
    base["tags"] = ("map", tags)
    return ("map", base)


def install_grid_art(grid_dir, target_appid):
    os.makedirs(grid_dir, exist_ok=True)
    mapping = {
        "wide.png": f"{target_appid}.png",
        "portrait.png": f"{target_appid}p.png",
        "hero.png": f"{target_appid}_hero.png",
        "logo.png": f"{target_appid}_logo.png",
        "icon.png": f"{target_appid}_icon.png",
    }
    for src_name, dst_name in mapping.items():
        src = os.path.join(ART_DIR, src_name)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(grid_dir, dst_name))


for udir in user_dirs:
    cfg_dir = os.path.join(udir, "config")
    os.makedirs(cfg_dir, exist_ok=True)
    vdf_path = os.path.join(cfg_dir, "shortcuts.vdf")

    root = {}
    if os.path.isfile(vdf_path) and os.path.getsize(vdf_path) > 0:
        backup = f"{vdf_path}.bak.{now_ts}"
        shutil.copy2(vdf_path, backup)
        with open(vdf_path, "rb") as f:
            raw = f.read()
        root, _ = parse_binary_vdf(raw)

    sc_key = next((k for k in root if k.lower() == "shortcuts"), "shortcuts")
    shortcuts = dict(root.get(sc_key, ("map", {}))[1])

    matched_idx = None
    existing_appids = {APPID}
    for idx, (t, entry) in shortcuts.items():
        if t != "map":
            continue
        name_val = entry.get("AppName", entry.get("appname", ("str", "")))[1]
        exe_val = entry.get("Exe", entry.get("exe", ("str", "")))[1]
        if name_val == APP_NAME or "gothic-nocturne" in str(exe_val):
            matched_idx = idx
            if "appid" in entry:
                existing_appids.add(int(entry["appid"][1]) & 0xFFFFFFFF)
            break

    if matched_idx is not None:
        shortcuts[matched_idx] = build_shortcut_entry(shortcuts[matched_idx][1])
        print(f"[{os.path.basename(udir)}] Updated existing shortcut #{matched_idx} (AppID={APPID})")
    else:
        next_idx = str(max([int(k) for k in shortcuts if k.isdigit()] + [-1]) + 1)
        shortcuts[next_idx] = build_shortcut_entry()
        print(f"[{os.path.basename(udir)}] Added shortcut #{next_idx} (AppID={APPID})")

    root[sc_key] = ("map", shortcuts)
    encoded = dump_binary_vdf(root)
    # Verify round-trip parse before writing
    verify, end_pos = parse_binary_vdf(encoded)
    assert end_pos == len(encoded), "Binary VDF round-trip verification failed"

    tmp_path = f"{vdf_path}.tmp"
    with open(tmp_path, "wb") as f:
        f.write(encoded)
    os.replace(tmp_path, vdf_path)

    grid_dir = os.path.join(cfg_dir, "grid")
    for aid in existing_appids:
        install_grid_art(grid_dir, aid)
    print(f"[{os.path.basename(udir)}] Installed 5 Steam Deck grid artwork files for AppID(s): {sorted(existing_appids)}")

# ---------------- Restart / Reload Steam UI ----------------
if restart_mode == "gamescope":
    print("Restarting Gaming Mode (gamescope-session)...")
    subprocess.run(["systemctl", "--user", "start", "gamescope-session"], check=False)
elif restart_mode == "desktop_steam":
    print("Relaunching Desktop Steam in background...")
    subprocess.Popen(["steam", "-silent"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
elif restart_mode == "live_inside_gamescope":
    if os.path.isfile("/usr/bin/steamos-add-to-steam"):
        subprocess.run(["/usr/bin/steamos-add-to-steam", DESKTOP_PATH], check=False)
    print("NOTE: Restart Steam or reboot the Deck once finished so Gaming Mode reloads shortcuts & custom artwork.")

print("Setup complete!")
PYEOF
```

---

## Step 5: Post-Setup Verification Checklist

Before finishing, run these checks and report the output back to the user:

1. **Launcher & Permissions**:
   ```bash
   test -x "$HOME/.local/bin/gothic-nocturne" && echo "launcher OK"
   flatpak info --show-permissions com.google.Chrome | grep -E "udev|filesystems" || true
   curl -fsSI https://gothic.gunaratne.com/ | head -n 5
   ```
2. **Shortcuts & Grid Artwork**:
   - Confirm `shortcuts.vdf` contains `Gothic Nocturne` with `Exe = "/home/deck/.local/bin/gothic-nocturne"` and non-zero `LastPlayTime`.
   - Confirm all 5 artwork files (`<appid>.png`, `<appid>p.png`, `<appid>_hero.png`, `<appid>_logo.png`, `<appid>_icon.png`) exist and are non-empty inside `~/.local/share/Steam/userdata/<STEAM_ID3>/config/grid/`.

---

## Controller Layout Notes (For the User in Gaming Mode)

All primary controls work out of the box with Steam's default **Gamepad with Mouse Trackpad** layout:
- **D-Pad / Left Stick**: Move, Crouch, Enter doorways (`↑`)
- **`A` / `B`**: Jump (hold for height; `↓` + `A` slide/divekick)
- **`X` / `RB`**: Left Hand Weapon (Whip) · `↑` + `X` throws Sub-Weapon
- **`Y` / `RT`**: Right Hand Weapon · `↑` + `Y` casts Crimson Soul
- **`LB`**: Backdash / Lodestone Grapple · **`LT`**: Swap Loadout (`SET A` ↔ `SET B`)
- **`View` (Top-Left)**: Castle Map · **`Menu` (Top-Right)**: Pause / Start
- **`L3`**: Toggle PostFX Shaders · **`R3`**: Mute Audio

**Optional Rear Grip Paddle Bindings** (via the **Controller icon** on the Gothic Nocturne game page in Gaming Mode):
- **`L4` → `E` key**: Open Hunter's Grimoire (`Armory` · `Souls` · `Bestiary`)
- **`R4` → `G` key**: Salute nearby multiplayer hunters
- **`L5` → `B` key**: Open Bestiary directly
- **`R5` → `P` key**: Open Castle Forge (press **STEAM + X** to open the on-screen keyboard)
- **Exit Game**: Press the physical **STEAM** button → **Exit Game**.
