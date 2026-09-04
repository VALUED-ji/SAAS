"use client";

import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from "react";
import {
  Activity, AlertTriangle, Archive, ArrowLeft, Calculator, CalendarDays, Camera,
  CheckCircle, ChevronDown, ChevronRight, ClipboardCheck, ClipboardList, DollarSign, FileText, FolderOpen, HardHat, Home, Loader2,
  MapPin, Maximize2, MessageCircle, Minimize2, Minus, Package, Palette, Phone, Plus, QrCode, ReceiptText, Search, ShieldCheck, ShoppingCart, Trash2, Upload, UsersRound, WalletCards, X,
} from "lucide-react";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { formatUserRoleLabel } from "@/lib/userRoleLabels";
import { useMobileBack } from "@/lib/mobileNavigation";
import { QUOTA_LIBRARY_STORAGE_KEY, normalizeQuotaItem, type QuotaItem } from "@/app/quota/library/quota-library-shared";
import styles from "../../mobile.module.css";

type SiteData = Record<string, any[]>;
type Project = Record<string, any> & { id: string };
type PhaseGroup = { id: string; name: string; status: string; sort: number; phase: Record<string, any> | null; tasks: Record<string, any>[] };
type PhaseNodeSheetMode = "standard" | "records" | "photos" | "log" | "issue" | "acceptance";
type PhaseNodeSheet = { mode: PhaseNodeSheetMode; groupId: string; nodeId: string };
type MobileTemplateNode = Record<string, any> & { id: string; name: string; type: "construction" | "acceptance"; sortOrder: number };
type MobileTemplateStage = Record<string, any> & { id: string; name: string; sortOrder: number; nodes: MobileTemplateNode[] };
type MobileConstructionTemplate = Record<string, any> & { id: string; name: string; stages: MobileTemplateStage[] };
type MaterialCartLine = { materialId: string; quantity: number };
type MaterialCartLineWithMaterial = MaterialCartLine & { material: Record<string, any> };
type MaterialCartSupplierGroup = { key: string; supplierId: string; supplierName: string; lines: MaterialCartLineWithMaterial[]; amount: number };
type MaterialSheetMode = "cart" | "order";
type MaterialOrderFilterKey = "ALL" | "PENDING" | "PARTIAL" | "RECEIVED" | "CANCELLED";
type QuantityReviewSheetMode = "create" | "detail";
type CostSheetMode = "detail" | "insight";
type QuantityManualMode = "library" | "manual";
type QuantityQuotaOption = Pick<QuotaItem, "id" | "code" | "category" | "name" | "constructionDescription" | "unit" | "laborPrice" | "materialPrice" | "status"> & {
  source: "standard" | "custom";
  sourceLabel: string;
};
type QuantityReviewLine = {
  source_type: "BUDGET" | "MANUAL";
  quotation_item_id: string;
  title: string;
  category: string;
  space: string;
  phase: string;
  description: string;
  unit: string;
  budget_quantity: string;
  actual_quantity: string;
  labor_unit_price: string;
  material_unit_price: string;
  unit_price: string;
  evidence_note: string;
  discount_amount?: string;
  client_key?: string;
  display_order?: number;
};
type PaymentStageRow = {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  kind: "deposit" | "design" | "project";
  dueDate: unknown;
  expected: number;
  received: number;
  unpaid: number;
  status: { label: string; tone: string };
};
type SiteTabKey =
  | "overview" | "payments" | "schedule" | "phase" | "records" | "quantity" | "materials"
  | "changes" | "costs" | "settlement" | "cameras" | "checkin" | "archive";

const MATERIAL_ORDER_PREVIEW_ITEM_COUNT = 2;
const QUANTITY_ALL_COLLAPSED_KEY = "__quantity_all_collapsed__";

const tabs: { key: SiteTabKey; label: string; icon: ComponentType<any> }[] = [
  { key: "overview", label: "工地信息", icon: Home },
  { key: "payments", label: "客户收款", icon: DollarSign },
  { key: "schedule", label: "施工计划", icon: CalendarDays },
  { key: "phase", label: "施工阶段", icon: ClipboardList },
  { key: "records", label: "施工记录", icon: Activity },
  { key: "quantity", label: "工程量复核", icon: Calculator },
  { key: "materials", label: "材料下单", icon: ShoppingCart },
  { key: "changes", label: "增减项单", icon: ShieldCheck },
  { key: "costs", label: "成本管控", icon: DollarSign },
  { key: "settlement", label: "结算利润", icon: Calculator },
  { key: "cameras", label: "工地摄像头", icon: Camera },
  { key: "checkin", label: "工地签到", icon: QrCode },
  { key: "archive", label: "资料归档", icon: Archive },
];

const siteStageLabels: Record<string, string> = {
  PENDING_START: "待开工",
  START_CONFIRM: "开工确认",
  CONSTRUCTION: "施工中",
  OWNER_SETTLEMENT: "业主结算",
  SITE_SETTLEMENT: "工地结算",
};

const taskStatusLabels: Record<string, string> = {
  PENDING: "待施工",
  IN_PROGRESS: "施工中",
  REVIEW: "待验收",
  COMPLETED: "已完成",
  SKIPPED: "不施工",
};

const orderStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  PENDING: "待处理",
  ORDERED: "待处理",
  PARTIAL: "部分出库",
  RECEIVED: "已出库",
  CANCELLED: "已取消",
};

const quantityReviewStatusLabels: Record<string, string> = {
  PENDING_REVIEW: "待确认",
  CONFIRMED: "已确认",
  FINANCE_CREATED: "已生成增减项",
  CANCELLED: "已作废",
};

const quotationCategoryLabels: Record<string, string> = {
  base: "基装",
  main_material: "主材",
  other: "综合费用",
};

const costCategoryLabels: Record<string, string> = {
  AUXILIARY: "辅材",
  LABOR: "人工",
  MAIN_MATERIAL: "主材",
  EQUIPMENT: "设备",
  SUBCONTRACT: "外包",
  MANAGEMENT: "管理",
  OTHER: "其他",
};

const costStatusLabels: Record<string, string> = {
  PAID: "已支付",
  PENDING: "待支付",
  UNPAID: "未支付",
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function money(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, useGrouping: false }).format(amount);
}

function compactMoney(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount === 0) return "0";
  return money(amount);
}

function quantityText(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

function roundMoney(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

function signedMoney(value: unknown) {
  const amount = roundMoney(value);
  if (amount > 0) return `+¥${money(amount)}`;
  if (amount < 0) return `-¥${money(Math.abs(amount))}`;
  return "¥0";
}

function getQuotationCategoryLabel(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  return quotationCategoryLabels[raw.toLowerCase()] || raw;
}

function getQuantitySpaceName(value: unknown) {
  return String(value || "").trim() || "未分空间";
}

function isQuantityComprehensiveFeeItem(item: Record<string, any>) {
  const rawCategory = String(item?.category || "").trim().toLowerCase();
  return rawCategory === "other" || getQuotationCategoryLabel(item?.category) === "综合费用";
}

function getQuotationUnitPrice(item: Record<string, any>) {
  const unitPrice = Number(item?.unit_price ?? item?.unitPrice);
  if (Number.isFinite(unitPrice) && unitPrice > 0) return unitPrice;
  const labor = Number((item?.labor_cost ?? item?.laborUnitPrice) || 0) || 0;
  const material = Number((item?.material_cost ?? item?.materialUnitPrice) || 0) || 0;
  if (labor || material) return roundMoney(labor + material);
  const total = Number((item?.total_price ?? item?.totalPrice) || 0) || 0;
  const quantity = Number(item?.quantity || 0) || 0;
  return quantity > 0 ? roundMoney(total / quantity) : 0;
}

function getQuotationOriginalAmount(item: Record<string, any>) {
  const total = Number(item?.total_price ?? item?.totalPrice);
  if (Number.isFinite(total) && total > 0) return roundMoney(total);
  return roundMoney((Number(item?.quantity || 0) || 0) * getQuotationUnitPrice(item));
}

function getQuantityLineDiff(line: QuantityReviewLine | Record<string, any>) {
  const rawLine = line as Record<string, any>;
  const budgetQuantity = Number(line.budget_quantity || 0) || 0;
  const actualQuantity = Number(line.actual_quantity || 0) || 0;
  const laborUnitPrice = Number((rawLine.labor_unit_price ?? rawLine.laborUnitPrice) || 0) || 0;
  const materialUnitPrice = Number((rawLine.material_unit_price ?? rawLine.materialUnitPrice) || 0) || 0;
  const unitPrice = laborUnitPrice || materialUnitPrice ? roundMoney(laborUnitPrice + materialUnitPrice) : Number(line.unit_price || 0) || 0;
  const diffQuantity = roundMoney(actualQuantity - budgetQuantity);
  const signedAmount = roundMoney(diffQuantity * unitPrice);
  return {
    diffQuantity,
    signedAmount,
    amount: Math.abs(signedAmount),
    type: signedAmount > 0 ? "ADD" : signedAmount < 0 ? "DEDUCT" : "NONE",
  };
}

function parseQuantityReviewItems(review: Record<string, any> | null | undefined): QuantityReviewLine[] {
  if (!review) return [];
  if (Array.isArray(review.items)) return review.items as QuantityReviewLine[];
  try {
    const parsed = JSON.parse(String(review.items || "[]"));
    return Array.isArray(parsed) ? parsed as QuantityReviewLine[] : [];
  } catch {
    return [];
  }
}

function makeMobileBudgetLine(item: Record<string, any>, actualQuantity: string, evidenceNote: string, phase: string): QuantityReviewLine {
  return {
    source_type: "BUDGET",
    quotation_item_id: String(item.id || ""),
    title: String(item.name || "预算项目").trim(),
    category: getQuotationCategoryLabel(item.category),
    space: getQuantitySpaceName(item.space),
    phase,
    description: String(item.spec || item.remark || "").trim(),
    unit: String(item.unit || "项").trim() || "项",
    budget_quantity: String(item.quantity ?? ""),
    actual_quantity: actualQuantity,
    labor_unit_price: String(item.labor_cost ?? ""),
    material_unit_price: String(item.material_cost ?? ""),
    unit_price: String(item.unit_price ?? item.unitPrice ?? getQuotationUnitPrice(item)),
    evidence_note: evidenceNote,
  };
}

function makeMobileFeeLine(item: Record<string, any>, actualAmount: string, evidenceNote: string, phase: string): QuantityReviewLine {
  return {
    source_type: "BUDGET",
    quotation_item_id: String(item.id || ""),
    title: String(item.name || "综合费用").trim(),
    category: "综合费用",
    space: "综合费用",
    phase,
    description: String(item.spec || item.remark || "").trim(),
    unit: "元",
    budget_quantity: String(getQuotationOriginalAmount(item)),
    actual_quantity: actualAmount,
    labor_unit_price: "",
    material_unit_price: "",
    unit_price: "1",
    evidence_note: evidenceNote,
  };
}

function makeMobileManualLine(phase: string, space = "未分空间"): QuantityReviewLine {
  const key = `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    source_type: "MANUAL",
    quotation_item_id: key,
    title: "",
    category: "基装",
    space,
    phase,
    description: "",
    unit: "项",
    budget_quantity: "0",
    actual_quantity: "",
    labor_unit_price: "",
    material_unit_price: "",
    unit_price: "",
    evidence_note: "",
    client_key: key,
  };
}

function loadMobileStandardQuotaOptions(): QuantityQuotaOption[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUOTA_LIBRARY_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeQuotaItem)
      .filter((item): item is QuotaItem => Boolean(item && item.status !== "disabled" && item.name))
      .map((item) => ({
        id: item.id,
        code: item.code,
        category: item.category,
        name: item.name,
        constructionDescription: item.constructionDescription,
        unit: item.unit,
        laborPrice: item.laborPrice,
        materialPrice: item.materialPrice,
        status: item.status,
        source: "standard" as const,
        sourceLabel: "标准库",
      }));
  } catch {
    return [];
  }
}

function applyMobileQuotaToManualLine(line: QuantityReviewLine, quota?: QuantityQuotaOption): QuantityReviewLine {
  if (!quota) return line;
  const laborUnitPrice = String(quota.laborPrice || "");
  const materialUnitPrice = String(quota.materialPrice || "");
  return {
    ...line,
    title: quota.name || line.title,
    category: getQuotationCategoryLabel(quota.category || line.category),
    description: quota.constructionDescription || line.description,
    unit: quota.unit || line.unit || "项",
    labor_unit_price: laborUnitPrice,
    material_unit_price: materialUnitPrice,
    unit_price: String(roundMoney((Number(laborUnitPrice || 0) || 0) + (Number(materialUnitPrice || 0) || 0))),
  };
}

function getMobileQuotaSearchText(quota: QuantityQuotaOption) {
  return [
    quota.sourceLabel,
    quota.code,
    quota.category,
    quota.name,
    quota.constructionDescription,
    quota.unit,
  ].join(" ").toLowerCase();
}

function costCategoryLabel(value: unknown) {
  return costCategoryLabels[String(value || "").toUpperCase()] || "其他";
}

function materialOrderSupplierName(order: Record<string, any>) {
  return String(order.supplier_name || order.warehouse_name || order.owner_name || order.supplier || "供应方未设置").trim();
}

function mobileMaterialOrderTypeLabel(orderType: unknown) {
  const type = String(orderType || "").toUpperCase();
  if (type === "AUXILIARY_WAREHOUSE") return "辅材仓库";
  if (type === "AUXILIARY_MONTHLY") return "辅材月结";
  if (type === "MAIN_SUPPLIER") return "主材订单";
  return "材料订单";
}

function getMobileMaterialOrderItemActualCost(item: Record<string, any>, order: Record<string, any> | undefined) {
  if (!order || String(order.status || "").toUpperCase() === "CANCELLED") return null;
  const orderType = String(order.order_type || "");
  const quantity = Math.max(0, Number(item.quantity || 0) || 0);
  const receivedQty = Math.max(0, Number(item.received_qty || 0) || 0);
  const deductedQty = Math.max(0, Number(item.stock_deducted_qty || 0) || 0);
  const costQuantity = orderType === "AUXILIARY_WAREHOUSE"
    ? Math.min(quantity, deductedQty)
    : receivedQty > 0
      ? Math.min(quantity, receivedQty)
      : ["RECEIVED", "PARTIAL"].includes(String(order.status || "").toUpperCase()) ? quantity : 0;
  if (costQuantity <= 0) return null;
  const unitCost = Math.max(0, Number(item.material_cost_price ?? item.unit_price ?? 0) || 0);
  const amount = roundMoney(costQuantity * unitCost);
  if (amount <= 0) return null;
  return { order, orderType, costQuantity, unitCost, amount };
}

function makeCostCompareRow(input: { key: string; type: string; name: string; budgetAmount: number; actualAmount: number }) {
  const budgetAmount = roundMoney(input.budgetAmount);
  const actualAmount = roundMoney(input.actualAmount);
  const diffAmount = roundMoney(budgetAmount - actualAmount);
  const rate = budgetAmount > 0 ? Math.round((actualAmount / budgetAmount) * 1000) / 10 : actualAmount > 0 ? 100 : 0;
  const tone = diffAmount < -0.005 ? "danger" : actualAmount <= 0 ? "muted" : rate >= 90 ? "warning" : "success";
  const status = diffAmount < -0.005 ? "超预算" : actualAmount <= 0 ? "未发生" : rate >= 90 ? "接近预算" : "正常";
  return { ...input, budgetAmount, actualAmount, diffAmount, rate, tone, status };
}

function materialOutOfStock(item: Record<string, any> | undefined | null) {
  return Number(item?.stock || 0) <= 0;
}

function materialStockTight(item: Record<string, any> | undefined | null) {
  const stock = Number(item?.stock || 0);
  const minStock = Number(item?.min_stock || item?.material_min_stock || 0);
  return stock > 0 && minStock > 0 && stock <= minStock;
}

function materialImageUrl(item: Record<string, any>) {
  const primary = item.material_image || item.image;
  if (primary) return String(primary);
  const images = item.material_images || item.images;
  if (Array.isArray(images)) return String(images[0] || "");
  if (typeof images === "string") {
    const text = images.trim();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return String(parsed[0] || "");
    } catch {
      return text.split(/[；;,]/).map((value) => value.trim()).filter(Boolean)[0] || "";
    }
  }
  return "";
}

function materialSpecParts(item: Record<string, any>) {
  return [
    item.material_brand || item.brand,
    item.material_model,
    item.material_color || item.color,
    item.material_spec || item.spec,
  ].filter(Boolean).map((value) => String(value));
}

function materialDisplayName(item: Record<string, any>) {
  return String(item.material_product_name || item.product_name || item.name || "未命名材料");
}

function materialMainCategoryName(item: Record<string, any>) {
  const parent = String(item.parent_category_name || "").trim();
  if (parent) return parent;
  const category = String(item.category_name || "").trim();
  if (!category) return "未分类";
  return category.includes("/") ? category.split("/")[0].trim() || "未分类" : category;
}

function materialLeafCategoryName(item: Record<string, any>) {
  const category = String(item.category_name || "").trim();
  if (!category) return "未分类";
  const parts = category.split("/").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || "未分类";
}

function materialItemDisplayName(item: Record<string, any>) {
  return String(item.material_product_name || item.product_name || item.material_name || item.name || "材料");
}

function materialOrderFilterKey(order: Record<string, any>): MaterialOrderFilterKey {
  const status = String(order.status || "PENDING").toUpperCase();
  if (status === "PARTIAL" || status === "RECEIVED" || status === "CANCELLED") return status;
  return "PENDING";
}

const materialOrderFilterTabs: { key: MaterialOrderFilterKey; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "PENDING", label: "待处理" },
  { key: "PARTIAL", label: "部分出库" },
  { key: "RECEIVED", label: "已出库" },
  { key: "CANCELLED", label: "已取消" },
];

function materialOrderTypeOf(items: Record<string, any>[]) {
  const first = items[0];
  if (!first) return "MAIN_SUPPLIER";
  const materialType = String(first.material_type || "").toUpperCase();
  const supplyMode = String(first.supply_mode || "").toUpperCase();
  if (materialType && materialType !== "MAIN" && supplyMode === "WAREHOUSE") return "AUXILIARY_WAREHOUSE";
  return "MAIN_SUPPLIER";
}

function materialOrderHasReceived(order: Record<string, any>) {
  const status = String(order.status || "").toUpperCase();
  return status === "PARTIAL" || status === "RECEIVED";
}

function materialOrderItemReceivedQuantity(item: Record<string, any>, order: Record<string, any> | null) {
  if (!order || !materialOrderHasReceived(order)) return 0;
  return Math.max(0, Number(item.received_qty || item.stock_deducted_qty || 0) || 0);
}

function materialOrderProgress(order: Record<string, any>) {
  if (!materialOrderHasReceived(order)) return 0;
  const total = Math.max(0, Number(order.total_quantity || 0) || 0);
  const handled = Math.max(0, Number(order.stock_deducted_quantity || order.received_quantity || 0) || 0);
  if (total <= 0) return 0;
  return Math.min(100, Math.round((handled / total) * 100));
}

function dateText(value: unknown, withTime = false) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const normalized = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw.slice(0, withTime ? 16 : 10);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function materialOrderTimeText(order: Record<string, any>) {
  return order.created_at ? dateText(order.created_at, true) : dateText(order.order_date);
}

function DateRangeText({ start, end, endText }: { start: unknown; end?: unknown; endText?: string }) {
  const startText = dateText(start);
  const finalEndText = endText ?? dateText(end);
  if (startText === "-" && finalEndText === "-") return <>{startText}</>;
  if (startText === "-") return <>{finalEndText}</>;
  if (finalEndText === "-") return <>{startText}</>;
  return (
    <span className={styles.mobileScheduleDateRange}>
      <time>{startText}</time>
      <i>-</i>
      <time>{finalEndText}</time>
    </span>
  );
}

function timestampOf(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalized = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function dateOnlyTime(value: unknown) {
  const time = timestampOf(value);
  if (!time) return 0;
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function parseDateOnlyValue(value: unknown) {
  const time = dateOnlyTime(value);
  if (!time) return null;
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateOnlyValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarDaysValue(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toBooleanFlag(value: unknown) {
  return value === true || value === 1 || value === "1" || String(value || "").toLowerCase() === "true";
}

const mobileSiteHolidayDates = new Set([
  "2026-01-01",
  "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
  "2026-04-04", "2026-04-05", "2026-04-06",
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
  "2026-06-19", "2026-06-20", "2026-06-21",
  "2026-09-25", "2026-09-26", "2026-09-27",
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07",
]);

function parseAreaValue(value: unknown) {
  const raw = String(value || "").replace(/[^\d.]/g, "");
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
}

function isMobileWorkingDate(date: Date, options: { weekendConstruction: boolean; holidayConstruction: boolean }) {
  const dateKey = formatDateOnlyValue(date);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const isHoliday = mobileSiteHolidayDates.has(dateKey);
  return (options.weekendConstruction || !isWeekend) && (options.holidayConstruction || !isHoliday);
}

function collectMobileWorkingDates(startDate: Date, durationDays: number, options: { weekendConstruction: boolean; holidayConstruction: boolean }) {
  const days = Math.max(1, Math.ceil(Number(durationDays || 1)));
  const dates: Date[] = [];
  const cursor = new Date(startDate);
  let guard = 0;
  while (dates.length < days && guard < 2000) {
    if (isMobileWorkingDate(cursor, options)) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates;
}

function normalizeDurationRules(value: unknown) {
  return Array.isArray(value) ? value.map((rule: any) => ({
    minArea: Math.max(0, Number(rule?.minArea || 0) || 0),
    maxArea: rule?.maxArea === null || rule?.maxArea === undefined || rule?.maxArea === "" ? null : Math.max(0, Number(rule.maxArea || 0) || 0),
    plannedDays: Math.max(0, Number(rule?.plannedDays || 0) || 0),
    floorHeatingDays: Math.max(0, Number(rule?.floorHeatingDays ?? rule?.plannedDays ?? 0) || 0),
  })).filter((rule) => rule.plannedDays > 0 || rule.floorHeatingDays > 0) : [];
}

function mobileNodeDurationDays(template: Record<string, any> | null, stage: Record<string, any>, node: Record<string, any>, area: unknown, hasFloorHeating: boolean) {
  const durationStage = Array.isArray(template?.durationRules)
    ? template.durationRules.find((item: any) => String(item?.id || "") === String(stage.id || "") || String(item?.name || "") === String(stage.name || ""))
    : null;
  const rules = [
    ...normalizeDurationRules(node.durationRules),
    ...normalizeDurationRules(node.areaDurationRules),
    ...normalizeDurationRules(stage.durationRules),
    ...normalizeDurationRules(stage.areaDurationRules),
    ...normalizeDurationRules(durationStage?.rules),
    ...normalizeDurationRules(durationStage?.areaDurationRules),
  ].sort((left, right) => left.minArea - right.minArea);
  if (!rules.length) return 1;
  const areaValue = parseAreaValue(area);
  const matchedRule = areaValue > 0
    ? rules.find((rule) => areaValue >= rule.minArea && (rule.maxArea == null || areaValue < rule.maxArea)) || rules[rules.length - 1]
    : rules[0];
  return Math.max(1, Math.ceil(Number(hasFloorHeating ? matchedRule.floorHeatingDays : matchedRule.plannedDays) || 1));
}

function daysBetween(start: unknown, end: unknown) {
  const startTime = dateOnlyTime(start);
  const endTime = dateOnlyTime(end);
  if (!startTime || !endTime) return null;
  return Math.round((endTime - startTime) / 86400000) + 1;
}

function daysDelta(left: unknown, right: unknown) {
  const leftTime = dateOnlyTime(left);
  const rightTime = dateOnlyTime(right);
  if (!leftTime || !rightTime) return null;
  return Math.round((leftTime - rightTime) / 86400000);
}

function minDateValue(values: unknown[]) {
  const dated = values
    .map((value) => ({ value, time: dateOnlyTime(value) }))
    .filter((item) => item.time > 0)
    .sort((left, right) => left.time - right.time);
  return dated[0]?.value || null;
}

function maxDateValue(values: unknown[]) {
  const dated = values
    .map((value) => ({ value, time: dateOnlyTime(value) }))
    .filter((item) => item.time > 0)
    .sort((left, right) => right.time - left.time);
  return dated[0]?.value || null;
}

function scheduleDelayMeta(plannedEnd: unknown, actualEnd: unknown, status: string) {
  const upperStatus = String(status || "").toUpperCase();
  const compareDate = actualEnd || (["COMPLETED", "SKIPPED"].includes(upperStatus) ? null : getTodayDateOnly());
  const delta = daysDelta(compareDate, plannedEnd);
  if (delta == null) return { label: "未排期", tone: "neutral", delta: null };
  if (delta > 0) return { label: actualEnd ? `延期 ${delta} 天` : `已超期 ${delta} 天`, tone: "danger", delta };
  if (delta < 0) return { label: `提前 ${Math.abs(delta)} 天`, tone: "success", delta };
  return { label: "按期", tone: "success", delta: 0 };
}

function getTodayDateOnly() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : now.toISOString().slice(0, 10);
}

function paymentAmount(record: Record<string, any>) {
  return Number(record.amount || record.received_amount || record.actual_amount || 0);
}

function normalizePaymentTitle(record: Record<string, any>, fallback = "收款记录") {
  const recordType = String(record.record_type || "").trim();
  const rawTitle = String(record.title || record.payment_name || record.deposit_type || "").trim();
  if (record.payment_kind) return String(record.payment_kind);
  if (recordType === "design_fee") return rawTitle && rawTitle !== "design_fee" ? rawTitle : "设计费";
  if (recordType === "deposit") return rawTitle && rawTitle !== "deposit" ? rawTitle : "定金";
  if (rawTitle && !["deposit", "design_fee"].includes(rawTitle)) return rawTitle;
  return fallback;
}

function paymentMeta(record: Record<string, any>) {
  const date = dateText(record.pay_date || record.received_at || record.created_at);
  const handler = record.user_name || record.created_by_name || record.receiver_name || "经办人未设置";
  const method = record.payment_channel || record.method || record.channel || "";
  return [date, handler, method].filter(Boolean).join(" · ");
}

function paymentRecordKind(record: Record<string, any>) {
  const recordType = String(record.record_type || "").trim();
  if (recordType === "design_fee") return "design";
  if (recordType === "deposit") return "deposit";
  if (record.payment_plan_id || String(record.payment_stage_label || "").includes("工程款")) return "project";
  return "other";
}

function PaymentRecordIcon({ record }: { record: Record<string, any> }) {
  const kind = paymentRecordKind(record);
  const Icon = kind === "design" ? Palette : kind === "deposit" ? WalletCards : kind === "project" ? ReceiptText : DollarSign;
  return <span data-kind={kind}><Icon /></span>;
}

function isPastDue(value: unknown) {
  const time = timestampOf(value);
  if (!time) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return time < today.getTime();
}

function paymentStageStatus(expected: number, received: number, dueDate: unknown, rawStatus: unknown) {
  const status = String(rawStatus || "").toUpperCase();
  if (expected <= 0) return { label: "无需收款", tone: "neutral" };
  if (received >= expected - 0.005 || status === "PAID") return { label: "已收齐", tone: "success" };
  if (received > 0) return { label: "部分收款", tone: "warning" };
  if (isPastDue(dueDate)) return { label: "逾期未收", tone: "danger" };
  return { label: "待收款", tone: "neutral" };
}

function siteName(project?: Project | null) {
  return String(project?.site_name || project?.display_name || project?.customer_address || project?.address || project?.name || "未命名工地").trim();
}

function ownerName(project?: Project | null) {
  return String(project?.customer_name || project?.owner_name || "业主未设置").trim();
}

function projectManagerName(project?: Project | null, team: Record<string, any>[] = []) {
  return String(project?.manager_name || team.find((member) => String(member.role).toUpperCase() === "PM")?.user_name || "").trim();
}

function projectManagerPhone(project?: Project | null, team: Record<string, any>[] = []) {
  return String(project?.manager_phone || team.find((member) => String(member.role).toUpperCase() === "PM")?.user_phone || "").trim();
}

function stageName(project?: Project | null) {
  const key = String(project?.site_stage || "");
  return String(project?.construction_stage_name || project?.current_phase_name || project?.active_phase_name || siteStageLabels[key] || project?.status || "-");
}

function arr(data: SiteData | null, key: string) {
  return Array.isArray(data?.[key]) ? data![key] : [];
}

function byProject<T extends Record<string, any>>(rows: T[], projectId: string) {
  return rows.filter((row) => String(row.project_id || row.id_project || "") === projectId);
}

function byCustomer<T extends Record<string, any>>(rows: T[], customerId?: string | null) {
  return rows.filter((row) => String(row.customer_id || "") === String(customerId || ""));
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return <span className={styles.mobileSiteDetailMetric} data-tone={tone}><small>{label}</small><b>{value}</b></span>;
}

function siteAddress(project?: Project | null) {
  return String(
    project?.address_location_name ||
    project?.customer_address_location_name ||
    project?.address ||
    project?.customer_house_address ||
    project?.customer_address ||
    "地址未设置"
  ).trim();
}

function Info({ label, value, wide }: { label: string; value: unknown; wide?: boolean }) {
  const text = value === undefined || value === null || String(value).trim() === "" ? "-" : String(value);
  return <div className={styles.infoCell} data-wide={wide || undefined}><div className={styles.infoLabel}>{label}</div><div className={styles.infoValue}>{text}</div></div>;
}

function Section({ title, icon: Icon, action, children }: { title: string; icon: ComponentType<any>; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={styles.detailPanel} id={`site-section-${title}`}>
      <div className={styles.panelHeading}>
        <div className={styles.panelTitle}><Icon />{title}</div>
        {action ? <div className={styles.panelAction}>{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className={styles.mobileSiteDetailEmpty}><FolderOpen /><span>{text}</span></div>;
}

function SiteDetailSkeleton() {
  return (
    <div className={styles.page} data-site-home aria-busy="true">
      <header className={`${styles.detailHeader} ${styles.mobileSiteDetailHeader} ${styles.mobileSiteSkeletonHeader}`}>
        <div className={styles.detailNav}>
          <span className={styles.mobileSiteSkeletonIcon} />
          <div className={styles.detailNavActions} />
        </div>
        <div className={styles.profileHero}>
          <div className={styles.heroAvatarSpacer} aria-hidden="true" />
          <div className={styles.heroIdentity}>
            <div className={styles.heroNameLine}>
              <span className={styles.mobileSiteSkeletonLine} data-size="title" />
              <span className={styles.mobileSiteSkeletonLine} data-size="badge" />
            </div>
          </div>
        </div>
        <div className={styles.headerFocus}>
          <span className={styles.headerFocusIcon}><HardHat /></span>
          <span className={styles.headerFocusCopy}>
            <i className={styles.mobileSiteSkeletonLine} data-size="tiny" />
            <i className={styles.mobileSiteSkeletonLine} data-size="wide" />
            <i className={styles.mobileSiteSkeletonLine} data-size="short" />
          </span>
          <span className={styles.mobileSiteSkeletonIcon} />
        </div>
      </header>
      <section className={styles.mobileSiteDetailTabs} aria-hidden="true">
        {Array.from({ length: 8 }).map((_, index) => (
          <span className={styles.mobileSiteSkeletonTab} key={index} />
        ))}
      </section>
    </div>
  );
}

function Row({ title, meta, value, status, image }: { title: string; meta?: string; value?: string; status?: string; image?: string }) {
  return (
    <div className={styles.mobileSiteDetailRow}>
      {image ? <Image src={image} alt="" width={42} height={42} unoptimized /> : <span><FileText /></span>}
      <div><b>{title}</b>{meta ? <small>{meta}</small> : null}</div>
      <em>{value || status || ""}</em>
    </div>
  );
}

function nodeTypeOf(task: Record<string, any>) {
  const text = `${task.node_type || ""} ${task.notes || ""} ${task.node_type_label || ""}`.toLowerCase();
  return text.includes("acceptance") || text.includes("验收") ? "acceptance" : "construction";
}

function nodeStatusLabel(task: Record<string, any>) {
  const type = nodeTypeOf(task);
  const status = String(task.status || "PENDING").toUpperCase();
  if (status === "COMPLETED") return type === "acceptance" ? "已验收" : "已完成";
  if (status === "REVIEW") return type === "acceptance" ? "验收不通过" : "待验收";
  if (status === "SKIPPED") return "不施工";
  return taskStatusLabels[status] || task.status || "待施工";
}

function nodeStatusTone(task: Record<string, any>) {
  const status = String(task.status || "PENDING").toUpperCase();
  if (status === "COMPLETED") return "success";
  if (status === "REVIEW") return "danger";
  if (status === "IN_PROGRESS") return "active";
  if (status === "SKIPPED") return "muted";
  return "pending";
}

function nodeStandardCount(task: Record<string, any>) {
  const type = nodeTypeOf(task);
  const templateNode = task.templateNode || {};
  const standard = type === "acceptance" ? templateNode.acceptanceStandard : templateNode.constructionStandard;
  const items = standard?.standards || standard?.items || standard?.standardItems || templateNode.standardItems || task.standardItems;
  if (Array.isArray(items)) return items.length;
  return String(task.description || task.acceptance || standard?.description || "").trim() ? 1 : 0;
}

function isCustomTask(task: Record<string, any>) {
  return String(task.notes || "").includes("自定义施工节点") || String(task.notes || "").includes("自定义验收节点");
}

function normalizeMobileTemplate(value: any): MobileConstructionTemplate | null {
  const id = String(value?.id || value?.templateId || "").trim();
  const name = String(value?.name || "").trim();
  if (!id || !name) return null;
  const rawStages = Array.isArray(value?.stages) ? value.stages : Array.isArray(value?.durationRules) ? value.durationRules : [];
  return {
    ...value,
    id,
    name,
    stages: rawStages.map((stage: any, index: number) => {
      const stageId = String(stage?.id || `stage-${index + 1}`).trim();
      const stageName = String(stage?.name || `施工阶段${index + 1}`).trim();
      const rawNodes = Array.isArray(stage?.nodes) && stage.nodes.length ? stage.nodes : [{ id: `${stageId}-node`, name: stageName, type: "construction", sortOrder: 1 }];
      return {
        ...stage,
        id: stageId,
        name: stageName,
        sortOrder: Number(stage?.sortOrder || index + 1),
        nodes: rawNodes.map((node: any, nodeIndex: number) => ({
          ...node,
          id: String(node?.id || `node-${index + 1}-${nodeIndex + 1}`).trim(),
          name: String(node?.name || `工序节点${nodeIndex + 1}`).trim(),
          type: node?.type === "acceptance" ? "acceptance" : "construction",
          sortOrder: Number(node?.sortOrder || nodeIndex + 1),
        })).filter((node: MobileTemplateNode) => node.name).sort((left: MobileTemplateNode, right: MobileTemplateNode) => left.sortOrder - right.sortOrder),
      };
    }).filter((stage: MobileTemplateStage) => stage.name).sort((left: MobileTemplateStage, right: MobileTemplateStage) => left.sortOrder - right.sortOrder),
  };
}

function normalizeTemplateText(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function MobileSiteDetailPageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const siteId = String(params.id || "");
  const initialTab = searchParams.get("tab") as SiteTabKey | null;
  const [activeTab, setActiveTab] = useState<SiteTabKey | null>(initialTab && tabs.some((tab) => tab.key === initialTab) ? initialTab : null);
  const [siteDetailDirection, setSiteDetailDirection] = useState<"forward" | "back">("forward");
  const mobileBack = useMobileBack("/m/site");
  const [mobileShell, setMobileShell] = useState<"browser" | "app">("browser");
  const [data, setData] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [siteActionBusy, setSiteActionBusy] = useState<"" | "request" | "confirm">("");
  const [siteActionMessage, setSiteActionMessage] = useState("");
  const [confirmStartOpen, setConfirmStartOpen] = useState(false);
  const [expandedPhaseIds, setExpandedPhaseIds] = useState<Set<string>>(() => new Set());
  const [phaseNodeSheet, setPhaseNodeSheet] = useState<PhaseNodeSheet | null>(null);
  const [phaseActionBusy, setPhaseActionBusy] = useState("");
  const [phaseActionMessage, setPhaseActionMessage] = useState("");
  const [phaseLogForm, setPhaseLogForm] = useState({ completed_work: "", next_plan: "" });
  const [phaseIssueTitle, setPhaseIssueTitle] = useState("");
  const [addNodeGroupId, setAddNodeGroupId] = useState("");
  const [addNodeForm, setAddNodeForm] = useState({ nodeType: "construction", name: "", description: "", plannedStart: "", plannedEnd: "" });
  const [constructionTemplates, setConstructionTemplates] = useState<MobileConstructionTemplate[]>([]);
  const [materialView, setMaterialView] = useState<"shop" | "orders">("shop");
  const [materialOrderFilter, setMaterialOrderFilter] = useState<MaterialOrderFilterKey>("ALL");
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialCategory, setMaterialCategory] = useState("全部");
  const [materialSubcategory, setMaterialSubcategory] = useState("全部");
  const [materialCart, setMaterialCart] = useState<Record<string, MaterialCartLine>>({});
  const materialCartDraftReadyRef = useRef(false);
  const [materialCartRemoveTargetId, setMaterialCartRemoveTargetId] = useState("");
  const [materialSheetMode, setMaterialSheetMode] = useState<MaterialSheetMode | null>(null);
  const [materialOrderSheetExpanded, setMaterialOrderSheetExpanded] = useState(false);
  const [materialItemsExpanded, setMaterialItemsExpanded] = useState(false);
  const [selectedMaterialOrderId, setSelectedMaterialOrderId] = useState("");
  const [materialCancelOrder, setMaterialCancelOrder] = useState<Record<string, any> | null>(null);
  const [materialTemplatePickerOpen, setMaterialTemplatePickerOpen] = useState(false);
  const [materialTemplateConfirm, setMaterialTemplateConfirm] = useState<Record<string, any> | null>(null);
  const [materialOrderBusy, setMaterialOrderBusy] = useState("");
  const [materialOrderMessage, setMaterialOrderMessage] = useState("");
  const [materialOrderForm, setMaterialOrderForm] = useState({ receiver: "", phone: "", address: "", notes: "" });
  const [quantitySheetMode, setQuantitySheetMode] = useState<QuantityReviewSheetMode | null>(null);
  const [selectedQuantityReviewId] = useState("");
  const [quantitySearch, setQuantitySearch] = useState("");
  const [quantityExpandedSpaces, setQuantityExpandedSpaces] = useState<Set<string>>(() => new Set());
  const [quantityExpandedSections, setQuantityExpandedSections] = useState<Set<string>>(() => new Set());
  const [quantityCustomSpaces, setQuantityCustomSpaces] = useState<string[]>([]);
  const [quantitySpaceCreatorOpen, setQuantitySpaceCreatorOpen] = useState(false);
  const [quantityStructureMode, setQuantityStructureMode] = useState<"space" | "category">("space");
  const [quantityNewSpaceName, setQuantityNewSpaceName] = useState("");
  const [quantityCustomCategories, setQuantityCustomCategories] = useState<string[]>([]);
  const [quantityNewCategoryName, setQuantityNewCategoryName] = useState("");
  const [quantityQuotaOptions, setQuantityQuotaOptions] = useState<QuantityQuotaOption[]>([]);
  const [quantityManualSpace, setQuantityManualSpace] = useState("");
  const [quantityManualMode, setQuantityManualMode] = useState<QuantityManualMode>("library");
  const [quantityManualSearch, setQuantityManualSearch] = useState("");
  const [quantitySelectedQuotaIds, setQuantitySelectedQuotaIds] = useState<string[]>([]);
  const [quantityManualDraft, setQuantityManualDraft] = useState<QuantityReviewLine>(() => makeMobileManualLine("", ""));
  const [quantityActualByItemId, setQuantityActualByItemId] = useState<Record<string, string>>({});
  const [quantityEvidenceByItemId, setQuantityEvidenceByItemId] = useState<Record<string, string>>({});
  const [quantityFeeActualByItemId, setQuantityFeeActualByItemId] = useState<Record<string, string>>({});
  const [quantityManualLines, setQuantityManualLines] = useState<QuantityReviewLine[]>([]);
  const [quantityBusy, setQuantityBusy] = useState("");
  const [quantityMessage, setQuantityMessage] = useState("");
  const [quantityCancelReview, setQuantityCancelReview] = useState<Record<string, any> | null>(null);
  const [costSheetMode, setCostSheetMode] = useState<CostSheetMode | null>(null);
  const [costBusy, setCostBusy] = useState("");
  const [costMessage, setCostMessage] = useState("");
  const [selectedCostRowId, setSelectedCostRowId] = useState("");
  const [selectedCostBudgetGroupKey, setSelectedCostBudgetGroupKey] = useState("all");
  const [costDeleteRecord, setCostDeleteRecord] = useState<Record<string, any> | null>(null);
  useBodyScrollLock(Boolean(phaseNodeSheet || addNodeGroupId || confirmStartOpen || materialSheetMode || materialCartRemoveTargetId || materialCancelOrder || materialTemplatePickerOpen || materialTemplateConfirm || quantitySheetMode || quantityCancelReview || quantityManualSpace || costSheetMode || costDeleteRecord));

  useEffect(() => {
    const userAgent = navigator.userAgent || "";
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || Boolean((navigator as any).standalone);
    const androidWebView = /;\s?wv\)/i.test(userAgent) || /\bVersion\/[\d.]+.*Chrome\/[\d.]+ Mobile Safari/i.test(userAgent);
    const iosWebView = /iP(?:hone|ad|od)/i.test(userAgent) && /AppleWebKit/i.test(userAgent) && !/Safari/i.test(userAgent);
    setMobileShell(standalone || androidWebView || iosWebView ? "app" : "browser");
  }, []);

  const loadSiteData = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch("/api/site", { headers: authHeaders() })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "工地详情加载失败");
        return payload;
      })
      .then((payload) => { if (alive) setData(payload); })
      .catch((loadError) => { if (alive) setError(loadError instanceof Error ? loadError.message : "工地详情加载失败"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    return loadSiteData();
  }, [loadSiteData]);

  useEffect(() => {
    const draftKey = `zxgj_material_cart_${siteId}`;
    materialCartDraftReadyRef.current = false;
    try {
      const raw = window.localStorage.getItem(draftKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const restored = Object.entries(parsed).reduce<Record<string, MaterialCartLine>>((result, [materialId, value]) => {
          const quantity = Math.max(0, Number((value as MaterialCartLine | undefined)?.quantity || 0) || 0);
          if (materialId && quantity > 0) result[materialId] = { materialId, quantity };
          return result;
        }, {});
        setMaterialCart(restored);
      } else {
        setMaterialCart({});
      }
    } catch {
      setMaterialCart({});
    } finally {
      materialCartDraftReadyRef.current = true;
    }
  }, [siteId]);

  useEffect(() => {
    if (!materialCartDraftReadyRef.current) return;
    const draftKey = `zxgj_material_cart_${siteId}`;
    const persisted = Object.values(materialCart).reduce<Record<string, MaterialCartLine>>((result, line) => {
      const quantity = Math.max(0, Number(line.quantity || 0) || 0);
      if (line.materialId && quantity > 0) result[line.materialId] = { materialId: line.materialId, quantity };
      return result;
    }, {});
    try {
      if (Object.keys(persisted).length) window.localStorage.setItem(draftKey, JSON.stringify(persisted));
      else window.localStorage.removeItem(draftKey);
    } catch {
      // 本地存储不可用时不影响正常下单。
    }
  }, [materialCart, siteId]);

  useEffect(() => {
    if (!/^(已下单|订单已)/.test(materialOrderMessage)) return;
    const timer = window.setTimeout(() => setMaterialOrderMessage(""), 2500);
    return () => window.clearTimeout(timer);
  }, [materialOrderMessage]);

  useEffect(() => {
    if (materialSheetMode !== "order") {
      setMaterialOrderSheetExpanded(false);
      setMaterialItemsExpanded(false);
    }
  }, [materialSheetMode]);

  useEffect(() => {
    setMaterialItemsExpanded(false);
  }, [selectedMaterialOrderId]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/quota/construction-templates?t=${Date.now()}`, { headers: authHeaders(), cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return [];
        return Array.isArray(payload.items) ? payload.items : [];
      })
      .then((items) => {
        if (!alive) return;
        setConstructionTemplates(items.map(normalizeMobileTemplate).filter(Boolean) as MobileConstructionTemplate[]);
      })
      .catch(() => {
        if (alive) setConstructionTemplates([]);
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const standardOptions = loadMobileStandardQuotaOptions();
    setQuantityQuotaOptions(standardOptions);
    fetch("/api/quota/custom-library?status=active", { headers: authHeaders(), cache: "no-store" })
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => {
        if (!alive) return;
        const customOptions = (Array.isArray(payload?.items) ? payload.items : [])
          .filter((item: any) => item?.name && item?.status !== "disabled")
          .map((item: any): QuantityQuotaOption => ({
            id: String(item.id || ""),
            code: String(item.code || ""),
            category: String(item.category || "未分类"),
            name: String(item.name || ""),
            constructionDescription: String(item.constructionDescription || ""),
            unit: String(item.unit || "项"),
            laborPrice: Number(item.laborPrice || 0) || 0,
            materialPrice: Number(item.materialPrice || 0) || 0,
            status: item.status === "disabled" ? "disabled" : "enabled",
            source: "custom",
            sourceLabel: "自定义库",
          }));
        setQuantityQuotaOptions([...standardOptions, ...customOptions]);
      })
      .catch(() => {
        if (alive) setQuantityQuotaOptions(standardOptions);
      });
    return () => { alive = false; };
  }, []);

  const reloadSiteData = useCallback(async () => {
    const response = await fetch("/api/site", { headers: authHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "工地详情加载失败");
    setData(payload);
  }, []);

  const project = useMemo(() => arr(data, "projects").find((item) => String(item.id) === siteId) as Project | undefined, [data, siteId]);
  const scoped = useMemo(() => {
    const customerId = project?.customer_id;
    const paymentPlans = byProject(arr(data, "paymentPlans"), siteId);
    const planIds = new Set(paymentPlans.map((plan) => String(plan.id)));
    return {
      phases: byProject(arr(data, "phases"), siteId),
      tasks: byProject(arr(data, "tasks"), siteId),
      logs: byProject(arr(data, "logs"), siteId),
      inspections: byProject(arr(data, "inspections"), siteId),
      handovers: byProject(arr(data, "handovers"), siteId),
      contracts: byProject(arr(data, "contracts"), siteId),
      quotations: byProject(arr(data, "quotations"), siteId),
      quotationItems: byProject(arr(data, "quotationItems"), siteId),
      paymentPlans,
      paymentRecords: arr(data, "paymentRecords").filter((record) => planIds.has(String(record.payment_plan_id || ""))),
      depositRecords: byCustomer(arr(data, "depositRecords"), customerId),
      designFeeRecords: byCustomer(arr(data, "designFeeRecords"), customerId),
      team: byCustomer(arr(data, "customerTeam"), customerId),
      attachments: byCustomer(arr(data, "customerAttachments"), customerId),
      costRecords: byProject(arr(data, "costRecords"), siteId),
      costSnapshots: byProject(arr(data, "costSnapshots"), siteId),
      costSnapshotItems: byProject(arr(data, "costSnapshotItems"), siteId),
      changeOrders: byProject(arr(data, "changeOrders"), siteId),
      quantityReviews: byProject(arr(data, "quantityReviews"), siteId),
      bills: byProject(arr(data, "ownerSettlementBills"), siteId),
      materialOrders: byProject(arr(data, "materialOrders"), siteId),
      materialItems: byProject(arr(data, "materialOrderItems"), siteId),
      checkinRecords: byProject(arr(data, "checkinRecords"), siteId),
      checkinCode: arr(data, "checkinCodes").find((code) => String(code.project_id || "") === siteId),
      cameras: byProject(arr(data, "siteCameras"), siteId),
      vrTours: byProject(arr(data, "vrTours"), siteId),
    };
  }, [data, project?.customer_id, siteId]);

  useEffect(() => {
    if (!project) return;
    const managerName = projectManagerName(project, scoped.team);
    const managerPhone = projectManagerPhone(project, scoped.team);
    setMaterialOrderForm((form) => ({
      ...form,
      receiver: managerName,
      phone: managerPhone,
      address: form.address || siteAddress(project),
    }));
  }, [project, scoped.team]);

  const materialCatalog = useMemo(() => arr(data, "materials")
    .filter((item) => !project?.company_id || String(item.company_id || "") === String(project.company_id || ""))
    .sort((left, right) => String(left.category_name || "").localeCompare(String(right.category_name || ""), "zh-CN") || String(left.name || "").localeCompare(String(right.name || ""), "zh-CN")), [data, project?.company_id]);
  const materialOrderTemplates = useMemo(() => arr(data, "materialOrderTemplates"), [data]);
  const materialCategories = useMemo(() => ["全部", ...Array.from(new Set(materialCatalog.map(materialMainCategoryName)))], [materialCatalog]);
  const materialSubcategories = useMemo(() => {
    if (materialCategory === "全部") return [];
    return ["全部", ...Array.from(new Set(materialCatalog
      .filter((item) => materialMainCategoryName(item) === materialCategory)
      .map(materialLeafCategoryName)))];
  }, [materialCatalog, materialCategory]);
  const visibleMaterials = useMemo(() => {
    const keyword = materialSearch.trim().toLowerCase();
    return materialCatalog.filter((item) => {
      const mainCategory = materialMainCategoryName(item);
      const leafCategory = materialLeafCategoryName(item);
      const haystack = [
        item.name,
        item.code,
        item.brand,
        item.product_name,
        item.material_model,
        item.color,
        item.spec,
        item.supplier_name,
        mainCategory,
        leafCategory,
      ].filter(Boolean).join(" ").toLowerCase();
      return (materialCategory === "全部" || mainCategory === materialCategory)
        && (materialSubcategory === "全部" || leafCategory === materialSubcategory)
        && (!keyword || haystack.includes(keyword));
    });
  }, [materialCatalog, materialCategory, materialSearch, materialSubcategory]);
  const cartLines = useMemo(() => Object.values(materialCart)
    .map((line) => ({ ...line, material: materialCatalog.find((item) => String(item.id) === line.materialId) }))
    .filter((line) => line.material && !materialOutOfStock(line.material) && line.quantity > 0) as MaterialCartLineWithMaterial[], [materialCart, materialCatalog]);
  const cartCategoryCounts = useMemo(() => cartLines.reduce((result, line) => {
    const category = materialMainCategoryName(line.material);
    result[category] = (result[category] || 0) + 1;
    result["全部"] = (result["全部"] || 0) + 1;
    return result;
  }, {} as Record<string, number>), [cartLines]);
  const cartSheetLines = useMemo(() => Object.values(materialCart)
    .map((line) => ({ ...line, material: materialCatalog.find((item) => String(item.id) === line.materialId) }))
    .filter((line) => line.material && !materialOutOfStock(line.material)) as MaterialCartLineWithMaterial[], [materialCart, materialCatalog]);
  const materialCartRemoveTarget = useMemo(() => cartSheetLines.find((line) => line.materialId === materialCartRemoveTargetId) || null, [cartSheetLines, materialCartRemoveTargetId]);
  const cartQuantity = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartAmount = cartLines.reduce((sum, line) => sum + line.quantity * Number(line.material.unit_price || 0), 0);
  const cartSupplierGroups = useMemo(() => {
    const groups = new Map<string, MaterialCartSupplierGroup>();
    cartLines.forEach((line) => {
      const supplierId = String(line.material.supplier_id || "").trim();
      const key = supplierId || `none:${line.material.supplier_name || "unknown"}`;
      const supplierName = line.material.supplier_name || "供应方未设置";
      const group = groups.get(key) || { key, supplierId, supplierName, lines: [] as MaterialCartLineWithMaterial[], amount: 0 };
      group.lines.push(line);
      group.amount += line.quantity * Number(line.material.unit_price || 0);
      groups.set(key, group);
    });
    return Array.from(groups.values());
  }, [cartLines]);
  const stockTightCartLines = useMemo(() => cartLines.filter((line) => materialStockTight(line.material)), [cartLines]);
  const selectedMaterialOrder = selectedMaterialOrderId ? scoped.materialOrders.find((order) => String(order.id) === selectedMaterialOrderId) || null : null;
  const selectedMaterialOrderItems = selectedMaterialOrder ? scoped.materialItems.filter((item) => String(item.order_id) === String(selectedMaterialOrder.id)) : [];
  const visibleSelectedMaterialOrderItems = materialItemsExpanded ? selectedMaterialOrderItems : selectedMaterialOrderItems.slice(0, MATERIAL_ORDER_PREVIEW_ITEM_COUNT);
  const quantityDefaultPhase = String(project?.current_phase_key || project?.site_stage || project?.construction_stage_name || "").trim();
  const formalQuotation = useMemo(() => {
    const ranked = scoped.quotations.slice().sort((left, right) => timestampOf(right.updated_at || right.created_at) - timestampOf(left.updated_at || left.created_at));
    return ranked.find((quotation) => ["APPROVED", "SIGNED", "CONFIRMED"].includes(String(quotation.status || "").toUpperCase())) || ranked[0] || null;
  }, [scoped.quotations]);
  const quantityBudgetItems = useMemo(() => {
    const targetId = String(formalQuotation?.id || "");
    const scopedItems = targetId ? scoped.quotationItems.filter((item) => String(item.quotation_id || "") === targetId) : scoped.quotationItems;
    return (scopedItems.length ? scopedItems : scoped.quotationItems)
      .filter((item) => String(item.name || "").trim())
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
  }, [formalQuotation?.id, scoped.quotationItems]);
  const quantityRegularItems = useMemo(() => quantityBudgetItems.filter((item) => !isQuantityComprehensiveFeeItem(item)), [quantityBudgetItems]);
  const quantityFeeItems = useMemo(() => quantityBudgetItems.filter(isQuantityComprehensiveFeeItem), [quantityBudgetItems]);
  const quantityReviews = useMemo(() => scoped.quantityReviews.slice().sort((left, right) => timestampOf(right.created_at) - timestampOf(left.created_at)), [scoped.quantityReviews]);
  const selectedQuantityReview = selectedQuantityReviewId ? quantityReviews.find((review) => String(review.id) === selectedQuantityReviewId) || null : null;
  const selectedQuantityReviewItems = useMemo(() => parseQuantityReviewItems(selectedQuantityReview), [selectedQuantityReview]);
  const savedQuantityByItemId = useMemo(() => {
    const map = new Map<string, { actualQuantity: string; evidenceNote: string }>();
    quantityReviews
      .filter((review) => String(review?.status || "").toUpperCase() !== "CANCELLED")
      .forEach((review) => {
        parseQuantityReviewItems(review).forEach((item) => {
          const itemId = String(item?.quotation_item_id || "").trim();
          if (!itemId || map.has(itemId) || String(item?.source_type || "").toUpperCase() === "MANUAL") return;
          map.set(itemId, {
            actualQuantity: String(item?.actual_quantity ?? ""),
            evidenceNote: String(item?.evidence_note || ""),
          });
        });
      });
    return map;
  }, [quantityReviews]);
  const quantityDraftLines = useMemo(() => {
    const budgetLines = quantityRegularItems
      .map((item) => {
        const itemId = String(item.id || "");
        const actualQuantity = Object.prototype.hasOwnProperty.call(quantityActualByItemId, itemId) ? quantityActualByItemId[itemId] : undefined;
        if (actualQuantity === undefined || String(actualQuantity).trim() === "") return null;
        return makeMobileBudgetLine(item, actualQuantity, quantityEvidenceByItemId[itemId] ?? savedQuantityByItemId.get(itemId)?.evidenceNote ?? "", quantityDefaultPhase);
      })
      .filter((line): line is QuantityReviewLine => Boolean(line));
    const feeLines = quantityFeeItems
      .map((item) => {
        const itemId = String(item.id || "");
        const actualAmount = Object.prototype.hasOwnProperty.call(quantityFeeActualByItemId, itemId) ? quantityFeeActualByItemId[itemId] : undefined;
        if (actualAmount === undefined || String(actualAmount).trim() === "") return null;
        return makeMobileFeeLine(item, actualAmount, quantityEvidenceByItemId[itemId] ?? savedQuantityByItemId.get(itemId)?.evidenceNote ?? "", quantityDefaultPhase);
      })
      .filter((line): line is QuantityReviewLine => Boolean(line));
    const manualLines = quantityManualLines
      .filter((line) => String(line.title || "").trim() && String(line.actual_quantity || "").trim())
      .map((line, index) => ({
        ...line,
        phase: line.phase || quantityDefaultPhase,
        unit_price: String(roundMoney((Number(line.labor_unit_price || 0) || 0) + (Number(line.material_unit_price || 0) || 0)) || Number(line.unit_price || 0) || 0),
        display_order: index,
      }));
    return [...budgetLines, ...feeLines, ...manualLines];
  }, [quantityActualByItemId, quantityDefaultPhase, quantityEvidenceByItemId, quantityFeeActualByItemId, quantityFeeItems, quantityManualLines, quantityRegularItems, savedQuantityByItemId]);
  const quantityDraftSummary = useMemo(() => quantityDraftLines.reduce((acc, line) => {
    const diff = getQuantityLineDiff(line);
    return {
      addAmount: acc.addAmount + (diff.type === "ADD" ? diff.amount : 0),
      deductAmount: acc.deductAmount + (diff.type === "DEDUCT" ? diff.amount : 0),
      netAmount: acc.netAmount + diff.signedAmount,
    };
  }, { addAmount: 0, deductAmount: 0, netAmount: 0 }), [quantityDraftLines]);
  const quantityBaseSpaceNames = useMemo(() => new Set(quantityRegularItems.map((item) => getQuantitySpaceName(item.space))), [quantityRegularItems]);
  const quantityAllSpaceNames = useMemo(() => {
    const names = new Set(quantityBaseSpaceNames);
    quantityCustomSpaces.forEach((space) => names.add(getQuantitySpaceName(space)));
    return names;
  }, [quantityBaseSpaceNames, quantityCustomSpaces]);
  const quantitySpaceManualLines = useMemo(() => {
    const map = new Map<string, Array<{ line: QuantityReviewLine; index: number }>>();
    quantityManualLines.forEach((line, index) => {
      const space = getQuantitySpaceName(line.space);
      if (!quantityAllSpaceNames.has(space)) return;
      const list = map.get(space) || [];
      list.push({ line, index });
      map.set(space, list);
    });
    return map;
  }, [quantityAllSpaceNames, quantityManualLines]);
  const quantitySpaceGroups = useMemo(() => {
    const keyword = quantitySearch.trim().toLowerCase();
    const map = new Map<string, Record<string, any>[]>();
    quantityRegularItems.forEach((item) => {
      const haystack = [item.name, item.space, item.category, item.spec, item.remark].join(" ").toLowerCase();
      if (keyword && !haystack.includes(keyword)) return;
      const space = getQuantitySpaceName(item.space);
      const list = map.get(space) || [];
      list.push(item);
      map.set(space, list);
    });
    quantityAllSpaceNames.forEach((space) => {
      const manualLines = quantitySpaceManualLines.get(space) || [];
      const manualMatched = manualLines.some(({ line }) => [line.title, line.category, line.space, line.evidence_note].join(" ").toLowerCase().includes(keyword));
      if (!keyword || map.has(space) || space.toLowerCase().includes(keyword) || manualMatched) {
        if (!map.has(space)) map.set(space, []);
      }
    });
    return Array.from(map.entries()).map(([space, items]) => ({ space, items }));
  }, [quantityAllSpaceNames, quantityRegularItems, quantitySearch, quantitySpaceManualLines]);
  const quantitySearchActive = Boolean(quantitySearch.trim());
  const quantityAllSpacesCollapsed = quantityExpandedSpaces.has(QUANTITY_ALL_COLLAPSED_KEY);
  const quantityFilledFeeCount = useMemo(() => quantityFeeItems.filter((item) => {
    const itemId = String(item.id || "");
    const value = Object.prototype.hasOwnProperty.call(quantityFeeActualByItemId, itemId) ? quantityFeeActualByItemId[itemId] : savedQuantityByItemId.get(itemId)?.actualQuantity;
    return String(value || "").trim();
  }).length, [quantityFeeActualByItemId, quantityFeeItems, savedQuantityByItemId]);
  const quantityFeeSectionExpanded = quantityExpandedSections.has("fee");
  const quantityAllSpacesExpanded = quantitySpaceGroups.length > 0 && quantitySpaceGroups.every((group) => quantityExpandedSpaces.has(group.space));
  const quantityAllReviewSectionsExpanded = quantityAllSpacesExpanded && (!quantityFeeItems.length || quantityFeeSectionExpanded);
  const quantityCategoryOptions = useMemo(() => {
    const options = new Set<string>();
    quantityRegularItems.forEach((item) => {
      const category = getQuotationCategoryLabel(item.category);
      if (category && category !== "-") options.add(category);
    });
    quantityCustomCategories.forEach((category) => {
      const normalized = String(category || "").trim();
      if (normalized) options.add(normalized);
    });
    if (!options.size) options.add("基装");
    return Array.from(options);
  }, [quantityCustomCategories, quantityRegularItems]);
  const filteredQuantityQuotaOptions = useMemo(() => {
    const keyword = quantityManualSearch.trim().toLowerCase();
    const matched = keyword
      ? quantityQuotaOptions.filter((quota) => getMobileQuotaSearchText(quota).includes(keyword))
      : quantityQuotaOptions;
    return {
      keyword,
      total: matched.length,
      items: matched.slice(0, keyword ? 60 : 18),
    };
  }, [quantityManualSearch, quantityQuotaOptions]);
  const materialOrderFilterCounts = useMemo(() => scoped.materialOrders.reduce((result: Record<MaterialOrderFilterKey, number>, order) => {
    const key = materialOrderFilterKey(order);
    result.ALL += 1;
    result[key] += 1;
    return result;
  }, { ALL: 0, PENDING: 0, PARTIAL: 0, RECEIVED: 0, CANCELLED: 0 }), [scoped.materialOrders]);
  const visibleMaterialOrders = useMemo(() => scoped.materialOrders.filter((order) => materialOrderFilter === "ALL" || materialOrderFilterKey(order) === materialOrderFilter), [materialOrderFilter, scoped.materialOrders]);

  const contractAmount = Number(project?.contract_amount || scoped.contracts[0]?.amount || 0);
  const receivedAmount = scoped.paymentRecords.reduce((sum, record) => sum + Number(record.amount || record.received_amount || 0), 0)
    + scoped.depositRecords.reduce((sum, record) => sum + Number(record.amount || record.received_amount || 0), 0)
    + scoped.designFeeRecords.reduce((sum, record) => sum + Number(record.amount || record.received_amount || 0), 0);
  const remainingAmount = Math.max(0, contractAmount - receivedAmount);
  const overReceivedAmount = Math.max(0, receivedAmount - contractAmount);
  const paymentProgress = contractAmount > 0 ? Math.min(100, Math.round((receivedAmount / contractAmount) * 100)) : 0;
  const paymentPlanLabelById = scoped.paymentPlans.reduce((result: Record<string, string>, plan: Record<string, any>, index: number) => {
    result[String(plan.id || "")] = String(plan.milestone || plan.name || plan.title || `第${index + 1}期工程款`);
    return result;
  }, {});
  const paymentItems = [
    ...scoped.paymentRecords.map((record) => {
      const planLabel = paymentPlanLabelById[String(record.payment_plan_id || "")] || "";
      return { ...record, payment_kind: planLabel || normalizePaymentTitle(record, "工程款"), payment_stage_label: planLabel ? `工程款 · ${planLabel}` : "工程款" };
    }),
    ...scoped.depositRecords.map((record) => ({ ...record, payment_kind: normalizePaymentTitle(record, "定金"), payment_stage_label: "定金流水" })),
    ...scoped.designFeeRecords.map((record) => ({ ...record, payment_kind: normalizePaymentTitle(record, "设计费"), payment_stage_label: "设计费流水" })),
  ].sort((a, b) => timestampOf(b.pay_date || b.received_at || b.created_at) - timestampOf(a.pay_date || a.received_at || a.created_at));
  const activeContract = scoped.contracts[0] || null;
  const activePaymentPlans = activeContract && scoped.paymentPlans.some((plan) => String(plan.contract_id || "") === String(activeContract.id))
    ? scoped.paymentPlans.filter((plan) => String(plan.contract_id || "") === String(activeContract.id))
    : scoped.paymentPlans;
  const receivedByPaymentPlan = scoped.paymentRecords.reduce((result: Record<string, number>, record) => {
    const planId = String(record.payment_plan_id || "");
    result[planId] = (result[planId] || 0) + paymentAmount(record);
    return result;
  }, {});
  const contractPaymentStages = Array.isArray(activeContract?.content?.amount_info?.payment_stages)
    ? activeContract.content.amount_info.payment_stages
    : Array.isArray(activeContract?.content?.payment_stages)
      ? activeContract.content.payment_stages
      : [];
  const paymentStageRows: PaymentStageRow[] = (activePaymentPlans.length ? [...activePaymentPlans].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)) : contractPaymentStages).map((plan: Record<string, any>, index: number) => {
    const expected = Math.max(0, Number(plan.amount || plan.receivable_amount || 0) || 0);
    const received = activePaymentPlans.length ? Math.max(0, Number(receivedByPaymentPlan[String(plan.id || "")] || 0) || 0) : 0;
    const unpaid = Math.max(0, expected - received);
    const status = paymentStageStatus(expected, received, plan.due_date || plan.dueDate, plan.status);
    return {
      id: String(plan.id || `stage_${index}`),
      index: index + 1,
      title: String(plan.milestone || plan.name || plan.title || `第${index + 1}期工程款`),
      subtitle: "工程款",
      kind: "project",
      dueDate: plan.due_date || plan.dueDate,
      expected,
      received: Math.min(expected, received),
      unpaid: status.tone === "success" ? 0 : unpaid,
      status,
    };
  });
  const depositDueRows: PaymentStageRow[] = [...scoped.depositRecords, ...scoped.designFeeRecords].map((record, index) => {
    const expected = Math.max(0, Number(record.receivable_amount || record.amount || record.received_amount || 0) || 0);
    const received = Math.max(0, paymentAmount(record));
    const waived = Math.max(0, Number(record.waived_amount || 0) || 0);
    const unpaid = Math.max(0, expected - received - waived);
    const title = normalizePaymentTitle(record, record.record_type === "design_fee" ? "设计费" : "定金");
    return {
      id: String(record.id || `deposit_${index}`),
      index: index + 1,
      title,
      subtitle: record.record_type === "design_fee" ? "设计费" : "定金",
      kind: record.record_type === "design_fee" ? "design" : "deposit",
      dueDate: record.received_at || record.created_at,
      expected,
      received: Math.min(expected, received),
      unpaid,
      status: paymentStageStatus(expected, received + waived, record.received_at || record.created_at, record.status),
    };
  });
  const changeAmount = scoped.changeOrders.reduce((sum, order) => sum + Number(order.amount || order.receivable_amount || 0), 0);
  const activeCostSnapshot = useMemo(() => scoped.costSnapshots.slice().sort((left, right) => timestampOf(right.updated_at || right.created_at) - timestampOf(left.updated_at || left.created_at))[0] || null, [scoped.costSnapshots]);
  const activeCostSnapshotItems = useMemo(() => activeCostSnapshot
    ? scoped.costSnapshotItems.filter((item) => String(item.snapshot_id || "") === String(activeCostSnapshot.id || ""))
    : scoped.costSnapshotItems, [activeCostSnapshot, scoped.costSnapshotItems]);
  const materialOrderById = useMemo(() => new Map(scoped.materialOrders.map((order) => [String(order.id || ""), order])), [scoped.materialOrders]);
  const manualCostRows = useMemo(() => scoped.costRecords.map((record) => ({
    ...record,
    source_type: "MANUAL",
    source_label: "手工录入",
    source_no: record.invoice_no || "",
    can_delete: true,
  })), [scoped.costRecords]);
  const materialCostRows = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    scoped.materialItems.forEach((item) => {
      const order = materialOrderById.get(String(item.order_id || ""));
      const actualCost = getMobileMaterialOrderItemActualCost(item, order);
      if (!actualCost) return;
      const { order: matchedOrder, orderType, amount, costQuantity } = actualCost;
      const key = String(matchedOrder.id || "");
      const category = orderType === "MAIN_SUPPLIER" ? "MAIN_MATERIAL" : "AUXILIARY";
      const paidEnough = Number(matchedOrder.paid_amount || 0) >= Number(matchedOrder.total_amount || 0) && Number(matchedOrder.total_amount || 0) > 0;
      const status = matchedOrder.settlement_status === "SETTLED" || paidEnough ? "PAID" : Number(matchedOrder.paid_amount || 0) > 0 ? "PENDING" : "UNPAID";
      const current = map.get(key) || {
        id: `MATERIAL_COST_${key}`,
        project_id: matchedOrder.project_id,
        category,
        phase: "",
        name: `${mobileMaterialOrderTypeLabel(orderType)} · ${matchedOrder.order_no || "-"}`,
        amount: 0,
        cost_date: matchedOrder.received_at || matchedOrder.order_date || matchedOrder.created_at,
        supplier: materialOrderSupplierName(matchedOrder),
        payee: materialOrderSupplierName(matchedOrder),
        payment_method: orderType === "AUXILIARY_WAREHOUSE" ? "库存出库" : "材料下单",
        status,
        invoice_no: matchedOrder.order_no || "",
        remark: "系统根据材料订单明细和入库价自动计算",
        created_by_name: matchedOrder.created_by_name || "",
        source_type: "MATERIAL_ORDER",
        source_label: "材料订单",
        source_no: matchedOrder.order_no || "",
        can_delete: false,
        item_count: 0,
        quantity: 0,
      };
      current.amount = roundMoney(Number(current.amount || 0) + amount);
      current.item_count = Number(current.item_count || 0) + 1;
      current.quantity = roundMoney(Number(current.quantity || 0) + costQuantity);
      map.set(key, current);
    });
    return Array.from(map.values());
  }, [materialOrderById, scoped.materialItems]);
  const costLedgerRows = useMemo(() => [...manualCostRows, ...materialCostRows].sort((left, right) => {
    const timeCompare = timestampOf(right.cost_date || right.created_at) - timestampOf(left.cost_date || left.created_at);
    if (timeCompare !== 0) return timeCompare;
    return String(right.id || "").localeCompare(String(left.id || ""));
  }), [manualCostRows, materialCostRows]);
  const costAmount = costLedgerRows.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const budgetRevenueAmount = roundMoney(Number(activeCostSnapshot?.revenue_amount || 0));
  const budgetMaterialCostAmount = roundMoney(Number(activeCostSnapshot?.budget_material_cost || 0));
  const budgetLaborCostAmount = roundMoney(Number(activeCostSnapshot?.budget_labor_cost || 0));
  const budgetTotalCostAmount = roundMoney(Number(activeCostSnapshot?.budget_total_cost || 0));
  const budgetGrossProfitAmount = roundMoney(Number(activeCostSnapshot?.budget_gross_profit || 0));
  const budgetGrossProfitRate = Number(activeCostSnapshot?.budget_gross_profit_rate || 0);
  const budgetMissingRuleCount = Number(activeCostSnapshot?.missing_rule_count || 0);
  const budgetActualCostGap = roundMoney(budgetTotalCostAmount - costAmount);
  const costCollectionRate = budgetTotalCostAmount > 0 ? Math.round((costAmount / budgetTotalCostAmount) * 1000) / 10 : 0;
  const costCollectionProgress = Math.min(100, Math.max(0, costCollectionRate));
  const realtimeGrossProfitAmount = roundMoney(contractAmount + changeAmount - costAmount);
  const realtimeGrossProfitRate = contractAmount + changeAmount > 0 ? Math.round((realtimeGrossProfitAmount / (contractAmount + changeAmount)) * 1000) / 10 : 0;
  const makeCostBudgetGroupRows = (type: "work" | "material") => {
    const groups = new Map<string, any>();
    activeCostSnapshotItems.forEach((item) => {
      const name = String((type === "work" ? item.work_type_name : item.material_category_name) || "").trim() || "未指定";
      const key = `${type}:${name}`;
      const current = groups.get(key) || { key, type, name, count: 0, amount: 0, materialAmount: 0, laborAmount: 0, missingCount: 0 };
      current.count += 1;
      current.amount = roundMoney(current.amount + Number(item.budget_total_cost || 0));
      current.materialAmount = roundMoney(current.materialAmount + Number(item.budget_material_cost || 0));
      current.laborAmount = roundMoney(current.laborAmount + Number(item.budget_labor_cost || 0));
      current.missingCount += Number(item.missing_cost_rule || 0) === 1 ? 1 : 0;
      groups.set(key, current);
    });
    return Array.from(groups.values()).sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0));
  };
  const budgetWorkGroups = makeCostBudgetGroupRows("work");
  const budgetMaterialGroups = makeCostBudgetGroupRows("material");
  const budgetWorkNameSet = new Set(budgetWorkGroups.map((group) => String(group.name || "").trim() || "未指定"));
  const budgetMaterialNameSet = new Set(budgetMaterialGroups.map((group) => String(group.name || "").trim() || "未指定"));
  const resolveActualMaterialGroupName = (categoryName: string) => {
    const normalizedName = String(categoryName || "").trim() || "未指定材料分类";
    if (budgetMaterialNameSet.has(normalizedName)) return normalizedName;
    const parts = normalizedName.split("/").map((part) => part.trim()).filter(Boolean);
    const parentName = parts[0] || "";
    if (parentName && budgetMaterialNameSet.has(parentName)) return parentName;
    const childName = parts[parts.length - 1] || "";
    if (childName && budgetMaterialNameSet.has(childName)) return childName;
    return normalizedName;
  };
  const actualWorkCostMap = new Map<string, number>();
  const actualMaterialCostMap = new Map<string, number>();
  let actualOtherCostAmount = 0;
  const addActualCostAmount = (map: Map<string, number>, name: string, amount: number) => {
    const key = String(name || "").trim() || "未指定";
    map.set(key, roundMoney((map.get(key) || 0) + Math.max(0, Number(amount || 0) || 0)));
  };
  manualCostRows.forEach((record) => {
    const amount = Math.max(0, Number(record.amount || 0) || 0);
    if (amount <= 0) return;
    const category = String(record.category || "").toUpperCase();
    if (category === "LABOR" || category === "SUBCONTRACT") {
      addActualCostAmount(actualWorkCostMap, String(record.work_type_name || "").trim() || record.phase || "未指定工种", amount);
      return;
    }
    if (["AUXILIARY", "MAIN_MATERIAL", "EQUIPMENT"].includes(category)) {
      addActualCostAmount(actualMaterialCostMap, resolveActualMaterialGroupName(String(record.material_category_name || "").trim() || costCategoryLabel(category)), amount);
      return;
    }
    actualOtherCostAmount = roundMoney(actualOtherCostAmount + amount);
  });
  scoped.materialItems.forEach((item) => {
    const actualCost = getMobileMaterialOrderItemActualCost(item, materialOrderById.get(String(item.order_id || "")));
    if (!actualCost) return;
    addActualCostAmount(actualMaterialCostMap, resolveActualMaterialGroupName(String(item.category_name || "").trim() || "未指定材料分类"), actualCost.amount);
  });
  const budgetAllGroup = {
    key: "all",
    type: "all",
    name: "全部预算明细",
    count: activeCostSnapshotItems.length,
    amount: budgetTotalCostAmount,
    materialAmount: budgetMaterialCostAmount,
    laborAmount: budgetLaborCostAmount,
    missingCount: budgetMissingRuleCount,
  };
  const budgetGroupRows = [budgetAllGroup, ...budgetWorkGroups, ...budgetMaterialGroups];
  const selectedCostBudgetGroup = budgetGroupRows.find((group) => group.key === selectedCostBudgetGroupKey) || budgetAllGroup;
  const getCostBudgetGroupActualAmount = (group: any) => {
    if (group.type === "work") return roundMoney(actualWorkCostMap.get(String(group.name || "").trim() || "未指定") || 0);
    if (group.type === "material") return roundMoney(actualMaterialCostMap.get(String(group.name || "").trim() || "未指定") || 0);
    return roundMoney(
      Array.from(actualWorkCostMap.values()).reduce((sum, amount) => sum + amount, 0)
      + Array.from(actualMaterialCostMap.values()).reduce((sum, amount) => sum + amount, 0)
      + actualOtherCostAmount
    );
  };
  const isWorkCostBudgetGroup = selectedCostBudgetGroup.type === "work";
  const isMaterialCostBudgetGroup = selectedCostBudgetGroup.type === "material";
  const selectedCostBudgetAmount = isWorkCostBudgetGroup
    ? Number(selectedCostBudgetGroup.laborAmount || 0)
    : isMaterialCostBudgetGroup
      ? Number(selectedCostBudgetGroup.materialAmount || 0)
      : Number(selectedCostBudgetGroup.amount || 0);
  const selectedCostBudgetActualAmount = getCostBudgetGroupActualAmount(selectedCostBudgetGroup);
  const selectedCostBudgetGap = roundMoney(selectedCostBudgetAmount - selectedCostBudgetActualAmount);
  const getCostBudgetItemActualAmount = (item: Record<string, any>) => {
    if (isWorkCostBudgetGroup) return roundMoney(actualWorkCostMap.get(String(item.work_type_name || "").trim() || "未指定") || 0);
    if (isMaterialCostBudgetGroup) return roundMoney(actualMaterialCostMap.get(String(item.material_category_name || "").trim() || "未指定") || 0);
    return roundMoney(
      (actualWorkCostMap.get(String(item.work_type_name || "").trim() || "未指定") || 0)
      + (actualMaterialCostMap.get(String(item.material_category_name || "").trim() || "未指定") || 0)
    );
  };
  const visibleCostBudgetRows = selectedCostBudgetGroup.key === "all" ? activeCostSnapshotItems : activeCostSnapshotItems.filter((item) => {
    const name = selectedCostBudgetGroup.type === "work"
      ? String(item.work_type_name || "").trim() || "未指定"
      : String(item.material_category_name || "").trim() || "未指定";
    return `${selectedCostBudgetGroup.type}:${name}` === selectedCostBudgetGroup.key;
  });
  const actualCostCompareRows = [
    ...budgetWorkGroups.map((group) => makeCostCompareRow({ key: `work:${group.name}`, type: "工种", name: group.name, budgetAmount: Number(group.laborAmount || 0), actualAmount: actualWorkCostMap.get(String(group.name || "").trim() || "未指定") || 0 })),
    ...budgetMaterialGroups.map((group) => makeCostCompareRow({ key: `material:${group.name}`, type: "材料", name: group.name, budgetAmount: Number(group.materialAmount || 0), actualAmount: actualMaterialCostMap.get(String(group.name || "").trim() || "未指定") || 0 })),
    ...Array.from(actualWorkCostMap.entries()).filter(([name]) => !budgetWorkNameSet.has(name)).map(([name, amount]) => makeCostCompareRow({ key: `actual-work:${name}`, type: "工种", name, budgetAmount: 0, actualAmount: amount })),
    ...Array.from(actualMaterialCostMap.entries()).filter(([name]) => !budgetMaterialNameSet.has(name)).map(([name, amount]) => makeCostCompareRow({ key: `actual-material:${name}`, type: "材料", name, budgetAmount: 0, actualAmount: amount })),
    ...(actualOtherCostAmount > 0 ? [makeCostCompareRow({ key: "actual-other", type: "其他", name: "其他成本", budgetAmount: 0, actualAmount: actualOtherCostAmount })] : []),
  ].filter((row) => row.budgetAmount > 0 || row.actualAmount > 0);
  const costCompareOverBudgetCount = actualCostCompareRows.filter((row) => row.diffAmount < -0.005).length;
  const selectedCostRow = selectedCostRowId ? costLedgerRows.find((row) => String(row.id) === selectedCostRowId) || null : null;
  const durationDays = Number(project?.contract_duration_days || project?.handover_duration_days || 0);
  const managerName = projectManagerName(project, scoped.team);
  const currentSiteStage = String(project?.site_stage || "").toUpperCase();
  const currentStatus = String(project?.status || "").toUpperCase();
  const currentHandover = scoped.handovers[0] || null;
  const scheduleWeekendConstruction = toBooleanFlag(currentHandover?.weekend_construction ?? project?.weekend_construction);
  const scheduleHolidayConstruction = toBooleanFlag(currentHandover?.holiday_construction ?? project?.holiday_construction);
  const scheduleHasFloorHeating = toBooleanFlag(currentHandover?.has_floor_heating ?? project?.has_floor_heating);
  const handoverCompleted = Boolean(String(currentHandover?.status || "").toLowerCase() === "completed" || currentHandover?.completed_at || project?.handover_completed_at);
  const siteInConstruction = ["CONSTRUCTION", "OWNER_SETTLEMENT", "SITE_SETTLEMENT"].includes(currentSiteStage) || ["CONSTRUCTION", "COMPLETED", "CLOSED"].includes(currentStatus);
  const canRequestStart = Boolean(project && !siteInConstruction && !handoverCompleted && (currentSiteStage === "" || currentSiteStage === "PENDING_START"));
  const canConfirmStart = Boolean(project && !siteInConstruction && (currentSiteStage === "START_CONFIRM" || handoverCompleted));
  const startActionFacts = [
    { label: "计划开工", value: dateText(currentHandover?.planned_start || project?.start_date) },
    { label: "计划竣工", value: dateText(currentHandover?.planned_end || project?.planned_end_date) },
    { label: "合同工期", value: Number(currentHandover?.duration_days || durationDays || 0) > 0 ? `${Number(currentHandover?.duration_days || durationDays)} 天` : "-" },
    { label: "施工模板", value: currentHandover?.construction_template_name || project?.construction_template_name || "未设置" },
  ];
  const moduleStats: Record<SiteTabKey, string> = {
    overview: "基础资料",
    payments: `已收 ¥${compactMoney(receivedAmount)}`,
    schedule: `${scoped.tasks.length} 节点`,
    phase: `${scoped.phases.length || scoped.tasks.length} 项`,
    records: `${scoped.logs.length + scoped.inspections.length} 条`,
    quantity: `${scoped.quantityReviews.length} 张`,
    materials: `${scoped.materialOrders.length} 单`,
    changes: `¥${compactMoney(changeAmount)}`,
    costs: `¥${compactMoney(costAmount)}`,
    settlement: `${scoped.bills.length} 张`,
    cameras: `${scoped.cameras.length} 个`,
    checkin: `${scoped.checkinRecords.length} 条`,
    archive: `${scoped.attachments.length + scoped.vrTours.length} 份`,
  };
  const phaseGroups = useMemo<PhaseGroup[]>(() => {
    const latestHandover = scoped.handovers[0] || {};
    const templateId = String(project?.construction_template_id || latestHandover.construction_template_id || "").trim();
    const templateName = String(project?.construction_template_name || latestHandover.construction_template_name || "").trim();
    const decorationType = String(project?.decoration_type || project?.construction_template_decoration_type || latestHandover.construction_template_decoration_type || "").trim();
    const matchedTemplate = constructionTemplates.find((template) => templateId && template.id === templateId)
      || constructionTemplates.find((template) => templateName && template.name === templateName)
      || constructionTemplates.find((template) => decorationType && String(template.decorationType || template.decoration_type || "").trim() === decorationType)
      || null;
    if (matchedTemplate?.stages?.length) {
      const planStart = currentHandover?.planned_start || project?.start_date || project?.planned_start || project?.planned_start_date;
      const planStartDate = parseDateOnlyValue(planStart);
      const planOptions = {
        weekendConstruction: scheduleWeekendConstruction,
        holidayConstruction: scheduleHolidayConstruction,
      };
      const areaValue = project?.area || project?.customer_area_size || project?.building_area || project?.house_area;
      const plannedNodeDates = new Map<string, { plannedStart: string; plannedEnd: string; plannedDays: number }>();
      let planCursor = planStartDate ? new Date(planStartDate) : null;
      matchedTemplate.stages.forEach((stage) => {
        stage.nodes.forEach((node) => {
          if (!planCursor) return;
          const plannedDays = mobileNodeDurationDays(matchedTemplate, stage, node, areaValue, scheduleHasFloorHeating);
          const dates = collectMobileWorkingDates(planCursor, plannedDays, planOptions);
          if (!dates.length) return;
          plannedNodeDates.set(`${stage.id}-${node.id}`, {
            plannedStart: formatDateOnlyValue(dates[0]),
            plannedEnd: formatDateOnlyValue(dates[dates.length - 1]),
            plannedDays,
          });
          planCursor = addCalendarDaysValue(dates[dates.length - 1], 1);
        });
      });
      const groups = matchedTemplate.stages.map((stage, index) => {
        const phase = scoped.phases.find((item) => normalizeTemplateText(item.phase) === normalizeTemplateText(stage.id) || normalizeTemplateText(item.name) === normalizeTemplateText(stage.name)) || null;
        const actualTasks = scoped.tasks.filter((task) => phase ? String(task.phase_id || "") === String(phase.id || "") : false);
        const actualByName = new Map(actualTasks.map((task) => [normalizeTemplateText(task.name), task]));
        const templateTasks = stage.nodes.map((node) => {
          const plannedDate = plannedNodeDates.get(`${stage.id}-${node.id}`);
          const actual = actualByName.get(normalizeTemplateText(node.name));
          if (actual) return {
            ...actual,
            planned_start: actual.planned_start || plannedDate?.plannedStart || "",
            planned_end: actual.planned_end || plannedDate?.plannedEnd || "",
            planned_days: actual.planned_days || plannedDate?.plannedDays || "",
            template_node_id: node.id,
            node_type: node.type,
            templateNode: node,
          };
          return {
            id: `template-${stage.id}-${node.id}`,
            project_id: project?.id,
            phase_id: phase?.id || "",
            name: node.name,
            description: node.constructionStandard?.description || node.acceptanceStandard?.description || node.description || "",
            status: "PENDING",
            planned_start: plannedDate?.plannedStart || "",
            planned_end: plannedDate?.plannedEnd || "",
            planned_days: plannedDate?.plannedDays || "",
            notes: node.type === "acceptance" ? "验收节点" : "施工节点",
            node_type: node.type,
            template_node_id: node.id,
            templateNode: node,
            is_template_virtual: true,
          };
        });
        const templateNames = new Set(stage.nodes.map((node) => normalizeTemplateText(node.name)));
        const customTasks = actualTasks.filter((task) => !templateNames.has(normalizeTemplateText(task.name)));
        const tasks = [...templateTasks, ...customTasks].sort((left, right) => Number(left.templateNode?.sortOrder || left.sort_order || 0) - Number(right.templateNode?.sortOrder || right.sort_order || 0));
        const doneCount = tasks.filter((task) => ["COMPLETED", "SKIPPED"].includes(String(task.status || "").toUpperCase())).length;
        const reviewCount = tasks.filter((task) => String(task.status || "").toUpperCase() === "REVIEW").length;
        const progressingCount = tasks.filter((task) => String(task.status || "").toUpperCase() === "IN_PROGRESS").length;
        return {
          id: stage.id,
          name: stage.name,
          status: doneCount >= tasks.length && tasks.length > 0 ? "COMPLETED" : reviewCount > 0 ? "REVIEW" : progressingCount > 0 ? "IN_PROGRESS" : String(phase?.status || "PENDING").toUpperCase(),
          sort: Number(stage.sortOrder || index + 1),
          phase,
          tasks,
        };
      });
      const groupedTaskIds = new Set(groups.flatMap((group) => group.tasks.map((task) => String(task.id))));
      const extraTasks = scoped.tasks.filter((task) => !groupedTaskIds.has(String(task.id)));
      if (extraTasks.length > 0) {
        groups.push({ id: "custom-extra", name: "新增节点", status: "PENDING", sort: 9998, phase: null, tasks: extraTasks });
      }
      return groups;
    }
    const groups: PhaseGroup[] = scoped.phases
      .slice()
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map((phase, index) => ({
        id: String(phase.phase || phase.id || `phase-${index}`),
        name: String(phase.name || phase.phase || `施工阶段${index + 1}`),
        status: String(phase.status || "PENDING").toUpperCase(),
        sort: Number(phase.sort_order || index + 1),
        phase,
        tasks: scoped.tasks
          .filter((task) => String(task.phase_id || "") === String(phase.id || ""))
          .sort((a, b) => Number(a.sort_order || a.node_sort_order || 0) - Number(b.sort_order || b.node_sort_order || 0) || String(a.planned_start || "").localeCompare(String(b.planned_start || ""))),
      }));
    const groupedTaskIds = new Set(groups.flatMap((group) => group.tasks.map((task) => String(task.id))));
    const orphanTasks = scoped.tasks.filter((task) => !groupedTaskIds.has(String(task.id)));
    if (orphanTasks.length > 0) {
      groups.push({
        id: "ungrouped",
        name: "未分阶段",
        status: "PENDING",
        sort: 9999,
        phase: null,
        tasks: orphanTasks,
      });
    }
    return groups;
  }, [constructionTemplates, currentHandover?.planned_start, project, scheduleHasFloorHeating, scheduleHolidayConstruction, scheduleWeekendConstruction, scoped.handovers, scoped.phases, scoped.tasks]);
  const phaseTotalNodeCount = phaseGroups.reduce((sum, group) => sum + group.tasks.length, 0);
  const phaseDoneNodeCount = phaseGroups.reduce((sum, group) => sum + group.tasks.filter((task) => ["COMPLETED", "SKIPPED"].includes(String(task.status || "").toUpperCase())).length, 0);
  const scheduleStageRows = useMemo(() => phaseGroups.map((group, index) => {
    const plannedStart = minDateValue(group.tasks.map((task) => task.planned_start));
    const plannedEnd = maxDateValue(group.tasks.map((task) => task.planned_end));
    const actualStart = group.phase?.start_date || minDateValue(group.tasks.map((task) => task.actual_start));
    const actualEnd = group.phase?.end_date || maxDateValue(group.tasks.map((task) => task.actual_end));
    const completedCount = group.tasks.filter((task) => ["COMPLETED", "SKIPPED"].includes(String(task.status || "").toUpperCase())).length;
    const activeCount = group.tasks.filter((task) => String(task.status || "").toUpperCase() === "IN_PROGRESS").length;
    const reviewCount = group.tasks.filter((task) => String(task.status || "").toUpperCase() === "REVIEW").length;
    const progress = group.tasks.length ? Math.round((completedCount / group.tasks.length) * 100) : 0;
    const status = completedCount >= group.tasks.length && group.tasks.length > 0
      ? "COMPLETED"
      : reviewCount > 0
        ? "REVIEW"
        : activeCount > 0
          ? "IN_PROGRESS"
          : group.status;
    return {
      ...group,
      index,
      plannedStart,
      plannedEnd,
      actualStart,
      actualEnd,
      completedCount,
      progress,
      status,
      plannedDays: daysBetween(plannedStart, plannedEnd),
      actualDays: daysBetween(actualStart, actualEnd || getTodayDateOnly()),
      delay: scheduleDelayMeta(plannedEnd, actualEnd, status),
    };
  }), [phaseGroups]);
  const schedulePlannedStart = currentHandover?.planned_start || project?.start_date || minDateValue(scheduleStageRows.map((group) => group.plannedStart));
  const schedulePlannedEnd = currentHandover?.planned_end || project?.planned_end_date || maxDateValue(scheduleStageRows.map((group) => group.plannedEnd));
  const scheduleTotalDays = Number(currentHandover?.duration_days || durationDays || 0) || daysBetween(schedulePlannedStart, schedulePlannedEnd) || 0;
  const scheduleProgress = phaseTotalNodeCount ? Math.round((phaseDoneNodeCount / phaseTotalNodeCount) * 100) : 0;
  const scheduleDelayedNodeCount = phaseGroups.reduce((sum, group) => sum + group.tasks.filter((task) => {
    const status = String(task.status || "PENDING").toUpperCase();
    const delay = scheduleDelayMeta(task.planned_end, task.actual_end, status);
    return delay.tone === "danger";
  }).length, 0);
  const scheduleCompletedStageCount = scheduleStageRows.filter((group) => group.status === "COMPLETED").length;
  const scheduleActiveStage = scheduleStageRows.find((group) => ["IN_PROGRESS", "REVIEW"].includes(group.status))
    || scheduleStageRows.find((group) => group.progress < 100)
    || scheduleStageRows[scheduleStageRows.length - 1]
    || null;
  const scheduleStateTone = scheduleDelayedNodeCount > 0 ? "danger" : scheduleProgress >= 100 ? "success" : "active";
  const scheduleStateLabel = scheduleDelayedNodeCount > 0 ? `${scheduleDelayedNodeCount} 个节点超期` : scheduleProgress >= 100 ? "计划已完成" : "计划推进中";
  const selectedPhaseGroup = phaseNodeSheet ? phaseGroups.find((group) => group.id === phaseNodeSheet.groupId) || null : null;
  const selectedPhaseNode = selectedPhaseGroup && phaseNodeSheet ? selectedPhaseGroup.tasks.find((task) => String(task.id) === phaseNodeSheet.nodeId) || null : null;
  const selectedNodeLogs = selectedPhaseGroup && selectedPhaseNode
    ? scoped.logs.filter((log) => {
      const logNodeId = String(log.node_id || "");
      const logNodeName = String(log.node_name || "").trim();
      const nodeName = String(selectedPhaseNode.name || "").trim();
      const logStageId = String(log.stage_id || log.phase || "");
      return (logNodeId && logNodeId === String(selectedPhaseNode.id))
        || (logNodeName && nodeName && logNodeName === nodeName)
        || (logStageId && logStageId === selectedPhaseGroup.id && String(log.completed_work || log.content || "").includes(nodeName));
    }) : [];
  const selectedNodePhotos = selectedNodeLogs.flatMap((log) => Array.isArray(log.photos) ? log.photos : []);
  const addNodeGroup = phaseGroups.find((group) => group.id === addNodeGroupId) || null;
  const chooseModule = (key: SiteTabKey) => {
    setSiteDetailDirection("forward");
    setActiveTab(key);
    window.history.replaceState(null, "", `/m/site/${encodeURIComponent(siteId)}?tab=${key}`);
  };
  const backToModules = () => {
    setSiteDetailDirection("back");
    setActiveTab(null);
    window.history.replaceState(null, "", `/m/site/${encodeURIComponent(siteId)}`);
  };
  const resetQuantityDraft = () => {
    setQuantitySearch("");
    setQuantityActualByItemId({});
    setQuantityEvidenceByItemId({});
    setQuantityFeeActualByItemId({});
    setQuantityManualLines([]);
    setQuantityCustomSpaces([]);
    setQuantityCustomCategories([]);
    setQuantitySpaceCreatorOpen(false);
    setQuantityNewSpaceName("");
    setQuantityNewCategoryName("");
    setQuantityExpandedSpaces(new Set());
  };
  const setQuantityEvidence = (itemId: string, value: string) => {
    setQuantityEvidenceByItemId((current) => ({ ...current, [itemId]: value }));
  };
  const openQuantityManualLine = (space = "未分空间") => {
    const normalizedSpace = getQuantitySpaceName(space);
    setQuantityManualSpace(normalizedSpace);
    setQuantityManualMode("library");
    setQuantityManualSearch("");
    setQuantitySelectedQuotaIds([]);
    setQuantityManualDraft({ ...makeMobileManualLine(quantityDefaultPhase, normalizedSpace), category: quantityCategoryOptions[0] || "基装" });
    setQuantityExpandedSpaces((current) => new Set(current).add(normalizedSpace));
  };
  const closeQuantityManualLine = () => {
    setQuantityManualSpace("");
    setQuantityManualSearch("");
    setQuantitySelectedQuotaIds([]);
    setQuantityManualMode("library");
  };
  const toggleQuantityQuota = (quotaId: string) => {
    setQuantitySelectedQuotaIds((current) => current.includes(quotaId)
      ? current.filter((id) => id !== quotaId)
      : [...current, quotaId]);
  };
  const patchQuantityManualDraft = (patch: Partial<QuantityReviewLine>) => {
    setQuantityManualDraft((current) => ({ ...current, ...patch }));
  };
  const confirmQuantityManualLine = () => {
    if (!quantityManualSpace) return;
    if (quantityManualMode === "library") {
      const selectedLines = quantitySelectedQuotaIds
        .map((quotaId) => quantityQuotaOptions.find((item) => `${item.source}:${item.id}` === quotaId))
        .filter((quota): quota is QuantityQuotaOption => Boolean(quota))
        .map((quota) => ({
          ...applyMobileQuotaToManualLine(makeMobileManualLine(quantityDefaultPhase, quantityManualSpace), quota),
          space: quantityManualSpace,
          phase: quantityDefaultPhase,
          actual_quantity: "1",
        }));
      if (!selectedLines.length) {
        setQuantityMessage("请先选择要添加的定额项目");
        return;
      }
      setQuantityManualLines((current) => [...current, ...selectedLines]);
      setQuantityMessage("");
      closeQuantityManualLine();
      return;
    }
    const nextLine = {
      ...quantityManualDraft,
      space: quantityManualSpace,
      phase: quantityManualDraft.phase || quantityDefaultPhase,
      unit_price: String(roundMoney((Number(quantityManualDraft.labor_unit_price || 0) || 0) + (Number(quantityManualDraft.material_unit_price || 0) || 0))),
    };
    if (!String(nextLine.title || "").trim() || !String(nextLine.actual_quantity || "").trim()) {
      setQuantityMessage("请填写新增项目名称和实际量");
      return;
    }
    setQuantityManualLines((current) => [...current, nextLine]);
    setQuantityMessage("");
    closeQuantityManualLine();
  };
  const createQuantityCustomSpace = () => {
    const space = getQuantitySpaceName(quantityNewSpaceName);
    if (!space || space === "未分空间") {
      setQuantityMessage("请填写空间名称");
      return;
    }
    if (quantityAllSpaceNames.has(space)) {
      setQuantityExpandedSpaces((current) => new Set(current).add(space));
      setQuantityMessage("这个空间已经存在，可以直接在里面新增项目。");
      return;
    }
    setQuantityCustomSpaces((current) => [...current, space]);
    setQuantityExpandedSpaces((current) => new Set(current).add(space));
    setQuantityNewSpaceName("");
    setQuantitySpaceCreatorOpen(false);
    setQuantityMessage("");
  };
  const createQuantityCustomCategory = () => {
    const category = String(quantityNewCategoryName || "").trim();
    if (!category) {
      setQuantityMessage("请填写大类名称");
      return;
    }
    if (!quantityCustomCategories.includes(category)) {
      setQuantityCustomCategories((current) => [...current, category]);
    }
    setQuantityNewCategoryName("");
    setQuantitySpaceCreatorOpen(false);
    setQuantityMessage("");
  };
  const patchQuantityManualLine = (index: number, patch: Partial<QuantityReviewLine>) => {
    setQuantityManualLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };
  const removeQuantityManualLine = (index: number) => {
    setQuantityManualLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  };
  const submitQuantityReview = async () => {
    if (!project) return;
    if (!quantityDraftLines.length) {
      setQuantityMessage("请至少填写一条预算项实际量，或新增一条现场项目。");
      return;
    }
    setQuantityBusy("submit");
    setQuantityMessage("");
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          action: "add_quantity_review",
          project_id: project.id,
          title: "",
          phase: quantityDefaultPhase,
          evidence_note: "",
          items: quantityDraftLines,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setQuantityMessage(result.message || "提交工程量复核失败");
        return;
      }
      setQuantityMessage(`已提交复核单：${result.review_no || "工程量复核单"}`);
      resetQuantityDraft();
      await reloadSiteData();
      setQuantitySheetMode(null);
    } catch (submitError) {
      setQuantityMessage(submitError instanceof Error ? submitError.message : "提交工程量复核失败");
    } finally {
      setQuantityBusy("");
    }
  };
  const runQuantityReviewAction = async (review: Record<string, any>, action: string, successText: string) => {
    if (!project || !review?.id) return;
    setQuantityBusy(`${action}:${review.id}`);
    setQuantityMessage("");
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action, project_id: project.id, id: review.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setQuantityMessage(result.message || "处理工程量复核失败");
        return;
      }
      setQuantityMessage(successText);
      if (action === "cancel_quantity_review") {
        setQuantityCancelReview(null);
        setQuantitySheetMode(null);
      }
      await reloadSiteData();
    } catch (actionError) {
      setQuantityMessage(actionError instanceof Error ? actionError.message : "处理工程量复核失败");
    } finally {
      setQuantityBusy("");
    }
  };
  const deleteCostRecord = async (record: Record<string, any>) => {
    if (!project || !record?.id || record.source_type !== "MANUAL") return;
    setCostBusy(`delete:${record.id}`);
    setCostMessage("");
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "delete_cost_record", project_id: project.id, id: record.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCostMessage(result.message || "删除成本记录失败");
        return;
      }
      setCostDeleteRecord(null);
      setCostSheetMode(null);
      setSelectedCostRowId("");
      setCostMessage("成本记录已删除");
      await reloadSiteData();
    } catch (deleteError) {
      setCostMessage(deleteError instanceof Error ? deleteError.message : "删除成本记录失败");
    } finally {
      setCostBusy("");
    }
  };
  const submitSiteStartAction = async (action: "request_site_start" | "confirm_site_start") => {
    if (!project || siteActionBusy) return;
    const mode = action === "request_site_start" ? "request" : "confirm";
    setSiteActionBusy(mode);
    setSiteActionMessage("");
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action, project_id: project.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSiteActionMessage(result.message || (mode === "request" ? "申请开工失败" : "开工确认失败"));
        return;
      }
      setSiteActionMessage(mode === "request" ? "已申请开工，等待开工确认" : "开工确认成功，工地已进入施工中");
      if (mode === "confirm") setConfirmStartOpen(false);
      await reloadSiteData();
    } catch (actionError) {
      setSiteActionMessage(actionError instanceof Error ? actionError.message : "操作失败，请稍后重试");
    } finally {
      setSiteActionBusy("");
    }
  };
  const togglePhase = (groupId: string) => {
    setExpandedPhaseIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  const updateMaterialCart = (materialId: string, delta: number) => {
    setMaterialOrderMessage("");
    const material = materialCatalog.find((item) => String(item.id) === materialId);
    if (delta > 0 && materialOutOfStock(material)) {
      setMaterialOrderMessage("这个材料暂时缺货，不能下单");
      return;
    }
    setMaterialCart((current) => {
      const existing = current[materialId]?.quantity || 0;
      const nextQuantity = Math.max(0, Math.round((existing + delta) * 100) / 100);
      const next = { ...current };
      if (nextQuantity <= 0) delete next[materialId];
      else next[materialId] = { materialId, quantity: nextQuantity };
      return next;
    });
  };
  const setMaterialCartQuantity = (materialId: string, value: string) => {
    const material = materialCatalog.find((item) => String(item.id) === materialId);
    if (materialOutOfStock(material)) {
      setMaterialOrderMessage("这个材料暂时缺货，不能下单");
      return;
    }
    if (value.trim() === "") {
      setMaterialCart((current) => ({ ...current, [materialId]: { materialId, quantity: 0 } }));
      return;
    }
    const quantity = Math.max(0, Number(value || 0) || 0);
    setMaterialCart((current) => {
      const next = { ...current };
      next[materialId] = { materialId, quantity };
      return next;
    });
  };
  const finalizeMaterialCartQuantity = (materialId: string) => {
    setMaterialCart((current) => {
      const quantity = Number(current[materialId]?.quantity || 0);
      if (quantity > 0) return current;
      const next = { ...current };
      delete next[materialId];
      return next;
    });
  };
  const removeMaterialFromCart = (materialId: string) => {
    setMaterialCart((current) => {
      const next = { ...current };
      delete next[materialId];
      return next;
    });
  };
  const applyMaterialOrderTemplate = (template: Record<string, any>) => {
    const templateItems = Array.isArray(template.items) ? template.items : [];
    if (!templateItems.length) {
      setMaterialOrderMessage("当前模板没有可下单材料");
      return;
    }
    const materialById = new Map(materialCatalog.map((material) => [String(material.id), material]));
    let addedCount = 0;
    let skippedCount = 0;
    setMaterialCart((current) => {
      const next = { ...current };
      templateItems.forEach((item: any) => {
        const materialId = String(item.materialId || item.material_id || "");
        const material = materialById.get(materialId);
        const rawQuantity = Number(item.defaultQuantity || item.default_quantity || 0) || 0;
        const quantity = rawQuantity > 0 ? rawQuantity : 1;
        if (!material || materialOutOfStock(material)) {
          skippedCount += 1;
          return;
        }
        if (Number(next[materialId]?.quantity || 0) > 0) {
          skippedCount += 1;
          return;
        }
        next[materialId] = { materialId, quantity };
        addedCount += 1;
      });
      return next;
    });
    if (addedCount > 0) {
      setMaterialOrderMessage(`已加入「${template.name || "下单模板"}」${addedCount} 项${skippedCount ? `，${skippedCount} 项已存在或不可用` : ""}`);
    }
  };
	  const openMaterialOrder = (order: Record<string, any>) => {
	    setSelectedMaterialOrderId(String(order.id || ""));
	    setMaterialSheetMode("order");
	  };
	  const repeatMaterialOrder = (order: Record<string, any>) => {
	    const orderItems = scoped.materialItems.filter((item) => String(item.order_id) === String(order.id));
	    if (!orderItems.length) {
	      setMaterialOrderMessage("这个订单没有可复用的材料");
	      return;
	    }
	    const materialById = new Map(materialCatalog.map((material) => [String(material.id), material]));
	    let addedCount = 0;
	    let skippedCount = 0;
	    setMaterialCart((current) => {
	      const next = { ...current };
	      orderItems.forEach((item) => {
	        const materialId = String(item.material_id || item.materialId || "");
	        const material = materialById.get(materialId);
	        const quantity = Math.max(0, Number(item.quantity || 0) || 0);
	        if (!material || materialOutOfStock(material) || quantity <= 0) {
	          skippedCount += 1;
	          return;
	        }
	        next[materialId] = {
	          materialId,
	          quantity: Math.round((Number(next[materialId]?.quantity || 0) + quantity) * 100) / 100,
	        };
	        addedCount += 1;
	      });
	      return next;
	    });
	    setMaterialView("shop");
	    setMaterialSheetMode(null);
	    setMaterialOrderMessage(addedCount ? `已加入购物车 ${addedCount} 项${skippedCount ? `，${skippedCount} 项缺货或不可用` : ""}` : "这个订单里的材料暂时都不能下单");
	  };
	  const submitMaterialOrder = async () => {
    if (!project || materialOrderBusy) return;
    if (!cartLines.length) {
      setMaterialOrderMessage("请先选择材料并填写数量");
      return;
    }
    if (!materialOrderForm.phone.trim() || !materialOrderForm.address.trim()) {
      setMaterialOrderMessage("请确认收货电话和收货地址");
      return;
    }
	    const orderNotes = materialOrderForm.notes.trim();
	    const groups = cartSupplierGroups.length ? cartSupplierGroups : [{
	      key: "all",
	      supplierId: String(cartLines[0]?.material?.supplier_id || "").trim(),
	      supplierName: cartLines[0]?.material?.supplier_name || "供应方未设置",
	      lines: cartLines,
	      amount: cartAmount,
	    }];
	    setMaterialOrderBusy("submit");
	    setMaterialOrderMessage("");
	    try {
	      const createdOrders = [];
	      for (const group of groups) {
	        const orderType = materialOrderTypeOf(group.lines.map((line) => line.material));
	        const response = await fetch("/api/site", {
	          method: "POST",
	          headers: { "Content-Type": "application/json", ...authHeaders() },
	          body: JSON.stringify({
	            action: "add_material_order",
	            project_id: project.id,
	            supplier_id: group.supplierId,
	            order_type: orderType,
	            status: orderType === "AUXILIARY_WAREHOUSE" ? "PENDING" : "ORDERED",
	            order_date: getTodayDateOnly(),
	            notes: orderNotes,
	            items: group.lines.map((line) => ({
	              material_id: line.materialId,
	              quantity: line.quantity,
	              unit_price: Number(line.material.unit_price || 0),
	              received_qty: 0,
	              remark: materialOrderForm.notes,
	            })),
	          }),
	        });
	        const result = await response.json().catch(() => ({}));
	        if (!response.ok) {
	          setMaterialOrderMessage(result.message || `${group.supplierName} 下单失败，请稍后重试`);
	          return;
	        }
	        createdOrders.push(result);
	      }
	      setMaterialCart({});
	      setMaterialOrderMessage(createdOrders.length > 1 ? `已按供应方拆成 ${createdOrders.length} 单` : `已下单：${createdOrders[0]?.order_no || "材料订单"}`);
	      setSelectedMaterialOrderId(createdOrders[0]?.id || "");
	      setMaterialSheetMode(null);
	      setMaterialView("orders");
      await reloadSiteData();
    } catch (submitError) {
      setMaterialOrderMessage(submitError instanceof Error ? submitError.message : "下单失败，请稍后重试");
    } finally {
      setMaterialOrderBusy("");
    }
  };
  const isPendingMaterialOrder = (order: Record<string, any>) => ["", "DRAFT", "PENDING", "ORDERED"].includes(String(order.status || "").toUpperCase());
  const materialOrderCancelActionText = (order: Record<string, any>) => isPendingMaterialOrder(order) ? "取消订单" : "退回订单";
  const requestCancelMaterialOrder = (order: Record<string, any>) => {
    if (materialOrderBusy) return;
    setMaterialOrderMessage("");
    setMaterialCancelOrder(order);
  };
  const returnMaterialOrder = async (order: Record<string, any>) => {
    if (!project || materialOrderBusy) return;
    setMaterialOrderBusy(`return:${order.id}`);
    setMaterialOrderMessage("");
    const actionText = materialOrderCancelActionText(order);
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          action: "update_material_order",
          project_id: project.id,
          id: order.id,
          status: "CANCELLED",
          notes: [order.notes, `移动端${actionText}`].filter(Boolean).join("\n"),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMaterialOrderMessage(result.message || `${actionText}失败`);
        return;
      }
      setMaterialOrderMessage(`订单已${isPendingMaterialOrder(order) ? "取消" : "退回"}`);
      setMaterialCancelOrder(null);
      setMaterialSheetMode(null);
      await reloadSiteData();
    } catch (returnError) {
      setMaterialOrderMessage(returnError instanceof Error ? returnError.message : `${actionText}失败`);
    } finally {
      setMaterialOrderBusy("");
    }
  };
  const updateMobilePhaseNodeStatus = async (group: PhaseGroup, task: Record<string, any>, status: "PENDING" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "SKIPPED") => {
    if (!project || phaseActionBusy) return;
    const busyKey = `${task.id}:${status}`;
    setPhaseActionBusy(busyKey);
    setPhaseActionMessage("");
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          action: "update_construction_task_status",
          project_id: project.id,
          stage_id: group.id,
          stage_name: group.name,
          stage_sort_order: group.sort,
          stage_node_count: group.tasks.length,
          node_id: task.id,
          node_name: task.name,
          node_type: nodeTypeOf(task),
          status,
          planned_start: task.planned_start,
          planned_end: task.planned_end,
          description: task.description,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPhaseActionMessage(result.message || "节点状态更新失败");
        return;
      }
      await reloadSiteData();
      setPhaseActionMessage("节点状态已更新");
    } catch (actionError) {
      setPhaseActionMessage(actionError instanceof Error ? actionError.message : "节点状态更新失败");
    } finally {
      setPhaseActionBusy("");
    }
  };
  const openNodeSheet = (mode: PhaseNodeSheetMode, group: PhaseGroup, task: Record<string, any>) => {
    setPhaseNodeSheet({ mode, groupId: group.id, nodeId: String(task.id) });
    setPhaseActionMessage("");
    setPhaseLogForm({ completed_work: "", next_plan: "" });
    setPhaseIssueTitle("");
  };
  const submitPhaseLog = async () => {
    if (!project || !selectedPhaseGroup || !selectedPhaseNode || phaseActionBusy) return;
    const completed = phaseLogForm.completed_work.trim();
    const nextPlan = phaseLogForm.next_plan.trim();
    if (!completed && !nextPlan) {
      setPhaseActionMessage("请填写今日完成或明日计划");
      return;
    }
    setPhaseActionBusy("log");
    setPhaseActionMessage("");
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          action: "add_log",
          project_id: project.id,
          content: "",
          completed_work: completed ? `【${selectedPhaseNode.name || "施工节点"}】${completed}` : "",
          next_plan: nextPlan,
          phase: selectedPhaseGroup.id,
          stage_id: selectedPhaseGroup.id,
          stage_name: selectedPhaseGroup.name,
          node_id: selectedPhaseNode.id,
          node_name: selectedPhaseNode.name,
          node_type: nodeTypeOf(selectedPhaseNode),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPhaseActionMessage(result.message || "施工日志发布失败");
        return;
      }
      setPhaseActionMessage("施工日志已发布");
      setPhaseNodeSheet(null);
      await reloadSiteData();
    } finally {
      setPhaseActionBusy("");
    }
  };
  const submitPhaseIssue = async () => {
    if (!project || !selectedPhaseGroup || !selectedPhaseNode || phaseActionBusy) return;
    const title = phaseIssueTitle.trim();
    if (!title) {
      setPhaseActionMessage("请填写整改问题");
      return;
    }
    setPhaseActionBusy("issue");
    setPhaseActionMessage("");
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          action: "add_issue",
          project_id: project.id,
          title,
          category: selectedPhaseGroup.name,
          stage_id: selectedPhaseGroup.id,
          stage_name: selectedPhaseGroup.name,
          node_id: selectedPhaseNode.id,
          node_name: selectedPhaseNode.name,
          node_type: nodeTypeOf(selectedPhaseNode),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPhaseActionMessage(result.message || "问题登记失败");
        return;
      }
      setPhaseActionMessage("问题已登记");
      setPhaseNodeSheet(null);
      await reloadSiteData();
    } finally {
      setPhaseActionBusy("");
    }
  };
  const uploadPhaseNodePhoto = async (file?: File) => {
    if (!project || !selectedPhaseGroup || !selectedPhaseNode || !file || phaseActionBusy) return;
    setPhaseActionBusy("photo");
    setPhaseActionMessage("");
    try {
      const formData = new FormData();
      formData.append("project_id", project.id);
      formData.append("category", `施工节点-${selectedPhaseGroup.id}-${selectedPhaseNode.id}`);
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", headers: authHeaders(), body: formData });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPhaseActionMessage(result.message || "节点图片上传失败");
        return;
      }
      setPhaseActionMessage("节点图片已上传");
      await reloadSiteData();
    } finally {
      setPhaseActionBusy("");
    }
  };
  const submitAddPhaseNode = async () => {
    if (!project || !addNodeGroup || phaseActionBusy) return;
    const name = addNodeForm.name.trim();
    if (!name) {
      setPhaseActionMessage("请填写节点名称");
      return;
    }
    setPhaseActionBusy("add-node");
    setPhaseActionMessage("");
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          action: "add_construction_task_node",
          project_id: project.id,
          stage_id: addNodeGroup.id,
          stage_name: addNodeGroup.name,
          stage_sort_order: addNodeGroup.sort,
          node_name: name,
          node_type: addNodeForm.nodeType,
          description: addNodeForm.description,
          planned_start: addNodeForm.plannedStart,
          planned_end: addNodeForm.plannedEnd,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPhaseActionMessage(result.message || "新增节点失败");
        return;
      }
      setAddNodeGroupId("");
      setAddNodeForm({ nodeType: "construction", name: "", description: "", plannedStart: "", plannedEnd: "" });
      setExpandedPhaseIds((current) => new Set(current).add(addNodeGroup.id));
      await reloadSiteData();
    } finally {
      setPhaseActionBusy("");
    }
  };
  const deleteMobilePhaseNode = async (group: PhaseGroup, task: Record<string, any>) => {
    if (!project || phaseActionBusy || !isCustomTask(task)) return;
    setPhaseActionBusy(`delete:${task.id}`);
    setPhaseActionMessage("");
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          action: "delete_construction_task_node",
          project_id: project.id,
          task_id: task.id,
          stage_id: group.id,
          stage_name: group.name,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPhaseActionMessage(result.message || "删除节点失败");
        return;
      }
      await reloadSiteData();
      setPhaseActionMessage("节点已删除");
    } finally {
      setPhaseActionBusy("");
    }
  };

  if (loading) return <SiteDetailSkeleton />;
  if (error) return <div className={styles.errorState}><AlertTriangle className="mx-auto mb-2 h-5 w-5" />{error}</div>;
  if (!project) return <div className={styles.emptyState}><HardHat className="mx-auto mb-2 h-5 w-5" />工地不存在或无权查看</div>;

  return (
    <div className={styles.page} data-site-home={!activeTab || undefined} data-site-detail={activeTab || undefined} data-mobile-shell={mobileShell}>
      <header className={`${styles.detailHeader} ${styles.mobileSiteDetailHeader}`}>
        <div className={styles.detailNav}>
          {activeTab ? (
            <button type="button" className={styles.headerIconButton} aria-label="返回功能" onClick={backToModules}><ArrowLeft /></button>
          ) : (
            <button type="button" className={styles.headerIconButton} aria-label="返回工地列表" onClick={mobileBack}><ArrowLeft /></button>
          )}
          {activeTab === "quantity" ? <div className={styles.mobileSiteNavTitle}><Calculator />工程量复核</div> : null}
          <div className={styles.detailNavActions} />
        </div>
        {!activeTab && <div className={styles.profileHero}>
          <div className={styles.heroAvatarSpacer} aria-hidden="true" />
          <div className={styles.heroIdentity}>
            <div className={styles.heroNameLine}><h1 className={styles.heroName}>{siteName(project)}</h1><span className={styles.heroStage}>{stageName(project)}</span></div>
          </div>
        </div>}
        {!activeTab && <div className={styles.headerFocus}>
          <span className={styles.headerFocusIcon}><HardHat /></span>
          <span className={styles.headerFocusCopy}>
            <small>工地概况</small>
            <b>{ownerName(project)} · {project.customer_phone || "电话未设置"}</b>
            <em>{managerName || "项目经理未设置"} · {durationDays > 0 ? `合同工期 ${durationDays}天` : "合同工期未设置"}</em>
          </span>
          <button type="button" onClick={() => chooseModule("overview")} aria-label="查看工地信息"><ChevronRight /></button>
        </div>}
      </header>

      {!activeTab && (canRequestStart || canConfirmStart || siteActionMessage) && <section className={`${styles.mobileSiteStartAction} ${styles.mobileSiteStartHomeAction}`} aria-label="开工操作">
        <div>
          <span>{canConfirmStart ? "开工确认" : canRequestStart ? "申请开工" : "开工状态"}</span>
          <b>{canConfirmStart ? "确认后工地进入施工中" : canRequestStart ? "自动生成开工交底并进入确认" : stageName(project)}</b>
          <small>{siteActionMessage || (canConfirmStart ? "请核对计划、工期和施工模板无误后确认。" : "使用合同工期和施工模板快速发起开工。")}</small>
        </div>
        {canConfirmStart ? (
          <button type="button" data-tone="confirm" disabled={Boolean(siteActionBusy)} onClick={() => setConfirmStartOpen(true)}>
            {siteActionBusy === "confirm" ? <Loader2 className="animate-spin" /> : <CheckCircle />}
            确认开工
          </button>
        ) : canRequestStart ? (
          <button type="button" disabled={Boolean(siteActionBusy)} onClick={() => submitSiteStartAction("request_site_start")}>
            {siteActionBusy === "request" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            申请开工
          </button>
        ) : null}
      </section>}

      {!activeTab && <section className={styles.mobileSiteFunctionGrid} aria-label="工地功能">
        <div className={styles.mobileSiteFunctionGridHead}>
          <b>工地功能</b>
          <span>点击进入详情</span>
        </div>
        <div>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} type="button" data-active={activeTab === tab.key || undefined} onClick={() => chooseModule(tab.key)}>
                <Icon />
                <b>{tab.label}</b>
                <small>{moduleStats[tab.key]}</small>
              </button>
            );
          })}
        </div>
      </section>}

      {activeTab && <main id="mobile-site-active-detail" className={styles.mobileSiteDetailContent} data-motion={siteDetailDirection}>
        {activeTab === "overview" && <>
          <Section title="工地信息" icon={Home} action={siteStageLabels[String(project.site_stage || "")] || project.status}>
            {(canRequestStart || canConfirmStart || siteActionMessage) && <div className={styles.mobileSiteStartAction}>
              <div>
                <span>{canConfirmStart ? "开工确认" : canRequestStart ? "申请开工" : "开工状态"}</span>
                <b>{canConfirmStart ? "确认后工地进入施工中" : canRequestStart ? "自动生成开工交底并进入确认" : stageName(project)}</b>
                <small>{siteActionMessage || (canConfirmStart ? "请核对计划、工期和施工模板无误后确认。" : "使用合同工期和施工模板快速发起开工。")}</small>
              </div>
              {canConfirmStart ? (
                <button type="button" data-tone="confirm" disabled={Boolean(siteActionBusy)} onClick={() => setConfirmStartOpen(true)}>
                  {siteActionBusy === "confirm" ? <Loader2 className="animate-spin" /> : <CheckCircle />}
                  确认开工
                </button>
              ) : canRequestStart ? (
                <button type="button" disabled={Boolean(siteActionBusy)} onClick={() => submitSiteStartAction("request_site_start")}>
                  {siteActionBusy === "request" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                  申请开工
                </button>
              ) : null}
            </div>}
            <div className={styles.infoGrid}>
              <Info label="业主" value={ownerName(project)} />
              <Info label="联系电话" value={project.customer_phone} />
              <Info label="工地地址" value={siteAddress(project)} wide />
              <Info label="服务门店" value={project.service_store} />
              <Info label="施工阶段" value={stageName(project)} />
              <Info label="项目经理" value={project.manager_name} />
              <Info label="经理电话" value={project.manager_phone} />
              <Info label="设计师" value={scoped.team.find((m) => String(m.role).toUpperCase() === "DESIGNER")?.user_name || project.designer_name} />
              <Info label="户型" value={project.house_type} />
              <Info label="装修面积" value={project.area || project.customer_area_size ? `${project.area || project.customer_area_size}㎡` : "-"} />
              <Info label="装修类型" value={project.decoration_type} />
              <Info label="开工时间" value={dateText(project.start_date)} />
              <Info label="计划竣工" value={dateText(project.planned_end_date)} />
              <Info label="合同工期" value={durationDays > 0 ? `${durationDays} 天` : "-"} />
              <Info label="合同金额" value={contractAmount > 0 ? `¥${money(contractAmount)}` : "-"} />
              <Info label="财务编号" value={project.finance_no} />
              <Info label="监控状态" value={scoped.cameras.length > 0 ? `${scoped.cameras.length} 个` : "无监控"} />
            </div>
          </Section>
          <Section title="服务团队" icon={UsersRound} action={`${scoped.team.length} 人`}>
            {scoped.team.length ? <div className={styles.mobileSitePeopleList}>{scoped.team.map((member) => <div key={member.id || member.user_id}><span>{member.user_avatar ? <Image src={member.user_avatar} alt="" width={34} height={34} unoptimized /> : String(member.user_name || "人").slice(0, 1)}</span><b>{member.user_name || "未设置"}</b><small>{formatUserRoleLabel(member.role, member.role_name)}</small></div>)}</div> : <Empty text="暂无服务团队" />}
          </Section>
        </>}

        {activeTab === "payments" && <Section title="客户收款" icon={DollarSign} action={`收款率 ${paymentProgress}%`}>
          <div className={styles.mobilePaymentDashboard}>
            <div className={styles.mobilePaymentHero}>
              <div>
                <span>{overReceivedAmount > 0 ? "已超收" : remainingAmount > 0 ? "剩余待收" : "已收齐"}</span>
                <b>{contractAmount > 0 ? `¥${compactMoney(overReceivedAmount > 0 ? overReceivedAmount : remainingAmount)}` : "合同金额未设置"}</b>
                <small>已收 ¥{compactMoney(receivedAmount)} / 应收 ¥{compactMoney(contractAmount)}</small>
              </div>
              <strong data-tone={remainingAmount > 0 ? "danger" : "success"}>{remainingAmount > 0 ? "未收齐" : "收款完成"}</strong>
            </div>
            <div className={styles.mobilePaymentProgress} aria-label={`收款进度 ${paymentProgress}%`}>
              <span style={{ width: `${paymentProgress}%` }} />
            </div>
            <div className={styles.mobilePaymentFacts}>
              <Metric label="合同应收" value={`¥${compactMoney(contractAmount)}`} />
              <Metric label="已收金额" value={`¥${compactMoney(receivedAmount)}`} tone="success" />
              <Metric label={overReceivedAmount > 0 ? "超收金额" : "待收金额"} value={`¥${compactMoney(overReceivedAmount > 0 ? overReceivedAmount : remainingAmount)}`} tone={overReceivedAmount > 0 ? "success" : "danger"} />
            </div>
          </div>
          <div className={styles.mobilePaymentStageList}>
            <div className={styles.mobilePaymentRecordHead}>
              <b>应收款项</b>
              <span>{depositDueRows.length + paymentStageRows.length ? `${depositDueRows.length + paymentStageRows.length} 项` : "暂无计划"}</span>
            </div>
            {depositDueRows.length ? <div className={styles.mobilePaymentSubHead}><b>定金 / 设计费</b><span>{depositDueRows.length} 项</span></div> : null}
            {depositDueRows.map((stage) => {
              const stageProgress = stage.expected > 0 ? Math.min(100, Math.round((stage.received / stage.expected) * 100)) : 0;
              return (
                <article className={styles.mobilePaymentStageCard} key={`deposit-${stage.id}`} data-kind={stage.kind} data-tone={stage.status.tone}>
                  <div className={styles.mobilePaymentStageTop}>
                    <span>{stage.index}</span>
                    <div>
                      <b>{stage.title}</b>
                      <small>{stage.subtitle} · {stage.dueDate ? `应收日期 ${dateText(stage.dueDate)}` : "未设置应收日期"}</small>
                    </div>
                    <em>{stage.status.label}</em>
                  </div>
                  <div className={styles.mobilePaymentStageAmounts}>
                    <span><small>应收</small><b>¥{compactMoney(stage.expected)}</b></span>
                    <span><small>已收</small><b>¥{compactMoney(stage.received)}</b></span>
                    <span><small>待收</small><b>¥{compactMoney(stage.unpaid)}</b></span>
                  </div>
                  <div className={styles.mobilePaymentStageProgress}><i style={{ width: `${stageProgress}%` }} /></div>
                </article>
              );
            })}
            {paymentStageRows.length ? <div className={styles.mobilePaymentSubHead}><b>工程款分期</b><span>{paymentStageRows.length} 期</span></div> : null}
            {paymentStageRows.map((stage) => {
              const stageProgress = stage.expected > 0 ? Math.min(100, Math.round((stage.received / stage.expected) * 100)) : 0;
              return (
                <article className={styles.mobilePaymentStageCard} key={`project-${stage.id}`} data-kind={stage.kind} data-tone={stage.status.tone}>
                  <div className={styles.mobilePaymentStageTop}>
                    <span>{stage.index}</span>
                    <div>
                      <b>{stage.title}</b>
                      <small>{stage.subtitle} · {stage.dueDate ? `应收日期 ${dateText(stage.dueDate)}` : "未设置应收日期"}</small>
                    </div>
                    <em>{stage.status.label}</em>
                  </div>
                  <div className={styles.mobilePaymentStageAmounts}>
                    <span><small>应收</small><b>¥{compactMoney(stage.expected)}</b></span>
                    <span><small>已收</small><b>¥{compactMoney(stage.received)}</b></span>
                    <span><small>待收</small><b>¥{compactMoney(stage.unpaid)}</b></span>
                  </div>
                  <div className={styles.mobilePaymentStageProgress}><i style={{ width: `${stageProgress}%` }} /></div>
                </article>
              );
            })}
            {!depositDueRows.length && !paymentStageRows.length ? <Empty text="暂无应收款项" /> : null}
          </div>
          {paymentItems.length ? (
            <div className={styles.mobilePaymentRecordList}>
              <div className={styles.mobilePaymentRecordHead}>
                <b>交款流水记录</b>
                <span>{paymentItems.length} 笔</span>
              </div>
              {paymentItems.map((record, index) => (
                <article className={styles.mobilePaymentRecord} key={record.id || index}>
                  <PaymentRecordIcon record={record} />
                  <div>
                    <b>{normalizePaymentTitle(record)}</b>
                    <small>{record.payment_stage_label || "客户交款"} · {paymentMeta(record)}</small>
                    {record.receipt_no || record.notes ? <p>{[record.receipt_no ? `票据 ${record.receipt_no}` : "", record.notes ? `备注 ${record.notes}` : ""].filter(Boolean).join(" · ")}</p> : null}
                  </div>
                  <strong>¥{money(paymentAmount(record))}</strong>
                </article>
              ))}
            </div>
          ) : <Empty text="暂无收款记录" />}
        </Section>}

        {activeTab === "schedule" && <Section title="施工计划" icon={CalendarDays} action={scheduleStateLabel}>
          <div className={styles.mobileScheduleDashboard}>
            <div className={styles.mobileScheduleHero} data-tone={scheduleStateTone}>
              <div className={styles.mobileScheduleHeroMain}>
                <span>计划状态</span>
                <b>{scheduleStateLabel}</b>
                <small>{scheduleActiveStage ? `当前阶段：${scheduleActiveStage.name}` : "暂无阶段计划"}</small>
              </div>
              <div className={styles.mobileScheduleHeroGauge} aria-label={`施工计划完成 ${scheduleProgress}%`}>
                <strong>{scheduleProgress}%</strong>
                <small>完成</small>
              </div>
            </div>
            <div className={styles.mobileScheduleProgress} aria-label={`施工计划完成 ${scheduleProgress}%`}>
              <span style={{ width: `${scheduleProgress}%` }} />
            </div>
            <div className={styles.mobileScheduleFacts}>
              <Metric label="阶段" value={`${scheduleCompletedStageCount}/${scheduleStageRows.length}`} tone="success" />
              <Metric label="节点" value={`${phaseDoneNodeCount}/${phaseTotalNodeCount}`} />
            </div>
            <div className={styles.mobileScheduleDateGrid}>
              <span><small>计划周期</small><b><DateRangeText start={schedulePlannedStart} end={schedulePlannedEnd} /></b><em>{scheduleTotalDays || "-"} 天</em></span>
            </div>
            <div className={styles.mobileScheduleRules}>
              <span>周末 {scheduleWeekendConstruction ? "施工" : "不施工"}</span>
              <span>节假日 {scheduleHolidayConstruction ? "施工" : "不施工"}</span>
              <span>地暖 {scheduleHasFloorHeating ? "有" : "无"}</span>
            </div>
          </div>

          <div className={styles.mobileScheduleStageList}>
            <div className={styles.mobilePaymentRecordHead}>
              <b>阶段轨道</b>
              <span>{phaseTotalNodeCount} 节点</span>
            </div>
            {scheduleStageRows.length ? scheduleStageRows.map((group) => {
              const expanded = expandedPhaseIds.has(group.id);
              return (
              <article className={styles.mobileScheduleStageCard} key={group.id} data-status={group.status} data-delay={group.delay.tone} data-expanded={expanded || undefined}>
                <button type="button" className={styles.mobileScheduleStageTop} onClick={() => togglePhase(group.id)} aria-expanded={expanded}>
                  <span>{String(group.index + 1).padStart(2, "0")}</span>
                  <div>
                    <b>{group.name}</b>
                    <small>{group.completedCount}/{group.tasks.length} 节点完成 · {group.progress}%</small>
                  </div>
                  <em data-tone={group.delay.tone}>{group.delay.label}</em>
                  <ChevronDown />
                </button>
                <div className={styles.mobileScheduleStageProgress}><i style={{ width: `${group.progress}%` }} /></div>
                <div className={styles.mobileScheduleStageDates}>
                  <span><small>计划</small><b><DateRangeText start={group.plannedStart} end={group.plannedEnd} /></b><em>{group.plannedDays ? `${group.plannedDays} 天` : "未排期"}</em></span>
                  <span><small>实际</small><b>{group.status === "COMPLETED" ? dateText(group.actualEnd) : group.actualStart ? "施工中" : "未开始"}</b><em>{group.actualStart ? `${group.actualDays || 1} 天` : ""}</em></span>
                </div>
                <div className={styles.mobileScheduleNodeCollapse} aria-hidden={!expanded}>
                <div className={styles.mobileScheduleNodeList}>
                  {group.tasks.length ? group.tasks.map((task, taskIndex) => {
                    const status = String(task.status || "PENDING").toUpperCase();
                    const type = nodeTypeOf(task);
                    const delay = scheduleDelayMeta(task.planned_end, task.actual_end, status);
                    return (
                      <article className={styles.mobileScheduleNodeCard} key={task.id || `${group.id}-${taskIndex}`} data-status={nodeStatusTone(task)} data-delay={delay.tone}>
                        <div className={styles.mobileScheduleNodeTop}>
                          <span>{String(taskIndex + 1).padStart(2, "0")}</span>
                          <div>
                            <b>{task.name || "施工节点"}</b>
                            <small>{type === "acceptance" ? "验收节点" : "施工节点"}</small>
                          </div>
                          <em data-status={delay.tone === "danger" ? "danger" : nodeStatusTone(task)}>
                            {delay.tone === "danger" ? delay.label : nodeStatusLabel(task)}
                          </em>
                        </div>
                      </article>
                    );
                  }) : <Empty text="当前阶段暂无计划节点" />}
                </div>
                </div>
              </article>
              );
            }) : <Empty text="暂无施工计划" />}
          </div>
        </Section>}

        {activeTab === "phase" && <Section title="施工阶段" icon={ClipboardList} action={`${phaseGroups.length} 个阶段`}>
          <div className={styles.mobilePhaseOverview}>
            <span><small>阶段</small><b>{phaseGroups.length}</b></span>
            <span><small>节点</small><b>{phaseTotalNodeCount}</b></span>
            <span><small>已完成</small><b>{phaseDoneNodeCount}</b></span>
            <span><small>进度</small><b>{phaseTotalNodeCount ? Math.round((phaseDoneNodeCount / phaseTotalNodeCount) * 100) : 0}%</b></span>
          </div>
          {phaseActionMessage ? <div className={styles.mobilePhaseMessage}>{phaseActionMessage}</div> : null}
          <div className={styles.mobilePhaseList}>
            {phaseGroups.map((group, groupIndex) => {
              const expanded = expandedPhaseIds.has(group.id);
              const doneCount = group.tasks.filter((task) => ["COMPLETED", "SKIPPED"].includes(String(task.status || "").toUpperCase())).length;
              const reviewCount = group.tasks.filter((task) => String(task.status || "").toUpperCase() === "REVIEW").length;
              const progress = group.tasks.length ? Math.round((doneCount / group.tasks.length) * 100) : 0;
              const groupStatus = doneCount >= group.tasks.length && group.tasks.length > 0 ? "COMPLETED" : reviewCount > 0 ? "REVIEW" : group.status;
              return (
                <article
                  className={styles.mobilePhaseCard}
                  key={group.id}
                  data-expanded={expanded || undefined}
                  data-tone={(groupIndex % 4) + 1}
                  style={{ "--phase-progress": `${progress}%` } as CSSProperties}
                >
                  <button type="button" className={styles.mobilePhaseCardHead} onClick={() => togglePhase(group.id)} aria-expanded={expanded}>
                    <span className={styles.mobilePhaseIndex}>{String(groupIndex + 1).padStart(2, "0")}</span>
                    <span className={styles.mobilePhaseTitle}>
                      <b>{group.name}</b>
                      <small>{doneCount}/{group.tasks.length} 完成 · {progress}%</small>
                    </span>
                    <em data-status={groupStatus}>{taskStatusLabels[groupStatus] || groupStatus}</em>
                    <ChevronDown />
                  </button>
                  <div className={styles.mobilePhaseCollapse} aria-hidden={!expanded}>
                    <div className={styles.mobilePhaseBody}>
                        <button type="button" className={styles.mobilePhaseAddNode} onClick={() => { setAddNodeGroupId(group.id); setPhaseActionMessage(""); }}>
                          <Plus />新增施工/验收节点
                        </button>
                        {group.tasks.length ? group.tasks.map((task, taskIndex) => {
                          const type = nodeTypeOf(task);
                          const status = String(task.status || "PENDING").toUpperCase();
                          const canStart = status === "PENDING";
                          const canCancel = status === "IN_PROGRESS";
                          const canAdvance = !["COMPLETED", "SKIPPED"].includes(status);
                          const canSkip = !["COMPLETED", "SKIPPED"].includes(status);
                          const standardCount = nodeStandardCount(task);
                          const nodeLogs = scoped.logs.filter((log) => {
                            const logNodeId = String(log.node_id || "");
                            const logNodeName = String(log.node_name || "").trim();
                            const nodeName = String(task.name || "").trim();
                            const logStageId = String(log.stage_id || log.phase || "");
                            return (logNodeId && logNodeId === String(task.id))
                              || (logNodeName && nodeName && logNodeName === nodeName)
                              || (logStageId && logStageId === group.id && String(log.completed_work || log.content || "").includes(nodeName));
                          });
                          const nodePhotoCount = nodeLogs.reduce((sum, log) => sum + (Array.isArray(log.photos) ? log.photos.length : 0), 0);
                          const hasPlannedDate = dateText(task.planned_start) !== "-" || dateText(task.planned_end) !== "-";
                          return (
                            <div className={styles.mobilePhaseNode} key={task.id || `${group.id}-${taskIndex}`} data-status={nodeStatusTone(task)}>
                              <div className={styles.mobilePhaseNodeTop}>
                                <span>{String(taskIndex + 1).padStart(2, "0")}</span>
                                <div>
                                  <b>{task.name || "施工节点"}</b>
                                  <small>
                                    <span><ClipboardList />{type === "acceptance" ? "验收节点" : "施工节点"}</span>
                                    {hasPlannedDate ? <span><CalendarDays />{dateText(task.planned_start)} - {dateText(task.planned_end)}</span> : null}
                                  </small>
                                </div>
                                <em data-status={nodeStatusTone(task)}>{nodeStatusLabel(task)}</em>
                              </div>
                              <div className={styles.mobilePhaseNodeActionRail}>
                                <button type="button" data-role="info" onClick={() => openNodeSheet("standard", group, task)}><ClipboardCheck />标准 {standardCount}</button>
                                <button type="button" data-role="info" onClick={() => openNodeSheet("records", group, task)}><FileText />记录 {nodeLogs.length} · 图 {nodePhotoCount}</button>
                                {canStart ? <button type="button" data-role="start" disabled={Boolean(phaseActionBusy)} onClick={() => updateMobilePhaseNodeStatus(group, task, "IN_PROGRESS")}>开始施工</button> : null}
                                {(canStart || canAdvance) ? <button type="button" data-role="secondary" onClick={() => openNodeSheet("log", group, task)}><FileText />写日志</button> : null}
                                {canAdvance ? (
                                  type === "acceptance"
                                    ? <button type="button" data-role="primary" onClick={() => openNodeSheet("acceptance", group, task)}>完成验收</button>
                                    : <button type="button" data-role="primary" disabled={Boolean(phaseActionBusy)} onClick={() => updateMobilePhaseNodeStatus(group, task, status === "IN_PROGRESS" ? "COMPLETED" : "REVIEW")}>{status === "IN_PROGRESS" ? "完成" : "提交验收"}</button>
                                ) : null}
                                {canCancel ? <button type="button" data-role="secondary" disabled={Boolean(phaseActionBusy)} onClick={() => updateMobilePhaseNodeStatus(group, task, "PENDING")}><ArrowLeft />取消施工</button> : null}
                                {canSkip ? <button type="button" data-role="muted" disabled={Boolean(phaseActionBusy)} onClick={() => updateMobilePhaseNodeStatus(group, task, "SKIPPED")}><X />此项不施工</button> : null}
                              </div>
                              {isCustomTask(task) ? (
                                <div className={styles.mobilePhaseNodeCustomActions}>
                                  <button type="button" data-danger disabled={Boolean(phaseActionBusy)} onClick={() => deleteMobilePhaseNode(group, task)}><Trash2 />删除新增节点</button>
                                </div>
                              ) : null}
                            </div>
                          );
                        }) : <Empty text="当前阶段暂无节点，可手动新增施工或验收节点" />}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {!phaseGroups.length ? <Empty text="暂无施工阶段" /> : null}
        </Section>}

        {activeTab === "records" && <Section title="施工记录" icon={Activity} action={`${scoped.logs.length} 条`}>
          {scoped.logs.map((log) => <Row key={log.id} title={log.title || log.today_work || "施工日志"} meta={`${dateText(log.log_date || log.created_at, true)} · ${log.author_name || "记录人未设置"}${log.tomorrow_plan ? ` · 明日：${log.tomorrow_plan}` : ""}`} value={Array.isArray(log.photos) && log.photos.length ? `${log.photos.length}图` : ""} image={log.photos?.[0]?.file_url} />)}
          {scoped.inspections.map((issue) => <Row key={issue.id} title={issue.title || issue.description || "问题整改"} meta={`${issue.assignee_name || "未指派"} · ${dateText(issue.due_date || issue.created_at)}`} status={issue.status || "open"} />)}
          {!scoped.logs.length && !scoped.inspections.length ? <Empty text="暂无施工记录" /> : null}
        </Section>}

        {activeTab === "quantity" && (
          <div className={`${styles.mobileQuantityPanel} ${styles.mobileQuantityInlineWorkbench}`}>
            <div className={styles.mobileQuantityWorkbenchSummary}>
              <div className={styles.mobileQuantityTopBar}>
                <button type="button" onClick={() => { setQuantityStructureMode("space"); setQuantitySpaceCreatorOpen((open) => !(open && quantityStructureMode === "space")); }}><Plus />新增空间</button>
                <button type="button" onClick={() => { setQuantityStructureMode("category"); setQuantitySpaceCreatorOpen((open) => !(open && quantityStructureMode === "category")); }}><Plus />新增大类</button>
                <button type="button" onClick={() => {
                  if (quantityAllReviewSectionsExpanded) {
                    setQuantityExpandedSpaces(new Set([QUANTITY_ALL_COLLAPSED_KEY]));
                    setQuantityExpandedSections((current) => {
                      const next = new Set(current);
                      next.delete("fee");
                      return next;
                    });
                    return;
                  }
                  setQuantityExpandedSpaces(new Set(quantitySpaceGroups.map((group) => group.space)));
                  if (quantityFeeItems.length) {
                    setQuantityExpandedSections((current) => {
                      const next = new Set(current);
                      next.add("fee");
                      return next;
                    });
                  }
                }}>
                  {quantityAllReviewSectionsExpanded ? "全部收起" : "全部展开"}
                </button>
              </div>
              {quantitySpaceCreatorOpen ? (
                <div className={styles.mobileQuantityStructureCreator}>
                  <input
                    value={quantityStructureMode === "space" ? quantityNewSpaceName : quantityNewCategoryName}
                    onChange={(event) => quantityStructureMode === "space" ? setQuantityNewSpaceName(event.target.value) : setQuantityNewCategoryName(event.target.value)}
                    placeholder={quantityStructureMode === "space" ? "输入空间名称，如阳台、地下室" : "输入大类名称，如泥工、木工"}
                  />
                  <button type="button" onClick={quantityStructureMode === "space" ? createQuantityCustomSpace : createQuantityCustomCategory}>确定</button>
                </div>
              ) : null}
            </div>

            <div className={styles.mobileQuantityReviewSpaceList}>
              {quantitySpaceGroups.map((group, groupIndex) => {
                const expanded = quantityExpandedSpaces.has(group.space) || quantitySearchActive || (!quantityAllSpacesCollapsed && !quantityExpandedSpaces.size && groupIndex === 0);
                const spaceManualLines = quantitySpaceManualLines.get(group.space) || [];
                const filledCount = group.items.filter((item) => {
                  const itemId = String(item.id || "");
                  const value = Object.prototype.hasOwnProperty.call(quantityActualByItemId, itemId) ? quantityActualByItemId[itemId] : savedQuantityByItemId.get(itemId)?.actualQuantity;
                  return String(value || "").trim();
                }).length;
                const spaceDraftLines = [
                  ...group.items.map((item) => {
                    const itemId = String(item.id || "");
                    const actual = Object.prototype.hasOwnProperty.call(quantityActualByItemId, itemId) ? quantityActualByItemId[itemId] : savedQuantityByItemId.get(itemId)?.actualQuantity || "";
                    return actual ? makeMobileBudgetLine(item, actual, quantityEvidenceByItemId[itemId] ?? savedQuantityByItemId.get(itemId)?.evidenceNote ?? "", quantityDefaultPhase) : null;
                  }).filter((line): line is QuantityReviewLine => Boolean(line)),
                  ...spaceManualLines.map(({ line }) => line).filter((line) => String(line.title || "").trim() && String(line.actual_quantity || "").trim()),
                ];
                const spaceNetAmount = roundMoney(spaceDraftLines.reduce((sum, line) => sum + getQuantityLineDiff(line).signedAmount, 0));
                return (
                  <article className={styles.mobileQuantityReviewSpace} key={group.space} data-expanded={expanded || undefined}>
                    <button type="button" className={styles.mobileQuantityReviewSpaceHead} onClick={() => setQuantityExpandedSpaces((current) => {
                      if (!current.size && groupIndex === 0) return new Set([QUANTITY_ALL_COLLAPSED_KEY]);
                      const next = new Set(current);
                      next.delete(QUANTITY_ALL_COLLAPSED_KEY);
                      if (next.has(group.space)) next.delete(group.space);
                      else next.add(group.space);
                      return next;
                    })}>
                      <div>
                        <b>{group.space}<small>{group.items.length} 个预算项目 · 新增 {spaceManualLines.length} 项</small></b>
                      </div>
                      <span>
                        <em>{filledCount}/{group.items.length}</em>
                        {spaceDraftLines.length ? <strong data-tone={spaceNetAmount < 0 ? "deduct" : spaceNetAmount > 0 ? "add" : "none"}>{signedMoney(spaceNetAmount)}</strong> : null}
                        <ChevronDown />
                      </span>
                    </button>
                    <div className={styles.mobileQuantityCollapse} data-expanded={expanded || undefined}>
                      <div className={styles.mobileQuantityCollapseInner}>
                        <div className={styles.mobileQuantityReviewRows}>
                          {group.items.map((item) => {
                            const itemId = String(item.id || "");
                            const saved = savedQuantityByItemId.get(itemId);
                            const actual = Object.prototype.hasOwnProperty.call(quantityActualByItemId, itemId) ? quantityActualByItemId[itemId] : saved?.actualQuantity || "";
                            const evidence = Object.prototype.hasOwnProperty.call(quantityEvidenceByItemId, itemId) ? quantityEvidenceByItemId[itemId] : saved?.evidenceNote || "";
                            const draftLine = actual ? makeMobileBudgetLine(item, actual, evidence, quantityDefaultPhase) : null;
                            const diff = draftLine ? getQuantityLineDiff(draftLine) : null;
                            return (
                              <div className={styles.mobileQuantityReviewRow} key={itemId}>
                                <div className={styles.mobileQuantityReviewRowTitle}>
                                  <b>{item.name || "预算项目"}</b>
                                  <small>{getQuotationCategoryLabel(item.category)}</small>
                                </div>
                                <div className={styles.mobileQuantityReviewFields}>
                                  <span><small>预算量</small><b>{quantityText(item.quantity)}{item.unit || ""}</b></span>
                                  <label><small>实际量</small><input inputMode="decimal" value={actual} onChange={(event) => setQuantityActualByItemId((current) => ({ ...current, [itemId]: event.target.value }))} placeholder="0" /></label>
                                  <span><small>差额量</small><b data-tone={diff?.type === "DEDUCT" ? "deduct" : diff?.type === "ADD" ? "add" : "none"}>{diff ? `${quantityText(diff.diffQuantity)}${item.unit || ""}` : "-"}</b></span>
                                  <span><small>差额</small><b data-tone={diff?.type === "DEDUCT" ? "deduct" : diff?.type === "ADD" ? "add" : "none"}>{diff ? signedMoney(diff.signedAmount) : "-"}</b></span>
                                </div>
                                <input className={styles.mobileQuantityReviewNote} value={evidence} onChange={(event) => setQuantityEvidence(itemId, event.target.value)} placeholder="备注" />
                              </div>
                            );
                          })}
                          {spaceManualLines.map(({ line, index }) => {
                            const diff = getQuantityLineDiff(line);
                            return (
                              <div className={styles.mobileQuantityReviewRow} data-manual key={line.client_key || index}>
                                <div className={styles.mobileQuantityReviewRowTitle}>
                                  <input className={styles.mobileQuantityManualTitleInput} value={line.title} onChange={(event) => patchQuantityManualLine(index, { title: event.target.value })} placeholder="填写项目名称" />
                                  <input className={styles.mobileQuantityManualCategoryInput} value={line.category} onChange={(event) => patchQuantityManualLine(index, { category: event.target.value })} placeholder={quantityCustomCategories[0] || "基装"} />
                                  <button type="button" aria-label="删除新增项目" onClick={() => removeQuantityManualLine(index)}><Trash2 /></button>
                                </div>
                                <div className={styles.mobileQuantityManualMetaLine}>
                                  <label><span>单位</span><input value={line.unit} onChange={(event) => patchQuantityManualLine(index, { unit: event.target.value })} placeholder="项" /></label>
                                  <label><span>人工</span><input inputMode="decimal" value={line.labor_unit_price} onChange={(event) => patchQuantityManualLine(index, { labor_unit_price: event.target.value })} placeholder="0" /></label>
                                  <label><span>材料</span><input inputMode="decimal" value={line.material_unit_price} onChange={(event) => patchQuantityManualLine(index, { material_unit_price: event.target.value })} placeholder="0" /></label>
                                </div>
                                <div className={styles.mobileQuantityReviewFields}>
                                  <span><small>预算量</small><b>0{line.unit || ""}</b></span>
                                  <label><small>实际量</small><input inputMode="decimal" value={line.actual_quantity} onChange={(event) => patchQuantityManualLine(index, { actual_quantity: event.target.value })} placeholder="0" /></label>
                                  <span><small>差额量</small><b data-tone={diff.type === "DEDUCT" ? "deduct" : diff.type === "ADD" ? "add" : "none"}>{quantityText(diff.diffQuantity)}{line.unit || ""}</b></span>
                                  <span><small>差额</small><b data-tone={diff.type === "DEDUCT" ? "deduct" : diff.type === "ADD" ? "add" : "none"}>{signedMoney(diff.signedAmount)}</b></span>
                                </div>
                                <input className={styles.mobileQuantityReviewNote} value={line.evidence_note} onChange={(event) => patchQuantityManualLine(index, { evidence_note: event.target.value })} placeholder="备注" />
                              </div>
                            );
                          })}
                          <button type="button" className={styles.mobileQuantityReviewAdd} onClick={() => openQuantityManualLine(group.space)}><Plus />在{group.space}新增项目</button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              {!quantitySpaceGroups.length ? <Empty text={quantitySearch ? "没有匹配的预算项目" : "暂无可复核的预算项目"} /> : null}
            </div>

            {quantityFeeItems.length ? <article className={styles.mobileQuantityReviewSpace} data-tone="fee" data-expanded={quantityFeeSectionExpanded || undefined}>
              <button type="button" className={styles.mobileQuantityReviewSpaceHead} onClick={() => setQuantityExpandedSections((current) => {
                const next = new Set(current);
                if (next.has("fee")) next.delete("fee");
                else next.add("fee");
                return next;
              })}>
                <div>
                  <b>综合管理费<small>{quantityFilledFeeCount}/{quantityFeeItems.length} 已填写</small></b>
                </div>
                <span><ChevronDown /></span>
              </button>
              <div className={styles.mobileQuantityCollapse} data-expanded={quantityFeeSectionExpanded || undefined}>
                <div className={styles.mobileQuantityCollapseInner}>
                  <div className={styles.mobileQuantityReviewRows}>
                    {quantityFeeItems.map((item) => {
                      const itemId = String(item.id || "");
                      const saved = savedQuantityByItemId.get(itemId);
                      const actual = Object.prototype.hasOwnProperty.call(quantityFeeActualByItemId, itemId) ? quantityFeeActualByItemId[itemId] : saved?.actualQuantity || "";
                      const evidence = Object.prototype.hasOwnProperty.call(quantityEvidenceByItemId, itemId) ? quantityEvidenceByItemId[itemId] : saved?.evidenceNote || "";
                      const draftLine = actual ? makeMobileFeeLine(item, actual, evidence, quantityDefaultPhase) : null;
                      const diff = draftLine ? getQuantityLineDiff(draftLine) : null;
                      return (
                        <div className={styles.mobileQuantityReviewRow} key={itemId}>
                          <div className={styles.mobileQuantityReviewRowTitle}><b>{item.name || "综合费用"}</b></div>
                          <div className={styles.mobileQuantityReviewFields} data-cols="3">
                            <span><small>原金额</small><b>¥{money(getQuotationOriginalAmount(item))}</b></span>
                            <label><small>实际金额</small><input inputMode="decimal" value={actual} onChange={(event) => setQuantityFeeActualByItemId((current) => ({ ...current, [itemId]: event.target.value }))} placeholder="0" /></label>
                            <span><small>差额</small><b data-tone={diff?.type === "DEDUCT" ? "deduct" : diff?.type === "ADD" ? "add" : "none"}>{diff ? signedMoney(diff.signedAmount) : "-"}</b></span>
                          </div>
                          <input className={styles.mobileQuantityReviewNote} value={evidence} onChange={(event) => setQuantityEvidence(itemId, event.target.value)} placeholder="备注" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </article> : null}

            <footer className={`${styles.mobileQuantitySheetFooter} ${styles.mobileQuantityInlineFooter}`}>
              <div><small>本次改动 {quantityDraftLines.length} 项</small><b>{signedMoney(quantityDraftSummary.netAmount)}</b></div>
              <button type="button" disabled={quantityBusy === "submit"} onClick={submitQuantityReview}>
                {quantityBusy === "submit" ? <Loader2 className="animate-spin" /> : <CheckCircle />}
                提交复核
              </button>
            </footer>
          </div>
        )}

        {quantityManualSpace && typeof document !== "undefined" ? createPortal(
          <div className={styles.mobileQuantityManualBackdrop}>
            <div className={styles.mobileQuantityManualSheet} role="dialog" aria-modal="true" aria-label="新增项目">
              <header className={styles.mobileQuantityManualHeader}>
                <button type="button" onClick={closeQuantityManualLine} aria-label="返回工程量复核"><ArrowLeft /></button>
                <div>
                  <b>新增项目</b>
                  <small>添加到 {quantityManualSpace}</small>
                </div>
              </header>
              <div className={styles.mobileQuantityManualBody}>
                <div className={styles.mobileQuantityManualTabs} role="tablist" aria-label="新增项目方式">
                  <button type="button" data-active={quantityManualMode === "library" || undefined} onClick={() => setQuantityManualMode("library")}>从定额库选择</button>
                  <button type="button" data-active={quantityManualMode === "manual" || undefined} onClick={() => {
                    setQuantityManualMode("manual");
                    setQuantitySelectedQuotaIds([]);
                  }}>手动录入</button>
                </div>

                {quantityManualMode === "library" ? (
                  <section className={styles.mobileQuantityQuotaPanel}>
                    <div className={styles.mobileQuantityQuotaSearch}>
                      <Search />
                      <input
                        value={quantityManualSearch}
                        onChange={(event) => setQuantityManualSearch(event.target.value)}
                        placeholder="搜索项目名称、类别、单位"
                      />
                      {quantityManualSearch ? <button type="button" onClick={() => setQuantityManualSearch("")} aria-label="清空搜索"><X /></button> : null}
                    </div>
                    <div className={styles.mobileQuantityQuotaMeta}>
                      <span>{quantitySelectedQuotaIds.length ? `已选 ${quantitySelectedQuotaIds.length} 项` : `${filteredQuantityQuotaOptions.total} 项可选`}</span>
                    </div>
                    <div className={styles.mobileQuantityQuotaList}>
                      {filteredQuantityQuotaOptions.items.length ? filteredQuantityQuotaOptions.items.map((quota) => {
                        const quotaKey = `${quota.source}:${quota.id}`;
                        const selected = quantitySelectedQuotaIds.includes(quotaKey);
                        return (
                          <button
                            type="button"
                            key={quotaKey}
                            data-selected={selected || undefined}
                            onClick={() => toggleQuantityQuota(quotaKey)}
                          >
                            <i aria-hidden="true" />
                            <span>
                              <b>{quota.name}</b>
                              <small>{getQuotationCategoryLabel(quota.category)} · {quota.unit || "项"} · {quota.sourceLabel}</small>
                            </span>
                            <strong>¥{money((Number(quota.laborPrice || 0) || 0) + (Number(quota.materialPrice || 0) || 0))}</strong>
                          </button>
                        );
                      }) : (
                        <Empty text={filteredQuantityQuotaOptions.keyword ? "没有匹配的定额项目" : "暂无可选择的定额项目"} />
                      )}
                    </div>
                  </section>
                ) : (
                  <section className={styles.mobileQuantityManualForm}>
                    <label data-wide>
                      <span>项目名称</span>
                      <input value={quantityManualDraft.title} onChange={(event) => patchQuantityManualDraft({ title: event.target.value })} placeholder="请输入新增项目名称" />
                    </label>
                    <label data-wide>
                      <span>类别</span>
                      <input value={quantityManualDraft.category} onChange={(event) => patchQuantityManualDraft({ category: event.target.value })} placeholder="输入或选择大类" />
                    </label>
                    <div className={styles.mobileQuantityCategoryChips}>
                      {quantityCategoryOptions.map((category) => (
                        <button type="button" key={category} data-active={quantityManualDraft.category === category || undefined} onClick={() => patchQuantityManualDraft({ category })}>{category}</button>
                      ))}
                    </div>
                    <label>
                      <span>实际量</span>
                      <input inputMode="decimal" value={quantityManualDraft.actual_quantity} onChange={(event) => patchQuantityManualDraft({ actual_quantity: event.target.value })} placeholder="0" />
                    </label>
                    <label>
                      <span>单位</span>
                      <input value={quantityManualDraft.unit} onChange={(event) => patchQuantityManualDraft({ unit: event.target.value })} placeholder="项" />
                    </label>
                    <label>
                      <span>人工单价</span>
                      <input inputMode="decimal" value={quantityManualDraft.labor_unit_price} onChange={(event) => patchQuantityManualDraft({ labor_unit_price: event.target.value })} placeholder="0" />
                    </label>
                    <label>
                      <span>材料单价</span>
                      <input inputMode="decimal" value={quantityManualDraft.material_unit_price} onChange={(event) => patchQuantityManualDraft({ material_unit_price: event.target.value })} placeholder="0" />
                    </label>
                    <label data-wide>
                      <span>备注</span>
                      <input value={quantityManualDraft.evidence_note} onChange={(event) => patchQuantityManualDraft({ evidence_note: event.target.value })} placeholder="填写测量说明或现场情况" />
                    </label>
                  </section>
                )}
              </div>
              <footer className={styles.mobileQuantityManualFooter}>
                <div>
                  {quantityManualMode === "manual" ? (
                    <>
                      <small>预计差额</small>
                      <b>{signedMoney(getQuantityLineDiff(quantityManualDraft).signedAmount)}</b>
                    </>
                  ) : (
                    <>
                      <small>已选定额</small>
                      <b>{quantitySelectedQuotaIds.length} 项</b>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={confirmQuantityManualLine}
                  disabled={quantityManualMode === "library" ? !quantitySelectedQuotaIds.length : !String(quantityManualDraft.title || "").trim() || !String(quantityManualDraft.actual_quantity || "").trim()}
                >
                  添加到复核表
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        ) : null}

        {activeTab === "materials" && <Section title="材料下单" icon={ShoppingCart} action={materialOrderTemplates.length ? (
          <button type="button" className={styles.mobileMaterialHeaderTemplateButton} onClick={() => setMaterialTemplatePickerOpen(true)} aria-label="展开快速下单模板">
            <ClipboardList />
            <span>快速下单模板</span>
            <ChevronDown />
          </button>
        ) : undefined}>
          <div className={styles.mobileMaterialStore}>
            <div className={styles.mobileMaterialTabs}>
              <button type="button" data-active={materialView === "shop" || undefined} onClick={() => setMaterialView("shop")}><ShoppingCart />选材料</button>
              <button type="button" data-active={materialView === "orders" || undefined} onClick={() => setMaterialView("orders")}><Package />我的订单</button>
            </div>
            {materialOrderMessage ? <div className={styles.mobileMaterialMessage}>{materialOrderMessage}</div> : null}

            {materialView === "shop" ? (
              <>
                <div className={styles.mobileMaterialSearch} data-has-clear={materialSearch || undefined}>
                  <Search />
                  <input value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder="搜索材料名称、品牌、型号" />
                  {materialSearch ? <button type="button" onClick={() => setMaterialSearch("")} aria-label="清空搜索"><X /></button> : null}
                </div>
                <div className={styles.mobileMaterialLayout}>
	                  <nav className={styles.mobileMaterialCategories} aria-label="材料分类">
	                    {materialCategories.map((category) => {
	                      const selectedCount = cartCategoryCounts[category] || 0;
	                      return (
	                        <button type="button" key={category} data-active={materialCategory === category || undefined} onClick={() => { setMaterialCategory(category); setMaterialSubcategory("全部"); }}>
	                          <span>{category}</span>
	                          {selectedCount ? <em>{selectedCount}</em> : null}
	                        </button>
	                      );
	                    })}
	                  </nav>
                  <div className={styles.mobileMaterialGoods}>
                    {materialSubcategories.length ? (
                      <div className={styles.mobileMaterialSubcategories} aria-label="材料二级分类">
                        {materialSubcategories.map((category) => (
                          <button type="button" key={category} data-active={materialSubcategory === category || undefined} onClick={() => setMaterialSubcategory(category)}>
                            {category}
                          </button>
                        ))}
                      </div>
                    ) : null}
	                    {visibleMaterials.map((material) => {
	                      const image = materialImageUrl(material);
	                      const cartLine = materialCart[String(material.id)];
	                      const quantity = cartLine?.quantity || 0;
	                      const isOutOfStock = materialOutOfStock(material);
	                      const isStockTight = materialStockTight(material);
	                      const isEditingQuantity = Boolean(cartLine) && !isOutOfStock;
	                      const specParts = materialSpecParts(material);
	                      return (
	                        <article className={styles.mobileMaterialGoodCard} key={material.id} data-out-stock={isOutOfStock || undefined} data-stock-tight={!isOutOfStock && isStockTight || undefined}>
	                          {isOutOfStock ? <span className={styles.mobileMaterialSoldOutStamp}>缺货</span> : null}
	                          {!isOutOfStock && isStockTight ? <span className={styles.mobileMaterialStockTightStamp}>库存紧张</span> : null}
	                          <div className={styles.mobileMaterialGoodImage}>
	                            {image ? <Image src={image} alt={material.name || "材料图片"} fill sizes="96px" unoptimized /> : <Package />}
	                          </div>
                          <div className={styles.mobileMaterialGoodInfo}>
                            <b>{materialDisplayName(material)}</b>
                            <small>
                              {specParts.length ? specParts.map((part) => <i key={part}>{part}</i>) : <i>{material.category_name || "规格未设置"}</i>}
                            </small>
                            <span><em>{material.supplier_name || material.category_name || "供应方未设置"}</em><strong>库存 {quantityText(material.stock)} {material.unit || ""}</strong></span>
                            <div className={styles.mobileMaterialGoodBottom}>
                              <strong>¥{money(material.unit_price)}<small>/{material.unit || "件"}</small></strong>
                              <div className={styles.mobileMaterialStepper}>
                                {isEditingQuantity ? <button type="button" onClick={() => updateMaterialCart(String(material.id), -1)} aria-label="减少"><Minus /></button> : null}
                                {isEditingQuantity ? <input value={quantity > 0 ? quantityText(quantity) : ""} inputMode="decimal" onChange={(event) => setMaterialCartQuantity(String(material.id), event.target.value)} onBlur={() => finalizeMaterialCartQuantity(String(material.id))} aria-label="数量" /> : null}
	                                <button type="button" data-add disabled={isOutOfStock} onClick={() => updateMaterialCart(String(material.id), 1)} aria-label={isOutOfStock ? "缺货" : "增加"}><Plus /></button>
	                              </div>
	                            </div>
                          </div>
                        </article>
                      );
                    })}
                    {!visibleMaterials.length ? <Empty text={materialCatalog.length ? "没有找到匹配材料" : "电脑端材料库暂无可下单材料"} /> : null}
                  </div>
                </div>
                <div className={styles.mobileMaterialCartBar} data-empty={!cartLines.length || undefined}>
                  <button type="button" onClick={() => setMaterialSheetMode("cart")} disabled={!cartLines.length}>
                    <span><ShoppingCart />{cartQuantity ? <em>{quantityText(cartQuantity)}</em> : null}</span>
                    <div><b>{cartLines.length ? `¥${money(cartAmount)}` : "购物车为空"}</b><small>{cartLines.length ? `${cartLines.length} 种材料，去确认` : "选择材料后统一下单"}</small></div>
                    <strong>去下单</strong>
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.mobileMaterialOrders}>
                <div className={styles.mobileMaterialOrderFilters} role="tablist" aria-label="订单状态筛选">
                  {materialOrderFilterTabs.map((tab) => (
                    <button
                      type="button"
                      key={tab.key}
                      role="tab"
                      aria-selected={materialOrderFilter === tab.key}
                      data-active={materialOrderFilter === tab.key || undefined}
                      onClick={() => setMaterialOrderFilter(tab.key)}
                    >
                      {tab.label}
                      <span>{materialOrderFilterCounts[tab.key]}</span>
                    </button>
                  ))}
                </div>
                <div className={styles.mobileMaterialOrderList}>
                {visibleMaterialOrders.map((order) => {
                  const orderItems = scoped.materialItems.filter((item) => String(item.order_id) === String(order.id));
                  const primaryItem = orderItems[0] || order;
                  const previewItems = (orderItems.length ? orderItems : [primaryItem]).slice(0, 4);
                  const itemCount = Number(order.item_count || orderItems.length || 0);
                  return (
                    <article className={styles.mobileMaterialOrderCard} key={order.id}>
                      <button type="button" className={styles.mobileMaterialOrderMain} onClick={() => openMaterialOrder(order)}>
                        <span>
                          <b>{order.order_no || "材料订单"}</b>
                          <small>{dateText(order.order_date || order.created_at)} · {order.supplier_name || "供应方未设置"}</small>
                        </span>
                        <em data-status={String(order.status || "")}>{orderStatusLabels[String(order.status || "")] || order.status || "订单"}</em>
                      </button>
                      <button type="button" className={styles.mobileMaterialOrderPreview} onClick={() => openMaterialOrder(order)}>
                        <div className={styles.mobileMaterialOrderThumbs}>
                          {previewItems.map((item, index) => {
                            const imageUrl = materialImageUrl(item);
                            return (
                              <span key={`${item.id || order.id}-${index}`}>
                                {imageUrl ? <Image src={imageUrl} alt="" fill sizes="42px" unoptimized /> : <Package />}
                              </span>
                            );
                          })}
                        </div>
                        <div className={styles.mobileMaterialOrderPreviewMeta}>
                          <b>共 {itemCount || 1} 项材料</b>
                        </div>
                        <strong>¥{money(order.total_amount)}</strong>
	                      </button>
	                      <div className={styles.mobileMaterialOrderActions}>
	                        <button type="button" disabled={Boolean(materialOrderBusy)} onClick={() => repeatMaterialOrder(order)}>再来一单</button>
	                        {String(order.status || "") !== "CANCELLED" && String(order.status || "") !== "RECEIVED" ? (
	                          <button type="button" data-danger disabled={Boolean(materialOrderBusy)} onClick={() => requestCancelMaterialOrder(order)}>{materialOrderCancelActionText(order)}</button>
	                        ) : null}
                      </div>
                    </article>
                  );
                })}
                {!visibleMaterialOrders.length ? <Empty text={scoped.materialOrders.length ? "当前状态暂无订单" : "暂无材料订单，先去材料商城下单"} /> : null}
                </div>
              </div>
            )}
          </div>
        </Section>}

        {activeTab === "changes" && <Section title="增减项单" icon={ShieldCheck} action={`净额 ¥${compactMoney(changeAmount)}`}>
          {scoped.changeOrders.length ? scoped.changeOrders.map((order) => <Row key={order.id} title={order.change_no || order.title || "增减项单"} meta={`${order.created_by_name || "发起人未设置"} · ${dateText(order.created_at, true)}`} value={`¥${money(order.amount || order.receivable_amount)}`} status={order.status} />) : <Empty text="暂无增减项单" />}
        </Section>}

        {activeTab === "costs" && (
          <div className={styles.mobileCostPanel}>
            <div className={styles.mobileCostActionGrid}>
              <button
                type="button"
                data-primary
                onClick={() => setCostSheetMode("insight")}
              >
                <i><ShieldCheck /></i>
                <span>
                  <b>成本明细</b>
                  <small>按工种和材料分类查看预算成本</small>
                </span>
                <strong><ChevronRight /></strong>
                <div className={styles.mobileCostActionStats}>
                  <em><small>预算项</small><b>{activeCostSnapshotItems.length}</b></em>
                  <em><small>实际分类</small><b>{actualCostCompareRows.length}</b></em>
                  <em data-tone={costCompareOverBudgetCount > 0 ? "danger" : "normal"}><small>超预算</small><b>{costCompareOverBudgetCount}</b></em>
                </div>
              </button>
            </div>
            <section className={styles.mobileCostHero} data-tone={budgetActualCostGap < 0 ? "danger" : "normal"}>
              <div className={styles.mobileCostHeroTop}>
                <div>
                  <span>实际发生成本</span>
                  <b>¥{compactMoney(costAmount)}</b>
                </div>
                <em>{budgetActualCostGap < 0 ? "已超预算" : activeCostSnapshot ? "成本正常" : "待生成预算"}</em>
              </div>
              <div className={styles.mobileCostHeroSources}>
                <span>手工 {manualCostRows.length} 笔</span>
                <span>材料订单 {materialCostRows.length} 笔</span>
                <span>实际分类 {actualCostCompareRows.length} 类</span>
              </div>
              <div className={styles.mobileCostProgress}>
                <i style={{ width: `${costCollectionProgress}%` }} />
              </div>
              <div className={styles.mobileCostHeroMeta}>
                <span>成本使用率</span>
                <strong>{activeCostSnapshot ? `${costCollectionRate}%` : "--"}</strong>
              </div>
              <div className={styles.mobileCostHeroSplit}>
                <span><small>预算总成本</small><b>{activeCostSnapshot ? `¥${compactMoney(budgetTotalCostAmount)}` : "--"}</b></span>
                <span data-tone={budgetActualCostGap < 0 ? "danger" : "green"}><small>预算剩余额度</small><b>{activeCostSnapshot ? signedMoney(budgetActualCostGap) : "--"}</b></span>
                <span data-tone={realtimeGrossProfitAmount < 0 ? "danger" : "green"}><small>实时毛利</small><b>{signedMoney(realtimeGrossProfitAmount)}</b></span>
              </div>
            </section>
            {costMessage ? <div className={styles.mobileCostMessage}>{costMessage}</div> : null}
            {budgetMissingRuleCount > 0 ? (
              <div className={styles.mobileCostWarning}>
                <AlertTriangle />
                <span>{budgetMissingRuleCount} 个预算项目缺少成本规则，需在电脑端标准定额库补充。</span>
              </div>
            ) : null}
            <div className={styles.mobileCostMetricBoard} aria-label="成本管控完整指标">
              {[
                {
                  title: "预算成本",
                  items: [
                    { label: "预算收入", value: activeCostSnapshot ? `¥${compactMoney(budgetRevenueAmount)}` : "--", tone: "blue" },
                    { label: "预算总成本", value: activeCostSnapshot ? `¥${compactMoney(budgetTotalCostAmount)}` : "--", tone: "neutral" },
                    { label: "预算材料", value: activeCostSnapshot ? `¥${compactMoney(budgetMaterialCostAmount)}` : "--", tone: "amber" },
                    { label: "预算人工", value: activeCostSnapshot ? `¥${compactMoney(budgetLaborCostAmount)}` : "--", tone: "green" },
                  ],
                },
                {
                  title: "利润测算",
                  items: [
                    { label: "预算毛利", value: activeCostSnapshot ? signedMoney(budgetGrossProfitAmount) : "--", tone: budgetGrossProfitAmount < 0 ? "danger" : "green" },
                    { label: "预算毛利率", value: activeCostSnapshot ? `${budgetGrossProfitRate}%` : "--", tone: budgetGrossProfitAmount < 0 ? "danger" : "green" },
                    { label: "实时毛利", value: signedMoney(realtimeGrossProfitAmount), tone: realtimeGrossProfitAmount < 0 ? "danger" : "green" },
                    { label: "实时毛利率", value: `${realtimeGrossProfitRate}%`, tone: realtimeGrossProfitAmount < 0 ? "danger" : "green" },
                  ],
                },
                {
                  title: "执行结果",
                  items: [
                    { label: "项目经理提成", value: activeCostSnapshot ? "待计算" : "--", tone: "neutral" },
                    { label: "预算剩余额度", value: activeCostSnapshot ? signedMoney(budgetActualCostGap) : "--", tone: budgetActualCostGap < 0 ? "danger" : "neutral" },
                  ],
                },
              ].map((group, index) => (
                <section className={styles.mobileCostMetricGroup} key={group.title} data-layer={index + 1}>
                  <header>
                    <small>{String(index + 1).padStart(2, "0")}</small>
                    <h3>{group.title}</h3>
                  </header>
                  <div>
                    {group.items.map((item) => (
                      <span key={item.label} data-tone={item.tone}>
                        <small>{item.label}</small>
                        <b>{item.value}</b>
                      </span>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        {activeTab === "settlement" && <Section title="结算利润" icon={Calculator} action={`${scoped.bills.length} 张结算单`}>
          <div className={styles.mobileSiteDetailSummary}>
            <Metric label="合同金额" value={`¥${compactMoney(contractAmount)}`} />
            <Metric label="增减项" value={`¥${compactMoney(changeAmount)}`} />
            <Metric label="成本" value={`¥${compactMoney(costAmount)}`} />
            <Metric label="预估利润" value={`¥${compactMoney(contractAmount + changeAmount - costAmount)}`} tone="success" />
          </div>
          {scoped.bills.length ? scoped.bills.map((bill) => <Row key={bill.id} title={bill.bill_no || bill.title || "业主结算单"} meta={`${bill.created_by_name || "创建人未设置"} · ${dateText(bill.created_at)}`} value={`¥${money(bill.receivable_amount || bill.final_amount)}`} status={bill.status} />) : <Empty text="暂无结算单" />}
        </Section>}

        {activeTab === "cameras" && <Section title="工地摄像头" icon={Camera} action={`${scoped.cameras.length} 个`}>
          {scoped.cameras.length ? scoped.cameras.map((camera) => <Row key={camera.id} title={camera.name || camera.device_name || "摄像头"} meta={`${camera.provider || "设备"} · ${camera.device_serial || "序列号未设置"}`} status={camera.status || "active"} />) : <Empty text="暂无工地摄像头" />}
        </Section>}

        {activeTab === "checkin" && <Section title="工地签到" icon={QrCode} action={`${scoped.checkinRecords.length} 条`}>
          {scoped.checkinCode ? <div className={styles.mobileSiteCheckinCode}><QrCode /><div><b>{scoped.checkinCode.code}</b><small>现场签到码</small></div></div> : null}
          {scoped.checkinRecords.length ? scoped.checkinRecords.map((record) => <Row key={record.id} title={record.person_name || "签到人员"} meta={`${record.phone || "电话未填"} · ${dateText(record.signed_at || record.created_at, true)}`} value={Array.isArray(record.photos) && record.photos.length ? `${record.photos.length}图` : ""} image={record.photos?.[0]?.file_url} />) : <Empty text="暂无签到记录" />}
        </Section>}

        {activeTab === "archive" && <Section title="资料归档" icon={Archive} action={`${scoped.attachments.length + scoped.vrTours.length} 份`}>
          {scoped.vrTours.map((tour) => <Row key={tour.id} title={tour.title || "VR 全景"} meta={dateText(tour.created_at, true)} value="VR" />)}
          {scoped.attachments.length ? scoped.attachments.map((file) => <Row key={file.id} title={file.name || file.file_name || "资料文件"} meta={`${file.category || "未分类"} · ${file.uploader_name || "上传人未设置"} · ${dateText(file.created_at)}`} value={file.file_type || ""} image={String(file.file_url || "").match(/\.(png|jpe?g|webp|gif)$/i) ? file.file_url : undefined} />) : scoped.vrTours.length ? null : <Empty text="暂无归档资料" />}
        </Section>}
      </main>}

      {costSheetMode === "detail" && selectedCostRow ? <div className={styles.mobileCostSheetBackdrop} role="presentation" onClick={() => !costBusy && setCostSheetMode(null)}>
        <section className={styles.mobileCostSheet} role="dialog" aria-modal="true" aria-label="成本流水详情" onClick={(event) => event.stopPropagation()}>
          <header className={styles.mobileCostSheetHeader}>
            <div><b>{selectedCostRow.name || "成本记录"}</b><small>{selectedCostRow.source_label || "手工录入"} · {dateText(selectedCostRow.cost_date || selectedCostRow.created_at)}</small></div>
            <button type="button" onClick={() => setCostSheetMode(null)} aria-label="关闭"><X /></button>
          </header>
          <div className={styles.mobileCostSheetBody}>
            <div className={styles.mobileCostDetailAmount}>
              <small>支出金额</small>
              <b>¥{money(selectedCostRow.amount)}</b>
              <span>{costCategoryLabel(selectedCostRow.category)} · {costStatusLabels[String(selectedCostRow.status || "PAID").toUpperCase()] || selectedCostRow.status || "已支付"}</span>
            </div>
            <div className={styles.mobileCostDetailFacts}>
              <span><small>来源</small><b>{selectedCostRow.source_label || "手工录入"}</b></span>
              <span><small>归集维度</small><b>{selectedCostRow.source_type === "MATERIAL_ORDER" ? "材料订单自动" : selectedCostRow.work_type_name || selectedCostRow.material_category_name || selectedCostRow.phase || "-"}</b></span>
              <span><small>供应商</small><b>{selectedCostRow.supplier || "-"}</b></span>
              <span><small>收款方</small><b>{selectedCostRow.payee || "-"}</b></span>
              <span><small>支付方式</small><b>{selectedCostRow.payment_method || "-"}</b></span>
              <span><small>单据号</small><b>{selectedCostRow.invoice_no || selectedCostRow.source_no || "-"}</b></span>
              {selectedCostRow.source_type === "MATERIAL_ORDER" ? <span><small>材料项数</small><b>{Number(selectedCostRow.item_count || 0)} 项</b></span> : null}
              {selectedCostRow.created_by_name ? <span><small>记录人</small><b>{selectedCostRow.created_by_name}</b></span> : null}
            </div>
            {selectedCostRow.remark ? <div className={styles.mobileCostRemark}>{selectedCostRow.remark}</div> : null}
            {costMessage ? <div className={styles.mobileCostMessage}>{costMessage}</div> : null}
          </div>
          <footer className={styles.mobileCostSheetFooter}>
            <div><small>类型</small><b>{selectedCostRow.source_type === "MATERIAL_ORDER" ? "系统归集" : "手工记录"}</b></div>
            {selectedCostRow.source_type === "MANUAL" ? (
              <button type="button" data-danger disabled={Boolean(costBusy)} onClick={() => setCostDeleteRecord(selectedCostRow)}>
                <Trash2 />
                删除记录
              </button>
            ) : <button type="button" onClick={() => setCostSheetMode(null)}>知道了</button>}
          </footer>
        </section>
      </div> : null}

      {costSheetMode === "insight" && typeof document !== "undefined" ? createPortal(<div className={styles.mobileCostFullScreenBackdrop}>
        <section className={styles.mobileCostFullScreen} role="dialog" aria-modal="true" aria-label="成本明细">
          <header className={styles.mobileCostSheetHeader}>
            <div><b>成本明细</b><small>左侧选分类，右侧查看预算和实际发生</small></div>
            <button type="button" onClick={() => setCostSheetMode(null)} aria-label="关闭"><X /></button>
          </header>
          <div className={styles.mobileCostInsightBody}>
            <aside className={styles.mobileCostInsightNav} aria-label="成本明细分类">
              <div className={styles.mobileCostInsightNavGroup}>
                <small>预算分类</small>
                {budgetGroupRows.map((group) => (
                  <button
                    type="button"
                    key={group.key}
                    data-active={selectedCostBudgetGroup.key === group.key || undefined}
                    onClick={() => setSelectedCostBudgetGroupKey(group.key)}
                  >
                    <b>{group.name}</b>
                    <span>{group.count}</span>
                  </button>
                ))}
              </div>
            </aside>
            <div className={styles.mobileCostInsightDetail}>
              <div className={styles.mobileCostInsightTitle}>
                <div>
                  <b>{selectedCostBudgetGroup.name}</b>
                  <small>预算 ¥{compactMoney(selectedCostBudgetAmount)} · 实支 ¥{compactMoney(selectedCostBudgetActualAmount)}</small>
                </div>
                <strong data-tone={selectedCostBudgetGap < -0.005 ? "danger" : "success"}>{signedMoney(selectedCostBudgetGap)}</strong>
              </div>
              <div className={styles.mobileCostBudgetList}>
                {visibleCostBudgetRows.length ? visibleCostBudgetRows.map((item) => {
                  const missingRule = Number(item.missing_cost_rule || 0) === 1;
                  const budgetMetaParts = [
                    item.space || "未分空间",
                    ...(isMaterialCostBudgetGroup ? [] : [item.work_type_name || "未指定工种"]),
                    ...(isWorkCostBudgetGroup ? [] : [item.material_category_name || "未指定材料"]),
                  ];
                  const itemBudgetAmount = isWorkCostBudgetGroup
                    ? Number(item.budget_labor_cost || 0)
                    : isMaterialCostBudgetGroup
                      ? Number(item.budget_material_cost || 0)
                      : Number(item.budget_total_cost || 0);
                  return (
                    <article className={styles.mobileCostBudgetItem} key={item.id} data-missing={missingRule || undefined}>
                      <div className={styles.mobileCostBudgetItemTop}>
                        <div>
                          <b>{item.name || "预算项目"}</b>
                          <small>{budgetMetaParts.join(" · ")}</small>
                        </div>
                        <strong>¥{money(itemBudgetAmount)}</strong>
                      </div>
                      <div className={styles.mobileCostBudgetItemFacts}>
                        <span><small>数量</small><b>{quantityText(item.quantity)} {item.unit || ""}</b></span>
                        {!isWorkCostBudgetGroup ? <span><small>材料单价</small><b>¥{money(item.cost_material_unit)}</b></span> : null}
                        {!isMaterialCostBudgetGroup ? <span><small>人工单价</small><b>¥{money(item.cost_labor_unit)}</b></span> : null}
                        {!isWorkCostBudgetGroup ? <span><small>材料成本</small><b>¥{money(item.budget_material_cost)}</b></span> : null}
                        {!isMaterialCostBudgetGroup ? <span><small>人工成本</small><b>¥{money(item.budget_labor_cost)}</b></span> : null}
                        <span data-tone="actual"><small>实际支出</small><b>¥{money(getCostBudgetItemActualAmount(item))}</b></span>
                      </div>
                      {missingRule ? <em>缺成本规则</em> : null}
                    </article>
                  );
                }) : <Empty text="暂无预算成本明细" />}
              </div>
            </div>
          </div>
        </section>
      </div>, document.body) : null}

      {costDeleteRecord ? <div className={styles.mobileMaterialCancelBackdrop} role="presentation" onClick={() => !costBusy && setCostDeleteRecord(null)}>
        <div className={styles.mobileMaterialCancelDialog} role="dialog" aria-modal="true" aria-labelledby="mobile-cost-delete-title" onClick={(event) => event.stopPropagation()}>
          <div className={styles.mobileMaterialCartRemoveConfirmIcon}><Trash2 /></div>
          <div className={styles.mobileMaterialCancelHead}>
            <h2 id="mobile-cost-delete-title">删除这笔成本？</h2>
            <p>删除后电脑端成本流水也会同步移除。材料订单自动归集的成本不能在这里删除。</p>
          </div>
          <div className={styles.mobileMaterialCancelPreview}>
            <span>准备删除</span>
            <b>{costDeleteRecord.name || "成本记录"}</b>
            <small>¥{money(costDeleteRecord.amount)} · {dateText(costDeleteRecord.cost_date || costDeleteRecord.created_at)}</small>
          </div>
          {costMessage ? <div className={styles.mobileMaterialCancelMessage}>{costMessage}</div> : null}
          <div className={styles.mobileMaterialCancelActions}>
            <button type="button" disabled={Boolean(costBusy)} onClick={() => setCostDeleteRecord(null)}>先不删除</button>
            <button type="button" data-danger disabled={Boolean(costBusy)} onClick={() => deleteCostRecord(costDeleteRecord)}>
              {costBusy === `delete:${costDeleteRecord.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
              确认删除
            </button>
          </div>
        </div>
      </div> : null}

      {quantitySheetMode === "detail" && selectedQuantityReview ? <div className={styles.mobileQuantitySheetBackdrop} role="presentation" onClick={() => !quantityBusy && setQuantitySheetMode(null)}>
        <section className={styles.mobileQuantitySheet} role="dialog" aria-modal="true" aria-label="工程量复核详情" onClick={(event) => event.stopPropagation()}>
          <header className={styles.mobileQuantitySheetHeader}>
            <div><b>{selectedQuantityReview.review_no || "工程量复核单"}</b><small>{quantityReviewStatusLabels[String(selectedQuantityReview.status || "").toUpperCase()] || selectedQuantityReview.status || "复核单"} · {dateText(selectedQuantityReview.created_at, true)}</small></div>
            <button type="button" onClick={() => setQuantitySheetMode(null)} aria-label="关闭"><X /></button>
          </header>
          <div className={styles.mobileQuantitySheetBody}>
            <div className={styles.mobileQuantityDraftSummary}>
              <span><small>明细</small><b>{selectedQuantityReviewItems.length} 项</b></span>
              <span><small>增加</small><b>¥{money(selectedQuantityReview.add_amount)}</b></span>
              <span><small>减少</small><b>¥{money(selectedQuantityReview.deduct_amount)}</b></span>
              <span data-tone={Number(selectedQuantityReview.net_amount || 0) < 0 ? "deduct" : "add"}><small>净额</small><b>{signedMoney(selectedQuantityReview.net_amount)}</b></span>
            </div>
            <div className={styles.mobileQuantityDetailList}>
              {selectedQuantityReviewItems.map((item, index) => {
                const diff = getQuantityLineDiff(item);
                return (
                  <article className={styles.mobileQuantityDetailItem} key={`${item.quotation_item_id || item.client_key}-${index}`} data-tone={diff.type === "DEDUCT" ? "deduct" : diff.type === "ADD" ? "add" : "none"}>
                    <div className={styles.mobileQuantityDetailTop}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <b>{item.title || "复核项目"}</b>
                        <small>{item.source_type === "MANUAL" ? "现场新增" : "预算项目"} · {item.space || "未分空间"} · {item.category || "-"}</small>
                      </div>
                      <em>{diff.type === "ADD" ? "增项" : diff.type === "DEDUCT" ? "减项" : "无差额"}</em>
                    </div>
                    <div className={styles.mobileQuantityDetailFacts}>
                      <span><small>预算量</small><b>{quantityText(item.budget_quantity)} {item.unit || ""}</b></span>
                      <span><small>实际量</small><b>{quantityText(item.actual_quantity)} {item.unit || ""}</b></span>
                      <span><small>差量</small><b>{quantityText(diff.diffQuantity)} {item.unit || ""}</b></span>
                      <span><small>差额</small><b>{signedMoney(diff.signedAmount)}</b></span>
                    </div>
                    {item.evidence_note || item.description ? <p>{item.evidence_note || item.description}</p> : null}
                  </article>
                );
              })}
              {!selectedQuantityReviewItems.length ? <Empty text="该复核单暂无明细" /> : null}
            </div>
            {quantityMessage ? <div className={styles.mobileQuantityMessage}>{quantityMessage}</div> : null}
          </div>
          <footer className={styles.mobileQuantitySheetFooter}>
            <div><small>状态</small><b>{quantityReviewStatusLabels[String(selectedQuantityReview.status || "").toUpperCase()] || selectedQuantityReview.status || "-"}</b></div>
            {String(selectedQuantityReview.status || "").toUpperCase() === "PENDING_REVIEW" ? (
              <button type="button" disabled={Boolean(quantityBusy)} onClick={() => runQuantityReviewAction(selectedQuantityReview, "confirm_quantity_review", "复核单已确认")}>
                {quantityBusy === `confirm_quantity_review:${selectedQuantityReview.id}` ? <Loader2 className="animate-spin" /> : <CheckCircle />}
                确认复核
              </button>
            ) : String(selectedQuantityReview.status || "").toUpperCase() === "CONFIRMED" ? (
              <button type="button" disabled={Boolean(quantityBusy)} onClick={() => runQuantityReviewAction(selectedQuantityReview, "generate_quantity_review_change_order", "已生成增减项单")}>
                {quantityBusy === `generate_quantity_review_change_order:${selectedQuantityReview.id}` ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                生成增减项
              </button>
            ) : <button type="button" onClick={() => setQuantitySheetMode(null)}>知道了</button>}
          </footer>
        </section>
      </div> : null}

      {quantityCancelReview ? <div className={styles.mobileMaterialCancelBackdrop} role="presentation" onClick={() => !quantityBusy && setQuantityCancelReview(null)}>
        <div className={styles.mobileMaterialCancelDialog} role="dialog" aria-modal="true" aria-labelledby="mobile-quantity-cancel-title" onClick={(event) => event.stopPropagation()}>
          <div className={styles.mobileMaterialCancelIcon}><AlertTriangle /></div>
          <div className={styles.mobileMaterialCancelHead}>
            <h2 id="mobile-quantity-cancel-title">作废这张复核单？</h2>
            <p>作废后电脑端也会同步为已作废；如果已经生成增减项，则不能再作废。</p>
          </div>
          <div className={styles.mobileMaterialCancelPreview}>
            <span>复核单</span>
            <b>{quantityCancelReview.review_no || quantityCancelReview.title || "工程量复核单"}</b>
            <small>{quantityCancelReview.created_by_name || "创建人未设置"} · {signedMoney(quantityCancelReview.net_amount)}</small>
          </div>
          {quantityMessage ? <div className={styles.mobileMaterialCancelMessage}>{quantityMessage}</div> : null}
          <div className={styles.mobileMaterialCancelActions}>
            <button type="button" disabled={Boolean(quantityBusy)} onClick={() => setQuantityCancelReview(null)}>先不作废</button>
            <button type="button" data-danger disabled={Boolean(quantityBusy)} onClick={() => runQuantityReviewAction(quantityCancelReview, "cancel_quantity_review", "复核单已作废")}>
              {quantityBusy === `cancel_quantity_review:${quantityCancelReview.id}` ? <Loader2 className="animate-spin" /> : <AlertTriangle />}
              确认作废
            </button>
          </div>
        </div>
      </div> : null}

      {materialSheetMode === "cart" && <div className={styles.mobileMaterialSheetBackdrop} role="presentation" onClick={() => !materialOrderBusy && setMaterialSheetMode(null)}>
        <section className={styles.mobileMaterialSheet} role="dialog" aria-modal="true" aria-label="确认材料下单" onClick={(event) => event.stopPropagation()}>
          <header className={styles.mobileMaterialSheetHeader}>
            <div><b>确认下单</b><small>{cartLines.length} 种材料 · ¥{money(cartAmount)}</small></div>
            <button type="button" onClick={() => setMaterialSheetMode(null)} aria-label="关闭"><X /></button>
          </header>
	          <div className={styles.mobileMaterialSheetBody}>
	            <div className={styles.mobileMaterialCheckoutSectionTitle}><span>商品明细</span><small>{cartLines.length} 种</small></div>
	            {stockTightCartLines.length ? (
	              <div className={styles.mobileMaterialCheckoutNotice} data-tone="warning">
	                <AlertTriangle />
	                <div>
	                  <b>{stockTightCartLines.length} 种材料库存紧张</b>
	                  <small>可以继续下单，建议仓库或采购优先处理。</small>
	                </div>
	              </div>
	            ) : null}
	            {cartSupplierGroups.length > 1 ? (
	              <div className={styles.mobileMaterialCheckoutNotice}>
	                <Package />
	                <div>
	                  <b>将按供应方拆成 {cartSupplierGroups.length} 单</b>
	                  <small>{cartSupplierGroups.map((group) => `${group.supplierName} ${group.lines.length}项`).join("、")}</small>
	                </div>
	              </div>
	            ) : null}
	            <div className={styles.mobileMaterialCartList}>
              {cartSheetLines.map((line) => {
                const specChips = materialSpecParts(line.material);
                const quantity = Number(line.quantity || 0);
                return (
                  <div className={styles.mobileMaterialCartItem} key={line.materialId}>
                    <span>{materialImageUrl(line.material) ? <Image src={materialImageUrl(line.material)} alt="" fill sizes="48px" unoptimized /> : <Package />}</span>
                    <div>
                      <b>{materialDisplayName(line.material)}</b>
                      {specChips.length ? <p>{specChips.slice(0, 3).map((chip) => <em key={chip}>{chip}</em>)}</p> : null}
                      <small>{quantity > 0 ? quantityText(quantity) : "待填写"} {line.material.unit || ""} × ¥{money(line.material.unit_price)}</small>
                    </div>
                    <div className={styles.mobileMaterialCartControls}>
                      <strong>¥{money(quantity * Number(line.material.unit_price || 0))}</strong>
                      <div className={styles.mobileMaterialCartStepper}>
                        <button type="button" onClick={() => updateMaterialCart(line.materialId, -1)} aria-label="减少"><Minus /></button>
                        <input value={quantity > 0 ? quantityText(quantity) : ""} inputMode="decimal" onChange={(event) => setMaterialCartQuantity(line.materialId, event.target.value)} onBlur={() => finalizeMaterialCartQuantity(line.materialId)} aria-label="数量" />
                        <button type="button" data-add onClick={() => updateMaterialCart(line.materialId, 1)} aria-label="增加"><Plus /></button>
                      </div>
                      <button type="button" className={styles.mobileMaterialCartRemove} onClick={() => setMaterialCartRemoveTargetId(line.materialId)} aria-label="删除材料"><Trash2 /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={styles.mobileMaterialCheckoutSectionTitle}><span>收货信息</span><small>送货到工地</small></div>
            <div className={styles.mobileMaterialReceiveCard}>
              <label><span><UsersRound />收货人</span><input value={materialOrderForm.receiver} onChange={(event) => setMaterialOrderForm((form) => ({ ...form, receiver: event.target.value }))} placeholder="项目经理姓名" /></label>
              <label><span><Phone />联系电话</span><input value={materialOrderForm.phone} onChange={(event) => setMaterialOrderForm((form) => ({ ...form, phone: event.target.value }))} inputMode="tel" placeholder="项目经理电话" /></label>
              <label data-wide><span><MapPin />收货地址</span><textarea value={materialOrderForm.address} onChange={(event) => setMaterialOrderForm((form) => ({ ...form, address: event.target.value }))} placeholder="填写送货到工地的详细地址" /></label>
              <label data-wide><span><FileText />订单备注</span><textarea value={materialOrderForm.notes} onChange={(event) => setMaterialOrderForm((form) => ({ ...form, notes: event.target.value }))} placeholder="例如：送到3栋楼下，提前电话联系" /></label>
            </div>
            {materialOrderMessage ? <div className={styles.mobileMaterialMessage}>{materialOrderMessage}</div> : null}
          </div>
          <footer className={styles.mobileMaterialSheetFooter}>
            <div><small>合计</small><b>¥{money(cartAmount)}</b></div>
            <button type="button" disabled={materialOrderBusy === "submit" || !cartLines.length} onClick={submitMaterialOrder}>
              {materialOrderBusy === "submit" ? <Loader2 className="animate-spin" /> : <CheckCircle />}
              确认下单
            </button>
          </footer>
        </section>
      </div>}

      {materialCartRemoveTarget ? <div className={styles.mobileMaterialCancelBackdrop} role="presentation" onClick={() => setMaterialCartRemoveTargetId("")}>
        <div className={styles.mobileMaterialCancelDialog} role="dialog" aria-modal="true" aria-labelledby="mobile-material-cart-remove-title" onClick={(event) => event.stopPropagation()}>
          <div className={styles.mobileMaterialCartRemoveConfirmIcon}><Trash2 /></div>
          <div className={styles.mobileMaterialCancelHead}>
            <h2 id="mobile-material-cart-remove-title">删除这项材料？</h2>
            <p>删除后会从购物车移除，需要的话可以回到材料列表重新添加。</p>
          </div>
          <div className={styles.mobileMaterialCancelPreview}>
            <span>准备删除</span>
            <b>{materialDisplayName(materialCartRemoveTarget.material)}</b>
            <small>{quantityText(Number(materialCartRemoveTarget.quantity || 0))} {materialCartRemoveTarget.material.unit || ""} × ¥{money(materialCartRemoveTarget.material.unit_price)}</small>
          </div>
          <div className={styles.mobileMaterialCancelActions}>
            <button type="button" onClick={() => setMaterialCartRemoveTargetId("")}>取消</button>
            <button type="button" data-danger onClick={() => { removeMaterialFromCart(materialCartRemoveTarget.materialId); setMaterialCartRemoveTargetId(""); }}>
              <Trash2 />
              确认删除
            </button>
          </div>
        </div>
      </div> : null}

      {materialSheetMode === "order" && selectedMaterialOrder && <div className={styles.mobileMaterialSheetBackdrop} role="presentation" onClick={() => !materialOrderBusy && setMaterialSheetMode(null)}>
        <section className={styles.mobileMaterialSheet} data-expanded={materialOrderSheetExpanded || undefined} role="dialog" aria-modal="true" aria-label="材料订单详情" onClick={(event) => event.stopPropagation()}>
          <header className={styles.mobileMaterialSheetHeader}>
            <div><b>{selectedMaterialOrder.order_no || "材料订单"}</b><small>{selectedMaterialOrder.supplier_name || "供应方未设置"} · {materialOrderTimeText(selectedMaterialOrder)}</small></div>
            <div className={styles.mobileMaterialSheetActions}>
              <button type="button" onClick={() => setMaterialOrderSheetExpanded((expanded) => !expanded)} aria-label={materialOrderSheetExpanded ? "缩小订单详情" : "全屏查看订单详情"}>
                {materialOrderSheetExpanded ? <Minimize2 /> : <Maximize2 />}
              </button>
              <button type="button" onClick={() => setMaterialSheetMode(null)} aria-label="关闭"><X /></button>
            </div>
          </header>
          <div className={styles.mobileMaterialSheetBody}>
            <section className={styles.mobileMaterialOrderSummaryCard}>
              <div className={styles.mobileMaterialOrderSummaryTop}>
                <div>
                  <span data-status={String(selectedMaterialOrder.status || "")}>{orderStatusLabels[String(selectedMaterialOrder.status || "")] || selectedMaterialOrder.status || "订单"}</span>
                </div>
                <strong>¥{money(selectedMaterialOrder.total_amount)}</strong>
              </div>
              <div className={styles.mobileMaterialOrderFacts}>
                <span><small>商品数量</small><b>{Number(selectedMaterialOrder.item_count || 0)} 项</b></span>
                <span><small>到货进度</small><b>{materialOrderProgress(selectedMaterialOrder)}%</b></span>
              </div>
            </section>
            <section className={styles.mobileMaterialDetailSection} data-expanded={materialItemsExpanded || undefined}>
              <div className={styles.mobileMaterialDetailSectionHead}>
                <span><Package />商品明细</span>
                <small>{selectedMaterialOrderItems.length} 项</small>
              </div>
              <div className={styles.mobileMaterialDetailItems} data-expanded={materialItemsExpanded || undefined}>
              {visibleSelectedMaterialOrderItems.map((item) => {
                const specChips = materialSpecParts(item);
                const receivedQuantity = materialOrderItemReceivedQuantity(item, selectedMaterialOrder);
                return (
                  <div className={styles.mobileMaterialDetailItem} key={item.id}>
                    <span>{materialImageUrl(item) ? <Image src={materialImageUrl(item)} alt="" fill sizes="48px" unoptimized /> : <Package />}</span>
                    <div>
                      <b>{materialItemDisplayName(item)}</b>
                      <p>
                        {(specChips.length ? specChips : [item.category_name || "规格未设置"]).map((chip, chipIndex) => (
                          <small key={`${chip}-${chipIndex}`}>{chip}</small>
                        ))}
                        <em>已到 {quantityText(receivedQuantity)} / {quantityText(item.quantity)} {item.material_unit || ""}</em>
                      </p>
                    </div>
                    <strong>¥{money(item.total_price)}</strong>
                  </div>
                );
              })}
              </div>
              {selectedMaterialOrderItems.length > MATERIAL_ORDER_PREVIEW_ITEM_COUNT ? (
                <button
                  type="button"
                  className={styles.mobileMaterialDetailMore}
                  onClick={() => {
                    const nextExpanded = !materialItemsExpanded;
                    setMaterialItemsExpanded(nextExpanded);
                    if (nextExpanded) setMaterialOrderSheetExpanded(true);
                  }}
                >
                  <ChevronDown />
                  <span>{materialItemsExpanded ? "收起" : `展开全部 ${selectedMaterialOrderItems.length} 项`}</span>
                  <i aria-hidden="true" />
                </button>
              ) : null}
            </section>
            {selectedMaterialOrder.notes ? <section className={styles.mobileMaterialDetailSection}>
              <div className={styles.mobileMaterialDetailSectionHead}>
                <span><FileText />收货信息</span>
              </div>
              <div className={styles.mobileMaterialOrderNotes}>{selectedMaterialOrder.notes}</div>
            </section> : null}
            {materialOrderMessage ? <div className={styles.mobileMaterialMessage}>{materialOrderMessage}</div> : null}
          </div>
	          <footer className={styles.mobileMaterialSheetFooter}>
	            <div><small>订单状态</small><b>{orderStatusLabels[String(selectedMaterialOrder.status || "")] || selectedMaterialOrder.status || "-"}</b></div>
	            <button type="button" data-secondary disabled={Boolean(materialOrderBusy)} onClick={() => repeatMaterialOrder(selectedMaterialOrder)}>
	              <ShoppingCart />
	              再来一单
	            </button>
	            {String(selectedMaterialOrder.status || "") !== "CANCELLED" && String(selectedMaterialOrder.status || "") !== "RECEIVED" ? (
	              <button type="button" data-danger disabled={Boolean(materialOrderBusy)} onClick={() => requestCancelMaterialOrder(selectedMaterialOrder)}>
	                {materialOrderBusy === `return:${selectedMaterialOrder.id}` ? <Loader2 className="animate-spin" /> : null}
                {materialOrderCancelActionText(selectedMaterialOrder)}
              </button>
            ) : <button type="button" onClick={() => setMaterialSheetMode(null)}>知道了</button>}
          </footer>
        </section>
      </div>}

      {materialTemplatePickerOpen ? <div className={styles.mobileMaterialTemplatePickerBackdrop} role="presentation" onClick={() => setMaterialTemplatePickerOpen(false)}>
        <div className={styles.mobileMaterialTemplatePicker} role="dialog" aria-modal="true" aria-labelledby="mobile-material-template-picker-title" onClick={(event) => event.stopPropagation()}>
          <div className={styles.mobileMaterialTemplatePickerHandle} />
          <header>
            <div>
              <h2 id="mobile-material-template-picker-title">快速下单模板</h2>
              <p>选一套常用材料，快速放进购物车</p>
            </div>
            <button type="button" onClick={() => setMaterialTemplatePickerOpen(false)} aria-label="关闭快速下单模板"><X /></button>
          </header>
          <div className={styles.mobileMaterialTemplatePickerList}>
            {materialOrderTemplates.map((template) => (
              <button type="button" key={template.id} onClick={() => { setMaterialTemplatePickerOpen(false); setMaterialTemplateConfirm(template); }}>
                <span><ClipboardList /></span>
                <div>
                  <b>{template.name || "下单模板"}</b>
                  <small>{Number(template.itemCount || template.items?.length || 0)} 项材料，点击后再确认加入</small>
                </div>
                <ChevronRight />
              </button>
            ))}
          </div>
        </div>
      </div> : null}

      {materialTemplateConfirm ? <div className={styles.mobileMaterialCancelBackdrop} role="presentation" onClick={() => setMaterialTemplateConfirm(null)}>
        <div className={`${styles.mobileMaterialCancelDialog} ${styles.mobileMaterialTemplateConfirmDialog}`} role="dialog" aria-modal="true" aria-labelledby="mobile-material-template-title" onClick={(event) => event.stopPropagation()}>
          <div className={styles.mobileMaterialTemplateConfirmIcon}><ClipboardList /></div>
          <div className={styles.mobileMaterialCancelHead}>
            <h2 id="mobile-material-template-title">加入快速下单模板</h2>
            <p>这是提前整理好的常用材料，方便项目经理快速下单。点确认后会先放进购物车，下单前还可以删材料、改数量。</p>
          </div>
          <div className={styles.mobileMaterialCancelPreview}>
            <span>准备加入购物车</span>
            <b>{materialTemplateConfirm.name || "下单模板"}</b>
            <small>共 {Number(materialTemplateConfirm.itemCount || materialTemplateConfirm.items?.length || 0)} 项材料，购物车里已有的不会重复添加。</small>
          </div>
          <div className={styles.mobileMaterialCancelActions}>
            <button type="button" onClick={() => setMaterialTemplateConfirm(null)}>先不使用</button>
            <button type="button" data-primary onClick={() => { applyMaterialOrderTemplate(materialTemplateConfirm); setMaterialTemplateConfirm(null); }}>
              <ShoppingCart />
              确认加入
            </button>
          </div>
        </div>
      </div> : null}

      {materialCancelOrder ? <div className={styles.mobileMaterialCancelBackdrop} role="presentation" onClick={() => !materialOrderBusy && setMaterialCancelOrder(null)}>
        <div className={styles.mobileMaterialCancelDialog} role="dialog" aria-modal="true" aria-labelledby="mobile-material-cancel-title" onClick={(event) => event.stopPropagation()}>
          <div className={styles.mobileMaterialCancelIcon}><AlertTriangle /></div>
          <div className={styles.mobileMaterialCancelHead}>
            <h2 id="mobile-material-cancel-title">{materialOrderCancelActionText(materialCancelOrder)}</h2>
            <p>确认后订单会变为已取消，电脑端材料订单列表也会同步更新。</p>
          </div>
          <div className={styles.mobileMaterialCancelPreview}>
            <span>订单编号</span>
            <b>{materialCancelOrder.order_no || "材料订单"}</b>
            <small>{materialCancelOrder.supplier_name || "供应方未设置"} · ¥{money(materialCancelOrder.total_amount)}</small>
          </div>
          {materialOrderMessage ? <div className={styles.mobileMaterialCancelMessage}>{materialOrderMessage}</div> : null}
          <div className={styles.mobileMaterialCancelActions}>
            <button type="button" disabled={Boolean(materialOrderBusy)} onClick={() => setMaterialCancelOrder(null)}>先不操作</button>
            <button type="button" data-danger disabled={Boolean(materialOrderBusy)} onClick={() => returnMaterialOrder(materialCancelOrder)}>
              {materialOrderBusy === `return:${materialCancelOrder.id}` ? <Loader2 className="animate-spin" /> : <AlertTriangle />}
              确认{materialOrderCancelActionText(materialCancelOrder).replace("订单", "")}
            </button>
          </div>
        </div>
      </div> : null}

      {phaseNodeSheet && selectedPhaseGroup && selectedPhaseNode && <div className={styles.mobilePhaseSheetBackdrop} role="presentation" onClick={() => !phaseActionBusy && setPhaseNodeSheet(null)}>
        <section className={styles.mobilePhaseSheet} role="dialog" aria-modal="true" aria-label={selectedPhaseNode.name || "节点操作"} onClick={(event) => event.stopPropagation()}>
          <header className={styles.mobilePhaseSheetHeader}>
            <div>
              <b>{selectedPhaseNode.name || "施工节点"}</b>
              <small>{selectedPhaseGroup.name} · {nodeTypeOf(selectedPhaseNode) === "acceptance" ? "验收节点" : "施工节点"} · {nodeStatusLabel(selectedPhaseNode)}</small>
            </div>
            <button type="button" onClick={() => setPhaseNodeSheet(null)} aria-label="关闭"><X /></button>
          </header>
          {phaseNodeSheet.mode === "standard" && <div className={styles.mobilePhaseSheetBody}>
            <div className={styles.mobilePhaseStandardCard}>
              <span><ClipboardCheck /></span>
              <div>
                <b>{nodeTypeOf(selectedPhaseNode) === "acceptance" ? "验收标准" : "施工标准"}</b>
                <p>{selectedPhaseNode.description || selectedPhaseNode.acceptance || "该节点暂未配置标准说明"}</p>
              </div>
            </div>
            <div className={styles.mobilePhaseFactGrid}>
              <span><small>图片要求</small><b>{selectedPhaseNode.photo_required || selectedPhaseNode.photoRequired ? "要求上传" : "非必传"}</b></span>
              <span><small>客户确认</small><b>{selectedPhaseNode.customer_confirm_required ? "需要" : "不需要"}</b></span>
              <span><small>项目经理确认</small><b>{selectedPhaseNode.pm_confirm_required ? "需要" : "不需要"}</b></span>
              <span><small>计划时间</small><b>{dateText(selectedPhaseNode.planned_start)} - {dateText(selectedPhaseNode.planned_end)}</b></span>
            </div>
          </div>}
          {phaseNodeSheet.mode === "records" && <div className={styles.mobilePhaseSheetBody}>
            <div className={styles.mobilePhaseRecordSummary}>
              <span><b>{selectedNodeLogs.length}</b><small>日志</small></span>
              <span><b>{selectedNodePhotos.length}</b><small>图片</small></span>
            </div>
            {selectedNodeLogs.length ? selectedNodeLogs.map((log) => (
              <article className={styles.mobilePhaseLogItem} key={log.id}>
                <b>{dateText(log.log_date || log.created_at, true)} · {log.author_name || "记录人"}</b>
                <p>{log.completed_work || log.content || "已上传现场记录"}</p>
                {log.next_plan ? <small>明日计划：{log.next_plan}</small> : null}
              </article>
            )) : <Empty text="该节点暂无施工记录" />}
          </div>}
          {phaseNodeSheet.mode === "photos" && <div className={styles.mobilePhaseSheetBody}>
            <label className={styles.mobilePhaseUploadBox}>
              <input type="file" accept="image/*" hidden disabled={Boolean(phaseActionBusy)} onChange={(event) => { void uploadPhaseNodePhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              {phaseActionBusy === "photo" ? <Loader2 className="animate-spin" /> : <Upload />}
              <b>上传节点图片</b>
              <small>用于现场节点留痕，上传后归档到当前节点</small>
            </label>
            {selectedNodePhotos.length ? <div className={styles.mobilePhasePhotoGrid}>{selectedNodePhotos.map((photo, index) => {
              const url = photo.file_url || photo.url;
              return url ? <a href={url} target="_blank" rel="noreferrer" key={photo.id || url || index}><Image src={url} alt="" fill sizes="90px" unoptimized /></a> : null;
            })}</div> : <Empty text="该节点暂无图片" />}
          </div>}
          {phaseNodeSheet.mode === "log" && <div className={styles.mobilePhaseSheetBody}>
            <label className={styles.mobilePhaseFormField}><span>今日完成</span><textarea value={phaseLogForm.completed_work} onChange={(event) => setPhaseLogForm((form) => ({ ...form, completed_work: event.target.value }))} placeholder="填写当前节点今日完成事项" /></label>
            <label className={styles.mobilePhaseFormField}><span>明日计划</span><textarea value={phaseLogForm.next_plan} onChange={(event) => setPhaseLogForm((form) => ({ ...form, next_plan: event.target.value }))} placeholder="选填明日计划" /></label>
            <button type="button" className={styles.mobilePhasePrimaryAction} disabled={Boolean(phaseActionBusy)} onClick={submitPhaseLog}>{phaseActionBusy === "log" ? <Loader2 className="animate-spin" /> : <MessageCircle />}发布日志</button>
          </div>}
          {phaseNodeSheet.mode === "issue" && <div className={styles.mobilePhaseSheetBody}>
            <label className={styles.mobilePhaseFormField}><span>整改问题</span><textarea value={phaseIssueTitle} onChange={(event) => setPhaseIssueTitle(event.target.value)} placeholder="描述需要整改的问题" /></label>
            <button type="button" className={styles.mobilePhasePrimaryAction} disabled={Boolean(phaseActionBusy)} onClick={submitPhaseIssue}>{phaseActionBusy === "issue" ? <Loader2 className="animate-spin" /> : <AlertTriangle />}登记整改</button>
          </div>}
          {phaseNodeSheet.mode === "acceptance" && <div className={styles.mobilePhaseSheetBody}>
            <p className={styles.mobilePhaseAcceptanceHint}>请根据现场验收结果选择。全部通过或无需验收会显示已验收，验收不通过会显示验收不通过。</p>
            <div className={styles.mobilePhaseAcceptanceActions}>
              <button type="button" data-tone="pass" disabled={Boolean(phaseActionBusy)} onClick={() => updateMobilePhaseNodeStatus(selectedPhaseGroup, selectedPhaseNode, "COMPLETED")}><CheckCircle />验收通过</button>
              <button type="button" data-tone="fail" disabled={Boolean(phaseActionBusy)} onClick={() => updateMobilePhaseNodeStatus(selectedPhaseGroup, selectedPhaseNode, "REVIEW")}><AlertTriangle />验收不通过</button>
              <button type="button" data-tone="skip" disabled={Boolean(phaseActionBusy)} onClick={() => updateMobilePhaseNodeStatus(selectedPhaseGroup, selectedPhaseNode, "COMPLETED")}><ShieldCheck />无需验收</button>
            </div>
          </div>}
          {phaseActionMessage ? <div className={styles.mobilePhaseSheetMessage}>{phaseActionMessage}</div> : null}
        </section>
      </div>}

      {addNodeGroup && <div className={styles.mobilePhaseSheetBackdrop} role="presentation" onClick={() => !phaseActionBusy && setAddNodeGroupId("")}>
        <section className={styles.mobilePhaseSheet} role="dialog" aria-modal="true" aria-label="新增施工节点" onClick={(event) => event.stopPropagation()}>
          <header className={styles.mobilePhaseSheetHeader}>
            <div><b>新增节点</b><small>{addNodeGroup.name}</small></div>
            <button type="button" onClick={() => setAddNodeGroupId("")} aria-label="关闭"><X /></button>
          </header>
          <div className={styles.mobilePhaseSheetBody}>
            <div className={styles.mobilePhaseTypeSwitch}>
              <button type="button" data-active={addNodeForm.nodeType === "construction" || undefined} onClick={() => setAddNodeForm((form) => ({ ...form, nodeType: "construction" }))}>施工节点</button>
              <button type="button" data-active={addNodeForm.nodeType === "acceptance" || undefined} onClick={() => setAddNodeForm((form) => ({ ...form, nodeType: "acceptance" }))}>验收节点</button>
            </div>
            <label className={styles.mobilePhaseFormField}><span>节点名称</span><input value={addNodeForm.name} onChange={(event) => setAddNodeForm((form) => ({ ...form, name: event.target.value }))} placeholder="例如：厨房防水验收" /></label>
            <label className={styles.mobilePhaseFormField}><span>说明</span><textarea value={addNodeForm.description} onChange={(event) => setAddNodeForm((form) => ({ ...form, description: event.target.value }))} placeholder="选填施工或验收说明" /></label>
            <div className={styles.mobilePhaseDateGrid}>
              <label className={styles.mobilePhaseFormField}><span>计划开始</span><input type="date" value={addNodeForm.plannedStart} onChange={(event) => setAddNodeForm((form) => ({ ...form, plannedStart: event.target.value }))} /></label>
              <label className={styles.mobilePhaseFormField}><span>计划结束</span><input type="date" value={addNodeForm.plannedEnd} onChange={(event) => setAddNodeForm((form) => ({ ...form, plannedEnd: event.target.value }))} /></label>
            </div>
            <button type="button" className={styles.mobilePhasePrimaryAction} disabled={Boolean(phaseActionBusy)} onClick={submitAddPhaseNode}>{phaseActionBusy === "add-node" ? <Loader2 className="animate-spin" /> : <Plus />}确认新增</button>
            {phaseActionMessage ? <div className={styles.mobilePhaseSheetMessage}>{phaseActionMessage}</div> : null}
          </div>
        </section>
      </div>}

      {confirmStartOpen && <div className={styles.mobileSiteStartModalBackdrop} role="presentation" onClick={() => !siteActionBusy && setConfirmStartOpen(false)}>
        <div className={styles.mobileSiteStartModal} role="dialog" aria-modal="true" aria-labelledby="mobile-site-start-title" onClick={(event) => event.stopPropagation()}>
          <div className={styles.mobileSiteStartModalIcon}><AlertTriangle /></div>
          <div className={styles.mobileSiteStartModalHead}>
            <h2 id="mobile-site-start-title">确认开工</h2>
            <p>确认后，开工交底、施工模板和计划时间将锁定，无法再次修改。请确认以下信息无误。</p>
          </div>
          <div className={styles.mobileSiteStartModalFacts}>
            {startActionFacts.map((item) => (
              <span key={item.label}>
                <small>{item.label}</small>
                <b>{item.value}</b>
              </span>
            ))}
          </div>
          {siteActionMessage ? <div className={styles.mobileSiteStartModalMessage}>{siteActionMessage}</div> : null}
          <div className={styles.mobileSiteStartModalActions}>
            <button type="button" disabled={Boolean(siteActionBusy)} onClick={() => setConfirmStartOpen(false)}>取消</button>
            <button type="button" disabled={Boolean(siteActionBusy)} onClick={() => submitSiteStartAction("confirm_site_start")}>
              {siteActionBusy === "confirm" ? <Loader2 className="animate-spin" /> : <CheckCircle />}
              确认开工
            </button>
          </div>
        </div>
      </div>}
    </div>
  );
}

export default function MobileSiteDetailPage() {
  return (
    <Suspense fallback={<div className={styles.mobilePage}><div className={styles.mobileLoading}>正在加载工地</div></div>}>
      <MobileSiteDetailPageContent />
    </Suspense>
  );
}
