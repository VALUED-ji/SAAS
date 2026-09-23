import { describe, expect, it } from "vitest";
import {
  findDuplicateOrgUnitIds,
  findSameScopeOrgUnits,
  normalizeOrgUnitNameKey,
} from "./orgUnitDuplicates";

describe("org unit duplicate helpers", () => {
  it("normalizes spaces, full-width characters and casing", () => {
    expect(normalizeOrgUnitNameKey(" 南昌 大区 ")).toBe(normalizeOrgUnitNameKey("南昌大区"));
    expect(normalizeOrgUnitNameKey("Ａ区")).toBe(normalizeOrgUnitNameKey("a区"));
  });

  it("marks only same-parent and same-type duplicates", () => {
    const ids = findDuplicateOrgUnitIds([
      { id: "a", name: "南昌大区", type: "region", parent_id: "group-1" },
      { id: "b", name: "南昌大区", type: "region", parent_id: "group-1" },
      { id: "c", name: "南昌大区", type: "region", parent_id: "group-2" },
      { id: "d", name: "南昌大区", type: "company", parent_id: "group-1" },
    ]);

    expect(Array.from(ids).sort()).toEqual(["a", "b"]);
  });

  it("finds merge candidates within the same duplicate scope", () => {
    const candidates = findSameScopeOrgUnits([
      { id: "a", name: "南昌大区", type: "region", parent_id: "group-1" },
      { id: "b", name: " 南昌 大区 ", type: "region", parent_id: "group-1" },
      { id: "c", name: "南昌大区", type: "region", parent_id: "group-2" },
    ], { id: "a", name: "南昌大区", type: "region", parent_id: "group-1" });

    expect(candidates.map((item) => item.id)).toEqual(["b"]);
  });
});
