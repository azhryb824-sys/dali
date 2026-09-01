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
  assert.match(dashboard, /pattern="\(\?=\.\*\[a-z\]\)\(\?=\.\*\[A-Z\]\)\(\?=\.\*\[0-9\]\)\(\?=\.\*\[\^A-Za-z0-9\]\)\.\{12,128\}"/);
});

test("access scope roles follow active role definitions instead of a stale hard-coded check", () => {
  const migration = read("drizzle-pg/0062_dynamic_access_scope_roles.sql");
  assert.match(migration, /DROP CONSTRAINT IF EXISTS "portal_access_scopes_role_check"/);
  assert.match(migration, /FOREIGN KEY \("functional_role"\) REFERENCES public\.portal_roles \("role_key"\)\s+ON DELETE RESTRICT/);
  assert.match(migration, /VALIDATE CONSTRAINT "portal_access_scopes_functional_role_fk"/);

  const schema = read("db/schema.ts");
  const accessScopes = schema.slice(schema.indexOf("export const portalAccessScopes"), schema.indexOf("export const constructionRecords"));
  assert.match(accessScopes, /functionalRole: text\("functional_role"\)[\s\S]*?references\(\(\) => portalRoles\.roleKey, \{ onDelete: "restrict" \}\)/);
});

test("sales and purchasing representatives are assignable with isolated request permissions", () => {
  const migration = read("drizzle-pg/0063_representative_portal_roles.sql");
  const users = read("app/api/portal/users/route.ts");
  const permissions = read("lib/portal-permissions.ts");
  const dashboard = read("app/portal/PortalDashboard.tsx");
  const representatives = read("app/api/portal/sales-representatives/route.ts");
  const requests = read("app/api/portal/representative-requests/route.ts");
  for (const role of ["sales_representative", "purchasing_representative"]) {
    assert.match(migration, new RegExp(`'${role}'`));
    assert.match(users, new RegExp(`"${role}"`));
    assert.match(dashboard, new RegExp(`"${role}"`));
  }
  assert.match(migration, /representatives\.read/);
  assert.match(migration, /representatives\.write/);
  assert.doesNotMatch(migration, /\.(approve|post|pay|administer)/);
  assert.match(permissions, /"representatives\.read", "representatives\.write"/);
  assert.match(dashboard, /canAccessRepresentatives/);
  assert.match(representatives, /visibleRepresentatives = owner \? representatives : ownRepresentatives/);
  assert.match(representatives, /!access \|\| !isOwner\(access\)/);
  assert.match(requests, /rep\.representativeType==="sales"&&!a\.functionalRoles\.includes\("sales_representative"\)/);
  assert.match(requests, /rep\.representativeType==="purchasing"&&!a\.functionalRoles\.includes\("purchasing_representative"\)/);
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
