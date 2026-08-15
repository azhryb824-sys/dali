ALTER TABLE `client_portal_users` ADD `can_approve_quotes` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_versions` ADD `client_decision_by` text;--> statement-breakpoint
ALTER TABLE `quote_versions` ADD `client_decision_reason` text;--> statement-breakpoint
ALTER TABLE `quote_versions` ADD `client_decision_at` text;--> statement-breakpoint
ALTER TABLE `workforce_requests` ADD `version` integer DEFAULT 1 NOT NULL;