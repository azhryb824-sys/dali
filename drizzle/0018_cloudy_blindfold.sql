CREATE TABLE `bank_reconciliations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reconciliation_number` text NOT NULL,
	`bank_account_id` integer NOT NULL,
	`statement_date` text NOT NULL,
	`statement_balance_halalas` integer NOT NULL,
	`ledger_balance_halalas` integer NOT NULL,
	`outstanding_deposits_halalas` integer DEFAULT 0 NOT NULL,
	`outstanding_payments_halalas` integer DEFAULT 0 NOT NULL,
	`difference_halalas` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text,
	`created_by` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bank_reconciliations_status_check" CHECK("bank_reconciliations"."status" in ('draft','reviewed','closed','cancelled')),
	CONSTRAINT "bank_reconciliations_outstanding_check" CHECK("bank_reconciliations"."outstanding_deposits_halalas" >= 0 and "bank_reconciliations"."outstanding_payments_halalas" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_reconciliations_reconciliation_number_unique` ON `bank_reconciliations` (`reconciliation_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_reconciliations_bank_date_unique` ON `bank_reconciliations` (`bank_account_id`,`statement_date`);--> statement-breakpoint
CREATE INDEX `bank_reconciliations_status_date_idx` ON `bank_reconciliations` (`status`,`statement_date`);