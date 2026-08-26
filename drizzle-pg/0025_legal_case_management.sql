CREATE TABLE IF NOT EXISTS "legal_case_activities" (
  "id" serial PRIMARY KEY NOT NULL,
  "legal_record_id" integer NOT NULL REFERENCES "legal_records"("id") ON DELETE CASCADE,
  "activity_type" text DEFAULT 'task' NOT NULL,
  "title" text NOT NULL,
  "details" text,
  "priority" text DEFAULT 'medium' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "due_at" text,
  "assigned_to" text,
  "completed_at" text,
  "created_by" text NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "legal_case_activities_type_check" CHECK ("activity_type" in ('task','deadline','note','communication','hearing','settlement')),
  CONSTRAINT "legal_case_activities_priority_check" CHECK ("priority" in ('low','medium','high','critical')),
  CONSTRAINT "legal_case_activities_status_check" CHECK ("status" in ('open','in_progress','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS "legal_case_activities_case_idx" ON "legal_case_activities" USING btree ("legal_record_id");
CREATE INDEX IF NOT EXISTS "legal_case_activities_due_idx" ON "legal_case_activities" USING btree ("due_at");
CREATE INDEX IF NOT EXISTS "legal_case_activities_status_idx" ON "legal_case_activities" USING btree ("status");
ALTER TABLE "legal_case_activities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "legal_case_activities" FROM PUBLIC;
DO $dali_migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.legal_case_activities FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.legal_case_activities FROM authenticated';
  END IF;
END
$dali_migration$;
