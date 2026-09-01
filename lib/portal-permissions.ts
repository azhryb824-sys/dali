export const availableRolePermissions = [
  "overview.read", "employees.read", "employees.write", "employees.approve",
  "finance.read", "finance.write", "finance.approve", "finance.post", "finance.pay",
  "legal.read", "legal.write", "legal.approve", "government.read", "government.write",
  "workforce.read", "workforce.write", "workforce.approve", "operations.read", "operations.write", "representatives.read", "representatives.write", "contracts.read", "contracts.write", "contracts.approve",
  "construction.read", "construction.write", "construction.approve", "documents.read", "documents.preview", "documents.write", "documents.share",
  "conversations.read", "conversations.write", "website.read", "website.write", "reports.read", "reports.export",
  "video.read", "video.manage", "video.transfer",
  "assets.administer", "users.administer", "integrations.administer",
] as const;

export type PortalPermission = (typeof availableRolePermissions)[number];
export type PermissionProfile = "read_only" | "operator" | "role_default";

export function parseRolePermissions(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function permissionsForProfile(rolePermissions: string[], profile: PermissionProfile) {
  const grantedByRole = new Set(rolePermissions);
  const readActions = new Set(["read", "export"]);
  const blockedOperatorActions = new Set(["approve", "post", "pay", "administer"]);
  return availableRolePermissions.map((permission) => {
    const [resource, action] = permission.split(".");
    const roleAllows = grantedByRole.has("*") || grantedByRole.has(permission);
    const allowed = profile === "read_only"
      ? roleAllows && readActions.has(action)
      : profile === "operator"
        ? roleAllows && !blockedOperatorActions.has(action)
        : roleAllows;
    return { resource, action, allowed };
  });
}
