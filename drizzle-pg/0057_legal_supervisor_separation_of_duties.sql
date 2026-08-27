-- Align legal supervisor with canonical separation-of-duties policy.
-- Supervision and assignment remain available; protected approval stays owner/admin only.

UPDATE public.portal_roles
SET permissions_json = COALESCE((
  SELECT jsonb_agg(permission ORDER BY permission)::text
  FROM jsonb_array_elements_text(permissions_json::jsonb) AS item(permission)
  WHERE permission <> 'legal.approve'
), '[]'),
updated_at = CURRENT_TIMESTAMP::text
WHERE role_key = 'legal_supervisor';

INSERT INTO private.__dali_migrations (name)
VALUES ('0057_legal_supervisor_separation_of_duties.sql')
ON CONFLICT (name) DO NOTHING;
