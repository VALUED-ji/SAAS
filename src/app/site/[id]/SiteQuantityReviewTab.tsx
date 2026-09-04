"use client";

import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { ChevronRight, Download, FilePlus2, GripVertical, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import { QUOTA_LIBRARY_STORAGE_KEY, normalizeQuotaItem, type QuotaItem } from "@/app/quota/library/quota-library-shared";
import { calculateOtherFeeTotals, getFeeRuleText, type FeeFormulaContext, type FormulaFeeItem } from "@/lib/quotationFeeFormulas";
import { formatPlainAmount, roundMoney } from "./site-detail-shared";
import styles from "./site-quantity-review.module.css";

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

type Props = {
  project: any;
  quotationItems: any[];
  reviews: any[];
  currentPhaseKey: string;
  saving: boolean;
  disabled: boolean;
  onCreate: (payload: { title: string; phase: string; evidence_note: string; items: QuantityReviewLine[] }) => Promise<{ id?: string; review_no?: string; success?: boolean } | void>;
};

type QuotaLibraryOption = Pick<QuotaItem, "id" | "code" | "category" | "name" | "constructionDescription" | "unit" | "laborPrice" | "materialPrice" | "status"> & {
  source: "standard" | "custom";
  sourceLabel: string;
};

type ManualLineMode = "library" | "manual";
type StructureDialogMode = "space" | "category";
type ReviewRowDragState = { space: string; rowKey: string } | null;
type ReviewRowDropState = { space: string; rowKey: string; position: "before" | "after" } | null;

const quotationCategoryLabels: Record<string, string> = {
  base: "基装",
  main_material: "主材",
  other: "综合费用",
};

function toNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getSpaceName(value: unknown) {
  return String(value || "").trim() || "未分空间";
}

function getQuotationCategoryLabel(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  return quotationCategoryLabels[raw.toLowerCase()] || raw;
}

function isComprehensiveFeeItem(item: any) {
  const rawCategory = String(item?.category || "").trim().toLowerCase();
  const categoryLabel = getQuotationCategoryLabel(item?.category);
  return rawCategory === "other" || categoryLabel === "综合费用";
}

function getQuotationOriginalAmount(item: any) {
  const totalPrice = Number(item?.total_price ?? item?.totalPrice);
  if (Number.isFinite(totalPrice) && totalPrice > 0) return roundMoney(totalPrice);
  const quantity = toNumber(item?.quantity || 1) || 1;
  const unitPrice = toNumber(item?.unit_price ?? item?.unitPrice);
  return roundMoney(quantity * unitPrice);
}

function getQuotationUnitPrice(item: any) {
  const unitPrice = Number(item?.unit_price ?? item?.unitPrice);
  if (Number.isFinite(unitPrice) && unitPrice > 0) return unitPrice;
  const laborUnitPrice = toNumber(item?.labor_cost ?? item?.laborUnitPrice);
  const materialUnitPrice = toNumber(item?.material_cost ?? item?.materialUnitPrice);
  if (laborUnitPrice || materialUnitPrice) return roundMoney(laborUnitPrice + materialUnitPrice);
  const quantity = toNumber(item?.quantity);
  return quantity > 0 ? roundMoney(getQuotationOriginalAmount(item) / quantity) : 0;
}

function isBaseCategory(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  const label = getQuotationCategoryLabel(value);
  return raw === "base" || label === "基装";
}

function isMainMaterialCategory(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  const label = getQuotationCategoryLabel(value);
  return raw === "main_material" || label === "主材";
}

function getDirectItemAmount(item: any) {
  const totalPrice = Number(item?.total_price ?? item?.totalPrice);
  if (Number.isFinite(totalPrice)) return roundMoney(totalPrice);
  return roundMoney(toNumber(item?.quantity) * getQuotationUnitPrice(item));
}

function getLineDiff(line: QuantityReviewLine | any) {
  const budgetQuantity = toNumber(line.budget_quantity);
  const actualQuantity = toNumber(line.actual_quantity);
  const laborUnitPrice = toNumber(line.labor_unit_price ?? line.laborUnitPrice);
  const materialUnitPrice = toNumber(line.material_unit_price ?? line.materialUnitPrice);
  const unitPrice = laborUnitPrice || materialUnitPrice ? roundMoney(laborUnitPrice + materialUnitPrice) : toNumber(line.unit_price);
  const diffQuantity = roundMoney(actualQuantity - budgetQuantity);
  const laborSignedAmount = roundMoney(diffQuantity * laborUnitPrice);
  const materialSignedAmount = roundMoney(diffQuantity * materialUnitPrice);
  const signedAmount = roundMoney(diffQuantity * unitPrice);
  return {
    diffQuantity,
    laborSignedAmount,
    materialSignedAmount,
    signedAmount,
    amount: Math.abs(signedAmount),
    type: signedAmount > 0 ? "ADD" : signedAmount < 0 ? "DEDUCT" : "NONE",
  };
}

function getAmountTone(value: unknown) {
  const amount = roundMoney(toNumber(value));
  if (amount > 0) return "add";
  if (amount < 0) return "deduct";
  return "none";
}

function formatSignedAmount(value: unknown) {
  const amount = roundMoney(toNumber(value));
  return `${amount < 0 ? "-" : ""}${formatPlainAmount(Math.abs(amount))}`;
}

function formatSignedQuantity(value: unknown, unit?: string) {
  const quantity = roundMoney(toNumber(value));
  const text = new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(quantity));
  return `${quantity < 0 ? "-" : ""}${text}${unit || ""}`;
}

function toSafeFileName(value: unknown) {
  return String(value || "工程量复核")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "工程量复核";
}

function getExcelTextWidth(value: unknown) {
  const text = String(value ?? "");
  return text.split(/\r?\n/).reduce((max, part) => {
    const width = Array.from(part).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
    return Math.max(max, width);
  }, 0);
}

function loadStandardQuotaOptions(): QuotaLibraryOption[] {
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

function makeManualClientKey() {
  return `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function makeManualLine(space: string, phase: string): QuantityReviewLine {
  const clientKey = makeManualClientKey();
  return {
    source_type: "MANUAL",
    quotation_item_id: clientKey,
    title: "",
    category: "",
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
    client_key: clientKey,
  };
}

function applyQuotaToManualLine(line: QuantityReviewLine, quota?: QuotaLibraryOption): QuantityReviewLine {
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
    unit_price: String(roundMoney(toNumber(laborUnitPrice) + toNumber(materialUnitPrice))),
  };
}

function getQuotaSearchText(quota: QuotaLibraryOption) {
  return [
    quota.sourceLabel,
    quota.code,
    quota.category,
    quota.name,
    quota.constructionDescription,
    quota.unit,
  ].join(" ").toLowerCase();
}

function makeBudgetLine(item: any, actualQuantity: string, evidenceNote: string, phase: string, titleOverride?: string, displayOrder?: number): QuantityReviewLine {
  return {
    source_type: "BUDGET",
    quotation_item_id: String(item.id || ""),
    title: String(titleOverride || item.name || "").trim(),
    category: getQuotationCategoryLabel(item.category),
    space: getSpaceName(item.space),
    phase,
    description: String(item.spec || item.remark || "").trim(),
    unit: String(item.unit || "项").trim() || "项",
    budget_quantity: String(item.quantity ?? ""),
    actual_quantity: actualQuantity,
    labor_unit_price: String(item.labor_cost ?? ""),
    material_unit_price: String(item.material_cost ?? ""),
    unit_price: String(item.unit_price ?? item.unitPrice ?? roundMoney(toNumber(item.labor_cost) + toNumber(item.material_cost)) ?? ""),
    evidence_note: evidenceNote,
    display_order: displayOrder,
  };
}

function makeComprehensiveFeeLine(item: any, actualAmount: string | number, evidenceNote: string, phase: string, discountAmount?: string | number): QuantityReviewLine {
  const descriptionParts = [
    String(item.spec || item.remark || "").trim(),
    String(item.fee_rule_text || "").trim() ? `计算规则：${String(item.fee_rule_text || "").trim()}` : "",
  ].filter(Boolean);
  return {
    source_type: "BUDGET",
    quotation_item_id: String(item.id || ""),
    title: String(item.name || "").trim(),
    category: "综合费用",
    space: "综合费用",
    phase,
    description: descriptionParts.join("；"),
    unit: "元",
    budget_quantity: String(getQuotationOriginalAmount(item)),
    actual_quantity: String(actualAmount),
    labor_unit_price: "",
    material_unit_price: "",
    unit_price: "1",
    evidence_note: evidenceNote,
    discount_amount: discountAmount === undefined ? undefined : String(discountAmount),
  };
}

function lineIsSubmittable(line: QuantityReviewLine) {
  return Boolean(line.title.trim()) && String(line.actual_quantity).trim() !== "";
}

function parseQuantityReviewItems(review: any) {
  if (Array.isArray(review?.items)) return review.items;
  try {
    const parsed = JSON.parse(String(review?.items || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getSavedManualLineKey(line: any) {
  const clientKey = String(line?.client_key || "").trim();
  if (clientKey) return clientKey;
  const itemId = String(line?.quotation_item_id || "").trim();
  if (itemId) return `manual-id:${itemId}`;
  return [
    "manual-legacy",
    getSpaceName(line?.space),
    String(line?.title || "").trim(),
    String(line?.category || "").trim(),
    String(line?.description || "").trim(),
    String(line?.unit || "项").trim() || "项",
  ].join(":");
}

function getBudgetRowKey(item: any) {
  return `budget:${String(item?.id || item?.client_key || item?.name || "").trim()}`;
}

function getSavedManualRowKey(line: any) {
  return `saved-manual:${String(line?.savedKey || getSavedManualLineKey(line))}`;
}

function getManualDraftRowKey(line: QuantityReviewLine, index: number) {
  return `manual-draft:${line.client_key || line.quotation_item_id || index}`;
}

function getDropPosition(event: DragEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function sortRowsByDisplayOrder<T extends { rowKey: string; displayOrder?: number }>(rows: T[], order?: string[]) {
  if (order && order.length > 0) {
    const indexMap = new Map(order.map((key, index) => [key, index]));
    return rows.slice().sort((a, b) => {
      const aIndex = indexMap.has(a.rowKey) ? indexMap.get(a.rowKey)! : Number.MAX_SAFE_INTEGER;
      const bIndex = indexMap.has(b.rowKey) ? indexMap.get(b.rowKey)! : Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return rows.indexOf(a) - rows.indexOf(b);
    });
  }
  return rows.slice().sort((a, b) => {
    const aOrder = Number.isFinite(a.displayOrder) ? Number(a.displayOrder) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.displayOrder) ? Number(b.displayOrder) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return rows.indexOf(a) - rows.indexOf(b);
  });
}

function buildActualFeeFormulaData(
  regularQuotationItems: any[],
  actualQtyByItemId: Record<string, string>,
  manualLinesBySpace: Record<string, QuantityReviewLine[]>,
) {
  const directItems: FormulaFeeItem[] = [
    ...regularQuotationItems.map((item) => {
      const itemId = String(item.id || "");
      const actualQuantityText = actualQtyByItemId[itemId];
      const quantity = actualQuantityText !== undefined && String(actualQuantityText).trim() !== ""
        ? toNumber(actualQuantityText)
        : toNumber(item.quantity);
      const unitPrice = getQuotationUnitPrice(item);
      return {
        category: String(item.category || ""),
        name: String(item.name || ""),
        quantity,
        unit_price: unitPrice,
        total_price: roundMoney(quantity * unitPrice),
      };
    }),
    ...Object.values(manualLinesBySpace).flat().filter(lineIsSubmittable).map((line) => {
      const unitPrice = toNumber(line.unit_price) || roundMoney(toNumber(line.labor_unit_price) + toNumber(line.material_unit_price));
      const quantity = toNumber(line.actual_quantity);
      return {
        category: line.category || "base",
        name: line.title,
        quantity,
        unit_price: unitPrice,
        total_price: roundMoney(quantity * unitPrice),
      };
    }),
  ];
  const baseAmount = directItems
    .filter((item) => isBaseCategory(item.category))
    .reduce((sum, item) => sum + getDirectItemAmount(item), 0);
  const mainMaterialAmount = directItems
    .filter((item) => isMainMaterialCategory(item.category))
    .reduce((sum, item) => sum + getDirectItemAmount(item), 0);
  const categoryAmounts: Record<string, number> = {};
  directItems.forEach((item) => {
    if (isBaseCategory(item.category) || isMainMaterialCategory(item.category) || isComprehensiveFeeItem(item)) return;
    const label = getQuotationCategoryLabel(item.category);
    categoryAmounts[label] = roundMoney(toNumber(categoryAmounts[label]) + getDirectItemAmount(item));
  });
  const customCategoryAmount = Object.values(categoryAmounts).reduce((sum, amount) => sum + toNumber(amount), 0);
  const directBaseAmount = mainMaterialAmount + customCategoryAmount;
  const context: FeeFormulaContext = {
    mainMaterialAmount,
    directItemAmount: directBaseAmount,
    categoryAmounts,
  };
  return { baseAmount, directBaseAmount, context };
}

export default function SiteQuantityReviewTab({
  project,
  quotationItems,
  reviews,
  currentPhaseKey,
  saving,
  disabled,
  onCreate,
}: Props) {
  const phase = currentPhaseKey || "";
  const [collapsedSpaces, setCollapsedSpaces] = useState<Record<string, boolean>>({});
  const [actualQtyByItemId, setActualQtyByItemId] = useState<Record<string, string>>({});
  const [evidenceByItemId, setEvidenceByItemId] = useState<Record<string, string>>({});
  const [feeTotalDiscountAmount, setFeeTotalDiscountAmount] = useState<string | null>(null);
  const [budgetAliasByItemId, setBudgetAliasByItemId] = useState<Record<string, string>>({});
  const [customSpaces, setCustomSpaces] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [structureDialogOpen, setStructureDialogOpen] = useState(false);
  const [structureDialogMode, setStructureDialogMode] = useState<StructureDialogMode>("space");
  const [structureDraftName, setStructureDraftName] = useState("");
  const [rowOrderBySpace, setRowOrderBySpace] = useState<Record<string, string[]>>({});
  const [draggingReviewRow, setDraggingReviewRow] = useState<ReviewRowDragState>(null);
  const [dragOverReviewRow, setDragOverReviewRow] = useState<ReviewRowDropState>(null);
  const [recentlyMovedRowKey, setRecentlyMovedRowKey] = useState<string | null>(null);
  const [manualLinesBySpace, setManualLinesBySpace] = useState<Record<string, QuantityReviewLine[]>>({});
  const [quotaOptions, setQuotaOptions] = useState<QuotaLibraryOption[]>([]);
  const [manualDialogSpace, setManualDialogSpace] = useState<string | null>(null);
  const [manualDialogMode, setManualDialogMode] = useState<ManualLineMode>("library");
  const [manualDialogSearch, setManualDialogSearch] = useState("");
  const [selectedQuotaIds, setSelectedQuotaIds] = useState<string[]>([]);
  const [manualDraft, setManualDraft] = useState<QuantityReviewLine>(() => makeManualLine("", currentPhaseKey || ""));
  const [savedManualEdits, setSavedManualEdits] = useState<Record<string, { title?: string; actual_quantity?: string; evidence_note?: string }>>({});
  const [saveNotice, setSaveNotice] = useState<{ tone: "success" | "danger" | "muted"; text: string } | null>(null);
  const [exportingReviewTable, setExportingReviewTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const standardOptions = loadStandardQuotaOptions();
    setQuotaOptions(standardOptions);
    fetch("/api/quota/custom-library?status=active")
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((data) => {
        if (cancelled) return;
        const customOptions = (Array.isArray(data?.items) ? data.items : [])
          .filter((item: any) => item?.name && item?.status !== "disabled")
          .map((item: any): QuotaLibraryOption => ({
            id: String(item.id || ""),
            code: String(item.code || ""),
            category: String(item.category || "未分类"),
            name: String(item.name || ""),
            constructionDescription: String(item.constructionDescription || ""),
            unit: String(item.unit || "项"),
            laborPrice: toNumber(item.laborPrice),
            materialPrice: toNumber(item.materialPrice),
            status: item.status === "disabled" ? "disabled" : "enabled",
            source: "custom",
            sourceLabel: "自定义库",
          }));
        setQuotaOptions([...standardOptions, ...customOptions]);
      })
      .catch(() => {
        if (!cancelled) setQuotaOptions(standardOptions);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const regularQuotationItems = useMemo(() => {
    return quotationItems
      .filter((item) => String(item.name || "").trim())
      .filter((item) => !isComprehensiveFeeItem(item));
  }, [quotationItems]);

  const budgetSpaces = useMemo(() => {
    const map = new Map<string, any[]>();
    regularQuotationItems.forEach((item) => {
        const space = getSpaceName(item.space);
        const list = map.get(space) || [];
        list.push(item);
        map.set(space, list);
      });
    return Array.from(map.entries()).map(([space, items]) => ({
      space,
      items: items.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    }));
  }, [regularQuotationItems]);

  const comprehensiveFeeItems = useMemo(() => {
    return quotationItems
      .filter((item) => String(item.name || "").trim())
      .filter(isComprehensiveFeeItem)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }, [quotationItems]);

  const savedQuantityByItemId = useMemo(() => {
    const map = new Map<string, { actualQuantity: string; evidenceNote: string; reviewNo: string; title: string; discountAmount: string; displayOrder?: number }>();
    reviews
      .slice()
      .sort((a, b) => {
        const timeCompare = Date.parse(String(b?.created_at || "")) - Date.parse(String(a?.created_at || ""));
        if (Number.isFinite(timeCompare) && timeCompare !== 0) return timeCompare;
        return String(b?.id || "").localeCompare(String(a?.id || ""));
      })
      .filter((review) => String(review?.status || "") !== "CANCELLED")
      .forEach((review) => {
        parseQuantityReviewItems(review).forEach((item: any) => {
          const itemId = String(item?.quotation_item_id || "").trim();
          if (!itemId || map.has(itemId) || String(item?.source_type || "").toUpperCase() === "MANUAL") return;
          map.set(itemId, {
            actualQuantity: String(item?.actual_quantity ?? ""),
            evidenceNote: String(item?.evidence_note || ""),
            reviewNo: String(review?.review_no || "已保存"),
            title: String(item?.title || ""),
            discountAmount: String(item?.discount_amount ?? ""),
            displayOrder: Number.isFinite(Number(item?.display_order)) ? Number(item.display_order) : undefined,
          });
        });
      });
    return map;
  }, [reviews]);

  const savedManualLinesBySpace = useMemo(() => {
    const map = new Map<string, Array<QuantityReviewLine & { reviewNo: string; savedKey: string }>>();
    const seen = new Set<string>();
    reviews
      .slice()
      .sort((a, b) => {
        const timeCompare = Date.parse(String(b?.created_at || "")) - Date.parse(String(a?.created_at || ""));
        if (Number.isFinite(timeCompare) && timeCompare !== 0) return timeCompare;
        return String(b?.id || "").localeCompare(String(a?.id || ""));
      })
      .filter((review) => String(review?.status || "") !== "CANCELLED")
      .forEach((review) => {
        parseQuantityReviewItems(review).forEach((item: any) => {
          if (String(item?.source_type || "").toUpperCase() !== "MANUAL") return;
          const space = getSpaceName(item?.space);
          const savedKey = getSavedManualLineKey({ ...item, space });
          if (seen.has(savedKey)) return;
          seen.add(savedKey);
          const list = map.get(space) || [];
          list.push({
            source_type: "MANUAL",
            quotation_item_id: String(item?.quotation_item_id || ""),
            title: String(item?.title || ""),
            category: String(item?.category || ""),
            space,
            phase: String(item?.phase || ""),
            description: String(item?.description || ""),
            unit: String(item?.unit || "项") || "项",
            budget_quantity: String(item?.budget_quantity ?? 0),
            actual_quantity: String(item?.actual_quantity ?? ""),
            labor_unit_price: String(item?.labor_unit_price ?? ""),
            material_unit_price: String(item?.material_unit_price ?? ""),
            unit_price: String(item?.unit_price ?? ""),
            evidence_note: String(item?.evidence_note || ""),
            client_key: String(item?.client_key || ""),
            display_order: Number.isFinite(Number(item?.display_order)) ? Number(item.display_order) : undefined,
            reviewNo: String(review?.review_no || "已保存"),
            savedKey,
          });
          map.set(space, list);
        });
      });
    return map;
  }, [reviews]);

  const reviewSpaces = useMemo(() => {
    const map = new Map<string, any[]>();
    budgetSpaces.forEach(({ space, items }) => {
      map.set(space, items);
    });
    savedManualLinesBySpace.forEach((_, space) => {
      if (!map.has(space)) map.set(space, []);
    });
    Object.keys(manualLinesBySpace).forEach((space) => {
      if (!map.has(space)) map.set(space, []);
    });
    customSpaces.forEach((space) => {
      const normalizedSpace = getSpaceName(space);
      if (!map.has(normalizedSpace)) map.set(normalizedSpace, []);
    });
    return Array.from(map.entries()).map(([space, items]) => ({ space, items }));
  }, [budgetSpaces, customSpaces, manualLinesBySpace, savedManualLinesBySpace]);

  const categoryOptions = useMemo(() => {
    const names = new Set<string>(["基装", "主材"]);
    regularQuotationItems.forEach((item) => {
      const label = getQuotationCategoryLabel(item.category);
      if (label && label !== "-" && label !== "综合费用") names.add(label);
    });
    savedManualLinesBySpace.forEach((lines) => {
      lines.forEach((line) => {
        const category = String(line.category || "").trim();
        if (category) names.add(category);
      });
    });
    Object.values(manualLinesBySpace).flat().forEach((line) => {
      const category = String(line.category || "").trim();
      if (category) names.add(category);
    });
    customCategories.forEach((category) => {
      const normalizedCategory = String(category || "").trim();
      if (normalizedCategory) names.add(normalizedCategory);
    });
    return Array.from(names);
  }, [customCategories, manualLinesBySpace, regularQuotationItems, savedManualLinesBySpace]);

  const displayOrderByRowKey = useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(rowOrderBySpace).forEach((keys) => {
      keys.forEach((key, index) => {
        map[key] = index;
      });
    });
    return map;
  }, [rowOrderBySpace]);

  const editedSavedManualLines = useMemo(() => {
    const lines: Array<QuantityReviewLine & { reviewNo: string; savedKey: string }> = [];
    Array.from(savedManualLinesBySpace.values())
      .flat()
      .forEach((line) => {
        const edit = savedManualEdits[line.savedKey];
        const displayOrder = displayOrderByRowKey[getSavedManualRowKey(line)];
        const orderChanged = displayOrder !== undefined;
        if (!edit && !orderChanged) return;
        const nextLine = {
          ...line,
          client_key: line.client_key || line.savedKey,
          title: edit?.title ?? line.title,
          actual_quantity: edit?.actual_quantity ?? line.actual_quantity,
          evidence_note: edit?.evidence_note ?? line.evidence_note,
          display_order: displayOrder ?? line.display_order,
        };
        const titleChanged = String(nextLine.title) !== String(line.title);
        const actualChanged = String(nextLine.actual_quantity) !== String(line.actual_quantity);
        const noteChanged = String(nextLine.evidence_note) !== String(line.evidence_note);
        if (titleChanged || actualChanged || noteChanged || orderChanged) lines.push(nextLine);
      });
    return lines;
  }, [displayOrderByRowKey, savedManualEdits, savedManualLinesBySpace]);

  const actualManualLinesBySpace = useMemo(() => {
    const next: Record<string, QuantityReviewLine[]> = {};
    savedManualLinesBySpace.forEach((lines, space) => {
      next[space] = lines.map((line) => {
        const edit = savedManualEdits[line.savedKey];
        return {
          ...line,
          title: edit?.title ?? line.title,
          actual_quantity: edit?.actual_quantity ?? line.actual_quantity,
          evidence_note: edit?.evidence_note ?? line.evidence_note,
        };
      });
    });
    Object.entries(manualLinesBySpace).forEach(([space, lines]) => {
      next[space] = [...(next[space] || []), ...lines];
    });
    return next;
  }, [manualLinesBySpace, savedManualEdits, savedManualLinesBySpace]);

  const actualFeeFormulaData = useMemo(() => {
    return buildActualFeeFormulaData(regularQuotationItems, actualQtyByItemId, actualManualLinesBySpace);
  }, [actualManualLinesBySpace, actualQtyByItemId, regularQuotationItems]);

  const actualFeeAmountByItemId = useMemo(() => {
    if (comprehensiveFeeItems.length === 0) return {};
    const actualTotals = calculateOtherFeeTotals(
      comprehensiveFeeItems.map((item) => ({ ...item, category: "other" })),
      actualFeeFormulaData.baseAmount,
      actualFeeFormulaData.directBaseAmount,
      actualFeeFormulaData.context,
    );
    return comprehensiveFeeItems.reduce<Record<string, number>>((acc, item, index) => {
      acc[String(item.id || "")] = roundMoney(actualTotals[index] ?? getQuotationOriginalAmount(item));
      return acc;
    }, {});
  }, [actualFeeFormulaData, comprehensiveFeeItems]);

  const savedFeeTotalDiscountAmount = useMemo(() => {
    return roundMoney(comprehensiveFeeItems.reduce((sum, item) => {
      const itemId = String(item.id || "");
      return sum + toNumber(savedQuantityByItemId.get(itemId)?.discountAmount);
    }, 0));
  }, [comprehensiveFeeItems, savedQuantityByItemId]);

  const feeGrossActualAmount = useMemo(() => {
    return roundMoney(comprehensiveFeeItems.reduce((sum, item) => {
      const itemId = String(item.id || "");
      return sum + (actualFeeAmountByItemId[itemId] ?? getQuotationOriginalAmount(item));
    }, 0));
  }, [actualFeeAmountByItemId, comprehensiveFeeItems]);

  const feeDiscountInputValue = feeTotalDiscountAmount ?? (savedFeeTotalDiscountAmount > 0 ? String(savedFeeTotalDiscountAmount) : "");
  const feeTotalDiscountTouched = feeTotalDiscountAmount !== null;
  const feeTotalDiscount = roundMoney(Math.min(Math.max(0, toNumber(feeDiscountInputValue)), Math.max(0, feeGrossActualAmount)));
  const feeDiscountWasClamped = feeTotalDiscount > 0 && feeTotalDiscount !== toNumber(feeDiscountInputValue);

  const feeDiscountAmountByItemId = useMemo(() => {
    let remainingDiscount = feeTotalDiscount;
    return comprehensiveFeeItems.reduce<Record<string, number>>((acc, item) => {
      const itemId = String(item.id || "");
      const formulaAmount = Math.max(0, actualFeeAmountByItemId[itemId] ?? getQuotationOriginalAmount(item));
      const itemDiscount = roundMoney(Math.min(remainingDiscount, formulaAmount));
      acc[itemId] = itemDiscount;
      remainingDiscount = roundMoney(Math.max(0, remainingDiscount - itemDiscount));
      return acc;
    }, {});
  }, [actualFeeAmountByItemId, comprehensiveFeeItems, feeTotalDiscount]);

  const actualFeeNetAmountByItemId = useMemo(() => {
    return comprehensiveFeeItems.reduce<Record<string, number>>((acc, item) => {
      const itemId = String(item.id || "");
      const formulaAmount = actualFeeAmountByItemId[itemId] ?? getQuotationOriginalAmount(item);
      const discountAmount = feeDiscountAmountByItemId[itemId] ?? 0;
      acc[itemId] = roundMoney(Math.max(0, formulaAmount - discountAmount));
      return acc;
    }, {});
  }, [actualFeeAmountByItemId, comprehensiveFeeItems, feeDiscountAmountByItemId]);

  const actualFeeRuleByItemId = useMemo(() => {
    return comprehensiveFeeItems.reduce<Record<string, string>>((acc, item) => {
      const itemId = String(item.id || "");
      const actualAmount = actualFeeAmountByItemId[itemId] ?? getQuotationOriginalAmount(item);
      acc[itemId] = getFeeRuleText(
        { ...item, category: "other" },
        actualAmount,
        { currencySymbol: false },
        actualFeeFormulaData.context,
      );
      return acc;
    }, {});
  }, [actualFeeAmountByItemId, actualFeeFormulaData, comprehensiveFeeItems]);

  const draftLines = useMemo(() => {
    const budgetLines = regularQuotationItems
      .map((item) => {
        const itemId = String(item.id || "");
        const savedQuantity = savedQuantityByItemId.get(itemId);
        const rowKey = getBudgetRowKey(item);
        const displayOrder = displayOrderByRowKey[rowKey];
        const savedTitle = savedQuantity?.title || String(item.name || "").trim();
        const aliasValue = budgetAliasByItemId[itemId] ?? savedTitle;
        const aliasChanged = String(aliasValue).trim() !== String(savedTitle).trim();
        const noteChanged = evidenceByItemId[itemId] !== undefined;
        const orderChanged = displayOrder !== undefined;
        const actualQuantity = actualQtyByItemId[itemId] ?? ((aliasChanged || noteChanged || orderChanged) ? (savedQuantity?.actualQuantity ?? String(item.quantity ?? "")) : undefined);
        if (actualQuantity === undefined || String(actualQuantity).trim() === "") return null;
        return makeBudgetLine(
          item,
          actualQuantity,
          evidenceByItemId[itemId] ?? savedQuantity?.evidenceNote ?? "",
          phase || currentPhaseKey || "",
          aliasValue,
          displayOrder,
        );
      })
      .filter((line): line is QuantityReviewLine => Boolean(line));
    const comprehensiveFeeLines = comprehensiveFeeItems
      .map((item) => {
        const itemId = String(item.id || "");
        const actualAmount = actualFeeNetAmountByItemId[itemId] ?? getQuotationOriginalAmount(item);
        const discountAmount = feeDiscountAmountByItemId[itemId] ?? 0;
        const savedDiscountAmount = toNumber(savedQuantityByItemId.get(itemId)?.discountAmount);
        if (Math.abs(roundMoney(actualAmount - getQuotationOriginalAmount(item))) < 0.005 && discountAmount <= 0 && !feeTotalDiscountTouched && savedDiscountAmount <= 0) return null;
        return makeComprehensiveFeeLine({ ...item, fee_rule_text: actualFeeRuleByItemId[itemId] }, actualAmount, evidenceByItemId[itemId] || "", phase || currentPhaseKey || "", discountAmount);
      })
      .filter((line): line is QuantityReviewLine => Boolean(line));
    const manualLines = Object.values(manualLinesBySpace)
      .flat()
      .filter(lineIsSubmittable)
      .map((line, index) => {
        const rowKey = getManualDraftRowKey(line, index);
        return { ...line, phase: line.phase || phase || currentPhaseKey || "", display_order: displayOrderByRowKey[rowKey] };
      });
    const savedManualLines = editedSavedManualLines.map((line) => {
      const rowKey = getSavedManualRowKey(line);
      return { ...line, phase: line.phase || phase || currentPhaseKey || "", display_order: displayOrderByRowKey[rowKey] ?? line.display_order };
    });
    return [...budgetLines, ...comprehensiveFeeLines, ...savedManualLines, ...manualLines];
  }, [actualFeeNetAmountByItemId, actualFeeRuleByItemId, actualQtyByItemId, budgetAliasByItemId, comprehensiveFeeItems, currentPhaseKey, displayOrderByRowKey, editedSavedManualLines, evidenceByItemId, feeDiscountAmountByItemId, feeTotalDiscountTouched, manualLinesBySpace, phase, regularQuotationItems, savedQuantityByItemId]);

  const summary = useMemo(() => {
    return draftLines.reduce((acc, line) => {
      const diff = getLineDiff(line);
      return {
        addAmount: acc.addAmount + (diff.type === "ADD" ? diff.amount : 0),
        deductAmount: acc.deductAmount + (diff.type === "DEDUCT" ? diff.amount : 0),
      };
    }, { addAmount: 0, deductAmount: 0 });
  }, [draftLines]);
  const addAmount = roundMoney(summary.addAmount);
  const deductAmount = roundMoney(summary.deductAmount);

  const filteredDialogQuotaOptions = useMemo(() => {
    const keyword = manualDialogSearch.trim().toLowerCase();
    const matched = keyword
      ? quotaOptions.filter((quota) => getQuotaSearchText(quota).includes(keyword))
      : quotaOptions;
    return {
      keyword,
      total: matched.length,
      items: matched.slice(0, keyword ? 60 : 16),
    };
  }, [manualDialogSearch, quotaOptions]);
  const manualDraftDiff = getLineDiff(manualDraft);

  const toggleSpace = (space: string) => {
    setCollapsedSpaces((current) => ({ ...current, [space]: !current[space] }));
  };

  const clearReviewRowDrag = () => {
    setDraggingReviewRow(null);
    setDragOverReviewRow(null);
  };

  const handleReviewRowDragStart = (event: DragEvent<HTMLElement>, space: string, rowKey: string) => {
    if (saving || disabled) return;
    setDraggingReviewRow({ space, rowKey });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", rowKey);
  };

  const handleReviewRowDragOver = (event: DragEvent<HTMLElement>, space: string, rowKey: string) => {
    if (!draggingReviewRow || draggingReviewRow.space !== space || draggingReviewRow.rowKey === rowKey) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverReviewRow({ space, rowKey, position: getDropPosition(event) });
  };

  const handleReviewRowDrop = (event: DragEvent<HTMLElement>, space: string, targetRowKey: string, rowKeys: string[]) => {
    if (!draggingReviewRow || draggingReviewRow.space !== space || draggingReviewRow.rowKey === targetRowKey) {
      clearReviewRowDrag();
      return;
    }
    event.preventDefault();
    const sourceRowKey = draggingReviewRow.rowKey;
    const position = dragOverReviewRow?.space === space && dragOverReviewRow.rowKey === targetRowKey ? dragOverReviewRow.position : getDropPosition(event);
    const currentOrder = rowOrderBySpace[space]?.length ? rowOrderBySpace[space] : rowKeys;
    const withoutSource = currentOrder.filter((key) => key !== sourceRowKey);
    const targetIndex = withoutSource.indexOf(targetRowKey);
    if (targetIndex < 0) {
      clearReviewRowDrag();
      return;
    }
    const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
    const nextOrder = [...withoutSource.slice(0, insertIndex), sourceRowKey, ...withoutSource.slice(insertIndex)];
    setRowOrderBySpace((current) => ({ ...current, [space]: nextOrder }));
    setRecentlyMovedRowKey(sourceRowKey);
    window.setTimeout(() => setRecentlyMovedRowKey((current) => current === sourceRowKey ? null : current), 900);
    clearReviewRowDrag();
  };

  const openManualLineDialog = (space: string) => {
    setManualDialogSpace(space);
    setManualDialogMode("library");
    setManualDialogSearch("");
    setSelectedQuotaIds([]);
    setManualDraft({ ...makeManualLine(space, phase || currentPhaseKey || ""), category: categoryOptions[0] || "" });
    setCollapsedSpaces((current) => ({ ...current, [space]: false }));
  };

  const openStructureDialog = () => {
    setStructureDialogOpen(true);
    setStructureDraftName("");
  };

  const closeStructureDialog = () => {
    setStructureDialogOpen(false);
    setStructureDraftName("");
  };

  const confirmStructureDialog = () => {
    const name = String(structureDraftName || "").trim();
    if (!name) {
      setSaveNotice({ tone: "danger", text: structureDialogMode === "space" ? "请填写空间名称" : "请填写大类名称" });
      return;
    }
    if (structureDialogMode === "space") {
      const exists = reviewSpaces.some((item) => item.space === name);
      if (exists) {
        setSaveNotice({ tone: "danger", text: "该空间已存在" });
        return;
      }
      setCustomSpaces((current) => current.includes(name) ? current : [...current, name]);
      setCollapsedSpaces((current) => ({ ...current, [name]: false }));
      setSaveNotice({ tone: "muted", text: `已新增空间：${name}` });
      closeStructureDialog();
      return;
    }
    if (categoryOptions.includes(name)) {
      setSaveNotice({ tone: "danger", text: "该大类已存在" });
      return;
    }
    setCustomCategories((current) => current.includes(name) ? current : [...current, name]);
    setManualDraft((current) => ({ ...current, category: name }));
    setSaveNotice({ tone: "muted", text: `已新增大类：${name}` });
    closeStructureDialog();
  };

  const updateManualLine = (space: string, index: number, patch: Partial<QuantityReviewLine>) => {
    setManualLinesBySpace((current) => ({
      ...current,
      [space]: (current[space] || []).map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line),
    }));
  };

  const updateManualDraft = (patch: Partial<QuantityReviewLine>) => {
    setManualDraft((current) => ({ ...current, ...patch }));
  };

  const toggleManualDraftQuota = (quotaId: string) => {
    setSelectedQuotaIds((current) => current.includes(quotaId)
      ? current.filter((id) => id !== quotaId)
      : [...current, quotaId]);
  };

  const closeManualDialog = () => {
    setManualDialogSpace(null);
    setManualDialogSearch("");
    setSelectedQuotaIds([]);
  };

  const confirmManualDialog = () => {
    if (!manualDialogSpace) return;
    if (manualDialogMode === "library") {
      const selectedLines = selectedQuotaIds
        .map((quotaId) => quotaOptions.find((item) => `${item.source}:${item.id}` === quotaId))
        .filter((quota): quota is QuotaLibraryOption => Boolean(quota))
        .map((quota) => ({
          ...applyQuotaToManualLine(makeManualLine(manualDialogSpace, phase || currentPhaseKey || ""), quota),
          space: manualDialogSpace,
          phase: phase || currentPhaseKey || "",
          actual_quantity: "1",
        }));
      if (selectedLines.length === 0) {
        setSaveNotice({ tone: "danger", text: "请先选择要添加的定额项目" });
        return;
      }
      setManualLinesBySpace((current) => ({
        ...current,
        [manualDialogSpace]: [...(current[manualDialogSpace] || []), ...selectedLines],
      }));
      setSaveNotice(null);
      closeManualDialog();
      return;
    }
    const nextLine = {
      ...manualDraft,
      space: manualDialogSpace,
      phase: manualDraft.phase || phase || currentPhaseKey || "",
      unit_price: String(roundMoney(toNumber(manualDraft.labor_unit_price) + toNumber(manualDraft.material_unit_price))),
    };
    if (!lineIsSubmittable(nextLine)) {
      setSaveNotice({ tone: "danger", text: "请填写新增项目名称和实际量" });
      return;
    }
    setManualLinesBySpace((current) => ({
      ...current,
      [manualDialogSpace]: [...(current[manualDialogSpace] || []), nextLine],
    }));
    setSaveNotice(null);
    closeManualDialog();
  };

  const removeManualLine = (space: string, index: number) => {
    setManualLinesBySpace((current) => ({
      ...current,
      [space]: (current[space] || []).filter((_, lineIndex) => lineIndex !== index),
    }));
  };

  const exportReviewTable = async () => {
    if (exportingReviewTable) return;
    setExportingReviewTable(true);
    setSaveNotice(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "着急科技";
      workbook.created = new Date();
      const projectName = project?.display_name || project?.name || "当前工地";
      const today = new Date().toISOString().slice(0, 10);
      const worksheet = workbook.addWorksheet("工程量复核", {
        views: [{ state: "frozen", ySplit: 2 }],
      });
      worksheet.pageSetup = {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
      };
      const exportRowHeight = 22;
      worksheet.properties.defaultRowHeight = exportRowHeight;
      const columnCount = 12;
      worksheet.columns = Array.from({ length: columnCount }, () => ({ width: 12 }));
      const borderColor = { argb: "FF9CA3AF" };
      const darkText = { argb: "FF162033" };
      const mutedText = { argb: "FF52647B" };
      const dangerText = { argb: "FFC2410C" };
      const successText = { argb: "FF047857" };
      const exportFont = "苹方-简";
      const bodyFont = exportFont;
      const titleFont = exportFont;
      const thinBorder = {
        top: { style: "thin", color: borderColor },
        left: { style: "thin", color: borderColor },
        bottom: { style: "thin", color: borderColor },
        right: { style: "thin", color: borderColor },
      } as any;
      const fills = {
        white: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } },
        header: { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } },
        section: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } },
        subtotal: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F7F7" } },
        discount: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } },
      } as any;
      const formatExportAmount = (value: unknown) => new Intl.NumberFormat("zh-CN", {
        useGrouping: false,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(roundMoney(toNumber(value)));
      const formatExportSignedAmount = (value: unknown) => {
        const amount = roundMoney(toNumber(value));
        return `${amount < 0 ? "-" : ""}${formatExportAmount(Math.abs(amount))}`;
      };
      const styleRow = (row: any, options: { fill?: any; bold?: boolean; color?: any; center?: boolean } = {}) => {
        row.eachCell({ includeEmpty: true }, (cell: any, columnNumber: number) => {
          cell.border = thinBorder;
          cell.fill = options.fill || fills.white;
          cell.font = { name: bodyFont, size: 10, bold: Boolean(options.bold), color: options.color || darkText };
          cell.alignment = {
            vertical: "middle",
            horizontal: options.center || columnNumber >= 3 && columnNumber <= 11 ? "center" : "left",
            wrapText: false,
            shrinkToFit: columnNumber === 1 || columnNumber === 12,
          };
          if ([3, 4, 5, 7, 8, 9, 10, 11].includes(columnNumber) && typeof cell.value === "number") {
            cell.numFmt = "0.00";
          }
        });
      };

      const addMergedRow = (value: string, fill: any, bold = true) => {
        const row = worksheet.addRow([value, ...Array(columnCount - 1).fill("")]);
        const rowNumber = row.number;
        worksheet.mergeCells(rowNumber, 1, rowNumber, columnCount);
        styleRow(row, { fill, bold, color: darkText });
        row.height = exportRowHeight;
        return row;
      };

      worksheet.mergeCells(1, 1, 1, columnCount);
      const titleCell = worksheet.getCell(1, 1);
      titleCell.value = `${projectName} 工程量复核表`;
      titleCell.font = { name: titleFont, size: 16, bold: true, color: darkText };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.fill = fills.white;
      for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
        worksheet.getCell(1, columnNumber).border = thinBorder;
      }
      worksheet.getRow(1).height = 30;

      const headers = ["项目", "类别", "预算量/原金额", "实际量/实际金额", "差额数量", "单位", "人工单价", "材料单价", "人工差额", "材料差额", "差额", "说明"];
      const headerRow = worksheet.addRow(headers);
      styleRow(headerRow, { fill: fills.header, bold: true, center: true, color: darkText });
      headerRow.height = exportRowHeight;
      worksheet.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: columnCount } };

      const addDataRow = (values: any[], options: { fill?: any; bold?: boolean; amountTone?: number } = {}) => {
        const row = worksheet.addRow(values);
        row.height = exportRowHeight;
        styleRow(row, { fill: options.fill || fills.white, bold: options.bold });
        const diffCell = row.getCell(11);
        if (typeof diffCell.value === "number") {
          diffCell.font = {
            name: bodyFont,
            size: 10,
            bold: Boolean(options.bold),
            color: Number(diffCell.value) > 0 ? dangerText : Number(diffCell.value) < 0 ? successText : mutedText,
          };
        }
        return row;
      };

      const addSpaceRows = (space: string, items: any[]) => {
        const manualLines = manualLinesBySpace[space] || [];
        const savedManualLines = savedManualLinesBySpace.get(space) || [];
        const visibleSavedManualLines = savedManualLines.map((line) => {
          const edit = savedManualEdits[line.savedKey];
          return {
            ...line,
            title: edit?.title ?? line.title,
            actual_quantity: edit?.actual_quantity ?? line.actual_quantity,
            evidence_note: edit?.evidence_note ?? line.evidence_note,
          };
        });
        const budgetRows = items.map((item) => {
          const itemId = String(item.id || "");
          const savedQuantity = savedQuantityByItemId.get(itemId);
          const rowKey = getBudgetRowKey(item);
          const actualQuantity = actualQtyByItemId[itemId] ?? savedQuantity?.actualQuantity ?? "";
          const aliasValue = budgetAliasByItemId[itemId] ?? savedQuantity?.title ?? String(item.name || "");
          const line = makeBudgetLine(
            item,
            actualQuantity || String(item.quantity ?? ""),
            evidenceByItemId[itemId] ?? savedQuantity?.evidenceNote ?? "",
            phase || currentPhaseKey || "",
            aliasValue,
            displayOrderByRowKey[rowKey] ?? savedQuantity?.displayOrder,
          );
          return {
            kind: "budget" as const,
            rowKey,
            item,
            itemId,
            savedQuantity,
            actualQuantity,
            aliasValue,
            line,
            displayOrder: displayOrderByRowKey[rowKey] ?? savedQuantity?.displayOrder,
          };
        });
        const savedManualRows = visibleSavedManualLines.map((line) => {
          const rowKey = getSavedManualRowKey(line);
          return {
            kind: "saved-manual" as const,
            rowKey,
            line: { ...line, display_order: displayOrderByRowKey[rowKey] ?? line.display_order },
            displayOrder: displayOrderByRowKey[rowKey] ?? line.display_order,
          };
        });
        const manualRows = manualLines.map((line, index) => {
          const rowKey = getManualDraftRowKey(line, index);
          return {
            kind: "manual" as const,
            rowKey,
            line: { ...line, display_order: displayOrderByRowKey[rowKey] },
            index,
            displayOrder: displayOrderByRowKey[rowKey],
          };
        });
        const sortedRows = sortRowsByDisplayOrder([...budgetRows, ...savedManualRows, ...manualRows], rowOrderBySpace[space]);
        const spaceDraftLines = [
          ...budgetRows
            .map((row) => row.actualQuantity === undefined || String(row.actualQuantity).trim() === "" ? null : row.line)
            .filter((line): line is QuantityReviewLine => Boolean(line)),
          ...visibleSavedManualLines,
          ...manualLines.filter(lineIsSubmittable),
        ];
        const spaceSubtotal = spaceDraftLines.reduce((acc, line) => {
          const diff = getLineDiff(line);
          return {
            laborAmount: roundMoney(acc.laborAmount + diff.laborSignedAmount),
            materialAmount: roundMoney(acc.materialAmount + diff.materialSignedAmount),
            totalAmount: roundMoney(acc.totalAmount + diff.signedAmount),
          };
        }, { laborAmount: 0, materialAmount: 0, totalAmount: 0 });

        addMergedRow(space, fills.section, true);
        sortedRows.forEach((row) => {
          if (row.kind === "budget") {
            const actualText = String(row.actualQuantity || "").trim();
            const diff = actualText ? getLineDiff(row.line) : null;
            addDataRow([
              row.aliasValue || row.item.name || "-",
              getQuotationCategoryLabel(row.item.category),
              toNumber(row.item.quantity),
              actualText ? toNumber(actualText) : "",
              diff ? diff.diffQuantity : "",
              row.item.unit || "",
              toNumber(row.item.labor_cost),
              toNumber(row.item.material_cost),
              diff ? diff.laborSignedAmount : "",
              diff ? diff.materialSignedAmount : "",
              diff ? diff.signedAmount : "",
              evidenceByItemId[row.itemId] ?? row.savedQuantity?.evidenceNote ?? "",
            ]);
            return;
          }
          const line = row.line;
          const diff = getLineDiff(line);
          addDataRow([
            line.title || "-",
            getQuotationCategoryLabel(line.category),
            toNumber(line.budget_quantity),
            toNumber(line.actual_quantity),
            diff.diffQuantity,
            line.unit || "项",
            toNumber(line.labor_unit_price),
            toNumber(line.material_unit_price),
            diff.laborSignedAmount,
            diff.materialSignedAmount,
            diff.signedAmount,
            line.evidence_note || "",
          ]);
        });
        if (spaceDraftLines.length > 0) {
          addDataRow([
            "小计",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            spaceSubtotal.laborAmount,
            spaceSubtotal.materialAmount,
            spaceSubtotal.totalAmount,
            "",
          ], { fill: fills.subtotal, bold: true });
        }
      };

      reviewSpaces.forEach(({ space, items }) => addSpaceRows(space, items));

      if (comprehensiveFeeItems.length > 0) {
        addMergedRow("综合费用", fills.section, true);
        comprehensiveFeeItems.forEach((item) => {
          const itemId = String(item.id || "");
          const originalAmount = getQuotationOriginalAmount(item);
          const actualAmount = actualFeeAmountByItemId[itemId] ?? originalAmount;
          const amountDiff = roundMoney(actualAmount - originalAmount);
          addDataRow([
            item.name || "-",
            "综合费用",
            originalAmount,
            actualAmount,
            "",
            "元",
            "",
            "",
            "",
            "",
            amountDiff,
            [actualFeeRuleByItemId[itemId] || "", evidenceByItemId[itemId] || ""].filter(Boolean).join("；"),
          ]);
        });
        if (feeTotalDiscount > 0 || feeTotalDiscountTouched || savedFeeTotalDiscountAmount > 0) {
          addDataRow([
            "优惠金额",
            "综合费用",
            "",
            feeTotalDiscount,
            "",
            "元",
            "",
            "",
            "",
            "",
            -feeTotalDiscount,
            `优惠前 ${formatExportAmount(feeGrossActualAmount)}，优惠后 ${formatExportAmount(roundMoney(Math.max(0, feeGrossActualAmount - feeTotalDiscount)))}`,
          ], { fill: fills.discount, bold: true });
        }
        const originalSubtotal = comprehensiveFeeItems.reduce((sum, item) => roundMoney(sum + getQuotationOriginalAmount(item)), 0);
        const actualSubtotal = roundMoney(Math.max(0, feeGrossActualAmount - feeTotalDiscount));
        addDataRow([
          "小计",
          "",
          originalSubtotal,
          actualSubtotal,
          "",
          "元",
          "",
          "",
          "",
          "",
          roundMoney(actualSubtotal - originalSubtotal),
          feeTotalDiscount > 0 ? `已优惠 ${formatExportAmount(feeTotalDiscount)}` : "",
        ], { fill: fills.subtotal, bold: true });
      }

      addMergedRow(`合计：补收 ${formatExportAmount(addAmount)}    扣减 ${formatExportAmount(deductAmount)}    净额 ${formatExportSignedAmount(roundMoney(addAmount - deductAmount))}`, fills.header, true);
      const columnWidthRules = [
        { min: 18, max: 46 },
        { min: 14, max: 40 },
        { min: 12, max: 18 },
        { min: 12, max: 18 },
        { min: 10, max: 16 },
        { min: 7, max: 10 },
        { min: 10, max: 16 },
        { min: 10, max: 16 },
        { min: 11, max: 18 },
        { min: 11, max: 18 },
        { min: 10, max: 16 },
        { min: 24, max: 110 },
      ];
      worksheet.columns.forEach((column: any, index: number) => {
        const rule = columnWidthRules[index] || { min: 10, max: 24 };
        let maxWidth = 0;
        column.eachCell({ includeEmpty: true }, (cell: any) => {
          if (cell.isMerged) return;
          const rawValue = typeof cell.value === "object" && cell.value && "richText" in cell.value
            ? (cell.value.richText || []).map((part: any) => part.text || "").join("")
            : cell.value;
          maxWidth = Math.max(maxWidth, getExcelTextWidth(rawValue));
        });
        column.width = Math.min(Math.max(Math.ceil(maxWidth * 1.15) + 2, rule.min), rule.max);
      });
      worksheet.eachRow((row: any) => {
        row.eachCell({ includeEmpty: true }, (cell: any) => {
          if (!cell.border) cell.border = thinBorder;
          if (!cell.font) cell.font = { name: bodyFont, size: 10, color: darkText };
          if (!cell.alignment) cell.alignment = { vertical: "middle", wrapText: false };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${toSafeFileName(projectName)}_工程量复核_${today}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSaveNotice({ tone: "success", text: "工程量复核表已导出" });
    } catch (error) {
      console.error("export quantity review failed", error);
      setSaveNotice({ tone: "danger", text: "导出失败，请稍后重试" });
    } finally {
      setExportingReviewTable(false);
    }
  };

  const submit = async () => {
    if (draftLines.length === 0) {
      setSaveNotice({ tone: "danger", text: "请先填写实际量或新增项目" });
      return;
    }
    try {
      setSaveNotice(null);
      const result = await onCreate({
        title: "",
        phase,
        evidence_note: "",
        items: draftLines,
      });
      const reviewNo = typeof result?.review_no === "string" ? result.review_no : "";
      setSaveNotice({ tone: "success", text: reviewNo ? `保存成功：${reviewNo}` : "保存成功" });
      setActualQtyByItemId({});
      setEvidenceByItemId({});
      setFeeTotalDiscountAmount(null);
      setBudgetAliasByItemId({});
      setRowOrderBySpace({});
      setSavedManualEdits({});
      setManualLinesBySpace({});
    } catch (error) {
      const message = error instanceof Error && error.message && !["empty-items", "missing-project", "submit-failed"].includes(error.message)
        ? error.message
        : "保存失败，请检查填写内容后重试";
      setSaveNotice({ tone: "danger", text: message });
      // Keep the current draft so现场录入失败时不会丢内容。
    }
  };

  return (
    <section className={styles.workspace}>
      <div className={styles.mainGrid}>
        <div className={styles.budgetPanel}>
          <div className={styles.panelHeader}>
            <strong>复核空间</strong>
            <div className={styles.panelActions}>
              <span className={styles.panelStats}>
                <span>已填写 {draftLines.length} 项</span>
                <span data-tone="add">补收 {formatPlainAmount(addAmount)}</span>
                <span data-tone="deduct">扣减 {formatPlainAmount(deductAmount)}</span>
              </span>
              <button type="button" className={styles.secondaryActionButton} onClick={openStructureDialog} disabled={saving || disabled}>
                <Plus className="h-4 w-4" /> 新增
              </button>
              <button type="button" className={styles.secondaryActionButton} onClick={exportReviewTable} disabled={saving || disabled || exportingReviewTable}>
                {exportingReviewTable ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                导出表格
              </button>
            </div>
          </div>
          <ThinScrollArea className={styles.spaceScroller} scrollClassName={styles.spaceViewport}>
            <div className={styles.spaceList}>
              {comprehensiveFeeItems.length > 0 && (() => {
                const feeDraftLines = comprehensiveFeeItems
                  .map((item) => {
                    const itemId = String(item.id || "");
                    const actualAmount = actualFeeNetAmountByItemId[itemId] ?? getQuotationOriginalAmount(item);
                    const discountAmount = feeDiscountAmountByItemId[itemId] ?? 0;
                    const savedDiscountAmount = toNumber(savedQuantityByItemId.get(itemId)?.discountAmount);
                    return Math.abs(roundMoney(actualAmount - getQuotationOriginalAmount(item))) < 0.005 && discountAmount <= 0 && !feeTotalDiscountTouched && savedDiscountAmount <= 0 ? null : makeComprehensiveFeeLine(item, actualAmount, evidenceByItemId[itemId] || "", phase || currentPhaseKey || "", discountAmount);
                  })
                  .filter((line): line is QuantityReviewLine => Boolean(line));
                const feeSubtotal = comprehensiveFeeItems.reduce((acc, item) => {
                  const itemId = String(item.id || "");
                  const originalAmount = getQuotationOriginalAmount(item);
                  const actualAmount = actualFeeNetAmountByItemId[itemId] ?? originalAmount;
                  return {
                    originalAmount: roundMoney(acc.originalAmount + originalAmount),
                    actualAmount: roundMoney(acc.actualAmount + actualAmount),
                    diffAmount: roundMoney(acc.diffAmount + actualAmount - originalAmount),
                  };
                }, { originalAmount: 0, actualAmount: 0, diffAmount: 0 });
                const feeNetAmount = roundMoney(feeDraftLines.reduce((sum, line) => sum + getLineDiff(line).signedAmount, 0));
                const collapsed = collapsedSpaces["综合费用"] === true;
                return (
                  <section className={`${styles.spaceSection} ${styles.feeSection}`}>
                    <button type="button" className={styles.spaceHeader} onClick={() => toggleSpace("综合费用")} aria-expanded={!collapsed}>
                      <span className={styles.spaceName}>
                        <ChevronRight className="h-4 w-4" data-open={!collapsed ? "true" : undefined} />
                        综合费用
                      </span>
                      <span className={styles.spaceMeta}>
                        <span>{comprehensiveFeeItems.length} 个费用项</span>
                        {feeDraftLines.length > 0 && (
                          <span className={styles.spaceDiffBadge} data-tone={getAmountTone(feeNetAmount)}>
                            差额 {formatSignedAmount(feeNetAmount)}
                          </span>
                        )}
                      </span>
                    </button>
                    <div className={styles.spaceBodyShell} data-collapsed={collapsed ? "true" : "false"} aria-hidden={collapsed}>
                      <div className={styles.spaceBodyClip}>
                        <div className={styles.spaceBody}>
                        <table className={`${styles.budgetTable} ${styles.feeTable}`}>
                          <colgroup>
                            <col className={styles.feeColName} />
                            <col className={styles.feeColAmount} />
                            <col className={styles.feeColAmount} />
                            <col className={styles.feeColAmount} />
                            <col className={styles.feeColRule} />
                            <col className={styles.feeColNote} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>费用项目</th>
                              <th>原金额</th>
                              <th>实际金额</th>
                              <th>差额</th>
                              <th>计算比例</th>
                              <th>说明</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comprehensiveFeeItems.map((item) => {
                              const itemId = String(item.id || "");
                              const originalAmount = getQuotationOriginalAmount(item);
                              const actualAmount = actualFeeAmountByItemId[itemId] ?? originalAmount;
                              const amountDiff = roundMoney(actualAmount - originalAmount);
                              return (
                                <tr key={itemId || `fee-${item.name}`}>
                                  <td>
                                    <strong>{item.name || "-"}</strong>
                                    {(item.spec || item.remark) && <small>{item.spec || item.remark}</small>}
                                  </td>
                                  <td className={styles.numberCell}>{formatPlainAmount(originalAmount)}</td>
                                  <td className={styles.numberCell}>
                                    <span className={styles.readonlyAmount}>{formatPlainAmount(actualAmount)}</span>
                                  </td>
                                  <td className={styles.amountCell}>
                                    <span className={styles.amountBadge} data-tone={getAmountTone(amountDiff)}>{formatSignedAmount(amountDiff)}</span>
                                  </td>
                                  <td className={styles.feeRuleCell}>{actualFeeRuleByItemId[itemId] || "-"}</td>
                                  <td>
                                    <input
                                      value={evidenceByItemId[itemId] || ""}
                                      onChange={(event) => setEvidenceByItemId((current) => ({ ...current, [itemId]: event.target.value }))}
                                      placeholder="金额调整说明"
                                      disabled={saving || disabled}
                                      className={styles.noteInput}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                            <tr className={styles.feeDiscountRow}>
                              <td>
                                <strong>优惠金额</strong>
                                <small>综合费用总优惠</small>
                              </td>
                              <td className={styles.numberCell}>-</td>
                              <td className={styles.numberCell}>
                                <input
                                  value={feeDiscountInputValue}
                                  onChange={(event) => setFeeTotalDiscountAmount(event.target.value)}
                                  placeholder="0"
                                  inputMode="decimal"
                                  disabled={saving || disabled}
                                  className={styles.feeAmountInput}
                                />
                              </td>
                              <td className={styles.amountCell}>
                                <span className={styles.amountBadge} data-tone={feeTotalDiscount > 0 ? "deduct" : "none"}>
                                  {feeTotalDiscount > 0 ? formatSignedAmount(-feeTotalDiscount) : formatPlainAmount(0)}
                                </span>
                              </td>
                              <td className={styles.feeRuleCell}>
                                优惠前 {formatPlainAmount(feeGrossActualAmount)} · 优惠后 {formatPlainAmount(roundMoney(Math.max(0, feeGrossActualAmount - feeTotalDiscount)))}
                              </td>
                              <td className={styles.subtotalNote}>
                                {feeDiscountWasClamped ? <span className={styles.inputHint}>已按可优惠上限处理</span> : "-"}
                              </td>
                            </tr>
                            <tr className={styles.subtotalRow}>
                              <td>
                                <strong>小计</strong>
                                <small>共 {comprehensiveFeeItems.length} 个费用项{feeTotalDiscount > 0 ? ` · 优惠 ${formatPlainAmount(feeTotalDiscount)}` : ""}</small>
                              </td>
                              <td className={styles.numberCell}>{formatPlainAmount(feeSubtotal.originalAmount)}</td>
                              <td className={styles.numberCell}>{formatPlainAmount(feeSubtotal.actualAmount)}</td>
                              <td className={styles.amountCell}>
                                <span className={styles.amountBadge} data-tone={getAmountTone(feeSubtotal.diffAmount)}>{formatSignedAmount(feeSubtotal.diffAmount)}</span>
                              </td>
                              <td className={styles.feeRuleCell}>-</td>
                              <td className={styles.subtotalNote}>-</td>
                            </tr>
                          </tbody>
                        </table>
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })()}
              {reviewSpaces.map(({ space, items }) => {
                const manualLines = manualLinesBySpace[space] || [];
                const savedManualLines = savedManualLinesBySpace.get(space) || [];
                const visibleSavedManualLines = savedManualLines.map((line) => {
                  const edit = savedManualEdits[line.savedKey];
                  return {
                    ...line,
                    title: edit?.title ?? line.title,
                    actual_quantity: edit?.actual_quantity ?? line.actual_quantity,
                    evidence_note: edit?.evidence_note ?? line.evidence_note,
                  };
                });
                const budgetRows = items.map((item) => {
                  const itemId = String(item.id || "");
                  const savedQuantity = savedQuantityByItemId.get(itemId);
                  const rowKey = getBudgetRowKey(item);
                  const actualQuantity = actualQtyByItemId[itemId] ?? savedQuantity?.actualQuantity ?? "";
                  const aliasValue = budgetAliasByItemId[itemId] ?? savedQuantity?.title ?? String(item.name || "");
                  const line = makeBudgetLine(
                    item,
                    actualQuantity || String(item.quantity ?? ""),
                    evidenceByItemId[itemId] ?? savedQuantity?.evidenceNote ?? "",
                    phase || currentPhaseKey || "",
                    aliasValue,
                    displayOrderByRowKey[rowKey] ?? savedQuantity?.displayOrder,
                  );
                  return {
                    kind: "budget" as const,
                    rowKey,
                    item,
                    itemId,
                    savedQuantity,
                    actualQuantity,
                    aliasValue,
                    line,
                    displayOrder: displayOrderByRowKey[rowKey] ?? savedQuantity?.displayOrder,
                  };
                });
                const savedManualRows = visibleSavedManualLines.map((line) => {
                  const rowKey = getSavedManualRowKey(line);
                  return {
                    kind: "saved-manual" as const,
                    rowKey,
                    line: { ...line, display_order: displayOrderByRowKey[rowKey] ?? line.display_order },
                    displayOrder: displayOrderByRowKey[rowKey] ?? line.display_order,
                  };
                });
                const manualRows = manualLines.map((line, index) => {
                  const rowKey = getManualDraftRowKey(line, index);
                  return {
                    kind: "manual" as const,
                    rowKey,
                    line: { ...line, display_order: displayOrderByRowKey[rowKey] },
                    index,
                    displayOrder: displayOrderByRowKey[rowKey],
                  };
                });
                const sortedRows = sortRowsByDisplayOrder([...budgetRows, ...savedManualRows, ...manualRows], rowOrderBySpace[space]);
                const sortedRowKeys = sortedRows.map((row) => row.rowKey);
                const spaceDraftLines = [
                  ...budgetRows
                    .map((row) => {
                      return row.actualQuantity === undefined || String(row.actualQuantity).trim() === "" ? null : row.line;
                    })
                    .filter((line): line is QuantityReviewLine => Boolean(line)),
                  ...visibleSavedManualLines,
                  ...manualLines.filter(lineIsSubmittable),
                ];
                const spaceSubtotal = spaceDraftLines.reduce((acc, line) => {
                  const diff = getLineDiff(line);
                  return {
                    laborAmount: roundMoney(acc.laborAmount + diff.laborSignedAmount),
                    materialAmount: roundMoney(acc.materialAmount + diff.materialSignedAmount),
                    totalAmount: roundMoney(acc.totalAmount + diff.signedAmount),
                  };
                }, { laborAmount: 0, materialAmount: 0, totalAmount: 0 });
                const spaceNetAmount = roundMoney(spaceDraftLines.reduce((sum, line) => sum + getLineDiff(line).signedAmount, 0));
                const collapsed = collapsedSpaces[space] === true;
                return (
                  <section key={space} className={styles.spaceSection}>
                    <button type="button" className={styles.spaceHeader} onClick={() => toggleSpace(space)} aria-expanded={!collapsed}>
                      <span className={styles.spaceName}>
                        <ChevronRight className="h-4 w-4" data-open={!collapsed ? "true" : undefined} />
                        {space}
                      </span>
                      <span className={styles.spaceMeta}>
                        <span>{items.length} 个预算项目</span>
                        {savedManualLines.length + manualLines.length > 0 && <span>新增 {savedManualLines.length + manualLines.length} 项</span>}
                        {spaceDraftLines.length > 0 && (
                          <span className={styles.spaceDiffBadge} data-tone={getAmountTone(spaceNetAmount)}>
                            差额 {formatSignedAmount(spaceNetAmount)}
                          </span>
                        )}
                      </span>
                    </button>
                    <div className={styles.spaceBodyShell} data-collapsed={collapsed ? "true" : "false"} aria-hidden={collapsed}>
                      <div className={styles.spaceBodyClip}>
                        <div className={styles.spaceBody}>
                        <table className={styles.budgetTable}>
                          <colgroup>
                            <col className={styles.colName} />
                            <col className={styles.colCategory} />
                            <col className={styles.colQty} />
                            <col className={styles.colQty} />
                            <col className={styles.colDiffQty} />
                            <col className={styles.colPrice} />
                            <col className={styles.colPrice} />
                            <col className={styles.colAmount} />
                            <col className={styles.colAmount} />
                            <col className={styles.colAmount} />
                            <col className={styles.colNote} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>项目</th>
                              <th>类别</th>
                              <th>预算量</th>
                              <th>实际量</th>
                              <th>差额数量</th>
                              <th>人工单价</th>
                              <th>材料单价</th>
                              <th>人工差额</th>
                              <th>材料差额</th>
                              <th>差额</th>
                              <th>说明</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedRows.map((row) => {
                              const isDragging = draggingReviewRow?.space === space && draggingReviewRow.rowKey === row.rowKey;
                              const dropBefore = dragOverReviewRow?.space === space && dragOverReviewRow.rowKey === row.rowKey && dragOverReviewRow.position === "before";
                              const dropAfter = dragOverReviewRow?.space === space && dragOverReviewRow.rowKey === row.rowKey && dragOverReviewRow.position === "after";
                              const rowClassName = [
                                styles.reviewItemRow,
                                row.kind === "saved-manual" ? styles.savedManualRow : "",
                                row.kind === "manual" ? styles.manualRow : "",
                                isDragging ? styles.reviewRowDragging : "",
                                recentlyMovedRowKey === row.rowKey ? styles.reviewRowMoved : "",
                                dropBefore ? styles.reviewRowDropBefore : "",
                                dropAfter ? styles.reviewRowDropAfter : "",
                              ].filter(Boolean).join(" ");
                              if (row.kind === "budget") {
                                const diff = row.actualQuantity === "" ? null : getLineDiff(row.line);
                                return (
                                  <tr
                                    key={row.rowKey}
                                    className={rowClassName}
                                    onDragOver={(event) => handleReviewRowDragOver(event, space, row.rowKey)}
                                    onDrop={(event) => handleReviewRowDrop(event, space, row.rowKey, sortedRowKeys)}
                                    onDragEnd={clearReviewRowDrag}
                                  >
                                    <td>
                                      <div className={styles.projectNameCell}>
                                        <button
                                          type="button"
                                          draggable={!saving && !disabled}
                                          onDragStart={(event) => handleReviewRowDragStart(event, space, row.rowKey)}
                                          className={styles.reviewRowDragHandle}
                                          title="拖动调整项目顺序"
                                          aria-label="拖动调整项目顺序"
                                        >
                                          <GripVertical className="h-4 w-4" />
                                        </button>
                                        <div className={styles.projectNameStack}>
                                          <input
                                            value={row.aliasValue}
                                            onChange={(event) => setBudgetAliasByItemId((current) => ({ ...current, [row.itemId]: event.target.value }))}
                                            placeholder={String(row.item.name || "项目名称")}
                                            disabled={saving || disabled}
                                            className={styles.aliasInput}
                                          />
                                        </div>
                                      </div>
                                    </td>
                                    <td>{getQuotationCategoryLabel(row.item.category)}</td>
                                    <td className={styles.numberCell}>{row.item.quantity ?? 0}{row.item.unit || ""}</td>
                                    <td className={styles.quantityInputCell}>
                                      <input
                                        value={row.actualQuantity}
                                        onChange={(event) => setActualQtyByItemId((current) => ({ ...current, [row.itemId]: event.target.value }))}
                                        placeholder={String(row.item.quantity ?? "0")}
                                        inputMode="decimal"
                                        disabled={saving || disabled}
                                        className={styles.qtyInput}
                                      />
                                    </td>
                                    <td className={styles.amountCell}>
                                      {diff ? <span className={styles.amountBadge} data-tone={getAmountTone(diff.diffQuantity)}>{formatSignedQuantity(diff.diffQuantity, row.item.unit || "")}</span> : "-"}
                                    </td>
                                    <td className={styles.numberCell}>{formatPlainAmount(toNumber(row.item.labor_cost))}</td>
                                    <td className={styles.numberCell}>{formatPlainAmount(toNumber(row.item.material_cost))}</td>
                                    <td className={styles.amountCell}>
                                      {diff ? <span className={styles.amountBadge} data-tone={getAmountTone(diff.laborSignedAmount)}>{formatSignedAmount(diff.laborSignedAmount)}</span> : "-"}
                                    </td>
                                    <td className={styles.amountCell}>
                                      {diff ? <span className={styles.amountBadge} data-tone={getAmountTone(diff.materialSignedAmount)}>{formatSignedAmount(diff.materialSignedAmount)}</span> : "-"}
                                    </td>
                                    <td className={styles.amountCell}>
                                      {diff ? <span className={styles.amountBadge} data-tone={getAmountTone(diff.signedAmount)}>{formatSignedAmount(diff.signedAmount)}</span> : "-"}
                                    </td>
                                    <td>
                                      <input
                                        value={evidenceByItemId[row.itemId] ?? row.savedQuantity?.evidenceNote ?? ""}
                                        onChange={(event) => setEvidenceByItemId((current) => ({ ...current, [row.itemId]: event.target.value }))}
                                        placeholder="说明"
                                        disabled={saving || disabled}
                                        className={styles.noteInput}
                                      />
                                    </td>
                                  </tr>
                                );
                              }
                              if (row.kind === "saved-manual") {
                                const line = row.line;
                                const diff = getLineDiff(line);
                                return (
                                  <tr
                                    key={row.rowKey}
                                    className={rowClassName}
                                    onDragOver={(event) => handleReviewRowDragOver(event, space, row.rowKey)}
                                    onDrop={(event) => handleReviewRowDrop(event, space, row.rowKey, sortedRowKeys)}
                                    onDragEnd={clearReviewRowDrag}
                                  >
                                    <td>
                                      <div className={styles.projectNameCell}>
                                        <button
                                          type="button"
                                          draggable={!saving && !disabled}
                                          onDragStart={(event) => handleReviewRowDragStart(event, space, row.rowKey)}
                                          className={styles.reviewRowDragHandle}
                                          title="拖动调整项目顺序"
                                          aria-label="拖动调整项目顺序"
                                        >
                                          <GripVertical className="h-4 w-4" />
                                        </button>
                                        <div className={styles.projectNameStack}>
                                          <input
                                            value={line.title}
                                            onChange={(event) => setSavedManualEdits((current) => ({
                                              ...current,
                                              [line.savedKey]: { ...current[line.savedKey], title: event.target.value },
                                            }))}
                                            placeholder="项目别名"
                                            disabled={saving || disabled}
                                            className={styles.aliasInput}
                                          />
                                        </div>
                                      </div>
                                    </td>
                                    <td>{getQuotationCategoryLabel(line.category)}</td>
                                    <td className={styles.numberCell}>0{line.unit || "项"}</td>
                                    <td className={styles.manualQtyCell}>
                                      <input
                                        value={line.actual_quantity}
                                        onChange={(event) => setSavedManualEdits((current) => ({
                                          ...current,
                                          [line.savedKey]: { ...current[line.savedKey], actual_quantity: event.target.value },
                                        }))}
                                        placeholder="实际量"
                                        inputMode="decimal"
                                        disabled={saving || disabled}
                                        className={styles.qtyInput}
                                      />
                                    </td>
                                    <td className={styles.amountCell}><span className={styles.amountBadge} data-tone={getAmountTone(diff.diffQuantity)}>{formatSignedQuantity(diff.diffQuantity, line.unit || "项")}</span></td>
                                    <td className={styles.numberCell}>{formatPlainAmount(toNumber(line.labor_unit_price))}</td>
                                    <td className={styles.numberCell}>{formatPlainAmount(toNumber(line.material_unit_price))}</td>
                                    <td className={styles.amountCell}><span className={styles.amountBadge} data-tone={getAmountTone(diff.laborSignedAmount)}>{formatSignedAmount(diff.laborSignedAmount)}</span></td>
                                    <td className={styles.amountCell}><span className={styles.amountBadge} data-tone={getAmountTone(diff.materialSignedAmount)}>{formatSignedAmount(diff.materialSignedAmount)}</span></td>
                                    <td className={styles.amountCell}><span className={styles.amountBadge} data-tone={getAmountTone(diff.signedAmount)}>{formatSignedAmount(diff.signedAmount)}</span></td>
                                    <td>
                                      <input
                                        value={line.evidence_note}
                                        onChange={(event) => setSavedManualEdits((current) => ({
                                          ...current,
                                          [line.savedKey]: { ...current[line.savedKey], evidence_note: event.target.value },
                                        }))}
                                        placeholder="说明"
                                        disabled={saving || disabled}
                                        className={styles.noteInput}
                                      />
                                    </td>
                                  </tr>
                                );
                              }
                              const line = row.line;
                              const diff = getLineDiff(line);
                              return (
                                <tr
                                  key={row.rowKey}
                                  className={rowClassName}
                                  onDragOver={(event) => handleReviewRowDragOver(event, space, row.rowKey)}
                                  onDrop={(event) => handleReviewRowDrop(event, space, row.rowKey, sortedRowKeys)}
                                  onDragEnd={clearReviewRowDrag}
                                >
                                  <td>
                                    <div className={styles.projectNameCell}>
                                      <button
                                        type="button"
                                        draggable={!saving && !disabled}
                                        onDragStart={(event) => handleReviewRowDragStart(event, space, row.rowKey)}
                                        className={styles.reviewRowDragHandle}
                                        title="拖动调整项目顺序"
                                        aria-label="拖动调整项目顺序"
                                      >
                                        <GripVertical className="h-4 w-4" />
                                      </button>
                                      <div className={styles.projectNameStack}>
                                        <input value={line.title} onChange={(event) => updateManualLine(space, row.index, { title: event.target.value })} placeholder="新增项目名称" disabled={saving || disabled} className={styles.aliasInput} />
                                      </div>
                                    </div>
                                  </td>
                                  <td><input value={line.category} onChange={(event) => updateManualLine(space, row.index, { category: event.target.value })} placeholder="类别" disabled={saving || disabled} className={styles.noteInput} /></td>
                                  <td className={styles.numberCell}>0{line.unit || "项"}</td>
                                  <td className={styles.manualQtyCell}>
                                    <input value={line.actual_quantity} onChange={(event) => updateManualLine(space, row.index, { actual_quantity: event.target.value })} placeholder="实际量" inputMode="decimal" disabled={saving || disabled} className={styles.qtyInput} />
                                    <input value={line.unit} onChange={(event) => updateManualLine(space, row.index, { unit: event.target.value })} placeholder="单位" disabled={saving || disabled} className={styles.unitInput} />
                                  </td>
                                  <td className={styles.amountCell}><span className={styles.amountBadge} data-tone={getAmountTone(diff.diffQuantity)}>{formatSignedQuantity(diff.diffQuantity, line.unit || "项")}</span></td>
                                  <td><input value={line.labor_unit_price} onChange={(event) => updateManualLine(space, row.index, { labor_unit_price: event.target.value, unit_price: String(roundMoney(toNumber(event.target.value) + toNumber(line.material_unit_price))) })} placeholder="人工" inputMode="decimal" disabled={saving || disabled} className={styles.priceInputWide} /></td>
                                  <td><input value={line.material_unit_price} onChange={(event) => updateManualLine(space, row.index, { material_unit_price: event.target.value, unit_price: String(roundMoney(toNumber(line.labor_unit_price) + toNumber(event.target.value))) })} placeholder="材料" inputMode="decimal" disabled={saving || disabled} className={styles.priceInputWide} /></td>
                                  <td className={styles.amountCell}><span className={styles.amountBadge} data-tone={getAmountTone(diff.laborSignedAmount)}>{formatSignedAmount(diff.laborSignedAmount)}</span></td>
                                  <td className={styles.amountCell}><span className={styles.amountBadge} data-tone={getAmountTone(diff.materialSignedAmount)}>{formatSignedAmount(diff.materialSignedAmount)}</span></td>
                                  <td className={styles.amountCell}><span className={styles.amountBadge} data-tone={getAmountTone(diff.signedAmount)}>{formatSignedAmount(diff.signedAmount)}</span></td>
                                  <td className={styles.manualNoteCell}>
                                    <input value={line.evidence_note} onChange={(event) => updateManualLine(space, row.index, { evidence_note: event.target.value })} placeholder="说明" disabled={saving || disabled} className={styles.noteInput} />
                                    <button type="button" onClick={() => removeManualLine(space, row.index)} disabled={saving || disabled} className={styles.iconButton} title="删除新增项目"><Trash2 className="h-4 w-4" /></button>
                                  </td>
                                </tr>
                              );
                            })}
                            {spaceDraftLines.length > 0 && (
                              <tr className={styles.subtotalRow}>
                                <td>
                                  <strong>小计</strong>
                                  <small>已复核 {spaceDraftLines.length} 项</small>
                                </td>
                                <td className={styles.subtotalNote}>-</td>
                                <td className={styles.subtotalNote}>-</td>
                                <td className={styles.subtotalNote}>-</td>
                                <td className={styles.subtotalNote}>按项目单位查看</td>
                                <td className={styles.subtotalNote}>-</td>
                                <td className={styles.subtotalNote}>-</td>
                                <td className={styles.amountCell}>
                                  <span className={styles.amountBadge} data-tone={getAmountTone(spaceSubtotal.laborAmount)}>{formatSignedAmount(spaceSubtotal.laborAmount)}</span>
                                </td>
                                <td className={styles.amountCell}>
                                  <span className={styles.amountBadge} data-tone={getAmountTone(spaceSubtotal.materialAmount)}>{formatSignedAmount(spaceSubtotal.materialAmount)}</span>
                                </td>
                                <td className={styles.amountCell}>
                                  <span className={styles.amountBadge} data-tone={getAmountTone(spaceSubtotal.totalAmount)}>{formatSignedAmount(spaceSubtotal.totalAmount)}</span>
                                </td>
                                <td className={styles.subtotalNote}>-</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                        <button type="button" onClick={() => openManualLineDialog(space)} disabled={saving || disabled} className={styles.addLineButton}>
                          <Plus className="h-4 w-4" /> 在{space}新增项目
                        </button>
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </ThinScrollArea>
          <div className={styles.saveBar}>
            <div className={styles.saveSummary}>
              <strong data-tone={saveNotice?.tone || "muted"}>{saveNotice?.text || (draftLines.length > 0 ? `待保存 ${draftLines.length} 项` : "填写实际量或新增项目后保存")}</strong>
              <span>
                补收 <b data-tone="add">{formatPlainAmount(addAmount)}</b>
                <i />
                扣减 <b data-tone="deduct">{formatPlainAmount(deductAmount)}</b>
              </span>
            </div>
            <button type="button" className={styles.saveButton} onClick={submit} disabled={saving || disabled || draftLines.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
              保存本次复核
            </button>
          </div>
        </div>

      </div>
      {structureDialogOpen && (
        <div className={styles.modalLayer} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeStructureDialog();
        }}>
          <div className={styles.structureModal} role="dialog" aria-modal="true" aria-label={structureDialogMode === "space" ? "新增空间" : "新增大类"}>
            <div className={styles.modalHeader}>
              <div>
                <strong>{structureDialogMode === "space" ? "新增空间" : "新增大类"}</strong>
                <span>{structureDialogMode === "space" ? "用于预算外现场项目归属，创建后可在该空间新增项目" : "用于预算外项目分类，创建后可在新增项目时选择"}</span>
              </div>
              <button type="button" className={styles.modalCloseButton} onClick={closeStructureDialog} aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={styles.structureModalBody}>
              <div className={styles.structureModeTabs} role="tablist" aria-label="新增类型">
                <button
                  type="button"
                  data-active={structureDialogMode === "space" ? "true" : undefined}
                  onClick={() => {
                    setStructureDialogMode("space");
                    setStructureDraftName("");
                  }}
                >
                  新增空间
                </button>
                <button
                  type="button"
                  data-active={structureDialogMode === "category" ? "true" : undefined}
                  onClick={() => {
                    setStructureDialogMode("category");
                    setStructureDraftName("");
                  }}
                >
                  新增大类
                </button>
              </div>
              <label className={styles.manualField}>
                <span>{structureDialogMode === "space" ? "空间名称" : "大类名称"}</span>
                <input
                  value={structureDraftName}
                  onChange={(event) => setStructureDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") confirmStructureDialog();
                    if (event.key === "Escape") closeStructureDialog();
                  }}
                  placeholder={structureDialogMode === "space" ? "例如：阳台、地下室、临时区域" : "例如：泥工、木工、水电材料"}
                  disabled={saving || disabled}
                  className={styles.nameInput}
                  autoFocus
                />
              </label>
            </div>
            <div className={styles.modalFooter}>
              <div className={styles.modalDiffSummary}>
                <span>{structureDialogMode === "space" ? `当前 ${reviewSpaces.length} 个空间` : `当前 ${categoryOptions.length} 个大类`}</span>
              </div>
              <div className={styles.modalFooterActions}>
                <button type="button" className={styles.cancelButton} onClick={closeStructureDialog}>取消</button>
                <button type="button" className={styles.primaryButton} onClick={confirmStructureDialog} disabled={saving || disabled || !structureDraftName.trim()}>
                  确认新增
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {manualDialogSpace && (
        <div className={styles.modalLayer} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeManualDialog();
        }}>
          <div className={styles.manualModal} role="dialog" aria-modal="true" aria-label="新增项目">
            <div className={styles.modalHeader}>
              <div>
                <strong>新增项目</strong>
                <span>添加到 {manualDialogSpace}，确认后回填到工程量复核表</span>
              </div>
              <button type="button" className={styles.modalCloseButton} onClick={closeManualDialog} aria-label="关闭新增项目">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalMethodTabs} role="tablist" aria-label="新增项目方式">
                <button type="button" data-active={manualDialogMode === "library" ? "true" : undefined} onClick={() => setManualDialogMode("library")}>
                  从定额库选择
                </button>
                <button type="button" data-active={manualDialogMode === "manual" ? "true" : undefined} onClick={() => {
                  setManualDialogMode("manual");
                  setSelectedQuotaIds([]);
                }}>
                  手动录入
                </button>
              </div>

              {manualDialogMode === "library" && (
                <section className={styles.modalLibraryPanel}>
                  <div className={styles.quotaSearchHeader}>
                    <span>选择定额库项目</span>
                    <em>{selectedQuotaIds.length > 0 ? `已选 ${selectedQuotaIds.length} 项` : (quotaOptions.length > 0 ? `${filteredDialogQuotaOptions.total} / ${quotaOptions.length} 项` : "暂无数据")}</em>
                  </div>
                  <div className={styles.quotaSearchBox}>
                    <Search className="h-4 w-4" />
                    <input
                      value={manualDialogSearch}
                      onChange={(event) => setManualDialogSearch(event.target.value)}
                      placeholder="搜索项目名称，例如：防水 / 墙面 / 保护"
                      disabled={saving || disabled || quotaOptions.length === 0}
                      className={styles.quotaSearchInput}
                    />
                  </div>
                  <div className={styles.modalQuotaList}>
                    {filteredDialogQuotaOptions.items.length > 0 ? filteredDialogQuotaOptions.items.map((quota) => {
                      const quotaKey = `${quota.source}:${quota.id}`;
                      const selected = selectedQuotaIds.includes(quotaKey);
                      return (
                        <button
                          key={quotaKey}
                          type="button"
                          onClick={() => toggleManualDraftQuota(quotaKey)}
                          disabled={saving || disabled}
                          className={styles.quotaResultItem}
                          data-selected={selected ? "true" : undefined}
                        >
                          <i aria-hidden="true" />
                          <span>
                            <strong>{quota.name}</strong>
                          </span>
                          <b>{formatPlainAmount(toNumber(quota.laborPrice) + toNumber(quota.materialPrice))}/{quota.unit || "项"}</b>
                        </button>
                      );
                    }) : (
                      <div className={styles.quotaEmptyResult}>{filteredDialogQuotaOptions.keyword ? "没有匹配的定额项目，换个关键词试试" : "暂无可选择的定额项目"}</div>
                    )}
                  </div>
                </section>
              )}

              {manualDialogMode === "manual" && (
              <section className={styles.modalFormPanel}>
                <div className={styles.modalSectionTitle}>
                  <strong>项目信息</strong>
                  <span>适合临时项目，直接填写数量和单价</span>
                </div>
                <div className={styles.modalFormGrid}>
                  <label className={styles.manualField} data-size="name">
                    <span>项目名称</span>
                    <input value={manualDraft.title} onChange={(event) => updateManualDraft({ title: event.target.value })} placeholder="请输入新增项目名称" disabled={saving || disabled} className={styles.nameInput} />
                  </label>
                  <label className={styles.manualField}>
                    <span>类别</span>
                    <input value={manualDraft.category} onChange={(event) => updateManualDraft({ category: event.target.value })} placeholder="类别" disabled={saving || disabled} className={styles.noteInput} />
                    <div className={styles.categoryQuickList}>
                      {categoryOptions.map((category) => (
                        <button
                          key={category}
                          type="button"
                          data-active={manualDraft.category === category ? "true" : undefined}
                          onClick={() => updateManualDraft({ category })}
                          disabled={saving || disabled}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className={styles.manualField}>
                    <span>实际量 / 单位</span>
                    <div className={styles.manualInlineInputs}>
                      <input value={manualDraft.actual_quantity} onChange={(event) => updateManualDraft({ actual_quantity: event.target.value })} placeholder="数量" inputMode="decimal" disabled={saving || disabled} className={styles.qtyInput} />
                      <input value={manualDraft.unit} onChange={(event) => updateManualDraft({ unit: event.target.value })} placeholder="单位" disabled={saving || disabled} className={styles.unitInput} />
                    </div>
                  </label>
                  <label className={styles.manualField}>
                    <span>人工单价</span>
                    <input value={manualDraft.labor_unit_price} onChange={(event) => updateManualDraft({ labor_unit_price: event.target.value, unit_price: String(roundMoney(toNumber(event.target.value) + toNumber(manualDraft.material_unit_price))) })} placeholder="人工" inputMode="decimal" disabled={saving || disabled} className={styles.priceInputWide} />
                  </label>
                  <label className={styles.manualField}>
                    <span>材料单价</span>
                    <input value={manualDraft.material_unit_price} onChange={(event) => updateManualDraft({ material_unit_price: event.target.value, unit_price: String(roundMoney(toNumber(manualDraft.labor_unit_price) + toNumber(event.target.value))) })} placeholder="材料" inputMode="decimal" disabled={saving || disabled} className={styles.priceInputWide} />
                  </label>
                  <label className={styles.manualField} data-size="note">
                    <span>说明</span>
                    <input value={manualDraft.evidence_note} onChange={(event) => updateManualDraft({ evidence_note: event.target.value })} placeholder="填写测量说明" disabled={saving || disabled} className={styles.noteInput} />
                  </label>
                </div>
              </section>
              )}
            </div>

            <div className={styles.modalFooter}>
              {manualDialogMode === "manual" ? (
                <div className={styles.modalDiffSummary}>
                  <span>人工 <b data-tone={getAmountTone(manualDraftDiff.laborSignedAmount)}>{formatSignedAmount(manualDraftDiff.laborSignedAmount)}</b></span>
                  <span>材料 <b data-tone={getAmountTone(manualDraftDiff.materialSignedAmount)}>{formatSignedAmount(manualDraftDiff.materialSignedAmount)}</b></span>
                  <span>差额 <b data-tone={getAmountTone(manualDraftDiff.signedAmount)}>{formatSignedAmount(manualDraftDiff.signedAmount)}</b></span>
                </div>
              ) : (
                <div className={styles.modalDiffSummary}>
                  <span>已选 <b>{selectedQuotaIds.length}</b> 项</span>
                  <span>添加后可在表格中填写实际量</span>
                </div>
              )}
              <div className={styles.modalFooterActions}>
                <button type="button" className={styles.cancelButton} onClick={closeManualDialog}>取消</button>
                <button type="button" className={styles.primaryButton} onClick={confirmManualDialog} disabled={saving || disabled || (manualDialogMode === "library" && selectedQuotaIds.length === 0)}>
                  {manualDialogMode === "library" ? `添加${selectedQuotaIds.length > 0 ? ` ${selectedQuotaIds.length} ` : ""}项到复核表` : "添加到复核表"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
