CREATE TABLE `cost_centers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name_ar` text NOT NULL,
	`center_type` text DEFAULT 'contract' NOT NULL,
	`contract_id` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `workforce_contracts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cost_centers_type_check" CHECK("cost_centers"."center_type" in ('contract','department','project','administrative')),
	CONSTRAINT "cost_centers_status_check" CHECK("cost_centers"."status" in ('active','inactive','closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_centers_code_unique` ON `cost_centers` (`code`);--> statement-breakpoint
CREATE INDEX `cost_centers_type_status_idx` ON `cost_centers` (`center_type`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `cost_centers_contract_unique` ON `cost_centers` (`contract_id`);