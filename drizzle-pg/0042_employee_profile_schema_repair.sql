-- Complete employee columns expected by the current Drizzle schema.
-- This repairs production databases copied before migration 0028 without
-- changing or deleting existing employee records.
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "portal_user_email" text REFERENCES "portal_users"("email") ON DELETE SET NULL;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "manager_id" integer;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "work_location" text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "employment_type" text NOT NULL DEFAULT 'full_time';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "contract_type" text NOT NULL DEFAULT 'fixed_term';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "gosi_number" text;

CREATE UNIQUE INDEX IF NOT EXISTS "employees_portal_user_unique" ON "employees" ("portal_user_email");
CREATE INDEX IF NOT EXISTS "employees_manager_idx" ON "employees" ("manager_id");
