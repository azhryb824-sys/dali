ALTER TABLE "sales_opportunities" ADD COLUMN IF NOT EXISTS "sales_representative_id" integer;

DO $$ BEGIN
  ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_sales_representative_id_sales_representatives_id_fk"
    FOREIGN KEY ("sales_representative_id") REFERENCES "public"."sales_representatives"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "sales_opportunities_representative_idx" ON "sales_opportunities" USING btree ("sales_representative_id");
