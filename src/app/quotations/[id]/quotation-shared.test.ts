import { describe, expect, it } from "vitest";
import { canTrackManualPriceEdit, getManualPriceEditFlags, setManualPriceEditFlag } from "./quotation-shared";

describe("quotation manual price edit tracking", () => {
  it("tracks base items loaded from standard or custom quota libraries", () => {
    expect(canTrackManualPriceEdit({ category: "base", quota_source_id: "quota-1" })).toBe(true);
    expect(canTrackManualPriceEdit({ category: "base", quota_source_type: "custom" })).toBe(true);
    expect(canTrackManualPriceEdit({ category: "base", source: "standard" })).toBe(true);
  });

  it("does not track blank manual rows or other fee rows", () => {
    expect(canTrackManualPriceEdit({ category: "base", name: "手动添加项目" })).toBe(false);
    expect(canTrackManualPriceEdit({ category: "other", quota_source_id: "quota-1" })).toBe(false);
  });

  it("tracks material and labor price edits independently", () => {
    const materialOnly = setManualPriceEditFlag(0, "material");
    const both = setManualPriceEditFlag(materialOnly, "labor");
    expect(getManualPriceEditFlags(materialOnly)).toEqual({ material: true, labor: false });
    expect(getManualPriceEditFlags(both)).toEqual({ material: true, labor: true });
  });
});
