ALTER TABLE "workforce_contracts"
  ADD COLUMN IF NOT EXISTS "contract_direction" text NOT NULL DEFAULT 'dali_supplier';
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "supplier_id" integer;
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "representative_request_id" integer;

ALTER TABLE "workforce_contracts"
  DROP CONSTRAINT IF EXISTS "workforce_contracts_direction_check";

ALTER TABLE "workforce_contracts"
  ADD CONSTRAINT "workforce_contracts_direction_check"
  CHECK ("contract_direction" IN ('dali_supplier', 'dali_purchaser'));

ALTER TABLE "contract_clauses"
  ADD COLUMN IF NOT EXISTS "section" text NOT NULL DEFAULT 'بنود إضافية';

ALTER TABLE "contract_clauses" ADD COLUMN IF NOT EXISTS "section_en" text;
ALTER TABLE "contract_clauses" ADD COLUMN IF NOT EXISTS "title_en" text;
ALTER TABLE "contract_clauses" ADD COLUMN IF NOT EXISTS "body_en" text;

CREATE INDEX IF NOT EXISTS "contract_clauses_section_idx"
  ON "contract_clauses" ("contract_id", "section");
CREATE INDEX IF NOT EXISTS "workforce_contracts_supplier_idx" ON "workforce_contracts" ("supplier_id");
CREATE INDEX IF NOT EXISTS "workforce_contracts_representative_request_idx" ON "workforce_contracts" ("representative_request_id");
