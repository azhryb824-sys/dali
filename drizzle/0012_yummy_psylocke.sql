CREATE TABLE `contract_clauses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_id` integer NOT NULL,
	`clause_number` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`is_optional` integer DEFAULT false NOT NULL,
	`is_included` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `workforce_contracts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contract_clauses_number_unique` ON `contract_clauses` (`contract_id`,`clause_number`);--> statement-breakpoint
CREATE INDEX `contract_clauses_contract_idx` ON `contract_clauses` (`contract_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workforce_contracts` (
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
	`status` text DEFAULT 'draft' NOT NULL,
	`version_number` integer DEFAULT 1 NOT NULL,
	`parent_contract_id` integer,
	`amendment_type` text,
	`approved_by` text,
	`approved_at` text,
	`signed_at` text,
	`effective_at` text,
	`suspended_at` text,
	`terminated_at` text,
	`cancellation_reason` text,
	`client_id` integer,
	`opportunity_id` integer,
	`quote_version_id` integer,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "workforce_contracts_status_check" CHECK("__new_workforce_contracts"."status" in ('draft','internal_review','legal_review','approved','sent','signed','active','suspended','expired','terminated','cancelled','superseded'))
);
--> statement-breakpoint
INSERT INTO `__new_workforce_contracts`("id", "reference_code", "document_id", "client_name", "client_cr", "client_vat", "title", "work_site", "issue_date", "start_date", "end_date", "amount_halalas", "details", "status", "version_number", "parent_contract_id", "amendment_type", "approved_by", "approved_at", "signed_at", "effective_at", "suspended_at", "terminated_at", "cancellation_reason", "client_id", "opportunity_id", "quote_version_id", "created_by", "created_at", "updated_at") SELECT "id", "reference_code", "document_id", "client_name", "client_cr", "client_vat", "title", "work_site", "issue_date", "start_date", "end_date", "amount_halalas", "details", CASE WHEN "status" = 'active' THEN 'active' ELSE 'draft' END, 1, NULL, NULL, NULL, NULL, NULL, CASE WHEN "status" = 'active' THEN "start_date" ELSE NULL END, NULL, NULL, NULL, "client_id", "opportunity_id", "quote_version_id", "created_by", "created_at", "updated_at" FROM `workforce_contracts`;--> statement-breakpoint
DROP TABLE `workforce_contracts`;--> statement-breakpoint
ALTER TABLE `__new_workforce_contracts` RENAME TO `workforce_contracts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `workforce_contracts_reference_code_unique` ON `workforce_contracts` (`reference_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `workforce_contracts_document_id_unique` ON `workforce_contracts` (`document_id`);--> statement-breakpoint
CREATE INDEX `workforce_contracts_client_name_idx` ON `workforce_contracts` (`client_name`);--> statement-breakpoint
CREATE INDEX `workforce_contracts_status_idx` ON `workforce_contracts` (`status`);--> statement-breakpoint
CREATE INDEX `workforce_contracts_end_date_idx` ON `workforce_contracts` (`end_date`);--> statement-breakpoint
CREATE INDEX `workforce_contracts_parent_idx` ON `workforce_contracts` (`parent_contract_id`);
