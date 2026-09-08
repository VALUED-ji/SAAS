import { describe, expect, it } from "vitest";
import {
  bindStableFeeFormula,
  calculateOtherFeeDetails,
  formatStableFeeFormula,
  getFeeFormulaText,
  getFeeRuleText,
  remapStableFeeFormulaIds,
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
