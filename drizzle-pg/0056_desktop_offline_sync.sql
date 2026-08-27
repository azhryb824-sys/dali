-- Desktop offline devices and server-side idempotent synchronization.
-- Additive only: no operational or financial records are modified.

CREATE TABLE IF NOT EXISTS public.desktop_devices (
  id text PRIMARY KEY,
  user_email text NOT NULL,
  device_name text,
  platform text NOT NULL DEFAULT 'windows',
  status text NOT NULL DEFAULT 'active',
  last_seen_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  last_sync_at text,
  last_activity_id integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT desktop_devices_status_check CHECK (status IN ('active','revoked'))
);

CREATE INDEX IF NOT EXISTS desktop_devices_user_status_idx
  ON public.desktop_devices(user_email, status);

CREATE TABLE IF NOT EXISTS public.desktop_sync_operations (
  id serial PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  device_id text NOT NULL REFERENCES public.desktop_devices(id) ON DELETE RESTRICT,
  user_email text NOT NULL,
  method text NOT NULL,
  request_path text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  response_status integer,
  response_headers_json text,
  response_body text,
  error_message text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  completed_at text,
  CONSTRAINT desktop_sync_operations_method_check CHECK (method IN ('POST','PATCH','DELETE')),
  CONSTRAINT desktop_sync_operations_status_check CHECK (status IN ('processing','completed','failed','conflict'))
);

CREATE INDEX IF NOT EXISTS desktop_sync_operations_device_idx
  ON public.desktop_sync_operations(device_id, created_at);
CREATE INDEX IF NOT EXISTS desktop_sync_operations_user_idx
  ON public.desktop_sync_operations(user_email, created_at);

INSERT INTO private.__dali_migrations (name)
VALUES ('0056_desktop_offline_sync.sql')
ON CONFLICT (name) DO NOTHING;
