CREATE TABLE `purchase_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_code` text NOT NULL,
	`supplier_invoice_number` text NOT NULL,
	`expense_type` text DEFAULT 'supplier_invoice' NOT NULL,
	`supplier_id` integer,
	`employee_id` integer,
	`contract_id` integer,
	`document_id` integer NOT NULL,
	`invoice_date` text NOT NULL,
	`due_date` text NOT NULL,
	`description` text NOT NULL,
	`subtotal_halalas` integer NOT NULL,
	`vat_halalas` integer DEFAULT 0 NOT NULL,
	`total_halalas` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`journal_entry_id` integer,
	`payment_journal_entry_id` integer,
	`posting_status` text DEFAULT 'unposted' NOT NULL,
	`created_by` text NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`paid_by` text,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contract_id`) REFERENCES `workforce_contracts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`document_id`) REFERENCES `company_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`payment_journal_entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "purchase_invoices_type_check" CHECK("purchase_invoices"."expense_type" in ('supplier_invoice','employee_expense')),
	CONSTRAINT "purchase_invoices_status_check" CHECK("purchase_invoices"."status" in ('draft','approved','posted','payment_pending','paid','cancelled')),
	CONSTRAINT "purchase_invoices_posting_check" CHECK("purchase_invoices"."posting_status" in ('unposted','draft','posted','reversed')),
	CONSTRAINT "purchase_invoices_amount_check" CHECK("purchase_invoices"."subtotal_halalas" >= 0 and "purchase_invoices"."vat_halalas" >= 0 and "purchase_invoices"."total_halalas" = "purchase_invoices"."subtotal_halalas" + "purchase_invoices"."vat_halalas")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoices_reference_code_unique` ON `purchase_invoices` (`reference_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoice_supplier_number_unique` ON `purchase_invoices` (`supplier_id`,`supplier_invoice_number`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_due_status_idx` ON `purchase_invoices` (`due_date`,`status`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_supplier_idx` ON `purchase_invoices` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_employee_idx` ON `purchase_invoices` (`employee_id`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_code` text NOT NULL,
	`legal_name` text NOT NULL,
	`commercial_registration` text,
	`vat_number` text,
	`contact_name` text,
	`mobile` text,
	`email` text,
	`address` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "suppliers_status_check" CHECK("suppliers"."status" in ('active','inactive','blocked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_supplier_code_unique` ON `suppliers` (`supplier_code`);--> statement-breakpoint
CREATE INDEX `suppliers_name_idx` ON `suppliers` (`legal_name`);--> statement-breakpoint
CREATE INDEX `suppliers_status_idx` ON `suppliers` (`status`);