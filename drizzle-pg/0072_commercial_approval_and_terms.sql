-- Preserve all historical requests and contract fields; approval is explicit.
ALTER TABLE workforce_requests ADD COLUMN approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected'));
ALTER TABLE workforce_requests ADD COLUMN approved_by text;
ALTER TABLE workforce_requests ADD COLUMN approved_at text;
ALTER TABLE workforce_requests ADD COLUMN approval_reason text;
ALTER TABLE quote_versions ADD COLUMN commercial_terms_json text;
CREATE INDEX workforce_requests_approval_idx ON workforce_requests(request_type, approval_status);
