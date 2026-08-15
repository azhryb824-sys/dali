CREATE TABLE `contract_professions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_id` integer NOT NULL,
	`profession` text NOT NULL,
	`required_count` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contract_professions_contract_profession_unique` ON `contract_professions` (`contract_id`,`profession`);--> statement-breakpoint
CREATE INDEX `contract_professions_contract_id_idx` ON `contract_professions` (`contract_id`);--> statement-breakpoint
CREATE INDEX `contract_professions_profession_idx` ON `contract_professions` (`profession`);--> statement-breakpoint
CREATE TABLE `contract_worker_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_id` integer NOT NULL,
	`contract_profession_id` integer NOT NULL,
	`worker_id` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`assigned_by` text NOT NULL,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`released_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contract_worker_assignments_contract_worker_unique` ON `contract_worker_assignments` (`contract_id`,`worker_id`);--> statement-breakpoint
CREATE INDEX `contract_worker_assignments_contract_id_idx` ON `contract_worker_assignments` (`contract_id`);--> statement-breakpoint
CREATE INDEX `contract_worker_assignments_profession_id_idx` ON `contract_worker_assignments` (`contract_profession_id`);--> statement-breakpoint
CREATE INDEX `contract_worker_assignments_worker_id_idx` ON `contract_worker_assignments` (`worker_id`);--> statement-breakpoint
CREATE INDEX `contract_worker_assignments_status_idx` ON `contract_worker_assignments` (`status`);--> statement-breakpoint
CREATE TABLE `workforce_contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_code` text NOT NULL,
	`document_id` integer NOT NULL,
	`client_name` text NOT NULL,
	`client_cr` text,
	`client_vat` text,
	`title` text NOT NULL,
	`work_site` text NOT NULL,
	`issue_date` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`amount_halalas` integer DEFAULT 0 NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workforce_contracts_reference_code_unique` ON `workforce_contracts` (`reference_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `workforce_contracts_document_id_unique` ON `workforce_contracts` (`document_id`);--> statement-breakpoint
CREATE INDEX `workforce_contracts_client_name_idx` ON `workforce_contracts` (`client_name`);--> statement-breakpoint
CREATE INDEX `workforce_contracts_status_idx` ON `workforce_contracts` (`status`);--> statement-breakpoint
CREATE INDEX `workforce_contracts_end_date_idx` ON `workforce_contracts` (`end_date`);--> statement-breakpoint
ALTER TABLE `financial_records` ADD `worker_id` integer;--> statement-breakpoint
ALTER TABLE `financial_records` ADD `contract_id` integer;--> statement-breakpoint
ALTER TABLE `financial_records` ADD `document_id` integer;--> statement-breakpoint
ALTER TABLE `financial_records` ADD `period_month` text;--> statement-breakpoint
ALTER TABLE `financial_records` ADD `sub_category` text;--> statement-breakpoint
ALTER TABLE `financial_records` ADD `payment_method` text;--> statement-breakpoint
ALTER TABLE `financial_records` ADD `notes` text;--> statement-breakpoint
CREATE INDEX `financial_records_category_idx` ON `financial_records` (`category`);--> statement-breakpoint
CREATE INDEX `financial_records_worker_id_idx` ON `financial_records` (`worker_id`);--> statement-breakpoint
CREATE INDEX `financial_records_contract_id_idx` ON `financial_records` (`contract_id`);--> statement-breakpoint
CREATE INDEX `financial_records_document_id_idx` ON `financial_records` (`document_id`);--> statement-breakpoint
CREATE INDEX `financial_records_period_month_idx` ON `financial_records` (`period_month`);