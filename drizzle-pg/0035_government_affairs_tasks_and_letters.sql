CREATE TABLE IF NOT EXISTS "government_sites" (
  "id" serial PRIMARY KEY, "name" text NOT NULL, "portal_url" text NOT NULL,
  "username_envelope" text, "password_envelope" text, "account_reference" text, "notes" text,
  "status" text NOT NULL DEFAULT 'active', "created_by" text NOT NULL, "updated_by" text NOT NULL,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text, "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT "government_sites_status_check" CHECK ("status" IN ('active','inactive','archived'))
);
CREATE INDEX IF NOT EXISTS "government_sites_status_name_idx" ON "government_sites" ("status", "name");

CREATE TABLE IF NOT EXISTS "government_payment_requests" (
  "id" serial PRIMARY KEY, "reference_code" text NOT NULL UNIQUE,
  "government_site_id" integer REFERENCES "government_sites"("id") ON DELETE SET NULL,
  "service_name" text NOT NULL, "amount_halalas" integer NOT NULL, "sadad_number" text NOT NULL,
  "biller_number" text NOT NULL, "due_date" text NOT NULL, "status" text NOT NULL DEFAULT 'pending',
  "notes" text, "requested_by" text NOT NULL, "paid_by" text, "paid_at" text,
  "financial_record_id" integer REFERENCES "financial_records"("id") ON DELETE RESTRICT,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text, "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT "government_payments_amount_check" CHECK ("amount_halalas" > 0),
  CONSTRAINT "government_payments_status_check" CHECK ("status" IN ('pending','paid','cancelled'))
);
CREATE INDEX IF NOT EXISTS "government_payments_status_due_idx" ON "government_payment_requests" ("status", "due_date");
CREATE UNIQUE INDEX IF NOT EXISTS "government_payments_financial_unique" ON "government_payment_requests" ("financial_record_id");

CREATE TABLE IF NOT EXISTS "portal_tasks" (
  "id" serial PRIMARY KEY, "title" text NOT NULL, "description" text, "due_at" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'normal', "visibility" text NOT NULL DEFAULT 'private',
  "status" text NOT NULL DEFAULT 'open', "created_by" text NOT NULL, "completed_by" text, "completed_at" text,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text, "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT "portal_tasks_priority_check" CHECK ("priority" IN ('low','normal','high','urgent')),
  CONSTRAINT "portal_tasks_visibility_check" CHECK ("visibility" IN ('private','assigned')),
  CONSTRAINT "portal_tasks_status_check" CHECK ("status" IN ('open','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS "portal_tasks_creator_status_idx" ON "portal_tasks" ("created_by", "status");
CREATE INDEX IF NOT EXISTS "portal_tasks_due_status_idx" ON "portal_tasks" ("due_at", "status");

CREATE TABLE IF NOT EXISTS "portal_task_assignees" (
  "id" serial PRIMARY KEY, "task_id" integer NOT NULL REFERENCES "portal_tasks"("id") ON DELETE CASCADE,
  "user_email" text NOT NULL, "status" text NOT NULL DEFAULT 'open', "reminder_acknowledged_at" text, "completed_at" text,
  CONSTRAINT "portal_task_assignees_status_check" CHECK ("status" IN ('open','completed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "portal_task_assignees_unique" ON "portal_task_assignees" ("task_id", "user_email");
CREATE INDEX IF NOT EXISTS "portal_task_assignees_user_status_idx" ON "portal_task_assignees" ("user_email", "status");

CREATE TABLE IF NOT EXISTS "official_letters" (
  "id" serial PRIMARY KEY, "reference_code" text NOT NULL UNIQUE, "subject" text NOT NULL,
  "recipient" text NOT NULL, "body" text NOT NULL, "status" text NOT NULL DEFAULT 'draft',
  "cancellation_reason" text, "document_id" integer REFERENCES "company_documents"("id") ON DELETE SET NULL,
  "created_by" text NOT NULL, "cancelled_by" text, "cancelled_at" text,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text, "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT "official_letters_status_check" CHECK ("status" IN ('draft','approved','sent','cancelled'))
);
CREATE INDEX IF NOT EXISTS "official_letters_status_updated_idx" ON "official_letters" ("status", "updated_at");

ALTER TABLE "government_sites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "government_payment_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal_task_assignees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "official_letters" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "government_sites", "government_payment_requests", "portal_tasks", "portal_task_assignees", "official_letters" FROM PUBLIC;
