PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_financial_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_code` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`amount_halalas` integer NOT NULL,
	`due_date` text NOT NULL,
	`worker_id` integer,
	`contract_id` integer,
	`document_id` integer,
	`journal_entry_id` integer,
	`posting_status` text DEFAULT 'unposted' NOT NULL,
	`posted_at` text,
	`period_month` text,
	`sub_category` text,
	`payment_method` text,
	`notes` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "financial_records_posting_status_check" CHECK("__new_financial_records"."posting_status" in ('unposted','draft','posted','reversed','not_applicable'))
);
--> statement-breakpoint
INSERT INTO `__new_financial_records`("id", "reference_code", "category", "description", "amount_halalas", "due_date", "worker_id", "contract_id", "document_id", "journal_entry_id", "posting_status", "posted_at", "period_month", "sub_category", "payment_method", "notes", "status", "created_at", "updated_at") SELECT "id", "reference_code", "category", "description", "amount_halalas", "due_date", "worker_id", "contract_id", "document_id", NULL, 'unposted', NULL, "period_month", "sub_category", "payment_method", "notes", "status", "created_at", "updated_at" FROM `financial_records`;--> statement-breakpoint
DROP TABLE `financial_records`;--> statement-breakpoint
ALTER TABLE `__new_financial_records` RENAME TO `financial_records`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `financial_records_reference_code_unique` ON `financial_records` (`reference_code`);--> statement-breakpoint
CREATE INDEX `financial_records_status_idx` ON `financial_records` (`status`);--> statement-breakpoint
CREATE INDEX `financial_records_due_date_idx` ON `financial_records` (`due_date`);--> statement-breakpoint
CREATE INDEX `financial_records_category_idx` ON `financial_records` (`category`);--> statement-breakpoint
CREATE INDEX `financial_records_worker_id_idx` ON `financial_records` (`worker_id`);--> statement-breakpoint
CREATE INDEX `financial_records_contract_id_idx` ON `financial_records` (`contract_id`);--> statement-breakpoint
CREATE INDEX `financial_records_document_id_idx` ON `financial_records` (`document_id`);--> statement-breakpoint
CREATE INDEX `financial_records_period_month_idx` ON `financial_records` (`period_month`);--> statement-breakpoint
CREATE INDEX `financial_records_posting_status_idx` ON `financial_records` (`posting_status`);
