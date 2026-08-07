#!/usr/bin/env bash
# Starts the supported disposable FastAPI + PostgreSQL deployment.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ ! -f .env ]]; then
  echo "[limiar] missing .env; copy .env.example and replace both passwords" >&2
  exit 1
fi

exec docker compose up --build
