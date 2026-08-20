CREATE TABLE IF NOT EXISTS "construction_record_attachments" (
  "id" serial PRIMARY KEY NOT NULL,
  "record_id" integer NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "transmittal_code" text NOT NULL,
  "title" text NOT NULL,
  "file_name" text NOT NULL,
  "storage_key" text NOT NULL UNIQUE,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "reviewer_email" text,
  "review_notes" text,
  "rejection_reason" text,
  "submitted_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "reviewed_at" text,
  "approved_at" text,
  "is_current" boolean DEFAULT true NOT NULL,
  "created_by" text NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "construction_record_attachments_record_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."construction_records"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "construction_record_attachments_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "construction_record_attachments_size_check" CHECK ("size_bytes" > 0 and "size_bytes" <= 20971520),
  CONSTRAINT "construction_record_attachments_status_check" CHECK ("status" in ('submitted','under_review','approved','approved_as_noted','revise_resubmit','rejected','superseded'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "construction_record_attachments_record_idx" ON "construction_record_attachments" USING btree ("record_id","revision");
CREATE UNIQUE INDEX IF NOT EXISTS "construction_record_attachments_revision_unique" ON "construction_record_attachments" USING btree ("record_id","revision");
CREATE INDEX IF NOT EXISTS "construction_record_attachments_transmittal_idx" ON "construction_record_attachments" USING btree ("transmittal_code");
ALTER TABLE "construction_record_attachments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "construction_record_attachments" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "construction_record_attachments_id_seq" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "construction_record_attachments" TO postgres;
GRANT USAGE, SELECT ON SEQUENCE "construction_record_attachments_id_seq" TO postgres;
INSERT INTO private.__dali_migrations (name) VALUES ('0008_construction_engineering_files.sql') ON CONFLICT (name) DO NOTHING;
