import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureMaterialSystemSchema } from "@/lib/db";
import { ensureSiteCheckinTables, getOrCreateSiteCheckinCode } from "@/lib/site-checkin";
import { ensureSiteCameraTables, listSiteCameras } from "@/lib/site-cameras";
import {
  assertEnoughMaterialStock,
  deductMaterialStock,
  getOrderDeductedStockItems,
  getOrderPendingStockItems,
  getOrderStockItems,
  markOrderStockDeducted,
  restoreMaterialStock,
} from "@/lib/material-inventory";
import { makeMaterialOrderNo } from "@/lib/materialOrderNo";
import { mergeBranchSettings } from "@/lib/branchSettings";
import { getCompanyRootId } from "@/lib/branchSettingsLookup";
import { ensureProjectCostControlSchema, syncProjectCostSnapshotForQuotation } from "@/lib/projectCostControl";
import {
  approveChangeOrder,
  cancelChangeOrderApprovalInstances,
  createChangeOrderApprovalInstance,
  ensureChangeOrderApprovalTables,
  getChangeOrderApprovalFlowForProject,
  getChangeOrderApprovalMapForOrders,
  getChangeOrderApprovalSummary,
  hasPendingChangeOrderApproval,
  prepareChangeOrderApprovalPlan,
  rejectChangeOrder as rejectChangeOrderWithApproval,
} from "@/lib/changeOrderApproval";
import { getRequestIp, recordCustomerOperation } from "@/lib/operationLog";
import { ensureSiteNodeEventTables, recordSiteNodeEvent } from "@/lib/siteNodeEvents";
import {
  canEditCustomers,
  canManageMaterials,
  canViewCustomers,
  getAuthContext,
  projectBelongsToCompany,
} from "@/lib/security/authorization";

const siteStages = ["PENDING_START", "START_CONFIRM", "CONSTRUCTION", "OWNER_SETTLEMENT", "SITE_SETTLEMENT"] as const;
const handoverStatuses = ["draft", "completed"] as const;
const costCategories = ["AUXILIARY", "LABOR", "MAIN_MATERIAL", "EQUIPMENT", "SUBCONTRACT", "MANAGEMENT", "OTHER"] as const;
const costStatuses = ["PAID", "PENDING", "UNPAID"] as const;
const materialOrderStatuses = ["DRAFT", "PENDING", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"] as const;
const materialOrderTypes = ["AUXILIARY_WAREHOUSE", "AUXILIARY_MONTHLY", "MAIN_SUPPLIER"] as const;
const materialSettlementStatuses = ["UNSETTLED", "SETTLING", "SETTLED"] as const;
let siteTablesReady = false;

function getMobileMaterialOrderTemplates(db: ReturnType<typeof getDb>, companyIds: string[]) {
  if (!companyIds.length) return [];
  const placeholders = companyIds.map(() => "?").join(",");
  const materialRows = db.prepare(`
    SELECT id, supplier_id
    FROM materials
    WHERE company_id IN (${placeholders})
      AND deleted_at IS NULL
      AND is_active = 1
  `).all(...companyIds) as { id: string; supplier_id?: string | null }[];
  const materialMap = new Map(materialRows.map((material) => [material.id, material]));
  const rows = db.prepare(`
    SELECT bs.org_unit_id, bs.settings, ou.name as branch_name
    FROM branch_settings bs
    LEFT JOIN org_units ou ON bs.org_unit_id = ou.id
    WHERE bs.deleted_at IS NULL
      AND bs.company_id IN (${placeholders})
    ORDER BY datetime(COALESCE(bs.updated_at, bs.created_at, '1970-01-01')) DESC
  `).all(...companyIds) as any[];
  return rows.flatMap((row) => {
    let settings: ReturnType<typeof mergeBranchSettings>;
    try {
      settings = mergeBranchSettings(row?.settings ? JSON.parse(row.settings) : {});
    } catch {
      settings = mergeBranchSettings({});
    }
    return settings.orderSettings.auxiliaryTemplates
      .filter((template) => template.isEnabled)
      .map((template) => {
        const items = template.items.filter((item) => {
          const material = materialMap.get(item.materialId);
          if (!material) return false;
          if (template.warehouseSupplierId && material.supplier_id !== template.warehouseSupplierId) return false;
          return true;
        });
        return {
          id: template.id,
          name: template.name,
          orgUnitId: row.org_unit_id,
          branchName: row.branch_name || "",
          warehouseSupplierId: template.warehouseSupplierId,
          itemCount: items.length,
          items,
        };
      })
      .filter((template) => template.items.length > 0);
  });
}

type SiteChangeOrderItem = {
  change_type: "ADD" | "DEDUCT";
  title: string;
  space: string;
  phase: string;
  description: string;
  unit_price: number;
  quantity: number;
  unit: string;
  amount: number;
  cost_estimate: number;
};

type SiteQuantityReviewItem = {
  source_type: "BUDGET" | "MANUAL";
  quotation_item_id: string;
  title: string;
  category: string;
  space: string;
  phase: string;
  description: string;
  unit: string;
  budget_quantity: number;
  actual_quantity: number;
  labor_unit_price: number;
  material_unit_price: number;
  unit_price: number;
  diff_quantity: number;
  labor_diff_amount: number;
  material_diff_amount: number;
  diff_amount: number;
  result_type: "ADD" | "DEDUCT" | "NONE";
  evidence_note: string;
  discount_amount?: number;
  client_key?: string;
  display_order?: number;
};

function normalizeChangeLineType(value?: string | null): "ADD" | "DEDUCT" {
  return value === "DEDUCT" ? "DEDUCT" : "ADD";
}

function normalizeSiteStage(project: any) {
  const stage = String(project?.site_stage || "").trim();
  if ((siteStages as readonly string[]).includes(stage)) return stage;
  const status = String(project?.status || "").toUpperCase();
  if (status === "SIGNED") return "PENDING_START";
  if (status === "CONSTRUCTION") return "CONSTRUCTION";
  if (status === "COMPLETED") return "OWNER_SETTLEMENT";
  if (status === "CLOSED") return "SITE_SETTLEMENT";
  return "PENDING_START";
}

const siteListConstructionPhaseLabels: Record<string, string> = {
  DEMOLITION: "拆改",
  PLUMBING: "水电",
  MASONRY: "泥瓦",
  CARPENTRY: "木工",
  PAINTING: "油漆",
  INSTALLATION: "安装",
  DECORATION: "软装",
  INSPECTION: "验收",
};

function getSiteListConstructionStageName(project: any, normalizedStage?: string) {
  const stage = normalizedStage || normalizeSiteStage(project);
  if (stage === "PENDING_START") return "待开工";
  if (stage === "START_CONFIRM") return "开工确认";
  if (stage === "OWNER_SETTLEMENT") return "业主结算";
  if (stage === "SITE_SETTLEMENT") return "工地结算";

  const phaseName = String(project?.construction_stage_name || project?.current_phase_name || project?.active_phase_name || "").trim();
  if (phaseName) return phaseName;

  const phaseKey = String(project?.current_phase || "").trim();
  if (siteListConstructionPhaseLabels[phaseKey]) return siteListConstructionPhaseLabels[phaseKey];
  if (/[\u4e00-\u9fa5]/.test(phaseKey)) return phaseKey;

  if (stage === "CONSTRUCTION") return "施工中";
  return "-";
}

function getSiteDisplayName(project: any) {
  return String(
    project?.customer_address ||
    project?.address ||
    project?.name ||
    project?.customer_name ||
    "工地"
  ).trim();
}

function statusForSiteStage(stage: string, fallbackStatus = "SIGNED") {
  if (stage === "PENDING_START" || stage === "START_CONFIRM") return "SIGNED";
  if (stage === "CONSTRUCTION") return "CONSTRUCTION";
  if (stage === "OWNER_SETTLEMENT") return "COMPLETED";
  if (stage === "SITE_SETTLEMENT") return "CLOSED";
  return fallbackStatus;
}

const commonChineseInitials: Record<string, string> = {
  阿: "A", 鞍: "A",
  北: "B", 宝: "B", 保: "B", 包: "B", 本: "B", 滨: "B", 博: "B",
  成: "C", 重: "C", 长: "C", 常: "C", 潮: "C", 郴: "C", 赤: "C", 池: "C", 滁: "C", 沧: "C",
  大: "D", 东: "D", 德: "D", 达: "D", 丹: "D",
  恩: "E", 鄂: "E",
  福: "F", 佛: "F", 抚: "F", 阜: "F",
  广: "G", 贵: "G", 桂: "G", 赣: "G", 甘: "G", 固: "G",
  呼: "H", 哈: "H", 合: "H", 杭: "H", 海: "H", 惠: "H", 衡: "H", 湖: "H", 黄: "H", 淮: "H", 河: "H", 菏: "H", 汉: "H", 鹤: "H",
  济: "J", 嘉: "J", 金: "J", 江: "J", 九: "J", 吉: "J", 荆: "J", 晋: "J", 焦: "J",
  昆: "K", 克: "K", 开: "K",
  兰: "L", 洛: "L", 临: "L", 柳: "L", 泸: "L", 乐: "L", 龙: "L", 拉: "L", 廊: "L", 丽: "L", 六: "L",
  绵: "M", 牡: "M", 马: "M", 茂: "M", 梅: "M",
  南: "N", 宁: "N", 内: "N", 南昌: "N",
  莆: "P", 平: "P", 濮: "P", 攀: "P",
  青: "Q", 齐: "Q", 泉: "Q", 曲: "Q", 秦: "Q", 衢: "Q", 清: "Q",
  日: "R",
  上: "S", 深: "S", 苏: "S", 沈: "S", 石: "S", 绍: "S", 商: "S", 三: "S", 汕: "S", 韶: "S", 十: "S", 遂: "S",
  天: "T", 太: "T", 台: "T", 泰: "T", 唐: "T", 通: "T",
  乌: "W", 武: "W", 无: "W", 温: "W", 潍: "W", 威: "W", 芜: "W", 梧: "W",
  西: "X", 厦: "X", 徐: "X", 襄: "X", 咸: "X", 新: "X", 信: "X", 湘: "X", 邢: "X", 许: "X",
  银: "Y", 义: "Y", 烟: "Y", 宜: "Y", 岳: "Y", 扬: "Y", 盐: "Y", 益: "Y", 榆: "Y", 延: "Y", 阳: "Y", 运: "Y", 玉: "Y",
  郑: "Z", 珠: "Z", 中: "Z", 遵: "Z", 漳: "Z", 株: "Z", 周: "Z", 驻: "Z", 湛: "Z", 肇: "Z", 镇: "Z", 张: "Z", 自: "Z", 枣: "Z",
};

function getStoreInitial(storeName?: string | null) {
  const normalized = String(storeName || "").trim();
  const first = normalized.match(/[A-Za-z0-9\u4e00-\u9fa5]/)?.[0] || "";
  if (!first) return "X";
  if (/^[A-Za-z0-9]$/.test(first)) return first.toUpperCase();
  return commonChineseInitials[first] || "X";
}

function makeSiteFinanceNo(db: ReturnType<typeof getDb>, storeName?: string | null) {
  const prefix = getStoreInitial(storeName);
  const exists = db.prepare("SELECT 1 FROM projects WHERE finance_no = ? LIMIT 1");
  for (let index = 0; index < 50; index += 1) {
    const suffix = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
    const value = `${prefix}${suffix}`;
    if (!exists.get(value)) return value;
  }
  return `${prefix}${String(Date.now()).slice(-6)}`;
}

function ensureSiteFinanceNumbers(db: ReturnType<typeof getDb>, companyId: string) {
  const rows = db.prepare(`
    SELECT p.id, c.service_store
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    WHERE p.company_id = ?
      AND p.deleted_at IS NULL
      AND (p.finance_no IS NULL OR TRIM(p.finance_no) = '')
  `).all(companyId) as { id: string; service_store?: string | null }[];
  if (rows.length === 0) return;

  const update = db.prepare("UPDATE projects SET finance_no = ?, updated_at = updated_at WHERE id = ?");
  for (const item of rows) {
    update.run(makeSiteFinanceNo(db, item.service_store), item.id);
  }
}

function hasCompletedSiteStartHandover(db: ReturnType<typeof getDb>, projectId: string) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM site_start_handovers
    WHERE project_id = ?
      AND deleted_at IS NULL
      AND LOWER(COALESCE(status, '')) = 'completed'
    LIMIT 1
  `).get(projectId));
}

function parseContent(value?: string | null) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function getSortedConstructionStages(template: any) {
  return (Array.isArray(template?.stages) ? template.stages : [])
    .map((stage: any, index: number) => ({
      id: String(stage?.id || `stage-${index}`).trim(),
      name: String(stage?.name || `施工阶段${index + 1}`).trim(),
      code: String(stage?.code || "").trim(),
      sortOrder: Number(stage?.sortOrder || index + 1) || index + 1,
    }))
    .filter((stage: { id: string; name: string; code: string; sortOrder: number }) => stage.id && stage.name)
    .sort((a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder);
}

function getStartConfirmTemplateStage(db: ReturnType<typeof getDb>, user: any, project: any, handover: any) {
  const branchId = getCompanyRootId(db, user?.org_unit_id)
    || (db.prepare(`
      SELECT id
      FROM org_units
      WHERE company_id = ?
        AND type = 'company'
        AND deleted_at IS NULL
        AND COALESCE(is_active, 1) = 1
      ORDER BY sort_order ASC, datetime(COALESCE(created_at, '1970-01-01')) ASC
      LIMIT 1
    `).get(user?.company_id || project?.company_id || "") as any)?.id
    || "";
  const row = branchId
    ? db.prepare("SELECT settings FROM branch_settings WHERE org_unit_id = ? AND deleted_at IS NULL").get(branchId) as any
    : null;
  const settings = mergeBranchSettings(parseContent(row?.settings));
  const templateId = String(project?.construction_template_id || handover?.construction_template_id || "").trim();
  const templateName = String(project?.construction_template_name || handover?.construction_template_name || "").trim();
  const template = settings.constructionTemplates.templates
    .filter((item) => item.isEnabled !== false)
    .find((item) => (templateId && item.id === templateId) || (!templateId && templateName && item.name === templateName));
  const firstStage = getSortedConstructionStages(template)[0] || null;
  return { template, firstStage };
}

function getStartRequestTemplate(db: ReturnType<typeof getDb>, user: any, project: any) {
  const branchId = getCompanyRootId(db, user?.org_unit_id)
    || (db.prepare(`
      SELECT id
      FROM org_units
      WHERE company_id = ?
        AND type = 'company'
        AND deleted_at IS NULL
        AND COALESCE(is_active, 1) = 1
      ORDER BY sort_order ASC, datetime(COALESCE(created_at, '1970-01-01')) ASC
      LIMIT 1
    `).get(user?.company_id || project?.company_id || "") as any)?.id
    || "";
  const row = branchId
    ? db.prepare("SELECT settings FROM branch_settings WHERE org_unit_id = ? AND deleted_at IS NULL").get(branchId) as any
    : null;
  const settings = mergeBranchSettings(parseContent(row?.settings));
  const templates = settings.constructionTemplates.templates.filter((item) => item.isEnabled !== false);
  const templateId = String(project?.construction_template_id || "").trim();
  const templateName = String(project?.construction_template_name || "").trim();
  const decorationType = String(project?.decoration_type || project?.construction_template_decoration_type || project?.style || "").trim();
  return templates.find((item) => templateId && item.id === templateId)
    || templates.find((item) => templateName && item.name === templateName)
    || templates.find((item) => decorationType && String(item.decorationType || "").trim() === decorationType)
    || templates.find((item) => item.isDefault === true)
    || templates[0]
    || null;
}

const siteHolidayDates = new Set([
  "2026-01-01",
  "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
  "2026-04-04", "2026-04-05", "2026-04-06",
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
  "2026-06-19", "2026-06-20", "2026-06-21",
  "2026-09-25", "2026-09-26", "2026-09-27",
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07",
]);

function normalizeDateOnly(value: unknown) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return "";
  return text.slice(0, 10);
}

function getBeijingDateOnly() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateSitePlannedEnd(
  plannedStart: string,
  durationDays: number,
  options: { weekendConstruction: boolean; holidayConstruction: boolean },
) {
  const startDate = parseDateOnly(plannedStart);
  const days = Math.ceil(Number(durationDays || 0));
  if (!startDate || !Number.isFinite(days) || days <= 0) return "";
  const cursor = new Date(startDate);
  let remaining = days;
  let guard = 0;
  while (remaining > 0 && guard < 2000) {
    const dateKey = formatDateOnly(cursor);
    const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    const isHoliday = siteHolidayDates.has(dateKey);
    if ((options.weekendConstruction || !isWeekend) && (options.holidayConstruction || !isHoliday)) {
      remaining -= 1;
    }
    if (remaining > 0) cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return formatDateOnly(cursor);
}

function makeSiteChangeNo(db: ReturnType<typeof getDb>, projectId: string) {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = (db.prepare(`
    SELECT COUNT(*) as count
    FROM site_change_orders
    WHERE project_id = ? AND change_no LIKE ?
  `).get(projectId, `BG${ymd}%`) as any)?.count || 0;
  return `BG${ymd}${String(Number(count) + 1).padStart(3, "0")}`;
}

function makeQuantityReviewNo(db: ReturnType<typeof getDb>, projectId: string) {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = (db.prepare(`
    SELECT COUNT(*) as count
    FROM site_quantity_reviews
    WHERE project_id = ? AND review_no LIKE ?
  `).get(projectId, `GC${ymd}%`) as any)?.count || 0;
  return `GC${ymd}${String(Number(count) + 1).padStart(3, "0")}`;
}

function makeOwnerSettlementBillNo(db: ReturnType<typeof getDb>, projectId: string) {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = (db.prepare(`
    SELECT COUNT(*) as count
    FROM site_owner_settlement_bills
    WHERE project_id = ? AND bill_no LIKE ?
  `).get(projectId, `JS${ymd}%`) as any)?.count || 0;
  return `JS${ymd}${String(Number(count) + 1).padStart(3, "0")}`;
}

function normalizeQuantityReviewItems(body: any): SiteQuantityReviewItem[] {
  const sourceItems = Array.isArray(body?.items) ? body.items : [];
  return sourceItems
    .map((item: any) => {
      const budgetQuantity = Math.max(0, Number(item?.budget_quantity || 0) || 0);
      const actualQuantity = Math.max(0, Number(item?.actual_quantity || 0) || 0);
      const laborUnitPrice = Math.max(0, Number(item?.labor_unit_price ?? item?.laborUnitPrice ?? 0) || 0);
      const materialUnitPrice = Math.max(0, Number(item?.material_unit_price ?? item?.materialUnitPrice ?? 0) || 0);
      const fallbackUnitPrice = Math.max(0, Number(item?.unit_price || 0) || 0);
      const unitPrice = laborUnitPrice || materialUnitPrice ? roundMoney(laborUnitPrice + materialUnitPrice) : fallbackUnitPrice;
      const diffQuantity = roundMoney(actualQuantity - budgetQuantity);
      const signedAmount = roundMoney(diffQuantity * unitPrice);
      const laborSignedAmount = roundMoney(diffQuantity * laborUnitPrice);
      const materialSignedAmount = roundMoney(diffQuantity * materialUnitPrice);
      const resultType: SiteQuantityReviewItem["result_type"] = signedAmount > 0 ? "ADD" : signedAmount < 0 ? "DEDUCT" : "NONE";
      const discountAmount = roundMoney(Math.max(0, Number(item?.discount_amount || 0) || 0));
      const displayOrder = Number(item?.display_order);
      return {
        source_type: String(item?.source_type || "").toUpperCase() === "MANUAL" ? "MANUAL" : "BUDGET",
        quotation_item_id: String(item?.quotation_item_id || "").trim(),
        title: String(item?.title || "").trim(),
        category: String(item?.category || "").trim(),
        space: String(item?.space || "").trim(),
        phase: String(item?.phase || "").trim(),
        description: String(item?.description || "").trim(),
        unit: String(item?.unit || "项").trim() || "项",
        budget_quantity: budgetQuantity,
        actual_quantity: actualQuantity,
        labor_unit_price: laborUnitPrice,
        material_unit_price: materialUnitPrice,
        unit_price: unitPrice,
        diff_quantity: diffQuantity,
        labor_diff_amount: Math.abs(laborSignedAmount),
        material_diff_amount: Math.abs(materialSignedAmount),
        diff_amount: Math.abs(signedAmount),
        result_type: resultType,
        evidence_note: String(item?.evidence_note || "").trim(),
        discount_amount: discountAmount,
        client_key: String(item?.client_key || "").trim() || undefined,
        display_order: Number.isFinite(displayOrder) ? displayOrder : undefined,
      };
    })
    .filter((item: SiteQuantityReviewItem) => item.title && item.actual_quantity >= 0);
}

function getQuantityReviewSummary(items: SiteQuantityReviewItem[]) {
  const addAmount = roundMoney(items.reduce((sum, item) => sum + (item.result_type === "ADD" ? item.diff_amount : 0), 0));
  const deductAmount = roundMoney(items.reduce((sum, item) => sum + (item.result_type === "DEDUCT" ? item.diff_amount : 0), 0));
  const netAmount = roundMoney(addAmount - deductAmount);
  const title = items.length > 1 ? `${items[0].title}等${items.length}项工程量复核` : `${items[0]?.title || "工程量"}复核`;
  const phases = Array.from(new Set(items.map((item) => item.phase).filter(Boolean)));
  return {
    title,
    addAmount,
    deductAmount,
    netAmount,
    phase: phases.length === 1 ? phases[0] : null,
  };
}

function makeChangeOrderItemsFromQuantityReview(items: SiteQuantityReviewItem[]): SiteChangeOrderItem[] {
  return items
    .filter((item) => item.result_type !== "NONE" && item.diff_amount > 0)
    .map((item) => ({
      change_type: item.result_type === "DEDUCT" ? "DEDUCT" : "ADD",
      title: item.title,
      space: item.space,
      phase: item.phase,
      description: [
        item.source_type === "MANUAL" ? "预算外现场项目" : "预算项目工程量复核",
        `预算量 ${item.budget_quantity}${item.unit}`,
        `实际量 ${item.actual_quantity}${item.unit}`,
        `人工单价 ${item.labor_unit_price}`,
        `材料单价 ${item.material_unit_price}`,
        item.evidence_note,
      ].filter(Boolean).join("；"),
      unit_price: item.unit_price,
      quantity: Math.abs(item.diff_quantity),
      unit: item.unit,
      amount: item.diff_amount,
      cost_estimate: 0,
    }));
}

function normalizeChangeOrderItems(body: any): SiteChangeOrderItem[] {
  const sourceItems = Array.isArray(body?.items) && body.items.length > 0
    ? body.items
    : [{
        title: body?.title,
        space: body?.space,
        phase: body?.phase,
        description: body?.description,
        change_type: body?.change_type,
        unit_price: body?.unit_price,
        quantity: body?.quantity,
        unit: body?.unit,
        amount: body?.amount,
        cost_estimate: body?.cost_estimate,
      }];
  return sourceItems
    .map((item: any) => {
      const legacyAmount = Math.max(0, Number(item?.amount || 0) || 0);
      const hasUnitPrice = item?.unit_price !== undefined && item?.unit_price !== null && item?.unit_price !== "";
      const hasQuantity = item?.quantity !== undefined && item?.quantity !== null && item?.quantity !== "";
      const unitPrice = Math.max(0, Number(hasUnitPrice ? item.unit_price : legacyAmount) || 0);
      const quantity = Math.max(0, Number(hasQuantity ? item.quantity : 1) || 0);
      return {
        change_type: normalizeChangeLineType(item?.change_type || body?.change_type),
        title: String(item?.title || "").trim(),
        space: String(item?.space || "").trim(),
        phase: String(item?.phase || "").trim(),
        description: String(item?.description || "").trim(),
        unit_price: unitPrice,
        quantity,
        unit: String(item?.unit || "项").trim() || "项",
        amount: Math.round(unitPrice * quantity * 100) / 100,
        cost_estimate: Math.max(0, Number(item?.cost_estimate || 0) || 0),
      };
    })
    .filter((item: SiteChangeOrderItem) => item.title);
}

function getChangeOrderSummary(items: SiteChangeOrderItem[]) {
  const addAmount = items.reduce((sum: number, item: SiteChangeOrderItem) => sum + (item.change_type === "ADD" ? item.amount : 0), 0);
  const deductAmount = items.reduce((sum: number, item: SiteChangeOrderItem) => sum + (item.change_type === "DEDUCT" ? item.amount : 0), 0);
  const netAmount = roundMoney(addAmount - deductAmount);
  const costEstimate = items.reduce((sum: number, item: SiteChangeOrderItem) => sum + item.cost_estimate, 0);
  const title = items.length > 1 ? `${items[0].title}等${items.length}项` : items[0]?.title || "";
  const spaces = Array.from(new Set(items.map((item: SiteChangeOrderItem) => item.space).filter(Boolean)));
  const phases = Array.from(new Set(items.map((item: SiteChangeOrderItem) => item.phase).filter(Boolean)));
  const descriptions = items.map((item: SiteChangeOrderItem) => item.description).filter(Boolean);
  return {
    grossAmount: roundMoney(addAmount),
    deductAmount: roundMoney(deductAmount),
    netAmount,
    costEstimate,
    title,
    space: spaces.length === 0 ? null : spaces.length === 1 ? spaces[0] : `${spaces[0]}等${spaces.length}处`,
    phase: phases.length === 1 ? phases[0] : null,
    description: descriptions.join("\n") || null,
  };
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getChangeOrderDiscount(body: any, grossAmount: number) {
  const discountAmount = roundMoney(Math.max(0, Number(body?.discount_amount || 0) || 0));
  const discountReason = String(body?.discount_reason || "").trim();
  return {
    amount: discountAmount,
    reason: discountAmount > 0 ? discountReason : null,
    finalAmount: roundMoney(Math.max(0, grossAmount - discountAmount)),
  };
}

function getProjectForChangeOrder(db: ReturnType<typeof getDb>, projectId: string) {
  return db.prepare(`
    SELECT p.*, c.name as customer_name
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    WHERE p.id = ? AND p.deleted_at IS NULL AND c.deleted_at IS NULL
  `).get(projectId) as any;
}

function buildChangeOrderApprovalPlan(db: ReturnType<typeof getDb>, projectId: string, amount: number, authorId: string | null) {
  if (!authorId) return null;
  const approvalFlow = getChangeOrderApprovalFlowForProject(db, projectId, amount);
  if (!approvalFlow) return null;
  const plan = prepareChangeOrderApprovalPlan(db, {
    customerId: approvalFlow.project.customer_id,
    project: approvalFlow.project,
    branchOrgUnitId: approvalFlow.branchOrgUnitId,
    flow: approvalFlow.flow,
    initiatorId: authorId,
  });
  return { ...approvalFlow, plan };
}

function ensureSiteTables(db: ReturnType<typeof getDb>) {
  if (siteTablesReady) return;

  ensureSiteCheckinTables(db);
  ensureSiteCameraTables(db);
  ensureMaterialSystemSchema(db);
  ensureProjectCostControlSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_inspections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      category TEXT,
      severity TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'open',
      assignee_id TEXT REFERENCES users(id),
      due_date TEXT,
      result TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS site_start_handovers (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
	      status TEXT DEFAULT 'draft',
	      scheduled_at TEXT,
	      planned_start TEXT,
	      planned_end TEXT,
		      duration_days INTEGER DEFAULT 0,
		      weekend_construction INTEGER DEFAULT 0,
		      holiday_construction INTEGER DEFAULT 0,
		      has_floor_heating INTEGER DEFAULT 0,
		      construction_template_id TEXT,
		      construction_template_name TEXT,
		      construction_template_description TEXT,
		      construction_template_decoration_type TEXT,
		      construction_template_duration_text TEXT,
		      construction_template_stage_count INTEGER DEFAULT 0,
		      construction_template_node_count INTEGER DEFAULT 0,
		      construction_template_acceptance_count INTEGER DEFAULT 0,
		      checks TEXT,
	      designer_confirmed INTEGER DEFAULT 0,
      manager_confirmed INTEGER DEFAULT 0,
      owner_confirmed INTEGER DEFAULT 0,
      owner_present INTEGER DEFAULT 1,
      key_notes TEXT,
      risk_notes TEXT,
      unresolved_items TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS site_cost_records (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      category TEXT NOT NULL,
      phase TEXT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      cost_date TEXT,
      supplier TEXT,
      payee TEXT,
      payment_method TEXT,
      status TEXT DEFAULT 'PAID',
      invoice_no TEXT,
      work_type_name TEXT,
      material_category_name TEXT,
      source_type TEXT DEFAULT 'MANUAL',
      source_id TEXT,
      remark TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_site_cost_records_project ON site_cost_records(project_id, cost_date);

    CREATE TABLE IF NOT EXISTS site_change_orders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      change_no TEXT NOT NULL,
      change_type TEXT NOT NULL DEFAULT 'ADD',
      title TEXT NOT NULL,
      items TEXT,
      space TEXT,
      phase TEXT,
      reason_type TEXT,
      reason_detail TEXT,
      description TEXT,
      gross_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      discount_reason TEXT,
      amount REAL NOT NULL DEFAULT 0,
      cost_estimate REAL DEFAULT 0,
      owner_confirmed INTEGER DEFAULT 1,
      owner_confirmed_at TEXT,
      internal_approval_status TEXT DEFAULT 'PENDING',
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      rejected_reason TEXT,
      included_in_settlement INTEGER DEFAULT 0,
      settlement_status TEXT DEFAULT 'NOT_INCLUDED',
      status TEXT DEFAULT 'PENDING_APPROVAL',
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_site_change_orders_project ON site_change_orders(project_id, status, created_at);

    CREATE TABLE IF NOT EXISTS site_quantity_reviews (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      review_no TEXT NOT NULL,
      title TEXT NOT NULL,
      phase TEXT,
      items TEXT NOT NULL DEFAULT '[]',
      add_amount REAL DEFAULT 0,
      deduct_amount REAL DEFAULT 0,
      net_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'PENDING_REVIEW',
      evidence_note TEXT,
      generated_change_order_id TEXT,
      created_by TEXT REFERENCES users(id),
      confirmed_by TEXT REFERENCES users(id),
      confirmed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_site_quantity_reviews_project ON site_quantity_reviews(project_id, status, created_at);

    CREATE TABLE IF NOT EXISTS site_owner_settlement_bills (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      bill_no TEXT NOT NULL,
      status TEXT DEFAULT 'DRAFT',
      contract_id TEXT,
      contract_amount REAL DEFAULT 0,
      quotation_amount REAL DEFAULT 0,
      quotation_discount_amount REAL DEFAULT 0,
      change_add_amount REAL DEFAULT 0,
      change_deduct_amount REAL DEFAULT 0,
      change_net_amount REAL DEFAULT 0,
      settlement_amount REAL DEFAULT 0,
      received_amount REAL DEFAULT 0,
      receivable_amount REAL DEFAULT 0,
      refund_amount REAL DEFAULT 0,
      budget_cost_amount REAL DEFAULT 0,
      actual_cost_amount REAL DEFAULT 0,
      actual_profit_amount REAL DEFAULT 0,
      actual_profit_rate REAL DEFAULT 0,
      snapshot TEXT DEFAULT '{}',
      created_by TEXT REFERENCES users(id),
      confirmed_by TEXT REFERENCES users(id),
      confirmed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_site_owner_settlement_bills_project ON site_owner_settlement_bills(project_id, status, created_at);

    CREATE INDEX IF NOT EXISTS idx_material_orders_project ON material_orders(project_id, order_date);
    CREATE INDEX IF NOT EXISTS idx_material_order_items_order ON material_order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_projects_site_list ON projects(deleted_at, site_stage, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_projects_site_list_rank_updated ON projects (
      deleted_at,
      (CASE COALESCE(site_stage, '')
        WHEN 'PENDING_START' THEN 0
        WHEN 'START_CONFIRM' THEN 1
        WHEN 'CONSTRUCTION' THEN 2
        WHEN 'OWNER_SETTLEMENT' THEN 3
        WHEN 'SITE_SETTLEMENT' THEN 4
        ELSE CASE status
          WHEN 'SIGNED' THEN 0
          WHEN 'CONSTRUCTION' THEN 2
          WHEN 'COMPLETED' THEN 3
          WHEN 'CLOSED' THEN 4
          ELSE 0
        END
      END),
      updated_at DESC,
      id DESC
    );
    CREATE INDEX IF NOT EXISTS idx_projects_planned_end ON projects(planned_end_date);
    CREATE INDEX IF NOT EXISTS idx_contracts_project_status_deleted ON contracts(project_id, status, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_site_inspections_project_status_deleted ON site_inspections(project_id, status, deleted_at);

    CREATE TABLE IF NOT EXISTS daily_log_photos (
      id TEXT PRIMARY KEY,
      log_id TEXT NOT NULL REFERENCES daily_logs(id),
      url TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_daily_log_photos_log ON daily_log_photos(log_id, sort_order);

    CREATE TABLE IF NOT EXISTS vr_tours (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      scenes TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_vr_tours_project ON vr_tours(project_id);
  `);
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  const ensureProjectColumn = (name: string, definition: string) => {
    if (!projectColumns.some((column) => column.name === name)) {
      db.prepare(`ALTER TABLE projects ADD COLUMN ${name} ${definition}`).run();
    }
  };
  ensureProjectColumn("site_stage", "TEXT");
  ensureProjectColumn("weekend_construction", "INTEGER DEFAULT 0");
  ensureProjectColumn("holiday_construction", "INTEGER DEFAULT 0");
  ensureProjectColumn("has_floor_heating", "INTEGER DEFAULT 0");
  ensureProjectColumn("site_location_name", "TEXT");
  ensureProjectColumn("site_location_address", "TEXT");
  ensureProjectColumn("site_latitude", "REAL");
  ensureProjectColumn("site_longitude", "REAL");
  ensureProjectColumn("construction_template_id", "TEXT");
  ensureProjectColumn("construction_template_name", "TEXT");
  ensureProjectColumn("construction_template_description", "TEXT");
  ensureProjectColumn("construction_template_decoration_type", "TEXT");
  ensureProjectColumn("construction_template_duration_text", "TEXT");
  ensureProjectColumn("construction_template_stage_count", "INTEGER DEFAULT 0");
  ensureProjectColumn("construction_template_node_count", "INTEGER DEFAULT 0");
  ensureProjectColumn("construction_template_acceptance_count", "INTEGER DEFAULT 0");
  ensureProjectColumn("finance_no", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_finance_no ON projects(finance_no);");
  const handoverColumns = db.prepare("PRAGMA table_info(site_start_handovers)").all() as { name: string }[];
  const ensureHandoverColumn = (name: string, definition: string) => {
    if (!handoverColumns.some((column) => column.name === name)) {
      db.prepare(`ALTER TABLE site_start_handovers ADD COLUMN ${name} ${definition}`).run();
    }
  };
  ensureHandoverColumn("planned_start", "TEXT");
  ensureHandoverColumn("planned_end", "TEXT");
  ensureHandoverColumn("duration_days", "INTEGER DEFAULT 0");
  ensureHandoverColumn("weekend_construction", "INTEGER DEFAULT 0");
  ensureHandoverColumn("holiday_construction", "INTEGER DEFAULT 0");
  ensureHandoverColumn("has_floor_heating", "INTEGER DEFAULT 0");
  ensureHandoverColumn("construction_template_id", "TEXT");
  ensureHandoverColumn("construction_template_name", "TEXT");
  ensureHandoverColumn("construction_template_description", "TEXT");
  ensureHandoverColumn("construction_template_decoration_type", "TEXT");
  ensureHandoverColumn("construction_template_duration_text", "TEXT");
  ensureHandoverColumn("construction_template_stage_count", "INTEGER DEFAULT 0");
  ensureHandoverColumn("construction_template_node_count", "INTEGER DEFAULT 0");
  ensureHandoverColumn("construction_template_acceptance_count", "INTEGER DEFAULT 0");
  const costRecordColumns = db.prepare("PRAGMA table_info(site_cost_records)").all() as { name: string }[];
  const ensureCostRecordColumn = (name: string, definition: string) => {
    if (!costRecordColumns.some((column) => column.name === name)) {
      db.prepare(`ALTER TABLE site_cost_records ADD COLUMN ${name} ${definition}`).run();
    }
  };
  ensureCostRecordColumn("work_type_name", "TEXT");
  ensureCostRecordColumn("material_category_name", "TEXT");
  ensureCostRecordColumn("source_type", "TEXT DEFAULT 'MANUAL'");
  ensureCostRecordColumn("source_id", "TEXT");
  const changeOrderColumns = db.prepare("PRAGMA table_info(site_change_orders)").all() as { name: string }[];
  const ensureChangeOrderColumn = (name: string, definition: string) => {
    if (!changeOrderColumns.some((column) => column.name === name)) {
      db.prepare(`ALTER TABLE site_change_orders ADD COLUMN ${name} ${definition}`).run();
    }
  };
  ensureChangeOrderColumn("items", "TEXT");
  ensureChangeOrderColumn("gross_amount", "REAL DEFAULT 0");
  ensureChangeOrderColumn("discount_amount", "REAL DEFAULT 0");
  ensureChangeOrderColumn("discount_reason", "TEXT");
  const quantityReviewColumns = db.prepare("PRAGMA table_info(site_quantity_reviews)").all() as { name: string }[];
  const ensureQuantityReviewColumn = (name: string, definition: string) => {
    if (!quantityReviewColumns.some((column) => column.name === name)) {
      db.prepare(`ALTER TABLE site_quantity_reviews ADD COLUMN ${name} ${definition}`).run();
    }
  };
  ensureQuantityReviewColumn("generated_change_order_id", "TEXT");
  ensureQuantityReviewColumn("confirmed_by", "TEXT REFERENCES users(id)");
  ensureQuantityReviewColumn("confirmed_at", "TEXT");
  const ownerSettlementBillColumns = db.prepare("PRAGMA table_info(site_owner_settlement_bills)").all() as { name: string }[];
  const ensureOwnerSettlementBillColumn = (name: string, definition: string) => {
    if (!ownerSettlementBillColumns.some((column) => column.name === name)) {
      db.prepare(`ALTER TABLE site_owner_settlement_bills ADD COLUMN ${name} ${definition}`).run();
    }
  };
  ensureOwnerSettlementBillColumn("quotation_amount", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("quotation_discount_amount", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("change_add_amount", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("change_deduct_amount", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("change_net_amount", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("received_amount", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("receivable_amount", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("refund_amount", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("budget_cost_amount", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("actual_cost_amount", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("actual_profit_amount", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("actual_profit_rate", "REAL DEFAULT 0");
  ensureOwnerSettlementBillColumn("snapshot", "TEXT DEFAULT '{}'");
  db.prepare(`
    UPDATE site_change_orders
    SET gross_amount = amount
    WHERE (gross_amount IS NULL OR gross_amount = 0) AND amount > 0
  `).run();
  ensureChangeOrderApprovalTables(db);
  const dailyLogColumns = db.prepare("PRAGMA table_info(daily_logs)").all() as { name: string }[];
  const ensureDailyLogColumn = (name: string, definition: string) => {
    if (!dailyLogColumns.some((column) => column.name === name)) {
      db.prepare(`ALTER TABLE daily_logs ADD COLUMN ${name} ${definition}`).run();
    }
  };
  ensureDailyLogColumn("phase", "TEXT");
  ensureDailyLogColumn("stage_id", "TEXT");
  ensureDailyLogColumn("stage_name", "TEXT");
  ensureDailyLogColumn("node_id", "TEXT");
  ensureDailyLogColumn("node_name", "TEXT");
  ensureDailyLogColumn("node_type", "TEXT");
  ensureDailyLogColumn("completed_work", "TEXT");
  ensureDailyLogColumn("material_notes", "TEXT");
  ensureDailyLogColumn("quality_notes", "TEXT");
  ensureDailyLogColumn("issue_notes", "TEXT");
  ensureDailyLogColumn("next_plan", "TEXT");
  ensureDailyLogColumn("location_name", "TEXT");
  ensureDailyLogColumn("location_address", "TEXT");
  ensureDailyLogColumn("latitude", "REAL");
  ensureDailyLogColumn("longitude", "REAL");
  ensureDailyLogColumn("deleted_at", "TEXT");
  ensureSiteNodeEventTables(db);
  const customerColumns = db.prepare("PRAGMA table_info(customers)").all() as { name: string }[];
  const ensureCustomerColumn = (name: string, definition: string) => {
    if (!customerColumns.some((column) => column.name === name)) {
      db.prepare(`ALTER TABLE customers ADD COLUMN ${name} ${definition}`).run();
    }
  };
  ensureCustomerColumn("address_location_name", "TEXT");
  ensureCustomerColumn("address_location_address", "TEXT");
  ensureCustomerColumn("address_latitude", "REAL");
  ensureCustomerColumn("address_longitude", "REAL");
  siteTablesReady = true;
}

const siteListStageExpr = `CASE COALESCE(p.site_stage, '')
  WHEN 'PENDING_START' THEN 'PENDING_START'
  WHEN 'START_CONFIRM' THEN 'START_CONFIRM'
  WHEN 'CONSTRUCTION' THEN 'CONSTRUCTION'
  WHEN 'OWNER_SETTLEMENT' THEN 'OWNER_SETTLEMENT'
  WHEN 'SITE_SETTLEMENT' THEN 'SITE_SETTLEMENT'
  ELSE CASE p.status
    WHEN 'SIGNED' THEN 'PENDING_START'
    WHEN 'CONSTRUCTION' THEN 'CONSTRUCTION'
    WHEN 'COMPLETED' THEN 'OWNER_SETTLEMENT'
    WHEN 'CLOSED' THEN 'SITE_SETTLEMENT'
    ELSE 'PENDING_START'
  END
END`;

const siteListStageSortExpr = `CASE COALESCE(p.site_stage, '')
  WHEN 'PENDING_START' THEN 0
  WHEN 'START_CONFIRM' THEN 1
  WHEN 'CONSTRUCTION' THEN 2
  WHEN 'OWNER_SETTLEMENT' THEN 3
  WHEN 'SITE_SETTLEMENT' THEN 4
  ELSE CASE p.status
    WHEN 'SIGNED' THEN 0
    WHEN 'CONSTRUCTION' THEN 2
    WHEN 'COMPLETED' THEN 3
    WHEN 'CLOSED' THEN 4
    ELSE 0
  END
END`;

const siteListCurrentPhaseNameExpr = `(
  SELECT phase_lookup.name
  FROM project_phases phase_lookup
  WHERE phase_lookup.project_id = p.id
    AND (
      phase_lookup.phase = p.current_phase
      OR phase_lookup.id = p.current_phase
      OR phase_lookup.name = p.current_phase
    )
  ORDER BY
    CASE
      WHEN phase_lookup.phase = p.current_phase THEN 0
      WHEN phase_lookup.id = p.current_phase THEN 1
      WHEN phase_lookup.name = p.current_phase THEN 2
      ELSE 3
    END,
    COALESCE(phase_lookup.sort_order, 999) ASC,
    datetime(COALESCE(phase_lookup.updated_at, phase_lookup.created_at, '1970-01-01')) DESC
  LIMIT 1
)`;

const siteListActivePhaseNameExpr = `(
  SELECT phase_active.name
  FROM project_phases phase_active
  WHERE phase_active.project_id = p.id
  ORDER BY
    CASE phase_active.status
      WHEN 'IN_PROGRESS' THEN 0
      WHEN 'REVIEW' THEN 1
      WHEN 'PENDING' THEN 2
      WHEN 'COMPLETED' THEN 3
      ELSE 4
    END,
    COALESCE(phase_active.sort_order, 999) ASC,
    datetime(COALESCE(phase_active.updated_at, phase_active.created_at, '1970-01-01')) DESC
  LIMIT 1
)`;

const siteListConstructionStageNameExpr = `CASE (${siteListStageExpr})
  WHEN 'PENDING_START' THEN '待开工'
  WHEN 'START_CONFIRM' THEN '开工确认'
  WHEN 'OWNER_SETTLEMENT' THEN '业主结算'
  WHEN 'SITE_SETTLEMENT' THEN '工地结算'
  WHEN 'CONSTRUCTION' THEN COALESCE(
    NULLIF(TRIM(${siteListCurrentPhaseNameExpr}), ''),
    NULLIF(TRIM(${siteListActivePhaseNameExpr}), ''),
    CASE COALESCE(p.current_phase, '')
      WHEN 'DEMOLITION' THEN '拆改'
      WHEN 'PLUMBING' THEN '水电'
      WHEN 'MASONRY' THEN '泥瓦'
      WHEN 'CARPENTRY' THEN '木工'
      WHEN 'PAINTING' THEN '油漆'
      WHEN 'INSTALLATION' THEN '安装'
      WHEN 'DECORATION' THEN '软装'
      WHEN 'INSPECTION' THEN '验收'
      ELSE '施工中'
    END
  )
  ELSE ''
END`;

const siteOpenIssueCountSql = `(SELECT COUNT(*) FROM site_inspections i WHERE i.project_id = p.id AND i.deleted_at IS NULL AND i.status != 'closed')`;

function getTrimmedSiteParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() || "";
}

function getPositiveSiteNumber(value: string | null) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function getSiteListBaseWhere() {
  return [
    "p.company_id = ?",
    "p.deleted_at IS NULL",
    "c.deleted_at IS NULL",
    "c.status = 'SIGNED'",
    `EXISTS (
      SELECT 1
      FROM contracts contract
      WHERE contract.project_id = p.id
        AND contract.deleted_at IS NULL
        AND contract.status IN ('SIGNED','RESIGNED')
    )`,
    `(p.status IN ('SIGNED','CONSTRUCTION','COMPLETED','CLOSED')
      OR p.site_stage IN ('PENDING_START','START_CONFIRM','CONSTRUCTION','OWNER_SETTLEMENT','SITE_SETTLEMENT'))`,
  ];
}

function buildSiteListWhere(searchParams: URLSearchParams, companyId: string, options: { includeStage?: boolean } = {}) {
  const includeStage = options.includeStage !== false;
  const where = getSiteListBaseWhere();
  const params: unknown[] = [companyId];
  const status = getTrimmedSiteParam(searchParams, "status");
  if (includeStage && status && status !== "all") {
    where.push(`(${siteListStageExpr}) = ?`);
    params.push(status);
  }

  const search = getTrimmedSiteParam(searchParams, "search").toLowerCase();
  if (search) {
    const like = `%${search}%`;
    where.push(`(
      lower(COALESCE(c.address, '')) LIKE ?
      OR lower(COALESCE(c.house_address, '')) LIKE ?
      OR lower(COALESCE(c.building_no, '')) LIKE ?
      OR lower(COALESCE(c.unit_no, '')) LIKE ?
      OR lower(COALESCE(c.room_no, '')) LIKE ?
      OR lower(COALESCE(p.name, '')) LIKE ?
      OR lower(COALESCE(p.address, '')) LIKE ?
      OR lower(COALESCE(c.name, '')) LIKE ?
      OR lower(COALESCE(p.finance_no, '')) LIKE ?
      OR lower(COALESCE(c.service_store, '')) LIKE ?
      OR lower(COALESCE(u.name, '')) LIKE ?
      OR EXISTS (
        SELECT 1
        FROM contracts contract_search
        WHERE contract_search.project_id = p.id
          AND contract_search.deleted_at IS NULL
          AND contract_search.status IN ('SIGNED','RESIGNED')
          AND lower(COALESCE(contract_search.contract_no, '')) LIKE ?
      )
    )`);
    params.push(like, like, like, like, like, like, like, like, like, like, like, like);
  }

  const store = getTrimmedSiteParam(searchParams, "store");
  const manager = getTrimmedSiteParam(searchParams, "manager");
  if (store) {
    where.push("COALESCE(c.service_store, '') = ?");
    params.push(store);
  }
  if (manager) {
    where.push("COALESCE(u.name, '') = ?");
    params.push(manager);
  }
  const constructionStage = getTrimmedSiteParam(searchParams, "constructionStage");
  if (constructionStage) {
    where.push(`(${siteListConstructionStageNameExpr}) = ?`);
    params.push(constructionStage);
  }

  const progressMin = getPositiveSiteNumber(searchParams.get("progressMin"));
  const progressMax = getPositiveSiteNumber(searchParams.get("progressMax"));
  const areaMin = getPositiveSiteNumber(searchParams.get("areaMin"));
  const areaMax = getPositiveSiteNumber(searchParams.get("areaMax"));
  const amountMin = getPositiveSiteNumber(searchParams.get("amountMin"));
  const amountMax = getPositiveSiteNumber(searchParams.get("amountMax"));
  if (progressMin !== null) {
    where.push("COALESCE(p.progress, 0) >= ?");
    params.push(progressMin);
  }
  if (progressMax !== null) {
    where.push("COALESCE(p.progress, 0) <= ?");
    params.push(progressMax);
  }
  if (areaMin !== null) {
    where.push("COALESCE(p.area, 0) >= ?");
    params.push(areaMin);
  }
  if (areaMax !== null) {
    where.push("COALESCE(p.area, 0) <= ?");
    params.push(areaMax);
  }
  if (amountMin !== null) {
    where.push("COALESCE(p.contract_amount, 0) >= ?");
    params.push(amountMin);
  }
  if (amountMax !== null) {
    where.push("COALESCE(p.contract_amount, 0) <= ?");
    params.push(amountMax);
  }

  const plannedEndFrom = getTrimmedSiteParam(searchParams, "plannedEndFrom");
  const plannedEndTo = getTrimmedSiteParam(searchParams, "plannedEndTo");
  if (plannedEndFrom) {
    where.push("date(p.planned_end_date) >= date(?)");
    params.push(plannedEndFrom);
  }
  if (plannedEndTo) {
    where.push("date(p.planned_end_date) <= date(?)");
    params.push(plannedEndTo);
  }

  const overdueSql = "p.planned_end_date IS NOT NULL AND date(p.planned_end_date) < date('now', '+8 hours')";
  const hasIssueSql = `${siteOpenIssueCountSql} > 0`;
  const risk = getTrimmedSiteParam(searchParams, "risk");
  if (risk === "issue") where.push(`(${hasIssueSql})`);
  if (risk === "overdue") where.push(`(${overdueSql}) AND NOT (${hasIssueSql})`);
  if (risk === "normal") where.push(`NOT (${hasIssueSql}) AND NOT (${overdueSql})`);

  return { where: where.join(" AND "), params };
}

function getSiteListSql(whereSql: string, limitSql = "") {
  return `
    SELECT p.id, p.name, p.address, p.area, p.status, p.contract_amount,
      p.start_date, p.planned_end_date, p.progress, p.site_stage, p.current_phase,
      p.updated_at, p.finance_no,
      c.name as customer_name, c.address as customer_address,
      c.address_location_name as customer_address_location_name,
      c.address_location_address as customer_address_location_address,
      c.address_latitude as customer_address_latitude,
      c.address_longitude as customer_address_longitude,
      c.house_address as customer_house_address, c.building_no as customer_building_no,
      c.unit_no as customer_unit_no, c.room_no as customer_room_no,
      c.no_room_number as customer_no_room_number, c.service_store,
      CASE
        WHEN TRIM(COALESCE(c.service_store, '')) = '' THEN 1
        WHEN EXISTS (
          SELECT 1 FROM org_units store
          WHERE store.deleted_at IS NULL AND TRIM(COALESCE(store.name, '')) = TRIM(c.service_store)
        ) THEN (
          SELECT MAX(COALESCE(store.is_active, 1))
          FROM org_units store
          WHERE store.deleted_at IS NULL AND TRIM(COALESCE(store.name, '')) = TRIM(c.service_store)
        )
        ELSE 1
      END as service_store_is_active,
      u.name as manager_name, u.avatar as manager_avatar,
      ${siteListCurrentPhaseNameExpr} as current_phase_name,
      ${siteListActivePhaseNameExpr} as active_phase_name,
      ${siteListConstructionStageNameExpr} as construction_stage_name,
      (
        SELECT contract.contract_no
        FROM contracts contract
        WHERE contract.project_id = p.id
          AND contract.deleted_at IS NULL
          AND contract.status IN ('SIGNED','RESIGNED')
        ORDER BY datetime(COALESCE(contract.signed_at, contract.updated_at, contract.created_at)) DESC, contract.id DESC
        LIMIT 1
      ) as contract_no,
      (
        SELECT COUNT(*)
        FROM contracts contract_count
        WHERE contract_count.project_id = p.id
          AND contract_count.deleted_at IS NULL
          AND contract_count.status IN ('SIGNED','RESIGNED')
      ) as contract_count,
      (
        SELECT designer.name
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ) as designer_name,
      (
        SELECT designer.avatar
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ) as designer_avatar,
      COALESCE(c.decoration_type, p.construction_template_decoration_type, p.style) as site_type,
      (
        SELECT event.node_name
        FROM site_node_events event
        WHERE event.project_id = p.id
          AND TRIM(COALESCE(event.node_name, '')) != ''
        ORDER BY datetime(event.created_at) DESC, event.id DESC
        LIMIT 1
      ) as latest_construction_node,
      (
        SELECT MAX(event.created_at)
        FROM site_node_events event
        WHERE event.project_id = p.id
          AND UPPER(COALESCE(event.event_type, '')) LIKE 'REPORT%'
      ) as latest_report_at,
      (
        SELECT duration_days
        FROM site_start_handovers handover
        WHERE handover.project_id = p.id
          AND handover.deleted_at IS NULL
          AND COALESCE(handover.duration_days, 0) > 0
        ORDER BY datetime(COALESCE(handover.completed_at, handover.updated_at, handover.created_at)) DESC, handover.id DESC
        LIMIT 1
      ) as handover_duration_days,
      (
        SELECT CASE
          WHEN json_valid(COALESCE(contract.content, '')) THEN CAST(COALESCE(
            json_extract(contract.content, '$.project_info.duration_days'),
            json_extract(contract.content, '$.document_snapshot.variables.project.duration_days')
          ) AS INTEGER)
          ELSE NULL
        END
        FROM contracts contract
        WHERE contract.project_id = p.id
          AND contract.deleted_at IS NULL
          AND contract.status IN ('SIGNED','RESIGNED')
        ORDER BY datetime(COALESCE(contract.signed_at, contract.updated_at, contract.created_at)) DESC, contract.id DESC
        LIMIT 1
      ) as contract_duration_days,
      (
        SELECT COUNT(*)
        FROM site_cameras camera
        WHERE camera.project_id = p.id
          AND camera.company_id = p.company_id
          AND camera.deleted_at IS NULL
          AND COALESCE(camera.status, 'active') = 'active'
      ) as active_camera_count,
      (
        SELECT COUNT(*)
        FROM tasks record_task
        WHERE record_task.project_id = p.id
          AND record_task.deleted_at IS NULL
          AND UPPER(COALESCE(record_task.status, 'PENDING')) IN ('IN_PROGRESS','REVIEW','COMPLETED')
          AND (
            COALESCE(record_task.notes, '') IN ('施工节点','验收节点')
            OR EXISTS (
              SELECT 1
              FROM site_node_events record_event
              WHERE record_event.project_id = record_task.project_id
                AND record_event.source_type = 'task'
                AND record_event.source_id = record_task.id
            )
          )
      ) as construction_record_count,
      ${siteOpenIssueCountSql} as open_issue_count,
      ${siteListStageExpr} as normalized_site_stage
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON p.manager_id = u.id
    WHERE ${whereSql}
    ORDER BY ${siteListStageSortExpr}, p.updated_at DESC, p.id DESC
    ${limitSql}
  `;
}

function getSiteListCounts(db: ReturnType<typeof getDb>, searchParams: URLSearchParams, companyId: string) {
  const base = buildSiteListWhere(searchParams, companyId, { includeStage: false });
  const stageCountsSql = siteStages
    .map((stage) => `SUM(CASE WHEN (${siteListStageExpr}) = '${stage}' THEN 1 ELSE 0 END) as ${stage}`)
    .join(",\n      ");
  const row = db.prepare(`
    SELECT COUNT(*) as total,
      ${stageCountsSql}
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON p.manager_id = u.id
    WHERE ${base.where}
  `).get(...base.params) as Record<string, number | null | undefined>;

  return siteStages.reduce<Record<string, number>>((counts, stage) => {
    counts[stage] = Number(row?.[stage] || 0);
    return counts;
  }, { all: Number(row?.total || 0) });
}

function getSiteListConstructionStageOptions(db: ReturnType<typeof getDb>, searchParams: URLSearchParams, companyId: string) {
  const base = buildSiteListWhere(searchParams, companyId, { includeStage: false });
  return (db.prepare(`
    SELECT (${siteListConstructionStageNameExpr}) as value,
      COUNT(*) as count,
      MIN(${siteListStageSortExpr}) as stage_sort
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON p.manager_id = u.id
    WHERE ${base.where}
    GROUP BY value
    HAVING value IS NOT NULL AND TRIM(value) != ''
    ORDER BY stage_sort ASC, count DESC, value ASC
  `).all(...base.params) as { value: string; count: number }[])
    .map((item) => ({
      value: String(item.value || "").trim(),
      label: String(item.value || "").trim(),
      count: Number(item.count || 0),
    }))
    .filter((item) => item.value);
}

function getSiteListOptions(db: ReturnType<typeof getDb>, companyId: string) {
  const baseWhere = getSiteListBaseWhere().join(" AND ");
  const storeOptions = (db.prepare(`
    SELECT DISTINCT TRIM(c.service_store) as value
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON p.manager_id = u.id
    WHERE ${baseWhere}
      AND c.service_store IS NOT NULL
      AND TRIM(c.service_store) != ''
    ORDER BY value
  `).all(companyId) as { value: string }[]).map((item) => item.value).filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  const managerOptions = (db.prepare(`
    SELECT DISTINCT TRIM(u.name) as value
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON p.manager_id = u.id
    WHERE ${baseWhere}
      AND u.name IS NOT NULL
      AND TRIM(u.name) != ''
    ORDER BY value
  `).all(companyId) as { value: string }[]).map((item) => item.value).filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  return { storeOptions, managerOptions };
}

function getSiteListMetaData(db: ReturnType<typeof getDb>, searchParams: URLSearchParams, companyId: string) {
  return {
    statusCounts: getSiteListCounts(db, searchParams, companyId),
    constructionStageOptions: getSiteListConstructionStageOptions(db, searchParams, companyId),
    ...getSiteListOptions(db, companyId),
  };
}

function getPagedSiteList(req: NextRequest, companyId: string) {
  const db = getDb();
  ensureSiteTables(db);
  ensureSiteFinanceNumbers(db, companyId);
  const searchParams = req.nextUrl.searchParams;
  const includeMeta = searchParams.get("includeMeta") !== "0";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(Math.max(1, Number(searchParams.get("pageSize") || 20) || 20), 200);
  const offset = (page - 1) * pageSize;
  const filters = buildSiteListWhere(searchParams, companyId);
  const total = Number((db.prepare(`
    SELECT COUNT(*) as total
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON p.manager_id = u.id
    WHERE ${filters.where}
  `).get(...filters.params) as { total?: number })?.total || 0);
  const rows = db.prepare(getSiteListSql(filters.where, "LIMIT ? OFFSET ?")).all(...filters.params, pageSize, offset) as any[];
  const projects = rows.map((project) => {
    const siteName = getSiteDisplayName(project);
    const siteStage = project.normalized_site_stage || normalizeSiteStage(project);
    return {
      ...project,
      site_stage: siteStage,
      construction_stage_name: getSiteListConstructionStageName(project, siteStage),
      site_name: siteName,
      display_name: siteName,
    };
  });
  const meta = includeMeta ? getSiteListMetaData(db, searchParams, companyId) : null;
  return NextResponse.json({
    projects,
    total,
    page,
    pageSize,
    statusCounts: meta?.statusCounts || {},
    constructionStageOptions: meta?.constructionStageOptions || [],
    storeOptions: meta?.storeOptions || [],
    managerOptions: meta?.managerOptions || [],
  });
}

function getSiteListMeta(req: NextRequest, companyId: string) {
  const db = getDb();
  ensureSiteTables(db);
  ensureSiteFinanceNumbers(db, companyId);
  return NextResponse.json(getSiteListMetaData(db, req.nextUrl.searchParams, companyId));
}

function getConstructionRecordList(req: NextRequest, auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  const db = getDb();
  ensureSiteTables(db);
  const projectId = String(req.nextUrl.searchParams.get("project_id") || "").trim();
  if (!projectId) return NextResponse.json({ message: "缺少项目 ID" }, { status: 400 });
  if (!projectBelongsToCompany(auth, projectId)) return NextResponse.json({ message: "工地不存在" }, { status: 404 });

  const project = db.prepare(`
    SELECT p.id, p.name, p.address, p.progress, p.site_stage, p.current_phase,
      c.name as customer_name, c.address as customer_address, c.house_address as customer_house_address,
      c.building_no as customer_building_no, c.unit_no as customer_unit_no, c.room_no as customer_room_no,
      c.no_room_number as customer_no_room_number,
      manager.name as manager_name
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users manager ON manager.id = p.manager_id
    WHERE p.id = ? AND p.deleted_at IS NULL AND c.deleted_at IS NULL
    LIMIT 1
  `).get(projectId) as any;
  if (!project) return NextResponse.json({ message: "工地不存在" }, { status: 404 });

  const rows = db.prepare(`
    SELECT
      task.id,
      task.name as node_name,
      COALESCE(task.notes, '施工节点') as node_type_label,
      COALESCE(task.status, 'PENDING') as status,
      task.planned_start,
      task.planned_end,
      task.actual_start,
      task.actual_end,
      phase.id as phase_id,
      phase.phase as stage_id,
      phase.name as stage_name,
      (
        SELECT COUNT(DISTINCT COALESCE(NULLIF(event.source_id, ''), event.id))
        FROM site_node_events event
        LEFT JOIN users operator ON operator.id = event.operator_id
        WHERE event.project_id = task.project_id
          AND UPPER(COALESCE(event.event_type, '')) LIKE 'REPORT%'
          AND (
            event.source_id = task.id
            OR (TRIM(COALESCE(event.node_name, '')) != '' AND TRIM(event.node_name) = TRIM(task.name))
          )
          AND TRIM(COALESCE(operator.name, '')) = TRIM(COALESCE(manager.name, ''))
      ) as manager_report_count,
      (
        SELECT COUNT(DISTINCT COALESCE(NULLIF(event.source_id, ''), event.id))
        FROM site_node_events event
        LEFT JOIN users operator ON operator.id = event.operator_id
        WHERE event.project_id = task.project_id
          AND UPPER(COALESCE(event.event_type, '')) LIKE 'REPORT%'
          AND (
            event.source_id = task.id
            OR (TRIM(COALESCE(event.node_name, '')) != '' AND TRIM(event.node_name) = TRIM(task.name))
          )
          AND (
            TRIM(COALESCE(operator.name, '')) != TRIM(COALESCE(manager.name, ''))
            OR TRIM(COALESCE(manager.name, '')) = ''
          )
      ) as worker_report_count,
      (
        SELECT GROUP_CONCAT(name, '/')
        FROM (
          SELECT DISTINCT TRIM(operator.name) as name
          FROM site_node_events event
          LEFT JOIN users operator ON operator.id = event.operator_id
          WHERE event.project_id = task.project_id
            AND UPPER(COALESCE(event.event_type, '')) LIKE 'REPORT%'
            AND (
              event.source_id = task.id
              OR (TRIM(COALESCE(event.node_name, '')) != '' AND TRIM(event.node_name) = TRIM(task.name))
            )
            AND TRIM(COALESCE(operator.name, '')) != ''
            AND TRIM(COALESCE(operator.name, '')) != TRIM(COALESCE(manager.name, ''))
          ORDER BY name
        )
      ) as worker_names,
      (
        SELECT COUNT(*)
        FROM site_node_events event
        WHERE event.project_id = task.project_id
          AND UPPER(COALESCE(event.event_type, '')) LIKE 'ISSUE%'
          AND (
            event.source_id = task.id
            OR (TRIM(COALESCE(event.node_name, '')) != '' AND TRIM(event.node_name) = TRIM(task.name))
          )
      ) as issue_count,
      (
        SELECT MAX(event.created_at)
        FROM site_node_events event
        WHERE event.project_id = task.project_id
          AND (
            event.source_id = task.id
            OR (TRIM(COALESCE(event.node_name, '')) != '' AND TRIM(event.node_name) = TRIM(task.name))
          )
      ) as latest_record_at
    FROM tasks task
    LEFT JOIN project_phases phase ON phase.id = task.phase_id
    LEFT JOIN projects p ON p.id = task.project_id
    LEFT JOIN users manager ON manager.id = p.manager_id
    WHERE task.project_id = ?
      AND task.deleted_at IS NULL
      AND UPPER(COALESCE(task.status, 'PENDING')) IN ('IN_PROGRESS','REVIEW','COMPLETED')
      AND (
        COALESCE(task.notes, '') IN ('施工节点','验收节点')
        OR EXISTS (
          SELECT 1
          FROM site_node_events task_event
          WHERE task_event.project_id = task.project_id
            AND task_event.source_type = 'task'
            AND task_event.source_id = task.id
        )
      )
    ORDER BY COALESCE(phase.sort_order, 9999) ASC, datetime(COALESCE(task.actual_start, task.updated_at, task.created_at)) ASC, task.id ASC
  `).all(projectId) as any[];
  const reportEvents = db.prepare(`
    SELECT event.id, event.node_name, event.stage_name, event.title, event.content, event.created_at,
      event.source_id,
      operator.name as operator_name,
      log.id as log_id, log.completed_work, log.next_plan, log.location_name
    FROM site_node_events event
    LEFT JOIN users operator ON operator.id = event.operator_id
    LEFT JOIN daily_logs log ON event.source_type = 'daily_log' AND log.id = event.source_id
    WHERE event.project_id = ?
      AND UPPER(COALESCE(event.event_type, '')) LIKE 'REPORT%'
    ORDER BY datetime(event.created_at) DESC, event.id DESC
  `).all(projectId) as any[];
  const reportLogIds = Array.from(new Set(reportEvents.map((event) => String(event.log_id || "").trim()).filter(Boolean)));
  let reportsWithPhotos = reportEvents;
  if (reportLogIds.length > 0) {
    const reportPhotos = db.prepare(`
      SELECT *
      FROM daily_log_photos
      WHERE log_id IN (${reportLogIds.map(() => "?").join(",")})
      ORDER BY log_id, sort_order ASC, created_at ASC
    `).all(...reportLogIds) as any[];
    const photosByLogId = reportPhotos.reduce((map: Record<string, any[]>, photo) => {
      const logId = String(photo.log_id || "").trim();
      if (!logId) return map;
      if (!map[logId]) map[logId] = [];
      map[logId].push(photo);
      return map;
    }, {});
    reportsWithPhotos = reportEvents.map((event) => ({ ...event, photos: photosByLogId[String(event.log_id || "").trim()] || [] }));
  }
  const managerName = String(project.manager_name || "").trim();
  const rowsWithReports = rows.map((row) => {
    const nodeName = String(row.node_name || "").trim();
    const matchedReports = reportsWithPhotos.filter((event) => String(event.node_name || "").trim() === nodeName);
    const managerReports = managerName
      ? matchedReports.filter((event) => String(event.operator_name || "").trim() === managerName)
      : [];
    const workerReports = managerName
      ? matchedReports.filter((event) => String(event.operator_name || "").trim() !== managerName)
      : matchedReports;
    return {
      ...row,
      manager_report_count: managerReports.length,
      worker_report_count: workerReports.length,
      manager_reports: managerReports,
      worker_reports: workerReports,
    };
  });

  return NextResponse.json({
    project: {
      ...project,
      site_stage: normalizeSiteStage(project),
      display_name: getSiteDisplayName(project),
    },
    rows: rowsWithReports,
  });
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有工地查看权限" }, { status: 403 });
  if (req.nextUrl.searchParams.get("mode") === "construction-record-list") {
    return getConstructionRecordList(req, auth);
  }
  if (req.nextUrl.searchParams.get("mode") === "list-meta") {
    return getSiteListMeta(req, auth.companyId);
  }
  if (req.nextUrl.searchParams.get("mode") === "list" || req.nextUrl.searchParams.has("page")) {
    return getPagedSiteList(req, auth.companyId);
  }

  const db = getDb();
  ensureSiteTables(db);
  if (req.nextUrl.searchParams.get("mode") === "node-records") {
    const projectId = String(req.nextUrl.searchParams.get("project_id") || "").trim();
    if (!projectId) return NextResponse.json({ message: "缺少项目 ID" }, { status: 400 });
    if (!projectBelongsToCompany(auth, projectId)) return NextResponse.json({ message: "工地不存在" }, { status: 404 });
    const events = db.prepare(`
      SELECT event.*, operator.name as operator_name, operator.avatar as operator_avatar
      FROM site_node_events event
      LEFT JOIN users operator ON operator.id = event.operator_id
      WHERE event.project_id = ?
      ORDER BY datetime(event.created_at) DESC, event.id DESC
      LIMIT 1000
    `).all(projectId);
    let projectLogs = db.prepare(`
      SELECT log.*, author.name as author_name
      FROM daily_logs log
      LEFT JOIN users author ON author.id = log.author_id
      WHERE log.project_id = ? AND log.deleted_at IS NULL
      ORDER BY datetime(COALESCE(log.created_at, log.log_date)) DESC, log.id DESC
      LIMIT 500
    `).all(projectId) as any[];
    if (projectLogs.length > 0) {
      const logIds = projectLogs.map((log) => log.id);
      const photos = db.prepare(`
        SELECT *
        FROM daily_log_photos
        WHERE log_id IN (${logIds.map(() => "?").join(",")})
        ORDER BY log_id, sort_order ASC, created_at ASC
      `).all(...logIds) as any[];
      const photosByLogId = photos.reduce((map: Record<string, any[]>, photo) => {
        if (!map[photo.log_id]) map[photo.log_id] = [];
        map[photo.log_id].push(photo);
        return map;
      }, {});
      projectLogs = projectLogs.map((log) => ({ ...log, photos: photosByLogId[log.id] || [] }));
    }
    const projectInspections = db.prepare(`
      SELECT inspection.*, assignee.name as assignee_name
      FROM site_inspections inspection
      LEFT JOIN users assignee ON assignee.id = inspection.assignee_id
      WHERE inspection.project_id = ? AND inspection.deleted_at IS NULL
      ORDER BY datetime(inspection.created_at) DESC, inspection.id DESC
      LIMIT 500
    `).all(projectId);
    return NextResponse.json({ items: events, logs: projectLogs, inspections: projectInspections });
  }

  let projects = db.prepare(`
    SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.weixin as customer_weixin,
      c.address as customer_address, c.house_address as customer_house_address,
      c.address_location_name as customer_address_location_name,
      c.address_location_address as customer_address_location_address,
      c.address_latitude as customer_address_latitude,
      c.address_longitude as customer_address_longitude,
      c.building_no as customer_building_no, c.unit_no as customer_unit_no,
      c.room_no as customer_room_no, c.no_room_number as customer_no_room_number,
      c.area as customer_area, c.area_size as customer_area_size, c.service_store,
      CASE
        WHEN TRIM(COALESCE(c.service_store, '')) = '' THEN 1
        WHEN EXISTS (
          SELECT 1 FROM org_units store
          WHERE store.deleted_at IS NULL AND TRIM(COALESCE(store.name, '')) = TRIM(c.service_store)
        ) THEN (
          SELECT MAX(COALESCE(store.is_active, 1))
          FROM org_units store
          WHERE store.deleted_at IS NULL AND TRIM(COALESCE(store.name, '')) = TRIM(c.service_store)
        )
        ELSE 1
      END as service_store_is_active,
      c.source as customer_source, c.budget as customer_budget, c.intention as customer_intention,
      c.is_delivered as customer_is_delivered, c.created_at as customer_created_at,
      creator.name as customer_created_by_name, creator.avatar as customer_created_by_avatar,
      inviter.name as customer_inviter_name, inviter.avatar as customer_inviter_avatar,
      (
        SELECT advisor.name
        FROM customer_team advisor_team
        LEFT JOIN users advisor ON advisor.id = advisor_team.user_id
        WHERE advisor_team.customer_id = c.id
          AND UPPER(advisor_team.role) = 'ADVISOR'
        ORDER BY datetime(COALESCE(advisor_team.assigned_at, '1970-01-01')) DESC, advisor_team.id DESC
        LIMIT 1
      ) as customer_advisor_name,
      (
        SELECT advisor.avatar
        FROM customer_team advisor_team
        LEFT JOIN users advisor ON advisor.id = advisor_team.user_id
        WHERE advisor_team.customer_id = c.id
          AND UPPER(advisor_team.role) = 'ADVISOR'
        ORDER BY datetime(COALESCE(advisor_team.assigned_at, '1970-01-01')) DESC, advisor_team.id DESC
        LIMIT 1
      ) as customer_advisor_avatar,
      c.house_type, c.decoration_type, c.requirements as customer_requirements, c.remarks as customer_remarks,
      company.name as company_name, company.logo as company_logo,
      u.name as manager_name, u.avatar as manager_avatar, u.phone as manager_phone,
      manager_org.name as manager_org_unit_name, manager_org.type as manager_org_unit_type,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) as task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status IN ('COMPLETED','SKIPPED')) as completed_task_count,
      (SELECT COUNT(*) FROM site_inspections i WHERE i.project_id = p.id AND i.deleted_at IS NULL AND i.status != 'closed') as open_issue_count,
      (SELECT COUNT(*) FROM daily_logs d WHERE d.project_id = p.id) as log_count,
      (SELECT MAX(log_date) FROM daily_logs d WHERE d.project_id = p.id) as latest_log_date,
      (SELECT COUNT(*) FROM material_requisitions mr WHERE mr.project_id = p.id) as material_acceptance_count,
      (SELECT COUNT(*) FROM material_orders mo WHERE mo.project_id = p.id AND mo.deleted_at IS NULL) as material_order_count,
      (SELECT COALESCE(SUM(mo.total_amount), 0) FROM material_orders mo WHERE mo.project_id = p.id AND mo.deleted_at IS NULL) as material_order_amount,
      (SELECT COUNT(*) FROM site_checkin_records scr WHERE scr.project_id = p.id AND scr.deleted_at IS NULL) as checkin_count,
      (SELECT COUNT(DISTINCT COALESCE(NULLIF(scr.user_id, ''), NULLIF(scr.phone, ''), scr.person_name)) FROM site_checkin_records scr WHERE scr.project_id = p.id AND scr.deleted_at IS NULL) as checkin_person_count,
      (SELECT MAX(scr.signed_at) FROM site_checkin_records scr WHERE scr.project_id = p.id AND scr.deleted_at IS NULL) as latest_checkin_at,
      (SELECT status FROM site_start_handovers h WHERE h.project_id = p.id AND h.deleted_at IS NULL ORDER BY h.updated_at DESC LIMIT 1) as handover_status,
      (SELECT completed_at FROM site_start_handovers h WHERE h.project_id = p.id AND h.deleted_at IS NULL ORDER BY h.updated_at DESC LIMIT 1) as handover_completed_at,
      (
        SELECT duration_days
        FROM site_start_handovers handover
        WHERE handover.project_id = p.id
          AND handover.deleted_at IS NULL
          AND COALESCE(handover.duration_days, 0) > 0
        ORDER BY datetime(COALESCE(handover.completed_at, handover.updated_at, handover.created_at)) DESC, handover.id DESC
        LIMIT 1
      ) as handover_duration_days,
      (
        SELECT CASE
          WHEN json_valid(COALESCE(contract.content, '')) THEN CAST(COALESCE(
            json_extract(contract.content, '$.project_info.duration_days'),
            json_extract(contract.content, '$.document_snapshot.variables.project.duration_days')
          ) AS INTEGER)
          ELSE NULL
        END
        FROM contracts contract
        WHERE contract.project_id = p.id
          AND contract.deleted_at IS NULL
          AND contract.status IN ('SIGNED','RESIGNED')
        ORDER BY datetime(COALESCE(contract.signed_at, contract.updated_at, contract.created_at)) DESC, contract.id DESC
        LIMIT 1
      ) as contract_duration_days
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    LEFT JOIN companies company ON p.company_id = company.id
    LEFT JOIN users u ON p.manager_id = u.id
    LEFT JOIN users creator ON c.created_by_id = creator.id
    LEFT JOIN users inviter ON c.inviter_id = inviter.id
    LEFT JOIN org_units manager_org ON u.org_unit_id = manager_org.id AND manager_org.deleted_at IS NULL
    WHERE p.company_id = ?
      AND p.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND c.status = 'SIGNED'
      AND EXISTS (
        SELECT 1
        FROM contracts contract
        WHERE contract.project_id = p.id
          AND contract.deleted_at IS NULL
          AND contract.status IN ('SIGNED','RESIGNED')
      )
      AND (
        p.status IN ('SIGNED','CONSTRUCTION','COMPLETED','CLOSED')
        OR p.site_stage IN ('PENDING_START','START_CONFIRM','CONSTRUCTION','OWNER_SETTLEMENT','SITE_SETTLEMENT')
      )
    ORDER BY CASE COALESCE(p.site_stage, '')
      WHEN 'PENDING_START' THEN 0
      WHEN 'START_CONFIRM' THEN 1
      WHEN 'CONSTRUCTION' THEN 2
      WHEN 'OWNER_SETTLEMENT' THEN 3
      WHEN 'SITE_SETTLEMENT' THEN 4
      ELSE CASE p.status WHEN 'SIGNED' THEN 0 WHEN 'CONSTRUCTION' THEN 2 WHEN 'COMPLETED' THEN 3 WHEN 'CLOSED' THEN 4 ELSE 5 END
    END, p.updated_at DESC
  `).all(auth.companyId) as any[];

  projects = projects.map((project) => {
    const siteName = getSiteDisplayName(project);
    return {
      ...project,
      site_stage: normalizeSiteStage(project),
      site_name: siteName,
      display_name: siteName,
    };
  });

  const projectIds = projects.map((project) => project.id);
  const checkinCodes = projectIds.map((projectId) => getOrCreateSiteCheckinCode(db, projectId));
  const customerIds = Array.from(new Set(projects.map((project) => project.customer_id).filter(Boolean)));
  const companyIds = Array.from(new Set(projects.map((project) => project.company_id).filter(Boolean)));
  const phases = projectIds.length
    ? db.prepare(`
        SELECT *
        FROM project_phases
        WHERE project_id IN (${projectIds.map(() => "?").join(",")})
        ORDER BY project_id, sort_order
      `).all(...projectIds)
    : [];
  const tasks = projectIds.length
    ? db.prepare(`
        SELECT t.*, u.name as assignee_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id = u.id
        WHERE t.project_id IN (${projectIds.map(() => "?").join(",")}) AND t.deleted_at IS NULL
        ORDER BY CASE t.status WHEN 'PENDING' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'REVIEW' THEN 2 ELSE 3 END, t.planned_end
      `).all(...projectIds)
    : [];
  let logs = projectIds.length
    ? db.prepare(`
        SELECT d.*, u.name as author_name
        FROM daily_logs d
        LEFT JOIN users u ON d.author_id = u.id
        WHERE d.project_id IN (${projectIds.map(() => "?").join(",")})
          AND d.deleted_at IS NULL
        ORDER BY d.log_date DESC, d.created_at DESC, d.id DESC
        LIMIT 80
      `).all(...projectIds) as any[]
    : [];
  if (logs.length > 0) {
    const logIds = logs.map((log: any) => log.id);
    const photos = db.prepare(`
      SELECT *
      FROM daily_log_photos
      WHERE log_id IN (${logIds.map(() => "?").join(",")})
      ORDER BY log_id, sort_order ASC, created_at ASC
    `).all(...logIds) as any[];
    const photosByLogId = photos.reduce((acc: Record<string, any[]>, photo: any) => {
      if (!acc[photo.log_id]) acc[photo.log_id] = [];
      acc[photo.log_id].push(photo);
      return acc;
    }, {});
    logs = logs.map((log: any) => ({ ...log, photos: photosByLogId[log.id] || [] }));
  }
  const inspections = projectIds.length
    ? db.prepare(`
        SELECT i.*, u.name as assignee_name
        FROM site_inspections i
        LEFT JOIN users u ON i.assignee_id = u.id
        WHERE i.project_id IN (${projectIds.map(() => "?").join(",")}) AND i.deleted_at IS NULL
        ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END, i.due_date
      `).all(...projectIds)
    : [];
  const handovers = projectIds.length
    ? db.prepare(`
        SELECT h.*, u.name as created_by_name
        FROM site_start_handovers h
        LEFT JOIN users u ON h.created_by = u.id
        WHERE h.project_id IN (${projectIds.map(() => "?").join(",")}) AND h.deleted_at IS NULL
        ORDER BY h.updated_at DESC
      `).all(...projectIds)
    : [];
  const contracts = projectIds.length
    ? (db.prepare(`
        SELECT c.*, creator.name as created_by_name
        FROM contracts c
        LEFT JOIN users creator ON c.created_by_id = creator.id
        WHERE c.project_id IN (${projectIds.map(() => "?").join(",")}) AND c.deleted_at IS NULL
        ORDER BY CASE c.status WHEN 'SIGNED' THEN 0 WHEN 'PENDING_APPROVAL' THEN 1 WHEN 'REJECTED' THEN 2 WHEN 'DRAFT' THEN 3 WHEN 'RESIGNED' THEN 4 ELSE 5 END,
          c.updated_at DESC, c.created_at DESC
      `).all(...projectIds) as any[]).map((contract) => ({ ...contract, content: parseContent(contract.content) }))
    : [];
  const quotations = projectIds.length
    ? db.prepare(`
        SELECT q.*, creator.name as created_by_name,
          p.customer_id, p.name as project_name, p.address as project_address,
          (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = q.id) as item_count
        FROM quotations q
        LEFT JOIN projects p ON q.project_id = p.id
        LEFT JOIN users creator ON q.created_by_id = creator.id
        WHERE q.project_id IN (${projectIds.map(() => "?").join(",")})
          AND q.deleted_at IS NULL
        ORDER BY CASE WHEN UPPER(q.status) = 'APPROVED' THEN 0 ELSE 1 END,
          q.updated_at DESC, q.created_at DESC
      `).all(...projectIds)
    : [];
  const quotationIds = (quotations as any[]).map((quotation) => quotation.id);
  const quotationItems = quotationIds.length
    ? db.prepare(`
        SELECT qi.*, q.project_id
        FROM quotation_items qi
        INNER JOIN quotations q ON q.id = qi.quotation_id
        WHERE qi.quotation_id IN (${quotationIds.map(() => "?").join(",")})
        ORDER BY qi.quotation_id, qi.sort_order ASC, qi.created_at ASC
      `).all(...quotationIds)
    : [];
  const signedQuotationIdsForCost = new Set(
    (contracts as any[])
      .map((contract) => {
        const content = contract.content || {};
        return String(content?.amount_info?.quotation_id || content?.quotation_id || "").trim();
      })
      .filter(Boolean)
  );
  const costSnapshotSourceQuotationIds = (quotations as any[])
    .filter((quotation) => String(quotation.project_id || "").trim() && (
      String(quotation.status || "").toUpperCase() === "APPROVED" ||
      signedQuotationIdsForCost.has(String(quotation.id || ""))
    ))
    .map((quotation) => quotation.id);
  if (costSnapshotSourceQuotationIds.length > 0) {
    const existingSnapshotRows = db.prepare(`
      SELECT quotation_id
      FROM project_cost_snapshots
      WHERE quotation_id IN (${costSnapshotSourceQuotationIds.map(() => "?").join(",")})
        AND deleted_at IS NULL
    `).all(...costSnapshotSourceQuotationIds) as { quotation_id: string }[];
    const existingSnapshotQuotationIds = new Set(existingSnapshotRows.map((row) => String(row.quotation_id || "")));
    costSnapshotSourceQuotationIds
      .filter((quotationId) => !existingSnapshotQuotationIds.has(String(quotationId || "")))
      .forEach((quotationId) => syncProjectCostSnapshotForQuotation(db, String(quotationId)));
  }
  const paymentPlans = projectIds.length
    ? db.prepare(`
        SELECT *
        FROM payment_plans
        WHERE project_id IN (${projectIds.map(() => "?").join(",")})
        ORDER BY project_id, contract_id, sort_order ASC, created_at ASC
      `).all(...projectIds)
    : [];
  const paymentPlanIds = (paymentPlans as any[]).map((plan) => plan.id);
  const paymentRecords = paymentPlanIds.length
    ? db.prepare(`
        SELECT pr.*, u.name as user_name
        FROM payment_records pr
        LEFT JOIN users u ON pr.user_id = u.id
        WHERE pr.payment_plan_id IN (${paymentPlanIds.map(() => "?").join(",")})
        ORDER BY pr.pay_date DESC, pr.created_at DESC
      `).all(...paymentPlanIds)
    : [];
  const depositRecords = customerIds.length
    ? db.prepare(`
        SELECT d.*, creator.name as created_by_name
        FROM customer_deposit_records d
        LEFT JOIN users creator ON d.created_by_id = creator.id
        WHERE d.customer_id IN (${customerIds.map(() => "?").join(",")})
          AND d.deleted_at IS NULL
          AND COALESCE(d.status, 'received') <> 'rejected'
          AND COALESCE(d.record_type, 'deposit') = 'deposit'
        ORDER BY d.received_at DESC, d.created_at DESC
      `).all(...customerIds)
    : [];
  const designFeeRecords = customerIds.length
    ? db.prepare(`
        SELECT d.*, creator.name as created_by_name
        FROM customer_deposit_records d
        LEFT JOIN users creator ON d.created_by_id = creator.id
        WHERE d.customer_id IN (${customerIds.map(() => "?").join(",")})
          AND d.deleted_at IS NULL
          AND COALESCE(d.record_type, 'deposit') = 'design_fee'
        ORDER BY d.received_at DESC, d.created_at DESC
      `).all(...customerIds)
    : [];
  const customerTeam = customerIds.length
    ? db.prepare(`
        SELECT ct.*, u.name as user_name, u.avatar as user_avatar, u.phone as user_phone, u.role as user_role,
          u.employee_no as employee_no, org.name as org_unit_name, org.type as org_unit_type
        FROM customer_team ct
        LEFT JOIN users u ON ct.user_id = u.id
        LEFT JOIN org_units org ON u.org_unit_id = org.id AND org.deleted_at IS NULL
        WHERE ct.customer_id IN (${customerIds.map(() => "?").join(",")})
        ORDER BY ct.customer_id, ct.assigned_at
      `).all(...customerIds)
    : [];
  const customerAttachments = customerIds.length
    ? db.prepare(`
        SELECT a.*, uploader.name as uploader_name
        FROM attachments a
        LEFT JOIN users uploader ON uploader.id = a.user_id
        WHERE a.customer_id IN (${customerIds.map(() => "?").join(",")})
        ORDER BY a.created_at DESC
      `).all(...customerIds)
    : [];
  const costRecords = projectIds.length
    ? db.prepare(`
        SELECT cost.*, creator.name as created_by_name
        FROM site_cost_records cost
        LEFT JOIN users creator ON cost.created_by = creator.id
        WHERE cost.project_id IN (${projectIds.map(() => "?").join(",")}) AND cost.deleted_at IS NULL
        ORDER BY cost.cost_date DESC, cost.created_at DESC
      `).all(...projectIds)
    : [];
  const changeOrders = projectIds.length
    ? db.prepare(`
        SELECT change_order.*, creator.name as created_by_name, approver.name as approved_by_name
        FROM site_change_orders change_order
        LEFT JOIN users creator ON change_order.created_by = creator.id
        LEFT JOIN users approver ON change_order.approved_by = approver.id
        WHERE change_order.project_id IN (${projectIds.map(() => "?").join(",")})
          AND change_order.deleted_at IS NULL
        ORDER BY change_order.created_at DESC, change_order.id DESC
      `).all(...projectIds)
    : [];
  const changeOrderIds = (changeOrders as any[]).map((order) => order.id);
  const changeOrderApprovalMap = getChangeOrderApprovalMapForOrders(db, changeOrderIds);
  const changeOrdersWithApproval = (changeOrders as any[]).map((order) => ({
    ...order,
    status: order.status === "PENDING_OWNER" ? "PENDING_APPROVAL" : order.status,
    owner_confirmed: order.status === "PENDING_OWNER" ? 1 : order.owner_confirmed,
    owner_confirmed_at: order.status === "PENDING_OWNER" ? (order.owner_confirmed_at || order.updated_at || order.created_at) : order.owner_confirmed_at,
    approval: getChangeOrderApprovalSummary(changeOrderApprovalMap.get(order.id)),
  }));
  const quantityReviews = projectIds.length
    ? db.prepare(`
        SELECT review.*, creator.name as created_by_name, confirmer.name as confirmed_by_name,
          change_order.change_no as generated_change_order_no,
          change_order.status as generated_change_order_status
        FROM site_quantity_reviews review
        LEFT JOIN users creator ON review.created_by = creator.id
        LEFT JOIN users confirmer ON review.confirmed_by = confirmer.id
        LEFT JOIN site_change_orders change_order ON change_order.id = review.generated_change_order_id
        WHERE review.project_id IN (${projectIds.map(() => "?").join(",")})
          AND review.deleted_at IS NULL
        ORDER BY review.created_at DESC, review.id DESC
      `).all(...projectIds)
    : [];
  const ownerSettlementBills = projectIds.length
    ? db.prepare(`
        SELECT bill.*, creator.name as created_by_name, confirmer.name as confirmed_by_name
        FROM site_owner_settlement_bills bill
        LEFT JOIN users creator ON bill.created_by = creator.id
        LEFT JOIN users confirmer ON bill.confirmed_by = confirmer.id
        WHERE bill.project_id IN (${projectIds.map(() => "?").join(",")})
          AND bill.deleted_at IS NULL
        ORDER BY bill.created_at DESC, bill.id DESC
      `).all(...projectIds)
    : [];
  const materialOrders = projectIds.length
    ? db.prepare(`
        SELECT mo.*, s.name as supplier_name, s.contact as supplier_contact, s.phone as supplier_phone,
          creator.name as created_by_name, creator.phone as created_by_phone,
          (SELECT COUNT(*) FROM material_order_items item WHERE item.order_id = mo.id) as item_count,
          (SELECT COALESCE(SUM(item.quantity), 0) FROM material_order_items item WHERE item.order_id = mo.id) as total_quantity,
          (SELECT COALESCE(SUM(item.received_qty), 0) FROM material_order_items item WHERE item.order_id = mo.id) as received_quantity,
          (SELECT COALESCE(SUM(item.stock_deducted_qty), 0) FROM material_order_items item WHERE item.order_id = mo.id) as stock_deducted_quantity
        FROM material_orders mo
        LEFT JOIN suppliers s ON mo.supplier_id = s.id
        LEFT JOIN users creator ON mo.created_by_id = creator.id
        WHERE mo.project_id IN (${projectIds.map(() => "?").join(",")}) AND mo.deleted_at IS NULL
        ORDER BY mo.order_date DESC, mo.created_at DESC
      `).all(...projectIds)
    : [];
  const materialOrderIds = (materialOrders as any[]).map((order) => order.id);
  const materialOrderItems = materialOrderIds.length
    ? db.prepare(`
        SELECT item.*, mo.project_id, m.code as material_code, m.name as material_name,
          m.brand as material_brand, m.product_name as material_product_name, m.material_model as material_model, m.color as material_color, m.spec as material_spec,
          m.unit as material_unit, m.image as material_image, m.images as material_images,
          m.cost_price as material_cost_price, m.unit_price as material_unit_price,
          m.stock as material_stock, m.min_stock as material_min_stock,
          m.material_type, m.supply_mode, m.warehouse_name, m.owner_name,
          CASE WHEN parent_mc.name IS NOT NULL THEN parent_mc.name || ' / ' || mc.name ELSE mc.name END as category_name,
          s.name as material_supplier_name
        FROM material_order_items item
        INNER JOIN material_orders mo ON item.order_id = mo.id
        LEFT JOIN materials m ON item.material_id = m.id
        LEFT JOIN material_categories mc ON m.category_id = mc.id
        LEFT JOIN material_categories parent_mc ON mc.parent_id = parent_mc.id
        LEFT JOIN suppliers s ON m.supplier_id = s.id
        WHERE item.order_id IN (${materialOrderIds.map(() => "?").join(",")})
        ORDER BY mo.order_date DESC, item.created_at ASC
      `).all(...materialOrderIds)
    : [];
  const materials = companyIds.length
    ? db.prepare(`
        SELECT m.*, mc.name as category_name, parent_mc.name as parent_category_name, s.name as supplier_name
        FROM materials m
        LEFT JOIN material_categories mc ON m.category_id = mc.id
        LEFT JOIN material_categories parent_mc ON mc.parent_id = parent_mc.id
        LEFT JOIN suppliers s ON m.supplier_id = s.id
        WHERE m.company_id IN (${companyIds.map(() => "?").join(",")})
          AND m.deleted_at IS NULL
          AND m.is_active = 1
        ORDER BY COALESCE(parent_mc.sort_order, mc.sort_order) ASC, CASE WHEN parent_mc.id IS NULL THEN 0 ELSE mc.sort_order END ASC, m.name ASC
      `).all(...companyIds)
    : [];
  const materialOrderTemplates = getMobileMaterialOrderTemplates(db, companyIds);
  const suppliers = companyIds.length
    ? db.prepare(`
        SELECT *
        FROM suppliers
        WHERE company_id IN (${companyIds.map(() => "?").join(",")})
          AND deleted_at IS NULL
          AND is_active = 1
        ORDER BY name ASC
      `).all(...companyIds)
    : [];
  const checkinRecords = projectIds.length
    ? db.prepare(`
        SELECT r.*, c.code, c.status as code_status
        FROM site_checkin_records r
        INNER JOIN site_checkin_codes c ON r.code_id = c.id
        WHERE r.project_id IN (${projectIds.map(() => "?").join(",")})
          AND r.deleted_at IS NULL
        ORDER BY r.signed_at DESC, r.created_at DESC
        LIMIT 300
      `).all(...projectIds)
    : [];
  const checkinRecordIds = checkinRecords.map((record: any) => String(record.id || "")).filter(Boolean);
  const checkinPhotos = checkinRecordIds.length
    ? db.prepare(`
        SELECT *
        FROM site_checkin_photos
        WHERE record_id IN (${checkinRecordIds.map(() => "?").join(",")})
          AND deleted_at IS NULL
        ORDER BY sort_order ASC, created_at ASC
      `).all(...checkinRecordIds) as any[]
    : [];
  const checkinPhotoMap = new Map<string, any[]>();
  checkinPhotos.forEach((photo: any) => {
    const recordId = String(photo.record_id || "");
    const list = checkinPhotoMap.get(recordId) || [];
    list.push(photo);
    checkinPhotoMap.set(recordId, list);
  });
  checkinRecords.forEach((record: any) => {
    record.photos = checkinPhotoMap.get(String(record.id || "")) || [];
  });
  const vrTours = projectIds.length
    ? db.prepare(`
        SELECT *
        FROM vr_tours
        WHERE project_id IN (${projectIds.map(() => "?").join(",")})
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `).all(...projectIds)
    : [];
  const siteCameras = listSiteCameras(db, auth.companyId, projectIds);
  const costSnapshots = projectIds.length
    ? db.prepare(`
        SELECT *
        FROM project_cost_snapshots
        WHERE project_id IN (${projectIds.map(() => "?").join(",")})
          AND deleted_at IS NULL
        ORDER BY datetime(updated_at) DESC, id DESC
      `).all(...projectIds)
    : [];
  const costSnapshotIds = (costSnapshots as any[]).map((snapshot) => snapshot.id);
  const costSnapshotItems = costSnapshotIds.length
    ? db.prepare(`
        SELECT item.*, snapshot.project_id, snapshot.quotation_id
        FROM project_cost_snapshot_items item
        INNER JOIN project_cost_snapshots snapshot ON snapshot.id = item.snapshot_id
        WHERE item.snapshot_id IN (${costSnapshotIds.map(() => "?").join(",")})
        ORDER BY item.snapshot_id, item.created_at ASC, item.id ASC
      `).all(...costSnapshotIds)
    : [];

  return NextResponse.json({
    projects,
    phases,
    tasks,
    logs,
    inspections,
    handovers,
    contracts,
    quotations,
    quotationItems,
    paymentPlans,
    paymentRecords,
    depositRecords,
    designFeeRecords,
    customerTeam,
    customerAttachments,
    costRecords,
    costSnapshots,
    costSnapshotItems,
    changeOrders: changeOrdersWithApproval,
    quantityReviews,
    ownerSettlementBills,
    materialOrders,
    materialOrderItems,
    materials,
    materialOrderTemplates,
    suppliers,
    checkinCodes,
    checkinRecords,
    vrTours,
    siteCameras,
  });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  try {
    const db = getDb();
    ensureSiteTables(db);
    const body = await req.json();
    const action = String(body.action || "");
    const materialActions = new Set(["add_material_order", "update_material_order", "confirm_material_outbound", "update_material_received"]);
    const hasActionPermission = materialActions.has(action) ? canManageMaterials(auth) : canEditCustomers(auth);
    if (!hasActionPermission) return NextResponse.json({ message: "没有工地操作权限" }, { status: 403 });
    const requestedProjectId = String(body.project_id || "").trim();
    if (requestedProjectId && !projectBelongsToCompany(auth, requestedProjectId)) {
      return NextResponse.json({ message: "工地不存在" }, { status: 404 });
    }
    const userId = auth.userId;

    if (action === "record_construction_plan_export") {
      if (!userId) return NextResponse.json({ message: "请先登录" }, { status: 401 });
      const projectId = String(body.project_id || "").trim();
      if (!projectId) return NextResponse.json({ message: "缺少项目 ID" }, { status: 400 });
      const project = db.prepare(`
        SELECT p.*, c.id as customer_id, c.name as customer_name, c.address as customer_address
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id
        WHERE p.id = ? AND p.deleted_at IS NULL
        LIMIT 1
      `).get(projectId) as any;
      if (!project) return NextResponse.json({ message: "工地不存在" }, { status: 404 });
      if (project.customer_id) {
        const siteName = getSiteDisplayName(project);
        recordCustomerOperation(db, {
          userId,
          customerId: project.customer_id,
          action: "customer.site.construction_plan.export",
          module: "工地管理",
          title: "导出施工计划",
          content: `导出了工地「${siteName}」的施工计划表格`,
          targetName: project.customer_name || siteName,
          metadata: {
            projectId,
            fileName: String(body.file_name || ""),
            templateName: String(body.template_name || ""),
            planRange: String(body.plan_range || ""),
          },
          ipAddress: getRequestIp(req),
        });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "confirm_site_start") {
      if (!userId) return NextResponse.json({ message: "请先登录" }, { status: 401 });
      const projectId = String(body.project_id || "").trim();
      if (!projectId) return NextResponse.json({ message: "缺少项目 ID" }, { status: 400 });
      const user = db.prepare(`
        SELECT id, company_id, org_unit_id
        FROM users
        WHERE id = ? AND deleted_at IS NULL AND is_active = 1
        LIMIT 1
      `).get(userId) as any;
      if (!user) return NextResponse.json({ message: "账号不存在或已停用" }, { status: 401 });
      const project = db.prepare(`
        SELECT p.*, c.id as customer_id, c.name as customer_name, c.address as customer_address
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id
        WHERE p.id = ? AND p.deleted_at IS NULL
        LIMIT 1
      `).get(projectId) as any;
      if (!project) return NextResponse.json({ message: "工地不存在" }, { status: 404 });
      const handover = db.prepare(`
        SELECT *
        FROM site_start_handovers
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC
        LIMIT 1
      `).get(projectId) as any;
      if (!handover || String(handover.status || "").toLowerCase() !== "completed") {
        return NextResponse.json({ message: "请先完成开工交底后再开工确认" }, { status: 400 });
      }
      const { template, firstStage } = getStartConfirmTemplateStage(db, user, project, handover);
      if (!template) {
        return NextResponse.json({ message: "请先在开工交底中选择施工模板" }, { status: 400 });
      }
      if (!firstStage) {
        return NextResponse.json({ message: "当前施工模板没有施工阶段，请先维护施工模板" }, { status: 400 });
      }

      const today = getBeijingDateOnly();
      try {
        db.prepare("BEGIN").run();
        let phase = db.prepare(`
          SELECT *
          FROM project_phases
          WHERE project_id = ?
            AND (phase = ? OR name = ?)
          ORDER BY sort_order ASC
          LIMIT 1
        `).get(projectId, firstStage.id, firstStage.name) as any;
        if (phase) {
          db.prepare(`
            UPDATE project_phases
            SET phase = ?,
                name = ?,
                sort_order = ?,
                status = CASE WHEN COALESCE(status, '') = 'COMPLETED' THEN status ELSE 'IN_PROGRESS' END,
                start_date = COALESCE(start_date, ?),
                updated_at = datetime('now')
            WHERE id = ?
          `).run(firstStage.id, firstStage.name, firstStage.sortOrder, today, phase.id);
        } else {
          const phaseId = `PH${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          db.prepare(`
            INSERT INTO project_phases (id, project_id, phase, name, sort_order, status, start_date, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, datetime('now'), datetime('now'))
          `).run(phaseId, projectId, firstStage.id, firstStage.name, firstStage.sortOrder, today);
          phase = { id: phaseId };
        }
        db.prepare(`
          UPDATE projects
          SET site_stage = 'CONSTRUCTION',
              status = 'CONSTRUCTION',
              current_phase = ?,
              progress = CASE WHEN COALESCE(progress, 0) <= 0 THEN 1 ELSE progress END,
              start_date = COALESCE(start_date, ?),
              planned_end_date = COALESCE(planned_end_date, ?),
              updated_at = datetime('now')
          WHERE id = ? AND deleted_at IS NULL
        `).run(firstStage.id, handover.planned_start || today, handover.planned_end || null, projectId);
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }

      if (project.customer_id) {
        recordCustomerOperation(db, {
          userId,
          customerId: project.customer_id,
          action: "customer.site.start.confirm",
          module: "工地管理",
          title: "开工确认",
          content: `完成开工确认，工地进入施工中，当前阶段为「${firstStage.name}」`,
          targetName: project.customer_name || getSiteDisplayName(project),
          metadata: {
            projectId,
            templateId: template.id,
            templateName: template.name,
            firstStageId: firstStage.id,
            firstStageName: firstStage.name,
          },
          ipAddress: getRequestIp(req),
        });
      }

      return NextResponse.json({
        success: true,
        site_stage: "CONSTRUCTION",
        status: "CONSTRUCTION",
        current_phase: firstStage.id,
        current_phase_name: firstStage.name,
      });
    }

    if (action === "request_site_start") {
      if (!userId) return NextResponse.json({ message: "请先登录" }, { status: 401 });
      const projectId = String(body.project_id || "").trim();
      if (!projectId) return NextResponse.json({ message: "缺少项目 ID" }, { status: 400 });
      const user = db.prepare(`
        SELECT id, company_id, org_unit_id
        FROM users
        WHERE id = ? AND deleted_at IS NULL AND is_active = 1
        LIMIT 1
      `).get(userId) as any;
      if (!user) return NextResponse.json({ message: "账号不存在或已停用" }, { status: 401 });
      const project = db.prepare(`
        SELECT p.*, c.id as customer_id, c.name as customer_name, c.address as customer_address,
          c.decoration_type, c.area_size as customer_area_size, c.area as customer_area
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id
        WHERE p.id = ? AND p.deleted_at IS NULL
        LIMIT 1
      `).get(projectId) as any;
      if (!project) return NextResponse.json({ message: "工地不存在" }, { status: 404 });
      const currentSiteStage = String(project.site_stage || "").trim().toUpperCase();
      if (["CONSTRUCTION", "OWNER_SETTLEMENT", "SITE_SETTLEMENT"].includes(currentSiteStage) || ["CONSTRUCTION", "COMPLETED", "CLOSED"].includes(String(project.status || "").trim().toUpperCase())) {
        return NextResponse.json({ message: "工地已开工，无需重复申请" }, { status: 409 });
      }

      const existing = db.prepare(`
        SELECT *
        FROM site_start_handovers
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC
        LIMIT 1
      `).get(projectId) as any;
      if (existing && String(existing.status || "").toLowerCase() === "completed") {
        return NextResponse.json({ success: true, site_stage: "START_CONFIRM", message: "已申请开工，等待开工确认" });
      }

      const contract = db.prepare(`
        SELECT *
        FROM contracts
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY CASE WHEN status IN ('SIGNED','RESIGNED') THEN 0 WHEN status IN ('APPROVED','PENDING_SIGNATURE','PENDING_APPROVAL') THEN 1 ELSE 2 END,
          datetime(COALESCE(signed_at, updated_at, created_at)) DESC, id DESC
        LIMIT 1
      `).get(projectId) as any;
      const contractContent = parseContent(contract?.content);
      const contractProjectInfo = contractContent?.project_info || contractContent?.document_snapshot?.variables?.project || {};
      const template = getStartRequestTemplate(db, user, project);
      if (!template) return NextResponse.json({ message: "没有可用施工模板，请先在分公司设置中维护施工模板" }, { status: 400 });

      const plannedStart = normalizeDateOnly(body.planned_start) || normalizeDateOnly(project.start_date) || normalizeDateOnly(contractProjectInfo.planned_start) || getBeijingDateOnly();
      const durationDays = Math.max(0, Math.ceil(Number(body.duration_days || existing?.duration_days || contractProjectInfo.duration_days || 0) || 0));
      if (!plannedStart || durationDays <= 0) {
        return NextResponse.json({ message: "缺少合同工期，请先在合同或开工交底中确认工期" }, { status: 400 });
      }
      const weekendConstruction = body.weekend_construction === undefined
        ? Number(project.weekend_construction || 0) === 1 || contractProjectInfo.weekend_construction === true
        : Boolean(body.weekend_construction);
      const holidayConstruction = body.holiday_construction === undefined
        ? Number(project.holiday_construction || 0) === 1 || contractProjectInfo.holiday_construction === true
        : Boolean(body.holiday_construction);
      const hasFloorHeating = body.has_floor_heating === undefined
        ? Number(project.has_floor_heating || 0) === 1
        : Boolean(body.has_floor_heating);
      const plannedEnd = calculateSitePlannedEnd(plannedStart, durationDays, {
        weekendConstruction,
        holidayConstruction,
      }) || normalizeDateOnly(contractProjectInfo.planned_end) || normalizeDateOnly(project.planned_end_date);
      const stages = Array.isArray(template.stages) ? template.stages : [];
      const processNodes = stages.flatMap((stage: any) => Array.isArray(stage?.processNodes) ? stage.processNodes : []);
      const handoverId = existing?.id || `SH${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const checks = existing?.checks || "[]";

      if (existing?.id) {
        db.prepare(`
          UPDATE site_start_handovers
          SET status = 'completed',
            planned_start = ?, planned_end = ?, duration_days = ?,
            weekend_construction = ?, holiday_construction = ?, has_floor_heating = ?,
            construction_template_id = ?, construction_template_name = ?, construction_template_description = ?,
            construction_template_decoration_type = ?, construction_template_duration_text = ?,
            construction_template_stage_count = ?, construction_template_node_count = ?, construction_template_acceptance_count = ?,
            checks = ?, manager_confirmed = 1,
            key_notes = COALESCE(NULLIF(key_notes, ''), '手机端申请开工'),
            updated_at = datetime('now'), completed_at = COALESCE(completed_at, datetime('now'))
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL
        `).run(
          plannedStart,
          plannedEnd || null,
          durationDays,
          weekendConstruction ? 1 : 0,
          holidayConstruction ? 1 : 0,
          hasFloorHeating ? 1 : 0,
          template.id || null,
          template.name || null,
          template.description || null,
          template.decorationType || null,
          "",
          stages.length,
          processNodes.length,
          processNodes.filter((node: any) => node?.type === "acceptance").length,
          checks,
          handoverId,
          projectId,
        );
      } else {
        db.prepare(`
          INSERT INTO site_start_handovers (
            id, project_id, status, planned_start, planned_end, duration_days,
            weekend_construction, holiday_construction, has_floor_heating,
            construction_template_id, construction_template_name, construction_template_description,
            construction_template_decoration_type, construction_template_duration_text,
            construction_template_stage_count, construction_template_node_count, construction_template_acceptance_count,
            checks, manager_confirmed, owner_present, key_notes, created_by, created_at, updated_at, completed_at
          )
          VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, '手机端申请开工', ?, datetime('now'), datetime('now'), datetime('now'))
        `).run(
          handoverId,
          projectId,
          plannedStart,
          plannedEnd || null,
          durationDays,
          weekendConstruction ? 1 : 0,
          holidayConstruction ? 1 : 0,
          hasFloorHeating ? 1 : 0,
          template.id || null,
          template.name || null,
          template.description || null,
          template.decorationType || null,
          "",
          stages.length,
          processNodes.length,
          processNodes.filter((node: any) => node?.type === "acceptance").length,
          checks,
          userId,
        );
      }
      db.prepare(`
        UPDATE projects
        SET site_stage = CASE WHEN COALESCE(site_stage, '') = '' OR site_stage = 'PENDING_START' THEN 'START_CONFIRM' ELSE site_stage END,
          start_date = COALESCE(?, start_date),
          planned_end_date = COALESCE(?, planned_end_date),
          weekend_construction = ?,
          holiday_construction = ?,
          has_floor_heating = ?,
          construction_template_id = COALESCE(?, construction_template_id),
          construction_template_name = COALESCE(?, construction_template_name),
          construction_template_description = COALESCE(?, construction_template_description),
          construction_template_decoration_type = COALESCE(?, construction_template_decoration_type),
          construction_template_stage_count = ?,
          construction_template_node_count = ?,
          construction_template_acceptance_count = ?,
          updated_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL
      `).run(
        plannedStart,
        plannedEnd || null,
        weekendConstruction ? 1 : 0,
        holidayConstruction ? 1 : 0,
        hasFloorHeating ? 1 : 0,
        template.id || null,
        template.name || null,
        template.description || null,
        template.decorationType || null,
        stages.length,
        processNodes.length,
        processNodes.filter((node: any) => node?.type === "acceptance").length,
        projectId,
      );

      return NextResponse.json({
        success: true,
        site_stage: "START_CONFIRM",
        handover_id: handoverId,
        planned_start: plannedStart,
        planned_end: plannedEnd || null,
        duration_days: durationDays,
        template_name: template.name || "",
      });
    }

    if (action === "update_site_location") {
      const projectId = String(body.project_id || "").trim();
      if (!projectId) return NextResponse.json({ message: "缺少项目 ID" }, { status: 400 });
      const latitude = Number(body.site_latitude ?? body.latitude);
      const longitude = Number(body.site_longitude ?? body.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return NextResponse.json({ message: "工地定位坐标无效" }, { status: 400 });
      }
      const locationName = String(body.site_location_name || body.location_name || "").trim();
      const locationAddress = String(body.site_location_address || body.location_address || "").trim();
      if (locationName.length > 200 || locationAddress.length > 500) {
        return NextResponse.json({ message: "工地定位内容过长" }, { status: 400 });
      }
      const project = db.prepare(`
        SELECT p.id, p.customer_id, p.name, c.name as customer_name
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id
        WHERE p.id = ? AND p.deleted_at IS NULL
        LIMIT 1
      `).get(projectId) as any;
      if (!project) return NextResponse.json({ message: "工地不存在" }, { status: 404 });
      db.prepare(`
        UPDATE projects
        SET site_location_name = ?,
            site_location_address = ?,
            site_latitude = ?,
            site_longitude = ?,
            updated_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL
      `).run(
        locationName || null,
        locationAddress || null,
        latitude,
        longitude,
        projectId,
      );
      if (userId && project.customer_id) {
        recordCustomerOperation(db, {
          userId,
          customerId: project.customer_id,
          action: "customer.site.location.update",
          module: "工地管理",
          title: "更新工地定位",
          content: `更新了工地「${project.name || project.customer_name || "未命名工地"}」的签到定位`,
          targetName: project.customer_name || project.name || "",
          metadata: { projectId, latitude, longitude, locationName, locationAddress },
          ipAddress: getRequestIp(req),
        });
      }
      return NextResponse.json({
        success: true,
        site_location_name: locationName || null,
        site_location_address: locationAddress || null,
        site_latitude: latitude,
        site_longitude: longitude,
      });
    }

    if (action === "update_project") {
      const projectId = String(body.project_id || "");
      if (!projectId) return NextResponse.json({ message: "缺少项目 ID" }, { status: 400 });
      const project = db.prepare(`
        SELECT id, status, site_stage, current_phase, progress
        FROM projects
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(projectId) as any;
      if (!project) return NextResponse.json({ message: "工地不存在" }, { status: 404 });
      const siteStage = String(body.site_stage || "").trim();
      const nextSiteStage = (siteStages as readonly string[]).includes(siteStage) ? siteStage : "";
      const currentSiteStage = normalizeSiteStage(project);
      const statusInput = String(body.status || "").trim().toUpperCase();
      const enteringConstruction = nextSiteStage === "CONSTRUCTION" || statusInput === "CONSTRUCTION";
      if (enteringConstruction && !hasCompletedSiteStartHandover(db, projectId)) {
        return NextResponse.json({ message: "请先完成开工交底和开工确认后再进入施工中" }, { status: 400 });
      }
      if (enteringConstruction && currentSiteStage !== "CONSTRUCTION") {
        return NextResponse.json({ message: "请先完成开工确认后再进入施工中" }, { status: 400 });
      }
      const hasProgress = Object.prototype.hasOwnProperty.call(body, "progress");
      const hasCurrentPhase = Object.prototype.hasOwnProperty.call(body, "current_phase");
      const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
      const nextStatus = nextSiteStage
        ? statusForSiteStage(nextSiteStage, project.status || "SIGNED")
        : hasStatus && statusInput
          ? statusInput
          : project.status || "SIGNED";
      const finalSiteStage = nextSiteStage || currentSiteStage;
      db.prepare(`
        UPDATE projects
        SET progress = ?, current_phase = ?, status = ?, site_stage = ?, updated_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL
      `).run(
        hasProgress ? Number(body.progress || 0) : Number(project.progress || 0),
        hasCurrentPhase ? (body.current_phase || null) : (project.current_phase || null),
        nextStatus,
        finalSiteStage,
        projectId,
      );
      return NextResponse.json({ success: true });
    }

    if (action === "add_construction_task_node") {
      const projectId = String(body.project_id || "").trim();
      const stageId = String(body.stage_id || "").trim();
      const stageName = String(body.stage_name || "").trim();
      const nodeName = String(body.node_name || "").trim();
      const nodeType = String(body.node_type || "construction").trim() === "acceptance" ? "acceptance" : "construction";
      const description = String(body.description || "").trim();
      const phaseSortOrder = Math.max(1, Math.floor(Number(body.stage_sort_order || 1) || 1));
      const plannedStart = normalizeDateOnly(body.planned_start) || null;
      const plannedEnd = normalizeDateOnly(body.planned_end) || null;
      if (!projectId || !stageId || !stageName || !nodeName) {
        return NextResponse.json({ message: "请填写施工阶段和节点名称" }, { status: 400 });
      }
      const project = db.prepare(`
        SELECT p.*, c.id as customer_id, c.name as customer_name, c.address as customer_address
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id
        WHERE p.id = ? AND p.deleted_at IS NULL
        LIMIT 1
      `).get(projectId) as any;
      if (!project) return NextResponse.json({ message: "工地不存在" }, { status: 404 });
      const projectSiteStage = normalizeSiteStage(project);
      if (!["CONSTRUCTION", "OWNER_SETTLEMENT", "SITE_SETTLEMENT"].includes(projectSiteStage)) {
        return NextResponse.json({ message: "请先完成开工确认后再新增施工节点" }, { status: 400 });
      }
      if (!hasCompletedSiteStartHandover(db, projectId)) {
        return NextResponse.json({ message: "请先完成开工交底和开工确认后再新增施工节点" }, { status: 400 });
      }

      let phase: any = null;
      let taskId = "";
      try {
        db.prepare("BEGIN").run();
        phase = db.prepare(`
          SELECT *
          FROM project_phases
          WHERE project_id = ?
            AND (phase = ? OR name = ?)
          ORDER BY sort_order ASC
          LIMIT 1
        `).get(projectId, stageId, stageName) as any;
        if (!phase) {
          const phasePrimaryKey = `PH${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          db.prepare(`
            INSERT INTO project_phases (id, project_id, phase, name, sort_order, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', datetime('now'), datetime('now'))
          `).run(phasePrimaryKey, projectId, stageId, stageName, phaseSortOrder);
          phase = { id: phasePrimaryKey, phase: stageId, name: stageName };
        }
        const duplicate = db.prepare(`
          SELECT id
          FROM tasks
          WHERE project_id = ?
            AND phase_id = ?
            AND name = ?
            AND deleted_at IS NULL
          LIMIT 1
        `).get(projectId, phase.id, nodeName) as any;
        if (duplicate) {
          db.prepare("ROLLBACK").run();
          return NextResponse.json({ message: "当前阶段已存在同名节点" }, { status: 400 });
        }
        taskId = `TK${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        db.prepare(`
          INSERT INTO tasks (
            id, project_id, phase_id, name, description, status, priority,
            planned_start, planned_end, notes, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, 'PENDING', 'MEDIUM', ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          taskId,
          projectId,
          phase.id,
          nodeName,
          description || (nodeType === "acceptance" ? "按现场实际情况进行验收确认。" : "按现场实际情况进行施工。"),
          plannedStart,
          plannedEnd,
          nodeType === "acceptance" ? "自定义验收节点" : "自定义施工节点",
        );
        db.prepare(`
          UPDATE project_phases
          SET status = CASE WHEN status = 'COMPLETED' THEN status ELSE 'IN_PROGRESS' END,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(phase.id);
        db.prepare(`
          UPDATE projects
          SET current_phase = ?, updated_at = datetime('now')
          WHERE id = ? AND deleted_at IS NULL
        `).run(stageId, projectId);
        recordSiteNodeEvent(db, {
          projectId,
          stageId,
          stageName,
          nodeId: taskId,
          nodeName,
          nodeType,
          eventType: "NODE_CREATE",
          title: nodeType === "acceptance" ? "新增验收节点" : "新增施工节点",
          content: description || "用户根据当前工地实际情况新增节点",
          statusFrom: "",
          statusTo: "PENDING",
          operatorId: userId,
          sourceType: "task",
          sourceId: taskId,
        });
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }

      if (project.customer_id) {
        recordCustomerOperation(db, {
          userId,
          customerId: project.customer_id,
          action: "customer.site.phase_node.create",
          module: "工地管理",
          title: nodeType === "acceptance" ? "新增验收节点" : "新增施工节点",
          content: `在「${stageName}」新增节点「${nodeName}」`,
          targetName: project.customer_name || getSiteDisplayName(project),
          metadata: { projectId, stageId, stageName, nodeName, nodeType, taskId },
          ipAddress: getRequestIp(req),
        });
      }

      return NextResponse.json({ success: true, id: taskId });
    }

    if (action === "delete_construction_task_node") {
      const projectId = String(body.project_id || "").trim();
      const taskId = String(body.task_id || body.node_id || "").trim();
      const stageId = String(body.stage_id || "").trim();
      const stageName = String(body.stage_name || "").trim();
      if (!projectId || !taskId) {
        return NextResponse.json({ message: "缺少要删除的节点信息" }, { status: 400 });
      }
      const project = db.prepare(`
        SELECT p.*, c.id as customer_id, c.name as customer_name, c.address as customer_address
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id
        WHERE p.id = ? AND p.deleted_at IS NULL
        LIMIT 1
      `).get(projectId) as any;
      if (!project) return NextResponse.json({ message: "工地不存在" }, { status: 404 });
      const task = db.prepare(`
        SELECT t.*, pp.phase as stage_id, pp.name as stage_name
        FROM tasks t
        LEFT JOIN project_phases pp ON pp.id = t.phase_id
        WHERE t.id = ?
          AND t.project_id = ?
          AND t.deleted_at IS NULL
        LIMIT 1
      `).get(taskId, projectId) as any;
      if (!task) return NextResponse.json({ message: "节点不存在或已删除" }, { status: 404 });
      const taskNote = String(task.notes || "");
      if (!taskNote.includes("自定义施工节点") && !taskNote.includes("自定义验收节点")) {
        return NextResponse.json({ message: "模板节点不能删除，只能删除用户新增节点" }, { status: 400 });
      }
      const nodeType = taskNote.includes("验收") ? "acceptance" : "construction";
      const resolvedStageId = stageId || String(task.stage_id || "");
      const resolvedStageName = stageName || String(task.stage_name || "");

      try {
        db.prepare("BEGIN").run();
        db.prepare(`
          UPDATE tasks
          SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
            AND project_id = ?
        `).run(taskId, projectId);
        recordSiteNodeEvent(db, {
          projectId,
          stageId: resolvedStageId,
          stageName: resolvedStageName,
          nodeId: taskId,
          nodeName: task.name,
          nodeType,
          eventType: "NODE_DELETE",
          title: nodeType === "acceptance" ? "删除验收节点" : "删除施工节点",
          content: `删除用户新增节点「${task.name}」`,
          statusFrom: String(task.status || ""),
          statusTo: "DELETED",
          operatorId: userId,
          sourceType: "task",
          sourceId: taskId,
        });
        if (task.phase_id) {
          const taskSummary = db.prepare(`
            SELECT
              COUNT(*) as total,
              SUM(CASE WHEN status IN ('COMPLETED','SKIPPED') THEN 1 ELSE 0 END) as completed,
              SUM(CASE WHEN status = 'REVIEW' THEN 1 ELSE 0 END) as review,
              SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as progressing
            FROM tasks
            WHERE phase_id = ?
              AND project_id = ?
              AND deleted_at IS NULL
          `).get(task.phase_id, projectId) as any;
          const totalTasks = Number(taskSummary?.total || 0);
          const completedTasks = Number(taskSummary?.completed || 0);
          const nextPhaseStatus = totalTasks > 0 && completedTasks >= totalTasks
            ? "COMPLETED"
            : Number(taskSummary?.review || 0) > 0
              ? "REVIEW"
              : Number(taskSummary?.progressing || 0) > 0
                ? "IN_PROGRESS"
                : "PENDING";
          db.prepare(`
            UPDATE project_phases
            SET status = ?,
                end_date = CASE WHEN ? = 'COMPLETED' THEN COALESCE(end_date, ?) ELSE NULL END,
                updated_at = datetime('now')
            WHERE id = ?
          `).run(nextPhaseStatus, nextPhaseStatus, getBeijingDateOnly(), task.phase_id);
        }
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }

      if (project.customer_id) {
        recordCustomerOperation(db, {
          userId,
          customerId: project.customer_id,
          action: "customer.site.phase_node.delete",
          module: "工地管理",
          title: nodeType === "acceptance" ? "删除验收节点" : "删除施工节点",
          content: `删除「${resolvedStageName || "施工阶段"} / ${task.name}」`,
          targetName: project.customer_name || getSiteDisplayName(project),
          metadata: { projectId, stageId: resolvedStageId, stageName: resolvedStageName, nodeName: task.name, nodeType, taskId },
          ipAddress: getRequestIp(req),
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "update_construction_task_status") {
      const projectId = String(body.project_id || "").trim();
      const stageId = String(body.stage_id || "").trim();
      const stageName = String(body.stage_name || "").trim();
      const nodeId = String(body.node_id || "").trim();
      const nodeName = String(body.node_name || "").trim();
      const nodeType = String(body.node_type || "construction").trim();
      const statusInput = String(body.status || "PENDING").trim().toUpperCase();
      const allowedStatuses = ["PENDING", "IN_PROGRESS", "REVIEW", "COMPLETED", "SKIPPED", "CANCELLED"];
      const nextStatus = allowedStatuses.includes(statusInput) ? statusInput : "PENDING";
      if (!projectId || !stageId || !stageName || !nodeName) {
        return NextResponse.json({ message: "缺少施工阶段或节点信息" }, { status: 400 });
      }
      const project = db.prepare(`
        SELECT p.*, c.id as customer_id, c.name as customer_name, c.address as customer_address
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id
        WHERE p.id = ? AND p.deleted_at IS NULL
        LIMIT 1
      `).get(projectId) as any;
      if (!project) return NextResponse.json({ message: "工地不存在" }, { status: 404 });
      const projectSiteStage = normalizeSiteStage(project);
      if (!["CONSTRUCTION", "OWNER_SETTLEMENT", "SITE_SETTLEMENT"].includes(projectSiteStage)) {
        return NextResponse.json({ message: "请先完成开工确认后再维护施工节点" }, { status: 400 });
      }
      if (!hasCompletedSiteStartHandover(db, projectId)) {
        return NextResponse.json({ message: "请先完成开工交底和开工确认后再维护施工节点" }, { status: 400 });
      }

      const today = getBeijingDateOnly();
      const phaseSortOrder = Math.max(1, Math.floor(Number(body.stage_sort_order || 1) || 1));
      const stageNodeCount = Math.max(0, Math.floor(Number(body.stage_node_count || 0) || 0));
      const plannedStart = normalizeDateOnly(body.planned_start) || null;
      const plannedEnd = normalizeDateOnly(body.planned_end) || null;
      const description = String(body.description || "").trim() || null;
      let nodeTaskId = "";
      let previousTaskStatus = "PENDING";

      try {
        db.prepare("BEGIN").run();
        let phase = db.prepare(`
          SELECT *
          FROM project_phases
          WHERE project_id = ?
            AND (phase = ? OR name = ?)
          ORDER BY sort_order ASC
          LIMIT 1
        `).get(projectId, stageId, stageName) as any;
        if (!phase) {
          const phasePrimaryKey = `PH${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          db.prepare(`
            INSERT INTO project_phases (id, project_id, phase, name, sort_order, status, start_date, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).run(
            phasePrimaryKey,
            projectId,
            stageId,
            stageName,
            phaseSortOrder,
            nextStatus === "PENDING" ? "PENDING" : "IN_PROGRESS",
            nextStatus === "PENDING" ? null : today,
          );
          phase = { id: phasePrimaryKey, phase: stageId, name: stageName, status: nextStatus === "PENDING" ? "PENDING" : "IN_PROGRESS" };
        }

        const existingTask = db.prepare(`
          SELECT *
          FROM tasks
          WHERE project_id = ?
            AND phase_id = ?
            AND name = ?
            AND deleted_at IS NULL
          ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, id DESC
          LIMIT 1
        `).get(projectId, phase.id, nodeName) as any;
        previousTaskStatus = String(existingTask?.status || "PENDING").toUpperCase();
        const actualStart = ["PENDING", "SKIPPED"].includes(nextStatus)
          ? null
          : (existingTask?.actual_start || today);
        const actualEnd = nextStatus === "COMPLETED"
          ? (existingTask?.actual_end || today)
          : null;
        if (existingTask) {
          nodeTaskId = String(existingTask.id || "");
          db.prepare(`
            UPDATE tasks
            SET status = ?,
                description = COALESCE(?, description),
                planned_start = COALESCE(?, planned_start),
                planned_end = COALESCE(?, planned_end),
                actual_start = ?,
                actual_end = ?,
                priority = COALESCE(priority, 'MEDIUM'),
                updated_at = datetime('now')
            WHERE id = ?
          `).run(nextStatus, description, plannedStart, plannedEnd, actualStart, actualEnd, existingTask.id);
        } else {
          const taskId = `TK${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          nodeTaskId = taskId;
          db.prepare(`
            INSERT INTO tasks (
              id, project_id, phase_id, name, description, status, priority,
              planned_start, planned_end, actual_start, actual_end, notes,
              created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'MEDIUM', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).run(
            taskId,
            projectId,
            phase.id,
            nodeName,
            description,
            nextStatus,
            plannedStart,
            plannedEnd,
            actualStart,
            actualEnd,
            body.node_type === "acceptance" ? "验收节点" : "施工节点",
          );
        }

        if (previousTaskStatus !== nextStatus) {
          const previousStatusText = previousTaskStatus === "SKIPPED"
            ? "不施工"
            : previousTaskStatus === "COMPLETED"
            ? (nodeType === "acceptance" ? "已验收" : "已完成")
            : previousTaskStatus === "REVIEW"
              ? (nodeType === "acceptance" ? "验收不通过" : "待确认")
              : previousTaskStatus === "IN_PROGRESS"
                ? "进行中"
                : "待完成";
          const statusText = nextStatus === "SKIPPED"
            ? "此项不施工"
            : nextStatus === "COMPLETED"
            ? (nodeType === "acceptance" ? "验收通过" : "已完成")
            : nextStatus === "REVIEW"
              ? (nodeType === "acceptance" ? "验收不通过" : "提交验收")
              : nextStatus === "IN_PROGRESS"
                ? "开始施工"
                : "重置为待开始";
          recordSiteNodeEvent(db, {
            projectId,
            stageId,
            stageName,
            nodeId,
            nodeName,
            nodeType,
            eventType: "NODE_STATUS",
            title: statusText,
            content: `节点状态由「${previousStatusText}」更新为「${statusText}」`,
            statusFrom: previousTaskStatus,
            statusTo: nextStatus,
            operatorId: userId,
            sourceType: "task",
            sourceId: nodeTaskId,
          });
        }

        const taskSummary = db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('COMPLETED','SKIPPED') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'REVIEW' THEN 1 ELSE 0 END) as review,
            SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as progressing
          FROM tasks
          WHERE phase_id = ?
            AND project_id = ?
            AND deleted_at IS NULL
        `).get(phase.id, projectId) as any;
        const totalTasks = Number(taskSummary?.total || 0);
        const completedTasks = Number(taskSummary?.completed || 0);
        const expectedTaskTotal = Math.max(totalTasks, stageNodeCount);
        const nextPhaseStatus = expectedTaskTotal > 0 && completedTasks >= expectedTaskTotal
          ? "COMPLETED"
          : Number(taskSummary?.review || 0) > 0
            ? "REVIEW"
            : Number(taskSummary?.progressing || 0) > 0 || nextStatus !== "PENDING"
              ? "IN_PROGRESS"
              : "PENDING";
        db.prepare(`
          UPDATE project_phases
          SET status = ?,
              start_date = CASE WHEN ? != 'PENDING' THEN COALESCE(start_date, ?) ELSE start_date END,
              end_date = CASE WHEN ? = 'COMPLETED' THEN COALESCE(end_date, ?) ELSE NULL END,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(nextPhaseStatus, nextPhaseStatus, today, nextPhaseStatus, today, phase.id);
        db.prepare(`
          UPDATE projects
          SET current_phase = ?,
              status = CASE WHEN COALESCE(site_stage, '') = 'CONSTRUCTION' THEN 'CONSTRUCTION' ELSE status END,
              updated_at = datetime('now')
          WHERE id = ? AND deleted_at IS NULL
        `).run(stageId, projectId);
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }

      if (project.customer_id) {
        const statusText = nextStatus === "SKIPPED"
          ? "标记为不施工"
          : nextStatus === "COMPLETED"
            ? (nodeType === "acceptance" ? "验收通过" : "完成")
            : nextStatus === "REVIEW"
              ? (nodeType === "acceptance" ? "验收不通过" : "进入待确认")
              : nextStatus === "IN_PROGRESS"
                ? "标记为进行中"
                : "重置为待完成";
        recordCustomerOperation(db, {
          userId,
          customerId: project.customer_id,
          action: "customer.site.phase_node.update",
          module: "工地管理",
          title: "更新施工节点",
          content: `将「${stageName} / ${nodeName}」更新为${statusText}`,
          targetName: project.customer_name || getSiteDisplayName(project),
          metadata: {
            projectId,
            stageId,
            stageName,
            nodeName,
            status: nextStatus,
          },
          ipAddress: getRequestIp(req),
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "add_log") {
      const projectId = String(body.project_id || "");
      const content = String(body.content || "").trim();
      const completedWork = String(body.completed_work || "").trim();
      if (!projectId || (!content && !completedWork)) return NextResponse.json({ message: "项目和日志内容不能为空" }, { status: 400 });
      const authorId = userId;
      const id = `DL${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const phase = String(body.phase || "").trim();
      const phaseValue = phase || null;
      const stageId = String(body.stage_id || phase || "").trim();
      const stageName = String(body.stage_name || "").trim();
      const nodeId = String(body.node_id || "").trim();
      const nodeName = String(body.node_name || "").trim();
      const nodeType = String(body.node_type || "construction").trim();
      const logDate = String(body.log_date || "").trim() || new Date().toISOString().slice(0, 10);
      const workerCount = Math.max(0, Number(body.worker_count || 0) || 0);
      const temperature = body.temperature === null || body.temperature === "" ? null : Number(body.temperature);
      const latitude = body.latitude === null || body.latitude === "" ? null : Number(body.latitude);
      const longitude = body.longitude === null || body.longitude === "" ? null : Number(body.longitude);
      const photos = Array.isArray(body.photos) ? body.photos.slice(0, 30) : [];
      const insertLog = db.prepare(`
        INSERT INTO daily_logs (
          id, project_id, author_id, log_date, phase, stage_id, stage_name, node_id, node_name, node_type, weather, temperature, content, worker_count,
          completed_work, material_notes, quality_notes, safety_notes, issue_notes, next_plan,
          location_name, location_address, latitude, longitude,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      const insertPhoto = db.prepare(`
        INSERT INTO daily_log_photos (id, log_id, url, caption, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);
      try {
        db.prepare("BEGIN").run();
        insertLog.run(
          id,
          projectId,
          authorId,
          logDate,
          phaseValue,
          stageId || phaseValue,
          stageName || null,
          nodeId || null,
          nodeName || null,
          nodeType || null,
          String(body.weather || "").trim() || null,
          Number.isFinite(temperature) ? temperature : null,
          content,
          workerCount,
          completedWork || null,
          String(body.material_notes || "").trim() || null,
          String(body.quality_notes || "").trim() || null,
          String(body.safety_notes || "").trim() || null,
          String(body.issue_notes || "").trim() || null,
          String(body.next_plan || "").trim() || null,
          String(body.location_name || "").trim() || null,
          String(body.location_address || "").trim() || null,
          Number.isFinite(latitude) ? latitude : null,
          Number.isFinite(longitude) ? longitude : null,
        );
        photos.forEach((photo: any, index: number) => {
          const url = String(photo?.url || photo?.file_url || "").trim();
          if (!url) return;
          const caption = String(photo?.caption || photo?.file_name || "").trim() || null;
          insertPhoto.run(
            `DLP${Date.now()}${index}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            id,
            url,
            caption,
            Number.isFinite(Number(photo?.sort_order)) ? Number(photo.sort_order) : index,
          );
        });
        if (stageId || nodeId || nodeName) {
          recordSiteNodeEvent(db, {
            projectId,
            stageId,
            stageName,
            nodeId,
            nodeName,
            nodeType,
            eventType: "REPORT",
            title: "提交施工汇报",
            content: content || completedWork,
            operatorId: authorId,
            sourceType: "daily_log",
            sourceId: id,
            metadata: {
              logDate,
              photoCount: photos.filter((photo: any) => String(photo?.url || photo?.file_url || "").trim()).length,
              locationName: String(body.location_name || "").trim(),
            },
          });
        }
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }
      return NextResponse.json({ success: true, id }, { status: 201 });
    }

    if (action === "delete_log") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少施工日志" }, { status: 400 });
      const existingLog = db.prepare(`
        SELECT * FROM daily_logs
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(id, projectId) as any;
      if (!existingLog) return NextResponse.json({ message: "施工日志不存在" }, { status: 404 });
      db.prepare(`
        UPDATE daily_logs
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `).run(id, projectId);
      const taggedNodeName = String(existingLog.content || existingLog.completed_work || "").match(/【([^】]+)】/)?.[1] || "";
      if (existingLog.phase || taggedNodeName) {
        recordSiteNodeEvent(db, {
          projectId,
          stageId: String(existingLog.phase || ""),
          nodeName: taggedNodeName,
          eventType: "REPORT_DELETE",
          title: "删除施工汇报",
          content: String(existingLog.content || existingLog.completed_work || "").trim(),
          operatorId: userId,
          sourceType: "daily_log",
          sourceId: id,
        });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "add_issue") {
      const projectId = String(body.project_id || "");
      const title = String(body.title || "").trim();
      if (!projectId || !title) return NextResponse.json({ message: "项目和问题标题不能为空" }, { status: 400 });
      const id = `SI${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const stageId = String(body.stage_id || "").trim();
      const stageName = String(body.stage_name || body.category || "").trim();
      const nodeId = String(body.node_id || "").trim();
      const nodeName = String(body.node_name || "").trim();
      const nodeType = String(body.node_type || "construction").trim();
      try {
        db.prepare("BEGIN").run();
        db.prepare(`
          INSERT INTO site_inspections (id, project_id, title, category, severity, status, due_date, created_at)
          VALUES (?, ?, ?, ?, ?, 'open', ?, datetime('now'))
        `).run(id, projectId, title, body.category || "质量", body.severity || "normal", body.due_date || null);
        recordSiteNodeEvent(db, {
          projectId,
          stageId,
          stageName,
          nodeId,
          nodeName,
          nodeType,
          eventType: "ISSUE",
          title: "记录整改问题",
          content: title,
          operatorId: userId,
          sourceType: "inspection",
          sourceId: id,
          metadata: {
            severity: String(body.severity || "normal"),
            dueDate: String(body.due_date || ""),
          },
        });
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }
      return NextResponse.json({ success: true, id }, { status: 201 });
    }

    if (action === "add_cost_record") {
      const projectId = String(body.project_id || "");
      const name = String(body.name || "").trim();
      const amount = Number(body.amount || 0);
      if (!projectId || !name) return NextResponse.json({ message: "项目和费用名称不能为空" }, { status: 400 });
      if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ message: "支出金额必须大于 0" }, { status: 400 });

      const categoryInput = String(body.category || "OTHER").trim();
      const category = (costCategories as readonly string[]).includes(categoryInput) ? categoryInput : "OTHER";
      const statusInput = String(body.status || "PAID").trim();
      const status = (costStatuses as readonly string[]).includes(statusInput) ? statusInput : "PAID";
      const authorId = userId;
      const id = `SC${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      db.prepare(`
        INSERT INTO site_cost_records (
          id, project_id, category, phase, name, amount, cost_date, supplier, payee,
          payment_method, status, invoice_no, work_type_name, material_category_name, source_type, source_id,
          remark, created_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id,
        projectId,
        category,
        body.phase ? String(body.phase) : null,
        name,
        amount,
        body.cost_date ? String(body.cost_date) : new Date().toISOString().slice(0, 10),
        String(body.supplier || "").trim() || null,
        String(body.payee || "").trim() || null,
        String(body.payment_method || "").trim() || null,
        status,
        String(body.invoice_no || "").trim() || null,
        String(body.work_type_name || "").trim() || null,
        String(body.material_category_name || "").trim() || null,
        "MANUAL",
        null,
        String(body.remark || "").trim() || null,
        authorId,
      );
      return NextResponse.json({ success: true, id }, { status: 201 });
    }

    if (action === "delete_cost_record") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少成本记录" }, { status: 400 });
      db.prepare(`
        UPDATE site_cost_records
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `).run(id, projectId);
      return NextResponse.json({ success: true });
    }

    if (action === "add_change_order") {
      const projectId = String(body.project_id || "");
      const items = normalizeChangeOrderItems(body);
      if (!projectId || items.length === 0) return NextResponse.json({ message: "请至少填写一条变更项目" }, { status: 400 });
      const project = getProjectForChangeOrder(db, projectId);
      if (!project) return NextResponse.json({ message: "未找到工地" }, { status: 404 });

      const summary = getChangeOrderSummary(items);
      const discount = getChangeOrderDiscount(body, summary.grossAmount);
      if (discount.amount > summary.grossAmount) return NextResponse.json({ message: "优惠金额不能大于增项合计" }, { status: 400 });
      if (discount.amount > 0 && !discount.reason) return NextResponse.json({ message: "请填写优惠说明" }, { status: 400 });
      const signedFinalAmount = roundMoney(summary.netAmount - discount.amount);
      const changeType = signedFinalAmount < 0 ? "DEDUCT" : "ADD";
      const finalAmount = Math.abs(signedFinalAmount);
      const ownerConfirmed = 1;
      const authorId = userId;
      const approvalSetup = buildChangeOrderApprovalPlan(db, projectId, finalAmount, authorId);
      const status = approvalSetup ? "PENDING_APPROVAL" : "APPROVED";
      const internalApprovalStatus = approvalSetup ? "PENDING" : "APPROVED";
      const approvedBy = approvalSetup ? null : authorId;
      const id = `SCO${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const changeNo = makeSiteChangeNo(db, projectId);

      const tx = (db as any).transaction(() => {
        db.prepare(`
          INSERT INTO site_change_orders (
            id, project_id, change_no, change_type, title, items, space, phase, reason_type, reason_detail,
            description, gross_amount, discount_amount, discount_reason, amount, cost_estimate, owner_confirmed, owner_confirmed_at, internal_approval_status,
            approved_by, approved_at, included_in_settlement, settlement_status, status, created_by, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END,
            ?, ?, CASE WHEN ? = 'APPROVED' THEN datetime('now') ELSE NULL END, 0, 'NOT_INCLUDED', ?, ?, datetime('now'), datetime('now'))
        `).run(
          id,
          projectId,
          changeNo,
          changeType,
          summary.title,
          JSON.stringify(items),
          summary.space,
          summary.phase,
          String(body.reason_type || "").trim() || null,
          String(body.reason_detail || "").trim() || null,
          summary.description,
          summary.grossAmount,
          discount.amount,
          discount.reason,
          finalAmount,
          summary.costEstimate,
          ownerConfirmed,
          ownerConfirmed,
          internalApprovalStatus,
          approvedBy,
          internalApprovalStatus,
          status,
          authorId,
        );
        if (approvalSetup) {
          createChangeOrderApprovalInstance(db, approvalSetup.plan, {
            changeOrderId: id,
            projectId,
            customerId: project.customer_id,
            createdById: authorId as string,
            title: summary.title,
            amount: finalAmount,
          });
        }
      });
      tx();
      return NextResponse.json({ success: true, id, change_no: changeNo, status }, { status: 201 });
    }

    if (action === "update_change_order") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少变更单" }, { status: 400 });
      const items = normalizeChangeOrderItems(body);
      if (items.length === 0) return NextResponse.json({ message: "请至少填写一条变更项目" }, { status: 400 });
      const existing = db.prepare(`
        SELECT *
        FROM site_change_orders
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `).get(id, projectId) as any;
      if (!existing) return NextResponse.json({ message: "未找到变更单" }, { status: 404 });
      if (existing.status === "CANCELLED") return NextResponse.json({ message: "已作废的变更单不能编辑" }, { status: 400 });
      if (existing.status === "PENDING_APPROVAL" || existing.status === "PENDING_OWNER") {
        return NextResponse.json({ message: "审批中的变更单不能编辑，请等待审批完成或驳回后再编辑" }, { status: 400 });
      }
      const project = getProjectForChangeOrder(db, projectId);
      if (!project) return NextResponse.json({ message: "未找到工地" }, { status: 404 });

      const summary = getChangeOrderSummary(items);
      const discount = getChangeOrderDiscount(body, summary.grossAmount);
      if (discount.amount > summary.grossAmount) return NextResponse.json({ message: "优惠金额不能大于增项合计" }, { status: 400 });
      if (discount.amount > 0 && !discount.reason) return NextResponse.json({ message: "请填写优惠说明" }, { status: 400 });
      const signedFinalAmount = roundMoney(summary.netAmount - discount.amount);
      const changeType = signedFinalAmount < 0 ? "DEDUCT" : "ADD";
      const finalAmount = Math.abs(signedFinalAmount);
      const ownerConfirmed = 1;
      const authorId = userId;
      const approvalSetup = existing.status !== "APPROVED" ? buildChangeOrderApprovalPlan(db, projectId, finalAmount, authorId) : null;
      const nextStatus = existing.status === "APPROVED" ? "APPROVED" : approvalSetup ? "PENDING_APPROVAL" : "APPROVED";
      const nextApprovalStatus = existing.status === "APPROVED" ? "APPROVED" : approvalSetup ? "PENDING" : "APPROVED";
      const nextSettlementIncluded = existing.status === "APPROVED" ? Number(existing.included_in_settlement || 0) : 0;
      const nextSettlementStatus = nextSettlementIncluded === 1 ? "INCLUDED" : "NOT_INCLUDED";
      const nextApprovedBy = existing.status === "APPROVED" ? existing.approved_by : (!approvalSetup ? authorId : null);
      const keepApprovedAt = existing.status === "APPROVED" ? existing.approved_at : null;
      const directApproved = existing.status !== "APPROVED" && !approvalSetup ? 1 : 0;

      const tx = (db as any).transaction(() => {
        if (existing.status !== "APPROVED") cancelChangeOrderApprovalInstances(db, id);
        db.prepare(`
          UPDATE site_change_orders
          SET change_type = ?,
            title = ?,
            items = ?,
            space = ?,
            phase = ?,
            reason_type = ?,
            reason_detail = ?,
            description = ?,
            gross_amount = ?,
            discount_amount = ?,
            discount_reason = ?,
            amount = ?,
            cost_estimate = ?,
            owner_confirmed = ?,
            owner_confirmed_at = CASE WHEN ? = 1 THEN COALESCE(owner_confirmed_at, datetime('now')) ELSE NULL END,
            internal_approval_status = ?,
            approved_by = ?,
            approved_at = CASE WHEN ? = 1 THEN datetime('now') ELSE ? END,
            rejected_reason = NULL,
            included_in_settlement = ?,
            settlement_status = ?,
            status = ?,
            updated_at = datetime('now')
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL
        `).run(
          changeType,
          summary.title,
          JSON.stringify(items),
          summary.space,
          summary.phase,
          String(body.reason_type || "").trim() || null,
          String(body.reason_detail || "").trim() || null,
          summary.description,
          summary.grossAmount,
          discount.amount,
          discount.reason,
          finalAmount,
          summary.costEstimate,
          ownerConfirmed,
          ownerConfirmed,
          nextApprovalStatus,
          nextApprovedBy,
          directApproved,
          keepApprovedAt,
          nextSettlementIncluded,
          nextSettlementStatus,
          nextStatus,
          id,
          projectId,
        );
        if (approvalSetup) {
          createChangeOrderApprovalInstance(db, approvalSetup.plan, {
            changeOrderId: id,
            projectId,
            customerId: project.customer_id,
            createdById: authorId as string,
            title: summary.title,
            amount: finalAmount,
          });
        }
      });
      tx();
      return NextResponse.json({ success: true });
    }

    if (action === "confirm_change_owner") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少变更单" }, { status: 400 });
      const order = db.prepare(`
        SELECT *
        FROM site_change_orders
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `).get(id, projectId) as any;
      if (!order) return NextResponse.json({ message: "未找到变更单" }, { status: 404 });
      if (["CANCELLED", "REJECTED"].includes(order.status)) return NextResponse.json({ message: "已作废或已驳回的变更单不能确认" }, { status: 400 });
      if (order.status === "APPROVED") return NextResponse.json({ success: true });
      const project = getProjectForChangeOrder(db, projectId);
      if (!project) return NextResponse.json({ message: "未找到工地" }, { status: 404 });
      const authorId = userId;
      const approvalSetup = buildChangeOrderApprovalPlan(db, projectId, Number(order.amount || 0), authorId);
      const nextStatus = approvalSetup ? "PENDING_APPROVAL" : "APPROVED";
      const nextApprovalStatus = approvalSetup ? "PENDING" : "APPROVED";
      const approvedBy = approvalSetup ? null : authorId;
      const tx = (db as any).transaction(() => {
        cancelChangeOrderApprovalInstances(db, id);
        db.prepare(`
          UPDATE site_change_orders
          SET owner_confirmed = 1,
            owner_confirmed_at = COALESCE(owner_confirmed_at, datetime('now')),
            internal_approval_status = ?,
            approved_by = ?,
            approved_at = CASE WHEN ? = 'APPROVED' THEN datetime('now') ELSE NULL END,
            rejected_reason = NULL,
            status = ?,
            updated_at = datetime('now')
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL AND status NOT IN ('CANCELLED','REJECTED')
        `).run(nextApprovalStatus, approvedBy, nextApprovalStatus, nextStatus, id, projectId);
        if (approvalSetup) {
          createChangeOrderApprovalInstance(db, approvalSetup.plan, {
            changeOrderId: id,
            projectId,
            customerId: project.customer_id,
            createdById: authorId as string,
            title: order.title,
            amount: Number(order.amount || 0),
          });
        }
      });
      tx();
      return NextResponse.json({ success: true, status: nextStatus });
    }

    if (action === "approve_change_order") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少变更单" }, { status: 400 });
      const order = db.prepare("SELECT id FROM site_change_orders WHERE id = ? AND project_id = ? AND deleted_at IS NULL").get(id, projectId) as any;
      if (!order) return NextResponse.json({ message: "未找到变更单" }, { status: 404 });
      if (hasPendingChangeOrderApproval(db, id)) {
        return NextResponse.json({ message: "该变更单正在审批流中，请到待办中心处理" }, { status: 400 });
      }
      const approverId = userId;
      approveChangeOrder(db, id, approverId);
      return NextResponse.json({ success: true });
    }

    if (action === "reject_change_order") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少变更单" }, { status: 400 });
      const order = db.prepare("SELECT id FROM site_change_orders WHERE id = ? AND project_id = ? AND deleted_at IS NULL").get(id, projectId) as any;
      if (!order) return NextResponse.json({ message: "未找到变更单" }, { status: 404 });
      if (hasPendingChangeOrderApproval(db, id)) {
        return NextResponse.json({ message: "该变更单正在审批流中，请到待办中心处理" }, { status: 400 });
      }
      rejectChangeOrderWithApproval(db, id, String(body.rejected_reason || "").trim() || "审批驳回");
      return NextResponse.json({ success: true });
    }

    if (action === "update_change_settlement") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少变更单" }, { status: 400 });
      const included = body.included_in_settlement ? 1 : 0;
      db.prepare(`
        UPDATE site_change_orders
        SET included_in_settlement = ?,
          settlement_status = CASE WHEN ? = 1 THEN 'INCLUDED' ELSE 'NOT_INCLUDED' END,
          updated_at = datetime('now')
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL AND status = 'APPROVED'
      `).run(included, included, id, projectId);
      return NextResponse.json({ success: true });
    }

    if (action === "cancel_change_order") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少变更单" }, { status: 400 });
      const tx = (db as any).transaction(() => {
        cancelChangeOrderApprovalInstances(db, id);
        db.prepare(`
          UPDATE site_change_orders
          SET status = 'CANCELLED',
            rejected_reason = ?,
            updated_at = datetime('now')
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL
        `).run(String(body.reason || "").trim() || "已作废", id, projectId);
      });
      tx();
      return NextResponse.json({ success: true });
    }

    if (action === "delete_change_order") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少变更单" }, { status: 400 });
      const tx = (db as any).transaction(() => {
        cancelChangeOrderApprovalInstances(db, id);
        db.prepare(`
          UPDATE site_change_orders
          SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL
        `).run(id, projectId);
      });
      tx();
      return NextResponse.json({ success: true });
    }

    if (action === "add_quantity_review") {
      const projectId = String(body.project_id || "");
      const items = normalizeQuantityReviewItems(body);
      if (!projectId) return NextResponse.json({ message: "缺少工地" }, { status: 400 });
      if (items.length === 0) return NextResponse.json({ message: "请至少填写一条复核明细" }, { status: 400 });
      const project = getProjectForChangeOrder(db, projectId);
      if (!project) return NextResponse.json({ message: "未找到工地" }, { status: 404 });
      const summary = getQuantityReviewSummary(items);
      const id = `QTY${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const reviewNo = makeQuantityReviewNo(db, projectId);
      db.prepare(`
        INSERT INTO site_quantity_reviews (
          id, project_id, review_no, title, phase, items, add_amount, deduct_amount, net_amount,
          status, evidence_note, created_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', ?, ?, datetime('now'), datetime('now'))
      `).run(
        id,
        projectId,
        reviewNo,
        String(body.title || summary.title).trim() || summary.title,
        String(body.phase || summary.phase || "").trim() || null,
        JSON.stringify(items),
        summary.addAmount,
        summary.deductAmount,
        summary.netAmount,
        String(body.evidence_note || "").trim() || null,
        userId,
      );
      return NextResponse.json({ success: true, id, review_no: reviewNo }, { status: 201 });
    }

    if (action === "confirm_quantity_review") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少复核单" }, { status: 400 });
      const review = db.prepare(`
        SELECT id
        FROM site_quantity_reviews
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `).get(id, projectId) as any;
      if (!review) return NextResponse.json({ message: "未找到复核单" }, { status: 404 });
      db.prepare(`
        UPDATE site_quantity_reviews
        SET status = 'CONFIRMED',
          confirmed_by = ?,
          confirmed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL AND status NOT IN ('CANCELLED','FINANCE_CREATED')
      `).run(userId, id, projectId);
      return NextResponse.json({ success: true });
    }

    if (action === "cancel_quantity_review") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少复核单" }, { status: 400 });
      db.prepare(`
        UPDATE site_quantity_reviews
        SET status = 'CANCELLED',
          updated_at = datetime('now')
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL AND generated_change_order_id IS NULL
      `).run(id, projectId);
      return NextResponse.json({ success: true });
    }

    if (action === "generate_quantity_review_change_order") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少复核单" }, { status: 400 });
      const review = db.prepare(`
        SELECT *
        FROM site_quantity_reviews
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `).get(id, projectId) as any;
      if (!review) return NextResponse.json({ message: "未找到复核单" }, { status: 404 });
      if (review.generated_change_order_id) return NextResponse.json({ message: "该复核单已生成变更单" }, { status: 400 });
      if (review.status !== "CONFIRMED") return NextResponse.json({ message: "请先确认复核单，再生成增减项单" }, { status: 400 });
      const reviewItems = normalizeQuantityReviewItems({ items: parseContent(review.items) });
      const changeItems = makeChangeOrderItemsFromQuantityReview(reviewItems);
      if (changeItems.length === 0) return NextResponse.json({ message: "该复核单没有应收应退差额" }, { status: 400 });
      const project = getProjectForChangeOrder(db, projectId);
      if (!project) return NextResponse.json({ message: "未找到工地" }, { status: 404 });

      const summary = getChangeOrderSummary(changeItems);
      if (Math.abs(summary.netAmount) <= 0.001) {
        return NextResponse.json({ message: "该复核单净差额为 0，无需生成增减项单" }, { status: 400 });
      }
      const signedFinalAmount = roundMoney(summary.netAmount);
      const changeType = signedFinalAmount < 0 ? "DEDUCT" : "ADD";
      const finalAmount = Math.abs(signedFinalAmount);
      const authorId = userId;
      const approvalSetup = buildChangeOrderApprovalPlan(db, projectId, finalAmount, authorId);
      const status = approvalSetup ? "PENDING_APPROVAL" : "APPROVED";
      const internalApprovalStatus = approvalSetup ? "PENDING" : "APPROVED";
      const approvedBy = approvalSetup ? null : authorId;
      const changeOrderId = `SCO${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const changeNo = makeSiteChangeNo(db, projectId);
      const tx = (db as any).transaction(() => {
        db.prepare(`
          INSERT INTO site_change_orders (
            id, project_id, change_no, change_type, title, items, space, phase, reason_type, reason_detail,
            description, gross_amount, discount_amount, discount_reason, amount, cost_estimate, owner_confirmed, owner_confirmed_at, internal_approval_status,
            approved_by, approved_at, included_in_settlement, settlement_status, status, created_by, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, '工程量复核', ?, ?, ?, 0, NULL, ?, ?, 1, datetime('now'),
            ?, ?, CASE WHEN ? = 'APPROVED' THEN datetime('now') ELSE NULL END, 0, 'NOT_INCLUDED', ?, ?, datetime('now'), datetime('now'))
        `).run(
          changeOrderId,
          projectId,
          changeNo,
          changeType,
          `工程量复核：${review.title || summary.title}`,
          JSON.stringify(changeItems),
          summary.space,
          summary.phase || review.phase || null,
          `${review.review_no || "复核单"}生成`,
          summary.description,
          summary.grossAmount,
          finalAmount,
          summary.costEstimate,
          internalApprovalStatus,
          approvedBy,
          internalApprovalStatus,
          status,
          authorId,
        );
        db.prepare(`
          UPDATE site_quantity_reviews
          SET status = 'FINANCE_CREATED',
            generated_change_order_id = ?,
            updated_at = datetime('now')
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL
        `).run(changeOrderId, id, projectId);
        if (approvalSetup) {
          createChangeOrderApprovalInstance(db, approvalSetup.plan, {
            changeOrderId,
            projectId,
            customerId: project.customer_id,
            createdById: authorId as string,
            title: `工程量复核：${review.title || summary.title}`,
            amount: finalAmount,
          });
        }
      });
      tx();
      return NextResponse.json({ success: true, id: changeOrderId, change_no: changeNo, status });
    }

    if (action === "generate_owner_settlement_bill") {
      const projectId = String(body.project_id || "");
      if (!projectId) return NextResponse.json({ message: "缺少工地" }, { status: 400 });
      const project = getProjectForChangeOrder(db, projectId);
      if (!project) return NextResponse.json({ message: "未找到工地" }, { status: 404 });

      const toMoney = (value: any) => roundMoney(Number.isFinite(Number(value)) ? Number(value) : 0);
      const contractAmount = toMoney(body.contract_amount);
      const quotationAmount = toMoney(body.quotation_amount);
      const quotationDiscountAmount = toMoney(body.quotation_discount_amount);
      const changeAddAmount = toMoney(body.change_add_amount);
      const changeDeductAmount = toMoney(body.change_deduct_amount);
      const changeNetAmount = toMoney(body.change_net_amount);
      const settlementAmount = toMoney(body.settlement_amount);
      const receivedAmount = toMoney(body.received_amount);
      const receivableAmount = Math.max(0, toMoney(body.receivable_amount));
      const refundAmount = Math.max(0, toMoney(body.refund_amount));
      const budgetCostAmount = toMoney(body.budget_cost_amount);
      const actualCostAmount = toMoney(body.actual_cost_amount);
      const actualProfitAmount = toMoney(body.actual_profit_amount);
      const actualProfitRate = roundMoney(Number.isFinite(Number(body.actual_profit_rate)) ? Number(body.actual_profit_rate) : 0);
      const snapshotSource = body.snapshot && typeof body.snapshot === "object" ? body.snapshot : {};
      const snapshot = JSON.stringify({
        ...snapshotSource,
        generated_at: new Date().toISOString(),
        project: {
          id: project.id,
          name: project.name,
          customer_name: project.customer_name,
        },
      });
      const id = `OSB${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const billNo = makeOwnerSettlementBillNo(db, projectId);
      db.prepare(`
        INSERT INTO site_owner_settlement_bills (
          id, project_id, bill_no, status, contract_id, contract_amount, quotation_amount, quotation_discount_amount,
          change_add_amount, change_deduct_amount, change_net_amount, settlement_amount, received_amount,
          receivable_amount, refund_amount, budget_cost_amount, actual_cost_amount, actual_profit_amount,
          actual_profit_rate, snapshot, created_by, created_at, updated_at
        )
        VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id,
        projectId,
        billNo,
        String(body.contract_id || "").trim() || null,
        contractAmount,
        quotationAmount,
        quotationDiscountAmount,
        changeAddAmount,
        changeDeductAmount,
        changeNetAmount,
        settlementAmount,
        receivedAmount,
        receivableAmount,
        refundAmount,
        budgetCostAmount,
        actualCostAmount,
        actualProfitAmount,
        actualProfitRate,
        snapshot,
        userId,
      );
      return NextResponse.json({ success: true, id, bill_no: billNo }, { status: 201 });
    }

    if (action === "confirm_owner_settlement_bill") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少结算单" }, { status: 400 });
      const bill = db.prepare(`
        SELECT id, status
        FROM site_owner_settlement_bills
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `).get(id, projectId) as any;
      if (!bill) return NextResponse.json({ message: "未找到结算单" }, { status: 404 });
      if (bill.status === "CONFIRMED") return NextResponse.json({ success: true });
      if (bill.status === "CANCELLED") return NextResponse.json({ message: "已作废的结算单不能确认" }, { status: 400 });
      db.prepare(`
        UPDATE site_owner_settlement_bills
        SET status = 'CONFIRMED',
          confirmed_by = ?,
          confirmed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `).run(userId, id, projectId);
      return NextResponse.json({ success: true });
    }

    if (action === "cancel_owner_settlement_bill") {
      const projectId = String(body.project_id || "");
      const id = String(body.id || "");
      if (!projectId || !id) return NextResponse.json({ message: "缺少结算单" }, { status: 400 });
      const bill = db.prepare(`
        SELECT id, status
        FROM site_owner_settlement_bills
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `).get(id, projectId) as any;
      if (!bill) return NextResponse.json({ message: "未找到结算单" }, { status: 404 });
      if (bill.status === "CONFIRMED") return NextResponse.json({ message: "已确认的结算单不能作废" }, { status: 400 });
      db.prepare(`
        UPDATE site_owner_settlement_bills
        SET status = 'CANCELLED',
          updated_at = datetime('now')
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
      `).run(id, projectId);
      return NextResponse.json({ success: true });
    }

    if (action === "add_material_order") {
      const projectId = String(body.project_id || "");
      if (!projectId) return NextResponse.json({ message: "缺少项目 ID" }, { status: 400 });
      const project = db.prepare(`
        SELECT p.id, p.company_id, c.service_store,
          branch.name as branch_name,
          creatorOrg.name as creator_org_name
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id AND c.deleted_at IS NULL
        LEFT JOIN org_units branch ON c.service_store = branch.name AND branch.deleted_at IS NULL
        LEFT JOIN users creator ON c.created_by_id = creator.id AND creator.deleted_at IS NULL
        LEFT JOIN org_units creatorOrg ON creator.org_unit_id = creatorOrg.id AND creatorOrg.deleted_at IS NULL
        WHERE p.id = ? AND p.deleted_at IS NULL
        LIMIT 1
      `).get(projectId) as any;
      if (!project) return NextResponse.json({ message: "未找到项目" }, { status: 404 });

      const orderTypeInput = String(body.order_type || "").trim();
      const orderType = (materialOrderTypes as readonly string[]).includes(orderTypeInput) ? orderTypeInput : "MAIN_SUPPLIER";
      const defaultStatus = orderType === "AUXILIARY_MONTHLY" ? "RECEIVED" : orderType === "AUXILIARY_WAREHOUSE" ? "PENDING" : "ORDERED";
      const statusInput = String(body.status || defaultStatus).trim();
      const status = (materialOrderStatuses as readonly string[]).includes(statusInput) ? statusInput : defaultStatus;
      const items = Array.isArray(body.items)
        ? body.items
            .map((item: any) => {
              const materialId = String(item?.material_id || "").trim();
              const quantity = Math.max(0, Number(item?.quantity || 0) || 0);
              const unitPrice = Math.max(0, Number(item?.unit_price || 0) || 0);
              const rawReceivedQty = Math.max(0, Number(item?.received_qty || 0) || 0);
              const receivedQty = orderType === "AUXILIARY_WAREHOUSE" ? quantity : rawReceivedQty;
              return {
                materialId,
                quantity,
                unitPrice,
                receivedQty: Math.min(receivedQty, quantity),
                remark: String(item?.remark || "").trim() || null,
              };
            })
            .filter((item: any) => item.materialId && item.quantity > 0)
        : [];

      if (items.length === 0) return NextResponse.json({ message: "请至少选择一个材料并填写下单数量" }, { status: 400 });

      const authorId = userId;

      const supplierId = String(body.supplier_id || "").trim() || null;
      const orderId = `MO${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const orderNo = makeMaterialOrderNo(db, project.service_store || project.branch_name || project.creator_org_name);
      const totalAmount = items.reduce((sum: number, item: any) => sum + item.quantity * item.unitPrice, 0);
      const paidAmount = Math.max(0, Math.min(totalAmount, Number(body.paid_amount || 0) || 0));
      const settlementInput = String(body.settlement_status || "").trim();
      const settlementStatus = (materialSettlementStatuses as readonly string[]).includes(settlementInput)
        ? settlementInput
        : orderType === "AUXILIARY_WAREHOUSE"
          ? "SETTLED"
          : paidAmount >= totalAmount && totalAmount > 0
            ? "SETTLED"
            : "UNSETTLED";
	      const orderDate = String(body.order_date || "").trim() || new Date().toISOString().slice(0, 10);
	      const deliveryDate = String(body.delivery_date || "").trim() || null;
	      const notes = String(body.notes || "").trim() || null;
	      const settlementMonth = String(body.settlement_month || "").trim() || orderDate.slice(0, 7);
	      const handlerName = String(body.handler_name || "").trim() || null;
	      const warehouseStatus = orderType === "AUXILIARY_WAREHOUSE" && status !== "RECEIVED" ? "WAITING" : "DONE";
	      const receivedAt = status === "RECEIVED" ? new Date().toISOString() : null;
	      const authorName = (db.prepare("SELECT name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(authorId) as any)?.name || null;
      if (orderType === "AUXILIARY_WAREHOUSE") {
        const materialRows = db.prepare(`
          SELECT id, company_id, name, material_type, supply_mode, is_active
          FROM materials
          WHERE id = ? AND deleted_at IS NULL
          LIMIT 1
        `);
        items.forEach((item: any, index: number) => {
          const material = materialRows.get(item.materialId) as any;
          if (!material || Number(material.is_active ?? 1) !== 1) {
            throw new Error(`第${index + 1}行材料不存在或已下架`);
          }
          if (material.company_id !== project.company_id) {
            throw new Error(`第${index + 1}行材料不属于当前公司`);
          }
          if (String(material.material_type || "AUXILIARY") === "MAIN" || String(material.supply_mode || "WAREHOUSE") !== "WAREHOUSE") {
            throw new Error(`第${index + 1}行不是公司仓库辅材，不能从仓库下单`);
          }
        });
      }

      const insertOrder = db.prepare(`
        INSERT INTO material_orders (
          id, company_id, project_id, supplier_id, order_no, status, total_amount, paid_amount,
          order_date, delivery_date, notes, created_by_id, order_type, warehouse_status, settlement_status,
          settlement_month, handler_name, received_at, stock_deducted, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      const insertItem = db.prepare(`
        INSERT INTO material_order_items (
          id, order_id, material_id, quantity, unit_price, total_price, received_qty, remark, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      try {
        db.prepare("BEGIN").run();
        insertOrder.run(
          orderId,
          project.company_id,
          projectId,
          supplierId,
          orderNo,
          status,
          totalAmount,
          paidAmount,
          orderDate,
          deliveryDate,
          notes,
          authorId,
          orderType,
          warehouseStatus,
          settlementStatus,
          settlementMonth,
          handlerName,
          receivedAt,
          0,
        );
        items.forEach((item: any, index: number) => {
          insertItem.run(
            `MOI${Date.now()}${index}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            orderId,
            item.materialId,
            item.quantity,
            item.unitPrice,
            item.quantity * item.unitPrice,
            item.receivedQty,
            item.remark,
          );
        });
        if (orderType === "AUXILIARY_WAREHOUSE" && status === "RECEIVED") {
          deductMaterialStock(db, items, {
            sourceType: "material_order",
            sourceId: orderId,
            sourceNo: orderNo,
            operatorId: authorId,
            operatorName: authorName,
            reason: "辅材订单确认出库",
          });
          db.prepare("UPDATE material_order_items SET stock_deducted_qty = quantity WHERE order_id = ?").run(orderId);
          db.prepare("UPDATE material_orders SET stock_deducted = 1 WHERE id = ?").run(orderId);
        }
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }

      return NextResponse.json({ success: true, id: orderId, order_no: orderNo }, { status: 201 });
    }

    if (action === "update_material_order") {
      const projectId = String(body.project_id || "");
      const orderId = String(body.id || "").trim();
      if (!projectId || !orderId) return NextResponse.json({ message: "缺少材料订单" }, { status: 400 });
      const statusInput = String(body.status || "").trim();
      const status = (materialOrderStatuses as readonly string[]).includes(statusInput) ? statusInput : null;
      const settlementInput = String(body.settlement_status || "").trim();
      const settlementStatus = (materialSettlementStatuses as readonly string[]).includes(settlementInput) ? settlementInput : null;
      const paidAmountInput = body.paid_amount === undefined ? undefined : Math.max(0, Number(body.paid_amount || 0) || 0);
      const deliveryDateInput = body.delivery_date === undefined ? undefined : String(body.delivery_date || "").trim() || null;
      const notesInput = body.notes === undefined ? undefined : String(body.notes || "").trim() || null;
      const existing = db.prepare("SELECT total_amount, order_no, order_type, status, stock_deducted FROM material_orders WHERE id = ? AND project_id = ? AND deleted_at IS NULL").get(orderId, projectId) as any;
      if (!existing) return NextResponse.json({ message: "未找到材料订单" }, { status: 404 });

      const nextStatus = status || existing.status;
      if (existing.order_type === "AUXILIARY_WAREHOUSE" && nextStatus === "RECEIVED" && existing.status !== "RECEIVED") {
        return NextResponse.json({ message: "仓库辅材订单请点击「确认出库」，不能直接改为已出库" }, { status: 400 });
      }
      const shouldRestoreStock = existing.order_type === "AUXILIARY_WAREHOUSE"
        && Number(existing.stock_deducted || 0) === 1
        && existing.status !== "CANCELLED"
        && nextStatus === "CANCELLED";
      const shouldDeductStock = existing.order_type === "AUXILIARY_WAREHOUSE"
        && Number(existing.stock_deducted || 0) !== 1
        && existing.status === "CANCELLED"
        && nextStatus !== "CANCELLED";

      try {
        db.prepare("BEGIN").run();
        const stockItems = shouldRestoreStock
          ? getOrderDeductedStockItems(db, orderId)
          : shouldDeductStock
            ? getOrderStockItems(db, orderId)
            : [];
        if (shouldDeductStock) assertEnoughMaterialStock(db, stockItems);
        db.prepare(`
          UPDATE material_orders
          SET status = COALESCE(?, status),
            paid_amount = COALESCE(?, paid_amount),
            settlement_status = COALESCE(?, settlement_status),
            delivery_date = COALESCE(?, delivery_date),
            notes = COALESCE(?, notes),
            received_at = CASE WHEN ? = 'RECEIVED' THEN COALESCE(received_at, datetime('now')) ELSE received_at END,
            warehouse_status = CASE WHEN ? = 'RECEIVED' THEN 'DONE' ELSE warehouse_status END,
            stock_deducted = CASE
              WHEN ? THEN 0
              WHEN ? THEN 1
              ELSE stock_deducted
            END,
            updated_at = datetime('now')
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL
        `).run(
          status,
          paidAmountInput === undefined ? null : Math.min(Number(existing.total_amount || 0), paidAmountInput),
          settlementStatus,
          deliveryDateInput === undefined ? null : deliveryDateInput,
          notesInput === undefined ? null : notesInput,
          status,
          status,
          shouldRestoreStock ? 1 : 0,
          shouldDeductStock ? 1 : 0,
          orderId,
          projectId,
        );
	        const operatorName = userId
	          ? (db.prepare("SELECT name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(userId) as any)?.name || null
	          : null;
	        if (shouldRestoreStock) restoreMaterialStock(db, stockItems, {
	          sourceType: "material_order_cancel",
	          sourceId: orderId,
	          sourceNo: existing.order_no,
	          operatorId: userId || null,
	          operatorName,
	          reason: "订单取消恢复库存",
	        });
        if (shouldDeductStock) deductMaterialStock(db, stockItems, {
          sourceType: "material_order",
          sourceId: orderId,
          sourceNo: existing.order_no,
	          operatorId: userId || null,
          operatorName,
          reason: "辅材订单出库",
        });
        if (shouldRestoreStock) {
          db.prepare("UPDATE material_order_items SET stock_deducted_qty = 0 WHERE order_id = ?").run(orderId);
        }
        if (shouldDeductStock) {
          db.prepare("UPDATE material_order_items SET stock_deducted_qty = quantity WHERE order_id = ?").run(orderId);
        }
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }

      return NextResponse.json({ success: true });
    }

    if (action === "confirm_material_outbound") {
      const projectId = String(body.project_id || "");
      const orderId = String(body.id || "").trim();
      if (!projectId || !orderId) return NextResponse.json({ message: "缺少材料订单" }, { status: 400 });
      const existing = db.prepare(`
        SELECT *
        FROM material_orders
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL AND order_type = 'AUXILIARY_WAREHOUSE'
        LIMIT 1
      `).get(orderId, projectId) as any;
      if (!existing) return NextResponse.json({ message: "未找到仓库辅材订单" }, { status: 404 });
      if (existing.status === "CANCELLED") return NextResponse.json({ message: "已取消订单不能确认出库" }, { status: 400 });
      const pendingItems = getOrderPendingStockItems(db, orderId);
      if (pendingItems.length === 0 || pendingItems.every((item) => Number(item.quantity || 0) <= 0)) {
        return NextResponse.json({ message: "请先填写本次出库数量" }, { status: 400 });
      }
      const operatorName = userId
        ? (db.prepare("SELECT name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(userId) as any)?.name || null
        : null;
      try {
        db.prepare("BEGIN").run();
        assertEnoughMaterialStock(db, pendingItems);
        deductMaterialStock(db, pendingItems, {
          sourceType: "material_order",
          sourceId: orderId,
          sourceNo: existing.order_no,
          operatorId: userId || null,
          operatorName,
          reason: "辅材订单确认出库",
        });
        markOrderStockDeducted(db, orderId);
        const orderSummary = db.prepare(`
          SELECT COALESCE(SUM(quantity), 0) as total_quantity,
            COALESCE(SUM(stock_deducted_qty), 0) as deducted_quantity
          FROM material_order_items
          WHERE order_id = ?
        `).get(orderId) as any;
        const totalQuantity = Number(orderSummary?.total_quantity || 0);
        const deductedQuantity = Number(orderSummary?.deducted_quantity || 0);
        const nextStatus = totalQuantity > 0 && deductedQuantity >= totalQuantity ? "RECEIVED" : "PARTIAL";
        db.prepare(`
          UPDATE material_orders
          SET status = ?,
            warehouse_status = CASE WHEN ? = 'RECEIVED' THEN 'DONE' ELSE 'WAITING' END,
            received_at = COALESCE(received_at, datetime('now')),
            stock_deducted = CASE WHEN ? = 'RECEIVED' THEN 1 ELSE stock_deducted END,
            updated_at = datetime('now')
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL
        `).run(nextStatus, nextStatus, nextStatus, orderId, projectId);
        db.prepare("COMMIT").run();
        return NextResponse.json({ success: true, status: nextStatus });
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }
    }

    if (action === "update_material_received") {
      const projectId = String(body.project_id || "");
      const itemId = String(body.item_id || "").trim();
      if (!projectId || !itemId) return NextResponse.json({ message: "缺少材料明细" }, { status: 400 });
      const receivedQty = Math.max(0, Number(body.received_qty || 0) || 0);
      const item = db.prepare(`
        SELECT item.id, item.quantity, item.order_id, COALESCE(item.stock_deducted_qty, 0) as stock_deducted_qty,
          mo.order_type, mo.status as order_status
        FROM material_order_items item
        INNER JOIN material_orders mo ON item.order_id = mo.id
        WHERE item.id = ? AND mo.project_id = ? AND mo.deleted_at IS NULL
      `).get(itemId, projectId) as any;
      if (!item) return NextResponse.json({ message: "未找到材料明细" }, { status: 404 });
      const currentDeductedQty = Number(item.stock_deducted_qty || 0);
      const nextReceivedInput = body.outbound_qty === undefined
        ? receivedQty
        : currentDeductedQty + Math.max(0, Number(body.outbound_qty || 0) || 0);

      db.prepare("UPDATE material_order_items SET received_qty = ? WHERE id = ?").run(
        Math.max(currentDeductedQty, Math.min(Number(item.quantity || 0), nextReceivedInput)),
        itemId,
      );
      const orderSummary = db.prepare(`
        SELECT COALESCE(SUM(quantity), 0) as total_quantity,
          COALESCE(SUM(received_qty), 0) as received_quantity,
          COALESCE(SUM(stock_deducted_qty), 0) as deducted_quantity
        FROM material_order_items
        WHERE order_id = ?
      `).get(item.order_id) as any;
      const totalQuantity = Number(orderSummary?.total_quantity || 0);
      const receivedQuantity = Number(orderSummary?.received_quantity || 0);
      const deductedQuantity = Number(orderSummary?.deducted_quantity || 0);
      const nextStatus = item.order_type === "AUXILIARY_WAREHOUSE"
        ? totalQuantity > 0 && deductedQuantity >= totalQuantity
          ? "RECEIVED"
          : deductedQuantity > 0
            ? "PARTIAL"
            : item.order_status === "PENDING" ? "PENDING" : "ORDERED"
        : totalQuantity > 0 && receivedQuantity >= totalQuantity ? "RECEIVED" : receivedQuantity > 0 ? "PARTIAL" : "ORDERED";
      db.prepare(`
        UPDATE material_orders
        SET status = ?,
          warehouse_status = CASE WHEN ? = 'RECEIVED' THEN 'DONE' ELSE warehouse_status END,
          received_at = CASE WHEN ? = 'RECEIVED' THEN COALESCE(received_at, datetime('now')) ELSE received_at END,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(nextStatus, nextStatus, nextStatus, item.order_id);

      return NextResponse.json({ success: true, status: nextStatus });
    }

    if (action === "save_handover") {
      const projectId = String(body.project_id || "");
      if (!projectId) return NextResponse.json({ message: "缺少项目 ID" }, { status: 400 });
      const statusInput = String(body.status || "draft").trim();
      const status = (handoverStatuses as readonly string[]).includes(statusInput) ? statusInput : "draft";
      const checks = Array.isArray(body.checks) ? body.checks : [];
      const designerConfirmed = body.designer_confirmed ? 1 : 0;
      const managerConfirmed = body.manager_confirmed ? 1 : 0;
      const ownerConfirmed = body.owner_confirmed ? 1 : 0;
      const plannedStart = normalizeDateOnly(body.planned_start);
      const durationDays = Math.max(0, Math.ceil(Number(body.duration_days || 0) || 0));
      const weekendConstruction = body.weekend_construction ? 1 : 0;
      const holidayConstruction = body.holiday_construction ? 1 : 0;
      const hasFloorHeating = body.has_floor_heating ? 1 : 0;
      const constructionTemplateId = String(body.construction_template_id || "").trim();
      const constructionTemplateName = String(body.construction_template_name || "").trim();
      const constructionTemplateDescription = String(body.construction_template_description || "").trim();
      const constructionTemplateDecorationType = String(body.construction_template_decoration_type || "").trim();
      const constructionTemplateDurationText = String(body.construction_template_duration_text || "").trim();
      const constructionTemplateStageCount = Math.max(0, Math.floor(Number(body.construction_template_stage_count || 0) || 0));
      const constructionTemplateNodeCount = Math.max(0, Math.floor(Number(body.construction_template_node_count || 0) || 0));
      const constructionTemplateAcceptanceCount = Math.max(0, Math.floor(Number(body.construction_template_acceptance_count || 0) || 0));
      const calculatedPlannedEnd = calculateSitePlannedEnd(plannedStart, durationDays, {
        weekendConstruction: Boolean(weekendConstruction),
        holidayConstruction: Boolean(holidayConstruction),
      });
      const plannedEnd = calculatedPlannedEnd || normalizeDateOnly(body.planned_end);

      if (status === "completed" && !constructionTemplateId) {
        return NextResponse.json({ message: "请选择施工模板后再完成交底" }, { status: 400 });
      }
      if (status === "completed" && (!plannedStart || durationDays <= 0)) {
        return NextResponse.json({ message: "请选择计划开工并填写签约工期后再完成交底" }, { status: 400 });
      }

      const handoverProject = db.prepare(`
        SELECT site_stage, status
        FROM projects
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(projectId) as any;
      if (!handoverProject) {
        return NextResponse.json({ message: "工地不存在" }, { status: 404 });
      }
      const handoverLocked = ["CONSTRUCTION", "OWNER_SETTLEMENT", "SITE_SETTLEMENT"].includes(String(handoverProject.site_stage || "").trim().toUpperCase())
        || ["CONSTRUCTION", "COMPLETED", "CLOSED"].includes(String(handoverProject.status || "").trim().toUpperCase());
      const existing = body.handover_id
        ? db.prepare("SELECT id, status, completed_at FROM site_start_handovers WHERE id = ? AND project_id = ? AND deleted_at IS NULL").get(String(body.handover_id), projectId) as any
        : db.prepare("SELECT id, status, completed_at FROM site_start_handovers WHERE project_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1").get(projectId) as any;
      if (existing?.id && handoverLocked && (String(existing.status || "").toLowerCase() === "completed" || existing.completed_at)) {
        return NextResponse.json({ message: "开工已确认，开工交底只能查看，不能再次修改" }, { status: 409 });
      }
      const authorId = userId;
      const payload = {
        scheduled_at: body.scheduled_at ? String(body.scheduled_at) : null,
        planned_start: plannedStart || null,
        planned_end: plannedEnd || null,
        duration_days: durationDays,
        weekend_construction: weekendConstruction,
        holiday_construction: holidayConstruction,
        has_floor_heating: hasFloorHeating,
        construction_template_id: constructionTemplateId || null,
        construction_template_name: constructionTemplateName || null,
        construction_template_description: constructionTemplateDescription || null,
        construction_template_decoration_type: constructionTemplateDecorationType || null,
        construction_template_duration_text: constructionTemplateDurationText || null,
        construction_template_stage_count: constructionTemplateStageCount,
        construction_template_node_count: constructionTemplateNodeCount,
        construction_template_acceptance_count: constructionTemplateAcceptanceCount,
        checks: JSON.stringify(checks),
        owner_present: body.owner_present === false ? 0 : 1,
        key_notes: String(body.key_notes || "").trim(),
        risk_notes: String(body.risk_notes || "").trim(),
        unresolved_items: String(body.unresolved_items || "").trim(),
      };

      if (existing?.id) {
	        db.prepare(`
	          UPDATE site_start_handovers
	          SET status = ?, scheduled_at = ?, planned_start = ?, planned_end = ?, duration_days = ?,
	              weekend_construction = ?, holiday_construction = ?, has_floor_heating = ?,
	              construction_template_id = ?, construction_template_name = ?, construction_template_description = ?,
	              construction_template_decoration_type = ?, construction_template_duration_text = ?,
	              construction_template_stage_count = ?, construction_template_node_count = ?, construction_template_acceptance_count = ?,
	              checks = ?, designer_confirmed = ?, manager_confirmed = ?, owner_confirmed = ?,
	              owner_present = ?, key_notes = ?, risk_notes = ?, unresolved_items = ?,
	              updated_at = datetime('now'), completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, datetime('now')) ELSE completed_at END
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL
        `).run(
          status,
          payload.scheduled_at,
          payload.planned_start,
          payload.planned_end,
          payload.duration_days,
	          payload.weekend_construction,
	          payload.holiday_construction,
	          payload.has_floor_heating,
	          payload.construction_template_id,
	          payload.construction_template_name,
	          payload.construction_template_description,
	          payload.construction_template_decoration_type,
	          payload.construction_template_duration_text,
	          payload.construction_template_stage_count,
	          payload.construction_template_node_count,
	          payload.construction_template_acceptance_count,
	          payload.checks,
	          designerConfirmed,
	          managerConfirmed,
          ownerConfirmed,
          payload.owner_present,
          payload.key_notes,
          payload.risk_notes,
          payload.unresolved_items,
          status,
          existing.id,
          projectId,
        );
      } else {
        const id = `SH${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
	        db.prepare(`
	          INSERT INTO site_start_handovers (
	            id, project_id, status, scheduled_at, planned_start, planned_end, duration_days,
	            weekend_construction, holiday_construction, has_floor_heating,
	            construction_template_id, construction_template_name, construction_template_description,
	            construction_template_decoration_type, construction_template_duration_text,
	            construction_template_stage_count, construction_template_node_count, construction_template_acceptance_count,
	            checks, designer_confirmed, manager_confirmed, owner_confirmed,
	            owner_present, key_notes, risk_notes, unresolved_items, created_by, created_at, updated_at, completed_at
	          )
	          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END)
	        `).run(
	          id,
	          projectId,
          status,
          payload.scheduled_at,
          payload.planned_start,
          payload.planned_end,
          payload.duration_days,
	          payload.weekend_construction,
	          payload.holiday_construction,
	          payload.has_floor_heating,
	          payload.construction_template_id,
	          payload.construction_template_name,
	          payload.construction_template_description,
	          payload.construction_template_decoration_type,
	          payload.construction_template_duration_text,
	          payload.construction_template_stage_count,
	          payload.construction_template_node_count,
	          payload.construction_template_acceptance_count,
	          payload.checks,
	          designerConfirmed,
	          managerConfirmed,
          ownerConfirmed,
          payload.owner_present,
          payload.key_notes,
          payload.risk_notes,
          payload.unresolved_items,
          authorId,
          status,
        );
      }

      if (status === "completed") {
        db.prepare(`
          UPDATE projects
          SET site_stage = CASE WHEN COALESCE(site_stage, '') = '' OR site_stage = 'PENDING_START' THEN 'START_CONFIRM' ELSE site_stage END,
              start_date = COALESCE(?, start_date),
	              planned_end_date = COALESCE(?, planned_end_date),
	              weekend_construction = ?,
	              holiday_construction = ?,
	              has_floor_heating = ?,
	              construction_template_id = COALESCE(?, construction_template_id),
	              construction_template_name = COALESCE(?, construction_template_name),
	              construction_template_description = COALESCE(?, construction_template_description),
	              construction_template_decoration_type = COALESCE(?, construction_template_decoration_type),
	              construction_template_duration_text = COALESCE(?, construction_template_duration_text),
	              construction_template_stage_count = ?,
	              construction_template_node_count = ?,
	              construction_template_acceptance_count = ?,
	              updated_at = datetime('now')
	          WHERE id = ? AND deleted_at IS NULL
	        `).run(
          payload.planned_start,
          payload.planned_end,
	          payload.weekend_construction,
	          payload.holiday_construction,
	          payload.has_floor_heating,
	          payload.construction_template_id,
	          payload.construction_template_name,
	          payload.construction_template_description,
	          payload.construction_template_decoration_type,
	          payload.construction_template_duration_text,
	          payload.construction_template_stage_count,
	          payload.construction_template_node_count,
	          payload.construction_template_acceptance_count,
	          projectId,
	        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ message: "未知操作" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "操作失败" }, { status: 500 });
  }
}
