-- Unify representative quotations and reviewed workforce deductions. Preserve all prior documents.
CREATE TABLE "quote_conversion_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_version_id" integer NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"contract_id" integer,
	"conversion_mode" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "quote_conversion_requests_quote_version_id_unique" UNIQUE("quote_version_id"),
	CONSTRAINT "quote_conversion_status_check" CHECK ("quote_conversion_requests"."status" in ('pending','converted','rejected'))
);

CREATE TABLE "worker_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_code" text NOT NULL,
	"worker_id" integer NOT NULL,
	"contract_id" integer NOT NULL,
	"assignment_id" integer NOT NULL,
	"incident_type" text NOT NULL,
	"reason_code" text NOT NULL,
	"reason" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"file_name" text,
	"storage_key" text,
	"content_type" text,
	"size_bytes" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_reason" text,
	"warning" boolean DEFAULT false NOT NULL,
	"deduct" boolean DEFAULT false NOT NULL,
	"release_worker" boolean DEFAULT false NOT NULL,
	"archive_worker" boolean DEFAULT false NOT NULL,
	"chargeable_days" integer DEFAULT 0 NOT NULL,
	"monthly_salary_halalas" integer DEFAULT 0 NOT NULL,
	"deduction_halalas" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"decided_by" text,
	"decided_at" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "worker_incidents_reference_code_unique" UNIQUE("reference_code"),
	CONSTRAINT "worker_incidents_status_check" CHECK ("worker_incidents"."status" in ('pending','accepted','rejected')),
	CONSTRAINT "worker_incidents_type_check" CHECK ("worker_incidents"."incident_type" in ('absence','abandonment','work_injury','sick_leave','other')),
	CONSTRAINT "worker_incidents_medical_file_check" CHECK ("worker_incidents"."incident_type" not in ('work_injury','sick_leave') or "worker_incidents"."storage_key" is not null),
	CONSTRAINT "worker_incidents_dates_check" CHECK ("worker_incidents"."end_date" >= "worker_incidents"."start_date")
);

CREATE TABLE "worker_payroll_deductions" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"contract_id" integer NOT NULL,
	"incident_id" integer,
	"absence_id" integer,
	"deduction_date" text NOT NULL,
	"amount_halalas" integer NOT NULL,
	"settled_halalas" integer DEFAULT 0 NOT NULL,
	"voided_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "worker_payroll_deduction_amount_check" CHECK ("worker_payroll_deductions"."amount_halalas">0 and "worker_payroll_deductions"."settled_halalas">=0 and "worker_payroll_deductions"."settled_halalas"<="worker_payroll_deductions"."amount_halalas"),
	CONSTRAINT "worker_payroll_deduction_source_check" CHECK (("worker_payroll_deductions"."incident_id" is not null)::int + ("worker_payroll_deductions"."absence_id" is not null)::int = 1),
	CONSTRAINT "worker_payroll_deduction_friday_check" CHECK (extract(isodow from "worker_payroll_deductions"."deduction_date"::date) <> 5)
);

CREATE TABLE "worker_salary_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"financial_record_id" integer NOT NULL,
	"deduction_id" integer NOT NULL,
	"amount_halalas" integer NOT NULL,
	"reversed_at" text,
	CONSTRAINT "worker_salary_allocation_amount_check" CHECK ("worker_salary_allocations"."amount_halalas">0)
);

ALTER TABLE "workforce_requests" DROP CONSTRAINT "workforce_requests_approval_status_check";
ALTER TABLE "financial_records" ADD COLUMN "gross_amount_halalas" integer;
ALTER TABLE "financial_records" ADD COLUMN "deduction_amount_halalas" integer DEFAULT 0 NOT NULL;
ALTER TABLE "representative_requests" ADD COLUMN "workforce_request_id" integer;
ALTER TABLE "workforce_requests" ADD COLUMN "origin_email" text;
ALTER TABLE "workforce_requests" ADD COLUMN "origin_conversation_id" text;
ALTER TABLE "quote_conversion_requests" ADD CONSTRAINT "quote_conversion_requests_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "quote_conversion_requests" ADD CONSTRAINT "quote_conversion_requests_contract_id_workforce_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."workforce_contracts"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "worker_incidents" ADD CONSTRAINT "worker_incidents_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "worker_incidents" ADD CONSTRAINT "worker_incidents_contract_id_workforce_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."workforce_contracts"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "worker_incidents" ADD CONSTRAINT "worker_incidents_assignment_id_contract_worker_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."contract_worker_assignments"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "worker_payroll_deductions" ADD CONSTRAINT "worker_payroll_deductions_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "worker_payroll_deductions" ADD CONSTRAINT "worker_payroll_deductions_contract_id_workforce_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."workforce_contracts"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "worker_payroll_deductions" ADD CONSTRAINT "worker_payroll_deductions_incident_id_worker_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."worker_incidents"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "worker_payroll_deductions" ADD CONSTRAINT "worker_payroll_deductions_absence_id_contract_worker_absences_id_fk" FOREIGN KEY ("absence_id") REFERENCES "public"."contract_worker_absences"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "worker_salary_allocations" ADD CONSTRAINT "worker_salary_allocations_financial_record_id_financial_records_id_fk" FOREIGN KEY ("financial_record_id") REFERENCES "public"."financial_records"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "worker_salary_allocations" ADD CONSTRAINT "worker_salary_allocations_deduction_id_worker_payroll_deductions_id_fk" FOREIGN KEY ("deduction_id") REFERENCES "public"."worker_payroll_deductions"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "worker_incidents_status_idx" ON "worker_incidents" USING btree ("status","created_at");
CREATE INDEX "worker_incidents_worker_idx" ON "worker_incidents" USING btree ("worker_id","start_date");
CREATE UNIQUE INDEX "worker_payroll_deduction_day_unique" ON "worker_payroll_deductions" USING btree ("worker_id","deduction_date") WHERE "worker_payroll_deductions"."voided_at" is null;
CREATE UNIQUE INDEX "worker_salary_allocation_unique" ON "worker_salary_allocations" USING btree ("financial_record_id","deduction_id") WHERE "worker_salary_allocations"."reversed_at" is null;
ALTER TABLE "representative_requests" ADD CONSTRAINT "representative_requests_workforce_request_id_workforce_requests_id_fk" FOREIGN KEY ("workforce_request_id") REFERENCES "public"."workforce_requests"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "representative_requests" ADD CONSTRAINT "representative_requests_workforce_request_id_unique" UNIQUE("workforce_request_id");
ALTER TABLE "workforce_requests" ADD CONSTRAINT "workforce_requests_approval_status_check" CHECK ("workforce_requests"."approval_status" in ('pending','approved','rejected','changes_requested'));
-- Preserve historical salaries; never silently re-charge an already recorded salary period.
UPDATE financial_records SET gross_amount_halalas=amount_halalas WHERE category='worker_salary' AND gross_amount_halalas IS NULL;
DROP INDEX financial_records_worker_salary_period_unique;
CREATE UNIQUE INDEX financial_records_worker_salary_period_unique ON financial_records(worker_id,contract_id,period_month) WHERE category='worker_salary' AND status<>'cancelled';
INSERT INTO worker_payroll_deductions(worker_id,contract_id,absence_id,deduction_date,amount_halalas)
SELECT DISTINCT ON (a.worker_id, d.day::date) a.worker_id,a.contract_id,a.id,d.day::date::text,a.daily_rate_halalas
FROM contract_worker_absences a
CROSS JOIN LATERAL generate_series(a.absence_date::date,coalesce(a.absence_end_date,a.absence_date)::date,interval '1 day') d(day)
WHERE a.status='active' AND a.worker_id IS NOT NULL AND a.daily_rate_halalas>0 AND extract(isodow from d.day)<>5
AND NOT EXISTS (SELECT 1 FROM financial_records f WHERE f.worker_id=a.worker_id AND f.category='worker_salary' AND f.status<>'cancelled' AND f.period_month=substring(d.day::date::text,1,7))
ORDER BY a.worker_id,d.day::date,a.id;

ALTER TABLE quote_conversion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quote_conversion_requests FROM PUBLIC;
REVOKE ALL ON SEQUENCE quote_conversion_requests_id_seq FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dali_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON quote_conversion_requests TO dali_app;
  GRANT USAGE,SELECT ON SEQUENCE quote_conversion_requests_id_seq TO dali_app;
  CREATE POLICY quote_conversion_requests_server_access ON quote_conversion_requests FOR ALL TO dali_app USING (true) WITH CHECK (true);
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON quote_conversion_requests FROM anon; REVOKE ALL ON SEQUENCE quote_conversion_requests_id_seq FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON quote_conversion_requests FROM authenticated; REVOKE ALL ON SEQUENCE quote_conversion_requests_id_seq FROM authenticated; END IF;
END $$;

ALTER TABLE worker_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON worker_incidents FROM PUBLIC;
REVOKE ALL ON SEQUENCE worker_incidents_id_seq FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dali_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON worker_incidents TO dali_app;
  GRANT USAGE,SELECT ON SEQUENCE worker_incidents_id_seq TO dali_app;
  CREATE POLICY worker_incidents_server_access ON worker_incidents FOR ALL TO dali_app USING (true) WITH CHECK (true);
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON worker_incidents FROM anon; REVOKE ALL ON SEQUENCE worker_incidents_id_seq FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON worker_incidents FROM authenticated; REVOKE ALL ON SEQUENCE worker_incidents_id_seq FROM authenticated; END IF;
END $$;

ALTER TABLE worker_payroll_deductions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON worker_payroll_deductions FROM PUBLIC;
REVOKE ALL ON SEQUENCE worker_payroll_deductions_id_seq FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dali_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON worker_payroll_deductions TO dali_app;
  GRANT USAGE,SELECT ON SEQUENCE worker_payroll_deductions_id_seq TO dali_app;
  CREATE POLICY worker_payroll_deductions_server_access ON worker_payroll_deductions FOR ALL TO dali_app USING (true) WITH CHECK (true);
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON worker_payroll_deductions FROM anon; REVOKE ALL ON SEQUENCE worker_payroll_deductions_id_seq FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON worker_payroll_deductions FROM authenticated; REVOKE ALL ON SEQUENCE worker_payroll_deductions_id_seq FROM authenticated; END IF;
END $$;

ALTER TABLE worker_salary_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON worker_salary_allocations FROM PUBLIC;
REVOKE ALL ON SEQUENCE worker_salary_allocations_id_seq FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dali_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON worker_salary_allocations TO dali_app;
  GRANT USAGE,SELECT ON SEQUENCE worker_salary_allocations_id_seq TO dali_app;
  CREATE POLICY worker_salary_allocations_server_access ON worker_salary_allocations FOR ALL TO dali_app USING (true) WITH CHECK (true);
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON worker_salary_allocations FROM anon; REVOKE ALL ON SEQUENCE worker_salary_allocations_id_seq FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON worker_salary_allocations FROM authenticated; REVOKE ALL ON SEQUENCE worker_salary_allocations_id_seq FROM authenticated; END IF;
END $$;

ALTER TABLE employee_movements DROP CONSTRAINT employee_movements_type_check;
ALTER TABLE employee_movements ADD CONSTRAINT employee_movements_type_check CHECK (movement_type IN ('salary_adjustment','allowance','bonus','leave_compensation','retroactive','advance','deduction','leave','return_from_leave','suspension','termination','note'));

-- Apply validity and permanent exclusion even when assignments originate from another workflow.
CREATE FUNCTION public.contract_assignment_incident_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE c record; today text := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date::text;
BEGIN
 IF NEW.status IN ('planned','active') AND EXISTS (SELECT 1 FROM worker_incidents i WHERE i.worker_id=NEW.worker_id AND i.contract_id=NEW.contract_id AND i.status='rejected' AND i.release_worker) THEN
  RAISE EXCEPTION 'WORKER_PERMANENTLY_EXCLUDED' USING ERRCODE='23514';
 END IF;
 IF NEW.status='active' THEN
  SELECT start_date,end_date INTO c FROM workforce_contracts WHERE id=NEW.contract_id;
  IF today<c.start_date OR today>c.end_date THEN RAISE EXCEPTION 'CONTRACT_OUTSIDE_VALIDITY' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contract_assignment_incident_guard_trigger BEFORE INSERT OR UPDATE OF status,worker_id,contract_id ON contract_worker_assignments FOR EACH ROW EXECUTE FUNCTION contract_assignment_incident_guard();
REVOKE ALL ON FUNCTION contract_assignment_incident_guard() FROM PUBLIC;
