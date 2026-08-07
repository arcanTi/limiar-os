#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

cleanup() {
  docker compose -f compose.test.yaml down --volumes --remove-orphans
}
trap cleanup EXIT

docker compose -f compose.test.yaml up -d --wait
export LIMIAR_TEST_DATABASE_URL="postgresql+psycopg://limiar_test:limiar_test_password@127.0.0.1:55432/limiar_test"
export LIMIAR_FAIL_ON_SKIP=1
python3 -m pytest backend/tests -q
