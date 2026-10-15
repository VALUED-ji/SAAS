import { roundPricingMoney, toPricingAmount } from "@/lib/quotaTemplatePricing";

export type PackageScope = "included" | "extra";
export const PACKAGE_AREA_CATEGORY = "套餐平方";
export const PACKAGE_AREA_OVERAGE_CATEGORY = "套餐超标加价";

export type AreaOverageRule = {
  id?: string | null;
  name?: string | null;
  unit?: string | null;
  includedQuantity?: number | string | null;
  actualQuantity?: number | string | null;
  unitPrice?: number | string | null;
};

export type AreaOverageRow = {
  id: string;
  name: string;
  unit: string;
  includedQuantity: number;
  actualQuantity: number;
  overageQuantity: number;
  unitPrice: number;
  amount: number;
  remark: string;
};

export type AreaQuoteConfig = {
  mode?: string | null;
  areaUnitPrice?: number | string | null;
  areaTiers?: Array<{ maxArea?: number | string | null; unitPrice?: number | string | null }> | null;
  minChargeAmount?: number | string | null;
  overageRules?: AreaOverageRule[] | null;
};

export function normalizePackageScope(value: unknown): PackageScope {
  return value === "extra" ? "extra" : "included";
}

export function isPackageIncludedItem(item: { package_scope?: string | null }) {
  return item.package_scope === "included";
}

export function getPackageScopeLabel(item: { package_scope?: string | null }) {
  return item.package_scope === "included" ? "套餐内包含" : item.package_scope === "extra" ? "套餐外另计" : "";
}

export function normalizeAreaOverageRules(value: unknown): AreaOverageRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((rule, index) => {
      const raw = rule && typeof rule === "object" ? rule as Record<string, unknown> : {};
      const name = String(raw.name || "").trim();
      const unit = String(raw.unit || "个").trim() || "个";
      const includedQuantity = toPricingAmount(raw.includedQuantity);
      const actualQuantity = toPricingAmount(raw.actualQuantity ?? raw.includedQuantity);
      const unitPrice = toPricingAmount(raw.unitPrice);
      return {
        id: String(raw.id || `area-overage-${index + 1}`).trim(),
        name: name || `超标加价${index + 1}`,
        unit,
        includedQuantity,
        actualQuantity,
        unitPrice,
      };
    })
    .filter((rule) => String(rule.name || "").trim());
}

function buildOverageRemark(row: AreaOverageRow) {
  return `套餐包含 ${row.includedQuantity}${row.unit}，实际 ${row.actualQuantity}${row.unit}，超出 ${row.overageQuantity}${row.unit} × ${row.unitPrice.toFixed(2)} 元/${row.unit}`;
}

export function calculateAreaQuotePrice(config: AreaQuoteConfig | null | undefined, inputArea: unknown) {
  const area = toPricingAmount(inputArea);
  const tiers = Array.isArray(config?.areaTiers) ? config.areaTiers : [];
  // 面积阶梯决定整套套餐的每平方单价，不按区间累进收费。
  const tier = tiers.find((row) => toPricingAmount(row.maxArea) === 0 || area <= toPricingAmount(row.maxArea)) || tiers.at(-1);
  const unitPrice = toPricingAmount(tier?.unitPrice ?? config?.areaUnitPrice);
  const calculatedAmount = roundPricingMoney(area * unitPrice);
  const minChargeAmount = toPricingAmount(config?.minChargeAmount);
  const baseAmount = area > 0 ? roundPricingMoney(Math.max(calculatedAmount, minChargeAmount)) : 0;
  const overageRows = normalizeAreaOverageRules(config?.overageRules).map((rule, index): AreaOverageRow => {
    const includedQuantity = toPricingAmount(rule.includedQuantity);
    const actualQuantity = toPricingAmount(rule.actualQuantity ?? includedQuantity);
    const unitPriceValue = toPricingAmount(rule.unitPrice);
    const overageQuantity = Math.max(0, roundPricingMoney(actualQuantity - includedQuantity));
    const amount = roundPricingMoney(overageQuantity * unitPriceValue);
    const row: AreaOverageRow = {
      id: String(rule.id || `area-overage-${index + 1}`).trim(),
      name: String(rule.name || `超标加价${index + 1}`).trim(),
      unit: String(rule.unit || "个").trim() || "个",
      includedQuantity,
      actualQuantity,
      overageQuantity,
      unitPrice: unitPriceValue,
      amount,
      remark: "",
    };
    return { ...row, remark: buildOverageRemark(row) };
  });
  const overageAmount = roundPricingMoney(overageRows.reduce((sum, row) => sum + row.amount, 0));
  return {
    area,
    unitPrice,
    calculatedAmount,
    minChargeAmount,
    baseAmount,
    overageRows,
    overageAmount,
    totalAmount: roundPricingMoney(baseAmount + overageAmount),
  };
}

export function buildAreaPricingItem(config: AreaQuoteConfig, area: unknown) {
  const result = calculateAreaQuotePrice(config, area);
  const minimumText = result.baseAmount > result.calculatedAmount ? `；按最低套餐价 ${result.baseAmount.toFixed(2)} 元计费` : "";
  return {
    category: PACKAGE_AREA_CATEGORY,
    space: "",
    package_scope: null,
    name: "套餐基础价",
    spec: "",
    material_model: "",
    remark: `计价面积 ${result.area} ㎡ × 套餐单价 ${result.unitPrice.toFixed(2)} 元/㎡${minimumText}`,
    unit: "㎡",
    quantity: result.area,
    quantity_formula: null,
    unit_price: result.area > 0 ? result.baseAmount / result.area : result.unitPrice,
    total_price: result.baseAmount,
    material_cost: 0,
    labor_cost: 0,
    profit_margin: 0,
    fee_calc_method: null,
    fee_calc_base: null,
    fee_rate: null,
    row_color: null,
  };
}

export function buildAreaOverageItems(config: AreaQuoteConfig, area: unknown) {
  const result = calculateAreaQuotePrice(config, area);
  return result.overageRows
    .filter((row) => row.amount > 0)
    .map((row) => ({
      category: PACKAGE_AREA_OVERAGE_CATEGORY,
      space: "",
      package_scope: null,
      name: row.name,
      spec: "",
      material_model: "",
      remark: row.remark,
      unit: row.unit,
      quantity: row.overageQuantity,
      quantity_formula: null,
      unit_price: row.unitPrice,
      total_price: row.amount,
      material_cost: 0,
      labor_cost: 0,
      profit_margin: 0,
      fee_calc_method: null,
      fee_calc_base: null,
      fee_rate: null,
      row_color: null,
      package_overage_rule_id: row.id,
      package_overage_included_quantity: row.includedQuantity,
      package_overage_actual_quantity: row.actualQuantity,
    }));
}

export function buildAreaPricingItems(config: AreaQuoteConfig, area: unknown) {
  return [
    buildAreaPricingItem(config, area),
    ...buildAreaOverageItems(config, area),
  ];
}
