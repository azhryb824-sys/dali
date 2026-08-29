import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  prepare: false,
});

const requiredColumns = {
  employee_leave_requests: ["balance_days_deducted", "paid_percentage_bps", "cancelled_by", "cancelled_at"],
  payroll_runs: ["bank_account_id", "payroll_type", "snapshot_json"],
  payroll_items: ["employee_name_snapshot", "iban_snapshot", "payment_status", "paid_amount_halalas", "pending_payment_amount_halalas", "payment_reference"],
  legal_records: ["assigned_lawyer_email", "court_case_number", "court_name", "claim_value_halalas", "judgment_value_halalas", "judicial_stage"],
  legal_case_attachments: ["sha256", "document_category", "version_number", "approval_status"],
};
const requiredTables = [
  "company_holidays", "employee_leave_policies", "employee_termination_requests", "employee_profile_changes",
  "legal_hearings", "legal_evidence_custody", "legal_submissions", "legal_settlements",
  "bank_statement_lines", "fixed_assets", "budget_lines", "tax_returns", "financial_operation_issues",
];

const failures = [];
try {
  const [{ database, user_name: userName }] = await sql`select current_database() as database, current_user as user_name`;
  const tables = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
  const tableSet = new Set(tables.map((row) => row.table_name));
  for (const table of requiredTables) if (!tableSet.has(table)) failures.push(`MISSING_TABLE:${table}`);

  const columns = await sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`;
  const columnSet = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
  for (const [table, names] of Object.entries(requiredColumns)) {
    for (const name of names) if (!columnSet.has(`${table}.${name}`)) failures.push(`MISSING_COLUMN:${table}.${name}`);
  }

  const constraints = await sql`select constraint_name from information_schema.table_constraints where constraint_schema = 'public'`;
  const constraintSet = new Set(constraints.map((row) => row.constraint_name));
  for (const name of ["employees_manager_fk", "employee_termination_status_check", "legal_judgment_payments_status_check", "bank_statement_direction_check"]) {
    if (!constraintSet.has(name)) failures.push(`MISSING_CONSTRAINT:${name}`);
  }

  if (tableSet.has("employees")) {
    const [{ count }] = await sql`select count(*)::int as count from public.employees where leave_balance_days < 0`;
    if (count) failures.push(`NEGATIVE_LEAVE_BALANCES:${count}`);
  }
  if (tableSet.has("payroll_runs")) {
    const [{ count }] = await sql`select count(*)::int as count from public.payroll_runs where status in ('approved','processing','paid') and (bank_account_id is null or snapshot_json is null)`;
    if (count) failures.push(`UNFROZEN_APPROVED_PAYROLL_RUNS:${count}`);
  }
  if (tableSet.has("legal_records") && tableSet.has("portal_users") && tableSet.has("portal_access_scopes")) {
    const [{ count }] = await sql`
      select count(*)::int as count
      from public.legal_records record
      left join public.portal_users users on lower(users.email) = lower(record.assigned_lawyer_email)
      where record.assigned_lawyer_email is not null
        and (users.email is null or users.status <> 'active' or not exists (
          select 1 from public.portal_access_scopes scope
          where lower(scope.user_email) = lower(record.assigned_lawyer_email)
            and scope.active = true and scope.functional_role in ('legal_affairs','legal_lawyer','legal_supervisor')
        ))`;
    if (count) failures.push(`INVALID_LEGAL_ASSIGNEES:${count}`);
  }

  console.log(JSON.stringify({ status: failures.length ? "failed" : "ok", database, userName, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
