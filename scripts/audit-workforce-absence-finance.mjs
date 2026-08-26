import postgres from "postgres";
const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error("DATABASE_URL is required");
const sql=postgres(databaseUrl,{max:1,prepare:false});
try{
  const deductionMismatches=await sql`
    SELECT p.id AS payment_id,p.absence_deduction_halalas,
      COALESCE(SUM(a.deduction_halalas) FILTER (WHERE a.status='active'),0)::integer AS expected
    FROM contract_payment_schedules p
    LEFT JOIN contract_worker_absences a ON a.payment_schedule_id=p.id
    GROUP BY p.id,p.absence_deduction_halalas
    HAVING p.absence_deduction_halalas<>COALESCE(SUM(a.deduction_halalas) FILTER (WHERE a.status='active'),0)
  `;
  const invalidFinancials=await sql`
    SELECT p.id AS payment_id,p.financial_record_id,f.amount_halalas,
      GREATEST(0,p.subtotal_halalas-p.absence_deduction_halalas)
      + ROUND(GREATEST(0,p.subtotal_halalas-p.absence_deduction_halalas)*p.vat_rate_bps/10000.0)::integer AS expected
    FROM contract_payment_schedules p JOIN financial_records f ON f.id=p.financial_record_id
    WHERE f.amount_halalas<>GREATEST(0,p.subtotal_halalas-p.absence_deduction_halalas)
      + ROUND(GREATEST(0,p.subtotal_halalas-p.absence_deduction_halalas)*p.vat_rate_bps/10000.0)::integer
  `;
  const invalidAbsences=await sql`
    SELECT a.id,a.contract_id,a.absence_date,p.service_period,p.billing_basis
    FROM contract_worker_absences a JOIN contract_payment_schedules p ON p.id=a.payment_schedule_id
    WHERE p.contract_id<>a.contract_id OR p.service_period<>substring(a.absence_date from 1 for 7)
      OR p.billing_basis<>'monthly_salary'
  `;
  const role=await sql`SELECT role_key,permissions_json,active FROM portal_roles WHERE role_key='workforce_supervisor'`;
  const expected=["overview.read","workforce.read","workforce.write","contracts.read","contracts.write"];
  let actual=[];try{actual=JSON.parse(role[0]?.permissions_json||"[]")}catch{}
  const roleReady=Boolean(role[0]?.active)&&JSON.stringify([...actual].sort())===JSON.stringify([...expected].sort());
  const missingStampObjects=await sql`
    SELECT s.id,s.name,s.storage_key FROM document_stamps s
    WHERE s.active=true AND NOT EXISTS (
      SELECT 1 FROM private.object_storage o WHERE o.storage_key=s.storage_key
    )
  `;
  const status=!deductionMismatches.length&&!invalidFinancials.length&&!invalidAbsences.length&&roleReady&&!missingStampObjects.length?"ok":"mismatch";
  console.log(JSON.stringify({status,roleReady,deductionMismatches,invalidFinancials,invalidAbsences,missingStampObjects},null,2));
  if(status!=="ok")process.exitCode=1;
}finally{await sql.end({timeout:5})}
