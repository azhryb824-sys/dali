-- Government service payment settlement accounting.
-- This migration is isolated from legal judgments and supplier contract settlements.

INSERT INTO public.chart_of_accounts
  (code, name_ar, account_type, normal_balance, is_posting, is_system, status)
VALUES
  ('5280','رسوم وخدمات حكومية','expense','debit',true,true,'active')
ON CONFLICT (code) DO UPDATE SET
  name_ar=EXCLUDED.name_ar,
  account_type='expense',
  normal_balance='debit',
  is_posting=true,
  status='active',
  updated_at=CURRENT_TIMESTAMP::text;

ALTER TABLE public.government_payment_requests
  ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.government_payment_requests
  ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE public.government_payment_requests
  ADD COLUMN IF NOT EXISTS bank_account_id integer;
ALTER TABLE public.government_payment_requests
  ADD COLUMN IF NOT EXISTS journal_entry_id integer;

DO $$ BEGIN
  ALTER TABLE public.government_payment_requests
    ADD CONSTRAINT government_payment_requests_bank_fk
    FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.government_payment_requests
    ADD CONSTRAINT government_payment_requests_journal_fk
    FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS government_payment_requests_journal_unique
  ON public.government_payment_requests(journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

INSERT INTO private.__dali_migrations (name)
VALUES ('0055_government_payment_bank_settlements.sql')
ON CONFLICT (name) DO NOTHING;
