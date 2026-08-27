-- Allow Ajir status to be recorded independently for Dali-sponsored contract professions.
-- Constraint-only migration: no contracts, professions, workers, documents, or financial records are deleted.

ALTER TABLE public.contract_professions
  DROP CONSTRAINT IF EXISTS contract_professions_sponsorship_consistency_check;

ALTER TABLE public.contract_professions
  ADD CONSTRAINT contract_professions_sponsorship_consistency_check
  CHECK (
    (
      sponsorship_type = 'dali'
      AND sponsor_name IS NULL
      AND ajir_contract_status IN ('not_applicable', 'with_ajir', 'without_ajir')
    )
    OR
    (
      sponsorship_type = 'other'
      AND length(trim(sponsor_name)) >= 2
      AND ajir_contract_status IN ('with_ajir', 'without_ajir')
    )
  );

INSERT INTO private.__dali_migrations (name)
VALUES ('0052_contract_profession_ajir_consistency.sql')
ON CONFLICT (name) DO NOTHING;
