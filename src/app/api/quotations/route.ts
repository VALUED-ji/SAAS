import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncCustomerProgress } from "@/lib/customerProgress";
import { getQuotationPrintSettingsForCustomer } from "@/lib/branchSettingsLookup";
import { normalizeQuotationSignatureLabels } from "@/lib/quotationPrintSettings";
import { getRequestIp, recordCustomerOperation } from "@/lib/operationLog";
import {
  calculateChargeableOtherFeeTotals,
  calculateOtherFeeTotals,
  normalizeFeeCalcBase,
  normalizeFeeCalcMethod,
  toMoney,
  type FeeFormulaContext,
} from "@/lib/quotationFeeFormulas";
import { calculatePackageQuotePrice, formatPricingAmount, toPricingAmount } from "@/lib/quotaTemplatePricing";
import { getAuthContext, hasPermission } from "@/lib/security/authorization";
import { ensureQuotationSchema } from "@/lib/quotationSchema";
import { ensureProjectCostControlSchema } from "@/lib/projectCostControl";
import { ensureQuotationChangeLogSchema, getLatestQuotationChangeSummary } from "@/lib/quotationChangeLogs";

function ensureQuotationColumns(db: any) {
  ensureQuotationSchema(db);
}

function ensureCustomerManualDesignerColumn(db: any) {
  const columns = db.prepare("PRAGMA table_info(customers)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "designer_name_manual")) {
    db.prepare("ALTER TABLE customers ADD COLUMN designer_name_manual TEXT").run();
  }
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
    CREATE INDEX IF NOT EXISTS idx_quotation_receipt_todos_quotation ON quotation_receipt_todos(quotation_id, designer_id, status);
  `);
}

function tableExists(db: any, tableName: string) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(tableName) as any;
  return Boolean(row?.name);
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function formatAmount(value: number) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function buildDefaultQuotationTitle(customer: any) {
  const houseText = String(customer?.address || customer?.area || customer?.house_address || "").trim();
  return houseText ? `${houseText}装修报价单` : "装修报价单";
}

function buildDefaultProjectName(customer: any) {
  return String(customer?.address || customer?.area || customer?.name || "工地").trim();
}

function buildDefaultTemporaryQuotationTitle(tempCustomer: any) {
  const houseText = String(tempCustomer?.address || "").trim();
  return houseText ? `${houseText}装修报价单` : "临时报价单";
}

function normalizeTemporaryCustomer(body: any) {
  const input = body?.temp_customer && typeof body.temp_customer === "object" ? body.temp_customer : body;
  return {
    name: String(input?.name || input?.temp_customer_name || "").trim(),
    phone: String(input?.phone || input?.temp_customer_phone || "").trim(),
    weixin: String(input?.weixin || input?.temp_customer_weixin || "").trim(),
    address: String(input?.address || input?.temp_customer_address || "").trim(),
    area: safeNonNegativeNumber(input?.area ?? input?.temp_customer_area),
    decorationType: String(input?.decoration_type || input?.temp_customer_decoration_type || "").trim(),
  };
}

function normalizeCustomerSnapshot(body: any) {
  const input = body?.customer_snapshot && typeof body.customer_snapshot === "object" ? body.customer_snapshot : {};
  const noRoomNumber = input.no_room_number === true || input.no_room_number === 1 || input.no_room_number === "1";
  return {
    phone: String(input.phone || "").trim(),
    address: String(input.address || "").trim(),
    addressLocationName: String(input.address_location_name || "").trim(),
    addressLocationAddress: String(input.address_location_address || "").trim(),
    addressLatitude: toNullableCoordinate(input.address_latitude, -90, 90),
    addressLongitude: toNullableCoordinate(input.address_longitude, -180, 180),
    buildingNo: noRoomNumber ? "" : String(input.building_no || "").trim(),
    unitNo: noRoomNumber ? "" : String(input.unit_no || "").trim(),
    roomNo: noRoomNumber ? "" : String(input.room_no || "").trim(),
    noRoomNumber,
    areaSize: safeNonNegativeNumber(input.area_size),
    decorationType: String(input.decoration_type || "").trim(),
  };
}

function safeNonNegativeNumber(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? Math.max(0, next) : 0;
}

function toNullableCoordinate(value: unknown, min: number, max: number) {
  if (value === undefined || value === null || value === "") return null;
  const next = Number(value);
  if (!Number.isFinite(next) || next < min || next > max) return null;
  return next;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
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
  if (!name || isBaseCategory(name) || isOtherCategory(name)) return false;
  if (isCustomCabinetCategory(name)) return false;
  return true;
}

function isCustomCabinetCategory(category: unknown) {
  const name = normalizeCategoryName(category);
  return name === "custom_cabinet" || name === "定制柜" || name === "定制柜项目";
}

function isDirectItemCategory(category: unknown) {
  return !isOtherCategory(category);
}

function orderQuoteCategories(categories: string[]) {
  const builtInDirectCategories = ["base", "main_material", "custom_cabinet"];
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

function normalizeQuotaScope(value: unknown) {
  const scope = String(value || "").trim();
  return scope || "foundation";
}

function getTemplateProjectGroupMap(template: any) {
  const map = new Map<string, string>();
  map.set("foundation", "基装项目");
  map.set("main_material", "产品项目");
  map.set("custom_cabinet", "定制柜项目");
  if (template && typeof template === "object" && Array.isArray(template.projectGroups)) {
    template.projectGroups.forEach((group: any) => {
      const id = String(group?.id || "").trim();
      const name = String(group?.name || "").trim();
      if (id && name) map.set(id, name);
    });
  }
  return map;
}

function getTemplateQuoteCategory(scope: string, groupMap: Map<string, string>) {
  if (scope === "foundation") return "base";
  if (scope === "main_material") return "main_material";
  const groupName = groupMap.get(scope) || scope;
  return groupName || "base";
}

function getBaseOrMaterialItemTotal(item: any) {
  if (isCustomCabinetCategory(item.category)) {
    const area = getCustomCabinetArea(item);
    const quantity = safeNonNegativeNumber(item.quantity);
    const unitPrice = safeNonNegativeNumber(item.unit_price);
    return toMoney(quantity * (area > 0 ? area : 1) * unitPrice);
  }
  const fallback = safeNonNegativeNumber(item.quantity) * safeNonNegativeNumber(item.unit_price);
  return toMoney(Number(item.total_price ?? fallback) || 0);
}

function getCustomCabinetArea(item: any) {
  return toMoney(safeNonNegativeNumber(item.material_cost) * safeNonNegativeNumber(item.labor_cost) / 1000000);
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
  const taxableAmount = Math.max(0, directAmount - discount);
  const taxAmount = Math.round(taxableAmount * taxRate) / 100;
  const finalAmount = Math.max(0, Math.round((taxableAmount + taxAmount) * 100) / 100);
  return { baseAmount, materialAmount: directBaseAmount, otherAmount, directAmount, taxAmount, discount, finalAmount };
}

function parseQuotationSettings(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed as Record<string, any> : {};
  } catch {
    return {};
  }
}

function calculateQuotationRecordCostSummary(items: any[], settingsValue: unknown) {
  const settings = parseQuotationSettings(settingsValue);
  const quoteCategories = Array.isArray(settings.quoteCategories)
    ? settings.quoteCategories.map((category: unknown) => String(category || "").trim()).filter(Boolean)
    : [];
  const baseAmount = items.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const mainMaterialAmount = items.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const customDirectAmount = items.filter((item) => isDirectItemCategory(item.category) && !isBaseCategory(item.category) && !isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const directBaseAmount = mainMaterialAmount + customDirectAmount;
  const otherItems = items.filter((item) => isOtherCategory(item.category));
  const feeFormulaContext = buildFeeFormulaContext(items, quoteCategories);
  const otherAmount = calculateChargeableOtherFeeTotals(otherItems, baseAmount, directBaseAmount, feeFormulaContext).reduce((sum, amount) => sum + amount, 0);
  return {
    base_amount: toMoney(baseAmount),
    main_material_amount: toMoney(mainMaterialAmount),
    custom_direct_amount: toMoney(customDirectAmount),
    other_amount: toMoney(otherAmount),
    direct_amount: toMoney(baseAmount + directBaseAmount),
  };
}

function getTemplateSpaceNames(template: any) {
  if (!template || typeof template !== "object" || !Array.isArray(template.spaces)) return [] as string[];
  return uniqueValues(template.spaces.map((space: any, index: number) => String(space?.name || `空间${index + 1}`).trim()));
}

function buildTemplateQuotationItems(template: any) {
  if (!template || typeof template !== "object") return [] as any[];
  const rows: any[] = [];
  let sortOrder = 1;
  const projectGroupMap = getTemplateProjectGroupMap(template);

  if (Array.isArray(template.spaces)) {
    template.spaces.forEach((space: any, spaceIndex: number) => {
      const spaceName = String(space?.name || `空间${spaceIndex + 1}`).trim();
      if (!spaceName || !Array.isArray(space?.quotaItems)) return;
      space.quotaItems.forEach((quota: any) => {
        const name = String(quota?.name || "").trim();
        if (!name) return;
        const scope = normalizeQuotaScope(quota?.quoteScope);
        const category = getTemplateQuoteCategory(scope, projectGroupMap);
        const laborPrice = safeNonNegativeNumber(quota?.laborPrice);
        const materialPrice = safeNonNegativeNumber(quota?.materialPrice);
        const totalPrice = safeNonNegativeNumber(quota?.totalPrice ?? (laborPrice + materialPrice));
        const unitPrice = totalPrice || laborPrice + materialPrice;
        const isBase = isBaseCategory(category);
        const constructionDescription = String(quota?.constructionDescription || "").trim();
        rows.push({
          category,
          space: spaceName,
          name,
          spec: isBase ? constructionDescription : "",
          material_model: "",
          remark: isBase ? "" : constructionDescription,
          unit: String(quota?.unit || "").trim(),
          quantity: 0,
          unit_price: toMoney(isBase ? (materialPrice || laborPrice ? materialPrice + laborPrice : unitPrice) : unitPrice),
          total_price: 0,
          material_cost: isBase ? materialPrice : 0,
          labor_cost: isBase ? (laborPrice || (!materialPrice ? unitPrice : 0)) : 0,
          profit_margin: 0,
          row_color: null,
          fee_calc_method: null,
          fee_calc_base: null,
          fee_rate: null,
          sort_order: sortOrder++,
        });
      });
    });
  }

  if (Array.isArray(template.comprehensiveFees)) {
    template.comprehensiveFees.forEach((fee: any) => {
      const name = String(fee?.name || "").trim();
      if (!name) return;
      const method = normalizeFeeCalcMethod(fee?.fee_calc_method);
      const fixedAmount = safeNonNegativeNumber(fee?.unit_price);
      rows.push({
        category: "other",
        space: null,
        name,
        spec: String(fee?.remark || "").trim(),
        material_model: "",
        remark: String(fee?.remark || "").trim(),
        unit: "项",
        quantity: 1,
        unit_price: method === "percent" || method === "reference" ? 0 : fixedAmount,
        total_price: method === "percent" || method === "reference" ? 0 : fixedAmount,
        material_cost: 0,
        labor_cost: 0,
        profit_margin: 0,
        row_color: null,
        fee_calc_method: method,
        fee_calc_base: method === "fixed" ? null : normalizeFeeCalcBase(fee?.fee_calc_base) || "直接费",
        fee_rate: method === "percent" ? safeNonNegativeNumber(fee?.fee_rate) : null,
        sort_order: sortOrder++,
      });
    });
  }

  return rows;
}

function isPackageQuoteTemplate(template: any) {
  return String(template?.quoteConfig?.mode || "").trim() === "package";
}

function getTemplatePricingArea(body: any, project: any, customer: any) {
  const candidates = [
    body?.templatePricing?.area,
    body?.pricingArea,
    project?.area,
    customer?.area_size,
  ];
  for (const candidate of candidates) {
    const amount = toPricingAmount(candidate);
    if (amount > 0) return amount;
  }
  return 0;
}

function buildPackagePricingQuotationItem(template: any, area: number, sortOrder: number) {
  if (!isPackageQuoteTemplate(template) || area <= 0) return null;
  const result = calculatePackageQuotePrice(template.quoteConfig, area);
  if (result.totalAmount <= 0) return null;
  const segmentText = result.segments.length > 0
    ? `；超出计算：${result.segments.map((segment) => `${formatPricingAmount(segment.startArea, 0)}-${formatPricingAmount(segment.endArea, 0)}㎡×${formatPricingAmount(segment.unitPrice)}元/㎡`).join("，")}`
    : "";
  const remark = `计价面积${formatPricingAmount(result.area)}㎡，套餐面积${formatPricingAmount(result.includedArea)}㎡以内，套餐价${formatPricingAmount(result.packageAmount)}元，超出${formatPricingAmount(result.extraArea)}㎡，超出加价${formatPricingAmount(result.extraAmount)}元${segmentText}`;
  return {
    category: "一口价",
    space: null,
    name: "一口价套餐报价",
    spec: "",
    material_model: "",
    remark,
    unit: "项",
    quantity: 1,
    unit_price: result.totalAmount,
    total_price: result.totalAmount,
    material_cost: 0,
    labor_cost: 0,
    profit_margin: 0,
    row_color: null,
    fee_calc_method: null,
    fee_calc_base: null,
    fee_rate: null,
    sort_order: sortOrder,
    pricingResult: result,
  };
}

function applyOtherFeeTotals(items: any[], settings: any) {
  const baseAmount = items.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const materialAmount = items.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const customCategoryAmount = items.filter((item) => isDirectItemCategory(item.category) && !isBaseCategory(item.category) && !isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const directBaseAmount = materialAmount + customCategoryAmount;
  const feeFormulaContext = buildFeeFormulaContext(items, settings.quoteCategories);
  const otherTotals = calculateOtherFeeTotals(items.filter((item) => isOtherCategory(item.category)), baseAmount, directBaseAmount, feeFormulaContext);
  let otherIndex = 0;
  return items.map((item) => {
    if (!isOtherCategory(item.category)) return item;
    const feeTotal = otherTotals[otherIndex++] || 0;
    const method = normalizeFeeCalcMethod(item.fee_calc_method);
    const isFormulaBased = method === "percent" || method === "reference";
    return {
      ...item,
      quantity: isFormulaBased ? 1 : item.quantity,
      unit_price: isFormulaBased ? feeTotal : item.unit_price,
      total_price: feeTotal,
    };
  });
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "quotations.manage")) return NextResponse.json({ message: "没有报价查看权限" }, { status: 403 });
  const db = getDb();
  ensureQuotationColumns(db);
  ensureCustomerManualDesignerColumn(db);
  ensureQuotationReceiptTodoTable(db);
  ensureQuotationChangeLogSchema(db);
  const url = new URL(req.url);
  const deletedOnly = url.searchParams.get("deleted") === "1";
  const customerId = String(url.searchParams.get("customer_id") || url.searchParams.get("customerId") || "").trim();
  const summaryOnly = url.searchParams.get("summary") === "1";
  const list = db.prepare(`
    SELECT q.*, p.name as project_name, p.address as project_address, p.area as project_area, p.contract_amount,
      CASE WHEN q.project_id IS NULL THEN 1 ELSE 0 END as is_unbound,
      c.id as customer_id,
      COALESCE(c.name, q.temp_customer_name) as customer_name,
      COALESCE(c.phone, q.temp_customer_phone) as customer_phone,
      COALESCE(c.weixin, q.temp_customer_weixin) as customer_weixin,
      COALESCE(c.address, q.temp_customer_address) as customer_address,
      c.house_address as customer_house_address,
      c.address_location_name as customer_address_location_name,
      c.address_location_address as customer_address_location_address,
      c.address_latitude as customer_address_latitude,
      c.address_longitude as customer_address_longitude,
      c.building_no as customer_building_no, c.unit_no as customer_unit_no,
      c.room_no as customer_room_no, c.no_room_number as customer_no_room_number,
      COALESCE(c.decoration_type, q.temp_customer_decoration_type) as customer_decoration_type,
      COALESCE(c.area_size, q.temp_customer_area) as customer_area_size
    FROM quotations q
    LEFT JOIN projects p ON q.project_id = p.id
    LEFT JOIN customers c ON p.customer_id = c.id
    WHERE q.company_id = ? AND ${deletedOnly ? "q.deleted_at IS NOT NULL" : "q.deleted_at IS NULL"}
      ${customerId ? "AND p.customer_id = ?" : ""}
    ORDER BY ${deletedOnly ? "q.deleted_at DESC," : ""} q.updated_at DESC, q.created_at DESC
  `).all(...(customerId ? [auth.companyId, customerId] : [auth.companyId])) as any[];
  const quotationIds = list.map((quotation) => String(quotation.id || "")).filter(Boolean);
  if (quotationIds.length === 0) return NextResponse.json(list);

  const placeholders = quotationIds.map(() => "?").join(",");
	  const quotationItems = db.prepare(`
    SELECT quotation_id, category, quantity, unit_price, total_price, material_cost, labor_cost, fee_calc_method, fee_calc_base, fee_rate
    FROM quotation_items
    WHERE quotation_id IN (${placeholders})
    ORDER BY quotation_id, sort_order ASC, created_at ASC
  `).all(...quotationIds) as any[];
  const itemsByQuotation = new Map<string, any[]>();
  quotationItems.forEach((item) => {
    const quotationId = String(item.quotation_id || "");
    if (!itemsByQuotation.has(quotationId)) itemsByQuotation.set(quotationId, []);
    itemsByQuotation.get(quotationId)?.push(item);
  });

  const customerIds = uniqueValues(list.map((quotation) => String(quotation.customer_id || "")));
  const designerByCustomer = new Map<string, string>();
  const signedByCustomer = new Map<string, { count: number; amount: number }>();
  const quotationCreatedCustomerIds = new Set<string>();
  if (customerIds.length > 0) {
    const customerPlaceholders = customerIds.map(() => "?").join(",");
    const designerRows = db.prepare(`
      SELECT designer_team.customer_id, designer.name as designer_name
      FROM customer_team designer_team
      LEFT JOIN users designer ON designer.id = designer_team.user_id
      WHERE designer_team.customer_id IN (${customerPlaceholders})
        AND UPPER(designer_team.role) = 'DESIGNER'
      ORDER BY designer_team.customer_id ASC, datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
    `).all(...customerIds) as any[];
    designerRows.forEach((row) => {
      const customerId = String(row.customer_id || "");
      if (customerId && !designerByCustomer.has(customerId)) designerByCustomer.set(customerId, String(row.designer_name || ""));
    });
    const manualDesignerRows = db.prepare(`
      SELECT id as customer_id, designer_name_manual
      FROM customers
      WHERE id IN (${customerPlaceholders})
        AND company_id = ?
        AND TRIM(COALESCE(designer_name_manual, '')) != ''
    `).all(...customerIds, auth.companyId) as any[];
    manualDesignerRows.forEach((row) => {
      const customerId = String(row.customer_id || "");
      if (customerId && !designerByCustomer.has(customerId)) designerByCustomer.set(customerId, String(row.designer_name_manual || ""));
    });

    const signedRows = db.prepare(`
      SELECT cp.customer_id, COUNT(*) as signed_contract_count, COALESCE(SUM(ct.total_amount), 0) as signed_contract_amount
      FROM contracts ct
      LEFT JOIN projects cp ON cp.id = ct.project_id
      WHERE cp.customer_id IN (${customerPlaceholders})
        AND ct.deleted_at IS NULL
        AND UPPER(COALESCE(ct.status, '')) = 'SIGNED'
      GROUP BY cp.customer_id
    `).all(...customerIds) as any[];
    signedRows.forEach((row) => {
      signedByCustomer.set(String(row.customer_id || ""), {
        count: Number(row.signed_contract_count || 0),
        amount: Number(row.signed_contract_amount || 0),
      });
    });
    const quotationCreatedRows = db.prepare(`
      SELECT DISTINCT entity_id as customer_id
      FROM operation_logs
      WHERE entity = 'customer'
        AND action = 'customer.create.from_quotation'
        AND entity_id IN (${customerPlaceholders})
    `).all(...customerIds) as any[];
    quotationCreatedRows.forEach((row) => {
      const customerId = String(row.customer_id || "").trim();
      if (customerId) quotationCreatedCustomerIds.add(customerId);
    });
  }

  const receiptRows = db.prepare(`
    SELECT quotation_id, COUNT(*) as count
    FROM quotation_receipt_todos
    WHERE quotation_id IN (${placeholders})
      AND deleted_at IS NULL
      AND status = 'pending'
    GROUP BY quotation_id
  `).all(...quotationIds) as any[];
  const receiptCountByQuotation = new Map(receiptRows.map((row: any) => [String(row.quotation_id || ""), Number(row.count || 0)]));
  const latestChangeByQuotation = getLatestQuotationChangeSummary(db, quotationIds);
  const settingsByQuotation = new Map<string, Record<string, any>>();
  list.forEach((quotation) => {
    settingsByQuotation.set(String(quotation.id || ""), parseQuotationSettings(quotation.settings));
  });
  const templateIds = uniqueValues(
    Array.from(settingsByQuotation.values()).map((settings) => String(settings.quotaTemplateId || "").trim()).filter(Boolean),
  );
  const templateNameById = new Map<string, string>();
  if (templateIds.length > 0 && tableExists(db, "quota_templates")) {
    const templatePlaceholders = templateIds.map(() => "?").join(",");
    const templateRows = db.prepare(`
      SELECT template_id, name
      FROM quota_templates
      WHERE company_id = ?
        AND template_id IN (${templatePlaceholders})
        AND deleted_at IS NULL
    `).all(auth.companyId, ...templateIds) as any[];
    templateRows.forEach((row) => {
      const templateId = String(row.template_id || "").trim();
      const templateName = String(row.name || "").trim();
      if (templateId && templateName) templateNameById.set(templateId, templateName);
    });
  }

  const signedQuotationCountById = new Map<string, number>();
  if (!summaryOnly) {
    const signedContracts = db.prepare(`
      SELECT content
      FROM contracts
      WHERE company_id = ?
        AND deleted_at IS NULL
        AND UPPER(COALESCE(status, '')) IN ('SIGNED', 'RESIGNED')
        AND COALESCE(content, '') <> ''
    `).all(auth.companyId) as any[];
    const quotationIdSet = new Set(quotationIds);
    signedContracts.forEach((contract) => {
      try {
        const content = JSON.parse(String(contract.content || "{}"));
        const quotationId = String(content?.quotation_id || content?.amount_info?.quotation_id || "").trim();
        if (quotationIdSet.has(quotationId)) signedQuotationCountById.set(quotationId, Number(signedQuotationCountById.get(quotationId) || 0) + 1);
      } catch {
        // Ignore legacy malformed contract content while building list badges.
      }
    });
  }

  const normalizedList = list.map((quotation) => {
    const settings = settingsByQuotation.get(String(quotation.id || "")) || {};
    const quotaTemplateId = String(settings.quotaTemplateId || "").trim();
    const quotaTemplateName = String(settings.quotaTemplateName || templateNameById.get(quotaTemplateId) || "").trim();
    return {
      ...quotation,
      quota_template_id: quotaTemplateId,
      quota_template_name: quotaTemplateName,
      designer_name: designerByCustomer.get(String(quotation.customer_id || "")) || "",
      customer_created_from_quotation: quotationCreatedCustomerIds.has(String(quotation.customer_id || "")) ? 1 : 0,
      signed_contract_count: signedByCustomer.get(String(quotation.customer_id || ""))?.count || 0,
      signed_contract_amount: signedByCustomer.get(String(quotation.customer_id || ""))?.amount || 0,
      signed_quotation_contract_count: signedQuotationCountById.get(String(quotation.id || "")) || 0,
      quotation_receipt_todo_count: receiptCountByQuotation.get(String(quotation.id || "")) || 0,
      latest_change_at: latestChangeByQuotation.get(String(quotation.id || ""))?.created_at || null,
      latest_change_user_name: latestChangeByQuotation.get(String(quotation.id || ""))?.user_name || null,
      latest_change_summary: latestChangeByQuotation.get(String(quotation.id || ""))?.summary || null,
      latest_change_count: latestChangeByQuotation.get(String(quotation.id || ""))?.change_count || 0,
      item_count: itemsByQuotation.get(String(quotation.id || ""))?.length || 0,
      ...calculateQuotationRecordCostSummary(itemsByQuotation.get(String(quotation.id || "")) || [], quotation.settings),
    };
  });
  return NextResponse.json(normalizedList);
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "quotations.manage")) return NextResponse.json({ message: "没有报价管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureQuotationColumns(db);
    ensureQuotationItemColumns(db);
    const userId = auth.userId;
    const companyId = auth.companyId;

    const body = await req.json();
    const customerId = String(body.customer_id || "").trim();
    const projectIdInput = String(body.project_id || "").trim();
    const inputTitle = String(body.title || "").trim();
    const createMode = String(body.create_mode || body.mode || "").trim();
    const temporaryCustomer = normalizeTemporaryCustomer(body);
    const hasCustomerSnapshot = Boolean(customerId && body?.customer_snapshot && typeof body.customer_snapshot === "object");
    const customerSnapshot = normalizeCustomerSnapshot(body);
    const isTemporaryQuotation = !customerId && !projectIdInput && (createMode === "temporary" || Boolean(temporaryCustomer.address));
    if (!customerId && !projectIdInput && !isTemporaryQuotation) return NextResponse.json({ message: "请选择客户或填写临时客户信息" }, { status: 400 });
    if (isTemporaryQuotation && !temporaryCustomer.address) return NextResponse.json({ message: "请填写小区/地址" }, { status: 400 });

    let project = projectIdInput
      ? db.prepare("SELECT * FROM projects WHERE id = ? AND company_id = ? AND deleted_at IS NULL").get(projectIdInput, companyId) as any
      : null;
    const customer = customerId
      ? db.prepare("SELECT * FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL").get(customerId, companyId) as any
      : project
        ? db.prepare("SELECT * FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL").get(project.customer_id, companyId) as any
        : null;
    if (!isTemporaryQuotation && !customer) return NextResponse.json({ message: "客户不存在" }, { status: 404 });
    const effectiveCustomer = customer && hasCustomerSnapshot
      ? {
        ...customer,
        phone: customerSnapshot.phone || customer.phone,
        address: customerSnapshot.address || customer.address,
        address_location_name: customerSnapshot.addressLocationName || customerSnapshot.address || customer.address_location_name,
        address_location_address: customerSnapshot.addressLocationAddress || customerSnapshot.address || customer.house_address || customer.address_location_address,
        address_latitude: customerSnapshot.addressLatitude,
        address_longitude: customerSnapshot.addressLongitude,
        building_no: customerSnapshot.noRoomNumber ? null : customerSnapshot.buildingNo || null,
        unit_no: customerSnapshot.noRoomNumber ? null : customerSnapshot.unitNo || null,
        room_no: customerSnapshot.noRoomNumber ? null : customerSnapshot.roomNo || null,
        no_room_number: customerSnapshot.noRoomNumber ? 1 : 0,
        area_size: customerSnapshot.areaSize > 0 ? customerSnapshot.areaSize : customer.area_size,
        decoration_type: customerSnapshot.decorationType || null,
      }
      : customer;
    const title = inputTitle || (isTemporaryQuotation ? buildDefaultTemporaryQuotationTitle(temporaryCustomer) : buildDefaultQuotationTitle(effectiveCustomer));

    if (customer && hasCustomerSnapshot) {
      db.prepare(`
        UPDATE customers
        SET phone = ?, address = ?, address_location_name = ?, address_location_address = ?, address_latitude = ?, address_longitude = ?,
          building_no = ?, unit_no = ?, room_no = ?, no_room_number = ?, area_size = ?, decoration_type = ?, updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(
        effectiveCustomer.phone || customer.phone || "",
        effectiveCustomer.address || null,
        effectiveCustomer.address_location_name || effectiveCustomer.address || null,
        effectiveCustomer.address_location_address || effectiveCustomer.address || null,
        effectiveCustomer.address_latitude,
        effectiveCustomer.address_longitude,
        effectiveCustomer.building_no || null,
        effectiveCustomer.unit_no || null,
        effectiveCustomer.room_no || null,
        effectiveCustomer.no_room_number ? 1 : 0,
        effectiveCustomer.area_size || null,
        effectiveCustomer.decoration_type || null,
        customer.id,
        companyId,
      );
    }

    if (!project && effectiveCustomer) {
      const manager = db.prepare("SELECT user_id FROM customer_team WHERE customer_id = ? AND role = 'designer' ORDER BY assigned_at DESC LIMIT 1").get(customer.id) as any;
      const projectId = makeId("PROJ");
      db.prepare(`
        INSERT INTO projects (id, company_id, customer_id, manager_id, name, address, area, status, budget_amount, contract_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'QUOTED', ?, 0, datetime('now'), datetime('now'))
      `).run(
        projectId,
        companyId,
        effectiveCustomer.id,
        manager?.user_id || userId,
        buildDefaultProjectName(effectiveCustomer),
        effectiveCustomer.address || effectiveCustomer.area || null,
        effectiveCustomer.area_size || null,
        effectiveCustomer.budget || 0
      );
      project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
    }

    const latest = project
      ? db.prepare("SELECT COALESCE(MAX(version), 0) as version FROM quotations WHERE project_id = ? AND deleted_at IS NULL").get(project.id) as any
      : { version: 0 };
    const quotationId = makeId("QUO");
    const branchPrintSettings = getQuotationPrintSettingsForCustomer(db, effectiveCustomer?.id);
    const templateItems = buildTemplateQuotationItems(body.template);
    const templatePricingArea = getTemplatePricingArea(body, project, effectiveCustomer || { area_size: temporaryCustomer.area });
    const packagePricingItem = buildPackagePricingQuotationItem(body.template, templatePricingArea, 1);
    const pricedTemplateItems = packagePricingItem
      ? [
        packagePricingItem,
        ...templateItems.map((item, index) => ({ ...item, sort_order: index + 2 })),
      ]
      : templateItems;
    const templateSpaces = getTemplateSpaceNames(body.template);
    const templateCategories = orderQuoteCategories(pricedTemplateItems.map((item) => String(item.category || "").trim()));
    const templateAppendixNote = String(body.template?.appendixNote || body.template?.quotationNote || "").trim();
    const templateBudgetCompilationHtml = String(body.template?.budgetCompilationHtml || body.template?.budgetCompilation || "").trim();
    const customerVisibleNote = String(body.customer_visible_note || "").trim();
    const settings = {
	      managementFeeRate: 0,
	      taxRate: Number(body.taxRate ?? 0),
	      discount: Number(body.discount ?? 0),
	      discountType: "fee",
	      discountMode: "amount",
	      discountRate: 1,
	      discountScope: "total",
	      discountSpace: "",
	      discountWorkType: "",
	      excludeSpecificDiscountAmount: 0,
	      excludeSpecialDiscountItems: false,
	      excludeLaborOnlyDiscountItems: false,
      warrantyMonths: Number(body.warrantyMonths ?? 24),
      quotaTemplateId: String(body.template?.id || "").trim(),
      quotaTemplateName: String(body.template?.name || "").trim(),
      appendixNote: templateAppendixNote,
      budgetCompilationHtml: templateBudgetCompilationHtml,
      quoteSpaces: templateSpaces,
      quoteCategories: templateCategories,
      templatePricing: packagePricingItem ? {
        mode: "package",
        area: packagePricingItem.pricingResult.area,
        includedArea: packagePricingItem.pricingResult.includedArea,
        packageAmount: packagePricingItem.pricingResult.packageAmount,
        extraArea: packagePricingItem.pricingResult.extraArea,
        extraAmount: packagePricingItem.pricingResult.extraAmount,
        totalAmount: packagePricingItem.pricingResult.totalAmount,
        segments: packagePricingItem.pricingResult.segments,
        extraAreaPrice: Number(body.template?.quoteConfig?.extraAreaPrice || 0),
        packageTiers: Array.isArray(body.template?.quoteConfig?.packageTiers)
          ? body.template.quoteConfig.packageTiers.map((tier: any) => ({
            maxArea: Number(tier?.maxArea || 0),
            unitPrice: Number(tier?.unitPrice || 0),
          }))
          : packagePricingItem.pricingResult.segments.map((segment) => ({
            maxArea: segment.endArea,
            unitPrice: segment.unitPrice,
          })),
      } : undefined,
      signatureLabels: normalizeQuotationSignatureLabels(branchPrintSettings.quotationSignatureLabels),
    };
    const normalizedTemplateItems = applyOtherFeeTotals(pricedTemplateItems, settings);
    const totals = calculate(normalizedTemplateItems, settings);
    const tx = (db as any).transaction(() => {
      db.prepare(`
        INSERT INTO quotations (
          id, project_id, company_id, title, version, total_amount, discount, final_amount, status, notes, customer_visible_note, terms, settings,
          temp_customer_name, temp_customer_phone, temp_customer_weixin, temp_customer_address, temp_customer_area, temp_customer_decoration_type,
          created_by_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        quotationId,
        project?.id || null,
        companyId,
        title,
        Number(latest?.version || 0) + 1,
        totals.directAmount + totals.taxAmount,
        settings.discount,
        totals.finalAmount,
        body.notes || null,
        customerVisibleNote || null,
        body.terms || "报价有效期 15 天；最终施工范围以双方确认图纸和合同为准；增减项需双方签字确认。",
        JSON.stringify(settings),
        isTemporaryQuotation ? temporaryCustomer.name : null,
        isTemporaryQuotation ? temporaryCustomer.phone || null : null,
        isTemporaryQuotation ? temporaryCustomer.weixin || null : null,
        isTemporaryQuotation ? temporaryCustomer.address || null : null,
        isTemporaryQuotation ? temporaryCustomer.area || null : null,
        isTemporaryQuotation ? temporaryCustomer.decorationType || null : null,
        userId
      );

      if (normalizedTemplateItems.length > 0) {
        const insertItem = db.prepare(`
          INSERT INTO quotation_items (id, quotation_id, category, space, work_type_id, work_type_name, material_category_id, material_category_name, name, spec, material_model, remark, unit, quantity, unit_price, total_price, material_cost, labor_cost, profit_margin, row_color, fee_calc_method, fee_calc_base, fee_rate, cost_material_unit, cost_labor_unit, cost_loss_rate, cost_source, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        normalizedTemplateItems.forEach((item) => {
          insertItem.run(
            makeId("QITEM"),
            quotationId,
            item.category,
            item.space || null,
            item.work_type_id || null,
            item.work_type_name || null,
            item.material_category_id || null,
            item.material_category_name || null,
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
            Number((item as any).cost_material_unit || 0),
            Number((item as any).cost_labor_unit || 0),
            Number((item as any).cost_loss_rate || 0),
            (item as any).cost_source || null,
            item.sort_order
          );
        });
      }

      if (project && normalizedTemplateItems.length > 0) {
        db.prepare("UPDATE projects SET contract_amount = ?, status = CASE WHEN status = 'LEAD' THEN 'QUOTED' ELSE status END, updated_at = datetime('now') WHERE id = ?")
          .run(totals.finalAmount, project.id);
      }
    });
    tx();
    const persistedQuotation = db.prepare(`
      SELECT id
      FROM quotations
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(quotationId, companyId) as { id: string } | undefined;
    if (!persistedQuotation) {
      return NextResponse.json({ message: "报价保存状态未确认，请刷新预算记录后核对" }, { status: 500 });
    }
    if (customer) {
      try {
        syncCustomerProgress(db, customer.id);
        recordCustomerOperation(db, {
          userId,
          customerId: customer.id,
          action: "customer.quotation.create",
          module: "预算报价",
          title: "创建报价",
          content: `${title}，报价金额：${formatAmount(totals.finalAmount)} 元，项目 ${normalizedTemplateItems.length} 项`,
          targetName: title,
          metadata: { quotationId, projectId: project?.id || null, totalAmount: totals.finalAmount, itemCount: normalizedTemplateItems.length },
          ipAddress: getRequestIp(req),
        });
      } catch (logError) {
        console.error("Failed to record quotation creation side effects", logError);
      }
    }

    return NextResponse.json({ id: quotationId, persisted: true }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "创建报价失败" }, { status: 500 });
  }
}
