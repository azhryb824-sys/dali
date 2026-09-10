-- Additive integrity hardening for worker assignments, absences, and contract invoices.
-- Existing operational, financial, and document records remain intact.

DO $$ BEGIN
  ALTER TABLE public.contract_professions
    ADD CONSTRAINT contract_professions_contract_fk
    FOREIGN KEY (contract_id) REFERENCES public.workforce_contracts(id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.contract_worker_assignments
    ADD CONSTRAINT contract_worker_assignments_contract_fk
    FOREIGN KEY (contract_id) REFERENCES public.workforce_contracts(id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Preserve every completed assignment period while preventing two current links
-- for the same worker and contract.
DROP INDEX IF EXISTS public.contract_worker_assignments_contract_worker_unique;
CREATE UNIQUE INDEX contract_worker_assignments_contract_worker_unique
  ON public.contract_worker_assignments (contract_id, worker_id)
  WHERE status IN ('planned','active');

DO $$ BEGIN
  ALTER TABLE public.contract_worker_assignments
    ADD CONSTRAINT contract_worker_assignments_profession_fk
    FOREIGN KEY (contract_profession_id) REFERENCES public.contract_professions(id) ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.contract_worker_assignments
    ADD CONSTRAINT contract_worker_assignments_worker_fk
    FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.contract_worker_assignments
    ADD CONSTRAINT contract_worker_assignments_status_check
    CHECK (status IN ('planned','active','released')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.contract_worker_absences
    ADD CONSTRAINT contract_worker_absences_replacement_worker_fk
    FOREIGN KEY (replacement_worker_id) REFERENCES public.workers(id) ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Absences recorded before client pricing was separated used the worker daily
-- rate directly in the payment deduction. Preserve that issued-history amount
-- while making the legacy rows internally reconcilable under the new checks.
UPDATE public.contract_worker_absences
SET client_daily_rate_halalas = daily_rate_halalas,
    client_deduction_halalas = deduction_halalas,
    updated_at = CURRENT_TIMESTAMP::text
WHERE replacement_worker_id IS NULL
  AND client_daily_rate_halalas = 0
  AND client_deduction_halalas = 0
  AND daily_rate_halalas > 0
  AND deduction_halalas > 0;

DO $$ BEGIN
  ALTER TABLE public.contract_worker_absences
    ADD CONSTRAINT contract_worker_absences_client_deduction_check
    CHECK (
      client_daily_rate_halalas >= 0
      AND client_deduction_halalas = CASE
        WHEN replacement_worker_id IS NULL THEN client_daily_rate_halalas * absent_count
        ELSE 0
      END
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.financial_records financial
SET contract_payment_schedule_id = payment.id,
    updated_at = CURRENT_TIMESTAMP::text
FROM public.contract_payment_schedules payment
WHERE payment.financial_record_id = financial.id
  AND financial.contract_payment_schedule_id IS NULL;

DO $$ BEGIN
  ALTER TABLE public.financial_records
    ADD CONSTRAINT financial_records_contract_payment_fk
    FOREIGN KEY (contract_payment_schedule_id)
    REFERENCES public.contract_payment_schedules(id) ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.workers worker
SET client_id = contract.client_id,
    assignment_start_date = substring(assignment.assigned_at from 1 for 10),
    updated_at = CURRENT_TIMESTAMP::text
FROM public.contract_worker_assignments assignment
JOIN public.workforce_contracts contract ON contract.id = assignment.contract_id
WHERE assignment.worker_id = worker.id
  AND assignment.status = 'active'
  AND worker.status = 'assigned'
  AND worker.archived_at IS NULL
  AND worker.beneficiary_name IS NOT DISTINCT FROM contract.client_name
  AND worker.client_site IS NOT DISTINCT FROM contract.work_site
  AND (worker.client_id IS DISTINCT FROM contract.client_id
    OR worker.assignment_start_date IS DISTINCT FROM substring(assignment.assigned_at from 1 for 10));

CREATE OR REPLACE FUNCTION public.contract_assignment_active_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  profession_contract_id integer;
  profession_capacity integer;
  profession_name text;
  profession_sponsorship_type text;
  profession_sponsor_name text;
  worker_profession text;
  worker_status text;
  worker_archived_at text;
  worker_sponsorship_type text;
  worker_sponsor_name text;
  worker_beneficiary_name text;
  worker_client_site text;
  worker_client_id integer;
  contract_status text;
  contract_client_name text;
  contract_work_site text;
  contract_client_id integer;
BEGIN
  IF NEW.status NOT IN ('planned','active','released') THEN
    RAISE EXCEPTION 'INVALID_ASSIGNMENT_STATUS' USING ERRCODE = '23514';
  END IF;

  SELECT contract_id, required_count, profession, sponsorship_type, sponsor_name
  INTO profession_contract_id, profession_capacity, profession_name,
    profession_sponsorship_type, profession_sponsor_name
  FROM public.contract_professions
  WHERE id = NEW.contract_profession_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_PROFESSION_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF profession_contract_id <> NEW.contract_id THEN
    RAISE EXCEPTION 'PROFESSION_CONTRACT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT profession, status, archived_at, sponsorship_type, sponsor_name,
    beneficiary_name, client_site, client_id
  INTO worker_profession, worker_status, worker_archived_at,
    worker_sponsorship_type, worker_sponsor_name, worker_beneficiary_name,
    worker_client_site, worker_client_id
  FROM public.workers
  WHERE id = NEW.worker_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSIGNMENT_WORKER_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF NEW.status IN ('planned','active') THEN
    IF worker_archived_at IS NOT NULL
      OR worker_profession IS DISTINCT FROM profession_name
      OR (profession_sponsorship_type IS NOT NULL
        AND worker_sponsorship_type IS DISTINCT FROM profession_sponsorship_type)
      OR (profession_sponsorship_type = 'other' AND profession_sponsor_name IS NOT NULL
        AND worker_sponsor_name IS DISTINCT FROM profession_sponsor_name) THEN
      RAISE EXCEPTION 'ASSIGNMENT_WORKER_PROFILE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'planned' AND worker_status IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'PLANNED_WORKER_NOT_AVAILABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'active' THEN
    SELECT status, client_name, work_site, client_id
    INTO contract_status, contract_client_name, contract_work_site, contract_client_id
    FROM public.workforce_contracts
    WHERE id = NEW.contract_id;
    IF NOT FOUND OR contract_status NOT IN ('active','suspended') THEN
      RAISE EXCEPTION 'ASSIGNMENT_CONTRACT_NOT_ACTIVE' USING ERRCODE = '23514';
    END IF;
    IF worker_status IS DISTINCT FROM 'assigned'
      OR worker_archived_at IS NOT NULL
      OR worker_beneficiary_name IS DISTINCT FROM contract_client_name
      OR worker_client_site IS DISTINCT FROM contract_work_site
      OR worker_client_id IS DISTINCT FROM contract_client_id THEN
      RAISE EXCEPTION 'ASSIGNMENT_WORKER_STATE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.contract_worker_absences absence
      WHERE absence.replacement_worker_id = NEW.worker_id
        AND absence.status = 'active'
        AND absence.absence_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date::text
        AND COALESCE(absence.absence_end_date, absence.absence_date)
          >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date::text
    ) THEN
      RAISE EXCEPTION 'WORKER_COVERING_ABSENCE' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.contract_worker_assignments
      WHERE worker_id = NEW.worker_id
        AND status = 'active'
        AND id <> COALESCE(NEW.id, 0)
    ) THEN
      RAISE EXCEPTION 'WORKER_ALREADY_ASSIGNED' USING ERRCODE = '23505';
    END IF;
    IF (
      SELECT count(*) FROM public.contract_worker_assignments
      WHERE contract_profession_id = NEW.contract_profession_id
        AND status = 'active'
        AND id <> COALESCE(NEW.id, 0)
    ) >= profession_capacity THEN
      RAISE EXCEPTION 'CONTRACT_PROFESSION_CAPACITY_REACHED' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER contract_assignment_active_guard_trigger
BEFORE INSERT OR UPDATE OF status, contract_id, worker_id, contract_profession_id
ON public.contract_worker_assignments
FOR EACH ROW EXECUTE FUNCTION public.contract_assignment_active_guard();

REVOKE ALL ON FUNCTION public.contract_assignment_active_guard() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.contract_worker_absence_integrity_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  payment_contract_id integer;
  payment_period text;
  payment_basis text;
  profession_contract_id integer;
  profession_name text;
  replacement_profession text;
  replacement_status text;
  replacement_archived_at text;
  replacement_sponsorship_type text;
  replacement_sponsor_name text;
  profession_sponsorship_type text;
  profession_sponsor_name text;
BEGIN
  IF NEW.absence_date !~ '^\d{4}-\d{2}-\d{2}$'
    OR NEW.absence_date::date::text IS DISTINCT FROM NEW.absence_date
    OR COALESCE(NEW.absence_end_date, NEW.absence_date) !~ '^\d{4}-\d{2}-\d{2}$'
    OR COALESCE(NEW.absence_end_date, NEW.absence_date)::date::text
      IS DISTINCT FROM COALESCE(NEW.absence_end_date, NEW.absence_date)
    OR COALESCE(NEW.absence_end_date, NEW.absence_date) < NEW.absence_date
    OR substring(COALESCE(NEW.absence_end_date, NEW.absence_date) from 1 for 7)
      IS DISTINCT FROM substring(NEW.absence_date from 1 for 7) THEN
    RAISE EXCEPTION 'INVALID_ABSENCE_PERIOD' USING ERRCODE = '22007';
  END IF;

  PERFORM id FROM public.workers
  WHERE id IN (NEW.worker_id, NEW.replacement_worker_id)
  ORDER BY id
  FOR UPDATE;

  SELECT contract_id, service_period, billing_basis
  INTO payment_contract_id, payment_period, payment_basis
  FROM public.contract_payment_schedules
  WHERE id = NEW.payment_schedule_id;

  IF NOT FOUND
    OR payment_contract_id IS DISTINCT FROM NEW.contract_id
    OR payment_basis IS DISTINCT FROM 'monthly_salary'
    OR payment_period IS DISTINCT FROM substring(NEW.absence_date from 1 for 7) THEN
    RAISE EXCEPTION 'ABSENCE_PAYMENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT contract_id, profession, sponsorship_type, sponsor_name
  INTO profession_contract_id, profession_name,
    profession_sponsorship_type, profession_sponsor_name
  FROM public.contract_professions
  WHERE id = NEW.contract_profession_id;

  IF NOT FOUND
    OR profession_contract_id IS DISTINCT FROM NEW.contract_id
    OR profession_name IS DISTINCT FROM NEW.profession THEN
    RAISE EXCEPTION 'ABSENCE_PROFESSION_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NEW.worker_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contract_worker_assignments assignment
    WHERE assignment.contract_id = NEW.contract_id
      AND assignment.contract_profession_id = NEW.contract_profession_id
      AND assignment.worker_id = NEW.worker_id
      AND assignment.status IN ('active','released')
      AND substring(assignment.assigned_at from 1 for 10) <= NEW.absence_date
      AND (assignment.released_at IS NULL
        OR substring(assignment.released_at from 1 for 10)
          >= COALESCE(NEW.absence_end_date, NEW.absence_date))
  ) THEN
    RAISE EXCEPTION 'ABSENCE_WORKER_ASSIGNMENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NEW.replacement_worker_id IS NOT NULL AND NEW.replacement_worker_id = NEW.worker_id THEN
    RAISE EXCEPTION 'ABSENCE_REPLACEMENT_MATCHES_WORKER' USING ERRCODE = '23514';
  END IF;
  IF NEW.replacement_worker_id IS NOT NULL THEN
    SELECT profession, status, archived_at, sponsorship_type, sponsor_name
    INTO replacement_profession, replacement_status, replacement_archived_at,
      replacement_sponsorship_type, replacement_sponsor_name
    FROM public.workers
    WHERE id = NEW.replacement_worker_id;
    IF NOT FOUND
      OR replacement_status NOT IN ('available','assigned')
      OR (replacement_archived_at IS NOT NULL
        AND substring(replacement_archived_at from 1 for 10)
          <= COALESCE(NEW.absence_end_date, NEW.absence_date))
      OR replacement_profession IS DISTINCT FROM profession_name
      OR replacement_sponsorship_type IS DISTINCT FROM profession_sponsorship_type
      OR (profession_sponsorship_type = 'other' AND profession_sponsor_name IS NOT NULL
        AND replacement_sponsor_name IS DISTINCT FROM profession_sponsor_name) THEN
      RAISE EXCEPTION 'ABSENCE_REPLACEMENT_NOT_AVAILABLE' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.contract_worker_assignments assignment
      WHERE assignment.worker_id = NEW.replacement_worker_id
        AND substring(assignment.assigned_at from 1 for 10)
          <= COALESCE(NEW.absence_end_date, NEW.absence_date)
        AND (assignment.released_at IS NULL
          OR substring(assignment.released_at from 1 for 10) >= NEW.absence_date)
    ) THEN
      RAISE EXCEPTION 'ABSENCE_REPLACEMENT_ASSIGNMENT_OVERLAP' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.contract_worker_absences absence
      WHERE absence.replacement_worker_id = NEW.replacement_worker_id
        AND absence.status = 'active'
        AND absence.id <> COALESCE(NEW.id, 0)
        AND absence.absence_date <= COALESCE(NEW.absence_end_date, NEW.absence_date)
        AND COALESCE(absence.absence_end_date, absence.absence_date) >= NEW.absence_date
    ) THEN
      RAISE EXCEPTION 'ABSENCE_REPLACEMENT_OVERLAP' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER contract_worker_absence_integrity_guard_trigger
BEFORE INSERT OR UPDATE OF contract_id, payment_schedule_id, worker_id,
  replacement_worker_id, contract_profession_id, profession, absence_date
ON public.contract_worker_absences
FOR EACH ROW EXECUTE FUNCTION public.contract_worker_absence_integrity_guard();

REVOKE ALL ON FUNCTION public.contract_worker_absence_integrity_guard() FROM PUBLIC;
