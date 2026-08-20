CREATE TABLE "construction_record_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"record_id" integer NOT NULL,
	"line_number" integer NOT NULL,
	"item_code" text,
	"description" text NOT NULL,
	"unit" text,
	"quantity_milli" integer DEFAULT 0 NOT NULL,
	"unit_rate_halalas" integer DEFAULT 0 NOT NULL,
	"total_halalas" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "construction_record_lines_values_check" CHECK ("construction_record_lines"."quantity_milli" >= 0 and "construction_record_lines"."unit_rate_halalas" >= 0 and "construction_record_lines"."total_halalas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "construction_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"record_code" text NOT NULL,
	"record_type" text NOT NULL,
	"opportunity_id" integer,
	"project_id" integer,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"responsible_email" text NOT NULL,
	"due_date" text,
	"amount_halalas" integer,
	"retention_bps" integer DEFAULT 0 NOT NULL,
	"progress_bps" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"parent_record_id" integer,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "construction_records_record_code_unique" UNIQUE("record_code"),
	CONSTRAINT "construction_records_type_check" CHECK ("construction_records"."record_type" in ('survey','estimate','boq','contract','wbs','daily_log','document','rfi','submittal','inspection','ncr','safety','procurement','subcontract','change_order','payment_certificate','handover','risk')),
	CONSTRAINT "construction_records_priority_check" CHECK ("construction_records"."priority" in ('low','normal','high','critical')),
	CONSTRAINT "construction_records_amount_check" CHECK ("construction_records"."amount_halalas" is null or "construction_records"."amount_halalas" >= 0),
	CONSTRAINT "construction_records_percentage_check" CHECK ("construction_records"."retention_bps" between 0 and 10000 and "construction_records"."progress_bps" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "construction_record_lines" ADD CONSTRAINT "construction_record_lines_record_id_construction_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."construction_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_records" ADD CONSTRAINT "construction_records_opportunity_id_construction_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."construction_opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_records" ADD CONSTRAINT "construction_records_project_id_construction_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."construction_projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "construction_record_lines_record_number_unique" ON "construction_record_lines" USING btree ("record_id","line_number");--> statement-breakpoint
CREATE INDEX "construction_record_lines_record_idx" ON "construction_record_lines" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "construction_records_type_status_idx" ON "construction_records" USING btree ("record_type","status");--> statement-breakpoint
CREATE INDEX "construction_records_project_type_idx" ON "construction_records" USING btree ("project_id","record_type");--> statement-breakpoint
CREATE INDEX "construction_records_opportunity_idx" ON "construction_records" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "construction_records_due_idx" ON "construction_records" USING btree ("due_date");
--> statement-breakpoint
ALTER TABLE "construction_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "construction_record_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "construction_records", "construction_record_lines" FROM anon, authenticated;
