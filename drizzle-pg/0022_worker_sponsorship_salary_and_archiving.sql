ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "monthly_salary_halalas" integer NOT NULL DEFAULT 0;
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "is_company_sponsored" boolean NOT NULL DEFAULT false;
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "archived_at" text;
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "archived_by" text;
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "archive_reason" text;
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_monthly_salary_check";
ALTER TABLE "workers" ADD CONSTRAINT "workers_monthly_salary_check" CHECK ("monthly_salary_halalas" >= 0);
CREATE INDEX IF NOT EXISTS "workers_archived_at_idx" ON "workers" ("archived_at");
CREATE UNIQUE INDEX IF NOT EXISTS "financial_records_worker_salary_period_unique" ON "financial_records" ("worker_id", "period_month") WHERE "category" = 'worker_salary' AND "status" <> 'cancelled';
