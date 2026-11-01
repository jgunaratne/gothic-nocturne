#!/usr/bin/env bash
# Serves Gothic Nocturne: the HTTP + real-time multiplayer WebSocket/SSE server
# (node, :8711) with the Castle Forge API (python, :8712) running alongside it.
# server.mjs proxies /api/forge/* to the forge so the game, multiplayer and
# player-proposed wings all share one origin:
#   http://$(hostname -f):8711/   (or http://localhost:8711/)
set -euo pipefail
cd "$(dirname "$0")"
export PORT="${PORT:-8711}"
export HOST="${HOST:-0.0.0.0}"
export FORGE_PORT="${FORGE_PORT:-8712}"
PY="python3"
[ -x .venv/bin/python ] && PY=".venv/bin/python"   # PIL/numpy for generated pixel art
"$PY" tools/forge_server.py --port "${FORGE_PORT}" --host 127.0.0.1 &
FORGE_PID=$!
trap 'kill "${FORGE_PID}" 2>/dev/null || true' EXIT INT TERM
echo "Gothic Nocturne (Multiplayer + Castle Forge)  →  http://$(hostname -f):${PORT}/   (Ctrl-C to stop)"
node server.mjs
