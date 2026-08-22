CREATE TABLE IF NOT EXISTS "portal_roles" (
  "role_key" text PRIMARY KEY NOT NULL,
  "label_ar" text NOT NULL,
  "description" text,
  "permissions_json" text DEFAULT '[]' NOT NULL,
  "protected" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" text NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "portal_roles_key_check" CHECK ("portal_roles"."role_key" ~ '^[a-z][a-z0-9_]{2,63}$')
);
CREATE INDEX IF NOT EXISTS "portal_roles_active_idx" ON "portal_roles" USING btree ("active");

INSERT INTO "portal_roles" ("role_key", "label_ar", "description", "permissions_json", "protected", "created_by") VALUES
('system_owner','مالك النظام','الحوكمة العليا وإدارة النظام كاملة.','["*"]',true,'system'),
('system_admin','مشرف النظام','إدارة النظام بصلاحية شاملة كاملة.','["*"]',true,'system'),
('executive','المدير التنفيذي','الاطلاع التنفيذي واعتماد الإجراءات العليا.','["overview.read","employees.read","finance.read","legal.read","workforce.read","construction.read","reports.read","reports.export"]',false,'system'),
('construction_director','مدير قطاع المقاولات','إدارة واعتماد قطاع المقاولات.','["overview.read","construction.read","construction.write","construction.approve","finance.read","legal.read","workforce.read","documents.read","documents.write","reports.read"]',false,'system'),
('workforce_operations_manager','مدير العمليات والعمالة','إدارة تشغيل القوى العاملة.','["overview.read","workforce.read","workforce.write","workforce.approve","employees.read","finance.read","documents.read"]',false,'system'),
('finance_director','المدير المالي','إدارة واعتماد وترحيل الأعمال المالية.','["overview.read","finance.read","finance.write","finance.approve","finance.post","legal.read","construction.read","workforce.read","documents.read","documents.write","reports.read","reports.export"]',false,'system'),
('project_manager','مدير مشروع','إدارة سجلات ونطاق مشروع محدد.','["overview.read","construction.read","construction.write","construction.approve","workforce.read","finance.read","documents.read","documents.write"]',false,'system'),
('site_engineer','مهندس موقع','السجلات الميدانية والفنية للمشروع.','["overview.read","construction.read","construction.write","documents.read"]',false,'system'),
('planning_engineer','مهندس تخطيط','خطط ومواعيد وتقارير المشروع.','["overview.read","construction.read","construction.write","reports.read"]',false,'system'),
('cost_engineer','مهندس تكاليف وحصر','التقديرات والكميات والتكاليف.','["overview.read","construction.read","construction.write","finance.read","reports.read"]',false,'system'),
('contracts_manager','مسؤول العقود والمطالبات','العقود والمطالبات والمراجعة القانونية.','["overview.read","construction.read","construction.write","legal.read","legal.write","legal.approve","finance.read","documents.read","documents.write","documents.share"]',false,'system'),
('procurement_officer','مسؤول المشتريات','الموردون وأوامر الشراء والمرفقات.','["overview.read","construction.read","construction.write","finance.read","finance.write","documents.read","documents.write"]',false,'system'),
('project_accountant','محاسب مشروع','إدخال المعاملات وإعداد التقارير دون اعتماد ذاتي.','["overview.read","construction.read","finance.read","finance.write","documents.read","reports.read"]',false,'system'),
('document_controller','مراقب مستندات','إصدار وضبط ومشاركة المستندات.','["overview.read","construction.read","construction.write","legal.read","documents.read","documents.write","documents.share"]',false,'system'),
('quality_officer','مسؤول الجودة','الفحوصات والجودة وعدم المطابقة.','["overview.read","construction.read","construction.write","documents.read"]',false,'system'),
('safety_officer','مسؤول السلامة','سجلات السلامة والمخاطر.','["overview.read","construction.read","construction.write","documents.read"]',false,'system'),
('hr_officer','مسؤول الموارد البشرية','إدارة بيانات الموظفين.','["overview.read","employees.read","employees.write","employees.approve","workforce.read","documents.read"]',false,'system'),
('regional_manager','مسؤول المنطقة أو المدينة','إدارة العمليات ضمن نطاق جغرافي.','["overview.read","construction.read","construction.write","workforce.read","workforce.write","workforce.approve","documents.read"]',false,'system'),
('client_consultant','عميل أو استشاري','عرض نطاق المشروع والمستندات المسموح بها.','["overview.read","construction.read","documents.read"]',false,'system'),
('subcontractor','مقاول باطن','عرض وتحديث الأعمال المسندة في النطاق.','["overview.read","construction.read","construction.write","documents.read"]',false,'system')
ON CONFLICT ("role_key") DO NOTHING;

ALTER TABLE public.portal_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_roles TO dali_app;
DROP POLICY IF EXISTS portal_roles_server_access ON public.portal_roles;
CREATE POLICY portal_roles_server_access ON public.portal_roles AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true);

INSERT INTO private.__dali_migrations (name) VALUES ('0013_dynamic_portal_roles.sql') ON CONFLICT (name) DO NOTHING;
