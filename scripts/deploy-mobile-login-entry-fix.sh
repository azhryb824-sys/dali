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

grep -Fq 'isDaliMobileUserAgent(request.headers.get("user-agent"))' app/api/auth/login/route.ts
grep -Fq 'isDaliMobileUserAgent(userAgent)' proxy.ts
grep -Fq 'request.headers.get(DESKTOP_APP_HEADER) === DESKTOP_APP_MARKER' app/api/auth/login/route.ts

systemctl is-active --quiet dali.service
curl -fsS http://127.0.0.1:3000/api/health/ready >/dev/null

service_pid="$(systemctl show dali.service --property=MainPID --value)"
if [[ ! "$service_pid" =~ ^[1-9][0-9]*$ ]]; then
  echo "ABORT: invalid dali.service MainPID" >&2
  exit 1
fi

database_url="$(
  sudo cat "/proc/$service_pid/environ" |
    tr '\0' '\n' |
    sed -n 's/^DATABASE_URL=//p'
)"

case "$database_url" in
  postgres://*|postgresql://*) ;;
  *)
    echo "ABORT: DATABASE_URL is unavailable from dali.service" >&2
    exit 1
    ;;
esac

node --test tests/mobile-app.test.mjs
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
release_root="$(mktemp -d /tmp/dali-mobile-login-fix-XXXXXX)"
worktree="$release_root/worktree"
backup="$repo/.next.before-mobile-login-fix-$stamp"
failed="$repo/.next.failed-mobile-login-fix-$stamp"
smoke_log="$release_root/smoke.log"
smoke_pid=""
swapped=0
deployed=0
stage="initializing"
health=""

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

verify_application_entries() {
  local origin="$1"
  local marker="$2"
  local mobile_agent="Mozilla/5.0 (Linux; Android 13; Infinix X6525) AppleWebKit/537.36 Chrome/111.0 Mobile Safari/537.36 DaliMobile/1 Android DaliInfinix/1 DaliAcceptance/$marker"

  mobile_page_http="$(curl -sS -o /dev/null -w '%{http_code}' -A "$mobile_agent" "$origin/login")"
  mobile_post_http="$(curl -sS -o /dev/null -w '%{http_code}' -A "$mobile_agent" \
    --data 'identifier=0&password=acceptance-check&returnTo=/portal' \
    "$origin/api/auth/login")"
  browser_page_http="$(curl -sS -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0 Chrome/111.0' "$origin/login")"
  browser_post_http="$(curl -sS -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0 Chrome/111.0' \
    --data 'identifier=0&password=acceptance-check&returnTo=/portal' \
    "$origin/api/auth/login")"
  desktop_page_http="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H 'x-dali-desktop-app: dali-desktop-v1' "$origin/login")"

  [[ "$mobile_page_http" == "200" ]]
  [[ "$mobile_post_http" == "303" ]]
  [[ "$browser_page_http" == "403" ]]
  [[ "$browser_post_http" == "403" ]]
  [[ "$desktop_page_http" == "200" ]]
}

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

stage="pre-swap-acceptance"
(
  cd "$worktree"
  exec env NEXT_TELEMETRY_DISABLED=1 DATABASE_URL="$database_url" "$worktree/node_modules/.bin/next" start -H 127.0.0.1 -p 3101
) >"$smoke_log" 2>&1 &
smoke_pid=$!
unset database_url

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

verify_application_entries "http://127.0.0.1:3101" "pre-$new_build"

kill "$smoke_pid" >/dev/null 2>&1 || true
wait "$smoke_pid" >/dev/null 2>&1 || true
smoke_pid=""

stage="swapping-build"
sudo systemctl stop dali.service
mv "$repo/.next" "$backup"
mv "$worktree/.next" "$repo/.next"
swapped=1
sudo systemctl start dali.service

stage="live-health"
ready=0
for attempt in $(seq 1 60); do
  if health="$(curl -fsS http://127.0.0.1:3000/api/health/ready 2>/dev/null)"; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" -eq 1 ]]

stage="live-entry-acceptance"
verify_application_entries "https://www.dally.info" "live-$new_build"

deployed=1

echo "===== MOBILE LOGIN ENTRY FIX DEPLOYED ====="
echo "SOURCE_COMMIT=$(git rev-parse --short HEAD)"
echo "OLD_BUILD=$old_build"
echo "NEW_BUILD=$new_build"
echo "MOBILE_LOGIN_PAGE_HTTP=$mobile_page_http"
echo "MOBILE_LOGIN_POST_HTTP=$mobile_post_http"
echo "BROWSER_LOGIN_PAGE_HTTP=$browser_page_http"
echo "BROWSER_LOGIN_POST_HTTP=$browser_post_http"
echo "WINDOWS_MAC_LOGIN_PAGE_HTTP=$desktop_page_http"
echo "BACKUP=$backup"
echo "GITHUB_LOGIN_NOT_REQUIRED"
echo "$health"
