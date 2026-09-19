import { describe, expect, it } from "vitest";
import {
  applyQuotationQuantityLinks,
  calculateQuotationQuantityFormula,
  formatQuotationQuantityFormulaRows,
  formatQuotationQuantityFormulaNames,
  getQuotationQuantityFormulaError,
  parseQuotationQuantityFormulaRows,
  parseQuotationQuantityFormula,
  parseQuotationQuantityConstantTerms,
  remapQuotationQuantityFormulaIds,
  repairQuotationQuantityLinksAfterDeletion,
  type QuotationQuantityLinkItem,
} from "./quotationQuantityLinks";

function item(overrides: Partial<QuotationQuantityLinkItem> = {}): QuotationQuantityLinkItem {
  return {
    id: "item-1",
    category: "base",
    space: "客厅",
    unit: "㎡",
    quantity: 0,
    ...overrides,
  };
}

describe("quotation quantity links", () => {
  it("calculates add and subtract formulas from item ids", () => {
    const items = [
      item({ id: "result", quantity_formula: JSON.stringify({ baseItemId: "a", operator: "add", itemId: "b" }) }),
      item({ id: "a", quantity: 12 }),
      item({ id: "b", quantity: 10.2 }),
    ];

    const added = applyQuotationQuantityLinks(items);
    expect(added[0].quantity).toBe(22.2);

    const subtracted = applyQuotationQuantityLinks(items.map((entry, index) => (
      index === 0
        ? { ...entry, quantity_formula: JSON.stringify({ baseItemId: "a", operator: "subtract", itemId: "b" }) }
        : entry
    )));
    expect(subtracted[0].quantity).toBe(1.8);
  });

  it("rejects different units, different spaces and negative results", () => {
    const target = item({ id: "result" });
    const formula = {
      version: 2 as const,
      expression: {
        type: "binary" as const,
        operator: "subtract" as const,
        left: { type: "reference" as const, itemId: "a" },
        right: { type: "reference" as const, itemId: "b" },
      },
    };

    expect(getQuotationQuantityFormulaError([
      target,
      item({ id: "a", quantity: 10 }),
      item({ id: "b", quantity: 2, unit: "项" }),
    ], 0, formula)).toBe("参与计算的项目单位必须一致");

    expect(getQuotationQuantityFormulaError([
      target,
      item({ id: "a", quantity: 10 }),
      item({ id: "b", quantity: 2, space: "卧室" }),
    ], 0, formula)).toBe("只能引用同一空间中的项目");

    expect(getQuotationQuantityFormulaError([
      target,
      item({ id: "a", quantity: 2 }),
      item({ id: "b", quantity: 10 }),
    ], 0, formula)).toBe("计算结果不能小于 0");
  });

  it("parses only valid structured formulas", () => {
    expect(formatQuotationQuantityFormulaRows([
      item({ id: "a" }),
      item({ id: "b" }),
    ], parseQuotationQuantityFormula('{"baseItemId":"a","operator":"subtract","itemId":"b"}'))).toBe("=[1]-[2]");
    expect(parseQuotationQuantityFormula("1-2")).toBeNull();
    expect(formatQuotationQuantityFormulaRows([
      item({ id: "a" }),
    ], parseQuotationQuantityFormula('{"baseItemId":"a","operator":"subtract","itemId":"a"}'))).toBe("=[1]-[1]");
  });

  it("supports simple row-number formulas like Excel", () => {
    const items = [
      item({ id: "result" }),
      item({ id: "a", quantity: 12 }),
      item({ id: "b", quantity: 10.2 }),
    ];

    const parsed = parseQuotationQuantityFormulaRows(items, 0, "[2]-[3]");
    expect(parsed.error).toBe("");
    expect(formatQuotationQuantityFormulaRows(items, parsed.formula)).toBe("=[2]-[3]");
  });

  it("resolves row numbers from the visible table instead of the full quotation array", () => {
    const hiddenFirst = item({ id: "hidden-first", name: "隐藏项目" });
    const visibleResult = item({ id: "visible-result", name: "当前项目" });
    const hiddenMiddle = item({ id: "hidden-middle", name: "另一个隐藏项目" });
    const visibleBase = item({ id: "visible-base", name: "可见项目2", quantity: 8 });
    const visibleLinked = item({ id: "visible-linked", name: "可见项目3", quantity: 3 });
    const visibleItems = [visibleResult, visibleBase, visibleLinked];

    const parsed = parseQuotationQuantityFormulaRows(visibleItems, 0, "[2]+[3]");
    expect(formatQuotationQuantityFormulaRows(visibleItems, parsed.formula)).toBe("=[2]+[3]");
    expect(parsed.error).toBe("");
  });

  it("supports more than two referenced rows", () => {
    const items = [
      item({ id: "result" }),
      item({ id: "a", quantity: 7 }),
      item({ id: "b", quantity: 11 }),
      item({ id: "c", quantity: 6 }),
    ];
    const parsed = parseQuotationQuantityFormulaRows(items, 0, "[2]+[3]-[4]");
    expect(parsed.error).toBe("");
    expect(formatQuotationQuantityFormulaRows(items, parsed.formula)).toBe("=[2]+[3]-[4]");
    expect(formatQuotationQuantityFormulaNames(items, parsed.formula)).toBe("项目 2 + 项目 3 - 项目 4");
    expect(calculateQuotationQuantityFormula(items, parsed.formula!)).toBe(12);
    expect(getQuotationQuantityFormulaError(items, 0, parsed.formula!)).toBe("");
  });

  it("allows the same project to appear more than once", () => {
    const items = [
      item({ id: "a", quantity: 12 }),
      item({ id: "b", quantity: 3.23 }),
      item({ id: "result" }),
    ];
    const parsed = parseQuotationQuantityFormulaRows(items, 2, "[1]+[2]+[1]");
    expect(parsed.error).toBe("");
    expect(formatQuotationQuantityFormulaRows(items, parsed.formula)).toBe("=[1]+[2]+[1]");
    expect(calculateQuotationQuantityFormula(items, parsed.formula!)).toBe(27.23);
  });

  it("supports ordinary numeric constants in formulas", () => {
    const items = [
      item({ id: "a", quantity: 12 }),
      item({ id: "b", quantity: 3.23 }),
      item({ id: "result" }),
    ];
    const decimal = parseQuotationQuantityFormulaRows(items, 2, "[1]+[2]+0.5");
    expect(decimal.error).toBe("");
    expect(formatQuotationQuantityFormulaRows(items, decimal.formula)).toBe("=[1]+[2]+0.5");
    expect(calculateQuotationQuantityFormula(items, decimal.formula!)).toBe(15.73);
    expect(formatQuotationQuantityFormulaRows(items, decimal.formula)).toBe("=[1]+[2]+0.5");

    const integer = parseQuotationQuantityFormulaRows(items, 2, "[1]+[2]+5");
    expect(integer.error).toBe("");
    expect(calculateQuotationQuantityFormula(items, integer.formula!)).toBe(20.23);
    expect(parseQuotationQuantityConstantTerms("+0.5-0.2")).toEqual([
      { operator: "add", constant: 0.5 },
      { operator: "subtract", constant: 0.2 },
    ]);
  });

  it("supports multiplication, division and parentheses", () => {
    const items = [
      item({ id: "a", quantity: 12 }),
      item({ id: "b", quantity: 3 }),
      item({ id: "result" }),
    ];
    const precedence = parseQuotationQuantityFormulaRows(items, 2, "[1]+[2]*2");
    expect(precedence.error).toBe("");
    expect(calculateQuotationQuantityFormula(items, precedence.formula!)).toBe(18);

    const parentheses = parseQuotationQuantityFormulaRows(items, 2, "([1]+[2])*0.5");
    expect(parentheses.error).toBe("");
    expect(calculateQuotationQuantityFormula(items, parentheses.formula!)).toBe(7.5);

    const spacedParentheses = parseQuotationQuantityFormulaRows(items, 2, "([1]+[2]) *2");
    expect(spacedParentheses.error).toBe("");
    expect(calculateQuotationQuantityFormula(items, spacedParentheses.formula!)).toBe(30);

    const fullWidthSymbols = parseQuotationQuantityFormulaRows(items, 2, "（[1]+[2]）＊2");
    expect(fullWidthSymbols.error).toBe("");
    expect(calculateQuotationQuantityFormula(items, fullWidthSymbols.formula!)).toBe(30);

    const division = parseQuotationQuantityFormulaRows(items, 2, "[1]/[2]");
    expect(division.error).toBe("");
    expect(calculateQuotationQuantityFormula(items, division.formula!)).toBe(4);

    const zeroDivision = parseQuotationQuantityFormulaRows([
      item({ id: "a", quantity: 12 }),
      item({ id: "b", quantity: 0 }),
      item({ id: "result" }),
    ], 2, "[1]/[2]");
    expect(zeroDivision.error).toBe("除数不能为 0");
  });

  it("only preserves copied links when all referenced items are copied too", () => {
    const formula = JSON.stringify({
      baseItemId: "a",
      terms: [
        { operator: "add", itemId: "b" },
        { operator: "add", constant: 0.5 },
      ],
    });
    expect(formatQuotationQuantityFormulaRows([
      item({ id: "copy-a" }),
      item({ id: "copy-b" }),
    ], remapQuotationQuantityFormulaIds(formula, new Map([["a", "copy-a"], ["b", "copy-b"]])))).toBe("=[1]+[2]+0.5");
    expect(remapQuotationQuantityFormulaIds(formula, new Map([["a", "copy-a"]]))).toBeNull();
  });

  it("automatically repairs formulas when referenced items are deleted", () => {
    const items = [
      item({
        id: "result",
        quantity: 13,
        quantity_formula: JSON.stringify({
          baseItemId: "a",
          terms: [
            { operator: "add", itemId: "b" },
            { operator: "subtract", itemId: "c" },
          ],
        }),
      }),
      item({ id: "a", quantity: 9 }),
      item({ id: "b", quantity: 7 }),
      item({ id: "c", quantity: 3 }),
    ];
    const repaired = repairQuotationQuantityLinksAfterDeletion(items, new Set(["b"]));

    expect(repaired.repairs).toHaveLength(1);
    expect(formatQuotationQuantityFormulaRows([repaired.items[1], repaired.items[2]], repaired.items[0].quantity_formula)).toBe("=[1]-[2]");
    expect(repaired.items[0].quantity).toBe(6);
  });

  it("unlinks complex formulas when a referenced item is deleted", () => {
    const items = [
      item({
        id: "result",
        quantity: 7.5,
        quantity_formula: JSON.stringify({
          version: 2,
          expression: {
            type: "binary",
            operator: "multiply",
            left: {
              type: "binary",
              operator: "add",
              left: { type: "reference", itemId: "a" },
              right: { type: "reference", itemId: "b" },
            },
            right: { type: "number", value: 0.5 },
          },
        }),
      }),
      item({ id: "a", quantity: 12 }),
      item({ id: "b", quantity: 3 }),
    ];
    const repaired = repairQuotationQuantityLinksAfterDeletion(items, new Set(["a"]));
    expect(repaired.items[0].quantity_formula).toBeNull();
    expect(repaired.items[0].quantity).toBe(7.5);
    expect(repaired.repairs[0].unlinked).toBe(true);
  });

  it("promotes a new base item or unlinks after deleting the base item", () => {
    const items = [
      item({
        id: "result",
        quantity: 6,
        quantity_formula: JSON.stringify({
          baseItemId: "a",
          terms: [
            { operator: "add", itemId: "b" },
            { operator: "subtract", itemId: "c" },
          ],
        }),
      }),
      item({ id: "a", quantity: 2 }),
      item({ id: "b", quantity: 7 }),
      item({ id: "c", quantity: 3 }),
    ];
    const promoted = repairQuotationQuantityLinksAfterDeletion(items, new Set(["a"]));
    expect(formatQuotationQuantityFormulaRows([promoted.items[1], promoted.items[2]], promoted.items[0].quantity_formula)).toBe("=[1]-[2]");
    expect(promoted.items[0].quantity).toBe(4);

    const cannotPromote = repairQuotationQuantityLinksAfterDeletion([
      item({
        id: "result",
        quantity: 2,
        quantity_formula: JSON.stringify({
          baseItemId: "a",
          terms: [{ operator: "subtract", itemId: "b" }],
        }),
      }),
      item({ id: "a", quantity: 5 }),
      item({ id: "b", quantity: 3 }),
    ], new Set(["a"]));
    expect(cannotPromote.items[0].quantity_formula).toBeNull();
    expect(cannotPromote.items[0].quantity).toBe(2);
    expect(cannotPromote.repairs[0].unlinked).toBe(true);
  });

  it("supports nested formulas when the dependency graph has no cycle", () => {
    const items = [
      item({
        id: "result",
        quantity: 0,
        quantity_formula: JSON.stringify({
          baseItemId: "row1",
          terms: [
            { operator: "add", itemId: "row2" },
            { operator: "add", itemId: "row5" },
          ],
        }),
      }),
      item({ id: "row1", quantity: 2 }),
      item({ id: "row2", quantity: 3 }),
      item({
        id: "row5",
        quantity: 0,
        quantity_formula: JSON.stringify({ baseItemId: "row1", terms: [] }),
      }),
    ];
    const applied = applyQuotationQuantityLinks(items);
    expect(applied[3].quantity).toBe(2);
    expect(applied[0].quantity).toBe(7);
    expect(getQuotationQuantityFormulaError(items, 0, parseQuotationQuantityFormula(items[0].quantity_formula)!)).toBe("");
  });

  it("rejects nested formulas that create a cycle", () => {
    const items = [
      item({
        id: "row1",
        quantity: 1,
        quantity_formula: JSON.stringify({ baseItemId: "row2", terms: [] }),
      }),
      item({
        id: "row2",
        quantity: 1,
        quantity_formula: JSON.stringify({ baseItemId: "row1", terms: [] }),
      }),
    ];
    expect(getQuotationQuantityFormulaError(items, 0, parseQuotationQuantityFormula(items[0].quantity_formula)!)).toBe("数量联动不能形成循环引用");
    expect(applyQuotationQuantityLinks(items)).toEqual(items);
  });
});
