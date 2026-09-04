#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const appRoot = path.resolve(__dirname, "..");
const dbPath = path.join(appRoot, "prisma", "dev.db");
const backupRoot = path.join(appRoot, "prisma", "backups");
const execute = process.argv.includes("--execute");

const preserveTables = [
  "companies",
  "users",
  "roles",
  "org_units",
  "org_unit_managers",
  "branch_settings",
  "contract_templates",
  "contract_template_versions",
  "material_categories",
  "work_types",
  "user_signatures",
];

const businessTables = [
  "approval_signature_snapshots",
  "archive_link_shares",
  "attachments",
  "change_order_approval_steps",
  "change_order_approval_instances",
  "contract_approval_steps",
  "contract_approval_instances",
  "contracts",
  "custom_quota_items",
  "customer_deposit_records",
  "customer_team",
  "customers",
  "daily_log_photos",
  "daily_logs",
  "deposit_approval_steps",
  "deposit_approval_instances",
  "deposit_refund_approval_steps",
  "deposit_refund_approval_instances",
  "designer_assignment_requests",
  "follow_ups",
  "material_inbound_order_items",
  "material_inbound_orders",
  "material_order_items",
  "material_orders",
  "material_price_history",
  "material_requisition_items",
  "material_requisitions",
  "material_stock_movements",
  "materials",
  "notifications",
  "operation_logs",
  "payment_records",
  "payment_plans",
  "payroll_records",
  "project_phases",
  "projects",
  "quotation_items",
  "quotation_receipt_todos",
  "quotations",
  "signature_capture_sessions",
  "site_cameras",
  "site_change_orders",
  "site_checkin_photos",
  "site_checkin_records",
  "site_checkin_codes",
  "site_cost_records",
  "site_inspections",
  "site_node_events",
  "site_schedule_delays",
  "site_start_handovers",
  "supplier_accounts",
  "suppliers",
  "tasks",
  "vr_tour_shares",
  "vr_tours",
];

function quoteIdent(name) {
  return JSON.stringify(name);
}

function getTables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function countTable(db, table) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`).get().count || 0);
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`数据库文件不存在: ${dbPath}`);
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const existingTables = new Set(getTables(db));
  const unknownConfiguredTables = businessTables.filter((table) => !existingTables.has(table));
  const deleteTables = businessTables.filter((table) => existingTables.has(table));
  const preservedExistingTables = preserveTables.filter((table) => existingTables.has(table));
  const unclassifiedTables = [...existingTables].filter(
    (table) => !preserveTables.includes(table) && !businessTables.includes(table)
  );

  const beforeCounts = deleteTables.map((table) => ({ table, count: countTable(db, table) }));
  const preservedCounts = preservedExistingTables.map((table) => ({ table, count: countTable(db, table) }));

  console.log(execute ? "业务数据清理执行模式" : "业务数据清理预览模式");
  console.log(`数据库: ${dbPath}`);
  console.log("");
  console.log("将保留的配置/基础表:");
  preservedCounts.forEach(({ table, count }) => console.log(`  ${String(count).padStart(5)}  ${table}`));
  console.log("");
  console.log("将清空的业务表:");
  beforeCounts.forEach(({ table, count }) => console.log(`  ${String(count).padStart(5)}  ${table}`));

  if (unknownConfiguredTables.length > 0) {
    console.log("");
    console.log("当前库不存在但已在脚本中登记的业务表:");
    unknownConfiguredTables.forEach((table) => console.log(`         ${table}`));
  }

  if (unclassifiedTables.length > 0) {
    console.log("");
    console.log("发现未分类表，脚本不会处理，请人工确认:");
    unclassifiedTables.forEach((table) => console.log(`         ${table}`));
  }

  if (!execute) {
    console.log("");
    console.log("预览完成。确认无误后执行: node scripts/clear-business-data.cjs --execute");
    db.close();
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const backupDir = path.join(backupRoot, `business-clear-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, "dev-before-business-clear.db");

  db.pragma("wal_checkpoint(TRUNCATE)");
  await db.backup(backupPath);
  console.log("");
  console.log(`已备份数据库: ${backupPath}`);

  db.pragma("foreign_keys = OFF");
  const clearBusinessData = db.transaction(() => {
    for (const table of deleteTables) {
      db.prepare(`DELETE FROM ${quoteIdent(table)}`).run();
    }
  });
  clearBusinessData();
  db.pragma("foreign_keys = ON");

  const fkIssues = db.prepare("PRAGMA foreign_key_check").all();
  if (fkIssues.length > 0) {
    console.log("");
    console.log("外键检查发现问题，已停止后续压缩，请从备份恢复后排查:");
    console.table(fkIssues);
    process.exitCode = 1;
  } else {
    db.exec("VACUUM");
    console.log("");
    console.log("外键检查通过，已清理并压缩数据库。");
  }

  console.log("");
  console.log("清理后业务表数量:");
  deleteTables.forEach((table) => console.log(`  ${String(countTable(db, table)).padStart(5)}  ${table}`));
  console.log("");
  console.log("保留表数量:");
  preservedExistingTables.forEach((table) => console.log(`  ${String(countTable(db, table)).padStart(5)}  ${table}`));

  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
