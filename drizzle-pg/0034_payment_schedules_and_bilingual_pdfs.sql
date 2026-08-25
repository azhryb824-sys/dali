ALTER TABLE "quote_versions" ADD COLUMN IF NOT EXISTS "season_type" text NOT NULL DEFAULT 'regular';
ALTER TABLE "quote_versions" ADD COLUMN IF NOT EXISTS "payment_schedule_json" text;

ALTER TABLE "quote_versions" DROP CONSTRAINT IF EXISTS "quote_versions_season_type_check";
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_season_type_check"
  CHECK ("season_type" IN ('regular','ramadan','hajj'));

CREATE INDEX IF NOT EXISTS "quote_versions_season_type_idx"
  ON "quote_versions" ("season_type");
