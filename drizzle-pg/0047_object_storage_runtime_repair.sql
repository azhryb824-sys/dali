CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.object_storage (
  storage_key text PRIMARY KEY,
  object_data bytea NOT NULL,
  content_type text,
  etag text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS object_storage_updated_at_idx
  ON private.object_storage (updated_at DESC);

REVOKE ALL ON TABLE private.object_storage FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE private.object_storage FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE private.object_storage FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dali_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA private TO dali_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.object_storage TO dali_app';
  END IF;
END
$$;
