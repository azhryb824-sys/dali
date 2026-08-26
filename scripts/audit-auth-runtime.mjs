import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");

const normalizeIdentifier = (value = "") => value
  .trim()
  .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
  .replace(/\D/g, "");

const supportedHash = (value = "") => {
  const [algorithm, iterationsValue, saltValue, hashValue] = value.split("$");
  const iterations = Number(iterationsValue);
  return algorithm === "pbkdf2"
    && Number.isInteger(iterations)
    && iterations >= 210_000
    && /^[A-Za-z0-9_-]{16,}$/.test(saltValue || "")
    && /^[A-Za-z0-9_-]{32,}$/.test(hashValue || "");
};

const requiredColumns = new Map([
  ["portal_users", ["email", "display_name", "role", "department", "status", "preferred_language", "language_selected_at", "last_login_at", "last_activity_at", "updated_at"]],
  ["portal_auth_credentials", ["identifier", "email", "display_name", "password_hash", "must_change_password", "password_changed_at", "created_at", "updated_at"]],
  ["password_reset_tokens", ["token_hash", "identifier", "email", "expires_at", "used_at", "created_at"]],
  ["public_rate_limits", ["key", "window_started_at", "request_count", "blocked_until", "updated_at"]],
]);

const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });
try {
  const columns = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('portal_users', 'portal_auth_credentials', 'password_reset_tokens', 'public_rate_limits')
  `;
  const actual = new Map();
  for (const row of columns) {
    const names = actual.get(row.table_name) ?? new Set();
    names.add(row.column_name);
    actual.set(row.table_name, names);
  }

  const missingTables = [...requiredColumns.keys()].filter((table) => !actual.has(table));
  const missingColumns = [];
  for (const [table, names] of requiredColumns) {
    if (!actual.has(table)) continue;
    for (const name of names) if (!actual.get(table).has(name)) missingColumns.push(`${table}.${name}`);
  }

  const credentialRows = missingTables.includes("portal_auth_credentials")
    ? []
    : await sql`select identifier, email, password_hash from portal_auth_credentials`;
  const invalidCredentialRows = credentialRows
    .filter((row) => !/^\d{10}$/.test(String(row.identifier || "")) || !String(row.email || "").includes("@") || !supportedHash(String(row.password_hash || "")))
    .map((row) => String(row.identifier || "invalid").slice(0, 3) + "*******");

  const configuredIdentifier = normalizeIdentifier(process.env.PORTAL_ADMIN_IDENTIFIER || process.env.PORTAL_ADMIN_ID || "");
  const configuredEmails = [process.env.PORTAL_ADMIN_EMAIL, process.env.PORTAL_ADMIN_EMAILS]
    .flatMap((value) => (value || "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const configuredHashValid = supportedHash(process.env.PORTAL_ADMIN_PASSWORD_HASH || "");
  const bootstrapComplete = /^\d{10}$/.test(configuredIdentifier)
    && configuredEmails.length > 0
    && configuredHashValid;
  const configuredCredentialStored = configuredIdentifier
    ? credentialRows.some((row) => String(row.identifier) === configuredIdentifier)
    : false;
  const authSecretReady = (process.env.AUTH_SECRET || "").length >= 32;
  const authMode = (process.env.AUTH_MODE || "credentials").trim() || "credentials";

  const [blocked] = missingTables.includes("public_rate_limits")
    ? [{ count: 0 }]
    : await sql`select count(*)::int as count from public_rate_limits where blocked_until is not null and blocked_until > ${new Date().toISOString()}`;

  const credentialLoginReady = authMode !== "credentials"
    || (authSecretReady && (credentialRows.length > 0 || bootstrapComplete));
  const status = missingTables.length || missingColumns.length || invalidCredentialRows.length || !credentialLoginReady
    ? "mismatch"
    : "ok";

  const result = {
    status,
    authMode,
    authSecretReady,
    credentialCount: credentialRows.length,
    invalidCredentialRows,
    bootstrapComplete,
    configuredCredentialStored,
    activeRateLimitBlocks: Number(blocked?.count || 0),
    missingTables,
    missingColumns,
  };
  console.log(JSON.stringify(result, null, 2));
  if (status !== "ok") process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
