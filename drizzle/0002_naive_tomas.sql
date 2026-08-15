CREATE TABLE `company_assets` (
	`slot` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `company_assets_updated_at_idx` ON `company_assets` (`updated_at`);--> statement-breakpoint
CREATE TABLE `company_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_code` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`document_type` text,
	`counterparty` text,
	`file_name` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`expiry_date` text,
	`source` text DEFAULT 'uploaded' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`metadata_json` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_documents_reference_code_unique` ON `company_documents` (`reference_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `company_documents_storage_key_unique` ON `company_documents` (`storage_key`);--> statement-breakpoint
CREATE INDEX `company_documents_category_idx` ON `company_documents` (`category`);--> statement-breakpoint
CREATE INDEX `company_documents_expiry_date_idx` ON `company_documents` (`expiry_date`);--> statement-breakpoint
CREATE INDEX `company_documents_created_at_idx` ON `company_documents` (`created_at`);--> statement-breakpoint
CREATE TABLE `document_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_share_links_token_hash_unique` ON `document_share_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `document_share_links_document_id_idx` ON `document_share_links` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_share_links_expires_at_idx` ON `document_share_links` (`expires_at`);