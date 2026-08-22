ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "portal_user_email" text REFERENCES "portal_users"("email") ON DELETE SET NULL;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "manager_id" integer;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "work_location" text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "employment_type" text NOT NULL DEFAULT 'full_time';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "contract_type" text NOT NULL DEFAULT 'fixed_term';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "gosi_number" text;
CREATE UNIQUE INDEX IF NOT EXISTS "employees_portal_user_unique" ON "employees"("portal_user_email");
CREATE INDEX IF NOT EXISTS "employees_manager_idx" ON "employees"("manager_id");

CREATE TABLE IF NOT EXISTS "employee_documents" ("id" serial PRIMARY KEY,"employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,"document_type" text NOT NULL,"document_number" text,"issue_date" text,"expiry_date" text,"file_name" text,"storage_key" text,"status" text NOT NULL DEFAULT 'valid',"notes" text,"created_by" text NOT NULL,"created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,"updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,CONSTRAINT "employee_documents_status_check" CHECK ("status" IN ('valid','expiring','expired','archived')));
CREATE INDEX IF NOT EXISTS "employee_documents_employee_idx" ON "employee_documents"("employee_id");
CREATE INDEX IF NOT EXISTS "employee_documents_expiry_idx" ON "employee_documents"("expiry_date");

CREATE TABLE IF NOT EXISTS "employee_leave_requests" ("id" serial PRIMARY KEY,"employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE RESTRICT,"leave_type" text NOT NULL,"start_date" text NOT NULL,"end_date" text NOT NULL,"days" integer NOT NULL,"reason" text,"status" text NOT NULL DEFAULT 'pending',"requested_by" text NOT NULL,"decided_by" text,"decision_note" text,"decided_at" text,"created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,"updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,CONSTRAINT "employee_leave_status_check" CHECK ("status" IN ('pending','approved','rejected','cancelled')),CONSTRAINT "employee_leave_days_check" CHECK ("days">0));
CREATE INDEX IF NOT EXISTS "employee_leave_status_idx" ON "employee_leave_requests"("employee_id","status");

CREATE TABLE IF NOT EXISTS "employee_attendance" ("id" serial PRIMARY KEY,"employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE RESTRICT,"attendance_date" text NOT NULL,"check_in_at" text,"check_out_at" text,"status" text NOT NULL DEFAULT 'present',"late_minutes" integer NOT NULL DEFAULT 0,"overtime_minutes" integer NOT NULL DEFAULT 0,"notes" text,"created_by" text NOT NULL,"created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,"updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,CONSTRAINT "employee_attendance_status_check" CHECK ("status" IN ('present','absent','leave','sick','remote','holiday')),CONSTRAINT "employee_attendance_day_unique" UNIQUE("employee_id","attendance_date"));
CREATE INDEX IF NOT EXISTS "employee_attendance_date_idx" ON "employee_attendance"("attendance_date");

INSERT INTO private.__dali_migrations (name) VALUES ('0028_hr_employee_experience.sql') ON CONFLICT (name) DO NOTHING;
