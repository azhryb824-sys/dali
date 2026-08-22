ALTER TABLE "quote_versions" ADD COLUMN IF NOT EXISTS "quantity_mode" text NOT NULL DEFAULT 'fixed';
ALTER TABLE "quote_versions" ADD COLUMN IF NOT EXISTS "vat_rate_bps" integer NOT NULL DEFAULT 0;
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "quantity_mode" text NOT NULL DEFAULT 'fixed';
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "vat_rate_bps" integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quantity_mode_check" CHECK ("quantity_mode" IN ('fixed','open'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "workforce_contracts" ADD CONSTRAINT "workforce_contracts_quantity_mode_check" CHECK ("quantity_mode" IN ('fixed','open'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "workforce_contracts" ADD CONSTRAINT "workforce_contracts_quote_version_id_quote_versions_id_fk"
    FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "workforce_contracts_quote_version_unique" ON "workforce_contracts" ("quote_version_id") WHERE "quote_version_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "workforce_contracts_opportunity_idx" ON "workforce_contracts" ("opportunity_id");

ALTER TABLE "contract_professions" DROP CONSTRAINT IF EXISTS "contract_professions_required_count_check";
ALTER TABLE "contract_professions" ADD CONSTRAINT "contract_professions_required_count_check" CHECK ("required_count" >= 0);
ALTER TABLE "quote_items" DROP CONSTRAINT IF EXISTS "quote_items_quantity_check";
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quantity_check" CHECK ("quantity" >= 0);
