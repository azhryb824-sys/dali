REVOKE ALL ON TABLE public.portal_mfa_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_mfa_challenges TO dali_app;

DROP POLICY IF EXISTS portal_mfa_challenges_server_access ON public.portal_mfa_challenges;
CREATE POLICY portal_mfa_challenges_server_access
ON public.portal_mfa_challenges
AS PERMISSIVE
FOR ALL
TO dali_app
USING (true)
WITH CHECK (true);

INSERT INTO private.__dali_migrations (name)
VALUES ('0012_portal_mfa_server_role_policy.sql')
ON CONFLICT (name) DO NOTHING;
