ALTER TABLE "visitor_conversations"
  ADD COLUMN IF NOT EXISTS "employee_rating" integer;
ALTER TABLE "visitor_conversations" ADD COLUMN IF NOT EXISTS "company_rating" integer;
ALTER TABLE "visitor_conversations" ADD COLUMN IF NOT EXISTS "rating_comment" text;
ALTER TABLE "visitor_conversations" ADD COLUMN IF NOT EXISTS "rated_at" text;

ALTER TABLE "visitor_conversations"
  DROP CONSTRAINT IF EXISTS "visitor_conversations_employee_rating_check",
  DROP CONSTRAINT IF EXISTS "visitor_conversations_company_rating_check";

ALTER TABLE "visitor_conversations"
  ADD CONSTRAINT "visitor_conversations_employee_rating_check" CHECK ("employee_rating" IS NULL OR "employee_rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "visitor_conversations_company_rating_check" CHECK ("company_rating" IS NULL OR "company_rating" BETWEEN 1 AND 5);

ALTER TABLE "video_interviews"
  ADD COLUMN IF NOT EXISTS "employee_rating" integer;
ALTER TABLE "video_interviews" ADD COLUMN IF NOT EXISTS "company_rating" integer;
ALTER TABLE "video_interviews" ADD COLUMN IF NOT EXISTS "rating_comment" text;
ALTER TABLE "video_interviews" ADD COLUMN IF NOT EXISTS "rated_at" text;

ALTER TABLE "video_interviews"
  DROP CONSTRAINT IF EXISTS "video_interviews_employee_rating_check",
  DROP CONSTRAINT IF EXISTS "video_interviews_company_rating_check";

ALTER TABLE "video_interviews"
  ADD CONSTRAINT "video_interviews_employee_rating_check" CHECK ("employee_rating" IS NULL OR "employee_rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "video_interviews_company_rating_check" CHECK ("company_rating" IS NULL OR "company_rating" BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS "visitor_conversations_rated_at_idx" ON "visitor_conversations" ("rated_at");
CREATE INDEX IF NOT EXISTS "video_interviews_rated_at_idx" ON "video_interviews" ("rated_at");
