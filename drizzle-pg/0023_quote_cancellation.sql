ALTER TABLE "quote_versions" DROP CONSTRAINT IF EXISTS "quote_versions_status_check";
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_status_check" CHECK ("status" in ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'expired', 'superseded', 'cancelled'));
