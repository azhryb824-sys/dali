ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "residency_type" text;

UPDATE "employees"
SET "residency_type" = CASE
  WHEN "national_id" LIKE '1%' THEN 'citizen'
  WHEN lower(trim(coalesce("nationality", ''))) IN ('سعودي', 'سعودية', 'السعودية', 'saudi', 'saudi arabian') THEN 'citizen'
  ELSE 'resident'
END
WHERE "residency_type" IS NULL;

ALTER TABLE "employees"
  ALTER COLUMN "residency_type" SET DEFAULT 'resident',
  ALTER COLUMN "residency_type" SET NOT NULL;

ALTER TABLE "employees"
  DROP CONSTRAINT IF EXISTS "employees_residency_type_check";

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_residency_type_check"
  CHECK ("residency_type" IN ('citizen', 'resident'));

ALTER TABLE "contract_payment_schedules"
  ADD COLUMN IF NOT EXISTS "title_en" text;

UPDATE "contract_payment_schedules"
SET "title_en" = CASE
  WHEN "title" = 'الدفعة الأولى' THEN 'First installment'
  WHEN "title" = 'الدفعة الثانية' THEN 'Second installment'
  WHEN "title" = 'الدفعة الأخيرة' THEN 'Final installment'
  WHEN "title" LIKE 'استحقاق رواتب شهر %' THEN
    'Salary installment for ' || substring("title" FROM char_length('استحقاق رواتب شهر ') + 1)
  ELSE "title_en"
END
WHERE "title_en" IS NULL;
