CREATE TABLE `portal_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_settings_updated_at_idx` ON `portal_settings` (`updated_at`);--> statement-breakpoint
CREATE TABLE `visitor_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_code` text NOT NULL,
	`public_token_hash` text NOT NULL,
	`visitor_name` text NOT NULL,
	`visitor_email` text,
	`visitor_mobile` text NOT NULL,
	`subject` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`assigned_to` text,
	`related_request_id` integer,
	`source_hash` text,
	`last_visitor_message_at` text NOT NULL,
	`last_staff_message_at` text,
	`last_auto_reply_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_conversations_tracking_code_unique` ON `visitor_conversations` (`tracking_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_conversations_public_token_hash_unique` ON `visitor_conversations` (`public_token_hash`);--> statement-breakpoint
CREATE INDEX `visitor_conversations_status_idx` ON `visitor_conversations` (`status`);--> statement-breakpoint
CREATE INDEX `visitor_conversations_updated_at_idx` ON `visitor_conversations` (`updated_at`);--> statement-breakpoint
CREATE INDEX `visitor_conversations_assigned_to_idx` ON `visitor_conversations` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `visitor_conversations_related_request_idx` ON `visitor_conversations` (`related_request_id`);--> statement-breakpoint
CREATE INDEX `visitor_conversations_source_hash_idx` ON `visitor_conversations` (`source_hash`);--> statement-breakpoint
CREATE TABLE `visitor_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_type` text NOT NULL,
	`sender_name` text NOT NULL,
	`sender_email` text,
	`body` text NOT NULL,
	`read_by_visitor_at` text,
	`read_by_staff_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `visitor_messages_conversation_created_idx` ON `visitor_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `visitor_messages_sender_type_idx` ON `visitor_messages` (`sender_type`);--> statement-breakpoint
CREATE INDEX `visitor_messages_staff_read_idx` ON `visitor_messages` (`read_by_staff_at`);--> statement-breakpoint
ALTER TABLE `workforce_requests` ADD `request_type` text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE `workforce_requests` ADD `company_name` text;--> statement-breakpoint
ALTER TABLE `workforce_requests` ADD `work_site` text;--> statement-breakpoint
ALTER TABLE `workforce_requests` ADD `required_start_date` text;--> statement-breakpoint
ALTER TABLE `workforce_requests` ADD `duration` text;--> statement-breakpoint
ALTER TABLE `workforce_requests` ADD `requested_count` integer;--> statement-breakpoint
ALTER TABLE `workforce_requests` ADD `preferred_contact` text;--> statement-breakpoint
CREATE INDEX `workforce_requests_request_type_idx` ON `workforce_requests` (`request_type`);