CREATE TABLE IF NOT EXISTS "sales_representatives" (
  "id" serial PRIMARY KEY NOT NULL,
  "representative_code" text NOT NULL UNIQUE,
  "full_name" text NOT NULL,
  "mobile" text NOT NULL,
  "email" text,
  "national_id" text UNIQUE,
  "region" text DEFAULT 'مكة المكرمة' NOT NULL,
  "commission_bps" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by" text NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "sales_representatives_commission_check" CHECK ("commission_bps" BETWEEN 0 AND 10000),
  CONSTRAINT "sales_representatives_status_check" CHECK ("status" IN ('active','inactive','suspended'))
);
ALTER TABLE "sales_representatives" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dali_backend_access" ON "sales_representatives";
CREATE POLICY "dali_backend_access" ON "sales_representatives" FOR ALL TO dali_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "sales_representatives" TO dali_app;
GRANT USAGE, SELECT ON SEQUENCE "sales_representatives_id_seq" TO dali_app;
REVOKE ALL ON TABLE "sales_representatives" FROM PUBLIC, anon, authenticated;

ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "source_request_id" integer REFERENCES "workforce_requests"("id") ON DELETE SET NULL;
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "sales_representative_id" integer REFERENCES "sales_representatives"("id") ON DELETE SET NULL;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "source_request_id" integer REFERENCES "workforce_requests"("id") ON DELETE SET NULL;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "sales_representative_id" integer REFERENCES "sales_representatives"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "workforce_contracts_source_request_idx" ON "workforce_contracts"("source_request_id");
CREATE INDEX IF NOT EXISTS "workforce_contracts_sales_representative_idx" ON "workforce_contracts"("sales_representative_id");
CREATE INDEX IF NOT EXISTS "clients_source_request_idx" ON "clients"("source_request_id");
CREATE INDEX IF NOT EXISTS "clients_sales_representative_idx" ON "clients"("sales_representative_id");
