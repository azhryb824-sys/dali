REVOKE ALL ON TABLE private.object_storage FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO dali_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.object_storage TO dali_app;

INSERT INTO private.__dali_migrations (name)
VALUES ('0015_durable_storage_runtime_access.sql')
ON CONFLICT (name) DO NOTHING;
