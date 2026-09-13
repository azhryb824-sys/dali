import assert from "node:assert/strict";
import test from "node:test";
import {
  inferPermissionProfile,
  permissionsForProfile,
} from "../lib/portal-permissions.ts";

const rolePermissions = [
  "overview.read",
  "contracts.read",
  "contracts.write",
  "contracts.approve",
];

for (const profile of ["role_default", "operator", "read_only"]) {
  test(`infers the ${profile} permission profile from its exhaustive stored rules`, () => {
    const rules = permissionsForProfile(rolePermissions, profile).map((rule) => ({
      ...rule,
      scope: "department",
    }));
    assert.equal(inferPermissionProfile(rolePermissions, rules), profile);
  });
}

test("preserves partial or scope-specific rules as a custom profile", () => {
  assert.equal(inferPermissionProfile(rolePermissions, [
    { resource: "contracts", action: "read", allowed: true, scope: "own" },
  ]), "custom");
});

test("root permissions always remain the full role-default profile", () => {
  assert.equal(inferPermissionProfile(["*"], []), "role_default");
});
