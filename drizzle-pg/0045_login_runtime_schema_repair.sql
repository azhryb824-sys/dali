-- Repair only the tables and columns required by credential login, password
-- recovery and request throttling. All statements are additive/idempotent.

CREATE TABLE IF NOT EXISTS "portal_users" (
  "email" text PRIMARY KEY NOT NULL,
  "display_name" text NOT NULL,
  "role" text DEFAULT 'employee' NOT NULL,
  "department" text DEFAULT 'general' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_department" text,
  "requested_job_title" text,
  "request_reason" text,
  "request_submitted_at" text,
  "terms_accepted_at" text,
  "preferred_language" text,
  "language_selected_at" text,
  "approved_by" text,
  "approved_at" text,
  "suspended_at" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "last_login_at" text,
  "last_activity_at" text
);

ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "display_name" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "role" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "department" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "requested_department" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "requested_job_title" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "request_reason" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "request_submitted_at" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "preferred_language" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "language_selected_at" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "approved_by" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "approved_at" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "suspended_at" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "created_at" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "updated_at" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "last_login_at" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "last_activity_at" text;

UPDATE "portal_users"
SET
  "display_name" = COALESCE(NULLIF("display_name", ''), split_part("email", '@', 1), "email"),
  "role" = COALESCE(NULLIF("role", ''), 'employee'),
  "department" = COALESCE(NULLIF("department", ''), 'general'),
  "status" = COALESCE(NULLIF("status", ''), 'pending'),
  "created_at" = COALESCE(NULLIF("created_at", ''), CURRENT_TIMESTAMP::text),
  "updated_at" = COALESCE(NULLIF("updated_at", ''), CURRENT_TIMESTAMP::text),
  "preferred_language" = CASE WHEN "preferred_language" = 'ur' THEN 'bn' ELSE "preferred_language" END
WHERE
  "display_name" IS NULL OR "display_name" = ''
  OR "role" IS NULL OR "role" = ''
  OR "department" IS NULL OR "department" = ''
  OR "status" IS NULL OR "status" = ''
  OR "created_at" IS NULL OR "created_at" = ''
  OR "updated_at" IS NULL OR "updated_at" = ''
  OR "preferred_language" = 'ur';

ALTER TABLE "portal_users" ALTER COLUMN "role" SET DEFAULT 'employee';
ALTER TABLE "portal_users" ALTER COLUMN "department" SET DEFAULT 'general';
ALTER TABLE "portal_users" ALTER COLUMN "status" SET DEFAULT 'pending';
ALTER TABLE "portal_users" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP::text;
ALTER TABLE "portal_users" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP::text;
ALTER TABLE "portal_users" ALTER COLUMN "display_name" SET NOT NULL;
ALTER TABLE "portal_users" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "portal_users" ALTER COLUMN "department" SET NOT NULL;
ALTER TABLE "portal_users" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "portal_users" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "portal_users" ALTER COLUMN "updated_at" SET NOT NULL;
ALTER TABLE "portal_users" DROP CONSTRAINT IF EXISTS "portal_users_preferred_language_check";
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_preferred_language_check"
  CHECK ("preferred_language" IS NULL OR "preferred_language" IN ('ar','en','bn'));
CREATE INDEX IF NOT EXISTS "portal_users_status_idx" ON "portal_users" ("status");
CREATE INDEX IF NOT EXISTS "portal_users_role_idx" ON "portal_users" ("role");
CREATE INDEX IF NOT EXISTS "portal_users_department_idx" ON "portal_users" ("department");
CREATE INDEX IF NOT EXISTS "portal_users_language_idx" ON "portal_users" ("preferred_language");

CREATE TABLE IF NOT EXISTS "portal_auth_credentials" (
  "identifier" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "password_hash" text NOT NULL,
  "must_change_password" boolean DEFAULT false NOT NULL,
  "password_changed_at" text,
  "mfa_secret_encrypted" text,
  "mfa_enabled_at" text,
  "mfa_recovery_hashes_json" text,
  "mfa_recovery_generated_at" text,
  "mfa_last_verified_at" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);

ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "display_name" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "password_hash" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "must_change_password" boolean;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "password_changed_at" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "mfa_secret_encrypted" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "mfa_enabled_at" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "mfa_recovery_hashes_json" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "mfa_recovery_generated_at" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "mfa_last_verified_at" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "created_at" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "updated_at" text;

UPDATE "portal_auth_credentials"
SET
  "display_name" = COALESCE(NULLIF("display_name", ''), split_part(COALESCE("email", "identifier"), '@', 1), "identifier"),
  "must_change_password" = COALESCE("must_change_password", false),
  "created_at" = COALESCE(NULLIF("created_at", ''), CURRENT_TIMESTAMP::text),
  "updated_at" = COALESCE(NULLIF("updated_at", ''), CURRENT_TIMESTAMP::text)
WHERE
  "display_name" IS NULL OR "display_name" = ''
  OR "must_change_password" IS NULL
  OR "created_at" IS NULL OR "created_at" = ''
  OR "updated_at" IS NULL OR "updated_at" = '';

ALTER TABLE "portal_auth_credentials" ALTER COLUMN "must_change_password" SET DEFAULT false;
ALTER TABLE "portal_auth_credentials" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP::text;
ALTER TABLE "portal_auth_credentials" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP::text;
ALTER TABLE "portal_auth_credentials" ALTER COLUMN "display_name" SET NOT NULL;
ALTER TABLE "portal_auth_credentials" ALTER COLUMN "must_change_password" SET NOT NULL;
ALTER TABLE "portal_auth_credentials" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "portal_auth_credentials" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "portal_auth_credentials_email_unique" ON "portal_auth_credentials" ("email");
CREATE INDEX IF NOT EXISTS "portal_auth_credentials_email_idx" ON "portal_auth_credentials" ("email");

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL REFERENCES "portal_auth_credentials"("identifier") ON DELETE cascade,
  "email" text NOT NULL,
  "expires_at" text NOT NULL,
  "used_at" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
ALTER TABLE "password_reset_tokens" ADD COLUMN IF NOT EXISTS "identifier" text;
ALTER TABLE "password_reset_tokens" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "password_reset_tokens" ADD COLUMN IF NOT EXISTS "expires_at" text;
ALTER TABLE "password_reset_tokens" ADD COLUMN IF NOT EXISTS "used_at" text;
ALTER TABLE "password_reset_tokens" ADD COLUMN IF NOT EXISTS "created_at" text;
UPDATE "password_reset_tokens"
SET "created_at" = COALESCE(NULLIF("created_at", ''), CURRENT_TIMESTAMP::text)
WHERE "created_at" IS NULL OR "created_at" = '';
ALTER TABLE "password_reset_tokens" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP::text;
ALTER TABLE "password_reset_tokens" ALTER COLUMN "created_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "password_reset_tokens_identifier_idx" ON "password_reset_tokens" ("identifier");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_idx" ON "password_reset_tokens" ("expires_at");

CREATE TABLE IF NOT EXISTS "public_rate_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "window_started_at" text NOT NULL,
  "request_count" integer DEFAULT 0 NOT NULL,
  "blocked_until" text,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
ALTER TABLE "public_rate_limits" ADD COLUMN IF NOT EXISTS "window_started_at" text;
ALTER TABLE "public_rate_limits" ADD COLUMN IF NOT EXISTS "request_count" integer;
ALTER TABLE "public_rate_limits" ADD COLUMN IF NOT EXISTS "blocked_until" text;
ALTER TABLE "public_rate_limits" ADD COLUMN IF NOT EXISTS "updated_at" text;
UPDATE "public_rate_limits"
SET
  "window_started_at" = COALESCE(NULLIF("window_started_at", ''), CURRENT_TIMESTAMP::text),
  "request_count" = COALESCE("request_count", 0),
  "blocked_until" = CASE WHEN "blocked_until" IS NOT NULL AND "blocked_until" <= CURRENT_TIMESTAMP::text THEN NULL ELSE "blocked_until" END,
  "updated_at" = COALESCE(NULLIF("updated_at", ''), CURRENT_TIMESTAMP::text)
WHERE
  "window_started_at" IS NULL OR "window_started_at" = ''
  OR "request_count" IS NULL
  OR ("blocked_until" IS NOT NULL AND "blocked_until" <= CURRENT_TIMESTAMP::text)
  OR "updated_at" IS NULL OR "updated_at" = '';
ALTER TABLE "public_rate_limits" ALTER COLUMN "request_count" SET DEFAULT 0;
ALTER TABLE "public_rate_limits" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP::text;
ALTER TABLE "public_rate_limits" ALTER COLUMN "window_started_at" SET NOT NULL;
ALTER TABLE "public_rate_limits" ALTER COLUMN "request_count" SET NOT NULL;
ALTER TABLE "public_rate_limits" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "public_rate_limits_updated_idx" ON "public_rate_limits" ("updated_at");

REVOKE ALL ON TABLE "portal_auth_credentials", "password_reset_tokens", "public_rate_limits" FROM PUBLIC;

DO $dali_login_acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.portal_auth_credentials, public.password_reset_tokens, public.public_rate_limits FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.portal_auth_credentials, public.password_reset_tokens, public.public_rate_limits FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dali_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_users, public.portal_auth_credentials, public.password_reset_tokens, public.public_rate_limits TO dali_app';
  END IF;
END
$dali_login_acl$;
