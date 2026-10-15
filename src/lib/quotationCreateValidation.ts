import type { AreaOverageRule } from "./quotationPackageArea";

export function getCreateCustomerError(input: { temporary: boolean; customerId: string; address: string; phone: string; area: string }) {
  if (!input.temporary && !input.customerId) return "请先选择客户";
  if (!input.address.trim()) return "请填写小区/地址";
  if (input.phone.trim() && !/^1\d{10}$/.test(input.phone.trim())) return "请填写正确的11位手机号，或留空";
  if (input.area.trim() && (!Number.isFinite(Number(input.area)) || Number(input.area) < 0)) return "请填写有效的工地面积";
  return "";
}

export function getCreatePricingError(input: { needsStore: boolean; storeId: string; packageMode: boolean; area: string; rules: AreaOverageRule[]; actuals: Record<string, string> }) {
  if (input.needsStore && !input.storeId) return "请选择报价归属门店";
  if (input.packageMode && (!input.area.trim() || !Number.isFinite(Number(input.area)) || Number(input.area) <= 0)) return "请先确认有效的套餐计价面积";
  for (const [index, rule] of input.rules.entries()) {
    const id = String(rule.id || `area-overage-${index}`);
    const value = input.actuals[id] ?? String(rule.includedQuantity ?? 0);
    if (!value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0) return `请填写${rule.name || "超标加价项目"}的有效实际数量`;
  }
  return "";
}

export function buildCreateOverageDefaults(rules: AreaOverageRule[]) {
  return Object.fromEntries(rules.map((rule, index) => [String(rule.id || `area-overage-${index}`), String(rule.includedQuantity ?? 0)]));
}
