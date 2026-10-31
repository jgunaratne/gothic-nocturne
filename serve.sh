#!/usr/bin/env bash
# Serves the game over HTTP (ES modules need it). Reachable on this machine as
#   http://$(hostname -f):8711/  (or http://localhost:8711/)
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8711}"
echo "Gothic Nocturne  →  http://$(hostname -f):${PORT}/   (Ctrl-C to stop)"
exec python3 -m http.server "${PORT}" --bind 0.0.0.0
