-- Reconcile databases restored from the original Supabase baseline with the
-- current sales, quotation, contract, billing, and document workflows.
-- This migration is deliberately additive and preserves every existing row.

CREATE TABLE IF NOT EXISTS "document_stamps" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "storage_key" text NOT NULL UNIQUE,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_by" text NOT NULL,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS "document_drafts" (
  "id" serial PRIMARY KEY,
  "document_type" text NOT NULL,
  "title" text NOT NULL DEFAULT 'مسودة غير مكتملة',
  "payload_json" text NOT NULL,
  "completion_percent" integer NOT NULL DEFAULT 0,
  "owner_email" text NOT NULL,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS "sales_representatives" (
  "id" serial PRIMARY KEY,
  "representative_code" text NOT NULL UNIQUE,
  "full_name" text NOT NULL,
  "mobile" text NOT NULL,
  "email" text,
  "national_id" text UNIQUE,
  "region" text NOT NULL DEFAULT 'مكة المكرمة',
  "commission_bps" integer NOT NULL DEFAULT 0,
  "representative_type" text NOT NULL DEFAULT 'sales',
  "status" text NOT NULL DEFAULT 'active',
  "created_by" text NOT NULL,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

ALTER TABLE "sales_representatives" ADD COLUMN IF NOT EXISTS "representative_type" text NOT NULL DEFAULT 'sales';
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "source_request_id" integer;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "sales_representative_id" integer;
ALTER TABLE "sales_opportunities" ADD COLUMN IF NOT EXISTS "sales_representative_id" integer;

ALTER TABLE "quote_versions" ADD COLUMN IF NOT EXISTS "quantity_mode" text NOT NULL DEFAULT 'fixed';
ALTER TABLE "quote_versions" ADD COLUMN IF NOT EXISTS "season_type" text NOT NULL DEFAULT 'regular';
ALTER TABLE "quote_versions" ADD COLUMN IF NOT EXISTS "payment_schedule_json" text;
ALTER TABLE "quote_versions" ADD COLUMN IF NOT EXISTS "vat_rate_bps" integer NOT NULL DEFAULT 0;
ALTER TABLE "quote_versions" ADD COLUMN IF NOT EXISTS "stamp_id" integer;

ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "sponsorship_type" text;
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "sponsor_name" text;
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "ajir_contract_status" text;

ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "contract_direction" text NOT NULL DEFAULT 'dali_supplier';
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "quantity_mode" text NOT NULL DEFAULT 'fixed';
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "vat_rate_bps" integer NOT NULL DEFAULT 0;
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "season_type" text NOT NULL DEFAULT 'regular';
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "billing_mode" text NOT NULL DEFAULT 'monthly';
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "first_payment_due_date" text;
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "stamp_id" integer;
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "supplier_id" integer;
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "source_request_id" integer;
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "sales_representative_id" integer;
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "representative_request_id" integer;

ALTER TABLE "contract_professions" ADD COLUMN IF NOT EXISTS "unit_salary_halalas" integer NOT NULL DEFAULT 0;
ALTER TABLE "contract_professions" ADD COLUMN IF NOT EXISTS "sponsorship_type" text;
ALTER TABLE "contract_professions" ADD COLUMN IF NOT EXISTS "sponsor_name" text;
ALTER TABLE "contract_professions" ADD COLUMN IF NOT EXISTS "ajir_contract_status" text;

ALTER TABLE "contract_clauses" ADD COLUMN IF NOT EXISTS "section" text NOT NULL DEFAULT 'بنود إضافية';
ALTER TABLE "contract_clauses" ADD COLUMN IF NOT EXISTS "section_en" text;
ALTER TABLE "contract_clauses" ADD COLUMN IF NOT EXISTS "title_en" text;
ALTER TABLE "contract_clauses" ADD COLUMN IF NOT EXISTS "body_en" text;

CREATE TABLE IF NOT EXISTS "contract_payment_schedules" (
  "id" serial PRIMARY KEY,
  "contract_id" integer NOT NULL,
  "installment_number" integer NOT NULL,
  "title" text NOT NULL,
  "due_date" text NOT NULL,
  "percentage_bps" integer NOT NULL,
  "amount_halalas" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'scheduled',
  "referred_by" text,
  "referred_at" text,
  "invoice_document_id" integer,
  "financial_record_id" integer,
  "invoiced_by" text,
  "invoiced_at" text,
  "paid_at" text,
  "created_by" text NOT NULL,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  UNIQUE ("contract_id", "installment_number")
);

ALTER TABLE "contract_payment_schedules" ADD COLUMN IF NOT EXISTS "subtotal_halalas" integer NOT NULL DEFAULT 0;
ALTER TABLE "contract_payment_schedules" ADD COLUMN IF NOT EXISTS "vat_halalas" integer NOT NULL DEFAULT 0;
ALTER TABLE "contract_payment_schedules" ADD COLUMN IF NOT EXISTS "vat_rate_bps" integer NOT NULL DEFAULT 0;
ALTER TABLE "contract_payment_schedules" ADD COLUMN IF NOT EXISTS "billing_basis" text NOT NULL DEFAULT 'seasonal_percentage';
ALTER TABLE "contract_payment_schedules" ADD COLUMN IF NOT EXISTS "service_period" text;

CREATE TABLE IF NOT EXISTS "representative_requests" (
  "id" serial PRIMARY KEY,
  "request_code" text NOT NULL UNIQUE,
  "representative_id" integer NOT NULL REFERENCES "sales_representatives"("id") ON DELETE RESTRICT,
  "request_type" text NOT NULL,
  "client_name" text,
  "client_mobile" text,
  "work_site" text,
  "title" text NOT NULL,
  "details" text NOT NULL,
  "items_json" text,
  "estimated_amount_halalas" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'submitted',
  "decision_reason" text,
  "decided_by" text,
  "decided_at" text,
  "quote_version_id" integer,
  "created_by" text NOT NULL,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

-- Old baseline constraints did not know the cancellation and open-quantity states.
ALTER TABLE "quote_versions" DROP CONSTRAINT IF EXISTS "quote_versions_status_check";
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_status_check"
  CHECK ("status" IN ('draft','pending_approval','approved','sent','accepted','rejected','expired','superseded','cancelled'));
ALTER TABLE "quote_items" DROP CONSTRAINT IF EXISTS "quote_items_quantity_check";
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quantity_check" CHECK ("quantity" >= 0);

CREATE INDEX IF NOT EXISTS "document_stamps_active_idx" ON "document_stamps" ("active", "updated_at");
CREATE INDEX IF NOT EXISTS "document_drafts_owner_type_idx" ON "document_drafts" ("owner_email", "document_type");
CREATE INDEX IF NOT EXISTS "clients_source_request_idx" ON "clients" ("source_request_id");
CREATE INDEX IF NOT EXISTS "clients_sales_representative_idx" ON "clients" ("sales_representative_id");
CREATE INDEX IF NOT EXISTS "sales_opportunities_representative_idx" ON "sales_opportunities" ("sales_representative_id");
CREATE INDEX IF NOT EXISTS "quote_items_quote_idx" ON "quote_items" ("quote_version_id");
CREATE INDEX IF NOT EXISTS "workforce_contracts_source_request_idx" ON "workforce_contracts" ("source_request_id");
CREATE INDEX IF NOT EXISTS "workforce_contracts_sales_representative_idx" ON "workforce_contracts" ("sales_representative_id");
CREATE INDEX IF NOT EXISTS "workforce_contracts_supplier_idx" ON "workforce_contracts" ("supplier_id");
CREATE INDEX IF NOT EXISTS "workforce_contracts_representative_request_idx" ON "workforce_contracts" ("representative_request_id");
CREATE UNIQUE INDEX IF NOT EXISTS "workforce_contracts_quote_version_unique" ON "workforce_contracts" ("quote_version_id") WHERE "quote_version_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "contract_clauses_section_idx" ON "contract_clauses" ("contract_id", "section");
CREATE INDEX IF NOT EXISTS "contract_payment_schedules_due_status_idx" ON "contract_payment_schedules" ("due_date", "status");
CREATE INDEX IF NOT EXISTS "representative_requests_rep_idx" ON "representative_requests" ("representative_id");
CREATE INDEX IF NOT EXISTS "representative_requests_status_idx" ON "representative_requests" ("status");
CREATE INDEX IF NOT EXISTS "representative_requests_type_idx" ON "representative_requests" ("request_type");
