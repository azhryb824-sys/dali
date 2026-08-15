CREATE TABLE `portal_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_activity_created_at_idx` ON `portal_activity` (`created_at`);--> statement-breakpoint
CREATE TABLE `portal_users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'employee' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE INDEX `portal_users_status_idx` ON `portal_users` (`status`);--> statement-breakpoint
CREATE INDEX `portal_users_role_idx` ON `portal_users` (`role`);--> statement-breakpoint
CREATE TABLE `workforce_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tracking_code` text NOT NULL,
	`full_name` text NOT NULL,
	`mobile` text NOT NULL,
	`email` text NOT NULL,
	`specialization` text NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`source` text DEFAULT 'public-website' NOT NULL,
	`assigned_to` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workforce_requests_tracking_code_unique` ON `workforce_requests` (`tracking_code`);--> statement-breakpoint
CREATE INDEX `workforce_requests_status_idx` ON `workforce_requests` (`status`);--> statement-breakpoint
CREATE INDEX `workforce_requests_created_at_idx` ON `workforce_requests` (`created_at`);