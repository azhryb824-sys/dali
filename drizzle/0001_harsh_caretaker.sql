CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_number` text NOT NULL,
	`full_name` text NOT NULL,
	`job_title` text NOT NULL,
	`department` text NOT NULL,
	`mobile` text NOT NULL,
	`hire_date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_number_unique` ON `employees` (`employee_number`);--> statement-breakpoint
CREATE INDEX `employees_status_idx` ON `employees` (`status`);--> statement-breakpoint
CREATE INDEX `employees_department_idx` ON `employees` (`department`);--> statement-breakpoint
CREATE TABLE `financial_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_code` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`amount_halalas` integer NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_records_reference_code_unique` ON `financial_records` (`reference_code`);--> statement-breakpoint
CREATE INDEX `financial_records_status_idx` ON `financial_records` (`status`);--> statement-breakpoint
CREATE INDEX `financial_records_due_date_idx` ON `financial_records` (`due_date`);--> statement-breakpoint
CREATE TABLE `legal_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_code` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`counterparty` text NOT NULL,
	`expiry_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_records_reference_code_unique` ON `legal_records` (`reference_code`);--> statement-breakpoint
CREATE INDEX `legal_records_status_idx` ON `legal_records` (`status`);--> statement-breakpoint
CREATE INDEX `legal_records_expiry_date_idx` ON `legal_records` (`expiry_date`);--> statement-breakpoint
CREATE TABLE `workers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`worker_number` text NOT NULL,
	`full_name` text NOT NULL,
	`nationality` text NOT NULL,
	`profession` text NOT NULL,
	`client_site` text NOT NULL,
	`iqama_expiry` text,
	`status` text DEFAULT 'available' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workers_worker_number_unique` ON `workers` (`worker_number`);--> statement-breakpoint
CREATE INDEX `workers_status_idx` ON `workers` (`status`);--> statement-breakpoint
CREATE INDEX `workers_profession_idx` ON `workers` (`profession`);--> statement-breakpoint
CREATE INDEX `workers_iqama_expiry_idx` ON `workers` (`iqama_expiry`);--> statement-breakpoint
ALTER TABLE `portal_users` ADD `department` text DEFAULT 'general' NOT NULL;--> statement-breakpoint
CREATE INDEX `portal_users_department_idx` ON `portal_users` (`department`);