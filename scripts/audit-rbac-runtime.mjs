import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 1, prepare: false });

const expected = {
  system_owner: ["*"],
  system_admin: ["*"],
  hr_officer: ["overview.read","employees.read","employees.write"],
  accountant: ["overview.read","finance.read","finance.write"],
  government_relations_officer: ["overview.read","government.read","government.write"],
  administrative_assistant: ["overview.read","operations.read","operations.write","contracts.read","contracts.write","documents.read","documents.preview","documents.write","documents.share"],
  lawyer: ["overview.read","legal.read","legal.write","documents.read","documents.preview"],
};

try {
  const roles = await sql`SELECT role_key, permissions_json, active FROM public.portal_roles WHERE role_key IN ${sql(Object.keys(expected))}`;
  const byKey = new Map(roles.map((row) => [row.role_key, row]));
  const mismatches = [];
  for (const [roleKey, permissions] of Object.entries(expected)) {
    const row = byKey.get(roleKey);
    let actual = [];
    try { actual = JSON.parse(row?.permissions_json || "[]"); } catch {}
    if (!row?.active || JSON.stringify([...actual].sort()) !== JSON.stringify([...permissions].sort())) {
      mismatches.push({ roleKey, expected: permissions, actual, active: row?.active ?? false });
    }
  }
  const usersWithoutRoles = await sql`
    SELECT u.email, u.display_name
    FROM public.portal_users u
    WHERE u.status = 'active'
      AND u.role <> 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM public.portal_access_scopes s
        WHERE s.user_email = u.email AND s.active = true
      )
    ORDER BY u.email
  `;
  const forbiddenRoleApprovals = await sql`
    SELECT role_key, permission
    FROM public.portal_roles r
    CROSS JOIN LATERAL jsonb_array_elements_text(r.permissions_json::jsonb) permission
    WHERE r.active = true
      AND r.role_key NOT IN ('system_owner','system_admin')
      AND (permission = '*' OR permission ~ '\\.(approve|post|pay|administer)$')
  `;
  const outOfRoleOverrides = await sql`
    SELECT p.user_email, p.resource, p.action
    FROM public.portal_user_permissions p
    WHERE p.allowed = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.portal_access_scopes s
        JOIN public.portal_roles r ON r.role_key = s.functional_role AND r.active = true
        CROSS JOIN LATERAL jsonb_array_elements_text(r.permissions_json::jsonb) AS item(grant_name)
        WHERE s.user_email = p.user_email AND s.active = true
          AND (grant_name = '*' OR grant_name = p.resource || '.' || p.action)
      )
  `;
  const forbiddenUserApprovals = await sql`
    SELECT p.user_email, p.resource, p.action
    FROM public.portal_user_permissions p
    WHERE p.allowed = true
      AND p.action IN ('approve','post','pay','administer')
      AND NOT EXISTS (
        SELECT 1 FROM public.portal_access_scopes s
        WHERE s.user_email = p.user_email AND s.active = true
          AND s.functional_role IN ('system_owner','system_admin')
      )
  `;
  const status = !mismatches.length && !usersWithoutRoles.length && !forbiddenRoleApprovals.length && !outOfRoleOverrides.length && !forbiddenUserApprovals.length ? "ok" : "mismatch";
  console.log(JSON.stringify({ status, canonicalRoles: Object.keys(expected).length, mismatches, usersWithoutRoles, forbiddenRoleApprovals, outOfRoleOverrides, forbiddenUserApprovals }, null, 2));
  if (status !== "ok") process.exitCode = 1;
} finally {
  await sql.end();
}
