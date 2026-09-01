-- Add an independent lawyer registry, case assignment by lawyer identity, and
-- audited temporary WhatsApp sharing for external counsel. Additive only.

CREATE TABLE IF NOT EXISTS public.legal_lawyers (
  id serial PRIMARY KEY,
  full_name text NOT NULL,
  license_number text,
  license_expiry_date text,
  mobile text,
  email text,
  portal_user_email text REFERENCES public.portal_users(email) ON DELETE SET NULL,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_by text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT legal_lawyers_status_check CHECK (status IN ('active','inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS legal_lawyers_license_unique
  ON public.legal_lawyers(license_number)
  WHERE license_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS legal_lawyers_portal_user_unique
  ON public.legal_lawyers(portal_user_email)
  WHERE portal_user_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS legal_lawyers_email_unique
  ON public.legal_lawyers(lower(email))
  WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS legal_lawyers_status_name_idx
  ON public.legal_lawyers(status, full_name);
CREATE INDEX IF NOT EXISTS legal_lawyers_license_expiry_idx
  ON public.legal_lawyers(license_expiry_date);

ALTER TABLE public.legal_records
  ADD COLUMN IF NOT EXISTS assigned_lawyer_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'legal_records_assigned_lawyer_fk'
      AND conrelid = 'public.legal_records'::regclass
  ) THEN
    ALTER TABLE public.legal_records
      ADD CONSTRAINT legal_records_assigned_lawyer_fk
      FOREIGN KEY (assigned_lawyer_id)
      REFERENCES public.legal_lawyers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS legal_records_assigned_lawyer_idx
  ON public.legal_records(assigned_lawyer_id);

-- Preserve every previous email-based assignment by creating a lawyer record.
WITH assigned_emails AS (
  SELECT DISTINCT ON (lower(trim(record.assigned_lawyer_email)))
    trim(record.assigned_lawyer_email) AS contact_email,
    lower(trim(record.assigned_lawyer_email)) AS normalized_email
  FROM public.legal_records record
  WHERE nullif(trim(record.assigned_lawyer_email), '') IS NOT NULL
  ORDER BY lower(trim(record.assigned_lawyer_email)), record.id
)
INSERT INTO public.legal_lawyers
  (full_name, email, portal_user_email, status, created_by, created_at, updated_at)
SELECT
  COALESCE(NULLIF(trim(users.display_name), ''), split_part(assigned.contact_email, '@', 1)),
  assigned.contact_email,
  CASE
    WHEN users.status = 'active' AND EXISTS (
      SELECT 1
      FROM public.portal_access_scopes scope
      WHERE lower(scope.user_email) = lower(users.email)
        AND scope.active = true
        AND scope.functional_role IN ('lawyer','legal_supervisor')
        AND (scope.valid_from IS NULL OR scope.valid_from <= CURRENT_DATE::text)
        AND (scope.valid_until IS NULL OR scope.valid_until >= CURRENT_DATE::text)
    ) THEN lower(users.email)
    ELSE NULL
  END,
  'active',
  'system-migration',
  CURRENT_TIMESTAMP::text,
  CURRENT_TIMESTAMP::text
FROM assigned_emails assigned
LEFT JOIN public.portal_users users
  ON lower(users.email) = assigned.normalized_email
WHERE NOT EXISTS (
  SELECT 1
  FROM public.legal_lawyers lawyer
  WHERE lower(lawyer.email) = assigned.normalized_email
     OR lower(lawyer.portal_user_email) = assigned.normalized_email
);

UPDATE public.legal_records record
SET assigned_lawyer_id = lawyer.id
FROM public.legal_lawyers lawyer
WHERE record.assigned_lawyer_id IS NULL
  AND record.assigned_lawyer_email IS NOT NULL
  AND (
    lower(lawyer.email) = lower(record.assigned_lawyer_email)
    OR lower(lawyer.portal_user_email) = lower(record.assigned_lawyer_email)
  );

CREATE TABLE IF NOT EXISTS public.legal_external_shares (
  id text PRIMARY KEY,
  legal_record_id integer NOT NULL REFERENCES public.legal_records(id) ON DELETE RESTRICT,
  attachment_id integer NOT NULL REFERENCES public.legal_case_attachments(id) ON DELETE RESTRICT,
  lawyer_id integer NOT NULL REFERENCES public.legal_lawyers(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT 'whatsapp',
  expires_at text NOT NULL,
  revoked_at text,
  revoked_by text,
  max_downloads integer NOT NULL DEFAULT 20,
  download_count integer NOT NULL DEFAULT 0,
  last_accessed_at text,
  shared_by text NOT NULL,
  shared_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT legal_external_shares_channel_check CHECK (channel IN ('whatsapp')),
  CONSTRAINT legal_external_shares_download_limit_check
    CHECK (max_downloads > 0 AND download_count >= 0)
);

CREATE INDEX IF NOT EXISTS legal_external_shares_record_idx
  ON public.legal_external_shares(legal_record_id, shared_at);
CREATE INDEX IF NOT EXISTS legal_external_shares_attachment_idx
  ON public.legal_external_shares(attachment_id);
CREATE INDEX IF NOT EXISTS legal_external_shares_lawyer_idx
  ON public.legal_external_shares(lawyer_id, shared_at);
CREATE INDEX IF NOT EXISTS legal_external_shares_expiry_idx
  ON public.legal_external_shares(expires_at);

-- The canonical lawyer account manages and assigns every legal case without
-- receiving owner-only financial payment or system administration powers.
UPDATE public.portal_roles
SET label_ar = 'محامي',
    description = 'إدارة جميع القضايا وإسنادها للمحامين الداخليين والخارجيين دون صلاحيات المالك المالية أو إدارة المستخدمين.',
    permissions_json = '["overview.read","legal.read","legal.write","documents.read","documents.preview"]',
    active = true,
    updated_at = CURRENT_TIMESTAMP::text
WHERE role_key = 'lawyer';

ALTER TABLE public.legal_lawyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_external_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_lawyers, public.legal_external_shares FROM PUBLIC;

INSERT INTO private.__dali_migrations (name)
VALUES ('0064_legal_lawyer_registry_and_external_shares.sql')
ON CONFLICT (name) DO NOTHING;
