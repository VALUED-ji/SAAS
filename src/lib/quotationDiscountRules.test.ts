import { describe, expect, it } from "vitest";
import {
  applyQuoteDiscountToFormulaTotal,
  calculateDiscountRuleAmounts,
  calculateDiscountRulesTotal,
  type DiscountCalculationRule,
} from "./quotationDiscountRules";

function rule(overrides: Partial<DiscountCalculationRule> & Pick<DiscountCalculationRule, "id">): DiscountCalculationRule {
  return {
    type: "fee",
    mode: "amount",
    scope: "total",
    ...overrides,
  };
}

describe("quotation discount rules", () => {
  it("applies repeated discounts to the remaining amount", () => {
    const rules = [
      rule({ id: "rate-1", mode: "rate", rate: 0.9 }),
      rule({ id: "rate-2", mode: "rate", rate: 0.95 }),
      rule({ id: "amount", discount: 1000 }),
    ];

    const amounts = calculateDiscountRuleAmounts(rules, () => 100000, { totalCap: 100000 });

    expect(Array.from(amounts.values())).toEqual([10000, 4500, 1000]);
    expect(calculateDiscountRulesTotal(rules, () => 100000, { totalCap: 100000 })).toBe(15500);
  });

  it("caps overlapping scopes so the rule rows reconcile with the final discount", () => {
    const rules = [
      rule({ id: "base", scope: "base", mode: "rate", rate: 0.1 }),
      rule({ id: "total", scope: "total", mode: "rate", rate: 0.1 }),
    ];
    const scopeAmounts: Record<string, number> = {
      base: 80,
      total: 100,
    };

    const amounts = calculateDiscountRuleAmounts(rules, (item) => scopeAmounts[item.scope || "total"], { totalCap: 100 });

    expect(Array.from(amounts.values())).toEqual([72, 28]);
    expect(Array.from(amounts.values()).reduce((sum, amount) => sum + amount, 0)).toBe(100);
  });

  it("consumes a fixed exclusion amount only once across scopes", () => {
    const rules = [
      rule({ id: "base", scope: "base", discount: 40 }),
      rule({ id: "total", scope: "total", discount: 40 }),
    ];
    const scopeAmounts: Record<string, number> = {
      base: 80,
      total: 100,
    };

    const amounts = calculateDiscountRuleAmounts(rules, (item) => scopeAmounts[item.scope || "total"], {
      excludedAmount: 100,
      totalCap: 100,
    });

    expect(Array.from(amounts.values())).toEqual([0, 40]);
  });

  it("applies a missing discount after the formula total is calculated", () => {
    expect(applyQuoteDiscountToFormulaTotal(419096.7, 419096.7, 38099.7)).toBe(380997);
  });

  it("does not apply the discount twice when the formula already deducted it", () => {
    expect(applyQuoteDiscountToFormulaTotal(419096.7, 380997, 38099.7)).toBe(380997);
  });

  it("keeps the displayed arithmetic valid when a formula deducted the discount twice", () => {
    expect(applyQuoteDiscountToFormulaTotal(419096.7, 322897.3, 48099.7)).toBe(370997);
  });
});
