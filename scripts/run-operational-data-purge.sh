#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

repo="/var/www/dali"
service="dali.service"
expected_base_commit="933fbc5373ca1cabc5176a9175cc481e3a976a92"
health_url="http://127.0.0.1:3000/api/health/ready"
public_health_url="https://www.dally.info/api/health/ready"

die() {
  echo "ABORT: $*" >&2
  exit 1
}

run_storage_audit() {
  local phase="$1"
  local output_file="$2"
  local pipeline_statuses
  local audit_status
  local tee_status

  set +e
  npm run db:audit:storage | tee "$output_file"
  pipeline_statuses=("${PIPESTATUS[@]}")
  set -e

  audit_status="${pipeline_statuses[0]:-1}"
  tee_status="${pipeline_statuses[1]:-1}"
  [[ "$tee_status" -eq 0 ]] || die "storage audit report could not be written during $phase"

  case "$audit_status" in
    0)
      ;;
    2)
      echo "STORAGE_AUDIT_WARNING phase=$phase preexisting_missing_references=true"
      ;;
    *)
      die "storage audit failed during $phase with exit code $audit_status"
      ;;
  esac
}

for command in git node npm curl flock systemctl sudo awk tr date install pg_dump pg_restore sha256sum; do
  command -v "$command" >/dev/null 2>&1 || die "missing command: $command"
done

exec 9>"/tmp/dali-operational-data-purge.lock"
flock -n 9 || die "another Dali purge is already running"

sudo -v
[[ -d "$repo/.git" ]] || die "repository not found at $repo"
cd "$repo"
git merge-base --is-ancestor "$expected_base_commit" HEAD || die "production does not contain the reviewed release"
unexpected_release_changes="$(
  git diff --name-only "$expected_base_commit" HEAD \
    | awk '$0 != "scripts/purge-operational-data.mjs" && $0 != "scripts/run-operational-data-purge.sh" { print }'
)"
[[ -z "$unexpected_release_changes" ]] || die "production includes unreviewed changes after the approved release"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "tracked production files are modified"
sudo systemctl is-active --quiet "$service" || die "$service is not active"
curl -fsS --max-time 10 "$health_url" >/dev/null || die "local health check failed before purge"
curl -fsS --max-time 15 "$public_health_url" >/dev/null || die "public health check failed before purge"

service_pid="$(sudo systemctl show "$service" --property=MainPID --value)"
[[ "$service_pid" =~ ^[1-9][0-9]*$ ]] || die "invalid $service MainPID"

service_env_value() {
  local key="$1"
  sudo cat "/proc/$service_pid/environ" \
    | tr '\0' '\n' \
    | awk -v prefix="${key}=" 'index($0, prefix) == 1 && !found { print substr($0, length(prefix) + 1); found = 1 }'
}

database_url="$(service_env_value DATABASE_URL)"
case "$database_url" in
  postgres://*|postgresql://*) ;;
  *) die "DATABASE_URL is unavailable or unsupported in the running service" ;;
esac

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="/var/backups/dali/db-purge-$stamp"
backup_file="$backup_dir/dali-before-purge.dump"
sudo test ! -e "$backup_dir" || die "backup path already exists: $backup_dir"
sudo install -d -m 0700 -o "$(id -un)" -g "$(id -gn)" "$backup_dir"

cleanup() {
  unset DATABASE_URL DALI_PURGE_BACKUP DALI_PURGE_CONFIRM database_url
}
trap cleanup EXIT

export DATABASE_URL="$database_url"

echo "PRECHECK schema"
npm run db:audit:postgres | tee "$backup_dir/audit-schema-before.json"
echo "PRECHECK storage"
run_storage_audit "precheck" "$backup_dir/audit-storage-before.json"
echo "PRECHECK rbac"
npm run db:audit:rbac | tee "$backup_dir/audit-rbac-before.json"
echo "PRECHECK workforce_finance"
npm run db:audit:workforce-finance | tee "$backup_dir/audit-workforce-finance-before.json"
echo "PRECHECK contract_signatures"
npm run db:audit:contract-signatures | tee "$backup_dir/audit-contract-signatures-before.json"
echo "PRECHECK enterprise_controls"
npm run db:audit:enterprise-controls | tee "$backup_dir/audit-enterprise-before.json"

export DALI_PURGE_BACKUP="$backup_file"
export DALI_PURGE_CONFIRM="DELETE_OPERATIONAL_DATA_KEEP_USERS_EMPLOYEES"
node scripts/purge-operational-data.mjs | tee "$backup_dir/purge-report.json"

echo "POSTCHECK schema"
npm run db:audit:postgres | tee "$backup_dir/audit-schema-after.json"
echo "POSTCHECK storage"
run_storage_audit "postcheck" "$backup_dir/audit-storage-after.json"
echo "POSTCHECK rbac"
npm run db:audit:rbac | tee "$backup_dir/audit-rbac-after.json"
echo "POSTCHECK workforce_finance"
npm run db:audit:workforce-finance | tee "$backup_dir/audit-workforce-finance-after.json"
echo "POSTCHECK contract_signatures"
npm run db:audit:contract-signatures | tee "$backup_dir/audit-contract-signatures-after.json"
echo "POSTCHECK enterprise_controls"
npm run db:audit:enterprise-controls | tee "$backup_dir/audit-enterprise-after.json"

curl -fsS --max-time 10 "$health_url" | tee "$backup_dir/health-local-after.json"
curl -fsS --max-time 15 "$public_health_url" | tee "$backup_dir/health-public-after.json"
sudo systemctl is-active --quiet "$service" || die "$service stopped after purge"
sha256sum "$backup_file" | tee "$backup_dir/SHA256SUMS"

echo "PURGE_COMPLETE"
echo "BACKUP=$backup_dir"
echo "SERVICE=$(sudo systemctl is-active "$service")"
