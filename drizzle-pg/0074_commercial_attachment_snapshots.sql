-- Preserve existing request attachments and support immutable quotation attachment snapshots.
ALTER TABLE workforce_request_attachments ALTER COLUMN request_id DROP NOT NULL;
ALTER TABLE workforce_request_attachments ADD COLUMN IF NOT EXISTS quote_version_id integer REFERENCES quote_versions(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS workforce_request_attachments_quote_idx ON workforce_request_attachments(quote_version_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workforce_request_attachments_owner_check') THEN
    ALTER TABLE workforce_request_attachments ADD CONSTRAINT workforce_request_attachments_owner_check CHECK ((request_id IS NOT NULL AND quote_version_id IS NULL) OR (request_id IS NULL AND quote_version_id IS NOT NULL));
  END IF;
END $$;
