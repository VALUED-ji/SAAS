import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncCustomerProgress } from "@/lib/customerProgress";
import {
  calculateChargeableOtherFeeTotals,
  calculateOtherFeeTotals,
  getLegacyManagementFeeRate,
  normalizeFeeCalcBase,
  normalizeFeeCalcMethod,
  normalizeFeeScopeMode,
  parseFeeScopeValues,
  remapStableFeeFormulaIds,
  toMoney,
  type FeeFormulaContext,
} from "@/lib/quotationFeeFormulas";
import { quotationRowColors } from "@/lib/quotationRowColors";
import { getBranchSettingsForCustomer } from "@/lib/branchSettingsLookup";
import { normalizeQuotationSignatureLabels } from "@/lib/quotationPrintSettings";
import { getRequestIp, recordCustomerOperation } from "@/lib/operationLog";
import { getAuthContext, hasPermission } from "@/lib/security/authorization";
import { verifyQuotationShareToken } from "@/lib/security/quotationShare";
import { ensureQuotationSchema } from "@/lib/quotationSchema";
import { ensureProjectCostControlSchema, syncProjectCostSnapshotForQuotation } from "@/lib/projectCostControl";
import {
  ensureQuotationChangeLogSchema,
  getQuotationItemsForChangeLog,
  recordQuotationItemChanges,
} from "@/lib/quotationChangeLogs";
import {
  canAccessQuotationOrg,
  ensureQuotationAccessColumns,
  getOrgById,
  getStoreOrgByName,
} from "@/lib/quotationOrgAccess";

type ItemInput = {
  id?: string;
  category?: string;
  space?: string;
  work_type_id?: string | null;
  work_type_name?: string | null;
  material_category_id?: string | null;
  material_category_name?: string | null;
  name?: string;
  spec?: string;
  material_model?: string;
  remark?: string;
  unit?: string;
  quantity?: number;
  unit_price?: number;
  material_cost?: number;
  labor_cost?: number;
  cost_material_unit?: number;
  cost_labor_unit?: number;
  cost_loss_rate?: number;
  cost_source?: string | null;
  quota_source_id?: string | null;
  quota_source_type?: string | null;
  profit_margin?: number;
  row_color?: string | null;
  fee_calc_method?: string | null;
  fee_calc_base?: string | null;
  fee_rate?: number | null;
  fee_scope_mode?: string | null;
  fee_scope_space_ids?: string[] | string | null;
  fee_scope_space_names?: string[] | string | null;
};

type DiscountRule = {
  id: string;
  type: "fee" | "space" | "work_type";
  mode: "amount" | "rate";
  scope?: string;
  space?: string;
  workType?: string;
  discount?: number;
  rate?: number;
};

type DiscountScopeOption = {
  value: string;
  label: string;
  amount: number;
};

function ensureQuotationColumns(db: any) {
  ensureQuotationSchema(db);
  ensureQuotationAccessColumns(db);
  const customerColumns = db.prepare("PRAGMA table_info(customers)").all() as { name: string }[];
  const customerNames = new Set(customerColumns.map((column) => column.name));
  if (!customerNames.has("weixin")) db.prepare("ALTER TABLE customers ADD COLUMN weixin TEXT").run();
  if (!customerNames.has("designer_name_manual")) db.prepare("ALTER TABLE customers ADD COLUMN designer_name_manual TEXT").run();
}

function ensureQuotationItemColumns(db: any) {
  const columns = db.prepare("PRAGMA table_info(quotation_items)").all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("space")) db.prepare("ALTER TABLE quotation_items ADD COLUMN space TEXT").run();
  if (!names.has("work_type_id")) db.prepare("ALTER TABLE quotation_items ADD COLUMN work_type_id TEXT").run();
  if (!names.has("work_type_name")) db.prepare("ALTER TABLE quotation_items ADD COLUMN work_type_name TEXT").run();
  if (!names.has("material_category_id")) db.prepare("ALTER TABLE quotation_items ADD COLUMN material_category_id TEXT").run();
  if (!names.has("material_category_name")) db.prepare("ALTER TABLE quotation_items ADD COLUMN material_category_name TEXT").run();
  if (!names.has("material_model")) db.prepare("ALTER TABLE quotation_items ADD COLUMN material_model TEXT").run();
  if (!names.has("remark")) db.prepare("ALTER TABLE quotation_items ADD COLUMN remark TEXT").run();
  if (!names.has("row_color")) db.prepare("ALTER TABLE quotation_items ADD COLUMN row_color TEXT").run();
  if (!names.has("fee_calc_method")) db.prepare("ALTER TABLE quotation_items ADD COLUMN fee_calc_method TEXT").run();
  if (!names.has("fee_calc_base")) db.prepare("ALTER TABLE quotation_items ADD COLUMN fee_calc_base TEXT").run();
  if (!names.has("fee_rate")) db.prepare("ALTER TABLE quotation_items ADD COLUMN fee_rate REAL").run();
  if (!names.has("fee_scope_mode")) db.prepare("ALTER TABLE quotation_items ADD COLUMN fee_scope_mode TEXT").run();
  if (!names.has("fee_scope_space_ids")) db.prepare("ALTER TABLE quotation_items ADD COLUMN fee_scope_space_ids TEXT").run();
  if (!names.has("fee_scope_space_names")) db.prepare("ALTER TABLE quotation_items ADD COLUMN fee_scope_space_names TEXT").run();
  if (!names.has("cost_material_unit")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_material_unit REAL").run();
  if (!names.has("cost_labor_unit")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_labor_unit REAL").run();
  if (!names.has("cost_loss_rate")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_loss_rate REAL").run();
  if (!names.has("cost_source")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_source TEXT").run();
  if (!names.has("quota_source_id")) db.prepare("ALTER TABLE quotation_items ADD COLUMN quota_source_id TEXT").run();
  if (!names.has("quota_source_type")) db.prepare("ALTER TABLE quotation_items ADD COLUMN quota_source_type TEXT").run();
  db.exec(`
    CREATE TABLE IF NOT EXISTS standard_quota_items (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      quota_item_id TEXT NOT NULL,
      code TEXT,
      scope TEXT,
      category TEXT,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'enabled',
      payload TEXT NOT NULL DEFAULT '{}',
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_standard_quota_items_company_item
      ON standard_quota_items(company_id, quota_item_id);
    CREATE INDEX IF NOT EXISTS idx_standard_quota_items_company_status
      ON standard_quota_items(company_id, status, deleted_at);
  `);
  ensureProjectCostControlSchema(db);
}

function safelyRecordQuotationItemChanges(input: Parameters<typeof recordQuotationItemChanges>[0]) {
  try {
    return recordQuotationItemChanges(input);
  } catch (err) {
    console.error("Failed to record quotation item changes", err);
    return null;
  }
}

function tableExists(db: any, tableName: string) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(tableName) as any;
  return Boolean(row?.name);
}

function clearQuotationHardDeleteDependencies(db: any, quotationId: string) {
  if (tableExists(db, "quotation_change_log_items")) {
    db.prepare("DELETE FROM quotation_change_log_items WHERE quotation_id = ?").run(quotationId);
  }
  if (tableExists(db, "quotation_change_logs")) {
    db.prepare("DELETE FROM quotation_change_logs WHERE quotation_id = ?").run(quotationId);
  }
  if (tableExists(db, "quotation_receipt_todos")) {
    db.prepare("DELETE FROM quotation_receipt_todos WHERE quotation_id = ?").run(quotationId);
  }
  if (tableExists(db, "project_cost_snapshots")) {
    if (tableExists(db, "project_cost_snapshot_items")) {
      const snapshots = db.prepare("SELECT id FROM project_cost_snapshots WHERE quotation_id = ?").all(quotationId) as { id: string }[];
      const snapshotIds = snapshots.map((item) => String(item.id || "")).filter(Boolean);
      if (snapshotIds.length > 0) {
        db.prepare(`DELETE FROM project_cost_snapshot_items WHERE snapshot_id IN (${snapshotIds.map(() => "?").join(",")})`).run(...snapshotIds);
      }
    }
    db.prepare("DELETE FROM project_cost_snapshots WHERE quotation_id = ?").run(quotationId);
  }
  if (tableExists(db, "custom_quota_items")) {
    db.prepare(`
      UPDATE custom_quota_items
      SET source_quotation_id = NULL,
          source_quotation_item_id = NULL,
          updated_at = datetime('now')
      WHERE source_quotation_id = ?
    `).run(quotationId);
  }
  if (tableExists(db, "customer_deposit_records")) {
    db.prepare(`
      UPDATE customer_deposit_records
      SET quotation_id = NULL,
          updated_at = datetime('now')
      WHERE quotation_id = ?
    `).run(quotationId);
  }
}

function ensureQuotationReceiptTodoTable(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotation_receipt_todos (
      id TEXT PRIMARY KEY,
      quotation_id TEXT NOT NULL REFERENCES quotations(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      designer_id TEXT NOT NULL REFERENCES users(id),
      sender_id TEXT REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      received_at TEXT,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_quotation_receipt_todos_designer ON quotation_receipt_todos(designer_id, status);
    CREATE INDEX IF NOT EXISTS idx_quotation_receipt_todos_quotation ON quotation_receipt_todos(quotation_id, designer_id, status);
  `);
}

function getCurrentUserId(req: NextRequest) {
  return getAuthContext(req)?.userId || null;
}

function isReadonlyQuotationRecipient(db: any, quotationId: string, userId: string | null) {
  if (!userId) return false;
  ensureQuotationReceiptTodoTable(db);
  const receipt = db.prepare(`
    SELECT id FROM quotation_receipt_todos
    WHERE quotation_id = ?
      AND designer_id = ?
      AND deleted_at IS NULL
      AND status IN ('pending', 'received')
    LIMIT 1
  `).get(quotationId, userId) as any;
  return !!receipt;
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function formatAmount(value: number) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function buildDefaultProjectName(customer: any) {
  return String(customer?.address || customer?.area || customer?.name || "工地").trim();
}

function buildDefaultQuotationTitle(customer: any) {
  const houseText = String(customer?.address || customer?.area || customer?.house_address || "").trim();
  return houseText ? `${houseText}装修报价单` : "装修报价单";
}

function getQuotationCustomerId(db: any, quotationId: string) {
  const row = db.prepare(`
    SELECT p.customer_id
    FROM quotations q
    LEFT JOIN projects p ON p.id = q.project_id
    WHERE q.id = ?
    LIMIT 1
  `).get(quotationId) as any;
  return row?.customer_id || null;
}

function getQuotationOwnedStoreOrg(db: any, quotation: any, companyId: string) {
  const quotationOrgUnitId = String(quotation?.quotation_org_unit_id || "").trim();
  if (quotationOrgUnitId) {
    const org = getOrgById(db, quotationOrgUnitId, companyId);
    if (org?.type === "store") return org;
  }
  const customerId = String(quotation?.customer_id || "").trim() || (quotation?.id ? getQuotationCustomerId(db, quotation.id) : "");
  if (!customerId) return null;
  const customer = db.prepare("SELECT service_store FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
    .get(customerId, companyId) as any;
  return getStoreOrgByName(db, customer?.service_store || "", companyId);
}

function isUnassignedLegacyQuotation(db: any, quotation: any, companyId: string) {
  if (String(quotation?.quotation_org_unit_id || "").trim()) return false;
  const customerId = String(quotation?.customer_id || "").trim() || (quotation?.id ? getQuotationCustomerId(db, quotation.id) : "");
  if (!customerId) return true;
  const customer = db.prepare("SELECT service_store FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
    .get(customerId, companyId) as any;
  return !String(customer?.service_store || "").trim();
}

function canAccessQuotationRecord(db: any, quotation: any, auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  const quotationOrg = getQuotationOwnedStoreOrg(db, quotation, auth.companyId);
  if (quotationOrg?.id) return canAccessQuotationOrg(db, auth.userId, auth.companyId, quotationOrg.id);
  if (!isUnassignedLegacyQuotation(db, quotation, auth.companyId)) return false;
  return auth.isAdmin || String(quotation?.created_by_id || "") === auth.userId;
}

function isQuotationUsedBySignedContract(db: any, quotationId: string) {
  const signedContract = db.prepare(`
    SELECT id
    FROM contracts
    WHERE deleted_at IS NULL
      AND UPPER(COALESCE(status, '')) IN ('SIGNED', 'RESIGNED')
      AND (
        CASE WHEN json_valid(content) THEN json_extract(content, '$.quotation_id') ELSE NULL END = ?
        OR CASE WHEN json_valid(content) THEN json_extract(content, '$.amount_info.quotation_id') ELSE NULL END = ?
      )
    LIMIT 1
  `).get(quotationId, quotationId) as any;
  return !!signedContract;
}

function getQuotationContentLockReason(db: any, quotation: { id: string; status?: string | null }) {
  if (isQuotationUsedBySignedContract(db, quotation.id)) return "signed_contract";
  if (String(quotation.status || "").toUpperCase() === "APPROVED") return "approved";
  return "";
}

function getQuotationContentLockMessage(reason: string) {
  if (reason === "signed_contract") return "该报价已签合同，为避免合同金额和明细被改动，报价内容已锁定，不能修改、增加或删除项目。";
  if (reason === "approved") return "该报价已设为正式报价，为避免正式报价被误改，报价内容已锁定，不能修改、增加或删除项目。";
  return "";
}

function getQuotationDeleteBlockReason(db: any, quotation: { id: string; status?: string | null }) {
  if (isQuotationUsedBySignedContract(db, quotation.id)) return "已签合同的报价不能删除";
  if (String(quotation.status || "").toUpperCase() === "APPROVED") return "正式报价不能删除";
  return "";
}

function archiveQuotationCreatedCustomerIfEmpty(
  db: any,
  input: { customerId: string | null; companyId: string; userId: string; ipAddress?: string | null },
) {
  const customerId = String(input.customerId || "").trim();
  if (!customerId) return;

  const customer = db.prepare(`
    SELECT id, name
    FROM customers
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(customerId, input.companyId) as { id: string; name?: string | null } | undefined;
  if (!customer) return;

  const createdFromQuotation = db.prepare(`
    SELECT id
    FROM operation_logs
    WHERE entity = 'customer'
      AND entity_id = ?
      AND action = 'customer.create.from_quotation'
    LIMIT 1
  `).get(customerId) as { id: string } | undefined;
  if (!createdFromQuotation) return;

  const remainingQuotation = db.prepare(`
    SELECT q.id
    FROM quotations q
    INNER JOIN projects p ON p.id = q.project_id
    WHERE p.customer_id = ?
      AND q.company_id = ?
    LIMIT 1
  `).get(customerId, input.companyId) as { id: string } | undefined;
  if (remainingQuotation) return;

  const activeContract = db.prepare(`
    SELECT ct.id
    FROM contracts ct
    INNER JOIN projects p ON p.id = ct.project_id
    WHERE p.customer_id = ?
      AND ct.company_id = ?
      AND ct.deleted_at IS NULL
    LIMIT 1
  `).get(customerId, input.companyId) as { id: string } | undefined;
  if (activeContract) return;

  db.prepare(`
    UPDATE customers
    SET deleted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
  `).run(customerId, input.companyId);

  recordCustomerOperation(db, {
    userId: input.userId,
    customerId,
    action: "customer.auto_archive.after_last_quotation_hard_delete",
    module: "报价管理",
    title: "自动归入已删除客户",
    content: `新建报价时创建的客户「${customer.name || "未命名客户"}」已无报价记录，自动归入已删除客户`,
    targetName: customer.name || "",
    metadata: { reason: "last_quotation_hard_deleted" },
    ipAddress: input.ipAddress || null,
  });
}

function getValidQuotationCopyTargetCustomer(db: any, customerId: string, companyId: string) {
  return db.prepare(`
    SELECT c.*
    FROM customers c
    WHERE c.id = ?
      AND c.company_id = ?
      AND c.deleted_at IS NULL
      AND COALESCE(c.status, 'NEW') != 'LOST'
      AND NOT (
        EXISTS (
          SELECT 1
          FROM operation_logs created_log
          WHERE created_log.entity = 'customer'
            AND created_log.entity_id = c.id
            AND created_log.action = 'customer.create.from_quotation'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM quotations q
          INNER JOIN projects p ON p.id = q.project_id
          WHERE p.customer_id = c.id
            AND q.company_id = c.company_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM contracts ct
          INNER JOIN projects cp ON cp.id = ct.project_id
          WHERE cp.customer_id = c.id
            AND ct.company_id = c.company_id
            AND ct.deleted_at IS NULL
        )
      )
    LIMIT 1
  `).get(customerId, companyId) as any;
}

const allowedRowColors = new Set<string>(quotationRowColors.map((color) => color.value));

function normalizeRowColor(value: unknown) {
  const next = String(value || "").trim();
  return allowedRowColors.has(next) && next ? next : null;
}

function parseSettings(value: string | null) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function getQuotationHouseArea(db: any, quotation: any) {
  const tempArea = safeNonNegativeNumber(quotation?.temp_customer_area);
  if (tempArea > 0) return tempArea;
  if (!quotation?.project_id) return 0;
  const row = db.prepare(`
    SELECT COALESCE(c.area_size, p.area) as house_area
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.id = ?
    LIMIT 1
  `).get(quotation.project_id) as { house_area?: number | null } | undefined;
  return safeNonNegativeNumber(row?.house_area);
}

function parseJsonObject(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed as Record<string, any> : {};
  } catch {
    return {};
  }
}

function ensureQuotaTemplatesTable(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quota_templates (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      template_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'enabled',
      payload TEXT NOT NULL DEFAULT '{}',
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quota_templates_company_template
      ON quota_templates(company_id, template_id);
    CREATE INDEX IF NOT EXISTS idx_quota_templates_company_status
      ON quota_templates(company_id, status, deleted_at);
  `);
}

function hasReadableRichText(value: unknown) {
  const text = String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
  return text.length > 0;
}

function normalizeRichTextForCompare(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

function getQuotationTemplateRow(db: any, companyId: string, settings: Record<string, any>) {
  ensureQuotaTemplatesTable(db);
  const quotaTemplateId = String(settings.quotaTemplateId || "").trim();
  const quotaTemplateName = String(settings.quotaTemplateName || "").trim();
  let templateRow = quotaTemplateId
    ? db.prepare(`
      SELECT template_id, name, payload, updated_at
      FROM quota_templates
      WHERE company_id = ? AND template_id = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(companyId, quotaTemplateId) as { template_id?: string | null; name?: string | null; payload?: string | null; updated_at?: string | null } | undefined
    : undefined;
  if (!templateRow && quotaTemplateName) {
    templateRow = db.prepare(`
      SELECT template_id, name, payload, updated_at
      FROM quota_templates
      WHERE company_id = ? AND name = ? AND deleted_at IS NULL
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
      LIMIT 1
    `).get(companyId, quotaTemplateName) as { template_id?: string | null; name?: string | null; payload?: string | null; updated_at?: string | null } | undefined;
  }
  return templateRow || null;
}

function getTemplateBudgetCompilationState(db: any, quotation: { settings?: string | null }, companyId: string) {
  const settings = parseSettings(quotation.settings || null);
  const templateRow = getQuotationTemplateRow(db, companyId, settings);
  if (!templateRow) return null;
  const templatePayload = parseJsonObject(templateRow.payload);
  const latestHtml = String(templatePayload.budgetCompilationHtml || templatePayload.budgetCompilation || "").trim();
  if (!hasReadableRichText(latestHtml)) return null;
  const currentHtml = String(settings.budgetCompilationHtml || settings.budgetCompilation || "").trim();
  const currentExists = hasReadableRichText(currentHtml);
  const changed = normalizeRichTextForCompare(currentHtml) !== normalizeRichTextForCompare(latestHtml);
  if (!changed) return null;
  return {
    settings,
    templatePayload,
    templateRow,
    currentHtml,
    latestHtml,
    currentExists,
    templateId: String(templateRow.template_id || templatePayload.id || settings.quotaTemplateId || "").trim(),
    templateName: String(templatePayload.name || templateRow.name || settings.quotaTemplateName || "").trim(),
  };
}

function inferItemSpace(item: Partial<ItemInput>) {
  const current = String(item.space || "").trim();
  if (current) return current;
  return "";
}

function isOtherCategory(category: unknown) {
  return String(category || "") === "other";
}

function normalizeCategoryName(category: unknown) {
  return String(category || "").trim();
}

function isBaseCategory(category: unknown) {
  const name = normalizeCategoryName(category);
  return name === "base" || name === "基装" || name === "基装项目";
}

function isMainMaterialCategory(category: unknown) {
  const name = normalizeCategoryName(category);
  if (!name || isBaseCategory(name) || isOtherCategory(name) || isCustomCabinetCategory(name)) return false;
  return true;
}

function isCustomCabinetCategory(category: unknown) {
  const name = normalizeCategoryName(category);
  return name === "custom_cabinet" || name === "定制柜" || name === "定制柜项目";
}

function isDirectItemCategory(category: unknown) {
  return !isOtherCategory(category);
}

function getCategoryKey(category: unknown) {
  if (isBaseCategory(category)) return "base";
  if (isOtherCategory(category)) return "other";
  if (isCustomCabinetCategory(category)) return "custom_cabinet";
  if (isMainMaterialCategory(category)) return "main_material";
  return String(category || "").trim();
}

function getCategoryLabel(category: unknown) {
  const key = getCategoryKey(category);
  if (key === "base") return "基装";
  if (key === "main_material") return "产品";
  if (key === "custom_cabinet") return "定制柜";
  if (key === "other") return "综合费用";
  return String(category || "").trim();
}

function getFeeScopeCategoryKey(category: unknown) {
  const name = String(category || "").trim();
  if (isBaseCategory(name)) return "base";
  if (isOtherCategory(name)) return "other";
  if (isCustomCabinetCategory(name)) return "custom_cabinet";
  if (name === "main_material" || name === "主材" || name === "产品" || name === "产品项目") return "main_material";
  return name;
}

function getFeeScopeCategoryLabel(category: unknown) {
  const key = getFeeScopeCategoryKey(category);
  if (key === "base") return "基装";
  if (key === "main_material") return "产品";
  if (key === "custom_cabinet") return "定制柜";
  if (key === "other") return "综合费用";
  return key;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getNextSpaceCopyName(source: string, spaces: string[]) {
  const base = `${source} 副本`;
  const existing = new Set(spaces.map((space) => String(space || "").trim()).filter(Boolean));
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}

const builtInDirectCategories = ["base", "main_material", "custom_cabinet"];

function orderQuoteCategories(categories: string[]) {
  const normalized = uniqueValues(categories.map((category) => {
    const name = normalizeCategoryName(category);
    if (isBaseCategory(name)) return "base";
    if (isMainMaterialCategory(name)) return "main_material";
    if (isCustomCabinetCategory(name)) return "custom_cabinet";
    if (isOtherCategory(name)) return "other";
    return "";
  }).filter(Boolean));
  const directBuiltIns = builtInDirectCategories.filter((category) => normalized.includes(category));
  return [...directBuiltIns, "other"];
}

function getQuoteCategoriesForItems(categories: string[], items: Array<{ category?: unknown }>) {
  const itemCategorySet = new Set(items.map((item) => String(item.category || "").trim()).filter(Boolean));
  const filteredCategories = categories.filter((category) => {
    const normalized = String(category || "").trim();
    return !builtInDirectCategories.includes(normalized) || itemCategorySet.has(normalized);
  });
  return orderQuoteCategories([...filteredCategories, ...Array.from(itemCategorySet)]);
}

function roundMoney(value: number) {
  return toMoney(value);
}

function safeNonNegativeNumber(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? Math.max(0, next) : 0;
}

function getCustomCabinetArea(item: any) {
  return toMoney(safeNonNegativeNumber(item.material_cost) * safeNonNegativeNumber(item.labor_cost) / 1000000);
}

function getBaseOrMaterialItemTotal(item: any) {
  if (isCustomCabinetCategory(item.category)) {
    const area = getCustomCabinetArea(item);
    const quantity = safeNonNegativeNumber(item.quantity);
    const unitPrice = safeNonNegativeNumber(item.unit_price);
    return toMoney(quantity * (area > 0 ? area : 1) * unitPrice);
  }
  const fallback = Number(item.quantity || 0) * Number(item.unit_price || 0);
  return toMoney(Number(item.total_price ?? fallback) || 0);
}

function getBaseLaborSubtotal(item: any) {
  if (!isBaseCategory(item.category)) return 0;
  const materialUnit = safeNonNegativeNumber(item.material_cost);
  const rawLaborUnit = safeNonNegativeNumber(item.labor_cost);
  const laborUnit = materialUnit || rawLaborUnit ? rawLaborUnit : safeNonNegativeNumber(item.unit_price);
  return toMoney(safeNonNegativeNumber(item.quantity) * laborUnit);
}

function getBaseMaterialSubtotal(item: any) {
  if (!isBaseCategory(item.category)) return 0;
  return toMoney(safeNonNegativeNumber(item.quantity) * safeNonNegativeNumber(item.material_cost));
}

function isSpecialQuoteItem(item?: { row_color?: unknown } | null) {
  return String(item?.row_color || "") === "special";
}

function isLaborOnlyQuoteItem(item: any) {
  if (!isBaseCategory(item.category)) return false;
  return getBaseMaterialSubtotal(item) <= 0 && getBaseLaborSubtotal(item) > 0;
}

function isExcludedFromDiscount(item: any, settings: any) {
  if (settings?.excludeSpecialDiscountItems && isSpecialQuoteItem(item)) return true;
  if (settings?.excludeLaborOnlyDiscountItems && isLaborOnlyQuoteItem(item)) return true;
  return false;
}

function getDiscountableItems(items: any[], settings: any) {
  return items.filter((item) => !isExcludedFromDiscount(item, settings));
}

function getDiscountScopeOptions(items: any[], settings: any, totals: { otherAmount: number }, houseArea = 0): DiscountScopeOption[] {
  const discountableItems = getDiscountableItems(items, settings);
  const feeContext = buildFeeFormulaContext(discountableItems, settings?.quoteCategories, houseArea);
  const customCategoryOptions = Object.entries(feeContext.categoryAmounts || {}).map(([label, amount]) => ({
    value: `category:${label}`,
    label,
    amount: toMoney(Number(amount || 0)),
  }));
  const customCabinetAmount = discountableItems
    .filter((item) => isCustomCabinetCategory(item.category))
    .reduce((sum, item) => toMoney(sum + getBaseOrMaterialItemTotal(item)), 0);
  const discountableBaseAmount = discountableItems.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => toMoney(sum + getBaseOrMaterialItemTotal(item)), 0);
  const discountableProductAmount = discountableItems.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => toMoney(sum + getBaseOrMaterialItemTotal(item)), 0);
  const discountableCustomCategoryAmount = discountableItems
    .filter((item) => isDirectItemCategory(item.category) && !isBaseCategory(item.category) && !isMainMaterialCategory(item.category))
    .reduce((sum, item) => toMoney(sum + getBaseOrMaterialItemTotal(item)), 0);
  const discountableDirectAmount = discountableBaseAmount + discountableProductAmount + discountableCustomCategoryAmount;
  const fixedOptions: DiscountScopeOption[] = [
    { value: "base", label: "基装直接费", amount: discountableBaseAmount },
    { value: "base_labor", label: "基装直接费（人工）", amount: discountableItems.reduce((sum, item) => toMoney(sum + getBaseLaborSubtotal(item)), 0) },
    { value: "base_material", label: "基装直接费（材料）", amount: discountableItems.reduce((sum, item) => toMoney(sum + getBaseMaterialSubtotal(item)), 0) },
    { value: "product", label: "产品费用", amount: discountableProductAmount },
    { value: "custom_cabinet", label: "定制柜费用", amount: customCabinetAmount },
    { value: "other", label: "综合费用", amount: totals.otherAmount },
    { value: "direct", label: "工程直接费", amount: discountableDirectAmount },
    { value: "total", label: "总价", amount: discountableDirectAmount + totals.otherAmount },
  ];
  const fixedLabels = new Set(fixedOptions.map((option) => option.label));
  const dynamicOptions = customCategoryOptions.filter((option) => !fixedLabels.has(option.label) && !/组合包|套餐|一口价|package|定制柜/i.test(option.label));
  return [...fixedOptions, ...dynamicOptions];
}

function getDiscountSpaceOptions(items: any[], settings: any): DiscountScopeOption[] {
  const discountableItems = getDiscountableItems(items, settings);
  const spaces = uniqueValues([
    ...(Array.isArray(settings?.quoteSpaces) ? settings.quoteSpaces : []),
    ...items.filter((item) => !isOtherCategory(item.category)).map((item) => inferItemSpace(item)),
  ]);
  return spaces.map((space) => ({
    value: `space:${space}`,
    label: space,
    amount: discountableItems
      .filter((item) => !isOtherCategory(item.category) && inferItemSpace(item) === space)
      .reduce((sum, item) => toMoney(sum + getBaseOrMaterialItemTotal(item)), 0),
  }));
}

function getDiscountWorkTypeOptions(items: any[], settings: any): DiscountScopeOption[] {
  const discountableItems = getDiscountableItems(items, settings);
  const workTypes = uniqueValues(items.filter((item) => !isOtherCategory(item.category)).map((item) => String(item.work_type_name || "").trim()));
  return workTypes.map((workType) => ({
    value: `work_type:${workType}`,
    label: workType,
    amount: discountableItems
      .filter((item) => !isOtherCategory(item.category) && String(item.work_type_name || "").trim() === workType)
      .reduce((sum, item) => toMoney(sum + getBaseOrMaterialItemTotal(item)), 0),
  }));
}

function getLegacyDiscountRule(settings: any): DiscountRule | null {
  const discount = safeNonNegativeNumber(settings?.discount);
  if (discount <= 0) return null;
  const type = settings?.discountType === "space" || settings?.discountType === "work_type" ? settings.discountType : "fee";
  return {
    id: "legacy",
    type,
    mode: settings?.discountMode === "rate" ? "rate" : "amount",
    scope: settings?.discountScope || "total",
    space: settings?.discountSpace || "",
    workType: settings?.discountWorkType || "",
    discount,
    rate: Math.min(1, Math.max(0, Number(settings?.discountRate || 1))),
  };
}

function normalizeDiscountRules(settings: any): DiscountRule[] {
  const hasRuleList = Array.isArray(settings?.discountRules);
  const rawRules = hasRuleList ? settings.discountRules || [] : [];
  const rules = rawRules
    .map((rule: any, index: number) => ({
      id: String(rule?.id || `rule_${index}`),
      type: rule?.type === "space" || rule?.type === "work_type" ? rule.type : "fee",
      mode: rule?.mode === "rate" ? "rate" : "amount",
      scope: String(rule?.scope || "total"),
      space: String(rule?.space || ""),
      workType: String(rule?.workType || ""),
      discount: safeNonNegativeNumber(rule?.discount),
      rate: Math.min(1, Math.max(0, Number(rule?.rate || 1))),
    }))
    .filter((rule: DiscountRule) => rule.mode === "rate" ? Number(rule.rate || 1) < 1 : Number(rule.discount || 0) > 0);
  if (hasRuleList) return rules;
  const legacyRule = getLegacyDiscountRule(settings);
  return legacyRule ? [legacyRule] : [];
}

function getDiscountRuleValue(rule: DiscountRule) {
  if (rule.type === "space") return rule.space ? `space:${rule.space}` : "";
  if (rule.type === "work_type") return rule.workType ? `work_type:${rule.workType}` : "";
  return rule.scope || "total";
}

function getDiscountRuleScope(rule: DiscountRule, items: any[], settings: any, totals: { otherAmount: number }, houseArea = 0) {
  const options = rule.type === "space"
    ? getDiscountSpaceOptions(items, settings)
    : rule.type === "work_type"
      ? getDiscountWorkTypeOptions(items, settings)
      : getDiscountScopeOptions(items, settings, totals, houseArea);
  const value = getDiscountRuleValue(rule);
  return options.find((option) => option.value === value)
    || options.find((option) => option.value === "total")
    || options[0];
}

function getDiscountRuleAmount(rule: DiscountRule, items: any[], settings: any, totals: { otherAmount: number }, houseArea = 0) {
  const scope = getDiscountRuleScope(rule, items, settings, totals, houseArea);
  const scopeAmount = Math.max(0, Number(scope?.amount || 0));
  const excludedAmount = Math.min(scopeAmount, safeNonNegativeNumber(settings?.excludeSpecificDiscountAmount));
  const baseAmount = Math.max(0, scopeAmount - excludedAmount);
  if (baseAmount <= 0) return 0;
  if (rule.mode === "rate") return roundMoney(baseAmount * (1 - Math.min(1, Math.max(0, Number(rule.rate || 1)))));
  return roundMoney(Math.min(safeNonNegativeNumber(rule.discount), baseAmount));
}

function buildFeeFormulaContext(items: any[], categories: string[] = [], houseArea = 0): FeeFormulaContext {
  const orderedCategories = orderQuoteCategories([...categories, ...items.map((item) => String(item.category || "").trim())]);
  const mainMaterialAmount = items
    .filter((item) => isMainMaterialCategory(item.category))
    .reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const laborAmount = items.reduce((sum, item) => sum + getBaseLaborSubtotal(item), 0);
  const materialCostAmount = items.reduce((sum, item) => sum + getBaseMaterialSubtotal(item), 0);
  const categoryAmounts: Record<string, number> = {};

  orderedCategories
    .filter((category) => isDirectItemCategory(category) && !isBaseCategory(category) && !isMainMaterialCategory(category))
    .forEach((category) => {
      categoryAmounts[category] = 0;
    });

  items.forEach((item) => {
    const category = String(item.category || "").trim();
    if (!category || isBaseCategory(category) || isOtherCategory(category) || isMainMaterialCategory(category)) return;
    categoryAmounts[category] = toMoney(Number(categoryAmounts[category] || 0) + getBaseOrMaterialItemTotal(item));
  });

  const customCategoryAmount = Object.values(categoryAmounts).reduce((sum, amount) => sum + Number(amount || 0), 0);
  return {
    houseArea: safeNonNegativeNumber(houseArea),
    mainMaterialAmount,
    directItemAmount: mainMaterialAmount + customCategoryAmount,
    laborAmount,
    materialCostAmount,
    categoryAmounts,
    directItems: items
      .filter((item) => isDirectItemCategory(item.category))
      .map((item) => ({
        category: getFeeScopeCategoryKey(item.category),
        categoryLabel: getFeeScopeCategoryLabel(item.category),
        space: inferItemSpace(item),
        total: getBaseOrMaterialItemTotal(item),
        laborAmount: getBaseLaborSubtotal(item),
        materialCostAmount: getBaseMaterialSubtotal(item),
      })),
  };
}

function hasManagementFeeItem(items: any[]) {
  return items.some((item) => isOtherCategory(item.category) && /^(项目)?管理费$/.test(String(item.name || "").trim()));
}

function migrateManagementFeeToOtherItem(items: any[], settings: any) {
  const managementFeeRate = Number(settings.managementFeeRate || 0);
  const nextSettings = { ...settings, managementFeeRate: 0 };
  if (managementFeeRate <= 0) return { items, settings: nextSettings, migrated: false };
  if (hasManagementFeeItem(items)) {
    return {
      items: items.map((item) => isOtherCategory(item.category) && /^(项目)?管理费$/.test(String(item.name || "").trim()) && !item.fee_calc_method
        ? { ...item, fee_calc_method: "percent", fee_calc_base: "直接费", fee_rate: getLegacyManagementFeeRate(item, managementFeeRate) }
        : item),
      settings: nextSettings,
      migrated: true,
    };
  }

  const baseAmount = items.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const materialAmount = items.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const managementFee = roundMoney((baseAmount + materialAmount) * managementFeeRate / 100);
  if (managementFee <= 0) return { items, settings: nextSettings, migrated: true };

  return {
    items: [
      ...items,
      {
        id: makeId("QITEM"),
        category: "other",
        space: null,
        name: "管理费",
        spec: `原管理费比例 ${managementFeeRate}% 转入`,
        unit: "项",
        quantity: 1,
        unit_price: managementFee,
        total_price: managementFee,
        material_cost: 0,
        labor_cost: 0,
        profit_margin: 0,
        row_color: null,
        fee_calc_method: "percent",
        fee_calc_base: "直接费",
        fee_rate: managementFeeRate,
        fee_scope_mode: "all",
        fee_scope_space_ids: [],
        fee_scope_space_names: [],
        sort_order: items.length + 1,
      },
    ],
    settings: nextSettings,
    migrated: true,
  };
}

function calculate(items: any[], settings: any, houseArea = 0) {
  const baseAmount = items.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const materialAmount = items.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const customCategoryAmount = items.filter((item) => isDirectItemCategory(item.category) && !isBaseCategory(item.category) && !isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const directBaseAmount = materialAmount + customCategoryAmount;
  const otherItems = items.filter((item) => isOtherCategory(item.category));
  const feeFormulaContext = buildFeeFormulaContext(items, settings.quoteCategories, houseArea);
  const otherAmount = calculateChargeableOtherFeeTotals(otherItems, baseAmount, directBaseAmount, feeFormulaContext).reduce((sum, amount) => sum + amount, 0);
  const directAmount = baseAmount + directBaseAmount + otherAmount;
  const taxRate = Number(settings.taxRate || 0);
  const rawTotals = { otherAmount };
  const discountRules = normalizeDiscountRules(settings);
  const ruleDiscount = discountRules.reduce((sum, rule) => toMoney(sum + getDiscountRuleAmount(rule, items, settings, rawTotals, houseArea)), 0);
  const discount = Math.min(directAmount, Math.max(0, discountRules.length > 0 ? ruleDiscount : Number(settings.discount || 0)));
  const managementFee = 0;
  const taxableAmount = Math.max(0, directAmount - discount);
  const taxAmount = Math.round(taxableAmount * taxRate) / 100;
  const finalAmount = Math.max(0, Math.round((taxableAmount + taxAmount) * 100) / 100);
  return { baseAmount, materialAmount: directBaseAmount, mainMaterialAmount: materialAmount, customCategoryAmount, otherAmount, directAmount, managementFee, taxAmount, discount, finalAmount };
}

const quotaSyncFields = [
  { key: "name", label: "工程项目名称", itemKey: "name", quotaKey: "name" },
  { key: "unit", label: "单位", itemKey: "unit", quotaKey: "unit" },
  { key: "material_cost", label: "材料单价", itemKey: "material_cost", quotaKey: "material_price" },
  { key: "labor_cost", label: "人工单价", itemKey: "labor_cost", quotaKey: "labor_price" },
  { key: "spec", label: "施工工艺及材料说明", itemKey: "spec", quotaKey: "construction_description" },
] as const;

function normalizeComparableText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeComparableMoney(value: unknown) {
  return toMoney(Number(value || 0));
}

function extractQuotaCode(item: any) {
  const fromCostSource = String(item?.cost_source || "").trim();
  if (fromCostSource.startsWith("quota:")) return fromCostSource.slice("quota:".length).trim();
  const fromRemark = String(item?.remark || "").match(/定额编号[:：]\s*([^\s，,]+)/);
  return fromRemark?.[1]?.trim() || "";
}

function normalizeStandardQuotaRow(row: any) {
  if (!row) return null;
  const payload = parseJsonObject(row.payload);
  const materialPrice = safeNonNegativeNumber(payload.materialPrice ?? payload.material_price);
  const laborPrice = safeNonNegativeNumber(payload.laborPrice ?? payload.labor_price);
  return {
    id: String(payload.id || row.quota_item_id || row.id || "").trim(),
    code: String(payload.code || row.code || "").trim(),
    name: String(payload.name || row.name || "").trim(),
    unit: String(payload.unit || "").trim(),
    material_price: materialPrice,
    labor_price: laborPrice,
    construction_description: String(payload.constructionDescription || payload.construction_description || "").trim(),
  };
}

function getQuotaUpdateCandidates(db: any, quotationId: string, companyId: string, itemIds?: string[]) {
  const items = db.prepare(`
    SELECT * FROM quotation_items
    WHERE quotation_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(quotationId) as any[];
  const itemIdSet = Array.isArray(itemIds) && itemIds.length > 0 ? new Set(itemIds.map((id) => String(id || "").trim()).filter(Boolean)) : null;
  const standardByItemId = db.prepare(`
    SELECT *
    FROM standard_quota_items
    WHERE quota_item_id = ?
      AND company_id = ?
      AND deleted_at IS NULL
      AND COALESCE(status, 'enabled') != 'disabled'
    LIMIT 1
  `);
  const standardByCode = db.prepare(`
    SELECT *
    FROM standard_quota_items
    WHERE company_id = ?
      AND deleted_at IS NULL
      AND COALESCE(status, 'enabled') != 'disabled'
      AND code = ?
    ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC
    LIMIT 1
  `);
  return items
    .filter((item) => isBaseCategory(item.category) && (!itemIdSet || itemIdSet.has(String(item.id || ""))))
    .map((item) => {
      const sourceId = String(item.quota_source_id || "").trim();
      const sourceType = String(item.quota_source_type || "").trim();
      const code = extractQuotaCode(item);
      const legacyQuotaRemark = !sourceType && !sourceId && code && /定额编号[:：]/.test(String(item.remark || ""));
      const hasStandardSource = sourceType === "standard" && (sourceId || code);
      const hasLegacyStandardSource = !sourceType && (sourceId || legacyQuotaRemark);
      if (!hasStandardSource && !hasLegacyStandardSource) return null;
      const quota = normalizeStandardQuotaRow(sourceId ? standardByItemId.get(sourceId, companyId) : null)
        || normalizeStandardQuotaRow(code ? standardByCode.get(companyId, code) : null);
      if (!quota) return null;
      const differences = quotaSyncFields
        .map((field) => {
          const current = field.key === "material_cost" || field.key === "labor_cost"
            ? normalizeComparableMoney(item[field.itemKey])
            : normalizeComparableText(item[field.itemKey]);
          const latest = field.key === "material_cost" || field.key === "labor_cost"
            ? normalizeComparableMoney(quota[field.quotaKey])
            : normalizeComparableText(quota[field.quotaKey]);
          return current === latest ? null : { field: field.key, label: field.label, current, latest };
        })
        .filter(Boolean);
      if (differences.length === 0) return null;
      return {
        item,
        quota,
        differences,
        code: code || String(quota.code || "").trim(),
      };
    })
    .filter(Boolean) as Array<{ item: any; quota: any; differences: any[]; code: string }>;
}

function getNormalizedQuotationItemsForTotals(db: any, quotationId: string) {
  const rawItems = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, created_at ASC").all(quotationId) as any[];
  return rawItems.map((item) => {
    const category = String(item.category || "base").trim() || "base";
    const isBase = isBaseCategory(category);
    const isCustomCabinet = isCustomCabinetCategory(category);
    const quantity = isOtherCategory(category) ? Number(item.quantity || 0) : safeNonNegativeNumber(item.quantity);
    const materialCost = isOtherCategory(category) ? Number(item.material_cost || 0) : safeNonNegativeNumber(item.material_cost);
    const laborCost = isOtherCategory(category) ? Number(item.labor_cost || 0) : safeNonNegativeNumber(item.labor_cost);
    const unitPrice = isBase ? materialCost + laborCost : safeNonNegativeNumber(item.unit_price);
    const cabinetArea = getCustomCabinetArea({ material_cost: materialCost, labor_cost: laborCost });
    const totalPrice = isCustomCabinet
      ? toMoney(quantity * (cabinetArea > 0 ? cabinetArea : 1) * unitPrice)
      : toMoney(quantity * unitPrice);
    return { ...item, category, quantity, unit_price: unitPrice, total_price: totalPrice, material_cost: materialCost, labor_cost: laborCost };
  });
}

function recalculatePersistedQuotationTotals(db: any, quotation: any) {
  const settings = parseSettings(quotation.settings);
  const quotationHouseArea = getQuotationHouseArea(db, quotation);
  let normalizedItems = getNormalizedQuotationItemsForTotals(db, quotation.id);
  const baseAmount = normalizedItems.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const materialAmount = normalizedItems.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const customCategoryAmount = normalizedItems.filter((item) => isDirectItemCategory(item.category) && !isBaseCategory(item.category) && !isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const directBaseAmount = materialAmount + customCategoryAmount;
  const feeFormulaContext = buildFeeFormulaContext(normalizedItems, settings.quoteCategories, quotationHouseArea);
  const otherTotals = calculateOtherFeeTotals(normalizedItems.filter((item) => isOtherCategory(item.category)), baseAmount, directBaseAmount, feeFormulaContext);
  let otherIndex = 0;
  normalizedItems = normalizedItems.map((item) => {
    if (!isOtherCategory(item.category)) return item;
    const totalPrice = otherTotals[otherIndex++] || 0;
    const feeMethod = normalizeFeeCalcMethod(item.fee_calc_method);
    const isFormulaBased = feeMethod === "percent" || feeMethod === "reference";
    return {
      ...item,
      quantity: isFormulaBased || feeMethod === "area_unit" ? 1 : item.quantity,
      unit_price: isFormulaBased ? totalPrice : item.unit_price,
      total_price: totalPrice,
    };
  });

  const updateOtherItem = db.prepare(`
    UPDATE quotation_items
    SET quantity = ?, unit_price = ?, total_price = ?
    WHERE id = ? AND quotation_id = ?
  `);
  normalizedItems.filter((item) => isOtherCategory(item.category)).forEach((item) => {
    updateOtherItem.run(item.quantity, item.unit_price, item.total_price, item.id, quotation.id);
  });

  const totals = calculate(normalizedItems, settings, quotationHouseArea);
  const persistedSettings = { ...settings, discount: totals.discount };
  db.prepare(`
    UPDATE quotations
    SET total_amount = ?, discount = ?, final_amount = ?, settings = ?, updated_at = datetime('now')
    WHERE id = ? AND company_id = ?
  `).run(totals.directAmount + totals.taxAmount, totals.discount, totals.finalAmount, JSON.stringify(persistedSettings), quotation.id, quotation.company_id);
  if (quotation.project_id) {
    db.prepare("UPDATE projects SET contract_amount = ?, status = CASE WHEN status = 'LEAD' THEN 'QUOTED' ELSE status END, updated_at = datetime('now') WHERE id = ?")
      .run(totals.finalAmount, quotation.project_id);
  }
  return { totals, settings: persistedSettings };
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const shareClaims = verifyQuotationShareToken(req.nextUrl.searchParams.get("share") || "", params.id);
  const auth = shareClaims ? null : getAuthContext(req);
  if (!shareClaims && !auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (auth && !hasPermission(auth, "quotations.manage")) return NextResponse.json({ message: "没有报价查看权限" }, { status: 403 });
  const companyId = shareClaims?.companyId || auth?.companyId || "";
  const db = getDb();
  ensureQuotationColumns(db);
  ensureQuotationItemColumns(db);
  const userId = getCurrentUserId(req);
  const quotation = db.prepare(`
    SELECT q.*, company.name as company_name, p.name as project_name, p.address as project_address, p.area as project_area,
      CASE WHEN q.project_id IS NULL THEN 1 ELSE 0 END as is_unbound,
      c.id as customer_id,
      COALESCE(c.name, q.temp_customer_name) as customer_name,
      COALESCE(c.phone, q.temp_customer_phone) as customer_phone,
      COALESCE(c.weixin, q.temp_customer_weixin) as customer_weixin,
      COALESCE(c.address, q.temp_customer_address) as customer_address,
      COALESCE(c.house_address, q.temp_customer_house_address) as customer_house_address,
      COALESCE(c.address_location_name, q.temp_customer_address_location_name) as customer_address_location_name,
      COALESCE(c.address_location_address, q.temp_customer_address_location_address) as customer_address_location_address,
      COALESCE(c.address_latitude, q.temp_customer_address_latitude) as customer_address_latitude,
      COALESCE(c.address_longitude, q.temp_customer_address_longitude) as customer_address_longitude,
      COALESCE(c.building_no, q.temp_customer_building_no) as customer_building_no,
      COALESCE(c.unit_no, q.temp_customer_unit_no) as customer_unit_no,
      COALESCE(c.room_no, q.temp_customer_room_no) as customer_room_no,
      COALESCE(c.no_room_number, q.temp_customer_no_room_number, 0) as customer_no_room_number,
      COALESCE(c.area_size, q.temp_customer_area) as customer_area_size,
      c.decoration_type as customer_decoration_type,
      u.name as creator_name,
      COALESCE((
        SELECT designer.name
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ), NULLIF(TRIM(COALESCE(c.designer_name_manual, q.temp_customer_designer_name, '')), '')) as designer_name
    FROM quotations q
    LEFT JOIN companies company ON company.id = q.company_id
    LEFT JOIN projects p ON q.project_id = p.id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON q.created_by_id = u.id
    WHERE q.id = ? AND q.company_id = ? AND q.deleted_at IS NULL
  `).get(params.id, companyId) as any;
  if (!quotation) return NextResponse.json({ message: "报价不存在" }, { status: 404 });
  if (auth) {
    if (!canAccessQuotationRecord(db, quotation, auth)) {
      return NextResponse.json({ message: "没有该报价的查看权限" }, { status: 403 });
    }
  }

  const rawItems = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, created_at ASC").all(params.id) as any[];
  const rawSettings = parseSettings(quotation.settings);
  const migration = migrateManagementFeeToOtherItem(rawItems, rawSettings);
  const items = migration.items;
  const quotationHouseArea = safeNonNegativeNumber(quotation.customer_area_size ?? quotation.project_area);
  const branchSettings = getBranchSettingsForCustomer(db, quotation.customer_id);
  const recipientReadonly = Boolean(shareClaims) || isReadonlyQuotationRecipient(db, params.id, userId);
  const contentLockReason = getQuotationContentLockReason(db, quotation);
  const readonlyMessage = recipientReadonly
    ? "该报价单由他人发送给你，仅支持查看、打印和导出，不能修改报价内容。"
    : getQuotationContentLockMessage(contentLockReason);
  const settings = {
    ...migration.settings,
    signatureLabels: normalizeQuotationSignatureLabels(branchSettings.settings.printSettings.quotationSignatureLabels),
  };
  return NextResponse.json({
    ...quotation,
    branch_company_logo_url: branchSettings.settings.printSettings.quotationLogoUrl || branchSettings.settings.basicInfo.companyLogoUrl || "",
    branch_company_legal_name: branchSettings.settings.basicInfo.legalCompanyName || "",
    branch_company_short_name: branchSettings.settings.basicInfo.companyShortName || "",
    branch_company_phone: branchSettings.settings.basicInfo.contactPhone || "",
    settings,
    items,
    totals: calculate(items, { ...settings, discount: quotation.discount ?? settings.discount }, quotationHouseArea),
    legacyManagementFeeMigrated: migration.migrated,
    readonly: recipientReadonly || Boolean(contentLockReason),
    readonlyReason: recipientReadonly ? "recipient" : contentLockReason || "",
    readonlyMessage,
  });
}

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "quotations.manage")) return NextResponse.json({ message: "没有报价管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureQuotationColumns(db);
    ensureQuotationItemColumns(db);
    ensureQuotationChangeLogSchema(db);
    const existing = db.prepare("SELECT * FROM quotations WHERE id = ? AND company_id = ?").get(params.id, auth.companyId) as any;
    if (!existing) return NextResponse.json({ message: "报价不存在" }, { status: 404 });
    const userId = auth.userId;
    if (!canAccessQuotationRecord(db, existing, auth)) {
      return NextResponse.json({ message: "没有该报价的管理权限" }, { status: 403 });
    }

    const body = await req.json();
    const action = String(body.action || "").trim();
    if (isReadonlyQuotationRecipient(db, params.id, userId)) {
      return NextResponse.json({ message: "设计师只能查看、打印和下载报价单，不能修改报价内容" }, { status: 403 });
    }

    if (action === "checkQuotaUpdates") {
      const candidates = getQuotaUpdateCandidates(db, params.id, auth.companyId);
      const budgetCompilationUpdate = getTemplateBudgetCompilationState(db, existing, auth.companyId);
      return NextResponse.json({
        updates: candidates.map(({ item, quota, differences, code }) => ({
          itemId: item.id,
          itemName: item.name,
          space: item.space || "",
          quotaId: quota.id,
          quotaCode: code,
          latestName: quota.name || "",
          differences,
        })),
        budgetCompilationUpdate: budgetCompilationUpdate ? {
          templateId: budgetCompilationUpdate.templateId,
          templateName: budgetCompilationUpdate.templateName,
          currentExists: budgetCompilationUpdate.currentExists,
        } : null,
      });
    }

    if (action === "syncQuotaItems") {
      const selectedItemIds = Array.isArray(body.itemIds) ? body.itemIds.map((id: unknown) => String(id || "").trim()).filter(Boolean) : [];
      const candidates = getQuotaUpdateCandidates(db, params.id, auth.companyId, selectedItemIds.length ? selectedItemIds : undefined);
      const quotationHouseArea = getQuotationHouseArea(db, existing);
      if (candidates.length === 0) return NextResponse.json({ success: true, updatedCount: 0, items: getNormalizedQuotationItemsForTotals(db, params.id), totals: calculate(getNormalizedQuotationItemsForTotals(db, params.id), parseSettings(existing.settings), quotationHouseArea) });
      const beforeItems = getQuotationItemsForChangeLog(db, params.id);

      const updateItem = db.prepare(`
        UPDATE quotation_items
        SET name = ?,
          spec = ?,
          unit = ?,
          unit_price = ?,
          total_price = ?,
          material_cost = ?,
          labor_cost = ?,
          quota_source_id = ?,
          quota_source_type = 'standard'
        WHERE id = ? AND quotation_id = ?
      `);
      const tx = (db as any).transaction(() => {
        candidates.forEach(({ item, quota }) => {
          const materialCost = safeNonNegativeNumber(quota.material_price);
          const laborCost = safeNonNegativeNumber(quota.labor_price);
          const unitPrice = toMoney(materialCost + laborCost);
          const quantity = safeNonNegativeNumber(item.quantity);
          updateItem.run(
            String(quota.name || "").trim(),
            String(quota.construction_description || "").trim(),
            String(quota.unit || "").trim(),
            unitPrice,
            toMoney(quantity * unitPrice),
            materialCost,
            laborCost,
            quota.id,
            item.id,
            params.id,
          );
        });
        const nextItems = getNormalizedQuotationItemsForTotals(db, params.id);
        const nextSettings = parseSettings(existing.settings);
        const totals = calculate(nextItems, { ...nextSettings, discount: existing.discount ?? nextSettings.discount }, quotationHouseArea);
        db.prepare(`
          UPDATE quotations
          SET total_amount = ?, final_amount = ?, updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(totals.directAmount + totals.taxAmount, totals.finalAmount, params.id, auth.companyId);
        if (existing.project_id) {
          db.prepare("UPDATE projects SET contract_amount = ?, status = CASE WHEN status = 'LEAD' THEN 'QUOTED' ELSE status END, updated_at = datetime('now') WHERE id = ?")
            .run(totals.finalAmount, existing.project_id);
        }
      });
      tx();
      safelyRecordQuotationItemChanges({
        db,
        companyId: auth.companyId,
        quotationId: params.id,
        userId,
        action: "quota_sync",
        beforeItems,
        afterItems: getQuotationItemsForChangeLog(db, params.id),
      });
      if (String(existing.status || "").toUpperCase() === "APPROVED") {
        syncProjectCostSnapshotForQuotation(db, params.id);
      }
      const nextItems = getNormalizedQuotationItemsForTotals(db, params.id);
      const nextSettings = parseSettings(existing.settings);
      const totals = calculate(nextItems, { ...nextSettings, discount: existing.discount ?? nextSettings.discount }, quotationHouseArea);
      const customerId = getQuotationCustomerId(db, params.id);
      if (customerId) {
        recordCustomerOperation(db, {
          userId,
          customerId,
          action: "customer.quotation.quota_sync",
          module: "预算报价",
          title: "更新定额项目",
          content: `${existing.title || "装修报价单"} 更新了 ${candidates.length} 条基装定额`,
          targetName: existing.title || "",
          metadata: { quotationId: params.id, itemIds: candidates.map(({ item }) => item.id) },
          ipAddress: getRequestIp(req),
        });
      }
      return NextResponse.json({ success: true, updatedCount: candidates.length, items: nextItems, totals });
    }

    if (action === "restore") {
      if (!existing.deleted_at) return NextResponse.json({ success: true });
      db.prepare("UPDATE quotations SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?").run(params.id);
      const customerId = getQuotationCustomerId(db, params.id);
      if (customerId) syncCustomerProgress(db, customerId);
      if (customerId) {
        recordCustomerOperation(db, {
          userId,
          customerId,
          action: "customer.quotation.restore",
          module: "预算报价",
          title: "恢复报价",
          content: existing.title || "恢复已删除报价",
          targetName: existing.title || "",
          metadata: { quotationId: params.id },
          ipAddress: getRequestIp(req),
        });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "hardDelete") {
      if (!existing.deleted_at) return NextResponse.json({ message: "请先删除到回收站后再彻底删除" }, { status: 400 });
      const blockReason = getQuotationDeleteBlockReason(db, existing);
      if (blockReason) return NextResponse.json({ message: blockReason }, { status: 400 });
      const customerId = getQuotationCustomerId(db, params.id);
      const ipAddress = getRequestIp(req);
      const tx = (db as any).transaction(() => {
        clearQuotationHardDeleteDependencies(db, params.id);
        db.prepare("DELETE FROM quotation_items WHERE quotation_id = ?").run(params.id);
        db.prepare("DELETE FROM quotations WHERE id = ?").run(params.id);
        archiveQuotationCreatedCustomerIfEmpty(db, {
          customerId,
          companyId: auth.companyId,
          userId,
          ipAddress,
        });
      });
      tx();
      if (customerId) syncCustomerProgress(db, customerId);
      if (customerId) {
        recordCustomerOperation(db, {
          userId,
          customerId,
          action: "customer.quotation.hard_delete",
          module: "预算报价",
          title: "彻底删除报价",
          content: existing.title || "彻底删除回收站报价",
          targetName: existing.title || "",
          metadata: { quotationId: params.id },
          ipAddress,
        });
      }
      return NextResponse.json({ success: true });
    }

    if (existing.deleted_at) return NextResponse.json({ message: "报价已在回收站，请先恢复后再操作" }, { status: 400 });
    const contentLockMessage = getQuotationContentLockMessage(getQuotationContentLockReason(db, existing));
    const contentMutationActions = new Set(["syncQuotaItems", "updateProjectInfo", "updateQuotationType", "bindCustomer", "updateNotes", "applyTemplateBudgetCompilation"]);
    if (contentLockMessage && contentMutationActions.has(action)) {
      return NextResponse.json({ message: contentLockMessage }, { status: 423 });
    }

    if (action === "applyTemplateBudgetCompilation") {
      const currentSettings = parseSettings(existing.settings);
      const hasTemplateRef = String(currentSettings.quotaTemplateId || "").trim() || String(currentSettings.quotaTemplateName || "").trim();
      if (!hasTemplateRef) {
        return NextResponse.json({ message: "当前报价没有记录关联定额模板，无法自动补入预算编制。" }, { status: 400 });
      }
      const budgetCompilationUpdate = getTemplateBudgetCompilationState(db, existing, auth.companyId);
      if (!budgetCompilationUpdate) {
        const templateRow = getQuotationTemplateRow(db, auth.companyId, currentSettings);
        if (!templateRow) {
          return NextResponse.json({ message: "关联定额模板不存在或已删除，无法补入预算编制。" }, { status: 404 });
        }
        const templatePayload = parseJsonObject(templateRow.payload);
        const budgetCompilationHtml = String(templatePayload.budgetCompilationHtml || templatePayload.budgetCompilation || "").trim();
        if (!hasReadableRichText(budgetCompilationHtml)) {
          return NextResponse.json({ message: "关联定额模板暂无预算编制内容。" }, { status: 400 });
        }
        return NextResponse.json({ message: "当前报价的预算编制已是最新。" }, { status: 400 });
      }

      const nextSettings = {
        ...budgetCompilationUpdate.settings,
        quotaTemplateId: budgetCompilationUpdate.templateId,
        quotaTemplateName: budgetCompilationUpdate.templateName,
        budgetCompilationHtml: budgetCompilationUpdate.latestHtml,
      };
      db.prepare(`
        UPDATE quotations
        SET settings = ?, updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(JSON.stringify(nextSettings), params.id, auth.companyId);

      const customerId = getQuotationCustomerId(db, params.id);
      if (customerId) {
        recordCustomerOperation(db, {
          userId,
          customerId,
          action: "customer.quotation.budget_compilation_apply",
          module: "预算报价",
          title: budgetCompilationUpdate.currentExists ? "更新预算编制" : "补入预算编制",
          content: `${existing.title || "装修报价单"} ${budgetCompilationUpdate.currentExists ? "更新" : "补入"}预算编制`,
          targetName: existing.title || "",
          metadata: { quotationId: params.id, quotaTemplateId: nextSettings.quotaTemplateId || null },
          ipAddress: getRequestIp(req),
        });
      }

      return NextResponse.json({ success: true, settings: nextSettings, mode: budgetCompilationUpdate.currentExists ? "update" : "insert" });
    }

    if (action === "updateQuotationType") {
      const quotationType = String(body.quotation_type || "").trim().slice(0, 20);
      const currentSettings = parseSettings(existing.settings);
      const nextSettings = {
        ...currentSettings,
        quotationType,
      };
      db.prepare(`
        UPDATE quotations
        SET quotation_type = ?, settings = ?, updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(quotationType || null, JSON.stringify(nextSettings), params.id, auth.companyId);

      const customerId = getQuotationCustomerId(db, params.id);
      if (customerId) {
        recordCustomerOperation(db, {
          userId,
          customerId,
          action: "customer.quotation.type_update",
          module: "预算报价",
          title: "更新报价类型",
          content: quotationType ? `报价类型更新为：${quotationType}` : "清空报价类型",
          targetName: existing.title || "",
          metadata: { quotationId: params.id, quotationType: quotationType || null },
          ipAddress: getRequestIp(req),
        });
      }

      return NextResponse.json({ success: true, quotation_type: quotationType || null, settings: nextSettings });
    }

    if (action === "updateProjectInfo") {
      const customerName = String(body.customer_name || "").trim();
      const designerName = String(body.designer_name || "").trim();
      const rawCustomerPhone = String(body.customer_phone || "").trim();
      const customerPhone = rawCustomerPhone === "仅微信联系" ? "" : rawCustomerPhone.replace(/\D/g, "").slice(0, 11);
      const customerPhoneForStorage = customerPhone || "仅微信联系";
      const customerWeixin = String(body.customer_weixin || body.weixin || "").trim();
      const customerAddress = String(body.customer_address || "").trim();
      const houseAddress = String(body.house_address || body.project_address || "").trim();
      const addressLocationName = String(body.address_location_name || "").trim();
      const addressLocationAddress = String(body.address_location_address || "").trim();
      const addressLatitude = body.address_latitude === "" || body.address_latitude === null || body.address_latitude === undefined ? null : Number(body.address_latitude);
      const addressLongitude = body.address_longitude === "" || body.address_longitude === null || body.address_longitude === undefined ? null : Number(body.address_longitude);
      const buildingNo = String(body.building_no || "").trim();
      const unitNo = String(body.unit_no || "").trim();
      const roomNo = String(body.room_no || "").trim();
	      const noRoomNumber = Boolean(body.no_room_number);
	      const areaSize = safeNonNegativeNumber(body.area_size);
	      const quotationType = Object.prototype.hasOwnProperty.call(body, "quotation_type")
	        ? String(body.quotation_type || "").trim().slice(0, 20)
	        : String(existing.quotation_type || parseSettings(existing.settings).quotationType || "").trim().slice(0, 20);
	      const decorationType = String(body.decoration_type || "").trim();
      const roomText = noRoomNumber ? "暂无房号" : [buildingNo, unitNo, roomNo].filter(Boolean).join("-");
      const projectName = roomText || String(body.project_name || "").trim() || customerAddress || houseAddress || "工地";
      const projectAddress = houseAddress || customerAddress;

      if (!customerAddress) return NextResponse.json({ message: "请填写小区/地址" }, { status: 400 });

      const bound = existing.project_id
        ? db.prepare(`
          SELECT p.id as project_id, p.customer_id, c.id as customer_id
          FROM projects p
          LEFT JOIN customers c ON c.id = p.customer_id AND c.company_id = p.company_id AND c.deleted_at IS NULL
          WHERE p.id = ? AND p.company_id = ? AND p.deleted_at IS NULL
          LIMIT 1
        `).get(existing.project_id, auth.companyId) as any
        : null;

      const tx = (db as any).transaction(() => {
        const currentSettings = parseSettings(existing.settings);
	        const nextSettings = {
	          ...currentSettings,
	          quotationType,
	          quotationDecorationType: decorationType,
	        };
	        db.prepare("UPDATE quotations SET quotation_type = ?, temp_customer_decoration_type = ?, settings = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
	          .run(quotationType || null, decorationType || null, JSON.stringify(nextSettings), params.id, auth.companyId);
        if (bound?.project_id && bound?.customer_id) {
          db.prepare(`
            UPDATE customers
            SET name = ?, designer_name_manual = ?, phone = ?, weixin = ?, address = ?, house_address = ?,
              address_location_name = ?, address_location_address = ?, address_latitude = ?, address_longitude = ?,
              building_no = ?, unit_no = ?, room_no = ?, no_room_number = ?, area_size = ?, decoration_type = ?, updated_at = datetime('now')
            WHERE id = ? AND company_id = ?
          `).run(
            customerName || null,
            designerName || null,
            customerPhoneForStorage,
            customerWeixin || null,
            customerAddress || null,
            houseAddress || customerAddress || null,
            addressLocationName || null,
            addressLocationAddress || null,
            Number.isFinite(addressLatitude) ? addressLatitude : null,
            Number.isFinite(addressLongitude) ? addressLongitude : null,
            noRoomNumber ? null : buildingNo || null,
            noRoomNumber ? null : unitNo || null,
            noRoomNumber ? null : roomNo || null,
            noRoomNumber ? 1 : 0,
            areaSize || null,
            decorationType || null,
            bound.customer_id,
            auth.companyId,
          );
          db.prepare(`
            UPDATE projects
            SET name = ?, address = ?, area = ?, updated_at = datetime('now')
            WHERE id = ? AND company_id = ?
          `).run(projectName, projectAddress || null, areaSize || null, bound.project_id, auth.companyId);
          return;
        }

        db.prepare(`
          UPDATE quotations
          SET temp_customer_name = ?, temp_customer_designer_name = ?, temp_customer_phone = ?, temp_customer_weixin = ?, temp_customer_address = ?,
            temp_customer_house_address = ?, temp_customer_address_location_name = ?, temp_customer_address_location_address = ?,
            temp_customer_address_latitude = ?, temp_customer_address_longitude = ?,
            temp_customer_building_no = ?, temp_customer_unit_no = ?, temp_customer_room_no = ?, temp_customer_no_room_number = ?,
            temp_customer_area = ?, temp_customer_decoration_type = ?, updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(
          customerName || null,
          designerName || null,
          customerPhone || null,
          customerWeixin || null,
          customerAddress || [houseAddress, roomText].filter(Boolean).join(" ") || null,
          houseAddress || customerAddress || null,
          addressLocationName || null,
          addressLocationAddress || null,
          Number.isFinite(addressLatitude) ? addressLatitude : null,
          Number.isFinite(addressLongitude) ? addressLongitude : null,
          noRoomNumber ? null : buildingNo || null,
          noRoomNumber ? null : unitNo || null,
          noRoomNumber ? null : roomNo || null,
          noRoomNumber ? 1 : 0,
          areaSize || null,
          decorationType || null,
          params.id,
          auth.companyId,
        );
      });
      tx();

      const customerId = bound?.customer_id || getQuotationCustomerId(db, params.id);
      if (customerId) {
        syncCustomerProgress(db, customerId);
        recordCustomerOperation(db, {
          userId,
          customerId,
          action: "customer.quotation.project_info_update",
          module: "预算报价",
          title: "更新报价基础信息",
          content: `${existing.title || "装修报价单"} 更新了报价客户基础信息`,
          targetName: existing.title || "",
          metadata: { quotationId: params.id, projectId: bound?.project_id || existing.project_id || null },
          ipAddress: getRequestIp(req),
        });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "bindCustomer") {
      if (existing.project_id) return NextResponse.json({ message: "该报价已绑定客户" }, { status: 400 });
      const customerId = String(body.customer_id || "").trim();
      if (!customerId) return NextResponse.json({ message: "请选择要绑定的客户" }, { status: 400 });
      const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL").get(customerId, auth.companyId) as any;
      if (!customer) return NextResponse.json({ message: "客户不存在" }, { status: 404 });
      const customerStoreName = String(customer.service_store || "").trim();
      const quotationOrg = customerStoreName
        ? getStoreOrgByName(db, customerStoreName, auth.companyId)
        : getQuotationOwnedStoreOrg(db, existing, auth.companyId);
      if (!quotationOrg?.id) return NextResponse.json({ message: "请选择报价归属门店后再绑定客户" }, { status: 400 });
      if (!canAccessQuotationOrg(db, userId, auth.companyId, quotationOrg.id)) {
        return NextResponse.json({ message: "没有该门店的报价权限" }, { status: 403 });
      }
      let project = db.prepare(`
        SELECT * FROM projects
        WHERE customer_id = ? AND company_id = ? AND deleted_at IS NULL
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id DESC
        LIMIT 1
      `).get(customer.id, auth.companyId) as any;
      const tx = (db as any).transaction(() => {
        if (!project) {
          const manager = db.prepare("SELECT user_id FROM customer_team WHERE customer_id = ? AND role = 'designer' ORDER BY assigned_at DESC LIMIT 1").get(customer.id) as any;
          const projectId = makeId("PROJ");
          db.prepare(`
            INSERT INTO projects (id, company_id, customer_id, manager_id, name, address, area, status, budget_amount, contract_amount, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'QUOTED', ?, 0, datetime('now'), datetime('now'))
          `).run(
            projectId,
            auth.companyId,
            customer.id,
            manager?.user_id || userId,
            buildDefaultProjectName(customer),
            customer.address || customer.area || existing.temp_customer_address || null,
            customer.area_size || existing.temp_customer_area || null,
            customer.budget || 0
          );
          project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
        }
        const latest = db.prepare("SELECT COALESCE(MAX(version), 0) as version FROM quotations WHERE project_id = ? AND deleted_at IS NULL").get(project.id) as any;
        db.prepare(`
          UPDATE quotations
          SET project_id = ?, version = ?, quotation_org_unit_id = ?, quotation_org_unit_name = ?,
            temp_customer_name = NULL, temp_customer_designer_name = NULL, temp_customer_phone = NULL, temp_customer_weixin = NULL,
            temp_customer_address = NULL, temp_customer_house_address = NULL,
            temp_customer_address_location_name = NULL, temp_customer_address_location_address = NULL,
            temp_customer_address_latitude = NULL, temp_customer_address_longitude = NULL,
            temp_customer_building_no = NULL, temp_customer_unit_no = NULL, temp_customer_room_no = NULL,
            temp_customer_no_room_number = NULL, temp_customer_area = NULL,
            temp_customer_decoration_type = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_decoration_type, '')), ''), ?),
            updated_at = datetime('now')
          WHERE id = ?
        `).run(project.id, Number(latest?.version || 0) + 1, quotationOrg.id, quotationOrg.name, String(customer.decoration_type || "").trim() || null, params.id);
        if (!customerStoreName) {
          db.prepare("UPDATE customers SET service_store = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
            .run(quotationOrg.name, customer.id, auth.companyId);
        }
        db.prepare("UPDATE projects SET contract_amount = ?, status = CASE WHEN status = 'LEAD' THEN 'QUOTED' ELSE status END, updated_at = datetime('now') WHERE id = ?")
          .run(Number(existing.final_amount ?? existing.total_amount ?? 0), project.id);
      });
      tx();
      syncCustomerProgress(db, customer.id);
      recordCustomerOperation(db, {
        userId,
        customerId: customer.id,
        action: "customer.quotation.bind",
        module: "预算报价",
        title: "绑定临时报价",
        content: `${existing.title || "临时报价单"} 已绑定到客户「${customer.name || "未命名客户"}」`,
        targetName: existing.title || "",
        metadata: { quotationId: params.id, projectId: project?.id || null },
        ipAddress: getRequestIp(req),
      });
      return NextResponse.json({ success: true, projectId: project?.id || null });
    }

    if (action === "copySpaceCategoryToQuotation") {
      const targetQuotationId = String(body.target_quotation_id || body.targetQuotationId || "").trim();
      const sourceSpace = String(body.source_space || body.sourceSpace || "").trim();
      const mode = body.mode === "new_space" ? "new_space" : "append";
      if (!targetQuotationId) return NextResponse.json({ message: "请选择目标报价" }, { status: 400 });
      if (targetQuotationId === params.id) return NextResponse.json({ message: "目标报价不能选择当前报价" }, { status: 400 });
      if (!sourceSpace) return NextResponse.json({ message: "请选择要复制的空间/类别" }, { status: 400 });

      const targetQuotation = db.prepare(`
        SELECT *
        FROM quotations
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(targetQuotationId, auth.companyId) as any;
      if (!targetQuotation) return NextResponse.json({ message: "目标报价不存在" }, { status: 404 });
      if (!canAccessQuotationRecord(db, targetQuotation, auth)) {
        return NextResponse.json({ message: "没有目标报价的操作权限" }, { status: 403 });
      }
      if (isReadonlyQuotationRecipient(db, targetQuotationId, userId)) {
        return NextResponse.json({ message: "设计师只能查看、打印和下载报价单，不能修改报价内容" }, { status: 403 });
      }
      const targetLockMessage = getQuotationContentLockMessage(getQuotationContentLockReason(db, targetQuotation));
      if (targetLockMessage) return NextResponse.json({ message: targetLockMessage }, { status: 423 });

      const rawSourceItems = Array.isArray(body.items)
        ? body.items
        : db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, created_at ASC").all(params.id);
      const sourceItems = rawSourceItems
        .map((item: any, index: number) => {
          const category = String(item.category || "base").trim() || "base";
          const isBase = isBaseCategory(category);
          const isCustomCabinet = isCustomCabinetCategory(category);
          const quantity = safeNonNegativeNumber(item.quantity);
          const materialCost = safeNonNegativeNumber(item.material_cost);
          const laborCost = safeNonNegativeNumber(item.labor_cost);
          const rawUnitPrice = safeNonNegativeNumber(item.unit_price);
          const unitPrice = isBase ? materialCost + laborCost : rawUnitPrice;
          const cabinetArea = getCustomCabinetArea({ material_cost: materialCost, labor_cost: laborCost });
          const totalPrice = isCustomCabinet
            ? toMoney(quantity * (cabinetArea > 0 ? cabinetArea : 1) * unitPrice)
            : toMoney(quantity * unitPrice);
          return {
            ...item,
            category,
            space: inferItemSpace(item),
            name: String(item.name || "").trim(),
            spec: String(item.spec || "").trim(),
            material_model: String(item.material_model || "").trim(),
            remark: String(item.remark || "").trim(),
            unit: isCustomCabinet ? String(cabinetArea || item.unit || "") : String(item.unit || "").trim(),
            quantity,
            unit_price: unitPrice,
            total_price: totalPrice,
            material_cost: isBase || isCustomCabinet ? materialCost : Number(item.material_cost || 0),
            labor_cost: isBase ? laborCost : isCustomCabinet ? laborCost : Number(item.labor_cost || 0),
            profit_margin: safeNonNegativeNumber(item.profit_margin),
            cost_material_unit: safeNonNegativeNumber(item.cost_material_unit),
            cost_labor_unit: safeNonNegativeNumber(item.cost_labor_unit),
            cost_loss_rate: safeNonNegativeNumber(item.cost_loss_rate),
            sort_order: Number(item.sort_order || index + 1),
          };
        })
        .filter((item: any) => item.name && isDirectItemCategory(item.category) && inferItemSpace(item) === sourceSpace);
      if (sourceItems.length === 0) {
        return NextResponse.json({ message: `「${sourceSpace}」下暂无可复制项目` }, { status: 400 });
      }

      const beforeItems = getQuotationItemsForChangeLog(db, targetQuotationId);
      let copiedCount = 0;
      let targetSpace = sourceSpace;
      let totals: ReturnType<typeof calculate> | null = null;
      const tx = (db as any).transaction(() => {
        const targetSettings = parseSettings(targetQuotation.settings);
        const targetSpaceNames = uniqueValues([
          ...(Array.isArray(targetSettings.quoteSpaces) ? targetSettings.quoteSpaces : []),
          ...(db.prepare("SELECT DISTINCT TRIM(COALESCE(space, '')) as space FROM quotation_items WHERE quotation_id = ?")
            .all(targetQuotationId) as any[])
            .map((row) => String(row.space || "").trim()),
        ]);
        targetSpace = mode === "new_space" && targetSpaceNames.includes(sourceSpace)
          ? getNextSpaceCopyName(sourceSpace, targetSpaceNames)
          : sourceSpace;

        const maxSortRow = db.prepare("SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM quotation_items WHERE quotation_id = ?")
          .get(targetQuotationId) as any;
        let nextSortOrder = Number(maxSortRow?.max_sort || 0);
        const insertItem = db.prepare(`
          INSERT INTO quotation_items (id, quotation_id, category, space, work_type_id, work_type_name, material_category_id, material_category_name, name, spec, material_model, remark, unit, quantity, unit_price, total_price, material_cost, labor_cost, profit_margin, row_color, fee_calc_method, fee_calc_base, fee_rate, fee_scope_mode, fee_scope_space_ids, fee_scope_space_names, cost_material_unit, cost_labor_unit, cost_loss_rate, cost_source, quota_source_id, quota_source_type, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        sourceItems.forEach((item: any) => {
          nextSortOrder += 1;
          insertItem.run(
            makeId("QITEM"),
            targetQuotationId,
            item.category,
            targetSpace,
            String(item.work_type_id || "").trim() || null,
            String(item.work_type_name || "").trim() || null,
            String(item.material_category_id || "").trim() || null,
            String(item.material_category_name || "").trim() || null,
            item.name,
            item.spec || null,
            item.material_model || null,
            item.remark || null,
            item.unit || "",
            item.quantity,
            item.unit_price,
            item.total_price,
            item.material_cost,
            item.labor_cost,
            item.profit_margin,
            normalizeRowColor(item.row_color),
            null,
            null,
            null,
            null,
            null,
            null,
            Number(item.cost_material_unit || 0),
            Number(item.cost_labor_unit || 0),
            Number(item.cost_loss_rate || 0),
            String(item.cost_source || "").trim() || null,
            isBaseCategory(item.category) ? String(item.quota_source_id || "").trim() || null : null,
            isBaseCategory(item.category) && String(item.quota_source_type || "").trim() ? String(item.quota_source_type || "").trim() : null,
            nextSortOrder,
          );
          copiedCount += 1;
        });

        const nextQuoteSpaces = uniqueValues([...(Array.isArray(targetSettings.quoteSpaces) ? targetSettings.quoteSpaces : []), targetSpace]);
        const nextQuoteCategories = orderQuoteCategories([
          ...(Array.isArray(targetSettings.quoteCategories) ? targetSettings.quoteCategories : []),
          ...sourceItems.map((item: any) => String(item.category || "")),
          "other",
        ]);
        const nextSettings = { ...targetSettings, quoteSpaces: nextQuoteSpaces, quoteCategories: nextQuoteCategories };
        db.prepare("UPDATE quotations SET settings = ? WHERE id = ? AND company_id = ?")
          .run(JSON.stringify(nextSettings), targetQuotationId, auth.companyId);
        const recalculated = recalculatePersistedQuotationTotals(db, { ...targetQuotation, settings: JSON.stringify(nextSettings) });
        totals = recalculated.totals;
      });
      tx();

      safelyRecordQuotationItemChanges({
        db,
        companyId: auth.companyId,
        quotationId: targetQuotationId,
        userId,
        action: "copy_space_category",
        beforeItems,
        afterItems: getQuotationItemsForChangeLog(db, targetQuotationId),
      });
      const targetCustomerId = getQuotationCustomerId(db, targetQuotationId);
      if (targetCustomerId) {
        syncCustomerProgress(db, targetCustomerId);
        recordCustomerOperation(db, {
          userId,
          customerId: targetCustomerId,
          action: "customer.quotation.copy_space_category",
          module: "预算报价",
          title: "复制空间/类别",
          content: `从「${existing.title || "装修报价单"}」复制「${sourceSpace}」到当前报价${targetSpace !== sourceSpace ? `，新增为「${targetSpace}」` : ""}，共 ${copiedCount} 项`,
          targetName: targetQuotation.title || "",
          metadata: { sourceQuotationId: params.id, targetQuotationId, sourceSpace, targetSpace, mode, copiedCount },
          ipAddress: getRequestIp(req),
        });
      }
      return NextResponse.json({ success: true, targetQuotationId, copiedCount, mode, sourceSpace, targetSpace, totals });
    }

    if (action === "copy") {
      const targetCustomerId = String(body.target_customer_id || body.customer_id || "").trim();
      const copyContentMode = body.copy_content_mode === "items_only" ? "items_only" : "full";
      const copyItemsOnly = copyContentMode === "items_only";
      const sourceCustomerId = getQuotationCustomerId(db, params.id);
      const copyToOtherCustomer = Boolean(targetCustomerId && targetCustomerId !== sourceCustomerId);
      let targetCustomer: any = null;
      let targetProjectId = existing.project_id || null;

      if (targetCustomerId) {
        targetCustomer = getValidQuotationCopyTargetCustomer(db, targetCustomerId, auth.companyId);
        if (!targetCustomer) return NextResponse.json({ message: "目标客户不存在或不可作为复制目标" }, { status: 404 });
        const targetProject = db.prepare(`
          SELECT * FROM projects
          WHERE customer_id = ? AND company_id = ? AND deleted_at IS NULL
          ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id DESC
          LIMIT 1
        `).get(targetCustomer.id, auth.companyId) as any;
        if (!targetProject) {
          const manager = db.prepare("SELECT user_id FROM customer_team WHERE customer_id = ? AND role = 'designer' ORDER BY assigned_at DESC LIMIT 1").get(targetCustomer.id) as any;
          targetProjectId = makeId("PROJ");
          db.prepare(`
            INSERT INTO projects (id, company_id, customer_id, manager_id, name, address, area, status, budget_amount, contract_amount, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'QUOTED', ?, 0, datetime('now'), datetime('now'))
          `).run(
            targetProjectId,
            auth.companyId,
            targetCustomer.id,
            manager?.user_id || userId,
            buildDefaultProjectName(targetCustomer),
            targetCustomer.address || targetCustomer.area || null,
            targetCustomer.area_size || null,
            targetCustomer.budget || 0
          );
        } else {
          targetProjectId = targetProject.id;
        }
      }

      const latest = targetProjectId
        ? db.prepare("SELECT COALESCE(MAX(version), 0) as version FROM quotations WHERE project_id = ? AND deleted_at IS NULL").get(targetProjectId) as any
        : { version: 0 };
      const nextQuotationOrg = targetCustomer
        ? getStoreOrgByName(db, targetCustomer.service_store || "", auth.companyId)
        : getQuotationOwnedStoreOrg(db, existing, auth.companyId);
      if (!nextQuotationOrg?.id) {
        return NextResponse.json({
          message: targetCustomer ? "目标客户没有有效服务门店，不能复制报价" : "原报价没有归属门店，不能复制报价",
        }, { status: 400 });
      }
      if (!canAccessQuotationOrg(db, userId, auth.companyId, nextQuotationOrg.id)) {
        return NextResponse.json({ message: "没有该门店的报价权限" }, { status: 403 });
      }
      const nextQuotationId = makeId("QUO");
      const sourceItems = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, created_at ASC").all(params.id) as any[];
      const copiedItemIdBySourceId = new Map<string, string>();
      sourceItems.forEach((item) => copiedItemIdBySourceId.set(String(item.id), makeId("QITEM")));
      const nextTitle = copyToOtherCustomer && targetCustomer
        ? `${buildDefaultQuotationTitle(targetCustomer)} 副本`
        : `${existing.title || "装修报价单"} 副本`;
	      const existingSettings = parseSettings(existing.settings);
	      const nextQuotationType = String(existing.quotation_type || existingSettings.quotationType || "").trim().slice(0, 20);
	      const nextDecorationType = String(
        existing.temp_customer_decoration_type
          || existingSettings.quotationDecorationType
          || existingSettings.decorationType
          || targetCustomer?.decoration_type
          || "",
      ).trim();
      const nextSettings = copyItemsOnly
        ? {
	            ...existingSettings,
	            quotationType: nextQuotationType,
	            quotationDecorationType: nextDecorationType,
            discount: 0,
            discountMode: "amount",
            discountRate: 1,
            discountScope: "total",
            discountSpace: "",
            discountWorkType: "",
            discountRules: [],
            excludeSpecificDiscountAmount: 0,
          }
        : {
	            ...existingSettings,
	            quotationType: nextQuotationType,
	            quotationDecorationType: nextDecorationType,
          };

      const tx = (db as any).transaction(() => {
        db.prepare(`
	          INSERT INTO quotations (
	            id, project_id, company_id, title, quotation_type, version, total_amount, discount, final_amount, status, notes, customer_visible_note, terms, settings,
	            quotation_org_unit_id, quotation_org_unit_name,
	            temp_customer_name, temp_customer_designer_name, temp_customer_phone, temp_customer_weixin, temp_customer_address, temp_customer_area, temp_customer_decoration_type,
	            created_by_id, created_at, updated_at
	          )
	          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	        `).run(
	          nextQuotationId,
	          targetProjectId,
	          existing.company_id,
	          nextTitle,
	          nextQuotationType || null,
	          Number(latest?.version || 0) + 1,
          copyItemsOnly ? 0 : Number(existing.total_amount || 0),
          copyItemsOnly ? 0 : Number(existing.discount || 0),
          copyItemsOnly ? 0 : Number(existing.final_amount ?? 0),
          existing.notes || null,
          existing.customer_visible_note || null,
          existing.terms || null,
          JSON.stringify(nextSettings),
          nextQuotationOrg.id,
          nextQuotationOrg.name,
          targetCustomerId ? null : existing.temp_customer_name || null,
          targetCustomerId ? null : existing.temp_customer_designer_name || null,
          targetCustomerId ? null : existing.temp_customer_phone || null,
          targetCustomerId ? null : existing.temp_customer_weixin || null,
          targetCustomerId ? null : existing.temp_customer_address || null,
          targetCustomerId ? null : existing.temp_customer_area || null,
          nextDecorationType || null,
          existing.created_by_id
        );

        const insertItem = db.prepare(`
          INSERT INTO quotation_items (id, quotation_id, category, space, work_type_id, work_type_name, material_category_id, material_category_name, name, spec, material_model, remark, unit, quantity, unit_price, total_price, material_cost, labor_cost, profit_margin, row_color, fee_calc_method, fee_calc_base, fee_rate, fee_scope_mode, fee_scope_space_ids, fee_scope_space_names, cost_material_unit, cost_labor_unit, cost_loss_rate, cost_source, quota_source_id, quota_source_type, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        sourceItems.forEach((item) => {
          const copiedItemId = copiedItemIdBySourceId.get(String(item.id)) || makeId("QITEM");
          insertItem.run(
            copiedItemId,
            nextQuotationId,
            item.category,
            item.space,
            item.work_type_id || null,
            item.work_type_name || null,
            item.material_category_id || null,
            item.material_category_name || null,
            item.name,
            item.spec,
            item.material_model,
            item.remark,
            item.unit || "",
            copyItemsOnly ? 0 : item.quantity || 0,
            item.unit_price || 0,
            copyItemsOnly ? 0 : item.total_price || 0,
            item.material_cost || 0,
            item.labor_cost || 0,
            item.profit_margin || 0,
            item.row_color,
            item.fee_calc_method,
            isOtherCategory(item.category) ? remapStableFeeFormulaIds(item.fee_calc_base, copiedItemIdBySourceId) : item.fee_calc_base,
            item.fee_rate,
            isOtherCategory(item.category) ? normalizeFeeScopeMode(item.fee_scope_mode) : null,
            isOtherCategory(item.category) ? JSON.stringify(parseFeeScopeValues(item.fee_scope_space_ids)) : null,
            isOtherCategory(item.category) ? JSON.stringify(parseFeeScopeValues(item.fee_scope_space_names)) : null,
            item.cost_material_unit || 0,
            item.cost_labor_unit || 0,
            item.cost_loss_rate || 0,
            item.cost_source || null,
            item.quota_source_id || null,
            item.quota_source_type || null,
            item.sort_order || 0
          );
        });
      });
      tx();
      const customerId = getQuotationCustomerId(db, nextQuotationId);
      if (customerId) syncCustomerProgress(db, customerId);
      if (sourceCustomerId && sourceCustomerId !== customerId) syncCustomerProgress(db, sourceCustomerId);
      if (customerId) {
        recordCustomerOperation(db, {
          userId,
          customerId,
          action: "customer.quotation.copy",
          module: "预算报价",
          title: "复制报价",
          content: copyToOtherCustomer && targetCustomer
            ? `从「${existing.title || "装修报价单"}」复制生成新报价${copyItemsOnly ? "，仅复制项目" : ""}，并归档到客户「${targetCustomer.name || "未命名客户"}」`
            : `从「${existing.title || "装修报价单"}」复制生成新报价${copyItemsOnly ? "，仅复制项目" : ""}`,
          targetName: nextTitle,
          metadata: { sourceQuotationId: params.id, quotationId: nextQuotationId, targetCustomerId: targetCustomerId || null, copyContentMode },
          ipAddress: getRequestIp(req),
        });
      }
      return NextResponse.json({ id: nextQuotationId, customerId: customerId || null, projectId: targetProjectId || null });
    }

    if (action === "setStatus") {
      const status = String(body.status || "").trim().toUpperCase();
      const allowedStatuses = new Set(["DRAFT", "SENT", "REVISED", "APPROVED", "EXPIRED"]);
      if (!allowedStatuses.has(status)) return NextResponse.json({ message: "报价状态无效" }, { status: 400 });
      if (status === "APPROVED" && !existing.project_id) return NextResponse.json({ message: "临时报价需先绑定客户后才能设为正式报价" }, { status: 400 });
      if (status !== "APPROVED" && String(existing.status || "").toUpperCase() === "APPROVED") {
        if (isQuotationUsedBySignedContract(db, params.id)) {
          return NextResponse.json({ message: "该报价已被签订合同使用，不能撤销正式" }, { status: 400 });
        }
      }
      db.prepare("UPDATE quotations SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, params.id);
      if (status === "APPROVED") syncProjectCostSnapshotForQuotation(db, params.id);
      const customerId = getQuotationCustomerId(db, params.id);
      if (customerId) {
        recordCustomerOperation(db, {
          userId,
          customerId,
          action: "customer.quotation.status_update",
          module: "预算报价",
          title: "更新报价状态",
          content: `${existing.title || "装修报价单"} 状态更新为：${status}`,
          targetName: existing.title || "",
          metadata: { quotationId: params.id, status },
          ipAddress: getRequestIp(req),
        });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "sendToDesigner") {
      ensureQuotationReceiptTodoTable(db);
      const senderId = getCurrentUserId(req) || existing.created_by_id || null;
      const quotation = db.prepare(`
        SELECT q.*, p.customer_id, c.name as customer_name
        FROM quotations q
        LEFT JOIN projects p ON q.project_id = p.id
        LEFT JOIN customers c ON p.customer_id = c.id
        WHERE q.id = ? AND q.deleted_at IS NULL
      `).get(params.id) as any;
      if (!quotation?.customer_id) return NextResponse.json({ message: "报价未关联客户，无法发送" }, { status: 400 });

      const designers = db.prepare(`
        SELECT ct.user_id, u.name as user_name
        FROM customer_team ct
        INNER JOIN users u ON ct.user_id = u.id
        WHERE ct.customer_id = ?
          AND ct.role = 'DESIGNER'
          AND u.deleted_at IS NULL
          AND COALESCE(u.is_active, 1) = 1
        ORDER BY ct.assigned_at DESC
      `).all(quotation.customer_id) as any[];
      if (designers.length === 0) {
        return NextResponse.json({ message: `客户「${quotation.customer_name || "该客户"}」暂无设计师，无法发送报价单` }, { status: 400 });
      }

      const tx = (db as any).transaction(() => {
        designers.forEach((designer) => {
          const pending = db.prepare(`
            SELECT id FROM quotation_receipt_todos
            WHERE quotation_id = ? AND designer_id = ? AND status = 'pending' AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 1
          `).get(params.id, designer.user_id) as any;
          if (pending?.id) {
            db.prepare(`
              UPDATE quotation_receipt_todos
              SET customer_id = ?, sender_id = ?, created_at = datetime('now')
              WHERE id = ?
            `).run(quotation.customer_id, senderId, pending.id);
          } else {
            db.prepare(`
              INSERT INTO quotation_receipt_todos (id, quotation_id, customer_id, designer_id, sender_id, status, created_at)
              VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
            `).run(makeId("QTASK"), params.id, quotation.customer_id, designer.user_id, senderId);
          }
        });
        if (String(quotation.status || "").toUpperCase() !== "APPROVED") {
          db.prepare("UPDATE quotations SET status = ? WHERE id = ?").run("SENT", params.id);
        }
      });
      tx();
      recordCustomerOperation(db, {
        userId: senderId,
        customerId: quotation.customer_id,
        action: "customer.quotation.send_to_designer",
        module: "预算报价",
        title: "发送报价给设计师",
        content: `${quotation.title || "装修报价单"}，发送给 ${designers.length} 位设计师`,
        targetName: quotation.title || "",
        metadata: { quotationId: params.id, designerIds: designers.map((designer) => designer.user_id) },
        ipAddress: getRequestIp(req),
      });
      return NextResponse.json({ success: true, sentCount: designers.length });
    }

    if (action === "cancelSendToDesigner") {
      ensureQuotationReceiptTodoTable(db);
      const tx = (db as any).transaction(() => {
        db.prepare(`
          UPDATE quotation_receipt_todos
          SET deleted_at = datetime('now')
          WHERE quotation_id = ? AND status = 'pending' AND deleted_at IS NULL
        `).run(params.id);
        if (String(existing.status || "").toUpperCase() === "SENT") {
          db.prepare("UPDATE quotations SET status = ? WHERE id = ?").run("DRAFT", params.id);
        }
      });
      tx();
      const customerId = getQuotationCustomerId(db, params.id);
      if (customerId) {
        recordCustomerOperation(db, {
          userId,
          customerId,
          action: "customer.quotation.cancel_send_to_designer",
          module: "预算报价",
          title: "撤销发送报价",
          content: existing.title || "撤销发送给设计师的报价",
          targetName: existing.title || "",
          metadata: { quotationId: params.id },
          ipAddress: getRequestIp(req),
        });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "updateNotes") {
      const notes = String(body.notes || "").trim();
      const customerVisibleNote = String(body.customer_visible_note || "").trim();
      db.prepare("UPDATE quotations SET notes = ?, customer_visible_note = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
        .run(notes || null, customerVisibleNote || null, params.id, auth.companyId);
      const customerId = getQuotationCustomerId(db, params.id);
      if (customerId) {
        recordCustomerOperation(db, {
          userId,
          customerId,
          action: "customer.quotation.notes_update",
          module: "预算报价",
          title: "更新报价备注",
          content: `${existing.title || "装修报价单"} 更新了报价备注`,
          targetName: existing.title || "",
          metadata: { quotationId: params.id },
          ipAddress: getRequestIp(req),
        });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ message: "未知操作" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "操作报价失败" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "quotations.manage")) return NextResponse.json({ message: "没有报价管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureQuotationColumns(db);
    ensureQuotationItemColumns(db);
    ensureQuotationChangeLogSchema(db);
    const existing = db.prepare("SELECT * FROM quotations WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(params.id, auth.companyId) as any;
    if (!existing) return NextResponse.json({ message: "报价不存在" }, { status: 404 });
    const userId = auth.userId;
    if (isReadonlyQuotationRecipient(db, params.id, userId)) {
      return NextResponse.json({ message: "设计师只能查看、打印和下载报价单，不能修改报价内容" }, { status: 403 });
    }
    const contentLockMessage = getQuotationContentLockMessage(getQuotationContentLockReason(db, existing));
    if (contentLockMessage) return NextResponse.json({ message: contentLockMessage }, { status: 423 });

    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items as ItemInput[] : [];
    const existingSettings = parseSettings(existing.settings);
    const settings = {
      managementFeeRate: 0,
	      taxRate: Number(body.settings?.taxRate || 0),
	      discount: Number(body.settings?.discount || 0),
	      discountType: body.settings?.discountType === "space" || body.settings?.discountType === "work_type" ? body.settings.discountType : "fee",
	      discountMode: body.settings?.discountMode === "rate" ? "rate" : "amount",
	      discountRate: Math.min(1, Math.max(0, Number(body.settings?.discountRate ?? 1) || 0)),
	      discountScope: String(body.settings?.discountScope || "total").trim() || "total",
	      discountSpace: String(body.settings?.discountSpace || "").trim(),
	      discountWorkType: String(body.settings?.discountWorkType || "").trim(),
	      discountRules: normalizeDiscountRules(body.settings || {}),
	      excludeSpecificDiscountAmount: Math.max(0, Number(body.settings?.excludeSpecificDiscountAmount || 0)),
	      excludeSpecialDiscountItems: body.settings?.excludeSpecialDiscountItems === true,
	      excludeLaborOnlyDiscountItems: body.settings?.excludeLaborOnlyDiscountItems === true,
      warrantyMonths: Number(body.settings?.warrantyMonths || 24),
      quotaTemplateId: String(body.settings?.quotaTemplateId ?? existingSettings.quotaTemplateId ?? "").trim(),
      quotaTemplateName: String(body.settings?.quotaTemplateName ?? existingSettings.quotaTemplateName ?? "").trim(),
      quotationType: String(body.quotation_type ?? body.settings?.quotationType ?? existingSettings.quotationType ?? existing.quotation_type ?? "").trim().slice(0, 20),
      quotationDecorationType: String(body.settings?.quotationDecorationType ?? existingSettings.quotationDecorationType ?? existing.temp_customer_decoration_type ?? "").trim(),
      appendixNote: String(body.settings?.appendixNote ?? existingSettings.appendixNote ?? "").trim(),
      budgetCompilationHtml: String(body.settings?.budgetCompilationHtml ?? existingSettings.budgetCompilationHtml ?? "").trim(),
      quoteSpaces: Array.isArray(body.settings?.quoteSpaces)
        ? body.settings.quoteSpaces.map((space: unknown) => String(space || "").trim()).filter(Boolean)
        : [],
      quoteCategories: getQuoteCategoriesForItems(
        Array.isArray(body.settings?.quoteCategories) ? body.settings.quoteCategories.map((category: unknown) => String(category || "").trim()) : [],
        items,
      ),
      templatePricing: body.settings?.templatePricing && typeof body.settings.templatePricing === "object"
        ? body.settings.templatePricing
        : existingSettings.templatePricing,
    };

    let normalizedItems = items
      .map((item, index) => {
        const category = String(item.category || "base").trim() || "base";
        const isBase = isBaseCategory(category);
        const isOther = isOtherCategory(category);
        const isCustomCabinet = isCustomCabinetCategory(category);
        const feeMethod = normalizeFeeCalcMethod(item.fee_calc_method);
        const feeCalcBase = isOther && feeMethod !== "fixed" ? (feeMethod === "area_unit" ? "房屋面积" : normalizeFeeCalcBase(item.fee_calc_base) || "直接费") : "";
        const feeRate = isOther && feeMethod === "percent" ? Number(item.fee_rate || 0) : 0;
        const quantity = isOther ? Number(item.quantity || 0) : safeNonNegativeNumber(item.quantity);
        const rawUnitPrice = isOther ? Number(item.unit_price || 0) : safeNonNegativeNumber(item.unit_price);
        const materialCost = isOther ? Number(item.material_cost || 0) : safeNonNegativeNumber(item.material_cost);
        const laborCost = isOther ? Number(item.labor_cost || 0) : safeNonNegativeNumber(item.labor_cost);
        const profitMargin = isOther ? Number(item.profit_margin || 0) : safeNonNegativeNumber(item.profit_margin);
        const costMaterialUnit = isOther ? 0 : safeNonNegativeNumber(item.cost_material_unit);
        const costLaborUnit = isOther ? 0 : safeNonNegativeNumber(item.cost_labor_unit);
        const costLossRate = isOther ? 0 : safeNonNegativeNumber(item.cost_loss_rate);
        const finalMaterialCost = isBase || isCustomCabinet ? materialCost : Number(item.material_cost || 0);
        const finalLaborCost = isBase
          ? (materialCost || laborCost ? laborCost : rawUnitPrice)
          : isCustomCabinet ? laborCost : Number(item.labor_cost || 0);
        const unitPrice = isBase ? finalMaterialCost + finalLaborCost : rawUnitPrice;
        const cabinetArea = getCustomCabinetArea({ material_cost: finalMaterialCost, labor_cost: finalLaborCost });
        const totalPrice = isCustomCabinet
          ? toMoney(quantity * (cabinetArea > 0 ? cabinetArea : 1) * unitPrice)
          : toMoney(quantity * unitPrice);
        return {
          id: item.id || makeId("QITEM"),
          category,
          space: inferItemSpace({ category, name: item.name, spec: item.spec, space: item.space }),
          work_type_id: String(item.work_type_id || "").trim() || null,
          work_type_name: String(item.work_type_name || "").trim() || null,
          material_category_id: String(item.material_category_id || "").trim() || null,
          material_category_name: String(item.material_category_name || "").trim() || null,
          name: String(item.name || "").trim(),
          spec: String(item.spec || "").trim(),
          material_model: String(item.material_model || "").trim(),
          remark: String(item.remark || "").trim(),
          unit: isCustomCabinet ? String(cabinetArea) : String(item.unit ?? "").trim(),
          quantity: isOther && (feeMethod === "percent" || feeMethod === "reference" || feeMethod === "area_unit") ? 1 : quantity,
          unit_price: unitPrice,
          total_price: totalPrice,
          material_cost: finalMaterialCost,
          labor_cost: finalLaborCost,
          cost_material_unit: costMaterialUnit,
          cost_labor_unit: costLaborUnit,
          cost_loss_rate: costLossRate,
          cost_source: String(item.cost_source || "").trim() || null,
          quota_source_id: isBase ? String(item.quota_source_id || "").trim() || null : null,
          quota_source_type: isBase && String(item.quota_source_type || "").trim() ? String(item.quota_source_type || "").trim() : null,
          profit_margin: profitMargin,
          row_color: normalizeRowColor(item.row_color),
          fee_calc_method: isOther ? feeMethod : null,
          fee_calc_base: isOther ? feeCalcBase : null,
          fee_rate: isOther ? feeRate : null,
          fee_scope_mode: isOther ? normalizeFeeScopeMode(item.fee_scope_mode) : null,
          fee_scope_space_ids: isOther ? parseFeeScopeValues(item.fee_scope_space_ids) : [],
          fee_scope_space_names: isOther ? parseFeeScopeValues(item.fee_scope_space_names) : [],
          sort_order: index + 1,
        };
      })
      .filter((item) => item.name);

    const migration = migrateManagementFeeToOtherItem(normalizedItems, { ...settings, managementFeeRate: Number(body.settings?.managementFeeRate || 0) });
    normalizedItems = migration.items;
    const baseAmount = normalizedItems.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
    const materialAmount = normalizedItems.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
    const customCategoryAmount = normalizedItems.filter((item) => isDirectItemCategory(item.category) && !isBaseCategory(item.category) && !isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
    const directBaseAmount = materialAmount + customCategoryAmount;
    const quotationHouseArea = getQuotationHouseArea(db, existing);
    const feeFormulaContext = buildFeeFormulaContext(normalizedItems, settings.quoteCategories, quotationHouseArea);
    const otherTotals = calculateOtherFeeTotals(normalizedItems.filter((item) => isOtherCategory(item.category)), baseAmount, directBaseAmount, feeFormulaContext);
    let otherIndex = 0;
    normalizedItems = normalizedItems.map((item) => {
      if (!isOtherCategory(item.category)) return item;
      const totalPrice = otherTotals[otherIndex++] || 0;
      const feeMethod = normalizeFeeCalcMethod(item.fee_calc_method);
      const isFormulaBased = feeMethod === "percent" || feeMethod === "reference";
      return {
        ...item,
        quantity: isFormulaBased || feeMethod === "area_unit" ? 1 : item.quantity,
        unit_price: isFormulaBased ? totalPrice : item.unit_price,
        total_price: totalPrice,
      };
    });

    const totals = calculate(normalizedItems, settings, quotationHouseArea);
    const persistedSettings = { ...settings, discount: totals.discount };
    const existingItemCount = Number((db.prepare("SELECT COUNT(*) AS count FROM quotation_items WHERE quotation_id = ?").get(params.id) as any)?.count || 0);
    const allowEmptyItems = body.allowEmptyItems === true;
    if (existingItemCount > 0 && normalizedItems.length === 0 && !allowEmptyItems) {
      return NextResponse.json(
        { message: "本次保存的报价明细为空，系统已阻止覆盖原有报价。请刷新页面确认数据后再操作。" },
        { status: 409 },
      );
    }

    const shouldSyncCostSnapshot = String(body.status || existing.status || "").toUpperCase() === "APPROVED";
    const beforeItems = getQuotationItemsForChangeLog(db, params.id);
    const tx = (db as any).transaction(() => {
      db.prepare("DELETE FROM quotation_items WHERE quotation_id = ?").run(params.id);
      const insertItem = db.prepare(`
        INSERT INTO quotation_items (id, quotation_id, category, space, work_type_id, work_type_name, material_category_id, material_category_name, name, spec, material_model, remark, unit, quantity, unit_price, total_price, material_cost, labor_cost, profit_margin, row_color, fee_calc_method, fee_calc_base, fee_rate, fee_scope_mode, fee_scope_space_ids, fee_scope_space_names, cost_material_unit, cost_labor_unit, cost_loss_rate, cost_source, quota_source_id, quota_source_type, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      normalizedItems.forEach((item) => {
        insertItem.run(
          item.id,
          params.id,
          item.category,
          item.space || null,
          item.work_type_id,
          item.work_type_name,
          item.material_category_id,
          item.material_category_name,
          item.name,
          item.spec || null,
          item.material_model || null,
          item.remark || null,
          item.unit,
          item.quantity,
          item.unit_price,
          item.total_price,
          item.material_cost,
          item.labor_cost,
          item.profit_margin,
          item.row_color,
          item.fee_calc_method,
          item.fee_calc_base,
          item.fee_rate,
          isOtherCategory(item.category) ? normalizeFeeScopeMode(item.fee_scope_mode) : null,
          isOtherCategory(item.category) ? JSON.stringify(parseFeeScopeValues(item.fee_scope_space_ids)) : null,
          isOtherCategory(item.category) ? JSON.stringify(parseFeeScopeValues(item.fee_scope_space_names)) : null,
          Number(item.cost_material_unit || 0),
          Number(item.cost_labor_unit || 0),
          Number(item.cost_loss_rate || 0),
          item.cost_source || null,
          item.quota_source_id || null,
          item.quota_source_type || null,
          item.sort_order
        );
      });
	      db.prepare(`
	        UPDATE quotations
	        SET title = ?, quotation_type = ?, total_amount = ?, discount = ?, final_amount = ?, status = ?, notes = ?, customer_visible_note = ?, terms = ?, settings = ?, updated_at = datetime('now')
	        WHERE id = ?
	      `).run(
	        String(body.title ?? existing.title ?? "装修报价单").trim() || "装修报价单",
	        settings.quotationType || null,
	        totals.directAmount + totals.taxAmount,
        totals.discount,
        totals.finalAmount,
        body.status || existing.status || "DRAFT",
        body.notes || null,
        String(body.customer_visible_note || "").trim() || null,
        body.terms || null,
        JSON.stringify(persistedSettings),
        params.id
      );
      if (existing.project_id) {
        db.prepare("UPDATE projects SET contract_amount = ?, status = CASE WHEN status = 'LEAD' THEN 'QUOTED' ELSE status END, updated_at = datetime('now') WHERE id = ?")
          .run(totals.finalAmount, existing.project_id);
      }
    });
    tx();
    safelyRecordQuotationItemChanges({
      db,
      companyId: auth.companyId,
      quotationId: params.id,
      userId,
      action: "quotation_save",
      beforeItems,
      afterItems: getQuotationItemsForChangeLog(db, params.id),
    });
    if (shouldSyncCostSnapshot) {
      syncProjectCostSnapshotForQuotation(db, params.id);
    }
    const customerId = getQuotationCustomerId(db, params.id);
    if (customerId) {
      const nextTitle = String(body.title ?? existing.title ?? "装修报价单").trim() || "装修报价单";
      recordCustomerOperation(db, {
        userId,
        customerId,
        action: "customer.quotation.update",
        module: "预算报价",
        title: "保存报价",
        content: `${nextTitle}，报价金额：${formatAmount(totals.finalAmount)} 元，项目 ${normalizedItems.length} 项`,
        targetName: nextTitle,
        metadata: { quotationId: params.id, totalAmount: totals.finalAmount, itemCount: normalizedItems.length },
        ipAddress: getRequestIp(req),
      });
    }

    return NextResponse.json({ success: true, totals });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "保存报价失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "quotations.manage")) return NextResponse.json({ message: "没有报价管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureQuotationColumns(db);
    const existing = db.prepare("SELECT * FROM quotations WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(params.id, auth.companyId) as any;
    if (!existing) return NextResponse.json({ message: "报价不存在" }, { status: 404 });
    const userId = auth.userId;
    if (!canAccessQuotationRecord(db, existing, auth)) {
      return NextResponse.json({ message: "没有该报价的管理权限" }, { status: 403 });
    }
    if (isReadonlyQuotationRecipient(db, params.id, userId)) {
      return NextResponse.json({ message: "设计师只能查看、打印和下载报价单，不能修改报价内容" }, { status: 403 });
    }
    const blockReason = getQuotationDeleteBlockReason(db, existing);
    if (blockReason) return NextResponse.json({ message: blockReason }, { status: 400 });
    db.prepare("UPDATE quotations SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(params.id);
    const customerId = getQuotationCustomerId(db, params.id);
    if (customerId) syncCustomerProgress(db, customerId);
    if (customerId) {
      recordCustomerOperation(db, {
        userId,
        customerId,
        action: "customer.quotation.delete",
        module: "预算报价",
        title: "删除报价",
        content: existing.title || "删除报价到回收站",
        targetName: existing.title || "",
        metadata: { quotationId: params.id, status: existing.status || "" },
        ipAddress: getRequestIp(req),
      });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "删除报价失败" }, { status: 500 });
  }
}
