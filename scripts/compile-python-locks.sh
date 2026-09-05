#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

python_image="python:3.13-slim-bookworm@sha256:67a1e1f215ccda113cfc024e8639049257e88f273898f595b61476d128d387e8"

# Resolve on Linux, the production platform. Conditional packages such as
# greenlet differ between macOS arm64 and Linux aarch64.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --env PIP_DISABLE_PIP_VERSION_CHECK=1 \
  --volume "$PWD:/workspace" \
  --workdir /workspace \
  "$python_image" \
  sh -ceu '
    python -m venv /tmp/lock-env
    /tmp/lock-env/bin/python -m pip install --quiet pip-tools==7.6.0
    /tmp/lock-env/bin/pip-compile --quiet --resolver=backtracking --strip-extras --no-header \
      --generate-hashes --output-file=requirements.txt requirements.in
    /tmp/lock-env/bin/pip-compile --quiet --resolver=backtracking --strip-extras --no-header \
      --generate-hashes --output-file=requirements-dev.txt requirements-dev.in
  '
