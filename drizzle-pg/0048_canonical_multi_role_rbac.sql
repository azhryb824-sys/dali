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

-- Approval, posting, payment, and administration remain exclusive to owner/admin.
UPDATE public.portal_roles role
SET permissions_json = COALESCE((
  SELECT jsonb_agg(permission ORDER BY permission)::text
  FROM jsonb_array_elements_text(role.permissions_json::jsonb) AS item(permission)
  WHERE permission <> '*'
    AND permission !~ E'\\.(approve|post|pay|administer)$'
), '[]'),
updated_at = CURRENT_TIMESTAMP::text
WHERE role.role_key NOT IN ('system_owner','system_admin');

-- Existing explicit overrides are normalized to the union of active assigned roles.
UPDATE public.portal_user_permissions permission
SET allowed = EXISTS (
  SELECT 1
  FROM public.portal_access_scopes scope
  JOIN public.portal_roles role ON role.role_key = scope.functional_role AND role.active = true
  CROSS JOIN LATERAL jsonb_array_elements_text(role.permissions_json::jsonb) AS item(grant_name)
  WHERE scope.user_email = permission.user_email
    AND scope.active = true
    AND grant_name = permission.resource || '.' || permission.action
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.portal_access_scopes root_scope
  WHERE root_scope.user_email = permission.user_email
    AND root_scope.active = true
    AND root_scope.functional_role IN ('system_owner','system_admin')
);

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
