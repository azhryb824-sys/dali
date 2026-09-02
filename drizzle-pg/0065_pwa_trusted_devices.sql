-- Trusted PWA device enrollment for iPhone and iPad.
-- Additive only: browser access remains denied unless a short-lived device proof is valid.

CREATE TABLE IF NOT EXISTS public.pwa_devices (
  id text PRIMARY KEY,
  device_name text NOT NULL,
  platform text NOT NULL DEFAULT 'ios-pwa',
  public_key_jwk text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  enrolled_by text NOT NULL REFERENCES public.portal_users(email) ON DELETE RESTRICT,
  enrolled_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  last_seen_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  last_source_hash text,
  revoked_at text,
  revoked_by text REFERENCES public.portal_users(email) ON DELETE SET NULL,
  revocation_reason text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT pwa_devices_status_check CHECK (status IN ('active','revoked')),
  CONSTRAINT pwa_devices_platform_check CHECK (platform IN ('ios-pwa','ipad-pwa'))
);

CREATE INDEX IF NOT EXISTS pwa_devices_status_last_seen_idx
  ON public.pwa_devices(status, last_seen_at);
CREATE INDEX IF NOT EXISTS pwa_devices_enrolled_by_idx
  ON public.pwa_devices(enrolled_by, status);

CREATE TABLE IF NOT EXISTS public.pwa_enrollment_tokens (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  device_name text NOT NULL,
  issued_by text NOT NULL REFERENCES public.portal_users(email) ON DELETE RESTRICT,
  expires_at text NOT NULL,
  consumed_at text,
  consumed_device_id text,
  revoked_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE INDEX IF NOT EXISTS pwa_enrollment_tokens_expiry_idx
  ON public.pwa_enrollment_tokens(expires_at);
CREATE INDEX IF NOT EXISTS pwa_enrollment_tokens_issuer_idx
  ON public.pwa_enrollment_tokens(issued_by, created_at);

CREATE TABLE IF NOT EXISTS public.pwa_device_challenges (
  id text PRIMARY KEY,
  device_id text NOT NULL REFERENCES public.pwa_devices(id) ON DELETE CASCADE,
  nonce text NOT NULL,
  expires_at text NOT NULL,
  used_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE INDEX IF NOT EXISTS pwa_device_challenges_device_expiry_idx
  ON public.pwa_device_challenges(device_id, expires_at);

INSERT INTO private.__dali_migrations (name)
VALUES ('0065_pwa_trusted_devices.sql')
ON CONFLICT (name) DO NOTHING;
