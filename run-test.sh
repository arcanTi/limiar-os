#!/usr/bin/env bash
# Runs Limiar OS against a THROWAWAY database, for hands-on testing.
#
# Why this exists: `run-local.sh` serves the real development database, so every
# character, campaign and portrait created while poking at the UI stays there.
# Test fixtures ended up in the live roster that way. This script gives manual
# testing its own PostgreSQL (tmpfs, dies with the container), its own uploads
# directory and its own port, so nothing a test creates can survive it.
#
#   ./run-test.sh              build the frontend, then serve on 8766
#   ./run-test.sh --no-build   skip the frontend build
#   ./run-test.sh --keep       leave the database up after Ctrl-C
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

BUILD=1
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --keep) KEEP=1 ;;
    *) echo "[limiar-test] unknown option: $arg" >&2; exit 2 ;;
  esac
done

COMPOSE_FILE=compose.livetest.yaml
UPLOAD_DIR="$PWD/tmp/livetest-uploads"

# Deliberately NOT sourcing .env: it carries LIMIAR_DATABASE_URL for the real
# development database, and inheriting it is exactly the accident this script
# exists to prevent. Everything the server needs is spelled out below.
export LIMIAR_DATABASE_URL="postgresql://limiar_livetest:limiar_livetest_password@127.0.0.1:55434/limiar_livetest"
export LIMIAR_UPLOAD_DIR="$UPLOAD_DIR"
export LIMIAR_GM_USER="${LIMIAR_TEST_GM_USER:-mestre}"
# Fixed so a test run is reproducible; valid against the 6-character token
# alphabet (23456789ABCDEFGHJKMNPQRSTUVWXYZ). Only ever reaches a tmpfs database.
export LIMIAR_MASTER_TOKEN="${LIMIAR_TEST_MASTER_TOKEN:-TEST23}"
export HOST="${LIMIAR_TEST_HOST:-127.0.0.1}"
export PORT="${LIMIAR_TEST_PORT:-8766}"

case "$LIMIAR_DATABASE_URL" in
  *55433*|*//limiar:*)
    echo "[limiar-test] refusing to run: the URL points at the development database" >&2
    exit 1
    ;;
esac

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[limiar-test] port $PORT is already taken:" >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
  exit 1
fi

SERVER_PID=""

cleanup() {
  # The server is a child process, so it outlives this script unless it is
  # stopped here — and an orphan would keep holding the port after its database
  # was already torn down.
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ "$KEEP" == "1" ]]; then
    echo "[limiar-test] leaving the database up (--keep); stop it with:"
    echo "  docker compose -f $COMPOSE_FILE down --volumes"
    return
  fi
  echo "[limiar-test] tearing down the throwaway database and uploads..."
  docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$UPLOAD_DIR"
}
trap cleanup EXIT
# Without these, a SIGINT/SIGTERM would kill the script before the EXIT trap
# runs, and the throwaway database would outlive the run it belongs to.
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[limiar-test] starting the throwaway database..."
docker compose -f "$COMPOSE_FILE" up -d --wait

rm -rf "$UPLOAD_DIR"
mkdir -p "$UPLOAD_DIR"

if [[ "$BUILD" == "1" ]]; then
  echo "[limiar-test] building the frontend into dist/..."
  npm --prefix frontend run build
fi

# The server migrates and seeds an empty database on boot (backend/db.py), so
# every run starts from the seed roster and nothing else.
echo "[limiar-test] serving http://$HOST:$PORT — GM '$LIMIAR_GM_USER', token $LIMIAR_MASTER_TOKEN"
python3 server.py &
SERVER_PID=$!
wait "$SERVER_PID"
