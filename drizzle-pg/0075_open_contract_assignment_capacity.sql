-- Preserve worker/profile/duplicate guards; open contracts have no fixed capacity.
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
    ) >= profession_capacity AND (SELECT quantity_mode FROM public.workforce_contracts WHERE id = NEW.contract_id) <> 'open' THEN
      RAISE EXCEPTION 'CONTRACT_PROFESSION_CAPACITY_REACHED' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.contract_assignment_active_guard() FROM PUBLIC;
