import { describe, expect, it } from "vitest";
import { buildOrgTreeOrder, canReorderOrgUnits, getOrgReorderableIds, reorderOrgUnits } from "./organization-order";

const units = [
  { id: "region-a", parent_id: "group-1", type: "region" },
  { id: "region-b", parent_id: "group-1", type: "region" },
  { id: "region-c", parent_id: "group-1", type: "region" },
  { id: "store-a", parent_id: "company-1", type: "store" },
  { id: "store-b", parent_id: "company-1", type: "store" },
];

describe("organization ordering", () => {
  it("moves an item before another sibling of the same type", () => {
    expect(reorderOrgUnits(units, "region-c", "region-a", "before").map((unit) => unit.id)).toEqual([
      "region-c",
      "region-a",
      "region-b",
      "store-a",
      "store-b",
    ]);
  });

  it("moves an item after another sibling of the same type", () => {
    expect(reorderOrgUnits(units, "region-a", "region-c", "after").map((unit) => unit.id)).toEqual([
      "region-b",
      "region-c",
      "region-a",
      "store-a",
      "store-b",
    ]);
  });

  it("rejects cross-type and cross-parent moves", () => {
    expect(canReorderOrgUnits(units, "region-a", "store-a")).toBe(false);
    expect(canReorderOrgUnits(units, "store-a", "region-a")).toBe(false);
    expect(reorderOrgUnits(units, "region-a", "store-a", "before")).toBe(units);
  });

  it("keeps child siblings draggable when there is only one top-level organization", () => {
    const singleRootUnits = [
      { id: "group-a", parent_id: null, type: "group" },
      { id: "region-a", parent_id: "group-a", type: "region" },
      { id: "region-b", parent_id: "group-a", type: "region" },
    ];
    expect(Array.from(getOrgReorderableIds(singleRootUnits)).sort()).toEqual(["region-a", "region-b"]);
  });

  it("returns company nodes in organization tree display order", () => {
    const tree = [
      { id: "region-b", parent_id: "group-1", type: "region" },
      { id: "company-b", parent_id: "region-b", type: "company" },
      { id: "region-a", parent_id: "group-1", type: "region" },
      { id: "company-a2", parent_id: "region-a", type: "company" },
      { id: "company-a1", parent_id: "region-a", type: "company" },
    ];
    expect(buildOrgTreeOrder(tree).map((unit) => unit.id)).toEqual([
      "region-b",
      "company-b",
      "region-a",
      "company-a2",
      "company-a1",
    ]);
  });
});
