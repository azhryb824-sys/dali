ALTER TABLE contract_clauses ADD COLUMN IF NOT EXISTS is_preamble boolean NOT NULL DEFAULT false;
ALTER TABLE contract_clauses ADD COLUMN IF NOT EXISTS subclauses_json text NOT NULL DEFAULT '[]';
UPDATE contract_clauses SET is_preamble = true WHERE clause_number = 1 AND title = 'التمهيد والملاحق';
