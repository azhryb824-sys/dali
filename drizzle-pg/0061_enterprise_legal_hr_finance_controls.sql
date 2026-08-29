CREATE TABLE IF NOT EXISTS public.company_holidays (
  id serial PRIMARY KEY,
  holiday_date text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  paid boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.employee_leave_policies (
  leave_type text PRIMARY KEY,
  label_ar text NOT NULL,
  deducts_annual_balance boolean NOT NULL DEFAULT false,
  paid_percentage_bps integer NOT NULL DEFAULT 10000,
  requires_attachment boolean NOT NULL DEFAULT false,
  max_days_per_request integer,
  updated_by text NOT NULL,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT employee_leave_policy_percentage_check CHECK (paid_percentage_bps BETWEEN 0 AND 10000)
);

INSERT INTO public.employee_leave_policies
  (leave_type,label_ar,deducts_annual_balance,paid_percentage_bps,requires_attachment,updated_by)
VALUES
  ('annual','سنوية',true,10000,false,'system'),
  ('sick','مرضية',false,10000,true,'system'),
  ('unpaid','بدون راتب',false,0,false,'system'),
  ('emergency','اضطرارية',false,10000,false,'system')
ON CONFLICT (leave_type) DO NOTHING;

ALTER TABLE public.employee_leave_requests
  ADD COLUMN IF NOT EXISTS balance_days_deducted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_percentage_bps integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancelled_at text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS bank_account_id integer REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payroll_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS snapshot_json text;
ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_period_month_unique;
DROP INDEX IF EXISTS public.payroll_runs_period_month_unique;
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_period_type_unique ON public.payroll_runs(period_month,payroll_type);

ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS employee_number_snapshot text,
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text,
  ADD COLUMN IF NOT EXISTS bank_name_snapshot text,
  ADD COLUMN IF NOT EXISTS iban_snapshot text,
  ADD COLUMN IF NOT EXISTS gosi_employee_halalas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gosi_employer_halalas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_leave_deduction_halalas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prorated_days integer,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS paid_amount_halalas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_payment_amount_halalas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_journal_id integer REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payment_failure_reason text,
  ADD COLUMN IF NOT EXISTS payment_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at text,
  ADD COLUMN IF NOT EXISTS excluded_at text,
  ADD COLUMN IF NOT EXISTS excluded_by text;

CREATE TABLE IF NOT EXISTS public.employee_termination_requests (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  requested_last_day text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  service_award_halalas integer NOT NULL DEFAULT 0,
  leave_compensation_halalas integer NOT NULL DEFAULT 0,
  salary_due_halalas integer NOT NULL DEFAULT 0,
  deductions_halalas integer NOT NULL DEFAULT 0,
  net_settlement_halalas integer NOT NULL DEFAULT 0,
  clearance_json text NOT NULL DEFAULT '{}',
  journal_entry_id integer REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  requested_by text NOT NULL,
  approved_by text,
  approved_at text,
  completed_by text,
  completed_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT employee_termination_status_check CHECK (status IN ('draft','pending_approval','approved','clearance','completed','rejected','cancelled'))
);

CREATE TABLE IF NOT EXISTS public.employee_profile_changes (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  change_type text NOT NULL,
  effective_date text NOT NULL,
  before_json text NOT NULL,
  after_json text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_by text NOT NULL,
  approved_by text,
  approved_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT employee_profile_change_status_check CHECK (status IN ('pending','approved','rejected','cancelled'))
);

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_manager_fk;
UPDATE public.employees AS employee
SET manager_id = NULL
WHERE manager_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.employees AS manager WHERE manager.id = employee.manager_id);
ALTER TABLE public.employees
  ADD CONSTRAINT employees_manager_fk FOREIGN KEY (manager_id) REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.legal_records
  ADD COLUMN IF NOT EXISTS court_case_number text,
  ADD COLUMN IF NOT EXISTS court_name text,
  ADD COLUMN IF NOT EXISTS circuit_name text,
  ADD COLUMN IF NOT EXISTS claim_type text,
  ADD COLUMN IF NOT EXISTS company_capacity text,
  ADD COLUMN IF NOT EXISTS current_hearing_number text,
  ADD COLUMN IF NOT EXISTS claim_amount_halalas integer,
  ADD COLUMN IF NOT EXISTS judgment_amount_halalas integer,
  ADD COLUMN IF NOT EXISTS enforcement_instrument_number text,
  ADD COLUMN IF NOT EXISTS opposing_counsel text,
  ADD COLUMN IF NOT EXISTS litigation_stage text,
  ADD COLUMN IF NOT EXISTS litigation_level text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS closed_by text,
  ADD COLUMN IF NOT EXISTS closed_at text,
  ADD COLUMN IF NOT EXISTS closure_reason text;

CREATE TABLE IF NOT EXISTS public.legal_hearings (
  id serial PRIMARY KEY,
  legal_record_id integer NOT NULL REFERENCES public.legal_records(id) ON DELETE CASCADE,
  hearing_number text NOT NULL,
  scheduled_at text NOT NULL,
  court_name text,
  circuit_name text,
  attendees_json text NOT NULL DEFAULT '[]',
  requests_json text NOT NULL DEFAULT '[]',
  decision_text text,
  next_hearing_at text,
  status text NOT NULL DEFAULT 'scheduled',
  created_by text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT legal_hearing_status_check CHECK (status IN ('scheduled','held','postponed','cancelled'))
);

ALTER TABLE public.legal_case_attachments
  ADD COLUMN IF NOT EXISTS document_category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at text;

CREATE TABLE IF NOT EXISTS public.legal_evidence_custody (
  id serial PRIMARY KEY,
  legal_record_id integer NOT NULL REFERENCES public.legal_records(id) ON DELETE CASCADE,
  attachment_id integer NOT NULL REFERENCES public.legal_case_attachments(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_email text NOT NULL,
  file_sha256 text,
  details text,
  occurred_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.legal_submissions (
  id serial PRIMARY KEY,
  legal_record_id integer NOT NULL REFERENCES public.legal_records(id) ON DELETE CASCADE,
  submission_type text NOT NULL,
  title text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  content text,
  attachment_id integer REFERENCES public.legal_case_attachments(id) ON DELETE SET NULL,
  parent_id integer REFERENCES public.legal_submissions(id) ON DELETE SET NULL,
  created_by text NOT NULL,
  reviewed_by text,
  approved_by text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT legal_submission_status_check CHECK (status IN ('draft','review','approved','issued','superseded'))
);

CREATE TABLE IF NOT EXISTS public.legal_settlements (
  id serial PRIMARY KEY,
  legal_record_id integer NOT NULL REFERENCES public.legal_records(id) ON DELETE RESTRICT,
  amount_halalas integer NOT NULL,
  concessions text,
  payment_schedule_json text NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft',
  agreement_attachment_id integer REFERENCES public.legal_case_attachments(id) ON DELETE SET NULL,
  financial_record_id integer REFERENCES public.financial_records(id) ON DELETE RESTRICT,
  requested_by text NOT NULL,
  approved_by text,
  approved_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT legal_settlement_status_check CHECK (status IN ('draft','pending_approval','approved','active','completed','rejected','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS legal_judgment_open_request_unique
  ON public.legal_judgment_payment_requests(legal_record_id, description)
  WHERE status IN ('requested','changes_requested');
ALTER TABLE public.legal_judgment_payment_requests
  ADD COLUMN IF NOT EXISTS response_reason text;
ALTER TABLE public.legal_judgment_payment_requests DROP CONSTRAINT IF EXISTS legal_judgment_payments_status_check;
ALTER TABLE public.legal_judgment_payment_requests ADD CONSTRAINT legal_judgment_payments_status_check
  CHECK (status IN ('requested','changes_requested','paid','rejected','cancelled'));

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id serial PRIMARY KEY,
  bank_account_id integer NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  statement_date text NOT NULL,
  transaction_date text NOT NULL,
  reference text,
  description text NOT NULL,
  amount_halalas integer NOT NULL,
  direction text NOT NULL,
  fingerprint text NOT NULL UNIQUE,
  match_status text NOT NULL DEFAULT 'unmatched',
  journal_entry_id integer REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  matched_by text,
  matched_at text,
  imported_by text NOT NULL,
  imported_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT bank_statement_direction_check CHECK (direction IN ('credit','debit')),
  CONSTRAINT bank_statement_match_status_check CHECK (match_status IN ('unmatched','suggested','matched','ignored'))
);

CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id serial PRIMARY KEY,
  asset_code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  acquisition_date text NOT NULL,
  cost_halalas integer NOT NULL,
  residual_value_halalas integer NOT NULL DEFAULT 0,
  useful_life_months integer NOT NULL,
  accumulated_depreciation_halalas integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  cost_center_code text,
  created_by text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.budget_lines (
  id serial PRIMARY KEY,
  fiscal_period_id integer NOT NULL REFERENCES public.fiscal_periods(id) ON DELETE RESTRICT,
  account_id integer NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  cost_center_code text,
  amount_halalas integer NOT NULL,
  created_by text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS public.tax_returns (
  id serial PRIMARY KEY,
  period_start text NOT NULL,
  period_end text NOT NULL,
  output_vat_halalas integer NOT NULL DEFAULT 0,
  input_vat_halalas integer NOT NULL DEFAULT 0,
  net_vat_halalas integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  journal_entry_id integer REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  created_by text NOT NULL,
  approved_by text,
  filed_at text,
  paid_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT tax_return_status_check CHECK (status IN ('draft','approved','filed','paid','refundable','closed'))
);

CREATE TABLE IF NOT EXISTS public.financial_operation_issues (
  id serial PRIMARY KEY,
  source_type text NOT NULL,
  source_id text NOT NULL,
  issue_type text NOT NULL,
  error_message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  retry_count integer NOT NULL DEFAULT 0,
  assigned_to text,
  resolved_by text,
  resolved_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT financial_operation_issue_status_check CHECK (status IN ('open','investigating','resolved','ignored'))
);

INSERT INTO private.__dali_migrations (name)
VALUES ('0061_enterprise_legal_hr_finance_controls.sql')
ON CONFLICT (name) DO NOTHING;
