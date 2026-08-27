-- Legal supervision hierarchy and immutable action attribution.
-- Additive only: no users, roles, cases, activities, attachments, or permissions are deleted.

CREATE TABLE IF NOT EXISTS public.legal_case_action_log (
  id serial PRIMARY KEY,
  legal_record_id integer NOT NULL REFERENCES public.legal_records(id) ON DELETE CASCADE,
  activity_id integer REFERENCES public.legal_case_activities(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  details text,
  actor_email text NOT NULL,
  actor_role text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT legal_case_action_log_action_check
    CHECK (action IN ('created','assigned','started','completed','cancelled','attachment_added'))
);

CREATE INDEX IF NOT EXISTS legal_case_action_log_record_idx
  ON public.legal_case_action_log(legal_record_id, created_at);
CREATE INDEX IF NOT EXISTS legal_case_action_log_activity_idx
  ON public.legal_case_action_log(activity_id);
CREATE INDEX IF NOT EXISTS legal_case_action_log_actor_idx
  ON public.legal_case_action_log(actor_email, created_at);

INSERT INTO public.portal_roles
  (role_key, label_ar, description, permissions_json, protected, active, created_by, updated_at)
VALUES
  ('legal_supervisor','محامي مشرف','الإشراف على الملفات القانونية وإسناد الإجراءات واعتمادها ومتابعة سجل المنفذين.','["overview.read","legal.read","legal.write","legal.approve","documents.read","documents.preview"]',false,true,'system',CURRENT_TIMESTAMP::text),
  ('legal_lawyer','محامي فرعي','تنفيذ الإجراءات القانونية المسندة إليه وتوثيق العمل دون صلاحية الإشراف أو الاعتماد.','["overview.read","legal.read","legal.write","documents.read","documents.preview"]',false,true,'system',CURRENT_TIMESTAMP::text)
ON CONFLICT (role_key) DO UPDATE SET
  label_ar = EXCLUDED.label_ar,
  description = EXCLUDED.description,
  permissions_json = EXCLUDED.permissions_json,
  active = true,
  updated_at = CURRENT_TIMESTAMP::text;

INSERT INTO private.__dali_migrations (name)
VALUES ('0054_legal_hierarchy_and_action_attribution.sql')
ON CONFLICT (name) DO NOTHING;
