UPDATE "portal_users"
SET "preferred_language" = 'bn', "updated_at" = now()::text
WHERE "preferred_language" = 'ur';

ALTER TABLE "portal_users" DROP CONSTRAINT IF EXISTS "portal_users_preferred_language_check";
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_preferred_language_check"
  CHECK ("preferred_language" IS NULL OR "preferred_language" IN ('ar','en','bn'));
