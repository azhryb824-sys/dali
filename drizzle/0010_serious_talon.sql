CREATE TABLE `portal_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_email` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`user_agent_hash` text NOT NULL,
	`source_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_activity_at` text NOT NULL,
	`idle_expires_at` text NOT NULL,
	`absolute_expires_at` text NOT NULL,
	`revoked_at` text,
	`revocation_reason` text,
	FOREIGN KEY (`user_email`) REFERENCES `portal_users`(`email`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "portal_sessions_status_check" CHECK("portal_sessions"."status" in ('active', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_sessions_token_hash_unique` ON `portal_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `portal_sessions_user_status_idx` ON `portal_sessions` (`user_email`,`status`);--> statement-breakpoint
CREATE INDEX `portal_sessions_idle_expires_idx` ON `portal_sessions` (`idle_expires_at`);--> statement-breakpoint
ALTER TABLE `portal_users` ADD `requested_department` text;--> statement-breakpoint
ALTER TABLE `portal_users` ADD `requested_job_title` text;--> statement-breakpoint
ALTER TABLE `portal_users` ADD `request_reason` text;--> statement-breakpoint
ALTER TABLE `portal_users` ADD `request_submitted_at` text;--> statement-breakpoint
ALTER TABLE `portal_users` ADD `terms_accepted_at` text;--> statement-breakpoint
ALTER TABLE `portal_users` ADD `approved_by` text;--> statement-breakpoint
ALTER TABLE `portal_users` ADD `approved_at` text;--> statement-breakpoint
ALTER TABLE `portal_users` ADD `suspended_at` text;