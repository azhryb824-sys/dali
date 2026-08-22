ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "iban" text;
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "bank_name" text;
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "medical_insurance_expiry" text;
ALTER TABLE "worker_attachments" ADD COLUMN IF NOT EXISTS "expiry_date" text;
CREATE UNIQUE INDEX IF NOT EXISTS "workers_iban_unique" ON "workers" ("iban") WHERE "iban" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "workers_medical_insurance_expiry_idx" ON "workers" ("medical_insurance_expiry");
CREATE INDEX IF NOT EXISTS "worker_attachments_expiry_idx" ON "worker_attachments" ("expiry_date");
