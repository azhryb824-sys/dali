import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("open and fixed quantity quotes remain linked to one contract with tax policy",async()=>{
  const[operations,contract,pdf,ui,migration]=await Promise.all([source("app/api/portal/operations/route.ts"),source("app/api/portal/documents/generate/route.ts"),source("lib/pdf-generator.ts"),source("app/portal/PortalDashboard.tsx"),source("drizzle-pg/0018_open_quantity_quote_contract_link.sql")]);
  assert.match(operations,/quantityMode === "open"/);assert.match(operations,/vatRateBps/);
  assert.match(contract,/عرض السعر المقبول/);assert.match(contract,/تم تحويل عرض السعر إلى عقد سابقًا/);assert.match(contract,/quoteVersionId/);
  assert.match(pdf,/الكميات مفتوحة/);assert.match(pdf,/الفواتير الفعلية/);assert.match(ui,/عرض السعر المرتبط/);assert.match(ui,/عدد مفتوح/);
  assert.match(migration,/workforce_contracts_quote_version_unique/);assert.match(migration,/quantity_mode/);
});

test("new users must replace the temporary password exactly once",async()=>{
  const[users,login,reset,schema,page,migration]=await Promise.all([source("app/api/portal/users/route.ts"),source("app/api/auth/login/route.ts"),source("app/api/auth/reset-password/route.ts"),source("db/schema.ts"),source("app/reset-password/page.tsx"),source("drizzle-pg/0019_first_login_password_change.sql")]);
  assert.match(users,/mustChangePassword: true/);assert.match(login,/credential\.mustChangePassword/);assert.match(login,/first=1/);
  assert.match(reset,/mustChangePassword: false/);assert.match(reset,/passwordChangedAt: now/);assert.match(reset,/isNull\(passwordResetTokens\.usedAt\)/);
  assert.match(schema,/mustChangePassword/);assert.match(page,/تُلغى المؤقتة نهائيًا/);assert.match(migration,/must_change_password/);
});
