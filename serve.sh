#!/usr/bin/env bash
# Serves the game plus the Castle Forge API (player-proposed wings) over HTTP.
# Reachable on this machine as http://$(hostname -f):8712/ (or http://localhost:8712/).
# Uses the asset-pipeline venv when present so generated pixel art can be processed.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8712}"
PY="python3"
[ -x .venv/bin/python ] && PY=".venv/bin/python"
exec "$PY" tools/forge_server.py --port "${PORT}" --host "${HOST:-0.0.0.0}"
