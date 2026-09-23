import { toMoney, toNumber } from "./quotationFeeFormulas";

export type DiscountCalculationRule = {
  id: string;
  name?: string;
  type: "fee" | "space" | "work_type";
  mode: "amount" | "rate";
  scope?: string;
  space?: string;
  workType?: string;
  discount?: number;
  rate?: number;
};

export type DiscountDetailRule = {
  name: string;
  scopeLabel: string;
  mode: "amount" | "rate";
  rate?: number;
  discount?: number;
  amount: number;
};

export function formatDiscountDetailMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

export function formatDiscountRateCoefficient(value: number) {
  const next = Number.isFinite(toNumber(value)) ? toNumber(value) : 1;
  return Number.isInteger(next) ? String(next) : String(next).replace(/\.?0+$/, "");
}

export function formatDiscountRuleDetailText(rows: DiscountDetailRule[], total: number) {
  if (rows.length === 0) return "";
  const details = rows.map((row) => {
    const calculation = row.mode === "rate"
      ? `${row.scopeLabel} × ${formatDiscountRateCoefficient(row.rate || 1)}`
      : `${row.scopeLabel}减 ${formatDiscountDetailMoney(row.discount || 0)}`;
    return `${row.name}：${calculation}，优惠 ${formatDiscountDetailMoney(row.amount)}`;
  });
  details.push(`优惠合计：${formatDiscountDetailMoney(total)}`);
  return details.join("；");
}

export function getDiscountRuleValue(rule: DiscountCalculationRule) {
  if (rule.type === "space") return rule.space ? `space:${rule.space}` : "";
  if (rule.type === "work_type") return rule.workType ? `work_type:${rule.workType}` : "";
  return rule.scope || "total";
}

export function getDiscountRuleGroupKey(rule: DiscountCalculationRule) {
  return `${rule.type}:${getDiscountRuleValue(rule) || "total"}`;
}

export function calculateDiscountRuleAmounts<T extends DiscountCalculationRule>(
  rules: T[],
  getScopeAmount: (rule: T) => number,
  options?: {
    excludedAmount?: number;
    totalCap?: number;
  },
) {
  const remainingByGroup = new Map<string, number>();
  const amountById = new Map<string, number>();
  let remainingExcludedAmount = Math.max(0, toNumber(options?.excludedAmount));
  let remainingTotalCap = Math.max(0, toNumber(options?.totalCap ?? Number.MAX_SAFE_INTEGER));

  rules.forEach((rule) => {
    const groupKey = getDiscountRuleGroupKey(rule);
    if (!remainingByGroup.has(groupKey)) {
      const scopeAmount = Math.max(0, toNumber(getScopeAmount(rule)));
      const excludedAmount = Math.min(scopeAmount, remainingExcludedAmount);
      remainingExcludedAmount = Math.max(0, toMoney(remainingExcludedAmount - excludedAmount));
      remainingByGroup.set(groupKey, Math.max(0, toMoney(scopeAmount - excludedAmount)));
    }

    const baseAmount = Math.max(0, remainingByGroup.get(groupKey) || 0);
    const calculatedAmount = baseAmount <= 0
      ? 0
      : rule.mode === "rate"
        ? toMoney(baseAmount * (1 - Math.min(1, Math.max(0, toNumber(rule.rate || 1)))))
        : toMoney(Math.min(Math.max(0, toNumber(rule.discount)), baseAmount));
    const appliedAmount = Math.max(0, Math.min(calculatedAmount, remainingTotalCap));

    amountById.set(rule.id, toMoney(appliedAmount));
    remainingByGroup.set(groupKey, Math.max(0, toMoney(baseAmount - calculatedAmount)));
    remainingTotalCap = Math.max(0, toMoney(remainingTotalCap - appliedAmount));
  });

  return amountById;
}

export function calculateDiscountRulesTotal<T extends DiscountCalculationRule>(
  rules: T[],
  getScopeAmount: (rule: T) => number,
  options?: {
    excludedAmount?: number;
    totalCap?: number;
  },
) {
  return Array.from(calculateDiscountRuleAmounts(rules, getScopeAmount, options).values())
    .reduce((sum, amount) => toMoney(sum + amount), 0);
}

export function applyQuoteDiscountToFormulaTotal(
  undiscountedTotal: number,
  _discountedTotal: number,
  discountAmount: number,
) {
  const total = Math.max(0, toNumber(undiscountedTotal));
  const discount = Math.min(total, Math.max(0, toNumber(discountAmount)));
  return Math.max(0, toMoney(total - discount));
}
