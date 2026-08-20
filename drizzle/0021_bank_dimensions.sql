ALTER TABLE `financial_records` ADD `bank_account_id` integer REFERENCES `bank_accounts`(`id`) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `financial_records_bank_account_id_idx` ON `financial_records` (`bank_account_id`);
--> statement-breakpoint
ALTER TABLE `journal_lines` ADD `bank_account_id` integer REFERENCES `bank_accounts`(`id`) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `journal_lines_bank_account_idx` ON `journal_lines` (`bank_account_id`);
--> statement-breakpoint
CREATE TRIGGER `contract_assignment_active_insert_guard` BEFORE INSERT ON `contract_worker_assignments` WHEN NEW.`status` = 'active' BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM `contract_worker_assignments` WHERE `worker_id` = NEW.`worker_id` AND `status` = 'active') THEN RAISE(ABORT, 'WORKER_ALREADY_ASSIGNED') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM `contract_worker_assignments` WHERE `contract_profession_id` = NEW.`contract_profession_id` AND `status` = 'active') >= (SELECT `required_count` FROM `contract_professions` WHERE `id` = NEW.`contract_profession_id`) THEN RAISE(ABORT, 'CONTRACT_PROFESSION_CAPACITY_REACHED') END;
END;
--> statement-breakpoint
CREATE TRIGGER `contract_assignment_active_update_guard` BEFORE UPDATE OF `status`, `worker_id`, `contract_profession_id` ON `contract_worker_assignments` WHEN NEW.`status` = 'active' BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM `contract_worker_assignments` WHERE `worker_id` = NEW.`worker_id` AND `status` = 'active' AND `id` <> OLD.`id`) THEN RAISE(ABORT, 'WORKER_ALREADY_ASSIGNED') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM `contract_worker_assignments` WHERE `contract_profession_id` = NEW.`contract_profession_id` AND `status` = 'active' AND `id` <> OLD.`id`) >= (SELECT `required_count` FROM `contract_professions` WHERE `id` = NEW.`contract_profession_id`) THEN RAISE(ABORT, 'CONTRACT_PROFESSION_CAPACITY_REACHED') END;
END;
