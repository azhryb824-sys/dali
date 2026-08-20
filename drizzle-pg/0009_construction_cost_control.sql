CREATE TABLE IF NOT EXISTS "construction_cost_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "construction_projects"("id") ON DELETE cascade,
  "cost_code" text NOT NULL,
  "cost_title" text NOT NULL,
  "cost_category" text DEFAULT 'other' NOT NULL,
  "entry_type" text NOT NULL,
  "amount_halalas" integer DEFAULT 0 NOT NULL,
  "effective_date" text NOT NULL,
  "source_record_id" integer REFERENCES "construction_records"("id") ON DELETE restrict,
  "reference_code" text,
  "notes" text,
  "status" text DEFAULT 'approved' NOT NULL,
  "created_by" text NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "construction_cost_entries_type_check" CHECK ("entry_type" in ('baseline','commitment','actual','forecast_to_complete','approved_change','payment_certificate','retention')),
  CONSTRAINT "construction_cost_entries_category_check" CHECK ("cost_category" in ('labor','materials','equipment','subcontract','overhead','other')),
  CONSTRAINT "construction_cost_entries_status_check" CHECK ("status" in ('draft','approved','cancelled')),
  CONSTRAINT "construction_cost_entries_amount_check" CHECK ("amount_halalas" >= 0)
);
CREATE INDEX IF NOT EXISTS "construction_cost_entries_project_code_idx" ON "construction_cost_entries" ("project_id","cost_code");
CREATE INDEX IF NOT EXISTS "construction_cost_entries_project_type_idx" ON "construction_cost_entries" ("project_id","entry_type");
CREATE INDEX IF NOT EXISTS "construction_cost_entries_effective_date_idx" ON "construction_cost_entries" ("effective_date");
ALTER TABLE "construction_cost_entries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "construction_cost_entries" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "construction_cost_entries_id_seq" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "construction_cost_entries" TO postgres;
GRANT USAGE, SELECT ON SEQUENCE "construction_cost_entries_id_seq" TO postgres;
INSERT INTO private.__dali_migrations (name) VALUES ('0009_construction_cost_control.sql') ON CONFLICT (name) DO NOTHING;
