"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { calculateChargeableOtherFeeTotals, calculateOtherFeeTotals, getFeeFormulaText, getFeeRuleText, toMoney, toNumber, type FeeFormulaContext } from "@/lib/quotationFeeFormulas";
import { getQuotationRowColor } from "@/lib/quotationRowColors";
import { formatAlphaSequence } from "@/lib/quotationSequence";
import { normalizeQuotationSignatureLabels } from "@/lib/quotationPrintSettings";
import NativeImage from "@/components/ui/NativeImage";

export type PrintableQuotationItem = {
  id?: string;
  category: string;
  space?: string;
  work_type_id?: string | null;
  work_type_name?: string | null;
  material_category_id?: string | null;
  material_category_name?: string | null;
  name: string;
  spec?: string | null;
  material_model?: string | null;
  remark?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  total_price?: number;
  material_cost?: number;
  labor_cost?: number;
  profit_margin?: number;
  row_color?: string | null;
  fee_calc_method?: string | null;
  fee_calc_base?: string | null;
  fee_rate?: number | null;
  fee_scope_mode?: string | null;
  fee_scope_space_ids?: string[] | string | null;
  fee_scope_space_names?: string[] | string | null;
};

export type PrintableQuotationSettings = {
  managementFeeRate?: number;
  taxRate?: number;
  discount?: number;
  discountType?: "fee" | "space" | "work_type";
  discountMode?: "amount" | "rate";
  discountRate?: number;
  discountScope?: string;
  discountSpace?: string;
  discountWorkType?: string;
  discountRules?: DiscountRule[];
  excludeSpecificDiscountAmount?: number;
  excludeSpecialDiscountItems?: boolean;
  excludeLaborOnlyDiscountItems?: boolean;
  warrantyMonths?: number;
  appendixNote?: string | null;
  quotationNote?: string | null;
  budgetCompilationHtml?: string | null;
  budgetCompilation?: string | null;
  quoteSpaces?: string[];
  quoteCategories?: string[];
  signatureLabels?: string[];
  validUntil?: string | null;
  quotationValidUntil?: string | null;
  effectiveUntil?: string | null;
  valid_until?: string | null;
};

export type PrintableQuotationDetail = {
  id?: string;
  company_name?: string | null;
  branch_company_logo_url?: string | null;
  branch_company_legal_name?: string | null;
  branch_company_short_name?: string | null;
  branch_company_phone?: string | null;
  title?: string | null;
  quotation_type?: string | null;
  project_name?: string | null;
  project_address?: string | null;
  project_area?: number | null;
  customer_area_size?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_building_no?: string | null;
  customer_unit_no?: string | null;
  customer_room_no?: string | null;
  customer_no_room_number?: boolean | number | null;
  creator_name?: string | null;
  designer_name?: string | null;
  version?: number | null;
  status?: string | null;
  terms?: string | null;
  notes?: string | null;
  customer_visible_note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type QuotationOutputMode = "list" | "composition";
export type QuotationPrintScope = "all" | "all_without_cover" | "base" | "main_material" | "custom_cabinet" | "fees";
export type QuotationBaseColumnKey = "materialUnit" | "materialTotal" | "laborUnit" | "laborTotal" | "subtotal" | "description";
export type QuotationBaseColumnOptions = Record<QuotationBaseColumnKey, boolean>;

type Totals = {
  baseAmount: number;
  materialAmount: number;
  mainMaterialAmount?: number;
  customCategoryAmount?: number;
  otherAmount: number;
  directAmount: number;
  managementFee: number;
  taxAmount: number;
  discount: number;
  finalAmount: number;
  feeFormulaContext: FeeFormulaContext;
};

type AppendixNotePart = {
  label?: string;
  content: string;
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

const emptyText = "-";
const defaultQuoteCategories = ["base", "main_material", "custom_cabinet", "other"];
const defaultBaseColumnOptions: QuotationBaseColumnOptions = {
  materialUnit: true,
  materialTotal: true,
  laborUnit: true,
  laborTotal: true,
  subtotal: true,
  description: true,
};
const builtInCategoryLabels: Record<string, string> = {
  base: "基装",
  main_material: "主材",
  custom_cabinet: "定制柜",
  other: "综合费用",
};

function getCategoryKey(category: unknown) {
  const name = String(category || "").trim();
  if (name === "base" || name === "基装" || name === "基础") return "base";
  if (name === "main_material" || name === "主材" || name === "产品") return "main_material";
  if (name === "custom_cabinet" || name === "定制柜" || name === "定制柜项目") return "custom_cabinet";
  if (name === "other" || name === "综合费用") return "other";
  return name;
}

function isBaseCategory(category: unknown) {
  return getCategoryKey(category) === "base";
}

function isOtherCategory(category: unknown) {
  return getCategoryKey(category) === "other";
}

function isCustomCabinetCategory(category: unknown) {
  return getCategoryKey(category) === "custom_cabinet";
}

function getDiscountScopeLabel(settings?: PrintableQuotationSettings) {
  if (settings?.discountType === "space") {
    return String(settings.discountSpace || "").trim() || "空间/类别";
  }
  if (settings?.discountType === "work_type") {
    return String(settings.discountWorkType || "").trim() || "工种";
  }
  const scope = settings?.discountScope;
  const value = String(scope || "total").trim();
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

function getDiscountScopeLabelByValue(value: string) {
  const normalized = String(value || "total").trim();
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
  if (labels[normalized]) return labels[normalized];
  if (normalized.startsWith("category:")) return normalized.slice("category:".length) || "总价";
  return "总价";
}

function getCategoryLabel(category: string) {
  const key = getCategoryKey(category);
  return builtInCategoryLabels[key] || category;
}

function orderQuoteCategories(categories: string[]) {
  const normalized = uniqueValues(categories.map((category) => category.trim()).filter(Boolean));
  const customCategories = normalized.filter((category) => !defaultQuoteCategories.includes(getCategoryKey(category)));
  return ["base", "main_material", "custom_cabinet", ...customCategories, "other"];
}

function inferItemSpace(item: Partial<PrintableQuotationItem>) {
  const current = String(item.space || "").trim();
  if (current) return current;
  if (isOtherCategory(item.category)) return "";
  return "未指定空间";
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getBasePriceParts(item: PrintableQuotationItem) {
  const quantity = toNumber(item.quantity);
  const materialUnit = toNumber(item.material_cost);
  const rawLaborUnit = toNumber(item.labor_cost);
  const laborUnit = materialUnit || rawLaborUnit ? rawLaborUnit : toNumber(item.unit_price);
  return {
    quantity,
    materialUnit,
    materialTotal: quantity * materialUnit,
    laborUnit,
    laborTotal: quantity * laborUnit,
    total: quantity * (materialUnit + laborUnit),
  };
}

function getItemUnitPrice(item: PrintableQuotationItem) {
  if (!isBaseCategory(item.category)) return toNumber(item.unit_price);
  const parts = getBasePriceParts(item);
  return parts.materialUnit + parts.laborUnit;
}

function getCustomCabinetArea(item: PrintableQuotationItem) {
  return toMoney(toNumber(item.material_cost) * toNumber(item.labor_cost) / 1000000);
}

function getItemTotal(item: PrintableQuotationItem) {
  if (isCustomCabinetCategory(item.category)) {
    const area = getCustomCabinetArea(item);
    return toMoney(toNumber(item.quantity) * (area > 0 ? area : 1) * toNumber(item.unit_price));
  }
  return toMoney(toNumber(item.quantity) * getItemUnitPrice(item));
}

function getItemLaborSubtotal(item: PrintableQuotationItem) {
  if (isOtherCategory(item.category)) return 0;
  const factor = isCustomCabinetCategory(item.category) ? Math.max(1, getCustomCabinetArea(item)) : 1;
  return toMoney(toNumber(item.quantity) * factor * toNumber(item.labor_cost));
}

function getItemMaterialSubtotal(item: PrintableQuotationItem) {
  if (isOtherCategory(item.category)) return 0;
  const factor = isCustomCabinetCategory(item.category) ? Math.max(1, getCustomCabinetArea(item)) : 1;
  return toMoney(toNumber(item.quantity) * factor * toNumber(item.material_cost));
}

function isSpecialQuoteItem(item?: Pick<PrintableQuotationItem, "row_color"> | null) {
  return String(item?.row_color || "") === "special";
}

function isLaborOnlyQuoteItem(item: PrintableQuotationItem) {
  if (!isBaseCategory(item.category)) return false;
  return getItemMaterialSubtotal(item) <= 0 && getItemLaborSubtotal(item) > 0;
}

function isExcludedFromDiscount(item: PrintableQuotationItem, settings?: PrintableQuotationSettings) {
  if (settings?.excludeSpecialDiscountItems && isSpecialQuoteItem(item)) return true;
  if (settings?.excludeLaborOnlyDiscountItems && isLaborOnlyQuoteItem(item)) return true;
  return false;
}

function getDiscountableItems(items: PrintableQuotationItem[], settings?: PrintableQuotationSettings) {
  return items.filter((item) => !isExcludedFromDiscount(item, settings));
}

function getDiscountScopeOptions(items: PrintableQuotationItem[], settings: PrintableQuotationSettings | undefined, totals: { otherAmount: number }, houseArea = 0): DiscountScopeOption[] {
  const discountableItems = getDiscountableItems(items, settings);
  const feeContext = buildFeeFormulaContext(discountableItems, settings?.quoteCategories, houseArea);
  const customCategoryOptions = Object.entries(feeContext.categoryAmounts || {}).map(([label, amount]) => ({
    value: `category:${label}`,
    label,
    amount: toMoney(toNumber(amount)),
  }));
  const customCabinetAmount = discountableItems
    .filter((item) => isCustomCabinetCategory(item.category))
    .reduce((sum, item) => toMoney(sum + getItemTotal(item)), 0);
  const discountableBaseAmount = discountableItems.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => toMoney(sum + getItemTotal(item)), 0);
  const discountableProductAmount = discountableItems.filter((item) => getCategoryKey(item.category) === "main_material").reduce((sum, item) => toMoney(sum + getItemTotal(item)), 0);
  const discountableCustomCategoryAmount = discountableItems
    .filter((item) => !isBaseCategory(item.category) && !isOtherCategory(item.category) && getCategoryKey(item.category) !== "main_material")
    .reduce((sum, item) => toMoney(sum + getItemTotal(item)), 0);
  const discountableDirectAmount = discountableBaseAmount + discountableProductAmount + discountableCustomCategoryAmount;
  const fixedOptions: DiscountScopeOption[] = [
    { value: "base", label: "基装直接费", amount: discountableBaseAmount },
    { value: "base_labor", label: "基装直接费（人工）", amount: discountableItems.reduce((sum, item) => toMoney(sum + getItemLaborSubtotal(item)), 0) },
    { value: "base_material", label: "基装直接费（材料）", amount: discountableItems.reduce((sum, item) => toMoney(sum + getItemMaterialSubtotal(item)), 0) },
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

function getDiscountSpaceOptions(items: PrintableQuotationItem[], settings?: PrintableQuotationSettings): DiscountScopeOption[] {
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
      .reduce((sum, item) => toMoney(sum + getItemTotal(item)), 0),
  }));
}

function getDiscountWorkTypeOptions(items: PrintableQuotationItem[], settings?: PrintableQuotationSettings): DiscountScopeOption[] {
  const discountableItems = getDiscountableItems(items, settings);
  const workTypes = uniqueValues(items.filter((item) => !isOtherCategory(item.category)).map((item) => String(item.work_type_name || "").trim()));
  return workTypes.map((workType) => ({
    value: `work_type:${workType}`,
    label: workType,
    amount: discountableItems
      .filter((item) => !isOtherCategory(item.category) && String(item.work_type_name || "").trim() === workType)
      .reduce((sum, item) => toMoney(sum + getItemTotal(item)), 0),
  }));
}

function getLegacyDiscountRule(settings?: PrintableQuotationSettings): DiscountRule | null {
  const discount = Math.max(0, toNumber(settings?.discount));
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
    rate: Math.min(1, Math.max(0, toNumber(settings?.discountRate || 1))),
  };
}

function getDiscountRules(settings?: PrintableQuotationSettings): DiscountRule[] {
  const hasRuleList = Array.isArray(settings?.discountRules);
  const rawRules = hasRuleList ? settings?.discountRules || [] : [];
  const rules = rawRules
    .map((rule, index): DiscountRule => ({
      id: String(rule?.id || `rule_${index}`),
      type: rule?.type === "space" || rule?.type === "work_type" ? rule.type : "fee",
      mode: rule?.mode === "rate" ? "rate" : "amount",
      scope: String(rule?.scope || "total"),
      space: String(rule?.space || ""),
      workType: String(rule?.workType || ""),
      discount: Math.max(0, toNumber(rule?.discount)),
      rate: Math.min(1, Math.max(0, toNumber(rule?.rate || 1))),
    }))
    .filter((rule) => rule.mode === "rate" ? toNumber(rule.rate) < 1 : toNumber(rule.discount) > 0);
  if (hasRuleList) return rules;
  const legacyRule = getLegacyDiscountRule(settings);
  return legacyRule ? [legacyRule] : [];
}

function getDiscountRuleValue(rule: DiscountRule) {
  if (rule.type === "space") return rule.space ? `space:${rule.space}` : "";
  if (rule.type === "work_type") return rule.workType ? `work_type:${rule.workType}` : "";
  return rule.scope || "total";
}

function getDiscountRuleScope(rule: DiscountRule, items: PrintableQuotationItem[], settings: PrintableQuotationSettings | undefined, totals: { otherAmount: number }, houseArea = 0) {
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

function getDiscountRuleAmount(rule: DiscountRule, items: PrintableQuotationItem[], settings: PrintableQuotationSettings | undefined, totals: { otherAmount: number }, houseArea = 0) {
  const scope = getDiscountRuleScope(rule, items, settings, totals, houseArea);
  const scopeAmount = Math.max(0, toNumber(scope?.amount));
  const excludedAmount = Math.min(scopeAmount, Math.max(0, toNumber(settings?.excludeSpecificDiscountAmount)));
  const baseAmount = Math.max(0, scopeAmount - excludedAmount);
  if (baseAmount <= 0) return 0;
  if (rule.mode === "rate") return toMoney(baseAmount * (1 - Math.min(1, Math.max(0, toNumber(rule.rate || 1)))));
  return toMoney(Math.min(Math.max(0, toNumber(rule.discount)), baseAmount));
}

function getDiscountRuleRows(items: PrintableQuotationItem[], settings: PrintableQuotationSettings | undefined, totals: { otherAmount: number }, houseArea = 0) {
  return getDiscountRules(settings)
    .map((rule) => {
      const scope = getDiscountRuleScope(rule, items, settings, totals, houseArea);
      const amount = getDiscountRuleAmount(rule, items, settings, totals, houseArea);
      const label = scope?.label || (rule.type === "space" ? rule.space : rule.type === "work_type" ? rule.workType : getDiscountScopeLabelByValue(rule.scope || "total")) || "优惠对象";
      const rateText = `${(toNumber(rule.rate || 1) * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
      const discountRateText = `${((1 - toNumber(rule.rate || 1)) * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
      return {
        id: rule.id,
        label,
        formula: rule.mode === "rate" ? `${label} × ${rateText}` : `${label}优惠`,
        ruleText: rule.mode === "rate"
          ? `${label}按${rateText}折扣系数计算，折扣优惠金额 ${formatPrintAmount(amount)}（${formatPrintAmount(toNumber(scope?.amount))} × ${discountRateText}）`
          : `${label}直接优惠金额 ${formatPrintAmount(amount)}`,
        amount,
      };
    })
    .filter((row) => row.amount > 0);
}

function buildCostComposition(items: PrintableQuotationItem[]) {
  const addAmount = (map: Map<string, number>, name: string, amount: number) => {
    if (amount <= 0) return;
    const label = name.trim() || "未指定";
    map.set(label, toMoney((map.get(label) || 0) + amount));
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

function buildFeeFormulaContext(items: PrintableQuotationItem[], categories: string[] = [], houseArea = 0): FeeFormulaContext {
  const orderedCategories = orderQuoteCategories([...categories, ...items.map((item) => item.category)]);
  const mainMaterialAmount = items
    .filter((item) => getCategoryKey(item.category) === "main_material")
    .reduce((sum, item) => sum + getItemTotal(item), 0);
  const laborAmount = items
    .filter((item) => isBaseCategory(item.category))
    .reduce((sum, item) => sum + getBasePriceParts(item).laborTotal, 0);
  const materialCostAmount = items
    .filter((item) => isBaseCategory(item.category))
    .reduce((sum, item) => sum + getBasePriceParts(item).materialTotal, 0);
  const categoryAmounts: Record<string, number> = {};

  orderedCategories
    .filter((category) => !isBaseCategory(category) && !isOtherCategory(category) && getCategoryKey(category) !== "main_material")
    .forEach((category) => {
      categoryAmounts[getCategoryLabel(category)] = 0;
    });

  items.forEach((item) => {
    const category = String(item.category || "").trim();
    if (!category || isBaseCategory(category) || isOtherCategory(category) || getCategoryKey(category) === "main_material") return;
    const label = getCategoryLabel(category);
    categoryAmounts[label] = toMoney(toNumber(categoryAmounts[label]) + getItemTotal(item));
  });

  const customCategoryAmount = Object.values(categoryAmounts).reduce((sum, amount) => sum + toNumber(amount), 0);
  return {
    houseArea,
    mainMaterialAmount,
    directItemAmount: mainMaterialAmount + customCategoryAmount,
    laborAmount,
    materialCostAmount,
    categoryAmounts,
    directItems: items
      .filter((item) => !isOtherCategory(item.category))
      .map((item) => ({
        category: getCategoryKey(item.category),
        categoryLabel: getCategoryLabel(item.category),
        space: inferItemSpace(item),
        total: getItemTotal(item),
        laborAmount: getItemLaborSubtotal(item),
        materialCostAmount: getItemMaterialSubtotal(item),
      })),
  };
}

function shouldShowAutoOtherFeeRule(item: PrintableQuotationItem) {
  const name = String(item.name || "").trim();
  return name === "工程直接费" || name === "直接费" || name === "工程总造价" || name === "总造价";
}

function getOtherFeeRuleDisplay(item: PrintableQuotationItem, total: number, context?: FeeFormulaContext) {
  const remark = String(item.remark || "").trim();
  if (!shouldShowAutoOtherFeeRule(item)) return remark;

  const rule = getFeeRuleText(item, total, { currencySymbol: false, useGrouping: false, includeMethodLabel: false }, context);
  return remark ? `${remark}；${rule}` : rule;
}

function calculateQuotationTotals(items: PrintableQuotationItem[], settings?: PrintableQuotationSettings, houseArea = 0): Totals {
  const baseAmount = items.filter((item) => isBaseCategory(item.category)).reduce((sum, item) => sum + getItemTotal(item), 0);
  const mainMaterialAmount = items.filter((item) => getCategoryKey(item.category) === "main_material").reduce((sum, item) => sum + getItemTotal(item), 0);
  const customCategoryAmount = items.filter((item) => !isBaseCategory(item.category) && !isOtherCategory(item.category) && getCategoryKey(item.category) !== "main_material").reduce((sum, item) => sum + getItemTotal(item), 0);
  const materialAmount = mainMaterialAmount + customCategoryAmount;
  const otherItems = items.filter((item) => isOtherCategory(item.category));
  const feeFormulaContext = buildFeeFormulaContext(items, settings?.quoteCategories, houseArea);
  const otherAmount = calculateChargeableOtherFeeTotals(otherItems, baseAmount, materialAmount, feeFormulaContext).reduce((sum, amount) => sum + amount, 0);
  const directAmount = baseAmount + materialAmount + otherAmount;
  const managementFee = 0;
  const discountRuleRows = getDiscountRuleRows(items, settings, { otherAmount }, houseArea);
  const ruleDiscount = discountRuleRows.reduce((sum, row) => toMoney(sum + row.amount), 0);
  const discount = Math.min(directAmount, Math.max(0, discountRuleRows.length > 0 ? ruleDiscount : toNumber(settings?.discount)));
  const taxAmount = Math.max(0, directAmount - discount) * toNumber(settings?.taxRate) / 100;
  const finalAmount = Math.max(0, directAmount + taxAmount - discount);
  return { baseAmount, materialAmount, mainMaterialAmount, customCategoryAmount, otherAmount, directAmount, managementFee, taxAmount, discount, finalAmount, feeFormulaContext };
}

function groupItemsBySpace(items: PrintableQuotationItem[], settings?: PrintableQuotationSettings) {
  const spaceOrder = uniqueValues([...(settings?.quoteSpaces || []), ...items.map((item) => inferItemSpace(item))]);
  return spaceOrder
    .map((space) => ({
      space,
      items: items.filter((item) => inferItemSpace(item) === space),
    }))
    .filter((group) => group.items.length > 0);
}

function formatQuantity(value: number) {
  const next = toNumber(value);
  if (Number.isInteger(next)) return String(next);
  return next.toFixed(2).replace(/\.?0+$/, "");
}

function formatPrintAmount(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function text(value?: string | number | null) {
  if (value === 0) return "0";
  const next = String(value || "").trim();
  if (!next || next === "仅微信联系") return emptyText;
  return next;
}

function maskCustomerPhone(value?: string | null) {
  const phone = String(value || "").trim();
  if (!phone || phone === "仅微信联系") return emptyText;
  return /^1\d{10}$/.test(phone) ? phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") : phone;
}

function buildAppendixNoteParts(settings?: PrintableQuotationSettings, quotation?: PrintableQuotationDetail | null): AppendixNotePart[] {
  const templateNote = String(settings?.appendixNote || settings?.quotationNote || "").trim();
  const customerNote = String(quotation?.customer_visible_note || "").trim();
  const parts: AppendixNotePart[] = [];
  if (templateNote) parts.push({ content: templateNote });
  if (customerNote && customerNote !== templateNote) parts.push({ label: "报价备注", content: customerNote });
  return parts;
}

function getBudgetCompilationHtml(settings?: PrintableQuotationSettings) {
  const html = String(settings?.budgetCompilationHtml || settings?.budgetCompilation || "").trim();
  const readableText = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  if (!readableText) return "";
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+=(["']).*?\1/gi, "")
    .replace(/\s(href|src)=(["'])javascript:[\s\S]*?\2/gi, "");
}

function cleanQuotationTitle(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/(?:装修)?报价单$/g, "")
    .trim();
}

function normalizeRoomPart(value: string | null | undefined, suffixes: string[]) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  const suffix = suffixes.find((item) => cleaned.endsWith(item));
  return suffix ? cleaned.slice(0, -suffix.length) : cleaned;
}

function buildPrintProjectRoomNumber(quotation?: PrintableQuotationDetail | null) {
  if (quotation?.customer_no_room_number === true || quotation?.customer_no_room_number === 1) return "暂无房号";
  const building = normalizeRoomPart(quotation?.customer_building_no, ["号楼", "栋", "幢", "座"]);
  const unit = normalizeRoomPart(quotation?.customer_unit_no, ["单元"]);
  const room = normalizeRoomPart(quotation?.customer_room_no, ["室", "房", "号"]);
  return [building, unit, room].filter(Boolean).join("-");
}

function getPrintCommunityText(quotation?: PrintableQuotationDetail | null) {
  return String(quotation?.customer_address || quotation?.project_address || quotation?.project_name || "").trim();
}

function getPrintProjectAddressText(quotation?: PrintableQuotationDetail | null) {
  return getPrintSiteTitleText(quotation);
}

function getPrintSiteTitleText(quotation?: PrintableQuotationDetail | null) {
  const community = getPrintCommunityText(quotation);
  const room = buildPrintProjectRoomNumber(quotation);
  const projectName = String(quotation?.project_name || "").trim();
  if (community && room && room !== "暂无房号" && room !== community) return `${community} ${room}`;
  return community || projectName || room || "";
}

function buildQuotationDisplayTitle(quotation?: PrintableQuotationDetail | null) {
  const customerName = String(quotation?.customer_name || "").trim();
  const siteName = getPrintSiteTitleText(quotation);
  const fallbackTitle = cleanQuotationTitle(quotation?.title);
  if (customerName && siteName) {
    return siteName.includes(customerName) ? siteName : `${customerName} · ${siteName}`;
  }
  return fallbackTitle || customerName || siteName || "客户工地";
}

function statusText(value?: string | null) {
  return String(value || "").toUpperCase() === "APPROVED" ? "正式报价" : "未正式报价";
}

function printRowStyle(value?: string | null) {
  const color = getQuotationRowColor(value);
  return color.background ? { backgroundColor: color.background } : undefined;
}

function qrCodeUrl(target: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&ecc=L&v=2026090603&data=${encodeURIComponent(target)}`;
}

function getCompactQuotationShareUrl(target: string) {
  if (!target) return "";
  try {
    const url = new URL(target);
    const match = url.pathname.match(/^\/quotation-share\/([^/]+)$/);
    if (!match?.[1]) return target;
    const currentOrigin = typeof window !== "undefined" ? window.location.origin : url.origin;
    return `${currentOrigin}/q/${match[1]}`;
  } catch {
    return target;
  }
}

function formatChineseDate(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatPrintDateTime(value?: string | Date | null) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    const matched = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matched) return `${matched[1]}-${matched[2]}-${matched[3]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (next: number) => String(next).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getCurrentYearLastDay() {
  return formatChineseDate(new Date(new Date().getFullYear(), 11, 31));
}

function PrintCoverPage({
  quotation,
}: {
  quotation?: PrintableQuotationDetail | null;
}) {
  const fields = [
    { label: "客户姓名", value: quotation?.customer_name },
    { label: "楼盘小区", value: getPrintSiteTitleText(quotation) },
    { label: "联系电话", value: maskCustomerPhone(quotation?.customer_phone) },
    { label: "报价人", value: quotation?.creator_name },
    { label: "设计师", value: quotation?.designer_name },
  ];
  const brandLogoUrl = String(quotation?.branch_company_logo_url || "").trim() || "/brand/xingyi-decoration-logo.png";
  const brandShortName = String(quotation?.branch_company_short_name || "").trim();
  const legalCompanyName = String(quotation?.branch_company_legal_name || "").trim();
  const coverCompanyName = legalCompanyName || (brandShortName ? `${brandShortName}工程有限公司` : quotation?.company_name || "装修公司");
  const displayTitle = buildQuotationDisplayTitle(quotation);

  return (
    <section className="quotation-print-cover-page">
      <div className="quotation-print-cover-main">
        <h1>
          <span>{text(coverCompanyName)}</span>
        </h1>
        <h2>{displayTitle}</h2>
        <p>报价执行有效期：{getCurrentYearLastDay()}</p>
      </div>

      <div className="quotation-print-cover-fields">
        {fields.map((field) => (
          <div key={field.label} className="quotation-print-cover-field">
            <span>{field.label.split("").join("  ")}：</span>
            <strong>{text(field.value)}</strong>
          </div>
        ))}
      </div>

      <div className="quotation-print-cover-brand">
        <span />
        <div className="quotation-print-cover-brand-mark">
          <NativeImage src={brandLogoUrl} alt="公司 logo" loading="eager" />
        </div>
        <span />
      </div>
    </section>
  );
}

function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`quotation-print-section ${className}`.trim()}>
      <div className="quotation-print-section-heading">
        <h2>{title}</h2>
        <span />
      </div>
      {children}
    </section>
  );
}

function CostCompositionOverview({
  workTypes,
  materialCategories,
}: {
  workTypes: { name: string; amount: number }[];
  materialCategories: { name: string; amount: number }[];
}) {
  const renderRows = (rows: { name: string; amount: number }[], emptyText: string) => (
    <div className="quotation-print-composition-rows">
      {rows.length === 0 ? (
        <p className="quotation-print-composition-empty">{emptyText}</p>
      ) : rows.slice(0, 10).map((row) => (
        <div key={row.name} className="quotation-print-composition-row">
          <span>{row.name}</span>
          <strong>{formatPrintAmount(row.amount)}</strong>
        </div>
      ))}
    </div>
  );

  return (
    <section className="quotation-print-composition">
      <div className="quotation-print-composition-card">
        <h3>按工种汇总</h3>
        {renderRows(workTypes, "暂无人工费用归属")}
      </div>
      <div className="quotation-print-composition-card">
        <h3>按材料分类汇总</h3>
        {renderRows(materialCategories, "暂无材料费用归属")}
      </div>
    </section>
  );
}

function CompositionSummaryTable({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: { name: string; amount: number }[];
  emptyText: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div className="quotation-print-composition-table-wrap">
      <p className="quotation-print-composition-table-title">{title}</p>
      <table className="quotation-print-table quotation-print-composition-table">
        <colgroup>
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>分类名称</th>
            <th className="text-right">金额</th>
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? rows.map((row) => (
            <tr key={row.name}>
              <td className="quotation-print-item-name">{row.name}</td>
              <td className="text-right">{formatPrintAmount(row.amount)}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={2} className="py-8 text-center text-surface-400">{emptyText}</td>
            </tr>
          )}
          <tr className="quotation-print-total-row">
            <td className="text-right">{title.replace(/汇总$/, "")}小计</td>
            <td className="text-right">{formatPrintAmount(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CompositionDetails({
  workTypes,
  materialCategories,
}: {
  workTypes: { name: string; amount: number }[];
  materialCategories: { name: string; amount: number }[];
}) {
  return (
    <div className="quotation-print-composition-detail-grid">
      <CompositionSummaryTable title="工种费用汇总" rows={workTypes} emptyText="暂无人工费用归属" />
      <CompositionSummaryTable title="材料分类汇总" rows={materialCategories} emptyText="暂无材料费用归属" />
    </div>
  );
}

const chineseSectionNumbers = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

function formatBaseSectionNumber(index: number) {
  if (index < chineseSectionNumbers.length) return chineseSectionNumbers[index];
  return String(index + 1);
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

function getBaseRowDescription(item: PrintableQuotationItem) {
  const spec = stripQuotaCodeText(item.spec);
  const remark = isQuotaCodeOnly(item.remark) ? "" : stripQuotaCodeText(item.remark);
  return uniqueValues([spec, remark]).join("；");
}

function normalizeBaseColumnOptions(columns?: Partial<QuotationBaseColumnOptions>): QuotationBaseColumnOptions {
  return { ...defaultBaseColumnOptions, ...(columns || {}) };
}

function BaseDetailsTable({ items, settings, baseColumns }: { items: PrintableQuotationItem[]; settings?: PrintableQuotationSettings; baseColumns?: Partial<QuotationBaseColumnOptions> }) {
  const groups = groupItemsBySpace(items, settings);
  let rowNumber = 0;
  const baseTotal = items.reduce((sum, item) => sum + getItemTotal(item), 0);
  const baseMaterialTotal = items.reduce((sum, item) => sum + getBasePriceParts(item).materialTotal, 0);
  const baseLaborTotal = items.reduce((sum, item) => sum + getBasePriceParts(item).laborTotal, 0);
  const columnOptions = normalizeBaseColumnOptions(baseColumns);
  const columns: {
    key: "sequence" | "name" | "quantity" | "unit" | QuotationBaseColumnKey;
    top: string;
    bottom?: string;
    group?: "material" | "labor";
    className?: string;
    align?: "left" | "center" | "right";
    amount?: boolean;
  }[] = [
    { key: "sequence", top: "序号", className: "text-center", align: "center" },
    { key: "name", top: "工程项目", className: "text-center", align: "left" },
    { key: "quantity", top: "数量", className: "text-center", align: "center" },
    { key: "unit", top: "单位", className: "text-center", align: "center" },
    ...(columnOptions.materialUnit ? [{ key: "materialUnit" as const, top: "材料", bottom: "单价", group: "material" as const, className: "text-center", align: "right" as const, amount: true }] : []),
    ...(columnOptions.materialTotal ? [{ key: "materialTotal" as const, top: "材料", bottom: "合价", group: "material" as const, className: "text-center", align: "right" as const, amount: true }] : []),
    ...(columnOptions.laborUnit ? [{ key: "laborUnit" as const, top: "人工", bottom: "单价", group: "labor" as const, className: "text-center", align: "right" as const, amount: true }] : []),
    ...(columnOptions.laborTotal ? [{ key: "laborTotal" as const, top: "人工", bottom: "合价", group: "labor" as const, className: "text-center", align: "right" as const, amount: true }] : []),
    ...(columnOptions.subtotal ? [{ key: "subtotal" as const, top: "小计", className: "quotation-print-base-subtotal-head text-center", align: "right" as const, amount: true }] : []),
    ...(columnOptions.description ? [{ key: "description" as const, top: "施工工艺及材料说明", className: "text-center", align: "left" as const }] : []),
  ];
  const colSpan = columns.length;
  const materialColumns = columns.filter((column) => column.group === "material");
  const laborColumns = columns.filter((column) => column.group === "labor");
  const hasGroupedPriceColumns = materialColumns.length > 0 || laborColumns.length > 0;
  const headerTopCells = columns.flatMap((column, index) => {
    if (!column.group) {
      return [<th key={column.key} rowSpan={hasGroupedPriceColumns ? 2 : undefined} className={column.className}>{column.top}</th>];
    }
    if (columns[index - 1]?.group === column.group) return [];
    const groupColumns = columns.filter((item) => item.group === column.group);
    return [
      <th key={column.group} colSpan={groupColumns.length} className={`${column.group === "labor" ? "quotation-print-base-labor-head " : ""}text-center`}>
        {column.top}
      </th>,
    ];
  });
  const cellClassName = (column: (typeof columns)[number]) => {
    if (column.key === "name") return "quotation-print-base-name";
    if (column.key === "description") return "quotation-print-base-description";
    if (column.align === "right") return "text-right";
    if (column.align === "center") return "text-center";
    return "";
  };
  const baseCellValue = (column: (typeof columns)[number], item: PrintableQuotationItem, parts: ReturnType<typeof getBasePriceParts>, rowIndex: number, description: string) => {
    const values: Record<(typeof columns)[number]["key"], ReactNode> = {
      sequence: rowIndex,
      name: text(item.name),
      quantity: formatQuantity(parts.quantity),
      unit: text(item.unit),
      materialUnit: formatPrintAmount(parts.materialUnit),
      materialTotal: formatPrintAmount(parts.materialTotal),
      laborUnit: formatPrintAmount(parts.laborUnit),
      laborTotal: formatPrintAmount(parts.laborTotal),
      subtotal: formatPrintAmount(parts.total),
      description: text(description),
    };
    return values[column.key];
  };
  const firstSummaryColumnIndex = columns.findIndex((column) => column.key === "materialTotal" || column.key === "laborTotal" || column.key === "subtotal");
  const summaryLabelEndIndex = Math.max(0, (firstSummaryColumnIndex >= 0 ? firstSummaryColumnIndex : columns.length) - 1);

  return (
	    <table className="quotation-print-table quotation-print-base-table">
        <colgroup>
          {columns.map((column) => <col key={column.key} />)}
        </colgroup>
	      <thead>
	        <tr>
            {headerTopCells}
	        </tr>
          {hasGroupedPriceColumns ? (
            <tr>
              {[...materialColumns, ...laborColumns].map((column) => (
                <th key={column.key} className="text-center">{column.bottom}</th>
              ))}
            </tr>
          ) : null}
	      </thead>
      <tbody>
        {groups.length > 0 ? (
	          groups.map((group, groupIndex) => {
              const groupTotal = group.items.reduce((sum, item) => sum + getItemTotal(item), 0);
              const groupMaterialTotal = group.items.reduce((sum, item) => sum + getBasePriceParts(item).materialTotal, 0);
              const groupLaborTotal = group.items.reduce((sum, item) => sum + getBasePriceParts(item).laborTotal, 0);
              return (
	            <Fragment key={group.space}>
	              <tr className="quotation-print-space-row">
	                <td className="text-center">{formatBaseSectionNumber(groupIndex)}</td>
	                <td colSpan={Math.max(1, colSpan - 1)}>
	                  <span>{group.space}</span>
	                </td>
              </tr>
              {group.items.map((item) => {
                rowNumber += 1;
                const parts = getBasePriceParts(item);
                const rowStyle = printRowStyle(item.row_color);
                const description = getBaseRowDescription(item);
                return (
                  <tr key={item.id || `${group.space}-${rowNumber}`} style={rowStyle}>
                    {columns.map((column) => (
                      <td key={column.key} className={cellClassName(column)}>{baseCellValue(column, item, parts, rowNumber, description)}</td>
                    ))}
                  </tr>
                );
              })}
              <tr className="quotation-print-space-total-row">
                {columns.map((column, index) => {
                  if (index === 0) return <td key={column.key} colSpan={Math.max(1, summaryLabelEndIndex + 1)} className="text-center">小计</td>;
                  if (index <= summaryLabelEndIndex) return null;
                  if (column.key === "materialTotal") return <td key={column.key} className="text-right">{formatPrintAmount(groupMaterialTotal)}</td>;
                  if (column.key === "laborTotal") return <td key={column.key} className="text-right">{formatPrintAmount(groupLaborTotal)}</td>;
                  if (column.key === "subtotal") return <td key={column.key} className="text-right">{formatPrintAmount(groupTotal)}</td>;
                  return <td key={column.key}></td>;
                })}
              </tr>
            </Fragment>
              );
            })
	        ) : (
	          <tr>
	            <td colSpan={colSpan} className="py-8 text-center text-surface-400">暂无基装明细</td>
	          </tr>
	        )}
	        <tr className="quotation-print-total-row">
            {columns.map((column, index) => {
              if (index === 0) return <td key={column.key} colSpan={Math.max(1, summaryLabelEndIndex + 1)} className="text-center">基装小计</td>;
              if (index <= summaryLabelEndIndex) return null;
              if (column.key === "materialTotal") return <td key={column.key} className="text-right">{formatPrintAmount(baseMaterialTotal)}</td>;
              if (column.key === "laborTotal") return <td key={column.key} className="text-right">{formatPrintAmount(baseLaborTotal)}</td>;
              if (column.key === "subtotal") return <td key={column.key} className="text-right">{formatPrintAmount(baseTotal)}</td>;
              return <td key={column.key}></td>;
            })}
        </tr>
      </tbody>
    </table>
  );
}

function MaterialDetailsTable({ items, settings }: { items: PrintableQuotationItem[]; settings?: PrintableQuotationSettings }) {
  const groups = groupItemsBySpace(items, settings);
  let rowNumber = 0;

  return (
    <table className="quotation-print-table quotation-print-material-table">
      <colgroup>
        <col />
        <col />
        <col />
        <col />
        <col />
        <col />
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
	        <tr>
	          <th className="w-10 text-center">序号</th>
	          <th>材料名称</th>
	          <th>规格</th>
	          <th>型号</th>
	          <th className="w-12 text-center">单位</th>
	          <th className="w-20 text-right">单价</th>
	          <th className="w-14 text-center">数量</th>
	          <th className="w-24 text-right">小计</th>
	          <th>备注</th>
	        </tr>
      </thead>
      <tbody>
        {groups.length > 0 ? (
          groups.map((group) => {
            const groupTotal = group.items.reduce((sum, item) => sum + getItemTotal(item), 0);
            return (
            <Fragment key={group.space}>
              <tr className="quotation-print-space-row">
                <td colSpan={9}>
                  <span>{group.space}</span>
                </td>
              </tr>
              {group.items.map((item) => {
                rowNumber += 1;
                const rowStyle = printRowStyle(item.row_color);
                return (
                  <tr key={item.id || `${group.space}-${rowNumber}`} style={rowStyle}>
                    <td className="quotation-print-item-name text-center">{rowNumber}</td>
                    <td className="quotation-print-item-name">{text(item.name)}</td>
                    <td className="quotation-print-item-name">{text(item.spec)}</td>
                    <td className="quotation-print-item-name">{text(item.material_model)}</td>
                    <td className="quotation-print-item-name text-center">{text(item.unit)}</td>
                    <td className="quotation-print-item-name text-right">{formatPrintAmount(getItemUnitPrice(item))}</td>
                    <td className="quotation-print-item-name text-center">{formatQuantity(toNumber(item.quantity))}</td>
                    <td className="quotation-print-item-name text-right">{formatPrintAmount(getItemTotal(item))}</td>
                    <td className="quotation-print-item-name">{text(item.remark)}</td>
                  </tr>
                );
              })}
              <tr className="quotation-print-space-total-row">
                <td colSpan={8} className="text-right">{group.space} 小计</td>
                <td className="quotation-print-item-name text-right">{formatPrintAmount(groupTotal)}</td>
              </tr>
            </Fragment>
            );
          })
        ) : (
          <tr>
            <td colSpan={9} className="py-8 text-center text-surface-400">暂无主材明细</td>
          </tr>
        )}
        <tr className="quotation-print-total-row">
          <td colSpan={8} className="text-right">主材小计</td>
          <td className="quotation-print-item-name text-right">{formatPrintAmount(items.reduce((sum, item) => sum + getItemTotal(item), 0))}</td>
        </tr>
      </tbody>
    </table>
  );
}

function CustomCabinetDetailsTable({ items, settings }: { items: PrintableQuotationItem[]; settings?: PrintableQuotationSettings }) {
  const groups = groupItemsBySpace(items, settings);
  let rowNumber = 0;

  return (
    <table className="quotation-print-table quotation-print-cabinet-table">
      <colgroup>
        <col />
        <col />
        <col />
        <col />
        <col />
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th className="w-10 text-center">编号</th>
          <th>名称</th>
          <th className="text-center">H高×W宽×D深（mm）</th>
          <th className="w-12 text-center">数量</th>
          <th className="w-16 text-center">平方</th>
          <th className="w-20 text-right">单价</th>
          <th className="w-24 text-right">金额</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        {groups.length > 0 ? (
          groups.map((group) => {
            const groupTotal = group.items.reduce((sum, item) => sum + getItemTotal(item), 0);
            return (
            <Fragment key={group.space}>
              <tr className="quotation-print-space-row">
                <td colSpan={8}>
                  <span>{group.space}</span>
                </td>
              </tr>
              {group.items.map((item) => {
                rowNumber += 1;
                const rowStyle = printRowStyle(item.row_color);
                const sizeText = `${formatQuantity(toNumber(item.material_cost))} × ${formatQuantity(toNumber(item.labor_cost))} × ${formatQuantity(toNumber(item.profit_margin))}`;
                const area = getCustomCabinetArea(item);
                return (
                  <tr key={item.id || `${group.space}-${rowNumber}`} style={rowStyle}>
                    <td className="quotation-print-item-name text-center">{rowNumber}</td>
                    <td className="quotation-print-item-name">{text(item.name)}</td>
                    <td className="quotation-print-item-name quotation-print-cabinet-size text-center">{sizeText}</td>
                    <td className="quotation-print-item-name text-center">{formatQuantity(toNumber(item.quantity))}</td>
                    <td className="quotation-print-item-name text-center">{formatPrintAmount(area)}</td>
                    <td className="quotation-print-item-name text-right">{formatPrintAmount(toNumber(item.unit_price))}</td>
                    <td className="quotation-print-item-name text-right">{formatPrintAmount(getItemTotal(item))}</td>
                    <td className="quotation-print-item-name quotation-print-cabinet-remark">{text(item.remark)}</td>
                  </tr>
                );
              })}
              <tr className="quotation-print-space-total-row">
                <td colSpan={6} className="text-right">{group.space} 小计</td>
                <td className="quotation-print-item-name text-right">{formatPrintAmount(groupTotal)}</td>
                <td></td>
              </tr>
            </Fragment>
            );
          })
        ) : (
          <tr>
            <td colSpan={8} className="py-8 text-center text-surface-400">暂无定制柜明细</td>
          </tr>
        )}
        <tr className="quotation-print-total-row">
          <td colSpan={6} className="text-right">定制柜小计</td>
          <td className="quotation-print-item-name text-right">{formatPrintAmount(items.reduce((sum, item) => sum + getItemTotal(item), 0))}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  );
}

function OtherFeesTable({ items, allItems, totals, settings, houseArea = 0 }: { items: PrintableQuotationItem[]; allItems: PrintableQuotationItem[]; totals: Totals; settings?: PrintableQuotationSettings; houseArea?: number }) {
  const otherFeeTotals = calculateOtherFeeTotals(items, totals.baseAmount, totals.materialAmount, totals.feeFormulaContext);
  const engineeringDirectAmount = toMoney(totals.baseAmount + totals.materialAmount);
  const hasProductDirectAmount = toNumber(totals.materialAmount) > 0;
  const engineeringDirectFormula = hasProductDirectAmount ? "基装直接费 + 产品直接费" : "基装直接费";
  const engineeringDirectRule = hasProductDirectAmount
    ? `基装直接费 ${formatPrintAmount(totals.baseAmount)} + 产品直接费 ${formatPrintAmount(totals.materialAmount)} = ${formatPrintAmount(engineeringDirectAmount)}`
    : `基装直接费 ${formatPrintAmount(totals.baseAmount)} = ${formatPrintAmount(engineeringDirectAmount)}`;
  const otherAmount = otherFeeTotals.reduce((sum, amount) => toMoney(sum + amount), 0);
  const hasDiscount = totals.discount > 0;
  const discountRows = getDiscountRuleRows(allItems, settings, { otherAmount }, houseArea);
  const fallbackDiscountRows = hasDiscount && discountRows.length === 0
    ? [{
        id: "legacy",
        label: getDiscountScopeLabel(settings),
        formula: `${getDiscountScopeLabel(settings)}优惠`,
        ruleText: `${getDiscountScopeLabel(settings)}优惠 ${formatPrintAmount(totals.discount)}`,
        amount: totals.discount,
      }]
    : discountRows;
  const finalSequenceIndex = items.length + fallbackDiscountRows.length + 1;
  const finalFormulaParts = ["工程直接费"];
  const finalRuleParts = [`工程直接费 ${formatPrintAmount(engineeringDirectAmount)}`];
  if (otherAmount > 0) {
    finalFormulaParts.push("+ 综合费用");
    finalRuleParts.push(`+ 综合费用 ${formatPrintAmount(otherAmount)}`);
  }
  if (totals.taxAmount > 0) {
    finalFormulaParts.push("+ 税费");
    finalRuleParts.push(`+ 税费 ${formatPrintAmount(totals.taxAmount)}`);
  }
  if (hasDiscount) {
    finalFormulaParts.push("- 优惠");
    finalRuleParts.push(`- 优惠 ${formatPrintAmount(totals.discount)}`);
  }
  const finalFormula = finalFormulaParts.join(" ");

  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[12px] font-semibold text-surface-700">综合费用明细</p>
      <table className="quotation-print-table quotation-print-fee-table">
        <colgroup>
          <col />
          <col />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th className="w-10 text-center">编号</th>
            <th>费用名称</th>
            <th>计算公式</th>
            <th className="w-24 text-right">小计</th>
            <th className="quotation-print-rule-cell">规则说明</th>
          </tr>
        </thead>
        <tbody>
          <tr className="quotation-print-fee-anchor-row">
            <td className="text-center">{formatAlphaSequence(0)}</td>
            <td className="quotation-print-item-name">工程直接费</td>
            <td>{engineeringDirectFormula}</td>
            <td className="text-right font-semibold text-surface-950">
              {formatPrintAmount(engineeringDirectAmount)}
            </td>
            <td className="quotation-print-rule-cell leading-relaxed text-surface-600">
              {engineeringDirectRule}
            </td>
          </tr>
          {items.map((item, index) => {
            return (
              <tr key={item.id || `other-${index}`} style={printRowStyle(item.row_color)}>
                <td className="text-center">{formatAlphaSequence(index + 1)}</td>
                <td className="quotation-print-item-name">{text(item.name)}</td>
                <td>{getFeeFormulaText(item, items, 1)}</td>
                <td className="text-right font-semibold text-surface-950">
                  {formatPrintAmount(otherFeeTotals[index] || 0)}
                </td>
                <td className="quotation-print-rule-cell leading-relaxed text-surface-600">{getOtherFeeRuleDisplay(item, otherFeeTotals[index] || 0, totals.feeFormulaContext)}</td>
              </tr>
            );
          })}
          {fallbackDiscountRows.map((row, index) => (
            <tr key={row.id || `discount-${index}`}>
              <td className="text-center">{formatAlphaSequence(items.length + index + 1)}</td>
              <td className="quotation-print-item-name">优惠</td>
              <td>{row.formula}</td>
              <td className="text-right font-semibold text-surface-950">
                -{formatPrintAmount(row.amount)}
              </td>
              <td className="quotation-print-rule-cell leading-relaxed text-surface-600">
                {row.ruleText}
              </td>
            </tr>
          ))}
          <tr className="quotation-print-fee-final-row">
            <td className="text-center">{formatAlphaSequence(finalSequenceIndex)}</td>
            <td className="quotation-print-item-name">工程总造价</td>
            <td>{finalFormula}</td>
            <td className="text-right font-semibold text-surface-950">
              {formatPrintAmount(totals.finalAmount)}
            </td>
            <td className="quotation-print-rule-cell leading-relaxed text-surface-600">
              {finalRuleParts.join(" ")} = {formatPrintAmount(totals.finalAmount)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SignatureBlock({ labels }: { labels?: string[] }) {
  const signatures = normalizeQuotationSignatureLabels(labels);
  return (
    <div className="quotation-print-signature-grid">
      {signatures.map((label, index) => (
        <div key={`${label}-${index}`} className="quotation-print-signature-card">
          <p>{label}</p>
        </div>
      ))}
    </div>
  );
}

function AppendixNoteBlock({ parts }: { parts: AppendixNotePart[] }) {
  return (
    <section className="quotation-print-appendix-note">
      <div className="quotation-print-appendix-note-label">附注</div>
      <div className="quotation-print-appendix-note-content">
        {parts.map((part, index) => {
          const lines = part.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
          return (
            <div key={part.label || `appendix-${index}`} className="quotation-print-appendix-note-part">
              {part.label ? <strong>{part.label}：</strong> : null}
              {lines.length > 0
                ? lines.map((line, index) => <p key={`${part.label}-${line}-${index}`}>{line}</p>)
                : <p>{part.content}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BudgetCompilationBlock({ html }: { html: string }) {
  return (
    <section className="quotation-print-budget-compilation">
      <div className="quotation-print-budget-compilation-head">
        <h2>预算编制</h2>
        <span />
      </div>
      <div className="quotation-print-budget-compilation-content" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}

export function QuotationPrintDocument({
  quotation,
  items,
  settings,
  shareUrl,
  outputMode = "list",
  printScope = "all",
  baseColumns,
  includeBudgetCompilation = true,
}: {
  quotation?: PrintableQuotationDetail | null;
  items: PrintableQuotationItem[];
  settings?: PrintableQuotationSettings;
  shareUrl?: string;
  outputMode?: QuotationOutputMode;
  printScope?: QuotationPrintScope;
  baseColumns?: Partial<QuotationBaseColumnOptions>;
  includeBudgetCompilation?: boolean;
}) {
  const normalizedItems = items.map((item) => ({ ...item, space: inferItemSpace(item) }));
  const baseItems = normalizedItems.filter((item) => isBaseCategory(item.category));
  const otherItems = normalizedItems.filter((item) => isOtherCategory(item.category));
  const materialCategories = orderQuoteCategories([...(settings?.quoteCategories || []), ...normalizedItems.map((item) => item.category)])
    .filter((category) => !isBaseCategory(category) && !isOtherCategory(category))
    .map((category) => ({
      category,
      label: getCategoryLabel(category),
      items: normalizedItems.filter((item) => getCategoryKey(item.category) === getCategoryKey(category)),
    }))
    .filter((group) => group.items.length > 0);
  const houseArea = toNumber(quotation?.customer_area_size ?? quotation?.project_area);
  const totals = calculateQuotationTotals(normalizedItems, settings, houseArea);
  const costComposition = buildCostComposition(normalizedItems);
  const targetUrl = shareUrl || "";
  const [qrTargetUrl, setQrTargetUrl] = useState("");
  useEffect(() => {
    setQrTargetUrl(getCompactQuotationShareUrl(targetUrl));
  }, [targetUrl]);
  const isAllDetailScope = printScope === "all" || printScope === "all_without_cover";
  const shouldShowBase = isAllDetailScope || printScope === "base";
  const shouldShowFees = isAllDetailScope || printScope === "fees";
  const shouldShowSignature = outputMode === "composition" || isAllDetailScope;
  const shouldSplitAllSections = outputMode === "list" && isAllDetailScope;
  const shouldShowCover = outputMode === "list" && printScope === "all";
  const displayTitle = buildQuotationDisplayTitle(quotation);
  const appendixNoteParts = buildAppendixNoteParts(settings, quotation);
  const shouldShowAppendixNote = outputMode === "list" && appendixNoteParts.length > 0 && (isAllDetailScope || printScope === "fees");
  const budgetCompilationHtml = getBudgetCompilationHtml(settings);
  const shouldShowBudgetCompilation = outputMode === "list" && includeBudgetCompilation && budgetCompilationHtml && (isAllDetailScope || printScope === "fees");

  return (
    <article className="quotation-print-document mx-auto w-full max-w-[1040px] bg-white text-surface-900 shadow-[0_18px_50px_rgba(31,41,53,0.08)]">
      {shouldShowCover && <PrintCoverPage quotation={quotation} />}

      <section className="quotation-print-head-block">
        <div className="quotation-print-head-table" role="table" aria-label="报价单基础信息">
          <div className="quotation-print-head-title-cell quotation-print-head-title-main" role="cell">
            <h1>{displayTitle}</h1>
          </div>
          <div className="quotation-print-head-field quotation-print-head-field-phone" role="cell">
            <span>手机号</span>
            <strong>{maskCustomerPhone(quotation?.customer_phone)}</strong>
          </div>
          <div className="quotation-print-head-field quotation-print-head-field-area" role="cell">
            <span>建筑面积</span>
            <strong>{quotation?.project_area ? `${quotation.project_area} 平方` : "-"}</strong>
          </div>
          <div className="quotation-print-head-field quotation-print-head-field-date" role="cell">
            <span>预算时间</span>
            <strong>{text(formatPrintDateTime(quotation?.created_at))}</strong>
          </div>
          <div className="quotation-print-qr" role="cell">
            {targetUrl ? (
              <NativeImage src={qrCodeUrl(qrTargetUrl)} alt="报价单二维码" loading="eager" />
            ) : (
              <div />
            )}
            <p>扫码查看报价单</p>
          </div>
          <div className="quotation-print-head-field quotation-print-head-field-designer" role="cell">
            <span>设计师</span>
            <strong>{text(quotation?.designer_name)}</strong>
          </div>
          <div className="quotation-print-head-field quotation-print-head-field-creator" role="cell">
            <span>报价人</span>
            <strong>{text(quotation?.creator_name)}</strong>
          </div>
          <div className="quotation-print-head-field quotation-print-head-field-company-phone quotation-print-head-field-strong" role="cell">
            <span>公司电话</span>
            <strong>{text(quotation?.branch_company_phone)}</strong>
          </div>
        </div>
      </section>

      {outputMode === "composition" ? (
        <Section title="工种材料分类汇总">
          <CostCompositionOverview workTypes={costComposition.workTypes} materialCategories={costComposition.materialCategories} />
          <CompositionDetails workTypes={costComposition.workTypes} materialCategories={costComposition.materialCategories} />
        </Section>
      ) : (
        <>
          {shouldShowBase && (
            <Section title="基装明细">
              <BaseDetailsTable items={baseItems} settings={settings} baseColumns={baseColumns} />
            </Section>
          )}

          {materialCategories
            .filter((group) => {
              if (isAllDetailScope) return true;
              if (printScope === "main_material") return getCategoryKey(group.category) === "main_material";
              if (printScope === "custom_cabinet") return isCustomCabinetCategory(group.category);
              return false;
            })
            .map((group) => (
              <Section key={group.category} title={`${group.label}明细`} className={shouldSplitAllSections ? "quotation-print-section-new-page" : ""}>
                {isCustomCabinetCategory(group.category)
                  ? <CustomCabinetDetailsTable items={group.items} settings={settings} />
                  : <MaterialDetailsTable items={group.items} settings={settings} />}
              </Section>
            ))}

          {shouldShowFees && (
            <Section title="综合费用和总费用" className={shouldSplitAllSections ? "quotation-print-section-new-page" : ""}>
              <OtherFeesTable items={otherItems} allItems={items} totals={totals} settings={settings} houseArea={houseArea} />
            </Section>
          )}
          {shouldShowAppendixNote && <AppendixNoteBlock parts={appendixNoteParts} />}
          {shouldShowBudgetCompilation && <BudgetCompilationBlock html={budgetCompilationHtml} />}
        </>
      )}

      {shouldShowSignature && (
        <Section title="签字栏">
          <SignatureBlock labels={settings?.signatureLabels} />
        </Section>
      )}

      <style jsx global>{`
        .quotation-print-document {
          padding: 26px;
          color: #182230;
          background: #ffffff;
          border: 1px solid #e4e7ec;
          border-radius: 14px;
          box-shadow: 0 10px 30px rgba(16, 24, 40, 0.06);
          font-variant-numeric: tabular-nums;
          letter-spacing: 0;
        }
        .quotation-print-cover-page {
          position: relative;
          display: block;
          min-height: 860px;
          box-sizing: border-box;
          background: #ffffff;
          padding: 78px 88px 56px;
          break-after: page;
          page-break-after: always;
        }
        .quotation-print-cover-main {
          text-align: center;
        }
        .quotation-print-cover-main h1 {
          display: inline-flex;
          align-items: baseline;
          justify-content: center;
          gap: 0;
          margin: 0;
          color: #111111;
          font-size: 36px;
          font-weight: 800;
          line-height: 1.25;
          letter-spacing: 0;
        }
        .quotation-print-cover-main h1 span {
          color: #111111;
        }
        .quotation-print-cover-main h1 em {
          color: #111111;
          font-size: inherit;
          font-style: normal;
          font-weight: inherit;
          white-space: nowrap;
        }
        .quotation-print-cover-main h2 {
          margin: 62px 0 0;
          color: #111111;
          font-size: 30px;
          font-weight: 800;
          line-height: 1.25;
          letter-spacing: 0;
        }
        .quotation-print-cover-main p {
          margin: 54px 0 0;
          color: #111111;
          font-size: 18px;
          font-weight: 400;
          line-height: 1.4;
        }
        .quotation-print-cover-fields {
          display: grid;
          width: 430px;
          gap: 18px;
          margin: 110px auto 0;
        }
        .quotation-print-cover-field {
          display: grid;
          grid-template-columns: 126px minmax(0, 1fr);
          align-items: start;
          gap: 14px;
          color: #111111;
        }
        .quotation-print-cover-field span {
          font-size: 16px;
          font-weight: 400;
          line-height: 1.2;
          text-align: right;
          white-space: nowrap;
        }
        .quotation-print-cover-field strong {
          display: block;
          min-height: 25px;
          border-bottom: 1px solid #111111;
          color: #111111;
          font-size: 16px;
          font-weight: 400;
          line-height: 22px;
          overflow: visible;
          text-align: center;
          text-overflow: clip;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .quotation-print-cover-brand {
          position: absolute;
          right: 88px;
          bottom: 56px;
          left: 88px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: center;
          gap: 36px;
        }
        .quotation-print-cover-brand span {
          height: 2px;
          background: #a7a7a7;
        }
        .quotation-print-cover-brand-mark {
          display: inline-flex;
          max-width: 300px;
          align-items: center;
          justify-content: center;
          gap: 12px;
          overflow: hidden;
        }
        .quotation-print-cover-brand-mark img {
          display: block;
          max-width: 172px;
          max-height: 42px;
          height: auto;
          object-fit: contain;
        }
        .quotation-print-cover-brand-mark strong {
          display: block;
          max-width: 110px;
          overflow: hidden;
          color: #111111;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.15;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quotation-print-head-block {
          margin-bottom: 16px;
        }
        .quotation-print-head-total {
          display: inline-flex;
          width: fit-content;
          min-height: 30px;
          align-items: center;
          gap: 8px;
          margin-top: 14px;
          border-radius: 8px;
          background: #edf4ff;
          padding: 0 10px;
        }
        .quotation-print-head-total span {
          font-size: 9px;
          font-weight: 700;
          color: #52647b;
        }
        .quotation-print-head-total strong {
          font-size: 14px;
          font-weight: 750;
          color: #111111;
          white-space: nowrap;
        }
        .quotation-print-head-table {
          --quotation-print-head-line-color: #111111;
          --quotation-print-head-inner-line-color: #4f4f4f;
          --quotation-print-head-line-width: 1px;
          --quotation-print-head-inner-line-width: var(--quotation-print-head-line-width);
          position: relative;
          width: 100%;
          display: grid;
          grid-template-columns: 34% repeat(3, minmax(0, 1fr)) 10%;
          grid-template-rows: repeat(2, 44px);
          border: var(--quotation-print-head-line-width) solid var(--quotation-print-head-line-color);
          border-radius: 10px;
          overflow: hidden;
          background: #ffffff;
        }
        .quotation-print-head-table::before {
          display: none;
        }
        .quotation-print-head-table::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(var(--quotation-print-head-inner-line-color), var(--quotation-print-head-inner-line-color)),
            linear-gradient(var(--quotation-print-head-inner-line-color), var(--quotation-print-head-inner-line-color)),
            linear-gradient(var(--quotation-print-head-inner-line-color), var(--quotation-print-head-inner-line-color)),
            linear-gradient(var(--quotation-print-head-inner-line-color), var(--quotation-print-head-inner-line-color)),
            linear-gradient(90deg, transparent 0 34%, var(--quotation-print-head-inner-line-color) 34% 90%, transparent 90% 100%);
          background-position:
            34% 0,
            52.6667% 0,
            71.3333% 0,
            90% 0,
            0 50%;
          background-repeat: no-repeat;
          background-size:
            1px 100%,
            1px 100%,
            1px 100%,
            1px 100%,
            100% 1px;
        }
        .quotation-print-head-title-cell {
          position: relative;
          grid-column: 1;
          display: flex;
          min-width: 0;
          flex-direction: column;
          justify-content: center;
          background: #ffffff;
          padding: 8px 14px;
        }
        .quotation-print-head-title-kicker {
          grid-row: 1;
          justify-content: flex-end;
          padding-bottom: 4px;
        }
        .quotation-print-head-title-main {
          grid-row: 1 / span 2;
          justify-content: center;
          padding-top: 8px;
          padding-bottom: 8px;
        }
        .quotation-print-head-title-cell p {
          margin: 0;
          color: #111111;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.14em;
          line-height: 1;
          text-transform: uppercase;
        }
        .quotation-print-head-title-cell h1 {
          margin: 0;
          color: #111111;
          font-size: 15px;
          font-weight: 750;
          letter-spacing: 0;
          line-height: 1.22;
          max-width: 100%;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .quotation-print-qr {
          grid-column: 5;
          grid-row: 1 / span 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border: 0;
          padding: 8px 6px;
          text-align: center;
          color: #475467;
        }
        .quotation-print-qr img {
          width: 50px;
          height: 50px;
          margin: 0 auto;
          border-radius: 6px;
          background: #ffffff;
        }
        .quotation-print-qr > div {
          width: 50px;
          height: 50px;
          margin: 0 auto;
          border-radius: 6px;
          background: transparent;
        }
        .quotation-print-qr p {
          margin-top: 6px;
          font-size: 7px;
          font-weight: 700;
          color: #667085;
        }
        .quotation-print-head-info {
          min-width: 0;
          align-self: stretch;
          padding: 0;
        }
        .quotation-print-head-info-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          overflow: hidden;
          border-radius: 0;
          background: #f8fbff;
        }
        .quotation-print-head-field {
          display: flex;
          min-height: 42px;
          min-width: 0;
          flex-direction: column;
          justify-content: center;
          background: #ffffff;
          border: 0;
          padding: 7px 12px;
        }
        .quotation-print-head-field-phone {
          grid-column: 2;
          grid-row: 1;
        }
        .quotation-print-head-field-area {
          grid-column: 3;
          grid-row: 1;
        }
        .quotation-print-head-field-date {
          grid-column: 4;
          grid-row: 1;
        }
        .quotation-print-head-field-designer {
          grid-column: 2;
          grid-row: 2;
          border-top: 0;
        }
        .quotation-print-head-field-creator {
          grid-column: 3;
          grid-row: 2;
          border-top: 0;
        }
        .quotation-print-head-field-company-phone {
          grid-column: 4;
          grid-row: 2;
          border-top: 0;
        }
        .quotation-print-head-field-wide {
          grid-column: span 2;
        }
        .quotation-print-head-field span {
          display: block;
          color: #111111;
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 0.04em;
          line-height: 1.2;
        }
        .quotation-print-head-field strong {
          display: block;
          overflow: hidden;
          color: #111111;
          font-size: 12px;
          font-weight: 650;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quotation-print-head-field-strong strong {
          font-weight: 750;
        }
        .quotation-print-composition {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 10px;
        }
        .quotation-print-composition-card {
          border-radius: 10px;
          border: 1px solid #e4e7ec;
          background: #fbfcfe;
          padding: 12px;
        }
        .quotation-print-composition-card h3 {
          margin: 0 0 8px;
          font-size: 12px;
          font-weight: 700;
          color: #182230;
        }
        .quotation-print-composition-rows {
          display: grid;
          gap: 5px;
        }
        .quotation-print-composition-row,
        .quotation-print-composition-empty {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-radius: 7px;
          background: #ffffff;
          padding: 7px 9px;
          font-size: 11px;
        }
        .quotation-print-composition-row span {
          color: #475467;
        }
        .quotation-print-composition-row strong {
          color: #182230;
          white-space: nowrap;
        }
        .quotation-print-composition-empty {
          color: #98a2b3;
        }
        .quotation-print-composition-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 12px;
        }
        .quotation-print-composition-table-title {
          margin: 0 0 8px;
          font-size: 12px;
          font-weight: 700;
          color: #182230;
        }
        .quotation-print-composition-table-wrap {
          min-width: 0;
        }
        .quotation-print-composition-table col:nth-child(1) {
          width: auto;
        }
        .quotation-print-composition-table col:nth-child(2) {
          width: 132px;
        }
        .quotation-print-price-stack {
          white-space: nowrap;
          text-align: right;
        }
        .quotation-print-price-stack strong {
          display: block;
          font-size: 11px;
          font-weight: 750;
          color: #111827;
        }
        .quotation-print-price-stack span {
          display: block;
          margin-top: 2px;
          font-size: 9px;
          font-weight: 600;
          color: #94a3b8;
        }
        .quotation-print-section {
          margin-top: 20px;
          break-inside: auto;
          page-break-inside: auto;
        }
        .quotation-print-section-heading {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        .quotation-print-section-heading h2 {
          font-size: 14px;
          line-height: 1;
          font-weight: 700;
          color: #182230;
        }
        .quotation-print-section-heading span {
          height: 1px;
          background: linear-gradient(90deg, #dce4ef, transparent);
        }
        .quotation-print-appendix-note {
          display: grid;
          grid-template-columns: 72px minmax(0, 1fr);
          margin-top: 14px;
          overflow: hidden;
          border: 1px solid #dce4ef;
          border-radius: 10px;
          background: #ffffff;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .quotation-print-appendix-note-label {
          display: flex;
          align-items: center;
          justify-content: center;
          border-right: 1px solid #e4eaf2;
          background: #f6f8fb;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.4;
          color: #475467;
        }
        .quotation-print-appendix-note-content {
          min-height: 42px;
          padding: 8px 10px;
          font-size: 11px;
          font-weight: 400;
          line-height: 1.75;
          color: #111111;
          white-space: pre-wrap;
        }
        .quotation-print-appendix-note-part + .quotation-print-appendix-note-part {
          margin-top: 6px;
        }
        .quotation-print-appendix-note-part strong {
          display: block;
          margin-bottom: 2px;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.5;
          color: #111111;
        }
        .quotation-print-appendix-note-content p {
          margin: 0;
        }
        .quotation-print-budget-compilation {
          margin-top: 0;
          padding-top: 26px;
          break-before: page;
          page-break-before: always;
        }
        .quotation-print-budget-compilation-head {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .quotation-print-budget-compilation-head h2 {
          margin: 0;
          font-size: 16px;
          line-height: 1;
          font-weight: 700;
          color: #182230;
        }
        .quotation-print-budget-compilation-head span {
          height: 1px;
          flex: 1;
          background: linear-gradient(90deg, #dce4ef, transparent);
        }
        .quotation-print-budget-compilation-content {
          border: var(--quotation-print-table-border-width, 1px) solid #111111;
          border-radius: 10px;
          padding: 18px 20px;
          font-size: 12px;
          line-height: 1.9;
          color: #111111;
          background: #ffffff;
        }
        .quotation-print-budget-compilation-content p {
          margin: 0 0 8px;
        }
        .quotation-print-budget-compilation-content ul,
        .quotation-print-budget-compilation-content ol {
          margin: 0 0 8px 20px;
          padding: 0;
        }
        .quotation-print-budget-compilation-content li {
          margin: 0 0 4px;
        }
        .quotation-print-document table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
          overflow: hidden;
          border: 1px solid #dce4ef;
          border-radius: 10px;
        }
        .quotation-print-base-table col:nth-child(1),
        .quotation-print-material-table col:nth-child(1),
        .quotation-print-fee-table col:nth-child(1) {
          width: 44px;
        }
        .quotation-print-base-table col:nth-child(2) { width: 150px; }
        .quotation-print-base-table col:nth-child(3) { width: 58px; }
        .quotation-print-base-table col:nth-child(4) { width: 58px; }
        .quotation-print-base-table col:nth-child(5) { width: 62px; }
        .quotation-print-base-table col:nth-child(6) { width: 72px; }
        .quotation-print-base-table col:nth-child(7) { width: 62px; }
        .quotation-print-base-table col:nth-child(8) { width: 72px; }
        .quotation-print-base-table col:nth-child(9) { width: 78px; }
        .quotation-print-base-table col:nth-child(10) { width: auto; }
        .quotation-print-material-table col:nth-child(2) {
          width: auto;
        }
        .quotation-print-material-table col:nth-child(3),
        .quotation-print-material-table col:nth-child(4) {
          width: 96px;
        }
        .quotation-print-material-table col:nth-child(5),
        .quotation-print-material-table col:nth-child(7) {
          width: 52px;
        }
        .quotation-print-material-table col:nth-child(6),
        .quotation-print-material-table col:nth-child(8) {
          width: 84px;
        }
        .quotation-print-material-table col:nth-child(9) {
          width: 176px;
        }
        .quotation-print-cabinet-table col:nth-child(1) {
          width: 48px;
        }
        .quotation-print-cabinet-table col:nth-child(2) {
          width: 172px;
        }
        .quotation-print-cabinet-table col:nth-child(3) {
          width: 172px;
        }
        .quotation-print-cabinet-table col:nth-child(4) {
          width: 58px;
        }
        .quotation-print-cabinet-table col:nth-child(5) {
          width: 58px;
        }
        .quotation-print-cabinet-table col:nth-child(6),
        .quotation-print-cabinet-table col:nth-child(7) {
          width: 88px;
        }
        .quotation-print-cabinet-table col:nth-child(8) {
          width: auto;
        }
        .quotation-print-fee-table col:nth-child(2) {
          width: 132px;
        }
        .quotation-print-fee-table col:nth-child(3) {
          width: 168px;
        }
        .quotation-print-fee-table col:nth-child(4) {
          width: 104px;
        }
        .quotation-print-fee-table col:nth-child(5) {
          width: auto;
        }
        .quotation-print-document th,
        .quotation-print-document td {
          border: 0;
          border-bottom: 1px solid #edf0f4;
          padding: 8px 10px;
          vertical-align: top;
          word-break: break-word;
        }
        .quotation-print-document tr:last-child td {
          border-bottom: 0;
        }
        .quotation-print-document th {
          background: #f6f8fb;
          color: #667085;
          font-size: 10px;
          font-weight: 700;
          text-align: left;
        }
        .quotation-print-document td {
          font-size: 11px;
          line-height: 1.5;
          color: #475467;
        }
        .quotation-print-document td.text-center,
        .quotation-print-document th.text-center {
          text-align: center;
        }
        .quotation-print-document td.text-right,
        .quotation-print-document th.text-right {
          text-align: right;
          white-space: nowrap;
        }
        .quotation-print-base-table th,
        .quotation-print-base-table td {
          vertical-align: middle;
        }
        .quotation-print-base-table,
        .quotation-print-material-table,
        .quotation-print-fee-table,
        .quotation-print-cabinet-table,
        .quotation-print-composition-table {
          border-collapse: separate;
          border-spacing: 0;
          overflow: hidden;
          border: 1px solid #dce4ef;
          border-radius: 10px;
        }
        .quotation-print-base-table th,
        .quotation-print-base-table td,
        .quotation-print-material-table th,
        .quotation-print-material-table td,
        .quotation-print-fee-table th,
        .quotation-print-fee-table td,
        .quotation-print-cabinet-table th,
        .quotation-print-cabinet-table td,
        .quotation-print-composition-table th,
        .quotation-print-composition-table td {
          border: 0;
          border-right: 1px solid #e4eaf2;
          border-bottom: 1px solid #e4eaf2;
        }
        .quotation-print-base-table th,
        .quotation-print-base-table td {
          padding: 6px 7px;
          color: #344054;
          font-size: 10px;
          line-height: 1.42;
        }
        .quotation-print-head-table {
          border: var(--quotation-print-head-line-width) solid #111111 !important;
          background: #ffffff !important;
        }
        .quotation-print-head-table .quotation-print-head-title-cell,
        .quotation-print-head-table .quotation-print-head-field,
        .quotation-print-head-table .quotation-print-qr {
          background: #ffffff !important;
        }
        .quotation-print-head-table .quotation-print-head-field {
          min-height: 0 !important;
          padding: 8px 12px !important;
        }
        .quotation-print-head-table .quotation-print-qr {
          padding: 8px 6px !important;
        }
        .quotation-print-head-title-cell p,
        .quotation-print-head-field span,
        .quotation-print-qr p {
          color: #111111 !important;
        }
        .quotation-print-head-title-cell h1,
        .quotation-print-head-field strong {
          color: #111111 !important;
        }
        .quotation-print-head-field span {
          margin-bottom: 4px;
          font-size: 8px;
          font-weight: 700;
          line-height: 1.1;
        }
        .quotation-print-head-field strong {
          font-size: 12px;
          font-weight: 700;
          line-height: 1.2;
        }
        .quotation-print-head-title-cell h1 {
          font-size: 15px;
          line-height: 1.2;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .quotation-print-base-table th,
        .quotation-print-material-table th,
        .quotation-print-fee-table th,
        .quotation-print-cabinet-table th,
        .quotation-print-composition-table th {
          background: #d9d9d9;
          color: #475467;
          font-weight: 700;
        }
        .quotation-print-base-table th {
          text-align: center;
        }
        .quotation-print-base-labor-total-head {
          border-right: 1px solid #e4eaf2 !important;
        }
        .quotation-print-base-labor-head {
          border-left: 0 !important;
          border-right: 0 !important;
        }
        .quotation-print-base-subtotal-boundary-head {
          border-right: 0 !important;
        }
        .quotation-print-base-subtotal-head {
          border-left: 1px solid #e4eaf2 !important;
        }
        .quotation-print-base-table th:last-child,
        .quotation-print-base-table td:last-child,
        .quotation-print-material-table th:last-child,
        .quotation-print-material-table td:last-child,
        .quotation-print-fee-table th:last-child,
        .quotation-print-fee-table td:last-child,
        .quotation-print-cabinet-table th:last-child,
        .quotation-print-cabinet-table td:last-child,
        .quotation-print-composition-table th:last-child,
        .quotation-print-composition-table td:last-child {
          border-right: 0;
        }
        .quotation-print-base-table tbody tr:last-child td,
        .quotation-print-material-table tbody tr:last-child td,
        .quotation-print-fee-table tbody tr:last-child td,
        .quotation-print-cabinet-table tbody tr:last-child td,
        .quotation-print-composition-table tbody tr:last-child td {
          border-bottom: 0;
        }
        .quotation-print-base-table .quotation-print-space-row td,
        .quotation-print-base-table .quotation-print-space-total-row td,
        .quotation-print-cabinet-table .quotation-print-space-row td,
        .quotation-print-cabinet-table .quotation-print-space-total-row td {
          background: #d9d9d9;
          color: #344054;
          font-weight: 700;
        }
        .quotation-print-base-table .quotation-print-total-row td,
        .quotation-print-cabinet-table .quotation-print-total-row td {
          background: #edf4ff;
          color: #182230;
          font-weight: 700;
        }
        .quotation-print-fee-anchor-row td,
        .quotation-print-fee-final-row td {
          background: #f8fbff;
        }
        .quotation-print-fee-final-row td {
          font-weight: 700;
        }
        .quotation-print-base-name {
          font-weight: 500;
          color: #182230;
        }
        .quotation-print-base-description {
          color: #475467;
          line-height: 1.42;
          word-break: normal;
          overflow-wrap: anywhere;
        }
        .quotation-print-cabinet-table th,
        .quotation-print-cabinet-table td {
          vertical-align: middle;
        }
        .quotation-print-cabinet-table td {
          padding-top: 9px;
          padding-bottom: 9px;
        }
        .quotation-print-cabinet-size {
          word-break: keep-all;
          overflow-wrap: normal;
        }
        .quotation-print-cabinet-size {
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .quotation-print-cabinet-remark {
          line-height: 1.55;
          overflow-wrap: anywhere;
          word-break: normal;
        }
        .quotation-print-document th.quotation-print-rule-cell,
        .quotation-print-document td.quotation-print-rule-cell {
          padding-left: 10px;
          white-space: normal;
          word-break: normal;
          overflow-wrap: anywhere;
        }
        .quotation-print-item-name {
          color: #182230;
          font-weight: 650;
          line-height: 1.4;
          white-space: normal;
          word-break: normal;
          overflow-wrap: anywhere;
        }
        .quotation-print-space-row td {
          background: #d9d9d9;
          color: #344054;
          font-weight: 700;
        }
        .quotation-print-space-row td {
          display: table-cell;
        }
        .quotation-print-space-row td > span:first-child {
          float: left;
        }
        .quotation-print-space-total-row td {
          background: #f4f6f9;
          color: #344054;
          font-weight: 700;
        }
        .quotation-print-total-row td {
          background: #edf4ff;
          color: #182230;
          font-weight: 700;
        }
        .quotation-print-signature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 18px;
        }
        .quotation-print-signature-card {
          min-height: 48px;
          background: #ffffff;
          padding: 4px 0 0;
          border-bottom: 1px solid #111111;
        }
        .quotation-print-signature-card p {
          font-size: 11px;
          font-weight: 700;
          color: #344054;
        }
        .quotation-print-section:last-of-type {
          margin-bottom: 0;
        }
        .quotation-print-document,
        .quotation-print-document :where(h1, h2, h3, p, span, strong, small, th, td, footer, div) {
          color: #111111 !important;
        }
        .quotation-print-document table,
        .quotation-print-base-table,
        .quotation-print-material-table,
        .quotation-print-fee-table,
        .quotation-print-cabinet-table,
        .quotation-print-composition-table,
        .quotation-print-appendix-note {
          border-color: #111111 !important;
        }
        .quotation-print-appendix-note-label {
          border-right-color: #111111 !important;
        }
        .quotation-print-document th,
        .quotation-print-document td,
        .quotation-print-base-table th,
        .quotation-print-base-table td,
        .quotation-print-material-table th,
        .quotation-print-material-table td,
        .quotation-print-fee-table th,
        .quotation-print-fee-table td,
        .quotation-print-cabinet-table th,
        .quotation-print-cabinet-table td,
        .quotation-print-composition-table th,
        .quotation-print-composition-table td {
          border-color: #111111 !important;
        }
        @media screen and (max-width: 760px) {
          .quotation-print-document {
            padding: 16px;
            border-radius: 12px;
          }
          .quotation-print-head-table {
            grid-template-columns: 34% repeat(3, minmax(0, 1fr)) 10%;
            grid-template-rows: repeat(2, 44px);
          }
          .quotation-print-head-table::before {
            display: none;
          }
          .quotation-print-head-title-cell {
            grid-column: 1;
            grid-row: 1 / span 2;
            padding: 8px 14px;
          }
          .quotation-print-head-title-cell h1 {
            font-size: 15px;
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .quotation-print-qr {
            grid-column: 5;
            grid-row: 1 / span 2;
            width: auto;
            border: 0;
            border-top: 0;
          }
          .quotation-print-head-field {
            border: 0;
          }
          .quotation-print-head-field-phone {
            grid-column: 2;
            grid-row: 1;
            border-top: 0;
          }
          .quotation-print-head-field-area {
            grid-column: 3;
            grid-row: 1;
            border-top: 0;
          }
          .quotation-print-head-field-date {
            grid-column: 4;
            grid-row: 1;
            border-top: 0;
          }
          .quotation-print-head-field-designer {
            grid-column: 2;
            grid-row: 2;
            border-top: 0;
          }
          .quotation-print-head-field-creator {
            grid-column: 3;
            grid-row: 2;
            border-top: 0;
          }
          .quotation-print-head-field-company-phone {
            grid-column: 4;
            grid-row: 2;
            border-top: 0;
          }
          .quotation-print-composition,
          .quotation-print-composition-detail-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media print {
          @page {
            margin: 6mm 6mm 10mm;
            @bottom-right {
              content: counter(page) "/" counter(pages);
              color: #111111;
              font-size: 10px;
              font-weight: 400;
              padding-top: 2mm;
              vertical-align: top;
            }
          }
          html,
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .quotation-print-document {
            width: 100% !important;
            max-width: none !important;
            margin: 0 auto !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .quotation-print-cover-page {
            width: 100% !important;
            min-height: 0 !important;
            height: calc(100vh - 1px) !important;
            box-sizing: border-box !important;
            padding: 118px 88px 72px !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            page-break-after: always !important;
          }
          .quotation-print-cover-main h1 {
            font-size: 36px !important;
          }
          .quotation-print-cover-main h1 em {
            font-size: inherit !important;
          }
          .quotation-print-cover-main h2 {
            margin-top: 62px !important;
            font-size: 30px !important;
          }
          .quotation-print-cover-main p {
            margin-top: 54px !important;
            font-size: 18px !important;
          }
          .quotation-print-cover-fields {
            width: 430px !important;
            gap: 18px !important;
            margin: 110px auto 0 !important;
          }
          .quotation-print-cover-field {
            grid-template-columns: 126px minmax(0, 1fr) !important;
            align-items: start !important;
            gap: 14px !important;
          }
          .quotation-print-cover-field span,
          .quotation-print-cover-field strong {
            font-size: 16px !important;
          }
          .quotation-print-cover-field strong {
            overflow: visible !important;
            text-overflow: clip !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }
          .quotation-print-cover-brand {
            gap: 36px !important;
            right: 88px !important;
            bottom: 72px !important;
            left: 88px !important;
          }
          .quotation-print-cover-brand-mark img {
            max-width: 172px !important;
            max-height: 42px !important;
          }
          .quotation-print-cover-brand-mark strong {
            font-size: 18px !important;
          }
          .quotation-print-head-table {
            grid-template-columns: 34% repeat(3, minmax(0, 1fr)) 10% !important;
            grid-template-rows: repeat(2, 44px) !important;
          }
          .quotation-print-composition {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .quotation-print-composition-detail-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .quotation-print-section {
            break-inside: auto;
            page-break-inside: auto;
          }
          .quotation-print-section-new-page {
            break-before: page;
            page-break-before: always;
          }
          .quotation-print-section-heading {
            break-after: avoid;
            page-break-after: avoid;
          }
          .quotation-print-table thead {
            display: table-header-group;
          }
          .quotation-print-table tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .quotation-print-document table,
          .quotation-print-base-table,
          .quotation-print-material-table,
	          .quotation-print-fee-table,
	          .quotation-print-cabinet-table,
	          .quotation-print-composition-table,
	          .quotation-print-appendix-note,
	          .quotation-print-budget-compilation-content {
	            border-collapse: collapse !important;
	            border-spacing: 0 !important;
	            border: 1px solid #111111 !important;
            border-radius: 0 !important;
            overflow: hidden !important;
          }
          .quotation-print-appendix-note-label {
            border-right-color: #111111 !important;
          }
          .quotation-print-document th,
          .quotation-print-document td,
          .quotation-print-base-table th,
          .quotation-print-base-table td,
          .quotation-print-material-table th,
          .quotation-print-material-table td,
          .quotation-print-fee-table th,
          .quotation-print-fee-table td,
          .quotation-print-cabinet-table th,
          .quotation-print-cabinet-table td,
          .quotation-print-composition-table th,
          .quotation-print-composition-table td {
            border: 1px solid #111111 !important;
            font-size: 11px !important;
            line-height: 1.48 !important;
            padding: 7px 8px !important;
            vertical-align: middle !important;
          }
          .quotation-print-base-table col:nth-child(1) { width: 5% !important; }
          .quotation-print-base-table col:nth-child(2) { width: 21% !important; }
          .quotation-print-base-table col:nth-child(3) { width: 6% !important; }
          .quotation-print-base-table col:nth-child(4) { width: 5% !important; }
          .quotation-print-base-table col:nth-child(5),
          .quotation-print-base-table col:nth-child(7) { width: 6% !important; }
          .quotation-print-base-table col:nth-child(6),
          .quotation-print-base-table col:nth-child(8) { width: 7.5% !important; }
          .quotation-print-base-table col:nth-child(9) { width: 8.5% !important; }
          .quotation-print-base-table col:nth-child(10) { width: 27.5% !important; }
          .quotation-print-base-table th,
          .quotation-print-base-table td {
            font-size: 10.5px !important;
            line-height: 1.42 !important;
            padding: 6px 5px !important;
          }
          .quotation-print-base-description {
            font-size: 9.5px !important;
            line-height: 1.34 !important;
            overflow-wrap: break-word !important;
            word-break: normal !important;
          }
          .quotation-print-base-labor-total-head {
            border-right: 1px solid #111111 !important;
          }
          .quotation-print-base-labor-head {
            border-left: 0 !important;
            border-right: 0 !important;
          }
          .quotation-print-base-subtotal-boundary-head {
            border-right: 0 !important;
          }
          .quotation-print-base-subtotal-head {
            border-left: 1px solid #111111 !important;
          }
          .quotation-print-document,
          .quotation-print-document * {
            text-shadow: none !important;
            filter: none !important;
            -webkit-font-smoothing: antialiased !important;
            text-rendering: geometricPrecision !important;
          }
          .quotation-print-document {
            box-shadow: none !important;
          }
          .quotation-print-document th,
          .quotation-print-document td,
          .quotation-print-document .quotation-print-item-name,
          .quotation-print-document .quotation-print-base-description,
          .quotation-print-document .quotation-print-rule-cell {
            color: #222222 !important;
          }
          .quotation-print-document td,
          .quotation-print-document .quotation-print-item-name,
          .quotation-print-document .quotation-print-base-description,
          .quotation-print-document .quotation-print-rule-cell {
            font-weight: 400 !important;
          }
          .quotation-print-document th,
          .quotation-print-document .quotation-print-space-row td,
          .quotation-print-document .quotation-print-space-total-row td,
          .quotation-print-document .quotation-print-total-row td {
            font-weight: 600 !important;
          }
          .quotation-print-document .tabular-nums,
          .quotation-print-document .text-right,
          .quotation-print-document td.text-center {
            font-weight: 400 !important;
          }
          .quotation-print-document .quotation-print-space-total-row .text-right,
          .quotation-print-document .quotation-print-total-row .text-right {
            font-weight: 600 !important;
          }
          .quotation-print-document table,
          .quotation-print-document th,
          .quotation-print-document td,
          .quotation-print-document .quotation-print-item-name,
          .quotation-print-document .quotation-print-base-description,
          .quotation-print-document .quotation-print-rule-cell {
            font-family: SimSun, STSong, "Songti SC", serif !important;
            -webkit-text-stroke: 0 transparent !important;
          }
          .quotation-print-document th,
          .quotation-print-document .quotation-print-space-row td,
          .quotation-print-document .quotation-print-space-total-row td,
          .quotation-print-document .quotation-print-total-row td,
          .quotation-print-document .quotation-print-space-total-row .text-right,
          .quotation-print-document .quotation-print-total-row .text-right {
            font-weight: 500 !important;
          }
          .quotation-print-document td,
          .quotation-print-document td *,
          .quotation-print-document .quotation-print-base-description,
          .quotation-print-document .quotation-print-rule-cell {
            font-weight: 400 !important;
          }
          .quotation-print-document .quotation-print-space-row td,
          .quotation-print-document .quotation-print-space-total-row td,
          .quotation-print-document .quotation-print-total-row td {
            font-weight: 500 !important;
          }
          .quotation-print-document {
            --quotation-print-ink: #242424;
            --quotation-print-line: #2f2f2f;
            color: var(--quotation-print-ink) !important;
          }
          .quotation-print-document,
          .quotation-print-document :where(h1, h2, h3, p, span, strong, small, em, th, td, footer, div) {
            color: var(--quotation-print-ink) !important;
            font-family: SimSun, STSong, "Songti SC", serif !important;
            text-shadow: none !important;
            filter: none !important;
            -webkit-text-stroke: 0 transparent !important;
            font-synthesis-weight: none !important;
          }
          .quotation-print-cover-main h1,
          .quotation-print-cover-main h1 em,
          .quotation-print-cover-main h2,
          .quotation-print-cover-brand-mark strong,
          .quotation-print-head-title-cell h1,
          .quotation-print-section-heading h2,
          .quotation-print-budget-compilation-head span {
            font-weight: 500 !important;
          }
          .quotation-print-cover-main p,
          .quotation-print-cover-field span,
          .quotation-print-cover-field strong,
          .quotation-print-head-title-cell p,
          .quotation-print-head-field span,
          .quotation-print-head-field strong,
          .quotation-print-qr p,
          .quotation-print-appendix-note,
          .quotation-print-appendix-note *,
          .quotation-print-budget-compilation-content,
          .quotation-print-budget-compilation-content *,
          .quotation-print-signature-card p {
            font-weight: 400 !important;
          }
          .quotation-print-document table,
          .quotation-print-base-table,
          .quotation-print-material-table,
          .quotation-print-fee-table,
          .quotation-print-cabinet-table,
          .quotation-print-composition-table,
          .quotation-print-appendix-note,
          .quotation-print-budget-compilation-content,
          .quotation-print-head-table {
            border-color: var(--quotation-print-line) !important;
            border-width: 0.75px !important;
          }
          .quotation-print-document th,
          .quotation-print-document td,
          .quotation-print-base-table th,
          .quotation-print-base-table td,
          .quotation-print-material-table th,
          .quotation-print-material-table td,
          .quotation-print-fee-table th,
          .quotation-print-fee-table td,
          .quotation-print-cabinet-table th,
          .quotation-print-cabinet-table td,
          .quotation-print-composition-table th,
          .quotation-print-composition-table td,
          .quotation-print-head-field,
          .quotation-print-qr,
          .quotation-print-appendix-note-label {
            border-color: var(--quotation-print-line) !important;
            border-width: 0.75px !important;
          }
          .quotation-print-document th {
            font-weight: 500 !important;
          }
          .quotation-print-document td,
          .quotation-print-document td *,
          .quotation-print-base-description,
          .quotation-print-rule-cell {
            font-weight: 400 !important;
          }
          .quotation-print-space-row td,
          .quotation-print-space-row td *,
          .quotation-print-space-total-row td,
          .quotation-print-total-row td {
            font-weight: 500 !important;
          }
          .quotation-print-cover-field strong {
            border: 0 !important;
            border-bottom: 0.75px solid var(--quotation-print-line) !important;
          }
          .quotation-print-signature-card {
            border: 0 !important;
            border-bottom: 0.75px solid var(--quotation-print-line) !important;
          }
          .quotation-print-head-table {
            --quotation-print-head-line-color: var(--quotation-print-line) !important;
            --quotation-print-head-inner-line-color: var(--quotation-print-line) !important;
            --quotation-print-head-line-width: 1px !important;
            --quotation-print-head-inner-line-width: 1px !important;
            border: 1px solid var(--quotation-print-head-line-color) !important;
          }
          .quotation-print-head-field {
            border: 0 !important;
          }
          .quotation-print-head-field-phone,
          .quotation-print-head-field-area,
          .quotation-print-head-field-date {
            border-top: 0 !important;
          }
          .quotation-print-head-field-designer,
          .quotation-print-head-field-creator,
          .quotation-print-head-field-company-phone {
            border-top: 0 !important;
          }
          .quotation-print-qr {
            border: 0 !important;
          }
          .quotation-print-appendix-note {
            border: 0.75px solid var(--quotation-print-line) !important;
            border-collapse: initial !important;
          }
          .quotation-print-appendix-note-label {
            border: 0 !important;
            border-right: 0.75px solid var(--quotation-print-line) !important;
          }
        }
        @media print and (orientation: landscape) {
          .quotation-print-cover-page {
            padding: 72px 88px 34px !important;
          }
          .quotation-print-cover-main h1 {
            font-size: 30px !important;
          }
          .quotation-print-cover-main h2 {
            margin-top: 42px !important;
            font-size: 25px !important;
          }
          .quotation-print-cover-main p {
            margin-top: 38px !important;
            font-size: 16px !important;
          }
          .quotation-print-cover-fields {
            width: 450px !important;
            gap: 14px !important;
            margin: 70px auto 0 !important;
          }
          .quotation-print-cover-field {
            grid-template-columns: 122px minmax(0, 1fr) !important;
            align-items: start !important;
            gap: 14px !important;
          }
          .quotation-print-cover-field span,
          .quotation-print-cover-field strong {
            font-size: 15px !important;
          }
          .quotation-print-cover-field strong {
            overflow: visible !important;
            text-overflow: clip !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }
          .quotation-print-cover-brand {
            gap: 42px !important;
            right: 88px !important;
            bottom: 34px !important;
            left: 88px !important;
          }
          .quotation-print-cover-brand-mark {
            gap: 10px !important;
          }
          .quotation-print-cover-brand-mark img {
            max-width: 132px !important;
            max-height: 34px !important;
          }
          .quotation-print-cover-brand-mark strong {
            max-width: 96px !important;
            font-size: 16px !important;
          }
        }
      `}</style>
    </article>
  );
}
