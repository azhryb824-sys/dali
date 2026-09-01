-- Activate portal identities for field representatives with least privilege.
-- Representative master records remain linked by the user's normalized email.
INSERT INTO public.portal_roles
  (role_key, label_ar, description, permissions_json, protected, active, created_by, updated_at)
VALUES
  (
    'sales_representative',
    'مندوب مبيعات',
    'إرسال طلبات العملاء ومتابعة طلباته فقط دون اعتماد أو وصول لبقية بيانات التشغيل.',
    '["overview.read","representatives.read","representatives.write"]',
    false,
    true,
    'system',
    CURRENT_TIMESTAMP::text
  ),
  (
    'purchasing_representative',
    'مندوب مشتريات',
    'إرسال طلبات الشراء ومتابعة طلباته فقط دون اعتماد أو وصول للحسابات.',
    '["overview.read","representatives.read","representatives.write"]',
    false,
    true,
    'system',
    CURRENT_TIMESTAMP::text
  )
ON CONFLICT (role_key) DO UPDATE SET
  label_ar = EXCLUDED.label_ar,
  description = EXCLUDED.description,
  permissions_json = EXCLUDED.permissions_json,
  protected = false,
  active = true,
  updated_at = CURRENT_TIMESTAMP::text;

INSERT INTO private.__dali_migrations (name)
VALUES ('0063_representative_portal_roles.sql')
ON CONFLICT (name) DO NOTHING;
