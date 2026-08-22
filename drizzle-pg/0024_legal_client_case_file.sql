ALTER TABLE "legal_records" ADD COLUMN IF NOT EXISTS "client_id" integer;
ALTER TABLE "legal_records" ADD COLUMN IF NOT EXISTS "contract_id" integer;
ALTER TABLE "legal_records" ADD COLUMN IF NOT EXISTS "referral_reason" text;
ALTER TABLE "legal_records" ADD COLUMN IF NOT EXISTS "referred_by" text;
ALTER TABLE "legal_records" ADD COLUMN IF NOT EXISTS "referred_at" text;
ALTER TABLE "legal_records" ADD COLUMN IF NOT EXISTS "file_snapshot_json" text;
CREATE INDEX IF NOT EXISTS "legal_records_client_id_idx" ON "legal_records" USING btree ("client_id");
CREATE INDEX IF NOT EXISTS "legal_records_contract_id_idx" ON "legal_records" USING btree ("contract_id");
