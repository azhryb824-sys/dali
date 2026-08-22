ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "season_type" text NOT NULL DEFAULT 'regular';
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "billing_mode" text NOT NULL DEFAULT 'monthly';
ALTER TABLE "workforce_contracts" ADD COLUMN IF NOT EXISTS "first_payment_due_date" text;
ALTER TABLE "contract_professions" ADD COLUMN IF NOT EXISTS "unit_salary_halalas" integer NOT NULL DEFAULT 0;
ALTER TABLE "contract_payment_schedules" ADD COLUMN IF NOT EXISTS "subtotal_halalas" integer NOT NULL DEFAULT 0;
ALTER TABLE "contract_payment_schedules" ADD COLUMN IF NOT EXISTS "vat_halalas" integer NOT NULL DEFAULT 0;
ALTER TABLE "contract_payment_schedules" ADD COLUMN IF NOT EXISTS "vat_rate_bps" integer NOT NULL DEFAULT 0;
ALTER TABLE "contract_payment_schedules" ADD COLUMN IF NOT EXISTS "billing_basis" text NOT NULL DEFAULT 'seasonal_percentage';
ALTER TABLE "contract_payment_schedules" ADD COLUMN IF NOT EXISTS "service_period" text;

UPDATE "contract_payment_schedules"
SET "subtotal_halalas" = CASE WHEN "subtotal_halalas" = 0 THEN "amount_halalas" ELSE "subtotal_halalas" END
WHERE "subtotal_halalas" = 0;

ALTER TABLE "workforce_contracts" DROP CONSTRAINT IF EXISTS "workforce_contracts_season_type_check";
ALTER TABLE "workforce_contracts" ADD CONSTRAINT "workforce_contracts_season_type_check" CHECK ("season_type" IN ('regular','ramadan','hajj'));
ALTER TABLE "workforce_contracts" DROP CONSTRAINT IF EXISTS "workforce_contracts_billing_mode_check";
ALTER TABLE "workforce_contracts" ADD CONSTRAINT "workforce_contracts_billing_mode_check" CHECK ("billing_mode" IN ('monthly','seasonal_installments','actual_usage'));
ALTER TABLE "contract_payment_schedules" DROP CONSTRAINT IF EXISTS "contract_payment_schedules_billing_basis_check";
ALTER TABLE "contract_payment_schedules" ADD CONSTRAINT "contract_payment_schedules_billing_basis_check" CHECK ("billing_basis" IN ('monthly_salary','seasonal_percentage','actual_usage'));
ALTER TABLE "contract_payment_schedules" DROP CONSTRAINT IF EXISTS "contract_payment_schedules_tax_math_check";
ALTER TABLE "contract_payment_schedules" ADD CONSTRAINT "contract_payment_schedules_tax_math_check" CHECK ("amount_halalas" = "subtotal_halalas" + "vat_halalas");
ALTER TABLE "contract_professions" DROP CONSTRAINT IF EXISTS "contract_professions_salary_check";
ALTER TABLE "contract_professions" ADD CONSTRAINT "contract_professions_salary_check" CHECK ("unit_salary_halalas" >= 0);
CREATE INDEX IF NOT EXISTS "contract_payment_schedules_service_period_idx" ON "contract_payment_schedules" ("contract_id", "service_period");
