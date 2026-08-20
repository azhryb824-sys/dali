CREATE TABLE "accounting_posting_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"debit_account_id" integer NOT NULL,
	"credit_account_id" integer NOT NULL,
	"tax_account_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "accounting_posting_rules_event_type_unique" UNIQUE("event_type")
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_name" text NOT NULL,
	"iban" text NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"ledger_account_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "bank_accounts_account_code_unique" UNIQUE("account_code"),
	CONSTRAINT "bank_accounts_iban_unique" UNIQUE("iban"),
	CONSTRAINT "bank_accounts_status_check" CHECK ("bank_accounts"."status" in ('active','inactive','closed'))
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliations" (
	"id" serial PRIMARY KEY NOT NULL,
	"reconciliation_number" text NOT NULL,
	"bank_account_id" integer NOT NULL,
	"statement_date" text NOT NULL,
	"statement_balance_halalas" integer NOT NULL,
	"ledger_balance_halalas" integer NOT NULL,
	"outstanding_deposits_halalas" integer DEFAULT 0 NOT NULL,
	"outstanding_payments_halalas" integer DEFAULT 0 NOT NULL,
	"difference_halalas" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "bank_reconciliations_reconciliation_number_unique" UNIQUE("reconciliation_number"),
	CONSTRAINT "bank_reconciliations_status_check" CHECK ("bank_reconciliations"."status" in ('draft','reviewed','closed','cancelled')),
	CONSTRAINT "bank_reconciliations_outstanding_check" CHECK ("bank_reconciliations"."outstanding_deposits_halalas" >= 0 and "bank_reconciliations"."outstanding_payments_halalas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "capacity_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_code" text NOT NULL,
	"season_name" text NOT NULL,
	"location" text NOT NULL,
	"profession" text NOT NULL,
	"required_count" integer NOT NULL,
	"available_count" integer DEFAULT 0 NOT NULL,
	"reserved_count" integer DEFAULT 0 NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"owner_email" text NOT NULL,
	"notes" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "capacity_plans_plan_code_unique" UNIQUE("plan_code"),
	CONSTRAINT "capacity_plans_counts_check" CHECK ("capacity_plans"."required_count" > 0 and "capacity_plans"."available_count" >= 0 and "capacity_plans"."reserved_count" >= 0),
	CONSTRAINT "capacity_plans_status_check" CHECK ("capacity_plans"."status" in ('planning', 'approved', 'active', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"account_type" text NOT NULL,
	"normal_balance" text NOT NULL,
	"parent_id" integer,
	"is_posting" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "chart_of_accounts_code_unique" UNIQUE("code"),
	CONSTRAINT "chart_of_accounts_type_check" CHECK ("chart_of_accounts"."account_type" in ('asset','liability','equity','revenue','expense')),
	CONSTRAINT "chart_of_accounts_balance_check" CHECK ("chart_of_accounts"."normal_balance" in ('debit','credit')),
	CONSTRAINT "chart_of_accounts_status_check" CHECK ("chart_of_accounts"."status" in ('active','inactive'))
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"full_name" text NOT NULL,
	"job_title" text,
	"mobile" text,
	"email" text,
	"preferred_channel" text DEFAULT 'either' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "client_contacts_channel_check" CHECK ("client_contacts"."preferred_channel" in ('phone', 'email', 'either'))
);
--> statement-breakpoint
CREATE TABLE "client_portal_users" (
	"email" text PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"can_approve_quotes" boolean DEFAULT false NOT NULL,
	"can_approve_timesheets" boolean DEFAULT false NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"last_login_at" text,
	CONSTRAINT "client_portal_users_status_check" CHECK ("client_portal_users"."status" in ('pending', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_code" text NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"commercial_registration" text,
	"vat_number" text,
	"sector" text,
	"city" text DEFAULT 'مكة المكرمة' NOT NULL,
	"address" text,
	"status" text DEFAULT 'prospect' NOT NULL,
	"owner_email" text,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "clients_client_code_unique" UNIQUE("client_code"),
	CONSTRAINT "clients_commercial_registration_unique" UNIQUE("commercial_registration"),
	CONSTRAINT "clients_status_check" CHECK ("clients"."status" in ('prospect', 'active', 'inactive', 'blocked'))
);
--> statement-breakpoint
CREATE TABLE "company_assets" (
	"slot" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"validation_status" text DEFAULT 'legacy' NOT NULL,
	"validation_details" text,
	"uploaded_by" text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_code" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"document_type" text,
	"counterparty" text,
	"file_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"expiry_date" text,
	"source" text DEFAULT 'uploaded' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata_json" text,
	"validation_status" text DEFAULT 'legacy' NOT NULL,
	"validation_details" text,
	"retention_until" text,
	"locked_until" text,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "company_documents_reference_code_unique" UNIQUE("reference_code"),
	CONSTRAINT "company_documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "compliance_obligations" (
	"id" serial PRIMARY KEY NOT NULL,
	"obligation_code" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"authority" text NOT NULL,
	"owner_department" text NOT NULL,
	"issue_date" text,
	"expiry_date" text NOT NULL,
	"reminder_days" integer DEFAULT 30 NOT NULL,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"document_id" integer,
	"legal_record_id" integer,
	"notes" text,
	"created_by" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "compliance_obligations_obligation_code_unique" UNIQUE("obligation_code"),
	CONSTRAINT "compliance_obligations_category_check" CHECK ("compliance_obligations"."category" in ('license','certificate','insurance','labor','tax','municipal','contractual','data_protection','safety','other')),
	CONSTRAINT "compliance_obligations_risk_check" CHECK ("compliance_obligations"."risk_level" in ('low','medium','high','critical')),
	CONSTRAINT "compliance_obligations_status_check" CHECK ("compliance_obligations"."status" in ('draft','active','under_review','renewal','expired','suspended','closed')),
	CONSTRAINT "compliance_obligations_reminder_check" CHECK ("compliance_obligations"."reminder_days" between 1 and 365)
);
--> statement-breakpoint
CREATE TABLE "compliance_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"obligation_id" integer NOT NULL,
	"review_date" text NOT NULL,
	"outcome" text NOT NULL,
	"notes" text NOT NULL,
	"next_review_date" text,
	"reviewed_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "compliance_reviews_outcome_check" CHECK ("compliance_reviews"."outcome" in ('compliant','action_required','renewal_required','non_compliant','closed'))
);
--> statement-breakpoint
CREATE TABLE "contract_clauses" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"clause_number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"is_included" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_professions" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"profession" text NOT NULL,
	"required_count" integer NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_worker_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"contract_profession_id" integer NOT NULL,
	"worker_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"assigned_by" text NOT NULL,
	"assigned_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"released_at" text
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"center_type" text DEFAULT 'contract' NOT NULL,
	"contract_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "cost_centers_code_unique" UNIQUE("code"),
	CONSTRAINT "cost_centers_type_check" CHECK ("cost_centers"."center_type" in ('contract','department','project','administrative')),
	CONSTRAINT "cost_centers_status_check" CHECK ("cost_centers"."status" in ('active','inactive','closed'))
);
--> statement-breakpoint
CREATE TABLE "data_subject_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracking_code" text NOT NULL,
	"request_type" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"mobile" text,
	"details" text,
	"status" text DEFAULT 'received' NOT NULL,
	"assigned_to" text,
	"due_at" text NOT NULL,
	"completed_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "data_subject_requests_tracking_code_unique" UNIQUE("tracking_code"),
	CONSTRAINT "data_subject_requests_type_check" CHECK ("data_subject_requests"."request_type" in ('access', 'correction', 'deletion', 'withdraw_consent', 'complaint')),
	CONSTRAINT "data_subject_requests_status_check" CHECK ("data_subject_requests"."status" in ('received', 'verifying', 'processing', 'completed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "document_share_links" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" text NOT NULL,
	"revoked_at" text,
	"max_downloads" integer DEFAULT 20 NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" text,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "document_share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "employee_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"movement_type" text NOT NULL,
	"effective_date" text NOT NULL,
	"amount_halalas" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "employee_movements_type_check" CHECK ("employee_movements"."movement_type" in ('salary_adjustment','allowance','bonus','advance','deduction','leave','return_from_leave','suspension','termination','note')),
	CONSTRAINT "employee_movements_status_check" CHECK ("employee_movements"."status" in ('draft','approved','cancelled')),
	CONSTRAINT "employee_movements_amount_check" CHECK ("employee_movements"."amount_halalas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_number" text NOT NULL,
	"full_name" text NOT NULL,
	"job_title" text NOT NULL,
	"department" text NOT NULL,
	"mobile" text NOT NULL,
	"email" text,
	"national_id" text,
	"nationality" text,
	"bank_name" text,
	"iban" text,
	"base_salary_halalas" integer DEFAULT 0 NOT NULL,
	"housing_allowance_halalas" integer DEFAULT 0 NOT NULL,
	"transport_allowance_halalas" integer DEFAULT 0 NOT NULL,
	"other_allowance_halalas" integer DEFAULT 0 NOT NULL,
	"annual_leave_days" integer DEFAULT 21 NOT NULL,
	"leave_balance_days" integer DEFAULT 21 NOT NULL,
	"hire_date" text NOT NULL,
	"probation_end_date" text,
	"contract_end_date" text,
	"termination_date" text,
	"termination_reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "employees_employee_number_unique" UNIQUE("employee_number")
);
--> statement-breakpoint
CREATE TABLE "financial_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_code" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount_halalas" integer NOT NULL,
	"subtotal_halalas" integer,
	"vat_halalas" integer DEFAULT 0 NOT NULL,
	"vat_rate_bps" integer DEFAULT 0 NOT NULL,
	"due_date" text NOT NULL,
	"worker_id" integer,
	"contract_id" integer,
	"document_id" integer,
	"bank_account_id" integer,
	"journal_entry_id" integer,
	"posting_status" text DEFAULT 'unposted' NOT NULL,
	"posted_at" text,
	"period_month" text,
	"sub_category" text,
	"payment_method" text,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "financial_records_reference_code_unique" UNIQUE("reference_code"),
	CONSTRAINT "financial_records_posting_status_check" CHECK ("financial_records"."posting_status" in ('unposted','draft','posted','reversed','not_applicable'))
);
--> statement-breakpoint
CREATE TABLE "fiscal_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_code" text NOT NULL,
	"name_ar" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_by" text,
	"closed_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "fiscal_periods_period_code_unique" UNIQUE("period_code"),
	CONSTRAINT "fiscal_periods_status_check" CHECK ("fiscal_periods"."status" in ('future','open','soft_closed','closed')),
	CONSTRAINT "fiscal_periods_date_check" CHECK ("fiscal_periods"."end_date" >= "fiscal_periods"."start_date")
);
--> statement-breakpoint
CREATE TABLE "integration_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload_json" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"processed_at" text,
	"last_error" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "integration_outbox_status_check" CHECK ("integration_outbox"."status" in ('pending', 'processing', 'processed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_number" text NOT NULL,
	"entry_date" text NOT NULL,
	"fiscal_period_id" integer NOT NULL,
	"description" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"reversal_of_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" text,
	"posted_by" text,
	"posted_at" text,
	"void_reason" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "journal_entries_entry_number_unique" UNIQUE("entry_number"),
	CONSTRAINT "journal_entries_status_check" CHECK ("journal_entries"."status" in ('draft','approved','posted','reversed','void'))
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"journal_entry_id" integer NOT NULL,
	"line_number" integer NOT NULL,
	"account_id" integer NOT NULL,
	"bank_account_id" integer,
	"description" text,
	"debit_halalas" integer DEFAULT 0 NOT NULL,
	"credit_halalas" integer DEFAULT 0 NOT NULL,
	"client_id" integer,
	"contract_id" integer,
	"worker_id" integer,
	"employee_id" integer,
	"cost_center_code" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "journal_lines_amount_check" CHECK ("journal_lines"."debit_halalas" >= 0 and "journal_lines"."credit_halalas" >= 0 and (("journal_lines"."debit_halalas" > 0 and "journal_lines"."credit_halalas" = 0) or ("journal_lines"."credit_halalas" > 0 and "journal_lines"."debit_halalas" = 0)))
);
--> statement-breakpoint
CREATE TABLE "legal_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_code" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"counterparty" text NOT NULL,
	"expiry_date" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "legal_records_reference_code_unique" UNIQUE("reference_code")
);
--> statement-breakpoint
CREATE TABLE "operation_requests" (
	"key" text PRIMARY KEY NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"response_json" text,
	"error_message" text,
	"expires_at" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "operation_requests_status_check" CHECK ("operation_requests"."status" in ('processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" text NOT NULL,
	"used_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"payroll_run_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"base_salary_halalas" integer NOT NULL,
	"allowances_halalas" integer DEFAULT 0 NOT NULL,
	"bonus_halalas" integer DEFAULT 0 NOT NULL,
	"deductions_halalas" integer DEFAULT 0 NOT NULL,
	"net_pay_halalas" integer NOT NULL,
	"notes" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "payroll_items_amounts_check" CHECK ("payroll_items"."base_salary_halalas" >= 0 and "payroll_items"."allowances_halalas" >= 0 and "payroll_items"."bonus_halalas" >= 0 and "payroll_items"."deductions_halalas" >= 0 and "payroll_items"."net_pay_halalas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_number" text NOT NULL,
	"period_month" text NOT NULL,
	"payment_date" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_gross_halalas" integer DEFAULT 0 NOT NULL,
	"total_deductions_halalas" integer DEFAULT 0 NOT NULL,
	"total_net_halalas" integer DEFAULT 0 NOT NULL,
	"journal_entry_id" integer,
	"payment_journal_entry_id" integer,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" text,
	"paid_by" text,
	"paid_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "payroll_runs_run_number_unique" UNIQUE("run_number"),
	CONSTRAINT "payroll_runs_period_month_unique" UNIQUE("period_month"),
	CONSTRAINT "payroll_runs_status_check" CHECK ("payroll_runs"."status" in ('draft','approved','processing','paid','cancelled')),
	CONSTRAINT "payroll_runs_totals_check" CHECK ("payroll_runs"."total_gross_halalas" >= 0 and "payroll_runs"."total_deductions_halalas" >= 0 and "payroll_runs"."total_net_halalas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "portal_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before_json" text,
	"after_json" text,
	"reason" text,
	"correlation_id" text,
	"source" text DEFAULT 'portal' NOT NULL,
	"ip_hash" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_auth_credentials" (
	"identifier" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "portal_auth_credentials_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "portal_notification_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_id" integer NOT NULL,
	"user_email" text NOT NULL,
	"read_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"dismissed_at" text
);
--> statement-breakpoint
CREATE TABLE "portal_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"module" text DEFAULT 'overview' NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"target_role" text,
	"target_department" text,
	"target_email" text,
	"action_view" text,
	"dedupe_key" text,
	"source" text DEFAULT 'event' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "portal_notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "portal_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_email" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"user_agent_hash" text NOT NULL,
	"source_hash" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"last_activity_at" text NOT NULL,
	"idle_expires_at" text NOT NULL,
	"absolute_expires_at" text NOT NULL,
	"revoked_at" text,
	"revocation_reason" text,
	CONSTRAINT "portal_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "portal_sessions_status_check" CHECK ("portal_sessions"."status" in ('active', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "portal_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value_json" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_user_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"scope" text DEFAULT 'department' NOT NULL,
	"allowed" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "portal_user_permissions_scope_check" CHECK ("portal_user_permissions"."scope" in ('own', 'department', 'all'))
);
--> statement-breakpoint
CREATE TABLE "portal_users" (
	"email" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'employee' NOT NULL,
	"department" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_department" text,
	"requested_job_title" text,
	"request_reason" text,
	"request_submitted_at" text,
	"terms_accepted_at" text,
	"approved_by" text,
	"approved_at" text,
	"suspended_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"last_login_at" text,
	"last_activity_at" text
);
--> statement-breakpoint
CREATE TABLE "public_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"blocked_until" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_code" text NOT NULL,
	"supplier_invoice_number" text NOT NULL,
	"expense_type" text DEFAULT 'supplier_invoice' NOT NULL,
	"supplier_id" integer,
	"employee_id" integer,
	"contract_id" integer,
	"document_id" integer NOT NULL,
	"invoice_date" text NOT NULL,
	"due_date" text NOT NULL,
	"description" text NOT NULL,
	"subtotal_halalas" integer NOT NULL,
	"vat_halalas" integer DEFAULT 0 NOT NULL,
	"total_halalas" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"journal_entry_id" integer,
	"payment_journal_entry_id" integer,
	"posting_status" text DEFAULT 'unposted' NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" text,
	"paid_by" text,
	"paid_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "purchase_invoices_reference_code_unique" UNIQUE("reference_code"),
	CONSTRAINT "purchase_invoices_type_check" CHECK ("purchase_invoices"."expense_type" in ('supplier_invoice','employee_expense')),
	CONSTRAINT "purchase_invoices_status_check" CHECK ("purchase_invoices"."status" in ('draft','approved','posted','payment_pending','paid','cancelled')),
	CONSTRAINT "purchase_invoices_posting_check" CHECK ("purchase_invoices"."posting_status" in ('unposted','draft','posted','reversed')),
	CONSTRAINT "purchase_invoices_amount_check" CHECK ("purchase_invoices"."subtotal_halalas" >= 0 and "purchase_invoices"."vat_halalas" >= 0 and "purchase_invoices"."total_halalas" = "purchase_invoices"."subtotal_halalas" + "purchase_invoices"."vat_halalas")
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_version_id" integer NOT NULL,
	"profession" text NOT NULL,
	"quantity" integer NOT NULL,
	"duration_months" integer DEFAULT 1 NOT NULL,
	"unit_price_halalas" integer NOT NULL,
	"line_total_halalas" integer NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "quote_items_quantity_check" CHECK ("quote_items"."quantity" > 0),
	CONSTRAINT "quote_items_duration_check" CHECK ("quote_items"."duration_months" > 0)
);
--> statement-breakpoint
CREATE TABLE "quote_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_code" text NOT NULL,
	"opportunity_id" integer NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"issue_date" text NOT NULL,
	"valid_until" text NOT NULL,
	"subtotal_halalas" integer DEFAULT 0 NOT NULL,
	"discount_halalas" integer DEFAULT 0 NOT NULL,
	"total_halalas" integer DEFAULT 0 NOT NULL,
	"assumptions" text,
	"terms" text,
	"approval_reason" text,
	"approved_by" text,
	"approved_at" text,
	"accepted_at" text,
	"client_decision_by" text,
	"client_decision_reason" text,
	"client_decision_at" text,
	"document_id" integer,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"record_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "quote_versions_status_check" CHECK ("quote_versions"."status" in ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'expired', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "sales_opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_code" text NOT NULL,
	"client_id" integer,
	"contact_id" integer,
	"source_request_id" integer,
	"title" text NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"expected_value_halalas" integer DEFAULT 0 NOT NULL,
	"expected_close_date" text,
	"probability" integer DEFAULT 10 NOT NULL,
	"owner_email" text NOT NULL,
	"loss_reason" text,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sales_opportunities_opportunity_code_unique" UNIQUE("opportunity_code"),
	CONSTRAINT "sales_opportunities_stage_check" CHECK ("sales_opportunities"."stage" in ('new', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
	CONSTRAINT "sales_opportunities_probability_check" CHECK ("sales_opportunities"."probability" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_code" text NOT NULL,
	"legal_name" text NOT NULL,
	"commercial_registration" text,
	"vat_number" text,
	"contact_name" text,
	"mobile" text,
	"email" text,
	"address" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "suppliers_supplier_code_unique" UNIQUE("supplier_code"),
	CONSTRAINT "suppliers_status_check" CHECK ("suppliers"."status" in ('active','inactive','blocked'))
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"timesheet_id" integer NOT NULL,
	"worker_id" integer NOT NULL,
	"work_date" text NOT NULL,
	"regular_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_minutes" integer DEFAULT 0 NOT NULL,
	"attendance_status" text DEFAULT 'present' NOT NULL,
	"notes" text,
	CONSTRAINT "time_entries_minutes_check" CHECK ("time_entries"."regular_minutes" >= 0 and "time_entries"."overtime_minutes" >= 0),
	CONSTRAINT "time_entries_attendance_check" CHECK ("time_entries"."attendance_status" in ('present', 'absent', 'leave', 'sick', 'holiday'))
);
--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"timesheet_code" text NOT NULL,
	"work_order_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" text,
	"submitted_at" text,
	"approved_by" text,
	"approved_at" text,
	"rejection_reason" text,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "timesheets_timesheet_code_unique" UNIQUE("timesheet_code"),
	CONSTRAINT "timesheets_status_check" CHECK ("timesheets"."status" in ('draft', 'submitted', 'approved', 'rejected', 'invoiced'))
);
--> statement-breakpoint
CREATE TABLE "visitor_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"tracking_code" text NOT NULL,
	"public_token_hash" text NOT NULL,
	"visitor_name" text NOT NULL,
	"visitor_email" text,
	"visitor_mobile" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"assigned_to" text,
	"related_request_id" integer,
	"source_hash" text,
	"last_visitor_message_at" text NOT NULL,
	"last_staff_message_at" text,
	"last_auto_reply_key" text,
	"token_expires_at" text,
	"first_response_at" text,
	"sla_due_at" text,
	"closed_at" text,
	"privacy_notice_version" text,
	"privacy_acknowledged_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "visitor_conversations_tracking_code_unique" UNIQUE("tracking_code"),
	CONSTRAINT "visitor_conversations_public_token_hash_unique" UNIQUE("public_token_hash")
);
--> statement-breakpoint
CREATE TABLE "visitor_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_type" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_email" text,
	"body" text NOT NULL,
	"client_message_id" text,
	"read_by_visitor_at" text,
	"read_by_staff_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "visitor_messages_client_message_id_unique" UNIQUE("client_message_id")
);
--> statement-breakpoint
CREATE TABLE "work_order_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"profession" text NOT NULL,
	"required_count" integer NOT NULL,
	"filled_count" integer DEFAULT 0 NOT NULL,
	"shift_name" text,
	"start_time" text,
	"end_time" text,
	CONSTRAINT "work_order_requirements_count_check" CHECK ("work_order_requirements"."required_count" > 0 and "work_order_requirements"."filled_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_code" text NOT NULL,
	"client_id" integer NOT NULL,
	"contract_id" integer,
	"quote_version_id" integer,
	"title" text NOT NULL,
	"work_site" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"supervisor_email" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "work_orders_work_order_code_unique" UNIQUE("work_order_code"),
	CONSTRAINT "work_orders_status_check" CHECK ("work_orders"."status" in ('planned', 'staffing', 'active', 'paused', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "worker_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"document_type" text NOT NULL,
	"requirement_code" text,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"validation_status" text DEFAULT 'legacy' NOT NULL,
	"validation_details" text,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "worker_attachments_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "worker_portal_users" (
	"email" text PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"last_login_at" text,
	CONSTRAINT "worker_portal_users_status_check" CHECK ("worker_portal_users"."status" in ('pending', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_number" text NOT NULL,
	"iqama_number" text,
	"full_name" text NOT NULL,
	"nationality" text NOT NULL,
	"profession" text NOT NULL,
	"mobile" text,
	"beneficiary_name" text,
	"client_site" text NOT NULL,
	"assignment_start_date" text,
	"iqama_expiry" text,
	"status" text DEFAULT 'available' NOT NULL,
	"client_id" integer,
	"work_order_id" integer,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "workers_worker_number_unique" UNIQUE("worker_number"),
	CONSTRAINT "workers_iqama_number_unique" UNIQUE("iqama_number")
);
--> statement-breakpoint
CREATE TABLE "workflow_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"step" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"assigned_role" text,
	"assigned_email" text,
	"decision_by" text,
	"decision_reason" text,
	"decided_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "workflow_approvals_status_check" CHECK ("workflow_approvals"."status" in ('pending', 'approved', 'rejected', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "workflow_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"actor_email" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workforce_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_code" text NOT NULL,
	"document_id" integer NOT NULL,
	"client_name" text NOT NULL,
	"client_cr" text,
	"client_vat" text,
	"title" text NOT NULL,
	"work_site" text NOT NULL,
	"issue_date" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"amount_halalas" integer DEFAULT 0 NOT NULL,
	"details" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"parent_contract_id" integer,
	"amendment_type" text,
	"approved_by" text,
	"approved_at" text,
	"signed_at" text,
	"effective_at" text,
	"suspended_at" text,
	"terminated_at" text,
	"cancellation_reason" text,
	"client_id" integer,
	"opportunity_id" integer,
	"quote_version_id" integer,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "workforce_contracts_reference_code_unique" UNIQUE("reference_code"),
	CONSTRAINT "workforce_contracts_document_id_unique" UNIQUE("document_id"),
	CONSTRAINT "workforce_contracts_status_check" CHECK ("workforce_contracts"."status" in ('draft','internal_review','legal_review','approved','sent','signed','active','suspended','expired','terminated','cancelled','superseded'))
);
--> statement-breakpoint
CREATE TABLE "workforce_request_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"sender_email" text NOT NULL,
	"sender_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"failure_reason" text,
	"sent_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workforce_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracking_code" text NOT NULL,
	"full_name" text NOT NULL,
	"mobile" text NOT NULL,
	"email" text NOT NULL,
	"request_type" text DEFAULT 'general' NOT NULL,
	"company_name" text,
	"work_site" text,
	"required_start_date" text,
	"duration" text,
	"requested_count" integer,
	"preferred_contact" text,
	"specialization" text NOT NULL,
	"details" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'public-website' NOT NULL,
	"assigned_to" text,
	"client_id" integer,
	"opportunity_id" integer,
	"idempotency_key" text,
	"privacy_notice_version" text,
	"privacy_acknowledged_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "workforce_requests_tracking_code_unique" UNIQUE("tracking_code"),
	CONSTRAINT "workforce_requests_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "accounting_posting_rules" ADD CONSTRAINT "accounting_posting_rules_debit_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("debit_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_posting_rules" ADD CONSTRAINT "accounting_posting_rules_credit_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("credit_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_posting_rules" ADD CONSTRAINT "accounting_posting_rules_tax_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("tax_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_ledger_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_users" ADD CONSTRAINT "client_portal_users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_obligations" ADD CONSTRAINT "compliance_obligations_legal_record_id_legal_records_id_fk" FOREIGN KEY ("legal_record_id") REFERENCES "public"."legal_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_reviews" ADD CONSTRAINT "compliance_reviews_obligation_id_compliance_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."compliance_obligations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_clauses" ADD CONSTRAINT "contract_clauses_contract_id_workforce_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."workforce_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_contract_id_workforce_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."workforce_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_movements" ADD CONSTRAINT "employee_movements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscal_period_id_fiscal_periods_id_fk" FOREIGN KEY ("fiscal_period_id") REFERENCES "public"."fiscal_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_contract_id_workforce_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."workforce_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_identifier_portal_auth_credentials_identifier_fk" FOREIGN KEY ("identifier") REFERENCES "public"."portal_auth_credentials"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_user_email_portal_users_email_fk" FOREIGN KEY ("user_email") REFERENCES "public"."portal_users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_user_permissions" ADD CONSTRAINT "portal_user_permissions_user_email_portal_users_email_fk" FOREIGN KEY ("user_email") REFERENCES "public"."portal_users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_contract_id_workforce_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."workforce_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_document_id_company_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."company_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_payment_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("payment_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_opportunity_id_sales_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sales_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_document_id_company_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."company_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_contact_id_client_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_source_request_id_workforce_requests_id_fk" FOREIGN KEY ("source_request_id") REFERENCES "public"."workforce_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_timesheet_id_timesheets_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_requirements" ADD CONSTRAINT "work_order_requirements_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_contract_id_workforce_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."workforce_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_portal_users" ADD CONSTRAINT "worker_portal_users_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounting_posting_rules_active_idx" ON "accounting_posting_rules" USING btree ("active");--> statement-breakpoint
CREATE INDEX "bank_accounts_status_idx" ON "bank_accounts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_reconciliations_bank_date_unique" ON "bank_reconciliations" USING btree ("bank_account_id","statement_date");--> statement-breakpoint
CREATE INDEX "bank_reconciliations_status_date_idx" ON "bank_reconciliations" USING btree ("status","statement_date");--> statement-breakpoint
CREATE INDEX "capacity_plans_season_idx" ON "capacity_plans" USING btree ("season_name");--> statement-breakpoint
CREATE INDEX "capacity_plans_dates_idx" ON "capacity_plans" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "chart_of_accounts_parent_idx" ON "chart_of_accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "chart_of_accounts_type_status_idx" ON "chart_of_accounts" USING btree ("account_type","status");--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_contacts_email_idx" ON "client_contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "client_portal_users_client_idx" ON "client_portal_users" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_portal_users_status_idx" ON "client_portal_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clients_legal_name_idx" ON "clients" USING btree ("legal_name");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clients_owner_idx" ON "clients" USING btree ("owner_email");--> statement-breakpoint
CREATE INDEX "company_assets_updated_at_idx" ON "company_assets" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "company_documents_category_idx" ON "company_documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "company_documents_expiry_date_idx" ON "company_documents" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "company_documents_created_at_idx" ON "company_documents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "compliance_obligations_expiry_status_idx" ON "compliance_obligations" USING btree ("expiry_date","status");--> statement-breakpoint
CREATE INDEX "compliance_obligations_category_risk_idx" ON "compliance_obligations" USING btree ("category","risk_level");--> statement-breakpoint
CREATE INDEX "compliance_reviews_obligation_date_idx" ON "compliance_reviews" USING btree ("obligation_id","review_date");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_clauses_number_unique" ON "contract_clauses" USING btree ("contract_id","clause_number");--> statement-breakpoint
CREATE INDEX "contract_clauses_contract_idx" ON "contract_clauses" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_professions_contract_profession_unique" ON "contract_professions" USING btree ("contract_id","profession");--> statement-breakpoint
CREATE INDEX "contract_professions_contract_id_idx" ON "contract_professions" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contract_professions_profession_idx" ON "contract_professions" USING btree ("profession");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_worker_assignments_contract_worker_unique" ON "contract_worker_assignments" USING btree ("contract_id","worker_id");--> statement-breakpoint
CREATE INDEX "contract_worker_assignments_contract_id_idx" ON "contract_worker_assignments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contract_worker_assignments_profession_id_idx" ON "contract_worker_assignments" USING btree ("contract_profession_id");--> statement-breakpoint
CREATE INDEX "contract_worker_assignments_worker_id_idx" ON "contract_worker_assignments" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "contract_worker_assignments_status_idx" ON "contract_worker_assignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cost_centers_type_status_idx" ON "cost_centers" USING btree ("center_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centers_contract_unique" ON "cost_centers" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "data_subject_requests_status_due_idx" ON "data_subject_requests" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "document_share_links_document_id_idx" ON "document_share_links" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_share_links_expires_at_idx" ON "document_share_links" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "employee_movements_employee_date_idx" ON "employee_movements" USING btree ("employee_id","effective_date");--> statement-breakpoint
CREATE INDEX "employee_movements_type_status_idx" ON "employee_movements" USING btree ("movement_type","status");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "employees_department_idx" ON "employees" USING btree ("department");--> statement-breakpoint
CREATE INDEX "financial_records_status_idx" ON "financial_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "financial_records_due_date_idx" ON "financial_records" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "financial_records_category_idx" ON "financial_records" USING btree ("category");--> statement-breakpoint
CREATE INDEX "financial_records_worker_id_idx" ON "financial_records" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "financial_records_contract_id_idx" ON "financial_records" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "financial_records_document_id_idx" ON "financial_records" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "financial_records_bank_account_id_idx" ON "financial_records" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "financial_records_period_month_idx" ON "financial_records" USING btree ("period_month");--> statement-breakpoint
CREATE INDEX "financial_records_posting_status_idx" ON "financial_records" USING btree ("posting_status");--> statement-breakpoint
CREATE INDEX "fiscal_periods_dates_idx" ON "fiscal_periods" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "integration_outbox_status_available_idx" ON "integration_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "integration_outbox_aggregate_idx" ON "integration_outbox" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "journal_entries_period_status_idx" ON "journal_entries" USING btree ("fiscal_period_id","status");--> statement-breakpoint
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_lines_entry_line_unique" ON "journal_lines" USING btree ("journal_entry_id","line_number");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "journal_lines_bank_account_idx" ON "journal_lines" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "journal_lines_contract_idx" ON "journal_lines" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "legal_records_status_idx" ON "legal_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "legal_records_expiry_date_idx" ON "legal_records" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "operation_requests_actor_idx" ON "operation_requests" USING btree ("actor_email","created_at");--> statement-breakpoint
CREATE INDEX "operation_requests_expiry_idx" ON "operation_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_identifier_idx" ON "password_reset_tokens" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expires_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_items_run_employee_idx" ON "payroll_items" USING btree ("payroll_run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payroll_items_employee_idx" ON "payroll_items" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payroll_runs_status_payment_idx" ON "payroll_runs" USING btree ("status","payment_date");--> statement-breakpoint
CREATE INDEX "portal_activity_created_at_idx" ON "portal_activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "portal_auth_credentials_email_idx" ON "portal_auth_credentials" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_notification_reads_user_notification_unique" ON "portal_notification_reads" USING btree ("notification_id","user_email");--> statement-breakpoint
CREATE INDEX "portal_notification_reads_user_idx" ON "portal_notification_reads" USING btree ("user_email");--> statement-breakpoint
CREATE INDEX "portal_notifications_status_created_idx" ON "portal_notifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "portal_notifications_module_idx" ON "portal_notifications" USING btree ("module");--> statement-breakpoint
CREATE INDEX "portal_notifications_target_department_idx" ON "portal_notifications" USING btree ("target_department");--> statement-breakpoint
CREATE INDEX "portal_notifications_target_email_idx" ON "portal_notifications" USING btree ("target_email");--> statement-breakpoint
CREATE INDEX "portal_sessions_user_status_idx" ON "portal_sessions" USING btree ("user_email","status");--> statement-breakpoint
CREATE INDEX "portal_sessions_idle_expires_idx" ON "portal_sessions" USING btree ("idle_expires_at");--> statement-breakpoint
CREATE INDEX "portal_settings_updated_at_idx" ON "portal_settings" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_user_permissions_unique" ON "portal_user_permissions" USING btree ("user_email","resource","action","scope");--> statement-breakpoint
CREATE INDEX "portal_user_permissions_user_idx" ON "portal_user_permissions" USING btree ("user_email");--> statement-breakpoint
CREATE INDEX "portal_users_status_idx" ON "portal_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "portal_users_role_idx" ON "portal_users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "portal_users_department_idx" ON "portal_users" USING btree ("department");--> statement-breakpoint
CREATE INDEX "public_rate_limits_updated_idx" ON "public_rate_limits" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_invoice_supplier_number_unique" ON "purchase_invoices" USING btree ("supplier_id","supplier_invoice_number");--> statement-breakpoint
CREATE INDEX "purchase_invoices_due_status_idx" ON "purchase_invoices" USING btree ("due_date","status");--> statement-breakpoint
CREATE INDEX "purchase_invoices_supplier_idx" ON "purchase_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_invoices_employee_idx" ON "purchase_invoices" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "quote_items_quote_idx" ON "quote_items" USING btree ("quote_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_versions_code_version_unique" ON "quote_versions" USING btree ("quote_code","version_number");--> statement-breakpoint
CREATE INDEX "quote_versions_opportunity_idx" ON "quote_versions" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "quote_versions_status_idx" ON "quote_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quote_versions_valid_until_idx" ON "quote_versions" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "sales_opportunities_client_idx" ON "sales_opportunities" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "sales_opportunities_stage_idx" ON "sales_opportunities" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "sales_opportunities_owner_idx" ON "sales_opportunities" USING btree ("owner_email");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_opportunities_source_request_unique" ON "sales_opportunities" USING btree ("source_request_id");--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("legal_name");--> statement-breakpoint
CREATE INDEX "suppliers_status_idx" ON "suppliers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_sheet_worker_date_unique" ON "time_entries" USING btree ("timesheet_id","worker_id","work_date");--> statement-breakpoint
CREATE INDEX "time_entries_worker_idx" ON "time_entries" USING btree ("worker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheets_order_period_unique" ON "timesheets" USING btree ("work_order_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "timesheets_client_idx" ON "timesheets" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "timesheets_status_idx" ON "timesheets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "visitor_conversations_status_idx" ON "visitor_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "visitor_conversations_updated_at_idx" ON "visitor_conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "visitor_conversations_assigned_to_idx" ON "visitor_conversations" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "visitor_conversations_related_request_idx" ON "visitor_conversations" USING btree ("related_request_id");--> statement-breakpoint
CREATE INDEX "visitor_conversations_source_hash_idx" ON "visitor_conversations" USING btree ("source_hash");--> statement-breakpoint
CREATE INDEX "visitor_messages_conversation_created_idx" ON "visitor_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "visitor_messages_sender_type_idx" ON "visitor_messages" USING btree ("sender_type");--> statement-breakpoint
CREATE INDEX "visitor_messages_staff_read_idx" ON "visitor_messages" USING btree ("read_by_staff_at");--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_requirements_unique" ON "work_order_requirements" USING btree ("work_order_id","profession","shift_name");--> statement-breakpoint
CREATE INDEX "work_order_requirements_order_idx" ON "work_order_requirements" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "work_orders_client_idx" ON "work_orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "work_orders_contract_idx" ON "work_orders" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "work_orders_status_idx" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "work_orders_dates_idx" ON "work_orders" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "worker_attachments_worker_id_idx" ON "worker_attachments" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "worker_attachments_requirement_code_idx" ON "worker_attachments" USING btree ("requirement_code");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_portal_users_worker_unique" ON "worker_portal_users" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "worker_portal_users_status_idx" ON "worker_portal_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workers_status_idx" ON "workers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workers_profession_idx" ON "workers" USING btree ("profession");--> statement-breakpoint
CREATE INDEX "workers_beneficiary_name_idx" ON "workers" USING btree ("beneficiary_name");--> statement-breakpoint
CREATE INDEX "workers_iqama_expiry_idx" ON "workers" USING btree ("iqama_expiry");--> statement-breakpoint
CREATE INDEX "workflow_approvals_entity_idx" ON "workflow_approvals" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "workflow_approvals_status_idx" ON "workflow_approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_status_history_entity_idx" ON "workflow_status_history" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_status_history_correlation_idx" ON "workflow_status_history" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "workforce_contracts_client_name_idx" ON "workforce_contracts" USING btree ("client_name");--> statement-breakpoint
CREATE INDEX "workforce_contracts_status_idx" ON "workforce_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workforce_contracts_end_date_idx" ON "workforce_contracts" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "workforce_contracts_parent_idx" ON "workforce_contracts" USING btree ("parent_contract_id");--> statement-breakpoint
CREATE INDEX "workforce_request_replies_request_id_idx" ON "workforce_request_replies" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "workforce_request_replies_status_idx" ON "workforce_request_replies" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "workforce_request_replies_created_at_idx" ON "workforce_request_replies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workforce_requests_status_idx" ON "workforce_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workforce_requests_request_type_idx" ON "workforce_requests" USING btree ("request_type");--> statement-breakpoint
CREATE INDEX "workforce_requests_created_at_idx" ON "workforce_requests" USING btree ("created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION contract_assignment_active_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF EXISTS (
      SELECT 1 FROM contract_worker_assignments
      WHERE worker_id = NEW.worker_id AND status = 'active' AND id <> COALESCE(NEW.id, 0)
    ) THEN
      RAISE EXCEPTION 'WORKER_ALREADY_ASSIGNED' USING ERRCODE = '23505';
    END IF;
    IF (
      SELECT count(*) FROM contract_worker_assignments
      WHERE contract_profession_id = NEW.contract_profession_id AND status = 'active' AND id <> COALESCE(NEW.id, 0)
    ) >= (
      SELECT required_count FROM contract_professions WHERE id = NEW.contract_profession_id
    ) THEN
      RAISE EXCEPTION 'CONTRACT_PROFESSION_CAPACITY_REACHED' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contract_assignment_active_guard_trigger
BEFORE INSERT OR UPDATE OF status, worker_id, contract_profession_id
ON contract_worker_assignments FOR EACH ROW EXECUTE FUNCTION contract_assignment_active_guard();
--> statement-breakpoint
DO $$
DECLARE table_record record;
BEGIN
  FOR table_record IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_record.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_record.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION contract_assignment_active_guard() FROM PUBLIC;
