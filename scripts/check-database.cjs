const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const rootDir = path.resolve(__dirname, "..");
const databasePath = path.join(rootDir, "prisma", "dev.db");
const requiredTables = [
  "companies",
  "users",
  "roles",
  "org_units",
  "customers",
  "projects",
  "quotations",
  "contracts",
  "payment_records",
  "attachments",
  "operation_logs",
];

function fail(message) {
  console.error(`[database-check] ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(databasePath)) {
  fail("Local database prisma/dev.db does not exist.");
  process.exit();
}

const database = new Database(databasePath, { readonly: true, fileMustExist: true });

try {
  const integrityRows = database.pragma("integrity_check");
  const integrityOk = integrityRows.length === 1 && integrityRows[0]?.integrity_check === "ok";
  if (!integrityOk) fail("SQLite integrity_check did not return ok.");

  const foreignKeyIssues = database.pragma("foreign_key_check");
  if (foreignKeyIssues.length > 0) {
    fail(`SQLite found ${foreignKeyIssues.length} foreign-key violation(s).`);
  }

  const existingTables = new Set(
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
  );
  const missingTables = requiredTables.filter((table) => !existingTables.has(table));
  if (missingTables.length > 0) fail(`Missing required table(s): ${missingTables.join(", ")}`);

  if (existingTables.has("users")) {
    const userColumns = new Set(database.pragma("table_info(users)").map((column) => column.name));
    for (const column of ["password", "session_version", "company_id", "is_active", "deleted_at"]) {
      if (!userColumns.has(column)) fail(`users.${column} is missing.`);
    }
  }

  if (existingTables.has("site_cameras")) {
    const cameraColumns = new Set(database.pragma("table_info(site_cameras)").map((column) => column.name));
    for (const column of ["company_id", "project_id", "provider", "device_serial", "channel_no", "verify_code", "deleted_at"]) {
      if (!cameraColumns.has(column)) fail(`site_cameras.${column} is missing.`);
    }
  }

  if (!process.exitCode) {
    console.log("[database-check] Local database integrity and schema checks passed (read-only).");
  }
} finally {
  database.close();
}
