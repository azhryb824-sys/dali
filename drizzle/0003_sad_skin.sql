CREATE TABLE `worker_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`worker_id` integer NOT NULL,
	`document_type` text NOT NULL,
	`requirement_code` text,
	`title` text NOT NULL,
	`file_name` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `worker_attachments_storage_key_unique` ON `worker_attachments` (`storage_key`);--> statement-breakpoint
CREATE INDEX `worker_attachments_worker_id_idx` ON `worker_attachments` (`worker_id`);--> statement-breakpoint
CREATE INDEX `worker_attachments_requirement_code_idx` ON `worker_attachments` (`requirement_code`);--> statement-breakpoint
ALTER TABLE `workers` ADD `iqama_number` text;--> statement-breakpoint
ALTER TABLE `workers` ADD `mobile` text;--> statement-breakpoint
ALTER TABLE `workers` ADD `beneficiary_name` text;--> statement-breakpoint
ALTER TABLE `workers` ADD `assignment_start_date` text;--> statement-breakpoint
CREATE UNIQUE INDEX `workers_iqama_number_unique` ON `workers` (`iqama_number`);--> statement-breakpoint
CREATE INDEX `workers_beneficiary_name_idx` ON `workers` (`beneficiary_name`);