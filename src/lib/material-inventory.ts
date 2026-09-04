import type Database from "better-sqlite3";

export type MaterialInventoryItem = {
  materialId: string;
  quantity: number;
};

type StockChange = {
  materialId: string;
  quantity: number;
  name: string;
  stock: number;
  companyId: string;
};

type MovementMeta = {
  sourceType?: string;
  sourceId?: string | null;
  sourceNo?: string | null;
  operatorId?: string | null;
  operatorName?: string | null;
  reason?: string | null;
  remark?: string | null;
};

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function aggregateItems(items: MaterialInventoryItem[]) {
  const totals = new Map<string, number>();
  items.forEach((item) => {
    const materialId = String(item.materialId || "").trim();
    const quantity = Number(item.quantity || 0);
    if (!materialId || !Number.isFinite(quantity) || quantity <= 0) return;
    totals.set(materialId, (totals.get(materialId) || 0) + quantity);
  });
  return Array.from(totals.entries()).map(([materialId, quantity]) => ({ materialId, quantity }));
}

function getStockRows(db: Database.Database, items: MaterialInventoryItem[]): StockChange[] {
  const aggregatedItems = aggregateItems(items);
  if (aggregatedItems.length === 0) return [];
  const placeholders = aggregatedItems.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT id, company_id as companyId, name, COALESCE(stock, 0) as stock
    FROM materials
    WHERE id IN (${placeholders}) AND deleted_at IS NULL
  `).all(...aggregatedItems.map((item) => item.materialId)) as { id: string; companyId: string; name: string; stock: number }[];
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  return aggregatedItems.map((item) => {
    const row = rowMap.get(item.materialId);
    if (!row) throw new Error("订单中存在已删除或不存在的材料，请刷新后重试");
    return {
      materialId: item.materialId,
      quantity: item.quantity,
      name: row.name || "未命名材料",
      stock: Number(row.stock || 0),
      companyId: row.companyId,
    };
  });
}

export function assertEnoughMaterialStock(db: Database.Database, items: MaterialInventoryItem[]) {
  const changes = getStockRows(db, items);
  const insufficient = changes.find((item) => item.stock < item.quantity);
  if (insufficient) {
    throw new Error(`「${insufficient.name}」库存不足，当前库存 ${insufficient.stock}，下单数量 ${insufficient.quantity}`);
  }
}

export function deductMaterialStock(db: Database.Database, items: MaterialInventoryItem[], meta: MovementMeta = {}) {
  const changes = getStockRows(db, items);
  const insufficient = changes.find((item) => item.stock < item.quantity);
  if (insufficient) {
    throw new Error(`「${insufficient.name}」库存不足，当前库存 ${insufficient.stock}，下单数量 ${insufficient.quantity}`);
  }
  const updateStock = db.prepare(`
    UPDATE materials
    SET stock = COALESCE(stock, 0) - ?,
      updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `);
  const insertMovement = db.prepare(`
    INSERT INTO material_stock_movements (
      id, company_id, material_id, movement_type, quantity, before_stock, after_stock,
      source_type, source_id, source_no, operator_id, operator_name, reason, remark, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  changes.forEach((item) => {
    const afterStock = item.stock - item.quantity;
    updateStock.run(item.quantity, item.materialId);
    insertMovement.run(
      makeId("MSM"),
      item.companyId,
      item.materialId,
      "OUT",
      item.quantity,
      item.stock,
      afterStock,
      meta.sourceType || "order",
      meta.sourceId || null,
      meta.sourceNo || null,
      meta.operatorId || null,
      meta.operatorName || null,
      meta.reason || "辅材订单出库",
      meta.remark || null,
    );
  });
}

export function restoreMaterialStock(db: Database.Database, items: MaterialInventoryItem[], meta: MovementMeta = {}) {
  const changes = getStockRows(db, items);
  if (changes.length === 0) return;
  const updateStock = db.prepare(`
    UPDATE materials
    SET stock = COALESCE(stock, 0) + ?,
      updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `);
  const insertMovement = db.prepare(`
    INSERT INTO material_stock_movements (
      id, company_id, material_id, movement_type, quantity, before_stock, after_stock,
      source_type, source_id, source_no, operator_id, operator_name, reason, remark, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  changes.forEach((item) => {
    const afterStock = item.stock + item.quantity;
    updateStock.run(item.quantity, item.materialId);
    insertMovement.run(
      makeId("MSM"),
      item.companyId,
      item.materialId,
      "IN",
      item.quantity,
      item.stock,
      afterStock,
      meta.sourceType || "order_restore",
      meta.sourceId || null,
      meta.sourceNo || null,
      meta.operatorId || null,
      meta.operatorName || null,
      meta.reason || "订单取消恢复库存",
      meta.remark || null,
    );
  });
}

export function addMaterialStock(db: Database.Database, items: MaterialInventoryItem[], meta: MovementMeta = {}) {
  const changes = getStockRows(db, items);
  if (changes.length === 0) return;
  const updateStock = db.prepare(`
    UPDATE materials
    SET stock = COALESCE(stock, 0) + ?,
      updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `);
  const insertMovement = db.prepare(`
    INSERT INTO material_stock_movements (
      id, company_id, material_id, movement_type, quantity, before_stock, after_stock,
      source_type, source_id, source_no, operator_id, operator_name, reason, remark, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  changes.forEach((item) => {
    const afterStock = item.stock + item.quantity;
    updateStock.run(item.quantity, item.materialId);
    insertMovement.run(
      makeId("MSM"),
      item.companyId,
      item.materialId,
      "IN",
      item.quantity,
      item.stock,
      afterStock,
      meta.sourceType || "material_inbound",
      meta.sourceId || null,
      meta.sourceNo || null,
      meta.operatorId || null,
      meta.operatorName || null,
      meta.reason || "采购入库",
      meta.remark || null,
    );
  });
}

export function getOrderStockItems(db: Database.Database, orderId: string) {
  return db.prepare(`
    SELECT material_id as materialId, quantity
    FROM material_order_items
    WHERE order_id = ?
  `).all(orderId) as MaterialInventoryItem[];
}

export function getOrderDeductedStockItems(db: Database.Database, orderId: string) {
  return db.prepare(`
    SELECT material_id as materialId, COALESCE(stock_deducted_qty, 0) as quantity
    FROM material_order_items
    WHERE order_id = ?
      AND COALESCE(stock_deducted_qty, 0) > 0
  `).all(orderId) as MaterialInventoryItem[];
}

export function getOrderPendingStockItems(db: Database.Database, orderId: string) {
  return db.prepare(`
    SELECT material_id as materialId,
      MAX(0, CASE
        WHEN COALESCE(received_qty, 0) > COALESCE(stock_deducted_qty, 0)
          THEN COALESCE(received_qty, 0) - COALESCE(stock_deducted_qty, 0)
        WHEN COALESCE(quantity, 0) > COALESCE(stock_deducted_qty, 0)
          THEN COALESCE(quantity, 0) - COALESCE(stock_deducted_qty, 0)
        ELSE 0
      END) as quantity
    FROM material_order_items
    WHERE order_id = ?
      AND (
        COALESCE(received_qty, 0) > COALESCE(stock_deducted_qty, 0)
        OR COALESCE(quantity, 0) > COALESCE(stock_deducted_qty, 0)
      )
  `).all(orderId) as MaterialInventoryItem[];
}

export function markOrderStockDeducted(db: Database.Database, orderId: string) {
  db.prepare(`
    UPDATE material_order_items
    SET stock_deducted_qty = CASE
      WHEN COALESCE(received_qty, 0) > COALESCE(stock_deducted_qty, 0)
        THEN COALESCE(received_qty, 0)
      WHEN COALESCE(stock_deducted_qty, 0) = 0
        THEN COALESCE(quantity, 0)
      ELSE stock_deducted_qty
    END
    WHERE order_id = ?
      AND (
        COALESCE(received_qty, 0) > COALESCE(stock_deducted_qty, 0)
        OR COALESCE(stock_deducted_qty, 0) = 0
      )
  `).run(orderId);
}
