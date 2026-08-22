CREATE TABLE IF NOT EXISTS "contract_payment_schedules" (
  "id" serial PRIMARY KEY NOT NULL,
  "contract_id" integer NOT NULL,
  "installment_number" integer NOT NULL,
  "title" text NOT NULL,
  "due_date" text NOT NULL,
  "percentage_bps" integer NOT NULL,
  "amount_halalas" integer NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "referred_by" text,
  "referred_at" text,
  "invoice_document_id" integer,
  "financial_record_id" integer,
  "invoiced_by" text,
  "invoiced_at" text,
  "paid_at" text,
  "created_by" text NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "contract_payment_schedules_contract_installment_unique" UNIQUE("contract_id","installment_number"),
  CONSTRAINT "contract_payment_schedules_invoice_unique" UNIQUE("invoice_document_id"),
  CONSTRAINT "contract_payment_schedules_status_check" CHECK ("status" in ('scheduled','due','referred','invoiced','paid','cancelled')),
  CONSTRAINT "contract_payment_schedules_amount_check" CHECK ("amount_halalas" > 0 and "percentage_bps" > 0 and "percentage_bps" <= 10000)
);
ALTER TABLE "contract_payment_schedules" DROP CONSTRAINT IF EXISTS "contract_payment_schedules_contract_id_workforce_contracts_id_fk";
ALTER TABLE "contract_payment_schedules" ADD CONSTRAINT "contract_payment_schedules_contract_id_workforce_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."workforce_contracts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contract_payment_schedules" DROP CONSTRAINT IF EXISTS "contract_payment_schedules_invoice_document_id_company_documents_id_fk";
ALTER TABLE "contract_payment_schedules" ADD CONSTRAINT "contract_payment_schedules_invoice_document_id_company_documents_id_fk" FOREIGN KEY ("invoice_document_id") REFERENCES "public"."company_documents"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "contract_payment_schedules" DROP CONSTRAINT IF EXISTS "contract_payment_schedules_financial_record_id_financial_records_id_fk";
ALTER TABLE "contract_payment_schedules" ADD CONSTRAINT "contract_payment_schedules_financial_record_id_financial_records_id_fk" FOREIGN KEY ("financial_record_id") REFERENCES "public"."financial_records"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "contract_payment_schedules_due_status_idx" ON "contract_payment_schedules" USING btree ("due_date","status");

ALTER TABLE public.contract_payment_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contract_payment_schedules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.contract_payment_schedules_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contract_payment_schedules TO dali_app;
GRANT USAGE, SELECT ON SEQUENCE public.contract_payment_schedules_id_seq TO dali_app;
DROP POLICY IF EXISTS contract_payment_schedules_server_access ON public.contract_payment_schedules;
CREATE POLICY contract_payment_schedules_server_access ON public.contract_payment_schedules AS PERMISSIVE FOR ALL TO dali_app USING (true) WITH CHECK (true);

INSERT INTO private.__dali_migrations (name) VALUES ('0014_contract_payment_invoicing.sql') ON CONFLICT (name) DO NOTHING;
