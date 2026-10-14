#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ ! -f .env ]; then cp .env.example .env; fi
if [ ! -f node_modules/sharp/package.json ]; then npm ci --omit=dev --no-audit --no-fund; fi
node --env-file-if-exists=.env server/exam/setup.mjs
exec node --env-file-if-exists=.env server/exam/main.mjs
