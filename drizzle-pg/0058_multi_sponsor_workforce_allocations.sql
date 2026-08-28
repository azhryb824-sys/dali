-- Allow one profession to be distributed across Dali and multiple worker sponsors.
-- Sponsor names remain sourced from worker profiles; no duplicate sponsor registry is introduced.

DROP INDEX IF EXISTS public.contract_professions_contract_profession_unique;

CREATE UNIQUE INDEX IF NOT EXISTS contract_professions_contract_sponsor_allocation_unique
ON public.contract_professions (
  contract_id,
  profession,
  COALESCE(sponsorship_type, ''),
  COALESCE(sponsor_name, ''),
  COALESCE(ajir_contract_status, '')
);

INSERT INTO private.__dali_migrations (name)
VALUES ('0058_multi_sponsor_workforce_allocations.sql')
ON CONFLICT (name) DO NOTHING;
