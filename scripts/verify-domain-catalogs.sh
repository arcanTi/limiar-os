#!/bin/sh
set -eu

TSX=frontend/node_modules/.bin/tsx

"$TSX" --tsconfig frontend/tsconfig.json scripts/audit-limiar-catalog.mjs
"$TSX" --tsconfig frontend/tsconfig.json scripts/verify-core-weapon-catalog.mjs
"$TSX" --tsconfig frontend/tsconfig.json scripts/verify-cyberware-install-engine.mjs
"$TSX" --tsconfig frontend/tsconfig.json scripts/verify-item-effect-engine.mjs
"$TSX" --tsconfig frontend/tsconfig.json scripts/verify-critical-injury-engine.mjs
"$TSX" --tsconfig frontend/tsconfig.json scripts/verify-combat-engine.mjs
"$TSX" --tsconfig frontend/tsconfig.json scripts/verify-redmas-catalog.mjs
"$TSX" --tsconfig frontend/tsconfig.json scripts/verify-homebrew-limiar-catalog.mjs

git diff --exit-code -- data/audit/limiar-catalog-audit.json
