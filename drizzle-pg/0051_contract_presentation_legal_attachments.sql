-- Contract presentation, logistics terms, and legal case attachments.
-- Additive only: existing contracts, quotes, legal files, documents and accounting records remain unchanged.

ALTER TABLE public.workforce_contracts
  ADD COLUMN IF NOT EXISTS show_payment_schedule boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accommodation_party text,
  ADD COLUMN IF NOT EXISTS transport_party text;

ALTER TABLE public.quote_versions
  ADD COLUMN IF NOT EXISTS accommodation_party text,
  ADD COLUMN IF NOT EXISTS transport_party text;

CREATE TABLE IF NOT EXISTS public.legal_case_attachments (
  id serial PRIMARY KEY,
  legal_record_id integer NOT NULL REFERENCES public.legal_records(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_name text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  validation_status text NOT NULL DEFAULT 'validated',
  validation_details text,
  created_by text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT legal_case_attachments_size_check CHECK (size_bytes > 0 AND size_bytes <= 20971520)
);

CREATE INDEX IF NOT EXISTS legal_case_attachments_record_idx
  ON public.legal_case_attachments(legal_record_id, created_at);

INSERT INTO private.__dali_migrations (name)
VALUES ('0051_contract_presentation_legal_attachments.sql')
ON CONFLICT (name) DO NOTHING;
