CREATE TABLE IF NOT EXISTS "portal_attendance_policies" (
  "user_email" text PRIMARY KEY NOT NULL REFERENCES "portal_users"("email") ON DELETE cascade,
  "employee_id" integer REFERENCES "employees"("id") ON DELETE set null,
  "tracking_enabled" boolean DEFAULT false NOT NULL,
  "timezone" text DEFAULT 'Asia/Riyadh' NOT NULL,
  "workdays_json" text DEFAULT '[0,1,2,3,4]' NOT NULL,
  "shift_start" text DEFAULT '08:00' NOT NULL,
  "shift_end" text DEFAULT '17:00' NOT NULL,
  "required_minutes" integer DEFAULT 480 NOT NULL,
  "grace_minutes" integer DEFAULT 10 NOT NULL,
  "activated_by" text NOT NULL,
  "activation_reason" text NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "portal_attendance_required_minutes_check" CHECK ("required_minutes" between 1 and 720),
  CONSTRAINT "portal_attendance_grace_minutes_check" CHECK ("grace_minutes" between 0 and 120)
);
CREATE INDEX IF NOT EXISTS "portal_attendance_policies_enabled_idx" ON "portal_attendance_policies" ("tracking_enabled");
CREATE UNIQUE INDEX IF NOT EXISTS "portal_attendance_policies_employee_idx" ON "portal_attendance_policies" ("employee_id") WHERE "employee_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "portal_attendance_sessions" (
  "session_id" text PRIMARY KEY NOT NULL REFERENCES "portal_sessions"("id") ON DELETE cascade,
  "user_email" text NOT NULL REFERENCES "portal_users"("email") ON DELETE cascade,
  "employee_id" integer REFERENCES "employees"("id") ON DELETE set null,
  "work_date" text NOT NULL,
  "login_at" text NOT NULL,
  "last_activity_at" text NOT NULL,
  "logout_at" text,
  "duration_minutes" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "close_reason" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "portal_attendance_sessions_status_check" CHECK ("status" in ('active','closed','auto_closed')),
  CONSTRAINT "portal_attendance_duration_check" CHECK ("duration_minutes" >= 0)
);
CREATE INDEX IF NOT EXISTS "portal_attendance_sessions_user_date_idx" ON "portal_attendance_sessions" ("user_email","work_date");
CREATE INDEX IF NOT EXISTS "portal_attendance_sessions_employee_date_idx" ON "portal_attendance_sessions" ("employee_id","work_date");
CREATE INDEX IF NOT EXISTS "portal_attendance_sessions_status_idx" ON "portal_attendance_sessions" ("status","last_activity_at");

CREATE TABLE IF NOT EXISTS "attendance_deduction_proposals" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE restrict,
  "period_month" text NOT NULL,
  "required_minutes" integer NOT NULL,
  "worked_minutes" integer NOT NULL,
  "excused_minutes" integer DEFAULT 0 NOT NULL,
  "missing_minutes" integer NOT NULL,
  "gross_salary_halalas" integer NOT NULL,
  "calculated_amount_halalas" integer NOT NULL,
  "capped_amount_halalas" integer NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "written_consent_confirmed" boolean DEFAULT false NOT NULL,
  "legal_basis" text,
  "calculation_json" text NOT NULL,
  "created_by" text NOT NULL,
  "reviewed_by" text,
  "reviewed_at" text,
  "approved_by" text,
  "approved_at" text,
  "movement_id" integer REFERENCES "employee_movements"("id") ON DELETE set null,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "attendance_deduction_employee_month_unique" UNIQUE("employee_id","period_month"),
  CONSTRAINT "attendance_deduction_status_check" CHECK ("status" in ('draft','hr_review','finance_approved','rejected','posted')),
  CONSTRAINT "attendance_deduction_amounts_check" CHECK ("required_minutes" >= 0 and "worked_minutes" >= 0 and "excused_minutes" >= 0 and "missing_minutes" >= 0 and "calculated_amount_halalas" >= 0 and "capped_amount_halalas" >= 0)
);
CREATE INDEX IF NOT EXISTS "attendance_deduction_status_idx" ON "attendance_deduction_proposals" ("status");

CREATE TABLE IF NOT EXISTS "employee_performance_reviews" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE restrict,
  "period_start" text NOT NULL,
  "period_end" text NOT NULL,
  "role_key" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "goals_score" integer NOT NULL,
  "quality_score" integer NOT NULL,
  "timeliness_score" integer NOT NULL,
  "collaboration_score" integer NOT NULL,
  "compliance_score" integer NOT NULL,
  "attendance_score" integer,
  "overall_score" integer NOT NULL,
  "weights_json" text NOT NULL,
  "evidence_json" text NOT NULL,
  "manager_comment" text,
  "employee_comment" text,
  "reviewer_email" text NOT NULL,
  "calibrated_by" text,
  "calibrated_at" text,
  "acknowledged_at" text,
  "appeal_text" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "employee_performance_status_check" CHECK ("status" in ('draft','manager_review','hr_calibration','final','appealed')),
  CONSTRAINT "employee_performance_scores_check" CHECK ("goals_score" between 0 and 100 and "quality_score" between 0 and 100 and "timeliness_score" between 0 and 100 and "collaboration_score" between 0 and 100 and "compliance_score" between 0 and 100 and ("attendance_score" is null or "attendance_score" between 0 and 100) and "overall_score" between 0 and 100)
);
CREATE INDEX IF NOT EXISTS "employee_performance_period_idx" ON "employee_performance_reviews" ("employee_id","period_end");
CREATE INDEX IF NOT EXISTS "employee_performance_status_idx" ON "employee_performance_reviews" ("status");

ALTER TABLE public.portal_attendance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_deduction_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_performance_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_attendance_policies, public.portal_attendance_sessions, public.attendance_deduction_proposals, public.employee_performance_reviews FROM PUBLIC;
DO $dali_migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.portal_attendance_policies, public.portal_attendance_sessions, public.attendance_deduction_proposals, public.employee_performance_reviews FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.portal_attendance_policies, public.portal_attendance_sessions, public.attendance_deduction_proposals, public.employee_performance_reviews FROM authenticated';
  END IF;
END
$dali_migration$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_attendance_policies, public.portal_attendance_sessions, public.attendance_deduction_proposals, public.employee_performance_reviews TO dali_app;
GRANT USAGE, SELECT ON SEQUENCE public.attendance_deduction_proposals_id_seq, public.employee_performance_reviews_id_seq TO dali_app;
CREATE POLICY portal_attendance_policies_server_access ON public.portal_attendance_policies AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true);
CREATE POLICY portal_attendance_sessions_server_access ON public.portal_attendance_sessions AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true);
CREATE POLICY attendance_deduction_proposals_server_access ON public.attendance_deduction_proposals AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true);
CREATE POLICY employee_performance_reviews_server_access ON public.employee_performance_reviews AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true);

INSERT INTO private.__dali_migrations (name) VALUES ('0031_attendance_payroll_and_performance.sql') ON CONFLICT (name) DO NOTHING;
