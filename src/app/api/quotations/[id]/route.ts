import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncCustomerProgress } from "@/lib/customerProgress";
import {
  calculateChargeableOtherFeeTotals,
  calculateOtherFeeTotals,
  getLegacyManagementFeeRate,
  normalizeFeeCalcBase,
  normalizeFeeCalcMethod,
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
  profit_margin?: number;
  row_color?: string | null;
  fee_calc_method?: string | null;
  fee_calc_base?: string | null;
  fee_rate?: number | null;
};

function ensureQuotationColumns(db: any) {
  ensureQuotationSchema(db);
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
  if (!names.has("cost_material_unit")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_material_unit REAL").run();
  if (!names.has("cost_labor_unit")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_labor_unit REAL").run();
  if (!names.has("cost_loss_rate")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_loss_rate REAL").run();
  if (!names.has("cost_source")) db.prepare("ALTER TABLE quotation_items ADD COLUMN cost_source TEXT").run();
  ensureProjectCostControlSchema(db);
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

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
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

function buildFeeFormulaContext(items: any[], categories: string[] = []): FeeFormulaContext {
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
    mainMaterialAmount,
    directItemAmount: mainMaterialAmount + customCategoryAmount,
    laborAmount,
    materialCostAmount,
    categoryAmounts,
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
        sort_order: items.length + 1,
      },
    ],
    settings: nextSettings,
    migrated: true,
  };
}

function calculate(items: any[], settings: any) {
  const baseAmount = items.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const materialAmount = items.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const customCategoryAmount = items.filter((item) => isDirectItemCategory(item.category) && !isBaseCategory(item.category) && !isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const directBaseAmount = materialAmount + customCategoryAmount;
  const otherItems = items.filter((item) => isOtherCategory(item.category));
  const feeFormulaContext = buildFeeFormulaContext(items, settings.quoteCategories);
  const otherAmount = calculateChargeableOtherFeeTotals(otherItems, baseAmount, directBaseAmount, feeFormulaContext).reduce((sum, amount) => sum + amount, 0);
  const directAmount = baseAmount + directBaseAmount + otherAmount;
  const taxRate = Number(settings.taxRate || 0);
  const discount = Number(settings.discount || 0);
  const managementFee = 0;
  const taxableAmount = Math.max(0, directAmount - discount);
  const taxAmount = Math.round(taxableAmount * taxRate) / 100;
  const finalAmount = Math.max(0, Math.round((taxableAmount + taxAmount) * 100) / 100);
  return { baseAmount, materialAmount: directBaseAmount, mainMaterialAmount: materialAmount, customCategoryAmount, otherAmount, directAmount, managementFee, taxAmount, discount, finalAmount };
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
      COALESCE(c.decoration_type, q.temp_customer_decoration_type) as customer_decoration_type,
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

  const rawItems = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, created_at ASC").all(params.id) as any[];
  const rawSettings = parseSettings(quotation.settings);
  const migration = migrateManagementFeeToOtherItem(rawItems, rawSettings);
  const items = migration.items;
  const branchSettings = getBranchSettingsForCustomer(db, quotation.customer_id);
  const settings = {
    ...migration.settings,
    signatureLabels: normalizeQuotationSignatureLabels(branchSettings.settings.printSettings.quotationSignatureLabels),
  };
  return NextResponse.json({
    ...quotation,
    branch_company_logo_url: branchSettings.settings.printSettings.quotationLogoUrl || branchSettings.settings.basicInfo.companyLogoUrl || "",
    branch_company_legal_name: branchSettings.settings.basicInfo.legalCompanyName || "",
    branch_company_short_name: branchSettings.settings.basicInfo.companyShortName || "",
    settings,
    items,
    totals: calculate(items, { ...settings, discount: quotation.discount ?? settings.discount }),
    legacyManagementFeeMigrated: migration.migrated,
    readonly: Boolean(shareClaims) || isReadonlyQuotationRecipient(db, params.id, userId),
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
    const existing = db.prepare("SELECT * FROM quotations WHERE id = ? AND company_id = ?").get(params.id, auth.companyId) as any;
    if (!existing) return NextResponse.json({ message: "报价不存在" }, { status: 404 });

    const body = await req.json();
    const action = String(body.action || "").trim();
    const userId = auth.userId;
    if (isReadonlyQuotationRecipient(db, params.id, userId)) {
      return NextResponse.json({ message: "设计师只能查看、打印和下载报价单，不能修改报价内容" }, { status: 403 });
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
      const decorationType = String(body.decoration_type || "").trim();
      const quoteNotes = String(body.quote_notes ?? body.notes ?? "").trim();
      const customerVisibleNote = String(body.customer_visible_note || "").trim();
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
        db.prepare("UPDATE quotations SET notes = ?, customer_visible_note = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
          .run(quoteNotes || null, customerVisibleNote || null, params.id, auth.companyId);
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
          SET project_id = ?, version = ?, temp_customer_name = NULL, temp_customer_designer_name = NULL, temp_customer_phone = NULL, temp_customer_weixin = NULL,
            temp_customer_address = NULL, temp_customer_house_address = NULL,
            temp_customer_address_location_name = NULL, temp_customer_address_location_address = NULL,
            temp_customer_address_latitude = NULL, temp_customer_address_longitude = NULL,
            temp_customer_building_no = NULL, temp_customer_unit_no = NULL, temp_customer_room_no = NULL,
            temp_customer_no_room_number = NULL, temp_customer_area = NULL, temp_customer_decoration_type = NULL, updated_at = datetime('now')
          WHERE id = ?
        `).run(project.id, Number(latest?.version || 0) + 1, params.id);
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

    if (action === "copy") {
      const targetCustomerId = String(body.target_customer_id || body.customer_id || "").trim();
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
      const nextQuotationId = makeId("QUO");
      const sourceItems = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, created_at ASC").all(params.id) as any[];
      const nextTitle = copyToOtherCustomer && targetCustomer
        ? `${buildDefaultQuotationTitle(targetCustomer)} 副本`
        : `${existing.title || "装修报价单"} 副本`;

      const tx = (db as any).transaction(() => {
        db.prepare(`
          INSERT INTO quotations (
            id, project_id, company_id, title, version, total_amount, discount, final_amount, status, notes, customer_visible_note, terms, settings,
            temp_customer_name, temp_customer_designer_name, temp_customer_phone, temp_customer_weixin, temp_customer_address, temp_customer_area, temp_customer_decoration_type,
            created_by_id, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          nextQuotationId,
          targetProjectId,
          existing.company_id,
          nextTitle,
          Number(latest?.version || 0) + 1,
          Number(existing.total_amount || 0),
          Number(existing.discount || 0),
          Number(existing.final_amount ?? 0),
          existing.notes || null,
          existing.customer_visible_note || null,
          existing.terms || null,
          existing.settings || "{}",
          targetCustomerId ? null : existing.temp_customer_name || null,
          targetCustomerId ? null : existing.temp_customer_designer_name || null,
          targetCustomerId ? null : existing.temp_customer_phone || null,
          targetCustomerId ? null : existing.temp_customer_weixin || null,
          targetCustomerId ? null : existing.temp_customer_address || null,
          targetCustomerId ? null : existing.temp_customer_area || null,
          targetCustomerId ? null : existing.temp_customer_decoration_type || null,
          existing.created_by_id
        );

        const insertItem = db.prepare(`
          INSERT INTO quotation_items (id, quotation_id, category, space, work_type_id, work_type_name, material_category_id, material_category_name, name, spec, material_model, remark, unit, quantity, unit_price, total_price, material_cost, labor_cost, profit_margin, row_color, fee_calc_method, fee_calc_base, fee_rate, cost_material_unit, cost_labor_unit, cost_loss_rate, cost_source, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        sourceItems.forEach((item) => {
          insertItem.run(
            makeId("QITEM"),
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
            item.quantity || 0,
            item.unit_price || 0,
            item.total_price || 0,
            item.material_cost || 0,
            item.labor_cost || 0,
            item.profit_margin || 0,
            item.row_color,
            item.fee_calc_method,
            item.fee_calc_base,
            item.fee_rate,
            item.cost_material_unit || 0,
            item.cost_labor_unit || 0,
            item.cost_loss_rate || 0,
            item.cost_source || null,
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
            ? `从「${existing.title || "装修报价单"}」复制生成新报价，并归档到客户「${targetCustomer.name || "未命名客户"}」`
            : `从「${existing.title || "装修报价单"}」复制生成新报价`,
          targetName: nextTitle,
          metadata: { sourceQuotationId: params.id, quotationId: nextQuotationId, targetCustomerId: targetCustomerId || null },
          ipAddress: getRequestIp(req),
        });
      }
      return NextResponse.json({ id: nextQuotationId });
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
      db.prepare("UPDATE quotations SET notes = ?, updated_at = datetime('now') WHERE id = ?").run(String(body.notes || "").trim() || null, params.id);
      const customerId = getQuotationCustomerId(db, params.id);
      if (customerId) {
        recordCustomerOperation(db, {
          userId,
          customerId,
          action: "customer.quotation.notes_update",
          module: "预算报价",
          title: "更新报价备注",
          content: existing.title || "更新报价备注",
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
    const existing = db.prepare("SELECT * FROM quotations WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(params.id, auth.companyId) as any;
    if (!existing) return NextResponse.json({ message: "报价不存在" }, { status: 404 });
    const userId = auth.userId;
    if (isReadonlyQuotationRecipient(db, params.id, userId)) {
      return NextResponse.json({ message: "设计师只能查看、打印和下载报价单，不能修改报价内容" }, { status: 403 });
    }

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
	      excludeSpecificDiscountAmount: Math.max(0, Number(body.settings?.excludeSpecificDiscountAmount || 0)),
	      excludeSpecialDiscountItems: body.settings?.excludeSpecialDiscountItems === true,
	      excludeLaborOnlyDiscountItems: body.settings?.excludeLaborOnlyDiscountItems === true,
	      warrantyMonths: Number(body.settings?.warrantyMonths || 24),
      appendixNote: String(body.settings?.appendixNote ?? existingSettings.appendixNote ?? "").trim(),
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
        const feeCalcBase = isOther && feeMethod !== "fixed" ? (normalizeFeeCalcBase(item.fee_calc_base) || "直接费") : "";
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
          quantity: isOther && (feeMethod === "percent" || feeMethod === "reference") ? 1 : quantity,
          unit_price: unitPrice,
          total_price: totalPrice,
          material_cost: finalMaterialCost,
          labor_cost: finalLaborCost,
          cost_material_unit: costMaterialUnit,
          cost_labor_unit: costLaborUnit,
          cost_loss_rate: costLossRate,
          cost_source: String(item.cost_source || "").trim() || null,
          profit_margin: profitMargin,
          row_color: normalizeRowColor(item.row_color),
          fee_calc_method: isOther ? feeMethod : null,
          fee_calc_base: isOther ? feeCalcBase : null,
          fee_rate: isOther ? feeRate : null,
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
    const feeFormulaContext = buildFeeFormulaContext(normalizedItems, settings.quoteCategories);
    const otherTotals = calculateOtherFeeTotals(normalizedItems.filter((item) => isOtherCategory(item.category)), baseAmount, directBaseAmount, feeFormulaContext);
    let otherIndex = 0;
    normalizedItems = normalizedItems.map((item) => {
      if (!isOtherCategory(item.category)) return item;
      const totalPrice = otherTotals[otherIndex++] || 0;
      const feeMethod = normalizeFeeCalcMethod(item.fee_calc_method);
      const isFormulaBased = feeMethod === "percent" || feeMethod === "reference";
      return {
        ...item,
        quantity: isFormulaBased ? 1 : item.quantity,
        unit_price: isFormulaBased ? totalPrice : item.unit_price,
        total_price: totalPrice,
      };
    });

    const totals = calculate(normalizedItems, settings);
    const existingItemCount = Number((db.prepare("SELECT COUNT(*) AS count FROM quotation_items WHERE quotation_id = ?").get(params.id) as any)?.count || 0);
    const allowEmptyItems = body.allowEmptyItems === true;
    if (existingItemCount > 0 && normalizedItems.length === 0 && !allowEmptyItems) {
      return NextResponse.json(
        { message: "本次保存的报价明细为空，系统已阻止覆盖原有报价。请刷新页面确认数据后再操作。" },
        { status: 409 },
      );
    }

    const shouldSyncCostSnapshot = String(body.status || existing.status || "").toUpperCase() === "APPROVED";
    const tx = (db as any).transaction(() => {
      db.prepare("DELETE FROM quotation_items WHERE quotation_id = ?").run(params.id);
      const insertItem = db.prepare(`
        INSERT INTO quotation_items (id, quotation_id, category, space, work_type_id, work_type_name, material_category_id, material_category_name, name, spec, material_model, remark, unit, quantity, unit_price, total_price, material_cost, labor_cost, profit_margin, row_color, fee_calc_method, fee_calc_base, fee_rate, cost_material_unit, cost_labor_unit, cost_loss_rate, cost_source, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
          Number(item.cost_material_unit || 0),
          Number(item.cost_labor_unit || 0),
          Number(item.cost_loss_rate || 0),
          item.cost_source || null,
          item.sort_order
        );
      });
      db.prepare(`
        UPDATE quotations
        SET title = ?, total_amount = ?, discount = ?, final_amount = ?, status = ?, notes = ?, customer_visible_note = ?, terms = ?, settings = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        String(body.title ?? existing.title ?? "装修报价单").trim() || "装修报价单",
        totals.directAmount + totals.taxAmount,
        settings.discount,
        totals.finalAmount,
        body.status || existing.status || "DRAFT",
        body.notes || null,
        String(body.customer_visible_note || "").trim() || null,
        body.terms || null,
        JSON.stringify(settings),
        params.id
      );
      if (existing.project_id) {
        db.prepare("UPDATE projects SET contract_amount = ?, status = CASE WHEN status = 'LEAD' THEN 'QUOTED' ELSE status END, updated_at = datetime('now') WHERE id = ?")
          .run(totals.finalAmount, existing.project_id);
      }
    });
    tx();
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
    const existing = db.prepare("SELECT id, title, status FROM quotations WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(params.id, auth.companyId) as any;
    if (!existing) return NextResponse.json({ message: "报价不存在" }, { status: 404 });
    const userId = auth.userId;
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
