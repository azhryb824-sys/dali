-- Additive, auditable partial and mixed settlement support for contract invoices.
-- Existing invoices, journals, and payment history remain intact.

ALTER TABLE public.contract_payment_schedules
  ADD COLUMN IF NOT EXISTS paid_amount_halalas integer NOT NULL DEFAULT 0;

ALTER TABLE public.financial_records
  ADD COLUMN IF NOT EXISTS paid_amount_halalas integer NOT NULL DEFAULT 0;

ALTER TABLE public.contract_payment_schedules
  DROP CONSTRAINT IF EXISTS contract_payment_schedules_status_check;
ALTER TABLE public.contract_payment_schedules
  ADD CONSTRAINT contract_payment_schedules_status_check
  CHECK (status IN (
    'scheduled','due','referred','invoiced','partially_paid','paid','cancelled'
  ));

DO $$ BEGIN
  ALTER TABLE public.contract_payment_schedules
    ADD CONSTRAINT contract_payment_schedules_paid_amount_check
    CHECK (paid_amount_halalas >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.financial_records
    ADD CONSTRAINT financial_records_paid_amount_check
    CHECK (paid_amount_halalas >= 0 AND paid_amount_halalas <= amount_halalas);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.contract_payment_settlements (
  id serial PRIMARY KEY,
  payment_schedule_id integer NOT NULL
    REFERENCES public.contract_payment_schedules(id) ON DELETE RESTRICT,
  reference_code text NOT NULL UNIQUE,
  direction text NOT NULL,
  amount_halalas integer NOT NULL,
  payment_date text NOT NULL,
  journal_entry_id integer NOT NULL
    REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  reversal_journal_entry_id integer
    REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  notes text,
  recorded_by text NOT NULL,
  reversed_by text,
  reversed_at text,
  reversal_reason text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT contract_payment_settlements_direction_check
    CHECK (direction IN ('customer_receipt','supplier_payment')),
  CONSTRAINT contract_payment_settlements_amount_check
    CHECK (amount_halalas > 0),
  CONSTRAINT contract_payment_settlements_status_check
    CHECK (status IN ('active','reversal_pending','reversed','void'))
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_payment_settlements_journal_unique
  ON public.contract_payment_settlements(journal_entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS contract_payment_settlements_reversal_unique
  ON public.contract_payment_settlements(reversal_journal_entry_id)
  WHERE reversal_journal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contract_payment_settlements_schedule_idx
  ON public.contract_payment_settlements(payment_schedule_id, created_at);

CREATE TABLE IF NOT EXISTS public.contract_payment_settlement_allocations (
  id serial PRIMARY KEY,
  settlement_id integer NOT NULL
    REFERENCES public.contract_payment_settlements(id) ON DELETE RESTRICT,
  payment_method text NOT NULL,
  amount_halalas integer NOT NULL,
  ledger_account_id integer
    REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  bank_account_id integer
    REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  payment_reference text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT contract_payment_settlement_allocations_method_check
    CHECK (payment_method IN ('bank_transfer','cash','cheque','legacy')),
  CONSTRAINT contract_payment_settlement_allocations_amount_check
    CHECK (amount_halalas > 0),
  CONSTRAINT contract_payment_settlement_allocations_shape_check
    CHECK (
      payment_method = 'legacy'
      OR (
        payment_method = 'cash'
        AND ledger_account_id IS NOT NULL
        AND bank_account_id IS NULL
      )
      OR (
        payment_method IN ('bank_transfer','cheque')
        AND ledger_account_id IS NOT NULL
        AND bank_account_id IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS contract_payment_settlement_allocations_settlement_idx
  ON public.contract_payment_settlement_allocations(settlement_id);
CREATE INDEX IF NOT EXISTS contract_payment_settlement_allocations_bank_idx
  ON public.contract_payment_settlement_allocations(bank_account_id);

-- Preserve the former single-settlement links as immutable legacy settlements.
INSERT INTO public.contract_payment_settlements (
  payment_schedule_id,
  reference_code,
  direction,
  amount_halalas,
  payment_date,
  journal_entry_id,
  status,
  notes,
  recorded_by,
  reversed_at,
  reversal_reason,
  created_at,
  updated_at
)
SELECT
  payment.id,
  'LEGACY-SET-' || payment.id::text,
  CASE
    WHEN contract.contract_direction = 'dali_purchaser'
      THEN 'supplier_payment'
    ELSE 'customer_receipt'
  END,
  COALESCE(financial.amount_halalas, payment.amount_halalas),
  COALESCE(payment.paid_at, journal.posted_at, journal.entry_date),
  journal.id,
  CASE
    WHEN journal.status = 'void' THEN 'void'
    WHEN journal.status = 'reversed' THEN 'reversed'
    ELSE 'active'
  END,
  'مرحّل من سجل السداد السابق لإتاحة السداد الجزئي دون فقدان التاريخ.',
  COALESCE(journal.created_by, payment.created_by),
  CASE WHEN journal.status IN ('void','reversed')
    THEN COALESCE(journal.updated_at, CURRENT_TIMESTAMP::text)
    ELSE NULL
  END,
  CASE WHEN journal.status IN ('void','reversed')
    THEN 'حالة القيد السابقة قبل ترقية نظام التحصيل الجزئي.'
    ELSE NULL
  END,
  COALESCE(payment.paid_at, journal.created_at, CURRENT_TIMESTAMP::text),
  CURRENT_TIMESTAMP::text
FROM public.contract_payment_schedules payment
JOIN public.workforce_contracts contract
  ON contract.id = payment.contract_id
JOIN public.journal_entries journal
  ON journal.id = payment.payment_journal_entry_id
LEFT JOIN public.financial_records financial
  ON financial.id = payment.financial_record_id
WHERE payment.payment_journal_entry_id IS NOT NULL
  AND COALESCE(financial.amount_halalas, payment.amount_halalas) > 0
ON CONFLICT DO NOTHING;

INSERT INTO public.contract_payment_settlement_allocations (
  settlement_id,
  payment_method,
  amount_halalas,
  payment_reference
)
SELECT
  settlement.id,
  'legacy',
  settlement.amount_halalas,
  'قيد سداد سابق: ' || settlement.reference_code
FROM public.contract_payment_settlements settlement
WHERE settlement.reference_code LIKE 'LEGACY-SET-%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.contract_payment_settlement_allocations allocation
    WHERE allocation.settlement_id = settlement.id
  );

UPDATE public.contract_payment_schedules payment
SET paid_amount_halalas = CASE
      WHEN settlement.status IN ('active','reversal_pending')
        THEN LEAST(financial.amount_halalas, settlement.amount_halalas)
      ELSE 0
    END,
    status = CASE
      WHEN settlement.status IN ('active','reversal_pending') THEN 'paid'
      WHEN payment.status = 'paid' THEN 'invoiced'
      ELSE payment.status
    END,
    paid_at = CASE
      WHEN settlement.status IN ('active','reversal_pending') THEN payment.paid_at
      ELSE NULL
    END,
    updated_at = CURRENT_TIMESTAMP::text
FROM public.contract_payment_settlements settlement,
  public.financial_records financial
WHERE settlement.payment_schedule_id = payment.id
  AND financial.id = payment.financial_record_id
  AND payment.payment_journal_entry_id = settlement.journal_entry_id;

UPDATE public.financial_records financial
SET paid_amount_halalas = payment.paid_amount_halalas,
    status = CASE
      WHEN payment.status = 'paid' THEN 'paid'
      WHEN payment.status = 'partially_paid' THEN 'partially_paid'
      WHEN financial.status = 'paid' THEN 'pending'
      ELSE financial.status
    END,
    updated_at = CURRENT_TIMESTAMP::text
FROM public.contract_payment_schedules payment
WHERE payment.financial_record_id = financial.id;

ALTER TABLE public.contract_payment_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_payment_settlement_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_payment_settlements,
  public.contract_payment_settlement_allocations FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.contract_payment_settlements_id_seq,
  public.contract_payment_settlement_allocations_id_seq FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.contract_payment_settlements,
      public.contract_payment_settlement_allocations FROM anon;
    REVOKE ALL ON SEQUENCE public.contract_payment_settlements_id_seq,
      public.contract_payment_settlement_allocations_id_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.contract_payment_settlements,
      public.contract_payment_settlement_allocations FROM authenticated;
    REVOKE ALL ON SEQUENCE public.contract_payment_settlements_id_seq,
      public.contract_payment_settlement_allocations_id_seq FROM authenticated;
  END IF;
END $$;
