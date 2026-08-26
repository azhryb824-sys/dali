#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DALI_ENV_FILE:-/etc/dali/dali.env}"

log() { printf '\n[dali-repair] %s\n' "$*"; }
fail() { printf '\n[dali-repair] ERROR: %s\n' "$*" >&2; exit 1; }

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

load_env_file() {
  local file="$1" line key value first last
  [[ -r "$file" ]] || fail "ملف البيئة غير قابل للقراءة: $file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    line="$(trim "$line")"
    [[ "$line" == export\ * ]] && line="${line#export }"
    [[ "$line" == *=* ]] || continue
    key="$(trim "${line%%=*}")"
    value="$(trim "${line#*=}")"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if (( ${#value} >= 2 )); then
      first="${value:0:1}"
      last="${value: -1}"
      if [[ "$first" == '"' && "$last" == '"' ]] || [[ "$first" == "'" && "$last" == "'" ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi
    # Quoted assignment prevents shell expansion of $ characters in PBKDF2 hashes.
    export "$key=$value"
  done < "$file"
}

find_systemd_service() {
  local candidate path unit
  for candidate in dali.service dali-web.service dali-contracting.service dally.service; do
    if systemctl cat "$candidate" >/dev/null 2>&1; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  path="$(grep -Rsl --include='*.service' -F "$ROOT" /etc/systemd/system /lib/systemd/system 2>/dev/null | head -n 1 || true)"
  if [[ -n "$path" ]]; then
    unit="$(basename "$path")"
    printf '%s' "$unit"
    return 0
  fi
  unit="$(systemctl list-unit-files --type=service --no-legend 2>/dev/null | awk 'tolower($1) ~ /(dali|dally)/ {print $1; exit}')"
  [[ -n "$unit" ]] && printf '%s' "$unit"
}

restart_application() {
  local service_name unit_text override_dir pm2_name=""
  service_name="$(find_systemd_service || true)"
  if [[ -n "$service_name" ]]; then
    log "اكتشاف خدمة systemd: $service_name"
    unit_text="$(systemctl cat "$service_name" 2>/dev/null || true)"
    if grep -qE '\.next/standalone/server\.js' <<<"$unit_text"; then
      log "إلغاء تشغيل أثر standalone القديم وربط الخدمة بالبناء الحالي"
      override_dir="/etc/systemd/system/${service_name}.d"
      sudo mkdir -p "$override_dir"
      printf '[Service]\nWorkingDirectory=%s\nExecStart=\nExecStart=/usr/bin/bash %s/scripts/start-godaddy.sh\n' "$ROOT" "$ROOT" \
        | sudo tee "$override_dir/20-dali-current-build.conf" >/dev/null
      sudo systemctl daemon-reload
    fi
    sudo systemctl restart "$service_name"
    sudo systemctl is-active --quiet "$service_name" || {
      sudo systemctl --no-pager --full status "$service_name" || true
      fail "تعذر تشغيل خدمة $service_name"
    }
    return 0
  fi

  if command -v pm2 >/dev/null 2>&1; then
    for pm2_name in dali dali-contracting dally; do
      if pm2 describe "$pm2_name" >/dev/null 2>&1; then
        log "إعادة تشغيل عملية PM2: $pm2_name"
        pm2 restart "$pm2_name" --update-env
        pm2 save >/dev/null 2>&1 || true
        return 0
      fi
    done
  fi

  fail "لم أجد خدمة systemd أو عملية PM2 مرتبطة بالمشروع؛ لم يتم إيقاف أي عملية مجهولة"
}

cd "$ROOT"
log "المشروع: $ROOT"
load_env_file "$ENV_FILE"
export NODE_ENV=production

auth_secret="${AUTH_SECRET:-}"
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL غير موجود في ملف البيئة"
[[ ${#auth_secret} -ge 32 ]] || fail "AUTH_SECRET غير موجود أو أقصر من 32 حرفًا"
if [[ -n "${PORTAL_ADMIN_PASSWORD_HASH:-}" ]] && [[ ! "$PORTAL_ADMIN_PASSWORD_HASH" =~ ^pbkdf2\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$ ]]; then
  log "تنبيه: هاش مشرف البيئة غير صالح، وسيعتمد الدخول على بيانات الاعتماد المحفوظة إن وُجدت"
fi

log "تثبيت الاعتماديات المقفلة"
npm ci

log "فحص ملفات الهجرات"
npm run db:audit:migrations

log "إصلاح بنية تسجيل الدخول دون حذف بيانات"
npm run db:apply:postgres -- 0045_login_runtime_schema_repair.sql
node scripts/audit-auth-runtime.mjs

log "استكمال هجرة المحادثات والتقييمات المعلقة"
if ! npm run db:apply:postgres -- 0044_conversation_video_ratings.sql; then
  log "تحذير: بقيت هجرة التقييمات معلقة، لكن إصلاح تسجيل الدخول سيستمر لأنها وحدة مستقلة"
fi

log "تدقيق بنية PostgreSQL العامة"
if ! npm run db:audit:postgres; then
  log "تحذير: التدقيق العام وجد عدم تطابق خارج جداول تسجيل الدخول؛ راجع المخرجات أعلاه بعد استعادة الدخول"
fi

log "إنشاء بناء إنتاجي نظيف لمنع اختلاط HTML وCSS من إصدارين مختلفين"
rm -rf .next
npm run build
[[ -f .next/BUILD_ID ]] || fail "لم ينتج البناء ملف BUILD_ID"
[[ -d .next/static ]] || fail "لم ينتج البناء مجلد static"
find .next/static -type f -name '*.css' -print -quit | grep -q . || fail "لم ينتج البناء أي ملف CSS"
find .next/static -type f -name '*.js' -print -quit | grep -q . || fail "لم ينتج البناء أي ملف JavaScript"
chmod +x scripts/start-godaddy.sh

restart_application

PORT="${PORT:-3000}"
BASE_URL="http://127.0.0.1:${PORT}"
log "انتظار جاهزية التطبيق محليًا"
ready=0
for _ in $(seq 1 60); do
  if curl -fsS "$BASE_URL/api/health/live" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" -eq 1 ]] || fail "لم تستجب الخدمة محليًا على المنفذ $PORT"

log "فحص جاهزية قاعدة البيانات والمصادقة"
curl -fsS "$BASE_URL/api/health/ready"
printf '\n'

log "فحص صفحة الدخول وكل ملفات CSS التي تشير إليها"
login_html="$(curl -fsS "$BASE_URL/login?repair=$(date +%s)")"
grep -q 'login-credentials-form' <<<"$login_html" || fail "صفحة الدخول لا تحتوي نموذج تسجيل الدخول المتوقع"
mapfile -t css_assets < <(grep -oE '/_next/static/[^"<> ]+\.css[^"<> ]*' <<<"$login_html" | sort -u)
(( ${#css_assets[@]} > 0 )) || fail "صفحة الدخول لم تُرجع رابط CSS مبنيًا"
for asset in "${css_assets[@]}"; do
  curl -fsS -o /dev/null "$BASE_URL$asset" || fail "تعذر تحميل ملف CSS: $asset"
done

log "فحص مسار تسجيل الدخول عبر عنوان reverse proxy دون استخدام بيانات حقيقية"
headers_file="$(mktemp)"
trap 'rm -f "${headers_file:-}"' EXIT
login_status="$(curl -sS -o /dev/null -D "$headers_file" -w '%{http_code}' \
  -X POST \
  -H 'content-type: application/x-www-form-urlencoded' \
  -H 'origin: https://dali-repair.local' \
  -H 'host: dali-repair.local' \
  -H 'x-forwarded-host: dali-repair.local' \
  -H 'x-forwarded-proto: https' \
  --data-urlencode 'identifier=0000000000' \
  --data-urlencode 'password=not-a-real-password-2026!' \
  --data-urlencode 'returnTo=/portal' \
  "$BASE_URL/api/auth/login")"
[[ "$login_status" == "303" ]] || fail "مسار الدخول أعاد HTTP $login_status بدل 303"
if grep -qi 'location: .*error=service' "$headers_file"; then
  cat "$headers_file" >&2
  fail "مسار تسجيل الدخول ما زال يقع في خطأ خدمة"
fi

log "نجح الإصلاح"
printf '[dali-repair] commit=%s build=%s css_files=%s\n' \
  "$(git rev-parse --short HEAD)" "$(cat .next/BUILD_ID)" "${#css_assets[@]}"
