-- Restore government-affairs structures on databases copied before migration 0035.
-- Additive and idempotent: existing sites, payments, and employee data are preserved.
CREATE TABLE IF NOT EXISTS "government_sites" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "portal_url" text NOT NULL,
  "username_envelope" text,
  "password_envelope" text,
  "account_reference" text,
  "notes" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT "government_sites_status_check" CHECK ("status" IN ('active','inactive','archived'))
);

CREATE TABLE IF NOT EXISTS "government_payment_requests" (
  "id" serial PRIMARY KEY,
  "reference_code" text NOT NULL UNIQUE,
  "government_site_id" integer REFERENCES "government_sites"("id") ON DELETE SET NULL,
  "service_name" text NOT NULL,
  "amount_halalas" integer NOT NULL,
  "sadad_number" text NOT NULL,
  "biller_number" text NOT NULL,
  "due_date" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "notes" text,
  "requested_by" text NOT NULL,
  "paid_by" text,
  "paid_at" text,
  "financial_record_id" integer REFERENCES "financial_records"("id") ON DELETE RESTRICT,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT "government_payments_amount_check" CHECK ("amount_halalas" > 0),
  CONSTRAINT "government_payments_status_check" CHECK ("status" IN ('pending','paid','cancelled'))
);

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "sponsorship_type" text NOT NULL DEFAULT 'dali';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "sponsor_name" text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "iqama_expiry" text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "work_permit_expiry" text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "contract_end_date" text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "archived_at" text;

CREATE INDEX IF NOT EXISTS "government_sites_status_name_idx" ON "government_sites" ("status", "name");
CREATE INDEX IF NOT EXISTS "government_payments_status_due_idx" ON "government_payment_requests" ("status", "due_date");
CREATE UNIQUE INDEX IF NOT EXISTS "government_payments_financial_unique" ON "government_payment_requests" ("financial_record_id");
CREATE INDEX IF NOT EXISTS "employees_compliance_expiry_idx" ON "employees" ("iqama_expiry", "work_permit_expiry", "contract_end_date");

ALTER TABLE "government_sites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "government_payment_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "government_sites", "government_payment_requests" FROM PUBLIC;
