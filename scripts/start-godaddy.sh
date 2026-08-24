#!/usr/bin/env bash
set -euo pipefail

export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"

if [[ -f ".next/standalone/server.js" ]]; then
  echo "[godaddy] starting Next.js standalone server"
  exec node .next/standalone/server.js
fi

if [[ ! -f ".next/BUILD_ID" ]]; then
  echo "[godaddy] build artifact missing; creating it before startup"
  npm run build
fi

echo "[godaddy] standalone artifact unavailable; using next start"
exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT}"
