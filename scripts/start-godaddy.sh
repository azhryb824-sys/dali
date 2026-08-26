#!/usr/bin/env bash
set -euo pipefail

BIND_HOST="${DALI_BIND_HOST:-0.0.0.0}"
PORT="${PORT:-3000}"
export HOSTNAME="$BIND_HOST"
export PORT

needs_build=0
[[ -f ".next/BUILD_ID" ]] || needs_build=1
[[ -d ".next/static" ]] || needs_build=1

if [[ "$needs_build" -eq 0 ]] && ! find .next/static -type f \( -name '*.css' -o -name '*.js' \) -print -quit | grep -q .; then
  needs_build=1
fi

if [[ "$needs_build" -eq 1 ]]; then
  echo "[godaddy] build or static assets are missing; creating a clean production build"
  rm -rf .next
  npm run build
fi

if [[ ! -f ".next/BUILD_ID" ]] || [[ ! -d ".next/static" ]]; then
  echo "[godaddy] invalid Next.js artifact: BUILD_ID or static assets are missing" >&2
  exit 1
fi

if ! find .next/static -type f -name '*.css' -print -quit | grep -q .; then
  echo "[godaddy] invalid Next.js artifact: no compiled CSS file was produced" >&2
  exit 1
fi

# next.config.ts does not produce a standalone artifact. Always start the build
# that owns the current .next/static directory so HTML, JavaScript and CSS share
# the same build identifier.
echo "[godaddy] starting verified Next.js production build $(cat .next/BUILD_ID) on ${BIND_HOST}:${PORT}"
exec node_modules/.bin/next start -H "$BIND_HOST" -p "$PORT"
