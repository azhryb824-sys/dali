-- Professional legal workspace controls: recoverable record removal and
-- one-link, audited sharing of every file referred with a contract.

ALTER TABLE public.legal_records
  ADD COLUMN IF NOT EXISTS deleted_at text,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

CREATE INDEX IF NOT EXISTS legal_records_deleted_at_idx
  ON public.legal_records(deleted_at);

ALTER TABLE public.legal_case_attachments
  ADD COLUMN IF NOT EXISTS deleted_at text,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

CREATE INDEX IF NOT EXISTS legal_case_attachments_deleted_at_idx
  ON public.legal_case_attachments(deleted_at);

CREATE TABLE IF NOT EXISTS public.legal_external_share_bundles (
  id text PRIMARY KEY,
  legal_record_id integer NOT NULL REFERENCES public.legal_records(id) ON DELETE RESTRICT,
  lawyer_id integer NOT NULL REFERENCES public.legal_lawyers(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT 'whatsapp',
  expires_at text NOT NULL,
  revoked_at text,
  revoked_by text,
  max_downloads integer NOT NULL DEFAULT 200,
  download_count integer NOT NULL DEFAULT 0,
  last_accessed_at text,
  item_count integer NOT NULL,
  shared_by text NOT NULL,
  shared_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT legal_external_share_bundles_channel_check
    CHECK (channel IN ('whatsapp')),
  CONSTRAINT legal_external_share_bundles_download_limit_check
    CHECK (max_downloads > 0 AND download_count >= 0 AND item_count > 0)
);

CREATE INDEX IF NOT EXISTS legal_external_share_bundles_record_idx
  ON public.legal_external_share_bundles(legal_record_id, shared_at);
CREATE INDEX IF NOT EXISTS legal_external_share_bundles_lawyer_idx
  ON public.legal_external_share_bundles(lawyer_id, shared_at);
CREATE INDEX IF NOT EXISTS legal_external_share_bundles_expiry_idx
  ON public.legal_external_share_bundles(expires_at);

CREATE TABLE IF NOT EXISTS public.legal_external_share_bundle_items (
  id serial PRIMARY KEY,
  bundle_id text NOT NULL REFERENCES public.legal_external_share_bundles(id) ON DELETE RESTRICT,
  attachment_id integer REFERENCES public.legal_case_attachments(id) ON DELETE RESTRICT,
  document_id integer REFERENCES public.company_documents(id) ON DELETE RESTRICT,
  title text NOT NULL,
  file_name text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT legal_external_share_bundle_items_source_check
    CHECK (
      (attachment_id IS NOT NULL AND document_id IS NULL)
      OR (attachment_id IS NULL AND document_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS legal_external_share_bundle_items_bundle_idx
  ON public.legal_external_share_bundle_items(bundle_id);
CREATE UNIQUE INDEX IF NOT EXISTS legal_external_share_bundle_attachment_unique
  ON public.legal_external_share_bundle_items(bundle_id, attachment_id)
  WHERE attachment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS legal_external_share_bundle_document_unique
  ON public.legal_external_share_bundle_items(bundle_id, document_id)
  WHERE document_id IS NOT NULL;

ALTER TABLE public.legal_case_action_log
  DROP CONSTRAINT IF EXISTS legal_case_action_log_action_check;
ALTER TABLE public.legal_case_action_log
  ADD CONSTRAINT legal_case_action_log_action_check
  CHECK (action IN (
    'created','assigned','started','completed','cancelled','attachment_added',
    'updated','deleted','status_changed','shared','share_revoked'
  ));

ALTER TABLE public.legal_external_share_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_external_share_bundle_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_external_share_bundles,
  public.legal_external_share_bundle_items FROM PUBLIC;
