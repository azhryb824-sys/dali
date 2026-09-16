import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
const backupPath = process.env.DALI_PURGE_BACKUP?.trim();
const confirmation = process.env.DALI_PURGE_CONFIRM?.trim();
const requiredConfirmation = "DELETE_OPERATIONAL_DATA_KEEP_USERS_EMPLOYEES";

if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");
if (!backupPath?.startsWith("/var/backups/dali/db-purge-") || !backupPath.endsWith("/dali-before-purge.dump")) {
  throw new Error("SAFE_BACKUP_PATH_REQUIRED");
}
if (confirmation !== requiredConfirmation) throw new Error("EXPLICIT_CONFIRMATION_MISSING");

const quoteIdentifier = (value) => {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`UNSAFE_IDENTIFIER:${value}`);
  return `"${value}"`;
};

const run = (command, args, extraEnv = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, ...extraEnv },
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command.toUpperCase()}_FAILED:${signal || code}`));
    });
  });

const postgresCliEnvironment = (value) => {
  try {
    const parsed = new URL(value);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new Error("UNSUPPORTED_PROTOCOL");
    }

    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    const userName = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    if (!parsed.hostname || !databaseName || !userName) throw new Error("INCOMPLETE_CONNECTION");

    const environment = {
      PGHOST: parsed.hostname,
      PGPORT: parsed.port || "5432",
      PGUSER: userName,
      PGDATABASE: databaseName,
      PGCONNECT_TIMEOUT: "10",
      PGAPPNAME: "dali-operational-purge-backup",
    };
    if (password) environment.PGPASSWORD = password;

    const sslMode = parsed.searchParams.get("sslmode");
    if (sslMode) environment.PGSSLMODE = sslMode;
    return environment;
  } catch {
    throw new Error("DATABASE_URL_UNSUPPORTED_FOR_POSTGRES_CLI");
  }
};

const sha256File = (path) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });

const schemaSource = readFileSync("db/schema.ts", "utf8");
const expectedTables = [...schemaSource.matchAll(/pgTable\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
const expectedTableSet = new Set(expectedTables);

const preservedTables = new Set([
  "portal_settings",
  "portal_users",
  "portal_auth_credentials",
  "portal_mfa_challenges",
  "password_reset_tokens",
  "portal_sessions",
  "portal_user_presence",
  "employees",
  "employee_documents",
  "company_holidays",
  "employee_leave_policies",
  "portal_attendance_policies",
  "legal_lawyers",
  "desktop_devices",
  "pwa_devices",
  "pwa_enrollment_tokens",
  "pwa_device_challenges",
  "company_assets",
  "document_stamps",
  "government_sites",
  "portal_user_permissions",
  "portal_roles",
  "chart_of_accounts",
  "fiscal_periods",
  "bank_accounts",
  "accounting_posting_rules",
  "business_lines",
  "service_regions",
  "service_cities",
  "service_coverage",
]);

const selectiveTables = new Set(["portal_access_scopes", "cost_centers", "company_documents"]);
const deleteAllTables = expectedTables.filter(
  (table) => !preservedTables.has(table) && !selectiveTables.has(table),
);
const deleteAllSet = new Set(deleteAllTables);

if (expectedTables.length !== 123 || expectedTableSet.size !== 123) {
  throw new Error(`UNEXPECTED_REPOSITORY_SCHEMA_TABLE_COUNT:${expectedTables.length}`);
}
if (preservedTables.size !== 30 || selectiveTables.size !== 3 || deleteAllTables.length !== 90) {
  throw new Error("PURGE_CLASSIFICATION_INVARIANT_FAILED");
}
for (const table of [...preservedTables, ...selectiveTables]) {
  if (!expectedTableSet.has(table)) throw new Error(`CLASSIFIED_TABLE_NOT_IN_SCHEMA:${table}`);
}

const corporateDocumentTypes = [
  "commercial_registration",
  "municipal_license",
  "vat_certificate",
  "national_address",
  "chamber_membership",
  "zakat_certificate",
  "saudization_certificate",
  "insurance_certificate",
  "other_company_document",
];
const corporateDocumentSql = corporateDocumentTypes.map((value) => `'${value}'`).join(",");

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  idle_timeout: 20,
});
const pgDumpEnvironment = postgresCliEnvironment(databaseUrl);

const countTable = async (client, table) => {
  const [row] = await client.unsafe(
    `select count(*)::text as count from public.${quoteIdentifier(table)}`,
  );
  return row.count;
};

const countAll = async (client, tables) => {
  const result = {};
  for (const table of [...tables].sort()) result[table] = await countTable(client, table);
  return result;
};

const summarizeStorageReferences = async (client, tables) => {
  const byTable = {};
  let totalReferences = 0;
  let missingObjects = 0;

  for (const table of [...tables].sort()) {
    const [counts] = await client.unsafe(`
      select
        count(*) filter (
          where source.storage_key is not null and source.storage_key <> ''
        )::int as references,
        count(*) filter (
          where source.storage_key is not null and source.storage_key <> ''
            and stored.storage_key is null
        )::int as missing
      from public.${quoteIdentifier(table)} source
      left join private.object_storage stored on stored.storage_key = source.storage_key
    `);
    const references = Number(counts?.references || 0);
    const missing = Number(counts?.missing || 0);
    byTable[table] = { references, missingObjects: missing };
    totalReferences += references;
    missingObjects += missing;
  }

  return { totalReferences, missingObjects, byTable };
};

const difference = (left, right) => [...left].filter((value) => !right.has(value)).sort();

try {
  const [identity] = await sql`
    select current_database() as database_name,
           current_user as database_user,
           current_setting('server_version') as server_version,
           now()::text as checked_at
  `;
  const actualRows = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `;
  const actualTables = new Set(actualRows.map((row) => row.table_name));
  const missingTables = difference(expectedTableSet, actualTables);
  const unexpectedTables = difference(actualTables, expectedTableSet);
  if (missingTables.length || unexpectedTables.length) {
    throw new Error(
      `LIVE_SCHEMA_MISMATCH:missing=${missingTables.join(",") || "none"};unexpected=${unexpectedTables.join(",") || "none"}`,
    );
  }

  const migrationBytes = readFileSync("drizzle-pg/0070_contract_payment_partial_settlements.sql");
  const migrationChecksum = createHash("sha256").update(migrationBytes).digest("hex");
  const [migration] = await sql`
    select name, checksum
    from private.__dali_migrations
    where name = '0070_contract_payment_partial_settlements.sql'
    limit 1
  `;
  if (!migration || migration.checksum !== migrationChecksum) {
    throw new Error("LIVE_MIGRATION_0070_MISSING_OR_CHANGED");
  }

  const invalidIndexes = await sql`
    select ns.nspname as schema_name, tbl.relname as table_name, idx.relname as index_name
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    join pg_class tbl on tbl.oid = i.indrelid
    join pg_namespace ns on ns.oid = tbl.relnamespace
    where ns.nspname in ('public', 'private') and (not i.indisvalid or not i.indisready)
    order by ns.nspname, tbl.relname, idx.relname
  `;
  if (invalidIndexes.length) throw new Error(`INVALID_INDEXES_PRESENT:${invalidIndexes.length}`);

  const result = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(644255071)`;
    await tx.unsafe("set local lock_timeout = '15s'");
    await tx.unsafe("set local statement_timeout = '15min'");
    await tx.unsafe("set local idle_in_transaction_session_timeout = '20min'");
    await tx.unsafe("set local row_security = off");

    const lockTargets = [...expectedTables]
      .sort()
      .map((table) => `public.${quoteIdentifier(table)}`)
      .concat('private."object_storage"');
    await tx.unsafe(`lock table ${lockTargets.join(", ")} in share row exclusive mode`);

    const before = await countAll(tx, expectedTables);
    const preservedBefore = Object.fromEntries(
      [...preservedTables].sort().map((table) => [table, before[table]]),
    );
    const [selectiveBefore] = await tx.unsafe(`
      select
        (select count(*)::text from public.portal_access_scopes where project_id is null) as global_access_scopes,
        (select count(*)::text from public.portal_access_scopes where project_id is not null) as project_access_scopes,
        (select count(*)::text from public.cost_centers where contract_id is null and center_type not in ('contract','project')) as retained_cost_centers,
        (select count(*)::text from public.company_documents where source = 'uploaded' and document_type in (${corporateDocumentSql})) as corporate_documents,
        (select count(*)::text from private.object_storage) as stored_objects
    `);
    if (selectiveBefore.project_access_scopes !== "0") {
      throw new Error(`PROJECT_SCOPED_PERMISSIONS_REQUIRE_REVIEW:${selectiveBefore.project_access_scopes}`);
    }

    const [snapshot] = await tx`select pg_export_snapshot() as snapshot_id`;
    await run(
      "pg_dump",
      [
        "--format=custom",
        "--compress=6",
        "--no-owner",
        "--no-acl",
        `--snapshot=${snapshot.snapshot_id}`,
        `--file=${backupPath}`,
      ],
      pgDumpEnvironment,
    );
    await run("pg_restore", ["--file=/dev/null", backupPath]);
    const backupSha256 = await sha256File(backupPath);

    await tx.unsafe(`
      create temporary table _dali_purge_storage_keys (
        storage_key text primary key
      ) on commit drop
    `);

    const storageKeyTables = await tx`
      select table_name
      from information_schema.columns
      where table_schema = 'public' and column_name = 'storage_key'
      order by table_name
    `;
    const storageReferenceTables = storageKeyTables.map((row) => String(row.table_name));
    const storageReferencesBefore = await summarizeStorageReferences(tx, storageReferenceTables);
    for (const row of storageKeyTables) {
      const table = row.table_name;
      if (deleteAllSet.has(table)) {
        await tx.unsafe(`
          insert into _dali_purge_storage_keys (storage_key)
          select storage_key from public.${quoteIdentifier(table)}
          where storage_key is not null and storage_key <> ''
          on conflict do nothing
        `);
      }
    }
    await tx.unsafe(`
      insert into _dali_purge_storage_keys (storage_key)
      select storage_key from public.company_documents
      where not (source = 'uploaded' and document_type in (${corporateDocumentSql}))
      on conflict do nothing
    `);
    await tx.unsafe(`
      insert into _dali_purge_storage_keys (storage_key)
      select original_storage_key from public.contract_signature_requests
      where original_storage_key is not null and original_storage_key <> ''
      on conflict do nothing
    `);
    await tx.unsafe(`
      insert into _dali_purge_storage_keys (storage_key)
      select signed_storage_key from public.contract_signature_requests
      where signed_storage_key is not null and signed_storage_key <> ''
      on conflict do nothing
    `);
    const [capturedKeys] = await tx`select count(*)::text as count from _dali_purge_storage_keys`;

    await tx`delete from portal_access_scopes where project_id is not null`;
    await tx`delete from cost_centers where contract_id is not null or center_type in ('contract','project')`;

    const foreignKeys = await tx`
      select
        con.oid::text as constraint_oid,
        child.relname as child_table,
        parent.relname as parent_table,
        con.conname as constraint_name,
        con.confdeltype as delete_action,
        array_agg(att.attname order by key_column.ordinality) as child_columns,
        bool_and(not att.attnotnull) as child_columns_nullable
      from pg_constraint con
      join pg_class child on child.oid = con.conrelid
      join pg_namespace child_ns on child_ns.oid = child.relnamespace
      join pg_class parent on parent.oid = con.confrelid
      join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
      join lateral unnest(con.conkey) with ordinality as key_column(attnum, ordinality) on true
      join pg_attribute att on att.attrelid = child.oid and att.attnum = key_column.attnum
      where con.contype = 'f'
        and child_ns.nspname = 'public'
        and parent_ns.nspname = 'public'
      group by con.oid, child.relname, parent.relname, con.conname
      order by child.relname, parent.relname, con.conname
    `;

    const allowedCrossBoundary = new Set([
      "cost_centers->workforce_contracts",
      "portal_access_scopes->construction_projects",
    ]);
    const unexpectedCrossBoundary = foreignKeys
      .filter((foreignKey) => deleteAllSet.has(foreignKey.parent_table) && !deleteAllSet.has(foreignKey.child_table))
      .map((foreignKey) => `${foreignKey.child_table}->${foreignKey.parent_table}`)
      .filter((pair) => !allowedCrossBoundary.has(pair));
    if (unexpectedCrossBoundary.length) {
      throw new Error(`UNEXPECTED_PRESERVED_TO_DELETED_FK:${[...new Set(unexpectedCrossBoundary)].join(",")}`);
    }

    const nullifiedSelfConstraints = [];
    for (const foreignKey of foreignKeys) {
      if (
        foreignKey.child_table !== foreignKey.parent_table ||
        !deleteAllSet.has(foreignKey.child_table)
      ) {
        continue;
      }
      if (!foreignKey.child_columns_nullable) {
        const predicate = foreignKey.child_columns
          .map((column) => `${quoteIdentifier(column)} is not null`)
          .join(" or ");
        const [referenceCount] = await tx.unsafe(
          `select count(*)::text as count from public.${quoteIdentifier(foreignKey.child_table)} where ${predicate}`,
        );
        if (referenceCount.count !== "0" && foreignKey.delete_action !== "c") {
          throw new Error(`NON_NULLABLE_SELF_REFERENCE:${foreignKey.constraint_name}`);
        }
        continue;
      }
      const assignments = foreignKey.child_columns
        .map((column) => `${quoteIdentifier(column)} = null`)
        .join(", ");
      const predicate = foreignKey.child_columns
        .map((column) => `${quoteIdentifier(column)} is not null`)
        .join(" or ");
      await tx.unsafe(
        `update public.${quoteIdentifier(foreignKey.child_table)} set ${assignments} where ${predicate}`,
      );
      nullifiedSelfConstraints.push(foreignKey.constraint_name);
    }

    let remaining = new Set(deleteAllTables);
    let edges = foreignKeys.filter(
      (foreignKey) =>
        foreignKey.child_table !== foreignKey.parent_table &&
        remaining.has(foreignKey.child_table) &&
        remaining.has(foreignKey.parent_table),
    );
    const nullifiedCycleConstraints = [];
    const deletionOrder = [];

    while (remaining.size) {
      const candidates = [...remaining]
        .filter(
          (table) =>
            !edges.some(
              (foreignKey) =>
                remaining.has(foreignKey.child_table) &&
                remaining.has(foreignKey.parent_table) &&
                foreignKey.parent_table === table,
            ),
        )
        .sort();

      if (!candidates.length) {
        const breakable = edges.find(
          (foreignKey) =>
            remaining.has(foreignKey.child_table) &&
            remaining.has(foreignKey.parent_table) &&
            foreignKey.child_columns_nullable,
        );
        if (!breakable) throw new Error(`NON_NULLABLE_FOREIGN_KEY_CYCLE:${[...remaining].sort().join(",")}`);
        const assignments = breakable.child_columns
          .map((column) => `${quoteIdentifier(column)} = null`)
          .join(", ");
        const predicate = breakable.child_columns
          .map((column) => `${quoteIdentifier(column)} is not null`)
          .join(" or ");
        await tx.unsafe(
          `update public.${quoteIdentifier(breakable.child_table)} set ${assignments} where ${predicate}`,
        );
        nullifiedCycleConstraints.push(breakable.constraint_name);
        edges = edges.filter((foreignKey) => foreignKey.constraint_oid !== breakable.constraint_oid);
        continue;
      }

      for (const table of candidates) {
        await tx.unsafe(`delete from public.${quoteIdentifier(table)}`);
        deletionOrder.push(table);
        remaining.delete(table);
      }
      edges = edges.filter(
        (foreignKey) => remaining.has(foreignKey.child_table) && remaining.has(foreignKey.parent_table),
      );
    }

    await tx.unsafe(`
      delete from public.company_documents
      where not (source = 'uploaded' and document_type in (${corporateDocumentSql}))
    `);

    await tx`
      update portal_user_presence
      set current_interview_id = null,
          availability = case when availability = 'busy' then 'online' else availability end,
          updated_at = current_timestamp::text
      where current_interview_id is not null
    `;
    await tx`
      update desktop_devices
      set last_activity_id = 0,
          updated_at = current_timestamp::text
      where last_activity_id <> 0
    `;

    for (const row of storageKeyTables) {
      const table = row.table_name;
      await tx.unsafe(`
        delete from _dali_purge_storage_keys candidates
        where exists (
          select 1 from public.${quoteIdentifier(table)} retained
          where retained.storage_key = candidates.storage_key
        )
      `);
    }
    await tx`delete from _dali_purge_storage_keys where storage_key like 'website-assets/%'`;
    const storageDeleteResult = await tx`
      delete from private.object_storage stored
      using _dali_purge_storage_keys candidates
      where stored.storage_key = candidates.storage_key
    `;
    const storageReferencesAfter = await summarizeStorageReferences(tx, storageReferenceTables);

    for (const table of storageReferenceTables) {
      const beforeIntegrity = storageReferencesBefore.byTable[table];
      const afterIntegrity = storageReferencesAfter.byTable[table];
      if (afterIntegrity.missingObjects > beforeIntegrity.missingObjects) {
        throw new Error(
          `STORAGE_REFERENCE_REGRESSION:${table}:before=${beforeIntegrity.missingObjects}:after=${afterIntegrity.missingObjects}`,
        );
      }
      if (
        preservedTables.has(table) &&
        afterIntegrity.missingObjects !== beforeIntegrity.missingObjects
      ) {
        throw new Error(
          `PRESERVED_STORAGE_REFERENCE_CHANGED:${table}:before=${beforeIntegrity.missingObjects}:after=${afterIntegrity.missingObjects}`,
        );
      }
      if (
        deleteAllSet.has(table) &&
        (afterIntegrity.references !== 0 || afterIntegrity.missingObjects !== 0)
      ) {
        throw new Error(`DELETED_TABLE_STORAGE_REFERENCES_REMAIN:${table}`);
      }
    }

    const after = await countAll(tx, expectedTables);
    for (const table of deleteAllTables) {
      if (after[table] !== "0") throw new Error(`TARGET_TABLE_NOT_EMPTY:${table}:${after[table]}`);
    }
    for (const [table, count] of Object.entries(preservedBefore)) {
      if (after[table] !== count) {
        throw new Error(`PRESERVED_TABLE_CHANGED:${table}:before=${count}:after=${after[table]}`);
      }
    }
    const [selectiveAfter] = await tx.unsafe(`
      select
        (select count(*)::text from public.portal_access_scopes where project_id is null) as global_access_scopes,
        (select count(*)::text from public.portal_access_scopes where project_id is not null) as project_access_scopes,
        (select count(*)::text from public.cost_centers where contract_id is null and center_type not in ('contract','project')) as retained_cost_centers,
        (select count(*)::text from public.cost_centers where contract_id is not null or center_type in ('contract','project')) as operational_cost_centers,
        (select count(*)::text from public.company_documents where source = 'uploaded' and document_type in (${corporateDocumentSql})) as corporate_documents,
        (select count(*)::text from public.company_documents where not (source = 'uploaded' and document_type in (${corporateDocumentSql}))) as operational_documents,
        (select count(*)::text from private.object_storage) as stored_objects
    `);
    if (
      selectiveAfter.global_access_scopes !== selectiveBefore.global_access_scopes ||
      selectiveAfter.retained_cost_centers !== selectiveBefore.retained_cost_centers ||
      selectiveAfter.corporate_documents !== selectiveBefore.corporate_documents
    ) {
      throw new Error("SELECTIVE_PRESERVATION_INVARIANT_FAILED");
    }
    if (
      selectiveAfter.project_access_scopes !== "0" ||
      selectiveAfter.operational_cost_centers !== "0" ||
      selectiveAfter.operational_documents !== "0"
    ) {
      throw new Error("SELECTIVE_PURGE_INVARIANT_FAILED");
    }

    const deletedRowsByTable = {};
    for (const table of deleteAllTables.sort()) deletedRowsByTable[table] = before[table];
    deletedRowsByTable.portal_access_scopes = String(
      BigInt(before.portal_access_scopes) - BigInt(after.portal_access_scopes),
    );
    deletedRowsByTable.cost_centers = String(BigInt(before.cost_centers) - BigInt(after.cost_centers));
    deletedRowsByTable.company_documents = String(
      BigInt(before.company_documents) - BigInt(after.company_documents),
    );

    return {
      status: "purged",
      identity,
      schema: {
        expectedPublicTables: expectedTables.length,
        actualPublicTables: actualTables.size,
        migration0070Verified: true,
        invalidIndexes: 0,
      },
      backup: {
        path: backupPath,
        sha256: backupSha256,
        verifiedByPgRestore: true,
      },
      preserved: {
        portalUsers: after.portal_users,
        authCredentials: after.portal_auth_credentials,
        employees: after.employees,
        employeeDocuments: after.employee_documents,
        legalLawyers: after.legal_lawyers,
        roles: after.portal_roles,
        permissions: after.portal_user_permissions,
        globalAccessScopes: selectiveAfter.global_access_scopes,
        corporateDocuments: selectiveAfter.corporate_documents,
      },
      deletedRowsByTable,
      storage: {
        before: selectiveBefore.stored_objects,
        capturedOperationalKeys: capturedKeys.count,
        deletedOperationalObjects: String(storageDeleteResult.count ?? 0),
        after: selectiveAfter.stored_objects,
        referenceIntegrityBefore: storageReferencesBefore,
        referenceIntegrityAfter: storageReferencesAfter,
        introducedMissingReferences: 0,
      },
      deletionOrder,
      nullifiedCycleConstraints,
      nullifiedSelfConstraints,
    };
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
