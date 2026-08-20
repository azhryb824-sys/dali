CREATE TABLE "portal_access_scopes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"functional_role" text NOT NULL,
	"business_line_id" integer,
	"region_id" integer,
	"city_id" integer,
	"project_id" integer,
	"financial_limit_halalas" integer,
	"approval_limit_halalas" integer,
	"can_approve_own" boolean DEFAULT false NOT NULL,
	"valid_from" text,
	"valid_until" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "portal_access_scopes_role_check" CHECK ("functional_role" in ('system_owner','system_admin','executive','construction_director','workforce_operations_manager','finance_director','project_manager','site_engineer','planning_engineer','cost_engineer','contracts_manager','procurement_officer','project_accountant','document_controller','quality_officer','safety_officer','hr_officer','regional_manager','client_consultant','subcontractor')),
	CONSTRAINT "portal_access_scopes_financial_limit_check" CHECK ("financial_limit_halalas" is null or "financial_limit_halalas" >= 0),
	CONSTRAINT "portal_access_scopes_approval_limit_check" CHECK ("approval_limit_halalas" is null or "approval_limit_halalas" >= 0),
	CONSTRAINT "portal_access_scopes_dates_check" CHECK ("valid_until" is null or "valid_from" is null or "valid_until" >= "valid_from")
);
--> statement-breakpoint
ALTER TABLE "portal_access_scopes" ADD CONSTRAINT "portal_access_scopes_user_email_portal_users_email_fk" FOREIGN KEY ("user_email") REFERENCES "public"."portal_users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access_scopes" ADD CONSTRAINT "portal_access_scopes_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access_scopes" ADD CONSTRAINT "portal_access_scopes_region_id_service_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."service_regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access_scopes" ADD CONSTRAINT "portal_access_scopes_city_id_service_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."service_cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access_scopes" ADD CONSTRAINT "portal_access_scopes_project_id_construction_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."construction_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_access_scopes_user_active_idx" ON "portal_access_scopes" USING btree ("user_email","active");--> statement-breakpoint
CREATE INDEX "portal_access_scopes_project_idx" ON "portal_access_scopes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "portal_access_scopes_city_idx" ON "portal_access_scopes" USING btree ("city_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_access_scopes_assignment_unique" ON "portal_access_scopes" USING btree ("user_email","functional_role","business_line_id","region_id","city_id","project_id") NULLS NOT DISTINCT;--> statement-breakpoint
ALTER TABLE "portal_access_scopes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "portal_access_scopes" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "portal_access_scopes_id_seq" FROM anon, authenticated;--> statement-breakpoint
INSERT INTO private.__dali_migrations (name) VALUES ('0005_portal_scoped_permissions.sql') ON CONFLICT (name) DO NOTHING;
