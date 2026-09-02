#!/usr/bin/env bash
set -euo pipefail

repo="/var/www/dali"
branch="godaddy-preview"

cd "$repo"

if [[ "$(git branch --show-current)" != "$branch" ]]; then
  echo "ABORT: unexpected branch" >&2
  exit 1
fi

git restore --staged --worktree -- tsconfig.tsbuildinfo 2>/dev/null || true

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "ABORT: tracked working tree changes exist" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

grep -Fq 'manifest: isPwaRequest ? "/pwa/manifest.webmanifest" : "/manifest.webmanifest"' app/layout.tsx
grep -Fq 'requestHeaders.set("x-dali-pathname", request.nextUrl.pathname)' proxy.ts
grep -Fq 'window.location.replace("/pwa/launch")' app/components/PwaSetupClient.tsx

systemctl is-active --quiet dali.service
curl -fsS http://127.0.0.1:3000/api/health/ready >/dev/null

node --test tests/pwa-runtime.test.mjs
npm run typecheck
git restore --staged --worktree -- tsconfig.tsbuildinfo 2>/dev/null || true

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "ABORT: tests changed tracked files" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

source_head="$(git rev-parse HEAD)"
stamp="$(date -u +%Y%m%d-%H%M%S)"
old_build="$(cat .next/BUILD_ID)"
release_root="$(mktemp -d /tmp/dali-pwa-home-fix-XXXXXX)"
worktree="$release_root/worktree"
backup="$repo/.next.before-pwa-home-fix-$stamp"
failed="$repo/.next.failed-pwa-home-fix-$stamp"
swapped=0
deployed=0
health=""
stage="initializing"
smoke_pid=""

finish() {
  exit_code=$?
  trap - EXIT
  set +e

  if [[ -n "$smoke_pid" ]]; then
    kill "$smoke_pid" >/dev/null 2>&1 || true
    wait "$smoke_pid" >/dev/null 2>&1 || true
  fi

  if [[ "$exit_code" -ne 0 ]]; then
    echo "FAILED_STAGE=$stage" >&2
  fi

  if [[ "$exit_code" -ne 0 && "$swapped" -eq 1 && "$deployed" -eq 0 ]]; then
    echo "Deployment failed; restoring the previous build..." >&2
    sudo systemctl stop dali.service
    [[ -d "$repo/.next" ]] && mv "$repo/.next" "$failed"
    [[ -d "$backup" ]] && mv "$backup" "$repo/.next"
    sudo systemctl start dali.service

    for attempt in $(seq 1 60); do
      curl -fsS http://127.0.0.1:3000/api/health/ready >/dev/null 2>&1 && break
      sleep 1
    done

    [[ -d "$failed" ]] && sudo rm -rf --one-file-system -- "$failed"
    echo "ROLLBACK_COMPLETE BUILD_ID=$(cat "$repo/.next/BUILD_ID")" >&2
  fi

  git -C "$repo" worktree remove --force "$worktree" >/dev/null 2>&1 || true
  [[ -d "$release_root" ]] && rm -rf --one-file-system -- "$release_root"
  exit "$exit_code"
}

trap finish EXIT

stage="isolated-build"
git worktree add --detach "$worktree" "$source_head"
ln -s "$repo/node_modules" "$worktree/node_modules"

for env_file in .env .env.local .env.production .env.production.local; do
  if [[ -f "$repo/$env_file" && ! -e "$worktree/$env_file" ]]; then
    ln -s "$repo/$env_file" "$worktree/$env_file"
  fi
done

(
  cd "$worktree"
  NEXT_TELEMETRY_DISABLED=1 npm run build
)

test -f "$worktree/.next/BUILD_ID"
new_build="$(cat "$worktree/.next/BUILD_ID")"
[[ "$new_build" != "$old_build" ]]

stage="pre-swap-local-metadata"
smoke_log="$release_root/smoke.log"
(
  cd "$worktree"
  exec env NEXT_TELEMETRY_DISABLED=1 "$worktree/node_modules/.bin/next" start -H 127.0.0.1 -p 3101
) >"$smoke_log" 2>&1 &
smoke_pid=$!

smoke_ready=0
for attempt in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3101/api/health/ready >/dev/null 2>&1; then
    smoke_ready=1
    break
  fi
  sleep 1
done

if [[ "$smoke_ready" -ne 1 ]]; then
  sed -n '1,120p' "$smoke_log" >&2
  exit 1
fi

local_setup_html="$(curl -fsSL http://127.0.0.1:3101/pwa/setup)"
local_metadata_links="$(grep -oE '<link[^>]+(manifest|canonical)[^>]*>' <<<"$local_setup_html" || true)"
printf 'PRE_SWAP_METADATA=%s\n' "$local_metadata_links"

grep -Fq 'href="/pwa/manifest.webmanifest"' <<<"$local_setup_html"
if grep -Fq 'href="/manifest.webmanifest"' <<<"$local_setup_html"; then
  echo "ABORT: local setup page exposes the public manifest" >&2
  exit 1
fi

kill "$smoke_pid" >/dev/null 2>&1 || true
wait "$smoke_pid" >/dev/null 2>&1 || true
smoke_pid=""

stage="swapping-build"
sudo systemctl stop dali.service
mv "$repo/.next" "$backup"
mv "$worktree/.next" "$repo/.next"
swapped=1
sudo systemctl start dali.service

stage="local-health"
ready=0
for attempt in $(seq 1 60); do
  if health="$(curl -fsS http://127.0.0.1:3000/api/health/ready 2>/dev/null)"; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" -eq 1 ]]

stage="public-http"
manifest_http="$(curl -fsS --retry 5 --retry-delay 1 -o /dev/null -w '%{http_code}' https://www.dally.info/pwa/manifest.webmanifest)"
worker_http="$(curl -fsS --retry 5 --retry-delay 1 -o /dev/null -w '%{http_code}' https://www.dally.info/sw.js)"
launch_http="$(curl -fsS --retry 5 --retry-delay 1 -o /dev/null -w '%{http_code}' https://www.dally.info/pwa/launch)"

[[ "$manifest_http" == "200" ]]
[[ "$worker_http" == "200" ]]
[[ "$launch_http" == "200" ]]

stage="public-metadata"
public_metadata_ready=0
setup_html=""
for attempt in $(seq 1 60); do
  setup_html="$(curl -fsSL https://www.dally.info/pwa/setup 2>/dev/null || true)"
  if grep -Fq 'href="/pwa/manifest.webmanifest"' <<<"$setup_html" &&
     ! grep -Fq 'href="/manifest.webmanifest"' <<<"$setup_html"; then
    public_metadata_ready=1
    break
  fi
  sleep 1
done

live_metadata_links="$(grep -oE '<link[^>]+(manifest|canonical)[^>]*>' <<<"$setup_html" || true)"
printf 'LIVE_METADATA=%s\n' "$live_metadata_links"
[[ "$public_metadata_ready" -eq 1 ]]

deployed=1

echo "===== PWA HOME-SCREEN FIX DEPLOYED ====="
echo "SOURCE_HEAD=$(git rev-parse --short HEAD)"
echo "OLD_BUILD=$old_build"
echo "NEW_BUILD=$new_build"
echo "PWA_MANIFEST=/pwa/manifest.webmanifest"
echo "PWA_START=/pwa/launch"
echo "PUBLIC_MANIFEST_HTTP=$manifest_http"
echo "PUBLIC_SERVICE_WORKER_HTTP=$worker_http"
echo "PUBLIC_LAUNCH_HTTP=$launch_http"
echo "BACKUP=$backup"
echo "GITHUB_LOGIN_NOT_REQUIRED"
echo "$health"
