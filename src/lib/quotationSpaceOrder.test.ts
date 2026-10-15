import { describe, expect, it } from "vitest";
import { getQuotationSpaceSequences, reorderQuotationSpaceItems } from "./quotationSpaceOrder";

describe("package space ordering", () => {
  const items = [
    { id: "a1", space: "A", included: true, category: "base" },
    { id: "extra", space: "A", included: false, category: "base" },
    { id: "b1", space: "B", included: true, category: "base" },
    { id: "a2", space: "A", included: true, category: "base" },
    { id: "product", space: "A", included: true, category: "product" },
    { id: "c1", space: "C", included: true, category: "base" },
  ];
  const matches = (item: typeof items[number]) => item.included && item.category === "base";
  const space = (item: typeof items[number]) => item.space;

  it("numbers each space from one and retains numbering after group reordering", () => {
    expect(getQuotationSpaceSequences(items.filter(matches), space)).toEqual([1, 1, 2, 1]);
    const next = reorderQuotationSpaceItems(items, matches, space, "C", "A", "before");
    expect(getQuotationSpaceSequences(next.filter(matches), space)).toEqual([1, 1, 2, 1]);
    expect(getQuotationSpaceSequences([], space)).toEqual([]);
  });

  it("moves a whole space before a target, preserving items and unrelated slots", () => {
    const next = reorderQuotationSpaceItems(items, matches, space, "C", "A", "before");
    expect(next.map((item) => item.id)).toEqual(["c1", "extra", "a1", "a2", "product", "b1"]);
    expect(next[1]).toBe(items[1]);
    expect(next[4]).toBe(items[4]);
    expect(items[0].id).toBe("a1");
    expect(new Set(next)).toEqual(new Set(items));
  });

  it("supports moving a group downward after a target", () => {
    const next = reorderQuotationSpaceItems(items, matches, space, "A", "C", "after");
    expect(next.filter(matches).map((item) => item.id)).toEqual(["b1", "c1", "a1", "a2"]);
  });

  it("ignores self drops and unknown spaces", () => {
    expect(reorderQuotationSpaceItems(items, matches, space, "A", "A", "before")).toBe(items);
    expect(reorderQuotationSpaceItems(items, matches, space, "missing", "A", "before")).toBe(items);
  });
});
