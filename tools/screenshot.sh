#!/usr/bin/env bash
# Headless Chrome screenshot of the running game (expects serve.sh on :8711).
#   tools/screenshot.sh "demo=1" /tmp/gothic_shot.png 6000
set -euo pipefail
QUERY="${1:-}"
OUT="${2:-/tmp/gothic_shot.png}"
BUDGET="${3:-5000}"
PORT="${PORT:-8711}"
CHROME="${CHROME:-google-chrome}"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
  --window-size=1280,720 --screenshot="$OUT" --virtual-time-budget="$BUDGET" \
  --enable-logging=stderr --v=0 --autoplay-policy=no-user-gesture-required \
  --proxy-server='direct://' --proxy-bypass-list='*' \
  "http://127.0.0.1:${PORT}/?${QUERY}" 2>&1 \
  | grep -E "CONSOLE|Uncaught|Error|error" | grep -v -E "gpu|GPU|dbus|DBus|bluez|fontconfig|Fontconfig" || true
echo "wrote $OUT"
