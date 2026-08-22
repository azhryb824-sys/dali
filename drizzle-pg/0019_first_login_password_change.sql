ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "must_change_password" boolean NOT NULL DEFAULT false;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "password_changed_at" text;
CREATE INDEX IF NOT EXISTS "portal_auth_credentials_must_change_idx" ON "portal_auth_credentials" ("must_change_password") WHERE "must_change_password" = true;
