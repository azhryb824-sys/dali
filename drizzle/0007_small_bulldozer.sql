CREATE TABLE `capacity_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_code` text NOT NULL,
	`season_name` text NOT NULL,
	`location` text NOT NULL,
	`profession` text NOT NULL,
	`required_count` integer NOT NULL,
	`available_count` integer DEFAULT 0 NOT NULL,
	`reserved_count` integer DEFAULT 0 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`owner_email` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "capacity_plans_counts_check" CHECK("capacity_plans"."required_count" > 0 and "capacity_plans"."available_count" >= 0 and "capacity_plans"."reserved_count" >= 0),
	CONSTRAINT "capacity_plans_status_check" CHECK("capacity_plans"."status" in ('planning', 'approved', 'active', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `capacity_plans_plan_code_unique` ON `capacity_plans` (`plan_code`);--> statement-breakpoint
CREATE INDEX `capacity_plans_season_idx` ON `capacity_plans` (`season_name`);--> statement-breakpoint
CREATE INDEX `capacity_plans_dates_idx` ON `capacity_plans` (`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `client_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`full_name` text NOT NULL,
	`job_title` text,
	`mobile` text,
	`email` text,
	`preferred_channel` text DEFAULT 'either' NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "client_contacts_channel_check" CHECK("client_contacts"."preferred_channel" in ('phone', 'email', 'either'))
);
--> statement-breakpoint
CREATE INDEX `client_contacts_client_idx` ON `client_contacts` (`client_id`);--> statement-breakpoint
CREATE INDEX `client_contacts_email_idx` ON `client_contacts` (`email`);--> statement-breakpoint
CREATE TABLE `client_portal_users` (
	`email` text PRIMARY KEY NOT NULL,
	`client_id` integer NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`can_approve_timesheets` integer DEFAULT false NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_login_at` text,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "client_portal_users_status_check" CHECK("client_portal_users"."status" in ('pending', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE INDEX `client_portal_users_client_idx` ON `client_portal_users` (`client_id`);--> statement-breakpoint
CREATE INDEX `client_portal_users_status_idx` ON `client_portal_users` (`status`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_code` text NOT NULL,
	`legal_name` text NOT NULL,
	`trade_name` text,
	`commercial_registration` text,
	`vat_number` text,
	`sector` text,
	`city` text DEFAULT 'مكة المكرمة' NOT NULL,
	`address` text,
	`status` text DEFAULT 'prospect' NOT NULL,
	`owner_email` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "clients_status_check" CHECK("clients"."status" in ('prospect', 'active', 'inactive', 'blocked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_client_code_unique` ON `clients` (`client_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_commercial_registration_unique` ON `clients` (`commercial_registration`);--> statement-breakpoint
CREATE INDEX `clients_legal_name_idx` ON `clients` (`legal_name`);--> statement-breakpoint
CREATE INDEX `clients_status_idx` ON `clients` (`status`);--> statement-breakpoint
CREATE INDEX `clients_owner_idx` ON `clients` (`owner_email`);--> statement-breakpoint
CREATE TABLE `data_subject_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tracking_code` text NOT NULL,
	`request_type` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`mobile` text,
	`details` text,
	`status` text DEFAULT 'received' NOT NULL,
	`assigned_to` text,
	`due_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "data_subject_requests_type_check" CHECK("data_subject_requests"."request_type" in ('access', 'correction', 'deletion', 'withdraw_consent', 'complaint')),
	CONSTRAINT "data_subject_requests_status_check" CHECK("data_subject_requests"."status" in ('received', 'verifying', 'processing', 'completed', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_subject_requests_tracking_code_unique` ON `data_subject_requests` (`tracking_code`);--> statement-breakpoint
CREATE INDEX `data_subject_requests_status_due_idx` ON `data_subject_requests` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `integration_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "integration_outbox_status_check" CHECK("integration_outbox"."status" in ('pending', 'processing', 'processed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `integration_outbox_status_available_idx` ON `integration_outbox` (`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `integration_outbox_aggregate_idx` ON `integration_outbox` (`aggregate_type`,`aggregate_id`);--> statement-breakpoint
CREATE TABLE `operation_requests` (
	`key` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`response_json` text,
	`error_message` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "operation_requests_status_check" CHECK("operation_requests"."status" in ('processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `operation_requests_actor_idx` ON `operation_requests` (`actor_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `operation_requests_expiry_idx` ON `operation_requests` (`expires_at`);--> statement-breakpoint
CREATE TABLE `portal_user_permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`resource` text NOT NULL,
	`action` text NOT NULL,
	`scope` text DEFAULT 'department' NOT NULL,
	`allowed` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `portal_users`(`email`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "portal_user_permissions_scope_check" CHECK("portal_user_permissions"."scope" in ('own', 'department', 'all'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_user_permissions_unique` ON `portal_user_permissions` (`user_email`,`resource`,`action`,`scope`);--> statement-breakpoint
CREATE INDEX `portal_user_permissions_user_idx` ON `portal_user_permissions` (`user_email`);--> statement-breakpoint
CREATE TABLE `public_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_started_at` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`blocked_until` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `public_rate_limits_updated_idx` ON `public_rate_limits` (`updated_at`);--> statement-breakpoint
CREATE TABLE `quote_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quote_version_id` integer NOT NULL,
	`profession` text NOT NULL,
	`quantity` integer NOT NULL,
	`duration_months` integer DEFAULT 1 NOT NULL,
	`unit_price_halalas` integer NOT NULL,
	`line_total_halalas` integer NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`quote_version_id`) REFERENCES `quote_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quote_items_quantity_check" CHECK("quote_items"."quantity" > 0),
	CONSTRAINT "quote_items_duration_check" CHECK("quote_items"."duration_months" > 0)
);
--> statement-breakpoint
CREATE INDEX `quote_items_quote_idx` ON `quote_items` (`quote_version_id`);--> statement-breakpoint
CREATE TABLE `quote_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quote_code` text NOT NULL,
	`opportunity_id` integer NOT NULL,
	`version_number` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`issue_date` text NOT NULL,
	`valid_until` text NOT NULL,
	`subtotal_halalas` integer DEFAULT 0 NOT NULL,
	`discount_halalas` integer DEFAULT 0 NOT NULL,
	`total_halalas` integer DEFAULT 0 NOT NULL,
	`assumptions` text,
	`terms` text,
	`approval_reason` text,
	`approved_by` text,
	`approved_at` text,
	`accepted_at` text,
	`document_id` integer,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `sales_opportunities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `company_documents`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "quote_versions_status_check" CHECK("quote_versions"."status" in ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'expired', 'superseded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quote_versions_code_version_unique` ON `quote_versions` (`quote_code`,`version_number`);--> statement-breakpoint
CREATE INDEX `quote_versions_opportunity_idx` ON `quote_versions` (`opportunity_id`);--> statement-breakpoint
CREATE INDEX `quote_versions_status_idx` ON `quote_versions` (`status`);--> statement-breakpoint
CREATE INDEX `quote_versions_valid_until_idx` ON `quote_versions` (`valid_until`);--> statement-breakpoint
CREATE TABLE `sales_opportunities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_code` text NOT NULL,
	`client_id` integer,
	`contact_id` integer,
	`source_request_id` integer,
	`title` text NOT NULL,
	`stage` text DEFAULT 'new' NOT NULL,
	`expected_value_halalas` integer DEFAULT 0 NOT NULL,
	`expected_close_date` text,
	`probability` integer DEFAULT 10 NOT NULL,
	`owner_email` text NOT NULL,
	`loss_reason` text,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contact_id`) REFERENCES `client_contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_request_id`) REFERENCES `workforce_requests`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "sales_opportunities_stage_check" CHECK("sales_opportunities"."stage" in ('new', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
	CONSTRAINT "sales_opportunities_probability_check" CHECK("sales_opportunities"."probability" between 0 and 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_opportunities_opportunity_code_unique` ON `sales_opportunities` (`opportunity_code`);--> statement-breakpoint
CREATE INDEX `sales_opportunities_client_idx` ON `sales_opportunities` (`client_id`);--> statement-breakpoint
CREATE INDEX `sales_opportunities_stage_idx` ON `sales_opportunities` (`stage`);--> statement-breakpoint
CREATE INDEX `sales_opportunities_owner_idx` ON `sales_opportunities` (`owner_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_opportunities_source_request_unique` ON `sales_opportunities` (`source_request_id`);--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timesheet_id` integer NOT NULL,
	`worker_id` integer NOT NULL,
	`work_date` text NOT NULL,
	`regular_minutes` integer DEFAULT 0 NOT NULL,
	`overtime_minutes` integer DEFAULT 0 NOT NULL,
	`attendance_status` text DEFAULT 'present' NOT NULL,
	`notes` text,
	FOREIGN KEY (`timesheet_id`) REFERENCES `timesheets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "time_entries_minutes_check" CHECK("time_entries"."regular_minutes" >= 0 and "time_entries"."overtime_minutes" >= 0),
	CONSTRAINT "time_entries_attendance_check" CHECK("time_entries"."attendance_status" in ('present', 'absent', 'leave', 'sick', 'holiday'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `time_entries_sheet_worker_date_unique` ON `time_entries` (`timesheet_id`,`worker_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `time_entries_worker_idx` ON `time_entries` (`worker_id`);--> statement-breakpoint
CREATE TABLE `timesheets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timesheet_code` text NOT NULL,
	`work_order_id` integer NOT NULL,
	`client_id` integer NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`submitted_by` text,
	`submitted_at` text,
	`approved_by` text,
	`approved_at` text,
	`rejection_reason` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "timesheets_status_check" CHECK("timesheets"."status" in ('draft', 'submitted', 'approved', 'rejected', 'invoiced'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timesheets_timesheet_code_unique` ON `timesheets` (`timesheet_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `timesheets_order_period_unique` ON `timesheets` (`work_order_id`,`period_start`,`period_end`);--> statement-breakpoint
CREATE INDEX `timesheets_client_idx` ON `timesheets` (`client_id`);--> statement-breakpoint
CREATE INDEX `timesheets_status_idx` ON `timesheets` (`status`);--> statement-breakpoint
CREATE TABLE `work_order_requirements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_order_id` integer NOT NULL,
	`profession` text NOT NULL,
	`required_count` integer NOT NULL,
	`filled_count` integer DEFAULT 0 NOT NULL,
	`shift_name` text,
	`start_time` text,
	`end_time` text,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "work_order_requirements_count_check" CHECK("work_order_requirements"."required_count" > 0 and "work_order_requirements"."filled_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_order_requirements_unique` ON `work_order_requirements` (`work_order_id`,`profession`,`shift_name`);--> statement-breakpoint
CREATE INDEX `work_order_requirements_order_idx` ON `work_order_requirements` (`work_order_id`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_order_code` text NOT NULL,
	`client_id` integer NOT NULL,
	`contract_id` integer,
	`quote_version_id` integer,
	`title` text NOT NULL,
	`work_site` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`supervisor_email` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contract_id`) REFERENCES `workforce_contracts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`quote_version_id`) REFERENCES `quote_versions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "work_orders_status_check" CHECK("work_orders"."status" in ('planned', 'staffing', 'active', 'paused', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_orders_work_order_code_unique` ON `work_orders` (`work_order_code`);--> statement-breakpoint
CREATE INDEX `work_orders_client_idx` ON `work_orders` (`client_id`);--> statement-breakpoint
CREATE INDEX `work_orders_contract_idx` ON `work_orders` (`contract_id`);--> statement-breakpoint
CREATE INDEX `work_orders_status_idx` ON `work_orders` (`status`);--> statement-breakpoint
CREATE INDEX `work_orders_dates_idx` ON `work_orders` (`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `worker_portal_users` (
	`email` text PRIMARY KEY NOT NULL,
	`worker_id` integer NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_login_at` text,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "worker_portal_users_status_check" CHECK("worker_portal_users"."status" in ('pending', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `worker_portal_users_worker_unique` ON `worker_portal_users` (`worker_id`);--> statement-breakpoint
CREATE INDEX `worker_portal_users_status_idx` ON `worker_portal_users` (`status`);--> statement-breakpoint
CREATE TABLE `workflow_approvals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`step` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text NOT NULL,
	`assigned_role` text,
	`assigned_email` text,
	`decision_by` text,
	`decision_reason` text,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "workflow_approvals_status_check" CHECK("workflow_approvals"."status" in ('pending', 'approved', 'rejected', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `workflow_approvals_entity_idx` ON `workflow_approvals` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `workflow_approvals_status_idx` ON `workflow_approvals` (`status`);--> statement-breakpoint
CREATE TABLE `workflow_status_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`reason` text,
	`actor_email` text NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_status_history_entity_idx` ON `workflow_status_history` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `workflow_status_history_correlation_idx` ON `workflow_status_history` (`correlation_id`);--> statement-breakpoint
ALTER TABLE `company_assets` ADD `validation_status` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `company_assets` ADD `validation_details` text;--> statement-breakpoint
ALTER TABLE `company_documents` ADD `validation_status` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `company_documents` ADD `validation_details` text;--> statement-breakpoint
ALTER TABLE `company_documents` ADD `retention_until` text;--> statement-breakpoint
ALTER TABLE `company_documents` ADD `locked_until` text;--> statement-breakpoint
ALTER TABLE `document_share_links` ADD `revoked_at` text;--> statement-breakpoint
ALTER TABLE `document_share_links` ADD `max_downloads` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `document_share_links` ADD `download_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `document_share_links` ADD `last_accessed_at` text;--> statement-breakpoint
ALTER TABLE `portal_activity` ADD `before_json` text;--> statement-breakpoint
ALTER TABLE `portal_activity` ADD `after_json` text;--> statement-breakpoint
ALTER TABLE `portal_activity` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `portal_activity` ADD `correlation_id` text;--> statement-breakpoint
ALTER TABLE `portal_activity` ADD `source` text DEFAULT 'portal' NOT NULL;--> statement-breakpoint
ALTER TABLE `portal_activity` ADD `ip_hash` text;--> statement-breakpoint
ALTER TABLE `portal_users` ADD `last_activity_at` text;--> statement-breakpoint
ALTER TABLE `visitor_conversations` ADD `token_expires_at` text;--> statement-breakpoint
ALTER TABLE `visitor_conversations` ADD `first_response_at` text;--> statement-breakpoint
ALTER TABLE `visitor_conversations` ADD `sla_due_at` text;--> statement-breakpoint
ALTER TABLE `visitor_conversations` ADD `closed_at` text;--> statement-breakpoint
ALTER TABLE `visitor_messages` ADD `client_message_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_messages_client_message_id_unique` ON `visitor_messages` (`client_message_id`);--> statement-breakpoint
ALTER TABLE `worker_attachments` ADD `validation_status` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `worker_attachments` ADD `validation_details` text;--> statement-breakpoint
ALTER TABLE `workers` ADD `client_id` integer;--> statement-breakpoint
ALTER TABLE `workers` ADD `work_order_id` integer;--> statement-breakpoint
ALTER TABLE `workforce_contracts` ADD `client_id` integer;--> statement-breakpoint
ALTER TABLE `workforce_contracts` ADD `opportunity_id` integer;--> statement-breakpoint
ALTER TABLE `workforce_contracts` ADD `quote_version_id` integer;--> statement-breakpoint
ALTER TABLE `workforce_requests` ADD `client_id` integer;--> statement-breakpoint
ALTER TABLE `workforce_requests` ADD `opportunity_id` integer;--> statement-breakpoint
ALTER TABLE `workforce_requests` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `workforce_requests_idempotency_key_unique` ON `workforce_requests` (`idempotency_key`);