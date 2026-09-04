#!/usr/bin/env bash
# Runs Limiar OS natively on 127.0.0.1:8765 — the supported local environment
# while the Compose deployment is parked.
#
# Why this exists: the app container ships `dist/` baked into its image, so a
# frontend rebuild on the host never reaches it. Two servers answering on 8765
# (the container on 0.0.0.0, this process on 127.0.0.1) made the served bundle
# depend on whether the client resolved IPv4 or IPv6. This script owns the port
# and always rebuilds the frontend before serving it.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

BUILD=1
[[ "${1:-}" == "--no-build" ]] && BUILD=0

if [[ ! -f .env ]]; then
  echo "[limiar] missing .env; copy .env.example and fill it in" >&2
  exit 1
fi

# `python3 server.py` reads plain environment variables — unlike Compose, it
# does not load .env on its own.
set -a
# shellcheck disable=SC1091
source .env
set +a

: "${LIMIAR_DATABASE_URL:?define LIMIAR_DATABASE_URL in .env (native run needs an explicit database)}"
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8765}"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[limiar] port $PORT is already taken:" >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
  echo "[limiar] stop it first — two servers on one port serve different builds" >&2
  exit 1
fi

if [[ "$BUILD" == "1" ]]; then
  echo "[limiar] building the frontend into dist/..."
  npm --prefix frontend run build
fi

echo "[limiar] serving http://$HOST:$PORT"
exec python3 server.py
