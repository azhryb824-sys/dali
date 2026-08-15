CREATE TABLE `portal_notification_reads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notification_id` integer NOT NULL,
	`user_email` text NOT NULL,
	`read_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`dismissed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_notification_reads_user_notification_unique` ON `portal_notification_reads` (`notification_id`,`user_email`);--> statement-breakpoint
CREATE INDEX `portal_notification_reads_user_idx` ON `portal_notification_reads` (`user_email`);--> statement-breakpoint
CREATE TABLE `portal_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`module` text DEFAULT 'overview' NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`target_role` text,
	`target_department` text,
	`target_email` text,
	`action_view` text,
	`dedupe_key` text,
	`source` text DEFAULT 'event' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_notifications_dedupe_key_unique` ON `portal_notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `portal_notifications_status_created_idx` ON `portal_notifications` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `portal_notifications_module_idx` ON `portal_notifications` (`module`);--> statement-breakpoint
CREATE INDEX `portal_notifications_target_department_idx` ON `portal_notifications` (`target_department`);--> statement-breakpoint
CREATE INDEX `portal_notifications_target_email_idx` ON `portal_notifications` (`target_email`);--> statement-breakpoint
CREATE TABLE `workforce_request_replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`sender_email` text NOT NULL,
	`sender_name` text NOT NULL,
	`recipient_email` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`delivery_status` text DEFAULT 'pending' NOT NULL,
	`provider_message_id` text,
	`failure_reason` text,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workforce_request_replies_request_id_idx` ON `workforce_request_replies` (`request_id`);--> statement-breakpoint
CREATE INDEX `workforce_request_replies_status_idx` ON `workforce_request_replies` (`delivery_status`);--> statement-breakpoint
CREATE INDEX `workforce_request_replies_created_at_idx` ON `workforce_request_replies` (`created_at`);