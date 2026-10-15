export type PricingMode = "split" | "single";

export function pricingConfigurationError(items: any[], settings: any = {}) {
  if (!items.some((item) => item.pricing_mode === "single" && item.package_scope !== "included")) return "";
  for (const fee of items) {
    if (!["other", "综合费用", "其他", "其他费用"].includes(fee.category) || !["percent", "formula", "reference"].includes(fee.fee_calc_method)) continue;
    let formula = String(fee.fee_calc_base || "");
    try { formula = decodeURIComponent(formula); } catch {}
    if (/人工|材料费|MATERIAL_COST|\bLABOR\b|base_labor|[（(]材料[）)]/.test(formula) || formula.trim() === "材料") return `综合费用「${fee.name || "未命名费用"}」使用了人工或材料报价金额，但存在未拆分客户单价的项目，请改用基装直接费等计费依据。`;
  }
  const scopes = [settings.discountScope, ...(Array.isArray(settings.discountRules) ? settings.discountRules.map((rule: any) => rule.scope) : [])];
  if (scopes.some((scope) => ["base_labor", "base_material"].includes(scope)) || settings.excludeLaborOnlyDiscountItems) return "存在未拆分客户单价的项目，请取消人工或材料报价金额相关的优惠条件。";
  return "";
}

export function pricingSnapshot(items: any[]) {
  return Object.fromEntries(items.filter((item) => item.id).map((item) => [item.id, {
    pricing_mode: item.pricing_mode === "single" ? "single" : "split",
    quota_source_total_price: item.quota_source_total_price ?? null,
  }]));
}

export function withPricingSnapshot<T extends { id?: string }>(items: T[], settings: any): (T & { pricing_mode: PricingMode; quota_source_total_price?: number | null })[] {
  return items.map((item) => ({ ...item,
    pricing_mode: settings?._pricing?.[item.id || ""]?.pricing_mode || (settings?.splitCustomerPrice === false ? "single" : "split"),
    quota_source_total_price: settings?._pricing?.[item.id || ""]?.quota_source_total_price ?? null,
  }));
}

export function isSingleCustomerPrice(item: { pricingMode?: string; pricing_mode?: string }) {
  return item.pricingMode === "single" || item.pricing_mode === "single";
}

export function customerUnitPrice(item: { totalPrice?: number; laborPrice?: number; materialPrice?: number; pricingMode?: string }) {
  return isSingleCustomerPrice(item) ? Number(item.totalPrice || 0) : Number(item.laborPrice || 0) + Number(item.materialPrice || 0);
}

export function pricingModeForScope(scope: string, modes: Record<string, PricingMode>): PricingMode {
  return modes[scope] === "single" ? "single" : "split";
}
