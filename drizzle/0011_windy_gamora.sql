CREATE TABLE `accounting_posting_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`debit_account_id` integer NOT NULL,
	`credit_account_id` integer NOT NULL,
	`tax_account_id` integer,
	`active` integer DEFAULT true NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`debit_account_id`) REFERENCES `chart_of_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`credit_account_id`) REFERENCES `chart_of_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tax_account_id`) REFERENCES `chart_of_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounting_posting_rules_event_type_unique` ON `accounting_posting_rules` (`event_type`);--> statement-breakpoint
CREATE INDEX `accounting_posting_rules_active_idx` ON `accounting_posting_rules` (`active`);--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_code` text NOT NULL,
	`bank_name` text NOT NULL,
	`account_name` text NOT NULL,
	`iban` text NOT NULL,
	`currency` text DEFAULT 'SAR' NOT NULL,
	`ledger_account_id` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ledger_account_id`) REFERENCES `chart_of_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bank_accounts_status_check" CHECK("bank_accounts"."status" in ('active','inactive','closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_accounts_account_code_unique` ON `bank_accounts` (`account_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_accounts_iban_unique` ON `bank_accounts` (`iban`);--> statement-breakpoint
CREATE INDEX `bank_accounts_status_idx` ON `bank_accounts` (`status`);--> statement-breakpoint
CREATE TABLE `chart_of_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name_ar` text NOT NULL,
	`account_type` text NOT NULL,
	`normal_balance` text NOT NULL,
	`parent_id` integer,
	`is_posting` integer DEFAULT true NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "chart_of_accounts_type_check" CHECK("chart_of_accounts"."account_type" in ('asset','liability','equity','revenue','expense')),
	CONSTRAINT "chart_of_accounts_balance_check" CHECK("chart_of_accounts"."normal_balance" in ('debit','credit')),
	CONSTRAINT "chart_of_accounts_status_check" CHECK("chart_of_accounts"."status" in ('active','inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chart_of_accounts_code_unique` ON `chart_of_accounts` (`code`);--> statement-breakpoint
CREATE INDEX `chart_of_accounts_parent_idx` ON `chart_of_accounts` (`parent_id`);--> statement-breakpoint
CREATE INDEX `chart_of_accounts_type_status_idx` ON `chart_of_accounts` (`account_type`,`status`);--> statement-breakpoint
CREATE TABLE `fiscal_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period_code` text NOT NULL,
	`name_ar` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_by` text,
	`closed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "fiscal_periods_status_check" CHECK("fiscal_periods"."status" in ('future','open','soft_closed','closed')),
	CONSTRAINT "fiscal_periods_date_check" CHECK("fiscal_periods"."end_date" >= "fiscal_periods"."start_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fiscal_periods_period_code_unique` ON `fiscal_periods` (`period_code`);--> statement-breakpoint
CREATE INDEX `fiscal_periods_dates_idx` ON `fiscal_periods` (`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_number` text NOT NULL,
	`entry_date` text NOT NULL,
	`fiscal_period_id` integer NOT NULL,
	`description` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`reversal_of_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`posted_by` text,
	`posted_at` text,
	`void_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fiscal_period_id`) REFERENCES `fiscal_periods`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "journal_entries_status_check" CHECK("journal_entries"."status" in ('draft','approved','posted','reversed','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_entry_number_unique` ON `journal_entries` (`entry_number`);--> statement-breakpoint
CREATE INDEX `journal_entries_period_status_idx` ON `journal_entries` (`fiscal_period_id`,`status`);--> statement-breakpoint
CREATE INDEX `journal_entries_source_idx` ON `journal_entries` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `journal_entries_date_idx` ON `journal_entries` (`entry_date`);--> statement-breakpoint
CREATE TABLE `journal_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`journal_entry_id` integer NOT NULL,
	`line_number` integer NOT NULL,
	`account_id` integer NOT NULL,
	`description` text,
	`debit_halalas` integer DEFAULT 0 NOT NULL,
	`credit_halalas` integer DEFAULT 0 NOT NULL,
	`client_id` integer,
	`contract_id` integer,
	`worker_id` integer,
	`employee_id` integer,
	`cost_center_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `chart_of_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contract_id`) REFERENCES `workforce_contracts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "journal_lines_amount_check" CHECK("journal_lines"."debit_halalas" >= 0 and "journal_lines"."credit_halalas" >= 0 and (("journal_lines"."debit_halalas" > 0 and "journal_lines"."credit_halalas" = 0) or ("journal_lines"."credit_halalas" > 0 and "journal_lines"."debit_halalas" = 0)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_lines_entry_line_unique` ON `journal_lines` (`journal_entry_id`,`line_number`);--> statement-breakpoint
CREATE INDEX `journal_lines_account_idx` ON `journal_lines` (`account_id`);--> statement-breakpoint
CREATE INDEX `journal_lines_contract_idx` ON `journal_lines` (`contract_id`);