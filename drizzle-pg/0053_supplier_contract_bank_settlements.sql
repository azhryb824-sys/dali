-- Link supplier contract payments to their bank settlement journals.
-- Additive only: existing contracts, payment schedules, financial records, and journals remain unchanged.

ALTER TABLE public.contract_payment_schedules
  ADD COLUMN IF NOT EXISTS payment_journal_entry_id integer;

DO $$ BEGIN
  ALTER TABLE public.contract_payment_schedules
    ADD CONSTRAINT contract_payment_schedules_payment_journal_fk
    FOREIGN KEY (payment_journal_entry_id)
    REFERENCES public.journal_entries(id)
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS contract_payment_schedules_payment_journal_unique
  ON public.contract_payment_schedules(payment_journal_entry_id)
  WHERE payment_journal_entry_id IS NOT NULL;

INSERT INTO private.__dali_migrations (name)
VALUES ('0053_supplier_contract_bank_settlements.sql')
ON CONFLICT (name) DO NOTHING;
