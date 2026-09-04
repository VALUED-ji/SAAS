import type Database from "better-sqlite3";

type Db = Database.Database;

function money(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? Math.round(next * 100) / 100 : 0;
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function isOther(category: unknown) {
  return String(category || "").trim() === "other";
}

function isCustomCabinet(category: unknown) {
  return String(category || "").trim() === "定制柜";
}

function getCustomCabinetArea(item: any) {
  return money(Number(item.material_cost || 0) * Number(item.labor_cost || 0) / 1000000);
}

function getRevenueAmount(item: any) {
  const quantity = Math.max(0, Number(item.quantity || 0) || 0);
  const unitPrice = Math.max(0, Number(item.unit_price || 0) || 0);
  if (isCustomCabinet(item.category)) {
    const area = getCustomCabinetArea(item);
    return money(quantity * (area > 0 ? area : 1) * unitPrice);
  }
  return money(Number(item.total_price ?? quantity * unitPrice) || 0);
}

function getUnitCost(item: any, field: "cost_material_unit" | "cost_labor_unit") {
  const value = Number(item[field]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function ensureProjectCostControlSchema(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_cost_snapshots (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      quotation_id TEXT NOT NULL REFERENCES quotations(id),
      source_title TEXT,
      revenue_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      budget_material_cost REAL DEFAULT 0,
      budget_labor_cost REAL DEFAULT 0,
      budget_other_cost REAL DEFAULT 0,
      budget_total_cost REAL DEFAULT 0,
      budget_gross_profit REAL DEFAULT 0,
      budget_gross_profit_rate REAL DEFAULT 0,
      missing_rule_count INTEGER DEFAULT 0,
      item_count INTEGER DEFAULT 0,
      snapshot_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS project_cost_snapshot_items (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL REFERENCES project_cost_snapshots(id),
      quotation_item_id TEXT,
      category TEXT,
      space TEXT,
      work_type_name TEXT,
      material_category_name TEXT,
      name TEXT NOT NULL,
      unit TEXT,
      quantity REAL DEFAULT 0,
      revenue_amount REAL DEFAULT 0,
      cost_material_unit REAL DEFAULT 0,
      cost_labor_unit REAL DEFAULT 0,
      cost_loss_rate REAL DEFAULT 0,
      budget_material_cost REAL DEFAULT 0,
      budget_labor_cost REAL DEFAULT 0,
      budget_total_cost REAL DEFAULT 0,
      missing_cost_rule INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_project_cost_snapshots_project ON project_cost_snapshots(project_id, deleted_at, updated_at);
    CREATE INDEX IF NOT EXISTS idx_project_cost_snapshots_quotation ON project_cost_snapshots(quotation_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_project_cost_snapshot_items_snapshot ON project_cost_snapshot_items(snapshot_id);
  `);

  const quotationItemTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'quotation_items'").get();
  if (!quotationItemTable) return;
  const columns = db.prepare("PRAGMA table_info(quotation_items)").all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("cost_material_unit")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_material_unit REAL").run();
  if (!names.has("cost_labor_unit")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_labor_unit REAL").run();
  if (!names.has("cost_loss_rate")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_loss_rate REAL").run();
  if (!names.has("cost_source")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_source TEXT").run();
}

export function calculateQuotationBudgetCost(quotation: any, items: any[]) {
  const rows = items
    .filter((item) => !isOther(item.category))
    .map((item) => {
      const quantity = Math.max(0, Number(item.quantity || 0) || 0);
      const revenueAmount = getRevenueAmount(item);
      const materialUnit = getUnitCost(item, "cost_material_unit");
      const laborUnit = getUnitCost(item, "cost_labor_unit");
      const lossRate = Math.max(0, Number(item.cost_loss_rate || 0) || 0);
      const materialCost = money(quantity * materialUnit * (1 + lossRate / 100));
      const laborCost = money(quantity * laborUnit);
      const missing = revenueAmount > 0 && materialUnit <= 0 && laborUnit <= 0;
      return {
        quotation_item_id: item.id || "",
        category: String(item.category || ""),
        space: String(item.space || ""),
        work_type_name: String(item.work_type_name || ""),
        material_category_name: String(item.material_category_name || ""),
        name: String(item.name || "未命名项目"),
        unit: String(item.unit || ""),
        quantity,
        revenue_amount: revenueAmount,
        cost_material_unit: materialUnit,
        cost_labor_unit: laborUnit,
        cost_loss_rate: lossRate,
        budget_material_cost: materialCost,
        budget_labor_cost: laborCost,
        budget_total_cost: money(materialCost + laborCost),
        missing_cost_rule: missing ? 1 : 0,
      };
    });
  const revenueAmount = money(Number(quotation?.final_amount ?? quotation?.total_amount ?? 0) || rows.reduce((sum, row) => sum + row.revenue_amount, 0));
  const materialCost = money(rows.reduce((sum, row) => sum + row.budget_material_cost, 0));
  const laborCost = money(rows.reduce((sum, row) => sum + row.budget_labor_cost, 0));
  const otherCost = 0;
  const totalCost = money(materialCost + laborCost + otherCost);
  const grossProfit = money(revenueAmount - totalCost);
  const grossProfitRate = revenueAmount > 0 ? Math.round((grossProfit / revenueAmount) * 1000) / 10 : 0;
  return {
    source_title: quotation?.title || "正式报价",
    revenue_amount: revenueAmount,
    discount_amount: money(quotation?.discount),
    budget_material_cost: materialCost,
    budget_labor_cost: laborCost,
    budget_other_cost: otherCost,
    budget_total_cost: totalCost,
    budget_gross_profit: grossProfit,
    budget_gross_profit_rate: grossProfitRate,
    missing_rule_count: rows.reduce((sum, row) => sum + Number(row.missing_cost_rule || 0), 0),
    item_count: rows.length,
    rows,
  };
}

export function syncProjectCostSnapshotForQuotation(db: Db, quotationId: string) {
  ensureProjectCostControlSchema(db);
  const quotation = db.prepare(`
    SELECT *
    FROM quotations
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(quotationId) as any;
  if (!quotation?.id || !quotation.project_id) return null;
  const items = db.prepare(`
    SELECT *
    FROM quotation_items
    WHERE quotation_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(quotationId) as any[];
  const summary = calculateQuotationBudgetCost(quotation, items);
  const existing = db.prepare(`
    SELECT id
    FROM project_cost_snapshots
    WHERE quotation_id = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(quotationId) as any;
  const snapshotId = existing?.id || id("PCS");
  const snapshotJson = JSON.stringify({
    quotation_id: quotation.id,
    project_id: quotation.project_id,
    generated_at: new Date().toISOString(),
    rows: summary.rows,
  });
  const tx = (db as any).transaction(() => {
    if (existing?.id) {
      db.prepare(`
        UPDATE project_cost_snapshots
        SET source_title = ?, revenue_amount = ?, discount_amount = ?,
            budget_material_cost = ?, budget_labor_cost = ?, budget_other_cost = ?, budget_total_cost = ?,
            budget_gross_profit = ?, budget_gross_profit_rate = ?, missing_rule_count = ?, item_count = ?,
            snapshot_json = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        summary.source_title,
        summary.revenue_amount,
        summary.discount_amount,
        summary.budget_material_cost,
        summary.budget_labor_cost,
        summary.budget_other_cost,
        summary.budget_total_cost,
        summary.budget_gross_profit,
        summary.budget_gross_profit_rate,
        summary.missing_rule_count,
        summary.item_count,
        snapshotJson,
        snapshotId,
      );
      db.prepare("DELETE FROM project_cost_snapshot_items WHERE snapshot_id = ?").run(snapshotId);
    } else {
      db.prepare(`
        INSERT INTO project_cost_snapshots (
          id, company_id, project_id, quotation_id, source_title, revenue_amount, discount_amount,
          budget_material_cost, budget_labor_cost, budget_other_cost, budget_total_cost,
          budget_gross_profit, budget_gross_profit_rate, missing_rule_count, item_count, snapshot_json,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        snapshotId,
        quotation.company_id,
        quotation.project_id,
        quotation.id,
        summary.source_title,
        summary.revenue_amount,
        summary.discount_amount,
        summary.budget_material_cost,
        summary.budget_labor_cost,
        summary.budget_other_cost,
        summary.budget_total_cost,
        summary.budget_gross_profit,
        summary.budget_gross_profit_rate,
        summary.missing_rule_count,
        summary.item_count,
        snapshotJson,
      );
    }

    const insertItem = db.prepare(`
      INSERT INTO project_cost_snapshot_items (
        id, snapshot_id, quotation_item_id, category, space, work_type_name, material_category_name,
        name, unit, quantity, revenue_amount, cost_material_unit, cost_labor_unit, cost_loss_rate,
        budget_material_cost, budget_labor_cost, budget_total_cost, missing_cost_rule, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    summary.rows.forEach((row) => {
      insertItem.run(
        id("PCSI"),
        snapshotId,
        row.quotation_item_id || null,
        row.category || null,
        row.space || null,
        row.work_type_name || null,
        row.material_category_name || null,
        row.name,
        row.unit || null,
        row.quantity,
        row.revenue_amount,
        row.cost_material_unit,
        row.cost_labor_unit,
        row.cost_loss_rate,
        row.budget_material_cost,
        row.budget_labor_cost,
        row.budget_total_cost,
        row.missing_cost_rule,
      );
    });
  });
  tx();
  return { id: snapshotId, ...summary };
}
