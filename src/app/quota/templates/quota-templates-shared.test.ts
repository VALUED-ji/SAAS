import { describe, expect, it } from "vitest";
import { calculateFormulaTableTotal } from "@/lib/quotationFeeFormulas";
import { formatQuotationQuantityFormulaRows } from "@/lib/quotationQuantityLinks";
import {
  applyTemplateSpaceQuantityLinks,
  convertComprehensiveFeesToFormulaMode,
  findDuplicateDiscountFee,
  getTemplateFeeRulePreview,
  makeEmptyTemplate,
  makeSpaceCopy,
  makeSpaceQuotaItem,
  normalizeComprehensiveFees,
  normalizeSpaceQuotaItem,
  repairTemplateSpaceQuantityLinksAfterDeletion,
  type TemplateSpace,
} from "./quota-templates-shared";

function quota(overrides: Parameters<typeof makeSpaceQuotaItem>[0] = {}) {
  return makeSpaceQuotaItem({
    name: "项目",
    unit: "㎡",
    quoteScope: "foundation",
    ...overrides,
  });
}

function formula(itemId: string, terms: Array<{ operator: "add" | "subtract"; itemId: string }> = []) {
  let expression: any = {
    type: "reference",
    itemId,
  };
  terms.forEach((term) => {
    expression = {
      type: "binary",
      operator: term.operator,
      left: expression,
      right: { type: "reference", itemId: term.itemId },
    };
  });
  return JSON.stringify({
    version: 2,
    expression,
  });
}

describe("quota template quantity presets", () => {
  it("starts new templates with only the direct project fee as the final total", () => {
    const template = makeEmptyTemplate();

    expect(template.comprehensiveFees).toHaveLength(1);
    expect(template.comprehensiveFees[0]).toMatchObject({
      name: "工程直接费",
      valueSource: "direct",
      fee_calc_method: "formula",
      fee_calc_base: "直接费",
      isFinalTotal: true,
    });
  });

  it("converts legacy fixed comprehensive fees to numeric formulas", () => {
    const [fixedFee, manualFee] = normalizeComprehensiveFees([
      {
        id: "fee-fixed",
        name: "固定设计费",
        valueSource: "fixed",
        fee_calc_method: "fixed",
        unit_price: 500,
      },
      {
        id: "fee-manual",
        name: "报价时填写",
        valueSource: "manual",
        fee_calc_method: "fixed",
        unit_price: 300,
      },
    ]);

    expect(fixedFee).toMatchObject({
      valueSource: "formula",
      fee_calc_method: "formula",
      fee_calc_base: "500",
      unit_price: 0,
    });
    expect(getTemplateFeeRulePreview(fixedFee)).toBe("固定金额 500 元");
    expect(manualFee).toMatchObject({
      valueSource: "manual",
      fee_calc_method: "fixed",
      unit_price: 0,
    });
  });

  it("subtracts the quote discount when converting legacy comprehensive fees", () => {
    const fees = convertComprehensiveFeesToFormulaMode([]);
    const finalFee = fees.find((fee) => fee.isFinalTotal);
    const formulaFees = fees.map((fee) => ({ ...fee, category: "other", fee_value_source: fee.valueSource }));

    expect(finalFee).toBeTruthy();
    const result = calculateFormulaTableTotal(formulaFees, 1000, 0, String(finalFee?.id || ""), { discountAmount: 100 });
    expect(result.finalAmount).toBe(900);
  });

  it("detects a duplicate quote-discount value source", () => {
    const duplicate = findDuplicateDiscountFee([
      {
        id: "fee-discount-a",
        name: "人工优惠",
        isFinalTotal: false,
        valueSource: "discount",
        fee_calc_method: "reference",
        fee_calc_base: "",
        fee_rate: 0,
        unit_price: 0,
        remark: "",
        fee_scope_mode: "all",
        fee_scope_space_names: [],
      },
      {
        id: "fee-discount-b",
        name: "总经理优惠",
        isFinalTotal: false,
        valueSource: "discount",
        fee_calc_method: "reference",
        fee_calc_base: "",
        fee_rate: 0,
        unit_price: 0,
        remark: "",
        fee_scope_mode: "all",
        fee_scope_space_names: [],
      },
    ]);

    expect(duplicate?.id).toBe("fee-discount-b");
  });

  it("normalizes preset quantity and formula", () => {
    const normalized = normalizeSpaceQuotaItem({
      id: "quota-a",
      name: "墙面乳胶漆",
      unit: "㎡",
      quantity: 12.5,
      quantity_formula: formula("quota-b"),
    }, 0);

    expect(normalized.quantity).toBe(12.5);
    expect(formatQuotationQuantityFormulaRows([
      quota({ id: "quota-b" }),
      normalized,
    ], normalized.quantityFormula)).toBe("=[1]");
  });

  it("remaps formula references when copying a space", () => {
    const source: TemplateSpace = {
      id: "space-a",
      name: "客厅",
      quotaItems: [
        quota({ id: "base-a", name: "项目 A", quantity: 3 }),
        quota({ id: "result-a", name: "项目 B", quantity: 3, quantityFormula: formula("base-a") }),
      ],
    };
    const copied = makeSpaceCopy(source, [source]);

    expect(copied.quotaItems[0].id).not.toBe("base-a");
    expect(formatQuotationQuantityFormulaRows(copied.quotaItems, copied.quotaItems[1].quantityFormula)).toBe("=[1]");
  });

  it("recalculates formula quantities after an upstream preset changes", () => {
    const space: TemplateSpace = {
      id: "space-a",
      name: "客厅",
      quotaItems: [
        quota({ id: "base-a", name: "项目 A", quantity: 2 }),
        quota({ id: "result-a", name: "项目 B", quantity: 2, quantityFormula: formula("base-a") }),
      ],
    };
    const next = applyTemplateSpaceQuantityLinks({
      ...space,
      quotaItems: space.quotaItems.map((item) => item.id === "base-a" ? { ...item, quantity: 8 } : item),
    });

    expect(next.quotaItems[1].quantity).toBe(8);
  });

  it("repairs simple formulas after a referenced template item is deleted", () => {
    const remaining: TemplateSpace = {
      id: "space-a",
      name: "客厅",
      quotaItems: [
        quota({
          id: "result-a",
          name: "项目 B",
          quantity: 12,
          quantityFormula: formula("base-a", [{ operator: "add", itemId: "other-a" }]),
        }),
        quota({ id: "other-a", name: "项目 C", quantity: 12 }),
      ],
    };
    const repaired = repairTemplateSpaceQuantityLinksAfterDeletion(remaining, new Set(["base-a"]));

    expect(formatQuotationQuantityFormulaRows(repaired.quotaItems, repaired.quotaItems[0].quantityFormula)).toBe("=[2]");
    expect(repaired.quotaItems[0].quantity).toBe(12);
  });
});
