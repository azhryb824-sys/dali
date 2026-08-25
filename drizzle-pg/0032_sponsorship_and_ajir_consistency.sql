ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "sponsorship_type" text;
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "sponsor_name" text;
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "ajir_contract_status" text;

UPDATE "workers"
SET "sponsorship_type" = CASE WHEN "is_company_sponsored" THEN 'dali' ELSE 'other' END
WHERE "sponsorship_type" IS NULL;

UPDATE "workers"
SET "sponsor_name" = 'غير محدد (بيانات سابقة)'
WHERE "sponsorship_type" = 'other' AND NULLIF(BTRIM("sponsor_name"), '') IS NULL;

UPDATE "workers"
SET "ajir_contract_status" = CASE WHEN "sponsorship_type" = 'dali' THEN 'not_applicable' ELSE 'without_ajir' END
WHERE "ajir_contract_status" IS NULL;

ALTER TABLE "workers" ALTER COLUMN "sponsorship_type" SET DEFAULT 'other';
ALTER TABLE "workers" ALTER COLUMN "sponsorship_type" SET NOT NULL;
ALTER TABLE "workers" ALTER COLUMN "ajir_contract_status" SET DEFAULT 'without_ajir';
ALTER TABLE "workers" ALTER COLUMN "ajir_contract_status" SET NOT NULL;
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_sponsorship_type_check";
ALTER TABLE "workers" ADD CONSTRAINT "workers_sponsorship_type_check" CHECK ("sponsorship_type" IN ('dali','other'));
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_ajir_contract_status_check";
ALTER TABLE "workers" ADD CONSTRAINT "workers_ajir_contract_status_check" CHECK ("ajir_contract_status" IN ('not_applicable','with_ajir','without_ajir'));
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_sponsorship_consistency_check";
ALTER TABLE "workers" ADD CONSTRAINT "workers_sponsorship_consistency_check" CHECK (
  ("sponsorship_type" = 'dali' AND "is_company_sponsored" = true AND "ajir_contract_status" = 'not_applicable') OR
  ("sponsorship_type" = 'other' AND "is_company_sponsored" = false AND NULLIF(BTRIM("sponsor_name"), '') IS NOT NULL AND "ajir_contract_status" IN ('with_ajir','without_ajir'))
);
CREATE INDEX IF NOT EXISTS "workers_sponsorship_idx" ON "workers" ("sponsorship_type", "ajir_contract_status");

ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "sponsorship_type" text;
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "sponsor_name" text;
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "ajir_contract_status" text;

ALTER TABLE "contract_professions" ADD COLUMN IF NOT EXISTS "sponsorship_type" text;
ALTER TABLE "contract_professions" ADD COLUMN IF NOT EXISTS "sponsor_name" text;
ALTER TABLE "contract_professions" ADD COLUMN IF NOT EXISTS "ajir_contract_status" text;

ALTER TABLE "quote_items" DROP CONSTRAINT IF EXISTS "quote_items_sponsorship_type_check";
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_sponsorship_type_check" CHECK ("sponsorship_type" IS NULL OR "sponsorship_type" IN ('dali','other'));
ALTER TABLE "quote_items" DROP CONSTRAINT IF EXISTS "quote_items_ajir_contract_status_check";
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_ajir_contract_status_check" CHECK ("ajir_contract_status" IS NULL OR "ajir_contract_status" IN ('not_applicable','with_ajir','without_ajir'));
ALTER TABLE "quote_items" DROP CONSTRAINT IF EXISTS "quote_items_sponsorship_consistency_check";
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_sponsorship_consistency_check" CHECK (
  "sponsorship_type" IS NULL OR
  ("sponsorship_type" = 'dali' AND "sponsor_name" IS NULL AND "ajir_contract_status" = 'not_applicable') OR
  ("sponsorship_type" = 'other' AND NULLIF(BTRIM("sponsor_name"), '') IS NOT NULL AND "ajir_contract_status" IN ('with_ajir','without_ajir'))
);
ALTER TABLE "contract_professions" DROP CONSTRAINT IF EXISTS "contract_professions_sponsorship_type_check";
ALTER TABLE "contract_professions" ADD CONSTRAINT "contract_professions_sponsorship_type_check" CHECK ("sponsorship_type" IS NULL OR "sponsorship_type" IN ('dali','other'));
ALTER TABLE "contract_professions" DROP CONSTRAINT IF EXISTS "contract_professions_ajir_contract_status_check";
ALTER TABLE "contract_professions" ADD CONSTRAINT "contract_professions_ajir_contract_status_check" CHECK ("ajir_contract_status" IS NULL OR "ajir_contract_status" IN ('not_applicable','with_ajir','without_ajir'));
ALTER TABLE "contract_professions" DROP CONSTRAINT IF EXISTS "contract_professions_sponsorship_consistency_check";
ALTER TABLE "contract_professions" ADD CONSTRAINT "contract_professions_sponsorship_consistency_check" CHECK (
  "sponsorship_type" IS NULL OR
  ("sponsorship_type" = 'dali' AND "sponsor_name" IS NULL AND "ajir_contract_status" = 'not_applicable') OR
  ("sponsorship_type" = 'other' AND NULLIF(BTRIM("sponsor_name"), '') IS NOT NULL AND "ajir_contract_status" IN ('with_ajir','without_ajir'))
);
