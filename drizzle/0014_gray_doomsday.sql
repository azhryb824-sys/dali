CREATE TABLE `compliance_obligations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`obligation_code` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`authority` text NOT NULL,
	`owner_department` text NOT NULL,
	`issue_date` text,
	`expiry_date` text NOT NULL,
	`reminder_days` integer DEFAULT 30 NOT NULL,
	`risk_level` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`document_id` integer,
	`legal_record_id` integer,
	`notes` text,
	`created_by` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`legal_record_id`) REFERENCES `legal_records`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "compliance_obligations_category_check" CHECK("compliance_obligations"."category" in ('license','certificate','insurance','labor','tax','municipal','contractual','data_protection','safety','other')),
	CONSTRAINT "compliance_obligations_risk_check" CHECK("compliance_obligations"."risk_level" in ('low','medium','high','critical')),
	CONSTRAINT "compliance_obligations_status_check" CHECK("compliance_obligations"."status" in ('draft','active','under_review','renewal','expired','suspended','closed')),
	CONSTRAINT "compliance_obligations_reminder_check" CHECK("compliance_obligations"."reminder_days" between 1 and 365)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compliance_obligations_obligation_code_unique` ON `compliance_obligations` (`obligation_code`);--> statement-breakpoint
CREATE INDEX `compliance_obligations_expiry_status_idx` ON `compliance_obligations` (`expiry_date`,`status`);--> statement-breakpoint
CREATE INDEX `compliance_obligations_category_risk_idx` ON `compliance_obligations` (`category`,`risk_level`);--> statement-breakpoint
CREATE TABLE `compliance_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`obligation_id` integer NOT NULL,
	`review_date` text NOT NULL,
	`outcome` text NOT NULL,
	`notes` text NOT NULL,
	`next_review_date` text,
	`reviewed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`obligation_id`) REFERENCES `compliance_obligations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "compliance_reviews_outcome_check" CHECK("compliance_reviews"."outcome" in ('compliant','action_required','renewal_required','non_compliant','closed'))
);
--> statement-breakpoint
CREATE INDEX `compliance_reviews_obligation_date_idx` ON `compliance_reviews` (`obligation_id`,`review_date`);