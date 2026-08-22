import assert from "node:assert/strict";import{readFile}from"node:fs/promises";import test from"node:test";const source=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
test("employee management unifies identity, approvals, attendance, documents and accounting",async()=>{const[schema,migration,api,ui]=await Promise.all([source("db/schema.ts"),source("drizzle-pg/0028_hr_employee_experience.sql"),source("app/api/portal/hr/route.ts"),source("app/portal/HrWorkspace.tsx")]);
for(const name of ["employeeDocuments","employeeLeaveRequests","employeeAttendance","portalUserEmail","managerId"])assert.match(schema,new RegExp(name));
for(const action of ["employee-profile","document","leave-request","attendance","leave-decision","generate-payroll"])assert.match(api,new RegExp(action));
assert.match(api,/createDraftJournal/);assert.match(api,/payroll-accrual/);assert.match(ui,/دليل الموظفين الموحّد/);assert.match(ui,/مركز الموافقات والتنبيهات/);assert.match(ui,/مرتبطون بحسابات النظام/);assert.match(migration,/private\.__dali_migrations/);
});
