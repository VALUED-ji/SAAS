// 材料库页共享工具模块
// 存放页面主体与材料编辑组件共用的类型与纯计算函数，
// 避免 page.tsx 与 material-editor.tsx 之间循环依赖。

export type Material = {
  id: string;
  code?: string | null;
  name: string;
  brand?: string | null;
  product_name?: string | null;
  material_model?: string | null;
  color?: string | null;
  spec?: string | null;
  unit?: string | null;
  unit_price?: number | null;
  market_price?: number | null;
  cost_price?: number | null;
  internal_control_price?: number | null;
  product_attributes?: string | null;
  product_highlights?: string | null;
  product_detail?: string | null;
  stock?: number | null;
  min_stock?: number | null;
  material_type?: string | null;
  supply_mode?: string | null;
  warehouse_name?: string | null;
  owner_name?: string | null;
  settlement_cycle?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_cooperation_status?: string | null;
  supplier_is_active?: number | null;
  category_id?: string | null;
  category_name?: string | null;
  image?: string | null;
  images?: string[] | string | null;
  is_active?: number | null;
  remark?: string | null;
  order_count?: number | null;
  order_quantity?: number | null;
  created_at?: string | null;
	  updated_at?: string | null;
	  price_history?: MaterialPricePoint[];
	  skus?: MaterialSku[];
	};

export type MaterialSku = {
  id?: string;
  sku_code?: string | null;
  sku_name: string;
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
  is_active?: number | null;
  sort_order?: number | null;
};

export type MaterialSkuForm = {
  id?: string;
  sku_code: string;
  sku_name: string;
  spec: string;
  color: string;
  unit: string;
  unit_price: string;
  market_price: string;
  cost_price: string;
  internal_control_price: string;
  stock: string;
  min_stock: string;
  image: string;
  is_active: boolean;
};

export type MaterialPricePoint = {
  cost_price?: number | null;
  market_price?: number | null;
  unit_price?: number | null;
  internal_control_price?: number | null;
  changed_fields?: string | null;
  changed_by_id?: string | null;
  changed_by_name?: string | null;
  source?: string | null;
  changed_at?: string | null;
};

export type Category = {
  id: string;
  name: string;
  parent_id?: string | null;
  parent_name?: string | null;
  parent_is_active?: number | null;
  parent_material_type?: string | null;
  material_type?: string | null;
  sort_order?: number | null;
  is_active?: number | null;
  material_count?: number | null;
};

export type Supplier = {
  id: string;
  name: string;
  supplier_type?: string | null;
  owner_name?: string | null;
  settlement_cycle?: string | null;
};

export type MaterialForm = {
  id?: string;
  code: string;
  name: string;
  category_parent_id: string;
  category_id: string;
  category_name: string;
  material_type: string;
  supply_mode: string;
  brand: string;
  product_name: string;
  material_model: string;
  color: string;
  spec: string;
  unit: string;
  unit_price: string;
  market_price: string;
  cost_price: string;
  internal_control_price: string;
  product_attributes: string;
  product_highlights: string;
  product_detail: string;
  supplier_id: string;
  stock: string;
  min_stock: string;
  warehouse_name: string;
  owner_name: string;
  settlement_cycle: string;
  image: string;
	  images: string[];
	  skus: MaterialSkuForm[];
	  remark: string;
	};

export type ImportErrorItem = {
  rowNumber: number;
  name: string;
  reason: string;
};

export const settlementCycleLabels: Record<string, string> = {
  IMMEDIATE: "现结",
  WEEKLY: "周结",
  MONTHLY: "月结",
  PROJECT: "按项目结",
  CREDIT: "账期",
};

const productAttributeTemplates = [
  { pattern: /瓷砖|地砖|墙砖|岩板|石材|砖/, labels: ["产地", "材质", "尺寸", "表面工艺", "防滑等级", "吸水率"] },
  { pattern: /地板|木门|室内门|门套|窗套/, labels: ["产地", "材质", "厚度", "环保等级", "表面工艺", "适用空间"] },
  { pattern: /卫浴|洁具|马桶|浴室柜|花洒|龙头|台盆|水槽|淋浴/, labels: ["产地", "材质", "尺寸", "孔距/规格", "排水方式", "适用空间"] },
  { pattern: /灯|开关|插座|电器|空调|新风|智能/, labels: ["产地", "功率", "色温/颜色", "电压", "控制方式", "适用空间"] },
  { pattern: /柜|橱柜|衣柜|定制/, labels: ["产地", "板材", "门板工艺", "板材厚度", "颜色体系", "五金配置"] },
  { pattern: /窗帘|墙纸|墙布|家具|软装|饰品/, labels: ["产地", "材质", "尺寸", "风格", "工艺", "适用空间"] },
];

const defaultProductAttributeLabels = ["产地", "材质", "尺寸", "风格", "工艺", "适用空间"];

export function parseProductAttributes(value?: string | null) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

export function getProductAttributeLabels(categoryName: string) {
  const matched = productAttributeTemplates.find((template) => template.pattern.test(categoryName));
  return matched?.labels || defaultProductAttributeLabels;
}

export function normalizeMaterialCodeInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

export function makeMaterialNameFromParts(input: { brand?: string | null; product_name?: string | null; material_model?: string | null; color?: string | null; spec?: string | null }) {
  return [input.brand, input.product_name, input.material_model, input.color, input.spec]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function makeProductMaterialNameFromParts(input: { brand?: string | null; product_name?: string | null; material_model?: string | null }) {
  return [input.brand, input.product_name, input.material_model]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function normalizeDecimalInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = cleaned.split(".");
  return decimalParts.length > 0 ? `${integerPart}.${decimalParts.join("")}` : integerPart;
}

export function formatCategoryOption(category: Category) {
  return category.parent_name ? `${category.parent_name} / ${category.name}` : category.name;
}

export function formatAmount(value?: number | null) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatQuantityText(value?: string | number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

import { formatDate, formatDateTime } from "@/lib/utils";

export function formatBeijingDate(value?: string | null) {
  return formatDate(value).replace(/\//g, "-").replace(/^-$/, "");
}

export function formatBeijingDateTime(value?: string | null) {
  return formatDateTime(value).replace(/\//g, "-").replace(/^-$/, "");
}
