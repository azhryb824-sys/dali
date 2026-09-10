import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  const deductionMismatches = await sql`
    SELECT p.id AS payment_id,
      p.absence_deduction_halalas,
      COALESCE(SUM(a.client_deduction_halalas) FILTER (WHERE a.status = 'active'), 0)::integer AS expected
    FROM contract_payment_schedules p
    LEFT JOIN contract_worker_absences a ON a.payment_schedule_id = p.id
    GROUP BY p.id, p.absence_deduction_halalas
    HAVING p.absence_deduction_halalas <>
      COALESCE(SUM(a.client_deduction_halalas) FILTER (WHERE a.status = 'active'), 0)
  `;

  const invalidFinancials = await sql`
    SELECT p.id AS payment_id,
      p.financial_record_id,
      f.contract_payment_schedule_id,
      f.contract_id AS financial_contract_id,
      f.subtotal_halalas,
      f.vat_halalas,
      f.amount_halalas,
      GREATEST(0, p.subtotal_halalas - p.absence_deduction_halalas)::integer AS expected_subtotal,
      ROUND(GREATEST(0, p.subtotal_halalas - p.absence_deduction_halalas) * p.vat_rate_bps / 10000.0)::integer AS expected_vat,
      GREATEST(0, p.subtotal_halalas - p.absence_deduction_halalas)
        + ROUND(GREATEST(0, p.subtotal_halalas - p.absence_deduction_halalas) * p.vat_rate_bps / 10000.0)::integer AS expected_amount
    FROM contract_payment_schedules p
    JOIN financial_records f ON f.id = p.financial_record_id
    WHERE f.contract_payment_schedule_id IS DISTINCT FROM p.id
      OR f.contract_id IS DISTINCT FROM p.contract_id
      OR f.document_id IS DISTINCT FROM p.invoice_document_id
      OR f.subtotal_halalas IS DISTINCT FROM GREATEST(0, p.subtotal_halalas - p.absence_deduction_halalas)::integer
      OR f.vat_halalas IS DISTINCT FROM ROUND(GREATEST(0, p.subtotal_halalas - p.absence_deduction_halalas) * p.vat_rate_bps / 10000.0)::integer
      OR f.amount_halalas IS DISTINCT FROM GREATEST(0, p.subtotal_halalas - p.absence_deduction_halalas)
        + ROUND(GREATEST(0, p.subtotal_halalas - p.absence_deduction_halalas) * p.vat_rate_bps / 10000.0)::integer
  `;

  const invalidAssignments = await sql`
    SELECT assignment.id,
      assignment.contract_id,
      assignment.contract_profession_id,
      assignment.worker_id,
      assignment.status,
      worker.status AS worker_status
    FROM contract_worker_assignments assignment
    LEFT JOIN workforce_contracts contract ON contract.id = assignment.contract_id
    LEFT JOIN contract_professions profession ON profession.id = assignment.contract_profession_id
    LEFT JOIN workers worker ON worker.id = assignment.worker_id
    WHERE contract.id IS NULL
      OR profession.id IS NULL
      OR worker.id IS NULL
      OR profession.contract_id <> assignment.contract_id
      OR assignment.status NOT IN ('planned', 'active', 'released')
      OR (assignment.status = 'active' AND (
        contract.status NOT IN ('active', 'suspended')
        OR worker.status <> 'assigned'
        OR worker.archived_at IS NOT NULL
        OR worker.profession <> profession.profession
        OR (profession.sponsorship_type IS NOT NULL AND worker.sponsorship_type <> profession.sponsorship_type)
        OR (profession.sponsorship_type = 'other' AND profession.sponsor_name IS NOT NULL
          AND worker.sponsor_name IS DISTINCT FROM profession.sponsor_name)
        OR worker.beneficiary_name IS DISTINCT FROM contract.client_name
        OR worker.client_site IS DISTINCT FROM contract.work_site
        OR worker.client_id IS DISTINCT FROM contract.client_id
        OR worker.assignment_start_date IS DISTINCT FROM substring(assignment.assigned_at from 1 for 10)
      ))
  `;

  const capacityOverruns = await sql`
    SELECT profession.id AS contract_profession_id,
      profession.contract_id,
      profession.profession,
      profession.required_count,
      COUNT(assignment.id)::integer AS active_count
    FROM contract_professions profession
    JOIN contract_worker_assignments assignment
      ON assignment.contract_profession_id = profession.id AND assignment.status = 'active'
    GROUP BY profession.id, profession.contract_id, profession.profession, profession.required_count
    HAVING COUNT(assignment.id) > profession.required_count
  `;

  const duplicateActiveWorkerAssignments = await sql`
    SELECT worker_id, COUNT(*)::integer AS active_count,
      ARRAY_AGG(contract_id ORDER BY contract_id) AS contract_ids
    FROM contract_worker_assignments
    WHERE status = 'active'
    GROUP BY worker_id
    HAVING COUNT(*) > 1
  `;

  const invalidWorkerStates = await sql`
    SELECT worker.id, worker.status, worker.client_id,
      worker.beneficiary_name, worker.client_site, worker.assignment_start_date
    FROM workers worker
    WHERE (worker.status = 'assigned' AND NOT EXISTS (
        SELECT 1 FROM contract_worker_assignments assignment
        WHERE assignment.worker_id = worker.id AND assignment.status = 'active'
      ))
      OR (worker.status <> 'assigned' AND EXISTS (
        SELECT 1 FROM contract_worker_assignments assignment
        WHERE assignment.worker_id = worker.id AND assignment.status = 'active'
      ))
      OR (NOT EXISTS (
        SELECT 1 FROM contract_worker_assignments assignment
        WHERE assignment.worker_id = worker.id AND assignment.status = 'active'
      ) AND (
        worker.client_id IS NOT NULL
        OR worker.beneficiary_name IS NOT NULL
        OR worker.assignment_start_date IS NOT NULL
        OR worker.client_site IS DISTINCT FROM CASE
          WHEN worker.archived_at IS NULL THEN 'غير مسند'
          ELSE 'مؤرشف'
        END
      ))
  `;

  const invalidAbsences = await sql`
    SELECT absence.id,
      absence.contract_id,
      absence.worker_id,
      absence.replacement_worker_id,
      absence.absence_date,
      absence.absence_end_date,
      payment.service_period,
      payment.billing_basis
    FROM contract_worker_absences absence
    LEFT JOIN contract_payment_schedules payment ON payment.id = absence.payment_schedule_id
    LEFT JOIN contract_professions profession ON profession.id = absence.contract_profession_id
    WHERE payment.id IS NULL
      OR profession.id IS NULL
      OR payment.contract_id <> absence.contract_id
      OR profession.contract_id <> absence.contract_id
      OR profession.profession <> absence.profession
      OR payment.service_period <> substring(absence.absence_date from 1 for 7)
      OR payment.billing_basis <> 'monthly_salary'
      OR absence.deduction_halalas <> absence.daily_rate_halalas * absence.absent_count
      OR absence.client_deduction_halalas <> CASE
        WHEN absence.replacement_worker_id IS NULL THEN absence.client_daily_rate_halalas * absence.absent_count
        ELSE 0
      END
      OR absence.replacement_worker_id = absence.worker_id
      OR (absence.worker_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM contract_worker_assignments assignment
        WHERE assignment.contract_id = absence.contract_id
          AND assignment.contract_profession_id = absence.contract_profession_id
          AND assignment.worker_id = absence.worker_id
          AND substring(assignment.assigned_at from 1 for 10) <= absence.absence_date
          AND (assignment.released_at IS NULL
            OR substring(assignment.released_at from 1 for 10) >= COALESCE(absence.absence_end_date, absence.absence_date))
      ))
  `;

  const invalidWorkerFinancials = await sql`
    SELECT financial.id,
      financial.category,
      financial.worker_id,
      financial.contract_id,
      financial.contract_payment_schedule_id,
      financial.period_month
    FROM financial_records financial
    LEFT JOIN workers worker ON worker.id = financial.worker_id
    LEFT JOIN contract_payment_schedules payment ON payment.id = financial.contract_payment_schedule_id
    WHERE financial.category IN ('worker_salary','worker_advance','worker_deduction','worker_violation','worker_expense')
      AND (
        worker.id IS NULL
        OR (financial.contract_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM contract_worker_assignments assignment
          WHERE assignment.worker_id = financial.worker_id
            AND assignment.contract_id = financial.contract_id
            AND substring(assignment.assigned_at from 1 for 10) <= financial.due_date
            AND (assignment.released_at IS NULL
              OR substring(assignment.released_at from 1 for 10) >= financial.due_date)
        ))
        OR (financial.category = 'worker_salary' AND (
          financial.contract_id IS NULL
          OR financial.period_month IS NULL
          OR payment.id IS NULL
          OR payment.contract_id IS DISTINCT FROM financial.contract_id
          OR payment.service_period IS DISTINCT FROM financial.period_month
          OR payment.status <> 'paid'
        ))
      )
  `;

  const overlappingAbsences = await sql`
    SELECT first_absence.id AS first_id, second_absence.id AS second_id
    FROM contract_worker_absences first_absence
    JOIN contract_worker_absences second_absence
      ON first_absence.id < second_absence.id
      AND first_absence.status = 'active'
      AND second_absence.status = 'active'
      AND first_absence.contract_id = second_absence.contract_id
      AND first_absence.contract_profession_id = second_absence.contract_profession_id
      AND first_absence.absence_date <= COALESCE(second_absence.absence_end_date, second_absence.absence_date)
      AND second_absence.absence_date <= COALESCE(first_absence.absence_end_date, first_absence.absence_date)
      AND (first_absence.worker_id IS NULL
        OR second_absence.worker_id IS NULL
        OR first_absence.worker_id = second_absence.worker_id)
  `;

  const replacementOverlaps = await sql`
    SELECT first_absence.id AS first_id, second_absence.id AS second_id,
      first_absence.replacement_worker_id
    FROM contract_worker_absences first_absence
    JOIN contract_worker_absences second_absence
      ON first_absence.id < second_absence.id
      AND first_absence.status = 'active'
      AND second_absence.status = 'active'
      AND first_absence.replacement_worker_id IS NOT NULL
      AND first_absence.replacement_worker_id = second_absence.replacement_worker_id
      AND first_absence.absence_date <= COALESCE(second_absence.absence_end_date, second_absence.absence_date)
      AND second_absence.absence_date <= COALESCE(first_absence.absence_end_date, first_absence.absence_date)
  `;

  const replacementAssignmentOverlaps = await sql`
    SELECT absence.id AS absence_id, absence.replacement_worker_id,
      assignment.id AS assignment_id, assignment.contract_id
    FROM contract_worker_absences absence
    JOIN contract_worker_assignments assignment
      ON assignment.worker_id = absence.replacement_worker_id
      AND substring(assignment.assigned_at from 1 for 10)
        <= COALESCE(absence.absence_end_date, absence.absence_date)
      AND (assignment.released_at IS NULL
        OR substring(assignment.released_at from 1 for 10) >= absence.absence_date)
    WHERE absence.status = 'active'
      AND absence.replacement_worker_id IS NOT NULL
  `;

  const invalidReverseInvoiceLinks = await sql`
    SELECT financial.id AS financial_id, financial.contract_payment_schedule_id,
      payment.id AS payment_id, payment.financial_record_id,
      payment.invoice_document_id, financial.document_id
    FROM financial_records financial
    LEFT JOIN contract_payment_schedules payment
      ON payment.id = financial.contract_payment_schedule_id
    WHERE financial.category IN ('workforce_invoice', 'workforce_supplier_payable')
      AND financial.contract_payment_schedule_id IS NOT NULL
      AND (payment.id IS NULL
        OR payment.financial_record_id IS DISTINCT FROM financial.id
        OR payment.invoice_document_id IS DISTINCT FROM financial.document_id)
  `;

  const unlinkedContractInvoices = await sql`
    SELECT id, category, contract_id, contract_payment_schedule_id, document_id
    FROM financial_records
    WHERE category IN ('workforce_invoice', 'workforce_supplier_payable')
      AND contract_id IS NOT NULL
      AND contract_payment_schedule_id IS NULL
  `;

  const incompleteProcessedPayments = await sql`
    SELECT id, contract_id, status, invoice_document_id, financial_record_id
    FROM contract_payment_schedules
    WHERE status IN ('invoiced', 'paid')
      AND (invoice_document_id IS NULL OR financial_record_id IS NULL)
  `;

  const duplicateMonthlyPayments = await sql`
    SELECT contract_id, service_period, COUNT(*)::integer AS payment_count
    FROM contract_payment_schedules
    WHERE billing_basis = 'monthly_salary' AND service_period IS NOT NULL
    GROUP BY contract_id, service_period
    HAVING COUNT(*) <> 1
  `;

  const role = await sql`SELECT role_key, permissions_json, active FROM portal_roles WHERE role_key = 'workforce_supervisor'`;
  const expected = ["overview.read", "workforce.read", "workforce.write", "contracts.read", "contracts.write"];
  let actual = [];
  try { actual = JSON.parse(role[0]?.permissions_json || "[]"); } catch {}
  const roleReady = Boolean(role[0]?.active)
    && JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());

  const missingStampObjects = await sql`
    SELECT stamp.id, stamp.name, stamp.storage_key
    FROM document_stamps stamp
    WHERE stamp.active = true AND NOT EXISTS (
      SELECT 1 FROM private.object_storage object WHERE object.storage_key = stamp.storage_key
    )
  `;

  const checks = {
    deductionMismatches,
    invalidFinancials,
    invalidAssignments,
    capacityOverruns,
    duplicateActiveWorkerAssignments,
    invalidWorkerStates,
    invalidAbsences,
    invalidWorkerFinancials,
    overlappingAbsences,
    replacementOverlaps,
    replacementAssignmentOverlaps,
    invalidReverseInvoiceLinks,
    unlinkedContractInvoices,
    incompleteProcessedPayments,
    duplicateMonthlyPayments,
    missingStampObjects,
  };
  const status = Object.values(checks).every((rows) => rows.length === 0) && roleReady ? "ok" : "mismatch";
  console.log(JSON.stringify({ status, roleReady, ...checks }, null, 2));
  if (status !== "ok") process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
