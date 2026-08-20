CREATE TABLE IF NOT EXISTS "workforce_request_attachments" (
  "id" serial PRIMARY KEY NOT NULL,
  "request_id" integer NOT NULL REFERENCES "workforce_requests"("id") ON DELETE cascade,
  "file_name" text NOT NULL,
  "storage_key" text NOT NULL UNIQUE,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "workforce_request_attachments_size_check" CHECK ("size_bytes" > 0 and "size_bytes" <= 10485760)
);
CREATE INDEX IF NOT EXISTS "workforce_request_attachments_request_idx" ON "workforce_request_attachments" ("request_id");
ALTER TABLE "workforce_request_attachments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "workforce_request_attachments" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "workforce_request_attachments_id_seq" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workforce_request_attachments" TO postgres;
GRANT USAGE, SELECT ON SEQUENCE "workforce_request_attachments_id_seq" TO postgres;
INSERT INTO private.__dali_migrations (name) VALUES ('0010_public_quote_attachments.sql') ON CONFLICT (name) DO NOTHING;
