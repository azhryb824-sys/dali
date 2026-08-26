CREATE TABLE IF NOT EXISTS public.contract_signature_requests (
  id text PRIMARY KEY,
  contract_id integer NOT NULL REFERENCES public.workforce_contracts(id) ON DELETE CASCADE,
  document_id integer NOT NULL REFERENCES public.company_documents(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  expires_at text NOT NULL,
  original_storage_key text NOT NULL,
  signed_storage_key text,
  signed_file_name text,
  signed_size_bytes integer,
  uploaded_at text,
  uploaded_source_hash text,
  created_by text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT contract_signature_requests_status_check CHECK (status IN ('pending','uploaded','revoked','expired')),
  CONSTRAINT contract_signature_requests_signed_size_check CHECK (signed_size_bytes IS NULL OR signed_size_bytes > 0)
);

CREATE INDEX IF NOT EXISTS contract_signature_requests_contract_idx
  ON public.contract_signature_requests(contract_id, created_at);
CREATE INDEX IF NOT EXISTS contract_signature_requests_expires_idx
  ON public.contract_signature_requests(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS contract_signature_requests_one_pending_idx
  ON public.contract_signature_requests(contract_id) WHERE status = 'pending';

INSERT INTO private.__dali_migrations (name, checksum, applied_at)
VALUES ('0050_contract_signature_uploads.sql', '0050_contract_signature_uploads_v1', CURRENT_TIMESTAMP)
ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum;
