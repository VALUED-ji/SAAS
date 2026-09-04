import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { getBranchSettingsForCustomer } from "@/lib/branchSettingsLookup";
import {
  calculateChargeableOtherFeeTotals,
  calculateOtherFeeTotals,
  getFeeFormulaText,
  getFeeRuleText,
  getLegacyManagementFeeRate,
  toMoney,
  toNumber,
  type FeeFormulaContext,
} from "@/lib/quotationFeeFormulas";
import { getQuotationRowColor } from "@/lib/quotationRowColors";
import { formatAlphaSequence } from "@/lib/quotationSequence";
import { normalizeQuotationSignatureLabels } from "@/lib/quotationPrintSettings";
import { formatDate } from "@/lib/utils";
import { getAuthContext, hasPermission } from "@/lib/security/authorization";
import { verifyQuotationShareToken } from "@/lib/security/quotationShare";
import { ensureQuotationSchema } from "@/lib/quotationSchema";

type ExportItem = {
  id?: string;
  category: string;
  space?: string | null;
  work_type_id?: string | null;
  work_type_name?: string | null;
  material_category_id?: string | null;
  material_category_name?: string | null;
  name?: string | null;
  spec?: string | null;
  material_model?: string | null;
  remark?: string | null;
  unit?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  material_cost?: number | null;
  labor_cost?: number | null;
  profit_margin?: number | null;
  row_color?: string | null;
  fee_calc_method?: string | null;
  fee_calc_base?: string | null;
  fee_rate?: number | null;
};

type QuotationExportScope = "all" | "all_without_cover" | "base" | "main_material" | "custom_cabinet" | "fees";
type BaseExportColumnKey = "materialUnit" | "materialTotal" | "laborUnit" | "laborTotal" | "subtotal" | "description";
type BaseExportColumnOptions = Record<BaseExportColumnKey, boolean>;

const EXPORT_COLUMN_COUNT = 11;
const EXPORT_FONT_NAME = "SimSun";
const EXPORT_BORDER_COLOR = "DCE4EF";
const EXPORT_HEADER_BORDER_COLOR = "E4EAF2";
const EXPORT_HEADER_FILL = "D9D9D9";
const EXPORT_SPACE_FILL = "D9D9D9";
const EXPORT_SECTION_FILL = "F8FBFF";
const EXPORT_TOTAL_FILL = "EDF4FF";
const builtInDirectCategories = ["base", "main_material", "custom_cabinet"];
const baseExportColumnKeys: BaseExportColumnKey[] = ["materialUnit", "materialTotal", "laborUnit", "laborTotal", "subtotal", "description"];
const defaultBaseExportColumnOptions: BaseExportColumnOptions = {
  materialUnit: true,
  materialTotal: true,
  laborUnit: true,
  laborTotal: true,
  subtotal: true,
  description: true,
};
const builtInCategoryLabels: Record<string, string> = {
  base: "基装",
  main_material: "产品",
  custom_cabinet: "定制柜",
  other: "综合费用",
};

function isBaseCategory(category: unknown) {
  const name = String(category || "").trim();
  return name === "base" || name === "基装" || name === "基装项目";
}

function isOtherCategory(category: unknown) {
  return String(category || "") === "other";
}

function normalizeRoomPart(value: unknown, suffixes: string[]) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  const suffix = suffixes.find((item) => cleaned.endsWith(item));
  return suffix ? cleaned.slice(0, -suffix.length) : cleaned;
}

function getQuotationRoomNumber(quotation: any) {
  if (quotation?.customer_no_room_number === true || quotation?.customer_no_room_number === 1) return "暂无房号";
  const building = normalizeRoomPart(quotation?.customer_building_no, ["号楼", "栋", "幢", "座"]);
  const unit = normalizeRoomPart(quotation?.customer_unit_no, ["单元"]);
  const room = normalizeRoomPart(quotation?.customer_room_no, ["室", "房", "号"]);
  return [building, unit, room].filter(Boolean).join("-");
}

function getExportCommunityText(quotation: any) {
  return String(quotation?.customer_address || quotation?.project_address || quotation?.project_name || "").trim();
}

function getExportProjectAddress(quotation: any) {
  const community = getExportCommunityText(quotation);
  const room = getQuotationRoomNumber(quotation);
  const projectName = String(quotation?.project_name || "").trim();
  if (community && room && room !== "暂无房号" && room !== community) return `${community} ${room}`;
  return community || projectName || room || "";
}

function isMainMaterialCategory(category: unknown) {
  const name = String(category || "").trim();
  if (!name || isBaseCategory(name) || isOtherCategory(name) || isCustomCabinetCategory(name)) return false;
  return true;
}

function isCustomCabinetCategory(category: unknown) {
  const name = String(category || "").trim();
  return name === "custom_cabinet" || name === "定制柜" || name === "定制柜项目";
}

function getCategoryLabel(category: string) {
  if (isBaseCategory(category)) return "基装";
  if (isMainMaterialCategory(category)) return "产品";
  if (isCustomCabinetCategory(category)) return "定制柜";
  return builtInCategoryLabels[category] || category;
}

function buildAppendixNoteContent(rawSettings: any, quotation: any) {
  const templateNote = String(rawSettings?.appendixNote || rawSettings?.quotationNote || "").trim();
  const customerNote = String(quotation?.customer_visible_note || "").trim();
  const parts = [
    templateNote,
    customerNote && customerNote !== templateNote ? `报价备注：\n${customerNote}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

function orderQuoteCategories(categories: string[]) {
  const normalized = uniqueValues(categories.map((category) => {
    if (isBaseCategory(category)) return "base";
    if (isMainMaterialCategory(category)) return "main_material";
    if (isCustomCabinetCategory(category)) return "custom_cabinet";
    if (isOtherCategory(category)) return "other";
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

function ensureQuotationItemColumns(db: any) {
  const columns = db.prepare("PRAGMA table_info(quotation_items)").all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("space")) db.prepare("ALTER TABLE quotation_items ADD COLUMN space TEXT").run();
  if (!names.has("material_model")) db.prepare("ALTER TABLE quotation_items ADD COLUMN material_model TEXT").run();
  if (!names.has("remark")) db.prepare("ALTER TABLE quotation_items ADD COLUMN remark TEXT").run();
  if (!names.has("row_color")) db.prepare("ALTER TABLE quotation_items ADD COLUMN row_color TEXT").run();
  if (!names.has("fee_calc_method")) db.prepare("ALTER TABLE quotation_items ADD COLUMN fee_calc_method TEXT").run();
  if (!names.has("fee_calc_base")) db.prepare("ALTER TABLE quotation_items ADD COLUMN fee_calc_base TEXT").run();
  if (!names.has("fee_rate")) db.prepare("ALTER TABLE quotation_items ADD COLUMN fee_rate REAL").run();
}

function parseSettings(value: string | null) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function roundMoney(value: number) {
  return toMoney(value);
}

function formatDateText(value?: string | Date | null) {
  return value ? formatDate(value) : formatDate(new Date());
}

function formatQuantity(value: unknown) {
  const next = toNumber(value);
  if (Number.isInteger(next)) return next;
  return Number(next.toFixed(2));
}

function formatExportAmount(value: unknown) {
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function maskExportPhone(value?: string | null) {
  const phone = String(value || "").trim();
  if (!phone || phone === "仅微信联系") return "-";
  return /^1\d{10}$/.test(phone) ? phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") : phone;
}

function cleanQuotationExportTitle(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/(?:装修)?报价单$/g, "")
    .trim();
}

function buildExportTitle(quotation: any) {
  const customerName = String(quotation?.customer_name || "").trim();
  const community = getExportCommunityText(quotation);
  const room = getQuotationRoomNumber(quotation);
  const projectName = String(quotation?.project_name || "").trim();
  const siteName = community && room && room !== "暂无房号" && room !== community ? `${community} ${room}` : community || projectName || room;
  const fallbackTitle = cleanQuotationExportTitle(quotation?.title);
  if (customerName && siteName) return siteName.includes(customerName) ? siteName : `${customerName} · ${siteName}`;
  return fallbackTitle || customerName || siteName || "客户工地";
}

function formatChineseDate(value: Date) {
  return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日`;
}

function getCurrentYearLastDayText() {
  const now = new Date();
  return formatChineseDate(new Date(now.getFullYear(), 11, 31));
}

function getPublicImageFile(imageUrl?: string | null) {
  const value = String(imageUrl || "").trim();
  const candidates = [value, "/brand/xingyi-decoration-logo.png"].filter(Boolean);
  for (const candidate of candidates) {
    if (!candidate.startsWith("/")) continue;
    const filePath = path.resolve(process.cwd(), "public", candidate.replace(/^\/+/, ""));
    if (!filePath.startsWith(path.resolve(process.cwd(), "public")) || !existsSync(filePath)) continue;
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
      return { filePath, extension: ext === ".png" ? "png" as const : "jpeg" as const };
    }
  }
  return null;
}

function safeSheetName(value: string) {
  return value.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "装修报价单";
}

function safeFileName(value: string) {
  return encodeURIComponent(value.replace(/[\\/:*?"<>|]/g, "").slice(0, 80) || "装修报价单");
}

function cleanFileNamePart(value: unknown, fallback = "") {
  return String(value || fallback)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/装修报价单/g, "")
    .slice(0, 28);
}

function parseExportScope(value: string | null): QuotationExportScope {
  return value === "all_without_cover" || value === "base" || value === "main_material" || value === "custom_cabinet" || value === "fees" ? value : "all";
}

function parseBaseExportColumns(value: string | null, scope: QuotationExportScope): BaseExportColumnOptions {
  if (scope !== "all" && scope !== "all_without_cover" && scope !== "base") return { ...defaultBaseExportColumnOptions };
  if (value === null) return { ...defaultBaseExportColumnOptions };
  const selected = new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
  return Object.fromEntries(baseExportColumnKeys.map((key) => [key, selected.has(key)])) as BaseExportColumnOptions;
}

function getExportScopeLabel(scope: QuotationExportScope) {
  const labels: Record<QuotationExportScope, string> = {
    all: "全部明细-带封面",
    all_without_cover: "全部明细-不带封面",
    base: "基装明细",
    main_material: "主材明细",
    custom_cabinet: "定制柜明细",
    fees: "综合费用和总费用",
  };
  return labels[scope];
}

function hasManagementFeeItem(items: ExportItem[]) {
  return items.some((item) => isOtherCategory(item.category) && /^(项目)?管理费$/.test(String(item.name || "").trim()));
}

function migrateManagementFeeToOtherItem(items: ExportItem[], settings: any): ExportItem[] {
  const managementFeeRate = Number(settings.managementFeeRate || 0);
  if (managementFeeRate <= 0) return items;
  if (hasManagementFeeItem(items)) {
    return items.map((item) => isOtherCategory(item.category) && /^(项目)?管理费$/.test(String(item.name || "").trim()) && !item.fee_calc_method
      ? { ...item, fee_calc_method: "percent", fee_calc_base: "直接费", fee_rate: getLegacyManagementFeeRate(item, managementFeeRate) }
      : item);
  }

  const baseAmount = items.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const materialAmount = items.filter((item) => !isBaseCategory(item.category) && !isOtherCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const managementFee = roundMoney((baseAmount + materialAmount) * managementFeeRate / 100);
  if (managementFee <= 0) return items;

  return [
    ...items,
    {
      category: "other",
      space: "",
      name: "管理费",
      quantity: 1,
      unit: "项",
      unit_price: managementFee,
      total_price: managementFee,
      material_cost: 0,
      labor_cost: 0,
      spec: `原管理费比例 ${managementFeeRate}% 转入`,
      fee_calc_method: "percent",
      fee_calc_base: "直接费",
      fee_rate: managementFeeRate,
    },
  ];
}

function inferItemSpace(item: ExportItem) {
  const current = String(item.space || "").trim();
  if (current) return current;
  if (isOtherCategory(item.category)) return "";
  const content = `${item.name || ""} ${item.spec || ""}`;
  if (/客餐厅|客厅|餐厅|厨房|橱柜|台面|阳台|玄关|过道|墙地砖|吊顶/.test(content)) return "客餐厅，厨房，过道及阳台";
  if (/水电|强弱电|水路/.test(content)) return "水电项目";
  if (/拆除|垃圾|清运/.test(content)) return "综合项目";
  if (/主卧/.test(content)) return "主卧";
  if (/次卧|儿童房/.test(content)) return "次卧";
  if (/卧室|木门|乳胶漆/.test(content)) return "卧室";
  if (/卫生间|厨卫|洁具|卫浴|马桶|花洒|防水/.test(content)) return "卫生间";
  return "综合项目";
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

const chineseSectionNumbers = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

function formatBaseSectionNumber(index: number) {
  if (index < chineseSectionNumbers.length) return chineseSectionNumbers[index];
  return String(index + 1);
}

function groupItemsBySpace(items: ExportItem[], quoteSpaces?: string[]) {
  const spaceOrder = uniqueValues([...(quoteSpaces || []), ...items.map((item) => inferItemSpace(item))]);
  return spaceOrder
    .map((space) => ({
      space,
      items: items.filter((item) => inferItemSpace(item) === space),
    }))
    .filter((group) => group.items.length > 0);
}

function getBasePriceParts(item: ExportItem) {
  const quantity = toNumber(item.quantity);
  const materialUnit = toNumber(item.material_cost);
  const rawLaborUnit = toNumber(item.labor_cost);
  const laborUnit = materialUnit || rawLaborUnit ? rawLaborUnit : toNumber(item.unit_price);
  return {
    quantity,
    materialUnit,
    materialTotal: roundMoney(quantity * materialUnit),
    laborUnit,
    laborTotal: roundMoney(quantity * laborUnit),
    total: roundMoney(quantity * (materialUnit + laborUnit)),
  };
}

function getBaseOrMaterialItemUnitPrice(item: ExportItem) {
  if (!isBaseCategory(item.category)) return toNumber(item.unit_price);
  const parts = getBasePriceParts(item);
  return parts.materialUnit + parts.laborUnit;
}

function getCustomCabinetArea(item: ExportItem) {
  return roundMoney(toNumber(item.material_cost) * toNumber(item.labor_cost) / 1000000);
}

function getBaseOrMaterialItemTotal(item: ExportItem) {
  if (isCustomCabinetCategory(item.category)) {
    const area = getCustomCabinetArea(item);
    return roundMoney(toNumber(item.quantity) * (area > 0 ? area : 1) * toNumber(item.unit_price));
  }
  return roundMoney(toNumber(item.quantity) * getBaseOrMaterialItemUnitPrice(item));
}

function getItemLaborSubtotal(item: ExportItem) {
  if (isOtherCategory(item.category)) return 0;
  const factor = isCustomCabinetCategory(item.category) ? Math.max(1, getCustomCabinetArea(item)) : 1;
  return roundMoney(toNumber(item.quantity) * factor * toNumber(item.labor_cost));
}

function getItemMaterialSubtotal(item: ExportItem) {
  if (isOtherCategory(item.category)) return 0;
  const factor = isCustomCabinetCategory(item.category) ? Math.max(1, getCustomCabinetArea(item)) : 1;
  return roundMoney(toNumber(item.quantity) * factor * toNumber(item.material_cost));
}

function buildCostComposition(items: ExportItem[]) {
  const addAmount = (map: Map<string, number>, name: string, amount: number) => {
    if (amount <= 0) return;
    const label = name.trim() || "未指定";
    map.set(label, roundMoney((map.get(label) || 0) + amount));
  };
  const workTypeMap = new Map<string, number>();
  const materialCategoryMap = new Map<string, number>();
  items.forEach((item) => {
    addAmount(workTypeMap, String(item.work_type_name || "未指定工种"), getItemLaborSubtotal(item));
    addAmount(materialCategoryMap, String(item.material_category_name || "未分类材料"), getItemMaterialSubtotal(item));
  });
  const sortRows = (map: Map<string, number>) => Array.from(map.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "zh-CN"));
  return {
    workTypes: sortRows(workTypeMap),
    materialCategories: sortRows(materialCategoryMap),
  };
}

function buildFeeFormulaContext(items: ExportItem[], categories: string[] = []): FeeFormulaContext {
  const orderedCategories = orderQuoteCategories([...categories, ...items.map((item) => item.category)]);
  const mainMaterialAmount = items
    .filter((item) => isMainMaterialCategory(item.category))
    .reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const laborAmount = items
    .filter((item) => isBaseCategory(item.category))
    .reduce((sum, item) => sum + getBasePriceParts(item).laborTotal, 0);
  const materialCostAmount = items
    .filter((item) => isBaseCategory(item.category))
    .reduce((sum, item) => sum + getBasePriceParts(item).materialTotal, 0);
  const categoryAmounts: Record<string, number> = {};

  orderedCategories
    .filter((category) => !isBaseCategory(category) && !isOtherCategory(category) && !isMainMaterialCategory(category))
    .forEach((category) => {
      categoryAmounts[getCategoryLabel(category)] = 0;
    });

  items.forEach((item) => {
    const category = String(item.category || "").trim();
    if (!category || isBaseCategory(category) || isOtherCategory(category) || isMainMaterialCategory(category)) return;
    const label = getCategoryLabel(category);
    categoryAmounts[label] = toMoney(toNumber(categoryAmounts[label]) + getBaseOrMaterialItemTotal(item));
  });

  const customCategoryAmount = Object.values(categoryAmounts).reduce((sum, amount) => sum + toNumber(amount), 0);
  return {
    mainMaterialAmount,
    directItemAmount: mainMaterialAmount + customCategoryAmount,
    laborAmount,
    materialCostAmount,
    categoryAmounts,
  };
}

function itemText(value?: string | number | null) {
  if (value === 0) return "0";
  return value ? String(value) : "";
}

function stripQuotaCodeText(value?: string | null) {
  return String(value || "")
    .replace(/(?:^|[；;\s])定额编号\s*[:：]\s*[A-Za-z0-9_-]*/g, "")
    .replace(/定额编号\s*[:：]\s*$/g, "")
    .replace(/[；;]\s*$/g, "")
    .trim();
}

function isQuotaCodeOnly(value?: string | null) {
  return /^PY\d{6,}$/i.test(String(value || "").trim());
}

function getBaseRowDescription(item: ExportItem) {
  const spec = stripQuotaCodeText(item.spec);
  const remark = isQuotaCodeOnly(item.remark) ? "" : stripQuotaCodeText(item.remark);
  return uniqueValues([spec, remark]).join("；");
}

function getWrappedRowHeight(value: unknown, charsPerLine: number, minHeight = 28, maxHeight = 96) {
  const text = itemText(value as string | number | null);
  if (!text) return minHeight;
  const lineCount = text
    .split(/\r?\n/)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.trim().length / charsPerLine)), 0);
  return Math.min(maxHeight, Math.max(minHeight, 22 + lineCount * 18));
}

function statusText(value?: string | null) {
  return String(value || "").toUpperCase() === "APPROVED" ? "正式报价" : "未正式报价";
}

function getDiscountScopeLabel(settings?: any) {
  if (settings?.discountType === "space") {
    return String(settings.discountSpace || "").trim() || "空间/类别";
  }
  if (settings?.discountType === "work_type") {
    return String(settings.discountWorkType || "").trim() || "工种";
  }
  const value = String(settings?.discountScope || "total").trim();
  const labels: Record<string, string> = {
    base: "基装直接费",
    base_labor: "基装直接费（人工）",
    base_material: "基装直接费（材料）",
    product: "产品费用",
    custom_cabinet: "定制柜费用",
    other: "综合费用",
    direct: "工程直接费",
    total: "总价",
  };
  if (labels[value]) return labels[value];
  if (value.startsWith("category:")) return value.slice("category:".length) || "总价";
  return "总价";
}

function applyThinBorder(cell: ExcelJS.Cell, color = EXPORT_BORDER_COLOR) {
  cell.border = {
    top: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
  };
}

function styleRange(
  sheet: ExcelJS.Worksheet,
  fromRow: number,
  toRow: number,
  fromCol: number,
  toCol: number,
  style: Partial<ExcelJS.Style>,
) {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let col = fromCol; col <= toCol; col += 1) {
      sheet.getCell(row, col).style = {
        ...sheet.getCell(row, col).style,
        ...style,
      };
    }
  }
}

function setRowValues(sheet: ExcelJS.Worksheet, rowNumber: number, values: unknown[]) {
  const row = sheet.getRow(rowNumber);
  values.forEach((value, index) => {
    row.getCell(index + 1).value = value as ExcelJS.CellValue;
  });
  return row;
}

function addSectionTitle(sheet: ExcelJS.Worksheet, rowNumber: number, title: string) {
  sheet.mergeCells(rowNumber, 1, rowNumber, EXPORT_COLUMN_COUNT);
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = title;
  cell.font = { name: EXPORT_FONT_NAME, size: 12, bold: true, color: { argb: "111827" } };
  cell.alignment = { vertical: "middle" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF" } };
  sheet.getRow(rowNumber).height = 24;
}

function addTableHeader(sheet: ExcelJS.Worksheet, rowNumber: number, headers: string[], columnCount = headers.length) {
  const row = setRowValues(sheet, rowNumber, headers);
  row.height = 24;
  for (let col = 1; col <= columnCount; col += 1) {
    const cell = row.getCell(col);
    cell.font = { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "475569" } };
    cell.alignment = { vertical: "middle", horizontal: col === 2 ? "left" : "center", wrapText: col !== 1 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_HEADER_FILL } };
    applyThinBorder(cell, EXPORT_HEADER_BORDER_COLOR);
  }
}

function addAmountCell(cell: ExcelJS.Cell, bold = false, color = "111827") {
  cell.numFmt = '0.00;-0.00';
  cell.font = { name: EXPORT_FONT_NAME, size: 10, bold, color: { argb: color } };
  cell.alignment = { vertical: "middle", horizontal: "right" };
}

function applyRowColor(row: ExcelJS.Row, value?: string | null, fromCol = 1, toCol = EXPORT_COLUMN_COUNT) {
  const color = getQuotationRowColor(value);
  if (!color.background) return;
  const argb = color.background.replace("#", "").toUpperCase();
  for (let col = fromCol; col <= toCol; col += 1) {
    row.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  }
}

function addBaseSection(sheet: ExcelJS.Worksheet, startRow: number, items: ExportItem[], quoteSpaces?: string[], columnOptions: BaseExportColumnOptions = defaultBaseExportColumnOptions) {
  let rowNumber = startRow;
  addSectionTitle(sheet, rowNumber, "基装明细");
  rowNumber += 1;
  const columns: {
    key: "sequence" | "name" | "quantity" | "unit" | BaseExportColumnKey;
    top: string;
    bottom?: string;
    group?: "material" | "labor";
    amount?: boolean;
    boldAmount?: boolean;
    redAmount?: boolean;
  }[] = [
    { key: "sequence", top: "序号" },
    { key: "name", top: "工程项目" },
    { key: "quantity", top: "数量" },
    { key: "unit", top: "单位" },
    ...(columnOptions.materialUnit ? [{ key: "materialUnit" as const, top: "材料", bottom: "单价", group: "material" as const, amount: true }] : []),
    ...(columnOptions.materialTotal ? [{ key: "materialTotal" as const, top: "材料", bottom: "合价", group: "material" as const, amount: true }] : []),
    ...(columnOptions.laborUnit ? [{ key: "laborUnit" as const, top: "人工", bottom: "单价", group: "labor" as const, amount: true }] : []),
    ...(columnOptions.laborTotal ? [{ key: "laborTotal" as const, top: "人工", bottom: "合价", group: "labor" as const, amount: true }] : []),
    ...(columnOptions.subtotal ? [{ key: "subtotal" as const, top: "小计", amount: true, boldAmount: true, redAmount: true }] : []),
    ...(columnOptions.description ? [{ key: "description" as const, top: "施工工艺及材料说明" }] : []),
  ];
  const spans = columns.map(() => 1);
  let remainingSpan = Math.max(0, EXPORT_COLUMN_COUNT - spans.reduce((sum, span) => sum + span, 0));
  const addColumnSpan = (key: (typeof columns)[number]["key"], amount: number) => {
    const index = columns.findIndex((column) => column.key === key);
    if (index < 0 || amount <= 0) return;
    spans[index] += amount;
    remainingSpan -= amount;
  };
  if (remainingSpan > 0) addColumnSpan("name", 1);
  if (remainingSpan > 0 && columns.some((column) => column.key === "description")) {
    addColumnSpan("description", remainingSpan);
  }
  if (remainingSpan > 0) addColumnSpan("name", remainingSpan);
  const columnLayouts = columns.map((column, index) => {
    const start = spans.slice(0, index).reduce((sum, span) => sum + span, 0) + 1;
    return { column, start, end: start + spans[index] - 1 };
  });
  const layoutByKey = Object.fromEntries(columnLayouts.map((layout) => [layout.column.key, layout])) as Partial<Record<(typeof columns)[number]["key"], (typeof columnLayouts)[number]>>;
  const mergeLayoutCells = (row: number, layout: (typeof columnLayouts)[number]) => {
    if (layout.end > layout.start) sheet.mergeCells(row, layout.start, row, layout.end);
  };

  columnLayouts.forEach((layout, index) => {
    const { column, start } = layout;
    sheet.getCell(rowNumber, start).value = column.group && columnLayouts[index - 1]?.column.group === column.group ? "" : column.top;
    sheet.getCell(rowNumber + 1, start).value = column.bottom || "";
  });
  ["sequence", "name", "quantity", "unit", "subtotal", "description"].forEach((key) => {
    const layout = layoutByKey[key as (typeof columns)[number]["key"]];
    if (layout) sheet.mergeCells(rowNumber, layout.start, rowNumber + 1, layout.end);
  });
  (["material", "labor"] as const).forEach((group) => {
    const groupColumns = columnLayouts.filter(({ column }) => column.group === group);
    if (groupColumns.length > 1) sheet.mergeCells(rowNumber, groupColumns[0].start, rowNumber, groupColumns[groupColumns.length - 1].end);
    groupColumns.forEach((layout) => mergeLayoutCells(rowNumber + 1, layout));
  });
  for (let row = rowNumber; row <= rowNumber + 1; row += 1) {
    sheet.getRow(row).height = 22;
    for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.font = { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "475467" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_HEADER_FILL } };
      applyThinBorder(cell, EXPORT_HEADER_BORDER_COLOR);
    }
  }
  rowNumber += 2;

  const groups = groupItemsBySpace(items, quoteSpaces);
  let sequence = 0;
  groups.forEach((group, groupIndex) => {
    const groupTotal = group.items.reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
    sheet.getCell(rowNumber, 1).value = formatBaseSectionNumber(groupIndex);
    sheet.mergeCells(rowNumber, 2, rowNumber, EXPORT_COLUMN_COUNT);
    sheet.getCell(rowNumber, 2).value = group.space;
    styleRange(sheet, rowNumber, rowNumber, 1, EXPORT_COLUMN_COUNT, {
      font: { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "111827" } },
      alignment: { vertical: "middle" },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_SPACE_FILL } },
    });
    sheet.getCell(rowNumber, 1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.getCell(rowNumber, 2).alignment = { vertical: "middle", horizontal: "left" };
    for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
    rowNumber += 1;

    group.items.forEach((item) => {
      sequence += 1;
      const parts = getBasePriceParts(item);
      const nameText = itemText(item.name);
      const description = getBaseRowDescription(item);
      const values: Record<(typeof columns)[number]["key"], unknown> = {
        sequence,
        name: nameText,
        quantity: formatQuantity(parts.quantity),
        unit: itemText(item.unit),
        materialUnit: parts.materialUnit,
        materialTotal: parts.materialTotal,
        laborUnit: parts.laborUnit,
        laborTotal: parts.laborTotal,
        subtotal: parts.total,
        description,
      };
      columnLayouts.forEach((layout) => {
        sheet.getCell(rowNumber, layout.start).value = values[layout.column.key] as ExcelJS.CellValue;
        mergeLayoutCells(rowNumber, layout);
      });
      const row = sheet.getRow(rowNumber);
      row.height = Math.max(
        getWrappedRowHeight(nameText, 18, 28),
        columnOptions.description ? getWrappedRowHeight(description, 44, description ? 40 : 28) : 28,
      );
      applyRowColor(row, item.row_color, 1, EXPORT_COLUMN_COUNT);
      for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) {
        const cell = row.getCell(col);
        applyThinBorder(cell);
        cell.font = { name: EXPORT_FONT_NAME, size: 10, color: { argb: "344054" } };
      }
      columnLayouts.forEach((layout) => {
        const cell = row.getCell(layout.start);
        cell.alignment = { vertical: "middle", horizontal: layout.column.amount ? "right" : layout.column.key === "name" || layout.column.key === "description" ? "left" : "center", wrapText: layout.column.key !== "sequence" };
        if (layout.column.amount) addAmountCell(cell, layout.column.boldAmount, layout.column.redAmount ? "DC2626" : "344054");
      });
      rowNumber += 1;
    });

    const summaryTotalLayout = layoutByKey.subtotal || { start: EXPORT_COLUMN_COUNT - 1, end: EXPORT_COLUMN_COUNT };
    const labelEndCol = Math.max(1, summaryTotalLayout.start - 1);
    sheet.mergeCells(rowNumber, 1, rowNumber, labelEndCol);
    sheet.getCell(rowNumber, 1).value = "小计";
    if (layoutByKey.subtotal && layoutByKey.materialTotal) {
      sheet.getCell(rowNumber, layoutByKey.materialTotal.start).value = group.items.reduce((sum, item) => sum + getBasePriceParts(item).materialTotal, 0);
      mergeLayoutCells(rowNumber, layoutByKey.materialTotal);
    }
    if (layoutByKey.subtotal && layoutByKey.laborTotal) {
      sheet.getCell(rowNumber, layoutByKey.laborTotal.start).value = group.items.reduce((sum, item) => sum + getBasePriceParts(item).laborTotal, 0);
      mergeLayoutCells(rowNumber, layoutByKey.laborTotal);
    }
    sheet.getCell(rowNumber, summaryTotalLayout.start).value = groupTotal;
    if (summaryTotalLayout.end > summaryTotalLayout.start) sheet.mergeCells(rowNumber, summaryTotalLayout.start, rowNumber, summaryTotalLayout.end);
    styleRange(sheet, rowNumber, rowNumber, 1, EXPORT_COLUMN_COUNT, {
      font: { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "344054" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_SECTION_FILL } },
      alignment: { vertical: "middle" },
    });
    sheet.getCell(rowNumber, 1).alignment = { horizontal: "center", vertical: "middle" };
    if (layoutByKey.subtotal) {
      [layoutByKey.materialTotal, layoutByKey.laborTotal].filter(Boolean).forEach((layout) => addAmountCell(sheet.getCell(rowNumber, layout!.start), true, "111827"));
    }
    addAmountCell(sheet.getCell(rowNumber, summaryTotalLayout.start), true, "111827");
    for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
    rowNumber += 1;
  });

  const total = items.reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const materialTotal = items.reduce((sum, item) => sum + getBasePriceParts(item).materialTotal, 0);
  const laborTotal = items.reduce((sum, item) => sum + getBasePriceParts(item).laborTotal, 0);
  const summaryTotalLayout = layoutByKey.subtotal || { start: EXPORT_COLUMN_COUNT - 1, end: EXPORT_COLUMN_COUNT };
  const labelEndCol = Math.max(1, summaryTotalLayout.start - 1);
  sheet.mergeCells(rowNumber, 1, rowNumber, labelEndCol);
  sheet.getCell(rowNumber, 1).value = "基装小计";
  if (layoutByKey.subtotal && layoutByKey.materialTotal) {
    sheet.getCell(rowNumber, layoutByKey.materialTotal.start).value = materialTotal;
    mergeLayoutCells(rowNumber, layoutByKey.materialTotal);
  }
  if (layoutByKey.subtotal && layoutByKey.laborTotal) {
    sheet.getCell(rowNumber, layoutByKey.laborTotal.start).value = laborTotal;
    mergeLayoutCells(rowNumber, layoutByKey.laborTotal);
  }
  sheet.getCell(rowNumber, summaryTotalLayout.start).value = total;
  if (summaryTotalLayout.end > summaryTotalLayout.start) sheet.mergeCells(rowNumber, summaryTotalLayout.start, rowNumber, summaryTotalLayout.end);
  styleRange(sheet, rowNumber, rowNumber, 1, EXPORT_COLUMN_COUNT, {
    font: { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "111827" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_TOTAL_FILL } },
  });
  sheet.getCell(rowNumber, 1).alignment = { horizontal: "center", vertical: "middle" };
  if (layoutByKey.subtotal) {
    [layoutByKey.materialTotal, layoutByKey.laborTotal].filter(Boolean).forEach((layout) => addAmountCell(sheet.getCell(rowNumber, layout!.start), true, "111827"));
  }
  addAmountCell(sheet.getCell(rowNumber, summaryTotalLayout.start), true, "DC2626");
  for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
  return rowNumber + 1;
}

function addMaterialSection(sheet: ExcelJS.Worksheet, startRow: number, items: ExportItem[], quoteSpaces?: string[], title = "产品明细") {
  let rowNumber = startRow;
  addSectionTitle(sheet, rowNumber, title);
  rowNumber += 1;
  addTableHeader(sheet, rowNumber, ["序号", "材料名称", "规格", "型号", "单位", "单价", "数量", "小计", "备注", "", ""], EXPORT_COLUMN_COUNT);
  sheet.mergeCells(rowNumber, 9, rowNumber, EXPORT_COLUMN_COUNT);
  rowNumber += 1;

  const groups = groupItemsBySpace(items, quoteSpaces);
  let sequence = 0;
  groups.forEach((group) => {
    const groupTotal = group.items.reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
    sheet.mergeCells(rowNumber, 1, rowNumber, EXPORT_COLUMN_COUNT);
    sheet.getCell(rowNumber, 1).value = group.space;
    styleRange(sheet, rowNumber, rowNumber, 1, EXPORT_COLUMN_COUNT, {
      font: { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "111827" } },
      alignment: { vertical: "middle" },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_SPACE_FILL } },
    });
    sheet.getCell(rowNumber, 1).alignment = { vertical: "middle", horizontal: "left" };
    for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
    rowNumber += 1;

    group.items.forEach((item) => {
      sequence += 1;
      const total = getBaseOrMaterialItemTotal(item);
      const nameText = itemText(item.name);
      const specText = itemText(item.spec);
      const modelText = itemText(item.material_model);
      const remarkText = itemText(item.remark);
      const row = setRowValues(sheet, rowNumber, [
        sequence,
        nameText,
        specText,
        modelText,
        itemText(item.unit),
        getBaseOrMaterialItemUnitPrice(item),
        formatQuantity(item.quantity),
        total,
        remarkText,
        "",
        "",
      ]);
      row.height = Math.max(
        getWrappedRowHeight(nameText, 18, 28),
        getWrappedRowHeight(specText, 14, specText ? 40 : 28),
        getWrappedRowHeight(modelText, 12, modelText ? 40 : 28),
        getWrappedRowHeight(remarkText, 28, remarkText ? 40 : 28),
      );
      sheet.mergeCells(rowNumber, 9, rowNumber, EXPORT_COLUMN_COUNT);
      applyRowColor(row, item.row_color);
      for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) {
        const cell = row.getCell(col);
        applyThinBorder(cell);
        cell.font = { name: EXPORT_FONT_NAME, size: 10, color: { argb: "344054" } };
        cell.alignment = { vertical: [3, 4].includes(col) ? "top" : "middle", horizontal: [6, 8].includes(col) ? "right" : [2, 3, 4].includes(col) || col >= 9 ? "left" : "center", wrapText: col !== 1 };
      }
      [6, 8].forEach((col) => addAmountCell(row.getCell(col), col === 8));
      rowNumber += 1;
    });

    sheet.mergeCells(rowNumber, 1, rowNumber, 8);
    sheet.getCell(rowNumber, 1).value = `${group.space} 小计`;
    sheet.getCell(rowNumber, 1).alignment = { horizontal: "right", vertical: "middle" };
    sheet.mergeCells(rowNumber, 9, rowNumber, EXPORT_COLUMN_COUNT);
    sheet.getCell(rowNumber, 9).value = groupTotal;
    styleRange(sheet, rowNumber, rowNumber, 1, EXPORT_COLUMN_COUNT, {
      font: { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "344054" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_SECTION_FILL } },
    });
    addAmountCell(sheet.getCell(rowNumber, 9), true, "111827");
    for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
    rowNumber += 1;
  });

  const total = items.reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  sheet.mergeCells(rowNumber, 1, rowNumber, 8);
  sheet.getCell(rowNumber, 1).value = `${title.replace(/明细$/, "")}小计`;
  sheet.getCell(rowNumber, 1).alignment = { horizontal: "right", vertical: "middle" };
  sheet.mergeCells(rowNumber, 9, rowNumber, EXPORT_COLUMN_COUNT);
  sheet.getCell(rowNumber, 9).value = total;
  styleRange(sheet, rowNumber, rowNumber, 1, EXPORT_COLUMN_COUNT, {
    font: { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "111827" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_TOTAL_FILL } },
  });
  addAmountCell(sheet.getCell(rowNumber, 9), true, "DC2626");
  for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
  return rowNumber + 1;
}

function addCustomCabinetSection(sheet: ExcelJS.Worksheet, startRow: number, items: ExportItem[], quoteSpaces?: string[], title = "定制柜明细") {
  let rowNumber = startRow;
  addSectionTitle(sheet, rowNumber, title);
  rowNumber += 1;
  addTableHeader(sheet, rowNumber, ["编号", "名称", "H高×W宽×D深（mm）", "数量", "平方", "单价", "金额", "备注", "", "", ""], EXPORT_COLUMN_COUNT);
  sheet.mergeCells(rowNumber, 8, rowNumber, EXPORT_COLUMN_COUNT);
  rowNumber += 1;

  const groups = groupItemsBySpace(items, quoteSpaces);
  let sequence = 0;
  groups.forEach((group) => {
    const groupTotal = group.items.reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
    sheet.mergeCells(rowNumber, 1, rowNumber, EXPORT_COLUMN_COUNT);
    sheet.getCell(rowNumber, 1).value = group.space;
    styleRange(sheet, rowNumber, rowNumber, 1, EXPORT_COLUMN_COUNT, {
      font: { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "111827" } },
      alignment: { vertical: "middle" },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_SPACE_FILL } },
    });
    sheet.getCell(rowNumber, 1).alignment = { vertical: "middle", horizontal: "left" };
    for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
    rowNumber += 1;

    group.items.forEach((item) => {
      sequence += 1;
      const total = getBaseOrMaterialItemTotal(item);
      const nameText = itemText(item.name);
      const sizeText = `${formatQuantity(item.material_cost)} × ${formatQuantity(item.labor_cost)} × ${formatQuantity(item.profit_margin)}`;
      const remarkText = itemText(item.remark);
      const area = getCustomCabinetArea(item);
      const row = setRowValues(sheet, rowNumber, [
        sequence,
        nameText,
        sizeText,
        formatQuantity(item.quantity),
        area,
        toNumber(item.unit_price),
        total,
        remarkText,
        "",
        "",
        "",
      ]);
      row.height = Math.max(
        getWrappedRowHeight(nameText, 18, 28),
        getWrappedRowHeight(remarkText, 32, remarkText ? 40 : 28),
      );
      sheet.mergeCells(rowNumber, 8, rowNumber, EXPORT_COLUMN_COUNT);
      applyRowColor(row, item.row_color);
      for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) {
        const cell = row.getCell(col);
        applyThinBorder(cell);
        cell.font = { name: EXPORT_FONT_NAME, size: 10, color: { argb: "344054" } };
        cell.alignment = { vertical: "middle", horizontal: [6, 7].includes(col) ? "right" : col === 2 || col >= 8 ? "left" : "center", wrapText: col !== 1 };
      }
      [6, 7].forEach((col) => addAmountCell(row.getCell(col), col === 7));
      rowNumber += 1;
    });

    sheet.mergeCells(rowNumber, 1, rowNumber, 6);
    sheet.getCell(rowNumber, 1).value = `${group.space} 小计`;
    sheet.getCell(rowNumber, 1).alignment = { horizontal: "right", vertical: "middle" };
    sheet.getCell(rowNumber, 7).value = groupTotal;
    sheet.mergeCells(rowNumber, 8, rowNumber, EXPORT_COLUMN_COUNT);
    styleRange(sheet, rowNumber, rowNumber, 1, EXPORT_COLUMN_COUNT, {
      font: { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "344054" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_SECTION_FILL } },
    });
    addAmountCell(sheet.getCell(rowNumber, 7), true, "111827");
    for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
    rowNumber += 1;
  });

  const total = items.reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  sheet.mergeCells(rowNumber, 1, rowNumber, 6);
  sheet.getCell(rowNumber, 1).value = `${title.replace(/明细$/, "")}小计`;
  sheet.getCell(rowNumber, 1).alignment = { horizontal: "right", vertical: "middle" };
  sheet.getCell(rowNumber, 7).value = total;
  sheet.mergeCells(rowNumber, 8, rowNumber, EXPORT_COLUMN_COUNT);
  styleRange(sheet, rowNumber, rowNumber, 1, EXPORT_COLUMN_COUNT, {
    font: { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "111827" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_TOTAL_FILL } },
  });
  addAmountCell(sheet.getCell(rowNumber, 7), true, "DC2626");
  for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
  return rowNumber + 1;
}

function addOtherFeeSection(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  items: ExportItem[],
  baseAmount: number,
  materialAmount: number,
  feeFormulaContext: FeeFormulaContext,
  otherFeeTotals: number[],
  discount: number,
  taxAmount: number,
  finalAmount: number,
  settings: any,
) {
  let rowNumber = startRow;
  addSectionTitle(sheet, rowNumber, "综合费用和总费用");
  rowNumber += 1;

  addTableHeader(sheet, rowNumber, ["编号", "费用名称", "", "计算公式", "", "小计", "", "规则说明", "", "", ""], EXPORT_COLUMN_COUNT);
  sheet.mergeCells(rowNumber, 2, rowNumber, 3);
  sheet.mergeCells(rowNumber, 4, rowNumber, 5);
  sheet.mergeCells(rowNumber, 6, rowNumber, 7);
  sheet.mergeCells(rowNumber, 8, rowNumber, EXPORT_COLUMN_COUNT);
  rowNumber += 1;

  const engineeringDirectAmount = roundMoney(baseAmount + materialAmount);
  const hasProductDirectAmount = toNumber(materialAmount) > 0;
  const engineeringDirectFormula = hasProductDirectAmount ? "基装直接费 + 产品直接费" : "基装直接费";
  const engineeringDirectRule = hasProductDirectAmount
    ? `基装直接费 ${formatExportAmount(baseAmount)} + 产品直接费 ${formatExportAmount(materialAmount)} = ${formatExportAmount(engineeringDirectAmount)}`
    : `基装直接费 ${formatExportAmount(baseAmount)} = ${formatExportAmount(engineeringDirectAmount)}`;
  const otherAmount = calculateChargeableOtherFeeTotals(items, baseAmount, materialAmount, feeFormulaContext).reduce((sum, amount) => sum + amount, 0);
  const finalFormulaParts = ["工程直接费"];
  const finalRuleParts = [`工程直接费 ${formatExportAmount(engineeringDirectAmount)}`];
  if (otherAmount > 0) {
    finalFormulaParts.push("+ 综合费用");
    finalRuleParts.push(`+ 综合费用 ${formatExportAmount(otherAmount)}`);
  }
  if (taxAmount > 0) {
    finalFormulaParts.push("+ 税费");
    finalRuleParts.push(`+ 税费 ${formatExportAmount(taxAmount)}`);
  }
  if (discount > 0) {
    finalFormulaParts.push("- 优惠");
    finalRuleParts.push(`- 优惠 ${formatExportAmount(discount)}`);
  }

  const addFeeRow = (values: [unknown, unknown, unknown, unknown, unknown], options: { fill?: string; bold?: boolean; amountColor?: string; rowColor?: string | null } = {}) => {
    setRowValues(sheet, rowNumber, [
      values[0],
      values[1],
      "",
      values[2],
      "",
      values[3],
      "",
      values[4],
      "",
      "",
      "",
    ]);
    sheet.mergeCells(rowNumber, 2, rowNumber, 3);
    sheet.mergeCells(rowNumber, 4, rowNumber, 5);
    sheet.mergeCells(rowNumber, 6, rowNumber, 7);
    sheet.mergeCells(rowNumber, 8, rowNumber, EXPORT_COLUMN_COUNT);
    const row = sheet.getRow(rowNumber);
    row.height = 32;
    applyRowColor(row, options.rowColor);
    for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) {
      const cell = row.getCell(col);
      applyThinBorder(cell);
      cell.font = { name: EXPORT_FONT_NAME, size: 10, color: { argb: col === 6 ? (options.amountColor || "111827") : "344054" }, bold: options.bold || col === 2 || col === 6 };
      cell.alignment = { vertical: "middle", horizontal: col === 6 ? "right" : col === 1 ? "center" : "left", wrapText: col !== 1 };
      if (options.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: options.fill } };
    }
    addAmountCell(row.getCell(6), true, options.amountColor || "111827");
    rowNumber += 1;
  };

  addFeeRow([formatAlphaSequence(0), "工程直接费", engineeringDirectFormula, engineeringDirectAmount, engineeringDirectRule], { fill: EXPORT_SECTION_FILL, bold: true });

  items.forEach((item, index) => {
    const total = otherFeeTotals[index] || 0;
    const ruleText = String(item.remark || "").trim() || getFeeRuleText(item, total, { currencySymbol: false, useGrouping: false }, feeFormulaContext);
    addFeeRow([formatAlphaSequence(index + 1), item.name || "", getFeeFormulaText(item), total, ruleText], { rowColor: item.row_color });
  });

  if (discount > 0) {
    const discountScopeLabel = getDiscountScopeLabel(settings);
    addFeeRow([
      formatAlphaSequence(items.length + 1),
      "优惠",
      `${discountScopeLabel}优惠`,
      -Math.abs(discount),
      `${discountScopeLabel}优惠 ${formatExportAmount(discount)}`,
    ]);
  }

  addFeeRow([
    formatAlphaSequence(items.length + (discount > 0 ? 2 : 1)),
    "工程总造价",
    finalFormulaParts.join(" "),
    finalAmount,
    `${finalRuleParts.join(" ")} = ${formatExportAmount(finalAmount)}`,
  ], { fill: EXPORT_SECTION_FILL, bold: true, amountColor: "DC2626" });
  return rowNumber;
}

function addCompositionTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  rows: { name: string; amount: number }[],
  emptyText: string,
) {
  let rowNumber = startRow;
  addSectionTitle(sheet, rowNumber, title);
  rowNumber += 1;
  addTableHeader(sheet, rowNumber, ["分类名称", "", "", "", "", "", "", "", "金额", "", ""], EXPORT_COLUMN_COUNT);
  sheet.mergeCells(rowNumber, 1, rowNumber, 8);
  sheet.mergeCells(rowNumber, 9, rowNumber, EXPORT_COLUMN_COUNT);
  rowNumber += 1;

  if (rows.length > 0) {
    rows.forEach((row) => {
      sheet.mergeCells(rowNumber, 1, rowNumber, 8);
      sheet.mergeCells(rowNumber, 9, rowNumber, EXPORT_COLUMN_COUNT);
      sheet.getCell(rowNumber, 1).value = row.name;
      sheet.getCell(rowNumber, 9).value = row.amount;
      styleRange(sheet, rowNumber, rowNumber, 1, EXPORT_COLUMN_COUNT, {
        font: { name: EXPORT_FONT_NAME, size: 10, color: { argb: "344054" } },
        alignment: { vertical: "middle" },
      });
      sheet.getCell(rowNumber, 1).alignment = { vertical: "middle", horizontal: "left" };
      addAmountCell(sheet.getCell(rowNumber, 9), true, "111827");
      for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
      sheet.getRow(rowNumber).height = 28;
      rowNumber += 1;
    });
  } else {
    sheet.mergeCells(rowNumber, 1, rowNumber, EXPORT_COLUMN_COUNT);
    sheet.getCell(rowNumber, 1).value = emptyText;
    sheet.getCell(rowNumber, 1).font = { name: EXPORT_FONT_NAME, size: 10, color: { argb: "94A3B8" } };
    sheet.getCell(rowNumber, 1).alignment = { vertical: "middle", horizontal: "center" };
    for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
    sheet.getRow(rowNumber).height = 32;
    rowNumber += 1;
  }

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  sheet.mergeCells(rowNumber, 1, rowNumber, 8);
  sheet.getCell(rowNumber, 1).value = `${title.replace(/汇总$/, "")}小计`;
  sheet.getCell(rowNumber, 1).alignment = { horizontal: "right", vertical: "middle" };
  sheet.mergeCells(rowNumber, 9, rowNumber, EXPORT_COLUMN_COUNT);
  sheet.getCell(rowNumber, 9).value = total;
  styleRange(sheet, rowNumber, rowNumber, 1, EXPORT_COLUMN_COUNT, {
    font: { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "111827" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_TOTAL_FILL } },
  });
  addAmountCell(sheet.getCell(rowNumber, 9), true, "DC2626");
  for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
  return rowNumber + 1;
}

function addCompositionSections(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  composition: ReturnType<typeof buildCostComposition>,
  otherAmount: number,
  finalAmount: number,
) {
  let rowNumber = startRow;
  rowNumber = addCompositionTable(sheet, rowNumber, "工种费用汇总", composition.workTypes, "暂无人工费用归属");
  rowNumber += 1;
  rowNumber = addCompositionTable(sheet, rowNumber, "材料分类汇总", composition.materialCategories, "暂无材料费用归属");
  rowNumber += 1;

  addSectionTitle(sheet, rowNumber, "综合费用和总费用");
  rowNumber += 1;
  setRowValues(sheet, rowNumber, ["综合费用", otherAmount, "", "", "", "", "", "", "报价总费用", finalAmount, ""]);
  sheet.mergeCells(rowNumber, 2, rowNumber, 8);
  sheet.mergeCells(rowNumber, 10, rowNumber, EXPORT_COLUMN_COUNT);
  for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) {
    const cell = sheet.getCell(rowNumber, col);
    applyThinBorder(cell, EXPORT_HEADER_BORDER_COLOR);
    cell.alignment = { vertical: "middle", horizontal: [2, 10].includes(col) ? "right" : "center" };
    cell.font = { name: EXPORT_FONT_NAME, size: col >= 9 ? 12 : 10, bold: true, color: { argb: col >= 9 ? "DC2626" : "334155" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col >= 9 ? EXPORT_TOTAL_FILL : EXPORT_SECTION_FILL } };
  }
  addAmountCell(sheet.getCell(rowNumber, 2), true, "111827");
  addAmountCell(sheet.getCell(rowNumber, 10), true, "DC2626");
  return rowNumber + 1;
}

function addSignatureSection(sheet: ExcelJS.Worksheet, startRow: number, labels: string[]) {
  let rowNumber = startRow;
  addSectionTitle(sheet, rowNumber, "签字栏");
  rowNumber += 1;
  const slots = [
    { start: 1, end: 2 },
    { start: 4, end: 5 },
    { start: 7, end: 8 },
    { start: 10, end: 11 },
  ];
  labels.forEach((label, index) => {
    const slot = slots[index % slots.length];
    if (index > 0 && index % slots.length === 0) rowNumber += 3;
    sheet.mergeCells(rowNumber, slot.start, rowNumber, slot.end);
    const cell = sheet.getCell(rowNumber, slot.start);
    cell.value = label;
    cell.font = { name: EXPORT_FONT_NAME, size: 11, bold: true, color: { argb: "334155" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  sheet.getRow(rowNumber).height = 34;
  return rowNumber + 1;
}

function getExcelTextWidthUnits(value: string) {
  return Array.from(value).reduce((sum, char) => {
    if (/[\u4e00-\u9fff]/.test(char)) return sum + 2;
    if (/[A-Z0-9]/.test(char)) return sum + 1.15;
    if (/\s/.test(char)) return sum + 0.55;
    return sum + 1;
  }, 0);
}

function getAppendixNoteRowHeight(sheet: ExcelJS.Worksheet, content: string) {
  const contentColumnWidth = Array.from({ length: EXPORT_COLUMN_COUNT - 1 }, (_, index) => {
    const width = sheet.getColumn(index + 2).width;
    return typeof width === "number" ? width : 10;
  }).reduce((sum, width) => sum + width, 0);
  const usableWidth = Math.max(32, contentColumnWidth - 4);
  const visualLineCount = content.split(/\r?\n/).reduce((sum, line) => {
    const widthUnits = Math.max(1, getExcelTextWidthUnits(line.trim()));
    return sum + Math.max(1, Math.ceil(widthUnits / usableWidth));
  }, 0);
  return Math.max(30, Math.min(220, visualLineCount * 18 + 14));
}

function addAppendixNoteSection(sheet: ExcelJS.Worksheet, startRow: number, note: string) {
  const content = note.trim();
  if (!content) return startRow;
  const rowNumber = startRow;
  sheet.getCell(rowNumber, 1).value = "附注";
  sheet.mergeCells(rowNumber, 2, rowNumber, EXPORT_COLUMN_COUNT);
  sheet.getCell(rowNumber, 2).value = content;
  sheet.getCell(rowNumber, 1).font = { name: EXPORT_FONT_NAME, size: 10, bold: true, color: { argb: "475467" } };
  sheet.getCell(rowNumber, 1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getCell(rowNumber, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT_HEADER_FILL } };
  sheet.getCell(rowNumber, 2).font = { name: EXPORT_FONT_NAME, size: 10, color: { argb: "111111" } };
  sheet.getCell(rowNumber, 2).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getCell(rowNumber, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF" } };
  sheet.getRow(rowNumber).height = getAppendixNoteRowHeight(sheet, content);
  for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) applyThinBorder(sheet.getCell(rowNumber, col), EXPORT_HEADER_BORDER_COLOR);
  return rowNumber + 1;
}

function addCoverSheet(workbook: ExcelJS.Workbook, quotation: any, branchSettings: any) {
  const sheet = workbook.addWorksheet("封面", {
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.45, right: 0.45, top: 0.45, bottom: 0.45, header: 0.1, footer: 0.1 },
    },
  });
  sheet.pageSetup.printArea = "A1:J44";
  sheet.views = [{ showGridLines: false }];
  sheet.properties.defaultRowHeight = 20;
  sheet.columns = Array.from({ length: 10 }, (_, index) => ({ key: String.fromCharCode(97 + index), width: 10.5 }));

  const brandShortName = String(branchSettings?.settings?.basicInfo?.companyShortName || "").trim();
  const legalCompanyName = String(branchSettings?.settings?.basicInfo?.legalCompanyName || "").trim();
  const brandLogoUrl = String(
    branchSettings?.settings?.printSettings?.quotationLogoUrl
    || branchSettings?.settings?.basicInfo?.companyLogoUrl
    || "",
  ).trim();
  const coverCompanyName = legalCompanyName || (brandShortName ? `${brandShortName}工程有限公司` : quotation.company_name || "装修公司");
  const coverFields = [
    ["客户姓名", quotation.customer_name || ""],
    ["楼盘小区", getExportProjectAddress(quotation)],
    ["联系电话", maskExportPhone(quotation.customer_phone)],
    ["报价人", quotation.creator_name || ""],
    ["设计师", quotation.designer_name || ""],
  ];

  for (let rowNumber = 1; rowNumber <= 44; rowNumber += 1) {
    sheet.getRow(rowNumber).height = 18;
    for (let col = 1; col <= 10; col += 1) {
      sheet.getCell(rowNumber, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF" } };
    }
  }
  for (let col = 1; col <= 10; col += 1) {
    sheet.getCell(1, col).border = {
      ...sheet.getCell(1, col).border,
      top: { style: "thin", color: { argb: "111111" } },
    };
    sheet.getCell(44, col).border = {
      ...sheet.getCell(44, col).border,
      bottom: { style: "thin", color: { argb: "111111" } },
    };
  }
  for (let borderRow = 1; borderRow <= 44; borderRow += 1) {
    sheet.getCell(borderRow, 1).border = {
      ...sheet.getCell(borderRow, 1).border,
      left: { style: "thin", color: { argb: "111111" } },
    };
    sheet.getCell(borderRow, 10).border = {
      ...sheet.getCell(borderRow, 10).border,
      right: { style: "thin", color: { argb: "111111" } },
    };
  }

  sheet.mergeCells(6, 2, 6, 9);
  sheet.getCell(6, 2).value = coverCompanyName;
  sheet.getCell(6, 2).font = { name: EXPORT_FONT_NAME, size: 24, bold: true, color: { argb: "111111" } };
  sheet.getCell(6, 2).alignment = { vertical: "middle", horizontal: "center", wrapText: false, shrinkToFit: true };
  sheet.getRow(6).height = 40;

  sheet.mergeCells(9, 2, 9, 9);
  sheet.getCell(9, 2).value = buildExportTitle(quotation);
  sheet.getCell(9, 2).font = { name: EXPORT_FONT_NAME, size: 20, bold: true, color: { argb: "111111" } };
  sheet.getCell(9, 2).alignment = { vertical: "middle", horizontal: "center", wrapText: false, shrinkToFit: true };
  sheet.getRow(9).height = 34;

  sheet.mergeCells(12, 2, 12, 9);
  sheet.getCell(12, 2).value = `报价执行有效期： ${getCurrentYearLastDayText()}`;
  sheet.getCell(12, 2).font = { name: EXPORT_FONT_NAME, size: 13, color: { argb: "111111" } };
  sheet.getCell(12, 2).alignment = { vertical: "middle", horizontal: "center", wrapText: false };
  sheet.getRow(12).height = 28;

  let rowNumber = 22;
  coverFields.forEach(([label, value]) => {
    sheet.mergeCells(rowNumber, 3, rowNumber, 4);
    sheet.mergeCells(rowNumber, 5, rowNumber, 7);
    const labelCell = sheet.getCell(rowNumber, 3);
    const valueCell = sheet.getCell(rowNumber, 5);
    labelCell.value = `${label.split("").join(" ")}：`;
    valueCell.value = value;
    labelCell.font = { name: EXPORT_FONT_NAME, size: 12, color: { argb: "111111" } };
    valueCell.font = { name: EXPORT_FONT_NAME, size: 12, color: { argb: "111111" } };
    labelCell.alignment = { vertical: "middle", horizontal: "right", wrapText: false };
    valueCell.alignment = { vertical: "middle", horizontal: "center", wrapText: false, shrinkToFit: true };
    valueCell.border = { bottom: { style: "thin", color: { argb: "111111" } } };
    sheet.getRow(rowNumber).height = 24;
    rowNumber += 2;
  });

  sheet.mergeCells(40, 2, 40, 4);
  sheet.getCell(40, 2).border = { top: { style: "thin", color: { argb: "888888" } } };
  sheet.mergeCells(40, 7, 40, 9);
  sheet.getCell(40, 7).border = { top: { style: "thin", color: { argb: "888888" } } };

  const logoFile = getPublicImageFile(brandLogoUrl);
  if (logoFile) {
    const imageId = workbook.addImage({ base64: readFileSync(logoFile.filePath).toString("base64"), extension: logoFile.extension });
    sheet.addImage(imageId, { tl: { col: 4.2, row: 39.08 }, ext: { width: 86, height: 24 } });
  }
  sheet.mergeCells(40, 5, 40, 6);
  sheet.getCell(40, 5).font = { name: EXPORT_FONT_NAME, size: 13, bold: true, color: { argb: "111111" } };
  sheet.getCell(40, 5).alignment = { vertical: "middle", horizontal: "left", wrapText: false, shrinkToFit: true };
  sheet.getRow(40).height = 26;
  for (let col = 1; col <= 10; col += 1) {
    sheet.getCell(1, col).border = {
      ...sheet.getCell(1, col).border,
      top: { style: "thin", color: { argb: "111111" } },
    };
    sheet.getCell(44, col).border = {
      ...sheet.getCell(44, col).border,
      bottom: { style: "thin", color: { argb: "111111" } },
    };
  }
  for (let borderRow = 1; borderRow <= 44; borderRow += 1) {
    sheet.getCell(borderRow, 1).border = {
      ...sheet.getCell(borderRow, 1).border,
      left: { style: "thin", color: { argb: "111111" } },
    };
    sheet.getCell(borderRow, 10).border = {
      ...sheet.getCell(borderRow, 10).border,
      right: { style: "thin", color: { argb: "111111" } },
    };
  }
  return sheet;
}

function hasCellContent(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value === null || value === undefined) return false;
  if (typeof value === "object" && "richText" in value) return Array.isArray(value.richText) && value.richText.length > 0;
  return String(value).trim() !== "";
}

function applyContentBorders(sheet: ExcelJS.Worksheet) {
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) {
      applyThinBorder(sheet.getCell(rowNumber, col), "000000");
    }
  }
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const outputMode = req.nextUrl.searchParams.get("mode") === "composition" ? "composition" : "list";
  const exportScope = parseExportScope(req.nextUrl.searchParams.get("scope"));
  const baseExportColumns = parseBaseExportColumns(req.nextUrl.searchParams.get("baseColumns"), exportScope);
  const shareClaims = verifyQuotationShareToken(req.nextUrl.searchParams.get("share") || "", params.id);
  const auth = getAuthContext(req);
  if (shareClaims && !auth) return NextResponse.json({ message: "分享报价单仅支持查看，不能导出" }, { status: 403 });
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (auth && !hasPermission(auth, "quotations.manage")) return NextResponse.json({ message: "没有报价导出权限" }, { status: 403 });
  const companyId = auth.companyId || "";

  const db = getDb();
  ensureQuotationSchema(db);
  ensureQuotationItemColumns(db);
  const quotation = db.prepare(`
    SELECT q.*, company.name as company_name, p.name as project_name, p.address as project_address, p.area as project_area,
      c.id as customer_id,
      COALESCE(c.name, q.temp_customer_name) as customer_name,
      COALESCE(c.phone, q.temp_customer_phone) as customer_phone,
      COALESCE(c.address, q.temp_customer_address) as customer_address,
      COALESCE(c.house_address, q.temp_customer_house_address) as customer_house_address,
      COALESCE(c.building_no, q.temp_customer_building_no) as customer_building_no,
      COALESCE(c.unit_no, q.temp_customer_unit_no) as customer_unit_no,
      COALESCE(c.room_no, q.temp_customer_room_no) as customer_room_no,
      COALESCE(c.no_room_number, q.temp_customer_no_room_number, 0) as customer_no_room_number,
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

  const rawSettings = parseSettings(quotation.settings);
  const appendixNote = buildAppendixNoteContent(rawSettings, quotation);
  const rawItems = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, created_at ASC").all(params.id) as ExportItem[];
  const items = migrateManagementFeeToOtherItem(rawItems, rawSettings).map((item) => ({ ...item, space: inferItemSpace(item) }));
  const quoteCategories = getQuoteCategoriesForItems(
    Array.isArray(rawSettings.quoteCategories) ? rawSettings.quoteCategories : [],
    items,
  );
  const baseItems = items.filter((item) => isBaseCategory(item.category));
  const materialGroups = quoteCategories
    .filter((category) => !isBaseCategory(category) && !isOtherCategory(category))
    .map((category) => ({
      category,
      label: getCategoryLabel(category),
      items: items.filter((item) => {
        if (category === "main_material") return isMainMaterialCategory(item.category);
        if (category === "custom_cabinet") return isCustomCabinetCategory(item.category);
        return item.category === category;
      }),
    }))
    .filter((group) => group.items.length > 0);
  const otherItems = items.filter((item) => isOtherCategory(item.category));

  const baseAmount = baseItems.reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const mainMaterialAmount = items.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const materialAmount = materialGroups.reduce((sum, group) => sum + group.items.reduce((groupSum, item) => groupSum + getBaseOrMaterialItemTotal(item), 0), 0);
  const feeFormulaContext = buildFeeFormulaContext(items, quoteCategories);
  const otherFeeTotals = calculateOtherFeeTotals(otherItems, baseAmount, materialAmount, feeFormulaContext);
  const otherAmount = calculateChargeableOtherFeeTotals(otherItems, baseAmount, materialAmount, feeFormulaContext).reduce((sum, amount) => sum + amount, 0);
  const discount = Number(rawSettings.discount || quotation.discount || 0);
  const taxAmount = Math.max(0, baseAmount + materialAmount + otherAmount - discount) * Number(rawSettings.taxRate || 0) / 100;
  const finalAmount = Math.max(0, roundMoney(baseAmount + materialAmount + otherAmount + taxAmount - discount));
  const costComposition = buildCostComposition(items);
  const branchSettings = getBranchSettingsForCustomer(db, quotation.customer_id);
  const signatureLabels = normalizeQuotationSignatureLabels(branchSettings.settings.printSettings.quotationSignatureLabels);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "装修管家";
  workbook.created = new Date();
  workbook.modified = new Date();
  const exportTitle = buildExportTitle(quotation);
  const shouldAddCoverSheet = outputMode === "list" && exportScope === "all";
  if (shouldAddCoverSheet) addCoverSheet(workbook, quotation, branchSettings);
  const sheet = workbook.addWorksheet(safeSheetName(shouldAddCoverSheet ? "报价明细" : exportTitle), {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 },
    },
  });
  sheet.properties.defaultRowHeight = 22;
  sheet.columns = [
    { key: "a", width: 9 },
    { key: "b", width: 20 },
    { key: "c", width: 10 },
    { key: "d", width: 12 },
    { key: "e", width: 9 },
    { key: "f", width: 10 },
    { key: "g", width: 10 },
    { key: "h", width: 10 },
    { key: "i", width: 10 },
    { key: "j", width: 16 },
    { key: "k", width: 48 },
  ];

  sheet.mergeCells(1, 1, 1, EXPORT_COLUMN_COUNT);
  sheet.getCell(1, 1).value = exportTitle;
  sheet.getCell(1, 1).font = { name: EXPORT_FONT_NAME, size: 22, bold: true, color: { argb: "111827" } };
  sheet.getCell(1, 1).alignment = { vertical: "middle", horizontal: "center", wrapText: false, shrinkToFit: true };
  sheet.getRow(1).height = 36;

  const infoRows = [
    ["客户姓名", quotation.customer_name || "", "", "", "手机号", maskExportPhone(quotation.customer_phone), "", "", "建筑面积", quotation.project_area ? `${quotation.project_area} 平方` : "", ""],
    ["项目地址", getExportProjectAddress(quotation), "", "", "设计师", quotation.designer_name || "", "", "", "报价人", quotation.creator_name || "", ""],
  ];
  setRowValues(sheet, 2, infoRows[0]);
  setRowValues(sheet, 3, infoRows[1]);
  [[2, 2, 2, 4], [2, 6, 2, 8], [2, 10, 2, 11], [3, 2, 3, 4], [3, 6, 3, 8], [3, 10, 3, 11]].forEach(
    ([top, left, bottom, right]) => sheet.mergeCells(top, left, bottom, right),
  );
  for (let rowNumber = 2; rowNumber <= 3; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 28;
    for (let col = 1; col <= EXPORT_COLUMN_COUNT; col += 1) {
      const cell = row.getCell(col);
      applyThinBorder(cell);
      const isLabel = [1, 5, 9].includes(col);
      cell.alignment = { vertical: "middle", horizontal: isLabel ? "center" : "left", wrapText: false, shrinkToFit: !isLabel };
      cell.font = { name: EXPORT_FONT_NAME, size: 10, bold: isLabel, color: { argb: isLabel ? "64748B" : "111827" } };
      if (isLabel) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFC" } };
    }
  }

  let rowNumber = 4;
  if (outputMode === "composition") {
    rowNumber = addCompositionSections(sheet, rowNumber, costComposition, otherAmount, finalAmount);
  } else {
    const isAllDetailScope = exportScope === "all" || exportScope === "all_without_cover";
    if (isAllDetailScope || exportScope === "base") {
      rowNumber = addBaseSection(sheet, rowNumber, baseItems, rawSettings.quoteSpaces, baseExportColumns);
    }
    materialGroups
      .filter((group) => {
        if (isAllDetailScope) return true;
        if (exportScope === "main_material") return isMainMaterialCategory(group.category);
        if (exportScope === "custom_cabinet") return isCustomCabinetCategory(group.category);
        return false;
      })
      .forEach((group) => {
        rowNumber = isCustomCabinetCategory(group.category)
          ? addCustomCabinetSection(sheet, rowNumber, group.items, rawSettings.quoteSpaces, `${group.label}明细`)
          : addMaterialSection(sheet, rowNumber, group.items, rawSettings.quoteSpaces, `${group.label}明细`);
      });
    if (isAllDetailScope || exportScope === "fees") {
      rowNumber = addOtherFeeSection(sheet, rowNumber, otherItems, baseAmount, materialAmount, feeFormulaContext, otherFeeTotals, discount, taxAmount, finalAmount, rawSettings);
    }
  }
  if (outputMode !== "composition" && appendixNote && (exportScope === "all" || exportScope === "all_without_cover" || exportScope === "fees")) {
    rowNumber = addAppendixNoteSection(sheet, rowNumber, appendixNote);
  }
  if (outputMode === "composition" || exportScope === "all" || exportScope === "all_without_cover") {
    addSignatureSection(sheet, rowNumber, signatureLabels);
  }
  applyContentBorders(sheet);
  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.protection = { locked: false };
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const customerName = cleanFileNamePart(quotation.customer_name, "客户") || "客户";
  const projectName = cleanFileNamePart(
    quotation.project_name || quotation.customer_address || quotation.project_address || quotation.title,
    "报价单",
  ) || "报价单";
  const exportLabel = outputMode === "composition" ? "工种材料分类" : getExportScopeLabel(exportScope).replace(/-/g, "");
  const fileName = safeFileName(`${customerName}-${projectName}-${exportLabel}.xlsx`);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
      "Cache-Control": "no-store",
    },
  });
}
