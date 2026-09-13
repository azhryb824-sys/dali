-- Additive, audited two-way coordination between Legal and Contracts/Workforce.
-- Existing contracts, legal files, financial records, and stored files remain intact.

CREATE TABLE IF NOT EXISTS public.legal_contract_correspondence (
  id serial PRIMARY KEY,
  legal_record_id integer NOT NULL REFERENCES public.legal_records(id) ON DELETE RESTRICT,
  contract_id integer NOT NULL REFERENCES public.workforce_contracts(id) ON DELETE RESTRICT,
  parent_id integer,
  sender_side text NOT NULL,
  recipient_side text NOT NULL,
  message_type text NOT NULL,
  reason_code text,
  required_attachment_name text,
  message text NOT NULL,
  document_id integer REFERENCES public.company_documents(id) ON DELETE RESTRICT,
  request_status text NOT NULL DEFAULT 'open',
  created_by text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  responded_at text,
  resolved_by text,
  resolved_at text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT legal_contract_correspondence_sides_check
    CHECK (sender_side IN ('legal','contracts') AND recipient_side IN ('legal','workforce')),
  CONSTRAINT legal_contract_correspondence_type_check
    CHECK (message_type IN ('note','return_request','reply','attachment','resolution')),
  CONSTRAINT legal_contract_correspondence_status_check
    CHECK (request_status IN ('open','responded','resolved')),
  CONSTRAINT legal_contract_correspondence_attachment_check
    CHECK ((message_type = 'attachment' AND document_id IS NOT NULL) OR (message_type <> 'attachment' AND document_id IS NULL)),
  CONSTRAINT legal_contract_correspondence_parent_shape_check
    CHECK ((message_type IN ('note','return_request') AND parent_id IS NULL) OR (message_type IN ('reply','attachment','resolution') AND parent_id IS NOT NULL)),
  CONSTRAINT legal_contract_correspondence_missing_file_check
    CHECK (reason_code <> 'missing_attachment' OR length(trim(required_attachment_name)) >= 2)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'legal_contract_correspondence_parent_fk'
      AND conrelid = 'public.legal_contract_correspondence'::regclass
  ) THEN
    ALTER TABLE public.legal_contract_correspondence
      ADD CONSTRAINT legal_contract_correspondence_parent_fk
      FOREIGN KEY (parent_id)
      REFERENCES public.legal_contract_correspondence(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS legal_contract_correspondence_record_idx
  ON public.legal_contract_correspondence(legal_record_id, created_at);
CREATE INDEX IF NOT EXISTS legal_contract_correspondence_contract_idx
  ON public.legal_contract_correspondence(contract_id, created_at);
CREATE INDEX IF NOT EXISTS legal_contract_correspondence_parent_idx
  ON public.legal_contract_correspondence(parent_id);
CREATE INDEX IF NOT EXISTS legal_contract_correspondence_status_idx
  ON public.legal_contract_correspondence(request_status, updated_at);

ALTER TABLE public.legal_case_action_log
  DROP CONSTRAINT IF EXISTS legal_case_action_log_action_check;
ALTER TABLE public.legal_case_action_log
  ADD CONSTRAINT legal_case_action_log_action_check
  CHECK (action IN (
    'created','assigned','started','completed','cancelled','attachment_added',
    'updated','deleted','status_changed','shared','share_revoked','note_sent',
    'returned_to_contracts','contracts_replied','coordination_resolved'
  ));

-- Only legacy files created through the former general company-document form
-- and classified as a licence/certificate/company record belong in the Dali
-- corporate-documents page. Contract, HR, finance, and legal uploads stay out.
UPDATE public.company_documents
SET document_type = 'other_company_document',
    updated_at = CURRENT_TIMESTAMP::text
WHERE source = 'uploaded'
  AND document_type IS NULL
  AND reference_code LIKE 'DOC-%'
  AND category IN ('license', 'certificate', 'other');

CREATE INDEX IF NOT EXISTS company_documents_corporate_type_idx
  ON public.company_documents(document_type, status)
  WHERE source = 'uploaded';

ALTER TABLE public.legal_contract_correspondence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_contract_correspondence FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.legal_contract_correspondence_id_seq FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.legal_contract_correspondence FROM anon;
    REVOKE ALL ON SEQUENCE public.legal_contract_correspondence_id_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.legal_contract_correspondence FROM authenticated;
    REVOKE ALL ON SEQUENCE public.legal_contract_correspondence_id_seq FROM authenticated;
  END IF;
END $$;
