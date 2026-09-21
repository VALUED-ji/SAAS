import { describe, expect, it } from "vitest";
import {
  bindStableFeeFormula,
  buildDirectFeeScopeReferences,
  calculateOtherFeeDetails,
  calculateFormulaTableTotal,
  formatStableFeeFormula,
  formatStableFeeFormulaLabels,
  getFeeFormulaText,
  getFeeRuleText,
  makeStableScopeReference,
  remapStableFeeFormulaIds,
  remapStableScopeReferenceKeys,
  type FormulaFeeItem,
} from "./quotationFeeFormulas";

function fixedFee(id: string, name: string, amount: number): FormulaFeeItem {
  return {
    id,
    category: "other",
    name,
    quantity: 1,
    unit_price: amount,
    fee_calc_method: "fixed",
  };
}

describe("stable comprehensive fee references", () => {
  it("keeps the same fee references after rows are reordered", () => {
    const feeA = fixedFee("fee-a", "管理费", 100);
    const feeB = fixedFee("fee-b", "搬运费", 50);
    const feeC: FormulaFeeItem = {
      id: "fee-c",
      category: "other",
      name: "雇主险",
      quantity: 1,
      fee_calc_method: "percent",
      fee_rate: 10,
    };
    const original = [feeA, feeB, feeC];
    feeC.fee_calc_base = bindStableFeeFormula("A+B", original);

    const reordered = [feeB, feeA, feeC];
    expect(formatStableFeeFormula(feeC.fee_calc_base, reordered)).toBe("B+A");
    expect(calculateOtherFeeDetails(reordered, 0, 0)[2]).toEqual({ total: 15, error: "" });
  });

  it("remaps stable references when a template is copied", () => {
    const source = bindStableFeeFormula("A+B", [fixedFee("old-a", "A", 1), fixedFee("old-b", "B", 2)]);
    const copied = remapStableFeeFormulaIds(source, new Map([["old-a", "new-a"], ["old-b", "new-b"]]));
    expect(formatStableFeeFormula(copied, [fixedFee("new-a", "A", 1), fixedFee("new-b", "B", 2)])).toBe("A+B");
  });

  it("reports a deleted referenced fee instead of pointing at another row", () => {
    const feeA = fixedFee("fee-a", "管理费", 100);
    const feeC: FormulaFeeItem = {
      id: "fee-c",
      category: "other",
      name: "雇主险",
      fee_calc_method: "percent",
      fee_rate: 10,
      fee_calc_base: bindStableFeeFormula("A", [feeA]),
    };
    expect(calculateOtherFeeDetails([feeC], 0, 0)[0].error).toBe("公式引用的费用项已删除");
  });

  it("still rejects circular references", () => {
    const feeA: FormulaFeeItem = { id: "fee-a", category: "other", name: "A", fee_calc_method: "reference" };
    const feeB: FormulaFeeItem = { id: "fee-b", category: "other", name: "B", fee_calc_method: "reference" };
    const fees = [feeA, feeB];
    feeA.fee_calc_base = bindStableFeeFormula("B", fees);
    feeB.fee_calc_base = bindStableFeeFormula("A", fees);
    const details = calculateOtherFeeDetails(fees, 0, 0);
    expect(details[0].error).toBe("基础公式循环引用");
    expect(details[1].error).toBe("基础公式循环引用");
  });

  it("calculates a custom formula that adds a fee after applying a percentage", () => {
    const feeA = fixedFee("fee-a", "A", 100);
    const feeG = fixedFee("fee-g", "G", 200);
    const feeB: FormulaFeeItem = {
      id: "fee-b",
      category: "other",
      name: "B",
      fee_calc_method: "formula",
    };
    const fees = [
      feeA,
      feeB,
      fixedFee("fee-c", "C", 0),
      fixedFee("fee-d", "D", 0),
      fixedFee("fee-e", "E", 0),
      fixedFee("fee-f", "F", 0),
      feeG,
    ];
    feeB.fee_calc_base = bindStableFeeFormula("(直接费+G)*3%+A", fees);

    expect(calculateOtherFeeDetails(fees, 1000, 0)[1]).toEqual({ total: 136, error: "" });
    expect(getFeeFormulaText(feeB, fees)).toBe("(直接费+G)*3%+A");
    expect(getFeeRuleText(feeB, 136, { currencySymbol: false, useGrouping: false }, undefined, fees)).toBe("(直接费 + G) × 3% + A = 136.00");
  });

  it("formats stable fee references as fee names for rule descriptions", () => {
    const directFee = fixedFee("fee-direct", "工程直接费", 1000);
    const managementFee = fixedFee("fee-management", "管理费", 100);
    const discountFee = fixedFee("fee-discount", "优惠", 0);
    const finalFee: FormulaFeeItem = {
      id: "fee-final",
      category: "other",
      name: "工程总造价",
      fee_calc_method: "formula",
    };
    const fees = [directFee, managementFee, discountFee, finalFee];
    finalFee.fee_calc_base = bindStableFeeFormula("A+B+C", fees);

    expect(formatStableFeeFormula(finalFee.fee_calc_base, fees)).toBe("A+B+C");
    expect(formatStableFeeFormulaLabels(finalFee.fee_calc_base, fees)).toBe("工程直接费+管理费+优惠");
    expect(getFeeRuleText(finalFee, 1100, { currencySymbol: false, useGrouping: false }, undefined, fees)).toBe("工程直接费 + 管理费 + 优惠 = 1100.00");
  });

  it("rejects circular references inside custom formulas", () => {
    const feeA: FormulaFeeItem = { id: "fee-a", category: "other", name: "A", fee_calc_method: "formula" };
    const feeB: FormulaFeeItem = { id: "fee-b", category: "other", name: "B", fee_calc_method: "formula" };
    const fees = [feeA, feeB];
    feeA.fee_calc_base = bindStableFeeFormula("B", fees);
    feeB.fee_calc_base = bindStableFeeFormula("A", fees);

    const details = calculateOtherFeeDetails(fees, 0, 0);
    expect(details[0].error).toBe("基础公式循环引用");
    expect(details[1].error).toBe("基础公式循环引用");
  });

  it("allows a space or category name to represent its direct fee", () => {
    const feeA = fixedFee("fee-a", "A", 100);
    const feeB: FormulaFeeItem = {
      id: "fee-b",
      category: "other",
      name: "B",
      fee_calc_method: "formula",
    };
    const fees = [feeA, feeB];
    const scopeReferences = buildDirectFeeScopeReferences([
      { category: "打拆", categoryLabel: "打拆", space: "测试空间1", total: 200 },
    ]);
    const context = {
      directItems: [
        { category: "打拆", categoryLabel: "打拆", space: "测试空间1", total: 200, laborAmount: 50, materialCostAmount: 100 },
      ],
      scopeReferences,
    };
    feeB.fee_calc_base = bindStableFeeFormula("(直接费+打拆)*3%+A", fees, 0, scopeReferences);

    expect(formatStableFeeFormula(feeB.fee_calc_base, fees)).toBe("(直接费+打拆)*3%+A");
    expect(calculateOtherFeeDetails(fees, 1000, 0, context)[1]).toEqual({ total: 136, error: "" });
  });

  it("keeps a scoped formula reference after a space is renamed", () => {
    const original = makeStableScopeReference("space:客厅", "客厅");
    const remapped = remapStableScopeReferenceKeys(original, new Map([["space:客厅", "space:客餐厅"]]));

    expect(formatStableFeeFormula(remapped, [])).toBe("客餐厅");
  });

  it("calculates a free formula table from its designated final row", () => {
    const fees: FormulaFeeItem[] = [
      { id: "fee-direct", category: "other", name: "工程直接费", fee_calc_method: "formula", fee_calc_base: "直接费" },
      { id: "fee-discount", category: "other", name: "优惠", fee_calc_method: "formula", fee_calc_base: "-100" },
      { id: "fee-total", category: "other", name: "工程总造价", fee_calc_method: "formula" },
      { id: "fee-tax", category: "other", name: "税金", fee_calc_method: "formula" },
      { id: "fee-final", category: "other", name: "最终报价", fee_calc_method: "formula" },
    ];
    fees[2].fee_calc_base = bindStableFeeFormula("A+B", fees);
    fees[3].fee_calc_base = bindStableFeeFormula("C*1%", fees);
    fees[4].fee_calc_base = bindStableFeeFormula("C+D", fees);

    const result = calculateFormulaTableTotal(fees, 1000, 0, "fee-final");
    expect(result.finalAmount).toBe(909);
    expect(result.details.map((detail) => detail.total)).toEqual([1000, -100, 900, 9, 909]);
    expect(result.finalError).toBe("");
  });

  it("supports manual, direct and quote-discount value sources in a formula table", () => {
    const fees: FormulaFeeItem[] = [
      { id: "fee-direct", category: "other", name: "工程直接费", fee_calc_method: "reference", fee_value_source: "direct" },
      { id: "fee-manual", category: "other", name: "水电竣工图", fee_calc_method: "fixed", fee_value_source: "manual", quantity: 1, unit_price: 3000 },
      { id: "fee-fixed", category: "other", name: "固定费用", fee_calc_method: "formula", fee_value_source: "fixed", fee_calc_base: "500", quantity: 1, unit_price: 0 },
      { id: "fee-discount", category: "other", name: "优惠", fee_calc_method: "reference", fee_value_source: "discount" },
      { id: "fee-total", category: "other", name: "最终报价", fee_calc_method: "formula" },
    ];
    fees[4].fee_calc_base = bindStableFeeFormula("A+B+C-D", fees);

    const result = calculateFormulaTableTotal(fees, 100000, 0, "fee-total", { discountAmount: 8000 });
    expect(result.details.map((detail) => detail.total)).toEqual([100000, 3000, 500, 8000, 95500]);
    expect(result.finalAmount).toBe(95500);
    expect(getFeeFormulaText(fees[1])).toBe("报价时填写");
    expect(getFeeFormulaText(fees[2])).toBe("固定金额");
    expect(getFeeFormulaText(fees[3])).toBe("报价优惠");
  });

  it("calculates area unit fees from house area and keeps the unit price as the editable value", () => {
    const fee: FormulaFeeItem = {
      id: "fee-area",
      category: "other",
      name: "设计费",
      quantity: 1,
      unit_price: 80,
      fee_calc_method: "area_unit",
      fee_calc_base: "房屋面积",
    };
    const context = { houseArea: 120 };

    expect(calculateOtherFeeDetails([fee], 0, 0, context)[0]).toEqual({ total: 9600, error: "" });
    expect(getFeeFormulaText(fee)).toBe("房屋面积 x 80元/㎡");
    expect(getFeeRuleText(fee, 9600, { currencySymbol: false, useGrouping: false }, context)).toBe("房屋面积 120㎡ × 80元/㎡ = 9600.00");
  });
});
