import { describe, expect, it } from "vitest";
import { formatQuotationQuantityFormulaRows } from "@/lib/quotationQuantityLinks";
import {
  applyTemplateSpaceQuantityLinks,
  makeSpaceCopy,
  makeSpaceQuotaItem,
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
