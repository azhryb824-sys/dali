ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS actual_salary_halalas integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.quote_items.actual_salary_halalas IS
  'Internal worker salary used when converting a workforce quotation to a contract; never printed for the client.';
