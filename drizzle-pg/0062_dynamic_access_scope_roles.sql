-- Repair new-user role assignment after portal roles became database-defined.
-- The original access-scope table used a fixed CHECK list, which rejects newer
-- active roles such as accountant, lawyer, secretary, and workforce supervisor.

ALTER TABLE public.portal_access_scopes
  DROP CONSTRAINT IF EXISTS "portal_access_scopes_role_check";

DO $$
DECLARE
  missing_roles text;
BEGIN
  SELECT string_agg(role_key, ', ' ORDER BY role_key)
  INTO missing_roles
  FROM (
    SELECT DISTINCT scope.functional_role AS role_key
    FROM public.portal_access_scopes scope
    LEFT JOIN public.portal_roles role
      ON role.role_key = scope.functional_role
    WHERE role.role_key IS NULL
  ) unresolved;

  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot link portal access scopes to undefined roles: %', missing_roles;
  END IF;
END $$;

ALTER TABLE public.portal_access_scopes
  DROP CONSTRAINT IF EXISTS "portal_access_scopes_functional_role_fk";

ALTER TABLE public.portal_access_scopes
  ADD CONSTRAINT "portal_access_scopes_functional_role_fk"
  FOREIGN KEY ("functional_role") REFERENCES public.portal_roles ("role_key")
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.portal_access_scopes
  VALIDATE CONSTRAINT "portal_access_scopes_functional_role_fk";

INSERT INTO private.__dali_migrations (name)
VALUES ('0062_dynamic_access_scope_roles.sql')
ON CONFLICT (name) DO NOTHING;
