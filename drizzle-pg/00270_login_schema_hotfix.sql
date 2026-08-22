-- Numeric migration name intentionally sorts before 0028 while remaining
-- discoverable by the runtime migration loader.
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "preferred_language" text;
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "language_selected_at" text;
ALTER TABLE "portal_users" DROP CONSTRAINT IF EXISTS "portal_users_preferred_language_check";
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_preferred_language_check" CHECK ("preferred_language" IS NULL OR "preferred_language" IN ('ar','en','ur'));
CREATE INDEX IF NOT EXISTS "portal_users_language_idx" ON "portal_users" ("preferred_language");
INSERT INTO private.__dali_migrations (name) VALUES ('00270_login_schema_hotfix.sql') ON CONFLICT (name) DO NOTHING;
