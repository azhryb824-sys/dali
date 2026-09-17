CREATE TABLE legal_referrals (
  id serial PRIMARY KEY,
  legal_record_id integer NOT NULL REFERENCES legal_records(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('payment','contract','employee','worker')),
  source_id integer NOT NULL CHECK (source_id > 0),
  contract_id integer REFERENCES workforce_contracts(id) ON DELETE RESTRICT,
  payment_schedule_id integer REFERENCES contract_payment_schedules(id) ON DELETE RESTRICT,
  employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  worker_id integer REFERENCES workers(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','returned','closed')),
  referred_by text NOT NULL,
  referred_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  returned_by text,
  returned_at text,
  return_reason text,
  CONSTRAINT legal_referrals_source_shape_check CHECK ((source_type = 'payment' AND payment_schedule_id IS NOT NULL AND payment_schedule_id = source_id AND contract_id IS NOT NULL AND employee_id IS NULL AND worker_id IS NULL)
    OR (source_type = 'contract' AND contract_id IS NOT NULL AND contract_id = source_id AND payment_schedule_id IS NULL AND employee_id IS NULL AND worker_id IS NULL)
    OR (source_type = 'employee' AND employee_id IS NOT NULL AND employee_id = source_id AND contract_id IS NULL AND payment_schedule_id IS NULL AND worker_id IS NULL)
    OR (source_type = 'worker' AND worker_id IS NOT NULL AND worker_id = source_id AND contract_id IS NULL AND payment_schedule_id IS NULL AND employee_id IS NULL)),
  CONSTRAINT legal_referrals_return_details_check CHECK (status <> 'returned' OR (returned_by IS NOT NULL AND returned_at IS NOT NULL AND return_reason IS NOT NULL AND length(return_reason) >= 10))
);
CREATE UNIQUE INDEX legal_referrals_open_source_unique ON legal_referrals(source_type, source_id) WHERE status <> 'returned';
CREATE INDEX legal_referrals_record_idx ON legal_referrals(legal_record_id, referred_at);
CREATE INDEX legal_referrals_contract_idx ON legal_referrals(contract_id, status);

-- Recover the identifiable installment from historical snapshots; never guess other installments.
-- A temporary safe parser tolerates truncated historical audit JSON on PostgreSQL 14+.
CREATE OR REPLACE FUNCTION pg_temp.dali_referral_snapshot(value text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN value::jsonb;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END $$;
INSERT INTO legal_referrals(legal_record_id, source_type, source_id, contract_id, payment_schedule_id, reason, status, referred_by, referred_at, returned_by, returned_at, return_reason)
SELECT DISTINCT ON (p.id) l.id, 'payment', p.id, p.contract_id, p.id,
  coalesce(l.referral_reason, 'إحالة تاريخية محفوظة'),
  CASE WHEN l.status = 'awaiting_contracts' THEN 'returned' WHEN l.status = 'closed' THEN 'closed' ELSE 'active' END,
  coalesce(l.referred_by, 'migration'), coalesce(l.referred_at, l.created_at),
  CASE WHEN l.status = 'awaiting_contracts' THEN coalesce(c.created_by, 'migration') END,
  CASE WHEN l.status = 'awaiting_contracts' THEN coalesce(c.created_at, l.updated_at) END,
  CASE WHEN l.status = 'awaiting_contracts' THEN CASE WHEN length(c.message) >= 10 THEN c.message ELSE 'إعادة تاريخية للعقد من القانونية' END END
FROM legal_records l
JOIN contract_payment_schedules p ON p.contract_id = l.contract_id
  AND p.id::text = pg_temp.dali_referral_snapshot(l.file_snapshot_json) #>> '{referral,paymentId}'
LEFT JOIN LATERAL (SELECT created_by, created_at, message FROM legal_contract_correspondence
  WHERE legal_record_id = l.id AND message_type = 'return_request' ORDER BY id DESC LIMIT 1) c ON true
ORDER BY p.id, l.referred_at DESC NULLS LAST, l.id DESC;

-- Older versions reused a contract case and replaced its snapshot. Recover earlier
-- installments only where the immutable activity log identifies them explicitly.
INSERT INTO legal_referrals(legal_record_id, source_type, source_id, contract_id, payment_schedule_id, reason, status, referred_by, referred_at, returned_by, returned_at, return_reason)
SELECT DISTINCT ON (p.id) l.id, 'payment', p.id, p.contract_id, p.id,
  coalesce(a.reason, l.referral_reason, 'إحالة تاريخية محفوظة'),
  CASE WHEN c.id IS NOT NULL THEN 'returned' WHEN l.status = 'closed' THEN 'closed' ELSE 'active' END,
  a.actor_email, a.created_at,
  CASE WHEN c.id IS NOT NULL THEN c.created_by END,
  CASE WHEN c.id IS NOT NULL THEN c.created_at END,
  CASE WHEN c.id IS NOT NULL THEN CASE WHEN length(c.message) >= 10 THEN c.message ELSE 'إعادة تاريخية للعقد من القانونية' END END
FROM portal_activity a
JOIN legal_records l ON l.id::text = a.entity_id
JOIN contract_payment_schedules p ON p.contract_id = l.contract_id
  AND p.id::text = pg_temp.dali_referral_snapshot(a.after_json) ->> 'paymentId'
LEFT JOIN LATERAL (SELECT id, created_by, created_at, message FROM legal_contract_correspondence
  WHERE legal_record_id = l.id AND message_type = 'return_request' AND created_at >= a.created_at ORDER BY id DESC LIMIT 1) c ON true
WHERE a.action = 'client-file-referred-legal' AND a.entity_type = 'legal-record'
  AND NOT EXISTS (SELECT 1 FROM legal_referrals r WHERE r.source_type = 'payment' AND r.source_id = p.id)
ORDER BY p.id, a.created_at DESC, a.id DESC;

DROP FUNCTION pg_temp.dali_referral_snapshot(text);

ALTER TABLE workforce_contracts ADD COLUMN cancellation_effective_date text;
ALTER TABLE workforce_contracts ADD COLUMN cancellation_summary_json text;
ALTER TABLE contract_payment_schedules ADD COLUMN cancellation_disposition text
  CHECK (cancellation_disposition IN ('preserve','cancel_future','review_accrual','review_invoice'));
ALTER TABLE contract_payment_schedules ADD COLUMN cancellation_original_amount_halalas integer;
ALTER TABLE legal_judgment_payment_requests ADD COLUMN payment_kind text NOT NULL DEFAULT 'court_judgment'
  CHECK (payment_kind IN ('court_judgment','compensation','court_costs','lawyer_fees'));
ALTER TABLE financial_records ADD COLUMN legal_record_id integer REFERENCES legal_records(id) ON DELETE RESTRICT;
ALTER TABLE financial_records ADD COLUMN employee_id integer REFERENCES employees(id) ON DELETE RESTRICT;
CREATE INDEX financial_records_legal_record_idx ON financial_records(legal_record_id);

ALTER TABLE legal_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON legal_referrals FROM PUBLIC;
REVOKE ALL ON SEQUENCE legal_referrals_id_seq FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dali_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON legal_referrals TO dali_app;
    GRANT USAGE, SELECT ON SEQUENCE legal_referrals_id_seq TO dali_app;
    CREATE POLICY legal_referrals_server_access ON legal_referrals FOR ALL TO dali_app USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON legal_referrals FROM anon;
    REVOKE ALL ON SEQUENCE legal_referrals_id_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON legal_referrals FROM authenticated;
    REVOKE ALL ON SEQUENCE legal_referrals_id_seq FROM authenticated;
  END IF;
END $$;
