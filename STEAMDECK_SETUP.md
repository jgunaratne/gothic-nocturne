# Steam Deck Agent Setup Runbook — Gothic Nocturne (Local SSD + Live Auto-Update)

> [!IMPORTANT]
> **Instructions for the Coding Agent on the Steam Deck:**
> Execute all steps below as the standard `deck` user (`$HOME` = `/home/deck`). **Do NOT use `sudo` or `steamos-readonly disable`** — every step runs cleanly in user-space on SteamOS's immutable filesystem using `/usr/bin/python3`, `/usr/bin/flatpak`, and Google Chrome.

## Architecture Overview

1. **Instant Local NVMe Loading (`$HOME/.local/share/gothic-nocturne/site/`)**:
   - All ~515 game files (~147 MB of pixel-art sprite sheets, 3D wall/floor textures, bitmap fonts, ES modules, 26 Lyria `.mp3` music tracks, 22 Daikon `.mp3` boss voices, 39 SFX clips, and forged castle wings) are stored locally on the Steam Deck's SSD and served by a lightweight Python 3 stdlib edge server (`gothic-edge.py`) on `http://127.0.0.1:8711/?touch=0` (with `206 Partial Content` byte-range streaming).
   - **Zero idle overhead**: `gothic-edge.py` starts automatically when you launch the game and exits automatically via `trap` when you quit (**STEAM → Exit Game**).
2. **Automatic Incremental Game Updates from `https://gothic.gunaratne.com`**:
   - On every launch (~0.3s on Wi-Fi), `gothic-edge.py --sync-boot` checks `https://gothic.gunaratne.com` over parallel keep-alive HTTPS connections:
     - Updates any changed `.html`, `.js`, or `.json` files immediately (recursively discovering any newly added ES modules, sprite sheets in `atlas.json`, music/voices in `audio.js`, or forged wings in `forge/stages.json`).
     - Downloads any newly added `.png`/`.mp3` assets immediately, re-verifies existing binary assets whenever `ASSET_VERSION` bumps (plus quietly in a background thread after boot), and acts as a read-through SSD cache for newly forged wings.
   - **Offline-ready (flights / commutes)**: If `gothic.gunaratne.com` is unreachable within `1.2s`, sync skips immediately and the game boots at full speed from the local SSD copy.
3. **Live Global Multiplayer & Castle Forge**:
   - `gothic-edge.py` transparently tunnels `/ws` → `wss://gothic.gunaratne.com/ws` and proxies `/api/*` → `https://gothic.gunaratne.com/api/*`, so hunters on the Steam Deck still share the live `castle` multiplayer realm and Castle Forge when on Wi-Fi.
4. **Steam Deck Display, Controller & Home Selector Screen**:
   - `--window-size=1280,800 --force-device-scale-factor=1 --device-scale-factor=1` renders the native `640×360` canvas at an exact **2× integer pixel scale (`1280×720`)** centered on the `1280×800` screen, with `?touch=0` keeping the mobile virtual D-pad hidden.
   - Save data (`localStorage`) persists permanently on origin `http://127.0.0.1:8711` inside an isolated Chrome profile (`$HOME/.var/app/com.google.Chrome/data/gothic-nocturne`).
   - Registered in `shortcuts.vdf` with `LastPlayTime = now`, `"Favorite"` tag, and all 5 custom Steam Grid images (`<appid>.png`, `<appid>p.png`, `<appid>_hero.png`, `<appid>_logo.png`, `<appid>_icon.png`) so **Gothic Nocturne appears immediately in Slot #1 on the Gaming Mode Home Selector Screen ("Recent Games")**.

---

## Step 1: Ensure Google Chrome Flatpak & Controller `udev` Access

```bash
set -euo pipefail

if ! flatpak info com.google.Chrome >/dev/null 2>&1; then
  flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
  flatpak install --user -y flathub com.google.Chrome
fi

# Required so HTML5 navigator.getGamepads() detects the Steam Deck controller in Gaming Mode
flatpak --user override --filesystem=/run/udev:ro com.google.Chrome
```

---

## Step 2: Install Local SSD Edge Server, Initial Asset Mirror & Launcher

Write `gothic-edge.py` (`$HOME/.local/share/gothic-nocturne/gothic-edge.py`), perform the full initial download of all code and assets from `https://gothic.gunaratne.com` onto the Steam Deck SSD, and create the `$HOME/.local/bin/gothic-nocturne` Kiosk launcher + `.desktop` entry:

```bash
mkdir -p \
  "$HOME/.local/bin" \
  "$HOME/.local/share/gothic-nocturne/site" \
  "$HOME/.local/share/applications" \
  "$HOME/.local/share/icons/hicolor/256x256/apps"

cat > "$HOME/.local/share/gothic-nocturne/gothic-edge.py" << 'PYEOF'
#!/usr/bin/env python3
"""Local SSD cache, delta auto-updater, and live multiplayer/forge proxy for Gothic Nocturne."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
import re
import select
import shutil
import socket
import ssl
import sys
import threading
import urllib.parse

DEFAULT_UPSTREAM = os.environ.get("GOTHIC_UPSTREAM", "https://gothic.gunaratne.com")
DEFAULT_SITE_DIR = os.path.expanduser("~/.local/share/gothic-nocturne/site")
DEFAULT_STATE_FILE = os.path.expanduser("~/.local/share/gothic-nocturne/sync_state.json")

MIME_OVERRIDES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".ttf": "font/ttf",
    ".woff2": "font/woff2",
}

IMPORT_RE = re.compile(r"""(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+\.js)['"]""")
ASSET_VER_RE = re.compile(r"""ASSET_VERSION\s*=\s*['"]([^'"]+)['"]""")
AUDIO_MP3_RE = re.compile(r"""['"](assets/(?:music|voice)/[^'"]+\.mp3)['"]""")
SFX_BLOCK_RE = re.compile(r"""for\s*\(\s*const\s+n\s+of\s*\[(.*?)\]\s*\)\s*this\.ensureSfx""", re.S)
FORGE_ASSET_RE = re.compile(r'"(forge/[^"]+\.(?:png|mp3|jpg|webp|wav|ogg|json))"')


class UpstreamPool:
    """Thread-local HTTP/HTTPS keep-alive connection pool to gothic.gunaratne.com."""

    def __init__(self, upstream_url: str, timeout: float = 8.0):
        parsed = urllib.parse.urlsplit(upstream_url.rstrip("/"))
        self.scheme = parsed.scheme or "https"
        self.host = parsed.hostname or "gothic.gunaratne.com"
        self.port = parsed.port or (443 if self.scheme == "https" else 80)
        self.base_path = parsed.path.rstrip("/")
        self.timeout = timeout
        self._local = threading.local()
        self._ssl_ctx = ssl.create_default_context() if self.scheme == "https" else None

    def _new_conn(self, timeout=None):
        t = timeout if timeout is not None else self.timeout
        if self.scheme == "https":
            return http.client.HTTPSConnection(self.host, self.port, timeout=t, context=self._ssl_ctx)
        return http.client.HTTPConnection(self.host, self.port, timeout=t)

    def _get_conn(self):
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = self._new_conn()
            self._local.conn = conn
        return conn

    def _reset_conn(self):
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
            self._local.conn = None

    def request(self, method: str, rel_path: str, headers=None, timeout=None):
        path = "/" + rel_path.lstrip("/")
        if self.base_path:
            path = self.base_path + path
        hdrs = {"Host": self.host, "User-Agent": "GothicSteamDeck/1.0", "Connection": "keep-alive"}
        if headers:
            hdrs.update(headers)
        for attempt in range(2):
            conn = self._new_conn(timeout) if timeout is not None else self._get_conn()
            try:
                conn.request(method, path, headers=hdrs)
                resp = conn.getresponse()
                body = resp.read() if method != "HEAD" else b""
                if method == "HEAD":
                    resp.read()
                info = {
                    "status": resp.status,
                    "etag": resp.getheader("ETag") or "",
                    "last_modified": resp.getheader("Last-Modified") or "",
                    "content_length": int(resp.getheader("Content-Length") or len(body)),
                    "content_type": resp.getheader("Content-Type") or "",
                    "body": body,
                }
                if timeout is not None:
                    conn.close()
                return info
            except Exception:
                if timeout is not None:
                    try:
                        conn.close()
                    except Exception:
                        pass
                else:
                    self._reset_conn()
                if attempt == 1:
                    raise


def atomic_write(dest: str, data: bytes):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = f"{dest}.tmp.{os.getpid()}.{threading.get_ident()}"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, dest)


def load_state(state_file: str) -> dict:
    try:
        with open(state_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"asset_version": "", "files": {}}


def save_state(state_file: str, state: dict):
    atomic_write(state_file, json.dumps(state, indent=1, sort_keys=True).encode("utf-8"))


def sync_file(pool: UpstreamPool, site_dir: str, state_files: dict, rel: str, force_get: bool = False, check_remote: bool = True) -> str:
    local_path = os.path.join(site_dir, rel)
    exists = os.path.isfile(local_path)
    meta = state_files.get(rel, {})

    if exists and not force_get and not check_remote:
        return "cached"

    req_headers = {}
    if exists and not force_get:
        if meta.get("etag"):
            req_headers["If-None-Match"] = meta["etag"]
        elif meta.get("last_modified"):
            req_headers["If-Modified-Since"] = meta["last_modified"]
        else:
            head = pool.request("HEAD", rel)
            if head["status"] == 404:
                return "missing"
            if head["status"] == 200 and head["content_length"] > 0 and os.path.getsize(local_path) == head["content_length"]:
                state_files[rel] = {
                    "size": head["content_length"],
                    "etag": head["etag"],
                    "last_modified": head["last_modified"],
                }
                return "unchanged"

    if force_get:
        req_headers["Cache-Control"] = "no-cache"

    res = pool.request("GET", rel, headers=req_headers)
    if res["status"] == 304 and exists:
        return "unchanged"
    if res["status"] != 200:
        return "missing"

    body = res["body"]
    if exists:
        try:
            with open(local_path, "rb") as f:
                if f.read() == body:
                    state_files[rel] = {
                        "size": len(body),
                        "etag": res["etag"],
                        "last_modified": res["last_modified"],
                    }
                    return "unchanged"
        except Exception:
            pass

    atomic_write(local_path, body)
    state_files[rel] = {
        "size": len(body),
        "etag": res["etag"],
        "last_modified": res["last_modified"],
    }
    return "updated"


def discover_and_sync(upstream_url: str, site_dir: str, state_file: str, mode: str = "boot", workers: int = 12) -> bool:
    os.makedirs(site_dir, exist_ok=True)
    pool = UpstreamPool(upstream_url, timeout=8.0)

    probe_timeout = 1.2 if mode == "boot" else 10.0
    try:
        idx_res = pool.request("GET", "index.html", headers={"Cache-Control": "no-cache"}, timeout=probe_timeout)
        if idx_res["status"] != 200:
            raise RuntimeError(f"Upstream HTTP {idx_res['status']}")
    except Exception as e:
        print(f"[gothic-sync] Offline or unreachable ({e}); serving from local SSD cache.", file=sys.stderr)
        return False

    state = load_state(state_file)
    state_files = state.setdefault("files", {})
    lock = threading.Lock()
    updated_count = 0

    def write_if_changed(rel: str, res_obj: dict):
        nonlocal updated_count
        lp = os.path.join(site_dir, rel)
        body = res_obj["body"]
        changed = True
        if os.path.isfile(lp):
            try:
                with open(lp, "rb") as f:
                    if f.read() == body:
                        changed = False
            except Exception:
                pass
        if changed:
            atomic_write(lp, body)
            with lock:
                updated_count += 1
        with lock:
            state_files[rel] = {
                "size": len(body),
                "etag": res_obj["etag"],
                "last_modified": res_obj["last_modified"],
            }

    write_if_changed("index.html", idx_res)

    # Recursively walk and sync all ES modules imported from src/main.js
    visited_js = set()
    frontier = {"src/main.js"}
    with ThreadPoolExecutor(max_workers=workers) as ex:
        while frontier:
            batch = sorted(frontier - visited_js)
            if not batch:
                break
            visited_js.update(batch)
            futs = {ex.submit(pool.request, "GET", rel, {"Cache-Control": "no-cache"}): rel for rel in batch}
            next_frontier = set()
            for fut in as_completed(futs):
                rel = futs[fut]
                try:
                    res = fut.result()
                except Exception:
                    continue
                if res["status"] != 200:
                    continue
                write_if_changed(rel, res)
                text = res["body"].decode("utf-8", errors="replace")
                cur_dir = os.path.dirname(rel)
                for m in IMPORT_RE.finditer(text):
                    dep = os.path.normpath(os.path.join(cur_dir, m.group(1))).replace("\\", "/")
                    if not dep.startswith("..") and dep not in visited_js:
                        next_frontier.add(dep)
            frontier = next_frontier

        manifests = ["assets/atlas.json", "assets/font_gothic.json", "assets/forge/stages.json"]
        mfuts = {ex.submit(pool.request, "GET", m, {"Cache-Control": "no-cache"}): m for m in manifests}
        for fut in as_completed(mfuts):
            rel = mfuts[fut]
            try:
                res = fut.result()
                if res["status"] == 200:
                    write_if_changed(rel, res)
            except Exception:
                pass

    asset_rels = {"art/fonts/Almendra-Bold.ttf"}
    constants_path = os.path.join(site_dir, "src/engine/constants.js")
    new_asset_ver = ""
    if os.path.isfile(constants_path):
        with open(constants_path, "r", encoding="utf-8") as f:
            m = ASSET_VER_RE.search(f.read())
            if m:
                new_asset_ver = m.group(1)

    atlas_path = os.path.join(site_dir, "assets/atlas.json")
    if os.path.isfile(atlas_path):
        try:
            with open(atlas_path, "r", encoding="utf-8") as f:
                atlas = json.load(f)
            for v in atlas.values():
                if isinstance(v, dict) and v.get("file"):
                    asset_rels.add("assets/" + v["file"].lstrip("/"))
        except Exception:
            pass

    font_meta_path = os.path.join(site_dir, "assets/font_gothic.json")
    if os.path.isfile(font_meta_path):
        try:
            with open(font_meta_path, "r", encoding="utf-8") as f:
                fg = json.load(f)
            for c in fg.get("caps", {}).values():
                if isinstance(c, dict) and c.get("file"):
                    asset_rels.add("assets/" + c["file"].lstrip("/"))
        except Exception:
            pass

    audio_path = os.path.join(site_dir, "src/engine/audio.js")
    if os.path.isfile(audio_path):
        with open(audio_path, "r", encoding="utf-8") as f:
            audio_src = f.read()
        asset_rels.update(AUDIO_MP3_RE.findall(audio_src))
        sfx_m = SFX_BLOCK_RE.search(audio_src)
        if sfx_m:
            for sfx_name in re.findall(r"'([a-z0-9_]+)'", sfx_m.group(1)):
                asset_rels.add(f"assets/sfx/{sfx_name}.mp3")

    forge_path = os.path.join(site_dir, "assets/forge/stages.json")
    if os.path.isfile(forge_path):
        try:
            with open(forge_path, "r", encoding="utf-8") as f:
                forge_raw = f.read()
            for fm in FORGE_ASSET_RE.findall(forge_raw):
                asset_rels.add("assets/" + fm.lstrip("/"))
        except Exception:
            pass

    version_bumped = bool(new_asset_ver and new_asset_ver != state.get("asset_version", ""))
    check_existing_assets = (mode in ("full", "verify")) or version_bumped

    to_process = []
    for rel in sorted(asset_rels):
        if rel.startswith("..") or "/../" in rel:
            continue
        exists = os.path.isfile(os.path.join(site_dir, rel))
        if not exists or check_existing_assets:
            to_process.append(rel)

    if to_process:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            afuts = {}
            for rel in to_process:
                with lock:
                    meta_snapshot = dict(state_files)
                afuts[ex.submit(sync_file, pool, site_dir, meta_snapshot, rel, False, True)] = (rel, meta_snapshot)
            for fut in as_completed(afuts):
                rel, meta_snapshot = afuts[fut]
                try:
                    status = fut.result()
                    if rel in meta_snapshot:
                        with lock:
                            state_files[rel] = meta_snapshot[rel]
                    if status == "updated":
                        with lock:
                            updated_count += 1
                except Exception:
                    pass

    if new_asset_ver:
        state["asset_version"] = new_asset_ver
    save_state(state_file, state)
    print(f"[gothic-sync] mode={mode} complete: {updated_count} file(s) updated, {len(asset_rels)} assets tracked (ASSET_VERSION={new_asset_ver}).")
    return True


def make_handler(site_dir: str, upstream_url: str):
    parsed_up = urllib.parse.urlsplit(upstream_url.rstrip("/"))
    up_scheme = parsed_up.scheme or "https"
    up_host = parsed_up.hostname or "gothic.gunaratne.com"
    up_port = parsed_up.port or (443 if up_scheme == "https" else 80)
    ssl_ctx = ssl.create_default_context() if up_scheme == "https" else None
    fetch_pool = UpstreamPool(upstream_url, timeout=12.0)

    class EdgeHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            pass

        def _open_upstream_socket(self, timeout=10.0):
            raw_sock = socket.create_connection((up_host, up_port), timeout=timeout)
            if up_scheme == "https":
                return ssl_ctx.wrap_socket(raw_sock, server_hostname=up_host)
            return raw_sock

        def _tunnel_websocket(self):
            try:
                up_sock = self._open_upstream_socket(timeout=6.0)
            except Exception:
                self.send_error(502, "Upstream Offline")
                return

            try:
                req_lines = [f"GET {self.path} HTTP/1.1\r\n", f"Host: {up_host}\r\n"]
                for k, v in self.headers.items():
                    if k.lower() == "host":
                        continue
                    req_lines.append(f"{k}: {v}\r\n")
                req_lines.append("\r\n")
                up_sock.sendall("".join(req_lines).encode("latin-1", errors="ignore"))

                client_sock = self.connection
                client_sock.setblocking(False)
                up_sock.setblocking(False)
                sockets = [client_sock, up_sock]
                while True:
                    readable, _, errored = select.select(sockets, [], sockets, 30.0)
                    if errored:
                        break
                    if not readable:
                        continue
                    for s in readable:
                        while True:
                            try:
                                chunk = s.recv(65536)
                            except (BlockingIOError, ssl.SSLWantReadError):
                                break
                            except Exception:
                                return
                            if not chunk:
                                return
                            dst = up_sock if s is client_sock else client_sock
                            dst.setblocking(True)
                            dst.sendall(chunk)
                            dst.setblocking(False)
                            if not (isinstance(s, ssl.SSLSocket) and s.pending() > 0):
                                break
            except Exception:
                pass
            finally:
                try:
                    up_sock.close()
                except Exception:
                    pass
                self.close_connection = True

        def _proxy_api(self):
            body = b""
            clen = int(self.headers.get("Content-Length") or 0)
            if clen > 0:
                body = self.rfile.read(clen)

            try:
                if up_scheme == "https":
                    conn = http.client.HTTPSConnection(up_host, up_port, timeout=30.0, context=ssl_ctx)
                else:
                    conn = http.client.HTTPConnection(up_host, up_port, timeout=30.0)
                fwd_headers = {
                    k: v for k, v in self.headers.items()
                    if k.lower() not in ("host", "connection", "transfer-encoding")
                }
                fwd_headers["Host"] = up_host
                conn.request(self.command, self.path, body=body if body else None, headers=fwd_headers)
                resp = conn.getresponse()
            except Exception:
                self.send_response(503)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", "29")
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(b'{"ok":false,"error":"offline"}')
                return

            try:
                ctype = resp.getheader("Content-Type") or "application/octet-stream"
                if "text/event-stream" in ctype.lower():
                    self.send_response(resp.status)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Connection", "close")
                    self.end_headers()
                    while True:
                        chunk = resp.read(1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        self.wfile.flush()
                    self.close_connection = True
                else:
                    payload = resp.read()
                    self.send_response(resp.status)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    if self.command != "HEAD":
                        self.wfile.write(payload)
            except Exception:
                self.close_connection = True
            finally:
                try:
                    conn.close()
                except Exception:
                    pass

        def _serve_local_or_cache(self):
            parsed = urllib.parse.urlsplit(self.path)
            rel = urllib.parse.unquote(parsed.path)
            if rel == "/":
                rel = "/index.html"
            parts = [p for p in rel.split("/") if p]
            if any(p == ".." or p.startswith(".") for p in parts):
                self.send_error(403, "Forbidden")
                return

            rel_clean = "/".join(parts)
            abs_path = os.path.join(site_dir, *parts) if parts else os.path.join(site_dir, "index.html")

            # Read-through SSD cache for newly forged wings or any uncached file
            if not os.path.isfile(abs_path):
                try:
                    res = fetch_pool.request("GET", rel_clean)
                    if res["status"] == 200:
                        atomic_write(abs_path, res["body"])
                except Exception:
                    pass

            if not os.path.isfile(abs_path):
                self.send_error(404, "Not Found")
                return

            ext = os.path.splitext(abs_path)[1].lower()
            mime = MIME_OVERRIDES.get(ext) or mimetypes.guess_type(abs_path)[0] or "application/octet-stream"
            size = os.path.getsize(abs_path)
            range_hdr = self.headers.get("Range")

            if range_hdr and range_hdr.startswith("bytes="):
                start_s, _, end_s = range_hdr[6:].partition("-")
                start = int(start_s) if start_s.strip().isdigit() else 0
                end = int(end_s) if end_s.strip().isdigit() else size - 1
                end = min(end, size - 1)
                if start < 0 or start > end or start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                length = end - start + 1
                self.send_response(206)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", str(length))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                if self.command != "HEAD":
                    with open(abs_path, "rb") as f:
                        f.seek(start)
                        remaining = length
                        while remaining > 0:
                            buf = f.read(min(65536, remaining))
                            if not buf:
                                break
                            self.wfile.write(buf)
                            remaining -= len(buf)
                return

            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(size))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            if self.command != "HEAD":
                with open(abs_path, "rb") as f:
                    shutil.copyfileobj(f, self.wfile, 65536)

        def do_GET(self):
            if (self.headers.get("Upgrade") or "").lower() == "websocket":
                self._tunnel_websocket()
                return
            if self.path.startswith("/api/"):
                self._proxy_api()
                return
            self._serve_local_or_cache()

        def do_HEAD(self):
            if self.path.startswith("/api/"):
                self._proxy_api()
                return
            self._serve_local_or_cache()

        def do_POST(self):
            if self.path.startswith("/api/"):
                self._proxy_api()
                return
            self.send_error(405, "Method Not Allowed")

    return EdgeHandler


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--upstream", default=DEFAULT_UPSTREAM)
    ap.add_argument("--site-dir", default=DEFAULT_SITE_DIR)
    ap.add_argument("--state-file", default=DEFAULT_STATE_FILE)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8711)
    ap.add_argument("--sync-full", action="store_true", help="Download full game & assets to local SSD")
    ap.add_argument("--sync-boot", action="store_true", help="Fast pre-launch delta sync (skips if offline)")
    ap.add_argument("--serve", action="store_true", help="Run local SSD HTTP + live multiplayer/forge proxy")
    args = ap.parse_args()

    if args.sync_full:
        ok = discover_and_sync(args.upstream, args.site_dir, args.state_file, mode="full")
        if not ok and not os.path.isfile(os.path.join(args.site_dir, "index.html")):
            sys.exit(1)

    if args.sync_boot:
        discover_and_sync(args.upstream, args.site_dir, args.state_file, mode="boot")

    if args.serve:
        threading.Thread(
            target=discover_and_sync,
            args=(args.upstream, args.site_dir, args.state_file, "verify", 6),
            daemon=True,
        ).start()
        srv = ReusableThreadingHTTPServer((args.host, args.port), make_handler(args.site_dir, args.upstream))
        print(f"[gothic-edge] Serving local SSD cache on http://{args.host}:{args.port}/", flush=True)
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
PYEOF

chmod +x "$HOME/.local/share/gothic-nocturne/gothic-edge.py"

# Initial full mirror (~147 MB of sprites, music, voices, SFX, and code onto the Steam Deck SSD)
/usr/bin/python3 "$HOME/.local/share/gothic-nocturne/gothic-edge.py" --sync-full

# Create the Steam launcher wrapper script
# - Strips Steam Scout LD_LIBRARY_PATH / LD_PRELOAD so /usr/bin/flatpak never crashes
# - Syncs any new updates from gothic.gunaratne.com (~0.3s on Wi-Fi, instant skip if offline)
# - Starts local NVMe edge server on 127.0.0.1:8711 and cleans it up on STEAM -> Exit Game
cat > "$HOME/.local/bin/gothic-nocturne" << 'EOF'
#!/usr/bin/env bash
unset LD_LIBRARY_PATH
unset LD_PRELOAD

PORT="${GOTHIC_PORT:-8711}"
EDGE_PY="$HOME/.local/share/gothic-nocturne/gothic-edge.py"
PROFILE_DIR="$HOME/.var/app/com.google.Chrome/data/gothic-nocturne"
mkdir -p "$PROFILE_DIR/Default"

# Prevent Chrome's "Restore pages?" bubble after STEAM -> Exit Game
PREFS="$PROFILE_DIR/Default/Preferences"
if [ -f "$PREFS" ]; then
  sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/g; s/"exited_cleanly":false/"exited_cleanly":true/g' "$PREFS" 2>/dev/null || true
fi

# Fast delta check against https://gothic.gunaratne.com (skips in <=1.2s if offline)
/usr/bin/python3 "$EDGE_PY" --sync-boot || true

# Stop any stale edge server on PORT, then launch fresh local SSD server
pkill -f "gothic-edge.py --serve --port ${PORT}" 2>/dev/null || true
/usr/bin/python3 "$EDGE_PY" --serve --port "$PORT" >/dev/null 2>&1 &
EDGE_PID=$!

cleanup() {
  if [ -n "${CHROME_PID:-}" ]; then kill "$CHROME_PID" 2>/dev/null || true; fi
  if [ -n "${EDGE_PID:-}" ]; then kill "$EDGE_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

# Wait until 127.0.0.1:$PORT is listening (typically <30ms)
for _ in $(seq 1 40); do
  if /usr/bin/python3 -c "import socket; s=socket.create_connection(('127.0.0.1', $PORT), 0.1); s.close()" 2>/dev/null; then
    break
  fi
  sleep 0.05
done

URL="${GOTHIC_URL:-http://127.0.0.1:${PORT}/?touch=0}"

/usr/bin/flatpak run \
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
  --kiosk "$URL" "$@" &
CHROME_PID=$!
wait "$CHROME_PID"
EOF

chmod +x "$HOME/.local/bin/gothic-nocturne"

cat > "$HOME/.local/share/applications/gothic-nocturne.desktop" << EOF
[Desktop Entry]
Name=Gothic Nocturne
Comment=32-bit era 2.5D gothic side-scrolling action platformer (local SSD + auto-updates from gothic.gunaratne.com)
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

## Step 3: Render Custom Steam Deck Selector Screen Artwork (from Local SSD Assets)

Render all 5 Steam Deck UI artwork sizes (`wide.png` `920×430`, `portrait.png` `600×900`, `hero.png` `1920×620`, transparent `logo.png` `1280×720`, and `icon.png` `256×256`) using Headless Chrome backed by the freshly mirrored local SSD server:

```bash
ART_DIR="$HOME/.var/app/com.google.Chrome/cache/gothic-art"
rm -rf "$ART_DIR"
mkdir -p "$ART_DIR"

/usr/bin/python3 "$HOME/.local/share/gothic-nocturne/gothic-edge.py" --serve --port 18719 >/dev/null 2>&1 &
ART_SRV_PID=$!
sleep 0.4

python3 - "$ART_DIR" << 'PYEOF'
import os, subprocess, sys

art_dir = sys.argv[1]
base_url = "http://127.0.0.1:18719"

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
        "--force-device-scale-factor=1", "--virtual-time-budget=3000",
        f"--window-size={w},{h}",
        f"--screenshot={png_path}",
    ]
    if transparent:
        cmd.append("--default-background-color=00000000")
    cmd.append(f"file://{html_path}")
    subprocess.run(cmd, env=env, check=True)
    print(f"Rendered {png_path} ({os.path.getsize(png_path)} bytes)")
PYEOF

kill "$ART_SRV_PID" 2>/dev/null || true
cp "$ART_DIR/icon.png" "$HOME/.local/share/icons/hicolor/256x256/apps/gothic-nocturne.png"
```

---

## Step 4: Safely Stop Steam, Update `shortcuts.vdf` + `grid/`, and Reload Selector Screen

> [!WARNING]
> Steam must be stopped **before** writing `shortcuts.vdf` so Steam does not overwrite the file on exit. The script below checks ancestor PIDs first so that if the coding agent is running inside a terminal nested under `gamescope-session`, it will never kill its own parent session.

```bash
python3 - << 'PYEOF'
import os
import shutil
import struct
import subprocess
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

APPID = (zlib.crc32((EXE_QUOTED + APP_NAME).encode("utf-8")) & 0xFFFFFFFF) | 0x80000000

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


def ancestor_comm_names():
    names = set()
    pid = os.getpid()
    while pid > 1:
        try:
            with open(f"/proc/{pid}/comm", "r", encoding="utf-8") as f:
                names.add(f.read().strip())
            with open(f"/proc/{pid}/stat", "r", encoding="utf-8") as f:
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
    print("Gaming Mode active (agent on SSH/background) -> stopping gamescope-session cleanly before VDF edit...")
    subprocess.run(["systemctl", "--user", "stop", "gamescope-session"], check=False)
    wait_steam_exit(15.0)
    restart_mode = "gamescope"
elif was_desktop_steam_active:
    print("Desktop Steam active -> shutting down Steam cleanly before VDF edit...")
    subprocess.run(["steam", "-shutdown"], check=False)
    wait_steam_exit(15.0)
    restart_mode = "desktop_steam"
elif was_gamescope_active and in_gamescope_tree:
    print("Agent running inside gamescope-session -> will also invoke steamos-add-to-steam live.")
    restart_mode = "live_inside_gamescope"

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
        shutil.copy2(vdf_path, f"{vdf_path}.bak.{now_ts}")
        with open(vdf_path, "rb") as f:
            root, _ = parse_binary_vdf(f.read())

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
        print(f"[{os.path.basename(udir)}] Updated shortcut #{matched_idx} (AppID={APPID})")
    else:
        next_idx = str(max([int(k) for k in shortcuts if k.isdigit()] + [-1]) + 1)
        shortcuts[next_idx] = build_shortcut_entry()
        print(f"[{os.path.basename(udir)}] Added shortcut #{next_idx} (AppID={APPID})")

    root[sc_key] = ("map", shortcuts)
    encoded = dump_binary_vdf(root)
    _, end_pos = parse_binary_vdf(encoded)
    assert end_pos == len(encoded), "Binary VDF round-trip verification failed"

    tmp_path = f"{vdf_path}.tmp"
    with open(tmp_path, "wb") as f:
        f.write(encoded)
    os.replace(tmp_path, vdf_path)

    grid_dir = os.path.join(cfg_dir, "grid")
    for aid in existing_appids:
        install_grid_art(grid_dir, aid)
    print(f"[{os.path.basename(udir)}] Installed 5 Steam Deck grid artwork files for AppID(s): {sorted(existing_appids)}")

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

Run these checks and report the output back to the user:

```bash
du -sh "$HOME/.local/share/gothic-nocturne/site"
/usr/bin/python3 "$HOME/.local/share/gothic-nocturne/gothic-edge.py" --sync-boot
test -x "$HOME/.local/bin/gothic-nocturne" && echo "launcher OK"
flatpak info --show-permissions com.google.Chrome | grep -E "udev|filesystems" || true
```

- Confirm `~/.local/share/gothic-nocturne/site` holds the full mirrored assets (~145+ MB) and `--sync-boot` reports `0 file(s) updated`.
- Confirm all 5 artwork files (`<appid>.png`, `<appid>p.png`, `<appid>_hero.png`, `<appid>_logo.png`, `<appid>_icon.png`) exist in `~/.local/share/Steam/userdata/<STEAM_ID3>/config/grid/`.

---

## Controller Layout Notes (For the User in Gaming Mode)

All primary controls work out of the box with Steam's **Gamepad with Mouse Trackpad** template:
- **D-Pad / Left Stick**: Move, Crouch, Enter doorways (`↑`)
- **`A` / `B`**: Jump (hold for height; `↓` + `A` slide/divekick)
- **`X` / `RB`**: Left Hand Weapon (Whip) · `↑` + `X` throws Sub-Weapon
- **`Y` / `RT`**: Right Hand Weapon · `↑` + `Y` casts Crimson Soul
- **`LB`**: Backdash / Lodestone Grapple · **`LT`**: Swap Loadout (`SET A` ↔ `SET B`)
- **`View` (Top-Left)**: Castle Map · **`Menu` (Top-Right)**: Pause / Start
- **`L3`**: Toggle PostFX Shaders · **`R3`**: Mute Audio

**Optional Rear Grip Paddle Bindings** (via the **Controller icon** on the Gothic Nocturne game page):
- **`L4` → `E` key**: Open Hunter's Grimoire (`Armory` · `Souls` · `Bestiary`)
- **`R4` → `G` key**: Salute nearby multiplayer hunters
- **`L5` → `B` key**: Open Bestiary directly
- **`R5` → `P` key**: Open Castle Forge (press **STEAM + X** for the on-screen keyboard)
- **Exit Game**: Press the physical **STEAM** button → **Exit Game**.
