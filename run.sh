#!/usr/bin/env bash
# Builds the frontend bundle and starts the Python backend, which serves
# both the API and the built static files on a single port.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "[limiar] building frontend..."
(cd frontend && npm run build)

echo "[limiar] starting server..."
exec python3 server.py
