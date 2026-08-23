CREATE TABLE IF NOT EXISTS "portal_user_presence" (
  "user_email" text PRIMARY KEY NOT NULL REFERENCES "portal_users"("email") ON DELETE cascade,
  "availability" text DEFAULT 'online' NOT NULL,
  "current_interview_id" text,
  "last_seen_at" text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "portal_user_presence_availability_check" CHECK ("availability" in ('online','busy','away','offline'))
);
CREATE INDEX IF NOT EXISTS "portal_user_presence_availability_idx" ON "portal_user_presence" ("availability","last_seen_at");

CREATE TABLE IF NOT EXISTS "video_interviews" (
  "id" text PRIMARY KEY NOT NULL,
  "reference_code" text NOT NULL UNIQUE,
  "conversation_id" text NOT NULL REFERENCES "visitor_conversations"("id") ON DELETE cascade,
  "room_name" text NOT NULL UNIQUE,
  "provider" text DEFAULT 'jitsi' NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "assigned_to" text REFERENCES "portal_users"("email") ON DELETE set null,
  "requested_at" text NOT NULL,
  "accepted_at" text,
  "started_at" text,
  "ended_at" text,
  "expires_at" text NOT NULL,
  "transfer_count" integer DEFAULT 0 NOT NULL,
  "last_transferred_by" text,
  "transfer_reason" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "video_interviews_status_check" CHECK ("status" in ('requested','ringing','active','transferred','completed','cancelled','expired'))
);
CREATE INDEX IF NOT EXISTS "video_interviews_conversation_idx" ON "video_interviews" ("conversation_id","created_at");
CREATE INDEX IF NOT EXISTS "video_interviews_assignee_status_idx" ON "video_interviews" ("assigned_to","status");
CREATE INDEX IF NOT EXISTS "video_interviews_status_requested_idx" ON "video_interviews" ("status","requested_at");

CREATE TABLE IF NOT EXISTS "video_interview_transfers" (
  "id" serial PRIMARY KEY NOT NULL,
  "interview_id" text NOT NULL REFERENCES "video_interviews"("id") ON DELETE cascade,
  "from_email" text,
  "to_email" text NOT NULL,
  "transferred_by" text NOT NULL,
  "reason" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
CREATE INDEX IF NOT EXISTS "video_interview_transfers_interview_idx" ON "video_interview_transfers" ("interview_id","created_at");

INSERT INTO "portal_roles" ("role_key","label_ar","description","permissions_json","protected","active","created_by") VALUES
('accountant','المحاسب','العمليات المحاسبية والتقارير دون اعتماد أو ترحيل نهائي.','["overview.read","finance.read","finance.write","documents.read","reports.read","reports.export","conversations.read","video.read","video.manage","video.transfer"]',false,true,'system'),
('legal_affairs','شؤون قانونية','إدارة الملفات القانونية والعقود والمستندات المرتبطة بها.','["overview.read","legal.read","legal.write","legal.approve","documents.read","documents.write","documents.share","conversations.read","conversations.write","video.read","video.manage","video.transfer"]',false,true,'system'),
('sales_representative','مندوب مبيعات','طلبات العملاء والفرص وعروض الأسعار والمتابعة.','["overview.read","workforce.read","workforce.write","documents.read","conversations.read","conversations.write","video.read","video.manage","video.transfer"]',false,true,'system'),
('purchasing_representative','مندوب مشتريات','طلبات الموردين والمشتريات والمستندات المالية ذات الصلة.','["overview.read","finance.read","finance.write","construction.read","documents.read","documents.write","conversations.read","video.read","video.manage","video.transfer"]',false,true,'system'),
('administrative_assistant','مساعد إداري','المتابعة الإدارية والمستندات والمحادثات دون اعتماد مالي.','["overview.read","employees.read","documents.read","documents.write","conversations.read","conversations.write","website.read","video.read","video.manage","video.transfer"]',false,true,'system')
ON CONFLICT ("role_key") DO UPDATE SET
  "label_ar"=excluded."label_ar",
  "description"=excluded."description",
  "permissions_json"=excluded."permissions_json",
  "active"=true,
  "updated_at"=CURRENT_TIMESTAMP::text
WHERE "portal_roles"."protected"=false;

ALTER TABLE public.portal_user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_interview_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_user_presence, public.video_interviews, public.video_interview_transfers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_user_presence, public.video_interviews, public.video_interview_transfers TO dali_app;
GRANT USAGE, SELECT ON SEQUENCE public.video_interview_transfers_id_seq TO dali_app;
CREATE POLICY portal_user_presence_server_access ON public.portal_user_presence AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true);
CREATE POLICY video_interviews_server_access ON public.video_interviews AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true);
CREATE POLICY video_interview_transfers_server_access ON public.video_interview_transfers AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true);

INSERT INTO private.__dali_migrations (name) VALUES ('0030_video_interviews_and_operational_roles.sql') ON CONFLICT (name) DO NOTHING;
