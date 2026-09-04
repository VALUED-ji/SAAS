// 报价详情页共享工具模块
// 存放报价编辑表格与页面主体共用的类型与纯计算函数。

import type { FeeCalcBase, FeeCalcMethod } from "@/lib/quotationFeeFormulas";

export type QuotationItem = {
  id?: string;
  client_key?: string;
  source?: "standard" | "custom";
  category: string;
  space?: string;
  work_type_id?: string | null;
  work_type_name?: string | null;
  material_category_id?: string | null;
  material_category_name?: string | null;
  name: string;
  spec: string;
  material_model?: string;
  remark?: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price?: number;
  material_cost?: number;
  labor_cost?: number;
  cost_material_unit?: number;
  cost_labor_unit?: number;
  cost_loss_rate?: number;
  cost_source?: string | null;
  profit_margin?: number;
  row_color?: string | null;
  fee_calc_method?: FeeCalcMethod;
  fee_calc_base?: FeeCalcBase;
  fee_rate?: number;
};

export function normalizeCategoryName(category: unknown) {
  return String(category || "").trim();
}

export function getCategoryKey(category: unknown) {
  const name = normalizeCategoryName(category);
  if (name === "base" || name === "基装" || name === "基装项目") return "base";
  if (name === "main_material" || name === "主材" || name === "主材项目" || name === "产品" || name === "产品项目") return "main_material";
  if (name === "custom_cabinet" || name === "定制柜" || name === "定制柜项目") return "custom_cabinet";
  if (name === "other") return "other";
  if (!name) return "";
  return "main_material";
}

export function isOtherCategory(category: string) {
  return category === "other";
}

export function isBaseCategory(category: string) {
  return getCategoryKey(category) === "base";
}

export function isMainMaterialCategory(category: string) {
  return getCategoryKey(category) === "main_material";
}

export function isCustomCabinetCategory(category: string) {
  return getCategoryKey(category) === "custom_cabinet";
}

export function isDirectItemCategory(category: string) {
  return !isOtherCategory(category);
}

export function sameQuoteCategory(left: unknown, right: unknown) {
  return getCategoryKey(left) === getCategoryKey(right);
}

import { toNumber } from "@/lib/quotationFeeFormulas";

export type DictionaryOption = {
  id: string;
  name: string;
  parentName?: string;
};

export function formatQuoteAmount(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}
