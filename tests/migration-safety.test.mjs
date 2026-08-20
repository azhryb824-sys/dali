import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { createClient } from "@libsql/client";

async function apply(client, names) {
  for (const name of names) {
    const sql = (await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", "");
    await client.executeMultiple(sql);
  }
}

test("accounting migrations preserve existing contracts and financial records", async () => {
  const client = createClient({ url: "file::memory:" });
  const names = (await readdir(new URL("../drizzle/", import.meta.url))).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  await apply(client, names.filter((name) => Number(name.slice(0, 4)) <= 10));
  await client.execute({
    sql: `INSERT INTO company_documents(reference_code,title,category,file_name,storage_key,content_type,size_bytes,created_by) VALUES(?,?,?,?,?,?,?,?)`,
    args: ["DOC-SAFE", "عقد اختبار", "contract", "safe.pdf", "safe/key", "application/pdf", 100, "owner@example.com"],
  });
  const document = await client.execute("SELECT id FROM company_documents WHERE reference_code='DOC-SAFE'");
  await client.execute({
    sql: `INSERT INTO workforce_contracts(reference_code,document_id,client_name,title,work_site,issue_date,start_date,end_date,amount_halalas,details,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: ["CON-SAFE", document.rows[0].id, "عميل قائم", "عقد قائم", "مكة", "2026-01-01", "2026-01-01", "2026-12-31", 125000, "بيانات قائمة", "active", "owner@example.com"],
  });
  await client.execute({
    sql: `INSERT INTO financial_records(reference_code,category,description,amount_halalas,due_date,status) VALUES(?,?,?,?,?,?)`,
    args: ["FIN-SAFE", "invoice", "فاتورة قائمة", 125000, "2026-02-01", "pending"],
  });

  await apply(client, names.filter((name) => Number(name.slice(0, 4)) >= 11));
  const contract = await client.execute("SELECT reference_code,client_name,amount_halalas,status FROM workforce_contracts WHERE reference_code='CON-SAFE'");
  const financial = await client.execute("SELECT reference_code,description,amount_halalas,status,posting_status FROM financial_records WHERE reference_code='FIN-SAFE'");
  assert.equal(contract.rows.length, 1);
  assert.deepEqual({ ...contract.rows[0] }, { reference_code: "CON-SAFE", client_name: "عميل قائم", amount_halalas: 125000, status: "active" });
  assert.equal(financial.rows.length, 1);
  assert.deepEqual({ ...financial.rows[0] }, { reference_code: "FIN-SAFE", description: "فاتورة قائمة", amount_halalas: 125000, status: "pending", posting_status: "unposted" });
  const columns = await client.execute("PRAGMA table_info(financial_records)");
  assert.ok(columns.rows.some((column) => column.name === "bank_account_id"));

  await client.execute({ sql: "INSERT INTO contract_professions(contract_id,profession,required_count) VALUES(?,?,?)", args: [1, "عامل", 1] });
  await client.execute({ sql: "INSERT INTO workers(worker_number,full_name,nationality,profession,client_site,status) VALUES(?,?,?,?,?,?)", args: ["W-SAFE-1", "عامل أول", "سعودي", "عامل", "مكة", "available"] });
  await client.execute({ sql: "INSERT INTO workers(worker_number,full_name,nationality,profession,client_site,status) VALUES(?,?,?,?,?,?)", args: ["W-SAFE-2", "عامل ثان", "سعودي", "عامل", "مكة", "available"] });
  await client.execute("INSERT INTO contract_worker_assignments(contract_id,contract_profession_id,worker_id,status,assigned_by) VALUES(1,1,1,'active','owner@example.com')");
  await assert.rejects(
    client.execute("INSERT INTO contract_worker_assignments(contract_id,contract_profession_id,worker_id,status,assigned_by) VALUES(1,1,2,'active','owner@example.com')"),
    /CONTRACT_PROFESSION_CAPACITY_REACHED/,
  );
  await client.close();
});
