-- Credential login is server-only. Restore least-privilege access for the
-- dedicated runtime role when that role exists on the PostgreSQL server.

ALTER TABLE public.portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_auth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.portal_users, public.portal_auth_credentials, public.password_reset_tokens, public.public_rate_limits FROM PUBLIC;

DO $dali_login_server_access$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.portal_users, public.portal_auth_credentials, public.password_reset_tokens, public.public_rate_limits FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.portal_users, public.portal_auth_credentials, public.password_reset_tokens, public.public_rate_limits FROM authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dali_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_users, public.portal_auth_credentials, public.password_reset_tokens, public.public_rate_limits TO dali_app';

    EXECUTE 'DROP POLICY IF EXISTS portal_users_server_access ON public.portal_users';
    EXECUTE 'DROP POLICY IF EXISTS portal_auth_credentials_server_access ON public.portal_auth_credentials';
    EXECUTE 'DROP POLICY IF EXISTS password_reset_tokens_server_access ON public.password_reset_tokens';
    EXECUTE 'DROP POLICY IF EXISTS public_rate_limits_server_access ON public.public_rate_limits';

    EXECUTE 'CREATE POLICY portal_users_server_access ON public.portal_users AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY portal_auth_credentials_server_access ON public.portal_auth_credentials AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY password_reset_tokens_server_access ON public.password_reset_tokens AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY public_rate_limits_server_access ON public.public_rate_limits AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true)';
  END IF;
END
$dali_login_server_access$;
