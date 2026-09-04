"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BookmarkPlus, Check, ChevronLeft, ChevronRight, Copy, Eraser, FileText, GripVertical, Home, LayoutGrid, List, Loader2, MapPin, Maximize2, Minimize2, Palette, Pencil, Phone, Plus, Replace, Ruler, Search, Tags, Trash2, X } from "lucide-react";
import {
  calculateChargeableOtherFeeTotals,
  calculateOtherFeeDetails,
  calculateOtherFeeTotal,
  feeCalcMethodLabels,
  getFeeFormulaText,
  getFeeRuleText,
  getLegacyManagementFeeRate,
  normalizeFeeCalcBase,
  normalizeFeeCalcMethod,
  toMoney,
  toNumber,
  type FeeCalcBase,
  type FeeCalcMethod,
  type FeeFormulaContext,
} from "@/lib/quotationFeeFormulas";
import { getQuotationRowColor, quotationRowColors } from "@/lib/quotationRowColors";
import { formatAlphaSequence } from "@/lib/quotationSequence";
import { calculatePackageQuotePrice, type PackageQuoteConfigInput, type PackagePriceResult } from "@/lib/quotaTemplatePricing";
import { cn } from "@/lib/utils";
const QuotationPrintDocument = dynamic(() => import("@/components/QuotationPrintDocument").then((m) => m.QuotationPrintDocument), {
  ssr: false,
  loading: () => <div className="flex min-h-[300px] items-center justify-center text-sm text-surface-400">打印文档加载中...</div>,
});
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";
import NativeImage from "@/components/ui/NativeImage";
import { AmapLocationPicker, type LocationPick } from "@/components/ui/AddCustomerModal";
import { createQuotationShareUrl } from "@/lib/quotationShareClient";
import { parseProductAttributes } from "@/app/materials/library/material-editor-shared";
import {
  FeeFormulaHelp,
  QuoteNameDialogModal,
  QuoteNameDialogState,
  QuoteSystemDialogModal,
  QuoteSystemDialogState,
} from "./quotation-dialogs";

import {
  DictionaryOption,
  QuotationItem,
  formatQuoteAmount,
  getCategoryKey,
  isBaseCategory,
  isCustomCabinetCategory,
  isDirectItemCategory,
  isMainMaterialCategory,
  isOtherCategory,
  normalizeCategoryName,
  sameQuoteCategory,
} from "./quotation-shared";
import {
  AttributionDialog,
  NumberField,
  PackagePricingMetric,
} from "./quotation-display";



type QuotaLibraryItem = {
  id: string;
  code: string;
  source?: "standard" | "custom";
  scope: string;
  storeName?: string;
  category: string;
  workTypeId?: string;
  workTypeName?: string;
  materialCategoryId?: string;
  materialCategoryName?: string;
  name: string;
  constructionDescription: string;
  unit: string;
  laborPrice: number;
  materialPrice: number;
  internalLaborCost?: number;
  internalMaterialCost?: number;
  costLossRate?: number;
  totalPrice: number;
  isSpecialPrice: boolean;
  status: "enabled" | "disabled" | "promoted";
  updatedAt: string;
};

type ProductLibrarySku = {
  id: string;
  sku_code?: string | null;
  sku_name?: string | null;
  spec?: string | null;
  color?: string | null;
  attributes?: string | null;
  unit?: string | null;
  unit_price?: number | null;
  market_price?: number | null;
  cost_price?: number | null;
  internal_control_price?: number | null;
  stock?: number | null;
  min_stock?: number | null;
  image?: string | null;
  is_active?: number | boolean | null;
};

type ProductLibraryItem = {
  id: string;
  code?: string | null;
  name: string;
  brand?: string | null;
  product_name?: string | null;
  material_model?: string | null;
  spec?: string | null;
  color?: string | null;
  unit?: string | null;
  unit_price?: number | null;
  market_price?: number | null;
  cost_price?: number | null;
  internal_control_price?: number | null;
  product_attributes?: string | null;
  supplier_name?: string | null;
  stock?: number | null;
  min_stock?: number | null;
  image?: string | null;
  images?: string[] | string | null;
  category_id?: string | null;
  category_name?: string | null;
  material_type?: string | null;
  is_active?: number | boolean | null;
  is_special_price?: number | boolean | null;
  skus?: ProductLibrarySku[];
};

type ProductLibraryPick = {
  id: string;
  materialId: string;
  skuId?: string;
  code?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  productName: string;
  brand?: string | null;
  materialModel?: string | null;
  skuName?: string | null;
  spec?: string | null;
  color?: string | null;
  unit?: string | null;
  image?: string | null;
  marketPrice: number;
  customerPrice: number;
  purchasePrice: number;
  internalControlPrice: number;
  isSpecialPrice?: boolean;
  skuCount: number;
  supplierName?: string | null;
  stock: number;
  minStock: number;
  productAttributes?: string | null;
  skuAttributes?: string | null;
};

type ItemDropPosition = "before" | "after";

type DragOverItemState = {
  index: number;
  position: ItemDropPosition;
} | null;

type PointerItemDragState = {
  sourceIndex: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  moved: boolean;
  targetIndex: number | null;
  position: ItemDropPosition;
  scrollContainer: HTMLElement;
} | null;

type QuoteEditableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLDivElement;
type RowMenuOpenHandler = (event: MouseEvent<HTMLElement>, index: number) => void;
type CopySpaceCategoryDialogState = {
  source: string;
  target: string;
  categories: string[];
};
type FindReplaceSearchScope = "name" | "description";
type FindReplaceMatchField = "name" | "spec" | "remark";
type FindReplaceMatch = {
  itemIndex: number;
  field: FindReplaceMatchField;
  start: number;
};
type FindReplaceActiveHighlight = FindReplaceMatch & {
  itemKey: string;
  length: number;
};
type QuoteProjectInfoForm = {
  customerName: string;
  designerName: string;
  customerPhone: string;
  customerWeixin: string;
  customerAddress: string;
  houseAddress: string;
  addressLocationName: string;
  addressLocationAddress: string;
  addressLatitude: string;
  addressLongitude: string;
  buildingNo: string;
  unitNo: string;
  roomNo: string;
  noRoomNumber: boolean;
  areaSize: string;
  decorationType: string;
  notes: string;
  customerVisibleNote: string;
};

function normalizeProjectInfoPhone(value: unknown) {
  const phone = String(value || "").trim();
  if (phone === "仅微信联系") return "";
  return phone.replace(/\D/g, "").slice(0, 11);
}

function getFindReplaceTargets(item: QuotationItem, scopes: FindReplaceSearchScope[]) {
  const targets: { field: FindReplaceMatchField; value: string }[] = [];
  if (scopes.includes("name")) targets.push({ field: "name", value: String(item.name || "") });
  if (scopes.includes("description")) {
    if (isBaseCategory(item.category)) {
      targets.push({ field: "spec", value: String(item.spec || "") });
    } else if (!isOtherCategory(item.category)) {
      targets.push({ field: "remark", value: String(item.remark || "") });
    }
  }
  return targets;
}

function buildFindReplaceMatches(rows: { item: QuotationItem; index: number }[], keyword: string, scopes: FindReplaceSearchScope[]) {
  const needle = keyword.trim();
  if (!needle || scopes.length === 0) return [];
  const matches: FindReplaceMatch[] = [];
  rows.forEach(({ item, index }) => {
    getFindReplaceTargets(item, scopes).forEach(({ field, value }) => {
      let start = value.indexOf(needle);
      while (start !== -1) {
        matches.push({ itemIndex: index, field, start });
        start = value.indexOf(needle, start + needle.length);
      }
    });
  });
  return matches;
}

function replaceTextAt(value: string, keyword: string, replacement: string, start: number) {
  return `${value.slice(0, start)}${replacement}${value.slice(start + keyword.length)}`;
}

function getFindReplaceFieldLabel(field: FindReplaceMatchField) {
  if (field === "name") return "工程项目";
  return "施工工艺及材料说明";
}

function getFindReplaceMatchValue(item: QuotationItem | undefined, field: FindReplaceMatchField) {
  if (!item) return "";
  return String(item[field] || "");
}

function getFindReplaceExcerpt(value: string, keyword: string, start: number) {
  const safeStart = Math.max(0, start);
  const context = 18;
  const prefixStart = Math.max(0, safeStart - context);
  const suffixEnd = Math.min(value.length, safeStart + keyword.length + context);
  return {
    prefix: `${prefixStart > 0 ? "..." : ""}${value.slice(prefixStart, safeStart)}`,
    hit: value.slice(safeStart, safeStart + keyword.length),
    suffix: `${value.slice(safeStart + keyword.length, suffixEnd)}${suffixEnd < value.length ? "..." : ""}`,
  };
}

function renderFindReplaceHighlightedText(value: string, highlight?: Pick<FindReplaceActiveHighlight, "start" | "length"> | null) {
  if (!highlight || highlight.length <= 0) return value;
  const start = Math.max(0, Math.min(value.length, highlight.start));
  const end = Math.max(start, Math.min(value.length, start + highlight.length));
  if (start === end) return value;
  return (
    <>
      {value.slice(0, start)}
      <mark className="quote-find-replace-text-hit">{value.slice(start, end)}</mark>
      {value.slice(end)}
    </>
  );
}

const quoteDecorationTypeOptions = ["清包", "半包", "全包"];

const itemDragAutoScrollEdge = 96;
const itemDragAutoScrollMaxSpeed = 1200;

function getItemDragScrollContainer(element: HTMLElement) {
  let current = element.parentElement;
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight + 1) {
      return current;
    }
    current = current.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) || document.documentElement;
}

function getItemDragScrollBounds(container: HTMLElement) {
  const isDocumentScroller = container === document.scrollingElement || container === document.documentElement || container === document.body;
  const rect = isDocumentScroller ? null : container.getBoundingClientRect();
  let top = rect ? Math.max(0, rect.top) : 0;
  const bottom = rect ? Math.min(window.innerHeight, rect.bottom) : window.innerHeight;
  const quotationShell = container.querySelector<HTMLElement>(".quotation-detail-ui");

  quotationShell?.querySelectorAll<HTMLElement>(".quote-command-bar, .screen-quote-sections > .quote-space-navigation").forEach((element) => {
    if (window.getComputedStyle(element).position !== "sticky") return;
    const stickyRect = element.getBoundingClientRect();
    if (stickyRect.bottom > top && stickyRect.top < bottom) top = Math.min(bottom, Math.max(top, stickyRect.bottom));
  });

  return { top, bottom };
}

function getItemDragAutoScrollVelocity(clientY: number, top: number, bottom: number) {
  if (bottom <= top) return 0;
  if (clientY < top + itemDragAutoScrollEdge) {
    const intensity = Math.min(1, Math.max(0, (top + itemDragAutoScrollEdge - clientY) / itemDragAutoScrollEdge));
    return -itemDragAutoScrollMaxSpeed * intensity * intensity;
  }
  if (clientY > bottom - itemDragAutoScrollEdge) {
    const intensity = Math.min(1, Math.max(0, (clientY - (bottom - itemDragAutoScrollEdge)) / itemDragAutoScrollEdge));
    return itemDragAutoScrollMaxSpeed * intensity * intensity;
  }
  return 0;
}

type QuotationDetail = {
  id: string;
  customer_id?: string;
  project_id?: string;
  is_unbound?: number | boolean;
  title?: string;
  project_name?: string;
  project_address?: string;
  project_area?: number;
  customer_name?: string;
  customer_phone?: string;
  customer_weixin?: string;
  customer_address?: string;
  customer_house_address?: string;
  customer_address_location_name?: string;
  customer_address_location_address?: string;
  customer_address_latitude?: number;
  customer_address_longitude?: number;
  customer_building_no?: string;
  customer_unit_no?: string;
  customer_room_no?: string;
  customer_no_room_number?: number;
  customer_area_size?: number;
  customer_decoration_type?: string;
  designer_name?: string;
  version?: number;
  status?: string;
  notes?: string;
  customer_visible_note?: string | null;
  terms?: string;
  settings?: {
    managementFeeRate?: number;
    taxRate?: number;
	    discount?: number;
	    discountType?: "fee" | "space" | "work_type";
	    discountMode?: "amount" | "rate";
	    discountRate?: number;
	    discountScope?: string;
	    discountSpace?: string;
	    discountWorkType?: string;
	    excludeSpecificDiscountAmount?: number;
	    excludeSpecialDiscountItems?: boolean;
	    excludeLaborOnlyDiscountItems?: boolean;
	    warrantyMonths?: number;
    appendixNote?: string | null;
    quoteSpaces?: string[];
    quoteCategories?: string[];
    templatePricing?: Record<string, unknown>;
    signatureLabels?: string[];
  };
  items: QuotationItem[];
  legacyManagementFeeMigrated?: boolean;
  readonly?: boolean;
};

type PackagePricingSegment = {
  startArea: number;
  endArea: number;
  chargedArea: number;
  unitPrice: number;
  amount: number;
};

type PackagePricingSummary = {
  area: number;
  includedArea: number;
  packageAmount: number;
  extraArea: number;
  extraAmount: number;
  totalAmount: number;
  segments: PackagePricingSegment[];
};

const builtInCategoryLabels: Record<string, string> = {
  base: "基装",
  main_material: "产品",
  custom_cabinet: "定制柜",
  other: "综合费用",
};

const builtInDirectCategories = ["base", "main_material", "custom_cabinet"];
const defaultQuoteCategories = [...builtInDirectCategories, "other"];
const noQuoteCategoryValue = "__NO_CATEGORY__";
const quoteCategoryCreateOptions = [
  { value: "base", label: "基装" },
  { value: "main_material", label: "产品" },
  { value: "custom_cabinet", label: "定制柜" },
] as const;
const allSpacesValue = "__ALL_SPACES__";
const defaultQuoteSpaces: string[] = [];
const quotaLibraryStorageKey = "zxgj_quota_library_items";
let clientItemKeySeed = 0;

function formatProjectInfoArea(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("zxgj_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getCategoryLabel(category: string) {
  return builtInCategoryLabels[getCategoryKey(category)] || category;
}


function isPackagePricingCategory(category: unknown) {
  const name = normalizeCategoryName(category);
  return name === "package_price" || name === "一口价";
}

function orderQuoteCategories(categories: string[]) {
  const normalized: string[] = [];
  const seenKeys = new Set<string>();
  categories.map((category) => String(category || "").trim()).filter(Boolean).forEach((category) => {
    const key = getCategoryKey(category);
    if (key !== "base" && key !== "main_material" && key !== "custom_cabinet" && key !== "other") return;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    normalized.push(key);
  });
  const directBuiltIns = builtInDirectCategories.filter((category) => normalized.some((item) => sameQuoteCategory(item, category)));
  return [...directBuiltIns, "other"];
}

function getQuoteCategoriesForItems(categories: string[], items: Pick<QuotationItem, "category">[]) {
  const itemCategorySet = new Set(items.map((item) => String(item.category || "").trim()).filter(Boolean));
  return orderQuoteCategories([...defaultQuoteCategories, ...categories, ...Array.from(itemCategorySet)]);
}

function formatQuoteArea(value: number, fractionDigits = 2) {
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(toNumber(value));
}

function sanitizeQuoteAreaInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const firstDotIndex = cleaned.indexOf(".");
  const hasDecimal = firstDotIndex >= 0;
  const integerRaw = hasDecimal ? cleaned.slice(0, firstDotIndex) : cleaned;
  const decimalRaw = hasDecimal ? cleaned.slice(firstDotIndex + 1).replace(/\./g, "") : "";
  const integer = integerRaw.replace(/^0+(?=\d)/, "") || "0";
  return hasDecimal ? `${integer}.${decimalRaw}` : integer;
}

function normalizeQuotaLibraryItem(value: unknown): QuotaLibraryItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const laborPrice = toNumber(raw.laborPrice);
  const materialPrice = toNumber(raw.materialPrice);
  const internalLaborCost = toNumber(raw.internalLaborCost ?? raw.costLaborPrice ?? raw.cost_labor_unit);
  const internalMaterialCost = toNumber(raw.internalMaterialCost ?? raw.costMaterialPrice ?? raw.cost_material_unit);
  const costLossRate = toNumber(raw.costLossRate ?? raw.cost_loss_rate);
  const rawTotalPrice = Number(raw.totalPrice);
  const totalPrice = Number.isFinite(rawTotalPrice) ? Math.max(0, rawTotalPrice) : laborPrice + materialPrice;
  const name = String(raw.name || "").trim();
  if (!name) return null;
  return {
    id: String(raw.id || `quota-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    code: String(raw.code || "").trim(),
    source: raw.source === "custom" ? "custom" : "standard",
    scope: String(raw.scope || "").trim(),
    storeName: String(raw.storeName || raw.store_name || raw.scope || "").trim(),
    category: String(raw.category || "未分类").trim() || "未分类",
    workTypeId: String(raw.workTypeId || raw.work_type_id || "").trim(),
    workTypeName: String(raw.workTypeName || raw.work_type_name || "").trim(),
    materialCategoryId: String(raw.materialCategoryId || raw.material_category_id || "").trim(),
    materialCategoryName: String(raw.materialCategoryName || raw.material_category_name || "").trim(),
    name,
    constructionDescription: String(raw.constructionDescription || "").trim(),
    unit: String(raw.unit || "").trim(),
    laborPrice: Math.max(0, laborPrice),
    materialPrice: Math.max(0, materialPrice),
    internalLaborCost: Math.max(0, internalLaborCost),
    internalMaterialCost: Math.max(0, internalMaterialCost),
    costLossRate: Math.max(0, costLossRate),
    totalPrice: Math.max(0, totalPrice),
    isSpecialPrice: Boolean(raw.isSpecialPrice),
    status: raw.status === "disabled" ? "disabled" : "enabled",
    updatedAt: String(raw.updatedAt || "").trim(),
  };
}

function loadQuotaLibraryItemsFromStorage() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(quotaLibraryStorageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeQuotaLibraryItem)
      .filter((item): item is QuotaLibraryItem => !!item && item.status === "enabled");
  } catch {
    return [];
  }
}

function normalizePackagePricingSummary(value: unknown): PackagePricingSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (String(raw.mode || "").trim() !== "package") return null;
  const segments = Array.isArray(raw.segments)
    ? raw.segments.map((segment) => {
      const current = segment && typeof segment === "object" ? segment as Record<string, unknown> : {};
      return {
        startArea: toNumber(current.startArea),
        endArea: toNumber(current.endArea),
        chargedArea: toNumber(current.chargedArea),
        unitPrice: toNumber(current.unitPrice),
        amount: toNumber(current.amount),
      };
    }).filter((segment) => segment.chargedArea > 0 || segment.amount > 0)
    : [];
  const summary = {
    area: toNumber(raw.area),
    includedArea: toNumber(raw.includedArea),
    packageAmount: toNumber(raw.packageAmount),
    extraArea: toNumber(raw.extraArea),
    extraAmount: toNumber(raw.extraAmount),
    totalAmount: toNumber(raw.totalAmount),
    segments,
  };
  return summary.totalAmount > 0 || summary.packageAmount > 0 ? summary : null;
}

function normalizePackagePricingConfig(value: unknown, summary: PackagePricingSummary): PackageQuoteConfigInput {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawConfig = raw.pricingConfig && typeof raw.pricingConfig === "object" ? raw.pricingConfig as Record<string, unknown> : {};
  const rawTiers = Array.isArray(raw.packageTiers)
    ? raw.packageTiers
    : Array.isArray(rawConfig.packageTiers)
      ? rawConfig.packageTiers
      : [];
  const fallbackUnitPrice = toNumber(raw.extraAreaPrice ?? rawConfig.extraAreaPrice)
    || (summary.segments[0]?.unitPrice ?? 0)
    || (summary.extraArea > 0 ? summary.extraAmount / summary.extraArea : 0);
  const packageTiers = rawTiers.length > 0
    ? rawTiers.map((tier) => {
      const current = tier && typeof tier === "object" ? tier as Record<string, unknown> : {};
      return {
        maxArea: toNumber(current.maxArea),
        unitPrice: toNumber(current.unitPrice ?? fallbackUnitPrice),
      };
    })
    : summary.segments.map((segment) => ({
      maxArea: segment.endArea,
      unitPrice: segment.unitPrice || fallbackUnitPrice,
    }));

  return {
    mode: "package",
    includedArea: toNumber(raw.includedArea ?? rawConfig.includedArea) || summary.includedArea,
    packageAmount: toNumber(raw.packageAmount ?? rawConfig.packageAmount) || summary.packageAmount,
    extraAreaPrice: fallbackUnitPrice,
    packageTiers,
  };
}

function buildPackagePricingText(result: PackagePriceResult) {
  const segmentText = result.segments.length > 0
    ? `；超出计算：${result.segments.map((segment) => `${formatQuoteArea(segment.startArea, 0)}-${formatQuoteArea(segment.endArea, 0)}㎡×${formatQuoteAmount(segment.unitPrice)}元/㎡`).join("，")}`
    : "";
  return `计价面积${formatQuoteArea(result.area)}㎡，套餐面积${formatQuoteArea(result.includedArea)}㎡以内，套餐价${formatQuoteAmount(result.packageAmount)}元，超出${formatQuoteArea(result.extraArea)}㎡，超出加价${formatQuoteAmount(result.extraAmount)}元${segmentText}`;
}

function buildPackagePricingSettings(current: unknown, config: PackageQuoteConfigInput, result: PackagePriceResult) {
  const raw = current && typeof current === "object" ? current as Record<string, unknown> : {};
  return {
    ...raw,
    mode: "package",
    area: result.area,
    includedArea: result.includedArea,
    packageAmount: result.packageAmount,
    extraArea: result.extraArea,
    extraAmount: result.extraAmount,
    totalAmount: result.totalAmount,
    segments: result.segments,
    extraAreaPrice: config.extraAreaPrice,
    packageTiers: config.packageTiers,
  };
}

function getCustomCabinetArea(item: Partial<QuotationItem>) {
  return toMoney(toNumber(item.material_cost) * toNumber(item.labor_cost) / 1000000);
}

const defaultItems: QuotationItem[] = [];

function makeClientItemKey() {
  clientItemKeySeed += 1;
  return `quote-item-${Date.now()}-${clientItemKeySeed}`;
}

function getQuotationItemKey(item: QuotationItem, fallbackIndex: number) {
  return item.client_key || item.id || `${item.category}-${fallbackIndex}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildOtherFeeSequenceByKey(items: QuotationItem[]) {
  const sequenceByKey = new Map<string, string>();
  let otherIndex = 0;
  items.forEach((item, index) => {
    if (!isOtherCategory(item.category)) return;
    sequenceByKey.set(getQuotationItemKey(item, index), formatAlphaSequence(otherIndex));
    otherIndex += 1;
  });
  return sequenceByKey;
}

function buildOtherFeeSequenceRemap(beforeItems: QuotationItem[], afterItems: QuotationItem[]) {
  const beforeSequenceByKey = buildOtherFeeSequenceByKey(beforeItems);
  const afterSequenceByKey = buildOtherFeeSequenceByKey(afterItems);
  const remap: Record<string, string> = {};
  beforeSequenceByKey.forEach((oldSequence, key) => {
    const nextSequence = afterSequenceByKey.get(key);
    if (nextSequence && nextSequence !== oldSequence) remap[oldSequence] = nextSequence;
  });
  return remap;
}

function replaceFeeSequenceReferences(value: unknown, sequenceRemap: Record<string, string>) {
  const text = String(value || "").trim();
  const sequences = Object.keys(sequenceRemap).sort((a, b) => b.length - a.length);
  if (!text || sequences.length === 0) return text;
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${sequences.map(escapeRegExp).join("|")})(?=$|[^A-Za-z0-9_])`, "gi");
  return text.replace(pattern, (_match, prefix: string, sequence: string) => `${prefix}${sequenceRemap[String(sequence).toUpperCase()] || sequence}`);
}

function remapOtherFeeReferences(beforeItems: QuotationItem[], afterItems: QuotationItem[]) {
  const sequenceRemap = buildOtherFeeSequenceRemap(beforeItems, afterItems);
  if (Object.keys(sequenceRemap).length === 0) return afterItems;
  return afterItems.map((item) => {
    if (!isOtherCategory(item.category) || !item.fee_calc_base) return item;
    const nextFeeCalcBase = replaceFeeSequenceReferences(item.fee_calc_base, sequenceRemap);
    return nextFeeCalcBase === item.fee_calc_base ? item : { ...item, fee_calc_base: nextFeeCalcBase as FeeCalcBase };
  });
}

function focusNextQuoteCell(currentElement: QuoteEditableElement) {
  const table = currentElement.closest("table");
  const currentCell = currentElement.closest("td");
  const currentRow = currentElement.closest("tr");
  if (!table) return false;
  const rows = Array.from(table.querySelectorAll("tbody tr"));
  const currentRowIndex = currentRow ? rows.indexOf(currentRow) : -1;
  const currentCellIndex = currentCell && currentRow
    ? Array.from(currentRow.children).indexOf(currentCell)
    : -1;

  if (currentRowIndex >= 0 && currentCellIndex >= 0) {
    for (const row of rows.slice(currentRowIndex + 1)) {
      const sameColumnCell = row.children[currentCellIndex];
      const nextCell = sameColumnCell?.querySelector<QuoteEditableElement>(".quote-cell-editable:not(:disabled):not([aria-disabled='true'])");
      if (nextCell) {
        nextCell.focus();
        if ("select" in nextCell && typeof nextCell.select === "function" && nextCell.tagName !== "SELECT") {
          nextCell.select();
        }
        return true;
      }
    }
  }

  const cells = Array.from(table.querySelectorAll<QuoteEditableElement>(".quote-cell-editable:not(:disabled):not([aria-disabled='true'])"));
  const currentIndex = cells.indexOf(currentElement);
  const nextCell = currentIndex >= 0 ? cells[currentIndex + 1] : null;
  if (!nextCell) return false;

  nextCell.focus();
  if ("select" in nextCell && typeof nextCell.select === "function" && nextCell.tagName !== "SELECT") {
    nextCell.select();
  }
  return true;
}

const quoteEditableCellSelector = ".quote-cell-editable:not(:disabled):not([readonly]):not([aria-disabled='true'])";

function focusQuoteCellElement(element?: QuoteEditableElement | null) {
  if (!element) return false;
  element.focus();
  if (element.tagName !== "SELECT" && "select" in element && typeof element.select === "function") {
    element.select();
  }
  return true;
}

function focusQuoteCellByArrow(currentElement: QuoteEditableElement, direction: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") {
  const table = currentElement.closest("table");
  const currentCell = currentElement.closest("td");
  const currentRow = currentElement.closest("tr[data-quote-item-row]");
  if (!table || !currentCell || !currentRow) return false;

  const cellIndex = Array.from(currentRow.children).indexOf(currentCell);
  if (cellIndex < 0) return false;

  if (direction === "ArrowLeft" || direction === "ArrowRight") {
    const step = direction === "ArrowLeft" ? -1 : 1;
    for (let index = cellIndex + step; index >= 0 && index < currentRow.children.length; index += step) {
      const nextElement = currentRow.children[index]?.querySelector<QuoteEditableElement>(quoteEditableCellSelector);
      if (focusQuoteCellElement(nextElement)) return true;
    }
    return false;
  }

  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr[data-quote-item-row]"));
  const rowIndex = rows.indexOf(currentRow as HTMLTableRowElement);
  const step = direction === "ArrowUp" ? -1 : 1;
  for (let index = rowIndex + step; index >= 0 && index < rows.length; index += step) {
    const nextElement = rows[index].children[cellIndex]?.querySelector<QuoteEditableElement>(quoteEditableCellSelector);
    if (focusQuoteCellElement(nextElement)) return true;
  }
  return false;
}

function canLeaveTextCellHorizontally(element: QuoteEditableElement, direction: "ArrowLeft" | "ArrowRight") {
  if (element instanceof HTMLDivElement || element instanceof HTMLSelectElement) return true;
  if (element.dataset.quoteArrowNavigation === "always") return true;
  const selectionStart = element.selectionStart;
  const selectionEnd = element.selectionEnd;
  if (selectionStart === null || selectionEnd === null || selectionStart !== selectionEnd) return false;
  return direction === "ArrowLeft"
    ? selectionStart === 0
    : selectionEnd === element.value.length;
}

function handleQuoteCellKeyDown(event: KeyboardEvent<QuoteEditableElement>) {
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
  if (event.key === "Enter" && focusNextQuoteCell(event.currentTarget)) {
    event.preventDefault();
    return;
  }
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;

  const direction = event.key as "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";
  const isSelectControl = event.currentTarget instanceof HTMLSelectElement || event.currentTarget.getAttribute("role") === "combobox";
  if (isSelectControl && (direction === "ArrowUp" || direction === "ArrowDown")) return;
  if ((direction === "ArrowLeft" || direction === "ArrowRight") && !canLeaveTextCellHorizontally(event.currentTarget, direction)) return;

  if (focusQuoteCellByArrow(event.currentTarget, direction)) event.preventDefault();
}

function selectZeroOnFocus(event: React.FocusEvent<HTMLInputElement>) {
  if (Number(event.currentTarget.value) === 0) {
    event.currentTarget.select();
  }
}

function normalizeNumberInputValue(value: string) {
  const text = value.trim();
  if (!text) return 0;
  const normalizedText = /^0+\d/.test(text) ? text.replace(/^0+(?=\d)/, "") : text;
  const parsed = Number(normalizedText);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatEditableNumber(value: number) {
  const next = Number.isFinite(value) ? value : 0;
  return Number.isInteger(next) ? String(next) : String(next).replace(/\.?0+$/, "");
}

function isValidDecimalInput(value: string) {
  return /^\d*(?:\.\d*)?$/.test(value);
}

function normalizeArithmeticExpression(value: string) {
  return value
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/，/g, ",")
    .trim();
}

function parseQuantityExpression(value: string): number | null {
  const expression = normalizeArithmeticExpression(value);
  if (!expression) return 0;
  if (!/^[\d+\-*/().\s]+$/.test(expression)) return null;

  let position = 0;

  const skipSpaces = () => {
    while (/\s/.test(expression[position] || "")) position += 1;
  };

  const parseNumber = () => {
    skipSpaces();
    const start = position;
    while (/\d|\./.test(expression[position] || "")) position += 1;
    if (start === position) return null;
    const text = expression.slice(start, position);
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parseFactor = (): number | null => {
    skipSpaces();
    const char = expression[position];
    if (char === "+" || char === "-") {
      position += 1;
      const value = parseFactor();
      return value === null ? null : char === "-" ? -value : value;
    }
    if (char === "(") {
      position += 1;
      const value = parseExpression();
      skipSpaces();
      if (expression[position] !== ")") return null;
      position += 1;
      return value;
    }
    return parseNumber();
  };

  const parseTerm = (): number | null => {
    let value = parseFactor();
    if (value === null) return null;
    while (true) {
      skipSpaces();
      const operator = expression[position];
      if (operator !== "*" && operator !== "/") break;
      position += 1;
      const right = parseFactor();
      if (right === null) return null;
      if (operator === "/" && right === 0) return null;
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };

  function parseExpression(): number | null {
    let value = parseTerm();
    if (value === null) return null;
    while (true) {
      skipSpaces();
      const operator = expression[position];
      if (operator !== "+" && operator !== "-") break;
      position += 1;
      const right = parseTerm();
      if (right === null) return null;
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  const result = parseExpression();
  skipSpaces();
  if (position !== expression.length || result === null || !Number.isFinite(result)) return null;
  return result;
}

function isValidFormulaInput(value: string) {
  return /^[\d+\-*/().\s（）×÷]*$/.test(value);
}

function QuoteNumberInput({
  value,
  onChange,
  className = "",
  disabled,
  emptyWhenDisabled = false,
  allowFormula = false,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  emptyWhenDisabled?: boolean;
  allowFormula?: boolean;
}) {
  const [editingValue, setEditingValue] = useState(formatEditableNumber(value));
  const displayValue = formatEditableNumber(value);

  useEffect(() => {
    setEditingValue(displayValue);
  }, [displayValue]);

  const commitValue = (rawValue: string) => {
    const nextValue = allowFormula ? parseQuantityExpression(rawValue) : normalizeNumberInputValue(rawValue);
    const normalizedValue = Math.max(0, nextValue ?? value);
    setEditingValue(formatEditableNumber(normalizedValue));
    if (nextValue !== null && normalizedValue !== value) onChange(normalizedValue);
  };

  return (
    <input
      type="text"
      inputMode={allowFormula ? "text" : "decimal"}
      min={0}
      disabled={disabled}
      value={disabled && emptyWhenDisabled ? "" : editingValue}
      onChange={(event) => {
        const rawValue = event.target.value;
        if (allowFormula) {
          if (!isValidFormulaInput(rawValue)) return;
          setEditingValue(rawValue);
          return;
        }
        const trimmedValue = rawValue.trim();
        if (!isValidDecimalInput(trimmedValue)) return;
        setEditingValue(rawValue);
      }}
      onFocus={selectZeroOnFocus}
      onBlur={(event) => {
        commitValue(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
          commitValue(event.currentTarget.value);
        }
        if (allowFormula && event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.currentTarget.blur();
        }
        handleQuoteCellKeyDown(event);
      }}
      data-quote-arrow-navigation="always"
      title={allowFormula ? "可输入数字或计算式，如：(10+2)*0.8" : undefined}
      className={`quote-cell-editable quote-cell-input disabled:text-surface-300 ${className}`}
    />
  );
}

function UnitInputCell({
  value,
  onChange,
  className = "",
  readOnly,
}: {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  readOnly?: boolean;
}) {
  const isMissing = !String(value ?? "").trim();
  return (
    <div className="relative min-h-[34px]">
      <input
        value={value ?? ""}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleQuoteCellKeyDown}
        aria-invalid={isMissing}
        className={`quote-cell-editable quote-cell-input ${isMissing ? "pr-6" : ""} ${className}`}
      />
      {isMissing && (
        <span
          className="absolute right-1.5 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold leading-none text-white shadow-sm"
          title="请填写单位"
        >
          !
        </span>
      )}
    </div>
  );
}

function SpaceSelectCell({
  value,
  options,
  onChange,
  readOnly,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  const currentValue = String(value || "").trim();
  const availableSpaces = uniqueValues([currentValue, ...options]);

  return (
    <div className="relative min-h-[34px]">
      <SystemSelect
        value={currentValue}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleQuoteCellKeyDown}
        disabled={readOnly}
        className="quote-cell-editable quote-cell-input quote-cell-select quote-space-cell-select cursor-pointer appearance-none pr-10 text-center font-medium"
        menuClassName="quote-system-select-menu"
        optionClassName="quote-system-select-option"
      >
        {!currentValue && <option value="">请选择空间</option>}
        {availableSpaces.map((space) => (
          <option key={space} value={space}>{space}</option>
        ))}
      </SystemSelect>
    </div>
  );
}

function newItem(category: QuotationItem["category"], space?: string): QuotationItem {
  const isOther = isOtherCategory(category);
  return {
    client_key: makeClientItemKey(),
    category,
    space: isOther ? "" : String(space || "").trim(),
    work_type_id: null,
    work_type_name: null,
    material_category_id: null,
    material_category_name: null,
    name: "",
    spec: "",
    material_model: "",
    remark: "",
    unit: "",
    quantity: isOther ? 1 : 0,
    unit_price: 0,
    material_cost: 0,
    labor_cost: 0,
    ...(isOther ? { fee_calc_method: "fixed" as const, fee_calc_base: "", fee_rate: 0 } : {}),
  };
}

function isStandardQuotaSourceItem(item?: QuotationItem | null) {
  if (!item || isOtherCategory(item.category)) return false;
  if (item.source === "standard") return true;
  const costSource = String(item.cost_source || "").trim();
  return costSource === "quota" || costSource.startsWith("quota:");
}

function createQuotationItemFromQuota(quota: QuotaLibraryItem, category: QuotationItem["category"], space?: string): QuotationItem {
  const materialPrice = toMoney(quota.materialPrice);
  const laborPrice = toMoney(quota.laborPrice);
  const totalPrice = toMoney(quota.totalPrice || materialPrice + laborPrice);
  return {
    client_key: makeClientItemKey(),
    source: quota.source === "custom" ? "custom" : "standard",
    category,
    space: isOtherCategory(category) ? "" : String(space || "").trim(),
    work_type_id: quota.workTypeId || null,
    work_type_name: quota.workTypeName || null,
    material_category_id: quota.materialCategoryId || null,
    material_category_name: quota.materialCategoryName || null,
    name: quota.name,
    spec: quota.constructionDescription,
    material_model: "",
    remark: quota.code ? `定额编号：${quota.code}` : "",
    unit: quota.unit,
    quantity: 0,
    unit_price: isBaseCategory(category) ? materialPrice + laborPrice : totalPrice,
    material_cost: materialPrice,
    labor_cost: laborPrice,
    cost_material_unit: toMoney(quota.internalMaterialCost || 0),
    cost_labor_unit: toMoney(quota.internalLaborCost || 0),
    cost_loss_rate: toNumber(quota.costLossRate || 0),
    cost_source: quota.code ? `quota:${quota.code}` : "quota",
    profit_margin: 0,
    row_color: quota.isSpecialPrice ? "special" : null,
  };
}

function getProductDisplayName(product: ProductLibraryItem) {
  return [product.brand, product.product_name || product.name, product.material_model]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
    .join(" ");
}

function getProductSkuText(sku: ProductLibrarySku, product: ProductLibraryItem) {
  return [sku.sku_name, sku.spec || product.spec, sku.color || product.color, sku.attributes]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" / ");
}

function normalizeProductImages(value?: string[] | string | null, fallback?: string | null) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim().startsWith("[")
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch {
            return [value];
          }
        })()
      : value
        ? [value]
        : [];
  return Array.from(new Set([...rawValues, fallback || ""]
    .map((item) => String(item || "").trim())
    .filter((item) => item && !item.startsWith("blob:"))));
}

function getPersistentProductImage(value?: string | null) {
  const image = String(value || "").trim();
  return image && !image.startsWith("blob:") ? image : null;
}

function normalizeProductSpecOnly(value?: string | null) {
  const parts = String(value || "")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
  const specLikeParts = parts.filter((item) => /\d/.test(item) && /(mm|cm|m|×|x|\*|寸|升|l|kg|g|ml|㎡|m²|米|公分)/i.test(item));
  return (specLikeParts.length > 0 ? specLikeParts : parts).join(" / ");
}

function createProductLibraryPicks(products: ProductLibraryItem[]) {
  return products
    .filter((product) => product.material_type === "MAIN" && product.is_active !== 0 && product.is_active !== false)
    .flatMap((product) => {
      const productName = getProductDisplayName(product) || product.name || "未命名产品";
      const productImages = normalizeProductImages(product.images, product.image);
      const activeSkus = (Array.isArray(product.skus) ? product.skus : [])
        .filter((sku) => sku.is_active !== 0 && sku.is_active !== false);
      const skus = activeSkus.length > 0 ? activeSkus : [{
        id: `${product.id}-default`,
        sku_name: product.material_model || product.spec || "默认规格",
        spec: product.spec,
        color: product.color,
        unit: product.unit,
        unit_price: product.unit_price,
        market_price: product.market_price,
        cost_price: product.cost_price,
        internal_control_price: product.internal_control_price,
        stock: product.stock,
        min_stock: product.min_stock,
        image: productImages[0] || null,
        is_active: 1,
      } as ProductLibrarySku];
      return skus.map((sku) => ({
        id: `${product.id}:${sku.id || getProductSkuText(sku, product)}`,
        materialId: product.id,
        skuId: sku.id,
        code: sku.sku_code || product.code,
        categoryId: product.category_id || null,
        categoryName: product.category_name || "未分类",
        productName,
        brand: product.brand || null,
        materialModel: product.material_model || null,
        skuName: sku.sku_name || null,
        spec: sku.spec || product.spec || null,
        color: sku.color || product.color || null,
        unit: sku.unit || product.unit || null,
        image: getPersistentProductImage(sku.image) || productImages[0] || null,
        marketPrice: toMoney(sku.market_price ?? product.market_price ?? 0),
        customerPrice: toMoney(sku.unit_price ?? product.unit_price ?? 0),
        purchasePrice: toMoney(sku.cost_price ?? product.cost_price ?? 0),
        internalControlPrice: toMoney(sku.internal_control_price ?? product.internal_control_price ?? sku.cost_price ?? product.cost_price ?? 0),
        isSpecialPrice: product.is_special_price === 1 || product.is_special_price === true,
        skuCount: skus.length,
        supplierName: product.supplier_name || null,
        stock: Number(sku.stock ?? product.stock ?? 0),
        minStock: Number(sku.min_stock ?? product.min_stock ?? 0),
        productAttributes: product.product_attributes || null,
        skuAttributes: sku.attributes || null,
      }));
    });
}

function createQuotationItemFromProduct(product: ProductLibraryPick, category: QuotationItem["category"], space?: string): QuotationItem {
  const specText = normalizeProductSpecOnly(product.spec);
  return {
    client_key: makeClientItemKey(),
    category,
    space: isOtherCategory(category) ? "" : String(space || "").trim(),
    work_type_id: null,
    work_type_name: null,
    material_category_id: product.categoryId || null,
    material_category_name: product.categoryName || null,
    name: product.productName,
    spec: specText,
    material_model: product.materialModel || product.skuName || "",
    remark: "",
    unit: product.unit || "",
    quantity: 0,
    unit_price: product.customerPrice,
    material_cost: product.internalControlPrice || product.purchasePrice,
    labor_cost: 0,
    cost_material_unit: product.purchasePrice,
    cost_labor_unit: 0,
    cost_loss_rate: 0,
    cost_source: product.code ? `material:${product.code}` : "material",
    profit_margin: 0,
    row_color: product.isSpecialPrice ? "special" : null,
  };
}

function getFeeCalcMethodPatch(method: FeeCalcMethod, item: QuotationItem): Partial<QuotationItem> {
  if (method === "fixed") {
    return { fee_calc_method: "fixed", fee_calc_base: "", fee_rate: 0 };
  }
  const feeCalcBase = normalizeFeeCalcBase(item.fee_calc_base) || "直接费";
  if (method === "reference") {
    return { fee_calc_method: "reference", fee_calc_base: feeCalcBase, fee_rate: 0, quantity: 1 };
  }
  return { fee_calc_method: "percent", fee_calc_base: feeCalcBase, fee_rate: toNumber(item.fee_rate), quantity: 1 };
}

function inferItemSpace(item: Partial<QuotationItem>) {
  const current = String(item.space || "").trim();
  if (current) return current;
  return "";
}

function guessItemSpace(item: Partial<QuotationItem>) {
  if (isOtherCategory(String(item.category || ""))) return "";
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

function normalizeQuotationItems(items: QuotationItem[], options: { inferMissingSpace?: boolean } = {}) {
  return items.map((item) => {
    const isOther = isOtherCategory(item.category);
    const feeRate = toNumber(item.fee_rate);
    const isLegacyManagementFee = isOther && hasManagementFeeItem([item]) && !item.fee_calc_method && getLegacyManagementFeeRate(item) > 0;
    const feeMethod = isLegacyManagementFee ? "percent" as const : normalizeFeeCalcMethod(item.fee_calc_method);
    return {
      ...item,
      client_key: item.client_key || item.id || makeClientItemKey(),
      space: inferItemSpace(item) || (options.inferMissingSpace ? guessItemSpace(item) : ""),
      ...(isOther ? {
        fee_calc_method: feeMethod,
        fee_calc_base: feeMethod === "fixed" ? "" : normalizeFeeCalcBase(item.fee_calc_base) || "直接费",
        fee_rate: feeMethod === "percent" ? (isLegacyManagementFee ? getLegacyManagementFeeRate(item) : feeRate) : 0,
      } : {}),
    };
  });
}

function roundMoney(value: number) {
  return toMoney(value);
}

function hasManagementFeeItem(items: QuotationItem[]) {
  return items.some((item) => isOtherCategory(item.category) && /^(项目)?管理费$/.test(String(item.name || "").trim()));
}

function migrateManagementFeeToOtherItem(items: QuotationItem[], settings: QuotationDetail["settings"]) {
  const managementFeeRate = toNumber(settings?.managementFeeRate);
  const nextSettings = { ...settings, managementFeeRate: 0 };
  if (managementFeeRate <= 0) return { items, settings: nextSettings, migrated: false };

  if (hasManagementFeeItem(items)) {
    return { items, settings: nextSettings, migrated: true };
  }

  const baseAmount = items.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const materialAmount = items.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const managementFee = roundMoney((baseAmount + materialAmount) * managementFeeRate / 100);
  if (managementFee <= 0) return { items, settings: nextSettings, migrated: true };

  return {
    items: [
      ...items,
      {
        client_key: makeClientItemKey(),
        category: "other" as const,
        space: "",
        name: "管理费",
        spec: `原管理费比例 ${managementFeeRate}% 转入`,
        unit: "项",
        quantity: 1,
        unit_price: managementFee,
        material_cost: 0,
        labor_cost: 0,
        fee_calc_method: "percent" as const,
        fee_calc_base: "直接费" as const,
        fee_rate: managementFeeRate,
      },
    ],
    settings: nextSettings,
    migrated: true,
  };
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getSpacesForCategory(items: QuotationItem[], category: QuotationItem["category"], customSpaces: string[]) {
  if (isOtherCategory(category)) return [];
  const itemSpaces = items.filter((item) => sameQuoteCategory(item.category, category)).map((item) => inferItemSpace(item));
  return uniqueValues([...customSpaces, ...itemSpaces]);
}

function getNextCopyName(source: string, spaces: string[]) {
  const baseName = `${source} 副本`;
  if (!spaces.includes(baseName)) return baseName;
  let count = 2;
  while (spaces.includes(`${baseName}${count}`)) count += 1;
  return `${baseName}${count}`;
}

function withoutClientKey(item: QuotationItem): QuotationItem {
  const copy = { ...item };
  delete copy.client_key;
  return copy;
}

function withoutStoredIdentity(item: QuotationItem): QuotationItem {
  const copy = withoutClientKey(item);
  delete copy.id;
  return copy;
}

function cloneItemForSpace(item: QuotationItem, space: string): QuotationItem {
  const copy = withoutStoredIdentity(item);
  return { ...copy, client_key: makeClientItemKey(), space };
}

function buildFeeFormulaContext(items: QuotationItem[], categories: string[] = []): FeeFormulaContext {
  const orderedCategories = orderQuoteCategories([...categories, ...items.map((item) => item.category)]);
  const mainMaterialAmount = items
    .filter((item) => isMainMaterialCategory(item.category))
    .reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const laborAmount = items.reduce((sum, item) => sum + getBaseLaborSubtotal(item), 0);
  const materialCostAmount = items.reduce((sum, item) => sum + getBaseMaterialSubtotal(item), 0);
  const categoryAmounts: Record<string, number> = {};

  orderedCategories
    .filter((category) => isDirectItemCategory(category) && !isBaseCategory(category) && !isMainMaterialCategory(category))
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

function calculate(items: QuotationItem[], settings: QuotationDetail["settings"]) {
  const baseAmount = items.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const materialAmount = items.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const customCategoryAmount = items.filter((item) => isDirectItemCategory(item.category) && !isBaseCategory(item.category) && !isMainMaterialCategory(item.category)).reduce((sum, item) => sum + getBaseOrMaterialItemTotal(item), 0);
  const directBaseAmount = materialAmount + customCategoryAmount;
  const otherItems = items.filter((item) => isOtherCategory(item.category));
  const feeFormulaContext = buildFeeFormulaContext(items, settings?.quoteCategories);
  const otherAmount = calculateChargeableOtherFeeTotals(otherItems, baseAmount, directBaseAmount, feeFormulaContext).reduce((sum, amount) => sum + amount, 0);
  const totalDirectAmount = baseAmount + directBaseAmount;
  const managementFee = 0;
  const discount = toNumber(settings?.discount);
  const chargeableAmount = baseAmount + directBaseAmount + otherAmount;
  const taxAmount = Math.max(0, chargeableAmount - discount) * toNumber(settings?.taxRate) / 100;
  const finalAmount = Math.max(0, chargeableAmount + taxAmount - discount);
  return { baseAmount, materialAmount: directBaseAmount, mainMaterialAmount: materialAmount, customCategoryAmount, otherAmount, directAmount: chargeableAmount, totalDirectAmount, managementFee, taxAmount, discount, finalAmount };
}

function getBaseOrMaterialItemUnitPrice(item: QuotationItem) {
  if (!isBaseCategory(item.category)) return toNumber(item.unit_price);
  const material = toNumber(item.material_cost);
  const labor = toNumber(item.labor_cost);
  return material || labor ? material + labor : toNumber(item.unit_price);
}

function getBaseOrMaterialItemTotal(item: QuotationItem) {
  if (isCustomCabinetCategory(item.category)) {
    const area = getCustomCabinetArea(item);
    const quantity = toNumber(item.quantity);
    const unitPrice = toNumber(item.unit_price);
    return toMoney(quantity * (area > 0 ? area : 1) * unitPrice);
  }
  return toMoney(toNumber(item.quantity) * getBaseOrMaterialItemUnitPrice(item));
}

function getItemTotal(item: QuotationItem, baseAmount = 0, materialAmount = 0, feeFormulaContext?: FeeFormulaContext) {
  if (isOtherCategory(item.category)) return calculateOtherFeeTotal(item, baseAmount, materialAmount, {}, feeFormulaContext);
  return getBaseOrMaterialItemTotal(item);
}

type DiscountScopeOption = {
  value: string;
  label: string;
  amount: number;
};

function getBaseLaborSubtotal(item: QuotationItem) {
  if (!isBaseCategory(item.category)) return 0;
  const materialUnit = toNumber(item.material_cost);
  const rawLaborUnit = toNumber(item.labor_cost);
  const laborUnit = materialUnit || rawLaborUnit ? rawLaborUnit : toNumber(item.unit_price);
  return toMoney(toNumber(item.quantity) * laborUnit);
}

function getBaseMaterialSubtotal(item: QuotationItem) {
  if (!isBaseCategory(item.category)) return 0;
  return toMoney(toNumber(item.quantity) * toNumber(item.material_cost));
}

function isLaborOnlyQuoteItem(item: QuotationItem) {
  if (!isBaseCategory(item.category)) return false;
  const materialSubtotal = getBaseMaterialSubtotal(item);
  const laborSubtotal = getBaseLaborSubtotal(item);
  return materialSubtotal <= 0 && laborSubtotal > 0;
}

function isExcludedFromDiscount(item: QuotationItem, settings: QuotationDetail["settings"]) {
  if (settings?.excludeSpecialDiscountItems && isSpecialQuoteItem(item)) return true;
  if (settings?.excludeLaborOnlyDiscountItems && isLaborOnlyQuoteItem(item)) return true;
  return false;
}

function getDiscountableItems(items: QuotationItem[], settings: QuotationDetail["settings"]) {
  return items.filter((item) => !isExcludedFromDiscount(item, settings));
}

function getDiscountScopeOptions(items: QuotationItem[], settings: QuotationDetail["settings"], totals: ReturnType<typeof calculate>): DiscountScopeOption[] {
  const discountableItems = getDiscountableItems(items, settings);
  const feeContext = buildFeeFormulaContext(discountableItems, settings?.quoteCategories);
  const categoryAmounts = feeContext.categoryAmounts || {};
  const customCategoryOptions = Object.entries(categoryAmounts)
    .map(([label, amount]) => ({
      value: `category:${label}`,
      label,
      amount: toMoney(toNumber(amount)),
    }));
  const customCabinetAmount = items
    .filter((item) => !isExcludedFromDiscount(item, settings))
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

function getDiscountSpaceOptions(items: QuotationItem[], settings: QuotationDetail["settings"]): DiscountScopeOption[] {
  const discountableItems = getDiscountableItems(items, settings);
  const spaces = uniqueValues([
    ...(Array.isArray(settings?.quoteSpaces) ? settings.quoteSpaces : []),
    ...items
      .filter((item) => !isOtherCategory(item.category))
      .map((item) => inferItemSpace(item)),
  ]);
  return spaces.map((space) => ({
    value: `space:${space}`,
    label: space,
    amount: discountableItems
      .filter((item) => !isOtherCategory(item.category) && inferItemSpace(item) === space)
      .reduce((sum, item) => toMoney(sum + getBaseOrMaterialItemTotal(item)), 0),
  }));
}

function getDiscountWorkTypeOptions(items: QuotationItem[], settings: QuotationDetail["settings"]): DiscountScopeOption[] {
  const discountableItems = getDiscountableItems(items, settings);
  const workTypes = uniqueValues(
    items
      .filter((item) => !isOtherCategory(item.category))
      .map((item) => String(item.work_type_name || "").trim()),
  );
  return workTypes.map((workType) => ({
    value: `work_type:${workType}`,
    label: workType,
    amount: discountableItems
      .filter((item) => !isOtherCategory(item.category) && String(item.work_type_name || "").trim() === workType)
      .reduce((sum, item) => toMoney(sum + getBaseOrMaterialItemTotal(item)), 0),
  }));
}

function makeSavePayload(
  title: string,
  terms: string,
  notes: string,
  customerVisibleNote: string,
  status: string,
  settings: QuotationDetail["settings"],
  customSpaces: string[],
  items: QuotationItem[],
) {
  const quoteCategories = getQuoteCategoriesForItems(settings?.quoteCategories || [], items);
  return { title, terms, notes, customer_visible_note: customerVisibleNote, status, settings: { ...settings, managementFeeRate: 0, quoteSpaces: customSpaces, quoteCategories }, items: items.map(withoutClientKey) };
}

export default function QuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quotationId = params.id;
  const [data, setData] = useState<QuotationDetail | null>(null);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [settings, setSettings] = useState<QuotationDetail["settings"]>({
    managementFeeRate: 0,
    taxRate: 0,
    discount: 0,
    discountType: "fee",
    discountMode: "amount",
    discountRate: 1,
    discountScope: "total",
    discountSpace: "",
    discountWorkType: "",
    excludeSpecificDiscountAmount: 0,
    excludeSpecialDiscountItems: false,
    excludeLaborOnlyDiscountItems: false,
    warrantyMonths: 24,
  });
  const [title, setTitle] = useState("装修报价单");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [customerVisibleNote, setCustomerVisibleNote] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [loading, setLoading] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [autoSaveErrorMessage, setAutoSaveErrorMessage] = useState("");
  const [activeCategory, setActiveCategory] = useState<QuotationItem["category"]>("base");
  const [activeSpace, setActiveSpace] = useState(allSpacesValue);
  const [manualSpaceCategories, setManualSpaceCategories] = useState<Record<string, string[]>>({});
  const [itemSearch, setItemSearch] = useState("");
  const [packageDetailOpen, setPackageDetailOpen] = useState(false);
  const [renderPackageDetail, setRenderPackageDetail] = useState(false);
  const [packageDetailVisible, setPackageDetailVisible] = useState(false);
  const [packageDetailHeight, setPackageDetailHeight] = useState(0);
	  const [packageAreaText, setPackageAreaText] = useState("");
	  const [discountPanelOpen, setDiscountPanelOpen] = useState(false);
  const [discountDraftSettings, setDiscountDraftSettings] = useState<QuotationDetail["settings"] | null>(null);
	  const [discountRateText, setDiscountRateText] = useState("1");
  const [quotaLibraryItems, setQuotaLibraryItems] = useState<QuotaLibraryItem[]>([]);
  const [productLibraryItems, setProductLibraryItems] = useState<ProductLibraryPick[]>([]);
  const [workTypeOptions, setWorkTypeOptions] = useState<DictionaryOption[]>([]);
  const [materialCategoryOptions, setMaterialCategoryOptions] = useState<DictionaryOption[]>([]);
  const [quotaPickerOpen, setQuotaPickerOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productPickerLoading, setProductPickerLoading] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findReplaceKeyword, setFindReplaceKeyword] = useState("");
  const [findReplaceValue, setFindReplaceValue] = useState("");
  const [findReplaceScopes, setFindReplaceScopes] = useState<FindReplaceSearchScope[]>(["name"]);
  const [findReplaceMatchIndex, setFindReplaceMatchIndex] = useState(0);
  const [findReplaceMessage, setFindReplaceMessage] = useState("");
  const [findReplaceLocated, setFindReplaceLocated] = useState(false);
  const [customSpaces, setCustomSpaces] = useState<string[]>([]);
  const [spaceMenu, setSpaceMenu] = useState<{ space: string; x: number; y: number } | null>(null);
  const [spaceCopyMenu, setSpaceCopyMenu] = useState<{ source: string; x: number; y: number } | null>(null);
  const [copySpaceCategoryDialog, setCopySpaceCategoryDialog] = useState<CopySpaceCategoryDialogState | null>(null);
  const [rowMenu, setRowMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [rowCopyMenu, setRowCopyMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [selectedQuoteItemKeys, setSelectedQuoteItemKeys] = useState<string[]>([]);
  const [attributionDialog, setAttributionDialog] = useState<{ index: number } | null>(null);
  const [nameDialog, setNameDialog] = useState<QuoteNameDialogState | null>(null);
  const [systemDialog, setSystemDialog] = useState<QuoteSystemDialogState | null>(null);
  const [projectInfoOpen, setProjectInfoOpen] = useState(false);
  const [projectInfoMapPickerOpen, setProjectInfoMapPickerOpen] = useState(false);
  const [projectInfoSaving, setProjectInfoSaving] = useState(false);
  const [projectInfoForm, setProjectInfoForm] = useState<QuoteProjectInfoForm>({
    customerName: "",
    designerName: "",
    customerPhone: "",
    customerWeixin: "",
    customerAddress: "",
    houseAddress: "",
    addressLocationName: "",
    addressLocationAddress: "",
    addressLatitude: "",
    addressLongitude: "",
    buildingNo: "",
    unitNo: "",
    roomNo: "",
    noRoomNumber: false,
    areaSize: "",
    decorationType: "",
    notes: "",
    customerVisibleNote: "",
  });
  const [categoryCreateMenu, setCategoryCreateMenu] = useState<{ x: number; y: number } | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [editingSpaceName, setEditingSpaceName] = useState<string | null>(null);
  const [editingSpaceValue, setEditingSpaceValue] = useState("");
  const [hiddenSpaceCount, setHiddenSpaceCount] = useState(0);
  const [draggingSpace, setDraggingSpace] = useState<string | null>(null);
  const [dragOverSpace, setDragOverSpace] = useState<string | null>(null);
  const [draggingItemIndex, setDraggingItemIndex] = useState<number | null>(null);
  const [dragOverItem, setDragOverItem] = useState<DragOverItemState>(null);
  const [recentlyMovedItemKey, setRecentlyMovedItemKey] = useState<string | null>(null);
  const pointerSpaceDragRef = useRef<{ source: string; startX: number; startY: number; moved: boolean; target: string | null } | null>(null);
  const pointerItemDragRef = useRef<PointerItemDragState>(null);
  const itemsRef = useRef<QuotationItem[]>([]);
  const pendingRevealItemKeyRef = useRef<string | null>(null);
  const autoOpenProjectInfoRef = useRef(false);
  const movedItemTimerRef = useRef<number | null>(null);
  const editingSpaceInputRef = useRef<HTMLInputElement | null>(null);
  const suppressSpaceClickRef = useRef(false);
  const packageAreaEditingRef = useRef(false);
  const discountRateEditingRef = useRef(false);
  const packageDetailTimerRef = useRef<number | null>(null);
  const packageDetailContentRef = useRef<HTMLDivElement | null>(null);
  const lastSavedPayloadRef = useRef("");
  const latestSavePayloadTextRef = useRef("");
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const allowEmptyItemsSaveRef = useRef(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const spaceTabsRef = useRef<HTMLDivElement | null>(null);
  const hiddenSpaceCountRef = useRef(0);
  const hiddenSpaceFrameRef = useRef<number | null>(null);
  const hiddenSpaceIdleTimerRef = useRef<number | null>(null);
  const findReplaceResultListRef = useRef<HTMLDivElement | null>(null);

  const updateHiddenSpaceCount = useCallback(() => {
    const container = spaceTabsRef.current;
    if (!container) {
      if (hiddenSpaceCountRef.current !== 0) {
        hiddenSpaceCountRef.current = 0;
        setHiddenSpaceCount(0);
      }
      return;
    }
    const containerRight = container.getBoundingClientRect().right;
    const hiddenCount = Array.from(container.querySelectorAll<HTMLElement>("[data-space-tab]"))
      .filter((element) => element.getBoundingClientRect().right > containerRight + 1).length;
    if (hiddenSpaceCountRef.current !== hiddenCount) {
      hiddenSpaceCountRef.current = hiddenCount;
      setHiddenSpaceCount(hiddenCount);
    }
  }, []);

  const scheduleHiddenSpaceCountUpdate = useCallback((delay = 0) => {
    if (typeof window === "undefined") return;
    if (hiddenSpaceIdleTimerRef.current !== null) {
      window.clearTimeout(hiddenSpaceIdleTimerRef.current);
      hiddenSpaceIdleTimerRef.current = null;
    }
    if (delay > 0) {
      hiddenSpaceIdleTimerRef.current = window.setTimeout(() => {
        hiddenSpaceIdleTimerRef.current = null;
        scheduleHiddenSpaceCountUpdate();
      }, delay);
      return;
    }
    if (hiddenSpaceFrameRef.current !== null) return;
    hiddenSpaceFrameRef.current = window.requestAnimationFrame(() => {
      hiddenSpaceFrameRef.current = null;
      updateHiddenSpaceCount();
    });
  }, [updateHiddenSpaceCount]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/quotations/${quotationId}`, { headers: authHeaders() });
    const next = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAutoSaveStatus("error");
      setAutoSaveErrorMessage(next?.message || "报价加载失败，请刷新后重试。");
      setLoading(false);
      return;
    }
    const hasSavedQuoteSpaces = next.settings && Array.isArray(next.settings.quoteSpaces);
    const normalizedItems = normalizeQuotationItems(Array.isArray(next.items) ? next.items : defaultItems, { inferMissingSpace: !hasSavedQuoteSpaces });
    const normalizedSettings = {
      managementFeeRate: 0,
	      taxRate: 0,
	      discount: 0,
	      discountType: "fee" as const,
	      discountMode: "amount" as const,
	      discountRate: 1,
	      discountScope: "total",
	      discountSpace: "",
	      discountWorkType: "",
	      excludeSpecificDiscountAmount: 0,
	      excludeSpecialDiscountItems: false,
	      excludeLaborOnlyDiscountItems: false,
	      warrantyMonths: 24,
      quoteCategories: defaultQuoteCategories,
      ...(next.settings || {}),
      quoteSpaces: hasSavedQuoteSpaces ? next.settings.quoteSpaces : defaultQuoteSpaces,
    };
    normalizedSettings.discount = next.discount ?? normalizedSettings.discount ?? 0;
    const migration = migrateManagementFeeToOtherItem(normalizedItems, normalizedSettings);
    const nextItems = migration.items;
    const nextSettings = migration.settings;
    const nextCustomSpaces = Array.isArray(nextSettings.quoteSpaces) ? nextSettings.quoteSpaces : defaultQuoteSpaces;
    const nextCategories = getQuoteCategoriesForItems(
      Array.isArray(nextSettings.quoteCategories) ? nextSettings.quoteCategories : defaultQuoteCategories,
      nextItems,
    );
    nextSettings.quoteCategories = nextCategories;
    const nextTitle = next.title || "装修报价单";
    const nextTerms = next.terms || "报价有效期 15 天；最终施工范围以双方确认图纸和合同为准；增减项需双方签字确认。";
    const nextNotes = next.notes || "";
    const nextCustomerVisibleNote = String(next.customer_visible_note || "").trim();
    const nextStatus = next.status || "DRAFT";
    setData(next);
    setItems(nextItems);
    setSettings(nextSettings);
    setCustomSpaces(nextCustomSpaces);
    setManualSpaceCategories({});
    setActiveSpace((current) => current || allSpacesValue);
    setTitle(nextTitle);
    setTerms(nextTerms);
    setNotes(nextNotes);
    setCustomerVisibleNote(nextCustomerVisibleNote);
    setStatus(nextStatus);
    const nextSavedPayload = JSON.stringify(makeSavePayload(nextTitle, nextTerms, nextNotes, nextCustomerVisibleNote, nextStatus, nextSettings, nextCustomSpaces, nextItems));
    lastSavedPayloadRef.current = next.legacyManagementFeeMigrated || migration.migrated ? "" : nextSavedPayload;
    latestSavePayloadTextRef.current = nextSavedPayload;
    setAutoSaveStatus("idle");
    setAutoSaveErrorMessage("");
    setLoading(false);
  }, [quotationId]);

  useEffect(() => {
    load();
  }, [load]);

  const returnToBudgetRecords = () => {
    const customerId = String(data?.customer_id || "").trim();
    if (customerId) {
      router.push(`/quotations?openRecords=1&customerId=${encodeURIComponent(customerId)}`);
      return;
    }
    router.push("/quotations");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    createQuotationShareUrl(quotationId).then(setShareUrl).catch(() => setShareUrl(""));
  }, [quotationId]);

  useEffect(() => {
    let cancelled = false;
    const loadAttributionOptions = async () => {
      try {
        const [workTypeRes, materialCategoryRes] = await Promise.all([
          fetch("/api/settings/work-types?status=active", { headers: authHeaders() }),
          fetch("/api/materials?view=categories", { headers: authHeaders() }),
        ]);
        const [workTypeData, materialCategoryData]: [any, any] = await Promise.all([
          workTypeRes.ok ? workTypeRes.json().catch(() => ({})) : {},
          materialCategoryRes.ok ? materialCategoryRes.json().catch(() => ({})) : {},
        ]);
        if (cancelled) return;
        const nextWorkTypes = Array.isArray(workTypeData?.workTypes) ? workTypeData.workTypes : [];
        const nextMaterialCategories = Array.isArray(materialCategoryData?.categories) ? materialCategoryData.categories : [];
        setWorkTypeOptions(nextWorkTypes
          .map((item: any) => ({ id: String(item.id || ""), name: String(item.name || "") }))
          .filter((item: DictionaryOption) => item.id && item.name));
        setMaterialCategoryOptions(nextMaterialCategories
          .filter((item: any) => Number(item.is_active ?? 1) === 1)
          .map((item: any) => ({
            id: String(item.id || ""),
            name: item.parent_name ? `${item.parent_name} / ${item.name}` : String(item.name || ""),
            parentName: String(item.parent_name || ""),
          }))
          .filter((item: DictionaryOption) => item.id && item.name));
      } catch {
        if (cancelled) return;
        setWorkTypeOptions([]);
        setMaterialCategoryOptions([]);
      }
    };
    loadAttributionOptions();
    return () => {
      cancelled = true;
    };
  }, []);

	  const isReadonly = !!data?.readonly;
  const totals = useMemo(() => calculate(items, settings), [items, settings]);
  const discountSettings = discountPanelOpen && discountDraftSettings ? discountDraftSettings : settings;
  const discountPreviewTotals = useMemo(() => calculate(items, discountSettings), [items, discountSettings]);
  const undiscountedTotals = useMemo(() => calculate(items, { ...discountSettings, discount: 0 }), [items, discountSettings]);
  const discountMode = discountSettings?.discountMode === "rate" ? "rate" : "amount";
  const discountType = discountSettings?.discountType === "space" || discountSettings?.discountType === "work_type" ? discountSettings.discountType : "fee";
  const discountRate = Math.min(1, Math.max(0, toNumber(discountSettings?.discountRate || 1)));
  const discountScopeOptions = useMemo(() => getDiscountScopeOptions(items, discountSettings, undiscountedTotals), [items, discountSettings, undiscountedTotals]);
  const discountSpaceOptions = useMemo(() => getDiscountSpaceOptions(items, discountSettings), [items, discountSettings]);
  const discountWorkTypeOptions = useMemo(() => getDiscountWorkTypeOptions(items, discountSettings), [items, discountSettings]);
  const activeDiscountOptions = useMemo(() => {
    if (discountType === "space") return discountSpaceOptions;
    if (discountType === "work_type") return discountWorkTypeOptions;
    return discountScopeOptions;
  }, [discountScopeOptions, discountSpaceOptions, discountType, discountWorkTypeOptions]);
  const discountSelectionValue = discountType === "space"
    ? (discountSettings?.discountSpace ? `space:${discountSettings.discountSpace}` : discountSpaceOptions[0]?.value || "")
    : discountType === "work_type"
      ? (discountSettings?.discountWorkType ? `work_type:${discountSettings.discountWorkType}` : discountWorkTypeOptions[0]?.value || "")
      : discountSettings?.discountScope || "total";
  const selectedDiscountScope = activeDiscountOptions.find((option) => option.value === discountSelectionValue)
    || activeDiscountOptions.find((option) => option.value === "total")
    || activeDiscountOptions[0];
  const discountBaseLabel = selectedDiscountScope?.label || "总价";
  const discountScopeBaseAmount = Math.max(0, selectedDiscountScope?.amount || 0);
  const excludeSpecificDiscountAmount = Math.min(discountScopeBaseAmount, Math.max(0, toNumber(discountSettings?.excludeSpecificDiscountAmount)));
  const discountBaseAmount = Math.max(0, discountScopeBaseAmount - excludeSpecificDiscountAmount);
  const discountAfterAmount = Math.max(0, discountPreviewTotals.finalAmount);
  const discountExcludeMeta = useMemo(() => {
    const specialItems = items.filter((item) => !isOtherCategory(item.category) && isSpecialQuoteItem(item));
    const laborOnlyItems = items.filter((item) => isLaborOnlyQuoteItem(item));
    return {
      specialCount: specialItems.length,
      laborOnlyCount: laborOnlyItems.length,
    };
  }, [items]);
  const updateDiscountDraftSettings = useCallback((updater: (current: QuotationDetail["settings"]) => QuotationDetail["settings"]) => {
    setDiscountDraftSettings((current) => updater(current || settings));
  }, [settings]);
  const applyDiscountAmount = useCallback((value: number) => {
    const nextDiscount = roundMoney(Math.min(Math.max(0, value), discountBaseAmount));
    const nextRate = discountBaseAmount > 0 ? roundMoney(Math.max(0, 1 - nextDiscount / discountBaseAmount)) : 1;
    updateDiscountDraftSettings((current) => ({
      ...current,
      discountMode: "amount",
      discountRate: nextRate,
      discount: nextDiscount,
    }));
  }, [discountBaseAmount, updateDiscountDraftSettings]);
  const applyDiscountRate = useCallback((value: number) => {
    const nextRate = Math.min(1, Math.max(0, value));
    const nextDiscount = roundMoney(discountBaseAmount * (1 - nextRate));
    setDiscountRateText(formatEditableNumber(nextRate));
    updateDiscountDraftSettings((current) => ({
      ...current,
      discountMode: "rate",
      discountRate: nextRate,
      discount: nextDiscount,
    }));
  }, [discountBaseAmount, updateDiscountDraftSettings]);
  const getAdjustedDiscountBaseAmount = useCallback((scopeAmount: number, nextSettings: QuotationDetail["settings"] = discountSettings) => {
    const baseAmount = Math.max(0, scopeAmount);
    const excludedAmount = Math.min(baseAmount, Math.max(0, toNumber(nextSettings?.excludeSpecificDiscountAmount)));
    return Math.max(0, baseAmount - excludedAmount);
  }, [discountSettings]);

  const applyExcludeSpecificDiscountAmount = useCallback((value: number) => {
    const nextExcludedAmount = roundMoney(Math.max(0, value));
    const nextBaseAmount = getAdjustedDiscountBaseAmount(discountScopeBaseAmount, {
      ...discountSettings,
      excludeSpecificDiscountAmount: nextExcludedAmount,
    });
    const nextDiscount = discountMode === "rate"
      ? roundMoney(nextBaseAmount * (1 - discountRate))
      : roundMoney(Math.min(toNumber(discountSettings?.discount), nextBaseAmount));
    const nextRate = discountMode === "rate"
      ? discountRate
      : nextBaseAmount > 0 ? roundMoney(Math.max(0, 1 - nextDiscount / nextBaseAmount)) : 1;
    updateDiscountDraftSettings((current) => ({
      ...current,
      excludeSpecificDiscountAmount: nextExcludedAmount,
      discountRate: nextRate,
      discount: nextDiscount,
    }));
  }, [discountMode, discountRate, discountScopeBaseAmount, discountSettings, getAdjustedDiscountBaseAmount, updateDiscountDraftSettings]);
  const getDiscountOptionsForType = useCallback((type: "fee" | "space" | "work_type", nextSettings: QuotationDetail["settings"] = discountSettings) => {
    if (type === "space") return getDiscountSpaceOptions(items, nextSettings);
    if (type === "work_type") return getDiscountWorkTypeOptions(items, nextSettings);
    return getDiscountScopeOptions(items, nextSettings, undiscountedTotals);
  }, [discountSettings, items, undiscountedTotals]);

  const getDiscountValueForType = useCallback((type: "fee" | "space" | "work_type", nextSettings: QuotationDetail["settings"] = discountSettings) => {
    if (type === "space") return nextSettings?.discountSpace ? `space:${nextSettings.discountSpace}` : "";
    if (type === "work_type") return nextSettings?.discountWorkType ? `work_type:${nextSettings.discountWorkType}` : "";
    return nextSettings?.discountScope || "total";
  }, [discountSettings]);

  const getDiscountSelectionPatch = useCallback((type: "fee" | "space" | "work_type", option?: DiscountScopeOption) => {
    if (type === "space") return { discountSpace: String(option?.label || "").trim() };
    if (type === "work_type") return { discountWorkType: String(option?.label || "").trim() };
    return { discountScope: option?.value || "total" };
  }, []);

  const changeDiscountType = useCallback((type: "fee" | "space" | "work_type") => {
    const nextOptions = getDiscountOptionsForType(type);
    const nextValue = getDiscountValueForType(type);
    const nextScope = nextOptions.find((option) => option.value === nextValue)
      || nextOptions.find((option) => option.value === "total")
      || nextOptions[0];
    const nextBaseAmount = getAdjustedDiscountBaseAmount(nextScope?.amount || 0);
    const nextDiscount = discountMode === "rate"
      ? roundMoney(nextBaseAmount * (1 - discountRate))
      : roundMoney(Math.min(toNumber(discountSettings?.discount), nextBaseAmount));
    const nextRate = discountMode === "rate"
      ? discountRate
      : nextBaseAmount > 0 ? roundMoney(Math.max(0, 1 - nextDiscount / nextBaseAmount)) : 1;
    updateDiscountDraftSettings((current) => ({
      ...current,
      discountType: type,
      ...getDiscountSelectionPatch(type, nextScope),
      discountRate: nextRate,
      discount: nextDiscount,
    }));
  }, [discountMode, discountRate, discountSettings?.discount, getAdjustedDiscountBaseAmount, getDiscountOptionsForType, getDiscountSelectionPatch, getDiscountValueForType, updateDiscountDraftSettings]);

  const changeDiscountScope = useCallback((value: string) => {
    const nextScope = activeDiscountOptions.find((option) => option.value === value)
      || activeDiscountOptions.find((option) => option.value === "total")
      || activeDiscountOptions[0];
    const nextBaseAmount = getAdjustedDiscountBaseAmount(nextScope?.amount || 0);
    if (discountMode === "rate") {
      const nextDiscount = roundMoney(nextBaseAmount * (1 - discountRate));
      updateDiscountDraftSettings((current) => ({
        ...current,
        ...getDiscountSelectionPatch(discountType, nextScope),
        discount: nextDiscount,
      }));
      return;
    }
    const nextDiscount = roundMoney(Math.min(toNumber(discountSettings?.discount), nextBaseAmount));
    const nextRate = nextBaseAmount > 0 ? roundMoney(Math.max(0, 1 - nextDiscount / nextBaseAmount)) : 1;
    updateDiscountDraftSettings((current) => ({
      ...current,
      ...getDiscountSelectionPatch(discountType, nextScope),
      discountRate: nextRate,
      discount: nextDiscount,
    }));
  }, [activeDiscountOptions, discountMode, discountRate, discountType, discountSettings?.discount, getAdjustedDiscountBaseAmount, getDiscountSelectionPatch, updateDiscountDraftSettings]);

  const changeDiscountExcludeRule = useCallback((key: "excludeSpecialDiscountItems" | "excludeLaborOnlyDiscountItems", enabled: boolean) => {
    const nextSettings = { ...discountSettings, [key]: enabled };
    const nextOptions = getDiscountOptionsForType(discountType, nextSettings);
    const nextValue = getDiscountValueForType(discountType, nextSettings);
    const nextScope = nextOptions.find((option) => option.value === nextValue)
      || nextOptions.find((option) => option.value === "total")
      || nextOptions[0];
    const nextBaseAmount = getAdjustedDiscountBaseAmount(nextScope?.amount || 0, nextSettings);
    if (discountMode === "rate") {
      updateDiscountDraftSettings((current) => ({
        ...current,
        [key]: enabled,
        ...getDiscountSelectionPatch(discountType, nextScope),
        discount: roundMoney(nextBaseAmount * (1 - discountRate)),
      }));
      return;
    }
    const nextDiscount = roundMoney(Math.min(toNumber(discountSettings?.discount), nextBaseAmount));
    const nextRate = nextBaseAmount > 0 ? roundMoney(Math.max(0, 1 - nextDiscount / nextBaseAmount)) : 1;
    updateDiscountDraftSettings((current) => ({
      ...current,
      [key]: enabled,
      ...getDiscountSelectionPatch(discountType, nextScope),
      discountRate: nextRate,
      discount: nextDiscount,
    }));
  }, [discountMode, discountRate, discountType, discountSettings, getAdjustedDiscountBaseAmount, getDiscountOptionsForType, getDiscountSelectionPatch, getDiscountValueForType, updateDiscountDraftSettings]);

  const switchDiscountMode = useCallback((mode: "amount" | "rate") => {
    if (mode === "amount") {
      updateDiscountDraftSettings((current) => ({ ...current, discountMode: "amount" }));
      return;
    }
    const currentDiscount = Math.min(Math.max(0, toNumber(discountSettings?.discount)), discountBaseAmount);
    const nextRate = discountBaseAmount > 0 ? roundMoney(Math.max(0, 1 - currentDiscount / discountBaseAmount)) : 1;
    setDiscountRateText(formatEditableNumber(nextRate));
    updateDiscountDraftSettings((current) => ({
      ...current,
      discountMode: "rate",
      discountRate: nextRate,
      discount: roundMoney(discountBaseAmount * (1 - nextRate)),
    }));
  }, [discountBaseAmount, discountSettings?.discount, updateDiscountDraftSettings]);
  const handleDiscountRateTextChange = useCallback((rawValue: string) => {
    if (!isValidDecimalInput(rawValue)) return;
    setDiscountRateText(rawValue);
    if (!rawValue || rawValue === ".") return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    const nextRate = Math.min(1, Math.max(0, parsed));
    const nextDiscount = roundMoney(discountBaseAmount * (1 - nextRate));
    updateDiscountDraftSettings((current) => ({
      ...current,
      discountMode: "rate",
      discountRate: nextRate,
      discount: nextDiscount,
    }));
  }, [discountBaseAmount, updateDiscountDraftSettings]);
	  const commitDiscountRateText = useCallback(() => {
	    discountRateEditingRef.current = false;
	    const parsed = Number(discountRateText || 1);
	    const nextRate = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1;
	    setDiscountRateText(formatEditableNumber(nextRate));
	    applyDiscountRate(nextRate);
	  }, [applyDiscountRate, discountRateText]);
  const openDiscountPanel = useCallback(() => {
    const nextDraft = { ...settings };
    setDiscountDraftSettings(nextDraft);
    setDiscountRateText(formatEditableNumber(Math.min(1, Math.max(0, toNumber(nextDraft.discountRate || 1)))));
    setDiscountPanelOpen(true);
  }, [settings]);
  const closeDiscountPanel = useCallback(() => {
    setDiscountPanelOpen(false);
    setDiscountDraftSettings(null);
    discountRateEditingRef.current = false;
    setDiscountRateText(formatEditableNumber(Math.min(1, Math.max(0, toNumber(settings?.discountRate || 1)))));
  }, [settings?.discountRate]);
  const confirmDiscountPanel = useCallback(() => {
    const nextSettings = discountDraftSettings || settings;
    setSettings(nextSettings);
    setDiscountPanelOpen(false);
    setDiscountDraftSettings(null);
    discountRateEditingRef.current = false;
    setDiscountRateText(formatEditableNumber(Math.min(1, Math.max(0, toNumber(nextSettings?.discountRate || 1)))));
  }, [discountDraftSettings, settings]);
  const packagePricingSummary = useMemo(
    () => normalizePackagePricingSummary(settings?.templatePricing),
    [settings?.templatePricing],
  );
  const packagePricingConfig = useMemo(
    () => packagePricingSummary ? normalizePackagePricingConfig(settings?.templatePricing, packagePricingSummary) : null,
    [packagePricingSummary, settings?.templatePricing],
  );

  useEffect(() => {
    if (packageAreaEditingRef.current) return;
    if (!packagePricingSummary) {
      setPackageAreaText("");
      return;
    }
    setPackageAreaText(formatEditableNumber(packagePricingSummary.area));
  }, [packagePricingSummary]);

  useEffect(() => {
    if (discountRateEditingRef.current) return;
    setDiscountRateText(formatEditableNumber(discountRate));
  }, [discountRate]);

	  useEffect(() => {
	    if (loading || isReadonly) return;
    if (discountPanelOpen) return;
	    if (settings?.discountMode !== "rate") return;
    const nextDiscount = roundMoney(discountBaseAmount * (1 - discountRate));
    if (Math.abs(nextDiscount - toNumber(settings?.discount)) < 0.005) return;
    setSettings((current) => ({ ...current, discount: nextDiscount }));
  }, [discountBaseAmount, discountPanelOpen, discountRate, isReadonly, loading, settings?.discount, settings?.discountMode]);

  useEffect(() => {
    if (packageDetailOpen && packagePricingSummary) {
      if (packageDetailTimerRef.current) window.clearTimeout(packageDetailTimerRef.current);
      setRenderPackageDetail(true);
      setPackageDetailVisible(false);
      const frame = window.requestAnimationFrame(() => {
        setPackageDetailHeight(packageDetailContentRef.current?.scrollHeight || 0);
        window.requestAnimationFrame(() => setPackageDetailVisible(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }
    setPackageDetailVisible(false);
    if (!renderPackageDetail) return;
    if (packageDetailTimerRef.current) window.clearTimeout(packageDetailTimerRef.current);
    packageDetailTimerRef.current = window.setTimeout(() => {
      setRenderPackageDetail(false);
      packageDetailTimerRef.current = null;
    }, 220);
  }, [packageDetailOpen, packagePricingSummary, renderPackageDetail]);

  useEffect(() => {
    if (!renderPackageDetail || !packageDetailContentRef.current) return;
    setPackageDetailHeight(packageDetailContentRef.current.scrollHeight);
  }, [renderPackageDetail, packagePricingSummary, packageAreaText]);

  useEffect(() => () => {
    if (packageDetailTimerRef.current) window.clearTimeout(packageDetailTimerRef.current);
  }, []);

  const quoteCategories = useMemo(
    () => getQuoteCategoriesForItems(settings?.quoteCategories || defaultQuoteCategories, items),
    [items, settings?.quoteCategories],
  );
  const projectQuoteCategories = useMemo(
    () => quoteCategories.filter((category) => !isOtherCategory(category)),
    [quoteCategories],
  );
  const visibleQuoteCategories = useMemo(() => {
    if (activeSpace === allSpacesValue) return quoteCategories;
    const manualCategories = manualSpaceCategories[activeSpace] || [];
    return orderQuoteCategories([...quoteCategories, ...manualCategories]);
  }, [activeSpace, manualSpaceCategories, quoteCategories]);
  const visibleProjectQuoteCategories = useMemo(
    () => visibleQuoteCategories.filter((category) => !isOtherCategory(category)),
    [visibleQuoteCategories],
  );
  const displayedProjectQuoteCategories = useMemo(() => {
    const manualCategories = manualSpaceCategories[activeSpace] || [];
    const categoriesWithItems = quoteCategories.filter((category) => {
      if (isOtherCategory(category)) return false;
      return items.some((item) => {
        if (!sameQuoteCategory(item.category, category)) return false;
        return activeSpace === allSpacesValue || inferItemSpace(item) === activeSpace;
      });
    });
    return orderQuoteCategories([...categoriesWithItems, ...manualCategories]).filter((category) => !isOtherCategory(category));
  }, [activeSpace, items, manualSpaceCategories, quoteCategories]);
  const getFirstProjectCategoryForSpace = useCallback((space: string) => {
    if (space === allSpacesValue) return projectQuoteCategories[0] || noQuoteCategoryValue;
    const spaceCategorySet = new Set(
      items
        .filter((item) => !isOtherCategory(item.category) && inferItemSpace(item) === space)
        .map((item) => getCategoryKey(item.category)),
    );
    const manualCategories = manualSpaceCategories[space] || [];
    return orderQuoteCategories([
      ...quoteCategories.filter((category) => spaceCategorySet.has(getCategoryKey(category)) || manualCategories.some((item) => sameQuoteCategory(item, category))),
      ...manualCategories,
    ]).find((category) => !isOtherCategory(category)) || projectQuoteCategories[0] || noQuoteCategoryValue;
  }, [items, manualSpaceCategories, projectQuoteCategories, quoteCategories]);
  const switchToProjectSpace = useCallback((space: string) => {
    setActiveSpace(space);
    if (isOtherCategory(activeCategory)) {
      const nextCategory = getFirstProjectCategoryForSpace(space);
      if (nextCategory !== noQuoteCategoryValue) setActiveCategory(nextCategory);
    }
  }, [activeCategory, getFirstProjectCategoryForSpace]);
  const feeFormulaContext = useMemo(
    () => buildFeeFormulaContext(items, quoteCategories),
    [items, quoteCategories],
  );
  const activeSpaces = useMemo(() => getSpacesForCategory(items, activeCategory, customSpaces), [activeCategory, customSpaces, items]);
  const spaceTabOptions = useMemo(
    () => uniqueValues([
      ...customSpaces,
      ...items
        .filter((item) => !isOtherCategory(item.category))
        .map((item) => inferItemSpace(item)),
    ]),
    [customSpaces, items],
  );
  useEffect(() => {
    updateHiddenSpaceCount();
    scheduleHiddenSpaceCountUpdate();
    const container = spaceTabsRef.current;
    if (!container || typeof window === "undefined") {
      return;
    }
    const updateAfterScroll = () => scheduleHiddenSpaceCountUpdate(120);
    const update = () => scheduleHiddenSpaceCountUpdate();
    container.addEventListener("scroll", updateAfterScroll, { passive: true });
    window.addEventListener("resize", update);
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    resizeObserver?.observe(container);
    return () => {
      container.removeEventListener("scroll", updateAfterScroll);
      window.removeEventListener("resize", update);
      resizeObserver?.disconnect();
      if (hiddenSpaceIdleTimerRef.current !== null) {
        window.clearTimeout(hiddenSpaceIdleTimerRef.current);
        hiddenSpaceIdleTimerRef.current = null;
      }
      if (hiddenSpaceFrameRef.current !== null) {
        window.cancelAnimationFrame(hiddenSpaceFrameRef.current);
        hiddenSpaceFrameRef.current = null;
      }
    };
  }, [scheduleHiddenSpaceCountUpdate, spaceTabOptions.length, updateHiddenSpaceCount]);
  const isAllSpaceView = !isOtherCategory(activeCategory) && activeSpace === allSpacesValue;
  const activeSpaceAmount = useMemo(
    () => isOtherCategory(activeCategory)
      ? 0
      : items
        .filter((item) => sameQuoteCategory(item.category, activeCategory))
        .filter((item) => isAllSpaceView || inferItemSpace(item) === activeSpace)
        .reduce((sum, item) => sum + getItemTotal(item), 0),
    [activeCategory, activeSpace, isAllSpaceView, items],
  );
  const activeItems = useMemo(() => {
    const keyword = itemSearch.trim().toLowerCase();
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => sameQuoteCategory(item.category, activeCategory))
      .filter(({ item }) => isOtherCategory(activeCategory) || isAllSpaceView || inferItemSpace(item) === activeSpace)
      .filter(({ item }) => {
        if (!keyword) return true;
        return String(item.name || "").toLowerCase().includes(keyword);
      });
  }, [activeCategory, activeSpace, isAllSpaceView, itemSearch, items]);
  const findReplaceMatches = useMemo(
    () => buildFindReplaceMatches(activeItems, findReplaceKeyword, findReplaceScopes),
    [activeItems, findReplaceKeyword, findReplaceScopes],
  );
  const activeFindReplaceHighlight = useMemo<FindReplaceActiveHighlight | null>(() => {
    if (!findReplaceOpen || findReplaceMatches.length === 0) return null;
    const match = findReplaceMatches[Math.min(findReplaceMatchIndex, findReplaceMatches.length - 1)];
    if (!match) return null;
    const item = items[match.itemIndex];
    if (!item) return null;
    return {
      ...match,
      itemKey: getQuotationItemKey(item, match.itemIndex),
      length: findReplaceKeyword.trim().length,
    };
  }, [findReplaceKeyword, findReplaceMatchIndex, findReplaceMatches, findReplaceOpen, items]);
  const activeItemKeys = useMemo(() => activeItems.map(({ item, index }) => getQuotationItemKey(item, index)), [activeItems]);
  const selectedQuoteItemKeySet = useMemo(() => new Set(selectedQuoteItemKeys), [selectedQuoteItemKeys]);
  const selectedActiveItemKeys = useMemo(
    () => activeItemKeys.filter((key) => selectedQuoteItemKeySet.has(key)),
    [activeItemKeys, selectedQuoteItemKeySet],
  );
  const selectedActiveItemCount = selectedActiveItemKeys.length;
  const otherFeeRows = useMemo(
    () => items.map((item, index) => ({ item, index })).filter(({ item }) => isOtherCategory(item.category)),
    [items],
  );
  const printQuotation = useMemo(
    () => data ? { ...data, title, terms, customer_visible_note: customerVisibleNote, status } : data,
    [customerVisibleNote, data, status, terms, title],
  );
  const savePayload = useMemo(
    () => makeSavePayload(title, terms, notes, customerVisibleNote, status, settings, customSpaces, items),
    [customSpaces, customerVisibleNote, items, notes, settings, status, terms, title],
  );
  const savePayloadText = useMemo(() => JSON.stringify(savePayload), [savePayload]);

  useEffect(() => {
    latestSavePayloadTextRef.current = savePayloadText;
  }, [savePayloadText]);

  const runAutoSave = useCallback(async () => {
    if (loading || isReadonly) return;
    if (saveInFlightRef.current) {
      queuedSaveRef.current = true;
      return;
    }

    const payloadText = latestSavePayloadTextRef.current;
    if (!payloadText || lastSavedPayloadRef.current === payloadText) return;

    saveInFlightRef.current = true;
    setAutoSaveStatus("saving");
    setAutoSaveErrorMessage("");

    try {
      const shouldAllowEmptyItems = allowEmptyItemsSaveRef.current;
      const requestBody = shouldAllowEmptyItems
        ? JSON.stringify({ ...JSON.parse(payloadText), allowEmptyItems: true })
        : payloadText;
      const res = await fetch(`/api/quotations/${quotationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: requestBody,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "自动保存失败" }));
        throw new Error(err.message || "自动保存失败");
      }
      lastSavedPayloadRef.current = payloadText;
      if (shouldAllowEmptyItems) allowEmptyItemsSaveRef.current = false;
      setAutoSaveStatus("saved");
    } catch (error: any) {
      setAutoSaveStatus("error");
      setAutoSaveErrorMessage(error?.message || "自动保存失败，请检查网络后稍等系统重试。");
    } finally {
      saveInFlightRef.current = false;
      if (queuedSaveRef.current) {
        queuedSaveRef.current = false;
        if (lastSavedPayloadRef.current !== latestSavePayloadTextRef.current) {
          window.setTimeout(() => {
            void runAutoSave();
          }, 0);
        }
      }
    }
  }, [isReadonly, loading, quotationId]);

  useEffect(() => {
    if (!visibleQuoteCategories.some((category) => sameQuoteCategory(category, activeCategory))) {
      setActiveCategory(visibleQuoteCategories.find((category) => !isOtherCategory(category)) || noQuoteCategoryValue);
      return;
    }
    if (activeCategory === noQuoteCategoryValue) return;
    if (isOtherCategory(activeCategory)) return;
    if (activeSpace === allSpacesValue) return;
    if (activeSpaces.length && !activeSpaces.includes(activeSpace)) {
      setActiveSpace(activeSpaces[0]);
    }
  }, [activeCategory, activeSpace, activeSpaces, visibleQuoteCategories]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const existingKeys = new Set(items.map((item, index) => getQuotationItemKey(item, index)));
    setSelectedQuoteItemKeys((current) => current.filter((key) => existingKeys.has(key)));
  }, [items]);

  useEffect(() => {
    const itemKey = pendingRevealItemKeyRef.current;
    if (!itemKey) return;
    pendingRevealItemKeyRef.current = null;

    const revealItem = () => {
      const row = Array.from(document.querySelectorAll<HTMLElement>("[data-quote-item-row]"))
        .find((element) => element.dataset.itemKey === itemKey);
      if (!row) return;

      const scrollContainer = row.closest<HTMLElement>(".quote-table-freeze-scroll");
      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const targetTop = scrollContainer.scrollTop + rowRect.top - containerRect.top - Math.max(12, (containerRect.height - rowRect.height) * 0.72);
        scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      } else {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
      }

      window.setTimeout(() => {
        const editable = row.querySelector<QuoteEditableElement>(quoteEditableCellSelector);
        focusQuoteCellElement(editable);
      }, 180);
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(revealItem);
    });
  }, [items]);

  useEffect(() => {
    if (!editingSpaceName) return;
    const timer = window.setTimeout(() => {
      editingSpaceInputRef.current?.focus();
      editingSpaceInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editingSpaceName]);

  const updateItem = useCallback((index: number, patch: Partial<QuotationItem>) => {
    if (isReadonly) return;
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }, [isReadonly]);

  useEffect(() => {
    if (findReplaceMatchIndex < findReplaceMatches.length) return;
    setFindReplaceMatchIndex(Math.max(0, findReplaceMatches.length - 1));
  }, [findReplaceMatchIndex, findReplaceMatches.length]);

  useEffect(() => {
    setFindReplaceMatchIndex(0);
    setFindReplaceMessage("");
    setFindReplaceLocated(false);
  }, [findReplaceKeyword, findReplaceScopes]);

  const revealFindReplaceMatch = useCallback((match?: FindReplaceMatch) => {
    if (!match) return;
    const item = items[match.itemIndex];
    if (!item) return;
    const itemKey = getQuotationItemKey(item, match.itemIndex);
    setRecentlyMovedItemKey(itemKey);
    window.requestAnimationFrame(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>("[data-quote-item-row]"))
        .find((element) => element.dataset.itemKey === itemKey);
      row?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    });
    if (movedItemTimerRef.current) window.clearTimeout(movedItemTimerRef.current);
    movedItemTimerRef.current = window.setTimeout(() => setRecentlyMovedItemKey(null), 900);
  }, [items]);

  const scrollFindReplaceResultIntoView = (index: number) => {
    window.requestAnimationFrame(() => {
      const list = findReplaceResultListRef.current;
      const result = list?.querySelector<HTMLElement>(`[data-find-replace-index="${index}"]`);
      result?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    });
  };

  const openFindReplaceDialog = () => {
    if (isReadonly) return;
    setFindReplaceOpen(true);
    setFindReplaceMatchIndex(0);
    setFindReplaceMessage("");
    setFindReplaceLocated(false);
  };

  const toggleFindReplaceScope = (scope: FindReplaceSearchScope) => {
    setFindReplaceScopes((current) => current.includes(scope)
      ? current.filter((item) => item !== scope)
      : [...current, scope]
    );
  };

  const findNextMatch = () => {
    if (!findReplaceKeyword.trim()) {
      setFindReplaceMessage("请先输入查找内容");
      return;
    }
    if (findReplaceScopes.length === 0) {
      setFindReplaceMessage("请至少选择一个查找范围");
      return;
    }
    if (findReplaceMatches.length === 0) {
      setFindReplaceMessage("当前列表未找到匹配内容");
      return;
    }
    const nextIndex = findReplaceLocated
      ? (findReplaceMatchIndex + 1) % findReplaceMatches.length
      : findReplaceMatchIndex;
    setFindReplaceMatchIndex(nextIndex);
    setFindReplaceLocated(true);
    setFindReplaceMessage(`找到 ${findReplaceMatches.length} 处，当前第 ${nextIndex + 1} 处`);
    revealFindReplaceMatch(findReplaceMatches[nextIndex]);
    scrollFindReplaceResultIntoView(nextIndex);
  };

  const selectFindReplaceMatch = (index: number) => {
    const match = findReplaceMatches[index];
    if (!match) return;
    setFindReplaceMatchIndex(index);
    setFindReplaceLocated(true);
    setFindReplaceMessage(`已定位第 ${index + 1} 处`);
    revealFindReplaceMatch(match);
    scrollFindReplaceResultIntoView(index);
  };

  const replaceCurrentMatch = () => {
    if (isReadonly) return;
    const keyword = findReplaceKeyword.trim();
    const replacement = findReplaceValue.trim();
    const match = findReplaceMatches[findReplaceMatchIndex];
    if (!keyword) {
      setFindReplaceMessage("请先输入查找内容");
      return;
    }
    if (!replacement) {
      setFindReplaceMessage("请先输入替换内容");
      return;
    }
    if (!match) {
      setFindReplaceMessage("当前列表未找到匹配内容");
      return;
    }
    setItems((current) => current.map((item, index) => {
      if (index !== match.itemIndex) return item;
      const currentValue = String(item[match.field] || "");
      const verifiedStart = currentValue.slice(match.start, match.start + keyword.length) === keyword
        ? match.start
        : currentValue.indexOf(keyword);
      if (verifiedStart < 0) return item;
      return { ...item, [match.field]: replaceTextAt(currentValue, keyword, findReplaceValue, verifiedStart) };
    }));
    setFindReplaceMessage("已替换当前匹配内容");
    revealFindReplaceMatch(match);
  };

  const replaceAllMatchesNow = () => {
    if (isReadonly) return;
    const keyword = findReplaceKeyword.trim();
    const replacement = findReplaceValue.trim();
    if (!keyword || !replacement || findReplaceScopes.length === 0 || findReplaceMatches.length === 0) return;
    const visibleIndexes = new Set(activeItems.map(({ index }) => index));
    let replacedCount = 0;
    setItems((current) => current.map((item, index) => {
      if (!visibleIndexes.has(index)) return item;
      const next: QuotationItem = { ...item };
      getFindReplaceTargets(item, findReplaceScopes).forEach(({ field, value }) => {
        const count = value.split(keyword).length - 1;
        if (count <= 0) return;
        replacedCount += count;
        next[field] = value.split(keyword).join(findReplaceValue);
      });
      return next;
    }));
    setFindReplaceMatchIndex(0);
    setFindReplaceLocated(false);
    setFindReplaceMessage(`已全部替换 ${replacedCount} 处`);
  };

  const confirmReplaceAllMatches = () => {
    const keyword = findReplaceKeyword.trim();
    const replacement = findReplaceValue.trim();
    if (!keyword) {
      setFindReplaceMessage("请先输入查找内容");
      return;
    }
    if (!replacement) {
      setFindReplaceMessage("请先输入替换内容");
      return;
    }
    if (findReplaceScopes.length === 0) {
      setFindReplaceMessage("请至少选择一个查找范围");
      return;
    }
    if (findReplaceMatches.length === 0) {
      setFindReplaceMessage("当前列表未找到匹配内容");
      return;
    }
    showConfirm({
      title: "全部替换",
      message: `确定将当前列表中的「${keyword}」全部替换为「${replacement}」吗？只会修改已选择的文字范围，不会影响数量、单价和金额。`,
      tone: "info",
      confirmText: "全部替换",
      onConfirm: replaceAllMatchesNow,
    });
  };

  const copyItem = (index: number) => {
    if (isReadonly) return;
    const copiedKey = makeClientItemKey();
    setItems((current) => {
      const source = current[index];
      if (!source) return current;
      const copy = withoutStoredIdentity(source);
      const copiedItem: QuotationItem = {
        ...copy,
        client_key: copiedKey,
        name: source.name ? `${source.name} 副本` : "",
      };
      const next = [...current];
      next.splice(index + 1, 0, copiedItem);
      return isOtherCategory(source.category) ? remapOtherFeeReferences(current, next) : next;
    });
    setRecentlyMovedItemKey(copiedKey);
    if (movedItemTimerRef.current) window.clearTimeout(movedItemTimerRef.current);
    movedItemTimerRef.current = window.setTimeout(() => setRecentlyMovedItemKey(null), 650);
  };

  const copyItemToSpace = (index: number, space: string) => {
    if (isReadonly) return;
    let copiedKey = "";
    setItems((current) => {
      const source = current[index];
      if (!source || isOtherCategory(source.category)) return current;
      const copied = cloneItemForSpace(source, space);
      copiedKey = copied.client_key || "";
      return [...current, copied];
    });
    setActiveSpace(space);
    setRowCopyMenu(null);
    setRowMenu(null);
    if (copiedKey) {
      setRecentlyMovedItemKey(copiedKey);
      if (movedItemTimerRef.current) window.clearTimeout(movedItemTimerRef.current);
      movedItemTimerRef.current = window.setTimeout(() => setRecentlyMovedItemKey(null), 650);
    }
  };

  const makeInsertedItem = (source: QuotationItem): QuotationItem => {
    const copy = withoutStoredIdentity(source);
    const isOther = isOtherCategory(source.category);
    return {
      ...copy,
      client_key: makeClientItemKey(),
      name: "",
      spec: "",
      material_model: "",
      remark: "",
      unit: "",
      quantity: isOther ? 1 : 0,
      unit_price: 0,
      material_cost: 0,
      labor_cost: 0,
      profit_margin: 0,
      fee_rate: 0,
      row_color: null,
      ...(isOther ? getFeeCalcMethodPatch(normalizeFeeCalcMethod(source.fee_calc_method), { ...source, unit_price: 0, fee_rate: 0, quantity: 1 }) : {}),
    };
  };

  const insertItemNear = (index: number, position: "before" | "after") => {
    if (isReadonly) return;
    let insertedKey = "";
    setItems((current) => {
      const source = current[index];
      if (!source) return current;
      const insertedItem = makeInsertedItem(source);
      insertedKey = insertedItem.client_key || "";
      const next = [...current];
      next.splice(position === "before" ? index : index + 1, 0, insertedItem);
      return isOtherCategory(source.category) ? remapOtherFeeReferences(current, next) : next;
    });
    if (insertedKey) {
      pendingRevealItemKeyRef.current = insertedKey;
      setRecentlyMovedItemKey(insertedKey);
      if (movedItemTimerRef.current) window.clearTimeout(movedItemTimerRef.current);
      movedItemTimerRef.current = window.setTimeout(() => setRecentlyMovedItemKey(null), 650);
    }
  };

  const appendManualItem = (category: QuotationItem["category"], space?: string) => {
    if (isReadonly) return;
    const item = newItem(category, space);
    const itemKey = item.client_key || "";
    pendingRevealItemKeyRef.current = itemKey;
    setItemSearch("");
    setItems((current) => [...current, item]);
    if (itemKey) {
      setRecentlyMovedItemKey(itemKey);
      if (movedItemTimerRef.current) window.clearTimeout(movedItemTimerRef.current);
      movedItemTimerRef.current = window.setTimeout(() => setRecentlyMovedItemKey(null), 650);
    }
  };

  const patchRowColor = (index: number, value: string) => {
    if (isReadonly) return;
    updateItem(index, { row_color: value || null });
  };

  const openAttributionDialog = (index: number) => {
    if (isReadonly) return;
    const item = items[index];
    if (!item || isOtherCategory(item.category)) return;
    setRowMenu(null);
    setRowCopyMenu(null);
    setAttributionDialog({ index });
  };

  const saveAttribution = (index: number, workTypeId: string, materialCategoryId: string) => {
    if (isReadonly) return;
    const workType = workTypeOptions.find((item) => item.id === workTypeId);
    const materialCategory = materialCategoryOptions.find((item) => item.id === materialCategoryId);
    updateItem(index, {
      work_type_id: workType?.id || null,
      work_type_name: workType?.name || null,
      material_category_id: materialCategory?.id || null,
      material_category_name: materialCategory?.name || null,
    });
    setAttributionDialog(null);
  };

  const clearItemContent = (index: number) => {
    if (isReadonly) return;
    setItems((current) => current.map((item, i) => {
      if (i !== index) return item;
      if (isOtherCategory(item.category)) {
        return {
          ...item,
          name: "",
          spec: "",
          remark: "",
          unit_price: 0,
          quantity: 1,
          fee_rate: 0,
          row_color: null,
        };
      }
      return {
        ...item,
        name: "",
        spec: "",
        material_model: "",
        remark: "",
        unit: "",
        quantity: 0,
        unit_price: 0,
        material_cost: 0,
        labor_cost: 0,
        profit_margin: 0,
        row_color: null,
      };
    }));
  };

  const removeItem = (index: number) => {
    if (isReadonly) return;
    const key = items[index] ? getQuotationItemKey(items[index], index) : "";
    setItems((current) => current.filter((_, i) => i !== index));
    if (key) setSelectedQuoteItemKeys((current) => current.filter((item) => item !== key));
  };

  const toggleQuoteItemSelection = useCallback((key: string) => {
    if (isReadonly || !key) return;
    setSelectedQuoteItemKeys((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]
    );
  }, [isReadonly]);

  const saveItemToCustomLibrary = async (index: number) => {
    if (isReadonly) return;
    const item = items[index];
    if (!item || isOtherCategory(item.category)) return;
    if (isStandardQuotaSourceItem(item)) {
      showAlert("无法保存到自定义库", "该项目来源于基装定额库，不能重复保存到自定义库。");
      setRowMenu(null);
      return;
    }
    if (!String(item.name || "").trim()) {
      showAlert("无法保存到自定义库", "请先填写项目名称。");
      return;
    }
    if (!String(item.unit || "").trim()) {
      showAlert("无法保存到自定义库", "请先填写单位。");
      return;
    }
    setRowMenu(null);
    const laborPrice = toMoney(toNumber(item.labor_cost));
    const materialPrice = toMoney(toNumber(item.material_cost));
    const totalPrice = toMoney(toNumber(item.unit_price) || laborPrice + materialPrice);
    try {
      const response = await fetch("/api/quota/custom-library", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          category: getCategoryLabel(item.category),
          workTypeId: item.work_type_id,
          workTypeName: item.work_type_name,
          materialCategoryId: item.material_category_id,
          materialCategoryName: item.material_category_name,
          name: item.name,
          constructionDescription: item.spec,
          unit: item.unit,
          laborPrice,
          materialPrice,
          totalPrice,
          sourceQuotationId: quotationId,
          sourceQuotationItemId: item.id || item.client_key || "",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "保存失败");
      showAlert(
        result.duplicated ? "自定义库已存在" : "已保存到自定义库",
        result.duplicated ? "同门店、同分类、同名称和单位的项目已在自定义库中，本次没有重复新增。" : "该项目已进入自定义库，需要在定额管理中转正为标准定额后，才可以在报价中选择使用。",
      );
    } catch (error: any) {
      showAlert("保存失败", error?.message || "自定义库保存失败，请稍后再试", "danger");
    }
  };

  const openQuotaPicker = () => {
    if (isReadonly) return;
    setSpaceMenu(null);
    setSpaceCopyMenu(null);
    setRowMenu(null);
    setRowCopyMenu(null);
    setQuotaLibraryItems(loadQuotaLibraryItemsFromStorage());
    setQuotaPickerOpen(true);
  };

  const insertQuotaLibraryItems = (selectedItems: QuotaLibraryItem[]) => {
    if (isReadonly || !selectedItems.length) return;
    const targetSpace = isAllSpaceView ? "" : activeSpace;
    const insertedItems = selectedItems.map((quota) => createQuotationItemFromQuota(quota, activeCategory, targetSpace));
    const insertedKey = insertedItems[0]?.client_key || "";
    pendingRevealItemKeyRef.current = insertedKey;
    setItemSearch("");
    setItems((current) => [...current, ...insertedItems]);
    setQuotaPickerOpen(false);
    if (insertedKey) {
      setRecentlyMovedItemKey(insertedKey);
      if (movedItemTimerRef.current) window.clearTimeout(movedItemTimerRef.current);
      movedItemTimerRef.current = window.setTimeout(() => setRecentlyMovedItemKey(null), 650);
    }
  };

  const openProductPicker = async () => {
    if (isReadonly) return;
    setSpaceMenu(null);
    setSpaceCopyMenu(null);
    setRowMenu(null);
    setRowCopyMenu(null);
    setProductPickerOpen(true);
    setProductPickerLoading(true);
    try {
      const response = await fetch("/api/materials?view=library", { headers: authHeaders() });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "主材产品加载失败");
      setProductLibraryItems(createProductLibraryPicks(Array.isArray(result.materials) ? result.materials : []));
    } catch (error: any) {
      setProductLibraryItems([]);
      showAlert("产品库加载失败", error?.message || "主材产品加载失败，请稍后再试", "danger");
    } finally {
      setProductPickerLoading(false);
    }
  };

  const insertProductLibraryItems = (selectedItems: ProductLibraryPick[]) => {
    if (isReadonly || !selectedItems.length) return;
    const targetSpace = isAllSpaceView ? "" : activeSpace;
    const insertedItems = selectedItems.map((product) => createQuotationItemFromProduct(product, activeCategory, targetSpace));
    const insertedKey = insertedItems[0]?.client_key || "";
    pendingRevealItemKeyRef.current = insertedKey;
    setItemSearch("");
    setItems((current) => [...current, ...insertedItems]);
    setProductPickerOpen(false);
    if (insertedKey) {
      setRecentlyMovedItemKey(insertedKey);
      if (movedItemTimerRef.current) window.clearTimeout(movedItemTimerRef.current);
      movedItemTimerRef.current = window.setTimeout(() => setRecentlyMovedItemKey(null), 650);
    }
  };

  const openRowMenu: RowMenuOpenHandler = (event, index) => {
    if (isReadonly) return;
    event.preventDefault();
    event.stopPropagation();
    setSpaceMenu(null);
    setSpaceCopyMenu(null);
    setRowCopyMenu(null);
    setRowMenu({ index, x: event.clientX, y: event.clientY });
  };

  const reorderItem = useCallback((sourceIndex: number, targetIndex: number, position: ItemDropPosition) => {
    if (isReadonly) return false;
    if (sourceIndex === targetIndex) return false;
    const current = itemsRef.current;
    const sourceItem = current[sourceIndex];
    const targetItem = current[targetIndex];
    if (!sourceItem || !targetItem) return false;
    if (sourceItem.category !== targetItem.category) return false;

    const next = [...current];
    const [moved] = next.splice(sourceIndex, 1);
    let insertIndex = targetIndex;
    if (sourceIndex < targetIndex) insertIndex -= 1;
    if (position === "after") insertIndex += 1;
    insertIndex = Math.max(0, Math.min(insertIndex, next.length));
    if (insertIndex === sourceIndex) return false;

    const movedKey = getQuotationItemKey(moved, sourceIndex);
    next.splice(insertIndex, 0, moved);
    const nextItems = isOtherCategory(moved.category) ? remapOtherFeeReferences(current, next) : next;
    itemsRef.current = nextItems;
    setItems(nextItems);
    setRecentlyMovedItemKey(movedKey);
    if (movedItemTimerRef.current) window.clearTimeout(movedItemTimerRef.current);
    movedItemTimerRef.current = window.setTimeout(() => setRecentlyMovedItemKey(null), 650);
    return true;
  }, [isReadonly]);

  useEffect(() => () => {
    if (movedItemTimerRef.current) window.clearTimeout(movedItemTimerRef.current);
  }, []);

  const startPointerItemDrag = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (isReadonly) return;
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    pointerItemDragRef.current = {
      sourceIndex: index,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
      targetIndex: index,
      position: "after",
      scrollContainer: getItemDragScrollContainer(event.currentTarget),
    };
    setDraggingItemIndex(null);
    setDragOverItem(null);
  };

  const updateSpaces = useCallback((updater: (spaces: string[]) => string[]) => {
    if (isReadonly) return;
    setCustomSpaces((current) => {
      const next = uniqueValues(updater(current));
      setSettings((settings) => ({ ...settings, quoteSpaces: next }));
      return next;
    });
  }, [isReadonly]);

  const updateCategories = (updater: (categories: string[]) => string[]) => {
    if (isReadonly) return;
    setSettings((current) => ({
      ...current,
      quoteCategories: orderQuoteCategories(updater(orderQuoteCategories(current?.quoteCategories || quoteCategories))),
    }));
  };

  const showAlert = (title: string, message: string, tone: QuoteSystemDialogState["tone"] = "info") => {
    setSystemDialog({ title, message, tone, confirmText: "知道了" });
  };

  const showConfirm = ({
    title,
    message,
    tone = "danger",
    confirmText = "确定",
    cancelText = "取消",
    onConfirm,
  }: QuoteSystemDialogState) => {
    setSystemDialog({ title, message, tone, confirmText, cancelText, onConfirm });
  };

  const deleteSelectedQuoteItems = useCallback(() => {
    if (isReadonly || selectedActiveItemKeys.length === 0) return;
    const keysToDelete = new Set(selectedActiveItemKeys);
    const count = keysToDelete.size;
    showConfirm({
      title: "批量删除项目",
      message: `确定删除当前列表中已勾选的 ${count} 条报价项目吗？删除后系统会自动保存。`,
      confirmText: "删除",
      onConfirm: () => {
        allowEmptyItemsSaveRef.current = true;
        setItems((current) => current.filter((item, index) => !keysToDelete.has(getQuotationItemKey(item, index))));
        setSelectedQuoteItemKeys((current) => current.filter((key) => !keysToDelete.has(key)));
      },
    });
  }, [isReadonly, selectedActiveItemKeys]);

  const openProjectInfoEditor = () => {
    if (!data || isReadonly) return;
    setProjectInfoForm({
      customerName: String(data.customer_name || "").trim(),
      designerName: String(data.designer_name || "").trim(),
      customerPhone: normalizeProjectInfoPhone(data.customer_phone),
      customerWeixin: String(data.customer_weixin || "").trim(),
      customerAddress: String(data.customer_address || "").trim(),
      houseAddress: String(data.customer_house_address || data.project_address || "").trim(),
      addressLocationName: String(data.customer_address_location_name || "").trim(),
      addressLocationAddress: String(data.customer_address_location_address || "").trim(),
      addressLatitude: data.customer_address_latitude === undefined || data.customer_address_latitude === null ? "" : String(data.customer_address_latitude),
      addressLongitude: data.customer_address_longitude === undefined || data.customer_address_longitude === null ? "" : String(data.customer_address_longitude),
      buildingNo: String(data.customer_building_no || "").trim(),
      unitNo: String(data.customer_unit_no || "").trim(),
      roomNo: String(data.customer_room_no || "").trim(),
      noRoomNumber: Number(data.customer_no_room_number || 0) === 1,
      areaSize: formatProjectInfoArea(data.customer_area_size ?? data.project_area),
      decorationType: String(data.customer_decoration_type || "").trim(),
      notes: String(data.notes || "").trim(),
      customerVisibleNote: String(data.customer_visible_note || "").trim(),
    });
    setProjectInfoOpen(true);
  };

  useEffect(() => {
    if (loading || !data || isReadonly || projectInfoOpen || autoOpenProjectInfoRef.current) return;
    if (searchParams.get("editProjectInfo") !== "1") return;
    autoOpenProjectInfoRef.current = true;
    setProjectInfoForm({
      customerName: String(data.customer_name || "").trim(),
      designerName: String(data.designer_name || "").trim(),
      customerPhone: normalizeProjectInfoPhone(data.customer_phone),
      customerWeixin: String(data.customer_weixin || "").trim(),
      customerAddress: String(data.customer_address || "").trim(),
      houseAddress: String(data.customer_house_address || data.project_address || "").trim(),
      addressLocationName: String(data.customer_address_location_name || "").trim(),
      addressLocationAddress: String(data.customer_address_location_address || "").trim(),
      addressLatitude: data.customer_address_latitude === undefined || data.customer_address_latitude === null ? "" : String(data.customer_address_latitude),
      addressLongitude: data.customer_address_longitude === undefined || data.customer_address_longitude === null ? "" : String(data.customer_address_longitude),
      buildingNo: String(data.customer_building_no || "").trim(),
      unitNo: String(data.customer_unit_no || "").trim(),
      roomNo: String(data.customer_room_no || "").trim(),
      noRoomNumber: Number(data.customer_no_room_number || 0) === 1,
      areaSize: formatProjectInfoArea(data.customer_area_size ?? data.project_area),
      decorationType: String(data.customer_decoration_type || "").trim(),
      notes: String(data.notes || "").trim(),
      customerVisibleNote: String(data.customer_visible_note || "").trim(),
    });
    setProjectInfoOpen(true);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("editProjectInfo");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/quotations/${quotationId}?${nextQuery}` : `/quotations/${quotationId}`, { scroll: false });
  }, [data, isReadonly, loading, projectInfoOpen, quotationId, router, searchParams]);

  const updateProjectInfoAddressText = (value: string) => {
    setProjectInfoForm((current) => ({
      ...current,
      customerAddress: value,
      houseAddress: value,
      addressLocationName: "",
      addressLocationAddress: "",
      addressLatitude: "",
      addressLongitude: "",
    }));
  };

  const applyProjectInfoPickedLocation = (location: LocationPick) => {
    const address = location.name || location.address || "";
    const fullAddress = location.address || location.name || address;
    setProjectInfoForm((current) => ({
      ...current,
      customerAddress: address,
      houseAddress: fullAddress,
      addressLocationName: address,
      addressLocationAddress: fullAddress,
      addressLatitude: location.latitude === null ? "" : String(location.latitude),
      addressLongitude: location.longitude === null ? "" : String(location.longitude),
    }));
    setProjectInfoMapPickerOpen(false);
  };

  const submitProjectInfo = async () => {
    if (projectInfoSaving) return;
    const customerName = projectInfoForm.customerName.trim();
    const customerAddress = projectInfoForm.customerAddress.trim();
    if (!customerAddress) {
      showAlert("请填写小区/地址", "小区/地址不能为空。");
      return;
    }
    setProjectInfoSaving(true);
    try {
      const res = await fetch(`/api/quotations/${quotationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          action: "updateProjectInfo",
          customer_name: customerName,
          designer_name: projectInfoForm.designerName.trim(),
          customer_phone: projectInfoForm.customerPhone.trim(),
          customer_weixin: projectInfoForm.customerWeixin.trim(),
          customer_address: customerAddress,
          house_address: projectInfoForm.houseAddress.trim(),
          address_location_name: projectInfoForm.addressLocationName.trim(),
          address_location_address: projectInfoForm.addressLocationAddress.trim(),
          address_latitude: projectInfoForm.addressLatitude,
          address_longitude: projectInfoForm.addressLongitude,
          building_no: projectInfoForm.noRoomNumber ? "" : projectInfoForm.buildingNo.trim(),
          unit_no: projectInfoForm.noRoomNumber ? "" : projectInfoForm.unitNo.trim(),
          room_no: projectInfoForm.noRoomNumber ? "" : projectInfoForm.roomNo.trim(),
          no_room_number: projectInfoForm.noRoomNumber,
          area_size: toNumber(projectInfoForm.areaSize),
          decoration_type: projectInfoForm.decorationType.trim(),
          quote_notes: projectInfoForm.notes.trim(),
          customer_visible_note: projectInfoForm.customerVisibleNote.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "基础信息保存失败");
      setProjectInfoOpen(false);
      await load();
      showAlert("已保存", "本次报价客户信息已更新。");
    } catch (error: any) {
      showAlert("保存失败", error?.message || "基础信息保存失败", "danger");
    } finally {
      setProjectInfoSaving(false);
    }
  };

  const addCategoryByType = (type: string) => {
    if (isReadonly) return;
    if (activeSpace === allSpacesValue) {
      showAlert("请先选择空间", "全部是汇总视图，不能直接新增报价大类。请先选择客餐厅、卧室等具体空间。");
      setCategoryCreateMenu(null);
      return;
    }
    setCategoryCreateMenu(null);
    const nextName = type === "custom_cabinet" ? "custom_cabinet" : type;
    if (!nextName) return;
    if (!quoteCategories.some((category) => sameQuoteCategory(category, nextName))) {
      updateCategories((categories) => [...categories, nextName]);
    }
    setManualSpaceCategories((current) => ({
      ...current,
      [activeSpace]: uniqueValues([...(current[activeSpace] || []), nextName]),
    }));
    if (activeSpace === allSpacesValue) setActiveSpace(allSpacesValue);
    setActiveCategory(nextName);
  };

  const openCategoryCreateMenu = (event: MouseEvent<HTMLElement>) => {
    if (isReadonly) return;
    event.preventDefault();
    event.stopPropagation();
    setSpaceMenu(null);
    setSpaceCopyMenu(null);
    setRowMenu(null);
    setRowCopyMenu(null);
    const rect = event.currentTarget.getBoundingClientRect();
    setCategoryCreateMenu({ x: rect.left, y: rect.bottom + 8 });
  };

  const deleteCustomCategory = (category: string) => {
    if (isReadonly) return;
    if (defaultQuoteCategories.includes(category)) return;
    const categoryLabel = getCategoryLabel(category);
    if (!isOtherCategory(category) && activeSpace !== allSpacesValue) {
      const count = items.filter((item) => sameQuoteCategory(item.category, category) && inferItemSpace(item) === activeSpace).length;
      const manualVisible = (manualSpaceCategories[activeSpace] || []).some((item) => sameQuoteCategory(item, category));
      if (!count) {
        if (!manualVisible) {
          showAlert("暂无可删除内容", `「${activeSpace}」下暂无${categoryLabel}明细可删除`);
          return;
        }
        showConfirm({
          title: "移除类别",
          message: `确定从「${activeSpace}」移除「${categoryLabel}」大类吗？`,
          confirmText: "移除",
          onConfirm: () => {
            setManualSpaceCategories((current) => ({
              ...current,
              [activeSpace]: (current[activeSpace] || []).filter((item) => !sameQuoteCategory(item, category)),
            }));
            if (sameQuoteCategory(activeCategory, category)) {
              setActiveCategory(visibleProjectQuoteCategories.find((item) => !sameQuoteCategory(item, category)) || noQuoteCategoryValue);
            }
          },
        });
        return;
      }
      showConfirm({
        title: "删除当前空间类别",
        message: `确定删除「${activeSpace}」下的「${categoryLabel}」大类吗？只会删除当前空间的 ${count} 条明细，不会影响其他空间。`,
        confirmText: "删除",
        onConfirm: () => {
          setItems((current) => current.filter((item) => !(sameQuoteCategory(item.category, category) && inferItemSpace(item) === activeSpace)));
          setManualSpaceCategories((current) => ({
            ...current,
            [activeSpace]: (current[activeSpace] || []).filter((item) => !sameQuoteCategory(item, category)),
          }));
          if (sameQuoteCategory(activeCategory, category)) {
            setActiveCategory(visibleProjectQuoteCategories.find((item) => !sameQuoteCategory(item, category)) || noQuoteCategoryValue);
          }
        },
      });
      return;
    }
    const count = items.filter((item) => sameQuoteCategory(item.category, category)).length;
    showConfirm({
      title: "删除类别",
      message: count ? `确定删除「${categoryLabel}」大类吗？该大类下全部空间的 ${count} 条明细也会一起删除。` : `确定删除「${categoryLabel}」大类吗？`,
      confirmText: "删除",
      onConfirm: () => {
        setItems((current) => current.filter((item) => !sameQuoteCategory(item.category, category)));
        updateCategories((categories) => categories.filter((item) => !sameQuoteCategory(item, category)));
        setActiveCategory(projectQuoteCategories.find((item) => !sameQuoteCategory(item, category)) || noQuoteCategoryValue);
        setActiveSpace(allSpacesValue);
      },
    });
  };

  const commitSpaceName = (name: string) => {
    const nextName = String(name || "").trim();
    if (!nextName) return;
    updateSpaces((spaces) => [...spaces, nextName]);
    switchToProjectSpace(nextName);
    return true;
  };

  const getNextSpaceName = () => {
    const existing = new Set(uniqueValues([...customSpaces, ...activeSpaces]));
    let index = existing.size + 1;
    let nextName = `空间${index}`;
    while (existing.has(nextName)) {
      index += 1;
      nextName = `空间${index}`;
    }
    return nextName;
  };

  const renameSpaceInline = (space: string, value: string) => {
    const nextName = String(value || "").trim();
    if (!nextName || nextName === space) {
      setEditingSpaceName(null);
      setEditingSpaceValue("");
      return true;
    }
    if (activeSpaces.some((item) => item !== space && item === nextName)) {
      showAlert("空间已存在", "空间名称已存在");
      return false;
    }
    updateSpaces((spaces) => spaces.map((item) => item === space ? nextName : item));
    setItems((current) => current.map((item) => inferItemSpace(item) === space ? { ...item, space: nextName } : item));
    setActiveSpace(nextName);
    setEditingSpaceName(null);
    setEditingSpaceValue("");
    return true;
  };

  const startInlineRenameSpace = (space: string) => {
    if (isReadonly) return;
    setSpaceMenu(null);
    setEditingSpaceName(space);
    setEditingSpaceValue(space);
  };

  const addSpace = () => {
    if (isReadonly) return;
    const nextName = getNextSpaceName();
    commitSpaceName(nextName);
    setEditingSpaceName(nextName);
    setEditingSpaceValue(nextName);
  };

  const openSpaceMenu = (event: MouseEvent<HTMLButtonElement>, space: string) => {
    if (isReadonly) return;
    event.preventDefault();
    setRowMenu(null);
    setSpaceCopyMenu(null);
    setActiveSpace(space);
    setSpaceMenu({ space, x: event.clientX, y: event.clientY });
  };

  const openCopySpaceMenu = (event: MouseEvent<HTMLButtonElement>, source: string) => {
    if (isReadonly) return;
    event.stopPropagation();
    const x = typeof window === "undefined" ? event.clientX : Math.min(event.clientX + 12, window.innerWidth - 240);
    const y = typeof window === "undefined" ? event.clientY : Math.min(event.clientY - 8, window.innerHeight - 320);
    setSpaceCopyMenu({ source, x, y });
  };

  const openCopyRowMenu = (event: MouseEvent<HTMLButtonElement>, index: number) => {
    if (isReadonly) return;
    event.stopPropagation();
    const x = typeof window === "undefined" ? event.clientX : Math.min(event.clientX + 12, window.innerWidth - 240);
    const y = typeof window === "undefined" ? event.clientY : Math.min(event.clientY - 8, window.innerHeight - 320);
    setRowCopyMenu({ index, x, y });
  };

  const renameSpace = (space: string) => {
    if (isReadonly) return;
    setSpaceMenu(null);
    setNameDialog({
      title: "重命名空间",
      description: `修改「${space}」的空间名称，相关报价明细会同步更新。`,
      label: "空间名称",
      placeholder: "请输入新的空间名称",
      defaultValue: space,
      confirmText: "保存",
      kind: "space",
      lockKind: true,
      onConfirm: (value) => {
        const nextName = String(value || "").trim();
        if (!nextName || nextName === space) return true;
        if (activeSpaces.includes(nextName)) {
          showAlert("空间已存在", "空间名称已存在");
          return false;
        }
        updateSpaces((spaces) => spaces.map((item) => item === space ? nextName : item));
        setItems((current) => current.map((item) => inferItemSpace(item) === space ? { ...item, space: nextName } : item));
        setActiveSpace(nextName);
        return true;
      },
    });
  };

  const copySpace = (space: string) => {
    if (isReadonly) return;
    const nextName = getNextCopyName(space, customSpaces.length ? customSpaces : activeSpaces);
    const sourceItems = items.filter((item) => !isOtherCategory(item.category) && inferItemSpace(item) === space);
    updateSpaces((spaces) => {
      const index = spaces.indexOf(space);
      const next = [...spaces];
      next.splice(index >= 0 ? index + 1 : next.length, 0, nextName);
      return next;
    });
    if (sourceItems.length) {
      setItems((current) => [...current, ...sourceItems.map((item) => cloneItemForSpace(item, nextName))]);
    }
    setActiveSpace(nextName);
    setSpaceMenu(null);
  };

  const openCopySpaceCategoryDialog = (source: string, target: string) => {
    if (isReadonly) return;
    if (!target || target === source) return;
    setSpaceCopyMenu(null);
    setSpaceMenu(null);
    setCopySpaceCategoryDialog({
      source,
      target,
      categories: [...builtInDirectCategories],
    });
  };

  const toggleCopySpaceCategory = (category: string) => {
    setCopySpaceCategoryDialog((current) => {
      if (!current) return current;
      const selected = current.categories.some((item) => sameQuoteCategory(item, category));
      return {
        ...current,
        categories: selected
          ? current.categories.filter((item) => !sameQuoteCategory(item, category))
          : [...current.categories, category],
      };
    });
  };

  const copySpaceItemsToTarget = (source: string, target: string, categories: string[]) => {
    if (isReadonly) return;
    if (!target || target === source) return;
    if (!categories.length) {
      showAlert("请选择复制类型", "请至少选择基装、产品、定制柜中的一种。");
      return;
    }
    const sourceItems = items.filter((item) => {
      if (!isDirectItemCategory(item.category) || inferItemSpace(item) !== source) return false;
      return categories.some((category) => sameQuoteCategory(item.category, category));
    });
    if (!sourceItems.length) {
      const categoryNames = categories.map(getCategoryLabel).join("、");
      showAlert("暂无可复制项目", `「${source}」暂无可复制的${categoryNames}项目`);
      setCopySpaceCategoryDialog(null);
      return;
    }
    setItems((current) => [...current, ...sourceItems.map((item) => cloneItemForSpace(item, target))]);
    setActiveSpace(target);
    setSpaceCopyMenu(null);
    setSpaceMenu(null);
    setCopySpaceCategoryDialog(null);
  };

  const clearSpaceCategoryItems = (space: string) => {
    if (isReadonly) return;
    const count = items.filter((item) => !isOtherCategory(item.category) && inferItemSpace(item) === space).length;
    if (!count) {
      setSpaceMenu(null);
      return;
    }
    showConfirm({
      title: "清空该空间/类别",
      message: `确定清空「${space}」下的所有内容吗？该操作会清空该空间/类别中的基装、产品、定制柜项目，但不会删除空间/类别本身。`,
      confirmText: "清空",
      onConfirm: () => {
        setItems((current) => current.filter((item) => isOtherCategory(item.category) || inferItemSpace(item) !== space));
        setSpaceMenu(null);
      },
    });
  };

  const deleteSpace = (space: string) => {
    if (isReadonly) return;
    showConfirm({
      title: "删除空间/类别",
      message: `确定删除空间「${space}」吗？该空间下的基装、产品和定制柜明细也会一起删除。`,
      confirmText: "删除",
      onConfirm: () => {
        updateSpaces((spaces) => spaces.filter((item) => item !== space));
        setItems((current) => current.filter((item) => inferItemSpace(item) !== space));
        const fallback = activeSpaces.find((item) => item !== space) || allSpacesValue;
        setActiveSpace(fallback);
        setSpaceMenu(null);
      },
    });
  };

  const moveSpace = (space: string, direction: -1 | 1) => {
    if (isReadonly) return;
    updateSpaces((spaces) => {
      const index = spaces.indexOf(space);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= spaces.length) return spaces;
      const next = [...spaces];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
    setSpaceMenu(null);
  };

  const reorderSpace = useCallback((source: string, target: string) => {
    if (isReadonly) return;
    if (!source || !target || source === target) return;
    updateSpaces((spaces) => {
      const next = uniqueValues([...spaces, ...activeSpaces]);
      const sourceIndex = next.indexOf(source);
      const targetIndex = next.indexOf(target);
      if (sourceIndex < 0 || targetIndex < 0) return spaces;
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setActiveSpace(source);
  }, [activeSpaces, isReadonly, updateSpaces]);

  const startPointerSpaceDrag = (event: ReactPointerEvent<HTMLButtonElement>, space: string) => {
    if (isReadonly) return;
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    pointerSpaceDragRef.current = { source: space, startX: event.clientX, startY: event.clientY, moved: false, target: space };
    suppressSpaceClickRef.current = false;
    setSpaceMenu(null);
  };

  useEffect(() => {
    const getTargetSpace = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      return element?.closest<HTMLElement>("[data-space-tab]")?.dataset.space || null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerSpaceDragRef.current;
      if (!state) return;
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.moved && distance > 6) {
        state.moved = true;
        suppressSpaceClickRef.current = true;
        setDraggingSpace(state.source);
      }
      if (!state.moved) return;
      const target = getTargetSpace(event.clientX, event.clientY);
      state.target = target;
      setDragOverSpace(target || state.source);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerSpaceDragRef.current;
      if (!state) return;
      pointerSpaceDragRef.current = null;
      if (state.moved) {
        const target = getTargetSpace(event.clientX, event.clientY) || state.target;
        if (target) reorderSpace(state.source, target);
        window.setTimeout(() => {
          suppressSpaceClickRef.current = false;
        }, 0);
      } else {
        suppressSpaceClickRef.current = false;
      }
      setDraggingSpace(null);
      setDragOverSpace(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [reorderSpace]);

  useEffect(() => {
    const getTargetItem = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const row = element?.closest<HTMLElement>("[data-quote-item-row]");
      if (!row?.dataset.index) return null;
      const index = Number(row.dataset.index);
      if (!Number.isFinite(index)) return null;
      const rect = row.getBoundingClientRect();
      const position: ItemDropPosition = clientY < rect.top + rect.height / 2 ? "before" : "after";
      return { index, position };
    };

    let autoScrollFrame: number | null = null;
    let previousAutoScrollTime = 0;

    const updateTargetItem = (clientX: number, clientY: number, preserveOnMiss = false) => {
      const state = pointerItemDragRef.current;
      if (!state) return;
      const target = getTargetItem(clientX, clientY);
      if (!target || target.index === state.sourceIndex) {
        if (!preserveOnMiss) {
          state.targetIndex = null;
          setDragOverItem(null);
        }
        return;
      }
      state.targetIndex = target.index;
      state.position = target.position;
      setDragOverItem(target);
    };

    const stopAutoScroll = () => {
      if (autoScrollFrame !== null) window.cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
      previousAutoScrollTime = 0;
    };

    const runAutoScroll = (time: number) => {
      autoScrollFrame = null;
      const state = pointerItemDragRef.current;
      if (!state?.moved) {
        previousAutoScrollTime = 0;
        return;
      }

      const bounds = getItemDragScrollBounds(state.scrollContainer);
      const velocity = getItemDragAutoScrollVelocity(state.clientY, bounds.top, bounds.bottom);
      if (velocity === 0) {
        previousAutoScrollTime = 0;
        return;
      }

      const elapsed = previousAutoScrollTime ? Math.min(34, time - previousAutoScrollTime) : 1000 / 60;
      previousAutoScrollTime = time;
      const previousScrollTop = state.scrollContainer.scrollTop;
      state.scrollContainer.scrollTop += velocity * (elapsed / 1000);

      if (state.scrollContainer.scrollTop === previousScrollTop) {
        previousAutoScrollTime = 0;
        return;
      }

      updateTargetItem(state.clientX, state.clientY, true);
      autoScrollFrame = window.requestAnimationFrame(runAutoScroll);
    };

    const ensureAutoScroll = () => {
      if (autoScrollFrame === null) autoScrollFrame = window.requestAnimationFrame(runAutoScroll);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerItemDragRef.current;
      if (!state) return;
      state.clientX = event.clientX;
      state.clientY = event.clientY;
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.moved && distance > 4) {
        state.moved = true;
        setDraggingItemIndex(state.sourceIndex);
      }
      if (!state.moved) return;
      event.preventDefault();
      const bounds = getItemDragScrollBounds(state.scrollContainer);
      const isNearScrollEdge = getItemDragAutoScrollVelocity(event.clientY, bounds.top, bounds.bottom) !== 0;
      updateTargetItem(event.clientX, event.clientY, isNearScrollEdge);
      ensureAutoScroll();
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerItemDragRef.current;
      if (!state) return;
      stopAutoScroll();
      pointerItemDragRef.current = null;
      if (state.moved) {
        const target = getTargetItem(event.clientX, event.clientY);
        const targetIndex = target?.index ?? state.targetIndex;
        const position = target?.position ?? state.position;
        if (targetIndex !== null && targetIndex !== state.sourceIndex) {
          reorderItem(state.sourceIndex, targetIndex, position);
        }
      }
      setDraggingItemIndex(null);
      setDragOverItem(null);
    };

    const handlePointerCancel = () => {
      if (!pointerItemDragRef.current) return;
      stopAutoScroll();
      pointerItemDragRef.current = null;
      setDraggingItemIndex(null);
      setDragOverItem(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      stopAutoScroll();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [reorderItem]);

  useEffect(() => {
    if (loading) return;
    if (isReadonly) return;
    if (lastSavedPayloadRef.current === savePayloadText) return;

    setAutoSaveStatus("pending");
    setAutoSaveErrorMessage("");
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = window.setTimeout(() => {
      void runAutoSave();
    }, 900);

    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    };
  }, [isReadonly, loading, runAutoSave, savePayloadText]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isReadonly) return;
      if (lastSavedPayloadRef.current === savePayloadText) return;
      if (savePayloadText.length > 60000) return;
      const requestBody = allowEmptyItemsSaveRef.current
        ? JSON.stringify({ ...JSON.parse(savePayloadText), allowEmptyItems: true })
        : savePayloadText;
      fetch(`/api/quotations/${quotationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: requestBody,
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isReadonly, quotationId, savePayloadText]);

  const scrollSpaceTabs = (direction: -1 | 1) => {
    const container = spaceTabsRef.current;
    if (!container) return;
    container.scrollBy({ left: direction * 320, behavior: "smooth" });
    window.setTimeout(scheduleHiddenSpaceCountUpdate, 360);
  };

  const updatePackagePricingArea = useCallback((area: number) => {
    if (isReadonly || !packagePricingConfig) return;
    const nextArea = toNumber(area);
    if (nextArea <= 0) return;
    const result = calculatePackageQuotePrice(packagePricingConfig, nextArea);
    const remark = buildPackagePricingText(result);
    setSettings((current) => ({
      ...current,
      templatePricing: buildPackagePricingSettings(current?.templatePricing, packagePricingConfig, result),
    }));
    setItems((current) => {
      const packageItemIndex = current.findIndex((item) => isPackagePricingCategory(item.category) || String(item.name || "").trim() === "一口价套餐报价");
      const patch: QuotationItem = {
        ...(packageItemIndex >= 0 ? current[packageItemIndex] : {}),
        client_key: packageItemIndex >= 0 ? current[packageItemIndex].client_key : makeClientItemKey(),
        category: "一口价",
        space: "",
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
      };
      if (packageItemIndex < 0) return [patch, ...current];
      return current.map((item, index) => index === packageItemIndex ? patch : item);
    });
  }, [isReadonly, packagePricingConfig]);

  const handlePackageAreaInputChange = (value: string) => {
    const nextValue = sanitizeQuoteAreaInput(value);
    setPackageAreaText(nextValue);
    const nextArea = Number(nextValue);
    if (nextValue && Number.isFinite(nextArea) && nextArea > 0) {
      updatePackagePricingArea(nextArea);
    }
  };

  const handlePackageAreaInputBlur = () => {
    packageAreaEditingRef.current = false;
    if (!packagePricingSummary) return;
    const nextArea = Number(packageAreaText);
    if (!packageAreaText || !Number.isFinite(nextArea) || nextArea <= 0) {
      setPackageAreaText(formatEditableNumber(packagePricingSummary.area));
      return;
    }
    setPackageAreaText(formatEditableNumber(nextArea));
  };

  const handlePageClick = (event: MouseEvent<HTMLDivElement>) => {
    setSpaceMenu(null);
    setSpaceCopyMenu(null);
    setRowMenu(null);
    setRowCopyMenu(null);
    setCategoryCreateMenu(null);
	    const target = event.target;
	    if (target instanceof Element && target.closest("[data-quote-expandable]")) return;
	    setPackageDetailOpen(false);
	    closeDiscountPanel();
  };

  if (loading) {
    return <div className="flex min-h-96 items-center justify-center text-surface-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载报价...</div>;
  }

  const availableCategoryCreateOptions = quoteCategoryCreateOptions.filter(
    (option) => !displayedProjectQuoteCategories.some((category) => sameQuoteCategory(category, option.value)),
  );
  const canAddCategoryInCurrentView = !isAllSpaceView && availableCategoryCreateOptions.length > 0;
  const showCategoryNavigation = activeCategory !== noQuoteCategoryValue && !isOtherCategory(activeCategory) && (displayedProjectQuoteCategories.length > 0 || (!isReadonly && canAddCategoryInCurrentView));
  const shouldShowCategoryChooser = !isOtherCategory(activeCategory) && displayedProjectQuoteCategories.length === 0;

  return (
    <div className="quotation-detail-ui quote-workbench-shell -m-5 min-h-[calc(100vh-72px)] w-[calc(100%+2.5rem)] max-w-none bg-[#f4f7fb] px-4 pb-4 pt-2 text-[#162033] lg:-m-7 lg:w-[calc(100%+3.5rem)] lg:px-5 lg:pb-5 lg:pt-3" onClick={handlePageClick}>
      {nameDialog && (
        <QuoteNameDialogModal
          dialog={nameDialog}
          onClose={() => setNameDialog(null)}
        />
      )}
      {systemDialog && (
        <QuoteSystemDialogModal
          dialog={systemDialog}
          onClose={() => setSystemDialog(null)}
        />
      )}
      {copySpaceCategoryDialog && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#0b1220]/35 px-4 py-6 backdrop-blur-md no-print"
          onClick={() => setCopySpaceCategoryDialog(null)}
        >
          <div
            className="w-full max-w-[540px] overflow-hidden rounded-[20px] border border-white/70 bg-white shadow-[0_28px_70px_rgba(15,23,42,0.24)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="选择复制类型"
          >
            <div className="flex items-start justify-between gap-4 px-6 pb-5 pt-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[#bfe8d3] bg-[#f1fbf6] text-[#159863]">
                  <Copy className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-6 text-[#172033]">复制到其他空间/类别</div>
                  <div className="mt-2 text-xs font-semibold leading-5 text-[#667085]">
                    「{copySpaceCategoryDialog.source}」复制到「{copySpaceCategoryDialog.target}」，选择需要带过去的项目类型。
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCopySpaceCategoryDialog(null)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#7b8797] transition hover:bg-[#f3f6fa] hover:text-[#172033]"
                aria-label="关闭复制类型选择"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-y border-[#edf1f6] bg-gradient-to-b from-[#fbfdfc] to-[#f6faf8] px-6 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
              {builtInDirectCategories.map((category) => {
                const checked = copySpaceCategoryDialog.categories.some((item) => sameQuoteCategory(item, category));
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCopySpaceCategory(category)}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-[10px] border px-4 text-left text-sm font-bold leading-5 transition ${
                      checked
                        ? "border-[#72d6a7] bg-[#f5fffa] text-[#173426] shadow-[0_8px_18px_rgba(20,184,114,0.08)]"
                        : "border-[#dce4ef] bg-white text-[#5d6b7c] shadow-[0_10px_24px_rgba(15,23,42,0.04)] hover:border-[#9fd7bc] hover:bg-[#fbfffd] hover:text-[#173426]"
                    }`}
                  >
                    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                      checked ? "border-[#18b978] bg-[#18b978] text-white" : "border-[#c7d3e3] bg-[#f8fafc] text-transparent"
                    }`}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 truncate">{getCategoryLabel(category)}</span>
                  </button>
                );
              })}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => setCopySpaceCategoryDialog(null)}
                className="inline-flex h-10 min-w-[70px] items-center justify-center rounded-[10px] border border-[#d9e2ef] bg-white px-4 text-sm font-bold text-[#52647b] transition hover:bg-[#f7f9fd] hover:text-[#172033]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => copySpaceItemsToTarget(copySpaceCategoryDialog.source, copySpaceCategoryDialog.target, copySpaceCategoryDialog.categories)}
                disabled={copySpaceCategoryDialog.categories.length === 0}
                className="inline-flex h-10 min-w-[96px] items-center justify-center rounded-[10px] border border-[#159863] bg-[#159863] px-5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(21,152,99,0.20)] transition hover:border-[#0f8155] hover:bg-[#0f8155] disabled:cursor-not-allowed disabled:border-[#c7d3e3] disabled:bg-[#c7d3e3] disabled:shadow-none"
              >
                确认复制
              </button>
            </div>
          </div>
        </div>
      )}
      {projectInfoOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/35 px-4 py-6 backdrop-blur-sm no-print" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !projectInfoSaving) {
            setProjectInfoMapPickerOpen(false);
            setProjectInfoOpen(false);
          }
        }}>
          <div className="quote-project-info-modal w-full max-w-[820px] overflow-hidden rounded-xl border border-surface-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4 border-b border-surface-100 px-5 py-3.5">
              <div>
                <div className="text-sm font-semibold text-[#182230]">编辑报价资料</div>
                <p className="mt-1 text-xs text-surface-500">修改本次报价使用的客户、地址、房号和装修信息</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProjectInfoMapPickerOpen(false);
                  setProjectInfoOpen(false);
                }}
                disabled={projectInfoSaving}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 transition hover:bg-surface-100 hover:text-surface-700 disabled:opacity-50"
                aria-label="关闭编辑资料"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="quote-project-info-body">
              <div className="quote-project-info-form-grid">
                <label className="quote-project-info-field quote-project-info-span-2">
                  <span>客户名称</span>
                  <input value={projectInfoForm.customerName} onChange={(event) => setProjectInfoForm((current) => ({ ...current, customerName: event.target.value }))} placeholder="如：张先生、李女士" />
                </label>
                <label className="quote-project-info-field quote-project-info-span-2">
                  <span>设计师</span>
                  <input value={projectInfoForm.designerName} onChange={(event) => setProjectInfoForm((current) => ({ ...current, designerName: event.target.value }))} placeholder="手动填写设计师姓名" />
                </label>
                <label className="quote-project-info-field">
                  <span>手机号</span>
                  <input value={projectInfoForm.customerPhone} inputMode="numeric" maxLength={11} onChange={(event) => setProjectInfoForm((current) => ({ ...current, customerPhone: normalizeProjectInfoPhone(event.target.value) }))} placeholder="手机号" />
                </label>
                <label className="quote-project-info-field">
                  <span>微信</span>
                  <input value={projectInfoForm.customerWeixin} onChange={(event) => setProjectInfoForm((current) => ({ ...current, customerWeixin: event.target.value }))} placeholder="微信号" />
                </label>
                <label className="quote-project-info-address quote-project-info-span-2">
                  <span>小区/地址 <em>*</em></span>
                  <div>
                    <input value={projectInfoForm.customerAddress} onChange={(event) => updateProjectInfoAddressText(event.target.value)} placeholder="例如：广州圣心大教堂" />
                    <button type="button" onClick={() => setProjectInfoMapPickerOpen(true)}>
                      <MapPin className="h-3.5 w-3.5" />
                      地图选点
                    </button>
                  </div>
                </label>
                {projectInfoForm.addressLatitude && projectInfoForm.addressLongitude ? (
                  <p className="quote-project-info-location-status quote-project-info-span-2">
                    <MapPin className="h-3 w-3" />
                    已保存实际地址定位
                  </p>
                ) : null}
                <div className="quote-project-info-room-row quote-project-info-span-2">
                  <label className="quote-project-info-field">
                    <span>楼栋</span>
                    <input disabled={projectInfoForm.noRoomNumber} value={projectInfoForm.buildingNo} onChange={(event) => setProjectInfoForm((current) => ({ ...current, buildingNo: event.target.value }))} placeholder="H7" />
                  </label>
                  <label className="quote-project-info-field">
                    <span>单元</span>
                    <input disabled={projectInfoForm.noRoomNumber} value={projectInfoForm.unitNo} onChange={(event) => setProjectInfoForm((current) => ({ ...current, unitNo: event.target.value }))} placeholder="4" />
                  </label>
                  <label className="quote-project-info-field">
                    <span>房室</span>
                    <input disabled={projectInfoForm.noRoomNumber} value={projectInfoForm.roomNo} onChange={(event) => setProjectInfoForm((current) => ({ ...current, roomNo: event.target.value }))} placeholder="1023" />
                  </label>
                </div>
                <label className="quote-project-info-check quote-project-info-span-2">
                  <input
                    type="checkbox"
                    checked={projectInfoForm.noRoomNumber}
                    onChange={(event) => setProjectInfoForm((current) => ({
                      ...current,
                      noRoomNumber: event.target.checked,
                      ...(event.target.checked ? { buildingNo: "", unitNo: "", roomNo: "" } : {}),
                    }))}
                  />
                  <i>{projectInfoForm.noRoomNumber && <Check className="h-3.5 w-3.5" />}</i>
                  暂无房号
                </label>
                <label className="quote-project-info-field">
                  <span>面积(m²)</span>
                  <div className="quote-project-info-area">
                    <input inputMode="decimal" value={projectInfoForm.areaSize} onChange={(event) => setProjectInfoForm((current) => ({ ...current, areaSize: sanitizeQuoteAreaInput(event.target.value) }))} placeholder="面积" />
                    <em>㎡</em>
                  </div>
                </label>
                <label className="quote-project-info-field">
                  <span>装修类型</span>
                  <input list="quote-project-decoration-types" value={projectInfoForm.decorationType} onChange={(event) => setProjectInfoForm((current) => ({ ...current, decorationType: event.target.value }))} placeholder="如：全包/半包" />
                </label>
                <label className="quote-project-info-field quote-project-info-span-2">
                  <span>内部备注</span>
                  <textarea value={projectInfoForm.notes} onChange={(event) => setProjectInfoForm((current) => ({ ...current, notes: event.target.value }))} placeholder="仅内部查看，如客户关注点、沟通记录、报价口径等" rows={3} />
                </label>
                <label className="quote-project-info-field quote-project-info-span-2">
                  <span>客户附注</span>
                  <textarea value={projectInfoForm.customerVisibleNote} onChange={(event) => setProjectInfoForm((current) => ({ ...current, customerVisibleNote: event.target.value }))} placeholder="会显示在报价单底部，如优惠说明、施工范围补充、特殊约定等" rows={3} />
                </label>
                <datalist id="quote-project-decoration-types">
                  {quoteDecorationTypeOptions.map((option) => <option key={option} value={option} />)}
                </datalist>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-surface-100 bg-surface-50 px-5 py-4">
              <button type="button" onClick={() => {
                setProjectInfoMapPickerOpen(false);
                setProjectInfoOpen(false);
              }} disabled={projectInfoSaving} className="inline-flex h-9 items-center justify-center rounded-lg border border-surface-200 bg-white px-4 text-xs font-semibold text-surface-600 transition hover:bg-surface-100 disabled:opacity-50">
                取消
              </button>
              <button type="button" onClick={submitProjectInfo} disabled={projectInfoSaving} className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-lg bg-primary-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60">
                {projectInfoSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                保存资料
              </button>
            </div>
          </div>
        </div>
      )}
      {discountPanelOpen && (
        <div
	          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/35 px-4 py-6 backdrop-blur-sm no-print"
	          onMouseDown={(event) => {
	            if (event.target === event.currentTarget) closeDiscountPanel();
	          }}
        >
          <div
            className="quote-discount-modal flex max-h-[calc(100dvh-72px)] w-full max-w-[960px] flex-col overflow-hidden rounded-[18px] border border-[#dfe7f1] bg-white shadow-[0_28px_78px_rgba(15,23,42,0.24)]"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e7edf5] bg-white px-6 py-3.5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-[#bfe8d3] bg-[#f1fbf6] text-[#159863]">
                  <Tags className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold leading-6 text-[#182230]">报价优惠</div>
	                  <p className="mt-1 text-xs font-medium text-[#667085]">先确定优惠对象，再设置排除规则和优惠方式，系统自动核算金额。</p>
                </div>
              </div>
	              <button
	                type="button"
	                onClick={closeDiscountPanel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
                aria-label="关闭报价优惠"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="quote-discount-modal-body min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f5f8fb] p-3.5">
              <div className="quote-discount-step">
                <div className="quote-discount-step-title mb-2">
                  <span className="quote-discount-step-badge"><Tags className="h-3.5 w-3.5" /></span>
                  <span>选择优惠类型</span>
                </div>
	                <div className="quote-discount-type-grid grid grid-cols-3 gap-2 rounded-[12px] border border-[#dfe7f1] bg-white p-1">
                  <button
                    type="button"
                    onClick={() => changeDiscountType("fee")}
                    className={`quote-discount-type-button ${discountType === "fee" ? "quote-discount-type-button-active" : ""}`}
                    disabled={isReadonly}
                  >
                    <span className="quote-discount-choice-icon"><FileText className="h-4 w-4" /></span>
                    <span className="quote-discount-mode-title">按费用类型</span>
                    <span className="quote-discount-mode-desc">从基装、产品、综合费用等范围优惠</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => changeDiscountType("space")}
                    className={`quote-discount-type-button ${discountType === "space" ? "quote-discount-type-button-active" : ""}`}
                    disabled={isReadonly || discountSpaceOptions.length === 0}
                  >
                    <span className="quote-discount-choice-icon"><Home className="h-4 w-4" /></span>
                    <span className="quote-discount-mode-title">按空间/类别</span>
                    <span className="quote-discount-mode-desc">只针对某个空间/类别内的项目优惠</span>
                  </button>
	                  <button
	                    type="button"
	                    onClick={() => changeDiscountType("work_type")}
                    className={`quote-discount-type-button ${discountType === "work_type" ? "quote-discount-type-button-active" : ""}`}
                    disabled={isReadonly || discountWorkTypeOptions.length === 0}
                  >
	                    <span className="quote-discount-choice-icon"><Ruler className="h-4 w-4" /></span>
	                    <span className="quote-discount-mode-title">按工种</span>
	                    <span className="quote-discount-mode-desc">只针对某个工种归属内的项目优惠</span>
	                  </button>
	                </div>
              </div>
              <div className="quote-discount-step">
                <div className="quote-discount-step-title mb-2">
                  <span className="quote-discount-step-badge"><LayoutGrid className="h-3.5 w-3.5" /></span>
	                  <span>{discountType === "space" ? "选择空间/类别" : discountType === "work_type" ? "选择工种" : "选择优惠范围"}</span>
	                </div>
	                <div className="quote-discount-scope-panel rounded-[12px] border border-[#dfe7f1] bg-white p-2.5">
	                  {activeDiscountOptions.length > 0 ? (
                    <div className="quote-discount-scope-grid">
                      {activeDiscountOptions.map((option) => {
                        const active = selectedDiscountScope?.value === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => changeDiscountScope(option.value)}
                            disabled={isReadonly}
                            className={`quote-discount-scope-card ${active ? "quote-discount-scope-card-active" : ""}`}
                            title={`按${option.label}计算优惠，当前金额 ${formatQuoteAmount(option.amount)}`}
                          >
                            <span className="quote-discount-scope-name">{option.label}</span>
                            <span className="quote-discount-scope-amount">{formatQuoteAmount(option.amount)}</span>
                            {active && <Check className="quote-discount-scope-check h-3.5 w-3.5" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="quote-discount-empty">
                      {discountType === "work_type" ? "暂无可选择的工种，请先给报价项目设置工种归属" : "暂无可选择的空间/类别，请先在报价中添加空间/类别项目"}
                    </div>
                  )}
                </div>
              </div>
              <div className="quote-discount-step">
                <div className="quote-discount-step-title mb-2">
                  <span className="quote-discount-step-badge"><Eraser className="h-3.5 w-3.5" /></span>
                  <span>设置排除规则</span>
                </div>
                <div className="quote-discount-rule-grid grid grid-cols-3 gap-2">
                  {[
                    {
                      key: "excludeSpecialDiscountItems" as const,
                      title: "排除特价项目",
                      desc: `已标特价的项目不参与折扣，共 ${discountExcludeMeta.specialCount} 项`,
	                      active: !!discountSettings?.excludeSpecialDiscountItems,
                      disabled: discountExcludeMeta.specialCount <= 0,
                    },
                    {
                      key: "excludeLaborOnlyDiscountItems" as const,
                      title: "排除纯人工项目",
                      desc: `只有人工费、无材料费的基装项目不参与折扣，共 ${discountExcludeMeta.laborOnlyCount} 项`,
	                      active: !!discountSettings?.excludeLaborOnlyDiscountItems,
                      disabled: discountExcludeMeta.laborOnlyCount <= 0,
                    },
                  ].map((rule) => (
                    <button
                      key={rule.key}
                      type="button"
                      disabled={isReadonly || rule.disabled}
                      onClick={() => changeDiscountExcludeRule(rule.key, !rule.active)}
                      className={`quote-discount-rule-card ${rule.active ? "quote-discount-rule-card-active" : ""}`}
                    >
                      <span className="quote-discount-rule-icon"><Eraser className="h-4 w-4" /></span>
                      <span className="quote-discount-rule-copy">
                        <span className="quote-discount-rule-title">{rule.title}</span>
                        <span className="quote-discount-rule-desc">{rule.desc}</span>
                      </span>
                      <span className="quote-discount-rule-switch" aria-hidden="true">
                        <span />
                      </span>
                    </button>
                  ))}
                  <div className="quote-discount-rule-card quote-discount-rule-card-input">
                    <span className="quote-discount-rule-icon"><FileText className="h-4 w-4" /></span>
                    <span className="quote-discount-rule-copy">
                      <span className="quote-discount-rule-title">排除特定费用</span>
                      <span className="quote-discount-rule-desc">输入不参与本次优惠的固定金额</span>
                    </span>
                    <label className="quote-discount-rule-input">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={discountSettings?.excludeSpecificDiscountAmount || 0}
                        readOnly={isReadonly}
                        onFocus={selectZeroOnFocus}
                        onChange={(event) => {
                          if (!isValidDecimalInput(event.target.value)) return;
                          const nextValue = normalizeNumberInputValue(event.target.value);
                          if (nextValue === null) return;
                          applyExcludeSpecificDiscountAmount(nextValue);
                        }}
                      />
                      <span>元</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="quote-discount-step">
                <div className="quote-discount-step-title mb-2">
                  <span className="quote-discount-step-badge"><Palette className="h-3.5 w-3.5" /></span>
                  <span>选择优惠方式</span>
                </div>
                <div className="quote-discount-mode-grid grid grid-cols-2 gap-2 rounded-[12px] border border-[#dfe7f1] bg-white p-1">
                  <button
                    type="button"
                    onClick={() => switchDiscountMode("amount")}
                    className={`quote-discount-mode-button ${discountMode === "amount" ? "quote-discount-mode-button-active" : ""}`}
                    disabled={isReadonly}
                  >
                    <span className="quote-discount-choice-icon"><Tags className="h-4 w-4" /></span>
                    <span className="quote-discount-mode-title">优惠金额</span>
                    <span className="quote-discount-mode-desc">直接填写减免金额</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchDiscountMode("rate")}
                    className={`quote-discount-mode-button ${discountMode === "rate" ? "quote-discount-mode-button-active" : ""}`}
                    disabled={isReadonly}
                  >
                    <span className="quote-discount-choice-icon"><Ruler className="h-4 w-4" /></span>
                    <span className="quote-discount-mode-title">折扣系数</span>
                    <span className="quote-discount-mode-desc">输入 0.9 表示九折</span>
                  </button>
                </div>
              </div>
              <div className="quote-discount-step">
                <div className="quote-discount-step-title mb-2">
                  <span className="quote-discount-step-badge"><Pencil className="h-3.5 w-3.5" /></span>
                  <span>{discountMode === "amount" ? "输入优惠金额" : "输入折扣系数"}</span>
                </div>
                <div className="quote-discount-fields rounded-[12px] border border-[#dfe7f1] bg-white p-2.5">
                  {discountMode === "amount" ? (
                    <div className="space-y-2">
	                      <NumberField label="输入优惠金额" suffix="元" value={discountSettings?.discount || 0} onChange={applyDiscountAmount} readOnly={isReadonly} />
	                      <p className="text-[11px] font-medium text-surface-400">从{discountBaseLabel}中直接减去该金额，最高不超过 {formatQuoteAmount(discountBaseAmount)}</p>
                    </div>
                  ) : (
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-surface-700">输入折扣系数</span>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={discountRateText}
                          readOnly={isReadonly}
                          onFocus={(event) => {
                            discountRateEditingRef.current = true;
                            event.currentTarget.select();
                          }}
                          onBlur={commitDiscountRateText}
                          onChange={(event) => handleDiscountRateTextChange(event.target.value)}
                          className="input-field w-full pr-12 read-only:cursor-default"
                          placeholder="如 0.9"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-400">系数</span>
                      </div>
                    </label>
                  )}
                </div>
              </div>
              {discountMode === "rate" && (
                <div className="quote-discount-rate-hint rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
		                  当前按{discountBaseLabel}的 {formatEditableNumber(discountRate)} 折扣系数计算，自动优惠 {formatQuoteAmount(discountSettings?.discount || 0)}
                </div>
              )}
              <div className="quote-discount-result-grid grid grid-cols-3 gap-3">
                <div className="quote-discount-result-card">
	                  <p className="text-[11px] font-semibold text-surface-500">{discountBaseLabel}金额</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-surface-900">{formatQuoteAmount(discountBaseAmount)}</p>
                </div>
                <div className="quote-discount-result-card quote-discount-result-card-warn">
                  <p className="text-[11px] font-semibold text-orange-600">优惠金额</p>
	                  <p className="mt-1 text-sm font-semibold tabular-nums text-orange-700">{formatQuoteAmount(discountSettings?.discount || 0)}</p>
                </div>
                <div className="quote-discount-result-card quote-discount-result-card-danger">
                  <p className="text-[11px] font-semibold text-red-500">优惠后总费用</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-red-600">{formatQuoteAmount(discountAfterAmount)}</p>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#e7edf5] bg-white px-6 py-3">
              <button
                type="button"
	                onClick={confirmDiscountPanel}
                className="inline-flex h-10 min-w-[92px] items-center justify-center gap-1.5 rounded-[10px] bg-[#159863] px-5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(21,152,99,0.22)] transition hover:bg-[#0f8155]"
              >
                <Check className="h-3.5 w-3.5" />
	                确认
              </button>
            </div>
          </div>
        </div>
      )}
      {findReplaceOpen && (
        <div
          className="quote-find-replace-overlay fixed inset-0 z-[10000] flex items-center justify-center px-4 py-6 no-print"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFindReplaceOpen(false);
          }}
        >
          <div
            className="quote-find-replace-modal flex max-h-[calc(100dvh-48px)] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px] border border-[#dfe7f1] bg-white"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="false"
            aria-label="查找与替换"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e7edf5] px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-[#cfe0ff] bg-[#edf4ff] text-[#407aff]">
                  <Replace className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold leading-6 text-[#182230]">查找与替换</div>
                  <p className="mt-1 text-xs font-medium text-[#667085]">只替换当前明细列表中的文字，不会影响数量、单价和金额。</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFindReplaceOpen(false)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
                aria-label="关闭查找与替换"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f9fc] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="quote-find-replace-field">
                  <span>查找内容</span>
                  <div>
                    <Search className="h-4 w-4" />
                    <input
                      value={findReplaceKeyword}
                      onChange={(event) => setFindReplaceKeyword(event.target.value)}
                      placeholder="输入要查找的文字"
                      autoFocus
                    />
                  </div>
                </label>
                <label className="quote-find-replace-field">
                  <span>替换为</span>
                  <div>
                    <Pencil className="h-4 w-4" />
                    <input
                      value={findReplaceValue}
                      onChange={(event) => setFindReplaceValue(event.target.value)}
                      placeholder="输入替换后的文字"
                    />
                  </div>
                </label>
              </div>
              <div className="quote-find-replace-scope-panel">
                <div className="quote-find-replace-section-title">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  查找范围
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { value: "name" as const, label: "工程项目", desc: "只查找项目名称列", icon: FileText },
                    { value: "description" as const, label: "施工工艺及材料说明", desc: "只查找说明文字列", icon: List },
                  ].map((option) => {
                    const Icon = option.icon;
                    const checked = findReplaceScopes.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleFindReplaceScope(option.value)}
                        className={`quote-find-replace-scope ${checked ? "quote-find-replace-scope-active" : ""}`}
                      >
                        <span className="quote-find-replace-scope-icon"><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0">
                          <strong>{option.label}</strong>
                          <em>{option.desc}</em>
                        </span>
                        <i><Check className="h-3.5 w-3.5" /></i>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[#dfe7f1] bg-white px-3 py-2.5">
                <span className="text-xs font-semibold text-[#667085]">
                  {findReplaceKeyword.trim()
                    ? `找到 ${findReplaceMatches.length} 处${findReplaceMatches.length > 0 ? `，当前第 ${Math.min(findReplaceMatchIndex + 1, findReplaceMatches.length)} 处` : ""}`
                    : "输入查找内容后开始匹配"}
                </span>
                {findReplaceMessage ? <span className="text-xs font-semibold text-[#159863]">{findReplaceMessage}</span> : null}
              </div>
              <div className="quote-find-replace-results">
                <div className="quote-find-replace-results-head">
                  <span>搜索结果</span>
                  <em>{findReplaceMatches.length} 条</em>
                </div>
                {!findReplaceKeyword.trim() ? (
                  <div className="quote-find-replace-empty">
                    <Search className="h-4 w-4" />
                    <span>输入查找内容后，这里会显示匹配行和对应字段。</span>
                  </div>
                ) : findReplaceScopes.length === 0 ? (
                  <div className="quote-find-replace-empty">
                    <LayoutGrid className="h-4 w-4" />
                    <span>请至少选择一个查找范围。</span>
                  </div>
                ) : findReplaceMatches.length === 0 ? (
                  <div className="quote-find-replace-empty quote-find-replace-empty-warn">
                    <Search className="h-4 w-4" />
                    <span>没有搜索结果，请检查文字或切换查找范围。</span>
                  </div>
                ) : (
                  <div ref={findReplaceResultListRef} className="quote-find-replace-result-list">
                    {findReplaceMatches.map((match, index) => {
                      const item = items[match.itemIndex];
                      const visibleRowIndex = activeItems.findIndex((row) => row.index === match.itemIndex);
                      const value = getFindReplaceMatchValue(item, match.field);
                      const excerpt = getFindReplaceExcerpt(value, findReplaceKeyword.trim(), match.start);
                      const active = index === findReplaceMatchIndex;
                      return (
                        <button
                          key={`${match.itemIndex}-${match.field}-${match.start}-${index}`}
                          type="button"
                          onClick={() => selectFindReplaceMatch(index)}
                          data-find-replace-index={index}
                          className={`quote-find-replace-result ${active ? "quote-find-replace-result-active" : ""}`}
                        >
                          <span className="quote-find-replace-result-index">{visibleRowIndex >= 0 ? visibleRowIndex + 1 : match.itemIndex + 1}</span>
                          <span className="quote-find-replace-result-main">
                            <span className="quote-find-replace-result-meta">
                              <strong>{getFindReplaceFieldLabel(match.field)}</strong>
                              <em>{String(item?.name || "未命名项目")}</em>
                            </span>
                            <span className="quote-find-replace-result-text">
                              {excerpt.prefix}<mark>{excerpt.hit}</mark>{excerpt.suffix}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e7edf5] bg-white px-5 py-3">
              <button
                type="button"
                onClick={findNextMatch}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-[#d9e2ef] bg-white px-3 text-xs font-bold text-[#52647b] transition hover:border-[#cfe0ff] hover:bg-[#edf4ff] hover:text-[#407aff]"
              >
                <Search className="h-3.5 w-3.5" />
                查找下一个
              </button>
              <button
                type="button"
                onClick={replaceCurrentMatch}
                disabled={!findReplaceKeyword.trim() || !findReplaceValue.trim() || findReplaceMatches.length === 0 || findReplaceScopes.length === 0}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-[#bfe8d3] bg-[#f1fbf6] px-3 text-xs font-bold text-[#167457] transition hover:border-[#8fd8b0] hover:bg-white disabled:cursor-not-allowed disabled:border-[#d9e2ef] disabled:bg-[#f8fafc] disabled:text-[#98a2b3]"
              >
                <Pencil className="h-3.5 w-3.5" />
                替换
              </button>
              <button
                type="button"
                onClick={confirmReplaceAllMatches}
                disabled={!findReplaceKeyword.trim() || !findReplaceValue.trim() || findReplaceMatches.length === 0 || findReplaceScopes.length === 0}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-[#159863] bg-[#159863] px-4 text-xs font-bold text-white shadow-[0_8px_18px_rgba(21,152,99,0.20)] transition hover:border-[#0f8155] hover:bg-[#0f8155] disabled:cursor-not-allowed disabled:border-[#c7d3e3] disabled:bg-[#c7d3e3] disabled:shadow-none"
              >
                <Replace className="h-3.5 w-3.5" />
                全部替换
              </button>
            </div>
          </div>
        </div>
      )}
      {projectInfoMapPickerOpen && typeof document !== "undefined" && createPortal(
        <div className="quote-project-info-map-layer fixed inset-0 z-[11000] no-print">
          <AmapLocationPicker
            initialKeyword={projectInfoForm.customerAddress}
            onClose={() => setProjectInfoMapPickerOpen(false)}
            onConfirm={applyProjectInfoPickedLocation}
          />
        </div>,
        document.body,
      )}
      {isReadonly && (
        <section className="no-print rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
          该报价单由他人发送给你，仅支持查看、打印和导出，不能修改报价内容。
        </section>
      )}

      {packagePricingSummary && renderPackageDetail && (
        <div
          data-quote-expandable
          className={`no-print overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out ${
            packageDetailVisible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
          }`}
          style={{ maxHeight: packageDetailVisible ? `${packageDetailHeight}px` : "0px" }}
        >
          <div ref={packageDetailContentRef} className="min-h-0 overflow-hidden">
            <section className="quote-expand-panel quote-pricing-panel rounded-lg border border-primary-100 bg-white/95 p-3 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
              <div className="grid min-w-0 gap-2 md:grid-cols-3 xl:grid-cols-[repeat(6,minmax(120px,1fr))_168px]">
                <PackagePricingMetric label="计价方式" value="一口价模式" />
                <label className="quote-pricing-metric flex min-h-[64px] flex-col justify-center rounded-md border border-surface-200 bg-surface-50 px-3">
                  <span className="text-xs font-medium text-surface-500">计价面积</span>
                  <span className="mt-1 flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={packageAreaText}
                      readOnly={isReadonly}
                      onChange={(event) => handlePackageAreaInputChange(event.target.value)}
                      onBlur={handlePackageAreaInputBlur}
                      onFocus={(event) => {
                        packageAreaEditingRef.current = true;
                        if (!isReadonly && Number(event.currentTarget.value) === 0) setPackageAreaText("");
                      }}
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums text-surface-900 outline-none read-only:cursor-default"
                      placeholder="请输入面积"
                    />
                    <span className="shrink-0 text-sm font-semibold text-surface-900">㎡</span>
                  </span>
                </label>
                <PackagePricingMetric label="套餐面积" value={`${formatQuoteArea(packagePricingSummary.includedArea)}㎡以内`} />
                <PackagePricingMetric label="套餐金额" value={formatQuoteAmount(packagePricingSummary.packageAmount)} />
                <PackagePricingMetric label="超出面积" value={`${formatQuoteArea(packagePricingSummary.extraArea)}㎡`} />
                <PackagePricingMetric label="超出金额" value={formatQuoteAmount(packagePricingSummary.extraAmount)} />
                <div className="quote-pricing-total flex min-h-[64px] flex-col justify-center rounded-md border border-primary-200 bg-primary-50 px-4 text-right">
                  <span className="text-xs font-semibold text-primary-600">一口价金额</span>
                  <span className="text-xl font-semibold tabular-nums text-primary-800">{formatQuoteAmount(packagePricingSummary.totalAmount)}</span>
                </div>
              </div>
              <div className="quote-pricing-calculation mt-3 rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-xs leading-5 text-surface-600">
                {packagePricingSummary.segments.length > 0 ? (
                  <>
                    <span className="font-semibold text-surface-800">超出计算：</span>
                    {packagePricingSummary.segments.map((segment, index) => (
                      <span key={`${segment.startArea}-${segment.endArea}-${index}`} className="ml-1">
                        {formatQuoteArea(segment.startArea, 0)}-{formatQuoteArea(segment.endArea, 0)}㎡ × {formatQuoteAmount(segment.unitPrice)}元/㎡ = {formatQuoteAmount(segment.amount)}
                        {index < packagePricingSummary.segments.length - 1 ? "，" : ""}
                      </span>
                    ))}
                  </>
                ) : (
                  <span>当前计价面积未超出套餐面积，无额外超出加价。</span>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      <div className="screen-quote-sections quote-workbench-body">
        <section className={`quote-space-navigation quote-compact-navigation no-print ${
          !showCategoryNavigation ? "quote-compact-navigation-single-row" : ""
        }`}>
          <div className="quote-record-breadcrumb">
            <div className="quote-record-breadcrumb-path">
              <button type="button" onClick={returnToBudgetRecords} title="返回客户预算记录">
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>预算记录</span>
              </button>
              <ChevronRight className="h-3 w-3" />
              <strong>{data?.customer_name || data?.project_name || "当前报价"}</strong>
            </div>
            <div className="quote-navigation-actions">
              {!isReadonly && (
                <button
                  type="button"
                  onClick={openProjectInfoEditor}
                  className="quote-project-info-edit inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 font-semibold transition"
                  title="编辑客户、房号、面积等基础信息"
                >
                  <Home className="h-3.5 w-3.5" />
                  编辑资料
                </button>
              )}
              {!isReadonly && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPackageDetailOpen(false);
                    openDiscountPanel();
                  }}
                  className={`quote-discount-action inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 font-semibold transition ${
                    discountPanelOpen ? "quote-discount-action-active" : ""
                  }`}
                  title="设置报价优惠"
                >
                  <Tags className="h-3.5 w-3.5" />
                  <span>报价优惠</span>
                  <span className="quote-discount-action-amount tabular-nums">{formatQuoteAmount(settings?.discount || 0)}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveCategory("other")}
                className={`quote-comprehensive-fee inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 font-semibold transition ${
                  isOtherCategory(activeCategory) ? "quote-comprehensive-fee-active" : ""
                }`}
              >
                <span>综合费用</span>
                <span className="quote-comprehensive-fee-amount tabular-nums">{formatQuoteAmount(totals.otherAmount)}</span>
              </button>
            </div>
          </div>
          <div className="quote-compact-navigation-row quote-space-navigation-row flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => scrollSpaceTabs(-1)}
              className="quote-nav-arrow inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-surface-200 bg-white text-surface-500"
              title="向左滑动"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div
              ref={spaceTabsRef}
              onWheel={(event) => {
                if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                  scheduleHiddenSpaceCountUpdate(120);
                  return;
                }
                const delta = event.deltaY;
                if (!delta) return;
                event.preventDefault();
                event.currentTarget.scrollLeft += delta;
                scheduleHiddenSpaceCountUpdate(120);
              }}
              className={`quote-space-tabs quote-compact-space-tabs flex min-w-0 w-fit max-w-[calc(100%-220px)] flex-none items-center gap-1.5 overflow-x-auto pr-1 ${draggingSpace ? "quote-space-tabs-dragging" : ""}`}
            >
              <button
                type="button"
                onClick={() => switchToProjectSpace(allSpacesValue)}
                title="查看全部空间项目"
                className={`quote-space-tab inline-flex min-h-8 shrink-0 select-none items-center rounded-md border px-3 text-xs font-semibold transition ${
                  !isOtherCategory(activeCategory) && isAllSpaceView ? "quote-space-tab-active" : ""
                }`}
              >
                <span className="quote-space-tab-icon">
                  <LayoutGrid className="h-3.5 w-3.5" />
                </span>
                <span>全部</span>
              </button>
              {spaceTabOptions.map((space) => {
                const active = !isOtherCategory(activeCategory) && activeSpace === space;
                if (editingSpaceName === space) {
                  return (
                    <input
                      key={space}
                      ref={editingSpaceInputRef}
                      value={editingSpaceValue}
                      onChange={(event) => setEditingSpaceValue(event.target.value)}
                      onBlur={() => renameSpaceInline(space, editingSpaceValue)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          renameSpaceInline(space, editingSpaceValue);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setEditingSpaceName(null);
                          setEditingSpaceValue("");
                        }
                      }}
                      className="quote-space-name-input min-h-8 shrink-0 rounded-md border px-2.5 text-xs font-semibold outline-none"
                      style={{ width: Math.max(112, Array.from(editingSpaceValue || space).length * 18 + 48) }}
                    />
                  );
                }
                return (
                  <button
                    key={space}
                    type="button"
                    data-space-tab
                    data-space={space}
                    onClick={(event) => {
                      if (suppressSpaceClickRef.current) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }
                      switchToProjectSpace(space);
                    }}
                    onContextMenu={isReadonly ? undefined : (event) => openSpaceMenu(event, space)}
                    onPointerDown={isReadonly ? undefined : (event) => startPointerSpaceDrag(event, space)}
                    onDoubleClick={isReadonly ? undefined : () => startInlineRenameSpace(space)}
                    title={isReadonly ? "查看空间" : "拖动调整顺序，双击重命名，右键更多操作"}
                    className={`quote-space-tab quote-space-tab-draggable inline-flex min-h-8 shrink-0 select-none items-center gap-1 rounded-md border px-2.5 text-xs font-semibold transition ${isReadonly ? "" : "cursor-grab active:cursor-grabbing"} ${
                      active ? "quote-space-tab-active" : ""
                    } ${draggingSpace === space ? "scale-[0.98] opacity-55" : ""} ${dragOverSpace === space && draggingSpace !== space ? "quote-space-tab-drop-target" : ""}`}
                  >
                    <span className="quote-space-tab-icon">
                      <Home className="h-3.5 w-3.5" />
                    </span>
                    <span>{space}</span>
                  </button>
                );
              })}
            </div>
            {hiddenSpaceCount > 0 && (
              <span className="quote-hidden-space-count" title={`右侧还有 ${hiddenSpaceCount} 个空间`}>
                +{hiddenSpaceCount}
              </span>
            )}
            {!isReadonly && (
              <button
                type="button"
                onClick={addSpace}
                className="quote-add-space inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold"
              >
                <span className="quote-add-space-icon">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                <span>添加空间/类别</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => scrollSpaceTabs(1)}
              className="quote-nav-arrow inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-surface-200 bg-white text-surface-500"
              title="向右滑动"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {categoryCreateMenu && (
            <div
              className="quote-floating-menu quote-category-create-menu fixed z-[9998] w-40 rounded-lg border border-surface-200 bg-white p-1 shadow-[0_18px_38px_rgba(31,41,53,0.16)] no-print"
              style={{
                left: typeof window === "undefined" ? categoryCreateMenu.x : Math.max(8, Math.min(categoryCreateMenu.x, window.innerWidth - 168)),
                top: typeof window === "undefined" ? categoryCreateMenu.y : Math.max(8, Math.min(categoryCreateMenu.y, window.innerHeight - 208)),
              }}
              onClick={(event) => event.stopPropagation()}
              role="menu"
            >
              {availableCategoryCreateOptions.map((option) => {
                const existingCategory =
                  option.value === "base"
                    ? "base"
                    : option.value === "main_material"
                      ? "main_material"
                      : option.value === "custom_cabinet"
                        ? "custom_cabinet"
                        : "";
                const exists = existingCategory ? displayedProjectQuoteCategories.some((category) => sameQuoteCategory(category, existingCategory)) : false;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => addCategoryByType(option.value)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-surface-700 transition hover:bg-primary-50 hover:text-primary-700"
                    role="menuitem"
                  >
                    <span>{option.label}</span>
                    {exists && <span className="text-xs font-medium text-surface-400">已存在</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {spaceMenu && (
          <div
            className="quote-floating-menu fixed z-[9997] w-60 rounded-lg border border-surface-200 bg-white p-1 shadow-[0_18px_38px_rgba(31,41,53,0.16)]"
            style={{
              left: typeof window === "undefined" ? spaceMenu.x : Math.max(8, Math.min(spaceMenu.x, window.innerWidth - 248)),
              top: spaceMenu.y,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button onClick={() => copySpace(spaceMenu.space)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
              <Copy className="h-4 w-4" />
              复制报价
            </button>
            <button onClick={(event) => openCopySpaceMenu(event, spaceMenu.space)} className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
              <Copy className="h-4 w-4" />
              复制到其他空间/类别
            </button>
            <button onClick={() => renameSpace(spaceMenu.space)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
              <Pencil className="h-4 w-4" />
              重命名
            </button>
            <div className="my-1 border-t border-surface-100" />
            <button onClick={() => moveSpace(spaceMenu.space, -1)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
              <ChevronLeft className="h-4 w-4" />
              左移
            </button>
            <button onClick={() => moveSpace(spaceMenu.space, 1)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
              <ChevronRight className="h-4 w-4" />
              右移
            </button>
            <div className="my-1 border-t border-surface-100" />
            <button onClick={() => clearSpaceCategoryItems(spaceMenu.space)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
              <Eraser className="h-4 w-4" />
              清空该空间/类别
            </button>
            <button onClick={() => deleteSpace(spaceMenu.space)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
              删除空间/类别
            </button>
          </div>
        )}

        {spaceCopyMenu && (
          <div
            className="quote-floating-menu fixed z-[9998] w-56 rounded-lg border border-surface-200 bg-white p-1 shadow-[0_18px_38px_rgba(31,41,53,0.16)]"
            style={{
              left: typeof window === "undefined" ? spaceCopyMenu.x : Math.max(8, Math.min(spaceCopyMenu.x, window.innerWidth - 232)),
              top: typeof window === "undefined" ? spaceCopyMenu.y : Math.max(8, Math.min(spaceCopyMenu.y, window.innerHeight - 320)),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-3 py-2 text-xs font-semibold text-surface-400">
              复制到其他空间/类别
            </div>
            <div className="max-h-64 overflow-y-auto">
              {activeSpaces.filter((space) => space !== spaceCopyMenu.source).map((space) => (
                <button
                  key={space}
                  type="button"
                  onClick={() => openCopySpaceCategoryDialog(spaceCopyMenu.source, space)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-surface-700 hover:bg-primary-50 hover:text-primary-700"
                >
                    <span className="min-w-0 truncate">{space}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-surface-300" />
                </button>
              ))}
              {activeSpaces.filter((space) => space !== spaceCopyMenu.source).length === 0 && (
                <div className="px-3 py-5 text-center text-sm text-surface-400">暂无可复制的目标空间</div>
              )}
            </div>
          </div>
        )}

        {rowMenu && (
          <RowContextMenu
            x={rowMenu.x}
            y={rowMenu.y}
            item={items[rowMenu.index]}
            onInsertBefore={() => {
              insertItemNear(rowMenu.index, "before");
              setRowMenu(null);
            }}
            onInsertAfter={() => {
              insertItemNear(rowMenu.index, "after");
              setRowMenu(null);
            }}
            onCopy={() => {
              copyItem(rowMenu.index);
              setRowMenu(null);
            }}
            onCopyToSpace={(event) => openCopyRowMenu(event, rowMenu.index)}
            onSetAttribution={() => openAttributionDialog(rowMenu.index)}
            onSaveToCustomLibrary={() => saveItemToCustomLibrary(rowMenu.index)}
            onClear={() => {
              clearItemContent(rowMenu.index);
              setRowMenu(null);
            }}
            onColor={(value) => {
              patchRowColor(rowMenu.index, value);
              setRowMenu(null);
            }}
            onRemove={() => {
              removeItem(rowMenu.index);
              setRowMenu(null);
            }}
          />
        )}

        {attributionDialog && items[attributionDialog.index] && (
          <AttributionDialog
            item={items[attributionDialog.index]}
            workTypeOptions={workTypeOptions}
            materialCategoryOptions={materialCategoryOptions}
            onClose={() => setAttributionDialog(null)}
            onSave={(workTypeId, materialCategoryId) => saveAttribution(attributionDialog.index, workTypeId, materialCategoryId)}
          />
        )}

        {rowCopyMenu && items[rowCopyMenu.index] && (
          <div
            className="quote-floating-menu fixed z-[9998] w-56 rounded-lg border border-surface-200 bg-white p-1 shadow-[0_18px_38px_rgba(31,41,53,0.16)]"
            style={{
              left: typeof window === "undefined" ? rowCopyMenu.x : Math.max(8, Math.min(rowCopyMenu.x, window.innerWidth - 232)),
              top: typeof window === "undefined" ? rowCopyMenu.y : Math.max(8, Math.min(rowCopyMenu.y, window.innerHeight - 320)),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-3 py-2 text-xs font-semibold text-surface-400">复制本行到</div>
            <div className="max-h-64 overflow-y-auto">
              {activeSpaces.filter((space) => space !== inferItemSpace(items[rowCopyMenu.index])).map((space) => (
                <button
                  key={space}
                  type="button"
                  onClick={() => copyItemToSpace(rowCopyMenu.index, space)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-surface-700 hover:bg-primary-50 hover:text-primary-700"
                >
                  <span className="min-w-0 truncate">{space}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-surface-300" />
                </button>
              ))}
              {activeSpaces.filter((space) => space !== inferItemSpace(items[rowCopyMenu.index])).length === 0 && (
                <div className="px-3 py-5 text-center text-sm text-surface-400">暂无可复制的目标空间</div>
              )}
            </div>
          </div>
        )}

        {shouldShowCategoryChooser ? (
          <QuoteCategoryChooser
            readOnly={isReadonly}
            isAllSpaceView={isAllSpaceView}
            activeSpace={activeSpace === allSpacesValue ? "全部空间" : activeSpace}
            onSelect={addCategoryByType}
          />
        ) : activeCategory === noQuoteCategoryValue ? (
          <QuoteCategoryChooser
            readOnly={isReadonly}
            isAllSpaceView={isAllSpaceView}
            activeSpace={activeSpace === allSpacesValue ? "全部空间" : activeSpace}
            onSelect={addCategoryByType}
          />
        ) : (
          <QuoteSection
            title={getCategoryLabel(activeCategory)}
            category={activeCategory}
            activeSpace={isOtherCategory(activeCategory) ? undefined : activeSpace}
            activeSpaceAmount={activeSpaceAmount}
            items={activeItems}
            spaceOptions={activeSpaces}
            otherFeeRows={otherFeeRows}
            baseAmount={totals.baseAmount}
            materialAmount={totals.materialAmount}
            feeFormulaContext={feeFormulaContext}
            isAllSpaceView={isAllSpaceView}
            searchValue={itemSearch}
            onSearchChange={setItemSearch}
            onAdd={isBaseCategory(activeCategory)
              ? openQuotaPicker
              : isMainMaterialCategory(activeCategory)
                ? openProductPicker
                : () => appendManualItem(activeCategory, isAllSpaceView ? "" : activeSpace)}
            onManualAdd={isBaseCategory(activeCategory) || isMainMaterialCategory(activeCategory)
              ? () => appendManualItem(activeCategory, isAllSpaceView ? "" : activeSpace)
              : undefined}
            onOpenFindReplace={openFindReplaceDialog}
            categoryNavigation={showCategoryNavigation ? (
              <div className="quote-section-category-tabs no-print">
                {displayedProjectQuoteCategories.map((category) => {
                  const active = sameQuoteCategory(activeCategory, category);
                  const canDelete = !defaultQuoteCategories.includes(category) && !builtInDirectCategories.some((item) => sameQuoteCategory(item, category));
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveCategory(category)}
                      className={`quote-section-category-tab ${active ? "quote-section-category-tab-active" : ""}`}
                    >
                      <span className="min-w-0 truncate">{getCategoryLabel(category)}</span>
                      {canDelete && !isReadonly && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteCustomCategory(category);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            deleteCustomCategory(category);
                          }}
                          className={`quote-section-category-delete ${active ? "quote-section-category-delete-active" : ""}`}
                          title="删除大类"
                        >
                          <Trash2 className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
                {!isReadonly && canAddCategoryInCurrentView && (
                  <button
                    type="button"
                    onClick={openCategoryCreateMenu}
                    className="quote-section-category-create"
                    aria-haspopup="menu"
                    aria-expanded={!!categoryCreateMenu}
                    title="新增大类"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
              </div>
            ) : null}
            useQuotaLibraryAction={isBaseCategory(activeCategory)}
            selectedItemKeys={selectedQuoteItemKeySet}
            selectedItemCount={selectedActiveItemCount}
            onToggleItemSelection={toggleQuoteItemSelection}
            onToggleAllItemSelection={(keys) => {
              if (isReadonly || keys.length === 0) return;
              setSelectedQuoteItemKeys((current) => {
                const allSelected = keys.every((key) => current.includes(key));
                if (allSelected) return current.filter((key) => !keys.includes(key));
                return Array.from(new Set([...current, ...keys]));
              });
            }}
            onDeleteSelectedItems={deleteSelectedQuoteItems}
            onChange={updateItem}
            onOpenRowMenu={openRowMenu}
            readOnly={isReadonly}
            draggingItemIndex={draggingItemIndex}
            dragOverItem={dragOverItem}
            recentlyMovedItemKey={recentlyMovedItemKey}
            activeFindReplaceHighlight={activeFindReplaceHighlight}
            onItemPointerDown={startPointerItemDrag}
          />
        )}
      </div>

      {quotaPickerOpen && (
        <QuotaLibraryPickerModal
          items={quotaLibraryItems}
          targetText={`${isAllSpaceView ? "全部空间" : activeSpace || "未指定空间"} · ${getCategoryLabel(activeCategory)}`}
          isAllSpaceView={isAllSpaceView}
          onClose={() => setQuotaPickerOpen(false)}
          onConfirm={insertQuotaLibraryItems}
        />
      )}

      {productPickerOpen && (
        <ProductLibraryPickerModal
          items={productLibraryItems}
          loading={productPickerLoading}
          targetText={`${isAllSpaceView ? "全部空间" : activeSpace || "未指定空间"} · ${getCategoryLabel(activeCategory)}`}
          onClose={() => setProductPickerOpen(false)}
          onConfirm={insertProductLibraryItems}
        />
      )}

      <div className="print-quote-document">
        <QuotationPrintDocument quotation={printQuotation} items={items} settings={settings} shareUrl={shareUrl} />
      </div>

      {autoSaveStatus === "error" && (
        <div className="screen-quote-footer space-y-2">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{autoSaveErrorMessage || "自动保存失败，请检查网络后稍等系统重试。"}</p>
        </div>
      )}

      <style jsx global>{`
        .quotation-detail-ui {
          --quote-text: #162033;
          --quote-text-mid: #34445a;
          --quote-text-muted: #6f7f96;
          --quote-text-soft: #9aa8bb;
          --quote-line: #dce8f8;
          --quote-line-soft: #e9eff7;
          --quote-panel-soft: #f7f9fd;
          --quote-panel-tint: #f2f6ff;
          --quote-primary: #407AFF;
          --quote-primary-hover: #2f66e8;
          --quote-primary-soft: #edf4ff;
          --quote-command-height: 0px;
          color: var(--quote-text);
        }
        .quotation-detail-ui .quote-command-bar,
        .quotation-detail-ui .quote-space-navigation,
        .quotation-detail-ui .quote-category-navigation,
        .quotation-detail-ui .quote-section,
        .quotation-detail-ui .quote-expand-panel {
          border-color: var(--quote-line) !important;
          border-radius: var(--app-surface-radius) !important;
          background: #ffffff !important;
          box-shadow: 0 10px 22px rgba(55, 106, 168, 0.045) !important;
        }
        .quotation-detail-ui .quote-command-bar {
          padding: 12px !important;
          position: sticky;
          top: 0;
          z-index: 70;
        }
        .quotation-detail-ui .quote-space-navigation {
          position: sticky;
          top: 0;
          z-index: 65;
        }
        .quotation-detail-ui .quote-toolbar-actions {
          gap: 8px;
        }
        .quotation-detail-ui .quote-toolbar-button,
        .quotation-detail-ui .quote-primary-action {
          min-height: 38px !important;
          border-radius: 10px !important;
          font-weight: 650 !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-toolbar-button {
          border-color: var(--quote-line) !important;
          background: #ffffff !important;
          color: #52647b !important;
        }
        .quotation-detail-ui .quote-toolbar-button:hover {
          border-color: #cfe0ff !important;
          background: #f5f8ff !important;
          color: var(--quote-primary) !important;
        }
        .quotation-detail-ui .quote-expand-trigger.is-active {
          border-color: var(--quote-primary) !important;
          background: var(--quote-primary) !important;
          color: #ffffff !important;
        }
        .quotation-detail-ui .quote-expand-trigger.is-active svg {
          color: #ffffff !important;
        }
        .quotation-detail-ui .quote-primary-action {
          border-color: var(--quote-primary) !important;
          background: var(--quote-primary) !important;
          color: #ffffff !important;
        }
        .quotation-detail-ui .quote-primary-action:hover {
          border-color: var(--quote-primary-hover) !important;
          background: var(--quote-primary-hover) !important;
        }
        .quotation-detail-ui .quote-title-field {
          min-height: 38px;
          border-color: var(--quote-line) !important;
          border-radius: 10px !important;
          background: #ffffff !important;
        }
        .quotation-detail-ui .quote-title-field:focus-within {
          border-color: var(--quote-primary) !important;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.1);
        }
        .quotation-detail-ui .quote-title-field input {
          color: var(--quote-text) !important;
          font-weight: 650 !important;
        }
        .quotation-detail-ui .quote-save-status {
          border: 1px solid #edf2f9;
          border-radius: 10px !important;
          background: #f7f9fc !important;
          color: var(--quote-text-muted) !important;
        }
        .quotation-detail-ui .quote-total-summary {
          min-height: 38px;
          border-color: #fee1e1 !important;
          border-radius: 10px !important;
          background: #fff7f7 !important;
        }
        .quotation-detail-ui .quote-total-summary > span:last-child {
          font-size: 14px;
          font-weight: 750;
        }
        .quotation-detail-ui .quote-expand-panel {
          padding: 12px !important;
        }
        .quotation-detail-ui .quote-pricing-panel {
          border-color: #cfe0ff !important;
          background: #fbfcff !important;
        }
        .quotation-detail-ui .quote-pricing-panel > div:first-child > * {
          border-color: var(--quote-line) !important;
          border-radius: 10px !important;
          background: #ffffff !important;
        }
        .quotation-detail-ui .quote-pricing-panel .quote-pricing-total {
          border-color: #cfe0ff !important;
          background: var(--quote-primary-soft) !important;
        }
        .quotation-detail-ui .quote-pricing-calculation,
        .quotation-detail-ui .quote-discount-fields {
          border: 1px solid var(--quote-line-soft);
          border-radius: 10px !important;
          background: var(--quote-panel-soft) !important;
        }
        .quotation-detail-ui .quote-discount-fields {
          padding: 10px !important;
        }
        .quotation-detail-ui .quote-discount-scope-panel {
          background: #ffffff !important;
        }
        .quotation-detail-ui .quote-discount-step {
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.78);
          padding: 9px 10px;
          box-shadow: 0 6px 16px rgba(15, 23, 42, 0.03);
        }
        .quotation-detail-ui .quote-discount-step-title {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #172033;
          font-size: 12px;
          font-weight: 750;
        }
        .quotation-detail-ui .quote-discount-step-badge {
          display: inline-flex;
          height: 22px;
          width: 22px;
          align-items: center;
          justify-content: center;
          border: 1px solid #bfe8d3;
          border-radius: 8px;
          background: #f1fbf6;
          color: #159863;
        }
        .quotation-detail-ui .quote-discount-scope-grid {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 1px 1px 5px;
          scroll-snap-type: x proximity;
          scrollbar-color: #d6dde8 transparent;
          scrollbar-width: thin;
        }
        .quotation-detail-ui .quote-discount-scope-grid::-webkit-scrollbar {
          height: 4px;
        }
        .quotation-detail-ui .quote-discount-scope-grid::-webkit-scrollbar-track {
          background: transparent;
        }
        .quotation-detail-ui .quote-discount-scope-grid::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: #d6dde8;
        }
        .quotation-detail-ui .quote-discount-scope-grid:hover::-webkit-scrollbar-thumb {
          background: #b8c4d6;
        }
        .quotation-detail-ui .quote-discount-scope-card {
          position: relative;
          display: flex;
          min-height: 48px;
          min-width: 146px;
          flex: 1 0 146px;
          flex-direction: column;
          justify-content: center;
          gap: 3px;
          border: 1px solid #dfe7f1;
          border-radius: 10px;
          background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
          padding: 7px 30px 7px 10px;
          text-align: left;
          scroll-snap-align: start;
          transition: all 160ms ease;
        }
        .quotation-detail-ui .quote-discount-scope-card:hover:not(:disabled) {
          border-color: #9fd7bc;
          background: #fbfffd;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
        }
        .quotation-detail-ui .quote-discount-scope-card-active {
          border-color: #73d6a8 !important;
          background: #f5fffa !important;
          box-shadow: 0 0 0 1px rgba(24, 185, 120, 0.14), 0 6px 14px rgba(20, 184, 114, 0.07) !important;
        }
        .quotation-detail-ui .quote-discount-scope-name {
          min-width: 0;
          overflow: visible;
          line-height: 1.25;
          white-space: normal;
          color: var(--quote-text);
          font-size: 11px;
          font-weight: 650;
        }
        .quotation-detail-ui .quote-discount-scope-amount {
          color: var(--quote-text-muted);
          font-size: 11px;
          font-weight: 650;
          font-variant-numeric: tabular-nums;
        }
        .quotation-detail-ui .quote-discount-scope-card-active .quote-discount-scope-name,
        .quotation-detail-ui .quote-discount-scope-card-active .quote-discount-scope-amount,
        .quotation-detail-ui .quote-discount-scope-check {
          color: #159863 !important;
        }
	        .quotation-detail-ui .quote-discount-scope-check {
	          position: absolute;
	          right: 10px;
	          top: 50%;
	          transform: translateY(-50%);
	        }
	        .quotation-detail-ui .quote-discount-rule-card {
	          display: flex;
	          min-height: 50px;
	          align-items: center;
	          justify-content: space-between;
	          gap: 9px;
	          border: 1px solid #dfe7f1;
	          border-radius: 10px;
	          background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
	          padding: 8px 10px;
	          text-align: left;
	          transition: all 160ms ease;
	        }
	        .quotation-detail-ui .quote-discount-rule-card:hover:not(:disabled) {
	          border-color: #9fd7bc;
	          background: #fbfffd;
	          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
	        }
	        .quotation-detail-ui .quote-discount-rule-card:disabled {
	          cursor: not-allowed;
	          opacity: 0.58;
	        }
	        .quotation-detail-ui .quote-discount-rule-card-active {
	          border-color: #73d6a8 !important;
	          background: #f5fffa !important;
	        }
	        .quotation-detail-ui .quote-discount-rule-icon {
	          display: inline-flex;
	          width: 24px;
	          height: 24px;
	          flex: 0 0 auto;
	          align-items: center;
	          justify-content: center;
	          border: 1px solid #e2e8f0;
	          border-radius: 8px;
	          background: #f8fafc;
	          color: #667085;
	        }
	        .quotation-detail-ui .quote-discount-rule-card-active .quote-discount-rule-icon {
	          border-color: #bfe8d3;
	          background: #ecfdf3;
	          color: #159863;
	        }
	        .quotation-detail-ui .quote-discount-rule-copy {
	          display: flex;
	          min-width: 0;
	          flex-direction: column;
	          gap: 2px;
	        }
	        .quotation-detail-ui .quote-discount-rule-title {
	          color: var(--quote-text);
	          font-size: 11px;
	          font-weight: 750;
	          line-height: 1.25;
	        }
	        .quotation-detail-ui .quote-discount-rule-desc {
	          color: var(--quote-text-muted);
	          font-size: 10px;
	          font-weight: 500;
	          line-height: 1.35;
	        }
	        .quotation-detail-ui .quote-discount-rule-switch {
	          display: inline-flex;
	          width: 30px;
	          height: 16px;
	          flex: 0 0 auto;
	          align-items: center;
	          border-radius: 999px;
	          background: #d8e0ec;
	          padding: 2px;
	          transition: background 160ms ease;
	        }
	        .quotation-detail-ui .quote-discount-rule-switch span {
	          display: block;
	          width: 12px;
	          height: 12px;
	          border-radius: 999px;
	          background: #ffffff;
	          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.16);
	          transition: transform 160ms ease;
	        }
	        .quotation-detail-ui .quote-discount-rule-card-active .quote-discount-rule-switch {
	          background: #159863;
	        }
	        .quotation-detail-ui .quote-discount-rule-card-active .quote-discount-rule-switch span {
	          transform: translateX(14px);
	        }
	        .quotation-detail-ui .quote-discount-rule-card-input {
	          align-items: stretch;
	          display: grid;
	          grid-template-columns: 24px minmax(0, 1fr) minmax(86px, 122px);
	          align-items: center;
	        }
	        .quotation-detail-ui .quote-discount-rule-input {
	          position: relative;
	          display: block;
	        }
	        .quotation-detail-ui .quote-discount-rule-input input {
	          width: 100%;
	          height: 30px;
	          border: 1px solid #dbe5f2;
	          border-radius: 8px;
	          background: #f8fbff;
	          padding: 0 30px 0 10px;
	          color: var(--quote-text);
	          font-size: 12px;
	          font-weight: 650;
	          outline: none;
	        }
	        .quotation-detail-ui .quote-discount-rule-input input:focus {
	          border-color: var(--quote-primary);
	          background: #ffffff;
	          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.10);
	        }
	        .quotation-detail-ui .quote-discount-rule-input span {
	          pointer-events: none;
	          position: absolute;
	          right: 10px;
	          top: 50%;
	          transform: translateY(-50%);
	          color: var(--quote-text-muted);
	          font-size: 11px;
	          font-weight: 600;
	        }
        .quotation-detail-ui .quote-discount-empty {
          display: flex;
          min-height: 48px;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #f7f9fc;
          color: var(--quote-text-muted);
          font-size: 12px;
          font-weight: 600;
        }
        .quotation-detail-ui .quote-discount-type-grid,
		        .quotation-detail-ui .quote-discount-mode-grid {
		          border: 1px solid #dfe7f1 !important;
		          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72), 0 10px 24px rgba(15, 23, 42, 0.035) !important;
	        }
        .quotation-detail-ui .quote-discount-type-button,
	        .quotation-detail-ui .quote-discount-mode-button {
	          display: flex;
	          min-height: 58px !important;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          border: 1px solid transparent;
          border-radius: 10px !important;
          padding: 8px 10px !important;
          color: var(--quote-text-muted) !important;
          font-size: 12px !important;
	          font-weight: 650 !important;
	          transition: all 160ms ease !important;
	        }
        .quotation-detail-ui .quote-discount-type-button:hover:not(:disabled),
	        .quotation-detail-ui .quote-discount-mode-button:hover:not(:disabled) {
	          border-color: #dcefe5;
	          background: #fbfffd !important;
	          color: #159863 !important;
	        }
        .quotation-detail-ui .quote-discount-type-button-active,
        .quotation-detail-ui .quote-discount-type-button-active:hover:not(:disabled),
	        .quotation-detail-ui .quote-discount-mode-button-active,
	        .quotation-detail-ui .quote-discount-mode-button-active:hover:not(:disabled) {
	          border-color: #8fd8b0 !important;
	          background: linear-gradient(180deg, #f5fffa 0%, #eefaf3 100%) !important;
          color: #173426 !important;
          box-shadow: 0 0 0 1px rgba(24, 185, 120, 0.14), 0 6px 14px rgba(20, 184, 114, 0.07) !important;
        }
        .quotation-detail-ui .quote-discount-choice-icon {
          display: inline-flex;
          width: 20px;
          height: 20px;
          align-items: center;
          justify-content: center;
          border: 1px solid #e2e8f0;
          border-radius: 7px;
          background: #f8fafc;
          color: #667085;
          transition: all 160ms ease;
        }
        .quotation-detail-ui .quote-discount-type-button-active .quote-discount-choice-icon,
        .quotation-detail-ui .quote-discount-mode-button-active .quote-discount-choice-icon {
          border-color: #bfe8d3;
          background: #ffffff;
          color: #159863;
        }
        .quotation-detail-ui .quote-discount-mode-title {
          font-size: 12px;
          font-weight: 750;
          line-height: 1.2;
        }
        .quotation-detail-ui .quote-discount-mode-desc {
          font-size: 10px;
          font-weight: 600;
          line-height: 1.2;
          opacity: 0.82;
        }
        .quotation-detail-ui .quote-discount-fields label {
          color: var(--quote-text-mid) !important;
          font-size: 12px;
        }
        .quotation-detail-ui .quote-discount-result-card {
          border: 1px solid #dfe7f1;
          border-radius: 10px;
          background: #ffffff;
          padding: 8px 12px;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.03);
        }
        .quotation-detail-ui .quote-discount-result-card-warn {
          border-color: #fed7aa;
          background: #fff7ed;
        }
        .quotation-detail-ui .quote-discount-result-card-danger {
          border-color: #fecaca;
          background: #fff1f2;
        }
        .quotation-detail-ui .quote-discount-modal .input-field,
        .quotation-detail-ui .quote-search-field {
          min-height: 36px !important;
          border-color: var(--quote-line) !important;
          border-radius: 10px !important;
          background: #ffffff !important;
          box-shadow: none !important;
          color: var(--quote-text) !important;
        }
        .quotation-detail-ui .quote-discount-modal .input-field:focus,
        .quotation-detail-ui .quote-search-field:focus {
          border-color: var(--quote-primary) !important;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.1) !important;
        }
        .quotation-detail-ui .quote-space-navigation,
        .quotation-detail-ui .quote-category-navigation {
          padding: 10px !important;
        }
        .quotation-detail-ui .quote-nav-arrow {
          border-color: var(--quote-line) !important;
          border-radius: 10px !important;
          background: #ffffff !important;
          color: var(--quote-text-muted) !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-nav-arrow:hover {
          border-color: #cfe0ff !important;
          background: var(--quote-primary-soft) !important;
          color: var(--quote-primary) !important;
        }
        .quotation-detail-ui .quote-space-tabs {
          gap: 8px;
        }
        .quotation-detail-ui .quote-space-tabs-dragging {
          cursor: grabbing !important;
        }
        .quotation-detail-ui .quote-space-tabs-dragging .quote-space-tab:not(.quote-space-tab-drop-target) {
          transition-duration: 220ms !important;
        }
        .quotation-detail-ui .quote-space-tab {
          position: relative !important;
          min-height: 36px !important;
          border-color: var(--quote-line) !important;
          border-radius: 10px !important;
          background: #ffffff !important;
          color: var(--quote-text-muted) !important;
          box-shadow: none !important;
          overflow: visible !important;
          transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 160ms ease, border-color 160ms ease, background-color 160ms ease, color 160ms ease !important;
        }
        .quotation-detail-ui .quote-space-tab:hover {
          border-color: #cfe0ff !important;
          background: #f5f8ff !important;
          color: var(--quote-primary) !important;
        }
        .quotation-detail-ui .quote-space-tab-active,
        .quotation-detail-ui .quote-space-tab-active:hover {
          border-color: var(--quote-primary) !important;
          background: var(--quote-primary) !important;
          color: #ffffff !important;
        }
        .quotation-detail-ui .quote-space-tab-active .quote-space-grip {
          color: rgba(255, 255, 255, 0.72) !important;
        }
        .quotation-detail-ui .quote-space-tab-drop-target {
          border-color: var(--quote-primary) !important;
          background: #f7fbff !important;
          box-shadow: none !important;
          transform: translateX(10px) !important;
        }
        .quotation-detail-ui .quote-space-tab-drop-target::before {
          content: "" !important;
          position: absolute !important;
          left: -9px !important;
          top: 3px !important;
          bottom: 3px !important;
          width: 3px !important;
          border-radius: 999px !important;
          background: var(--quote-primary) !important;
          box-shadow: 0 0 0 4px rgba(64, 122, 255, 0.12) !important;
          animation: quote-space-drop-caret 900ms ease-in-out infinite !important;
        }
        @keyframes quote-space-drop-caret {
          0%, 100% {
            transform: scaleY(0.72);
            opacity: 0.72;
          }
          50% {
            transform: scaleY(1);
            opacity: 1;
          }
        }
        .quotation-detail-ui .quote-space-name-input {
          min-height: 36px !important;
          border-color: var(--quote-primary) !important;
          border-radius: 10px !important;
          background: #ffffff !important;
          color: var(--quote-text) !important;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.12) !important;
        }
        .quotation-detail-ui .quote-add-space {
          min-height: 36px !important;
          border-color: #cfe0ff !important;
          border-radius: 10px !important;
          background: #f7f9ff !important;
          color: var(--quote-primary) !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-add-space:hover {
          border-color: var(--quote-primary) !important;
          background: var(--quote-primary-soft) !important;
        }
        .quotation-detail-ui .quote-project-info-edit,
        .quotation-detail-ui .quote-discount-action,
        .quotation-detail-ui .quote-comprehensive-fee {
          font-size: 12px !important;
        }
        .quotation-detail-ui .quote-discount-action {
          min-height: 36px !important;
          border-color: #bfdbfe !important;
          border-radius: 10px !important;
          background: #ffffff !important;
          color: #2563eb !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-discount-action:hover {
          border-color: #93c5fd !important;
          background: #eff6ff !important;
          color: #1d4ed8 !important;
        }
        .quotation-detail-ui .quote-discount-action-active,
        .quotation-detail-ui .quote-discount-action-active:hover {
          border-color: #407aff !important;
          background: #407aff !important;
          color: #ffffff !important;
        }
        .quotation-detail-ui .quote-discount-action-amount {
          font-size: inherit !important;
          color: #1d4ed8 !important;
          font-weight: inherit !important;
        }
        .quotation-detail-ui .quote-discount-action-active .quote-discount-action-amount {
          color: #ffffff !important;
        }
        .quotation-detail-ui .quote-comprehensive-fee {
          min-height: 36px !important;
          border-color: #fdba74 !important;
          border-radius: 10px !important;
          background: #fff7ed !important;
          color: #c2410c !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-comprehensive-fee:hover {
          border-color: #f97316 !important;
          background: #ffedd5 !important;
          color: #9a3412 !important;
        }
        .quotation-detail-ui .quote-comprehensive-fee-active,
        .quotation-detail-ui .quote-comprehensive-fee-active:hover {
          border-color: #ea580c !important;
          background: #f97316 !important;
          color: #ffffff !important;
        }
        .quotation-detail-ui .quote-comprehensive-fee-amount {
          font-size: inherit !important;
          color: #b45309 !important;
          font-weight: inherit !important;
        }
        .quotation-detail-ui .quote-comprehensive-fee-active .quote-comprehensive-fee-amount {
          color: #ffffff !important;
        }
        .quotation-detail-ui .quote-category-tabs {
          border: 0 !important;
          border-radius: 10px !important;
          background: #ffffff !important;
          padding: 4px !important;
        }
        .quotation-detail-ui .quote-category-tab {
          min-height: 36px !important;
          border: 1px solid transparent;
          border-radius: 8px !important;
          background: transparent !important;
          color: var(--quote-text-muted) !important;
          font-weight: 650 !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-category-tab:hover {
          border-color: var(--quote-line) !important;
          background: #ffffff !important;
          color: var(--quote-primary) !important;
        }
        .quotation-detail-ui .quote-category-tab-active,
        .quotation-detail-ui .quote-category-tab-active:hover {
          border-color: var(--quote-primary) !important;
          background: var(--quote-primary) !important;
          color: #ffffff !important;
        }
        .quotation-detail-ui .quote-category-create {
          min-height: 36px !important;
          border: 1px solid #cfe0ff;
          border-radius: 8px !important;
          background: #f7f9ff !important;
          color: var(--quote-primary) !important;
        }
        .quotation-detail-ui .quote-category-create:hover {
          border-color: var(--quote-primary) !important;
          background: var(--quote-primary-soft) !important;
        }
        .quotation-detail-ui .quote-category-create-menu {
          color: #344054;
        }
        .quotation-detail-ui .quote-category-create-menu button + button {
          margin-top: 2px;
        }
        .quotation-detail-ui .quote-no-category-state {
          display: flex;
          min-height: calc(100vh - var(--quote-command-height) - 190px);
          align-items: center;
          justify-content: center;
          border: 1px solid #d9e2ef;
          border-radius: 12px;
          background: #ffffff;
        }
        .quotation-detail-ui .quote-no-category-state-inner {
          display: flex;
          max-width: 420px;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 34px 24px;
          text-align: center;
        }
        .quotation-detail-ui .quote-no-category-title {
          margin: 0;
          color: #1d2939;
          font-size: 15px;
          font-weight: 700;
        }
        .quotation-detail-ui .quote-no-category-text {
          margin: 0;
          color: #667085;
          font-size: 13px;
          line-height: 1.7;
        }
        .quotation-detail-ui .quote-category-chooser-state {
          min-height: calc(100vh - var(--quote-command-height) - 190px);
          justify-content: center;
          border: 1px solid #d9e2ef;
          border-radius: 12px;
          background: #ffffff;
        }
        .quotation-detail-ui .quote-category-chooser-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
          margin: auto;
          padding: 24px;
          text-align: center;
        }
        .quotation-detail-ui .quote-category-chooser-title {
          margin: 0;
          color: #1d2939;
          font-size: 15px;
          font-weight: 700;
        }
        .quotation-detail-ui .quote-category-chooser-text {
          margin: 8px 0 0;
          color: #667085;
          font-size: 13px;
          line-height: 1.7;
        }
        .quotation-detail-ui .quote-category-chooser-grid {
          display: grid;
          width: min(760px, 100%);
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .quotation-detail-ui .quote-category-chooser-card {
          display: flex;
          min-height: 136px;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 8px;
          border: 1px solid #dbe6f5;
          border-radius: 10px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          padding: 18px 22px;
          text-align: left;
          transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease, background 0.16s ease;
        }
        .quotation-detail-ui .quote-category-chooser-card:hover {
          border-color: #9fc0ff;
          background: #ffffff;
          box-shadow: 0 16px 34px rgba(64, 122, 255, 0.12);
          transform: translateY(-1px);
        }
        .quotation-detail-ui .quote-category-chooser-card:disabled {
          cursor: not-allowed;
          opacity: 0.55;
          transform: none;
          box-shadow: none;
        }
        .quotation-detail-ui .quote-category-chooser-icon {
          display: inline-flex;
          height: 32px;
          width: 32px;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #edf4ff;
          color: #407aff;
        }
        .quotation-detail-ui .quote-category-chooser-name {
          color: #162033;
          font-size: 14px;
          font-weight: 750;
        }
        .quotation-detail-ui .quote-category-chooser-desc {
          color: #667085;
          font-size: 12px;
          line-height: 1.6;
        }
        @media (max-width: 900px) {
          .quotation-detail-ui .quote-category-chooser-grid {
            grid-template-columns: 1fr;
          }
        }
        .quotation-detail-ui .quote-section {
          overflow: hidden;
        }
        .quotation-detail-ui .quote-section-header {
          min-height: 58px;
          align-items: center !important;
          padding-top: 6px !important;
          padding-bottom: 6px !important;
          border-color: var(--quote-line-soft) !important;
          background: #ffffff;
        }
        .quotation-detail-ui .quote-section-title {
          color: var(--quote-text) !important;
          font-size: 14px;
          font-weight: 700 !important;
        }
        .quotation-detail-ui .quote-section-title-strip {
          display: flex;
          min-width: 0;
          max-width: 100%;
          align-items: center;
          gap: 12px;
        }
        .quotation-detail-ui .quote-section-title-copy {
          width: max-content;
          max-width: min(420px, 34vw);
          flex: 0 0 auto;
          min-width: 0;
          padding-bottom: 0;
        }
        .quotation-detail-ui .quote-section-title-copy .quote-section-title {
          max-width: 100%;
        }
        .quotation-detail-ui .quote-section-category-tabs {
          display: inline-flex;
          min-width: 0;
          max-width: min(620px, 62vw);
          align-items: center;
          gap: 3px;
          margin-top: 0;
          margin-bottom: 0;
          border: 1px solid #d9e2ee;
          border-radius: 9px;
          background: #f3f6fa;
          padding: 3px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .quotation-detail-ui .quote-section-category-tabs::-webkit-scrollbar {
          display: none;
        }
        .quotation-detail-ui .quote-section-category-tab,
        .quotation-detail-ui .quote-section-category-create {
          display: inline-flex;
          height: 26px !important;
          min-height: 26px !important;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border-radius: 7px !important;
          padding: 0 14px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          line-height: 1 !important;
          transform: none;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }
        .quotation-detail-ui .quote-section-category-tab {
          position: relative;
          min-width: 72px;
          border: 1px solid transparent !important;
          background: transparent !important;
          color: #526174 !important;
          box-shadow: none;
        }
        .quotation-detail-ui .quote-section-category-tab:hover {
          background: rgba(255, 255, 255, 0.72) !important;
          color: #1f2937 !important;
        }
        .quotation-detail-ui .quote-section-category-tab-active,
        .quotation-detail-ui .quote-section-category-tab-active:hover {
          z-index: 1;
          border-color: #00875a !important;
          background: #00875a !important;
          color: #ffffff !important;
          font-weight: 700 !important;
          box-shadow: 0 1px 2px rgba(0, 135, 90, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.18);
        }
        .quotation-detail-ui .quote-section-category-delete {
          display: inline-flex;
          height: 18px;
          width: 18px;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          color: #98a2b3;
        }
        .quotation-detail-ui .quote-section-category-delete:hover {
          background: #ffffff;
          color: #dc2626;
        }
        .quotation-detail-ui .quote-section-category-delete-active {
          color: rgba(255, 255, 255, 0.78);
        }
        .quotation-detail-ui .quote-section-category-delete-active:hover {
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
        }
        .quotation-detail-ui .quote-section-category-create {
          min-width: 34px;
          padding: 0 9px !important;
          border: 1px solid transparent !important;
          background: transparent !important;
          color: #233044 !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-section-category-create:hover {
          background: #ffffff !important;
          color: #00875a !important;
        }
        .quotation-detail-ui .quote-section-summary {
          color: var(--quote-text-soft) !important;
          font-variant-numeric: tabular-nums;
        }
        .quotation-detail-ui .quote-manual-add {
          border-color: #cfe0ff !important;
          background: #f7f9ff !important;
          color: var(--quote-primary) !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-manual-add:hover {
          border-color: var(--quote-primary) !important;
          background: var(--quote-primary-soft) !important;
        }
        .quotation-detail-ui .quote-find-replace-button {
          border-color: #d9e2ef !important;
          background: #ffffff !important;
          color: #52647b !important;
          box-shadow: none !important;
          font-size: 12px !important;
        }
        .quotation-detail-ui .quote-find-replace-button:hover {
          border-color: #bfd5ef !important;
          background: #f5f8fc !important;
          color: #223249 !important;
        }
        html body .dashboard-scale-root .quotation-detail-ui .quote-find-replace-overlay.fixed[class*="items-center"][class*="justify-center"] {
          background: transparent !important;
          background-color: transparent !important;
          opacity: 1 !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          filter: none !important;
        }
        .quotation-detail-ui .quote-find-replace-overlay {
          background: transparent !important;
          background-color: transparent !important;
          opacity: 1 !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          filter: none !important;
        }
        .quotation-detail-ui .quote-find-replace-modal {
          font-size: 12px;
          box-shadow: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          filter: none !important;
        }
        .quotation-detail-ui .quote-find-replace-field {
          display: grid;
          gap: 6px;
          min-width: 0;
        }
        .quotation-detail-ui .quote-find-replace-field > span {
          color: #52647b;
          font-size: 12px;
          font-weight: 700;
          line-height: 18px;
        }
        .quotation-detail-ui .quote-find-replace-field > div {
          display: flex;
          height: 38px;
          align-items: center;
          gap: 8px;
          border: 1px solid #d9e2ef;
          border-radius: 10px;
          background: #ffffff;
          padding: 0 11px;
          color: #8a98aa;
          transition: border-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease;
        }
        .quotation-detail-ui .quote-find-replace-field > div:focus-within {
          border-color: #9bbcf0;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.10);
          color: #407aff;
        }
        .quotation-detail-ui .quote-find-replace-field input {
          min-width: 0;
          height: 100%;
          width: 100%;
          border: 0;
          background: transparent;
          caret-color: #407aff;
          color: #182230;
          font-size: 12px;
          font-weight: 600;
          line-height: normal;
          margin: 0;
          outline: none;
          padding: 0;
          -webkit-appearance: none;
          appearance: none;
        }
        .quotation-detail-ui .quote-find-replace-field input::placeholder {
          color: #9aa8b8;
          font-weight: 500;
        }
        .quotation-detail-ui .quote-find-replace-scope-panel {
          border: 1px solid #dfe7f1;
          border-radius: 13px;
          background: #ffffff;
          padding: 10px;
        }
        .quotation-detail-ui .quote-find-replace-section-title {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
          color: #52647b;
          font-size: 12px;
          font-weight: 800;
          line-height: 18px;
        }
        .quotation-detail-ui .quote-find-replace-scope {
          position: relative;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 9px;
          min-height: 54px;
          border: 1px solid #e3eaf3;
          border-radius: 12px;
          background: #fbfcfe;
          padding: 9px 10px;
          text-align: left;
          transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
        }
        .quotation-detail-ui .quote-find-replace-scope:hover {
          border-color: #c8d8ea;
          background: #ffffff;
        }
        .quotation-detail-ui .quote-find-replace-scope-icon {
          display: inline-flex;
          height: 30px;
          width: 30px;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: #eef4f8;
          color: #52647b;
        }
        .quotation-detail-ui .quote-find-replace-scope strong,
        .quotation-detail-ui .quote-find-replace-scope em {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-style: normal;
        }
        .quotation-detail-ui .quote-find-replace-scope strong {
          color: #223249;
          font-size: 12px;
          font-weight: 800;
          line-height: 18px;
        }
        .quotation-detail-ui .quote-find-replace-scope em {
          color: #7b8a9d;
          font-size: 11px;
          font-weight: 600;
          line-height: 16px;
        }
        .quotation-detail-ui .quote-find-replace-scope i {
          display: inline-flex;
          height: 18px;
          width: 18px;
          align-items: center;
          justify-content: center;
          border: 1px solid #cbd6e3;
          border-radius: 999px;
          color: transparent;
          font-style: normal;
        }
        .quotation-detail-ui .quote-find-replace-scope-active {
          border-color: #94d2b2;
          background: #f3fbf7;
          box-shadow: inset 0 0 0 1px rgba(21, 152, 99, 0.12);
        }
        .quotation-detail-ui .quote-find-replace-scope-active .quote-find-replace-scope-icon {
          background: #e0f5ea;
          color: #159863;
        }
        .quotation-detail-ui .quote-find-replace-scope-active i {
          border-color: #159863;
          background: #159863;
          color: #ffffff;
        }
        .quotation-detail-ui .quote-find-replace-results {
          overflow: hidden;
          border: 1px solid #dfe7f1;
          border-radius: 13px;
          background: #ffffff;
        }
        .quotation-detail-ui .quote-find-replace-results-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid #edf1f6;
          padding: 9px 11px;
        }
        .quotation-detail-ui .quote-find-replace-results-head span {
          color: #223249;
          font-size: 12px;
          font-weight: 800;
          line-height: 18px;
        }
        .quotation-detail-ui .quote-find-replace-results-head em {
          color: #7b8a9d;
          font-size: 11px;
          font-style: normal;
          font-weight: 700;
          line-height: 16px;
          white-space: nowrap;
        }
        .quotation-detail-ui .quote-find-replace-empty {
          display: flex;
          min-height: 74px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px;
          color: #7b8a9d;
          font-size: 12px;
          font-weight: 700;
          text-align: center;
        }
        .quotation-detail-ui .quote-find-replace-empty svg {
          color: #9aa8b8;
        }
        .quotation-detail-ui .quote-find-replace-empty-warn {
          background: #fffaf3;
          color: #9a5b14;
        }
        .quotation-detail-ui .quote-find-replace-empty-warn svg {
          color: #d0872f;
        }
        .quotation-detail-ui .quote-find-replace-result-list {
          max-height: 190px;
          overflow-y: auto;
          padding: 6px;
        }
        .quotation-detail-ui .quote-find-replace-result-list::-webkit-scrollbar {
          width: 6px;
        }
        .quotation-detail-ui .quote-find-replace-result-list::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: #cbd6e3;
        }
        .quotation-detail-ui .quote-find-replace-result {
          display: grid;
          grid-template-columns: 26px minmax(0, 1fr);
          gap: 9px;
          width: 100%;
          border: 1px solid transparent;
          border-radius: 10px;
          background: transparent;
          padding: 7px 8px;
          text-align: left;
          transition: border-color 0.16s ease, background 0.16s ease;
        }
        .quotation-detail-ui .quote-find-replace-result:hover {
          border-color: #d5e0ec;
          background: #f6f9fc;
        }
        .quotation-detail-ui .quote-find-replace-result-active,
        .quotation-detail-ui .quote-find-replace-result-active:hover {
          border-color: #9ad6b7;
          background: #f0fbf5;
        }
        .quotation-detail-ui .quote-find-replace-result-index {
          display: inline-flex;
          height: 22px;
          min-width: 22px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #eef2f6;
          color: #52647b;
          font-size: 11px;
          font-weight: 800;
          line-height: 1;
        }
        .quotation-detail-ui .quote-find-replace-result-active .quote-find-replace-result-index {
          background: #159863;
          color: #ffffff;
        }
        .quotation-detail-ui .quote-find-replace-result-main {
          min-width: 0;
        }
        .quotation-detail-ui .quote-find-replace-result-meta {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 8px;
        }
        .quotation-detail-ui .quote-find-replace-result-meta strong {
          flex: 0 0 auto;
          color: #223249;
          font-size: 12px;
          font-weight: 800;
          line-height: 18px;
        }
        .quotation-detail-ui .quote-find-replace-result-meta em {
          min-width: 0;
          overflow: hidden;
          color: #7b8a9d;
          font-size: 11px;
          font-style: normal;
          font-weight: 600;
          line-height: 16px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quotation-detail-ui .quote-find-replace-result-text {
          display: block;
          overflow: hidden;
          color: #52647b;
          font-size: 11px;
          font-weight: 600;
          line-height: 17px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quotation-detail-ui .quote-find-replace-result-text mark {
          border-radius: 4px;
          background: #fff1a8;
          color: #182230;
          font-weight: 800;
          padding: 0 2px;
        }
        .quotation-detail-ui .quote-bulk-delete {
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-bulk-delete:hover {
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-section .thin-scroll-area {
          background: #ffffff;
        }
        .quotation-detail-ui .quote-section table {
          border-collapse: collapse !important;
          border-spacing: 0 !important;
          color: var(--quote-text-mid);
          font-size: 12px !important;
        }
        .quotation-detail-ui .quote-section thead,
        .quotation-detail-ui .quote-section th {
          background: #f7f9fd !important;
        }
        .quotation-detail-ui .quote-section th {
          border-color: var(--quote-line) !important;
          color: #52647b !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          letter-spacing: 0;
        }
        .quotation-detail-ui .quote-section td {
          border-color: var(--quote-line-soft) !important;
          color: var(--quote-text-mid);
          font-size: 12px !important;
        }
        .quotation-detail-ui .quote-section .text-red-500,
        .quotation-detail-ui .quote-section .text-red-600,
        .quotation-detail-ui .quote-section .text-red-700 {
          color: #dc2626 !important;
        }
        .quotation-detail-ui .quote-section tbody tr {
          background: #ffffff;
        }
        .quotation-detail-ui .quote-section tbody tr:hover td {
          background: #f8fbff;
        }
        .quotation-detail-ui .quote-section tbody tr:last-child td {
          border-bottom-color: var(--quote-line-soft) !important;
        }
        .quotation-detail-ui .quote-section-footer {
          border-color: var(--quote-line-soft) !important;
          background: #ffffff;
        }
        .quotation-detail-ui .quote-add-row {
          border-color: #cfe0ff !important;
          border-radius: 10px !important;
          background: #f7f9ff !important;
          color: var(--quote-primary) !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-add-row:hover {
          border-color: var(--quote-primary) !important;
          background: var(--quote-primary-soft) !important;
        }
        .quotation-detail-ui .quote-floating-menu {
          border-color: var(--quote-line) !important;
          border-radius: var(--app-surface-radius) !important;
          box-shadow: 0 16px 34px rgba(27, 51, 88, 0.12), 0 4px 10px rgba(27, 51, 88, 0.05) !important;
        }
        .quotation-detail-ui .quote-floating-menu button {
          border-radius: 8px;
          font-weight: 600;
        }
        .quote-space-tabs {
          scrollbar-width: none;
          -ms-overflow-style: none;
          scroll-behavior: auto;
          overscroll-behavior-x: contain;
        }
        .quote-space-tabs::-webkit-scrollbar {
          display: none;
        }
        .quote-item-row {
          transition: opacity 160ms ease, border-color 160ms ease;
        }
        .quote-item-row > td {
          transition: background-color 240ms ease, box-shadow 240ms ease;
        }
        .quotation-detail-ui .quote-cell-input,
        .quotation-detail-ui .quote-cell-textarea {
          width: 100%;
          border: 0;
          border-radius: 0;
          background: transparent;
          outline: none;
          box-shadow: none;
        }
        .quotation-detail-ui .quote-cell-input {
          min-height: 34px;
          padding: 6px 8px;
        }
        .quotation-detail-ui .quote-cell-textarea {
          min-height: 42px;
          max-height: 72px;
          resize: vertical;
          padding: 6px 10px;
          line-height: 1.45;
          display: block;
        }
        .quotation-detail-ui .quote-cell-textarea-middle {
          box-sizing: border-box;
          height: 52px;
          min-height: 42px;
          max-height: 72px;
          padding-top: 13px;
          padding-bottom: 5px;
        }
        .quote-name-textarea {
          min-height: 34px !important;
          max-height: 72px !important;
          resize: none !important;
          overflow: hidden !important;
          padding-top: 6px !important;
          padding-bottom: 6px !important;
          line-height: 20px !important;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .quote-name-measure {
          position: fixed;
          left: -9999px;
          top: -9999px;
          visibility: hidden;
          white-space: nowrap;
          pointer-events: none;
          z-index: -1;
        }
        .quotation-detail-ui .quote-special-mark {
          position: absolute;
          right: 7px;
          top: 6px;
          z-index: 2;
          display: inline-flex;
          height: 17px;
          min-width: 17px;
          align-items: center;
          justify-content: center;
          border-radius: 5px;
          border: 1px solid #fed7aa;
          background: #fff7ed;
          color: #c2410c;
          font-size: 11px;
          font-weight: 750;
          line-height: 1;
          pointer-events: none;
        }
        .quotation-detail-ui .quote-special-menu-mark {
          display: inline-flex;
          height: 18px;
          min-width: 18px;
          align-items: center;
          justify-content: center;
          border-radius: 5px;
          border: 1px solid #fed7aa;
          background: #fff7ed;
          color: #c2410c;
          font-size: 11px;
          font-weight: 750;
          line-height: 1;
        }
        .quotation-detail-ui .quote-cell-input:focus,
        .quotation-detail-ui .quote-cell-textarea:focus {
          background: rgba(64, 122, 255, 0.045);
          box-shadow: inset 0 0 0 1px rgba(64, 122, 255, 0.42);
        }
        .quote-item-row-moved {
          animation: quote-item-settle 560ms ease-out;
        }
        .quote-item-row-moved > td {
          animation: quote-item-cell-settle 560ms ease-out;
        }
        .quotation-detail-ui .quote-cell-find-highlighted {
          color: transparent !important;
          caret-color: #182230;
        }
        .quotation-detail-ui .quote-name-highlight-layer {
          pointer-events: none;
          position: absolute;
          inset: 0;
          z-index: 1;
          display: flex;
          min-height: 56px;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          color: #182230;
          line-height: 20px;
        }
        .quotation-detail-ui .quote-name-highlight-layer-multiline {
          align-items: center;
          max-height: 72px;
        }
        .quotation-detail-ui .quote-find-replace-text-hit {
          border-radius: 4px;
          background: #fff1a8;
          box-shadow: inset 0 -1px 0 rgba(217, 119, 6, 0.24);
          color: #111827;
          font: inherit;
          padding: 0 2px;
        }
        .quotation-detail-ui .quote-item-row-drop-before > td {
          box-shadow: inset 0 2px 0 rgba(64, 122, 255, 0.95) !important;
        }
        .quotation-detail-ui .quote-item-row-drop-after > td {
          box-shadow: inset 0 -2px 0 rgba(64, 122, 255, 0.95) !important;
        }
        .quotation-detail-ui .quote-row-index-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          min-height: 28px;
        }
        .quotation-detail-ui .quote-row-number-wrap {
          position: relative;
          display: inline-flex;
          min-width: 22px;
          height: 22px;
          align-items: center;
          justify-content: center;
          border: 0;
          background: transparent;
          color: inherit;
          cursor: pointer;
          padding: 0;
        }
        .quotation-detail-ui .quote-row-checkbox {
          position: absolute;
          left: 50%;
          top: 50%;
          height: 14px;
          width: 14px;
          margin: 0;
          transform: translate(-50%, -50%);
          cursor: pointer;
          opacity: 0;
          accent-color: #407AFF;
          transition: opacity 140ms ease;
        }
        .quotation-detail-ui .quote-item-row:hover .quote-row-checkbox,
        .quotation-detail-ui .quote-row-index-inner.is-selected .quote-row-checkbox {
          opacity: 1;
        }
        .quotation-detail-ui .quote-row-index-inner.is-selected .quote-row-number,
        .quotation-detail-ui .quote-item-row:hover .quote-row-index-inner:not(.is-selected) .quote-row-number {
          opacity: 0;
        }
        .quotation-detail-ui .quote-index-header-cell {
          width: 80px;
        }
        .quotation-detail-ui .quote-index-header-control {
          position: relative;
          display: inline-flex;
          min-width: 42px;
          height: 24px;
          align-items: center;
          justify-content: center;
          border: 0;
          background: transparent;
          color: inherit;
          cursor: pointer;
          padding: 0;
          font: inherit;
        }
        .quotation-detail-ui .quote-index-header-control:disabled {
          cursor: default;
        }
        .quotation-detail-ui .quote-index-header-checkbox {
          position: absolute;
          left: 50%;
          top: 50%;
          height: 14px;
          width: 14px;
          margin: 0;
          transform: translate(-50%, -50%);
          cursor: pointer;
          opacity: 0;
          accent-color: #407AFF;
          transition: opacity 140ms ease;
        }
        .quotation-detail-ui .quote-index-header-cell:hover .quote-index-header-checkbox,
        .quotation-detail-ui .quote-index-header-control.is-selected .quote-index-header-checkbox {
          opacity: 1;
        }
        .quotation-detail-ui .quote-index-header-cell:hover .quote-index-header-control:not(.is-selected) .quote-index-header-label,
        .quotation-detail-ui .quote-index-header-control.is-selected .quote-index-header-label {
          opacity: 0;
        }
        .quotation-detail-ui .quote-row-index-inner .quote-row-number {
          min-width: 0;
          font-size: 12px !important;
          font-weight: 400 !important;
          line-height: 1;
          text-align: center;
        }
        @keyframes quote-item-settle {
          0% { transform: translateY(-8px); }
          55% { transform: translateY(2px); }
          100% { transform: translateY(0); }
        }
        @keyframes quote-item-cell-settle {
          0% {
            background-color: rgba(64, 122, 255, 0.12);
            box-shadow: inset 3px 0 0 rgba(64, 122, 255, 0.72);
          }
          100% {
            background-color: transparent;
            box-shadow: inset 0 0 0 rgba(64, 122, 255, 0);
          }
        }
        .quotation-detail-ui .quote-command-bar,
        .quotation-detail-ui .quote-space-navigation,
        .quotation-detail-ui .quote-category-navigation,
        .quotation-detail-ui .quote-section,
        .quotation-detail-ui .quote-expand-panel {
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.035) !important;
        }
        .quotation-detail-ui .quote-command-bar {
          border-color: #d9e2ef !important;
          background: rgba(255, 255, 255, 0.96) !important;
          backdrop-filter: blur(14px);
        }
        .quotation-detail-ui .quote-space-navigation {
          top: 0 !important;
          border-color: #d9e2ef !important;
          background: #ffffff !important;
        }
        .quotation-detail-ui .quote-category-navigation {
          border-color: #d9e2ef !important;
          background: #f9fbff !important;
        }
        .quotation-detail-ui .quote-section {
          border-color: #d9e2ef !important;
          background: #ffffff !important;
        }
        .quotation-detail-ui .quote-toolbar-button,
        .quotation-detail-ui .quote-primary-action,
        .quotation-detail-ui .quote-title-field,
        .quotation-detail-ui .quote-save-status,
        .quotation-detail-ui .quote-total-summary,
        .quotation-detail-ui .quote-expand-trigger,
        .quotation-detail-ui .quote-nav-arrow,
        .quotation-detail-ui .quote-space-tab,
        .quotation-detail-ui .quote-add-space,
        .quotation-detail-ui .quote-comprehensive-fee,
        .quotation-detail-ui .quote-category-tabs,
        .quotation-detail-ui .quote-category-tab,
        .quotation-detail-ui .quote-category-create,
        .quotation-detail-ui .quote-category-delete,
        .quotation-detail-ui .quote-pricing-metric,
        .quotation-detail-ui .quote-pricing-total,
        .quotation-detail-ui .quote-pricing-calculation,
        .quotation-detail-ui .quote-discount-fields,
        .quotation-detail-ui .quote-discount-modal .input-field,
        .quotation-detail-ui .quote-search-field,
        .quotation-detail-ui .quote-manual-add,
        .quotation-detail-ui .quote-add-row,
        .quotation-detail-ui .quote-floating-menu button,
        .quotation-detail-ui .screen-quote-footer p,
        .quotation-detail-ui input,
        .quotation-detail-ui select,
        .quotation-detail-ui textarea,
        .quotation-detail-ui button,
        .quotation-detail-ui a {
          border-radius: 8px;
        }
        .quotation-detail-ui .quote-section .thin-scroll-area {
          min-height: 280px;
          flex: 1 1 auto;
          background: linear-gradient(180deg, #ffffff 0%, #fbfcff 100%) !important;
        }
        .quotation-detail-ui .quote-section table {
          border-collapse: separate !important;
          border-spacing: 0 !important;
        }
        .quotation-detail-ui .quote-section thead {
          position: sticky;
          top: 0;
          z-index: 3;
        }
        .quotation-detail-ui .quote-section th {
          height: 38px;
          border-color: #dfe7f2 !important;
          background: #f2f6fb !important;
          color: #53657d !important;
          font-size: 11px !important;
          line-height: 1.35 !important;
          white-space: nowrap;
        }
        .quotation-detail-ui .quote-section td {
          height: 52px;
          border-color: #e7edf5 !important;
          background-clip: padding-box;
          font-size: 12px !important;
          line-height: 1.45;
        }
        .quotation-detail-ui .quote-section tbody tr:nth-child(even):not(:last-child) td {
          background-color: #fcfdff;
        }
        .quotation-detail-ui .quote-section tbody tr:hover td {
          background-color: #f5f9ff !important;
        }
        .quotation-detail-ui .quote-section tbody tr:last-child td {
          background: #f8fafd !important;
          font-weight: 700;
        }
        .quotation-detail-ui .quote-cell-input {
          min-height: 42px !important;
          padding: 8px 10px !important;
          font-size: 12px !important;
        }
        .quotation-detail-ui .quote-cell-textarea {
          min-height: 48px !important;
          max-height: 92px !important;
          padding: 8px 10px !important;
          font-size: 12px !important;
          line-height: 1.45;
        }
        .quotation-detail-ui .quote-cell-textarea-middle {
          height: 56px !important;
          padding-top: 17px !important;
          padding-bottom: 17px !important;
          line-height: 20px !important;
          overflow-y: hidden !important;
        }
        .quotation-detail-ui .quote-cell-textarea-centered {
          min-height: 34px !important;
          max-height: 72px !important;
          resize: none !important;
          overflow-y: hidden !important;
          padding: 6px 10px !important;
          line-height: 20px !important;
        }
        .quotation-detail-ui .quote-name-cell-input {
          box-sizing: border-box !important;
          display: block !important;
          height: 36px !important;
          min-height: 36px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          line-height: 36px !important;
        }
        .quotation-detail-ui .quote-cell-input:hover,
        .quotation-detail-ui .quote-cell-textarea:hover {
          background: rgba(64, 122, 255, 0.035);
        }
        .quotation-detail-ui .quote-description-trigger {
          display: flex;
          min-height: 56px;
          width: 100%;
          align-items: center;
          justify-content: flex-start;
          border: 0;
          background: transparent;
          padding: 7px 10px;
          text-align: left;
          color: #34445a;
          transition: background-color 160ms ease, box-shadow 160ms ease, color 160ms ease;
        }
        .quotation-detail-ui .quote-description-trigger:hover {
          background: rgba(64, 122, 255, 0.035);
          color: #182230;
        }
        .quotation-detail-ui .quote-description-trigger:focus-visible {
          outline: none;
          background: rgba(64, 122, 255, 0.045);
          box-shadow: inset 0 0 0 1px rgba(64, 122, 255, 0.42);
        }
        .quotation-detail-ui .quote-description-preview {
          display: -webkit-box;
          max-height: 40px;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font-size: 12px !important;
          line-height: 20px;
        }
        .quotation-detail-ui .quote-description-placeholder {
          color: #98a2b3;
        }
        .quote-description-modal {
          border-radius: 14px !important;
          border: 1px solid #d9e2ef !important;
          box-shadow: 0 24px 72px rgba(15, 35, 70, 0.22) !important;
        }
        .quote-description-modal textarea {
          min-height: 220px !important;
          resize: vertical !important;
          border-radius: 10px !important;
          border: 1px solid #d9e2ef !important;
          background: #ffffff !important;
          color: #182230 !important;
          box-shadow: none !important;
        }
        .quote-description-modal textarea:focus {
          border-color: #407AFF !important;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.12) !important;
          outline: none !important;
        }
        .quotation-detail-ui .quote-cell-select {
          min-height: 36px !important;
          margin: 4px auto !important;
          width: calc(100% - 8px) !important;
          border: 1px solid #dce8f8 !important;
          background: #ffffff !important;
          color: #34445a !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-cell-select:hover {
          border-color: #bdd2ff !important;
          background: #f6f9ff !important;
          color: var(--quote-primary) !important;
        }
        .quotation-detail-ui .quote-cell-select[aria-expanded="true"],
        .quotation-detail-ui .quote-cell-select:focus,
        .quotation-detail-ui .quote-cell-select:focus-within {
          border-color: var(--quote-primary) !important;
          background: #ffffff !important;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.1) !important;
        }
        .quotation-detail-ui .quote-space-cell-select {
          justify-content: center;
          padding-left: 10px !important;
          padding-right: 8px !important;
        }
        .quotation-detail-ui .quote-fee-method-select {
          min-width: 104px !important;
          padding-left: 10px !important;
          padding-right: 8px !important;
        }
        .quote-system-select-menu {
          z-index: 10020 !important;
          border-color: #d9e2ef !important;
          border-radius: 10px !important;
          background: #ffffff !important;
          padding: 6px !important;
          box-shadow: 0 18px 44px rgba(27, 51, 88, 0.14), 0 4px 14px rgba(27, 51, 88, 0.06) !important;
        }
        .quote-system-select-option {
          min-height: 36px !important;
          border-radius: 8px !important;
          font-size: 13px !important;
          font-weight: 650 !important;
        }
        .quotation-detail-ui.quote-workbench-shell {
          --quote-header-border: #d9e2ef;
          --quote-header-divider: #e8eef6;
          --quote-header-tint: #f7faff;
        }
        .quotation-detail-ui.quote-workbench-shell > .quote-command-bar {
          margin: 0 !important;
          border-color: var(--quote-header-border) !important;
          border-bottom-color: var(--quote-header-divider) !important;
          border-radius: 12px 12px 0 0 !important;
          background: rgba(255, 255, 255, 0.98) !important;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.035) !important;
        }
        .quotation-detail-ui.quote-workbench-shell > [data-quote-expandable] {
          margin-top: 8px !important;
        }
        .quotation-detail-ui.quote-workbench-shell > .screen-quote-sections {
          margin-top: 0 !important;
        }
        .quotation-detail-ui.quote-workbench-shell > .screen-quote-footer {
          margin-top: 10px !important;
        }
        .quotation-detail-ui .screen-quote-sections > .quote-space-navigation {
          margin: 0 !important;
          border-top: 0 !important;
          border-color: var(--quote-header-border) !important;
          border-bottom-color: var(--quote-header-divider) !important;
          border-radius: 0 !important;
          background: #ffffff !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .screen-quote-sections > .quote-category-navigation {
          margin: 0 !important;
          border-top: 0 !important;
          border-color: var(--quote-header-border) !important;
          border-radius: 0 0 12px 12px !important;
          background: var(--quote-header-tint) !important;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.025) !important;
        }
        .quotation-detail-ui .screen-quote-sections > .quote-space-navigation:first-child:last-child {
          border-radius: 0 0 12px 12px !important;
        }
        .quotation-detail-ui .screen-quote-sections:not(:has(> .quote-category-navigation)) > .quote-space-navigation {
          border-radius: 0 0 12px 12px !important;
        }
        .quotation-detail-ui .screen-quote-sections > .quote-section {
          margin-top: 12px !important;
        }
        .quotation-detail-ui .quote-category-tabs {
          background: transparent !important;
          padding: 0 !important;
        }
        .quotation-detail-ui .quote-category-tab {
          border-color: transparent !important;
          background: transparent !important;
        }
        .quotation-detail-ui .quote-category-tab:not(.quote-category-tab-active):hover {
          border-color: #dbe6f5 !important;
          background: #ffffff !important;
        }
        .quotation-detail-ui .quote-category-create {
          background: #ffffff !important;
        }
        .quotation-detail-ui .quote-space-tab-active,
        .quotation-detail-ui .quote-space-tab-active:hover,
        .quotation-detail-ui .quote-category-tab-active,
        .quotation-detail-ui .quote-category-tab-active:hover,
        .quotation-detail-ui .quote-primary-action {
          color: #ffffff !important;
          border-color: var(--quote-primary) !important;
          background: var(--quote-primary) !important;
        }
        .quotation-detail-ui .quote-toolbar-button:hover,
        .quotation-detail-ui .quote-nav-arrow:hover,
        .quotation-detail-ui .quote-space-tab:hover,
        .quotation-detail-ui .quote-category-tab:hover,
        .quotation-detail-ui .quote-add-space:hover,
        .quotation-detail-ui .quote-category-create:hover,
        .quotation-detail-ui .quote-manual-add:hover,
        .quotation-detail-ui .quote-add-row:hover {
          color: var(--quote-primary) !important;
          border-color: #bdd2ff !important;
          background: #f3f7ff !important;
        }
        .quotation-detail-ui .quote-category-tabs {
          background: #edf2f8 !important;
        }
        .quotation-detail-ui .quote-category-tab {
          width: auto !important;
          min-width: 136px !important;
        }
        .quotation-detail-ui .quote-category-tab-active .quote-category-delete {
          color: rgba(255, 255, 255, 0.72) !important;
        }
        .quotation-detail-ui.quote-workbench-shell > .quote-command-bar {
          border-radius: 12px !important;
        }
        .quotation-detail-ui.quote-workbench-shell > .screen-quote-sections {
          margin-top: 0 !important;
        }
        .quotation-detail-ui .screen-quote-sections > .quote-space-navigation {
          border: 1px solid var(--quote-header-border) !important;
          border-radius: 12px !important;
          background: #ffffff !important;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.035) !important;
        }
        .quotation-detail-ui .quote-space-navigation > .quote-category-navigation {
          margin-top: 10px !important;
          border: 0 !important;
          border-top: 1px solid var(--quote-header-divider) !important;
          border-radius: 0 !important;
          background: transparent !important;
          padding: 10px 0 0 !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui .quote-space-navigation > .quote-category-navigation .quote-category-tabs {
          align-items: center;
          background: transparent !important;
          padding: 0 !important;
        }
        .quotation-detail-ui .quote-space-navigation > .quote-category-navigation .quote-category-tab {
          min-height: 34px !important;
          min-width: 88px !important;
          width: auto !important;
          border: 1px solid transparent !important;
          background: transparent !important;
          color: #667085 !important;
          padding: 0 12px !important;
        }
        .quotation-detail-ui .quote-space-navigation > .quote-category-navigation .quote-category-tab:hover {
          border-color: #d8e4f4 !important;
          background: #ffffff !important;
          color: var(--quote-primary) !important;
        }
        .quotation-detail-ui .quote-space-navigation > .quote-category-navigation .quote-category-tab-active,
        .quotation-detail-ui .quote-space-navigation > .quote-category-navigation .quote-category-tab-active:hover {
          border-color: #bdd2ff !important;
          background: #edf4ff !important;
          color: var(--quote-primary) !important;
        }
        .quotation-detail-ui .quote-space-navigation > .quote-category-navigation .quote-category-delete {
          color: #98a2b3 !important;
          opacity: 0;
          transition: opacity 160ms ease, color 160ms ease, background-color 160ms ease;
        }
        .quotation-detail-ui .quote-space-navigation > .quote-category-navigation .quote-category-tab:hover .quote-category-delete {
          opacity: 1;
        }
        .quotation-detail-ui .quote-space-navigation > .quote-category-navigation .quote-category-delete:hover {
          background: #fee4e2 !important;
          color: #dc2626 !important;
        }
        .quotation-detail-ui .quote-space-navigation > .quote-category-navigation .quote-category-create {
          min-height: 34px !important;
          min-width: 112px !important;
          border-color: #cfe0ff !important;
          background: #f7f9ff !important;
          color: var(--quote-primary) !important;
        }
        .quotation-detail-ui .quote-section-footer {
          background: #fbfcff !important;
        }
        .quote-library-picker-modal {
          --quote-library-primary: #407AFF;
          --quote-library-primary-hover: #2f66e8;
          --quote-library-border: #d9e2ef;
          --quote-library-divider: #e8eef6;
          --quote-library-text: #182230;
          --quote-library-muted: #667085;
          --quote-library-sticky-bg: #ffffff;
          border-color: #d9e2ef !important;
          border-radius: 16px !important;
          box-shadow: 0 24px 70px rgba(15, 35, 70, 0.20) !important;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal {
          background: #ffffff;
          color: #182230;
        }
        .quote-library-picker-modal .quote-library-header,
        .quote-library-picker-modal .quote-library-filter-row,
        .quote-library-picker-modal .quote-library-footer {
          flex: 0 0 auto;
        }
        .quote-library-picker-modal .quote-library-search-input,
        .quote-library-picker-modal .quote-library-category-select,
        .quote-library-picker-modal .quote-library-select-all,
        .quote-library-picker-modal .quote-library-footer button,
        .quote-library-picker-modal .quote-library-close {
          border-radius: 10px !important;
        }
        .quote-library-picker-modal .quote-library-primary-text {
          color: var(--quote-library-primary) !important;
        }
        .quote-library-picker-modal .quote-library-primary-action {
          border-color: var(--quote-library-primary) !important;
          background: var(--quote-library-primary) !important;
        }
        .quote-library-picker-modal .quote-library-primary-action:hover {
          border-color: var(--quote-library-primary-hover) !important;
          background: var(--quote-library-primary-hover) !important;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-library-header {
          background: #fbfcff !important;
          padding-top: 14px !important;
          padding-bottom: 14px !important;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-library-title {
          color: #182230;
          letter-spacing: 0;
        }
        .quote-library-picker-modal .quote-library-target-pill {
          display: inline-flex;
          max-width: min(520px, 100%);
          height: 24px;
          align-items: center;
          border-left: 1px solid #d8e1ee;
          padding: 0 0 0 12px;
          color: #61728a;
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-library-filter-row {
          background: #f7f9fc !important;
          padding-top: 12px !important;
          padding-bottom: 12px !important;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-library-filter-field > span {
          display: block;
          margin-bottom: 6px;
          color: #52647b;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-library-filter-field svg {
          top: auto !important;
          bottom: 12px !important;
          transform: none !important;
        }
        .quote-library-picker-modal .quote-library-filter-note {
          display: inline-flex;
          min-height: 40px;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          color: #7b8aa0;
          font-size: 12px;
          line-height: 1.4;
          white-space: nowrap;
        }
        .quote-library-picker-modal .quote-library-filter-note b {
          color: #182230;
          font-weight: 700;
        }
        .quote-library-picker-modal .quote-library-filter-note span {
          color: #667085;
          font-weight: 600;
        }
        .quote-library-picker-modal .quote-library-table-wrap {
          scrollbar-gutter: stable;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-library-table-wrap {
          border-top: 1px solid #e8eef6;
          overflow-x: auto !important;
          overflow-y: auto !important;
        }
        .quote-library-picker-modal .quote-library-empty-state {
          min-height: 220px;
          background:
            linear-gradient(180deg, rgba(248, 251, 255, 0.92) 0%, rgba(255, 255, 255, 1) 100%);
        }
        .quote-library-picker-modal .quote-library-table thead th {
          height: 42px !important;
          border-bottom: 1px solid var(--quote-library-divider) !important;
          background: #f3f6fb !important;
          color: #34445a !important;
          line-height: 1.25 !important;
          vertical-align: middle !important;
          white-space: nowrap !important;
        }
        .quote-library-picker-modal .quote-library-table thead th:first-child {
          border-top-left-radius: 10px !important;
        }
        .quote-library-picker-modal .quote-library-table thead th:last-child {
          border-top-right-radius: 10px !important;
        }
        .quote-library-picker-modal .quote-library-table tbody td {
          height: 52px !important;
          border-bottom: 1px solid #edf2f7 !important;
          vertical-align: middle !important;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-base-library-table thead th:not(:last-child),
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-base-library-table tbody td:not(:last-child) {
          border-right: 1px solid #edf2f7 !important;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-base-library-table thead th {
          border-right-color: #e2eaf4 !important;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-base-library-table thead th:last-child,
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-base-library-table tbody td:last-child {
          border-right: 0 !important;
        }
        .quote-library-picker-modal .quote-product-picker-table tbody td {
          height: 78px !important;
        }
        .quote-library-picker-modal .quote-product-picker-image {
          width: 54px;
          height: 54px;
        }
        .quote-library-picker-modal .quote-product-picker-info {
          min-height: 60px;
        }
        .quote-library-picker-modal .quote-product-picker-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(208px, 1fr));
          gap: 16px;
          align-items: stretch !important;
          grid-auto-rows: 1fr !important;
        }
        .quote-library-picker-modal .quote-product-picker-card {
          height: 100% !important;
          min-height: 408px !important;
          border-color: #d9e2ef !important;
          border-radius: 12px !important;
          box-shadow: none !important;
        }
        .quote-library-picker-modal .quote-product-picker-card.is-selected {
          border-color: #407aff !important;
          box-shadow: 0 0 0 1px #407aff !important;
        }
        .quote-library-picker-modal .quote-product-picker-card-image {
          position: relative !important;
          flex: 0 0 auto !important;
          aspect-ratio: 1 / 1 !important;
          width: 100% !important;
          height: auto;
          min-height: 0 !important;
          max-height: 238px !important;
          overflow: hidden;
          background: #f8fafc !important;
        }
        .quote-library-picker-modal .quote-product-picker-card-image > img {
          position: absolute !important;
          inset: 0 !important;
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
          object-fit: contain !important;
          object-position: center !important;
        }
        .quote-library-picker-modal .quote-product-picker-card:hover {
          transform: translateY(-1px);
          border-color: #9fc0ff !important;
        }
        .quote-library-picker-modal .materials-price-suffix {
          margin-left: 1px;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
        }
        .quote-library-picker-modal .materials-sku-count-badge {
          display: inline-flex;
          height: 18px;
          align-items: center;
          justify-content: center;
          border: 1px solid #fecaca;
          border-radius: 999px;
          background: #fff5f5;
          padding: 0 6px;
          color: #dc2626;
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
        }
        .quote-library-picker-modal .materials-product-category-row {
          margin-bottom: 8px !important;
        }
        .quote-library-picker-modal .quote-library-row-selected td {
          background: #edf4ff !important;
        }
        .quote-library-picker-modal .quote-library-row-selected td:first-child {
          box-shadow: inset 3px 0 0 var(--quote-library-primary);
        }
        .quote-library-picker-modal .quote-library-row:not(.quote-library-row-selected):hover td {
          background: #f8fbff !important;
        }
        .quote-library-picker-modal .quote-base-library-table tbody tr td:first-child {
          background-image: linear-gradient(90deg, rgba(64, 122, 255, 0.04), rgba(64, 122, 255, 0));
        }
        .quote-library-picker-modal .quote-base-library-table .quote-library-sticky-select,
        .quote-library-picker-modal .quote-base-library-table .quote-library-sticky-category,
        .quote-library-picker-modal .quote-base-library-table .quote-library-sticky-name {
          position: static;
          background-color: var(--quote-library-sticky-bg) !important;
          background-clip: padding-box;
        }
        .quote-library-picker-modal .quote-base-library-table thead .quote-library-sticky-select,
        .quote-library-picker-modal .quote-base-library-table thead .quote-library-sticky-category,
        .quote-library-picker-modal .quote-base-library-table thead .quote-library-sticky-name {
          z-index: 13;
          background-color: #f3f6fb !important;
        }
        .quote-library-picker-modal .quote-base-library-table tbody .quote-library-sticky-select,
        .quote-library-picker-modal .quote-base-library-table tbody .quote-library-sticky-category,
        .quote-library-picker-modal .quote-base-library-table tbody .quote-library-sticky-name {
          z-index: 8;
        }
        .quote-library-picker-modal .quote-base-library-table .quote-library-sticky-select {
          left: auto;
        }
        .quote-library-picker-modal .quote-base-library-table .quote-library-sticky-category {
          left: auto;
        }
        .quote-library-picker-modal .quote-base-library-table .quote-library-sticky-name {
          left: auto;
          box-shadow: none;
        }
        .quote-library-picker-modal .quote-base-library-table .quote-library-row-selected .quote-library-sticky-select,
        .quote-library-picker-modal .quote-base-library-table .quote-library-row-selected .quote-library-sticky-category,
        .quote-library-picker-modal .quote-base-library-table .quote-library-row-selected .quote-library-sticky-name {
          background-color: #edf4ff !important;
        }
        .quote-library-picker-modal .quote-base-library-table .quote-library-row:not(.quote-library-row-selected):hover .quote-library-sticky-select,
        .quote-library-picker-modal .quote-base-library-table .quote-library-row:not(.quote-library-row-selected):hover .quote-library-sticky-category,
        .quote-library-picker-modal .quote-base-library-table .quote-library-row:not(.quote-library-row-selected):hover .quote-library-sticky-name {
          background-color: #f8fbff !important;
        }
        .quote-library-picker-modal .quote-base-library-table tbody td,
        .quote-library-picker-modal .quote-base-library-table tbody td span,
        .quote-library-picker-modal .quote-base-library-table tbody td div {
          color: #111827 !important;
          font-size: 12px !important;
          font-weight: 500 !important;
        }
        .quote-library-picker-modal .quote-base-library-table tbody td .quote-library-special-tag {
          color: #b45309 !important;
          font-size: 10px !important;
          font-weight: 700 !important;
        }
        .quote-library-picker-modal .quote-base-library-table .quote-library-description-cell {
          display: block;
          width: 520px;
          max-width: 520px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quote-library-picker-modal .quote-base-library-table tbody td.quote-library-total-price {
          color: #dc2626 !important;
          font-weight: 600 !important;
        }
        .quote-library-picker-modal .quote-library-category-badge {
          display: inline-flex;
          max-width: 100%;
          height: 22px;
          align-items: center;
          border: 1px solid #e5ebf3;
          border-radius: 7px;
          background: #f8fafc;
          padding: 0 7px;
          color: #52647b;
          font-size: 11px;
          font-weight: 600;
          line-height: 1;
        }
        .quote-library-picker-modal .quote-library-item-title {
          display: block;
          min-height: 0;
        }
        .quote-library-picker-modal .quote-library-row input[type="checkbox"] {
          border-radius: 4px !important;
        }
        .quote-library-picker-modal .quote-library-special-tag {
          border-radius: 999px !important;
        }
        .quote-library-picker-modal .quote-library-footer-summary {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
        }
        .quote-library-picker-modal .quote-library-footer-summary span {
          display: inline-flex;
          min-height: 20px;
          align-items: center;
          color: #667085;
          font-weight: 600;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-library-footer {
          background: #fbfcff !important;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-library-footer-summary span + span {
          position: relative;
          padding-left: 12px;
        }
        .quote-library-picker-modal.quote-base-library-picker-modal .quote-library-footer-summary span + span::before {
          content: "";
          position: absolute;
          left: 0;
          top: 50%;
          width: 1px;
          height: 12px;
          transform: translateY(-50%);
          background: #d8e1ee;
        }
        .quote-library-picker-modal .quote-library-footer-summary b {
          color: #407aff;
          font-weight: 800;
        }
        .quotation-detail-ui .quote-section-empty {
          min-height: 0 !important;
        }
        .quotation-detail-ui .quote-section-empty .thin-scroll-area {
          min-height: 230px !important;
          flex: 0 0 auto !important;
          background: #ffffff !important;
        }
        .quotation-detail-ui .quote-empty-row td,
        .quotation-detail-ui .quote-empty-cell {
          height: 230px !important;
          min-height: 230px !important;
          background: linear-gradient(180deg, #fbfdff 0%, #f7faff 100%) !important;
          vertical-align: middle !important;
        }
        .quotation-detail-ui .quote-empty-state {
          margin: 16px auto !important;
          max-width: 420px;
          border: 1px dashed #cfe0ff;
          border-radius: 12px !important;
          background: rgba(255, 255, 255, 0.78);
          padding: 18px 20px;
        }
        .quotation-detail-ui .quote-section-empty tbody tr:last-child td {
          background: #fbfcff !important;
          color: #7c8aa0 !important;
        }
        .quotation-detail-ui .quote-section-empty tbody tr:last-child .text-red-600 {
          color: #dc2626 !important;
        }
        .quotation-detail-ui .quote-section-empty .quote-section-footer {
          border-top-color: #e8eef6 !important;
          background: #ffffff !important;
          padding: 12px !important;
        }
        .quotation-detail-ui .quote-section-empty .quote-add-row {
          min-height: 42px !important;
          border-style: solid !important;
          background: #f7faff !important;
        }
        .quotation-detail-ui .quote-section-empty .quote-add-row:hover {
          background: #edf4ff !important;
        }
        .quotation-detail-ui.quote-workbench-shell {
          --quote-panel-radius: 12px;
          --quote-control-radius: 10px;
          --quote-chip-radius: 10px;
          --quote-sticky-mask: #f4f7fb;
          display: flex !important;
          width: auto !important;
          height: calc(100% + 40px) !important;
          min-height: calc(100% + 40px) !important;
          flex-direction: column !important;
          overflow: hidden !important;
          margin: -20px 0 !important;
          padding: 20px 0 !important;
        }
        @media (min-width: 1024px) {
          .quotation-detail-ui.quote-workbench-shell {
            height: calc(100% + 56px) !important;
            min-height: calc(100% + 56px) !important;
            margin: -28px 0 !important;
            padding: 24px 0 !important;
          }
        }
        .quotation-detail-ui.quote-workbench-shell > .quote-command-bar,
        .quotation-detail-ui.quote-workbench-shell .screen-quote-sections > .quote-space-navigation,
        .quotation-detail-ui.quote-workbench-shell .screen-quote-sections > .quote-section,
        .quotation-detail-ui.quote-workbench-shell .quote-expand-panel {
          border-radius: var(--quote-panel-radius) !important;
          overflow: hidden;
        }
        .quotation-detail-ui.quote-workbench-shell > .quote-command-bar {
          border: 1px solid #d9e2ef !important;
          background: #ffffff !important;
          box-shadow: 0 -24px 0 var(--quote-sticky-mask), 0 1px 2px rgba(16, 24, 40, 0.035) !important;
        }
        .quotation-detail-ui.quote-workbench-shell > .screen-quote-sections {
          display: flex !important;
          min-height: 0 !important;
          flex: 1 1 auto !important;
          flex-direction: column !important;
          overflow: hidden !important;
        }
        .quotation-detail-ui.quote-workbench-shell .screen-quote-sections > .quote-space-navigation {
          flex: 0 0 auto !important;
          border: 1px solid #d9e2ef !important;
          background: #ffffff !important;
          padding: 12px !important;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.035) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-toolbar-button,
        .quotation-detail-ui.quote-workbench-shell .quote-primary-action,
        .quotation-detail-ui.quote-workbench-shell .quote-title-field,
        .quotation-detail-ui.quote-workbench-shell .quote-save-status,
        .quotation-detail-ui.quote-workbench-shell .quote-total-summary,
        .quotation-detail-ui.quote-workbench-shell .quote-expand-trigger,
        .quotation-detail-ui.quote-workbench-shell .quote-nav-arrow,
        .quotation-detail-ui.quote-workbench-shell .quote-space-tab,
        .quotation-detail-ui.quote-workbench-shell .quote-add-space,
        .quotation-detail-ui.quote-workbench-shell .quote-project-info-edit,
        .quotation-detail-ui.quote-workbench-shell .quote-discount-action,
        .quotation-detail-ui.quote-workbench-shell .quote-comprehensive-fee,
        .quotation-detail-ui.quote-workbench-shell .quote-category-create,
        .quotation-detail-ui.quote-workbench-shell .quote-manual-add,
        .quotation-detail-ui.quote-workbench-shell .quote-add-row,
        .quotation-detail-ui.quote-workbench-shell .quote-cell-select {
          border-radius: var(--quote-control-radius) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-category-navigation {
          margin-top: 12px !important;
          padding: 12px 0 0 !important;
          border-top: 1px solid #e8eef6 !important;
          overflow: visible !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-category-navigation .quote-category-tabs {
          gap: 8px !important;
          overflow-x: auto !important;
          overflow-y: visible !important;
          padding: 2px 2px 2px 8px !important;
          scroll-padding-left: 8px;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-category-navigation .quote-category-tab {
          min-height: 34px !important;
          min-width: 96px !important;
          border-radius: var(--quote-chip-radius) !important;
          flex: 0 0 auto !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-category-navigation .quote-category-tab:first-child {
          margin-left: 0 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-category-navigation .quote-category-tab-active,
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-category-navigation .quote-category-tab-active:hover {
          border-color: #bdd2ff !important;
          background: #edf4ff !important;
          color: #407AFF !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section thead th {
          height: 28px !important;
          min-height: 28px !important;
          padding-top: 4px !important;
          padding-bottom: 4px !important;
          color: #182230 !important;
          line-height: 1.25 !important;
          vertical-align: middle !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section thead tr:first-child th {
          height: 30px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section thead tr:nth-child(2) th {
          height: 26px !important;
          font-size: 11px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section thead th[rowspan="2"],
        .quotation-detail-ui.quote-workbench-shell .quote-section thead th[rowSpan="2"] {
          height: 56px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section .thin-scroll-area {
          min-height: 0 !important;
          flex: 0 0 auto !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-non-base,
        .quotation-detail-ui.quote-workbench-shell .quote-section-non-base.quote-section-empty {
          min-height: 0 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-other-fees,
        .quotation-detail-ui.quote-workbench-shell .quote-section-other-fees.quote-section-empty {
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          flex: 1 1 auto !important;
          overflow: hidden !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-non-base .quote-table-shell {
          display: flex;
          min-height: 0;
          flex: 1 1 auto;
          flex-direction: column;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-non-base .quote-table-shell > .thin-scroll-area,
        .quotation-detail-ui.quote-workbench-shell .quote-section-non-base.quote-section-empty .quote-table-shell > .thin-scroll-area {
          min-height: 0 !important;
          flex: 1 1 auto !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-other-fees .quote-table-shell > .thin-scroll-area {
          overflow-y: hidden !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-footer {
          border-top: 0 !important;
          padding-top: 8px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-add-row {
          min-height: 40px !important;
          border-color: #407AFF !important;
          background: #407AFF !important;
          color: #ffffff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-add-row svg {
          color: #ffffff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-add-row:hover {
          border-color: #2f66e8 !important;
          background: #2f66e8 !important;
          color: #ffffff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section tbody tr:last-child td {
          height: 38px !important;
          padding-top: 6px !important;
          padding-bottom: 6px !important;
          background: #fbfcff !important;
          font-size: 13px !important;
          line-height: 1.3 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section tbody tr:last-child td:first-child {
          color: #34445a !important;
          font-weight: 700 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-manual-add,
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-find-replace-button,
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-search-field {
          height: 40px !important;
          min-height: 40px !important;
          box-sizing: border-box !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-section-category-tabs {
          min-height: 40px !important;
          height: 40px !important;
          padding: 2px !important;
          box-sizing: border-box !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-section-category-tab,
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-section-category-create {
          height: 34px !important;
          min-height: 34px !important;
          box-sizing: border-box !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-manual-add,
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-find-replace-button {
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          align-items: center !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-manual-add {
          gap: 8px !important;
          border-color: #9ad6b7 !important;
          background: linear-gradient(180deg, #ffffff 0%, #f1fbf6 100%) !important;
          color: #137a58 !important;
          font-size: 12px !important;
          font-weight: 850 !important;
          padding-left: 12px !important;
          padding-right: 15px !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88), 0 7px 16px rgba(21, 152, 99, 0.11) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-manual-add:hover {
          border-color: #5fc891 !important;
          background: linear-gradient(180deg, #ffffff 0%, #e6f8ee 100%) !important;
          color: #0f6d4d !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 9px 20px rgba(21, 152, 99, 0.16) !important;
          transform: translateY(-1px);
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-manual-add-icon {
          display: inline-flex;
          height: 22px;
          width: 22px;
          align-items: center;
          justify-content: center;
          border-radius: 7px;
          background: #159863;
          color: #ffffff;
          box-shadow: 0 5px 12px rgba(21, 152, 99, 0.24);
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-manual-add:hover .quote-manual-add-icon {
          background: #0f8155;
          box-shadow: 0 6px 14px rgba(21, 152, 99, 0.28);
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-search-field {
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          line-height: 40px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-find-replace-button {
          gap: 7px !important;
          border-color: #cfdae8 !important;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%) !important;
          color: #43566f !important;
          font-size: 12px !important;
          font-weight: 800 !important;
          padding-left: 13px !important;
          padding-right: 14px !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 6px 14px rgba(32, 55, 85, 0.07) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-find-replace-button svg {
          color: #407aff !important;
          filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.75));
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-find-replace-button:hover {
          border-color: #9fb7dc !important;
          background: linear-gradient(180deg, #ffffff 0%, #eef5ff 100%) !important;
          color: #1f3350 !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 18px rgba(64, 122, 255, 0.13) !important;
          transform: translateY(-1px);
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-toolbar-search {
          min-width: 260px;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-toolbar-search-icon {
          color: #7f90a6;
          transition: color 0.16s ease;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-toolbar-search:focus-within .quote-toolbar-search-icon {
          color: #407aff;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-search-field {
          border-color: #cfdae8 !important;
          background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%) !important;
          color: #223249 !important;
          font-size: 12px !important;
          font-weight: 700 !important;
          padding-left: 38px !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86), 0 6px 14px rgba(32, 55, 85, 0.06) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-search-field::placeholder {
          color: #9aa8b8 !important;
          font-weight: 650 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-search-field:focus {
          border-color: #9fb7dc !important;
          background: #ffffff !important;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.10), 0 8px 18px rgba(64, 122, 255, 0.10) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-section-fullscreen-toggle {
          height: 40px !important;
          width: 40px !important;
          border-color: #cfdae8 !important;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%) !important;
          color: #52647b !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 6px 14px rgba(32, 55, 85, 0.07) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header .quote-section-fullscreen-toggle:hover {
          border-color: #9fb7dc !important;
          background: linear-gradient(180deg, #ffffff 0%, #eef5ff 100%) !important;
          color: #407aff !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 18px rgba(64, 122, 255, 0.13) !important;
          transform: translateY(-1px);
        }
        .quote-library-picker-modal .quote-library-filter-row .quote-library-search-input,
        .quote-library-picker-modal .quote-library-filter-row .quote-library-category-select,
        .quote-library-picker-modal .quote-library-filter-row .quote-library-select-all {
          min-height: 40px !important;
          height: 40px !important;
          line-height: 40px !important;
          border: 1px solid var(--quote-library-border) !important;
          background: #ffffff !important;
          box-shadow: none !important;
        }
        .quote-library-picker-modal .quote-library-filter-row .quote-library-search-input {
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }
        .quote-library-picker-modal .quote-library-filter-row .quote-library-category-select {
          padding-left: 12px !important;
          padding-right: 12px !important;
        }
        .quote-library-picker-modal .quote-library-filter-row .quote-library-select-all {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          border-color: #cfe0ff !important;
        }
        .quote-library-picker-modal .quote-library-filter-row .quote-library-category-select > div {
          height: 100% !important;
          align-items: center !important;
        }
        .quote-library-picker-modal .quote-library-filter-row .quote-library-category-select:focus,
        .quote-library-picker-modal .quote-library-filter-row .quote-library-category-select:focus-within {
          border-color: #407AFF !important;
          box-shadow: 0 0 0 2px rgba(64, 122, 255, 0.1) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation {
          padding: 8px 10px 7px !important;
          border: 0 !important;
          border-radius: 0 !important;
          border-color: transparent !important;
          background: transparent !important;
          box-shadow: none !important;
          overflow: visible !important;
        }
        .quotation-detail-ui.quote-workbench-shell .screen-quote-sections > section.quote-compact-navigation {
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-record-breadcrumb {
          display: flex !important;
          min-height: 34px !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 16px !important;
          margin: 0 0 8px !important;
          color: #98a2b3 !important;
          font-size: 12px !important;
          line-height: 1 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-record-breadcrumb-path {
          display: inline-flex !important;
          min-width: 0 !important;
          align-items: center !important;
          gap: 7px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-record-breadcrumb-path button {
          display: inline-flex !important;
          height: 24px !important;
          align-items: center !important;
          gap: 4px !important;
          border: 0 !important;
          border-radius: 7px !important;
          background: transparent !important;
          padding: 0 7px 0 3px !important;
          color: #667085 !important;
          font-size: 12px !important;
          font-weight: 650 !important;
          line-height: 1 !important;
          transition: background-color 160ms ease, color 160ms ease !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-record-breadcrumb-path button svg {
          color: #8a97aa !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-record-breadcrumb-path button:hover {
          background: #edf4ff !important;
          color: #2f6feb !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-record-breadcrumb-path button:hover svg {
          color: #2f6feb !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-record-breadcrumb-path > svg {
          color: #c1cad8 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-record-breadcrumb-path strong {
          min-width: 0 !important;
          max-width: 260px !important;
          overflow: hidden !important;
          color: #475467 !important;
          font-size: 12px !important;
          font-weight: 650 !important;
          line-height: 1 !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation-row {
          min-height: 32px !important;
          gap: 8px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation-row {
          padding-bottom: 6px !important;
          border-bottom: 1px solid #e8eef6 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-nav-arrow,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-add-space,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-project-info-edit,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-comprehensive-fee,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-create,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-name-input {
          height: 32px !important;
          min-height: 32px !important;
          border-radius: 8px !important;
          font-size: 12px !important;
          line-height: 1 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-nav-arrow {
          width: 32px !important;
          padding: 0 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tabs {
          gap: 6px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-add-space,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-project-info-edit,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-comprehensive-fee {
          padding: 0 10px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-compact-category-navigation {
          margin: 6px 0 0 !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 8px !important;
          background: transparent !important;
          box-shadow: none !important;
          overflow: visible !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tabs {
          height: auto !important;
          min-height: 42px !important;
          gap: 4px !important;
          padding: 3px 2px !important;
          background: #f3f6fb !important;
          border-radius: 8px !important;
          align-items: center !important;
          overflow-x: auto !important;
          overflow-y: visible !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab {
          height: 36px !important;
          min-height: 36px !important;
          min-width: 92px !important;
          width: auto !important;
          padding: 0 9px !important;
          flex: 0 0 auto !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-create {
          height: 36px !important;
          min-height: 36px !important;
          min-width: 88px !important;
          padding: 0 9px !important;
          flex: 0 0 auto !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-delete {
          height: 20px !important;
          width: 20px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-project-info-edit {
          margin-left: auto !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation {
          padding: 6px 0 4px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation-row {
          min-height: 34px !important;
          padding: 0 0 8px !important;
          border-bottom: 1px solid #dfe8f5 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-nav-arrow,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-add-space,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-project-info-edit,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-comprehensive-fee,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-name-input {
          height: 34px !important;
          min-height: 34px !important;
          border-radius: 9px !important;
          font-size: 13px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-nav-arrow {
          width: 34px !important;
          background: #ffffff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab {
          padding: 0 13px !important;
          border-color: #d9e6f8 !important;
          background: #ffffff !important;
          color: #667085 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab-active,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab-active:hover {
          border-color: #407aff !important;
          background: #407aff !important;
          color: #ffffff !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-add-space {
          border-color: #bdd2ff !important;
          background: #ffffff !important;
          color: #407aff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-project-info-edit {
          border-color: #cfe0ff !important;
          background: #f7fbff !important;
          color: #2f66e8 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-project-info-edit:hover {
          border-color: #9fc0ff !important;
          background: #edf4ff !important;
          color: #1d4ed8 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-comprehensive-fee {
          border-color: #fdba74 !important;
          background: #fff7ed !important;
          color: #c2410c !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-comprehensive-fee:hover {
          border-color: #f97316 !important;
          background: #ffedd5 !important;
          color: #9a3412 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-compact-category-navigation {
          position: relative;
          margin: 7px 0 0 44px !important;
          padding-left: 10px !important;
          border-left: 2px solid #cfe0ff !important;
          border-radius: 0 !important;
          overflow: visible !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-compact-category-navigation::before {
          content: "";
          position: absolute;
          left: -2px;
          top: -7px;
          height: 7px;
          border-left: 2px solid #cfe0ff;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tabs {
          min-height: 32px !important;
          padding: 2px !important;
          gap: 3px !important;
          border: 1px solid #e3ebf7 !important;
          border-radius: 9px !important;
          background: rgba(244, 248, 253, 0.88) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-create {
          height: 28px !important;
          min-height: 28px !important;
          border-radius: 7px !important;
          font-size: 12px !important;
          background: transparent !important;
          border-color: transparent !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab {
          min-width: 76px !important;
          padding: 0 9px !important;
          color: #667085 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab:hover {
          background: #ffffff !important;
          color: #407aff !important;
          border-color: #d7e4f7 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab-active,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab-active:hover {
          border-color: #bdd2ff !important;
          background: #edf4ff !important;
          color: #407aff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-create {
          min-width: 88px !important;
          color: #407aff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-create:hover {
          border-color: #bdd2ff !important;
          background: #ffffff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-delete {
          opacity: 0;
          color: #98a2b3 !important;
          transition: opacity 160ms ease, color 160ms ease, background-color 160ms ease;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab:hover .quote-category-delete {
          opacity: 1;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation {
          padding: 4px 0 2px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation-row {
          min-height: 34px !important;
          padding: 0 !important;
          border-bottom: 0 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation-single-row .quote-space-navigation-row {
          padding-bottom: 8px !important;
          border-bottom: 1px solid #e8eef6 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .screen-quote-sections > section.quote-compact-navigation-single-row {
          padding-bottom: 8px !important;
          border-bottom: 1px solid #e8eef6 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-nav-arrow,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-add-space,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-project-info-edit,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-comprehensive-fee,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-name-input {
          height: 32px !important;
          min-height: 32px !important;
          border-radius: 9px !important;
          font-size: 13px !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab {
          padding: 0 12px !important;
          border-color: #d9e6f8 !important;
          background: #ffffff !important;
          color: #667085 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-name-input {
          max-width: none !important;
          min-width: 112px !important;
          padding-left: 12px !important;
          padding-right: 12px !important;
          overflow: visible !important;
          text-overflow: clip !important;
          white-space: nowrap !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab-active,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab-active:hover {
          border-color: #407aff !important;
          background: #407aff !important;
          color: #ffffff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-comprehensive-fee-active,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-comprehensive-fee-active:hover {
          border-color: #ea580c !important;
          background: #f97316 !important;
          color: #ffffff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-comprehensive-fee-active .quote-comprehensive-fee-amount {
          color: #ffffff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-compact-category-navigation {
          position: relative !important;
          margin: 8px 0 0 42px !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          overflow: visible !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-compact-category-navigation::before {
          content: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tabs {
          min-height: 30px !important;
          height: auto !important;
          gap: 14px !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          align-items: center !important;
          overflow-x: auto !important;
          overflow-y: visible !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-create {
          position: relative !important;
          justify-content: center !important;
          height: 30px !important;
          min-height: 30px !important;
          min-width: 0 !important;
          width: 108px !important;
          padding: 0 24px !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          color: #667085 !important;
          box-shadow: none !important;
          font-size: 13px !important;
          text-align: center !important;
          white-space: nowrap !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-label {
          display: block !important;
          width: 100% !important;
          text-align: center !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab::after,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-create::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 2px;
          border-radius: 999px;
          background: transparent;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab:hover,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-create:hover {
          border: 0 !important;
          background: transparent !important;
          color: #407aff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab-active,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab-active:hover {
          border: 0 !important;
          background: transparent !important;
          color: #407aff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab-active::after {
          background: #407aff;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-create {
          width: auto !important;
          min-width: 104px !important;
          padding: 0 10px !important;
          color: #407aff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-compact-category-navigation .quote-category-tabs,
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-compact-category-navigation .quote-category-tab,
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-compact-category-navigation .quote-category-tab:hover,
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-compact-category-navigation .quote-category-tab-active,
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-compact-category-navigation .quote-category-tab-active:hover,
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-compact-category-navigation .quote-category-create,
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation > .quote-compact-category-navigation .quote-category-create:hover {
          background: transparent !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-delete {
          position: absolute !important;
          right: 0 !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          opacity: 0;
          background: transparent !important;
          color: #98a2b3 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-category-tab:hover .quote-category-delete {
          opacity: 1;
          color: #ef4444 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation {
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation-row {
          margin-left: 0 !important;
          padding-left: 0 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-compact-category-navigation {
          margin-left: 0 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .screen-quote-sections > section.quote-compact-navigation {
          position: sticky !important;
          top: 0 !important;
          z-index: 80 !important;
          margin-left: 0 !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          width: 100% !important;
          background: var(--quote-sticky-mask) !important;
          box-shadow: 0 -24px 0 var(--quote-sticky-mask), 0 8px 0 var(--quote-sticky-mask) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-space-navigation-row {
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: 8px !important;
          width: 100% !important;
          min-width: 0 !important;
          min-height: 38px !important;
          padding-top: 2px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-hidden-space-count {
          display: inline-flex !important;
          height: 34px !important;
          min-width: 40px !important;
          align-items: center !important;
          justify-content: center !important;
          border: 1px solid #dbe7f8 !important;
          border-radius: 9px !important;
          background: #ffffff !important;
          color: #e5484d !important;
          font-family: inherit !important;
          font-size: 13px !important;
          font-weight: 700 !important;
          line-height: 1 !important;
          letter-spacing: 0 !important;
          padding: 0 10px !important;
          box-shadow: none !important;
          white-space: nowrap !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tabs {
          width: auto !important;
          max-width: none !important;
          min-width: 0 !important;
          flex: 0 1 auto !important;
          padding-top: 2px !important;
          padding-bottom: 1px !important;
          margin-top: -2px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-nav-arrow {
          border-color: #cfdbea !important;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%) !important;
          color: #52647b !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-nav-arrow:hover {
          border-color: #9fb7dc !important;
          background: linear-gradient(180deg, #ffffff 0%, #eef5ff 100%) !important;
          color: #407aff !important;
          box-shadow: none !important;
          transform: translateY(-1px) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab {
          position: relative !important;
          z-index: 1 !important;
          gap: 7px !important;
          min-width: 76px !important;
          border-color: #d6e2f0 !important;
          background: linear-gradient(180deg, #ffffff 0%, #f9fbfe 100%) !important;
          color: #52647b !important;
          font-weight: 780 !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab:hover {
          border-color: #b9cce5 !important;
          background: linear-gradient(180deg, #ffffff 0%, #f1f6fd 100%) !important;
          color: #223249 !important;
          box-shadow: none !important;
          transform: translateY(-1px) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab-icon,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-add-space-icon {
          display: inline-flex;
          height: 20px;
          width: 20px;
          flex: 0 0 20px;
          align-items: center;
          justify-content: center;
          border-radius: 7px;
          background: #eef4f8;
          color: #667085;
          transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab-active,
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab-active:hover {
          border-color: #407aff !important;
          background: linear-gradient(180deg, #4f86ff 0%, #3572f4 100%) !important;
          color: #ffffff !important;
          box-shadow: none !important;
          transform: translateY(-1px) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-space-tab-active .quote-space-tab-icon {
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
          box-shadow: none;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-add-space {
          gap: 8px !important;
          border-color: #a9c2ff !important;
          background: linear-gradient(180deg, #ffffff 0%, #f4f8ff 100%) !important;
          color: #2f66e8 !important;
          font-weight: 820 !important;
          padding-left: 10px !important;
          padding-right: 14px !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-add-space-icon {
          background: #edf4ff;
          color: #407aff;
          box-shadow: none;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-add-space:hover {
          border-color: #7fa2ff !important;
          background: linear-gradient(180deg, #ffffff 0%, #eaf2ff 100%) !important;
          color: #2458d8 !important;
          box-shadow: none !important;
          transform: translateY(-1px) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation .quote-add-space:hover .quote-add-space-icon {
          background: #407aff;
          color: #ffffff;
          box-shadow: none;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions {
          display: flex !important;
          min-width: max-content !important;
          max-width: max-content !important;
          align-items: center !important;
          gap: 8px !important;
          justify-self: end !important;
          overflow: visible !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-project-info-edit {
          margin-left: 0 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-project-info-edit,
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-discount-action,
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-comprehensive-fee {
          height: 34px !important;
          min-height: 34px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          align-items: center !important;
          font-size: 13px !important;
          line-height: 1 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-discount-action-amount,
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-comprehensive-fee-amount {
          font-size: 13px !important;
          line-height: 1 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions {
          gap: 4px !important;
          border: 1px solid #d9e2ee !important;
          border-radius: 16px !important;
          background: #f3f6fa !important;
          padding: 4px !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-project-info-edit,
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-discount-action,
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-comprehensive-fee {
          height: 42px !important;
          min-height: 42px !important;
          border: 1px solid transparent !important;
          border-radius: 13px !important;
          background: transparent !important;
          padding: 0 18px !important;
          color: #4f5f75 !important;
          font-size: 13px !important;
          font-weight: 700 !important;
          letter-spacing: 0 !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-project-info-edit:hover,
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-discount-action:hover,
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-comprehensive-fee:hover {
          border-color: #00875a !important;
          background: #00875a !important;
          color: #ffffff !important;
          box-shadow: 0 6px 14px rgba(0, 135, 90, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.18) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-discount-action-active,
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-discount-action-active:hover,
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-comprehensive-fee-active,
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-comprehensive-fee-active:hover {
          border-color: #00875a !important;
          background: #00875a !important;
          color: #ffffff !important;
          box-shadow: 0 6px 14px rgba(0, 135, 90, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.18) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-discount-action-amount,
        .quotation-detail-ui.quote-workbench-shell .quote-navigation-actions .quote-comprehensive-fee-amount {
          color: inherit !important;
          font-size: 13px !important;
          font-weight: 700 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .screen-quote-sections > section.quote-compact-navigation-single-row {
          position: sticky !important;
          padding-bottom: 0 !important;
          border-bottom: 0 !important;
          box-shadow: 0 -24px 0 var(--quote-sticky-mask) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .screen-quote-sections > section.quote-compact-navigation-single-row::after {
          content: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-compact-navigation-single-row .quote-space-navigation-row {
          padding-bottom: 0 !important;
          border-bottom: 0 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section {
          display: flex !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          flex: 1 1 auto !important;
          flex-direction: column !important;
          position: relative !important;
          overflow: hidden !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section.quote-section-fullscreen {
          position: fixed !important;
          inset: 0 !important;
          z-index: 9996 !important;
          height: 100dvh !important;
          width: 100vw !important;
          min-height: 0 !important;
          max-height: none !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section.quote-section-fullscreen:fullscreen {
          width: 100vw !important;
          height: 100vh !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: #ffffff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section.quote-section-fullscreen::before {
          content: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section.quote-section-fullscreen .quote-section-header {
          min-height: 58px !important;
          padding-top: 10px !important;
          padding-bottom: 10px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section.quote-section-fullscreen .quote-table-shell {
          min-height: 0 !important;
          flex: 1 1 auto !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section.quote-section-fullscreen .quote-table-shell > .thin-scroll-area.quote-table-freeze-scroll {
          height: 100% !important;
          max-height: none !important;
          flex: 1 1 auto !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section.quote-section-fullscreen .quote-section-footer {
          padding-top: 8px !important;
          padding-bottom: 8px !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-fullscreen-toggle {
          box-shadow: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-header {
          flex: 0 0 auto !important;
          position: relative !important;
          z-index: 20 !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-table-shell {
          display: flex !important;
          min-height: 0 !important;
          flex: 0 1 auto !important;
          flex-direction: column !important;
          overflow: hidden !important;
          background: #ffffff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-table-shell > .thin-scroll-area.quote-table-freeze-scroll {
          min-height: 0 !important;
          max-height: calc(100vh - var(--quote-command-height) - 245px) !important;
          flex: 0 1 auto !important;
          overflow: auto !important;
          overscroll-behavior: contain !important;
          background: #ffffff !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-table-freeze-scroll thead {
          position: sticky !important;
          top: 0 !important;
          z-index: 30 !important;
          background: #f7f9fd !important;
          box-shadow: 0 1px 0 var(--quote-line) !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-footer {
          flex: 0 0 auto !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-empty {
          max-height: none !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-empty .quote-table-shell {
          flex: 0 0 auto !important;
        }
        .quotation-detail-ui.quote-workbench-shell .quote-section-empty .quote-table-shell > .thin-scroll-area.quote-table-freeze-scroll {
          flex: 0 0 auto !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
        }
        .quotation-detail-ui .quote-project-info-modal {
          max-height: min(90vh, 720px);
          display: flex;
          flex-direction: column;
        }
        .quote-project-info-map-layer > .fixed {
          z-index: 11001 !important;
        }
        .quotation-detail-ui .quote-project-info-body {
          min-height: 0;
          overflow-y: auto;
          padding: 18px 20px 20px;
          background: #f8fafc;
        }
        .quotation-detail-ui .quote-project-info-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 16px;
          border-radius: 12px;
          border: 1px solid #dde6f2;
          background: #ffffff;
          padding: 16px;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.035);
        }
        .quotation-detail-ui .quote-project-info-span-2 {
          grid-column: 1 / -1;
        }
        .quotation-detail-ui .quote-project-info-check {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 650;
          color: #667085;
          cursor: pointer;
          user-select: none;
        }
        .quotation-detail-ui .quote-project-info-check input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .quotation-detail-ui .quote-project-info-check i {
          display: inline-flex;
          height: 18px;
          width: 18px;
          align-items: center;
          justify-content: center;
          border-radius: 5px;
          border: 1px solid #aebbd0;
          background: #ffffff;
          color: #ffffff;
        }
        .quotation-detail-ui .quote-project-info-check input:checked + i {
          border-color: #407aff;
          background: #407aff;
        }
        .quotation-detail-ui .quote-project-info-address {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 6px;
        }
        .quotation-detail-ui .quote-project-info-address > span {
          display: block;
          font-size: 12px;
          font-weight: 650;
          color: #34445a;
        }
        .quotation-detail-ui .quote-project-info-address > span em {
          font-style: normal;
          color: #ef4444;
        }
        .quotation-detail-ui .quote-project-info-address > div {
          display: flex;
          overflow: hidden;
          border-radius: 10px;
          border: 1px solid #cfd9e8;
          background: #ffffff;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .quotation-detail-ui .quote-project-info-address > div:focus-within {
          border-color: #9fc0ff;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.12);
        }
        .quotation-detail-ui .quote-project-info-address input {
          min-width: 0;
          flex: 1 1 auto;
          border: 0;
          background: transparent;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 650;
          color: #172033;
          outline: none;
        }
        .quotation-detail-ui .quote-project-info-address button {
          display: inline-flex;
          min-height: 34px;
          flex: 0 0 auto;
          align-items: center;
          gap: 6px;
          border-left: 1px solid #e5ebf3;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 700;
          color: #166534;
          transition: background-color 160ms ease;
        }
        .quotation-detail-ui .quote-project-info-address button:hover {
          background: #f0fdf4;
        }
        .quotation-detail-ui .quote-project-info-location-status {
          margin: -4px 0 0;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border-radius: 999px;
          background: #ecfdf3;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 700;
          color: #166534;
        }
        .quotation-detail-ui .quote-project-info-full {
          margin-bottom: 8px;
        }
        .quotation-detail-ui .quote-project-info-room-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }
        .quotation-detail-ui .quote-project-info-field {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 7px;
        }
        .quotation-detail-ui .quote-project-info-field span {
          font-size: 12px;
          font-weight: 650;
          line-height: 1.2;
          color: #34445a;
        }
        .quotation-detail-ui .quote-project-info-field input,
        .quotation-detail-ui .quote-project-info-field textarea {
          min-width: 0;
          border-radius: 10px;
          border: 1px solid #cfd9e8;
          background: #ffffff;
          font-size: 12px;
          font-weight: 600;
          color: #172033;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
        }
        .quotation-detail-ui .quote-project-info-field input {
          height: 40px;
          padding: 0 12px;
        }
        .quotation-detail-ui .quote-project-info-field textarea {
          min-height: 72px;
          resize: vertical;
          padding: 10px 12px;
          line-height: 1.5;
        }
        .quotation-detail-ui .quote-project-info-field input:disabled {
          color: #98a2b3;
          cursor: not-allowed;
          background: #f1f5f9;
        }
        .quotation-detail-ui .quote-project-info-field:has(input:disabled) {
          color: #98a2b3;
        }
        .quotation-detail-ui .quote-project-info-field input::placeholder,
        .quotation-detail-ui .quote-project-info-field textarea::placeholder {
          color: #a8b4c4;
        }
        .quotation-detail-ui .quote-project-info-field input:focus,
        .quotation-detail-ui .quote-project-info-field textarea:focus {
          border-color: #9fc0ff;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.12);
        }
        .quotation-detail-ui .quote-project-info-area {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 6px;
          height: 40px;
          border-radius: 10px;
          border: 1px solid #cfd9e8;
          background: #ffffff;
          padding: 0 10px 0 12px;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .quotation-detail-ui .quote-project-info-area input {
          flex: 1 1 auto;
          height: auto;
          border: 0;
          border-radius: 0;
          background: transparent;
          padding: 0;
          box-shadow: none;
        }
        .quotation-detail-ui .quote-project-info-area:focus-within {
          border-color: #9fc0ff;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.12);
        }
        .quotation-detail-ui .quote-project-info-area em {
          flex: 0 0 auto;
          font-style: normal;
          font-size: 12px;
          font-weight: 650;
          color: #6f7f96;
        }
	        @media (max-width: 720px) {
	          .quotation-detail-ui .quote-discount-type-grid {
	            grid-template-columns: 1fr;
	          }
	          .quotation-detail-ui .quote-discount-scope-grid {
	            display: grid;
	            grid-template-columns: repeat(2, minmax(0, 1fr));
	            overflow-x: hidden;
	            overflow-y: auto;
	            max-height: 184px;
	          }
	          .quotation-detail-ui .quote-discount-rule-grid {
	            grid-template-columns: 1fr;
	          }
	          .quotation-detail-ui .quote-discount-scope-card {
	            min-width: 0;
	            flex: initial;
	          }
          .quotation-detail-ui .quote-project-info-body,
          .quotation-detail-ui .quote-project-info-form-grid,
          .quotation-detail-ui .quote-project-info-room-row {
            grid-template-columns: 1fr;
          }
          .quotation-detail-ui .quote-project-info-address > div {
            flex-direction: column;
          }
          .quotation-detail-ui .quote-project-info-address button {
            justify-content: center;
            border-left: 0;
            border-top: 1px solid #e5ebf3;
          }
        }
        .quotation-detail-ui.quote-workbench-shell .quote-no-category-state,
        .quotation-detail-ui.quote-workbench-shell .quote-no-category-state.quote-section-empty {
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          flex: 1 1 auto !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          overflow: hidden !important;
        }
        .print-quote-document { display: none; }
        @media print {
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body > div,
          body > div > div,
          body > div > div > div,
          main {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }
          aside, header, .no-print { display: none !important; }
          .screen-quote-sections { display: none !important; }
          .print-quotation, .screen-quote-footer { display: none !important; }
          .print-quote-document {
            display: block !important;
            width: 100% !important;
          }
          main {
            display: block !important;
            padding: 0 !important;
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}

function RowContextMenu({
  x,
  y,
  item,
  onInsertBefore,
  onInsertAfter,
  onCopy,
  onCopyToSpace,
  onSetAttribution,
  onSaveToCustomLibrary,
  onClear,
  onColor,
  onRemove,
}: {
  x: number;
  y: number;
  item?: QuotationItem;
  onInsertBefore: () => void;
  onInsertAfter: () => void;
  onCopy: () => void;
  onCopyToSpace: (event: MouseEvent<HTMLButtonElement>) => void;
  onSetAttribution: () => void;
  onSaveToCustomLibrary: () => void;
  onClear: () => void;
  onColor: (value: string) => void;
  onRemove: () => void;
}) {
  if (!item) return null;
  const activeColor = getQuotationRowColor(item.row_color);
  const special = isSpecialQuoteItem(item);
  const canCopyToSpace = !isOtherCategory(item.category);
  const canSetAttribution = !isOtherCategory(item.category);
  const canSaveToCustomLibrary = canSetAttribution && !isStandardQuotaSourceItem(item);

  return (
    <div
      className="quote-floating-menu fixed z-[9997] w-72 rounded-lg border border-surface-200 bg-white p-1 shadow-[0_18px_38px_rgba(31,41,53,0.16)]"
      style={{ left: Math.max(8, Math.min(x, window.innerWidth - 304)), top: Math.max(8, Math.min(y, window.innerHeight - 440)) }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" onClick={onInsertBefore} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
        <Plus className="h-4 w-4" />
        在上方插入一行
      </button>
      <button type="button" onClick={onInsertAfter} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
        <Plus className="h-4 w-4" />
        在下方插入一行
      </button>
      <button type="button" onClick={onCopy} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
        <Copy className="h-4 w-4" />
        复制到下方
      </button>
      {canCopyToSpace && (
        <button type="button" onClick={onCopyToSpace} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
          <span className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap">
            <Copy className="h-4 w-4" />
            复制到其他空间/类别
          </span>
          <ChevronRight className="h-4 w-4 text-surface-300" />
        </button>
      )}
      {canSetAttribution && (
        <button type="button" onClick={onSetAttribution} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
          <Tags className="h-4 w-4" />
          设置费用归属
        </button>
      )}
      {canSaveToCustomLibrary && (
        <button type="button" onClick={onSaveToCustomLibrary} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-primary-50 hover:text-primary-700">
          <BookmarkPlus className="h-4 w-4" />
          保存到自定义库
        </button>
      )}
      <button type="button" onClick={onClear} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
        <Eraser className="h-4 w-4" />
        清空本行内容
      </button>
      <div className="my-1 border-t border-surface-100" />
      <button
        type="button"
        onClick={() => onColor(special ? "" : "special")}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-orange-50 ${
          special ? "bg-orange-50 text-orange-700" : "text-surface-700"
        }`}
      >
        <span className="quote-special-menu-mark">特</span>
        {special ? "取消特价项目" : "标为特价项目"}
      </button>
      <div className="px-3 py-2">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-surface-500">
          <Palette className="h-3.5 w-3.5" />
          标记颜色
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {quotationRowColors.filter((color) => color.value !== "special").map((color) => {
            const active = activeColor.value === color.value;
            return (
              <button
                key={color.value || "none"}
                type="button"
                onClick={() => onColor(color.value)}
                className={`h-7 w-7 rounded-md border transition hover:scale-105 ${active ? "ring-2 ring-primary-400 ring-offset-1" : ""}`}
                style={{ backgroundColor: color.value ? color.swatch : "#ffffff", borderColor: color.border }}
                title={color.label}
              />
            );
          })}
        </div>
      </div>
      <button type="button" onClick={() => onColor("")} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
        <Eraser className="h-4 w-4" />
        清除颜色
      </button>
      <div className="my-1 border-t border-surface-100" />
      <button type="button" onClick={onRemove} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50">
        <Trash2 className="h-4 w-4" />
        删除本行
      </button>
    </div>
  );
}

function isSpecialQuoteItem(item?: Pick<QuotationItem, "row_color"> | null) {
  return String(item?.row_color || "") === "special";
}

function QuoteNameTextarea({
  value,
  onChange,
  className = "",
  readOnly,
  special,
  highlight,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  readOnly?: boolean;
  special?: boolean;
  highlight?: Pick<FindReplaceActiveHighlight, "start" | "length"> | null;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [multiline, setMultiline] = useState(false);

  useEffect(() => {
    const updateMultiline = () => {
      setMultiline(value.includes("\n"));
    };
    const frame = window.requestAnimationFrame(updateMultiline);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateMultiline) : null;
    if (wrapperRef.current && observer) observer.observe(wrapperRef.current);
    window.addEventListener("resize", updateMultiline);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateMultiline);
    };
  }, [value]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !multiline) return;
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [multiline, value]);

	  return (
	    <div ref={wrapperRef} className="relative flex min-h-[56px] w-full items-center">
	      {special && <span className="quote-special-mark" title="特价项目">特</span>}
	      <span ref={measureRef} className={`quote-name-measure ${className}`}>{value || " "}</span>
	      {highlight && value ? (
	        <span className={`quote-name-highlight-layer ${multiline ? "quote-name-highlight-layer-multiline" : ""} ${className}`} aria-hidden="true">
	          {renderFindReplaceHighlightedText(value, highlight)}
	        </span>
	      ) : null}
	      {multiline ? (
	        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleQuoteCellKeyDown}
	          className={`quote-cell-editable quote-cell-textarea quote-name-textarea ${highlight ? "quote-cell-find-highlighted" : ""} ${className}`}
	        />
	      ) : (
        <input
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleQuoteCellKeyDown}
	          className={`quote-cell-editable quote-cell-input quote-name-cell-input ${highlight ? "quote-cell-find-highlighted" : ""} ${className}`}
	        />
	      )}
    </div>
  );
}

function QuoteCenteredSpecTextarea({
  value,
  onChange,
  readOnly,
  className = "",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(72, Math.max(34, textarea.scrollHeight))}px`;
  }, [value]);

  return (
    <div className="flex min-h-[56px] w-full items-center">
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleQuoteCellKeyDown}
        className={`quote-cell-editable quote-cell-textarea quote-cell-textarea-centered text-center read-only:cursor-default ${className}`}
        placeholder={placeholder}
      />
    </div>
  );
}

function QuoteDescriptionCell({
  value,
  onChange,
  readOnly,
  label = "施工说明",
  emptyText = "点击填写施工说明",
  placeholder = "施工工艺、材料品牌规格、计价备注...",
  highlight,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  label?: string;
  emptyText?: string;
  placeholder?: string;
  highlight?: Pick<FindReplaceActiveHighlight, "start" | "length"> | null;
}) {
  const [open, setOpen] = useState(false);
  const text = value || "";
  const displayText = text.trim() || emptyText;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="quote-description-trigger"
        title={text || emptyText}
      >
        <span className={`quote-description-preview ${text.trim() ? "" : "quote-description-placeholder"}`}>
          {highlight && text.trim() ? renderFindReplaceHighlightedText(displayText, highlight) : displayText}
        </span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0b1220]/35 px-4 py-6 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <div
            className="quote-description-modal w-full max-w-[640px] overflow-hidden bg-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e8eef6] px-5 py-4">
              <div>
                <div className="text-base font-semibold text-[#182230]">{readOnly ? `查看${label}` : `编辑${label}`}</div>
                <div className="mt-0.5 text-xs text-[#667085]">表格中仅展示两行，完整内容在这里查看和修改。</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[#667085] transition hover:bg-[#edf4ff] hover:text-[#407AFF]"
                aria-label={`关闭${label}弹窗`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-[#f8fbff] px-5 py-4">
              <textarea
                value={text}
                readOnly={readOnly}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={handleQuoteCellKeyDown}
                className="w-full px-3 py-3 text-sm leading-6 read-only:cursor-default"
                placeholder={placeholder}
                autoFocus={!readOnly}
              />
            </div>
            <div className="flex justify-end border-t border-[#e8eef6] bg-white px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#407AFF] bg-[#407AFF] px-5 text-sm font-semibold text-white transition hover:bg-[#2f66e8]"
              >
                {readOnly ? "关闭" : "完成"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function QuoteCategoryChooser({
  activeSpace,
  isAllSpaceView,
  readOnly,
  onSelect,
}: {
  activeSpace: string;
  isAllSpaceView?: boolean;
  readOnly?: boolean;
  onSelect: (category: string) => void;
}) {
  const options = [
    {
      value: "base",
      title: "基装",
      text: "基础施工、人工和辅材项目",
      icon: FileText,
    },
    {
      value: "main_material",
      title: "产品",
      text: "主材产品、规格和选品报价",
      icon: Tags,
    },
    {
      value: "custom_cabinet",
      title: "定制柜",
      text: "柜体、门板和定制类项目",
      icon: Ruler,
    },
  ];

  return (
    <section className="quote-section quote-section-non-base quote-section-empty quote-category-chooser-state no-print flex min-h-[calc(100vh-var(--quote-command-height)-190px)] flex-col rounded-[12px] border border-[#d9e2ef] bg-white">
      <div className="quote-category-chooser-inner">
        <div>
          <p className="quote-category-chooser-title">{isAllSpaceView ? "请选择具体空间" : "选择报价大类"}</p>
          <p className="quote-category-chooser-text">
            {isAllSpaceView ? "全部是汇总视图，不能直接新增项目。请先选择客餐厅、卧室等具体空间。" : `${activeSpace || "当前空间"}还没有报价大类，请先选择要录入的类型。`}
          </p>
        </div>
        {!isAllSpaceView && (
          <div className="quote-category-chooser-grid">
            {options.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onSelect(option.value)}
                  className="quote-category-chooser-card"
                >
                  <span className="quote-category-chooser-icon">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="quote-category-chooser-name">{option.title}</span>
                  <span className="quote-category-chooser-desc">{option.text}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function QuoteSection({ title, category, activeSpace, activeSpaceAmount, items, spaceOptions, otherFeeRows, baseAmount, materialAmount, feeFormulaContext, isAllSpaceView, searchValue, onSearchChange, onAdd, onManualAdd, onOpenFindReplace, categoryNavigation, useQuotaLibraryAction, selectedItemKeys, selectedItemCount, onToggleItemSelection, onToggleAllItemSelection, onDeleteSelectedItems, onChange, onOpenRowMenu, readOnly, draggingItemIndex, dragOverItem, recentlyMovedItemKey, activeFindReplaceHighlight, onItemPointerDown }: {
  title: string;
  category: QuotationItem["category"];
  activeSpace?: string;
  activeSpaceAmount: number;
  items: { item: QuotationItem; index: number }[];
  spaceOptions: string[];
  otherFeeRows: { item: QuotationItem; index: number }[];
  baseAmount: number;
  materialAmount: number;
  feeFormulaContext?: FeeFormulaContext;
  isAllSpaceView?: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAdd: () => void;
  onManualAdd?: () => void;
  onOpenFindReplace?: () => void;
  categoryNavigation?: React.ReactNode;
  useQuotaLibraryAction?: boolean;
  selectedItemKeys: Set<string>;
  selectedItemCount: number;
  onToggleItemSelection: (key: string) => void;
  onToggleAllItemSelection: (keys: string[]) => void;
  onDeleteSelectedItems: () => void;
  onChange: (index: number, patch: Partial<QuotationItem>) => void;
  onOpenRowMenu: RowMenuOpenHandler;
  readOnly?: boolean;
  draggingItemIndex: number | null;
  dragOverItem: DragOverItemState;
  recentlyMovedItemKey: string | null;
  activeFindReplaceHighlight?: FindReplaceActiveHighlight | null;
  onItemPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, index: number) => void;
}) {
  const isBase = isBaseCategory(category);
  const isOther = isOtherCategory(category);
  const sectionTitle = categoryNavigation && !isOther
    ? (isAllSpaceView ? "全部空间" : activeSpace || title)
    : isAllSpaceView ? `全部空间 · ${title}` : activeSpace ? `${activeSpace} · ${title}` : title;
  const addLabel = useQuotaLibraryAction ? "添加基础项目" : isBase ? "添加基础项目" : isOther ? "添加费用项目" : `添加${getCategoryLabel(category)}项目`;
  const emptyText = searchValue.trim()
    ? "未找到匹配项目"
    : isAllSpaceView
      ? "全部空间暂无明细"
      : isBase ? "暂无基装明细" : "暂无明细";
  const isEmpty = items.length === 0;
  const canAddInCurrentView = !isAllSpaceView;
  const [fullscreen, setFullscreen] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!fullscreen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === document.documentElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const target = document.documentElement;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    setFullscreen(true);
    if (target.requestFullscreen) {
      void target.requestFullscreen().catch(() => setFullscreen(true));
    }
  }, []);

  return (
    <section ref={sectionRef} className={`quote-section ${fullscreen ? "quote-section-fullscreen" : ""} ${isBase ? "quote-section-base" : "quote-section-non-base"} ${isOther ? "quote-section-other-fees" : ""} flex min-h-[calc(100vh-var(--quote-command-height)-190px)] flex-col rounded-[12px] border border-[#d9e2ef] bg-white ${isEmpty ? "quote-section-empty" : ""}`}>
      <div className="quote-section-header flex flex-col gap-3 border-b border-surface-100 px-4 py-2 md:flex-row md:items-center md:justify-between">
        <div className="quote-section-title-strip min-w-0">
          <div className="quote-section-title-copy min-w-0">
            <h3 className="quote-section-title truncate text-sm font-semibold text-surface-900">{sectionTitle}</h3>
            {activeSpace && <p className="quote-section-summary text-xs text-surface-400">{isAllSpaceView ? "全部空间小计" : "当前空间小计"} {formatQuoteAmount(activeSpaceAmount)}</p>}
          </div>
          {categoryNavigation}
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end md:w-auto">
          {!readOnly && selectedItemCount > 0 && (
            <button
              type="button"
              onClick={onDeleteSelectedItems}
              className="quote-bulk-delete inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              删除已选 {selectedItemCount}
            </button>
          )}
          {!readOnly && canAddInCurrentView && onManualAdd && (
            <button
              type="button"
              onClick={onManualAdd}
              className="quote-manual-add inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border px-3 text-sm font-semibold transition"
            >
              <span className="quote-manual-add-icon">
                <Plus className="h-3.5 w-3.5" />
              </span>
              <span>手动添加项目</span>
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={onOpenFindReplace}
              className="quote-find-replace-button inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border px-3 text-sm font-semibold transition"
              title="查找并替换工程项目或施工说明文字"
            >
              <Replace className="h-4 w-4" />
              查找替换
            </button>
          )}
          <div className="quote-toolbar-search relative w-full md:w-72">
            <Search className="quote-toolbar-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              className="quote-search-field input-field min-h-9 rounded-[10px] pl-9 pr-3 py-1.5"
              placeholder="搜索项目"
            />
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="quote-section-fullscreen-toggle inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#d9e2ef] bg-white text-[#667085] transition hover:border-[#cfe0ff] hover:bg-[#edf4ff] hover:text-[#407AFF]"
            title={fullscreen ? "退出全屏（Esc）" : "全屏查看明细"}
            aria-label={fullscreen ? "退出全屏" : "全屏查看报价明细"}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {isBase ? (
        <BaseQuoteTable
          items={items}
          showSpace={!!isAllSpaceView}
          spaceOptions={spaceOptions}
          emptyText={emptyText}
          draggingItemIndex={draggingItemIndex}
          dragOverItem={dragOverItem}
          recentlyMovedItemKey={recentlyMovedItemKey}
          activeFindReplaceHighlight={activeFindReplaceHighlight}
          onChange={onChange}
          onOpenRowMenu={onOpenRowMenu}
          selectedItemKeys={selectedItemKeys}
          onToggleItemSelection={onToggleItemSelection}
          onToggleAllItemSelection={onToggleAllItemSelection}
          readOnly={readOnly}
          onItemPointerDown={onItemPointerDown}
        />
      ) : isCustomCabinetCategory(category) ? (
        <CustomCabinetQuoteTable
          items={items}
          showSpace={!!isAllSpaceView}
          spaceOptions={spaceOptions}
          emptyText={emptyText}
          draggingItemIndex={draggingItemIndex}
          dragOverItem={dragOverItem}
          recentlyMovedItemKey={recentlyMovedItemKey}
          activeFindReplaceHighlight={activeFindReplaceHighlight}
          onChange={onChange}
          onOpenRowMenu={onOpenRowMenu}
          selectedItemKeys={selectedItemKeys}
          onToggleItemSelection={onToggleItemSelection}
          onToggleAllItemSelection={onToggleAllItemSelection}
          readOnly={readOnly}
          onItemPointerDown={onItemPointerDown}
        />
      ) : (
        <SimpleQuoteTable
          items={items}
          otherFeeRows={otherFeeRows}
          showSpace={!isOther}
          editableSpace={!!isAllSpaceView}
          spaceOptions={spaceOptions}
          isOtherFees={isOther}
          baseAmount={baseAmount}
          materialAmount={materialAmount}
          feeFormulaContext={feeFormulaContext}
          emptyText={emptyText}
          draggingItemIndex={draggingItemIndex}
          dragOverItem={dragOverItem}
          recentlyMovedItemKey={recentlyMovedItemKey}
          activeFindReplaceHighlight={activeFindReplaceHighlight}
          onChange={onChange}
          onOpenRowMenu={onOpenRowMenu}
          selectedItemKeys={selectedItemKeys}
          onToggleItemSelection={onToggleItemSelection}
          onToggleAllItemSelection={onToggleAllItemSelection}
          readOnly={readOnly}
          onItemPointerDown={onItemPointerDown}
        />
      )}
      {!readOnly && canAddInCurrentView && (
        <div className={`quote-section-footer no-print border-t border-surface-100 px-3 ${isOther ? "py-2" : "py-3"} ${isEmpty ? "quote-section-footer-empty" : ""}`}>
          <button
            type="button"
            onClick={onAdd}
            className={`quote-add-row flex w-full items-center justify-center gap-2 rounded-[10px] border text-sm font-semibold transition ${isOther ? "min-h-9" : "min-h-11"}`}
          >
            {useQuotaLibraryAction ? <Copy className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {addLabel}
          </button>
        </div>
      )}
    </section>
  );
}

function QuotaLibraryPickerModal({
  items,
  targetText,
  isAllSpaceView,
  onClose,
  onConfirm,
}: {
  items: QuotaLibraryItem[];
  targetText: string;
  isAllSpaceView: boolean;
  onClose: () => void;
  onConfirm: (items: QuotaLibraryItem[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedIds([]);
  }, [items]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const availableItems = useMemo(
    () => items.filter((item) => item.status === "enabled" && item.source !== "custom" && item.name.trim()),
    [items],
  );
  const categories = useMemo(
    () => uniqueValues(availableItems.map((item) => item.category || "未分类")).sort((a, b) => a.localeCompare(b, "zh-CN")),
    [availableItems],
  );
  const filteredItems = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return availableItems.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (!text) return true;
      return [
        item.code,
        item.scope,
        item.category,
        item.name,
        item.constructionDescription,
        item.unit,
      ].join(" ").toLowerCase().includes(text);
    });
  }, [availableItems, categoryFilter, keyword]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(() => {
    const itemMap = new Map(availableItems.map((item) => [item.id, item]));
    return selectedIds.map((id) => itemMap.get(id)).filter((item): item is QuotaLibraryItem => !!item);
  }, [availableItems, selectedIds]);
  const selectedTotal = useMemo(
    () => selectedItems.reduce((sum, item) => toMoney(sum + toNumber(item.totalPrice)), 0),
    [selectedItems],
  );
  const categoryLabel = categoryFilter === "all" ? "全部分类" : categoryFilter;
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIdSet.has(item.id));
  const shouldUseTallPicker = filteredItems.length > 8;

  const toggleItem = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleFilteredItems = () => {
    const filteredIds = filteredItems.map((item) => item.id);
    setSelectedIds((current) => {
      if (allFilteredSelected) return current.filter((id) => !filteredIds.includes(id));
      return Array.from(new Set([...current, ...filteredIds]));
    });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#0b1220]/35 px-4 py-6 backdrop-blur-[2px]"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className={`quote-library-picker-modal quote-base-library-picker-modal flex w-full max-w-[1240px] flex-col overflow-hidden rounded-[16px] border border-[#d9e2ef] bg-white shadow-[0_24px_70px_rgba(15,35,70,0.20)] ${shouldUseTallPicker ? "h-[78vh]" : "max-h-[78vh]"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="quote-library-header flex items-center justify-between gap-4 border-b border-[#e8eef6] bg-[#fbfcff] px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="quote-library-title text-base font-semibold leading-6 text-[#182230]">添加基础项目</div>
              <span className="quote-library-target-pill max-w-full truncate">{targetText}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="quote-library-close inline-flex h-9 w-9 items-center justify-center text-[#667085] transition hover:bg-[#edf4ff] hover:text-[#407AFF]"
            aria-label="关闭添加基础项目"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="quote-library-filter-row grid gap-3 border-b border-[#e8eef6] bg-[#f7f9fc] px-5 py-3 md:grid-cols-[minmax(320px,1fr)_220px_auto_auto] md:items-end">
          <label className="quote-library-filter-field relative block">
            <span>搜索项目</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa8bb]" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="quote-library-search-input h-10 w-full rounded-[10px] border border-[#d9e2ef] bg-white pl-9 pr-3 text-sm text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
              placeholder="搜索编号、名称、施工说明"
              autoFocus
            />
          </label>
          <label className="quote-library-filter-field block">
            <span>项目分类</span>
            <SystemSelect
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="quote-library-category-select h-10 rounded-[10px] border border-[#d9e2ef] bg-white px-3 text-sm font-medium text-[#182230] outline-none transition focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
              menuClassName="quote-system-select-menu"
              optionClassName="quote-system-select-option"
            >
              <option value="all">全部分类</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </SystemSelect>
          </label>
          <button
            type="button"
            onClick={toggleFilteredItems}
            disabled={filteredItems.length === 0}
            className="quote-library-select-all quote-library-primary-text inline-flex h-10 items-center justify-center rounded-[10px] border border-[#cfe0ff] bg-white px-4 text-sm font-semibold text-[#407AFF] transition hover:bg-[#edf4ff] disabled:cursor-not-allowed disabled:border-[#e9eff7] disabled:text-[#9aa8bb]"
          >
            {allFilteredSelected ? "取消全选" : "全选当前"}
          </button>
          <div className="quote-library-filter-note">
            <b>{categoryLabel}</b><span>{filteredItems.length} 项</span><span>已选 {selectedItems.length}</span>
          </div>
        </div>

        <div className={`quote-library-body bg-white ${shouldUseTallPicker ? "min-h-0 flex-1" : ""}`}>
          {availableItems.length === 0 ? (
            <div className="quote-library-empty-state flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="text-sm font-semibold text-[#34445a]">暂无可添加的基础项目</div>
              <div className="mt-1 text-xs text-[#9aa8bb]">请先在定额库维护启用状态的基础项目，再回到报价中添加。</div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="quote-library-empty-state flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="text-sm font-semibold text-[#34445a]">没有符合条件的定额</div>
              <div className="mt-1 text-xs text-[#9aa8bb]">可以换一个关键词或分类继续查找。</div>
            </div>
          ) : (
            <div className={`quote-library-table-wrap overflow-auto bg-white ${shouldUseTallPicker ? "h-full" : "max-h-[420px]"}`}>
              <table className="quote-library-table quote-base-library-table w-full min-w-[1280px] border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-[#f4f7fb] text-left text-xs font-semibold text-[#34445a]">
                  <tr>
                    <th className="quote-library-sticky-select w-14 px-3 py-0 text-center whitespace-nowrap">选择</th>
                    <th className="quote-library-sticky-category w-28 px-3 py-0 whitespace-nowrap">分类</th>
                    <th className="quote-library-sticky-name w-80 px-3 py-0 whitespace-nowrap">项目名称</th>
                    <th className="w-28 px-3 py-0 text-right whitespace-nowrap">材料单价</th>
                    <th className="w-28 px-3 py-0 text-right whitespace-nowrap">人工单价</th>
                    <th className="w-28 px-3 py-0 text-right whitespace-nowrap">总价</th>
                    <th className="w-[520px] px-3 py-0 whitespace-nowrap">施工说明</th>
                    <th className="w-32 px-3 py-0 whitespace-nowrap">编号</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const checked = selectedIdSet.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className={`quote-library-row cursor-pointer transition ${checked ? "quote-library-row-selected bg-[#edf4ff]" : "bg-white"}`}
                      >
                        <td className="quote-library-sticky-select px-3 py-0 text-center whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item.id)}
                            onClick={(event) => event.stopPropagation()}
                            className="h-4 w-4 rounded border-[#cfe0ff] accent-[#407AFF]"
                            aria-label={`选择${item.name}`}
                          />
                        </td>
                        <td className="quote-library-sticky-category px-3 py-0 text-[#52647b] whitespace-nowrap">
                          <span className="quote-library-category-badge">{item.category || "未分类"}</span>
                        </td>
                        <td className="quote-library-sticky-name px-3 py-0">
                          <div className="quote-library-item-title min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="whitespace-nowrap" title={item.name}>{item.name}</span>
                              {item.isSpecialPrice && <span className="quote-library-special-tag shrink-0 bg-[#fff4e5] px-1.5 py-0.5 text-[11px] font-semibold text-[#b45309]">特价</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-0 text-right font-semibold tabular-nums text-[#162033] whitespace-nowrap">{formatQuoteAmount(item.materialPrice)}</td>
                        <td className="px-3 py-0 text-right font-semibold tabular-nums text-[#162033] whitespace-nowrap">{formatQuoteAmount(item.laborPrice)}</td>
                        <td className="quote-library-total-price px-3 py-0 text-right font-semibold tabular-nums whitespace-nowrap">{formatQuoteAmount(item.totalPrice)}</td>
                        <td className="px-3 py-0">
                          <div className="quote-library-description-cell truncate" title={item.constructionDescription || "暂无施工说明"}>
                            {item.constructionDescription || "暂无施工说明"}
                          </div>
                        </td>
                        <td className="px-3 py-0 whitespace-nowrap">{item.code || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="quote-library-footer flex min-h-[64px] flex-col gap-3 border-t border-[#e8eef6] bg-[#fbfcff] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="quote-library-footer-summary text-xs text-[#6f7f96]">
            <span>已选择 <b>{selectedItems.length}</b> 项</span>
            <span>合计 {formatQuoteAmount(selectedTotal)}</span>
            <span>添加后数量默认为 0，可在报价表内继续填写</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#d9e2ef] bg-white px-4 text-sm font-semibold text-[#52647b] transition hover:bg-[#f7f9fd]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selectedItems)}
              disabled={selectedItems.length === 0}
              className="quote-library-primary-action inline-flex h-10 items-center justify-center rounded-[10px] border border-[#407AFF] bg-[#407AFF] px-4 text-sm font-semibold text-white transition hover:bg-[#2f66e8] disabled:cursor-not-allowed disabled:border-[#cfe0ff] disabled:bg-[#cfe0ff]"
            >
              添加到报价
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProductLibraryPickerModal({
  items,
  loading,
  targetText,
  onClose,
  onConfirm,
}: {
  items: ProductLibraryPick[];
  loading: boolean;
  targetText: string;
  onClose: () => void;
  onConfirm: (items: ProductLibraryPick[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortMode, setSortMode] = useState<"default" | "priceAsc" | "priceDesc">("default");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedIds([]);
  }, [items]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const categories = useMemo(
    () => uniqueValues(items.map((item) => item.categoryName || "未分类")).sort((a, b) => a.localeCompare(b, "zh-CN")),
    [items],
  );
  const brands = useMemo(
    () => uniqueValues(items.map((item) => item.brand || "").filter(Boolean)).sort((a, b) => a.localeCompare(b, "zh-CN")),
    [items],
  );
  const normalizedPriceMin = useMemo(() => {
    if (!priceMin.trim()) return null;
    const value = Number(priceMin);
    return Number.isFinite(value) ? value : null;
  }, [priceMin]);
  const normalizedPriceMax = useMemo(() => {
    if (!priceMax.trim()) return null;
    const value = Number(priceMax);
    return Number.isFinite(value) ? value : null;
  }, [priceMax]);
  const filteredItems = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    const result = items.filter((item) => {
      if (categoryFilter !== "all" && item.categoryName !== categoryFilter) return false;
      if (brandFilter !== "all" && item.brand !== brandFilter) return false;
      if (stockFilter !== "all") {
        const stockKey = item.stock <= 0 ? "empty" : item.stock <= item.minStock ? "low" : "normal";
        if (stockKey !== stockFilter) return false;
      }
      if (normalizedPriceMin != null && item.customerPrice < normalizedPriceMin) return false;
      if (normalizedPriceMax != null && item.customerPrice > normalizedPriceMax) return false;
      if (!text) return true;
      return [
        item.code,
        item.categoryName,
        item.productName,
        item.brand,
        item.materialModel,
        item.skuName,
        item.spec,
        item.color,
        item.unit,
      ].join(" ").toLowerCase().includes(text);
    });
    if (sortMode === "priceAsc") return [...result].sort((a, b) => a.customerPrice - b.customerPrice);
    if (sortMode === "priceDesc") return [...result].sort((a, b) => b.customerPrice - a.customerPrice);
    return result;
  }, [brandFilter, categoryFilter, items, keyword, normalizedPriceMax, normalizedPriceMin, sortMode, stockFilter]);
  const hasActiveProductFilters = Boolean(
    keyword.trim()
    || categoryFilter !== "all"
    || brandFilter !== "all"
    || stockFilter !== "all"
    || sortMode !== "default"
    || priceMin.trim()
    || priceMax.trim()
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(() => {
    const itemMap = new Map(items.map((item) => [item.id, item]));
    return selectedIds.map((id) => itemMap.get(id)).filter((item): item is ProductLibraryPick => !!item);
  }, [items, selectedIds]);
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIdSet.has(item.id));
  const shouldUseTallPicker = filteredItems.length > 8 || loading;
  const getSpecText = (item: ProductLibraryPick) => [item.skuName, item.spec, item.color]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(" / ");
  const getProductMetaText = (item: ProductLibraryPick) => [item.categoryName || "未分类", item.brand, item.materialModel]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(" · ");
  const getPickerStockWarning = (item: ProductLibraryPick) => {
    if (item.stock <= 0) return { label: "缺货", className: "bg-red-50 text-red-700 ring-red-200" };
    if (item.stock <= item.minStock) return { label: "库存偏低", className: "bg-amber-50 text-amber-700 ring-amber-200" };
    return { label: "库存正常", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  };
  const getVisiblePickerAttributes = (item: ProductLibraryPick) => {
    const merged = {
      ...parseProductAttributes(item.productAttributes),
      ...parseProductAttributes(item.skuAttributes),
    };
    return Object.entries(merged)
      .map(([label, value]) => [label, String(value || "").trim()] as const)
      .filter(([label, value]) => value && label !== "安装方式")
      .map(([, value]) => value)
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 2);
  };

  const toggleItem = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleFilteredItems = () => {
    const filteredIds = filteredItems.map((item) => item.id);
    setSelectedIds((current) => {
      if (allFilteredSelected) return current.filter((id) => !filteredIds.includes(id));
      return Array.from(new Set([...current, ...filteredIds]));
    });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#0b1220]/35 px-4 py-6 backdrop-blur-[2px]"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className={`quote-library-picker-modal quote-product-library-picker-modal flex w-full max-w-[1280px] flex-col overflow-hidden rounded-[12px] border border-[#d9e2ef] bg-white shadow-[0_22px_58px_rgba(15,35,70,0.18)] ${shouldUseTallPicker ? "h-[78vh]" : "max-h-[78vh]"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="quote-library-header flex items-center justify-between border-b border-[#e8eef6] bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="text-base font-semibold leading-6 text-[#182230]">添加产品项目</div>
            <div className="mt-0.5 text-xs text-[#6f7f96]">添加到：{targetText}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="quote-library-close inline-flex h-9 w-9 items-center justify-center text-[#667085] transition hover:bg-[#edf4ff] hover:text-[#407AFF]"
            aria-label="关闭添加产品项目"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="quote-library-filter-row border-b border-[#e8eef6] bg-[#f8fbff] px-5 py-3">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto_auto] md:items-center">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa8bb]" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="quote-library-search-input h-10 w-full rounded-[10px] border border-[#d9e2ef] bg-white pl-9 pr-3 text-sm text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
                placeholder="搜索产品、品牌、型号、规格"
                autoFocus
              />
            </label>
            <SystemSelect
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="quote-library-category-select h-10 rounded-[10px] border border-[#d9e2ef] bg-white px-3 text-sm font-medium text-[#182230] outline-none transition focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
              menuClassName="quote-system-select-menu"
              optionClassName="quote-system-select-option"
            >
              <option value="all">全部分类</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </SystemSelect>
            <div className="quote-product-view-toggle inline-flex h-10 items-center rounded-[10px] border border-[#d9e2ef] bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition", viewMode === "grid" ? "bg-[#407AFF] text-white" : "text-[#667085] hover:bg-[#edf4ff] hover:text-[#407AFF]")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                平铺
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition", viewMode === "list" ? "bg-[#407AFF] text-white" : "text-[#667085] hover:bg-[#edf4ff] hover:text-[#407AFF]")}
              >
                <List className="h-3.5 w-3.5" />
                列表
              </button>
            </div>
            <button
              type="button"
              onClick={toggleFilteredItems}
              disabled={filteredItems.length === 0 || loading}
              className="quote-library-select-all quote-library-primary-text inline-flex h-10 items-center justify-center rounded-[10px] border border-[#cfe0ff] bg-white px-4 text-sm font-semibold text-[#407AFF] transition hover:bg-[#edf4ff] disabled:cursor-not-allowed disabled:border-[#e9eff7] disabled:text-[#9aa8bb]"
            >
              {allFilteredSelected ? "取消全选" : "全选当前"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SystemSelect
              value={brandFilter}
              onChange={(event) => setBrandFilter(event.target.value)}
              className="h-9 w-32 rounded-[9px] border border-[#d9e2ef] bg-white px-3 text-xs font-medium text-[#34445a] outline-none transition focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
              menuClassName="quote-system-select-menu"
              optionClassName="quote-system-select-option"
            >
              <option value="all">全部品牌</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </SystemSelect>
            <SystemSelect
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
              className="h-9 w-32 rounded-[9px] border border-[#d9e2ef] bg-white px-3 text-xs font-medium text-[#34445a] outline-none transition focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
              menuClassName="quote-system-select-menu"
              optionClassName="quote-system-select-option"
            >
              <option value="all">全部库存</option>
              <option value="normal">库存正常</option>
              <option value="low">库存偏低</option>
              <option value="empty">缺货</option>
            </SystemSelect>
            <SystemSelect
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as "default" | "priceAsc" | "priceDesc")}
              className="h-9 w-32 rounded-[9px] border border-[#d9e2ef] bg-white px-3 text-xs font-medium text-[#34445a] outline-none transition focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
              menuClassName="quote-system-select-menu"
              optionClassName="quote-system-select-option"
            >
              <option value="default">默认排序</option>
              <option value="priceAsc">价格升序</option>
              <option value="priceDesc">价格降序</option>
            </SystemSelect>
            <div className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[#d9e2ef] bg-white px-2">
              <span className="shrink-0 text-xs font-medium text-[#6f7f96]">价格</span>
              <input
                value={priceMin}
                onChange={(event) => setPriceMin(event.target.value.replace(/[^\d.]/g, ""))}
                className="h-7 w-16 rounded-md border border-[#e4eaf3] px-2 text-xs text-[#34445a] outline-none focus:border-[#407AFF]"
                placeholder="最低"
                inputMode="decimal"
              />
              <span className="text-xs text-[#9aa8bb]">-</span>
              <input
                value={priceMax}
                onChange={(event) => setPriceMax(event.target.value.replace(/[^\d.]/g, ""))}
                className="h-7 w-16 rounded-md border border-[#e4eaf3] px-2 text-xs text-[#34445a] outline-none focus:border-[#407AFF]"
                placeholder="最高"
                inputMode="decimal"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setCategoryFilter("all");
                setBrandFilter("all");
                setStockFilter("all");
                setSortMode("default");
                setPriceMin("");
                setPriceMax("");
              }}
              disabled={!hasActiveProductFilters}
              className="inline-flex h-9 items-center justify-center rounded-[9px] border border-[#d9e2ef] bg-white px-3 text-xs font-semibold text-[#52647b] transition hover:bg-[#edf4ff] hover:text-[#407AFF] disabled:cursor-not-allowed disabled:text-[#a7b3c5]"
            >
              清空筛选
            </button>
            <span className="ml-auto text-xs font-medium text-[#8a9ab0]">共 {filteredItems.length} 个规格</span>
          </div>
        </div>

        <div className={`quote-library-body bg-white ${shouldUseTallPicker ? "min-h-0 flex-1" : ""}`}>
          {loading ? (
            <div className="quote-library-empty-state flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-[#407AFF]" />
              <div className="mt-3 text-sm font-semibold text-[#34445a]">正在加载主材产品</div>
            </div>
          ) : items.length === 0 ? (
            <div className="quote-library-empty-state flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center">
              <div className="text-sm font-semibold text-[#34445a]">暂无可添加的产品</div>
              <div className="mt-1 text-xs text-[#9aa8bb]">请先在主材产品中维护启用的产品和规格。</div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="quote-library-empty-state flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center">
              <div className="text-sm font-semibold text-[#34445a]">没有符合条件的产品</div>
              <div className="mt-1 text-xs text-[#9aa8bb]">可以换一个关键词或分类继续查找。</div>
            </div>
          ) : viewMode === "grid" ? (
            <div className="quote-product-picker-grid-wrap h-full overflow-auto bg-[#f6f8fb] p-4">
              <div className="quote-product-picker-grid">
                {filteredItems.map((item) => {
                  const checked = selectedIdSet.has(item.id);
                  const attributes = getVisiblePickerAttributes(item);
                  const stockWarning = getPickerStockWarning(item);
                  const imageModelText = String(item.materialModel || item.skuName || item.spec || "").trim();
                  return (
                    <article
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className={cn(
                        "materials-product-card quote-product-picker-card group flex h-full min-h-0 cursor-pointer flex-col overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition hover:border-primary-200 hover:shadow-[0_8px_22px_rgba(15,23,42,0.08)]",
                        checked && "is-selected border-primary-300 ring-2 ring-primary-100"
                      )}
                    >
                      <div className="materials-product-image quote-product-picker-card-image relative bg-surface-50">
                        {item.image ? (
                          <NativeImage src={item.image} alt={item.productName} className="block h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-primary-200">
                            <Tags className="h-9 w-9" />
                          </div>
                        )}
                        <label className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-white/92 shadow-sm ring-1 ring-surface-200" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item.id)}
                            className="h-4 w-4 rounded border-[#cfe0ff] accent-[#407AFF]"
                            aria-label={`选择${item.productName}`}
                          />
                        </label>
                        <span className={cn("absolute right-2 top-2 rounded-md px-2 py-1 text-[11px] font-semibold ring-1", stockWarning.className)}>
                          {stockWarning.label}
                        </span>
                        {imageModelText && (
                          <span className="absolute inset-x-0 bottom-0 z-10 truncate bg-surface-900/70 px-3 py-1.5 text-center text-xs font-semibold text-white">
                            {imageModelText}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-3 pb-2.5">
                        <div className="line-clamp-2 min-h-[40px] text-left text-sm font-semibold leading-5 text-surface-900" title={item.productName}>
                          {item.productName}
                        </div>
                        <div className="mt-2 flex items-baseline gap-1">
                          <span className="text-lg font-semibold text-red-600">¥{formatQuoteAmount(item.customerPrice)}{item.skuCount > 1 && <span className="materials-price-suffix">起</span>}</span>
                          <span className="text-xs font-medium text-surface-400">/{item.unit || "件"}</span>
                          {item.skuCount > 1 && <span className="materials-sku-count-badge ml-1">{item.skuCount}规格</span>}
                        </div>
                        <div className="mt-2 flex min-h-[42px] content-start flex-wrap gap-1.5">
                          {(attributes.length > 0 ? attributes : [item.color, item.spec].map((value) => String(value || "").trim()).filter(Boolean).slice(0, 2)).map((value) => (
                            <span key={value} className="max-w-full truncate rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">{value}</span>
                          ))}
                        </div>
                        <div className="materials-product-category-row mt-2 flex min-h-6 items-center">
                          <span className="max-w-full truncate rounded-md bg-surface-100 px-2 py-1 text-[11px] font-semibold text-surface-600">
                            {item.categoryName || "未分类"}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={`quote-library-table-wrap overflow-auto bg-white ${shouldUseTallPicker ? "h-full" : "max-h-[420px]"}`}>
              <table className="quote-library-table quote-product-picker-table w-full min-w-[1240px] border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-[#f4f7fb] text-left text-xs font-semibold text-[#34445a]">
                  <tr>
                    <th className="w-16 px-4 py-0 text-center whitespace-nowrap">选择</th>
                    <th className="w-[420px] px-3 py-0 whitespace-nowrap">产品信息</th>
                    <th className="w-64 px-3 py-0 whitespace-nowrap">规格参数</th>
                    <th className="w-20 px-3 py-0 text-center whitespace-nowrap">单位</th>
                    <th className="w-28 px-3 py-0 text-right whitespace-nowrap">市场价</th>
                    <th className="w-28 px-3 py-0 text-right whitespace-nowrap">客户价</th>
                    <th className="w-28 px-3 py-0 text-right whitespace-nowrap">采购价</th>
                    <th className="w-28 px-3 py-0 text-right whitespace-nowrap">内控价</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const checked = selectedIdSet.has(item.id);
                    const specText = getSpecText(item);
                    const productMeta = getProductMetaText(item);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className={`quote-library-row cursor-pointer transition ${checked ? "quote-library-row-selected bg-[#edf4ff]" : "bg-white"}`}
                      >
                        <td className="px-4 py-0 text-center whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item.id)}
                            onClick={(event) => event.stopPropagation()}
                            className="h-4 w-4 rounded border-[#cfe0ff] accent-[#407AFF]"
                            aria-label={`选择${item.productName}`}
                          />
                        </td>
                        <td className="px-3 py-0">
                          <div className="quote-product-picker-info flex min-w-0 items-center gap-3">
                            <div className="quote-product-picker-image shrink-0 overflow-hidden rounded-lg border border-[#dbe6f5] bg-[#f4f7fb]">
                              {item.image ? (
                                <NativeImage src={item.image} alt={item.productName} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-[#9aa8bb]">无图</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="line-clamp-2 font-semibold leading-5 text-[#162033]" title={item.productName}>{item.productName}</div>
                              <div className="mt-1 line-clamp-1 text-xs font-medium text-[#6f7f96]" title={productMeta || undefined}>{productMeta || "未填写分类和型号"}</div>
                              {item.code && <div className="mt-1 text-xs text-[#9aa8bb]">{item.code}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-0">
                          <div className="line-clamp-2 font-medium leading-5 text-[#52647b]" title={specText || "默认规格"}>{specText || "默认规格"}</div>
                          {item.skuName && <div className="mt-1 text-xs text-[#9aa8bb]">规格项：{item.skuName}</div>}
                        </td>
                        <td className="px-3 py-0 text-center text-[#52647b] whitespace-nowrap">{item.unit || "-"}</td>
                        <td className="px-3 py-0 text-right tabular-nums text-[#8b98aa] whitespace-nowrap">{formatQuoteAmount(item.marketPrice)}</td>
                        <td className="px-3 py-0 text-right font-semibold tabular-nums text-[#162033] whitespace-nowrap">{formatQuoteAmount(item.customerPrice)}</td>
                        <td className="px-3 py-0 text-right tabular-nums text-[#52647b] whitespace-nowrap">{formatQuoteAmount(item.purchasePrice)}</td>
                        <td className="px-3 py-0 text-right tabular-nums text-[#52647b] whitespace-nowrap">{formatQuoteAmount(item.internalControlPrice)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="quote-library-footer flex min-h-[60px] flex-col gap-2 border-t border-[#e8eef6] bg-[#fbfcff] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-[#6f7f96]">
            已选择 <span className="quote-library-primary-text font-semibold text-[#407AFF]">{selectedItems.length}</span> 个规格，添加后数量默认为 0，可在报价表内继续填写。
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#d9e2ef] bg-white px-4 text-sm font-semibold text-[#52647b] transition hover:bg-[#f7f9fd]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selectedItems)}
              disabled={selectedItems.length === 0 || loading}
              className="quote-library-primary-action inline-flex h-10 items-center justify-center rounded-[10px] border border-[#407AFF] bg-[#407AFF] px-4 text-sm font-semibold text-white transition hover:bg-[#2f66e8] disabled:cursor-not-allowed disabled:border-[#cfe0ff] disabled:bg-[#cfe0ff]"
            >
              添加到报价
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}


function QuoteRowIndexCell({
  itemKey,
  label,
  readOnly,
  selected,
  onToggle,
  onItemPointerDown,
}: {
  itemKey: string;
  label: string | number;
  readOnly?: boolean;
  selected: boolean;
  onToggle: (key: string) => void;
  onItemPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className={cn("quote-row-index-inner", selected && "is-selected")}>
      {!readOnly && (
        <button
          type="button"
          onPointerDown={onItemPointerDown}
          className="quote-row-drag-handle no-print inline-flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-surface-300 hover:bg-surface-100 hover:text-primary-700 active:cursor-grabbing"
          title="拖动调整项目顺序"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        className="quote-row-number-wrap"
        onClick={(event) => {
          event.stopPropagation();
          onToggle(itemKey);
        }}
        aria-label={`选择第${label}行`}
      >
        {!readOnly && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => undefined}
            tabIndex={-1}
            className="quote-row-checkbox"
            aria-hidden="true"
          />
        )}
        <span className="quote-row-number min-w-4">{label}</span>
      </button>
    </div>
  );
}


function QuoteIndexHeaderCell({
  rowSpan,
  bordered = true,
  itemKeys,
  selectedItemKeys,
  readOnly,
  onToggleAll,
}: {
  rowSpan?: number;
  bordered?: boolean;
  itemKeys: string[];
  selectedItemKeys: Set<string>;
  readOnly?: boolean;
  onToggleAll: (keys: string[]) => void;
}) {
  const selectedCount = itemKeys.filter((key) => selectedItemKeys.has(key)).length;
  const checked = itemKeys.length > 0 && selectedCount === itemKeys.length;
  const indeterminate = selectedCount > 0 && selectedCount < itemKeys.length;
  const checkboxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <th rowSpan={rowSpan} className={cn("quote-index-header-cell w-20 px-2 py-1.5 text-center", bordered && "border border-surface-200")}>
      <button
        type="button"
        className={cn("quote-index-header-control", (checked || indeterminate) && "is-selected")}
        onClick={(event) => {
          event.stopPropagation();
          if (!readOnly && itemKeys.length > 0) onToggleAll(itemKeys);
        }}
        disabled={readOnly || itemKeys.length === 0}
        aria-label={checked ? "取消全选当前列表" : "全选当前列表"}
      >
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={checked}
          onChange={() => undefined}
          tabIndex={-1}
          className="quote-index-header-checkbox"
          aria-hidden="true"
        />
        <span className="quote-index-header-label">编号</span>
      </button>
    </th>
  );
}


const QuoteBaseRow = React.memo(function QuoteBaseRow({
  item,
  index,
  rowIndex,
  showSpace,
  spaceOptions,
  readOnly,
  onChange,
  onOpenRowMenu,
  selected,
  onToggleItemSelection,
  onItemPointerDown,
  isDragging,
  dropBefore,
  dropAfter,
  recentlyMoved,
  findReplaceHighlight,
}: {
  item: QuotationItem;
  index: number;
  rowIndex: number;
  showSpace?: boolean;
  spaceOptions: string[];
  readOnly?: boolean;
  onChange: (index: number, patch: Partial<QuotationItem>) => void;
  onOpenRowMenu: RowMenuOpenHandler;
  selected: boolean;
  onToggleItemSelection: (key: string) => void;
  onItemPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, index: number) => void;
  isDragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  recentlyMoved: boolean;
  findReplaceHighlight?: FindReplaceActiveHighlight | null;
}) {
  const quantity = toNumber(item.quantity);
  const materialUnit = toNumber(item.material_cost);
  const laborUnit = materialUnit || toNumber(item.labor_cost) ? toNumber(item.labor_cost) : toNumber(item.unit_price);
  const materialTotal = quantity * materialUnit;
  const laborTotal = quantity * laborUnit;
  const itemKey = getQuotationItemKey(item, index);
  const handleChange = useCallback((patch: Partial<QuotationItem>) => {
    onChange(index, patch);
  }, [onChange, index]);
  const rowColor = getQuotationRowColor(item.row_color);
  const cellStyle = rowColor.background ? { backgroundColor: rowColor.background } : undefined;
  return (
    <tr
      key={itemKey}
      data-quote-item-row
      data-item-key={itemKey}
      data-index={index}
      onContextMenu={readOnly ? undefined : (event) => onOpenRowMenu(event, index)}
      className={`quote-item-row align-middle transition ${isDragging ? "opacity-45" : ""} ${recentlyMoved ? "quote-item-row-moved" : ""} ${dropBefore ? "quote-item-row-drop-before border-t-2 border-t-primary-500" : ""} ${dropAfter ? "quote-item-row-drop-after border-b-2 border-b-primary-500" : ""}`}
    >
      <td className="border border-surface-200 px-1 py-1 text-center text-surface-500" style={cellStyle}>
        <QuoteRowIndexCell
          itemKey={itemKey}
          label={rowIndex + 1}
          readOnly={readOnly}
          selected={selected}
          onToggle={onToggleItemSelection}
          onItemPointerDown={(event) => onItemPointerDown(event, index)}
        />
      </td>
      {showSpace && (
        <td className="border border-surface-200 p-0 text-center text-surface-600" style={cellStyle}>
          <SpaceSelectCell value={inferItemSpace(item)} options={spaceOptions} onChange={(space) => handleChange({ space })} readOnly={readOnly} />
        </td>
      )}
      <td className="border border-surface-200 p-0 align-middle" style={cellStyle}>
        <QuoteNameTextarea value={item.name} onChange={(value) => handleChange({ name: value })} className="text-center font-medium" readOnly={readOnly} special={isSpecialQuoteItem(item)} highlight={findReplaceHighlight?.field === "name" ? findReplaceHighlight : null} />
      </td>
      <td className="border border-surface-200 p-0" style={cellStyle}><QuoteNumberInput value={item.quantity} onChange={(value) => handleChange({ quantity: value })} className="text-center font-semibold text-red-600" disabled={readOnly} allowFormula /></td>
      <td className="border border-surface-200 p-0" style={cellStyle}><UnitInputCell value={item.unit} onChange={(value) => handleChange({ unit: value })} className="text-center" readOnly={readOnly} /></td>
      <td className="border border-surface-200 p-0" style={cellStyle}><QuoteNumberInput value={item.material_cost || 0} onChange={(value) => {
        handleChange({ material_cost: value, unit_price: value + laborUnit });
      }} className="text-center" disabled={readOnly} /></td>
      <td className="border border-surface-200 px-2 py-1 text-center font-medium text-surface-700" style={cellStyle}>{formatQuoteAmount(materialTotal)}</td>
      <td className="border border-surface-200 p-0" style={cellStyle}><QuoteNumberInput value={laborUnit} onChange={(value) => {
        handleChange({ labor_cost: value, unit_price: materialUnit + value });
      }} className="text-center" disabled={readOnly} /></td>
      <td className="border border-surface-200 px-2 py-1 text-center font-medium text-surface-700" style={cellStyle}>{formatQuoteAmount(laborTotal)}</td>
      <td className="border border-surface-200 px-2 py-1 text-center font-semibold text-red-600" style={cellStyle}>{formatQuoteAmount(materialTotal + laborTotal)}</td>
      <td className="border border-surface-200 p-0 align-middle" style={cellStyle}>
        <QuoteDescriptionCell
          value={item.spec || ""}
          readOnly={readOnly}
          onChange={(value) => handleChange({ spec: value })}
          highlight={findReplaceHighlight?.field === "spec" ? findReplaceHighlight : null}
        />
      </td>
    </tr>
  );
});


function BaseQuoteTable({ items, showSpace, spaceOptions, emptyText, draggingItemIndex, dragOverItem, recentlyMovedItemKey, activeFindReplaceHighlight, onChange, onOpenRowMenu, selectedItemKeys, onToggleItemSelection, onToggleAllItemSelection, readOnly, onItemPointerDown }: {
  items: { item: QuotationItem; index: number }[];
  showSpace?: boolean;
  spaceOptions: string[];
  emptyText: string;
  draggingItemIndex: number | null;
  dragOverItem: DragOverItemState;
  recentlyMovedItemKey: string | null;
  activeFindReplaceHighlight?: FindReplaceActiveHighlight | null;
  onChange: (index: number, patch: Partial<QuotationItem>) => void;
  onOpenRowMenu: RowMenuOpenHandler;
  selectedItemKeys: Set<string>;
  onToggleItemSelection: (key: string) => void;
  onToggleAllItemSelection: (keys: string[]) => void;
  readOnly?: boolean;
  onItemPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, index: number) => void;
}) {
  const materialSubtotal = useMemo(() => items.reduce((sum, { item }) => sum + toNumber(item.quantity) * toNumber(item.material_cost), 0), [items]);
  const laborSubtotal = useMemo(() => items.reduce((sum, { item }) => sum + toNumber(item.quantity) * toNumber(item.labor_cost), 0), [items]);
  const total = materialSubtotal + laborSubtotal;
  const itemKeys = useMemo(() => items.map(({ item, index }) => getQuotationItemKey(item, index)), [items]);

  return (
    <ThinScrollArea className="quote-table-shell" scrollClassName="quote-table-freeze-scroll">
      <table className={`w-full border-collapse text-sm ${showSpace ? "min-w-[1510px]" : "min-w-[1390px]"}`}>
        <thead className="bg-surface-50 text-center text-xs font-semibold text-surface-600">
          <tr>
            <QuoteIndexHeaderCell rowSpan={2} itemKeys={itemKeys} selectedItemKeys={selectedItemKeys} readOnly={readOnly} onToggleAll={onToggleAllItemSelection} />
            {showSpace && <th rowSpan={2} className="w-36 border border-surface-200 px-3 py-1.5">空间/类别</th>}
            <th rowSpan={2} className="w-56 border border-surface-200 px-3 py-1.5">工程项目</th>
            <th rowSpan={2} className="w-40 border border-surface-200 px-2 py-1.5">数量</th>
            <th rowSpan={2} className="w-20 border border-surface-200 px-2 py-1.5">单位</th>
            <th colSpan={2} className="border border-surface-200 px-2 py-1.5">材料</th>
            <th colSpan={2} className="border border-surface-200 px-2 py-1.5">人工</th>
            <th rowSpan={2} className="w-28 border border-surface-200 px-2 py-1.5">合计<br />材料+人工</th>
            <th rowSpan={2} className="w-[360px] border border-surface-200 px-3 py-1.5">施工工艺及材料说明</th>
          </tr>
          <tr>
            <th className="w-24 border border-surface-200 px-2 py-1.5">单价</th>
            <th className="w-24 border border-surface-200 px-2 py-1.5">合价</th>
            <th className="w-24 border border-surface-200 px-2 py-1.5">单价</th>
            <th className="w-24 border border-surface-200 px-2 py-1.5">合价</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ item, index }, rowIndex) => {
            const itemKey = getQuotationItemKey(item, index);
            return (
              <QuoteBaseRow
                key={itemKey}
                item={item}
                index={index}
                rowIndex={rowIndex}
                showSpace={showSpace}
                spaceOptions={spaceOptions}
                readOnly={readOnly}
                onChange={onChange}
                onOpenRowMenu={onOpenRowMenu}
                selected={selectedItemKeys.has(itemKey)}
                onToggleItemSelection={onToggleItemSelection}
                onItemPointerDown={onItemPointerDown}
                isDragging={draggingItemIndex === index}
                dropBefore={dragOverItem?.index === index && dragOverItem.position === "before"}
                dropAfter={dragOverItem?.index === index && dragOverItem.position === "after"}
                recentlyMoved={recentlyMovedItemKey === itemKey}
                findReplaceHighlight={activeFindReplaceHighlight?.itemKey === itemKey ? activeFindReplaceHighlight : null}
              />
            );
          })}
          {items.length === 0 && (
            <tr className="quote-empty-row">
              <td colSpan={showSpace ? 11 : 10} className="quote-empty-cell border border-surface-200 px-4 py-0 text-center">
                <div className="quote-empty-state">
                  <p className="text-sm font-semibold text-[#34445a]">{emptyText}</p>
                  <p className="mt-1 text-xs leading-5 text-[#7c8aa0]">添加项目后，将在这里显示数量、材料、人工和施工说明。</p>
                </div>
              </td>
            </tr>
          )}
          <tr className="bg-surface-50 font-semibold text-surface-900">
            <td className="border border-surface-200 px-2 py-3 text-center" colSpan={showSpace ? 6 : 5}>小计</td>
            <td className="border border-surface-200 px-2 py-3 text-center text-red-600">{formatQuoteAmount(materialSubtotal)}</td>
            <td className="border border-surface-200 px-2 py-3"></td>
            <td className="border border-surface-200 px-2 py-3 text-center text-red-600">{formatQuoteAmount(laborSubtotal)}</td>
            <td className="border border-surface-200 px-2 py-3 text-center text-red-600">{formatQuoteAmount(total)}</td>
            <td className="border border-surface-200 px-2 py-3"></td>
          </tr>
        </tbody>
      </table>
    </ThinScrollArea>
  );
}


const QuoteCabinetRow = React.memo(function QuoteCabinetRow({
  item,
  index,
  rowIndex,
  showSpace,
  spaceOptions,
  readOnly,
  onChange,
  onOpenRowMenu,
  selected,
  onToggleItemSelection,
  onItemPointerDown,
  isDragging,
  dropBefore,
  dropAfter,
  recentlyMoved,
  findReplaceHighlight,
}: {
  item: QuotationItem;
  index: number;
  rowIndex: number;
  showSpace?: boolean;
  spaceOptions: string[];
  readOnly?: boolean;
  onChange: (index: number, patch: Partial<QuotationItem>) => void;
  onOpenRowMenu: RowMenuOpenHandler;
  selected: boolean;
  onToggleItemSelection: (key: string) => void;
  onItemPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, index: number) => void;
  isDragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  recentlyMoved: boolean;
  findReplaceHighlight?: FindReplaceActiveHighlight | null;
}) {
  const itemKey = getQuotationItemKey(item, index);
  const rowColor = getQuotationRowColor(item.row_color);
  const cellStyle = rowColor.background ? { backgroundColor: rowColor.background } : undefined;
  const itemTotal = getBaseOrMaterialItemTotal(item);
  const area = getCustomCabinetArea(item);
  const handleChange = useCallback((patch: Partial<QuotationItem>) => {
    onChange(index, patch);
  }, [onChange, index]);
  return (
    <tr
      key={itemKey}
      data-quote-item-row
      data-item-key={itemKey}
      data-index={index}
      onContextMenu={readOnly ? undefined : (event) => onOpenRowMenu(event, index)}
      className={`quote-item-row align-middle transition ${isDragging ? "opacity-45" : ""} ${recentlyMoved ? "quote-item-row-moved" : ""} ${dropBefore ? "quote-item-row-drop-before border-t-2 border-t-primary-500" : ""} ${dropAfter ? "quote-item-row-drop-after border-b-2 border-b-primary-500" : ""}`}
    >
      <td className="border border-surface-200 px-1 py-1 text-center text-surface-500" style={cellStyle}>
        <QuoteRowIndexCell
          itemKey={itemKey}
          label={rowIndex + 1}
          readOnly={readOnly}
          selected={selected}
          onToggle={onToggleItemSelection}
          onItemPointerDown={(event) => onItemPointerDown(event, index)}
        />
      </td>
      <td className="border border-surface-200 p-0" style={cellStyle}>
        {showSpace ? (
          <SpaceSelectCell value={inferItemSpace(item)} options={spaceOptions} onChange={(space) => handleChange({ space })} readOnly={readOnly} />
        ) : (
          <input
            value={inferItemSpace(item)}
            readOnly={readOnly}
            onChange={(event) => handleChange({ space: event.target.value })}
            onKeyDown={handleQuoteCellKeyDown}
            className="quote-cell-editable quote-cell-input text-center font-medium"
            placeholder="类别"
          />
        )}
      </td>
      <td className="border border-surface-200 p-0 align-middle" style={cellStyle}>
        <QuoteNameTextarea value={item.name} onChange={(value) => handleChange({ name: value })} className="text-center font-medium" readOnly={readOnly} special={isSpecialQuoteItem(item)} highlight={findReplaceHighlight?.field === "name" ? findReplaceHighlight : null} />
      </td>
      <td className="border border-surface-200 p-0" style={cellStyle}>
        <QuoteNumberInput value={item.material_cost || 0} onChange={(value) => handleChange({ material_cost: value })} className="text-center" disabled={readOnly} />
      </td>
      <td className="border border-surface-200 px-1 py-1 text-center font-semibold text-surface-500" style={cellStyle}>×</td>
      <td className="border border-surface-200 p-0" style={cellStyle}>
        <QuoteNumberInput value={item.labor_cost || 0} onChange={(value) => handleChange({ labor_cost: value })} className="text-center" disabled={readOnly} />
      </td>
      <td className="border border-surface-200 px-1 py-1 text-center font-semibold text-surface-500" style={cellStyle}>×</td>
      <td className="border border-surface-200 p-0" style={cellStyle}>
        <QuoteNumberInput value={item.profit_margin || 0} onChange={(value) => handleChange({ profit_margin: value })} className="text-center" disabled={readOnly} />
      </td>
      <td className="border border-surface-200 p-0" style={cellStyle}>
        <QuoteNumberInput value={item.quantity} onChange={(value) => handleChange({ quantity: value })} className="text-center font-semibold text-red-600" disabled={readOnly} allowFormula />
      </td>
      <td className="border border-surface-200 px-2 py-1 text-center font-semibold text-red-600" style={cellStyle}>{formatQuoteAmount(area)}</td>
      <td className="border border-surface-200 p-0" style={cellStyle}>
        <QuoteNumberInput value={item.unit_price} onChange={(value) => handleChange({ unit_price: value })} className="text-center" disabled={readOnly} />
      </td>
      <td className="border border-surface-200 px-2 py-1 text-center font-semibold text-red-600" style={cellStyle}>{formatQuoteAmount(itemTotal)}</td>
      <td className="border border-surface-200 p-0 align-middle" style={cellStyle}>
        <QuoteDescriptionCell
          value={item.remark || ""}
          readOnly={readOnly}
          label="备注"
          emptyText="点击填写备注"
          placeholder="填写备注..."
          onChange={(value) => handleChange({ remark: value })}
          highlight={findReplaceHighlight?.field === "remark" ? findReplaceHighlight : null}
        />
      </td>
    </tr>
  );
});


function CustomCabinetQuoteTable({ items, showSpace, spaceOptions, emptyText, draggingItemIndex, dragOverItem, recentlyMovedItemKey, activeFindReplaceHighlight, onChange, onOpenRowMenu, selectedItemKeys, onToggleItemSelection, onToggleAllItemSelection, readOnly, onItemPointerDown }: {
  items: { item: QuotationItem; index: number }[];
  showSpace?: boolean;
  spaceOptions: string[];
  emptyText: string;
  draggingItemIndex: number | null;
  dragOverItem: DragOverItemState;
  recentlyMovedItemKey: string | null;
  activeFindReplaceHighlight?: FindReplaceActiveHighlight | null;
  onChange: (index: number, patch: Partial<QuotationItem>) => void;
  onOpenRowMenu: RowMenuOpenHandler;
  selectedItemKeys: Set<string>;
  onToggleItemSelection: (key: string) => void;
  onToggleAllItemSelection: (keys: string[]) => void;
  readOnly?: boolean;
  onItemPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, index: number) => void;
}) {
  const total = useMemo(() => items.reduce((sum, { item }) => sum + getBaseOrMaterialItemTotal(item), 0), [items]);
  const itemKeys = useMemo(() => items.map(({ item, index }) => getQuotationItemKey(item, index)), [items]);

  return (
    <ThinScrollArea className="quote-table-shell" scrollClassName="quote-table-freeze-scroll">
      <table className="w-full min-w-[1430px] border-collapse text-sm">
        <thead className="bg-surface-50 text-center text-xs font-semibold text-surface-600">
          <tr>
            <QuoteIndexHeaderCell rowSpan={2} itemKeys={itemKeys} selectedItemKeys={selectedItemKeys} readOnly={readOnly} onToggleAll={onToggleAllItemSelection} />
            <th rowSpan={2} className="w-28 border border-surface-200 px-3 py-1.5">类别</th>
            <th rowSpan={2} className="w-52 border border-surface-200 px-3 py-1.5">名称</th>
            <th colSpan={5} className="border border-surface-200 px-2 py-1.5">H高×W宽×D深（mm）</th>
            <th rowSpan={2} className="w-36 border border-surface-200 px-2 py-1.5">数量</th>
            <th rowSpan={2} className="w-24 border border-surface-200 px-2 py-1.5">平方</th>
            <th rowSpan={2} className="w-24 border border-surface-200 px-2 py-1.5">单价</th>
            <th rowSpan={2} className="w-28 border border-surface-200 px-2 py-1.5">金额</th>
            <th rowSpan={2} className="w-60 border border-surface-200 px-3 py-1.5">备注</th>
          </tr>
          <tr>
            <th className="w-24 border border-surface-200 px-2 py-1.5">H高</th>
            <th className="w-8 border border-surface-200 px-1 py-1.5">×</th>
            <th className="w-24 border border-surface-200 px-2 py-1.5">W宽</th>
            <th className="w-8 border border-surface-200 px-1 py-1.5">×</th>
            <th className="w-24 border border-surface-200 px-2 py-1.5">D深</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ item, index }, rowIndex) => {
            const itemKey = getQuotationItemKey(item, index);
            return (
              <QuoteCabinetRow
                key={itemKey}
                item={item}
                index={index}
                rowIndex={rowIndex}
                showSpace={showSpace}
                spaceOptions={spaceOptions}
                readOnly={readOnly}
                onChange={onChange}
                onOpenRowMenu={onOpenRowMenu}
                selected={selectedItemKeys.has(itemKey)}
                onToggleItemSelection={onToggleItemSelection}
                onItemPointerDown={onItemPointerDown}
                isDragging={draggingItemIndex === index}
                dropBefore={dragOverItem?.index === index && dragOverItem.position === "before"}
                dropAfter={dragOverItem?.index === index && dragOverItem.position === "after"}
                recentlyMoved={recentlyMovedItemKey === itemKey}
                findReplaceHighlight={activeFindReplaceHighlight?.itemKey === itemKey ? activeFindReplaceHighlight : null}
              />
            );
          })}
          {items.length === 0 && (
            <tr className="quote-empty-row">
              <td colSpan={13} className="quote-empty-cell border border-surface-200 px-4 py-0 text-center">
                <div className="quote-empty-state">
                  <p className="text-sm font-semibold text-[#34445a]">{emptyText}</p>
                  <p className="mt-1 text-xs leading-5 text-[#7c8aa0]">添加项目后，将在这里显示尺寸、数量、单价和备注。</p>
                </div>
              </td>
            </tr>
          )}
          {items.length > 0 && (
            <tr className="bg-surface-50 font-semibold text-surface-900">
              <td className="border border-surface-200 px-2 py-3 text-center" colSpan={11}>小计</td>
              <td className="border border-surface-200 px-2 py-3 text-center text-red-600">{formatQuoteAmount(total)}</td>
              <td className="border border-surface-200 px-2 py-3"></td>
            </tr>
          )}
        </tbody>
      </table>
    </ThinScrollArea>
  );
}

function SimpleQuoteTable({ items, otherFeeRows, showSpace, editableSpace, spaceOptions, isOtherFees, baseAmount, materialAmount, feeFormulaContext, emptyText, draggingItemIndex, dragOverItem, recentlyMovedItemKey, activeFindReplaceHighlight, onChange, onOpenRowMenu, selectedItemKeys, onToggleItemSelection, onToggleAllItemSelection, readOnly, onItemPointerDown }: {
  items: { item: QuotationItem; index: number }[];
  otherFeeRows: { item: QuotationItem; index: number }[];
  showSpace?: boolean;
  editableSpace?: boolean;
  spaceOptions: string[];
  isOtherFees?: boolean;
  baseAmount: number;
  materialAmount: number;
  feeFormulaContext?: FeeFormulaContext;
  emptyText: string;
  draggingItemIndex: number | null;
  dragOverItem: DragOverItemState;
  recentlyMovedItemKey: string | null;
  activeFindReplaceHighlight?: FindReplaceActiveHighlight | null;
  onChange: (index: number, patch: Partial<QuotationItem>) => void;
  onOpenRowMenu: RowMenuOpenHandler;
  selectedItemKeys: Set<string>;
  onToggleItemSelection: (key: string) => void;
  onToggleAllItemSelection: (keys: string[]) => void;
  readOnly?: boolean;
  onItemPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, index: number) => void;
}) {
  const otherFeeRowMeta = useMemo(() => {
    const meta = new Map<number, { sequence: string; total: number; error: string }>();
    const otherFeeDetails = calculateOtherFeeDetails(otherFeeRows.map(({ item }) => item), baseAmount, materialAmount, feeFormulaContext);
    otherFeeRows.forEach(({ index }, rowIndex) => {
      const sequence = formatAlphaSequence(rowIndex);
      const detail = otherFeeDetails[rowIndex] || { total: 0, error: "" };
      meta.set(index, { sequence, total: detail.total, error: detail.error });
    });
    return meta;
  }, [baseAmount, feeFormulaContext, materialAmount, otherFeeRows]);
  const visibleSubtotal = useMemo(
    () => isOtherFees
      ? items.reduce((sum, { index }) => sum + (otherFeeRowMeta.get(index)?.total || 0), 0)
      : items.reduce((sum, { item }) => sum + getItemTotal(item, baseAmount, materialAmount, feeFormulaContext), 0),
    [baseAmount, feeFormulaContext, isOtherFees, items, materialAmount, otherFeeRowMeta],
  );
  const itemKeys = useMemo(() => items.map(({ item, index }) => getQuotationItemKey(item, index)), [items]);

  return (
    <ThinScrollArea className="quote-table-shell" scrollClassName={`quote-table-freeze-scroll ${isOtherFees ? "pb-2" : ""}`}>
      <table className={`${isOtherFees ? "w-full text-sm" : "w-full border-collapse text-sm"} ${isOtherFees ? "min-w-[1220px]" : showSpace ? "min-w-[1430px]" : "min-w-[1310px]"}`}>
        <thead className={`bg-surface-50 text-xs text-surface-500 ${isOtherFees ? "text-left" : "text-center font-semibold text-surface-600"}`}>
          <tr>
            {isOtherFees ? (
              <QuoteIndexHeaderCell bordered={false} itemKeys={itemKeys} selectedItemKeys={selectedItemKeys} readOnly={readOnly} onToggleAll={onToggleAllItemSelection} />
            ) : (
              <QuoteIndexHeaderCell itemKeys={itemKeys} selectedItemKeys={selectedItemKeys} readOnly={readOnly} onToggleAll={onToggleAllItemSelection} />
            )}
            {showSpace && <th className={`${isOtherFees ? "" : "border border-surface-200"} w-32 px-4 py-1.5`}>空间/类别</th>}
            <th className={`${isOtherFees ? "w-36" : "w-44 border border-surface-200"} px-4 py-1.5`}>{isOtherFees ? "费用名称" : "材料名称"}</th>
            {!isOtherFees && (
              <>
                <th className="w-40 border border-surface-200 py-1.5">规格</th>
                <th className="w-36 border border-surface-200 py-1.5">型号</th>
              </>
            )}
            {isOtherFees ? (
              <>
                <th className="w-28 py-1.5">计算方式</th>
                <th className="w-36 py-1.5">基础公式</th>
                <th className="w-24 py-1.5">金额/比例</th>
                <th className="w-48 py-1.5">公式</th>
              </>
            ) : (
              <>
                <th className="w-20 border border-surface-200 py-1.5">单位</th>
                <th className="w-28 border border-surface-200 py-1.5">单价</th>
                <th className="w-40 border border-surface-200 py-1.5">数量</th>
              </>
            )}
            <th className={`${isOtherFees ? "w-32" : "w-28 border border-surface-200"} py-1.5`}>小计</th>
            {!isOtherFees && <th className="w-52 border border-surface-200 py-1.5">备注</th>}
            {isOtherFees && <th className="w-72 py-1.5">规则/说明</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {items.map(({ item, index }, rowIndex) => {
            const isDragging = draggingItemIndex === index;
            const dropBefore = dragOverItem?.index === index && dragOverItem.position === "before";
            const dropAfter = dragOverItem?.index === index && dragOverItem.position === "after";
            const itemKey = getQuotationItemKey(item, index);
            const recentlyMoved = recentlyMovedItemKey === itemKey;
            const findReplaceHighlight = activeFindReplaceHighlight?.itemKey === itemKey ? activeFindReplaceHighlight : null;
            const rowColor = getQuotationRowColor(item.row_color);
            const cellStyle = rowColor.background ? { backgroundColor: rowColor.background } : undefined;
            const feeMethod = normalizeFeeCalcMethod(item.fee_calc_method);
            const feeMeta = otherFeeRowMeta.get(index);
            const feeTotal = isOtherFees ? feeMeta?.total || 0 : getItemTotal(item, baseAmount, materialAmount, feeFormulaContext);
            const feeBaseError = isOtherFees ? feeMeta?.error || "" : "";
            return (
              <tr
                key={itemKey}
                data-quote-item-row
                data-item-key={itemKey}
                data-index={index}
                onContextMenu={readOnly ? undefined : (event) => onOpenRowMenu(event, index)}
                className={`quote-item-row align-middle transition ${isDragging ? "opacity-45" : ""} ${recentlyMoved ? "quote-item-row-moved" : ""} ${dropBefore ? "quote-item-row-drop-before border-t-2 border-t-primary-500" : ""} ${dropAfter ? "quote-item-row-drop-after border-b-2 border-b-primary-500" : ""}`}
              >
                <td className={`${isOtherFees ? "" : "border border-surface-200 text-surface-500"} px-1 py-1 text-center`} style={cellStyle}>
                  <QuoteRowIndexCell
                    itemKey={itemKey}
                    label={isOtherFees ? feeMeta?.sequence || formatAlphaSequence(rowIndex) : rowIndex + 1}
                    readOnly={readOnly}
                    selected={selectedItemKeys.has(itemKey)}
                    onToggle={onToggleItemSelection}
                    onItemPointerDown={(event) => onItemPointerDown(event, index)}
                  />
                </td>
                {showSpace && (
                  <td className={`${isOtherFees ? "" : "border border-surface-200"} ${editableSpace ? "p-0" : "px-4 py-1"} text-center text-sm font-medium text-surface-600`} style={cellStyle}>
                    {editableSpace ? (
                      <SpaceSelectCell value={inferItemSpace(item)} options={spaceOptions} onChange={(space) => onChange(index, { space })} readOnly={readOnly} />
                    ) : (
                      inferItemSpace(item)
                    )}
                  </td>
                )}
                <td className={`${isOtherFees ? "w-36" : "border border-surface-200"} px-0 py-0 align-middle`} style={cellStyle}>
                  <QuoteNameTextarea value={item.name} onChange={(value) => onChange(index, { name: value })} className="px-4 text-center font-medium" readOnly={readOnly} special={isSpecialQuoteItem(item)} highlight={findReplaceHighlight?.field === "name" ? findReplaceHighlight : null} />
                </td>
                {!isOtherFees && (
                  <>
                    <td className="border border-surface-200 p-0 align-middle" style={cellStyle}>
                      <QuoteCenteredSpecTextarea
                        value={isMainMaterialCategory(item.category) ? normalizeProductSpecOnly(item.spec) : item.spec || ""}
                        readOnly={readOnly}
                        onChange={(value) => onChange(index, { spec: value })}
                        placeholder="规格"
                      />
                    </td>
                    <td className="border border-surface-200 py-0" style={cellStyle}><input value={item.material_model || ""} readOnly={readOnly} onChange={(event) => onChange(index, { material_model: event.target.value })} onKeyDown={handleQuoteCellKeyDown} className="quote-cell-editable quote-cell-input text-center read-only:cursor-default" placeholder="型号" /></td>
                  </>
                )}
                {isOtherFees ? (
                  <>
	                    <td className="py-0" style={cellStyle}>
	                      <SystemSelect
	                        value={feeMethod}
                          disabled={readOnly}
	                        onChange={(event) => onChange(index, getFeeCalcMethodPatch(event.target.value as FeeCalcMethod, item))}
	                        onKeyDown={handleQuoteCellKeyDown}
	                        className="quote-cell-editable quote-cell-input quote-cell-select quote-fee-method-select w-28"
                          menuClassName="quote-system-select-menu"
                          optionClassName="quote-system-select-option"
	                      >
                        {Object.entries(feeCalcMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </SystemSelect>
                    </td>
	                    <td className="py-0" style={cellStyle}>
	                      <div className="flex min-h-[34px] items-center">
	                        <input
	                          value={feeMethod === "fixed" ? "" : String(item.fee_calc_base ?? "")}
	                          onChange={(event) => onChange(index, { fee_calc_base: event.target.value as FeeCalcBase })}
	                          disabled={readOnly || feeMethod === "fixed"}
	                          onKeyDown={handleQuoteCellKeyDown}
	                          aria-invalid={!!feeBaseError}
	                          className={`quote-cell-editable quote-cell-input min-w-0 flex-1 disabled:text-surface-300 ${feeBaseError ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-400" : ""}`}
	                          placeholder={feeMethod === "fixed" ? "" : "如 直接费 或 A+B"}
	                          title={feeBaseError || (feeMethod === "fixed" ? "" : "可输入 直接费、基装、产品、A+B、(直接费+A) 等")}
	                        />
	                        {feeMethod === "reference" && <FeeFormulaHelp />}
	                      </div>
                        {feeBaseError && <div className="px-3 pb-1 text-xs font-medium text-red-600">{feeBaseError}</div>}
	                    </td>
                    <td className="py-0" style={cellStyle}>
                      <QuoteNumberInput
                        value={feeMethod === "percent" ? item.fee_rate || 0 : item.unit_price}
                        onChange={(value) => {
                          onChange(index, feeMethod === "percent" ? { fee_rate: value, quantity: 1 } : { unit_price: value, quantity: 1 });
                        }}
	                        disabled={readOnly || feeMethod === "reference"}
	                        emptyWhenDisabled={feeMethod === "reference"}
	                        className="w-24 font-semibold text-red-600"
	                      />
                    </td>
                    <td className={`py-1 text-xs font-medium ${feeBaseError ? "text-red-600" : "text-surface-500"}`} style={cellStyle}>{feeBaseError ? "无法计算" : getFeeFormulaText(item)}</td>
                  </>
                ) : (
                  <>
                    <td className="border border-surface-200 py-0" style={cellStyle}><UnitInputCell value={item.unit} onChange={(value) => onChange(index, { unit: value })} className="w-20 text-center" readOnly={readOnly} /></td>
                    <td className="border border-surface-200 py-0" style={cellStyle}><QuoteNumberInput value={item.unit_price} onChange={(value) => onChange(index, { unit_price: value })} className="w-28 text-center" disabled={readOnly} /></td>
                    <td className="border border-surface-200 py-0" style={cellStyle}><QuoteNumberInput value={item.quantity} onChange={(value) => onChange(index, { quantity: value })} className="w-40 text-center font-semibold text-red-600" disabled={readOnly} allowFormula /></td>
                  </>
                )}
                <td className={`${isOtherFees ? "" : "border border-surface-200 text-center"} py-1 font-semibold text-red-600`} style={cellStyle}>{feeBaseError ? "-" : formatQuoteAmount(feeTotal)}</td>
                {!isOtherFees && (
                  <td className="border border-surface-200 p-0 align-middle" style={cellStyle}>
                    <QuoteDescriptionCell
                      value={item.remark || ""}
                      readOnly={readOnly}
                      label="备注"
                      emptyText="点击填写备注"
	                      placeholder="填写备注..."
	                      onChange={(value) => onChange(index, { remark: value })}
	                      highlight={findReplaceHighlight?.field === "remark" ? findReplaceHighlight : null}
	                    />
                  </td>
                )}
                {isOtherFees && (
                  <td className="py-1 pr-3 text-xs font-medium leading-5 text-surface-500" style={cellStyle}>
                    {feeBaseError || item.remark || getFeeRuleText(item, feeTotal, { currencySymbol: false, useGrouping: false }, feeFormulaContext)}
                  </td>
                )}
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr className="quote-empty-row">
              <td colSpan={isOtherFees ? 8 : showSpace ? 10 : 9} className={`quote-empty-cell ${isOtherFees ? "" : "border border-surface-200"} px-4 py-0 text-center`}>
                <div className="quote-empty-state">
                  <p className="text-sm font-semibold text-[#34445a]">{emptyText}</p>
                  <p className="mt-1 text-xs leading-5 text-[#7c8aa0]">添加项目后，将在这里显示单价、数量、小计和备注。</p>
                </div>
              </td>
            </tr>
          )}
          {!isOtherFees && items.length > 0 && (
            <tr className="bg-surface-50 font-semibold text-surface-900">
              <td className="border border-surface-200 px-2 py-3 text-center" colSpan={showSpace ? 8 : 7}>小计</td>
              <td className="border border-surface-200 py-3 text-center font-semibold text-red-600">{formatQuoteAmount(visibleSubtotal)}</td>
              <td className="border border-surface-200 py-3"></td>
            </tr>
          )}
        </tbody>
      </table>
    </ThinScrollArea>
  );
}
