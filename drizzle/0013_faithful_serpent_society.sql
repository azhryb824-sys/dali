CREATE TABLE `employee_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`movement_type` text NOT NULL,
	`effective_date` text NOT NULL,
	`amount_halalas` integer DEFAULT 0 NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "employee_movements_type_check" CHECK("employee_movements"."movement_type" in ('salary_adjustment','allowance','bonus','advance','deduction','leave','return_from_leave','suspension','termination','note')),
	CONSTRAINT "employee_movements_status_check" CHECK("employee_movements"."status" in ('draft','approved','cancelled')),
	CONSTRAINT "employee_movements_amount_check" CHECK("employee_movements"."amount_halalas" >= 0)
);
--> statement-breakpoint
CREATE INDEX `employee_movements_employee_date_idx` ON `employee_movements` (`employee_id`,`effective_date`);--> statement-breakpoint
CREATE INDEX `employee_movements_type_status_idx` ON `employee_movements` (`movement_type`,`status`);--> statement-breakpoint
CREATE TABLE `payroll_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payroll_run_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`base_salary_halalas` integer NOT NULL,
	`allowances_halalas` integer DEFAULT 0 NOT NULL,
	`bonus_halalas` integer DEFAULT 0 NOT NULL,
	`deductions_halalas` integer DEFAULT 0 NOT NULL,
	`net_pay_halalas` integer NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payroll_items_amounts_check" CHECK("payroll_items"."base_salary_halalas" >= 0 and "payroll_items"."allowances_halalas" >= 0 and "payroll_items"."bonus_halalas" >= 0 and "payroll_items"."deductions_halalas" >= 0 and "payroll_items"."net_pay_halalas" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_items_run_employee_idx` ON `payroll_items` (`payroll_run_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `payroll_items_employee_idx` ON `payroll_items` (`employee_id`);--> statement-breakpoint
CREATE TABLE `payroll_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_number` text NOT NULL,
	`period_month` text NOT NULL,
	`payment_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`total_gross_halalas` integer DEFAULT 0 NOT NULL,
	`total_deductions_halalas` integer DEFAULT 0 NOT NULL,
	`total_net_halalas` integer DEFAULT 0 NOT NULL,
	`journal_entry_id` integer,
	`payment_journal_entry_id` integer,
	`created_by` text NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`paid_by` text,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "payroll_runs_status_check" CHECK("payroll_runs"."status" in ('draft','approved','processing','paid','cancelled')),
	CONSTRAINT "payroll_runs_totals_check" CHECK("payroll_runs"."total_gross_halalas" >= 0 and "payroll_runs"."total_deductions_halalas" >= 0 and "payroll_runs"."total_net_halalas" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_runs_run_number_unique` ON `payroll_runs` (`run_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_runs_period_month_unique` ON `payroll_runs` (`period_month`);--> statement-breakpoint
CREATE INDEX `payroll_runs_status_payment_idx` ON `payroll_runs` (`status`,`payment_date`);--> statement-breakpoint
ALTER TABLE `employees` ADD `email` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `national_id` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `nationality` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `bank_name` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `iban` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `base_salary_halalas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `housing_allowance_halalas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `transport_allowance_halalas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `other_allowance_halalas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `annual_leave_days` integer DEFAULT 21 NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `leave_balance_days` integer DEFAULT 21 NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `probation_end_date` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `contract_end_date` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `termination_date` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `termination_reason` text;