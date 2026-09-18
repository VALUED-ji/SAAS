import { describe, expect, it } from "vitest";
import { collectOrgSubtreeIds } from "./team-shared";

const units = [
  { id: "group-1", parent_id: null },
  { id: "region-1", parent_id: "group-1" },
  { id: "company-1", parent_id: "region-1" },
  { id: "store-1", parent_id: "company-1" },
  { id: "dept-1", parent_id: "store-1" },
  { id: "team-1", parent_id: "dept-1" },
  { id: "company-2", parent_id: "region-1" },
];

describe("collectOrgSubtreeIds", () => {
  it("includes the selected organization and all descendants", () => {
    expect([...collectOrgSubtreeIds(units, "company-1")]).toEqual([
      "company-1",
      "store-1",
      "dept-1",
      "team-1",
    ]);
  });

  it("does not include sibling organizations", () => {
    const ids = collectOrgSubtreeIds(units, "company-1");
    expect(ids.has("company-2")).toBe(false);
    expect(ids.has("region-1")).toBe(false);
  });
});
