ALTER TABLE "workforce_requests" ADD COLUMN IF NOT EXISTS "activity_type" text;
ALTER TABLE "workforce_requests" ADD COLUMN IF NOT EXISTS "quantity_mode" text;
ALTER TABLE "workforce_requests" ADD COLUMN IF NOT EXISTS "client_cr" text;
ALTER TABLE "workforce_requests" ADD COLUMN IF NOT EXISTS "client_vat" text;
ALTER TABLE "workforce_requests" ADD COLUMN IF NOT EXISTS "client_address" text;
ALTER TABLE "workforce_requests" ADD COLUMN IF NOT EXISTS "representative_title" text;
ALTER TABLE "workforce_requests" ADD COLUMN IF NOT EXISTS "quotation_items_json" text;
ALTER TABLE "workforce_requests" ADD COLUMN IF NOT EXISTS "quotation_terms_json" text;

ALTER TABLE "workforce_requests" DROP CONSTRAINT IF EXISTS "workforce_requests_activity_type_check";
ALTER TABLE "workforce_requests" ADD CONSTRAINT "workforce_requests_activity_type_check" CHECK (
  "activity_type" IS NULL OR "activity_type" IN ('workforce','construction','maintenance','seasonal')
);
ALTER TABLE "workforce_requests" DROP CONSTRAINT IF EXISTS "workforce_requests_quantity_mode_check";
ALTER TABLE "workforce_requests" ADD CONSTRAINT "workforce_requests_quantity_mode_check" CHECK (
  "quantity_mode" IS NULL OR "quantity_mode" IN ('fixed','open')
);
CREATE INDEX IF NOT EXISTS "workforce_requests_activity_type_idx" ON "workforce_requests" ("activity_type", "created_at");
