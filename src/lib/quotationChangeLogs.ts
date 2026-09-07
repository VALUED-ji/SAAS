type QuotationChangeType = "created" | "updated" | "deleted";

type QuotationChangeRecordInput = {
  db: any;
  companyId: string;
  quotationId: string;
  userId: string;
  action: string;
  beforeItems: any[];
  afterItems: any[];
};

const trackedFields = [
  { key: "category", label: "项目分类", kind: "text" },
  { key: "space", label: "空间", kind: "text" },
  { key: "name", label: "工程项目", kind: "text" },
  { key: "spec", label: "施工工艺及材料说明", kind: "text" },
  { key: "material_model", label: "型号/材质", kind: "text" },
  { key: "remark", label: "备注", kind: "text" },
  { key: "unit", label: "单位", kind: "text" },
  { key: "quantity", label: "数量", kind: "number" },
  { key: "unit_price", label: "综合单价", kind: "money" },
  { key: "material_cost", label: "材料单价", kind: "money" },
  { key: "labor_cost", label: "人工单价", kind: "money" },
  { key: "row_color", label: "标记颜色", kind: "text" },
] as const;

function normalizeCategory(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function isOtherCategory(value: unknown) {
  const category = normalizeCategory(value);
  return category === "other" || category === "综合费用";
}

function isAutoComputedField(item: any, key: string) {
  const category = normalizeCategory(item?.category);
  if (key !== "unit_price") return false;
  return category === "base" || category === "基装" || category === "基装项目" || category === "custom_cabinet" || category === "定制柜" || category === "定制柜项目";
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function ensureQuotationChangeLogSchema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotation_change_logs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      quotation_id TEXT NOT NULL REFERENCES quotations(id),
      user_id TEXT REFERENCES users(id),
      user_name TEXT,
      action TEXT NOT NULL,
      summary TEXT,
      change_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS quotation_change_log_items (
      id TEXT PRIMARY KEY,
      log_id TEXT NOT NULL REFERENCES quotation_change_logs(id),
      quotation_id TEXT NOT NULL REFERENCES quotations(id),
      quotation_item_id TEXT,
      item_name TEXT,
      space TEXT,
      category TEXT,
      change_type TEXT NOT NULL,
      field_key TEXT,
      field_label TEXT,
      old_value TEXT,
      new_value TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_quotation_change_logs_company ON quotation_change_logs(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_quotation_change_logs_quotation ON quotation_change_logs(quotation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_quotation_change_log_items_log ON quotation_change_log_items(log_id);
    CREATE INDEX IF NOT EXISTS idx_quotation_change_log_items_quotation ON quotation_change_log_items(quotation_id, created_at);
  `);
}

export function getQuotationItemsForChangeLog(db: any, quotationId: string) {
  return db.prepare(`
    SELECT *
    FROM quotation_items
    WHERE quotation_id = ?
    ORDER BY sort_order ASC, created_at ASC, id ASC
  `).all(quotationId) as any[];
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNumber(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? Math.round(next * 10000) / 10000 : 0;
}

function comparableValue(item: any, key: string, kind: string) {
  if (kind === "number" || kind === "money") return normalizeNumber(item?.[key]);
  return normalizeText(item?.[key]);
}

function displayValue(value: unknown, kind: string) {
  if (kind === "number" || kind === "money") {
    const next = normalizeNumber(value);
    return Number.isInteger(next) ? String(next) : String(next).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  }
  return normalizeText(value);
}

function getUserName(db: any, userId: string) {
  const row = db.prepare("SELECT name FROM users WHERE id = ? LIMIT 1").get(userId) as any;
  return String(row?.name || "未知用户").trim() || "未知用户";
}

function getItemTitle(item: any) {
  return normalizeText(item?.name) || "未命名项目";
}

function getItemMeta(item: any) {
  return {
    itemName: getItemTitle(item),
    space: normalizeText(item?.space),
    category: normalizeText(item?.category),
  };
}

function buildSummary(changes: Array<{ changeType: QuotationChangeType }>) {
  const created = changes.filter((item) => item.changeType === "created").length;
  const deleted = changes.filter((item) => item.changeType === "deleted").length;
  const updated = changes.filter((item) => item.changeType === "updated").length;
  const parts = [];
  if (updated) parts.push(`修改 ${updated} 项`);
  if (created) parts.push(`新增 ${created} 项`);
  if (deleted) parts.push(`删除 ${deleted} 项`);
  return parts.join("，") || "没有内容变化";
}

export function recordQuotationItemChanges(input: QuotationChangeRecordInput) {
  const { db, companyId, quotationId, userId, action, beforeItems, afterItems } = input;
  ensureQuotationChangeLogSchema(db);

  const beforeById = new Map<string, any>();
  beforeItems.forEach((item) => {
    const id = String(item?.id || "");
    if (id) beforeById.set(id, item);
  });
  const afterById = new Map<string, any>();
  afterItems.forEach((item) => {
    const id = String(item?.id || "");
    if (id) afterById.set(id, item);
  });
  const changes: Array<{
    item: any;
    changeType: QuotationChangeType;
    fieldKey: string | null;
    fieldLabel: string | null;
    oldValue: string | null;
    newValue: string | null;
  }> = [];

  afterById.forEach((afterItem, id) => {
    const beforeItem = beforeById.get(id);
    if (isOtherCategory(afterItem?.category) || isOtherCategory(beforeItem?.category)) return;
    if (!beforeItem) {
      changes.push({ item: afterItem, changeType: "created", fieldKey: null, fieldLabel: null, oldValue: null, newValue: getItemTitle(afterItem) });
      return;
    }
    trackedFields.forEach((field) => {
      if (isAutoComputedField(afterItem, field.key)) return;
      const beforeValue = comparableValue(beforeItem, field.key, field.kind);
      const afterValue = comparableValue(afterItem, field.key, field.kind);
      if (beforeValue === afterValue) return;
      changes.push({
        item: afterItem,
        changeType: "updated",
        fieldKey: field.key,
        fieldLabel: field.label,
        oldValue: displayValue(beforeItem?.[field.key], field.kind),
        newValue: displayValue(afterItem?.[field.key], field.kind),
      });
    });
  });

  beforeById.forEach((beforeItem, id) => {
    if (afterById.has(id)) return;
    if (isOtherCategory(beforeItem?.category)) return;
    changes.push({ item: beforeItem, changeType: "deleted", fieldKey: null, fieldLabel: null, oldValue: getItemTitle(beforeItem), newValue: null });
  });

  if (changes.length === 0) return null;

  const logId = makeId("QCHG");
  const userName = getUserName(db, userId);
  const summary = buildSummary(changes);
  db.prepare(`
    INSERT INTO quotation_change_logs (id, company_id, quotation_id, user_id, user_name, action, summary, change_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(logId, companyId, quotationId, userId, userName, action, summary, changes.length);

  const insertChange = db.prepare(`
    INSERT INTO quotation_change_log_items (
      id, log_id, quotation_id, quotation_item_id, item_name, space, category, change_type,
      field_key, field_label, old_value, new_value, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  changes.forEach((change) => {
    const meta = getItemMeta(change.item);
    insertChange.run(
      makeId("QCHGI"),
      logId,
      quotationId,
      change.item?.id || null,
      meta.itemName,
      meta.space || null,
      meta.category || null,
      change.changeType,
      change.fieldKey,
      change.fieldLabel,
      change.oldValue,
      change.newValue,
    );
  });
  return { id: logId, summary, changeCount: changes.length };
}

export function getLatestQuotationChangeSummary(db: any, quotationIds: string[]) {
  ensureQuotationChangeLogSchema(db);
  if (quotationIds.length === 0) return new Map<string, any>();
  const placeholders = quotationIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT l.*
    FROM quotation_change_logs l
    INNER JOIN (
      SELECT quotation_id, MAX(datetime(created_at)) as latest_at
      FROM quotation_change_logs
      WHERE quotation_id IN (${placeholders})
      GROUP BY quotation_id
    ) latest ON latest.quotation_id = l.quotation_id AND datetime(l.created_at) = latest.latest_at
    ORDER BY datetime(l.created_at) DESC, l.id DESC
  `).all(...quotationIds) as any[];
  const map = new Map<string, any>();
  rows.forEach((row) => {
    const quotationId = String(row.quotation_id || "");
    if (!quotationId || map.has(quotationId)) return;
    map.set(quotationId, row);
  });
  return map;
}

export function getQuotationChangeLogs(db: any, quotationId: string, companyId: string) {
  ensureQuotationChangeLogSchema(db);
  const logs = db.prepare(`
    SELECT l.*, u.avatar as user_avatar
    FROM quotation_change_logs l
    LEFT JOIN users u ON u.id = l.user_id
    WHERE l.quotation_id = ? AND l.company_id = ?
    ORDER BY datetime(l.created_at) DESC, l.id DESC
    LIMIT 100
  `).all(quotationId, companyId) as any[];
  if (logs.length === 0) return [];
  const logIds = logs.map((log) => String(log.id || "")).filter(Boolean);
  const placeholders = logIds.map(() => "?").join(",");
  const items = db.prepare(`
    SELECT *
    FROM quotation_change_log_items
    WHERE log_id IN (${placeholders})
    ORDER BY datetime(created_at) ASC, id ASC
  `).all(...logIds) as any[];
  const itemsByLog = new Map<string, any[]>();
  items.forEach((item) => {
    const logId = String(item.log_id || "");
    if (!itemsByLog.has(logId)) itemsByLog.set(logId, []);
    itemsByLog.get(logId)?.push(item);
  });
  return logs.map((log) => ({
    ...log,
    changes: itemsByLog.get(String(log.id || "")) || [],
  }));
}
