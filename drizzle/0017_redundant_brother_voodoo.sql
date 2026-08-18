ALTER TABLE `financial_records` ADD `subtotal_halalas` integer;--> statement-breakpoint
ALTER TABLE `financial_records` ADD `vat_halalas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `financial_records` ADD `vat_rate_bps` integer DEFAULT 0 NOT NULL;