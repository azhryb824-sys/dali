-- Legal supervision hierarchy and immutable action attribution.
-- Additive only: no users, roles, cases, activities, attachments, or permissions are deleted.

ALTER TABLE public.legal_records
  ADD COLUMN IF NOT EXISTS assigned_lawyer_email text;
ALTER TABLE public.legal_records
  ADD COLUMN IF NOT EXISTS assigned_by text;
ALTER TABLE public.legal_records
  ADD COLUMN IF NOT EXISTS assigned_at text;

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

INSERT INTO public.chart_of_accounts
  (code, name_ar, account_type, normal_balance, is_posting, is_system, status)
VALUES
  ('5290','مصروفات وأحكام قانونية','expense','debit',true,true,'active')
ON CONFLICT (code) DO UPDATE SET
  name_ar=EXCLUDED.name_ar,
  account_type='expense',
  normal_balance='debit',
  is_posting=true,
  status='active',
  updated_at=CURRENT_TIMESTAMP::text;

CREATE TABLE IF NOT EXISTS public.legal_judgment_payment_requests (
  id serial PRIMARY KEY,
  legal_record_id integer NOT NULL REFERENCES public.legal_records(id) ON DELETE RESTRICT,
  amount_halalas integer NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  requested_by text NOT NULL,
  requested_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  bank_account_id integer REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  journal_entry_id integer REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  paid_by text,
  paid_at text,
  rejection_reason text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT legal_judgment_payments_amount_check CHECK (amount_halalas > 0),
  CONSTRAINT legal_judgment_payments_status_check CHECK (status IN ('requested','paid','rejected','cancelled'))
);

CREATE INDEX IF NOT EXISTS legal_judgment_payments_record_idx
  ON public.legal_judgment_payment_requests(legal_record_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS legal_judgment_payments_journal_unique
  ON public.legal_judgment_payment_requests(journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

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
