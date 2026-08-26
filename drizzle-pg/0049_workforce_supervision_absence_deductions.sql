-- Workforce supervision, site movement, and absence deductions.
-- Additive migration: no workers, contracts, assignments, payments, or financial records are deleted.

ALTER TABLE public.contract_payment_schedules
  ADD COLUMN IF NOT EXISTS absence_deduction_halalas integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.contract_payment_schedules
    ADD CONSTRAINT contract_payment_schedules_absence_deduction_check
    CHECK (absence_deduction_halalas >= 0 AND absence_deduction_halalas <= subtotal_halalas);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.contract_worker_absences (
  id serial PRIMARY KEY,
  contract_id integer NOT NULL REFERENCES public.workforce_contracts(id) ON DELETE CASCADE,
  payment_schedule_id integer NOT NULL REFERENCES public.contract_payment_schedules(id) ON DELETE RESTRICT,
  worker_id integer REFERENCES public.workers(id) ON DELETE RESTRICT,
  contract_profession_id integer NOT NULL REFERENCES public.contract_professions(id) ON DELETE RESTRICT,
  profession text NOT NULL,
  absence_date text NOT NULL,
  absent_count integer NOT NULL DEFAULT 1,
  daily_rate_halalas integer NOT NULL,
  deduction_halalas integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  notes text,
  dedupe_key text NOT NULL UNIQUE,
  recorded_by text NOT NULL,
  voided_by text,
  voided_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT contract_worker_absences_count_check CHECK (
    absent_count > 0 AND daily_rate_halalas > 0
    AND deduction_halalas = absent_count * daily_rate_halalas
  ),
  CONSTRAINT contract_worker_absences_status_check CHECK (status IN ('active','void'))
);

CREATE INDEX IF NOT EXISTS contract_worker_absences_contract_date_idx
  ON public.contract_worker_absences(contract_id, absence_date);
CREATE INDEX IF NOT EXISTS contract_worker_absences_payment_idx
  ON public.contract_worker_absences(payment_schedule_id);
CREATE INDEX IF NOT EXISTS contract_worker_absences_worker_idx
  ON public.contract_worker_absences(worker_id);

INSERT INTO public.portal_roles
  (role_key, label_ar, description, permissions_json, protected, active, created_by, updated_at)
VALUES (
  'workforce_supervisor',
  'مشرف العمالة',
  'نقل العمالة إلى مواقع العقود وإرجاع عامل أو مجموعة عمال دون صلاحية الاعتماد أو تسجيل الخصم المالي.',
  '["overview.read","workforce.read","workforce.write","contracts.read","contracts.write"]',
  false,true,'system',CURRENT_TIMESTAMP::text
)
ON CONFLICT (role_key) DO UPDATE SET
  label_ar=EXCLUDED.label_ar,
  description=EXCLUDED.description,
  permissions_json=EXCLUDED.permissions_json,
  active=true,
  updated_at=CURRENT_TIMESTAMP::text;

-- Make an existing official company stamp immediately selectable for contract approval.
INSERT INTO public.document_stamps
  (name, storage_key, file_name, content_type, size_bytes, active, created_by, created_at, updated_at)
SELECT
  'ختم الشركة المعتمد', asset.storage_key, asset.file_name, asset.content_type,
  asset.size_bytes, true, asset.uploaded_by, asset.updated_at, asset.updated_at
FROM public.company_assets asset
WHERE asset.slot = 'stamp'
  AND NOT EXISTS (
    SELECT 1 FROM public.document_stamps stamp
    WHERE stamp.storage_key = asset.storage_key
  );

INSERT INTO private.__dali_migrations (name)
VALUES ('0049_workforce_supervision_absence_deductions.sql')
ON CONFLICT (name) DO NOTHING;
