-- Repair installations that received the document-governance application code
-- before migrations 0035/0037 were recorded. Every statement is idempotent and
-- preserves existing letters.
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

CREATE TABLE IF NOT EXISTS "official_letters" (
  "id" serial PRIMARY KEY,
  "reference_code" text NOT NULL UNIQUE,
  "subject" text NOT NULL,
  "recipient" text NOT NULL,
  "body" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "stamp_id" integer REFERENCES "document_stamps"("id") ON DELETE RESTRICT,
  "cancellation_reason" text,
  "document_id" integer REFERENCES "company_documents"("id") ON DELETE SET NULL,
  "created_by" text NOT NULL,
  "cancelled_by" text,
  "cancelled_at" text,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

ALTER TABLE "official_letters" ADD COLUMN IF NOT EXISTS "stamp_id" integer REFERENCES "document_stamps"("id") ON DELETE RESTRICT;
ALTER TABLE "official_letters" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;
ALTER TABLE "official_letters" ADD COLUMN IF NOT EXISTS "document_id" integer REFERENCES "company_documents"("id") ON DELETE SET NULL;
ALTER TABLE "official_letters" ADD COLUMN IF NOT EXISTS "cancelled_by" text;
ALTER TABLE "official_letters" ADD COLUMN IF NOT EXISTS "cancelled_at" text;

CREATE INDEX IF NOT EXISTS "document_stamps_active_idx" ON "document_stamps" ("active", "updated_at");
CREATE INDEX IF NOT EXISTS "official_letters_status_updated_idx" ON "official_letters" ("status", "updated_at");

ALTER TABLE "document_stamps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "official_letters" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "document_stamps", "official_letters" FROM PUBLIC;
