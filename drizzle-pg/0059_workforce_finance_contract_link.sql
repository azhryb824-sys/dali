ALTER TABLE public.contract_professions
ADD COLUMN IF NOT EXISTS actual_salary_halalas integer NOT NULL DEFAULT 0;

UPDATE public.contract_professions
SET actual_salary_halalas = unit_salary_halalas
WHERE actual_salary_halalas = 0;

ALTER TABLE public.financial_records
ADD COLUMN IF NOT EXISTS contract_payment_schedule_id integer;

CREATE INDEX IF NOT EXISTS financial_records_contract_payment_idx
ON public.financial_records (contract_payment_schedule_id);

ALTER TABLE public.contract_worker_absences
ADD COLUMN IF NOT EXISTS absence_end_date text;

ALTER TABLE public.contract_worker_absences
ADD COLUMN IF NOT EXISTS chargeable_days integer NOT NULL DEFAULT 1;

INSERT INTO private.__dali_migrations (name)
VALUES ('0059_workforce_finance_contract_link.sql')
ON CONFLICT (name) DO NOTHING;
