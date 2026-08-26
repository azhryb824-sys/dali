-- Canonical operational RBAC. Additive: no users, assignments, or custom roles are deleted.
INSERT INTO public.portal_roles
  (role_key, label_ar, description, permissions_json, protected, active, created_by, updated_at)
VALUES
  ('system_owner','مالك النظام','جميع الصلاحيات والاعتمادات وإدارة المستخدمين.','["*"]',true,true,'system',CURRENT_TIMESTAMP::text),
  ('system_admin','المشرف','جميع الصلاحيات والاعتمادات وإدارة المستخدمين.','["*"]',true,true,'system',CURRENT_TIMESTAMP::text),
  ('hr_officer','موظف شؤون الموظفين','إدارة الموظفين فقط دون اعتماد.','["overview.read","employees.read","employees.write"]',false,true,'system',CURRENT_TIMESTAMP::text),
  ('accountant','المحاسب','تشغيل النظام المالي دون اعتماد أو دفع أو ترحيل نهائي.','["overview.read","finance.read","finance.write"]',false,true,'system',CURRENT_TIMESTAMP::text),
  ('government_relations_officer','السكرتير','إدارة العلاقات الحكومية فقط دون اعتماد أو عرض بيانات الدخول المحمية.','["overview.read","government.read","government.write"]',false,true,'system',CURRENT_TIMESTAMP::text),
  ('administrative_assistant','المساعد الإداري','إدارة العقود وعروض الأسعار والخطابات بالكامل دون اعتماد.','["overview.read","operations.read","operations.write","contracts.read","contracts.write","documents.read","documents.preview","documents.write","documents.share"]',false,true,'system',CURRENT_TIMESTAMP::text),
  ('lawyer','محامي','إدارة الشؤون القانونية دون اعتماد.','["overview.read","legal.read","legal.write","documents.read","documents.preview"]',false,true,'system',CURRENT_TIMESTAMP::text)
ON CONFLICT (role_key) DO UPDATE SET
  label_ar = EXCLUDED.label_ar,
  description = EXCLUDED.description,
  permissions_json = EXCLUDED.permissions_json,
  protected = EXCLUDED.protected,
  active = true,
  updated_at = CURRENT_TIMESTAMP::text;

-- Elevated roles remain impossible to weaken through an old database definition.
UPDATE public.portal_users
SET role = 'admin', department = 'general', updated_at = CURRENT_TIMESTAMP::text
WHERE email IN (
  SELECT user_email FROM public.portal_access_scopes
  WHERE active = true AND functional_role IN ('system_owner','system_admin')
);

INSERT INTO private.__dali_migrations (name)
VALUES ('0048_canonical_multi_role_rbac.sql')
ON CONFLICT (name) DO NOTHING;
