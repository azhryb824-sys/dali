import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("canonical roles have exact least-privilege grants", () => {
  const migration = read("drizzle-pg/0048_canonical_multi_role_rbac.sql");
  assert.match(migration, /'system_owner'.*'\["\*"\]'/);
  assert.match(migration, /'system_admin'.*'\["\*"\]'/);
  assert.match(migration, /'hr_officer'.*employees\.read.*employees\.write/);
  assert.match(migration, /'accountant'.*finance\.read.*finance\.write/);
  assert.match(migration, /'government_relations_officer'.*government\.read.*government\.write/);
  assert.match(migration, /'administrative_assistant'.*operations\.write.*contracts\.write.*documents\.write/);
  assert.match(migration, /'lawyer'.*legal\.read.*legal\.write/);
  for (const role of ["hr_officer","accountant","government_relations_officer","administrative_assistant","lawyer"]) {
    const row = migration.split("\n").find((line) => line.includes(`('${role}'`));
    assert.ok(row);
    assert.doesNotMatch(row, /\.(approve|post|pay|administer)/);
  }
});

test("new users require and persist multiple roles", () => {
  const route = read("app/api/portal/users/route.ts");
  assert.match(route, /Array\.isArray\(payload\.functionalRoles\)/);
  assert.match(route, /typeof payload\.functionalRoles === "string"/);
  assert.match(route, /يجب اختيار دور وظيفي واحد على الأقل/);
  assert.match(route, /portalAccessScopes\)\.values\(functionalRoles\.map/);
  assert.match(route, /combinedPermissions/);
  const dashboard = read("app/portal/PortalDashboard.tsx");
  const createUserBlock = dashboard.slice(dashboard.indexOf("async function createUser"), dashboard.indexOf("async function uploadDocument"));
  assert.match(createUserBlock, /formData\.getAll\("functionalRoles"\)/);
  assert.doesNotMatch(createUserBlock, /const payload = Object\.fromEntries\(new FormData\(form\)\.entries\(\)\)/);
  assert.match(dashboard, /type="checkbox" name="functionalRoles"/);
});

test("unauthorized pages are hidden and direct APIs enforce dedicated permissions", () => {
  const dashboard = read("app/portal/PortalDashboard.tsx");
  assert.match(dashboard, /canAccessGovernment\s*&&\s*\(\s*<button/);
  assert.match(dashboard, /canAccessOperations\s*&&\s*\(\s*<button/);
  assert.match(dashboard, /canAccessContracts[\s\S]*?<button/);
  assert.match(dashboard, /if \(!canOpenView\(next\)\)/);
  assert.doesNotMatch(dashboard, /currentUser\.role !== "employee" \|\| currentUser\.department === department/);
  assert.match(read("app/api/portal/government/route.ts"), /hasPortalPermission\(access,"government"/);
  assert.match(read("app/api/portal/operations/route.ts"), /hasPortalPermission\(access, "operations"/);
  assert.match(read("app/api/portal/contracts/[id]/status/route.ts"), /hasPortalPermission\(access, "contracts", "write"\)/);
});

test("approval bypass is limited to owner and supervisor", () => {
  const route = read("app/api/portal/contracts/[id]/status/route.ts");
  assert.match(route, /const canApprove = access\.role === "admin" \|\| access\.functionalRoles\.some/);
  assert.match(route, /اعتماد العقد متاح للمالك أو مشرف النظام فقط/);
  const access = read("lib/portal-access.ts");
  assert.doesNotMatch(access, /if \(access\.role === "manager"\) return action !== "administer"/);
});
