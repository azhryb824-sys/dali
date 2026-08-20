CREATE TABLE "business_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"public_status" text DEFAULT 'draft' NOT NULL,
	"compliance_approved_by" text,
	"compliance_approved_at" text,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "business_lines_code_unique" UNIQUE("code"),
	CONSTRAINT "business_lines_status_check" CHECK ("business_lines"."status" in ('active','inactive')),
	CONSTRAINT "business_lines_public_status_check" CHECK ("business_lines"."public_status" in ('draft','review','published','blocked'))
);
--> statement-breakpoint
CREATE TABLE "construction_opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_code" text NOT NULL,
	"client_id" integer,
	"client_name" text NOT NULL,
	"title" text NOT NULL,
	"city_id" integer,
	"project_type" text NOT NULL,
	"scope_summary" text NOT NULL,
	"estimated_value_halalas" integer,
	"expected_start_date" text,
	"bid_due_date" text,
	"stage" text DEFAULT 'new' NOT NULL,
	"probability_bps" integer DEFAULT 1000 NOT NULL,
	"owner_email" text NOT NULL,
	"source" text DEFAULT 'portal' NOT NULL,
	"loss_reason" text,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "construction_opportunities_opportunity_code_unique" UNIQUE("opportunity_code"),
	CONSTRAINT "construction_opportunities_stage_check" CHECK ("construction_opportunities"."stage" in ('new','qualified','survey','estimating','review','submitted','negotiation','won','lost','declined')),
	CONSTRAINT "construction_opportunities_probability_check" CHECK ("construction_opportunities"."probability_bps" >= 0 and "construction_opportunities"."probability_bps" <= 10000),
	CONSTRAINT "construction_opportunities_value_check" CHECK ("construction_opportunities"."estimated_value_halalas" is null or "construction_opportunities"."estimated_value_halalas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "construction_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_code" text NOT NULL,
	"opportunity_id" integer,
	"client_id" integer,
	"client_name" text NOT NULL,
	"title" text NOT NULL,
	"city_id" integer,
	"project_type" text NOT NULL,
	"contract_value_halalas" integer DEFAULT 0 NOT NULL,
	"budget_halalas" integer DEFAULT 0 NOT NULL,
	"start_date" text NOT NULL,
	"planned_end_date" text NOT NULL,
	"actual_end_date" text,
	"progress_bps" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'mobilizing' NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"manager_email" text NOT NULL,
	"cost_center_code" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "construction_projects_project_code_unique" UNIQUE("project_code"),
	CONSTRAINT "construction_projects_cost_center_code_unique" UNIQUE("cost_center_code"),
	CONSTRAINT "construction_projects_status_check" CHECK ("construction_projects"."status" in ('mobilizing','active','on_hold','substantial_completion','defects_liability','closed','cancelled')),
	CONSTRAINT "construction_projects_risk_check" CHECK ("construction_projects"."risk_level" in ('low','medium','high','critical')),
	CONSTRAINT "construction_projects_progress_check" CHECK ("construction_projects"."progress_bps" >= 0 and "construction_projects"."progress_bps" <= 10000),
	CONSTRAINT "construction_projects_value_check" CHECK ("construction_projects"."contract_value_halalas" >= 0 and "construction_projects"."budget_halalas" >= 0),
	CONSTRAINT "construction_projects_dates_check" CHECK ("construction_projects"."planned_end_date" >= "construction_projects"."start_date")
);
--> statement-breakpoint
CREATE TABLE "service_cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_id" integer NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"latitude_e6" integer,
	"longitude_e6" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"seo_status" text DEFAULT 'not_ready' NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "service_cities_code_unique" UNIQUE("code"),
	CONSTRAINT "service_cities_seo_status_check" CHECK ("service_cities"."seo_status" in ('not_ready','draft','review','publishable'))
);
--> statement-breakpoint
CREATE TABLE "service_coverage" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer NOT NULL,
	"business_line_id" integer NOT NULL,
	"availability" text DEFAULT 'conditional' NOT NULL,
	"mobilization_days" integer,
	"capacity_level" text DEFAULT 'review_required' NOT NULL,
	"owner_email" text,
	"operating_notes" text,
	"public_approved" boolean DEFAULT false NOT NULL,
	"reviewed_by" text,
	"reviewed_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "service_coverage_availability_check" CHECK ("service_coverage"."availability" in ('available','conditional','unavailable')),
	CONSTRAINT "service_coverage_capacity_check" CHECK ("service_coverage"."capacity_level" in ('high','medium','limited','review_required')),
	CONSTRAINT "service_coverage_mobilization_check" CHECK ("service_coverage"."mobilization_days" is null or "service_coverage"."mobilization_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "service_regions_code_unique" UNIQUE("code"),
	CONSTRAINT "service_regions_name_ar_unique" UNIQUE("name_ar")
);
--> statement-breakpoint
ALTER TABLE "construction_opportunities" ADD CONSTRAINT "construction_opportunities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_opportunities" ADD CONSTRAINT "construction_opportunities_city_id_service_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."service_cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_projects" ADD CONSTRAINT "construction_projects_opportunity_id_construction_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."construction_opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_projects" ADD CONSTRAINT "construction_projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_projects" ADD CONSTRAINT "construction_projects_city_id_service_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."service_cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_cities" ADD CONSTRAINT "service_cities_region_id_service_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."service_regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_coverage" ADD CONSTRAINT "service_coverage_city_id_service_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."service_cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_coverage" ADD CONSTRAINT "service_coverage_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_lines_status_idx" ON "business_lines" USING btree ("status","public_status");--> statement-breakpoint
CREATE INDEX "construction_opportunities_stage_due_idx" ON "construction_opportunities" USING btree ("stage","bid_due_date");--> statement-breakpoint
CREATE INDEX "construction_opportunities_city_idx" ON "construction_opportunities" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "construction_projects_status_end_idx" ON "construction_projects" USING btree ("status","planned_end_date");--> statement-breakpoint
CREATE INDEX "construction_projects_city_idx" ON "construction_projects" USING btree ("city_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_cities_region_name_unique" ON "service_cities" USING btree ("region_id","name_ar");--> statement-breakpoint
CREATE INDEX "service_cities_region_status_idx" ON "service_cities" USING btree ("region_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "service_coverage_city_line_unique" ON "service_coverage" USING btree ("city_id","business_line_id");--> statement-breakpoint
CREATE INDEX "service_coverage_availability_idx" ON "service_coverage" USING btree ("availability","public_approved");--> statement-breakpoint
CREATE INDEX "service_regions_status_sort_idx" ON "service_regions" USING btree ("status","sort_order");
--> statement-breakpoint
ALTER TABLE "business_lines" ENABLE ROW LEVEL SECURITY; ALTER TABLE "service_regions" ENABLE ROW LEVEL SECURITY; ALTER TABLE "service_cities" ENABLE ROW LEVEL SECURITY; ALTER TABLE "service_coverage" ENABLE ROW LEVEL SECURITY; ALTER TABLE "construction_opportunities" ENABLE ROW LEVEL SECURITY; ALTER TABLE "construction_projects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "business_lines", "service_regions", "service_cities", "service_coverage", "construction_opportunities", "construction_projects" FROM anon, authenticated;
--> statement-breakpoint
INSERT INTO "business_lines" ("code","name_ar","description","status","public_status","created_by") VALUES
('construction','المقاولات','إدارة فرص ومشروعات المقاولات ونطاقاتها وتكاليفها الميدانية.','active','draft','system'),
('operations-maintenance','التشغيل والصيانة','عقود التشغيل والصيانة الوقائية والتصحيحية وإدارة مستوى الخدمة.','active','review','system'),
('workforce','توفير القوى العاملة','تخطيط وتوفير وإسناد القوى العاملة حسب المهن والمدن والعقود.','active','published','system')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "service_regions" ("code","name_ar","name_en","sort_order") VALUES
('riyadh','منطقة الرياض','Riyadh',1),('makkah','منطقة مكة المكرمة','Makkah',2),('madinah','منطقة المدينة المنورة','Madinah',3),('qassim','منطقة القصيم','Al-Qassim',4),('eastern','المنطقة الشرقية','Eastern Province',5),('asir','منطقة عسير','Asir',6),('tabuk','منطقة تبوك','Tabuk',7),('hail','منطقة حائل','Hail',8),('northern-borders','منطقة الحدود الشمالية','Northern Borders',9),('jazan','منطقة جازان','Jazan',10),('najran','منطقة نجران','Najran',11),('baha','منطقة الباحة','Al-Baha',12),('jouf','منطقة الجوف','Al-Jouf',13)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "service_cities" ("region_id","code","name_ar","name_en","seo_status") VALUES
((SELECT id FROM service_regions WHERE code='riyadh'),'riyadh-city','الرياض','Riyadh','draft'),
((SELECT id FROM service_regions WHERE code='riyadh'),'diriyah','الدرعية','Diriyah','not_ready'),
((SELECT id FROM service_regions WHERE code='riyadh'),'kharj','الخرج','Al Kharj','not_ready'),
((SELECT id FROM service_regions WHERE code='riyadh'),'majmaah','المجمعة','Al Majmaah','not_ready'),
((SELECT id FROM service_regions WHERE code='riyadh'),'dawadmi','الدوادمي','Al Dawadmi','not_ready'),
((SELECT id FROM service_regions WHERE code='makkah'),'makkah-city','مكة المكرمة','Makkah','review'),
((SELECT id FROM service_regions WHERE code='makkah'),'jeddah','جدة','Jeddah','draft'),
((SELECT id FROM service_regions WHERE code='makkah'),'taif','الطائف','Taif','draft'),
((SELECT id FROM service_regions WHERE code='makkah'),'rabigh','رابغ','Rabigh','not_ready'),
((SELECT id FROM service_regions WHERE code='makkah'),'qunfudhah','القنفذة','Al Qunfudhah','not_ready'),
((SELECT id FROM service_regions WHERE code='madinah'),'madinah-city','المدينة المنورة','Madinah','draft'),
((SELECT id FROM service_regions WHERE code='madinah'),'yanbu','ينبع','Yanbu','draft'),
((SELECT id FROM service_regions WHERE code='madinah'),'ula','العلا','AlUla','not_ready'),
((SELECT id FROM service_regions WHERE code='qassim'),'buraydah','بريدة','Buraidah','draft'),
((SELECT id FROM service_regions WHERE code='qassim'),'unayzah','عنيزة','Unaizah','not_ready'),
((SELECT id FROM service_regions WHERE code='qassim'),'rass','الرس','Ar Rass','not_ready'),
((SELECT id FROM service_regions WHERE code='eastern'),'dammam','الدمام','Dammam','draft'),
((SELECT id FROM service_regions WHERE code='eastern'),'khobar','الخبر','Al Khobar','draft'),
((SELECT id FROM service_regions WHERE code='eastern'),'dhahran','الظهران','Dhahran','draft'),
((SELECT id FROM service_regions WHERE code='eastern'),'jubail','الجبيل','Jubail','draft'),
((SELECT id FROM service_regions WHERE code='eastern'),'ahsa','الأحساء','Al Ahsa','draft'),
((SELECT id FROM service_regions WHERE code='eastern'),'qatif','القطيف','Qatif','not_ready'),
((SELECT id FROM service_regions WHERE code='asir'),'abha','أبها','Abha','draft'),
((SELECT id FROM service_regions WHERE code='asir'),'khamis-mushait','خميس مشيط','Khamis Mushait','draft'),
((SELECT id FROM service_regions WHERE code='asir'),'bisha','بيشة','Bisha','not_ready'),
((SELECT id FROM service_regions WHERE code='tabuk'),'tabuk-city','تبوك','Tabuk','draft'),
((SELECT id FROM service_regions WHERE code='tabuk'),'duba','ضباء','Duba','not_ready'),
((SELECT id FROM service_regions WHERE code='tabuk'),'wajh','الوجه','Al Wajh','not_ready'),
((SELECT id FROM service_regions WHERE code='hail'),'hail-city','حائل','Hail','draft'),
((SELECT id FROM service_regions WHERE code='northern-borders'),'arar','عرعر','Arar','draft'),
((SELECT id FROM service_regions WHERE code='northern-borders'),'rafha','رفحاء','Rafha','not_ready'),
((SELECT id FROM service_regions WHERE code='jazan'),'jazan-city','جازان','Jazan','draft'),
((SELECT id FROM service_regions WHERE code='jazan'),'sabya','صبيا','Sabya','not_ready'),
((SELECT id FROM service_regions WHERE code='najran'),'najran-city','نجران','Najran','draft'),
((SELECT id FROM service_regions WHERE code='baha'),'baha-city','الباحة','Al Baha','draft'),
((SELECT id FROM service_regions WHERE code='baha'),'baljurashi','بلجرشي','Baljurashi','not_ready'),
((SELECT id FROM service_regions WHERE code='jouf'),'sakaka','سكاكا','Sakaka','draft'),
((SELECT id FROM service_regions WHERE code='jouf'),'qurayyat','القريات','Al Qurayyat','not_ready'),
((SELECT id FROM service_regions WHERE code='jouf'),'dumat-jandal','دومة الجندل','Dumat Al Jandal','not_ready')
ON CONFLICT ("code") DO NOTHING;
