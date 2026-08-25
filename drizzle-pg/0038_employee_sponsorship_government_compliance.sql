ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "sponsorship_type" text NOT NULL DEFAULT 'dali',
  ADD COLUMN IF NOT EXISTS "sponsor_name" text,
  ADD COLUMN IF NOT EXISTS "iqama_expiry" text,
  ADD COLUMN IF NOT EXISTS "work_permit_expiry" text,
  ADD COLUMN IF NOT EXISTS "archived_at" text;

UPDATE "employees" e
SET "iqama_expiry" = d."expiry_date"
FROM "employee_documents" d
WHERE d."employee_id" = e."id"
  AND d."document_type" = 'national_id'
  AND e."iqama_expiry" IS NULL;

UPDATE "employees" e
SET "contract_end_date" = d."expiry_date"
FROM "employee_documents" d
WHERE d."employee_id" = e."id"
  AND d."document_type" = 'employment_contract'
  AND e."contract_end_date" IS NULL
  AND d."expiry_date" IS NOT NULL;

ALTER TABLE "employees"
  DROP CONSTRAINT IF EXISTS "employees_sponsorship_type_check",
  DROP CONSTRAINT IF EXISTS "employees_sponsor_consistency_check";

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_sponsorship_type_check"
    CHECK ("sponsorship_type" IN ('dali','other')),
  ADD CONSTRAINT "employees_sponsor_consistency_check"
    CHECK (
      ("sponsorship_type" = 'dali' AND "sponsor_name" IS NULL)
      OR
      ("sponsorship_type" = 'other' AND length(trim("sponsor_name")) >= 2)
    );

CREATE INDEX IF NOT EXISTS "employees_compliance_expiry_idx"
  ON "employees" ("iqama_expiry", "work_permit_expiry", "contract_end_date");
