ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "mfa_secret_encrypted" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "mfa_enabled_at" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "mfa_recovery_hashes_json" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "mfa_recovery_generated_at" text;
ALTER TABLE "portal_auth_credentials" ADD COLUMN IF NOT EXISTS "mfa_last_verified_at" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_mfa_challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "identifier" text NOT NULL,
  "purpose" text NOT NULL,
  "pending_secret_encrypted" text,
  "pending_recovery_hashes_json" text,
  "pending_recovery_codes_encrypted" text,
  "return_to" text DEFAULT '/portal' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" text NOT NULL,
  "used_at" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "portal_mfa_challenges_identifier_portal_auth_credentials_identifier_fk" FOREIGN KEY ("identifier") REFERENCES "public"."portal_auth_credentials"("identifier") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "portal_mfa_challenges_purpose_check" CHECK ("purpose" in ('verify', 'enroll')),
  CONSTRAINT "portal_mfa_challenges_attempts_check" CHECK ("attempts" >= 0 and "attempts" <= 8)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_mfa_challenges_identifier_idx" ON "portal_mfa_challenges" USING btree ("identifier");
CREATE INDEX IF NOT EXISTS "portal_mfa_challenges_expires_idx" ON "portal_mfa_challenges" USING btree ("expires_at");
ALTER TABLE "portal_mfa_challenges" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "portal_mfa_challenges" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "portal_mfa_challenges" TO postgres;
INSERT INTO private.__dali_migrations (name) VALUES ('0007_portal_mfa.sql') ON CONFLICT (name) DO NOTHING;
