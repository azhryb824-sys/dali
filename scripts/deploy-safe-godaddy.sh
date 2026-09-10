#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

repo="/var/www/dali"
branch="godaddy-preview"
expected_commit="${1:-}"
expected_tree="${2:-}"
service="dali.service"
local_ready="http://127.0.0.1:3000/api/health/ready"
public_origin="https://www.dally.info"
canary_port="3101"
desktop_device="00000000-0000-4000-8000-000000000001"
legacy_desktop_user_agent="Mozilla/5.0 DaliDesktop/0.2.5 Electron/38.0.0"

die() {
  echo "ABORT: $*" >&2
  exit 1
}

[[ "$expected_commit" =~ ^[0-9a-f]{40}$ ]] || die "usage: $0 EXPECTED_COMMIT EXPECTED_TREE"
[[ "$expected_tree" =~ ^[0-9a-f]{40}$ ]] || die "usage: $0 EXPECTED_COMMIT EXPECTED_TREE"

wait_for_url() {
  local url="$1"
  local attempts="${2:-90}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl -fsS --max-time 4 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

expect_status() {
  local expected="$1"
  local label="$2"
  shift 2
  local actual
  actual="$(curl -sS --max-time 25 -o /dev/null -w '%{http_code}' "$@")" || die "$label request failed"
  [[ "$actual" == "$expected" ]] || die "$label expected HTTP $expected, received $actual"
  echo "CHECK_OK $label HTTP=$actual"
}

verify_working_tree() {
  local context="$1"
  local tracked_status
  local status_line
  local allowed_backups=0
  local -a unexpected_untracked=()

  tracked_status="$(git status --porcelain --untracked-files=no)"
  if [[ -n "$tracked_status" ]]; then
    printf '%s\n' "$tracked_status" >&2
    die "$context: tracked working tree changes exist"
  fi

  while IFS= read -r status_line; do
    [[ -n "$status_line" ]] || continue
    case "$status_line" in
      "?? .next.before-"*|"?? backups/"*)
        allowed_backups=$((allowed_backups + 1))
        ;;
      "?? "*)
        unexpected_untracked+=("${status_line#\?\? }")
        ;;
    esac
  done < <(git status --porcelain --untracked-files=normal)

  if ((${#unexpected_untracked[@]} > 0)); then
    printf 'UNEXPECTED_UNTRACKED=%s\n' "${unexpected_untracked[@]}" >&2
    die "$context: unexpected untracked files exist"
  fi

  echo "WORKTREE_OK $context LEGACY_BACKUP_GROUPS=$allowed_backups"
}

exec 9>"/tmp/dali-safe-deploy.lock"
flock -n 9 || die "another Dali deployment is running"

for command in git node npm curl flock stat awk tr find ss du df systemctl sudo cat grep sleep mktemp ln mv rm mkdir install id date; do
  command -v "$command" >/dev/null 2>&1 || die "missing command: $command"
done
sudo -v

[[ -d "$repo/.git" ]] || die "repository not found at $repo"
cd "$repo"
[[ "$(git branch --show-current)" == "$branch" ]] || die "expected branch $branch"

git restore --staged --worktree -- tsconfig.tsbuildinfo 2>/dev/null || true
verify_working_tree "preflight"

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)' \
  || die "Node.js 22.13.0 or newer is required"

[[ -f "$repo/.next/BUILD_ID" && -d "$repo/.next/static" ]] || die "current production build is incomplete"
[[ -d "$repo/node_modules" ]] || die "current node_modules is missing"
sudo systemctl is-active --quiet "$service" || die "$service is not active"
wait_for_url "$local_ready" 20 || die "current local readiness check failed"
expect_status 200 "current_public_health" "$public_origin/api/health/ready"

old_head="$(git rev-parse HEAD)"
old_build="$(<"$repo/.next/BUILD_ID")"

git fetch --no-tags origin "$branch"
remote_head="$(git rev-parse FETCH_HEAD)"
[[ "$remote_head" == "$expected_commit" ]] || die "remote branch moved; expected $expected_commit, received $remote_head"
[[ "$(git rev-parse "${expected_commit}^{tree}")" == "$expected_tree" ]] || die "release tree verification failed"
git merge-base --is-ancestor "$old_head" "$expected_commit" || die "server HEAD is not an ancestor of the approved release"
git diff --check "$old_head" "$expected_commit"

database_changes="$(git diff --name-only "$old_head" "$expected_commit" -- db/schema.ts drizzle drizzle-pg drizzle.config.ts)"
if [[ -n "$database_changes" ]]; then
  printf '%s\n' "$database_changes" >&2
  die "database/schema changes require the dedicated migration procedure"
fi

artifact_kb="$(du -sk "$repo/node_modules" "$repo/.next" | awk '{ total += $1 } END { print total + 0 }')"
available_kb="$(df -Pk "$repo" | awk 'NR == 2 { print $4 }')"
required_kb=$((artifact_kb + 1048576))
((available_kb >= required_kb)) || die "insufficient disk space; need at least $((required_kb / 1024)) MiB free"
echo "PREFLIGHT_OK OLD_HEAD=$old_head OLD_BUILD=$old_build FREE_MIB=$((available_kb / 1024))"

release_root=""
worktree=""
backup_root=""
canary_pid=""
source_advanced=0
swap_started=0
stop_attempted=0
stage="preflight"

finish() {
  local exit_code=$?
  local rollback_ok=1
  local rollback_ready=0
  local rollback_stopped=0
  trap - EXIT INT TERM
  set +e

  if [[ -n "$canary_pid" ]]; then
    kill "$canary_pid" >/dev/null 2>&1 || true
    wait "$canary_pid" >/dev/null 2>&1 || true
  fi

  if ((exit_code != 0)); then
    echo "DEPLOYMENT_FAILED STAGE=$stage" >&2

    if ((swap_started == 1)); then
      sudo systemctl stop "$service" >/dev/null 2>&1 || true
      if sudo systemctl is-active --quiet "$service"; then
        rollback_ok=0
      else
        rollback_stopped=1
        if [[ -d "$backup_root/previous-next" ]]; then
          if [[ -e "$repo/.next" || -L "$repo/.next" ]]; then
            if [[ -e "$backup_root/failed-next" || -L "$backup_root/failed-next" ]] \
              || ! mv "$repo/.next" "$backup_root/failed-next"; then
              rollback_ok=0
            fi
          fi
          if [[ -e "$repo/.next" || -L "$repo/.next" ]] \
            || ! mv "$backup_root/previous-next" "$repo/.next"; then
            rollback_ok=0
          fi
        fi
        if [[ -d "$backup_root/previous-node_modules" ]]; then
          if [[ -e "$repo/node_modules" || -L "$repo/node_modules" ]]; then
            if [[ -e "$backup_root/failed-node_modules" || -L "$backup_root/failed-node_modules" ]] \
              || ! mv "$repo/node_modules" "$backup_root/failed-node_modules"; then
              rollback_ok=0
            fi
          fi
          if [[ -e "$repo/node_modules" || -L "$repo/node_modules" ]] \
            || ! mv "$backup_root/previous-node_modules" "$repo/node_modules"; then
            rollback_ok=0
          fi
        fi
      fi
    fi

    if ((source_advanced == 1)); then
      if ((swap_started == 1 && rollback_stopped == 0)); then
        rollback_ok=0
      elif [[ "$(git -C "$repo" rev-parse HEAD 2>/dev/null)" == "$expected_commit" ]]; then
        git -C "$repo" reset --hard "$old_head" >/dev/null 2>&1 || rollback_ok=0
      else
        rollback_ok=0
      fi
    fi

    if ((swap_started == 1 || stop_attempted == 1)); then
      sudo systemctl start "$service" >/dev/null 2>&1 || rollback_ok=0
      if wait_for_url "$local_ready" 90; then
        rollback_ready=1
      else
        rollback_ok=0
      fi
    fi

    if ((swap_started == 0 && stop_attempted == 0 && source_advanced == 0)); then
      echo "PRODUCTION_UNCHANGED" >&2
    elif ((rollback_ok == 1 && (swap_started == 0 || rollback_ready == 1))); then
      echo "ROLLBACK_COMPLETE HEAD=$(git -C "$repo" rev-parse HEAD) BUILD_ID=$(<"$repo/.next/BUILD_ID")" >&2
    else
      echo "ROLLBACK_INCOMPLETE: inspect $service and $backup_root immediately" >&2
    fi
  fi

  if [[ -n "$worktree" ]]; then
    git -C "$repo" worktree remove --force "$worktree" >/dev/null 2>&1 || true
    git -C "$repo" worktree prune >/dev/null 2>&1 || true
  fi
  if [[ -n "$release_root" && -d "$release_root" ]]; then
    case "$release_root" in
      /var/tmp/dali-safe-release-*) rm -rf --one-file-system -- "$release_root" ;;
      *) echo "Refusing to remove unexpected temporary path: $release_root" >&2 ;;
    esac
  fi
  exit "$exit_code"
}

trap finish EXIT
trap 'exit 130' INT TERM

stage="isolated_install"
release_root="$(mktemp -d /var/tmp/dali-safe-release-XXXXXX)"
worktree="$release_root/worktree"
[[ "$(stat -c %d "$release_root")" == "$(stat -c %d "$repo")" ]] || die "release workspace must be on the same filesystem as $repo"
git worktree add --detach "$worktree" "$expected_commit"

for env_file in .env .env.local .env.production .env.production.local; do
  if [[ -f "$repo/$env_file" && ! -e "$worktree/$env_file" ]]; then
    ln -s "$repo/$env_file" "$worktree/$env_file"
  fi
done

(
  cd "$worktree"
  npm ci --include=dev --no-audit --no-fund
)

stage="release_validation"
(
  cd "$worktree"
  npm audit --omit=dev --audit-level=moderate
  npm run typecheck
  npm run lint
  npm run db:audit:migrations
  NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=3072" npm run build
  node --experimental-strip-types --test tests/*.test.mjs
  git restore --staged --worktree -- tsconfig.tsbuildinfo 2>/dev/null || true
  [[ -z "$(git status --porcelain --untracked-files=no)" ]]
)

[[ -f "$worktree/.next/BUILD_ID" && -d "$worktree/.next/static" ]] || die "new production artifact is incomplete"
find "$worktree/.next/static" -type f -name '*.css' -print -quit | grep -q . || die "new artifact has no compiled CSS"
find "$worktree/.next/static" -type f -name '*.js' -print -quit | grep -q . || die "new artifact has no compiled JavaScript"
new_build="$(<"$worktree/.next/BUILD_ID")"

stage="canary_environment"
service_pid="$(sudo systemctl show "$service" --property=MainPID --value)"
[[ "$service_pid" =~ ^[1-9][0-9]*$ ]] || die "invalid $service MainPID"

service_env_value() {
  local key="$1"
  sudo cat "/proc/$service_pid/environ" \
    | tr '\0' '\n' \
    | awk -v prefix="${key}=" 'index($0, prefix) == 1 && !found { print substr($0, length(prefix) + 1); found = 1 }'
}

database_url="$(service_env_value DATABASE_URL)"
auth_secret="$(service_env_value AUTH_SECRET)"
auth_mode="$(service_env_value AUTH_MODE)"
case "$database_url" in
  postgres://*|postgresql://*) ;;
  *) die "DATABASE_URL is unavailable or unsupported in the running service" ;;
esac
(( ${#auth_secret} >= 32 )) || die "AUTH_SECRET is unavailable or too short in the running service"

if ss -ltnH "sport = :$canary_port" | grep -q .; then
  die "canary port $canary_port is already in use"
fi

stage="canary_start"
(
  cd "$worktree"
  export AUTH_MODE="${auth_mode:-credentials}"
  export AUTH_SECRET="$auth_secret"
  export DATABASE_URL="$database_url"
  export NEXT_TELEMETRY_DISABLED=1
  export NODE_ENV=production
  exec "$worktree/node_modules/.bin/next" start -H 127.0.0.1 -p "$canary_port"
) >"$release_root/canary.log" 2>&1 &
canary_pid=$!

wait_for_url "http://127.0.0.1:$canary_port/api/health/ready" 90 || die "canary readiness check failed"
expect_status 200 "canary_home" "http://127.0.0.1:$canary_port/"
expect_status 403 "canary_browser_login_blocked" "http://127.0.0.1:$canary_port/login"
expect_status 200 "canary_desktop_login" \
  -H "x-dali-desktop-app: dali-desktop-v1" \
  -H "x-dali-desktop-device: $desktop_device" \
  "http://127.0.0.1:$canary_port/login"
expect_status 200 "canary_legacy_desktop_login" \
  -A "$legacy_desktop_user_agent" \
  -H "x-dali-desktop-app: dali-desktop-v1" \
  "http://127.0.0.1:$canary_port/login"
expect_status 200 "canary_mobile_login" \
  -A "DaliMobile/1 Android" \
  "http://127.0.0.1:$canary_port/login"
expect_status 403 "canary_unsigned_desktop_api_blocked" \
  -H "x-dali-desktop-app: dali-desktop-v1" \
  -H "x-dali-desktop-device: $desktop_device" \
  "http://127.0.0.1:$canary_port/api/portal/notifications"
expect_status 403 "canary_unsigned_legacy_desktop_api_blocked" \
  -A "$legacy_desktop_user_agent" \
  -H "x-dali-desktop-app: dali-desktop-v1" \
  "http://127.0.0.1:$canary_port/api/portal/notifications"

kill "$canary_pid" >/dev/null 2>&1 || true
wait "$canary_pid" >/dev/null 2>&1 || true
canary_pid=""
unset database_url auth_secret auth_mode

stage="pre_swap_guard"
[[ "$(git -C "$repo" rev-parse HEAD)" == "$old_head" ]] || die "server HEAD changed during validation"
verify_working_tree "pre-swap"
git fetch --no-tags origin "$branch"
[[ "$(git rev-parse FETCH_HEAD)" == "$expected_commit" ]] || die "remote branch changed during validation"
sudo systemctl is-active --quiet "$service" || die "$service stopped during validation"
wait_for_url "$local_ready" 20 || die "current service lost readiness during validation"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_root="/var/backups/dali/${stamp}-${expected_commit:0:12}"
sudo mkdir -p /var/backups/dali
sudo test ! -e "$backup_root" || die "backup path already exists: $backup_root"
sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" "$backup_root"
[[ "$(stat -c %d "$backup_root")" == "$(stat -c %d "$repo")" ]] || die "backup must be on the same filesystem as $repo"
printf 'OLD_HEAD=%s\nNEW_HEAD=%s\nOLD_BUILD=%s\nNEW_BUILD=%s\n' \
  "$old_head" "$expected_commit" "$old_build" "$new_build" >"$backup_root/release-info.txt"

stage="controlled_swap"
stop_attempted=1
sudo systemctl stop "$service"
swap_started=1

if ! git merge --ff-only "$expected_commit"; then
  [[ "$(git rev-parse HEAD)" == "$old_head" ]] || source_advanced=1
  die "source fast-forward failed"
fi
current_head="$(git rev-parse HEAD)"
if [[ "$current_head" != "$old_head" ]]; then
  source_advanced=1
fi
[[ "$current_head" == "$expected_commit" ]] || die "source did not advance to the approved commit"

mv "$repo/.next" "$backup_root/previous-next"
mv "$repo/node_modules" "$backup_root/previous-node_modules"
mv "$worktree/.next" "$repo/.next"
mv "$worktree/node_modules" "$repo/node_modules"

stage="new_service_start"
sudo systemctl start "$service"
wait_for_url "$local_ready" 90 || die "new service readiness check failed"

stage="production_acceptance"
wait_for_url "$public_origin/api/health/ready" 90 || die "public readiness check failed"
DALI_PRODUCTION_ORIGIN="$public_origin" npm run test:production
expect_status 403 "public_browser_login_blocked" "$public_origin/login"
expect_status 200 "public_desktop_login" \
  -H "x-dali-desktop-app: dali-desktop-v1" \
  -H "x-dali-desktop-device: $desktop_device" \
  "$public_origin/login"
expect_status 200 "public_legacy_desktop_login" \
  -A "$legacy_desktop_user_agent" \
  -H "x-dali-desktop-app: dali-desktop-v1" \
  "$public_origin/login"
expect_status 200 "public_mobile_login" \
  -A "DaliMobile/1 Android" \
  "$public_origin/login"
expect_status 403 "public_unsigned_desktop_api_blocked" \
  -H "x-dali-desktop-app: dali-desktop-v1" \
  -H "x-dali-desktop-device: $desktop_device" \
  "$public_origin/api/portal/notifications"
expect_status 403 "public_unsigned_legacy_desktop_api_blocked" \
  -A "$legacy_desktop_user_agent" \
  -H "x-dali-desktop-app: dali-desktop-v1" \
  "$public_origin/api/portal/notifications"

[[ "$(git rev-parse HEAD)" == "$expected_commit" ]] || die "post-deploy source verification failed"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "post-deploy tracked working tree is not clean"
final_health="$(curl -fsS --max-time 15 "$local_ready")"

echo "DEPLOYMENT_OK"
echo "SOURCE_COMMIT=$expected_commit"
echo "OLD_BUILD=$old_build"
echo "NEW_BUILD=$new_build"
echo "BACKUP=$backup_root"
echo "HEALTH=$final_health"
