CREATE TABLE IF NOT EXISTS private.object_storage (
  storage_key text PRIMARY KEY,
  object_data bytea NOT NULL,
  content_type text,
  etag text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS object_storage_updated_at_idx
  ON private.object_storage (updated_at DESC);

REVOKE ALL ON TABLE private.object_storage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.object_storage TO postgres;

INSERT INTO private.__dali_migrations (name)
VALUES ('0006_durable_company_assets')
ON CONFLICT (name) DO NOTHING;
