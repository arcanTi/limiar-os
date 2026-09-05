#!/usr/bin/env bash
# Starts the supported disposable FastAPI + PostgreSQL deployment.
#
# The `app` service sits behind the `deploy` profile, so this script has to ask
# for it by name — a bare `docker compose up` intentionally brings up only the
# database. See compose.yaml for why, and ./run-local.sh for the native run that
# is the current working environment.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ ! -f .env ]]; then
  echo "[limiar] missing .env; copy .env.example and replace both passwords" >&2
  exit 1
fi

# The container publishes on 0.0.0.0:8765 and a native server binds
# 127.0.0.1:8765; both succeed, and the client's IPv4/IPv6 choice decides which
# one it reaches. Refuse to add the second server instead of serving two builds.
if lsof -nP -iTCP:"${LIMIAR_PORT:-8765}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[limiar] port ${LIMIAR_PORT:-8765} is already taken:" >&2
  lsof -nP -iTCP:"${LIMIAR_PORT:-8765}" -sTCP:LISTEN >&2
  echo "[limiar] stop it first (probably ./run-local.sh)" >&2
  exit 1
fi

# --build is not optional: `dist/` is baked into the image, so without it the
# container serves the bundle from whenever the image was last built.
exec docker compose --profile deploy up --build
